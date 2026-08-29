import assert from "node:assert/strict";
import test from "node:test";
import { persistedAssistantMessageIdForReview } from "./message-identity";

test("each multi-turn answer uses its own persisted assistant message ID", () => {
  const messages = [
    {
      id: "u1-client",
      role: "user" as const,
      persistedAssistantMessageId: null,
    },
    {
      id: "a1-client",
      role: "assistant" as const,
      persistedAssistantMessageId: "a1-persisted",
    },
    {
      id: "u2-client",
      role: "user" as const,
      persistedAssistantMessageId: null,
    },
    {
      id: "a2-client",
      role: "assistant" as const,
      persistedAssistantMessageId: "a2-persisted",
    },
    {
      id: "u3-client",
      role: "user" as const,
      persistedAssistantMessageId: null,
    },
    {
      id: "a3-client",
      role: "assistant" as const,
      persistedAssistantMessageId: "a3-persisted",
    },
  ];

  assert.deepEqual(messages.map(persistedAssistantMessageIdForReview), [
    null,
    "a1-persisted",
    null,
    "a2-persisted",
    null,
    "a3-persisted",
  ]);
  assert.notEqual(
    persistedAssistantMessageIdForReview(messages[3]),
    messages[3].id
  );
});

test("an assistant without a persisted ID is not reviewable", () => {
  assert.equal(
    persistedAssistantMessageIdForReview({
      role: "assistant",
      persistedAssistantMessageId: null,
    }),
    null
  );
});
