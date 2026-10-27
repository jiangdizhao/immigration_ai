import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  assertM4DockerIdentity,
  assertM4MigrationLedger,
  expectedM4Migration,
  M4_002_TEST_TARGET,
  type M4MigrationJournal,
  parseM4DatabaseUrl,
  parseM4DockerContainerInspection,
  parseM4DockerImageInspection,
  requireM4IntegrationApproval,
} from "./phase13-m4-002-db-test-guard";

const chatbotRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readDockerField(args: string[]) {
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

function verifyDockerContainer() {
  const containerOutput = readDockerField([
    "inspect",
    "--format",
    '{{.Name}}|{{.Image}}|{{.Config.Image}}|{{.State.Running}}|{{range $port, $bindings := .NetworkSettings.Ports}}{{range $bindings}}{{$port}}~{{.HostIp}}~{{.HostPort}};{{end}}{{end}}|{{index .Config.Labels "immigration-ai.phase13"}}|{{index .HostConfig.Tmpfs "/var/lib/postgresql/data"}}|END',
    M4_002_TEST_TARGET.container,
  ]);
  const mountsOutput = readDockerField([
    "inspect",
    "--format",
    "{{json .Mounts}}",
    M4_002_TEST_TARGET.container,
  ]);
  const container = parseM4DockerContainerInspection(
    containerOutput,
    mountsOutput
  );
  const imageOutput = readDockerField([
    "image",
    "inspect",
    "--format",
    "{{.Id}}|{{json .RepoDigests}}",
    container.Image ?? "",
  ]);
  const image = parseM4DockerImageInspection(imageOutput);
  assertM4DockerIdentity(container, image);
}

async function verifyDatabase(rawUrl: string) {
  const parsedUrl = parseM4DatabaseUrl(rawUrl);
  const journalPath = resolve(
    chatbotRoot,
    "lib/db/migrations/meta/_journal.json"
  );
  const migrationPath = resolve(
    chatbotRoot,
    "lib/db/migrations/0041_phase13_m4_002_staff_assignments.sql"
  );
  const journal = JSON.parse(
    await readFile(journalPath, "utf8")
  ) as M4MigrationJournal;
  const migrationSql = await readFile(migrationPath, "utf8");
  const expected = expectedM4Migration(journal, migrationSql);

  const sql = postgres(rawUrl, {
    max: 1,
    connect_timeout: 5,
    connection: { TimeZone: "UTC" },
    onnotice: () => undefined,
  });
  try {
    const [identity] = await sql<
      { database: string; role: string; serverVersion: number }[]
    >`
      select current_database() as database,
             current_user as role,
             current_setting('server_version_num')::int as "serverVersion"
    `;
    if (
      identity?.database !== parsedUrl.database ||
      identity.role !== parsedUrl.role ||
      identity.serverVersion < 170_000 ||
      identity.serverVersion >= 180_000
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
    assertM4MigrationLedger({
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

async function runIntegrationChild(rawUrl: string) {
  const env = {
    ...process.env,
    POSTGRES_URL: rawUrl,
    PHASE13_M4_002_TEST_RUNNER_VERIFIED: "1",
    PHASE13_PROJECT_STAFF_ASSIGNMENT_ENABLED: "",
  };
  const child = spawn(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--test",
      "lib/db/project-staff-assignment.integration.test.ts",
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
  requireM4IntegrationApproval(process.env.PHASE13_M4_002_TEST_APPROVAL);
  const rawUrl = process.env.PHASE13_M4_002_TEST_DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new Error("M4-002 test-specific database URL is missing");
  }
  parseM4DatabaseUrl(rawUrl);
  verifyDockerContainer();
  await verifyDatabase(rawUrl);
  await runIntegrationChild(rawUrl);
}

main().catch(() => {
  console.error(
    "M4-002 integration guard stopped execution; target details were not printed."
  );
  process.exitCode = 1;
});
