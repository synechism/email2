import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { emailMessage, emailThread, nylasGrant, scrapeRun, unipileAccount } from "@/db/schema";
import { getEmailQueueCountsSafe } from "@/lib/queues/email";

export async function getDashboardData(organizationId: string) {
  const [threadCount] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(emailThread)
    .where(eq(emailThread.organizationId, organizationId));

  const [messageCount] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(emailMessage)
    .where(eq(emailMessage.organizationId, organizationId));

  const kindCounts = await db
    .select({
      kind: emailThread.kind,
      count: sql<number>`count(*)::int`,
    })
    .from(emailThread)
    .where(eq(emailThread.organizationId, organizationId))
    .groupBy(emailThread.kind)
    .orderBy(desc(sql<number>`count(*)::int`));

  const nylasGrants = await db
    .select({
      id: nylasGrant.id,
      source: sql<"nylas">`'nylas'`,
      grantId: nylasGrant.grantId,
      email: nylasGrant.email,
      provider: nylasGrant.provider,
      status: nylasGrant.status,
      scrapeStatus: nylasGrant.scrapeStatus,
      nextCursor: nylasGrant.nextCursor,
      backfillCompletedAt: nylasGrant.backfillCompletedAt,
      lastScrapedAt: nylasGrant.lastScrapedAt,
      lastError: nylasGrant.lastError,
      createdAt: nylasGrant.createdAt,
    })
    .from(nylasGrant)
    .where(eq(nylasGrant.organizationId, organizationId))
    .orderBy(desc(nylasGrant.createdAt));

  const unipileAccounts = await db
    .select({
      id: unipileAccount.id,
      source: sql<"unipile">`'unipile'`,
      grantId: unipileAccount.accountId,
      email: unipileAccount.email,
      provider: unipileAccount.provider,
      status: unipileAccount.status,
      scrapeStatus: unipileAccount.scrapeStatus,
      nextCursor: unipileAccount.nextCursor,
      backfillCompletedAt: unipileAccount.backfillCompletedAt,
      lastScrapedAt: unipileAccount.lastScrapedAt,
      lastError: unipileAccount.lastError,
      createdAt: unipileAccount.createdAt,
    })
    .from(unipileAccount)
    .where(eq(unipileAccount.organizationId, organizationId))
    .orderBy(desc(unipileAccount.createdAt));

  const mailboxes = [...nylasGrants, ...unipileAccounts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const grantsWithRuns = await Promise.all(
    mailboxes.map(async (grant) => {
      const [latestRun] = await db
        .select({
          id: scrapeRun.id,
          status: scrapeRun.status,
          pagesProcessed: scrapeRun.pagesProcessed,
          messagesUpserted: scrapeRun.messagesUpserted,
          threadsTouched: scrapeRun.threadsTouched,
          providerRequestCount: scrapeRun.providerRequestCount,
          error: scrapeRun.error,
          startedAt: scrapeRun.startedAt,
          finishedAt: scrapeRun.finishedAt,
        })
        .from(scrapeRun)
        .where(grant.source === "nylas" ? eq(scrapeRun.nylasGrantId, grant.id) : eq(scrapeRun.unipileAccountId, grant.id))
        .orderBy(desc(scrapeRun.startedAt))
        .limit(1);

      return {
        ...grant,
        latestRun: latestRun ?? null,
      };
    }),
  );

  const recentThreads = await db
    .select({
      id: emailThread.id,
      subject: emailThread.subject,
      messageCount: emailThread.messageCount,
      latestMessageAt: emailThread.latestMessageAt,
      latestSnippet: emailThread.latestSnippet,
      kind: emailThread.kind,
      kindConfidence: emailThread.kindConfidence,
    })
    .from(emailThread)
    .where(eq(emailThread.organizationId, organizationId))
    .orderBy(desc(emailThread.latestMessageAt))
    .limit(12);
  const queueCounts = await getEmailQueueCountsSafe();

  return {
    counts: {
      threads: threadCount?.value ?? 0,
      emails: messageCount?.value ?? 0,
    },
    kindCounts,
    grants: grantsWithRuns,
    recentThreads,
    queueCounts,
  };
}
