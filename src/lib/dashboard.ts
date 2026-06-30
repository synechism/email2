import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { emailMessage, emailThread, nylasGrant, scrapeRun } from "@/db/schema";
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

  const grants = await db
    .select({
      id: nylasGrant.id,
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

  const grantsWithRuns = await Promise.all(
    grants.map(async (grant) => {
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
        .where(eq(scrapeRun.nylasGrantId, grant.id))
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
