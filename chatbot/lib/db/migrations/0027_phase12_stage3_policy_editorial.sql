CREATE TABLE IF NOT EXISTS "PolicyEditorGrant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"grantedByUserId" uuid NOT NULL,
	"grantedAt" timestamp DEFAULT now() NOT NULL,
	"revokedByUserId" uuid,
	"revokedAt" timestamp,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PolicyIntelligenceEditorialEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actorUserId" uuid NOT NULL,
	"action" varchar NOT NULL,
	"itemId" uuid,
	"revisionId" uuid,
	"overrideReason" text,
	"detail" json DEFAULT '{}'::json NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PolicyIntelligenceOperatorSubmission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sourceConfigId" varchar(100) DEFAULT 'operator-submitted-official-url' NOT NULL,
	"submittedUrl" text NOT NULL,
	"submittedByUserId" uuid NOT NULL,
	"note" varchar(500),
	"status" varchar DEFAULT 'pending' NOT NULL,
	"errorCode" varchar(100),
	"attemptedAt" timestamp,
	"consumedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceAnalysisRevision" ALTER COLUMN "snapshotId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceAnalysisRevision" ALTER COLUMN "analysis" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceAnalysisRevision" ALTER COLUMN "verification" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceAnalysisRevision" ALTER COLUMN "modelMetadata" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceItem" ALTER COLUMN "primarySourceConfigId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceItem" ALTER COLUMN "primarySourceId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceItem" ALTER COLUMN "canonicalOfficialUrl" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceAnalysisRevision" ADD COLUMN "contentKind" varchar DEFAULT 'ai_analysis' NOT NULL;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceAnalysisRevision" ADD COLUMN "humanContent" json;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceAnalysisRevision" ADD COLUMN "baseRevisionId" uuid;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceAnalysisRevision" ADD COLUMN "aiDecision" json;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceAnalysisRevision" ADD COLUMN "overrideReason" text;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceAnalysisRevision" ADD COLUMN "idempotencyKey" varchar(80);--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceAnalysisRevision" ADD COLUMN "createdByUserId" uuid;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceItem" ADD COLUMN "origin" varchar DEFAULT 'automated' NOT NULL;--> statement-breakpoint
ALTER TABLE "PolicyIntelligenceItem" ADD COLUMN "createdByUserId" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyEditorGrant" ADD CONSTRAINT "PolicyEditorGrant_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyEditorGrant" ADD CONSTRAINT "PolicyEditorGrant_grantedByUserId_User_id_fk" FOREIGN KEY ("grantedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyEditorGrant" ADD CONSTRAINT "PolicyEditorGrant_revokedByUserId_User_id_fk" FOREIGN KEY ("revokedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceEditorialEvent" ADD CONSTRAINT "PolicyIntelligenceEditorialEvent_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceEditorialEvent" ADD CONSTRAINT "PolicyIntelligenceEditorialEvent_itemId_PolicyIntelligenceItem_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."PolicyIntelligenceItem"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceEditorialEvent" ADD CONSTRAINT "PolicyIntelligenceEditorialEvent_revisionId_PolicyIntelligenceAnalysisRevision_id_fk" FOREIGN KEY ("revisionId") REFERENCES "public"."PolicyIntelligenceAnalysisRevision"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceOperatorSubmission" ADD CONSTRAINT "PolicyIntelligenceOperatorSubmission_submittedByUserId_User_id_fk" FOREIGN KEY ("submittedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "PolicyEditorGrant_user_unique" ON "PolicyEditorGrant" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyEditorGrant_active_idx" ON "PolicyEditorGrant" USING btree ("revokedAt","updatedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceEditorialEvent_item_created_idx" ON "PolicyIntelligenceEditorialEvent" USING btree ("itemId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceEditorialEvent_actor_created_idx" ON "PolicyIntelligenceEditorialEvent" USING btree ("actorUserId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceOperatorSubmission_status_created_idx" ON "PolicyIntelligenceOperatorSubmission" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceOperatorSubmission_url_idx" ON "PolicyIntelligenceOperatorSubmission" USING btree ("submittedUrl");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceAnalysisRevision" ADD CONSTRAINT "PolicyIntelligenceAnalysisRevision_baseRevisionId_PolicyIntelligenceAnalysisRevision_id_fk" FOREIGN KEY ("baseRevisionId") REFERENCES "public"."PolicyIntelligenceAnalysisRevision"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceAnalysisRevision" ADD CONSTRAINT "PolicyIntelligenceAnalysisRevision_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PolicyIntelligenceItem" ADD CONSTRAINT "PolicyIntelligenceItem_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "PolicyIntelligenceAnalysisRevision_item_idempotency_unique" ON "PolicyIntelligenceAnalysisRevision" USING btree ("itemId","idempotencyKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PolicyIntelligenceAnalysisRevision_content_kind_idx" ON "PolicyIntelligenceAnalysisRevision" USING btree ("itemId","contentKind","revisionNumber");