export type UnipileAttendee = {
  display_name?: string;
  identifier?: string;
  identifier_type?: string;
};

export type UnipileEmail = {
  id?: string;
  account_id?: string;
  date?: string;
  subject?: string;
  body?: string;
  body_plain?: string;
  from_attendee?: UnipileAttendee;
  to_attendees?: UnipileAttendee[];
  cc_attendees?: UnipileAttendee[];
  bcc_attendees?: UnipileAttendee[];
  reply_to_attendees?: UnipileAttendee[];
  folders?: string[];
  folderIds?: string[];
  attachments?: Array<Record<string, unknown>>;
  has_attachments?: boolean;
  message_id?: string;
  provider_id?: string | Record<string, unknown>;
  thread_id?: string;
  is_complete?: boolean;
};

export type UnipileAccountProfile = {
  accountId: string;
  email?: string;
  provider?: string;
  rawAccount: Record<string, unknown>;
  createdAt?: Date | null;
};

export type UnipileListEmailsResult = {
  emails: UnipileEmail[];
  nextCursor: string | null;
};
