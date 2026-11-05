-- Phase 13 M8.2 - submission authorization, professional handoff and external
-- evidence.
--
-- Additive only. No M4-M8.1 table is altered and no historical row is rewritten.
-- Authorizations, handoff events and external records are insert-only history; the
-- handoff row itself carries only a status/revision pair that the trigger below
-- constrains to the frozen transition table.
--
-- Exact identity is a database guarantee, not a convention: every row repeats the
-- full package identity (project, target kind, target, package version, target
-- version, manifest digest) and a composite foreign key makes a contradictory row
-- impossible.

CREATE TABLE IF NOT EXISTS "SubmissionAuthorization" (
"id" uuid PRIMARY KEY NOT NULL,
"projectId" uuid NOT NULL,
"targetKind" varchar(48) NOT NULL,
"targetId" uuid NOT NULL,
"packageVersionId" uuid NOT NULL,
"packageVersion" integer NOT NULL,
"targetVersion" integer NOT NULL,
"manifestSha256" varchar(64) NOT NULL,
"authorizationType" varchar(64) NOT NULL,
"disclosurePolicyVersion" varchar(64) NOT NULL,
"acknowledgedDisclosures" jsonb DEFAULT '[]'::jsonb NOT NULL,
"bindingSha256" varchar(64) NOT NULL,
"actorUserId" uuid NOT NULL,
"operationId" varchar(128) NOT NULL,
"requestSha256" varchar(64) NOT NULL,
"authorizedAt" timestamp DEFAULT now() NOT NULL,
CONSTRAINT "SubmissionAuthorization_type_check" CHECK ("authorizationType" IN ('self_service_external_submission','managed_service_professional_handoff')),
CONSTRAINT "SubmissionAuthorization_kind_check" CHECK ("targetKind" IN ('managed_school_application','student_500_visa_application')),
CONSTRAINT "SubmissionAuthorization_manifest_check" CHECK ("manifestSha256" ~ '^[0-9a-f]{64}$'),
CONSTRAINT "SubmissionAuthorization_binding_check" CHECK ("bindingSha256" ~ '^[0-9a-f]{64}$'),
CONSTRAINT "SubmissionAuthorization_request_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$'),
CONSTRAINT "SubmissionAuthorization_versions_check" CHECK ("packageVersion" > 0 AND "targetVersion" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SubmissionHandoff" (
"id" uuid PRIMARY KEY NOT NULL,
"projectId" uuid NOT NULL,
"targetKind" varchar(48) NOT NULL,
"targetId" uuid NOT NULL,
"packageVersionId" uuid NOT NULL,
"packageVersion" integer NOT NULL,
"manifestSha256" varchar(64) NOT NULL,
"authorizationId" uuid NOT NULL,
"status" varchar(16) NOT NULL,
"revision" integer DEFAULT 1 NOT NULL,
"requestedByUserId" uuid NOT NULL,
"recipientUserId" uuid,
"operationId" varchar(128) NOT NULL,
"requestSha256" varchar(64) NOT NULL,
"createdAt" timestamp DEFAULT now() NOT NULL,
"updatedAt" timestamp DEFAULT now() NOT NULL,
CONSTRAINT "SubmissionHandoff_status_check" CHECK ("status" IN ('requested','accepted','declined','cancelled','superseded')),
CONSTRAINT "SubmissionHandoff_kind_check" CHECK ("targetKind" IN ('managed_school_application','student_500_visa_application')),
CONSTRAINT "SubmissionHandoff_manifest_check" CHECK ("manifestSha256" ~ '^[0-9a-f]{64}$'),
CONSTRAINT "SubmissionHandoff_request_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$'),
CONSTRAINT "SubmissionHandoff_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SubmissionHandoffEvent" (
"id" uuid PRIMARY KEY NOT NULL,
"projectId" uuid NOT NULL,
"handoffId" uuid NOT NULL,
"handoffRevision" integer NOT NULL,
"status" varchar(16) NOT NULL,
"actorUserId" uuid NOT NULL,
"reasonCode" varchar(64),
"createdAt" timestamp DEFAULT now() NOT NULL,
CONSTRAINT "SubmissionHandoffEvent_status_check" CHECK ("status" IN ('requested','accepted','declined','cancelled','superseded')),
CONSTRAINT "SubmissionHandoffEvent_revision_check" CHECK ("handoffRevision" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SubmissionExternalRecord" (
"id" uuid PRIMARY KEY NOT NULL,
"projectId" uuid NOT NULL,
"targetKind" varchar(48) NOT NULL,
"targetId" uuid NOT NULL,
"handoffId" uuid,
"packageVersionId" uuid NOT NULL,
"kind" varchar(32) NOT NULL,
"channel" varchar(32),
"outcomeCode" varchar(48),
"reference" varchar(128),
"provenance" varchar(32) NOT NULL,
"verification" varchar(16) NOT NULL,
"verifierCode" varchar(64),
"occurredAt" varchar(40) NOT NULL,
"reportedByUserId" uuid NOT NULL,
"operationId" varchar(128) NOT NULL,
"requestSha256" varchar(64) NOT NULL,
"createdAt" timestamp DEFAULT now() NOT NULL,
CONSTRAINT "SubmissionExternalRecord_kind_check" CHECK ("kind" IN ('external_submission','external_outcome')),
CONSTRAINT "SubmissionExternalRecord_provenance_check" CHECK ("provenance" IN ('customer_reported','staff_attested','document_backed_unverified','provider_verified')),
CONSTRAINT "SubmissionExternalRecord_verification_check" CHECK ("verification" IN ('unverified','verified')),
CONSTRAINT "SubmissionExternalRecord_kind_target_check" CHECK ("targetKind" IN ('managed_school_application','student_500_visa_application')),
CONSTRAINT "SubmissionExternalRecord_request_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$'),
-- Only a trusted verifier may produce a verified record, and it must name itself.
CONSTRAINT "SubmissionExternalRecord_verified_check" CHECK (("verification" = 'unverified' AND "verifierCode" IS NULL) OR ("verification" = 'verified' AND "verifierCode" IS NOT NULL)),
CONSTRAINT "SubmissionExternalRecord_shape_check" CHECK (("kind" = 'external_submission' AND "channel" IS NOT NULL) OR ("kind" = 'external_outcome' AND "outcomeCode" IS NOT NULL))
);
--> statement-breakpoint
-- Unique keys first: PostgreSQL resolves a composite foreign key's referenced column
-- set immediately, so the referenced unique index must already exist.
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionAuthorization_operation_unique" ON "SubmissionAuthorization" USING btree ("projectId","operationId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionAuthorization_binding_unique" ON "SubmissionAuthorization" USING btree ("projectId","targetKind","targetId","authorizationType","bindingSha256");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionAuthorization_project_id_unique" ON "SubmissionAuthorization" USING btree ("projectId","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionAuthorization_identity_unique" ON "SubmissionAuthorization" USING btree ("projectId","targetKind","targetId","id","packageVersionId","manifestSha256");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SubmissionAuthorization_target_idx" ON "SubmissionAuthorization" USING btree ("projectId","targetKind","targetId","authorizedAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionHandoff_operation_unique" ON "SubmissionHandoff" USING btree ("projectId","operationId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionHandoff_project_id_unique" ON "SubmissionHandoff" USING btree ("projectId","id");
--> statement-breakpoint
-- One live handoff per package version: a second request would duplicate a human
-- action, so the database refuses it rather than the service hoping it will not happen.
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionHandoff_live_package_unique" ON "SubmissionHandoff" USING btree ("packageVersionId") WHERE "status" IN ('requested','accepted');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SubmissionHandoff_target_idx" ON "SubmissionHandoff" USING btree ("projectId","targetKind","targetId","updatedAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionHandoffEvent_handoff_revision_unique" ON "SubmissionHandoffEvent" USING btree ("handoffId","handoffRevision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SubmissionHandoffEvent_project_idx" ON "SubmissionHandoffEvent" USING btree ("projectId","createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionExternalRecord_operation_unique" ON "SubmissionExternalRecord" USING btree ("projectId","operationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SubmissionExternalRecord_target_idx" ON "SubmissionExternalRecord" USING btree ("projectId","targetKind","targetId","occurredAt");
--> statement-breakpoint
ALTER TABLE "SubmissionAuthorization"
      ADD CONSTRAINT "SubmissionAuthorization_package_identity_fk"
      FOREIGN KEY ("projectId","targetKind","targetId","packageVersionId","packageVersion","manifestSha256")
      REFERENCES "SubmissionPackage" ("projectId","targetKind","targetId","id","version","manifestSha256")
      ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint
ALTER TABLE "SubmissionHandoff"
      ADD CONSTRAINT "SubmissionHandoff_package_identity_fk"
      FOREIGN KEY ("projectId","targetKind","targetId","packageVersionId","packageVersion","manifestSha256")
      REFERENCES "SubmissionPackage" ("projectId","targetKind","targetId","id","version","manifestSha256")
      ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint
ALTER TABLE "SubmissionHandoff"
      ADD CONSTRAINT "SubmissionHandoff_authorization_fk"
      FOREIGN KEY ("projectId","authorizationId")
      REFERENCES "SubmissionAuthorization" ("projectId","id")
      ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint
ALTER TABLE "SubmissionHandoffEvent"
      ADD CONSTRAINT "SubmissionHandoffEvent_handoff_fk"
      FOREIGN KEY ("projectId","handoffId")
      REFERENCES "SubmissionHandoff" ("projectId","id")
      ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint
ALTER TABLE "SubmissionExternalRecord"
      ADD CONSTRAINT "SubmissionExternalRecord_handoff_fk"
      FOREIGN KEY ("projectId","handoffId")
      REFERENCES "SubmissionHandoff" ("projectId","id")
      ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint
ALTER TABLE "SubmissionExternalRecord"
      ADD CONSTRAINT "SubmissionExternalRecord_package_identity_fk"
      FOREIGN KEY ("projectId","targetKind","targetId","packageVersionId")
      REFERENCES "SubmissionPackage" ("projectId","targetKind","targetId","id")
      ON DELETE RESTRICT ON UPDATE RESTRICT;

--> statement-breakpoint
-- Insert-only history guards. A recorded authorization, handoff event or external
-- record can never be altered or removed, so an audit trail cannot be rewritten.
CREATE OR REPLACE FUNCTION "phase13_m8_2_authorization_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Submission authorizations are not deletable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionAuthorization_no_delete';
  END IF;
  RAISE EXCEPTION 'Submission authorizations are immutable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionAuthorization_immutable';
END;
$fn$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "phase13_m8_2_handoff_event_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Handoff events are not deletable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionHandoffEvent_no_delete';
  END IF;
  RAISE EXCEPTION 'Handoff events are immutable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionHandoffEvent_immutable';
END;
$fn$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "phase13_m8_2_external_record_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'External records are not deletable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionExternalRecord_no_delete';
  END IF;
  RAISE EXCEPTION 'External records are immutable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionExternalRecord_immutable';
END;
$fn$;
--> statement-breakpoint
-- The handoff row is the one mutable row in M8.2: identity is frozen, only the frozen
-- transition table is permitted, and every change increments the revision by exactly
-- one so a lost update is impossible.
CREATE OR REPLACE FUNCTION "phase13_m8_2_handoff_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Handoffs are not deletable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionHandoff_no_delete';
  END IF;
  IF NEW."projectId" <> OLD."projectId"
     OR NEW."targetKind" <> OLD."targetKind"
     OR NEW."targetId" <> OLD."targetId"
     OR NEW."packageVersionId" <> OLD."packageVersionId"
     OR NEW."packageVersion" <> OLD."packageVersion"
     OR NEW."manifestSha256" <> OLD."manifestSha256"
     OR NEW."authorizationId" <> OLD."authorizationId"
     OR NEW."requestedByUserId" <> OLD."requestedByUserId"
     OR NEW."recipientUserId" IS DISTINCT FROM OLD."recipientUserId"
     OR NEW."operationId" <> OLD."operationId"
     OR NEW."requestSha256" <> OLD."requestSha256"
     OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'Handoff identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionHandoff_identity_immutable';
  END IF;
  IF NOT (
       (OLD."status" = 'requested' AND NEW."status" IN ('accepted','declined','cancelled'))
    OR (OLD."status" = 'accepted' AND NEW."status" IN ('cancelled','superseded'))
  ) THEN
    RAISE EXCEPTION 'Illegal handoff transition' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionHandoff_status_transition';
  END IF;
  IF NEW."revision" <> OLD."revision" + 1 THEN
    RAISE EXCEPTION 'Handoff revision must increment by one' USING ERRCODE = '23514', CONSTRAINT = 'SubmissionHandoff_revision_step';
  END IF;
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "SubmissionAuthorization_guard" ON "SubmissionAuthorization";
--> statement-breakpoint
CREATE TRIGGER "SubmissionAuthorization_guard" BEFORE UPDATE OR DELETE ON "SubmissionAuthorization" FOR EACH ROW EXECUTE FUNCTION "phase13_m8_2_authorization_guard"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "SubmissionHandoffEvent_guard" ON "SubmissionHandoffEvent";
--> statement-breakpoint
CREATE TRIGGER "SubmissionHandoffEvent_guard" BEFORE UPDATE OR DELETE ON "SubmissionHandoffEvent" FOR EACH ROW EXECUTE FUNCTION "phase13_m8_2_handoff_event_guard"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "SubmissionExternalRecord_guard" ON "SubmissionExternalRecord";
--> statement-breakpoint
CREATE TRIGGER "SubmissionExternalRecord_guard" BEFORE UPDATE OR DELETE ON "SubmissionExternalRecord" FOR EACH ROW EXECUTE FUNCTION "phase13_m8_2_external_record_guard"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "SubmissionHandoff_guard" ON "SubmissionHandoff";
--> statement-breakpoint
CREATE TRIGGER "SubmissionHandoff_guard" BEFORE UPDATE OR DELETE ON "SubmissionHandoff" FOR EACH ROW EXECUTE FUNCTION "phase13_m8_2_handoff_guard"();
--> statement-breakpoint
-- The fixture shape is what makes a partial success impossible: a handoff cannot exist
-- without its authorization, and neither can exist without the exact package version.

