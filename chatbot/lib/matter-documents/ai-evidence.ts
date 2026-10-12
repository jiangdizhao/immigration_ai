import "server-only";

import {
  getMatterDocumentProcessingEvidence,
  listLatestMatterDocumentProcessingRunsForConversation,
  listMatterDocumentRecordsForOwner,
} from "@/lib/db/queries";
import type {
  CustomerDocumentEvidence,
  CustomerDocumentManifest,
} from "./ai-evidence-packet";
import { resolveConversationMatterDocumentEvidence } from "./ai-evidence-packet";
import {
  type ConversationDocumentStatusSummary,
  summarizeConversationDocumentStatus,
  withPackagedDocumentCount,
} from "./conversation-document-status";

export * from "./ai-evidence-packet";
export * from "./conversation-document-status";

/**
 * Phase 12 Stage 2 — the single server-side source of conversation document
 * context.
 *
 * Both outputs come from the same owner-authorized, conversation-scoped record
 * set, so the answer model can never be told that a document is usable while
 * the workspace panel says otherwise, and vice versa. The status summary is
 * explicitly *not* evidence: it carries counts and bounded filenames only.
 *
 * R1 (reviewer finding): a long-lived conversation can hold far more files than
 * one model turn can carry. The summary therefore always describes *all* stored
 * files, while the packaged count describes the bounded subset whose text was
 * actually supplied to this turn. Extraction text is read lazily, and only for
 * the files the bounded packet can contain, so the work stays proportional to
 * the packet rather than to the conversation's history.
 */
export async function buildConversationDocumentContext(input: {
  userId: string;
  chatId: string;
}): Promise<{
  evidence: CustomerDocumentEvidence;
  manifest: CustomerDocumentManifest[];
  status: ConversationDocumentStatusSummary;
}> {
  const records = await listMatterDocumentRecordsForOwner(input);
  const documents = records.map(({ matterDocument }) => matterDocument);
  /**
   * Latest processing metadata for *every* stored document of the conversation,
   * read in one bounded query. The availability summary must describe all files
   * (a long-lived conversation can hold hundreds), while the evidence packet may
   * only carry a small bounded subset — so this metadata is shared by both and
   * the two can never disagree.
   */
  const runsByDocument = new Map<
    string,
    {
      id: string;
      status: string;
      extractionMethod: string | null;
      truncated: boolean;
      unitCount: number;
    }
  >();
  for (const row of await listLatestMatterDocumentProcessingRunsForConversation(
    {
      userId: input.userId,
      chatId: input.chatId,
    }
  )) {
    runsByDocument.set(row.documentId, {
      id: row.runId,
      status: row.status,
      extractionMethod: row.extractionMethod ?? null,
      truncated: row.truncated,
      unitCount: row.unitCount ?? 0,
    });
  }
  /**
   * A document that is not fully stored, or that failed security review, is
   * never usable evidence and never carries a run status into the summary, even
   * if a processing run row exists.
   */
  const eligibleRun = (document: (typeof documents)[number]) =>
    document.storageStatus === "stored" &&
    document.securityStatus === "clean" &&
    !document.deletedAt
      ? (runsByDocument.get(document.id) ?? null)
      : null;
  const unitsCache = new Map<
    string,
    Array<{
      ordinal: number;
      locator: Record<string, string | number>;
      extractedText: string;
      extractionMethod: string;
    }>
  >();
  const runUnits = async (documentId: string, runId: string) => {
    const key = `${documentId}:${runId}`;
    if (!unitsCache.has(key)) {
      const units =
        (
          await getMatterDocumentProcessingEvidence({
            documentId,
            userId: input.userId,
            runId,
          })
        )?.units ?? [];
      unitsCache.set(key, units);
    }
    return unitsCache.get(key) ?? [];
  };
  const resolved = await resolveConversationMatterDocumentEvidence({
    ...input,
    documents,
    getLatestAttempt: (documentId) => {
      const document = documents.find((entry) => entry.id === documentId);
      const run = document ? eligibleRun(document) : null;
      return Promise.resolve(
        run
          ? {
              id: run.id,
              status: run.status,
              extractionMethod: run.extractionMethod,
              truncated: run.truncated,
            }
          : null
      );
    },
    getEvidence: (documentId, runId) => runUnits(documentId, runId),
  });
  const summarized = summarizeConversationDocumentStatus(
    records.map(({ matterDocument: document }) => {
      const run = eligibleRun(document);
      return {
        originalFilename: document.originalFilename,
        processingStatus: document.processingStatus,
        storageStatus: document.storageStatus,
        securityStatus: document.securityStatus,
        deletedAt: document.deletedAt ?? null,
        run: run ? { status: run.status, unitCount: run.unitCount } : null,
      };
    })
  );
  return {
    evidence: resolved.evidence,
    manifest: resolved.manifest,
    status: withPackagedDocumentCount(summarized, resolved.manifest.length),
  };
}

export async function buildConversationMatterDocumentEvidence(input: {
  userId: string;
  chatId: string;
}): Promise<{
  evidence: CustomerDocumentEvidence;
  manifest: CustomerDocumentManifest[];
}> {
  const { evidence, manifest } = await buildConversationDocumentContext(input);
  return { evidence, manifest };
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
