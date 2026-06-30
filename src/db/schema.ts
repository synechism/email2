import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updatedAt", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("activeOrganizationId"),
  },
  (table) => ({
    userIdIdx: index("session_userId_idx").on(table.userId),
  }),
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true, mode: "date" }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true, mode: "date" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    userIdIdx: index("account_userId_idx").on(table.userId),
  }),
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    identifierIdx: index("verification_identifier_idx").on(table.identifier),
  }),
);

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    slugIdx: index("organization_slug_idx").on(table.slug),
  }),
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (table) => ({
    organizationIdIdx: index("member_organizationId_idx").on(table.organizationId),
    userIdIdx: index("member_userId_idx").on(table.userId),
    orgUserUnique: uniqueIndex("member_org_user_unique").on(table.organizationId, table.userId),
  }),
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: createdAt(),
    inviterId: text("inviterId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    organizationIdIdx: index("invitation_organizationId_idx").on(table.organizationId),
    emailIdx: index("invitation_email_idx").on(table.email),
  }),
);

export const nylasOAuthState = pgTable(
  "nylas_oauth_state",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider"),
    redirectUri: text("redirectUri").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("usedAt", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    expiresAtIdx: index("nylas_oauth_state_expiresAt_idx").on(table.expiresAt),
  }),
);

export const nylasGrant = pgTable(
  "nylas_grant",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    connectedByUserId: text("connectedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    grantId: text("grantId").notNull().unique(),
    email: text("email"),
    provider: text("provider"),
    status: text("status").notNull().default("connected"),
    scrapeStatus: text("scrapeStatus").notNull().default("idle"),
    nextCursor: text("nextCursor"),
    backfillCompletedAt: timestamp("backfillCompletedAt", { withTimezone: true, mode: "date" }),
    lastScrapedAt: timestamp("lastScrapedAt", { withTimezone: true, mode: "date" }),
    lastError: text("lastError"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    organizationIdIdx: index("nylas_grant_organizationId_idx").on(table.organizationId),
  }),
);

export const scrapeRun = pgTable(
  "scrape_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    nylasGrantId: text("nylasGrantId")
      .notNull()
      .references(() => nylasGrant.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"),
    cursorStart: text("cursorStart"),
    cursorEnd: text("cursorEnd"),
    pagesProcessed: integer("pagesProcessed").notNull().default(0),
    messagesUpserted: integer("messagesUpserted").notNull().default(0),
    threadsTouched: integer("threadsTouched").notNull().default(0),
    providerRequestCount: integer("providerRequestCount").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("startedAt", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finishedAt", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    grantIdx: index("scrape_run_nylasGrantId_idx").on(table.nylasGrantId),
    orgStartedIdx: index("scrape_run_org_started_idx").on(table.organizationId, table.startedAt),
  }),
);

export const emailThread = pgTable(
  "email_thread",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    nylasGrantId: text("nylasGrantId")
      .notNull()
      .references(() => nylasGrant.id, { onDelete: "cascade" }),
    nylasThreadId: text("nylasThreadId").notNull(),
    subject: text("subject"),
    participants: jsonb("participants").$type<Array<{ name?: string; email?: string }>>().notNull().default(sql`'[]'::jsonb`),
    messageCount: integer("messageCount").notNull().default(0),
    earliestMessageAt: timestamp("earliestMessageAt", { withTimezone: true, mode: "date" }),
    latestMessageAt: timestamp("latestMessageAt", { withTimezone: true, mode: "date" }),
    latestSnippet: text("latestSnippet"),
    kind: text("kind").notNull().default("uncategorized"),
    kindConfidence: real("kindConfidence").notNull().default(0),
    kindReason: text("kindReason"),
    judgedAt: timestamp("judgedAt", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    orgIdx: index("email_thread_organizationId_idx").on(table.organizationId),
    grantThreadUnique: uniqueIndex("email_thread_grant_thread_unique").on(table.nylasGrantId, table.nylasThreadId),
    latestIdx: index("email_thread_latest_idx").on(table.organizationId, table.latestMessageAt),
  }),
);

export const emailMessage = pgTable(
  "email_message",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    nylasGrantId: text("nylasGrantId")
      .notNull()
      .references(() => nylasGrant.id, { onDelete: "cascade" }),
    threadId: text("threadId")
      .notNull()
      .references(() => emailThread.id, { onDelete: "cascade" }),
    nylasMessageId: text("nylasMessageId").notNull(),
    nylasThreadId: text("nylasThreadId").notNull(),
    subject: text("subject"),
    snippet: text("snippet"),
    from: jsonb("from").$type<Array<{ name?: string; email?: string }>>().notNull().default(sql`'[]'::jsonb`),
    to: jsonb("to").$type<Array<{ name?: string; email?: string }>>().notNull().default(sql`'[]'::jsonb`),
    cc: jsonb("cc").$type<Array<{ name?: string; email?: string }>>().notNull().default(sql`'[]'::jsonb`),
    bcc: jsonb("bcc").$type<Array<{ name?: string; email?: string }>>().notNull().default(sql`'[]'::jsonb`),
    replyTo: jsonb("replyTo").$type<Array<{ name?: string; email?: string }>>().notNull().default(sql`'[]'::jsonb`),
    folderIds: jsonb("folderIds").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    attachments: jsonb("attachments").$type<Array<Record<string, unknown>>>().notNull().default(sql`'[]'::jsonb`),
    hasAttachments: boolean("hasAttachments").notNull().default(false),
    unread: boolean("unread"),
    starred: boolean("starred"),
    receivedAt: timestamp("receivedAt", { withTimezone: true, mode: "date" }),
    selectedPayload: jsonb("selectedPayload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    orgIdx: index("email_message_organizationId_idx").on(table.organizationId),
    threadIdx: index("email_message_threadId_idx").on(table.threadId),
    grantMessageUnique: uniqueIndex("email_message_grant_message_unique").on(table.nylasGrantId, table.nylasMessageId),
    receivedIdx: index("email_message_received_idx").on(table.organizationId, table.receivedAt),
  }),
);

export const threadJudgment = pgTable(
  "thread_judgment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("threadId")
      .notNull()
      .references(() => emailThread.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    confidence: real("confidence").notNull().default(0),
    reason: text("reason"),
    strategy: text("strategy").notNull().default("local-keyword-v1"),
    createdAt: createdAt(),
  },
  (table) => ({
    threadIdx: index("thread_judgment_threadId_idx").on(table.threadId),
  }),
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  memberships: many(member),
  grants: many(nylasGrant),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  grants: many(nylasGrant),
  threads: many(emailThread),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const nylasGrantRelations = relations(nylasGrant, ({ one, many }) => ({
  organization: one(organization, {
    fields: [nylasGrant.organizationId],
    references: [organization.id],
  }),
  connectedBy: one(user, {
    fields: [nylasGrant.connectedByUserId],
    references: [user.id],
  }),
  threads: many(emailThread),
  messages: many(emailMessage),
  scrapeRuns: many(scrapeRun),
}));

export const emailThreadRelations = relations(emailThread, ({ one, many }) => ({
  organization: one(organization, {
    fields: [emailThread.organizationId],
    references: [organization.id],
  }),
  grant: one(nylasGrant, {
    fields: [emailThread.nylasGrantId],
    references: [nylasGrant.id],
  }),
  messages: many(emailMessage),
  judgments: many(threadJudgment),
}));

export const emailMessageRelations = relations(emailMessage, ({ one }) => ({
  organization: one(organization, {
    fields: [emailMessage.organizationId],
    references: [organization.id],
  }),
  grant: one(nylasGrant, {
    fields: [emailMessage.nylasGrantId],
    references: [nylasGrant.id],
  }),
  thread: one(emailThread, {
    fields: [emailMessage.threadId],
    references: [emailThread.id],
  }),
}));
