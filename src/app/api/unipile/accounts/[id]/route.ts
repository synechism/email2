import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { emailMessage, emailThread, unipileAccount } from "@/db/schema";
import { getRequestOrgContext } from "@/lib/auth-server";
import { removeMailboxQueueJobs } from "@/lib/queues/email";

export const runtime = "nodejs";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getRequestOrgContext();

  if (!requestContext) {
    return NextResponse.json({ error: "Sign in and create an organization first." }, { status: 401 });
  }

  const { id } = await context.params;
  const [account] = await db
    .select({
      id: unipileAccount.id,
      email: unipileAccount.email,
    })
    .from(unipileAccount)
    .where(and(eq(unipileAccount.id, id), eq(unipileAccount.organizationId, requestContext.org.id)))
    .limit(1);

  if (!account) {
    return NextResponse.json({ error: "Unipile account not found." }, { status: 404 });
  }

  const threadRows = await db
    .select({ id: emailThread.id })
    .from(emailThread)
    .where(and(eq(emailThread.unipileAccountId, account.id), eq(emailThread.organizationId, requestContext.org.id)));
  const [messageCount] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(emailMessage)
    .where(and(eq(emailMessage.unipileAccountId, account.id), eq(emailMessage.organizationId, requestContext.org.id)));

  const queueCleanup = await removeMailboxQueueJobs({
    provider: "unipile",
    id: account.id,
    threadIds: threadRows.map((thread) => thread.id),
  });

  const [deleted] = await db
    .delete(unipileAccount)
    .where(and(eq(unipileAccount.id, account.id), eq(unipileAccount.organizationId, requestContext.org.id)))
    .returning({ id: unipileAccount.id });

  if (!deleted) {
    return NextResponse.json({ error: "Unipile account was already deleted." }, { status: 404 });
  }

  return NextResponse.json({
    deleted: true,
    source: "unipile",
    email: account.email,
    threadsDeleted: threadRows.length,
    messagesDeleted: messageCount?.value ?? 0,
    ...queueCleanup,
  });
}
