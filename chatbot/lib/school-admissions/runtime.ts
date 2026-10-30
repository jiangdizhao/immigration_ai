// biome-ignore-all lint/suspicious/useAwait: adapter methods are asynchronous by contract.
import "server-only";

import { auth } from "@/app/(auth)/auth";
import { schoolAdmissionsSchemaAvailable } from "@/lib/db/school-admissions-schema-availability";
import { schoolApplicationSchemaAvailable } from "@/lib/db/school-application-schema-availability";
import { evaluateManagedHandoffReadiness } from "@/lib/managed-handoff/evaluator";
import { denyAllManagedHandoffPorts } from "@/lib/managed-handoff/ports";
import { unavailableManagedTargetProvider } from "@/lib/professional-review/target-provider";
import { SCHOOL_APPLICATION_TARGET_KIND } from "@/lib/school-applications/contracts";
import {
  postgresSchoolApplicationCatalogResolver,
  postgresSchoolApplicationReferenceResolver,
} from "@/lib/school-applications/postgres-repository";
import { schoolApplicationService } from "@/lib/school-applications/runtime";
import { schoolAdmissionsEnabled } from "./contracts";
import { createSchoolAdmissionsHandlers } from "./http";
import {
  disabledSchoolAdmissionsDraftingPort,
  type SchoolAdmissionsApplicationPort,
  type SchoolAdmissionsEducationPort,
  type SchoolAdmissionsEvidencePort,
  type SchoolAdmissionsManagedPort,
  unavailableSchoolAdmissionsVerificationPort,
} from "./ports";
import {
  postgresSchoolAdmissionsDocumentResolver,
  postgresSchoolAdmissionsStore,
} from "./postgres-repository";
import { createSchoolAdmissionsService } from "./service";

/**
 * Phase 13 M5.2 runtime composition.
 *
 * Everything here is deny-only or read-only by construction:
 * - the M5.1 application read-model is produced by the accepted M5.1 service, so
 *   M5.2 inherits its authorization, freshness and package-usability decisions;
 * - M2 evidence and M3 education reuse the accepted M5.1 resolvers, so no second
 *   provenance model exists;
 * - drafting is `disabled` (no approved model provider, no data egress);
 * - exceptions/outcomes cannot be verified (no approved authority);
 * - managed readiness is the M4-007 evaluator composed with deny-all ports, so it
 *   can only answer NOT_READY or UNKNOWN and never submits anything.
 *
 * `PHASE13_SCHOOL_ADMISSIONS_ENABLED` defaults OFF, so the whole surface is
 * absent until an explicit owner decision, and the schema probe fails closed
 * because migration 0047 is unapplied.
 */

const applicationPort: SchoolAdmissionsApplicationPort = {
  async list(input) {
    try {
      const applications = await schoolApplicationService.list({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
      });
      // M5.1 already returns only the actor's own applications (creator-private).
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
    let detail: Awaited<ReturnType<typeof schoolApplicationService.get>>;
    try {
      detail = await schoolApplicationService.get({
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        projectId: input.projectId,
      });
    } catch {
      // An M5.1 authorization or freshness failure is never guessed at.
      return { status: "forbidden" };
    }
    const view = detail;
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
        // Reference fingerprints are resolved live by the evidence port below;
        // this adapter only forwards identity/freshness, never content.
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
      status: "found",
    };
  },
};

const evidencePort: SchoolAdmissionsEvidencePort = {
  async resolve(input) {
    return postgresSchoolApplicationReferenceResolver.resolve({
      actorUserId: input.actorUserId,
      kind: input.kind,
      projectId: input.projectId,
      referenceId: input.referenceId,
    });
  },
  async conflictState() {
    // No approved Project-fact conflict summary adapter exists yet; the honest
    // answer is "cannot be established", never "no conflicts".
    return "unavailable" as const;
  },
};

const educationPort: SchoolAdmissionsEducationPort = {
  async resolve(input) {
    const resolved = await postgresSchoolApplicationCatalogResolver.resolve({
      courseId: input.courseId,
      deliveryId: null,
      institutionId: input.institutionId,
      intakeId: null,
    });
    if (resolved.status === "resolved") {
      return {
        courseLabel: resolved.courseTitle,
        institutionLabel: resolved.institutionName,
        recordClass: resolved.recordClass,
        snapshotToken: resolved.snapshotToken,
        status: "resolved",
      };
    }
    return resolved.status === "unavailable"
      ? { status: "unavailable" }
      : { status: "not_found" };
  },
};

const managedPort: SchoolAdmissionsManagedPort = {
  async evaluate(input) {
    const result = await evaluateManagedHandoffReadiness(
      {
        actorUserId: input.actorUserId,
        messagingConsentPresent: false,
        projectId: input.projectId,
        target: {
          targetId: input.applicationId,
          targetKind: SCHOOL_APPLICATION_TARGET_KIND,
        },
        // VIP is context only; it is never a readiness input.
        vipEntitlementActive: false,
      },
      denyAllManagedHandoffPorts(unavailableManagedTargetProvider)
    );
    return {
      checkedAt: new Date(result.checkedAt),
      evidenceProvenance: result.evidenceProvenance,
      reasonCodes: result.reasonCodes,
      revalidationToken: result.revalidationToken,
      status: result.status,
    };
  },
};

export const schoolAdmissionsService = createSchoolAdmissionsService({
  applicationPort,
  documentPort: postgresSchoolAdmissionsDocumentResolver,
  draftingPort: disabledSchoolAdmissionsDraftingPort,
  educationPort,
  evidencePort,
  managedPort,
  store: postgresSchoolAdmissionsStore,
  verificationPort: unavailableSchoolAdmissionsVerificationPort,
});

export const schoolAdmissionsHandlers = createSchoolAdmissionsHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { type: session.user.type, userId: session.user.id };
  },
  enabled: () => schoolAdmissionsEnabled(),
  async schemaAvailable() {
    // Both additive schemas are required: M5.2 always reads M5.1 identity.
    const [m51, m52] = await Promise.all([
      schoolApplicationSchemaAvailable(),
      schoolAdmissionsSchemaAvailable(),
    ]);
    return m51 && m52;
  },
  service: schoolAdmissionsService,
});
