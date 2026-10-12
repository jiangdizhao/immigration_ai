/**
 * Phase 12 Stage 2 — deterministic availability of a conversation's uploaded
 * customer files.
 *
 * Upload success, processing completion and *usable extracted evidence* are
 * different outcomes. The model must be able to distinguish "there is usable
 * text from this file" from "the file is stored but nothing readable was
 * extracted", otherwise it can imply it read a document it never received.
 *
 * This module is pure: callers pass the authorized conversation-scoped records
 * they already resolved, and the summary is a bounded, non-evidentiary packet
 * that is deliberately kept outside `customer_document_evidence`.
 */
import { matterDocumentDisplayStatus } from "./display-status";

export const MAX_UNAVAILABLE_FILENAMES = 3;
export const MAX_SUMMARY_FILENAME_CHARS = 120;

export type ConversationDocumentStatusRecord = {
  originalFilename: string;
  processingStatus: string;
  storageStatus: string;
  securityStatus: string;
  deletedAt: Date | null;
  run: { status: string | null; unitCount: number } | null;
};

export type ConversationDocumentStatusSummary = {
  total: number;
  usable: number;
  usableTruncated: number;
  noUsableContent: number;
  processing: number;
  failed: number;
  /**
   * Phase 12 Stage 2 R1 — usable files whose text was actually packaged for the
   * current model turn. `usable - packaged` files are stored and readable but
   * were *not* supplied, which the model must be told so it cannot imply it read
   * them. A long-lived conversation may legitimately have far more usable files
   * than one turn can carry.
   */
  packaged: number;
  unusableFilenames: string[];
};

export const EMPTY_CONVERSATION_DOCUMENT_STATUS: ConversationDocumentStatusSummary =
  {
    total: 0,
    usable: 0,
    usableTruncated: 0,
    noUsableContent: 0,
    processing: 0,
    failed: 0,
    packaged: 0,
    unusableFilenames: [],
  };

/**
 * Filenames are customer-provided text. Keep them bounded and free of control
 * characters so they cannot smuggle prompt or terminal control into the answer
 * prompt or the UI; they are still rendered as data, never as instructions.
 */
function boundedFilename(value: string): string {
  const withoutControlCharacters = Array.from(value)
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127 ? " " : character;
    })
    .join("");
  return withoutControlCharacters
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_SUMMARY_FILENAME_CHARS);
}

/**
 * Classifies one stored document into exactly one availability bucket. A
 * document that is not fully stored (still uploading, cleanup pending) or that
 * failed security review never counts as usable evidence.
 */
export function summarizeConversationDocumentStatus(
  records: readonly ConversationDocumentStatusRecord[]
): ConversationDocumentStatusSummary {
  const summary: ConversationDocumentStatusSummary = {
    ...EMPTY_CONVERSATION_DOCUMENT_STATUS,
    unusableFilenames: [],
  };
  for (const record of records) {
    if (record.deletedAt !== null) {
      continue;
    }
    if (
      record.storageStatus !== "stored" ||
      record.securityStatus !== "clean"
    ) {
      summary.total += 1;
      summary.processing += 1;
      continue;
    }
    summary.total += 1;
    const status = matterDocumentDisplayStatus({
      processingStatus: record.processingStatus,
      runStatus: record.run?.status ?? null,
      unitCount: record.run?.unitCount ?? null,
    });
    if (status === "available_to_ai") {
      summary.usable += 1;
      continue;
    }
    if (status === "incomplete") {
      summary.usable += 1;
      summary.usableTruncated += 1;
      continue;
    }
    if (status === "failed") {
      summary.failed += 1;
      continue;
    }
    if (status === "processing") {
      summary.processing += 1;
      continue;
    }
    // `not_started` and `no_usable_evidence` both mean "no readable text from
    // this file yet", which is what the answer must not paper over.
    summary.noUsableContent += 1;
    const filename = boundedFilename(record.originalFilename);
    if (
      filename &&
      summary.unusableFilenames.length < MAX_UNAVAILABLE_FILENAMES &&
      !summary.unusableFilenames.includes(filename)
    ) {
      summary.unusableFilenames.push(filename);
    }
  }
  return summary;
}

/**
 * Records how many usable files were actually packaged for the current turn.
 *
 * The packaged count can never exceed the usable count: a file whose extraction
 * produced nothing usable was never supplied, so reporting it as packaged would
 * be a false claim about the model's input.
 */
export function withPackagedDocumentCount(
  summary: ConversationDocumentStatusSummary,
  packaged: number
): ConversationDocumentStatusSummary {
  const bounded = Number.isFinite(packaged) ? Math.floor(packaged) : 0;
  return {
    ...summary,
    packaged: Math.max(0, Math.min(bounded, summary.usable)),
  };
}

/**
 * True when the conversation has uploaded files but none of them produced
 * usable extracted text, i.e. the assistant must not behave as if it can read
 * the customer's files.
 */
export function conversationDocumentsUnavailableToAi(
  summary: ConversationDocumentStatusSummary
): boolean {
  return summary.total > 0 && summary.usable === 0;
}
