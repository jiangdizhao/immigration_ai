// biome-ignore-all lint/style/noExportedImports: the M5.1 error type and vocabulary are re-exported by design.
import { createHash } from "node:crypto";
import {
  hashProjectOperationRequest,
  validateProjectOperationId,
} from "@/lib/db/project-foundation-utils";
import { canonicalJson } from "@/lib/managed-target/policy";
import {
  SCHOOL_APPLICATION_MAX_ID,
  SCHOOL_APPLICATION_MAX_LABEL,
  SCHOOL_APPLICATION_MAX_REFERENCES,
  SCHOOL_APPLICATION_MAX_TEXT,
  type SchoolApplicationCatalogRecordClass,
  SchoolApplicationError,
  type SchoolApplicationMissingDataCode,
  type SchoolApplicationReferenceKind,
  type SchoolApplicationSourceStatus,
} from "@/lib/school-applications/contracts";

/**
 * Phase 13 M5.2 — Complete School Admissions Workflow contracts.
 *
 * This module is the single definition of:
 *   - the admission *case* (a school application, or a genuine existing
 *     Offer/CoE/exception entry point that must NOT create a fake application),
 *   - Self-Service versus Managed-Service authority boundaries,
 *   - the evidence-limited requirement checklist and provisional preparation
 *     draft (deterministic, source-linked, never AI-certified),
 *   - Offer/CoE provenance and state transitions (customer-reported is never
 *     verified, and a CoE never establishes Student 500 eligibility), and
 *   - deterministic invalidation, disclosures and the feature gate.
 *
 * Nothing in this module performs I/O, calls a model, or contacts a school,
 * provider, lawyer, payment or visa authority. Every "confirmed" value must come
 * from a separately authorized source; unavailable authority yields UNKNOWN,
 * needs-verification or NOT_READY, never a positive.
 */

export const SCHOOL_ADMISSIONS_POLICY_VERSION =
  "phase13-m5-2-school-admissions-v1" as const;
export const SCHOOL_ADMISSIONS_CASE_SCHEMA =
  "phase13.school-admission-case.v1" as const;
export const SCHOOL_ADMISSIONS_PREPARATION_SCHEMA =
  "phase13.school-admissions-preparation.v1" as const;

/** Bounds. M5.1 allows 12 applications per Project; cases may add entry points. */
export const SCHOOL_ADMISSIONS_MAX_CASES_PER_PROJECT = 16;
export const SCHOOL_ADMISSIONS_MAX_EXTERNAL_ACTIONS = 40;
export const SCHOOL_ADMISSIONS_MAX_OUTCOME_VERSIONS = 24;
export const SCHOOL_ADMISSIONS_MAX_EXCEPTION_VERSIONS = 12;
export const SCHOOL_ADMISSIONS_MAX_PREPARATIONS = 24;
export const SCHOOL_ADMISSIONS_MAX_SECTIONS = 16;
export const SCHOOL_ADMISSIONS_MAX_NOTE = 600;
export const SCHOOL_ADMISSIONS_MAX_EXCEPTION_TEXT = 300;
export const SCHOOL_ADMISSIONS_MAX_TEXT = SCHOOL_APPLICATION_MAX_TEXT;
export const SCHOOL_ADMISSIONS_MAX_LABEL = SCHOOL_APPLICATION_MAX_LABEL;
export const SCHOOL_ADMISSIONS_MAX_ID = SCHOOL_APPLICATION_MAX_ID;
export const SCHOOL_ADMISSIONS_MAX_RECORD_BYTES = 64 * 1024;

export const SCHOOL_ADMISSIONS_SERVICE_MODES = [
  "self_service",
  "managed_service",
] as const;
export type SchoolAdmissionsServiceMode =
  (typeof SCHOOL_ADMISSIONS_SERVICE_MODES)[number];

/**
 * How a case entered the journey.
 *
 * Only `school_application` is bound to an M5.1 `SchoolApplication`. The other
 * three exist precisely so an existing genuine Offer, CoE or claimed exception
 * never forces a fabricated school application or receipt.
 */
export const SCHOOL_ADMISSIONS_ORIGIN_KINDS = [
  "school_application",
  "existing_offer",
  "existing_coe",
  "claimed_exception",
] as const;
export type SchoolAdmissionsOriginKind =
  (typeof SCHOOL_ADMISSIONS_ORIGIN_KINDS)[number];

/** Origins that carry their own customer-declared institution/course identity. */
export const SCHOOL_ADMISSIONS_STANDALONE_ORIGINS = [
  "existing_offer",
  "existing_coe",
  "claimed_exception",
] as const;

export const SCHOOL_ADMISSIONS_PREPARATION_STATES = [
  "not_started",
  "in_preparation",
  "ready_for_customer_review",
  "customer_confirmed",
  "stale",
] as const;
export type SchoolAdmissionsPreparationState =
  (typeof SCHOOL_ADMISSIONS_PREPARATION_STATES)[number];

export const SCHOOL_ADMISSIONS_REQUIREMENT_CODES = [
  "application_target_complete",
  "evidence_fact_available",
  "evidence_document_available",
  "education_source_resolved",
  "preparation_package_usable",
  "customer_confirmation_recorded",
  "managed_engagement_current",
  "managed_authority_verified",
  "outcome_pathway_present",
  "coe_evidence_recorded",
] as const;
export type SchoolAdmissionsRequirementCode =
  (typeof SCHOOL_ADMISSIONS_REQUIREMENT_CODES)[number];

export const SCHOOL_ADMISSIONS_REQUIREMENT_STATUSES = [
  "satisfied",
  "missing",
  "unverified",
  "conflicting",
  "unknown",
  "not_applicable",
] as const;
export type SchoolAdmissionsRequirementStatus =
  (typeof SCHOOL_ADMISSIONS_REQUIREMENT_STATUSES)[number];

export const SCHOOL_ADMISSIONS_SECTION_CODES = [
  "application_summary",
  "academic_background",
  "english_proficiency",
  "financial_capacity",
  "study_purpose",
  "provider_requirements",
  "next_steps",
] as const;
export type SchoolAdmissionsSectionCode =
  (typeof SCHOOL_ADMISSIONS_SECTION_CODES)[number];

export const SCHOOL_ADMISSIONS_DRAFT_SOURCES = [
  "deterministic_template",
  "authorized_m2_fact",
  "authorized_m2_document",
  "m3_catalog",
  "customer_input",
  "m5_1_package",
] as const;
export type SchoolAdmissionsDraftSource =
  (typeof SCHOOL_ADMISSIONS_DRAFT_SOURCES)[number];

/**
 * AI assistance is a *drafting suggestion* only. `disabled` is the production
 * default: no model provider is approved, so no Project data leaves the process.
 */
export const SCHOOL_ADMISSIONS_ASSIST_KINDS = [
  "deterministic_template",
  "stub_suggestion",
  "disabled",
] as const;
export type SchoolAdmissionsAssistKind =
  (typeof SCHOOL_ADMISSIONS_ASSIST_KINDS)[number];

/**
 * Outcome provenance ladder, lowest to highest. A customer request can only ever
 * produce the first two levels; the last two require a genuinely authorized
 * reviewer/provider port that does not exist in production.
 */
export const SCHOOL_ADMISSIONS_OUTCOME_PROVENANCES = [
  "customer_reported",
  "document_backed_unverified",
  "source_reviewed",
  "provider_confirmed",
] as const;
export type SchoolAdmissionsOutcomeProvenance =
  (typeof SCHOOL_ADMISSIONS_OUTCOME_PROVENANCES)[number];

export const SCHOOL_ADMISSIONS_OUTCOME_KINDS = ["offer", "coe"] as const;
export type SchoolAdmissionsOutcomeKind =
  (typeof SCHOOL_ADMISSIONS_OUTCOME_KINDS)[number];

export const SCHOOL_ADMISSIONS_OFFER_STATES = [
  "received",
  "under_review",
  "accepted",
  "declined",
  "expired",
  "deferred",
] as const;
export type SchoolAdmissionsOfferState =
  (typeof SCHOOL_ADMISSIONS_OFFER_STATES)[number];

export const SCHOOL_ADMISSIONS_COE_STATES = [
  "claimed",
  "obtained",
  "superseded",
] as const;
export type SchoolAdmissionsCoeState =
  (typeof SCHOOL_ADMISSIONS_COE_STATES)[number];

export const SCHOOL_ADMISSIONS_OFFER_ACTIONS = [
  "start_review",
  "accept",
  "decline",
  "expire",
  "defer",
] as const;
export type SchoolAdmissionsOfferAction =
  (typeof SCHOOL_ADMISSIONS_OFFER_ACTIONS)[number];

export const SCHOOL_ADMISSIONS_EXPIRY_STATES = [
  "not_applicable",
  "valid",
  "expiring_soon",
  "expired",
  "unknown",
] as const;
export type SchoolAdmissionsExpiryState =
  (typeof SCHOOL_ADMISSIONS_EXPIRY_STATES)[number];

/** Days before `expiresOn` at which an offer is surfaced as expiring. */
export const SCHOOL_ADMISSIONS_EXPIRY_WARNING_DAYS = 14;

export const SCHOOL_ADMISSIONS_EXTERNAL_ACTION_KINDS = [
  "school_portal_submission",
  "email_submission",
  "paper_form_submission",
  "agent_submission",
  "phone_follow_up",
  "other",
] as const;
export type SchoolAdmissionsExternalActionKind =
  (typeof SCHOOL_ADMISSIONS_EXTERNAL_ACTION_KINDS)[number];

export const SCHOOL_ADMISSIONS_EXCEPTION_CLAIM_KINDS = [
  "school_application_exception",
] as const;
export type SchoolAdmissionsExceptionClaimKind =
  (typeof SCHOOL_ADMISSIONS_EXCEPTION_CLAIM_KINDS)[number];

export const SCHOOL_ADMISSIONS_EXCEPTION_STATES = [
  "claimed",
  "needs_verification",
  "verified",
  "rejected",
  "unknown",
] as const;
export type SchoolAdmissionsExceptionState =
  (typeof SCHOOL_ADMISSIONS_EXCEPTION_STATES)[number];

export const SCHOOL_ADMISSIONS_READINESS_STATUSES = [
  "NOT_EVALUATED",
  "READY",
  "NOT_READY",
  "UNKNOWN",
] as const;
export type SchoolAdmissionsReadinessStatus =
  (typeof SCHOOL_ADMISSIONS_READINESS_STATUSES)[number];

/** M5.2 never submits. Both values are non-submitting by construction. */
export const SCHOOL_ADMISSIONS_SUBMISSION_STATES = [
  "not_connected",
  "not_authorized",
] as const;
export type SchoolAdmissionsSubmissionState =
  (typeof SCHOOL_ADMISSIONS_SUBMISSION_STATES)[number];

export const SCHOOL_ADMISSIONS_DISCLOSURES = [
  "not_a_school_submission",
  "no_institutional_decision",
  "no_verified_offer_or_coe",
  "customer_report_not_verified",
  "document_not_authenticated",
  "coe_does_not_establish_student_500_eligibility",
  "managed_submission_not_connected",
  "vip_not_managed_entitlement",
  "professional_authority_unavailable",
  "ai_assist_unavailable",
  "draft_is_provisional",
  "catalog_not_independently_verified",
  "requirements_not_legal_advice",
  "payment_not_certified",
] as const;
export type SchoolAdmissionsDisclosure =
  (typeof SCHOOL_ADMISSIONS_DISCLOSURES)[number];

export const SCHOOL_ADMISSIONS_NEXT_STEPS = [
  "complete_application_details",
  "bind_source_evidence",
  "resolve_conflicting_facts",
  "build_preparation_package",
  "record_customer_confirmation",
  "select_service_mode",
  "record_offer_or_exception",
  "record_coe_evidence",
  "review_offer_expiry",
  "await_institutional_response",
  "request_managed_service_support",
  "verify_exception_authoritatively",
] as const;
export type SchoolAdmissionsNextStep =
  (typeof SCHOOL_ADMISSIONS_NEXT_STEPS)[number];

export const SCHOOL_ADMISSIONS_STALE_REASONS = [
  "case_changed",
  "application_changed",
  "package_changed",
  "source_changed",
  "source_unavailable",
  "catalog_changed",
  "requirements_changed",
  "case_archived",
] as const;
export type SchoolAdmissionsStaleReason =
  (typeof SCHOOL_ADMISSIONS_STALE_REASONS)[number];

export type SchoolAdmissionsErrorCode =
  | "invalid_request"
  | "actor_not_eligible"
  | "project_not_found"
  | "project_forbidden"
  | "project_closed"
  | "case_not_found"
  | "case_archived"
  | "application_not_found"
  | "application_archived"
  | "revision_conflict"
  | "idempotency_conflict"
  | "state_conflict"
  | "limit_exceeded"
  | "evidence_invalid"
  | "evidence_unavailable"
  | "authority_unavailable"
  | "outcome_not_found"
  | "exception_not_found"
  | "integrity_conflict"
  | "feature_disabled";

export class SchoolAdmissionsError extends Error {
  readonly code: SchoolAdmissionsErrorCode;

  constructor(code: SchoolAdmissionsErrorCode) {
    super(code);
    this.name = "SchoolAdmissionsError";
    this.code = code;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

export function isSchoolAdmissionsUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isSchoolAdmissionsSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_RE.test(value);
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function normalizeSchoolAdmissionsText(
  value: unknown,
  max: number = SCHOOL_ADMISSIONS_MAX_TEXT
): string {
  if (typeof value !== "string") {
    throw new SchoolAdmissionsError("invalid_request");
  }
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    normalized.length === 0 ||
    normalized.length > max ||
    hasControlCharacters(normalized)
  ) {
    throw new SchoolAdmissionsError("invalid_request");
  }
  return normalized;
}

export function normalizeOptionalSchoolAdmissionsText(
  value: unknown,
  max: number = SCHOOL_ADMISSIONS_MAX_TEXT
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new SchoolAdmissionsError("invalid_request");
  }
  if (value.trim().length === 0) {
    return null;
  }
  return normalizeSchoolAdmissionsText(value, max);
}

export function normalizeOptionalSchoolAdmissionsDate(
  value: unknown
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new SchoolAdmissionsError("invalid_request");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new SchoolAdmissionsError("invalid_request");
  }
  return value;
}

export function validateSchoolAdmissionsOperationId(value: unknown): string {
  if (typeof value !== "string") {
    throw new SchoolAdmissionsError("invalid_request");
  }
  try {
    return validateProjectOperationId(value);
  } catch {
    throw new SchoolAdmissionsError("invalid_request");
  }
}

export function validateSchoolAdmissionsRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new SchoolAdmissionsError("invalid_request");
  }
  return value;
}

export function isSchoolAdmissionsServiceMode(
  value: unknown
): value is SchoolAdmissionsServiceMode {
  return (
    typeof value === "string" &&
    (SCHOOL_ADMISSIONS_SERVICE_MODES as readonly string[]).includes(value)
  );
}

export function isSchoolAdmissionsOriginKind(
  value: unknown
): value is SchoolAdmissionsOriginKind {
  return (
    typeof value === "string" &&
    (SCHOOL_ADMISSIONS_ORIGIN_KINDS as readonly string[]).includes(value)
  );
}

export function isSchoolAdmissionsOutcomeKind(
  value: unknown
): value is SchoolAdmissionsOutcomeKind {
  return (
    typeof value === "string" &&
    (SCHOOL_ADMISSIONS_OUTCOME_KINDS as readonly string[]).includes(value)
  );
}

export function isSchoolAdmissionsOutcomeProvenance(
  value: unknown
): value is SchoolAdmissionsOutcomeProvenance {
  return (
    typeof value === "string" &&
    (SCHOOL_ADMISSIONS_OUTCOME_PROVENANCES as readonly string[]).includes(value)
  );
}

export function isSchoolAdmissionsOfferState(
  value: unknown
): value is SchoolAdmissionsOfferState {
  return (
    typeof value === "string" &&
    (SCHOOL_ADMISSIONS_OFFER_STATES as readonly string[]).includes(value)
  );
}

export function isSchoolAdmissionsCoeState(
  value: unknown
): value is SchoolAdmissionsCoeState {
  return (
    typeof value === "string" &&
    (SCHOOL_ADMISSIONS_COE_STATES as readonly string[]).includes(value)
  );
}

export function isSchoolAdmissionsOfferAction(
  value: unknown
): value is SchoolAdmissionsOfferAction {
  return (
    typeof value === "string" &&
    (SCHOOL_ADMISSIONS_OFFER_ACTIONS as readonly string[]).includes(value)
  );
}

export function isSchoolAdmissionsExternalActionKind(
  value: unknown
): value is SchoolAdmissionsExternalActionKind {
  return (
    typeof value === "string" &&
    (SCHOOL_ADMISSIONS_EXTERNAL_ACTION_KINDS as readonly string[]).includes(
      value
    )
  );
}

export function provenanceRank(
  provenance: SchoolAdmissionsOutcomeProvenance
): number {
  return SCHOOL_ADMISSIONS_OUTCOME_PROVENANCES.indexOf(provenance) + 1;
}

/** Provenance levels a customer request may author. Everything above needs authority. */
export const SCHOOL_ADMISSIONS_CUSTOMER_AUTHORABLE_PROVENANCES = [
  "customer_reported",
  "document_backed_unverified",
] as const satisfies readonly SchoolAdmissionsOutcomeProvenance[];

export function isCustomerAuthorableProvenance(
  provenance: SchoolAdmissionsOutcomeProvenance
): boolean {
  return (
    SCHOOL_ADMISSIONS_CUSTOMER_AUTHORABLE_PROVENANCES as readonly string[]
  ).includes(provenance);
}

/** A provenance that only a verified reviewer/provider port may set. */
export function requiresAuthoritativeProvenance(
  provenance: SchoolAdmissionsOutcomeProvenance
): boolean {
  return provenanceRank(provenance) >= provenanceRank("source_reviewed");
}

const OFFER_TRANSITIONS: Record<
  SchoolAdmissionsOfferState,
  readonly SchoolAdmissionsOfferState[]
> = {
  received: ["under_review", "accepted", "declined", "expired", "deferred"],
  under_review: ["accepted", "declined", "expired", "deferred"],
  deferred: ["under_review", "accepted", "declined", "expired"],
  accepted: [],
  declined: [],
  expired: [],
};

const OFFER_ACTION_TARGETS: Record<
  SchoolAdmissionsOfferAction,
  SchoolAdmissionsOfferState
> = {
  start_review: "under_review",
  accept: "accepted",
  decline: "declined",
  expire: "expired",
  defer: "deferred",
};

export function offerTransitionAllowed(
  from: SchoolAdmissionsOfferState,
  to: SchoolAdmissionsOfferState
): boolean {
  return OFFER_TRANSITIONS[from].includes(to);
}

/**
 * Resolves the target state of an offer action. `accept`/`decline`/`expire` are
 * terminal, and re-applying one to a terminal state is rejected rather than
 * silently "re-confirmed".
 */
export function offerStateForAction(
  from: SchoolAdmissionsOfferState,
  action: SchoolAdmissionsOfferAction
): SchoolAdmissionsOfferState {
  const target = OFFER_ACTION_TARGETS[action];
  if (!offerTransitionAllowed(from, target)) {
    throw new SchoolAdmissionsError("state_conflict");
  }
  return target;
}

export function isTerminalOfferState(
  state: SchoolAdmissionsOfferState
): boolean {
  return OFFER_TRANSITIONS[state].length === 0;
}

/**
 * Deterministic offer expiry observation. It never mutates stored state: an
 * expired offer stays `received` until an explicit transition records the
 * decision, and the view merely reports that the recorded expiry has passed.
 */
export function offerExpiryState(input: {
  readonly state: SchoolAdmissionsOfferState;
  readonly expiresOn: string | null;
  readonly now: Date;
}): SchoolAdmissionsExpiryState {
  if (input.state === "expired") {
    return "expired";
  }
  if (isTerminalOfferState(input.state)) {
    return "not_applicable";
  }
  if (!input.expiresOn) {
    return "unknown";
  }
  const expiresAt = Date.parse(`${input.expiresOn}T23:59:59.999Z`);
  if (Number.isNaN(expiresAt)) {
    return "unknown";
  }
  const remainingMs = expiresAt - input.now.getTime();
  if (remainingMs < 0) {
    return "expired";
  }
  const warningMs = SCHOOL_ADMISSIONS_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000;
  return remainingMs <= warningMs ? "expiring_soon" : "valid";
}

export function coeValidityState(input: {
  readonly state: SchoolAdmissionsCoeState;
  readonly validTo: string | null;
  readonly now: Date;
}): SchoolAdmissionsExpiryState {
  if (input.state === "superseded") {
    return "not_applicable";
  }
  if (!input.validTo) {
    return "unknown";
  }
  const expiry = Date.parse(`${input.validTo}T23:59:59.999Z`);
  if (Number.isNaN(expiry)) {
    return "unknown";
  }
  const remaining = expiry - input.now.getTime();
  if (remaining < 0) {
    return "expired";
  }
  const warningMs = SCHOOL_ADMISSIONS_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000;
  return remaining <= warningMs ? "expiring_soon" : "valid";
}

/** Deterministic request identity: authored fields only, never derived state. */
export function schoolAdmissionsRequestSha256(value: unknown): string {
  return hashProjectOperationRequest(value);
}

export function schoolAdmissionsSha256(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

/** True only when the recorded operation digest matches the current request. */
export function schoolAdmissionsRequestMatches(
  record: { readonly requestSha256: string; readonly operationType: string },
  expected: { readonly requestSha256: string; readonly operationType: string }
): boolean {
  return (
    record.requestSha256 === expected.requestSha256 &&
    record.operationType === expected.operationType
  );
}

/** Feature gate. Default OFF: M5.2 stays dark until an explicit owner decision. */
export function schoolAdmissionsEnabled(
  value: string | undefined = process.env.PHASE13_SCHOOL_ADMISSIONS_ENABLED
): boolean {
  return value?.trim().toLowerCase() === "true";
}

/** Re-exported so callers never re-derive M5.1 vocabulary. */
export type SchoolAdmissionsApplicationReferenceKind =
  SchoolApplicationReferenceKind;
export type SchoolAdmissionsMissingDataCode = SchoolApplicationMissingDataCode;
export type SchoolAdmissionsCatalogRecordClass =
  SchoolApplicationCatalogRecordClass;
export type SchoolAdmissionsSourceStatus = SchoolApplicationSourceStatus;
export const SCHOOL_ADMISSIONS_MAX_APPLICATION_REFERENCES =
  SCHOOL_APPLICATION_MAX_REFERENCES;
/** M5.1 contract errors are mapped, never swallowed, by the M5.2 service. */
export { SchoolApplicationError };
