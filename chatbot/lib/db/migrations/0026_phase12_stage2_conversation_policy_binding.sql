CREATE TABLE IF NOT EXISTS "ConversationPolicyBinding" (
	"chatId" uuid PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	"policySlug" varchar(120) NOT NULL,
	"policyOrigin" varchar DEFAULT 'automated' NOT NULL,
	"policyItemId" varchar(64),
	"policyRevisionNumber" integer,
	"policyPublishedAt" timestamp,
	"policySourceStatus" varchar(64),
	"policyRevisionToken" varchar(160),
	"titleZh" text NOT NULL,
	"titleEn" text NOT NULL,
	"officialTitle" text NOT NULL,
	"officialUrl" text NOT NULL,
	"launchId" varchar(64),
	"boundAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ConversationPolicyBinding" ADD CONSTRAINT "ConversationPolicyBinding_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ConversationPolicyBinding" ADD CONSTRAINT "ConversationPolicyBinding_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationPolicyBinding_user_launch_unique" ON "ConversationPolicyBinding" USING btree ("userId","launchId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ConversationPolicyBinding_user_bound_idx" ON "ConversationPolicyBinding" USING btree ("userId","boundAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ConversationPolicyBinding_policy_slug_idx" ON "ConversationPolicyBinding" USING btree ("policySlug");