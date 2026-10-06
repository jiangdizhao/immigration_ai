import assert from "node:assert/strict";
import test from "node:test";
import {
  type AdminPolicyIntelligenceItem,
  type AdminPolicyIntelligenceService,
  type AdminPolicyIntelligenceSyncRun,
  handleAdminPolicyIntelligenceGet,
  handleAdminPolicyIntelligenceUpdate,
} from "./admin-api";
import { createInMemoryPolicyIntelligenceRepository } from "./memory-repository";

const itemId = "8f924f1d-c64d-4489-8d98-2c13a55608e2";
const adminAuth = async () => ({ userId: "admin-1" });
const deniedAuth = (status: number) => async () =>
  Response.json({ error: "Administrator access required." }, { status });

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
  const syncRun: AdminPolicyIntelligenceSyncRun & {
    metadata?: { sourceBody: string };
  } = {
    sourceConfigId: "home-affairs-guidance",
    status: "complete",
    startedAt: "2026-10-06T06:00:00.000Z",
    completedAt: "2026-10-06T06:00:01.000Z",
    discoveredCount: 10,
    snapshottedCount: 0,
    unchangedCount: 10,
    analyzedCount: 0,
    publishedCount: 0,
    heldCount: 0,
    failureCount: 0,
    safeErrorCode: "unsafe raw diagnostic text",
    metadata: { sourceBody: "must not be returned" },
  };
  const service: AdminPolicyIntelligenceService = {
    async listItems() {
      return [...records.values()];
    },
    listSourceSyncRuns() {
      return Promise.resolve([syncRun]);
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
  return { item, records, service, syncRun };
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
    async listItems() {
      calls++;
      return await service.listItems();
    },
    async listSourceSyncRuns() {
      calls++;
      return await service.listSourceSyncRuns();
    },
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
  const { service, syncRun } = setup();
  let calls = 0;
  const guardedService: AdminPolicyIntelligenceService = {
    ...service,
    async listItems() {
      calls++;
      return await service.listItems();
    },
    async listSourceSyncRuns() {
      calls++;
      return await service.listSourceSyncRuns();
    },
  };
  const denied = await handleAdminPolicyIntelligenceGet({
    requireAdmin: deniedAuth(403),
    service: guardedService,
  });
  assert.equal(denied.status, 403);
  assert.equal(calls, 0);

  const allowed = await handleAdminPolicyIntelligenceGet({
    requireAdmin: adminAuth,
    service: guardedService,
  });
  assert.equal(allowed.status, 200);
  const body = await allowed.json();
  assert.deepEqual(body, {
    items: [await service.listItems().then(([item]) => item)],
    sourceSyncRuns: [
      {
        sourceConfigId: syncRun.sourceConfigId,
        status: syncRun.status,
        startedAt: syncRun.startedAt,
        completedAt: syncRun.completedAt,
        discoveredCount: syncRun.discoveredCount,
        snapshottedCount: syncRun.snapshottedCount,
        unchangedCount: syncRun.unchangedCount,
        analyzedCount: syncRun.analyzedCount,
        publishedCount: syncRun.publishedCount,
        heldCount: syncRun.heldCount,
        failureCount: syncRun.failureCount,
        safeErrorCode: null,
      },
    ],
  });
  assert.equal(syncRun.status, "complete");
  assert.equal(body.sourceSyncRuns[0].safeErrorCode, null);
  assert.equal(body.items[0].sourceSyncDiagnostic, null);
  assert.equal(Object.hasOwn(body.sourceSyncRuns[0], "metadata"), false);
});

test("direct admin service projection sanitizes error codes before page consumption", async () => {
  const store = createInMemoryPolicyIntelligenceRepository();
  store.runs.set("unsafe-run", {
    id: "unsafe-run",
    sourceConfigId: "home-affairs-guidance",
    mode: "fixture",
    status: "complete",
    startedAt: "2026-10-06T06:00:00.000Z",
    completedAt: "2026-10-06T06:00:01.000Z",
    discoveredCount: 10,
    snapshottedCount: 0,
    unchangedCount: 10,
    analyzedCount: 0,
    publishedCount: 0,
    heldCount: 0,
    failureCount: 0,
    safeErrorCode: "unsafe raw diagnostic text",
    candidateFailures: [],
    analysisAttempts: [],
  });

  const [run] = await store.adminService.listSourceSyncRuns();
  assert.equal(run?.safeErrorCode, null);
  assert.equal(Object.hasOwn(run ?? {}, "metadata"), false);
  assert.deepEqual(Object.keys(run ?? {}).sort(), [
    "analyzedCount",
    "completedAt",
    "discoveredCount",
    "failureCount",
    "heldCount",
    "publishedCount",
    "safeErrorCode",
    "snapshottedCount",
    "sourceConfigId",
    "startedAt",
    "status",
    "unchangedCount",
  ]);
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
