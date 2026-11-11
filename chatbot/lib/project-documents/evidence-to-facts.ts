import {
  type ExistingFactForExtraction,
  extractProjectFactCandidates,
  type ProjectFactCandidateDraft,
  type ProjectFactExtractionConflict,
  type ProjectFactExtractionResult,
} from "@/lib/project-facts/extraction";
import type { FactActorContext } from "@/lib/project-facts/review";
import type {
  ProjectDocumentEvidencePersistence,
  ProjectEvidenceRun,
} from "./evidence";

/**
 * Phase 14-B bridge from verified Project Document evidence to **proposed** Project Facts.
 *
 * This is the single composition point used by the Project Document pipeline after a run
 * has completed. It re-uses the run's already-issued opaque evidence references, so a
 * proposed fact can never cite a reference that the evidence service did not issue for
 * this exact run. Nothing here confirms, publishes or grants anything.
 */

export type ProposeFactsFromEvidenceInput = {
  actor: FactActorContext;
  operationId: string;
  run: ProjectEvidenceRun;
  /** Batch limit for one document; keeps a single upload's proposal set reviewable. */
  maxDrafts?: number;
};

export type ProposeFactsFromEvidenceResult = {
  extraction: ProjectFactExtractionResult;
  proposedDrafts: ProjectFactCandidateDraft[];
  excludedDrafts: number;
  conflictKeys: string[];
  /** True when the run itself was not complete/partial, so nothing could be proposed. */
  skippedBecauseRunIncomplete: boolean;
};

export function createProjectFactEvidenceProposalService(input: {
  persistence: Pick<ProjectDocumentEvidencePersistence, "issueReference">;
  review: {
    proposeExtracted: (input: {
      actor: FactActorContext;
      operationId: string;
      extraction: ProjectFactExtractionResult;
      excludedKeys?: readonly string[];
    }) => Promise<{ proposed: unknown[]; conflictKeys: string[] }>;
  };
  existingFacts: (input: {
    actorUserId: string;
    projectId: string;
  }) => Promise<readonly ExistingFactForExtraction[]>;
}) {
  return {
    async proposeFromEvidenceRun(
      request: ProposeFactsFromEvidenceInput
    ): Promise<ProposeFactsFromEvidenceResult> {
      const emptyExtraction: ProjectFactExtractionResult = {
        extractionVersion: "skipped",
        drafts: [],
        conflicts: [],
        duplicatesSkipped: 0,
        unitsWithoutFields: 0,
        documentKinds: [],
      };
      if (
        request.run.status !== "complete" &&
        request.run.status !== "partial"
      ) {
        return {
          extraction: emptyExtraction,
          proposedDrafts: [],
          excludedDrafts: 0,
          conflictKeys: [],
          skippedBecauseRunIncomplete: true,
        };
      }
      // References must come from the evidence service for this exact run.
      const refs = await Promise.all(
        request.run.candidates.map(async (candidate) => ({
          ordinal: candidate.ordinal,
          evidenceRef: await input.persistence.issueReference({
            actorUserId: request.actor.actorUserId,
            projectId: request.actor.projectId,
            runId: request.run.id,
            candidateOrdinal: candidate.ordinal,
          }),
        }))
      );
      const refsByOrdinal = new Map(
        refs.map((entry) => [entry.ordinal, entry.evidenceRef])
      );
      const existing = await input.existingFacts({
        actorUserId: request.actor.actorUserId,
        projectId: request.actor.projectId,
      });
      const extraction = extractProjectFactCandidates({
        candidates: request.run.candidates,
        refsByOrdinal,
        existingFacts: existing,
      });
      const limit = request.maxDrafts ?? extraction.drafts.length;
      const drafts = extraction.drafts.slice(0, limit);
      const bounded: ProjectFactExtractionResult = {
        ...extraction,
        drafts,
      };
      const result = await input.review.proposeExtracted({
        actor: request.actor,
        operationId: request.operationId,
        extraction: bounded,
      });
      return {
        extraction: {
          ...bounded,
          conflicts: extraction.conflicts as ProjectFactExtractionConflict[],
        },
        proposedDrafts: drafts,
        excludedDrafts: extraction.drafts.length - drafts.length,
        conflictKeys: result.conflictKeys,
        skippedBecauseRunIncomplete: false,
      };
    },
  };
}
