import assert from "node:assert/strict";
import test from "node:test";
import {
  type AdminPolicyIntelligenceItem,
  type AdminPolicyIntelligenceService,
  handleAdminPolicyIntelligenceGet,
  handleAdminPolicyIntelligenceUpdate,
} from "./admin-api";

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
  const service: AdminPolicyIntelligenceService = {
    async listItems() {
      return [...records.values()];
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
