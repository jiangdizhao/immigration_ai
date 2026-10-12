import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationPolicyBindingView } from "@/lib/policy-intelligence/conversation-policy-binding";
import {
  createConversationHistoryHandlers,
  type ConversationHistoryRepository,
  type ConversationSummaryRecord,
} from "./conversation-http";

/**
 * Phase 12 Stage 2 HTTP contract: the conversation API is the only trusted
 * boundary between a client-requested policy and a persisted conversation topic.
 * These tests use a fake repository so they assert the contract, not the DB.
 */
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const CHAT_ID = "aaaaaaaa-1111-4111-8111-111111111111";

function binding(chatId: string, slug = "policy-one"): ConversationPolicyBindingView {
  return {
    chatId,
    policySlug: slug,
    policyOrigin: "automated",
    policyItemId: "item-1",
    policyRevisionNumber: 2,
    policyPublishedAt: "2026-10-01T02:01:00.000Z",
    policySourceStatus: "announced",
    policyRevisionToken: `${slug}@r2`,
    title: { "zh-CN": "政策标题", en: "Policy title" },
    officialTitle: "Official page title",
    officialUrl: "https://immi.homeaffairs.gov.au/policy",
    boundAt: "2026-10-11T00:00:00.000Z",
    snapshot: true,
  };
}

function summary(chatId: string, ownerId: string): ConversationSummaryRecord & {
  ownerId: string;
} {
  return {
    ownerId,
    chatId,
    legalMatterId: null,
    title: "Conversation",
    chatTitle: "Conversation",
    createdAt: new Date("2026-10-11T00:00:00.000Z"),
    updatedAt: new Date("2026-10-11T00:00:00.000Z"),
    origin: "immigration",
  };
}

function jsonRequest(body: unknown) {
  return new Request("https://example.test/api/immigration-conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function repositoryFor(options: {
  createResult?:
    | { ok: true; conversation: ConversationSummaryRecord; policyBinding: ConversationPolicyBindingView | null }
    | { ok: false; status: number; code: string; retryable: boolean; unavailable?: "policy_binding_schema" };
  detailConversation?: ConversationSummaryRecord | null;
  detailBinding?: ConversationPolicyBindingView | null;
  listConversations?: ConversationSummaryRecord[];
  listBindings?: Map<string, ConversationPolicyBindingView>;
}) {
  const calls: Array<Record<string, unknown>> = [];
  const repository: ConversationHistoryRepository = {
    async listConversations() {
      return { conversations: options.listConversations ?? [], hasMore: false };
    },
    async countConversations() {
      return options.listConversations?.length ?? 0;
    },
    async createConversation(input) {
      calls.push(input as unknown as Record<string, unknown>);
      return (
        options.createResult ?? {
          ok: true,
          conversation: summary(CHAT_ID, input.userId),
          policyBinding: null,
        }
      );
    },
    async getConversation() {
      return options.detailConversation ?? null;
    },
    async getPolicyBinding() {
      return options.detailBinding ?? null;
    },
    async listPolicyBindings() {
      return options.listBindings ?? new Map();
    },
    async listMessages() {
      return { messages: [], hasOlder: false };
    },
    async updateConversation() {
      return null;
    },
  };
  return { repository, calls };
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

test("a policy launch is resolved server-side and returns the stored snapshot", async () => {
  const stored = binding(CHAT_ID, "policy-one");
  const { repository, calls } = repositoryFor({
    createResult: { ok: true, conversation: summary(CHAT_ID, USER_A), policyBinding: stored },
  });
  const response = await handlersFor(repository).create(
    jsonRequest({
      title: "Policy question",
      policySlug: "policy-one",
      policyLaunchId: "launch-0001",
    })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.policyBinding.policySlug, "policy-one");
  assert.equal(body.policyBinding.snapshot, true);
  assert.equal(body.policyBinding.title["zh-CN"], "政策标题");
  // The slug and launch id are only *requests*; the repository resolves them.
  assert.deepEqual(calls[0], {
    userId: USER_A,
    title: "Policy question",
    policySlug: "policy-one",
    policyLaunchId: "launch-0001",
  });
});

test("an ordinary conversation creation carries no policy request", async () => {
  const { repository, calls } = repositoryFor({});
  const response = await handlersFor(repository).create(jsonRequest({}));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.policyBinding, null);
  assert.equal(calls[0].policySlug, null);
  assert.equal(calls[0].policyLaunchId, null);
});

test("a refused policy launch fails explicitly instead of looking successful", async () => {
  const cases = [
    {
      failure: { ok: false as const, status: 404, code: "policy_topic_unavailable", retryable: false },
      expectedStatus: 404,
      expectedCode: "policy_topic_unavailable",
    },
    {
      failure: { ok: false as const, status: 409, code: "policy_launch_in_progress", retryable: true },
      expectedStatus: 409,
      expectedCode: "policy_launch_in_progress",
    },
    {
      failure: {
        ok: false as const,
        status: 503,
        code: "policy_binding_unavailable",
        retryable: true,
        unavailable: "policy_binding_schema" as const,
      },
      expectedStatus: 503,
      expectedCode: "policy_binding_unavailable",
    },
  ];
  for (const { failure, expectedStatus, expectedCode } of cases) {
    const { repository } = repositoryFor({ createResult: failure });
    const response = await handlersFor(repository).create(
      jsonRequest({ policySlug: "policy-one" })
    );
    assert.equal(response.status, expectedStatus);
    const body = await response.json();
    assert.equal(body.code, expectedCode);
    assert.equal(typeof body.retryable, "boolean");
    // No conversation identity may leak from a refused launch.
    assert.equal(body.chatId, undefined);
  }
});

test("the detail response carries the owner's persisted policy topic", async () => {
  const stored = binding(CHAT_ID, "policy-one");
  const { repository } = repositoryFor({
    detailConversation: summary(CHAT_ID, USER_A),
    detailBinding: stored,
  });
  const response = await handlersFor(repository).detail(
    new Request(`https://example.test/api/immigration-conversations/${CHAT_ID}`),
    CHAT_ID
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.policyBinding.chatId, CHAT_ID);
  assert.equal(body.policyBinding.policySlug, "policy-one");
});

test("another account's conversation never exposes a policy topic", async () => {
  const { repository } = repositoryFor({
    detailConversation: null,
    detailBinding: null,
  });
  const response = await handlersFor(repository, USER_B).detail(
    new Request(`https://example.test/api/immigration-conversations/${CHAT_ID}`),
    CHAT_ID
  );
  assert.equal(response.status, 404);
});

test("the conversation list only carries the owner's own policy topics", async () => {
  const otherChatId = "bbbbbbbb-2222-4222-8222-222222222222";
  const { repository } = repositoryFor({
    listConversations: [summary(CHAT_ID, USER_A), summary(otherChatId, USER_A)],
    // The repository filters by owner; a foreign row is simply not returned.
    listBindings: new Map([[CHAT_ID, binding(CHAT_ID, "policy-one")]]),
  });
  const response = await handlersFor(repository).list(
    new Request("https://example.test/api/immigration-conversations")
  );
  const body = await response.json();
  assert.equal(body.conversations[0].policyBinding.policySlug, "policy-one");
  assert.equal(body.conversations[1].policyBinding, null);
});
