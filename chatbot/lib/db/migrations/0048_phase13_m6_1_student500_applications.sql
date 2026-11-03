CREATE TABLE IF NOT EXISTS "Student500Application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"ownerUserId" uuid NOT NULL,
	"applicantUserId" uuid NOT NULL,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"entryRoute" varchar,
	"coeStatus" varchar DEFAULT 'unknown' NOT NULL,
	"applicationPlace" varchar DEFAULT 'unknown' NOT NULL,
	"asOfDate" varchar(10),
	"currentVisaSubclass" varchar(128),
	"historyDeclaration" varchar DEFAULT 'not_declared' NOT NULL,
	"historyFlags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applicantAgeBand" varchar DEFAULT 'unknown' NOT NULL,
	"dependants" varchar DEFAULT 'unknown' NOT NULL,
	"englishEvidence" varchar DEFAULT 'unknown' NOT NULL,
	"financialEvidence" varchar DEFAULT 'unknown' NOT NULL,
	"oshcEvidence" varchar DEFAULT 'unknown' NOT NULL,
	"schoolApplicationId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"archivedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Student500ApplicationEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicationId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"actorUserId" uuid NOT NULL,
	"eventType" varchar NOT NULL,
	"subjectKind" varchar NOT NULL,
	"subjectId" uuid NOT NULL,
	"applicationRevision" integer NOT NULL,
	"operationRecordId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Student500ApplicationOperation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actorUserId" uuid NOT NULL,
	"operationId" varchar(128) NOT NULL,
	"applicationId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"operationType" varchar NOT NULL,
	"requestSha256" varchar(64) NOT NULL,
	"resultKind" varchar NOT NULL,
	"resultId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500Application_project_id_unique" ON "Student500Application" USING btree ("projectId","id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Student500Application_project_owner_created_idx" ON "Student500Application" USING btree ("projectId","ownerUserId","createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500ApplicationEvent_revision_event_unique" ON "Student500ApplicationEvent" USING btree ("applicationId","applicationRevision","eventType");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Student500ApplicationEvent_application_created_idx" ON "Student500ApplicationEvent" USING btree ("applicationId","createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500ApplicationOperation_actor_operation_unique" ON "Student500ApplicationOperation" USING btree ("actorUserId","operationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Student500ApplicationOperation_application_created_idx" ON "Student500ApplicationOperation" USING btree ("applicationId","createdAt");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_ownerUserId_User_id_fk" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_applicantUserId_User_id_fk" FOREIGN KEY ("applicantUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_schoolApplicationId_SchoolApplication_id_fk" FOREIGN KEY ("schoolApplicationId") REFERENCES "public"."SchoolApplication"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500ApplicationEvent" ADD CONSTRAINT "Student500ApplicationEvent_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500ApplicationEvent" ADD CONSTRAINT "Student500ApplicationEvent_application_fk" FOREIGN KEY ("projectId","applicationId") REFERENCES "public"."Student500Application"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500ApplicationOperation" ADD CONSTRAINT "Student500ApplicationOperation_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500ApplicationOperation" ADD CONSTRAINT "Student500ApplicationOperation_application_fk" FOREIGN KEY ("projectId","applicationId") REFERENCES "public"."Student500Application"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_revision_check" CHECK ("revision" > 0);
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_status_check" CHECK ("status" in ('draft', 'in_progress', 'archived'));
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_entry_route_check" CHECK ("entryRoute" is null or "entryRoute" in ('existing_coe', 'offer_only', 'school_application_in_progress', 'no_school_application'));
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_coe_status_check" CHECK ("coeStatus" in ('reported_held', 'reported_not_held', 'unknown'));
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_application_place_check" CHECK ("applicationPlace" in ('onshore', 'offshore', 'unknown'));
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_history_declaration_check" CHECK ("historyDeclaration" in ('not_declared', 'declared_none', 'declared_some'));
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_history_flags_shape_check" CHECK (jsonb_typeof("historyFlags") = 'array');
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_history_flags_consistency_check" CHECK (("historyDeclaration" = 'declared_some' and jsonb_array_length("historyFlags") between 1 and 8) or ("historyDeclaration" <> 'declared_some' and jsonb_array_length("historyFlags") = 0));
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_age_band_check" CHECK ("applicantAgeBand" in ('adult', 'under_18', 'unknown'));
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_dependants_check" CHECK ("dependants" in ('none', 'one_or_more', 'unknown'));
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_evidence_status_check" CHECK ("englishEvidence" in ('reported_held', 'reported_not_held', 'unknown') and "financialEvidence" in ('reported_held', 'reported_not_held', 'unknown') and "oshcEvidence" in ('reported_held', 'reported_not_held', 'unknown'));
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_archive_check" CHECK (("status" = 'archived' and "archivedAt" is not null) or ("status" <> 'archived' and "archivedAt" is null));
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_applicant_is_owner_check" CHECK ("applicantUserId" = "ownerUserId");
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_as_of_date_check" CHECK ("asOfDate" is null or "asOfDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
--> statement-breakpoint
ALTER TABLE "Student500Application" ADD CONSTRAINT "Student500Application_updated_at_check" CHECK ("updatedAt" >= "createdAt");
--> statement-breakpoint
ALTER TABLE "Student500ApplicationEvent" ADD CONSTRAINT "Student500ApplicationEvent_revision_check" CHECK ("applicationRevision" > 0);
--> statement-breakpoint
ALTER TABLE "Student500ApplicationEvent" ADD CONSTRAINT "Student500ApplicationEvent_event_type_check" CHECK ("eventType" in ('student_500_created', 'student_500_updated', 'student_500_archived'));
--> statement-breakpoint
ALTER TABLE "Student500ApplicationEvent" ADD CONSTRAINT "Student500ApplicationEvent_subject_kind_check" CHECK ("subjectKind" in ('student_500_application'));
--> statement-breakpoint
ALTER TABLE "Student500ApplicationOperation" ADD CONSTRAINT "Student500ApplicationOperation_operation_type_check" CHECK ("operationType" in ('student_500_create', 'student_500_update', 'student_500_archive'));
--> statement-breakpoint
ALTER TABLE "Student500ApplicationOperation" ADD CONSTRAINT "Student500ApplicationOperation_result_kind_check" CHECK ("resultKind" in ('student_500_application'));
--> statement-breakpoint
ALTER TABLE "Student500ApplicationOperation" ADD CONSTRAINT "Student500ApplicationOperation_request_sha_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
CREATE FUNCTION "phase13_m6_1_application_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId"
    OR NEW."applicantUserId" IS DISTINCT FROM OLD."applicantUserId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Student 500 application identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'Student500Application_identity_immutable';
  END IF;
  IF OLD."status" = 'archived' THEN
    RAISE EXCEPTION 'Student 500 application is archived and read-only' USING ERRCODE = '23514', CONSTRAINT = 'Student500Application_archived_terminal';
  END IF;
  IF NEW."revision" <> OLD."revision" + 1 THEN
    RAISE EXCEPTION 'Student 500 application revision must advance by exactly one' USING ERRCODE = '23514', CONSTRAINT = 'Student500Application_revision_advance';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "Student500Application_guard" BEFORE UPDATE ON "Student500Application" FOR EACH ROW EXECUTE FUNCTION "phase13_m6_1_application_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m6_1_append_only_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'Student 500 audit records are append-only' USING ERRCODE = '23514', CONSTRAINT = 'Student500Application_audit_append_only';
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "Student500ApplicationOperation_append_only" BEFORE UPDATE OR DELETE ON "Student500ApplicationOperation" FOR EACH ROW EXECUTE FUNCTION "phase13_m6_1_append_only_guard"();
--> statement-breakpoint
CREATE TRIGGER "Student500ApplicationEvent_append_only" BEFORE UPDATE OR DELETE ON "Student500ApplicationEvent" FOR EACH ROW EXECUTE FUNCTION "phase13_m6_1_append_only_guard"();
