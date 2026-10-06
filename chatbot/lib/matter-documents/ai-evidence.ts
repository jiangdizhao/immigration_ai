import "server-only";

import {
  getLatestMatterDocumentProcessingAttempt,
  getMatterDocumentProcessingEvidence,
  listMatterDocumentRecordsForOwner,
} from "@/lib/db/queries";
import type {
  CustomerDocumentEvidence,
  CustomerDocumentManifest,
} from "./ai-evidence-packet";
import { resolveConversationMatterDocumentEvidence } from "./ai-evidence-packet";

export * from "./ai-evidence-packet";

export async function buildConversationMatterDocumentEvidence(input: {
  userId: string;
  chatId: string;
}): Promise<{
  evidence: CustomerDocumentEvidence;
  manifest: CustomerDocumentManifest[];
}> {
  const records = await listMatterDocumentRecordsForOwner(input);
  const documents = records.map(({ matterDocument }) => matterDocument);
  return resolveConversationMatterDocumentEvidence({
    ...input,
    documents,
    getLatestAttempt: (documentId) =>
      getLatestMatterDocumentProcessingAttempt({
        documentId,
        userId: input.userId,
      }),
    getEvidence: async (documentId, runId) => {
      const result = await getMatterDocumentProcessingEvidence({
        documentId,
        userId: input.userId,
        runId,
      });
      return result?.units ?? null;
    },
  });
}

export function customerDocumentSources(manifest: CustomerDocumentManifest[]) {
  return manifest.map(
    ({
      documentId,
      runId,
      originalFilename,
      runStatus,
      extractionMethod,
      truncated,
      locators,
    }) => ({
      documentId,
      runId,
      originalFilename,
      runStatus,
      extractionMethod,
      truncated,
      locators,
    })
  );
}
