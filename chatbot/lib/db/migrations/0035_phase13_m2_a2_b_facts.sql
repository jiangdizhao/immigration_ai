CREATE TABLE IF NOT EXISTS "ProjectDocumentEvidenceUnit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"assetId" uuid NOT NULL,
	"versionId" uuid NOT NULL,
	"processingRunId" uuid NOT NULL,
	"generation" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"parserVersion" varchar(64) NOT NULL,
	"locator" json NOT NULL,
	"excerpt" text NOT NULL,
	"excerptSha256" varchar(64) NOT NULL,
	"provenance" json NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectEvidenceRef" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"processingRunId" uuid NOT NULL,
	"unitId" uuid NOT NULL,
	"createdByUserId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"revokedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectFactAssertion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"key" varchar(128) NOT NULL,
	"valueType" varchar(16) NOT NULL,
	"value" json NOT NULL,
	"normalizedComparison" varchar(64) NOT NULL,
	"originKind" varchar NOT NULL,
	"state" varchar DEFAULT 'proposed' NOT NULL,
	"createdByUserId" uuid NOT NULL,
	"confirmedByUserId" uuid,
	"effectiveFrom" timestamp,
	"effectiveTo" timestamp,
	"observedAt" timestamp,
	"supersedesAssertionId" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectFactAssertionEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"assertionId" uuid NOT NULL,
	"actorUserId" uuid NOT NULL,
	"operationRecordId" uuid NOT NULL,
	"eventKind" varchar(32) NOT NULL,
	"oldValue" json,
	"newValue" json NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectFactAssertionEvidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"assertionId" uuid NOT NULL,
	"assertionVersion" integer NOT NULL,
	"evidenceRefId" uuid NOT NULL,
	"linkedByUserId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectFactConflict" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"leftAssertionId" uuid NOT NULL,
	"rightAssertionId" uuid NOT NULL,
	"kind" varchar NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"resolvedAt" timestamp,
	"resolvedByUserId" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectFactPublication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"assertionId" uuid NOT NULL,
	"assertionVersion" integer NOT NULL,
	"actorUserId" uuid NOT NULL,
	"audience" varchar NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"revokedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectFactUseGrant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"assertionId" uuid NOT NULL,
	"assertionVersion" integer NOT NULL,
	"actorUserId" uuid NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"audience" varchar NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"revokedAt" timestamp
);
--> statement-breakpoint
DROP INDEX IF EXISTS "ProjectDocRun_project_version_generation_kind_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentEvidenceUnit_project_run_id_unique" ON "ProjectDocumentEvidenceUnit" USING btree ("projectId","processingRunId","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectEvidenceRef_project_id_unique" ON "ProjectEvidenceRef" USING btree ("projectId","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFactAssertion_project_id_unique" ON "ProjectFactAssertion" USING btree ("projectId","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFactAssertion_project_id_version_unique" ON "ProjectFactAssertion" USING btree ("projectId","id","version");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocRun_project_version_generation_id_unique" ON "ProjectDocumentProcessingRun" USING btree ("projectId","versionId","generation","id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentEvidenceUnit" ADD CONSTRAINT "ProjectDocumentEvidenceUnit_project_asset_version_fk" FOREIGN KEY ("projectId","assetId","versionId") REFERENCES "public"."ProjectDocumentVersion"("projectId","assetId","versionId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectDocumentEvidenceUnit" ADD CONSTRAINT "ProjectDocumentEvidenceUnit_run_fk" FOREIGN KEY ("projectId","versionId","generation","processingRunId") REFERENCES "public"."ProjectDocumentProcessingRun"("projectId","versionId","generation","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectEvidenceRef" ADD CONSTRAINT "ProjectEvidenceRef_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectEvidenceRef" ADD CONSTRAINT "ProjectEvidenceRef_unit_fk" FOREIGN KEY ("projectId","processingRunId","unitId") REFERENCES "public"."ProjectDocumentEvidenceUnit"("projectId","processingRunId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactAssertion" ADD CONSTRAINT "ProjectFactAssertion_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactAssertion" ADD CONSTRAINT "ProjectFactAssertion_confirmedByUserId_User_id_fk" FOREIGN KEY ("confirmedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactAssertionEvent" ADD CONSTRAINT "ProjectFactAssertionEvent_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactAssertionEvent" ADD CONSTRAINT "ProjectFactAssertionEvent_operationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("operationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactAssertionEvent" ADD CONSTRAINT "ProjectFactAssertionEvent_assertion_fk" FOREIGN KEY ("projectId","assertionId") REFERENCES "public"."ProjectFactAssertion"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactAssertionEvidence" ADD CONSTRAINT "ProjectFactAssertionEvidence_linkedByUserId_User_id_fk" FOREIGN KEY ("linkedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactAssertionEvidence" ADD CONSTRAINT "ProjectFactAssertionEvidence_assertion_fk" FOREIGN KEY ("projectId","assertionId","assertionVersion") REFERENCES "public"."ProjectFactAssertion"("projectId","id","version") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactAssertionEvidence" ADD CONSTRAINT "ProjectFactAssertionEvidence_evidence_fk" FOREIGN KEY ("projectId","evidenceRefId") REFERENCES "public"."ProjectEvidenceRef"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactConflict" ADD CONSTRAINT "ProjectFactConflict_resolvedByUserId_User_id_fk" FOREIGN KEY ("resolvedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactConflict" ADD CONSTRAINT "ProjectFactConflict_left_assertion_fk" FOREIGN KEY ("projectId","leftAssertionId") REFERENCES "public"."ProjectFactAssertion"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactConflict" ADD CONSTRAINT "ProjectFactConflict_right_assertion_fk" FOREIGN KEY ("projectId","rightAssertionId") REFERENCES "public"."ProjectFactAssertion"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactPublication" ADD CONSTRAINT "ProjectFactPublication_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactPublication" ADD CONSTRAINT "ProjectFactPublication_assertion_fk" FOREIGN KEY ("projectId","assertionId","assertionVersion") REFERENCES "public"."ProjectFactAssertion"("projectId","id","version") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactUseGrant" ADD CONSTRAINT "ProjectFactUseGrant_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectFactUseGrant" ADD CONSTRAINT "ProjectFactUseGrant_assertion_fk" FOREIGN KEY ("projectId","assertionId","assertionVersion") REFERENCES "public"."ProjectFactAssertion"("projectId","id","version") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentEvidenceUnit_project_run_ordinal_unique" ON "ProjectDocumentEvidenceUnit" USING btree ("projectId","processingRunId","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectEvidenceRef_active_unit_unique" ON "ProjectEvidenceRef" USING btree ("projectId","unitId") WHERE "ProjectEvidenceRef"."revokedAt" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectEvidenceRef_project_created_idx" ON "ProjectEvidenceRef" USING btree ("projectId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectFactAssertion_project_key_created_idx" ON "ProjectFactAssertion" USING btree ("projectId","key","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFactAssertionEvent_operation_unique" ON "ProjectFactAssertionEvent" USING btree ("operationRecordId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFactAssertionEvidence_assertion_ref_unique" ON "ProjectFactAssertionEvidence" USING btree ("assertionId","assertionVersion","evidenceRefId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFactConflict_pair_unique" ON "ProjectFactConflict" USING btree ("projectId","leftAssertionId","rightAssertionId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFactPublication_active_version_unique" ON "ProjectFactPublication" USING btree ("projectId","assertionId","assertionVersion") WHERE "ProjectFactPublication"."active";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFactUseGrant_active_scope_unique" ON "ProjectFactUseGrant" USING btree ("projectId","assertionId","assertionVersion","actorUserId","purpose") WHERE "ProjectFactUseGrant"."revokedAt" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocRun_scan_generation_unique" ON "ProjectDocumentProcessingRun" USING btree ("projectId","versionId","generation") WHERE "ProjectDocumentProcessingRun"."operationKind" = 'scan';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocRun_extract_parser_generation_unique" ON "ProjectDocumentProcessingRun" USING btree ("projectId","versionId","generation","providerCode") WHERE "ProjectDocumentProcessingRun"."operationKind" = 'extract';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocRun_project_version_generation_id_unique" ON "ProjectDocumentProcessingRun" USING btree ("projectId","versionId","generation","id");
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_type_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_type_check" CHECK ("operationType" IN ('project_create','project_close','membership_invite','membership_accept','membership_revoke','project_chat_create','project_document_upload_intent','project_document_import_intent','project_document_storage_finalize','project_document_storage_fail','project_document_scan_finalize','project_document_grant_create','project_document_grant_revoke','project_document_withdraw','project_requirement_state_change','project_evidence_extract','project_fact_mutation'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_result_kind_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_result_kind_check" CHECK ("resultKind" IN ('project','membership','chat','document_asset','document_version','document_scan_run','document_grant','project_requirement_state','document_extraction_run','project_fact_assertion'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_actor_type_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_actor_type_check" CHECK (("operationType" IN ('project_create','project_close','membership_invite','membership_accept','membership_revoke','project_chat_create','project_document_upload_intent','project_document_import_intent','project_document_grant_create','project_document_grant_revoke','project_document_withdraw','project_requirement_state_change','project_evidence_extract','project_fact_mutation') AND "actorKind" = 'user') OR ("operationType" IN ('project_document_storage_finalize','project_document_storage_fail') AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_storage_worker' AND "operationId" ~ '^[0-9a-f]{64}$') OR ("operationType" = 'project_document_scan_finalize' AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_scan_worker' AND "operationId" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_type_check";
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_type_check" CHECK ("eventType" IN ('project_created','membership_state_changed','project_chat_created','project_closed','project_document_intent_created','project_document_storage_changed','project_document_security_changed','project_document_grant_changed','project_document_withdrawn','project_requirement_state_changed','project_evidence_extraction_completed','project_fact_changed'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_subject_check";
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_subject_check" CHECK (("subjectKind" IS NULL AND "subjectId" IS NULL) OR ("subjectKind" IN ('project','membership','chat','document_asset','document_version','document_scan_run','document_grant','requirement_state','document_extraction_run','project_fact_assertion') AND "subjectId" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "ProjectDocumentGrant" DROP CONSTRAINT "ProjectDocumentGrant_purpose_check";
ALTER TABLE "ProjectDocumentGrant" ADD CONSTRAINT "ProjectDocumentGrant_purpose_check" CHECK ("purpose" IN ('metadata_read','content_read','download','extract','ai_context','future_package'));
--> statement-breakpoint
ALTER TABLE "ProjectDocumentEvidenceUnit" ADD CONSTRAINT "ProjectDocumentEvidenceUnit_ordinal_check" CHECK ("ordinal" > 0);
ALTER TABLE "ProjectDocumentEvidenceUnit" ADD CONSTRAINT "ProjectDocumentEvidenceUnit_excerpt_check" CHECK (length("excerpt") BETWEEN 1 AND 2000);
ALTER TABLE "ProjectDocumentEvidenceUnit" ADD CONSTRAINT "ProjectDocumentEvidenceUnit_excerpt_sha256_check" CHECK ("excerptSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "ProjectFactAssertion" ADD CONSTRAINT "ProjectFactAssertion_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_.-]{0,127}$');
ALTER TABLE "ProjectFactAssertion" ADD CONSTRAINT "ProjectFactAssertion_value_type_check" CHECK ("valueType" IN ('string','number','boolean','date','json'));
ALTER TABLE "ProjectFactAssertion" ADD CONSTRAINT "ProjectFactAssertion_state_check" CHECK ("state" IN ('proposed','customer_confirmed','rejected','disputed','stale','superseded'));
ALTER TABLE "ProjectFactAssertion" ADD CONSTRAINT "ProjectFactAssertion_version_check" CHECK ("version" > 0);
ALTER TABLE "ProjectFactAssertion" ADD CONSTRAINT "ProjectFactAssertion_normalized_check" CHECK ("normalizedComparison" ~ '^[0-9a-f]{64}$');
ALTER TABLE "ProjectFactAssertion" ADD CONSTRAINT "ProjectFactAssertion_value_size_check" CHECK (octet_length("value"::text) <= 8192);
ALTER TABLE "ProjectFactAssertion" ADD CONSTRAINT "ProjectFactAssertion_dates_check" CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");
--> statement-breakpoint
ALTER TABLE "ProjectFactAssertionEvidence" ADD CONSTRAINT "ProjectFactAssertionEvidence_version_check" CHECK ("assertionVersion" > 0);
ALTER TABLE "ProjectFactAssertionEvent" ADD CONSTRAINT "ProjectFactAssertionEvent_kind_check" CHECK ("eventKind" IN ('proposed','confirmed','rejected','disputed','published','grant_created','grant_revoked','superseded','stale'));
ALTER TABLE "ProjectFactPublication" ADD CONSTRAINT "ProjectFactPublication_audience_check" CHECK ("audience" IN ('actor_only','project') AND "assertionVersion" > 0);
ALTER TABLE "ProjectFactUseGrant" ADD CONSTRAINT "ProjectFactUseGrant_audience_check" CHECK ("audience" IN ('actor_only','project') AND "assertionVersion" > 0);
ALTER TABLE "ProjectFactConflict" ADD CONSTRAINT "ProjectFactConflict_kind_check" CHECK ("kind" IN ('conflict','possible_conflict') AND "leftAssertionId" <> "rightAssertionId");
--> statement-breakpoint
CREATE FUNCTION "phase13_round2_fact_assertion_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Project fact assertions cannot be deleted' USING ERRCODE='23514', CONSTRAINT='ProjectFactAssertion_delete_protected';
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id" OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
    OR OLD."key" IS DISTINCT FROM NEW."key" OR OLD."valueType" IS DISTINCT FROM NEW."valueType"
    OR OLD."value"::text IS DISTINCT FROM NEW."value"::text OR OLD."normalizedComparison" IS DISTINCT FROM NEW."normalizedComparison"
    OR OLD."originKind" IS DISTINCT FROM NEW."originKind" OR OLD."createdByUserId" IS DISTINCT FROM NEW."createdByUserId"
    OR OLD."effectiveFrom" IS DISTINCT FROM NEW."effectiveFrom" OR OLD."effectiveTo" IS DISTINCT FROM NEW."effectiveTo"
    OR OLD."observedAt" IS DISTINCT FROM NEW."observedAt" OR OLD."supersedesAssertionId" IS DISTINCT FROM NEW."supersedesAssertionId"
    OR NEW."version" IS DISTINCT FROM OLD."version" THEN
    RAISE EXCEPTION 'Project fact assertion payload is immutable' USING ERRCODE='23514', CONSTRAINT='ProjectFactAssertion_immutable';
  END IF;
  IF NOT ((OLD."state"='proposed' AND NEW."state" IN ('customer_confirmed','rejected','disputed','stale','superseded'))
      OR (OLD."state"='customer_confirmed' AND NEW."state" IN ('disputed','stale','superseded'))
      OR (OLD."state"=NEW."state" AND OLD."stale" IS DISTINCT FROM NEW."stale")) THEN
    RAISE EXCEPTION 'Invalid Project fact transition' USING ERRCODE='23514', CONSTRAINT='ProjectFactAssertion_transition';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "ProjectFactAssertion_immutable_guard" BEFORE UPDATE OR DELETE ON "ProjectFactAssertion" FOR EACH ROW EXECUTE FUNCTION "phase13_round2_fact_assertion_immutable"();
CREATE FUNCTION "phase13_round2_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Project fact audit rows are append only' USING ERRCODE='23514', CONSTRAINT='ProjectFact_audit_immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER "ProjectFactAssertionEvent_append_only" BEFORE UPDATE OR DELETE ON "ProjectFactAssertionEvent" FOR EACH ROW EXECUTE FUNCTION "phase13_round2_append_only"();
CREATE FUNCTION "phase13_round2_revocation_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Project fact grants/publications cannot be deleted' USING ERRCODE='23514', CONSTRAINT='ProjectFact_revocation_delete_protected'; END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id" OR OLD."projectId" IS DISTINCT FROM NEW."projectId" OR OLD."assertionId" IS DISTINCT FROM NEW."assertionId" OR OLD."assertionVersion" IS DISTINCT FROM NEW."assertionVersion" OR OLD."actorUserId" IS DISTINCT FROM NEW."actorUserId" OR OLD."audience" IS DISTINCT FROM NEW."audience" OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Project fact publication/grant identity is immutable' USING ERRCODE='23514', CONSTRAINT='ProjectFact_revocation_immutable';
  END IF;
  IF TG_TABLE_NAME = 'ProjectFactPublication' AND NOT ((to_jsonb(OLD)->>'active') = 'true' AND (to_jsonb(NEW)->>'active') = 'false' AND OLD."revokedAt" IS NULL AND NEW."revokedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Invalid publication revocation' USING ERRCODE='23514', CONSTRAINT='ProjectFactPublication_revoke_once'; END IF;
  IF TG_TABLE_NAME = 'ProjectFactUseGrant' AND NOT (OLD."revokedAt" IS NULL AND NEW."revokedAt" IS NOT NULL) THEN RAISE EXCEPTION 'AI-use grants can only be revoked once' USING ERRCODE='23514', CONSTRAINT='ProjectFactUseGrant_revoke_once'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "ProjectFactPublication_revoke_guard" BEFORE UPDATE OR DELETE ON "ProjectFactPublication" FOR EACH ROW EXECUTE FUNCTION "phase13_round2_revocation_guard"();
CREATE TRIGGER "ProjectFactUseGrant_revoke_guard" BEFORE UPDATE OR DELETE ON "ProjectFactUseGrant" FOR EACH ROW EXECUTE FUNCTION "phase13_round2_revocation_guard"();
CREATE TRIGGER "ProjectFactConflict_append_only" BEFORE UPDATE OR DELETE ON "ProjectFactConflict" FOR EACH ROW EXECUTE FUNCTION "phase13_round2_append_only"();
--> statement-breakpoint
CREATE FUNCTION "phase13_round2_operation_event_binding"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op "ProjectOperation"%ROWTYPE; target_project uuid;
BEGIN
  SELECT * INTO op FROM "ProjectOperation" WHERE "id"=NEW."operationRecordId";
  IF NOT FOUND OR op."actorKind" <> 'user' OR op."actorUserId" IS DISTINCT FROM NEW."actorUserId" THEN
    RAISE EXCEPTION 'Round 2 event actor must match operation' USING ERRCODE='23514', CONSTRAINT='ProjectRound2Event_actor_match';
  END IF;
  IF NEW."eventType"='project_evidence_extraction_completed' THEN
    IF op."operationType" <> 'project_evidence_extract' OR op."resultKind" <> 'document_extraction_run' OR op."resultId" IS DISTINCT FROM NEW."subjectId" OR NEW."subjectKind" <> 'document_extraction_run' THEN
      RAISE EXCEPTION 'Evidence event does not match operation result' USING ERRCODE='23514', CONSTRAINT='ProjectEvidenceEvent_operation_match';
    END IF;
    SELECT "projectId" INTO target_project FROM "ProjectDocumentProcessingRun" WHERE "id"=NEW."subjectId" AND "operationKind"='extract';
  ELSIF NEW."eventType"='project_fact_changed' THEN
    IF op."operationType" <> 'project_fact_mutation' OR op."resultKind" <> 'project_fact_assertion' OR op."resultId" IS DISTINCT FROM NEW."subjectId" OR NEW."subjectKind" <> 'project_fact_assertion' THEN
      RAISE EXCEPTION 'Fact event does not match operation result' USING ERRCODE='23514', CONSTRAINT='ProjectFactEvent_operation_match';
    END IF;
    SELECT "projectId" INTO target_project FROM "ProjectFactAssertion" WHERE "id"=NEW."subjectId";
  ELSE
    RETURN NEW;
  END IF;
  IF target_project IS DISTINCT FROM NEW."projectId" THEN
    RAISE EXCEPTION 'Round 2 event subject belongs to another Project' USING ERRCODE='23514', CONSTRAINT='ProjectRound2Event_project_match';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "ProjectRound2Event_binding" BEFORE INSERT ON "ProjectEvent" FOR EACH ROW EXECUTE FUNCTION "phase13_round2_operation_event_binding"();
CREATE FUNCTION "phase13_round2_operation_complete"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_count integer;
BEGIN
  IF NEW."operationType" NOT IN ('project_evidence_extract','project_fact_mutation') THEN RETURN NULL; END IF;
  SELECT count(*) INTO event_count FROM "ProjectEvent" WHERE "operationRecordId"=NEW."id" AND "eventType" IN ('project_evidence_extraction_completed','project_fact_changed');
  IF event_count <> 1 THEN RAISE EXCEPTION 'Round 2 operation requires exactly one Project event' USING ERRCODE='23514', CONSTRAINT='ProjectRound2Operation_event_required'; END IF;
  IF NEW."operationType"='project_evidence_extract' AND (NEW."resultKind" <> 'document_extraction_run' OR NOT EXISTS (SELECT 1 FROM "ProjectDocumentProcessingRun" WHERE "id"=NEW."resultId" AND "operationKind"='extract' AND "status" IN ('completed','failed'))) THEN
    RAISE EXCEPTION 'Extraction operation requires terminal extraction run' USING ERRCODE='23514', CONSTRAINT='ProjectEvidenceOperation_result_required';
  END IF;
  IF NEW."operationType"='project_fact_mutation' AND (NEW."resultKind" <> 'project_fact_assertion' OR NOT EXISTS (SELECT 1 FROM "ProjectFactAssertion" WHERE "id"=NEW."resultId")) THEN
    RAISE EXCEPTION 'Fact operation requires assertion' USING ERRCODE='23514', CONSTRAINT='ProjectFactOperation_result_required';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ProjectRound2Operation_complete" AFTER INSERT ON "ProjectOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "phase13_round2_operation_complete"();

--> statement-breakpoint
CREATE FUNCTION "phase13_round2_fact_supersedes_project_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."supersedesAssertionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ProjectFactAssertion" prior
    WHERE prior."id"=NEW."supersedesAssertionId" AND prior."projectId"=NEW."projectId"
  ) THEN RAISE EXCEPTION 'Fact supersession must reference an existing assertion in the same Project' USING ERRCODE='23514', CONSTRAINT='ProjectFactAssertion_supersedes_project_fk'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "ProjectFactAssertion_supersedes_project_guard" BEFORE INSERT ON "ProjectFactAssertion" FOR EACH ROW EXECUTE FUNCTION "phase13_round2_fact_supersedes_project_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_round2_evidence_unit_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Project document evidence units are immutable' USING ERRCODE='23514', CONSTRAINT='ProjectDocumentEvidenceUnit_immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER "ProjectDocumentEvidenceUnit_immutable_guard" BEFORE UPDATE OR DELETE ON "ProjectDocumentEvidenceUnit" FOR EACH ROW EXECUTE FUNCTION "phase13_round2_evidence_unit_immutable"();
