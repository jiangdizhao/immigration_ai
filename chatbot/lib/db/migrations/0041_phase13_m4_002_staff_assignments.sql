CREATE TABLE IF NOT EXISTS "ProjectStaffAssignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"staffUserId" uuid NOT NULL,
	"proposedByAdminUserId" uuid NOT NULL,
	"purpose" varchar(64) NOT NULL,
	"assignmentRole" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'proposed' NOT NULL,
	"staffEmailSha256" varchar(64) NOT NULL,
	"noticeVersion" varchar(128) NOT NULL,
	"noticeSha256" varchar(64) NOT NULL,
	"proposalSha256" varchar(64) NOT NULL,
	"ownerApprovedByUserId" uuid,
	"ownerApprovedAt" timestamp,
	"ownerApprovalSha256" varchar(64),
	"lawyerAcceptedAt" timestamp,
	"terminalActorUserId" uuid,
	"terminalReasonCode" varchar(32),
	"terminalAt" timestamp,
	"lastProjectRevision" integer NOT NULL,
	"lastOperationRecordId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectStaffAssignment" ADD CONSTRAINT "ProjectStaffAssignment_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectStaffAssignment" ADD CONSTRAINT "ProjectStaffAssignment_staffUserId_User_id_fk" FOREIGN KEY ("staffUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectStaffAssignment" ADD CONSTRAINT "ProjectStaffAssignment_proposedByAdminUserId_User_id_fk" FOREIGN KEY ("proposedByAdminUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectStaffAssignment" ADD CONSTRAINT "ProjectStaffAssignment_ownerApprovedByUserId_User_id_fk" FOREIGN KEY ("ownerApprovedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectStaffAssignment" ADD CONSTRAINT "ProjectStaffAssignment_terminalActorUserId_User_id_fk" FOREIGN KEY ("terminalActorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectStaffAssignment" ADD CONSTRAINT "ProjectStaffAssignment_lastOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("lastOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectStaffAssignment_project_staff_purpose_live_unique" ON "ProjectStaffAssignment" USING btree ("projectId","staffUserId","purpose") WHERE "ProjectStaffAssignment"."status" in ('proposed', 'owner_approved', 'active');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectStaffAssignment_project_status_idx" ON "ProjectStaffAssignment" USING btree ("projectId","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectStaffAssignment_admin_project_status_idx" ON "ProjectStaffAssignment" USING btree ("proposedByAdminUserId","projectId","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectStaffAssignment_staff_status_idx" ON "ProjectStaffAssignment" USING btree ("staffUserId","status");
--> statement-breakpoint
ALTER TABLE "ProjectStaffAssignment"
	ADD CONSTRAINT "ProjectStaffAssignment_purpose_check" CHECK ("purpose" = 'project_staff_collaboration'),
	ADD CONSTRAINT "ProjectStaffAssignment_role_check" CHECK ("assignmentRole" = 'lawyer'),
	ADD CONSTRAINT "ProjectStaffAssignment_status_check" CHECK ("status" IN ('proposed','owner_approved','active','declined','withdrawn','revoked')),
	ADD CONSTRAINT "ProjectStaffAssignment_hash_check" CHECK (
		"staffEmailSha256" ~ '^[0-9a-f]{64}$'
		AND "noticeSha256" ~ '^[0-9a-f]{64}$'
		AND "proposalSha256" ~ '^[0-9a-f]{64}$'
		AND ("ownerApprovalSha256" IS NULL OR "ownerApprovalSha256" ~ '^[0-9a-f]{64}$')
	),
	ADD CONSTRAINT "ProjectStaffAssignment_notice_version_check" CHECK (length(trim("noticeVersion")) BETWEEN 1 AND 128),
	ADD CONSTRAINT "ProjectStaffAssignment_revision_positive_check" CHECK ("lastProjectRevision" > 0),
	ADD CONSTRAINT "ProjectStaffAssignment_timestamps_check" CHECK ("updatedAt" >= "createdAt"),
	ADD CONSTRAINT "ProjectStaffAssignment_lifecycle_check" CHECK (
		("status" = 'proposed' AND "ownerApprovedByUserId" IS NULL AND "ownerApprovedAt" IS NULL AND "ownerApprovalSha256" IS NULL AND "lawyerAcceptedAt" IS NULL AND "terminalActorUserId" IS NULL AND "terminalReasonCode" IS NULL AND "terminalAt" IS NULL)
		OR ("status" = 'owner_approved' AND "ownerApprovedByUserId" IS NOT NULL AND "ownerApprovedAt" IS NOT NULL AND "ownerApprovalSha256" = "proposalSha256" AND "lawyerAcceptedAt" IS NULL AND "terminalActorUserId" IS NULL AND "terminalReasonCode" IS NULL AND "terminalAt" IS NULL)
		OR ("status" = 'active' AND "ownerApprovedByUserId" IS NOT NULL AND "ownerApprovedAt" IS NOT NULL AND "ownerApprovalSha256" = "proposalSha256" AND "lawyerAcceptedAt" IS NOT NULL AND "terminalActorUserId" IS NULL AND "terminalReasonCode" IS NULL AND "terminalAt" IS NULL)
		OR ("status" = 'declined' AND "terminalActorUserId" IS NOT NULL AND "terminalAt" IS NOT NULL AND "terminalReasonCode" IN ('owner_declined','lawyer_declined') AND "lawyerAcceptedAt" IS NULL AND (("terminalReasonCode" = 'owner_declined' AND "ownerApprovedByUserId" IS NULL AND "ownerApprovedAt" IS NULL AND "ownerApprovalSha256" IS NULL) OR ("terminalReasonCode" = 'lawyer_declined' AND "ownerApprovedByUserId" IS NOT NULL AND "ownerApprovedAt" IS NOT NULL AND "ownerApprovalSha256" = "proposalSha256")))
		OR ("status" = 'withdrawn' AND "terminalActorUserId" IS NOT NULL AND "terminalAt" IS NOT NULL AND "terminalReasonCode" = 'admin_withdrawn' AND "lawyerAcceptedAt" IS NULL)
		OR ("status" = 'revoked' AND "terminalActorUserId" IS NOT NULL AND "terminalAt" IS NOT NULL AND "terminalReasonCode" IN ('owner_revoked','admin_revoked','lawyer_resigned') AND ("terminalReasonCode" <> 'lawyer_resigned' OR "lawyerAcceptedAt" IS NOT NULL))
	);
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_type_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_type_check" CHECK ("operationType" IN ('project_create','project_close','membership_invite','membership_accept','membership_revoke','project_chat_create','project_document_upload_intent','project_document_import_intent','project_document_storage_finalize','project_document_storage_fail','project_document_scan_finalize','project_document_grant_create','project_document_grant_revoke','project_document_withdraw','project_requirement_state_change','project_evidence_extract','project_fact_mutation','project_staff_assignment_propose','project_staff_assignment_owner_approve','project_staff_assignment_owner_decline','project_staff_assignment_lawyer_accept','project_staff_assignment_lawyer_decline','project_staff_assignment_owner_revoke','project_staff_assignment_lawyer_resign','project_staff_assignment_admin_withdraw','project_staff_assignment_admin_revoke'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_result_kind_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_result_kind_check" CHECK ("resultKind" IN ('project','membership','chat','document_asset','document_version','document_scan_run','document_grant','project_requirement_state','document_extraction_run','project_fact_assertion','project_staff_assignment'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_actor_type_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_actor_type_check" CHECK (("operationType" IN ('project_create','project_close','membership_invite','membership_accept','membership_revoke','project_chat_create','project_document_upload_intent','project_document_import_intent','project_document_grant_create','project_document_grant_revoke','project_document_withdraw','project_requirement_state_change','project_evidence_extract','project_fact_mutation','project_staff_assignment_propose','project_staff_assignment_owner_approve','project_staff_assignment_owner_decline','project_staff_assignment_lawyer_accept','project_staff_assignment_lawyer_decline','project_staff_assignment_owner_revoke','project_staff_assignment_lawyer_resign','project_staff_assignment_admin_withdraw','project_staff_assignment_admin_revoke') AND "actorKind" = 'user') OR ("operationType" IN ('project_document_storage_finalize','project_document_storage_fail') AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_storage_worker' AND "operationId" ~ '^[0-9a-f]{64}$') OR ("operationType" = 'project_document_scan_finalize' AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_scan_worker' AND "operationId" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_type_check";
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_type_check" CHECK ("eventType" IN ('project_created','membership_state_changed','project_chat_created','project_closed','project_document_intent_created','project_document_storage_changed','project_document_security_changed','project_document_grant_changed','project_document_withdrawn','project_requirement_state_changed','project_evidence_extraction_completed','project_fact_changed','project_staff_assignment_proposed','project_staff_assignment_owner_approved','project_staff_assignment_owner_declined','project_staff_assignment_lawyer_accepted','project_staff_assignment_lawyer_declined','project_staff_assignment_owner_revoked','project_staff_assignment_lawyer_resigned','project_staff_assignment_admin_withdrawn','project_staff_assignment_admin_revoked'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_subject_check";
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_subject_check" CHECK (("subjectKind" IS NULL AND "subjectId" IS NULL) OR ("subjectKind" IN ('project','membership','chat','document_asset','document_version','document_scan_run','document_grant','requirement_state','document_extraction_run','project_fact_assertion','project_staff_assignment') AND "subjectId" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_staff_assignment_subject_check" CHECK (
	"eventType" NOT IN ('project_staff_assignment_proposed','project_staff_assignment_owner_approved','project_staff_assignment_owner_declined','project_staff_assignment_lawyer_accepted','project_staff_assignment_lawyer_declined','project_staff_assignment_owner_revoked','project_staff_assignment_lawyer_resigned','project_staff_assignment_admin_withdrawn','project_staff_assignment_admin_revoked')
	OR "subjectKind" = 'project_staff_assignment'
);
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_staff_assignment_immutable_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Project staff assignment audit rows cannot be deleted' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignment_delete_protected';
	END IF;
	IF OLD."id" IS DISTINCT FROM NEW."id"
		OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
		OR OLD."staffUserId" IS DISTINCT FROM NEW."staffUserId"
		OR OLD."proposedByAdminUserId" IS DISTINCT FROM NEW."proposedByAdminUserId"
		OR OLD."purpose" IS DISTINCT FROM NEW."purpose"
		OR OLD."assignmentRole" IS DISTINCT FROM NEW."assignmentRole"
		OR OLD."staffEmailSha256" IS DISTINCT FROM NEW."staffEmailSha256"
		OR OLD."noticeVersion" IS DISTINCT FROM NEW."noticeVersion"
		OR OLD."noticeSha256" IS DISTINCT FROM NEW."noticeSha256"
		OR OLD."proposalSha256" IS DISTINCT FROM NEW."proposalSha256"
		OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
	THEN
		RAISE EXCEPTION 'Project staff assignment proposal identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignment_identity_immutable';
	END IF;
	IF NOT (
		(OLD."status" = 'proposed' AND NEW."status" IN ('owner_approved','declined','withdrawn','revoked'))
		OR (OLD."status" = 'owner_approved' AND NEW."status" IN ('active','declined','withdrawn','revoked'))
		OR (OLD."status" = 'active' AND NEW."status" = 'revoked')
	) THEN
		RAISE EXCEPTION 'Invalid Project staff assignment transition' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignment_transition';
	END IF;
	IF NEW."lastProjectRevision" <= OLD."lastProjectRevision"
		OR NEW."lastOperationRecordId" IS NOT DISTINCT FROM OLD."lastOperationRecordId"
		OR NEW."updatedAt" < OLD."updatedAt"
	THEN
		RAISE EXCEPTION 'Project staff assignment transition requires a new revision and operation' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignment_revision_transition';
	END IF;
	IF OLD."ownerApprovedByUserId" IS NOT NULL
		AND (OLD."ownerApprovedByUserId" IS DISTINCT FROM NEW."ownerApprovedByUserId" OR OLD."ownerApprovedAt" IS DISTINCT FROM NEW."ownerApprovedAt" OR OLD."ownerApprovalSha256" IS DISTINCT FROM NEW."ownerApprovalSha256")
	THEN
		RAISE EXCEPTION 'Project owner approval snapshot is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignment_owner_approval_immutable';
	END IF;
	IF OLD."lawyerAcceptedAt" IS NOT NULL AND OLD."lawyerAcceptedAt" IS DISTINCT FROM NEW."lawyerAcceptedAt" THEN
		RAISE EXCEPTION 'Project staff acceptance is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignment_acceptance_immutable';
	END IF;
	IF OLD."terminalAt" IS NOT NULL
		OR (OLD."terminalActorUserId" IS NOT NULL AND OLD."terminalActorUserId" IS DISTINCT FROM NEW."terminalActorUserId")
	THEN
		RAISE EXCEPTION 'Project staff assignment terminal state is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignment_terminal_immutable';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ProjectStaffAssignment_immutable_guard" BEFORE UPDATE OR DELETE ON "ProjectStaffAssignment" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_staff_assignment_immutable_guard"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "phase13_round2_operation_event_binding"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	op "ProjectOperation"%ROWTYPE;
	target_project uuid;
	target_staff uuid;
	target_admin uuid;
	target_owner uuid;
	target_owner_approver uuid;
	target_terminal_actor uuid;
BEGIN
	IF NEW."eventType" IN (
		'project_staff_assignment_proposed',
		'project_staff_assignment_owner_approved',
		'project_staff_assignment_owner_declined',
		'project_staff_assignment_lawyer_accepted',
		'project_staff_assignment_lawyer_declined',
		'project_staff_assignment_owner_revoked',
		'project_staff_assignment_lawyer_resigned',
		'project_staff_assignment_admin_withdrawn',
		'project_staff_assignment_admin_revoked'
	) THEN
		SELECT * INTO op FROM "ProjectOperation" WHERE "id" = NEW."operationRecordId";
		IF NOT FOUND OR op."actorKind" IS DISTINCT FROM 'user' OR op."actorUserId" IS DISTINCT FROM NEW."actorUserId"
			OR op."resultKind" IS DISTINCT FROM 'project_staff_assignment' OR op."resultId" IS DISTINCT FROM NEW."subjectId"
			OR NEW."subjectKind" IS DISTINCT FROM 'project_staff_assignment'
		THEN
			RAISE EXCEPTION 'Project staff event actor or result does not match operation' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignmentEvent_operation_match';
		END IF;
		IF NOT (
			(NEW."eventType" = 'project_staff_assignment_proposed' AND op."operationType" = 'project_staff_assignment_propose')
			OR (NEW."eventType" = 'project_staff_assignment_owner_approved' AND op."operationType" = 'project_staff_assignment_owner_approve')
			OR (NEW."eventType" = 'project_staff_assignment_owner_declined' AND op."operationType" = 'project_staff_assignment_owner_decline')
			OR (NEW."eventType" = 'project_staff_assignment_lawyer_accepted' AND op."operationType" = 'project_staff_assignment_lawyer_accept')
			OR (NEW."eventType" = 'project_staff_assignment_lawyer_declined' AND op."operationType" = 'project_staff_assignment_lawyer_decline')
			OR (NEW."eventType" = 'project_staff_assignment_owner_revoked' AND op."operationType" = 'project_staff_assignment_owner_revoke')
			OR (NEW."eventType" = 'project_staff_assignment_lawyer_resigned' AND op."operationType" = 'project_staff_assignment_lawyer_resign')
			OR (NEW."eventType" = 'project_staff_assignment_admin_withdrawn' AND op."operationType" = 'project_staff_assignment_admin_withdraw')
			OR (NEW."eventType" = 'project_staff_assignment_admin_revoked' AND op."operationType" = 'project_staff_assignment_admin_revoke')
		) THEN
			RAISE EXCEPTION 'Project staff event type does not match operation type' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignmentEvent_type_match';
		END IF;
		SELECT assignment."projectId", assignment."staffUserId", assignment."proposedByAdminUserId",
			assignment."ownerApprovedByUserId", assignment."terminalActorUserId", project."ownerUserId"
		INTO target_project, target_staff, target_admin, target_owner_approver, target_terminal_actor, target_owner
		FROM "ProjectStaffAssignment" assignment
		JOIN "StudyJourneyProject" project ON project."id" = assignment."projectId"
		WHERE assignment."id" = NEW."subjectId" AND assignment."lastOperationRecordId" = op."id";
		IF target_project IS DISTINCT FROM NEW."projectId" THEN
			RAISE EXCEPTION 'Project staff event subject belongs to another Project or operation' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignmentEvent_project_match';
		END IF;
		IF (NEW."eventType" = 'project_staff_assignment_proposed' AND NEW."actorUserId" IS DISTINCT FROM target_admin)
			OR (NEW."eventType" IN ('project_staff_assignment_owner_approved','project_staff_assignment_owner_declined','project_staff_assignment_owner_revoked') AND NEW."actorUserId" IS DISTINCT FROM target_owner)
			OR (NEW."eventType" = 'project_staff_assignment_owner_approved' AND target_owner_approver IS DISTINCT FROM NEW."actorUserId")
			OR (NEW."eventType" IN ('project_staff_assignment_owner_declined','project_staff_assignment_owner_revoked') AND target_terminal_actor IS DISTINCT FROM NEW."actorUserId")
			OR (NEW."eventType" = 'project_staff_assignment_lawyer_accepted' AND NEW."actorUserId" IS DISTINCT FROM target_staff)
			OR (NEW."eventType" IN ('project_staff_assignment_lawyer_declined','project_staff_assignment_lawyer_resigned') AND (NEW."actorUserId" IS DISTINCT FROM target_staff OR target_terminal_actor IS DISTINCT FROM NEW."actorUserId"))
			OR (NEW."eventType" IN ('project_staff_assignment_admin_withdrawn','project_staff_assignment_admin_revoked') AND (NEW."actorUserId" IS DISTINCT FROM target_admin OR target_terminal_actor IS DISTINCT FROM NEW."actorUserId"))
		THEN
			RAISE EXCEPTION 'Project staff event actor does not own this transition' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignmentEvent_actor_scope';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW."eventType" NOT IN ('project_evidence_extraction_completed', 'project_fact_changed') THEN
		RETURN NEW;
	END IF;
	SELECT * INTO op FROM "ProjectOperation" WHERE "id" = NEW."operationRecordId";
	IF NOT FOUND OR op."actorKind" IS DISTINCT FROM 'user' OR op."actorUserId" IS DISTINCT FROM NEW."actorUserId" THEN
		RAISE EXCEPTION 'Round 2 event actor must match operation' USING ERRCODE = '23514', CONSTRAINT = 'ProjectRound2Event_actor_match';
	END IF;
	IF NEW."eventType" = 'project_evidence_extraction_completed' THEN
		IF op."operationType" <> 'project_evidence_extract' OR op."resultKind" <> 'document_extraction_run' OR op."resultId" IS DISTINCT FROM NEW."subjectId" OR NEW."subjectKind" <> 'document_extraction_run' THEN
			RAISE EXCEPTION 'Evidence event does not match operation result' USING ERRCODE = '23514', CONSTRAINT = 'ProjectEvidenceEvent_operation_match';
		END IF;
		SELECT "projectId" INTO target_project FROM "ProjectDocumentProcessingRun" WHERE "id" = NEW."subjectId" AND "operationKind" = 'extract';
	ELSE
		IF op."operationType" <> 'project_fact_mutation' OR op."resultKind" <> 'project_fact_assertion' OR op."resultId" IS DISTINCT FROM NEW."subjectId" OR NEW."subjectKind" <> 'project_fact_assertion' THEN
			RAISE EXCEPTION 'Fact event does not match operation result' USING ERRCODE = '23514', CONSTRAINT = 'ProjectFactEvent_operation_match';
		END IF;
		SELECT "projectId" INTO target_project FROM "ProjectFactAssertion" WHERE "id" = NEW."subjectId";
	END IF;
	IF target_project IS DISTINCT FROM NEW."projectId" THEN
		RAISE EXCEPTION 'Round 2 event subject belongs to another Project' USING ERRCODE = '23514', CONSTRAINT = 'ProjectRound2Event_project_match';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_staff_assignment_operation_complete"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	expected_event text;
	assignment_project uuid;
	assignment_revision integer;
	event_count integer;
BEGIN
	IF NEW."operationType" NOT IN (
		'project_staff_assignment_propose','project_staff_assignment_owner_approve','project_staff_assignment_owner_decline',
		'project_staff_assignment_lawyer_accept','project_staff_assignment_lawyer_decline','project_staff_assignment_owner_revoke',
		'project_staff_assignment_lawyer_resign','project_staff_assignment_admin_withdraw','project_staff_assignment_admin_revoke'
	) THEN
		RETURN NULL;
	END IF;
	IF NEW."resultKind" <> 'project_staff_assignment' THEN
		RAISE EXCEPTION 'Project staff operation requires assignment result' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignmentOperation_result_required';
	END IF;
	expected_event := CASE NEW."operationType"
		WHEN 'project_staff_assignment_propose' THEN 'project_staff_assignment_proposed'
		WHEN 'project_staff_assignment_owner_approve' THEN 'project_staff_assignment_owner_approved'
		WHEN 'project_staff_assignment_owner_decline' THEN 'project_staff_assignment_owner_declined'
		WHEN 'project_staff_assignment_lawyer_accept' THEN 'project_staff_assignment_lawyer_accepted'
		WHEN 'project_staff_assignment_lawyer_decline' THEN 'project_staff_assignment_lawyer_declined'
		WHEN 'project_staff_assignment_owner_revoke' THEN 'project_staff_assignment_owner_revoked'
		WHEN 'project_staff_assignment_lawyer_resign' THEN 'project_staff_assignment_lawyer_resigned'
		WHEN 'project_staff_assignment_admin_withdraw' THEN 'project_staff_assignment_admin_withdrawn'
		WHEN 'project_staff_assignment_admin_revoke' THEN 'project_staff_assignment_admin_revoked'
	END;
	SELECT "projectId", "lastProjectRevision" INTO assignment_project, assignment_revision
	FROM "ProjectStaffAssignment" WHERE "id" = NEW."resultId" AND "lastOperationRecordId" = NEW."id";
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Project staff operation requires matching assignment transition' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignmentOperation_assignment_required';
	END IF;
	SELECT count(*) INTO event_count FROM "ProjectEvent" WHERE "operationRecordId" = NEW."id";
	IF event_count <> 1 OR NOT EXISTS (
		SELECT 1 FROM "ProjectEvent"
		WHERE "operationRecordId" = NEW."id" AND "projectId" = assignment_project
			AND "eventType" = expected_event AND "subjectKind" = 'project_staff_assignment'
			AND "subjectId" = NEW."resultId" AND "projectRevision" = assignment_revision
			AND "actorUserId" IS NOT DISTINCT FROM NEW."actorUserId" AND "actorKind" = 'user'
	) THEN
		RAISE EXCEPTION 'Project staff operation requires one matching revision event' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignmentOperation_event_required';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ProjectStaffAssignmentOperation_complete" AFTER INSERT ON "ProjectOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "phase13_m4_staff_assignment_operation_complete"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_staff_assignment_transition_complete"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	expected_event text;
	op "ProjectOperation"%ROWTYPE;
	event_count integer;
BEGIN
	expected_event := CASE
		WHEN NEW."status" = 'proposed' THEN 'project_staff_assignment_proposed'
		WHEN NEW."status" = 'owner_approved' THEN 'project_staff_assignment_owner_approved'
		WHEN NEW."status" = 'active' THEN 'project_staff_assignment_lawyer_accepted'
		WHEN NEW."status" = 'declined' AND NEW."terminalReasonCode" = 'owner_declined' THEN 'project_staff_assignment_owner_declined'
		WHEN NEW."status" = 'declined' AND NEW."terminalReasonCode" = 'lawyer_declined' THEN 'project_staff_assignment_lawyer_declined'
		WHEN NEW."status" = 'withdrawn' THEN 'project_staff_assignment_admin_withdrawn'
		WHEN NEW."status" = 'revoked' AND NEW."terminalReasonCode" = 'owner_revoked' THEN 'project_staff_assignment_owner_revoked'
		WHEN NEW."status" = 'revoked' AND NEW."terminalReasonCode" = 'admin_revoked' THEN 'project_staff_assignment_admin_revoked'
		WHEN NEW."status" = 'revoked' AND NEW."terminalReasonCode" = 'lawyer_resigned' THEN 'project_staff_assignment_lawyer_resigned'
	END;
	SELECT * INTO op FROM "ProjectOperation" WHERE "id" = NEW."lastOperationRecordId";
	IF NOT FOUND OR expected_event IS NULL
		OR op."resultKind" IS DISTINCT FROM 'project_staff_assignment'
		OR op."resultId" IS DISTINCT FROM NEW."id"
	THEN
		RAISE EXCEPTION 'Project staff assignment requires a matching operation record' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignment_transition_operation_required';
	END IF;
	SELECT count(*) INTO event_count FROM "ProjectEvent" WHERE "operationRecordId" = op."id";
	IF event_count <> 1 OR NOT EXISTS (
		SELECT 1 FROM "ProjectEvent"
		WHERE "operationRecordId" = op."id" AND "projectId" = NEW."projectId"
			AND "eventType" = expected_event AND "subjectKind" = 'project_staff_assignment'
			AND "subjectId" = NEW."id" AND "projectRevision" = NEW."lastProjectRevision"
			AND "actorUserId" IS NOT DISTINCT FROM op."actorUserId" AND "actorKind" = 'user'
	) THEN
		RAISE EXCEPTION 'Project staff assignment requires exactly one matching event' USING ERRCODE = '23514', CONSTRAINT = 'ProjectStaffAssignment_transition_event_required';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ProjectStaffAssignment_transition_complete" AFTER INSERT OR UPDATE ON "ProjectStaffAssignment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "phase13_m4_staff_assignment_transition_complete"();
