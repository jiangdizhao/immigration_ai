import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProjectAssistantContext } from "../projects/project-assistant-context";
import { SCHOOL_ADMISSIONS_NEXT_STEPS } from "../school-admissions/contracts";
import {
  buildRequirementChecklist,
  type SchoolAdmissionsPreparationInputs,
} from "../school-admissions/workflow";
import { readyApplication } from "../school-admissions-integration/fixtures";
import { createM5IntegrationHarness } from "../school-admissions-integration/harness";
import { schoolApplicationMissingDataCodes } from "../school-applications/contracts";
import {
  createSchoolApplicationService,
  type SchoolApplicationDetailView,
} from "../school-applications/service";
import { createInMemoryStudent500Store } from "../student-500/in-memory-store";
import { createDeclaredStudent500LegalSourceProvider } from "../student-500/legal-source-provider";
import { createStudent500RequirementResolver } from "../student-500/requirement-resolver";
import { createStudent500Service } from "../student-500/service";
import {
  buildProjectState,
  PROJECT_STATE_MAX_CONCURRENT_DETAIL_READS,
  PROJECT_STATE_MAX_HISTORY_PER_RECORD,
  type ProjectState,
  type ProjectStateAdmissionInput,
  type ProjectStateCapability,
  type ProjectStateInput,
  type ProjectStatePreparationInput,
  type ProjectStateSchoolApplicationInput,
  type ProjectStateStudent500Input,
} from "./project-state";
import { createProjectStateHttpHandler } from "./project-state-http";
import {
  mapWithConcurrency,
  projectStateSourceFailure,
} from "./project-state-load-utils";
import { student500ProjectStateInput } from "./project-state-student500-adapter";

const project = { id: "project-a", revision: 17, status: "active" } as const;
const generatedAt = "2026-11-21T10:00:00.000Z";

const capabilities: ProjectStateInput["capabilities"] = {
  projectDocuments: { reasonCode: null, state: "available" },
  projectFacts: { reasonCode: null, state: "available" },
  schoolAdmissions: { reasonCode: null, state: "available" },
  schoolApplications: { reasonCode: null, state: "available" },
  serviceEngagements: { reasonCode: null, state: "available" },
  student500: { reasonCode: null, state: "available" },
  student500Preparation: { reasonCode: null, state: "available" },
  submissionPackages: { reasonCode: "not_listed", state: "unsupported" },
};

function schoolApplication(input: {
  id: string;
  revision: number;
  intakeLabel: string;
  updatedAt: string;
  packageUsable: boolean;
  packageStaleReasons?: readonly string[];
  archived?: boolean;
  noPackage?: boolean;
  missingDataCodes?: readonly string[];
  projectId?: string;
  events?: ProjectStateSchoolApplicationInput["events"];
}): ProjectStateSchoolApplicationInput {
  return {
    applicationId: input.id,
    archivedAt: input.archived ? "2026-11-20T00:00:00.000Z" : null,
    course: { catalogId: "course-1", title: "Nursing" },
    createdAt: "2026-11-01T00:00:00.000Z",
    latestPackage: input.noPackage
      ? null
      : {
          contentSha256: "a".repeat(64),
          inputsSha256: "b".repeat(64),
          packageId: `package-${input.id}`,
          staleReasonCodes: input.packageStaleReasons ?? [],
          status: input.packageUsable ? "current" : "stale",
          usable: input.packageUsable,
          version: 1,
        },
    events: input.events ?? [],
    institution: { catalogId: "institution-1", name: "Northbridge University" },
    intake: { id: null, label: input.intakeLabel },
    missingDataCodes: input.missingDataCodes ?? [],
    packageStale: input.noPackage ? false : !input.packageUsable,
    projectId: input.projectId ?? project.id,
    revision: input.revision,
    source: { status: "unverified_customer_declared" },
    staleReasonCodes: input.packageStaleReasons ?? [],
    status: input.archived
      ? "archived"
      : input.noPackage
        ? "draft"
        : input.packageUsable
          ? "package_prepared"
          : "stale",
    updatedAt: input.updatedAt,
  };
}

function schoolApplicationFromService(
  detail: SchoolApplicationDetailView
): ProjectStateSchoolApplicationInput {
  const latestPackage = detail.currentPackage ?? detail.packages[0] ?? null;
  return {
    applicationId: detail.applicationId,
    archivedAt: detail.archivedAt,
    course: detail.course,
    createdAt: detail.createdAt,
    latestPackage: latestPackage
      ? {
          contentSha256: latestPackage.contentSha256,
          inputsSha256: latestPackage.inputsSha256,
          packageId: latestPackage.packageId,
          staleReasonCodes:
            latestPackage.staleReasonCodes.length > 0
              ? latestPackage.staleReasonCodes
              : detail.staleReasonCodes,
          status: latestPackage.status,
          usable: latestPackage.usable,
          version: latestPackage.version,
        }
      : null,
    events: detail.events.map((event) => ({
      createdAt: event.createdAt,
      eventType: event.eventType,
      revision: event.applicationRevision,
      subjectId: event.subjectId,
      subjectKind: event.subjectKind,
    })),
    institution: detail.institution,
    intake: detail.intake,
    missingDataCodes: detail.missingDataCodes,
    packageStale: detail.packageStale,
    projectId: detail.projectId,
    revision: detail.revision,
    source: { status: detail.source.status },
    staleReasonCodes: detail.staleReasonCodes,
    status: detail.status,
    updatedAt: detail.updatedAt,
  };
}

function admission(input: {
  id: string;
  originKind: ProjectStateAdmissionInput["originKind"];
  applicationId?: string | null;
  outcome?: "offer" | "coe";
  nextStepCodes?: readonly string[];
  serviceMode?: "self_service" | "managed_service";
  readiness?: "READY" | "NOT_READY" | "UNKNOWN" | "NOT_EVALUATED";
  preparationState?: string;
}): ProjectStateAdmissionInput {
  const outcome = input.outcome
    ? {
        evidenceAttached: false,
        independentlyVerified: false,
        kind: input.outcome,
        outcomeId: `${input.id}-${input.outcome}`,
        provenance: "customer_reported",
        recordedAt: "2026-11-20T00:00:00.000Z",
        state: input.outcome === "offer" ? "received" : "obtained",
        superseded: false,
        version: 1,
      }
    : null;
  return {
    applicationId: input.applicationId ?? null,
    caseId: input.id,
    coe: input.outcome === "coe" ? outcome : null,
    courseTitle: null,
    createdAt: "2026-11-20T00:00:00.000Z",
    events: [],
    externalActions: [],
    institutionName: "Reported institution",
    intakeLabel: null,
    managedReadiness: {
      reasonCodes:
        input.readiness === "NOT_READY" ? ["provider_unavailable"] : [],
      status: input.readiness ?? "NOT_EVALUATED",
    },
    nextStepCodes: input.nextStepCodes ?? [],
    offer: input.outcome === "offer" ? outcome : null,
    originKind: input.originKind,
    preparationStale: false,
    preparationState: input.preparationState ?? "not_started",
    projectId: project.id,
    requirements: [],
    revision: 1,
    serviceMode: input.serviceMode ?? "self_service",
    staleReasonCodes: [],
    updatedAt: "2026-11-20T00:00:00.000Z",
  };
}

function student500(input: {
  id: string;
  route: string | null;
  applicationPlace?: "onshore" | "offshore" | "unknown";
  schoolApplicationId?: string | null;
  projectId?: string;
  archived?: boolean;
}): ProjectStateStudent500Input {
  return {
    applicationId: input.id,
    archivedAt: input.archived ? "2026-11-20T00:00:00.000Z" : null,
    context: {
      applicationPlace: input.applicationPlace ?? "unknown",
      coeStatus: "unknown",
      entryRoute: input.route,
      schoolApplicationId: input.schoolApplicationId ?? null,
    },
    createdAt: "2026-11-19T00:00:00.000Z",
    events: [],
    projectId: input.projectId ?? project.id,
    revision: 1,
    screening: {
      missingFactCodes: input.route === null ? ["study_evidence_route"] : [],
      sourceVerification: "declared_pending_verification",
    },
    status: input.archived ? "archived" : "in_progress",
    updatedAt: "2026-11-19T00:00:00.000Z",
  };
}

test("authorized Student 500 applicationPlace reaches M1 and bounded M2 context", async () => {
  const actorUserId = "11111111-1111-4111-8111-111111111101";
  const projectId = "22222222-2222-4222-8222-222222222201";
  const store = createInMemoryStudent500Store();
  store.seedActor(actorUserId, { registeredCustomer: true });
  store.seedProject(projectId, { ownerUserId: actorUserId, status: "active" });
  const service = createStudent500Service({
    resolver: createStudent500RequirementResolver({
      provider: createDeclaredStudent500LegalSourceProvider(),
    }),
    store,
  });

  const created = await service.create({
    actorUserId,
    context: { applicationPlace: "unknown" },
    operationId: "application-place-create",
    projectId,
  });
  const unknownDetail = await service.getProjectState({
    actorUserId,
    applicationId: created.application.applicationId,
    projectId,
  });
  assert.equal(unknownDetail.context.applicationPlace, "unknown");
  assert.equal(
    student500ProjectStateInput(unknownDetail).context.applicationPlace,
    "unknown"
  );
  const unknownState = buildProjectState(
    stateInput({
      project: { id: projectId, revision: 1, status: "active" },
      student500Applications: [student500ProjectStateInput(unknownDetail)],
    })
  );
  assert.equal(
    unknownState.matters.student500Applications?.[0]?.applicationPlace,
    "unknown"
  );
  const unknownPacket = buildProjectAssistantContext(
    unknownState,
    "project_state_unavailable",
    created.application.applicationId
  );
  assert.equal(
    unknownPacket.indexes.student500Applications?.[0]?.applicationPlace,
    "unknown"
  );
  assert.equal(
    unknownPacket.matters.student500Applications?.[0]?.applicationPlace,
    "unknown"
  );

  await service.update({
    actorUserId,
    applicationId: created.application.applicationId,
    context: { ...created.application.context, applicationPlace: "offshore" },
    expectedRevision: 1,
    operationId: "application-place-update",
    projectId,
  });
  const freshService = createStudent500Service({
    resolver: createStudent500RequirementResolver({
      provider: createDeclaredStudent500LegalSourceProvider(),
    }),
    store,
  });
  const persisted = await freshService.getProjectState({
    actorUserId,
    applicationId: created.application.applicationId,
    projectId,
  });
  assert.equal(persisted.revision, 2);
  assert.equal(persisted.context.applicationPlace, "offshore");

  const state = buildProjectState(
    stateInput({
      project: { id: projectId, revision: 2, status: "active" },
      student500Applications: [student500ProjectStateInput(persisted)],
    })
  );
  const projected = state.matters.student500Applications?.[0];
  assert.equal(projected?.provenance.revision, 2);
  assert.equal(projected?.applicationPlace, "offshore");

  const packet = buildProjectAssistantContext(
    state,
    "project_state_unavailable",
    created.application.applicationId
  );
  assert.equal(
    packet.indexes.student500Applications?.[0]?.applicationPlace,
    "offshore"
  );
  assert.equal(
    packet.matters.student500Applications?.[0]?.applicationPlace,
    "offshore"
  );
});

test("unavailable Student 500 source remains unavailable rather than unknown applicationPlace", () => {
  const state = buildProjectState(
    stateInput({
      capabilities: {
        ...capabilities,
        student500: {
          reasonCode: "student500_read_unavailable",
          state: "unavailable",
        },
        student500Preparation: {
          reasonCode: "student500_read_unavailable",
          state: "unavailable",
        },
      },
      project: {
        id: project.id,
        revision: project.revision,
        status: project.status,
      },
      student500Applications: null,
      student500PreparationCapability: "unavailable",
      student500Preparations: null,
    })
  );
  assert.equal(state.matters.student500Applications, null);
  const packet = buildProjectAssistantContext(state);
  assert.equal(packet.indexes.student500Applications, null);
  assert.equal(packet.matters.student500Applications, null);
  assert.doesNotMatch(JSON.stringify(packet), /applicationPlace/u);
});

function stateInput(
  input: {
    schoolApplications?: readonly ProjectStateSchoolApplicationInput[] | null;
    admissionsCases?: readonly ProjectStateAdmissionInput[] | null;
    student500Applications?: readonly ProjectStateStudent500Input[] | null;
    student500Preparations?: readonly ProjectStatePreparationInput[] | null;
    student500PreparationCapability?: ProjectStateInput["student500PreparationCapability"];
    serviceEngagements?: ProjectStateInput["serviceEngagements"];
    capabilities?: ProjectStateInput["capabilities"];
    project?: ProjectStateInput["project"];
  } = {}
): ProjectStateInput {
  return {
    admissionsCases:
      input.admissionsCases === undefined ? [] : input.admissionsCases,
    capabilities: input.capabilities ?? capabilities,
    facts: { authorizedForAI: [], conflictCount: 0, state: "available" },
    generatedAt,
    project: input.project ?? project,
    schoolApplications:
      input.schoolApplications === undefined ? [] : input.schoolApplications,
    serviceEngagements:
      input.serviceEngagements === undefined ? [] : input.serviceEngagements,
    student500Applications:
      input.student500Applications === undefined
        ? []
        : input.student500Applications,
    student500PreparationCapability:
      input.student500PreparationCapability ?? "available",
    student500Preparations: input.student500Preparations ?? [],
  };
}

test("multi-school state is freshly derived per application and retains invalidation provenance", () => {
  const before = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplication({
          id: "school-a",
          intakeLabel: "Semester 1 2027",
          packageUsable: true,
          revision: 2,
          updatedAt: "2026-11-18T00:00:00.000Z",
        }),
        schoolApplication({
          id: "school-b",
          intakeLabel: "Semester 2 2027",
          packageUsable: true,
          revision: 4,
          updatedAt: "2026-11-18T00:00:00.000Z",
        }),
      ],
    })
  );
  const changeEvent = {
    createdAt: "2026-11-21T09:00:00.000Z",
    eventType: "school_application_updated",
    revision: 3,
    subjectId: "school-a",
    subjectKind: "school_application",
  };
  const updatedInput = stateInput({
    schoolApplications: [
      schoolApplication({
        id: "school-a",
        intakeLabel: "Semester 2 2027",
        packageUsable: false,
        packageStaleReasons: ["material_inputs_changed"],
        revision: 3,
        updatedAt: changeEvent.createdAt,
        events: [changeEvent],
      }),
      schoolApplication({
        id: "school-b",
        intakeLabel: "Semester 2 2027",
        packageUsable: true,
        revision: 4,
        updatedAt: "2026-11-18T00:00:00.000Z",
      }),
    ],
  });
  const after = buildProjectState(updatedInput);
  const afterSchoolA = after.matters.schoolApplications?.find(
    (entry) => entry.applicationId === "school-a"
  );
  const afterSchoolB = after.matters.schoolApplications?.find(
    (entry) => entry.applicationId === "school-b"
  );
  assert.equal(afterSchoolA?.intake.label, "Semester 2 2027");
  assert.equal(afterSchoolA?.progress, "needs_information");
  assert.equal(afterSchoolA?.package?.usable, false);
  assert.deepEqual(afterSchoolA?.package?.staleReasonCodes, [
    "material_inputs_changed",
  ]);
  assert.equal(
    afterSchoolA?.provenance.latestEvent?.eventType,
    "school_application_updated"
  );
  assert.equal(afterSchoolA?.provenance.revision, 3);
  assert.equal(afterSchoolB?.provenance.revision, 4);
  assert.equal(afterSchoolB?.intake.label, "Semester 2 2027");
  assert.equal(afterSchoolB?.package?.usable, true);
  assert.deepEqual(
    afterSchoolB,
    before.matters.schoolApplications?.find(
      (entry) => entry.applicationId === "school-b"
    )
  );
  assert.ok(
    after.nextActions.some(
      (action) =>
        action.targetId === "school-a" &&
        action.code === "rebuild_preparation_package" &&
        action.reasonCode === "material_inputs_changed"
    )
  );
  // A fresh builder invocation over the same persisted service read has no cache drift.
  assert.deepEqual(buildProjectState(updatedInput), after);
});

test("closed Projects retain matter history while suppressing every executable action", () => {
  const historicalEvent = {
    createdAt: "2026-11-20T00:00:00.000Z",
    eventType: "school_application_updated",
    revision: 2,
    subjectId: "closed-school",
    subjectKind: "school_application",
  };
  const state = buildProjectState(
    stateInput({
      project: { id: project.id, revision: 18, status: "closed" },
      schoolApplications: [
        schoolApplication({
          id: "closed-school",
          intakeLabel: "Semester 1 2027",
          packageUsable: false,
          packageStaleReasons: ["material_inputs_changed"],
          revision: 2,
          updatedAt: historicalEvent.createdAt,
          events: [historicalEvent],
        }),
      ],
      admissionsCases: [
        admission({
          id: "closed-case",
          applicationId: "closed-school",
          originKind: "school_application",
          outcome: "offer",
          nextStepCodes: ["review_offer_conditions"],
        }),
      ],
      student500Applications: [student500({ id: "closed-visa", route: null })],
    })
  );
  assert.equal(state.project.status, "closed");
  assert.equal(
    state.matters.schoolApplications?.[0]?.provenance.history.length,
    1
  );
  assert.equal(
    state.matters.schoolApplications?.[0]?.linkedAdmissionsCase?.outcomes[0]
      ?.provenance,
    "customer_reported"
  );
  assert.equal(state.matters.student500Applications?.length, 1);
  assert.deepEqual(state.nextActions, []);
  assert.deepEqual(state.unresolvedIssues, []);
});

test("archived School Applications and Student 500 applications retain history without actions", () => {
  const state = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplication({
          id: "archived-school",
          intakeLabel: "Semester 1 2027",
          packageUsable: false,
          archived: true,
          missingDataCodes: ["intake_not_selected"],
          packageStaleReasons: ["material_inputs_changed"],
          revision: 4,
          updatedAt: generatedAt,
        }),
      ],
      student500Applications: [
        student500({ id: "archived-visa", route: null, archived: true }),
      ],
    })
  );
  assert.equal(state.matters.schoolApplications?.[0]?.progress, "archived");
  assert.equal(state.matters.student500Applications?.[0]?.progress, "archived");
  assert.deepEqual(state.nextActions, []);
  assert.deepEqual(state.unresolvedIssues, []);
  assert.deepEqual(
    state.matters.student500Applications?.[0]?.missingInformationCodes,
    ["study_evidence_route"]
  );
});

test("Admissions linked to an archived School Application preserve outcomes but emit no work", () => {
  const state = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplication({
          id: "archived-parent",
          intakeLabel: "Semester 1 2027",
          packageUsable: true,
          archived: true,
          revision: 3,
          updatedAt: generatedAt,
        }),
      ],
      admissionsCases: [
        admission({
          id: "archived-parent-case",
          applicationId: "archived-parent",
          originKind: "school_application",
          outcome: "offer",
          nextStepCodes: ["request_managed_service_support"],
          serviceMode: "managed_service",
          readiness: "NOT_READY",
        }),
      ],
    })
  );
  const linked = state.matters.schoolApplications?.[0]?.linkedAdmissionsCase;
  assert.equal(linked?.outcomes[0]?.kind, "offer");
  assert.equal(linked?.schoolApplicationLinkState, "available");
  assert.deepEqual(linked?.externalHandoff.reasonCodes, [
    "provider_unavailable",
  ]);
  assert.equal(
    state.unresolvedIssues.some(
      (issue) => issue.targetId === "archived-parent-case"
    ),
    false
  );
  assert.equal(
    state.nextActions.some(
      (action) => action.targetId === "archived-parent-case"
    ),
    false
  );
});

test("a linked Admissions case prevents a duplicate case-creation action without a package", () => {
  const state = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplication({
          id: "school-with-case",
          intakeLabel: "Semester 1 2027",
          packageUsable: true,
          noPackage: true,
          revision: 1,
          updatedAt: generatedAt,
        }),
      ],
      admissionsCases: [
        admission({
          id: "existing-linked-case",
          applicationId: "school-with-case",
          originKind: "school_application",
          nextStepCodes: ["review_requirements"],
        }),
      ],
    })
  );
  assert.equal(
    state.matters.schoolApplications?.[0]?.linkedAdmissionsCase?.caseId,
    "existing-linked-case"
  );
  assert.equal(
    state.nextActions.some(
      (action) => action.reasonCode === "admissions_case_not_recorded"
    ),
    false
  );
  assert.ok(
    state.nextActions.some(
      (action) =>
        action.targetId === "existing-linked-case" &&
        action.code === "review_requirements"
    )
  );
});

test("linked Admissions cases remain discoverable when School Applications are unavailable", () => {
  const state = buildProjectState(
    stateInput({
      capabilities: {
        ...capabilities,
        schoolApplications: {
          reasonCode: "school_application_schema_unavailable",
          state: "unavailable",
        },
      },
      schoolApplications: null,
      admissionsCases: [
        admission({
          id: "readable-case",
          preparationState: "in_preparation",
          applicationId: "private-school-id",
          originKind: "school_application",
          nextStepCodes: [
            "complete_application_details",
            "bind_source_evidence",
            "build_preparation_package",
          ],
        }),
      ],
    })
  );
  const unresolved = state.matters.unresolvedLinkedAdmissions?.[0];
  assert.equal(state.matters.schoolApplications, null);
  assert.equal(state.capabilities.schoolApplications.state, "unavailable");
  assert.equal(unresolved?.caseId, "readable-case");
  assert.equal(unresolved?.originKind, "school_application");
  assert.equal(unresolved?.schoolApplicationLinkState, "unavailable");
  assert.equal(unresolved?.progress, "unknown");
  assert.equal(unresolved?.preparationState, "in_preparation");
  assert.ok(
    state.unresolvedIssues.some(
      (issue) => issue.code === "linked_school_application_unavailable"
    )
  );
  assert.equal(unresolved?.linkedSchoolApplicationId, null);
  assert.equal(state.matters.standaloneAdmissions?.length, 0);
  assert.equal(
    state.nextActions.some((action) => action.targetId === "readable-case"),
    false,
    "case work is suppressed while its linked School Application is unreadable"
  );
  assert.equal(JSON.stringify(state).includes("private-school-id"), false);
});

test("Project A fails closed if a source adapter includes a Project B record", () => {
  assert.throws(
    () =>
      buildProjectState(
        stateInput({
          schoolApplications: [
            schoolApplication({
              id: "project-b-school",
              projectId: "project-b",
              intakeLabel: "Semester 1 2027",
              packageUsable: true,
              revision: 1,
              updatedAt: generatedAt,
            }),
          ],
        })
      ),
    /project_scope_mismatch/u
  );
});

test("all generated action targets resolve to visible authorized matters", () => {
  const state = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplication({
          id: "visible-school",
          intakeLabel: "Semester 1 2027",
          packageUsable: true,
          missingDataCodes: ["intake_not_selected"],
          revision: 1,
          updatedAt: generatedAt,
        }),
      ],
      admissionsCases: [
        admission({
          id: "visible-case",
          applicationId: "visible-school",
          originKind: "school_application",
          nextStepCodes: [
            "complete_application_details",
            "bind_source_evidence",
            "build_preparation_package",
            "select_service_mode",
          ],
        }),
      ],
      student500Applications: [student500({ id: "visible-visa", route: null })],
    })
  );
  const visibleTargets = new Set([
    ...(state.matters.schoolApplications ?? []).map(
      (entry) => `school_application:${entry.applicationId}`
    ),
    ...(state.matters.standaloneAdmissions ?? []).map(
      (entry) => `school_admission_case:${entry.caseId}`
    ),
    ...(state.matters.unresolvedLinkedAdmissions ?? []).map(
      (entry) => `school_admission_case:${entry.caseId}`
    ),
    ...(state.matters.schoolApplications ?? []).flatMap((entry) =>
      entry.linkedAdmissionsCase
        ? [`school_admission_case:${entry.linkedAdmissionsCase.caseId}`]
        : []
    ),
    ...(state.matters.student500Applications ?? []).map(
      (entry) => `student500_application:${entry.applicationId}`
    ),
  ]);
  for (const action of state.nextActions) {
    assert.ok(
      visibleTargets.has(`${action.targetKind}:${action.targetId}`),
      `hidden target ${action.targetId}`
    );
  }
});

test("M1-A updates one school through M5.1, observes package invalidation, and replays safely", async () => {
  const harness = createM5IntegrationHarness();
  const schoolA = await readyApplication(harness, {
    institutionKey: "northbridge",
  });
  const schoolB = await readyApplication(harness, {
    institutionKey: "riverside",
  });
  const beforeA = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: schoolA.application.applicationId,
    projectId: harness.projectId,
  });
  const beforeB = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: schoolB.application.applicationId,
    projectId: harness.projectId,
  });
  const initialState = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplicationFromService(beforeA),
        schoolApplicationFromService(beforeB),
      ],
      student500Applications: [
        student500({
          id: "student-500-preparation",
          route: "school_application_in_progress",
          schoolApplicationId: schoolA.application.applicationId,
          projectId: harness.projectId,
        }),
      ],
      student500Preparations: [
        {
          applicationId: "student-500-preparation",
          schoolContext: {
            admissionCaseId: null,
            admissionOutcomeIndependentlyVerified: false,
            current: true,
            kind: "school_application",
            schoolApplicationId: schoolA.application.applicationId,
            studyEvidenceKind: "none",
            unavailableReason: null,
          },
          drafts: [],
          snapshots: [],
        },
      ],
      project: { id: harness.projectId, revision: 1, status: "active" },
    })
  );

  // The accepted catalog resolver recognizes this changed intake for the same course.
  harness.m3.seed({
    courseId: "course:northbridge:bachelor-nursing-s2",
    courseTitle: "Bachelor of Nursing",
    deliveryId: null,
    institutionId: "provider:northbridge",
    institutionName: "Northbridge University",
    intakeId: "intake:northbridge:2027-s2",
    intakeLabel: "Semester 2 2027",
    recordClass: "UNVERIFIED",
    snapshotToken: "m3-snapshot:northbridge:1",
  });
  const operationId = harness.operationId("m1-a-update");
  const target = {
    actorUserId: harness.ownerUserId,
    applicationId: beforeA.applicationId,
    courseId: "course:northbridge:bachelor-nursing-s2",
    courseTitle: "Bachelor of Nursing",
    expectedRevision: beforeA.revision,
    institutionId: "provider:northbridge",
    institutionName: "Northbridge University",
    intakeId: "intake:northbridge:2027-s2",
    intakeLabel: "Semester 2 2027",
    operationId,
    projectId: harness.projectId,
  } as const;
  const changed = await harness.applications.update(target);
  const operationCountAfterMutation =
    harness.applicationStore.state().operations.length;
  const replay = await harness.applications.update(target);
  assert.equal(changed.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(
    harness.applicationStore.state().operations.length,
    operationCountAfterMutation,
    "an idempotent replay must not create another operation record"
  );

  // A new service object reads the same accepted persistence adapter, analogous to
  // a process restart without pretending this in-memory test is PostgreSQL evidence.
  const freshService = createSchoolApplicationService({
    catalogResolver: harness.m3.resolver,
    referenceResolver: harness.m2.resolver,
    store: harness.applicationStore,
  });
  const afterA = await freshService.get({
    actorUserId: harness.ownerUserId,
    applicationId: schoolA.application.applicationId,
    projectId: harness.projectId,
  });
  const afterB = await freshService.get({
    actorUserId: harness.ownerUserId,
    applicationId: schoolB.application.applicationId,
    projectId: harness.projectId,
  });
  const nextState = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplicationFromService(afterA),
        schoolApplicationFromService(afterB),
      ],
      student500Applications: [
        student500({
          id: "student-500-preparation",
          route: "school_application_in_progress",
          schoolApplicationId: schoolA.application.applicationId,
          projectId: harness.projectId,
        }),
      ],
      student500Preparations: [
        {
          applicationId: "student-500-preparation",
          schoolContext: {
            admissionCaseId: null,
            admissionOutcomeIndependentlyVerified: false,
            current: true,
            kind: "school_application",
            schoolApplicationId: schoolA.application.applicationId,
            studyEvidenceKind: "none",
            unavailableReason: null,
          },
          drafts: [],
          snapshots: [],
        },
      ],
      project: { id: harness.projectId, revision: 1, status: "active" },
    })
  );
  const nextStateRetry = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplicationFromService(afterA),
        schoolApplicationFromService(afterB),
      ],
      student500Applications: [
        student500({
          id: "student-500-preparation",
          route: "school_application_in_progress",
          schoolApplicationId: schoolA.application.applicationId,
          projectId: harness.projectId,
        }),
      ],
      student500Preparations: [
        {
          applicationId: "student-500-preparation",
          schoolContext: {
            admissionCaseId: null,
            admissionOutcomeIndependentlyVerified: false,
            current: true,
            kind: "school_application",
            schoolApplicationId: schoolA.application.applicationId,
            studyEvidenceKind: "none",
            unavailableReason: null,
          },
          drafts: [],
          snapshots: [],
        },
      ],
      project: { id: harness.projectId, revision: 1, status: "active" },
    })
  );
  const projectedA = nextState.matters.schoolApplications?.find(
    (entry) => entry.applicationId === afterA.applicationId
  );
  const projectedB = nextState.matters.schoolApplications?.find(
    (entry) => entry.applicationId === afterB.applicationId
  );
  assert.equal(projectedA?.intake.label, "Semester 2 2027");
  assert.equal(projectedA?.package?.usable, false);
  assert.equal(projectedA?.package?.status, "stale");
  assert.equal(projectedA?.progress, "needs_information");
  assert.ok(
    projectedA?.provenance.history.some(
      (event) => event.eventType === "school_application_updated"
    )
  );
  assert.ok(
    projectedA?.provenance.history.some(
      (event) => event.eventType === "school_application_package_invalidated"
    )
  );
  assert.equal(projectedA?.provenance.revision, changed.application.revision);
  assert.ok(
    nextState.nextActions.some(
      (action) =>
        action.targetId === afterA.applicationId &&
        action.code === "rebuild_preparation_package" &&
        action.reasonCode === "package_unusable"
    )
  );
  assert.deepEqual(
    projectedB,
    initialState.matters.schoolApplications?.find(
      (entry) => entry.applicationId === afterB.applicationId
    )
  );
  assert.equal(afterB.intake.label, beforeB.intake.label);
  const applicationEvents = harness.applicationStore
    .state()
    .events.filter((event) => event.applicationId === afterA.applicationId);
  assert.equal(
    applicationEvents.filter(
      (event) => event.eventType === "school_application_updated"
    ).length,
    1
  );
  assert.equal(
    applicationEvents.filter(
      (event) => event.eventType === "school_application_package_invalidated"
    ).length,
    1
  );
  assert.deepEqual(nextStateRetry, nextState);
});

test("M5.2 Project State reads retain an authorized linked case when M5.1 is unavailable", async () => {
  const harness = createM5IntegrationHarness();
  const school = await readyApplication(harness);
  const created = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: school.application.applicationId,
    operationId: harness.operationId("state-linked-case"),
    originKind: "school_application",
    projectId: harness.projectId,
  });
  const indexed = await harness.admissions.listProjectStateCases({
    actorUserId: harness.ownerUserId,
    projectId: harness.projectId,
  });
  assert.deepEqual(indexed, [
    {
      applicationId: school.application.applicationId,
      caseId: created.case.caseId,
    },
  ]);

  const { case: detail } = await harness.admissions.getProjectStateCase({
    actorUserId: harness.ownerUserId,
    applicationDataAvailable: false,
    caseId: created.case.caseId,
    projectId: harness.projectId,
  });
  assert.equal(detail.caseId, created.case.caseId);
  assert.equal(detail.originKind, "school_application");
  assert.equal(detail.application, null);
  assert.equal(detail.preparationStale, true);
  assert.deepEqual(detail.nextStepCodes, []);
  assert.deepEqual(detail.requirements, []);
  await assert.rejects(
    harness.admissions.listProjectStateCases({
      actorUserId: harness.strangerUserId,
      projectId: harness.projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "project_forbidden"
  );
});

test("explicit Offer and CoE routes remain separate, and an absent School Application is not a blocker", () => {
  const state = buildProjectState(
    stateInput({
      admissionsCases: [
        admission({
          id: "offer-case",
          originKind: "existing_offer",
          outcome: "offer",
        }),
        admission({
          id: "coe-case",
          originKind: "existing_coe",
          outcome: "coe",
        }),
      ],
      student500Applications: [
        student500({ id: "visa-only", route: "no_school_application" }),
      ],
    })
  );
  assert.equal(state.matters.schoolApplications?.length, 0);
  assert.equal(state.matters.standaloneAdmissions?.length, 2);
  assert.equal(
    state.matters.standaloneAdmissions?.find(
      (entry) => entry.caseId === "offer-case"
    )?.outcomes[0]?.independentlyVerified,
    false
  );
  assert.deepEqual(
    state.matters.standaloneAdmissions?.find(
      (entry) => entry.caseId === "coe-case"
    )?.outcomes[0]?.provenance,
    "customer_reported"
  );
  assert.equal(
    state.matters.standaloneAdmissions?.find(
      (entry) => entry.caseId === "offer-case"
    )?.schoolReceipt.state,
    "unrecorded"
  );
  assert.deepEqual(
    state.matters.student500Applications?.[0]?.schoolDependency,
    {
      reasonCode: "explicit_no_school_application_route",
      state: "not_applicable",
    }
  );
  assert.equal(
    state.unresolvedIssues.some(
      (issue) => issue.code === "school_application_missing"
    ),
    false
  );
  assert.equal(state.project.purpose.state, "unknown");
});

test("Student 500 dependencies follow each explicit entry route", () => {
  const state = buildProjectState(
    stateInput({
      admissionsCases: [
        admission({ id: "offer-case", originKind: "existing_offer" }),
        admission({ id: "coe-case", originKind: "existing_coe" }),
      ],
      student500Applications: [
        student500({ id: "coe-route", route: "existing_coe" }),
        student500({ id: "offer-route", route: "offer_only" }),
        student500({
          id: "school-route",
          route: "school_application_in_progress",
        }),
        student500({ id: "visa-route", route: "no_school_application" }),
        student500({ id: "unknown-route", route: null }),
      ],
      student500Preparations: [
        {
          applicationId: "coe-route",
          schoolContext: {
            admissionCaseId: "coe-case",
            admissionOutcomeIndependentlyVerified: false,
            current: true,
            kind: "admission_case",
            schoolApplicationId: null,
            studyEvidenceKind: "coe_reported",
            unavailableReason: null,
          },
          drafts: [],
          snapshots: [],
        },
        {
          applicationId: "offer-route",
          schoolContext: {
            admissionCaseId: "offer-case",
            admissionOutcomeIndependentlyVerified: false,
            current: true,
            kind: "admission_case",
            schoolApplicationId: null,
            studyEvidenceKind: "offer_reported",
            unavailableReason: null,
          },
          drafts: [],
          snapshots: [],
        },
      ],
    })
  );
  const applications = new Map(
    state.matters.student500Applications?.map((application) => [
      application.applicationId,
      application,
    ])
  );
  assert.deepEqual(applications.get("coe-route")?.schoolDependency, {
    admissionCaseId: "coe-case",
    state: "linked",
  });
  assert.deepEqual(applications.get("offer-route")?.schoolDependency, {
    admissionCaseId: "offer-case",
    state: "linked",
  });
  assert.deepEqual(applications.get("school-route")?.schoolDependency, {
    reasonCode: "recorded_school_route_missing_application_link",
    state: "unknown",
  });
  assert.deepEqual(applications.get("visa-route")?.schoolDependency, {
    reasonCode: "explicit_no_school_application_route",
    state: "not_applicable",
  });
  assert.deepEqual(applications.get("unknown-route")?.schoolDependency, {
    reasonCode: "study_evidence_route_not_recorded",
    state: "unknown",
  });
});

test("an unrecorded route remains unknown without a resolvable Project purpose task", () => {
  const state = buildProjectState(
    stateInput({
      student500Applications: [student500({ id: "visa-unknown", route: null })],
    })
  );
  assert.deepEqual(
    state.matters.student500Applications?.[0]?.schoolDependency,
    { reasonCode: "study_evidence_route_not_recorded", state: "unknown" }
  );
  assert.equal(
    state.matters.student500Applications?.[0]?.routeState,
    "unknown"
  );
  assert.ok(
    state.nextActions.some(
      (action) =>
        action.code === "record_study_evidence_route" &&
        action.targetId === "visa-unknown"
    )
  );
  assert.ok(
    !state.nextActions.some(
      (action) =>
        action.code === "clarify_project_purpose" &&
        action.targetId === project.id
    )
  );
  assert.equal(state.project.purpose.state, "unknown");
});

test("Managed handoff readiness and institutional wait signals do not block or invent progress", () => {
  const admissions = [
    admission({
      id: "managed-preparation",
      originKind: "claimed_exception",
      readiness: "NOT_READY",
      serviceMode: "managed_service",
      preparationState: "in_preparation",
    }),
    admission({
      id: "wait-school",
      originKind: "existing_offer",
      outcome: "offer",
      nextStepCodes: ["await_institutional_response"],
      preparationState: "in_preparation",
    }),
  ];
  const state = buildProjectState(stateInput({ admissionsCases: admissions }));
  const managed = state.matters.standaloneAdmissions?.find(
    (entry) => entry.caseId === "managed-preparation"
  );
  const waiting = state.matters.standaloneAdmissions?.find(
    (entry) => entry.caseId === "wait-school"
  );
  assert.equal(managed?.progress, "in_progress");
  assert.deepEqual(managed?.externalHandoff, {
    reasonCodes: ["provider_unavailable"],
    status: "NOT_READY",
  });
  assert.deepEqual(waiting?.externalHandoff, {
    status: "NOT_APPLICABLE",
    reasonCodes: [],
  });
  assert.equal(waiting?.progress, "in_progress");
  assert.equal(waiting?.responsibleActor, "unknown");
  assert.deepEqual(waiting?.schoolReceipt, { state: "unrecorded" });
  assert.equal(waiting?.outcomes[0]?.provenance, "customer_reported");
  assert.equal(waiting?.outcomes[0]?.independentlyVerified, false);
  assert.ok(
    state.nextActions.some(
      (action) =>
        action.targetId === "wait-school" &&
        action.code === "await_institutional_response" &&
        action.actionability === "advisory" &&
        action.responsibleActor === "unknown"
    )
  );
});

test("unreadable sources are not projected as empty or completed", () => {
  const blockedCapabilities: ProjectStateInput["capabilities"] = {
    ...capabilities,
    schoolApplications: {
      reasonCode: "permission_revoked",
      state: "restricted",
    },
  };
  const state = buildProjectState(
    stateInput({
      capabilities: blockedCapabilities,
      schoolApplications: null,
    })
  );
  assert.equal(state.matters.schoolApplications, null);
  assert.equal(state.capabilities.schoolApplications.state, "restricted");
  assert.equal(state.matters.standaloneAdmissions?.length, 0);
});

test("Service Engagement source availability distinguishes no rows from unreadable rows", () => {
  const emptyAvailable = buildProjectState(stateInput());
  assert.deepEqual(emptyAvailable.project.serviceScope.engagements, []);

  const restricted = buildProjectState(
    stateInput({
      capabilities: {
        ...capabilities,
        serviceEngagements: {
          reasonCode: "registered_customer_required",
          state: "restricted",
        },
      },
      serviceEngagements: null,
    })
  );
  assert.equal(restricted.project.serviceScope.state, "restricted");
  assert.equal(restricted.project.serviceScope.engagements, null);
});

test("detail read fan-out stays within the configured concurrency cap and preserves order", async () => {
  let active = 0;
  let maximumActive = 0;
  const values = await mapWithConcurrency({
    concurrency: PROJECT_STATE_MAX_CONCURRENT_DETAIL_READS,
    items: Array.from({ length: 11 }, (_, index) => index),
    mapper: async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value * 3;
    },
  });
  assert.equal(maximumActive, PROJECT_STATE_MAX_CONCURRENT_DETAIL_READS);
  assert.deepEqual(
    values,
    Array.from({ length: 11 }, (_, index) => index * 3)
  );
  await assert.rejects(
    mapWithConcurrency({ items: [1], concurrency: 0, mapper: async (v) => v }),
    /concurrency_must_be_positive_integer/u
  );
});

test("bounded event history is explicitly marked when older provenance is omitted", () => {
  const events = Array.from(
    { length: PROJECT_STATE_MAX_HISTORY_PER_RECORD + 1 },
    (_, index) => ({
      createdAt: `2026-11-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      eventType: `school_application_update_${index + 1}`,
      revision: index + 1,
      subjectId: "school-a",
      subjectKind: "school_application",
    })
  );
  const state = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplication({
          id: "school-a",
          intakeLabel: "Semester 1 2027",
          packageUsable: true,
          revision: events.at(-1)?.revision ?? 1,
          updatedAt: generatedAt,
          events,
        }),
      ],
    })
  );
  const provenance = state.matters.schoolApplications?.[0]?.provenance;
  assert.equal(
    provenance?.history.length,
    PROJECT_STATE_MAX_HISTORY_PER_RECORD
  );
  assert.equal(provenance?.historyTruncated, true);
  assert.equal(provenance?.latestEvent?.eventType, events.at(-1)?.eventType);
});

test("state HTTP contract is authenticated, non-cacheable, and hides unauthorized identifiers", async () => {
  let loads = 0;
  const unauthenticated = createProjectStateHttpHandler({
    authenticate: async () => null,
    loadForActor: () => {
      loads += 1;
      return Promise.resolve({ kind: "not_found" as const });
    },
  });
  const rejected = await unauthenticated("private-project-id");
  assert.equal(rejected.status, 401);
  assert.equal(loads, 0);
  assert.equal(rejected.headers.get("cache-control"), "private, no-store");

  const hidden = createProjectStateHttpHandler({
    authenticate: async () => ({ type: "regular", userId: "actor-b" }),
    loadForActor: (input) => {
      loads += 1;
      assert.equal(input.actorUserId, "actor-b");
      assert.equal(input.projectId, "project-a");
      return Promise.resolve({ kind: "not_found" as const });
    },
  });
  const notFound = await hidden("project-a");
  assert.equal(notFound.status, 404);
  assert.equal(notFound.headers.get("cache-control"), "private, no-store");
  const body = await notFound.text();
  assert.equal(body.includes("private-project-id"), false);
  assert.equal(body.includes("school-a"), false);
  assert.equal(loads, 1);
});

test("oversized state responses fail closed at the HTTP boundary", async () => {
  const base = buildProjectState(stateInput());
  const oversizedState: ProjectState = {
    ...base,
    nextActions: Array.from({ length: 4000 }, (_, index) => ({
      actionability: "executable",
      code: `action-${index}`,
      reasonCode: "bounded_response_test",
      responsibleActor: "unknown",
      targetId: "x".repeat(80),
      targetKind: "project",
    })),
  };
  const response = await createProjectStateHttpHandler({
    authenticate: () => Promise.resolve({ type: "regular", userId: "actor-a" }),
    loadForActor: () => Promise.resolve({ kind: "ok", state: oversizedState }),
  })(project.id);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    error: "Project state is unavailable.",
  });
});

test("disabled capability is explicit and does not imply an empty Project", () => {
  const disabled: ProjectStateCapability = {
    reasonCode: "feature_disabled",
    state: "disabled",
  };
  const state = buildProjectState(
    stateInput({
      capabilities: { ...capabilities, student500: disabled },
      student500Applications: null,
    })
  );
  assert.equal(state.matters.student500Applications, null);
  assert.deepEqual(state.capabilities.student500, disabled);
});

test("Admissions actionability covers the full vocabulary and defaults to advisory", () => {
  const executable = new Set([
    "complete_application_details",
    "bind_source_evidence",
    "build_preparation_package",
    "select_service_mode",
    "record_offer_or_exception",
    "record_coe_evidence",
  ]);
  const state = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplication({
          id: "matrix-school",
          revision: 1,
          intakeLabel: "2027",
          updatedAt: generatedAt,
          packageUsable: true,
        }),
      ],
      admissionsCases: [
        admission({
          id: "matrix-case",
          applicationId: "matrix-school",
          originKind: "school_application",
          serviceMode: "managed_service",
          readiness: "NOT_READY",
          nextStepCodes: [
            ...SCHOOL_ADMISSIONS_NEXT_STEPS,
            "future_unknown_step",
          ],
        }),
      ],
    })
  );
  const schoolActions = new Set([
    "complete_application_details",
    "bind_source_evidence",
    "build_preparation_package",
  ]);
  const stepCodes = new Set<string>([
    ...SCHOOL_ADMISSIONS_NEXT_STEPS,
    "future_unknown_step",
  ]);
  const actions = state.nextActions.filter((action) =>
    stepCodes.has(action.code)
  );
  assert.equal(actions.length, SCHOOL_ADMISSIONS_NEXT_STEPS.length + 1);
  for (const action of actions) {
    assert.equal(
      action.actionability,
      executable.has(action.code) ? "executable" : "advisory",
      action.code
    );
    assert.equal(
      action.targetKind,
      schoolActions.has(action.code)
        ? "school_application"
        : "school_admission_case",
      action.code
    );
    assert.equal(
      action.targetId,
      schoolActions.has(action.code) ? "matrix-school" : "matrix-case",
      action.code
    );
  }
  const standalone = buildProjectState(
    stateInput({
      admissionsCases: [
        admission({
          id: "standalone-matrix",
          originKind: "existing_offer",
          nextStepCodes: [
            "complete_application_details",
            "build_preparation_package",
            "record_offer_or_exception",
          ],
        }),
      ],
    })
  );
  assert.deepEqual(
    standalone.nextActions.map((a) => a.actionability),
    ["advisory", "advisory", "executable"]
  );
});

test("archived linked Admissions retains requirements without active issues", () => {
  const item = admission({
    id: "archived-case-requirements",
    applicationId: "archive",
    originKind: "school_application",
    outcome: "offer",
    serviceMode: "managed_service",
    readiness: "NOT_READY",
  });
  const state = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplication({
          id: "archive",
          revision: 1,
          intakeLabel: "2027",
          updatedAt: generatedAt,
          packageUsable: true,
          archived: true,
        }),
      ],
      admissionsCases: [
        { ...item, requirements: [{ code: "evidence", status: "missing" }] },
      ],
    })
  );
  assert.equal(
    state.matters.schoolApplications?.[0]?.linkedAdmissionsCase?.requirements[0]
      ?.status,
    "missing"
  );
  assert.equal(
    state.matters.schoolApplications?.[0]?.linkedAdmissionsCase?.outcomes[0]
      ?.kind,
    "offer"
  );
  assert.equal(
    state.unresolvedIssues.some((issue) => issue.targetId === item.caseId),
    false
  );
});

function realisticAdmissionsInputs(
  patch: Partial<SchoolAdmissionsPreparationInputs> = {}
): SchoolAdmissionsPreparationInputs {
  return {
    application: {
      applicationId: "11111111-1111-4111-8111-111111111111",
      applicationStatus: "package_prepared",
      archived: false,
      catalogRecordClass: "UNVERIFIED",
      catalogSnapshotToken: "catalog:v1",
      courseId: "course-1",
      courseTitle: "Master of Data Science",
      currentPackage: {
        contentSha256: "a".repeat(64),
        inputsSha256: "b".repeat(64),
        packageId: "22222222-2222-4222-8222-222222222222",
        staleReasonCodes: [],
        targetBindingSha256: "c".repeat(64),
        usable: true,
        version: 1,
      },
      deliveryId: null,
      institutionId: "inst-1",
      institutionName: "Example University",
      intakeId: "intake-1",
      intakeLabel: "2027 Semester 1",
      missingDataCodes: [],
      projectId: "33333333-3333-4333-8333-333333333333",
      references: [
        {
          available: true,
          changed: false,
          kind: "fact",
          referenceId: "44444444-4444-4444-8444-444444444444",
          referenceSha256: "d".repeat(64),
          referenceVersion: 2,
          revoked: false,
        },
      ],
      revision: 3,
      sourceStatus: "unverified_catalog_match",
    },
    assistKind: "disabled",
    confirmed: false,
    education: {
      courseLabel: "Master of Data Science",
      institutionLabel: "Example University",
      recordClass: "UNVERIFIED",
      snapshotToken: "catalog:v1",
      status: "resolved",
    },
    evidence: {
      conflictState: "none",
      documentCount: 1,
      factCount: 1,
      requirementCount: 0,
      unavailableCount: 0,
    },
    managed: null,
    originKind: "school_application",
    outcomes: { coe: null, exception: null, offer: null },
    serviceMode: "self_service",
    standalone: null,
    suggestions: [],
    ...patch,
  };
}

test("real School Application source disclosure does not turn a usable package into missing information", () => {
  const codes = schoolApplicationMissingDataCodes({
    intakeId: "intake-1",
    intakeLabel: null,
    referenceCount: 1,
  });
  const state = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplication({
          id: "prepared",
          revision: 1,
          intakeLabel: "2027",
          updatedAt: generatedAt,
          packageUsable: true,
          missingDataCodes: codes,
        }),
      ],
    })
  );
  const app = state.matters.schoolApplications?.[0];
  assert.deepEqual(codes, ["source_not_independently_verified"]);
  assert.equal(app?.progress, "in_progress");
  assert.equal(app?.package?.usable, true);
  assert.equal(app?.source.independentlyVerified, false);
  assert.ok(
    state.unresolvedIssues.some(
      (issue) => issue.code === "source_not_independently_verified"
    )
  );
  assert.ok(
    state.nextActions.some(
      (action) =>
        action.code === "review_school_source_status" &&
        action.actionability === "advisory" &&
        action.responsibleActor === "unknown"
    )
  );
  assert.equal(
    state.nextActions.some(
      (action) =>
        action.actionability === "executable" &&
        action.reasonCode === "source_not_independently_verified"
    ),
    false
  );
});

test("real School Application missing data preserves actionable intake and reference work", () => {
  const codes = schoolApplicationMissingDataCodes({
    intakeId: null,
    intakeLabel: null,
    referenceCount: 0,
  });
  const state = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplication({
          id: "incomplete",
          revision: 1,
          intakeLabel: "",
          updatedAt: generatedAt,
          packageUsable: true,
          missingDataCodes: codes,
        }),
      ],
    })
  );
  assert.equal(
    state.matters.schoolApplications?.[0]?.progress,
    "needs_information"
  );
  for (const code of ["select_intake", "add_application_reference"]) {
    assert.ok(
      state.nextActions.some(
        (action) =>
          action.code === code && action.actionability === "executable"
      )
    );
  }
});

test("real Admissions checklist separates managed authority and catalog uncertainty from preparation", () => {
  const inputs = realisticAdmissionsInputs({
    confirmed: true,
    serviceMode: "managed_service",
    managed: {
      status: "NOT_READY",
      engagementCurrent: false,
      authorityVerified: false,
    },
    education: { status: "not_found" },
  });
  const requirements = buildRequirementChecklist(inputs);
  assert.equal(
    requirements.find((r) => r.code === "managed_authority_verified")?.status,
    "missing"
  );
  assert.equal(
    requirements.find((r) => r.code === "education_source_resolved")?.status,
    "missing"
  );
  const item = admission({
    id: "real-managed",
    originKind: "school_application",
    applicationId: "real-school",
    serviceMode: "managed_service",
    readiness: "NOT_READY",
    preparationState: "in_preparation",
  });
  const state = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplication({
          id: "real-school",
          revision: 1,
          intakeLabel: "2027",
          updatedAt: generatedAt,
          packageUsable: true,
        }),
      ],
      admissionsCases: [{ ...item, requirements }],
    })
  );
  const result = state.matters.schoolApplications?.[0]?.linkedAdmissionsCase;
  assert.equal(result?.progress, "in_progress");
  assert.equal(result?.externalHandoff.status, "NOT_READY");
  assert.ok(
    state.unresolvedIssues.some(
      (issue) => issue.code === "managed_authority_verified:missing"
    )
  );
  assert.ok(
    state.unresolvedIssues.some(
      (issue) => issue.code === "education_source_resolved:missing"
    )
  );
});

test("real Admissions checklist preserves missing targets and conflicting evidence as preparation deficiencies", () => {
  const base = realisticAdmissionsInputs({
    confirmed: true,
    serviceMode: "managed_service",
    managed: {
      status: "NOT_READY",
      engagementCurrent: false,
      authorityVerified: false,
    },
  });
  assert.ok(base.application);
  const cases = [
    {
      ...base,
      application: { ...base.application, intakeId: null, intakeLabel: null },
    },
    {
      ...base,
      evidence: { ...base.evidence, conflictState: "conflicts" as const },
    },
  ];
  for (const inputs of cases) {
    const requirements = buildRequirementChecklist(inputs);
    const item = admission({
      id: "deficient",
      originKind: "school_application",
      applicationId: "real-school",
      serviceMode: "managed_service",
      readiness: "NOT_READY",
      preparationState: "in_preparation",
    });
    const state = buildProjectState(
      stateInput({
        schoolApplications: [
          schoolApplication({
            id: "real-school",
            revision: 1,
            intakeLabel: "2027",
            updatedAt: generatedAt,
            packageUsable: true,
          }),
        ],
        admissionsCases: [{ ...item, requirements }],
      })
    );
    assert.equal(
      state.matters.schoolApplications?.[0]?.linkedAdmissionsCase?.progress,
      "needs_information"
    );
  }
  const unknown = buildRequirementChecklist({
    ...base,
    evidence: { ...base.evidence, conflictState: "unavailable" },
    education: { status: "unavailable" },
  });
  const item = admission({
    id: "uncertain",
    originKind: "school_application",
    applicationId: "real-school",
    serviceMode: "managed_service",
    readiness: "NOT_READY",
    preparationState: "in_preparation",
  });
  const state = buildProjectState(
    stateInput({
      schoolApplications: [
        schoolApplication({
          id: "real-school",
          revision: 1,
          intakeLabel: "2027",
          updatedAt: generatedAt,
          packageUsable: true,
        }),
      ],
      admissionsCases: [{ ...item, requirements: unknown }],
    })
  );
  assert.equal(
    state.matters.schoolApplications?.[0]?.linkedAdmissionsCase?.progress,
    "in_progress"
  );
  assert.ok(
    state.unresolvedIssues.some(
      (issue) => issue.code === "education_source_resolved:unknown"
    )
  );
});

test("preparation progress respects applicability and unusable package state", () => {
  const item = admission({
    id: "optional",
    originKind: "existing_offer",
    preparationState: "in_preparation",
  });
  const state = buildProjectState(
    stateInput({
      admissionsCases: [
        {
          ...item,
          requirements: [
            {
              code: "outcome_pathway_present",
              status: "missing",
              required: false,
            },
            {
              code: "preparation_package_usable",
              status: "missing",
              required: true,
              appliesTo: "managed_service",
            },
          ],
        },
      ],
      schoolApplications: [
        {
          ...schoolApplication({
            id: "unusable",
            revision: 1,
            intakeLabel: "2027",
            updatedAt: generatedAt,
            packageUsable: true,
          }),
          latestPackage: {
            packageId: "unusable-package",
            version: 1,
            status: "stale",
            usable: false,
            contentSha256: "a".repeat(64),
            inputsSha256: "b".repeat(64),
            staleReasonCodes: ["package_not_usable"],
          },
        },
      ],
    })
  );
  assert.equal(
    state.matters.standaloneAdmissions?.[0]?.progress,
    "in_progress"
  );
  assert.equal(
    state.matters.schoolApplications?.[0]?.progress,
    "needs_information"
  );
  assert.ok(
    state.nextActions.some(
      (action) =>
        action.code === "rebuild_preparation_package" &&
        action.actionability === "executable"
    )
  );
});

test("Admissions actions bind to the owning visible business matter", () => {
  const schoolCodes = [
    "complete_application_details",
    "bind_source_evidence",
    "build_preparation_package",
  ];
  const caseCodes = [
    "select_service_mode",
    "record_offer_or_exception",
    "record_coe_evidence",
  ];
  const school = schoolApplication({
    id: "s1",
    revision: 1,
    intakeLabel: "2027",
    updatedAt: generatedAt,
    packageUsable: true,
  });
  const item = admission({
    id: "c1",
    applicationId: "s1",
    originKind: "school_application",
    nextStepCodes: [...schoolCodes, ...caseCodes],
  });
  const state = buildProjectState(
    stateInput({ schoolApplications: [school], admissionsCases: [item] })
  );
  for (const action of state.nextActions.filter(
    (entry) => entry.actionability === "executable"
  )) {
    if (schoolCodes.includes(action.code)) {
      assert.equal(action.targetKind, "school_application");
      assert.equal(action.targetId, "s1");
    } else if (caseCodes.includes(action.code)) {
      assert.equal(action.targetKind, "school_admission_case");
      assert.equal(action.targetId, "c1");
    } else {
      assert.fail(`Unexpected executable action: ${action.code}`);
    }
  }
  for (const code of [...schoolCodes, ...caseCodes]) {
    assert.equal(
      state.nextActions.filter((action) => action.code === code).length,
      1,
      code
    );
  }
  for (const originKind of ["existing_offer", "existing_coe"] as const) {
    const standalone = buildProjectState(
      stateInput({
        admissionsCases: [
          admission({
            id: originKind,
            originKind,
            nextStepCodes: [...schoolCodes, ...caseCodes],
          }),
        ],
      })
    );
    assert.equal(
      standalone.nextActions.some(
        (action) => action.targetKind === "school_application"
      ),
      false
    );
    for (const action of standalone.nextActions) {
      assert.equal(action.targetId, originKind);
      assert.equal(
        action.actionability,
        schoolCodes.includes(action.code) ? "advisory" : "executable"
      );
    }
  }
  const absent = buildProjectState(
    stateInput({ schoolApplications: [], admissionsCases: [item] })
  );
  assert.equal(
    absent.matters.unresolvedLinkedAdmissions?.[0]?.linkedSchoolApplicationId,
    null
  );
  assert.equal(absent.nextActions.length, 0);
  assert.equal(JSON.stringify(absent).includes('"s1"'), false);
  for (const archivedOrClosed of [
    stateInput({
      schoolApplications: [
        { ...school, status: "archived", archivedAt: generatedAt },
      ],
      admissionsCases: [item],
    }),
    stateInput({
      schoolApplications: [school],
      admissionsCases: [item],
      project: { ...project, status: "closed" },
    }),
  ]) {
    assert.deepEqual(buildProjectState(archivedOrClosed).nextActions, []);
  }
});

test("source failures and overflow stay unreadable rather than empty or complete", () => {
  const failure = projectStateSourceFailure(
    new Error("synthetic query failure")
  );
  const overflow = projectStateSourceFailure({ code: "limit_exceeded" });
  const restricted = projectStateSourceFailure({ code: "project_forbidden" });
  assert.deepEqual(failure, {
    state: "unavailable",
    reasonCode: "source_read_failed",
  });
  assert.deepEqual(overflow, {
    state: "unavailable",
    reasonCode: "source_list_exceeds_bound",
  });
  assert.deepEqual(restricted, {
    state: "restricted",
    reasonCode: "authorization_or_private_scope",
  });
  for (const capability of [failure, overflow, restricted]) {
    const state = buildProjectState(
      stateInput({
        capabilities: { ...capabilities, schoolApplications: capability },
        schoolApplications: null,
      })
    );
    assert.equal(state.matters.schoolApplications, null);
    assert.notEqual(state.capabilities.schoolApplications.state, "available");
  }
});
