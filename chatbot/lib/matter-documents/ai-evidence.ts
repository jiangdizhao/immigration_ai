import "server-only";

import {
  getMatterDocumentProcessingEvidence,
  getMatterDocumentRecordForOwner,
} from "@/lib/db/queries";
import type {
  CustomerDocumentEvidence,
  CustomerDocumentManifest,
  MatterDocumentEvidenceInput,
} from "./ai-evidence-packet";
import {
  assertMatterDocumentEvidenceReady,
  assertSelectedMatterDocumentAccess,
  buildBoundedMatterDocumentEvidence,
  MAX_SELECTED_DOCUMENTS,
  SelectedMatterDocumentError,
} from "./ai-evidence-packet";

export * from "./ai-evidence-packet";

export async function buildSelectedMatterDocumentEvidence(input: {
  userId: string;
  chatId: string;
  selectedDocumentIds: string[];
}): Promise<{
  evidence: CustomerDocumentEvidence;
  manifest: CustomerDocumentManifest[];
}> {
  if (
    input.selectedDocumentIds.length > MAX_SELECTED_DOCUMENTS ||
    new Set(input.selectedDocumentIds).size !== input.selectedDocumentIds.length
  ) {
    throw new SelectedMatterDocumentError("not_ready");
  }
  const documents: MatterDocumentEvidenceInput["documents"] = [];
  for (const documentId of input.selectedDocumentIds) {
    const document = await getMatterDocumentRecordForOwner({
      documentId,
      userId: input.userId,
    });
    assertSelectedMatterDocumentAccess(document, {
      userId: input.userId,
      chatId: input.chatId,
    });
    const result = await getMatterDocumentProcessingEvidence({
      documentId,
      userId: input.userId,
    });
    if (!result) {
      throw new SelectedMatterDocumentError("not_ready");
    }
    const run = result.run;
    assertMatterDocumentEvidenceReady(run, result.units.length);
    documents.push({
      document,
      run: {
        ...run,
        status: run.status as "complete" | "partial" | "needs_review",
      },
      units: result.units,
    });
  }
  return buildBoundedMatterDocumentEvidence({ documents });
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
