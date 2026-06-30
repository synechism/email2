import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { createId } from "@/db/ids";
import { emailMessage, emailThread, threadJudgment } from "@/db/schema";
import { classifyThreads, type ClassificationInput } from "@/lib/nylas/classifier";
import type { EmailName } from "@/lib/nylas/types";

export async function refreshThreadRollups(threadIds: string[]) {
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

export async function classifyTouchedThreads(threadIds: string[], organizationId: string) {
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
      const updatedThreads = await tx
        .update(emailThread)
        .set({
          kind: classification.kind,
          kindConfidence: classification.confidence,
          kindReason: classification.reason,
          judgedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(emailThread.id, classification.threadId!), eq(emailThread.organizationId, organizationId)))
        .returning({ id: emailThread.id });

      if (updatedThreads.length === 0) {
        return;
      }

      await tx.insert(threadJudgment).values({
        id: createId("jdg"),
        organizationId,
        threadId: classification.threadId!,
        kind: classification.kind,
        confidence: classification.confidence,
        reason: classification.reason,
        strategy: classification.strategy,
      });
    });
  }
}

export function uniquePeople(people: EmailName[]) {
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
