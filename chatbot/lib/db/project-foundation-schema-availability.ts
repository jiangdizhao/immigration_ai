import "server-only";

import postgres from "postgres";

type ReadinessRow = {
  projectTable: string | null;
  membershipTable: string | null;
  conversationTable: string | null;
  operationTable: string | null;
  eventTable: string | null;
  requiredColumns: number;
  requiredIndexes: number;
};

let catalogClient: ReturnType<typeof postgres> | null = null;

export type ProjectFoundationSchemaStatus = "absent" | "partial" | "ready";

/** Distinguishes an unmigrated database from an incomplete M1.1 schema. */
export async function projectFoundationSchemaStatus(): Promise<ProjectFoundationSchemaStatus> {
  const postgresUrl = process.env.POSTGRES_URL?.trim();
  if (!postgresUrl) {
    return "absent";
  }
  catalogClient ??= postgres(postgresUrl, {
    max: 1,
    idle_timeout: 20,
    connection: { TimeZone: "UTC" },
  });
  const rows = await catalogClient<ReadinessRow[]>`
    WITH expected_columns(table_name, column_name) AS (
      VALUES
        ('StudyJourneyProject', 'id'),
        ('StudyJourneyProject', 'ownerUserId'),
        ('StudyJourneyProject', 'status'),
        ('StudyJourneyProject', 'revision'),
        ('StudyJourneyProject', 'createdAt'),
        ('StudyJourneyProject', 'updatedAt'),
        ('StudyJourneyProject', 'closedAt'),
        ('ProjectMembership', 'id'),
        ('ProjectMembership', 'projectId'),
        ('ProjectMembership', 'userId'),
        ('ProjectMembership', 'status'),
        ('ProjectMembership', 'invitedByUserId'),
        ('ProjectMembership', 'createdAt'),
        ('ProjectMembership', 'updatedAt'),
        ('ProjectMembership', 'acceptedAt'),
        ('ProjectMembership', 'revokedAt'),
        ('ProjectConversation', 'chatId'),
        ('ProjectConversation', 'projectId'),
        ('ProjectConversation', 'createdByUserId'),
        ('ProjectConversation', 'createdAt'),
        ('ProjectOperation', 'id'),
        ('ProjectOperation', 'actorUserId'),
        ('ProjectOperation', 'operationType'),
        ('ProjectOperation', 'operationId'),
        ('ProjectOperation', 'requestHash'),
        ('ProjectOperation', 'resultKind'),
        ('ProjectOperation', 'resultId'),
        ('ProjectOperation', 'createdAt'),
        ('ProjectEvent', 'id'),
        ('ProjectEvent', 'projectId'),
        ('ProjectEvent', 'actorUserId'),
        ('ProjectEvent', 'projectRevision'),
        ('ProjectEvent', 'eventType'),
        ('ProjectEvent', 'subjectKind'),
        ('ProjectEvent', 'subjectId'),
        ('ProjectEvent', 'operationRecordId'),
        ('ProjectEvent', 'createdAt')
    )
    SELECT
      to_regclass('public."StudyJourneyProject"')::text AS "projectTable",
      to_regclass('public."ProjectMembership"')::text AS "membershipTable",
      to_regclass('public."ProjectConversation"')::text AS "conversationTable",
      to_regclass('public."ProjectOperation"')::text AS "operationTable",
      to_regclass('public."ProjectEvent"')::text AS "eventTable",
      (
        SELECT count(*)::int
        FROM expected_columns AS expected
        INNER JOIN information_schema.columns AS actual
          ON actual.table_schema = 'public'
         AND actual.table_name = expected.table_name
         AND actual.column_name = expected.column_name
      ) AS "requiredColumns",
      (
        SELECT count(*)::int
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'ProjectMembership_project_user_unique',
            'ProjectOperation_actor_type_operation_unique',
            'ProjectEvent_project_revision_unique'
          )
      ) AS "requiredIndexes"
  `;
  const row = rows[0];
  const ready = Boolean(
    row?.projectTable &&
      row.membershipTable &&
      row.conversationTable &&
      row.operationTable &&
      row.eventTable &&
      row.requiredColumns === 37 &&
      row.requiredIndexes === 3
  );
  if (ready) {
    return "ready";
  }
  return row &&
    (row.projectTable ||
      row.membershipTable ||
      row.conversationTable ||
      row.operationTable ||
      row.eventTable)
    ? "partial"
    : "absent";
}

/** Fail closed unless the complete additive M1.1 schema is already present. */
export async function projectFoundationSchemaAvailable(): Promise<boolean> {
  return (await projectFoundationSchemaStatus()) === "ready";
}

export async function closeProjectFoundationSchemaClient(): Promise<void> {
  const client = catalogClient;
  catalogClient = null;
  if (client) {
    await client.end({ timeout: 5 });
  }
}
