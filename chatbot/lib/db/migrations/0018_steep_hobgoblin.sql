CREATE TABLE IF NOT EXISTS "MatterDocument" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"chatId" uuid NOT NULL,
	"legalMatterId" varchar(255),
	"originalFilename" varchar(255) NOT NULL,
	"storageKey" varchar(512) NOT NULL,
	"mimeType" varchar NOT NULL,
	"byteSize" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"processingStatus" varchar DEFAULT 'not_started' NOT NULL,
	"securityStatus" varchar DEFAULT 'pending' NOT NULL,
	"deletedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatterDocument" ADD CONSTRAINT "MatterDocument_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatterDocument" ADD CONSTRAINT "MatterDocument_chatId_ImmigrationConversation_chatId_fk" FOREIGN KEY ("chatId") REFERENCES "public"."ImmigrationConversation"("chatId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "MatterDocument_storage_key_unique" ON "MatterDocument" USING btree ("storageKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MatterDocument_owner_conversation_idx" ON "MatterDocument" USING btree ("userId","chatId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MatterDocument_owner_lookup_idx" ON "MatterDocument" USING btree ("userId","id");