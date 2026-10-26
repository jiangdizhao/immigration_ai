CREATE TABLE IF NOT EXISTS "ProjectRequirementState" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"templateId" uuid NOT NULL,
	"templateVersionId" uuid NOT NULL,
	"itemKey" varchar(128) NOT NULL,
	"applicability" varchar DEFAULT 'unknown' NOT NULL,
	"collectionState" varchar DEFAULT 'not_started' NOT NULL,
	"factLocator" json,
	"evidenceLocator" json,
	"revision" integer DEFAULT 1 NOT NULL,
	"staleAt" timestamp,
	"createdByUserId" uuid NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectRequirementStateEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"stateId" uuid NOT NULL,
	"actorUserId" uuid,
	"actorBasis" varchar NOT NULL,
	"operationRecordId" uuid NOT NULL,
	"oldValue" json,
	"newValue" json NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "RequirementTemplate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family" varchar NOT NULL,
	"templateKey" varchar(128) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "RequirementTemplateVersion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"templateId" uuid NOT NULL,
	"version" integer NOT NULL,
	"contentHash" varchar(64) NOT NULL,
	"schemaVersion" varchar(64) NOT NULL,
	"items" json NOT NULL,
	"sourceProvenance" json NOT NULL,
	"reviewState" varchar DEFAULT 'draft' NOT NULL,
	"authoredByUserId" uuid,
	"reviewedByUserId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectRequirementState_project_id_unique" ON "ProjectRequirementState" USING btree ("projectId","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "RequirementTemplateVersion_id_template_unique" ON "RequirementTemplateVersion" USING btree ("id","templateId");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectRequirementState" ADD CONSTRAINT "ProjectRequirementState_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectRequirementState" ADD CONSTRAINT "ProjectRequirementState_templateId_RequirementTemplate_id_fk" FOREIGN KEY ("templateId") REFERENCES "public"."RequirementTemplate"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectRequirementState" ADD CONSTRAINT "ProjectRequirementState_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectRequirementState" ADD CONSTRAINT "ProjectRequirementState_template_version_fk" FOREIGN KEY ("templateVersionId","templateId") REFERENCES "public"."RequirementTemplateVersion"("id","templateId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectRequirementStateEvent" ADD CONSTRAINT "ProjectRequirementStateEvent_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectRequirementStateEvent" ADD CONSTRAINT "ProjectRequirementStateEvent_operationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("operationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectRequirementStateEvent" ADD CONSTRAINT "ProjectRequirementStateEvent_state_fk" FOREIGN KEY ("projectId","stateId") REFERENCES "public"."ProjectRequirementState"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "RequirementTemplateVersion" ADD CONSTRAINT "RequirementTemplateVersion_templateId_RequirementTemplate_id_fk" FOREIGN KEY ("templateId") REFERENCES "public"."RequirementTemplate"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "RequirementTemplateVersion" ADD CONSTRAINT "RequirementTemplateVersion_authoredByUserId_User_id_fk" FOREIGN KEY ("authoredByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "RequirementTemplateVersion" ADD CONSTRAINT "RequirementTemplateVersion_reviewedByUserId_User_id_fk" FOREIGN KEY ("reviewedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "RequirementTemplateVersion" ADD CONSTRAINT "RequirementTemplateVersion_template_fk" FOREIGN KEY ("templateId") REFERENCES "public"."RequirementTemplate"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectRequirementState_project_template_item_unique" ON "ProjectRequirementState" USING btree ("projectId","templateVersionId","itemKey");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectRequirementStateEvent_operation_state_unique" ON "ProjectRequirementStateEvent" USING btree ("operationRecordId","stateId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectRequirementStateEvent_project_created_idx" ON "ProjectRequirementStateEvent" USING btree ("projectId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "RequirementTemplate_family_key_unique" ON "RequirementTemplate" USING btree ("family","templateKey");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "RequirementTemplateVersion_template_version_unique" ON "RequirementTemplateVersion" USING btree ("templateId","version");--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_type_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_type_check"
  CHECK ("operationType" IN ('project_create', 'project_close', 'membership_invite', 'membership_accept', 'membership_revoke', 'project_chat_create', 'project_document_upload_intent', 'project_document_import_intent', 'project_document_storage_finalize', 'project_document_storage_fail', 'project_document_scan_finalize', 'project_document_grant_create', 'project_document_grant_revoke', 'project_document_withdraw', 'project_requirement_state_change'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_result_kind_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_result_kind_check"
  CHECK ("resultKind" IN ('project', 'membership', 'chat', 'document_asset', 'document_version', 'document_scan_run', 'document_grant', 'project_requirement_state'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_actor_type_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_actor_type_check"
  CHECK (("operationType" IN ('project_create', 'project_close', 'membership_invite', 'membership_accept', 'membership_revoke', 'project_chat_create', 'project_document_upload_intent', 'project_document_import_intent', 'project_document_grant_create', 'project_document_grant_revoke', 'project_document_withdraw', 'project_requirement_state_change') AND "actorKind" = 'user') OR ("operationType" IN ('project_document_storage_finalize', 'project_document_storage_fail') AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_storage_worker' AND "operationId" ~ '^[0-9a-f]{64}$') OR ("operationType" = 'project_document_scan_finalize' AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_scan_worker' AND "operationId" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_type_check";
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_type_check"
  CHECK ("eventType" IN ('project_created', 'membership_state_changed', 'project_chat_created', 'project_closed', 'project_document_intent_created', 'project_document_storage_changed', 'project_document_security_changed', 'project_document_grant_changed', 'project_document_withdrawn', 'project_requirement_state_changed'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_subject_check";
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_subject_check"
  CHECK (("subjectKind" IS NULL AND "subjectId" IS NULL) OR ("subjectKind" IS NOT NULL AND "subjectKind" IN ('project', 'membership', 'chat', 'document_asset', 'document_version', 'document_scan_run', 'document_grant', 'requirement_state') AND "subjectId" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "RequirementTemplate" ADD CONSTRAINT "RequirementTemplate_family_check"
  CHECK ("family" IN ('school_facts', 'school_evidence', 'student500_facts', 'student500_evidence'));
ALTER TABLE "RequirementTemplate" ADD CONSTRAINT "RequirementTemplate_key_check"
  CHECK (length(trim("templateKey")) BETWEEN 1 AND 128);
ALTER TABLE "RequirementTemplateVersion" ADD CONSTRAINT "RequirementTemplateVersion_version_check"
  CHECK ("version" > 0);
ALTER TABLE "RequirementTemplateVersion" ADD CONSTRAINT "RequirementTemplateVersion_content_hash_check"
  CHECK ("contentHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "RequirementTemplateVersion" ADD CONSTRAINT "RequirementTemplateVersion_schema_version_check"
  CHECK (length(trim("schemaVersion")) BETWEEN 1 AND 64);
ALTER TABLE "RequirementTemplateVersion" ADD CONSTRAINT "RequirementTemplateVersion_review_state_check"
  CHECK ("reviewState" IN ('draft', 'provisional'));
ALTER TABLE "RequirementTemplateVersion" ADD CONSTRAINT "RequirementTemplateVersion_reviewer_unknown_check"
  CHECK ("reviewedByUserId" IS NULL);
--> statement-breakpoint
ALTER TABLE "ProjectRequirementState" ADD CONSTRAINT "ProjectRequirementState_item_key_check"
  CHECK (length(trim("itemKey")) BETWEEN 1 AND 128);
ALTER TABLE "ProjectRequirementState" ADD CONSTRAINT "ProjectRequirementState_applicability_check"
  CHECK ("applicability" IN ('unknown', 'true', 'false'));
ALTER TABLE "ProjectRequirementState" ADD CONSTRAINT "ProjectRequirementState_collection_state_check"
  CHECK ("collectionState" IN ('not_started', 'in_progress', 'evidence_attached', 'needs_review', 'blocked', 'complete'));
ALTER TABLE "ProjectRequirementState" ADD CONSTRAINT "ProjectRequirementState_revision_check"
  CHECK ("revision" > 0);
ALTER TABLE "ProjectRequirementState" ADD CONSTRAINT "ProjectRequirementState_fact_locator_project_check"
  CHECK ("factLocator" IS NULL OR "factLocator"->>'projectId' = "projectId"::text);
ALTER TABLE "ProjectRequirementState" ADD CONSTRAINT "ProjectRequirementState_evidence_locator_project_check"
  CHECK ("evidenceLocator" IS NULL OR "evidenceLocator"->>'projectId' = "projectId"::text);
ALTER TABLE "ProjectRequirementStateEvent" ADD CONSTRAINT "ProjectRequirementStateEvent_actor_shape_check"
  CHECK ("actorUserId" IS NOT NULL AND "actorBasis" IN ('customer_collection_update', 'template_version_invalidation', 'reconciliation'));
--> statement-breakpoint
CREATE FUNCTION "phase13_requirement_template_immutable"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Requirement template identities are immutable'
    USING ERRCODE = '23514', CONSTRAINT = 'RequirementTemplate_immutable';
END;
$$;
CREATE TRIGGER "RequirementTemplate_immutable"
  BEFORE UPDATE OR DELETE ON "RequirementTemplate"
  FOR EACH ROW EXECUTE FUNCTION "phase13_requirement_template_immutable"();
--> statement-breakpoint
CREATE FUNCTION "phase13_requirement_template_version_immutable"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Requirement template versions are immutable'
    USING ERRCODE = '23514', CONSTRAINT = 'RequirementTemplateVersion_immutable';
END;
$$;
CREATE TRIGGER "RequirementTemplateVersion_immutable"
  BEFORE UPDATE OR DELETE ON "RequirementTemplateVersion"
  FOR EACH ROW EXECUTE FUNCTION "phase13_requirement_template_version_immutable"();
--> statement-breakpoint
CREATE FUNCTION "phase13_project_requirement_event_append_only"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Project requirement state events are append-only'
    USING ERRCODE = '23514', CONSTRAINT = 'ProjectRequirementStateEvent_immutable';
END;
$$;
CREATE TRIGGER "ProjectRequirementStateEvent_append_only"
  BEFORE UPDATE OR DELETE ON "ProjectRequirementStateEvent"
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_requirement_event_append_only"();
