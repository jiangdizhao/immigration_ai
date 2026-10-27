import "server-only";

import postgres from "postgres";

type ReadinessRow = {
  assignmentTable: string | null;
  requiredColumns: number;
  requiredIndexes: number;
  requiredConstraints: number;
  requiredTriggers: number;
};

let catalogClient: ReturnType<typeof postgres> | null = null;

/** Fail closed unless M4-002's full additive assignment/audit schema exists. */
export async function projectStaffAssignmentSchemaAvailable(): Promise<boolean> {
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
    WITH expected_columns(column_name) AS (
      VALUES
        ('id'), ('projectId'), ('staffUserId'), ('proposedByAdminUserId'),
        ('purpose'), ('assignmentRole'), ('status'), ('staffEmailSha256'),
        ('noticeVersion'), ('noticeSha256'), ('proposalSha256'),
        ('ownerApprovedByUserId'), ('ownerApprovedAt'), ('ownerApprovalSha256'),
        ('lawyerAcceptedAt'), ('terminalActorUserId'), ('terminalReasonCode'),
        ('terminalAt'), ('lastProjectRevision'), ('lastOperationRecordId'),
        ('createdAt'), ('updatedAt')
    )
    SELECT
      to_regclass('public."ProjectStaffAssignment"')::text AS "assignmentTable",
      (SELECT count(*)::int FROM expected_columns expected
       JOIN information_schema.columns actual
         ON actual.table_schema = 'public'
        AND actual.table_name = 'ProjectStaffAssignment'
        AND actual.column_name = expected.column_name) AS "requiredColumns",
      (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
        'ProjectStaffAssignment_project_staff_purpose_live_unique',
        'ProjectStaffAssignment_project_status_idx',
        'ProjectStaffAssignment_admin_project_status_idx',
        'ProjectStaffAssignment_staff_status_idx'
      )) AS "requiredIndexes",
      (SELECT count(*)::int FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace AND conname IN (
        'ProjectStaffAssignment_purpose_check', 'ProjectStaffAssignment_role_check',
        'ProjectStaffAssignment_status_check', 'ProjectStaffAssignment_hash_check',
        'ProjectStaffAssignment_notice_version_check', 'ProjectStaffAssignment_revision_positive_check',
        'ProjectStaffAssignment_timestamps_check', 'ProjectStaffAssignment_lifecycle_check',
        'ProjectOperation_type_check', 'ProjectOperation_result_kind_check', 'ProjectOperation_actor_type_check',
        'ProjectEvent_type_check', 'ProjectEvent_subject_check', 'ProjectEvent_staff_assignment_subject_check'
      )) AS "requiredConstraints",
      (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND (
        (tgname = 'ProjectStaffAssignment_immutable_guard' AND tgrelid = '"ProjectStaffAssignment"'::regclass)
        OR (tgname = 'ProjectRound2Event_binding' AND tgrelid = '"ProjectEvent"'::regclass)
        OR (tgname = 'ProjectStaffAssignmentOperation_complete' AND tgrelid = '"ProjectOperation"'::regclass)
        OR (tgname = 'ProjectStaffAssignment_transition_complete' AND tgrelid = '"ProjectStaffAssignment"'::regclass)
      )) AS "requiredTriggers"
  `;
  const row = rows[0];
  return Boolean(
    row?.assignmentTable &&
      row.requiredColumns === 22 &&
      row.requiredIndexes === 4 &&
      row.requiredConstraints === 14 &&
      row.requiredTriggers === 4
  );
}

export async function closeProjectStaffAssignmentSchemaClient() {
  const client = catalogClient;
  catalogClient = null;
  if (client) {
    await client.end({ timeout: 5 });
  }
}
