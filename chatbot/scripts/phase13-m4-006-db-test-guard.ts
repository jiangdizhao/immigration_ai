/**
 * Guards for the isolated M4-006 PostgreSQL harness.
 *
 * Pure functions, unit-tested offline; the executable harness must pass every one
 * before touching data. Nothing here contacts a database, and nothing here may be
 * relaxed to make a run pass.
 */
export const M4_006_MIGRATION_FILE =
  "lib/db/migrations/0045_phase13_m4_006_professional_review.sql";
export const M4_006_MIGRATION_SHA256 =
  "1f50752a19df80a538ce50a58e47d852c3373881a133bb3ebe3e556fff8f11ac";
export const M4_006_MIGRATION_TAG = "0045_phase13_m4_006_professional_review";

/** Tables the harness must find, with the objects that must exist on them. */
export const M4_006_SCHEMA_EXPECTATIONS = {
  tables: ["ProfessionalReviewRequest", "ProfessionalReviewRevision"],
  uniqueIndexes: [
    "ProfessionalReviewRequest_id_project_unique",
    "ProfessionalReviewRequest_project_operation_unique",
    "ProfessionalReviewRevision_request_revision_unique",
    "ProfessionalReviewRevision_request_operation_unique",
  ],
  checkConstraints: [
    "ProfessionalReviewRequest_revision_check",
    "ProfessionalReviewRequest_hash_check",
    "ProfessionalReviewRequest_scope_check",
    "ProfessionalReviewRequest_state_check",
    "ProfessionalReviewRequest_purpose_check",
    "ProfessionalReviewRequest_target_kind_check",
    "ProfessionalReviewRequest_invalidation_check",
    "ProfessionalReviewRequest_timestamps_check",
    "ProfessionalReviewRevision_revision_check",
    "ProfessionalReviewRevision_hash_check",
    "ProfessionalReviewRevision_state_check",
    "ProfessionalReviewRevision_action_check",
  ],
  triggers: [
    "ProfessionalReviewRequest_guard",
    "ProfessionalReviewRevision_guard",
  ],
  guardFunctions: [
    "phase13_m4_006_request_guard",
    "phase13_m4_006_revision_guard",
  ],
} as const;

/** Required scenarios: the runner may not report success while skipping one. */
export const M4_006_REQUIRED_SCENARIOS = [
  "INT-01 review request survives a new connection",
  "INT-02 immutable history reconstructable",
  "INT-03 concurrent decisions: exactly one winner",
  "INT-04 exact replay creates no duplicate revision",
  "INT-05 changed replay rejected",
  "INT-06 approval bound to the exact target version/hash",
  "INT-07 revoked assignment invalidates review validity",
  "INT-08 real Project/Engagement projection through the snapshot",
  "INT-09 undisclosed resource is not authorized",
  "INT-10 unknown customer-confirmation policy",
  "INT-11 absent production authorities cannot make READY",
  "INT-12 concurrent revision change never becomes permission",
  "INT-13 synthetic READY stays test-only",
  "INT-14 production composition never READY",
  "DB-01 append-only trigger refuses UPDATE and DELETE",
  "DB-02 projection trigger refuses revision skip, rebinding and illegal transitions",
  "DB-03 restricted tester cannot DDL or write frozen M4-005 tables",
] as const;

export type GuardViolation = { readonly code: string; readonly detail: string };

/**
 * What the harness actually observes from the server. Nothing here is copied from
 * the expectations: the database name, role, version, cluster identity and the
 * bound address/port all come from PostgreSQL itself.
 */
export type DatabaseIdentityObservation = {
  database: string;
  role: string;
  serverVersion: string;
  /** `pg_control_system().system_identifier` — immutable per initdb cluster. */
  systemIdentifier: string;
  serverAddress: string | null;
  serverPort: number | null;
  /** Container id observed independently (e.g. hostname of the DB container). */
  containerId: string | null;
};

export type DatabaseIdentityExpectation = {
  database: string | null;
  role: string | null;
  systemIdentifier: string | null;
  host: string | null;
  port: number | null;
  containerId: string | null;
};

function normaliseHost(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Rejects a wrong database, role, cluster, container or address before any scenario
 * runs. The cluster system identifier and the server-side bound address/port are
 * observed from PostgreSQL, so they cannot be satisfied by echoing an expectation.
 * A missing expectation is a violation, never a wildcard.
 */
export function checkDatabaseIdentity(
  observed: DatabaseIdentityObservation,
  expected: DatabaseIdentityExpectation
): GuardViolation[] {
  const violations: GuardViolation[] = [];
  const missing = (
    [
      ["PHASE13_M4_006_EXPECTED_DB", expected.database],
      ["PHASE13_M4_006_EXPECTED_ROLE", expected.role],
      ["PHASE13_M4_006_EXPECTED_SYSTEM_IDENTIFIER", expected.systemIdentifier],
      ["PHASE13_M4_006_EXPECTED_HOST", expected.host],
      ["PHASE13_M4_006_EXPECTED_PORT", expected.port],
    ] as const
  ).filter(([, value]) => value === null || value === "");
  for (const [name] of missing) {
    violations.push({
      code: "missing_expectation",
      detail: `${name} is required and is never treated as a wildcard`,
    });
  }
  if (violations.length > 0) {
    return violations;
  }
  if (observed.database !== expected.database) {
    violations.push({
      code: "database_mismatch",
      detail: `expected ${expected.database}, observed ${observed.database}`,
    });
  }
  if (observed.role !== expected.role) {
    violations.push({
      code: "role_mismatch",
      detail: `expected ${expected.role}, observed ${observed.role}`,
    });
  }
  if (!observed.serverVersion.startsWith("17.")) {
    violations.push({
      code: "server_version_mismatch",
      detail: `expected PostgreSQL 17.x, observed ${observed.serverVersion}`,
    });
  }
  if (observed.systemIdentifier !== expected.systemIdentifier) {
    violations.push({
      code: "cluster_mismatch",
      detail: `expected cluster ${expected.systemIdentifier}, observed ${observed.systemIdentifier}`,
    });
  }
  if (
    observed.serverAddress === null ||
    normaliseHost(observed.serverAddress) !== normaliseHost(expected.host ?? "")
  ) {
    violations.push({
      code: "server_address_mismatch",
      detail: `expected ${expected.host}, observed ${String(observed.serverAddress)}`,
    });
  }
  if (observed.serverPort !== expected.port) {
    violations.push({
      code: "server_port_mismatch",
      detail: `expected ${expected.port}, observed ${String(observed.serverPort)}`,
    });
  }
  if (
    expected.containerId !== null &&
    observed.containerId !== null &&
    !observed.containerId.startsWith(expected.containerId)
  ) {
    violations.push({
      code: "container_mismatch",
      detail: `expected container ${expected.containerId}, observed ${observed.containerId}`,
    });
  }
  if (expected.containerId !== null && observed.containerId === null) {
    violations.push({
      code: "container_unobserved",
      detail: "an expected container id was supplied but could not be observed",
    });
  }
  return violations;
}

export type LedgerRow = { id: number; hash: string; createdAt: number };

export type JournalEntry = { idx: number; tag: string; when: number };

export type LedgerExpectation = {
  /** Published `when` values from the repository journal, in order. */
  journal: readonly JournalEntry[];
  /** Tag of the migration that must be the applied head. */
  headTag: string;
  /** SHA-256 drizzle writes for the head migration row. */
  headHash: string;
};

/**
 * Verifies the *complete* applied history against the repository journal without
 * assuming gapless sequence ids (rolled-back attempts consume ids).
 */
export function checkLedgerHistory(
  rows: readonly LedgerRow[],
  expectation: LedgerExpectation
): GuardViolation[] {
  const violations: GuardViolation[] = [];
  if (rows.length !== expectation.journal.length) {
    violations.push({
      code: "ledger_count",
      detail: `journal has ${expectation.journal.length} migrations, ledger has ${rows.length}`,
    });
  }
  const shortest = Math.min(rows.length, expectation.journal.length);
  for (let index = 0; index < shortest; index += 1) {
    const row = rows[index] as LedgerRow;
    const entry = expectation.journal[index] as JournalEntry;
    if (row.createdAt !== entry.when) {
      violations.push({
        code: "ledger_history_mismatch",
        detail: `entry ${index} (${entry.tag}) expected when=${entry.when}, observed ${row.createdAt}`,
      });
      break;
    }
  }
  const head = rows.at(-1);
  if (!head) {
    violations.push({
      code: "ledger_empty",
      detail: "no migration rows applied",
    });
    return violations;
  }
  const expectedHeadWhen = expectation.journal.at(-1)?.when;
  if (expectedHeadWhen !== undefined && head.createdAt !== expectedHeadWhen) {
    violations.push({
      code: "ledger_head_missing",
      detail: `${expectation.headTag} is not the applied head (head when=${head.createdAt})`,
    });
  }
  if (head.hash !== expectation.headHash) {
    violations.push({
      code: "ledger_head_hash",
      detail: `expected ${expectation.headHash}, observed ${head.hash}`,
    });
  }
  // Ids are surrogates: only monotonicity and "head id >= row count" are asserted.
  for (let index = 1; index < rows.length; index += 1) {
    if ((rows[index] as LedgerRow).id <= (rows[index - 1] as LedgerRow).id) {
      violations.push({
        code: "ledger_id_order",
        detail: `entry ${index} does not advance the surrogate id`,
      });
      break;
    }
  }
  if (head.id < rows.length) {
    violations.push({
      code: "ledger_head_id",
      detail: `head id ${head.id} is smaller than the entry count ${rows.length}`,
    });
  }
  return violations;
}

export function checkMigrationBytes(observedSha256: string): GuardViolation[] {
  return observedSha256 === M4_006_MIGRATION_SHA256
    ? []
    : [
        {
          code: "migration_bytes",
          detail: `expected ${M4_006_MIGRATION_SHA256}, observed ${observedSha256}`,
        },
      ];
}

/** The tester must be restricted: no DDL, no write access to frozen M4-005 rows. */
export function checkTesterPrivileges(input: {
  canCreateTable: boolean;
  canWritePaymentCondition: boolean;
  canReadMigrationLedger: boolean;
  canWriteReviewRequest: boolean;
}): GuardViolation[] {
  const violations: GuardViolation[] = [];
  if (input.canCreateTable) {
    violations.push({ code: "tester_ddl", detail: "tester can create tables" });
  }
  if (input.canWritePaymentCondition) {
    violations.push({
      code: "tester_payment_write",
      detail: "tester can write frozen M4-005 tables",
    });
  }
  if (!input.canReadMigrationLedger) {
    violations.push({
      code: "tester_ledger_read",
      detail: "tester cannot read the migration ledger",
    });
  }
  if (!input.canWriteReviewRequest) {
    violations.push({
      code: "tester_review_write",
      detail: "tester cannot write the M4-006 tables it must exercise",
    });
  }
  return violations;
}

/** Every required scenario must be reported as passed; a skip is a violation. */
export function checkScenarioCoverage(
  reported: readonly { id: string; status: "passed" | "failed" | "skipped" }[]
): GuardViolation[] {
  const violations: GuardViolation[] = [];
  for (const required of M4_006_REQUIRED_SCENARIOS) {
    const match = reported.find((entry) => entry.id === required);
    if (!match) {
      violations.push({ code: "scenario_missing", detail: required });
    } else if (match.status === "skipped") {
      violations.push({ code: "scenario_skipped", detail: required });
    } else if (match.status === "failed") {
      violations.push({ code: "scenario_failed", detail: required });
    }
  }
  return violations;
}
