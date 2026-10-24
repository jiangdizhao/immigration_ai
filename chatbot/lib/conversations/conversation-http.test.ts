// biome-ignore-all lint/suspicious/useAwait: repository doubles intentionally return plain values from fake async methods.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertion helper is invoked only from tests.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ConversationHistoryRepository,
  type ConversationSummaryRecord,
  createConversationHistoryHandlers,
  type StoredMessageRecord,
} from "./conversation-http";
import { isOlderThanCursor } from "./pagination";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

type ConversationRow = ConversationSummaryRecord & { ownerId: string };
type MessageRow = StoredMessageRecord & { chatId: string };

function conversationId(index: number) {
  return `${String(index).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
}

function messageId(index: number) {
  return `${String(index).padStart(8, "0")}-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
}

function baseTime() {
  return Date.parse("2026-10-01T00:00:00.000Z");
}

function makeConversations(count: number, ownerId = USER_A): ConversationRow[] {
  return Array.from({ length: count }, (_, index) => ({
    ownerId,
    chatId: conversationId(index),
    legalMatterId: index % 2 === 0 ? `matter-${index}` : null,
    title: `Conversation ${index}`,
    chatTitle: `Chat ${index}`,
    createdAt: new Date(baseTime() + index),
    // The oldest conversation has the smallest index and the smallest updatedAt.
    updatedAt: new Date(baseTime() + index),
  }));
}

function makeMessages(chatId: string, count: number): MessageRow[] {
  return Array.from({ length: count }, (_, index) => ({
    chatId,
    id: messageId(index),
    role: index % 2 === 0 ? "user" : "assistant",
    createdAt: new Date(baseTime() + index),
    parts:
      index % 2 === 0
        ? [{ type: "text", text: `Question ${index}` }]
        : [
            { type: "text", text: `Answer ${index}` },
            {
              type: "metadata",
              compactSources: [`Source ${index}`],
              citations: [{ title: `Citation ${index}` }],
              customerDocumentEvidenceUsed: true,
              customerDocumentManifest: [
                {
                  documentId: `dddddddd-dddd-4ddd-8ddd-${String(index).padStart(12, "0")}`,
                  runId: `rrrrrrrr-rrrr-4rrr-8rrr-${String(index).padStart(12, "0")}`,
                  originalFilename: `evidence-${index}.pdf`,
                  runStatus: "complete",
                  extractionMethod: "native",
                  truncated: false,
                  locators: [{ kind: "page", pageNumber: 1 }],
                },
              ],
              confidence: "high",
              researchStatus: "complete",
              followUpQuestions: [`Follow up ${index}`],
              matterId: `matter-${index}`,
              retrievalDebug: null,
            },
          ],
  }));
}

function makeRepository(options: {
  conversations: ConversationRow[];
  messages?: MessageRow[];
  failList?: boolean;
}): ConversationHistoryRepository {
  const messages = options.messages ?? [];
  return {
    async listConversations({ userId, limit, cursor }) {
      if (options.failList) {
        throw new Error("database_unavailable");
      }
      const owned = options.conversations
        .filter((row) => row.ownerId === userId)
        .sort((left, right) => {
          const diff = right.updatedAt.getTime() - left.updatedAt.getTime();
          return diff !== 0 ? diff : right.chatId.localeCompare(left.chatId);
        })
        .filter((row) =>
          cursor
            ? isOlderThanCursor(
                { timestamp: row.updatedAt.getTime(), id: row.chatId },
                cursor
              )
            : true
        );
      return {
        conversations: owned.slice(0, limit),
        hasMore: owned.length > limit,
      };
    },
    async countConversations({ userId }) {
      return options.conversations.filter((row) => row.ownerId === userId)
        .length;
    },
    async createConversation({ userId, title }) {
      const created: ConversationRow = {
        ownerId: userId,
        chatId: conversationId(9999),
        legalMatterId: null,
        title,
        chatTitle: title,
        createdAt: new Date(baseTime()),
        updatedAt: new Date(baseTime()),
      };
      options.conversations.push(created);
      return { ok: true as const, conversation: created, policyBinding: null };
    },
    async getConversation({ chatId, userId }) {
      return (
        options.conversations.find(
          (row) => row.chatId === chatId && row.ownerId === userId
        ) ?? null
      );
    },
    async listMessages({ chatId, userId, limit, olderThan }) {
      const conversation = options.conversations.find(
        (row) => row.chatId === chatId && row.ownerId === userId
      );
      if (!conversation) {
        return { messages: [], hasOlder: false };
      }
      const owned = messages
        .filter((row) => row.chatId === chatId)
        .sort((left, right) => {
          const diff = right.createdAt.getTime() - left.createdAt.getTime();
          return diff !== 0 ? diff : right.id.localeCompare(left.id);
        })
        .filter((row) =>
          olderThan
            ? isOlderThanCursor(
                { timestamp: row.createdAt.getTime(), id: row.id },
                olderThan
              )
            : true
        );
      return {
        messages: owned.slice(0, limit).reverse(),
        hasOlder: owned.length > limit,
      };
    },
    async updateConversation({ chatId, userId, legalMatterId, title }) {
      const row = options.conversations.find(
        (candidate) =>
          candidate.chatId === chatId && candidate.ownerId === userId
      );
      if (!row) {
        return null;
      }
      if (legalMatterId !== undefined) {
        row.legalMatterId = legalMatterId;
      }
      if (title !== undefined) {
        row.title = title;
        row.chatTitle = title ?? row.chatTitle;
      }
      return row;
    },
  };
}

function handlersFor(
  repository: ConversationHistoryRepository,
  userId: string | null = USER_A
) {
  return createConversationHistoryHandlers({
    authenticate: async () => (userId ? { userId } : null),
    repository,
  });
}

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

test("unauthenticated history requests are rejected", async () => {
  const handlers = handlersFor(
    makeRepository({ conversations: makeConversations(1) }),
    null
  );
  for (const response of [
    await handlers.list(request("/api/immigration-conversations")),
    await handlers.create(
      request("/api/immigration-conversations", { method: "POST" })
    ),
    await handlers.detail(
      request("/api/immigration-conversations/x"),
      conversationId(0)
    ),
    await handlers.update(
      request("/api/immigration-conversations/x", { method: "PATCH" }),
      conversationId(0)
    ),
  ]) {
    assert.equal(response.status, 401);
  }
});

test("all conversations beyond the original 80-record cap are enumerable", async () => {
  const conversations = makeConversations(137);
  const handlers = handlersFor(makeRepository({ conversations }));
  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    const query = cursor
      ? `?limit=25&cursor=${encodeURIComponent(cursor)}`
      : "?limit=25";
    const response = await handlers.list(
      request(`/api/immigration-conversations${query}`)
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.totalCount, 137);
    seen.push(
      ...body.conversations.map((row: { chatId: string }) => row.chatId)
    );
    cursor = body.nextCursor;
    pages += 1;
    assert.ok(pages < 20);
  } while (cursor);

  assert.equal(seen.length, 137);
  assert.equal(new Set(seen).size, 137);
  assert.equal(seen[0], conversationId(136));
  assert.equal(seen.at(-1), conversationId(0));
});

test("a single page without a cursor keeps the backward compatible response shape", async () => {
  const handlers = handlersFor(
    makeRepository({ conversations: makeConversations(3) })
  );
  const response = await handlers.list(
    request("/api/immigration-conversations")
  );
  const body = await response.json();
  assert.equal(body.hasMore, false);
  assert.equal(body.nextCursor, null);
  assert.equal(body.conversations.length, 3);
  // `origin` is the additive Phase 12 Stage 1 R1 field that marks a retained
  // legacy chat; every pre-existing field keeps its name and meaning.
  assert.deepEqual(Object.keys(body.conversations[0]).sort(), [
    "chatId",
    "createdAt",
    "legalMatterId",
    "origin",
    "policyBinding",
    "title",
    "updatedAt",
  ]);
  // Phase 12 Stage 2 adds the conversation's own persisted policy topic. It is
  // additive and null for a conversation that was not started from a policy.
  assert.equal(body.conversations[0].policyBinding, null);
});

test("a detail response carries the legacy origin the read-only UI depends on", async () => {
  const chatId = conversationId(5000);
  const handlers = handlersFor(
    makeRepository({
      conversations: [
        {
          ownerId: USER_A,
          chatId,
          legalMatterId: null,
          title: null,
          chatTitle: "Phase12 legacy chat",
          createdAt: new Date(baseTime()),
          updatedAt: new Date(baseTime() + 1),
          origin: "legacy_chat",
        },
      ],
      messages: makeMessages(chatId, 1),
    })
  );

  const response = await handlers.detail(
    request(`/api/immigration-conversations/${chatId}`),
    chatId
  );
  const body = (await response.json()) as {
    origin?: string;
    legalMatterId?: string | null;
    messages?: { text?: string }[];
  };

  assert.equal(response.status, 200);
  // `origin` is what makes the workspace present the archived read-only surface.
  assert.equal(body.origin, "legacy_chat");
  assert.equal(body.legalMatterId, null);
  assert.equal(body.messages?.length, 1);
  assert.equal(body.messages?.[0]?.text, "Question 0");
});

test("a normal conversation detail keeps the immigration origin", async () => {
  const chatId = conversationId(5001);
  const handlers = handlersFor(
    makeRepository({
      conversations: [
        {
          ownerId: USER_A,
          chatId,
          legalMatterId: "matter-1",
          title: "Normal",
          chatTitle: "Normal chat",
          createdAt: new Date(baseTime()),
          updatedAt: new Date(baseTime() + 1),
        },
      ],
      messages: makeMessages(chatId, 1),
    })
  );

  const response = await handlers.detail(
    request(`/api/immigration-conversations/${chatId}`),
    chatId
  );
  const body = (await response.json()) as { origin?: string };

  assert.equal(body.origin, "immigration");
});

test("Project detail exposes server-derived origin, identity and read-only state", async () => {
  const chatId = conversationId(5002);
  const projectId = conversationId(9000);
  const handlers = handlersFor(
    makeRepository({
      conversations: [
        {
          ownerId: USER_A,
          chatId,
          legalMatterId: null,
          title: "Project chat",
          chatTitle: "Project chat",
          createdAt: new Date(baseTime()),
          updatedAt: new Date(baseTime() + 1),
          origin: "project",
          projectId,
          readOnly: true,
        },
      ],
      messages: makeMessages(chatId, 1),
    })
  );

  const response = await handlers.detail(
    request(`/api/immigration-conversations/${chatId}`),
    chatId
  );
  const body = (await response.json()) as {
    origin?: string;
    projectId?: string;
    readOnly?: boolean;
  };

  assert.equal(response.status, 200);
  assert.equal(body.origin, "project");
  assert.equal(body.projectId, projectId);
  assert.equal(body.readOnly, true);
});

test("an invalid cursor is rejected instead of silently restarting history", async () => {
  const handlers = handlersFor(
    makeRepository({ conversations: makeConversations(3) })
  );
  const response = await handlers.list(
    request("/api/immigration-conversations?cursor=not-a-cursor")
  );
  assert.equal(response.status, 400);
});

test("a storage failure is reported as an error, never as an empty history", async () => {
  const handlers = handlersFor(
    makeRepository({ conversations: makeConversations(3), failList: true })
  );
  await assert.rejects(() =>
    handlers.list(request("/api/immigration-conversations"))
  );
});

test("a genuinely empty account returns an empty list, not an error", async () => {
  const handlers = handlersFor(makeRepository({ conversations: [] }));
  const response = await handlers.list(
    request("/api/immigration-conversations")
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    conversations: [],
    hasMore: false,
    nextCursor: null,
    totalCount: 0,
  });
});

test("creating a conversation returns the same fields as the list page", async () => {
  const handlers = handlersFor(makeRepository({ conversations: [] }));
  const response = await handlers.create(
    request("/api/immigration-conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Policy question" }),
    })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.title, "Policy question");
  assert.equal(body.chatId, conversationId(9999));
});

test("long message histories paginate without gaps and preserve structured metadata", async () => {
  const chatId = conversationId(0);
  const conversations = makeConversations(1);
  const handlers = handlersFor(
    makeRepository({ conversations, messages: makeMessages(chatId, 445) })
  );
  const pagesOfMessages: string[][] = [];
  let cursor: string | null = null;
  let firstPage: { messages: { id: string }[] } | null = null;

  do {
    const query = cursor
      ? `?messageLimit=100&olderCursor=${encodeURIComponent(cursor)}`
      : "?messageLimit=100";
    const response = await handlers.detail(
      request(`/api/immigration-conversations/${chatId}${query}`),
      chatId
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    firstPage ??= body;
    pagesOfMessages.push(body.messages.map((row: { id: string }) => row.id));
    cursor = body.hasOlderMessages ? body.olderMessagesCursor : null;
  } while (cursor);

  // The UI prepends older pages, so the concatenation of reversed pages is the
  // complete ascending history with no missing or duplicated message.
  const seen = [...pagesOfMessages].reverse().flat();
  assert.equal(pagesOfMessages.length, 5);
  assert.equal(seen.length, 445);
  assert.equal(new Set(seen).size, 445);
  assert.deepEqual(
    seen,
    makeMessages(chatId, 445).map((row) => row.id)
  );

  const assistant = (firstPage?.messages ?? []).find(
    (row) => (row as { role?: string }).role === "assistant"
  ) as unknown as {
    citations: { title: string }[];
    compactSources: string[];
    customerDocumentEvidenceUsed: boolean;
    customerDocumentSources: { originalFilename: string }[];
    confidence: string | null;
    researchStatus: string | null;
    matterId: string | null;
  };
  assert.ok(assistant);
  assert.equal(assistant.customerDocumentEvidenceUsed, true);
  assert.equal(assistant.customerDocumentSources.length, 1);
  assert.match(
    assistant.customerDocumentSources[0]?.originalFilename ?? "",
    /evidence-/
  );
  assert.equal(assistant.compactSources.length, 1);
  assert.equal(assistant.citations.length, 1);
  assert.equal(assistant.confidence, "high");
  assert.equal(assistant.researchStatus, "complete");
  assert.ok(assistant.matterId);
});

test("a genuinely empty conversation is distinguished from a retrieval failure", async () => {
  const chatId = conversationId(0);
  const handlers = handlersFor(
    makeRepository({ conversations: makeConversations(1) })
  );
  const response = await handlers.detail(
    request(`/api/immigration-conversations/${chatId}`),
    chatId
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.messages, []);
  assert.equal(body.hasOlderMessages, false);
  assert.equal(body.olderMessagesCursor, null);
});

test("another account's conversation and messages are not reachable", async () => {
  const foreign = makeConversations(1, USER_B);
  const chatId = foreign[0]?.chatId ?? "";
  const handlers = handlersFor(
    makeRepository({
      conversations: foreign,
      messages: makeMessages(chatId, 4),
    })
  );
  const detail = await handlers.detail(
    request(`/api/immigration-conversations/${chatId}`),
    chatId
  );
  assert.equal(detail.status, 404);
  const update = await handlers.update(
    request(`/api/immigration-conversations/${chatId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "hijacked" }),
    }),
    chatId
  );
  assert.equal(update.status, 404);
  assert.equal(foreign[0]?.title, "Conversation 0");
});

test("a long conversation can be continued from a detail page without losing older messages", async () => {
  const chatId = conversationId(0);
  const handlers = handlersFor(
    makeRepository({
      conversations: makeConversations(1),
      messages: makeMessages(chatId, 250),
    })
  );
  const first = await (
    await handlers.detail(
      request(`/api/immigration-conversations/${chatId}?messageLimit=200`),
      chatId
    )
  ).json();
  assert.equal(first.messages.length, 200);
  assert.equal(first.hasOlderMessages, true);
  assert.equal(first.messages.at(-1).id, messageId(249));

  const older = await (
    await handlers.detail(
      request(
        `/api/immigration-conversations/${chatId}?messageLimit=200&olderCursor=${encodeURIComponent(
          first.olderMessagesCursor
        )}`
      ),
      chatId
    )
  ).json();
  assert.equal(older.messages.length, 50);
  assert.equal(older.hasOlderMessages, false);
  assert.equal(older.messages.at(-1).id, messageId(49));
});

test("patching a conversation updates only the owner's record", async () => {
  const conversations = makeConversations(2);
  const handlers = handlersFor(makeRepository({ conversations }));
  const response = await handlers.update(
    request(`/api/immigration-conversations/${conversationId(1)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Renamed", legalMatterId: "matter-x" }),
    }),
    conversationId(1)
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.title, "Renamed");
  assert.equal(body.legalMatterId, "matter-x");
  assert.equal(conversations[0]?.title, "Conversation 0");
});
