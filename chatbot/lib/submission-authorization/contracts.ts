import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import {
  type CapabilityEnvironment,
  parseCapabilityFlag,
} from "@/lib/platform/capability-environment";
import {
  isSubmissionOperationId,
  submissionDigest,
} from "@/lib/submission-packages/contracts";

/**
 * Phase 13 M8.2 - submission authorization, professional sign-off and human handoff.
 *
 * M8.1 froze *what the customer reviewed*: an immutable exact-version package plus
 * bounded content/declaration confirmations. M8.2 records a different decision: who,
 * if anyone, is authorized to perform the external submission of that exact package.
 *
 * Three separations are structural, not stylistic:
 *
 *   1. a customer content confirmation (M8.1) is never submission authorization;
 *   2. a submission authorization is never evidence that anything was submitted;
 *   3. a recorded external action is never an official receipt unless a genuinely
 *      trusted external verifier produced it.
 *
 * Nothing here creates a second M4 engagement, payment, signature, disclosure,
 * professional-review or readiness model: those predicates are read from M4.
 */

export const SUBMISSION_AUTHORIZATION_SCHEMA =
  "phase13.m8-2.submission-authorization.v1" as const;
export const SUBMISSION_AUTHORIZATION_POLICY_VERSION =
  "phase13.m8-2.authorization-policy.v1" as const;
export const SUBMISSION_AUTHORIZATION_DISCLOSURE_POLICY_VERSION =
  "phase13.m8-2.authorization-disclosures.v1" as const;

/** The two service modes M4-004 already distinguishes. */
export const SUBMISSION_SERVICE_MODES = [
  "self_service",
  "managed_service",
] as const;
export type SubmissionServiceMode = (typeof SUBMISSION_SERVICE_MODES)[number];

/**
 * Stored authorization types. They are separate rows because they carry different
 * disclosures and different authority: the customer acting personally versus the
 * customer authorizing an engaged professional to act for them.
 */
export const SUBMISSION_AUTHORIZATION_TYPES = [
  "self_service_external_submission",
  "managed_service_professional_handoff",
] as const;
export type SubmissionAuthorizationType =
  (typeof SUBMISSION_AUTHORIZATION_TYPES)[number];

export const AUTHORIZATION_TYPE_MODE = {
  managed_service_professional_handoff: "managed_service",
  self_service_external_submission: "self_service",
} as const;

/** Handoff lifecycle. `accepted` is the only state that permits staff action. */
export const SUBMISSION_HANDOFF_STATUSES = [
  "requested",
  "accepted",
  "declined",
  "cancelled",
  "superseded",
] as const;
export type SubmissionHandoffStatus =
  (typeof SUBMISSION_HANDOFF_STATUSES)[number];

/** Frozen transition table; anything absent here is a state conflict. */
export const SUBMISSION_HANDOFF_TRANSITIONS: Record<
  SubmissionHandoffStatus,
  readonly SubmissionHandoffStatus[]
> = {
  accepted: ["superseded", "cancelled"],
  cancelled: [],
  declined: [],
  requested: ["accepted", "declined", "cancelled"],
  superseded: [],
};

export const SUBMISSION_HANDOFF_TERMINAL_STATUSES = [
  "declined",
  "cancelled",
  "superseded",
] as const;

/**
 * Where an external action or outcome came from. Only `provider_verified` may ever
 * raise a claim to "verified", and no such verifier is integrated, so production can
 * only ever produce an explicitly unverified record.
 */
export const EXTERNAL_EVIDENCE_PROVENANCES = [
  "customer_reported",
  "staff_attested",
  "document_backed_unverified",
  "provider_verified",
] as const;
export type ExternalEvidenceProvenance =
  (typeof EXTERNAL_EVIDENCE_PROVENANCES)[number];

export const EXTERNAL_EVIDENCE_VERIFICATIONS = [
  "unverified",
  "verified",
] as const;
export type ExternalEvidenceVerification =
  (typeof EXTERNAL_EVIDENCE_VERIFICATIONS)[number];

/** Channels are descriptive labels; none of them implies an integration exists. */
export const EXTERNAL_SUBMISSION_CHANNELS = [
  "school_portal",
  "government_portal",
  "email",
  "post",
  "in_person",
  "other",
] as const;
export type ExternalSubmissionChannel =
  (typeof EXTERNAL_SUBMISSION_CHANNELS)[number];

/**
 * External records are of two different kinds and are never merged: an action the
 * platform was told about, and an outcome it was told about.
 */
export const EXTERNAL_RECORD_KINDS = [
  "external_submission",
  "external_outcome",
] as const;
export type ExternalRecordKind = (typeof EXTERNAL_RECORD_KINDS)[number];

/**
 * Outcome codes describe what the *reporter* said happened. They are deliberately
 * neutral: none of them asserts a favourable decision, and every one of them is
 * still subject to the record's provenance.
 */
export const EXTERNAL_OUTCOME_CODES = [
  "acknowledgement_received",
  "receipt_received",
  "request_for_information",
  "decision_received",
  "refused_or_returned",
  "unknown",
] as const;
export type ExternalOutcomeCode = (typeof EXTERNAL_OUTCOME_CODES)[number];

export const SUBMISSION_AUTHORIZATION_ACTIONS = [
  "authorize_self_service",
  "authorize_managed_service",
  "request_handoff",
  "accept_handoff",
  "decline_handoff",
  "cancel_handoff",
  "record_external_action",
] as const;
export type SubmissionAuthorizationAction =
  (typeof SUBMISSION_AUTHORIZATION_ACTIONS)[number];

export const SUBMISSION_AUTHORIZATION_ERROR_CODES = [
  "invalid_request",
  "actor_not_eligible",
  "actor_not_staff",
  "project_not_found",
  "project_forbidden",
  "project_closed",
  "target_not_found",
  "package_not_found",
  "package_not_current",
  "package_integrity_unverified",
  "confirmation_missing",
  "confirmation_not_current",
  "confirmation_not_finalized",
  "confirmation_policy_unknown",
  "source_unavailable",
  "disclosure_not_acknowledged",
  "authorization_not_found",
  "authorization_not_current",
  "professional_review_missing",
  "professional_authority_denied",
  "professional_authority_unavailable",
  "professional_credential_unverified",
  "professional_credential_unavailable",
  "readiness_not_ready",
  "readiness_unknown",
  "handoff_not_found",
  "handoff_state_conflict",
  "handoff_actor_not_authorized",
  "handoff_not_current",
  "evidence_provenance_invalid",
  "evidence_verifier_unavailable",
  "revision_conflict",
  "idempotency_conflict",
  "integrity_conflict",
  "limit_exceeded",
] as const;
export type SubmissionAuthorizationErrorCode =
  (typeof SUBMISSION_AUTHORIZATION_ERROR_CODES)[number];

export class SubmissionAuthorizationError extends Error {
  readonly code: SubmissionAuthorizationErrorCode;

  constructor(code: SubmissionAuthorizationErrorCode) {
    super(code);
    this.name = "SubmissionAuthorizationError";
    this.code = code;
  }
}
/**
 * Reason codes attached to an authorization validity assessment. They are derived
 * from compared identities and from M4/M8.1 state, never from a timer or a score.
 */
export const AUTHORIZATION_VALIDITY_REASONS = [
  "package_not_current",
  "package_integrity_unverified",
  "package_freshness_lost",
  "confirmation_missing",
  "confirmation_not_current",
  "confirmation_not_finalized",
  "confirmation_policy_unknown",
  "source_unavailable",
  "managed_readiness_not_ready",
  "managed_readiness_unknown",
  "professional_review_not_approved",
  "professional_authority_denied",
  "professional_credential_unverified",
  "authorization_superseded",
] as const;
export type AuthorizationValidityReason =
  (typeof AUTHORIZATION_VALIDITY_REASONS)[number];

/** Derived, never stored: the answer to "is this authorization effective *now*". */
export const AUTHORIZATION_VALIDITY_STATUSES = [
  "effective",
  "ineffective",
  "unknown",
] as const;
export type AuthorizationValidityStatus =
  (typeof AUTHORIZATION_VALIDITY_STATUSES)[number];

/** Derived submission state. Authorization is deliberately not an input to it. */
export const DERIVED_SUBMISSION_STATES = [
  "not_submitted",
  "reported_unverified",
  "verified",
] as const;
export type DerivedSubmissionState = (typeof DERIVED_SUBMISSION_STATES)[number];

export const SUBMISSION_AUTHORIZATION_LIMITS = {
  maxAuthorizationsPerTarget: 12,
  maxExternalRecordsPerTarget: 40,
  maxHandoffsPerTarget: 24,
  maxOperationIdLength: 128,
  maxReferenceLength: 128,
} as const;

const REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;

export function isSubmissionServiceMode(
  value: unknown
): value is SubmissionServiceMode {
  return (
    typeof value === "string" &&
    (SUBMISSION_SERVICE_MODES as readonly string[]).includes(value)
  );
}

export function isSubmissionAuthorizationType(
  value: unknown
): value is SubmissionAuthorizationType {
  return (
    typeof value === "string" &&
    (SUBMISSION_AUTHORIZATION_TYPES as readonly string[]).includes(value)
  );
}

export function isSubmissionHandoffStatus(
  value: unknown
): value is SubmissionHandoffStatus {
  return (
    typeof value === "string" &&
    (SUBMISSION_HANDOFF_STATUSES as readonly string[]).includes(value)
  );
}

export function isExternalEvidenceProvenance(
  value: unknown
): value is ExternalEvidenceProvenance {
  return (
    typeof value === "string" &&
    (EXTERNAL_EVIDENCE_PROVENANCES as readonly string[]).includes(value)
  );
}

export function isExternalRecordKind(
  value: unknown
): value is ExternalRecordKind {
  return (
    typeof value === "string" &&
    (EXTERNAL_RECORD_KINDS as readonly string[]).includes(value)
  );
}

export function isExternalSubmissionChannel(
  value: unknown
): value is ExternalSubmissionChannel {
  return (
    typeof value === "string" &&
    (EXTERNAL_SUBMISSION_CHANNELS as readonly string[]).includes(value)
  );
}

export function isExternalOutcomeCode(
  value: unknown
): value is ExternalOutcomeCode {
  return (
    typeof value === "string" &&
    (EXTERNAL_OUTCOME_CODES as readonly string[]).includes(value)
  );
}

export function isSubmissionTargetKind(
  value: unknown
): value is ManagedTargetKind {
  return (
    value === "managed_school_application" ||
    value === "student_500_visa_application"
  );
}

/** An external reference is an opaque identifier, never free text or content. */
export function isExternalReference(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_RE.test(value);
}

export {
  isSubmissionOperationId,
  isSubmissionPackageSha256,
  isSubmissionPackageUuid,
} from "@/lib/submission-packages/contracts";

export function normalizeSubmissionOperationId(value: unknown): string {
  if (!isSubmissionOperationId(value)) {
    throw new SubmissionAuthorizationError("invalid_request");
  }
  return value;
}

/** Canonical digest of any authorization-shaped value. */
export function authorizationDigest(value: unknown): string {
  return submissionDigest(value);
}

/**
 * M8.2 default-OFF capability.
 *
 * Independent of `PHASE13_SUBMISSION_PACKAGES_ENABLED`: M8.1 packages can stay
 * visible while authorizations and handoffs remain absent. An unrecognised value
 * fails closed.
 */
export function submissionAuthorizationEnabled(
  value: string | undefined = process.env
    .PHASE13_SUBMISSION_AUTHORIZATION_ENABLED,
  _environment?: CapabilityEnvironment
): boolean {
  return parseCapabilityFlag(value) ?? false;
}
