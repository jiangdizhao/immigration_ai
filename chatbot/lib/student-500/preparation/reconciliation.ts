import type { Student500RequirementKey } from "../contracts";
import type {
  Student500RequirementAssessment,
  Student500Screening,
} from "../requirement-resolver";
import {
  factKeyMatches,
  requirementFactKeys,
  STUDENT_500_PREPARATION_ACTIONS,
  STUDENT_500_PREPARATION_DISCLOSURES,
  STUDENT_500_PREPARATION_SCHEMA,
  type Student500CoverageState,
  type Student500EvidenceGap,
  type Student500PreparationAction,
  type Student500PreparationDisclosure,
  type Student500StaleReason,
} from "./contracts";
import type {
  Student500FactCandidate,
  Student500FactReferenceRecord,
  Student500SchoolContextRecord,
} from "./ports";

/**
 * Requirement-to-evidence reconciliation and selective invalidation.
 *
 * Applicability and legal-source state come from the accepted M6.1 screening; this
 * module only answers "what evidence do we actually have for this dimension, and
 * how reliable is it for this use?". It never decides whether a criterion is met,
 * never promotes customer evidence to verified evidence, and never renders a
 * single "complete" boolean.
 */

export type SelectedFactView = {
  readonly factReferenceId: string;
  readonly factAssertionId: string;
  readonly factVersion: number;
  readonly factKey: string;
  readonly originKind: string;
  readonly stateAtUse: string;
  readonly currentState: Student500CoverageState;
  readonly customerConfirmed: boolean;
  readonly aiUseAuthorized: boolean;
  readonly independentlyVerified: false;
  readonly sourceEvidenceRef: string | null;
  readonly revokedAt: string | null;
};

export type RequirementCoverageView = {
  readonly requirementKey: Student500RequirementKey;
  readonly applicability: Student500RequirementAssessment["status"];
  readonly reasonCode: Student500RequirementAssessment["reasonCode"];
  readonly coverage: Student500CoverageState;
  readonly gaps: readonly Student500EvidenceGap[];
  readonly selectedFactReferenceIds: readonly string[];
  readonly customerConfirmed: boolean;
  readonly aiUseAuthorized: boolean;
  /** No independent verification exists anywhere in M6.2. */
  readonly independentVerification: "none_established";
  /** The M2 document trust gate is closed, so no document is trusted here. */
  readonly documentTrust: "unavailable";
  readonly legalSourceVerification: Student500RequirementAssessment["sourceVerification"];
  readonly humanReviewRequired: true;
  readonly nextAction: Student500PreparationAction | null;
};

export type PreparationReconciliation = {
  readonly schemaVersion: typeof STUDENT_500_PREPARATION_SCHEMA;
  readonly factsAvailable: boolean;
  readonly factsUnavailableReason: string | null;
  readonly documentsTrust: "unavailable";
  readonly requirements: readonly RequirementCoverageView[];
  readonly counts: {
    readonly covered: number;
    readonly blocked: number;
    readonly missing: number;
    readonly notApplicable: number;
    readonly notAssessed: number;
  };
  readonly conflictCount: number;
  /** True when at least one *visible* conflict blocks a draft input. */
  readonly conflictsVisible: boolean;
  readonly nextActions: readonly Student500PreparationAction[];
  readonly disclosures: readonly Student500PreparationDisclosure[];
};

function nextActionFor(
  coverage: Student500CoverageState,
  applicability: Student500RequirementAssessment["status"]
): Student500PreparationAction | null {
  switch (coverage) {
    case "blocked_fact_conflicting":
      return "resolve_fact_conflict";
    case "blocked_fact_not_ai_authorized":
      return "grant_ai_use_for_fact";
    case "blocked_fact_stale":
    case "blocked_fact_revoked":
      return "refresh_superseded_fact";
    case "missing_evidence":
      return applicability === "applicable" || applicability === "conditional"
        ? "select_authorized_facts"
        : null;
    case "evidence_channel_unavailable":
      return "review_evidence_gaps";
    case "covered_by_customer_report_only":
      return "confirm_fact_with_customer";
    default:
      return null;
  }
}

/**
 * Recomputes the live coverage state of one selected fact reference.
 * `candidate` is the current authorized view of that assertion (or null when it is
 * no longer visible to this actor, which is reported generically).
 */
export function factReferenceState(input: {
  readonly reference: Student500FactReferenceRecord;
  readonly candidate: Student500FactCandidate | null;
  readonly applicationArchived: boolean;
}): { state: Student500CoverageState; gaps: readonly Student500EvidenceGap[] } {
  if (input.applicationArchived) {
    return { gaps: [], state: "evidence_channel_unavailable" };
  }
  if (input.reference.revokedAt !== null) {
    return {
      gaps: ["fact_authorization_revoked"],
      state: "blocked_fact_revoked",
    };
  }
  const candidate = input.candidate;
  if (!candidate) {
    return {
      gaps: ["no_authorized_fact_selected"],
      state: "blocked_fact_stale",
    };
  }
  if (candidate.conflicted) {
    return { gaps: ["conflict_unresolved"], state: "blocked_fact_conflicting" };
  }
  if (candidate.stale || candidate.state === "stale") {
    return { gaps: ["fact_source_stale"], state: "blocked_fact_stale" };
  }
  if (
    candidate.state === "superseded" ||
    candidate.version > input.reference.factVersion
  ) {
    return { gaps: ["fact_source_superseded"], state: "blocked_fact_stale" };
  }
  if (candidate.state !== "customer_confirmed") {
    return {
      gaps: ["fact_not_customer_confirmed"],
      state: "blocked_fact_not_ai_authorized",
    };
  }
  if (!candidate.aiUseAuthorized) {
    return {
      gaps: ["ai_use_not_authorized"],
      state: "blocked_fact_not_ai_authorized",
    };
  }
  return { gaps: [], state: "covered_by_authorized_fact" };
}

export function reconciliationFor(input: {
  readonly screening: Student500Screening;
  readonly references: readonly Student500FactReferenceRecord[];
  readonly candidates: readonly Student500FactCandidate[];
  readonly factsAvailable: boolean;
  readonly factsUnavailableReason: string | null;
  readonly schoolContext: Student500SchoolContextRecord | null;
  readonly applicationArchived: boolean;
  readonly hasDraft: boolean;
}): PreparationReconciliation {
  const candidateById = new Map(
    input.candidates.map((candidate) => [candidate.factAssertionId, candidate])
  );
  const activeReferences = input.references.filter(
    (reference) => reference.revokedAt === null
  );
  const requirements: RequirementCoverageView[] = [];
  const counts = {
    blocked: 0,
    covered: 0,
    missing: 0,
    notApplicable: 0,
    notAssessed: 0,
  };
  let hiddenConflictBlocked = false;

  for (const assessment of input.screening.requirements) {
    const patterns = requirementFactKeys(assessment.requirementKey);
    const relevant = activeReferences.filter((reference) =>
      factKeyMatches(reference.factKey, patterns)
    );
    const states = relevant.map((reference) =>
      factReferenceState({
        applicationArchived: input.applicationArchived,
        candidate: candidateById.get(reference.factAssertionId) ?? null,
        reference,
      })
    );
    const usable = states.filter(
      (entry) => entry.state === "covered_by_authorized_fact"
    );
    const blocking = states.filter(
      (entry) =>
        entry.state === "blocked_fact_conflicting" ||
        entry.state === "blocked_fact_stale" ||
        entry.state === "blocked_fact_revoked"
    );
    if (
      blocking.some((entry) => entry.state === "blocked_fact_conflicting") &&
      input.factsAvailable
    ) {
      hiddenConflictBlocked = true;
    }

    let coverage: Student500CoverageState;
    let gaps: Student500EvidenceGap[] = [];
    if (assessment.status === "not_applicable") {
      coverage = "not_applicable";
      counts.notApplicable += 1;
    } else if (assessment.status === "unknown") {
      coverage = "not_assessed";
      counts.notAssessed += 1;
    } else if (usable.length > 0) {
      coverage = "covered_by_authorized_fact";
      counts.covered += 1;
    } else if (blocking.length > 0) {
      coverage =
        blocking[0]?.state === "blocked_fact_conflicting"
          ? "blocked_fact_conflicting"
          : blocking[0]?.state === "blocked_fact_revoked"
            ? "blocked_fact_revoked"
            : "blocked_fact_stale";
      gaps = [
        ...new Set<Student500EvidenceGap>(
          blocking.flatMap((entry) => entry.gaps)
        ),
      ];
      counts.blocked += 1;
    } else if (states.length > 0) {
      // Selected, visible, confirmed-or-not, but not usable for AI context.
      coverage = "blocked_fact_not_ai_authorized";
      gaps = [
        ...new Set<Student500EvidenceGap>(
          states.flatMap((entry) => entry.gaps)
        ),
      ];
      counts.blocked += 1;
    } else if (input.applicationArchived) {
      coverage = "evidence_channel_unavailable";
      gaps = ["independent_verification_unavailable"];
      counts.blocked += 1;
    } else if (assessment.status === "conditional") {
      // A conditional dimension still needs evidence unless the customer already
      // reported holding it; absence is a missing-evidence gap, not a conclusion.
      if (assessment.evidencePreparation === "reported_held") {
        coverage = "covered_by_customer_report_only";
        gaps = ["independent_verification_unavailable"];
        counts.covered += 1;
      } else {
        coverage = "missing_evidence";
        gaps = ["no_authorized_fact_selected"];
        counts.missing += 1;
      }
    } else if (assessment.evidencePreparation === "reported_held") {
      coverage = "covered_by_customer_report_only";
      gaps = ["independent_verification_unavailable"];
      counts.covered += 1;
    } else {
      coverage = "missing_evidence";
      gaps = ["no_authorized_fact_selected"];
      counts.missing += 1;
    }

    if (!input.factsAvailable && coverage !== "not_applicable") {
      gaps = [
        ...new Set<Student500EvidenceGap>([
          ...gaps,
          "project_documents_unavailable",
        ]),
      ];
    }
    if (
      assessment.sourceVerification !== "verified_official_corpus" &&
      coverage !== "not_applicable"
    ) {
      gaps = [
        ...new Set<Student500EvidenceGap>([...gaps, "legal_source_unverified"]),
      ];
    }
    if (coverage === "covered_by_authorized_fact") {
      gaps = [
        ...new Set<Student500EvidenceGap>([
          ...gaps,
          "independent_verification_unavailable",
        ]),
      ];
    }

    requirements.push({
      aiUseAuthorized: usable.length > 0,
      applicability: assessment.status,
      coverage,
      customerConfirmed: relevant.some(
        (reference) =>
          candidateById.get(reference.factAssertionId)?.customerConfirmed ===
          true
      ),
      documentTrust: "unavailable",
      gaps,
      humanReviewRequired: true,
      independentVerification: "none_established",
      legalSourceVerification: assessment.sourceVerification,
      nextAction: nextActionFor(coverage, assessment.status),
      reasonCode: assessment.reasonCode,
      requirementKey: assessment.requirementKey,
      selectedFactReferenceIds: relevant.map((reference) => reference.id),
    });
  }

  const nextActions = deriveNextActions({
    counts,
    documentsUnavailable: !input.factsAvailable,
    hasDraft: input.hasDraft,
    hasReferences: activeReferences.length > 0,
    requirementActions: requirements
      .map((entry) => entry.nextAction)
      .filter(
        (action): action is Student500PreparationAction => action !== null
      ),
    schoolContext: input.schoolContext,
  });

  const disclosures: Student500PreparationDisclosure[] = [
    ...STUDENT_500_PREPARATION_DISCLOSURES,
  ];

  return {
    conflictCount: requirements.filter(
      (entry) => entry.coverage === "blocked_fact_conflicting"
    ).length,
    conflictsVisible: hiddenConflictBlocked,
    counts,
    disclosures,
    documentsTrust: "unavailable",
    factsAvailable: input.factsAvailable,
    factsUnavailableReason: input.factsUnavailableReason,
    nextActions,
    requirements,
    schemaVersion: STUDENT_500_PREPARATION_SCHEMA,
  };
}

function deriveNextActions(input: {
  readonly counts: PreparationReconciliation["counts"];
  readonly documentsUnavailable: boolean;
  readonly hasDraft: boolean;
  readonly hasReferences: boolean;
  readonly requirementActions: readonly Student500PreparationAction[];
  readonly schoolContext: Student500SchoolContextRecord | null;
}): readonly Student500PreparationAction[] {
  const actions: Student500PreparationAction[] = [];
  const add = (action: Student500PreparationAction) => {
    if (
      !actions.includes(action) &&
      STUDENT_500_PREPARATION_ACTIONS.includes(action)
    ) {
      actions.push(action);
    }
  };
  // Requirement-specific actions are the most useful, so they come first.
  for (const action of input.requirementActions) {
    add(action);
  }
  if (!input.hasReferences) {
    add("select_authorized_facts");
  }
  if (input.counts.missing > 0) {
    add("review_evidence_gaps");
  }
  if (!input.schoolContext || input.schoolContext.kind === "none") {
    add("link_school_context");
  }
  if (!input.hasDraft) {
    add("create_gs_draft");
  }
  if (input.hasDraft) {
    add("save_preparation_snapshot");
  }
  add("seek_human_review");
  if (input.documentsUnavailable) {
    add("review_evidence_gaps");
  }
  return actions.slice(0, 5);
}

/**
 * Selective invalidation for one saved artifact.
 *
 * Only reasons this system can actually prove are reported. Legal currentness is
 * never simulated: an unverified legal source is reported as UNKNOWN by the
 * requirement coverage above, not as a detected law change here.
 */
export function staleReasonsForArtifact(input: {
  readonly artifactFactReferenceIds: readonly string[];
  readonly references: readonly Student500FactReferenceRecord[];
  readonly candidates: readonly Student500FactCandidate[];
  readonly currentFactReferenceIds: readonly string[];
  readonly inputDigestMatches: boolean;
  readonly schoolContextDigestMatches: boolean;
  /** True when the linked M5 evidence can no longer be re-resolved/authorized. */
  readonly schoolContextUnavailable?: boolean;
  /** Distinguishes a superseded admission outcome from a general context change. */
  readonly schoolOutcomeSuperseded?: boolean;
  readonly applicationRevisionAdvanced: boolean;
}): readonly Student500StaleReason[] {
  const reasons = new Set<Student500StaleReason>();
  const candidateById = new Map(
    input.candidates.map((candidate) => [candidate.factAssertionId, candidate])
  );
  const referenceById = new Map(
    input.references.map((reference) => [reference.id, reference])
  );
  for (const factReferenceId of input.artifactFactReferenceIds) {
    const reference = referenceById.get(factReferenceId);
    if (!reference) {
      reasons.add("fact_no_longer_visible");
      continue;
    }
    if (reference.revokedAt !== null) {
      reasons.add("fact_ai_grant_revoked");
      continue;
    }
    const candidate = candidateById.get(reference.factAssertionId);
    if (!candidate) {
      reasons.add("fact_no_longer_visible");
      continue;
    }
    if (
      candidate.version > reference.factVersion ||
      candidate.state === "superseded"
    ) {
      reasons.add("fact_version_superseded");
    }
    if (candidate.state !== "customer_confirmed") {
      reasons.add("fact_confirmation_withdrawn");
    } else if (!candidate.aiUseAuthorized) {
      reasons.add("fact_ai_grant_revoked");
    }
  }
  const artifactSet = [...input.artifactFactReferenceIds].sort().join("|");
  const currentSet = [...input.currentFactReferenceIds].sort().join("|");
  if (artifactSet !== currentSet) {
    reasons.add("fact_key_set_changed");
  }
  if (input.schoolOutcomeSuperseded === true) {
    reasons.add("school_outcome_superseded");
  }
  if (input.schoolContextUnavailable === true) {
    reasons.add("school_context_unavailable");
  }
  if (!input.schoolContextDigestMatches) {
    reasons.add("school_context_changed");
  }
  if (input.applicationRevisionAdvanced) {
    reasons.add("application_revision_advanced");
  }
  if (!input.inputDigestMatches) {
    reasons.add("application_context_changed");
  }
  return [...reasons];
}
