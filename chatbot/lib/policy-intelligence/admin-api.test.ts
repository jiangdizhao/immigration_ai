import assert from "node:assert/strict";
import test from "node:test";
import {
  type AdminPolicyIntelligenceItem,
  type AdminPolicyIntelligenceService,
  handleAdminPolicyIntelligenceDetailGet,
  handleAdminPolicyIntelligenceGet,
  handleAdminPolicyIntelligenceUpdate,
} from "./admin-api";
import {
  POLICY_ANALYSIS_SCHEMA,
  POLICY_VERIFICATION_SCHEMA,
  type PolicyAnalysis,
  type PolicyVerification,
} from "./contracts";
import { buildAdminPolicyRevisionDetail } from "./admin-revision-detail";

const itemId = "8f924f1d-c64d-4489-8d98-2c13a55608e2";
const adminAuth = async () => ({ userId: "admin-1" });
const deniedAuth = (status: number) => async () =>
  Response.json({ error: "Administrator access required." }, { status });

const detailItem = {
  id: itemId,
  slug: "policy-example",
  sourceConfigId: "home-affairs-guidance",
  sourceStatus: "announced",
  editorialStatus: "review_required",
  latestSnapshotId: "f36b469f-1972-4aad-91e6-911cbe57b80e",
};
const detailSnapshot = {
  id: detailItem.latestSnapshotId,
  itemId,
  canonicalUrl: "https://immi.homeaffairs.gov.au/policy/example",
  officialTitle: "Policy example",
  retrievedAt: "2026-10-01T00:00:00.000Z",
  sourceDate: null,
  effectiveDate: null,
  evidenceTruncated: false,
  sourceId: "source-1",
  authority: "Department of Home Affairs",
  contentHash: "a".repeat(64),
  normalizedEvidence: "private source body",
  sourceMetadata: { syncSecret: "private sync secret" },
};
const ref = `policy-snapshot:${detailSnapshot.id}`;
const bilingualText = { "zh-CN": "经核实的说明。", en: "A verified statement." };
const narrative = (id: string) => ({
  id,
  kind: "source_fact" as const,
  text: { ...bilingualText, claimRefs: ["claim-1"], uncertainty: null },
  evidenceRefs: [ref],
});
const analysis: PolicyAnalysis = {
  schemaVersion: POLICY_ANALYSIS_SCHEMA,
  publicationEligibility: {
    id: "policy-relevance",
    classification: "policy_relevant",
    evidenceRefs: [ref],
  },
  title: narrative("title"),
  executiveSummary: narrative("executive-summary"),
  keyChanges: [narrative("change-1")],
  affectedGroups: [narrative("group-1")],
  practicalImpacts: [narrative("impact-1")],
  recommendedActions: [],
  transitionInfo: null,
  uncertainties: [],
  relatedSnapshotRefs: [],
  sourceStatus: {
    id: "source-status",
    value: "announced",
    certain: true,
    claimRef: "claim-1",
    evidenceRefs: [ref],
  },
  materialClaims: [
    {
      id: "claim-1",
      kind: "source_fact",
      decisive: true,
      conditional: false,
      text: bilingualText,
      uncertainty: null,
      evidenceRefs: [ref],
    },
  ],
  importance: {
    affectedPopulation: 2,
    legalForce: "official_guidance",
    immediacy: 2,
    serviceRelevance: 3,
    proceduralImpact: 2,
  },
};
const verification: PolicyVerification = {
  schemaVersion: POLICY_VERIFICATION_SCHEMA,
  assessments: [
    ...[
      "claim-1",
      "title",
      "executive-summary",
      "change-1",
      "group-1",
      "impact-1",
      "policy-relevance",
      "source-status",
    ].map((unitId) => ({
      unitId,
      verdict: "supported" as const,
      evidenceRefs: [ref],
      reasonCode: "direct_support" as const,
    })),
  ],
};
const detailRevision = {
  id: "57a384f5-b588-462b-a4b3-57d4b4898a99",
  itemId,
  snapshotId: detailSnapshot.id,
  revisionNumber: 1,
  generatedAt: "2026-10-01T00:10:00.000Z",
  editorialStatus: "review_required",
  analysisFingerprint: "b".repeat(64),
  analysis,
  verification,
  modelMetadata: {
    provider: "openai",
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    timeoutMs: 90_000,
    maxOutputTokens: 8000,
    analyzerVersion: "policy-intelligence.analyzer.v2.1",
    verifierVersion: "policy-intelligence.verifier.v2.1",
    apiKey: "private-key-value",
    prompt: "private prompt value",
    rawProviderResponse: "private provider body",
  },
  prompt: "private stored prompt",
  rawProviderRequest: "private stored request",
  rawProviderResponse: "private stored response",
  stackTrace: "private stored stack trace",
};

function revisionDetail(revision: typeof detailRevision | null = detailRevision) {
  return buildAdminPolicyRevisionDetail({
    item: detailItem,
    snapshot: detailSnapshot,
    revision,
  });
}

function setup() {
  const item: AdminPolicyIntelligenceItem = {
    id: itemId,
    slug: "policy-example",
    title: "Policy example",
    authority: "Department of Home Affairs",
    sourceConfigId: "home-affairs-guidance",
    sourceStatus: "announced",
    editorialStatus: "published",
    publishedAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    latestSnapshot: {
      sourceUrl: "https://immi.homeaffairs.gov.au/policy/example",
      retrievedAt: "2026-10-01T00:00:00.000Z",
      sourceTitle: "Policy example",
    },
    latestRevision: {
      revisionNumber: 2,
      generatedAt: "2026-10-01T00:00:00.000Z",
      editorialStatus: "published",
    },
    pipelineFailures: [],
    analysisAttempts: [],
    sourceSyncDiagnostic: null,
    publicationDiagnostics: { published: true, reasons: [] },
  };
  const records = new Map([[itemId, item]]);
  const service: AdminPolicyIntelligenceService = {
    async listItems() {
      return [...records.values()];
    },
    async getRevisionDetail() {
      return revisionDetail();
    },
    async updateItem(id, action) {
      const current = records.get(id);
      if (!current) {
        return { status: "not_found" };
      }
      if (action === "restore" && current.editorialStatus !== "archived") {
        return { status: "not_archived" };
      }
      current.editorialStatus = action === "archive" ? "archived" : "published";
      return {
        status: "updated",
        editorialStatus: current.editorialStatus as "archived" | "published",
      };
    },
  };
  return { item, records, service };
}

function actionRequest(action: "archive" | "restore") {
  return new Request("http://localhost/api/admin/policy-intelligence", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, action }),
  });
}

test("admin can archive/unpublish and restore a durable policy item", async () => {
  const { item, service } = setup();
  const archived = await handleAdminPolicyIntelligenceUpdate({
    requireAdmin: adminAuth,
    service,
    request: actionRequest("archive"),
  });
  assert.equal(archived.status, 200);
  assert.equal(item.editorialStatus, "archived");

  const restored = await handleAdminPolicyIntelligenceUpdate({
    requireAdmin: adminAuth,
    service,
    request: actionRequest("restore"),
  });
  assert.equal(restored.status, 200);
  assert.equal(item.editorialStatus, "published");
});

test("non-admin cannot archive or restore and the service is not called", async () => {
  const { service } = setup();
  let calls = 0;
  const guardedService: AdminPolicyIntelligenceService = {
    ...service,
    async updateItem(...args) {
      calls++;
      return await service.updateItem(...args);
    },
  };

  for (const status of [401, 403]) {
    const response = await handleAdminPolicyIntelligenceUpdate({
      requireAdmin: deniedAuth(status),
      service: guardedService,
      request: actionRequest("archive"),
    });
    assert.equal(response.status, status);
  }
  assert.equal(calls, 0);
});

test("admin listing is authenticated and returns only management fields", async () => {
  const { service } = setup();
  const denied = await handleAdminPolicyIntelligenceGet({
    requireAdmin: deniedAuth(403),
    service,
  });
  assert.equal(denied.status, 403);

  const allowed = await handleAdminPolicyIntelligenceGet({
    requireAdmin: adminAuth,
    service,
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), {
    items: [await service.listItems().then(([item]) => item)],
  });
});

test("admin can read full current revision detail without provider secrets", async () => {
  const { service } = setup();
  const response = await handleAdminPolicyIntelligenceDetailGet({
    requireAdmin: adminAuth,
    service,
    itemId,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.item, {
    id: itemId,
    slug: detailItem.slug,
    sourceConfigId: detailItem.sourceConfigId,
    sourceStatus: detailItem.sourceStatus,
    editorialStatus: detailItem.editorialStatus,
  });
  assert.deepEqual(body.snapshot, {
    id: detailSnapshot.id,
    sourceUrl: detailSnapshot.canonicalUrl,
    sourceTitle: detailSnapshot.officialTitle,
    retrievedAt: detailSnapshot.retrievedAt,
    sourceDate: null,
    effectiveDate: null,
    evidenceTruncated: false,
  });
  assert.deepEqual(body.revision.analysis, analysis);
  assert.deepEqual(body.revision.verification, verification);
  assert.equal(body.revision.revisionNumber, 1);
  assert.equal(body.revision.modelMetadata.model, "gpt-5.6-sol");
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(
    serialized,
    /private-key-value|private prompt value|private provider body|private source body|private sync secret|private stored prompt|private stored request|private stored response|private stored stack trace/
  );
  assert.equal("normalizedEvidence" in body.snapshot, false);
});

test("revision detail denies non-admin users before reading the service", async () => {
  const { service } = setup();
  let calls = 0;
  const guardedService: Pick<AdminPolicyIntelligenceService, "getRevisionDetail"> = {
    async getRevisionDetail(id) {
      calls++;
      return await service.getRevisionDetail(id);
    },
  };
  const response = await handleAdminPolicyIntelligenceDetailGet({
    requireAdmin: deniedAuth(403),
    service: guardedService,
    itemId,
  });
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});

test("revision detail rejects malformed UUID and returns 404 for a missing item", async () => {
  let calls = 0;
  const guardedService: Pick<AdminPolicyIntelligenceService, "getRevisionDetail"> = {
    async getRevisionDetail() {
      calls++;
      return null;
    },
  };
  const invalid = await handleAdminPolicyIntelligenceDetailGet({
    requireAdmin: adminAuth,
    service: guardedService,
    itemId: "not-a-uuid",
  });
  assert.equal(invalid.status, 400);
  assert.equal(calls, 0);
  const missing = await handleAdminPolicyIntelligenceDetailGet({
    requireAdmin: adminAuth,
    service: { getRevisionDetail: async () => null },
    itemId: "b7f0a4b1-31d1-40ef-8d3d-09da5cb9b047",
  });
  assert.equal(missing.status, 404);
});

test("latest snapshot without a revision returns a safe nullable revision", async () => {
  const { service } = setup();
  const response = await handleAdminPolicyIntelligenceDetailGet({
    requireAdmin: adminAuth,
    service: {
      getRevisionDetail: async () => revisionDetail(null),
    },
    itemId,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.revision, null);
  assert.equal(body.snapshot.id, detailSnapshot.id);
  assert.equal(Array.isArray(body.publicationDiagnostics.reasons), true);
});

test("revision detail fails closed when snapshot or revision ownership mismatches", () => {
  assert.equal(
    buildAdminPolicyRevisionDetail({
      item: detailItem,
      snapshot: { ...detailSnapshot, id: "older-snapshot" },
      revision: detailRevision,
    }),
    null
  );
  assert.equal(
    buildAdminPolicyRevisionDetail({
      item: detailItem,
      snapshot: detailSnapshot,
      revision: { ...detailRevision, itemId: "another-item" },
    }),
    null
  );
  assert.equal(
    buildAdminPolicyRevisionDetail({
      item: detailItem,
      snapshot: detailSnapshot,
      revision: {
        ...detailRevision,
        snapshotId: "older-snapshot",
        editorialStatus: "published",
      },
    }),
    null
  );
});

test("invalid action request is rejected without changing item state", async () => {
  const { item, service } = setup();
  const response = await handleAdminPolicyIntelligenceUpdate({
    requireAdmin: adminAuth,
    service,
    request: new Request("http://localhost/api/admin/policy-intelligence", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, action: "publish" }),
    }),
  });
  assert.equal(response.status, 400);
  assert.equal(item.editorialStatus, "published");
});
