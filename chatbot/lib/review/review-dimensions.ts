/**
 * Phase 13 M9-B — the exact-version review contract.
 *
 * The Picture3 surface separates three things that must never be collapsed into one
 * "approved" badge:
 *
 *   A. AI checking           — an actual checker result, or an explicit "unsupported".
 *   B. Customer confirmation — a version-bound confirmation record.
 *   C. Professional review   — an M4-006 review request/decision.
 *
 * This module is **pure**. It describes only states that existing services can really
 * report; it never derives a legal conclusion, an approval, a score or a readiness
 * verdict. `unsupported` / `unavailable` are first-class answers, so a missing backend
 * capability can never be displayed as success.
 */

export const REVIEW_AI_CHECK_STATES = [
  /** An authorized checker produced a result for this exact version. */
  "checked",
  /** A checker ran and reported a problem with this exact version. */
  "failed",
  /** A checker exists but this exact version was never checked. */
  "not_checked",
  /** No checker is integrated for this artifact kind at all. */
  "unsupported",
  /** The checker could not be reached. */
  "unavailable",
] as const;
export type ReviewAiCheckState = (typeof REVIEW_AI_CHECK_STATES)[number];

export const REVIEW_CONFIRMATION_STATES = [
  /** A confirmation bound to this exact version is still current. */
  "confirmed",
  /** A confirmation exists but no longer applies to this exact version. */
  "stale",
  "not_confirmed",
  /** This artifact kind has no customer-confirmation workflow. */
  "not_applicable",
  "unavailable",
] as const;
export type ReviewConfirmationState =
  (typeof REVIEW_CONFIRMATION_STATES)[number];

export const REVIEW_PROFESSIONAL_STATES = [
  "not_requested",
  "requested",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "invalidated",
  /** M4-006 cannot review this target kind/purpose. */
  "unsupported",
  /** Professional authority, credential verification or the target is unavailable. */
  "unavailable",
] as const;
export type ReviewProfessionalState =
  (typeof REVIEW_PROFESSIONAL_STATES)[number];

export const REVIEW_PROFESSIONAL_AVAILABILITY_STATES = [
  /** The workflow is configured and reachable; a request may be attempted. */
  "available",
  /** `PHASE13_PROFESSIONAL_REVIEW_ENABLED` is off, so the surface is hidden. */
  "disabled",
  /** Enabled, but authority/credential/target-provider composition is fail-closed. */
  "unavailable",
] as const;
export type ReviewProfessionalAvailabilityState =
  (typeof REVIEW_PROFESSIONAL_AVAILABILITY_STATES)[number];

export const REVIEW_AI_CHECK_AVAILABILITY_STATES = [
  "available",
  /**
   * No exact-version AI checker is integrated. This is the current truthful state:
   * M2 document processing is closed and no M5/M6/M8 artifact checker exists.
   */
  "unsupported",
] as const;
export type ReviewAiCheckAvailabilityState =
  (typeof REVIEW_AI_CHECK_AVAILABILITY_STATES)[number];

/** A typed state plus the reason it holds. A reason is never a legal conclusion. */
export type ReviewDimension<TState extends string> = {
  readonly state: TState;
  readonly reasonCode: string | null;
};

/**
 * Stable identity of one exact version. `contentSha256` is optional because a
 * metadata-only artifact legitimately has no content digest; the *binding* digest is
 * then absent too and the UI must say so instead of fabricating one.
 */
export type ExactVersionRef = {
  readonly targetKind: string;
  readonly targetId: string;
  readonly targetVersion: number;
  readonly contentSha256: string | null;
  /**
   * Canonical digest of the whole identity (kind + id + version + content digest),
   * when the owning service exposes one. Never computed here from content.
   */
  readonly bindingSha256: string | null;
};

export function exactVersionKey(input: {
  readonly targetKind: string;
  readonly targetId: string;
  readonly targetVersion: number;
}): string {
  return `${input.targetKind}:${input.targetId}:v${input.targetVersion}`;
}

export function sameExactVersion(
  left: Pick<ExactVersionRef, "targetId" | "targetKind" | "targetVersion">,
  right: Pick<ExactVersionRef, "targetId" | "targetKind" | "targetVersion">
): boolean {
  return (
    left.targetKind === right.targetKind &&
    left.targetId === right.targetId &&
    left.targetVersion === right.targetVersion
  );
}

/**
 * A professional approval may be presented as current only when the review service
 * itself says the exact version still matches and the authority is still valid. This
 * helper only refuses the *presentation*; it never upgrades a state.
 */
export function professionalApprovalIsCurrent(
  dimension: ReviewDimension<ReviewProfessionalState>
): boolean {
  return dimension.state === "approved";
}

/** States in which a *new* customer review request is meaningful. */
export function reviewRequestIsPossible(
  state: ReviewProfessionalState
): boolean {
  return (
    state === "not_requested" || state === "rejected" || state === "invalidated"
  );
}
