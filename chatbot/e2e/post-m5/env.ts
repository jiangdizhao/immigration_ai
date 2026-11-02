/**
 * Phase 13 Post-M5 E2E — environment guard and shared connection.
 *
 * Every campaign test imports this module first. It fails closed unless the
 * process is explicitly pointed at the disposable acceptance cluster created for
 * this stage, so an accidental `.env.local` authoritative URL can never be used.
 *
 * No credential value is ever printed by this module.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

export const EXPECTED_DATABASE = "immigration_ai_phase13_postm5_e2e_test";
export const EXPECTED_ENVIRONMENT_ID = "phase13-postm5-e2e-disposable";
export const EXPECTED_HOST_PORT = "55449";
export const EXPECTED_SERVER_PORT = "5432";
export const EXPECTED_BASE_URL = "http://127.0.0.1:3100";

const FORBIDDEN_DATABASES = new Set([
  "immigration_legal",
  "immigration_ai_phase13_m4_final_test",
  "immigration_ai_phase13_m5_1_test",
  "immigration_ai_phase13_m5_2_test",
]);
const FORBIDDEN_ROLES = new Set(["rico_local", "postgres", "phase13_m4_final_tester"]);
const FORBIDDEN_PORTS = new Set(["5432", "5433", "55446", "55447", "55448"]);
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const OPT_IN = process.env.PHASE13_POSTM5_E2E_DB?.trim().toLowerCase() === "true";

export const TEST_DATABASE_URL = process.env.PHASE13_POSTM5_E2E_DATABASE_URL?.trim() ?? "";
export const TEST_DATABASE_ROLE = process.env.PHASE13_POSTM5_E2E_DATABASE_ROLE?.trim() ?? "";
export const TEST_ENVIRONMENT_ID = process.env.PHASE13_POSTM5_E2E_ENVIRONMENT_ID?.trim() ?? "";
export const TEST_HOST_PORT = process.env.PHASE13_POSTM5_E2E_HOST_PORT?.trim() ?? "";
export const TEST_SERVER_PORT = process.env.PHASE13_POSTM5_E2E_SERVER_PORT?.trim() ?? "";
export const BASE_URL =
  process.env.PHASE13_POSTM5_E2E_BASE_URL?.trim() || EXPECTED_BASE_URL;
export const EVIDENCE_DIR =
  process.env.PHASE13_POSTM5_E2E_EVIDENCE_DIR?.trim() ||
  "/tmp/phase13-postm5-e2e/evidence";

/** Returns a reason string when the campaign must not run, else false. */
export function skipReason(): string | false {
  if (!OPT_IN) {
    return "PHASE13_POSTM5_E2E_DB is not enabled (explicit opt-in required)";
  }
  for (const [name, value] of [
    ["PHASE13_POSTM5_E2E_DATABASE_URL", TEST_DATABASE_URL],
    ["PHASE13_POSTM5_E2E_DATABASE_ROLE", TEST_DATABASE_ROLE],
    ["PHASE13_POSTM5_E2E_ENVIRONMENT_ID", TEST_ENVIRONMENT_ID],
    ["PHASE13_POSTM5_E2E_HOST_PORT", TEST_HOST_PORT],
    ["PHASE13_POSTM5_E2E_SERVER_PORT", TEST_SERVER_PORT],
  ] as const) {
    if (!value) {
      return `${name} is not configured (disposable target required)`;
    }
  }
  if (!process.env.POSTGRES_URL?.trim()) {
    return "POSTGRES_URL is not scoped to the disposable database";
  }
  return false;
}

/**
 * Fails closed on any coordinate that could reach the authoritative corpus or a
 * previous acceptance environment. Missing pieces are a failure, never a
 * fallback.
 */
export function assertDisposableTarget(): URL {
  const url = new URL(TEST_DATABASE_URL);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("the disposable URL must be a PostgreSQL URL");
  }
  if (!LOOPBACK.has(url.hostname)) {
    throw new Error("the disposable database must be bound to loopback");
  }
  const database = url.pathname.replace(/^\//u, "");
  if (database !== EXPECTED_DATABASE) {
    throw new Error("the disposable database identity does not match");
  }
  if (FORBIDDEN_DATABASES.has(database)) {
    throw new Error("a forbidden database was configured");
  }
  const role = decodeURIComponent(url.username);
  if (role !== TEST_DATABASE_ROLE) {
    throw new Error("the URL role must equal the configured disposable role");
  }
  if (FORBIDDEN_ROLES.has(role)) {
    throw new Error("a forbidden role was configured");
  }
  if (url.port !== EXPECTED_HOST_PORT) {
    throw new Error("the host port must be the reserved disposable port");
  }
  if (FORBIDDEN_PORTS.has(url.port)) {
    throw new Error("a forbidden port was configured");
  }
  if (TEST_ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT_ID) {
    throw new Error("the environment identity must be the disposable marker");
  }
  if (TEST_HOST_PORT !== EXPECTED_HOST_PORT) {
    throw new Error("the declared host port does not match");
  }
  if (TEST_SERVER_PORT !== EXPECTED_SERVER_PORT) {
    throw new Error("the declared server port does not match");
  }
  if (process.env.POSTGRES_URL?.trim() !== TEST_DATABASE_URL) {
    throw new Error("POSTGRES_URL must be the disposable URL");
  }
  if (process.env.DATABASE_URL?.trim() !== TEST_DATABASE_URL) {
    throw new Error("DATABASE_URL must be the disposable URL");
  }
  return url;
}

/** Extra hardening: allow the runner to pass an explicit evidence identity. */
export function campaignIdentityFile(): string | null {
  try {
    return readFileSync("/tmp/phase13-postm5-e2e/cluster.id", "utf8").trim();
  } catch {
    return null;
  }
}

let shared: ReturnType<typeof postgres> | null = null;

export function db() {
  if (!shared) {
    assertDisposableTarget();
    shared = postgres(TEST_DATABASE_URL, { max: 4, connect_timeout: 5 });
  }
  return shared;
}

export async function closeDb() {
  if (shared) {
    await shared.end({ timeout: 5 });
    shared = null;
  }
}
