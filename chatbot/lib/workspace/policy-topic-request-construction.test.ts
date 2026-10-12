import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  type ConversationPolicyBindingRow,
  conversationPolicyTopicContextEntry,
  projectPolicyBindingView,
} from "@/lib/policy-intelligence/conversation-policy-binding";
import type { PolicyWorkspaceReference } from "@/lib/policy-intelligence-product";

/**
 * Phase 12 Stage 2 R1 — end-to-end request construction for a policy-bound
 * conversation.
 *
 * Reviewer finding R1-2: the routes rebuilt the topic hint from a live lookup of
 * the bound slug, so an archived, withdrawn or superseded publication erased the
 * model-side topic and follow-ups such as "这项政策" stopped resolving. These
 * tests build the *exact* `frontend_messages` array the routes send, for the
 * three lifecycle states (publication removed, revision changed, historical
 * reopening with a follow-up) and assert the wiring uses the persisted binding.
 */

const CHAT_ID = "11111111-1111-4111-8111-111111111111";

function bindingRow(
  overrides: Partial<ConversationPolicyBindingRow> = {}
): ConversationPolicyBindingRow {
  return {
    chatId: CHAT_ID,
    userId: "22222222-2222-4222-8222-222222222222",
    policySlug: "evisitor-application-arrangements-lin-26-061",
    policyOrigin: "automated",
    policyItemId: "item-1",
    policyRevisionNumber: 3,
    policyPublishedAt: new Date("2026-10-01T02:01:00.000Z"),
    policySourceStatus: "announced",
    policyRevisionToken: "token",
    titleZh: "eVisitor 申请安排更新",
    titleEn: "eVisitor application arrangements",
    officialTitle: "eVisitor application arrangements",
    officialUrl: "https://immi.homeaffairs.gov.au/visas/evisitor",
    launchId: "launch-0001",
    boundAt: new Date("2026-10-11T00:00:00.000Z"),
    ...overrides,
  };
}

function liveReference(
  revision: number | null,
  publishedAt: string | null
): PolicyWorkspaceReference {
  return {
    slug: "evisitor-application-arrangements-lin-26-061",
    title: {
      "zh-CN": "eVisitor 申请安排更新",
      en: "eVisitor application arrangements",
    },
    officialTitle: "eVisitor application arrangements",
    officialUrl: "https://immi.homeaffairs.gov.au/visas/evisitor",
    revision: {
      number: revision,
      publishedAt,
      sourceStatus: "in_force",
      snapshot: false,
    },
  };
}

/** Mirrors the route body: history first, one topic entry last. */
function widgetFrontendMessages(input: {
  binding: ConversationPolicyBindingRow;
  current: PolicyWorkspaceReference | null;
  followUp: string;
}) {
  const entry = conversationPolicyTopicContextEntry({
    binding: projectPolicyBindingView(input.binding),
    current: input.current,
  });
  return [
    { id: "user-1", role: "user", text: "eVisitor 有什么变化？" },
    { id: "assistant-1", role: "assistant", text: "这里是该政策的要点。" },
    { id: "user-2", role: "user", text: input.followUp },
    ...(entry ? [entry] : []),
  ];
}

function topicEntries(messages: Record<string, unknown>[]) {
  return messages.filter((message) => message.policy_topic_reference === true);
}

test("R1: after the publication is removed, the follow-up still resolves its topic", () => {
  const messages = widgetFrontendMessages({
    binding: bindingRow(),
    current: null,
    followUp: "这项政策",
  });
  const entries = topicEntries(messages);
  assert.equal(entries.length, 1);
  const text = String(entries[0].text);
  assert.match(
    text,
    /Topic slug: evisitor-application-arrangements-lin-26-061/u
  );
  assert.match(text, /eVisitor 申请安排更新/u);
  assert.match(text, /revision 3/u);
  assert.match(text, /not currently available in the published index/u);
  // Exactly one system topic entry, and it is not disguised as a dialogue turn.
  assert.equal(entries[0].role, "system");
  assert.equal(
    messages.filter((message) => message.role === "system").length,
    1
  );
});

test("R1: a newer published revision is added without replacing the original topic", () => {
  const messages = widgetFrontendMessages({
    binding: bindingRow(),
    current: liveReference(5, "2026-10-20T00:00:00.000Z"),
    followUp: "这项政策现在还是这样吗？",
  });
  const text = String(topicEntries(messages)[0].text);
  assert.match(text, /conversation snapshot above\): revision 5/u);
  assert.match(text, /revision 3/u);
  assert.match(text, /has been revised since this conversation started/u);
});

test("R1: historical reopening rebuilds the same topic from the binding alone", () => {
  // A reload has no client slug at all: only the persisted binding is available.
  const afterReload = widgetFrontendMessages({
    binding: bindingRow(),
    current: null,
    followUp: "这项政策",
  });
  const beforeReload = widgetFrontendMessages({
    binding: bindingRow(),
    current: null,
    followUp: "这项政策",
  });
  assert.deepEqual(topicEntries(afterReload)[0], topicEntries(beforeReload)[0]);
  // The client slug can never substitute for the binding: the entry carries the
  // server-written snapshot even though no slug was supplied to the builder.
  assert.match(String(topicEntries(afterReload)[0].text), /Topic slug:/u);
});

test("R1: a conversation with no binding sends no topic entry", () => {
  const entry = conversationPolicyTopicContextEntry({
    binding: null,
    current: null,
  });
  assert.equal(entry, null);
  const messages = [
    { id: "user-1", role: "user", text: "Hello" },
    ...(entry ? [entry] : []),
  ];
  assert.equal(topicEntries(messages).length, 0);
});

test("R1: every widget route resolves the topic from the persisted binding", () => {
  const repoRoot = path.resolve(process.cwd());
  for (const route of [
    "app/api/widget-chat/route.ts",
    "app/api/widget-chat-fast/route.ts",
    "app/api/widget-chat-direct/route.ts",
  ]) {
    const source = readFileSync(path.join(repoRoot, route), "utf8");
    assert.match(
      source,
      /resolveConversationPolicyTopicContextEntry/u,
      `${route} must use the durable binding topic resolver`
    );
    assert.match(
      source,
      /binding: workspaceContext\.policyBinding/u,
      `${route} must pass the server-persisted binding`
    );
    assert.doesNotMatch(
      source,
      /getPolicyTopicContextEntry/u,
      `${route} must not depend on a live slug lookup for the topic`
    );
    assert.doesNotMatch(
      source,
      /workspaceContext\.policyTopic\.slug/u,
      `${route} must not rebuild the topic from a slug`
    );
  }
});
