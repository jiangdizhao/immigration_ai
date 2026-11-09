import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyStaffDetailResult,
  clearStaffDetail,
  EMPTY_STAFF_DETAIL_SELECTION,
  type StaffDetailSelectionState,
  selectStaffProject,
} from "./staff-detail-selection";
import type { StaffReviewDetail } from "./staff-review-detail";

/**
 * Phase 13 M9-B correction 2 — staff Project detail selection.
 *
 * The failure mode being prevented: staff opens Project A, then Project B; A's response
 * arrives later and overwrites B's detail (or A's failure blanks B). Every case below is a
 * real out-of-order completion, resolved purely.
 */

const projectA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function detailFor(projectId: string): StaffReviewDetail {
  return {
    blockedReasonCodes: ["resource_source_unavailable"],
    disclosure: { decision: "DENY", reasonCode: "resource_source_unavailable" },
    permitted: ["project_shell"],
    professionalReview: {
      reasonCode: "professional_authority_unavailable",
      state: "unavailable",
    },
    projectId,
    review: null,
    shell: {
      acceptedAt: null,
      assignmentId: `assignment-${projectId.slice(0, 4)}`,
      assignmentRole: "lawyer",
      assignmentStatus: "active",
      projectId,
      projectLifecycle: "active",
      updatedAt: null,
    },
  };
}

function select(
  state: StaffDetailSelectionState,
  projectId: string
): {
  request: { generation: number; projectId: string };
  state: StaffDetailSelectionState;
} {
  return selectStaffProject(state, projectId);
}

test("selecting a Project clears the previous detail immediately", () => {
  const a = select(EMPTY_STAFF_DETAIL_SELECTION, projectA);
  const withA = applyStaffDetailResult(a.state, a.request, {
    detail: detailFor(projectA),
    kind: "ok",
  });
  assert.ok(withA.detail);
  assert.equal(withA.detail.projectId, projectA);

  const b = select(withA, projectB);
  // The previous Project's shell/disclosure must not survive the transition.
  assert.equal(b.state.detail, null);
  assert.equal(b.state.projectId, projectB);
  assert.equal(b.state.busy, true);
  assert.equal(b.state.failed, false);
  // A new generation is issued for every selection.
  assert.equal(b.request.generation, a.request.generation + 1);
});

test("a late success for the previous Project never overwrites the current one", () => {
  const a = select(EMPTY_STAFF_DETAIL_SELECTION, projectA);
  const b = select(a.state, projectB);
  // B completes first...
  const afterB = applyStaffDetailResult(b.state, b.request, {
    detail: detailFor(projectB),
    kind: "ok",
  });
  assert.equal(afterB.detail?.projectId, projectB);
  // ...then A's stale success arrives.
  const afterStaleA = applyStaffDetailResult(afterB, a.request, {
    detail: detailFor(projectA),
    kind: "ok",
  });
  assert.equal(afterStaleA, afterB, "a stale response is ignored entirely");
  assert.equal(afterStaleA.detail?.projectId, projectB);
});

test("a late failure for the previous Project cannot blank the current one", () => {
  const a = select(EMPTY_STAFF_DETAIL_SELECTION, projectA);
  const b = select(a.state, projectB);
  const afterB = applyStaffDetailResult(b.state, b.request, {
    detail: detailFor(projectB),
    kind: "ok",
  });
  const afterStaleFailure = applyStaffDetailResult(afterB, a.request, {
    kind: "failed",
  });
  assert.equal(afterStaleFailure, afterB);
  assert.equal(afterStaleFailure.detail?.projectId, projectB);
  assert.equal(afterStaleFailure.failed, false);
});

test("reverse completion order: B fails, then A succeeds, B's failure still wins", () => {
  const a = select(EMPTY_STAFF_DETAIL_SELECTION, projectA);
  const b = select(a.state, projectB);
  const afterBFailure = applyStaffDetailResult(b.state, b.request, {
    kind: "failed",
  });
  assert.equal(afterBFailure.detail, null);
  assert.equal(afterBFailure.failed, true);
  assert.equal(afterBFailure.busy, false);

  const afterStaleASuccess = applyStaffDetailResult(afterBFailure, a.request, {
    detail: detailFor(projectA),
    kind: "ok",
  });
  assert.equal(afterStaleASuccess, afterBFailure);
  assert.equal(afterStaleASuccess.detail, null);
  assert.equal(afterStaleASuccess.failed, true);
});

test("a not-found Project and a failed read both clear the detail", () => {
  const a = select(EMPTY_STAFF_DETAIL_SELECTION, projectA);
  const loaded = applyStaffDetailResult(a.state, a.request, {
    detail: detailFor(projectA),
    kind: "ok",
  });
  const b = select(loaded, projectB);
  assert.equal(b.state.detail, null);
  const missing = applyStaffDetailResult(b.state, b.request, {
    kind: "not_found",
  });
  assert.equal(missing.detail, null);
  assert.equal(missing.failed, true);
  assert.equal(missing.busy, false);
});

test("re-selecting the same Project invalidates the earlier in-flight request", () => {
  const first = select(EMPTY_STAFF_DETAIL_SELECTION, projectA);
  const second = select(first.state, projectA);
  assert.equal(second.request.generation, first.request.generation + 1);
  const afterSecond = applyStaffDetailResult(second.state, second.request, {
    detail: detailFor(projectA),
    kind: "ok",
  });
  const staleSameProject = applyStaffDetailResult(afterSecond, first.request, {
    kind: "failed",
  });
  assert.equal(staleSameProject, afterSecond);
  assert.equal(staleSameProject.failed, false);
});

test("clearing the panel invalidates every in-flight request", () => {
  const a = select(EMPTY_STAFF_DETAIL_SELECTION, projectA);
  const cleared = clearStaffDetail(a.state);
  assert.equal(cleared.projectId, null);
  assert.equal(cleared.detail, null);
  assert.equal(cleared.busy, false);
  const afterStale = applyStaffDetailResult(cleared, a.request, {
    detail: detailFor(projectA),
    kind: "ok",
  });
  assert.equal(afterStale, cleared);
  assert.equal(afterStale.detail, null);
});
