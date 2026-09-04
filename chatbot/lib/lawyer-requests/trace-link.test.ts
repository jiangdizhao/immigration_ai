import assert from "node:assert/strict";
import test from "node:test";
import { buildImmigrationAnswerTraceLinkValues } from "./trace-link";

test("Premium and Default use exact persisted message-to-trace link values", () => {
  assert.deepEqual(
    buildImmigrationAnswerTraceLinkValues({
      chatId: "chat-1",
      assistantMessageId: "message-1",
      legalMatterId: "matter-1",
      answerTraceId: "trace-1",
    }),
    {
      chatId: "chat-1",
      assistantMessageId: "message-1",
      legalMatterId: "matter-1",
      answerTraceId: "trace-1",
    }
  );
});

test("no trace link is built without both persisted message and exact trace", () => {
  const base = {
    chatId: "chat-1",
    assistantMessageId: "message-1",
    legalMatterId: "matter-1",
    answerTraceId: "trace-1",
  };
  assert.equal(
    buildImmigrationAnswerTraceLinkValues({
      ...base,
      assistantMessageId: null,
    }),
    null
  );
  assert.equal(
    buildImmigrationAnswerTraceLinkValues({ ...base, answerTraceId: null }),
    null
  );
});
