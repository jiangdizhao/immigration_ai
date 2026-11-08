import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_PROJECT_ARTIFACTS } from "./project-artifacts";
import {
  EMPTY_PROJECT_WORKSPACE_DATA,
  type ProjectWorkspaceData,
  projectWorkspaceDataForSelection,
  projectWorkspaceDataOnSelectionChange,
  shouldApplyProjectWorkspaceSummary,
} from "./project-workspace-state";
import type { ProjectWorkspaceSummary } from "./project-workspace-summary";

/**
 * Phase 13 M9-A R1-03 — deterministic proof that a previous Project's projection can
 * never reach the screen.
 *
 * The two helper rules are exercised the way the workspace uses them, including a
 deferred response ordering: Project A's request is started, the actor switches to
 * Project B (and later back to a standalone conversation) before A resolves, and A's
 * late payload must be discarded.
 */

const projectA = "11111111-1111-4111-8111-111111111111";
const projectB = "22222222-2222-4222-8222-222222222222";

function summaryFor(projectId: string): ProjectWorkspaceSummary {
  return {
    artifacts: EMPTY_PROJECT_ARTIFACTS,
    documents: { state: "disabled", summary: null },
    projectId,
    projectStatus: "active",
    revision: 1,
    schoolApplications: {
      state: "available",
      summary: {
        archived: 0,
        draft: 1,
        missingInformation: 0,
        packagePrepared: 0,
        preparing: 0,
        stale: 0,
        stalePackages: 0,
        total: 1,
      },
    },
    stageChats: { bindings: [], state: "available" },
    student500: { state: "available", summary: null },
  } as ProjectWorkspaceSummary;
}

test("a Project switch drops the previous summary immediately", () => {
  const forA: ProjectWorkspaceData = {
    state: "ready",
    summary: summaryFor(projectA),
  };
  const afterSwitch = projectWorkspaceDataOnSelectionChange({
    nextProjectId: projectB,
  });
  assert.deepEqual(afterSwitch, { state: "loading", summary: null });
  // Even before the state update commits, the render gate hides A's data on B.
  assert.deepEqual(
    projectWorkspaceDataForSelection({
      data: forA,
      selectedProjectId: projectB,
    }),
    { state: "loading", summary: null }
  );
  // Returning to a standalone conversation clears everything.
  assert.deepEqual(
    projectWorkspaceDataOnSelectionChange({ nextProjectId: null }),
    EMPTY_PROJECT_WORKSPACE_DATA
  );
  assert.deepEqual(
    projectWorkspaceDataForSelection({
      data: forA,
      selectedProjectId: null,
    }),
    EMPTY_PROJECT_WORKSPACE_DATA
  );
});

test("the summary of the selected Project is the only one ever rendered", () => {
  const forA: ProjectWorkspaceData = {
    state: "ready",
    summary: summaryFor(projectA),
  };
  assert.deepEqual(
    projectWorkspaceDataForSelection({
      data: forA,
      selectedProjectId: projectA,
    }),
    forA
  );
  // A stale entry for another Project is never rendered, and is reported as loading
  // rather than as the wrong Project's data.
  const mismatched = projectWorkspaceDataForSelection({
    data: forA,
    selectedProjectId: projectB,
  });
  assert.equal(mismatched.summary, null);
  assert.equal(mismatched.state, "loading");
});

test("R1-03: a deferred Project A response is discarded after switching to B", async () => {
  // Deterministic model of the workspace sequence/selection logic (no timers, no
  // browser): each "request" only settles when the test resolves it.
  let selectedProjectId: string | null = projectA;
  let latestSequence = 0;
  let data: ProjectWorkspaceData = EMPTY_PROJECT_WORKSPACE_DATA;

  function beginLoad() {
    latestSequence += 1;
    const sequence = latestSequence;
    const projectId = selectedProjectId as string;
    data = projectWorkspaceDataOnSelectionChange({ nextProjectId: projectId });
    let resolve: (summary: ProjectWorkspaceSummary) => void = () => undefined;
    const settled = new Promise<void>((done) => {
      resolve = (summary) => {
        if (
          shouldApplyProjectWorkspaceSummary({
            latestRequestSequence: latestSequence,
            requestProjectId: projectId,
            requestSequence: sequence,
            selectedProjectId,
            summaryProjectId: summary.projectId,
          })
        ) {
          data = { state: "ready", summary };
        } else if (sequence === latestSequence) {
          data = { state: "failed", summary: null };
        }
        done();
      };
    });
    return {
      projectId,
      settle: (summary: ProjectWorkspaceSummary) => {
        resolve(summary);
        return settled;
      },
    };
  }

  const requestA = beginLoad();
  assert.equal(requestA.projectId, projectA);

  // The actor switches to Project B while A is still in flight.
  selectedProjectId = projectB;
  data = projectWorkspaceDataOnSelectionChange({ nextProjectId: projectB });
  const requestB = beginLoad();

  // A resolves late: it must be dropped, and B's screen must show nothing of A.
  await requestA.settle(summaryFor(projectA));
  assert.equal(
    data.summary === null,
    true,
    "Project A's late payload must be discarded"
  );
  assert.deepEqual(
    projectWorkspaceDataForSelection({ data, selectedProjectId }),
    { state: "loading", summary: null }
  );

  // B resolves: only B's own summary is committed.
  await requestB.settle(summaryFor(projectB));
  assert.equal(data.summary?.projectId, projectB);
  assert.equal(
    projectWorkspaceDataForSelection({ data, selectedProjectId }).summary
      ?.projectId,
    projectB
  );

  // The actor returns to a standalone conversation: nothing Project-scoped remains.
  selectedProjectId = null;
  data = projectWorkspaceDataOnSelectionChange({ nextProjectId: null });
  assert.equal(
    projectWorkspaceDataForSelection({ data, selectedProjectId }).summary,
    null
  );
});

test("a response whose own projectId disagrees with the request is refused", () => {
  const base = {
    latestRequestSequence: 3,
    requestProjectId: projectA,
    requestSequence: 3,
    selectedProjectId: projectA,
    summaryProjectId: projectA,
  };
  assert.equal(shouldApplyProjectWorkspaceSummary(base), true);
  assert.equal(
    shouldApplyProjectWorkspaceSummary({ ...base, summaryProjectId: projectB }),
    false,
    "a response describing another Project must never be applied"
  );
  assert.equal(
    shouldApplyProjectWorkspaceSummary({
      ...base,
      selectedProjectId: projectB,
    }),
    false,
    "a response for a Project that is no longer selected must be dropped"
  );
  assert.equal(
    shouldApplyProjectWorkspaceSummary({ ...base, requestSequence: 2 }),
    false,
    "a superseded request must be dropped"
  );
});
