import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { createId } from "@/db/ids";
import { emailMessage, emailThread, scrapeRun, unipileAccount } from "@/db/schema";
import { refreshThreadRollups } from "@/lib/email/threads";
import type { EmailName, MailboxScrapeOptions, MailboxScrapeResult } from "@/lib/email/types";
import { env } from "@/lib/env";
import { getUnipileAccount, listUnipileEmails } from "@/lib/unipile/http";
import type { UnipileAccountProfile, UnipileAttendee, UnipileEmail } from "@/lib/unipile/types";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asEmailList(value: unknown): EmailName[] {
  const attendees = Array.isArray(value) ? value : value ? [value] : [];

  return attendees
    .filter((item): item is UnipileAttendee => Boolean(item) && typeof item === "object")
    .map((item) => ({
      name: typeof item.display_name === "string" ? item.display_name : undefined,
      email: typeof item.identifier === "string" ? item.identifier : undefined,
    }))
    .filter((item) => item.name || item.email);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function emailDate(email: UnipileEmail) {
  if (!email.date) {
    return null;
  }

  const date = new Date(email.date);
  return Number.isNaN(date.getTime()) ? null : date;
}

function emailThreadId(email: UnipileEmail) {
  return email.thread_id ?? email.message_id ?? email.id;
}

function emailSnippet(email: UnipileEmail) {
  const source = email.body_plain || email.body || "";
  return truncate(source.replace(/\s+/g, " ").trim(), 1_000);
}

function mergeParticipants(email: UnipileEmail) {
  const seen = new Set<string>();
  const participants = [
    ...asEmailList(email.from_attendee),
    ...asEmailList(email.to_attendees),
    ...asEmailList(email.cc_attendees),
    ...asEmailList(email.bcc_attendees),
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

export async function upsertUnipileAccount({
  accountId,
  organizationId,
  connectedByUserId,
}: {
  accountId: string;
  organizationId: string;
  connectedByUserId: string;
}) {
  const profile: UnipileAccountProfile = await getUnipileAccount(accountId).catch(
    () =>
      ({
        accountId,
        rawAccount: { id: accountId },
      }) satisfies UnipileAccountProfile,
  );
  const now = new Date();
  const [account] = await db
    .insert(unipileAccount)
    .values({
      id: createId("unipile_account"),
      organizationId,
      connectedByUserId,
      accountId: profile.accountId,
      email: profile.email ?? null,
      provider: profile.provider ?? null,
      status: "connected",
      scrapeStatus: "idle",
      rawAccount: profile.rawAccount,
    })
    .onConflictDoUpdate({
      target: unipileAccount.accountId,
      set: {
        organizationId,
        connectedByUserId,
        email: profile.email ?? null,
        provider: profile.provider ?? null,
        status: "connected",
        scrapeStatus: "idle",
        lastError: null,
        rawAccount: profile.rawAccount,
        updatedAt: now,
      },
    })
    .returning({ id: unipileAccount.id });

  return account;
}

export async function runUnipileScrape(
  unipileAccountDbId: string,
  options: MailboxScrapeOptions = {},
): Promise<MailboxScrapeResult> {
  const [account] = await db.select().from(unipileAccount).where(eq(unipileAccount.id, unipileAccountDbId)).limit(1);

  if (!account) {
    throw new Error("Unipile account was not found.");
  }

  const cursorStart = account.backfillCompletedAt ? null : account.nextCursor;
  const runId = createId("run");
  const now = new Date();

  await db.insert(scrapeRun).values({
    id: runId,
    organizationId: account.organizationId,
    unipileAccountId: account.id,
    status: "running",
    cursorStart,
    startedAt: now,
  });

  await db
    .update(unipileAccount)
    .set({
      scrapeStatus: "running",
      lastError: null,
      updatedAt: now,
    })
    .where(eq(unipileAccount.id, account.id));

  let cursor = cursorStart;
  let pagesProcessed = 0;
  let messagesUpserted = 0;
  let providerRequestTotal = 0;
  const touchedThreadIds = new Set<string>();

  try {
    const maxPages = account.backfillCompletedAt
      ? 1
      : Math.min(options.maxPages ?? env.UNIPILE_SCRAPE_MAX_PAGES_PER_RUN, env.UNIPILE_SCRAPE_MAX_PAGES_PER_RUN);

    while (pagesProcessed < maxPages) {
      const page = await listUnipileEmails(account.accountId, cursor);
      providerRequestTotal += 1;

      const pageThreadIds = await persistEmailPage({
        organizationId: account.organizationId,
        accountDbId: account.id,
        emails: page.emails,
      });

      for (const threadId of pageThreadIds) {
        touchedThreadIds.add(threadId);
      }

      pagesProcessed += 1;
      messagesUpserted += page.emails.length;
      cursor = page.nextCursor;

      await db
        .update(scrapeRun)
        .set({
          cursorEnd: cursor,
          pagesProcessed,
          messagesUpserted,
          threadsTouched: touchedThreadIds.size,
          providerRequestCount: providerRequestTotal,
        })
        .where(eq(scrapeRun.id, runId));

      await db
        .update(unipileAccount)
        .set({
          nextCursor: cursor,
          lastScrapedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(unipileAccount.id, account.id));

      if (!cursor) {
        break;
      }

      if (env.UNIPILE_SCRAPE_REQUEST_DELAY_MS > 0) {
        await wait(env.UNIPILE_SCRAPE_REQUEST_DELAY_MS);
      }
    }

    await refreshThreadRollups([...touchedThreadIds]);

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
      .update(unipileAccount)
      .set({
        scrapeStatus: completed ? "completed" : "idle",
        nextCursor: cursor,
        backfillCompletedAt: completed ? new Date() : account.backfillCompletedAt,
        lastScrapedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(unipileAccount.id, account.id));

    return {
      runId,
      organizationId: account.organizationId,
      status,
      pagesProcessed,
      messagesUpserted,
      threadsTouched: touchedThreadIds.size,
      touchedThreadIds: [...touchedThreadIds],
      nextCursor: cursor,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Unipile scrape failure.";

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
      .update(unipileAccount)
      .set({
        scrapeStatus: "failed",
        nextCursor: cursor,
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(unipileAccount.id, account.id));

    return {
      runId,
      organizationId: account.organizationId,
      status: "failed",
      pagesProcessed,
      messagesUpserted,
      threadsTouched: touchedThreadIds.size,
      touchedThreadIds: [...touchedThreadIds],
      nextCursor: cursor,
    };
  }
}

async function persistEmailPage({
  organizationId,
  accountDbId,
  emails,
}: {
  organizationId: string;
  accountDbId: string;
  emails: UnipileEmail[];
}) {
  const touchedThreadIds = new Set<string>();

  await db.transaction(async (tx) => {
    for (const email of emails) {
      if (!email.id) {
        continue;
      }

      const providerThreadId = emailThreadId(email);

      if (!providerThreadId) {
        continue;
      }

      const participants = mergeParticipants(email);
      const receivedAt = emailDate(email);
      const attachments = Array.isArray(email.attachments) ? email.attachments : [];
      const snippet = emailSnippet(email);

      const [thread] = await tx
        .insert(emailThread)
        .values({
          id: createId("thr"),
          organizationId,
          unipileAccountId: accountDbId,
          nylasThreadId: providerThreadId,
          subject: email.subject ?? null,
          participants,
          latestSnippet: snippet || null,
          latestMessageAt: receivedAt,
          earliestMessageAt: receivedAt,
        })
        .onConflictDoUpdate({
          target: [emailThread.unipileAccountId, emailThread.nylasThreadId],
          set: {
            subject: email.subject ?? null,
            participants,
            latestSnippet: snippet || null,
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
          unipileAccountId: accountDbId,
          threadId: thread.id,
          nylasMessageId: email.id,
          nylasThreadId: providerThreadId,
          subject: email.subject ?? null,
          snippet: snippet || null,
          from: asEmailList(email.from_attendee),
          to: asEmailList(email.to_attendees),
          cc: asEmailList(email.cc_attendees),
          bcc: asEmailList(email.bcc_attendees),
          replyTo: asEmailList(email.reply_to_attendees),
          folderIds: [...asStringArray(email.folders), ...asStringArray(email.folderIds)],
          attachments,
          hasAttachments: typeof email.has_attachments === "boolean" ? email.has_attachments : attachments.length > 0,
          unread: null,
          starred: null,
          receivedAt,
          selectedPayload: email as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: [emailMessage.unipileAccountId, emailMessage.nylasMessageId],
          set: {
            threadId: thread.id,
            subject: email.subject ?? null,
            snippet: snippet || null,
            from: asEmailList(email.from_attendee),
            to: asEmailList(email.to_attendees),
            cc: asEmailList(email.cc_attendees),
            bcc: asEmailList(email.bcc_attendees),
            replyTo: asEmailList(email.reply_to_attendees),
            folderIds: [...asStringArray(email.folders), ...asStringArray(email.folderIds)],
            attachments,
            hasAttachments: typeof email.has_attachments === "boolean" ? email.has_attachments : attachments.length > 0,
            receivedAt,
            selectedPayload: email as Record<string, unknown>,
            updatedAt: new Date(),
          },
        });
    }
  });

  return touchedThreadIds;
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
