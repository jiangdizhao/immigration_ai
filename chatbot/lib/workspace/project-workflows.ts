import type {
  ProjectState,
  ProjectStateAdmission,
  ProjectStateCapabilityState,
  ProjectStateSchoolApplication,
  ProjectStateStudent500,
} from "./project-state";

/**
 * Phase 15 M3-E2: versioned, deterministic task projections over the existing
 * authorized M1 Project State. These definitions are product candidates, not a
 * legal checklist or a second source of mutable business status.
 */
export const PROJECT_WORKFLOW_DEFINITION_VERSION =
  "phase15.project-workflows.v1" as const;

export const PROJECT_WORKFLOW_KINDS = [
  "project_planning",
  "school_application",
  "school_admissions",
  "student_500",
] as const;
export type ProjectWorkflowKind = (typeof PROJECT_WORKFLOW_KINDS)[number];

export const PROJECT_WORKFLOW_STEP_KEYS = [
  "project_goal",
  "workflow_scope",
  "source_coverage",
  "planning",
  "school_discovery",
  "academic_readiness",
  "language_preparation",
  "finance_documents",
  "statements_materials",
  "pre_submission",
  "admissions_planning",
  "admissions_requirements",
  "offer_coe_evidence",
  "external_handoff",
  "visa_planning",
  "study_evidence_coe",
  "genuine_student_preparation",
  "financial_capacity",
  "conditional_supporting_requirements",
  "pre_lodgement",
  "lodgement_events",
] as const;
export type ProjectWorkflowStepKey =
  (typeof PROJECT_WORKFLOW_STEP_KEYS)[number];

export type ProjectWorkflowTargetKind =
  | "project"
  | "school_application"
  | "school_admission_case"
  | "student500_application";

export type TaskApplicability =
  | "applicable"
  | "not_applicable"
  | "unknown"
  | "unavailable";

export type TaskProgress =
  | "not_started"
  | "in_progress"
  | "needs_information"
  | "waiting"
  | "blocked"
  | "completed"
  | "unknown";

export type ProjectWorkflowPanelKind =
  | "planning"
  | "school"
  | "admissions"
  | "student_500"
  | "unavailable";

export type ProjectWorkflowDefinitionV1 = {
  workflowKind: ProjectWorkflowKind;
  definitionVersion: typeof PROJECT_WORKFLOW_DEFINITION_VERSION;
  stepKey: ProjectWorkflowStepKey;
  titleKey: ProjectWorkflowStepKey;
  descriptionKey: ProjectWorkflowStepKey;
  panelKind: ProjectWorkflowPanelKind;
  targetKinds: readonly ProjectWorkflowTargetKind[];
  applicabilityRuleId: string;
  completionRuleId: string;
  dependencyRuleIds: readonly string[];
};

export const PROJECT_WORKFLOW_DEFINITIONS: readonly ProjectWorkflowDefinitionV1[] =
  [
    {
      applicabilityRuleId: "project_exists_for_planning",
      completionRuleId: "no_project_goal_completion_field_in_m1",
      definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
      dependencyRuleIds: [],
      descriptionKey: "project_goal",
      panelKind: "planning",
      stepKey: "project_goal",
      targetKinds: ["project"],
      titleKey: "project_goal",
      workflowKind: "project_planning",
    },
    {
      applicabilityRuleId: "project_scope_requires_confirmed_goal",
      completionRuleId: "scope_unknown_while_project_purpose_unknown",
      definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
      dependencyRuleIds: [],
      descriptionKey: "workflow_scope",
      panelKind: "planning",
      stepKey: "workflow_scope",
      targetKinds: ["project"],
      titleKey: "workflow_scope",
      workflowKind: "project_planning",
    },
    {
      applicabilityRuleId:
        "source_availability_only_when_m1_source_unavailable",
      completionRuleId: "source_coverage_never_completes_business_work",
      definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
      dependencyRuleIds: [],
      descriptionKey: "source_coverage",
      panelKind: "unavailable",
      stepKey: "source_coverage",
      targetKinds: ["project"],
      titleKey: "source_coverage",
      workflowKind: "school_application",
    },
    ...(
      [
        ["planning", "school_planning_is_not_complete_in_m1"],
        [
          "school_discovery",
          "verified_matching_existing_outcome_only_for_not_applicable",
        ],
        [
          "academic_readiness",
          "no_academic_requirement_completion_field_in_m1",
        ],
        [
          "language_preparation",
          "no_language_requirement_completion_field_in_m1",
        ],
        [
          "finance_documents",
          "no_finance_or_document_checklist_completion_field_in_m1",
        ],
        [
          "statements_materials",
          "usable_package_is_in_progress_not_application_completion",
        ],
        [
          "pre_submission",
          "package_readiness_never_proves_external_submission",
        ],
      ] as const
    ).map(([stepKey, completionRuleId]) => ({
      applicabilityRuleId: `school_target_candidate_${stepKey}`,
      completionRuleId,
      definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
      dependencyRuleIds: [],
      descriptionKey: stepKey,
      panelKind: "school" as const,
      stepKey,
      targetKinds: ["school_application"] as const,
      titleKey: stepKey,
      workflowKind: "school_application" as const,
    })),
    {
      applicabilityRuleId:
        "source_availability_only_when_m1_source_unavailable",
      completionRuleId: "source_coverage_never_completes_business_work",
      definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
      dependencyRuleIds: [],
      descriptionKey: "source_coverage",
      panelKind: "unavailable",
      stepKey: "source_coverage",
      targetKinds: ["project"],
      titleKey: "source_coverage",
      workflowKind: "school_admissions",
    },
    ...(
      [
        [
          "admissions_planning",
          "no_admissions_planning_completion_field_in_m1",
        ],
        [
          "admissions_requirements",
          "m1_requirement_rows_do_not_prove_full_checklist_completion",
        ],
        [
          "offer_coe_evidence",
          "current_verified_evidence_or_verified_accepted_offer_recorded",
        ],
        [
          "external_handoff",
          "handoff_readiness_is_not_a_sent_or_received_handoff",
        ],
      ] as const
    ).map(([stepKey, completionRuleId]) => ({
      applicabilityRuleId: `admissions_target_candidate_${stepKey}`,
      completionRuleId,
      definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
      dependencyRuleIds:
        stepKey === "admissions_planning"
          ? ["recorded_school_application_link_only"]
          : [],
      descriptionKey: stepKey,
      panelKind: "admissions" as const,
      stepKey,
      targetKinds: ["school_admission_case"] as const,
      titleKey: stepKey,
      workflowKind: "school_admissions" as const,
    })),
    {
      applicabilityRuleId:
        "source_availability_only_when_m1_source_unavailable",
      completionRuleId: "source_coverage_never_completes_business_work",
      definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
      dependencyRuleIds: [],
      descriptionKey: "source_coverage",
      panelKind: "unavailable",
      stepKey: "source_coverage",
      targetKinds: ["project"],
      titleKey: "source_coverage",
      workflowKind: "student_500",
    },
    ...(
      [
        ["visa_planning", "no_visa_eligibility_or_plan_completion_field_in_m1"],
        [
          "study_evidence_coe",
          "current_independently_verified_coe_context_and_matching_m1_outcome",
        ],
        [
          "genuine_student_preparation",
          "draft_metadata_is_in_progress_not_approval_or_completion",
        ],
        [
          "financial_capacity",
          "current_applicable_financial_rule_and_evidence_not_in_m1",
        ],
        [
          "conditional_supporting_requirements",
          "current_conditional_requirements_not_in_m1",
        ],
        ["pre_lodgement", "no_current_comprehensive_pre_lodgement_check_in_m1"],
        ["lodgement_events", "no_government_lodgement_or_receipt_source_in_m1"],
      ] as const
    ).map(([stepKey, completionRuleId]) => ({
      applicabilityRuleId: `student500_candidate_${stepKey}`,
      completionRuleId,
      definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
      dependencyRuleIds:
        stepKey === "study_evidence_coe"
          ? ["recorded_student_school_dependency_only"]
          : [],
      descriptionKey: stepKey,
      panelKind: "student_500" as const,
      stepKey,
      targetKinds: ["student500_application"] as const,
      titleKey: stepKey,
      workflowKind: "student_500" as const,
    })),
  ];

export type WorkflowSourceRevisionV1 = {
  targetKind: ProjectWorkflowTargetKind;
  targetId: string;
  revision: number;
};

export type WorkflowTaskProjectionV1 = {
  taskId: string;
  workflowKind: ProjectWorkflowKind;
  definitionVersion: typeof PROJECT_WORKFLOW_DEFINITION_VERSION;
  projectId: string;
  stepKey: ProjectWorkflowStepKey;
  targetKind: ProjectWorkflowTargetKind;
  targetId: string;
  applicability: TaskApplicability;
  progress: TaskProgress;
  responsibleActor: "customer" | "external_institution" | "unknown";
  reasonCodes: readonly string[];
  /** Only exact recorded M1 relationships are represented. They are contextual links, not ordering gates. */
  dependencies: readonly string[];
  dependencySemantics: "recorded_relationship_only" | "none";
  sourceRevision: number | null;
  sourceRevisions: readonly WorkflowSourceRevisionV1[];
  actionability: "read_only" | "unavailable";
  panelKind: ProjectWorkflowPanelKind;
  /** Related views of the same exact evidence record share one progress credit. */
  progressCreditKey: string | null;
  progressCreditOwner: boolean;
};

export type ProjectProgressV1 = {
  definitionVersion: typeof PROJECT_WORKFLOW_DEFINITION_VERSION;
  completedKnownApplicable: number;
  knownApplicableTotal: number;
  unknownApplicabilityCount: number;
  unavailableCount: number;
  notApplicableCount: number;
  unknownProgressCount: number;
  coverage: "complete" | "partial" | "unavailable";
  percent: number | null;
};

export type ProjectWorkflowProjectionV1 = {
  definitionVersion: typeof PROJECT_WORKFLOW_DEFINITION_VERSION;
  tasks: WorkflowTaskProjectionV1[];
  progress: ProjectProgressV1;
};

const definitionByIdentity = new Map(
  PROJECT_WORKFLOW_DEFINITIONS.map((definition) => [
    `${definition.workflowKind}:${definition.stepKey}`,
    definition,
  ])
);

function definition(
  workflowKind: ProjectWorkflowKind,
  stepKey: ProjectWorkflowStepKey
): ProjectWorkflowDefinitionV1 {
  const result = definitionByIdentity.get(`${workflowKind}:${stepKey}`);
  if (!result) {
    throw new Error(
      `project_workflow_definition_missing:${workflowKind}:${stepKey}`
    );
  }
  return result;
}

export function workflowTaskId(input: {
  workflowKind: ProjectWorkflowKind;
  stepKey: ProjectWorkflowStepKey;
  targetKind: ProjectWorkflowTargetKind;
  targetId: string;
}): string {
  return [
    PROJECT_WORKFLOW_DEFINITION_VERSION,
    input.workflowKind,
    input.stepKey,
    input.targetKind,
    encodeURIComponent(input.targetId),
  ].join(":");
}

function task(input: {
  projectId: string;
  workflowKind: ProjectWorkflowKind;
  stepKey: ProjectWorkflowStepKey;
  targetKind: ProjectWorkflowTargetKind;
  targetId: string;
  applicability: TaskApplicability;
  progress: TaskProgress;
  responsibleActor?: WorkflowTaskProjectionV1["responsibleActor"];
  reasonCodes?: readonly string[];
  sourceRevisions?: readonly WorkflowSourceRevisionV1[];
  dependencies?: readonly string[];
  actionability?: WorkflowTaskProjectionV1["actionability"];
  progressCreditKey?: string | null;
  progressCreditOwner?: boolean;
}): WorkflowTaskProjectionV1 {
  const stepDefinition = definition(input.workflowKind, input.stepKey);
  const uniqueSourceRevisions = deduplicateSourceRevisions(
    input.sourceRevisions ?? []
  );
  const dependencies = [...new Set(input.dependencies ?? [])];
  return {
    actionability: input.actionability ?? "read_only",
    applicability: input.applicability,
    dependencies,
    dependencySemantics:
      dependencies.length > 0 ? "recorded_relationship_only" : "none",
    definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
    panelKind: stepDefinition.panelKind,
    progress: input.progress,
    progressCreditKey: input.progressCreditKey ?? null,
    progressCreditOwner: input.progressCreditOwner ?? true,
    projectId: input.projectId,
    reasonCodes: [...new Set(input.reasonCodes ?? [])],
    responsibleActor: input.responsibleActor ?? "unknown",
    sourceRevision: uniqueSourceRevisions[0]?.revision ?? null,
    sourceRevisions: uniqueSourceRevisions,
    stepKey: input.stepKey,
    targetId: input.targetId,
    targetKind: input.targetKind,
    taskId: workflowTaskId(input),
    workflowKind: input.workflowKind,
  };
}

function deduplicateSourceRevisions(
  sourceRevisions: readonly WorkflowSourceRevisionV1[]
): WorkflowSourceRevisionV1[] {
  return sourceRevisions.filter(
    (entry, index) =>
      sourceRevisions.findIndex(
        (candidate) =>
          candidate.targetKind === entry.targetKind &&
          candidate.targetId === entry.targetId
      ) === index
  );
}

function revision(
  targetKind: ProjectWorkflowTargetKind,
  targetId: string,
  revisionNumber: number
): WorkflowSourceRevisionV1 {
  return { revision: revisionNumber, targetId, targetKind };
}

function applicableTask(input: {
  projectId: string;
  workflowKind: ProjectWorkflowKind;
  stepKey: ProjectWorkflowStepKey;
  targetKind: ProjectWorkflowTargetKind;
  targetId: string;
  revision: WorkflowSourceRevisionV1;
  progress: TaskProgress;
  reasonCodes?: readonly string[];
  sourceRevisions?: readonly WorkflowSourceRevisionV1[];
  dependencies?: readonly string[];
  responsibleActor?: WorkflowTaskProjectionV1["responsibleActor"];
  progressCreditKey?: string | null;
  progressCreditOwner?: boolean;
}): WorkflowTaskProjectionV1 {
  return task({
    ...input,
    applicability: "applicable",
    dependencies: input.dependencies,
    sourceRevisions: [input.revision, ...(input.sourceRevisions ?? [])],
  });
}

function unavailableTask(input: {
  projectId: string;
  workflowKind: ProjectWorkflowKind;
  stepKey: ProjectWorkflowStepKey;
  targetKind: ProjectWorkflowTargetKind;
  targetId: string;
  reasonCode: string;
  sourceRevisions?: readonly WorkflowSourceRevisionV1[];
}): WorkflowTaskProjectionV1 {
  return task({
    ...input,
    actionability: "unavailable",
    applicability: "unavailable",
    progress: "unknown",
    reasonCodes: [input.reasonCode],
  });
}

function unknownTask(input: {
  projectId: string;
  workflowKind: ProjectWorkflowKind;
  stepKey: ProjectWorkflowStepKey;
  targetKind: ProjectWorkflowTargetKind;
  targetId: string;
  reasonCode: string;
  revision?: WorkflowSourceRevisionV1;
  sourceRevisions?: readonly WorkflowSourceRevisionV1[];
  actionability?: WorkflowTaskProjectionV1["actionability"];
}): WorkflowTaskProjectionV1 {
  return task({
    ...input,
    applicability: "unknown",
    progress: "unknown",
    reasonCodes: [input.reasonCode],
    sourceRevisions: [
      ...(input.revision ? [input.revision] : []),
      ...(input.sourceRevisions ?? []),
    ],
  });
}

function sourceCapability(
  state: ProjectState,
  key:
    | "schoolApplications"
    | "schoolAdmissions"
    | "student500"
    | "student500Preparation"
    | "projectDocuments"
): ProjectStateCapabilityState {
  return state.capabilities[key].state;
}

function isAvailable(capability: ProjectStateCapabilityState): boolean {
  return capability === "available";
}

function isVerifiedOutcome(
  outcome: ProjectStateAdmission["outcomes"][number],
  expectedKind: "offer" | "coe"
): boolean {
  return (
    outcome.kind === expectedKind &&
    outcome.independentlyVerified &&
    outcome.evidenceAttached &&
    !outcome.superseded
  );
}

/**
 * Evidence verification and current validity are separate source facts. Only
 * non-terminal domain states with a positive current validity observation can
 * be credited by a workflow projection.
 */
function isCurrentValidOutcome(
  outcome: ProjectStateAdmission["outcomes"][number]
): boolean {
  const currentValidity =
    outcome.validityState === "valid" ||
    outcome.validityState === "expiring_soon";
  const activeDomainState =
    outcome.kind === "offer"
      ? ["received", "under_review", "deferred"].includes(outcome.state)
      : ["claimed", "obtained"].includes(outcome.state);
  return currentValidity && activeDomainState && !outcome.superseded;
}

function isVerifiedCurrentOutcome(
  outcome: ProjectStateAdmission["outcomes"][number],
  expectedKind: "offer" | "coe"
): boolean {
  return (
    isVerifiedOutcome(outcome, expectedKind) && isCurrentValidOutcome(outcome)
  );
}

/**
 * An accepted Offer is a recorded Admissions decision, not a currently valid
 * Offer or a CoE. The service reports `not_applicable` for terminal Offer
 * states, so require that exact observation alongside the verified evidence.
 */
function isVerifiedAcceptedOffer(
  outcome: ProjectStateAdmission["outcomes"][number]
): boolean {
  return (
    isVerifiedOutcome(outcome, "offer") &&
    outcome.state === "accepted" &&
    outcome.validityState === "not_applicable"
  );
}

function outcomeForOrigin(
  admission: ProjectStateAdmission
): ProjectStateAdmission["outcomes"][number] | null {
  const expectedKind =
    admission.originKind === "existing_offer"
      ? "offer"
      : admission.originKind === "existing_coe"
        ? "coe"
        : null;
  if (!expectedKind) {
    return null;
  }
  return (
    admission.outcomes.find(
      (outcome) =>
        isVerifiedCurrentOutcome(outcome, expectedKind) ||
        (expectedKind === "offer" && isVerifiedAcceptedOffer(outcome))
    ) ?? null
  );
}

function currentVerifiedOutcome(
  admission: ProjectStateAdmission
): ProjectStateAdmission["outcomes"][number] | null {
  return (
    admission.outcomes.find((outcome) =>
      isVerifiedCurrentOutcome(outcome, "coe")
    ) ??
    admission.outcomes.find((outcome) =>
      isVerifiedCurrentOutcome(outcome, "offer")
    ) ??
    null
  );
}

function admissionEvidenceOutcome(
  admission: ProjectStateAdmission
): ProjectStateAdmission["outcomes"][number] | null {
  return (
    currentVerifiedOutcome(admission) ??
    admission.outcomes.find((outcome) => isVerifiedAcceptedOffer(outcome)) ??
    null
  );
}

function taskResponsibleActor(
  state: ProjectState,
  targetKind: ProjectWorkflowTargetKind,
  targetId: string
): WorkflowTaskProjectionV1["responsibleActor"] {
  const actors = new Set(
    state.nextActions
      .filter(
        (action) =>
          action.targetKind === targetKind && action.targetId === targetId
      )
      .map((action) => action.responsibleActor)
  );
  return actors.size === 1 ? [...actors][0] : "unknown";
}

function archivedSchool(application: ProjectStateSchoolApplication): boolean {
  return application.progress === "archived";
}

function archivedStudent(application: ProjectStateStudent500): boolean {
  return application.progress === "archived";
}

function archivedAdmission(admission: ProjectStateAdmission): boolean {
  return admission.progress === "archived";
}

function archivedTargetTasks(input: {
  state: ProjectState;
  workflowKind: ProjectWorkflowKind;
  stepKeys: readonly ProjectWorkflowStepKey[];
  targetKind: ProjectWorkflowTargetKind;
  targetId: string;
  revision: WorkflowSourceRevisionV1;
}): WorkflowTaskProjectionV1[] {
  return input.stepKeys.map((stepKey) =>
    unavailableTask({
      projectId: input.state.project.id,
      reasonCode: "target_archived",
      sourceRevisions: [input.revision],
      stepKey,
      targetId: input.targetId,
      targetKind: input.targetKind,
      workflowKind: input.workflowKind,
    })
  );
}

function schoolTasks(
  state: ProjectState,
  application: ProjectStateSchoolApplication
): WorkflowTaskProjectionV1[] {
  const targetKind = "school_application" as const;
  const targetId = application.applicationId;
  const ownRevision = revision(
    targetKind,
    targetId,
    application.provenance.revision
  );
  const stepKeys = [
    "planning",
    "school_discovery",
    "academic_readiness",
    "language_preparation",
    "finance_documents",
    "statements_materials",
    "pre_submission",
  ] as const;
  if (archivedSchool(application)) {
    return archivedTargetTasks({
      state,
      workflowKind: "school_application",
      stepKeys,
      targetId,
      targetKind,
      revision: ownRevision,
    });
  }

  const tasks: WorkflowTaskProjectionV1[] = [];
  tasks.push(
    applicableTask({
      projectId: state.project.id,
      workflowKind: "school_application",
      stepKey: "planning",
      targetKind,
      targetId,
      revision: ownRevision,
      progress: "needs_information",
      reasonCodes: ["project_purpose_not_recorded", "planning_not_completed"],
      sourceRevisions: [
        revision("project", state.project.id, state.project.revision),
      ],
      responsibleActor: taskResponsibleActor(state, targetKind, targetId),
    })
  );

  const linkedAdmission = application.linkedAdmissionsCase;
  const verifiedAlternativeOutcome =
    linkedAdmission && !archivedAdmission(linkedAdmission)
      ? outcomeForOrigin(linkedAdmission)
      : null;
  if (linkedAdmission && verifiedAlternativeOutcome) {
    const reasonCode = isVerifiedAcceptedOffer(verifiedAlternativeOutcome)
      ? "verified_accepted_offer_route"
      : "verified_existing_offer_or_coe_route";
    tasks.push(
      task({
        projectId: state.project.id,
        workflowKind: "school_application",
        stepKey: "school_discovery",
        targetKind,
        targetId,
        applicability: "not_applicable",
        progress: "unknown",
        reasonCodes: [reasonCode],
        sourceRevisions: [
          ownRevision,
          revision(
            "school_admission_case",
            linkedAdmission.caseId,
            linkedAdmission.provenance.revision
          ),
        ],
      })
    );
  } else if (application.source.independentlyVerified === false) {
    tasks.push(
      unavailableTask({
        projectId: state.project.id,
        workflowKind: "school_application",
        stepKey: "school_discovery",
        targetKind,
        targetId,
        reasonCode: "school_course_source_unverified",
        sourceRevisions: [ownRevision],
      })
    );
  } else {
    tasks.push(
      unknownTask({
        projectId: state.project.id,
        workflowKind: "school_application",
        stepKey: "school_discovery",
        targetKind,
        targetId,
        reasonCode: "school_discovery_completion_not_recorded",
        revision: ownRevision,
      })
    );
  }

  tasks.push(
    unavailableTask({
      projectId: state.project.id,
      workflowKind: "school_application",
      stepKey: "academic_readiness",
      targetKind,
      targetId,
      reasonCode: "current_school_requirements_unavailable",
      sourceRevisions: [ownRevision],
    }),
    unavailableTask({
      projectId: state.project.id,
      workflowKind: "school_application",
      stepKey: "language_preparation",
      targetKind,
      targetId,
      reasonCode: "current_school_requirements_unavailable",
      sourceRevisions: [ownRevision],
    })
  );

  const documentCapability = sourceCapability(state, "projectDocuments");
  tasks.push(
    documentCapability === "available"
      ? unknownTask({
          projectId: state.project.id,
          workflowKind: "school_application",
          stepKey: "finance_documents",
          targetKind,
          targetId,
          reasonCode: "specific_document_requirements_not_in_m1",
          revision: ownRevision,
        })
      : unavailableTask({
          projectId: state.project.id,
          workflowKind: "school_application",
          stepKey: "finance_documents",
          targetKind,
          targetId,
          reasonCode: "project_documents_capability_unavailable",
          sourceRevisions: [ownRevision],
        })
  );

  const hasMissingInformation = application.missingInformationCodes.length > 0;
  const packageStale =
    application.package !== null &&
    (!application.package.usable ||
      application.package.staleReasonCodes.length > 0);
  tasks.push(
    applicableTask({
      projectId: state.project.id,
      workflowKind: "school_application",
      stepKey: "statements_materials",
      targetKind,
      targetId,
      revision: ownRevision,
      progress:
        hasMissingInformation || packageStale
          ? "needs_information"
          : application.package
            ? "in_progress"
            : "not_started",
      reasonCodes: [
        ...(hasMissingInformation
          ? ["school_materials_have_missing_information"]
          : []),
        ...(packageStale ? ["school_package_stale_or_unusable"] : []),
        ...(application.package?.usable && !packageStale
          ? ["usable_package_is_preparation_not_completion"]
          : []),
        ...(application.package ? [] : ["school_package_not_recorded"]),
      ],
      responsibleActor: taskResponsibleActor(state, targetKind, targetId),
    })
  );

  tasks.push(
    applicableTask({
      projectId: state.project.id,
      workflowKind: "school_application",
      stepKey: "pre_submission",
      targetKind,
      targetId,
      revision: ownRevision,
      progress:
        hasMissingInformation || packageStale || application.package === null
          ? "needs_information"
          : "in_progress",
      reasonCodes: [
        ...(hasMissingInformation
          ? ["school_materials_have_missing_information"]
          : []),
        ...(packageStale ? ["school_package_stale_or_unusable"] : []),
        ...(application.package ? [] : ["school_package_not_recorded"]),
        ...(application.package?.usable && !packageStale
          ? ["package_does_not_prove_school_submission"]
          : []),
      ],
      sourceRevisions: linkedAdmission
        ? [
            revision(
              "school_admission_case",
              linkedAdmission.caseId,
              linkedAdmission.provenance.revision
            ),
          ]
        : [],
      responsibleActor: taskResponsibleActor(state, targetKind, targetId),
    })
  );
  return tasks;
}

function allAdmissions(state: ProjectState): ProjectStateAdmission[] | null {
  if (state.matters.standaloneAdmissions === null) {
    return null;
  }
  const result = new Map<string, ProjectStateAdmission>();
  for (const admission of state.matters.standaloneAdmissions) {
    result.set(admission.caseId, admission);
  }
  for (const admission of state.matters.unresolvedLinkedAdmissions ?? []) {
    result.set(admission.caseId, admission);
  }
  for (const application of state.matters.schoolApplications ?? []) {
    if (application.linkedAdmissionsCase) {
      result.set(
        application.linkedAdmissionsCase.caseId,
        application.linkedAdmissionsCase
      );
    }
  }
  return [...result.values()];
}

function admissionTaskProgress(
  admission: ProjectStateAdmission,
  state: ProjectState
): WorkflowTaskProjectionV1[] {
  const targetKind = "school_admission_case" as const;
  const targetId = admission.caseId;
  const ownRevision = revision(
    targetKind,
    targetId,
    admission.provenance.revision
  );
  const stepKeys = [
    "admissions_planning",
    "admissions_requirements",
    "offer_coe_evidence",
    "external_handoff",
  ] as const;
  if (archivedAdmission(admission)) {
    return archivedTargetTasks({
      state,
      workflowKind: "school_admissions",
      stepKeys,
      targetId,
      targetKind,
      revision: ownRevision,
    });
  }

  const actor = taskResponsibleActor(state, targetKind, targetId);
  const linkedSchoolApplication =
    admission.schoolApplicationLinkState === "available" &&
    admission.linkedSchoolApplicationId
      ? (state.matters.schoolApplications?.find(
          (application) =>
            application.applicationId === admission.linkedSchoolApplicationId
        ) ?? null)
      : null;
  const linkedSchoolDependency = linkedSchoolApplication
    ? workflowTaskId({
        workflowKind: "school_application",
        stepKey: "statements_materials",
        targetKind: "school_application",
        targetId: linkedSchoolApplication.applicationId,
      })
    : null;
  const tasks: WorkflowTaskProjectionV1[] = [];
  const planningProgress: TaskProgress =
    admission.schoolApplicationLinkState === "unavailable"
      ? "unknown"
      : admission.nextStepCodes.includes("complete_application_details")
        ? "needs_information"
        : admission.preparationState === "not_started"
          ? "not_started"
          : admission.progress === "waiting"
            ? "waiting"
            : admission.progress === "blocked"
              ? "blocked"
              : "in_progress";
  tasks.push(
    applicableTask({
      projectId: state.project.id,
      workflowKind: "school_admissions",
      stepKey: "admissions_planning",
      targetKind,
      targetId,
      revision: ownRevision,
      progress: planningProgress,
      reasonCodes: [
        ...(admission.schoolApplicationLinkState === "unavailable"
          ? ["linked_school_target_unavailable"]
          : []),
        ...(admission.preparationState === "not_started"
          ? ["admissions_preparation_not_started"]
          : []),
      ],
      dependencies: linkedSchoolDependency ? [linkedSchoolDependency] : [],
      sourceRevisions: linkedSchoolApplication
        ? [
            revision(
              "school_application",
              linkedSchoolApplication.applicationId,
              linkedSchoolApplication.provenance.revision
            ),
          ]
        : [],
      responsibleActor: actor,
    })
  );

  if (admission.requirements.length === 0) {
    tasks.push(
      unknownTask({
        projectId: state.project.id,
        workflowKind: "school_admissions",
        stepKey: "admissions_requirements",
        targetKind,
        targetId,
        reasonCode: "admissions_requirements_not_recorded",
        revision: ownRevision,
      })
    );
  } else {
    const missing = admission.requirements.some((entry) =>
      ["missing", "conflicting"].includes(entry.status)
    );
    const unknown = admission.requirements.some((entry) =>
      ["unknown", "unverified"].includes(entry.status)
    );
    tasks.push(
      applicableTask({
        projectId: state.project.id,
        workflowKind: "school_admissions",
        stepKey: "admissions_requirements",
        targetKind,
        targetId,
        revision: ownRevision,
        progress: missing
          ? "needs_information"
          : unknown
            ? "unknown"
            : "in_progress",
        reasonCodes: [
          ...(missing ? ["admissions_requirement_gap_recorded"] : []),
          ...(unknown ? ["admissions_requirement_verification_unknown"] : []),
          ...(!missing && !unknown
            ? ["m1_requirement_rows_not_comprehensive_completion_proof"]
            : []),
        ],
        responsibleActor: actor,
      })
    );
  }

  const outcome = admissionEvidenceOutcome(admission);
  const originRequiresOutcome =
    admission.originKind === "existing_offer" ||
    admission.originKind === "existing_coe";
  if (outcome) {
    tasks.push(
      applicableTask({
        projectId: state.project.id,
        workflowKind: "school_admissions",
        stepKey: "offer_coe_evidence",
        targetKind,
        targetId,
        revision: ownRevision,
        progress: "completed",
        reasonCodes: [
          isVerifiedAcceptedOffer(outcome)
            ? "verified_accepted_offer_evidence_recorded"
            : "verified_outcome_evidence_recorded",
        ],
        progressCreditKey: `outcome:${outcome.outcomeId}`,
        responsibleActor: actor,
      })
    );
  } else if (admission.outcomes.length > 0) {
    tasks.push(
      applicableTask({
        projectId: state.project.id,
        workflowKind: "school_admissions",
        stepKey: "offer_coe_evidence",
        targetKind,
        targetId,
        revision: ownRevision,
        progress: "needs_information",
        reasonCodes: ["offer_coe_outcome_not_current_verified"],
        responsibleActor: actor,
      })
    );
  } else if (originRequiresOutcome) {
    tasks.push(
      applicableTask({
        projectId: state.project.id,
        workflowKind: "school_admissions",
        stepKey: "offer_coe_evidence",
        targetKind,
        targetId,
        revision: ownRevision,
        progress:
          admission.outcomes.length > 0 ? "needs_information" : "unknown",
        reasonCodes: [
          admission.outcomes.length > 0
            ? "offer_coe_not_independently_verified"
            : "offer_coe_evidence_not_recorded",
        ],
        responsibleActor: actor,
      })
    );
  } else {
    tasks.push(
      unknownTask({
        projectId: state.project.id,
        workflowKind: "school_admissions",
        stepKey: "offer_coe_evidence",
        targetKind,
        targetId,
        reasonCode:
          admission.originKind === "claimed_exception"
            ? "claimed_exception_not_verified"
            : "future_offer_or_coe_not_recorded",
        revision: ownRevision,
      })
    );
  }

  if (admission.serviceMode === "self_service") {
    tasks.push(
      task({
        projectId: state.project.id,
        workflowKind: "school_admissions",
        stepKey: "external_handoff",
        targetKind,
        targetId,
        applicability: "not_applicable",
        progress: "unknown",
        reasonCodes: ["self_service_has_no_managed_handoff"],
        sourceRevisions: [ownRevision],
        responsibleActor: actor,
      })
    );
  } else {
    const status = admission.externalHandoff.status;
    const handoffProgress: TaskProgress =
      status === "READY"
        ? "in_progress"
        : status === "NOT_READY"
          ? "needs_information"
          : "unknown";
    tasks.push(
      applicableTask({
        projectId: state.project.id,
        workflowKind: "school_admissions",
        stepKey: "external_handoff",
        targetKind,
        targetId,
        revision: ownRevision,
        progress: handoffProgress,
        reasonCodes: [
          status === "READY"
            ? "handoff_readiness_does_not_prove_send"
            : status === "NOT_READY"
              ? "managed_handoff_not_ready"
              : "managed_handoff_status_unknown",
          ...(admission.externalActions.length > 0
            ? ["customer_reported_external_action_unverified"]
            : []),
        ],
        responsibleActor: actor,
      })
    );
  }
  return tasks;
}

function student500Tasks(
  state: ProjectState,
  application: ProjectStateStudent500
): WorkflowTaskProjectionV1[] {
  const targetKind = "student500_application" as const;
  const targetId = application.applicationId;
  const ownRevision = revision(
    targetKind,
    targetId,
    application.provenance.revision
  );
  const stepKeys = [
    "visa_planning",
    "study_evidence_coe",
    "genuine_student_preparation",
    "financial_capacity",
    "conditional_supporting_requirements",
    "pre_lodgement",
    "lodgement_events",
  ] as const;
  if (archivedStudent(application)) {
    return archivedTargetTasks({
      state,
      workflowKind: "student_500",
      stepKeys,
      targetId,
      targetKind,
      revision: ownRevision,
    });
  }

  const actor = taskResponsibleActor(state, targetKind, targetId);
  const tasks: WorkflowTaskProjectionV1[] = [];
  tasks.push(
    application.routeState === "recorded"
      ? applicableTask({
          projectId: state.project.id,
          workflowKind: "student_500",
          stepKey: "visa_planning",
          targetKind,
          targetId,
          revision: ownRevision,
          progress:
            application.missingInformationCodes.length > 0
              ? "needs_information"
              : application.progress === "not_started"
                ? "not_started"
                : "in_progress",
          reasonCodes: [
            "route_recorded_customer_context_only",
            ...(application.missingInformationCodes.length > 0
              ? ["student_context_missing_information"]
              : []),
          ],
          responsibleActor: actor,
        })
      : unknownTask({
          projectId: state.project.id,
          workflowKind: "student_500",
          stepKey: "visa_planning",
          targetKind,
          targetId,
          reasonCode: "student_route_not_recorded",
          revision: ownRevision,
        })
  );

  const prepCapability = sourceCapability(state, "student500Preparation");
  const studyContext = application.preparation.schoolContext;
  const studentDependency = application.schoolDependency;
  const linkedAdmission =
    studentDependency.state === "linked" &&
    "admissionCaseId" in studentDependency
      ? (allAdmissions(state)?.find(
          (entry) => entry.caseId === studentDependency.admissionCaseId
        ) ?? null)
      : null;
  const linkedCoeOutcome =
    linkedAdmission?.outcomes.find((outcome) => outcome.kind === "coe") ?? null;
  const verifiedStudentCoe = Boolean(
    application.routeState === "recorded" &&
      studentDependency.state === "linked" &&
      linkedAdmission &&
      !archivedAdmission(linkedAdmission) &&
      studyContext &&
      studyContext.kind === "admission_case" &&
      studyContext.current &&
      studyContext.independentlyVerified &&
      studyContext.studyEvidenceKind === "coe_independently_verified" &&
      linkedAdmission.outcomes.some((outcome) =>
        isVerifiedCurrentOutcome(outcome, "coe")
      )
  );
  const verifiedStudentOutcome = verifiedStudentCoe
    ? (linkedAdmission?.outcomes.find((outcome) =>
        isVerifiedCurrentOutcome(outcome, "coe")
      ) ?? null)
    : null;

  if (application.routeState === "unknown") {
    tasks.push(
      unknownTask({
        projectId: state.project.id,
        workflowKind: "student_500",
        stepKey: "study_evidence_coe",
        targetKind,
        targetId,
        reasonCode: "student_study_route_and_evidence_unknown",
        revision: ownRevision,
      })
    );
  } else if (!isAvailable(prepCapability)) {
    tasks.push(
      unavailableTask({
        projectId: state.project.id,
        workflowKind: "student_500",
        stepKey: "study_evidence_coe",
        targetKind,
        targetId,
        reasonCode: "student_preparation_source_unavailable",
        sourceRevisions: [ownRevision],
      })
    );
  } else if (verifiedStudentCoe && verifiedStudentOutcome && linkedAdmission) {
    tasks.push(
      applicableTask({
        projectId: state.project.id,
        workflowKind: "student_500",
        stepKey: "study_evidence_coe",
        targetKind,
        targetId,
        revision: ownRevision,
        sourceRevisions: [
          revision(
            "school_admission_case",
            linkedAdmission.caseId,
            linkedAdmission.provenance.revision
          ),
        ],
        progress: "completed",
        reasonCodes: ["current_independently_verified_coe_recorded"],
        progressCreditKey: `outcome:${verifiedStudentOutcome.outcomeId}`,
        progressCreditOwner: false,
        responsibleActor: actor,
      })
    );
  } else if (
    linkedAdmission &&
    !archivedAdmission(linkedAdmission) &&
    linkedCoeOutcome &&
    isVerifiedOutcome(linkedCoeOutcome, "coe")
  ) {
    tasks.push(
      applicableTask({
        projectId: state.project.id,
        workflowKind: "student_500",
        stepKey: "study_evidence_coe",
        targetKind,
        targetId,
        revision: ownRevision,
        progress: "needs_information",
        reasonCodes: ["verified_coe_current_validity_not_established"],
        sourceRevisions: [
          revision(
            "school_admission_case",
            linkedAdmission.caseId,
            linkedAdmission.provenance.revision
          ),
        ],
        responsibleActor: actor,
      })
    );
  } else if (
    application.coeStatus === "reported_held" ||
    studyContext?.studyEvidenceKind === "coe_reported" ||
    studyContext?.studyEvidenceKind === "offer_only"
  ) {
    tasks.push(
      applicableTask({
        projectId: state.project.id,
        workflowKind: "student_500",
        stepKey: "study_evidence_coe",
        targetKind,
        targetId,
        revision: ownRevision,
        progress: "needs_information",
        reasonCodes: ["customer_reported_study_evidence_not_verified"],
        sourceRevisions: linkedAdmission
          ? [
              revision(
                "school_admission_case",
                linkedAdmission.caseId,
                linkedAdmission.provenance.revision
              ),
            ]
          : [],
        responsibleActor: actor,
      })
    );
  } else if (studentDependency.state === "unavailable") {
    tasks.push(
      unavailableTask({
        projectId: state.project.id,
        workflowKind: "student_500",
        stepKey: "study_evidence_coe",
        targetKind,
        targetId,
        reasonCode: "recorded_study_evidence_target_unavailable",
        sourceRevisions: [ownRevision],
      })
    );
  } else {
    tasks.push(
      applicableTask({
        projectId: state.project.id,
        workflowKind: "student_500",
        stepKey: "study_evidence_coe",
        targetKind,
        targetId,
        revision: ownRevision,
        progress:
          application.coeStatus === "reported_not_held"
            ? "needs_information"
            : "unknown",
        reasonCodes: [
          studentDependency.state === "not_applicable"
            ? "no_platform_school_dependency_required"
            : "study_evidence_not_independently_verified",
        ],
        responsibleActor: actor,
      })
    );
  }

  const prepReadable = application.preparation.state === "available";
  const hasDrafts = application.preparation.drafts.length > 0;
  const hasCurrentDraft = application.preparation.drafts.some(
    (draft) => !draft.stale
  );
  tasks.push(
    !prepReadable && application.preparation.state !== "not_recorded"
      ? unavailableTask({
          projectId: state.project.id,
          workflowKind: "student_500",
          stepKey: "genuine_student_preparation",
          targetKind,
          targetId,
          reasonCode: "student_preparation_source_unavailable",
          sourceRevisions: [ownRevision],
        })
      : task({
          projectId: state.project.id,
          workflowKind: "student_500",
          stepKey: "genuine_student_preparation",
          targetKind,
          targetId,
          applicability: "unknown",
          progress: prepReadable
            ? hasCurrentDraft
              ? "in_progress"
              : hasDrafts
                ? "needs_information"
                : "not_started"
            : "unknown",
          reasonCodes: [
            hasCurrentDraft
              ? "student_draft_metadata_recorded_not_complete"
              : hasDrafts
                ? "student_drafts_stale"
                : "no_student_draft_recorded_and_applicability_unknown",
          ],
          actionability: "read_only",
          sourceRevisions: [ownRevision],
          responsibleActor: actor,
        })
  );

  const legalSourceAvailable =
    application.sourceVerification === "verified_official_corpus" &&
    application.preparation.snapshots.some(
      (snapshot) => !snapshot.stale && snapshot.legalCurrentness === "current"
    );
  const legalTaskStepKeys = [
    "financial_capacity",
    "conditional_supporting_requirements",
    "pre_lodgement",
  ] as const;
  for (const stepKey of legalTaskStepKeys) {
    tasks.push(
      legalSourceAvailable
        ? unknownTask({
            projectId: state.project.id,
            workflowKind: "student_500",
            stepKey,
            targetKind,
            targetId,
            reasonCode: "current_personal_applicability_not_exposed_by_m1",
            revision: ownRevision,
          })
        : unavailableTask({
            projectId: state.project.id,
            workflowKind: "student_500",
            stepKey,
            targetKind,
            targetId,
            reasonCode: "current_legal_source_or_applicability_unavailable",
            sourceRevisions: [ownRevision],
          })
    );
  }

  tasks.push(
    unavailableTask({
      projectId: state.project.id,
      workflowKind: "student_500",
      stepKey: "lodgement_events",
      targetKind,
      targetId,
      reasonCode: "government_lodgement_and_receipt_not_in_m1",
      sourceRevisions: [ownRevision],
    })
  );

  if (
    studentDependency.state === "linked" &&
    "schoolApplicationId" in studentDependency
  ) {
    const linkedSchool = state.matters.schoolApplications?.find(
      (entry) => entry.applicationId === studentDependency.schoolApplicationId
    );
    const dependency = linkedSchool
      ? workflowTaskId({
          workflowKind: "school_application",
          stepKey: "statements_materials",
          targetKind: "school_application",
          targetId: linkedSchool.applicationId,
        })
      : null;
    const index = tasks.findIndex(
      (entry) => entry.stepKey === "study_evidence_coe"
    );
    if (dependency && index >= 0 && linkedSchool) {
      tasks[index] = {
        ...tasks[index],
        dependencies: [dependency],
        dependencySemantics: "recorded_relationship_only",
        sourceRevisions: deduplicateSourceRevisions([
          ...tasks[index].sourceRevisions,
          revision(
            "school_application",
            linkedSchool.applicationId,
            linkedSchool.provenance.revision
          ),
        ]),
      };
    }
  } else if (
    studentDependency.state === "linked" &&
    "admissionCaseId" in studentDependency
  ) {
    const linked = allAdmissions(state)?.find(
      (entry) => entry.caseId === studentDependency.admissionCaseId
    );
    const dependency = linked
      ? workflowTaskId({
          workflowKind: "school_admissions",
          stepKey: "offer_coe_evidence",
          targetKind: "school_admission_case",
          targetId: linked.caseId,
        })
      : null;
    const index = tasks.findIndex(
      (entry) => entry.stepKey === "study_evidence_coe"
    );
    if (dependency && index >= 0 && linked) {
      tasks[index] = {
        ...tasks[index],
        dependencies: [dependency],
        dependencySemantics: "recorded_relationship_only",
        sourceRevisions: deduplicateSourceRevisions([
          ...tasks[index].sourceRevisions,
          revision(
            "school_admission_case",
            linked.caseId,
            linked.provenance.revision
          ),
        ]),
      };
    }
  }

  return tasks;
}

function unavailableSourceTask(
  state: ProjectState,
  workflowKind: ProjectWorkflowKind,
  reasonCode: string
): WorkflowTaskProjectionV1 {
  return unavailableTask({
    projectId: state.project.id,
    workflowKind,
    stepKey: "source_coverage",
    targetKind: "project",
    targetId: state.project.id,
    reasonCode,
    sourceRevisions: [
      revision("project", state.project.id, state.project.revision),
    ],
  });
}

function progressForTasks(
  tasks: readonly WorkflowTaskProjectionV1[]
): ProjectProgressV1 {
  const credited = tasks.filter((entry) => entry.progressCreditOwner);
  const known = credited.filter(
    (entry) => entry.applicability === "applicable"
  );
  const completed = known.filter((entry) => entry.progress === "completed");
  const unknownApplicability = credited.filter(
    (entry) => entry.applicability === "unknown"
  );
  const unavailable = credited.filter(
    (entry) =>
      entry.applicability === "unavailable" ||
      entry.actionability === "unavailable"
  );
  const notApplicable = credited.filter(
    (entry) => entry.applicability === "not_applicable"
  );
  const unknownProgress = known.filter((entry) => entry.progress === "unknown");
  const noCoverage = credited.length === 0;
  const completeCoverage =
    !noCoverage &&
    unknownApplicability.length === 0 &&
    unavailable.length === 0 &&
    unknownProgress.length === 0;
  return {
    completedKnownApplicable: completed.length,
    coverage: noCoverage
      ? "unavailable"
      : completeCoverage
        ? "complete"
        : "partial",
    definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
    knownApplicableTotal: known.length,
    notApplicableCount: notApplicable.length,
    percent:
      completeCoverage && known.length > 0
        ? Math.round((completed.length / known.length) * 100)
        : null,
    unavailableCount: unavailable.length,
    unknownApplicabilityCount: unknownApplicability.length,
    unknownProgressCount: unknownProgress.length,
  };
}

export function buildProjectWorkflowProjection(
  state: ProjectState
): ProjectWorkflowProjectionV1 {
  const tasks: WorkflowTaskProjectionV1[] = [];
  tasks.push(
    applicableTask({
      projectId: state.project.id,
      workflowKind: "project_planning",
      stepKey: "project_goal",
      targetKind: "project",
      targetId: state.project.id,
      revision: revision("project", state.project.id, state.project.revision),
      progress: "needs_information",
      reasonCodes: ["project_purpose_not_recorded"],
    }),
    unknownTask({
      projectId: state.project.id,
      workflowKind: "project_planning",
      stepKey: "workflow_scope",
      targetKind: "project",
      targetId: state.project.id,
      reasonCode: "project_goal_source_not_recorded",
      revision: revision("project", state.project.id, state.project.revision),
    })
  );

  if (!isAvailable(sourceCapability(state, "schoolApplications"))) {
    tasks.push(
      unavailableSourceTask(
        state,
        "school_application",
        "school_application_source_unavailable"
      )
    );
  } else if (state.matters.schoolApplications === null) {
    tasks.push(
      unavailableSourceTask(
        state,
        "school_application",
        "school_application_records_unavailable"
      )
    );
  } else {
    for (const application of state.matters.schoolApplications) {
      tasks.push(...schoolTasks(state, application));
    }
  }

  const admissions = allAdmissions(state);
  if (!isAvailable(sourceCapability(state, "schoolAdmissions"))) {
    tasks.push(
      unavailableSourceTask(
        state,
        "school_admissions",
        "school_admissions_source_unavailable"
      )
    );
  } else if (admissions === null) {
    tasks.push(
      unavailableSourceTask(
        state,
        "school_admissions",
        "school_admissions_records_unavailable"
      )
    );
  } else {
    for (const admission of admissions) {
      tasks.push(...admissionTaskProgress(admission, state));
    }
  }

  if (!isAvailable(sourceCapability(state, "student500"))) {
    tasks.push(
      unavailableSourceTask(
        state,
        "student_500",
        "student500_source_unavailable"
      )
    );
  } else if (state.matters.student500Applications === null) {
    tasks.push(
      unavailableSourceTask(
        state,
        "student_500",
        "student500_records_unavailable"
      )
    );
  } else {
    for (const application of state.matters.student500Applications) {
      tasks.push(...student500Tasks(state, application));
    }
  }

  const projectedTasks =
    state.project.status === "closed"
      ? tasks.map((entry) => ({
          ...entry,
          actionability: "unavailable" as const,
          applicability: "unavailable" as const,
          progress: "unknown" as const,
          reasonCodes: [...new Set([...entry.reasonCodes, "project_closed"])],
        }))
      : tasks;

  const taskIds = new Set(projectedTasks.map((entry) => entry.taskId));
  for (const projected of projectedTasks) {
    for (const dependencyId of projected.dependencies) {
      if (!taskIds.has(dependencyId)) {
        throw new Error("project_workflow_dependency_target_missing");
      }
    }
  }

  return {
    definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
    progress: progressForTasks(projectedTasks),
    tasks: projectedTasks,
  };
}

export function workflowTasksForTarget(
  tasks: readonly WorkflowTaskProjectionV1[],
  targetKind: ProjectWorkflowTargetKind,
  targetId: string
): WorkflowTaskProjectionV1[] {
  return tasks.filter(
    (entry) => entry.targetKind === targetKind && entry.targetId === targetId
  );
}

export function projectWorkflowTaskById(
  tasks: readonly WorkflowTaskProjectionV1[],
  taskId: string | null
): WorkflowTaskProjectionV1 | null {
  return taskId
    ? (tasks.find((entry) => entry.taskId === taskId) ?? null)
    : null;
}

export function defaultWorkflowTaskForTarget(
  tasks: readonly WorkflowTaskProjectionV1[],
  targetKind: ProjectWorkflowTargetKind,
  targetId: string
): WorkflowTaskProjectionV1 | null {
  const candidates = workflowTasksForTarget(tasks, targetKind, targetId);
  return candidates[0] ?? null;
}

export function projectGoalTask(
  tasks: readonly WorkflowTaskProjectionV1[],
  projectId: string
): WorkflowTaskProjectionV1 | null {
  return (
    tasks.find(
      (entry) =>
        entry.workflowKind === "project_planning" &&
        entry.stepKey === "project_goal" &&
        entry.targetId === projectId
    ) ?? null
  );
}
