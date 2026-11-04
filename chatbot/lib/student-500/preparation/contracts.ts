import { createHash } from "node:crypto";
import {
  STUDENT_500_REQUIREMENT_KEYS,
  type Student500RequirementKey,
} from "../contracts";

/**
 * Phase 13 M6.2 - Student 500 application preparation contracts.
 *
 * This module is the single definition of what an application preparation record
 * may claim. Hard invariants encoded here:
 *
 *   - a fact reference is a *selection*, never a verification;
 *   - customer confirmation is never independent verification;
 *   - document extraction can never become trusted truth (the M2 document trust
 *     gate stays closed, and this module has no way to open it);
 *   - no enum member can express eligibility, approval, submission readiness,
 *     professional review, or "official checklist complete";
 *   - unknown/unavailable is a first-class state for evidence *and* law;
 *   - a preliminary GS starter is a deterministic structure, never invented prose.
 *
 * Nothing here evaluates a legal criterion. The requirement keys and their legal
 * applicability come from the accepted M6.1 resolver; this module only maps
 * *evidence coverage* onto those dimensions.
 */

export const STUDENT_500_PREPARATION_SCHEMA =
  "phase13.student500-preparation.v1" as const;

/** Bounds. A preparation record is a bounded working document, not a case file. */
export const STUDENT_500_PREPARATION_MAX_FACT_REFERENCES = 32;
export const STUDENT_500_PREPARATION_MAX_DRAFT_VERSIONS = 20;
export const STUDENT_500_PREPARATION_MAX_SNAPSHOT_VERSIONS = 20;
export const STUDENT_500_PREPARATION_MAX_REVOKE_HISTORY = 200;
export const STUDENT_500_GS_MAX_SECTIONS = 5;
export const STUDENT_500_GS_MAX_SECTION_TEXT = 1200;
export const STUDENT_500_GS_MAX_TOTAL_TEXT = 4800;
export const STUDENT_500_GS_MAX_HEADING = 80;
export const STUDENT_500_PREPARATION_MAX_ID = 128;
export const STUDENT_500_PREPARATION_MAX_CITATIONS = 40;

/**
 * Which existing authority the preparation is bound to.
 *
 * `customer_reported_coe` deliberately exists so an existing CoE path never needs
 * a fabricated M5.1 school application, and `admission_case` binds the M5.2 case
 * (which itself distinguishes offer from CoE).
 */
export const STUDENT_500_SCHOOL_CONTEXT_KINDS = [
  "none",
  "school_application",
  "admission_case",
  "customer_reported_coe",
] as const;
export type Student500SchoolContextKind =
  (typeof STUDENT_500_SCHOOL_CONTEXT_KINDS)[number];

/** Study-evidence state. Only `coe_independently_verified` claims verification. */
export const STUDENT_500_STUDY_EVIDENCE_KINDS = [
  "none",
  "offer_only",
  "coe_reported",
  "coe_independently_verified",
] as const;
export type Student500StudyEvidenceKind =
  (typeof STUDENT_500_STUDY_EVIDENCE_KINDS)[number];

/** Provenance vocabulary reused from M5.2 so no second authority model exists. */
export const STUDENT_500_OUTCOME_PROVENANCES = [
  "customer_reported",
  "document_backed_unverified",
  "source_reviewed",
  "provider_confirmed",
] as const;
export type Student500OutcomeProvenance =
  (typeof STUDENT_500_OUTCOME_PROVENANCES)[number];

export const STUDENT_500_OUTCOME_KINDS = ["offer", "coe"] as const;
export type Student500OutcomeKind = (typeof STUDENT_500_OUTCOME_KINDS)[number];

/**
 * Live status of one selected fact reference. Every value is re-derived from the
 * current M2 projection on each read; nothing here is stored as a conclusion.
 */
export const STUDENT_500_FACT_REFERENCE_STATES = [
  "usable_for_ai_context",
  "customer_confirmed_not_ai_authorized",
  "not_confirmed",
  "stale",
  "superseded",
  "conflicting",
  "revoked",
  "no_longer_visible",
  "application_archived",
] as const;
export type Student500FactReferenceState =
  (typeof STUDENT_500_FACT_REFERENCE_STATES)[number];

/** Which requirement-coverage outcome a dimension currently has. */
export const STUDENT_500_COVERAGE_STATES = [
  "covered_by_authorized_fact",
  "covered_by_customer_report_only",
  "blocked_fact_not_ai_authorized",
  "blocked_fact_conflicting",
  "blocked_fact_stale",
  "blocked_fact_revoked",
  "evidence_channel_unavailable",
  "missing_evidence",
  "not_applicable",
  "not_assessed",
] as const;
export type Student500CoverageState =
  (typeof STUDENT_500_COVERAGE_STATES)[number];

/** Why a requirement or document channel cannot currently be assessed. */
export const STUDENT_500_EVIDENCE_GAPS = [
  "no_authorized_fact_selected",
  "fact_not_customer_confirmed",
  "ai_use_not_authorized",
  "conflict_unresolved",
  "fact_source_stale",
  "fact_source_superseded",
  "fact_authorization_revoked",
  "project_documents_unavailable",
  "document_trust_gate_closed",
  "school_context_not_linked",
  "school_context_unavailable",
  "coe_not_reported",
  "legal_source_unverified",
  "independent_verification_unavailable",
] as const;
export type Student500EvidenceGap = (typeof STUDENT_500_EVIDENCE_GAPS)[number];

/** Structurally invalidated subjects. Never a statement about the law. */
export const STUDENT_500_STALE_REASONS = [
  "application_context_changed",
  "application_revision_advanced",
  "fact_version_superseded",
  "fact_confirmation_withdrawn",
  "fact_ai_grant_revoked",
  "fact_no_longer_visible",
  "fact_key_set_changed",
  "school_context_changed",
  "school_context_unavailable",
  "school_outcome_superseded",
  "legal_source_currentness_unknown",
] as const;
export type Student500StaleReason = (typeof STUDENT_500_STALE_REASONS)[number];

/** Concrete next preparation actions. None of them submits anything. */
export const STUDENT_500_PREPARATION_ACTIONS = [
  "select_authorized_facts",
  "confirm_fact_with_customer",
  "grant_ai_use_for_fact",
  "resolve_fact_conflict",
  "refresh_superseded_fact",
  "link_school_context",
  "report_coe_or_offer",
  "record_missing_information",
  "create_gs_draft",
  "edit_gs_draft",
  "save_preparation_snapshot",
  "review_evidence_gaps",
  "seek_human_review",
  "await_authoritative_legal_source",
] as const;
export type Student500PreparationAction =
  (typeof STUDENT_500_PREPARATION_ACTIONS)[number];

export const STUDENT_500_PREPARATION_DISCLOSURES = [
  "preliminary_preparation_only",
  "not_legal_advice",
  "not_professionally_reviewed",
  "not_a_government_submission",
  "not_an_official_checklist_result",
  "customer_reported_is_not_verified",
  "generated_starter_is_not_prose_from_a_lawyer",
  "project_documents_untrusted",
  "legal_sources_pending_verification",
] as const;
export type Student500PreparationDisclosure =
  (typeof STUDENT_500_PREPARATION_DISCLOSURES)[number];

/** GS narrative buckets. Content organization only - not official wording. */
export const STUDENT_500_GS_SECTION_KEYS = [
  "applicant_background",
  "course_and_reasons",
  "understanding_of_study",
  "study_employment_history",
  "future_plans",
] as const;
export type Student500GsSectionKey =
  (typeof STUDENT_500_GS_SECTION_KEYS)[number];

export type Student500GsSectionSource =
  | "authorized_fact"
  | "customer_text"
  | "missing";

export type Student500GsSection = {
  readonly sectionKey: Student500GsSectionKey;
  /** Heading is product copy, never a quoted official question. */
  readonly heading: string;
  readonly text: string;
  readonly source: Student500GsSectionSource;
  /** Fact reference ids that contributed text to this section. */
  readonly factReferenceIds: readonly string[];
  readonly missingInformation: readonly string[];
};

/**
 * Declared coverage mapping: which customer fact keys can inform which screening
 * dimension. Entries are prefixes (`school.`) or exact keys (`fees.budget`).
 *
 * This is a *coverage* aid. It never decides applicability, thresholds or whether
 * a criterion is met - the M6.1 resolver owns applicability.
 */
export const STUDENT_500_REQUIREMENT_FACT_KEYS: Record<
  Student500RequirementKey,
  readonly string[]
> = {
  character_public_interest: ["character."],
  english_language_evidence: ["language.", "english."],
  family_unit_member_requirements: ["family.", "dependant"],
  financial_capacity_evidence: ["fees.", "finance.", "funds."],
  genuine_student: ["study.", "career.", "motivation."],
  health_public_interest: ["health."],
  offshore_application_entry: ["visa.", "travel."],
  onshore_application_restrictions: ["visa."],
  overseas_student_health_cover: ["insurance.", "oshc."],
  prior_immigration_history_disclosure: ["immigration.", "visa."],
  schedule1_valid_application: ["identity.", "passport.", "personal."],
  student_visa_conditions_acknowledgement: [],
  study_evidence_coe_or_alternative: ["school.", "course.", "intake."],
  under_18_welfare_arrangements: ["welfare.", "guardian."],
} as const;

/** Which GS buckets a fact key can inform (prefix/exact, same convention). */
export const STUDENT_500_GS_SECTION_FACT_KEYS: Record<
  Student500GsSectionKey,
  readonly string[]
> = {
  applicant_background: ["identity.", "personal.", "family.", "immigration."],
  course_and_reasons: ["study.", "course.", "career.", "motivation."],
  future_plans: ["career.", "future.", "goal."],
  study_employment_history: ["education.", "employment.", "work."],
  understanding_of_study: ["study.", "school.", "intake.", "course."],
} as const;

export const STUDENT_500_GS_SECTION_HEADINGS: Record<
  Student500GsSectionKey,
  string
> = {
  applicant_background: "Applicant background and circumstances",
  course_and_reasons: "Course choice and reasons for study",
  future_plans: "Future plans and expected value",
  study_employment_history: "Study, employment and immigration history",
  understanding_of_study: "Understanding of the intended study",
};

export const STUDENT_500_PREPARATION_OPERATION_TYPES = [
  "student_500_select_fact",
  "student_500_unselect_fact",
  "student_500_set_school_context",
  "student_500_create_gs_draft",
  "student_500_save_gs_draft",
  "student_500_create_preparation_snapshot",
] as const;
export type Student500PreparationOperationType =
  (typeof STUDENT_500_PREPARATION_OPERATION_TYPES)[number];

export const STUDENT_500_PREPARATION_RESULT_KINDS = [
  "student_500_fact_reference",
  "student_500_school_context",
  "student_500_gs_draft",
  "student_500_preparation_snapshot",
] as const;
export type Student500PreparationResultKind =
  (typeof STUDENT_500_PREPARATION_RESULT_KINDS)[number];

export type Student500PreparationErrorCode =
  | "invalid_request"
  | "actor_not_eligible"
  | "project_not_found"
  | "project_forbidden"
  | "project_closed"
  | "application_not_found"
  | "application_archived"
  | "fact_not_available"
  | "school_context_invalid"
  | "school_context_unavailable"
  | "draft_not_found"
  | "snapshot_not_found"
  | "revision_conflict"
  | "version_conflict"
  | "idempotency_conflict"
  | "state_conflict"
  | "limit_exceeded"
  | "integrity_conflict"
  // Phase 13 M7 deep-preparation codes. All of them are fail-closed outcomes.
  | "composer_unavailable"
  | "proposal_not_found"
  | "editorial_review_not_found"
  | "editorial_authority_unavailable"
  | "consent_required";

export class Student500PreparationError extends Error {
  readonly code: Student500PreparationErrorCode;

  constructor(code: Student500PreparationErrorCode) {
    super(code);
    this.name = "Student500PreparationError";
    this.code = code;
  }
}

export function isStudent500PreparationUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value
    )
  );
}

export function isStudent500PreparationSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
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

/** Canonical JSON digest used for every stored content/input hash. */
export function preparationDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : 1));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function isOneOf<T extends string>(
  values: readonly T[],
  value: unknown
): value is T {
  return (
    typeof value === "string" && (values as readonly string[]).includes(value)
  );
}

export const isStudent500GsSectionKey = (
  value: unknown
): value is Student500GsSectionKey =>
  isOneOf(STUDENT_500_GS_SECTION_KEYS, value);

export const isStudent500SchoolContextKind = (
  value: unknown
): value is Student500SchoolContextKind =>
  isOneOf(STUDENT_500_SCHOOL_CONTEXT_KINDS, value);

export const isStudent500StudyEvidenceKind = (
  value: unknown
): value is Student500StudyEvidenceKind =>
  isOneOf(STUDENT_500_STUDY_EVIDENCE_KINDS, value);

export const isStudent500OutcomeProvenance = (
  value: unknown
): value is Student500OutcomeProvenance =>
  isOneOf(STUDENT_500_OUTCOME_PROVENANCES, value);

export const isStudent500OutcomeKind = (
  value: unknown
): value is Student500OutcomeKind => isOneOf(STUDENT_500_OUTCOME_KINDS, value);

/** Does a customer fact key fall inside a declared prefix/exact mapping entry? */
export function factKeyMatches(
  key: string,
  patterns: readonly string[]
): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith(".") ? key.startsWith(pattern) : key === pattern
  );
}

export function requirementFactKeys(
  requirementKey: Student500RequirementKey
): readonly string[] {
  return STUDENT_500_REQUIREMENT_FACT_KEYS[requirementKey] ?? [];
}

export function allRequirementKeys(): readonly Student500RequirementKey[] {
  return STUDENT_500_REQUIREMENT_KEYS;
}

/** Normalizes one customer-authored GS section text; rejects empty/oversized. */
export function normalizeGsSectionText(value: unknown): string {
  if (typeof value !== "string") {
    throw new Student500PreparationError("invalid_request");
  }
  const normalized = value.replace(/\r\n/gu, "\n").trim();
  if (
    normalized.length === 0 ||
    normalized.length > STUDENT_500_GS_MAX_SECTION_TEXT
  ) {
    throw new Student500PreparationError("invalid_request");
  }
  if (hasControlCharacters(normalized.replace(/\n/gu, ""))) {
    throw new Student500PreparationError("invalid_request");
  }
  return normalized;
}

export function validateOperationIdentity(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
  ) {
    throw new Student500PreparationError("invalid_request");
  }
  return value;
}
