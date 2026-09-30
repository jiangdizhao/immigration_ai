CREATE TABLE IF NOT EXISTS "PolicyIntelligenceAnalysisRevision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itemId" uuid NOT NULL,
	"snapshotId" uuid NOT NULL,
	"analysisFingerprint" varchar(64) NOT NULL,
	"revisionNumber" integer NOT NULL,
	"schemaVersion" varchar(100) NOT NULL,
	"analysis" json NOT NULL,
	"verification" json NOT NULL,
	"modelMetadata" json NOT NULL,
	"editorialStatus" varchar NOT NULL,
	"generatedAt" timestamp NOT NULL,
	"publishedAt" timestamp,
	"supersededAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PolicyIntelligenceItem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(180) NOT NULL,
	"primarySourceConfigId" varchar(100) NOT NULL,
	"primarySourceId" varchar(255) NOT NULL,
	"canonicalOfficialUrl" text NOT NULL,
	"sourceStatus" varchar DEFAULT 'announced' NOT NULL,
	"editorialStatus" varchar DEFAULT 'draft' NOT NULL,
	"latestSnapshotId" uuid,
	"latestPublishedRevisionId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PolicyIntelligenceSourceSnapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itemId" uuid NOT NULL,
	"sourceConfigId" varchar(100) NOT NULL,
	"sourceId" varchar(255) NOT NULL,
	"authority" varchar(255) NOT NULL,
	"canonicalUrl" text NOT NULL,
	"officialTitle" text NOT NULL,
	"retrievedAt" timestamp NOT NULL,
	"contentType" varchar(100) NOT NULL,
	"httpStatus" integer NOT NULL,
	"sourceDate" varchar(10),
	"effectiveDate" varchar(10),
	"normalizedEvidence" text NOT NULL,
	"contentHash" varchar(64) NOT NULL,
	"evidenceTruncated" boolean DEFAULT false NOT NULL,
	"sourceMetadata" json NOT NULL,
	"previousSnapshotId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PolicyIntelligenceSyncRun" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sourceConfigId" varchar(100) NOT NULL,
	"mode" varchar NOT NULL,
	"status" varchar NOT NULL,
	"startedAt" timestamp NOT NULL,
	"completedAt" timestamp,
	"discoveredCount" integer DEFAULT 0 NOT NULL,
	"snapshottedCount" integer DEFAULT 0 NOT NULL,
	"unchangedCount" integer DEFAULT 0 NOT NULL,
	"analyzedCount" integer DEFAULT 0 NOT NULL,
	"publishedCount" integer DEFAULT 0 NOT NULL,
	"heldCount" integer DEFAULT 0 NOT NULL,
	"failureCount" integer DEFAULT 0 NOT NULL,
	"safeErrorCode" varchar(100),
	"metadata" json DEFAULT '{}'::json NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceAnalysisRevision" ADD CONSTRAINT "PolicyIntelligenceAnalysisRevision_itemId_PolicyIntelligenceItem_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."PolicyIntelligenceItem"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceAnalysisRevision" ADD CONSTRAINT "PolicyIntelligenceAnalysisRevision_snapshotId_PolicyIntelligenceSourceSnapshot_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."PolicyIntelligenceSourceSnapshot"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceSourceSnapshot" ADD CONSTRAINT "PolicyIntelligenceSourceSnapshot_itemId_PolicyIntelligenceItem_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."PolicyIntelligenceItem"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "PolicyIntelligenceAnalysisRevision_item_revision_unique" ON "PolicyIntelligenceAnalysisRevision" USING btree ("itemId","revisionNumber");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceAnalysisRevision_snapshot_idx" ON "PolicyIntelligenceAnalysisRevision" USING btree ("snapshotId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "PolicyIntelligenceAnalysisRevision_snapshot_analysis_fingerprint_unique" ON "PolicyIntelligenceAnalysisRevision" USING btree ("snapshotId","analysisFingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceAnalysisRevision_publication_idx" ON "PolicyIntelligenceAnalysisRevision" USING btree ("editorialStatus","publishedAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "PolicyIntelligenceItem_slug_unique" ON "PolicyIntelligenceItem" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "PolicyIntelligenceItem_source_identity_unique" ON "PolicyIntelligenceItem" USING btree ("primarySourceConfigId","primarySourceId","canonicalOfficialUrl");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceItem_publication_status_idx" ON "PolicyIntelligenceItem" USING btree ("editorialStatus","updatedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceSourceSnapshot_item_hash_idx" ON "PolicyIntelligenceSourceSnapshot" USING btree ("itemId","contentHash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceSourceSnapshot_item_retrieved_idx" ON "PolicyIntelligenceSourceSnapshot" USING btree ("itemId","retrievedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceSyncRun_source_started_idx" ON "PolicyIntelligenceSyncRun" USING btree ("sourceConfigId","startedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceSyncRun_status_started_idx" ON "PolicyIntelligenceSyncRun" USING btree ("status","startedAt");