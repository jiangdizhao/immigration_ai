CREATE OR REPLACE FUNCTION "phase13_round2_operation_event_binding"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  op "ProjectOperation"%ROWTYPE;
  target_project uuid;
BEGIN
  IF NEW."eventType" NOT IN (
    'project_evidence_extraction_completed',
    'project_fact_changed'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO op
  FROM "ProjectOperation"
  WHERE "id" = NEW."operationRecordId";

  IF NOT FOUND
    OR op."actorKind" IS DISTINCT FROM 'user'
    OR op."actorUserId" IS DISTINCT FROM NEW."actorUserId"
  THEN
    RAISE EXCEPTION 'Round 2 event actor must match operation'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectRound2Event_actor_match';
  END IF;

  IF NEW."eventType" = 'project_evidence_extraction_completed' THEN
    IF op."operationType" <> 'project_evidence_extract'
      OR op."resultKind" <> 'document_extraction_run'
      OR op."resultId" IS DISTINCT FROM NEW."subjectId"
      OR NEW."subjectKind" <> 'document_extraction_run'
    THEN
      RAISE EXCEPTION 'Evidence event does not match operation result'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectEvidenceEvent_operation_match';
    END IF;
    SELECT "projectId" INTO target_project
    FROM "ProjectDocumentProcessingRun"
    WHERE "id" = NEW."subjectId" AND "operationKind" = 'extract';
  ELSE
    IF op."operationType" <> 'project_fact_mutation'
      OR op."resultKind" <> 'project_fact_assertion'
      OR op."resultId" IS DISTINCT FROM NEW."subjectId"
      OR NEW."subjectKind" <> 'project_fact_assertion'
    THEN
      RAISE EXCEPTION 'Fact event does not match operation result'
        USING ERRCODE = '23514', CONSTRAINT = 'ProjectFactEvent_operation_match';
    END IF;
    SELECT "projectId" INTO target_project
    FROM "ProjectFactAssertion"
    WHERE "id" = NEW."subjectId";
  END IF;

  IF target_project IS DISTINCT FROM NEW."projectId" THEN
    RAISE EXCEPTION 'Round 2 event subject belongs to another Project'
      USING ERRCODE = '23514', CONSTRAINT = 'ProjectRound2Event_project_match';
  END IF;
  RETURN NEW;
END;
$$;
