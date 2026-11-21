import "server-only";

import { auth } from "@/app/(auth)/auth";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import { student500PreparationSchemaAvailable } from "@/lib/db/student-500-preparation-schema-availability";
import {
  createProjectFactManagementService,
  PROJECT_STATE_FACT_SOURCE_MAX,
} from "@/lib/project-facts/facts";
import { PostgresProjectFactRepository } from "@/lib/project-facts/postgres-repository";
import { projectChatWritesEnabled } from "@/lib/projects/chat-policy";
import { schoolAdmissionsService } from "@/lib/school-admissions/runtime";
import { student500ApplicationsEnabled } from "../contracts";
import {
  createPostgresStudent500Store,
  postgresStudent500SchoolApplicationLinkResolver,
} from "../postgres-repository";
import { student500Service } from "../runtime";
import {
  STUDENT_500_PREPARATION_MAX_DRAFT_VERSIONS,
  STUDENT_500_PREPARATION_MAX_REVOKE_HISTORY,
  STUDENT_500_PREPARATION_MAX_SNAPSHOT_VERSIONS,
} from "./contracts";
import { createFactContextPort } from "./fact-port";
import { createStudent500PreparationHandlers } from "./http";
import type { Student500AdmissionLinkResolver } from "./ports";
import { createPostgresPreparationStore } from "./postgres-repository";
import { createStudent500PreparationService } from "./service";

/**
 * Phase 13 M6.2 runtime wiring.
 *
 * Reuses, and does not re-implement:
 *   - M6.1 store/service for actor context, application authorization and legal
 *     screening (`screen`);
 *   - M2 `stableProjection` through a bounded adapter for fact evidence;
 *   - M5.2 `schoolAdmissionsService.get` for a read-only Offer/CoE context.
 *
 * Project document trust stays closed: nothing here can enable it, and the
 * preparation view reports documents as unavailable.
 */

const factService = createProjectFactManagementService({
  repository: new PostgresProjectFactRepository(getLazyDatabase()),
});

const admissionsLink: Student500AdmissionLinkResolver = {
  async resolve(input) {
    try {
      const { case: record } =
        await schoolAdmissionsService.getProjectStateCase({
          ...input,
          applicationDataAvailable: true,
        });
      return {
        coe: record.coe
          ? {
              independentlyVerified: record.coe.independentlyVerified,
              kind: "coe" as const,
              provenance: record.coe.provenance,
              superseded: record.coe.superseded,
              version: record.coe.version,
            }
          : null,
        offer: record.offer
          ? {
              independentlyVerified: record.offer.independentlyVerified,
              kind: "offer" as const,
              provenance: record.offer.provenance,
              superseded: record.offer.superseded,
              version: record.offer.version,
            }
          : null,
        originKind: record.originKind,
        revision: record.revision,
        status: "resolved" as const,
      };
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (code === "not_found") {
        return { status: "not_found" as const };
      }
      return { status: "forbidden" as const };
    }
  },
};

const preparationDependencies = {
  admissions: admissionsLink,
  applications: createPostgresStudent500Store(),
  facts: createFactContextPort({
    projection: (args) => factService.stableProjection(args),
  }),
  schoolApplications: postgresStudent500SchoolApplicationLinkResolver,
  screen: async (input) =>
    await student500Service.getScreening({
      actorUserId: input.actorUserId,
      applicationId: input.applicationId,
      projectId: input.projectId,
    }),
  store: createPostgresPreparationStore(),
} satisfies Parameters<typeof createStudent500PreparationService>[0];

export const student500PreparationService = createStudent500PreparationService(
  preparationDependencies
);
const statePreparationStore = {
  ...preparationDependencies.store,
  async listFactReferences(
    input: Parameters<
      typeof preparationDependencies.store.listFactReferences
    >[0]
  ) {
    const rows = await preparationDependencies.store.listFactReferences({
      ...input,
      maxRows: STUDENT_500_PREPARATION_MAX_REVOKE_HISTORY + 1,
    });
    if (rows.length > STUDENT_500_PREPARATION_MAX_REVOKE_HISTORY) {
      throw new Error("student500_reference_history_overflow");
    }
    return rows;
  },
  async listDrafts(
    input: Parameters<typeof preparationDependencies.store.listDrafts>[0]
  ) {
    const rows = await preparationDependencies.store.listDrafts({
      ...input,
      maxRows: STUDENT_500_PREPARATION_MAX_DRAFT_VERSIONS + 1,
      metadataOnly: true,
    });
    if (rows.length > STUDENT_500_PREPARATION_MAX_DRAFT_VERSIONS) {
      throw new Error("student500_draft_history_overflow");
    }
    return rows;
  },
  async listSnapshots(
    input: Parameters<typeof preparationDependencies.store.listSnapshots>[0]
  ) {
    const rows = await preparationDependencies.store.listSnapshots({
      ...input,
      maxRows: STUDENT_500_PREPARATION_MAX_SNAPSHOT_VERSIONS + 1,
      metadataOnly: true,
    });
    if (rows.length > STUDENT_500_PREPARATION_MAX_SNAPSHOT_VERSIONS) {
      throw new Error("student500_snapshot_history_overflow");
    }
    return rows;
  },
};
const statePreparation = createStudent500PreparationService({
  ...preparationDependencies,
  store: statePreparationStore,
  facts: createFactContextPort({
    projection: (args) =>
      factService.stableProjection({
        ...args,
        maxSourceRows: PROJECT_STATE_FACT_SOURCE_MAX,
        metadataOnly: true,
      }),
  }),
});
export const student500ProjectStatePreparationService = {
  async get(input: Parameters<typeof statePreparation.get>[0]) {
    const view = await statePreparation.get(input);
    if (!view.factsAvailable) {
      throw new Error("project_state_fact_source_unavailable");
    }
    // Only state metadata leaves this adapter; placeholder fact values and
    // omitted draft/snapshot bodies can never be mistaken for complete views.
    return {
      applicationId: view.applicationId,
      drafts: view.drafts.map(
        ({ draftId, version, stale, staleReasons, createdAt }) => ({
          draftId,
          version,
          stale,
          staleReasons,
          createdAt,
        })
      ),
      snapshots: view.snapshots.map(
        ({
          snapshotId,
          version,
          stale,
          staleReasons,
          legalCurrentness,
          createdAt,
        }) => ({
          snapshotId,
          version,
          stale,
          staleReasons,
          legalCurrentness,
          createdAt,
        })
      ),
      schoolContext: view.schoolContext,
    };
  },
};

export const student500PreparationHandlers =
  createStudent500PreparationHandlers({
    async authenticate() {
      const session = await auth();
      if (!session?.user?.id) {
        return null;
      }
      return { type: session.user.type, userId: session.user.id };
    },
    enabled: () => student500ApplicationsEnabled(),
    projectWritesEnabled: projectChatWritesEnabled,
    schemaAvailable: student500PreparationSchemaAvailable,
    service: student500PreparationService,
  });
