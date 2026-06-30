import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { createId } from "@/db/ids";
import { nylasGrant, nylasOAuthState } from "@/db/schema";
import { enqueueMailboxDiscovery } from "@/lib/email/service";
import { exchangeCodeForGrant } from "@/lib/nylas/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const redirectUrl = new URL("/", request.url);
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (error) {
    redirectUrl.searchParams.set("error", error);
    return NextResponse.redirect(redirectUrl);
  }

  if (!code || !state) {
    redirectUrl.searchParams.set("error", "missing-nylas-code-or-state");
    return NextResponse.redirect(redirectUrl);
  }

  const [stateRow] = await db
    .select()
    .from(nylasOAuthState)
    .where(and(eq(nylasOAuthState.id, state), isNull(nylasOAuthState.usedAt), gt(nylasOAuthState.expiresAt, new Date())))
    .limit(1);

  if (!stateRow) {
    redirectUrl.searchParams.set("error", "invalid-or-expired-nylas-state");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const profile = await exchangeCodeForGrant(code);
    const now = new Date();

    await db.update(nylasOAuthState).set({ usedAt: now }).where(eq(nylasOAuthState.id, stateRow.id));

    const [grant] = await db
      .insert(nylasGrant)
      .values({
        id: createId("grant"),
        organizationId: stateRow.organizationId,
        connectedByUserId: stateRow.userId,
        grantId: profile.grantId,
        email: profile.email ?? null,
        provider: profile.provider ?? stateRow.provider,
        status: "connected",
        scrapeStatus: "idle",
      })
      .onConflictDoUpdate({
        target: nylasGrant.grantId,
        set: {
          organizationId: stateRow.organizationId,
          connectedByUserId: stateRow.userId,
          email: profile.email ?? null,
          provider: profile.provider ?? stateRow.provider,
          status: "connected",
          scrapeStatus: "idle",
          lastError: null,
          updatedAt: now,
        },
      })
      .returning({ id: nylasGrant.id });

    if (grant) {
      await enqueueMailboxDiscovery({ mailboxId: grant.id, organizationId: stateRow.organizationId });
    }

    redirectUrl.searchParams.set("connected", "nylas");
    return NextResponse.redirect(redirectUrl);
  } catch (caught) {
    redirectUrl.searchParams.set("error", caught instanceof Error ? caught.message : "nylas-callback-failed");
    return NextResponse.redirect(redirectUrl);
  }
}
