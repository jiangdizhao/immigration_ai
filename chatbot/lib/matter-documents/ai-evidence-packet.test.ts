import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBoundedMatterDocumentEvidence,
  MAX_CONVERSATION_DOCUMENTS,
  MAX_EVIDENCE_UNITS_PER_DOCUMENT,
  MAX_EVIDENCE_UNITS_TOTAL,
  MAX_TEXT_CHARS_PER_DOCUMENT_IN_AI_PACKET,
  MAX_TEXT_CHARS_PER_UNIT_IN_AI_PACKET,
  MAX_TEXT_CHARS_TOTAL_IN_AI_PACKET,
  resolveConversationMatterDocumentEvidence,
} from "./ai-evidence-packet";

function fixture(index = 1, overrides: Record<string, unknown> = {}) {
  return {
    document: {
      id: `doc-${index}`,
      originalFilename: `file-${index}.pdf`,
      mimeType: "application/pdf",
    },
    run: {
      id: `run-${index}`,
      status: "complete" as const,
      extractionMethod: "native",
      truncated: false,
    },
    units: [
      {
        ordinal: 2,
        locator: { kind: "page", pageNumber: 2 },
        extractedText: "second unit",
        extractionMethod: "native",
      },
      {
        ordinal: 1,
        locator: { kind: "page", pageNumber: 1 },
        extractedText: "first unit",
        extractionMethod: "native",
      },
    ],
    ...overrides,
  };
}

test("empty conversation creates an empty evidence packet", () => {
  assert.deepEqual(buildBoundedMatterDocumentEvidence({ documents: [] }), {
    evidence: { documents: [] },
    manifest: [],
  });
});

test("packet sorts evidence ordinals and manifest exactly matches sent units and locators", () => {
  const result = buildBoundedMatterDocumentEvidence({ documents: [fixture()] });
  assert.deepEqual(result.evidence.documents[0].includedUnitOrdinals, [1, 2]);
  assert.deepEqual(result.manifest[0].includedUnitOrdinals, [1, 2]);
  assert.deepEqual(
    result.manifest[0].locators,
    result.evidence.documents[0].units.map((unit) => unit.locator)
  );
  assert.equal("storageKey" in result.manifest[0], false);
});

test("partial and needs-review runs remain marked incomplete", () => {
  for (const status of ["partial", "needs_review"] as const) {
    const result = buildBoundedMatterDocumentEvidence({
      documents: [
        fixture(1, {
          run: {
            id: "run",
            status,
            extractionMethod: "mixed",
            truncated: false,
          },
        }),
      ],
    });
    assert.equal(result.manifest[0].truncated, true);
    assert.equal(result.manifest[0].runStatus, status);
  }
});

test("unit, document, packet, and conversation-document bounds are enforced", () => {
  const huge = (index: number) =>
    fixture(index, {
      units: Array.from({ length: 16 }, (_, n) => ({
        ordinal: n + 1,
        locator: { kind: "page", pageNumber: n + 1 },
        extractedText: "x".repeat(6000),
        extractionMethod: "native",
      })),
    });
  const result = buildBoundedMatterDocumentEvidence({
    documents: Array.from({ length: 12 }, (_, n) => huge(n + 1)),
  });
  const docs = result.evidence.documents;
  const units = docs.flatMap((doc) => doc.units);
  assert.ok(docs.length <= MAX_CONVERSATION_DOCUMENTS);
  assert.ok(units.length <= MAX_EVIDENCE_UNITS_TOTAL);
  assert.ok(
    units.every(
      (unit) => unit.text.length <= MAX_TEXT_CHARS_PER_UNIT_IN_AI_PACKET
    )
  );
  assert.ok(
    docs.every(
      (doc) =>
        doc.units.reduce((n, unit) => n + unit.text.length, 0) <=
        MAX_TEXT_CHARS_PER_DOCUMENT_IN_AI_PACKET
    )
  );
  assert.ok(
    units.reduce((n, unit) => n + unit.text.length, 0) <=
      MAX_TEXT_CHARS_TOTAL_IN_AI_PACKET
  );
  assert.ok(docs.every((doc) => doc.truncated));
});

function conversationDocument(
  id: string,
  day: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    userId: "owner-a",
    chatId: "chat-a",
    storageStatus: "stored",
    securityStatus: "clean",
    deletedAt: null,
    createdAt: new Date(
      `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`
    ),
    originalFilename: `${id}.pdf`,
    mimeType: "application/pdf",
    ...overrides,
  };
}

const oneEvidenceUnit = (documentId: string) => [
  {
    ordinal: 1,
    locator: { kind: "page", pageNumber: 1 },
    extractedText: `evidence for ${documentId}`,
    extractionMethod: "native",
  },
];

test("conversation evidence is resolved without selected document IDs", async () => {
  const result = await resolveConversationMatterDocumentEvidence({
    userId: "owner-a",
    chatId: "chat-a",
    documents: [conversationDocument("doc-01", 1)],
    getLatestAttempt: async (documentId) => ({
      id: `run-${documentId}`,
      status: "complete",
      extractionMethod: "native",
      truncated: false,
    }),
    getEvidence: async (documentId) => oneEvidenceUnit(documentId),
  });
  assert.equal(result.evidence.documents[0].originalFilename, "doc-01.pdf");
  assert.equal(result.manifest[0].runId, "run-doc-01");
});

test("unready and inaccessible documents are skipped without blocking ready evidence", async () => {
  const docs = [
    conversationDocument("doc-01", 9),
    conversationDocument("doc-02", 8),
    conversationDocument("doc-03", 7),
    conversationDocument("doc-04", 6),
    conversationDocument("doc-05", 5, { deletedAt: new Date() }),
    conversationDocument("doc-06", 4, { chatId: "chat-other" }),
    conversationDocument("doc-07", 3, { userId: "owner-other" }),
    conversationDocument("doc-08", 2, { securityStatus: "pending" }),
    conversationDocument("doc-09", 1, { storageStatus: "uploading" }),
  ];
  const statuses: Record<string, string> = {
    "doc-01": "complete",
    "doc-02": "processing",
    "doc-03": "failed",
    "doc-04": "not_started",
  };
  const result = await resolveConversationMatterDocumentEvidence({
    userId: "owner-a",
    chatId: "chat-a",
    documents: docs,
    getLatestAttempt: async (documentId) => ({
      id: `run-${documentId}`,
      status: statuses[documentId] ?? "complete",
      extractionMethod: "native",
      truncated: false,
    }),
    getEvidence: async (documentId) =>
      documentId === "doc-04" ? [] : oneEvidenceUnit(documentId),
  });
  assert.deepEqual(
    result.evidence.documents.map((document) => document.documentId),
    ["doc-01"]
  );
});

test("newest usable documents are deterministic and capped at eight", async () => {
  const documents = Array.from({ length: 10 }, (_, index) =>
    conversationDocument(`doc-${String(index + 1).padStart(2, "0")}`, index + 1)
  ).reverse();
  const result = await resolveConversationMatterDocumentEvidence({
    userId: "owner-a",
    chatId: "chat-a",
    documents,
    getLatestAttempt: async (documentId) => ({
      id: `run-${documentId}`,
      status: "complete",
      extractionMethod: "native",
      truncated: false,
    }),
    getEvidence: async (documentId) => oneEvidenceUnit(documentId),
  });
  assert.equal(result.evidence.documents.length, 8);
  assert.deepEqual(
    result.evidence.documents.map((document) => document.documentId),
    [
      "doc-10",
      "doc-09",
      "doc-08",
      "doc-07",
      "doc-06",
      "doc-05",
      "doc-04",
      "doc-03",
    ]
  );
});

test("conversation documents persist across turns and do not cross conversations", async () => {
  const documents = [
    conversationDocument("doc-01", 1, { chatId: "chat-a" }),
    conversationDocument("doc-02", 2, { chatId: "chat-b" }),
  ];
  const resolve = (chatId: string) =>
    resolveConversationMatterDocumentEvidence({
      userId: "owner-a",
      chatId,
      documents,
      getLatestAttempt: async (documentId) => ({
        id: `run-${documentId}`,
        status: "complete",
        extractionMethod: "native",
        truncated: false,
      }),
      getEvidence: async (documentId) => oneEvidenceUnit(documentId),
    });
  const firstTurn = await resolve("chat-a");
  const secondTurn = await resolve("chat-a");
  const switchedConversation = await resolve("chat-b");
  assert.deepEqual(firstTurn.evidence, secondTurn.evidence);
  assert.deepEqual(
    switchedConversation.evidence.documents.map(
      (document) => document.documentId
    ),
    ["doc-02"]
  );
});

test("one document can retain sixteen evidence units", () => {
  const result = buildBoundedMatterDocumentEvidence({
    documents: [
      fixture(1, {
        units: Array.from({ length: 16 }, (_, index) => ({
          ordinal: index + 1,
          locator: { kind: "page", pageNumber: index + 1 },
          extractedText: "x".repeat(400),
          extractionMethod: "native",
        })),
      }),
    ],
  });
  assert.equal(
    result.evidence.documents[0].units.length,
    MAX_EVIDENCE_UNITS_PER_DOCUMENT
  );
  assert.equal(result.manifest[0].includedUnits.length, 16);
});

test("manifest records exact clipped characters and SHA-256 of supplied text", async () => {
  const { createHash } = await import("node:crypto");
  const result = buildBoundedMatterDocumentEvidence({
    documents: [
      fixture(1, {
        units: [
          {
            ordinal: 1,
            locator: { kind: "page", pageNumber: 1 },
            extractedText: "a".repeat(7000),
            extractionMethod: "native",
          },
          {
            ordinal: 2,
            locator: { kind: "page", pageNumber: 2 },
            extractedText: "b".repeat(7000),
            extractionMethod: "native",
          },
        ],
      }),
    ],
  });
  const supplied = result.evidence.documents[0].units;
  const included = result.manifest[0].includedUnits;
  assert.equal(supplied[0].text.length, MAX_TEXT_CHARS_PER_UNIT_IN_AI_PACKET);
  assert.equal(supplied[1].text.length, MAX_TEXT_CHARS_PER_UNIT_IN_AI_PACKET);
  assert.deepEqual(
    included.map((unit) => unit.includedTextChars),
    supplied.map((unit) => unit.text.length)
  );
  assert.deepEqual(
    included.map((unit) => unit.textSha256),
    supplied.map((unit) =>
      createHash("sha256").update(unit.text, "utf8").digest("hex")
    )
  );
  assert.equal("text" in included[0], false);
});
