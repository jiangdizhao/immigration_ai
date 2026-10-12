/**
 * Phase 12 Stage 2 closure — explicit attachment consent, views and labels.
 *
 * Covers what the customer sees about their own decision, what the lawyer sees
 * about the shared documents (and never sees about withheld ones), that a
 * document which can no longer be shared is neither offered nor silently
 * dropped, and that all required copy exists in both locales.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { projectLawyerEvidence } from "@/lib/lawyer-workspace/projection";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import {
  buildCustomerDocumentSelectionEvidence,
  listEligibleLawyerDocumentAttachments,
  selectLawyerDocumentAttachments,
} from "./snapshot";
import { customerLawyerRequestView } from "./views";

function requestWithEvidence(evidenceSnapshot: unknown[]) {
  return {
    id: "request-1",
    chatId: "chat-1",
    legalMatterId: null,
    status: "pending",
    assistantMode: "default",
    questionSnapshot: "Summarise my documents",
    answerSnapshot: "Your grant notice shows a visa until 2027.",
    customerNote: null,
    lawyerResponse: null,
    correctedAnswer: null,
    assignedLawyerUserId: null,
    customerLastViewedAt: null,
    createdAt: new Date("2026-10-12T00:00:00.000Z"),
    updatedAt: new Date("2026-10-12T00:00:00.000Z"),
    reviewedAt: null,
    closedAt: null,
    evidenceSnapshot,
    contextSnapshot: [],
  };
}

const sharedDocument = (filename: string, usedByAnswer: boolean) => ({
  kind: "customer_document",
  document_id: `doc-${filename}`,
  run_id: "run-1",
  filename,
  run_status: "complete",
  quote: "excerpt",
  truncated: false,
  used_by_answer: usedByAnswer,
});

const selectionRecord = () =>
  buildCustomerDocumentSelectionEvidence({
    eligibleDocumentCount: 5,
    acknowledgedCount: 2,
    selectedCount: 2,
    acknowledgedSharedCount: 1,
    acknowledgedWithheldCount: 1,
  });

test("the customer sees exactly which own documents were shared", () => {
  const view = customerLawyerRequestView(
    requestWithEvidence([
      sharedDocument("visa-grant.pdf", true),
      sharedDocument("bank-statement.pdf", false),
      selectionRecord(),
    ]) as never
  );
  assert.deepEqual(view.sharedDocuments, [
    { filename: "visa-grant.pdf", usedByAnswer: true },
    { filename: "bank-statement.pdf", usedByAnswer: false },
  ]);
  assert.deepEqual(view.documentSharing, {
    decision: "explicit_selection",
    eligibleDocumentCount: 5,
    acknowledgedDocumentCount: 2,
    selectedDocumentCount: 2,
    acknowledgedSharedCount: 1,
    acknowledgedWithheldCount: 1,
  });
});

test("a legacy request without a selection record reports an unknown decision", () => {
  const view = customerLawyerRequestView(
    requestWithEvidence([sharedDocument("old.pdf", true)]) as never
  );
  assert.deepEqual(view.sharedDocuments, [
    { filename: "old.pdf", usedByAnswer: true },
  ]);
  assert.equal(view.documentSharing.decision, "unknown");
  assert.equal(view.documentSharing.selectedDocumentCount, null);
});

test("the lawyer projection keeps selection counts and never withheld names", () => {
  const projection = projectLawyerEvidence([
    { kind: "customer_document_selection" },
    sharedDocument("visa-grant.pdf", true),
    sharedDocument("bank-statement.pdf", false),
    selectionRecord(),
    { kind: "something_else" },
  ]);
  assert.deepEqual(
    projection.customerDocuments.map((item) => [
      item.filename,
      item.usedByAnswer,
    ]),
    [
      ["visa-grant.pdf", true],
      ["bank-statement.pdf", false],
    ]
  );
  assert.deepEqual(projection.documentSharing, {
    decision: "explicit_selection",
    eligibleDocumentCount: 5,
    acknowledgedDocumentCount: 2,
    selectedDocumentCount: 2,
    acknowledgedSharedCount: 1,
    acknowledgedWithheldCount: 1,
  });
  assert.equal(projection.unsupportedCount, 1);
  assert.equal(JSON.stringify(projection).includes("Client_Passport"), false);
});

test("attachment consent copy exists in both locales", () => {
  const zh = getWorkspaceCopy("zh-CN").lawyerRequest;
  const en = getWorkspaceCopy("en").lawyerRequest;
  for (const key of [
    "attachmentsTitle",
    "attachmentsIntro",
    "attachmentsNone",
    "attachmentsLoading",
    "attachmentsLoadError",
    "attachmentsUnavailable",
    "attachmentsSelectedPrefix",
    "attachmentsAcknowledged",
    "attachmentsNotAcknowledged",
    "attachmentsWithheldWarning",
    "attachmentsLimitError",
    "attachmentsNoSelection",
    "questionPreview",
  ] as const) {
    assert.equal(typeof zh[key], "string", `zh ${key}`);
    assert.equal(typeof en[key], "string", `en ${key}`);
    assert.ok(zh[key].trim().length > 0, `zh ${key}`);
    assert.ok(en[key].trim().length > 0, `en ${key}`);
  }
  // Nothing is shared by default in either language.
  assert.match(zh.attachmentsIntro, /默认不共享/u);
  assert.match(en.attachmentsIntro, /shared by default/u);
  assert.match(zh.details, /勾选/u);
  assert.match(en.details, /choose to share/u);
});

test("a document that is no longer shareable is never offered, and stays valid to select", () => {
  const manifest = [
    {
      documentId: "doc-gone",
      runId: "run-gone",
      originalFilename: "deleted.pdf",
      includedUnitOrdinals: [1],
    },
  ];
  const eligibility = listEligibleLawyerDocumentAttachments({
    manifest,
    acknowledgedDocumentIds: ["doc-gone"],
    details: new Map([
      [
        "doc-gone",
        { filename: "deleted.pdf", runStatus: null, available: false },
      ],
    ]),
  });
  // Not offered to the customer ...
  assert.deepEqual(eligibility.documents, []);
  assert.equal(eligibility.unavailableCount, 1);
  // ... and the exact selection is still validated against the manifest. The
  // route turns an unavailable document into an explicit error (never a silent
  // drop); see the wiring assertions below.
  const stale = selectLawyerDocumentAttachments({
    manifest,
    acknowledgedDocumentIds: ["doc-gone"],
    selectedDocumentIds: ["doc-gone"],
  });
  assert.ok("attachments" in stale);
  assert.equal(stale.attachments.length, 1);
});

test("the lawyer views label acknowledged, customer-selected and withheld documents", () => {
  const detail = readFileSync(
    join(
      process.cwd(),
      "components",
      "lawyer-workspace",
      "detail-evidence.tsx"
    ),
    "utf8"
  );
  const portal = readFileSync(
    join(process.cwd(), "components", "lawyer-portal-detail.tsx"),
    "utf8"
  );
  for (const source of [detail, portal]) {
    assert.match(source, /acknowledged using this document/u);
    assert.match(source, /Selected by the customer/u);
  }
  // Withheld documents are represented by counts only — no filenames, no quotes.
  assert.match(detail, /withheld by customer choice/u);
  assert.match(detail, /acknowledgedWithheldCount/u);
  assert.doesNotMatch(detail, /withheld\w*\.filename/u);
});

test("the route never trusts client filenames and rejects unavailable selections", () => {
  const route = readFileSync(
    join(process.cwd(), "app", "api", "lawyer-requests", "route.ts"),
    "utf8"
  );
  // Filenames come from the owner's own rows.
  assert.match(route, /filename: exact\.document\.originalFilename/u);
  // Deleted / unstored / non-clean documents are rejected with a clear error.
  assert.match(
    route,
    /if \(availability\.get\(attachment\.documentId\)\?\.available === false\)/u
  );
  assert.match(route, /is no longer available\. Uncheck it and try again\./u);
  assert.match(
    route,
    /is no longer available for an exact lawyer snapshot\. Uncheck it and try again\./u
  );
  assert.match(
    route,
    /cannot be reconstructed exactly for a lawyer snapshot\. Uncheck it and try again\./u
  );
  // Only owner-scoped, retained documents are read.
  assert.match(route, /storageStatus === "stored"/u);
  assert.match(route, /securityStatus === "clean"/u);
  assert.match(route, /!matterDocument\.deletedAt/u);
});
