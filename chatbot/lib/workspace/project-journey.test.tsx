import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectGuidedJourneyContent } from "@/components/project-guided-journey";
import {
  buildProjectJourney,
  parseProjectStateResponse,
  projectJourneyFailureForStatus,
  projectJourneyLoadReducer,
  projectJourneySelectionReducer,
  projectJourneyStateRequest,
  projectJourneyViewForAction,
} from "@/lib/workspace/project-journey";
import {
  PROJECT_STATE_SCHEMA_VERSION,
  type ProjectState,
  type ProjectStateAction,
  type ProjectStateAdmission,
  type ProjectStateProvenance,
  type ProjectStateSchoolApplication,
  type ProjectStateStudent500,
} from "@/lib/workspace/project-state";
import { getWorkspaceCopy } from "@/lib/workspace-copy";

const projectId = "project-journey-test";
const updatedAt = "2026-11-20T12:00:00.000Z";

function provenance(
  source: ProjectStateProvenance["source"],
  recordId: string,
  historyTruncated = false
): ProjectStateProvenance {
  return {
    history: [],
    historyTruncated,
    latestEvent: null,
    recordId,
    revision: 4,
    source,
    updatedAt,
  };
}

function schoolApplication(input: {
  id: string;
  institution: string;
  intake: string;
  progress?: ProjectStateSchoolApplication["progress"];
  missing?: string[];
  archived?: boolean;
  truncated?: boolean;
  linkedAdmission?: ProjectStateAdmission | null;
}): ProjectStateSchoolApplication {
  return {
    applicationId: input.id,
    course: { catalogId: null, title: `${input.institution} nursing course` },
    institution: { catalogId: null, name: input.institution },
    intake: { id: null, label: input.intake },
    linkedAdmissionsCase: input.linkedAdmission ?? null,
    missingInformationCodes: input.missing ?? [],
    package: null,
    progress: input.archived ? "archived" : (input.progress ?? "in_progress"),
    provenance: provenance("school_application", input.id, input.truncated),
    responsibleActor: "unknown",
    source: { independentlyVerified: false, status: "customer_reported" },
    stage: "school_application",
    status: input.archived ? "archived" : "draft",
  };
}

function admission(input: {
  id: string;
  origin?: ProjectStateAdmission["originKind"];
  linkedSchoolId?: string | null;
  linkState?: ProjectStateAdmission["schoolApplicationLinkState"];
  progress?: ProjectStateAdmission["progress"];
  outcomes?: ProjectStateAdmission["outcomes"];
}): ProjectStateAdmission {
  return {
    blockedReasonCodes: [],
    caseId: input.id,
    externalActions: [],
    externalHandoff: { reasonCodes: [], status: "NOT_EVALUATED" },
    institutionName: `Institution ${input.id}`,
    intakeLabel: null,
    linkedSchoolApplicationId: input.linkedSchoolId ?? null,
    nextStepCodes: [],
    originKind: input.origin ?? "school_application",
    outcomes: input.outcomes ?? [],
    preparationState: "not_started",
    progress: input.progress ?? "in_progress",
    provenance: provenance("school_admission_case", input.id),
    requirements: [],
    responsibleActor: "external_institution",
    schoolApplicationLinkState: input.linkState ?? "not_linked",
    schoolReceipt: { state: "unrecorded" },
    serviceMode: "self_service",
    courseTitle: null,
  };
}

function student500(input: {
  id: string;
  route?: string | null;
  dependency?: ProjectStateStudent500["schoolDependency"];
  progress?: ProjectStateStudent500["progress"];
}): ProjectStateStudent500 {
  const route =
    input.route === undefined ? "no_school_application" : input.route;
  return {
    applicationId: input.id,
    applicationPlace: "unknown",
    coeStatus: "unknown",
    entryRoute: route,
    missingInformationCodes: [],
    preparation: {
      drafts: [],
      schoolContext: null,
      snapshots: [],
      state: "not_recorded",
    },
    progress: input.progress ?? "in_progress",
    provenance: provenance("student500_application", input.id),
    responsibleActor: "unknown",
    routeState: route === null ? "unknown" : "recorded",
    schoolDependency: input.dependency ?? {
      reasonCode: "explicit_no_school_application_route",
      state: "not_applicable",
    },
    sourceVerification: "declared_pending_verification",
    stage: "student500",
    status: "in_progress",
  };
}

const availableCapability = { reasonCode: null, state: "available" as const };

type ProjectStateOverrides = Omit<
  Partial<ProjectState>,
  "capabilities" | "matters" | "project"
> & {
  capabilities?: Partial<ProjectState["capabilities"]>;
  matters?: Partial<ProjectState["matters"]>;
  project?: Partial<ProjectState["project"]>;
};

function state(overrides: ProjectStateOverrides = {}): ProjectState {
  const base: ProjectState = {
    capabilities: {
      projectDocuments: availableCapability,
      projectFacts: availableCapability,
      schoolAdmissions: availableCapability,
      schoolApplications: availableCapability,
      serviceEngagements: availableCapability,
      student500: availableCapability,
      student500Preparation: availableCapability,
      submissionPackages: { reasonCode: "not_supported", state: "unsupported" },
    },
    consistency: "live_per_source_revision",
    coverage: "current_actor_authorized_records",
    facts: { authorizedForAI: [], conflictCount: 0, state: "available" },
    generatedAt: updatedAt,
    matters: {
      schoolApplications: [],
      standaloneAdmissions: [],
      unresolvedLinkedAdmissions: [],
      student500Applications: [],
    },
    nextActions: [],
    project: {
      id: projectId,
      purpose: { reasonCode: "project_purpose_not_recorded", state: "unknown" },
      revision: 3,
      serviceScope: { engagements: [], state: "available" },
      status: "active",
    },
    schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
    unresolvedIssues: [],
  };
  return {
    ...base,
    ...overrides,
    capabilities: { ...base.capabilities, ...overrides.capabilities },
    matters: { ...base.matters, ...overrides.matters },
    project: { ...base.project, ...overrides.project },
  };
}

function stateAction(
  input: Partial<ProjectStateAction> = {}
): ProjectStateAction {
  return {
    actionability: "executable",
    code: "select_intake",
    reasonCode: "intake_not_selected",
    responsibleActor: "customer",
    targetId: "school-a",
    targetKind: "school_application",
    ...input,
  };
}

function renderJourney(
  projectState: ProjectState,
  locale: "en" | "zh-CN" = "en",
  enabledSections: Record<
    "applications" | "admissions" | "student500",
    boolean
  > = {
    applications: true,
    admissions: true,
    student500: true,
  }
) {
  const copy = getWorkspaceCopy(locale).projectEntry.projectJourney;
  return renderToStaticMarkup(
    React.createElement(ProjectGuidedJourneyContent, {
      copy,
      enabledSections,
      journey: buildProjectJourney(projectState),
      locale,
      navigationBusy: false,
      onRefresh: () => undefined,
      onSelectView: () => undefined,
    })
  );
}

test("J1 projects parallel school work, only the recorded Admissions link and an independent Student 500 route", () => {
  const linked = admission({
    id: "admissions-a",
    linkedSchoolId: "school-a",
    linkState: "available",
    origin: "school_application",
    progress: "waiting",
  });
  const schoolA = schoolApplication({
    id: "school-a",
    institution: "Northbridge University",
    intake: "2027",
    linkedAdmission: linked,
    missing: ["no_application_references"],
    progress: "needs_information",
  });
  const schoolB = schoolApplication({
    id: "school-b",
    institution: "Southern Institute",
    intake: "2028",
    progress: "in_progress",
  });
  const projectState = state({
    matters: {
      schoolApplications: [schoolA, schoolB],
      standaloneAdmissions: [],
      unresolvedLinkedAdmissions: [],
      student500Applications: [student500({ id: "student-1" })],
    },
    nextActions: [stateAction()],
    unresolvedIssues: [
      {
        code: "no_application_references",
        provenance: schoolA.provenance,
        targetId: "school-a",
        targetKind: "school_application",
      },
    ],
  });
  const journey = buildProjectJourney(projectState);

  assert.deepEqual(
    journey.nodes
      .filter((node) => node.kind === "school_application")
      .map((node) => [node.targetId, node.progress]),
    [
      ["school-a", "needs_information"],
      ["school-b", "in_progress"],
    ]
  );
  assert.deepEqual(
    journey.edges.filter((edge) => edge.kind === "school_admissions_link"),
    [
      {
        fromNodeId: "school:school-a",
        id: "edge:school:school-a:admissions:admissions-a:school-admissions",
        kind: "school_admissions_link",
        toNodeId: "admissions:admissions-a",
      },
    ]
  );
  assert.equal(
    journey.edges.some(
      (edge) =>
        edge.fromNodeId === "school:school-b" ||
        edge.toNodeId === "school:school-b"
    ),
    false
  );
  assert.equal(
    journey.nodes.some(
      (node) =>
        node.kind === "route_entry" &&
        node.route?.kind === "no_school_application"
    ),
    true
  );
  assert.equal(
    journey.edges.some((edge) => edge.kind === "student_school_dependency"),
    false
  );
  assert.deepEqual(
    journey.nodes.find((node) => node.targetId === "school-a")
      ?.missingInformationCodes,
    ["no_application_references"]
  );
  assert.equal(journey.summary.knownRecordCount, 4);

  const parsed = parseProjectStateResponse({ state: projectState }, projectId);
  assert.ok(parsed);
  assert.equal(
    parseProjectStateResponse({ state: projectState }, "other-project"),
    null
  );
});

test("J2 preserves alternate routes, unavailable links, archived and unknown states without implying completion", () => {
  const currentOffer = {
    evidenceAttached: true,
    independentlyVerified: false,
    kind: "offer" as const,
    outcomeId: "offer-current",
    provenance: "customer_reported",
    recordedAt: updatedAt,
    state: "received",
    superseded: false,
    version: 2,
  };
  const supersededOffer = {
    ...currentOffer,
    outcomeId: "offer-old",
    superseded: true,
    version: 1,
  };
  const offerCase = admission({
    id: "offer-case",
    origin: "existing_offer",
    outcomes: [supersededOffer, currentOffer],
  });
  const coeCase = admission({ id: "coe-case", origin: "existing_coe" });
  const unresolvedCase = admission({
    id: "unresolved-case",
    linkState: "unavailable",
  });
  const archivedSchool = schoolApplication({
    id: "archived-school",
    institution: "Archived College",
    intake: "2026",
    archived: true,
    truncated: true,
  });
  const projectState = state({
    capabilities: {
      projectFacts: { reasonCode: "source_timeout", state: "unavailable" },
      submissionPackages: {
        reasonCode: "access_restricted",
        state: "restricted",
      },
    },
    matters: {
      schoolApplications: [archivedSchool],
      standaloneAdmissions: [offerCase, coeCase],
      unresolvedLinkedAdmissions: [unresolvedCase],
      student500Applications: [
        student500({ id: "visa-only", progress: "unknown" }),
      ],
    },
  });
  const journey = buildProjectJourney(projectState);

  assert.equal(
    journey.nodes.find((node) => node.targetId === "archived-school")?.progress,
    "archived"
  );
  assert.equal(
    journey.nodes.find((node) => node.targetId === "visa-only")?.progress,
    "unknown"
  );
  assert.equal(
    journey.sources.find((source) => source.key === "submissionPackages")
      ?.state,
    "restricted"
  );
  assert.equal(
    journey.sources.find((source) => source.key === "projectFacts")
      ?.recordCount,
    null
  );
  assert.equal(journey.summary.unavailableSourceCount, 2);
  assert.equal(
    journey.edges.some((edge) => edge.kind === "school_admissions_link"),
    false
  );
  const unresolvedNode = journey.nodes.find(
    (node) => node.targetId === "unresolved-case"
  );
  assert.ok(
    unresolvedNode?.record &&
      "schoolApplicationLinkState" in unresolvedNode.record
  );
  assert.equal(unresolvedNode.record.schoolApplicationLinkState, "unavailable");
  const offerNode = journey.nodes.find(
    (node) => node.targetId === "offer-case"
  );
  assert.ok(offerNode?.record && "outcomes" in offerNode.record);
  assert.equal(offerNode.record.outcomes[0]?.superseded, true);
  assert.equal(
    journey.nodes.filter((node) => node.kind === "admission_case").length,
    3
  );

  const closed = state({
    project: { status: "closed" },
    nextActions: [],
    unresolvedIssues: [],
  });
  assert.equal(buildProjectJourney(closed).project.status, "closed");
  assert.equal(buildProjectJourney(closed).projectActions.length, 0);
});

test("source availability distinguishes an empty readable source from a restricted or unavailable source", () => {
  const empty = buildProjectJourney(state());
  assert.equal(
    empty.sources.find((source) => source.key === "schoolApplications")
      ?.recordCount,
    0
  );
  assert.equal(
    empty.sources.find((source) => source.key === "schoolApplications")?.state,
    "available"
  );

  const unreadableState = state({
    capabilities: {
      schoolApplications: { reasonCode: "feature_disabled", state: "disabled" },
    },
    matters: { schoolApplications: null },
  });
  const unreadable = buildProjectJourney(unreadableState);
  assert.equal(
    unreadable.sources.find((source) => source.key === "schoolApplications")
      ?.recordCount,
    null
  );
  const markup = renderJourney(unreadableState);
  assert.match(markup, /data-testid="journey-unavailable-schoolApplications"/u);
  assert.doesNotMatch(markup, /data-testid="project-journey-empty-schools"/u);
});

test("response validation fails closed for unsupported, mismatched, incomplete and cross-target data", () => {
  const valid = state();
  assert.ok(parseProjectStateResponse({ state: valid }, projectId));
  const validStudent500 = student500({ id: "visa-only" });
  const validStudentState = state({
    matters: { student500Applications: [validStudent500] },
  });
  assert.equal(
    parseProjectStateResponse({ state: validStudentState }, projectId)?.matters
      .student500Applications?.[0]?.applicationPlace,
    "unknown"
  );
  const invalidStudent500 = {
    ...validStudent500,
    applicationPlace:
      "unavailable" as ProjectStateStudent500["applicationPlace"],
  };
  assert.equal(
    parseProjectStateResponse(
      {
        state: state({
          matters: { student500Applications: [invalidStudent500] },
        }),
      },
      projectId
    ),
    null
  );
  assert.equal(
    parseProjectStateResponse(
      { state: { ...valid, schemaVersion: "future.v2" } },
      projectId
    ),
    null
  );
  assert.equal(
    parseProjectStateResponse(
      { state: { ...valid, project: { ...valid.project, id: "other" } } },
      projectId
    ),
    null
  );
  assert.equal(
    parseProjectStateResponse(
      { state: { ...valid, matters: undefined } },
      projectId
    ),
    null
  );

  const badActionTarget = state({
    nextActions: [stateAction({ targetId: "not-in-project" })],
  });
  assert.equal(
    parseProjectStateResponse({ state: badActionTarget }, projectId),
    null
  );

  const badSchoolLink = admission({
    id: "broken-link",
    linkedSchoolId: "missing-school",
    linkState: "available",
  });
  const invalidLinkState = state({
    matters: {
      schoolApplications: [],
      standaloneAdmissions: [badSchoolLink],
      unresolvedLinkedAdmissions: [],
    },
  });
  assert.equal(
    parseProjectStateResponse({ state: invalidLinkState }, projectId),
    null
  );
});

test("J3 load and selection reducers reject stale responses and reset removed node selections", () => {
  const controller = new AbortController();
  const request = projectJourneyStateRequest("project/a", controller.signal);
  assert.equal(request.url, "/api/projects/project%2Fa/state");
  assert.equal(request.init.cache, "no-store");
  assert.deepEqual(request.init.headers, { Accept: "application/json" });
  assert.equal(request.init.signal, controller.signal);
  assert.equal(projectJourneyFailureForStatus(401), "unauthorized");
  assert.equal(projectJourneyFailureForStatus(404), "not_found");
  assert.equal(projectJourneyFailureForStatus(503), "unavailable");

  const loading = projectJourneyLoadReducer(null, {
    type: "started",
    projectId: "project-a",
    requestId: 1,
  });
  const projectBLoading = projectJourneyLoadReducer(loading, {
    type: "started",
    projectId: "project-b",
    requestId: 2,
  });
  const stale = projectJourneyLoadReducer(projectBLoading, {
    type: "failed",
    projectId: "project-a",
    requestId: 1,
    reason: "network_error",
  });
  assert.equal(stale, projectBLoading);
  assert.deepEqual(
    projectJourneySelectionReducer("school-a", {
      type: "reconcile",
      availableNodeIds: ["school-b"],
      defaultNodeId: "school-b",
    }),
    "school-b"
  );
  assert.equal(
    projectJourneySelectionReducer("school-a", {
      type: "select",
      nodeId: "missing-node",
      availableNodeIds: ["school-a"],
    }),
    "school-a"
  );
  assert.equal(
    projectJourneyViewForAction(stateAction({ code: "select_intake" })),
    "applications"
  );
});

test("J1/J2 central journey markup is localized, accessible and explicit about provenance limits", () => {
  const linked = admission({
    id: "admissions-a",
    linkedSchoolId: "school-a",
    linkState: "available",
  });
  const schoolA = schoolApplication({
    id: "school-a",
    institution:
      "Northbridge University with a deliberately long institution name",
    intake: "2027",
    linkedAdmission: linked,
    missing: ["no_application_references"],
    progress: "needs_information",
    truncated: true,
  });
  const offerCase = admission({
    id: "offer-case",
    origin: "existing_offer",
    outcomes: [
      {
        evidenceAttached: false,
        independentlyVerified: false,
        kind: "offer",
        outcomeId: "offer-old",
        provenance: "customer_reported",
        recordedAt: updatedAt,
        state: "received",
        superseded: true,
        version: 1,
      },
    ],
  });
  const projectState = state({
    matters: {
      schoolApplications: [schoolA],
      standaloneAdmissions: [offerCase],
      unresolvedLinkedAdmissions: [],
      student500Applications: [student500({ id: "visa-only" })],
    },
    nextActions: [stateAction()],
    unresolvedIssues: [
      {
        code: "no_application_references",
        provenance: schoolA.provenance,
        targetId: "school-a",
        targetKind: "school_application",
      },
    ],
  });
  const en = renderJourney(projectState);
  assert.match(en, /School Applications · parallel work/u);
  assert.match(en, /Needs information/u);
  assert.match(
    en,
    /An intake has not been selected\.|School Application details have not been added\./u
  );
  assert.match(en, /data-testid="journey-history-truncated"/u);
  assert.match(en, /data-testid="journey-node-relationships"/u);
  assert.match(en, /data-testid="journey-next-action"/u);
  assert.match(en, /aria-pressed="true"/u);
  assert.match(en, /data-testid="journey-open-related-section"/u);

  const disabledSectionMarkup = renderJourney(projectState, "en", {
    applications: false,
    admissions: true,
    student500: true,
  });
  assert.doesNotMatch(
    disabledSectionMarkup,
    /data-testid="journey-open-related-section"/u
  );
  assert.match(
    disabledSectionMarkup,
    /workspace for this step is not currently available/u
  );

  const advisoryState = state({
    ...projectState,
    nextActions: [stateAction({ actionability: "advisory" })],
  });
  const advisoryMarkup = renderJourney(advisoryState);
  assert.doesNotMatch(
    advisoryMarkup,
    /data-testid="journey-open-related-section"/u
  );
  assert.match(
    advisoryMarkup,
    /This is guidance; the available handling has not been established\./u
  );

  const offerMarkup = renderJourney(
    state({
      ...projectState,
      matters: { ...projectState.matters, schoolApplications: [] },
      nextActions: [
        stateAction({
          code: "record_offer_or_exception",
          targetId: "offer-case",
          targetKind: "school_admission_case",
        }),
      ],
    })
  );
  assert.match(
    offerMarkup,
    /superseded by a later record; not the current outcome/iu
  );
  assert.match(offerMarkup, /No institutional receipt has been recorded\./u);

  const studentMarkup = renderJourney(
    state({
      ...projectState,
      nextActions: [
        stateAction({
          code: "provide_student500_information",
          targetId: "visa-only",
          targetKind: "student500_application",
        }),
      ],
    })
  );
  assert.match(
    studentMarkup,
    /do not show that an application was lodged or a visa granted/u
  );

  const zh = renderJourney(projectState, "zh-CN");
  assert.match(zh, /学校申请（可并行）/u);
  assert.match(zh, /需要补充信息/u);
  assert.doesNotMatch(zh, /School Applications · parallel work/u);

  const zhOffer = renderJourney(
    state({
      ...projectState,
      matters: { ...projectState.matters, schoolApplications: [] },
      nextActions: [
        stateAction({
          code: "record_offer_or_exception",
          targetId: "offer-case",
          targetKind: "school_admission_case",
        }),
      ],
    }),
    "zh-CN"
  );
  assert.match(zhOffer, /已被后续记录取代/u);
  assert.doesNotMatch(zhOffer, /superseded by a later record/u);
});

test("closed Projects suppress next-action navigation while retaining readable history", () => {
  const school = schoolApplication({
    id: "school-a",
    institution: "Northbridge University",
    intake: "2027",
    truncated: true,
  });
  const closed = state({
    project: { status: "closed" },
    matters: { schoolApplications: [school] },
    nextActions: [],
    unresolvedIssues: [],
  });
  const markup = renderJourney(closed);
  assert.match(markup, /data-testid="project-guided-journey-closed"/u);
  assert.match(
    markup,
    /This Project is closed; new business actions cannot be started\./u
  );
  assert.doesNotMatch(markup, /data-testid="journey-open-related-section"/u);
  assert.match(markup, /data-testid="journey-history-truncated"/u);
});
