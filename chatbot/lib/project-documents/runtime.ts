import "server-only";

import { auth } from "@/app/(auth)/auth";
import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import { projectFactServices } from "@/lib/project-facts/runtime";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { createEvidenceRunCompletedHook } from "./facts-integration";
import { createProjectDocumentHandlers } from "./http";
import { PostgresProjectDocumentEvidencePersistence } from "./postgres-evidence-persistence";

/**
 * Customer routes are deliberately non-operational until independent B2 producer
 * authentication, privacy/retention consent and runtime adapters are approved.
 * Enabling the ordinary feature flag cannot supply that missing capability.
 */
/**
 * Phase 14-B R1-03: the Project Document module owns the fact-source *proof-checked*
 * capability (`fact-capabilities.ts`), which the fact service and the Project context
 * resolver compose directly. Nothing is registered globally any more, so availability is
 * deterministic per runtime instead of depending on import order.
 *
 * The persistence used here exists only for the completion hook's reference issuance and
 * run lookup; it is constructed with the same null scan verifier as production, so it can
 * never release bytes or validate an unproven reference.
 */
const factSourcePersistence = new PostgresProjectDocumentEvidencePersistence(
  getLazyDatabase(),
  async () => null
);

/**
 * Reachable processing completion: after a successful extraction the completed run becomes
 * **proposed** Project Facts, never a confirmation or an AI authorization.
 */
const onEvidenceRunCompleted = createEvidenceRunCompletedHook({
  persistence: factSourcePersistence,
  async existingFacts({ actorUserId, projectId }) {
    const projection = await projectFactServices.facts.stableProjection({
      actorUserId,
      projectId,
    });
    const visible = [
      ...projection.unresolvedCandidates,
      ...projection.authorizedForAI,
    ];
    return visible.map((row) => ({
      assertionId: row.id,
      key: row.key,
      value: row.value,
      state: row.state,
    }));
  },
  proposeExtracted: projectFactServices.review.proposeExtracted,
});

export const projectDocumentHandlers = createProjectDocumentHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { userId: session.user.id, type: session.user.type };
  },
  isRegisteredCustomer: projectFoundationRepository.isRegisteredCustomer,
  schemaAvailable: projectFoundationSchemaAvailable,
  featureEnabled: () =>
    process.env.PHASE13_PROJECT_DOCUMENTS_ENABLED?.trim().toLowerCase() ===
    "true",
  trustedLiveReadiness: async () => false,
  application: null,
  onEvidenceRunCompleted,
  async rateLimit({ actorUserId, projectId, action }) {
    try {
      await checkIpRateLimit(actorUserId, {
        maxRequests: action === "download" || action === "upload" ? 10 : 30,
        ttlSeconds: 60 * 60,
        keyPrefix: `phase13-project-documents-${action}-${projectId}`,
      });
      return true;
    } catch {
      return false;
    }
  },
});
