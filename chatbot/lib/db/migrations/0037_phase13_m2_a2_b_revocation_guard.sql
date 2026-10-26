CREATE OR REPLACE FUNCTION "phase13_round2_revocation_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Project fact grants/publications cannot be deleted' USING ERRCODE='23514', CONSTRAINT='ProjectFact_revocation_delete_protected'; END IF;
  IF OLD."id" IS DISTINCT FROM NEW."id" OR OLD."projectId" IS DISTINCT FROM NEW."projectId" OR OLD."assertionId" IS DISTINCT FROM NEW."assertionId" OR OLD."assertionVersion" IS DISTINCT FROM NEW."assertionVersion" OR OLD."actorUserId" IS DISTINCT FROM NEW."actorUserId" OR OLD."audience" IS DISTINCT FROM NEW."audience" OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Project fact publication/grant identity is immutable' USING ERRCODE='23514', CONSTRAINT='ProjectFact_revocation_immutable';
  END IF;
  IF TG_TABLE_NAME = 'ProjectFactPublication' AND NOT ((to_jsonb(OLD)->>'active') = 'true' AND (to_jsonb(NEW)->>'active') = 'false' AND OLD."revokedAt" IS NULL AND NEW."revokedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Invalid publication revocation' USING ERRCODE='23514', CONSTRAINT='ProjectFactPublication_revoke_once'; END IF;
  IF TG_TABLE_NAME = 'ProjectFactUseGrant' AND NOT (OLD."revokedAt" IS NULL AND NEW."revokedAt" IS NOT NULL) THEN RAISE EXCEPTION 'AI-use grants can only be revoked once' USING ERRCODE='23514', CONSTRAINT='ProjectFactUseGrant_revoke_once'; END IF;
  RETURN NEW;
END $$;
