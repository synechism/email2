import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { unipileAccount } from "@/db/schema";
import { getRequestOrgContext } from "@/lib/auth-server";
import { enqueueEmailDiscoveryJob } from "@/lib/queues/email";

export const runtime = "nodejs";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getRequestOrgContext();

  if (!requestContext) {
    return NextResponse.json({ error: "Sign in and create an organization first." }, { status: 401 });
  }

  const { id } = await context.params;
  const [account] = await db
    .select({ id: unipileAccount.id })
    .from(unipileAccount)
    .where(and(eq(unipileAccount.id, id), eq(unipileAccount.organizationId, requestContext.org.id)))
    .limit(1);

  if (!account) {
    return NextResponse.json({ error: "Unipile account not found." }, { status: 404 });
  }

  const job = await enqueueEmailDiscoveryJob({ provider: "unipile", id: account.id });

  return NextResponse.json({ queued: true, jobId: job.id });
}
