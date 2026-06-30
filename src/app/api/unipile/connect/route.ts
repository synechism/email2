import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { createId } from "@/db/ids";
import { unipileHostedAuthState } from "@/db/schema";
import { getRequestOrgContext } from "@/lib/auth-server";
import { env } from "@/lib/env";
import { createHostedAuthLink } from "@/lib/unipile/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const context = await getRequestOrgContext();
  const fallback = new URL("/", request.url);

  if (!context) {
    fallback.searchParams.set("error", "sign-in-required");
    return NextResponse.redirect(fallback);
  }

  try {
    const state = createId("unipile_state");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(unipileHostedAuthState).values({
      id: state,
      organizationId: context.org.id,
      userId: context.session.user.id,
      redirectUri: env.UNIPILE_AUTH_SUCCESS_REDIRECT_URI,
      expiresAt,
    });

    return NextResponse.redirect(await createHostedAuthLink(state));
  } catch (error) {
    fallback.searchParams.set("error", error instanceof Error ? error.message : "unipile-connect-failed");
    return NextResponse.redirect(fallback);
  }
}
