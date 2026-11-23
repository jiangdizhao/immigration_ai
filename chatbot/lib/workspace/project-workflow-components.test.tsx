import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ProjectWorkflowProgressDetails,
  ProjectWorkflowProgressSummary,
  ProjectWorkflowStepList,
  ProjectWorkflowTaskDetails,
} from "../../components/project-workflow-components";
import { getWorkspaceCopy } from "../workspace-copy";
import type { ProjectJourney, ProjectJourneyNode } from "./project-journey";
import type {
  ProjectProgressV1,
  WorkflowTaskProjectionV1,
} from "./project-workflows";
import {
  PROJECT_WORKFLOW_DEFINITION_VERSION,
  workflowTaskId,
} from "./project-workflows";

const projectId = "project-workflow-ui";
const timestamp = "2026-11-23T09:00:00.000Z";

function task(input: {
  stepKey: WorkflowTaskProjectionV1["stepKey"];
  workflowKind: WorkflowTaskProjectionV1["workflowKind"];
  targetKind: WorkflowTaskProjectionV1["targetKind"];
  targetId: string;
  applicability?: WorkflowTaskProjectionV1["applicability"];
  progress?: WorkflowTaskProjectionV1["progress"];
  reasonCodes?: string[];
  sourceRevision?: number;
  dependencies?: string[];
  responsibleActor?: WorkflowTaskProjectionV1["responsibleActor"];
}): WorkflowTaskProjectionV1 {
  const sourceRevisions =
    input.sourceRevision === undefined
      ? []
      : [
          {
            revision: input.sourceRevision,
            targetId: input.targetId,
            targetKind: input.targetKind,
          },
        ];
  return {
    actionability: "read_only",
    applicability: input.applicability ?? "applicable",
    definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
    dependencies: input.dependencies ?? [],
    dependencySemantics: input.dependencies?.length
      ? "recorded_relationship_only"
      : "none",
    panelKind: input.targetKind === "project" ? "planning" : "school",
    progress: input.progress ?? "needs_information",
    progressCreditKey: null,
    progressCreditOwner: true,
    projectId,
    reasonCodes: input.reasonCodes ?? ["school_course_source_unverified"],
    responsibleActor: input.responsibleActor ?? "customer",
    sourceRevision: input.sourceRevision ?? null,
    sourceRevisions,
    stepKey: input.stepKey,
    targetId: input.targetId,
    targetKind: input.targetKind,
    taskId: workflowTaskId(input),
    workflowKind: input.workflowKind,
  };
}

const schoolRecord = {
  applicationId: "school-a-application-001",
  course: { catalogId: null, title: "Recorded Diploma of Design" },
  institution: { catalogId: null, name: "Recorded School A" },
  intake: { id: null, label: "July 2027" },
  missingInformationCodes: ["course_details_missing"],
  package: {
    packageId: "package-a",
    version: 2,
    status: "stale",
    usable: false,
    contentSha256: "a".repeat(64),
    inputsSha256: "b".repeat(64),
    staleReasonCodes: ["material_inputs_changed"],
  },
  progress: "needs_information",
  provenance: { revision: 7 },
  source: {
    independentlyVerified: false,
    status: "unverified_customer_declared",
  },
  status: "stale",
} as unknown as NonNullable<ProjectJourneyNode["record"]>;

const schoolNode: ProjectJourneyNode = {
  actions: [],
  id: "school:school-a-application-001",
  issueCodes: [],
  kind: "school_application",
  missingInformationCodes: ["course_details_missing"],
  progress: "needs_information",
  provenance: null,
  record: schoolRecord,
  responsibleActor: "customer",
  route: null,
  sourceKey: "schoolApplications",
  subtitle: "Recorded Diploma of Design",
  targetId: "school-a-application-001",
  targetKind: "school_application",
  title: "Recorded School A",
};

const schoolTask = task({
  stepKey: "school_discovery",
  workflowKind: "school_application",
  targetKind: "school_application",
  targetId: schoolNode.targetId,
  applicability: "unavailable",
  progress: "unknown",
  reasonCodes: ["school_course_source_unverified"],
  sourceRevision: 7,
});

function progress(
  coverage: ProjectProgressV1["coverage"],
  percent: number | null
): ProjectProgressV1 {
  return {
    completedKnownApplicable: 1,
    coverage,
    definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
    knownApplicableTotal: 3,
    notApplicableCount: 1,
    percent,
    unavailableCount: 1,
    unknownApplicabilityCount: 2,
    unknownProgressCount: 0,
  };
}

const journey = {
  edges: [],
  generatedAt: timestamp,
  nodes: [schoolNode],
  project: {
    id: projectId,
    purpose: { reasonCode: "project_purpose_not_recorded", state: "unknown" },
    revision: 4,
    serviceScope: { engagements: [], state: "available" },
    status: "active",
  },
  projectActions: [],
  projectIssues: [],
  schemaVersion: 1,
  sources: [],
  summary: {
    knownIncompleteWorkCount: 1,
    knownRecordCount: 1,
    unknownProgressCount: 1,
    unavailableSourceCount: 0,
  },
  workflowProjection: {
    definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
    progress: progress("partial", null),
    tasks: [schoolTask],
  },
} as unknown as ProjectJourney;

test("workflow rail renders exact stable step identity and localized state", () => {
  const markup = renderToStaticMarkup(
    createElement(ProjectWorkflowStepList, {
      locale: "en",
      onSelectTask: () => undefined,
      selectedTaskId: schoolTask.taskId,
      tasks: [schoolTask],
    })
  );
  assert.match(markup, /data-testid="project-workflow-step"/u);
  assert.match(
    markup,
    new RegExp(schoolTask.taskId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u")
  );
  assert.match(markup, /School and course discovery/u);
  assert.match(markup, /Cannot determine from available sources/u);
  assert.match(
    markup,
    /Who acts next: You need to provide or confirm information/u
  );
  assert.match(markup, /aria-pressed="true"/u);
});

test("task details expose authorized School state, source uncertainty and revision", () => {
  const copy = getWorkspaceCopy("en").projectEntry.projectJourney;
  const markup = renderToStaticMarkup(
    createElement(ProjectWorkflowTaskDetails, {
      journey,
      journeyCopy: copy,
      locale: "en",
      task: schoolTask,
    })
  );
  assert.match(markup, /Recorded School A/u);
  assert.match(markup, /Recorded Diploma of Design/u);
  assert.match(markup, /Customer-declared, unverified/u);
  assert.match(markup, /July 2027/u);
  assert.match(
    markup,
    /school_application school-a-application-001 · revision 7/u
  );
  assert.match(
    markup,
    /No school submission or school receipt is recorded here/u
  );
  assert.match(
    markup,
    /Who acts next: You need to provide or confirm information/u
  );
  assert.doesNotMatch(markup, /search results|official course verified/iu);
});

test("Project planning details summarize recorded Offer/CoE and Student 500 routes", () => {
  const admissionRecord = {
    caseId: "admission-coe-route",
    outcomes: [
      {
        outcomeId: "coe-evidence-1",
        kind: "coe",
        state: "recorded",
        independentlyVerified: true,
        evidenceAttached: true,
        superseded: false,
      },
    ],
  } as unknown as NonNullable<ProjectJourneyNode["record"]>;
  const studentRecord = {
    applicationId: "student-external-route",
    entryRoute: "no_school_application",
    coeStatus: "reported_not_held",
  } as unknown as NonNullable<ProjectJourneyNode["record"]>;
  const admissionNode: ProjectJourneyNode = {
    ...schoolNode,
    id: "admissions:admission-coe-route",
    kind: "admission_case",
    record: admissionRecord,
    sourceKey: "schoolAdmissions",
    targetId: "admission-coe-route",
    targetKind: "school_admission_case",
    progress: "archived",
    title: "Recorded CoE provider",
  };
  const studentNode: ProjectJourneyNode = {
    ...schoolNode,
    id: "student500:student-external-route",
    kind: "student500_application",
    record: studentRecord,
    sourceKey: "student500",
    targetId: "student-external-route",
    targetKind: "student500_application",
    title: "Student 500",
  };
  const admissionRoute: ProjectJourneyNode = {
    ...admissionNode,
    id: "route:admissions:admission-coe-route",
    kind: "route_entry",
    route: {
      code: "existing_coe",
      kind: "existing_coe",
      parentNodeId: admissionNode.id,
    },
  };
  const studentRoute: ProjectJourneyNode = {
    ...studentNode,
    id: "route:student500:student-external-route",
    kind: "route_entry",
    route: {
      code: "no_school_application",
      kind: "no_school_application",
      parentNodeId: studentNode.id,
    },
  };
  const planningJourney = {
    ...journey,
    nodes: [
      schoolNode,
      admissionNode,
      admissionRoute,
      studentNode,
      studentRoute,
    ],
  } as ProjectJourney;
  const planningTask = task({
    stepKey: "project_goal",
    workflowKind: "project_planning",
    targetKind: "project",
    targetId: projectId,
  });
  const markup = renderToStaticMarkup(
    createElement(ProjectWorkflowTaskDetails, {
      journey: planningJourney,
      journeyCopy: getWorkspaceCopy("en").projectEntry.projectJourney,
      locale: "en",
      task: planningTask,
    })
  );

  assert.match(markup, /Recorded Offer\/CoE and Student 500 routes/u);
  assert.match(
    markup,
    /Existing CoE route · Authorized target: admission-coe-route/u
  );
  assert.match(markup, /M1 status: archived/u);
  assert.match(
    markup,
    /COE · recorded · Marked independently verified in the record · Evidence is attached/u
  );
  assert.match(
    markup,
    /No platform School Application required · Authorized target: student-external-route/u
  );
  assert.match(markup, /CoE status \(customer-reported\): Reported not held/u);
});

test("progress details disclose unknown and unavailable counts without a misleading bar", () => {
  const projection = {
    definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
    progress: {
      ...progress("partial", null),
      unknownProgressCount: 1,
    },
    tasks: [schoolTask],
  };
  const markup = renderToStaticMarkup(
    createElement(ProjectWorkflowProgressDetails, {
      locale: "en",
      projection,
    })
  );
  assert.match(markup, /1 of 3 known-applicable tasks complete/u);
  assert.match(markup, /data-variant="detailed"/u);
  assert.match(markup, /2 task\(s\) with unknown applicability/u);
  assert.match(markup, /1 unavailable task\(s\)/u);
  assert.match(markup, /1 not-applicable task\(s\)/u);
  assert.match(markup, /1 task\(s\) with unknown progress/u);
  assert.match(markup, /Unknown and unavailable work is excluded/u);
  assert.doesNotMatch(markup, /<progress/u);

  const complete = renderToStaticMarkup(
    createElement(ProjectWorkflowProgressDetails, {
      locale: "zh-CN",
      projection: { ...projection, progress: progress("complete", 33) },
    })
  );
  assert.match(complete, /<progress/u);
  assert.match(complete, /这些流程状态不代表法律资格/u);

  const linkedStudentTask = task({
    stepKey: "study_evidence_coe",
    workflowKind: "student_500",
    targetKind: "student500_application",
    targetId: "student-a",
    dependencies: [schoolTask.taskId],
  });
  const linkedMarkup = renderToStaticMarkup(
    createElement(ProjectWorkflowProgressDetails, {
      locale: "en",
      projection: {
        ...projection,
        tasks: [schoolTask, linkedStudentTask],
      },
    })
  );
  assert.match(linkedMarkup, /not a required order/u);
  assert.match(
    linkedMarkup,
    /School and course discovery · school_application school-a-application-001/u
  );
});

test("compact progress is a single horizontal count and coverage indicator", () => {
  const markup = renderToStaticMarkup(
    createElement(ProjectWorkflowProgressSummary, {
      compact: true,
      locale: "en",
      progress: progress("partial", null),
    })
  );
  assert.match(markup, /data-variant="compact"/u);
  assert.match(markup, /1 \/ 3 complete/u);
  assert.match(markup, /Partial stats/u);
  assert.match(markup, /1 of 3 known-applicable tasks complete/u);
  assert.match(
    markup,
    /Partial counts only\. Unknown and unavailable work is excluded from the denominator\./u
  );
  assert.doesNotMatch(markup, /task\(s\) with unknown applicability/u);
  assert.doesNotMatch(markup, /unavailable task\(s\)/u);
  assert.doesNotMatch(markup, /not-applicable task\(s\)/u);
  assert.doesNotMatch(markup, /task\(s\) with unknown progress/u);
  assert.doesNotMatch(markup, /<progress/u);

  const simplifiedChinese = renderToStaticMarkup(
    createElement(ProjectWorkflowProgressSummary, {
      compact: true,
      locale: "zh-CN",
      progress: progress("partial", null),
    })
  );
  const traditionalChinese = renderToStaticMarkup(
    createElement(ProjectWorkflowProgressSummary, {
      compact: true,
      locale: "zh-Hant",
      progress: progress("partial", null),
    })
  );
  assert.match(simplifiedChinese, /部分统计/u);
  assert.match(traditionalChinese, /部分統計/u);
  assert.match(simplifiedChinese, /已完成 1 \/ 3/u);
  assert.match(traditionalChinese, /已完成 1 \/ 3/u);
});
