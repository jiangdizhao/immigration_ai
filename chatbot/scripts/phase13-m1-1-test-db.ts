/**
 * Guarded operator for the disposable Phase 13 M1.1 PostgreSQL database.
 *
 * The only destructive target is immigration_ai_phase13_m1_1_test. The URL
 * must be supplied explicitly through PHASE13_M1_1_TEST_DATABASE_URL and must
 * resolve to a local loopback PostgreSQL server. No fallback to POSTGRES_URL
 * is permitted.
 *
 * Usage:
 *   pnpm exec tsx scripts/phase13-m1-1-test-db.ts status
 *   pnpm exec tsx scripts/phase13-m1-1-test-db.ts reset
 *   pnpm exec tsx scripts/phase13-m1-1-test-db.ts migrate
 */

import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

loadEnv({ path: resolve(".env.local") });

export const ISOLATED_TEST_DATABASE = "immigration_ai_phase13_m1_1_test";
const MAINTENANCE_DATABASE = "postgres";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function configuredTarget(): URL {
  const configured = process.env.PHASE13_M1_1_TEST_DATABASE_URL?.trim();
  if (!configured) {
    throw new Error("isolated_database_url_missing");
  }
  const parsed = new URL(configured);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.pathname.replace(/^\//u, "") !== ISOLATED_TEST_DATABASE ||
    !LOOPBACK_HOSTS.has(parsed.hostname)
  ) {
    throw new Error("isolated_database_target_rejected");
  }
  return parsed;
}

function targetUrl() {
  return configuredTarget().toString();
}

function maintenanceUrl() {
  const parsed = configuredTarget();
  parsed.pathname = `/${MAINTENANCE_DATABASE}`;
  return parsed.toString();
}

function safeTargetDescription(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//u, ""),
  };
}

function quoteIdentifier(value: string) {
  if (!/^[a-z0-9_]+$/u.test(value)) {
    throw new Error("unsafe_database_identifier");
  }
  return `"${value}"`;
}

async function assertActualDatabase(
  client: ReturnType<typeof postgres>,
  expected: string
) {
  const rows = await client<{ database: string }[]>`
    select current_database() as database
  `;
  if (rows[0]?.database !== expected) {
    throw new Error("connected_database_identity_mismatch");
  }
}

async function reset() {
  const client = postgres(maintenanceUrl(), {
    max: 1,
    connect_timeout: 5,
  });
  try {
    await assertActualDatabase(client, MAINTENANCE_DATABASE);
    await client.unsafe(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(ISOLATED_TEST_DATABASE)} WITH (FORCE)`
    );
    await client.unsafe(
      `CREATE DATABASE ${quoteIdentifier(ISOLATED_TEST_DATABASE)}`
    );
  } finally {
    await client.end({ timeout: 5 });
  }

  const target = postgres(targetUrl(), { max: 1, connect_timeout: 5 });
  try {
    await assertActualDatabase(target, ISOLATED_TEST_DATABASE);
  } finally {
    await target.end({ timeout: 5 });
  }
  console.log(
    JSON.stringify({
      event: "phase13_m1_1_test_database_reset",
      target: safeTargetDescription(targetUrl()),
      schema: "empty",
    })
  );
}

async function migrateTarget() {
  const client = postgres(targetUrl(), { max: 1, connect_timeout: 5 });
  try {
    await assertActualDatabase(client, ISOLATED_TEST_DATABASE);
    await migrate(drizzle(client), {
      migrationsFolder: resolve("lib/db/migrations"),
    });
    const rows = await client<{ count: string }[]>`
      select count(*)::text as count from drizzle.__drizzle_migrations
    `;
    console.log(
      JSON.stringify({
        event: "phase13_m1_1_test_database_migrated",
        target: safeTargetDescription(targetUrl()),
        appliedMigrations: Number(rows[0]?.count ?? 0),
      })
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function status() {
  const client = postgres(maintenanceUrl(), {
    max: 1,
    connect_timeout: 5,
  });
  try {
    await assertActualDatabase(client, MAINTENANCE_DATABASE);
    const rows = await client<{ exists: boolean }[]>`
      select exists (
        select 1 from pg_database where datname = ${ISOLATED_TEST_DATABASE}
      ) as exists
    `;
    const exists = rows[0]?.exists === true;
    let publicTables = 0;
    if (exists) {
      const target = postgres(targetUrl(), { max: 1, connect_timeout: 5 });
      try {
        await assertActualDatabase(target, ISOLATED_TEST_DATABASE);
        const tableRows = await target<{ count: string }[]>`
          select count(*)::text as count
          from information_schema.tables
          where table_schema = 'public'
        `;
        publicTables = Number(tableRows[0]?.count ?? 0);
      } finally {
        await target.end({ timeout: 5 });
      }
    }
    console.log(
      JSON.stringify({
        event: "phase13_m1_1_test_database_status",
        target: safeTargetDescription(targetUrl()),
        exists,
        publicTables,
      })
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function main() {
  const command = process.argv[2] ?? "status";
  switch (command) {
    case "reset":
      await reset();
      return;
    case "migrate":
      await migrateTarget();
      return;
    case "status":
      await status();
      return;
    default:
      throw new Error("unknown_test_database_command");
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error &&
    [
      "isolated_database_url_missing",
      "isolated_database_target_rejected",
      "connected_database_identity_mismatch",
      "unsafe_database_identifier",
    ].includes(error.message)
      ? error.message
      : "operation_failed; connection details withheld";
  console.error(
    JSON.stringify({
      event: "phase13_m1_1_test_database_failed",
      message,
    })
  );
  process.exitCode = 1;
});
