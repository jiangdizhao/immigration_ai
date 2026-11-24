import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ActiveStepSelectionV1,
  resolveActiveStepContext,
} from "./active-step-context";
import { buildProjectState, type ProjectStateInput } from "./project-state";
import {
  buildProjectWorkflowProjection,
  PROJECT_WORKFLOW_DEFINITION_VERSION,
} from "./project-workflows";

const projectId = "123e4567-e89b-42d3-a456-426614174000";
const chatId = "123e4567-e89b-42d3-a456-426614174001";
const timestamp = "2026-11-24T00:00:00.000Z";

function state(revision = 4) {
  const input: ProjectStateInput = {
    admissionsCases: [],
    capabilities: {
      projectDocuments: { reasonCode: null, state: "disabled" },
      projectFacts: { reasonCode: null, state: "available" },
      schoolAdmissions: { reasonCode: null, state: "available" },
      schoolApplications: { reasonCode: null, state: "available" },
      serviceEngagements: { reasonCode: null, state: "available" },
      student500: { reasonCode: null, state: "available" },
      student500Preparation: { reasonCode: null, state: "available" },
      submissionPackages: { reasonCode: null, state: "unsupported" },
    },
    facts: { authorizedForAI: [], conflictCount: 0, state: "available" },
    generatedAt: timestamp,
    project: { id: projectId, revision, status: "active" },
    schoolApplications: [],
    serviceEngagements: [],
    student500Applications: [],
    student500PreparationCapability: "available",
    student500Preparations: [],
  };
  return buildProjectState(input);
}

function selectionFor(current = state()): ActiveStepSelectionV1 {
  const task = buildProjectWorkflowProjection(current).tasks.find(
    (item) => item.stepKey === "project_goal"
  );
  if (!task) {
    throw new Error("project_goal fixture task missing");
  }
  return {
    schemaVersion: "phase15.active-step-selection.v1",
    projectId,
    taskId: task.taskId,
    workflowKind: task.workflowKind,
    definitionVersion: task.definitionVersion,
    stepKey: task.stepKey,
    targetKind: task.targetKind,
    targetId: task.targetId,
    sourceRevisions: task.sourceRevisions.map((item) => ({ ...item })),
  };
}

test("resolves the exact current E2 task while retaining its whole-Project identity", () => {
  const current = state();
  const result = resolveActiveStepContext({
    state: current,
    chatId,
    projectId,
    selection: selectionFor(current),
  });
  assert.ok(result);
  assert.equal(result.schemaVersion, "phase15.active-step-context.v1");
  assert.equal(result.chatId, chatId);
  assert.equal(result.projectId, projectId);
  assert.equal(result.definitionVersion, PROJECT_WORKFLOW_DEFINITION_VERSION);
  assert.equal(result.stepKey, "project_goal");
  assert.equal(result.matter?.kind, "project");
  assert.equal(result.sourceCoverage, "complete");
});

test("rejects wrong Project, target, definition and stale source revision", () => {
  const current = state();
  const selected = selectionFor(current);
  const resolve = (selection: ActiveStepSelectionV1) =>
    resolveActiveStepContext({ state: current, chatId, projectId, selection });
  assert.throws(() => resolve({ ...selected, projectId: chatId }));
  assert.throws(() => resolve({ ...selected, targetId: chatId }));
  assert.throws(() =>
    resolve({ ...selected, definitionVersion: "old" as never })
  );
  assert.throws(() =>
    resolveActiveStepContext({
      state: state(5),
      chatId,
      projectId,
      selection: selected,
    })
  );
});

test("selection absence is not an error, while unavailable current state fails closed", () => {
  assert.equal(
    resolveActiveStepContext({
      state: null,
      chatId,
      projectId,
      selection: null,
    }),
    null
  );
  assert.throws(() =>
    resolveActiveStepContext({
      state: null,
      chatId,
      projectId,
      selection: selectionFor(),
    })
  );
});
