CREATE TABLE IF NOT EXISTS "ProjectDocumentImportConsent" (
	"operationRecordId" uuid PRIMARY KEY NOT NULL,
	"projectId" uuid NOT NULL,
	"actorUserId" uuid NOT NULL,
	"sourceChatId" uuid NOT NULL,
	"sourceDocumentId" uuid NOT NULL,
	"sourceSha256" varchar(64) NOT NULL,
	"noticeVersion" varchar(128) NOT NULL,
	"acceptedAt" timestamp NOT NULL,
	"accepted" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectDocumentIntent" (
	"operationRecordId" uuid PRIMARY KEY NOT NULL,
	"projectId" uuid NOT NULL,
	"assetId" uuid NOT NULL,
	"versionId" uuid NOT NULL,
	"intentKind" varchar NOT NULL,
	"status" varchar DEFAULT 'intent_created' NOT NULL,
	"generation" integer NOT NULL,
	"errorCode" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ProjectEvent" ALTER COLUMN "actorUserId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ProjectOperation" ALTER COLUMN "actorUserId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ProjectDocumentProcessingRun" ADD COLUMN "eventFingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion" ADD COLUMN "storageObjectVersionId" varchar(256);--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion" ADD COLUMN "storageVerifiedAt" timestamp;--> statement-breakpoint
ALTER TABLE "ProjectEvent" ADD COLUMN "actorKind" varchar DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "ProjectEvent" ADD COLUMN "servicePrincipalCode" varchar(64);--> statement-breakpoint
ALTER TABLE "ProjectOperation" ADD COLUMN "actorKind" varchar DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "ProjectOperation" ADD COLUMN "servicePrincipalCode" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentIntent_project_operation_unique" ON "ProjectDocumentIntent" USING btree ("projectId","operationRecordId");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentImportConsent" ADD CONSTRAINT "ProjectDocumentImportConsent_operationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("operationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentImportConsent" ADD CONSTRAINT "ProjectDocumentImportConsent_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentImportConsent" ADD CONSTRAINT "ProjectDocumentImportConsent_project_intent_fk" FOREIGN KEY ("projectId","operationRecordId") REFERENCES "public"."ProjectDocumentIntent"("projectId","operationRecordId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentIntent" ADD CONSTRAINT "ProjectDocumentIntent_operationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("operationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentIntent" ADD CONSTRAINT "ProjectDocumentIntent_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentIntent" ADD CONSTRAINT "ProjectDocumentIntent_project_asset_version_fk" FOREIGN KEY ("projectId","assetId","versionId") REFERENCES "public"."ProjectDocumentVersion"("projectId","assetId","versionId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentIntent_project_operation_unique" ON "ProjectDocumentIntent" USING btree ("projectId","operationRecordId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentIntent_project_version_unique" ON "ProjectDocumentIntent" USING btree ("projectId","versionId");--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_type_check";--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_result_kind_check";--> statement-breakpoint
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_type_check"
  CHECK ("operationType" IN ('project_create', 'project_close', 'membership_invite', 'membership_accept', 'membership_revoke', 'project_chat_create', 'project_document_upload_intent', 'project_document_import_intent', 'project_document_storage_finalize', 'project_document_storage_fail', 'project_document_scan_finalize', 'project_document_grant_create', 'project_document_grant_revoke', 'project_document_withdraw'));--> statement-breakpoint
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_result_kind_check"
  CHECK ("resultKind" IN ('project', 'membership', 'chat', 'document_asset', 'document_version', 'document_scan_run', 'document_grant'));--> statement-breakpoint
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_actor_shape_check"
  CHECK (("actorKind" = 'user' AND "actorUserId" IS NOT NULL AND "servicePrincipalCode" IS NULL) OR ("actorKind" = 'service' AND "actorUserId" IS NULL AND "servicePrincipalCode" IN ('project_document_storage_worker', 'project_document_scan_worker')));--> statement-breakpoint
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_actor_type_check"
  CHECK (("operationType" IN ('project_create', 'project_close', 'membership_invite', 'membership_accept', 'membership_revoke', 'project_chat_create', 'project_document_upload_intent', 'project_document_import_intent', 'project_document_grant_create', 'project_document_grant_revoke', 'project_document_withdraw') AND "actorKind" = 'user') OR ("operationType" IN ('project_document_storage_finalize', 'project_document_storage_fail') AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_storage_worker' AND "operationId" ~ '^[0-9a-f]{64}$') OR ("operationType" = 'project_document_scan_finalize' AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_scan_worker' AND "operationId" ~ '^[0-9a-f]{64}$'));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectOperation_service_type_operation_unique" ON "ProjectOperation" USING btree ("servicePrincipalCode", "operationType", "operationId") WHERE "actorKind" = 'service';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentIntent_project_operation_unique" ON "ProjectDocumentIntent" USING btree ("projectId","operationRecordId");--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_type_check";--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_subject_check";--> statement-breakpoint
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_type_check"
  CHECK ("eventType" IN ('project_created', 'membership_state_changed', 'project_chat_created', 'project_closed', 'project_document_intent_created', 'project_document_storage_changed', 'project_document_security_changed', 'project_document_grant_changed', 'project_document_withdrawn'));--> statement-breakpoint
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_subject_check"
  CHECK (("subjectKind" IS NULL AND "subjectId" IS NULL) OR ("subjectKind" IS NOT NULL AND "subjectKind" IN ('project', 'membership', 'chat', 'document_asset', 'document_version', 'document_scan_run', 'document_grant') AND "subjectId" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_actor_shape_check"
  CHECK (("actorKind" = 'user' AND "actorUserId" IS NOT NULL AND "servicePrincipalCode" IS NULL) OR ("actorKind" = 'service' AND "actorUserId" IS NULL AND "servicePrincipalCode" IN ('project_document_storage_worker', 'project_document_scan_worker')));--> statement-breakpoint
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_document_subject_check"
  CHECK (("eventType" NOT IN ('project_document_intent_created', 'project_document_storage_changed', 'project_document_security_changed', 'project_document_grant_changed', 'project_document_withdrawn')) OR ("eventType" = 'project_document_intent_created' AND "subjectKind" = 'document_asset') OR ("eventType" = 'project_document_storage_changed' AND "subjectKind" = 'document_version') OR ("eventType" = 'project_document_security_changed' AND "subjectKind" = 'document_scan_run') OR ("eventType" = 'project_document_grant_changed' AND "subjectKind" = 'document_grant') OR ("eventType" = 'project_document_withdrawn' AND "subjectKind" = 'document_asset'));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectEvent_document_operation_unique" ON "ProjectEvent" USING btree ("operationRecordId") WHERE "eventType" LIKE 'project_document_%';--> statement-breakpoint
ALTER TABLE "ProjectDocumentIntent" ADD CONSTRAINT "ProjectDocumentIntent_generation_check" CHECK ("generation" > 0);--> statement-breakpoint
ALTER TABLE "ProjectDocumentIntent" ADD CONSTRAINT "ProjectDocumentIntent_status_check" CHECK ("status" IN ('intent_created', 'stored', 'failed', 'cleanup_pending'));--> statement-breakpoint
ALTER TABLE "ProjectDocumentIntent" ADD CONSTRAINT "ProjectDocumentIntent_kind_check" CHECK ("intentKind" IN ('direct_upload', 'chat_document_import'));--> statement-breakpoint
ALTER TABLE "ProjectDocumentIntent" ADD CONSTRAINT "ProjectDocumentIntent_outcome_check" CHECK (("status" IN ('intent_created', 'stored') AND "errorCode" IS NULL) OR ("status" IN ('failed', 'cleanup_pending') AND "errorCode" IS NOT NULL AND length(trim("errorCode")) BETWEEN 1 AND 64));--> statement-breakpoint
ALTER TABLE "ProjectDocumentIntent" ADD CONSTRAINT "ProjectDocumentIntent_timestamps_check" CHECK ("updatedAt" >= "createdAt");--> statement-breakpoint
ALTER TABLE "ProjectDocumentImportConsent" ADD CONSTRAINT "ProjectDocumentImportConsent_source_sha256_check" CHECK ("sourceSha256" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "ProjectDocumentImportConsent" ADD CONSTRAINT "ProjectDocumentImportConsent_notice_version_check" CHECK (length(trim("noticeVersion")) BETWEEN 1 AND 128);--> statement-breakpoint
ALTER TABLE "ProjectDocumentImportConsent" ADD CONSTRAINT "ProjectDocumentImportConsent_accepted_check" CHECK ("accepted" IS TRUE);--> statement-breakpoint
ALTER TABLE "ProjectDocumentVersion" ADD CONSTRAINT "ProjectDocumentVersion_storage_object_version_shape_check" CHECK (("storageObjectVersionId" IS NULL AND "storageVerifiedAt" IS NULL) OR ("storageObjectVersionId" IS NOT NULL AND length(trim("storageObjectVersionId")) BETWEEN 1 AND 256 AND "storageVerifiedAt" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "ProjectDocumentProcessingRun" ADD CONSTRAINT "ProjectDocumentProcessingRun_event_fingerprint_check" CHECK ("eventFingerprint" IS NULL OR "eventFingerprint" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
CREATE FUNCTION "phase13_project_document_version_storage_object_identity_once"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."storageStatus" IN ('stored', 'failed', 'cleanup_pending')
       OR NEW."storageObjectVersionId" IS NOT NULL
       OR NEW."storageVerifiedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'New document versions must begin with pending storage and no object identity'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentVersion_storage_object_version_once';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."storageObjectVersionId" IS NULL AND NEW."storageObjectVersionId" IS NOT NULL THEN
    IF OLD."storageStatus" <> 'pending'
       OR NEW."storageStatus" <> 'stored'
       OR NEW."storageVerifiedAt" IS NULL THEN
      RAISE EXCEPTION 'Object version identity may be set only while storing a pending version'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentVersion_storage_object_version_once';
    END IF;
  ELSIF OLD."storageObjectVersionId" IS NOT NULL AND
        (OLD."storageObjectVersionId" IS DISTINCT FROM NEW."storageObjectVersionId"
         OR OLD."storageVerifiedAt" IS DISTINCT FROM NEW."storageVerifiedAt") THEN
    RAISE EXCEPTION 'Object version identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentVersion_storage_object_version_once';
  ELSIF OLD."storageObjectVersionId" IS NULL AND NEW."storageVerifiedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Object version verification time requires an object version identity'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentVersion_storage_object_version_once';
  END IF;
  IF OLD."storageStatus" <> 'pending'
     AND OLD."storageStatus" IS DISTINCT FROM NEW."storageStatus" THEN
    RAISE EXCEPTION 'Terminal storage state is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentVersion_storage_object_version_once';
  END IF;
  IF OLD."storageStatus" = 'pending' AND NEW."storageStatus" = 'stored'
     AND NEW."storageObjectVersionId" IS NULL THEN
    RAISE EXCEPTION 'Stored transition requires an immutable object version identity'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentVersion_storage_object_version_once';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ProjectDocumentVersion_storage_object_identity_once"
  BEFORE INSERT OR UPDATE ON "ProjectDocumentVersion"
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_document_version_storage_object_identity_once"();--> statement-breakpoint
CREATE FUNCTION "phase13_project_document_processing_fingerprint_once"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."eventFingerprint" IS NOT NULL
     AND OLD."eventFingerprint" IS DISTINCT FROM NEW."eventFingerprint" THEN
    RAISE EXCEPTION 'Processing event fingerprint is immutable once assigned'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentProcessingRun_event_fingerprint_once';
  END IF;
  IF OLD."eventFingerprint" IS NULL AND NEW."eventFingerprint" IS NOT NULL
     AND OLD."status" <> 'started' THEN
    RAISE EXCEPTION 'Processing event fingerprint must be assigned before terminal state'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentProcessingRun_event_fingerprint_once';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ProjectDocumentProcessingRun_event_fingerprint_once"
  BEFORE UPDATE ON "ProjectDocumentProcessingRun"
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_document_processing_fingerprint_once"();--> statement-breakpoint
CREATE FUNCTION "phase13_project_document_intent_transition_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."operationRecordId" IS DISTINCT FROM NEW."operationRecordId"
     OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
     OR OLD."assetId" IS DISTINCT FROM NEW."assetId"
     OR OLD."versionId" IS DISTINCT FROM NEW."versionId"
     OR OLD."intentKind" IS DISTINCT FROM NEW."intentKind"
     OR OLD."generation" IS DISTINCT FROM NEW."generation"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Project document intent identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentIntent_identity_immutable';
  END IF;
  IF OLD."status" <> NEW."status" AND
     (OLD."status" <> 'intent_created' OR NEW."status" NOT IN ('stored', 'failed', 'cleanup_pending')) THEN
    RAISE EXCEPTION 'Project document intent transition is invalid'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentIntent_status_transition';
  END IF;
  IF OLD."status" <> 'intent_created' AND
     (OLD."status" IS DISTINCT FROM NEW."status" OR OLD."errorCode" IS DISTINCT FROM NEW."errorCode") THEN
    RAISE EXCEPTION 'Terminal project document intent is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentIntent_status_transition';
  END IF;
  IF NEW."updatedAt" < OLD."updatedAt" THEN
    RAISE EXCEPTION 'Project document intent timestamp cannot move backwards'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentIntent_timestamp_monotonic';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ProjectDocumentIntent_transition_guard"
  BEFORE UPDATE ON "ProjectDocumentIntent"
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_document_intent_transition_guard"();--> statement-breakpoint
CREATE FUNCTION "phase13_project_document_import_consent_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  op "ProjectOperation"%ROWTYPE;
  intent "ProjectDocumentIntent"%ROWTYPE;
  version "ProjectDocumentVersion"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Project document import consent is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentImportConsent_immutable';
  END IF;
  SELECT * INTO op FROM "ProjectOperation" WHERE "id" = NEW."operationRecordId";
  SELECT * INTO intent FROM "ProjectDocumentIntent" WHERE "operationRecordId" = NEW."operationRecordId";
  IF NOT FOUND OR op."operationType" <> 'project_document_import_intent'
     OR op."actorKind" <> 'user' OR op."actorUserId" IS DISTINCT FROM NEW."actorUserId"
     OR op."resultKind" <> 'document_asset' OR op."resultId" IS DISTINCT FROM intent."assetId"
     OR NEW."projectId" IS DISTINCT FROM intent."projectId"
     OR intent."intentKind" <> 'chat_document_import' THEN
    RAISE EXCEPTION 'Import consent does not match its user import operation and intent'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentImportConsent_operation_match';
  END IF;
  SELECT * INTO version FROM "ProjectDocumentVersion"
    WHERE "projectId" = intent."projectId" AND "assetId" = intent."assetId"
      AND "versionId" = intent."versionId";
  IF NOT FOUND OR version."sourceChatId" IS DISTINCT FROM NEW."sourceChatId"
     OR version."sourceDocumentId" IS DISTINCT FROM NEW."sourceDocumentId"
     OR version."sourceSha256" IS DISTINCT FROM NEW."sourceSha256"
     OR version."sha256" IS DISTINCT FROM NEW."sourceSha256" THEN
    RAISE EXCEPTION 'Import consent does not match the exact imported source identity'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentImportConsent_source_match';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ProjectDocumentImportConsent_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "ProjectDocumentImportConsent"
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_document_import_consent_guard"();--> statement-breakpoint
CREATE FUNCTION "phase13_project_event_actor_and_document_binding"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  op "ProjectOperation"%ROWTYPE;
  target_project_id uuid;
  current_revision integer;
BEGIN
  IF NEW."eventType" NOT LIKE 'project_document_%' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO op FROM "ProjectOperation" WHERE "id" = NEW."operationRecordId";
  IF NOT FOUND OR NEW."actorKind" IS DISTINCT FROM op."actorKind"
     OR NEW."actorUserId" IS DISTINCT FROM op."actorUserId"
     OR NEW."servicePrincipalCode" IS DISTINCT FROM op."servicePrincipalCode" THEN
    RAISE EXCEPTION 'ProjectEvent actor must match its ProjectOperation actor'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectEvent_operation_actor_match';
  END IF;
  SELECT "revision" INTO current_revision FROM "StudyJourneyProject"
    WHERE "id" = NEW."projectId";
  IF current_revision IS DISTINCT FROM NEW."projectRevision" THEN
    RAISE EXCEPTION 'ProjectEvent revision must match the current Project revision'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectEvent_current_revision_match';
  END IF;
  IF NEW."eventType" = 'project_document_intent_created' THEN
    IF op."operationType" NOT IN ('project_document_upload_intent', 'project_document_import_intent')
       OR op."resultKind" <> 'document_asset' OR op."resultId" IS DISTINCT FROM NEW."subjectId" THEN
      RAISE EXCEPTION 'Intent event does not match its typed operation result'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectEvent_document_operation_match';
    END IF;
    SELECT "projectId" INTO target_project_id FROM "ProjectDocumentIntent"
      WHERE "operationRecordId" = op."id" AND "assetId" = NEW."subjectId";
  ELSIF NEW."eventType" = 'project_document_storage_changed' THEN
    IF op."operationType" NOT IN ('project_document_storage_finalize', 'project_document_storage_fail')
       OR op."resultKind" <> 'document_version' OR op."resultId" IS DISTINCT FROM NEW."subjectId" THEN
      RAISE EXCEPTION 'Storage event does not match its typed operation result'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectEvent_document_operation_match';
    END IF;
    SELECT "projectId" INTO target_project_id FROM "ProjectDocumentVersion"
      WHERE "versionId" = NEW."subjectId";
  ELSIF NEW."eventType" = 'project_document_security_changed' THEN
    IF op."operationType" <> 'project_document_scan_finalize'
       OR op."resultKind" <> 'document_scan_run' OR op."resultId" IS DISTINCT FROM NEW."subjectId" THEN
      RAISE EXCEPTION 'Security event does not match its typed operation result'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectEvent_document_operation_match';
    END IF;
    SELECT "projectId" INTO target_project_id FROM "ProjectDocumentProcessingRun"
      WHERE "id" = NEW."subjectId";
  ELSIF NEW."eventType" = 'project_document_grant_changed' THEN
    IF op."operationType" NOT IN ('project_document_grant_create', 'project_document_grant_revoke')
       OR op."resultKind" <> 'document_grant' OR op."resultId" IS DISTINCT FROM NEW."subjectId" THEN
      RAISE EXCEPTION 'Grant event does not match its typed operation result'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectEvent_document_operation_match';
    END IF;
    SELECT "projectId" INTO target_project_id FROM "ProjectDocumentGrant"
      WHERE "id" = NEW."subjectId";
  ELSIF NEW."eventType" = 'project_document_withdrawn' THEN
    IF op."operationType" <> 'project_document_withdraw'
       OR op."resultKind" <> 'document_asset' OR op."resultId" IS DISTINCT FROM NEW."subjectId" THEN
      RAISE EXCEPTION 'Withdrawal event does not match its typed operation result'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectEvent_document_operation_match';
    END IF;
    SELECT "projectId" INTO target_project_id FROM "ProjectDocumentAsset"
      WHERE "id" = NEW."subjectId";
  END IF;
  IF NEW."eventType" LIKE 'project_document_%'
     AND target_project_id IS DISTINCT FROM NEW."projectId" THEN
    RAISE EXCEPTION 'ProjectEvent subject must belong to the same Project'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectEvent_document_project_match';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ProjectEvent_actor_and_document_binding"
  BEFORE INSERT OR UPDATE ON "ProjectEvent"
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_event_actor_and_document_binding"();--> statement-breakpoint
CREATE FUNCTION "phase13_project_document_operation_complete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_count integer;
  intent "ProjectDocumentIntent"%ROWTYPE;
BEGIN
  IF NEW."operationType" NOT LIKE 'project_document_%' THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO event_count FROM "ProjectEvent"
    WHERE "operationRecordId" = NEW."id" AND "eventType" LIKE 'project_document_%';
  IF event_count <> 1 THEN
    RAISE EXCEPTION 'A document operation must commit exactly one document event'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectOperation_document_event_required';
  END IF;
  IF NEW."operationType" IN ('project_document_upload_intent', 'project_document_import_intent') THEN
    SELECT * INTO intent FROM "ProjectDocumentIntent" WHERE "operationRecordId" = NEW."id";
    IF NOT FOUND OR NEW."resultKind" <> 'document_asset' OR NEW."resultId" IS DISTINCT FROM intent."assetId"
       OR (NEW."operationType" = 'project_document_upload_intent' AND intent."intentKind" <> 'direct_upload')
       OR (NEW."operationType" = 'project_document_import_intent' AND (intent."intentKind" <> 'chat_document_import' OR NOT EXISTS (SELECT 1 FROM "ProjectDocumentImportConsent" WHERE "operationRecordId" = NEW."id"))) THEN
      RAISE EXCEPTION 'Document intent operation is incomplete'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectOperation_document_result_required';
    END IF;
  ELSIF NEW."operationType" IN ('project_document_storage_finalize', 'project_document_storage_fail') THEN
    IF NEW."resultKind" <> 'document_version' OR NOT EXISTS (
      SELECT 1 FROM "ProjectDocumentIntent" i
      WHERE i."versionId" = NEW."resultId" AND i."projectId" = (
        SELECT v."projectId" FROM "ProjectDocumentVersion" v WHERE v."versionId" = NEW."resultId"
      )
    ) THEN
      RAISE EXCEPTION 'Storage operation has no matching durable intent'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectOperation_document_result_required';
    END IF;
  ELSIF NEW."operationType" = 'project_document_scan_finalize' THEN
    IF NEW."resultKind" <> 'document_scan_run' OR NOT EXISTS (
      SELECT 1 FROM "ProjectDocumentProcessingRun" WHERE "id" = NEW."resultId"
        AND "operationKind" = 'scan' AND "status" IN ('completed', 'failed')
    ) THEN
      RAISE EXCEPTION 'Scan operation has no matching terminal scan run'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectOperation_document_result_required';
    END IF;
  ELSIF NEW."operationType" IN ('project_document_grant_create', 'project_document_grant_revoke') THEN
    IF NEW."resultKind" <> 'document_grant' OR NOT EXISTS (
      SELECT 1 FROM "ProjectDocumentGrant" WHERE "id" = NEW."resultId"
        AND ((NEW."operationType" = 'project_document_grant_create' AND "revokedAt" IS NULL)
          OR (NEW."operationType" = 'project_document_grant_revoke' AND "revokedAt" IS NOT NULL))
    ) THEN
      RAISE EXCEPTION 'Grant operation has no matching grant state'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectOperation_document_result_required';
    END IF;
  ELSIF NEW."operationType" = 'project_document_withdraw' THEN
    IF NEW."resultKind" <> 'document_asset' OR NOT EXISTS (
      SELECT 1 FROM "ProjectDocumentAsset" WHERE "id" = NEW."resultId" AND "lifecycle" = 'withdrawn'
    ) THEN
      RAISE EXCEPTION 'Withdrawal operation has no withdrawn asset'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectOperation_document_result_required';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ProjectOperation_document_complete"
  AFTER INSERT ON "ProjectOperation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_document_operation_complete"();
--> statement-breakpoint
CREATE FUNCTION "phase13_project_document_security_transition_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."securityStatus" IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'Project document versions must begin with pending security'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentVersion_security_status_terminal';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."securityStatus" IS DISTINCT FROM 'pending'
     AND OLD."securityStatus" IS DISTINCT FROM NEW."securityStatus" THEN
    RAISE EXCEPTION 'Terminal project document security state is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentVersion_security_status_terminal';
  END IF;
  IF OLD."securityStatus" = 'pending'
     AND NEW."securityStatus" IS DISTINCT FROM 'pending' THEN
    IF NEW."storageStatus" <> 'stored'
       OR NEW."storageObjectVersionId" IS NULL
       OR NEW."storageVerifiedAt" IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM "ProjectDocumentProcessingRun" run
         WHERE run."projectId" = NEW."projectId"
           AND run."versionId" = NEW."versionId"
           AND run."generation" = NEW."processingGeneration"
           AND run."operationKind" = 'scan'
           AND run."objectSha256" = NEW."sha256"
           AND run."eventFingerprint" ~ '^[0-9a-f]{64}$'
           AND run."initiatedByUserId" IS NULL
           AND run."servicePrincipalCode" = 'project_document_scan_worker'
           AND (
             (NEW."securityStatus" = 'clean' AND run."status" = 'completed' AND run."verdict" = 'clean' AND run."errorCode" IS NULL)
             OR (NEW."securityStatus" = 'rejected' AND run."status" = 'completed' AND run."verdict" = 'rejected' AND run."errorCode" IS NULL)
             OR (NEW."securityStatus" = 'failed' AND run."status" = 'failed' AND run."verdict" IS NULL AND run."errorCode" IS NOT NULL)
           )
       ) THEN
      RAISE EXCEPTION 'Terminal project document security state requires a matching completed scan run'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentVersion_security_scan_provenance';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ProjectDocumentVersion_security_transition_guard"
  BEFORE INSERT OR UPDATE ON "ProjectDocumentVersion"
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_document_security_transition_guard"();--> statement-breakpoint
CREATE FUNCTION "phase13_project_document_security_scan_provenance"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."securityStatus" = 'pending' THEN
    RETURN NULL;
  END IF;
  IF NEW."storageStatus" <> 'stored'
     OR NEW."storageObjectVersionId" IS NULL
     OR NEW."storageVerifiedAt" IS NULL THEN
    RAISE EXCEPTION 'Terminal project document security state requires verified stored object identity'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentVersion_security_scan_provenance';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "ProjectDocumentProcessingRun" run
    JOIN "ProjectOperation" operation
      ON operation."resultId" = run."id"
     AND operation."operationType" = 'project_document_scan_finalize'
     AND operation."resultKind" = 'document_scan_run'
     AND operation."actorKind" = 'service'
     AND operation."actorUserId" IS NULL
     AND operation."servicePrincipalCode" = 'project_document_scan_worker'
    JOIN "ProjectEvent" event
      ON event."operationRecordId" = operation."id"
     AND event."projectId" = run."projectId"
     AND event."eventType" = 'project_document_security_changed'
     AND event."subjectKind" = 'document_scan_run'
     AND event."subjectId" = run."id"
     AND event."actorKind" = 'service'
     AND event."actorUserId" IS NULL
     AND event."servicePrincipalCode" = 'project_document_scan_worker'
    WHERE run."projectId" = NEW."projectId"
      AND run."versionId" = NEW."versionId"
      AND run."generation" = NEW."processingGeneration"
      AND run."operationKind" = 'scan'
      AND run."objectSha256" = NEW."sha256"
      AND run."eventFingerprint" ~ '^[0-9a-f]{64}$'
      AND run."initiatedByUserId" IS NULL
      AND run."servicePrincipalCode" = 'project_document_scan_worker'
      AND (
        (NEW."securityStatus" = 'clean' AND run."status" = 'completed' AND run."verdict" = 'clean' AND run."errorCode" IS NULL)
        OR (NEW."securityStatus" = 'rejected' AND run."status" = 'completed' AND run."verdict" = 'rejected' AND run."errorCode" IS NULL)
        OR (NEW."securityStatus" = 'failed' AND run."status" = 'failed' AND run."verdict" IS NULL AND run."errorCode" IS NOT NULL)
      )
  ) THEN
    RAISE EXCEPTION 'Terminal project document security state requires matching audited scan provenance'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentVersion_security_scan_provenance';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ProjectDocumentVersion_security_scan_provenance"
  AFTER INSERT OR UPDATE ON "ProjectDocumentVersion"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_document_security_scan_provenance"();
