-- Phase 13 M7 - Student 500 deep preparation: GS revision proposals and
-- professional editorial review rounds.
--
-- Additive only. No M6 table is altered and no historical row is rewritten.
-- Both row families are insert-once with deterministic identity (idempotent replay
-- resolves to the persisted row) and may only advance through a server-enforced
-- status transition. Content columns are immutable.

CREATE TABLE IF NOT EXISTS "Student500GsRevisionProposal" (
"id" uuid PRIMARY KEY NOT NULL,
"projectId" uuid NOT NULL,
"applicationId" uuid NOT NULL,
"baseDraftId" uuid NOT NULL,
"baseDraftVersion" integer NOT NULL,
"baseDraftContentSha256" varchar(64) NOT NULL,
"sections" jsonb NOT NULL,
"sectionCount" integer NOT NULL,
"contentSha256" varchar(64) NOT NULL,
"inputDigest" varchar(64) NOT NULL,
"status" varchar(32) NOT NULL,
"composerKind" varchar(32) NOT NULL,
"composerCode" varchar(64) NOT NULL,
"attribution" jsonb NOT NULL,
"createdByUserId" uuid NOT NULL,
"createdAt" timestamp DEFAULT now() NOT NULL,
"decidedByUserId" uuid,
"decidedAt" timestamp,
"acceptedDraftId" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Student500EditorialReview" (
"id" uuid PRIMARY KEY NOT NULL,
"projectId" uuid NOT NULL,
"applicationId" uuid NOT NULL,
"reviewRound" integer NOT NULL,
"draftId" uuid NOT NULL,
"draftVersion" integer NOT NULL,
"draftContentSha256" varchar(64) NOT NULL,
"consentCode" varchar(128) NOT NULL,
"consentSha256" varchar(64) NOT NULL,
"disclosureScopes" jsonb NOT NULL,
"disclosedFactReferenceIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
"status" varchar(32) NOT NULL,
"reviewerUserId" uuid,
"reviewerAuthorityCode" varchar(128),
"reviewerAssignmentStatus" varchar(32) NOT NULL,
"reviewerCredentialStatus" varchar(32) NOT NULL,
"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
"proposedEdits" jsonb DEFAULT '[]'::jsonb NOT NULL,
"inputDigest" varchar(64) NOT NULL,
"requestedByUserId" uuid NOT NULL,
"createdAt" timestamp DEFAULT now() NOT NULL,
"updatedAt" timestamp DEFAULT now() NOT NULL,
"customerDecisionCode" varchar(64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500GsRevisionProposal_project_id_unique" ON "Student500GsRevisionProposal" USING btree ("projectId","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500GsRevisionProposal_application_content_unique" ON "Student500GsRevisionProposal" USING btree ("applicationId","contentSha256");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Student500GsRevisionProposal_application_created_idx" ON "Student500GsRevisionProposal" USING btree ("applicationId","createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500EditorialReview_project_id_unique" ON "Student500EditorialReview" USING btree ("projectId","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Student500EditorialReview_application_round_unique" ON "Student500EditorialReview" USING btree ("applicationId","reviewRound");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Student500EditorialReview_application_created_idx" ON "Student500EditorialReview" USING btree ("applicationId","createdAt");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "phase13_m7_proposal_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Student 500 GS proposals are not deletable' USING ERRCODE = '23514', CONSTRAINT = 'Student500GsRevisionProposal_no_delete';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."applicationId" IS DISTINCT FROM OLD."applicationId"
    OR NEW."baseDraftId" IS DISTINCT FROM OLD."baseDraftId"
    OR NEW."baseDraftVersion" IS DISTINCT FROM OLD."baseDraftVersion"
    OR NEW."baseDraftContentSha256" IS DISTINCT FROM OLD."baseDraftContentSha256"
    OR NEW."sections" IS DISTINCT FROM OLD."sections"
    OR NEW."contentSha256" IS DISTINCT FROM OLD."contentSha256"
    OR NEW."inputDigest" IS DISTINCT FROM OLD."inputDigest"
    OR NEW."composerKind" IS DISTINCT FROM OLD."composerKind"
    OR NEW."composerCode" IS DISTINCT FROM OLD."composerCode"
    OR NEW."attribution" IS DISTINCT FROM OLD."attribution"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Student 500 GS proposal content is immutable' USING ERRCODE = '23514', CONSTRAINT = 'Student500GsRevisionProposal_immutable';
  END IF;
  IF OLD."status" IN ('accepted','rejected','superseded') THEN
    RAISE EXCEPTION 'Student 500 GS proposal decision is terminal' USING ERRCODE = '23514', CONSTRAINT = 'Student500GsRevisionProposal_terminal';
  END IF;
  -- Claim-first protocol: a proposal must be claimed for acceptance before a draft is
  -- written, so a concurrent reject can never contradict a saved draft. The allowed
  -- forward sets below mirror the TypeScript state machine exactly.
  IF OLD."status" = 'proposed' AND NEW."status" NOT IN ('accepting','rejected','superseded') THEN
    RAISE EXCEPTION 'Student 500 GS proposal transition from proposed is not allowed' USING ERRCODE = '23514', CONSTRAINT = 'Student500GsRevisionProposal_transition';
  END IF;
  IF OLD."status" = 'accepting' AND NEW."status" NOT IN ('accepted','superseded') THEN
    RAISE EXCEPTION 'Student 500 GS proposal transition from accepting is not allowed' USING ERRCODE = '23514', CONSTRAINT = 'Student500GsRevisionProposal_transition';
  END IF;
  IF NEW."status" = 'accepted' AND NEW."acceptedDraftId" IS NULL THEN
    RAISE EXCEPTION 'An accepted proposal must name its accepted draft' USING ERRCODE = '23514', CONSTRAINT = 'Student500GsRevisionProposal_accepted_draft';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "phase13_m7_editorial_guard"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Student 500 editorial reviews are not deletable' USING ERRCODE = '23514', CONSTRAINT = 'Student500EditorialReview_no_delete';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."applicationId" IS DISTINCT FROM OLD."applicationId"
    OR NEW."reviewRound" IS DISTINCT FROM OLD."reviewRound"
    OR NEW."draftId" IS DISTINCT FROM OLD."draftId"
    OR NEW."draftVersion" IS DISTINCT FROM OLD."draftVersion"
    OR NEW."draftContentSha256" IS DISTINCT FROM OLD."draftContentSha256"
    OR NEW."consentCode" IS DISTINCT FROM OLD."consentCode"
    OR NEW."consentSha256" IS DISTINCT FROM OLD."consentSha256"
    OR NEW."disclosureScopes" IS DISTINCT FROM OLD."disclosureScopes"
    OR NEW."disclosedFactReferenceIds" IS DISTINCT FROM OLD."disclosedFactReferenceIds"
    OR NEW."inputDigest" IS DISTINCT FROM OLD."inputDigest"
    OR NEW."requestedByUserId" IS DISTINCT FROM OLD."requestedByUserId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Student 500 editorial review identity, consent and target are immutable' USING ERRCODE = '23514', CONSTRAINT = 'Student500EditorialReview_immutable';
  END IF;
  IF OLD."status" IN ('accepted_by_customer','rejected_by_customer','superseded','authority_unavailable') THEN
    RAISE EXCEPTION 'Student 500 editorial review status is terminal' USING ERRCODE = '23514', CONSTRAINT = 'Student500EditorialReview_terminal';
  END IF;
  -- The allowed forward set is per source state and mirrors the TypeScript state
  -- machine exactly: `requested` may only receive feedback or close, and feedback
  -- may only be accepted, rejected or superseded.
  IF OLD."status" = 'requested' AND NEW."status" NOT IN ('feedback_provided','authority_unavailable','superseded') THEN
    RAISE EXCEPTION 'Student 500 editorial review transition from requested is not allowed' USING ERRCODE = '23514', CONSTRAINT = 'Student500EditorialReview_transition';
  END IF;
  IF OLD."status" = 'feedback_provided' AND NEW."status" NOT IN ('accepted_by_customer','rejected_by_customer','superseded') THEN
    RAISE EXCEPTION 'Student 500 editorial review transition from feedback_provided is not allowed' USING ERRCODE = '23514', CONSTRAINT = 'Student500EditorialReview_transition';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "Student500GsRevisionProposal_guard" ON "Student500GsRevisionProposal";
--> statement-breakpoint
CREATE TRIGGER "Student500GsRevisionProposal_guard" BEFORE UPDATE OR DELETE ON "Student500GsRevisionProposal" FOR EACH ROW EXECUTE FUNCTION "phase13_m7_proposal_guard"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "Student500EditorialReview_guard" ON "Student500EditorialReview";
--> statement-breakpoint
CREATE TRIGGER "Student500EditorialReview_guard" BEFORE UPDATE OR DELETE ON "Student500EditorialReview" FOR EACH ROW EXECUTE FUNCTION "phase13_m7_editorial_guard"();
