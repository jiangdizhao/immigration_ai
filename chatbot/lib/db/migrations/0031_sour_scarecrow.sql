CREATE TABLE IF NOT EXISTS "ProjectDocumentAsset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"createdByUserId" uuid NOT NULL,
	"lifecycle" varchar DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectDocumentGrant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"assetId" uuid NOT NULL,
	"versionId" uuid NOT NULL,
	"grantorUserId" uuid NOT NULL,
	"grantorAuthorityBasis" varchar(64) NOT NULL,
	"granteeKind" varchar NOT NULL,
	"granteeUserId" uuid,
	"purpose" varchar NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"revokedAt" timestamp,
	"revision" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectDocumentProcessingRun" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"versionId" uuid NOT NULL,
	"generation" integer NOT NULL,
	"operationKind" varchar NOT NULL,
	"providerCode" varchar(64) NOT NULL,
	"providerEventId" varchar(128),
	"initiatedByUserId" uuid,
	"servicePrincipalCode" varchar(64),
	"objectSha256" varchar(64) NOT NULL,
	"status" varchar DEFAULT 'started' NOT NULL,
	"verdict" varchar(64),
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"errorCode" varchar(128)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectDocumentVersion" (
	"projectId" uuid NOT NULL,
	"assetId" uuid NOT NULL,
	"versionId" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"versionNumber" integer NOT NULL,
	"storageKey" varchar(512) NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"byteSize" integer NOT NULL,
	"canonicalMime" varchar(255) NOT NULL,
	"originKind" varchar NOT NULL,
	"sourceChatId" uuid,
	"sourceDocumentId" uuid,
	"sourceSha256" varchar(64),
	"uploadedByUserId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"storageStatus" varchar DEFAULT 'pending' NOT NULL,
	"securityStatus" varchar DEFAULT 'pending' NOT NULL,
	"processingGeneration" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentAsset_project_id_unique" ON "ProjectDocumentAsset" USING btree ("projectId","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentVersion_project_asset_version_unique" ON "ProjectDocumentVersion" USING btree ("projectId","assetId","versionId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentVersion_project_version_sha256_unique" ON "ProjectDocumentVersion" USING btree ("projectId","versionId","sha256");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentAsset" ADD CONSTRAINT "ProjectDocumentAsset_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentAsset" ADD CONSTRAINT "ProjectDocumentAsset_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentGrant" ADD CONSTRAINT "ProjectDocumentGrant_grantorUserId_User_id_fk" FOREIGN KEY ("grantorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentGrant" ADD CONSTRAINT "ProjectDocumentGrant_granteeUserId_User_id_fk" FOREIGN KEY ("granteeUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentGrant" ADD CONSTRAINT "ProjectDocumentGrant_project_asset_fk" FOREIGN KEY ("projectId","assetId") REFERENCES "public"."ProjectDocumentAsset"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentGrant" ADD CONSTRAINT "ProjectDocumentGrant_project_asset_version_fk" FOREIGN KEY ("projectId","assetId","versionId") REFERENCES "public"."ProjectDocumentVersion"("projectId","assetId","versionId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentProcessingRun" ADD CONSTRAINT "ProjectDocumentProcessingRun_initiatedByUserId_User_id_fk" FOREIGN KEY ("initiatedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentProcessingRun" ADD CONSTRAINT "ProjectDocumentProcessingRun_project_version_sha256_fk" FOREIGN KEY ("projectId","versionId","objectSha256") REFERENCES "public"."ProjectDocumentVersion"("projectId","versionId","sha256") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentVersion" ADD CONSTRAINT "ProjectDocumentVersion_uploadedByUserId_User_id_fk" FOREIGN KEY ("uploadedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentVersion" ADD CONSTRAINT "ProjectDocumentVersion_project_asset_fk" FOREIGN KEY ("projectId","assetId") REFERENCES "public"."ProjectDocumentAsset"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectDocumentAsset_project_lifecycle_created_idx" ON "ProjectDocumentAsset" USING btree ("projectId","lifecycle","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentGrant_active_scope_purpose_unique" ON "ProjectDocumentGrant" USING btree ("projectId","assetId","versionId","granteeKind",coalesce("granteeUserId", "projectId"),"purpose") WHERE "ProjectDocumentGrant"."revokedAt" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocRun_project_version_generation_kind_unique" ON "ProjectDocumentProcessingRun" USING btree ("projectId","versionId","generation","operationKind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentProcessingRun_provider_event_unique" ON "ProjectDocumentProcessingRun" USING btree ("providerCode","providerEventId") WHERE "ProjectDocumentProcessingRun"."providerEventId" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentVersion_project_version_unique" ON "ProjectDocumentVersion" USING btree ("projectId","versionId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentVersion_project_asset_number_unique" ON "ProjectDocumentVersion" USING btree ("projectId","assetId","versionNumber");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentVersion_storage_key_unique" ON "ProjectDocumentVersion" USING btree ("storageKey");
--> statement-breakpoint
ALTER TABLE "ProjectDocumentAsset"
  ADD CONSTRAINT "ProjectDocumentAsset_lifecycle_check"
  CHECK ("lifecycle" IN ('active', 'withdrawn', 'deletion_pending', 'deleted'));
--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion"
  ADD CONSTRAINT "ProjectDocumentVersion_version_number_check"
  CHECK ("versionNumber" > 0);
--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion"
  ADD CONSTRAINT "ProjectDocumentVersion_byte_size_check"
  CHECK ("byteSize" > 0);
--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion"
  ADD CONSTRAINT "ProjectDocumentVersion_generation_check"
  CHECK ("processingGeneration" > 0);
--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion"
  ADD CONSTRAINT "ProjectDocumentVersion_storage_key_check"
  CHECK (length(trim("storageKey")) > 0);
--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion"
  ADD CONSTRAINT "ProjectDocumentVersion_sha256_check"
  CHECK ("sha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion"
  ADD CONSTRAINT "ProjectDocumentVersion_source_sha256_check"
  CHECK ("sourceSha256" IS NULL OR "sourceSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion"
  ADD CONSTRAINT "ProjectDocumentVersion_canonical_mime_check"
  CHECK ("canonicalMime" ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$');
--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion"
  ADD CONSTRAINT "ProjectDocumentVersion_origin_kind_check"
  CHECK ("originKind" IN ('direct_upload', 'explicit_chat_import'));
--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion"
  ADD CONSTRAINT "ProjectDocumentVersion_storage_status_check"
  CHECK ("storageStatus" IN ('pending', 'stored', 'failed', 'cleanup_pending'));
--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion"
  ADD CONSTRAINT "ProjectDocumentVersion_security_status_check"
  CHECK ("securityStatus" IN ('pending', 'clean', 'rejected', 'failed'));
--> statement-breakpoint
ALTER TABLE "ProjectDocumentGrant"
  ADD CONSTRAINT "ProjectDocumentGrant_authority_basis_check"
  CHECK (length(trim("grantorAuthorityBasis")) BETWEEN 1 AND 64);
--> statement-breakpoint
ALTER TABLE "ProjectDocumentGrant"
  ADD CONSTRAINT "ProjectDocumentGrant_recipient_shape_check"
  CHECK (("granteeKind" = 'user' AND "granteeUserId" IS NOT NULL) OR ("granteeKind" = 'project' AND "granteeUserId" IS NULL));
--> statement-breakpoint
ALTER TABLE "ProjectDocumentGrant"
  ADD CONSTRAINT "ProjectDocumentGrant_purpose_check"
  CHECK ("purpose" IN ('metadata_read', 'content_read', 'download', 'ai_context', 'future_package'));
--> statement-breakpoint
ALTER TABLE "ProjectDocumentGrant"
  ADD CONSTRAINT "ProjectDocumentGrant_revision_check"
  CHECK ("revision" > 0);
--> statement-breakpoint
ALTER TABLE "ProjectDocumentProcessingRun"
  ADD CONSTRAINT "ProjectDocumentProcessingRun_provider_check"
  CHECK (length(trim("providerCode")) BETWEEN 1 AND 64);
--> statement-breakpoint
ALTER TABLE "ProjectDocumentProcessingRun"
  ADD CONSTRAINT "ProjectDocumentProcessingRun_provider_event_check"
  CHECK ("providerEventId" IS NULL OR length(trim("providerEventId")) BETWEEN 1 AND 128);
--> statement-breakpoint
ALTER TABLE "ProjectDocumentProcessingRun"
  ADD CONSTRAINT "ProjectDocumentProcessingRun_actor_shape_check"
  CHECK (("initiatedByUserId" IS NOT NULL AND "servicePrincipalCode" IS NULL) OR ("initiatedByUserId" IS NULL AND "servicePrincipalCode" IS NOT NULL AND length(trim("servicePrincipalCode")) BETWEEN 1 AND 64));
--> statement-breakpoint
ALTER TABLE "ProjectDocumentProcessingRun"
  ADD CONSTRAINT "ProjectDocumentProcessingRun_object_sha256_check"
  CHECK ("objectSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "ProjectDocumentProcessingRun"
  ADD CONSTRAINT "ProjectDocumentProcessingRun_generation_check"
  CHECK ("generation" > 0);
--> statement-breakpoint
ALTER TABLE "ProjectDocumentProcessingRun"
  ADD CONSTRAINT "ProjectDocumentProcessingRun_kind_check"
  CHECK ("operationKind" IN ('scan', 'extract'));
--> statement-breakpoint
ALTER TABLE "ProjectDocumentProcessingRun"
  ADD CONSTRAINT "ProjectDocumentProcessingRun_status_check"
  CHECK ("status" IN ('started', 'completed', 'failed'));
--> statement-breakpoint
ALTER TABLE "ProjectDocumentProcessingRun"
  ADD CONSTRAINT "ProjectDocumentProcessingRun_verdict_check"
  CHECK ("verdict" IS NULL OR "verdict" ~ '^[a-z][a-z0-9_.-]{0,63}$');
--> statement-breakpoint
ALTER TABLE "ProjectDocumentProcessingRun"
  ADD CONSTRAINT "ProjectDocumentProcessingRun_outcome_check"
  CHECK (
    ("status" = 'started' AND "completedAt" IS NULL AND "verdict" IS NULL AND "errorCode" IS NULL)
    OR ("status" = 'completed' AND "completedAt" IS NOT NULL AND "completedAt" >= "startedAt" AND "verdict" IS NOT NULL AND "errorCode" IS NULL)
    OR ("status" = 'failed' AND "completedAt" IS NOT NULL AND "completedAt" >= "startedAt" AND "verdict" IS NULL AND "errorCode" IS NOT NULL AND length(trim("errorCode")) BETWEEN 1 AND 128)
  );
CREATE FUNCTION "phase13_project_document_asset_identity_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."id" IS DISTINCT FROM NEW."id"
     OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
     OR OLD."createdByUserId" IS DISTINCT FROM NEW."createdByUserId"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Project document asset identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentAsset_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ProjectDocumentAsset_identity_immutable"
  BEFORE UPDATE ON "ProjectDocumentAsset"
  FOR EACH ROW
  EXECUTE FUNCTION "phase13_project_document_asset_identity_immutable"();
--> statement-breakpoint
CREATE FUNCTION "phase13_project_document_version_identity_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."projectId" IS DISTINCT FROM NEW."projectId"
     OR OLD."assetId" IS DISTINCT FROM NEW."assetId"
     OR OLD."versionId" IS DISTINCT FROM NEW."versionId"
     OR OLD."versionNumber" IS DISTINCT FROM NEW."versionNumber"
     OR OLD."storageKey" IS DISTINCT FROM NEW."storageKey"
     OR OLD."sha256" IS DISTINCT FROM NEW."sha256"
     OR OLD."byteSize" IS DISTINCT FROM NEW."byteSize"
     OR OLD."canonicalMime" IS DISTINCT FROM NEW."canonicalMime"
     OR OLD."originKind" IS DISTINCT FROM NEW."originKind"
     OR OLD."sourceChatId" IS DISTINCT FROM NEW."sourceChatId"
     OR OLD."sourceDocumentId" IS DISTINCT FROM NEW."sourceDocumentId"
     OR OLD."sourceSha256" IS DISTINCT FROM NEW."sourceSha256"
     OR OLD."uploadedByUserId" IS DISTINCT FROM NEW."uploadedByUserId"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Project document version identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentVersion_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ProjectDocumentVersion_identity_immutable"
  BEFORE UPDATE ON "ProjectDocumentVersion"
  FOR EACH ROW
  EXECUTE FUNCTION "phase13_project_document_version_identity_immutable"();
--> statement-breakpoint
CREATE FUNCTION "phase13_project_document_grant_identity_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."id" IS DISTINCT FROM NEW."id"
     OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
     OR OLD."assetId" IS DISTINCT FROM NEW."assetId"
     OR OLD."versionId" IS DISTINCT FROM NEW."versionId"
     OR OLD."grantorUserId" IS DISTINCT FROM NEW."grantorUserId"
     OR OLD."grantorAuthorityBasis" IS DISTINCT FROM NEW."grantorAuthorityBasis"
     OR OLD."granteeKind" IS DISTINCT FROM NEW."granteeKind"
     OR OLD."granteeUserId" IS DISTINCT FROM NEW."granteeUserId"
     OR OLD."purpose" IS DISTINCT FROM NEW."purpose"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Project document grant identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentGrant_identity_immutable';
  END IF;
  IF OLD."revokedAt" IS NOT NULL THEN
    IF NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt"
       OR NEW."revision" IS DISTINCT FROM OLD."revision" THEN
      RAISE EXCEPTION 'Project document grant revocation is terminal'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentGrant_revocation_terminal';
    END IF;
  ELSIF NEW."revokedAt" IS NULL THEN
    IF NEW."revision" IS DISTINCT FROM OLD."revision" THEN
      RAISE EXCEPTION 'Project document grant revision changes only on revocation'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentGrant_revision_transition';
    END IF;
  ELSIF NEW."revision" <> OLD."revision" + 1 THEN
    RAISE EXCEPTION 'Project document grant revocation increments revision once'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentGrant_revision_transition';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ProjectDocumentGrant_identity_immutable"
  BEFORE UPDATE ON "ProjectDocumentGrant"
  FOR EACH ROW
  EXECUTE FUNCTION "phase13_project_document_grant_identity_immutable"();
--> statement-breakpoint
CREATE FUNCTION "phase13_project_document_processing_run_identity_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" IN ('completed', 'failed') AND OLD IS DISTINCT FROM NEW THEN
    RAISE EXCEPTION 'Project document processing run terminal state is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentProcessingRun_terminal_immutable';
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id"
     OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
     OR OLD."versionId" IS DISTINCT FROM NEW."versionId"
     OR OLD."generation" IS DISTINCT FROM NEW."generation"
     OR OLD."operationKind" IS DISTINCT FROM NEW."operationKind"
     OR OLD."providerCode" IS DISTINCT FROM NEW."providerCode"
     OR OLD."initiatedByUserId" IS DISTINCT FROM NEW."initiatedByUserId"
     OR OLD."servicePrincipalCode" IS DISTINCT FROM NEW."servicePrincipalCode"
     OR OLD."objectSha256" IS DISTINCT FROM NEW."objectSha256"
     OR OLD."startedAt" IS DISTINCT FROM NEW."startedAt"
     OR (OLD."providerEventId" IS NOT NULL AND OLD."providerEventId" IS DISTINCT FROM NEW."providerEventId") THEN
    RAISE EXCEPTION 'Project document processing run identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentProcessingRun_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ProjectDocumentProcessingRun_identity_immutable"
  BEFORE UPDATE ON "ProjectDocumentProcessingRun"
  FOR EACH ROW
  EXECUTE FUNCTION "phase13_project_document_processing_run_identity_immutable"();
