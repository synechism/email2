export type EmailName = {
  name?: string;
  email?: string;
};

export type EmailSource = "nylas" | "unipile";

export type MailboxConnection = {
  id: string;
  source: EmailSource;
  organizationId: string;
  externalAccountId: string;
  email: string | null;
  provider: string | null;
  scrapeStatus: string;
};

export type MailboxScrapeResult = {
  runId: string;
  organizationId: string;
  status: "completed" | "partial" | "failed";
  pagesProcessed: number;
  messagesUpserted: number;
  threadsTouched: number;
  touchedThreadIds: string[];
  nextCursor: string | null;
};

export type MailboxScrapeOptions = {
  maxPages?: number;
};
