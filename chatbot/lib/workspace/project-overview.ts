import type {
  ProjectStage,
  ProjectStageKey,
  ProjectStageStatus,
} from "./project-stages";
import type { ProjectWorkspaceSummary } from "./project-workspace-summary";

/**
 * Phase 13 M9-A — Project overview derivation.
 *
 * The overview answers only questions the product can actually answer from persisted
 * state: what exists, what the customer still has to do, what is blocked in this
 * environment, and what the single most useful next step is.
 *
 * It deliberately has **no percentage and no `x/y completed` denominator**. When a
 * capability cannot be read it contributes nothing to the counts and is reported as a
 * blocked area instead of quietly counting as zero.
 *
 * Preparation progress and submission readiness are separate fields. Readiness is
 * never derived from preparation counts: while the M8 submission capability is
 * default-OFF there is no authoritative readiness signal at all, so the overview says
 * so instead of implying the customer is "almost ready".
 */

export type ProjectOverviewReadiness = {
  state: "unavailable" | "not_assessed";
  reason: "submission_capability_disabled" | "no_authoritative_signal";
};

export type ProjectOverviewBlocker =
  | "documents_unavailable"
  | "school_applications_disabled"
  | "student500_disabled"
  | "step_conversations_unavailable"
  | "school_application_missing_information"
  | "school_application_package_stale"
  | "student500_missing_facts"
  | "student500_human_review_required";

export type ProjectOverviewNextAction =
  | {
      kind: "open_stage";
      stageKey: ProjectStageKey;
      reason: "needs_information" | "not_started" | "in_progress";
    }
  | { kind: "open_documents"; reason: "reading_available" }
  | { kind: "none"; reason: "nothing_available" };

export type ProjectOverview = {
  preparation: {
    state: ProjectStageStatus;
    /** Records reported as open work across readable stages. */
    openItems: number | null;
    /** Records that need the customer to supply or redo something. */
    needsAttention: number | null;
    /** How many stages could be read, out of how many exist. */
    readableStages: number;
    totalStages: number;
  };
  readiness: ProjectOverviewReadiness;
  blockers: ProjectOverviewBlocker[];
  nextAction: ProjectOverviewNextAction;
};

export function deriveProjectOverview(input: {
  stages: readonly ProjectStage[];
  summary: ProjectWorkspaceSummary;
  /** M8 submission capability availability, resolved server-side. */
  submissionCapabilityEnabled: boolean;
}): ProjectOverview {
  const readable = input.stages.filter(
    (stage) => stage.capability === "available" && stage.count !== null
  );
  const openItems = readable.length
    ? readable.reduce((total, stage) => total + (stage.count ?? 0), 0)
    : null;
  const needsAttention = readable.length
    ? readable.reduce((total, stage) => total + (stage.needsAttention ?? 0), 0)
    : null;

  const blockers: ProjectOverviewBlocker[] = [];
  if (input.summary.documents.state !== "available") {
    blockers.push("documents_unavailable");
  }
  if (input.summary.stageChats.state !== "available") {
    blockers.push("step_conversations_unavailable");
  }
  for (const stage of input.stages) {
    if (stage.key === "applications" && stage.capability === "disabled") {
      blockers.push("school_applications_disabled");
    }
    if (stage.key === "student500" && stage.capability === "disabled") {
      blockers.push("student500_disabled");
    }
  }
  const schoolApplications = input.summary.schoolApplications.summary;
  if (schoolApplications) {
    if (schoolApplications.missingInformation > 0) {
      blockers.push("school_application_missing_information");
    }
    if (schoolApplications.stalePackages > 0) {
      blockers.push("school_application_package_stale");
    }
  }
  const student500 = input.summary.student500.summary;
  if (student500) {
    if (student500.missingFacts > 0) {
      blockers.push("student500_missing_facts");
    }
    if (student500.humanReviewRequired > 0) {
      blockers.push("student500_human_review_required");
    }
  }

  return {
    blockers,
    nextAction: nextProjectAction(input.stages),
    preparation: {
      needsAttention,
      openItems,
      readableStages: readable.length,
      state: preparationState(readable),
      totalStages: input.stages.length,
    },
    readiness: input.submissionCapabilityEnabled
      ? { reason: "no_authoritative_signal", state: "not_assessed" }
      : { reason: "submission_capability_disabled", state: "unavailable" },
  };
}

function preparationState(
  readable: readonly ProjectStage[]
): ProjectStageStatus {
  if (readable.length === 0) {
    return "unknown";
  }
  if (readable.some((stage) => stage.status === "needs_information")) {
    return "needs_information";
  }
  if (readable.every((stage) => stage.status === "not_started")) {
    return "not_started";
  }
  return "in_progress";
}

/**
 * One meaningful next action, in catalogue order, chosen only from stages that a
 * real capability made available. Unfinished work wins over empty work, and an empty
 * stage is still a valid next step because starting it is real progress.
 */
function nextProjectAction(
  stages: readonly ProjectStage[]
): ProjectOverviewNextAction {
  const available = stages.filter((stage) => stage.capability === "available");
  const needsInformation = available.find(
    (stage) => stage.status === "needs_information"
  );
  if (needsInformation) {
    return {
      kind: "open_stage",
      reason: "needs_information",
      stageKey: needsInformation.key,
    };
  }
  const inProgress = available.find((stage) => stage.status === "in_progress");
  if (inProgress) {
    return {
      kind: "open_stage",
      reason: "in_progress",
      stageKey: inProgress.key,
    };
  }
  const notStarted = available.find((stage) => stage.status === "not_started");
  if (notStarted) {
    return {
      kind: "open_stage",
      reason: "not_started",
      stageKey: notStarted.key,
    };
  }
  if (available.some((stage) => stage.key === "documents")) {
    return { kind: "open_documents", reason: "reading_available" };
  }
  return { kind: "none", reason: "nothing_available" };
}
