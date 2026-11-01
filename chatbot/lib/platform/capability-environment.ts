/**
 * Central runtime capability/environment resolution.
 *
 * Phase 13 P1: product capabilities used to be hidden unless an operator set an
 * experimental feature flag, so ordinary customers could not reach Project
 * creation at all. This module is the single place that decides what a flag value
 * means, so frontend, HTTP and repository layers share exactly one semantic.
 *
 * Phase 13 P1 final security correction (Correction A):
 * - Parsing is STRICT. Only the recognised enabled tokens enable a capability.
 *   An unrecognised non-empty value fails closed and can never silently promote a
 *   production-sensitive M5 capability to on (`PHASE13_...=flase` is not "on").
 * - `null` (unset/blank) still means "not configured", so the intended product
 *   defaults below are preserved.
 * - Environment detection is conservative: anything that is not positively a
 *   local development/test process is treated as production-like, including
 *   staging, preview and hosted container/serverless markers.
 *
 * Defaults:
 * - Personal Project: ON unless explicitly disabled.
 * - M5 school applications/admissions: ON locally, OFF in production-like
 *   environments unless explicitly authorized.
 */

export type CapabilityEnvironment = "development" | "test" | "production";

const ENABLED_TOKENS = new Set(["1", "enabled", "on", "true", "yes"]);
const DISABLED_TOKENS = new Set(["0", "disabled", "false", "no", "off"]);

/** Only these `NODE_ENV` values are treated as a trusted local process. */
const LOCAL_NODE_ENVS = new Set(["development", "test"]);
/** Only these `APP_ENV` values are treated as a trusted local process. */
const LOCAL_APP_ENVS = new Set(["development", "local", "test"]);

/**
 * Hosted/runtime markers. Their presence means the process is not a trusted
 * developer machine even when `NODE_ENV` is unset or misleading.
 */
const HOSTED_ENV_MARKERS = [
  "AWS_EXECUTION_ENV",
  "AWS_LAMBDA_FUNCTION_NAME",
  "DYNO",
  "ECS_CONTAINER_METADATA_URI",
  "ECS_CONTAINER_METADATA_URI_V4",
  "FLY_APP_NAME",
  "KUBERNETES_SERVICE_HOST",
  "K_SERVICE",
  "RAILWAY_ENVIRONMENT",
  "RENDER",
  "RENDER_SERVICE_ID",
] as const;

function normalizeEnvValue(value: string | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Conservative production-like classification.
 *
 * Anything not positively identified as a local development/test process is
 * treated as production-like, so staging, preview deployments and externally
 * hosted runtimes never inherit local-development capability defaults.
 */
export function resolveCapabilityEnvironment(
  env: Record<string, string | undefined> = process.env
): CapabilityEnvironment {
  const nodeEnv = normalizeEnvValue(env.NODE_ENV);
  const appEnv = normalizeEnvValue(env.APP_ENV);
  const vercelEnv = normalizeEnvValue(env.VERCEL_ENV);

  // An explicitly configured non-local application environment wins.
  if (appEnv && !LOCAL_APP_ENVS.has(appEnv)) {
    return "production";
  }
  // Vercel production/preview (and any unknown value) are hosted deployments;
  // only `vercel dev` reports "development".
  if (vercelEnv && vercelEnv !== "development") {
    return "production";
  }
  if (
    HOSTED_ENV_MARKERS.some((marker) => Boolean(normalizeEnvValue(env[marker])))
  ) {
    return "production";
  }
  // Any non-local NODE_ENV (production, staging, preview, qa, ...) is not a
  // trusted local process.
  if (nodeEnv && !LOCAL_NODE_ENVS.has(nodeEnv)) {
    return "production";
  }
  return nodeEnv === "test" ? "test" : "development";
}

export type CapabilityFlagDescription =
  | "unconfigured"
  | "enabled"
  | "disabled"
  | "invalid";

/** Strict classification of one configured capability flag value. */
export function describeCapabilityFlag(
  value: string | undefined | null
): CapabilityFlagDescription {
  if (typeof value !== "string") {
    return "unconfigured";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "") {
    return "unconfigured";
  }
  if (ENABLED_TOKENS.has(normalized)) {
    return "enabled";
  }
  if (DISABLED_TOKENS.has(normalized)) {
    return "disabled";
  }
  // A recognised-but-invalid configuration must never grant a capability.
  return "invalid";
}

/**
 * `null` means "not configured".
 *
 * `enabled` → `true`, `disabled` → `false`, and an unrecognised non-empty value
 * → `false` (fail closed). Only an unset/blank flag returns `null`, so defaults
 * still apply and a typo can never enable a production-sensitive capability.
 */
export function parseCapabilityFlag(
  value: string | undefined | null
): boolean | null {
  switch (describeCapabilityFlag(value)) {
    case "unconfigured":
      return null;
    case "enabled":
      return true;
    default:
      return false;
  }
}

/** Foundational capability: ON unless explicitly disabled (invalid fails closed). */
export function defaultOnCapability(value: string | undefined | null): boolean {
  return parseCapabilityFlag(value) ?? true;
}

/**
 * Internal preparation capability: ON by default in local development/test and
 * OFF in production-like environments until the existing release decision says
 * otherwise. An explicit enabled value still wins; disabled or invalid values
 * never enable it.
 */
export function localPreparationCapability(
  value: string | undefined | null,
  environment: CapabilityEnvironment = resolveCapabilityEnvironment()
): boolean {
  return parseCapabilityFlag(value) ?? environment !== "production";
}
