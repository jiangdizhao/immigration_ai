import { createHash } from "node:crypto";
import { guestRegex } from "@/lib/constants";
import { hashProjectOperationRequest } from "@/lib/db/project-foundation-utils";

/**
 * Phase 13 M4-005 — staff-attested off-platform service payment conditions.
 *
 * This module is deliberately provider-free: it contains no database, network or
 * model access, so the contract-binding, authority and effective-status contract
 * can be unit tested offline.
 *
 * Frozen product position:
 *
 * - an off-platform service fee is **never** inferred from free-text agreement
 *   clauses, an accepted agreement, a chat message, an AI answer, a VIP/Stripe
 *   subscription, or a browser-supplied boolean;
 * - `NOT_REQUIRED` requires an explicit trusted contract-authority decision, never
 *   a manufactured zero-value transaction;
 * - `UNKNOWN` is the honest answer whenever the contract does not unambiguously
 *   establish the requirement;
 * - no real financial authority is approved, so every production adapter in
 *   `authority.ts` and `verification.ts` denies by default.
 */

export const SERVICE_PAYMENT_POLICY_VERSION =
  "m4-005-service-payment-policy-v1" as const;

export const SERVICE_PAYMENT_REQUIREMENTS = [
  "required",
  "not_required",
  "unknown",
] as const;
export type ServicePaymentRequirement =
  (typeof SERVICE_PAYMENT_REQUIREMENTS)[number];

export const SERVICE_PAYMENT_CONTRACTUAL_BASIS_CODES = [
  "agreement_clause",
  "payment_schedule",
  "explicit_no_advance_fee",
] as const;
export type ServicePaymentContractualBasisCode =
  (typeof SERVICE_PAYMENT_CONTRACTUAL_BASIS_CODES)[number];

export const SERVICE_PAYMENT_EVIDENCE_CATEGORIES = [
  "external_transfer_receipt",
  "provider_settlement_observation",
] as const;
export type ServicePaymentEvidenceCategory =
  (typeof SERVICE_PAYMENT_EVIDENCE_CATEGORIES)[number];

export const SERVICE_PAYMENT_EVIDENCE_STATUSES = [
  "pending",
  "verified",
  "rejected",
] as const;
export type ServicePaymentEvidenceStatus =
  (typeof SERVICE_PAYMENT_EVIDENCE_STATUSES)[number];

export const SERVICE_PAYMENT_VERIFICATION_METHODS = [
  "manual_staff_reconciliation",
  "external_provider_attestation",
] as const;
export type ServicePaymentVerificationMethod =
  (typeof SERVICE_PAYMENT_VERIFICATION_METHODS)[number];

export const SERVICE_PAYMENT_RESOLUTION_KINDS = [
  "dispute",
  "refund",
  "reversal",
  "void",
  "correction",
] as const;
export type ServicePaymentResolutionKind =
  (typeof SERVICE_PAYMENT_RESOLUTION_KINDS)[number];

/** Resolution kinds that assert an external observation, not a staff decision. */
export const SERVICE_PAYMENT_EXTERNAL_RESOLUTION_KINDS = [
  "refund",
  "reversal",
] as const;

export const SERVICE_PAYMENT_EFFECTIVE_STATUSES = [
  "UNKNOWN",
  "NOT_REQUIRED",
  "REQUIRED_UNSATISFIED",
  "EVIDENCE_PENDING",
  "SATISFIED",
  "DISPUTED",
  "REVERSED",
  "VOID",
] as const;
export type ServicePaymentEffectiveStatus =
  (typeof SERVICE_PAYMENT_EFFECTIVE_STATUSES)[number];

/**
 * Frozen, documented precedence for the effective projection:
 * `VOID` first, so a voided condition can never also read as payable or paid;
 * then the adverse resolutions; only then satisfaction, pending evidence and the
 * unsatisfied default. `NOT_REQUIRED` and `UNKNOWN` follow the contractual
 * requirement itself and never the presence of evidence.
 */
export const SERVICE_PAYMENT_EFFECTIVE_PRECEDENCE = [
  "UNKNOWN",
  "VOID",
  "DISPUTED",
  "REVERSED",
  "SATISFIED",
  "EVIDENCE_PENDING",
  "REQUIRED_UNSATISFIED",
  "NOT_REQUIRED",
] as const satisfies readonly ServicePaymentEffectiveStatus[];

export const SERVICE_PAYMENT_REASON_CODES = [
  "condition_absent",
  "condition_superseded",
  "contract_not_current",
  "contract_requirement_unknown",
  "engagement_terminated",
  "contractually_not_required",
  "condition_voided",
  "payment_disputed",
  "payment_reversed",
  "payment_refunded",
  "evidence_verified",
  "evidence_pending",
  "no_evidence",
] as const;
export type ServicePaymentReasonCode =
  (typeof SERVICE_PAYMENT_REASON_CODES)[number];

export const SERVICE_PAYMENT_AMOUNT_MAX_MINOR = 999_999_999_999;
export const SERVICE_PAYMENT_DECLARED_PAID_TIME_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const SERVICE_PAYMENT_HISTORY_MAX = 50;
export const SERVICE_PAYMENT_PROVENANCE_MAX = 256;

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const BASIS_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/u;
const REASON_CODE = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const AUTHORITY_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

export const SERVICE_PAYMENT_CUSTOMER_NOTICE_VERSION =
  "m4-005-service-payment-status-v1" as const;
export const SERVICE_PAYMENT_CUSTOMER_NOTICE =
  "This payment status is a staff-attested internal record about an off-platform service fee. It is not a bank confirmation, a card receipt, an invoice, a tax document or proof that funds cleared. A payment becomes satisfied only when a separately authorized finance attestation has verified bounded external evidence for this exact agreement version and amount. A VIP subscription, a Stripe transaction, a chat message or an AI answer is never treated as payment of this service fee. If the agreement version is replaced, or a verified payment is refunded, reversed or disputed, the earlier satisfaction no longer represents the current condition. You can ask for a correction if this record is wrong.";
export const SERVICE_PAYMENT_CUSTOMER_NOTICE_SHA256 = createHash("sha256")
  .update(SERVICE_PAYMENT_CUSTOMER_NOTICE, "utf8")
  .digest("hex");

export function isServicePaymentEnabled(
  value: string | undefined = process.env.PHASE13_SERVICE_PAYMENT_ENABLED
) {
  return value?.trim().toLowerCase() === "true";
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

export function isServicePaymentCurrency(value: unknown): value is string {
  return typeof value === "string" && CURRENCY.test(value);
}

export function isServicePaymentAmountMinor(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= SERVICE_PAYMENT_AMOUNT_MAX_MINOR
  );
}

export function isServicePaymentBasisRef(value: unknown): value is string {
  return typeof value === "string" && BASIS_REF.test(value);
}

export function isServicePaymentReasonCode(value: unknown): value is string {
  return typeof value === "string" && REASON_CODE.test(value);
}

export function isServicePaymentAuthorityCode(value: unknown): value is string {
  return typeof value === "string" && AUTHORITY_CODE.test(value);
}

export function isServicePaymentRequirement(
  value: unknown
): value is ServicePaymentRequirement {
  return (
    typeof value === "string" &&
    (SERVICE_PAYMENT_REQUIREMENTS as readonly string[]).includes(value)
  );
}

export function isServicePaymentResolutionKind(
  value: unknown
): value is ServicePaymentResolutionKind {
  return (
    typeof value === "string" &&
    (SERVICE_PAYMENT_RESOLUTION_KINDS as readonly string[]).includes(value)
  );
}

export function isServicePaymentEvidenceCategory(
  value: unknown
): value is ServicePaymentEvidenceCategory {
  return (
    typeof value === "string" &&
    (SERVICE_PAYMENT_EVIDENCE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isServicePaymentVerificationMethod(
  value: unknown
): value is ServicePaymentVerificationMethod {
  return (
    typeof value === "string" &&
    (SERVICE_PAYMENT_VERIFICATION_METHODS as readonly string[]).includes(value)
  );
}

export function isServicePaymentContractualBasisCode(
  value: unknown
): value is ServicePaymentContractualBasisCode {
  return (
    typeof value === "string" &&
    (SERVICE_PAYMENT_CONTRACTUAL_BASIS_CODES as readonly string[]).includes(
      value
    )
  );
}

export function requiresExternalResolutionObservation(
  kind: ServicePaymentResolutionKind
) {
  return (
    SERVICE_PAYMENT_EXTERNAL_RESOLUTION_KINDS as readonly string[]
  ).includes(kind);
}

/**
 * Requirement/amount coherence, shared by the HTTP boundary, the repository and
 * the migration CHECK constraints.
 *
 * - `required` needs a positive integer minor amount and an ISO-4217 currency;
 * - `not_required` and `unknown` must carry no amount at all, so no zero-value or
 *   guessed figure ever looks like a real payment;
 * - `unknown` may omit the contractual basis reference (nothing was established).
 */
export function servicePaymentRequirementShapes(input: {
  requirement: ServicePaymentRequirement;
  amountMinor: number | null;
  currency: string | null;
  contractualBasisRef: string | null;
}) {
  const hasAmount = input.amountMinor !== null;
  const hasCurrency = input.currency !== null;
  const hasBasis = input.contractualBasisRef !== null;
  if (input.requirement === "required") {
    return (
      hasBasis &&
      isServicePaymentAmountMinor(input.amountMinor) &&
      isServicePaymentCurrency(input.currency) &&
      isServicePaymentBasisRef(input.contractualBasisRef)
    );
  }
  if (hasAmount || hasCurrency) {
    return false;
  }
  if (input.requirement === "not_required") {
    return hasBasis && isServicePaymentBasisRef(input.contractualBasisRef);
  }
  return input.requirement === "unknown";
}

/* ------------------------------------------------------------------------- *
 * Canonical identity
 * ------------------------------------------------------------------------- */

/** Canonical body of one payment-condition/evidence/resolution operation. */
export type ServicePaymentOperationRequestInput = {
  action:
    | "record_condition"
    | "submit_evidence"
    | "verify_evidence"
    | "record_resolution";
  projectId: string;
  engagementId: string;
  agreementVersionId: string;
  agreementTermsSha256: string;
  conditionId: string | null;
  evidenceId: string | null;
  resolutionKind: ServicePaymentResolutionKind | null;
  amountMinor: number | null;
  currency: string | null;
  requirement: ServicePaymentRequirement | null;
  referenceSha256: string | null;
  observationSha256: string | null;
  /** Material evidence fields (FIX-05): category, declared paid time. */
  evidenceCategory: ServicePaymentEvidenceCategory | null;
  paidAt: string | null;
  /** Material verification decision fields (FIX-05). */
  verificationStatus: "verified" | "rejected" | null;
  verificationMethod: ServicePaymentVerificationMethod | null;
  verificationReasonCode: string | null;
  verificationProviderCode: string | null;
  /** Material resolution fields (FIX-05): reason and exact superseded target. */
  reasonCode: string | null;
  supersedesResolutionId: string | null;
  /** Contractual basis of a recorded condition (FIX-05). */
  contractualBasisCode: string | null;
  contractualBasisRef: string | null;
  /**
   * R2-B: authority/observation codes and the verification-provenance digest are
   * persisted on the audit record, so they belong to the canonical request too.
   * The provenance *text* is never part of the input: only its digest is.
   */
  contractAuthorityCode: string | null;
  financeAuthorityCode: string | null;
  observationCode: string | null;
  verificationProvenanceSha256: string | null;
  expectedProjectRevision: number;
};

export function buildServicePaymentOperationRequest(
  input: ServicePaymentOperationRequestInput
) {
  return {
    domain: "phase13_m4_005_service_payment",
    policyVersion: SERVICE_PAYMENT_POLICY_VERSION,
    action: input.action,
    projectId: input.projectId,
    engagementId: input.engagementId,
    agreementVersionId: input.agreementVersionId,
    agreementTermsSha256: input.agreementTermsSha256,
    conditionId: input.conditionId,
    evidenceId: input.evidenceId,
    resolutionKind: input.resolutionKind,
    amountMinor: input.amountMinor,
    currency: input.currency,
    requirement: input.requirement,
    referenceSha256: input.referenceSha256,
    observationSha256: input.observationSha256,
    evidenceCategory: input.evidenceCategory,
    paidAt: input.paidAt,
    verificationStatus: input.verificationStatus,
    verificationMethod: input.verificationMethod,
    verificationReasonCode: input.verificationReasonCode,
    verificationProviderCode: input.verificationProviderCode,
    reasonCode: input.reasonCode,
    supersedesResolutionId: input.supersedesResolutionId,
    contractualBasisCode: input.contractualBasisCode,
    contractualBasisRef: input.contractualBasisRef,
    contractAuthorityCode: input.contractAuthorityCode,
    financeAuthorityCode: input.financeAuthorityCode,
    observationCode: input.observationCode,
    verificationProvenanceSha256: input.verificationProvenanceSha256,
    expectedProjectRevision: input.expectedProjectRevision,
  };
}

export function hashServicePaymentOperationRequest(
  input: ServicePaymentOperationRequestInput
) {
  return hashProjectOperationRequest(
    buildServicePaymentOperationRequest(input)
  );
}

/* ------------------------------------------------------------------------- *
 * Deterministic effective projection (M4-007 read model)
 * ------------------------------------------------------------------------- */

export type ServicePaymentConditionSnapshot = {
  conditionId: string;
  requirement: ServicePaymentRequirement;
  amountMinor: number | null;
  currency: string | null;
  agreementVersionId: string;
  agreementTermsSha256: string;
  supersededAt: string | null;
};

export type ServicePaymentEvidenceSnapshot = {
  evidenceId: string;
  status: ServicePaymentEvidenceStatus;
  amountMinor: number;
  currency: string;
  submittedAt: string;
  verifiedAt: string | null;
};

export type ServicePaymentResolutionSnapshot = {
  resolutionId: string;
  kind: ServicePaymentResolutionKind;
  evidenceId: string | null;
  supersedesResolutionId: string | null;
  resolvedAt: string;
};

export type ServicePaymentEvaluationInput = {
  condition: ServicePaymentConditionSnapshot | null;
  currentAgreementVersionId: string | null;
  currentAgreementTermsSha256: string | null;
  engagementStatus: string;
  evidences: readonly ServicePaymentEvidenceSnapshot[];
  resolutions: readonly ServicePaymentResolutionSnapshot[];
};

export type ServicePaymentEvaluation = {
  status: ServicePaymentEffectiveStatus;
  reasonCode: ServicePaymentReasonCode;
  conditionId: string | null;
  /** Verified evidence currently supporting satisfaction, when SATISFIED. */
  effectiveEvidenceId: string | null;
  /** True when the recorded condition no longer matches the current contract. */
  contractCurrent: boolean;
  policyVersion: typeof SERVICE_PAYMENT_POLICY_VERSION;
};

function descendingByTime<T>(
  values: readonly T[],
  time: (value: T) => string,
  id: (value: T) => string
): T[] {
  return [...values].sort((left, right) => {
    const delta = time(right).localeCompare(time(left));
    return delta === 0 ? id(right).localeCompare(id(left)) : delta;
  });
}

/**
 * Resolve the current effective payment status from persisted facts only.
 *
 * Deterministic and pure: identical inputs always produce identical output. It
 * never reads a mutable `isPaid` flag (none exists), never treats a pending or
 * rejected receipt as settlement, and never lets an old `SATISFIED` attestation
 * survive a reversal, a refund, a dispute or an agreement replacement.
 */
export type ServicePaymentEvaluationFacts = {
  condition: ServicePaymentConditionSnapshot | null;
  currentAgreementVersionId: string | null;
  currentAgreementTermsSha256: string | null;
  engagementStatus: string;
  /**
   * Every currently-effective resolution kind for the live condition, computed from
   * the complete lineage (a correction removes its target from this set). This is
   * intentionally not a paginated window: an old VOID or REVERSAL must never
   * disappear because newer rows exist.
   */
  activeResolutionKinds: readonly ServicePaymentResolutionKind[];
  /** Newest verified evidence that matches the condition and is not invalidated. */
  satisfiedEvidenceId: string | null;
  hasPendingEvidence: boolean;
};

/**
 * Resolve the current effective payment status from complete persisted facts.
 *
 * Deterministic and pure: identical inputs always produce identical output. It
 * never reads a mutable paid flag (none exists), never treats pending or rejected
 * evidence as settlement, and never lets an old SATISFIED attestation survive a
 * reversal, refund, dispute, void or agreement replacement.
 *
 * The frozen precedence is `VOID > DISPUTED > REVERSED > SATISFIED >
 * EVIDENCE_PENDING > REQUIRED_UNSATISFIED`, with `UNKNOWN`/`NOT_REQUIRED` decided by
 * the contractual requirement itself.
 */
export function evaluateServicePaymentFacts(
  facts: ServicePaymentEvaluationFacts
): ServicePaymentEvaluation {
  const policyVersion = SERVICE_PAYMENT_POLICY_VERSION;
  const condition = facts.condition;
  if (!condition) {
    return {
      status: "UNKNOWN",
      reasonCode: "condition_absent",
      conditionId: null,
      effectiveEvidenceId: null,
      contractCurrent: false,
      policyVersion,
    };
  }
  const base = {
    conditionId: condition.conditionId,
    effectiveEvidenceId: null,
    policyVersion,
  } as const;
  if (condition.supersededAt !== null) {
    return {
      ...base,
      status: "UNKNOWN",
      reasonCode: "condition_superseded",
      contractCurrent: false,
    };
  }
  const contractCurrent =
    condition.agreementVersionId === facts.currentAgreementVersionId &&
    condition.agreementTermsSha256 === facts.currentAgreementTermsSha256;
  if (!contractCurrent) {
    return {
      ...base,
      status: "UNKNOWN",
      reasonCode: "contract_not_current",
      contractCurrent: false,
    };
  }
  if (facts.engagementStatus === "terminated") {
    return {
      ...base,
      status: "UNKNOWN",
      reasonCode: "engagement_terminated",
      contractCurrent,
    };
  }
  const active = new Set(facts.activeResolutionKinds);
  if (active.has("void")) {
    return {
      ...base,
      status: "VOID",
      reasonCode: "condition_voided",
      contractCurrent,
    };
  }
  if (condition.requirement === "unknown") {
    return {
      ...base,
      status: "UNKNOWN",
      reasonCode: "contract_requirement_unknown",
      contractCurrent,
    };
  }
  if (condition.requirement === "not_required") {
    return {
      ...base,
      status: "NOT_REQUIRED",
      reasonCode: "contractually_not_required",
      contractCurrent,
    };
  }
  if (active.has("dispute")) {
    return {
      ...base,
      status: "DISPUTED",
      reasonCode: "payment_disputed",
      contractCurrent,
    };
  }
  if (active.has("reversal")) {
    return {
      ...base,
      status: "REVERSED",
      reasonCode: "payment_reversed",
      contractCurrent,
    };
  }
  if (active.has("refund")) {
    return {
      ...base,
      status: "REVERSED",
      reasonCode: "payment_refunded",
      contractCurrent,
    };
  }
  if (facts.satisfiedEvidenceId) {
    return {
      ...base,
      status: "SATISFIED",
      reasonCode: "evidence_verified",
      contractCurrent,
      effectiveEvidenceId: facts.satisfiedEvidenceId,
    };
  }
  if (facts.hasPendingEvidence) {
    return {
      ...base,
      status: "EVIDENCE_PENDING",
      reasonCode: "evidence_pending",
      contractCurrent,
    };
  }
  return {
    ...base,
    status: "REQUIRED_UNSATISFIED",
    reasonCode: "no_evidence",
    contractCurrent,
  };
}

/**
 * List-based convenience wrapper. It requires **complete** evidence and resolution
 * lists for the condition: callers that hold only a paginated window must use
 * `evaluateServicePaymentFacts` with authoritative aggregates instead.
 */
export function evaluateServicePaymentState(
  input: ServicePaymentEvaluationInput
): ServicePaymentEvaluation {
  const resolutions = descendingByTime(
    input.resolutions,
    (value) => value.resolvedAt,
    (value) => value.resolutionId
  );
  const superseded = new Set<string>();
  for (const resolution of resolutions) {
    if (resolution.supersedesResolutionId) {
      superseded.add(resolution.supersedesResolutionId);
    }
  }
  const active = resolutions.filter(
    (resolution) => !superseded.has(resolution.resolutionId)
  );
  const invalidated = new Set(
    active
      .filter((resolution) => resolution.kind !== "void")
      .map((resolution) => resolution.evidenceId)
      .filter((value): value is string => Boolean(value))
  );
  const condition = input.condition;
  const evidences = descendingByTime(
    input.evidences,
    (value) => value.verifiedAt ?? value.submittedAt,
    (value) => value.evidenceId
  );
  const satisfied = evidences.find(
    (evidence) =>
      evidence.status === "verified" &&
      !invalidated.has(evidence.evidenceId) &&
      condition !== null &&
      evidence.amountMinor === condition.amountMinor &&
      evidence.currency === condition.currency
  );
  return evaluateServicePaymentFacts({
    activeResolutionKinds: active.map((resolution) => resolution.kind),
    condition,
    currentAgreementTermsSha256: input.currentAgreementTermsSha256,
    currentAgreementVersionId: input.currentAgreementVersionId,
    engagementStatus: input.engagementStatus,
    hasPendingEvidence: evidences.some(
      (evidence) => evidence.status === "pending"
    ),
    satisfiedEvidenceId: satisfied?.evidenceId ?? null,
  });
}

/**
 * Binds one staff decision (dispute/void/correction) to the exact condition,
 * evidence target, reason and supporting-reference digest. The HTTP layer and the
 * repository compute this identically, so a decision made about one record cannot
 * be replayed against another.
 */
export function buildServicePaymentStaffResolutionObservation(input: {
  conditionId: string;
  evidenceId: string | null;
  resolutionKind: ServicePaymentResolutionKind;
  reasonCode: string;
  referenceSha256: string;
}) {
  return {
    domain: "phase13_m4_005_staff_resolution_observation",
    conditionId: input.conditionId,
    evidenceId: input.evidenceId,
    resolutionKind: input.resolutionKind,
    reasonCode: input.reasonCode,
    referenceSha256: input.referenceSha256,
  };
}

export function hashServicePaymentStaffResolutionObservation(input: {
  conditionId: string;
  evidenceId: string | null;
  resolutionKind: ServicePaymentResolutionKind;
  reasonCode: string;
  referenceSha256: string;
}) {
  return hashProjectOperationRequest(
    buildServicePaymentStaffResolutionObservation(input)
  );
}

/** Strict ISO-8601 round-trip parse; accepts only canonical UTC strings. */
export function parseServicePaymentIsoTimestamp(value: string) {
  if (!Number.isFinite(Date.parse(value))) {
    return null;
  }
  const date = new Date(value);
  return date.toISOString() === value ? date : null;
}

/**
 * A guest account can never act on a payment condition, in either direction.
 This mirrors the accepted M4-004 account rule without importing that module.
 */
export function isNonGuestServicePaymentAccount(email: string) {
  return email.trim().length > 0 && !guestRegex.test(email);
}

/**
 * The resolution target shape, shared by the HTTP boundary, the repository and
 * Migration 0044's `ServicePaymentResolution_target_check`:
 *
 * - `dispute` / `refund` / `reversal` must name the exact evidence row they
 *   invalidate, and never supersede another resolution;
 * - `void` is condition-wide and must not pretend to target a payment row;
 * - `correction` must name exactly one earlier resolution to supersede and must
 *   **not** name an evidence row: a correction restores a mistaken decision, so
 *   pointing it at evidence could invalidate the very payment it restores.
 */
export function servicePaymentResolutionShapeValid(input: {
  kind: ServicePaymentResolutionKind;
  evidenceId: string | null;
  supersedesResolutionId: string | null;
}) {
  if (input.kind === "void") {
    return input.evidenceId === null && input.supersedesResolutionId === null;
  }
  if (input.kind === "correction") {
    return input.supersedesResolutionId !== null && input.evidenceId === null;
  }
  return input.evidenceId !== null && input.supersedesResolutionId === null;
}

/* ------------------------------------------------------------------------- *
 * Canonical request identities
 *
 * The HTTP boundary and the repository build these through the *same* functions,
 * so the request hash a caller supplies can always be deterministically
 * re-derived from the intended request. A caller-supplied hash is never trusted on
 * its own, and two different semantic requests can never share one identity.
 * ------------------------------------------------------------------------- */

/* ------------------------------------------------------------------------- *
 * Canonical request identities (FIX-05)
 *
 * The HTTP boundary and the repository build request identities through these
 * same functions, so the hash can always be deterministically re-derived from the
 * intended request. Fields that do not affect the persisted record or decision are
 * deliberately excluded; every field that does affect them is included.
 * ------------------------------------------------------------------------- */

/**
 * R2-B: the persisted observation code is truncated to the column width, so the
 * canonical identity binds exactly the value that will be stored.
 */
export function servicePaymentPersistedObservationCode(
  observationCode: string | null
) {
  if (!observationCode) {
    return null;
  }
  const trimmed = observationCode.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, 64);
}

/**
 * R2-B: verification provenance is persisted verbatim, but only its domain-separated
 * digest enters the canonical identity. Raw provenance text therefore never becomes
 * part of a stored hash input, a log line or a telemetry field.
 */
export function servicePaymentVerificationProvenanceSha256(provenance: string) {
  return hashProjectOperationRequest({
    domain: "phase13_m4_005_verification_provenance_binding",
    provenanceSha256: hashProjectOperationRequest({
      domain: "phase13_m4_005_verification_provenance",
      provenance: provenance.slice(0, SERVICE_PAYMENT_PROVENANCE_MAX),
    }),
  });
}

/** Identity of a contract-payment-condition decision. */
export function servicePaymentConditionRequestIdentity(input: {
  projectId: string;
  engagementId: string;
  agreementVersionId: string;
  agreementTermsSha256: string;
  requirement: ServicePaymentRequirement;
  amountMinor: number | null;
  currency: string | null;
  contractualBasisCode: ServicePaymentContractualBasisCode;
  contractualBasisRef: string | null;
  contractObservationSha256: string;
  contractAuthorityCode: string;
  expectedProjectRevision: number;
}): ServicePaymentOperationRequestInput {
  return {
    action: "record_condition",
    agreementTermsSha256: input.agreementTermsSha256,
    agreementVersionId: input.agreementVersionId,
    amountMinor: input.amountMinor,
    conditionId: null,
    contractAuthorityCode: input.contractAuthorityCode,
    contractualBasisCode: input.contractualBasisCode,
    contractualBasisRef: input.contractualBasisRef,
    currency: input.currency,
    engagementId: input.engagementId,
    evidenceCategory: null,
    evidenceId: null,
    expectedProjectRevision: input.expectedProjectRevision,
    financeAuthorityCode: null,
    observationCode: null,
    observationSha256: input.contractObservationSha256,
    paidAt: null,
    projectId: input.projectId,
    reasonCode: null,
    referenceSha256: null,
    requirement: input.requirement,
    resolutionKind: null,
    supersedesResolutionId: null,
    verificationMethod: null,
    verificationProvenanceSha256: null,
    verificationProviderCode: null,
    verificationReasonCode: null,
    verificationStatus: null,
  };
}

/** Identity of one external payment-evidence submission. */
export function servicePaymentEvidenceRequestIdentity(input: {
  projectId: string;
  engagementId: string;
  conditionId: string;
  agreementVersionId: string;
  agreementTermsSha256: string;
  evidenceCategory: ServicePaymentEvidenceCategory;
  referenceSha256: string;
  observationSha256: string;
  declaredAmountMinor: number;
  declaredCurrency: string;
  paidAt: string;
  expectedProjectRevision: number;
}): ServicePaymentOperationRequestInput {
  return {
    action: "submit_evidence",
    agreementTermsSha256: input.agreementTermsSha256,
    agreementVersionId: input.agreementVersionId,
    amountMinor: input.declaredAmountMinor,
    conditionId: input.conditionId,
    contractAuthorityCode: null,
    contractualBasisCode: null,
    contractualBasisRef: null,
    currency: input.declaredCurrency,
    engagementId: input.engagementId,
    evidenceCategory: input.evidenceCategory,
    evidenceId: null,
    expectedProjectRevision: input.expectedProjectRevision,
    financeAuthorityCode: null,
    observationCode: null,
    observationSha256: input.observationSha256,
    paidAt: input.paidAt,
    projectId: input.projectId,
    reasonCode: null,
    referenceSha256: input.referenceSha256,
    requirement: null,
    resolutionKind: null,
    supersedesResolutionId: null,
    verificationMethod: null,
    verificationProvenanceSha256: null,
    verificationProviderCode: null,
    verificationReasonCode: null,
    verificationStatus: null,
  };
}

/** Identity of one independent evidence evaluation decision. */
export function servicePaymentVerificationRequestIdentity(input: {
  projectId: string;
  engagementId: string;
  conditionId: string;
  evidenceId: string;
  agreementVersionId: string;
  agreementTermsSha256: string;
  amountMinor: number | null;
  currency: string | null;
  observationSha256: string;
  status: "verified" | "rejected";
  method: ServicePaymentVerificationMethod;
  providerCode: string;
  reasonCode: string | null;
  /** Persisted verbatim; only its digest enters the identity (R2-B). */
  provenance: string;
  expectedProjectRevision: number;
}): ServicePaymentOperationRequestInput {
  return {
    action: "verify_evidence",
    agreementTermsSha256: input.agreementTermsSha256,
    agreementVersionId: input.agreementVersionId,
    amountMinor: input.amountMinor,
    conditionId: input.conditionId,
    contractAuthorityCode: null,
    contractualBasisCode: null,
    contractualBasisRef: null,
    currency: input.currency,
    engagementId: input.engagementId,
    evidenceCategory: null,
    evidenceId: input.evidenceId,
    expectedProjectRevision: input.expectedProjectRevision,
    financeAuthorityCode: null,
    observationCode: null,
    observationSha256: input.observationSha256,
    paidAt: null,
    projectId: input.projectId,
    reasonCode: null,
    referenceSha256: null,
    requirement: null,
    resolutionKind: null,
    supersedesResolutionId: null,
    verificationMethod: input.method,
    verificationProvenanceSha256: servicePaymentVerificationProvenanceSha256(
      input.provenance
    ),
    verificationProviderCode: input.providerCode,
    verificationReasonCode: input.reasonCode,
    verificationStatus: input.status,
  };
}

/** Identity of one dispute/refund/reversal/void/correction decision. */
export function servicePaymentResolutionRequestIdentity(input: {
  projectId: string;
  engagementId: string;
  conditionId: string;
  agreementVersionId: string;
  agreementTermsSha256: string;
  amountMinor: number | null;
  currency: string | null;
  kind: ServicePaymentResolutionKind;
  evidenceId: string | null;
  reasonCode: string;
  observationSha256: string;
  observationCode: string | null;
  financeAuthorityCode: string;
  supersedesResolutionId: string | null;
  expectedProjectRevision: number;
}): ServicePaymentOperationRequestInput {
  return {
    action: "record_resolution",
    agreementTermsSha256: input.agreementTermsSha256,
    agreementVersionId: input.agreementVersionId,
    amountMinor: input.amountMinor,
    conditionId: input.conditionId,
    contractAuthorityCode: null,
    contractualBasisCode: null,
    contractualBasisRef: null,
    currency: input.currency,
    engagementId: input.engagementId,
    evidenceCategory: null,
    evidenceId: input.evidenceId,
    expectedProjectRevision: input.expectedProjectRevision,
    financeAuthorityCode: input.financeAuthorityCode,
    observationSha256: input.observationSha256,
    paidAt: null,
    projectId: input.projectId,
    observationCode: servicePaymentPersistedObservationCode(
      input.observationCode
    ),
    reasonCode: input.reasonCode,
    referenceSha256: null,
    requirement: null,
    resolutionKind: input.kind,
    supersedesResolutionId: input.supersedesResolutionId,
    verificationMethod: null,
    verificationProvenanceSha256: null,
    verificationProviderCode: null,
    verificationReasonCode: null,
    verificationStatus: null,
  };
}

/**
 * Canonical read-authorization request (FIX-02). A staff actor may not read an
 * engagement's payment status merely because they hold an M4-002 assignment; the
 * binding covers the exact actor, Project, Engagement and the resolved condition.
 */
export function buildServicePaymentStatusReadRequest(input: {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  scope: "owner" | "operator";
}) {
  return {
    domain: "phase13_m4_005_payment_status_read",
    scope: input.scope,
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    engagementId: input.engagementId,
  };
}

export function hashServicePaymentStatusReadRequest(input: {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  scope: "owner" | "operator";
}) {
  return hashProjectOperationRequest(
    buildServicePaymentStatusReadRequest(input)
  );
}
