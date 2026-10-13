import assert from "node:assert/strict";
import test from "node:test";
import {
  POLICY_HUMAN_REVISION_SCHEMA,
  POLICY_SOURCE_FIRST_SCHEMA,
  type PolicyHumanRevisionContent,
} from "./contracts";
import {
  type EditorialActorResolver,
  handleAdminPolicyItemAction,
  handleArchivePolicyItem,
  handleCreateManualDraft,
  handleCreateManualRevision,
  handleDraftHistoryGet,
  handleEditorialWorkspaceGet,
  handleForcePublishOverride,
  handleOperatorSubmissionCreate,
  handleOperatorSubmissionList,
  handlePolicyEditorGrantsGet,
  handlePolicyEditorGrantUpdate,
  handlePublishManualDraft,
  handlePublishOfficialSource,
  handleReleasePublicationProtection,
  handleRestorePolicyItem,
  handleSaveManualDraft,
} from "./editorial-api";
import {
  createInMemoryEditorialRepository,
  createInMemoryEditorialStore,
  createInMemoryOperatorSubmissionRepository,
  createInMemoryOperatorSubmissionStore,
  seedEditorialActor,
  seedEditorialGrant,
  seedEditorialSourceSnapshot,
} from "./editorial-memory";
import { createPolicyEditorialService } from "./editorial-service";
import { createOperatorSubmissionService } from "./operator-submission";

const VERIFIED_AT = new Date("2026-09-01T00:00:00.000Z");
const admin = {
  userId: "user-admin",
  role: "admin" as const,
  email: "admin@example.test",
  emailVerifiedAt: VERIFIED_AT,
};
const editor = {
  userId: "user-editor",
  role: "lawyer" as const,
  email: "editor@example.test",
  emailVerifiedAt: VERIFIED_AT,
};
const plainLawyer = {
  userId: "user-lawyer",
  role: "lawyer" as const,
  email: "lawyer@example.test",
  emailVerifiedAt: VERIFIED_AT,
};
const unverifiedLawyer = {
  userId: "user-lawyer-unverified",
  role: "lawyer" as const,
  email: "unverified@example.test",
  emailVerifiedAt: null,
};
const unverifiedAdmin = {
  userId: "user-admin-unverified",
  role: "admin" as const,
  email: "admin-unverified@example.test",
  emailVerifiedAt: null,
};

function humanContent(
  overrides: Partial<PolicyHumanRevisionContent> = {}
): PolicyHumanRevisionContent {
  return {
    schemaVersion: POLICY_HUMAN_REVISION_SCHEMA,
    title: { "zh-CN": "律师政策评论", en: "Lawyer policy commentary" },
    overview: { "zh-CN": "概述", en: "Overview" },
    keyChanges: [],
    affectedGroups: [],
    implications: [],
    recommendedActions: [],
    body: null,
    commentary: null,
    attribution: "授权律师团队",
    sourceStatus: "announced",
    sourceReferences: [],
    officialSourceDate: null,
    commencementDate: null,
    reviewedAsOfDate: null,
    ...overrides,
  };
}

function setup() {
  const store = createInMemoryEditorialStore();
  seedEditorialActor(store, admin);
  seedEditorialActor(store, editor);
  seedEditorialActor(store, plainLawyer);
  seedEditorialActor(store, unverifiedLawyer);
  seedEditorialActor(store, unverifiedAdmin);
  seedEditorialGrant(store, editor.userId, admin.userId);
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const submissionStore = createInMemoryOperatorSubmissionStore();
  submissionStore.actors.set(admin.userId, admin);
  submissionStore.actors.set(unverifiedAdmin.userId, unverifiedAdmin);
  submissionStore.actors.set(editor.userId, editor);
  submissionStore.actors.set(plainLawyer.userId, plainLawyer);
  submissionStore.grants.set(editor.userId, { revokedAt: null });
  const submissions = createOperatorSubmissionService(
    createInMemoryOperatorSubmissionRepository(submissionStore)
  );
  const resolverFor =
    (userId: string | null): EditorialActorResolver =>
    async () =>
      userId
        ? { userId }
        : Response.json({ error: "Authentication required." }, { status: 401 });
  return { store, service, submissions, submissionStore, resolverFor };
}

function jsonRequest(body: unknown): Request {
  return new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A request body delivered as a stream, so no `Content-Length` is declared. */
function streamedRequest(chunks: string[]): Request {
  const encoder = new TextEncoder();
  return new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    // Required by Node for a streaming request body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("editorial endpoints require an authenticated session before any capability check", async () => {
  const { service, resolverFor } = setup();
  const response = await handleEditorialWorkspaceGet({
    resolveActor: resolverFor(null),
    service,
  });
  assert.equal(response.status, 401);
});

test("ordinary customers and ungranted lawyers cannot open or mutate the workspace", async () => {
  const { service, resolverFor, store } = setup();
  const userId = plainLawyer.userId;
  const workspace = await handleEditorialWorkspaceGet({
    resolveActor: resolverFor(userId),
    service,
  });
  assert.equal(workspace.status, 403);
  const created = await handleCreateManualDraft({
    resolveActor: resolverFor(userId),
    service,
    request: jsonRequest({ content: humanContent() }),
  });
  assert.equal(created.status, 403);
  const archived = await handleArchivePolicyItem({
    resolveActor: resolverFor(userId),
    service,
    request: jsonRequest({
      itemId: "11111111-1111-4111-8111-111111111111",
    }),
  });
  assert.equal(archived.status, 403);
  assert.equal(store.items.size, 0);
});

test("a forged actor/role field in the body is rejected, never trusted", async () => {
  const { service, resolverFor } = setup();
  const forged = await handleCreateManualDraft({
    resolveActor: resolverFor(plainLawyer.userId),
    service,
    request: jsonRequest({
      content: humanContent(),
      actorUserId: admin.userId,
      role: "admin",
    }),
  });
  assert.equal(forged.status, 400);
  const payload = (await forged.json()) as { error: string };
  assert.equal(payload.error, "validation_failed");
});

test("the granted editor publishes a manual policy through the HTTP contract", async () => {
  const { service, resolverFor, store } = setup();
  const created = await handleCreateManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({ content: humanContent() }),
  });
  assert.equal(created.status, 201);
  const draft = (await created.json()) as {
    itemId: string;
    revisionId: string;
    contentVersion: string;
    slug: string;
  };

  const workspace = await handleEditorialWorkspaceGet({
    resolveActor: resolverFor(editor.userId),
    service,
  });
  assert.equal(workspace.status, 200);
  const data = (await workspace.json()) as {
    canEdit: boolean;
    items: { id: string; editorialStatus: string }[];
  };
  assert.equal(data.canEdit, true);
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].editorialStatus, "draft");

  const stored = new Request("https://example.test/api", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId: draft.itemId, reason: "clean up" }),
  });
  const archived = await handleArchivePolicyItem({
    resolveActor: resolverFor(editor.userId),
    service,
    request: stored,
  });
  assert.equal(archived.status, 200);
  const restored = await handleRestorePolicyItem({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({ itemId: draft.itemId }),
  });
  assert.equal(restored.status, 200);
  const restoredBody = (await restored.json()) as { editorialStatus: string };
  assert.equal(restoredBody.editorialStatus, "draft");
  assert.equal(store.audit.length, 3);
});

test("force publish is refused for an arbitrary body and validated strictly", async () => {
  const { service, resolverFor } = setup();
  const response = await handleForcePublishOverride({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({
      baseRevisionId: "11111111-1111-4111-8111-111111111111",
      actorUserId: admin.userId,
    }),
  });
  assert.equal(response.status, 400);
});

test("grant management is administrator-only through the HTTP contract", async () => {
  const { service, resolverFor } = setup();
  const denied = await handlePolicyEditorGrantUpdate({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({ email: plainLawyer.email, action: "grant" }),
  });
  assert.equal(denied.status, 403);
  const granted = await handlePolicyEditorGrantUpdate({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ email: plainLawyer.email, action: "grant" }),
  });
  assert.equal(granted.status, 200);
  assert.equal(await service.canEdit(plainLawyer.userId), true);
  const revoked = await handlePolicyEditorGrantUpdate({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ email: plainLawyer.email, action: "revoke" }),
  });
  assert.equal(revoked.status, 200);
  assert.equal(await service.canEdit(plainLawyer.userId), false);
});

test("official URL submission validates, deduplicates and requires capability", async () => {
  const { submissions, resolverFor, submissionStore } = setup();
  const valid = await handleOperatorSubmissionCreate({
    resolveActor: resolverFor(editor.userId),
    service: submissions,
    request: jsonRequest({
      url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing",
      note: "Upcoming announcement page",
    }),
  });
  assert.equal(valid.status, 201);
  const created = (await valid.json()) as {
    submissionId: string;
    submittedUrl: string;
  };
  assert.equal(
    created.submittedUrl,
    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing"
  );

  const duplicate = await handleOperatorSubmissionCreate({
    resolveActor: resolverFor(editor.userId),
    service: submissions,
    request: jsonRequest({
      url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing",
    }),
  });
  assert.equal(duplicate.status, 409);

  for (const url of [
    "http://immi.homeaffairs.gov.au/policy",
    "https://example.com/policy",
    "https://immi.homeaffairs.gov.au:8443/policy",
    "https://localhost/policy",
    "https://user:pass@immi.homeaffairs.gov.au/policy",
    "https://127.0.0.1/policy",
    "not-a-url",
  ]) {
    const rejected = await handleOperatorSubmissionCreate({
      resolveActor: resolverFor(editor.userId),
      service: submissions,
      request: jsonRequest({ url }),
    });
    assert.equal(rejected.status, 400, url);
  }

  const denied = await handleOperatorSubmissionCreate({
    resolveActor: resolverFor(plainLawyer.userId),
    service: submissions,
    request: jsonRequest({ url: "https://www.aph.gov.au/bills" }),
  });
  assert.equal(denied.status, 403);

  const listed = await handleOperatorSubmissionList({
    resolveActor: resolverFor(editor.userId),
    service: submissions,
  });
  assert.equal(listed.status, 200);
  const listBody = (await listed.json()) as { submissions: unknown[] };
  assert.equal(listBody.submissions.length, 1);
  assert.equal(submissionStore.audit.length, 1);

  // R3 P1 / D-070: the listing endpoint authorizes server-side. An
  // authenticated but unprivileged lawyer is refused…
  const deniedList = await handleOperatorSubmissionList({
    resolveActor: resolverFor(plainLawyer.userId),
    service: submissions,
  });
  assert.equal(deniedList.status, 403);
  const deniedListBody = (await deniedList.json()) as { error: string };
  assert.equal(deniedListBody.error, "capability_required");
  // …while the verified Admin (principal lawyer) may read the queue without a
  // grant, and the unverified Admin may not.
  const adminList = await handleOperatorSubmissionList({
    resolveActor: resolverFor(admin.userId),
    service: submissions,
  });
  assert.equal(adminList.status, 200);
  const unverifiedAdminList = await handleOperatorSubmissionList({
    resolveActor: resolverFor(unverifiedAdmin.userId),
    service: submissions,
  });
  assert.equal(unverifiedAdminList.status, 403);
  const unverifiedAdminBody = (await unverifiedAdminList.json()) as {
    error: string;
  };
  assert.equal(unverifiedAdminBody.error, "identity_not_verified");
  // An unauthenticated request never reaches the service.
  const anonymousList = await handleOperatorSubmissionList({
    resolveActor: resolverFor(null),
    service: submissions,
  });
  assert.equal(anonymousList.status, 401);

  // A revoked grant closes the workflow again.
  submissionStore.grants.set(editor.userId, { revokedAt: new Date() });
  const revokedList = await handleOperatorSubmissionList({
    resolveActor: resolverFor(editor.userId),
    service: submissions,
  });
  assert.equal(revokedList.status, 403);
});

test("oversized editorial payloads are rejected before parsing", async () => {
  const { service, resolverFor } = setup();
  const oversize = new Request("https://example.test/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "content-length": String(300 * 1024),
    },
    body: JSON.stringify({ content: humanContent() }),
  });
  const response = await handleCreateManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: oversize,
  });
  assert.equal(response.status, 413);
});

test("cross-site editorial mutations are rejected before any state change", async () => {
  const { service, resolverFor, store } = setup();
  const crossSite = new Request(
    "https://example.test/api/policy-editor/drafts",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ content: humanContent() }),
    }
  );
  const rejected = await handleCreateManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: crossSite,
  });
  assert.equal(rejected.status, 403);
  const rejectedBody = (await rejected.json()) as { error: string };
  assert.equal(rejectedBody.error, "cross_site_request_rejected");
  assert.equal(store.items.size, 0);

  const sameOrigin = new Request(
    "https://example.test/api/policy-editor/drafts",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "https://example.test",
      },
      body: JSON.stringify({ content: humanContent() }),
    }
  );
  const accepted = await handleCreateManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: sameOrigin,
  });
  assert.equal(accepted.status, 201);

  // No Origin header (script/CLI caller): still gated by session + capability.
  const denylessOrigin = await handleCreateManualDraft({
    resolveActor: resolverFor(plainLawyer.userId),
    service,
    request: jsonRequest({ content: humanContent() }),
  });
  assert.equal(denylessOrigin.status, 403);
});

test("a cross-site fetch-metadata request is rejected before any work (R1)", async () => {
  const { service, resolverFor, store } = setup();
  const crossSite = new Request("https://example.test/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "sec-fetch-site": "cross-site",
    },
    body: JSON.stringify({ content: humanContent() }),
  });
  const rejected = await handleCreateManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: crossSite,
  });
  assert.equal(rejected.status, 403);
  const body = (await rejected.json()) as { error: string };
  assert.equal(body.error, "cross_site_request_rejected");
  assert.equal(store.items.size, 0);
});

test("the body limit is enforced on the stream, not only via Content-Length (R1)", async () => {
  const { service, resolverFor, store } = setup();
  // No declared Content-Length: only the streamed byte budget can stop this.
  const oversized = streamedRequest([
    '{"content":{"padding":"',
    "x".repeat(300 * 1024),
    '"}}',
  ]);
  const rejected = await handleCreateManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: oversized,
  });
  assert.equal(rejected.status, 413);
  const body = (await rejected.json()) as { error: string };
  assert.equal(body.error, "payload_too_large");
  assert.equal(store.items.size, 0);

  // A streamed body within the budget is read normally.
  const accepted = await handleCreateManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: streamedRequest([
      JSON.stringify({ content: humanContent() }).slice(0, 40),
      JSON.stringify({ content: humanContent() }).slice(40),
    ]),
  });
  assert.equal(accepted.status, 201);
});

test("an unverified actor is refused at the HTTP boundary (R1)", async () => {
  const { service, resolverFor, store } = setup();
  const response = await handleCreateManualDraft({
    resolveActor: resolverFor(unverifiedLawyer.userId),
    service,
    request: jsonRequest({ content: humanContent() }),
  });
  assert.equal(response.status, 403);
  const body = (await response.json()) as { error: string };
  assert.equal(body.error, "identity_not_verified");
  assert.equal(store.items.size, 0);
  const workspace = await handleEditorialWorkspaceGet({
    resolveActor: resolverFor(unverifiedLawyer.userId),
    service,
  });
  assert.equal(workspace.status, 403);
});

test("the workspace honours bounded pagination query parameters (R1)", async () => {
  const { service, resolverFor } = setup();
  const page = await handleEditorialWorkspaceGet({
    resolveActor: resolverFor(editor.userId),
    service,
    request: new Request("https://example.test/api/workspace?limit=5&offset=0"),
  });
  assert.equal(page.status, 200);
  const body = (await page.json()) as {
    page: { limit: number; offset: number; hasMore: boolean };
  };
  assert.equal(body.page.limit, 5);
  assert.equal(body.page.offset, 0);

  const invalid = await handleEditorialWorkspaceGet({
    resolveActor: resolverFor(editor.userId),
    service,
    request: new Request("https://example.test/api/workspace?limit=abc"),
  });
  assert.equal(invalid.status, 400);
});

test("releasing publication protection over HTTP requires authority (R1)", async () => {
  const { service, resolverFor, store } = setup();
  const created = await handleCreateManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({ content: humanContent() }),
  });
  assert.equal(created.status, 201);
  const draft = (await created.json()) as {
    itemId: string;
    revisionId: string;
    contentVersion: string;
  };
  const published = await handlePublishManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({
      itemId: draft.itemId,
      revisionId: draft.revisionId,
      expectedContentVersion: draft.contentVersion,
    }),
  });
  assert.equal(published.status, 200);
  assert.equal(
    store.items.get(draft.itemId)?.publicationMode,
    "human_protected"
  );

  const denied = await handleReleasePublicationProtection({
    resolveActor: resolverFor(plainLawyer.userId),
    service,
    request: jsonRequest({ itemId: draft.itemId }),
  });
  assert.equal(denied.status, 403);

  const released = await handleReleasePublicationProtection({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({ itemId: draft.itemId, reason: "Back to automatic" }),
  });
  assert.equal(released.status, 200);
  const releasedBody = (await released.json()) as {
    publicationMode: string;
    changed: boolean;
  };
  assert.equal(releasedBody.publicationMode, "automatic");
  assert.equal(releasedBody.changed, true);
  assert.equal(store.items.get(draft.itemId)?.publicationMode, "automatic");

  // A stale/absent item is a validation failure, not a silent success.
  const invalid = await handleReleasePublicationProtection({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({ itemId: "not-a-uuid" }),
  });
  assert.equal(invalid.status, 400);
});

test("draft history is served to authorized editors with the complete document (R2)", async () => {
  const { service, resolverFor, store } = setup();
  const created = await handleCreateManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({
      content: humanContent(),
    }),
  });
  assert.equal(created.status, 201);
  const draft = (await created.json()) as {
    itemId: string;
    revisionId: string;
    contentVersion: string;
  };
  const saved = await handleSaveManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({
      itemId: draft.itemId,
      revisionId: draft.revisionId,
      expectedContentVersion: draft.contentVersion,
      content: humanContent({
        body: { "zh-CN": "完整正文", en: "Complete body text" },
        overview: { "zh-CN": "第一版概述", en: "First overview" },
      }),
    }),
  });
  assert.equal(saved.status, 200);
  assert.equal(store.draftSnapshots.size, 2);

  const history = await handleDraftHistoryGet({
    resolveActor: resolverFor(editor.userId),
    service,
    request: new Request(
      `https://example.test/api/policy-editor/drafts/history?itemId=${draft.itemId}&revisionId=${draft.revisionId}`
    ),
  });
  assert.equal(history.status, 200);
  const payload = (await history.json()) as {
    snapshots: {
      saveNumber: number;
      humanContent: {
        body: { en: string } | null;
        overview: { en: string };
      } | null;
      contentValid: boolean;
    }[];
  };
  assert.equal(payload.snapshots.length, 2);
  assert.equal(payload.snapshots[0].saveNumber, 1);
  assert.equal(payload.snapshots[0].contentValid, true);
  assert.equal(payload.snapshots[0].humanContent?.overview.en, "Overview");
  assert.equal(payload.snapshots[0].humanContent?.body, null);
  assert.equal(
    payload.snapshots[1].humanContent?.body?.en,
    "Complete body text"
  );

  // Only publication authority may read draft history.
  const denied = await handleDraftHistoryGet({
    resolveActor: resolverFor(plainLawyer.userId),
    service,
    request: new Request(
      `https://example.test/api/policy-editor/drafts/history?itemId=${draft.itemId}&revisionId=${draft.revisionId}`
    ),
  });
  assert.equal(denied.status, 403);

  // Malformed query parameters are rejected instead of reaching the service.
  const invalid = await handleDraftHistoryGet({
    resolveActor: resolverFor(editor.userId),
    service,
    request: new Request(
      "https://example.test/api/policy-editor/drafts/history?itemId=nope"
    ),
  });
  assert.equal(invalid.status, 400);
});

test("unverified administrators cannot manage or list grants (R2)", async () => {
  const { service, resolverFor } = setup();
  assert.equal(await service.isAdministrator(unverifiedAdmin.userId), false);
  const deniedGrant = await handlePolicyEditorGrantUpdate({
    resolveActor: resolverFor(unverifiedAdmin.userId),
    service,
    request: jsonRequest({ email: plainLawyer.email, action: "grant" }),
  });
  assert.equal(deniedGrant.status, 403);
  const deniedBody = (await deniedGrant.json()) as { error: string };
  assert.equal(deniedBody.error, "identity_not_verified");
  assert.equal(await service.canEdit(plainLawyer.userId), false);

  const deniedList = await handlePolicyEditorGrantsGet({
    resolveActor: resolverFor(unverifiedAdmin.userId),
    service,
  });
  assert.equal(deniedList.status, 403);

  // The verified administrator keeps the management capability.
  const allowedList = await handlePolicyEditorGrantsGet({
    resolveActor: resolverFor(admin.userId),
    service,
  });
  assert.equal(allowedList.status, 200);
  const allowedGrant = await handlePolicyEditorGrantUpdate({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ email: plainLawyer.email, action: "grant" }),
  });
  assert.equal(allowedGrant.status, 200);
  assert.equal(await service.canEdit(plainLawyer.userId), true);
});

test("manual publish rejects a stale draft after another lawyer publishes (R2)", async () => {
  const { service, resolverFor, store } = setup();
  // The API fixture grants a second lawyer so a genuine two-lawyer race can be
  // driven through the HTTP contract.
  seedEditorialGrant(store, plainLawyer.userId, admin.userId);
  const created = await handleCreateManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({ content: humanContent() }),
  });
  assert.equal(created.status, 201);
  const v1 = (await created.json()) as {
    itemId: string;
    revisionId: string;
    contentVersion: string;
  };
  const publishedV1 = await handlePublishManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({
      itemId: v1.itemId,
      revisionId: v1.revisionId,
      expectedContentVersion: v1.contentVersion,
    }),
  });
  assert.equal(publishedV1.status, 200);

  const draftA = await handleCreateManualRevision({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({ itemId: v1.itemId }),
  });
  const draftB = await handleCreateManualRevision({
    resolveActor: resolverFor(plainLawyer.userId),
    service,
    request: jsonRequest({ itemId: v1.itemId }),
  });
  assert.equal(draftA.status, 201);
  assert.equal(draftB.status, 201);
  const a = (await draftA.json()) as { revisionId: string };
  const b = (await draftB.json()) as { revisionId: string };

  const revisionB = store.revisions.get(b.revisionId);
  assert.ok(revisionB);
  const publishedV2 = await handlePublishManualDraft({
    resolveActor: resolverFor(plainLawyer.userId),
    service,
    request: jsonRequest({
      itemId: v1.itemId,
      revisionId: b.revisionId,
      expectedContentVersion: revisionB.analysisFingerprint,
    }),
  });
  assert.equal(publishedV2.status, 200);

  const revisionA = store.revisions.get(a.revisionId);
  assert.ok(revisionA);
  const staleAttempt = await handlePublishManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({
      itemId: v1.itemId,
      revisionId: a.revisionId,
      expectedContentVersion: revisionA.analysisFingerprint,
    }),
  });
  assert.equal(staleAttempt.status, 409);
  const staleBody = (await staleAttempt.json()) as {
    error: string;
    detail: string | null;
  };
  assert.equal(staleBody.error, "stale_publication_conflict");
  assert.equal(staleBody.detail, "draft_baseline_superseded");
  assert.equal(
    store.items.get(v1.itemId)?.latestPublishedRevisionId,
    b.revisionId
  );
  assert.equal(store.revisions.get(a.revisionId)?.editorialStatus, "draft");
});

test("D-073 owner-host fix: the Admin archive/restore payload is accepted and audited", async () => {
  const { service, resolverFor, store } = setup();
  // The owner's scenario: a Manual, published, editor-protected policy.
  const created = await handleCreateManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({ content: humanContent() }),
  });
  assert.equal(created.status, 201);
  const draft = (await created.json()) as {
    itemId: string;
    revisionId: string;
    contentVersion: string;
  };
  const published = await handlePublishManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({
      itemId: draft.itemId,
      revisionId: draft.revisionId,
      expectedContentVersion: draft.contentVersion,
    }),
  });
  assert.equal(published.status, 200);
  assert.equal(
    store.items.get(draft.itemId)?.publicationMode,
    "human_protected"
  );
  assert.equal(store.items.get(draft.itemId)?.editorialStatus, "published");
  const auditsBefore = store.audit.length;

  // Root-cause guard: the Admin page posts `{ itemId, action }`. Forwarding
  // that raw body into the strict archive handler is exactly what produced the
  // owner-visible `validation_failed`, so the routing field must never reach
  // the handler schema again.
  const rawBody = await handleArchivePolicyItem({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ itemId: draft.itemId, action: "archive" }),
  });
  assert.equal(rawBody.status, 400);
  assert.deepEqual(await rawBody.json(), {
    error: "validation_failed",
    detail: null,
  });
  assert.equal(store.items.get(draft.itemId)?.editorialStatus, "published");

  // The verified principal-lawyer Admin needs no Policy Editor grant, and human
  // publication protection never blocks an authorized human archive.
  const archived = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({
      itemId: draft.itemId,
      action: "archive",
      reason: "superseded by a newer notice",
    }),
  });
  assert.equal(archived.status, 200);
  assert.deepEqual(await archived.json(), { editorialStatus: "archived" });
  const archivedItem = store.items.get(draft.itemId);
  assert.equal(archivedItem?.editorialStatus, "archived");
  // Protection and published history are preserved by an archive.
  assert.equal(archivedItem?.publicationMode, "human_protected");
  assert.equal(archivedItem?.latestPublishedRevisionId, draft.revisionId);
  const archiveAudit = store.audit.at(-1);
  assert.ok(archiveAudit);
  assert.equal(archiveAudit.action, "archive_policy_item");
  assert.equal(archiveAudit.actorUserId, admin.userId);
  assert.deepEqual(archiveAudit.detail.previousStatus, "published");
  // The rejected 400 attempt wrote nothing; the archive appended exactly one
  // durable audit event.
  assert.equal(store.audit.length, auditsBefore + 1);

  // Restore returns the item to the honest status of its stored history.
  const restored = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ itemId: draft.itemId, action: "restore" }),
  });
  assert.equal(restored.status, 200);
  assert.deepEqual(await restored.json(), { editorialStatus: "published" });
  assert.equal(
    store.items.get(draft.itemId)?.latestPublishedRevisionId,
    draft.revisionId
  );
  assert.equal(store.audit.at(-1)?.action, "restore_policy_item");
  assert.equal(store.audit.length, auditsBefore + 2);
});

test("D-073 owner-host fix: the Admin action stays strictly validated and authorized", async () => {
  const { service, resolverFor, store } = setup();
  const created = await handleCreateManualDraft({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({ content: humanContent() }),
  });
  const draft = (await created.json()) as { itemId: string };
  const auditsBefore = store.audit.length;

  const unknownKey = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({
      itemId: draft.itemId,
      action: "archive",
      role: "admin",
    }),
  });
  assert.equal(unknownKey.status, 400);
  assert.deepEqual(await unknownKey.json(), {
    error: "validation_failed",
    detail: null,
  });

  const unknownAction = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ itemId: draft.itemId, action: "delete" }),
  });
  assert.equal(unknownAction.status, 400);

  const slugInsteadOfUuid = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({
      itemId: "evisitor-application-arrangements-lin-26-061",
      action: "archive",
    }),
  });
  assert.equal(slugInsteadOfUuid.status, 400);

  const unverified = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(unverifiedAdmin.userId),
    service,
    request: jsonRequest({ itemId: draft.itemId, action: "archive" }),
  });
  assert.equal(unverified.status, 403);

  const unauthorised = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(plainLawyer.userId),
    service,
    request: jsonRequest({ itemId: draft.itemId, action: "archive" }),
  });
  assert.equal(unauthorised.status, 403);

  const crossSite = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: new Request("https://example.test/api/admin/policy-intelligence", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "cross-site",
      },
      body: JSON.stringify({ itemId: draft.itemId, action: "archive" }),
    }),
  });
  assert.equal(crossSite.status, 403);

  assert.equal(store.items.get(draft.itemId)?.editorialStatus, "draft");
  assert.equal(store.audit.length, auditsBefore);
});

/**
 * Phase 12 Stage 3 — Publish Official Source fixtures.
 *
 * The owner's real case: an automated item whose official Home Affairs
 * snapshot was stored and analysed unsuccessfully, leaving a draft with a
 * snapshot but no revision at all.
 */
function seedSnapshotOnlyItem(
  store: ReturnType<typeof createInMemoryEditorialStore>,
  overrides: {
    editorialStatus?: "draft" | "archived" | "published";
    declaredSourceStatus?: string;
  } = {}
) {
  const itemId = store.nextId();
  const snapshot = seedEditorialSourceSnapshot(store, {
    id: store.nextId(),
    itemId,
    authority: "Department of Home Affairs",
    canonicalUrl:
      "https://immi.homeaffairs.gov.au/visas/student-visa-instrument-2026",
    officialTitle:
      "Migration (Student Visa Applications to Be Made from outside Australia) Instrument 2026",
    sourceDate: "2026-10-01",
    effectiveDate: null,
    sourceMetadata: {
      requestedUrl:
        "https://immi.homeaffairs.gov.au/visas/student-visa-instrument-2026",
      finalUrl:
        "https://immi.homeaffairs.gov.au/visas/student-visa-instrument-2026",
      redirectChain: [],
      bytesReceived: 4096,
      evidenceTruncated: false,
      ...(overrides.declaredSourceStatus
        ? { declaredSourceStatus: overrides.declaredSourceStatus }
        : {}),
    },
    retrievedAt: "2026-10-14T02:00:00.000Z",
  });
  store.items.set(itemId, {
    id: itemId,
    slug: "migration-student-visa-instrument-2026",
    origin: "automated",
    editorialStatus: overrides.editorialStatus ?? "draft",
    sourceStatus: "unknown",
    latestSnapshotId: snapshot.id,
    latestPublishedRevisionId: null,
    createdByUserId: null,
    publicationMode: "automatic",
    protectionSetAt: null,
    protectionSetByUserId: null,
    updatedAt: new Date("2026-10-14T02:00:00.000Z"),
  });
  return { itemId, snapshot };
}

test("D-073/owner: the principal-lawyer Admin publishes a persisted official snapshot with no AI revision or grant", async () => {
  const { service, resolverFor, store } = setup();
  const { itemId, snapshot } = seedSnapshotOnlyItem(store);
  assert.equal(store.revisions.size, 0);

  const response = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ itemId, action: "publish_source" }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    revisionId: string;
    revisionNumber: number;
    editorialStatus: string;
    sourceStatus: string;
    snapshotId: string;
    unchanged: boolean;
  };
  assert.deepEqual(body, {
    revisionId: body.revisionId,
    revisionNumber: 1,
    editorialStatus: "published",
    sourceStatus: "unknown",
    snapshotId: snapshot.id,
    unchanged: false,
  });

  // D-072's source-first representation, written without any model: no
  // analysis, no verification, only the recorded reason metadata.
  const revision = store.revisions.get(body.revisionId);
  assert.ok(revision);
  assert.equal(revision.contentKind, "source_first");
  assert.equal(revision.schemaVersion, POLICY_SOURCE_FIRST_SCHEMA);
  assert.equal(revision.snapshotId, snapshot.id);
  assert.equal(revision.analysis, null);
  assert.equal(revision.verification, null);
  assert.equal(revision.humanContent, null);
  assert.equal(revision.editorialStatus, "published");
  assert.equal(revision.createdByUserId, admin.userId);
  const metadata = revision.modelMetadata as {
    sourceFirst?: { reason?: string };
    advisories?: unknown[];
    provider?: unknown;
    model?: unknown;
  };
  assert.equal(metadata.sourceFirst?.reason, "lawyer_source_publication");
  assert.deepEqual(metadata.advisories, []);
  // No model, provider or analyzer/verifier identity was recorded or invoked.
  assert.equal(metadata.provider, undefined);
  assert.equal(metadata.model, undefined);

  const item = store.items.get(itemId);
  assert.equal(item?.editorialStatus, "published");
  assert.equal(item?.sourceStatus, "unknown");
  assert.equal(item?.latestPublishedRevisionId, body.revisionId);
  // Human protection: a later automatic sync cannot silently replace this.
  assert.equal(item?.publicationMode, "human_protected");
  assert.equal(item?.protectionSetByUserId, admin.userId);
  assert.ok(item?.protectionSetAt);

  const audit = store.audit.at(-1);
  assert.ok(audit);
  assert.equal(audit.action, "publish_official_source");
  assert.equal(audit.actorUserId, admin.userId);
  assert.equal(audit.revisionId, body.revisionId);
  assert.equal(audit.detail.snapshotId, snapshot.id);
  assert.equal(audit.detail.contentKind, "source_first");
  assert.equal(audit.detail.previousStatus, "draft");
  assert.equal(audit.detail.publicationModeAfter, "human_protected");

  // The honest status keeps the record publicly visible in D-073's
  // official-update group (never labelled as legislation in force).
  const { getPolicyPresentationGroup, getPolicyPresentationStatusLabel } =
    await import("../policy-intelligence-product-copy");
  assert.equal(getPolicyPresentationGroup("unknown"), "official_update");
  assert.equal(
    getPolicyPresentationStatusLabel("unknown", "en"),
    "Legal effect not yet verified"
  );
});

test("a granted editor publishes the official source and an ungranted account cannot", async () => {
  const { service, resolverFor, store } = setup();
  const { itemId, snapshot } = seedSnapshotOnlyItem(store);

  const denied = await handlePublishOfficialSource({
    resolveActor: resolverFor(plainLawyer.userId),
    service,
    request: jsonRequest({ itemId }),
  });
  assert.equal(denied.status, 403);
  assert.equal(store.revisions.size, 0);
  assert.equal(store.audit.length, 0);

  const unverified = await handlePublishOfficialSource({
    resolveActor: resolverFor(unverifiedAdmin.userId),
    service,
    request: jsonRequest({ itemId }),
  });
  assert.equal(unverified.status, 403);

  const crossSite = await handlePublishOfficialSource({
    resolveActor: resolverFor(editor.userId),
    service,
    request: new Request(
      "https://example.test/api/policy-editor/publish-source",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Sec-Fetch-Site": "cross-site",
        },
        body: JSON.stringify({ itemId }),
      }
    ),
  });
  assert.equal(crossSite.status, 403);

  const published = await handlePublishOfficialSource({
    resolveActor: resolverFor(editor.userId),
    service,
    request: jsonRequest({ itemId }),
  });
  assert.equal(published.status, 200);
  const body = (await published.json()) as { revisionId: string };
  assert.equal(store.revisions.get(body.revisionId)?.snapshotId, snapshot.id);
  assert.equal(store.items.get(itemId)?.publicationMode, "human_protected");
  assert.equal(store.audit.length, 1);
});

test("a repeated click is idempotent and an archived item is never republished", async () => {
  const { service, resolverFor, store } = setup();
  const { itemId } = seedSnapshotOnlyItem(store);
  const first = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ itemId, action: "publish_source" }),
  });
  assert.equal(first.status, 200);
  const firstBody = (await first.json()) as { revisionId: string };
  const revisionsAfterFirst = store.revisions.size;
  const auditAfterFirst = store.audit.length;

  const repeat = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ itemId, action: "publish_source" }),
  });
  assert.equal(repeat.status, 200);
  const repeatBody = (await repeat.json()) as {
    revisionId: string;
    unchanged: boolean;
  };
  assert.equal(repeatBody.unchanged, true);
  assert.equal(repeatBody.revisionId, firstBody.revisionId);
  // No duplicate revision and no duplicate audit event.
  assert.equal(store.revisions.size, revisionsAfterFirst);
  assert.equal(store.audit.length, auditAfterFirst);

  // An archived policy stays archived: the action reports a controlled error
  // and writes nothing.
  const archivedItem = store.items.get(itemId);
  assert.ok(archivedItem);
  store.items.set(itemId, { ...archivedItem, editorialStatus: "archived" });
  const afterArchive = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ itemId, action: "publish_source" }),
  });
  assert.equal(afterArchive.status, 409);
  assert.deepEqual(await afterArchive.json(), {
    error: "item_archived",
    detail: null,
  });
  assert.equal(store.items.get(itemId)?.editorialStatus, "archived");
  assert.equal(store.revisions.size, revisionsAfterFirst);
  assert.equal(store.audit.length, auditAfterFirst);
});

test("an item without a persisted snapshot cannot be published from source", async () => {
  const { service, resolverFor, store } = setup();
  const created = await handleCreateManualDraft({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ content: humanContent() }),
  });
  const draft = (await created.json()) as { itemId: string };
  const response = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ itemId: draft.itemId, action: "publish_source" }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "validation_failed",
    detail: "no_source_snapshot",
  });
  assert.equal(store.items.get(draft.itemId)?.latestPublishedRevisionId, null);
});

test("an explicit declared source status is respected instead of assumed in force", async () => {
  const { service, resolverFor, store } = setup();
  const { itemId } = seedSnapshotOnlyItem(store, {
    declaredSourceStatus: "in_force",
  });
  const response = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ itemId, action: "publish_source" }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { sourceStatus: string };
  assert.equal(body.sourceStatus, "in_force");
});

test("a held automated revision cannot disturb or duplicate the editor's source publication", async () => {
  const { service, resolverFor, store } = setup();
  const { itemId, snapshot } = seedSnapshotOnlyItem(store);
  const published = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ itemId, action: "publish_source" }),
  });
  const body = (await published.json()) as { revisionId: string };
  const auditAfterPublish = store.audit.length;

  // The protected item makes the automated repository store a newer revision
  // as `review_required` instead of publishing it (the production hold branch
  // of `publishRevision`); this mirrors that stored outcome.
  const heldRevisionId = store.nextId();
  store.revisions.set(heldRevisionId, {
    id: heldRevisionId,
    itemId,
    snapshotId: snapshot.id,
    contentKind: "ai_analysis",
    analysisFingerprint: "held-analysis-fingerprint-0001",
    revisionNumber: 2,
    editorialStatus: "review_required",
    analysis: null,
    verification: null,
    humanContent: null,
    aiDecision: null,
    overrideReason: null,
    idempotencyKey: null,
    baseRevisionId: null,
    createdByUserId: null,
    generatedAt: new Date("2026-10-14T03:00:00.000Z"),
    publishedAt: null,
    supersededAt: null,
    createdAt: new Date("2026-10-14T03:00:00.000Z"),
  });

  // The human publication keeps its pointer, its status and its protection.
  const item = store.items.get(itemId);
  assert.equal(item?.latestPublishedRevisionId, body.revisionId);
  assert.equal(item?.editorialStatus, "published");
  assert.equal(item?.publicationMode, "human_protected");
  assert.equal(
    store.revisions.get(body.revisionId)?.editorialStatus,
    "published"
  );

  // A repeat click is still idempotent: no third revision, no new audit row.
  const repeat = await handleAdminPolicyItemAction({
    resolveActor: resolverFor(admin.userId),
    service,
    request: jsonRequest({ itemId, action: "publish_source" }),
  });
  assert.equal(repeat.status, 200);
  assert.equal(
    ((await repeat.json()) as { unchanged: boolean }).unchanged,
    true
  );
  assert.equal(store.revisions.size, 2);
  assert.equal(store.audit.length, auditAfterPublish);
});
