import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MatterDocumentsPanel } from "@/components/matter-documents-panel";
import {
  conversationDocumentListUrl,
  conversationDocumentsAvailableForOrigin,
  fetchConversationDocumentList,
  isCurrentConversationDocumentRequest,
  visibleConversationDocuments,
} from "@/lib/matter-documents/workspace-panel";
import { getWorkspaceCopy } from "@/lib/workspace-copy";

/**
 * Phase 12 Stage 2 wiring guards.
 *
 * The behaviour is tested as real logic elsewhere (policy binding contract,
 * conversation HTTP contract, document status summary). These checks keep the
 * workspace *using* those contracts, because the compact layout and the durable
 * policy card are easy to regress silently in JSX.
 */
function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const workspace = readSource("../../components/immigration-ai-workspace.tsx");
const composerPanel = readSource("../../components/matter-documents-panel.tsx");
const historyPanel = readSource(
  "../../components/user-document-history-panel.tsx"
);
const modeToolbar = readSource(
  "../../components/premium-answer-mode-workspace.tsx"
);
const workspacePage = readSource("../../app/(chat)/ai-workspace/page.tsx");

test("the policy card is driven by the persisted binding, not by launch state", () => {
  assert.match(
    workspace,
    /policyWorkspaceReferenceFromBinding\(policyBinding\)/u,
    "the card reference must come from the persisted binding"
  );
  assert.match(
    workspace,
    /normalizePolicyBindingView\(data\.policyBinding\)/u,
    "the loaded conversation must supply the binding"
  );
  assert.match(
    workspace,
    /shouldApplyPolicyBinding\(\{/u,
    "a foreign or delayed binding must be rejected"
  );
  // The card is a topic reference and says so.
  assert.match(workspace, /data-policy-continuity="topic-reference-only"/u);
  assert.match(workspace, /copy\.policy\.snapshotNotice/u);
  // The transient launch props can no longer carry the card by themselves.
  assert.doesNotMatch(workspace, /linkedPolicyChatIdRef/u);
  assert.doesNotMatch(workspace, /linkedPolicyReference/u);
});

test("initialization is keyed by launch identity instead of running once", () => {
  assert.match(
    workspace,
    /const launchKey = policyLaunchKey\(\{/u,
    "the workspace must derive a launch identity"
  );
  assert.match(
    workspace,
    /appliedPolicyLaunchKeyRef\.current === launchKey/u,
    "a hot navigation to another policy must re-run initialization"
  );
  assert.doesNotMatch(
    workspace,
    /if \(initializationStartedRef\.current\) \{\s*return;/u,
    "the one-shot initialization guard must be gone"
  );
});

test("a failed or unavailable policy launch is explicit and recoverable", () => {
  assert.match(workspace, /data-policy-launch-state=/u);
  assert.match(workspace, /data-testid="policy-launch-retry"/u);
  assert.match(workspace, /data-testid="policy-launch-continue-without"/u);
  assert.match(workspace, /copy\.policy\.launchSchemaBody/u);
  assert.match(workspace, /copy\.policy\.sourceUnavailableBody/u);
  assert.match(
    workspacePage,
    /policyLaunchState: PolicyLaunchRequestState = "resolved"/u,
    "the server page must report the launch state"
  );
  assert.match(workspacePage, /policyLaunchState = "unavailable"/u);
  assert.match(workspacePage, /policyLaunch=\{policyLaunchRequested\}/u);
  assert.doesNotMatch(
    workspacePage,
    /if \(policy && isPolicyEntry && !policyReference\)/u,
    "an unresolvable policy must not silently redirect to a generic workspace"
  );
});

test("a policy launch is idempotent and never duplicates a blank conversation", () => {
  assert.match(workspace, /readOrCreatePolicyLaunchId\(/u);
  assert.match(workspace, /policyLaunchId: launchId/u);
  assert.match(workspace, /clearPolicyLaunchId\(/u);
  assert.match(
    workspace,
    /policyLaunchInFlightRef\.current === input\.launchKey/u
  );
  // The explicit new-conversation action never sends a policy request.
  assert.match(workspace, /startNewConversation/u);
});

test("the request-scoped policy topic comes from the persisted binding", () => {
  assert.match(
    workspace,
    /requestPolicySlugForConversation\(\{/u,
    "the slug sent to the answer route must belong to this conversation"
  );
  assert.match(
    workspace,
    /bindingChatId: policyBinding\?\.chatId \?\? null/u,
    "the slug sent to the answer route must belong to this conversation"
  );
  assert.match(
    workspace,
    /buildWidgetTurnRequestBody\(\{/u,
    "the turn body must be built by the shared request-construction helper"
  );
});

test("the composer is compact, auto-growing and keeps uploads adjacent", () => {
  assert.match(workspace, /data-testid="workspace-input"/u);
  assert.match(workspace, /data-testid="workspace-send"/u);
  assert.match(workspace, /rows=\{1\}/u);
  assert.match(workspace, /Math\.min\(element\.scrollHeight, 120\)/u);
  // The composer's upload control is the compact icon-only panel instance.
  const composerStart = workspace.indexOf(
    "Phase 12 Stage 2 interactive composer"
  );
  const composerEnd = workspace.indexOf('data-testid="workspace-send"');
  assert.ok(composerStart > 0 && composerEnd > composerStart);
  const composerBlock = workspace.slice(composerStart, composerEnd);
  assert.match(composerBlock, /<MatterDocumentsPanel/u);
  assert.match(composerBlock, /compact/u);
  assert.match(composerBlock, /onDocumentsChanged=\{notifyDocumentsChanged\}/u);
  // No attachment list may render inside the composer panel.
  assert.match(composerPanel, /visibleDocuments\.length && !compact \? \(/u);
  assert.match(workspace, /event\.nativeEvent\.isComposing/u);
});

test("the right context panel separates conversation files from account files", () => {
  assert.match(workspace, /data-testid="workspace-conversation-files"/u);
  assert.match(workspace, /data-testid="workspace-account-files"/u);
  assert.match(workspace, /data-testid="workspace-case-summary"/u);
  // The account-wide index refreshes itself when server document state changes.
  assert.match(workspace, /refreshToken=\{documentsRevision\}/u);
  assert.match(
    historyPanel,
    /lastRefreshTokenRef\.current === refreshToken/u,
    "the history panel must re-read on a refresh token change"
  );
  assert.match(historyPanel, /load\("reset"\)/u);
  // The account-wide list must not claim AI usability it cannot verify.
  assert.match(historyPanel, /labels\.extractionFinished/u);
});

test("narrow viewports get labelled panels instead of a forced side column", () => {
  assert.match(workspace, /data-testid="workspace-panel-tabs"/u);
  assert.match(workspace, /role="tablist"/u);
  assert.match(workspace, /aria-selected=\{activePanel === panelId\}/u);
  assert.match(workspace, /role="tab"/u);
  assert.match(
    workspace,
    /matchMedia\("\(min-width: 1280px\)"\)/u,
    "the layout must switch on a real viewport query"
  );
  for (const panelId of [
    "history",
    "conversationFiles",
    "accountFiles",
    "caseSummary",
  ]) {
    assert.match(
      workspace,
      new RegExp(`\\["${panelId}", copy\\.panels\\.`, "u")
    );
  }
  // The chat column stays the primary reading area on narrow viewports.
  assert.match(workspace, /h-\[min\(66dvh,620px\)\]/u);
});

test("upload, delete and reprocess tell the workspace to refresh", () => {
  assert.match(composerPanel, /onDocumentsChanged\?\.\(\)/u);
  const notifications =
    composerPanel.match(/onDocumentsChanged\?\.\(\)/gu) ?? [];
  assert.equal(
    notifications.length >= 3,
    true,
    "process, upload and delete must each notify"
  );
});

test("a guest account is told files need an account instead of an API error", () => {
  // The workspace knows the authenticated account type and gates both panels.
  assert.match(workspace, /userType = "regular"/u);
  assert.match(workspace, /const canUseDocuments = userType !== "guest"/u);
  assert.match(modeToolbar, /userType=\{hydratedAccessPolicy\.userType\}/u);
  assert.equal(
    (workspace.match(/accountAccess=\{canUseDocuments\}/gu) ?? []).length,
    3
  );
  // Both panels refuse to call the document API without account access.
  assert.match(composerPanel, /conversationDocumentListUrl\(/u);
  assert.match(composerPanel, /if \(!requestUrl\)/u);
  assert.match(composerPanel, /matter-documents-guest-hint/u);
  assert.match(historyPanel, /if \(!accountAccess\)/u);
  assert.match(historyPanel, /account-files-guest-hint/u);
  assert.match(historyPanel, /copy\.documents\.signInForFiles/u);
});

test("the mode toolbar stays compact and keeps its accessible control", () => {
  assert.match(modeToolbar, /data-testid="assistant-mode-select"/u);
  assert.match(modeToolbar, /htmlFor="assistant-mode-select"/u);
  assert.match(modeToolbar, /copy\.processingMode/u);
  // The permanent description block that consumed chat height is now a locked
  // single-row toolbar: the description is hidden below the large breakpoint.
  assert.match(
    modeToolbar,
    /hidden min-w-0 flex-1 truncate text-xs leading-5 text-slate-600 lg:block/u
  );
  assert.doesNotMatch(modeToolbar, /ChevronDown/u);
});

test("Project Chat document panels do not fetch, upload, or show raw 404 errors", async () => {
  const chatId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const available = conversationDocumentsAvailableForOrigin("project");
  assert.equal(available, false);
  assert.equal(
    conversationDocumentListUrl({
      chatId,
      accountAccess: true,
      conversationDocumentsAvailable: available,
    }),
    null
  );
  let fetchCount = 0;
  assert.equal(
    await fetchConversationDocumentList({
      requestUrl: conversationDocumentListUrl({
        chatId,
        accountAccess: true,
        conversationDocumentsAvailable: available,
      }),
      isCurrentRequest: () => true,
      fetcher: () => {
        fetchCount += 1;
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: "unexpected GET" }),
        });
      },
      errorFallback: "Document request failed",
    }),
    null
  );
  assert.equal(fetchCount, 0);

  for (const locale of ["zh-CN", "en"] as const) {
    for (const compact of [false, true]) {
      const copy = getWorkspaceCopy(locale);
      const markup = renderToStaticMarkup(
        React.createElement(MatterDocumentsPanel, {
          accountAccess: true,
          chatId,
          compact,
          conversationDocumentsAvailable: available,
          copy,
          disabled: true,
        })
      );
      assert.match(markup, /data-testid="project-documents-unavailable"/u);
      assert.match(
        markup,
        new RegExp(copy.documents.projectDocumentsUnavailable, "u")
      );
      assert.doesNotMatch(markup, /composer-upload|conversation-files-upload/u);
      assert.doesNotMatch(markup, /Document or conversation not found\./u);
      assert.doesNotMatch(markup, /role="alert"/u);
    }
  }

  const conversationPanels =
    workspace.match(/<MatterDocumentsPanel[\s\S]*?\/>/gu) ?? [];
  assert.equal(conversationPanels.length, 2);
  for (const panel of conversationPanels) {
    assert.match(
      panel,
      /conversationDocumentsAvailable=\{conversationDocumentsAvailableForOrigin\(\s*conversationOrigin\s*\)\}/u
    );
    assert.match(panel, /key=\{`conversation-documents:/u);
  }
  // Account-wide historical files remain a distinct panel and are not given a
  // Project Chat scope or mislabeled as Project documents.
  assert.match(
    workspace,
    /<UserDocumentHistoryPanel[\s\S]*?refreshToken=\{documentsRevision\}/u
  );
});

test("Standalone document access returns on Project-to-Standalone switch and stale state is rejected", () => {
  const chatId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const projectAvailable = conversationDocumentsAvailableForOrigin("project");
  const standaloneAvailable =
    conversationDocumentsAvailableForOrigin("immigration");
  const url = conversationDocumentListUrl({
    chatId,
    accountAccess: true,
    conversationDocumentsAvailable: standaloneAvailable,
  });
  assert.equal(
    url,
    `/api/matter-documents?chatId=${encodeURIComponent(chatId)}`
  );

  const priorStandaloneDocuments = [{ id: "standalone-document" }];
  assert.deepEqual(
    visibleConversationDocuments(priorStandaloneDocuments, projectAvailable),
    []
  );
  assert.deepEqual(
    visibleConversationDocuments(priorStandaloneDocuments, standaloneAvailable),
    priorStandaloneDocuments
  );
  assert.equal(isCurrentConversationDocumentRequest(4, 5), false);
  assert.equal(isCurrentConversationDocumentRequest(5, 5), true);

  const busyStandaloneConversation = true;
  const markup = renderToStaticMarkup(
    React.createElement(MatterDocumentsPanel, {
      accountAccess: true,
      chatId,
      copy: getWorkspaceCopy("en"),
      conversationDocumentsAvailable: standaloneAvailable,
      disabled: busyStandaloneConversation,
    })
  );
  assert.match(markup, /data-testid="conversation-files-upload"/u);
  assert.match(markup, /data-testid="conversation-files-upload"[^>]*disabled/u);
  assert.doesNotMatch(markup, /data-testid="project-documents-unavailable"/u);
});

test("a pending Standalone document response is discarded after switching to Project", async () => {
  let currentSequence = 8;
  type PendingResponse = {
    ok: boolean;
    json: () => Promise<{ documents?: { id: string }[]; error?: unknown }>;
  };
  const pendingFetch: {
    resolve?: (value: PendingResponse) => void;
  } = {};
  const fetcher = (_url: string, _init: { cache: "no-store" }) =>
    new Promise<PendingResponse>((resolve) => {
      pendingFetch.resolve = resolve;
    });
  const visibleDocuments: { id: string }[] = [];
  const pendingDocuments = fetchConversationDocumentList({
    requestUrl: conversationDocumentListUrl({
      chatId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      accountAccess: true,
      conversationDocumentsAvailable: true,
    }),
    isCurrentRequest: () =>
      isCurrentConversationDocumentRequest(8, currentSequence),
    fetcher,
    errorFallback: "Document request failed",
  });

  // Simulate the keyed panel's effect cleanup when Project Chat becomes active.
  currentSequence += 1;
  const resolveFetch = pendingFetch.resolve;
  assert.ok(resolveFetch);
  resolveFetch({
    ok: true,
    json: async () => ({ documents: [{ id: "stale-standalone-document" }] }),
  });
  const result = await pendingDocuments;
  if (result !== null) {
    visibleDocuments.splice(0, visibleDocuments.length, ...result);
  }
  assert.deepEqual(visibleDocuments, []);

  const pendingFailure: { reject?: (error: Error) => void } = {};
  const staleFailureSequence = currentSequence;
  const pendingError = fetchConversationDocumentList({
    requestUrl: "/api/matter-documents?chatId=standalone",
    isCurrentRequest: () =>
      isCurrentConversationDocumentRequest(
        staleFailureSequence,
        currentSequence
      ),
    fetcher: (_url, _init) =>
      new Promise<PendingResponse>((_resolve, reject) => {
        pendingFailure.reject = reject;
      }),
    errorFallback: "Document request failed",
  });
  currentSequence += 1;
  const rejectStaleFailure = pendingFailure.reject;
  assert.ok(rejectStaleFailure);
  rejectStaleFailure(new Error("Document or conversation not found."));
  assert.equal(await pendingError, null);

  await assert.rejects(
    fetchConversationDocumentList({
      requestUrl: "/api/matter-documents?chatId=denied",
      isCurrentRequest: () => true,
      fetcher: () =>
        Promise.resolve({
          ok: false,
          json: async () => ({ error: "Document or conversation not found." }),
        }),
      errorFallback: "Document request failed",
    }),
    /Document or conversation not found\./u
  );
});
