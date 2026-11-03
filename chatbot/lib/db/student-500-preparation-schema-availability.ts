import "server-only";

import { getTableColumns } from "drizzle-orm";
import postgres from "postgres";
import {
  student500FactReference,
  student500GsDraft,
  student500PreparationSnapshot,
  student500SchoolContext,
} from "./schema";

/**
 * Fail-closed readiness probe for the additive Phase 13 M6.2 preparation schema.
 *
 * Migration 0049 is unapplied in this worktree by design, so every M6.2 route
 * returns 503 instead of degrading into partial behaviour.
 */

let catalogClient: ReturnType<typeof postgres> | null = null;

const EXPECTED_TABLES = {
  Student500FactReference: student500FactReference,
  Student500GsDraft: student500GsDraft,
  Student500PreparationSnapshot: student500PreparationSnapshot,
  Student500SchoolContext: student500SchoolContext,
} as const;

const EXPECTED_INDEXES = [
  "Student500FactReference_application_fact_version_unique",
  "Student500GsDraft_application_version_unique",
  "Student500GsDraft_project_id_unique",
  "Student500PreparationSnapshot_application_version_unique",
  "Student500PreparationSnapshot_project_id_unique",
  "Student500SchoolContext_application_unique",
] as const;

const EXPECTED_TRIGGERS = [
  "Student500FactReference_guard",
  "Student500FactReference_insert_guard",
  "Student500GsDraft_immutable",
  "Student500GsDraft_insert_guard",
  "Student500PreparationSnapshot_immutable",
  "Student500PreparationSnapshot_insert_guard",
  "Student500SchoolContext_guard",
  "Student500SchoolContext_insert_guard",
] as const;

const EXPECTED_FUNCTIONS = [
  "phase13_m6_2_insert_guard",
  "phase13_m6_2_immutable_guard",
  "phase13_m6_2_fact_reference_guard",
  "phase13_m6_2_school_context_guard",
] as const;

export async function student500PreparationSchemaAvailable(): Promise<boolean> {
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
  const [indexRow] = await catalogClient<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ANY(${EXPECTED_INDEXES}::text[])
  `;
  if ((indexRow?.count ?? 0) !== EXPECTED_INDEXES.length) {
    return false;
  }
  const [triggerRow] = await catalogClient<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_trigger
    WHERE NOT tgisinternal AND tgname = ANY(${EXPECTED_TRIGGERS}::text[])
  `;
  if ((triggerRow?.count ?? 0) !== EXPECTED_TRIGGERS.length) {
    return false;
  }
  const [functionRow] = await catalogClient<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_proc
    WHERE proname = ANY(${EXPECTED_FUNCTIONS}::text[])
  `;
  return (functionRow?.count ?? 0) === EXPECTED_FUNCTIONS.length;
}

export async function closeStudent500PreparationSchemaClient(): Promise<void> {
  const client = catalogClient;
  catalogClient = null;
  if (client) {
    await client.end({ timeout: 5 });
  }
}
