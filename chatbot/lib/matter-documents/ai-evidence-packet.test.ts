import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertMatterDocumentEvidenceReady,
  assertSelectedMatterDocumentAccess,
  buildBoundedMatterDocumentEvidence,
  SelectedMatterDocumentError,
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

test("empty selection creates an empty evidence packet", () => {
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

test("unit, document, packet, and selected-document count bounds never exceed ceilings", () => {
  const huge = (index: number) =>
    fixture(index, {
      units: Array.from({ length: 12 }, (_, n) => ({
        ordinal: n + 1,
        locator: { kind: "page", pageNumber: n + 1 },
        extractedText: "x".repeat(5000),
        extractionMethod: "native",
      })),
    });
  const result = buildBoundedMatterDocumentEvidence({
    documents: [1, 2, 3, 4].map(huge),
  });
  const docs = result.evidence.documents;
  const units = docs.flatMap((doc) => doc.units);
  assert.ok(docs.length <= 4);
  assert.ok(units.length <= 24);
  assert.ok(units.every((unit) => unit.text.length <= 4000));
  assert.ok(
    docs.every(
      (doc) => doc.units.reduce((n, unit) => n + unit.text.length, 0) <= 8000
    )
  );
  assert.ok(units.reduce((n, unit) => n + unit.text.length, 0) <= 24_000);
  assert.ok(docs.every((doc) => doc.truncated));
});

test("a selected document with no usable units fails closed", () => {
  assert.throws(
    () =>
      buildBoundedMatterDocumentEvidence({
        documents: [fixture(1, { units: [] })],
      }),
    SelectedMatterDocumentError
  );
});

test("server authorization rejects foreign, cross-chat, deleted, or unstored documents", () => {
  const allowed = {
    userId: "owner-a",
    chatId: "chat-a",
    storageStatus: "stored",
    deletedAt: null,
  };
  assert.doesNotThrow(() =>
    assertSelectedMatterDocumentAccess(allowed, {
      userId: "owner-a",
      chatId: "chat-a",
    })
  );
  for (const document of [
    null,
    { ...allowed, userId: "owner-b" },
    { ...allowed, chatId: "chat-b" },
    { ...allowed, deletedAt: new Date() },
    { ...allowed, storageStatus: "pending" },
  ]) {
    assert.throws(
      () =>
        assertSelectedMatterDocumentAccess(document, {
          userId: "owner-a",
          chatId: "chat-a",
        }),
      (error) =>
        error instanceof SelectedMatterDocumentError &&
        error.kind === "not_found"
    );
  }
});

test("only terminal runs with evidence units are eligible for AI", () => {
  for (const status of ["not_started", "processing", "failed"]) {
    assert.throws(
      () => assertMatterDocumentEvidenceReady({ status }, 1),
      (error) =>
        error instanceof SelectedMatterDocumentError &&
        error.kind === "not_ready"
    );
  }
  for (const status of ["complete", "partial", "needs_review"] as const) {
    assert.doesNotThrow(() => assertMatterDocumentEvidenceReady({ status }, 1));
  }
  assert.throws(
    () => assertMatterDocumentEvidenceReady({ status: "needs_review" }, 0),
    (error) =>
      error instanceof SelectedMatterDocumentError && error.kind === "not_ready"
  );
});
