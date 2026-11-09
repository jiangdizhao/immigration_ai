/**
 * Phase 13 M9-B — the M8 staff/handoff observation boundary.
 *
 * ## Why this module exists (security review artifact)
 *
 * `SubmissionAuthorizationService.transitionHandoff` lets an **assigned staff** actor
 * accept a handoff. To decide whether the handoff is still current it must read the
 * exact M8.1 package that the *customer* created. The M8.1 package view is deliberately
 * customer-authorized and refuses a staff actor (`actor_not_eligible`), so the accept
 * path evaluates that one read under the customer's identity:
 *
 *   staff request → requireStaff (role + active M4-002 assignment + handoff authority)
 *                 → recipient check (the named recipient only)
 *                 → exact-version package read AS the customer
 *                 → boolean currency gate (no content crosses back)
 *
 * That substitution is bounded by design, but it was implicit. This module names it,
 * types it, and makes the invariants executable so the independent security review has a
 * single place to inspect:
 *
 *   1. the read happens **only** for a handoff the customer already created and
 *      authorized, bound to one exact `packageVersionId` + `manifestSha256`;
 *   2. the result is a three-value currency outcome — never package content, never a
 *      package list, never a document, a fact, a chat or a payment record;
 *   3. the staff-visible reason codes stay coarse (`handoff_not_current`), so the
 *      customer's internal readiness detail is not disclosed;
 *   4. the whole path is unreachable in production while the handoff authority port is
 *      `unavailableHandoffAuthority`, which it currently is.
 *
 * This module does not grant authority. It cannot be used to read content.
 */

export const STAFF_OBSERVATION_PURPOSE = "handoff_currency_check" as const;

/**
 * Proof that a read occurred under another actor's authority, and why. Carrying this as
 * an explicit value (rather than an inline `actorUserId` override) keeps the substitution
 * visible at every call site and auditable in tests.
 */
export type CustomerScopedObservation = {
  readonly purpose: typeof STAFF_OBSERVATION_PURPOSE;
  /** The customer whose authority the read used. Never the staff actor. */
  readonly observedAsUserId: string;
  /** The staff actor on whose behalf the observation was performed. */
  readonly requestedByStaffUserId: string;
  /** Exact handoff binding the observation is limited to. */
  readonly boundPackageVersionId: string;
  readonly boundManifestSha256: string;
};

export const STAFF_OBSERVATION_OUTCOMES = [
  /** The exact package the customer authorized is still the current one. */
  "current",
  /** The package moved, or no longer matches the bound version/hash. */
  "not_current",
  /** The package could not be observed at all; never treated as current. */
  "unknown",
] as const;
export type StaffObservationOutcome =
  (typeof STAFF_OBSERVATION_OUTCOMES)[number];

export type StaffObservationResult = {
  readonly outcome: StaffObservationOutcome;
  /**
   * The reason code the **staff** actor may see. Deliberately coarse: it must not reveal
   * package status, readiness, disclosures or authorization detail.
   */
  readonly staffVisibleReasonCode: string | null;
  /** Structured audit marker; contains identifiers only. */
  readonly observation: CustomerScopedObservation;
};

/**
 * The content fields that must never cross this boundary. Kept as data so a test (and a
 * reviewer) can assert the result object has none of them.
 */
export const FORBIDDEN_STAFF_OBSERVATION_FIELDS = [
  "manifest",
  "packages",
  "confirmations",
  "review",
  "items",
  "content",
  "facts",
  "documents",
  "messages",
  "chats",
  "payments",
  "readiness",
] as const;

/**
 * Observes package currency for a staff handoff accept, under the customer's authority.
 *
 * Pure: the caller performs the customer-scoped read and passes the *result identity*
 * only. A `null` observation means the read failed or was refused, which is `unknown`
 * — never `current`.
 */
export function observeHandoffPackageCurrency(input: {
  readonly staffActorUserId: string;
  readonly handoffRequestedByUserId: string;
  readonly boundPackageVersionId: string;
  readonly boundManifestSha256: string;
  readonly observedCurrentPackage: {
    readonly packageVersionId: string;
    readonly manifestSha256: string;
  } | null;
}): StaffObservationResult {
  const observation: CustomerScopedObservation = {
    boundManifestSha256: input.boundManifestSha256,
    boundPackageVersionId: input.boundPackageVersionId,
    observedAsUserId: input.handoffRequestedByUserId,
    purpose: STAFF_OBSERVATION_PURPOSE,
    requestedByStaffUserId: input.staffActorUserId,
  };
  const current = input.observedCurrentPackage;
  if (current === null) {
    return {
      observation,
      outcome: "unknown",
      staffVisibleReasonCode: "handoff_state_unavailable",
    };
  }
  if (
    current.packageVersionId !== input.boundPackageVersionId ||
    current.manifestSha256 !== input.boundManifestSha256
  ) {
    return {
      observation,
      outcome: "not_current",
      staffVisibleReasonCode: "handoff_not_current",
    };
  }
  return { observation, outcome: "current", staffVisibleReasonCode: null };
}
