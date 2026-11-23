import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ProjectTaskWorkspacePanel,
  ProjectWorkbenchHeader,
  ProjectWorkbenchTargetRail,
} from "@/components/project-workbench";
import type {
  ProjectJourney,
  ProjectJourneyNode,
} from "@/lib/workspace/project-journey";
import type { ProjectJourneyClientLoad } from "@/lib/workspace/project-journey-client";
import type {
  ProjectState,
  ProjectStateAdmission,
  ProjectStateProvenance,
  ProjectStateSchoolApplication,
  ProjectStateStudent500,
} from "@/lib/workspace/project-state";
import { getWorkspaceCopy } from "@/lib/workspace-copy";

const projectId = "11111111-1111-4111-8111-111111111111";
const updatedAt = "2026-11-20T12:00:00.000Z";

function provenance(
  source: ProjectStateProvenance["source"],
  recordId: string
): ProjectStateProvenance {
  return {
    history: [],
    historyTruncated: false,
    latestEvent: null,
    recordId,
    revision: 3,
    source,
    updatedAt,
  };
}

const schoolRecord: ProjectStateSchoolApplication = {
  applicationId: "school-a",
  stage: "school_application",
  status: "in_progress",
  progress: "in_progress",
  institution: { catalogId: null, name: "Southern Coast University" },
  course: { catalogId: null, title: "Biomedical Nursing" },
  intake: { id: null, label: "July intake" },
  source: { independentlyVerified: false, status: "customer_reported" },
  missingInformationCodes: [],
  package: null,
  linkedAdmissionsCase: null,
  responsibleActor: "unknown",
  provenance: provenance("school_application", "school-a"),
};

const admissionRecord: ProjectStateAdmission = {
  caseId: "case-a",
  originKind: "school_application",
  linkedSchoolApplicationId: "school-a",
  schoolApplicationLinkState: "available",
  institutionName: "Southern Coast University",
  courseTitle: "Biomedical Nursing",
  intakeLabel: "July intake",
  serviceMode: "self_service",
  preparationState: "in_progress",
  progress: "in_progress",
  nextStepCodes: [],
  requirements: [],
  outcomes: [],
  externalActions: [],
  schoolReceipt: { state: "unrecorded" },
  responsibleActor: "external_institution",
  externalHandoff: { reasonCodes: [], status: "NOT_EVALUATED" },
  blockedReasonCodes: [],
  provenance: provenance("school_admission_case", "case-a"),
};

const studentRecord: ProjectStateStudent500 = {
  applicationId: "student-a",
  stage: "student500",
  status: "in_progress",
  progress: "in_progress",
  entryRoute: "existing_offer",
  routeState: "recorded",
  coeStatus: "unknown",
  schoolDependency: { reasonCode: "not_linked", state: "unknown" },
  missingInformationCodes: [],
  sourceVerification: "not_independently_verified",
  preparation: {
    state: "available",
    schoolContext: null,
    drafts: [
      {
        createdAt: updatedAt,
        draftId: "draft-a",
        stale: true,
        staleReasonCodes: ["source_changed"],
        version: 1,
      },
    ],
    snapshots: [],
  },
  responsibleActor: "unknown",
  provenance: provenance("student500_application", "student-a"),
};

function node(input: {
  id: string;
  kind: ProjectJourneyNode["kind"];
  title: string;
  sourceKey: ProjectJourneyNode["sourceKey"];
  parentNodeId?: string;
  issueCodes?: string[];
  action?: ProjectJourneyNode["actions"][number];
  record?: Exclude<ProjectJourneyNode["record"], null>;
}): ProjectJourneyNode {
  return {
    actions: input.action ? [input.action] : [],
    id: input.id,
    issueCodes: input.issueCodes ?? [],
    kind: input.kind,
    missingInformationCodes: [],
    progress: input.kind === "route_entry" ? "route_recorded" : "in_progress",
    provenance: {
      history: [],
      historyTruncated: false,
      latestEvent: null,
      recordId: input.id,
      revision: 3,
      source: input.sourceKey,
      updatedAt,
    } as unknown as ProjectJourneyNode["provenance"],
    record: input.record ?? null,
    responsibleActor: "customer",
    route:
      input.kind === "route_entry"
        ? {
            code: "existing_offer",
            kind: "existing_offer",
            parentNodeId: input.parentNodeId ?? "school:school-a",
          }
        : null,
    sourceKey: input.sourceKey,
    subtitle: null,
    targetId: input.id.split(":").slice(1).join(":"),
    targetKind:
      input.kind === "school_application"
        ? "school_application"
        : input.kind === "admission_case"
          ? "school_admission_case"
          : "student500_application",
    title: input.title,
  };
}

function buildJourney(status: "active" | "closed" = "active"): ProjectJourney {
  const school = node({
    action: {
      actionability: "advisory",
      code: "review_course",
      reasonCode: "course_needs_review",
      responsibleActor: "customer",
      targetId: "school-a",
      targetKind: "school_application",
    },
    id: "school:school-a",
    issueCodes: ["package_outdated"],
    kind: "school_application",
    sourceKey: "schoolApplications",
    title: "Southern Coast University",
  });
  const admission = node({
    id: "admissions:case-a",
    kind: "admission_case",
    sourceKey: "schoolAdmissions",
    title: "Southern Coast University Admissions",
  });
  const route = node({
    id: "route:school:school-a",
    kind: "route_entry",
    parentNodeId: school.id,
    sourceKey: "schoolApplications",
    title: "",
  });
  const sourceKeys: ProjectJourney["sources"][number]["key"][] = [
    "schoolApplications",
    "schoolAdmissions",
    "student500",
    "student500Preparation",
    "projectFacts",
    "projectDocuments",
    "submissionPackages",
    "serviceEngagements",
  ];
  return {
    edges: [
      {
        fromNodeId: school.id,
        id: "edge:school-admissions",
        kind: "school_admissions_link",
        toNodeId: admission.id,
      },
      {
        fromNodeId: route.id,
        id: "edge:recorded-route",
        kind: "recorded_route",
        toNodeId: school.id,
      },
    ],
    generatedAt: updatedAt,
    nodes: [school, admission, route],
    project: {
      id: projectId,
      purpose: { reasonCode: "project_purpose_not_recorded", state: "unknown" },
      revision: 5,
      serviceScope: { engagements: [], state: "available" },
      status,
    },
    projectActions: [],
    projectIssues: [],
    schemaVersion: "phase15.project-state.v1",
    sources: sourceKeys.map((key) => ({
      key,
      reasonCode: key === "projectFacts" ? "disabled" : null,
      recordCount:
        key === "schoolApplications"
          ? 1
          : key === "schoolAdmissions"
            ? 1
            : key === "student500"
              ? 0
              : null,
      state: key === "projectFacts" ? "disabled" : "available",
    })),
    summary: {
      knownIncompleteWorkCount: 1,
      knownRecordCount: 2,
      unknownProgressCount: 1,
      unavailableSourceCount: 1,
    },
  } as ProjectJourney;
}

function readyLoad(journey: ProjectJourney): ProjectJourneyClientLoad {
  return {
    journey,
    projectId,
    requestId: 1,
    state: {} as ProjectState,
    status: "ready",
  };
}

function renderRail(
  journey = buildJourney(),
  selectedNodeId = "school:school-a"
) {
  const copy = getWorkspaceCopy("en").projectEntry;
  return renderToStaticMarkup(
    React.createElement(ProjectWorkbenchTargetRail, {
      journeyCopy: copy.projectJourney,
      journeyLoad: readyLoad(journey),
      onRefresh: () => undefined,
      onSelectTarget: () => undefined,
      selectedNodeId,
      workbenchCopy: copy.projectWorkbench,
    })
  );
}

test("the target rail groups linked Admissions under its school and keeps source unavailability distinct from empty", () => {
  const markup = renderRail();
  assert.match(markup, /data-testid="project-target-rail"/u);
  assert.match(markup, /data-testid="project-target-school_application"/u);
  assert.match(markup, /data-testid="project-target-admission_case"/u);
  assert.match(markup, /data-testid="project-target-admissions-linked"/u);
  assert.match(markup, /Southern Coast University Admissions/u);
  assert.match(markup, /data-testid="project-target-route_entry"/u);
  assert.match(markup, /data-testid="project-workbench-source-projectFacts"/u);
  assert.match(markup, /Student 500 preparation/u);
  assert.match(markup, /No records are currently available in readable areas/u);
  assert.doesNotMatch(markup, /projectFacts[\s\S]*?No records are available/u);
});

test("the task panel shows selected matter metadata and navigates to existing sections only", () => {
  const copy = getWorkspaceCopy("en").projectEntry;
  const markup = renderToStaticMarkup(
    React.createElement(ProjectTaskWorkspacePanel, {
      journeyCopy: copy.projectJourney,
      journeyLoad: readyLoad(buildJourney()),
      locale: "en",
      navigationBusy: false,
      onOpenWorkspace: () => undefined,
      onRefresh: () => undefined,
      onReturnToTarget: () => undefined,
      projectId,
      projectView: "home",
      selectedNodeId: "school:school-a",
      workbenchCopy: copy.projectWorkbench,
    })
  );
  assert.match(markup, /data-testid="project-task-workspace"/u);
  assert.match(markup, /data-testid="project-task-selected"/u);
  assert.match(markup, /Southern Coast University/u);
  assert.match(markup, /Recorded issues/u);
  assert.match(markup, /Useful next step/u);
  assert.match(markup, /This only opens the existing business page/u);
  assert.match(markup, /data-testid="project-task-recorded-relations"/u);
  assert.match(markup, /data-testid="project-task-next-actions"/u);
  assert.match(markup, /Open existing workspace/u);
  assert.doesNotMatch(markup, /<input|<textarea|data-testid=".*submit/u);
});

test("School, Admissions and Student 500 selections show distinct read-only record details", () => {
  const copy = getWorkspaceCopy("en").projectEntry;
  const journey = buildJourney();
  const school = journey.nodes.find((entry) => entry.id === "school:school-a");
  const admission = journey.nodes.find(
    (entry) => entry.id === "admissions:case-a"
  );
  assert.ok(school);
  assert.ok(admission);
  school.record = schoolRecord;
  admission.record = admissionRecord;
  journey.nodes.push(
    node({
      id: "student500:student-a",
      kind: "student500_application",
      sourceKey: "student500",
      title: "Student 500 application",
      record: studentRecord,
    })
  );
  journey.sources = journey.sources.map((source) =>
    source.key === "student500" ? { ...source, recordCount: 1 } : source
  );
  journey.summary.knownRecordCount = 3;

  const renderTarget = (selectedNodeId: string) =>
    renderToStaticMarkup(
      React.createElement(ProjectTaskWorkspacePanel, {
        journeyCopy: copy.projectJourney,
        journeyLoad: readyLoad(journey),
        locale: "en",
        navigationBusy: false,
        onOpenWorkspace: () => undefined,
        onRefresh: () => undefined,
        onReturnToTarget: () => undefined,
        projectId,
        projectView: "home",
        selectedNodeId,
        workbenchCopy: copy.projectWorkbench,
      })
    );

  const schoolMarkup = renderTarget("school:school-a");
  const admissionsMarkup = renderTarget("admissions:case-a");
  const studentMarkup = renderTarget("student500:student-a");

  assert.match(schoolMarkup, /data-testid="project-task-school-details"/u);
  assert.match(schoolMarkup, /Biomedical Nursing/u);
  assert.match(
    admissionsMarkup,
    /data-testid="project-task-admissions-details"/u
  );
  assert.match(
    admissionsMarkup,
    /A handoff status does not confirm that a school received an application/u
  );
  assert.match(studentMarkup, /data-testid="project-task-student500-details"/u);
  assert.match(studentMarkup, /1 draft\(s\) and 0 snapshot\(s\) are recorded/u);
  assert.match(
    studentMarkup,
    /do not show that an application was lodged or a visa granted/u
  );
  assert.doesNotMatch(
    schoolMarkup + admissionsMarkup + studentMarkup,
    /<input|<textarea|data-testid=".*submit/u
  );
});

test("closed Projects retain history details while suppressing section entry", () => {
  const copy = getWorkspaceCopy("en").projectEntry;
  const journey = buildJourney("closed");
  const school = journey.nodes.find((entry) => entry.id === "school:school-a");
  assert.ok(school);
  school.record = schoolRecord;
  school.provenance = {
    ...provenance("school_application", "school-a"),
    history: [
      {
        createdAt: updatedAt,
        eventType: "school_application_updated",
        revision: 4,
        subjectId: "school-a",
        subjectKind: "school_application",
      },
    ],
  };
  const markup = renderToStaticMarkup(
    React.createElement(ProjectTaskWorkspacePanel, {
      journeyCopy: copy.projectJourney,
      journeyLoad: readyLoad(journey),
      locale: "en",
      navigationBusy: false,
      onOpenWorkspace: () => undefined,
      onRefresh: () => undefined,
      onReturnToTarget: () => undefined,
      projectId,
      projectView: "home",
      selectedNodeId: "school:school-a",
      workbenchCopy: copy.projectWorkbench,
    })
  );
  assert.match(markup, /data-testid="project-task-closed-read-only"/u);
  assert.match(markup, /This Project is closed/u);
  assert.match(markup, /data-testid="project-task-school-details"/u);
  assert.match(markup, /Biomedical Nursing/u);
  assert.match(markup, /data-testid="project-task-record-history"/u);
  assert.match(markup, /school application updated/u);
  assert.match(markup, /Revision 4/u);
  assert.doesNotMatch(
    markup,
    /data-testid="project-task-open-existing-workspace"/u
  );
  assert.doesNotMatch(markup, /Open existing workspace/u);
  assert.doesNotMatch(markup, /<input|<textarea|data-testid=".*submit/u);
});

test("an unavailable Project State read does not render stale target metadata", () => {
  const copy = getWorkspaceCopy("en").projectEntry;
  const failedLoad: ProjectJourneyClientLoad = {
    projectId,
    reason: "unauthorized",
    requestId: 2,
    status: "failed",
  };
  const rail = renderToStaticMarkup(
    React.createElement(ProjectWorkbenchTargetRail, {
      journeyCopy: copy.projectJourney,
      journeyLoad: failedLoad,
      onRefresh: () => undefined,
      onSelectTarget: () => undefined,
      selectedNodeId: "school:school-a",
      workbenchCopy: copy.projectWorkbench,
    })
  );
  const task = renderToStaticMarkup(
    React.createElement(ProjectTaskWorkspacePanel, {
      journeyCopy: copy.projectJourney,
      journeyLoad: failedLoad,
      locale: "en",
      navigationBusy: false,
      onOpenWorkspace: () => undefined,
      onRefresh: () => undefined,
      onReturnToTarget: () => undefined,
      projectId,
      projectView: "home",
      selectedNodeId: "school:school-a",
      workbenchCopy: copy.projectWorkbench,
    })
  );
  assert.match(rail, /data-testid="project-target-rail-unavailable"/u);
  assert.match(task, /data-testid="project-task-unavailable"/u);
  assert.doesNotMatch(rail + task, /Southern Coast University/u);
  assert.doesNotMatch(
    rail + task,
    /data-testid="project-target-school_application"/u
  );
});

test("the Project header presents unknown progress honestly and reuses the same progress projection", () => {
  const copy = getWorkspaceCopy("en").projectEntry;
  const markup = renderToStaticMarkup(
    React.createElement(ProjectWorkbenchHeader, {
      enabledSections: {
        admissions: true,
        applications: true,
        student500: true,
      },
      journeyCopy: copy.projectJourney,
      journeyLoad: readyLoad(buildJourney()),
      locale: "en",
      mobileSurface: "chat",
      navigationBusy: false,
      onMobileSurfaceChange: () => undefined,
      onRefresh: () => undefined,
      onSelectNode: () => undefined,
      onSelectView: () => undefined,
      project: {
        createdAt: updatedAt,
        displayName: "Review Project",
        id: projectId,
        revision: 5,
        status: "active",
        updatedAt,
      },
      projectId,
      selectedNodeId: null,
      workbenchCopy: copy.projectWorkbench,
    })
  );
  assert.match(markup, /data-testid="project-workbench-header"/u);
  assert.match(markup, /Review Project/u);
  assert.match(markup, /Project goal is not recorded/u);
  assert.match(markup, /Known records: 2/u);
  assert.match(markup, /data-testid="view-project-progress"/u);
  assert.match(markup, /data-testid="project-mobile-chat-tab-label"/u);
  assert.match(markup, /data-testid="project-mobile-task-tab-label"/u);
  assert.match(
    markup,
    /aria-pressed="true"[^>]*data-testid="project-mobile-chat-tab-label"/u
  );
  assert.doesNotMatch(markup, /\b\d+\s*\/\s*\d+\b/u);
});
