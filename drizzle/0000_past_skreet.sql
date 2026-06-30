CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_message" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"nylasGrantId" text NOT NULL,
	"threadId" text NOT NULL,
	"nylasMessageId" text NOT NULL,
	"nylasThreadId" text NOT NULL,
	"subject" text,
	"snippet" text,
	"from" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bcc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"replyTo" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"folderIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hasAttachments" boolean DEFAULT false NOT NULL,
	"unread" boolean,
	"starred" boolean,
	"receivedAt" timestamp with time zone,
	"selectedPayload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"nylasGrantId" text NOT NULL,
	"nylasThreadId" text NOT NULL,
	"subject" text,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"messageCount" integer DEFAULT 0 NOT NULL,
	"earliestMessageAt" timestamp with time zone,
	"latestMessageAt" timestamp with time zone,
	"latestSnippet" text,
	"kind" text DEFAULT 'uncategorized' NOT NULL,
	"kindConfidence" real DEFAULT 0 NOT NULL,
	"kindReason" text,
	"judgedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"inviterId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nylas_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"connectedByUserId" text NOT NULL,
	"grantId" text NOT NULL,
	"email" text,
	"provider" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"scrapeStatus" text DEFAULT 'idle' NOT NULL,
	"nextCursor" text,
	"backfillCompletedAt" timestamp with time zone,
	"lastScrapedAt" timestamp with time zone,
	"lastError" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nylas_grant_grantId_unique" UNIQUE("grantId")
);
--> statement-breakpoint
CREATE TABLE "nylas_oauth_state" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"userId" text NOT NULL,
	"provider" text,
	"redirectUri" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "scrape_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"nylasGrantId" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"cursorStart" text,
	"cursorEnd" text,
	"pagesProcessed" integer DEFAULT 0 NOT NULL,
	"messagesUpserted" integer DEFAULT 0 NOT NULL,
	"threadsTouched" integer DEFAULT 0 NOT NULL,
	"providerRequestCount" integer DEFAULT 0 NOT NULL,
	"error" text,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"finishedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"activeOrganizationId" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "thread_judgment" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"threadId" text NOT NULL,
	"kind" text NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"reason" text,
	"strategy" text DEFAULT 'local-keyword-v1' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_message" ADD CONSTRAINT "email_message_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_message" ADD CONSTRAINT "email_message_nylasGrantId_nylas_grant_id_fk" FOREIGN KEY ("nylasGrantId") REFERENCES "public"."nylas_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_message" ADD CONSTRAINT "email_message_threadId_email_thread_id_fk" FOREIGN KEY ("threadId") REFERENCES "public"."email_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_thread" ADD CONSTRAINT "email_thread_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_thread" ADD CONSTRAINT "email_thread_nylasGrantId_nylas_grant_id_fk" FOREIGN KEY ("nylasGrantId") REFERENCES "public"."nylas_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_user_id_fk" FOREIGN KEY ("inviterId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nylas_grant" ADD CONSTRAINT "nylas_grant_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nylas_grant" ADD CONSTRAINT "nylas_grant_connectedByUserId_user_id_fk" FOREIGN KEY ("connectedByUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nylas_oauth_state" ADD CONSTRAINT "nylas_oauth_state_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nylas_oauth_state" ADD CONSTRAINT "nylas_oauth_state_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_run" ADD CONSTRAINT "scrape_run_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_run" ADD CONSTRAINT "scrape_run_nylasGrantId_nylas_grant_id_fk" FOREIGN KEY ("nylasGrantId") REFERENCES "public"."nylas_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_judgment" ADD CONSTRAINT "thread_judgment_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_judgment" ADD CONSTRAINT "thread_judgment_threadId_email_thread_id_fk" FOREIGN KEY ("threadId") REFERENCES "public"."email_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "email_message_organizationId_idx" ON "email_message" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "email_message_threadId_idx" ON "email_message" USING btree ("threadId");--> statement-breakpoint
CREATE UNIQUE INDEX "email_message_grant_message_unique" ON "email_message" USING btree ("nylasGrantId","nylasMessageId");--> statement-breakpoint
CREATE INDEX "email_message_received_idx" ON "email_message" USING btree ("organizationId","receivedAt");--> statement-breakpoint
CREATE INDEX "email_thread_organizationId_idx" ON "email_thread" USING btree ("organizationId");--> statement-breakpoint
CREATE UNIQUE INDEX "email_thread_grant_thread_unique" ON "email_thread" USING btree ("nylasGrantId","nylasThreadId");--> statement-breakpoint
CREATE INDEX "email_thread_latest_idx" ON "email_thread" USING btree ("organizationId","latestMessageAt");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_unique" ON "member" USING btree ("organizationId","userId");--> statement-breakpoint
CREATE INDEX "nylas_grant_organizationId_idx" ON "nylas_grant" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "nylas_oauth_state_expiresAt_idx" ON "nylas_oauth_state" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "organization_slug_idx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "scrape_run_nylasGrantId_idx" ON "scrape_run" USING btree ("nylasGrantId");--> statement-breakpoint
CREATE INDEX "scrape_run_org_started_idx" ON "scrape_run" USING btree ("organizationId","startedAt");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "thread_judgment_threadId_idx" ON "thread_judgment" USING btree ("threadId");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");