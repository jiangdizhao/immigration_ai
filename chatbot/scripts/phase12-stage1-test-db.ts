/**
 * Phase 12 Stage 1 isolated test-database operator.
 *
 * Destructive database work for this Stage runs ONLY against the fixed
 * disposable database below. The authoritative development database
 * (`immigration_legal`) is never written by this script.
 *
 * Usage:
 *   pnpm exec tsx scripts/phase12-stage1-test-db.ts status
 *   pnpm exec tsx scripts/phase12-stage1-test-db.ts create
 *   pnpm exec tsx scripts/phase12-stage1-test-db.ts migrate
 *   pnpm exec tsx scripts/phase12-stage1-test-db.ts drop --confirm-drop
 *
 * The connection string is read from POSTGRES_URL / .env.local and is never
 * printed. Only host, port and database name are reported.
 */

import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

loadEnv({ path: resolve(".env.local") });

export const ISOLATED_TEST_DATABASE = "immigration_ai_phase12_stage1_test";
const MAINTENANCE_DATABASE = "postgres";

function adminUrl(): string {
  const configured = process.env.POSTGRES_URL?.trim();
  if (!configured) {
    throw new Error("POSTGRES_URL is not configured");
  }
  const parsed = new URL(configured);
  parsed.pathname = `/${MAINTENANCE_DATABASE}`;
  return parsed.toString();
}

function isolatedUrl(): string {
  const configured = process.env.POSTGRES_URL?.trim();
  if (!configured) {
    throw new Error("POSTGRES_URL is not configured");
  }
  const parsed = new URL(configured);
  parsed.pathname = `/${ISOLATED_TEST_DATABASE}`;
  return parsed.toString();
}

function describe(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//u, ""),
  };
}

function quoteIdentifier(value: string) {
  if (!/^[a-z0-9_]+$/u.test(value)) {
    throw new Error("unsafe database identifier");
  }
  return `"${value}"`;
}

async function databaseExists(): Promise<boolean> {
  const client = postgres(adminUrl(), { max: 1, connect_timeout: 5 });
  try {
    const rows = await client<{ exists: boolean }[]>`
      select exists(select 1 from pg_database where datname = ${ISOLATED_TEST_DATABASE}) as exists
    `;
    return rows[0]?.exists === true;
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function create() {
  const client = postgres(adminUrl(), { max: 1, connect_timeout: 5 });
  try {
    // A fresh disposable database every run keeps destructive tests honest.
    await client.unsafe(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(ISOLATED_TEST_DATABASE)}`
    );
    await client.unsafe(
      `CREATE DATABASE ${quoteIdentifier(ISOLATED_TEST_DATABASE)}`
    );
  } finally {
    await client.end({ timeout: 5 });
  }
  console.log(
    JSON.stringify({
      event: "phase12_test_db_created",
      target: describe(isolatedUrl()),
    })
  );
}

async function drop() {
  if (!process.argv.includes("--confirm-drop")) {
    throw new Error("drop requires --confirm-drop");
  }
  const client = postgres(adminUrl(), { max: 1, connect_timeout: 5 });
  try {
    await client.unsafe(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(ISOLATED_TEST_DATABASE)} WITH (FORCE)`
    );
  } finally {
    await client.end({ timeout: 5 });
  }
  console.log(
    JSON.stringify({
      event: "phase12_test_db_dropped",
      target: describe(isolatedUrl()),
    })
  );
}

async function applyMigrations() {
  const client = postgres(isolatedUrl(), { max: 1, connect_timeout: 5 });
  try {
    const identity = await client<{ database: string }[]>`
      select current_database() as database
    `;
    if (identity[0]?.database !== ISOLATED_TEST_DATABASE) {
      throw new Error(
        "refusing to migrate a database that is not the isolated test target"
      );
    }
    await migrate(drizzle(client), {
      migrationsFolder: resolve("lib/db/migrations"),
    });
    const applied = await client<{ count: string }[]>`
      select count(*)::text as count from drizzle.__drizzle_migrations
    `;
    console.log(
      JSON.stringify({
        event: "phase12_test_db_migrated",
        target: describe(isolatedUrl()),
        appliedMigrations: Number(applied[0]?.count ?? 0),
      })
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function status() {
  const exists = await databaseExists();
  let tables = 0;
  if (exists) {
    const client = postgres(isolatedUrl(), { max: 1, connect_timeout: 5 });
    try {
      const rows = await client<{ count: string }[]>`
        select count(*)::text as count
        from information_schema.tables
        where table_schema = 'public'
      `;
      tables = Number(rows[0]?.count ?? 0);
    } finally {
      await client.end({ timeout: 5 });
    }
  }
  console.log(
    JSON.stringify({
      event: "phase12_test_db_status",
      target: describe(isolatedUrl()),
      exists,
      publicTables: tables,
    })
  );
}

async function main() {
  const command = process.argv[2] ?? "status";
  switch (command) {
    case "create":
      await create();
      return;
    case "migrate":
      await applyMigrations();
      return;
    case "drop":
      await drop();
      return;
    case "status":
      await status();
      return;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "phase12_test_db_failed",
      message: error instanceof Error ? error.message : "unknown_error",
    })
  );
  process.exitCode = 1;
});
