CREATE TABLE "unipile_account" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"connectedByUserId" text NOT NULL,
	"accountId" text NOT NULL,
	"email" text,
	"provider" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"scrapeStatus" text DEFAULT 'idle' NOT NULL,
	"nextCursor" text,
	"backfillCompletedAt" timestamp with time zone,
	"lastScrapedAt" timestamp with time zone,
	"lastError" text,
	"rawAccount" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unipile_account_accountId_unique" UNIQUE("accountId")
);
--> statement-breakpoint
CREATE TABLE "unipile_hosted_auth_state" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"userId" text NOT NULL,
	"redirectUri" text NOT NULL,
	"accountId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "email_message" ALTER COLUMN "nylasGrantId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_thread" ALTER COLUMN "nylasGrantId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scrape_run" ALTER COLUMN "nylasGrantId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_message" ADD COLUMN "unipileAccountId" text;--> statement-breakpoint
ALTER TABLE "email_thread" ADD COLUMN "unipileAccountId" text;--> statement-breakpoint
ALTER TABLE "scrape_run" ADD COLUMN "unipileAccountId" text;--> statement-breakpoint
ALTER TABLE "unipile_account" ADD CONSTRAINT "unipile_account_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unipile_account" ADD CONSTRAINT "unipile_account_connectedByUserId_user_id_fk" FOREIGN KEY ("connectedByUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unipile_hosted_auth_state" ADD CONSTRAINT "unipile_hosted_auth_state_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unipile_hosted_auth_state" ADD CONSTRAINT "unipile_hosted_auth_state_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unipile_account_organizationId_idx" ON "unipile_account" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "unipile_hosted_auth_state_expiresAt_idx" ON "unipile_hosted_auth_state" USING btree ("expiresAt");--> statement-breakpoint
ALTER TABLE "email_message" ADD CONSTRAINT "email_message_unipileAccountId_unipile_account_id_fk" FOREIGN KEY ("unipileAccountId") REFERENCES "public"."unipile_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_thread" ADD CONSTRAINT "email_thread_unipileAccountId_unipile_account_id_fk" FOREIGN KEY ("unipileAccountId") REFERENCES "public"."unipile_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_run" ADD CONSTRAINT "scrape_run_unipileAccountId_unipile_account_id_fk" FOREIGN KEY ("unipileAccountId") REFERENCES "public"."unipile_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_message_unipile_account_message_unique" ON "email_message" USING btree ("unipileAccountId","nylasMessageId");--> statement-breakpoint
CREATE UNIQUE INDEX "email_thread_unipile_account_thread_unique" ON "email_thread" USING btree ("unipileAccountId","nylasThreadId");--> statement-breakpoint
CREATE INDEX "scrape_run_unipileAccountId_idx" ON "scrape_run" USING btree ("unipileAccountId");