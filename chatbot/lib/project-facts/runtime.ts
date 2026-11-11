import "server-only";

import { auth } from "@/app/(auth)/auth";
import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import { createDatabaseProjectFactEvidenceVerifier } from "@/lib/project-documents/fact-capabilities";
import { createProjectFactManagementService } from "./facts";
import { createProjectFactHandlers, type ProjectFactProjection } from "./http";
import { PostgresProjectFactRepository } from "./postgres-repository";
import { createProjectFactReviewService } from "./review";

/**
 * Phase 14-B Project basic-information runtime.
 *
 * The surface is feature-gated and fails closed: without the flag, a ready schema and
 * verified Project membership the endpoints answer 503/403 rather than degrading into an
 * unchecked read. Document-extracted facts additionally require a live evidence-reference
 * check inside the fact service, so a revoked grant or a withdrawn/blocked source
 * disappears from the next request.
 */
/**
 * R1 (composition): one deterministic proof-checked verifier, supplied to **both** layers
 * that require it — the fact service and the SQL repository itself. No process-wide registry
 * and no dependency on whether an unrelated route happened to be imported first.
 */
const database = getLazyDatabase();
const verifyFactEvidence = createDatabaseProjectFactEvidenceVerifier({
  database,
});

const factService = createProjectFactManagementService({
  repository: new PostgresProjectFactRepository(database, verifyFactEvidence),
  verifyEvidence: verifyFactEvidence,
});

const reviewService = createProjectFactReviewService({
  facts: factService,
  /**
   * R1-01: the repository advances the Project revision on every mutation, so the batch
   * orchestration must read the authoritative revision between writes rather than reuse a
   * stale one.
   */
  async readProjectRevision({ actorUserId, projectId }) {
    const decision = await projectFoundationRepository.authorizeProjectAccess({
      actorUserId,
      projectId,
      intent: "project_write",
    });
    return decision.revision;
  },
  /**
   * R1-02: distinguishes "the supersede never happened" from "the supersede happened but
   * the replacement is missing". Superseded rows are still visible in the projection's
   * unresolved candidates for their creator.
   */
  async readFactState({ actorUserId, projectId, assertionId }) {
    const projection = await factService.stableProjection({
      actorUserId,
      projectId,
    });
    const found = [
      ...projection.unresolvedCandidates,
      ...projection.authorizedForAI,
    ].find((row) => row.id === assertionId);
    return found ? { state: found.state, version: found.version } : null;
  },
});

function toProjection(
  projection: Awaited<ReturnType<typeof factService.stableProjection>>
): ProjectFactProjection | null {
  if (!projection.available) {
    return null;
  }
  const conflicted = new Set(
    projection.conflicts
      .filter((conflict) => conflict.resolvedAt === null)
      .flatMap((conflict) => [
        conflict.leftAssertionId,
        conflict.rightAssertionId,
      ])
  );
  return {
    candidates: projection.unresolvedCandidates.map((assertion) => ({
      assertionId: assertion.id,
      assertionVersion: assertion.version,
      key: assertion.key,
      valueType: assertion.valueType,
      value: assertion.value,
      originKind: assertion.originKind,
      sourceEvidenceRef: assertion.sourceEvidenceRef,
      state: assertion.state,
      conflicts: conflicted.has(assertion.id),
    })),
    authorizedForAI: projection.authorizedForAI.map((assertion) => ({
      assertionId: assertion.id,
      assertionVersion: assertion.version,
      key: assertion.key,
      valueType: assertion.valueType,
      value: assertion.value,
      effectiveFrom: assertion.effectiveFrom,
      effectiveTo: assertion.effectiveTo,
      sourceEvidenceRef: assertion.sourceEvidenceRef,
    })),
    conflictCount: projection.conflicts.filter(
      (conflict) => conflict.resolvedAt === null
    ).length,
  };
}

export const projectFactHandlers = createProjectFactHandlers({
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
    process.env.PHASE14_PROJECT_FACTS_ENABLED?.trim().toLowerCase() === "true",
  async authorize({ actorUserId, projectId, intent }) {
    const decision = await projectFoundationRepository.authorizeProjectAccess({
      actorUserId,
      projectId,
      intent,
    });
    return {
      id: decision.id,
      status: decision.status,
      revision: decision.revision,
    };
  },
  async projection({ actorUserId, projectId }) {
    return toProjection(
      await factService.stableProjection({ actorUserId, projectId })
    );
  },
  review: reviewService,
});

/**
 * Phase 14-B R1-03: the Project Document composition needs the same authorised fact service
 * (to propose candidates) and the same projection (to detect existing values). Exporting the
 * instances keeps one composition instead of building a second fact service.
 */
export const projectFactServices = {
  facts: factService,
  review: reviewService,
};
