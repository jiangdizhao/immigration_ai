import "server-only";

import type { ExistingFactForExtraction } from "@/lib/project-facts/extraction";
import type { createProjectFactReviewService } from "@/lib/project-facts/review";
import type { ProjectDocumentEvidencePersistence } from "./evidence";
import { createProjectFactEvidenceProposalService } from "./evidence-to-facts";

/**
 * Phase 14-B R1-03: the Project Document side of the Document → Facts integration.
 *
 * This module lives inside `lib/project-documents` because that is the only place allowed to
 * touch the M2 evidence store (an existing architectural guard enforces that boundary). It
 * provides the "evidence run completed" hook that turns a completed run into **proposed**
 * facts.
 *
 * The fact-source *verifier* is NOT defined here any more: it lives in `fact-capabilities.ts`
 * and is strictly proof-checked (authenticated scan attestation bound to the exact Project,
 * document version, generation, object identity and SHA-256). The earlier lenient
 * `createProjectFactEvidenceValidator` (which let any caller define verification) was removed
 * so no status-based path to "verified" exists. Both parts are composed by `runtime.ts`.
 * While the documents runtime is closed (`application: null`, `trustedLiveReadiness: false`)
 * the hook never runs and the fact runtime keeps refusing document-extracted facts.
 */

export type EvidenceRunCompletedResult = {
  proposedCount: number;
  skippedBecauseRunIncomplete: boolean;
  conflictKeys: string[];
};

/**
 * Called by the documents runtime after a **successful** evidence extraction. It receives
 * only identifiers, reloads the completed run through the M2 store, issues the run's own
 * references and persists proposed candidates.
 */
export type EvidenceRunCompletedHook = (input: {
  actorUserId: string;
  projectId: string;
  runId: string;
  expectedProjectRevision: number;
  operationId: string;
}) => Promise<EvidenceRunCompletedResult>;

/**
 * Builds the completion hook. It reuses the run's own issued references (replay safe,
 * duplicate suppressed) and persists only **proposed** candidates — never a confirmation,
 * publication or AI-use grant.
 */
export function createEvidenceRunCompletedHook(input: {
  persistence: Pick<
    ProjectDocumentEvidencePersistence,
    "issueReference" | "findRunForReferenceIssue"
  >;
  existingFacts: (request: {
    actorUserId: string;
    projectId: string;
  }) => Promise<readonly ExistingFactForExtraction[]>;
  proposeExtracted: ReturnType<
    typeof createProjectFactReviewService
  >["proposeExtracted"];
}): EvidenceRunCompletedHook {
  const proposer = createProjectFactEvidenceProposalService({
    persistence: input.persistence,
    review: { proposeExtracted: input.proposeExtracted },
    existingFacts: input.existingFacts,
  });
  return async (request) => {
    const run = await input.persistence.findRunForReferenceIssue({
      actorUserId: request.actorUserId,
      projectId: request.projectId,
      runId: request.runId,
    });
    if (!run) {
      // Unknown or unauthorised run: propose nothing rather than guess.
      return {
        proposedCount: 0,
        skippedBecauseRunIncomplete: true,
        conflictKeys: [],
      };
    }
    const result = await proposer.proposeFromEvidenceRun({
      actor: {
        actorUserId: request.actorUserId,
        projectId: request.projectId,
        expectedProjectRevision: request.expectedProjectRevision,
      },
      operationId: request.operationId,
      run,
    });
    return {
      proposedCount: result.proposedDrafts.length,
      skippedBecauseRunIncomplete: result.skippedBecauseRunIncomplete,
      conflictKeys: result.conflictKeys,
    };
  };
}
