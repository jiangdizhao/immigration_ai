import { createHash } from "node:crypto";
import {
  hashProjectOperationRequest,
  validateProjectOperationId,
} from "@/lib/db/project-foundation-utils";
import {
  type CapabilityEnvironment,
  localPreparationCapability,
  resolveCapabilityEnvironment,
} from "@/lib/platform/capability-environment";

/**
 * Phase 13 M6.1 — Student 500 application entry and legal-intelligence contracts.
 *
 * This module is the single definition of:
 *   - the bounded Student 500 applicant/preparation context,
 *   - what a preliminary legal requirement assessment may ever claim,
 *   - deterministic missing-information selection, and
 *   - the capability gate.
 *
 * Hard invariants encoded here (Phase 13 M6.1, AGENTS.md Phase 5/6 boundaries):
 *   - no member of any enum can express visa eligibility, approval, readiness for
 *     submission, verified CoE, professional review or government status;
 *   - missing information is a first-class state (never inferred, never negative);
 *   - a legal requirement is only ever "preliminary" and always carries an
 *     explicit source-verification state.
 *
 * Deterministic code selects *which* screening dimensions apply to the reported
 * circumstances. It never decides whether a criterion is legally met, and it never
 * invents a threshold, deadline, fee or eligibility conclusion.
 */

export const STUDENT_500_VISA_SUBCLASS = "500" as const;

/** Bumped only when the persisted/returned screening shape changes. */
export const STUDENT_500_SCREENING_SCHEMA =
  "phase13.student500-screening.v1" as const;

/** Bounds. A Project is a personal preparation container, not a visa pipeline. */
export const STUDENT_500_MAX_APPLICATIONS_PER_PROJECT = 6;
export const STUDENT_500_MAX_TEXT = 200;
export const STUDENT_500_MAX_LABEL = 120;
export const STUDENT_500_MAX_ID = 128;
export const STUDENT_500_MAX_HISTORY_FLAGS = 8;

/** Declared as-of window bounds; anything outside is a request error. */
export const STUDENT_500_MIN_AS_OF_DATE = "2000-01-01";
export const STUDENT_500_MAX_AS_OF_DATE = "2100-12-31";

export const STUDENT_500_APPLICATION_STATUSES = [
  "draft",
  "in_progress",
  "archived",
] as const;
export type Student500ApplicationStatus =
  (typeof STUDENT_500_APPLICATION_STATUSES)[number];

/**
 * How the customer's study evidence path starts. Each route is a *preparation*
 * route: none of them asserts that a CoE exists, is genuine, or has been verified
 * by an institution, the department or this service.
 */
export const STUDENT_500_ENTRY_ROUTES = [
  "existing_coe",
  "offer_only",
  "school_application_in_progress",
  "no_school_application",
] as const;
export type Student500EntryRoute = (typeof STUDENT_500_ENTRY_ROUTES)[number];

/** CoE status is customer-reported only; there is no verified variant. */
export const STUDENT_500_COE_STATUSES = [
  "reported_held",
  "reported_not_held",
  "unknown",
] as const;
export type Student500CoeStatus = (typeof STUDENT_500_COE_STATUSES)[number];

export const STUDENT_500_APPLICATION_PLACES = [
  "onshore",
  "offshore",
  "unknown",
] as const;
export type Student500ApplicationPlace =
  (typeof STUDENT_500_APPLICATION_PLACES)[number];

export const STUDENT_500_AGE_BANDS = ["adult", "under_18", "unknown"] as const;
export type Student500AgeBand = (typeof STUDENT_500_AGE_BANDS)[number];

export const STUDENT_500_DEPENDANT_BANDS = [
  "none",
  "one_or_more",
  "unknown",
] as const;
export type Student500DependantBand =
  (typeof STUDENT_500_DEPENDANT_BANDS)[number];

/** Preparatory evidence status the customer can honestly report. */
export const STUDENT_500_EVIDENCE_STATUSES = [
  "reported_held",
  "reported_not_held",
  "unknown",
] as const;
export type Student500EvidenceStatus =
  (typeof STUDENT_500_EVIDENCE_STATUSES)[number];

export const STUDENT_500_HISTORY_DECLARATIONS = [
  "not_declared",
  "declared_none",
  "declared_some",
] as const;
export type Student500HistoryDeclaration =
  (typeof STUDENT_500_HISTORY_DECLARATIONS)[number];

/**
 * Material immigration-history flags. A flag is a customer report; it is never a
 * legal conclusion, and its absence is only meaningful after an explicit
 * `declared_none` declaration.
 */
export const STUDENT_500_HISTORY_FLAGS = [
  "prior_visa_refusal",
  "prior_visa_cancellation",
  "prior_visa_condition_breach",
  "prior_unlawful_period",
  "prior_immigration_detention",
] as const;
export type Student500HistoryFlag = (typeof STUDENT_500_HISTORY_FLAGS)[number];

/**
 * Requirement assessment states. `applicable` / `conditional` / `not_applicable`
 * describe whether the screening dimension must be examined for the *reported*
 * circumstances; none of them says the criterion is met.
 */
export const STUDENT_500_REQUIREMENT_STATUSES = [
  "applicable",
  "conditional",
  "not_applicable",
  "unknown",
] as const;
export type Student500RequirementStatus =
  (typeof STUDENT_500_REQUIREMENT_STATUSES)[number];

export const STUDENT_500_REQUIREMENT_KEYS = [
  "schedule1_valid_application",
  "study_evidence_coe_or_alternative",
  "genuine_student",
  "english_language_evidence",
  "financial_capacity_evidence",
  "overseas_student_health_cover",
  "health_public_interest",
  "character_public_interest",
  "under_18_welfare_arrangements",
  "family_unit_member_requirements",
  "onshore_application_restrictions",
  "offshore_application_entry",
  "prior_immigration_history_disclosure",
  "student_visa_conditions_acknowledgement",
] as const;
export type Student500RequirementKey =
  (typeof STUDENT_500_REQUIREMENT_KEYS)[number];

/**
 * Source verification state. M6.1 ships a *declared* official-source catalog and
 * performs no authoritative corpus lookup, so `verified_official_corpus` is never
 * produced in this milestone: it exists so a future authoritative adapter can be
 * wired without changing the customer-visible contract.
 */
export const STUDENT_500_SOURCE_VERIFICATIONS = [
  "verified_official_corpus",
  "declared_pending_verification",
  "insufficient_authority",
  "unavailable",
] as const;
export type Student500SourceVerification =
  (typeof STUDENT_500_SOURCE_VERIFICATIONS)[number];

export const STUDENT_500_AUTHORITY_CLASSES = [
  "legislation",
  "legislative_instrument",
  "official_guidance",
] as const;
export type Student500AuthorityClass =
  (typeof STUDENT_500_AUTHORITY_CLASSES)[number];

export const STUDENT_500_REASON_CODES = [
  "selected_for_all_student_500_applications",
  "selected_by_application_place_onshore",
  "selected_by_application_place_offshore",
  "selected_by_age_band_under_18",
  "selected_by_declared_dependants",
  "selected_by_declared_immigration_history",
  "selected_by_onshore_visa_context",
  "selected_by_study_evidence_route",
  "not_applicable_offshore_application",
  "not_applicable_no_declared_dependants",
  "not_applicable_adult_applicant",
  "not_applicable_no_declared_immigration_history",
  "unknown_application_place_missing",
  "unknown_age_band_missing",
  "unknown_dependants_missing",
  "unknown_history_not_declared",
  "unknown_current_visa_subclass_missing",
  "unknown_study_evidence_route_missing",
  "conditionally_applicable_pending_legal_verification",
  "not_assessable_legal_source_not_verified",
  "not_assessable_as_of_date_outside_declared_coverage",
  "not_assessable_no_legislative_source",
] as const;
export type Student500ReasonCode = (typeof STUDENT_500_REASON_CODES)[number];

export const STUDENT_500_MISSING_FACT_CODES = [
  "application_place",
  "as_of_date",
  "current_visa_subclass",
  "immigration_history",
  "applicant_age_band",
  "dependants",
  "english_evidence",
  "financial_evidence",
  "oshc_evidence",
  "study_evidence_route",
  "linked_school_application",
] as const;
export type Student500MissingFactCode =
  (typeof STUDENT_500_MISSING_FACT_CODES)[number];

export const STUDENT_500_HUMAN_REVIEW_REASONS = [
  "legal_source_not_verified",
  "as_of_date_outside_declared_coverage",
  "prior_refusal_or_cancellation_declared",
  "prior_condition_breach_or_unlawful_period_declared",
  "applicant_under_18",
  "dependant_family_member_declared",
  "onshore_application_context_incomplete",
  "study_evidence_not_independently_verified",
  "official_checklist_unavailable",
] as const;
export type Student500HumanReviewReason =
  (typeof STUDENT_500_HUMAN_REVIEW_REASONS)[number];

/**
 * Customer-visible disclosures. Every one of these is rendered with the
 * application so no surface can imply eligibility, approval or submission.
 */
export const STUDENT_500_DISCLOSURE_CODES = [
  "preliminary_screening_only",
  "not_legal_advice",
  "not_professionally_reviewed",
  "not_government_submission",
  "no_eligibility_determination",
  "legal_sources_pending_verification",
  "study_evidence_not_independently_verified",
] as const;
export type Student500DisclosureCode =
  (typeof STUDENT_500_DISCLOSURE_CODES)[number];

export const STUDENT_500_NEXT_ACTIONS = [
  "set_application_place",
  "set_as_of_date",
  "set_current_visa_subclass",
  "declare_immigration_history",
  "declare_applicant_age_band",
  "declare_dependants",
  "declare_study_evidence_route",
  "connect_school_application",
  "declare_english_evidence",
  "declare_financial_evidence",
  "declare_oshc_evidence",
  "await_authoritative_legal_source",
  "seek_human_review",
  "review_requirement_checklist",
] as const;
export type Student500NextAction = (typeof STUDENT_500_NEXT_ACTIONS)[number];

/**
 * Preparation state only. There is deliberately no `ready`, `submittable` or
 * `approved` member; `screening_complete_pending_review` means every declared
 * screening fact is present, not that the application may be submitted.
 */
export const STUDENT_500_PREPARATION_STATES = [
  "screening_incomplete",
  "screening_complete_pending_review",
] as const;
export type Student500PreparationState =
  (typeof STUDENT_500_PREPARATION_STATES)[number];

export const STUDENT_500_OPERATION_TYPES = [
  "student_500_create",
  "student_500_update",
  "student_500_archive",
] as const;
export type Student500OperationType =
  (typeof STUDENT_500_OPERATION_TYPES)[number];

export const STUDENT_500_OPERATION_RESULT_KINDS = [
  "student_500_application",
] as const;
export type Student500OperationResultKind =
  (typeof STUDENT_500_OPERATION_RESULT_KINDS)[number];

export const STUDENT_500_EVENT_TYPES = [
  "student_500_created",
  "student_500_updated",
  "student_500_archived",
] as const;
export type Student500EventType = (typeof STUDENT_500_EVENT_TYPES)[number];

export type Student500ErrorCode =
  | "invalid_request"
  | "actor_not_eligible"
  | "project_not_found"
  | "project_forbidden"
  | "project_closed"
  | "application_not_found"
  | "application_archived"
  | "revision_conflict"
  | "idempotency_conflict"
  | "state_conflict"
  | "limit_exceeded"
  | "reference_invalid"
  | "reference_unavailable"
  | "integrity_conflict";

export class Student500Error extends Error {
  readonly code: Student500ErrorCode;

  constructor(code: Student500ErrorCode) {
    super(code);
    this.name = "Student500Error";
    this.code = code;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const OPAQUE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function isStudent500Uuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isStudent500Sha256(value: unknown): value is string {
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

function isOneOf<T extends string>(
  values: readonly T[],
  value: unknown
): value is T {
  return (
    typeof value === "string" && (values as readonly string[]).includes(value)
  );
}

export const isStudent500EntryRoute = (
  value: unknown
): value is Student500EntryRoute => isOneOf(STUDENT_500_ENTRY_ROUTES, value);

export const isStudent500CoeStatus = (
  value: unknown
): value is Student500CoeStatus => isOneOf(STUDENT_500_COE_STATUSES, value);

export const isStudent500ApplicationPlace = (
  value: unknown
): value is Student500ApplicationPlace =>
  isOneOf(STUDENT_500_APPLICATION_PLACES, value);

export const isStudent500AgeBand = (
  value: unknown
): value is Student500AgeBand => isOneOf(STUDENT_500_AGE_BANDS, value);

export const isStudent500DependantBand = (
  value: unknown
): value is Student500DependantBand =>
  isOneOf(STUDENT_500_DEPENDANT_BANDS, value);

export const isStudent500EvidenceStatus = (
  value: unknown
): value is Student500EvidenceStatus =>
  isOneOf(STUDENT_500_EVIDENCE_STATUSES, value);

export const isStudent500HistoryDeclaration = (
  value: unknown
): value is Student500HistoryDeclaration =>
  isOneOf(STUDENT_500_HISTORY_DECLARATIONS, value);

export const isStudent500HistoryFlag = (
  value: unknown
): value is Student500HistoryFlag => isOneOf(STUDENT_500_HISTORY_FLAGS, value);

export const isStudent500ApplicationStatus = (
  value: unknown
): value is Student500ApplicationStatus =>
  isOneOf(STUDENT_500_APPLICATION_STATUSES, value);

function raiseInvalid(): never {
  throw new Student500Error("invalid_request");
}

/** Normalizes bounded display text; throws on empty, over-long or control input. */
export function normalizeStudent500Text(
  value: unknown,
  max: number = STUDENT_500_MAX_TEXT
): string {
  if (typeof value !== "string") {
    raiseInvalid();
  }
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    normalized.length === 0 ||
    normalized.length > max ||
    hasControlCharacters(normalized)
  ) {
    raiseInvalid();
  }
  return normalized;
}

export function normalizeOptionalStudent500Text(
  value: unknown,
  max: number = STUDENT_500_MAX_TEXT
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    raiseInvalid();
  }
  if (value.trim().length === 0) {
    return null;
  }
  return normalizeStudent500Text(value, max);
}

/**
 * An as-of / intended application date. This is the date the preliminary
 * screening is anchored to, so it is validated as a real calendar date.
 */
export function normalizeStudent500AsOfDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
    raiseInvalid();
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    raiseInvalid();
  }
  // Reject calendar roll-over such as 2026-02-31.
  if (parsed.toISOString().slice(0, 10) !== value) {
    raiseInvalid();
  }
  if (
    value < STUDENT_500_MIN_AS_OF_DATE ||
    value > STUDENT_500_MAX_AS_OF_DATE
  ) {
    raiseInvalid();
  }
  return value;
}

/**
 * Current/previous visa identity is an opaque bounded token (for example `500`,
 * `485`, `bridging`), never free narrative. M6.1 does not interpret it.
 */
export function normalizeOptionalStudent500VisaSubclass(
  value: unknown
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    raiseInvalid();
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > STUDENT_500_MAX_ID || !OPAQUE_ID_RE.test(trimmed)) {
    raiseInvalid();
  }
  return trimmed;
}

export function validateStudent500OperationId(value: unknown): string {
  if (typeof value !== "string") {
    raiseInvalid();
  }
  try {
    return validateProjectOperationId(value);
  } catch {
    throw new Student500Error("invalid_request");
  }
}

export function validateStudent500Revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    raiseInvalid();
  }
  return value;
}

export type Student500HistoryFlagEntry = {
  readonly flag: Student500HistoryFlag;
  /** When the reported event happened, if the customer supplied a date. */
  readonly reportedOn: string | null;
};

/**
 * The bounded, persisted applicant/visa context. Every field is allowed to be
 * unknown: an absent answer is "not declared", never "no".
 */
export type Student500Context = {
  readonly entryRoute: Student500EntryRoute | null;
  readonly coeStatus: Student500CoeStatus;
  readonly applicationPlace: Student500ApplicationPlace;
  readonly asOfDate: string | null;
  readonly currentVisaSubclass: string | null;
  readonly historyDeclaration: Student500HistoryDeclaration;
  readonly historyFlags: readonly Student500HistoryFlagEntry[];
  readonly applicantAgeBand: Student500AgeBand;
  readonly dependants: Student500DependantBand;
  readonly englishEvidence: Student500EvidenceStatus;
  readonly financialEvidence: Student500EvidenceStatus;
  readonly oshcEvidence: Student500EvidenceStatus;
  /** An existing M5.1 school application in the same Project, if connected. */
  readonly schoolApplicationId: string | null;
};

export const EMPTY_STUDENT_500_CONTEXT: Student500Context = {
  applicantAgeBand: "unknown",
  applicationPlace: "unknown",
  asOfDate: null,
  coeStatus: "unknown",
  currentVisaSubclass: null,
  dependants: "unknown",
  englishEvidence: "unknown",
  entryRoute: null,
  financialEvidence: "unknown",
  historyDeclaration: "not_declared",
  historyFlags: [],
  oshcEvidence: "unknown",
  schoolApplicationId: null,
};

export type Student500HistoryFlagInput = {
  readonly flag?: unknown;
  readonly reportedOn?: unknown;
};

export type Student500ContextInput = {
  readonly entryRoute?: unknown;
  readonly coeStatus?: unknown;
  readonly applicationPlace?: unknown;
  readonly asOfDate?: unknown;
  readonly currentVisaSubclass?: unknown;
  readonly historyDeclaration?: unknown;
  readonly historyFlags?: unknown;
  readonly applicantAgeBand?: unknown;
  readonly dependants?: unknown;
  readonly englishEvidence?: unknown;
  readonly financialEvidence?: unknown;
  readonly oshcEvidence?: unknown;
  readonly schoolApplicationId?: unknown;
};

function normalizeHistoryFlags(value: unknown): Student500HistoryFlagEntry[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > STUDENT_500_MAX_HISTORY_FLAGS) {
    raiseInvalid();
  }
  const seen = new Set<string>();
  const entries: Student500HistoryFlagEntry[] = [];
  for (const candidate of value) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      raiseInvalid();
    }
    const entry = candidate as Student500HistoryFlagInput;
    if (!isStudent500HistoryFlag(entry.flag)) {
      raiseInvalid();
    }
    // A repeated flag would make the reported history ambiguous without adding
    // information, so duplicates are rejected rather than collapsed.
    if (seen.has(entry.flag)) {
      raiseInvalid();
    }
    seen.add(entry.flag);
    const reportedOn =
      entry.reportedOn === null ||
      entry.reportedOn === undefined ||
      entry.reportedOn === ""
        ? null
        : normalizeStudent500AsOfDate(entry.reportedOn);
    entries.push({ flag: entry.flag, reportedOn });
  }
  return entries.sort((left, right) => (left.flag < right.flag ? -1 : 1));
}

function enumOrDefault<T extends string>(
  values: readonly T[],
  value: unknown,
  fallback: T
): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (!isOneOf(values, value)) {
    raiseInvalid();
  }
  return value;
}

/**
 * Deterministic normalization of an applicant context patch.
 *
 * Consistency rules are structural, never legal: an `existing_coe` route may not
 * carry `reported_not_held`, and `declared_some` history requires at least one
 * flag. Nothing here decides whether any criterion is satisfied.
 */
export function normalizeStudent500Context(
  input: Student500ContextInput
): Student500Context {
  const entryRoute =
    input.entryRoute === null || input.entryRoute === undefined
      ? null
      : isStudent500EntryRoute(input.entryRoute)
        ? input.entryRoute
        : raiseInvalid();
  const schoolApplicationId =
    input.schoolApplicationId === null ||
    input.schoolApplicationId === undefined
      ? null
      : isStudent500Uuid(input.schoolApplicationId)
        ? input.schoolApplicationId
        : raiseInvalid();
  const context: Student500Context = {
    applicantAgeBand: enumOrDefault(
      STUDENT_500_AGE_BANDS,
      input.applicantAgeBand,
      "unknown"
    ),
    applicationPlace: enumOrDefault(
      STUDENT_500_APPLICATION_PLACES,
      input.applicationPlace,
      "unknown"
    ),
    asOfDate: normalizeStudent500AsOfDate(input.asOfDate),
    coeStatus: enumOrDefault(
      STUDENT_500_COE_STATUSES,
      input.coeStatus,
      "unknown"
    ),
    currentVisaSubclass: normalizeOptionalStudent500VisaSubclass(
      input.currentVisaSubclass
    ),
    dependants: enumOrDefault(
      STUDENT_500_DEPENDANT_BANDS,
      input.dependants,
      "unknown"
    ),
    englishEvidence: enumOrDefault(
      STUDENT_500_EVIDENCE_STATUSES,
      input.englishEvidence,
      "unknown"
    ),
    entryRoute,
    financialEvidence: enumOrDefault(
      STUDENT_500_EVIDENCE_STATUSES,
      input.financialEvidence,
      "unknown"
    ),
    historyDeclaration: enumOrDefault(
      STUDENT_500_HISTORY_DECLARATIONS,
      input.historyDeclaration,
      "not_declared"
    ),
    historyFlags: normalizeHistoryFlags(input.historyFlags),
    oshcEvidence: enumOrDefault(
      STUDENT_500_EVIDENCE_STATUSES,
      input.oshcEvidence,
      "unknown"
    ),
    schoolApplicationId,
  };
  assertStudent500ContextConsistency(context);
  return context;
}

/**
 * Structural consistency of one applicant context. Each failure is a request
 * error because the combination would otherwise describe an impossible state,
 * and could let a caller manufacture false CoE/route readiness.
 */
export function assertStudent500ContextConsistency(
  context: Student500Context
): void {
  if (context.historyDeclaration === "declared_some") {
    if (context.historyFlags.length === 0) {
      raiseInvalid();
    }
  } else if (context.historyFlags.length > 0) {
    // Flags without an explicit `declared_some` declaration would leave the
    // history state ambiguous.
    raiseInvalid();
  }
  if (
    context.entryRoute === "existing_coe" &&
    context.coeStatus === "reported_not_held"
  ) {
    raiseInvalid();
  }
  if (
    context.entryRoute === "offer_only" &&
    context.coeStatus === "reported_held"
  ) {
    raiseInvalid();
  }
  if (
    context.entryRoute === "no_school_application" &&
    context.schoolApplicationId
  ) {
    raiseInvalid();
  }
  if (context.entryRoute === null && context.coeStatus === "reported_held") {
    // A reported CoE without a declared study-evidence route is an ambiguous
    // preparation state, not a stronger evidence position.
    raiseInvalid();
  }
}

/**
 * Request identity of a mutation, expressed **only** from fields the caller
 * authored (session actor, route identity, CAS revision and submitted values).
 * Derived screening output is deliberately excluded, so an exact client retry
 * reproduces the same digest and replays the accepted result instead of producing
 * a spurious idempotency conflict.
 */
export type Student500RequestIdentity = {
  readonly operationType: Student500OperationType;
  readonly projectId: string;
  readonly applicationId?: string;
  readonly expectedRevision?: number;
  readonly context?: Student500Context;
};

export function student500RequestSha256(
  identity: Student500RequestIdentity
): string {
  const context = identity.context;
  return hashProjectOperationRequest({
    applicationId: identity.applicationId ?? null,
    context: context
      ? {
          applicantAgeBand: context.applicantAgeBand,
          applicationPlace: context.applicationPlace,
          asOfDate: context.asOfDate,
          coeStatus: context.coeStatus,
          currentVisaSubclass: context.currentVisaSubclass,
          dependants: context.dependants,
          englishEvidence: context.englishEvidence,
          entryRoute: context.entryRoute,
          financialEvidence: context.financialEvidence,
          historyDeclaration: context.historyDeclaration,
          historyFlags: context.historyFlags.map((entry) => ({
            flag: entry.flag,
            reportedOn: entry.reportedOn,
          })),
          oshcEvidence: context.oshcEvidence,
          schoolApplicationId: context.schoolApplicationId,
        }
      : null,
    expectedRevision: identity.expectedRevision ?? null,
    operationType: identity.operationType,
    projectId: identity.projectId,
  });
}

/** Stable digest of one applicant context, used for change detection/audit. */
export function student500ContextSha256(context: Student500Context): string {
  return createHash("sha256")
    .update(
      student500RequestSha256({
        context,
        operationType: "student_500_update",
        projectId: "00000000-0000-4000-8000-000000000000",
      }),
      "utf8"
    )
    .digest("hex");
}

/**
 * Phase 13 M6.1 capability gate.
 *
 * Internal Student 500 preparation is available in local development/test once
 * the additive schema is present, and stays OFF in production-like environments
 * until a separate owner authorization. `PHASE13_STUDENT500_ENABLED` is an
 * explicit override; any disabled or unrecognised token wins.
 */
export function student500ApplicationsEnabled(
  value: string | undefined = process.env.PHASE13_STUDENT500_ENABLED,
  environment: CapabilityEnvironment = resolveCapabilityEnvironment()
): boolean {
  return localPreparationCapability(value, environment);
}
