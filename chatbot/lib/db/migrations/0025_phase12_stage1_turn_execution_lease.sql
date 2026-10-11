ALTER TABLE "ConversationTurn" ADD COLUMN "executionOwnerId" varchar(64);--> statement-breakpoint
ALTER TABLE "ConversationTurn" ADD COLUMN "executionLeaseExpiresAt" timestamp;--> statement-breakpoint
ALTER TABLE "ConversationTurn" ADD COLUMN "executionStartedAt" timestamp;--> statement-breakpoint
ALTER TABLE "ConversationTurn" ADD COLUMN "executionAttempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ConversationTurn_execution_lease_idx" ON "ConversationTurn" USING btree ("executionLeaseExpiresAt");