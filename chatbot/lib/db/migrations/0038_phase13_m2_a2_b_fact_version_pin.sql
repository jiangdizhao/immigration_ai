CREATE OR REPLACE FUNCTION "phase13_round2_fact_assertion_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Project fact assertions cannot be deleted' USING ERRCODE='23514', CONSTRAINT='ProjectFactAssertion_delete_protected';
  END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id" OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
    OR OLD."key" IS DISTINCT FROM NEW."key" OR OLD."valueType" IS DISTINCT FROM NEW."valueType"
    OR OLD."value"::text IS DISTINCT FROM NEW."value"::text OR OLD."normalizedComparison" IS DISTINCT FROM NEW."normalizedComparison"
    OR OLD."originKind" IS DISTINCT FROM NEW."originKind" OR OLD."createdByUserId" IS DISTINCT FROM NEW."createdByUserId"
    OR OLD."effectiveFrom" IS DISTINCT FROM NEW."effectiveFrom" OR OLD."effectiveTo" IS DISTINCT FROM NEW."effectiveTo"
    OR OLD."observedAt" IS DISTINCT FROM NEW."observedAt" OR OLD."supersedesAssertionId" IS DISTINCT FROM NEW."supersedesAssertionId"
    OR NEW."version" IS DISTINCT FROM OLD."version" THEN
    RAISE EXCEPTION 'Project fact assertion payload and version are immutable' USING ERRCODE='23514', CONSTRAINT='ProjectFactAssertion_immutable';
  END IF;
  IF NOT ((OLD."state"='proposed' AND NEW."state" IN ('customer_confirmed','rejected','disputed','stale','superseded'))
      OR (OLD."state"='customer_confirmed' AND NEW."state" IN ('disputed','stale','superseded'))
      OR (OLD."state"=NEW."state" AND OLD."stale" IS DISTINCT FROM NEW."stale")) THEN
    RAISE EXCEPTION 'Invalid Project fact transition' USING ERRCODE='23514', CONSTRAINT='ProjectFactAssertion_transition';
  END IF;
  RETURN NEW;
END $$;
