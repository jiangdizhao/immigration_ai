-- B1 row triggers protect ordinary audit writes only. They do not protect
-- against a table owner, superuser, trigger disablement, TRUNCATE, unrestricted
-- DDL, restore, or direct catalog changes. Live deployment requires a separate
-- non-owner runtime role with no superuser/ownership, TRUNCATE, DDL, trigger,
-- schema-creation, or migration privileges; keep migration and break-glass
-- access separately controlled and independently verify effective grants.
CREATE FUNCTION "phase13_project_operation_audit_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  valid_membership_invite_transition boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Project operation audit rows cannot be deleted'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectOperation_delete_protected';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "ProjectMembership" membership
    JOIN "StudyJourneyProject" project
      ON project."id" = membership."projectId"
    WHERE membership."id" = NEW."resultId"
      AND membership."projectId" = OLD."resultId"
      AND project."ownerUserId" = OLD."actorUserId"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ProjectEvent" event
    WHERE event."operationRecordId" = OLD."id"
  )
  INTO valid_membership_invite_transition;

  IF OLD."operationType" = 'membership_invite'
     AND OLD."resultKind" = 'project'
     AND NEW."resultKind" = 'membership'
     AND OLD."resultId" IS DISTINCT FROM NEW."resultId"
     AND OLD."id" IS NOT DISTINCT FROM NEW."id"
     AND OLD."actorUserId" IS NOT DISTINCT FROM NEW."actorUserId"
     AND OLD."actorKind" IS NOT DISTINCT FROM NEW."actorKind"
     AND OLD."servicePrincipalCode" IS NOT DISTINCT FROM NEW."servicePrincipalCode"
     AND OLD."operationType" IS NOT DISTINCT FROM NEW."operationType"
     AND OLD."operationId" IS NOT DISTINCT FROM NEW."operationId"
     AND OLD."requestHash" IS NOT DISTINCT FROM NEW."requestHash"
     AND OLD."createdAt" IS NOT DISTINCT FROM NEW."createdAt"
     AND valid_membership_invite_transition THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Project operation audit rows are immutable except for pre-event membership invitation finalization'
    USING ERRCODE = '23514', CONSTRAINT = 'ProjectOperation_immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ProjectOperation_audit_guard"
  BEFORE UPDATE OR DELETE ON "ProjectOperation"
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_operation_audit_guard"();--> statement-breakpoint
CREATE FUNCTION "phase13_project_operation_membership_event_required"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_count integer;
BEGIN
  IF OLD."operationType" = 'membership_invite'
     AND OLD."resultKind" = 'project'
     AND NEW."resultKind" = 'membership' THEN
    SELECT count(*) INTO event_count
    FROM "ProjectEvent" event
    WHERE event."operationRecordId" = NEW."id"
      AND event."projectId" = OLD."resultId"
      AND event."eventType" = 'membership_state_changed'
      AND event."subjectKind" = 'membership'
      AND event."subjectId" = NEW."resultId"
      AND event."actorUserId" IS NOT DISTINCT FROM NEW."actorUserId"
      AND event."actorKind" IS NOT DISTINCT FROM NEW."actorKind"
      AND event."servicePrincipalCode" IS NOT DISTINCT FROM NEW."servicePrincipalCode";

    IF event_count <> 1 OR EXISTS (
      SELECT 1 FROM "ProjectEvent" event
      WHERE event."operationRecordId" = NEW."id"
        AND (event."projectId" IS DISTINCT FROM OLD."resultId"
          OR event."eventType" IS DISTINCT FROM 'membership_state_changed'
          OR event."subjectKind" IS DISTINCT FROM 'membership'
          OR event."subjectId" IS DISTINCT FROM NEW."resultId"
          OR event."actorUserId" IS DISTINCT FROM NEW."actorUserId"
          OR event."actorKind" IS DISTINCT FROM NEW."actorKind"
          OR event."servicePrincipalCode" IS DISTINCT FROM NEW."servicePrincipalCode")
    ) THEN
      RAISE EXCEPTION 'Finalized membership invitation must have exactly one matching event'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectOperation_membership_event_required';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ProjectOperation_membership_event_required"
  AFTER UPDATE ON "ProjectOperation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_operation_membership_event_required"();--> statement-breakpoint
CREATE FUNCTION "phase13_project_event_append_only"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Project event audit rows cannot be deleted'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectEvent_delete_protected';
  END IF;
  RAISE EXCEPTION 'Project event audit rows are immutable'
    USING ERRCODE = '23514', CONSTRAINT = 'ProjectEvent_immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ProjectEvent_append_only"
  BEFORE UPDATE OR DELETE ON "ProjectEvent"
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_event_append_only"();--> statement-breakpoint
CREATE FUNCTION "phase13_project_document_processing_run_audit_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  identity_unchanged boolean;
  preterminal_evidence_update boolean;
  terminal_transition boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Project document processing audit rows cannot be deleted'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentProcessingRun_delete_protected';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'started' THEN
      RAISE EXCEPTION 'Project document processing runs must start before completion'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentProcessingRun_start_required';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD IS NOT DISTINCT FROM NEW THEN
    RETURN NEW;
  END IF;

  identity_unchanged := OLD."id" IS NOT DISTINCT FROM NEW."id"
    AND OLD."projectId" IS NOT DISTINCT FROM NEW."projectId"
    AND OLD."versionId" IS NOT DISTINCT FROM NEW."versionId"
    AND OLD."generation" IS NOT DISTINCT FROM NEW."generation"
    AND OLD."operationKind" IS NOT DISTINCT FROM NEW."operationKind"
    AND OLD."providerCode" IS NOT DISTINCT FROM NEW."providerCode"
    AND OLD."initiatedByUserId" IS NOT DISTINCT FROM NEW."initiatedByUserId"
    AND OLD."servicePrincipalCode" IS NOT DISTINCT FROM NEW."servicePrincipalCode"
    AND OLD."objectSha256" IS NOT DISTINCT FROM NEW."objectSha256"
    AND OLD."startedAt" IS NOT DISTINCT FROM NEW."startedAt";

  preterminal_evidence_update := OLD."status" = 'started'
    AND NEW."status" = 'started'
    AND OLD."verdict" IS NOT DISTINCT FROM NEW."verdict"
    AND OLD."completedAt" IS NOT DISTINCT FROM NEW."completedAt"
    AND OLD."errorCode" IS NOT DISTINCT FROM NEW."errorCode"
    AND (
      (OLD."providerEventId" IS NULL AND NEW."providerEventId" IS NOT NULL
        AND OLD."eventFingerprint" IS NOT DISTINCT FROM NEW."eventFingerprint")
      OR (OLD."eventFingerprint" IS NULL AND NEW."eventFingerprint" IS NOT NULL
        AND OLD."providerEventId" IS NOT DISTINCT FROM NEW."providerEventId")
    );

  terminal_transition := OLD."status" = 'started'
    AND NEW."status" IN ('completed', 'failed')
    AND OLD."providerEventId" IS NOT DISTINCT FROM NEW."providerEventId"
    AND OLD."eventFingerprint" IS NOT DISTINCT FROM NEW."eventFingerprint";

  IF identity_unchanged AND (preterminal_evidence_update OR terminal_transition) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Project document processing runs allow only one start-to-terminal audit transition'
    USING ERRCODE = '23514', CONSTRAINT = 'ProjectDocumentProcessingRun_immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ProjectDocumentProcessingRun_zz_audit_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "ProjectDocumentProcessingRun"
  FOR EACH ROW EXECUTE FUNCTION "phase13_project_document_processing_run_audit_guard"();--> statement-breakpoint
