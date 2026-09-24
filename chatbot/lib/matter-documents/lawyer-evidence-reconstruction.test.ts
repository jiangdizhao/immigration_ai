import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { reconstructExactLawyerDocumentEvidence } from "./lawyer-evidence-reconstruction";

const raw = `${"A".repeat(900)}NEVER QUOTE THIS`;
const locator = { kind: "page", pageNumber: 1 };
const clip = raw.slice(0, 200);
const manifest = {
  documentId: "doc-1",
  runId: "run-1",
  originalFilename: "file.pdf",
  mimeType: "application/pdf",
  runStatus: "complete" as const,
  extractionMethod: "native",
  truncated: false,
  includedUnitOrdinals: [1],
  locators: [locator],
  includedUnits: [
    {
      ordinal: 1,
      locator,
      extractionMethod: "native",
      includedTextChars: clip.length,
      textSha256: createHash("sha256").update(clip, "utf8").digest("hex"),
    },
  ],
};
const exact = {
  document: { id: "doc-1" },
  run: { id: "run-1" },
  units: [
    { ordinal: 1, locator, extractionMethod: "native", extractedText: raw },
  ],
};

test("lawyer quote never exceeds exact text supplied to AI", () => {
  const result = reconstructExactLawyerDocumentEvidence({
    manifest,
    exact,
    excerptBudget: 1200,
  });
  assert.ok(result);
  assert.equal(result.items[0].quote, clip);
  assert.equal(result.items[0].quote.length, 200);
  assert.equal(result.items[0].quote.includes("NEVER QUOTE THIS"), false);
});

test("digest, locator, unit/run mismatch, and legacy manifests fail closed", () => {
  assert.equal(
    reconstructExactLawyerDocumentEvidence({
      manifest: {
        ...manifest,
        includedUnits: [
          { ...manifest.includedUnits[0], textSha256: "0".repeat(64) },
        ],
      },
      exact,
      excerptBudget: 1000,
    }),
    null
  );
  assert.equal(
    reconstructExactLawyerDocumentEvidence({
      manifest: {
        ...manifest,
        includedUnits: [
          {
            ...manifest.includedUnits[0],
            locator: { kind: "page", pageNumber: 2 },
          },
        ],
      },
      exact,
      excerptBudget: 1000,
    }),
    null
  );
  assert.equal(
    reconstructExactLawyerDocumentEvidence({
      manifest,
      exact: { ...exact, run: { id: "run-new" } },
      excerptBudget: 1000,
    }),
    null
  );
  assert.equal(
    reconstructExactLawyerDocumentEvidence({
      manifest: { ...manifest, includedUnits: undefined },
      exact,
      excerptBudget: 1000,
    }),
    null
  );
  assert.equal(
    reconstructExactLawyerDocumentEvidence({
      manifest,
      exact: { ...exact, units: [{ ...exact.units[0], ordinal: 2 }] },
      excerptBudget: 1000,
    }),
    null
  );
});

test("all manifest units are validated after excerpt budget is exhausted", () => {
  const badSecond = {
    ...manifest,
    includedUnitOrdinals: [1, 2],
    locators: [locator, { kind: "page", pageNumber: 2 }],
    includedUnits: [
      manifest.includedUnits[0],
      {
        ...manifest.includedUnits[0],
        ordinal: 2,
        locator: { kind: "page", pageNumber: 2 },
        textSha256: "0".repeat(64),
      },
    ],
  };
  const twoUnits = {
    ...exact,
    units: [
      ...exact.units,
      {
        ...exact.units[0],
        ordinal: 2,
        locator: { kind: "page", pageNumber: 2 },
      },
    ],
  };
  assert.equal(
    reconstructExactLawyerDocumentEvidence({
      manifest: badSecond,
      exact: twoUnits,
      excerptBudget: 0,
    }),
    null
  );
});
