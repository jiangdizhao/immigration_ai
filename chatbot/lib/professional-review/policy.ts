import {
  canonicalJson,
  type ManagedTargetIdentity,
  type ManagedTargetPurpose,
  managedTargetIdentitySha256,
  sameManagedTargetVersion,
  sha256Hex,
} from "@/lib/managed-target/policy";

/**
 * Phase 13 M4-006 professional review policy.
 *
 * Pure, deterministic and side-effect free. The workflow is deliberately narrow:
 * a review is bound to one immutable target identity, decisions are append-only,
 * and an approval is never transferred, refreshed or re-derived for a different
 * target, revision or authority state.
 */

export const PROFESSIONAL_REVIEW_POLICY_VERSION =
  "phase13-m4-006-professional-review-v1" as const;

export const PROFESSIONAL_REVIEW_STATES = [
  "requested",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "invalidated",
] as const;
export type ProfessionalReviewState =
  (typeof PROFESSIONAL_REVIEW_STATES)[number];

export const PROFESSIONAL_REVIEW_ACTIONS = [
  "start_review",
  "request_changes",
  "approve",
  "reject",
  "invalidate",
] as const;
export type ProfessionalReviewAction =
  (typeof PROFESSIONAL_REVIEW_ACTIONS)[number];

export const PROFESSIONAL_REVIEW_SCOPES = [
  "eligibility_review",
  "document_completeness",
  "form_accuracy",
  "legal_advice_alignment",
] as const;
export type ProfessionalReviewScope =
  (typeof PROFESSIONAL_REVIEW_SCOPES)[number];

/** Actions that persist a decision record (start_review included: it is
 *  recorded as the reviewer taking the request into review). */
export const PROFESSIONAL_REVIEW_DECISION_ACTIONS = [
  "start_review",
  "request_changes",
  "approve",
  "reject",
  "invalidate",
] as const;
export type ProfessionalReviewDecisionAction = ProfessionalReviewAction;

/**
 * Frozen transition graph. There is no `changes_requested → in_review` edge: a
 * revised package is a new immutable target and therefore a new review request.
 * That is the mechanism which prevents an old approval from being silently
 * revalidated.
 */
const ALLOWED_FROM: Record<
  ProfessionalReviewAction,
  readonly ProfessionalReviewState[]
> = {
  start_review: ["requested"],
  request_changes: ["in_review"],
  approve: ["in_review"],
  reject: ["in_review"],
  invalidate: [
    "requested",
    "in_review",
    "changes_requested",
    "approved",
    "rejected",
  ],
};

export function professionalReviewTransitionAllowed(
  state: ProfessionalReviewState,
  action: ProfessionalReviewAction
): boolean {
  return ALLOWED_FROM[action].includes(state);
}

export function isProfessionalReviewAction(
  value: unknown
): value is ProfessionalReviewAction {
  return (
    typeof value === "string" &&
    (PROFESSIONAL_REVIEW_ACTIONS as readonly string[]).includes(value)
  );
}

export function isProfessionalReviewScope(
  value: unknown
): value is ProfessionalReviewScope {
  return (
    typeof value === "string" &&
    (PROFESSIONAL_REVIEW_SCOPES as readonly string[]).includes(value)
  );
}

/** Bounded, duplicate-free, non-empty scope list. */
export function professionalReviewScopeValid(
  scope: readonly unknown[]
): scope is readonly ProfessionalReviewScope[] {
  if (scope.length === 0 || scope.length > PROFESSIONAL_REVIEW_SCOPES.length) {
    return false;
  }
  const seen = new Set<string>();
  for (const entry of scope) {
    if (!isProfessionalReviewScope(entry) || seen.has(entry)) {
      return false;
    }
    seen.add(entry);
  }
  return true;
}

export function normalizeProfessionalReviewScope(
  scope: readonly ProfessionalReviewScope[]
): ProfessionalReviewScope[] {
  return [...scope].sort();
}

export type ProfessionalReviewDecisionRecord = {
  action: ProfessionalReviewDecisionAction;
  decidedByUserId: string;
  decidedAt: string;
  /** Exact target the approver saw, re-checked against the provider. */
  boundTargetVersion: number;
  boundTargetSha256: string;
  authorityCode: string;
  credentialCode: string | null;
  /** Only a digest of any free-text note is retained. */
  commentSha256: string | null;
  reasonCode: string | null;
  revision: number;
};

export type ProfessionalReviewRecord = {
  reviewRequestId: string;
  projectId: string;
  target: ManagedTargetIdentity;
  /** Canonical binding of `target`; compares in O(1) and cannot be forged. */
  targetBindingSha256: string;
  reviewPurpose: ManagedTargetPurpose;
  reviewScope: readonly ProfessionalReviewScope[];
  state: ProfessionalReviewState;
  revision: number;
  requestedByUserId: string;
  requestedAt: string;
  reviewerUserId: string | null;
  decision: ProfessionalReviewDecisionRecord | null;
  operationId: string;
  requestSha256: string;
};

export type ProfessionalReviewOperationIdentity = {
  action: ProfessionalReviewDecisionAction;
  actorUserId: string;
  boundTargetSha256: string;
  boundTargetVersion: number;
  commentSha256: string | null;
  expectedRevision: number;
  projectId: string;
  reasonCode: string | null;
  reviewRequestId: string;
};

/**
 * Canonical idempotency identity: the same operationId with a changed semantic
 * request (different action, target, revision, actor or note) is a conflict, not
 * a replay.
 */
export function professionalReviewOperationSha256(
  identity: ProfessionalReviewOperationIdentity
): string {
  return sha256Hex(canonicalJson(identity));
}

export function professionalReviewRequestOperationIdentity(input: {
  actorUserId: string;
  projectId: string;
  reviewPurpose: ManagedTargetPurpose;
  reviewScope: readonly ProfessionalReviewScope[];
  targetBindingSha256: string;
}): string {
  return sha256Hex(
    canonicalJson({
      action: "create_request",
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      reviewPurpose: input.reviewPurpose,
      reviewScope: normalizeProfessionalReviewScope(input.reviewScope),
      targetBindingSha256: input.targetBindingSha256,
    })
  );
}

export function professionalReviewBinding(
  target: ManagedTargetIdentity
): string {
  return managedTargetIdentitySha256(target);
}

export const PROFESSIONAL_REVIEW_VALIDITY_REASONS = [
  "review_request_missing",
  "review_not_approved",
  "review_target_changed",
  "review_authority_revoked",
  "professional_credential_unverified",
  "professional_credential_unavailable",
  "review_state_unavailable",
] as const;
export type ProfessionalReviewValidityReason =
  (typeof PROFESSIONAL_REVIEW_VALIDITY_REASONS)[number];

export type ProfessionalReviewValidity =
  | {
      status: "valid";
      reviewRequestId: string;
      reviewerUserId: string;
      revision: number;
      targetBindingSha256: string;
      policyVersion: typeof PROFESSIONAL_REVIEW_POLICY_VERSION;
    }
  | {
      status: "invalid" | "unknown";
      reasonCode: ProfessionalReviewValidityReason;
      reviewRequestId: string | null;
    };

export type ProfessionalReviewAssignmentObservation =
  | { status: "active"; reviewerUserId: string | null }
  | { status: "pending" | "revoked" | "missing" }
  | "unavailable";

export type ProfessionalCredentialObservation =
  | { status: "verified"; credentialCode: string }
  | { status: "unverified" }
  | "unavailable";

/**
 * Current validity of a stored review against *today's* authoritative state.
 *
 * Ordering is deterministic and frozen. An approval that cannot be re-confirmed
 * is never `valid`: an unresolvable target, unreachable assignment source or
 * unreachable credential verifier yields `unknown`, while a definite negative
 * (target changed, assignment revoked, credential unverified) yields `invalid`.
 */
export function evaluateProfessionalReviewValidity(input: {
  record: ProfessionalReviewRecord | null;
  currentTarget: Pick<
    ManagedTargetIdentity,
    "targetVersion" | "targetSha256"
  > | null;
  providerTrustsTarget: boolean;
  assignment: ProfessionalReviewAssignmentObservation;
  credential: ProfessionalCredentialObservation;
}): ProfessionalReviewValidity {
  const { record } = input;
  if (!record) {
    return {
      status: "invalid",
      reasonCode: "review_request_missing",
      reviewRequestId: null,
    };
  }
  const base = { reviewRequestId: record.reviewRequestId } as const;
  if (record.state !== "approved" || !record.decision) {
    return { status: "invalid", reasonCode: "review_not_approved", ...base };
  }
  if (!input.currentTarget || !input.providerTrustsTarget) {
    return {
      status: "unknown",
      reasonCode: "review_state_unavailable",
      ...base,
    };
  }
  if (
    !sameManagedTargetVersion(
      {
        targetSha256: record.decision.boundTargetSha256,
        targetVersion: record.decision.boundTargetVersion,
      },
      input.currentTarget
    )
  ) {
    return { status: "invalid", reasonCode: "review_target_changed", ...base };
  }
  if (input.assignment === "unavailable") {
    return {
      status: "unknown",
      reasonCode: "review_state_unavailable",
      ...base,
    };
  }
  if (input.assignment.status !== "active") {
    return {
      status: "invalid",
      reasonCode: "review_authority_revoked",
      ...base,
    };
  }
  if (
    input.assignment.reviewerUserId &&
    record.reviewerUserId &&
    input.assignment.reviewerUserId !== record.reviewerUserId
  ) {
    return {
      status: "invalid",
      reasonCode: "review_authority_revoked",
      ...base,
    };
  }
  if (input.credential === "unavailable") {
    return {
      status: "unknown",
      reasonCode: "professional_credential_unavailable",
      ...base,
    };
  }
  if (input.credential.status !== "verified") {
    return {
      status: "invalid",
      reasonCode: "professional_credential_unverified",
      ...base,
    };
  }
  return {
    status: "valid",
    reviewRequestId: record.reviewRequestId,
    reviewerUserId: record.reviewerUserId ?? record.decision.decidedByUserId,
    revision: record.revision,
    targetBindingSha256: record.targetBindingSha256,
    policyVersion: PROFESSIONAL_REVIEW_POLICY_VERSION,
  };
}

/**
 * Feature gate. Default OFF: with no approved professional authority, no
 * credential registry and no package provider, the surface must stay hidden.
 */
export function isProfessionalReviewEnabled(
  value: string | undefined = process.env.PHASE13_PROFESSIONAL_REVIEW_ENABLED
): boolean {
  return value?.trim().toLowerCase() === "true";
}
