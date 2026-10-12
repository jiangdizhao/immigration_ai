/**
 * Phase 12 Stage 2 closure — explicit lawyer attachment consent.
 *
 * The reviewer required: nothing shared by default, per-document customer
 * choice, no silent truncation, no forged/cross-conversation/stale selections,
 * server reconstruction of the selected documents only, legacy-answer
 * compatibility and an explicit over-limit error. These tests cover the pure
 * server contract; the route wiring is asserted at the bottom.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { reconstructExactLawyerDocumentEvidence } from "@/lib/matter-documents/lawyer-evidence-reconstruction";
import {
  buildCustomerDocumentSelectionEvidence,
  LAWYER_DOCUMENT_ATTACHMENT_LIMIT,
  LAWYER_DOCUMENT_SELECTION_VERSION,
  listEligibleLawyerDocumentAttachments,
  selectLawyerDocumentAttachments,
} from "./snapshot";

function entry(documentId: string, ordinals: number[] = [1]) {
  return {
    documentId,
    runId: `run-${documentId}`,
    originalFilename: `${documentId}.pdf`,
    runStatus: "complete",
    includedUnitOrdinals: ordinals,
    includedUnits: ordinals.map((ordinal) => ({ ordinal })),
    locators: ordinals.map((ordinal) => ({ page: ordinal })),
    truncated: false,
  };
}

const fivePackaged = [
  entry("doc-1"),
  entry("doc-2"),
  entry("doc-3"),
  entry("doc-4"),
  entry("doc-5"),
];

test("nothing is selected by default: an empty selection shares nothing", () => {
  const selection = selectLawyerDocumentAttachments({
    manifest: fivePackaged,
    acknowledgedDocumentIds: ["doc-3"],
    selectedDocumentIds: [],
  });
  assert.ok("attachments" in selection);
  assert.deepEqual(selection.attachments, []);
  assert.equal(selection.selectedCount, 0);
  assert.equal(selection.acknowledgedSharedCount, 0);
  // The acknowledged document is withheld by customer choice.
  assert.equal(selection.acknowledgedWithheldCount, 1);
});

test("an absent selection field shares nothing", () => {
  const selection = selectLawyerDocumentAttachments({
    manifest: fivePackaged,
    acknowledgedDocumentIds: ["doc-3"],
  });
  assert.ok("attachments" in selection);
  assert.deepEqual(selection.attachments, []);
  assert.equal(selection.acknowledgedWithheldCount, 1);
});

test("one selected document out of five eligible documents", () => {
  const selection = selectLawyerDocumentAttachments({
    manifest: fivePackaged,
    acknowledgedDocumentIds: ["doc-4"],
    selectedDocumentIds: ["doc-4"],
  });
  assert.ok("attachments" in selection);
  assert.deepEqual(
    selection.attachments.map((item) => [item.documentId, item.usedByAnswer]),
    [["doc-4", true]]
  );
  assert.equal(selection.acknowledgedSharedCount, 1);
  assert.equal(selection.acknowledgedWithheldCount, 0);
});

test("the acknowledged subset is never added automatically", () => {
  const selection = selectLawyerDocumentAttachments({
    manifest: fivePackaged,
    acknowledgedDocumentIds: ["doc-3", "doc-5"],
    selectedDocumentIds: ["doc-1"],
  });
  assert.ok("attachments" in selection);
  assert.deepEqual(
    selection.attachments.map((item) => item.documentId),
    ["doc-1"]
  );
  assert.equal(selection.acknowledgedSharedCount, 0);
  assert.equal(selection.acknowledgedWithheldCount, 2);
});

test("four selected documents are accepted in full", () => {
  const selection = selectLawyerDocumentAttachments({
    manifest: fivePackaged,
    acknowledgedDocumentIds: ["doc-1"],
    selectedDocumentIds: ["doc-1", "doc-2", "doc-4", "doc-5"],
  });
  assert.ok("attachments" in selection);
  assert.equal(selection.attachments.length, 4);
  assert.equal(selection.selectedCount, 4);
  assert.equal(selection.acknowledgedSharedCount, 1);
  assert.equal(selection.acknowledgedWithheldCount, 0);
});

test("five selected documents are an explicit error, never a truncation", () => {
  const selection = selectLawyerDocumentAttachments({
    manifest: fivePackaged,
    acknowledgedDocumentIds: ["doc-3"],
    selectedDocumentIds: ["doc-1", "doc-2", "doc-3", "doc-4", "doc-5"],
  });
  assert.ok("error" in selection);
  assert.match(selection.error, /at most 4 documents/u);
  assert.equal(LAWYER_DOCUMENT_ATTACHMENT_LIMIT, 4);
});

test("forged, cross-conversation and malformed ids are rejected", () => {
  const forged = selectLawyerDocumentAttachments({
    manifest: fivePackaged,
    acknowledgedDocumentIds: ["doc-3"],
    selectedDocumentIds: ["other-conversation-doc"],
  });
  assert.ok("error" in forged);
  assert.match(forged.error, /no longer available/u);

  const mixed = selectLawyerDocumentAttachments({
    manifest: fivePackaged,
    acknowledgedDocumentIds: ["doc-3"],
    selectedDocumentIds: ["doc-1", "doc-99"],
  });
  assert.ok("error" in mixed);

  const duplicates = selectLawyerDocumentAttachments({
    manifest: fivePackaged,
    acknowledgedDocumentIds: [],
    selectedDocumentIds: ["doc-1", "doc-1"],
  });
  assert.ok("error" in duplicates);

  const nonString = selectLawyerDocumentAttachments({
    manifest: fivePackaged,
    acknowledgedDocumentIds: [],
    selectedDocumentIds: [7],
  });
  assert.ok("error" in nonString);

  // A selection against a missing/invalid manifest cannot share anything ...
  const noManifest = selectLawyerDocumentAttachments({
    manifest: undefined,
    acknowledgedDocumentIds: [],
    selectedDocumentIds: ["doc-1"],
  });
  assert.ok("error" in noManifest);
  // ... but an empty selection stays valid.
  const empty = selectLawyerDocumentAttachments({
    manifest: undefined,
    acknowledgedDocumentIds: [],
    selectedDocumentIds: [],
  });
  assert.ok("attachments" in empty);
  assert.deepEqual(empty.attachments, []);
});

test("an acknowledged id missing from the manifest fails closed", () => {
  const selection = selectLawyerDocumentAttachments({
    manifest: [entry("doc-1")],
    acknowledgedDocumentIds: ["doc-9"],
    selectedDocumentIds: ["doc-1"],
  });
  assert.ok("error" in selection);
});

test("legacy answers keep their stored meaning but still need explicit consent", () => {
  const eligibility = listEligibleLawyerDocumentAttachments({
    manifest: [entry("doc-1")],
  });
  assert.deepEqual(
    eligibility.documents.map((document) => [
      document.documentId,
      document.usedByAnswer,
    ]),
    [["doc-1", true]]
  );
  const notSelected = selectLawyerDocumentAttachments({
    manifest: [entry("doc-1")],
    acknowledgedDocumentIds: undefined,
    selectedDocumentIds: [],
  });
  assert.ok("attachments" in notSelected);
  assert.deepEqual(notSelected.attachments, []);
  const selected = selectLawyerDocumentAttachments({
    manifest: [entry("doc-1")],
    acknowledgedDocumentIds: undefined,
    selectedDocumentIds: ["doc-1"],
  });
  assert.ok("attachments" in selected);
  assert.equal(selected.attachments.length, 1);
});

test("eligibility lists server-known documents and hides retained-status failures", () => {
  const eligibility = listEligibleLawyerDocumentAttachments({
    manifest: fivePackaged,
    acknowledgedDocumentIds: ["doc-2"],
    details: new Map([
      [
        "doc-1",
        {
          filename: "current-name.pdf",
          runStatus: "partial",
          available: true,
        },
      ],
      [
        "doc-2",
        { filename: "grant.pdf", runStatus: "complete", available: true },
      ],
      [
        "doc-3",
        {
          filename: "deleted.pdf",
          runStatus: "complete",
          available: false,
        },
      ],
    ]),
  });
  assert.deepEqual(eligibility.documents, [
    {
      documentId: "doc-1",
      filename: "current-name.pdf",
      runStatus: "partial",
      usedByAnswer: false,
    },
    {
      documentId: "doc-2",
      filename: "grant.pdf",
      runStatus: "complete",
      usedByAnswer: true,
    },
    // doc-4/doc-5 have no DB detail: the persisted manifest name is reported.
    {
      documentId: "doc-4",
      filename: "doc-4.pdf",
      runStatus: "complete",
      usedByAnswer: false,
    },
    {
      documentId: "doc-5",
      filename: "doc-5.pdf",
      runStatus: "complete",
      usedByAnswer: false,
    },
  ]);
  assert.equal(eligibility.acknowledgedCount, 1);
  assert.equal(eligibility.acknowledgedWithheldCount, 0);
  assert.equal(eligibility.unavailableCount, 1);
});

test("the selection record is bounded, versioned and filename-free", () => {
  const record = buildCustomerDocumentSelectionEvidence({
    eligibleDocumentCount: 5,
    acknowledgedCount: 2,
    selectedCount: 4,
    acknowledgedSharedCount: 1,
    acknowledgedWithheldCount: 1,
  });
  assert.equal(record.kind, "customer_document_selection");
  assert.equal(record.selection_version, LAWYER_DOCUMENT_SELECTION_VERSION);
  assert.equal(record.selection_mode, "explicit_selection");
  assert.equal(record.eligible_document_count, 5);
  assert.equal(record.acknowledged_document_count, 2);
  assert.equal(record.selected_document_count, 4);
  assert.equal(record.acknowledged_shared_count, 1);
  assert.equal(record.acknowledged_withheld_count, 1);
  assert.equal(record.max_selectable, LAWYER_DOCUMENT_ATTACHMENT_LIMIT);
  assert.equal(JSON.stringify(record).includes("filename"), false);
  assert.equal(JSON.stringify(record).includes("quote"), false);

  assert.equal(
    buildCustomerDocumentSelectionEvidence({
      eligibleDocumentCount: 5,
      acknowledgedCount: 1,
      selectedCount: 0,
      acknowledgedSharedCount: 0,
      acknowledgedWithheldCount: 1,
    }).selection_mode,
    "no_selection"
  );
  assert.equal(
    buildCustomerDocumentSelectionEvidence({
      eligibleDocumentCount: 0,
      acknowledgedCount: 0,
      selectedCount: 0,
      acknowledgedSharedCount: 0,
      acknowledgedWithheldCount: 0,
    }).selection_mode,
    "no_documents"
  );
});

test("lawyer reconstruction runs over the selected documents only", () => {
  const clip = "A".repeat(200);
  const raw = `${clip}NEVER QUOTE THIS`;
  const locator = { kind: "page", pageNumber: 1 };
  const selectedEntry = {
    ...entry("doc-ack"),
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
  const selection = selectLawyerDocumentAttachments({
    manifest: [entry("doc-other"), selectedEntry],
    acknowledgedDocumentIds: ["doc-ack"],
    selectedDocumentIds: ["doc-ack"],
  });
  assert.ok("attachments" in selection);
  assert.deepEqual(
    selection.attachments.map((item) => [item.documentId, item.usedByAnswer]),
    [["doc-ack", true]]
  );

  const reconstructed = reconstructExactLawyerDocumentEvidence({
    manifest: selection.attachments[0].manifestEntry,
    exact: {
      document: { id: "doc-ack", securityStatus: "clean" },
      run: { id: "run-doc-ack" },
      units: [
        { ordinal: 1, locator, extractionMethod: "native", extractedText: raw },
      ],
    },
    excerptBudget: 1200,
  });
  assert.ok(reconstructed);
  assert.equal(reconstructed.items[0].quote, clip);
  assert.equal(
    reconstructed.items[0].quote.includes("NEVER QUOTE THIS"),
    false
  );
});

test("the request route requires an explicit, bounded consent decision", () => {
  const route = readFileSync(
    join(process.cwd(), "app", "api", "lawyer-requests", "route.ts"),
    "utf8"
  );
  // The decision is explicit and bounded at the schema level.
  assert.match(route, /consent: z\.literal\(true\)/u);
  assert.match(
    route,
    /selectedDocumentIds: z\s*\n\s*\.array\(z\.string\(\)\.trim\(\)\.min\(1\)\.max\(64\)\)\s*\n\s*\.max\(LAWYER_DOCUMENT_ATTACHMENT_LIMIT\)/u
  );
  // Selection is validated against the server-persisted manifest of this turn.
  assert.match(
    route,
    /selectLawyerDocumentAttachments\(\{\s*\n\s*manifest,\s*\n\s*acknowledgedDocumentIds/u
  );
  assert.match(
    route,
    /selectedDocumentIds: attachments\?\.selectedDocumentIds/u
  );
  // No silent truncation anywhere in the route.
  assert.doesNotMatch(route, /\.slice\(0,\s*4\)/u);
  assert.doesNotMatch(route, /manifest\.length > 4/u);
  // The customer's decision is persisted as a bounded, filename-free record.
  assert.match(route, /buildCustomerDocumentSelectionEvidence\(\{/u);
  assert.match(
    route,
    /snapshot\.evidenceSnapshot\.push\(\s*\n\s*buildCustomerDocumentSelectionEvidence/u
  );
  // Exact reconstruction and the excerpt budget are preserved.
  assert.match(route, /reconstructExactLawyerDocumentEvidence\(\{/u);
  assert.match(route, /let excerptBudget = 12_000;/u);
  assert.match(route, /getMatterDocumentEvidenceForLawyerSnapshot\(\{/u);
  // Eligibility for the UI is server-derived, never client-supplied.
  assert.match(route, /listEligibleLawyerDocumentAttachments\(\{/u);
  assert.match(route, /documentAvailabilityForTurn\(\{/u);
  assert.match(
    route,
    /listMatterDocumentRecordsForOwner\(\{ userId, chatId \}\)/u
  );
});

test("idempotent retries cannot change an existing request's selection", () => {
  const route = readFileSync(
    join(process.cwd(), "app", "api", "lawyer-requests", "route.ts"),
    "utf8"
  );
  const duplicateIndex = route.indexOf(
    "getLawyerClarificationRequestByUserAndAssistantMessage"
  );
  const selectionIndex = route.indexOf("selectLawyerDocumentAttachments({");
  const insertIndex = route.indexOf("createLawyerRequestWithEvent({");
  assert.equal(duplicateIndex > 0, true);
  assert.equal(selectionIndex > 0, true);
  assert.equal(insertIndex > 0, true);
  // An existing request short-circuits before any attachment work or insert, so
  // a retry with a different selection returns the stored request unchanged.
  assert.equal(duplicateIndex < selectionIndex, true);
  assert.equal(selectionIndex < insertIndex, true);
  assert.match(
    route,
    /return Response\.json\(customerLawyerRequestSummary\(existing\)\)/u
  );
});
