CREATE TABLE IF NOT EXISTS "PolicyIntelligenceDraftSnapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itemId" uuid NOT NULL,
	"revisionId" uuid NOT NULL,
	"saveNumber" integer NOT NULL,
	"contentVersion" varchar(64) NOT NULL,
	"contentDigest" varchar(64) NOT NULL,
	"humanContent" json NOT NULL,
	"contentBytes" integer NOT NULL,
	"savedByUserId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceDraftSnapshot" ADD CONSTRAINT "PolicyIntelligenceDraftSnapshot_itemId_PolicyIntelligenceItem_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."PolicyIntelligenceItem"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceDraftSnapshot" ADD CONSTRAINT "PolicyIntelligenceDraftSnapshot_revisionId_PolicyIntelligenceAnalysisRevision_id_fk" FOREIGN KEY ("revisionId") REFERENCES "public"."PolicyIntelligenceAnalysisRevision"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceDraftSnapshot" ADD CONSTRAINT "PolicyIntelligenceDraftSnapshot_savedByUserId_User_id_fk" FOREIGN KEY ("savedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "PolicyIntelligenceDraftSnapshot_revision_save_unique" ON "PolicyIntelligenceDraftSnapshot" USING btree ("revisionId","saveNumber");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceDraftSnapshot_revision_created_idx" ON "PolicyIntelligenceDraftSnapshot" USING btree ("revisionId","createdAt");