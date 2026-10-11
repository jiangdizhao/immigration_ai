import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Phase 12 Stage 1 R3 wiring guard.
 *
 * The interactive/read-only decision itself is tested as real logic in
 * `conversation-origin.test.ts` and rendered as real markup in
 * `legacy-conversation-notice.test.tsx`. These two checks only make sure the
 * workspace keeps *using* that contract, so the UI cannot silently drift back
 * to ad-hoc `status !== "ready"` gating or to a composer on the read-only
 * screen. They are deliberately narrow, not a substitute for the behaviour
 * tests above.
 */
const workspaceSource = readFileSync(
  new URL("../../components/immigration-ai-workspace.tsx", import.meta.url),
  "utf8"
);

test("the workspace derives read-only capability from the shared contract", () => {
  assert.match(
    workspaceSource,
    /resolveConversationInteraction\(\{[\s\S]{0,200}origin: conversationOrigin,/u
  );
  assert.match(
    workspaceSource,
    /normalizeConversationOrigin\(data\.origin\)/u,
    "the loaded conversation origin must come from the detail response"
  );
  assert.match(
    workspaceSource,
    /shouldApplyConversationDetail\(\{/u,
    "a delayed detail response must not be applied"
  );
  assert.match(
    workspaceSource,
    /shouldApplyOlderMessages\(\{/u,
    "a delayed older-message page must not be merged"
  );
  // Mutating handlers refuse archived chats even if a control is triggered.
  assert.match(
    workspaceSource,
    /conversationOriginRef\.current === "legacy_chat"/u
  );
});

test("the archived screen replaces the composer instead of disabling part of it", () => {
  const readOnlyBranch = workspaceSource.match(
    /\{isReadOnlyConversation \? \(([\s\S]*?)\) : \(\n\s*<div className="rounded-2xl bg-slate-100\/80/u
  );
  assert.ok(readOnlyBranch, "the composer must branch on the read-only flag");
  assert.match(readOnlyBranch[1], /LegacyConversationNotice/u);
  assert.doesNotMatch(readOnlyBranch[1], /<Textarea/u);
  assert.doesNotMatch(readOnlyBranch[1], /MatterDocumentsPanel/u);
  // The interactive composer still exists for normal conversations.
  assert.match(workspaceSource, /data-testid="workspace-input"/u);
  assert.match(workspaceSource, /data-testid="workspace-send"/u);
});
