import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { nylasGrant } from "@/db/schema";
import { getRequestOrgContext } from "@/lib/auth-server";
import { enqueueEmailDiscoveryJob } from "@/lib/queues/email";

export const runtime = "nodejs";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getRequestOrgContext();

  if (!requestContext) {
    return NextResponse.json({ error: "Sign in and create an organization first." }, { status: 401 });
  }

  const { id } = await context.params;
  const [grant] = await db
    .select({ id: nylasGrant.id })
    .from(nylasGrant)
    .where(and(eq(nylasGrant.id, id), eq(nylasGrant.organizationId, requestContext.org.id)))
    .limit(1);

  if (!grant) {
    return NextResponse.json({ error: "Grant not found." }, { status: 404 });
  }

  const job = await enqueueEmailDiscoveryJob({ provider: "nylas", id: grant.id });

  return NextResponse.json({ queued: true, jobId: job.id });
}
