import { getEmailProviderAdapter, resolveMailboxConnection } from "@/lib/email/adapters";
import type { MailboxScrapeOptions } from "@/lib/email/types";
import { enqueueEmailDiscoveryJob, removeMailboxQueueJobs } from "@/lib/queues/email";

export class MailboxNotFoundError extends Error {
  constructor() {
    super("Mailbox not found.");
    this.name = "MailboxNotFoundError";
  }
}

export async function getMailbox(mailboxId: string, organizationId?: string) {
  const mailbox = await resolveMailboxConnection(mailboxId);

  if (!mailbox || (organizationId && mailbox.organizationId !== organizationId)) {
    return null;
  }

  return mailbox;
}

export async function enqueueMailboxDiscovery({
  mailboxId,
  organizationId,
  pagesRemaining,
}: {
  mailboxId: string;
  organizationId?: string;
  pagesRemaining?: number;
}) {
  const mailbox = await getRequiredMailbox(mailboxId, organizationId);
  const adapter = getEmailProviderAdapter(mailbox.source);
  const pageBudget = pagesRemaining ?? adapter.defaultPageBudget();

  await adapter.markQueued(mailbox.id);

  return enqueueEmailDiscoveryJob({
    mailboxId: mailbox.id,
    pagesRemaining: pageBudget,
  });
}

export async function getMailboxDiscoveryPageBudget(mailboxId: string) {
  const mailbox = await getRequiredMailbox(mailboxId);
  return getEmailProviderAdapter(mailbox.source).defaultPageBudget();
}

export async function runMailboxScrape(mailboxId: string, options: MailboxScrapeOptions) {
  const mailbox = await getRequiredMailbox(mailboxId);
  return getEmailProviderAdapter(mailbox.source).scrape(mailbox.id, options);
}

export async function getMailboxPendingThreadIds(mailboxId: string) {
  const mailbox = await getRequiredMailbox(mailboxId);
  return getEmailProviderAdapter(mailbox.source).pendingThreadIds(mailbox.id);
}

export async function deleteMailboxLocalData(mailboxId: string, organizationId: string) {
  const mailbox = await getRequiredMailbox(mailboxId, organizationId);
  const adapter = getEmailProviderAdapter(mailbox.source);
  const threadIds = await adapter.threadIds(mailbox.id, organizationId);
  const messagesDeleted = await adapter.messageCount(mailbox.id, organizationId);
  const queueCleanup = await removeMailboxQueueJobs({
    mailboxId: mailbox.id,
    threadIds,
  });
  const deleted = await adapter.deleteMailbox(mailbox.id, organizationId);

  if (!deleted) {
    throw new MailboxNotFoundError();
  }

  return {
    deleted: true,
    source: mailbox.source,
    email: mailbox.email,
    threadsDeleted: threadIds.length,
    messagesDeleted,
    ...queueCleanup,
  };
}

async function getRequiredMailbox(mailboxId: string, organizationId?: string) {
  const mailbox = await getMailbox(mailboxId, organizationId);

  if (!mailbox) {
    throw new MailboxNotFoundError();
  }

  return mailbox;
}
