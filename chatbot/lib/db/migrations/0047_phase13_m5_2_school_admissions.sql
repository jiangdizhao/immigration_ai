CREATE TABLE IF NOT EXISTS "SchoolAdmissionCase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"ownerUserId" uuid NOT NULL,
	"applicationId" uuid,
	"originKind" varchar NOT NULL,
	"institutionName" varchar(200) NOT NULL,
	"courseTitle" varchar(200),
	"intakeLabel" varchar(120),
	"serviceMode" varchar DEFAULT 'self_service' NOT NULL,
	"preparationState" varchar DEFAULT 'not_started' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"confirmedPreparationVersion" integer,
	"managedReadinessStatus" varchar DEFAULT 'NOT_EVALUATED' NOT NULL,
	"managedReadinessReasonCodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"managedReadinessCheckedAt" timestamp,
	"managedReadinessToken" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SchoolAdmissionEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caseId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"actorUserId" uuid NOT NULL,
	"eventType" varchar NOT NULL,
	"subjectKind" varchar NOT NULL,
	"subjectId" uuid NOT NULL,
	"caseRevision" integer NOT NULL,
	"operationRecordId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SchoolAdmissionException" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caseId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"claimKind" varchar(64) NOT NULL,
	"version" integer NOT NULL,
	"state" varchar NOT NULL,
	"description" varchar(300) NOT NULL,
	"authorityReference" varchar(128),
	"decidedByUserId" uuid,
	"decidedAt" timestamp,
	"reportedByUserId" uuid NOT NULL,
	"recordedAt" timestamp DEFAULT now() NOT NULL,
	"supersededById" uuid,
	"operationId" varchar(128) NOT NULL,
	"requestSha256" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SchoolAdmissionExternalAction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caseId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"actionKind" varchar NOT NULL,
	"performedOn" varchar(10) NOT NULL,
	"note" varchar(600),
	"acknowledged" boolean NOT NULL,
	"provenance" varchar DEFAULT 'customer_reported' NOT NULL,
	"reportedByUserId" uuid NOT NULL,
	"recordedAt" timestamp DEFAULT now() NOT NULL,
	"operationId" varchar(128) NOT NULL,
	"requestSha256" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SchoolAdmissionOperation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actorUserId" uuid NOT NULL,
	"operationId" varchar(128) NOT NULL,
	"caseId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"operationType" varchar(64) NOT NULL,
	"requestSha256" varchar(64) NOT NULL,
	"resultKind" varchar(64) NOT NULL,
	"resultId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SchoolAdmissionOutcome" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caseId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"kind" varchar NOT NULL,
	"version" integer NOT NULL,
	"state" varchar(32) NOT NULL,
	"provenance" varchar NOT NULL,
	"evidenceReferenceId" uuid,
	"evidenceReferenceVersion" integer,
	"evidenceReferenceSha256" varchar(64),
	"receivedOn" varchar(10),
	"expiresOn" varchar(10),
	"validFrom" varchar(10),
	"validTo" varchar(10),
	"decisionOn" varchar(10),
	"reportedByUserId" uuid NOT NULL,
	"recordedAt" timestamp DEFAULT now() NOT NULL,
	"supersededById" uuid,
	"operationId" varchar(128) NOT NULL,
	"requestSha256" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SchoolAdmissionPreparation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caseId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"version" integer NOT NULL,
	"schemaVersion" varchar(64) NOT NULL,
	"caseRevision" integer NOT NULL,
	"applicationRevision" integer,
	"serviceMode" varchar NOT NULL,
	"packageId" uuid,
	"packageContentSha256" varchar(64),
	"sourceDigest" varchar(64) NOT NULL,
	"inputsSha256" varchar(64) NOT NULL,
	"contentSha256" varchar(64) NOT NULL,
	"requirements" jsonb NOT NULL,
	"sections" jsonb NOT NULL,
	"assistKind" varchar(32) NOT NULL,
	"confirmedAt" timestamp,
	"createdByUserId" uuid NOT NULL,
	"operationId" varchar(128) NOT NULL,
	"requestSha256" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAdmissionCase_project_id_unique" ON "SchoolAdmissionCase" USING btree ("projectId","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAdmissionCase_project_application_unique" ON "SchoolAdmissionCase" USING btree ("projectId","applicationId") WHERE "SchoolAdmissionCase"."applicationId" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SchoolAdmissionCase_project_owner_created_idx" ON "SchoolAdmissionCase" USING btree ("projectId","ownerUserId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAdmissionEvent_case_revision_event_unique" ON "SchoolAdmissionEvent" USING btree ("caseId","caseRevision","eventType");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SchoolAdmissionEvent_case_created_idx" ON "SchoolAdmissionEvent" USING btree ("caseId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAdmissionException_case_version_unique" ON "SchoolAdmissionException" USING btree ("caseId","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAdmissionException_current_unique" ON "SchoolAdmissionException" USING btree ("caseId") WHERE "SchoolAdmissionException"."supersededById" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SchoolAdmissionExternalAction_case_recorded_idx" ON "SchoolAdmissionExternalAction" USING btree ("caseId","recordedAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAdmissionOperation_actor_operation_unique" ON "SchoolAdmissionOperation" USING btree ("actorUserId","operationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SchoolAdmissionOperation_actor_created_idx" ON "SchoolAdmissionOperation" USING btree ("actorUserId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAdmissionOutcome_case_kind_version_unique" ON "SchoolAdmissionOutcome" USING btree ("caseId","kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAdmissionOutcome_current_unique" ON "SchoolAdmissionOutcome" USING btree ("caseId","kind") WHERE "SchoolAdmissionOutcome"."supersededById" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SchoolAdmissionOutcome_case_recorded_idx" ON "SchoolAdmissionOutcome" USING btree ("caseId","recordedAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAdmissionPreparation_case_version_unique" ON "SchoolAdmissionPreparation" USING btree ("caseId","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SchoolAdmissionPreparation_case_created_idx" ON "SchoolAdmissionPreparation" USING btree ("caseId","createdAt");DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_ownerUserId_User_id_fk" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_application_fk" FOREIGN KEY ("projectId","applicationId") REFERENCES "public"."SchoolApplication"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionEvent" ADD CONSTRAINT "SchoolAdmissionEvent_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionEvent" ADD CONSTRAINT "SchoolAdmissionEvent_operationRecordId_SchoolAdmissionOperation_id_fk" FOREIGN KEY ("operationRecordId") REFERENCES "public"."SchoolAdmissionOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionEvent" ADD CONSTRAINT "SchoolAdmissionEvent_case_fk" FOREIGN KEY ("projectId","caseId") REFERENCES "public"."SchoolAdmissionCase"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionException" ADD CONSTRAINT "SchoolAdmissionException_decidedByUserId_User_id_fk" FOREIGN KEY ("decidedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionException" ADD CONSTRAINT "SchoolAdmissionException_reportedByUserId_User_id_fk" FOREIGN KEY ("reportedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionException" ADD CONSTRAINT "SchoolAdmissionException_case_fk" FOREIGN KEY ("projectId","caseId") REFERENCES "public"."SchoolAdmissionCase"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionException" ADD CONSTRAINT "SchoolAdmissionException_superseded_fk" FOREIGN KEY ("supersededById") REFERENCES "public"."SchoolAdmissionException"("id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionExternalAction" ADD CONSTRAINT "SchoolAdmissionExternalAction_reportedByUserId_User_id_fk" FOREIGN KEY ("reportedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionExternalAction" ADD CONSTRAINT "SchoolAdmissionExternalAction_case_fk" FOREIGN KEY ("projectId","caseId") REFERENCES "public"."SchoolAdmissionCase"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionOperation" ADD CONSTRAINT "SchoolAdmissionOperation_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionOutcome" ADD CONSTRAINT "SchoolAdmissionOutcome_reportedByUserId_User_id_fk" FOREIGN KEY ("reportedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionOutcome" ADD CONSTRAINT "SchoolAdmissionOutcome_case_fk" FOREIGN KEY ("projectId","caseId") REFERENCES "public"."SchoolAdmissionCase"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionOutcome" ADD CONSTRAINT "SchoolAdmissionOutcome_superseded_fk" FOREIGN KEY ("supersededById") REFERENCES "public"."SchoolAdmissionOutcome"("id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionPreparation" ADD CONSTRAINT "SchoolAdmissionPreparation_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolAdmissionPreparation" ADD CONSTRAINT "SchoolAdmissionPreparation_case_fk" FOREIGN KEY ("projectId","caseId") REFERENCES "public"."SchoolAdmissionCase"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Phase 13 M5.2 — School Admission workflow CHECK constraints.
-- Serialized after tables, indexes and foreign keys: every CHECK below is a
-- value/consistency rule that may reference only its own row.

ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_revision_check" CHECK ("revision" > 0);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_origin_check" CHECK ("originKind" in ('school_application', 'existing_offer', 'existing_coe', 'claimed_exception'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_application_consistency_check" CHECK (("originKind" = 'school_application' and "applicationId" is not null) or ("originKind" <> 'school_application' and "applicationId" is null));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_service_mode_check" CHECK ("serviceMode" in ('self_service', 'managed_service'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_preparation_state_check" CHECK ("preparationState" in ('not_started', 'in_preparation', 'ready_for_customer_review', 'customer_confirmed', 'stale'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_readiness_check" CHECK ("managedReadinessStatus" in ('NOT_EVALUATED', 'READY', 'NOT_READY', 'UNKNOWN'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_readiness_observation_check" CHECK (("managedReadinessStatus" = 'NOT_EVALUATED' and "managedReadinessCheckedAt" is null and "managedReadinessToken" is null) or ("managedReadinessStatus" <> 'NOT_EVALUATED' and "managedReadinessCheckedAt" is not null));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_readiness_reasons_check" CHECK (jsonb_typeof("managedReadinessReasonCodes") = 'array');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_institution_name_check" CHECK (length(trim("institutionName")) between 1 and 200);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_course_title_check" CHECK ("courseTitle" is null or length(trim("courseTitle")) between 1 and 200);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_intake_label_check" CHECK ("intakeLabel" is null or length(trim("intakeLabel")) between 1 and 120);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_confirmed_version_check" CHECK ("confirmedPreparationVersion" is null or "confirmedPreparationVersion" > 0);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionCase" ADD CONSTRAINT "SchoolAdmissionCase_updated_at_check" CHECK ("updatedAt" >= "createdAt");
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionPreparation" ADD CONSTRAINT "SchoolAdmissionPreparation_version_check" CHECK ("version" > 0 and "caseRevision" > 0);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionPreparation" ADD CONSTRAINT "SchoolAdmissionPreparation_hash_check" CHECK ("sourceDigest" ~ '^[0-9a-f]{64}$' and "inputsSha256" ~ '^[0-9a-f]{64}$' and "contentSha256" ~ '^[0-9a-f]{64}$' and ("packageContentSha256" is null or "packageContentSha256" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionPreparation" ADD CONSTRAINT "SchoolAdmissionPreparation_package_pair_check" CHECK (("packageId" is null and "packageContentSha256" is null) or ("packageId" is not null and "packageContentSha256" is not null));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionPreparation" ADD CONSTRAINT "SchoolAdmissionPreparation_application_revision_check" CHECK ("applicationRevision" is null or "applicationRevision" > 0);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionPreparation" ADD CONSTRAINT "SchoolAdmissionPreparation_service_mode_check" CHECK ("serviceMode" in ('self_service', 'managed_service'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionPreparation" ADD CONSTRAINT "SchoolAdmissionPreparation_assist_kind_check" CHECK ("assistKind" in ('deterministic_template', 'stub_suggestion', 'disabled'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionPreparation" ADD CONSTRAINT "SchoolAdmissionPreparation_requirements_check" CHECK (jsonb_typeof("requirements") = 'array' and jsonb_array_length("requirements") between 1 and 32);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOutcome" ADD CONSTRAINT "SchoolAdmissionOutcome_kind_check" CHECK ("kind" in ('offer', 'coe'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOutcome" ADD CONSTRAINT "SchoolAdmissionOutcome_version_check" CHECK ("version" > 0);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOutcome" ADD CONSTRAINT "SchoolAdmissionOutcome_state_check" CHECK (("kind" = 'offer' and "state" in ('received', 'under_review', 'accepted', 'declined', 'expired', 'deferred')) or ("kind" = 'coe' and "state" in ('claimed', 'obtained', 'superseded')));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOutcome" ADD CONSTRAINT "SchoolAdmissionOutcome_provenance_check" CHECK ("provenance" in ('customer_reported', 'document_backed_unverified', 'source_reviewed', 'provider_confirmed'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOutcome" ADD CONSTRAINT "SchoolAdmissionOutcome_evidence_check" CHECK (("evidenceReferenceId" is null and "evidenceReferenceVersion" is null and "evidenceReferenceSha256" is null) or ("evidenceReferenceId" is not null and "evidenceReferenceVersion" > 0 and "evidenceReferenceSha256" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOutcome" ADD CONSTRAINT "SchoolAdmissionOutcome_document_backed_check" CHECK ("provenance" <> 'document_backed_unverified' or "evidenceReferenceId" is not null);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOutcome" ADD CONSTRAINT "SchoolAdmissionOutcome_dates_check" CHECK (("receivedOn" is null or "receivedOn" ~ '^\d{4}-\d{2}-\d{2}$') and ("expiresOn" is null or "expiresOn" ~ '^\d{4}-\d{2}-\d{2}$') and ("validFrom" is null or "validFrom" ~ '^\d{4}-\d{2}-\d{2}$') and ("validTo" is null or "validTo" ~ '^\d{4}-\d{2}-\d{2}$') and ("decisionOn" is null or "decisionOn" ~ '^\d{4}-\d{2}-\d{2}$'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOutcome" ADD CONSTRAINT "SchoolAdmissionOutcome_operation_id_check" CHECK ("operationId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOutcome" ADD CONSTRAINT "SchoolAdmissionOutcome_request_hash_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionExternalAction" ADD CONSTRAINT "SchoolAdmissionExternalAction_kind_check" CHECK ("actionKind" in ('school_portal_submission', 'email_submission', 'paper_form_submission', 'agent_submission', 'phone_follow_up', 'other'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionExternalAction" ADD CONSTRAINT "SchoolAdmissionExternalAction_acknowledged_check" CHECK ("acknowledged");
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionExternalAction" ADD CONSTRAINT "SchoolAdmissionExternalAction_provenance_check" CHECK ("provenance" = 'customer_reported');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionExternalAction" ADD CONSTRAINT "SchoolAdmissionExternalAction_performed_on_check" CHECK ("performedOn" ~ '^\d{4}-\d{2}-\d{2}$');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionExternalAction" ADD CONSTRAINT "SchoolAdmissionExternalAction_note_check" CHECK ("note" is null or length(trim("note")) between 1 and 600);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionExternalAction" ADD CONSTRAINT "SchoolAdmissionExternalAction_operation_id_check" CHECK ("operationId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionExternalAction" ADD CONSTRAINT "SchoolAdmissionExternalAction_request_hash_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint

ALTER TABLE "SchoolAdmissionPreparation" ADD CONSTRAINT "SchoolAdmissionPreparation_sections_check" CHECK (jsonb_typeof("sections") = 'array' and jsonb_array_length("sections") between 1 and 16);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionPreparation" ADD CONSTRAINT "SchoolAdmissionPreparation_operation_id_check" CHECK ("operationId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionPreparation" ADD CONSTRAINT "SchoolAdmissionPreparation_request_hash_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionException" ADD CONSTRAINT "SchoolAdmissionException_claim_kind_check" CHECK ("claimKind" = 'school_application_exception');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionException" ADD CONSTRAINT "SchoolAdmissionException_state_check" CHECK ("state" in ('claimed', 'needs_verification', 'verified', 'rejected', 'unknown'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionException" ADD CONSTRAINT "SchoolAdmissionException_decision_check" CHECK (("state" in ('verified', 'rejected') and "authorityReference" is not null and "decidedAt" is not null and "decidedByUserId" is not null) or ("state" not in ('verified', 'rejected') and "authorityReference" is null and "decidedAt" is null and "decidedByUserId" is null));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionException" ADD CONSTRAINT "SchoolAdmissionException_description_check" CHECK (length(trim("description")) between 1 and 300);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionException" ADD CONSTRAINT "SchoolAdmissionException_operation_id_check" CHECK ("operationId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionException" ADD CONSTRAINT "SchoolAdmissionException_request_hash_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOperation" ADD CONSTRAINT "SchoolAdmissionOperation_operation_id_check" CHECK ("operationId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOperation" ADD CONSTRAINT "SchoolAdmissionOperation_request_hash_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOperation" ADD CONSTRAINT "SchoolAdmissionOperation_type_check" CHECK ("operationType" in ('school_admission_case_create', 'school_admission_service_mode', 'school_admission_prepare', 'school_admission_confirm', 'school_admission_outcome_record', 'school_admission_outcome_transition', 'school_admission_external_action', 'school_admission_exception_claim', 'school_admission_exception_verify', 'school_admission_readiness_evaluate'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionOperation" ADD CONSTRAINT "SchoolAdmissionOperation_result_kind_check" CHECK ("resultKind" in ('school_admission_case', 'school_admission_preparation', 'school_admission_outcome', 'school_admission_external_action', 'school_admission_exception'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionEvent" ADD CONSTRAINT "SchoolAdmissionEvent_revision_check" CHECK ("caseRevision" > 0);
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionEvent" ADD CONSTRAINT "SchoolAdmissionEvent_event_type_check" CHECK ("eventType" in ('school_admission_case_created', 'school_admission_service_mode_changed', 'school_admission_preparation_recorded', 'school_admission_preparation_confirmed', 'school_admission_offer_recorded', 'school_admission_offer_transition', 'school_admission_coe_recorded', 'school_admission_coe_transition', 'school_admission_external_action_recorded', 'school_admission_exception_claimed', 'school_admission_exception_verified', 'school_admission_exception_rejected', 'school_admission_readiness_evaluated'));
--> statement-breakpoint
ALTER TABLE "SchoolAdmissionEvent" ADD CONSTRAINT "SchoolAdmissionEvent_subject_kind_check" CHECK ("subjectKind" in ('school_admission_case', 'school_admission_preparation', 'school_admission_offer', 'school_admission_coe', 'school_admission_external_action', 'school_admission_exception'));
--> statement-breakpoint


-- Phase 13 M5.2 — integrity guards.
--
-- Same discipline as M5.1: identity and content are immutable, history is
-- append-only, the case revision advances by exactly one, and the only permitted
-- mutation on a versioned row is the supersession pointer (null -> value).

CREATE FUNCTION "phase13_m5_2_case_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId"
    OR NEW."applicationId" IS DISTINCT FROM OLD."applicationId"
    OR NEW."originKind" IS DISTINCT FROM OLD."originKind"
    OR NEW."institutionName" IS DISTINCT FROM OLD."institutionName"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'School admission case identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmissionCase_identity_immutable';
  END IF;
  IF NEW."revision" <> OLD."revision" + 1 THEN
    RAISE EXCEPTION 'School admission case revision must advance by exactly one' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmissionCase_revision_step';
  END IF;
  IF OLD."confirmedPreparationVersion" IS NOT NULL
    AND (
      NEW."confirmedPreparationVersion" IS NULL
      OR NEW."confirmedPreparationVersion" < OLD."confirmedPreparationVersion"
    )
  THEN
    -- Confirmation may only move FORWARD to a newly prepared exact version. An
    -- older confirmed snapshot can never silently become current again, an
    -- already-confirmed version keeps its own immutable confirmation record, and
    -- a recorded confirmation can never be cleared back to "unconfirmed".
    RAISE EXCEPTION 'Preparation confirmation may only advance to a newer version' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmissionCase_confirmation_forward_only';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "SchoolAdmissionCase_guard" BEFORE UPDATE ON "SchoolAdmissionCase" FOR EACH ROW EXECUTE FUNCTION "phase13_m5_2_case_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m5_2_preparation_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'School admission preparations are immutable history' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmissionPreparation_append_only';
  END IF;
  IF NEW."caseId" IS DISTINCT FROM OLD."caseId"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion"
    OR NEW."caseRevision" IS DISTINCT FROM OLD."caseRevision"
    OR NEW."applicationRevision" IS DISTINCT FROM OLD."applicationRevision"
    OR NEW."serviceMode" IS DISTINCT FROM OLD."serviceMode"
    OR NEW."packageId" IS DISTINCT FROM OLD."packageId"
    OR NEW."packageContentSha256" IS DISTINCT FROM OLD."packageContentSha256"
    OR NEW."sourceDigest" IS DISTINCT FROM OLD."sourceDigest"
    OR NEW."inputsSha256" IS DISTINCT FROM OLD."inputsSha256"
    OR NEW."contentSha256" IS DISTINCT FROM OLD."contentSha256"
    OR NEW."requirements" IS DISTINCT FROM OLD."requirements"
    OR NEW."sections" IS DISTINCT FROM OLD."sections"
    OR NEW."assistKind" IS DISTINCT FROM OLD."assistKind"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    OR NEW."operationId" IS DISTINCT FROM OLD."operationId"
    OR NEW."requestSha256" IS DISTINCT FROM OLD."requestSha256"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Only customer confirmation may change after creation' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmissionPreparation_immutable';
  END IF;
  IF OLD."confirmedAt" IS NOT NULL AND NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" THEN
    RAISE EXCEPTION 'Preparation confirmation is final' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmissionPreparation_confirmation_final';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "SchoolAdmissionPreparation_guard" BEFORE UPDATE OR DELETE ON "SchoolAdmissionPreparation" FOR EACH ROW EXECUTE FUNCTION "phase13_m5_2_preparation_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m5_2_outcome_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'School admission outcomes are immutable history' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmissionOutcome_append_only';
  END IF;
  IF NEW."caseId" IS DISTINCT FROM OLD."caseId"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."state" IS DISTINCT FROM OLD."state"
    OR NEW."provenance" IS DISTINCT FROM OLD."provenance"
    OR NEW."evidenceReferenceId" IS DISTINCT FROM OLD."evidenceReferenceId"
    OR NEW."evidenceReferenceVersion" IS DISTINCT FROM OLD."evidenceReferenceVersion"
    OR NEW."evidenceReferenceSha256" IS DISTINCT FROM OLD."evidenceReferenceSha256"
    OR NEW."receivedOn" IS DISTINCT FROM OLD."receivedOn"
    OR NEW."expiresOn" IS DISTINCT FROM OLD."expiresOn"
    OR NEW."validFrom" IS DISTINCT FROM OLD."validFrom"
    OR NEW."validTo" IS DISTINCT FROM OLD."validTo"
    OR NEW."decisionOn" IS DISTINCT FROM OLD."decisionOn"
    OR NEW."reportedByUserId" IS DISTINCT FROM OLD."reportedByUserId"
    OR NEW."recordedAt" IS DISTINCT FROM OLD."recordedAt"
    OR NEW."operationId" IS DISTINCT FROM OLD."operationId"
    OR NEW."requestSha256" IS DISTINCT FROM OLD."requestSha256"
  THEN
    RAISE EXCEPTION 'Only supersession may change after creation' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmissionOutcome_immutable';
  END IF;
  IF OLD."supersededById" IS NOT NULL AND NEW."supersededById" IS DISTINCT FROM OLD."supersededById" THEN
    RAISE EXCEPTION 'Supersession is final' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmissionOutcome_supersession_final';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "SchoolAdmissionOutcome_guard" BEFORE UPDATE OR DELETE ON "SchoolAdmissionOutcome" FOR EACH ROW EXECUTE FUNCTION "phase13_m5_2_outcome_guard"();
--> statement-breakpoint

CREATE FUNCTION "phase13_m5_2_exception_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'School admission exceptions are retained as history' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmissionException_append_only';
  END IF;
  IF NEW."caseId" IS DISTINCT FROM OLD."caseId"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."claimKind" IS DISTINCT FROM OLD."claimKind"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."state" IS DISTINCT FROM OLD."state"
    OR NEW."description" IS DISTINCT FROM OLD."description"
    OR NEW."authorityReference" IS DISTINCT FROM OLD."authorityReference"
    OR NEW."decidedByUserId" IS DISTINCT FROM OLD."decidedByUserId"
    OR NEW."decidedAt" IS DISTINCT FROM OLD."decidedAt"
    OR NEW."reportedByUserId" IS DISTINCT FROM OLD."reportedByUserId"
    OR NEW."recordedAt" IS DISTINCT FROM OLD."recordedAt"
    OR NEW."operationId" IS DISTINCT FROM OLD."operationId"
    OR NEW."requestSha256" IS DISTINCT FROM OLD."requestSha256"
  THEN
    RAISE EXCEPTION 'Only supersession may change after creation' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmissionException_immutable';
  END IF;
  IF OLD."supersededById" IS NOT NULL AND NEW."supersededById" IS DISTINCT FROM OLD."supersededById" THEN
    RAISE EXCEPTION 'Supersession is final' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmissionException_supersession_final';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "SchoolAdmissionException_guard" BEFORE UPDATE OR DELETE ON "SchoolAdmissionException" FOR EACH ROW EXECUTE FUNCTION "phase13_m5_2_exception_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m5_2_append_only_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'School admission audit records are append-only' USING ERRCODE = '23514', CONSTRAINT = 'SchoolAdmission_audit_append_only';
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "SchoolAdmissionExternalAction_append_only" BEFORE UPDATE OR DELETE ON "SchoolAdmissionExternalAction" FOR EACH ROW EXECUTE FUNCTION "phase13_m5_2_append_only_guard"();
--> statement-breakpoint
CREATE TRIGGER "SchoolAdmissionOperation_append_only" BEFORE UPDATE OR DELETE ON "SchoolAdmissionOperation" FOR EACH ROW EXECUTE FUNCTION "phase13_m5_2_append_only_guard"();
--> statement-breakpoint
CREATE TRIGGER "SchoolAdmissionEvent_append_only" BEFORE UPDATE OR DELETE ON "SchoolAdmissionEvent" FOR EACH ROW EXECUTE FUNCTION "phase13_m5_2_append_only_guard"();

