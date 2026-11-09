import type { StaffReviewDetail } from "./staff-review-detail";

/**
 * Phase 13 M9-B correction 2 — staff Project detail selection.
 *
 * Two defects are prevented here, structurally:
 *
 * 1. **Stale responses.** Every selection increments a generation counter, and a response
 *    is only applied when it still carries the current generation *and* the Project that is
 *    currently selected. Native `fetch` has no cancellation contract that is reliable across
 *    the runtime, so the guard is on the result rather than on the request.
 * 2. **Stale detail on screen.** Selecting another Project clears the previous detail in the
 *    same transition, so Project A's shell and disclosure decision can never be visible
 *    while Project B is selected.
 *
 * Pure and total: no fetch, no timers, no side effects.
 */

export type StaffDetailSelectionState = {
  /** Currently selected Project, or `null` when nothing is open. */
  readonly projectId: string | null;
  /** Monotonic request generation; only the newest may commit. */
  readonly generation: number;
  readonly detail: StaffReviewDetail | null;
  readonly busy: boolean;
  readonly failed: boolean;
};

export const EMPTY_STAFF_DETAIL_SELECTION: StaffDetailSelectionState = {
  busy: false,
  detail: null,
  failed: false,
  generation: 0,
  projectId: null,
};

/** The identity a caller must echo back with its response. */
export type StaffDetailRequest = {
  readonly projectId: string;
  readonly generation: number;
};

/**
 * Selects a Project: clears the previous detail immediately and starts a new generation.
 * Re-selecting the same Project also starts a new generation, so an older in-flight
 * response for it cannot overwrite the newest one.
 */
export function selectStaffProject(
  state: StaffDetailSelectionState,
  projectId: string
): {
  readonly request: StaffDetailRequest;
  readonly state: StaffDetailSelectionState;
} {
  const generation = state.generation + 1;
  return {
    request: { generation, projectId },
    state: {
      busy: true,
      detail: null,
      failed: false,
      generation,
      projectId,
    },
  };
}

export type StaffDetailResult =
  | { readonly kind: "ok"; readonly detail: StaffReviewDetail }
  | { readonly kind: "failed" }
  | { readonly kind: "not_found" };

/**
 * Applies a response only when it belongs to the current selection. A late response for a
 * previous Project (success *or* failure) is dropped without touching the state.
 */
export function applyStaffDetailResult(
  state: StaffDetailSelectionState,
  request: StaffDetailRequest,
  result: StaffDetailResult
): StaffDetailSelectionState {
  if (
    request.generation !== state.generation ||
    request.projectId !== state.projectId
  ) {
    return state;
  }
  if (result.kind === "ok") {
    return { ...state, busy: false, detail: result.detail, failed: false };
  }
  // A not-found Project and a failed read are both "no detail"; they differ only in the
  // message the caller shows, and neither may keep a previously rendered detail.
  return { ...state, busy: false, detail: null, failed: true };
}

/** Clears the panel (for example when the staff workspace is reloaded). */
export function clearStaffDetail(
  state: StaffDetailSelectionState
): StaffDetailSelectionState {
  return {
    ...EMPTY_STAFF_DETAIL_SELECTION,
    generation: state.generation + 1,
  };
}
