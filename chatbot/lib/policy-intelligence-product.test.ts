import assert from "node:assert/strict";
import test from "node:test";
import type { PolicyEntry } from "./policy-intelligence";
import {
  POLICY_ANALYSIS_SCHEMA,
  type PolicyAnalysis,
} from "./policy-intelligence/contracts";
import { policySchemaAvailableFromCatalogRows } from "./policy-intelligence/schema-availability-policy";
import {
  boundedPolicyPreview,
  buildPolicyTopicContext,
  currentPublicHistoryRows,
  diffPublishedPolicies,
  impactPolicyOrder,
  isPolicyLinkedConversation,
  type LivePolicyRecord,
  latestPolicyOrder,
  loadPolicyProductState,
  type PublicPolicyProduct,
  policyTopicContextEntry,
  policyWorkspaceHref,
  projectLivePolicy,
  projectPublicPolicyHistoryEntry,
  publicSourceFamily,
  resolvePublishedWorkspaceReference,
  shouldCreatePolicyWorkspaceConversation,
  workspaceGuestRedirectUrl,
} from "./policy-intelligence-product";
import {
  getPolicyProductCopy,
  getPublicImportanceLabel,
} from "./policy-intelligence-product-copy";

const bilingual = (zh: string, en: string) => ({ "zh-CN": zh, en });
function stage1Unit(id: string, zh = id, en = id): PolicyAnalysis["title"] {
  return {
    id,
    kind: "practical_interpretation",
    text: {
      "zh-CN": zh,
      en,
      claimRefs: ["claim-1"],
      uncertainty: bilingual(
        "PRIVATE LINKED UNCERTAINTY",
        "PRIVATE LINKED UNCERTAINTY"
      ),
    },
    evidenceRefs: ["private-evidence-ref"],
  };
}
type LivePolicyFixture = LivePolicyRecord & {
  sourceEvidence: { normalizedEvidence: string }[];
  sourceConfigId: string;
  sourceId: string;
  modelMetadata: { model: string };
  analysisFingerprint: string;
  analysis: PolicyAnalysis & {
    verification: { reasonCode: string; evidenceRefs: string[] }[];
  };
};
function livePolicy(
  overrides: Partial<LivePolicyFixture> = {}
): LivePolicyFixture {
  return {
    id: "internal-item-id",
    slug: "policy-update-one",
    sourceStatus: "announced",
    sourceEvidence: [{ normalizedEvidence: "PRIVATE RAW SOURCE" }],
    modelMetadata: { model: "PRIVATE MODEL" },
    analysisFingerprint: "PRIVATE FINGERPRINT",
    sourceConfigId: "home-affairs-guidance",
    sourceId: "PRIVATE SOURCE ID",
    source: {
      authority: "Department of Home Affairs",
      officialTitle: "Official page title",
      officialUrl: "https://immi.homeaffairs.gov.au/policy/update",
      sourceDate: null,
      effectiveDate: null,
      jurisdiction: "Australia",
      category: "home-affairs-guidance",
    },
    analysis: {
      schemaVersion: POLICY_ANALYSIS_SCHEMA,
      publicationEligibility: {
        id: "policy-relevance",
        classification: "policy_relevant",
        evidenceRefs: ["private-evidence-ref"],
      },
      title: stage1Unit("title", "政策标题", "Policy title"),
      executiveSummary: stage1Unit("summary", "摘要", "Summary"),
      keyChanges: [
        stage1Unit("change-a", "保留", "Keep"),
        stage1Unit("change-b", "旧文本", "Old text"),
      ],
      affectedGroups: [stage1Unit("group-a")],
      practicalImpacts: [stage1Unit("impact-a")],
      recommendedActions: [stage1Unit("action-a")],
      transitionInfo: null,
      uncertainties: [stage1Unit("uncertainty-a")],
      relatedSnapshotRefs: ["private-snapshot-ref"],
      sourceStatus: {
        id: "source-status",
        value: "announced",
        certain: true,
        claimRef: "claim-1",
        evidenceRefs: ["private-evidence-ref"],
      },
      materialClaims: [
        {
          id: "claim-1",
          kind: "source_fact",
          decisive: true,
          conditional: false,
          text: bilingual("内部主张", "Internal claim"),
          uncertainty: null,
          evidenceRefs: ["private-evidence-ref"],
        },
      ],
      importance: {
        serviceRelevance: 3,
        immediacy: 2,
        proceduralImpact: 4,
        affectedPopulation: 3,
        legalForce: "official_guidance",
      },
      verification: [
        {
          reasonCode: "PRIVATE VERIFIER REASON",
          evidenceRefs: ["private-evidence-ref"],
        },
      ],
    },
    revision: {
      number: 2,
      generatedAt: "2026-09-30T02:00:00.000Z",
      publishedAt: "2026-09-30T02:01:00.000Z",
    },
    ...overrides,
  };
}
function manualEntry(overrides: Partial<PolicyEntry> = {}): PolicyEntry {
  return {
    id: "manual-id",
    slug: "manual-policy",
    sourceStatus: "announced",
    editorialStatus: "published",
    origin: "manual",
    source: {
      authority: "Department of Home Affairs",
      officialTitle: "Manual source title",
      officialUrl: "https://immi.homeaffairs.gov.au/manual",
      sourceDate: "2026-01-01",
      jurisdiction: "Australia",
      category: "Manual category",
      officialExcerpt: { text: "Reviewed source quotation", language: "en" },
    },
    copy: {
      "zh-CN": {
        title: "人工标题",
        summary: "人工摘要",
        affectedGroup: "学生",
      },
      en: {
        title: "Manual title",
        summary: "Manual summary",
        affectedGroup: "Students",
      },
    },
    lawyerCommentary: null,
    ...overrides,
  };
}
function policy(
  overrides: Partial<LivePolicyFixture> = {}
): PublicPolicyProduct {
  return projectLivePolicy(livePolicy(overrides));
}

const allPresent = {
  itemRelation: '"PolicyIntelligenceItem"',
  snapshotRelation: '"PolicyIntelligenceSourceSnapshot"',
  revisionRelation: '"PolicyIntelligenceAnalysisRevision"',
  syncRunRelation: '"PolicyIntelligenceSyncRun"',
};

test("schema catalog recognizes the complete Stage 1 schema", () => {
  assert.equal(policySchemaAvailableFromCatalogRows([allPresent]), true);
});
test("schema catalog distinguishes absent schema from a partial migration", () => {
  assert.equal(
    policySchemaAvailableFromCatalogRows([
      {
        itemRelation: null,
        snapshotRelation: null,
        revisionRelation: null,
        syncRunRelation: null,
      },
    ]),
    false
  );
  assert.throws(
    () =>
      policySchemaAvailableFromCatalogRows([
        { ...allPresent, revisionRelation: null },
      ]),
    /schema_incomplete/
  );
  assert.throws(() => policySchemaAvailableFromCatalogRows([]), /availability/);
});
test("available schema makes live records canonical even when manual entries exist", async () => {
  let readCount = 0;
  const result = await loadPolicyProductState({
    checkSchema: async () => true,
    readLive: () => {
      readCount++;
      return Promise.resolve([livePolicy()]);
    },
    manualEntries: [manualEntry()],
  });
  assert.equal(readCount, 1);
  assert.equal(result.availability, "LIVE_AVAILABLE");
  assert.deepEqual(
    result.policies.map((x) => x.slug),
    ["policy-update-one"]
  );
});
test("unavailable schema uses published manual entries and never queries Stage 1 tables", async () => {
  let queried = false;
  const result = await loadPolicyProductState({
    checkSchema: async () => false,
    readLive: () => {
      queried = true;
      return Promise.reject(new Error("missing table queried"));
    },
    manualEntries: [
      manualEntry(),
      manualEntry({ id: "draft-id", slug: "draft", editorialStatus: "draft" }),
    ],
  });
  assert.equal(queried, false);
  assert.equal(result.availability, "LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK");
  assert.deepEqual(
    result.policies.map((x) => x.slug),
    ["manual-policy"]
  );
});
test("unavailable schema and empty manual registry is explicitly unavailable", async () => {
  const result = await loadPolicyProductState({
    checkSchema: async () => false,
    readLive: () => Promise.reject(new Error("must not query")),
    manualEntries: [],
  });
  assert.deepEqual(result, { availability: "LIVE_UNAVAILABLE", policies: [] });
});
test("available schema with zero live records serves reviewed manual fallback", async () => {
  const result = await loadPolicyProductState({
    checkSchema: async () => true,
    readLive: async () => [],
    manualEntries: [manualEntry()],
  });
  assert.equal(result.availability, "LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK");
  assert.deepEqual(
    result.policies.map((item) => item.slug),
    ["manual-policy"]
  );
  assert.equal(result.policies[0]?.origin, "manual");
});
test("unexpected availability and live read errors propagate without manual fallback", async () => {
  await assert.rejects(
    loadPolicyProductState({
      checkSchema: () => Promise.reject(new Error("catalog timeout")),
      readLive: async () => [],
      manualEntries: [manualEntry()],
    }),
    /catalog timeout/
  );
  await assert.rejects(
    loadPolicyProductState({
      checkSchema: async () => true,
      readLive: () => Promise.reject(new Error("permission denied")),
      manualEntries: [manualEntry()],
    }),
    /permission denied/
  );
});
test("automated public DTO excludes source text and backend/verifier/model metadata", () => {
  const dto = projectLivePolicy(livePolicy());
  const serialized = JSON.stringify(dto);
  for (const secret of [
    "PRIVATE RAW SOURCE",
    "PRIVATE MODEL",
    "PRIVATE FINGERPRINT",
    "PRIVATE SOURCE ID",
    "PRIVATE VERIFIER REASON",
    "PRIVATE LINKED UNCERTAINTY",
    "private-evidence-ref",
    "private-snapshot-ref",
    "normalizedEvidence",
    "sourceConfigId",
    "sourceId",
    "modelMetadata",
    "analysisFingerprint",
    "claimRefs",
    "evidenceRefs",
    "materialClaims",
    "publicationEligibility",
    "verification",
    "reasonCode",
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.equal(dto.officialExcerpt, null);
  assert.equal(dto.lawyerCommentary, null);
  assert.equal(dto.aiGenerated, true);
});
test("automated official URLs must be HTTPS and automated analysis cannot create provenance text", () => {
  const dto = projectLivePolicy(livePolicy());
  assert.equal(dto.source.officialUrl.startsWith("https://"), true);
  assert.equal(dto.officialExcerpt, null);
  assert.equal(dto.lawyerCommentary, null);
  assert.throws(
    () =>
      projectLivePolicy(
        livePolicy({
          source: { ...livePolicy().source, officialUrl: "http://example.com" },
        })
      ),
    /source_url/
  );
});
test("null source and effective dates stay null and localized labels state not provided", () => {
  const dto = projectLivePolicy(livePolicy());
  assert.equal(dto.source.sourceDate, null);
  assert.equal(dto.source.effectiveDate, null);
  assert.equal(getPolicyProductCopy("zh-CN").notStated, "未注明");
  assert.equal(getPolicyProductCopy("en").notStated, "Not stated");
});
test("all configured source families have distinct public labels and unknown IDs stay generic", () => {
  const sourceIds = [
    "home-affairs-guidance",
    "federal-register-legislation",
    "art-immigration-review",
  ];
  const labels = sourceIds.map(publicSourceFamily);
  for (const [index, sourceId] of sourceIds.entries()) {
    assert.equal(JSON.stringify(labels[index]).includes(sourceId), false);
  }
  assert.equal(new Set(labels.map((label) => label.en)).size, 3);
  assert.deepEqual(
    labels.map((label) => label.en),
    [
      "Department of Home Affairs guidance",
      "Federal Register of Legislation",
      "Administrative Review Tribunal immigration and citizenship reviews",
    ]
  );
  const unknown = publicSourceFamily("private-config-token");
  assert.equal(JSON.stringify(unknown).includes("private-config-token"), false);
  assert.equal(unknown.en, "Australian Government policy source");
});
test("manual fallback preserves only its reviewed excerpt and actual commentary", async () => {
  const entry = manualEntry({
    lawyerCommentary: { "zh-CN": "已提供的评论", en: "Provided commentary" },
  });
  const result = await loadPolicyProductState({
    checkSchema: async () => false,
    readLive: async () => [],
    manualEntries: [entry],
  });
  assert.equal(result.policies[0].origin, "manual");
  assert.equal(
    result.policies[0].officialExcerpt?.text,
    "Reviewed source quotation"
  );
  assert.equal(result.policies[0].lawyerCommentary?.en, "Provided commentary");
  assert.equal(result.policies[0].aiGenerated, false);
});
test("latest ordering is deterministic on publication time and slug", () => {
  const a = policy({
    slug: "a",
    revision: {
      number: 1,
      generatedAt: "2026-01-01",
      publishedAt: "2026-01-01T00:00:00Z",
    },
  });
  const b = policy({
    slug: "b",
    revision: {
      number: 1,
      generatedAt: "2026-01-01",
      publishedAt: "2026-01-01T00:00:00Z",
    },
  });
  const c = policy({
    slug: "c",
    revision: {
      number: 2,
      generatedAt: "2026-01-01",
      publishedAt: "2026-01-02T00:00:00Z",
    },
  });
  assert.deepEqual(
    [a, b, c].sort(latestPolicyOrder).map((x) => x.slug),
    ["c", "a", "b"]
  );
});
test("manual Latest ordering falls back to sourceDate without inventing publication dates", async () => {
  const older = manualEntry({
    id: "manual-older",
    slug: "manual-older",
    source: { ...manualEntry().source, sourceDate: "2026-01-01" },
  });
  const newer = manualEntry({
    id: "manual-newer",
    slug: "manual-newer",
    source: { ...manualEntry().source, sourceDate: "2026-04-01" },
  });
  const state = await loadPolicyProductState({
    checkSchema: async () => false,
    readLive: async () => [],
    manualEntries: [older, newer],
  });
  assert.deepEqual(
    state.policies.map((item) => item.slug),
    ["manual-newer", "manual-older"]
  );
  assert.equal(state.policies[0]?.revision.publishedAt, null);
});

test("impact ordering follows the documented dimensions and fixed legal-force rank", () => {
  const base = livePolicy().analysis.importance;
  const weak = policy({
    slug: "weak",
    analysis: {
      ...livePolicy().analysis,
      importance: { ...base, serviceRelevance: 2, legalForce: "legislation" },
    },
  });
  const relevant = policy({
    slug: "relevant",
    analysis: {
      ...livePolicy().analysis,
      importance: { ...base, serviceRelevance: 4, legalForce: "other" },
    },
  });
  const sameTupleLowerLawForce = policy({
    slug: "legal-force-low",
    analysis: {
      ...livePolicy().analysis,
      importance: { ...base, legalForce: "official_guidance" },
    },
  });
  const sameTupleHigherLawForce = policy({
    slug: "legal-force-high",
    analysis: {
      ...livePolicy().analysis,
      importance: { ...base, legalForce: "legislative_instrument" },
    },
  });
  assert.deepEqual(
    [weak, relevant, sameTupleLowerLawForce, sameTupleHigherLawForce]
      .sort(impactPolicyOrder)
      .map((x) => x.slug),
    ["relevant", "legal-force-high", "legal-force-low", "weak"]
  );
});
test("Home preview remains bounded to three items", () => {
  const policies = Array.from({ length: 5 }, (_, i) =>
    policy({
      id: `id-${i}`,
      slug: `item-${i}`,
      revision: {
        number: i + 1,
        generatedAt: "2026-01-01",
        publishedAt: `2026-01-0${i + 1}T00:00:00Z`,
      },
    })
  );
  const preview = boundedPolicyPreview({
    availability: "LIVE_AVAILABLE",
    policies,
  });
  assert.equal(preview.policies.length, 3);
  assert.deepEqual(
    preview.policies.map((x) => x.slug),
    ["item-4", "item-3", "item-2"]
  );
  const serialized = JSON.stringify(preview);
  for (const field of [
    "keyChanges",
    "importance",
    "officialUrl",
    "evidenceRefs",
    "sourceId",
    "normalizedEvidence",
  ]) {
    assert.equal(serialized.includes(field), false, field);
  }
  assert.equal("analysis" in (preview.policies[0] ?? {}), false);
  assert.equal("sourceDate" in (preview.policies[0]?.source ?? {}), true);
});
test("public history projection retains rendered metadata and strips historical analysis", () => {
  const history = projectPublicPolicyHistoryEntry(policy(), "superseded");
  assert.deepEqual(history, {
    revisionNumber: 2,
    publishedAt: "2026-09-30T02:01:00.000Z",
    editorialStatus: "superseded",
    title: { "zh-CN": "政策标题", en: "Policy title" },
  });
  const serialized = JSON.stringify(history);
  for (const field of [
    "keyChanges",
    "materialClaims",
    "evidenceRefs",
    "officialUrl",
    "importance",
    "normalizedEvidence",
  ]) {
    assert.equal(serialized.includes(field), false, field);
  }
});

test("published history excludes draft, review-required, held, and unpublished rows", () => {
  const item = {
    id: "item",
    editorialStatus: "published",
    latestSnapshotId: "snap-2",
    latestPublishedRevisionId: "rev-2",
  };
  const join = (
    id: string,
    status: string,
    snapshotId: string,
    snapshotItemId = "item",
    publishedAt: Date | null = new Date()
  ) => ({
    item,
    revision: {
      id,
      itemId: "item",
      snapshotId,
      editorialStatus: status,
      revisionNumber: id === "rev-2" ? 2 : 1,
      publishedAt,
    },
    snapshot: { id: snapshotId, itemId: snapshotItemId },
  });
  const rows = [
    join("rev-2", "published", "snap-2"),
    join("rev-1", "superseded", "snap-1"),
    join("draft", "draft", "snap-2"),
    join("held", "review_required", "snap-2"),
    join("foreign", "superseded", "snap-3", "other"),
  ];
  const visible = currentPublicHistoryRows(rows);
  assert.deepEqual(
    visible?.map((x) => x.revision.id),
    ["rev-2", "rev-1"]
  );
});
test("a held latest snapshot prevents old revisions from returning as current history", () => {
  const item = {
    id: "item",
    editorialStatus: "review_required",
    latestSnapshotId: "snap-2",
    latestPublishedRevisionId: "rev-1",
  };
  const row = {
    item,
    revision: {
      id: "rev-1",
      itemId: "item",
      snapshotId: "snap-1",
      editorialStatus: "published",
      revisionNumber: 1,
      publishedAt: new Date(),
    },
    snapshot: { id: "snap-1", itemId: "item" },
  };
  assert.equal(currentPublicHistoryRows([row]), null);
});
test("deterministic diff detects stable-id additions, removals, and content changes", () => {
  const before = policy();
  const next = policy({
    analysis: {
      ...livePolicy().analysis,
      keyChanges: [
        stage1Unit("change-a", "保留", "Keep"),
        stage1Unit("change-b", "新文本", "New text"),
        stage1Unit("change-c", "新增", "Added"),
      ],
      affectedGroups: [],
      transitionInfo: stage1Unit("transition", "新过渡", "New transition"),
    },
  });
  const changes = diffPublishedPolicies(next, before);
  assert.deepEqual(
    changes
      .filter((x) => x.section === "keyChanges")
      .map((x) => [x.unitId, x.kind]),
    [
      ["change-b", "changed"],
      ["change-c", "added"],
    ]
  );
  assert.ok(
    changes.some((x) => x.section === "affectedGroups" && x.kind === "removed")
  );
  assert.ok(
    changes.some((x) => x.section === "transitionInfo" && x.kind === "added")
  );
});
test("no previous public revision yields no diff and diff output is bounded", () => {
  const current = policy({
    analysis: {
      ...livePolicy().analysis,
      keyChanges: Array.from({ length: 8 }, (_, i) => stage1Unit(`new-${i}`)),
    },
  });
  assert.deepEqual(diffPublishedPolicies(current, null), []);
  const previous = policy({
    analysis: { ...livePolicy().analysis, keyChanges: [] },
  });
  assert.equal(diffPublishedPolicies(current, previous, 2).length, 2);
  assert.equal(
    diffPublishedPolicies(current, previous, 1000).length <= 64,
    true
  );
});
test("public importance labels are bounded and localized without numeric scores", () => {
  const dimensions = [
    "serviceRelevance",
    "immediacy",
    "proceduralImpact",
    "affectedPopulation",
  ] as const;
  for (const locale of ["zh-CN", "en"] as const) {
    for (const dimension of dimensions) {
      const labels = [1, 2, 3, 4, 5].map((value) =>
        getPublicImportanceLabel(dimension, value, locale)
      );
      assert.equal(new Set(labels).size, 5);
      for (const label of labels) {
        assert.ok(label.trim().length > 0);
        assert.equal(
          /\b[1-5]\b|\/\s*5|confidence|probability|certainty/iu.test(label),
          false
        );
      }
    }
  }
  assert.equal(getPolicyProductCopy("zh-CN").sourceStatus, "公开分组");
  assert.equal(getPolicyProductCopy("en").sourceStatus, "Public group");
  assert.throws(
    () => getPublicImportanceLabel("immediacy", 6, "en"),
    /out_of_range/
  );
});

test("both locales contain labels for every new section and feed state", () => {
  for (const locale of ["zh-CN", "en"] as const) {
    const copy = getPolicyProductCopy(locale);
    for (const value of [
      copy.aiLabel,
      copy.aiDisclaimer,
      copy.officialSource,
      copy.lawyerCommentary,
      copy.lawyerAbsent,
      copy.notStated,
      copy.keyChanges,
      copy.affectedGroups,
      copy.practicalImpacts,
      copy.recommendedActions,
      copy.transitionInfo,
      copy.uncertainties,
      copy.importance,
      copy.history,
      copy.diff,
      copy.askAi,
      copy.continuityNotice,
      copy.workspaceOpener,
    ]) {
      assert.ok(value.trim().length > 0);
    }
    for (const state of [
      "LIVE_AVAILABLE",
      "LIVE_AVAILABLE_EMPTY",
      "LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK",
      "LIVE_UNAVAILABLE",
    ] as const) {
      assert.ok(
        copy.availability[state] && copy.availabilityDescription[state]
      );
    }
  }
});
test("policy workspace URL carries a one-time launch marker through guest auth", () => {
  const href = policyWorkspaceHref("policy-update-one");
  assert.equal(href, "/ai-workspace?policy=policy-update-one&launch=policy");
  assert.deepEqual(
    [...new URL(href, "https://example.test").searchParams.keys()],
    ["policy", "launch"]
  );
  assert.equal(workspaceGuestRedirectUrl("policy-update-one"), href);
  assert.equal(
    workspaceGuestRedirectUrl(
      "policy-update-one",
      null,
      "01234567-89ab-cdef-0123-456789abcdef"
    ),
    "/ai-workspace?policy=policy-update-one&chatId=01234567-89ab-cdef-0123-456789abcdef"
  );
  assert.equal(policyWorkspaceHref("../title?analysis=x"), "/ai-workspace");
  assert.equal(
    workspaceGuestRedirectUrl("../title?analysis=x"),
    "/ai-workspace"
  );
});
test("policy launch creates once only for a resolved launch without chatId", () => {
  const policyReference = {
    slug: "policy-update-one",
    title: { "zh-CN": "政策标题", en: "Policy title" },
    officialTitle: "Official page title",
    officialUrl: "https://example.gov.au/policy",
  };
  assert.equal(
    shouldCreatePolicyWorkspaceConversation({
      policyReference,
      launchIntent: "policy",
      chatId: null,
    }),
    true
  );
  assert.equal(
    shouldCreatePolicyWorkspaceConversation({
      policyReference,
      launchIntent: null,
      chatId: "chat-1",
    }),
    false
  );
  assert.equal(
    shouldCreatePolicyWorkspaceConversation({
      policyReference: null,
      launchIntent: "policy",
      chatId: null,
    }),
    false
  );
  assert.equal(
    shouldCreatePolicyWorkspaceConversation({
      policyReference,
      launchIntent: "policy",
      chatId: "chat-1",
    }),
    false
  );
  assert.equal(
    isPolicyLinkedConversation("chat-1", "chat-1", policyReference),
    true
  );
  assert.equal(
    isPolicyLinkedConversation("chat-2", "chat-1", policyReference),
    false
  );
  assert.equal(isPolicyLinkedConversation("chat-1", "chat-1", null), false);
});
test("policy topic context contains only bounded public reference fields", () => {
  const reference = {
    slug: "policy-update-one",
    title: {
      "zh-CN": `中文${"标".repeat(250)}`,
      en: `Policy ${"title ".repeat(40)}`,
    },
    officialTitle: `Official ${"title ".repeat(50)}`,
    officialUrl: "https://example.gov.au/policy",
  };
  const context = buildPolicyTopicContext(reference);
  assert.ok(context);
  assert.ok(context.includes("Topic reference only"));
  assert.ok(context.includes("https://example.gov.au/policy"));
  assert.ok(context.length < 1400);
  assert.equal(
    policyTopicContextEntry(reference)?.policy_topic_reference,
    true
  );
  assert.equal(buildPolicyTopicContext(null), null);
  assert.equal(
    buildPolicyTopicContext({
      ...reference,
      officialUrl: "http://example.gov.au",
    }),
    null
  );
  assert.equal(
    buildPolicyTopicContext({ ...reference, slug: "../private" }),
    null
  );
});
test("server resolution accepts only a current published policy returned for the requested slug", async () => {
  const current = policy();
  const ref = await resolvePublishedWorkspaceReference(
    current.slug,
    async (slug) => (slug === current.slug ? current : null)
  );
  assert.deepEqual(ref, {
    slug: current.slug,
    title: current.copy["zh-CN"]
      ? { "zh-CN": current.copy["zh-CN"].title, en: current.copy.en.title }
      : bilingual("", ""),
    officialTitle: current.source.officialTitle,
    officialUrl: current.source.officialUrl,
  });
  assert.equal(
    await resolvePublishedWorkspaceReference("held-policy", async () => null),
    null
  );
  assert.equal(
    await resolvePublishedWorkspaceReference("bad/slug", async () => current),
    null
  );
});
test("unknown or held policy cannot produce topic continuity and reference has no legal evidence fields", async () => {
  assert.equal(
    await resolvePublishedWorkspaceReference("unknown", async () => null),
    null
  );
  const reference = await resolvePublishedWorkspaceReference(
    "policy-update-one",
    async () =>
      policy({
        revision: { number: 2, generatedAt: "2026-01-01", publishedAt: null },
      })
  );
  assert.equal(reference, null);
  const current = await resolvePublishedWorkspaceReference(
    "policy-update-one",
    async () => policy()
  );
  const serialized = JSON.stringify(current);
  for (const field of [
    "known_facts",
    "officialEvidence",
    "citations",
    "analysis",
    "normalizedEvidence",
    "sourceConfigId",
  ]) {
    assert.equal(serialized.includes(field), false);
  }
});
