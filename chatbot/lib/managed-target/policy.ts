import { createHash } from "node:crypto";

/**
 * Phase 13 M4-006 / M4-007 shared canonical managed-target identity.
 *
 * A professional review and the integrated readiness gate must agree on exactly
 * one immutable target. This module is the single definition of that target: no
 * second target model, no fuzzy matching and no "latest package" shortcut exists
 * anywhere else in the M4-006/M4-007 surface.
 *
 * The identity is only ever obtained from a trusted provider (`target-provider`).
 * Free-form metadata supplied by a caller is validated here and then compared
 * against the provider's authoritative answer; it is never trusted on its own.
 */

export const MANAGED_TARGET_KINDS = [
  "managed_school_application",
  "student_500_visa_application",
] as const;
export type ManagedTargetKind = (typeof MANAGED_TARGET_KINDS)[number];

/** The only review purpose M4 supports today. */
export const MANAGED_TARGET_PURPOSES = [
  "managed_handoff_authorization",
] as const;
export type ManagedTargetPurpose = (typeof MANAGED_TARGET_PURPOSES)[number];

/**
 * Where an observed target came from. `synthetic_test` may only be produced by
 * explicitly injected test-only adapters and always propagates to the readiness
 * result so synthetic evidence can never be reported as production evidence.
 */
export const MANAGED_TARGET_PROVENANCES = [
  "trusted_provider",
  "synthetic_test",
] as const;
export type ManagedTargetProvenance =
  (typeof MANAGED_TARGET_PROVENANCES)[number];

export type ManagedTargetIdentity = {
  projectId: string;
  targetKind: ManagedTargetKind;
  targetId: string;
  targetVersion: number;
  targetSha256: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const TARGET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_RE.test(value);
}

export function isManagedTargetKind(
  value: unknown
): value is ManagedTargetKind {
  return (
    typeof value === "string" &&
    (MANAGED_TARGET_KINDS as readonly string[]).includes(value)
  );
}

export function isManagedTargetPurpose(
  value: unknown
): value is ManagedTargetPurpose {
  return (
    typeof value === "string" &&
    (MANAGED_TARGET_PURPOSES as readonly string[]).includes(value)
  );
}

export function managedTargetIdentityValid(
  identity: unknown
): identity is ManagedTargetIdentity {
  if (!identity || typeof identity !== "object") {
    return false;
  }
  const value = identity as Record<string, unknown>;
  return (
    isUuid(value.projectId) &&
    isManagedTargetKind(value.targetKind) &&
    typeof value.targetId === "string" &&
    TARGET_ID_RE.test(value.targetId) &&
    typeof value.targetVersion === "number" &&
    Number.isSafeInteger(value.targetVersion) &&
    value.targetVersion > 0 &&
    isSha256(value.targetSha256)
  );
}

/** Deterministic JSON with sorted keys, for canonical hashing only. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Canonical binding hash of the exact target: changing any of project, kind, id,
 * version or content hash produces a different value, so an approval can never be
 * transferred to another target or silently revalidated after a revision.
 */
export function managedTargetIdentitySha256(
  identity: ManagedTargetIdentity
): string {
  return sha256Hex(
    canonicalJson({
      projectId: identity.projectId,
      targetId: identity.targetId,
      targetKind: identity.targetKind,
      targetSha256: identity.targetSha256,
      targetVersion: identity.targetVersion,
    })
  );
}

export function managedTargetKey(identity: {
  projectId: string;
  targetKind: ManagedTargetKind;
  targetId: string;
}): string {
  return `${identity.projectId}:${identity.targetKind}:${identity.targetId}`;
}

/** Exact version + content equality. Version-only or hash-only matches are false. */
export function sameManagedTargetVersion(
  left: Pick<ManagedTargetIdentity, "targetVersion" | "targetSha256">,
  right: Pick<ManagedTargetIdentity, "targetVersion" | "targetSha256">
): boolean {
  return (
    left.targetVersion === right.targetVersion &&
    left.targetSha256.trim().toLowerCase() ===
      right.targetSha256.trim().toLowerCase()
  );
}
