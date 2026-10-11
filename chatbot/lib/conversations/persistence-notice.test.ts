import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveWorkspacePersistence } from "./persistence-notice";

/**
 * Phase 12 Stage 1 R1: the browser must never show "saved" unless the server
 * confirmed a complete, linked durable turn.
 */

test("a saved turn clears the notice and stops offering a retry", () => {
  const state = resolveWorkspacePersistence({
    userTurnPersisted: true,
    assistantTurnPersisted: true,
    saved: true,
    retryable: false,
  });
  assert.equal(state.saved, true);
  assert.equal(state.noticeKind, "none");
  assert.equal(state.retryable, false);
});

test("an assistant record without a verified link is never saved", () => {
  const state = resolveWorkspacePersistence({
    userTurnPersisted: false,
    assistantTurnPersisted: true,
    assistantMessageId: "assistant-1",
    saved: false,
    errorCode: "user_turn_link_missing",
  });
  assert.equal(state.saved, false);
  assert.equal(state.noticeKind, "not_saved");
  assert.equal(state.retryable, true);
});

test("a stored answer with a failed user write stays explicitly not saved", () => {
  const state = resolveWorkspacePersistence({
    userTurnPersisted: true,
    assistantTurnPersisted: false,
    saved: false,
    errorCode: "assistant_turn_ledger_write_failed",
  });
  assert.equal(state.saved, false);
  assert.equal(state.noticeKind, "not_saved");
  assert.equal(state.retryable, true);
});

test("an in-progress duplicate is communicated and retryable", () => {
  const state = resolveWorkspacePersistence({
    userTurnPersisted: true,
    assistantTurnPersisted: false,
    saved: false,
    errorCode: "client_turn_in_progress",
    retryAfterMs: 1500,
  });
  assert.equal(state.saved, false);
  assert.equal(state.noticeKind, "in_progress");
  assert.equal(state.retryable, true);
  assert.equal(state.retryAfterMs, 1500);
});

test("a message that could not be persisted is communicated and retryable", () => {
  const state = resolveWorkspacePersistence({
    userTurnPersisted: false,
    assistantTurnPersisted: false,
    saved: false,
    errorCode: "conversation_turn_not_persisted",
  });
  assert.equal(state.noticeKind, "not_persisted");
  assert.equal(state.retryable, true);
});

test("an unscoped or guest turn makes no durability claim at all", () => {
  const state = resolveWorkspacePersistence(null);
  assert.equal(state.saved, false);
  assert.equal(state.noticeKind, "none");
  assert.equal(state.retryable, false);
});

test("partial or missing persistence fields default to not saved", () => {
  // A server that reports only the assistant row cannot be trusted as saved.
  const partial = resolveWorkspacePersistence({
    userTurnPersisted: true,
    assistantTurnPersisted: true,
  });
  assert.equal(partial.saved, false);
  assert.equal(partial.noticeKind, "not_saved");

  const unknown = resolveWorkspacePersistence(undefined);
  assert.equal(unknown.saved, false);
  assert.equal(unknown.noticeKind, "none");
});
