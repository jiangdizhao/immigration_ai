import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
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

const here = dirname(fileURLToPath(import.meta.url));
const chatbotRoot = resolve(here, "..");
const APPROVED_URL =
  `postgres://${M4_005_TEST_TARGET.role}:placeholder@${M4_005_TEST_TARGET.host}` +
  `:${M4_005_TEST_TARGET.port}/${M4_005_TEST_TARGET.database}`;
const IMAGE_ID = `sha256:${"a".repeat(64)}`;

function containerInspection(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify([
    {
      Config: {
        Image: M4_005_TEST_TARGET.image,
        Labels: {
          [M4_005_TEST_TARGET.dockerLabel]: M4_005_TEST_TARGET.dockerLabelValue,
        },
      },
      HostConfig: {
        Binds: [],
        Mounts: [],
        PortBindings: {
          [M4_005_TEST_TARGET.containerPort]: [
            {
              HostIp: M4_005_TEST_TARGET.host,
              HostPort: M4_005_TEST_TARGET.port,
            },
          ],
        },
        Tmpfs: {
          [M4_005_TEST_TARGET.dataDirectory]: M4_005_TEST_TARGET.tmpfsOptions,
        },
      },
      Image: IMAGE_ID,
      Mounts: [],
      NetworkSettings: {
        Ports: {
          [M4_005_TEST_TARGET.containerPort]: [
            {
              HostIp: M4_005_TEST_TARGET.host,
              HostPort: M4_005_TEST_TARGET.port,
            },
          ],
        },
      },
      State: { Running: true },
      ...overrides,
    },
  ]);
}

function identityRow(overrides: Record<string, unknown> = {}) {
  return {
    canCreateDatabase: false,
    canCreateRole: false,
    canCreateSchemaPublic: false,
    canLogin: true,
    database: M4_005_TEST_TARGET.database,
    isSuperuser: false,
    ledgerDelete: false,
    ledgerInsert: false,
    ledgerTruncate: false,
    ledgerUpdate: false,
    role: M4_005_TEST_TARGET.role,
    serverVersionNum: 170_011,
    ...overrides,
  };
}

test("the approval token and its environment variable are distinct", () => {
  assert.equal(M4_005_TEST_APPROVAL, "RUN_M4_005_POSTGRES_INTEGRATION");
  assert.equal(
    M4_005_APPROVAL_ENVIRONMENT_VARIABLE,
    "PHASE13_M4_005_TEST_APPROVAL"
  );
  assert.notEqual(M4_005_TEST_APPROVAL, M4_005_APPROVAL_ENVIRONMENT_VARIABLE);
  requireM4_005_IntegrationApproval(M4_005_TEST_APPROVAL);
  assert.throws(() => requireM4_005_IntegrationApproval(undefined));
  // Passing the token as the variable NAME must fail closed.
  assert.throws(() =>
    requireM4_005_IntegrationApproval(M4_005_TEST_APPROVAL.toLowerCase())
  );
});

test("only the exact isolated loopback target URL is accepted", () => {
  assert.deepEqual(parseM4_005_DatabaseUrl(APPROVED_URL), {
    database: M4_005_TEST_TARGET.database,
    host: M4_005_TEST_TARGET.host,
    port: M4_005_TEST_TARGET.port,
    role: M4_005_TEST_TARGET.role,
  });
  const rejected = [
    APPROVED_URL.replace(":placeholder", ""),
    APPROVED_URL.replace(M4_005_TEST_TARGET.host, "localhost"),
    APPROVED_URL.replace(M4_005_TEST_TARGET.port, "5432"),
    APPROVED_URL.replace(M4_005_TEST_TARGET.port, "55444"),
    APPROVED_URL.replace(M4_005_TEST_TARGET.database, "immigration_legal"),
    APPROVED_URL.replace(M4_005_TEST_TARGET.role, "postgres"),
    `${APPROVED_URL}?sslmode=disable`,
    `${APPROVED_URL}#fragment`,
    "mysql://user:pw@127.0.0.1/db",
    "not a url",
  ];
  for (const candidate of rejected) {
    assert.throws(() => parseM4_005_DatabaseUrl(candidate), candidate);
  }
});

test("the M4-004 database is not the M4-005 target", () => {
  assert.notEqual(M4_005_TEST_TARGET.port, "55444");
  assert.notEqual(
    M4_005_TEST_TARGET.database,
    "immigration_ai_phase13_m4_004_test"
  );
  assert.notEqual(M4_005_TEST_TARGET.container, "phase13-m4-004-pg");
  assert.notEqual(M4_005_TEST_TARGET.role, "phase13_m4_004_tester");
});

test("the child environment is derived, marked and leak-free", () => {
  const env = buildM4_005_ChildEnvironment({
    approvedUrl: APPROVED_URL,
    baseEnv: {
      DATABASE_URL: "postgres://leak/other",
      HOME: "/home/test",
      PHASE13_M4_004_TEST_DATABASE_URL: "postgres://leak/four",
    },
  });
  assert.equal(env.POSTGRES_URL, APPROVED_URL);
  assert.equal(env.PHASE13_M4_005_TEST_DATABASE_URL, APPROVED_URL);
  assert.equal(env[M4_005_RUNNER_ENVIRONMENT_FLAG], "1");
  assert.equal(env.DATABASE_URL, "");
  assert.equal(env.PHASE13_M4_004_TEST_DATABASE_URL, "");
  assert.equal(env.PHASE13_SERVICE_PAYMENT_ENABLED, "");
  assert.equal(env.PHASE13_SERVICE_ENGAGEMENT_ENABLED, "");
  assert.deepEqual(assertM4_005_ChildEnvironment(env, APPROVED_URL), {
    databaseUrl: APPROVED_URL,
  });
  assert.throws(() =>
    assertM4_005_ChildEnvironment(
      { ...env, POSTGRES_URL: "postgres://other/db" },
      APPROVED_URL
    )
  );
  assert.throws(() =>
    assertM4_005_ChildEnvironment(
      { ...env, DATABASE_URL: "postgres://other/db" },
      APPROVED_URL
    )
  );
});

test("the Docker identity must match exactly", () => {
  const container = parseM4_005_DockerContainerInspection(
    containerInspection()
  );
  assert.throws(() =>
    assertM4_005_DockerIdentity(container, { Id: "sha256:other" })
  );
  const image = parseM4_005_DockerImageInspection(
    JSON.stringify([{ Id: IMAGE_ID }])
  );
  assert.deepEqual(assertM4_005_DockerIdentity(container, image), {
    imageId: IMAGE_ID,
  });
  const rejects = [
    containerInspection({ State: { Running: false } }),
    containerInspection({
      Config: { Image: "postgres:16", Labels: {} },
    }),
    containerInspection({
      HostConfig: {
        Binds: [],
        Mounts: [],
        PortBindings: {},
        Tmpfs: {},
      },
      NetworkSettings: { Ports: {} },
    }),
  ];
  for (const raw of rejects) {
    const parsed = parseM4_005_DockerContainerInspection(raw);
    const inspected = parseM4_005_DockerImageInspection(
      JSON.stringify([{ Id: parsed.Image ?? IMAGE_ID }])
    );
    assert.throws(() => assertM4_005_DockerIdentity(parsed, inspected));
  }
});

test("an unexpected data-directory mount is refused", () => {
  const raw = containerInspection({
    Mounts: [
      {
        Destination: M4_005_TEST_TARGET.dataDirectory,
        RW: true,
        Source: "/var/lib/postgresql/data",
        Type: "bind",
      },
    ],
  });
  const parsed = parseM4_005_DockerContainerInspection(raw);
  assert.throws(() => assertM4_005_DockerIdentity(parsed, { Id: IMAGE_ID }));
});

test("malformed Docker inspection output fails closed", () => {
  for (const raw of ["", "not json", "[]", "[1]", JSON.stringify([{}])]) {
    assert.throws(() => parseM4_005_DockerContainerInspection(raw), raw);
    assert.throws(() => parseM4_005_DockerImageInspection(raw), raw);
  }
});

test("the database identity must be the restricted tester", () => {
  const parsedUrl = parseM4_005_DatabaseUrl(APPROVED_URL);
  const identity = parseM4_005_DatabaseIdentity(identityRow());
  assert.deepEqual(
    assertM4_005_DatabaseIdentity(identity, parsedUrl),
    identity
  );
  const rejects = [
    identityRow({ canLogin: false }),
    identityRow({ isSuperuser: true }),
    identityRow({ canCreateDatabase: true }),
    identityRow({ canCreateRole: true }),
    identityRow({ serverVersionNum: 160_000 }),
    identityRow({ serverVersionNum: 180_000 }),
    identityRow({ ledgerInsert: true }),
    identityRow({ ledgerUpdate: true }),
    identityRow({ ledgerDelete: true }),
    identityRow({ ledgerTruncate: true }),
    identityRow({ database: "immigration_legal" }),
    identityRow({ role: "postgres" }),
  ];
  for (const row of rejects) {
    assert.throws(() =>
      assertM4_005_DatabaseIdentity(
        parseM4_005_DatabaseIdentity(row),
        parsedUrl
      )
    );
  }
  assert.throws(() => parseM4_005_DatabaseIdentity(undefined));
  assert.throws(() => parseM4_005_DatabaseIdentity({ database: 1 }));
});

test("the migration journal and pinned Migration 0044 bytes are enforced", async () => {
  const { readFile } = await import("node:fs/promises");
  const journalRaw = await readFile(
    resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json"),
    "utf8"
  );
  const sqlText = readFileSync(
    resolve(chatbotRoot, M4_005_TEST_TARGET.migrationSqlPath),
    "utf8"
  );
  const journal = parseM4_005_MigrationJournal(journalRaw);
  const expected = expectedM4_005_Migration(journal, sqlText);
  assert.equal(expected.rowCount, 45);
  assert.equal(expected.idx, 44);
  assert.equal(
    expected.hash,
    createHash("sha256").update(sqlText, "utf8").digest("hex")
  );
  assert.equal(expected.hash, M4_005_TEST_TARGET.migrationSqlSha256);
  assert.equal(journal.entries.at(-1)?.tag, M4_005_TEST_TARGET.migrationHead);

  // A single-byte edit to the migration must be detected.
  assert.throws(() => expectedM4_005_Migration(journal, `${sqlText} `));
  // A journal whose head is not M4-005 must be detected.
  const truncated = parseM4_005_MigrationJournal(
    JSON.stringify({ entries: journal.entries.slice(0, 44) })
  );
  assert.throws(() => expectedM4_005_Migration(truncated, sqlText));
  assert.throws(() => parseM4_005_MigrationJournal("not json"));
  assert.throws(() => parseM4_005_MigrationJournal("{}"));
});

const JOURNAL_PATH = resolve(
  chatbotRoot,
  "lib/db/migrations/meta/_journal.json"
);

function loadExpectedMigration() {
  const journal = parseM4_005_MigrationJournal(
    readFileSync(JOURNAL_PATH, "utf8")
  );
  return expectedM4_005_Migration(
    journal,
    readFileSync(
      resolve(chatbotRoot, M4_005_TEST_TARGET.migrationSqlPath),
      "utf8"
    )
  );
}

function ledgerHistory(ids: number[], whens: readonly number[]) {
  return ids.map((id, index) => ({ createdAt: String(whens[index]), id }));
}

function ledgerRow(
  ids: number[],
  whens: readonly number[],
  overrides: Record<string, unknown> = {}
) {
  return {
    history: ledgerHistory(ids, whens),
    latestCreatedAt: String(whens.at(-1)),
    latestHash: M4_005_TEST_TARGET.migrationSqlSha256,
    latestId: ids.at(-1) as number,
    rowCount: ids.length,
    ...overrides,
  };
}

const DENSE_IDS = Array.from({ length: 45 }, (_, index) => index + 1);
// The ids the accepted M4-005 database actually holds: two fully rolled-back
// attempts consumed the Drizzle identity sequence before ids 89..133 were written.
const REPLAYED_IDS = Array.from({ length: 45 }, (_, index) => 89 + index);
const GAPPED_IDS = Array.from({ length: 45 }, (_, index) => 1000 + index * 7);

test("the ledger id is a surrogate identity, never the migration ordinal", () => {
  const expected = loadExpectedMigration();
  const whens = expected.journalWhens;
  assert.equal(whens.length, 45);
  // The journal sequence is the oracle for the applied history.
  assert.equal(new Set(whens).size, 45);
  assert.deepEqual(
    [...whens].sort((left, right) => left - right),
    [...whens]
  );

  for (const ids of [DENSE_IDS, REPLAYED_IDS, GAPPED_IDS]) {
    const ledger = parseM4_005_MigrationLedger(ledgerRow(ids, whens));
    assert.deepEqual(
      assertM4_005_MigrationLedger({ expected, ledger }),
      ledger
    );
  }

  // A replayed ledger is accepted even when only the aggregate row is selected.
  const aggregateOnly = parseM4_005_MigrationLedger(
    ledgerRow(REPLAYED_IDS, whens, { history: undefined })
  );
  assert.equal(
    assertM4_005_MigrationLedger({ expected, ledger: aggregateOnly }).latestId,
    133
  );
  // No environment-specific id is pinned anywhere in the guard.
  assert.equal(
    readFileSync(
      resolve(chatbotRoot, "scripts/phase13-m4-005-db-test-guard.ts"),
      "utf8"
    ).includes("latestId === 133"),
    false
  );
});

test("the applied ledger rejects wrong counts, head hash, head timestamp and identities", () => {
  const expected = loadExpectedMigration();
  const whens = expected.journalWhens;
  const good = parseM4_005_MigrationLedger(ledgerRow(REPLAYED_IDS, whens));
  assert.ok(assertM4_005_MigrationLedger({ expected, ledger: good }));

  const rejects = [
    { ...good, rowCount: 44 },
    { ...good, rowCount: 46 },
    { ...good, latestHash: "0".repeat(64) },
    { ...good, latestCreatedAt: "1793233341879" },
    { ...good, latestId: 44 },
    { ...good, latestId: 0 },
    { ...good, latestId: -1 },
    { ...good, latestId: 45.5 },
  ];
  for (const candidate of rejects) {
    assert.throws(() =>
      assertM4_005_MigrationLedger({ expected, ledger: candidate })
    );
  }
  // A journal that no longer matches the pinned head or byte count is rejected.
  const sqlText = readFileSync(
    resolve(chatbotRoot, M4_005_TEST_TARGET.migrationSqlPath),
    "utf8"
  );
  const journal = parseM4_005_MigrationJournal(
    readFileSync(JOURNAL_PATH, "utf8")
  );
  const wrongHead = parseM4_005_MigrationJournal(
    JSON.stringify({
      entries: journal.entries.map((entry, index) =>
        index === journal.entries.length - 1
          ? { ...entry, tag: "0043_phase13_m4_004_service_engagement" }
          : entry
      ),
    })
  );
  assert.throws(() => expectedM4_005_Migration(wrongHead, sqlText));
  const wrongHeadTimestamp = parseM4_005_MigrationJournal(
    JSON.stringify({
      entries: journal.entries.map((entry, index) =>
        index === journal.entries.length - 1
          ? { ...entry, when: entry.when + 1 }
          : entry
      ),
    })
  );
  assert.throws(() => expectedM4_005_Migration(wrongHeadTimestamp, sqlText));
  assert.throws(() => parseM4_005_MigrationLedger(undefined));
  assert.throws(() => parseM4_005_MigrationLedger({ rowCount: 45 } as never));
});

test("the applied ledger history must equal the repository journal sequence", () => {
  const expected = loadExpectedMigration();
  const whens = expected.journalWhens;
  const correct = ledgerHistory(REPLAYED_IDS, whens);
  const assertWithHistory = (history: unknown) => {
    const ledger = parseM4_005_MigrationLedger(
      ledgerRow(REPLAYED_IDS, whens, { history })
    );
    return assertM4_005_MigrationLedger({ expected, ledger });
  };
  assert.ok(assertWithHistory(correct));

  const middle = 20;
  const outOfOrder = correct.map((entry, index) =>
    index === middle
      ? { ...entry, createdAt: correct[middle + 1].createdAt }
      : entry
  );
  const duplicateMigration = correct.map((entry, index) =>
    index === middle
      ? { ...entry, createdAt: correct[middle - 1].createdAt }
      : entry
  );
  const unknownMigration = correct.map((entry, index) =>
    index === middle ? { ...entry, createdAt: "1" } : entry
  );
  const duplicateIdentity = correct.map((entry, index) =>
    index === middle ? { ...entry, id: correct[middle - 1].id } : entry
  );
  const missingEntry = correct.slice(0, -1);

  for (const history of [
    outOfOrder,
    duplicateMigration,
    unknownMigration,
    duplicateIdentity,
    missingEntry,
  ]) {
    assert.throws(() => assertWithHistory(history));
  }

  // Malformed history shapes never silently degrade to the aggregate contract.
  for (const history of [
    "not-an-array",
    [{ id: 1 }],
    [{ createdAt: "1" }],
    [1],
  ]) {
    assert.throws(() => assertWithHistory(history));
  }
});

test("the launcher never hardcodes credentials or prints the URL", () => {
  const launcher = readFileSync(
    resolve(chatbotRoot, "scripts/phase13-m4-005-db-test.ts"),
    "utf8"
  );
  assert.equal(/postgres:\/\/[a-z_]+:[^$\s]/.test(launcher), false);
  assert.equal(launcher.includes("console.log(rawUrl"), false);
  assert.equal(launcher.includes("password"), false);
  assert.ok(
    launcher.includes("M4-005 guarded PostgreSQL test preflight failed closed")
  );
  // The launcher is authorized to exist but must stay unexecuted in this task.
  assert.ok(launcher.includes("RUN_M4_005_POSTGRES_INTEGRATION") === false);
});

test("the guard module never performs I/O", () => {
  const guard = readFileSync(
    resolve(chatbotRoot, "scripts/phase13-m4-005-db-test-guard.ts"),
    "utf8"
  );
  for (const forbidden of [
    "node:child_process",
    "node:fs",
    "postgres(",
    "fetch(",
  ]) {
    assert.equal(guard.includes(forbidden), false, forbidden);
  }
  assert.ok(guard.includes("NOT YET APPROVED"));
});

test("the isolated target constants stay internally consistent", () => {
  // Journal indexes are zero-based: 45 applied rows end at index 44.
  assert.equal(
    M4_005_TEST_TARGET.migrationCount,
    M4_005_TEST_TARGET.migrationIndex + 1
  );
  assert.notEqual(M4_005_TEST_TARGET.port, "5432".padEnd(4, "0"));
  assert.equal(M4_005_TEST_TARGET.host, "127.0.0.1");
  assert.equal(M4_005_TEST_TARGET.image, "postgres:17");
  assert.ok(
    M4_005_TEST_TARGET.migrationSqlPath.includes(
      M4_005_TEST_TARGET.migrationHead
    )
  );
});
