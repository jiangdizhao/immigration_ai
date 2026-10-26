// biome-ignore-all lint/suspicious/useAwait: application and storage fakes model Promise-based ports.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: fake-port assertions execute inside test-triggered callbacks.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { ProjectDocumentS3ObjectStore } from "./aws/s3-object-store";
import { ProjectDocumentApplicationError } from "./http";
import { createPostgresProjectDocumentApplication } from "./postgres-application";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const ACTOR = "66666666-6666-4666-8666-666666666666";
const ASSET = "22222222-2222-4222-8222-222222222222";
const VERSION = "33333333-3333-4333-8333-333333333333";
const BYTES = new TextEncoder().encode("synthetic upload bytes\n");
const SHA = createHash("sha256").update(BYTES).digest("hex");
const OBJECT_VERSION = "synthetic-object-version-1";
const STORAGE_KEY = `project-document/${PROJECT}/${ASSET}/${VERSION}`;

function makeRepository(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const repository = {
    async createDirectUploadIntent(input: { actorUserId: string }) {
      calls.push("intent");
      assert.equal(input.actorUserId, ACTOR);
      return {
        operationId: "upload-1",
        operationType: "project_document_upload_intent" as const,
        projectId: PROJECT,
        assetId: ASSET,
        versionId: VERSION,
        generation: 1,
        status: "intent_created" as const,
        storageStatus: "pending" as const,
        securityStatus: "pending" as const,
        projectRevision: 4,
        replayed: false,
      };
    },
    async finalizeStorage() {
      calls.push("finalize");
      return {
        projectId: PROJECT,
        versionId: VERSION,
        generation: 1,
        status: "stored" as const,
        securityStatus: "pending" as const,
        projectRevision: 5,
        operationId: "service-op",
        replayed: false,
      };
    },
    async listGrantedMetadata() {
      return [];
    },
    async getExactVersionStorageDescriptor() {
      calls.push("authorize-before-read");
      return {
        projectId: PROJECT,
        assetId: ASSET,
        versionId: VERSION,
        storageKey: STORAGE_KEY,
        storageObjectVersionId: OBJECT_VERSION,
        sha256: SHA,
        byteSize: BYTES.byteLength,
        canonicalMime: "text/plain",
      };
    },
    async authorizeExactVersionRead() {
      calls.push("authorize-after-read");
      return {
        projectId: PROJECT,
        assetId: ASSET,
        versionId: VERSION,
        purpose: "download" as const,
      };
    },
    async withdrawDocument() {
      return {
        projectId: PROJECT,
        assetId: ASSET,
        lifecycle: "withdrawn" as const,
        projectRevision: 5,
        replayed: false,
      };
    },
    async revokeCreatorGrant() {
      return {
        projectId: PROJECT,
        grantId: ASSET,
        assetId: ASSET,
        versionId: VERSION,
        purpose: "metadata_read" as const,
        revokedAt: new Date().toISOString(),
        revision: 2,
        projectRevision: 5,
        replayed: false,
      };
    },
    ...overrides,
  };
  return { repository, calls };
}

function makeStore(
  calls: string[],
  overrides: Partial<ProjectDocumentS3ObjectStore> = {}
) {
  const store: ProjectDocumentS3ObjectStore = {
    async putNew(input) {
      calls.push("put");
      assert.equal(input.key, STORAGE_KEY);
      return {
        key: input.key,
        objectVersionId: OBJECT_VERSION,
        sha256: input.expectedSha256,
        byteSize: input.bytes.byteLength,
      };
    },
    async statIdentity(input) {
      return {
        key: input.key,
        objectVersionId: input.objectVersionId,
        sha256: input.expectedSha256,
        byteSize: input.expectedByteSize,
      };
    },
    async readVersion(input) {
      calls.push("read-version");
      return {
        identity: {
          key: input.key,
          objectVersionId: input.objectVersionId,
          sha256: input.expectedSha256,
          byteSize: input.expectedByteSize,
        },
        bytes: BYTES,
      };
    },
    ...overrides,
  };
  return store;
}

const uploadInput = {
  actorUserId: ACTOR,
  projectId: PROJECT,
  operationId: "upload-1",
  expectedProjectRevision: 4,
  filename: "evidence.txt",
  declaredMimeType: "text/plain",
  canonicalMime: "text/plain",
  formatId: "text",
  sha256: SHA,
  bytes: BYTES,
};

test("PostgreSQL adapter uses intent, exact-version byte verification, then durable storage finalization", async () => {
  const { repository, calls } = makeRepository();
  const issued: unknown[] = [];
  const app = createPostgresProjectDocumentApplication({
    repository: repository as never,
    objectStore: makeStore(calls),
    async issueVerifiedStorageResult(value) {
      issued.push(value);
      calls.push("issue-storage-capability");
      return value;
    },
  });
  const result = await app.createDirectUpload(uploadInput);
  assert.deepEqual(calls, [
    "intent",
    "put",
    "read-version",
    "issue-storage-capability",
    "finalize",
  ]);
  assert.equal(issued.length, 1);
  assert.deepEqual(result, {
    operationId: "upload-1",
    assetId: ASSET,
    versionId: VERSION,
    status: "stored",
    storageStatus: "stored",
    securityStatus: "pending",
    projectRevision: 5,
    replayed: false,
  });
});

test("missing storage-result capability is rejected before the durable intent", async () => {
  const { repository, calls } = makeRepository();
  const app = createPostgresProjectDocumentApplication({
    repository: repository as never,
    objectStore: makeStore(calls),
  });

  await assert.rejects(
    app.createDirectUpload(uploadInput),
    (error: unknown) =>
      error instanceof ProjectDocumentApplicationError &&
      error.code === "storage_failed"
  );
  assert.deepEqual(calls, []);
});

test("put failure after intent reports recovery-needed and never finalizes", async () => {
  const { repository, calls } = makeRepository();
  const app = createPostgresProjectDocumentApplication({
    repository: repository as never,
    objectStore: makeStore(calls, {
      async putNew() {
        calls.push("put-ambiguous");
        throw new Error("write may have completed");
      },
    }),
    async issueVerifiedStorageResult(value) {
      return value;
    },
  });
  await assert.rejects(
    app.createDirectUpload(uploadInput),
    (error: unknown) =>
      error instanceof ProjectDocumentApplicationError &&
      error.code === "recovery_needed"
  );
  assert.deepEqual(calls, ["intent", "put-ambiguous"]);
});

test("read failure after object creation reports recovery-needed without another put", async () => {
  const { repository, calls } = makeRepository();
  const app = createPostgresProjectDocumentApplication({
    repository: repository as never,
    objectStore: makeStore(calls, {
      async readVersion() {
        calls.push("read-version-failed");
        throw new Error("stored object identity could not be verified");
      },
    }),
    async issueVerifiedStorageResult(value) {
      return value;
    },
  });

  await assert.rejects(
    app.createDirectUpload(uploadInput),
    (error: unknown) =>
      error instanceof ProjectDocumentApplicationError &&
      error.code === "recovery_needed"
  );
  assert.deepEqual(calls, ["intent", "put", "read-version-failed"]);
});

test("finalization failure reports recovery-needed after immutable object verification", async () => {
  const { repository, calls } = makeRepository({
    async finalizeStorage() {
      calls.push("finalize-failed");
      throw new Error("database commit outcome unavailable");
    },
  });
  const app = createPostgresProjectDocumentApplication({
    repository: repository as never,
    objectStore: makeStore(calls),
    async issueVerifiedStorageResult(value) {
      calls.push("issue-storage-capability");
      return value;
    },
  });

  await assert.rejects(
    app.createDirectUpload(uploadInput),
    (error: unknown) =>
      error instanceof ProjectDocumentApplicationError &&
      error.code === "recovery_needed"
  );
  assert.deepEqual(calls, [
    "intent",
    "put",
    "read-version",
    "issue-storage-capability",
    "finalize-failed",
  ]);
});

test("identical pending replay requires recovery and never rewrites the existing key", async () => {
  const { calls } = makeRepository({
    async createDirectUploadIntent() {
      calls.push("intent");
      return {
        operationId: "upload-1",
        operationType: "project_document_upload_intent" as const,
        projectId: PROJECT,
        assetId: ASSET,
        versionId: VERSION,
        generation: 1,
        status: "intent_created" as const,
        storageStatus: "pending" as const,
        securityStatus: "pending" as const,
        projectRevision: 4,
        replayed: true,
      };
    },
  });
  const app = createPostgresProjectDocumentApplication({
    repository: makeRepository({
      async createDirectUploadIntent() {
        calls.push("intent");
        return {
          operationId: "upload-1",
          operationType: "project_document_upload_intent" as const,
          projectId: PROJECT,
          assetId: ASSET,
          versionId: VERSION,
          generation: 1,
          status: "intent_created" as const,
          storageStatus: "pending" as const,
          securityStatus: "pending" as const,
          projectRevision: 4,
          replayed: true,
        };
      },
    }).repository as never,
    objectStore: makeStore(calls),
    async issueVerifiedStorageResult(value) {
      return value;
    },
  });
  await assert.rejects(
    app.createDirectUpload(uploadInput),
    (error: unknown) =>
      error instanceof ProjectDocumentApplicationError &&
      error.code === "recovery_needed"
  );
  assert.deepEqual(calls, ["intent"]);
});

test("identical completed replay returns durable success without storage operations", async () => {
  const { calls } = makeRepository();
  const app = createPostgresProjectDocumentApplication({
    repository: makeRepository({
      async createDirectUploadIntent() {
        calls.push("intent");
        return {
          operationId: "upload-1",
          operationType: "project_document_upload_intent" as const,
          projectId: PROJECT,
          assetId: ASSET,
          versionId: VERSION,
          generation: 1,
          status: "stored" as const,
          storageStatus: "stored" as const,
          securityStatus: "pending" as const,
          projectRevision: 5,
          replayed: true,
        };
      },
    }).repository as never,
    objectStore: makeStore(calls),
    async issueVerifiedStorageResult(value) {
      return value;
    },
  });

  const result = await app.createDirectUpload(uploadInput);
  assert.equal(result.status, "stored");
  assert.equal(result.storageStatus, "stored");
  assert.equal(result.securityStatus, "pending");
  assert.equal(result.replayed, true);
  assert.deepEqual(calls, ["intent"]);
});

test("import consent and source import fail closed before any source reader is available", async () => {
  const { repository, calls } = makeRepository();
  const app = createPostgresProjectDocumentApplication({
    repository: repository as never,
    objectStore: makeStore(calls),
  });
  await assert.rejects(
    app.issueImportConsentAcknowledgement({
      actorUserId: ACTOR,
      projectId: PROJECT,
      sourceChatId: PROJECT,
      sourceDocumentId: ASSET,
      consentAccepted: true,
      noticeVersion: "project-document-import-v1",
    }),
    (error: unknown) =>
      error instanceof ProjectDocumentApplicationError &&
      error.code === "consent_unverified"
  );
  await assert.rejects(
    app.importOwnedChatDocument({
      actorUserId: ACTOR,
      projectId: PROJECT,
      operationId: "import-1",
      expectedProjectRevision: 1,
      sourceChatId: PROJECT,
      sourceDocumentId: ASSET,
      consentAcknowledgement: "fake-token-that-must-not-be-trusted-123456",
    }),
    (error: unknown) =>
      error instanceof ProjectDocumentApplicationError &&
      error.code === "consent_unverified"
  );
  assert.deepEqual(calls, []);
});

test("exact-version download requires injected trusted scan readiness and rechecks grants after bytes", async () => {
  const { repository, calls } = makeRepository();
  let trusted = false;
  const app = createPostgresProjectDocumentApplication({
    repository: repository as never,
    objectStore: makeStore(calls),
    async trustedScanReadiness() {
      calls.push("scan-readiness");
      return trusted;
    },
  });
  assert.equal(
    await app.download({
      actorUserId: ACTOR,
      projectId: PROJECT,
      assetId: ASSET,
      versionId: VERSION,
    }),
    null
  );
  assert.deepEqual(calls, ["authorize-before-read", "scan-readiness"]);

  calls.length = 0;
  trusted = true;
  const result = await app.download({
    actorUserId: ACTOR,
    projectId: PROJECT,
    assetId: ASSET,
    versionId: VERSION,
  });
  assert.ok(result);
  assert.equal(result.exactVersionCleanAuthorized, true);
  assert.deepEqual(calls, [
    "authorize-before-read",
    "scan-readiness",
    "read-version",
    "authorize-after-read",
  ]);
});

test("exact-version download rejects bytes that contradict the authorized descriptor", async () => {
  const { repository, calls } = makeRepository();
  const app = createPostgresProjectDocumentApplication({
    repository: repository as never,
    objectStore: makeStore(calls, {
      async readVersion(input) {
        calls.push("read-version-mismatch");
        return {
          identity: {
            key: input.key,
            objectVersionId: input.objectVersionId,
            sha256: input.expectedSha256,
            byteSize: input.expectedByteSize,
          },
          bytes: new TextEncoder().encode("substituted bytes"),
        };
      },
    }),
    async trustedScanReadiness() {
      return true;
    },
  });

  await assert.rejects(
    app.download({
      actorUserId: ACTOR,
      projectId: PROJECT,
      assetId: ASSET,
      versionId: VERSION,
    }),
    (error: unknown) =>
      error instanceof ProjectDocumentApplicationError &&
      error.code === "storage_failed"
  );
  assert.deepEqual(calls, ["authorize-before-read", "read-version-mismatch"]);
});
