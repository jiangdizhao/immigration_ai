import {
  DISCLOSURE_RESOURCE_CATEGORIES,
  type DisclosureResourceCategory,
  isGrantableResourceCategory,
} from "./policy";

/**
 * Deterministic customer-to-staff protected resource disclosure evaluation.
 *
 * This evaluator is pure and side-effect free. It returns an explicit decision
 * plus a stable reason code so a future content endpoint must fail closed unless
 * every independent authority is present at read time:
 *
 *   verified staff account + current active M4-002 assignment
 *   + assignment account match + exact M4-004 grant for this resource
 *   owner/recipient/category/resource version/purpose
 *   + still-current resource version.
 *
 * M4-003 thread participation consent and M2 AI-context grants are structurally
 * absent from this input; they can never produce ALLOW.
 */
export const DISCLOSURE_DECISION_REASON_CODES = [
  "allowed",
  "project_inactive",
  "content_access_not_available",
  "actor_not_staff_account",
  "actor_not_verified",
  "assignment_missing",
  "assignment_project_mismatch",
  "assignment_recipient_mismatch",
  "assignment_purpose_mismatch",
  "assignment_account_mismatch",
  "assignment_inactive",
  "requested_category_not_supported",
  "resource_source_unavailable",
  "resource_not_found",
  "resource_project_mismatch",
  "grant_missing",
  "grant_project_mismatch",
  "grant_owner_mismatch",
  "grant_recipient_mismatch",
  "grant_assignment_mismatch",
  "grant_category_mismatch",
  "grant_resource_mismatch",
  "grant_purpose_mismatch",
  "grant_revoked",
  "grant_expired",
  "resource_version_stale",
  "resource_owner_ineligible",
  "resource_observation_mismatch",
] as const;
export type DisclosureDecisionReason =
  (typeof DISCLOSURE_DECISION_REASON_CODES)[number];

export type ProjectResourceDisclosureDecision =
  | { decision: "ALLOW"; reasonCode: "allowed" }
  | { decision: "DENY"; reasonCode: DisclosureDecisionReason };

export type ProjectResourceDisclosureActor = {
  userId: string;
  role: "user" | "lawyer" | "admin";
  nonGuest: boolean;
  emailVerified: boolean;
  staffEmailSha256: string | null;
};

export type ProjectResourceDisclosureAssignment = {
  assignmentId: string;
  projectId: string;
  staffUserId: string;
  staffEmailSha256: string;
  status:
    | "proposed"
    | "owner_approved"
    | "active"
    | "declined"
    | "withdrawn"
    | "revoked";
  purpose: string;
};

export type ProjectResourceDisclosureGrantSnapshot = {
  grantId: string;
  projectId: string;
  resourceOwnerUserId: string;
  recipientAssignmentId: string;
  recipientUserId: string;
  resourceCategory: string;
  resourceId: string;
  resourceVersion: number;
  /** Adapter fingerprint recorded when the grant was created (R1-05). */
  resourceFingerprint: string;
  purposeCode: string;
  status: "granted" | "revoked" | "expired";
  expiresAt: string | null;
};

export type ProjectResourceSnapshot =
  | {
      found: false;
      reasonCode: "resource_source_unavailable" | "resource_not_found";
    }
  | {
      found: true;
      projectId: string;
      ownerUserId: string;
      version: number;
      category: DisclosureResourceCategory;
      /**
       * Opaque adapter fingerprint of the exact bytes/metadata observed (R1-05).
       * Required so a grant is bound to one reproducible observation.
       */
      fingerprint: string;
    };

export type ProjectResourceDisclosureResolverInput = {
  projectId: string;
  resourceCategory: string;
  resourceId: string;
};

/**
 * Source adapter port. A protected resource may only be disclosed when a
 * separately reviewed adapter can establish its exact Project, owner and current
 * version. No adapter is approved yet, so the production default reports the
 * resource as unavailable and every disclosure decision fails closed.
 */
export type ProjectResourceDisclosureResolver = {
  readonly code: string;
  resolve: (
    input: ProjectResourceDisclosureResolverInput
  ) => ProjectResourceSnapshot | Promise<ProjectResourceSnapshot>;
};

export const UNSUPPORTED_DISCLOSURE_RESOLVER_CODE =
  "unsupported_no_verified_source_adapter" as const;

export const unsupportedProjectResourceDisclosureResolver: ProjectResourceDisclosureResolver =
  {
    code: UNSUPPORTED_DISCLOSURE_RESOLVER_CODE,
    resolve() {
      return { found: false, reasonCode: "resource_source_unavailable" };
    },
  };

/**
 * In-transaction revalidation port (R1-05).
 *
 * A version/ownership observation made outside the write transaction can go
 * stale before the grant row is inserted. A verified adapter must therefore
 * expose a revalidation call that the repository invokes *inside* the grant
 * transaction, re-reading the exact Project, owner, version and fingerprint.
 * The repository fails closed (`resource_unavailable`) whenever no revalidator is
 * configured, so grant creation stays unreachable until a reviewed adapter and
 * its locked revalidation query exist.
 */
export type ProjectResourceRevalidationInput = {
  projectId: string;
  resourceCategory: string;
  resourceId: string;
  resourceVersion: number;
  resourceOwnerUserId: string;
  resourceFingerprint: string;
};

export type ProjectResourceDisclosureRevalidator = {
  readonly code: string;
  /** Throwing or returning an unavailable snapshot aborts the transaction. */
  revalidate: (
    input: ProjectResourceRevalidationInput
  ) => ProjectResourceSnapshot | Promise<ProjectResourceSnapshot>;
};

export type ProjectResourceDisclosureRequest = {
  now: string;
  action: "read_metadata" | "read_content";
  projectId: string;
  projectActive: boolean;
  actor: ProjectResourceDisclosureActor;
  assignment: ProjectResourceDisclosureAssignment | null;
  grant: ProjectResourceDisclosureGrantSnapshot | null;
  resource: ProjectResourceSnapshot;
  /**
   * R1-03: server-derived current eligibility of the Grant's resource owner
   * (Project ownership or an active Project membership, plus a current account).
   * A former member's historical grant can never remain effectively authorized.
   */
  resourceOwnerEligible: boolean;
  requested: {
    resourceCategory: string;
    resourceId: string;
    resourceVersion: number;
    purposeCode: string;
  };
};

const ALLOW: ProjectResourceDisclosureDecision = {
  decision: "ALLOW",
  reasonCode: "allowed",
};

function deny(
  reasonCode: Exclude<DisclosureDecisionReason, "allowed">
): ProjectResourceDisclosureDecision {
  return { decision: "DENY", reasonCode };
}

/**
 * Decision order is intentional and stable: the most specific denial that
 * applies to the earliest missing authority wins, so telemetry reason codes are
 * reproducible across Default, staff UI and offline tests.
 */
export function evaluateProjectResourceDisclosure(
  input: ProjectResourceDisclosureRequest
): ProjectResourceDisclosureDecision {
  if (!input.projectActive) {
    return deny("project_inactive");
  }
  if (input.action === "read_content") {
    // This slice persists and evaluates grants only. No content endpoint may be
    // connected until a separately reviewed access contract exists.
    return deny("content_access_not_available");
  }
  if (!input.resourceOwnerEligible) {
    // R1-03: the Grant's own owner must still be an eligible Project
    // participant. A revoked membership invalidates the grant immediately.
    return deny("resource_owner_ineligible");
  }
  if (input.actor.role !== "lawyer" || !input.actor.nonGuest) {
    return deny("actor_not_staff_account");
  }
  if (!input.actor.emailVerified) {
    return deny("actor_not_verified");
  }
  const { assignment } = input;
  if (!assignment) {
    return deny("assignment_missing");
  }
  if (assignment.projectId !== input.projectId) {
    return deny("assignment_project_mismatch");
  }
  if (assignment.staffUserId !== input.actor.userId) {
    return deny("assignment_recipient_mismatch");
  }
  if (assignment.purpose !== "project_staff_collaboration") {
    return deny("assignment_purpose_mismatch");
  }
  if (
    !input.actor.staffEmailSha256 ||
    input.actor.staffEmailSha256 !== assignment.staffEmailSha256
  ) {
    return deny("assignment_account_mismatch");
  }
  if (assignment.status !== "active") {
    return deny("assignment_inactive");
  }
  if (
    !(DISCLOSURE_RESOURCE_CATEGORIES as readonly string[]).includes(
      input.requested.resourceCategory
    ) ||
    !isGrantableResourceCategory(input.requested.resourceCategory)
  ) {
    return deny("requested_category_not_supported");
  }
  if (!input.resource.found) {
    return deny(input.resource.reasonCode);
  }
  if (input.resource.projectId !== input.projectId) {
    return deny("resource_project_mismatch");
  }
  const { grant } = input;
  if (!grant) {
    return deny("grant_missing");
  }
  if (
    grant.projectId !== input.projectId ||
    grant.projectId !== input.resource.projectId
  ) {
    return deny("grant_project_mismatch");
  }
  if (grant.resourceOwnerUserId !== input.resource.ownerUserId) {
    return deny("grant_owner_mismatch");
  }
  if (grant.recipientUserId !== input.actor.userId) {
    return deny("grant_recipient_mismatch");
  }
  if (grant.recipientAssignmentId !== assignment.assignmentId) {
    return deny("grant_assignment_mismatch");
  }
  if (grant.resourceCategory !== input.requested.resourceCategory) {
    return deny("grant_category_mismatch");
  }
  if (grant.resourceId !== input.requested.resourceId) {
    return deny("grant_resource_mismatch");
  }
  if (grant.purposeCode !== input.requested.purposeCode) {
    return deny("grant_purpose_mismatch");
  }
  if (grant.status === "revoked") {
    return deny("grant_revoked");
  }
  if (
    grant.status === "expired" ||
    (grant.expiresAt !== null &&
      Date.parse(grant.expiresAt) <= Date.parse(input.now))
  ) {
    return deny("grant_expired");
  }
  if (
    grant.resourceVersion !== input.resource.version ||
    input.requested.resourceVersion !== input.resource.version
  ) {
    return deny("resource_version_stale");
  }
  if (grant.resourceFingerprint !== input.resource.fingerprint) {
    // R1-05: the adapter now observes different bytes for the same version, or
    // the grant was recorded against a different observation.
    return deny("resource_observation_mismatch");
  }
  return ALLOW;
}
