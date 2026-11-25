import { z } from "zod";
import {
  PROJECT_STATE_CAPABILITY_STATES,
  PROJECT_STATE_OUTCOME_VALIDITY_STATES,
  PROJECT_STATE_PROGRESS_STATES,
  PROJECT_STATE_SCHEMA_VERSION,
  type ProjectState,
  type ProjectStateAction,
  type ProjectStateAdmission,
  type ProjectStateCapabilityState,
  type ProjectStateProgressState,
  type ProjectStateProvenance,
  type ProjectStateSchoolApplication,
  type ProjectStateStudent500,
} from "./project-state";
import {
  buildProjectWorkflowProjection,
  type ProjectWorkflowProjectionV1,
} from "./project-workflows";

const nonEmptyString = z.string().min(1);
const nullableString = z.string().nullable();
const stringList = z.array(z.string());
const progressSchema = z.enum(PROJECT_STATE_PROGRESS_STATES);
const capabilityStateSchema = z.enum(PROJECT_STATE_CAPABILITY_STATES);
const outcomeValidityStateSchema = z.enum(
  PROJECT_STATE_OUTCOME_VALIDITY_STATES
);

const eventSchema = z
  .object({
    eventType: nonEmptyString,
    subjectKind: nonEmptyString,
    subjectId: nonEmptyString,
    revision: z.number().int().nonnegative(),
    createdAt: nonEmptyString,
  })
  .passthrough();

const provenanceSchema = z
  .object({
    source: z.enum([
      "school_application",
      "school_admission_case",
      "student500_application",
    ]),
    recordId: nonEmptyString,
    revision: z.number().int().nonnegative(),
    updatedAt: nonEmptyString,
    latestEvent: eventSchema.nullable(),
    history: z.array(eventSchema),
    historyTruncated: z.boolean(),
  })
  .passthrough();

const outcomeSchema = z
  .object({
    outcomeId: nonEmptyString,
    kind: z.enum(["offer", "coe"]),
    // Keep these values aligned with School Admissions' persisted state contracts.
    state: z.enum([
      "received",
      "under_review",
      "accepted",
      "declined",
      "expired",
      "deferred",
      "claimed",
      "obtained",
      "superseded",
    ]),
    provenance: nonEmptyString,
    independentlyVerified: z.boolean(),
    evidenceAttached: z.boolean(),
    validityState: outcomeValidityStateSchema.optional(),
    version: z.number().int().nonnegative(),
    recordedAt: nonEmptyString,
    superseded: z.boolean(),
  })
  .passthrough()
  .superRefine((outcome, context) => {
    const offerStates = [
      "received",
      "under_review",
      "accepted",
      "declined",
      "expired",
      "deferred",
    ];
    const coeStates = ["claimed", "obtained", "superseded"];
    const supportedStates = outcome.kind === "offer" ? offerStates : coeStates;
    if (!supportedStates.includes(outcome.state)) {
      context.addIssue({
        code: "custom",
        message: "outcome_state_kind_mismatch",
        path: ["state"],
      });
    }
  });

const admissionSchema = z
  .object({
    caseId: nonEmptyString,
    originKind: z.enum([
      "school_application",
      "existing_offer",
      "existing_coe",
      "claimed_exception",
    ]),
    linkedSchoolApplicationId: nullableString,
    schoolApplicationLinkState: z.enum([
      "not_linked",
      "available",
      "unavailable",
    ]),
    institutionName: nonEmptyString,
    courseTitle: nullableString,
    intakeLabel: nullableString,
    serviceMode: z.enum(["self_service", "managed_service"]),
    preparationState: nonEmptyString,
    progress: progressSchema,
    nextStepCodes: stringList,
    requirements: z.array(
      z.object({ code: nonEmptyString, status: nonEmptyString }).passthrough()
    ),
    outcomes: z.array(outcomeSchema),
    externalActions: z.array(
      z
        .object({
          actionId: nonEmptyString,
          actionKind: nonEmptyString,
          performedOn: nonEmptyString,
          provenance: z.literal("customer_reported"),
          verified: z.literal(false),
        })
        .passthrough()
    ),
    schoolReceipt: z.object({ state: z.literal("unrecorded") }).passthrough(),
    responsibleActor: z.enum(["external_institution", "unknown"]),
    externalHandoff: z
      .object({
        status: z.enum([
          "READY",
          "NOT_READY",
          "UNKNOWN",
          "NOT_EVALUATED",
          "NOT_APPLICABLE",
        ]),
        reasonCodes: stringList,
      })
      .passthrough(),
    blockedReasonCodes: stringList,
    provenance: provenanceSchema,
  })
  .passthrough();

const schoolApplicationSchema = z
  .object({
    applicationId: nonEmptyString,
    stage: z.literal("school_application"),
    status: nonEmptyString,
    progress: progressSchema,
    institution: z
      .object({ name: nonEmptyString, catalogId: nullableString })
      .passthrough(),
    course: z
      .object({ title: nonEmptyString, catalogId: nullableString })
      .passthrough(),
    intake: z
      .object({ id: nullableString, label: nullableString })
      .passthrough(),
    source: z
      .object({
        status: nonEmptyString,
        independentlyVerified: z.literal(false),
      })
      .passthrough(),
    missingInformationCodes: stringList,
    package: z
      .object({
        packageId: nonEmptyString,
        version: z.number().int().nonnegative(),
        status: nonEmptyString,
        usable: z.boolean(),
        contentSha256: nonEmptyString,
        inputsSha256: nonEmptyString,
        staleReasonCodes: stringList,
      })
      .passthrough()
      .nullable(),
    linkedAdmissionsCase: admissionSchema.nullable(),
    responsibleActor: z.literal("unknown"),
    provenance: provenanceSchema,
  })
  .passthrough();

const student500Schema = z
  .object({
    applicationId: nonEmptyString,
    stage: z.literal("student500"),
    status: nonEmptyString,
    progress: progressSchema,
    applicationPlace: z.enum(["onshore", "offshore", "unknown"]),
    entryRoute: nullableString,
    routeState: z.enum(["recorded", "unknown"]),
    coeStatus: nonEmptyString,
    schoolDependency: z.union([
      z.object({
        state: z.literal("linked"),
        schoolApplicationId: nonEmptyString,
      }),
      z.object({ state: z.literal("linked"), admissionCaseId: nonEmptyString }),
      z.object({
        state: z.literal("not_applicable"),
        reasonCode: nonEmptyString,
      }),
      z.object({ state: z.literal("unknown"), reasonCode: nonEmptyString }),
      z.object({ state: z.literal("unavailable"), reasonCode: nonEmptyString }),
    ]),
    missingInformationCodes: stringList,
    sourceVerification: nonEmptyString,
    preparation: z
      .object({
        state: z.enum([
          "available",
          "disabled",
          "restricted",
          "unavailable",
          "not_recorded",
        ]),
        schoolContext: z
          .object({
            kind: nonEmptyString,
            studyEvidenceKind: nonEmptyString,
            independentlyVerified: z.boolean(),
            current: z.boolean(),
            unavailableReason: nullableString,
          })
          .passthrough()
          .nullable(),
        drafts: z.array(
          z
            .object({
              draftId: nonEmptyString,
              version: z.number().int().nonnegative(),
              stale: z.boolean(),
              staleReasonCodes: stringList,
              createdAt: nonEmptyString,
            })
            .passthrough()
        ),
        snapshots: z.array(
          z
            .object({
              snapshotId: nonEmptyString,
              version: z.number().int().nonnegative(),
              stale: z.boolean(),
              legalCurrentness: nonEmptyString,
              staleReasonCodes: stringList,
              createdAt: nonEmptyString,
            })
            .passthrough()
        ),
      })
      .passthrough(),
    responsibleActor: z.literal("unknown"),
    provenance: provenanceSchema,
  })
  .passthrough();

const actionSchema = z
  .object({
    targetKind: z.enum([
      "project",
      "school_application",
      "school_admission_case",
      "student500_application",
    ]),
    targetId: nonEmptyString,
    code: nonEmptyString,
    reasonCode: nonEmptyString,
    responsibleActor: z.enum(["customer", "external_institution", "unknown"]),
    actionability: z.enum(["executable", "advisory"]),
  })
  .passthrough();

const capabilitySchema = z
  .object({
    state: capabilityStateSchema,
    reasonCode: nullableString,
  })
  .passthrough();

const projectStateSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_STATE_SCHEMA_VERSION),
    generatedAt: nonEmptyString,
    consistency: z.literal("live_per_source_revision"),
    coverage: z.literal("current_actor_authorized_records"),
    project: z
      .object({
        id: nonEmptyString,
        status: z.enum(["active", "closed"]),
        revision: z.number().int().nonnegative(),
        purpose: z
          .object({
            state: z.literal("unknown"),
            reasonCode: z.literal("project_purpose_not_recorded"),
          })
          .passthrough(),
        serviceScope: z
          .object({
            state: z.enum(["available", "restricted", "unavailable"]),
            engagements: z
              .array(
                z
                  .object({
                    engagementId: nonEmptyString,
                    status: nonEmptyString,
                    serviceMode: nonEmptyString,
                    scopeCodes: stringList,
                    revision: z.number().int().nonnegative(),
                    updatedAt: nonEmptyString,
                  })
                  .passthrough()
              )
              .nullable(),
          })
          .passthrough(),
      })
      .passthrough(),
    capabilities: z
      .object({
        schoolApplications: capabilitySchema,
        schoolAdmissions: capabilitySchema,
        student500: capabilitySchema,
        student500Preparation: capabilitySchema,
        projectFacts: capabilitySchema,
        projectDocuments: capabilitySchema,
        submissionPackages: capabilitySchema,
        serviceEngagements: capabilitySchema,
      })
      .passthrough(),
    facts: z
      .object({
        state: z.enum(["available", "disabled", "restricted", "unavailable"]),
        authorizedForAI: z
          .array(
            z
              .object({
                assertionId: nonEmptyString,
                version: z.number().int().nonnegative(),
                key: nonEmptyString,
                sourceEvidenceRef: nullableString,
              })
              .passthrough()
          )
          .nullable(),
        conflictCount: z.number().int().nonnegative().nullable(),
      })
      .passthrough(),
    matters: z
      .object({
        schoolApplications: z.array(schoolApplicationSchema).nullable(),
        standaloneAdmissions: z.array(admissionSchema).nullable(),
        unresolvedLinkedAdmissions: z.array(admissionSchema).nullable(),
        student500Applications: z.array(student500Schema).nullable(),
      })
      .passthrough(),
    unresolvedIssues: z.array(
      z
        .object({
          targetKind: z.enum([
            "project",
            "school_application",
            "school_admission_case",
            "student500_application",
          ]),
          targetId: nonEmptyString,
          code: nonEmptyString,
          provenance: provenanceSchema.nullable(),
        })
        .passthrough()
    ),
    nextActions: z.array(actionSchema),
  })
  .passthrough();

const projectStateResponseSchema = z
  .object({ state: projectStateSchema })
  .passthrough();

export type ProjectJourneySourceKey =
  | "schoolApplications"
  | "schoolAdmissions"
  | "student500"
  | "student500Preparation"
  | "projectFacts"
  | "projectDocuments"
  | "submissionPackages"
  | "serviceEngagements";

export type ProjectJourneyNodeKind =
  | "school_application"
  | "admission_case"
  | "student500_application"
  | "route_entry";

export type ProjectJourneyRouteKind =
  | "no_school_application"
  | "existing_offer"
  | "existing_coe"
  | "school_application_in_progress"
  | "claimed_exception"
  | "other_recorded_route";

export type ProjectJourneyNode = {
  id: string;
  kind: ProjectJourneyNodeKind;
  targetKind: ProjectStateAction["targetKind"];
  targetId: string;
  title: string;
  subtitle: string | null;
  progress: ProjectStateProgressState | "route_recorded" | null;
  responsibleActor: "customer" | "external_institution" | "unknown" | null;
  provenance: ProjectStateProvenance | null;
  issueCodes: string[];
  missingInformationCodes: string[];
  actions: ProjectStateAction[];
  sourceKey: ProjectJourneySourceKey;
  record:
    | ProjectStateSchoolApplication
    | ProjectStateAdmission
    | ProjectStateStudent500
    | null;
  route: {
    kind: ProjectJourneyRouteKind;
    code: string;
    parentNodeId: string;
  } | null;
};

export type ProjectJourneyEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind:
    | "school_admissions_link"
    | "student_school_dependency"
    | "student_admissions_dependency"
    | "recorded_route";
};

export type ProjectJourneySource = {
  key: ProjectJourneySourceKey;
  state: ProjectStateCapabilityState;
  reasonCode: string | null;
  recordCount: number | null;
};

export type ProjectJourney = {
  schemaVersion: typeof PROJECT_STATE_SCHEMA_VERSION;
  generatedAt: string;
  project: ProjectState["project"];
  nodes: ProjectJourneyNode[];
  edges: ProjectJourneyEdge[];
  sources: ProjectJourneySource[];
  projectIssues: string[];
  projectActions: ProjectStateAction[];
  summary: {
    knownRecordCount: number;
    knownIncompleteWorkCount: number;
    unknownProgressCount: number;
    unavailableSourceCount: number;
  };
  /** E2 tasks are rebuilt from this same authorized M1 response; no second fetch or store. */
  workflowProjection: ProjectWorkflowProjectionV1;
};

export type ProjectStateLoadFailure =
  | "unauthorized"
  | "not_found"
  | "unavailable"
  | "invalid_response"
  | "network_error";

export function projectJourneyStateRequest(
  projectId: string,
  signal: AbortSignal
): { url: string; init: RequestInit } {
  return {
    url: `/api/projects/${encodeURIComponent(projectId)}/state`,
    init: {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    },
  };
}

export function projectJourneyFailureForStatus(
  status: number
): ProjectStateLoadFailure {
  if (status === 401) {
    return "unauthorized";
  }
  if (status === 404) {
    return "not_found";
  }
  return "unavailable";
}

export type ProjectJourneyLoadState =
  | { projectId: string; requestId: number; status: "loading" }
  | {
      projectId: string;
      requestId: number;
      status: "ready";
      state: ProjectState;
      journey: ProjectJourney;
    }
  | {
      projectId: string;
      requestId: number;
      status: "failed";
      reason: ProjectStateLoadFailure;
    };

export type ProjectJourneyLoadAction =
  | { type: "started"; projectId: string; requestId: number }
  | {
      type: "loaded";
      projectId: string;
      requestId: number;
      state: ProjectState;
      journey: ProjectJourney;
    }
  | {
      type: "failed";
      projectId: string;
      requestId: number;
      reason: ProjectStateLoadFailure;
    };

export type ProjectJourneySelectionAction =
  | { type: "select"; nodeId: string; availableNodeIds: readonly string[] }
  | {
      type: "reconcile";
      availableNodeIds: readonly string[];
      defaultNodeId: string | null;
    };

export function projectJourneySelectionReducer(
  selectedNodeId: string | null,
  action: ProjectJourneySelectionAction
): string | null {
  if (action.type === "select") {
    return action.availableNodeIds.includes(action.nodeId)
      ? action.nodeId
      : selectedNodeId;
  }
  if (
    selectedNodeId !== null &&
    action.availableNodeIds.includes(selectedNodeId)
  ) {
    return selectedNodeId;
  }
  return action.defaultNodeId;
}

export function projectJourneyLoadReducer(
  current: ProjectJourneyLoadState | null,
  action: ProjectJourneyLoadAction
): ProjectJourneyLoadState {
  if (action.type === "started") {
    return {
      projectId: action.projectId,
      requestId: action.requestId,
      status: "loading",
    };
  }
  if (
    !current ||
    current.projectId !== action.projectId ||
    current.requestId !== action.requestId ||
    current.status !== "loading"
  ) {
    return (
      current ?? {
        projectId: action.projectId,
        requestId: action.requestId,
        status: "loading",
      }
    );
  }
  if (action.type === "loaded") {
    return {
      projectId: action.projectId,
      requestId: action.requestId,
      status: "ready",
      state: action.state,
      journey: action.journey,
    };
  }
  return {
    projectId: action.projectId,
    requestId: action.requestId,
    status: "failed",
    reason: action.reason,
  };
}

export function parseProjectStateResponse(
  value: unknown,
  expectedProjectId: string
): ProjectState | null {
  const parsed = projectStateResponseSchema.safeParse(value);
  if (!parsed.success || parsed.data.state.project.id !== expectedProjectId) {
    return null;
  }
  const state = parsed.data.state as ProjectState;
  if (!hasConsistentProjectStateRelationships(state)) {
    return null;
  }
  return state;
}

function hasConsistentProjectStateRelationships(state: ProjectState): boolean {
  const schools = state.matters.schoolApplications;
  if (
    (state.capabilities.schoolApplications.state === "available") !==
    (schools !== null)
  ) {
    return false;
  }
  if (
    (state.capabilities.student500.state === "available") !==
    (state.matters.student500Applications !== null)
  ) {
    return false;
  }
  if (
    (state.capabilities.schoolAdmissions.state === "available") !==
    (state.matters.standaloneAdmissions !== null &&
      state.matters.unresolvedLinkedAdmissions !== null)
  ) {
    return false;
  }
  const schoolIds = new Set(
    (schools ?? []).map((entry) => entry.applicationId)
  );
  if (schoolIds.size !== (schools ?? []).length) {
    return false;
  }
  const allAdmissions = collectAdmissions(state);
  const admissionIds = new Set(allAdmissions.map((entry) => entry.caseId));
  if (admissionIds.size !== allAdmissions.length) {
    return false;
  }
  for (const admission of allAdmissions) {
    if (
      admission.schoolApplicationLinkState === "available" &&
      (!admission.linkedSchoolApplicationId ||
        !schoolIds.has(admission.linkedSchoolApplicationId) ||
        !(schools ?? []).some(
          (school) =>
            school.applicationId === admission.linkedSchoolApplicationId &&
            school.linkedAdmissionsCase?.caseId === admission.caseId
        ))
    ) {
      return false;
    }
    if (
      admission.schoolApplicationLinkState !== "available" &&
      admission.linkedSchoolApplicationId !== null
    ) {
      return false;
    }
  }
  for (const school of schools ?? []) {
    const linked = school.linkedAdmissionsCase;
    if (linked && state.capabilities.schoolAdmissions.state !== "available") {
      return false;
    }
    if (
      linked &&
      (linked.schoolApplicationLinkState !== "available" ||
        linked.linkedSchoolApplicationId !== school.applicationId)
    ) {
      return false;
    }
  }
  const studentApplications = state.matters.student500Applications;
  const studentIds = new Set(
    (studentApplications ?? []).map((entry) => entry.applicationId)
  );
  if (studentIds.size !== (studentApplications ?? []).length) {
    return false;
  }
  for (const student of studentApplications ?? []) {
    if ((student.routeState === "recorded") !== (student.entryRoute !== null)) {
      return false;
    }
    if (student.schoolDependency.state === "linked") {
      if (
        "schoolApplicationId" in student.schoolDependency &&
        !schoolIds.has(student.schoolDependency.schoolApplicationId)
      ) {
        return false;
      }
      if (
        "admissionCaseId" in student.schoolDependency &&
        !admissionIds.has(student.schoolDependency.admissionCaseId)
      ) {
        return false;
      }
    }
  }
  const targetIds = new Map<string, Set<string>>([
    ["project", new Set([state.project.id])],
    ["school_application", schoolIds],
    ["school_admission_case", admissionIds],
    ["student500_application", studentIds],
  ]);
  for (const action of state.nextActions) {
    if (!targetIds.get(action.targetKind)?.has(action.targetId)) {
      return false;
    }
  }
  for (const issue of state.unresolvedIssues) {
    if (!targetIds.get(issue.targetKind)?.has(issue.targetId)) {
      return false;
    }
  }
  if (
    state.project.status === "closed" &&
    (state.nextActions.length > 0 || state.unresolvedIssues.length > 0)
  ) {
    return false;
  }
  return true;
}

function collectAdmissions(state: ProjectState): ProjectStateAdmission[] {
  const byId = new Map<string, ProjectStateAdmission>();
  for (const school of state.matters.schoolApplications ?? []) {
    if (school.linkedAdmissionsCase) {
      byId.set(school.linkedAdmissionsCase.caseId, school.linkedAdmissionsCase);
    }
  }
  for (const admission of state.matters.standaloneAdmissions ?? []) {
    if (!byId.has(admission.caseId)) {
      byId.set(admission.caseId, admission);
    }
  }
  for (const admission of state.matters.unresolvedLinkedAdmissions ?? []) {
    if (!byId.has(admission.caseId)) {
      byId.set(admission.caseId, admission);
    }
  }
  return [...byId.values()];
}

function routeKindForCode(code: string): ProjectJourneyRouteKind {
  switch (code) {
    case "no_school_application":
      return "no_school_application";
    case "existing_offer":
    case "offer_only":
      return "existing_offer";
    case "existing_coe":
      return "existing_coe";
    case "school_application_in_progress":
      return "school_application_in_progress";
    default:
      return "other_recorded_route";
  }
}

function targetKindForNode(
  kind: Exclude<ProjectJourneyNodeKind, "route_entry">
): ProjectStateAction["targetKind"] {
  switch (kind) {
    case "school_application":
      return "school_application";
    case "admission_case":
      return "school_admission_case";
    case "student500_application":
      return "student500_application";
    default:
      throw new Error("unsupported_project_journey_node");
  }
}

function nodeIssues(
  state: ProjectState,
  targetKind: ProjectStateAction["targetKind"],
  targetId: string
): string[] {
  return state.unresolvedIssues
    .filter(
      (issue) => issue.targetKind === targetKind && issue.targetId === targetId
    )
    .map((issue) => issue.code);
}

function nodeActions(
  state: ProjectState,
  targetKind: ProjectStateAction["targetKind"],
  targetId: string
): ProjectStateAction[] {
  return state.nextActions.filter(
    (action) => action.targetKind === targetKind && action.targetId === targetId
  );
}

function source(
  key: ProjectJourneySourceKey,
  capability: { state: ProjectStateCapabilityState; reasonCode: string | null },
  recordCount: number | null
): ProjectJourneySource {
  return {
    key,
    state: capability.state,
    reasonCode: capability.reasonCode,
    recordCount,
  };
}

function makeSourceList(
  state: ProjectState,
  admissions: ProjectStateAdmission[]
) {
  const schoolApplications = state.matters.schoolApplications;
  const studentApplications = state.matters.student500Applications;
  const admissionsAvailable =
    state.capabilities.schoolAdmissions.state === "available";
  const preparationAvailable =
    state.capabilities.student500Preparation.state === "available";
  return [
    source(
      "schoolApplications",
      state.capabilities.schoolApplications,
      schoolApplications === null ? null : schoolApplications.length
    ),
    source(
      "schoolAdmissions",
      state.capabilities.schoolAdmissions,
      admissionsAvailable ? admissions.length : null
    ),
    source(
      "student500",
      state.capabilities.student500,
      studentApplications === null ? null : studentApplications.length
    ),
    source(
      "student500Preparation",
      state.capabilities.student500Preparation,
      !preparationAvailable || studentApplications === null
        ? null
        : studentApplications.filter(
            (entry) => entry.preparation.state === "available"
          ).length
    ),
    source("projectFacts", state.capabilities.projectFacts, null),
    source("projectDocuments", state.capabilities.projectDocuments, null),
    source("submissionPackages", state.capabilities.submissionPackages, null),
    source("serviceEngagements", state.capabilities.serviceEngagements, null),
  ];
}

export function buildProjectJourney(state: ProjectState): ProjectJourney {
  const admissions = collectAdmissions(state);
  const nodes: ProjectJourneyNode[] = [];
  const edges: ProjectJourneyEdge[] = [];
  const schoolApplications = state.matters.schoolApplications ?? [];
  const studentApplications = state.matters.student500Applications ?? [];

  for (const application of schoolApplications) {
    const nodeId = `school:${application.applicationId}`;
    const nodeKind = "school_application" as const;
    const targetKind = targetKindForNode(nodeKind);
    const issueCodes = nodeIssues(state, targetKind, application.applicationId);
    nodes.push({
      id: nodeId,
      kind: nodeKind,
      targetKind,
      targetId: application.applicationId,
      title: application.institution.name,
      subtitle:
        [application.course.title, application.intake.label]
          .filter(Boolean)
          .join(" · ") || null,
      progress: application.progress,
      responsibleActor: "unknown",
      provenance: application.provenance,
      issueCodes,
      missingInformationCodes: [...application.missingInformationCodes],
      actions: nodeActions(state, targetKind, application.applicationId),
      sourceKey: "schoolApplications",
      record: application,
      route: null,
    });
  }

  for (const admission of admissions) {
    const nodeId = `admissions:${admission.caseId}`;
    const nodeKind = "admission_case" as const;
    const targetKind = targetKindForNode(nodeKind);
    const issueCodes = nodeIssues(state, targetKind, admission.caseId);
    nodes.push({
      id: nodeId,
      kind: nodeKind,
      targetKind,
      targetId: admission.caseId,
      title: admission.institutionName,
      subtitle:
        [admission.courseTitle, admission.intakeLabel]
          .filter(Boolean)
          .join(" · ") || null,
      progress: admission.progress,
      responsibleActor: admission.responsibleActor,
      provenance: admission.provenance,
      issueCodes,
      missingInformationCodes: admission.requirements
        .filter((requirement) =>
          ["missing", "conflicting"].includes(requirement.status)
        )
        .map((requirement) => `${requirement.code}:${requirement.status}`),
      actions: nodeActions(state, targetKind, admission.caseId),
      sourceKey: "schoolAdmissions",
      record: admission,
      route: null,
    });
    if (
      admission.schoolApplicationLinkState === "available" &&
      admission.linkedSchoolApplicationId
    ) {
      const schoolNodeId = `school:${admission.linkedSchoolApplicationId}`;
      if (nodes.some((node) => node.id === schoolNodeId)) {
        edges.push({
          id: `edge:${schoolNodeId}:${nodeId}:school-admissions`,
          fromNodeId: schoolNodeId,
          toNodeId: nodeId,
          kind: "school_admissions_link",
        });
      }
    }
  }

  for (const application of studentApplications) {
    const nodeId = `student500:${application.applicationId}`;
    const nodeKind = "student500_application" as const;
    const targetKind = targetKindForNode(nodeKind);
    const issueCodes = nodeIssues(state, targetKind, application.applicationId);
    nodes.push({
      id: nodeId,
      kind: nodeKind,
      targetKind,
      targetId: application.applicationId,
      title: "Student 500",
      subtitle: null,
      progress: application.progress,
      responsibleActor: application.responsibleActor,
      provenance: application.provenance,
      issueCodes,
      missingInformationCodes: [...application.missingInformationCodes],
      actions: nodeActions(state, targetKind, application.applicationId),
      sourceKey: "student500",
      record: application,
      route: null,
    });
    if (application.entryRoute !== null) {
      const routeId = `route:student500:${application.applicationId}`;
      nodes.push({
        id: routeId,
        kind: "route_entry",
        targetKind,
        targetId: application.applicationId,
        title: "",
        subtitle: null,
        progress: "route_recorded",
        responsibleActor: null,
        provenance: application.provenance,
        issueCodes: [],
        missingInformationCodes: [],
        actions: [],
        sourceKey: "student500",
        record: application,
        route: {
          kind: routeKindForCode(application.entryRoute),
          code: application.entryRoute,
          parentNodeId: nodeId,
        },
      });
      edges.push({
        id: `edge:${routeId}:${nodeId}:recorded-route`,
        fromNodeId: routeId,
        toNodeId: nodeId,
        kind: "recorded_route",
      });
    }
    if (application.schoolDependency.state === "linked") {
      const dependency = application.schoolDependency;
      const fromNodeId =
        "schoolApplicationId" in dependency
          ? `school:${dependency.schoolApplicationId}`
          : `admissions:${dependency.admissionCaseId}`;
      const kind =
        "schoolApplicationId" in dependency
          ? "student_school_dependency"
          : "student_admissions_dependency";
      if (nodes.some((node) => node.id === fromNodeId)) {
        edges.push({
          id: `edge:${fromNodeId}:${nodeId}:${kind}`,
          fromNodeId,
          toNodeId: nodeId,
          kind,
        });
      }
    }
  }

  for (const admission of admissions) {
    if (
      admission.originKind !== "existing_offer" &&
      admission.originKind !== "existing_coe" &&
      admission.originKind !== "claimed_exception"
    ) {
      continue;
    }
    const parentNodeId = `admissions:${admission.caseId}`;
    const routeId = `route:admissions:${admission.caseId}`;
    const targetKind = "school_admission_case" as const;
    nodes.push({
      id: routeId,
      kind: "route_entry",
      targetKind,
      targetId: admission.caseId,
      title: "",
      subtitle: null,
      progress: "route_recorded",
      responsibleActor: null,
      provenance: admission.provenance,
      issueCodes: [],
      missingInformationCodes: [],
      actions: [],
      sourceKey: "schoolAdmissions",
      record: admission,
      route: {
        kind: admission.originKind,
        code: admission.originKind,
        parentNodeId,
      },
    });
    edges.push({
      id: `edge:${routeId}:${parentNodeId}:recorded-route`,
      fromNodeId: routeId,
      toNodeId: parentNodeId,
      kind: "recorded_route",
    });
  }

  const recordNodes = nodes.filter((node) => node.kind !== "route_entry");
  const incompleteStates = new Set([
    "not_started",
    "in_progress",
    "needs_information",
    "waiting",
    "blocked",
  ]);
  const sources = makeSourceList(state, admissions);
  const workflowProjection = buildProjectWorkflowProjection(state);
  return {
    schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
    generatedAt: state.generatedAt,
    project: state.project,
    nodes,
    edges,
    sources,
    projectIssues: state.unresolvedIssues
      .filter(
        (issue) =>
          issue.targetKind === "project" && issue.targetId === state.project.id
      )
      .map((issue) => issue.code),
    projectActions: state.nextActions.filter(
      (action) =>
        action.targetKind === "project" && action.targetId === state.project.id
    ),
    summary: {
      knownRecordCount: recordNodes.length,
      knownIncompleteWorkCount: recordNodes.filter(
        (node) => node.progress !== null && incompleteStates.has(node.progress)
      ).length,
      unknownProgressCount: recordNodes.filter(
        (node) => node.progress === "unknown"
      ).length,
      unavailableSourceCount: sources.filter(
        (entry) => entry.state !== "available"
      ).length,
    },
    workflowProjection,
  };
}

export function projectJourneyViewForAction(
  action: ProjectStateAction
): "applications" | "admissions" | "student500" | null {
  switch (action.code) {
    case "open_admissions_workflow":
    case "select_service_mode":
    case "record_offer_or_exception":
    case "record_coe_evidence":
      return "admissions";
    case "select_intake":
    case "add_application_reference":
    case "review_school_source_status":
    case "rebuild_preparation_package":
    case "review_application_information":
    case "complete_application_details":
    case "bind_source_evidence":
    case "build_preparation_package":
      return "applications";
    case "provide_student500_information":
    case "record_study_evidence_route":
    case "student500_source_verification_incomplete":
      return "student500";
    default:
      return null;
  }
}

export function projectJourneyActionLabelKey(
  code: string
):
  | "selectIntake"
  | "addSchoolReferences"
  | "reviewSource"
  | "refreshPackage"
  | "openAdmissions"
  | "completeDetails"
  | "bindEvidence"
  | "buildPackage"
  | "selectServiceMode"
  | "recordOffer"
  | "recordCoe"
  | "provideStudentInformation"
  | "recordStudyRoute"
  | "reviewInformation"
  | null {
  switch (code) {
    case "select_intake":
      return "selectIntake";
    case "add_application_reference":
      return "addSchoolReferences";
    case "review_school_source_status":
      return "reviewSource";
    case "rebuild_preparation_package":
      return "refreshPackage";
    case "open_admissions_workflow":
      return "openAdmissions";
    case "complete_application_details":
      return "completeDetails";
    case "bind_source_evidence":
      return "bindEvidence";
    case "build_preparation_package":
      return "buildPackage";
    case "select_service_mode":
      return "selectServiceMode";
    case "record_offer_or_exception":
      return "recordOffer";
    case "record_coe_evidence":
      return "recordCoe";
    case "provide_student500_information":
      return "provideStudentInformation";
    case "record_study_evidence_route":
      return "recordStudyRoute";
    case "review_application_information":
    case "student500_source_verification_incomplete":
      return "reviewInformation";
    default:
      return null;
  }
}

export function projectJourneyReasonLabelKey(
  code: string
):
  | "intakeNotSelected"
  | "referencesMissing"
  | "sourceNotVerified"
  | "packageUnusable"
  | "admissionsCaseMissing"
  | "studentRouteMissing"
  | "studentSourceNotVerified"
  | "linkedSchoolUnavailable"
  | "routeNotApplicable"
  | null {
  const baseCode = code.split(":", 1)[0];
  switch (baseCode) {
    case "intake_not_selected":
      return "intakeNotSelected";
    case "no_application_references":
      return "referencesMissing";
    case "source_not_independently_verified":
      return "sourceNotVerified";
    case "student500_source_verification_incomplete":
      return "studentSourceNotVerified";
    case "package_unusable":
    case "rebuild_preparation_package":
      return "packageUnusable";
    case "admissions_case_not_recorded":
      return "admissionsCaseMissing";
    case "study_evidence_route_not_recorded":
      return "studentRouteMissing";
    case "linked_school_application_unavailable":
      return "linkedSchoolUnavailable";
    case "explicit_no_school_application_route":
      return "routeNotApplicable";
    default:
      return null;
  }
}
