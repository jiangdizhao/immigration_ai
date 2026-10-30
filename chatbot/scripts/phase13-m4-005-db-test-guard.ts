import { createHash } from "node:crypto";

/**
 * PROPOSED M4-005 isolated PostgreSQL target — NOT YET APPROVED.
 *
 * Neither the M4-002, M4-003 nor the M4-004 approval authorizes this target, and
 * the accepted M4-004 database must not be reused for M4-005 because its ledger
 * stops at Migration 0043. Creating the container, applying Migration 0044 and
 * executing the guarded suite each require separate explicit owner authorization.
 *
 * This module is pure: it parses and validates preflight metadata and never
 * connects to a database, inspects Docker, creates containers or runs SQL. The
 * launcher performs side effects only after the owner authorizes them.
 */
export const M4_005_TEST_TARGET = {
  host: "127.0.0.1",
  port: "55445",
  database: "immigration_ai_phase13_m4_005_test",
  role: "phase13_m4_005_tester",
  migrationCount: 45,
  migrationIndex: 44,
  migrationHead: "0044_phase13_m4_005_service_payment",
  migrationWhen: 1_793_258_050_571,
  migrationSqlPath: "lib/db/migrations/0044_phase13_m4_005_service_payment.sql",
  migrationSqlSha256:
    "d90ebf497dd049cb4f6fc221d2129639714028849a819e7dbb6e5b32a6146f0e",
  container: "phase13-m4-005-pg",
  image: "postgres:17",
  dockerLabel: "immigration-ai.phase13",
  dockerLabelValue: "m4-005-isolated-test",
  dataDirectory: "/var/lib/postgresql/data",
  tmpfsOptions: "rw,nosuid,nodev,size=1g",
  containerPort: "5432/tcp",
  minServerVersionNum: 170_000,
  maxServerVersionNumExclusive: 180_000,
  /** Variables that must never carry a different target into the child. */
  clearedChildEnvKeys: [
    "DATABASE_URL",
    "PGURL",
    "POSTGRES_URL_UNPOOLED",
    "PHASE13_M4_002_TEST_DATABASE_URL",
    "PHASE13_M4_003_TEST_DATABASE_URL",
    "PHASE13_M4_004_TEST_DATABASE_URL",
  ],
} as const;

export const M4_005_TEST_APPROVAL = "RUN_M4_005_POSTGRES_INTEGRATION";

export const M4_005_RUNNER_ENVIRONMENT_FLAG =
  "PHASE13_M4_005_TEST_RUNNER_VERIFIED";

export type ParsedM4_005_DatabaseUrl = {
  host: string;
  port: string;
  database: string;
  role: string;
};

/**
 * Accept exactly one loopback target. Any other host, port, database, role, extra
 * parameter, fragment or password-less URL is refused, so an inherited business
 * target cannot silently become the test database.
 */
export function parseM4_005_DatabaseUrl(raw: string): ParsedM4_005_DatabaseUrl {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("M4-005 integration target URL is invalid");
  }
  const database = parsed.pathname.replace(/^\//u, "");
  let role: string;
  try {
    role = decodeURIComponent(parsed.username);
  } catch {
    throw new Error("M4-005 integration target URL is invalid");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname !== M4_005_TEST_TARGET.host ||
    parsed.port !== M4_005_TEST_TARGET.port ||
    database !== M4_005_TEST_TARGET.database ||
    role !== M4_005_TEST_TARGET.role ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    parsed.password.length === 0
  ) {
    throw new Error("M4-005 integration target identity mismatch");
  }
  return { database, host: parsed.hostname, port: parsed.port, role };
}

/**
 * The approval TOKEN is `M4_005_TEST_APPROVAL`; the environment VARIABLE that
 * carries it is `PHASE13_M4_005_TEST_APPROVAL`. Confusing the two is the exact
 * defect that made an approved M4-004 run fail closed, so both names are pinned
 * here and re-asserted by the offline guard suite.
 */
export const M4_005_APPROVAL_ENVIRONMENT_VARIABLE =
  "PHASE13_M4_005_TEST_APPROVAL" as const;

export function requireM4_005_IntegrationApproval(value: string | undefined) {
  if (value !== M4_005_TEST_APPROVAL) {
    throw new Error("M4-005 integration approval token is missing");
  }
}

/**
 * Build the child environment for the integration run.
 *
 * The runtime needs `POSTGRES_URL`; it is set to the already-validated approved
 * URL and every alternative database variable is cleared so nothing inherited
 * from the parent shell can redirect the runtime. The M4-005 feature flag is
 * switched ON for the child only, because the suite exercises the real HTTP-free
 * repository path; no other Phase 13 flag is enabled.
 */
export function buildM4_005_ChildEnvironment(input: {
  approvedUrl: string;
  baseEnv: Record<string, string | undefined>;
}) {
  parseM4_005_DatabaseUrl(input.approvedUrl);
  const env: Record<string, string | undefined> = {
    ...input.baseEnv,
    POSTGRES_URL: input.approvedUrl,
    [M4_005_APPROVAL_ENVIRONMENT_VARIABLE]: M4_005_TEST_APPROVAL,
    PHASE13_M4_005_TEST_DATABASE_URL: input.approvedUrl,
    [M4_005_RUNNER_ENVIRONMENT_FLAG]: "1",
    PHASE13_SERVICE_ENGAGEMENT_ENABLED: "",
    PHASE13_PROJECT_HUMAN_MESSAGING_ENABLED: "",
    PHASE13_SERVICE_PAYMENT_ENABLED: "",
  };
  for (const key of M4_005_TEST_TARGET.clearedChildEnvKeys) {
    env[key] = "";
  }
  return env;
}

/** Fail-closed re-verification of the environment handed to the child. */
export function assertM4_005_ChildEnvironment(
  env: Record<string, string | undefined>,
  approvedUrl: string
) {
  parseM4_005_DatabaseUrl(approvedUrl);
  if (env.POSTGRES_URL !== approvedUrl) {
    throw new Error("M4-005 child POSTGRES_URL is not the approved target");
  }
  if (env.PHASE13_M4_005_TEST_DATABASE_URL !== approvedUrl) {
    throw new Error("M4-005 child test URL is not the approved target");
  }
  if (env[M4_005_RUNNER_ENVIRONMENT_FLAG] !== "1") {
    throw new Error("M4-005 child runner marker is missing");
  }
  for (const key of M4_005_TEST_TARGET.clearedChildEnvKeys) {
    const value = env[key];
    if (value !== undefined && value !== "") {
      throw new Error(`M4-005 child environment leaks ${key}`);
    }
  }
  return { databaseUrl: approvedUrl };
}

export type M4_005_MigrationJournalEntry = {
  idx: number;
  when: number;
  tag: string;
};
export type M4_005_MigrationJournal = {
  entries: M4_005_MigrationJournalEntry[];
};

export function parseM4_005_MigrationJournal(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("M4-005 migration journal is malformed");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { entries?: unknown }).entries)
  ) {
    throw new Error("M4-005 migration journal is malformed");
  }
  const entries = (parsed as { entries: unknown[] }).entries.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as M4_005_MigrationJournalEntry).idx !== "number" ||
      typeof (entry as M4_005_MigrationJournalEntry).when !== "number" ||
      typeof (entry as M4_005_MigrationJournalEntry).tag !== "string"
    ) {
      throw new Error("M4-005 migration journal is malformed");
    }
    const value = entry as M4_005_MigrationJournalEntry;
    return { idx: value.idx, tag: value.tag, when: value.when };
  });
  return { entries } satisfies M4_005_MigrationJournal;
}

/**
 * Pin the exact Migration 0044 bytes and journal identity. The expected ledger
 * hash is derived from the SQL file, so an edited or partially copied migration
 * can never masquerade as an applied one.
 *
 * `journalWhens` is the journal's `when` sequence in journal order. It is the
 * only environment-independent way to prove that the applied ledger contains
 * exactly this migration history and nothing else, so it is returned alongside
 * the pinned head and checked by `assertM4_005_MigrationLedger`.
 */
export function expectedM4_005_Migration(
  journal: M4_005_MigrationJournal,
  sqlText: string
) {
  const head = journal.entries.at(-1);
  if (!head) {
    throw new Error("M4-005 migration journal is empty");
  }
  if (
    journal.entries.length !== M4_005_TEST_TARGET.migrationCount ||
    head.idx !== M4_005_TEST_TARGET.migrationIndex ||
    head.tag !== M4_005_TEST_TARGET.migrationHead ||
    head.when !== M4_005_TEST_TARGET.migrationWhen
  ) {
    throw new Error("M4-005 migration journal does not match the pinned head");
  }
  const hash = createHash("sha256").update(sqlText, "utf8").digest("hex");
  if (hash !== M4_005_TEST_TARGET.migrationSqlSha256) {
    throw new Error("M4-005 Migration 0044 bytes changed");
  }
  return {
    hash,
    idx: head.idx,
    journalWhens: journal.entries.map((entry) => entry.when),
    rowCount: journal.entries.length,
    when: head.when,
  };
}

export type M4_005_DatabaseIdentity = {
  database: string;
  role: string;
  serverVersionNum: number;
  canLogin: boolean;
  isSuperuser: boolean;
  canCreateDatabase: boolean;
  canCreateRole: boolean;
  canCreateSchemaPublic: boolean;
  ledgerInsert: boolean;
  ledgerUpdate: boolean;
  ledgerDelete: boolean;
  ledgerTruncate: boolean;
};

export function parseM4_005_DatabaseIdentity(
  row: Record<string, unknown> | undefined
): M4_005_DatabaseIdentity {
  if (
    !row ||
    typeof row.database !== "string" ||
    typeof row.role !== "string" ||
    typeof row.serverVersionNum !== "number" ||
    typeof row.canLogin !== "boolean" ||
    typeof row.isSuperuser !== "boolean" ||
    typeof row.canCreateDatabase !== "boolean" ||
    typeof row.canCreateRole !== "boolean" ||
    typeof row.canCreateSchemaPublic !== "boolean" ||
    typeof row.ledgerInsert !== "boolean" ||
    typeof row.ledgerUpdate !== "boolean" ||
    typeof row.ledgerDelete !== "boolean" ||
    typeof row.ledgerTruncate !== "boolean"
  ) {
    throw new Error("M4-005 database identity metadata is malformed");
  }
  return {
    canCreateDatabase: row.canCreateDatabase,
    canCreateRole: row.canCreateRole,
    canCreateSchemaPublic: row.canCreateSchemaPublic,
    canLogin: row.canLogin,
    database: row.database,
    isSuperuser: row.isSuperuser,
    ledgerDelete: row.ledgerDelete,
    ledgerInsert: row.ledgerInsert,
    ledgerTruncate: row.ledgerTruncate,
    ledgerUpdate: row.ledgerUpdate,
    role: row.role,
    serverVersionNum: row.serverVersionNum,
  };
}

export function assertM4_005_DatabaseIdentity(
  identity: M4_005_DatabaseIdentity,
  expected: ParsedM4_005_DatabaseUrl
) {
  if (
    identity.database !== expected.database ||
    identity.role !== expected.role ||
    identity.canLogin !== true ||
    identity.isSuperuser !== false ||
    identity.canCreateDatabase !== false ||
    identity.canCreateRole !== false ||
    identity.serverVersionNum < M4_005_TEST_TARGET.minServerVersionNum ||
    identity.serverVersionNum >= M4_005_TEST_TARGET.maxServerVersionNumExclusive
  ) {
    throw new Error("M4-005 database identity mismatch");
  }
  // The restricted tester may read the Drizzle ledger and must never write it.
  if (
    identity.ledgerInsert ||
    identity.ledgerUpdate ||
    identity.ledgerDelete ||
    identity.ledgerTruncate
  ) {
    throw new Error(
      "M4-005 tester still holds Drizzle ledger write privileges"
    );
  }
  return identity;
}

/**
 * One applied ledger row, ordered by surrogate key. `createdAt` is the Drizzle
 * `created_at` value, which is the journal `when` of the migration it applied.
 */
export type M4_005_MigrationLedgerHistoryEntry = {
  id: number;
  createdAt: string;
};

export type M4_005_MigrationLedger = {
  rowCount: number;
  latestId: number;
  latestHash: string;
  latestCreatedAt: string;
  /**
   * Ordered history. Optional so a caller that only selected the aggregate row
   * still uses this contract; when present it is verified in full.
   */
  history?: M4_005_MigrationLedgerHistoryEntry[];
};

function parseM4_005_MigrationLedgerHistory(
  value: unknown
): M4_005_MigrationLedgerHistoryEntry[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("M4-005 migration ledger history is malformed");
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error("M4-005 migration ledger history is malformed");
    }
    const id = entry.id;
    const createdAt = entry.createdAt;
    if (
      typeof id !== "number" ||
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      typeof createdAt !== "string" ||
      createdAt.trim().length === 0
    ) {
      throw new Error("M4-005 migration ledger history is malformed");
    }
    return { createdAt, id };
  });
}

export function parseM4_005_MigrationLedger(
  row: Record<string, unknown> | undefined
): M4_005_MigrationLedger {
  if (
    !row ||
    typeof row.rowCount !== "number" ||
    typeof row.latestId !== "number" ||
    typeof row.latestHash !== "string" ||
    typeof row.latestCreatedAt !== "string"
  ) {
    throw new Error("M4-005 migration ledger metadata is malformed");
  }
  const history = parseM4_005_MigrationLedgerHistory(row.history);
  return {
    latestCreatedAt: row.latestCreatedAt,
    latestHash: row.latestHash,
    latestId: row.latestId,
    rowCount: row.rowCount,
    ...(history ? { history } : {}),
  };
}

/**
 * The ledger primary key is a surrogate identity, NOT the migration ordinal.
 *
 * PostgreSQL sequences are not transactional, so a migration attempt that is
 * fully rolled back still consumes sequence values. A database that recovered
 * from failed attempts therefore legitimately holds N contiguous-in-meaning
 * migrations with non-contiguous ids (for example 45 rows with ids 89..133).
 * Requiring `latestId === migrationCount` rejects healthy databases, so it is
 * never asserted and no environment-specific id is ever hardcoded.
 *
 * What is asserted instead: exact row count, the pinned head hash and head
 * timestamp, a valid non-regressing surrogate identity, and — when the caller
 * supplies the ordered history — that the whole applied history equals the
 * repository journal sequence exactly (no missing, duplicated, extra or
 * reordered migrations).
 */
export function assertM4_005_MigrationLedger(input: {
  expected: {
    hash: string;
    idx: number;
    rowCount: number;
    when: number;
    /** Journal `when` values in journal order, for full-history verification. */
    journalWhens?: readonly number[];
  };
  ledger: M4_005_MigrationLedger;
}) {
  const { expected, ledger } = input;
  if (
    ledger.rowCount !== expected.rowCount ||
    ledger.latestHash !== expected.hash ||
    ledger.latestCreatedAt.trim() !== String(expected.when)
  ) {
    throw new Error("M4-005 migration ledger does not match the pinned head");
  }
  // A surrogate key of `rowCount` distinct positive rows can never be smaller
  // than the row count itself, and it must stay a safe positive integer.
  if (
    !Number.isSafeInteger(ledger.latestId) ||
    ledger.latestId <= 0 ||
    ledger.latestId < ledger.rowCount
  ) {
    throw new Error("M4-005 migration ledger identity is invalid");
  }
  const journalWhens = expected.journalWhens;
  if (journalWhens && journalWhens.length !== expected.rowCount) {
    throw new Error("M4-005 migration journal history is inconsistent");
  }
  const history = ledger.history;
  if (!history) {
    return ledger;
  }
  if (history.length !== ledger.rowCount) {
    throw new Error("M4-005 migration ledger history is incomplete");
  }
  let previousId = 0;
  for (const entry of history) {
    if (entry.id <= previousId) {
      throw new Error(
        "M4-005 migration ledger history is out of order or duplicated"
      );
    }
    previousId = entry.id;
  }
  const historyHead = history.at(-1);
  if (
    !historyHead ||
    historyHead.id !== ledger.latestId ||
    historyHead.createdAt.trim() !== ledger.latestCreatedAt.trim()
  ) {
    throw new Error("M4-005 migration ledger head is inconsistent");
  }
  if (journalWhens) {
    const applied = history.map((entry) => entry.createdAt.trim());
    const expectedWhens = journalWhens.map((when) => String(when));
    if (
      applied.length !== expectedWhens.length ||
      applied.some((value, index) => value !== expectedWhens[index])
    ) {
      throw new Error(
        "M4-005 migration ledger history does not match the repository journal"
      );
    }
  }
  return ledger;
}

type DockerPortBinding = { HostIp?: string; HostPort?: string };
type DockerMount = {
  Type?: string;
  Destination?: string;
  Target?: string;
  Source?: string;
  RW?: boolean;
};

export type M4_005_DockerContainerInspection = {
  Image?: string;
  Config?: {
    Image?: string;
    Labels?: Record<string, string | undefined> | null;
  };
  HostConfig?: {
    Tmpfs?: Record<string, string> | null;
    PortBindings?: Record<string, DockerPortBinding[] | null> | null;
    Binds?: string[] | null;
    Mounts?: DockerMount[] | null;
  };
  Mounts?: DockerMount[] | null;
  State?: { Running?: boolean };
  NetworkSettings?: {
    Ports?: Record<string, DockerPortBinding[] | null> | null;
  };
};

export type M4_005_DockerImageInspection = { Id?: string };

function malformedDocker(): never {
  throw new Error("M4-005 Docker identity inspection metadata is malformed");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInspectionObject(output: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    malformedDocker();
  }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !isRecord(parsed[0])) {
    malformedDocker();
  }
  return parsed[0];
}

export function parseM4_005_DockerContainerInspection(
  output: string
): M4_005_DockerContainerInspection {
  const raw = parseInspectionObject(output);
  const config = raw.Config;
  const hostConfig = raw.HostConfig;
  const state = raw.State;
  const network = raw.NetworkSettings;
  if (
    !isRecord(config) ||
    !isRecord(hostConfig) ||
    !isRecord(state) ||
    !isRecord(network)
  ) {
    malformedDocker();
  }
  if (
    typeof config.Image !== "string" ||
    typeof raw.Image !== "string" ||
    typeof state.Running !== "boolean"
  ) {
    malformedDocker();
  }
  const tmpfs = hostConfig.Tmpfs;
  if (tmpfs !== null && tmpfs !== undefined && !isRecord(tmpfs)) {
    malformedDocker();
  }
  const binds = hostConfig.Binds;
  if (binds !== null && binds !== undefined && !Array.isArray(binds)) {
    malformedDocker();
  }
  const containerMounts = raw.Mounts ?? [];
  const hostMounts = hostConfig.Mounts ?? [];
  if (!Array.isArray(containerMounts) || !Array.isArray(hostMounts)) {
    malformedDocker();
  }
  return {
    Config: {
      Image: config.Image,
      Labels: isRecord(config.Labels)
        ? (config.Labels as Record<string, string | undefined>)
        : null,
    },
    HostConfig: {
      Binds: (binds ?? []) as string[],
      Mounts: hostMounts as DockerMount[],
      PortBindings: isRecord(hostConfig.PortBindings)
        ? (hostConfig.PortBindings as Record<
            string,
            DockerPortBinding[] | null
          >)
        : null,
      Tmpfs: (tmpfs ?? null) as Record<string, string> | null,
    },
    Image: raw.Image,
    Mounts: containerMounts as DockerMount[],
    NetworkSettings: {
      Ports: isRecord(network.Ports)
        ? (network.Ports as Record<string, DockerPortBinding[] | null>)
        : null,
    },
    State: { Running: state.Running },
  };
}

export function parseM4_005_DockerImageInspection(
  output: string
): M4_005_DockerImageInspection {
  const raw = parseInspectionObject(output);
  if (typeof raw.Id !== "string") {
    malformedDocker();
  }
  return { Id: raw.Id as string };
}

/**
 * Verify the Docker container and image identity.
 *
 * The container must be the exact proposed M4-005 target: running, built from
 * `postgres:17` (whose inspected image id must equal the container's image id),
 * carrying the M4-005 label, bound only to loopback, storing its data directory
 * on tmpfs with no unexpected bind/host mount, and exposing the standard 5432.
 */
export function assertM4_005_DockerIdentity(
  container: M4_005_DockerContainerInspection,
  image: M4_005_DockerImageInspection
) {
  const labels = container.Config?.Labels ?? {};
  const tmpfs = container.HostConfig?.Tmpfs ?? {};
  const mounts = container.Mounts ?? [];
  const hostMounts = container.HostConfig?.Mounts ?? [];
  const binds = container.HostConfig?.Binds ?? [];
  const ports = container.NetworkSettings?.Ports ?? {};
  const bindings = ports[M4_005_TEST_TARGET.containerPort] ?? [];
  if (
    container.State?.Running !== true ||
    container.Config?.Image !== M4_005_TEST_TARGET.image ||
    labels[M4_005_TEST_TARGET.dockerLabel] !==
      M4_005_TEST_TARGET.dockerLabelValue ||
    typeof image.Id !== "string" ||
    image.Id.length === 0 ||
    image.Id !== container.Image ||
    tmpfs[M4_005_TEST_TARGET.dataDirectory] !==
      M4_005_TEST_TARGET.tmpfsOptions ||
    mounts.length > 0 ||
    hostMounts.length > 0 ||
    binds.length > 0
  ) {
    throw new Error("M4-005 Docker identity mismatch");
  }
  const loopback = bindings.filter(
    (binding) => binding.HostIp === M4_005_TEST_TARGET.host
  );
  if (
    bindings.length !== 1 ||
    loopback.length !== 1 ||
    loopback[0]?.HostPort !== M4_005_TEST_TARGET.port
  ) {
    throw new Error("M4-005 Docker port binding mismatch");
  }
  return { imageId: image.Id };
}
