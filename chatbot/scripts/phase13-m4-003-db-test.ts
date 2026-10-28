import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  assertM4_003_DockerIdentity,
  assertM4_003_MigrationLedger,
  expectedM4_003_Migration,
  type M4_003_MigrationJournal,
  M4_003_TEST_APPROVAL,
  M4_003_TEST_TARGET,
  parseM4_003_DatabaseUrl,
  parseM4_003_DockerContainerInspection,
  parseM4_003_DockerImageInspection,
  requireM4_003_IntegrationApproval,
} from "./phase13-m4-003-db-test-guard";

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
  const rawContainer = inspectDocker(["inspect", M4_003_TEST_TARGET.container]);
  const container = parseM4_003_DockerContainerInspection(rawContainer);
  const rawImage = inspectDocker(["image", "inspect", container.Image ?? ""]);
  const image = parseM4_003_DockerImageInspection(rawImage);
  assertM4_003_DockerIdentity(container, image);
}

async function verifyDatabaseTarget(rawUrl: string) {
  const parsedUrl = parseM4_003_DatabaseUrl(rawUrl);
  const journal = JSON.parse(
    await readFile(
      resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json"),
      "utf8"
    )
  ) as M4_003_MigrationJournal;
  const migrationSql = await readFile(
    resolve(
      chatbotRoot,
      "lib/db/migrations/0042_phase13_m4_003_human_messaging.sql"
    ),
    "utf8"
  );
  const expected = expectedM4_003_Migration(journal, migrationSql);
  const sql = postgres(rawUrl, {
    max: 1,
    connect_timeout: 5,
    connection: { TimeZone: "UTC" },
    onnotice: () => undefined,
  });
  try {
    const [identity] = await sql<
      {
        database: string;
        role: string;
        serverVersion: number;
        canLogin: boolean;
        isSuperuser: boolean;
        canCreateDatabase: boolean;
        canCreateRole: boolean;
      }[]
    >`
      select current_database() as database,
             current_user as role,
             current_setting('server_version_num')::int as "serverVersion",
             role_row.rolcanlogin as "canLogin",
             role_row.rolsuper as "isSuperuser",
             role_row.rolcreatedb as "canCreateDatabase",
             role_row.rolcreaterole as "canCreateRole"
      from pg_roles role_row where role_row.rolname = current_user
    `;
    if (
      identity?.database !== parsedUrl.database ||
      identity.role !== parsedUrl.role ||
      identity.serverVersion < 170_000 ||
      identity.serverVersion >= 180_000 ||
      identity.canLogin !== true ||
      identity.isSuperuser !== false ||
      identity.canCreateDatabase !== false ||
      identity.canCreateRole !== false
    ) {
      throw new Error("PostgreSQL server identity mismatch");
    }
    const [ledger] = await sql<
      {
        rowCount: number;
        latestId: number | null;
        latestHash: string | null;
        latestCreatedAt: string | null;
      }[]
    >`
      select
        (select count(*)::int from drizzle.__drizzle_migrations) as "rowCount",
        (select id::int from drizzle.__drizzle_migrations order by id desc limit 1) as "latestId",
        (select hash from drizzle.__drizzle_migrations order by id desc limit 1) as "latestHash",
        (select created_at::text from drizzle.__drizzle_migrations order by id desc limit 1) as "latestCreatedAt"
    `;
    if (!ledger?.latestId || !ledger.latestHash || !ledger.latestCreatedAt) {
      throw new Error("PostgreSQL migration ledger is incomplete");
    }
    assertM4_003_MigrationLedger({
      rowCount: ledger.rowCount,
      latestId: ledger.latestId,
      latestHash: ledger.latestHash,
      latestCreatedAt: Number(ledger.latestCreatedAt),
      expected,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function runIntegrationSuite(rawUrl: string) {
  const env = {
    ...process.env,
    POSTGRES_URL: rawUrl,
    PHASE13_M4_003_TEST_DATABASE_URL: rawUrl,
    PHASE13_M4_003_TEST_APPROVAL: M4_003_TEST_APPROVAL,
    PHASE13_M4_003_TEST_RUNNER_VERIFIED: "1",
    PHASE13_PROJECT_HUMAN_MESSAGING_ENABLED: "",
  };
  const child = spawn(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--test",
      "lib/db/project-human-messaging.integration.test.ts",
    ],
    { cwd: chatbotRoot, env, stdio: "inherit" }
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
  requireM4_003_IntegrationApproval(process.env.PHASE13_M4_003_TEST_APPROVAL);
  const rawUrl = process.env.PHASE13_M4_003_TEST_DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new Error("M4-003 integration target URL is missing");
  }
  parseM4_003_DatabaseUrl(rawUrl);
  verifyDockerTarget();
  await verifyDatabaseTarget(rawUrl);
  await runIntegrationSuite(rawUrl);
}

main().catch(() => {
  // Never print the environment, connection URL, database driver error, or secrets.
  console.error("M4-003 guarded PostgreSQL test preflight failed closed");
  process.exitCode = 1;
});
