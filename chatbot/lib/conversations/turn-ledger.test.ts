// biome-ignore-all lint/suspicious/useAwait: repository doubles intentionally return plain values from fake async methods.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConversationTurnInputError,
  ConversationTurnOwnershipError,
  type ConversationTurnRecord,
  type ConversationTurnRepository,
  createConversationTurnService,
  deterministicMessageId,
  type PersistedMessageRecord,
  partsFingerprint,
  requestHashForQuestion,
  TURN_EXECUTION_LEASE_MS,
} from "./turn-ledger";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const CHAT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TURN_A = "turn-aaaaaaaa-0001";
const TURN_B = "turn-bbbbbbbb-0002";
const NOW = new Date("2026-10-11T00:00:00.000Z");
const QUESTION = "What is condition 8501?";

type Harness = {
  repository: ConversationTurnRepository;
  turns: Map<string, ConversationTurnRecord>;
  messages: Map<string, PersistedMessageRecord>;
  events: string[];
  outage: boolean;
  failAssistantMessageInsert: boolean;
  failUserMessageInsert: boolean;
  failPendingPayload: boolean;
  failUserMessageLink: boolean;
  now: Date;
};

function findTurn(harness: Harness, turnId: string) {
  return [...harness.turns.values()].find((turn) => turn.id === turnId) ?? null;
}

function storeTurn(harness: Harness, turn: ConversationTurnRecord) {
  harness.turns.set(turnKey(turn.chatId, turn.clientTurnId), turn);
  return turn;
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
    failAssistantMessageInsert: false,
    failUserMessageInsert: false,
    failPendingPayload: false,
    failUserMessageLink: false,
    now: NOW,
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
          executionOwnerId: null,
          executionLeaseExpiresAt: null,
          executionAttempt: 0,
          createdAt: input.now,
          updatedAt: input.now,
        };
        turns.set(key, turn);
        events.push("claim");
        return { turn, created: true };
      },
      async recordUserMessageId({ turnId, userMessageId }) {
        if (harness.failUserMessageLink) {
          return null;
        }
        const entry = [...turns.values()].find((turn) => turn.id === turnId);
        if (!entry) {
          return null;
        }
        const updated = { ...entry, userMessageId };
        turns.set(turnKey(entry.chatId, entry.clientTurnId), updated);
        return updated;
      },
      async acquireExecution({ turnId, ownerId, leaseMs, now }) {
        const entry = findTurn(harness, turnId);
        if (!entry || entry.status === "assistant_persisted") {
          return null;
        }
        const heldByOther =
          entry.executionOwnerId !== null &&
          entry.executionOwnerId !== ownerId &&
          entry.executionLeaseExpiresAt !== null &&
          entry.executionLeaseExpiresAt.getTime() > now.getTime();
        if (heldByOther) {
          return null;
        }
        return storeTurn(harness, {
          ...entry,
          executionOwnerId: ownerId,
          executionLeaseExpiresAt: new Date(now.getTime() + leaseMs),
          executionAttempt: entry.executionAttempt + 1,
          updatedAt: now,
        });
      },
      async renewExecution({ turnId, ownerId, leaseMs, now }) {
        const entry = findTurn(harness, turnId);
        if (
          !entry ||
          entry.status === "assistant_persisted" ||
          entry.executionOwnerId !== ownerId
        ) {
          return null;
        }
        return storeTurn(harness, {
          ...entry,
          executionLeaseExpiresAt: new Date(now.getTime() + leaseMs),
          updatedAt: now,
        });
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
      async storePendingAssistantParts({ turnId, ownerId, parts }) {
        if (harness.failPendingPayload) {
          throw new Error("payload_write_failed");
        }
        const entry = findTurn(harness, turnId);
        if (
          !entry ||
          entry.status === "assistant_persisted" ||
          entry.executionOwnerId !== ownerId
        ) {
          return null;
        }
        const updated = { ...entry, pendingAssistantParts: parts };
        turns.set(turnKey(entry.chatId, entry.clientTurnId), updated);
        events.push("pending_payload");
        return updated;
      },
      async completeTurn({ turnId, ownerId, assistantMessageId }) {
        const entry = findTurn(harness, turnId);
        if (!entry) {
          return null;
        }
        if (
          entry.status === "assistant_persisted" ||
          entry.executionOwnerId !== ownerId
        ) {
          return entry;
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
      async failTurn({ turnId, ownerId, errorCode }) {
        const entry = findTurn(harness, turnId);
        if (!entry || entry.status === "assistant_persisted") {
          return null;
        }
        const ownerMatches = ownerId
          ? entry.executionOwnerId === ownerId
          : entry.executionOwnerId === null;
        if (!ownerMatches) {
          return null;
        }
        const updated: ConversationTurnRecord = {
          ...entry,
          status: "failed",
          errorCode,
          executionOwnerId: null,
          executionLeaseExpiresAt: null,
        };
        turns.set(turnKey(entry.chatId, entry.clientTurnId), updated);
        return updated;
      },
      async insertMessageIdempotent(input) {
        if (harness.outage) {
          throw new Error("database_unavailable");
        }
        if (harness.failAssistantMessageInsert && input.role === "assistant") {
          harness.failAssistantMessageInsert = false;
          throw new Error("message_insert_failed");
        }
        if (harness.failUserMessageInsert && input.role === "user") {
          harness.failUserMessageInsert = false;
          throw new Error("user_message_insert_failed");
        }
        const existing = messages.get(input.messageId);
        if (existing) {
          return { inserted: false, message: existing };
        }
        const record: PersistedMessageRecord = {
          id: input.messageId,
          chatId: input.chatId,
          role: input.role,
          parts: input.parts,
          attachments: [],
        };
        messages.set(input.messageId, record);
        events.push(`insert:${input.role}`);
        return { inserted: true, message: record };
      },
      async getMessage({ chatId, messageId }) {
        if (harness.outage) {
          throw new Error("database_unavailable");
        }
        const record = messages.get(messageId) ?? null;
        // Mirrors getMessageForChat: a row in another chat is not visible.
        return record && record.chatId === chatId ? record : null;
      },
    },
  };
  return harness;
}

function service(harness: Harness) {
  let counter = 0;
  return createConversationTurnService({
    repository: harness.repository,
    now: () => harness.now,
    newId: () => `owner-${String(++counter).padStart(4, "0")}`,
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

function turnOf(harness: Harness) {
  return harness.turns.get(turnKey(CHAT_A, TURN_A)) ?? null;
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
    executionOwnerId: started.executionOwnerId as string,
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
  const firstTurn = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "How do I apply for a 485 visa?",
  });
  await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    executionOwnerId: firstTurn.executionOwnerId as string,
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
  const reviewTurn = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "Deadline for review?",
  });
  await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    executionOwnerId: reviewTurn.executionOwnerId as string,
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

  assert.equal(started.kind, "persistence_failed");
  assert.equal(started.ok, false);
  assert.equal(started.userTurnPersisted, false);
  assert.equal(started.durabilityError, "conversation_ownership_unverified");
  assert.equal(harness.messages.size, 0);

  const completed = await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    parts: [{ type: "text", text: "answer" }],
    executionOwnerId: "owner-unavailable",
  });
  assert.equal(completed.assistantTurnPersisted, false);
  assert.equal(completed.errorCode, "conversation_ownership_unverified");
});

test("an interrupted turn is recovered from the pending payload without a new model call", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  const interruptedTurn = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "Interrupted question",
  });
  harness.failAssistantMessageInsert = true;

  const failedCompletion = await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    executionOwnerId: interruptedTurn.executionOwnerId as string,
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
    executionOwnerId: resumed.executionOwnerId as string,
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
  assert.deepEqual(kinds, ["fresh", "in_progress"]);
  assert.equal([first, second].filter((turn) => turn.ok).length, 1);
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
        executionOwnerId: "owner-foreign",
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
  const failingTurn = await turns.beginTurn({
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
    executionOwnerId: failingTurn.executionOwnerId,
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
test("a failed user-message write fails closed and never reaches the model", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  harness.failUserMessageInsert = true;

  const blocked = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.kind, "persistence_failed");
  assert.equal(blocked.userTurnPersisted, false);
  assert.equal(blocked.durabilityError, "message_write_failed");
  assert.ok((blocked.retryAfterMs ?? 0) > 0);
  assert.equal(assistantMessagesOf(harness).length, 0);

  // Once the database recovers, the retry is idempotent and becomes durable.
  const retried = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  assert.equal(retried.ok, true);
  assert.equal(retried.userTurnPersisted, true);
  assert.equal(userMessagesOf(harness).length, 1);
});

test("a broken turn ledger link fails closed instead of claiming durability", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  // A turn row whose user-message link is still missing (repair path).
  harness.turns.set(turnKey(CHAT_A, TURN_A), {
    id: "turn-row-repair",
    chatId: CHAT_A,
    userId: USER_A,
    clientTurnId: TURN_A,
    assistantMode: null,
    requestHash: requestHashForQuestion(QUESTION),
    userMessageId: null,
    assistantMessageId: null,
    status: "user_persisted",
    attemptCount: 1,
    errorCode: null,
    pendingAssistantParts: null,
    executionOwnerId: null,
    executionLeaseExpiresAt: null,
    executionAttempt: 0,
    createdAt: NOW,
    updatedAt: NOW,
  });
  harness.failUserMessageLink = true;

  const blocked = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  assert.equal(blocked.kind, "persistence_failed");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.durabilityError, "user_turn_ledger_write_failed");

  harness.failUserMessageLink = false;
  const retried = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  assert.equal(retried.ok, true);
  assert.equal(userMessagesOf(harness).length, 1);
});

test("an id collision with different content is never a durable success", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  const clientUserMessageId = "client-message-aaaabbbb";

  harness.messages.set(clientUserMessageId, {
    id: clientUserMessageId,
    chatId: CHAT_A,
    role: "user",
    parts: [{ type: "text", text: "original text" }],
    attachments: [],
  });

  const blocked = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "different question text",
    userMessageId: clientUserMessageId,
  });

  assert.equal(blocked.kind, "persistence_failed");
  assert.equal(blocked.durabilityError, "message_id_content_conflict");
  assert.equal(blocked.userTurnPersisted, false);
  assert.deepEqual(
    harness.messages.get(clientUserMessageId)?.parts,
    [{ type: "text", text: "original text" }],
    "a pre-existing message must never be modified"
  );
  assert.equal(harness.messages.size, 1);
});

test("a colliding id from another chat, role or attachments is rejected", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  const collidingId = "client-message-ccccdddd";
  const questionParts = [{ type: "text", text: "same text" }];

  // Same id in another chat.
  harness.messages.set(collidingId, {
    id: collidingId,
    chatId: CHAT_B,
    role: "user",
    parts: questionParts,
    attachments: [],
  });
  const otherChat = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "same text",
    userMessageId: collidingId,
  });
  assert.equal(otherChat.durabilityError, "message_id_conflict");

  // Same id and chat but the wrong role.
  harness.messages.set(collidingId, {
    id: collidingId,
    chatId: CHAT_A,
    role: "assistant",
    parts: questionParts,
    attachments: [],
  });
  const otherRole = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_B,
    question: "same text",
    userMessageId: collidingId,
  });
  assert.equal(otherRole.durabilityError, "message_id_conflict");

  // Same id, chat and role but a message created with attachments elsewhere.
  harness.messages.set(collidingId, {
    id: collidingId,
    chatId: CHAT_A,
    role: "user",
    parts: questionParts,
    attachments: [{ type: "file", name: "x.pdf" }],
  });
  const otherSurface = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "same text",
    userMessageId: collidingId,
  });
  assert.equal(otherSurface.durabilityError, "message_id_content_conflict");
  assert.equal(
    (harness.messages.get(collidingId)?.attachments as unknown[]).length,
    1,
    "the stored attachments must be untouched"
  );
});

test("a genuine retry of the same message id and content is idempotent", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  const clientUserMessageId = "client-message-eeeeffff";

  const first = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "identical retry question",
    userMessageId: clientUserMessageId,
  });
  assert.equal(first.ok, true);

  const retry = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: "identical retry question",
    userMessageId: clientUserMessageId,
  });
  assert.equal(retry.userTurnPersisted, true);
  assert.equal(userMessagesOf(harness).length, 1);
});

test("saved requires the linked user message to exist", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  const started = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  const userMessageId = turnOf(harness)?.userMessageId as string;

  // The user row disappears between the two writes (partial failure/recovery).
  harness.messages.delete(userMessageId);

  const completed = await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    executionOwnerId: started.executionOwnerId as string,
    parts: [{ type: "text", text: "answer without a stored question" }],
  });

  assert.equal(
    completed.saved,
    false,
    "an unlinked assistant answer must never be reported as saved"
  );
  assert.equal(completed.linkVerified, false);
  assert.equal(completed.errorCode, "user_turn_link_missing");
  assert.equal(completed.retryable, true);
});

test("a failed turn releases its lease so a retry can execute immediately", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  const first = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  const recorded = await turns.failTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    errorCode: "assistant_generation_failed",
    executionOwnerId: first.executionOwnerId,
  });
  assert.equal(recorded, true);
  assert.equal(turnOf(harness)?.executionOwnerId, null);

  const retry = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  assert.equal(retry.ok, true);
  assert.notEqual(retry.executionOwnerId, first.executionOwnerId);
});

test("a foreign attempt can never fail another attempt's live turn", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  const live = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });

  const hijack = await turns.failTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    errorCode: "assistant_generation_failed",
    executionOwnerId: "not-the-lease-owner",
  });
  assert.equal(hijack, false);
  assert.equal(turnOf(harness)?.status, "user_persisted");
  assert.equal(turnOf(harness)?.executionOwnerId, live.executionOwnerId);
});

test("the execution heartbeat renews a live lease and stops renewing after stop", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  const started = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  const heartbeat = turns.startExecutionHeartbeat({
    turnId: started.turnId as string,
    ownerId: started.executionOwnerId as string,
    intervalMs: 5,
    leaseMs: 1000,
  });
  const before = turnOf(harness)?.executionLeaseExpiresAt?.getTime() ?? 0;
  harness.now = new Date(before + 1);
  await new Promise((resolve) => setTimeout(resolve, 40));
  const renewed = turnOf(harness)?.executionLeaseExpiresAt?.getTime() ?? 0;
  assert.ok(renewed > before, "a live attempt keeps extending its lease");

  const stopped = heartbeat.stop();
  assert.equal(stopped.renewalFailures, 0);
  assert.equal(stopped.leaseLost, false);
  const settled = turnOf(harness)?.executionLeaseExpiresAt?.getTime() ?? 0;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(
    turnOf(harness)?.executionLeaseExpiresAt?.getTime(),
    settled,
    "a stopped heartbeat must not keep extending the lease"
  );
});

test("the heartbeat reports a stolen lease instead of extending it", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  const stalled = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  const heartbeat = turns.startExecutionHeartbeat({
    turnId: stalled.turnId as string,
    ownerId: stalled.executionOwnerId as string,
    intervalMs: 5,
    leaseMs: 1000,
  });
  harness.now = new Date(
    NOW.getTime() + TURN_EXECUTION_LEASE_MS + TURN_EXECUTION_LEASE_MS
  );
  const recovered = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  assert.equal(recovered.ok, true);
  await new Promise((resolve) => setTimeout(resolve, 40));
  const stopped = heartbeat.stop();
  assert.equal(stopped.leaseLost, true);
});

test("assistant message identity is deterministic per turn", async () => {
  const harness = makeHarness();
  const turns = service(harness);
  const started = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  const completed = await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    executionOwnerId: started.executionOwnerId as string,
    parts: [{ type: "text", text: "deterministic answer" }],
  });
  assert.equal(
    completed.assistantMessageId,
    deterministicMessageId(`assistant:${started.turnId}`)
  );
});

test("the message fingerprint is key-order stable and content sensitive", () => {
  assert.equal(
    partsFingerprint([
      { type: "text", text: "a" },
      { b: 1, a: 2 },
    ]),
    partsFingerprint([
      { type: "text", text: "a" },
      { a: 2, b: 1 },
    ])
  );
  assert.notEqual(
    partsFingerprint([{ type: "text", text: "a" }]),
    partsFingerprint([{ type: "text", text: "b" }])
  );
});

test("exactly one concurrent request may execute the model for a turn", async () => {
  const harness = makeHarness();
  const turns = service(harness);

  // Four simultaneous duplicates of the same client turn, i.e. four route
  // requests that would each want to run the model stage.
  const attempts = await Promise.all(
    Array.from({ length: 4 }, () =>
      turns.beginTurn({
        userId: USER_A,
        chatId: CHAT_A,
        clientTurnId: TURN_A,
        question: QUESTION,
      })
    )
  );

  const executable = attempts.filter((attempt) => attempt.ok);
  assert.equal(
    executable.length,
    1,
    "exactly one attempt may own model execution"
  );
  assert.equal(
    attempts.filter((attempt) => attempt.kind === "in_progress").length,
    3,
    "every other duplicate must be told the turn is already in progress"
  );

  // Model invocation count follows the lease: only the executable attempt runs.
  let modelInvocations = 0;
  for (const attempt of attempts) {
    if (attempt.ok) {
      modelInvocations += 1;
      const completed = await turns.completeTurn({
        userId: USER_A,
        chatId: CHAT_A,
        clientTurnId: TURN_A,
        executionOwnerId: attempt.executionOwnerId as string,
        parts: [{ type: "text", text: "single answer" }],
      });
      assert.equal(completed.saved, true);
    }
  }

  assert.equal(modelInvocations, 1);
  assert.equal(userMessagesOf(harness).length, 1);
  assert.equal(assistantMessagesOf(harness).length, 1);
  assert.equal(turnOf(harness)?.executionAttempt, 1);

  // A later duplicate replays the stored answer instead of generating again.
  const replay = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  assert.equal(replay.kind, "replayed");
  assert.equal(modelInvocations, 1);
  assert.equal(assistantMessagesOf(harness).length, 1);
});

test("an in-progress duplicate never writes a second assistant message", async () => {
  const harness = makeHarness();
  const turns = service(harness);

  const primary = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  const duplicate = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });

  assert.equal(primary.ok, true);
  assert.equal(duplicate.kind, "in_progress");
  assert.equal(duplicate.ok, false);
  assert.ok((duplicate.retryAfterMs ?? 0) > 0);
  assert.equal(assistantMessagesOf(harness).length, 0);

  const completed = await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    executionOwnerId: primary.executionOwnerId as string,
    parts: [{ type: "text", text: "primary answer" }],
  });

  assert.equal(completed.saved, true);
  assert.equal(assistantMessagesOf(harness).length, 1);
});

test("a stale attempt cannot complete once its lease was stolen", async () => {
  const harness = makeHarness();
  const turns = service(harness);

  const stalled = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  assert.equal(stalled.ok, true);

  // The attempt stops responding; its lease expires and a retry takes over.
  harness.now = new Date(
    NOW.getTime() + TURN_EXECUTION_LEASE_MS + TURN_EXECUTION_LEASE_MS
  );
  const recovery = await turns.beginTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    question: QUESTION,
  });
  assert.equal(recovery.ok, true);
  assert.notEqual(recovery.executionOwnerId, stalled.executionOwnerId);

  const staleCompletion = await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    executionOwnerId: stalled.executionOwnerId as string,
    parts: [{ type: "text", text: "stale answer" }],
  });
  assert.equal(staleCompletion.assistantTurnPersisted, false);
  assert.equal(staleCompletion.saved, false);
  assert.equal(staleCompletion.errorCode, "turn_execution_lease_lost");
  assert.equal(staleCompletion.retryable, true);
  assert.equal(assistantMessagesOf(harness).length, 0);

  const winner = await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    executionOwnerId: recovery.executionOwnerId as string,
    parts: [{ type: "text", text: "recovery answer" }],
  });
  assert.equal(winner.saved, true);
  assert.equal(assistantMessagesOf(harness).length, 1);

  // Late completion from the obsolete attempt must not overwrite the winner.
  const late = await turns.completeTurn({
    userId: USER_A,
    chatId: CHAT_A,
    clientTurnId: TURN_A,
    executionOwnerId: stalled.executionOwnerId as string,
    parts: [{ type: "text", text: "late different answer" }],
  });
  assert.equal(late.assistantMessageId, winner.assistantMessageId);
  assert.equal(assistantMessagesOf(harness).length, 1);
  assert.equal(
    (assistantMessagesOf(harness)[0]?.parts as { text?: string }[])[0]?.text,
    "recovery answer"
  );
});
