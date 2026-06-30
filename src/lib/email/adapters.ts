import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { emailMessage, emailThread, nylasGrant, unipileAccount } from "@/db/schema";
import { env } from "@/lib/env";
import { runNylasScrape } from "@/lib/nylas/scraper";
import { runUnipileScrape } from "@/lib/unipile/scraper";
import type { EmailSource, MailboxConnection, MailboxScrapeOptions, MailboxScrapeResult } from "@/lib/email/types";

export type EmailProviderAdapter = {
  source: EmailSource;
  defaultPageBudget(): number;
  findMailbox(mailboxId: string): Promise<MailboxConnection | null>;
  markQueued(mailboxId: string): Promise<void>;
  scrape(mailboxId: string, options: MailboxScrapeOptions): Promise<MailboxScrapeResult>;
  pendingThreadIds(mailboxId: string): Promise<string[]>;
  threadIds(mailboxId: string, organizationId: string): Promise<string[]>;
  messageCount(mailboxId: string, organizationId: string): Promise<number>;
  deleteMailbox(mailboxId: string, organizationId: string): Promise<boolean>;
};

const nylasAdapter: EmailProviderAdapter = {
  source: "nylas",
  defaultPageBudget() {
    return env.NYLAS_SCRAPE_MAX_PAGES_PER_RUN;
  },
  async findMailbox(mailboxId) {
    const [grant] = await db
      .select({
        id: nylasGrant.id,
        organizationId: nylasGrant.organizationId,
        externalAccountId: nylasGrant.grantId,
        email: nylasGrant.email,
        provider: nylasGrant.provider,
        scrapeStatus: nylasGrant.scrapeStatus,
      })
      .from(nylasGrant)
      .where(eq(nylasGrant.id, mailboxId))
      .limit(1);

    return grant ? { ...grant, source: "nylas" } : null;
  },
  async markQueued(mailboxId) {
    await db
      .update(nylasGrant)
      .set({
        scrapeStatus: "queued",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(nylasGrant.id, mailboxId));
  },
  scrape(mailboxId, options) {
    return runNylasScrape(mailboxId, options);
  },
  async pendingThreadIds(mailboxId) {
    const rows = await db
      .select({ id: emailThread.id })
      .from(emailThread)
      .where(and(eq(emailThread.nylasGrantId, mailboxId), eq(emailThread.kind, "uncategorized")));

    return rows.map((row) => row.id);
  },
  async threadIds(mailboxId, organizationId) {
    const rows = await db
      .select({ id: emailThread.id })
      .from(emailThread)
      .where(and(eq(emailThread.nylasGrantId, mailboxId), eq(emailThread.organizationId, organizationId)));

    return rows.map((row) => row.id);
  },
  async messageCount(mailboxId, organizationId) {
    const [count] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(emailMessage)
      .where(and(eq(emailMessage.nylasGrantId, mailboxId), eq(emailMessage.organizationId, organizationId)));

    return count?.value ?? 0;
  },
  async deleteMailbox(mailboxId, organizationId) {
    const [deleted] = await db
      .delete(nylasGrant)
      .where(and(eq(nylasGrant.id, mailboxId), eq(nylasGrant.organizationId, organizationId)))
      .returning({ id: nylasGrant.id });

    return Boolean(deleted);
  },
};

const unipileAdapter: EmailProviderAdapter = {
  source: "unipile",
  defaultPageBudget() {
    return env.UNIPILE_SCRAPE_MAX_PAGES_PER_RUN;
  },
  async findMailbox(mailboxId) {
    const [account] = await db
      .select({
        id: unipileAccount.id,
        organizationId: unipileAccount.organizationId,
        externalAccountId: unipileAccount.accountId,
        email: unipileAccount.email,
        provider: unipileAccount.provider,
        scrapeStatus: unipileAccount.scrapeStatus,
      })
      .from(unipileAccount)
      .where(eq(unipileAccount.id, mailboxId))
      .limit(1);

    return account ? { ...account, source: "unipile" } : null;
  },
  async markQueued(mailboxId) {
    await db
      .update(unipileAccount)
      .set({
        scrapeStatus: "queued",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(unipileAccount.id, mailboxId));
  },
  scrape(mailboxId, options) {
    return runUnipileScrape(mailboxId, options);
  },
  async pendingThreadIds(mailboxId) {
    const rows = await db
      .select({ id: emailThread.id })
      .from(emailThread)
      .where(and(eq(emailThread.unipileAccountId, mailboxId), eq(emailThread.kind, "uncategorized")));

    return rows.map((row) => row.id);
  },
  async threadIds(mailboxId, organizationId) {
    const rows = await db
      .select({ id: emailThread.id })
      .from(emailThread)
      .where(and(eq(emailThread.unipileAccountId, mailboxId), eq(emailThread.organizationId, organizationId)));

    return rows.map((row) => row.id);
  },
  async messageCount(mailboxId, organizationId) {
    const [count] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(emailMessage)
      .where(and(eq(emailMessage.unipileAccountId, mailboxId), eq(emailMessage.organizationId, organizationId)));

    return count?.value ?? 0;
  },
  async deleteMailbox(mailboxId, organizationId) {
    const [deleted] = await db
      .delete(unipileAccount)
      .where(and(eq(unipileAccount.id, mailboxId), eq(unipileAccount.organizationId, organizationId)))
      .returning({ id: unipileAccount.id });

    return Boolean(deleted);
  },
};

export const emailProviderAdapters = {
  nylas: nylasAdapter,
  unipile: unipileAdapter,
} satisfies Record<EmailSource, EmailProviderAdapter>;

export function getEmailProviderAdapter(source: EmailSource) {
  return emailProviderAdapters[source];
}

export async function resolveMailboxConnection(mailboxId: string) {
  for (const adapter of Object.values(emailProviderAdapters)) {
    const mailbox = await adapter.findMailbox(mailboxId);

    if (mailbox) {
      return mailbox;
    }
  }

  return null;
}
