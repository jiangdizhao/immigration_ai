import {
  type ReviewAiCheckAvailabilityState,
  type ReviewAiCheckState,
  type ReviewConfirmationState,
  type ReviewDimension,
  type ReviewProfessionalAvailabilityState,
  type ReviewProfessionalState,
  reviewRequestIsPossible,
} from "./review-dimensions";

/**
 * Phase 13 M9-B — the bounded, per-Project review read model.
 *
 * Composition only. Every candidate is metadata an existing authorized service already
 * returned for this actor; nothing here reads storage, widens access or infers a
 * professional outcome. The honest "no" answers stay distinct:
 *
 *   - `unsupported` — the contract has no such capability for this kind;
 *   - `unavailable` — the capability exists but its authority is fail-closed;
 *   - `disabled`    — the operator feature flag is off;
 *   - `not_*`       — reachable, simply no record yet.
 */

export const MAX_PROJECT_REVIEW_ITEMS = 20;

export type ReviewTargetIdentity = {
  readonly targetKind: string;
  readonly targetId: string;
  readonly targetVersion: number;
  readonly targetSha256: string | null;
};

const SHA256_RE = /^[0-9a-f]{64}$/u;

/**
 * An M4-006 review request is bound to `targetKind + targetId + targetVersion +
 * targetSha256`. If any of those is missing the request could not be bound at all, so a
 * candidate with an incomplete identity must never be offered as requestable. This only
 * describes the identity; it never authorizes a request.
 */
export function reviewTargetIdentityComplete(
  target: ReviewTargetIdentity
): boolean {
  return (
    target.targetKind.trim().length > 0 &&
    target.targetId.trim().length > 0 &&
    Number.isSafeInteger(target.targetVersion) &&
    target.targetVersion >= 1 &&
    typeof target.targetSha256 === "string" &&
    SHA256_RE.test(target.targetSha256)
  );
}

/** Why a candidate could not accept a *new* review request, or `null` when it can. */
export function reviewRequestIneligibility(input: {
  readonly availabilityState: ReviewProfessionalAvailabilityState;
  readonly availabilityReasonCode: string | null;
  readonly hasTarget: boolean;
  readonly identityComplete: boolean;
  readonly stale: boolean;
  readonly integrityVerified: boolean | null;
  readonly professionalState: ReviewProfessionalState;
}): string | null {
  // Structural first: a kind M4-006 cannot bind, or an incomplete exact identity, can
  // never be requested regardless of what else is available.
  if (!input.hasTarget) {
    return "review_target_kind_unsupported";
  }
  if (!input.identityComplete) {
    return "review_target_identity_incomplete";
  }
  // Global workflow availability (authority / credential registry / target provider).
  if (input.availabilityState !== "available") {
    return input.availabilityReasonCode ?? "professional_review_disabled";
  }
  // Per-version currency: a superseded version must not be sent for review, because the
  // reviewer would be looking at content the customer has already replaced.
  if (input.stale) {
    return "exact_version_stale";
  }
  // A failed integrity check is a definite negative, never a reviewable state.
  if (input.integrityVerified === false) {
    return "package_integrity_unverified";
  }
  return reviewRequestIsPossible(input.professionalState)
    ? null
    : "review_state_not_requestable";
}

/**
 * One exact version the actor is already authorized to see.
 *
 * The caller builds this from an existing service response: an M9-A artifact reference
 * (M5.1 package, M6.2 GS draft/snapshot) or an M8.1 submission package version. A
 * candidate never contains content.
 */
export type ReviewCandidate = {
  /** Stable kind vocabulary: M9-A artifact kind, or `submission_package`. */
  readonly artifactKind: string;
  /** Real persisted id of this exact version (never fabricated). */
  readonly referenceId: string;
  readonly targetId: string | null;
  readonly version: number | null;
  /** The owning service's own status vocabulary, verbatim. */
  readonly status: string | null;
  /** Content digest, only when the owning service exposes one. */
  readonly digest: string | null;
  readonly createdAt: string | null;
  readonly stale: boolean;
  /** Existing workspace view that owns this artifact; navigation only. */
  readonly ownerView: string;
  /**
   * The managed review target this version maps to, or `null` when M4-006 has no target
   * kind for it. A `null` target can never be requested, approved or inherited.
   */
  readonly managedTarget: {
    readonly targetKind: string;
    readonly targetId: string;
    readonly targetVersion: number;
    readonly targetSha256: string | null;
  } | null;
  /** Version-bound confirmations the owning service reported for this exact version. */
  readonly confirmations: readonly {
    readonly confirmationId: string;
    readonly current: boolean;
  }[];
  /** `null` when the kind has no separately recorded integrity result. */
  readonly integrityVerified: boolean | null;
};

export type ReviewItem = {
  readonly artifactKind: string;
  readonly referenceId: string;
  readonly exactVersion: {
    readonly targetKind: string;
    readonly targetId: string;
    readonly targetVersion: number;
    readonly contentSha256: string | null;
    readonly bindingSha256: string | null;
  };
  readonly status: string | null;
  readonly stale: boolean;
  readonly createdAt: string | null;
  readonly ownerView: string;
  readonly reviewTarget: ReviewTargetIdentity | null;
  readonly aiCheck: ReviewDimension<ReviewAiCheckState>;
  readonly confirmation: ReviewDimension<ReviewConfirmationState> & {
    readonly confirmationIds: readonly string[];
  };
  readonly professionalReview: ReviewDimension<ReviewProfessionalState> & {
    readonly reviewRequestId: string | null;
  };
  /** Whether a *new* review request could be attempted for this exact version. */
  readonly requestEligibility: {
    readonly allowed: boolean;
    readonly reasonCode: string | null;
  };
  /** Separately recorded deterministic integrity result (never an AI check). */
  readonly integrity: {
    readonly state: "verified" | "unverified" | "unknown";
    readonly reasonCode: string | null;
  };
};

export type ReviewProfessionalAvailability = {
  readonly state: ReviewProfessionalAvailabilityState;
  readonly reasonCode: string | null;
  readonly authorityCode: string | null;
  readonly credentialVerifierCode: string | null;
  readonly targetProviderCode: string | null;
  readonly purpose: string;
  readonly supportedTargetKinds: readonly string[];
};

export type ReviewProfessionalObservation = {
  readonly reviewRequestId: string;
  readonly state: string;
  readonly targetVersion: number;
  /** `valid` only when the review service itself re-confirmed the binding. */
  readonly validity: "valid" | "invalid" | "unknown";
};

export type ProjectReviewSummary = {
  readonly projectId: string;
  readonly items: readonly ReviewItem[];
  readonly truncated: boolean;
  readonly professionalReview: ReviewProfessionalAvailability;
  readonly aiChecking: {
    readonly state: ReviewAiCheckAvailabilityState;
    readonly reasonCode: string | null;
  };
  /**
   * Phase 13 M9-B correction 3 — what the artifact source actually did.
   *
   * An authorized list with no rows (`empty`) and a source that could not be read
   * (`unavailable`) or was not readable for this actor (`restricted`) are different facts,
   * and the surface must say which one it is. `partial` means at least one source was
   * readable and at least one was not, so the item list is knowingly incomplete.
   */
  readonly artifactSource: {
    readonly state:
      | "available"
      | "empty"
      | "partial"
      | "disabled"
      | "restricted"
      | "unavailable";
    readonly reasonCode: string | null;
  };
  readonly limits: { readonly maxItems: number };
};

export const ARTIFACT_SOURCE_STATES = [
  "available",
  "empty",
  "partial",
  "disabled",
  "restricted",
  "unavailable",
] as const;
export type ArtifactSourceState = (typeof ARTIFACT_SOURCE_STATES)[number];

/** Outcome of one artifact/package read, reported as a fact rather than an exception. */
export type ReviewSourceReadState =
  | "ok"
  | "disabled"
  | "restricted"
  | "unavailable";

/**
 * Describes the combined artifact sources.
 *
 * Pure and total: it never inspects an exception, a stack trace or a database error, and it
 * carries no identity beyond the state and a stable reason code.
 */
export function describeArtifactSource(input: {
  readonly artifacts: Exclude<ReviewSourceReadState, "ok"> | null;
  readonly hasItems: boolean;
  readonly submission: Exclude<ReviewSourceReadState, "ok"> | null;
}): ProjectReviewSummary["artifactSource"] {
  const failures = [input.artifacts, input.submission].filter(
    (entry): entry is Exclude<ReviewSourceReadState, "ok"> => entry !== null
  );
  if (failures.length === 0) {
    // Every source answered. No items is a genuine empty authorized list.
    return input.hasItems
      ? { reasonCode: null, state: "available" }
      : { reasonCode: null, state: "empty" };
  }
  // Something was readable and something was not: the list is knowingly incomplete, and
  // saying so is more truthful than either "empty" or a total-failure state.
  if (input.hasItems) {
    return { reasonCode: "artifact_source_partial", state: "partial" };
  }
  const blocked = failures.find(
    (entry) => entry === "unavailable" || entry === "restricted"
  );
  if (blocked === "restricted") {
    return { reasonCode: "artifact_source_restricted", state: "restricted" };
  }
  if (blocked === "unavailable") {
    return { reasonCode: "artifact_source_unavailable", state: "unavailable" };
  }
  return { reasonCode: "artifact_source_disabled", state: "disabled" };
}

const PROFESSIONAL_STATE_ALIASES: Record<string, ReviewProfessionalState> = {
  approved: "approved",
  changes_requested: "changes_requested",
  in_review: "in_review",
  invalidated: "invalidated",
  rejected: "rejected",
  requested: "requested",
};

function professionalDimension(input: {
  availability: ReviewProfessionalAvailability;
  hasTarget: boolean;
  observation: ReviewProfessionalObservation | null;
}): ReviewDimension<ReviewProfessionalState> & {
  reviewRequestId: string | null;
} {
  if (!input.hasTarget) {
    return {
      reasonCode: "review_target_kind_unsupported",
      reviewRequestId: null,
      state: "unsupported",
    };
  }
  if (input.availability.state === "disabled") {
    return {
      reasonCode: "professional_review_disabled",
      reviewRequestId: null,
      state: "unavailable",
    };
  }
  if (input.availability.state === "unavailable") {
    return {
      reasonCode:
        input.availability.reasonCode ?? "professional_authority_unavailable",
      reviewRequestId: null,
      state: "unavailable",
    };
  }
  const observation = input.observation;
  if (!observation) {
    return { reasonCode: null, reviewRequestId: null, state: "not_requested" };
  }
  // A decision the review service can no longer re-confirm is never presented as
  // current, and an approval never transfers to another exact version.
  if (observation.validity === "invalid") {
    return {
      reasonCode: "review_no_longer_current",
      reviewRequestId: observation.reviewRequestId,
      state: "invalidated",
    };
  }
  if (observation.validity === "unknown") {
    return {
      reasonCode: "review_state_unavailable",
      reviewRequestId: observation.reviewRequestId,
      state: "unavailable",
    };
  }
  return {
    reasonCode: null,
    reviewRequestId: observation.reviewRequestId,
    state: PROFESSIONAL_STATE_ALIASES[observation.state] ?? "unavailable",
  };
}

function confirmationDimension(
  confirmations: ReviewCandidate["confirmations"]
): ReviewDimension<ReviewConfirmationState> & {
  confirmationIds: readonly string[];
} {
  const current = confirmations.filter((entry) => entry.current);
  if (current.length > 0) {
    return {
      confirmationIds: current.map((entry) => entry.confirmationId),
      reasonCode: null,
      state: "confirmed",
    };
  }
  if (confirmations.length > 0) {
    return {
      confirmationIds: [],
      reasonCode: "confirmation_not_current",
      state: "stale",
    };
  }
  return { confirmationIds: [], reasonCode: null, state: "not_confirmed" };
}

function aiCheckDimension(
  availability: ReviewAiCheckAvailabilityState
): ReviewDimension<ReviewAiCheckState> {
  return availability === "available"
    ? { reasonCode: "ai_check_result_missing", state: "not_checked" }
    : { reasonCode: "ai_check_not_integrated", state: "unsupported" };
}

function compareItems(left: ReviewItem, right: ReviewItem): number {
  const leftAt = left.createdAt ?? "";
  const rightAt = right.createdAt ?? "";
  if (leftAt !== rightAt) {
    return rightAt.localeCompare(leftAt);
  }
  const leftKey = `${left.exactVersion.targetKind}:${left.exactVersion.targetId}:${left.exactVersion.targetVersion}`;
  const rightKey = `${right.exactVersion.targetKind}:${right.exactVersion.targetId}:${right.exactVersion.targetVersion}`;
  return leftKey.localeCompare(rightKey);
}

function buildItem(input: {
  availability: ReviewProfessionalAvailability;
  candidate: ReviewCandidate;
  aiCheckAvailability: ReviewAiCheckAvailabilityState;
  observation: ReviewProfessionalObservation | null;
}): ReviewItem {
  const { candidate } = input;
  const target: ReviewTargetIdentity | null =
    candidate.managedTarget &&
    input.availability.supportedTargetKinds.includes(
      candidate.managedTarget.targetKind
    )
      ? {
          targetId: candidate.managedTarget.targetId,
          targetKind: candidate.managedTarget.targetKind,
          targetSha256: candidate.managedTarget.targetSha256,
          targetVersion: candidate.managedTarget.targetVersion,
        }
      : null;
  const professional = professionalDimension({
    availability: input.availability,
    hasTarget: target !== null,
    observation: input.observation,
  });
  // Eligibility is a *presentation* gate; the M4-006 authority port remains the final
  // authority and can still refuse. A stale version, a failed integrity check or an
  // incomplete exact identity can never become requestable merely because the workflow is
  // available.
  const ineligibilityReason = reviewRequestIneligibility({
    availabilityReasonCode: input.availability.reasonCode,
    availabilityState: input.availability.state,
    hasTarget: target !== null,
    identityComplete: target !== null && reviewTargetIdentityComplete(target),
    integrityVerified: candidate.integrityVerified,
    professionalState: professional.state,
    stale: candidate.stale,
  });
  return {
    aiCheck: aiCheckDimension(input.aiCheckAvailability),
    artifactKind: candidate.artifactKind,
    confirmation: confirmationDimension(candidate.confirmations),
    createdAt: candidate.createdAt,
    exactVersion: {
      bindingSha256: null,
      contentSha256: candidate.digest,
      targetId: candidate.targetId ?? candidate.referenceId,
      targetKind: candidate.artifactKind,
      targetVersion: candidate.version ?? 0,
    },
    integrity:
      candidate.integrityVerified === null
        ? { reasonCode: "integrity_not_applicable_to_kind", state: "unknown" }
        : candidate.integrityVerified
          ? { reasonCode: null, state: "verified" }
          : { reasonCode: "package_integrity_unverified", state: "unverified" },
    ownerView: candidate.ownerView,
    professionalReview: professional,
    referenceId: candidate.referenceId,
    requestEligibility: {
      allowed: ineligibilityReason === null,
      reasonCode: ineligibilityReason,
    },
    reviewTarget: target,
    stale: candidate.stale,
    status: candidate.status,
  };
}

/**
 * Builds the review surface from metadata the caller already read.
 *
 * Ordering is deterministic (newest first, then exact key) so a reload never reshuffles
 * the list, and the list is bounded so an aggregate can never become an enumeration tool.
 */
export function buildProjectReviewSummary(input: {
  readonly projectId: string;
  readonly candidates: readonly ReviewCandidate[];
  readonly professional: ReadonlyMap<string, ReviewProfessionalObservation>;
  readonly professionalAvailability: ReviewProfessionalAvailability;
  readonly aiCheckAvailability: ReviewAiCheckAvailabilityState;
  readonly maxItems?: number;
  /**
   * Truthful artifact-source outcome. When omitted the composition assumes every source
   * answered and derives `available`/`empty` from the item list.
   */
  readonly artifactSource?: ProjectReviewSummary["artifactSource"];
}): ProjectReviewSummary {
  const maxItems = input.maxItems ?? MAX_PROJECT_REVIEW_ITEMS;
  const items = input.candidates.map((candidate) =>
    buildItem({
      aiCheckAvailability: input.aiCheckAvailability,
      availability: input.professionalAvailability,
      candidate,
      observation:
        candidate.managedTarget === null
          ? null
          : (input.professional.get(
              `${candidate.managedTarget.targetKind}:${candidate.managedTarget.targetId}:v${candidate.managedTarget.targetVersion}`
            ) ?? null),
    })
  );
  const sorted = [...items].sort(compareItems);
  return {
    aiChecking:
      input.aiCheckAvailability === "available"
        ? { reasonCode: null, state: "available" }
        : { reasonCode: "ai_check_not_integrated", state: "unsupported" },
    artifactSource:
      input.artifactSource ??
      describeArtifactSource({
        artifacts: null,
        hasItems: sorted.length > 0,
        submission: null,
      }),
    items: sorted.slice(0, maxItems),
    limits: { maxItems },
    professionalReview: {
      ...input.professionalAvailability,
      supportedTargetKinds: [
        ...input.professionalAvailability.supportedTargetKinds,
      ],
    },
    projectId: input.projectId,
    truncated: sorted.length > maxItems,
  };
}

/**
 * The honest empty state: nothing was readable, and that is **not** "zero outstanding
 * work". The availability block still explains why.
 */
export function emptyProjectReviewSummary(input: {
  readonly projectId: string;
  readonly professionalAvailability: ReviewProfessionalAvailability;
  readonly aiCheckAvailability: ReviewAiCheckAvailabilityState;
  readonly maxItems?: number;
}): ProjectReviewSummary {
  return buildProjectReviewSummary({
    aiCheckAvailability: input.aiCheckAvailability,
    candidates: [],
    maxItems: input.maxItems,
    professional: new Map(),
    professionalAvailability: input.professionalAvailability,
    projectId: input.projectId,
  });
}
