import { MANAGED_TARGET_KINDS } from "@/lib/managed-target/policy";
import type { ProjectArtifactsSummary } from "@/lib/workspace/project-artifacts";
import type { ReviewCandidate } from "./review-summary";

/**
 * Phase 13 M9-B — turns already-authorized read models into review candidates.
 *
 * Both inputs are responses the requesting actor was already allowed to read:
 *
 *   - `ProjectArtifactsSummary` (M9-A R1-05): metadata-only references to M5.1 packages and
 *     M6.2 drafts/snapshots. These have no managed review target, so professional review
 *     reports `unsupported` for them — the truthful answer, because M4-006 can only bind a
 *     review to a managed application target.
 *   - `SubmissionWorkspaceView` (M8.1): immutable exact package versions with the owning
 *     service's own freshness, integrity and confirmation records. These *do* carry a
 *     managed target, so they are the only versions a review request can bind to.
 *
 * Nothing here computes a digest, a freshness verdict or a confirmation result.
 */

/** The only artifact kinds M4-006 can bind a review to (via an M8.1 package). */
export const REVIEW_APPLICABLE_ARTIFACT_KIND = "submission_package" as const;

type ArtifactReference = ProjectArtifactsSummary["references"][number];

export function candidatesFromArtifacts(
  artifacts: ProjectArtifactsSummary | null
): ReviewCandidate[] {
  if (!artifacts) {
    return [];
  }
  return artifacts.references.map((reference: ArtifactReference) => ({
    artifactKind: reference.kind,
    confirmations: [],
    createdAt: reference.createdAt,
    digest: reference.digest,
    // M5.1/M6.2 artifacts are not M4-006 review targets.
    integrityVerified: null,
    managedTarget: null,
    ownerView: reference.ownerView,
    referenceId: reference.referenceId,
    stale: reference.stale,
    status: reference.status,
    targetId: reference.targetId,
    version: reference.version,
  }));
}

/**
 * One M8.1 package version. The owning service already decided authorization, freshness
 * and confirmation validity, so this mapping copies and never re-derives.
 */
export type SubmissionPackageCandidateInput = {
  readonly targetKind: string;
  readonly targetId: string;
  readonly version: {
    readonly packageVersionId: string;
    readonly version: number;
    readonly targetVersion: number;
    readonly manifestSha256: string;
    readonly createdAt: string;
    readonly integrityVerified: boolean;
    readonly freshness: { readonly current: boolean };
    readonly confirmations: readonly {
      readonly confirmationId: string;
      readonly current: boolean;
    }[];
  };
};

export function candidateFromSubmissionPackage(
  input: SubmissionPackageCandidateInput
): ReviewCandidate {
  return {
    artifactKind: REVIEW_APPLICABLE_ARTIFACT_KIND,
    confirmations: input.version.confirmations.map((confirmation) => ({
      confirmationId: confirmation.confirmationId,
      current: confirmation.current,
    })),
    createdAt: input.version.createdAt,
    digest: input.version.manifestSha256,
    integrityVerified: input.version.integrityVerified,
    managedTarget: {
      targetId: input.targetId,
      targetKind: input.targetKind,
      targetSha256: input.version.manifestSha256,
      targetVersion: input.version.targetVersion,
    },
    ownerView:
      input.targetKind === "student_500_visa_application"
        ? "student500"
        : "applications",
    referenceId: input.version.packageVersionId,
    stale: !input.version.freshness.current,
    status: input.version.freshness.current ? "current" : "stale",
    targetId: input.targetId,
    version: input.version.version,
  };
}

/** True when the kind is a managed target M4-006 could ever review. */
export function isReviewableTargetKind(targetKind: string): boolean {
  return (MANAGED_TARGET_KINDS as readonly string[]).includes(targetKind);
}

/**
 * Stable dedupe key so the same exact version can never be listed twice (for example when
 * an artifact reference and a package version describe the same package).
 */
export function reviewCandidateKey(candidate: ReviewCandidate): string {
  return `${candidate.artifactKind}:${candidate.referenceId}`;
}

export function dedupeCandidates(
  candidates: readonly ReviewCandidate[]
): ReviewCandidate[] {
  const seen = new Set<string>();
  const unique: ReviewCandidate[] = [];
  for (const candidate of candidates) {
    const key = reviewCandidateKey(candidate);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}
