import "server-only";

import { auth } from "@/app/(auth)/auth";
import {
  ProjectFoundationError,
  projectFoundationRepository,
} from "@/lib/db/project-foundation";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { projectStaffAssignmentSchemaAvailable } from "@/lib/db/project-staff-assignment-schema-availability";
import { schoolAdmissionsSchemaAvailable } from "@/lib/db/school-admissions-schema-availability";
import { schoolApplicationSchemaAvailable } from "@/lib/db/school-application-schema-availability";
import { serviceEngagementRepository } from "@/lib/db/service-engagement-repository";
import { serviceEngagementSchemaAvailable } from "@/lib/db/service-engagement-schema-availability";
import { student500PreparationSchemaAvailable } from "@/lib/db/student-500-preparation-schema-availability";
import { student500SchemaAvailable } from "@/lib/db/student-500-schema-availability";
import { PROJECT_STATE_FACT_SOURCE_MAX } from "@/lib/project-facts/facts";
import { projectFactServices } from "@/lib/project-facts/runtime";
import {
  SCHOOL_ADMISSIONS_MAX_CASES_PER_PROJECT,
  schoolAdmissionsEnabled,
} from "@/lib/school-admissions/contracts";
import { schoolAdmissionsService } from "@/lib/school-admissions/runtime";
import {
  SCHOOL_APPLICATION_MAX_APPLICATIONS_PER_PROJECT,
  schoolApplicationsEnabled,
} from "@/lib/school-applications/contracts";
import { schoolApplicationService } from "@/lib/school-applications/runtime";
import {
  STUDENT_500_MAX_APPLICATIONS_PER_PROJECT,
  student500ApplicationsEnabled,
} from "@/lib/student-500/contracts";
import { student500ProjectStatePreparationService } from "@/lib/student-500/preparation/runtime";
import { student500Service } from "@/lib/student-500/runtime";
import { submissionPackagesEnabled } from "@/lib/submission-packages/contracts";
import {
  buildProjectState,
  PROJECT_STATE_MAX_AUTHORIZED_FACTS,
  PROJECT_STATE_MAX_CONCURRENT_DETAIL_READS,
  type ProjectState,
  type ProjectStateAdmissionInput,
  type ProjectStateCapability,
  type ProjectStateInput,
  type ProjectStateSchoolApplicationInput,
  type ProjectStateStudent500Input,
} from "./project-state";
import { createProjectStateHttpHandler } from "./project-state-http";
import {
  mapWithConcurrency,
  projectStateSourceFailure,
} from "./project-state-load-utils";
import { student500ProjectStateInput } from "./project-state-student500-adapter";

export type ProjectStateLoadResult =
  | { kind: "ok"; state: ProjectState }
  | { kind: "not_found" }
  | { kind: "unavailable" };

function capability(
  state: ProjectStateCapability["state"],
  reasonCode: string | null = null
): ProjectStateCapability {
  return { reasonCode, state };
}

function asIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function preparationCapabilityState(
  state: ProjectStateCapability["state"]
): ProjectStateInput["student500PreparationCapability"] {
  return state === "unsupported" ? "unavailable" : state;
}

async function readSchoolApplications(input: {
  actorUserId: string;
  projectId: string;
  actorType: "guest" | "regular";
}) {
  if (!schoolApplicationsEnabled()) {
    return {
      capability: capability("disabled", "school_applications_disabled"),
      rows: null,
    };
  }
  if (input.actorType === "guest") {
    return {
      capability: capability("restricted", "registered_customer_required"),
      rows: null,
    };
  }
  try {
    if (!(await schoolApplicationSchemaAvailable())) {
      return {
        capability: capability(
          "unavailable",
          "school_application_schema_unavailable"
        ),
        rows: null,
      };
    }
    const listed = await schoolApplicationService.listProjectState(input);
    if (listed.length > SCHOOL_APPLICATION_MAX_APPLICATIONS_PER_PROJECT) {
      return {
        capability: capability(
          "unavailable",
          "school_application_list_exceeds_bound"
        ),
        rows: null,
      };
    }
    const rows: ProjectStateSchoolApplicationInput[] = await mapWithConcurrency(
      {
        concurrency: PROJECT_STATE_MAX_CONCURRENT_DETAIL_READS,
        items: listed,
        mapper: async (entry) => {
          const detail = await schoolApplicationService.getProjectState({
            actorUserId: input.actorUserId,
            applicationId: entry.applicationId,
            projectId: input.projectId,
          });
          const latestPackage =
            detail.currentPackage ?? detail.packages[0] ?? null;
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
        },
      }
    );
    return { capability: capability("available"), rows };
  } catch (error) {
    return { capability: projectStateSourceFailure(error), rows: null };
  }
}

async function readAdmissions(input: {
  actorUserId: string;
  projectId: string;
  actorType: "guest" | "regular";
  applicationDataAvailable: boolean;
}) {
  if (!schoolAdmissionsEnabled()) {
    return {
      capability: capability("disabled", "school_admissions_disabled"),
      rows: null,
    };
  }
  if (input.actorType === "guest") {
    return {
      capability: capability("restricted", "registered_customer_required"),
      rows: null,
    };
  }
  try {
    if (!(await schoolAdmissionsSchemaAvailable())) {
      return {
        capability: capability(
          "unavailable",
          "school_admissions_schema_unavailable"
        ),
        rows: null,
      };
    }
    const listed = await schoolAdmissionsService.listProjectStateCases(input);
    if (listed.length > SCHOOL_ADMISSIONS_MAX_CASES_PER_PROJECT) {
      return {
        capability: capability(
          "unavailable",
          "school_admissions_list_exceeds_bound"
        ),
        rows: null,
      };
    }
    const rows: ProjectStateAdmissionInput[] = await mapWithConcurrency({
      concurrency: PROJECT_STATE_MAX_CONCURRENT_DETAIL_READS,
      items: listed,
      mapper: async (summary) => {
        const { case: detail } =
          await schoolAdmissionsService.getProjectStateCase({
            actorUserId: input.actorUserId,
            caseId: summary.caseId,
            applicationDataAvailable: input.applicationDataAvailable,
            projectId: input.projectId,
          });
        return {
          applicationId: detail.applicationId,
          caseId: detail.caseId,
          coe: detail.coe
            ? {
                evidenceAttached: detail.coe.evidenceAttached,
                independentlyVerified: detail.coe.independentlyVerified,
                kind: "coe",
                outcomeId: detail.coe.outcomeId,
                provenance: detail.coe.provenance,
                recordedAt: detail.coe.recordedAt,
                state: detail.coe.state,
                superseded: detail.coe.superseded,
                validityState: detail.coe.expiryState,
                version: detail.coe.version,
              }
            : null,
          createdAt: detail.createdAt,
          courseTitle: detail.courseTitle,
          events: detail.events.map((event) => ({
            createdAt: event.createdAt,
            eventType: event.eventType,
            revision: event.caseRevision,
            subjectId: event.subjectId,
            subjectKind: event.subjectKind,
          })),
          externalActions: detail.externalActions.map((action) => ({
            actionId: action.actionId,
            actionKind: action.actionKind,
            performedOn: action.performedOn,
            provenance: "customer_reported",
            verified: false,
          })),
          institutionName: detail.institutionName,
          intakeLabel: detail.intakeLabel,
          managedReadiness: {
            reasonCodes: detail.managedReadiness.reasonCodes,
            status: detail.managedReadiness.status,
          },
          nextStepCodes: detail.nextStepCodes,
          offer: detail.offer
            ? {
                evidenceAttached: detail.offer.evidenceAttached,
                independentlyVerified: detail.offer.independentlyVerified,
                kind: "offer",
                outcomeId: detail.offer.outcomeId,
                provenance: detail.offer.provenance,
                recordedAt: detail.offer.recordedAt,
                state: detail.offer.state,
                superseded: detail.offer.superseded,
                validityState: detail.offer.expiryState,
                version: detail.offer.version,
              }
            : null,
          originKind: detail.originKind,
          preparationStale: detail.preparationStale,
          preparationState: detail.preparationState,
          projectId: detail.projectId,
          requirements: detail.requirements.map((requirement) => ({
            code: requirement.code,
            status: requirement.status,
            required: requirement.required,
            appliesTo: requirement.appliesTo,
          })),
          revision: detail.revision,
          serviceMode: detail.serviceMode,
          staleReasonCodes: detail.staleReasonCodes,
          updatedAt: detail.updatedAt,
        };
      },
    });
    return { capability: capability("available"), rows };
  } catch (error) {
    return { capability: projectStateSourceFailure(error), rows: null };
  }
}

async function readStudent500(input: {
  actorUserId: string;
  projectId: string;
  actorType: "guest" | "regular";
}) {
  if (!student500ApplicationsEnabled()) {
    return {
      capability: capability("disabled", "student500_disabled"),
      rows: null,
    };
  }
  if (input.actorType === "guest") {
    return {
      capability: capability("restricted", "registered_customer_required"),
      rows: null,
    };
  }
  try {
    if (!(await student500SchemaAvailable())) {
      return {
        capability: capability("unavailable", "student500_schema_unavailable"),
        rows: null,
      };
    }
    const listed = await student500Service.listProjectState(input);
    if (listed.length > STUDENT_500_MAX_APPLICATIONS_PER_PROJECT) {
      return {
        capability: capability("unavailable", "student500_list_exceeds_bound"),
        rows: null,
      };
    }
    const rows = await mapWithConcurrency({
      concurrency: PROJECT_STATE_MAX_CONCURRENT_DETAIL_READS,
      items: listed,
      mapper: async (entry) => {
        const detail = await student500Service.getProjectState({
          actorUserId: input.actorUserId,
          applicationId: entry.applicationId,
          projectId: input.projectId,
        });
        return student500ProjectStateInput(detail);
      },
    });
    return { capability: capability("available"), rows };
  } catch (error) {
    return { capability: projectStateSourceFailure(error), rows: null };
  }
}

async function readStudent500Preparations(input: {
  actorUserId: string;
  projectId: string;
  actorType: "guest" | "regular";
  applications: readonly ProjectStateStudent500Input[] | null;
  studentCapability: ProjectStateCapability;
}) {
  if (input.studentCapability.state !== "available") {
    return {
      capability: capability(
        input.studentCapability.state,
        input.studentCapability.reasonCode
      ),
      rows: null,
    };
  }
  if (input.actorType === "guest") {
    return {
      capability: capability("restricted", "registered_customer_required"),
      rows: null,
    };
  }
  try {
    if (!(await student500PreparationSchemaAvailable())) {
      return {
        capability: capability(
          "unavailable",
          "student500_preparation_schema_unavailable"
        ),
        rows: null,
      };
    }
    const rows = await mapWithConcurrency({
      concurrency: PROJECT_STATE_MAX_CONCURRENT_DETAIL_READS,
      items: input.applications ?? [],
      mapper: async (application) => {
        const view = await student500ProjectStatePreparationService.get({
          actorUserId: input.actorUserId,
          applicationId: application.applicationId,
          projectId: input.projectId,
        });
        return {
          applicationId: view.applicationId,
          drafts: view.drafts.map((draft) => ({
            createdAt: draft.createdAt,
            draftId: draft.draftId,
            stale: draft.stale,
            staleReasons: draft.staleReasons,
            version: draft.version,
          })),
          schoolContext: view.schoolContext
            ? {
                admissionCaseId: view.schoolContext.admissionCaseId,
                admissionOutcomeIndependentlyVerified:
                  view.schoolContext.admissionOutcomeIndependentlyVerified,
                current: view.schoolContext.current,
                kind: view.schoolContext.kind,
                schoolApplicationId: view.schoolContext.schoolApplicationId,
                studyEvidenceKind: view.schoolContext.studyEvidenceKind,
                unavailableReason: view.schoolContext.unavailableReason,
              }
            : null,
          snapshots: view.snapshots.map((snapshot) => ({
            createdAt: snapshot.createdAt,
            legalCurrentness: snapshot.legalCurrentness,
            snapshotId: snapshot.snapshotId,
            stale: snapshot.stale,
            staleReasons: snapshot.staleReasons,
            version: snapshot.version,
          })),
        };
      },
    });
    return { capability: capability("available"), rows };
  } catch (error) {
    return { capability: projectStateSourceFailure(error), rows: null };
  }
}

async function readProjectFacts(input: {
  actorUserId: string;
  projectId: string;
  actorType: "guest" | "regular";
}) {
  if (
    process.env.PHASE14_PROJECT_FACTS_ENABLED?.trim().toLowerCase() !== "true"
  ) {
    return {
      capability: capability("disabled", "project_facts_disabled"),
      facts: {
        authorizedForAI: null,
        conflictCount: null,
        state: "disabled" as const,
      },
    };
  }
  if (input.actorType === "guest") {
    return {
      capability: capability("restricted", "registered_customer_required"),
      facts: {
        authorizedForAI: null,
        conflictCount: null,
        state: "restricted" as const,
      },
    };
  }
  try {
    if (!(await projectFoundationSchemaAvailable())) {
      return {
        capability: capability(
          "unavailable",
          "project_facts_schema_unavailable"
        ),
        facts: {
          authorizedForAI: null,
          conflictCount: null,
          state: "unavailable" as const,
        },
      };
    }
    const projection = await projectFactServices.facts.stableProjection({
      ...input,
      maxSourceRows: PROJECT_STATE_FACT_SOURCE_MAX,
      metadataOnly: true,
    });
    if (!projection.available) {
      return {
        capability: capability(
          "unavailable",
          "project_facts_projection_unavailable"
        ),
        facts: {
          authorizedForAI: null,
          conflictCount: null,
          state: "unavailable" as const,
        },
      };
    }
    if (
      projection.authorizedForAI.length > PROJECT_STATE_MAX_AUTHORIZED_FACTS
    ) {
      return {
        capability: capability(
          "unavailable",
          "project_fact_list_exceeds_bound"
        ),
        facts: {
          authorizedForAI: null,
          conflictCount: null,
          state: "unavailable" as const,
        },
      };
    }
    return {
      capability: capability("available"),
      facts: {
        authorizedForAI: projection.authorizedForAI.map((fact) => ({
          assertionId: fact.id,
          key: fact.key,
          sourceEvidenceRef: fact.sourceEvidenceRef,
          version: fact.version,
        })),
        conflictCount: projection.conflicts.filter(
          (conflict) => conflict.resolvedAt === null
        ).length,
        state: "available" as const,
      },
    };
  } catch (error) {
    const failed = projectStateSourceFailure(error);
    return {
      capability: failed,
      facts: {
        authorizedForAI: null,
        conflictCount: null,
        state:
          failed.state === "restricted"
            ? ("restricted" as const)
            : ("unavailable" as const),
      },
    };
  }
}

async function readServiceEngagements(input: {
  actorUserId: string;
  projectId: string;
  actorType: "guest" | "regular";
}) {
  if (input.actorType === "guest") {
    return {
      capability: capability("restricted", "registered_customer_required"),
      rows: null,
    };
  }
  try {
    const available = await Promise.all([
      projectFoundationSchemaAvailable(),
      projectStaffAssignmentSchemaAvailable(),
      serviceEngagementSchemaAvailable(),
    ]);
    if (!available.every(Boolean)) {
      return {
        capability: capability(
          "unavailable",
          "service_engagement_schema_unavailable"
        ),
        rows: null,
      };
    }
    // 50 is the owning repository's bounded maximum. If the source reports more,
    // fail closed rather than exposing an incomplete service scope.
    const result = await serviceEngagementRepository.listEngagements({
      actorUserId: input.actorUserId,
      limit: 50,
      projectId: input.projectId,
    });
    if (result.hasMore) {
      return {
        capability: capability(
          "unavailable",
          "service_engagement_list_exceeds_bound"
        ),
        rows: null,
      };
    }
    return {
      capability: capability("available"),
      rows: result.items.map((engagement) => {
        if (
          engagement.scopeCodes === null ||
          engagement.serviceMode === null ||
          engagement.status === null
        ) {
          throw new Error("service_engagement_metadata_unavailable");
        }
        return {
          engagementId: engagement.engagementId,
          revision: engagement.revision,
          scopeCodes: [...engagement.scopeCodes],
          serviceMode: engagement.serviceMode,
          status: engagement.status,
          updatedAt: asIso(engagement.updatedAt),
        };
      }),
    };
  } catch (error) {
    return { capability: projectStateSourceFailure(error), rows: null };
  }
}

export async function loadProjectStateForActor(input: {
  actorUserId: string;
  actorType: "guest" | "regular";
  projectId: string;
}): Promise<ProjectStateLoadResult> {
  let project: { id: string; status: "active" | "closed"; revision: number };
  try {
    project = await projectFoundationRepository.authorizeProjectRead(input);
  } catch (error) {
    return {
      kind:
        error instanceof ProjectFoundationError ? "not_found" : "unavailable",
    };
  }

  const sourceInput = {
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    projectId: input.projectId,
  } as const;
  const school = await readSchoolApplications(sourceInput);
  const [admissions, student500, facts, serviceScope] = await Promise.all([
    readAdmissions({
      ...sourceInput,
      applicationDataAvailable: school.capability.state === "available",
    }),
    readStudent500(sourceInput),
    readProjectFacts(sourceInput),
    readServiceEngagements(sourceInput),
  ]);
  const preparations = await readStudent500Preparations({
    ...sourceInput,
    applications: student500.rows,
    studentCapability: student500.capability,
  });

  const documentFeatureEnabled =
    process.env.PHASE13_PROJECT_DOCUMENTS_ENABLED?.trim().toLowerCase() ===
    "true";
  const capabilities = {
    projectDocuments: capability(
      documentFeatureEnabled ? "unavailable" : "disabled",
      documentFeatureEnabled
        ? "trusted_project_document_read_unavailable"
        : "project_documents_disabled"
    ),
    projectFacts: facts.capability,
    schoolAdmissions: admissions.capability,
    schoolApplications: school.capability,
    serviceEngagements: serviceScope.capability,
    student500: student500.capability,
    student500Preparation: preparations.capability,
    submissionPackages: submissionPackagesEnabled()
      ? capability("unsupported", "no_project_level_submission_package_read")
      : capability("disabled", "submission_packages_disabled"),
  };

  try {
    return {
      kind: "ok",
      state: buildProjectState({
        admissionsCases: admissions.rows,
        capabilities,
        facts: facts.facts,
        generatedAt: new Date().toISOString(),
        project,
        schoolApplications: school.rows,
        serviceEngagements: serviceScope.rows,
        student500Applications: student500.rows,
        student500PreparationCapability: preparationCapabilityState(
          preparations.capability.state
        ),
        student500Preparations: preparations.rows,
      }),
    };
  } catch {
    return { kind: "unavailable" };
  }
}

const handleProjectState = createProjectStateHttpHandler({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { type: session.user.type, userId: session.user.id };
  },
  loadForActor: loadProjectStateForActor,
});

export function projectStateResponse(projectId: string) {
  return handleProjectState(projectId);
}
