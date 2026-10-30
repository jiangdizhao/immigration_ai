import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertM4_004_ChildEnvironment,
  assertM4_004_DatabaseIdentity,
  assertM4_004_DockerIdentity,
  assertM4_004_MigrationLedger,
  buildM4_004_ChildEnvironment,
  expectedM4_004_Migration,
  M4_004_RUNNER_ENVIRONMENT_FLAG,
  M4_004_TEST_APPROVAL,
  M4_004_TEST_TARGET,
  parseM4_004_DatabaseIdentity,
  parseM4_004_DatabaseUrl,
  parseM4_004_DockerContainerInspection,
  parseM4_004_DockerImageInspection,
  parseM4_004_MigrationJournal,
  parseM4_004_MigrationLedger,
  requireM4_004_IntegrationApproval,
} from "./phase13-m4-004-db-test-guard";

const APPROVED_URL =
  `postgres://${M4_004_TEST_TARGET.role}:placeholder@${M4_004_TEST_TARGET.host}` +
  `:${M4_004_TEST_TARGET.port}/${M4_004_TEST_TARGET.database}`;

function containerInspection(
  overrides: {
    name?: string;
    image?: string;
    imageRef?: string;
    running?: boolean;
    label?: string;
    hostPort?: string;
    tmpfs?: Record<string, string>;
    binds?: string[];
  } = {}
) {
  const port = overrides.hostPort ?? M4_004_TEST_TARGET.port;
  return JSON.stringify([
    {
      Config: {
        Image: overrides.image ?? M4_004_TEST_TARGET.image,
        Labels:
          overrides.label === undefined
            ? {
                [M4_004_TEST_TARGET.dockerLabel]:
                  M4_004_TEST_TARGET.dockerLabelValue,
              }
            : { [M4_004_TEST_TARGET.dockerLabel]: overrides.label },
      },
      HostConfig: {
        Binds: overrides.binds ?? [],
        Mounts: [],
        PortBindings: {
          [M4_004_TEST_TARGET.containerPort]: [
            { HostIp: M4_004_TEST_TARGET.host, HostPort: port },
          ],
        },
        Tmpfs: overrides.tmpfs ?? {
          [M4_004_TEST_TARGET.dataDirectory]: M4_004_TEST_TARGET.tmpfsOptions,
        },
      },
      Image:
        overrides.imageRef ??
        "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      Mounts: [],
      Name: overrides.name ?? `/${M4_004_TEST_TARGET.container}`,
      NetworkSettings: {
        Ports: {
          [M4_004_TEST_TARGET.containerPort]: [
            { HostIp: M4_004_TEST_TARGET.host, HostPort: port },
          ],
        },
      },
      State: { Running: overrides.running ?? true },
    },
  ]);
}

const IMAGE_INSPECTION = JSON.stringify([
  {
    Id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    RepoDigests: [
      "postgres@sha256:2222222222222222222222222222222222222222222222222222222222222222",
    ],
  },
]);

const identity = (overrides: Record<string, unknown> = {}) => ({
  canCreateDatabase: false,
  canCreateRole: false,
  canCreateSchemaPublic: false,
  canLogin: true,
  database: M4_004_TEST_TARGET.database,
  isSuperuser: false,
  role: M4_004_TEST_TARGET.role,
  serverVersionNum: 170_004,
  ...overrides,
});

test("only the exact proposed loopback M4-004 target parses", () => {
  assert.deepEqual(parseM4_004_DatabaseUrl(APPROVED_URL), {
    database: M4_004_TEST_TARGET.database,
    host: M4_004_TEST_TARGET.host,
    port: M4_004_TEST_TARGET.port,
    role: M4_004_TEST_TARGET.role,
  });
  const rejected = [
    APPROVED_URL.replace("55444", "55433"),
    APPROVED_URL.replace("55444", "5432"),
    APPROVED_URL.replace(M4_004_TEST_TARGET.database, "immigration_legal"),
    APPROVED_URL.replace(M4_004_TEST_TARGET.role, "phase13_m4_003_tester"),
    `${APPROVED_URL}?sslmode=require`,
    `${APPROVED_URL}#fragment`,
    "mysql://user:pass@127.0.0.1:55444/db",
    `postgres://${M4_004_TEST_TARGET.role}@127.0.0.1:55444/${M4_004_TEST_TARGET.database}`,
    "not-a-url",
  ];
  for (const url of rejected) {
    assert.throws(() => parseM4_004_DatabaseUrl(url), url);
  }
});

test("the approval token is mandatory", () => {
  assert.throws(() => requireM4_004_IntegrationApproval(undefined));
  assert.throws(() => requireM4_004_IntegrationApproval("WRONG"));
  assert.doesNotThrow(() =>
    requireM4_004_IntegrationApproval(M4_004_TEST_APPROVAL)
  );
});

test("container identity is exact and fail-closed", () => {
  const okContainer = parseM4_004_DockerContainerInspection(
    containerInspection()
  );
  const okImage = parseM4_004_DockerImageInspection(IMAGE_INSPECTION);
  assert.match(
    assertM4_004_DockerIdentity(okContainer, okImage).imageId,
    /^sha256:[0-9a-f]{64}$/u
  );

  const cases: [string, string, string][] = [
    [
      "wrong name",
      containerInspection({ name: "/other-pg" }),
      IMAGE_INSPECTION,
    ],
    [
      "wrong tag",
      containerInspection({ image: "postgres:16" }),
      IMAGE_INSPECTION,
    ],
    ["stopped", containerInspection({ running: false }), IMAGE_INSPECTION],
    [
      "wrong label",
      containerInspection({ label: "m4-003-isolated-test" }),
      IMAGE_INSPECTION,
    ],
    ["missing label", containerInspection({ label: "" }), IMAGE_INSPECTION],
    [
      "wrong host port",
      containerInspection({ hostPort: "55433" }),
      IMAGE_INSPECTION,
    ],
    [
      "bind-mounted data dir",
      containerInspection({ binds: ["/tmp/pgdata:/var/lib/postgresql/data"] }),
      IMAGE_INSPECTION,
    ],
    [
      "writable tmpfs",
      containerInspection({
        tmpfs: { [M4_004_TEST_TARGET.dataDirectory]: "rw,size=1g" },
      }),
      IMAGE_INSPECTION,
    ],
    [
      "image id mismatch",
      containerInspection(),
      JSON.stringify([
        {
          Id: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
          RepoDigests: [],
        },
      ]),
    ],
    [
      "malformed image id",
      containerInspection(),
      JSON.stringify([{ Id: "not-a-digest", RepoDigests: [] }]),
    ],
  ];
  for (const [label, rawContainer, rawImage] of cases) {
    assert.throws(
      () =>
        assertM4_004_DockerIdentity(
          parseM4_004_DockerContainerInspection(rawContainer),
          parseM4_004_DockerImageInspection(rawImage)
        ),
      label
    );
  }
  assert.throws(() =>
    parseM4_004_DockerContainerInspection(JSON.stringify([{ Name: "x" }]))
  );
  assert.throws(() => parseM4_004_DockerContainerInspection("{}"));
});

test("database identity enforces exact database, role, version and privilege", () => {
  const parsed = parseM4_004_DatabaseUrl(APPROVED_URL);
  assert.doesNotThrow(() =>
    assertM4_004_DatabaseIdentity(
      parseM4_004_DatabaseIdentity(identity()),
      parsed
    )
  );
  for (const overrides of [
    { database: "immigration_legal" },
    { role: "phase13_m4_003_tester" },
    { serverVersionNum: 160_009 },
    { serverVersionNum: 180_000 },
    { canLogin: false },
    { isSuperuser: true },
    { canCreateDatabase: true },
    { canCreateRole: true },
    { canCreateSchemaPublic: true },
  ]) {
    assert.throws(
      () =>
        assertM4_004_DatabaseIdentity(
          parseM4_004_DatabaseIdentity(identity(overrides)),
          parsed
        ),
      JSON.stringify(overrides)
    );
  }
  assert.throws(() => parseM4_004_DatabaseIdentity(undefined));
  assert.throws(() =>
    parseM4_004_DatabaseIdentity({ database: M4_004_TEST_TARGET.database })
  );
});

test("child environment carries the approved POSTGRES_URL and leaks nothing", () => {
  const env = buildM4_004_ChildEnvironment({
    approvedUrl: APPROVED_URL,
    baseEnv: {
      DATABASE_URL:
        "postgres://inherited:secret@127.0.0.1:5432/immigration_legal",
      PGURL: "postgres://inherited@127.0.0.1:5432/immigration_legal",
      PHASE13_M4_003_TEST_DATABASE_URL:
        "postgres://phase13_m4_003_tester:secret@127.0.0.1:55433/immigration_ai_phase13_m4_003_test",
      POSTGRES_URL:
        "postgres://inherited:secret@127.0.0.1:5432/immigration_legal",
      PATH: "/usr/bin",
    },
  });
  // R2-04: the runtime needs POSTGRES_URL, and it is the approved target.
  assert.equal(env.POSTGRES_URL, APPROVED_URL);
  assert.equal(env.PHASE13_M4_004_TEST_DATABASE_URL, APPROVED_URL);
  assert.equal(env[M4_004_RUNNER_ENVIRONMENT_FLAG], "1");
  assert.equal(env.PATH, "/usr/bin");
  for (const key of M4_004_TEST_TARGET.clearedChildEnvKeys) {
    assert.equal(env[key], "", key);
  }
  assert.doesNotThrow(() => assertM4_004_ChildEnvironment(env, APPROVED_URL));

  // Any surviving business/other target is refused.
  assert.throws(() =>
    assertM4_004_ChildEnvironment(
      {
        ...env,
        DATABASE_URL: "postgres://x:y@127.0.0.1:5432/immigration_legal",
      },
      APPROVED_URL
    )
  );
  assert.throws(() =>
    assertM4_004_ChildEnvironment(
      { ...env, POSTGRES_URL: env.POSTGRES_URL?.replace("55444", "5432") },
      APPROVED_URL
    )
  );
  assert.throws(() =>
    assertM4_004_ChildEnvironment(
      { ...env, [M4_004_RUNNER_ENVIRONMENT_FLAG]: "0" },
      APPROVED_URL
    )
  );
  assert.throws(() =>
    assertM4_004_ChildEnvironment(env, APPROVED_URL.replace("55444", "55433"))
  );
  // Building for a non-approved URL is refused before any spawn.
  assert.throws(() =>
    buildM4_004_ChildEnvironment({
      approvedUrl: "postgres://x:y@127.0.0.1:5432/immigration_legal",
      baseEnv: {},
    })
  );
});

test("the checked-in journal and Migration 0043 bytes match the pinned identity", () => {
  const chatbotRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const journal = parseM4_004_MigrationJournal(
    JSON.parse(
      readFileSync(
        resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json"),
        "utf8"
      )
    )
  );
  const migrationSql = readFileSync(
    resolve(chatbotRoot, M4_004_TEST_TARGET.migrationSqlPath),
    "utf8"
  );
  const expected = expectedM4_004_Migration(journal, migrationSql);
  assert.equal(expected.index, M4_004_TEST_TARGET.migrationIndex);
  assert.equal(expected.tag, M4_004_TEST_TARGET.migrationHead);
  assert.equal(expected.when, M4_004_TEST_TARGET.migrationWhen);
  assert.equal(expected.hash, M4_004_TEST_TARGET.migrationSqlSha256);
  // Later additive migrations (for example M4-005/0044) are permitted; the
  // pinned 0043 identity and the target ledger shape are what this guard owns.
  assert.ok(journal.entries.length >= M4_004_TEST_TARGET.migrationCount);

  // Any source drift is refused, so a run can only apply the reviewed bytes.
  assert.throws(() =>
    expectedM4_004_Migration(journal, `${migrationSql}\n-- changed`)
  );
  assert.throws(() => expectedM4_004_Migration({} as never, migrationSql));
  assert.throws(() =>
    expectedM4_004_Migration(
      {
        ...journal,
        entries: journal.entries.filter(
          (candidate) => candidate.idx !== M4_004_TEST_TARGET.migrationIndex
        ),
      },
      migrationSql
    )
  );

  const ledger = parseM4_004_MigrationLedger({
    latestCreatedAt: String(expected.when),
    latestHash: expected.hash,
    latestId: M4_004_TEST_TARGET.migrationCount,
    rowCount: M4_004_TEST_TARGET.migrationCount,
  });
  assert.doesNotThrow(() => assertM4_004_MigrationLedger({ expected, ledger }));
  for (const broken of [
    { ...ledger, rowCount: 43 },
    { ...ledger, latestId: 43 },
    { ...ledger, latestHash: "0".repeat(64) },
    { ...ledger, latestCreatedAt: expected.when - 1 },
  ]) {
    assert.throws(() =>
      assertM4_004_MigrationLedger({ expected, ledger: broken })
    );
  }
  assert.throws(() => parseM4_004_MigrationLedger({}));
});

test("the launcher reads the approved approval environment variable", () => {
  // Regression: the launcher must look up the environment VARIABLE
  // (`PHASE13_M4_004_TEST_APPROVAL`) rather than the token VALUE it compares
  // against, otherwise an approved run fails closed forever.
  const here = dirname(fileURLToPath(import.meta.url));
  const launcher = readFileSync(
    resolve(here, "phase13-m4-004-db-test.ts"),
    "utf8"
  );
  const guard = readFileSync(
    resolve(here, "phase13-m4-004-db-test-guard.ts"),
    "utf8"
  );

  assert.match(
    launcher,
    /requireM4_004_IntegrationApproval\(\s*process\.env\.PHASE13_M4_004_TEST_APPROVAL\s*\)/u
  );
  assert.equal(
    /process\.env\[M4_004_TEST_APPROVAL\]/u.test(launcher),
    false,
    "the approval token value must never be used as an environment variable name"
  );
  assert.match(launcher, /process\.env\.PHASE13_M4_004_TEST_DATABASE_URL/u);
  // The guard builds the child environment with that same variable name.
  assert.match(guard, /PHASE13_M4_004_TEST_APPROVAL: M4_004_TEST_APPROVAL/u);
  assert.equal(M4_004_TEST_APPROVAL, "RUN_M4_004_POSTGRES_INTEGRATION");
});
