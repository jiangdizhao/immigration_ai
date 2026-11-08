import {
  isProjectConversationStageKey,
  type ProjectConversationStageKey,
} from "@/lib/projects/stage-keys";
import type {
  ProjectWorkspaceSummary,
  WorkspaceCapabilityState,
} from "./project-workspace-summary";
import type { ProjectWorkspaceView } from "./project-workspace-view";

/**
 * Phase 13 M9-A — the Project navigation model.
 *
 * The stages are the workspace surfaces that actually exist in this product, and a
 * stage is only ever offered because the server resolved a real capability for the
 * requesting actor. The illustrated five-step journey is deliberately NOT encoded
 * here: there is no universal immigration step list, no invented total and no
 * completion percentage.
 *
 * `status` is derived exclusively from real counts. A stage whose capability is
 * blocked is `blocked`, a readable stage with no records is `not_started`, a
 * readable stage with open work is `in_progress`, and a readable stage whose own
 * service reports missing information or stale packages is `needs_information`.
 * Any stage we cannot read is `unknown`, never "complete".
 */

export const PROJECT_STAGE_KEYS = [
  "applications",
  "admissions",
  "student500",
  "documents",
] as const;
export type ProjectStageKey = (typeof PROJECT_STAGE_KEYS)[number];

export const PROJECT_STAGE_STATUSES = [
  "not_started",
  "in_progress",
  "needs_information",
  "blocked",
  "unknown",
] as const;
export type ProjectStageStatus = (typeof PROJECT_STAGE_STATUSES)[number];

/** The workspace section a stage opens in the main content area. */
export const PROJECT_STAGE_VIEWS: Record<
  ProjectStageKey,
  ProjectWorkspaceView
> = {
  admissions: "admissions",
  applications: "applications",
  documents: "documents",
  student500: "student500",
};

/**
 * Only real workflow steps can own a step conversation. The document centre is a
 * read surface, not a workflow step, so it never gets a bound Chat.
 */
const STAGE_CONVERSATION_KEYS: Record<
  ProjectStageKey,
  ProjectConversationStageKey | null
> = {
  admissions: "school_admissions",
  applications: "school_applications",
  documents: null,
  student500: "student500",
};

export type ProjectStageSignal = {
  capability: WorkspaceCapabilityState;
  /** Total records the stage reports, or null when it cannot be read. */
  count: number | null;
  /** Records that need the customer to supply or redo something. */
  needsAttention: number | null;
};

export type ProjectStageInput = {
  signals: Record<ProjectStageKey, ProjectStageSignal>;
  /** True only when the additive step-conversation schema is applied. */
  stageChatsAvailable: boolean;
  /** Step keys this actor already has a conversation for. */
  boundStageKeys: readonly string[];
};

export type ProjectStage = {
  key: ProjectStageKey;
  view: ProjectWorkspaceView;
  capability: WorkspaceCapabilityState;
  status: ProjectStageStatus;
  count: number | null;
  needsAttention: number | null;
  conversation: {
    stageKey: ProjectConversationStageKey | null;
    bound: boolean;
    /** Whether "open step conversation" may be offered at all. */
    available: boolean;
  };
};

export function projectStageStatus(input: {
  capability: WorkspaceCapabilityState;
  count: number | null;
  needsAttention?: number | null;
}): ProjectStageStatus {
  if (input.capability !== "available") {
    return "blocked";
  }
  if (input.count === null || !Number.isSafeInteger(input.count)) {
    return "unknown";
  }
  if (input.count === 0) {
    return "not_started";
  }
  if ((input.needsAttention ?? 0) > 0) {
    return "needs_information";
  }
  return "in_progress";
}

export function deriveProjectStages(input: ProjectStageInput): ProjectStage[] {
  return PROJECT_STAGE_KEYS.map((key) => {
    const signal = input.signals[key];
    const stageKey = STAGE_CONVERSATION_KEYS[key];
    const bound = stageKey
      ? input.boundStageKeys.some((entry) => entry === stageKey)
      : false;
    return {
      capability: signal.capability,
      conversation: {
        available: Boolean(stageKey) && input.stageChatsAvailable,
        bound,
        stageKey:
          stageKey && isProjectConversationStageKey(stageKey) ? stageKey : null,
      },
      count: signal.count,
      key,
      needsAttention: signal.needsAttention,
      status: projectStageStatus({
        capability: signal.capability,
        count: signal.count,
        needsAttention: signal.needsAttention,
      }),
      view: PROJECT_STAGE_VIEWS[key],
    };
  });
}

/**
 * Bridges the authorized summary projection into the navigation model.
 *
 * `admissions` has no aggregate read model of its own yet, so its capability comes
 * from the server-resolved feature/eligibility props the page already computed, and
 * its counts stay `null` (rendered as "unknown" rather than as an invented zero).
 */
export function stageSignalsFromSummary(input: {
  summary: ProjectWorkspaceSummary;
  admissionsCapability: WorkspaceCapabilityState;
}): Record<ProjectStageKey, ProjectStageSignal> {
  const schoolApplications = input.summary.schoolApplications;
  const student500 = input.summary.student500;
  const documents = input.summary.documents;
  return {
    admissions: {
      capability: input.admissionsCapability,
      count: null,
      needsAttention: null,
    },
    applications: {
      capability: schoolApplications.state,
      count: schoolApplications.summary
        ? schoolApplications.summary.total - schoolApplications.summary.archived
        : null,
      needsAttention: schoolApplications.summary
        ? schoolApplications.summary.missingInformation +
          schoolApplications.summary.stalePackages
        : null,
    },
    documents: {
      capability: documents.state,
      count: documents.summary
        ? documents.summary.total - documents.summary.withdrawn
        : null,
      needsAttention: documents.summary
        ? documents.summary.securityPending +
          documents.summary.securityRejected +
          documents.summary.securityFailed
        : null,
    },
    student500: {
      capability: student500.state,
      count: student500.summary
        ? student500.summary.total - student500.summary.archived
        : null,
      needsAttention: student500.summary
        ? student500.summary.missingFacts +
          student500.summary.humanReviewRequired
        : null,
    },
  };
}
