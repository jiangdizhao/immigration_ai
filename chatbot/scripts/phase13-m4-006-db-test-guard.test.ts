import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkDatabaseIdentity,
  checkLedgerHistory,
  checkMigrationBytes,
  checkScenarioCoverage,
  checkTesterPrivileges,
  type DatabaseIdentityExpectation,
  type DatabaseIdentityObservation,
  M4_006_MIGRATION_FILE,
  M4_006_MIGRATION_SHA256,
  M4_006_REQUIRED_SCENARIOS,
  M4_006_SCHEMA_EXPECTATIONS,
} from "./phase13-m4-006-db-test-guard";

/**
 * Offline proof that the executable PostgreSQL harness cannot run against the wrong
 * environment, cannot pass while a scenario is missing/skipped/failed, and really
 * does implement its scenarios. Nothing here connects to a database.
 */
const here = dirname(fileURLToPath(import.meta.url));
const chatbotRoot = resolve(here, "..");
const harness = readFileSync(
  resolve(here, "phase13-m4-006-db-test.ts"),
  "utf8"
);
const journal = (
  JSON.parse(
    readFileSync(
      resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json"),
      "utf8"
    )
  ) as { entries: { idx: number; tag: string; when: number }[] }
).entries;

const OBSERVED: DatabaseIdentityObservation = {
  containerId: "8b32cea136eb",
  database: "immigration_ai_phase13_m4_006_test",
  role: "phase13_m4_006_tester",
  serverAddress: "172.18.0.4",
  serverPort: 5432,
  serverVersion: "17.11",
  systemIdentifier: "7441234567890123456",
};

const EXPECTED: DatabaseIdentityExpectation = {
  containerId: "8b32cea136eb",
  database: "immigration_ai_phase13_m4_006_test",
  host: "172.18.0.4",
  port: 5432,
  role: "phase13_m4_006_tester",
  systemIdentifier: "7441234567890123456",
};

test("the harness pins the exact Migration 0045 bytes", () => {
  const sha = createHash("sha256")
    .update(readFileSync(resolve(chatbotRoot, M4_006_MIGRATION_FILE)))
    .digest("hex");
  assert.equal(sha, M4_006_MIGRATION_SHA256);
  assert.deepEqual(checkMigrationBytes(sha), []);
  assert.equal(checkMigrationBytes("0".repeat(64)).length, 1);
});

test("identity is verified from observed server facts, never echoed expectations", () => {
  assert.deepEqual(checkDatabaseIdentity(OBSERVED, EXPECTED), []);
  // `hostname()` of the DB container is the independent container observation.
  assert.ok(harness.includes("pg_control_system()"));
  assert.ok(harness.includes("inet_server_addr()"));
  assert.ok(harness.includes("inet_server_port()"));
  assert.ok(harness.includes("hostname()"));

  const negatives: Partial<DatabaseIdentityExpectation>[] = [
    { database: "immigration_legal" },
    { role: "postgres" },
    { systemIdentifier: "1234" },
    { host: "172.18.0.9" },
    { port: 5433 },
  ];
  for (const overrides of negatives) {
    assert.ok(
      checkDatabaseIdentity(OBSERVED, { ...EXPECTED, ...overrides }).length >=
        1,
      JSON.stringify(overrides)
    );
  }
  // Observations that disagree with the server are what fail the run.
  for (const overrides of [
    { database: "postgres" },
    { role: "postgres" },
    { serverVersion: "16.4" },
    { systemIdentifier: "999" },
    { serverAddress: "10.0.0.1" },
    { serverPort: 6432 },
    { containerId: "ffffffffffff" },
    { containerId: null },
  ]) {
    assert.ok(
      checkDatabaseIdentity({ ...OBSERVED, ...overrides }, EXPECTED).length >=
        1,
      JSON.stringify(overrides)
    );
  }
  // A missing expectation is never a wildcard.
  const missing = checkDatabaseIdentity(OBSERVED, {
    ...EXPECTED,
    database: null,
    host: null,
    port: null,
    role: null,
    systemIdentifier: null,
  });
  assert.ok(missing.length >= 5);
  assert.ok(
    missing.every((violation) => violation.code === "missing_expectation")
  );
});

test("the complete ledger history is verified without gapless ids", () => {
  const headWhen = journal.at(-1)?.when ?? 0;
  // Rolled-back attempts consume ids: 89..133 style ledgers are legitimate.
  const rows = journal.map((entry, index) => ({
    createdAt: entry.when,
    hash:
      index === journal.length - 1 ? M4_006_MIGRATION_SHA256 : "a".repeat(64),
    id: 89 + index,
  }));
  assert.deepEqual(
    checkLedgerHistory(rows, {
      headHash: M4_006_MIGRATION_SHA256,
      headTag: journal.at(-1)?.tag ?? "",
      journal,
    }),
    []
  );
  // Wrong head hash
  assert.equal(
    checkLedgerHistory(
      rows.map((row, index) =>
        index === rows.length - 1 ? { ...row, hash: "b".repeat(64) } : row
      ),
      { headHash: M4_006_MIGRATION_SHA256, headTag: "", journal }
    )[0]?.code,
    "ledger_head_hash"
  );
  // Incomplete history (0045 not applied)
  assert.equal(
    checkLedgerHistory(rows.slice(0, -1), {
      headHash: M4_006_MIGRATION_SHA256,
      headTag: "",
      journal,
    })[0]?.code,
    "ledger_count"
  );
  // History that diverges in the middle
  assert.equal(
    checkLedgerHistory(
      rows.map((row, index) =>
        index === 3 ? { ...row, createdAt: row.createdAt + 1 } : row
      ),
      { headHash: M4_006_MIGRATION_SHA256, headTag: "", journal }
    )[0]?.code,
    "ledger_history_mismatch"
  );
  // Non-monotonic surrogate ids are rejected; gaps are fine.
  assert.equal(
    checkLedgerHistory(
      rows.map((row, index) =>
        index === 2 ? { ...row, id: rows[0]?.id ?? 0 } : row
      ),
      { headHash: M4_006_MIGRATION_SHA256, headTag: "", journal }
    )[0]?.code,
    "ledger_id_order"
  );
  assert.equal(
    checkLedgerHistory([], {
      headHash: M4_006_MIGRATION_SHA256,
      headTag: "",
      journal,
    })[0]?.code,
    "ledger_count"
  );
  assert.ok(headWhen > 0);
});

test("a restricted tester is required", () => {
  assert.deepEqual(
    checkTesterPrivileges({
      canCreateTable: false,
      canReadMigrationLedger: true,
      canWritePaymentCondition: false,
      canWriteReviewRequest: true,
    }),
    []
  );
  for (const [overrides, code] of [
    [{ canCreateTable: true }, "tester_ddl"],
    [{ canWritePaymentCondition: true }, "tester_payment_write"],
    [{ canReadMigrationLedger: false }, "tester_ledger_read"],
    [{ canWriteReviewRequest: false }, "tester_review_write"],
  ] as const) {
    const base = {
      canCreateTable: false,
      canReadMigrationLedger: true,
      canWritePaymentCondition: false,
      canWriteReviewRequest: true,
    };
    assert.equal(
      checkTesterPrivileges({ ...base, ...overrides })[0]?.code,
      code
    );
  }
});

test("every required scenario must be executed and pass", () => {
  const all = M4_006_REQUIRED_SCENARIOS.map((id) => ({
    id,
    status: "passed" as const,
  }));
  assert.deepEqual(checkScenarioCoverage(all), []);
  assert.equal(M4_006_REQUIRED_SCENARIOS.length, 17);
  assert.equal(
    checkScenarioCoverage(all.slice(1))[0]?.code,
    "scenario_missing"
  );
  assert.equal(
    checkScenarioCoverage(
      all.map((entry, index) =>
        index === 2 ? { id: entry.id, status: "skipped" as const } : entry
      )
    )[0]?.code,
    "scenario_skipped"
  );
  assert.equal(
    checkScenarioCoverage(
      all.map((entry, index) =>
        index === 5 ? { id: entry.id, status: "failed" as const } : entry
      )
    )[0]?.code,
    "scenario_failed"
  );
  for (let index = 1; index <= 14; index += 1) {
    const id = `INT-${String(index).padStart(2, "0")}`;
    assert.ok(
      M4_006_REQUIRED_SCENARIOS.some((entry) => entry.startsWith(id)),
      `${id} missing`
    );
  }
});

test("the harness implements its scenarios instead of skipping them", () => {
  // Every required scenario has a real body registered in the harness.
  for (const id of M4_006_REQUIRED_SCENARIOS) {
    assert.ok(harness.includes(`id: "${id}"`), `${id} has no scenario body`);
  }
  // No scenario may be recorded as skipped, and the coverage guard decides the exit.
  assert.equal(harness.includes('"skipped"'), false);
  assert.ok(harness.includes("checkScenarioCoverage(results)"));
  // Real SQL and real repository calls are used, not mocks.
  assert.ok(harness.includes('delete from "ProfessionalReviewRevision"'));
  assert.ok(harness.includes('update "ProfessionalReviewRequest"'));
  assert.ok(harness.includes("createPostgresProfessionalReviewStore"));
  assert.ok(harness.includes("loadManagedHandoffSnapshot"));
  assert.ok(harness.includes("databaseSecondary"));
  // Success returns normally; only violations set a non-zero exit code, and no
  // `return` may sit inside a `finally` block (that would mask a real failure).
  assert.ok(harness.includes("return exitCode;"));
  assert.ok(harness.includes("let exitCode = 0;"));
  assert.ok(harness.includes("exitCode = 1;"));
  assert.ok(harness.includes("return 2;"));
  assert.equal(/process\.exit\(2\)/u.test(harness), false);
  const finallyIndex = harness.indexOf("} finally {");
  const exitAssignment = harness.indexOf("exitCode = 1;");
  const exitReturn = harness.indexOf("return exitCode;");
  assert.ok(finallyIndex > 0 && exitAssignment > finallyIndex);
  assert.ok(exitReturn > exitAssignment, "the success return must follow the finally block");
  assert.equal(
    /return\s/u.test(harness.slice(finallyIndex, exitAssignment)),
    false,
    "a return inside `finally` would mask a real failure"
  );
  // Watchdog and connection hygiene.
  assert.match(harness, /WATCHDOG_MS = \d[\d_]*/u);
  assert.ok(harness.includes("process.exit(124)"));
  assert.ok(harness.includes("@example.invalid"));
  assert.ok(harness.includes("pinned"));
});

test("the harness refuses unsafe targets and never touches M4-005 suites", () => {
  assert.ok(harness.includes("PHASE13_M4_006_DB_URL is required"));
  assert.ok(
    harness.includes("refusing to run against the authoritative database")
  );
  assert.ok(harness.includes("5432"));
  assert.equal(/phase13-m4-005-db-test/u.test(harness), false);
  assert.equal(/M4_005_STAGE3B|stage3b/iu.test(harness), false);
  // Structural expectations are declared, not read back from the database.
  assert.equal(M4_006_SCHEMA_EXPECTATIONS.triggers.length, 2);
  assert.equal(M4_006_SCHEMA_EXPECTATIONS.checkConstraints.length, 12);
  assert.equal(M4_006_SCHEMA_EXPECTATIONS.uniqueIndexes.length, 4);
});

test("every required integration capability maps to an executed scenario", () => {
  const capabilities: Record<string, readonly string[]> = {
    "persisted review request across sessions": ["INT-01"],
    "append-only history": ["INT-02", "DB-01"],
    "concurrent revision CAS": ["INT-03"],
    "exact replay": ["INT-04"],
    "conflicting replay": ["INT-05"],
    "review target version/hash binding": ["INT-06"],
    "assignment revocation": ["INT-07"],
    "real Project and Engagement projections": ["INT-08"],
    "disclosure isolation": ["INT-09"],
    "unknown customer-confirmation policy": ["INT-10"],
    "absent production credential/signature/payment authorities": [
      "INT-11",
      "INT-14",
    ],
    "synthetic READY isolated from production": ["INT-13"],
    "database integrity constraints": ["DB-01", "DB-02"],
    "restricted tester privileges": ["DB-03"],
  };
  for (const [capability, ids] of Object.entries(capabilities)) {
    for (const id of ids) {
      assert.ok(
        M4_006_REQUIRED_SCENARIOS.some((entry) => entry.startsWith(id)),
        `${capability} -> ${id} is not a required scenario`
      );
      assert.ok(
        harness.includes(
          `id: "${M4_006_REQUIRED_SCENARIOS.find((entry) => entry.startsWith(id))}"`
        ),
        `${capability} -> ${id} has no harness body`
      );
    }
  }
  // The offline suites carry the remaining frozen outcomes (production deny-all,
  // synthetic isolation, confirmation policy, concurrency mapping).
  const offline = [
    readFileSync(
      resolve(chatbotRoot, "lib/managed-handoff/snapshot.test.ts"),
      "utf8"
    ),
    readFileSync(
      resolve(chatbotRoot, "lib/managed-handoff/evaluator.test.ts"),
      "utf8"
    ),
    readFileSync(
      resolve(chatbotRoot, "lib/professional-review/persistence-plan.test.ts"),
      "utf8"
    ),
  ].join("\n");
  for (const marker of [
    "INT-07",
    "INT-08",
    "INT-09",
    "INT-10",
    "INT-11",
    "INT-12",
    "INT-13",
    "INT-14",
    "INT-03",
    "INT-04/INT-05",
  ]) {
    assert.ok(
      offline.includes(marker),
      `${marker} missing from the offline suites`
    );
  }
});
