import "server-only";

import postgres from "postgres";

type ReadinessRow = {
  threadTable: string | null;
  consentTable: string | null;
  messageTable: string | null;
  requiredColumns: number;
  requiredIndexes: number;
  requiredConstraints: number;
  requiredTriggers: number;
};

let catalogClient: ReturnType<typeof postgres> | null = null;

/** Fail closed unless Migration 0042's complete human messaging schema exists. */
export async function projectHumanMessagingSchemaAvailable(): Promise<boolean> {
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
    WITH expected_columns(table_name, column_name) AS (
      VALUES
        ('ProjectHumanThread', 'id'), ('ProjectHumanThread', 'projectId'),
        ('ProjectHumanThread', 'ownerUserId'), ('ProjectHumanThread', 'assignmentId'),
        ('ProjectHumanThread', 'lawyerUserId'), ('ProjectHumanThread', 'purpose'),
        ('ProjectHumanThread', 'noticeVersion'), ('ProjectHumanThread', 'noticeSha256'),
        ('ProjectHumanThread', 'status'), ('ProjectHumanThread', 'lastMessageSequence'),
        ('ProjectHumanThread', 'createdAt'),
        ('ProjectThreadParticipationConsent', 'id'), ('ProjectThreadParticipationConsent', 'threadId'),
        ('ProjectThreadParticipationConsent', 'projectId'), ('ProjectThreadParticipationConsent', 'ownerUserId'),
        ('ProjectThreadParticipationConsent', 'assignmentId'), ('ProjectThreadParticipationConsent', 'lawyerUserId'),
        ('ProjectThreadParticipationConsent', 'purpose'), ('ProjectThreadParticipationConsent', 'noticeVersion'),
        ('ProjectThreadParticipationConsent', 'noticeSha256'), ('ProjectThreadParticipationConsent', 'status'),
        ('ProjectThreadParticipationConsent', 'acceptedByUserId'), ('ProjectThreadParticipationConsent', 'acceptedAt'),
        ('ProjectThreadParticipationConsent', 'createdOperationRecordId'), ('ProjectThreadParticipationConsent', 'createdProjectRevision'),
        ('ProjectThreadParticipationConsent', 'withdrawnByUserId'), ('ProjectThreadParticipationConsent', 'withdrawnAt'),
        ('ProjectThreadParticipationConsent', 'withdrawnOperationRecordId'), ('ProjectThreadParticipationConsent', 'withdrawnProjectRevision'),
        ('ProjectHumanMessage', 'id'), ('ProjectHumanMessage', 'threadId'),
        ('ProjectHumanMessage', 'projectId'), ('ProjectHumanMessage', 'sequence'),
        ('ProjectHumanMessage', 'authorUserId'), ('ProjectHumanMessage', 'operationRecordId'),
        ('ProjectHumanMessage', 'body'), ('ProjectHumanMessage', 'createdAt')
    )
    SELECT
      to_regclass('public."ProjectHumanThread"')::text AS "threadTable",
      to_regclass('public."ProjectThreadParticipationConsent"')::text AS "consentTable",
      to_regclass('public."ProjectHumanMessage"')::text AS "messageTable",
      (SELECT count(*)::int FROM expected_columns expected
       JOIN information_schema.columns actual
         ON actual.table_schema = 'public'
        AND actual.table_name = expected.table_name
        AND actual.column_name = expected.column_name) AS "requiredColumns",
      (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
        'StudyJourneyProject_id_owner_unique', 'ProjectStaffAssignment_id_project_staff_unique',
        'ProjectHumanThread_identity_unique', 'ProjectHumanThread_project_identity_unique',
        'ProjectHumanThread_project_created_idx',
        'ProjectThreadParticipationConsent_identity_unique', 'ProjectThreadParticipationConsent_created_operation_unique',
        'ProjectThreadParticipationConsent_withdrawn_operation_unique', 'ProjectThreadParticipationConsent_thread_unique',
        'ProjectThreadParticipationConsent_status_idx', 'ProjectHumanMessage_thread_sequence_unique',
        'ProjectHumanMessage_operation_unique'
      )) AS "requiredIndexes",
      (SELECT count(*)::int FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace AND conname IN (
        'ProjectHumanThread_purpose_check', 'ProjectHumanThread_notice_check',
        'ProjectHumanThread_status_check', 'ProjectHumanThread_sequence_check',
        'ProjectThreadParticipationConsent_purpose_check', 'ProjectThreadParticipationConsent_notice_check',
        'ProjectThreadParticipationConsent_status_check', 'ProjectThreadParticipationConsent_lifecycle_check',
        'ProjectThreadParticipationConsent_revision_check', 'ProjectHumanMessage_sequence_check',
        'ProjectHumanMessage_body_check', 'ProjectEvent_human_consent_subject_check',
        'ProjectOperation_type_check', 'ProjectOperation_result_kind_check', 'ProjectOperation_actor_type_check'
      )) AS "requiredConstraints",
      (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND (
        (tgname = 'ProjectHumanThread_guard' AND tgrelid = '"ProjectHumanThread"'::regclass)
        OR (tgname = 'ProjectThreadParticipationConsent_guard' AND tgrelid = '"ProjectThreadParticipationConsent"'::regclass)
        OR (tgname = 'ProjectHumanMessage_guard' AND tgrelid = '"ProjectHumanMessage"'::regclass)
        OR (tgname = 'ProjectHumanConsentEvent_binding' AND tgrelid = '"ProjectEvent"'::regclass)
        OR (tgname = 'ProjectHumanMessagingOperation_complete' AND tgrelid = '"ProjectOperation"'::regclass)
        OR (tgname = 'ProjectHumanThread_complete' AND tgrelid = '"ProjectHumanThread"'::regclass)
      )) AS "requiredTriggers"
  `;
  const row = rows[0];
  return Boolean(
    row?.threadTable &&
      row.consentTable &&
      row.messageTable &&
      row.requiredColumns === 37 &&
      row.requiredIndexes === 12 &&
      row.requiredConstraints === 15 &&
      row.requiredTriggers === 6
  );
}

export async function closeProjectHumanMessagingSchemaClient() {
  const client = catalogClient;
  catalogClient = null;
  if (client) {
    await client.end({ timeout: 5 });
  }
}
