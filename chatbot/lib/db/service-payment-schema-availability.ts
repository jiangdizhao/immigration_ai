import "server-only";

import postgres from "postgres";

type ReadinessRow = {
  conditionTable: string | null;
  evidenceTable: string | null;
  resolutionTable: string | null;
  requiredColumns: number;
  requiredIndexes: number;
  requiredConstraints: number;
  requiredTriggers: number;
};

let catalogClient: ReturnType<typeof postgres> | null = null;

/**
 * Fail closed unless Migration 0044's complete M4-005 schema exists. Any missing
 * table, column, index, named constraint or guard trigger disables every M4-005
 * route without touching M4-002/003/004 or customer Chat behavior.
 */
export async function servicePaymentSchemaAvailable(): Promise<boolean> {
  const postgresUrl = process.env.POSTGRES_URL?.trim();
  if (!postgresUrl) {
    return false;
  }
  catalogClient ??= postgres(postgresUrl, {
    max: 1,
    idle_timeout: 20,
    connection: { TimeZone: "UTC" },
  });
  const rows = await catalogClient<ReadinessRow[]>`
    SELECT
      to_regclass('public."ServicePaymentCondition"')::text AS "conditionTable",
      to_regclass('public."ServicePaymentEvidence"')::text AS "evidenceTable",
      to_regclass('public."ServicePaymentResolution"')::text AS "resolutionTable",
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ServicePaymentCondition') AS "conditionColumns",
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ServicePaymentEvidence') AS "evidenceColumns",
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ServicePaymentResolution') AS "resolutionColumns",
      ((SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ServicePaymentCondition')
       + (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ServicePaymentEvidence')
       + (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ServicePaymentResolution')) AS "requiredColumns",
      (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
        'ServicePaymentCondition_id_project_unique','ServicePaymentCondition_id_engagement_unique',
        'ServicePaymentCondition_scope_identity_unique','ServicePaymentCondition_id_project_engagement_unique',
        'ServicePaymentCondition_live_unique',
        'ServicePaymentCondition_project_created_idx','ServicePaymentCondition_engagement_version_idx',
        'ServicePaymentEvidence_id_project_unique','ServicePaymentEvidence_id_engagement_unique',
        'ServicePaymentEvidence_id_condition_unique','ServicePaymentEvidence_submitted_operation_unique',
        'ServicePaymentEvidence_verification_operation_unique',
        'ServicePaymentEvidence_condition_reference_unique','ServicePaymentEvidence_verified_unique',
        'ServicePaymentEvidence_condition_status_idx','ServicePaymentEvidence_engagement_status_idx',
        'ServicePaymentResolution_id_project_unique','ServicePaymentResolution_id_condition_unique',
        'ServicePaymentResolution_operation_unique','ServicePaymentResolution_condition_idx',
        'ServicePaymentResolution_engagement_idx','ServicePaymentResolution_superseded_target_unique'
      )) AS "requiredIndexes",
      (SELECT count(*)::int FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace AND conname IN (
        'ServicePaymentCondition_requirement_check','ServicePaymentCondition_basis_code_check',
        'ServicePaymentCondition_amount_check','ServicePaymentCondition_basis_ref_check',
        'ServicePaymentCondition_hash_check','ServicePaymentCondition_authority_check',
        'ServicePaymentCondition_supersession_check','ServicePaymentEvidence_category_check',
        'ServicePaymentEvidence_status_check','ServicePaymentEvidence_amount_check',
        'ServicePaymentEvidence_hash_check','ServicePaymentEvidence_revision_check',
        'ServicePaymentEvidence_lifecycle_check','ServicePaymentResolution_kind_check',
        'ServicePaymentResolution_reason_check','ServicePaymentResolution_hash_check',
        'ServicePaymentResolution_authority_check','ServicePaymentResolution_supersession_check',
        'ServicePaymentResolution_target_check','ProjectEvent_service_payment_subject_check',
        'ProjectOperation_type_check','ProjectOperation_result_kind_check',
        'ProjectOperation_actor_type_check','ProjectEvent_type_check','ProjectEvent_subject_check'
      )) AS "requiredConstraints",
      (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND (
        (tgname = 'ServicePaymentCondition_guard' AND tgrelid = '"ServicePaymentCondition"'::regclass)
        OR (tgname = 'ServicePaymentEvidence_guard' AND tgrelid = '"ServicePaymentEvidence"'::regclass)
        OR (tgname = 'ServicePaymentResolution_guard' AND tgrelid = '"ServicePaymentResolution"'::regclass)
        OR (tgname = 'ServicePaymentOperation_complete' AND tgrelid = '"ProjectOperation"'::regclass)
        OR (tgname = 'ServicePaymentCondition_supersession_lineage' AND tgrelid = '"ServicePaymentCondition"'::regclass)
      )) AS "requiredTriggers"
  `;
  const row = rows[0];
  return Boolean(
    row?.conditionTable &&
      row.evidenceTable &&
      row.resolutionTable &&
      row.requiredColumns === 64 &&
      row.requiredIndexes === 22 &&
      row.requiredConstraints === 25 &&
      row.requiredTriggers === 5
  );
}

export async function closeServicePaymentSchemaClient() {
  const client = catalogClient;
  catalogClient = null;
  if (client) {
    await client.end({ timeout: 5 });
  }
}
