CREATE TABLE IF NOT EXISTS "ServicePaymentCondition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"engagementId" uuid NOT NULL,
	"agreementVersionId" uuid NOT NULL,
	"agreementTermsSha256" varchar(64) NOT NULL,
	"requirement" varchar(16) NOT NULL,
	"amountMinor" bigint,
	"currency" varchar(3),
	"contractualBasisCode" varchar(32) NOT NULL,
	"contractualBasisRef" varchar(256),
	"contractObservationSha256" varchar(64) NOT NULL,
	"contractAuthorityCode" varchar(64) NOT NULL,
	"contractAuthorityRequestSha256" varchar(64) NOT NULL,
	"policyVersion" varchar(64) NOT NULL,
	"createdByUserId" uuid NOT NULL,
	"createdProjectRevision" integer NOT NULL,
	"createdOperationRecordId" uuid NOT NULL,
	"supersedesConditionId" uuid,
	"supersededByConditionId" uuid,
	"supersededAt" timestamp,
	"supersededProjectRevision" integer,
	"supersededOperationRecordId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ServicePaymentEvidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"engagementId" uuid NOT NULL,
	"conditionId" uuid NOT NULL,
	"agreementVersionId" uuid NOT NULL,
	"agreementTermsSha256" varchar(64) NOT NULL,
	"evidenceCategory" varchar(32) NOT NULL,
	"referenceSha256" varchar(64) NOT NULL,
	"observationSha256" varchar(64) NOT NULL,
	"declaredAmountMinor" bigint NOT NULL,
	"declaredCurrency" varchar(3) NOT NULL,
	"paidAt" timestamp NOT NULL,
	"submittedByUserId" uuid NOT NULL,
	"submittedAt" timestamp NOT NULL,
	"submittedProjectRevision" integer NOT NULL,
	"submittedOperationRecordId" uuid NOT NULL,
	"verificationStatus" varchar(16) DEFAULT 'pending' NOT NULL,
	"verificationMethod" varchar(64),
	"verificationProviderCode" varchar(64),
	"verificationProvenance" varchar(256),
	"verifiedByUserId" uuid,
	"verifiedAt" timestamp,
	"verificationProjectRevision" integer,
	"verificationOperationRecordId" uuid,
	"rejectionReasonCode" varchar(64)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ServicePaymentResolution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"engagementId" uuid NOT NULL,
	"conditionId" uuid NOT NULL,
	"evidenceId" uuid,
	"resolutionKind" varchar(16) NOT NULL,
	"reasonCode" varchar(64) NOT NULL,
	"observationSha256" varchar(64) NOT NULL,
	"observationCode" varchar(64),
	"financeAuthorityCode" varchar(64) NOT NULL,
	"financeAuthorityRequestSha256" varchar(64) NOT NULL,
	"supersedesResolutionId" uuid,
	"recordedByUserId" uuid NOT NULL,
	"resolvedProjectRevision" integer NOT NULL,
	"operationRecordId" uuid NOT NULL,
	"resolvedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentCondition_id_project_unique" ON "ServicePaymentCondition" USING btree ("id","projectId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentCondition_id_engagement_unique" ON "ServicePaymentCondition" USING btree ("id","engagementId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentCondition_id_project_engagement_unique" ON "ServicePaymentCondition" USING btree ("id","projectId","engagementId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentCondition_scope_identity_unique" ON "ServicePaymentCondition" USING btree ("id","projectId","engagementId","agreementVersionId","agreementTermsSha256","amountMinor","currency");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentCondition_live_unique" ON "ServicePaymentCondition" USING btree ("projectId","engagementId") WHERE "ServicePaymentCondition"."supersededAt" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ServicePaymentCondition_project_created_idx" ON "ServicePaymentCondition" USING btree ("projectId","createdAt","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ServicePaymentCondition_engagement_version_idx" ON "ServicePaymentCondition" USING btree ("engagementId","agreementVersionId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentEvidence_id_project_unique" ON "ServicePaymentEvidence" USING btree ("id","projectId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentEvidence_id_engagement_unique" ON "ServicePaymentEvidence" USING btree ("id","engagementId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentEvidence_id_condition_unique" ON "ServicePaymentEvidence" USING btree ("id","conditionId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentEvidence_submitted_operation_unique" ON "ServicePaymentEvidence" USING btree ("submittedOperationRecordId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentEvidence_verification_operation_unique" ON "ServicePaymentEvidence" USING btree ("verificationOperationRecordId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentEvidence_condition_reference_unique" ON "ServicePaymentEvidence" USING btree ("conditionId","referenceSha256");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentEvidence_verified_unique" ON "ServicePaymentEvidence" USING btree ("conditionId") WHERE "ServicePaymentEvidence"."verificationStatus" = 'verified';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ServicePaymentEvidence_condition_status_idx" ON "ServicePaymentEvidence" USING btree ("conditionId","verificationStatus","submittedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ServicePaymentEvidence_engagement_status_idx" ON "ServicePaymentEvidence" USING btree ("engagementId","verificationStatus","submittedAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentResolution_id_project_unique" ON "ServicePaymentResolution" USING btree ("id","projectId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentResolution_id_condition_unique" ON "ServicePaymentResolution" USING btree ("id","conditionId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentResolution_operation_unique" ON "ServicePaymentResolution" USING btree ("operationRecordId");
--> statement-breakpoint
-- Correction A: at most one correction may target a given resolution, enforced by
-- the database so two concurrent corrections (or direct SQL) cannot both commit.
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentResolution_superseded_target_unique" ON "ServicePaymentResolution" USING btree ("supersedesResolutionId") WHERE "ServicePaymentResolution"."supersedesResolutionId" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ServicePaymentResolution_condition_idx" ON "ServicePaymentResolution" USING btree ("conditionId","resolvedAt","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ServicePaymentResolution_engagement_idx" ON "ServicePaymentResolution" USING btree ("engagementId","resolvedAt","id");ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_type_check";--> statement-breakpoint
-- Installation order is contractual: tables, then every index that backs a foreign
-- key, then the foreign keys, then CHECK/trigger integrity logic. PostgreSQL
-- requires the referenced unique index to exist when the FK is added, so the
-- drizzle-generated "foreign keys before indexes" order is deliberately not used.
-- `lib/service-payment/migration-contract.test.ts` enforces this ordering.
DO $$ BEGIN
 ALTER TABLE "ServicePaymentCondition" ADD CONSTRAINT "ServicePaymentCondition_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentCondition" ADD CONSTRAINT "ServicePaymentCondition_createdOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("createdOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentCondition" ADD CONSTRAINT "ServicePaymentCondition_supersededOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("supersededOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentCondition" ADD CONSTRAINT "ServicePaymentCondition_engagement_fk" FOREIGN KEY ("engagementId","projectId") REFERENCES "public"."ServiceEngagement"("id","projectId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentCondition" ADD CONSTRAINT "ServicePaymentCondition_agreement_fk" FOREIGN KEY ("agreementVersionId","engagementId","agreementTermsSha256") REFERENCES "public"."ServiceAgreementVersion"("id","engagementId","termsSha256") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentEvidence" ADD CONSTRAINT "ServicePaymentEvidence_submittedByUserId_User_id_fk" FOREIGN KEY ("submittedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentEvidence" ADD CONSTRAINT "ServicePaymentEvidence_submittedOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("submittedOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentEvidence" ADD CONSTRAINT "ServicePaymentEvidence_verifiedByUserId_User_id_fk" FOREIGN KEY ("verifiedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentEvidence" ADD CONSTRAINT "ServicePaymentEvidence_verificationOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("verificationOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentEvidence" ADD CONSTRAINT "ServicePaymentEvidence_condition_scope_fk" FOREIGN KEY ("conditionId","projectId","engagementId","agreementVersionId","agreementTermsSha256","declaredAmountMinor","declaredCurrency") REFERENCES "public"."ServicePaymentCondition"("id","projectId","engagementId","agreementVersionId","agreementTermsSha256","amountMinor","currency") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentResolution" ADD CONSTRAINT "ServicePaymentResolution_recordedByUserId_User_id_fk" FOREIGN KEY ("recordedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentResolution" ADD CONSTRAINT "ServicePaymentResolution_operationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("operationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentResolution" ADD CONSTRAINT "ServicePaymentResolution_condition_fk" FOREIGN KEY ("conditionId","projectId","engagementId") REFERENCES "public"."ServicePaymentCondition"("id","projectId","engagementId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServicePaymentResolution" ADD CONSTRAINT "ServicePaymentResolution_evidence_fk" FOREIGN KEY ("evidenceId","conditionId") REFERENCES "public"."ServicePaymentEvidence"("id","conditionId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_type_check" CHECK ("operationType" IN ('project_create','project_close','membership_invite','membership_accept','membership_revoke','project_chat_create','project_document_upload_intent','project_document_import_intent','project_document_storage_finalize','project_document_storage_fail','project_document_scan_finalize','project_document_grant_create','project_document_grant_revoke','project_document_withdraw','project_requirement_state_change','project_evidence_extract','project_fact_mutation','project_staff_assignment_propose','project_staff_assignment_owner_approve','project_staff_assignment_owner_decline','project_staff_assignment_lawyer_accept','project_staff_assignment_lawyer_decline','project_staff_assignment_owner_revoke','project_staff_assignment_lawyer_resign','project_staff_assignment_admin_withdraw','project_staff_assignment_admin_revoke','project_thread_participation_consent_create','project_thread_participation_consent_withdraw','project_human_message_send','service_engagement_create','service_engagement_agreement_draft','service_engagement_agreement_issue','service_engagement_agreement_accept','service_engagement_signature_submit','service_engagement_signature_verify','service_engagement_activate','service_engagement_suspend','service_engagement_resume','service_engagement_terminate','project_resource_disclosure_grant_create','project_resource_disclosure_grant_revoke','service_payment_condition_record','service_payment_evidence_submit','service_payment_evidence_verify','service_payment_resolution_record'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_result_kind_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_result_kind_check" CHECK ("resultKind" IN ('project','membership','chat','document_asset','document_version','document_scan_run','document_grant','project_requirement_state','document_extraction_run','project_fact_assertion','project_staff_assignment','project_thread_participation_consent','project_human_message','service_engagement','service_agreement_version','service_agreement_acceptance','service_signature_evidence','project_resource_disclosure_grant','service_payment_condition','service_payment_evidence','service_payment_resolution'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_actor_type_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_actor_type_check" CHECK (("operationType" IN ('project_create','project_close','membership_invite','membership_accept','membership_revoke','project_chat_create','project_document_upload_intent','project_document_import_intent','project_document_grant_create','project_document_grant_revoke','project_document_withdraw','project_requirement_state_change','project_evidence_extract','project_fact_mutation','project_staff_assignment_propose','project_staff_assignment_owner_approve','project_staff_assignment_owner_decline','project_staff_assignment_lawyer_accept','project_staff_assignment_lawyer_decline','project_staff_assignment_owner_revoke','project_staff_assignment_lawyer_resign','project_staff_assignment_admin_withdraw','project_staff_assignment_admin_revoke','project_thread_participation_consent_create','project_thread_participation_consent_withdraw','project_human_message_send','service_engagement_create','service_engagement_agreement_draft','service_engagement_agreement_issue','service_engagement_agreement_accept','service_engagement_signature_submit','service_engagement_signature_verify','service_engagement_activate','service_engagement_suspend','service_engagement_resume','service_engagement_terminate','project_resource_disclosure_grant_create','project_resource_disclosure_grant_revoke','service_payment_condition_record','service_payment_evidence_submit','service_payment_evidence_verify','service_payment_resolution_record') AND "actorKind" = 'user') OR ("operationType" IN ('project_document_storage_finalize','project_document_storage_fail') AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_storage_worker' AND "operationId" ~ '^[0-9a-f]{64}$') OR ("operationType" = 'project_document_scan_finalize' AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_scan_worker' AND "operationId" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_type_check";
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_type_check" CHECK ("eventType" IN ('project_created','membership_state_changed','project_chat_created','project_closed','project_document_intent_created','project_document_storage_changed','project_document_security_changed','project_document_grant_changed','project_document_withdrawn','project_requirement_state_changed','project_evidence_extraction_completed','project_fact_changed','project_staff_assignment_proposed','project_staff_assignment_owner_approved','project_staff_assignment_owner_declined','project_staff_assignment_lawyer_accepted','project_staff_assignment_lawyer_declined','project_staff_assignment_owner_revoked','project_staff_assignment_lawyer_resigned','project_staff_assignment_admin_withdrawn','project_staff_assignment_admin_revoked','project_thread_participation_consent_created','project_thread_participation_consent_withdrawn','service_engagement_created','service_engagement_agreement_version_drafted','service_engagement_agreement_version_issued','service_engagement_agreement_accepted','service_engagement_signature_evidence_recorded','service_engagement_signature_evidence_verified','service_engagement_signature_evidence_rejected','service_engagement_activated','service_engagement_suspended','service_engagement_resumed','service_engagement_terminated','project_resource_disclosure_granted','project_resource_disclosure_revoked','service_payment_condition_recorded','service_payment_evidence_recorded','service_payment_evidence_verified','service_payment_evidence_rejected','service_payment_resolution_recorded'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_subject_check";
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_subject_check" CHECK (("subjectKind" IS NULL AND "subjectId" IS NULL) OR ("subjectKind" IN ('project','membership','chat','document_asset','document_version','document_scan_run','document_grant','requirement_state','document_extraction_run','project_fact_assertion','project_staff_assignment','project_thread_participation_consent','service_engagement','service_agreement_version','service_agreement_acceptance','service_signature_evidence','project_resource_disclosure_grant','service_payment_condition','service_payment_evidence','service_payment_resolution') AND "subjectId" IS NOT NULL));
--> statement-breakpoint
-- M4-005 event/subject pairing. Declared as a new named constraint so Migration
-- 0043's M4-004 constraint stays untouched.
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_service_payment_subject_check" CHECK ("eventType" NOT IN ('service_payment_condition_recorded','service_payment_evidence_recorded','service_payment_evidence_verified','service_payment_evidence_rejected','service_payment_resolution_recorded') OR ("eventType" = 'service_payment_condition_recorded' AND "subjectKind" = 'service_payment_condition') OR ("eventType" IN ('service_payment_evidence_recorded','service_payment_evidence_verified','service_payment_evidence_rejected') AND "subjectKind" = 'service_payment_evidence') OR ("eventType" = 'service_payment_resolution_recorded' AND "subjectKind" = 'service_payment_resolution'));
--> statement-breakpoint
-- M4-005 table constraints. Drizzle Kit does not serialize check() declarations.
ALTER TABLE "ServicePaymentCondition" ADD CONSTRAINT "ServicePaymentCondition_requirement_check" CHECK ("requirement" IN ('required','not_required','unknown')),
  ADD CONSTRAINT "ServicePaymentCondition_basis_code_check" CHECK ("contractualBasisCode" IN ('agreement_clause','payment_schedule','explicit_no_advance_fee')),
  ADD CONSTRAINT "ServicePaymentCondition_amount_check" CHECK ((("requirement" = 'required' AND "amountMinor" IS NOT NULL AND "amountMinor" > 0 AND "amountMinor" <= 999999999999 AND "currency" ~ '^[A-Z]{3}$' AND "contractualBasisRef" IS NOT NULL)) OR ("requirement" = 'not_required' AND "amountMinor" IS NULL AND "currency" IS NULL AND "contractualBasisRef" IS NOT NULL) OR ("requirement" = 'unknown' AND "amountMinor" IS NULL AND "currency" IS NULL)),
  ADD CONSTRAINT "ServicePaymentCondition_basis_ref_check" CHECK ("contractualBasisRef" IS NULL OR "contractualBasisRef" ~ '^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$'),
  ADD CONSTRAINT "ServicePaymentCondition_hash_check" CHECK ("agreementTermsSha256" ~ '^[0-9a-f]{64}$' AND "contractObservationSha256" ~ '^[0-9a-f]{64}$' AND "contractAuthorityRequestSha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ServicePaymentCondition_authority_check" CHECK ("contractAuthorityCode" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' AND length("policyVersion") > 0 AND "createdProjectRevision" > 0),
  ADD CONSTRAINT "ServicePaymentCondition_supersession_check" CHECK (("supersededAt" IS NULL AND "supersededByConditionId" IS NULL AND "supersededProjectRevision" IS NULL AND "supersededOperationRecordId" IS NULL) OR ("supersededAt" IS NOT NULL AND "supersededByConditionId" IS NOT NULL AND "supersededByConditionId" <> "id" AND "supersededProjectRevision" IS NOT NULL AND "supersededOperationRecordId" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "ServicePaymentEvidence" ADD CONSTRAINT "ServicePaymentEvidence_category_check" CHECK ("evidenceCategory" IN ('external_transfer_receipt','provider_settlement_observation')),
  ADD CONSTRAINT "ServicePaymentEvidence_status_check" CHECK ("verificationStatus" IN ('pending','verified','rejected')),
  ADD CONSTRAINT "ServicePaymentEvidence_amount_check" CHECK ("declaredAmountMinor" > 0 AND "declaredAmountMinor" <= 999999999999 AND "declaredCurrency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "ServicePaymentEvidence_hash_check" CHECK ("referenceSha256" ~ '^[0-9a-f]{64}$' AND "observationSha256" ~ '^[0-9a-f]{64}$' AND "agreementTermsSha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ServicePaymentEvidence_revision_check" CHECK ("submittedProjectRevision" > 0 AND "paidAt" <= "submittedAt" + interval '5 minutes'),
  ADD CONSTRAINT "ServicePaymentEvidence_lifecycle_check" CHECK (("verificationStatus" = 'pending' AND "verifiedAt" IS NULL AND "verifiedByUserId" IS NULL AND "verificationMethod" IS NULL AND "verificationProjectRevision" IS NULL AND "verificationOperationRecordId" IS NULL AND "rejectionReasonCode" IS NULL) OR ("verificationStatus" = 'verified' AND "verifiedAt" IS NOT NULL AND "verifiedByUserId" IS NOT NULL AND "verificationMethod" IS NOT NULL AND "verificationProjectRevision" IS NOT NULL AND "verificationOperationRecordId" IS NOT NULL AND "rejectionReasonCode" IS NULL) OR ("verificationStatus" = 'rejected' AND "verifiedAt" IS NOT NULL AND "verifiedByUserId" IS NOT NULL AND "verificationMethod" IS NOT NULL AND "verificationProjectRevision" IS NOT NULL AND "verificationOperationRecordId" IS NOT NULL AND "rejectionReasonCode" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "ServicePaymentResolution" ADD CONSTRAINT "ServicePaymentResolution_kind_check" CHECK ("resolutionKind" IN ('dispute','refund','reversal','void','correction')),
  ADD CONSTRAINT "ServicePaymentResolution_reason_check" CHECK ("reasonCode" ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  ADD CONSTRAINT "ServicePaymentResolution_hash_check" CHECK ("observationSha256" ~ '^[0-9a-f]{64}$' AND "financeAuthorityRequestSha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ServicePaymentResolution_authority_check" CHECK ("financeAuthorityCode" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' AND "resolvedProjectRevision" > 0),
  ADD CONSTRAINT "ServicePaymentResolution_supersession_check" CHECK (("resolutionKind" = 'correction' AND "supersedesResolutionId" IS NOT NULL AND "supersedesResolutionId" <> "id") OR ("resolutionKind" <> 'correction' AND "supersedesResolutionId" IS NULL)),
  ADD CONSTRAINT "ServicePaymentResolution_target_check" CHECK (("resolutionKind" IN ('refund','reversal','dispute') AND "evidenceId" IS NOT NULL) OR ("resolutionKind" = 'void' AND "evidenceId" IS NULL) OR ("resolutionKind" = 'correction' AND "evidenceId" IS NULL));
--> statement-breakpoint
-- M4-005 guards. Conditions are append-only apart from a single one-way
-- supersession transition; evidence is append-only apart from a single
-- pending -> verified|rejected evaluation; resolutions are fully append-only.
CREATE FUNCTION "phase13_m4_005_condition_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  operation_row "ProjectOperation"%ROWTYPE;
  engagement_row "ServiceEngagement"%ROWTYPE;
  target_row "ServicePaymentCondition"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Service payment conditions are append-only' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentCondition_immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO operation_row FROM "ProjectOperation" WHERE "id" = NEW."createdOperationRecordId";
    SELECT * INTO engagement_row FROM "ServiceEngagement" WHERE "id" = NEW."engagementId";
    IF operation_row."id" IS NULL
      OR operation_row."operationType" <> 'service_payment_condition_record'
      OR operation_row."resultKind" <> 'service_payment_condition'
      OR operation_row."resultId" IS DISTINCT FROM NEW."id"
      OR operation_row."actorUserId" IS DISTINCT FROM NEW."createdByUserId"
      OR engagement_row."id" IS NULL
      OR engagement_row."projectId" IS DISTINCT FROM NEW."projectId"
      OR engagement_row."currentAgreementVersionId" IS DISTINCT FROM NEW."agreementVersionId"
      OR engagement_row."status" NOT IN ('awaiting_customer_action', 'active', 'suspended')
    THEN
      RAISE EXCEPTION 'Service payment condition authority is invalid' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentCondition_create_authority';
    END IF;
    IF NEW."supersedesConditionId" IS NOT NULL THEN
      -- FIX-01: the predecessor is retired *first* (same transaction), so it must
      -- already point back at this new row. The reverse direction is validated by
      -- the deferred lineage constraint trigger.
      SELECT * INTO target_row FROM "ServicePaymentCondition" WHERE "id" = NEW."supersedesConditionId";
      IF target_row."id" IS NULL
        OR target_row."engagementId" IS DISTINCT FROM NEW."engagementId"
        OR target_row."projectId" IS DISTINCT FROM NEW."projectId"
        OR target_row."supersededAt" IS NULL
        OR target_row."supersededByConditionId" IS DISTINCT FROM NEW."id"
      THEN
        RAISE EXCEPTION 'Superseded payment condition must already be retired by this successor' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentCondition_supersede_target';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
    OR OLD."engagementId" IS DISTINCT FROM NEW."engagementId"
    OR OLD."agreementVersionId" IS DISTINCT FROM NEW."agreementVersionId"
    OR OLD."agreementTermsSha256" IS DISTINCT FROM NEW."agreementTermsSha256"
    OR OLD."requirement" IS DISTINCT FROM NEW."requirement"
    OR OLD."amountMinor" IS DISTINCT FROM NEW."amountMinor"
    OR OLD."currency" IS DISTINCT FROM NEW."currency"
    OR OLD."contractualBasisCode" IS DISTINCT FROM NEW."contractualBasisCode"
    OR OLD."contractualBasisRef" IS DISTINCT FROM NEW."contractualBasisRef"
    OR OLD."contractObservationSha256" IS DISTINCT FROM NEW."contractObservationSha256"
    OR OLD."contractAuthorityCode" IS DISTINCT FROM NEW."contractAuthorityCode"
    OR OLD."contractAuthorityRequestSha256" IS DISTINCT FROM NEW."contractAuthorityRequestSha256"
    OR OLD."policyVersion" IS DISTINCT FROM NEW."policyVersion"
    OR OLD."createdByUserId" IS DISTINCT FROM NEW."createdByUserId"
    OR OLD."createdProjectRevision" IS DISTINCT FROM NEW."createdProjectRevision"
    OR OLD."createdOperationRecordId" IS DISTINCT FROM NEW."createdOperationRecordId"
    OR OLD."supersedesConditionId" IS DISTINCT FROM NEW."supersedesConditionId"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
  THEN
    RAISE EXCEPTION 'Service payment condition content is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentCondition_content_immutable';
  END IF;
  IF OLD."supersededAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Service payment condition supersession is one-way' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentCondition_supersession_once';
  END IF;
  IF NEW."supersededAt" IS NULL OR NEW."supersededByConditionId" IS NULL
    OR NEW."supersededProjectRevision" IS NULL OR NEW."supersededOperationRecordId" IS NULL
  THEN
    RAISE EXCEPTION 'Service payment condition update must be a complete supersession' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentCondition_supersession_shape';
  END IF;
  SELECT * INTO operation_row FROM "ProjectOperation" WHERE "id" = NEW."supersededOperationRecordId";
  IF operation_row."id" IS NULL
    OR operation_row."operationType" <> 'service_payment_condition_record'
    OR operation_row."resultKind" <> 'service_payment_condition'
    OR operation_row."resultId" IS DISTINCT FROM NEW."supersededByConditionId"
  THEN
    RAISE EXCEPTION 'Service payment condition supersession needs its replacement operation' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentCondition_supersede_authority';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "ServicePaymentCondition_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ServicePaymentCondition" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_005_condition_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_005_evidence_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  operation_row "ProjectOperation"%ROWTYPE;
  condition_row "ServicePaymentCondition"%ROWTYPE;
  engagement_row "ServiceEngagement"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Service payment evidence is append-only' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentEvidence_immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO operation_row FROM "ProjectOperation" WHERE "id" = NEW."submittedOperationRecordId";
    SELECT * INTO condition_row FROM "ServicePaymentCondition" WHERE "id" = NEW."conditionId";
    SELECT * INTO engagement_row FROM "ServiceEngagement" WHERE "id" = NEW."engagementId";
    IF operation_row."id" IS NULL
      OR operation_row."operationType" <> 'service_payment_evidence_submit'
      OR operation_row."resultKind" <> 'service_payment_evidence'
      OR operation_row."resultId" IS DISTINCT FROM NEW."id"
      OR operation_row."actorUserId" IS DISTINCT FROM NEW."submittedByUserId"
      OR NEW."verificationStatus" <> 'pending'
      OR condition_row."id" IS NULL
      OR condition_row."supersededAt" IS NOT NULL
      OR condition_row."projectId" IS DISTINCT FROM NEW."projectId"
      OR condition_row."engagementId" IS DISTINCT FROM NEW."engagementId"
      OR condition_row."agreementVersionId" IS DISTINCT FROM NEW."agreementVersionId"
      OR condition_row."agreementTermsSha256" IS DISTINCT FROM NEW."agreementTermsSha256"
      OR condition_row."requirement" <> 'required'
      OR condition_row."amountMinor" IS DISTINCT FROM NEW."declaredAmountMinor"
      OR condition_row."currency" IS DISTINCT FROM NEW."declaredCurrency"
      OR engagement_row."currentAgreementVersionId" IS DISTINCT FROM NEW."agreementVersionId"
      OR engagement_row."status" NOT IN ('awaiting_customer_action', 'active', 'suspended')
    THEN
      RAISE EXCEPTION 'Service payment evidence submission is not authorized for this condition' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentEvidence_submit_authority';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
    OR OLD."engagementId" IS DISTINCT FROM NEW."engagementId"
    OR OLD."conditionId" IS DISTINCT FROM NEW."conditionId"
    OR OLD."agreementVersionId" IS DISTINCT FROM NEW."agreementVersionId"
    OR OLD."agreementTermsSha256" IS DISTINCT FROM NEW."agreementTermsSha256"
    OR OLD."evidenceCategory" IS DISTINCT FROM NEW."evidenceCategory"
    OR OLD."referenceSha256" IS DISTINCT FROM NEW."referenceSha256"
    OR OLD."observationSha256" IS DISTINCT FROM NEW."observationSha256"
    OR OLD."declaredAmountMinor" IS DISTINCT FROM NEW."declaredAmountMinor"
    OR OLD."declaredCurrency" IS DISTINCT FROM NEW."declaredCurrency"
    OR OLD."paidAt" IS DISTINCT FROM NEW."paidAt"
    OR OLD."submittedByUserId" IS DISTINCT FROM NEW."submittedByUserId"
    OR OLD."submittedAt" IS DISTINCT FROM NEW."submittedAt"
    OR OLD."submittedProjectRevision" IS DISTINCT FROM NEW."submittedProjectRevision"
    OR OLD."submittedOperationRecordId" IS DISTINCT FROM NEW."submittedOperationRecordId"
  THEN
    RAISE EXCEPTION 'Service payment evidence content is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentEvidence_content_immutable';
  END IF;
  IF OLD."verificationStatus" <> 'pending' THEN
    RAISE EXCEPTION 'Service payment evidence is evaluated once' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentEvidence_single_evaluation';
  END IF;
  IF NEW."verificationStatus" NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Service payment evidence evaluation must be verified or rejected' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentEvidence_evaluation_shape';
  END IF;
  IF NEW."verifiedByUserId" = NEW."submittedByUserId" THEN
    RAISE EXCEPTION 'Service payment evidence cannot be verified by its submitter' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentEvidence_independent_verifier';
  END IF;
  SELECT * INTO operation_row FROM "ProjectOperation" WHERE "id" = NEW."verificationOperationRecordId";
  IF operation_row."id" IS NULL
    OR operation_row."operationType" <> 'service_payment_evidence_verify'
    OR operation_row."resultKind" <> 'service_payment_evidence'
    OR operation_row."resultId" IS DISTINCT FROM NEW."id"
    OR operation_row."actorUserId" IS DISTINCT FROM NEW."verifiedByUserId"
  THEN
    RAISE EXCEPTION 'Service payment evidence evaluation needs its verification operation' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentEvidence_verify_authority';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "ServicePaymentEvidence_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ServicePaymentEvidence" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_005_evidence_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_005_resolution_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  operation_row "ProjectOperation"%ROWTYPE;
  condition_row "ServicePaymentCondition"%ROWTYPE;
  evidence_row "ServicePaymentEvidence"%ROWTYPE;
  target_row "ServicePaymentResolution"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Service payment resolutions are append-only' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentResolution_immutable';
  END IF;
  SELECT * INTO operation_row FROM "ProjectOperation" WHERE "id" = NEW."operationRecordId";
  SELECT * INTO condition_row FROM "ServicePaymentCondition" WHERE "id" = NEW."conditionId";
  IF operation_row."id" IS NULL
    OR operation_row."operationType" <> 'service_payment_resolution_record'
    OR operation_row."resultKind" <> 'service_payment_resolution'
    OR operation_row."resultId" IS DISTINCT FROM NEW."id"
    OR operation_row."actorUserId" IS DISTINCT FROM NEW."recordedByUserId"
    OR condition_row."id" IS NULL
    OR condition_row."supersededAt" IS NOT NULL
    OR condition_row."projectId" IS DISTINCT FROM NEW."projectId"
    OR condition_row."engagementId" IS DISTINCT FROM NEW."engagementId"
  THEN
    RAISE EXCEPTION 'Service payment resolution authority is invalid' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentResolution_create_authority';
  END IF;
  IF NEW."evidenceId" IS NOT NULL THEN
    SELECT * INTO evidence_row FROM "ServicePaymentEvidence" WHERE "id" = NEW."evidenceId";
    IF evidence_row."id" IS NULL
      OR evidence_row."conditionId" IS DISTINCT FROM NEW."conditionId"
      OR evidence_row."projectId" IS DISTINCT FROM NEW."projectId"
      OR evidence_row."engagementId" IS DISTINCT FROM NEW."engagementId"
      OR evidence_row."verificationStatus" <> 'verified'
    THEN
      RAISE EXCEPTION 'Service payment resolution must target verified evidence of this condition' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentResolution_evidence_target';
    END IF;
  END IF;
  IF NEW."resolutionKind" = 'correction' THEN
    SELECT * INTO target_row FROM "ServicePaymentResolution" WHERE "id" = NEW."supersedesResolutionId";
    IF target_row."id" IS NULL
      OR target_row."conditionId" IS DISTINCT FROM NEW."conditionId"
      OR target_row."resolutionKind" = 'correction'
    THEN
      RAISE EXCEPTION 'A correction must supersede one earlier resolution of this condition' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentResolution_correction_target';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "ServicePaymentResolution" r
      WHERE r."supersedesResolutionId" = NEW."supersedesResolutionId"
    ) THEN
      RAISE EXCEPTION 'That resolution was already superseded' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentResolution_correction_once';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "ServicePaymentResolution_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ServicePaymentResolution" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_005_resolution_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_005_operation_complete"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  expected_result text;
  expected_event text;
  expected_subject text;
  target_project uuid;
  target_revision integer;
  target_subject uuid;
  event_count integer;
BEGIN
  IF NEW."operationType" NOT IN (
    'service_payment_condition_record', 'service_payment_evidence_submit',
    'service_payment_evidence_verify', 'service_payment_resolution_record')
  THEN
    RETURN NULL;
  END IF;
  IF NEW."actorKind" <> 'user' OR NEW."actorUserId" IS NULL THEN
    RAISE EXCEPTION 'Service payment operations require an authenticated user actor' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentOperation_actor_required';
  END IF;
  IF NEW."operationType" = 'service_payment_condition_record' THEN
    expected_result := 'service_payment_condition';
    expected_event := 'service_payment_condition_recorded';
    expected_subject := 'service_payment_condition';
    SELECT c."projectId", c."createdProjectRevision", c."id" INTO target_project, target_revision, target_subject
      FROM "ServicePaymentCondition" c WHERE c."id" = NEW."resultId" AND c."createdOperationRecordId" = NEW."id";
  ELSIF NEW."operationType" = 'service_payment_evidence_submit' THEN
    expected_result := 'service_payment_evidence';
    expected_event := 'service_payment_evidence_recorded';
    expected_subject := 'service_payment_evidence';
    SELECT e."projectId", e."submittedProjectRevision", e."id" INTO target_project, target_revision, target_subject
      FROM "ServicePaymentEvidence" e WHERE e."id" = NEW."resultId" AND e."submittedOperationRecordId" = NEW."id";
  ELSIF NEW."operationType" = 'service_payment_evidence_verify' THEN
    expected_result := 'service_payment_evidence';
    expected_subject := 'service_payment_evidence';
    SELECT e."projectId", e."verificationProjectRevision", e."id",
           CASE WHEN e."verificationStatus" = 'verified' THEN 'service_payment_evidence_verified'
                ELSE 'service_payment_evidence_rejected' END
      INTO target_project, target_revision, target_subject, expected_event
      FROM "ServicePaymentEvidence" e
      WHERE e."id" = NEW."resultId" AND e."verificationOperationRecordId" = NEW."id" AND e."verificationStatus" IN ('verified', 'rejected');
  ELSE
    expected_result := 'service_payment_resolution';
    expected_event := 'service_payment_resolution_recorded';
    expected_subject := 'service_payment_resolution';
    SELECT r."projectId", r."resolvedProjectRevision", r."id" INTO target_project, target_revision, target_subject
      FROM "ServicePaymentResolution" r WHERE r."id" = NEW."resultId" AND r."operationRecordId" = NEW."id";
  END IF;
  IF NEW."resultKind" IS DISTINCT FROM expected_result
    OR target_project IS NULL OR target_revision IS NULL OR target_subject IS NULL
  THEN
    RAISE EXCEPTION 'Service payment operation requires matching persisted evidence' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentOperation_evidence_required';
  END IF;
  SELECT count(*) INTO event_count FROM "ProjectEvent" e WHERE e."operationRecordId" = NEW."id";
  IF event_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM "ProjectEvent" e
    WHERE e."operationRecordId" = NEW."id"
      AND e."projectId" = target_project
      AND e."projectRevision" = target_revision
      AND e."eventType" = expected_event
      AND e."subjectKind" = expected_subject
      AND e."subjectId" = target_subject
      AND e."actorKind" = 'user'
      AND e."actorUserId" = NEW."actorUserId"
  ) THEN
    RAISE EXCEPTION 'Service payment operation requires exactly one matching Project revision event' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentOperation_event_required';
  END IF;
  RETURN NULL;
END;
$fn$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ServicePaymentOperation_complete" AFTER INSERT ON "ProjectOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "phase13_m4_005_operation_complete"();
--> statement-breakpoint
-- FIX-01: supersession lineage is validated by a DEFERRED constraint trigger, so
-- the retiring UPDATE may precede the successor INSERT inside one transaction. Both
-- directions must agree at COMMIT, and the pairing columns are immutable, so a
-- committed lineage can never drift afterwards.
CREATE FUNCTION "phase13_m4_005_condition_lineage"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  predecessor "ServicePaymentCondition"%ROWTYPE;
  successor "ServicePaymentCondition"%ROWTYPE;
BEGIN
  IF NEW."supersededByConditionId" IS NOT NULL THEN
    SELECT * INTO successor FROM "ServicePaymentCondition" WHERE "id" = NEW."supersededByConditionId";
    IF successor."id" IS NULL
      OR successor."id" = NEW."id"
      OR successor."projectId" IS DISTINCT FROM NEW."projectId"
      OR successor."engagementId" IS DISTINCT FROM NEW."engagementId"
      OR successor."supersedesConditionId" IS DISTINCT FROM NEW."id"
      OR successor."createdProjectRevision" < NEW."supersededProjectRevision"
    THEN
      RAISE EXCEPTION 'Supersession lineage is incomplete or inconsistent' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentCondition_supersede_lineage';
    END IF;
  END IF;
  IF NEW."supersedesConditionId" IS NOT NULL THEN
    SELECT * INTO predecessor FROM "ServicePaymentCondition" WHERE "id" = NEW."supersedesConditionId";
    IF predecessor."id" IS NULL
      OR predecessor."id" = NEW."id"
      OR predecessor."projectId" IS DISTINCT FROM NEW."projectId"
      OR predecessor."engagementId" IS DISTINCT FROM NEW."engagementId"
      OR predecessor."supersededByConditionId" IS DISTINCT FROM NEW."id"
      OR predecessor."supersededAt" IS NULL
    THEN
      RAISE EXCEPTION 'Superseded condition does not reference this successor' USING ERRCODE = '23514', CONSTRAINT = 'ServicePaymentCondition_supersede_lineage';
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ServicePaymentCondition_supersession_lineage" AFTER INSERT OR UPDATE ON "ServicePaymentCondition" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "phase13_m4_005_condition_lineage"();
--> statement-breakpoint
-- The successor pointer is a real foreign key, deferred so the retiring UPDATE may
-- name a row inserted later in the same transaction. Declared here (not in
-- schema.ts) exactly like Migration 0043's `ServiceEngagement_current_agreement_fk`.
DO $$ BEGIN
 ALTER TABLE "ServicePaymentCondition" ADD CONSTRAINT "ServicePaymentCondition_superseded_by_fk" FOREIGN KEY ("supersededByConditionId","projectId") REFERENCES "public"."ServicePaymentCondition"("id","projectId") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
