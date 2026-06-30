import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { createId } from "@/db/ids";
import { nylasOAuthState } from "@/db/schema";
import { env } from "@/lib/env";
import { getRequestOrgContext } from "@/lib/auth-server";
import { buildHostedOAuthUrl } from "@/lib/nylas/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const context = await getRequestOrgContext();
  const fallback = new URL("/", request.url);

  if (!context) {
    fallback.searchParams.set("error", "sign-in-required");
    return NextResponse.redirect(fallback);
  }

  try {
    const provider = request.nextUrl.searchParams.get("provider") || env.NYLAS_DEFAULT_PROVIDER || null;
    const state = createId("nylas_state");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(nylasOAuthState).values({
      id: state,
      organizationId: context.org.id,
      userId: context.session.user.id,
      provider,
      redirectUri: env.NYLAS_REDIRECT_URI,
      expiresAt,
    });

    return NextResponse.redirect(buildHostedOAuthUrl(state, provider));
  } catch (error) {
    fallback.searchParams.set("error", error instanceof Error ? error.message : "nylas-connect-failed");
    return NextResponse.redirect(fallback);
  }
}
