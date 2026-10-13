ALTER TABLE "PolicyIntelligenceItem" ADD COLUMN "publicationMode" varchar DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceItem" ADD COLUMN "protectionSetAt" timestamp;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceItem" ADD COLUMN "protectionSetByUserId" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceItem" ADD CONSTRAINT "PolicyIntelligenceItem_protectionSetByUserId_User_id_fk" FOREIGN KEY ("protectionSetByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
