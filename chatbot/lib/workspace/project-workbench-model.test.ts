import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectJourney, ProjectJourneyNode } from "./project-journey";
import {
  linkedAdmissionsNodeIds,
  projectWorkbenchDefaultTargetId,
  projectWorkbenchNodeById,
  projectWorkbenchPanelKind,
  projectWorkbenchSelectionForWorkflowTask,
  projectWorkbenchTargetGroupForNode,
  reconcileProjectWorkbenchTarget,
  recordedRoutesForTarget,
} from "./project-workbench-model";
import {
  PROJECT_WORKFLOW_DEFINITION_VERSION,
  type WorkflowTaskProjectionV1,
  workflowTaskId,
} from "./project-workflows";

const projectId = "project-workbench-model";

function workflowTask(input: {
  workflowKind: WorkflowTaskProjectionV1["workflowKind"];
  stepKey: WorkflowTaskProjectionV1["stepKey"];
  targetKind: WorkflowTaskProjectionV1["targetKind"];
  targetId: string;
}): WorkflowTaskProjectionV1 {
  return {
    actionability: "read_only",
    applicability: "applicable",
    definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
    dependencies: [],
    dependencySemantics: "none",
    panelKind:
      input.targetKind === "project"
        ? "planning"
        : input.targetKind === "school_application"
          ? "school"
          : input.targetKind === "school_admission_case"
            ? "admissions"
            : "student_500",
    progress: "in_progress",
    progressCreditKey: null,
    progressCreditOwner: true,
    projectId,
    reasonCodes: [],
    responsibleActor: "unknown",
    sourceRevision: 1,
    sourceRevisions: [],
    stepKey: input.stepKey,
    targetId: input.targetId,
    targetKind: input.targetKind,
    taskId: workflowTaskId(input),
    workflowKind: input.workflowKind,
  };
}

function node(
  id: string,
  kind: ProjectJourneyNode["kind"],
  parentNodeId?: string
): ProjectJourneyNode {
  return {
    actions: [],
    id,
    issueCodes: [],
    kind,
    missingInformationCodes: [],
    progress: kind === "route_entry" ? "route_recorded" : "in_progress",
    provenance: null,
    record: null,
    responsibleActor: null,
    route:
      kind === "route_entry"
        ? {
            code: "no_school_application",
            kind: "no_school_application",
            parentNodeId: parentNodeId ?? "student500:student-a",
          }
        : null,
    sourceKey:
      kind === "school_application"
        ? "schoolApplications"
        : kind === "admission_case"
          ? "schoolAdmissions"
          : "student500",
    subtitle: null,
    targetId: id.split(":")[1] ?? id,
    targetKind:
      kind === "school_application"
        ? "school_application"
        : kind === "admission_case"
          ? "school_admission_case"
          : "student500_application",
    title: id,
  };
}

function journey(nodes: ProjectJourneyNode[]): ProjectJourney {
  const school = nodes.find((entry) => entry.kind === "school_application");
  const admission = nodes.find((entry) => entry.kind === "admission_case");
  return {
    edges:
      school && admission
        ? [
            {
              fromNodeId: school.id,
              id: `edge:${school.id}:${admission.id}`,
              kind: "school_admissions_link",
              toNodeId: admission.id,
            },
          ]
        : [],
    generatedAt: "2026-11-20T00:00:00.000Z",
    nodes,
    project: {
      id: projectId,
      purpose: { reasonCode: "project_purpose_not_recorded", state: "unknown" },
      revision: 1,
      serviceScope: { engagements: [], state: "available" },
      status: "active",
    },
    projectActions: [],
    projectIssues: [],
    schemaVersion: 1,
    sources: [],
    summary: {
      knownIncompleteWorkCount: 0,
      knownRecordCount: nodes.length,
      unknownProgressCount: 0,
      unavailableSourceCount: 0,
    },
    workflowProjection: {
      definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
      progress: {
        completedKnownApplicable: 0,
        coverage: "partial",
        definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
        knownApplicableTotal: 0,
        notApplicableCount: 0,
        percent: null,
        unavailableCount: 0,
        unknownApplicabilityCount: 0,
        unknownProgressCount: 0,
      },
      tasks: [
        workflowTask({
          workflowKind: "project_planning",
          stepKey: "project_goal",
          targetKind: "project",
          targetId: projectId,
        }),
        ...nodes.flatMap((entry) => {
          if (entry.kind === "route_entry") {
            return [];
          }
          return [
            workflowTask({
              workflowKind:
                entry.kind === "school_application"
                  ? "school_application"
                  : entry.kind === "admission_case"
                    ? "school_admissions"
                    : "student_500",
              stepKey:
                entry.kind === "school_application"
                  ? "planning"
                  : entry.kind === "admission_case"
                    ? "admissions_planning"
                    : "visa_planning",
              targetKind: entry.targetKind,
              targetId: entry.targetId,
            }),
          ];
        }),
      ],
    },
  } as unknown as ProjectJourney;
}

test("target reconciliation keeps a valid selection and chooses business work before routes", () => {
  const school = node("school:school-a", "school_application");
  const route = node("route:student500:student-a", "route_entry");
  const current = journey([route, school]);

  assert.equal(projectWorkbenchDefaultTargetId(current), school.id);
  assert.equal(reconcileProjectWorkbenchTarget(school.id, current), school.id);
  assert.equal(
    reconcileProjectWorkbenchTarget("stale-node", current),
    school.id
  );
  assert.equal(projectWorkbenchDefaultTargetId(journey([route])), route.id);
  assert.equal(projectWorkbenchNodeById(current, route.id), route);
  assert.equal(projectWorkbenchNodeById(current, "missing"), null);
});

test("panel mapping rejects cross-Project state and classifies only known target kinds", () => {
  const school = node("school:school-a", "school_application");
  const current = journey([school]);

  assert.equal(
    projectWorkbenchPanelKind(current, school, projectId),
    "school_application"
  );
  assert.equal(
    projectWorkbenchPanelKind(current, school, "another-project"),
    "unavailable"
  );
  assert.equal(projectWorkbenchPanelKind(current, null, projectId), "none");
  assert.equal(
    projectWorkbenchPanelKind(
      current,
      node("foreign", "admission_case"),
      projectId
    ),
    "unavailable"
  );
});

test("linked Admissions and recorded route relationships use explicit Project State edges", () => {
  const school = node("school:school-a", "school_application");
  const linked = node("admissions:case-linked", "admission_case");
  const independent = node("admissions:case-standalone", "admission_case");
  const route = node("route:school:school-a", "route_entry", "school:school-a");
  const current = journey([school, linked, independent, route]);

  assert.deepEqual([...linkedAdmissionsNodeIds(current)], [linked.id]);
  assert.deepEqual(
    recordedRoutesForTarget(current, school.id).map((entry) => entry.id),
    [route.id]
  );
  assert.equal(projectWorkbenchTargetGroupForNode(route), "schools");
  assert.equal(
    projectWorkbenchTargetGroupForNode(independent),
    "independent_admissions"
  );
});

test("workflow task selection binds to its exact existing Project target", () => {
  const schoolA = node("school:school-a", "school_application");
  const schoolB = node("school:school-b", "school_application");
  const student = node("student500:visa-a", "student500_application");
  const current = journey([schoolA, schoolB, student]);
  const schoolBTask = current.workflowProjection.tasks.find(
    (task) => task.targetId === schoolB.targetId
  );
  assert.ok(schoolBTask);
  assert.deepEqual(
    projectWorkbenchSelectionForWorkflowTask(current, schoolBTask.taskId),
    { targetNodeId: schoolB.id, taskId: schoolBTask.taskId }
  );
  assert.equal(
    projectWorkbenchSelectionForWorkflowTask(current, "stale-task-id"),
    null
  );
  const projectTask = current.workflowProjection.tasks[0];
  assert.deepEqual(
    projectWorkbenchSelectionForWorkflowTask(current, projectTask.taskId),
    { targetNodeId: null, taskId: projectTask.taskId }
  );
  assert.equal(current.nodes.length, 3);
});
