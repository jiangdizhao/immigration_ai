import assert from "node:assert/strict";
import test from "node:test";
import {
  type ConversationDocumentStatusRecord,
  conversationDocumentsUnavailableToAi,
  EMPTY_CONVERSATION_DOCUMENT_STATUS,
  summarizeConversationDocumentStatus,
  withPackagedDocumentCount,
} from "./conversation-document-status";

function record(
  overrides: Partial<ConversationDocumentStatusRecord> = {}
): ConversationDocumentStatusRecord {
  return {
    originalFilename: "evidence.pdf",
    processingStatus: "complete",
    storageStatus: "stored",
    securityStatus: "clean",
    deletedAt: null,
    run: { status: "complete", unitCount: 4 },
    ...overrides,
  };
}

test("stored files are classified by whether usable text exists", () => {
  const summary = summarizeConversationDocumentStatus([
    record({ originalFilename: "usable.pdf" }),
    record({
      originalFilename: "partial.docx",
      run: { status: "partial", unitCount: 2 },
    }),
    record({
      originalFilename: "empty.pdf",
      run: { status: "complete", unitCount: 0 },
    }),
    record({
      originalFilename: "scan.pdf",
      run: { status: "failed", unitCount: 0 },
    }),
    record({
      originalFilename: "slow.pdf",
      run: { status: "processing", unitCount: 0 },
    }),
    record({ originalFilename: "waiting.pdf", run: null }),
  ]);

  assert.equal(summary.total, 6);
  assert.equal(summary.usable, 2);
  assert.equal(summary.usableTruncated, 1);
  assert.equal(summary.noUsableContent, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.processing, 1);
  // Only documents with no readable text are named as affected.
  assert.deepEqual(summary.unusableFilenames, ["empty.pdf", "waiting.pdf"]);
  assert.equal(conversationDocumentsUnavailableToAi(summary), false);
});

test("a conversation whose files produced nothing usable is flagged", () => {
  const summary = summarizeConversationDocumentStatus([
    record({
      originalFilename: "scan-one.pdf",
      run: { status: "complete", unitCount: 0 },
    }),
    record({
      originalFilename: "scan-two.png",
      run: { status: "needs_review", unitCount: 0 },
    }),
  ]);
  assert.equal(summary.usable, 0);
  assert.equal(summary.noUsableContent, 2);
  assert.equal(conversationDocumentsUnavailableToAi(summary), true);
  assert.equal(EMPTY_CONVERSATION_DOCUMENT_STATUS.total, 0);
});

test("deleted and not-yet-stored files never count as usable evidence", () => {
  const summary = summarizeConversationDocumentStatus([
    record({ originalFilename: "deleted.pdf", deletedAt: new Date() }),
    record({
      originalFilename: "pending.pdf",
      storageStatus: "uploading",
      run: null,
    }),
    record({
      originalFilename: "quarantined.pdf",
      securityStatus: "pending",
      run: { status: "complete", unitCount: 9 },
    }),
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.usable, 0);
  assert.equal(summary.processing, 2);
  assert.equal(conversationDocumentsUnavailableToAi(summary), true);
});

test("filenames in the summary are bounded, deduplicated and sanitized", () => {
  const longName = `very-long-${"x".repeat(200)}.pdf`;
  const summary = summarizeConversationDocumentStatus([
    record({ originalFilename: "a.pdf", run: null }),
    record({ originalFilename: "a.pdf", run: null }),
    record({ originalFilename: "b.pdf", run: null }),
    record({ originalFilename: "c.pdf", run: null }),
    record({ originalFilename: "d.pdf", run: null }),
    record({ originalFilename: `bad\u0007name\n${longName}`, run: null }),
  ]);
  assert.equal(summary.total, 6);
  assert.equal(summary.unusableFilenames.length, 3);
  assert.deepEqual(summary.unusableFilenames.slice(0, 2), ["a.pdf", "b.pdf"]);
  for (const name of summary.unusableFilenames) {
    assert.equal(name.length <= 120, true);
    assert.equal(
      [...name].some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code < 32 || code === 127;
      }),
      false
    );
  }
});

test("a conversation with no files is never reported as unavailable", () => {
  const summary = summarizeConversationDocumentStatus([]);
  assert.deepEqual(summary, EMPTY_CONVERSATION_DOCUMENT_STATUS);
  assert.equal(conversationDocumentsUnavailableToAi(summary), false);
});

test("R1: a long-lived conversation keeps counting past the old 64-file bound", () => {
  const records = Array.from({ length: 80 }, (_, index) =>
    record({ originalFilename: `file-${index}.pdf` })
  );
  const summary = summarizeConversationDocumentStatus(records);
  assert.equal(summary.total, 80);
  assert.equal(summary.usable, 80);
  // Nothing was packaged for this turn yet, and the summary says so.
  assert.equal(summary.packaged, 0);
});

test("R1: more than 64 files still reports the unusable ones honestly", () => {
  const records = [
    ...Array.from({ length: 70 }, (_, index) =>
      record({ originalFilename: `usable-${index}.pdf` })
    ),
    record({
      originalFilename: "scan-a.png",
      run: { status: "complete", unitCount: 0 },
    }),
    record({
      originalFilename: "scan-b.png",
      run: { status: "failed", unitCount: 0 },
    }),
  ];
  const summary = summarizeConversationDocumentStatus(records);
  assert.equal(summary.total, 72);
  assert.equal(summary.usable, 70);
  assert.equal(summary.noUsableContent, 1);
  assert.equal(summary.failed, 1);
  assert.deepEqual(summary.unusableFilenames, ["scan-a.png"]);
  assert.equal(conversationDocumentsUnavailableToAi(summary), false);
});

test("R1: packaged never exceeds usable and defaults to zero", () => {
  const summary = summarizeConversationDocumentStatus([
    record({ originalFilename: "a.pdf" }),
    record({ originalFilename: "b.pdf" }),
  ]);
  assert.equal(summary.packaged, 0);
  const packaged = withPackagedDocumentCount(summary, 8);
  // 8 requested, but only two files produced usable text.
  assert.equal(packaged.packaged, 2);
  assert.equal(withPackagedDocumentCount(summary, -3).packaged, 0);
  assert.equal(withPackagedDocumentCount(summary, 0).packaged, 0);
});

test("R1: packaged counts the bounded subset, not the whole conversation", () => {
  const records = Array.from({ length: 65 }, (_, index) =>
    record({ originalFilename: `file-${index}.pdf` })
  );
  const summary = withPackagedDocumentCount(
    summarizeConversationDocumentStatus(records),
    8
  );
  assert.equal(summary.total, 65);
  assert.equal(summary.usable, 65);
  assert.equal(summary.packaged, 8);
  // 57 readable files remain stored but were not supplied this turn.
  assert.equal(summary.usable - summary.packaged, 57);
});
