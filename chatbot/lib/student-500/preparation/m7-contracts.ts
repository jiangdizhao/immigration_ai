import type { Student500RequirementKey } from "../contracts";
import {
  preparationDigest,
  type Student500GsSectionKey,
  type Student500PreparationAction,
  Student500PreparationError,
} from "./contracts";

/**
 * Phase 13 M7 - deep Student 500 preparation contracts.
 *
 * M7 adds exactly three capabilities over accepted M6:
 *
 *   1. a deterministic *scenario/task* projection over the accepted M6.1 screening
 *      and M6.2 reconciliation - never a second eligibility engine;
 *   2. a bounded, injectable GS *composition proposal* pipeline whose assertions
 *      must each be attributable to an authorized fact, customer-authored text, or
 *      an explicit needs-confirmation state;
 *   3. a bounded professional *editorial* review round with real consent scope and
 *      fail-closed authority.
 *
 * Invariants encoded in this vocabulary: there is no enum member for eligibility,
 * approval, submission readiness, legal correctness or verified sign-off;
 * `professionalSignOff` is the literal `not_established`; an assertion support can
 * never be "verified" or "legal authority".
 */

export const STUDENT_500_DEEP_PREPARATION_SCHEMA =
  "phase13.student500-deep-preparation.v1" as const;

export const STUDENT_500_MAX_TASKS = 12;
export const STUDENT_500_MAX_FOLLOW_UPS = 8;
export const STUDENT_500_MAX_SCENARIO_FLAGS = 8;
export const STUDENT_500_MAX_ASSERTIONS_PER_SECTION = 8;
export const STUDENT_500_MAX_PROPOSALS = 10;
export const STUDENT_500_MAX_EDITORIAL_ROUNDS = 5;
export const STUDENT_500_MAX_EDITORIAL_COMMENTS = 10;
export const STUDENT_500_MAX_EDITORIAL_COMMENT_LENGTH = 1200;
export const STUDENT_500_MAX_EDITORIAL_EDITS = 5;
export const STUDENT_500_MAX_DISCLOSED_FACTS = 32;

/**
 * Complex-case dimensions M7 can *name* without deciding anything. Derived from
 * recorded facts and the accepted screening outcome, never from nationality,
 * visa-subclass or language pattern matching.
 */
export const STUDENT_500_SCENARIO_KINDS = [
  "standard_offshore_first_application",
  "onshore_with_current_visa",
  "prior_immigration_adverse_history",
  "applicant_under_18",
  "dependants_or_family_unit",
  "prior_study_or_employment_change",
  "study_evidence_offer_only",
  "study_evidence_coe_reported",
  "study_evidence_coe_verified",
  "unresolved_requires_human_review",
] as const;
export type Student500ScenarioKind =
  (typeof STUDENT_500_SCENARIO_KINDS)[number];

export const STUDENT_500_SCENARIO_COMPLEXITIES = [
  "standard",
  "complex",
  "unresolved",
] as const;
export type Student500ScenarioComplexity =
  (typeof STUDENT_500_SCENARIO_COMPLEXITIES)[number];

export const STUDENT_500_DEEP_DISCLOSURES = [
  "scenario_profile_is_not_an_eligibility_assessment",
  "follow_up_answers_become_customer_facts_not_verification",
  "gs_proposal_is_not_a_final_genuine_student_response",
  "editorial_feedback_is_not_legal_sign_off",
  "professional_authority_unverified_by_default",
  "submission_remains_unavailable",
] as const;
export type Student500DeepDisclosure =
  (typeof STUDENT_500_DEEP_DISCLOSURES)[number];

/* --------------------------------------------------------------- task planner */

export const STUDENT_500_TASK_KINDS = [
  "evidence_gap",
  "follow_up_question",
  "contradiction",
  "legal_unknown",
  "human_review",
  "gs_improvement",
] as const;
export type Student500TaskKind = (typeof STUDENT_500_TASK_KINDS)[number];

export const STUDENT_500_TASK_REASON_CODES = [
  "requirement_evidence_missing",
  "requirement_evidence_blocked",
  "requirement_fact_not_authorized",
  "requirement_legal_source_unverified",
  "requirement_applicability_unknown",
  "follow_up_information_absent",
  "fact_conflict_visible",
  "school_context_missing",
  "gs_section_missing_information",
  "gs_assertion_needs_confirmation",
  "professional_review_requested",
  "professional_authority_unavailable",
] as const;
export type Student500TaskReasonCode =
  (typeof STUDENT_500_TASK_REASON_CODES)[number];

/**
 * One bounded, explainable next step. `taskId` is deterministic so the UI and
 * tests can reference a task without a persistence round trip.
 */
export type Student500PreparationTask = {
  readonly taskId: string;
  readonly kind: Student500TaskKind;
  readonly reasonCode: Student500TaskReasonCode;
  readonly severity: "blocking" | "advisory";
  readonly requirementKeys: readonly Student500RequirementKey[];
  readonly gsSectionKeys: readonly Student500GsSectionKey[];
  readonly action: Student500PreparationAction;
  readonly missingFactKeys: readonly string[];
  /** Safe provenance identifiers only - never a fact value or document body. */
  readonly provenance: {
    readonly factReferenceId: string | null;
    readonly factKey: string | null;
  };
  /** A copy key resolved to bilingual text by the UI. Never generated prose. */
  readonly questionKey: string | null;
  readonly humanReviewRequired: true;
};

export type Student500FollowUpQuestion = {
  readonly questionId: string;
  readonly questionKey: string;
  readonly reasonCode: Student500TaskReasonCode;
  readonly requirementKeys: readonly Student500RequirementKey[];
  readonly gsSectionKeys: readonly Student500GsSectionKey[];
  readonly missingFactKeys: readonly string[];
  readonly provenance: Student500PreparationTask["provenance"];
  /**
   * Answers are recorded as a customer confirmation of an M2 fact through the
   * accepted M2 path. M7 never writes a fact itself.
   */
  readonly recordingMode: "customer_fact_confirmation_via_m2";
  readonly humanReviewRequired: true;
};

/* ------------------------------------------------------------ GS composition */

/**
 * How one material assertion is supported. Deliberately no "verified", "official"
 * or "legally_checked" member exists.
 */
export const STUDENT_500_ASSERTION_SUPPORTS = [
  "authorized_fact",
  "customer_authored",
  "unverified_needs_confirmation",
] as const;
export type Student500AssertionSupport =
  (typeof STUDENT_500_ASSERTION_SUPPORTS)[number];

export type Student500GsAssertion = {
  readonly assertionId: string;
  readonly assertionText: string;
  readonly support: Student500AssertionSupport;
  readonly factReferenceIds: readonly string[];
};

export type Student500GsProposedSection = {
  readonly sectionKey: Student500GsSectionKey;
  readonly heading: string;
  readonly text: string;
  readonly source: "authorized_fact" | "customer_text" | "composer_proposal";
  readonly factReferenceIds: readonly string[];
  readonly missingInformation: readonly string[];
  readonly assertions: readonly Student500GsAssertion[];
};

export const STUDENT_500_GS_COMPOSER_KINDS = [
  "deterministic",
  "model_disabled",
] as const;
export type Student500GsComposerKind =
  (typeof STUDENT_500_GS_COMPOSER_KINDS)[number];

export const STUDENT_500_PROPOSAL_STATUSES = [
  "proposed",
  /**
   * A single accept caller has claimed the proposal and is writing the new draft.
   * No other caller may reject or accept it until that write is finalised or the
   * claim is recovered by the same deterministic replay.
   */
  "accepting",
  "accepted",
  "rejected",
  "superseded",
] as const;
export type Student500ProposalStatus =
  (typeof STUDENT_500_PROPOSAL_STATUSES)[number];

export type Student500GsProposalRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly applicationId: string;
  readonly baseDraftId: string;
  readonly baseDraftVersion: number;
  readonly baseDraftContentSha256: string;
  readonly sections: readonly Student500GsProposedSection[];
  readonly sectionCount: number;
  readonly contentSha256: string;
  readonly inputDigest: string;
  readonly status: Student500ProposalStatus;
  readonly composerKind: Student500GsComposerKind;
  readonly composerCode: string;
  readonly attribution: {
    readonly assertionCount: number;
    readonly unverifiedAssertionCount: number;
    readonly unattributedAssertionCount: number;
  };
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly decidedByUserId: string | null;
  readonly decidedAt: Date | null;
  readonly acceptedDraftId: string | null;
};

export type Student500ScenarioProfile = {
  readonly schemaVersion: typeof STUDENT_500_DEEP_PREPARATION_SCHEMA;
  readonly scenarioKinds: readonly Student500ScenarioKind[];
  readonly complexity: Student500ScenarioComplexity;
  readonly applicableRequirementKeys: readonly Student500RequirementKey[];
  readonly unresolvedRequirementKeys: readonly Student500RequirementKey[];
  /** Always true: no M7 output is a legal or professional conclusion. */
  readonly humanReviewRequired: true;
  readonly disclosureCodes: readonly Student500DeepDisclosure[];
};

/* ---------------------------------------------------------- editorial review */

export const STUDENT_500_EDITORIAL_STATUSES = [
  "requested",
  "feedback_provided",
  "accepted_by_customer",
  "rejected_by_customer",
  "superseded",
  "authority_unavailable",
] as const;
export type Student500EditorialStatus =
  (typeof STUDENT_500_EDITORIAL_STATUSES)[number];

/** Exactly what the customer disclosed. Nothing outside this scope is readable. */
export const STUDENT_500_EDITORIAL_DISCLOSURE_SCOPES = [
  "gs_draft_sections",
  "selected_fact_summaries",
  "preparation_task_summary",
] as const;
export type Student500EditorialDisclosureScope =
  (typeof STUDENT_500_EDITORIAL_DISCLOSURE_SCOPES)[number];

export type Student500EditorialConsent = {
  readonly draftId: string;
  readonly draftVersion: number;
  readonly draftContentSha256: string;
  readonly disclosureScopes: readonly Student500EditorialDisclosureScope[];
  /** Facts the customer agreed to disclose, by bounded reference id. */
  readonly factReferenceIds: readonly string[];
  /** Must be literally true; there is no inferred-consent path anywhere in M7. */
  readonly consentGranted: true;
  readonly consentCode: string;
};

export type Student500EditorialComment = {
  readonly commentId: string;
  readonly sectionKey: Student500GsSectionKey | null;
  readonly body: string;
  readonly proposedText: string | null;
  readonly authorUserId: string;
  readonly createdAt: Date;
};

export const STUDENT_500_EDITORIAL_RATIONALE_CODES = [
  "clarity",
  "specificity",
  "consistency_with_disclosed_facts",
  "missing_detail",
  "tone",
] as const;
export type Student500EditorialRationaleCode =
  (typeof STUDENT_500_EDITORIAL_RATIONALE_CODES)[number];

export type Student500EditorialEdit = {
  readonly sectionKey: Student500GsSectionKey;
  readonly proposedText: string;
  readonly rationaleCode: Student500EditorialRationaleCode;
};

export type Student500EditorialReviewRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly applicationId: string;
  readonly reviewRound: number;
  readonly draftId: string;
  readonly draftVersion: number;
  readonly draftContentSha256: string;
  readonly consentCode: string;
  readonly consentSha256: string;
  readonly disclosureScopes: readonly Student500EditorialDisclosureScope[];
  readonly disclosedFactReferenceIds: readonly string[];
  readonly status: Student500EditorialStatus;
  readonly reviewerUserId: string | null;
  readonly reviewerAuthorityCode: string | null;
  readonly reviewerAssignmentStatus: string;
  readonly reviewerCredentialStatus: "verified" | "unverified" | "unavailable";
  /**
   * Permanently `not_established` in M7. Editorial feedback is not a legal
   * opinion, a professional sign-off or an approval of any kind.
   */
  readonly professionalSignOff: "not_established";
  readonly comments: readonly Student500EditorialComment[];
  readonly proposedEdits: readonly Student500EditorialEdit[];
  readonly inputDigest: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly customerDecisionCode: string | null;
  readonly requestedByUserId: string;
};

/** Why a review can no longer be applied. Never a claim about the law. */
export const STUDENT_500_EDITORIAL_STALE_REASONS = [
  "draft_superseded",
  "draft_content_changed",
  "disclosed_fact_revoked",
  "disclosed_fact_unreadable",
  "application_context_changed",
  "authority_revoked",
] as const;
export type Student500EditorialStaleReason =
  (typeof STUDENT_500_EDITORIAL_STALE_REASONS)[number];

/* -------------------------------------------------------------- M8 boundary */

/**
 * Actions M7 must never expose. Kept as data so routes and services can assert the
 * boundary instead of relying on review discipline.
 */
export const STUDENT_500_FORBIDDEN_M8_ACTIONS = [
  "approve_package",
  "authorize_submission",
  "submit_to_government",
  "confirm_immiaccount_submission",
  "record_grant",
  "certify_genuine_student_compliance",
] as const;
export type Student500ForbiddenM8Action =
  (typeof STUDENT_500_FORBIDDEN_M8_ACTIONS)[number];

export function assertNotForbiddenM8Action(action: unknown): void {
  if (
    typeof action === "string" &&
    (STUDENT_500_FORBIDDEN_M8_ACTIONS as readonly string[]).includes(action)
  ) {
    // Reported as invalid: M7 has no vocabulary for submission or approval.
    throw new Student500PreparationError("invalid_request");
  }
}

/* ------------------------------------------------------------- validation */

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function boundedText(value: unknown, max: number): string {
  if (typeof value !== "string") {
    throw new Student500PreparationError("invalid_request");
  }
  const normalized = value.replace(/\r\n/gu, "\n").trim();
  if (normalized.length === 0 || normalized.length > max) {
    throw new Student500PreparationError("invalid_request");
  }
  if (hasControlCharacters(normalized.replace(/\n/gu, ""))) {
    throw new Student500PreparationError("invalid_request");
  }
  return normalized;
}

export function validateEditorialCommentBody(value: unknown): string {
  return boundedText(value, STUDENT_500_MAX_EDITORIAL_COMMENT_LENGTH);
}

/** Deterministic, bounded editorial comment identity. */
export function editorialCommentId(input: {
  readonly reviewId: string;
  readonly ordinal: number;
  readonly body: string;
}): string {
  return `ec_${preparationDigest({
    bodySha256: preparationDigest(input.body),
    ordinal: input.ordinal,
    reviewId: input.reviewId,
  }).slice(0, 32)}`;
}

/** Deterministic task identity, stable across replays of identical inputs. */
export function preparationTaskId(input: {
  readonly kind: Student500TaskKind;
  readonly reasonCode: Student500TaskReasonCode;
  readonly requirementKeys: readonly Student500RequirementKey[];
  readonly factKey: string | null;
  readonly questionKey: string | null;
}): string {
  return `pt_${preparationDigest({
    factKey: input.factKey,
    kind: input.kind,
    questionKey: input.questionKey,
    reasonCode: input.reasonCode,
    requirementKeys: [...input.requirementKeys].sort(),
  }).slice(0, 32)}`;
}

export function proposalContentSha256(
  sections: readonly Student500GsProposedSection[]
): string {
  return preparationDigest(
    sections.map((section) => ({
      assertions: section.assertions.map((assertion) => ({
        assertionText: assertion.assertionText,
        factReferenceIds: [...assertion.factReferenceIds].sort(),
        support: assertion.support,
      })),
      sectionKey: section.sectionKey,
      text: section.text,
    }))
  );
}

export const isStudent500EditorialDisclosureScope = (
  value: unknown
): value is Student500EditorialDisclosureScope =>
  typeof value === "string" &&
  (STUDENT_500_EDITORIAL_DISCLOSURE_SCOPES as readonly string[]).includes(
    value
  );

export const isStudent500EditorialRationaleCode = (
  value: unknown
): value is Student500EditorialRationaleCode =>
  typeof value === "string" &&
  (STUDENT_500_EDITORIAL_RATIONALE_CODES as readonly string[]).includes(value);

/* --------------------------------------------------- deterministic identity */

/**
 * Deterministic UUID-shaped identity for idempotent insert-once rows.
 *
 * Replaying the same logical request resolves to the same row instead of creating a
 * duplicate, and the value still satisfies the repository's UUID contract. It is
 * derived from a canonical digest, never from a browser-supplied identifier.
 */
export function deterministicPreparationUuid(input: unknown): string {
  const hex = preparationDigest(input);
  const variant = (
    (Number.parseInt(hex[16] as string, 16) & 0x3) |
    0x8
  ).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
