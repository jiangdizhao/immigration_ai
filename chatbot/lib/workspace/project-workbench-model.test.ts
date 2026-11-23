import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectJourney, ProjectJourneyNode } from "./project-journey";
import {
  linkedAdmissionsNodeIds,
  projectWorkbenchDefaultTargetId,
  projectWorkbenchNodeById,
  projectWorkbenchPanelKind,
  projectWorkbenchTargetGroupForNode,
  reconcileProjectWorkbenchTarget,
  recordedRoutesForTarget,
} from "./project-workbench-model";

const projectId = "project-workbench-model";

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
