import type { ProjectWorkspaceSummary } from "./project-workspace-summary";

/**
 * Phase 13 M9-A R1 — Project-scoped workspace data gating.
 *
 * The overview projection, the stage rail and the step-chat bindings all describe
 * **one** Project. Two independent rules keep Project A's data off Project B's screen:
 *
 *   1. **Selection change clears immediately.** A state object is reset the moment the
 *      selected Project identity changes (including clearing the selection), so no
 *      render can use the previous Project's summary while the new request is in
 *      flight.
 *   2. **A late response is dropped.** A response is applied only when its request is
 *      still the newest one *and* both the requested and the returned `projectId`
 *      match the Project that is selected right now.
 *
 * Both are pure and deterministic so the deferred-response race can be tested without
 * a browser or a network.
 */

export const PROJECT_WORKSPACE_DATA_STATES = [
  "idle",
  "loading",
  "ready",
  "failed",
] as const;
export type ProjectWorkspaceDataState =
  (typeof PROJECT_WORKSPACE_DATA_STATES)[number];

export type ProjectWorkspaceData = {
  summary: ProjectWorkspaceSummary | null;
  state: ProjectWorkspaceDataState;
};

export const EMPTY_PROJECT_WORKSPACE_DATA: ProjectWorkspaceData = {
  state: "idle",
  summary: null,
};

/**
 * The state to use as soon as the selected Project identity changes.
 *
 * A new selection starts in `loading` with **no** summary; clearing the selection
 * (returning to a standalone conversation) drops everything and goes back to `idle`.
 */
export function projectWorkspaceDataOnSelectionChange(input: {
  nextProjectId: string | null;
}): ProjectWorkspaceData {
  return input.nextProjectId
    ? { state: "loading", summary: null }
    : EMPTY_PROJECT_WORKSPACE_DATA;
}

/**
 * The only data a render may use for the currently selected Project.
 *
 * A summary whose `projectId` does not match the selection is treated as stale and
 * hidden, even if it is still sitting in state because a state update has not been
 * committed yet.
 */
export function projectWorkspaceDataForSelection(input: {
  data: ProjectWorkspaceData;
  selectedProjectId: string | null;
}): ProjectWorkspaceData {
  if (!input.selectedProjectId) {
    return EMPTY_PROJECT_WORKSPACE_DATA;
  }
  if (
    input.data.summary &&
    input.data.summary.projectId !== input.selectedProjectId
  ) {
    return { state: "loading", summary: null };
  }
  return input.data;
}

/**
 * Whether a resolved projection may be committed.
 *
 * Rejects, in this order: a superseded request (a newer one started), a response for a
 * Project that is no longer selected, and a response whose own `projectId` disagrees
 * with the request.
 */
export function shouldApplyProjectWorkspaceSummary(input: {
  requestProjectId: string;
  summaryProjectId: string;
  selectedProjectId: string | null;
  requestSequence: number;
  latestRequestSequence: number;
}): boolean {
  return (
    input.requestSequence === input.latestRequestSequence &&
    input.requestProjectId === input.selectedProjectId &&
    input.summaryProjectId === input.requestProjectId
  );
}
