CREATE TABLE IF NOT EXISTS "ProjectHumanMessage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"threadId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"authorUserId" uuid NOT NULL,
	"operationRecordId" uuid NOT NULL,
	"body" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectHumanThread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"ownerUserId" uuid NOT NULL,
	"assignmentId" uuid NOT NULL,
	"lawyerUserId" uuid NOT NULL,
	"purpose" varchar(64) NOT NULL,
	"noticeVersion" varchar(128) NOT NULL,
	"noticeSha256" varchar(64) NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"lastMessageSequence" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectThreadParticipationConsent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"threadId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"ownerUserId" uuid NOT NULL,
	"assignmentId" uuid NOT NULL,
	"lawyerUserId" uuid NOT NULL,
	"purpose" varchar(64) NOT NULL,
	"noticeVersion" varchar(128) NOT NULL,
	"noticeSha256" varchar(64) NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"acceptedByUserId" uuid NOT NULL,
	"acceptedAt" timestamp DEFAULT now() NOT NULL,
	"createdOperationRecordId" uuid NOT NULL,
	"createdProjectRevision" integer NOT NULL,
	"withdrawnByUserId" uuid,
	"withdrawnAt" timestamp,
	"withdrawnOperationRecordId" uuid,
	"withdrawnProjectRevision" integer
);
--> statement-breakpoint
-- Referenced composite keys must exist before PostgreSQL accepts their FKs.
CREATE UNIQUE INDEX IF NOT EXISTS "StudyJourneyProject_id_owner_unique" ON "StudyJourneyProject" USING btree ("id","ownerUserId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectStaffAssignment_id_project_staff_unique" ON "ProjectStaffAssignment" USING btree ("id","projectId","staffUserId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectHumanThread_identity_unique" ON "ProjectHumanThread" USING btree ("id","projectId","ownerUserId","assignmentId","lawyerUserId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectHumanThread_project_identity_unique" ON "ProjectHumanThread" USING btree ("id","projectId");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectHumanMessage" ADD CONSTRAINT "ProjectHumanMessage_authorUserId_User_id_fk" FOREIGN KEY ("authorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectHumanMessage" ADD CONSTRAINT "ProjectHumanMessage_operationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("operationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectHumanMessage" ADD CONSTRAINT "ProjectHumanMessage_thread_project_fk" FOREIGN KEY ("threadId","projectId") REFERENCES "public"."ProjectHumanThread"("id","projectId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectHumanThread" ADD CONSTRAINT "ProjectHumanThread_project_owner_fk" FOREIGN KEY ("projectId","ownerUserId") REFERENCES "public"."StudyJourneyProject"("id","ownerUserId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectHumanThread" ADD CONSTRAINT "ProjectHumanThread_assignment_identity_fk" FOREIGN KEY ("assignmentId","projectId","lawyerUserId") REFERENCES "public"."ProjectStaffAssignment"("id","projectId","staffUserId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectThreadParticipationConsent" ADD CONSTRAINT "ProjectThreadParticipationConsent_acceptedByUserId_User_id_fk" FOREIGN KEY ("acceptedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectThreadParticipationConsent" ADD CONSTRAINT "ProjectThreadParticipationConsent_createdOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("createdOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectThreadParticipationConsent" ADD CONSTRAINT "ProjectThreadParticipationConsent_withdrawnByUserId_User_id_fk" FOREIGN KEY ("withdrawnByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectThreadParticipationConsent" ADD CONSTRAINT "ProjectThreadParticipationConsent_withdrawnOperationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("withdrawnOperationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectThreadParticipationConsent" ADD CONSTRAINT "ProjectThreadParticipationConsent_thread_identity_fk" FOREIGN KEY ("threadId","projectId","ownerUserId","assignmentId","lawyerUserId") REFERENCES "public"."ProjectHumanThread"("id","projectId","ownerUserId","assignmentId","lawyerUserId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectHumanMessage_thread_sequence_unique" ON "ProjectHumanMessage" USING btree ("threadId","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectHumanMessage_operation_unique" ON "ProjectHumanMessage" USING btree ("operationRecordId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectHumanThread_identity_unique" ON "ProjectHumanThread" USING btree ("id","projectId","ownerUserId","assignmentId","lawyerUserId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectHumanThread_project_identity_unique" ON "ProjectHumanThread" USING btree ("id","projectId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectHumanThread_project_created_idx" ON "ProjectHumanThread" USING btree ("projectId","createdAt","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectThreadParticipationConsent_identity_unique" ON "ProjectThreadParticipationConsent" USING btree ("id","threadId","projectId","ownerUserId","assignmentId","lawyerUserId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectThreadParticipationConsent_thread_unique" ON "ProjectThreadParticipationConsent" USING btree ("threadId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectThreadParticipationConsent_created_operation_unique" ON "ProjectThreadParticipationConsent" USING btree ("createdOperationRecordId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectThreadParticipationConsent_withdrawn_operation_unique" ON "ProjectThreadParticipationConsent" USING btree ("withdrawnOperationRecordId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectThreadParticipationConsent_status_idx" ON "ProjectThreadParticipationConsent" USING btree ("projectId","status","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectStaffAssignment_id_project_staff_unique" ON "ProjectStaffAssignment" USING btree ("id","projectId","staffUserId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "StudyJourneyProject_id_owner_unique" ON "StudyJourneyProject" USING btree ("id","ownerUserId");
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_type_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_type_check" CHECK ("operationType" IN ('project_create','project_close','membership_invite','membership_accept','membership_revoke','project_chat_create','project_document_upload_intent','project_document_import_intent','project_document_storage_finalize','project_document_storage_fail','project_document_scan_finalize','project_document_grant_create','project_document_grant_revoke','project_document_withdraw','project_requirement_state_change','project_evidence_extract','project_fact_mutation','project_staff_assignment_propose','project_staff_assignment_owner_approve','project_staff_assignment_owner_decline','project_staff_assignment_lawyer_accept','project_staff_assignment_lawyer_decline','project_staff_assignment_owner_revoke','project_staff_assignment_lawyer_resign','project_staff_assignment_admin_withdraw','project_staff_assignment_admin_revoke','project_thread_participation_consent_create','project_thread_participation_consent_withdraw','project_human_message_send'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_result_kind_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_result_kind_check" CHECK ("resultKind" IN ('project','membership','chat','document_asset','document_version','document_scan_run','document_grant','project_requirement_state','document_extraction_run','project_fact_assertion','project_staff_assignment','project_thread_participation_consent','project_human_message'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation" DROP CONSTRAINT "ProjectOperation_actor_type_check";
ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_actor_type_check" CHECK (("operationType" IN ('project_create','project_close','membership_invite','membership_accept','membership_revoke','project_chat_create','project_document_upload_intent','project_document_import_intent','project_document_grant_create','project_document_grant_revoke','project_document_withdraw','project_requirement_state_change','project_evidence_extract','project_fact_mutation','project_staff_assignment_propose','project_staff_assignment_owner_approve','project_staff_assignment_owner_decline','project_staff_assignment_lawyer_accept','project_staff_assignment_lawyer_decline','project_staff_assignment_owner_revoke','project_staff_assignment_lawyer_resign','project_staff_assignment_admin_withdraw','project_staff_assignment_admin_revoke','project_thread_participation_consent_create','project_thread_participation_consent_withdraw','project_human_message_send') AND "actorKind" = 'user') OR ("operationType" IN ('project_document_storage_finalize','project_document_storage_fail') AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_storage_worker' AND "operationId" ~ '^[0-9a-f]{64}$') OR ("operationType" = 'project_document_scan_finalize' AND "actorKind" = 'service' AND "servicePrincipalCode" = 'project_document_scan_worker' AND "operationId" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_type_check";
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_type_check" CHECK ("eventType" IN ('project_created','membership_state_changed','project_chat_created','project_closed','project_document_intent_created','project_document_storage_changed','project_document_security_changed','project_document_grant_changed','project_document_withdrawn','project_requirement_state_changed','project_evidence_extraction_completed','project_fact_changed','project_staff_assignment_proposed','project_staff_assignment_owner_approved','project_staff_assignment_owner_declined','project_staff_assignment_lawyer_accepted','project_staff_assignment_lawyer_declined','project_staff_assignment_owner_revoked','project_staff_assignment_lawyer_resigned','project_staff_assignment_admin_withdrawn','project_staff_assignment_admin_revoked','project_thread_participation_consent_created','project_thread_participation_consent_withdrawn'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" DROP CONSTRAINT "ProjectEvent_subject_check";
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_subject_check" CHECK (("subjectKind" IS NULL AND "subjectId" IS NULL) OR ("subjectKind" IN ('project','membership','chat','document_asset','document_version','document_scan_run','document_grant','requirement_state','document_extraction_run','project_fact_assertion','project_staff_assignment','project_thread_participation_consent') AND "subjectId" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_human_consent_subject_check" CHECK ("eventType" NOT IN ('project_thread_participation_consent_created','project_thread_participation_consent_withdrawn') OR "subjectKind" = 'project_thread_participation_consent');
--> statement-breakpoint
ALTER TABLE "ProjectHumanThread" ADD CONSTRAINT "ProjectHumanThread_purpose_check" CHECK ("purpose" = 'one_to_one_plain_text_project_collaboration'),
  ADD CONSTRAINT "ProjectHumanThread_notice_check" CHECK (length(trim("noticeVersion")) BETWEEN 1 AND 128 AND "noticeSha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ProjectHumanThread_status_check" CHECK ("status" IN ('active','closed')),
  ADD CONSTRAINT "ProjectHumanThread_sequence_check" CHECK ("lastMessageSequence" >= 0);
--> statement-breakpoint
ALTER TABLE "ProjectThreadParticipationConsent" ADD CONSTRAINT "ProjectThreadParticipationConsent_purpose_check" CHECK ("purpose" = 'one_to_one_plain_text_project_collaboration'),
  ADD CONSTRAINT "ProjectThreadParticipationConsent_notice_check" CHECK (length(trim("noticeVersion")) BETWEEN 1 AND 128 AND "noticeSha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ProjectThreadParticipationConsent_status_check" CHECK ("status" IN ('active','withdrawn')),
  ADD CONSTRAINT "ProjectThreadParticipationConsent_lifecycle_check" CHECK (("status" = 'active' AND "withdrawnByUserId" IS NULL AND "withdrawnAt" IS NULL AND "withdrawnOperationRecordId" IS NULL AND "withdrawnProjectRevision" IS NULL) OR ("status" = 'withdrawn' AND "withdrawnByUserId" IS NOT NULL AND "withdrawnAt" IS NOT NULL AND "withdrawnOperationRecordId" IS NOT NULL AND "withdrawnProjectRevision" > "createdProjectRevision")),
  ADD CONSTRAINT "ProjectThreadParticipationConsent_revision_check" CHECK ("createdProjectRevision" > 0 AND ("withdrawnProjectRevision" IS NULL OR "withdrawnProjectRevision" > 0));
--> statement-breakpoint
ALTER TABLE "ProjectHumanMessage" ADD CONSTRAINT "ProjectHumanMessage_sequence_check" CHECK ("sequence" > 0),
  ADD CONSTRAINT "ProjectHumanMessage_body_check" CHECK ("body" ~ '[^[:space:]]' AND octet_length("body") <= 8192);
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_human_thread_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  project_row "StudyJourneyProject"%ROWTYPE;
  assignment_row "ProjectStaffAssignment"%ROWTYPE;
  owner_row "User"%ROWTYPE;
  lawyer_row "User"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Project human thread audit rows cannot be deleted' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanThread_delete_protected';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO project_row FROM "StudyJourneyProject" WHERE "id" = NEW."projectId";
    SELECT * INTO assignment_row FROM "ProjectStaffAssignment" WHERE "id" = NEW."assignmentId";
    SELECT * INTO owner_row FROM "User" WHERE "id" = NEW."ownerUserId";
    SELECT * INTO lawyer_row FROM "User" WHERE "id" = NEW."lawyerUserId";
    IF NOT FOUND OR project_row."id" IS NULL OR project_row."status" <> 'active'
      OR project_row."ownerUserId" IS DISTINCT FROM NEW."ownerUserId"
      OR assignment_row."projectId" IS DISTINCT FROM NEW."projectId"
      OR assignment_row."staffUserId" IS DISTINCT FROM NEW."lawyerUserId"
      OR assignment_row."status" <> 'active'
      OR owner_row."role" <> 'user' OR length(trim(owner_row."email")) = 0
      OR owner_row."email" ~* '^guest-[0-9]+(-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$'
      OR lawyer_row."role" <> 'lawyer' OR lawyer_row."emailVerifiedAt" IS NULL
      OR length(trim(lawyer_row."email")) = 0
      OR lawyer_row."email" ~* '^guest-[0-9]+(-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$'
      OR NEW."purpose" <> 'one_to_one_plain_text_project_collaboration'
      OR NEW."noticeVersion" <> 'm4-003-thread-participation-v1'
      OR NEW."noticeSha256" <> 'f7ee925c0addf047d4407081c18c5a33f8c123c09aeb2b60c2c2c2311e4f53fc'
      OR NEW."status" <> 'active' OR NEW."lastMessageSequence" <> 0
    THEN
      RAISE EXCEPTION 'Project human thread identity or authorization is invalid' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanThread_create_authority';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
    OR OLD."ownerUserId" IS DISTINCT FROM NEW."ownerUserId"
    OR OLD."assignmentId" IS DISTINCT FROM NEW."assignmentId"
    OR OLD."lawyerUserId" IS DISTINCT FROM NEW."lawyerUserId"
    OR OLD."purpose" IS DISTINCT FROM NEW."purpose"
    OR OLD."noticeVersion" IS DISTINCT FROM NEW."noticeVersion"
    OR OLD."noticeSha256" IS DISTINCT FROM NEW."noticeSha256"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
  THEN
    RAISE EXCEPTION 'Project human thread identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanThread_identity_immutable';
  END IF;
  IF OLD."status" = 'active' AND NEW."status" = 'active'
    AND NEW."lastMessageSequence" = OLD."lastMessageSequence" + 1
  THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'active' AND NEW."status" = 'closed'
    AND NEW."lastMessageSequence" = OLD."lastMessageSequence"
    AND EXISTS (SELECT 1 FROM "ProjectThreadParticipationConsent" c
      WHERE c."threadId" = OLD."id" AND c."status" = 'withdrawn'
        AND c."withdrawnByUserId" = OLD."ownerUserId")
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Project human thread permits only a next message sequence or consent closure' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanThread_transition';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ProjectHumanThread_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ProjectHumanThread" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_human_thread_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_human_consent_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  op "ProjectOperation"%ROWTYPE;
  project_row "StudyJourneyProject"%ROWTYPE;
  assignment_row "ProjectStaffAssignment"%ROWTYPE;
  owner_row "User"%ROWTYPE;
  lawyer_row "User"%ROWTYPE;
  thread_row "ProjectHumanThread"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Project thread participation consent cannot be deleted' USING ERRCODE = '23514', CONSTRAINT = 'ProjectThreadParticipationConsent_delete_protected';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO op FROM "ProjectOperation" WHERE "id" = NEW."createdOperationRecordId";
    SELECT * INTO project_row FROM "StudyJourneyProject" WHERE "id" = NEW."projectId";
    SELECT * INTO assignment_row FROM "ProjectStaffAssignment" WHERE "id" = NEW."assignmentId";
    SELECT * INTO owner_row FROM "User" WHERE "id" = NEW."ownerUserId";
    SELECT * INTO lawyer_row FROM "User" WHERE "id" = NEW."lawyerUserId";
    SELECT * INTO thread_row FROM "ProjectHumanThread" WHERE "id" = NEW."threadId";
    IF op."operationType" <> 'project_thread_participation_consent_create'
      OR op."actorKind" <> 'user' OR op."actorUserId" IS DISTINCT FROM NEW."ownerUserId"
      OR op."resultKind" <> 'project_thread_participation_consent' OR op."resultId" IS DISTINCT FROM NEW."id"
      OR NEW."acceptedByUserId" IS DISTINCT FROM NEW."ownerUserId"
      OR project_row."status" <> 'active' OR project_row."ownerUserId" IS DISTINCT FROM NEW."ownerUserId"
      OR project_row."revision" IS DISTINCT FROM NEW."createdProjectRevision"
      OR assignment_row."projectId" IS DISTINCT FROM NEW."projectId"
      OR assignment_row."staffUserId" IS DISTINCT FROM NEW."lawyerUserId"
      OR assignment_row."status" <> 'active'
      OR owner_row."role" <> 'user' OR length(trim(owner_row."email")) = 0
      OR owner_row."email" ~* '^guest-[0-9]+(-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$'
      OR lawyer_row."role" <> 'lawyer' OR lawyer_row."emailVerifiedAt" IS NULL
      OR length(trim(lawyer_row."email")) = 0
      OR lawyer_row."email" ~* '^guest-[0-9]+(-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$'
      OR thread_row."projectId" IS DISTINCT FROM NEW."projectId"
      OR thread_row."ownerUserId" IS DISTINCT FROM NEW."ownerUserId"
      OR thread_row."assignmentId" IS DISTINCT FROM NEW."assignmentId"
      OR thread_row."lawyerUserId" IS DISTINCT FROM NEW."lawyerUserId"
      OR thread_row."status" <> 'active'
      OR NEW."purpose" <> 'one_to_one_plain_text_project_collaboration'
      OR NEW."noticeVersion" <> 'm4-003-thread-participation-v1'
      OR NEW."noticeSha256" <> 'f7ee925c0addf047d4407081c18c5a33f8c123c09aeb2b60c2c2c2311e4f53fc'
      OR NEW."status" <> 'active'
    THEN
      RAISE EXCEPTION 'Project thread participation consent does not match its owner, assignment, notice, and operation' USING ERRCODE = '23514', CONSTRAINT = 'ProjectThreadParticipationConsent_create_authority';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."threadId" IS DISTINCT FROM NEW."threadId"
    OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
    OR OLD."ownerUserId" IS DISTINCT FROM NEW."ownerUserId"
    OR OLD."assignmentId" IS DISTINCT FROM NEW."assignmentId"
    OR OLD."lawyerUserId" IS DISTINCT FROM NEW."lawyerUserId"
    OR OLD."purpose" IS DISTINCT FROM NEW."purpose"
    OR OLD."noticeVersion" IS DISTINCT FROM NEW."noticeVersion"
    OR OLD."noticeSha256" IS DISTINCT FROM NEW."noticeSha256"
    OR OLD."acceptedByUserId" IS DISTINCT FROM NEW."acceptedByUserId"
    OR OLD."acceptedAt" IS DISTINCT FROM NEW."acceptedAt"
    OR OLD."createdOperationRecordId" IS DISTINCT FROM NEW."createdOperationRecordId"
    OR OLD."createdProjectRevision" IS DISTINCT FROM NEW."createdProjectRevision"
    OR OLD."status" <> 'active' OR NEW."status" <> 'withdrawn'
  THEN
    RAISE EXCEPTION 'Project thread participation consent permits one immutable withdrawal transition' USING ERRCODE = '23514', CONSTRAINT = 'ProjectThreadParticipationConsent_transition';
  END IF;
  SELECT * INTO op FROM "ProjectOperation" WHERE "id" = NEW."withdrawnOperationRecordId";
  SELECT * INTO project_row FROM "StudyJourneyProject" WHERE "id" = NEW."projectId";
  IF op."operationType" <> 'project_thread_participation_consent_withdraw'
    OR op."actorKind" <> 'user' OR op."actorUserId" IS DISTINCT FROM NEW."withdrawnByUserId"
    OR op."resultKind" <> 'project_thread_participation_consent' OR op."resultId" IS DISTINCT FROM NEW."id"
    OR NEW."withdrawnByUserId" IS DISTINCT FROM NEW."ownerUserId"
    OR project_row."status" <> 'active' OR project_row."ownerUserId" IS DISTINCT FROM NEW."ownerUserId"
    OR project_row."revision" IS DISTINCT FROM NEW."withdrawnProjectRevision"
  THEN
    RAISE EXCEPTION 'Consent withdrawal does not match its customer owner operation and Project revision' USING ERRCODE = '23514', CONSTRAINT = 'ProjectThreadParticipationConsent_withdrawal_authority';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ProjectThreadParticipationConsent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ProjectThreadParticipationConsent" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_human_consent_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_human_message_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  op "ProjectOperation"%ROWTYPE;
  thread_row "ProjectHumanThread"%ROWTYPE;
  consent_row "ProjectThreadParticipationConsent"%ROWTYPE;
  project_row "StudyJourneyProject"%ROWTYPE;
  assignment_row "ProjectStaffAssignment"%ROWTYPE;
  author_row "User"%ROWTYPE;
  owner_row "User"%ROWTYPE;
  lawyer_row "User"%ROWTYPE;
  author_allowed boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Project human messages are append-only' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanMessage_immutable';
  END IF;
  SELECT * INTO op FROM "ProjectOperation" WHERE "id" = NEW."operationRecordId";
  SELECT * INTO thread_row FROM "ProjectHumanThread" WHERE "id" = NEW."threadId";
  SELECT * INTO consent_row FROM "ProjectThreadParticipationConsent" WHERE "threadId" = NEW."threadId";
  SELECT * INTO project_row FROM "StudyJourneyProject" WHERE "id" = NEW."projectId";
  SELECT * INTO assignment_row FROM "ProjectStaffAssignment" WHERE "id" = thread_row."assignmentId";
  SELECT * INTO author_row FROM "User" WHERE "id" = NEW."authorUserId";
  SELECT * INTO owner_row FROM "User" WHERE "id" = thread_row."ownerUserId";
  SELECT * INTO lawyer_row FROM "User" WHERE "id" = thread_row."lawyerUserId";
  author_allowed := (NEW."authorUserId" = thread_row."ownerUserId"
      AND author_row."role" = 'user'
      AND length(trim(author_row."email")) > 0
      AND author_row."email" !~* '^guest-[0-9]+(-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$')
    OR (NEW."authorUserId" = thread_row."lawyerUserId"
      AND author_row."role" = 'lawyer'
      AND author_row."emailVerifiedAt" IS NOT NULL
      AND length(trim(author_row."email")) > 0
      AND author_row."email" !~* '^guest-[0-9]+(-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$');
  IF op."operationType" <> 'project_human_message_send'
    OR op."actorKind" <> 'user' OR op."actorUserId" IS DISTINCT FROM NEW."authorUserId"
    OR op."resultKind" <> 'project_human_message' OR op."resultId" IS DISTINCT FROM NEW."id"
    OR thread_row."projectId" IS DISTINCT FROM NEW."projectId"
    OR thread_row."status" <> 'active'
    OR thread_row."lastMessageSequence" IS DISTINCT FROM NEW."sequence"
    OR consent_row."status" <> 'active'
    OR project_row."status" <> 'active'
    OR assignment_row."projectId" IS DISTINCT FROM NEW."projectId"
    OR assignment_row."staffUserId" IS DISTINCT FROM thread_row."lawyerUserId"
    OR assignment_row."status" <> 'active'
    OR owner_row."role" <> 'user'
    OR length(trim(owner_row."email")) = 0
    OR owner_row."email" ~* '^guest-[0-9]+(-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$'
    OR lawyer_row."role" <> 'lawyer'
    OR lawyer_row."emailVerifiedAt" IS NULL
    OR length(trim(lawyer_row."email")) = 0
    OR lawyer_row."email" ~* '^guest-[0-9]+(-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$'
    OR owner_row."id" IS DISTINCT FROM thread_row."ownerUserId"
    OR lawyer_row."id" IS DISTINCT FROM thread_row."lawyerUserId"
    OR NOT author_allowed
  THEN
    RAISE EXCEPTION 'Project human message actor, consent, assignment, or sequence is invalid' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanMessage_authority';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ProjectHumanMessage_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ProjectHumanMessage" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_human_message_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_human_event_binding"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  op "ProjectOperation"%ROWTYPE;
  consent_row "ProjectThreadParticipationConsent"%ROWTYPE;
  project_revision integer;
  expected_operation text;
  expected_actor uuid;
BEGIN
  IF NEW."eventType" NOT IN ('project_thread_participation_consent_created','project_thread_participation_consent_withdrawn') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO op FROM "ProjectOperation" WHERE "id" = NEW."operationRecordId";
  SELECT * INTO consent_row FROM "ProjectThreadParticipationConsent" WHERE "id" = NEW."subjectId";
  SELECT "revision" INTO project_revision FROM "StudyJourneyProject" WHERE "id" = NEW."projectId";
  IF NEW."subjectKind" <> 'project_thread_participation_consent'
    OR consent_row."projectId" IS DISTINCT FROM NEW."projectId"
    OR project_revision IS DISTINCT FROM NEW."projectRevision"
    OR op."actorKind" <> 'user' OR op."actorUserId" IS DISTINCT FROM NEW."actorUserId"
    OR op."resultKind" <> 'project_thread_participation_consent'
    OR op."resultId" IS DISTINCT FROM NEW."subjectId"
  THEN
    RAISE EXCEPTION 'Project human consent event does not match its operation and subject' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanConsentEvent_binding';
  END IF;
  IF NEW."eventType" = 'project_thread_participation_consent_created' THEN
    expected_operation := 'project_thread_participation_consent_create';
    expected_actor := consent_row."acceptedByUserId";
    IF consent_row."createdOperationRecordId" IS DISTINCT FROM op."id"
      OR consent_row."createdProjectRevision" IS DISTINCT FROM NEW."projectRevision"
    THEN
      RAISE EXCEPTION 'Consent creation event does not match its immutable evidence' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanConsentEvent_create_match';
    END IF;
  ELSE
    expected_operation := 'project_thread_participation_consent_withdraw';
    expected_actor := consent_row."withdrawnByUserId";
    IF consent_row."withdrawnOperationRecordId" IS DISTINCT FROM op."id"
      OR consent_row."withdrawnProjectRevision" IS DISTINCT FROM NEW."projectRevision"
    THEN
      RAISE EXCEPTION 'Consent withdrawal event does not match its immutable evidence' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanConsentEvent_withdraw_match';
    END IF;
  END IF;
  IF op."operationType" IS DISTINCT FROM expected_operation
    OR op."actorUserId" IS DISTINCT FROM expected_actor
  THEN
    RAISE EXCEPTION 'Project human consent event actor or operation type is invalid' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanConsentEvent_actor_scope';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ProjectHumanConsentEvent_binding" BEFORE INSERT ON "ProjectEvent" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_human_event_binding"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_human_operation_complete"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_event text;
  project_id uuid;
  revision integer;
  event_count integer;
BEGIN
  IF NEW."operationType" NOT IN ('project_thread_participation_consent_create','project_thread_participation_consent_withdraw','project_human_message_send') THEN
    RETURN NULL;
  END IF;
  IF NEW."actorKind" <> 'user' THEN
    RAISE EXCEPTION 'Project human messaging operations require a user actor' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanMessagingOperation_actor_scope';
  END IF;
  IF NEW."operationType" = 'project_human_message_send' THEN
    IF NEW."resultKind" <> 'project_human_message'
      OR NOT EXISTS (SELECT 1 FROM "ProjectHumanMessage" m
        WHERE m."id" = NEW."resultId" AND m."operationRecordId" = NEW."id"
          AND m."authorUserId" = NEW."actorUserId")
    THEN
      RAISE EXCEPTION 'Human message operation requires one matching immutable message' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanMessageOperation_result_required';
    END IF;
    SELECT count(*) INTO event_count FROM "ProjectEvent" WHERE "operationRecordId" = NEW."id";
    IF event_count <> 0 THEN
      RAISE EXCEPTION 'Human message sends do not create Project revision events' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanMessageOperation_event_forbidden';
    END IF;
    RETURN NULL;
  END IF;
  expected_event := CASE NEW."operationType"
    WHEN 'project_thread_participation_consent_create' THEN 'project_thread_participation_consent_created'
    ELSE 'project_thread_participation_consent_withdrawn'
  END;
  IF NEW."resultKind" <> 'project_thread_participation_consent' THEN
    RAISE EXCEPTION 'Consent operation requires a consent result' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanConsentOperation_result_required';
  END IF;
  IF NEW."operationType" = 'project_thread_participation_consent_create' THEN
    SELECT c."projectId", c."createdProjectRevision" INTO project_id, revision
      FROM "ProjectThreadParticipationConsent" c
      WHERE c."id" = NEW."resultId" AND c."createdOperationRecordId" = NEW."id";
  ELSE
    SELECT c."projectId", c."withdrawnProjectRevision" INTO project_id, revision
      FROM "ProjectThreadParticipationConsent" c
      WHERE c."id" = NEW."resultId" AND c."withdrawnOperationRecordId" = NEW."id";
  END IF;
  IF project_id IS NULL OR revision IS NULL THEN
    RAISE EXCEPTION 'Consent operation requires matching persisted consent evidence' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanConsentOperation_consent_required';
  END IF;
  SELECT count(*) INTO event_count FROM "ProjectEvent" WHERE "operationRecordId" = NEW."id";
  IF event_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM "ProjectEvent" e WHERE e."operationRecordId" = NEW."id"
      AND e."projectId" = project_id AND e."projectRevision" = revision
      AND e."eventType" = expected_event
      AND e."subjectKind" = 'project_thread_participation_consent'
      AND e."subjectId" = NEW."resultId"
      AND e."actorKind" = 'user' AND e."actorUserId" = NEW."actorUserId"
  ) THEN
    RAISE EXCEPTION 'Consent operation requires exactly one matching Project revision event' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanConsentOperation_event_required';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ProjectHumanMessagingOperation_complete" AFTER INSERT ON "ProjectOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "phase13_m4_human_operation_complete"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_human_thread_complete"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM "ProjectThreadParticipationConsent" c
      WHERE c."threadId" = NEW."id" AND c."projectId" = NEW."projectId"
        AND c."ownerUserId" = NEW."ownerUserId" AND c."assignmentId" = NEW."assignmentId"
        AND c."lawyerUserId" = NEW."lawyerUserId"
        AND c."createdProjectRevision" > 0)
    THEN
      RAISE EXCEPTION 'New human thread requires matching explicit participation consent' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanThread_consent_required';
    END IF;
    RETURN NULL;
  END IF;
  IF NEW."lastMessageSequence" = OLD."lastMessageSequence" + 1 THEN
    IF NOT EXISTS (SELECT 1 FROM "ProjectHumanMessage" m
      JOIN "ProjectOperation" op ON op."id" = m."operationRecordId"
      WHERE m."threadId" = NEW."id" AND m."projectId" = NEW."projectId"
        AND m."sequence" = NEW."lastMessageSequence"
        AND op."operationType" = 'project_human_message_send'
        AND op."resultKind" = 'project_human_message'
        AND op."resultId" = m."id" AND op."actorUserId" = m."authorUserId")
    THEN
      RAISE EXCEPTION 'Human thread sequence increment requires one matching message operation' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanThread_message_required';
    END IF;
  ELSIF NEW."status" = 'closed' THEN
    IF NOT EXISTS (SELECT 1 FROM "ProjectThreadParticipationConsent" c
      WHERE c."threadId" = NEW."id" AND c."status" = 'withdrawn'
        AND c."withdrawnByUserId" = NEW."ownerUserId")
    THEN
      RAISE EXCEPTION 'Closed human thread requires owner consent withdrawal' USING ERRCODE = '23514', CONSTRAINT = 'ProjectHumanThread_withdrawal_required';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ProjectHumanThread_complete" AFTER INSERT OR UPDATE ON "ProjectHumanThread" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "phase13_m4_human_thread_complete"();
