/**
 * Phase 13 M5.3 — the real M5.1 → M5.2 application boundary.
 *
 * This is a *composition* adapter, not a mock: every call goes to the accepted
 * M5.1 service, so M5.2 inherits M5.1's authorization, creator-privacy,
 * revision, source-status and package-usability decisions. It mirrors the
 * production adapter in `lib/school-admissions/runtime.ts` field for field; the
 * only difference is that it is bound to an injected service instance so the
 * integrated harness can compose a connected in-memory M5.1 store.
 *
 * `referenceSha256` is intentionally blank here exactly as in production: live
 * reference fingerprints are resolved by the M5.2 evidence port, so this port
 * never becomes a second provenance authority.
 */
import type { SchoolAdmissionsApplicationPort } from "../school-admissions/ports";
import type { createSchoolApplicationService } from "../school-applications/service";

type SchoolApplicationService = ReturnType<
  typeof createSchoolApplicationService
>;

export function createSchoolAdmissionsApplicationPort(
  service: SchoolApplicationService
): SchoolAdmissionsApplicationPort {
  return {
    async list(input) {
      try {
        const applications = await service.list({
          actorUserId: input.actorUserId,
          projectId: input.projectId,
        });
        // The M5.1 service already returns only the actor's own applications.
        return {
          applications: applications.map((entry) => ({
            applicationId: entry.applicationId,
            archived: entry.archivedAt !== null,
            courseTitle: entry.course.title,
            institutionName: entry.institution.name,
            intakeLabel: entry.intake.label,
            revision: entry.revision,
            sourceStatus: entry.source.status,
          })),
          status: "listed" as const,
        };
      } catch {
        return { status: "unavailable" as const };
      }
    },
    async load(input) {
      let view: Awaited<ReturnType<SchoolApplicationService["get"]>>;
      try {
        view = await service.get({
          actorUserId: input.actorUserId,
          applicationId: input.applicationId,
          projectId: input.projectId,
        });
      } catch {
        // An M5.1 authorization or freshness failure is never guessed at.
        return { status: "forbidden" as const };
      }
      return {
        application: {
          applicationId: view.applicationId,
          applicationStatus: view.status,
          archived: view.status === "archived",
          catalogRecordClass: view.source.catalogRecordClass,
          catalogSnapshotToken: view.source.catalogSnapshotToken,
          courseId: view.course.catalogId,
          courseTitle: view.course.title,
          currentPackage: view.currentPackage
            ? {
                contentSha256: view.currentPackage.contentSha256,
                inputsSha256: view.currentPackage.inputsSha256,
                packageId: view.currentPackage.packageId,
                staleReasonCodes: view.currentPackage.staleReasonCodes,
                targetBindingSha256: view.currentPackage.targetBindingSha256,
                usable: view.currentPackage.usable,
                version: view.currentPackage.version,
              }
            : null,
          deliveryId: view.deliveryId,
          institutionId: view.institution.catalogId,
          institutionName: view.institution.name,
          intakeId: view.intake.id,
          intakeLabel: view.intake.label,
          missingDataCodes: view.missingDataCodes,
          projectId: view.projectId,
          references: view.references.map((entry) => ({
            available: entry.available,
            changed: entry.changed,
            kind: entry.kind,
            referenceId: entry.referenceId,
            referenceSha256: "",
            referenceVersion: entry.referenceVersion,
            revoked: entry.revokedAt !== null,
          })),
          revision: view.revision,
          sourceStatus: view.source.status,
        },
        status: "found" as const,
      };
    },
  };
}
