import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  assertExpectedDatabase,
  createMigrationPreflight,
  resolveMigrationLedger,
  safeDatabaseIdentity,
} from "../lib/production/migration-preflight";

async function main(): Promise<void> {
  const connectionString = process.env.POSTGRES_URL;
  const args = process.argv.slice(2);
  const acknowledge = args.includes("--acknowledge-migrations");
  const preflightOnly = args.includes("--preflight");
  const expectedArg = args.find((arg) => arg.startsWith("--expect-database="));
  const expectedDatabase = expectedArg?.slice("--expect-database=".length);
  if (!connectionString) {
    console.error("POSTGRES_URL is required in the operator environment.");
    process.exitCode = 2;
    return;
  }
  if (!preflightOnly && (!acknowledge || !expectedDatabase)) {
    console.error(
      "Migration stopped. Review the target, then repeat with --acknowledge-migrations and --expect-database=<exact database name>."
    );
    process.exitCode = 2;
    return;
  }

  let configuredTarget: ReturnType<typeof safeDatabaseIdentity>;
  try {
    configuredTarget = safeDatabaseIdentity(connectionString);
    if (!preflightOnly) {
      assertExpectedDatabase(configuredTarget.database, expectedDatabase ?? "");
    }
  } catch {
    console.error(
      "Migration stopped. Configured database does not match the expected database."
    );
    process.exitCode = 2;
    return;
  }

  let sql: ReturnType<typeof postgres> | undefined;
  try {
    const journal = JSON.parse(
      await readFile(resolve("lib/db/migrations/meta/_journal.json"), "utf8")
    ) as { entries: Array<{ when: number; tag: string }> };
    const repoHead = journal.entries.at(-1)?.tag;
    if (!repoHead) {
      throw new Error("repository_migration_head_missing");
    }
    const client = postgres(connectionString, { max: 1, connect_timeout: 5 });
    sql = client;
    const actualRows = await client<
      { database: string }[]
    >`select current_database() as database`;
    const actualDatabase = actualRows[0]?.database;
    if (!actualDatabase) {
      throw new Error("database_identity_unavailable");
    }
    if (!preflightOnly) {
      assertExpectedDatabase(actualDatabase, expectedDatabase ?? "");
    }
    const summary = await createMigrationPreflight({
      target: () => ({ ...configuredTarget, database: actualDatabase }),
      async ledger() {
        const relations = await client<{ ledger: string | null }[]>`
          select to_regclass('drizzle.__drizzle_migrations')::text as ledger
        `;
        if (!relations[0]?.ledger) {
          return resolveMigrationLedger({
            timestamp: null,
            journal: journal.entries,
          });
        }
        const rows = await client<{ created_at: string | number }[]>`
          select created_at
          from "drizzle"."__drizzle_migrations"
          order by created_at desc
          limit 1
        `;
        const timestamp = rows[0] ? Number(rows[0].created_at) : null;
        if (timestamp !== null && !Number.isSafeInteger(timestamp)) {
          return {
            ledgerLatest: `unknown-ledger-entry:${String(rows[0]?.created_at)}`,
            ledgerStatus: "unknown" as const,
          };
        }
        return resolveMigrationLedger({ timestamp, journal: journal.entries });
      },
      repositoryHead: () => repoHead,
    });
    console.log(JSON.stringify(summary));
    if (summary.ledgerStatus === "unknown") {
      throw new Error("migration_ledger_timestamp_unknown");
    }
    if (!preflightOnly) {
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: "./lib/db/migrations" });
      console.log("Migration operation completed.");
    }
  } catch {
    console.error(
      "Migration preflight or execution failed. Connection details were withheld."
    );
    process.exitCode = 1;
  } finally {
    await sql?.end({ timeout: 2 });
  }
}

main().catch(() => {
  console.error(
    "Migration preflight or execution failed. Connection details were withheld."
  );
  process.exitCode = 1;
});
