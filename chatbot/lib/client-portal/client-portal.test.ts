import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeClientPortalIdentity,
  clientPortalRedirectForRole,
} from "./access";
import { getClientPortalCopy, getLawyerRequestStatusLabel } from "./copy";
import {
  groupOwnedConversations,
  portalGroupKey,
  preservePortalGroupSelection,
} from "./grouping";
import { fetchLegalMatterSnapshot } from "./matter-fetch";
import {
  buildClientPortalViewWithDependencies,
  type ClientPortalDependencies,
} from "./portal-builder";
import {
  projectLawyerRequests,
  projectMatterSnapshot,
  projectMembership,
  projectPortalDocuments,
} from "./projections";

const userId = "customer-a";
const at = (day: number) =>
  new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`);

function conversations(count: number, matterPrefix = "matter") {
  return Array.from({ length: count }, (_, index) => ({
    chatId: `chat-${index}`,
    legalMatterId: `${matterPrefix}-${index}`,
    title: `Matter ${index}`,
    createdAt: at(1),
    updatedAt: at(1 + (index % 25)),
  }));
}

function portalDependencies(
  overrides: Partial<ClientPortalDependencies> = {}
): ClientPortalDependencies {
  return {
    listConversations: async () => [
      {
        chatId: "portal-chat",
        legalMatterId: "portal-matter",
        title: "Portal conversation",
        createdAt: at(1),
        updatedAt: at(2),
      },
    ],
    listDocuments: async () => [],
    listLawyerRequests: async () => [],
    getEntitlement: async () => ({
      id: userId,
      role: "user",
      membershipTier: "vip",
      vipExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
    }),
    getConsultationCustomerIdentity: async () => ({
      id: userId,
      email: "person@example.test",
      role: "user",
      emailVerifiedAt: at(1),
    }),
    getSubscription: async () => null,
    fetchMatter: async () => null,
    ...overrides,
  } as unknown as ClientPortalDependencies;
}

function postgresError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

test("customer role boundary denies absent, guest, lawyer, and admin identities", () => {
  assert.deepEqual(authorizeClientPortalIdentity(null), {
    allowed: false,
    reason: "unauthenticated",
  });
  assert.deepEqual(
    authorizeClientPortalIdentity({ type: "guest", role: "user" }),
    { allowed: false, reason: "guest" }
  );
  assert.deepEqual(
    authorizeClientPortalIdentity({ type: "regular", role: "lawyer" }),
    { allowed: false, reason: "lawyer" }
  );
  assert.deepEqual(
    authorizeClientPortalIdentity({ type: "regular", role: "admin" }),
    { allowed: false, reason: "admin" }
  );
  assert.deepEqual(
    authorizeClientPortalIdentity({ type: "regular", role: "user" }),
    { allowed: true }
  );
  assert.equal(clientPortalRedirectForRole("lawyer"), "/lawyer-portal");
  assert.equal(clientPortalRedirectForRole("admin"), "/admin-portal");
  assert.equal(clientPortalRedirectForRole("user"), null);
});

test("exact legal matter IDs group, while same titles and null IDs remain separate", () => {
  const groups = groupOwnedConversations([
    {
      chatId: "chat-a",
      legalMatterId: "exact-id",
      title: "Same",
      updatedAt: at(1),
    },
    {
      chatId: "chat-b",
      legalMatterId: "exact-id",
      title: "Another",
      updatedAt: at(3),
    },
    {
      chatId: "chat-c",
      legalMatterId: "other-id",
      title: "Same",
      updatedAt: at(2),
    },
    { chatId: "chat-d", legalMatterId: null, title: "Same", updatedAt: at(4) },
    { chatId: "chat-e", legalMatterId: null, title: "Same", updatedAt: at(5) },
  ]);
  assert.equal(groups.length, 4);
  assert.equal(
    groups.find((group) => group.legalMatterId === "exact-id")?.conversations
      .length,
    2
  );
  assert.equal(
    groups.find((group) => group.groupKey === "chat:chat-d")?.provisional,
    true
  );
  assert.equal(portalGroupKey("chat-z", null), "chat:chat-z");
  assert.equal(portalGroupKey("chat-z", "matter-z"), "matter:matter-z");
});

test("portal refresh preserves the selected group when available and falls back to the first", () => {
  const groups = [{ groupKey: "matter:a" }, { groupKey: "chat:b" }];
  assert.equal(preservePortalGroupSelection(groups, "chat:b"), "chat:b");
  assert.equal(preservePortalGroupSelection(groups, "removed"), "matter:a");
  assert.equal(preservePortalGroupSelection([], "removed"), null);
});

test("most recently updated owned conversation continues a matter; groups are newest first", () => {
  const groups = groupOwnedConversations([
    { chatId: "old", legalMatterId: "m1", title: "Matter", updatedAt: at(1) },
    { chatId: "new", legalMatterId: "m1", title: "Matter", updatedAt: at(4) },
    {
      chatId: "newer-other",
      legalMatterId: null,
      title: "Other",
      updatedAt: at(5),
    },
  ]);
  assert.equal(groups[0].groupKey, "chat:newer-other");
  assert.equal(groups[1].defaultContinuationChatId, "new");
  assert.deepEqual(groups[1].latestActivityAt, at(4));
});

test("conversation and group bounds select newest records", () => {
  const rows = Array.from({ length: 90 }, (_, i) => ({
    chatId: `c${i}`,
    legalMatterId: `m${i}`,
    updatedAt: new Date(Date.UTC(2026, 8, 1 + i)),
  }));
  const groups = groupOwnedConversations(rows);
  assert.equal(groups.length, 50);
  assert.ok(
    groups.every((group) => Number(group.legalMatterId?.slice(1)) >= 10)
  );
  const conversationBound = groupOwnedConversations(
    rows.map((row) => ({ ...row, legalMatterId: "one-matter" })),
    { groupLimit: 100 }
  );
  assert.equal(conversationBound.length, 1);
  assert.equal(conversationBound[0].conversations.length, 80);
});

test("matter projection accepts only confirmed compact facts and structured unresolved slots", () => {
  const result = projectMatterSnapshot(
    {
      id: "matter-a",
      status: "FACT_GATHERING",
      issue_summary: "Summary",
      issue_type: "Student visa",
      visa_type: "500",
      risk_level: "high",
      metadata_json: {
        compact_state_v2: {
          confirmed_facts: {
            applicant_name: {
              value: "Kai",
              status: "confirmed",
              source_turn_id: "turn-1",
            },
            unsure: {
              value: "old value",
              status: "user_unsure",
              source_turn_id: "turn-2",
            },
            complex: {
              value: { secret: "omit" },
              status: "confirmed",
              source_turn_id: "turn-3",
            },
          },
        },
        fact_slot_states: [
          {
            fact_key: "arrival",
            label: "Arrival date",
            status: "missing",
            source: "unknown",
            value: "system guess",
            why_needed: "To plan next steps",
          },
          {
            fact_key: "work",
            label: "Work history",
            status: "conflicting",
            source: "llm_extraction",
            value: "model guess",
            value_display: "model display",
          },
          {
            fact_key: "address",
            label: "Address",
            status: "user_unsure",
            source: "user_input",
            value: "Example address",
            value_display: "Example address",
            required: true,
          },
        ],
        interaction_plan: {
          next_action: "ask_followup",
          progress: { collected_required: 2, total_required: 4 },
        },
        conversation_history: [{ content: "secret" }],
        research_ledger: [{ private: "secret" }],
      },
    },
    "matter-a",
    "en"
  );
  assert.ok(result);
  assert.deepEqual(result.confirmedFacts, [
    { factKey: "applicant_name", label: "applicant_name", valueDisplay: "Kai" },
  ]);
  assert.deepEqual(
    result.toConfirm.map((fact) => fact.factKey),
    ["arrival", "work", "address"]
  );
  assert.equal(result.toConfirm[0].valueDisplay, undefined);
  assert.equal(result.toConfirm[1].valueDisplay, undefined);
  assert.equal(result.toConfirm[2].valueDisplay, "Example address");
  assert.deepEqual(result.interactionProgress, {
    collectedRequired: 2,
    totalRequired: 4,
  });
  assert.equal(result.nextAction, "ask_followup");
  assert.equal("metadata_json" in result, false);
  assert.equal("riskLevel" in result, false);
  assert.equal(
    projectMatterSnapshot({ id: "other", status: "NEW" }, "matter-a", "en"),
    null
  );
  assert.equal(
    projectMatterSnapshot(
      { id: "matter-a", status: "NEW", metadata_json: {} },
      "matter-a",
      "en"
    )?.confirmedFacts.length,
    0
  );
});

test("matter confirmed and to-confirm fact limits are 12", () => {
  const facts = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [
      `f${i}`,
      { value: `v${i}`, status: "confirmed" },
    ])
  );
  const slots = Array.from({ length: 20 }, (_, i) => ({
    fact_key: `s${i}`,
    label: `Slot ${i}`,
    status: "missing",
  }));
  const result = projectMatterSnapshot(
    {
      id: "m",
      status: "NEW",
      metadata_json: {
        compact_state_v2: { confirmed_facts: facts },
        fact_slot_states: slots,
      },
    },
    "m",
    "en"
  );
  assert.equal(result?.confirmedFacts.length, 12);
  assert.equal(result?.toConfirm.length, 12);
});

test("document portal projection is stored-owner-chat aligned and strips all private fields", () => {
  const rows = [
    {
      id: "doc-a",
      userId,
      chatId: "chat-a",
      legalMatterId: "stale-matter",
      originalFilename: "passport.pdf",
      mimeType: "application/pdf",
      byteSize: 321,
      processingStatus: "complete" as const,
      securityStatus: "pending" as const,
      createdAt: at(1),
      updatedAt: at(2),
      storageKey: "secret",
      sha256: "hash",
      extractedText: "private body",
      storageStatus: "stored",
      deletedAt: null,
    },
    {
      id: "doc-foreign",
      userId: "other",
      chatId: "chat-a",
      legalMatterId: null,
      originalFilename: "foreign.pdf",
      mimeType: "application/pdf",
      byteSize: 1,
      processingStatus: "complete" as const,
      securityStatus: "clean" as const,
      createdAt: at(1),
      updatedAt: at(2),
    },
    {
      id: "doc-unlinked",
      userId,
      chatId: "unknown-chat",
      legalMatterId: null,
      originalFilename: "other.pdf",
      mimeType: "application/pdf",
      byteSize: 1,
      processingStatus: "complete" as const,
      securityStatus: "clean" as const,
      createdAt: at(1),
      updatedAt: at(2),
    },
  ];
  const result = projectPortalDocuments(rows, {
    userId,
    chatIds: new Set(["chat-a"]),
    groupLegalMatterIdByChat: new Map([["chat-a", "matter-owned"]]),
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].legalMatterId, "matter-owned");
  assert.equal(result[0].securityStatus, "pending");
  assert.deepEqual(
    Object.keys(result[0]).sort(),
    [
      "byteSize",
      "chatId",
      "createdAt",
      "documentId",
      "legalMatterId",
      "mimeType",
      "originalFilename",
      "processingStatus",
      "securityStatus",
      "updatedAt",
    ].sort()
  );
  assert.equal(JSON.stringify(result).includes("storageKey"), false);
  assert.equal(JSON.stringify(result).includes("sha256"), false);
  assert.equal(JSON.stringify(result).includes("extractedText"), false);
});

test("lawyer projection is owner/chat scoped, reports unread state, and prioritizes explicit requests", () => {
  const rows = [
    {
      id: "closed",
      userId,
      chatId: "chat-a",
      legalMatterId: "m",
      status: "closed",
      assignedLawyerUserId: null,
      customerLastViewedAt: at(5),
      createdAt: at(1),
      updatedAt: at(4),
      reviewedAt: at(4),
    },
    {
      id: "active",
      userId,
      chatId: "chat-a",
      legalMatterId: "m",
      status: "in_review",
      assignedLawyerUserId: "lawyer",
      customerLastViewedAt: at(1),
      createdAt: at(1),
      updatedAt: at(3),
      reviewedAt: null,
    },
    {
      id: "needs-info",
      userId,
      chatId: "chat-a",
      legalMatterId: "m",
      status: "needs_more_information",
      assignedLawyerUserId: null,
      customerLastViewedAt: at(1),
      createdAt: at(1),
      updatedAt: at(2),
      reviewedAt: null,
    },
    {
      id: "other-user",
      userId: "someone-else",
      chatId: "chat-a",
      legalMatterId: "m",
      status: "pending",
      assignedLawyerUserId: null,
      customerLastViewedAt: null,
      createdAt: at(1),
      updatedAt: at(6),
      reviewedAt: null,
    },
    {
      id: "chatless-owned-matter",
      userId,
      chatId: null,
      legalMatterId: "m",
      status: "pending",
      assignedLawyerUserId: null,
      customerLastViewedAt: null,
      createdAt: at(1),
      updatedAt: at(2),
      reviewedAt: null,
    },
    {
      id: "chatless-unowned-matter",
      userId,
      chatId: null,
      legalMatterId: "not-owned",
      status: "pending",
      assignedLawyerUserId: null,
      customerLastViewedAt: null,
      createdAt: at(1),
      updatedAt: at(2),
      reviewedAt: null,
    },
    {
      id: "other-chat",
      userId,
      chatId: "foreign-chat",
      legalMatterId: "m",
      status: "pending",
      assignedLawyerUserId: null,
      customerLastViewedAt: null,
      createdAt: at(1),
      updatedAt: at(6),
      reviewedAt: null,
    },
  ];
  const result = projectLawyerRequests(rows, {
    userId,
    chatIds: new Set(["chat-a"]),
    legalMatterIds: new Set(["m"]),
  });
  assert.deepEqual(
    result.map((request) => request.requestId),
    ["needs-info", "active", "chatless-owned-matter", "closed"]
  );
  assert.equal(result[0].unread, true);
  assert.equal(result[1].assigned, true);
  assert.equal(JSON.stringify(result).includes("questionSnapshot"), false);
  assert.equal(JSON.stringify(result).includes("messages"), false);
});

test("VIP projection covers free, active, expired and cancel-at-period-end states without provider fields", () => {
  const now = at(10);
  const free = projectMembership(
    {
      role: "user",
      membershipTier: "free",
      vipExpiresAt: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    },
    now
  );
  const active = projectMembership(
    {
      role: "user",
      membershipTier: "vip",
      vipExpiresAt: at(15),
      cancelAtPeriodEnd: true,
      currentPeriodEnd: at(15),
    },
    now
  );
  const expired = projectMembership(
    {
      role: "user",
      membershipTier: "vip",
      vipExpiresAt: at(5),
      cancelAtPeriodEnd: false,
      currentPeriodEnd: at(5),
    },
    now
  );
  assert.equal(free.premiumAllowed, false);
  assert.equal(active.active, true);
  assert.equal(active.cancelAtPeriodEnd, true);
  assert.equal(expired.expired, true);
  assert.equal("providerCustomerId" in active, false);
  assert.equal("subscriptionId" in active, false);
});

test("client portal copy includes Chinese default and English language", () => {
  assert.equal(getClientPortalCopy("zh-CN").title, "客户中心");
  assert.equal(getClientPortalCopy("en").title, "Client Portal");
  assert.equal(getClientPortalCopy("zh-CN").confirmed, "已确认信息");
  assert.equal(getClientPortalCopy("en").confirmed, "Confirmed by you");
  assert.equal(
    getClientPortalCopy("zh-CN").documentsUnavailableTitle,
    "材料功能暂不可用"
  );
  assert.equal(
    getClientPortalCopy("en").documentsUnavailableTitle,
    "Documents temporarily unavailable"
  );
  assert.match(
    getClientPortalCopy("zh-CN").documentsUnavailableDescription,
    /其他客户中心功能仍可使用/
  );
  assert.match(
    getClientPortalCopy("en").documentsUnavailableDescription,
    /Other Client Portal features remain usable/
  );
  for (const [status, zh, en] of [
    ["needs_more_information", "需要补充信息", "More information needed"],
    ["pending", "等待律师审核", "Awaiting lawyer review"],
    ["in_review", "律师审核中", "Lawyer review in progress"],
    ["confirmed", "律师审核已确认", "Lawyer review confirmed"],
    ["corrected", "已提供修正答复", "Corrected response provided"],
    ["closed", "请求已结束", "Request closed"],
  ]) {
    assert.equal(getLawyerRequestStatusLabel(status, "zh-CN"), zh);
    assert.equal(getLawyerRequestStatusLabel(status, "en"), en);
    assert.notEqual(getLawyerRequestStatusLabel(status, "zh-CN"), status);
    assert.notEqual(getLawyerRequestStatusLabel(status, "en"), status);
  }
  assert.equal(
    getLawyerRequestStatusLabel("unexpected_enum", "zh-CN"),
    "暂不可用"
  );
  assert.equal(
    getLawyerRequestStatusLabel("unexpected_enum", "en"),
    "Unavailable"
  );
});

test("portal service fetches only owned conversation matter IDs and keeps failed snapshots local", async () => {
  const callOrder: string[] = [];
  const requestedMatters: string[] = [];
  const sourceRows = [
    {
      chatId: "owned-chat",
      legalMatterId: "owned-matter",
      title: "Owned",
      createdAt: at(1),
      updatedAt: at(3),
    },
    {
      chatId: "owned-chat-null",
      legalMatterId: null,
      title: "Draft",
      createdAt: at(1),
      updatedAt: at(2),
    },
  ];
  const deps = {
    listConversations: ({ userId: owner }: { userId: string }) => {
      callOrder.push(`conversations:${owner}`);
      return sourceRows;
    },
    listDocuments: ({ chatIds }: { chatIds: string[] }) => {
      callOrder.push("documents");
      assert.deepEqual(
        new Set(chatIds),
        new Set(["owned-chat", "owned-chat-null"])
      );
      return [];
    },
    listLawyerRequests: () => {
      callOrder.push("requests");
      return [];
    },
    getEntitlement: () => {
      callOrder.push("entitlement");
      return {
        id: userId,
        role: "user",
        membershipTier: "free",
        vipExpiresAt: null,
      };
    },
    getSubscription: () => {
      callOrder.push("subscription");
      return null;
    },
    fetchMatter: (matterId: string) => {
      requestedMatters.push(matterId);
      if (matterId === "owned-matter") {
        throw new Error("bounded timeout");
      }
      return { id: matterId, status: "NEW", metadata_json: {} };
    },
  } as unknown as ClientPortalDependencies;
  const view = await buildClientPortalViewWithDependencies(
    {
      userId,
      email: "customer@example.test",
      requestedMatterId: "attacker-selected",
    } as { userId: string; email: string },
    "en",
    deps
  );
  assert.equal(callOrder[0], `conversations:${userId}`);
  assert.deepEqual(requestedMatters, ["owned-matter"]);
  assert.equal(
    view.matterGroups.find((group) => group.groupKey === "matter:owned-matter")
      ?.matterSnapshotUnavailable,
    true
  );
  assert.equal(
    view.matterGroups.find((group) => group.groupKey === "chat:owned-chat-null")
      ?.provisional,
    true
  );
  assert.equal(view.account.email, "customer@example.test");
});

test("portal service bounds concurrent legal-service calls at four", async () => {
  let active = 0;
  let peak = 0;
  const deps = {
    listConversations: () => conversations(12),
    listDocuments: () => [],
    listLawyerRequests: () => [],
    getEntitlement: () => ({
      id: userId,
      role: "user",
      membershipTier: "free",
      vipExpiresAt: null,
    }),
    getSubscription: () => null,
    fetchMatter: async (matterId: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { id: matterId, status: "NEW", metadata_json: {} };
    },
  } as unknown as ClientPortalDependencies;
  const view = await buildClientPortalViewWithDependencies(
    { userId, email: "a@b.test" },
    "en",
    deps
  );
  assert.equal(view.matterGroups.length, 12);
  assert.ok(peak <= 4);
  assert.ok(peak > 1);
});

test("legal matter fetch supports optional API keys and fails soft", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const successfulFetch = ((input, init) => {
    const url = String(input);
    requests.push({ url, init });
    return Response.json({
      id: url.endsWith("matter-b") ? "matter-b" : "matter-a",
      status: "NEW",
      metadata_json: {},
    });
  }) as typeof fetch;

  const keyed = await fetchLegalMatterSnapshot("matter-a", {
    baseUrl: "https://legal.example",
    apiKey: "service-secret",
    fetchImpl: successfulFetch,
  });
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    "https://legal.example/api/v1/matters/matter-a"
  );
  const keyedRequest = requests[0].init;
  assert.ok(keyedRequest);
  assert.equal(keyedRequest.method, "GET");
  assert.equal(keyedRequest.cache, "no-store");
  assert.ok(keyedRequest.signal instanceof AbortSignal);
  assert.equal(
    (keyedRequest.headers as Record<string, string>)["X-API-Key"],
    "service-secret"
  );
  assert.equal(
    projectMatterSnapshot(keyed, "matter-a", "en")?.matterId,
    "matter-a"
  );

  const unkeyed = await fetchLegalMatterSnapshot("matter-b", {
    baseUrl: "https://legal.example",
    fetchImpl: successfulFetch,
  });
  assert.equal(requests.length, 2, "missing key must still make the request");
  assert.deepEqual(requests[1].init?.headers, {});
  assert.equal(
    projectMatterSnapshot(unkeyed, "matter-b", "en")?.matterId,
    "matter-b"
  );

  for (const status of [401, 403, 404]) {
    assert.equal(
      await fetchLegalMatterSnapshot("matter-a", {
        baseUrl: "https://legal.example",
        apiKey: "secret",
        fetchImpl: (async () => new Response(null, { status })) as typeof fetch,
      }),
      null,
      `HTTP ${status} should fail soft`
    );
  }
  assert.equal(
    await fetchLegalMatterSnapshot("matter-a", {
      baseUrl: "https://legal.example",
      apiKey: "secret",
      fetchImpl: (async () =>
        new Response("not-json", { status: 200 })) as typeof fetch,
    }),
    null
  );
  assert.equal(
    await fetchLegalMatterSnapshot("matter-a", {
      baseUrl: "https://legal.example",
      apiKey: "secret",
      fetchImpl: (() =>
        Promise.reject(new Error("network failure"))) as typeof fetch,
    }),
    null
  );
  assert.equal(
    await fetchLegalMatterSnapshot("matter-a", {
      baseUrl: "https://legal.example",
      apiKey: "secret",
      timeoutMs: 1,
      fetchImpl: ((_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true }
          );
        })) as typeof fetch,
    }),
    null
  );
});

test("portal document query success returns an available authoritative count", async () => {
  const row = {
    id: "document-a",
    userId,
    chatId: "portal-chat",
    legalMatterId: "portal-matter",
    originalFilename: "identity.pdf",
    mimeType: "application/pdf",
    byteSize: 42,
    processingStatus: "complete" as const,
    securityStatus: "pending" as const,
    createdAt: at(1),
    updatedAt: at(2),
  };
  const view = await buildClientPortalViewWithDependencies(
    { userId, email: "person@example.test" },
    "en",
    portalDependencies({ listDocuments: async () => [row] })
  );
  assert.equal(view.documentsAvailable, true);
  assert.equal(view.summary.documentCount, 1);
  assert.equal(view.matterGroups[0].documents[0].documentId, "document-a");
});

test("MatterDocument undefined-table errors return a safe partial portal view", async () => {
  const request = {
    id: "request-a",
    userId,
    chatId: "portal-chat",
    legalMatterId: "portal-matter",
    status: "pending",
    assignedLawyerUserId: null,
    customerLastViewedAt: null,
    createdAt: at(1),
    updatedAt: at(2),
    reviewedAt: null,
  };
  const view = await buildClientPortalViewWithDependencies(
    { userId, email: "person@example.test" },
    "en",
    portalDependencies({
      listDocuments: () =>
        Promise.reject(
          postgresError("42P01", 'relation "MatterDocument" does not exist')
        ),
      listLawyerRequests: () => Promise.resolve([request]),
      fetchMatter: () => Promise.reject(new Error("legal service offline")),
    })
  );
  assert.equal(view.documentsAvailable, false);
  assert.equal(view.summary.documentCount, null);
  assert.equal(view.summary.conversationCount, 1);
  assert.equal(view.matterGroups[0].conversations[0].chatId, "portal-chat");
  assert.equal(view.matterGroups[0].matterSnapshotUnavailable, true);
  assert.equal(view.matterGroups[0].lawyerRequests[0].requestId, "request-a");
  assert.equal(view.membership.active, true);
  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes("MatterDocument"), false);
  assert.equal(serialized.includes("42P01"), false);
  assert.equal(serialized.includes("relation"), false);
  assert.equal(serialized.includes("0018"), false);
});

test("only the expected document schema SQLSTATEs fail soft", async () => {
  for (const error of [
    postgresError("42703", 'column "storageStatus" does not exist'),
    Object.assign(new Error('column "storageStatus" does not exist'), {
      cause: postgresError("42703", 'column "storageStatus" does not exist'),
    }),
  ]) {
    const view = await buildClientPortalViewWithDependencies(
      { userId, email: "person@example.test" },
      "zh-CN",
      portalDependencies({
        listDocuments: () => Promise.reject(error),
      })
    );
    assert.equal(view.documentsAvailable, false);
    assert.equal(view.summary.documentCount, null);
  }

  for (const error of [
    postgresError("08006", "database connection failed"),
    postgresError("42703", 'column "unexpectedColumn" does not exist'),
  ]) {
    const build = buildClientPortalViewWithDependencies(
      { userId, email: "person@example.test" },
      "en",
      portalDependencies({
        listDocuments: () => Promise.reject(error),
      })
    );
    await assert.rejects(build, error);
  }
});

test("consultation-unavailable portal preserves other data and never reports zero", async () => {
  const view = await buildClientPortalViewWithDependencies(
    { userId, email: "person@example.test" },
    "en",
    portalDependencies({
      getConsultationAvailability: async () => "unavailable",
      listConsultations: () => {
        return Promise.reject(new Error("must not query missing table"));
      },
    })
  );
  assert.equal(view.consultationState, "schema_unavailable");
  assert.deepEqual(view.consultations, []);
  assert.equal(view.summary.conversationCount, 1);
  assert.equal(view.documentsAvailable, true);
  assert.equal(view.membership.active, true);
});

test("Client Portal consultation summaries contain only safe fields", async () => {
  const view = await buildClientPortalViewWithDependencies(
    { userId, email: "person@example.test" },
    "en",
    portalDependencies({
      getConsultationAvailability: async () => "available",
      listConsultations: async () => [
        {
          consultationId: "request-id",
          status: "proposed",
          updatedAt: at(4),
          scheduledStartAt: at(5),
          scheduledEndAt: at(5),
          assigned: true,
        },
      ],
    })
  );
  assert.deepEqual(Object.keys(view.consultations[0]).sort(), [
    "assigned",
    "consultationId",
    "scheduledEndAt",
    "scheduledStartAt",
    "status",
    "updatedAt",
  ]);
  assert.equal(view.consultations[0].consultationId, "request-id");
});

test("verified customers may query consultation summaries when schema is available", async () => {
  let identityReads = 0;
  let availabilityReads = 0;
  let consultationReads = 0;
  const view = await buildClientPortalViewWithDependencies(
    { userId, email: "person@example.test" },
    "en",
    portalDependencies({
      getConsultationCustomerIdentity: () => {
        identityReads += 1;
        return Promise.resolve({
          id: userId,
          email: "person@example.test",
          role: "user",
          emailVerifiedAt: at(1),
        });
      },
      getConsultationAvailability: () => {
        availabilityReads += 1;
        return Promise.resolve("available");
      },
      listConsultations: () => {
        consultationReads += 1;
        return Promise.resolve([]);
      },
    })
  );
  assert.equal(view.consultationState, "available");
  assert.equal(identityReads, 1);
  assert.equal(availabilityReads, 1);
  assert.equal(consultationReads, 1);
});

test("unverified customers cannot trigger consultation availability or list reads while ordinary portal data remains", async () => {
  let availabilityReads = 0;
  let consultationReads = 0;
  const document = {
    id: "document-a",
    userId,
    chatId: "portal-chat",
    legalMatterId: "portal-matter",
    originalFilename: "identity.pdf",
    mimeType: "application/pdf",
    byteSize: 12,
    processingStatus: "complete" as const,
    securityStatus: "clean" as const,
    createdAt: at(1),
    updatedAt: at(2),
  };
  const request = {
    id: "request-a",
    userId,
    chatId: "portal-chat",
    legalMatterId: "portal-matter",
    status: "pending",
    assignedLawyerUserId: null,
    customerLastViewedAt: null,
    createdAt: at(1),
    updatedAt: at(2),
    reviewedAt: null,
  };
  const view = await buildClientPortalViewWithDependencies(
    { userId, email: "person@example.test" },
    "en",
    portalDependencies({
      getConsultationCustomerIdentity: async () => ({
        id: userId,
        email: "person@example.test",
        role: "user",
        emailVerifiedAt: null,
      }),
      getConsultationAvailability: () => {
        availabilityReads += 1;
        return Promise.resolve("available");
      },
      listConsultations: () => {
        consultationReads += 1;
        return Promise.resolve([]);
      },
      listDocuments: async () => [document] as never,
      listLawyerRequests: async () => [request] as never,
    })
  );
  assert.equal(view.consultationState, "verification_required");
  assert.equal(view.consultations.length, 0);
  assert.equal(availabilityReads, 0);
  assert.equal(consultationReads, 0);
  assert.equal(view.summary.conversationCount, 1);
  assert.equal(view.summary.documentCount, 1);
  assert.equal(view.summary.lawyerRequestCount, 1);
  assert.equal(view.matterGroups[0].documents[0].documentId, "document-a");
  assert.equal(view.matterGroups[0].lawyerRequests[0].requestId, "request-a");
  assert.equal(view.membership.active, true);
});

test("verified customer schema unavailability is distinct from verification required", async () => {
  const view = await buildClientPortalViewWithDependencies(
    { userId, email: "person@example.test" },
    "en",
    portalDependencies({
      getConsultationCustomerIdentity: () =>
        Promise.resolve({
          id: userId,
          email: "person@example.test",
          role: "user",
          emailVerifiedAt: at(1),
        }),
      getConsultationAvailability: async () => "unavailable",
      listConsultations: () =>
        Promise.reject(new Error("must not query unavailable table")),
    })
  );
  assert.equal(view.consultationState, "schema_unavailable");
  assert.notEqual(view.consultationState, "verification_required");
});
