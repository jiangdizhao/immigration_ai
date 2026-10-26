// biome-ignore-all lint/suspicious/useAwait: fake application methods implement the Promise-based port.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  createProjectDocumentHandlers,
  PROJECT_DOCUMENT_IMPORT_NOTICE_VERSION,
  ProjectDocumentApplicationError,
  type ProjectDocumentCustomerApplication,
  type ProjectDocumentPublicMetadata,
} from "./http";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const CHAT_ID = "44444444-4444-4444-8444-444444444444";
const SOURCE_ID = "55555555-5555-4555-8555-555555555555";
const ACTOR_ID = "66666666-6666-4666-8666-666666666666";
const SAMPLE = new TextEncoder().encode("Synthetic project document\n");
const DIGEST = createHash("sha256").update(SAMPLE).digest("hex");

const metadata: ProjectDocumentPublicMetadata = {
  assetId: ASSET_ID,
  versionId: VERSION_ID,
  versionNumber: 1,
  lifecycle: "active",
  originKind: "direct_upload",
  canonicalMime: "text/plain",
  byteSize: SAMPLE.byteLength,
  storageStatus: "pending",
  securityStatus: "pending",
};

function makeApplication(
  overrides: Partial<ProjectDocumentCustomerApplication> = {}
) {
  const calls: Array<{ name: string; input: unknown }> = [];
  const app: ProjectDocumentCustomerApplication = {
    async listMetadata(input) {
      calls.push({ name: "listMetadata", input });
      return [
        {
          ...metadata,
          storageKey: "private/key",
          sha256: DIGEST,
        } as ProjectDocumentPublicMetadata,
      ];
    },
    async createDirectUpload(input) {
      calls.push({ name: "createDirectUpload", input });
      return {
        operationId: input.operationId,
        assetId: ASSET_ID,
        versionId: VERSION_ID,
        status: "intent_created",
        storageStatus: "pending",
        securityStatus: "pending",
        projectRevision: 4,
        replayed: false,
      };
    },
    async issueImportConsentAcknowledgement(input) {
      calls.push({ name: "issueImportConsentAcknowledgement", input });
      return {
        acknowledgement: "opaque-server-issued-consent-receipt-123456789",
      };
    },
    async importOwnedChatDocument(input) {
      calls.push({ name: "importOwnedChatDocument", input });
      return {
        operationId: input.operationId,
        assetId: ASSET_ID,
        versionId: VERSION_ID,
        status: "intent_created",
        storageStatus: "pending",
        securityStatus: "pending",
        projectRevision: 4,
        replayed: false,
      };
    },
    async getMetadata(input) {
      calls.push({ name: "getMetadata", input });
      return input.assetId === ASSET_ID ? metadata : null;
    },
    async download(input) {
      calls.push({ name: "download", input });
      return {
        filename: "notes.txt",
        canonicalMime: "text/plain",
        bytes: SAMPLE,
        expectedSha256: DIGEST,
        expectedByteSize: SAMPLE.byteLength,
        storageStatus: "stored",
        securityStatus: "clean",
        exactVersionCleanAuthorized: true,
      };
    },
    async withdraw(input) {
      calls.push({ name: "withdraw", input });
      return {
        assetId: input.assetId,
        lifecycle: "withdrawn",
        projectRevision: 5,
        replayed: false,
      };
    },
    async revokeCreatorGrant(input) {
      calls.push({ name: "revokeCreatorGrant", input });
      return { grantId: input.grantId, revoked: true, replayed: false };
    },
    ...overrides,
  };
  return { app, calls };
}

function makeHandlers(
  options: {
    session?: { userId: string; type: "guest" | "regular" } | null;
    registered?: boolean;
    feature?: boolean;
    trust?: boolean;
    schema?: boolean;
    application?: ProjectDocumentCustomerApplication | null;
    rateLimit?: () => Promise<boolean>;
  } = {}
) {
  let customerChecks = 0;
  let schemaChecks = 0;
  const handlers = createProjectDocumentHandlers({
    authenticate: async () =>
      options.session === undefined
        ? { userId: ACTOR_ID, type: "regular" }
        : options.session,
    isRegisteredCustomer: async () => {
      customerChecks += 1;
      return options.registered ?? true;
    },
    schemaAvailable: async () => {
      schemaChecks += 1;
      return options.schema ?? true;
    },
    featureEnabled: () => options.feature ?? true,
    trustedLiveReadiness: async () => options.trust ?? true,
    application: options.application ?? makeApplication().app,
    rateLimit: options.rateLimit
      ? async () => options.rateLimit?.() ?? false
      : undefined,
  });
  return { handlers, counts: () => ({ customerChecks, schemaChecks }) };
}

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

function jsonRequest(url: string, value: unknown, method = "POST") {
  return request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

test("disabled flag or absent trusted readiness fails closed before customer/schema access", async () => {
  for (const options of [{ feature: false }, { feature: true, trust: false }]) {
    const { app, calls } = makeApplication();
    const { handlers, counts } = makeHandlers({ ...options, application: app });
    const response = await handlers.list(
      request("https://local.test"),
      PROJECT_ID
    );
    assert.equal(response.status, 503);
    assert.equal(counts().customerChecks, 0);
    assert.equal(counts().schemaChecks, 0);
    assert.equal(calls.length, 0);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
  }
});

test("unauthenticated, guest, and unregistered callers are rejected before application access", async () => {
  for (const options of [
    { session: null },
    { session: { userId: ACTOR_ID, type: "guest" as const } },
    { registered: false },
  ]) {
    const { app, calls } = makeApplication();
    const { handlers } = makeHandlers({ ...options, application: app });
    const response = await handlers.list(
      request("https://local.test"),
      PROJECT_ID
    );
    assert.equal(
      response.status,
      options.session === null || options.session?.type === "guest" ? 401 : 403
    );
    assert.equal(calls.length, 0);
  }
});

test("metadata list is actor-scoped, bounded, private, and strips storage identity and hashes", async () => {
  const { app, calls } = makeApplication();
  const { handlers } = makeHandlers({ application: app });
  const response = await handlers.list(
    request("https://local.test"),
    PROJECT_ID
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.equal(body.documents[0].assetId, ASSET_ID);
  assert.equal("storageKey" in body.documents[0], false);
  assert.equal("sha256" in body.documents[0], false);
  assert.deepEqual(calls[0], {
    name: "listMetadata",
    input: { actorUserId: ACTOR_ID, projectId: PROJECT_ID, limit: 50 },
  });
});

test("list does not reveal private documents when the current grant-scoped adapter returns none", async () => {
  const { app } = makeApplication({ listMetadata: async () => [] });
  const { handlers } = makeHandlers({ application: app });
  const response = await handlers.list(
    request("https://local.test"),
    PROJECT_ID
  );
  assert.deepEqual(await response.json(), { documents: [] });
});

test("upload validates bounded file bytes and content identity before invoking the application", async () => {
  const { app, calls } = makeApplication();
  const { handlers } = makeHandlers({ application: app });
  const response = await handlers.upload(
    request("https://local.test", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-operation-id": "upload-1",
        "x-expected-project-revision": "3",
        "x-original-filename": "notes.txt",
      },
      body: SAMPLE,
    }),
    PROJECT_ID
  );
  assert.equal(response.status, 201);
  const call = calls.find((item) => item.name === "createDirectUpload");
  assert.ok(call);
  assert.equal((call.input as { actorUserId: string }).actorUserId, ACTOR_ID);
  assert.equal(
    (call.input as { expectedProjectRevision: number }).expectedProjectRevision,
    3
  );
  assert.equal((call.input as { sha256: string }).sha256, DIGEST);
  assert.equal(
    (call.input as { canonicalMime: string }).canonicalMime,
    "text/plain"
  );
  assert.equal("storageKey" in (await response.json()).document, false);
});

test("upload rejects malformed operation metadata and contradictory file content", async () => {
  const { app, calls } = makeApplication();
  const { handlers } = makeHandlers({ application: app });
  const missing = await handlers.upload(
    request("https://local.test", { method: "POST", body: SAMPLE }),
    PROJECT_ID
  );
  assert.equal(missing.status, 400);
  const mismatch = await handlers.upload(
    request("https://local.test", {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        "x-operation-id": "upload-2",
        "x-expected-project-revision": "3",
        "x-original-filename": "notes.txt",
      },
      body: SAMPLE,
    }),
    PROJECT_ID
  );
  assert.equal(mismatch.status, 400);
  assert.equal(calls.length, 0);
});

test("import requires a server-issued versioned acknowledgement; browser booleans alone cannot import", async () => {
  const { app, calls } = makeApplication();
  const { handlers } = makeHandlers({ application: app });
  const payload = {
    operationId: "import-1",
    expectedProjectRevision: 4,
    sourceChatId: CHAT_ID,
    sourceDocumentId: SOURCE_ID,
  };
  const booleanOnly = await handlers.importChatDocument(
    jsonRequest("https://local.test", { ...payload, consentAccepted: true }),
    PROJECT_ID
  );
  assert.equal(booleanOnly.status, 400);
  assert.equal(calls.length, 0);

  const consentResponse = await handlers.createImportConsentAcknowledgement(
    jsonRequest("https://local.test", {
      sourceChatId: CHAT_ID,
      sourceDocumentId: SOURCE_ID,
      accepted: true,
      noticeVersion: PROJECT_DOCUMENT_IMPORT_NOTICE_VERSION,
    }),
    PROJECT_ID
  );
  assert.equal(consentResponse.status, 201);
  const { acknowledgement } = await consentResponse.json();
  const imported = await handlers.importChatDocument(
    jsonRequest("https://local.test", {
      ...payload,
      consentAcknowledgement: acknowledgement,
    }),
    PROJECT_ID
  );
  assert.equal(imported.status, 201);
  const consentCall = calls.find(
    (item) => item.name === "issueImportConsentAcknowledgement"
  );
  assert.equal(
    (consentCall?.input as { actorUserId: string }).actorUserId,
    ACTOR_ID
  );
  const importCall = calls.find(
    (item) => item.name === "importOwnedChatDocument"
  );
  assert.equal(
    (importCall?.input as { actorUserId: string }).actorUserId,
    ACTOR_ID
  );
  assert.equal(
    (importCall?.input as { consentAcknowledgement: string })
      .consentAcknowledgement,
    acknowledgement
  );
});

test("invalid consent, cross-project identifiers, and missing acknowledgement fail closed", async () => {
  const { app, calls } = makeApplication();
  const { handlers } = makeHandlers({ application: app });
  for (const body of [
    {
      sourceChatId: CHAT_ID,
      sourceDocumentId: SOURCE_ID,
      accepted: false,
      noticeVersion: PROJECT_DOCUMENT_IMPORT_NOTICE_VERSION,
    },
    {
      sourceChatId: CHAT_ID,
      sourceDocumentId: SOURCE_ID,
      accepted: true,
      noticeVersion: "old-version",
    },
    {
      sourceChatId: "bad",
      sourceDocumentId: SOURCE_ID,
      accepted: true,
      noticeVersion: PROJECT_DOCUMENT_IMPORT_NOTICE_VERSION,
    },
  ]) {
    const response = await handlers.createImportConsentAcknowledgement(
      jsonRequest("https://local.test", body),
      PROJECT_ID
    );
    assert.equal(response.status, 400);
  }
  const missing = await handlers.importChatDocument(
    jsonRequest("https://local.test", {
      operationId: "import-2",
      expectedProjectRevision: 4,
      sourceChatId: CHAT_ID,
      sourceDocumentId: SOURCE_ID,
    }),
    PROJECT_ID
  );
  assert.equal(missing.status, 400);
  assert.equal(calls.length, 0);
});

test("metadata lookup uses only authenticated actor and hides cross-owner absence uniformly", async () => {
  const { app, calls } = makeApplication({
    getMetadata: async (input) => {
      calls.push({ name: "getMetadata", input });
      return null;
    },
  });
  const { handlers } = makeHandlers({ application: app });
  const response = await handlers.metadata(
    request("https://local.test"),
    PROJECT_ID,
    ASSET_ID
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Document not found." });
  assert.equal(
    (calls[0]?.input as { actorUserId: string }).actorUserId,
    ACTOR_ID
  );
});

test("application permission denials conceal asset ownership and lifecycle conflicts stay typed", async () => {
  const forbidden = makeApplication({
    getMetadata: async () => {
      throw new ProjectDocumentApplicationError("project_forbidden");
    },
  });
  const forbiddenResponse = await makeHandlers({
    application: forbidden.app,
  }).handlers.metadata(request("https://local.test"), PROJECT_ID, ASSET_ID);
  assert.equal(forbiddenResponse.status, 404);
  assert.deepEqual(await forbiddenResponse.json(), {
    error: "Document not found.",
  });

  const stale = makeApplication({
    withdraw: async () => {
      throw new ProjectDocumentApplicationError("revision_conflict");
    },
  });
  const staleResponse = await makeHandlers({
    application: stale.app,
  }).handlers.withdraw(
    jsonRequest("https://local.test", {
      operationId: "withdraw-stale",
      expectedProjectRevision: 4,
    }),
    PROJECT_ID,
    ASSET_ID
  );
  assert.equal(staleResponse.status, 409);
  assert.deepEqual(await staleResponse.json(), {
    error: "Project document state changed. Refresh and try again.",
  });
});

test("download requires exact-version clean authorization and verifies returned bytes", async () => {
  const { app } = makeApplication();
  const { handlers } = makeHandlers({ application: app });
  const response = await handlers.download(
    request(`https://local.test/?versionId=${VERSION_ID}`),
    PROJECT_ID,
    ASSET_ID
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await response.text(), new TextDecoder().decode(SAMPLE));

  const untrusted = makeApplication({
    download: async () => ({
      filename: "notes.txt",
      canonicalMime: "text/plain",
      bytes: SAMPLE,
      expectedSha256: DIGEST,
      expectedByteSize: SAMPLE.byteLength,
      storageStatus: "stored",
      securityStatus: "clean",
      exactVersionCleanAuthorized: false,
    }),
  });
  const blocked = await makeHandlers({
    application: untrusted.app,
  }).handlers.download(
    request(`https://local.test/?versionId=${VERSION_ID}`),
    PROJECT_ID,
    ASSET_ID
  );
  assert.equal(blocked.status, 503);
});

test("download rejects modified bytes, invalid verdict, or missing exact-version proof", async () => {
  const altered = new TextEncoder().encode("modified");
  const app = makeApplication({
    download: async () => ({
      filename: "notes.txt",
      canonicalMime: "text/plain",
      bytes: altered,
      expectedSha256: DIGEST,
      expectedByteSize: SAMPLE.byteLength,
      storageStatus: "stored",
      securityStatus: "clean",
      exactVersionCleanAuthorized: true,
    }),
  });
  const response = await makeHandlers({
    application: app.app,
  }).handlers.download(
    request(`https://local.test/?versionId=${VERSION_ID}`),
    PROJECT_ID,
    ASSET_ID
  );
  assert.equal(response.status, 503);

  const rejected = makeApplication({
    download: async () =>
      ({
        filename: "notes.txt",
        canonicalMime: "text/plain",
        bytes: SAMPLE,
        expectedSha256: DIGEST,
        expectedByteSize: SAMPLE.byteLength,
        storageStatus: "stored",
        securityStatus: "rejected",
        exactVersionCleanAuthorized: true,
      }) as never,
  });
  const rejectedResponse = await makeHandlers({
    application: rejected.app,
  }).handlers.download(
    request(`https://local.test/?versionId=${VERSION_ID}`),
    PROJECT_ID,
    ASSET_ID
  );
  assert.equal(rejectedResponse.status, 503);
});

test("withdrawal and creator-grant revocation require operation IDs and revisions", async () => {
  const { app, calls } = makeApplication();
  const { handlers } = makeHandlers({ application: app });
  const valid = { operationId: "withdraw-1", expectedProjectRevision: 4 };
  const invalid = await handlers.withdraw(
    jsonRequest("https://local.test", { ...valid, expectedProjectRevision: 0 }),
    PROJECT_ID,
    ASSET_ID
  );
  assert.equal(invalid.status, 400);
  const withdrawn = await handlers.withdraw(
    jsonRequest("https://local.test", valid),
    PROJECT_ID,
    ASSET_ID
  );
  assert.equal(withdrawn.status, 200);
  const revoked = await handlers.revokeGrant(
    jsonRequest("https://local.test", valid),
    PROJECT_ID,
    ASSET_ID
  );
  assert.equal(revoked.status, 200);
  assert.equal(
    calls.some((call) => call.name === "withdraw"),
    true
  );
  assert.equal(
    calls.some((call) => call.name === "revokeCreatorGrant"),
    true
  );
});

test("mutation responses strip private application fields and preserve replay semantics", async () => {
  const privateFields = {
    storageKey: "private/project/object/key",
    internalScanMetadata: { scannerJobId: "private-scan-job" },
    providerIdentifier: "private-provider-object-id",
  };
  const baseOperation = {
    operationId: "upload-private",
    assetId: ASSET_ID,
    versionId: VERSION_ID,
    status: "intent_created" as const,
    storageStatus: "pending" as const,
    securityStatus: "pending" as const,
    projectRevision: 4,
    replayed: true,
  };
  const { app } = makeApplication({
    async createDirectUpload() {
      return { ...baseOperation, ...privateFields } as never;
    },
    async importOwnedChatDocument() {
      return {
        ...baseOperation,
        operationId: "import-private",
        ...privateFields,
      } as never;
    },
    async withdraw() {
      return {
        assetId: ASSET_ID,
        lifecycle: "withdrawn",
        projectRevision: 5,
        replayed: true,
        ...privateFields,
      } as never;
    },
    async revokeCreatorGrant() {
      return {
        grantId: SOURCE_ID,
        revoked: true,
        replayed: true,
        ...privateFields,
      } as never;
    },
  });
  const { handlers } = makeHandlers({ application: app });
  const upload = await handlers.upload(
    request("https://local.test", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-operation-id": "upload-private",
        "x-expected-project-revision": "3",
        "x-original-filename": "notes.txt",
      },
      body: SAMPLE,
    }),
    PROJECT_ID
  );
  const imported = await handlers.importChatDocument(
    jsonRequest("https://local.test", {
      operationId: "import-private",
      expectedProjectRevision: 4,
      sourceChatId: CHAT_ID,
      sourceDocumentId: SOURCE_ID,
      consentAcknowledgement: "a-valid-server-issued-consent-token-123456",
    }),
    PROJECT_ID
  );
  const withdrawn = await handlers.withdraw(
    jsonRequest("https://local.test", {
      operationId: "withdraw-private",
      expectedProjectRevision: 4,
    }),
    PROJECT_ID,
    ASSET_ID
  );
  const revoked = await handlers.revokeGrant(
    jsonRequest("https://local.test", {
      operationId: "revoke-private",
      expectedProjectRevision: 4,
    }),
    PROJECT_ID,
    SOURCE_ID
  );

  for (const response of [upload, imported, withdrawn, revoked]) {
    const bodyText = await response.text();
    assert.doesNotMatch(
      bodyText,
      /storageKey|internalScanMetadata|scannerJobId|providerIdentifier|private-provider-object-id|private\/project/u
    );
    assert.equal(response.status, 200);
    const body = JSON.parse(bodyText);
    const result = body.document ?? body.grant;
    assert.equal(result.replayed, true);
  }
});

test("malformed mutation results fail closed instead of reaching the response", async () => {
  const { app } = makeApplication({
    async createDirectUpload() {
      return { operationId: "other-operation", replayed: false } as never;
    },
    async importOwnedChatDocument() {
      return { operationId: "import-invalid", assetId: ASSET_ID } as never;
    },
    async withdraw() {
      return { assetId: ASSET_ID, lifecycle: "active" } as never;
    },
    async revokeCreatorGrant() {
      return { grantId: SOURCE_ID, revoked: false } as never;
    },
  });
  const { handlers } = makeHandlers({ application: app });
  const upload = await handlers.upload(
    request("https://local.test", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-operation-id": "upload-invalid",
        "x-expected-project-revision": "3",
        "x-original-filename": "notes.txt",
      },
      body: SAMPLE,
    }),
    PROJECT_ID
  );
  const imported = await handlers.importChatDocument(
    jsonRequest("https://local.test", {
      operationId: "import-invalid",
      expectedProjectRevision: 4,
      sourceChatId: CHAT_ID,
      sourceDocumentId: SOURCE_ID,
      consentAcknowledgement: "a-valid-server-issued-consent-token-123456",
    }),
    PROJECT_ID
  );
  const withdrawn = await handlers.withdraw(
    jsonRequest("https://local.test", {
      operationId: "withdraw-invalid",
      expectedProjectRevision: 4,
    }),
    PROJECT_ID,
    ASSET_ID
  );
  const revoked = await handlers.revokeGrant(
    jsonRequest("https://local.test", {
      operationId: "revoke-invalid",
      expectedProjectRevision: 4,
    }),
    PROJECT_ID,
    SOURCE_ID
  );
  for (const response of [upload, imported, withdrawn, revoked]) {
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.doesNotMatch(
      body,
      /storageKey|internalScanMetadata|scannerJobId|providerIdentifier/u
    );
    assert.match(body, /^\{"error":"[^"\r\n]+"\}$/u);
  }
});

test("rate cap and schema outage fail closed with private responses", async () => {
  const limited = makeHandlers({ rateLimit: async () => false });
  const limitedResponse = await limited.handlers.list(
    request("https://local.test"),
    PROJECT_ID
  );
  assert.equal(limitedResponse.status, 429);
  assert.equal(
    limitedResponse.headers.get("cache-control"),
    "private, no-store"
  );

  const unavailable = makeHandlers({ schema: false });
  const unavailableResponse = await unavailable.handlers.list(
    request("https://local.test"),
    PROJECT_ID
  );
  assert.equal(unavailableResponse.status, 503);
});

test("malformed project and asset identifiers do not reach application methods", async () => {
  const { app, calls } = makeApplication();
  const { handlers } = makeHandlers({ application: app });
  assert.equal(
    (await handlers.list(request("https://local.test"), "bad")).status,
    400
  );
  assert.equal(
    (await handlers.metadata(request("https://local.test"), PROJECT_ID, "bad"))
      .status,
    404
  );
  assert.equal(calls.length, 0);
});
