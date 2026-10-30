CREATE TABLE IF NOT EXISTS "SchoolApplication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"ownerUserId" uuid NOT NULL,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"institutionName" varchar(200) NOT NULL,
	"institutionId" varchar(128),
	"courseTitle" varchar(200) NOT NULL,
	"courseId" varchar(128),
	"deliveryId" varchar(128),
	"intakeId" varchar(128),
	"intakeLabel" varchar(120),
	"sourceStatus" varchar DEFAULT 'unverified_customer_declared' NOT NULL,
	"catalogRecordClass" varchar,
	"catalogSnapshotToken" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"archivedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SchoolApplicationEvent" (
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
CREATE TABLE IF NOT EXISTS "SchoolApplicationOperation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actorUserId" uuid NOT NULL,
	"operationId" varchar(128) NOT NULL,
	"operationType" varchar NOT NULL,
	"requestSha256" varchar(64) NOT NULL,
	"resultKind" varchar NOT NULL,
	"resultId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SchoolApplicationPackage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicationId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" varchar DEFAULT 'current' NOT NULL,
	"schemaVersion" varchar(64) NOT NULL,
	"contentSha256" varchar(64) NOT NULL,
	"inputsSha256" varchar(64) NOT NULL,
	"targetKind" varchar(64) NOT NULL,
	"targetId" varchar(128) NOT NULL,
	"targetVersion" integer NOT NULL,
	"targetSha256" varchar(64) NOT NULL,
	"targetBindingSha256" varchar(64) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"createdByUserId" uuid NOT NULL,
	"operationId" varchar(128) NOT NULL,
	"requestSha256" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SchoolApplicationReference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicationId" uuid NOT NULL,
	"projectId" uuid NOT NULL,
	"kind" varchar NOT NULL,
	"referenceId" uuid NOT NULL,
	"referenceVersion" integer NOT NULL,
	"referenceSha256" varchar(64) NOT NULL,
	"createdByUserId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"revokedAt" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolApplication_project_id_unique" ON "SchoolApplication" USING btree ("projectId","id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SchoolApplication_project_owner_created_idx" ON "SchoolApplication" USING btree ("projectId","ownerUserId","createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolApplicationEvent_revision_event_unique" ON "SchoolApplicationEvent" USING btree ("applicationId","applicationRevision","eventType");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SchoolApplicationEvent_application_created_idx" ON "SchoolApplicationEvent" USING btree ("applicationId","createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolApplicationOperation_actor_operation_unique" ON "SchoolApplicationOperation" USING btree ("actorUserId","operationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SchoolApplicationOperation_actor_created_idx" ON "SchoolApplicationOperation" USING btree ("actorUserId","createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolApplicationPackage_application_version_unique" ON "SchoolApplicationPackage" USING btree ("applicationId","version");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolApplicationPackage_current_application_unique" ON "SchoolApplicationPackage" USING btree ("applicationId") WHERE "SchoolApplicationPackage"."status" = 'current';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SchoolApplicationPackage_application_created_idx" ON "SchoolApplicationPackage" USING btree ("applicationId","createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolApplicationReference_active_unique" ON "SchoolApplicationReference" USING btree ("applicationId","kind","referenceId") WHERE "SchoolApplicationReference"."revokedAt" is null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SchoolApplicationReference_application_idx" ON "SchoolApplicationReference" USING btree ("applicationId","createdAt");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_ownerUserId_User_id_fk" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolApplicationEvent" ADD CONSTRAINT "SchoolApplicationEvent_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolApplicationEvent" ADD CONSTRAINT "SchoolApplicationEvent_operationRecordId_SchoolApplicationOperation_id_fk" FOREIGN KEY ("operationRecordId") REFERENCES "public"."SchoolApplicationOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolApplicationEvent" ADD CONSTRAINT "SchoolApplicationEvent_application_fk" FOREIGN KEY ("projectId","applicationId") REFERENCES "public"."SchoolApplication"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolApplicationOperation" ADD CONSTRAINT "SchoolApplicationOperation_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolApplicationPackage" ADD CONSTRAINT "SchoolApplicationPackage_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolApplicationPackage" ADD CONSTRAINT "SchoolApplicationPackage_application_fk" FOREIGN KEY ("projectId","applicationId") REFERENCES "public"."SchoolApplication"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolApplicationReference" ADD CONSTRAINT "SchoolApplicationReference_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SchoolApplicationReference" ADD CONSTRAINT "SchoolApplicationReference_application_fk" FOREIGN KEY ("projectId","applicationId") REFERENCES "public"."SchoolApplication"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_revision_check" CHECK ("revision" > 0);
--> statement-breakpoint
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_status_check" CHECK ("status" in ('draft', 'preparing', 'package_prepared', 'stale', 'archived'));
--> statement-breakpoint
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_source_status_check" CHECK ("sourceStatus" in ('unverified_customer_declared', 'unverified_catalog_match', 'synthetic_catalog_match'));
--> statement-breakpoint
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_catalog_class_check" CHECK ("catalogRecordClass" is null or "catalogRecordClass" in ('SYNTHETIC', 'UNVERIFIED'));
--> statement-breakpoint
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_source_class_consistency_check" CHECK (("sourceStatus" = 'unverified_customer_declared' and "catalogRecordClass" is null and "catalogSnapshotToken" is null) or ("sourceStatus" = 'unverified_catalog_match' and "catalogRecordClass" = 'UNVERIFIED') or ("sourceStatus" = 'synthetic_catalog_match' and "catalogRecordClass" = 'SYNTHETIC'));
--> statement-breakpoint
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_institution_name_check" CHECK (length(trim("institutionName")) between 1 and 200);
--> statement-breakpoint
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_course_title_check" CHECK (length(trim("courseTitle")) between 1 and 200);
--> statement-breakpoint
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_intake_label_check" CHECK ("intakeLabel" is null or length(trim("intakeLabel")) between 1 and 120);
--> statement-breakpoint
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_catalog_id_shape_check" CHECK (("institutionId" is null or "institutionId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') and ("courseId" is null or "courseId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') and ("deliveryId" is null or "deliveryId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') and ("intakeId" is null or "intakeId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'));
--> statement-breakpoint
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_archive_check" CHECK (("status" = 'archived' and "archivedAt" is not null) or ("status" <> 'archived' and "archivedAt" is null));
--> statement-breakpoint
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_updated_at_check" CHECK ("updatedAt" >= "createdAt");
--> statement-breakpoint
ALTER TABLE "SchoolApplicationPackage" ADD CONSTRAINT "SchoolApplicationPackage_version_check" CHECK ("version" > 0 and "targetVersion" = "version");
--> statement-breakpoint
ALTER TABLE "SchoolApplicationPackage" ADD CONSTRAINT "SchoolApplicationPackage_status_check" CHECK ("status" in ('current', 'superseded', 'stale'));
--> statement-breakpoint
ALTER TABLE "SchoolApplicationPackage" ADD CONSTRAINT "SchoolApplicationPackage_target_kind_check" CHECK ("targetKind" = 'managed_school_application');
--> statement-breakpoint
ALTER TABLE "SchoolApplicationPackage" ADD CONSTRAINT "SchoolApplicationPackage_target_identity_check" CHECK ("targetId" = "applicationId"::text and "targetSha256" = "contentSha256");
--> statement-breakpoint
ALTER TABLE "SchoolApplicationPackage" ADD CONSTRAINT "SchoolApplicationPackage_hash_check" CHECK ("contentSha256" ~ '^[0-9a-f]{64}$' and "inputsSha256" ~ '^[0-9a-f]{64}$' and "targetSha256" ~ '^[0-9a-f]{64}$' and "targetBindingSha256" ~ '^[0-9a-f]{64}$' and "requestSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "SchoolApplicationPackage" ADD CONSTRAINT "SchoolApplicationPackage_schema_version_check" CHECK (length(trim("schemaVersion")) between 1 and 64);
--> statement-breakpoint
ALTER TABLE "SchoolApplicationPackage" ADD CONSTRAINT "SchoolApplicationPackage_operation_id_check" CHECK ("operationId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
--> statement-breakpoint
ALTER TABLE "SchoolApplicationPackage" ADD CONSTRAINT "SchoolApplicationPackage_snapshot_check" CHECK (jsonb_typeof("snapshot") = 'object');
--> statement-breakpoint
ALTER TABLE "SchoolApplicationReference" ADD CONSTRAINT "SchoolApplicationReference_kind_check" CHECK ("kind" in ('fact', 'requirement', 'document'));
--> statement-breakpoint
ALTER TABLE "SchoolApplicationReference" ADD CONSTRAINT "SchoolApplicationReference_reference_version_check" CHECK ("referenceVersion" > 0);
--> statement-breakpoint
ALTER TABLE "SchoolApplicationReference" ADD CONSTRAINT "SchoolApplicationReference_reference_hash_check" CHECK ("referenceSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "SchoolApplicationOperation" ADD CONSTRAINT "SchoolApplicationOperation_operation_id_check" CHECK ("operationId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
--> statement-breakpoint
ALTER TABLE "SchoolApplicationOperation" ADD CONSTRAINT "SchoolApplicationOperation_request_hash_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "SchoolApplicationOperation" ADD CONSTRAINT "SchoolApplicationOperation_type_check" CHECK ("operationType" in ('school_application_create', 'school_application_update', 'school_application_archive', 'school_application_reference_bind', 'school_application_reference_revoke', 'school_application_package_build'));
--> statement-breakpoint
ALTER TABLE "SchoolApplicationOperation" ADD CONSTRAINT "SchoolApplicationOperation_result_kind_check" CHECK ("resultKind" in ('school_application', 'school_application_reference', 'school_application_package'));
--> statement-breakpoint
ALTER TABLE "SchoolApplicationEvent" ADD CONSTRAINT "SchoolApplicationEvent_revision_check" CHECK ("applicationRevision" > 0);
--> statement-breakpoint
ALTER TABLE "SchoolApplicationEvent" ADD CONSTRAINT "SchoolApplicationEvent_event_type_check" CHECK ("eventType" in ('school_application_created', 'school_application_updated', 'school_application_archived', 'school_application_reference_bound', 'school_application_reference_revoked', 'school_application_package_built', 'school_application_package_invalidated'));
--> statement-breakpoint
ALTER TABLE "SchoolApplicationEvent" ADD CONSTRAINT "SchoolApplicationEvent_subject_kind_check" CHECK ("subjectKind" in ('school_application', 'school_application_reference', 'school_application_package'));
--> statement-breakpoint
ALTER TABLE "SchoolApplicationEvent" ADD CONSTRAINT "SchoolApplicationEvent_subject_shape_check" CHECK (("eventType" in ('school_application_created', 'school_application_updated', 'school_application_archived') and "subjectKind" = 'school_application' and "subjectId" = "applicationId") or ("eventType" in ('school_application_reference_bound', 'school_application_reference_revoked') and "subjectKind" = 'school_application_reference') or ("eventType" in ('school_application_package_built', 'school_application_package_invalidated') and "subjectKind" = 'school_application_package'));
--> statement-breakpoint
CREATE FUNCTION "phase13_m5_1_application_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  -- Application identity is immutable. The material target text
  -- (institution/course/delivery/intake and their display names) is explicitly
  -- NOT frozen: the authorized CAS update path is the only way to change it, and
  -- every such change advances the revision and invalidates the current package.
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'School application identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'SchoolApplication_identity_immutable';
  END IF;
  IF NEW."archivedAt" IS DISTINCT FROM OLD."archivedAt"
    AND NOT (OLD."archivedAt" IS NULL AND NEW."status" = 'archived')
  THEN
    RAISE EXCEPTION 'Archival is the only permitted archivedAt transition' USING ERRCODE = '23514', CONSTRAINT = 'SchoolApplication_archive_transition';
  END IF;
  IF NEW."revision" <> OLD."revision" + 1 THEN
    RAISE EXCEPTION 'School application revision must advance by exactly one' USING ERRCODE = '23514', CONSTRAINT = 'SchoolApplication_revision_step';
  END IF;
  IF OLD."status" = 'archived' THEN
    RAISE EXCEPTION 'Archived school applications are terminal' USING ERRCODE = '23514', CONSTRAINT = 'SchoolApplication_terminal_state';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "SchoolApplication_guard" BEFORE UPDATE ON "SchoolApplication" FOR EACH ROW EXECUTE FUNCTION "phase13_m5_1_application_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m5_1_package_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'School application packages are immutable' USING ERRCODE = '23514', CONSTRAINT = 'SchoolApplicationPackage_append_only';
  END IF;
  IF NEW."applicationId" IS DISTINCT FROM OLD."applicationId"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion"
    OR NEW."contentSha256" IS DISTINCT FROM OLD."contentSha256"
    OR NEW."inputsSha256" IS DISTINCT FROM OLD."inputsSha256"
    OR NEW."targetKind" IS DISTINCT FROM OLD."targetKind"
    OR NEW."targetId" IS DISTINCT FROM OLD."targetId"
    OR NEW."targetVersion" IS DISTINCT FROM OLD."targetVersion"
    OR NEW."targetSha256" IS DISTINCT FROM OLD."targetSha256"
    OR NEW."targetBindingSha256" IS DISTINCT FROM OLD."targetBindingSha256"
    OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    OR NEW."operationId" IS DISTINCT FROM OLD."operationId"
    OR NEW."requestSha256" IS DISTINCT FROM OLD."requestSha256"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Only package status may change after creation' USING ERRCODE = '23514', CONSTRAINT = 'SchoolApplicationPackage_immutable';
  END IF;
  IF NOT (
    (OLD."status" = 'current' AND NEW."status" IN ('superseded', 'stale'))
    OR OLD."status" = NEW."status"
  ) THEN
    RAISE EXCEPTION 'Package status transition is not permitted' USING ERRCODE = '23514', CONSTRAINT = 'SchoolApplicationPackage_transition';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "SchoolApplicationPackage_guard" BEFORE UPDATE OR DELETE ON "SchoolApplicationPackage" FOR EACH ROW EXECUTE FUNCTION "phase13_m5_1_package_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m5_1_reference_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'School application references are retained as history' USING ERRCODE = '23514', CONSTRAINT = 'SchoolApplicationReference_append_only';
  END IF;
  IF NEW."applicationId" IS DISTINCT FROM OLD."applicationId"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."referenceId" IS DISTINCT FROM OLD."referenceId"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR OLD."revokedAt" IS NOT NULL
  THEN
    RAISE EXCEPTION 'Reference identity is immutable and revocation is final' USING ERRCODE = '23514', CONSTRAINT = 'SchoolApplicationReference_immutable';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "SchoolApplicationReference_guard" BEFORE UPDATE OR DELETE ON "SchoolApplicationReference" FOR EACH ROW EXECUTE FUNCTION "phase13_m5_1_reference_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m5_1_append_only_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'School application audit records are append-only' USING ERRCODE = '23514', CONSTRAINT = 'SchoolApplication_audit_append_only';
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "SchoolApplicationOperation_append_only" BEFORE UPDATE OR DELETE ON "SchoolApplicationOperation" FOR EACH ROW EXECUTE FUNCTION "phase13_m5_1_append_only_guard"();
--> statement-breakpoint
CREATE TRIGGER "SchoolApplicationEvent_append_only" BEFORE UPDATE OR DELETE ON "SchoolApplicationEvent" FOR EACH ROW EXECUTE FUNCTION "phase13_m5_1_append_only_guard"();
