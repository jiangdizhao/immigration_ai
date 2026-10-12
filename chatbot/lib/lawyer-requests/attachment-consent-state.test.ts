/**
 * Phase 12 Stage 2 final correction — regression coverage for the two reviewed
 * attachment-consent defects.
 *
 * **Defect A**: a pending or failed eligible-document load must never permit
 * submission, and must never be read as the customer consenting to share zero
 * documents. Only a successful load produces a decision payload, and a zero
 * selection is still sent explicitly.
 *
 * **Defect B**: a server-reported existing request is its own state. It cannot
 * submit, and its displayed count comes from the persisted `documentSharing`
 * data — never from the client's current checkboxes, and never fabricated.
 *
 * These tests drive the real loader through an injected fetcher, so the
 * loading/retry/failure behaviour is exercised behaviourally.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  type AttachmentConsentFetcher,
  attachmentConsentStateFromResponse,
  attachmentDecisionPayload,
  canSubmitLawyerRequestWithAttachments,
  LAWYER_ATTACHMENT_DEFAULT_LIMIT,
  type LawyerAttachmentConsentState,
  loadAttachmentConsentState,
  sharedDocumentCountFromSharing,
} from "./attachment-consent-state";

type ScriptStep = {
  ok?: boolean;
  payload?: unknown;
  throw?: boolean;
  jsonThrows?: boolean;
};

const CHAT_ID = "11111111-1111-1111-1111-111111111111";
const MESSAGE_ID = "22222222-2222-2222-2222-222222222222";

function documentOption(documentId: string, usedByAnswer = false) {
  return {
    documentId,
    filename: `${documentId}.pdf`,
    runStatus: "complete",
    usedByAnswer,
  };
}

const selectablePayload = (documents: unknown[]) => ({
  questionPreview: "Summarise my documents",
  attachmentSelection: {
    status: "selectable",
    maxSelectable: 4,
    documents,
    acknowledgedCount: documents.length > 0 ? 1 : 0,
    unavailableCount: 0,
  },
});

/** A fetcher that answers with the given script, one entry per call. */
function scriptedFetcher(script: ScriptStep[]) {
  const calls: string[] = [];
  const fetcher: AttachmentConsentFetcher = (input) => {
    calls.push(input);
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    if (step?.throw) {
      return Promise.reject(new Error("network down"));
    }
    return Promise.resolve({
      ok: step?.ok ?? false,
      json: () =>
        step?.jsonThrows
          ? Promise.reject(new Error("invalid json"))
          : Promise.resolve(step?.payload ?? null),
    });
  };
  return { calls, fetcher };
}

test("a pending load cannot submit", () => {
  const state = { status: "loading" } as const;
  assert.equal(canSubmitLawyerRequestWithAttachments(state), false);
  assert.equal(attachmentDecisionPayload(state, []), null);
  assert.equal(attachmentDecisionPayload(state, ["doc-1"]), null);
  assert.equal(
    canSubmitLawyerRequestWithAttachments({ status: "idle" }),
    false
  );
});

test("a failed load blocks submission and is never zero-document consent", async () => {
  const { fetcher, calls } = scriptedFetcher([{ throw: true }]);
  const result = await loadAttachmentConsentState({
    chatId: CHAT_ID,
    assistantMessageId: MESSAGE_ID,
    fetcher,
  });
  assert.deepEqual(result.state, { status: "failed" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.includes(CHAT_ID), true);
  assert.equal(canSubmitLawyerRequestWithAttachments(result.state), false);
  // Neither an empty selection nor a real one may become a payload.
  assert.equal(attachmentDecisionPayload(result.state, []), null);
  assert.equal(attachmentDecisionPayload(result.state, ["doc-1"]), null);
});

test("error responses and malformed bodies fail closed", async () => {
  for (const step of [
    { ok: false },
    { ok: true, jsonThrows: true },
    { ok: true, payload: null },
    { ok: true, payload: {} },
    { ok: true, payload: { attachmentSelection: { status: "unknown" } } },
  ]) {
    const { fetcher } = scriptedFetcher([step]);
    const result = await loadAttachmentConsentState({
      chatId: CHAT_ID,
      assistantMessageId: MESSAGE_ID,
      fetcher,
    });
    assert.deepEqual(result.state, { status: "failed" });
    assert.equal(
      canSubmitLawyerRequestWithAttachments(result.state),
      false,
      JSON.stringify(step)
    );
    assert.equal(
      attachmentDecisionPayload(result.state, []),
      null,
      JSON.stringify(step)
    );
  }
  // Malformed entries inside an otherwise valid list are dropped, not trusted.
  const { fetcher } = scriptedFetcher([
    {
      ok: true,
      payload: selectablePayload([
        documentOption("doc-1", true),
        { filename: "no-id.pdf" },
        "not-an-object",
      ]),
    },
  ]);
  const result = await loadAttachmentConsentState({
    chatId: CHAT_ID,
    assistantMessageId: MESSAGE_ID,
    fetcher,
  });
  assert.equal(result.state.status, "ready");
  assert.deepEqual(
    result.state.status === "ready"
      ? result.state.documents.map((document) => document.documentId)
      : [],
    ["doc-1"]
  );
});

test("retry reloads the options and a successful retry permits submission", async () => {
  const { fetcher, calls } = scriptedFetcher([
    { throw: true },
    {
      ok: true,
      payload: selectablePayload([
        documentOption("doc-1", true),
        documentOption("doc-2"),
      ]),
    },
  ]);

  const first = await loadAttachmentConsentState({
    chatId: CHAT_ID,
    assistantMessageId: MESSAGE_ID,
    fetcher,
  });
  assert.deepEqual(first.state, { status: "failed" });
  assert.equal(canSubmitLawyerRequestWithAttachments(first.state), false);

  // Retry: the same loader is called again (as the retry control does).
  const retry = await loadAttachmentConsentState({
    chatId: CHAT_ID,
    assistantMessageId: MESSAGE_ID,
    fetcher,
  });
  assert.equal(calls.length, 2);
  assert.equal(retry.state.status, "ready");
  assert.equal(retry.questionPreview, "Summarise my documents");
  assert.equal(canSubmitLawyerRequestWithAttachments(retry.state), true);
  assert.deepEqual(
    retry.state.status === "ready"
      ? retry.state.documents.map((document) => [
          document.documentId,
          document.usedByAnswer,
        ])
      : [],
    [
      ["doc-1", true],
      ["doc-2", false],
    ]
  );
  assert.deepEqual(attachmentDecisionPayload(retry.state, ["doc-1"]), {
    consent: true,
    selectedDocumentIds: ["doc-1"],
  });
});

test("a successful load with zero eligible documents permits an explicit empty selection", async () => {
  const { fetcher } = scriptedFetcher([
    { ok: true, payload: selectablePayload([]) },
  ]);
  const result = await loadAttachmentConsentState({
    chatId: CHAT_ID,
    assistantMessageId: MESSAGE_ID,
    fetcher,
  });
  assert.equal(result.state.status, "ready");
  assert.equal(
    result.state.status === "ready" ? result.state.documents.length : -1,
    0
  );
  assert.equal(
    result.state.status === "ready" ? result.state.maxSelectable : -1,
    LAWYER_ATTACHMENT_DEFAULT_LIMIT
  );
  assert.equal(canSubmitLawyerRequestWithAttachments(result.state), true);
  // Submitting without attachments is an explicit decision, not an omission.
  assert.deepEqual(attachmentDecisionPayload(result.state, []), {
    consent: true,
    selectedDocumentIds: [],
  });
});

test("selection payloads stay explicit: no truncation, no duplicates, no junk", () => {
  const ready: LawyerAttachmentConsentState = {
    status: "ready",
    documents: [],
    maxSelectable: LAWYER_ATTACHMENT_DEFAULT_LIMIT,
    acknowledgedCount: 0,
    unavailableCount: 0,
  };
  assert.deepEqual(
    attachmentDecisionPayload(ready, ["doc-1", "doc-2", "doc-3", "doc-4"]),
    { consent: true, selectedDocumentIds: ["doc-1", "doc-2", "doc-3", "doc-4"] }
  );
  // Five selections are refused rather than sliced to four.
  assert.equal(
    attachmentDecisionPayload(ready, [
      "doc-1",
      "doc-2",
      "doc-3",
      "doc-4",
      "doc-5",
    ]),
    null
  );
  assert.equal(attachmentDecisionPayload(ready, ["doc-1", "doc-1"]), null);
  assert.equal(attachmentDecisionPayload(ready, [7, null]), null);
});

test("an existing request is its own state and cannot submit a new selection", async () => {
  const { fetcher } = scriptedFetcher([
    {
      ok: true,
      payload: {
        attachmentSelection: {
          status: "already_requested",
          maxSelectable: 4,
          documents: [],
          requestId: "request-9",
          documentSharing: {
            decision: "explicit_selection",
            selectedDocumentCount: 2,
          },
        },
      },
    },
  ]);
  const result = await loadAttachmentConsentState({
    chatId: CHAT_ID,
    assistantMessageId: MESSAGE_ID,
    fetcher,
  });
  assert.deepEqual(result.state, {
    status: "already_requested",
    sharedDocumentCount: 2,
    requestId: "request-9",
  });
  // No new submission — not even an empty one.
  assert.equal(canSubmitLawyerRequestWithAttachments(result.state), false);
  assert.equal(attachmentDecisionPayload(result.state, []), null);
  assert.equal(attachmentDecisionPayload(result.state, ["doc-1"]), null);

  // The top-level summary shape is accepted too (POST duplicate response).
  assert.deepEqual(
    attachmentConsentStateFromResponse({
      attachmentSelection: {
        status: "already_requested",
        documents: [],
        documentSharing: { selectedDocumentCount: 3 },
      },
    }),
    { status: "already_requested", sharedDocumentCount: 3, requestId: null }
  );
});

test("persisted counts are used as-is, and missing counts stay unknown", () => {
  assert.equal(sharedDocumentCountFromSharing({ selectedDocumentCount: 2 }), 2);
  // An explicit persisted zero is authoritative ...
  assert.equal(sharedDocumentCountFromSharing({ selectedDocumentCount: 0 }), 0);
  // ... but missing, legacy or malformed data is never turned into a number.
  assert.equal(sharedDocumentCountFromSharing(undefined), null);
  assert.equal(sharedDocumentCountFromSharing(null), null);
  assert.equal(sharedDocumentCountFromSharing({}), null);
  assert.equal(
    sharedDocumentCountFromSharing({
      decision: "unknown",
      selectedDocumentCount: null,
    }),
    null
  );
  assert.equal(
    sharedDocumentCountFromSharing({ selectedDocumentCount: "2" }),
    null
  );
  assert.equal(
    sharedDocumentCountFromSharing({ selectedDocumentCount: -1 }),
    null
  );
  assert.equal(sharedDocumentCountFromSharing([]), null);

  // An existing-request response without persisted data reports unknown.
  assert.deepEqual(
    attachmentConsentStateFromResponse({
      attachmentSelection: { status: "already_requested", documents: [] },
    }),
    { status: "already_requested", sharedDocumentCount: null, requestId: null }
  );
});

test("the API and the action keep existing requests idempotent and non-new", () => {
  const root = process.cwd();
  const route = readFileSync(
    join(root, "app", "api", "lawyer-requests", "route.ts"),
    "utf8"
  );
  // The GET marker carries the persisted request id and sharing summary, and the
  // pre-existing status/documents contract is unchanged.
  assert.match(route, /status: "already_requested"/u);
  assert.match(route, /requestId: existing\.id/u);
  assert.match(
    route,
    /documentSharing: customerLawyerRequestView\(existing\)\.documentSharing/u
  );
  assert.match(route, /maxSelectable: LAWYER_DOCUMENT_ATTACHMENT_LIMIT/u);
  assert.match(route, /documents: \[\]/u);
  // A repeat submission returns the stored request with an explicit marker.
  assert.match(
    route,
    /\.\.\.customerLawyerRequestSummary\(existing\),\s*\n\s*existingRequest: true/u
  );
  // The duplicate lookup still precedes any attachment work or insert.
  assert.equal(
    route.indexOf("getLawyerClarificationRequestByUserAndAssistantMessage") <
      route.indexOf("selectLawyerDocumentAttachments({"),
    true
  );
  assert.equal(
    route.indexOf("selectLawyerDocumentAttachments({") <
      route.indexOf("createLawyerRequestWithEvent({"),
    true
  );

  const action = readFileSync(
    join(root, "components", "lawyer-request-action.tsx"),
    "utf8"
  );
  // Submission is gated on a successful load, the decision payload is explicit,
  // and an existing request replaces the new-request interface.
  assert.match(
    action,
    /disabled=\{submitting \|\| !readyForSubmission \|\| overLimit\}/u
  );
  assert.match(action, /canSubmitLawyerRequestWithAttachments\(attachments\)/u);
  assert.match(
    action,
    /attachmentDecisionPayload\(\s*\n?\s*attachments,\s*\n?\s*selectedDocumentIds/u
  );
  assert.match(
    action,
    /existing: data\?\.existingRequest === true \|\| response\.status === 200/u
  );
  assert.match(action, /<LawyerAttachmentExistingNotice/u);
  assert.match(action, /<LawyerAttachmentLoadFailure/u);
  assert.match(
    action,
    /onRetry=\{\(\) => loadAttachmentOptions\(\)\.catch\(\(\) => undefined\)\}/u
  );
});
