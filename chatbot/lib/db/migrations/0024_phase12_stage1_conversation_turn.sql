CREATE TABLE IF NOT EXISTS "ConversationTurn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"clientTurnId" varchar(128) NOT NULL,
	"assistantMode" varchar(32),
	"requestHash" varchar(64),
	"userMessageId" uuid,
	"assistantMessageId" uuid,
	"status" varchar DEFAULT 'user_persisted' NOT NULL,
	"attemptCount" integer DEFAULT 1 NOT NULL,
	"errorCode" varchar(64),
	"pendingAssistantParts" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationTurn_chat_client_turn_unique" ON "ConversationTurn" USING btree ("chatId","clientTurnId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ConversationTurn_owner_created_idx" ON "ConversationTurn" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MatterDocument_owner_created_idx" ON "MatterDocument" USING btree ("userId","createdAt","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Message_v2_chat_history_idx" ON "Message_v2" USING btree ("chatId","createdAt","id");