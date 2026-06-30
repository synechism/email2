import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { emailMessage, emailThread, nylasGrant } from "@/db/schema";
import { getRequestOrgContext } from "@/lib/auth-server";
import { removeMailboxQueueJobs } from "@/lib/queues/email";

export const runtime = "nodejs";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getRequestOrgContext();

  if (!requestContext) {
    return NextResponse.json({ error: "Sign in and create an organization first." }, { status: 401 });
  }

  const { id } = await context.params;
  const [grant] = await db
    .select({
      id: nylasGrant.id,
      email: nylasGrant.email,
    })
    .from(nylasGrant)
    .where(and(eq(nylasGrant.id, id), eq(nylasGrant.organizationId, requestContext.org.id)))
    .limit(1);

  if (!grant) {
    return NextResponse.json({ error: "Grant not found." }, { status: 404 });
  }

  const threadRows = await db
    .select({ id: emailThread.id })
    .from(emailThread)
    .where(and(eq(emailThread.nylasGrantId, grant.id), eq(emailThread.organizationId, requestContext.org.id)));
  const [messageCount] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(emailMessage)
    .where(and(eq(emailMessage.nylasGrantId, grant.id), eq(emailMessage.organizationId, requestContext.org.id)));

  const queueCleanup = await removeMailboxQueueJobs({
    provider: "nylas",
    id: grant.id,
    threadIds: threadRows.map((thread) => thread.id),
  });

  const [deleted] = await db
    .delete(nylasGrant)
    .where(and(eq(nylasGrant.id, grant.id), eq(nylasGrant.organizationId, requestContext.org.id)))
    .returning({ id: nylasGrant.id });

  if (!deleted) {
    return NextResponse.json({ error: "Grant was already deleted." }, { status: 404 });
  }

  return NextResponse.json({
    deleted: true,
    source: "nylas",
    email: grant.email,
    threadsDeleted: threadRows.length,
    messagesDeleted: messageCount?.value ?? 0,
    ...queueCleanup,
  });
}
