import {
  type ManagedTargetIdentity,
  type ManagedTargetProvenance,
  sameManagedTargetVersion,
} from "@/lib/managed-target/policy";

/**
 * Trusted managed-target provider port.
 *
 * M5/M7/M8 package builders do not exist yet, so production resolves nothing.
 * A provider is the *only* source of authoritative target identity: the caller
 * proposes a target and the provider states which immutable version/hash really
 * exists. Untrusted, unknown or unavailable providers never become READY/DENY
 * ambiguity — they map to explicit fail-closed outcomes.
 */
export type ManagedTargetObservation =
  | {
      status: "resolved";
      identity: ManagedTargetIdentity;
      provenance: ManagedTargetProvenance;
      resolvedAt: string;
    }
  | { status: "not_found" }
  | { status: "unsupported_kind"; targetKind: string }
  | { status: "untrusted"; reasonCode: string }
  | { status: "unavailable" };

export type ManagedTargetProvider = {
  readonly code: string;
  readonly provenance: ManagedTargetProvenance;
  resolve(input: {
    projectId: string;
    targetId: string;
    targetKind: string;
  }): ManagedTargetObservation;
};

export const UNAVAILABLE_MANAGED_TARGET_PROVIDER_CODE =
  "unavailable_managed_target_provider" as const;

/**
 * Production default: no managed-application package provider is integrated, so
 * every target is unavailable and no review or handoff can ever be established.
 */
export const unavailableManagedTargetProvider: ManagedTargetProvider = {
  code: UNAVAILABLE_MANAGED_TARGET_PROVIDER_CODE,
  provenance: "trusted_provider",
  resolve() {
    return { status: "unavailable" };
  },
};

/**
 * True only when the provider's authoritative target is exactly the target the
 * caller asked about and, when supplied, exactly the version/hash they claim.
 */
export function managedTargetObservationMatches(
  observation: ManagedTargetObservation,
  requested: {
    projectId: string;
    targetId: string;
    targetKind: string;
    targetVersion?: number;
    targetSha256?: string;
  }
): boolean {
  if (observation.status !== "resolved") {
    return false;
  }
  const { identity } = observation;
  if (
    identity.projectId !== requested.projectId ||
    identity.targetId !== requested.targetId ||
    identity.targetKind !== requested.targetKind
  ) {
    return false;
  }
  if (
    requested.targetVersion === undefined &&
    requested.targetSha256 === undefined
  ) {
    return true;
  }
  if (
    requested.targetVersion === undefined ||
    requested.targetSha256 === undefined
  ) {
    return false;
  }
  return sameManagedTargetVersion(identity, {
    targetSha256: requested.targetSha256,
    targetVersion: requested.targetVersion,
  });
}
