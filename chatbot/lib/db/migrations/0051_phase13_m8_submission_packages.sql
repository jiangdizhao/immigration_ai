-- Phase 13 M8.1 - exact-version submission packages, customer confirmations and
-- invalidation evidence.
--
-- Additive only. No M4-M7 table is altered and no historical row is rewritten.
-- All three families are insert-only history: a frozen package, a confirmation and
-- an invalidation record are never updated or deleted.
--
-- Exact identity is a database guarantee, not a convention: a confirmation carries
-- the full parent identity (project, target kind, target, package version, manifest
-- digest) and a composite foreign key makes a contradictory row impossible.

CREATE TABLE IF NOT EXISTS "SubmissionPackage" (
"id" uuid PRIMARY KEY NOT NULL,
"projectId" uuid NOT NULL,
"targetKind" varchar(48) NOT NULL,
"targetId" uuid NOT NULL,
"version" integer NOT NULL,
"status" varchar(16) NOT NULL,
"schemaVersion" varchar(64) NOT NULL,
"manifest" jsonb NOT NULL,
"manifestSha256" varchar(64) NOT NULL,
"dependencySha256" varchar(64) NOT NULL,
"statementPolicyVersion" varchar(64) NOT NULL,
"createdByUserId" uuid NOT NULL,
"operationId" varchar(128) NOT NULL,
"requestSha256" varchar(64) NOT NULL,
"createdAt" timestamp DEFAULT now() NOT NULL,
CONSTRAINT "SubmissionPackage_target_kind_check" CHECK ("targetKind" IN ('managed_school_application','student_500_visa_application')),
CONSTRAINT "SubmissionPackage_status_check" CHECK ("status" = 'frozen'),
CONSTRAINT "SubmissionPackage_version_check" CHECK ("version" > 0),
CONSTRAINT "SubmissionPackage_manifest_sha256_check" CHECK ("manifestSha256" ~ '^[0-9a-f]{64}$'),
CONSTRAINT "SubmissionPackage_dependency_sha256_check" CHECK ("dependencySha256" ~ '^[0-9a-f]{64}$'),
CONSTRAINT "SubmissionPackage_request_sha256_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SubmissionPackageConfirmation" (
"id" uuid PRIMARY KEY NOT NULL,
"projectId" uuid NOT NULL,
"targetKind" varchar(48) NOT NULL,
"targetId" uuid NOT NULL,
"packageVersionId" uuid NOT NULL,
"packageVersion" integer NOT NULL,
"manifestSha256" varchar(64) NOT NULL,
"targetVersion" integer NOT NULL,
"confirmationType" varchar(48) NOT NULL,
"statementPolicyVersion" varchar(64) NOT NULL,
"actorUserId" uuid NOT NULL,
"operationId" varchar(128) NOT NULL,
"requestSha256" varchar(64) NOT NULL,
"confirmedAt" timestamp DEFAULT now() NOT NULL,
CONSTRAINT "SubmissionPackageConfirmation_type_check" CHECK ("confirmationType" IN ('package_content_review','customer_declarations')),
CONSTRAINT "SubmissionPackageConfirmation_manifest_sha256_check" CHECK ("manifestSha256" ~ '^[0-9a-f]{64}$'),
CONSTRAINT "SubmissionPackageConfirmation_request_sha256_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$'),
CONSTRAINT "SubmissionPackageConfirmation_target_version_check" CHECK ("targetVersion" > 0)
-- The parent identity is repeated in full; its composite foreign key is added below,
-- after the referenced unique index exists.
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SubmissionPackageInvalidation" (
"id" uuid PRIMARY KEY NOT NULL,
"projectId" uuid NOT NULL,
"confirmationId" uuid NOT NULL,
"packageVersionId" uuid NOT NULL,
"dependencySha256" varchar(64) NOT NULL,
"reasonCodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
"detectedAt" timestamp DEFAULT now() NOT NULL,
"detectedByUserId" uuid NOT NULL,
CONSTRAINT "SubmissionPackageInvalidation_dependency_sha256_check" CHECK ("dependencySha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SubmissionPackageConfirmationFinalization" (
"id" uuid PRIMARY KEY NOT NULL,
"projectId" uuid NOT NULL,
"confirmationId" uuid NOT NULL,
"packageVersionId" uuid NOT NULL,
"validatedDependencySha256" varchar(64) NOT NULL,
"validatedAt" timestamp DEFAULT now() NOT NULL,
"validatedByUserId" uuid NOT NULL,
CONSTRAINT "SubmissionPackageConfirmationFinalization_dependency_sha256_check" CHECK ("validatedDependencySha256" ~ '^[0-9a-f]{64}$')
-- The confirmation identity foreign key is added below, after its unique index exists.
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionPackage_project_target_version_unique" ON "SubmissionPackage" USING btree ("projectId","targetKind","targetId","version");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionPackage_project_target_id_unique" ON "SubmissionPackage" USING btree ("projectId","targetKind","targetId","id");
--> statement-breakpoint
-- Exact parent identity for the composite confirmation foreign key.
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionPackage_identity_version_digest_unique" ON "SubmissionPackage" USING btree ("projectId","targetKind","targetId","id","version","manifestSha256");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionPackage_project_operation_unique" ON "SubmissionPackage" USING btree ("projectId","operationId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionPackage_project_id_unique" ON "SubmissionPackage" USING btree ("projectId","id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SubmissionPackage_project_target_created_idx" ON "SubmissionPackage" USING btree ("projectId","targetKind","targetId","createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionPackageConfirmation_package_type_unique" ON "SubmissionPackageConfirmation" USING btree ("packageVersionId","confirmationType");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionPackageConfirmation_project_operation_unique" ON "SubmissionPackageConfirmation" USING btree ("projectId","operationId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionPackageConfirmation_project_id_unique" ON "SubmissionPackageConfirmation" USING btree ("projectId","id");
--> statement-breakpoint
-- Parent identity for the invalidation foreign key.
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionPackageConfirmation_identity_package_unique" ON "SubmissionPackageConfirmation" USING btree ("projectId","id","packageVersionId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionPackageConfirmationFinalization_confirmation_unique" ON "SubmissionPackageConfirmationFinalization" USING btree ("confirmationId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionPackageConfirmationFinalization_identity_unique" ON "SubmissionPackageConfirmationFinalization" USING btree ("projectId","confirmationId","packageVersionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SubmissionPackageConfirmationFinalization_project_idx" ON "SubmissionPackageConfirmationFinalization" USING btree ("projectId","validatedAt");
--> statement-breakpoint
-- Composite identity keys are added only now: each one references a column set whose
-- unique index was created immediately above. Declaring them inside CREATE TABLE would
-- reference a not-yet-existing unique constraint and fail on a fresh database.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SubmissionPackageConfirmation_parent_identity_fk'
  ) THEN
    ALTER TABLE "SubmissionPackageConfirmation"
      ADD CONSTRAINT "SubmissionPackageConfirmation_parent_identity_fk"
      FOREIGN KEY ("projectId","targetKind","targetId","packageVersionId","packageVersion","manifestSha256")
      REFERENCES "SubmissionPackage"("projectId","targetKind","targetId","id","version","manifestSha256")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SubmissionPackageInvalidation_confirmation_identity_fk'
  ) THEN
    ALTER TABLE "SubmissionPackageInvalidation"
      ADD CONSTRAINT "SubmissionPackageInvalidation_confirmation_identity_fk"
      FOREIGN KEY ("projectId","confirmationId","packageVersionId")
      REFERENCES "SubmissionPackageConfirmation"("projectId","id","packageVersionId")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SubmissionPackageConfirmationFinalization_identity_fk'
  ) THEN
    ALTER TABLE "SubmissionPackageConfirmationFinalization"
      ADD CONSTRAINT "SubmissionPackageConfirmationFinalization_identity_fk"
      FOREIGN KEY ("projectId","confirmationId","packageVersionId")
      REFERENCES "SubmissionPackageConfirmation"("projectId","id","packageVersionId")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SubmissionPackageConfirmation_target_idx" ON "SubmissionPackageConfirmation" USING btree ("projectId","targetKind","targetId","confirmedAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionPackageInvalidation_confirmation_dependency_unique" ON "SubmissionPackageInvalidation" USING btree ("confirmationId","dependencySha256");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SubmissionPackageInvalidation_project_idx" ON "SubmissionPackageInvalidation" USING btree ("projectId","detectedAt");
--> statement-breakpoint
-- Insert-only history: no rewrite is possible, so a frozen package, a confirmation
-- and an invalidation record can never be altered or removed after the fact.
CREATE OR REPLACE FUNCTION "phase13_m8_submission_package_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Submission packages are not deletable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionPackage_no_delete';
  END IF;
  RAISE EXCEPTION 'Submission packages are immutable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionPackage_immutable';
END;
$fn$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "phase13_m8_confirmation_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Submission package confirmations are not deletable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionPackageConfirmation_no_delete';
  END IF;
  RAISE EXCEPTION 'Submission package confirmations are immutable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionPackageConfirmation_immutable';
END;
$fn$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "phase13_m8_invalidation_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Submission package invalidation evidence is not deletable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionPackageInvalidation_no_delete';
  END IF;
  RAISE EXCEPTION 'Submission package invalidation evidence is immutable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionPackageInvalidation_immutable';
END;
$fn$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "SubmissionPackage_guard" ON "SubmissionPackage";
--> statement-breakpoint
CREATE TRIGGER "SubmissionPackage_guard" BEFORE UPDATE OR DELETE ON "SubmissionPackage" FOR EACH ROW EXECUTE FUNCTION "phase13_m8_submission_package_guard"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "SubmissionPackageConfirmation_guard" ON "SubmissionPackageConfirmation";
--> statement-breakpoint
CREATE TRIGGER "SubmissionPackageConfirmation_guard" BEFORE UPDATE OR DELETE ON "SubmissionPackageConfirmation" FOR EACH ROW EXECUTE FUNCTION "phase13_m8_confirmation_guard"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "SubmissionPackageInvalidation_guard" ON "SubmissionPackageInvalidation";
--> statement-breakpoint
CREATE TRIGGER "SubmissionPackageInvalidation_guard" BEFORE UPDATE OR DELETE ON "SubmissionPackageInvalidation" FOR EACH ROW EXECUTE FUNCTION "phase13_m8_invalidation_guard"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "phase13_m8_confirmation_finalization_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Submission package confirmation finalizations are not deletable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionPackageConfirmationFinalization_no_delete';
  END IF;
  RAISE EXCEPTION 'Submission package confirmation finalizations are immutable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionPackageConfirmationFinalization_immutable';
END;
$fn$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "SubmissionPackageConfirmationFinalization_guard" ON "SubmissionPackageConfirmationFinalization";
--> statement-breakpoint
CREATE TRIGGER "SubmissionPackageConfirmationFinalization_guard" BEFORE UPDATE OR DELETE ON "SubmissionPackageConfirmationFinalization" FOR EACH ROW EXECUTE FUNCTION "phase13_m8_confirmation_finalization_guard"();
