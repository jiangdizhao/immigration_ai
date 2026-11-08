/**
 * Phase 13 M9-A — the bounded presentation contract for one Project.
 *
 * Everything here is a *description of real persisted state*, produced by the
 * existing authorized M5.1 / M6.1 services. Nothing in this module can express
 * eligibility, readiness, approval, admission, submission or a completion
 * percentage: a capability that cannot be read is reported as `disabled`,
 * `restricted` or `unavailable` with a `null` summary, never as zero progress.
 */

import type { ProjectConversationStageKey } from "@/lib/projects/stage-keys";
import type { ProjectArtifactsSummary } from "./project-artifacts";

export const WORKSPACE_CAPABILITY_STATES = [
  "available",
  "restricted",
  "disabled",
  "unavailable",
] as const;
export type WorkspaceCapabilityState =
  (typeof WORKSPACE_CAPABILITY_STATES)[number];

export type WorkspaceCapability<T> = {
  state: WorkspaceCapabilityState;
  /** Only present when `state === "available"`. */
  summary: T | null;
};

export type SchoolApplicationsSummary = {
  total: number;
  draft: number;
  preparing: number;
  packagePrepared: number;
  stale: number;
  archived: number;
  /** Applications whose own missing-data codes are not empty. */
  missingInformation: number;
  /** Applications holding a current package that no longer matches its inputs. */
  stalePackages: number;
};

export type Student500Summary = {
  total: number;
  draft: number;
  inProgress: number;
  archived: number;
  /** Screening still reports missing fact codes for a non-archived application. */
  missingFacts: number;
  humanReviewRequired: number;
  screeningIncomplete: number;
  screeningPendingReview: number;
};

export type ProjectDocumentsSummary = {
  total: number;
  active: number;
  withdrawn: number;
  securityPending: number;
  securityClean: number;
  securityRejected: number;
  securityFailed: number;
  storagePending: number;
  storageStored: number;
  storageFailed: number;
  cleanupPending: number;
};

export type ProjectStageChatBindingView = {
  stageKey: ProjectConversationStageKey;
  chatId: string;
};

export type ProjectStageChatsState = {
  /** `unavailable` while the additive M9-A binding migration is unapplied. */
  state: "available" | "unavailable";
  /** One entry per step the actor already owns a conversation for. */
  bindings: ProjectStageChatBindingView[];
};

export type ProjectWorkspaceSummary = {
  projectId: string;
  projectStatus: "active" | "closed";
  revision: number;
  schoolApplications: WorkspaceCapability<SchoolApplicationsSummary>;
  student500: WorkspaceCapability<Student500Summary>;
  documents: WorkspaceCapability<ProjectDocumentsSummary>;
  /**
   * Phase 13 M9-A R1-05: metadata-only references to generated artifacts owned by the
   * M5.1/M6.2 workflows. No content, no download, no new access.
   */
  artifacts: ProjectArtifactsSummary;
  stageChats: ProjectStageChatsState;
};
