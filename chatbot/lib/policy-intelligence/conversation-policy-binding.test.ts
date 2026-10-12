import assert from "node:assert/strict";
import test from "node:test";
import type { PublicPolicyProduct } from "../policy-intelligence-product";
import {
  buildConversationPolicyTopicContext,
  type ConversationPolicyBindingRow,
  conversationPolicyBindingDraft,
  conversationPolicyBindingSchemaAvailableFromCatalogRows,
  conversationPolicyTopicContextEntry,
  normalizePolicyBindingOrigin,
  normalizePolicyBindingView,
  normalizePolicyLaunchId,
  policyLaunchKey,
  policyRevisionToken,
  policyWorkspaceReferenceFromBinding,
  projectPolicyBindingView,
  resolveConversationPolicyTopic,
  shouldApplyPolicyBinding,
} from "./conversation-policy-binding";

const CHAT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CHAT_ID = "33333333-3333-4333-8333-333333333333";

function policyFixture(
  overrides: Partial<PublicPolicyProduct> = {}
): PublicPolicyProduct {
  return {
    id: "item-1",
    slug: "evisitor-application-arrangements-lin-26-061",
    origin: "automated",
    sourceStatus: "announced",
    source: {
      authority: "Department of Home Affairs",
      officialTitle: "eVisitor application arrangements",
      officialUrl: "https://immi.homeaffairs.gov.au/visas/evisitor",
      sourceDate: "2026-10-01",
      effectiveDate: null,
      jurisdiction: "Cth",
      category: { "zh-CN": "签证安排", en: "Visa arrangements" },
    },
    copy: {
      "zh-CN": { title: "eVisitor 申请安排更新", summary: "摘要" },
      en: { title: "eVisitor application arrangements", summary: "Summary" },
    },
    analysis: {
      keyChanges: [],
      affectedGroups: [],
      practicalImpacts: [],
      recommendedActions: [],
      transitionInfo: null,
      uncertainties: [],
    },
    importance: null,
    revision: {
      number: 3,
      generatedAt: "2026-10-01T02:00:00.000Z",
      publishedAt: "2026-10-01T02:01:00.000Z",
    },
    aiGenerated: true,
    officialExcerpt: null,
    lawyerCommentary: null,
    ...overrides,
  };
}

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

test("the persisted snapshot keeps the original bilingual topic identity", () => {
  const draft = conversationPolicyBindingDraft({
    policy: policyFixture(),
    launchId: "launch-0001",
  });
  assert.ok(draft);
  assert.equal(
    draft.policySlug,
    "evisitor-application-arrangements-lin-26-061"
  );
  assert.equal(draft.titleZh, "eVisitor 申请安排更新");
  assert.equal(draft.titleEn, "eVisitor application arrangements");
  assert.equal(
    draft.officialUrl,
    "https://immi.homeaffairs.gov.au/visas/evisitor"
  );
  assert.equal(draft.policyRevisionNumber, 3);
  assert.equal(draft.policyPublishedAt, "2026-10-01T02:01:00.000Z");
  assert.equal(draft.policyOrigin, "automated");
  assert.equal(draft.launchId, "launch-0001");
  assert.equal(
    draft.policyRevisionToken,
    "evisitor-application-arrangements-lin-26-061@r3@2026-10-01T02:01:00.000Z"
  );
});

test("a policy without a usable official source cannot produce a binding", () => {
  const broken = [
    policyFixture({ source: { ...policyFixture().source, officialUrl: "" } }),
    policyFixture({
      source: { ...policyFixture().source, officialTitle: "  " },
    }),
    policyFixture({
      copy: {
        "zh-CN": { title: " ", summary: "" },
        en: { title: "Title", summary: "" },
      },
    }),
  ];
  for (const entry of broken) {
    assert.equal(conversationPolicyBindingDraft({ policy: entry }), null);
  }
});

test("launch ids are bounded idempotency keys, never identity", () => {
  assert.equal(normalizePolicyLaunchId("launch-0001"), "launch-0001");
  assert.equal(normalizePolicyLaunchId("  launch-0001  "), "launch-0001");
  assert.equal(normalizePolicyLaunchId("short"), null);
  assert.equal(normalizePolicyLaunchId("bad id with spaces"), null);
  assert.equal(normalizePolicyLaunchId("x".repeat(65)), null);
  assert.equal(normalizePolicyLaunchId(42), null);
  assert.equal(normalizePolicyLaunchId(undefined), null);
  assert.equal(normalizePolicyBindingOrigin("manual"), "manual");
  assert.equal(normalizePolicyBindingOrigin("forged"), "automated");
});

test("the revision token changes with the published revision", () => {
  const base = policyRevisionToken({
    policySlug: "a-policy",
    policyRevisionNumber: 1,
    policyPublishedAt: "2026-10-01T00:00:00.000Z",
  });
  assert.notEqual(
    base,
    policyRevisionToken({
      policySlug: "a-policy",
      policyRevisionNumber: 2,
      policyPublishedAt: "2026-10-01T00:00:00.000Z",
    })
  );
  assert.notEqual(
    base,
    policyRevisionToken({
      policySlug: "a-policy",
      policyRevisionNumber: 1,
      policyPublishedAt: "2026-11-01T00:00:00.000Z",
    })
  );
  assert.notEqual(
    base,
    policyRevisionToken({
      policySlug: "b-policy",
      policyRevisionNumber: 1,
      policyPublishedAt: "2026-10-01T00:00:00.000Z",
    })
  );
});

test("the client view is a topic snapshot with ISO timestamps", () => {
  const view = projectPolicyBindingView(bindingRow());
  assert.equal(view.snapshot, true);
  assert.equal(view.boundAt, "2026-10-11T00:00:00.000Z");
  assert.equal(view.policyPublishedAt, "2026-10-01T02:01:00.000Z");
  assert.equal(view.title["zh-CN"], "eVisitor 申请安排更新");
  assert.equal(view.title.en, "eVisitor application arrangements");
});

test("schema availability fails closed on an unreadable catalog probe", () => {
  assert.equal(
    conversationPolicyBindingSchemaAvailableFromCatalogRows([
      { bindingRelation: "ConversationPolicyBinding" },
    ]),
    true
  );
  assert.equal(
    conversationPolicyBindingSchemaAvailableFromCatalogRows([
      { bindingRelation: null },
    ]),
    false
  );
  assert.throws(() =>
    conversationPolicyBindingSchemaAvailableFromCatalogRows([])
  );
  assert.throws(() =>
    conversationPolicyBindingSchemaAvailableFromCatalogRows([
      { bindingRelation: "a" },
      { bindingRelation: "b" },
    ])
  );
});

test("a binding may only be applied to the conversation it belongs to", () => {
  const view = projectPolicyBindingView(bindingRow());
  assert.equal(
    shouldApplyPolicyBinding({
      binding: view,
      activeChatId: view.chatId,
      requestedChatId: view.chatId,
    }),
    true
  );
  // A delayed response from an earlier conversation must be rejected.
  assert.equal(
    shouldApplyPolicyBinding({
      binding: view,
      activeChatId: OTHER_CHAT_ID,
      requestedChatId: OTHER_CHAT_ID,
    }),
    false
  );
  // A binding naming a different chat than the one requested is foreign.
  assert.equal(
    shouldApplyPolicyBinding({
      binding: view,
      activeChatId: view.chatId,
      requestedChatId: OTHER_CHAT_ID,
    }),
    false
  );
  assert.equal(
    shouldApplyPolicyBinding({
      binding: null,
      activeChatId: view.chatId,
      requestedChatId: view.chatId,
    }),
    false
  );
});

test("the workspace reference keeps the snapshot identity visible", () => {
  const reference = policyWorkspaceReferenceFromBinding(
    projectPolicyBindingView(bindingRow())
  );
  assert.equal(reference.slug, "evisitor-application-arrangements-lin-26-061");
  assert.equal(reference.revision?.snapshot, true);
  assert.equal(reference.revision?.number, 3);
  assert.equal(reference.revision?.sourceStatus, "announced");
});

test("only a well-formed payload naming its own chat is accepted", () => {
  const view = projectPolicyBindingView(bindingRow());
  assert.deepEqual(normalizePolicyBindingView(view), view);
  assert.equal(normalizePolicyBindingView(null), null);
  assert.equal(normalizePolicyBindingView("policy"), null);
  assert.equal(
    normalizePolicyBindingView({ ...view, chatId: undefined }),
    null
  );
  assert.equal(normalizePolicyBindingView({ ...view, title: {} }), null);
  assert.equal(normalizePolicyBindingView({ ...view, officialUrl: 42 }), null);
  // Unknown fields never become authority: the normalized object is rebuilt.
  const withExtras = normalizePolicyBindingView({
    ...view,
    evidence_ref: "web:forged",
    policySlugOverride: "other-policy",
  });
  assert.ok(withExtras);
  assert.equal(Object.hasOwn(withExtras, "evidence_ref"), false);
  assert.equal(Object.hasOwn(withExtras, "policySlugOverride"), false);
});

test("the topic hint prefers the persisted binding over any client claim", () => {
  const view = projectPolicyBindingView(bindingRow());
  assert.deepEqual(
    resolveConversationPolicyTopic({
      binding: view,
      bindingSchemaAvailable: true,
      ownedConversation: true,
      clientSlug: "some-other-policy",
    }),
    { slug: view.policySlug, source: "binding", bindingAvailable: true }
  );
  // Before the binding schema is deployed, an owned conversation may still use a
  // syntactically valid requested slug so existing policy chats keep working.
  assert.deepEqual(
    resolveConversationPolicyTopic({
      binding: null,
      bindingSchemaAvailable: false,
      ownedConversation: true,
      clientSlug: "some-other-policy",
    }),
    {
      slug: "some-other-policy",
      source: "client_fallback",
      bindingAvailable: false,
    }
  );
  // A conversation the caller does not own never receives a client slug.
  assert.deepEqual(
    resolveConversationPolicyTopic({
      binding: null,
      bindingSchemaAvailable: false,
      ownedConversation: false,
      clientSlug: "some-other-policy",
    }),
    { slug: null, source: "none", bindingAvailable: false }
  );
  // An invalid slug is never a topic.
  assert.deepEqual(
    resolveConversationPolicyTopic({
      binding: null,
      bindingSchemaAvailable: false,
      ownedConversation: true,
      clientSlug: "not a slug",
    }),
    { slug: null, source: "none", bindingAvailable: false }
  );
  // Once the schema exists, a client slug with no stored binding is ignored.
  assert.deepEqual(
    resolveConversationPolicyTopic({
      binding: null,
      bindingSchemaAvailable: true,
      ownedConversation: true,
      clientSlug: "some-other-policy",
    }),
    { slug: null, source: "none", bindingAvailable: true }
  );
});

test("the launch key changes only when the launch identity changes", () => {
  const base = policyLaunchKey({
    chatId: null,
    launchIntent: "policy",
    policySlug: "policy-a",
  });
  assert.equal(
    base,
    policyLaunchKey({
      chatId: null,
      launchIntent: "policy",
      policySlug: "policy-a",
    })
  );
  assert.notEqual(
    base,
    policyLaunchKey({
      chatId: null,
      launchIntent: "policy",
      policySlug: "policy-b",
    })
  );
  assert.notEqual(
    base,
    policyLaunchKey({
      chatId: CHAT_ID,
      launchIntent: "policy",
      policySlug: "policy-a",
    })
  );
  assert.notEqual(
    base,
    policyLaunchKey({
      chatId: null,
      launchIntent: null,
      policySlug: "policy-a",
    })
  );
});

// --------------------------------------------------------------------------- #
// R1-2 — the model-side topic must survive unpublication and revision changes
// --------------------------------------------------------------------------- #

function bindingView() {
  return projectPolicyBindingView(bindingRow());
}

function liveReference(revision: number | null, publishedAt: string | null) {
  return {
    ...policyWorkspaceReferenceFromBinding(bindingView()),
    revision: {
      number: revision,
      publishedAt,
      sourceStatus: "in_force",
      snapshot: false,
    },
  };
}

test("R1: the topic survives the original publication being removed", () => {
  const text = buildConversationPolicyTopicContext({
    binding: bindingView(),
    current: null,
  });
  assert.ok(text);
  // The durable topic identity is still fully present for follow-up questions.
  assert.match(
    text,
    /Topic slug: evisitor-application-arrangements-lin-26-061/u
  );
  assert.match(
    text,
    /Topic title \(English\): eVisitor application arrangements/u
  );
  assert.match(text, /Topic title \(Chinese\): eVisitor 申请安排更新/u);
  assert.match(
    text,
    /Official source title: eVisitor application arrangements/u
  );
  assert.match(
    text,
    /Official source URL: https:\/\/immi\.homeaffairs\.gov\.au\/visas\/evisitor/u
  );
  assert.match(
    text,
    /Topic snapshot captured when this conversation was created: revision 3/u
  );
  assert.match(text, /publication status announced/u);
  // Unpublication is reported, not hidden.
  assert.match(text, /not currently available in the published index/u);
  // The snapshot is never presented as current law.
  assert.match(text, /never proof of current law and never legal evidence/u);
  assert.match(text, /could not be re-confirmed/u);
});

test("R1: a newer published revision is distinguished, never substituted", () => {
  const text = buildConversationPolicyTopicContext({
    binding: bindingView(),
    current: liveReference(5, "2026-10-20T00:00:00.000Z"),
  });
  assert.ok(text);
  assert.match(
    text,
    /Topic snapshot captured when this conversation was created: revision 3/u
  );
  assert.match(
    text,
    /Currently published revision of this topic \(separate from the conversation snapshot above\): revision 5, published 2026-10-20T00:00:00\.000Z/u
  );
  assert.match(
    text,
    /The topic has been revised since this conversation started/u
  );
  assert.match(text, /The conversation snapshot is not the current revision/u);
});

test("R1: an unchanged published revision is not reported as a change", () => {
  const text = buildConversationPolicyTopicContext({
    binding: bindingView(),
    current: liveReference(3, "2026-10-01T02:01:00.000Z"),
  });
  assert.ok(text);
  assert.match(text, /Currently published revision of this topic/u);
  assert.doesNotMatch(
    text,
    /has been revised since this conversation started/u
  );
});

test("R1: a snapshot reference is never mistaken for a live revision", () => {
  const text = buildConversationPolicyTopicContext({
    binding: bindingView(),
    // A snapshot-flagged reference carries no claim about the current revision.
    current: policyWorkspaceReferenceFromBinding(
      projectPolicyBindingView(bindingRow({ policyRevisionNumber: 9 }))
    ),
  });
  assert.ok(text);
  assert.doesNotMatch(
    text,
    /has been revised since this conversation started/u
  );
});

test("R1: unknown revision identity is stated honestly", () => {
  const text = buildConversationPolicyTopicContext({
    binding: projectPolicyBindingView(
      bindingRow({
        policyRevisionNumber: null,
        policyPublishedAt: null,
        policySourceStatus: null,
      })
    ),
    current: null,
  });
  assert.ok(text);
  assert.match(
    text,
    /revision unknown, publication date unavailable, publication status unavailable/u
  );
});

test("R1: an unusable binding produces no topic context at all", () => {
  assert.equal(
    buildConversationPolicyTopicContext({
      binding: projectPolicyBindingView(
        bindingRow({ policySlug: "NOT A SLUG" })
      ),
      current: null,
    }),
    null
  );
  assert.equal(
    buildConversationPolicyTopicContext({
      binding: projectPolicyBindingView(
        bindingRow({ officialUrl: "http://insecure.example.test/policy" })
      ),
      current: null,
    }),
    null
  );
  assert.equal(
    buildConversationPolicyTopicContext({
      binding: projectPolicyBindingView(bindingRow({ titleZh: "   " })),
      current: null,
    }),
    null
  );
});

test("R1: the topic entry is bounded, labelled and never evidence", () => {
  const noisyTitle =
    `A${String.fromCharCode(0)}title\nwith   control chars `.repeat(60);
  const entry = conversationPolicyTopicContextEntry({
    binding: projectPolicyBindingView(bindingRow({ titleEn: noisyTitle })),
    current: null,
  });
  assert.ok(entry);
  assert.equal(entry.role, "system");
  assert.equal(entry.policy_topic_reference, true);
  assert.equal(entry.id, "policy-topic-reference");
  assert.equal(entry.text.includes(String.fromCharCode(0)), false);
  assert.equal(entry.text.includes("evidence_ref"), false);
  assert.equal(entry.text.includes("canonical_source_id"), false);
  const englishLine = entry.text
    .split("\n")
    .find((line) => line.startsWith("Topic title (English):"));
  assert.ok(englishLine);
  assert.ok(englishLine.length <= "Topic title (English): ".length + 180);
});

test("R1: no binding means no topic entry", () => {
  assert.equal(
    conversationPolicyTopicContextEntry({ binding: null, current: null }),
    null
  );
});
