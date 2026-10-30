CREATE TABLE IF NOT EXISTS "ProfessionalReviewRequest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"targetKind" varchar(64) NOT NULL,
	"targetId" varchar(128) NOT NULL,
	"targetVersion" integer NOT NULL,
	"targetSha256" varchar(64) NOT NULL,
	"targetBindingSha256" varchar(64) NOT NULL,
	"reviewPurpose" varchar(64) NOT NULL,
	"reviewScope" text[] NOT NULL,
	"state" varchar(32) DEFAULT 'requested' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"requestedByUserId" uuid NOT NULL,
	"reviewerUserId" uuid,
	"authorityCode" varchar(64),
	"credentialCode" varchar(64),
	"operationId" varchar(128) NOT NULL,
	"requestSha256" varchar(64) NOT NULL,
	"requestedAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"invalidatedAt" timestamp,
	"invalidationReasonCode" varchar(64)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProfessionalReviewRevision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reviewRequestId" uuid NOT NULL,
	"revision" integer NOT NULL,
	"state" varchar(32) NOT NULL,
	"action" varchar(32) NOT NULL,
	"operationId" varchar(128) NOT NULL,
	"requestSha256" varchar(64) NOT NULL,
	"decidedByUserId" uuid,
	"decidedAt" timestamp DEFAULT now() NOT NULL,
	"boundTargetVersion" integer NOT NULL,
	"boundTargetSha256" varchar(64) NOT NULL,
	"authorityCode" varchar(64),
	"credentialCode" varchar(64),
	"commentSha256" varchar(64),
	"reasonCode" varchar(64)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProfessionalReviewRequest" ADD CONSTRAINT "ProfessionalReviewRequest_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProfessionalReviewRequest" ADD CONSTRAINT "ProfessionalReviewRequest_requestedByUserId_User_id_fk" FOREIGN KEY ("requestedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProfessionalReviewRequest" ADD CONSTRAINT "ProfessionalReviewRequest_reviewerUserId_User_id_fk" FOREIGN KEY ("reviewerUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProfessionalReviewRevision" ADD CONSTRAINT "ProfessionalReviewRevision_reviewRequestId_ProfessionalReviewRequest_id_fk" FOREIGN KEY ("reviewRequestId") REFERENCES "public"."ProfessionalReviewRequest"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProfessionalReviewRevision" ADD CONSTRAINT "ProfessionalReviewRevision_decidedByUserId_User_id_fk" FOREIGN KEY ("decidedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProfessionalReviewRequest_id_project_unique" ON "ProfessionalReviewRequest" USING btree ("id","projectId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProfessionalReviewRequest_project_operation_unique" ON "ProfessionalReviewRequest" USING btree ("projectId","operationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProfessionalReviewRequest_target_idx" ON "ProfessionalReviewRequest" USING btree ("projectId","targetKind","targetId","revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProfessionalReviewRequest_requester_idx" ON "ProfessionalReviewRequest" USING btree ("requestedByUserId","state","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProfessionalReviewRevision_request_revision_unique" ON "ProfessionalReviewRevision" USING btree ("reviewRequestId","revision");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProfessionalReviewRevision_request_operation_unique" ON "ProfessionalReviewRevision" USING btree ("reviewRequestId","operationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProfessionalReviewRevision_request_idx" ON "ProfessionalReviewRevision" USING btree ("reviewRequestId","revision");--> statement-breakpoint
ALTER TABLE "ProfessionalReviewRequest" ADD CONSTRAINT "ProfessionalReviewRequest_revision_check" CHECK ("revision" > 0 and "targetVersion" > 0);
--> statement-breakpoint
ALTER TABLE "ProfessionalReviewRequest" ADD CONSTRAINT "ProfessionalReviewRequest_hash_check" CHECK ("targetSha256" ~ '^[0-9a-f]{64}$' and "targetBindingSha256" ~ '^[0-9a-f]{64}$' and "requestSha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "ProfessionalReviewRequest" ADD CONSTRAINT "ProfessionalReviewRequest_scope_check" CHECK ("reviewScope" is not null and cardinality("reviewScope") between 1 and 4 and "reviewScope" <@ array['eligibility_review', 'document_completeness', 'form_accuracy', 'legal_advice_alignment']::text[]);
--> statement-breakpoint
ALTER TABLE "ProfessionalReviewRequest" ADD CONSTRAINT "ProfessionalReviewRequest_state_check" CHECK ("state" in ('requested', 'in_review', 'changes_requested', 'approved', 'rejected', 'invalidated'));
--> statement-breakpoint
ALTER TABLE "ProfessionalReviewRequest" ADD CONSTRAINT "ProfessionalReviewRequest_purpose_check" CHECK ("reviewPurpose" = 'managed_handoff_authorization');
--> statement-breakpoint
ALTER TABLE "ProfessionalReviewRequest" ADD CONSTRAINT "ProfessionalReviewRequest_target_kind_check" CHECK ("targetKind" in ('managed_school_application', 'student_500_visa_application'));
--> statement-breakpoint
ALTER TABLE "ProfessionalReviewRequest" ADD CONSTRAINT "ProfessionalReviewRequest_invalidation_check" CHECK (("state" = 'invalidated' and "invalidatedAt" is not null) or ("state" <> 'invalidated' and "invalidatedAt" is null and "invalidationReasonCode" is null));
--> statement-breakpoint
ALTER TABLE "ProfessionalReviewRequest" ADD CONSTRAINT "ProfessionalReviewRequest_timestamps_check" CHECK ("updatedAt" >= "requestedAt");
--> statement-breakpoint
ALTER TABLE "ProfessionalReviewRevision" ADD CONSTRAINT "ProfessionalReviewRevision_revision_check" CHECK ("revision" > 0 and "boundTargetVersion" > 0);
--> statement-breakpoint
ALTER TABLE "ProfessionalReviewRevision" ADD CONSTRAINT "ProfessionalReviewRevision_hash_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$' and "boundTargetSha256" ~ '^[0-9a-f]{64}$' and ("commentSha256" is null or "commentSha256" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
ALTER TABLE "ProfessionalReviewRevision" ADD CONSTRAINT "ProfessionalReviewRevision_state_check" CHECK ("state" in ('requested', 'in_review', 'changes_requested', 'approved', 'rejected', 'invalidated'));
--> statement-breakpoint
ALTER TABLE "ProfessionalReviewRevision" ADD CONSTRAINT "ProfessionalReviewRevision_action_check" CHECK ("action" in ('create_request', 'start_review', 'request_changes', 'approve', 'reject', 'invalidate'));
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_006_request_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Professional review requests cannot be deleted' USING ERRCODE = '23514', CONSTRAINT = 'ProfessionalReviewRequest_no_delete';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."revision" <> 1 OR NEW."state" <> 'requested' THEN
      RAISE EXCEPTION 'A professional review starts at revision 1 in state requested' USING ERRCODE = '23514', CONSTRAINT = 'ProfessionalReviewRequest_insert_shape';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."targetKind" IS DISTINCT FROM OLD."targetKind"
    OR NEW."targetId" IS DISTINCT FROM OLD."targetId"
    OR NEW."targetVersion" IS DISTINCT FROM OLD."targetVersion"
    OR NEW."targetSha256" IS DISTINCT FROM OLD."targetSha256"
    OR NEW."targetBindingSha256" IS DISTINCT FROM OLD."targetBindingSha256"
    OR NEW."reviewPurpose" IS DISTINCT FROM OLD."reviewPurpose"
    OR NEW."reviewScope" IS DISTINCT FROM OLD."reviewScope"
    OR NEW."requestedByUserId" IS DISTINCT FROM OLD."requestedByUserId"
    OR NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt"
  THEN
    RAISE EXCEPTION 'Professional review target binding is immutable' USING ERRCODE = '23514', CONSTRAINT = 'ProfessionalReviewRequest_binding_immutable';
  END IF;
  IF NEW."revision" <> OLD."revision" + 1 THEN
    RAISE EXCEPTION 'Professional review revision must advance by exactly one' USING ERRCODE = '23514', CONSTRAINT = 'ProfessionalReviewRequest_revision_step';
  END IF;
  IF OLD."state" = 'invalidated' THEN
    RAISE EXCEPTION 'Professional review state is terminal' USING ERRCODE = '23514', CONSTRAINT = 'ProfessionalReviewRequest_terminal_state';
  END IF;
  IF NOT (
    (OLD."state" = 'requested' AND NEW."state" = 'in_review')
    OR (OLD."state" = 'in_review' AND NEW."state" IN ('changes_requested', 'approved', 'rejected'))
    OR NEW."state" = 'invalidated'
  ) THEN
    RAISE EXCEPTION 'Professional review transition is not permitted' USING ERRCODE = '23514', CONSTRAINT = 'ProfessionalReviewRequest_transition';
  END IF;
  IF NEW."state" = 'invalidated' AND NEW."invalidatedAt" IS NULL THEN
    RAISE EXCEPTION 'Invalidation requires a timestamp' USING ERRCODE = '23514', CONSTRAINT = 'ProfessionalReviewRequest_invalidation_shape';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "ProfessionalReviewRequest_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ProfessionalReviewRequest" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_006_request_guard"();
--> statement-breakpoint
CREATE FUNCTION "phase13_m4_006_revision_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Professional review revisions are append-only' USING ERRCODE = '23514', CONSTRAINT = 'ProfessionalReviewRevision_append_only';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER "ProfessionalReviewRevision_guard" BEFORE UPDATE OR DELETE ON "ProfessionalReviewRevision" FOR EACH ROW EXECUTE FUNCTION "phase13_m4_006_revision_guard"();
