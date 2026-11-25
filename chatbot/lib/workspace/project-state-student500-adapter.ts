import type { Student500ApplicationDetailView } from "@/lib/student-500/service";
import type { ProjectStateStudent500Input } from "./project-state";

/** Maps the authorized Student 500 service view to the bounded M1 input. */
export function student500ProjectStateInput(
  detail: Student500ApplicationDetailView
): ProjectStateStudent500Input {
  return {
    applicationId: detail.applicationId,
    archivedAt: detail.archivedAt,
    context: {
      applicationPlace: detail.context.applicationPlace,
      coeStatus: detail.context.coeStatus,
      entryRoute: detail.context.entryRoute,
      schoolApplicationId: detail.context.schoolApplicationId,
    },
    createdAt: detail.createdAt,
    events: detail.events.map((event) => ({
      createdAt: event.createdAt,
      eventType: event.eventType,
      revision: event.applicationRevision,
      subjectId: event.subjectId,
      subjectKind: event.subjectKind,
    })),
    projectId: detail.projectId,
    revision: detail.revision,
    screening: {
      missingFactCodes: detail.screening.missingFactCodes,
      sourceVerification:
        detail.screening.officialChecklist.legalSourceVerification,
    },
    status: detail.status,
    updatedAt: detail.updatedAt,
  };
}
