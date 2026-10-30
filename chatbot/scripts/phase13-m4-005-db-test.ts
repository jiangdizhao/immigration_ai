import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  assertM4_005_ChildEnvironment,
  assertM4_005_DatabaseIdentity,
  assertM4_005_DockerIdentity,
  assertM4_005_MigrationLedger,
  buildM4_005_ChildEnvironment,
  expectedM4_005_Migration,
  M4_005_APPROVAL_ENVIRONMENT_VARIABLE,
  M4_005_RUNNER_ENVIRONMENT_FLAG,
  M4_005_TEST_APPROVAL,
  M4_005_TEST_TARGET,
  parseM4_005_DatabaseIdentity,
  parseM4_005_DatabaseUrl,
  parseM4_005_DockerContainerInspection,
  parseM4_005_DockerImageInspection,
  parseM4_005_MigrationJournal,
  parseM4_005_MigrationLedger,
  requireM4_005_IntegrationApproval,
} from "./phase13-m4-005-db-test-guard";

/**
 * Guarded M4-005 PostgreSQL integration launcher.
 *
 * PROPOSED TARGET ONLY. Creating `phase13-m4-005-pg`, applying Migration 0044
 * and running this launcher each require separate explicit owner authorization.
 * This file is written and offline-tested only; it has never been executed
 * against a database and it applies no migrations itself.
 *
 * Fail-closed preflight order:
 *   1. explicit owner approval token;
 *   2. exact approved loopback URL (host/port/database/role, no extra params);
 *   3. Docker container identity, image tag, labels, port binding, tmpfs data dir;
 *   4. server database/role, PostgreSQL major version, restricted role privileges
 *      including SELECT-only Drizzle ledger access;
 *   5. applied ledger head tied to the pinned Migration 0044 bytes;
 *   6. child environment derived from the approved URL and re-verified, so
 *      `POSTGRES_URL` can only point at the approved isolated database.
 */
const chatbotRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function inspectDocker(args: string[]) {
  const result = spawnSync("docker", args, {
    cwd: chatbotRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error("Docker identity inspection failed");
  }
  return result.stdout.trim();
}

function verifyDockerTarget() {
  const container = parseM4_005_DockerContainerInspection(
    inspectDocker(["inspect", M4_005_TEST_TARGET.container])
  );
  const image = parseM4_005_DockerImageInspection(
    inspectDocker(["image", "inspect", container.Image ?? ""])
  );
  const observed = assertM4_005_DockerIdentity(container, image);
  // Not a secret: recording the digest lets the owner pin it for later runs.
  console.error(`M4_005_INTEGRATION_IMAGE_ID: ${observed.imageId}`);
  return observed;
}

async function verifyDatabaseTarget(rawUrl: string) {
  const parsedUrl = parseM4_005_DatabaseUrl(rawUrl);
  const journal = parseM4_005_MigrationJournal(
    await readFile(
      resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json"),
      "utf8"
    )
  );
  const migrationSql = await readFile(
    resolve(chatbotRoot, M4_005_TEST_TARGET.migrationSqlPath),
    "utf8"
  );
  const expected = expectedM4_005_Migration(journal, migrationSql);
  const sql = postgres(rawUrl, {
    connection: { TimeZone: "UTC" },
    connect_timeout: 5,
    max: 1,
    onnotice: () => undefined,
  });
  try {
    const [identityRow] = await sql<Record<string, unknown>[]>`
      select current_database() as database,
             current_user as role,
             current_setting('server_version_num')::int as "serverVersionNum",
             role_row.rolcanlogin as "canLogin",
             role_row.rolsuper as "isSuperuser",
             role_row.rolcreatedb as "canCreateDatabase",
             role_row.rolcreaterole as "canCreateRole",
             has_schema_privilege(current_user, 'public', 'CREATE') as "canCreateSchemaPublic",
             has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'INSERT') as "ledgerInsert",
             has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'UPDATE') as "ledgerUpdate",
             has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'DELETE') as "ledgerDelete",
             has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'TRUNCATE') as "ledgerTruncate"
      from pg_roles role_row where role_row.rolname = current_user
    `;
    assertM4_005_DatabaseIdentity(
      parseM4_005_DatabaseIdentity(identityRow),
      parsedUrl
    );
    const [ledgerRow] = await sql<Record<string, unknown>[]>`
      select
        (select count(*)::int from drizzle.__drizzle_migrations) as "rowCount",
        (select id::int from drizzle.__drizzle_migrations order by id desc limit 1) as "latestId",
        (select hash from drizzle.__drizzle_migrations order by id desc limit 1) as "latestHash",
        (select created_at::text from drizzle.__drizzle_migrations order by id desc limit 1) as "latestCreatedAt",
        (select coalesce(
           json_agg(json_build_object('id', id::int, 'createdAt', created_at::text)
                    order by id),
           '[]'::json)
           from drizzle.__drizzle_migrations) as "history"
    `;
    assertM4_005_MigrationLedger({
      expected,
      ledger: parseM4_005_MigrationLedger(ledgerRow),
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  return expected;
}

async function runIntegrationSuite(rawUrl: string) {
  const env = buildM4_005_ChildEnvironment({
    approvedUrl: rawUrl,
    baseEnv: process.env,
  });
  assertM4_005_ChildEnvironment(env, rawUrl);
  const child = spawn(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--test",
      "lib/db/service-payment.integration.test.ts",
    ],
    {
      cwd: chatbotRoot,
      env: env as NodeJS.ProcessEnv,
      stdio: "inherit",
    }
  );
  const code = await new Promise<number>((resolveExit, reject) => {
    child.once("error", () =>
      reject(new Error("Integration test process failed to start"))
    );
    child.once("exit", (exitCode, signal) => {
      resolveExit(signal ? 1 : (exitCode ?? 1));
    });
  });
  process.exitCode = code;
}

async function main() {
  // The approval TOKEN is `M4_005_TEST_APPROVAL`; the environment VARIABLE that
  // carries it is `PHASE13_M4_005_TEST_APPROVAL`.
  requireM4_005_IntegrationApproval(
    process.env[M4_005_APPROVAL_ENVIRONMENT_VARIABLE]
  );
  const rawUrl = process.env.PHASE13_M4_005_TEST_DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new Error("M4-005 integration target URL is missing");
  }
  parseM4_005_DatabaseUrl(rawUrl);
  verifyDockerTarget();
  const expected = await verifyDatabaseTarget(rawUrl);
  console.error(`M4_005_INTEGRATION_MIGRATION_SHA256: ${expected.hash}`);
  console.error(
    `M4_005_INTEGRATION_APPROVAL: ${M4_005_TEST_APPROVAL} (present, runner=${M4_005_RUNNER_ENVIRONMENT_FLAG})`
  );
  await runIntegrationSuite(rawUrl);
}

main().catch(() => {
  // Never print the environment, connection URL, driver error or secrets.
  console.error("M4-005 guarded PostgreSQL test preflight failed closed");
  process.exitCode = 1;
});
