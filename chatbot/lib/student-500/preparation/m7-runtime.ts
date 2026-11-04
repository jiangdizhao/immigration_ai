import "server-only";

import { auth } from "@/app/(auth)/auth";
import { student500DeepPreparationSchemaAvailable } from "@/lib/db/student-500-m7-schema-availability";
import { projectChatWritesEnabled } from "@/lib/projects/chat-policy";
import { student500ApplicationsEnabled } from "../contracts";
import { denyAllStudent500EditorialAuthority } from "./editorial";
import {
  deterministicGsComposer,
  unavailableModelGsComposer,
} from "./gs-composer";
import { createStudent500DeepPreparationHandlers } from "./m7-http";
import { createPostgresDeepPreparationStore } from "./m7-postgres-store";
import { createStudent500DeepPreparationService } from "./m7-service";
import { createPostgresPreparationStore } from "./postgres-repository";
import { student500PreparationService } from "./runtime";

/**
 * Phase 13 M7 runtime wiring.
 *
 * Reuses the accepted M6.2 service for every authorization, fact, draft and
 * snapshot rule, and adds only the M7 layer on top. Fail-closed defaults are
 * deliberate and are not environment-toggleable:
 *
 *   - the editorial authority denies every action (no approved policy exists);
 *   - the professional credential verifier reports `unavailable` (no registry is
 *     integrated), so editorial feedback can never be recorded in production;
 *   - disclosure authorization for a non-owner reviewer reports `unavailable`;
 *   - the composer is deterministic; a model composer is not wired.
 */

const preparationStore = createPostgresPreparationStore();

export const student500DeepPreparationService =
  createStudent500DeepPreparationService({
    composer: deterministicGsComposer,
    credentialVerifier: {
      code: "unavailable_professional_credential_verifier",
      verify: () => ({
        reasonCode: "professional_credential_registry_unavailable",
        status: "unavailable" as const,
      }),
    },
    editorialAuthority: denyAllStudent500EditorialAuthority,
    preparation: student500PreparationService,
    resolveDisclosedFactAccess: async () => "unavailable",
    resolveDraftIdentity: async ({ applicationId }) => {
      const drafts = await preparationStore.listDrafts({ applicationId });
      const latest = drafts.at(-1);
      return latest
        ? {
            contentSha256: latest.contentSha256,
            draftId: latest.id,
            version: latest.version,
          }
        : null;
    },
    resolveReviewerAssignment: async () => "unavailable",
    store: createPostgresDeepPreparationStore(),
  });

/** Exported so a test can assert the model composer is never the default. */
export const student500DeepPreparationComposer =
  student500DeepPreparationService === null
    ? unavailableModelGsComposer
    : deterministicGsComposer;

export const student500DeepPreparationHandlers =
  createStudent500DeepPreparationHandlers({
    async authenticate() {
      const session = await auth();
      if (!session?.user?.id) {
        return null;
      }
      return { type: session.user.type, userId: session.user.id };
    },
    enabled: () => student500ApplicationsEnabled(),
    projectWritesEnabled: projectChatWritesEnabled,
    schemaAvailable: student500DeepPreparationSchemaAvailable,
    service: student500DeepPreparationService,
  });
