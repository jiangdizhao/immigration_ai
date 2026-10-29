import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  assertM4_004_ChildEnvironment,
  assertM4_004_DatabaseIdentity,
  assertM4_004_DockerIdentity,
  assertM4_004_MigrationLedger,
  buildM4_004_ChildEnvironment,
  expectedM4_004_Migration,
  type M4_004_MigrationJournal,
  M4_004_RUNNER_ENVIRONMENT_FLAG,
  M4_004_TEST_APPROVAL,
  M4_004_TEST_TARGET,
  parseM4_004_DatabaseIdentity,
  parseM4_004_DatabaseUrl,
  parseM4_004_DockerContainerInspection,
  parseM4_004_DockerImageInspection,
  parseM4_004_MigrationLedger,
  requireM4_004_IntegrationApproval,
} from "./phase13-m4-004-db-test-guard";

/**
 * Guarded M4-004 PostgreSQL integration launcher (R2-04).
 *
 * Fail-closed preflight order:
 *   1. explicit owner approval token;
 *   2. exact approved loopback URL (host/port/database/role, no extra params);
 *   3. Docker container identity, image tag, labels, port binding, tmpfs data dir;
 *   4. server database/role, PostgreSQL major version, restricted role privileges;
 *   5. applied Drizzle ledger head, tied to the pinned Migration 0043 bytes;
 *   6. child environment derived from the approved URL and re-verified, so
 *      `POSTGRES_URL` (required by the runtime repositories) can only point at the
 *      approved isolated database and no inherited business target survives.
 *
 * It applies no migrations, creates no container and never prints the URL, a
 * password or a driver error. This script is NOT executed by the R2 correction
 * task; it requires separate owner authorization for the exact isolated target.
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
  const container = parseM4_004_DockerContainerInspection(
    inspectDocker(["inspect", M4_004_TEST_TARGET.container])
  );
  const image = parseM4_004_DockerImageInspection(
    inspectDocker(["image", "inspect", container.Image ?? ""])
  );
  const observed = assertM4_004_DockerIdentity(container, image);
  // Not a secret: recording the digest lets the owner pin it for later runs.
  console.error(`M4_004_INTEGRATION_IMAGE_ID: ${observed.imageId}`);
  return observed;
}

async function verifyDatabaseTarget(rawUrl: string) {
  const parsedUrl = parseM4_004_DatabaseUrl(rawUrl);
  const journal = JSON.parse(
    await readFile(
      resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json"),
      "utf8"
    )
  ) as M4_004_MigrationJournal;
  const migrationSql = await readFile(
    resolve(chatbotRoot, M4_004_TEST_TARGET.migrationSqlPath),
    "utf8"
  );
  const expected = expectedM4_004_Migration(journal, migrationSql);
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
             has_schema_privilege(current_user, 'public', 'CREATE') as "canCreateSchemaPublic"
      from pg_roles role_row where role_row.rolname = current_user
    `;
    assertM4_004_DatabaseIdentity(
      parseM4_004_DatabaseIdentity(identityRow),
      parsedUrl
    );
    const [ledgerRow] = await sql<Record<string, unknown>[]>`
      select
        (select count(*)::int from drizzle.__drizzle_migrations) as "rowCount",
        (select id::int from drizzle.__drizzle_migrations order by id desc limit 1) as "latestId",
        (select hash from drizzle.__drizzle_migrations order by id desc limit 1) as "latestHash",
        (select created_at::text from drizzle.__drizzle_migrations order by id desc limit 1) as "latestCreatedAt"
    `;
    assertM4_004_MigrationLedger({
      expected,
      ledger: parseM4_004_MigrationLedger(ledgerRow),
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  return expected;
}

async function runIntegrationSuite(rawUrl: string) {
  // R2-04: `POSTGRES_URL` is required by the runtime repositories, so it is set
  // to the approved URL instead of being cleared, and the environment is
  // re-verified before the child starts.
  const env = buildM4_004_ChildEnvironment({
    approvedUrl: rawUrl,
    baseEnv: process.env,
  });
  assertM4_004_ChildEnvironment(env, rawUrl);
  const child = spawn(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--test",
      "lib/db/service-engagement.integration.test.ts",
    ],
    {
      cwd: chatbotRoot,
      // The project augments `ProcessEnv`; NODE_ENV is inherited from the parent
      // environment and is not part of the guard's portable env contract.
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
  // The approval TOKEN is `M4_004_TEST_APPROVAL`; the environment VARIABLE that
  // carries it is `PHASE13_M4_004_TEST_APPROVAL`. Using the token as an env key
  // would read a variable literally named `RUN_M4_004_POSTGRES_INTEGRATION` and
  // fail closed even for an approved run.
  requireM4_004_IntegrationApproval(process.env.PHASE13_M4_004_TEST_APPROVAL);
  const rawUrl = process.env.PHASE13_M4_004_TEST_DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new Error("M4-004 integration target URL is missing");
  }
  parseM4_004_DatabaseUrl(rawUrl);
  verifyDockerTarget();
  const expected = await verifyDatabaseTarget(rawUrl);
  console.error(`M4_004_INTEGRATION_MIGRATION_SHA256: ${expected.hash}`);
  console.error(
    `M4_004_INTEGRATION_APPROVAL: ${M4_004_TEST_APPROVAL} (present, runner=${M4_004_RUNNER_ENVIRONMENT_FLAG})`
  );
  await runIntegrationSuite(rawUrl);
}

main().catch(() => {
  // Never print the environment, connection URL, driver error or secrets.
  console.error("M4-004 guarded PostgreSQL test preflight failed closed");
  process.exitCode = 1;
});
