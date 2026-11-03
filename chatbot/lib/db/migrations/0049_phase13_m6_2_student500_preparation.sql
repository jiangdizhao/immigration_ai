CREATE TABLE IF NOT EXISTS "Student500FactReference" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"projectId" uuid NOT NULL,
"applicationId" uuid NOT NULL,
"factAssertionId" uuid NOT NULL,
"factVersion" integer NOT NULL,
"factKey" varchar(128) NOT NULL,
"originKind" varchar NOT NULL,
"stateAtUse" varchar NOT NULL,
"aiUseAuthorizedAtSelection" boolean NOT NULL,
"authorizationAudience" varchar NOT NULL,
"authorizationActorUserId" uuid,
"sourceEvidenceRef" varchar(256),
"createdByUserId" uuid NOT NULL,
"createdAt" timestamp DEFAULT now() NOT NULL,
"revokedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Student500GsDraft" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"projectId" uuid NOT NULL,
"applicationId" uuid NOT NULL,
"version" integer NOT NULL,
"origin" varchar NOT NULL,
"sections" jsonb NOT NULL,
"sectionCount" integer NOT NULL,
"contentSha256" varchar(64) NOT NULL,
"inputDigest" varchar(64) NOT NULL,
"sourceFactReferenceIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
"supersedesDraftId" uuid,
"createdByUserId" uuid NOT NULL,
"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Student500PreparationSnapshot" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"projectId" uuid NOT NULL,
"applicationId" uuid NOT NULL,
"version" integer NOT NULL,
"applicationRevision" integer NOT NULL,
"content" jsonb NOT NULL,
"contentSha256" varchar(64) NOT NULL,
"inputDigest" varchar(64) NOT NULL,
"gsDraftId" uuid,
"createdByUserId" uuid NOT NULL,
"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Student500SchoolContext" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"projectId" uuid NOT NULL,
"applicationId" uuid NOT NULL,
"kind" varchar NOT NULL,
"studyEvidenceKind" varchar NOT NULL,
"schoolApplicationId" uuid,
"admissionCaseId" uuid,
"admissionOutcomeKind" varchar,
"admissionOutcomeVersion" integer,
"admissionOutcomeProvenance" varchar(64),
"admissionOutcomeVerified" boolean,
"revision" integer DEFAULT 1 NOT NULL,
"createdAt" timestamp DEFAULT now() NOT NULL,
"updatedAt" timestamp DEFAULT now() NOT NULL,
"updatedByUserId" uuid NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500FactReference_application_fact_version_unique" ON "Student500FactReference" USING btree ("applicationId","factAssertionId","factVersion") WHERE "revokedAt" is null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Student500FactReference_application_created_idx" ON "Student500FactReference" USING btree ("applicationId","createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500GsDraft_project_id_unique" ON "Student500GsDraft" USING btree ("projectId","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500GsDraft_application_version_unique" ON "Student500GsDraft" USING btree ("applicationId","version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Student500GsDraft_application_created_idx" ON "Student500GsDraft" USING btree ("applicationId","createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500PreparationSnapshot_project_id_unique" ON "Student500PreparationSnapshot" USING btree ("projectId","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500PreparationSnapshot_application_version_unique" ON "Student500PreparationSnapshot" USING btree ("applicationId","version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Student500PreparationSnapshot_application_created_idx" ON "Student500PreparationSnapshot" USING btree ("applicationId","createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500SchoolContext_application_unique" ON "Student500SchoolContext" USING btree ("applicationId");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500FactReference" ADD CONSTRAINT "Student500FactReference_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500FactReference" ADD CONSTRAINT "Student500FactReference_authorizationActorUserId_User_id_fk" FOREIGN KEY ("authorizationActorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500FactReference" ADD CONSTRAINT "Student500FactReference_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500FactReference" ADD CONSTRAINT "Student500FactReference_application_fk" FOREIGN KEY ("projectId","applicationId") REFERENCES "public"."Student500Application"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500GsDraft" ADD CONSTRAINT "Student500GsDraft_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500GsDraft" ADD CONSTRAINT "Student500GsDraft_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500GsDraft" ADD CONSTRAINT "Student500GsDraft_application_fk" FOREIGN KEY ("projectId","applicationId") REFERENCES "public"."Student500Application"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500PreparationSnapshot" ADD CONSTRAINT "Student500PreparationSnapshot_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500PreparationSnapshot" ADD CONSTRAINT "Student500PreparationSnapshot_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500PreparationSnapshot" ADD CONSTRAINT "Student500PreparationSnapshot_application_fk" FOREIGN KEY ("projectId","applicationId") REFERENCES "public"."Student500Application"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500PreparationSnapshot" ADD CONSTRAINT "Student500PreparationSnapshot_draft_fk" FOREIGN KEY ("projectId","gsDraftId") REFERENCES "public"."Student500GsDraft"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500SchoolContext" ADD CONSTRAINT "Student500SchoolContext_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500SchoolContext" ADD CONSTRAINT "Student500SchoolContext_updatedByUserId_User_id_fk" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Student500SchoolContext" ADD CONSTRAINT "Student500SchoolContext_application_fk" FOREIGN KEY ("projectId","applicationId") REFERENCES "public"."Student500Application"("projectId","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "Student500FactReference" ADD CONSTRAINT "Student500FactReference_fact_key_check" CHECK ("factKey" ~ '^[a-z][a-z0-9_.-]{0,127}$');
--> statement-breakpoint
ALTER TABLE "Student500FactReference" ADD CONSTRAINT "Student500FactReference_fact_version_check" CHECK ("factVersion" > 0);
--> statement-breakpoint
ALTER TABLE "Student500FactReference" ADD CONSTRAINT "Student500FactReference_revoked_check" CHECK ("revokedAt" is null or "revokedAt" >= "createdAt");
--> statement-breakpoint
ALTER TABLE "Student500FactReference" ADD CONSTRAINT "Student500FactReference_origin_kind_check" CHECK ("originKind" in ('customer_stated', 'document_extracted', 'ai_inferred', 'professional_determination'));
--> statement-breakpoint
ALTER TABLE "Student500FactReference" ADD CONSTRAINT "Student500FactReference_state_at_use_check" CHECK ("stateAtUse" in ('proposed', 'customer_confirmed', 'rejected', 'disputed', 'stale', 'superseded'));
--> statement-breakpoint
ALTER TABLE "Student500FactReference" ADD CONSTRAINT "Student500FactReference_authorization_audience_check" CHECK ("authorizationAudience" in ('none', 'actor_only', 'project'));
--> statement-breakpoint
ALTER TABLE "Student500FactReference" ADD CONSTRAINT "Student500FactReference_ai_authorization_check" CHECK (("aiUseAuthorizedAtSelection" is false and "authorizationAudience" = 'none') or ("aiUseAuthorizedAtSelection" is true and "authorizationAudience" <> 'none'));
--> statement-breakpoint
ALTER TABLE "Student500GsDraft" ADD CONSTRAINT "Student500GsDraft_version_check" CHECK ("version" > 0);
--> statement-breakpoint
ALTER TABLE "Student500GsDraft" ADD CONSTRAINT "Student500GsDraft_section_count_check" CHECK ("sectionCount" > 0 and "sectionCount" <= 8);
--> statement-breakpoint
ALTER TABLE "Student500GsDraft" ADD CONSTRAINT "Student500GsDraft_origin_check" CHECK ("origin" in ('deterministic_starter', 'customer_edit'));
--> statement-breakpoint
ALTER TABLE "Student500GsDraft" ADD CONSTRAINT "Student500GsDraft_content_sha_check" CHECK ("contentSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "Student500GsDraft" ADD CONSTRAINT "Student500GsDraft_input_digest_check" CHECK ("inputDigest" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "Student500PreparationSnapshot" ADD CONSTRAINT "Student500PreparationSnapshot_version_check" CHECK ("version" > 0);
--> statement-breakpoint
ALTER TABLE "Student500PreparationSnapshot" ADD CONSTRAINT "Student500PreparationSnapshot_application_revision_check" CHECK ("applicationRevision" > 0);
--> statement-breakpoint
ALTER TABLE "Student500PreparationSnapshot" ADD CONSTRAINT "Student500PreparationSnapshot_content_sha_check" CHECK ("contentSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "Student500PreparationSnapshot" ADD CONSTRAINT "Student500PreparationSnapshot_input_digest_check" CHECK ("inputDigest" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "Student500SchoolContext" ADD CONSTRAINT "Student500SchoolContext_revision_check" CHECK ("revision" > 0);
--> statement-breakpoint
ALTER TABLE "Student500SchoolContext" ADD CONSTRAINT "Student500SchoolContext_updated_at_check" CHECK ("updatedAt" >= "createdAt");
--> statement-breakpoint
ALTER TABLE "Student500SchoolContext" ADD CONSTRAINT "Student500SchoolContext_kind_check" CHECK ("kind" in ('none', 'school_application', 'admission_case', 'customer_reported_coe'));
--> statement-breakpoint
ALTER TABLE "Student500SchoolContext" ADD CONSTRAINT "Student500SchoolContext_study_evidence_kind_check" CHECK ("studyEvidenceKind" in ('none', 'offer_only', 'coe_reported', 'coe_independently_verified'));
--> statement-breakpoint
ALTER TABLE "Student500SchoolContext" ADD CONSTRAINT "Student500SchoolContext_binding_check" CHECK (("kind" = 'none' and "schoolApplicationId" is null and "admissionCaseId" is null) or ("kind" = 'school_application' and "schoolApplicationId" is not null and "admissionCaseId" is null) or ("kind" = 'admission_case' and "admissionCaseId" is not null and "schoolApplicationId" is null) or ("kind" = 'customer_reported_coe' and "schoolApplicationId" is null and "admissionCaseId" is null));
--> statement-breakpoint
ALTER TABLE "Student500SchoolContext" ADD CONSTRAINT "Student500SchoolContext_outcome_coherence_check" CHECK (
  -- A present outcome bundle must be complete and self-consistent. `is true` is
  -- essential: comparing against a NULL column yields UNKNOWN, and a CHECK
  -- constraint is satisfied by UNKNOWN, so without it a partially populated
  -- bundle could be stored. Every legitimate case stays representable:
  --   * no outcome at all;
  --   * a directly customer-reported CoE (never verified);
  --   * an admission case with no current Offer/CoE outcome;
  --   * an authorized, fully populated Offer/CoE outcome.
  (("admissionOutcomeKind" is null
      and "admissionOutcomeVersion" is null
      and "admissionOutcomeProvenance" is null
      and "admissionOutcomeVerified" is null)
    or ("admissionOutcomeKind" in ('offer', 'coe')
      and "admissionOutcomeVersion" is not null
      and "admissionOutcomeVersion" > 0
      and "admissionOutcomeProvenance" is not null
      and "admissionOutcomeVerified" is not null
      and "admissionOutcomeVerified" = ("admissionOutcomeProvenance" in ('source_reviewed', 'provider_confirmed')))) is true
  and (("kind" in ('none', 'school_application') and "admissionOutcomeKind" is null)
    or ("kind" = 'customer_reported_coe'
      and "admissionCaseId" is null
      and "admissionOutcomeKind" = 'coe'
      and "admissionOutcomeVersion" is not null
      and "admissionOutcomeVersion" > 0
      and "admissionOutcomeProvenance" = 'customer_reported'
      and "admissionOutcomeVerified" is false)
    or ("kind" = 'admission_case' and "admissionCaseId" is not null)) is true
);
--> statement-breakpoint
ALTER TABLE "Student500ApplicationOperation" DROP CONSTRAINT IF EXISTS "Student500ApplicationOperation_operation_type_check";
--> statement-breakpoint
ALTER TABLE "Student500ApplicationOperation" ADD CONSTRAINT "Student500ApplicationOperation_operation_type_check" CHECK ("operationType" in ('student_500_create', 'student_500_update', 'student_500_archive', 'student_500_select_fact', 'student_500_unselect_fact', 'student_500_set_school_context', 'student_500_create_gs_draft', 'student_500_save_gs_draft', 'student_500_create_preparation_snapshot'));
--> statement-breakpoint
ALTER TABLE "Student500ApplicationOperation" DROP CONSTRAINT IF EXISTS "Student500ApplicationOperation_result_kind_check";
--> statement-breakpoint
ALTER TABLE "Student500ApplicationOperation" ADD CONSTRAINT "Student500ApplicationOperation_result_kind_check" CHECK ("resultKind" in ('student_500_application', 'student_500_fact_reference', 'student_500_school_context', 'student_500_gs_draft', 'student_500_preparation_snapshot'));
--> statement-breakpoint
CREATE FUNCTION "phase13_m6_2_insert_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  application_status varchar;
  project_status varchar;
BEGIN
  SELECT "status" INTO application_status FROM "Student500Application" WHERE "projectId" = NEW."projectId" AND "id" = NEW."applicationId";
  IF application_status IS NULL THEN
    RAISE EXCEPTION 'Student 500 preparation requires an existing application' USING ERRCODE = '23514', CONSTRAINT = 'Student500Preparation_application_required';
  END IF;
  IF application_status = 'archived' THEN
    RAISE EXCEPTION 'Student 500 application is archived and read-only' USING ERRCODE = '23514', CONSTRAINT = 'Student500Preparation_application_archived';
  END IF;
  SELECT "status" INTO project_status FROM "StudyJourneyProject" WHERE "id" = NEW."projectId";
  IF project_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Project is not active' USING ERRCODE = '23514', CONSTRAINT = 'Student500Preparation_project_closed';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION "phase13_m6_2_immutable_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'Student 500 preparation versions are immutable' USING ERRCODE = '23514', CONSTRAINT = 'Student500Preparation_version_immutable';
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION "phase13_m6_2_fact_reference_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Student 500 fact references are append-only' USING ERRCODE = '23514', CONSTRAINT = 'Student500FactReference_append_only';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."applicationId" IS DISTINCT FROM OLD."applicationId"
    OR NEW."factAssertionId" IS DISTINCT FROM OLD."factAssertionId"
    OR NEW."factVersion" IS DISTINCT FROM OLD."factVersion"
    OR NEW."factKey" IS DISTINCT FROM OLD."factKey"
    OR NEW."originKind" IS DISTINCT FROM OLD."originKind"
    OR NEW."stateAtUse" IS DISTINCT FROM OLD."stateAtUse"
    OR NEW."aiUseAuthorizedAtSelection" IS DISTINCT FROM OLD."aiUseAuthorizedAtSelection"
    OR NEW."authorizationAudience" IS DISTINCT FROM OLD."authorizationAudience"
    OR NEW."authorizationActorUserId" IS DISTINCT FROM OLD."authorizationActorUserId"
    OR NEW."sourceEvidenceRef" IS DISTINCT FROM OLD."sourceEvidenceRef"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Student 500 fact reference identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'Student500FactReference_identity_immutable';
  END IF;
  IF OLD."revokedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Student 500 fact reference revocation is terminal' USING ERRCODE = '23514', CONSTRAINT = 'Student500FactReference_revocation_terminal';
  END IF;
  IF NEW."revokedAt" IS NULL THEN
    RAISE EXCEPTION 'Only revocation may update a Student 500 fact reference' USING ERRCODE = '23514', CONSTRAINT = 'Student500FactReference_revocation_only';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION "phase13_m6_2_school_context_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."applicationId" IS DISTINCT FROM OLD."applicationId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Student 500 school context identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'Student500SchoolContext_identity_immutable';
  END IF;
  IF NEW."revision" <> OLD."revision" + 1 THEN
    RAISE EXCEPTION 'Student 500 school context revision must advance by exactly one' USING ERRCODE = '23514', CONSTRAINT = 'Student500SchoolContext_revision_advance';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "Student500FactReference_insert_guard" BEFORE INSERT ON "Student500FactReference" FOR EACH ROW EXECUTE FUNCTION "phase13_m6_2_insert_guard"();
--> statement-breakpoint
CREATE TRIGGER "Student500FactReference_guard" BEFORE UPDATE OR DELETE ON "Student500FactReference" FOR EACH ROW EXECUTE FUNCTION "phase13_m6_2_fact_reference_guard"();
--> statement-breakpoint
CREATE TRIGGER "Student500GsDraft_insert_guard" BEFORE INSERT ON "Student500GsDraft" FOR EACH ROW EXECUTE FUNCTION "phase13_m6_2_insert_guard"();
--> statement-breakpoint
CREATE TRIGGER "Student500GsDraft_immutable" BEFORE UPDATE OR DELETE ON "Student500GsDraft" FOR EACH ROW EXECUTE FUNCTION "phase13_m6_2_immutable_guard"();
--> statement-breakpoint
CREATE TRIGGER "Student500PreparationSnapshot_insert_guard" BEFORE INSERT ON "Student500PreparationSnapshot" FOR EACH ROW EXECUTE FUNCTION "phase13_m6_2_insert_guard"();
--> statement-breakpoint
CREATE TRIGGER "Student500PreparationSnapshot_immutable" BEFORE UPDATE OR DELETE ON "Student500PreparationSnapshot" FOR EACH ROW EXECUTE FUNCTION "phase13_m6_2_immutable_guard"();
--> statement-breakpoint
CREATE TRIGGER "Student500SchoolContext_insert_guard" BEFORE INSERT ON "Student500SchoolContext" FOR EACH ROW EXECUTE FUNCTION "phase13_m6_2_insert_guard"();
--> statement-breakpoint
CREATE TRIGGER "Student500SchoolContext_guard" BEFORE UPDATE ON "Student500SchoolContext" FOR EACH ROW EXECUTE FUNCTION "phase13_m6_2_school_context_guard"();
