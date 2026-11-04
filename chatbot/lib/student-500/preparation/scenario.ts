import type { Student500RequirementKey } from "../contracts";
/** Narrow view of one requirement, taken from the accepted M6.1 resolver output. */
export type ScenarioRequirement = {
  readonly requirementKey: Student500RequirementKey;
  readonly status: "applicable" | "conditional" | "not_applicable" | "unknown";
};

import type { Student500PreparationAction } from "./contracts";
import { requirementFactKeys } from "./contracts";
import {
  preparationTaskId,
  STUDENT_500_DEEP_DISCLOSURES,
  STUDENT_500_DEEP_PREPARATION_SCHEMA,
  STUDENT_500_MAX_FOLLOW_UPS,
  STUDENT_500_MAX_SCENARIO_FLAGS,
  STUDENT_500_MAX_TASKS,
  type Student500DeepDisclosure,
  type Student500FollowUpQuestion,
  type Student500PreparationTask,
  type Student500ScenarioComplexity,
  type Student500ScenarioKind,
  type Student500ScenarioProfile,
  type Student500TaskKind,
  type Student500TaskReasonCode,
} from "./m7-contracts";
import type { Student500GsDraftRecord } from "./ports";
import type { PreparationReconciliation } from "./reconciliation";

/**
 * Phase 13 M7 deterministic scenario and task planning.
 *
 * Everything here is a *projection* over decisions that already exist:
 *
 *   - requirement applicability comes from the accepted M6.1 resolver;
 *   - evidence coverage and conflicts come from the accepted M6.2 reconciliation;
 *   - study-evidence state comes from the customer-owned school context.
 *
 * This module therefore never decides eligibility, applicability, thresholds or
 * which legal rule governs a case. It only names what is missing, blocked,
 * unresolved or awaiting a human, and it does so deterministically so the same
 * inputs always produce the same task identities.
 *
 * Scenario flags are derived from requirement applicability plus the *presence* of
 * customer fact keys by declared prefix. Fact values are never inspected here, so
 * no scenario flag can leak a private fact value.
 */

export type ScenarioInput = {
  readonly requirements: readonly ScenarioRequirement[];
  readonly schoolContext: {
    readonly kind: string;
    readonly studyEvidenceKind: string;
  } | null;
  /** Keys of currently usable (authorized) fact references. */
  readonly factKeys: readonly string[];
  readonly hasAuthorizedFacts: boolean;
};

function hasPrefix(keys: readonly string[], prefix: string): boolean {
  return keys.some((key) => key.startsWith(prefix));
}

function assessmentFor(
  requirements: readonly ScenarioRequirement[],
  requirementKey: Student500RequirementKey
): ScenarioRequirement | null {
  return (
    requirements.find((entry) => entry.requirementKey === requirementKey) ??
    null
  );
}

/** Applicable or conditional - i.e. the dimension is in play for this matter. */
function isInPlay(assessment: ScenarioRequirement | null): boolean {
  return (
    assessment !== null &&
    (assessment.status === "applicable" || assessment.status === "conditional")
  );
}

export function student500ScenarioProfile(
  input: ScenarioInput
): Student500ScenarioProfile {
  const flags = new Set<Student500ScenarioKind>();
  const keys = input.factKeys;

  const onshore = assessmentFor(
    input.requirements,
    "onshore_application_restrictions"
  );
  const under18 = assessmentFor(
    input.requirements,
    "under_18_welfare_arrangements"
  );
  const family = assessmentFor(
    input.requirements,
    "family_unit_member_requirements"
  );
  const history = assessmentFor(
    input.requirements,
    "prior_immigration_history_disclosure"
  );
  const offshore = assessmentFor(
    input.requirements,
    "offshore_application_entry"
  );

  if (isInPlay(onshore)) {
    flags.add("onshore_with_current_visa");
  }
  if (isInPlay(offshore) && !isInPlay(onshore)) {
    flags.add("standard_offshore_first_application");
  }
  if (isInPlay(history) && hasPrefix(keys, "immigration.")) {
    flags.add("prior_immigration_adverse_history");
  }
  if (isInPlay(under18) || hasPrefix(keys, "welfare.")) {
    flags.add("applicant_under_18");
  }
  if (isInPlay(family) || hasPrefix(keys, "family.")) {
    flags.add("dependants_or_family_unit");
  }
  if (
    hasPrefix(keys, "education.") ||
    hasPrefix(keys, "employment.") ||
    hasPrefix(keys, "work.")
  ) {
    flags.add("prior_study_or_employment_change");
  }
  switch (input.schoolContext?.studyEvidenceKind ?? "none") {
    case "offer_only": {
      flags.add("study_evidence_offer_only");
      break;
    }
    case "coe_reported": {
      flags.add("study_evidence_coe_reported");
      break;
    }
    case "coe_independently_verified": {
      flags.add("study_evidence_coe_verified");
      break;
    }
    default:
      break;
  }

  const unresolvedRequirementKeys = input.requirements
    .filter((entry) => entry.status === "unknown")
    .map((entry) => entry.requirementKey);
  if (unresolvedRequirementKeys.length > 0) {
    flags.add("unresolved_requires_human_review");
  }
  if (flags.size === 0) {
    flags.add("standard_offshore_first_application");
  }

  const applicableRequirementKeys = input.requirements
    .filter((entry) => isInPlay(entry))
    .map((entry) => entry.requirementKey);

  const unordered = [...flags];
  const scenarioKinds = unordered.slice(0, STUDENT_500_MAX_SCENARIO_FLAGS);

  const complexity: Student500ScenarioComplexity =
    unresolvedRequirementKeys.length > 0
      ? "unresolved"
      : scenarioKinds.length > 1 ||
          scenarioKinds.includes("prior_immigration_adverse_history") ||
          scenarioKinds.includes("applicant_under_18") ||
          scenarioKinds.includes("dependants_or_family_unit")
        ? "complex"
        : "standard";

  const disclosureCodes: Student500DeepDisclosure[] = [
    ...STUDENT_500_DEEP_DISCLOSURES,
  ];

  return {
    applicableRequirementKeys,
    complexity,
    disclosureCodes,
    humanReviewRequired: true,
    scenarioKinds,
    schemaVersion: STUDENT_500_DEEP_PREPARATION_SCHEMA,
    unresolvedRequirementKeys,
  };
}

/* --------------------------------------------------------------- task planner */

export type TaskPlanningInput = ScenarioInput & {
  readonly reconciliation: PreparationReconciliation;
  readonly latestDraft: Student500GsDraftRecord | null;
  /** True when a professional editorial authority is actually available. */
  readonly editorialAuthorityAvailable: boolean;
  readonly editorialReviewRequested: boolean;
};

function taskIdentity(input: {
  readonly kind: Student500TaskKind;
  readonly reasonCode: Student500TaskReasonCode;
  readonly requirementKeys: readonly Student500RequirementKey[];
  readonly factKey: string | null;
  readonly questionKey: string | null;
}): string {
  return preparationTaskId(input);
}

function coverageTask(input: {
  readonly requirementKey: Student500RequirementKey;
  readonly coverage: string;
  readonly nextAction: Student500PreparationAction | null;
  readonly factReferenceIds: readonly string[];
}): Student500PreparationTask {
  const missingFactKeys = requirementFactKeys(input.requirementKey);
  const blocked = input.coverage.startsWith("blocked_");
  const reasonCode: Student500TaskReasonCode = blocked
    ? input.coverage === "blocked_fact_conflicting"
      ? "fact_conflict_visible"
      : input.coverage === "blocked_fact_not_ai_authorized"
        ? "requirement_fact_not_authorized"
        : "requirement_evidence_blocked"
    : "requirement_evidence_missing";
  const kind: Student500TaskKind = blocked ? "contradiction" : "evidence_gap";
  const questionKey = `student500.followUp.${input.requirementKey}`;
  return {
    action: input.nextAction ?? "review_evidence_gaps",
    gsSectionKeys: [],
    humanReviewRequired: true,
    kind,
    missingFactKeys,
    provenance: {
      factKey: missingFactKeys[0] ?? null,
      factReferenceId: input.factReferenceIds[0] ?? null,
    },
    questionKey,
    reasonCode,
    requirementKeys: [input.requirementKey],
    severity: "blocking",
    taskId: taskIdentity({
      factKey: missingFactKeys[0] ?? null,
      kind,
      questionKey,
      reasonCode,
      requirementKeys: [input.requirementKey],
    }),
  };
}

function legalTask(input: {
  readonly requirementKey: Student500RequirementKey;
  readonly reasonCode: Student500TaskReasonCode;
  readonly severity: "blocking" | "advisory";
  readonly questionKey: string | null;
}): Student500PreparationTask {
  return {
    action: "await_authoritative_legal_source",
    gsSectionKeys: [],
    humanReviewRequired: true,
    kind: "legal_unknown",
    missingFactKeys: [],
    provenance: { factKey: null, factReferenceId: null },
    questionKey: input.questionKey,
    reasonCode: input.reasonCode,
    requirementKeys: [input.requirementKey],
    severity: input.severity,
    taskId: taskIdentity({
      factKey: null,
      kind: "legal_unknown",
      questionKey: input.questionKey,
      reasonCode: input.reasonCode,
      requirementKeys: [input.requirementKey],
    }),
  };
}

function draftSectionTask(input: {
  readonly sectionKey: string;
  readonly missing: readonly string[];
}): Student500PreparationTask {
  const questionKey = `student500.gsFollowUp.${input.sectionKey}`;
  return {
    action: "edit_gs_draft",
    gsSectionKeys: [input.sectionKey as never],
    humanReviewRequired: true,
    kind: "gs_improvement",
    missingFactKeys: [...input.missing],
    provenance: { factKey: null, factReferenceId: null },
    questionKey,
    reasonCode: "gs_section_missing_information",
    requirementKeys: [],
    severity: "advisory",
    taskId: taskIdentity({
      factKey: null,
      kind: "gs_improvement",
      questionKey,
      reasonCode: "gs_section_missing_information",
      requirementKeys: [],
    }),
  };
}

function reviewRequiredTask(): Student500PreparationTask {
  const questionKey: string | null = null;
  return {
    action: "seek_human_review",
    gsSectionKeys: [],
    humanReviewRequired: true,
    kind: "human_review",
    missingFactKeys: [],
    provenance: { factKey: null, factReferenceId: null },
    questionKey,
    reasonCode: "professional_authority_unavailable",
    requirementKeys: [],
    severity: "blocking",
    taskId: taskIdentity({
      factKey: null,
      kind: "human_review",
      questionKey,
      reasonCode: "professional_authority_unavailable",
      requirementKeys: [],
    }),
  };
}

/**
 * Deterministic, bounded task list. Ordering is fixed (blocking first, then reason
 * code, then hash identity), so the single next action the customer sees is stable
 * between reads and identical across replays.
 */
export function planPreparationTasks(
  input: TaskPlanningInput
): readonly Student500PreparationTask[] {
  const tasks: Student500PreparationTask[] = [];

  for (const entry of input.reconciliation.requirements) {
    if (entry.coverage === "not_applicable") {
      continue;
    }
    if (entry.coverage === "not_assessed") {
      tasks.push(
        legalTask({
          questionKey: `student500.followUp.${entry.requirementKey}`,
          reasonCode: "requirement_applicability_unknown",
          requirementKey: entry.requirementKey,
          severity: "blocking",
        })
      );
      continue;
    }
    if (
      entry.coverage === "missing_evidence" ||
      entry.coverage === "evidence_channel_unavailable" ||
      entry.coverage.startsWith("blocked_")
    ) {
      tasks.push(
        coverageTask({
          coverage: entry.coverage,
          factReferenceIds: entry.selectedFactReferenceIds,
          nextAction: entry.nextAction,
          requirementKey: entry.requirementKey,
        })
      );
    }
    if (entry.legalSourceVerification !== "verified_official_corpus") {
      tasks.push(
        legalTask({
          questionKey: null,
          reasonCode: "requirement_legal_source_unverified",
          requirementKey: entry.requirementKey,
          severity: "advisory",
        })
      );
    }
  }

  if (input.reconciliation.conflictCount > 0) {
    const questionKey: string | null = null;
    tasks.push({
      action: "resolve_fact_conflict",
      gsSectionKeys: [],
      humanReviewRequired: true,
      kind: "contradiction",
      missingFactKeys: [],
      provenance: { factKey: null, factReferenceId: null },
      questionKey,
      reasonCode: "fact_conflict_visible",
      requirementKeys: [],
      severity: "blocking",
      taskId: taskIdentity({
        factKey: null,
        kind: "contradiction",
        questionKey,
        reasonCode: "fact_conflict_visible",
        requirementKeys: [],
      }),
    });
  }

  if (!input.schoolContext || input.schoolContext.kind === "none") {
    const questionKey = "student500.followUp.study_evidence_coe_or_alternative";
    tasks.push({
      action: "link_school_context",
      gsSectionKeys: [],
      humanReviewRequired: true,
      kind: "evidence_gap",
      missingFactKeys: ["school.", "course.", "intake."],
      provenance: { factKey: "school.", factReferenceId: null },
      questionKey,
      reasonCode: "school_context_missing",
      requirementKeys: ["study_evidence_coe_or_alternative"],
      severity: "blocking",
      taskId: taskIdentity({
        factKey: "school.",
        kind: "evidence_gap",
        questionKey,
        reasonCode: "school_context_missing",
        requirementKeys: ["study_evidence_coe_or_alternative"],
      }),
    });
  }

  for (const section of input.latestDraft?.sections ?? []) {
    if (section.missingInformation.length === 0) {
      continue;
    }
    tasks.push(
      draftSectionTask({
        missing: section.missingInformation,
        sectionKey: section.sectionKey,
      })
    );
  }

  if (input.editorialReviewRequested && !input.editorialAuthorityAvailable) {
    tasks.push(reviewRequiredTask());
  }

  const sorted = tasks.sort((left, right) => {
    const bySeverity =
      (left.severity === "blocking" ? 0 : 1) -
      (right.severity === "blocking" ? 0 : 1);
    if (bySeverity !== 0) {
      return bySeverity;
    }
    if (left.reasonCode !== right.reasonCode) {
      return left.reasonCode < right.reasonCode ? -1 : 1;
    }
    return left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0;
  });

  return sorted.slice(0, STUDENT_500_MAX_TASKS);
}

/**
 * Follow-up questions are the subset of tasks that ask the customer for specific
 * information. An answer is recorded through M2 as a customer confirmation; M7
 * never writes a fact and never treats an answer as verification.
 */
export function followUpQuestions(
  tasks: readonly Student500PreparationTask[]
): readonly Student500FollowUpQuestion[] {
  const questions: Student500FollowUpQuestion[] = [];
  for (const task of tasks) {
    if (task.questionKey === null) {
      continue;
    }
    if (
      task.kind !== "evidence_gap" &&
      task.kind !== "contradiction" &&
      task.kind !== "gs_improvement"
    ) {
      continue;
    }
    questions.push({
      gsSectionKeys: task.gsSectionKeys,
      humanReviewRequired: true,
      missingFactKeys: task.missingFactKeys,
      provenance: task.provenance,
      questionId: `q_${task.taskId.slice(3)}`,
      questionKey: task.questionKey,
      reasonCode: task.reasonCode,
      recordingMode: "customer_fact_confirmation_via_m2",
      requirementKeys: task.requirementKeys,
    });
    if (questions.length >= STUDENT_500_MAX_FOLLOW_UPS) {
      break;
    }
  }
  return questions;
}

/** The single next action shown to the customer, or null when none is safe. */
export function primaryNextAction(
  tasks: readonly Student500PreparationTask[]
): Student500PreparationAction | null {
  return tasks[0]?.action ?? null;
}
