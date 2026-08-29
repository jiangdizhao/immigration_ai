import assert from "node:assert/strict";
import test from "node:test";
import { validateLawyerRequestTarget } from "./target-validation";

const chat = { id: "chat-a", userId: "user-a" };
const assistant = { id: "answer-a", chatId: "chat-a", role: "assistant" };

function validate(
  overrides: Partial<Parameters<typeof validateLawyerRequestTarget>[0]> = {}
) {
  return validateLawyerRequestTarget({
    authenticatedUserId: "user-a",
    chat,
    requestedChatId: "chat-a",
    requestedAssistantMessageId: "answer-a",
    selectedMessage: assistant,
    ...overrides,
  });
}

test("accepts only the authenticated user's persisted assistant message", () => {
  assert.equal(validate(), null);
});

test("rejects a chat owned by another user", () => {
  assert.equal(
    validate({
      authenticatedUserId: "user-b",
    }),
    "conversation_not_owned"
  );
});

test("rejects a nonexistent message", () => {
  assert.equal(
    validate({ selectedMessage: null }),
    "message_not_in_conversation"
  );
});

test("rejects a message from another chat", () => {
  assert.equal(
    validate({
      selectedMessage: { ...assistant, chatId: "chat-b" },
    }),
    "message_not_in_conversation"
  );
});

test("rejects a user message even when its ID is supplied", () => {
  assert.equal(
    validate({
      selectedMessage: { ...assistant, role: "user" },
    }),
    "not_assistant"
  );
});

test("rejects mismatched requested message IDs", () => {
  assert.equal(
    validate({
      requestedAssistantMessageId: "answer-other",
    }),
    "message_not_in_conversation"
  );
});
