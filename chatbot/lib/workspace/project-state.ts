/**
 * Phase 15 M1 — deterministic, bounded Project State projection.
 *
 * The state is rebuilt from the business services on every read. This module does
 * not own mutable business data and must not be replaced with an AI-authored cache.
 */

export const PROJECT_STATE_SCHEMA_VERSION = "phase15.project-state.v1" as const;

export const PROJECT_STATE_MAX_HISTORY_PER_RECORD = 12;
export const PROJECT_STATE_MAX_AUTHORIZED_FACTS = 100;
export const PROJECT_STATE_MAX_RESPONSE_BYTES = 262_144;
export const PROJECT_STATE_MAX_CONCURRENT_DETAIL_READS = 4;

export const PROJECT_STATE_CAPABILITY_STATES = [
  "available",
  "disabled",
  "restricted",
  "unavailable",
  "unsupported",
] as const;
export type ProjectStateCapabilityState =
  (typeof PROJECT_STATE_CAPABILITY_STATES)[number];

export const PROJECT_STATE_PROGRESS_STATES = [
  "not_started",
  "in_progress",
  "needs_information",
  "waiting",
  "blocked",
  "completed",
  "not_applicable",
  "unknown",
  "archived",
] as const;
export type ProjectStateProgressState =
  (typeof PROJECT_STATE_PROGRESS_STATES)[number];

export const PROJECT_STATE_OUTCOME_VALIDITY_STATES = [
  "not_applicable",
  "valid",
  "expiring_soon",
  "expired",
  "unknown",
] as const;
export type ProjectStateOutcomeValidityState =
  (typeof PROJECT_STATE_OUTCOME_VALIDITY_STATES)[number];

export type ProjectStateCapability = {
  state: ProjectStateCapabilityState;
  reasonCode: string | null;
};

export type ProjectStateEvent = {
  eventType: string;
  subjectKind: string;
  subjectId: string;
  revision: number;
  createdAt: string;
};

export type ProjectStateProvenance = {
  source:
    | "school_application"
    | "school_admission_case"
    | "student500_application";
  recordId: string;
  revision: number;
  updatedAt: string;
  latestEvent: ProjectStateEvent | null;
  history: ProjectStateEvent[];
  historyTruncated: boolean;
};

export type ProjectStateAction = {
  targetKind:
    | "project"
    | "school_application"
    | "school_admission_case"
    | "student500_application";
  targetId: string;
  code: string;
  reasonCode: string;
  responsibleActor: "customer" | "external_institution" | "unknown";
  actionability: "executable" | "advisory";
};

export type ProjectStateIssue = {
  targetKind:
    | "project"
    | "school_application"
    | "school_admission_case"
    | "student500_application";
  targetId: string;
  code: string;
  provenance: ProjectStateProvenance | null;
};

export type ProjectStateOutcome = {
  outcomeId: string;
  kind: "offer" | "coe";
  state: string;
  provenance: string;
  independentlyVerified: boolean;
  evidenceAttached: boolean;
  /** Derived by the authorized School Admissions service; absence is unknown. */
  validityState?: ProjectStateOutcomeValidityState;
  version: number;
  recordedAt: string;
  superseded: boolean;
};

export type ProjectStateAdmission = {
  caseId: string;
  originKind:
    | "school_application"
    | "existing_offer"
    | "existing_coe"
    | "claimed_exception";
  linkedSchoolApplicationId: string | null;
  schoolApplicationLinkState: "not_linked" | "available" | "unavailable";
  institutionName: string;
  courseTitle: string | null;
  intakeLabel: string | null;
  serviceMode: "self_service" | "managed_service";
  preparationState: string;
  progress: ProjectStateProgressState;
  nextStepCodes: string[];
  requirements: Array<{ code: string; status: string }>;
  outcomes: ProjectStateOutcome[];
  externalActions: Array<{
    actionId: string;
    actionKind: string;
    performedOn: string;
    provenance: "customer_reported";
    verified: false;
  }>;
  schoolReceipt: { state: "unrecorded" };
  responsibleActor: "external_institution" | "unknown";
  externalHandoff: {
    status:
      | "READY"
      | "NOT_READY"
      | "UNKNOWN"
      | "NOT_EVALUATED"
      | "NOT_APPLICABLE";
    reasonCodes: string[];
  };
  /** Compatibility field: readiness reasons do not block preparation progress. */
  blockedReasonCodes: string[];
  provenance: ProjectStateProvenance;
};

export type ProjectStateSchoolApplication = {
  applicationId: string;
  stage: "school_application";
  status: string;
  progress: ProjectStateProgressState;
  institution: { name: string; catalogId: string | null };
  course: { title: string; catalogId: string | null };
  intake: { id: string | null; label: string | null };
  source: {
    status: string;
    independentlyVerified: false;
  };
  missingInformationCodes: string[];
  package: {
    packageId: string;
    version: number;
    status: string;
    usable: boolean;
    contentSha256: string;
    inputsSha256: string;
    staleReasonCodes: string[];
  } | null;
  linkedAdmissionsCase: ProjectStateAdmission | null;
  responsibleActor: "unknown";
  provenance: ProjectStateProvenance;
};

export type ProjectStateStudent500 = {
  applicationId: string;
  stage: "student500";
  status: string;
  progress: ProjectStateProgressState;
  entryRoute: string | null;
  routeState: "recorded" | "unknown";
  coeStatus: string;
  schoolDependency:
    | { state: "linked"; schoolApplicationId: string }
    | { state: "linked"; admissionCaseId: string }
    | { state: "not_applicable"; reasonCode: string }
    | { state: "unknown"; reasonCode: string }
    | { state: "unavailable"; reasonCode: string };
  missingInformationCodes: string[];
  sourceVerification: string;
  preparation: {
    state:
      | "available"
      | "disabled"
      | "restricted"
      | "unavailable"
      | "not_recorded";
    schoolContext: {
      kind: string;
      studyEvidenceKind: string;
      independentlyVerified: boolean;
      current: boolean;
      unavailableReason: string | null;
    } | null;
    drafts: Array<{
      draftId: string;
      version: number;
      stale: boolean;
      staleReasonCodes: string[];
      createdAt: string;
    }>;
    snapshots: Array<{
      snapshotId: string;
      version: number;
      stale: boolean;
      legalCurrentness: string;
      staleReasonCodes: string[];
      createdAt: string;
    }>;
  };
  responsibleActor: "unknown";
  provenance: ProjectStateProvenance;
};

export type ProjectState = {
  schemaVersion: typeof PROJECT_STATE_SCHEMA_VERSION;
  generatedAt: string;
  consistency: "live_per_source_revision";
  coverage: "current_actor_authorized_records";
  project: {
    id: string;
    status: "active" | "closed";
    revision: number;
    purpose: {
      state: "unknown";
      reasonCode: "project_purpose_not_recorded";
    };
    serviceScope: {
      state: "available" | "restricted" | "unavailable";
      engagements: Array<{
        engagementId: string;
        status: string;
        serviceMode: string;
        scopeCodes: string[];
        revision: number;
        updatedAt: string;
      }> | null;
    };
  };
  capabilities: {
    schoolApplications: ProjectStateCapability;
    schoolAdmissions: ProjectStateCapability;
    student500: ProjectStateCapability;
    student500Preparation: ProjectStateCapability;
    projectFacts: ProjectStateCapability;
    projectDocuments: ProjectStateCapability;
    submissionPackages: ProjectStateCapability;
    serviceEngagements: ProjectStateCapability;
  };
  facts: {
    state: "available" | "disabled" | "restricted" | "unavailable";
    authorizedForAI: Array<{
      assertionId: string;
      version: number;
      key: string;
      sourceEvidenceRef: string | null;
    }> | null;
    conflictCount: number | null;
  };
  matters: {
    schoolApplications: ProjectStateSchoolApplication[] | null;
    standaloneAdmissions: ProjectStateAdmission[] | null;
    unresolvedLinkedAdmissions: ProjectStateAdmission[] | null;
    student500Applications: ProjectStateStudent500[] | null;
  };
  unresolvedIssues: ProjectStateIssue[];
  nextActions: ProjectStateAction[];
};

export type ProjectStateSchoolApplicationInput = {
  applicationId: string;
  projectId: string;
  status: string;
  revision: number;
  institution: { name: string; catalogId: string | null };
  course: { title: string; catalogId: string | null };
  intake: { id: string | null; label: string | null };
  source: { status: string };
  missingDataCodes: readonly string[];
  packageStale: boolean;
  latestPackage: {
    packageId: string;
    version: number;
    status: string;
    usable: boolean;
    contentSha256: string;
    inputsSha256: string;
    staleReasonCodes: readonly string[];
  } | null;
  staleReasonCodes: readonly string[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  events: readonly ProjectStateEvent[];
};

export type ProjectStateAdmissionInput = {
  caseId: string;
  projectId: string;
  applicationId: string | null;
  originKind: ProjectStateAdmission["originKind"];
  institutionName: string;
  courseTitle: string | null;
  intakeLabel: string | null;
  serviceMode: "self_service" | "managed_service";
  preparationState: string;
  revision: number;
  offer: ProjectStateAdmission["outcomes"][number] | null;
  coe: ProjectStateAdmission["outcomes"][number] | null;
  managedReadiness: { status: string; reasonCodes: readonly string[] };
  nextStepCodes: readonly string[];
  preparationStale: boolean;
  staleReasonCodes: readonly string[];
  createdAt: string;
  updatedAt: string;
  requirements: readonly {
    code: string;
    status: string;
    required?: boolean;
    appliesTo?: "self_service" | "managed_service" | "both";
  }[];
  externalActions: ProjectStateAdmission["externalActions"];
  events: readonly ProjectStateEvent[];
};

export type ProjectStateStudent500Input = {
  applicationId: string;
  projectId: string;
  status: string;
  revision: number;
  context: {
    entryRoute: string | null;
    coeStatus: string;
    schoolApplicationId: string | null;
  };
  screening: {
    missingFactCodes: readonly string[];
    sourceVerification: string;
  };
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  events: readonly ProjectStateEvent[];
};

export type ProjectStatePreparationInput = {
  applicationId: string;
  schoolContext: {
    kind: string;
    studyEvidenceKind: string;
    admissionCaseId: string | null;
    schoolApplicationId: string | null;
    admissionOutcomeIndependentlyVerified: boolean;
    current: boolean;
    unavailableReason: string | null;
  } | null;
  drafts: readonly {
    draftId: string;
    version: number;
    stale: boolean;
    staleReasons: readonly string[];
    createdAt: string;
  }[];
  snapshots: readonly {
    snapshotId: string;
    version: number;
    stale: boolean;
    legalCurrentness: string;
    staleReasons: readonly string[];
    createdAt: string;
  }[];
};

export type ProjectStateInput = {
  generatedAt: string;
  project: { id: string; status: "active" | "closed"; revision: number };
  capabilities: ProjectState["capabilities"];
  schoolApplications: readonly ProjectStateSchoolApplicationInput[] | null;
  admissionsCases: readonly ProjectStateAdmissionInput[] | null;
  student500Applications: readonly ProjectStateStudent500Input[] | null;
  student500PreparationCapability:
    | "available"
    | "disabled"
    | "restricted"
    | "unavailable";
  student500Preparations: readonly ProjectStatePreparationInput[] | null;
  serviceEngagements:
    | ProjectState["project"]["serviceScope"]["engagements"]
    | null;
  facts: ProjectState["facts"];
};

function eventOrder(left: ProjectStateEvent, right: ProjectStateEvent): number {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.revision - right.revision;
}

function provenance(input: {
  source: ProjectStateProvenance["source"];
  recordId: string;
  revision: number;
  updatedAt: string;
  events: readonly ProjectStateEvent[];
}): ProjectStateProvenance {
  const history = [...input.events].sort(eventOrder);
  const truncated = history.length > PROJECT_STATE_MAX_HISTORY_PER_RECORD;
  const bounded = history.slice(-PROJECT_STATE_MAX_HISTORY_PER_RECORD);
  return {
    history: bounded,
    historyTruncated: truncated,
    latestEvent: bounded.at(-1) ?? null,
    recordId: input.recordId,
    revision: input.revision,
    source: input.source,
    updatedAt: input.updatedAt,
  };
}

function progressForSchool(input: ProjectStateSchoolApplicationInput) {
  if (input.status === "archived" || input.archivedAt !== null) {
    return "archived" as const;
  }
  if (
    input.missingDataCodes.some(
      (code) => code !== "source_not_independently_verified"
    ) ||
    (input.latestPackage !== null && !input.latestPackage.usable) ||
    input.packageStale ||
    input.status === "stale"
  ) {
    return "needs_information" as const;
  }
  if (input.status === "draft") {
    return "not_started" as const;
  }
  return "in_progress" as const;
}

const ADMISSION_PREPARATION_REQUIREMENTS = new Set([
  "application_target_complete",
  "evidence_fact_available",
  "evidence_document_available",
  "preparation_package_usable",
  "customer_confirmation_recorded",
  "outcome_pathway_present",
  "coe_evidence_recorded",
]);

function progressForAdmission(
  input: ProjectStateAdmissionInput,
  schoolApplicationLinkState: ProjectStateAdmission["schoolApplicationLinkState"]
) {
  if (schoolApplicationLinkState === "unavailable") {
    return "unknown" as const;
  }
  if (input.preparationStale || input.preparationState === "stale") {
    return "needs_information" as const;
  }
  if (input.preparationState === "not_started") {
    return "not_started" as const;
  }
  if (
    input.requirements.some(
      (requirement) =>
        requirement.required !== false &&
        (requirement.appliesTo === undefined ||
          requirement.appliesTo === "both" ||
          requirement.appliesTo === input.serviceMode) &&
        ADMISSION_PREPARATION_REQUIREMENTS.has(requirement.code) &&
        ["missing", "conflicting"].includes(requirement.status)
    )
  ) {
    return "needs_information" as const;
  }
  return "in_progress" as const;
}

function toAdmission(
  input: ProjectStateAdmissionInput,
  schoolApplicationLinkState: ProjectStateAdmission["schoolApplicationLinkState"]
): ProjectStateAdmission {
  const knownReadiness = [
    "READY",
    "NOT_READY",
    "UNKNOWN",
    "NOT_EVALUATED",
  ].includes(input.managedReadiness.status);
  return {
    caseId: input.caseId,
    courseTitle: input.courseTitle,
    externalActions: [...input.externalActions],
    institutionName: input.institutionName,
    intakeLabel: input.intakeLabel,
    linkedSchoolApplicationId:
      schoolApplicationLinkState === "available" ? input.applicationId : null,
    schoolApplicationLinkState,
    nextStepCodes: [...input.nextStepCodes],
    originKind: input.originKind,
    outcomes: [input.offer, input.coe]
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .map((entry) => ({ ...entry })),
    preparationState: input.preparationState,
    provenance: provenance({
      events: input.events,
      recordId: input.caseId,
      revision: input.revision,
      source: "school_admission_case",
      updatedAt: input.updatedAt,
    }),
    progress: progressForAdmission(input, schoolApplicationLinkState),
    requirements: input.requirements.map(({ code, status }) => ({
      code,
      status,
    })),
    responsibleActor: "unknown",
    schoolReceipt: { state: "unrecorded" },
    serviceMode: input.serviceMode,
    externalHandoff: {
      status:
        input.serviceMode === "self_service"
          ? "NOT_APPLICABLE"
          : knownReadiness
            ? (input.managedReadiness
                .status as ProjectStateAdmission["externalHandoff"]["status"])
            : "UNKNOWN",
      reasonCodes:
        input.serviceMode === "managed_service"
          ? [...input.managedReadiness.reasonCodes]
          : [],
    },
    blockedReasonCodes: [],
  };
}

function dependencyForStudent500(input: {
  application: ProjectStateStudent500Input;
  schoolApplications: ReadonlySet<string>;
  admissionCases: ReadonlySet<string>;
  preparation: ProjectStatePreparationInput | undefined;
}): ProjectStateStudent500["schoolDependency"] {
  const route = input.application.context.entryRoute;
  const schoolContext = input.preparation?.schoolContext;
  if (route === "no_school_application") {
    return {
      reasonCode: "explicit_no_school_application_route",
      state: "not_applicable",
    };
  }
  if (route === "existing_offer" || route === "offer_only") {
    const caseId = schoolContext?.admissionCaseId;
    if (caseId && input.admissionCases.has(caseId)) {
      return { admissionCaseId: caseId, state: "linked" };
    }
    return {
      reasonCode: "explicit_existing_offer_route",
      state: "not_applicable",
    };
  }
  if (route === "existing_coe") {
    const caseId = schoolContext?.admissionCaseId;
    if (caseId && input.admissionCases.has(caseId)) {
      return { admissionCaseId: caseId, state: "linked" };
    }
    return {
      reasonCode: "explicit_existing_coe_route",
      state: "not_applicable",
    };
  }
  const schoolApplicationId =
    schoolContext?.schoolApplicationId ??
    input.application.context.schoolApplicationId;
  if (schoolApplicationId) {
    return input.schoolApplications.has(schoolApplicationId)
      ? { schoolApplicationId, state: "linked" }
      : {
          reasonCode: "linked_school_application_unavailable",
          state: "unavailable",
        };
  }
  if (route === "school_application_in_progress") {
    return {
      reasonCode: "recorded_school_route_missing_application_link",
      state: "unknown",
    };
  }
  if (schoolContext && schoolContext.kind !== "none") {
    if (schoolContext.kind === "admission_case") {
      const caseId = schoolContext.admissionCaseId;
      return caseId && input.admissionCases.has(caseId)
        ? { admissionCaseId: caseId, state: "linked" }
        : {
            reasonCode: "linked_admission_case_unavailable",
            state: "unavailable",
          };
    }
    if (schoolContext.kind === "customer_reported_coe") {
      return {
        reasonCode: "customer_reported_coe_route",
        state: "not_applicable",
      };
    }
    return {
      reasonCode: "school_context_link_unavailable",
      state: "unavailable",
    };
  }
  return { reasonCode: "study_evidence_route_not_recorded", state: "unknown" };
}

function progressForStudent500(input: ProjectStateStudent500Input) {
  if (input.status === "archived" || input.archivedAt !== null) {
    return "archived" as const;
  }
  if (input.screening.missingFactCodes.length > 0) {
    return "needs_information" as const;
  }
  if (input.status === "draft") {
    return "not_started" as const;
  }
  return "in_progress" as const;
}

function buildStudent500(input: {
  application: ProjectStateStudent500Input;
  preparation: ProjectStatePreparationInput | undefined;
  preparationCapability: ProjectStateInput["student500PreparationCapability"];
  schoolApplications: ReadonlySet<string>;
  admissionCases: ReadonlySet<string>;
}): ProjectStateStudent500 {
  const application = input.application;
  const preparation = input.preparation;
  const route = application.context.entryRoute;
  return {
    applicationId: application.applicationId,
    coeStatus: application.context.coeStatus,
    entryRoute: route,
    missingInformationCodes: [...application.screening.missingFactCodes],
    preparation: preparation
      ? {
          drafts: preparation.drafts.map((entry) => ({
            createdAt: entry.createdAt,
            draftId: entry.draftId,
            stale: entry.stale,
            staleReasonCodes: [...entry.staleReasons],
            version: entry.version,
          })),
          schoolContext: preparation.schoolContext
            ? {
                current: preparation.schoolContext.current,
                independentlyVerified:
                  preparation.schoolContext
                    .admissionOutcomeIndependentlyVerified,
                kind: preparation.schoolContext.kind,
                unavailableReason: preparation.schoolContext.unavailableReason,
                studyEvidenceKind: preparation.schoolContext.studyEvidenceKind,
              }
            : null,
          snapshots: preparation.snapshots.map((entry) => ({
            createdAt: entry.createdAt,
            legalCurrentness: entry.legalCurrentness,
            snapshotId: entry.snapshotId,
            stale: entry.stale,
            staleReasonCodes: [...entry.staleReasons],
            version: entry.version,
          })),
          state: "available",
        }
      : {
          drafts: [],
          schoolContext: null,
          snapshots: [],
          state:
            input.preparationCapability === "available"
              ? "not_recorded"
              : input.preparationCapability,
        },
    progress: progressForStudent500(application),
    provenance: provenance({
      events: application.events,
      recordId: application.applicationId,
      revision: application.revision,
      source: "student500_application",
      updatedAt: application.updatedAt,
    }),
    responsibleActor: "unknown",
    routeState: route === null ? "unknown" : "recorded",
    schoolDependency: dependencyForStudent500({
      admissionCases: input.admissionCases,
      application,
      preparation,
      schoolApplications: input.schoolApplications,
    }),
    sourceVerification: application.screening.sourceVerification,
    stage: "student500",
    status: application.status,
  };
}

function addSchoolActionsAndIssues(input: {
  application: ProjectStateSchoolApplication;
  actions: ProjectStateAction[];
  issues: ProjectStateIssue[];
  admissionsAvailable: boolean;
  hasLinkedAdmissionsCase: boolean;
}) {
  const app = input.application;
  if (app.progress === "archived") {
    return;
  }
  const mapMissingAction: Record<string, string> = {
    intake_not_selected: "select_intake",
    no_application_references: "add_application_reference",
    source_not_independently_verified: "review_school_source_status",
  };
  for (const code of app.missingInformationCodes) {
    input.issues.push({
      code,
      provenance: app.provenance,
      targetId: app.applicationId,
      targetKind: "school_application",
    });
    input.actions.push({
      actionability:
        code === "intake_not_selected" || code === "no_application_references"
          ? "executable"
          : "advisory",
      code: mapMissingAction[code] ?? "review_application_information",
      reasonCode: code,
      responsibleActor:
        code === "intake_not_selected" || code === "no_application_references"
          ? "customer"
          : "unknown",
      targetId: app.applicationId,
      targetKind: "school_application",
    });
  }
  if (app.package && !app.package.usable) {
    for (const code of app.package.staleReasonCodes) {
      input.issues.push({
        code,
        provenance: app.provenance,
        targetId: app.applicationId,
        targetKind: "school_application",
      });
    }
    input.actions.push({
      actionability: "executable",
      code: "rebuild_preparation_package",
      reasonCode: app.package.staleReasonCodes[0] ?? "package_unusable",
      responsibleActor: "customer",
      targetId: app.applicationId,
      targetKind: "school_application",
    });
  } else if (
    !app.package &&
    input.admissionsAvailable &&
    !input.hasLinkedAdmissionsCase
  ) {
    input.actions.push({
      actionability: "executable",
      code: "open_admissions_workflow",
      reasonCode: "admissions_case_not_recorded",
      responsibleActor: "customer",
      targetId: app.applicationId,
      targetKind: "school_application",
    });
  }
}

// Resolve the target and actionability together from business-service ownership.
function admissionActionTarget(
  code: string,
  admission: ProjectStateAdmission
): Pick<ProjectStateAction, "targetKind" | "targetId" | "actionability"> {
  switch (code) {
    case "complete_application_details":
    case "bind_source_evidence":
    case "build_preparation_package":
      if (
        admission.schoolApplicationLinkState === "available" &&
        admission.linkedSchoolApplicationId !== null
      ) {
        return {
          targetKind: "school_application",
          targetId: admission.linkedSchoolApplicationId,
          actionability: "executable",
        };
      }
      break;
    case "select_service_mode":
    case "record_offer_or_exception":
    case "record_coe_evidence":
      return {
        targetKind: "school_admission_case",
        targetId: admission.caseId,
        actionability: "executable",
      };
    default:
      break;
  }
  return {
    targetKind: "school_admission_case",
    targetId: admission.caseId,
    actionability: "advisory",
  };
}

function addAdmissionActionsAndIssues(input: {
  admission: ProjectStateAdmission;
  actions: ProjectStateAction[];
  issues: ProjectStateIssue[];
}) {
  const admission = input.admission;
  if (admission.schoolApplicationLinkState === "unavailable") {
    input.issues.push({
      code: "linked_school_application_unavailable",
      provenance: admission.provenance,
      targetId: admission.caseId,
      targetKind: "school_admission_case",
    });
  }
  for (const requirement of admission.requirements) {
    if (
      ["missing", "conflicting", "unknown", "unverified"].includes(
        requirement.status
      )
    ) {
      input.issues.push({
        code: `${requirement.code}:${requirement.status}`,
        provenance: admission.provenance,
        targetId: admission.caseId,
        targetKind: "school_admission_case",
      });
    }
  }
  for (const code of admission.nextStepCodes) {
    const target = admissionActionTarget(code, admission);
    input.actions.push({
      ...target,
      code,
      reasonCode: code,
      responsibleActor: "unknown",
    });
  }
  for (const code of admission.externalHandoff.reasonCodes) {
    input.issues.push({
      code,
      provenance: admission.provenance,
      targetId: admission.caseId,
      targetKind: "school_admission_case",
    });
  }
}

export function buildProjectState(input: ProjectStateInput): ProjectState {
  const sourceRecords = [
    ...(input.schoolApplications ?? []),
    ...(input.admissionsCases ?? []),
    ...(input.student500Applications ?? []),
  ];
  if (sourceRecords.some((record) => record.projectId !== input.project.id)) {
    throw new Error("project_scope_mismatch");
  }

  const admissionInputs = input.admissionsCases;
  const admissionsAvailable =
    input.capabilities.schoolAdmissions.state === "available";
  const readableSchoolApplicationIds = new Set(
    (input.schoolApplications ?? []).map(
      (application) => application.applicationId
    )
  );
  const schoolApplicationsAvailable =
    input.capabilities.schoolApplications.state === "available";
  const admissions =
    admissionInputs?.map((admission) =>
      toAdmission(
        admission,
        admission.applicationId === null
          ? "not_linked"
          : schoolApplicationsAvailable &&
              readableSchoolApplicationIds.has(admission.applicationId)
            ? "available"
            : "unavailable"
      )
    ) ?? null;
  const byApplication = new Map<string, ProjectStateAdmission>();
  const standaloneAdmissions: ProjectStateAdmission[] = [];
  const unresolvedLinkedAdmissions: ProjectStateAdmission[] = [];
  for (const admission of admissions ?? []) {
    if (admission.schoolApplicationLinkState === "available") {
      if (admission.linkedSchoolApplicationId) {
        byApplication.set(admission.linkedSchoolApplicationId, admission);
      }
    } else if (admission.schoolApplicationLinkState === "unavailable") {
      unresolvedLinkedAdmissions.push(admission);
    } else {
      standaloneAdmissions.push(admission);
    }
  }

  const schoolApplications =
    input.schoolApplications?.map((application) => ({
      applicationId: application.applicationId,
      course: { ...application.course },
      institution: { ...application.institution },
      intake: { ...application.intake },
      linkedAdmissionsCase:
        byApplication.get(application.applicationId) ?? null,
      missingInformationCodes: [...application.missingDataCodes],
      package: application.latestPackage
        ? {
            contentSha256: application.latestPackage.contentSha256,
            inputsSha256: application.latestPackage.inputsSha256,
            packageId: application.latestPackage.packageId,
            staleReasonCodes: [...application.latestPackage.staleReasonCodes],
            status: application.latestPackage.status,
            usable: application.latestPackage.usable,
            version: application.latestPackage.version,
          }
        : null,
      progress: progressForSchool(application),
      provenance: provenance({
        events: application.events,
        recordId: application.applicationId,
        revision: application.revision,
        source: "school_application",
        updatedAt: application.updatedAt,
      }),
      responsibleActor: "unknown" as const,
      source: {
        independentlyVerified: false as const,
        status: application.source.status,
      },
      stage: "school_application" as const,
      status: application.status,
    })) ?? null;

  const preparationByApplication = new Map(
    (input.student500Preparations ?? []).map((entry) => [
      entry.applicationId,
      entry,
    ])
  );
  const schoolIds = new Set(
    (input.schoolApplications ?? []).map((entry) => entry.applicationId)
  );
  const admissionIds = new Set(
    (admissionInputs ?? []).map((entry) => entry.caseId)
  );
  const student500Applications =
    input.student500Applications?.map((application) =>
      buildStudent500({
        admissionCases: admissionIds,
        application,
        preparationCapability: input.student500PreparationCapability,
        preparation: preparationByApplication.get(application.applicationId),
        schoolApplications: schoolIds,
      })
    ) ?? null;

  const unresolvedIssues: ProjectStateIssue[] = [];
  const nextActions: ProjectStateAction[] = [];
  for (const application of schoolApplications ?? []) {
    addSchoolActionsAndIssues({
      actions: nextActions,
      admissionsAvailable,
      hasLinkedAdmissionsCase: byApplication.has(application.applicationId),
      application,
      issues: unresolvedIssues,
    });
  }
  for (const admission of admissions ?? []) {
    const linked = (input.schoolApplications ?? []).find(
      (application) =>
        application.applicationId === admission.linkedSchoolApplicationId
    );
    if (
      linked &&
      (linked.status === "archived" || linked.archivedAt !== null)
    ) {
      continue;
    }
    addAdmissionActionsAndIssues({
      actions: nextActions,
      admission,
      issues: unresolvedIssues,
    });
  }
  for (const application of student500Applications ?? []) {
    if (application.progress === "archived") {
      continue;
    }
    for (const code of application.missingInformationCodes) {
      unresolvedIssues.push({
        code,
        provenance: application.provenance,
        targetId: application.applicationId,
        targetKind: "student500_application",
      });
      if (input.project.status === "active") {
        nextActions.push({
          actionability: "executable",
          code: "provide_student500_information",
          reasonCode: code,
          responsibleActor: "customer",
          targetId: application.applicationId,
          targetKind: "student500_application",
        });
      }
    }
    if (application.routeState === "unknown") {
      unresolvedIssues.push({
        code: "study_evidence_route_not_recorded",
        provenance: application.provenance,
        targetId: application.applicationId,
        targetKind: "student500_application",
      });
      if (input.project.status === "active") {
        nextActions.push({
          actionability: "executable",
          code: "record_study_evidence_route",
          reasonCode: "study_evidence_route_not_recorded",
          responsibleActor: "customer",
          targetId: application.applicationId,
          targetKind: "student500_application",
        });
      }
    }
    if (application.schoolDependency.state === "unavailable") {
      unresolvedIssues.push({
        code: application.schoolDependency.reasonCode,
        provenance: application.provenance,
        targetId: application.applicationId,
        targetKind: "student500_application",
      });
    }
    if (
      application.sourceVerification !== "verified_official_corpus" &&
      application.status !== "archived"
    ) {
      unresolvedIssues.push({
        code: "student500_source_verification_incomplete",
        provenance: application.provenance,
        targetId: application.applicationId,
        targetKind: "student500_application",
      });
    }
  }

  const serviceScopeState = input.capabilities.serviceEngagements.state;
  return {
    capabilities: input.capabilities,
    consistency: "live_per_source_revision",
    coverage: "current_actor_authorized_records",
    facts: input.facts,
    generatedAt: input.generatedAt,
    matters: {
      schoolApplications,
      standaloneAdmissions: admissions ? standaloneAdmissions : null,
      unresolvedLinkedAdmissions: admissions
        ? unresolvedLinkedAdmissions
        : null,
      student500Applications,
    },
    nextActions:
      input.project.status === "active"
        ? nextActions.filter((action) => {
            if (action.targetKind === "student500_application") {
              return !student500Applications?.some(
                (application) =>
                  application.applicationId === action.targetId &&
                  application.progress === "archived"
              );
            }
            if (action.targetKind === "school_admission_case") {
              return !admissionInputs?.some((admissionInput) => {
                if (
                  admissionInput.caseId !== action.targetId ||
                  admissionInput.applicationId === null
                ) {
                  return false;
                }
                const linkedApplication = (input.schoolApplications ?? []).find(
                  (application) =>
                    application.applicationId === admissionInput.applicationId
                );
                return (
                  !linkedApplication ||
                  linkedApplication.status === "archived" ||
                  linkedApplication.archivedAt !== null
                );
              });
            }
            return true;
          })
        : [],
    project: {
      id: input.project.id,
      purpose: {
        reasonCode: "project_purpose_not_recorded",
        state: "unknown",
      },
      revision: input.project.revision,
      serviceScope: {
        engagements:
          serviceScopeState === "available"
            ? (input.serviceEngagements ?? [])
            : null,
        state:
          serviceScopeState === "available"
            ? "available"
            : serviceScopeState === "restricted"
              ? "restricted"
              : "unavailable",
      },
      status: input.project.status,
    },
    schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
    // Closed projects retain record-level historical details; no current work remains.
    unresolvedIssues: input.project.status === "active" ? unresolvedIssues : [],
  };
}
