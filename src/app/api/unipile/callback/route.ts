import { eq, gte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { unipileAccount, unipileHostedAuthState } from "@/db/schema";
import { enqueueEmailDiscoveryJob } from "@/lib/queues/email";
import { listUnipileAccounts } from "@/lib/unipile/http";
import { upsertUnipileAccount } from "@/lib/unipile/scraper";
import type { UnipileAccountProfile } from "@/lib/unipile/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const redirectUrl = new URL("/", request.url);
  const error = request.nextUrl.searchParams.get("error");
  const state = request.nextUrl.searchParams.get("state");

  if (error) {
    redirectUrl.searchParams.set("error", error);
    return NextResponse.redirect(redirectUrl);
  }

  if (!state) {
    redirectUrl.searchParams.set("error", "missing-unipile-state");
    return NextResponse.redirect(redirectUrl);
  }

  const [stateRow] = await db.select().from(unipileHostedAuthState).where(eq(unipileHostedAuthState.id, state)).limit(1);

  if (!stateRow) {
    redirectUrl.searchParams.set("error", "invalid-unipile-state");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    if (stateRow.accountId) {
      redirectUrl.searchParams.set("connected", "unipile");
      return NextResponse.redirect(redirectUrl);
    }

    const profile = await findLikelyNewAccount(stateRow.organizationId, stateRow.createdAt);

    if (!profile) {
      redirectUrl.searchParams.set("error", "unipile-connected-but-account-not-discovered");
      return NextResponse.redirect(redirectUrl);
    }

    const account = await upsertUnipileAccount({
      accountId: profile.accountId,
      organizationId: stateRow.organizationId,
      connectedByUserId: stateRow.userId,
    });

    await db
      .update(unipileHostedAuthState)
      .set({
        accountId: profile.accountId,
        usedAt: new Date(),
      })
      .where(eq(unipileHostedAuthState.id, stateRow.id));

    if (account) {
      await enqueueEmailDiscoveryJob({ provider: "unipile", id: account.id });
    }

    redirectUrl.searchParams.set("connected", "unipile");
    return NextResponse.redirect(redirectUrl);
  } catch (caught) {
    redirectUrl.searchParams.set("error", caught instanceof Error ? caught.message : "unipile-callback-failed");
    return NextResponse.redirect(redirectUrl);
  }
}

async function findLikelyNewAccount(organizationId: string, stateCreatedAt: Date) {
  const accounts = await listUnipileAccounts();
  const existingRows = await db
    .select({ accountId: unipileAccount.accountId })
    .from(unipileAccount)
    .where(eq(unipileAccount.organizationId, organizationId));
  const existing = new Set(existingRows.map((row) => row.accountId));
  const threshold = new Date(stateCreatedAt.getTime() - 5 * 60 * 1000);
  const recent = accounts
    .filter((account): account is UnipileAccountProfile & { createdAt: Date } => Boolean(account.createdAt))
    .filter((account) => account.createdAt >= threshold)
    .filter((account) => !existing.has(account.accountId))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (recent[0]) {
    return recent[0];
  }

  const [fallback] = await db
    .select({ accountId: unipileAccount.accountId })
    .from(unipileAccount)
    .where(gte(unipileAccount.createdAt, threshold))
    .limit(1);

  return fallback ? accounts.find((account) => account.accountId === fallback.accountId) : null;
}
