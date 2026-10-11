// biome-ignore-all lint/suspicious/useAwait: repository doubles intentionally return plain values from fake async methods.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConversationTurnInputError,
  ConversationTurnOwnershipError,
  type ConversationTurnRecord,
  type ConversationTurnRepository,
  createConversationTurnService,
  type PersistedMessageRecord,
} from "./turn-ledger";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const CHAT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TURN_A = "turn-aaaaaaaa-0001";
const NOW = new Date("2026-10-11T00:00:00.000Z");

type Harness = {
  repository: ConversationTurnRepository;
  turns: Map<string, ConversationTurnRecord>;
  messages: Map<string, PersistedMessageRecord>;
  events: string[];
  outage: boolean;
  failNextMessageInsert: boolean;
  failPendingPayload: boolean;
};

function messageKey(chatId: string, messageId: string) {
  return `${chatId}:${messageId}`;
}

function turnKey(chatId: string, clientTurnId: string) {
  return `${chatId}:${clientTurnId}`;
}

function makeHarness(): Harness {
  const conversations = new Map([
    [CHAT_A, USER_A],
    [CHAT_B, USER_B],
  ]);
  const turns = new Map<string, ConversationTurnRecord>();
  const messages = new Map<string, PersistedMessageRecord>();
  const events: string[] = [];
  const harness: Harness = {
    outage: false,
    failNextMessageInsert: false,
    failPendingPayload: false,
    turns,
    messages,
    events,
    repository: {
      async getOwnedConversation({ chatId, userId }) {
        if (harness.outage) {
          throw new Error("database_unavailable");
        }
        return conversations.get(chatId) === userId
          ? { chatId, legalMatterId: null }
          : null;
      },
      async getTurn({ chatId, clientTurnId }) {
        if (harness.outage) {
          throw new Error("database_unavailable");
        }
        return turns.get(turnKey(chatId, clientTurnId)) ?? null;
      },
      async claimTurn(input) {
        if (harness.outage) {
          throw new Error("database_unavailable");
        }
        const key = turnKey(input.chatId, input.clientTurnId);
        const existing = turns.get(key);
        if (existing) {
          return { turn: existing, created: false };
        }
        const turn: ConversationTurnRecord = {
          id: `turn-row-${turns.size + 1}`,
          chatId: input.chatId,
          userId: input.userId,
          clientTurnId: input.clientTurnId,
          assistantMode: input.assistantMode,
          requestHash: input.requestHash,
          userMessageId: input.userMessageId,
          assistantMessageId: null,
          status: "user_persisted",
          attemptCount: 1,
          errorCode: null,
          pendingAssistantParts: null,
          createdAt: input.now,
          updatedAt: input.now,
        };
        turns.set(key, turn);
        events.push("claim");
        return { turn, created: true };
      },
      async recordUserMessageId({ turnId, userMessageId }) {
        const entry = [...turns.values()].find((turn) => turn.id === turnId);
        if (!entry) {
          return null;
        }
        const updated = { ...entry, userMessageId };
        turns.set(turnKey(entry.chatId, entry.clientTurnId), updated);
        return updated;
      },
      async recordAttempt({ turnId }) {
        const entry = [...turns.values()].find((turn) => turn.id === turnId);
        if (!entry) {
          return null;
        }
        const updated = { ...entry, attemptCount: entry.attemptCount + 1 };
        turns.set(turnKey(entry.chatId, entry.clientTurnId), updated);
        return updated;
      },
      async storePendingAssistantParts({ turnId, parts }) {
        if (harness.failPendingPayload) {
          throw new Error("payload_write_failed");
        }
        const entry = [...turns.values()].find((turn) => turn.id === turnId);
        if (!entry) {
          return null;
        }
        const updated = { ...entry, pendingAssistantParts: parts };
        turns.set(turnKey(entry.chatId, entry.clientTurnId), updated);
        events.push("pending_payload");
        return updated;
      },
      async completeTurn({ turnId, assistantMessageId }) {
        const entry = [...turns.values()].find((turn) => turn.id === turnId);
        if (!entry) {
          return null;
        }
        const updated: ConversationTurnRecord = {
          ...entry,
          assistantMessageId,
          status: "assistant_persisted",
          pendingAssistantParts: null,
          errorCode: null,
        };
        turns.set(turnKey(entry.chatId, entry.clientTurnId), updated);
        events.push("complete");
        return updated;
      },
      async failTurn({ turnId, errorCode }) {
        const entry = [...turns.values()].find((turn) => turn.id === turnId);
        if (!entry) {
          return null;
        }
        const updated: ConversationTurnRecord = {
          ...entry,
          status: "failed",
          errorCode,
        };
        turns.set(turnKey(entry.chatId, entry.clientTurnId), updated);
        return updated;
      },
      async insertMessageIdempotent(input) {
        if (harness.outage) {
          throw new Error("database_unavailable");
        }
        if (harness.failNextMessageInsert) {
          harness.failNextMessageInsert = false;
          throw new Error("message_insert_failed");
        }
        const key = messageKey(input.chatId, input.messageId);
        const existing = messages.get(key);
        if (existing) {
          return { inserted: false, message: existing };
        }
        const record: PersistedMessageRecord = {
          id: input.messageId,
          chatId: input.chatId,
          role: input.role,
          parts: input.parts,
        };
        messages.set(key, record);
        events.push(`insert:${input.role}`);
        return { inserted: true, message: record };
      },
      async getMessage({ chatId, messageId }) {
        if (harness.outage) {
          throw new Error("database_unavailable");
        }
        return messages.get(messageKey(chatId, messageId)) ?? null;
      },
    },
  };
  return harness;
}

function service(harness: Harness) {
  let counter = 0;
  return createConversationTurnService({
    repository: harness.repository,
    now: () => NOW,
    newId: () =>
      `dddddddd-dddd-4ddd-8ddd-${String(++counter).padStart(12, "0")}`,
  });
}

function userMessagesOf(harness: Harness) {
  return [...harness.messages.values()].filter(
    (message) => message.role === "user"
  );
}

function assistantMessagesOf(harness: Harness) {
  return [...harness.messages.values()].filter(
    (message) => message.role === "assistant"
  );
}

test("the user turn is durable before generation and the assistant turn after", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  const started = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "What is condition 8501?",
    assistantMode: "default",
  });

  assert.equal(started.ok, true);
  assert.equal(started.kind, "fresh");
  assert.equal(started.userTurnPersisted, true);
  assert.deepEqual(harness.events, ["claim", "insert:user"]);
  assert.equal(userMessagesOf(harness).length, 1);
  assert.equal(assistantMessagesOf(harness).length, 0);

  const completed = await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    parts: [
      { type: "text", text: "Condition 8501 requires adequate health cover." },
      { type: "metadata", citations: [], compactSources: [] },
    ],
  });

  assert.equal(completed.assistantTurnPersisted, true);
  assert.ok(completed.assistantMessageId);
  assert.equal(userMessagesOf(harness).length, 1);
  assert.equal(assistantMessagesOf(harness).length, 1);
});

test("a repeated request with the same client turn id never duplicates messages", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "How do I apply for a 485 visa?",
  });
  await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    parts: [{ type: "text", text: "First answer" }],
  });

  const retry = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "How do I apply for a 485 visa?",
  });

  assert.equal(retry.kind, "replayed");
  assert.equal(retry.ok, false);
  assert.equal(retry.attemptCount, 2);
  assert.ok(retry.replay?.assistantMessageId);
  assert.equal(userMessagesOf(harness).length, 1);
  assert.equal(assistantMessagesOf(harness).length, 1);
});
test("an already answered turn is replayed from storage with its metadata", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "Deadline for review?",
  });
  await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    parts: [
      { type: "text", text: "Stored answer" },
      {
        type: "metadata",
        citations: [{ title: "Migration Act 1958" }],
        compactSources: ["Migration Act 1958 s 476"],
        customerDocumentEvidenceUsed: false,
        confidence: "high",
        researchStatus: "complete",
        followUpQuestions: ["Do you have the decision letter?"],
        matterId: "matter-1",
        retrievalDebug: null,
      },
    ],
  });

  const replay = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "Deadline for review?",
  });

  assert.equal(replay.kind, "replayed");
  assert.equal(replay.replay?.parts.length, 2);
  assert.deepEqual(replay.replay?.parts[0], {
    type: "text",
    text: "Stored answer",
  });
  assert.equal(assistantMessagesOf(harness).length, 1);
});

test("a different question on a used client turn id is rejected as a conflict", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "Original question",
  });

  const conflict = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "Different question",
  });

  assert.equal(conflict.kind, "conflict");
  assert.equal(conflict.ok, false);
  assert.equal(
    conflict.durabilityError,
    "client_turn_id_reused_for_different_question"
  );
  assert.equal(userMessagesOf(harness).length, 1);
});

test("a database outage never reports a durable write as successful", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  harness.outage = true;

  const started = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "Will the answer survive?",
  });

  assert.equal(started.kind, "unavailable");
  assert.equal(started.userTurnPersisted, false);
  assert.equal(started.durabilityError, "conversation_ownership_unverified");
  assert.equal(harness.messages.size, 0);

  const completed = await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    parts: [{ type: "text", text: "answer" }],
  });
  assert.equal(completed.assistantTurnPersisted, false);
  assert.equal(completed.errorCode, "conversation_ownership_unverified");
});

test("an interrupted turn is recovered from the pending payload without a new model call", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "Interrupted question",
  });
  harness.failNextMessageInsert = true;

  const failedCompletion = await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    parts: [{ type: "text", text: "Generated but unstored answer" }],
  });

  assert.equal(failedCompletion.assistantTurnPersisted, false);
  assert.equal(failedCompletion.errorCode, "message_write_failed");
  assert.equal(assistantMessagesOf(harness).length, 0);

  const resumed = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "Interrupted question",
  });
  assert.equal(resumed.kind, "resumed");
  assert.deepEqual(resumed.pendingAssistantParts, [
    { type: "text", text: "Generated but unstored answer" },
  ]);
  assert.equal(userMessagesOf(harness).length, 1);

  const repaired = await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    parts: resumed.pendingAssistantParts ?? [],
  });
  assert.equal(repaired.assistantTurnPersisted, true);
  assert.equal(assistantMessagesOf(harness).length, 1);
  assert.equal(
    (assistantMessagesOf(harness)[0]?.parts as { text?: string }[])[0]?.text,
    "Generated but unstored answer"
  );
});

test("concurrent duplicate requests claim exactly one turn", async () => {
  const harness = makeHarness();
  const turns = service(harness);

  const [first, second] = await Promise.all([
    turns.beginTurn({
      userId: USER_A,
      chatId: CHAT_A,
      clientTurnId: TURN_A,
      question: "Same concurrent turn",
    }),
    turns.beginTurn({
      userId: USER_A,
      chatId: CHAT_A,
      clientTurnId: TURN_A,
      question: "Same concurrent turn",
    }),
  ]);

  const kinds = [first.kind, second.kind].sort();
  assert.deepEqual(kinds, ["fresh", "resumed"]);
  assert.equal(harness.turns.size, 1);
  assert.equal(userMessagesOf(harness).length, 1);
});

test("ownership is enforced for a foreign conversation and a foreign turn", async () => {
  const harness = makeHarness();
  const turns = service(harness);

  await assert.rejects(
    () =>
      turns.beginTurn({
        userId: USER_B,
        chatId: CHAT_A,
        clientTurnId: TURN_A,
        question: "Another user's conversation",
      }),
    ConversationTurnOwnershipError
  );
  assert.equal(harness.turns.size, 0);
  assert.equal(harness.messages.size, 0);

  await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "Owned question",
  });
  await assert.rejects(
    () =>
      turns.completeTurn({
        userId: USER_B,
        chatId: CHAT_A,
        clientTurnId: TURN_A,
        parts: [{ type: "text", text: "injected" }],
      }),
    ConversationTurnOwnershipError
  );
});

test("invalid client turn identifiers are rejected before any write", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  await assert.rejects(
    () =>
      turns.beginTurn({
        userId: USER_A,
        chatId: CHAT_A,
        clientTurnId: "short",
        question: "q",
      }),
    ConversationTurnInputError
  );
  assert.equal(harness.turns.size, 0);

  const failed = await turns.failTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: "bad id with spaces",
    errorCode: "x",
  });
  assert.equal(failed, false);
});

test("a failed turn is recorded durably for operators and for the client", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "Failure question",
  });

  const recorded = await turns.failTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    errorCode: "assistant_generation_failed",
  });

  assert.equal(recorded, true);
  const turn = harness.turns.get(turnKey(CHAT_A, TURN_A));
  assert.equal(turn?.status, "failed");
  assert.equal(turn?.errorCode, "assistant_generation_failed");
});

test("readTurn returns the owner's turn and hides other users' turns", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "Readable question",
  });

  const own = await turns.readTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
  });
  assert.equal(own?.clientTurnId, TURN_A);

  await assert.rejects(
    () =>
      turns.readTurn({
        userId: USER_B,
        chatId: CHAT_A,
        clientTurnId: TURN_A,
      }),
    ConversationTurnOwnershipError
  );
});
