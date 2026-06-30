export type EmailName = {
  name?: string;
  email?: string;
};

export type NylasSelectedMessage = {
  id?: string;
  object?: string;
  grant_id?: string;
  grantId?: string;
  thread_id?: string;
  threadId?: string;
  subject?: string;
  snippet?: string;
  date?: number;
  from?: EmailName[];
  to?: EmailName[];
  cc?: EmailName[];
  bcc?: EmailName[];
  reply_to?: EmailName[];
  replyTo?: EmailName[];
  folders?: string[];
  attachments?: Array<Record<string, unknown>>;
  unread?: boolean;
  starred?: boolean;
};

export type NylasGrantProfile = {
  grantId: string;
  email?: string;
  provider?: string;
};

export type NylasListMessagesResult = {
  messages: NylasSelectedMessage[];
  nextCursor: string | null;
  requestId?: string;
  providerRequestCount: number;
};
