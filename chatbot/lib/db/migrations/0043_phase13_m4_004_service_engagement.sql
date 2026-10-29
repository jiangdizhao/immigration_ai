CREATE TABLE IF NOT EXISTS "ProjectResourceDisclosureGrant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"resourceOwnerUserId" uuid NOT NULL,
	"recipientAssignmentId" uuid NOT NULL,
	"recipientUserId" uuid NOT NULL,
	"resourceCategory" varchar(32) NOT NULL,
	"resourceId" uuid NOT NULL,
	"resourceVersion" integer NOT NULL,
	"resourceFingerprint" varchar(128) NOT NULL,
	"purposeCode" varchar(64) NOT NULL,
	"noticeVersion" varchar(128) NOT NULL,
	"noticeSha256" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'granted' NOT NULL,
	"grantedByUserId" uuid NOT NULL,
	"grantedAt" timestamp NOT NULL,
	"grantedProjectRevision" integer NOT NULL,
	"createdOperationRecordId" uuid NOT NULL,
	"expiresAt" timestamp,
	"revokedByUserId" uuid,
	"revokedAt" timestamp,
	"revokedProjectRevision" integer,
	"revokedOperationRecordId" uuid,
	"revocationReasonCode" varchar(32)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ServiceAgreementAcceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagementId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"agreementVersionId" uuid NOT NULL,
	"termsSha256" varchar(64) NOT NULL,
	"acceptedByUserId" uuid NOT NULL,
	"customerNoticeVersion" varchar(128) NOT NULL,
	"customerNoticeSha256" varchar(64) NOT NULL,
	"acceptedProjectRevision" integer NOT NULL,
	"acceptedAt" timestamp NOT NULL,
	"operationRecordId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ServiceAgreementVersion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagementId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"versionNumber" integer NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"termsSchemaVersion" varchar(64) NOT NULL,
	"termsPayload" text NOT NULL,
	"termsSha256" varchar(64) NOT NULL,
	"scopeCodes" text[] NOT NULL,
	"customerNoticeVersion" varchar(128) NOT NULL,
	"customerNoticeSha256" varchar(64) NOT NULL,
	"authoredByUserId" uuid NOT NULL,
	"authorityCode" varchar(64) NOT NULL,
	"createdProjectRevision" integer NOT NULL,
	"createdOperationRecordId" uuid NOT NULL,
	"issuedAt" timestamp,
	"issuedProjectRevision" integer,
	"issuedOperationRecordId" uuid,
	"supersedesAgreementVersionId" uuid,
	"supersededByAgreementVersionId" uuid,
	"supersededAt" timestamp,
	"supersededOperationRecordId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ServiceEngagement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"customerOwnerUserId" uuid NOT NULL,
	"serviceMode" varchar(32) NOT NULL,
	"scopeCodes" text[] NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"currentAgreementVersionId" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"createdProjectRevision" integer NOT NULL,
	"lastProjectRevision" integer NOT NULL,
	"createdOperationRecordId" uuid NOT NULL,
	"lastOperationRecordId" uuid NOT NULL,
	"activatedProjectRevision" integer,
	"activatedAt" timestamp,
	"suspendedAt" timestamp,
	"terminatedAt" timestamp,
	"terminalReasonCode" varchar(32),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ServiceSignatureEvidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagementId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"agreementVersionId" uuid NOT NULL,
	"termsSha256" varchar(64) NOT NULL,
	"signerUserId" uuid NOT NULL,
	"signerRole" varchar(32) DEFAULT 'customer_owner' NOT NULL,
	"evidenceRef" varchar(256) NOT NULL,
	"evidenceSha256" varchar(64) NOT NULL,
	"signaturePayloadSha256" varchar(64) NOT NULL,
	"declaredSignedAt" timestamp NOT NULL,
	"verificationStatus" varchar(16) DEFAULT 'pending' NOT NULL,
	"verificationMethod" varchar(64) DEFAULT 'unverified' NOT NULL,
	"verificationProviderCode" varchar(64),
	"verificationProvenance" varchar(256),
	"submittedByUserId" uuid NOT NULL,
	"submittedAt" timestamp NOT NULL,
	"submittedProjectRevision" integer NOT NULL,
	"submittedOperationRecordId" uuid NOT NULL,
	"verifiedAt" timestamp,
	"verificationProjectRevision" integer,
	"verificationOperationRecordId" uuid,
	"rejectionReasonCode" varchar(64)
);
--> statement-breakpoint
--> statement-breakpoint
-- Composite referenced keys must exist before PostgreSQL accepts composite FKs.
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceEngagement_id_project_unique" ON "ServiceEngagement" USING btree ("id","projectId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceEngagement_id_project_owner_unique" ON "ServiceEngagement" USING btree ("id","projectId","customerOwnerUserId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAgreementVersion_hash_identity_unique" ON "ServiceAgreementVersion" USING btree ("id","engagementId","termsSha256");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectResourceDisclosureGrant" ADD CONSTRAINT "ProjectResourceDisclosureGrant_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectResourceDisclosureGrant" ADD CONSTRAINT "ProjectResourceDisclosureGrant_resourceOwnerUserId_User_id_fk" FOREIGN KEY ("resourceOwnerUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectResourceDisclosureGrant" ADD CONSTRAINT "ProjectResourceDisclosureGrant_grantedByUserId_User_id_fk" FOREIGN KEY ("grantedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectResourceDisclosureGrant" ADD CONSTRAINT "ProjectResourceDisclosureGrant_createdOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("createdOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectResourceDisclosureGrant" ADD CONSTRAINT "ProjectResourceDisclosureGrant_revokedByUserId_User_id_fk" FOREIGN KEY ("revokedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectResourceDisclosureGrant" ADD CONSTRAINT "ProjectResourceDisclosureGrant_revokedOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("revokedOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectResourceDisclosureGrant" ADD CONSTRAINT "ProjectResourceDisclosureGrant_assignment_fk" FOREIGN KEY ("recipientAssignmentId","projectId","recipientUserId") REFERENCES "public"."ProjectStaffAssignment"("id","projectId","staffUserId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceAgreementAcceptance" ADD CONSTRAINT "ServiceAgreementAcceptance_acceptedByUserId_User_id_fk" FOREIGN KEY ("acceptedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceAgreementAcceptance" ADD CONSTRAINT "ServiceAgreementAcceptance_operationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("operationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceAgreementAcceptance" ADD CONSTRAINT "ServiceAgreementAcceptance_version_hash_fk" FOREIGN KEY ("agreementVersionId","engagementId","termsSha256") REFERENCES "public"."ServiceAgreementVersion"("id","engagementId","termsSha256") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceAgreementAcceptance" ADD CONSTRAINT "ServiceAgreementAcceptance_engagement_fk" FOREIGN KEY ("engagementId","projectId") REFERENCES "public"."ServiceEngagement"("id","projectId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceAgreementVersion" ADD CONSTRAINT "ServiceAgreementVersion_authoredByUserId_User_id_fk" FOREIGN KEY ("authoredByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceAgreementVersion" ADD CONSTRAINT "ServiceAgreementVersion_createdOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("createdOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceAgreementVersion" ADD CONSTRAINT "ServiceAgreementVersion_issuedOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("issuedOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceAgreementVersion" ADD CONSTRAINT "ServiceAgreementVersion_supersedesAgreementVersionId_ServiceAgreementVersion_id_fk" FOREIGN KEY ("supersedesAgreementVersionId") REFERENCES "public"."ServiceAgreementVersion"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceAgreementVersion" ADD CONSTRAINT "ServiceAgreementVersion_supersededByAgreementVersionId_ServiceAgreementVersion_id_fk" FOREIGN KEY ("supersededByAgreementVersionId") REFERENCES "public"."ServiceAgreementVersion"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceAgreementVersion" ADD CONSTRAINT "ServiceAgreementVersion_supersededOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("supersededOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceAgreementVersion" ADD CONSTRAINT "ServiceAgreementVersion_engagement_fk" FOREIGN KEY ("engagementId","projectId") REFERENCES "public"."ServiceEngagement"("id","projectId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceEngagement" ADD CONSTRAINT "ServiceEngagement_createdOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("createdOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceEngagement" ADD CONSTRAINT "ServiceEngagement_lastOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("lastOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceEngagement" ADD CONSTRAINT "ServiceEngagement_project_owner_fk" FOREIGN KEY ("projectId","customerOwnerUserId") REFERENCES "public"."StudyJourneyProject"("id","ownerUserId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceSignatureEvidence" ADD CONSTRAINT "ServiceSignatureEvidence_submittedByUserId_User_id_fk" FOREIGN KEY ("submittedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceSignatureEvidence" ADD CONSTRAINT "ServiceSignatureEvidence_submittedOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("submittedOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceSignatureEvidence" ADD CONSTRAINT "ServiceSignatureEvidence_verificationOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("verificationOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceSignatureEvidence" ADD CONSTRAINT "ServiceSignatureEvidence_version_hash_fk" FOREIGN KEY ("agreementVersionId","engagementId","termsSha256") REFERENCES "public"."ServiceAgreementVersion"("id","engagementId","termsSha256") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ServiceSignatureEvidence" ADD CONSTRAINT "ServiceSignatureEvidence_engagement_owner_fk" FOREIGN KEY ("engagementId","projectId","signerUserId") REFERENCES "public"."ServiceEngagement"("id","projectId","customerOwnerUserId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectResourceDisclosureGrant_id_project_unique" ON "ProjectResourceDisclosureGrant" USING btree ("id","projectId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectResourceDisclosureGrant_live_unique" ON "ProjectResourceDisclosureGrant" USING btree ("projectId","resourceCategory","resourceId","resourceVersion","recipientAssignmentId","purposeCode") WHERE "ProjectResourceDisclosureGrant"."status" = 'granted';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectResourceDisclosureGrant_created_operation_unique" ON "ProjectResourceDisclosureGrant" USING btree ("createdOperationRecordId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectResourceDisclosureGrant_revoked_operation_unique" ON "ProjectResourceDisclosureGrant" USING btree ("revokedOperationRecordId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectResourceDisclosureGrant_recipient_status_idx" ON "ProjectResourceDisclosureGrant" USING btree ("projectId","recipientUserId","status","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectResourceDisclosureGrant_owner_status_idx" ON "ProjectResourceDisclosureGrant" USING btree ("projectId","resourceOwnerUserId","status","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAgreementAcceptance_version_unique" ON "ServiceAgreementAcceptance" USING btree ("agreementVersionId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAgreementAcceptance_operation_unique" ON "ServiceAgreementAcceptance" USING btree ("operationRecordId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAgreementVersion_number_unique" ON "ServiceAgreementVersion" USING btree ("engagementId","versionNumber");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAgreementVersion_engagement_identity_unique" ON "ServiceAgreementVersion" USING btree ("id","engagementId","projectId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAgreementVersion_id_engagement_unique" ON "ServiceAgreementVersion" USING btree ("id","engagementId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAgreementVersion_hash_identity_unique" ON "ServiceAgreementVersion" USING btree ("id","engagementId","termsSha256");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAgreementVersion_issued_unique" ON "ServiceAgreementVersion" USING btree ("engagementId") WHERE "ServiceAgreementVersion"."status" = 'issued';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ServiceAgreementVersion_engagement_status_idx" ON "ServiceAgreementVersion" USING btree ("engagementId","status","versionNumber");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceEngagement_id_project_unique" ON "ServiceEngagement" USING btree ("id","projectId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceEngagement_id_project_owner_unique" ON "ServiceEngagement" USING btree ("id","projectId","customerOwnerUserId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceEngagement_project_live_unique" ON "ServiceEngagement" USING btree ("projectId") WHERE "ServiceEngagement"."status" <> 'terminated';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ServiceEngagement_project_status_idx" ON "ServiceEngagement" USING btree ("projectId","status","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceSignatureEvidence_evidence_unique" ON "ServiceSignatureEvidence" USING btree ("agreementVersionId","signerUserId","evidenceSha256");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceSignatureEvidence_verified_version_unique" ON "ServiceSignatureEvidence" USING btree ("agreementVersionId") WHERE "ServiceSignatureEvidence"."verificationStatus" = 'verified';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceSignatureEvidence_submitted_operation_unique" ON "ServiceSignatureEvidence" USING btree ("submittedOperationRecordId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceSignatureEvidence_verification_operation_unique" ON "ServiceSignatureEvidence" USING btree ("verificationOperationRecordId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ServiceSignatureEvidence_engagement_status_idx" ON "ServiceSignatureEvidence" USING btree ("engagementId","verificationStatus","id");
-- M4-004 closed vocabulary coordination. The typed operation/result/event/subject
-- allowlists must accept the new M4-004 values while remaining closed.
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_type_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_type_check" CHECK ("operationType" IN ('project_create','project_close','membership_invite','membership_accept','membership_revoke','project_chat_create','project_document_upload_intent','project_document_import_intent','project_document_storage_finalize','project_document_storage_fail','project_document_scan_finalize','project_document_grant_create','project_document_grant_revoke','project_document_withdraw','project_requirement_state_change','project_evidence_extract','project_fact_mutation','project_staff_assignment_propose','project_staff_assignment_owner_approve','project_staff_assignment_owner_decline','project_staff_assignment_lawyer_accept','project_staff_assignment_lawyer_decline','project_staff_assignment_owner_revoke','project_staff_assignment_lawyer_resign','project_staff_assignment_admin_withdraw','project_staff_assignment_admin_revoke','project_thread_participation_consent_create','project_thread_participation_consent_withdraw','project_human_message_send','service_engagement_create','service_engagement_agreement_draft','service_engagement_agreement_issue','service_engagement_agreement_accept','service_engagement_signature_submit','service_engagement_signature_verify','service_engagement_activate','service_engagement_suspend','service_engagement_resume','service_engagement_terminate','project_resource_disclosure_grant_create','project_resource_disclosure_grant_revoke'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_result_kind_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_result_kind_check" CHECK ("resultKind" IN ('project','membership','chat','document_asset','document_version','document_scan_run','document_grant','project_requirement_state','document_extraction_run','project_fact_assertion','project_staff_assignment','project_thread_participation_consent','project_human_message','service_engagement','service_agreement_version','service_agreement_acceptance','service_signature_evidence','project_resource_disclosure_grant'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_actor_type_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_actor_type_check" CHECK (("operationType" IN ('project_create','project_close','membership_invite','membership_accept','membership_revoke','project_chat_create','project_document_upload_intent','project_document_import_intent','project_document_grant_create','project_document_grant_revoke','project_document_withdraw','project_requirement_state_change','project_evidence_extract','project_fact_mutation','project_staff_assignment_propose','project_staff_assignment_owner_approve','project_staff_assignment_owner_decline','project_staff_assignment_lawyer_accept','project_staff_assignment_lawyer_decline','project_staff_assignment_owner_revoke','project_staff_assignment_lawyer_resign','project_staff_assignment_admin_withdraw','project_staff_assignment_admin_revoke','project_thread_participation_consent_create','project_thread_participation_consent_withdraw','project_human_message_send','service_engagement_create','service_engagement_agreement_draft','service_engagement_agreement_issue','service_engagement_agreement_accept','service_engagement_signature_submit','service_engagement_signature_verify','service_engagement_activate','service_engagement_suspend','service_engagement_resume','service_engagement_terminate','project_resource_disclosure_grant_create','project_resource_disclosure_grant_revoke') AND "actorKind" = 'user') OR ("operationType" IN ('project_document_storage_finalize','project_document_storage_fail') AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_storage_worker' AND "operationId" ~ '^[0-9a-f]{64}$') OR ("operationType" = 'project_document_scan_finalize' AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_scan_worker' AND "operationId" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_type_check";
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_type_check" CHECK ("eventType" IN ('project_created','membership_state_changed','project_chat_created','project_closed','project_document_intent_created','project_document_storage_changed','project_document_security_changed','project_document_grant_changed','project_document_withdrawn','project_requirement_state_changed','project_evidence_extraction_completed','project_fact_changed','project_staff_assignment_proposed','project_staff_assignment_owner_approved','project_staff_assignment_owner_declined','project_staff_assignment_lawyer_accepted','project_staff_assignment_lawyer_declined','project_staff_assignment_owner_revoked','project_staff_assignment_lawyer_resigned','project_staff_assignment_admin_withdrawn','project_staff_assignment_admin_revoked','project_thread_participation_consent_created','project_thread_participation_consent_withdrawn','service_engagement_created','service_engagement_agreement_version_drafted','service_engagement_agreement_version_issued','service_engagement_agreement_accepted','service_engagement_signature_evidence_recorded','service_engagement_signature_evidence_verified','service_engagement_signature_evidence_rejected','service_engagement_activated','service_engagement_suspended','service_engagement_resumed','service_engagement_terminated','project_resource_disclosure_granted','project_resource_disclosure_revoked'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_subject_check";
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_subject_check" CHECK (("subjectKind" IS NULL AND "subjectId" IS NULL) OR ("subjectKind" IN ('project','membership','chat','document_asset','document_version','document_scan_run','document_grant','requirement_state','document_extraction_run','project_fact_assertion','project_staff_assignment','project_thread_participation_consent','service_engagement','service_agreement_version','service_agreement_acceptance','service_signature_evidence','project_resource_disclosure_grant') AND "subjectId" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_service_engagement_subject_check" CHECK ("eventType" NOT IN ('service_engagement_created','service_engagement_agreement_version_drafted','service_engagement_agreement_version_issued','service_engagement_agreement_accepted','service_engagement_signature_evidence_recorded','service_engagement_signature_evidence_verified','service_engagement_signature_evidence_rejected','service_engagement_activated','service_engagement_suspended','service_engagement_resumed','service_engagement_terminated','project_resource_disclosure_granted','project_resource_disclosure_revoked') OR ("eventType" IN ('service_engagement_created','service_engagement_activated','service_engagement_suspended','service_engagement_resumed','service_engagement_terminated') AND "subjectKind" = 'service_engagement') OR ("eventType" IN ('service_engagement_agreement_version_drafted','service_engagement_agreement_version_issued') AND "subjectKind" = 'service_agreement_version') OR ("eventType" = 'service_engagement_agreement_accepted' AND "subjectKind" = 'service_agreement_acceptance') OR ("eventType" IN ('service_engagement_signature_evidence_recorded','service_engagement_signature_evidence_verified','service_engagement_signature_evidence_rejected') AND "subjectKind" = 'service_signature_evidence') OR ("eventType" IN ('project_resource_disclosure_granted','project_resource_disclosure_revoked') AND "subjectKind" = 'project_resource_disclosure_grant'));
--> statement-breakpoint
-- M4-004 table constraints. Drizzle Kit does not serialize check() declarations.
ALTER TABLE "ServiceEngagement" ADD CONSTRAINT "ServiceEngagement_mode_check" CHECK ("serviceMode" IN ('self_service','managed')),
  ADD CONSTRAINT "ServiceEngagement_scope_check" CHECK ("scopeCodes" IS NOT NULL AND cardinality("scopeCodes") BETWEEN 1 AND 2 AND "scopeCodes" <@ array['school_admissions','student_500_visa']::text[]),
  ADD CONSTRAINT "ServiceEngagement_status_check" CHECK ("status" IN ('draft','awaiting_customer_action','active','suspended','terminated')),
  ADD CONSTRAINT "ServiceEngagement_revision_check" CHECK ("revision" > 0 AND "createdProjectRevision" > 0 AND "lastProjectRevision" >= "createdProjectRevision"),
  ADD CONSTRAINT "ServiceEngagement_timestamps_check" CHECK ("updatedAt" >= "createdAt"),
  ADD CONSTRAINT "ServiceEngagement_lifecycle_check" CHECK (("status" = 'draft' AND "currentAgreementVersionId" IS NULL AND "activatedAt" IS NULL AND "activatedProjectRevision" IS NULL AND "suspendedAt" IS NULL AND "terminatedAt" IS NULL AND "terminalReasonCode" IS NULL) OR ("status" = 'awaiting_customer_action' AND "currentAgreementVersionId" IS NOT NULL AND "activatedAt" IS NULL AND "activatedProjectRevision" IS NULL AND "suspendedAt" IS NULL AND "terminatedAt" IS NULL AND "terminalReasonCode" IS NULL) OR ("status" = 'active' AND "currentAgreementVersionId" IS NOT NULL AND "activatedAt" IS NOT NULL AND "activatedProjectRevision" IS NOT NULL AND "terminatedAt" IS NULL AND "terminalReasonCode" IS NULL) OR ("status" = 'suspended' AND "currentAgreementVersionId" IS NOT NULL AND "activatedAt" IS NOT NULL AND "activatedProjectRevision" IS NOT NULL AND "suspendedAt" IS NOT NULL AND "terminatedAt" IS NULL AND "terminalReasonCode" IS NULL) OR ("status" = 'terminated' AND "terminatedAt" IS NOT NULL AND "terminalReasonCode" IN ('owner_terminated','owner_requested')));
--> statement-breakpoint
ALTER TABLE "ServiceAgreementVersion" ADD CONSTRAINT "ServiceAgreementVersion_status_check" CHECK ("status" IN ('draft','issued','superseded')),
  ADD CONSTRAINT "ServiceAgreementVersion_version_check" CHECK ("versionNumber" > 0),
  ADD CONSTRAINT "ServiceAgreementVersion_hash_check" CHECK ("termsSha256" ~ '^[0-9a-f]{64}$' AND "customerNoticeSha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ServiceAgreementVersion_terms_check" CHECK (length(trim("termsSchemaVersion")) BETWEEN 1 AND 64 AND octet_length("termsPayload") BETWEEN 2 AND 65536),
  ADD CONSTRAINT "ServiceAgreementVersion_scope_check" CHECK ("scopeCodes" IS NOT NULL AND cardinality("scopeCodes") BETWEEN 1 AND 2 AND "scopeCodes" <@ array['school_admissions','student_500_visa']::text[]),
  ADD CONSTRAINT "ServiceAgreementVersion_notice_check" CHECK (length(trim("customerNoticeVersion")) BETWEEN 1 AND 128),
  ADD CONSTRAINT "ServiceAgreementVersion_authority_check" CHECK (length(trim("authorityCode")) BETWEEN 1 AND 64),
  ADD CONSTRAINT "ServiceAgreementVersion_lifecycle_check" CHECK (("status" = 'draft' AND "issuedAt" IS NULL AND "issuedProjectRevision" IS NULL AND "issuedOperationRecordId" IS NULL AND "supersededAt" IS NULL AND "supersededByAgreementVersionId" IS NULL AND "supersededOperationRecordId" IS NULL) OR ("status" = 'issued' AND "issuedAt" IS NOT NULL AND "issuedProjectRevision" IS NOT NULL AND "issuedOperationRecordId" IS NOT NULL AND "supersededAt" IS NULL AND "supersededByAgreementVersionId" IS NULL AND "supersededOperationRecordId" IS NULL) OR ("status" = 'superseded' AND "issuedAt" IS NOT NULL AND "issuedProjectRevision" IS NOT NULL AND "issuedOperationRecordId" IS NOT NULL AND "supersededAt" IS NOT NULL AND "supersededByAgreementVersionId" IS NOT NULL AND "supersededOperationRecordId" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "ServiceAgreementAcceptance" ADD CONSTRAINT "ServiceAgreementAcceptance_hash_check" CHECK ("termsSha256" ~ '^[0-9a-f]{64}$' AND "customerNoticeSha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ServiceAgreementAcceptance_notice_check" CHECK (length(trim("customerNoticeVersion")) BETWEEN 1 AND 128),
  ADD CONSTRAINT "ServiceAgreementAcceptance_revision_check" CHECK ("acceptedProjectRevision" > 0);
--> statement-breakpoint
ALTER TABLE "ServiceSignatureEvidence" ADD CONSTRAINT "ServiceSignatureEvidence_status_check" CHECK ("verificationStatus" IN ('pending','verified','rejected')),
  ADD CONSTRAINT "ServiceSignatureEvidence_signer_role_check" CHECK ("signerRole" = 'customer_owner'),
  ADD CONSTRAINT "ServiceSignatureEvidence_hash_check" CHECK ("termsSha256" ~ '^[0-9a-f]{64}$' AND "evidenceSha256" ~ '^[0-9a-f]{64}$' AND "signaturePayloadSha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ServiceSignatureEvidence_evidence_ref_check" CHECK (length(trim("evidenceRef")) BETWEEN 1 AND 256 AND "evidenceRef" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'),
  ADD CONSTRAINT "ServiceSignatureEvidence_method_check" CHECK (length(trim("verificationMethod")) BETWEEN 1 AND 64),
  ADD CONSTRAINT "ServiceSignatureEvidence_lifecycle_check" CHECK (("verificationStatus" = 'pending' AND "verificationMethod" = 'unverified' AND "verificationProviderCode" IS NULL AND "verificationProvenance" IS NULL AND "verifiedAt" IS NULL AND "verificationProjectRevision" IS NULL AND "verificationOperationRecordId" IS NULL AND "rejectionReasonCode" IS NULL) OR ("verificationStatus" IN ('verified','rejected') AND "verificationMethod" <> 'unverified' AND "verificationProviderCode" IS NOT NULL AND "verificationProvenance" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "verificationProjectRevision" IS NOT NULL AND "verificationOperationRecordId" IS NOT NULL AND (("verificationStatus" = 'verified' AND "rejectionReasonCode" IS NULL) OR ("verificationStatus" = 'rejected' AND "rejectionReasonCode" IS NOT NULL)))),
  ADD CONSTRAINT "ServiceSignatureEvidence_revision_check" CHECK ("submittedProjectRevision" > 0 AND ("verificationProjectRevision" IS NULL OR "verificationProjectRevision" > 0));
--> statement-breakpoint
ALTER TABLE "ProjectResourceDisclosureGrant" ADD CONSTRAINT "ProjectResourceDisclosureGrant_category_check" CHECK ("resourceCategory" IN ('project_fact','project_document','private_chat','financial_record','engagement_record')),
  ADD CONSTRAINT "ProjectResourceDisclosureGrant_purpose_check" CHECK ("purposeCode" IN ('professional_review','service_delivery')),
  ADD CONSTRAINT "ProjectResourceDisclosureGrant_status_check" CHECK ("status" IN ('granted','revoked','expired')),
  ADD CONSTRAINT "ProjectResourceDisclosureGrant_hash_check" CHECK ("noticeSha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ProjectResourceDisclosureGrant_notice_check" CHECK (length(trim("noticeVersion")) BETWEEN 1 AND 128),
  ADD CONSTRAINT "ProjectResourceDisclosureGrant_fingerprint_check" CHECK ("resourceFingerprint" ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$'),
  ADD CONSTRAINT "ProjectResourceDisclosureGrant_version_check" CHECK ("resourceVersion" > 0 AND "grantedProjectRevision" > 0 AND ("revokedProjectRevision" IS NULL OR "revokedProjectRevision" > "grantedProjectRevision")),
  ADD CONSTRAINT "ProjectResourceDisclosureGrant_owner_granted_by_check" CHECK ("grantedByUserId" = "resourceOwnerUserId"),
  ADD CONSTRAINT "ProjectResourceDisclosureGrant_lifecycle_check" CHECK (("status" = 'granted' AND "revokedByUserId" IS NULL AND "revokedAt" IS NULL AND "revokedProjectRevision" IS NULL AND "revokedOperationRecordId" IS NULL AND "revocationReasonCode" IS NULL) OR ("status" IN ('revoked','expired') AND "revokedByUserId" IS NOT NULL AND "revokedAt" IS NOT NULL AND "revokedProjectRevision" IS NOT NULL AND "revokedOperationRecordId" IS NOT NULL AND "revocationReasonCode" IN ('owner_revoked','owner_expired')));
--> statement-breakpoint
-- M4-004 append-only guard triggers. Repository conventions alone are not
-- sufficient immutability evidence.
CREATE FUNCTION "phase13_m4_004_engagement_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  project_row "StudyJourneyProject"%ROWTYPE;
  owner_row "User"%ROWTYPE;
  operation_row "ProjectOperation"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Service engagement rows cannot be deleted' USING ERRCODE = '23514', CONSTRAINT = 'ServiceEngagement_delete_protected';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO project_row FROM "StudyJourneyProject" WHERE "id" = NEW."projectId";
    SELECT * INTO owner_row FROM "User" WHERE "id" = NEW."customerOwnerUserId";
    SELECT * INTO operation_row FROM "ProjectOperation" WHERE "id" = NEW."createdOperationRecordId";
    IF project_row."id" IS NULL
      OR project_row."status" <> 'active'
      OR project_row."ownerUserId" IS DISTINCT FROM NEW."customerOwnerUserId"
      OR owner_row."id" IS NULL
      OR owner_row."role" <> 'user'
      OR length(trim(owner_row."email")) = 0
      OR owner_row."email" ~* '^guest-[0-9]+(-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$'
      OR NEW."status" <> 'draft'
      OR NEW."revision" <> 1
      OR NEW."currentAgreementVersionId" IS NOT NULL
      OR NEW."createdProjectRevision" <= 0
      OR NEW."lastProjectRevision" <> NEW."createdProjectRevision"
      OR NEW."lastOperationRecordId" IS DISTINCT FROM NEW."createdOperationRecordId"
      OR operation_row."id" IS NULL
      OR operation_row."operationType" <> 'service_engagement_create'
      OR operation_row."resultKind" <> 'service_engagement'
      OR operation_row."resultId" IS DISTINCT FROM NEW."id"
      OR operation_row."actorUserId" IS DISTINCT FROM NEW."customerOwnerUserId"
    THEN
      RAISE EXCEPTION 'Service engagement creation authority or identity is invalid' USING ERRCODE = '23514', CONSTRAINT = 'ServiceEngagement_create_authority';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
    OR OLD."customerOwnerUserId" IS DISTINCT FROM NEW."customerOwnerUserId"
    OR OLD."serviceMode" IS DISTINCT FROM NEW."serviceMode"
    OR OLD."scopeCodes" IS DISTINCT FROM NEW."scopeCodes"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
    OR OLD."createdProjectRevision" IS DISTINCT FROM NEW."createdProjectRevision"
    OR OLD."createdOperationRecordId" IS DISTINCT FROM NEW."createdOperationRecordId"
    OR (OLD."activatedAt" IS NOT NULL AND OLD."activatedAt" IS DISTINCT FROM NEW."activatedAt")
    OR (OLD."activatedProjectRevision" IS NOT NULL AND OLD."activatedProjectRevision" IS DISTINCT FROM NEW."activatedProjectRevision")
  THEN
    RAISE EXCEPTION 'Service engagement identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ServiceEngagement_identity_immutable';
  END IF;
  IF NEW."revision" <> OLD."revision" + 1
    OR NEW."lastProjectRevision" <= OLD."lastProjectRevision"
    OR NEW."lastOperationRecordId" IS NOT DISTINCT FROM OLD."lastOperationRecordId"
  THEN
    RAISE EXCEPTION 'Service engagement updates require exactly one new revision and operation' USING ERRCODE = '23514', CONSTRAINT = 'ServiceEngagement_revision_step';
  END IF;
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;
  IF (OLD."status" = 'draft' AND NEW."status" IN ('awaiting_customer_action', 'terminated'))
    OR (OLD."status" = 'awaiting_customer_action' AND NEW."status" IN ('active', 'terminated'))
    OR (OLD."status" = 'active' AND NEW."status" IN ('suspended', 'terminated'))
    OR (OLD."status" = 'suspended' AND NEW."status" IN ('active', 'terminated'))
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Service engagement lifecycle transition is not permitted' USING ERRCODE = '23514', CONSTRAINT = 'ServiceEngagement_transition';
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "ServiceEngagement_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ServiceEngagement" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_004_engagement_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_004_agreement_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  engagement_row "ServiceEngagement"%ROWTYPE;
  author_row "User"%ROWTYPE;
  operation_row "ProjectOperation"%ROWTYPE;
  next_number integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Service agreement versions cannot be deleted' USING ERRCODE = '23514', CONSTRAINT = 'ServiceAgreementVersion_delete_protected';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO engagement_row FROM "ServiceEngagement" WHERE "id" = NEW."engagementId";
    SELECT * INTO author_row FROM "User" WHERE "id" = NEW."authoredByUserId";
    SELECT * INTO operation_row FROM "ProjectOperation" WHERE "id" = NEW."createdOperationRecordId";
    SELECT coalesce(max(v."versionNumber"), 0) + 1 INTO next_number FROM "ServiceAgreementVersion" v WHERE v."engagementId" = NEW."engagementId";
    IF engagement_row."id" IS NULL
      OR engagement_row."projectId" IS DISTINCT FROM NEW."projectId"
      OR engagement_row."status" NOT IN ('draft', 'awaiting_customer_action')
      OR engagement_row."scopeCodes" IS DISTINCT FROM NEW."scopeCodes"
      OR author_row."id" IS NULL
      OR author_row."role" NOT IN ('lawyer', 'admin')
      OR length(trim(author_row."email")) = 0
      OR author_row."email" ~* '^guest-[0-9]+(-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$'
      OR NEW."status" <> 'draft'
      OR NEW."versionNumber" <> next_number
      OR operation_row."id" IS NULL
      OR operation_row."operationType" <> 'service_engagement_agreement_draft'
      OR operation_row."resultKind" <> 'service_agreement_version'
      OR operation_row."resultId" IS DISTINCT FROM NEW."id"
      OR operation_row."actorUserId" IS DISTINCT FROM NEW."authoredByUserId"
    THEN
      RAISE EXCEPTION 'Service agreement version creation authority is invalid' USING ERRCODE = '23514', CONSTRAINT = 'ServiceAgreementVersion_create_authority';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."engagementId" IS DISTINCT FROM NEW."engagementId"
    OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
    OR OLD."versionNumber" IS DISTINCT FROM NEW."versionNumber"
    OR OLD."termsSchemaVersion" IS DISTINCT FROM NEW."termsSchemaVersion"
    OR OLD."termsPayload" IS DISTINCT FROM NEW."termsPayload"
    OR OLD."termsSha256" IS DISTINCT FROM NEW."termsSha256"
    OR OLD."scopeCodes" IS DISTINCT FROM NEW."scopeCodes"
    OR OLD."customerNoticeVersion" IS DISTINCT FROM NEW."customerNoticeVersion"
    OR OLD."customerNoticeSha256" IS DISTINCT FROM NEW."customerNoticeSha256"
    OR OLD."authoredByUserId" IS DISTINCT FROM NEW."authoredByUserId"
    OR OLD."authorityCode" IS DISTINCT FROM NEW."authorityCode"
    OR OLD."createdProjectRevision" IS DISTINCT FROM NEW."createdProjectRevision"
    OR OLD."createdOperationRecordId" IS DISTINCT FROM NEW."createdOperationRecordId"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
    OR (OLD."issuedAt" IS NOT NULL AND OLD."issuedAt" IS DISTINCT FROM NEW."issuedAt")
    OR (OLD."issuedProjectRevision" IS NOT NULL AND OLD."issuedProjectRevision" IS DISTINCT FROM NEW."issuedProjectRevision")
    OR (OLD."issuedOperationRecordId" IS NOT NULL AND OLD."issuedOperationRecordId" IS DISTINCT FROM NEW."issuedOperationRecordId")
    OR (OLD."supersedesAgreementVersionId" IS NOT NULL AND OLD."supersedesAgreementVersionId" IS DISTINCT FROM NEW."supersedesAgreementVersionId")
  THEN
    RAISE EXCEPTION 'Service agreement version content is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ServiceAgreementVersion_content_immutable';
  END IF;
  IF OLD."status" = 'draft' AND NEW."status" = 'issued' THEN
    IF OLD."issuedAt" IS NOT NULL OR NEW."issuedAt" IS NULL OR NEW."issuedProjectRevision" IS NULL OR NEW."issuedOperationRecordId" IS NULL THEN
      RAISE EXCEPTION 'Service agreement issuance requires immutable issuance evidence' USING ERRCODE = '23514', CONSTRAINT = 'ServiceAgreementVersion_issue_evidence';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" = 'issued' AND NEW."status" = 'superseded' THEN
    IF NEW."supersededAt" IS NULL OR NEW."supersededByAgreementVersionId" IS NULL OR NEW."supersededOperationRecordId" IS NULL THEN
      RAISE EXCEPTION 'Service agreement supersession requires immutable replacement evidence' USING ERRCODE = '23514', CONSTRAINT = 'ServiceAgreementVersion_supersede_evidence';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Service agreement version permits only draft to issued or issued to superseded' USING ERRCODE = '23514', CONSTRAINT = 'ServiceAgreementVersion_transition';
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "ServiceAgreementVersion_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ServiceAgreementVersion" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_004_agreement_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_004_acceptance_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  engagement_row "ServiceEngagement"%ROWTYPE;
  version_row "ServiceAgreementVersion"%ROWTYPE;
  acceptor_row "User"%ROWTYPE;
  operation_row "ProjectOperation"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Service agreement acceptances are append-only' USING ERRCODE = '23514', CONSTRAINT = 'ServiceAgreementAcceptance_append_only';
  END IF;
  SELECT * INTO engagement_row FROM "ServiceEngagement" WHERE "id" = NEW."engagementId";
  SELECT * INTO version_row FROM "ServiceAgreementVersion" WHERE "id" = NEW."agreementVersionId";
  SELECT * INTO acceptor_row FROM "User" WHERE "id" = NEW."acceptedByUserId";
  SELECT * INTO operation_row FROM "ProjectOperation" WHERE "id" = NEW."operationRecordId";
  IF engagement_row."id" IS NULL
    OR engagement_row."projectId" IS DISTINCT FROM NEW."projectId"
    OR engagement_row."status" <> 'awaiting_customer_action'
    OR engagement_row."currentAgreementVersionId" IS DISTINCT FROM NEW."agreementVersionId"
    OR version_row."id" IS NULL
    OR version_row."status" <> 'issued'
    OR version_row."engagementId" IS DISTINCT FROM NEW."engagementId"
    OR version_row."termsSha256" IS DISTINCT FROM NEW."termsSha256"
    OR version_row."customerNoticeVersion" IS DISTINCT FROM NEW."customerNoticeVersion"
    OR acceptor_row."id" IS NULL
    OR acceptor_row."role" <> 'user'
    OR NEW."acceptedByUserId" IS DISTINCT FROM engagement_row."customerOwnerUserId"
    OR operation_row."id" IS NULL
    OR operation_row."operationType" <> 'service_engagement_agreement_accept'
    OR operation_row."resultKind" <> 'service_agreement_acceptance'
    OR operation_row."resultId" IS DISTINCT FROM NEW."id"
    OR operation_row."actorUserId" IS DISTINCT FROM NEW."acceptedByUserId"
  THEN
    RAISE EXCEPTION 'Service agreement acceptance requires the exact current issued version and owner actor' USING ERRCODE = '23514', CONSTRAINT = 'ServiceAgreementAcceptance_authority';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "ServiceAgreementAcceptance_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ServiceAgreementAcceptance" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_004_acceptance_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_004_signature_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  engagement_row "ServiceEngagement"%ROWTYPE;
  version_row "ServiceAgreementVersion"%ROWTYPE;
  submitter_row "User"%ROWTYPE;
  operation_row "ProjectOperation"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Service signature evidence cannot be deleted' USING ERRCODE = '23514', CONSTRAINT = 'ServiceSignatureEvidence_delete_protected';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO engagement_row FROM "ServiceEngagement" WHERE "id" = NEW."engagementId";
    SELECT * INTO version_row FROM "ServiceAgreementVersion" WHERE "id" = NEW."agreementVersionId";
    SELECT * INTO submitter_row FROM "User" WHERE "id" = NEW."submittedByUserId";
    SELECT * INTO operation_row FROM "ProjectOperation" WHERE "id" = NEW."submittedOperationRecordId";
    IF engagement_row."id" IS NULL
      OR engagement_row."projectId" IS DISTINCT FROM NEW."projectId"
      OR engagement_row."status" <> 'awaiting_customer_action'
      OR engagement_row."currentAgreementVersionId" IS DISTINCT FROM NEW."agreementVersionId"
      OR version_row."id" IS NULL
      OR version_row."status" <> 'issued'
      OR version_row."termsSha256" IS DISTINCT FROM NEW."termsSha256"
      OR submitter_row."id" IS NULL
      OR submitter_row."role" <> 'user'
      OR NEW."signerUserId" IS DISTINCT FROM engagement_row."customerOwnerUserId"
      OR NEW."submittedByUserId" IS DISTINCT FROM NEW."signerUserId"
      OR NEW."verificationStatus" <> 'pending'
      OR NEW."declaredSignedAt" > NEW."submittedAt" + interval '5 minutes' 
      OR NOT EXISTS (SELECT 1 FROM "ServiceAgreementAcceptance" a WHERE a."agreementVersionId" = NEW."agreementVersionId" AND a."termsSha256" = NEW."termsSha256" AND a."acceptedByUserId" = NEW."signerUserId")
      OR operation_row."id" IS NULL
      OR operation_row."operationType" <> 'service_engagement_signature_submit'
      OR operation_row."resultKind" <> 'service_signature_evidence'
      OR operation_row."resultId" IS DISTINCT FROM NEW."id"
      OR operation_row."actorUserId" IS DISTINCT FROM NEW."submittedByUserId"
    THEN
      RAISE EXCEPTION 'Service signature evidence requires the accepted current version and the exact customer owner' USING ERRCODE = '23514', CONSTRAINT = 'ServiceSignatureEvidence_create_authority';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."engagementId" IS DISTINCT FROM NEW."engagementId"
    OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
    OR OLD."agreementVersionId" IS DISTINCT FROM NEW."agreementVersionId"
    OR OLD."termsSha256" IS DISTINCT FROM NEW."termsSha256"
    OR OLD."signerUserId" IS DISTINCT FROM NEW."signerUserId"
    OR OLD."signerRole" IS DISTINCT FROM NEW."signerRole"
    OR OLD."evidenceRef" IS DISTINCT FROM NEW."evidenceRef"
    OR OLD."evidenceSha256" IS DISTINCT FROM NEW."evidenceSha256"
    OR OLD."signaturePayloadSha256" IS DISTINCT FROM NEW."signaturePayloadSha256"
    OR OLD."declaredSignedAt" IS DISTINCT FROM NEW."declaredSignedAt"
    OR OLD."submittedByUserId" IS DISTINCT FROM NEW."submittedByUserId"
    OR OLD."submittedAt" IS DISTINCT FROM NEW."submittedAt"
    OR OLD."submittedProjectRevision" IS DISTINCT FROM NEW."submittedProjectRevision"
    OR OLD."submittedOperationRecordId" IS DISTINCT FROM NEW."submittedOperationRecordId"
  THEN
    RAISE EXCEPTION 'Service signature evidence identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ServiceSignatureEvidence_identity_immutable';
  END IF;
  IF OLD."verificationStatus" <> 'pending' OR NEW."verificationStatus" NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Service signature evidence permits only one pending verification outcome' USING ERRCODE = '23514', CONSTRAINT = 'ServiceSignatureEvidence_transition';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "ServiceSignatureEvidence_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ServiceSignatureEvidence" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_004_signature_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_004_disclosure_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  project_row "StudyJourneyProject"%ROWTYPE;
  owner_row "User"%ROWTYPE;
  assignment_row "ProjectStaffAssignment"%ROWTYPE;
  operation_row "ProjectOperation"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Project resource disclosure grants cannot be deleted' USING ERRCODE = '23514', CONSTRAINT = 'ProjectResourceDisclosureGrant_delete_protected';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO project_row FROM "StudyJourneyProject" WHERE "id" = NEW."projectId";
    SELECT * INTO owner_row FROM "User" WHERE "id" = NEW."resourceOwnerUserId";
    SELECT * INTO assignment_row FROM "ProjectStaffAssignment" WHERE "id" = NEW."recipientAssignmentId";
    SELECT * INTO operation_row FROM "ProjectOperation" WHERE "id" = NEW."createdOperationRecordId";
    IF project_row."id" IS NULL
      OR project_row."status" <> 'active'
      OR owner_row."id" IS NULL
      OR owner_row."role" <> 'user'
      OR length(trim(owner_row."email")) = 0
      OR owner_row."email" ~* '^guest-[0-9]+(-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$'
      OR NOT (project_row."ownerUserId" = NEW."resourceOwnerUserId" OR EXISTS (SELECT 1 FROM "ProjectMembership" m WHERE m."projectId" = NEW."projectId" AND m."userId" = NEW."resourceOwnerUserId" AND m."status" = 'active'))
      OR assignment_row."id" IS NULL
      OR assignment_row."projectId" IS DISTINCT FROM NEW."projectId"
      OR assignment_row."status" <> 'active'
      OR assignment_row."purpose" <> 'project_staff_collaboration'
      OR assignment_row."staffUserId" IS DISTINCT FROM NEW."recipientUserId"
      OR NEW."status" <> 'granted'
      OR (NEW."expiresAt" IS NOT NULL AND NEW."expiresAt" <= NEW."grantedAt")
      OR operation_row."id" IS NULL
      OR operation_row."operationType" <> 'project_resource_disclosure_grant_create'
      OR operation_row."resultKind" <> 'project_resource_disclosure_grant'
      OR operation_row."resultId" IS DISTINCT FROM NEW."id"
      OR operation_row."actorUserId" IS DISTINCT FROM NEW."grantedByUserId"
    THEN
      RAISE EXCEPTION 'Project resource disclosure grant requires the exact resource owner, active assignment and recipient' USING ERRCODE = '23514', CONSTRAINT = 'ProjectResourceDisclosureGrant_create_authority';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
    OR OLD."resourceOwnerUserId" IS DISTINCT FROM NEW."resourceOwnerUserId"
    OR OLD."recipientAssignmentId" IS DISTINCT FROM NEW."recipientAssignmentId"
    OR OLD."recipientUserId" IS DISTINCT FROM NEW."recipientUserId"
    OR OLD."resourceCategory" IS DISTINCT FROM NEW."resourceCategory"
    OR OLD."resourceId" IS DISTINCT FROM NEW."resourceId"
    OR OLD."resourceVersion" IS DISTINCT FROM NEW."resourceVersion"
    OR OLD."purposeCode" IS DISTINCT FROM NEW."purposeCode"
    OR OLD."noticeVersion" IS DISTINCT FROM NEW."noticeVersion"
    OR OLD."noticeSha256" IS DISTINCT FROM NEW."noticeSha256"
    OR OLD."grantedByUserId" IS DISTINCT FROM NEW."grantedByUserId"
    OR OLD."grantedAt" IS DISTINCT FROM NEW."grantedAt"
    OR OLD."grantedProjectRevision" IS DISTINCT FROM NEW."grantedProjectRevision"
    OR OLD."createdOperationRecordId" IS DISTINCT FROM NEW."createdOperationRecordId"
    OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt"
  THEN
    RAISE EXCEPTION 'Project resource disclosure grant identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ProjectResourceDisclosureGrant_identity_immutable';
  END IF;
  IF OLD."status" = 'granted' AND NEW."status" IN ('revoked', 'expired') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Project resource disclosure grant permits only granted to revoked or expired' USING ERRCODE = '23514', CONSTRAINT = 'ProjectResourceDisclosureGrant_transition';
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "ProjectResourceDisclosureGrant_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ProjectResourceDisclosureGrant" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_004_disclosure_guard"();
--> statement-breakpoint
-- M4-004 operation completeness: every M4-004 operation must resolve to exactly
-- one matching typed Project revision event for the same persisted evidence row.
CREATE FUNCTION "phase13_m4_004_operation_complete"() RETURNS trigger LANGUAGE plpgsql AS $fn$
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
    'service_engagement_create', 'service_engagement_agreement_draft', 'service_engagement_agreement_issue',
    'service_engagement_agreement_accept', 'service_engagement_signature_submit', 'service_engagement_signature_verify',
    'service_engagement_activate', 'service_engagement_suspend', 'service_engagement_resume', 'service_engagement_terminate',
    'project_resource_disclosure_grant_create', 'project_resource_disclosure_grant_revoke')
  THEN
    RETURN NULL;
  END IF;
  IF NEW."actorKind" <> 'user' OR NEW."actorUserId" IS NULL THEN
    RAISE EXCEPTION 'Service engagement operations require an authenticated user actor' USING ERRCODE = '23514', CONSTRAINT = 'ServiceEngagementOperation_actor_required';
  END IF;
  IF NEW."operationType" = 'service_engagement_create' THEN
    expected_result := 'service_engagement';
    expected_event := 'service_engagement_created';
    expected_subject := 'service_engagement';
    SELECT e."projectId", e."lastProjectRevision", e."id" INTO target_project, target_revision, target_subject
      FROM "ServiceEngagement" e WHERE e."id" = NEW."resultId" AND e."createdOperationRecordId" = NEW."id";
  ELSIF NEW."operationType" = 'service_engagement_agreement_draft' THEN
    expected_result := 'service_agreement_version';
    expected_event := 'service_engagement_agreement_version_drafted';
    expected_subject := 'service_agreement_version';
    SELECT v."projectId", v."createdProjectRevision", v."id" INTO target_project, target_revision, target_subject
      FROM "ServiceAgreementVersion" v WHERE v."id" = NEW."resultId" AND v."createdOperationRecordId" = NEW."id";
  ELSIF NEW."operationType" = 'service_engagement_agreement_issue' THEN
    expected_result := 'service_agreement_version';
    expected_event := 'service_engagement_agreement_version_issued';
    expected_subject := 'service_agreement_version';
    SELECT v."projectId", v."issuedProjectRevision", v."id" INTO target_project, target_revision, target_subject
      FROM "ServiceAgreementVersion" v WHERE v."id" = NEW."resultId" AND v."issuedOperationRecordId" = NEW."id";
  ELSIF NEW."operationType" = 'service_engagement_agreement_accept' THEN
    expected_result := 'service_agreement_acceptance';
    expected_event := 'service_engagement_agreement_accepted';
    expected_subject := 'service_agreement_acceptance';
    SELECT a."projectId", a."acceptedProjectRevision", a."id" INTO target_project, target_revision, target_subject
      FROM "ServiceAgreementAcceptance" a WHERE a."id" = NEW."resultId" AND a."operationRecordId" = NEW."id";
  ELSIF NEW."operationType" = 'service_engagement_signature_submit' THEN
    expected_result := 'service_signature_evidence';
    expected_event := 'service_engagement_signature_evidence_recorded';
    expected_subject := 'service_signature_evidence';
    SELECT s."projectId", s."submittedProjectRevision", s."id" INTO target_project, target_revision, target_subject
      FROM "ServiceSignatureEvidence" s WHERE s."id" = NEW."resultId" AND s."submittedOperationRecordId" = NEW."id";
  ELSIF NEW."operationType" = 'service_engagement_signature_verify' THEN
    expected_result := 'service_signature_evidence';
    expected_subject := 'service_signature_evidence';
    SELECT s."projectId", s."verificationProjectRevision", s."id",
           CASE WHEN s."verificationStatus" = 'verified' THEN 'service_engagement_signature_evidence_verified'
                ELSE 'service_engagement_signature_evidence_rejected' END
      INTO target_project, target_revision, target_subject, expected_event
      FROM "ServiceSignatureEvidence" s
      WHERE s."id" = NEW."resultId" AND s."verificationOperationRecordId" = NEW."id" AND s."verificationStatus" IN ('verified', 'rejected');
  ELSIF NEW."operationType" IN ('service_engagement_activate', 'service_engagement_suspend', 'service_engagement_resume', 'service_engagement_terminate') THEN
    expected_result := 'service_engagement';
    expected_subject := 'service_engagement';
    expected_event := CASE NEW."operationType"
      WHEN 'service_engagement_activate' THEN 'service_engagement_activated'
      WHEN 'service_engagement_suspend' THEN 'service_engagement_suspended'
      WHEN 'service_engagement_resume' THEN 'service_engagement_resumed'
      ELSE 'service_engagement_terminated' END;
    SELECT e."projectId", e."lastProjectRevision", e."id" INTO target_project, target_revision, target_subject
      FROM "ServiceEngagement" e WHERE e."id" = NEW."resultId" AND e."lastOperationRecordId" = NEW."id";
  ELSIF NEW."operationType" = 'project_resource_disclosure_grant_create' THEN
    expected_result := 'project_resource_disclosure_grant';
    expected_event := 'project_resource_disclosure_granted';
    expected_subject := 'project_resource_disclosure_grant';
    SELECT g."projectId", g."grantedProjectRevision", g."id" INTO target_project, target_revision, target_subject
      FROM "ProjectResourceDisclosureGrant" g WHERE g."id" = NEW."resultId" AND g."createdOperationRecordId" = NEW."id";
  ELSE
    expected_result := 'project_resource_disclosure_grant';
    expected_event := 'project_resource_disclosure_revoked';
    expected_subject := 'project_resource_disclosure_grant';
    SELECT g."projectId", g."revokedProjectRevision", g."id" INTO target_project, target_revision, target_subject
      FROM "ProjectResourceDisclosureGrant" g
      WHERE g."id" = NEW."resultId" AND g."revokedOperationRecordId" = NEW."id" AND g."status" IN ('revoked', 'expired');
  END IF;
  IF NEW."resultKind" IS DISTINCT FROM expected_result
    OR target_project IS NULL OR target_revision IS NULL OR target_subject IS NULL
  THEN
    RAISE EXCEPTION 'Service engagement operation requires matching persisted evidence' USING ERRCODE = '23514', CONSTRAINT = 'ServiceEngagementOperation_evidence_required';
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
    RAISE EXCEPTION 'Service engagement operation requires exactly one matching Project revision event' USING ERRCODE = '23514', CONSTRAINT = 'ServiceEngagementOperation_event_required';
  END IF;
  RETURN NULL;
END;
$fn$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ServiceEngagementOperation_complete" AFTER INSERT ON "ProjectOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "phase13_m4_004_operation_complete"();
--> statement-breakpoint
-- Declared here (not in schema.ts) to avoid a circular TypeScript inference
-- between ServiceEngagement and ServiceAgreementVersion. The foreign key is
-- composite on purpose: (currentAgreementVersionId, id) -> (id, engagementId)
-- makes it impossible for an engagement to point at another engagement's
-- agreement version.
DO $$ BEGIN
 ALTER TABLE "ServiceEngagement" ADD CONSTRAINT "ServiceEngagement_current_agreement_fk" FOREIGN KEY ("currentAgreementVersionId","id") REFERENCES "public"."ServiceAgreementVersion"("id","engagementId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
