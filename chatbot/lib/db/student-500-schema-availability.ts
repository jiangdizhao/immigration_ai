import "server-only";

import { getTableColumns } from "drizzle-orm";
import postgres from "postgres";
import {
  student500Application,
  student500ApplicationEvent,
  student500ApplicationOperation,
} from "./schema";

let catalogClient: ReturnType<typeof postgres> | null = null;

const EXPECTED_TABLES = {
  Student500Application: student500Application,
  Student500ApplicationEvent: student500ApplicationEvent,
  Student500ApplicationOperation: student500ApplicationOperation,
} as const;

const EXPECTED_INDEXES = [
  "Student500Application_project_id_unique",
  "Student500Application_project_owner_created_idx",
  "Student500ApplicationEvent_revision_event_unique",
  "Student500ApplicationEvent_application_created_idx",
  "Student500ApplicationOperation_actor_operation_unique",
  "Student500ApplicationOperation_application_created_idx",
] as const;

const EXPECTED_TRIGGERS = [
  "Student500Application_guard",
  "Student500ApplicationOperation_append_only",
  "Student500ApplicationEvent_append_only",
] as const;

const EXPECTED_FUNCTIONS = [
  "phase13_m6_1_application_guard",
  "phase13_m6_1_append_only_guard",
] as const;

/**
 * Fail-closed readiness probe for the additive Phase 13 M6.1 schema.
 *
 * Migration 0048 is intentionally unapplied in this worktree. Until an approved
 * migration gate applies it, every Student 500 route returns 503 instead of
 * degrading into partial behaviour.
 *
 * Expected columns are derived from the Drizzle definitions, so this probe cannot
 * drift from the schema it guards.
 */
export async function student500SchemaAvailable(): Promise<boolean> {
  const postgresUrl = process.env.POSTGRES_URL?.trim();
  if (!postgresUrl) {
    return false;
  }
  catalogClient ??= postgres(postgresUrl, {
    connection: { TimeZone: "UTC" },
    idle_timeout: 20,
    max: 1,
  });
  const tableNames = Object.keys(EXPECTED_TABLES);
  const columns = await catalogClient<
    { tableName: string; columnName: string }[]
  >`
    SELECT table_name AS "tableName", column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${tableNames}::text[])
  `;
  const actual = new Set(
    columns.map((row) => `${row.tableName}.${row.columnName}`)
  );
  for (const [tableName, table] of Object.entries(EXPECTED_TABLES)) {
    for (const column of Object.values(getTableColumns(table))) {
      if (!actual.has(`${tableName}.${column.name}`)) {
        return false;
      }
    }
  }
  const [row] = await catalogClient<
    {
      indexes: number;
      triggers: number;
      functions: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ANY(${[...EXPECTED_INDEXES]}::text[])) AS "indexes",
      (SELECT count(*)::int FROM pg_trigger
        WHERE NOT tgisinternal AND tgname = ANY(${[...EXPECTED_TRIGGERS]}::text[])) AS "triggers",
      (SELECT count(*)::int FROM pg_proc
        INNER JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
        WHERE pg_namespace.nspname = 'public'
          AND pg_proc.proname = ANY(${[...EXPECTED_FUNCTIONS]}::text[])) AS "functions"
  `;
  return Boolean(
    row &&
      row.indexes === EXPECTED_INDEXES.length &&
      row.triggers === EXPECTED_TRIGGERS.length &&
      row.functions === EXPECTED_FUNCTIONS.length
  );
}

export async function closeStudent500SchemaClient(): Promise<void> {
  const client = catalogClient;
  catalogClient = null;
  if (client) {
    await client.end({ timeout: 5 });
  }
}
