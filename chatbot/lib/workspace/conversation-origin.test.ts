import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeConversationOrigin,
  resolveConversationInteraction,
  shouldApplyConversationDetail,
  shouldApplyOlderMessages,
} from "./conversation-origin";

test("unknown or missing origins are treated as normal conversations", () => {
  assert.equal(normalizeConversationOrigin("immigration"), "immigration");
  assert.equal(normalizeConversationOrigin("legacy_chat"), "legacy_chat");
  assert.equal(normalizeConversationOrigin(undefined), "immigration");
  assert.equal(normalizeConversationOrigin(null), "immigration");
  assert.equal(normalizeConversationOrigin("LEGACY_CHAT"), "immigration");
  assert.equal(normalizeConversationOrigin({}), "immigration");
});

test("a loaded archived conversation is read-only and refuses every mutation", () => {
  const interaction = resolveConversationInteraction({
    origin: "legacy_chat",
    conversationReady: true,
  });

  assert.equal(interaction.readOnly, true);
  assert.equal(interaction.canSubmitMessage, false);
  assert.equal(interaction.canUseSuggestedQuestions, false);
  assert.equal(interaction.canUseGuidedIntake, false);
  assert.equal(interaction.canUploadDocuments, false);
  assert.equal(interaction.canRequestLawyerReview, false);
  // Reading retained history never depends on the origin.
  assert.equal(interaction.canBrowseHistory, true);
  assert.equal(interaction.canLoadOlderMessages, true);
  // Creating an explicit new conversation stays available.
  assert.equal(interaction.canStartNewConversation, true);
});

test("a normal conversation keeps every interactive capability", () => {
  const interaction = resolveConversationInteraction({
    origin: "immigration",
    conversationReady: true,
  });

  assert.equal(interaction.readOnly, false);
  assert.equal(interaction.canSubmitMessage, true);
  assert.equal(interaction.canUseSuggestedQuestions, true);
  assert.equal(interaction.canUseGuidedIntake, true);
  assert.equal(interaction.canUploadDocuments, true);
  assert.equal(interaction.canRequestLawyerReview, true);
  assert.equal(interaction.canStartNewConversation, true);
  assert.equal(interaction.canLoadOlderMessages, true);
});

test("read-only never applies before the archived conversation is loaded", () => {
  // While another conversation is still loading, the workspace must not claim
  // read-only (nothing is applied yet) but must also refuse to submit.
  const loading = resolveConversationInteraction({
    origin: "legacy_chat",
    conversationReady: false,
    conversationLoading: true,
  });

  assert.equal(loading.readOnly, false);
  assert.equal(loading.canSubmitMessage, false);
  assert.equal(loading.canUploadDocuments, false);
  assert.equal(loading.canUseGuidedIntake, false);
});

test("a running turn blocks submission but not history browsing", () => {
  const busy = resolveConversationInteraction({
    origin: "immigration",
    conversationReady: true,
    turnInFlight: true,
  });

  assert.equal(busy.canSubmitMessage, false);
  assert.equal(busy.canUseSuggestedQuestions, false);
  assert.equal(busy.canLoadOlderMessages, true);
});

test("switching conversations is blocked while another switch is in flight", () => {
  const switching = resolveConversationInteraction({
    origin: "immigration",
    conversationReady: true,
    conversationLoading: true,
  });

  assert.equal(switching.canSubmitMessage, false);
  assert.equal(switching.canUploadDocuments, false);
  assert.equal(switching.canRequestLawyerReview, false);
  assert.equal(switching.canStartNewConversation, false);
});

test("only the newest detail response for the requested chat may be applied", () => {
  assert.equal(
    shouldApplyConversationDetail({
      requestSeq: 3,
      latestRequestSeq: 3,
      requestedChatId: "chat-b",
      loadedChatId: "chat-b",
    }),
    true
  );
  // A delayed response for a conversation the user already switched away from.
  assert.equal(
    shouldApplyConversationDetail({
      requestSeq: 2,
      latestRequestSeq: 3,
      requestedChatId: "chat-a",
      loadedChatId: "chat-a",
    }),
    false
  );
  // A response that answers a different chat than the one it was asked for.
  assert.equal(
    shouldApplyConversationDetail({
      requestSeq: 3,
      latestRequestSeq: 3,
      requestedChatId: "chat-b",
      loadedChatId: "chat-a",
    }),
    false
  );
});

test("older-message pages may only merge into the conversation on screen", () => {
  assert.equal(
    shouldApplyOlderMessages({
      loadedChatId: "chat-a",
      activeChatId: "chat-a",
    }),
    true
  );
  assert.equal(
    shouldApplyOlderMessages({
      loadedChatId: "chat-a",
      activeChatId: "chat-b",
    }),
    false
  );
  assert.equal(
    shouldApplyOlderMessages({ loadedChatId: "chat-a", activeChatId: null }),
    false
  );
});

test("rapid legacy -> normal -> legacy switching always restores the right mode", () => {
  const legacy = resolveConversationInteraction({
    origin: normalizeConversationOrigin("legacy_chat"),
    conversationReady: true,
  });
  const normal = resolveConversationInteraction({
    origin: normalizeConversationOrigin("immigration"),
    conversationReady: true,
  });
  const backToLegacy = resolveConversationInteraction({
    origin: normalizeConversationOrigin("legacy_chat"),
    conversationReady: true,
  });

  assert.equal(legacy.readOnly, true);
  assert.equal(normal.readOnly, false);
  assert.equal(normal.canSubmitMessage, true);
  assert.equal(backToLegacy.readOnly, true);
  assert.equal(backToLegacy.canSubmitMessage, false);
});
