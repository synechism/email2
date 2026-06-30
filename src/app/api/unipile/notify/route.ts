import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { unipileHostedAuthState } from "@/db/schema";
import { enqueueEmailDiscoveryJob } from "@/lib/queues/email";
import { upsertUnipileAccount } from "@/lib/unipile/scraper";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const accountId = String(payload?.account_id ?? payload?.accountId ?? "");
  const state = String(payload?.name ?? request.nextUrl.searchParams.get("state") ?? "");
  const status = String(payload?.status ?? "");

  if (!state || !accountId) {
    return NextResponse.json({ error: "Missing Unipile hosted auth state or account id." }, { status: 400 });
  }

  if (status && !["CREATION_SUCCESS", "RECONNECTED"].includes(status)) {
    return NextResponse.json({ ok: true, ignored: status });
  }

  const [stateRow] = await db.select().from(unipileHostedAuthState).where(eq(unipileHostedAuthState.id, state)).limit(1);

  if (!stateRow) {
    return NextResponse.json({ error: "Unknown Unipile hosted auth state." }, { status: 404 });
  }

  if (stateRow.accountId === accountId && stateRow.usedAt) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const account = await upsertUnipileAccount({
    accountId,
    organizationId: stateRow.organizationId,
    connectedByUserId: stateRow.userId,
  });

  await db
    .update(unipileHostedAuthState)
    .set({
      accountId,
      usedAt: new Date(),
    })
    .where(eq(unipileHostedAuthState.id, stateRow.id));

  const job = account ? await enqueueEmailDiscoveryJob({ provider: "unipile", id: account.id }) : null;

  return NextResponse.json({ ok: true, account, jobId: job?.id ?? null });
}
