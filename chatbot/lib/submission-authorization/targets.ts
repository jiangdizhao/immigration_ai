import {
  type ManagedTargetIdentity,
  type ManagedTargetKind,
  managedTargetIdentitySha256,
  sameManagedTargetVersion,
} from "@/lib/managed-target/policy";
import type {
  ManagedTargetObservation,
  ManagedTargetProvider,
} from "@/lib/professional-review/target-provider";
import type { ExactPackageEvidence } from "./policy";

/**
 * Phase 13 M8.2 - M4 `ManagedTargetProvider` adapter over M8.1 packages.
 *
 * M4-006/M4-007 historically resolved no target because no package builder existed.
 * M8.1 now supplies immutable exact-version packages, so this adapter lets the
 * existing readiness evaluator see a real, trusted target identity.
 *
 * Three limits are deliberate:
 *
 *   1. it resolves only the *current* package version - a superseded or stale version
 *      is refused rather than reviewed;
 *   2. a package identity is not professional approval: the adapter reports identity
 *      only, and M4 still requires an approved review, a verified credential and a
 *      satisfied engagement;
 *   3. `resolve` is synchronous, exactly like the M4 port, so the observation is
 *      prefetched from the M8.1 read and never fetched inside the evaluator. That
 *      keeps the evaluator deterministic and prevents an I/O failure from being
 *      mistaken for a resolved target.
 */

export type M8PackageTargetObservationInput = {
  readonly projectId: string;
  readonly targetKind: string;
  readonly targetId: string;
  readonly currentPackageVersionId: string | null;
  readonly packages: readonly ExactPackageEvidence[];
};

/**
 * Turn authoritative M8.1 package state into an M4 target observation.
 *
 * A stale, superseded, tampered or absent package is never reported as resolved:
 * each failure maps onto a distinct M4 status so the readiness result can explain it.
 */
export function observeM8PackageTarget(
  input: M8PackageTargetObservationInput
): ManagedTargetObservation {
  if (
    input.targetKind !== "managed_school_application" &&
    input.targetKind !== "student_500_visa_application"
  ) {
    return { status: "unsupported_kind", targetKind: input.targetKind };
  }
  if (input.packages.length === 0 || input.currentPackageVersionId === null) {
    return { status: "not_found" };
  }
  const current =
    input.packages.find(
      (entry) => entry.packageVersionId === input.currentPackageVersionId
    ) ?? null;
  if (current === null) {
    return { status: "not_found" };
  }
  if (!current.integrityVerified) {
    return { reasonCode: "package_integrity_unverified", status: "untrusted" };
  }
  if (!current.freshness.current) {
    // A stale package cannot be reviewed: its content is no longer the current state
    // of the application, so a review of it would authorize the wrong thing.
    return { reasonCode: "package_not_current", status: "untrusted" };
  }
  if (current.version <= 0 || current.manifestSha256.length !== 64) {
    return { reasonCode: "package_identity_invalid", status: "untrusted" };
  }
  const identity: ManagedTargetIdentity = {
    projectId: input.projectId,
    targetId: input.targetId,
    targetKind: input.targetKind as ManagedTargetKind,
    targetSha256: current.manifestSha256,
    targetVersion: current.version,
  };
  return {
    identity,
    provenance: "trusted_provider",
    resolvedAt: new Date().toISOString(),
    status: "resolved",
  };
}

/**
 * Provider over one prefetched observation. It can only ever answer with the
 * observation it was built from, so nothing inside the evaluator can widen it.
 */
export function createPrefetchedTargetProvider(
  observation: ManagedTargetObservation
): ManagedTargetProvider {
  return {
    code: "phase13_m8_1_submission_package_target_provider",
    provenance: "trusted_provider",
    resolve() {
      return observation;
    },
  };
}

/** Canonical binding hash of a resolved M8.1 package identity, for audit records. */
export function m8PackageTargetBindingSha256(
  identity: ManagedTargetIdentity
): string {
  return managedTargetIdentitySha256(identity);
}

/**
 * True only when the observation is exactly the target the caller asked about, at the
 * exact version and digest it claimed. Identity-only or version-only matches are false.
 */
export function m8PackageTargetMatches(
  observation: ManagedTargetObservation,
  requested: {
    readonly projectId: string;
    readonly targetKind: string;
    readonly targetId: string;
    readonly targetVersion: number;
    readonly targetSha256: string;
  }
): boolean {
  if (observation.status !== "resolved") {
    return false;
  }
  const identity = observation.identity;
  return (
    identity.projectId === requested.projectId &&
    identity.targetKind === requested.targetKind &&
    identity.targetId === requested.targetId &&
    sameManagedTargetVersion(identity, {
      targetSha256: requested.targetSha256,
      targetVersion: requested.targetVersion,
    })
  );
}
