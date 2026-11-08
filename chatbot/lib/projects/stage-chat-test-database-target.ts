/**
 * Phase 13 M9-A R1-T02 — the guarded PostgreSQL suite's **target allowlist**.
 *
 * The guarded step-conversation suite writes fixture rows, so it must not be able to run
 * against the ordinary application database (`chatbot`), the authoritative legal corpus
 * (`immigration_legal`), a remote server, a Unix socket, or any other unintended target.
 * A "not equal to immigration_legal" check is not sufficient: it still admits `chatbot`.
 *
 * This module is deliberately **pure**: no database driver, no `server-only`, no
 * environment reads at import time. That lets the safety rules be proven offline
 * (`stage-chat-test-database-target.test.ts`) without opening a connection, and lets the
 * suite validate the configuration **before** a pool is created.
 *
 * Three independent layers, in this order:
 *   1. `evaluateStageChatTestGuards` — the three mandatory owner-authorisation variables,
 *      then a structural URL allowlist (host, port, database, no overrides).
 *   2. `verifyStageChatTestServerIdentity` — the server-reported identity
 *      (`current_database()`, `inet_server_addr()`, `inet_server_port()`) after connecting
 *      over TCP loopback, so a URL that resolved somewhere else still fails closed.
 *   3. `verifyStageChatTestMigrationReadiness` — migration 0053's table and the definition
 *      of its primary key, closed-vocabulary CHECK, composite foreign key and unique
 *      index, verified from the catalog rather than trusted by name.
 *
 * Nothing here applies a migration, creates a database or writes a row.
 */

/** The only database this suite may ever write to. */
export const STAGE_CHAT_TEST_DATABASE = "immigration_ai_phase13_m9_a_test";
/** The only accepted TCP hosts (loopback by name or by literal). */
export const STAGE_CHAT_TEST_HOSTS = ["127.0.0.1", "localhost"] as const;
/** The only accepted PostgreSQL port. */
export const STAGE_CHAT_TEST_PORT = 5432;
/** The only accepted server-reported loopback addresses. */
export const STAGE_CHAT_TEST_SERVER_ADDRESSES = ["127.0.0.1", "::1"] as const;
/** The mandatory owner-approval token. */
export const STAGE_CHAT_TEST_APPROVAL =
  "PHASE13_M9_A_OWNER_APPROVED_DISPOSABLE_DB";
/** Migration readiness identifiers this suite depends on. */
export const STAGE_CHAT_TEST_TABLE = "ProjectConversationStage";
export const STAGE_CHAT_TEST_STAGE_KEYS = [
  "school_applications",
  "school_admissions",
  "student500",
] as const;

export type StageChatTestDatabaseTarget = {
  readonly host: (typeof STAGE_CHAT_TEST_HOSTS)[number];
  readonly port: typeof STAGE_CHAT_TEST_PORT;
  readonly database: typeof STAGE_CHAT_TEST_DATABASE;
};

export const STAGE_CHAT_TEST_REJECTIONS = [
  "missing_configuration",
  "malformed_url",
  "unsupported_protocol",
  "multi_host_not_allowed",
  "unix_socket_not_allowed",
  "remote_host_not_allowed",
  "missing_port",
  "unexpected_port",
  "missing_database",
  "unexpected_database",
  "override_parameter_not_allowed",
  "unexpected_fragment",
] as const;
export type StageChatTestRejection =
  (typeof STAGE_CHAT_TEST_REJECTIONS)[number];

export type StageChatTestTargetResult =
  | { readonly ok: true; readonly target: StageChatTestDatabaseTarget }
  | {
      readonly ok: false;
      readonly detail: string;
      readonly reason: StageChatTestRejection;
    };

/**
 * A rejected target.
 *
 * `detail` never contains the URL, a user name or a password, so it is safe to print in a
 * failing test's diagnostic.
 */
export class StageChatTestDatabaseTargetError extends Error {
  readonly code: StageChatTestRejection;
  readonly detail: string;

  constructor(reason: StageChatTestRejection, detail: string) {
    super(`stage-chat test database target rejected (${reason}): ${detail}`);
    this.name = "StageChatTestDatabaseTargetError";
    this.code = reason;
    this.detail = detail;
  }
}

function reject(
  reason: StageChatTestRejection,
  detail: string
): StageChatTestTargetResult {
  return { detail, ok: false, reason };
}

/**
 * Structurally parse and allowlist the configured disposable-database URL.
 *
 * Everything is derived from the parsed URL (never substring matching), so a
 * credential, a comma-separated host list, a percent-encoded socket path or a
 * redirecting query parameter cannot slip past a textual "contains" check.
 */
export function parseStageChatTestDatabaseUrl(
  raw: string | undefined
): StageChatTestTargetResult {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value.length === 0) {
    return reject("missing_configuration", "no database URL was provided");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // The raw value is intentionally not echoed: it may contain a password.
    return reject("malformed_url", "the configured value is not a URL");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return reject(
      "unsupported_protocol",
      `protocol ${parsed.protocol.replace(/:$/u, "")} is not postgres`
    );
  }

  // postgres URLs may carry several hosts; URL parsing keeps them in `hostname`.
  if (parsed.hostname.includes(",") || parsed.hostname.includes(";")) {
    return reject(
      "multi_host_not_allowed",
      "multi-host connection strings are not allowed"
    );
  }

  if (parsed.hash.length > 0) {
    return reject("unexpected_fragment", "URL fragments are not allowed");
  }

  // Any query parameter can redirect the target (host/hostaddr/port/dbname/service/
  // passfile/options), so the guarded suite accepts none at all.
  const parameterNames = [...parsed.searchParams.keys()];
  if (parameterNames.length > 0) {
    return reject(
      "override_parameter_not_allowed",
      `URL parameters are not allowed (found: ${parameterNames
        .map((name) => name.toLowerCase())
        .sort()
        .join(", ")})`
    );
  }

  if (parsed.hostname.length === 0) {
    return reject(
      "unix_socket_not_allowed",
      "no TCP host was provided (host or socket overrides are not allowed)"
    );
  }

  let decodedHost: string;
  try {
    decodedHost = decodeURIComponent(parsed.hostname);
  } catch {
    return reject("malformed_url", "the host is not valid percent-encoding");
  }
  if (decodedHost.startsWith("/")) {
    return reject(
      "unix_socket_not_allowed",
      "a Unix-domain socket path is not an allowed TCP loopback target"
    );
  }

  const allowedHosts: readonly string[] = STAGE_CHAT_TEST_HOSTS;
  if (!allowedHosts.includes(decodedHost)) {
    return reject(
      "remote_host_not_allowed",
      `host must be one of ${allowedHosts.join(" / ")}`
    );
  }

  if (parsed.port.length === 0) {
    return reject(
      "missing_port",
      `the port must be explicit and equal to ${STAGE_CHAT_TEST_PORT}`
    );
  }
  if (Number(parsed.port) !== STAGE_CHAT_TEST_PORT) {
    return reject(
      "unexpected_port",
      `port must be ${STAGE_CHAT_TEST_PORT}, not ${parsed.port}`
    );
  }

  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  } catch {
    return reject(
      "malformed_url",
      "the database name is not valid percent-encoding"
    );
  }
  if (database.length === 0) {
    return reject("missing_database", "the URL does not name a database");
  }
  if (database.includes("/")) {
    return reject(
      "unexpected_database",
      "the URL must contain a single database path segment"
    );
  }
  if (database !== STAGE_CHAT_TEST_DATABASE) {
    return reject(
      "unexpected_database",
      `database must be exactly ${STAGE_CHAT_TEST_DATABASE}`
    );
  }

  return {
    ok: true,
    target: {
      database: STAGE_CHAT_TEST_DATABASE,
      host: decodedHost as StageChatTestDatabaseTarget["host"],
      port: STAGE_CHAT_TEST_PORT,
    },
  };
}

export type StageChatTestGuardInput = {
  readonly approval?: string | undefined;
  readonly databaseUrl?: string | undefined;
  readonly runnerVerified?: string | undefined;
};

export type StageChatTestGuardDecision =
  | { readonly run: false; readonly skipReason: string }
  | { readonly run: true; readonly target: StageChatTestDatabaseTarget };

/**
 * The safe default is **denied**.
 *
 * All three owner-authorisation variables must be present, and the URL must pass the
 * structural allowlist. A missing guard skips the suite (the ordinary, un-privileged
 * state). An explicitly authorised run with an *unsafe* URL throws instead of skipping,
 * because that is a misconfiguration that must be loud rather than silently ignored.
 */
export function evaluateStageChatTestGuards(
  input: StageChatTestGuardInput
): StageChatTestGuardDecision {
  if (input.runnerVerified !== "1") {
    return {
      run: false,
      skipReason:
        "PHASE13_M9_A_TEST_RUNNER_VERIFIED=1 is required for the guarded M9-A PostgreSQL suite",
    };
  }
  if (input.approval !== STAGE_CHAT_TEST_APPROVAL) {
    return {
      run: false,
      skipReason:
        "PHASE13_M9_A_TEST_APPROVAL must equal PHASE13_M9_A_OWNER_APPROVED_DISPOSABLE_DB",
    };
  }
  if ((input.databaseUrl ?? "").trim().length === 0) {
    return {
      run: false,
      skipReason:
        "PHASE13_M9_A_TEST_DATABASE_URL is not configured (a disposable database is required)",
    };
  }

  const parsed = parseStageChatTestDatabaseUrl(input.databaseUrl);
  if (!parsed.ok) {
    throw new StageChatTestDatabaseTargetError(parsed.reason, parsed.detail);
  }
  return { run: true, target: parsed.target };
}

export type StageChatTestServerIdentityInput = {
  readonly currentDatabase: unknown;
  readonly serverAddress: unknown;
  readonly serverPort: unknown;
};

export type StageChatTestServerIdentityResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly detail: string;
      readonly reason:
        | "unverifiable_identity"
        | "database_mismatch"
        | "unix_socket_connection"
        | "not_loopback"
        | "port_mismatch";
    };

/**
 * Verify the **actual** server, not the URL string.
 *
 * `inet_server_addr()` is NULL for a Unix-socket connection and returns the peer address
 * for TCP; only the literal loopback forms are accepted, and an unexpected form is a
 * failure rather than a silent pass. `inet_server_port()` must be the approved port.
 */
export function verifyStageChatTestServerIdentity(
  input: StageChatTestServerIdentityInput
): StageChatTestServerIdentityResult {
  if (
    typeof input.currentDatabase !== "string" ||
    input.currentDatabase.length === 0
  ) {
    return {
      detail: "the server did not report a database name",
      ok: false,
      reason: "unverifiable_identity",
    };
  }
  if (input.currentDatabase !== STAGE_CHAT_TEST_DATABASE) {
    return {
      detail: `connected database is not ${STAGE_CHAT_TEST_DATABASE}`,
      ok: false,
      reason: "database_mismatch",
    };
  }

  if (input.serverAddress === null || input.serverAddress === undefined) {
    return {
      detail:
        "the server reported no TCP peer address (a Unix-socket connection is not accepted); connect over 127.0.0.1",
      ok: false,
      reason: "unix_socket_connection",
    };
  }
  if (typeof input.serverAddress !== "string") {
    return {
      detail: "the server peer address was not a string",
      ok: false,
      reason: "unverifiable_identity",
    };
  }
  const address = input.serverAddress.trim();
  const loopbackAddresses: readonly string[] = STAGE_CHAT_TEST_SERVER_ADDRESSES;
  if (!loopbackAddresses.includes(address)) {
    return {
      detail: `server peer address must be loopback (${loopbackAddresses.join(
        " or "
      )})`,
      ok: false,
      reason: "not_loopback",
    };
  }

  const port =
    typeof input.serverPort === "number"
      ? input.serverPort
      : typeof input.serverPort === "string"
        ? Number(input.serverPort)
        : Number.NaN;
  if (!Number.isFinite(port)) {
    return {
      detail: "the server did not report a numeric port",
      ok: false,
      reason: "unverifiable_identity",
    };
  }
  if (port !== STAGE_CHAT_TEST_PORT) {
    return {
      detail: `server port must be ${STAGE_CHAT_TEST_PORT}, not ${port}`,
      ok: false,
      reason: "port_mismatch",
    };
  }

  return { ok: true };
}

export type StageChatTestColumnSnapshot = {
  readonly name: string;
  readonly dataType: string;
  readonly isNullable: boolean;
  readonly columnDefault: string | null;
};

export type StageChatTestNamedDefinition = {
  readonly name: string;
  readonly definition: string;
};

/**
 * A credential-free, read-only snapshot of the catalog for migration 0053.
 * The guarded suite fills this from `information_schema` / `pg_catalog` queries.
 */
export type StageChatTestMigrationSnapshot = {
  readonly tableExists: boolean;
  readonly columns: readonly StageChatTestColumnSnapshot[];
  readonly primaryKeyColumns: readonly string[];
  readonly checkConstraints: readonly StageChatTestNamedDefinition[];
  readonly foreignKeys: readonly StageChatTestNamedDefinition[];
  readonly uniqueIndexes: readonly StageChatTestNamedDefinition[];
};

export type StageChatTestMigrationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Normalise a catalog definition for token comparison: lower-case, no identifier quotes,
 * single spaces, no spaces around commas. This keeps the checks tolerant of PostgreSQL
 * formatting while still asserting the real definition rather than a name.
 */
function normalizeDefinition(value: string): string {
  return value
    .toLowerCase()
    .replace(/"/gu, "")
    .replace(/\s+/gu, " ")
    .replace(/\s*,\s*/gu, ",")
    .trim();
}

const REQUIRED_COLUMNS: readonly {
  readonly name: string;
  readonly types: readonly string[];
  readonly nullable: boolean;
}[] = [
  { name: "chatId", nullable: false, types: ["uuid"] },
  { name: "projectId", nullable: false, types: ["uuid"] },
  { name: "createdByUserId", nullable: false, types: ["uuid"] },
  {
    name: "stageKey",
    nullable: false,
    types: ["character varying", "varchar"],
  },
  {
    name: "createdAt",
    nullable: false,
    types: ["timestamp without time zone", "timestamp"],
  },
];

const REQUIRED_FK_NAME = "ProjectConversationStage_conversation_fk";
const REQUIRED_CHECK_NAME = "ProjectConversationStage_stage_key_check";
const REQUIRED_UNIQUE_NAME = "ProjectConversationStage_owner_stage_unique";
const COMPOSITE_KEY = "(chatid,projectid,createdbyuserid)";
const OWNER_STAGE_KEY = "(projectid,createdbyuserid,stagekey)";

/**
 * Verify that migration 0053 is really present and complete.
 *
 * The names alone are not trusted: the primary key, the closed-vocabulary CHECK, the
 * composite foreign key and the owner/stage unique index are each checked against their
 * catalog definition. A missing or partial migration produces a precise diagnostic, and
 * nothing here applies the migration.
 */
export function verifyStageChatTestMigrationReadiness(
  snapshot: StageChatTestMigrationSnapshot
): StageChatTestMigrationResult {
  const problems: string[] = [];

  if (!snapshot.tableExists) {
    problems.push(
      `table ${STAGE_CHAT_TEST_TABLE} does not exist: migration 0053 has not been applied`
    );
    return { ok: false, problems };
  }

  for (const required of REQUIRED_COLUMNS) {
    const column = snapshot.columns.find(
      (candidate) => candidate.name === required.name
    );
    if (!column) {
      problems.push(`column ${required.name} is missing`);
      continue;
    }
    const dataType = column.dataType.toLowerCase().trim();
    if (!required.types.some((type) => dataType === type)) {
      problems.push(
        `column ${required.name} has type ${column.dataType}, expected ${required.types.join(" / ")}`
      );
    }
    if (required.nullable === false && column.isNullable) {
      problems.push(`column ${required.name} must be NOT NULL`);
    }
  }
  const createdAt = snapshot.columns.find(
    (candidate) => candidate.name === "createdAt"
  );
  if (createdAt && (createdAt.columnDefault ?? "").trim().length === 0) {
    problems.push("column createdAt must have a default");
  }

  const primaryKey = [...snapshot.primaryKeyColumns]
    .map((column) => column.toLowerCase())
    .sort();
  if (primaryKey.length !== 1 || primaryKey[0] !== "chatid") {
    problems.push(
      `primary key must be exactly (chatId), found (${snapshot.primaryKeyColumns.join(", ") || "none"})`
    );
  }

  const check = snapshot.checkConstraints.find(
    (candidate) => candidate.name === REQUIRED_CHECK_NAME
  );
  if (check) {
    const definition = normalizeDefinition(check.definition);
    if (!definition.includes("stagekey")) {
      problems.push(
        `check constraint ${REQUIRED_CHECK_NAME} does not constrain stageKey`
      );
    }
    for (const stageKey of STAGE_CHAT_TEST_STAGE_KEYS) {
      if (!definition.includes(stageKey)) {
        problems.push(
          `check constraint ${REQUIRED_CHECK_NAME} does not include the value ${stageKey}`
        );
      }
    }
  } else {
    problems.push(`check constraint ${REQUIRED_CHECK_NAME} is missing`);
  }

  const foreignKey = snapshot.foreignKeys.find(
    (candidate) => candidate.name === REQUIRED_FK_NAME
  );
  if (foreignKey) {
    const definition = normalizeDefinition(foreignKey.definition);
    if (!definition.includes("foreign key")) {
      problems.push(`foreign key ${REQUIRED_FK_NAME} is not a foreign key`);
    }
    if (!definition.includes(COMPOSITE_KEY)) {
      problems.push(
        `foreign key ${REQUIRED_FK_NAME} must cover ${COMPOSITE_KEY}`
      );
    }
    if (!definition.includes("references projectconversation")) {
      problems.push(
        `foreign key ${REQUIRED_FK_NAME} must reference ProjectConversation`
      );
    }
    if (!definition.includes("on delete restrict")) {
      problems.push(
        `foreign key ${REQUIRED_FK_NAME} must be ON DELETE RESTRICT`
      );
    }
  } else {
    problems.push(`foreign key ${REQUIRED_FK_NAME} is missing`);
  }

  const uniqueIndex = snapshot.uniqueIndexes.find(
    (candidate) => candidate.name === REQUIRED_UNIQUE_NAME
  );
  if (uniqueIndex) {
    const definition = normalizeDefinition(uniqueIndex.definition);
    // Check the `CREATE UNIQUE INDEX` phrase, not the bare word: the index *name*
    // itself ends in `_unique`, and a non-unique index would otherwise pass.
    if (!definition.includes("create unique index")) {
      problems.push(`index ${REQUIRED_UNIQUE_NAME} is not unique`);
    }
    if (!definition.includes(OWNER_STAGE_KEY)) {
      problems.push(
        `unique index ${REQUIRED_UNIQUE_NAME} must cover ${OWNER_STAGE_KEY}`
      );
    }
  } else {
    problems.push(`unique index ${REQUIRED_UNIQUE_NAME} is missing`);
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
