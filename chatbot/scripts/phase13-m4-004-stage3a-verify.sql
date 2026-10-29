-- Phase 13 M4-004 — Stage 3A read-only verification (corrected)
--
-- Purpose
--   Re-verify the already-migrated isolated M4-004 target WITHOUT repeating the
--   migration and WITHOUT any possibility of modifying it.
--
-- Why this file exists
--   The first Stage 3A auxiliary script (/tmp/verify3a.sql) had two defects:
--     1. statement 11 used `ESCAPE '\\'`, so psql received a two-character escape
--        string -> ERROR: invalid escape string (SQLSTATE 22025);
--     2. it ran without ON_ERROR_STOP, so that error did not stop the script and the
--        log still recorded `stage3a_status=PASS`. Its `read_ok=0` row was also
--        ambiguous: a bare 0 cannot distinguish "readable but empty" from
--        "nothing visible".
--   This script fixes both: any SQL error aborts with a non-zero exit code, and
--   readability is proven with explicit per-table count(*) checks plus catalog
--   privilege assertions instead of one ambiguous number.
--
-- Safety contract
--   * Run AS the restricted integration role `phase13_m4_004_tester`.
--   * Only against the authorized isolated target:
--       127.0.0.1:55444 / immigration_ai_phase13_m4_004_test
--     (container `phase13-m4-004-pg`). No other database is permitted.
--   * `default_transaction_read_only = on` plus an explicit READ ONLY transaction:
--     any accidental write raises SQLSTATE 25006 and aborts the script.
--   * `ON_ERROR_STOP on`: the first SQL error aborts with a non-zero exit code, so a
--     SQL error can never be reported as a PASS.
--   * Read-only by construction: SELECT and catalog lookups only. No INSERT,
--     UPDATE, DELETE, TRUNCATE, DDL, GRANT/REVOKE, CREATE TEMP TABLE or migration
--     operation appears below.
--   * Exactly one aggregated verdict query feeds the pass/fail decision, so no check
--     can be silently dropped.
--
-- Usage (owner-authorized only; credentials come from the local secret store and
-- must never be echoed):
--   PGPASSWORD="$(cat <tester-password-file>)" \
--     psql -h 127.0.0.1 -p 55444 -U phase13_m4_004_tester \
--          -d immigration_ai_phase13_m4_004_test \
--          -X -q -A -t -v ON_ERROR_STOP=1 \
--          -f chatbot/scripts/phase13-m4-004-stage3a-verify.sql
--
-- Expected final line: STAGE3A_READ_ONLY_VERIFIED
-- Any other outcome is a FAILURE and must be reported, never reclassified.

\set ON_ERROR_STOP on
SET default_transaction_read_only = on;

BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;

SELECT 'db=' || current_database()
    || ' role=' || current_user
    || ' server_version_num=' || current_setting('server_version_num');

WITH checks AS (
  SELECT * FROM (VALUES
    ('database_identity',
      current_database() = 'immigration_ai_phase13_m4_004_test'
      AND current_user = 'phase13_m4_004_tester'),
    ('role_can_login',
      (SELECT rolcanlogin FROM pg_roles WHERE rolname = current_user)),
    ('role_not_superuser',
      NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)),
    ('role_no_createdb',
      NOT (SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user)),
    ('role_no_createrole',
      NOT (SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user)),
    ('no_create_on_public',
      NOT has_schema_privilege(current_user, 'public', 'CREATE')),
    ('database_temp_allowed',
      has_database_privilege(current_user, current_database(), 'TEMP')),
    ('server_major_17',
      current_setting('server_version_num')::int BETWEEN 170000 AND 179999),
    ('ledger_row_count_44',
      (SELECT count(*) = 44 FROM drizzle.__drizzle_migrations)),
    ('ledger_head_hash_pinned',
      (SELECT hash = '4cc2861c545ecc0d7dce1c06899b78172aa8466b0969c10b4af785aa23c06dfe'
       FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)),
    ('ledger_head_timestamp_pinned',
      (SELECT created_at = 1793233341879
       FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1)),
    ('ledger_has_no_extra_rows',
      (SELECT count(*) = 0 FROM drizzle.__drizzle_migrations WHERE id > 44)),
    ('m4_004_tables_present',
      (SELECT count(*) = 5 FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND c.relname IN ('ServiceEngagement','ServiceAgreementVersion',
                           'ServiceAgreementAcceptance','ServiceSignatureEvidence',
                           'ProjectResourceDisclosureGrant'))),
    ('current_agreement_composite_fk',
      (SELECT count(*) = 1 FROM pg_constraint
       WHERE conname = 'ServiceEngagement_current_agreement_fk'
         AND conrelid = to_regclass('public."ServiceEngagement"'))),
    ('scope_checks_present',
      (SELECT count(*) = 2 FROM pg_constraint
       WHERE contype = 'c'
         AND conname IN ('ServiceEngagement_scope_check',
                         'ServiceAgreementVersion_scope_check'))),
    ('guard_triggers_present',
      (SELECT count(*) = 5 FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND NOT t.tgisinternal
         AND c.relname IN ('ServiceEngagement','ServiceAgreementVersion',
                           'ServiceAgreementAcceptance','ServiceSignatureEvidence',
                           'ProjectResourceDisclosureGrant'))),
    ('readable_ServiceEngagement',
      (SELECT count(*) >= 0 FROM public."ServiceEngagement")),
    ('readable_ServiceAgreementVersion',
      (SELECT count(*) >= 0 FROM public."ServiceAgreementVersion")),
    ('readable_ServiceAgreementAcceptance',
      (SELECT count(*) >= 0 FROM public."ServiceAgreementAcceptance")),
    ('readable_ServiceSignatureEvidence',
      (SELECT count(*) >= 0 FROM public."ServiceSignatureEvidence")),
    ('readable_ProjectResourceDisclosureGrant',
      (SELECT count(*) >= 0 FROM public."ProjectResourceDisclosureGrant")),
    ('readable_ledger',
      (SELECT count(*) >= 0 FROM drizzle.__drizzle_migrations)),
    ('dml_grant_on_project_membership',
      has_table_privilege(current_user, 'public."ProjectMembership"', 'UPDATE')),
    ('dml_grant_on_service_engagement',
      has_table_privilege(current_user, 'public."ServiceEngagement"', 'INSERT')),
    ('dml_grant_on_ledger',
      -- Least privilege on migration history: the integration tester must be able
      -- to *read* the ledger (Stage 3A/3B identity checks depend on it) and must
      -- never be able to write or truncate it. An over-privileged tester FAILS
      -- here; privileges are never granted or revoked to make this check pass.
      has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'SELECT')
      AND NOT has_table_privilege(
        current_user, 'drizzle.__drizzle_migrations', 'INSERT')
      AND NOT has_table_privilege(
        current_user, 'drizzle.__drizzle_migrations', 'UPDATE')
      AND NOT has_table_privilege(
        current_user, 'drizzle.__drizzle_migrations', 'DELETE')
      AND NOT has_table_privilege(
        current_user, 'drizzle.__drizzle_migrations', 'TRUNCATE'))
  ) AS t(check_name, ok)
)
SELECT count(*) AS total,
       count(*) FILTER (WHERE ok IS TRUE) AS passed,
       coalesce(string_agg(check_name, ',' ORDER BY check_name)
         FILTER (WHERE ok IS NOT TRUE), 'none') AS failed,
       (count(*) FILTER (WHERE ok IS NOT TRUE) = 0) AS all_ok
FROM checks
\gset

\echo 'STAGE3A_READ_ONLY_CHECKS total=' :total 'passed=' :passed 'failed=' :failed

\if :all_ok
  \echo 'STAGE3A_READ_ONLY_VERIFIED'
\else
  \echo 'STAGE3A_READ_ONLY_FAILED'
  -- Intentional sentinel so ON_ERROR_STOP aborts with a non-zero exit code. It is
  -- only reached when at least one check failed, and it performs no write.
  SELECT 1 / 0;
\endif

COMMIT;
