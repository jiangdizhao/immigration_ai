import { canonicalJson, sha256Hex } from "@/lib/managed-target/policy";

/**
 * Phase 13 M4-007 readiness contract.
 *
 * A readiness result is an assessment of *current authoritative state*, not an
 * entitlement, not an approval and not a submission. It carries stable reason
 * codes and opaque references only: never customer documents, bank references,
 * agreement text or review notes.
 */
export const MANAGED_HANDOFF_POLICY_VERSION =
  "phase13-m4-007-managed-handoff-v1" as const;

export const MANAGED_HANDOFF_STATUSES = [
  "READY",
  "NOT_READY",
  "UNKNOWN",
] as const;
export type ManagedHandoffStatus = (typeof MANAGED_HANDOFF_STATUSES)[number];

export const MANAGED_HANDOFF_REASON_CODES = [
  "project_not_found",
  "project_not_active",
  "project_state_unavailable",
  "actor_not_authorized",
  "membership_missing",
  "membership_expired",
  "membership_unavailable",
  "lawyer_assignment_missing",
  "lawyer_assignment_revoked",
  "lawyer_assignment_pending",
  "lawyer_assignment_unavailable",
  "engagement_missing",
  "engagement_superseded",
  "engagement_scope_mismatch",
  "engagement_service_mode_mismatch",
  "engagement_unavailable",
  "agreement_missing",
  "agreement_not_accepted",
  "agreement_superseded",
  "agreement_unavailable",
  "signature_missing",
  "signature_unverified",
  "signature_authority_untrusted",
  "signature_authority_unavailable",
  "resource_disclosure_missing",
  "resource_disclosure_expired",
  "resource_disclosure_unavailable",
  "payment_required_unsatisfied",
  "payment_evidence_pending",
  "payment_disputed",
  "payment_reversed",
  "payment_void",
  "payment_condition_missing",
  "payment_state_unavailable",
  "target_provider_unavailable",
  "target_not_found",
  "target_kind_unsupported",
  "target_metadata_untrusted",
  "review_missing",
  "review_not_approved",
  "review_target_changed",
  "review_authority_revoked",
  "review_state_unavailable",
  "professional_credential_unverified",
  "professional_credential_unavailable",
  "customer_confirmation_missing",
  "customer_confirmation_policy_unknown",
  "concurrent_revision_change",
] as const;
export type ManagedHandoffReasonCode =
  (typeof MANAGED_HANDOFF_REASON_CODES)[number];

/** Payment predicate, so `NOT_REQUIRED` is never confused with missing evidence. */
/**
 * Resolved integration contract: the M4-004 `ServiceEngagement.scopeCodes`
 * vocabulary is `{school_admissions, student_500_visa}` (CHECK-constrained), and a
 * managed handoff additionally requires `serviceMode = 'managed'`. The earlier
 * provisional `managed_application_handoff` value does not exist in M4-004 and is
 * therefore removed rather than mapped.
 */
export const MANAGED_HANDOFF_SCOPE_BY_TARGET_KIND = {
  managed_school_application: "school_admissions",
  student_500_visa_application: "student_500_visa",
} as const;

export const MANAGED_HANDOFF_REQUIRED_SERVICE_MODE = "managed" as const;

export function managedHandoffRequiredScope(
  targetKind: string
):
  | (typeof MANAGED_HANDOFF_SCOPE_BY_TARGET_KIND)[keyof typeof MANAGED_HANDOFF_SCOPE_BY_TARGET_KIND]
  | null {
  return (
    MANAGED_HANDOFF_SCOPE_BY_TARGET_KIND[
      targetKind as keyof typeof MANAGED_HANDOFF_SCOPE_BY_TARGET_KIND
    ] ?? null
  );
}

export const MANAGED_HANDOFF_PAYMENT_PREDICATES = [
  "REQUIRED_SATISFIED",
  "NOT_REQUIRED",
  "UNSATISFIED",
  "REVERSED",
  "DISPUTED",
  "UNKNOWN",
] as const;
export type ManagedHandoffPaymentPredicate =
  (typeof MANAGED_HANDOFF_PAYMENT_PREDICATES)[number];

export const MANAGED_HANDOFF_EVIDENCE_PROVENANCE = [
  "production",
  "synthetic_test",
] as const;
export type ManagedHandoffEvidenceProvenance =
  (typeof MANAGED_HANDOFF_EVIDENCE_PROVENANCE)[number];

/**
 * Observed authoritative vector. Numeric revision only where persistence provides
 * one; otherwise the row identity is reported and never a fabricated number.
 */
export type ManagedHandoffCheckedRevisions = {
  project: number | null;
  membership: string | null;
  assignment: string | null;
  engagement: number | null;
  agreement: string | null;
  disclosure: string | null;
  payment: string | null;
  review: number | null;
  target: string | null;
};

export type ManagedHandoffPolicyVersions = {
  handoff: string;
  review: string;
  payment: string;
};

export type ManagedHandoffResult = {
  status: ManagedHandoffStatus;
  reasonCodes: ManagedHandoffReasonCode[];
  policyVersion: typeof MANAGED_HANDOFF_POLICY_VERSION;
  projectId: string;
  actorUserId: string;
  engagementId: string | null;
  target: {
    targetId: string;
    targetKind: string;
    targetSha256: string | null;
    targetVersion: number | null;
  };
  paymentPredicate: ManagedHandoffPaymentPredicate;
  checkedRevisions: ManagedHandoffCheckedRevisions;
  /** Policy versions actually applied, so a token binds real semantics. */
  policyVersions: ManagedHandoffPolicyVersions;
  /** Opaque, non-content references already known to the caller. */
  evidenceRefs: string[];
  evidenceProvenance: ManagedHandoffEvidenceProvenance;
  checkedAt: string;
  /**
   * Deterministic digest of the exact evaluated state. A future M5 submission
   * must re-evaluate and compare this token immediately before its own state
   * change; a cached green result is never sufficient.
   */
  revalidationToken: string;
};

/**
 * Precedence is frozen: a definitive blocking condition always wins over an
 * unverifiable one, and an unverifiable condition always wins over READY.
 */
export function managedHandoffStatusFor(input: {
  blocking: readonly ManagedHandoffReasonCode[];
  unknown: readonly ManagedHandoffReasonCode[];
}): ManagedHandoffStatus {
  if (input.blocking.length > 0) {
    return "NOT_READY";
  }
  if (input.unknown.length > 0) {
    return "UNKNOWN";
  }
  return "READY";
}

export function managedHandoffReasonCodes(
  codes: Iterable<ManagedHandoffReasonCode>
): ManagedHandoffReasonCode[] {
  return [...new Set(codes)].sort();
}

export function managedHandoffRevalidationToken(input: {
  actorUserId: string;
  checkedRevisions: ManagedHandoffCheckedRevisions;
  paymentPredicate: ManagedHandoffPaymentPredicate;
  policyVersions: ManagedHandoffPolicyVersions;
  projectId: string;
  reasonCodes: readonly ManagedHandoffReasonCode[];
  status: ManagedHandoffStatus;
  target: ManagedHandoffResult["target"];
}): string {
  return sha256Hex(canonicalJson(input));
}

/**
 * Feature gate. Default OFF: with no approved M4-002/004/005/006 adapters the gate
 * can only answer UNKNOWN, so the surface stays hidden.
 */
export function isManagedHandoffEnabled(
  value: string | undefined = process.env.PHASE13_MANAGED_HANDOFF_ENABLED
): boolean {
  return value?.trim().toLowerCase() === "true";
}
