import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
    /policyBinding\?\.chatId === stableConversationId/u,
    "the slug sent to the answer route must belong to this conversation"
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
  assert.match(composerPanel, /documents\.length && !compact \? \(/u);
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
  assert.match(composerPanel, /if \(!\(chatId && accountAccess\)\)/u);
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
