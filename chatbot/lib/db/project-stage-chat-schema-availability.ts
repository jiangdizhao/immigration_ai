import "server-only";

import { getTableColumns } from "drizzle-orm";
import postgres from "postgres";
import { projectConversationStage } from "./schema";

/**
 * Fail-closed readiness probe for the additive Phase 13 M9-A step-binding schema.
 *
 * Migration 0053 is authored and intentionally **unapplied** in this worktree. Until
 * an approved migration gate applies it, the step-conversation routes answer 503 and
 * the workspace shows an honest "step conversations unavailable" state, while
 * ordinary Project Chats keep working unchanged.
 *
 * The expected columns are derived from the Drizzle definition, so this probe cannot
 * drift from the schema it guards.
 */
const EXPECTED_TABLES = {
  ProjectConversationStage: projectConversationStage,
} as const;

const EXPECTED_INDEXES = [
  "ProjectConversationStage_owner_stage_unique",
  "ProjectConversation_chat_project_creator_unique",
] as const;

let catalogClient: ReturnType<typeof postgres> | null = null;

function client() {
  const postgresUrl = process.env.POSTGRES_URL?.trim();
  if (!postgresUrl) {
    return null;
  }
  catalogClient ??= postgres(postgresUrl, {
    connection: { TimeZone: "UTC" },
    idle_timeout: 20,
    max: 1,
  });
  return catalogClient;
}

export async function projectStageChatSchemaAvailable(): Promise<boolean> {
  const sql = client();
  if (!sql) {
    return false;
  }
  const tableNames = Object.keys(EXPECTED_TABLES);
  const columns = await sql<{ tableName: string; columnName: string }[]>`
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
  const [row] = await sql<{ indexes: number }[]>`
    SELECT (SELECT count(*)::int FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY(${[...EXPECTED_INDEXES]}::text[])) AS "indexes"
  `;
  return Boolean(row && row.indexes === EXPECTED_INDEXES.length);
}

export async function closeProjectStageChatSchemaClient(): Promise<void> {
  const client_ = catalogClient;
  catalogClient = null;
  if (client_) {
    await client_.end({ timeout: 5 });
  }
}
