import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import {
  buildProjectJourney,
  parseProjectStateResponse,
} from "./project-journey";
import {
  buildProjectState,
  type ProjectStateAdmissionInput,
  type ProjectStateInput,
  type ProjectStateOutcome,
  type ProjectStatePreparationInput,
  type ProjectStateSchoolApplicationInput,
  type ProjectStateStudent500Input,
} from "./project-state";
import { getProjectWorkflowCopy } from "./project-workflow-copy";
import {
  buildProjectWorkflowProjection,
  PROJECT_WORKFLOW_DEFINITION_VERSION,
  PROJECT_WORKFLOW_DEFINITIONS,
  projectWorkflowTaskById,
  workflowTaskId,
  workflowTasksForTarget,
} from "./project-workflows";

const project = { id: "project-e2", revision: 9, status: "active" } as const;
const timestamp = "2026-11-23T09:00:00.000Z";

const baseCapabilities: ProjectStateInput["capabilities"] = {
  projectDocuments: { reasonCode: null, state: "disabled" },
  projectFacts: { reasonCode: null, state: "available" },
  schoolAdmissions: { reasonCode: null, state: "available" },
  schoolApplications: { reasonCode: null, state: "available" },
  serviceEngagements: { reasonCode: null, state: "available" },
  student500: { reasonCode: null, state: "available" },
  student500Preparation: { reasonCode: null, state: "available" },
  submissionPackages: { reasonCode: null, state: "unsupported" },
};

function school(input: {
  id: string;
  revision?: number;
  packageUsable?: boolean;
  packageStale?: boolean;
  missing?: readonly string[];
  archived?: boolean;
}): ProjectStateSchoolApplicationInput {
  const revision = input.revision ?? 1;
  const packageUsable = input.packageUsable ?? false;
  const packageStale = input.packageStale ?? false;
  return {
    applicationId: input.id,
    archivedAt: input.archived ? timestamp : null,
    course: { catalogId: "course-placeholder", title: "Recorded course" },
    createdAt: timestamp,
    events: [],
    institution: {
      catalogId: "institution-placeholder",
      name: `School ${input.id}`,
    },
    intake: { id: null, label: "Recorded intake" },
    latestPackage:
      input.packageUsable || packageStale
        ? {
            contentSha256: "a".repeat(64),
            inputsSha256: "b".repeat(64),
            packageId: `package-${input.id}`,
            staleReasonCodes: packageStale ? ["material_inputs_changed"] : [],
            status: packageUsable ? "current" : "stale",
            usable: packageUsable,
            version: 2,
          }
        : null,
    missingDataCodes: input.missing ?? [],
    packageStale,
    projectId: project.id,
    revision,
    source: { status: "unverified_customer_declared" },
    staleReasonCodes: packageStale ? ["material_inputs_changed"] : [],
    status: input.archived
      ? "archived"
      : packageStale
        ? "stale"
        : packageUsable
          ? "package_prepared"
          : "draft",
    updatedAt: timestamp,
  };
}

function admission(input: {
  id: string;
  originKind?: ProjectStateAdmissionInput["originKind"];
  applicationId?: string | null;
  outcome?: "offer" | "coe";
  outcomeState?: string;
  validityState?: ProjectStateOutcome["validityState"];
  omitValidityState?: boolean;
  independentlyVerified?: boolean;
  evidenceAttached?: boolean;
  superseded?: boolean;
  serviceMode?: "self_service" | "managed_service";
  readiness?: "READY" | "NOT_READY" | "UNKNOWN" | "NOT_EVALUATED";
  requirements?: readonly { code: string; status: string }[];
  preparationState?: string;
  nextSteps?: readonly string[];
}): ProjectStateAdmissionInput {
  const outcome = input.outcome
    ? {
        evidenceAttached: input.evidenceAttached ?? false,
        independentlyVerified: input.independentlyVerified ?? false,
        kind: input.outcome,
        outcomeId: `outcome-${input.id}`,
        provenance: input.independentlyVerified
          ? "provider_confirmed"
          : "customer_reported",
        recordedAt: timestamp,
        state:
          input.outcomeState ??
          (input.outcome === "coe" ? "obtained" : "received"),
        superseded: input.superseded ?? false,
        ...(input.omitValidityState
          ? {}
          : { validityState: input.validityState ?? "valid" }),
        version: 2,
      }
    : null;
  return {
    applicationId: input.applicationId ?? null,
    caseId: input.id,
    coe: input.outcome === "coe" ? outcome : null,
    courseTitle: "Recorded course",
    createdAt: timestamp,
    events: [],
    externalActions: [],
    institutionName: "Recorded institution",
    intakeLabel: "Recorded intake",
    managedReadiness: {
      reasonCodes: [],
      status: input.readiness ?? "NOT_EVALUATED",
    },
    nextStepCodes: input.nextSteps ?? [],
    offer: input.outcome === "offer" ? outcome : null,
    originKind: input.originKind ?? "school_application",
    preparationStale: false,
    preparationState: input.preparationState ?? "not_started",
    projectId: project.id,
    requirements: input.requirements ?? [],
    revision: 4,
    serviceMode: input.serviceMode ?? "self_service",
    staleReasonCodes: [],
    updatedAt: timestamp,
  };
}

function student(input: {
  id: string;
  route: string | null;
  coeStatus?: string;
  schoolApplicationId?: string | null;
  missing?: readonly string[];
  archived?: boolean;
}): ProjectStateStudent500Input {
  return {
    applicationId: input.id,
    archivedAt: input.archived ? timestamp : null,
    context: {
      coeStatus: input.coeStatus ?? "unknown",
      entryRoute: input.route,
      schoolApplicationId: input.schoolApplicationId ?? null,
    },
    createdAt: timestamp,
    events: [],
    projectId: project.id,
    revision: 3,
    screening: {
      missingFactCodes: input.missing ?? [],
      sourceVerification: "declared_pending_verification",
    },
    status: input.archived ? "archived" : "in_progress",
    updatedAt: timestamp,
  };
}

function preparation(input: {
  applicationId: string;
  admissionCaseId?: string | null;
  schoolApplicationId?: string | null;
  studyEvidenceKind?: string;
  independentlyVerified?: boolean;
  current?: boolean;
  drafts?: number;
  staleDraft?: boolean;
  snapshots?: number;
  legalCurrentness?: string;
}): ProjectStatePreparationInput {
  return {
    applicationId: input.applicationId,
    drafts: Array.from({ length: input.drafts ?? 0 }, (_, index) => ({
      createdAt: timestamp,
      draftId: `draft-${input.applicationId}-${index}`,
      stale: input.staleDraft ?? false,
      staleReasons: input.staleDraft ? ["study_context_changed"] : [],
      version: index + 1,
    })),
    schoolContext:
      input.studyEvidenceKind === undefined
        ? null
        : {
            admissionCaseId: input.admissionCaseId ?? null,
            admissionOutcomeIndependentlyVerified:
              input.independentlyVerified ?? false,
            current: input.current ?? true,
            kind: input.admissionCaseId
              ? "admission_case"
              : input.schoolApplicationId
                ? "school_application"
                : "customer_reported_coe",
            schoolApplicationId: input.schoolApplicationId ?? null,
            studyEvidenceKind: input.studyEvidenceKind,
            unavailableReason: null,
          },
    snapshots: Array.from({ length: input.snapshots ?? 0 }, (_, index) => ({
      createdAt: timestamp,
      legalCurrentness: input.legalCurrentness ?? "unestablished",
      snapshotId: `snapshot-${input.applicationId}-${index}`,
      stale: false,
      staleReasons: [],
      version: index + 1,
    })),
  };
}

function state(
  input: {
    schools?: readonly ProjectStateSchoolApplicationInput[] | null;
    admissions?: readonly ProjectStateAdmissionInput[] | null;
    students?: readonly ProjectStateStudent500Input[] | null;
    preparations?: readonly ProjectStatePreparationInput[] | null;
    capabilities?: ProjectStateInput["capabilities"];
    project?: ProjectStateInput["project"];
  } = {}
) {
  return buildProjectState({
    admissionsCases: input.admissions === undefined ? [] : input.admissions,
    capabilities: input.capabilities ?? baseCapabilities,
    facts: { authorizedForAI: [], conflictCount: 0, state: "available" },
    generatedAt: timestamp,
    project: input.project ?? project,
    schoolApplications: input.schools === undefined ? [] : input.schools,
    serviceEngagements: [],
    student500Applications: input.students === undefined ? [] : input.students,
    student500PreparationCapability:
      input.capabilities?.student500Preparation.state === "unsupported"
        ? "unavailable"
        : (input.capabilities?.student500Preparation.state ?? "available"),
    student500Preparations: input.preparations ?? [],
  });
}

test("workflow definitions are versioned, target-specific and do not impose one universal chain", () => {
  assert.equal(
    PROJECT_WORKFLOW_DEFINITION_VERSION,
    "phase15.project-workflows.v1"
  );
  assert.ok(PROJECT_WORKFLOW_DEFINITIONS.length >= 20);
  assert.ok(
    PROJECT_WORKFLOW_DEFINITIONS.some(
      (entry) =>
        entry.workflowKind === "student_500" &&
        entry.stepKey === "study_evidence_coe"
    )
  );
  assert.ok(
    PROJECT_WORKFLOW_DEFINITIONS.every(
      (entry) =>
        !entry.dependencyRuleIds.some((ruleId) =>
          ruleId.includes("school_to_student")
        )
    )
  );
  const schoolA = workflowTaskId({
    workflowKind: "school_application",
    stepKey: "planning",
    targetKind: "school_application",
    targetId: "school:a/1",
  });
  const schoolB = workflowTaskId({
    workflowKind: "school_application",
    stepKey: "planning",
    targetKind: "school_application",
    targetId: "school:b/1",
  });
  assert.notEqual(schoolA, schoolB);
  assert.match(schoolA, /%3A|%2F/u);
});

test("School-only profile keeps course, requirement, document and submission uncertainty explicit", () => {
  const source = state({
    schools: [school({ id: "school-a", packageUsable: true })],
  });
  const projection = buildProjectWorkflowProjection(source);
  const schoolTasks = workflowTasksForTarget(
    projection.tasks,
    "school_application",
    "school-a"
  );
  assert.equal(schoolTasks.length, 7);
  assert.equal(
    schoolTasks.find((entry) => entry.stepKey === "planning")?.progress,
    "needs_information"
  );
  assert.equal(
    schoolTasks.find((entry) => entry.stepKey === "school_discovery")
      ?.applicability,
    "unavailable"
  );
  assert.equal(
    schoolTasks.find((entry) => entry.stepKey === "academic_readiness")
      ?.applicability,
    "unavailable"
  );
  assert.equal(
    schoolTasks.find((entry) => entry.stepKey === "finance_documents")
      ?.applicability,
    "unavailable"
  );
  assert.equal(
    schoolTasks.find((entry) => entry.stepKey === "statements_materials")
      ?.progress,
    "in_progress"
  );
  assert.ok(
    schoolTasks
      .find((entry) => entry.stepKey === "pre_submission")
      ?.reasonCodes.includes("package_does_not_prove_school_submission")
  );
  assert.equal(projection.progress.percent, null);
  assert.ok(projection.progress.unknownApplicabilityCount > 0);
  assert.equal(
    projection.tasks.some((entry) => entry.workflowKind === "student_500"),
    false
  );
});

test("Student 500-only external CoE route has no School prerequisite and preserves reported status", () => {
  const source = state({
    students: [
      student({
        id: "visa-only",
        route: "no_school_application",
        coeStatus: "reported_held",
      }),
    ],
    preparations: [
      preparation({
        applicationId: "visa-only",
        studyEvidenceKind: "coe_reported",
      }),
    ],
  });
  const projection = buildProjectWorkflowProjection(source);
  const studentTasks = workflowTasksForTarget(
    projection.tasks,
    "student500_application",
    "visa-only"
  );
  const study = studentTasks.find(
    (entry) => entry.stepKey === "study_evidence_coe"
  );
  assert.equal(studentTasks.length, 7);
  assert.equal(study?.applicability, "applicable");
  assert.equal(study?.progress, "needs_information");
  assert.equal(study?.dependencies.length, 0);
  assert.ok(
    study?.reasonCodes.includes("customer_reported_study_evidence_not_verified")
  );
  assert.equal(
    projection.tasks.some(
      (entry) => entry.workflowKind === "school_application"
    ),
    false
  );
  assert.equal(
    studentTasks.find((entry) => entry.stepKey === "lodgement_events")
      ?.applicability,
    "unavailable"
  );
});

test("combined targets keep two schools independent and link Student evidence only to its recorded Admissions case", () => {
  const verifiedAdmission = admission({
    id: "admission-a",
    originKind: "existing_coe",
    outcome: "coe",
    independentlyVerified: true,
    evidenceAttached: true,
    applicationId: "school-a",
    requirements: [{ code: "academic_background", status: "satisfied" }],
  });
  const input = {
    schools: [
      school({ id: "school-a", packageUsable: true, revision: 2 }),
      school({ id: "school-b", packageUsable: true, revision: 7 }),
    ],
    admissions: [verifiedAdmission],
    students: [
      student({
        id: "visa-a",
        route: "existing_coe",
        coeStatus: "reported_held",
      }),
    ],
    preparations: [
      preparation({
        applicationId: "visa-a",
        admissionCaseId: "admission-a",
        studyEvidenceKind: "coe_independently_verified",
        independentlyVerified: true,
        current: true,
      }),
    ],
  };
  const before = buildProjectWorkflowProjection(state(input));
  const studentStudy = workflowTasksForTarget(
    before.tasks,
    "student500_application",
    "visa-a"
  ).find((entry) => entry.stepKey === "study_evidence_coe");
  const admissionsEvidence = workflowTasksForTarget(
    before.tasks,
    "school_admission_case",
    "admission-a"
  ).find((entry) => entry.stepKey === "offer_coe_evidence");
  const admissionsPlanning = workflowTasksForTarget(
    before.tasks,
    "school_admission_case",
    "admission-a"
  ).find((entry) => entry.stepKey === "admissions_planning");
  assert.equal(admissionsEvidence?.progress, "completed");
  assert.deepEqual(
    admissionsPlanning?.dependencies,
    [
      workflowTaskId({
        workflowKind: "school_application",
        stepKey: "statements_materials",
        targetKind: "school_application",
        targetId: "school-a",
      }),
    ],
    "Admissions keeps its exact recorded School relationship"
  );
  assert.equal(
    admissionsPlanning?.dependencySemantics,
    "recorded_relationship_only"
  );
  assert.equal(studentStudy?.progress, "completed");
  assert.equal(studentStudy?.progressCreditOwner, false);
  assert.equal(
    studentStudy?.progressCreditKey,
    admissionsEvidence?.progressCreditKey
  );
  assert.deepEqual(studentStudy?.dependencies, [admissionsEvidence?.taskId]);
  assert.equal(studentStudy?.dependencySemantics, "recorded_relationship_only");
  assert.deepEqual(studentStudy?.sourceRevisions, [
    { revision: 3, targetId: "visa-a", targetKind: "student500_application" },
    {
      revision: 4,
      targetId: "admission-a",
      targetKind: "school_admission_case",
    },
  ]);
  assert.ok(
    studentStudy?.sourceRevisions.some(
      (source) =>
        source.targetKind === "school_admission_case" &&
        source.targetId === "admission-a"
    )
  );
  assert.equal(
    before.progress.completedKnownApplicable,
    1,
    "the same verified CoE outcome contributes one progress credit"
  );
  assert.ok(
    workflowTasksForTarget(
      before.tasks,
      "school_application",
      "school-a"
    ).every((entry) => entry.targetId === "school-a")
  );
  assert.ok(
    workflowTasksForTarget(
      before.tasks,
      "school_application",
      "school-b"
    ).every((entry) => entry.targetId === "school-b")
  );

  const after = buildProjectWorkflowProjection(
    state({
      ...input,
      schools: [
        school({ id: "school-a", packageStale: true, revision: 3 }),
        school({ id: "school-b", packageUsable: true, revision: 7 }),
      ],
    })
  );
  const beforeB = workflowTasksForTarget(
    before.tasks,
    "school_application",
    "school-b"
  );
  const afterB = workflowTasksForTarget(
    after.tasks,
    "school_application",
    "school-b"
  );
  assert.deepEqual(afterB, beforeB);
  assert.equal(
    workflowTasksForTarget(after.tasks, "school_application", "school-a").find(
      (entry) => entry.stepKey === "statements_materials"
    )?.progress,
    "needs_information"
  );
});

test("verified Offer or CoE makes discovery inapplicable only for that exact route", () => {
  const verified = admission({
    id: "existing-coe",
    originKind: "existing_coe",
    outcome: "coe",
    independentlyVerified: true,
    evidenceAttached: true,
  });
  const unverified = admission({
    id: "reported-offer",
    originKind: "existing_offer",
    outcome: "offer",
    independentlyVerified: false,
    evidenceAttached: false,
  });
  const verifiedProjection = buildProjectWorkflowProjection(
    state({
      schools: [school({ id: "linked-school" })],
      admissions: [{ ...verified, applicationId: "linked-school" }],
    })
  );
  const discovery = workflowTasksForTarget(
    verifiedProjection.tasks,
    "school_application",
    "linked-school"
  ).find((entry) => entry.stepKey === "school_discovery");
  assert.equal(discovery?.applicability, "not_applicable");
  assert.ok(
    discovery?.reasonCodes.includes("verified_existing_offer_or_coe_route")
  );

  const unverifiedProjection = buildProjectWorkflowProjection(
    state({ admissions: [unverified] })
  );
  const reportedOutcome = workflowTasksForTarget(
    unverifiedProjection.tasks,
    "school_admission_case",
    "reported-offer"
  ).find((entry) => entry.stepKey === "offer_coe_evidence");
  const handoff = workflowTasksForTarget(
    unverifiedProjection.tasks,
    "school_admission_case",
    "reported-offer"
  ).find((entry) => entry.stepKey === "external_handoff");
  assert.equal(reportedOutcome?.progress, "needs_information");
  assert.equal(handoff?.applicability, "not_applicable");
  assert.deepEqual(
    workflowTasksForTarget(
      unverifiedProjection.tasks,
      "school_admission_case",
      "reported-offer"
    ).find((entry) => entry.stepKey === "admissions_planning")?.dependencies,
    [],
    "a standalone Offer/CoE route does not invent a School dependency"
  );
});

test("verified evidence is credited only when current validity and exact links are established", () => {
  const projectCase = (input: {
    outcome?: "offer" | "coe";
    outcomeState?: string;
    validityState?: ProjectStateOutcome["validityState"];
    omitValidityState?: boolean;
    independentlyVerified?: boolean;
    evidenceAttached?: boolean;
    superseded?: boolean;
    originKind?: ProjectStateAdmissionInput["originKind"];
    studentRoute?: string;
    studentStudyEvidenceKind?: string;
  }) => {
    const linked = admission({
      id: "linked-case",
      applicationId: "school-linked",
      originKind: input.originKind ?? "existing_coe",
      outcome: input.outcome ?? "coe",
      outcomeState: input.outcomeState,
      validityState: input.validityState,
      omitValidityState: input.omitValidityState,
      independentlyVerified: input.independentlyVerified ?? true,
      evidenceAttached: input.evidenceAttached ?? true,
      superseded: input.superseded,
    });
    const unrelatedValid = admission({
      id: "unrelated-valid-case",
      originKind: "existing_coe",
      outcome: "coe",
      independentlyVerified: true,
      evidenceAttached: true,
    });
    const projected = buildProjectWorkflowProjection(
      state({
        schools: [school({ id: "school-linked" })],
        admissions: [linked, unrelatedValid],
        students: [
          student({
            id: "visa-linked",
            route: input.studentRoute ?? "existing_coe",
          }),
        ],
        preparations: [
          preparation({
            applicationId: "visa-linked",
            admissionCaseId: "linked-case",
            studyEvidenceKind:
              input.studentStudyEvidenceKind ?? "coe_independently_verified",
            independentlyVerified: true,
            current: true,
          }),
        ],
      })
    );
    return {
      admissionEvidence: workflowTasksForTarget(
        projected.tasks,
        "school_admission_case",
        "linked-case"
      ).find((entry) => entry.stepKey === "offer_coe_evidence"),
      discovery: workflowTasksForTarget(
        projected.tasks,
        "school_application",
        "school-linked"
      ).find((entry) => entry.stepKey === "school_discovery"),
      studentEvidence: workflowTasksForTarget(
        projected.tasks,
        "student500_application",
        "visa-linked"
      ).find((entry) => entry.stepKey === "study_evidence_coe"),
    };
  };

  const currentCoe = projectCase({});
  assert.equal(currentCoe.discovery?.applicability, "not_applicable");
  assert.equal(currentCoe.admissionEvidence?.progress, "completed");
  assert.equal(currentCoe.studentEvidence?.progress, "completed");
  assert.deepEqual(currentCoe.studentEvidence?.dependencies, [
    workflowTaskId({
      workflowKind: "school_admissions",
      stepKey: "offer_coe_evidence",
      targetKind: "school_admission_case",
      targetId: "linked-case",
    }),
  ]);

  const invalidCases: Array<{
    name: string;
    input: Parameters<typeof projectCase>[0];
  }> = [
    { name: "expired CoE validity", input: { validityState: "expired" } },
    { name: "unknown CoE validity", input: { validityState: "unknown" } },
    {
      name: "not applicable CoE validity",
      input: { validityState: "not_applicable" },
    },
    {
      name: "superseded CoE",
      input: { superseded: true, validityState: "valid" },
    },
    {
      name: "unverified CoE",
      input: { independentlyVerified: false, validityState: "valid" },
    },
    {
      name: "mismatched terminal CoE state and valid metadata",
      input: { outcomeState: "superseded", validityState: "valid" },
    },
    {
      name: "expired state with inconsistent valid metadata",
      input: { outcomeState: "expired", validityState: "valid" },
    },
    {
      name: "missing validity metadata",
      input: { omitValidityState: true },
    },
    {
      name: "unsupported withdrawn state",
      input: { outcomeState: "withdrawn", validityState: "valid" },
    },
    {
      name: "unsupported revoked state",
      input: { outcomeState: "revoked", validityState: "valid" },
    },
  ];
  for (const invalid of invalidCases) {
    const result = projectCase(invalid.input);
    assert.notEqual(
      result.discovery?.applicability,
      "not_applicable",
      `${invalid.name}: School discovery stays applicable or unknown`
    );
    assert.notEqual(
      result.admissionEvidence?.progress,
      "completed",
      `${invalid.name}: Admissions does not credit the outcome`
    );
    assert.notEqual(
      result.studentEvidence?.progress,
      "completed",
      `${invalid.name}: Student 500 does not credit the outcome`
    );
    assert.deepEqual(
      result.studentEvidence?.dependencies,
      [
        workflowTaskId({
          workflowKind: "school_admissions",
          stepKey: "offer_coe_evidence",
          targetKind: "school_admission_case",
          targetId: "linked-case",
        }),
      ],
      `${invalid.name}: Student 500 stays linked to the exact case`
    );
  }

  const offerCases: Array<{
    name: string;
    input: Parameters<typeof projectCase>[0];
    schoolDiscoveryNotApplicable: boolean;
    admissionsEvidenceCompleted: boolean;
  }> = [
    {
      name: "received Offer with current verified evidence",
      input: { outcome: "offer", originKind: "existing_offer" },
      schoolDiscoveryNotApplicable: true,
      admissionsEvidenceCompleted: true,
    },
    {
      name: "accepted Offer with verified recorded evidence",
      input: {
        outcome: "offer",
        outcomeState: "accepted",
        originKind: "existing_offer",
        validityState: "not_applicable",
        studentRoute: "existing_offer",
        studentStudyEvidenceKind: "offer_only",
      },
      schoolDiscoveryNotApplicable: true,
      admissionsEvidenceCompleted: true,
    },
    {
      name: "declined Offer",
      input: {
        outcome: "offer",
        outcomeState: "declined",
        originKind: "existing_offer",
        validityState: "not_applicable",
      },
      schoolDiscoveryNotApplicable: false,
      admissionsEvidenceCompleted: false,
    },
    {
      name: "expired Offer state",
      input: {
        outcome: "offer",
        outcomeState: "expired",
        originKind: "existing_offer",
        validityState: "expired",
      },
      schoolDiscoveryNotApplicable: false,
      admissionsEvidenceCompleted: false,
    },
    {
      name: "received Offer expired by date",
      input: {
        outcome: "offer",
        outcomeState: "received",
        originKind: "existing_offer",
        validityState: "expired",
      },
      schoolDiscoveryNotApplicable: false,
      admissionsEvidenceCompleted: false,
    },
    {
      name: "customer-reported unverified Offer",
      input: {
        outcome: "offer",
        originKind: "existing_offer",
        independentlyVerified: false,
        evidenceAttached: false,
      },
      schoolDiscoveryNotApplicable: false,
      admissionsEvidenceCompleted: false,
    },
    {
      name: "superseded Offer",
      input: {
        outcome: "offer",
        originKind: "existing_offer",
        superseded: true,
      },
      schoolDiscoveryNotApplicable: false,
      admissionsEvidenceCompleted: false,
    },
    {
      name: "Offer with unknown validity",
      input: {
        outcome: "offer",
        originKind: "existing_offer",
        validityState: "unknown",
      },
      schoolDiscoveryNotApplicable: false,
      admissionsEvidenceCompleted: false,
    },
    {
      name: "accepted Offer with unknown validity",
      input: {
        outcome: "offer",
        outcomeState: "accepted",
        originKind: "existing_offer",
        validityState: "unknown",
      },
      schoolDiscoveryNotApplicable: false,
      admissionsEvidenceCompleted: false,
    },
  ];
  for (const offerCase of offerCases) {
    const result = projectCase(offerCase.input);
    assert.equal(
      result.discovery?.applicability === "not_applicable",
      offerCase.schoolDiscoveryNotApplicable,
      `${offerCase.name}: School discovery`
    );
    assert.equal(
      result.admissionEvidence?.progress === "completed",
      offerCase.admissionsEvidenceCompleted,
      `${offerCase.name}: Admissions evidence`
    );
    assert.notEqual(
      result.studentEvidence?.progress,
      "completed",
      `${offerCase.name}: an Offer alone never completes Student 500 CoE evidence`
    );
    if (offerCase.name === "accepted Offer with verified recorded evidence") {
      assert.ok(
        result.discovery?.reasonCodes.includes("verified_accepted_offer_route")
      );
      assert.ok(
        result.admissionEvidence?.reasonCodes.includes(
          "verified_accepted_offer_evidence_recorded"
        )
      );
      assert.notEqual(
        result.studentEvidence?.progress,
        "completed",
        "an accepted Offer is not current verified CoE evidence"
      );
    }
  }

  const currentOffer = projectCase({
    outcome: "offer",
    originKind: "existing_offer",
    validityState: "expiring_soon",
  });
  assert.equal(currentOffer.discovery?.applicability, "not_applicable");
  assert.equal(currentOffer.admissionEvidence?.progress, "completed");
  assert.notEqual(currentOffer.studentEvidence?.progress, "completed");
});

test("Offer evidence remains bound to its exact School and Admissions targets", () => {
  const targetAdmission = admission({
    id: "target-case",
    applicationId: "target-school",
    originKind: "existing_offer",
  });
  const otherAcceptedOffer = admission({
    id: "other-case",
    applicationId: "other-school",
    originKind: "existing_offer",
    outcome: "offer",
    outcomeState: "accepted",
    validityState: "not_applicable",
    independentlyVerified: true,
    evidenceAttached: true,
  });
  const projection = buildProjectWorkflowProjection(
    state({
      schools: [
        school({ id: "target-school" }),
        school({ id: "other-school" }),
      ],
      admissions: [targetAdmission, otherAcceptedOffer],
      students: [student({ id: "visa-target", route: "existing_offer" })],
      preparations: [
        preparation({
          applicationId: "visa-target",
          admissionCaseId: "target-case",
          studyEvidenceKind: "offer_only",
        }),
      ],
    })
  );
  const targetDiscovery = workflowTasksForTarget(
    projection.tasks,
    "school_application",
    "target-school"
  ).find((entry) => entry.stepKey === "school_discovery");
  const otherDiscovery = workflowTasksForTarget(
    projection.tasks,
    "school_application",
    "other-school"
  ).find((entry) => entry.stepKey === "school_discovery");
  const targetAdmissionsEvidence = workflowTasksForTarget(
    projection.tasks,
    "school_admission_case",
    "target-case"
  ).find((entry) => entry.stepKey === "offer_coe_evidence");
  const studentEvidence = workflowTasksForTarget(
    projection.tasks,
    "student500_application",
    "visa-target"
  ).find((entry) => entry.stepKey === "study_evidence_coe");

  assert.notEqual(targetDiscovery?.applicability, "not_applicable");
  assert.equal(otherDiscovery?.applicability, "not_applicable");
  assert.notEqual(targetAdmissionsEvidence?.progress, "completed");
  assert.notEqual(studentEvidence?.progress, "completed");
  assert.deepEqual(studentEvidence?.dependencies, [
    workflowTaskId({
      workflowKind: "school_admissions",
      stepKey: "offer_coe_evidence",
      targetKind: "school_admission_case",
      targetId: "target-case",
    }),
  ]);
});

test("an Offer-only Student 500 route without linked verified CoE stays incomplete", () => {
  const projection = buildProjectWorkflowProjection(
    state({
      students: [student({ id: "visa-offer-only", route: "offer_only" })],
      preparations: [
        preparation({
          applicationId: "visa-offer-only",
          studyEvidenceKind: "offer_only",
        }),
      ],
    })
  );
  const studentEvidence = workflowTasksForTarget(
    projection.tasks,
    "student500_application",
    "visa-offer-only"
  ).find((entry) => entry.stepKey === "study_evidence_coe");
  assert.notEqual(studentEvidence?.progress, "completed");
  assert.ok(
    studentEvidence?.reasonCodes.includes(
      "customer_reported_study_evidence_not_verified"
    )
  );
  assert.equal(
    projection.tasks.some(
      (entry) =>
        entry.targetKind === "school_admission_case" &&
        entry.stepKey === "offer_coe_evidence"
    ),
    false,
    "an Offer-only Student route does not invent an Admissions target"
  );
});

test("Offer evidence copy distinguishes an accepted record from current CoE evidence", () => {
  const english = getProjectWorkflowCopy("en");
  assert.match(
    english.stepDescriptions.offer_coe_evidence,
    /Current valid, independently verified Offer or CoE evidence/u
  );
  assert.match(
    english.stepDescriptions.offer_coe_evidence,
    /acceptance does not establish current Offer validity or a current CoE/u
  );
  assert.match(
    english.reasons.verified_accepted_offer_evidence_recorded,
    /records the Admissions decision only/u
  );

  for (const locale of ["zh-Hans", "zh-Hant"]) {
    const copy = getProjectWorkflowCopy(locale);
    assert.match(copy.stepTitles.offer_coe_evidence, /Offer/u);
    assert.match(copy.stepDescriptions.offer_coe_evidence, /已接受/u);
    assert.match(copy.stepDescriptions.offer_coe_evidence, /Student 500/u);
    assert.match(
      copy.reasons.verified_accepted_offer_evidence_recorded,
      /不證明|不证明/u
    );
  }
});

test("Project State rejects unsupported outcome state and validity metadata", () => {
  const validState = state({
    admissions: [
      admission({
        id: "strict-outcome",
        originKind: "existing_coe",
        outcome: "coe",
        independentlyVerified: true,
        evidenceAttached: true,
      }),
    ],
  });
  assert.ok(parseProjectStateResponse({ state: validState }, project.id));

  const unsupportedState = structuredClone(validState);
  const outcome =
    unsupportedState.matters.standaloneAdmissions?.[0]?.outcomes[0];
  assert.ok(outcome);
  outcome.state = "withdrawn";
  assert.equal(
    parseProjectStateResponse({ state: unsupportedState }, project.id),
    null
  );

  const unsupportedValidity = structuredClone(validState);
  const invalidValidityOutcome =
    unsupportedValidity.matters.standaloneAdmissions?.[0]?.outcomes[0];
  assert.ok(invalidValidityOutcome);
  invalidValidityOutcome.validityState = "current-ish" as never;
  assert.equal(
    parseProjectStateResponse({ state: unsupportedValidity }, project.id),
    null
  );
});

test("archived School history does not imply that its linked Admissions case is archived", () => {
  const projection = buildProjectWorkflowProjection(
    state({
      schools: [school({ id: "archived-school", archived: true })],
      admissions: [
        admission({
          id: "still-readable-case",
          applicationId: "archived-school",
          originKind: "school_application",
          outcome: "coe",
          independentlyVerified: true,
          evidenceAttached: true,
        }),
      ],
    })
  );
  const admissionTasks = workflowTasksForTarget(
    projection.tasks,
    "school_admission_case",
    "still-readable-case"
  );
  assert.equal(
    admissionTasks.find((entry) => entry.stepKey === "offer_coe_evidence")
      ?.progress,
    "completed"
  );
  assert.ok(
    admissionTasks.every(
      (entry) =>
        entry.applicability !== "unavailable" &&
        !entry.reasonCodes.includes("target_archived")
    ),
    "the linked case retains its own authorized read lifecycle"
  );
});

test("verified linked CoE progress is shared once and superseded evidence is not current", () => {
  const verified = admission({
    id: "school-route-admission",
    applicationId: "school-linked",
    originKind: "school_application",
    outcome: "coe",
    independentlyVerified: true,
    evidenceAttached: true,
  });
  const verifiedProjection = buildProjectWorkflowProjection(
    state({
      schools: [school({ id: "school-linked" })],
      admissions: [verified],
      students: [student({ id: "visa-linked", route: "existing_coe" })],
      preparations: [
        preparation({
          applicationId: "visa-linked",
          admissionCaseId: "school-route-admission",
          studyEvidenceKind: "coe_independently_verified",
          independentlyVerified: true,
          current: true,
        }),
      ],
    })
  );
  const verifiedAdmissionTask = workflowTasksForTarget(
    verifiedProjection.tasks,
    "school_admission_case",
    "school-route-admission"
  ).find((entry) => entry.stepKey === "offer_coe_evidence");
  const verifiedStudentTask = workflowTasksForTarget(
    verifiedProjection.tasks,
    "student500_application",
    "visa-linked"
  ).find((entry) => entry.stepKey === "study_evidence_coe");
  assert.equal(verifiedAdmissionTask?.progress, "completed");
  assert.equal(verifiedStudentTask?.progress, "completed");
  assert.equal(verifiedStudentTask?.progressCreditOwner, false);
  assert.equal(verifiedProjection.progress.completedKnownApplicable, 1);

  const superseded = admission({
    id: "school-route-admission",
    applicationId: "school-linked",
    originKind: "school_application",
    outcome: "coe",
    independentlyVerified: true,
    evidenceAttached: true,
    superseded: true,
  });
  const supersededProjection = buildProjectWorkflowProjection(
    state({
      schools: [school({ id: "school-linked" })],
      admissions: [superseded],
    })
  );
  const supersededTask = workflowTasksForTarget(
    supersededProjection.tasks,
    "school_admission_case",
    "school-route-admission"
  ).find((entry) => entry.stepKey === "offer_coe_evidence");
  assert.equal(supersededTask?.progress, "needs_information");
  assert.ok(
    supersededTask?.reasonCodes.includes(
      "offer_coe_outcome_not_current_verified"
    )
  );
  assert.equal(supersededProjection.progress.completedKnownApplicable, 0);
});

test("archived, closed and unavailable states cannot produce positive progress", () => {
  const archived = buildProjectWorkflowProjection(
    state({
      schools: [
        school({ id: "archived-school", archived: true, packageUsable: true }),
      ],
      admissions: [
        admission({
          id: "archived-offer-case",
          applicationId: "archived-school",
          originKind: "existing_offer",
          outcome: "offer",
          independentlyVerified: true,
          evidenceAttached: true,
        }),
      ],
      students: [
        student({ id: "archived-visa", route: "existing_coe", archived: true }),
      ],
      project: { id: project.id, revision: project.revision, status: "closed" },
    })
  );
  assert.equal(archived.progress.completedKnownApplicable, 0);
  assert.equal(archived.progress.percent, null);
  assert.ok(
    archived.tasks
      .filter(
        (entry) =>
          entry.targetId === "archived-school" ||
          entry.targetId === "archived-visa"
      )
      .every(
        (entry) =>
          entry.applicability === "unavailable" && entry.progress === "unknown"
      )
  );
  assert.ok(
    archived.tasks
      .filter((entry) => entry.targetId === "archived-offer-case")
      .every(
        (entry) =>
          entry.applicability === "unavailable" && entry.progress === "unknown"
      )
  );

  const unavailableCapabilities = {
    ...baseCapabilities,
    schoolApplications: { reasonCode: "disabled", state: "disabled" as const },
    schoolAdmissions: {
      reasonCode: "restricted",
      state: "restricted" as const,
    },
    student500: { reasonCode: "offline", state: "unavailable" as const },
  };
  const unavailable = buildProjectWorkflowProjection(
    state({
      schools: null,
      admissions: null,
      students: null,
      capabilities: unavailableCapabilities,
    })
  );
  assert.equal(unavailable.progress.percent, null);
  assert.ok(unavailable.progress.unavailableCount >= 3);
  assert.ok(
    unavailable.tasks.some((entry) =>
      entry.reasonCodes.includes("school_application_source_unavailable")
    )
  );
});

test("fresh M1 readback recomputes only the changed target without persisting workflow counters", () => {
  const beforeState = state({
    schools: [
      school({ id: "school-a", packageUsable: true, revision: 2 }),
      school({ id: "school-b", packageUsable: true, revision: 5 }),
    ],
  });
  const afterState = state({
    schools: [
      school({ id: "school-a", packageStale: true, revision: 3 }),
      school({ id: "school-b", packageUsable: true, revision: 5 }),
    ],
  });
  const before = buildProjectWorkflowProjection(beforeState);
  const after = buildProjectWorkflowProjection(afterState);
  const beforeA = workflowTasksForTarget(
    before.tasks,
    "school_application",
    "school-a"
  );
  const afterA = workflowTasksForTarget(
    after.tasks,
    "school_application",
    "school-a"
  );
  assert.notDeepEqual(afterA, beforeA);
  assert.equal(
    afterA.find((entry) => entry.stepKey === "statements_materials")
      ?.sourceRevision,
    3
  );
  assert.deepEqual(
    workflowTasksForTarget(after.tasks, "school_application", "school-b"),
    workflowTasksForTarget(before.tasks, "school_application", "school-b")
  );
  assert.deepEqual(
    buildProjectJourney(afterState).workflowProjection.progress,
    after.progress
  );
  assert.equal(
    Object.hasOwn(afterState, "workflowProgress"),
    false,
    "progress is derived, never stored in Project State"
  );
});

test("only narrow M1 evidence can complete an outcome task; drafts and READY handoff stay incomplete", () => {
  const projection = buildProjectWorkflowProjection(
    state({
      schools: [school({ id: "school-a", packageUsable: true })],
      admissions: [
        admission({
          id: "managed-case",
          originKind: "existing_offer",
          outcome: "offer",
          independentlyVerified: false,
          evidenceAttached: true,
          serviceMode: "managed_service",
          readiness: "READY",
          preparationState: "prepared",
        }),
      ],
      students: [
        student({
          id: "student-a",
          route: "existing_coe",
          coeStatus: "reported_held",
        }),
      ],
      preparations: [
        preparation({ applicationId: "student-a", drafts: 1, snapshots: 1 }),
      ],
    })
  );
  assert.equal(
    projection.tasks.some((entry) => entry.progress === "completed"),
    false
  );
  assert.equal(
    workflowTasksForTarget(
      projection.tasks,
      "school_application",
      "school-a"
    ).find((entry) => entry.stepKey === "statements_materials")?.progress,
    "in_progress"
  );
  assert.equal(
    workflowTasksForTarget(
      projection.tasks,
      "school_admission_case",
      "managed-case"
    ).find((entry) => entry.stepKey === "external_handoff")?.progress,
    "in_progress"
  );
  assert.ok(
    workflowTasksForTarget(
      projection.tasks,
      "school_admission_case",
      "managed-case"
    )
      .find((entry) => entry.stepKey === "external_handoff")
      ?.reasonCodes.includes("handoff_readiness_does_not_prove_send")
  );
  assert.equal(
    workflowTasksForTarget(
      projection.tasks,
      "student500_application",
      "student-a"
    ).find((entry) => entry.stepKey === "genuine_student_preparation")
      ?.progress,
    "in_progress"
  );
});

test("E2 projection scales locally without introducing a second Project State request", () => {
  const measurements: Array<{
    schools: number;
    m1StateBytes: number;
    e2ProjectionBytes: number;
    journeyBytes: number;
    e2ProjectionMedianMs: number;
    e2ProjectionMaxMs: number;
  }> = [];
  for (const count of [1, 3, 5]) {
    const source = state({
      schools: Array.from({ length: count }, (_, index) =>
        school({
          id: `school-${index + 1}`,
          packageUsable: true,
          revision: index + 1,
        })
      ),
      students: [
        student({ id: "student-combined", route: "no_school_application" }),
      ],
    });
    const samples: number[] = [];
    let result = buildProjectWorkflowProjection(source);
    for (let iteration = 0; iteration < 31; iteration += 1) {
      const start = performance.now();
      result = buildProjectWorkflowProjection(source);
      samples.push(performance.now() - start);
    }
    samples.sort((left, right) => left - right);
    const projection = buildProjectWorkflowProjection(source);
    const journey = buildProjectJourney(source);
    measurements.push({
      e2ProjectionBytes: Buffer.byteLength(JSON.stringify(projection), "utf8"),
      e2ProjectionMedianMs: Number(
        samples[Math.floor(samples.length / 2)].toFixed(3)
      ),
      e2ProjectionMaxMs: Number(Math.max(...samples).toFixed(3)),
      journeyBytes: Buffer.byteLength(JSON.stringify(journey), "utf8"),
      m1StateBytes: Buffer.byteLength(JSON.stringify(source), "utf8"),
      schools: count,
    });
    assert.equal(
      result.tasks.filter(
        (entry) => entry.workflowKind === "school_application"
      ).length,
      count * 7
    );
    assert.equal(
      result.tasks.filter((entry) => entry.workflowKind === "student_500")
        .length,
      7
    );
  }
  const firstJourneyBytes = measurements[0]?.journeyBytes ?? 0;
  const medium = measurements[1];
  const large = measurements[2];
  assert.ok(medium && large);
  assert.ok(medium.journeyBytes > firstJourneyBytes);
  assert.ok(large.journeyBytes > medium.journeyBytes);
  console.log(`E2 projection benchmark ${JSON.stringify(measurements)}`);
  assert.equal(
    projectWorkflowTaskById(
      buildProjectWorkflowProjection(state()).tasks,
      workflowTaskId({
        workflowKind: "project_planning",
        stepKey: "project_goal",
        targetKind: "project",
        targetId: project.id,
      })
    )?.stepKey,
    "project_goal"
  );
});
