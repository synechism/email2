import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { createId } from "@/db/ids";
import { emailMessage, emailThread, nylasGrant, scrapeRun, threadJudgment } from "@/db/schema";
import { env } from "@/lib/env";
import { classifyThreads, type ClassificationInput } from "@/lib/nylas/classifier";
import { listGrantMessages } from "@/lib/nylas/http";
import type { EmailName, NylasSelectedMessage } from "@/lib/nylas/types";

type ScrapeResult = {
  runId: string;
  status: "completed" | "partial" | "failed";
  pagesProcessed: number;
  messagesUpserted: number;
  threadsTouched: number;
  nextCursor: string | null;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asEmailList(value: unknown): EmailName[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is EmailName => Boolean(item) && typeof item === "object")
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : undefined,
      email: typeof item.email === "string" ? item.email : undefined,
    }))
    .filter((item) => item.name || item.email);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function messageDate(message: NylasSelectedMessage) {
  if (!message.date || !Number.isFinite(message.date)) {
    return null;
  }

  return new Date(message.date * 1000);
}

function messageThreadId(message: NylasSelectedMessage) {
  return message.thread_id ?? message.threadId ?? message.id;
}

function messageReplyTo(message: NylasSelectedMessage) {
  return message.reply_to ?? message.replyTo ?? [];
}

function mergeParticipants(message: NylasSelectedMessage) {
  const seen = new Set<string>();
  const participants = [
    ...asEmailList(message.from),
    ...asEmailList(message.to),
    ...asEmailList(message.cc),
    ...asEmailList(message.bcc),
  ];

  return participants.filter((participant) => {
    const key = (participant.email || participant.name || "").toLowerCase();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function runNylasScrape(nylasGrantDbId: string): Promise<ScrapeResult> {
  const [grant] = await db.select().from(nylasGrant).where(eq(nylasGrant.id, nylasGrantDbId)).limit(1);

  if (!grant) {
    throw new Error("Nylas grant was not found.");
  }

  const cursorStart = grant.backfillCompletedAt ? null : grant.nextCursor;
  const runId = createId("run");
  const now = new Date();

  await db.insert(scrapeRun).values({
    id: runId,
    organizationId: grant.organizationId,
    nylasGrantId: grant.id,
    status: "running",
    cursorStart,
    startedAt: now,
  });

  await db
    .update(nylasGrant)
    .set({
      scrapeStatus: "running",
      lastError: null,
      updatedAt: now,
    })
    .where(eq(nylasGrant.id, grant.id));

  let cursor = cursorStart;
  let pagesProcessed = 0;
  let messagesUpserted = 0;
  let providerRequestTotal = 0;
  const touchedThreadIds = new Set<string>();

  try {
    const maxPages = grant.backfillCompletedAt ? 1 : env.NYLAS_SCRAPE_MAX_PAGES_PER_RUN;

    while (pagesProcessed < maxPages) {
      const page = await listGrantMessages(grant.grantId, cursor);
      providerRequestTotal += page.providerRequestCount;

      const pageThreadIds = await persistMessagePage({
        organizationId: grant.organizationId,
        grantDbId: grant.id,
        messages: page.messages,
      });

      for (const threadId of pageThreadIds) {
        touchedThreadIds.add(threadId);
      }

      pagesProcessed += 1;
      messagesUpserted += page.messages.length;
      cursor = page.nextCursor;

      await db
        .update(nylasGrant)
        .set({
          nextCursor: cursor,
          lastScrapedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(nylasGrant.id, grant.id));

      if (!cursor) {
        break;
      }

      if (env.NYLAS_SCRAPE_REQUEST_DELAY_MS > 0) {
        await wait(env.NYLAS_SCRAPE_REQUEST_DELAY_MS);
      }
    }

    await refreshThreadRollups([...touchedThreadIds]);
    await classifyTouchedThreads([...touchedThreadIds], grant.organizationId);

    const completed = !cursor;
    const status = completed ? "completed" : "partial";

    await db
      .update(scrapeRun)
      .set({
        status,
        cursorEnd: cursor,
        pagesProcessed,
        messagesUpserted,
        threadsTouched: touchedThreadIds.size,
        providerRequestCount: providerRequestTotal,
        finishedAt: new Date(),
      })
      .where(eq(scrapeRun.id, runId));

    await db
      .update(nylasGrant)
      .set({
        scrapeStatus: completed ? "completed" : "idle",
        nextCursor: cursor,
        backfillCompletedAt: completed ? new Date() : grant.backfillCompletedAt,
        lastScrapedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(nylasGrant.id, grant.id));

    return {
      runId,
      status,
      pagesProcessed,
      messagesUpserted,
      threadsTouched: touchedThreadIds.size,
      nextCursor: cursor,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scrape failure.";

    await db
      .update(scrapeRun)
      .set({
        status: "failed",
        cursorEnd: cursor,
        pagesProcessed,
        messagesUpserted,
        threadsTouched: touchedThreadIds.size,
        providerRequestCount: providerRequestTotal,
        error: message,
        finishedAt: new Date(),
      })
      .where(eq(scrapeRun.id, runId));

    await db
      .update(nylasGrant)
      .set({
        scrapeStatus: "failed",
        nextCursor: cursor,
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(nylasGrant.id, grant.id));

    return {
      runId,
      status: "failed",
      pagesProcessed,
      messagesUpserted,
      threadsTouched: touchedThreadIds.size,
      nextCursor: cursor,
    };
  }
}

async function persistMessagePage({
  organizationId,
  grantDbId,
  messages,
}: {
  organizationId: string;
  grantDbId: string;
  messages: NylasSelectedMessage[];
}) {
  const touchedThreadIds = new Set<string>();

  await db.transaction(async (tx) => {
    for (const message of messages) {
      if (!message.id) {
        continue;
      }

      const nylasThreadId = messageThreadId(message);

      if (!nylasThreadId) {
        continue;
      }

      const participants = mergeParticipants(message);
      const receivedAt = messageDate(message);
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];

      const [thread] = await tx
        .insert(emailThread)
        .values({
          id: createId("thr"),
          organizationId,
          nylasGrantId: grantDbId,
          nylasThreadId,
          subject: message.subject ?? null,
          participants,
          latestSnippet: message.snippet ?? null,
          latestMessageAt: receivedAt,
          earliestMessageAt: receivedAt,
        })
        .onConflictDoUpdate({
          target: [emailThread.nylasGrantId, emailThread.nylasThreadId],
          set: {
            subject: message.subject ?? null,
            participants,
            latestSnippet: message.snippet ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: emailThread.id });

      if (!thread) {
        continue;
      }

      touchedThreadIds.add(thread.id);

      await tx
        .insert(emailMessage)
        .values({
          id: createId("eml"),
          organizationId,
          nylasGrantId: grantDbId,
          threadId: thread.id,
          nylasMessageId: message.id,
          nylasThreadId,
          subject: message.subject ?? null,
          snippet: message.snippet ?? null,
          from: asEmailList(message.from),
          to: asEmailList(message.to),
          cc: asEmailList(message.cc),
          bcc: asEmailList(message.bcc),
          replyTo: asEmailList(messageReplyTo(message)),
          folderIds: asStringArray(message.folders),
          attachments,
          hasAttachments: attachments.length > 0,
          unread: typeof message.unread === "boolean" ? message.unread : null,
          starred: typeof message.starred === "boolean" ? message.starred : null,
          receivedAt,
          selectedPayload: message as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: [emailMessage.nylasGrantId, emailMessage.nylasMessageId],
          set: {
            threadId: thread.id,
            subject: message.subject ?? null,
            snippet: message.snippet ?? null,
            from: asEmailList(message.from),
            to: asEmailList(message.to),
            cc: asEmailList(message.cc),
            bcc: asEmailList(message.bcc),
            replyTo: asEmailList(messageReplyTo(message)),
            folderIds: asStringArray(message.folders),
            attachments,
            hasAttachments: attachments.length > 0,
            unread: typeof message.unread === "boolean" ? message.unread : null,
            starred: typeof message.starred === "boolean" ? message.starred : null,
            receivedAt,
            selectedPayload: message as Record<string, unknown>,
            updatedAt: new Date(),
          },
        });
    }
  });

  return touchedThreadIds;
}

async function refreshThreadRollups(threadIds: string[]) {
  if (threadIds.length === 0) {
    return;
  }

  for (const threadId of threadIds) {
    const messages = await db
      .select({
        receivedAt: emailMessage.receivedAt,
        subject: emailMessage.subject,
        snippet: emailMessage.snippet,
        from: emailMessage.from,
        to: emailMessage.to,
        cc: emailMessage.cc,
        bcc: emailMessage.bcc,
      })
      .from(emailMessage)
      .where(eq(emailMessage.threadId, threadId))
      .orderBy(desc(emailMessage.receivedAt));

    const latest = messages[0];
    const datedMessages = messages.filter((message) => message.receivedAt instanceof Date);
    const earliestMessageAt = datedMessages.at(-1)?.receivedAt ?? null;
    const latestMessageAt = datedMessages[0]?.receivedAt ?? null;

    await db
      .update(emailThread)
      .set({
        messageCount: messages.length,
        earliestMessageAt,
        latestMessageAt,
        subject: latest?.subject ?? null,
        latestSnippet: latest?.snippet ?? null,
        participants: latest ? uniquePeople([...latest.from, ...latest.to, ...latest.cc, ...latest.bcc]) : [],
        updatedAt: new Date(),
      })
      .where(eq(emailThread.id, threadId));
  }
}

async function classifyTouchedThreads(threadIds: string[], organizationId: string) {
  if (threadIds.length === 0) {
    return;
  }

  const threads = await db.select().from(emailThread).where(inArray(emailThread.id, threadIds));
  const inputs: ClassificationInput[] = [];

  for (const thread of threads) {
    const samples = await db
      .select({
        subject: emailMessage.subject,
        snippet: emailMessage.snippet,
      })
      .from(emailMessage)
      .where(eq(emailMessage.threadId, thread.id))
      .orderBy(desc(emailMessage.receivedAt))
      .limit(8);

    inputs.push({
      threadId: thread.id,
      subject: thread.subject,
      latestSnippet: thread.latestSnippet,
      participants: thread.participants,
      messageCount: thread.messageCount,
      samples,
    });
  }

  const classifications = await classifyThreads(inputs);

  for (const classification of classifications) {
    if (!classification.threadId) {
      continue;
    }

    await db.transaction(async (tx) => {
      await tx.insert(threadJudgment).values({
        id: createId("jdg"),
        organizationId,
        threadId: classification.threadId!,
        kind: classification.kind,
        confidence: classification.confidence,
        reason: classification.reason,
        strategy: classification.strategy,
      });

      await tx
        .update(emailThread)
        .set({
          kind: classification.kind,
          kindConfidence: classification.confidence,
          kindReason: classification.reason,
          judgedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(emailThread.id, classification.threadId!), eq(emailThread.organizationId, organizationId)));
    });
  }
}

export async function repairGrantRollupsAndClassifications(nylasGrantDbId: string) {
  const [grant] = await db.select().from(nylasGrant).where(eq(nylasGrant.id, nylasGrantDbId)).limit(1);

  if (!grant) {
    throw new Error("Nylas grant was not found.");
  }

  const threadRows = await db
    .select({ id: emailThread.id })
    .from(emailThread)
    .where(eq(emailThread.nylasGrantId, grant.id));
  const threadIds = threadRows.map((thread) => thread.id);

  await refreshThreadRollups(threadIds);
  await classifyTouchedThreads(threadIds, grant.organizationId);

  await db
    .update(nylasGrant)
    .set({
      scrapeStatus: grant.backfillCompletedAt ? "completed" : "idle",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(nylasGrant.id, grant.id));

  return {
    threadsRepaired: threadIds.length,
  };
}

export async function reclassifyOrganizationThreads(organizationId: string) {
  const threadRows = await db.select({ id: emailThread.id }).from(emailThread).where(eq(emailThread.organizationId, organizationId));
  const threadIds = threadRows.map((thread) => thread.id);

  await refreshThreadRollups(threadIds);
  await classifyTouchedThreads(threadIds, organizationId);

  return {
    threadsClassified: threadIds.length,
  };
}

function uniquePeople(people: EmailName[]) {
  const seen = new Set<string>();
  return people.filter((person) => {
    const key = (person.email || person.name || "").toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
