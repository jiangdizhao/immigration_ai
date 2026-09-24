// biome-ignore-all lint/suspicious/useAwait: repository doubles intentionally return plain values from fake async methods.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { MatterDocument } from "@/lib/db/schema";
import { createMatterDocumentHandlers } from "./http";
import { MemoryMatterDocumentStorage } from "./memory-storage";
import { createMatterDocumentService } from "./service";
import type { MatterDocumentRepository } from "./types";
import { MAX_MATTER_DOCUMENT_BYTES } from "./validation";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const CHAT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOC_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PDF = new TextEncoder().encode("%PDF-1.7\nfixture");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeRecord(overrides: Partial<MatterDocument> = {}): MatterDocument {
  const now = new Date("2026-09-24T00:00:00.000Z");
  return {
    id: DOC_ID,
    userId: USER_A,
    chatId: CHAT_A,
    legalMatterId: "matter-server-value",
    originalFilename: "passport.pdf",
    storageKey: "matter-documents/server-generated-key",
    mimeType: "application/pdf",
    byteSize: PDF.byteLength,
    sha256: createHash("sha256").update(PDF).digest("hex"),
    processingStatus: "not_started",
    securityStatus: "pending",
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeHarness(
  options: {
    authenticatedUser?: {
      userId: string;
      type: "guest" | "regular";
      role: "user" | "lawyer" | "admin";
    } | null;
    failStoragePut?: boolean;
    failCreate?: boolean;
    existingRecord?: MatterDocument;
  } = {}
) {
  const conversations = new Map([
    [CHAT_A, { userId: USER_A, legalMatterId: "matter-server-value" }],
    [CHAT_B, { userId: USER_B, legalMatterId: "matter-user-b" }],
  ]);
  const records = new Map<string, MatterDocument>();
  if (options.existingRecord) {
    records.set(options.existingRecord.id, options.existingRecord);
  }
  let createdCount = 0;
  const repository: MatterDocumentRepository = {
    async getOwnedConversation({ chatId, userId }) {
      const conversation = conversations.get(chatId);
      return conversation?.userId === userId
        ? { legalMatterId: conversation.legalMatterId }
        : null;
    },
    async create(input) {
      if (options.failCreate) {
        throw new Error("db down");
      }
      createdCount += 1;
      const record = makeRecord({
        ...input,
        id:
          createdCount === 1
            ? DOC_ID
            : `dddddddd-dddd-4ddd-8ddd-${String(createdCount).padStart(12, "0")}`,
        createdAt: new Date("2026-09-24T00:00:00.000Z"),
        updatedAt: new Date("2026-09-24T00:00:00.000Z"),
      });
      records.set(record.id, record);
      return record;
    },
    async list({ chatId, userId }) {
      return [...records.values()].filter(
        (record) =>
          record.chatId === chatId &&
          record.userId === userId &&
          record.deletedAt === null
      );
    },
    async getForOwner({ documentId, userId, includeDeleted = false }) {
      const record = records.get(documentId);
      if (
        !record ||
        record.userId !== userId ||
        conversations.get(record.chatId)?.userId !== userId ||
        (!includeDeleted && record.deletedAt !== null)
      ) {
        return null;
      }
      return record;
    },
    async softDelete({ documentId, userId, deletedAt }) {
      const record = await this.getForOwner({ documentId, userId });
      if (!record) {
        return null;
      }
      const deleted = { ...record, deletedAt, updatedAt: deletedAt };
      records.set(documentId, deleted);
      return deleted;
    },
  };
  const storage = new MemoryMatterDocumentStorage();
  const basePut = storage.put.bind(storage);
  storage.put = async (input) => {
    if (options.failStoragePut) {
      throw new Error("storage down");
    }
    await basePut(input);
    if (options.failAfterStoragePut) {
      throw new Error("storage response lost after write");
    }
  };
  const service = createMatterDocumentService({
    repository,
    storage,
    newId: () => "generated-object-id",
    now: () => new Date("2026-09-25T00:00:00.000Z"),
  });
  const handlers = createMatterDocumentHandlers({
    authenticate: async () => options.authenticatedUser ?? null,
    service,
  });
  return { handlers, records, storage, repository, service };
}

function userA() {
  return { userId: USER_A, type: "regular" as const, role: "user" as const };
}

function request(method: string, path: string, init: RequestInit = {}) {
  return new Request(`https://app.test${path}`, { method, ...init });
}

function uploadRequest(
  chatId: string,
  filename: string,
  mime: string,
  bytes: Uint8Array
) {
  return request("POST", `/api/matter-documents?chatId=${chatId}`, {
    headers: {
      "content-type": mime,
      "x-original-filename": encodeURIComponent(filename),
    },
    body: bytes,
  });
}

test("authenticated owner uploads PDF and only safe metadata is returned", async () => {
  const h = makeHarness({ authenticatedUser: userA() });
  const response = await h.handlers.upload(
    uploadRequest(CHAT_A, "../../passport.pdf", "application/pdf", PDF)
  );
  assert.equal(response.status, 201);
  const body = (await response.json()) as { document: Record<string, unknown> };
  assert.equal(body.document.chatId, CHAT_A);
  assert.equal(body.document.originalFilename, "passport.pdf");
  assert.equal(body.document.legalMatterId, "matter-server-value");
  assert.equal(body.document.byteSize, PDF.byteLength);
  assert.equal(
    body.document.sha256,
    createHash("sha256").update(PDF).digest("hex")
  );
  assert.equal(body.document.securityStatus, "pending");
  assert.equal(body.document.processingStatus, "not_started");
  assert.equal("storageKey" in body.document, false);
  assert.equal("url" in body.document, false);
  assert.equal(
    [...h.storage.objects.keys()][0],
    "matter-documents/generated-object-id"
  );
  assert.equal(h.records.size, 1);
});

test("valid JPEG and PNG signatures are accepted", async () => {
  for (const [bytes, name, mime] of [
    [JPEG, "photo.jpg", "image/jpeg"],
    [PNG, "scan.png", "image/png"],
  ] as const) {
    const h = makeHarness({ authenticatedUser: userA() });
    const response = await h.handlers.upload(
      uploadRequest(CHAT_A, name, mime, bytes)
    );
    assert.equal(response.status, 201);
  }
});

test("anonymous and non-customer sessions cannot use document APIs", async () => {
  const anonymous = makeHarness();
  assert.equal(
    (
      await anonymous.handlers.upload(
        uploadRequest(CHAT_A, "passport.pdf", "application/pdf", PDF)
      )
    ).status,
    401
  );
  assert.equal(
    (
      await anonymous.handlers.list(
        request("GET", `/api/matter-documents?chatId=${CHAT_A}`)
      )
    ).status,
    401
  );
  assert.equal(
    (await anonymous.handlers.metadata(request("GET", "/"), DOC_ID)).status,
    401
  );
  assert.equal(
    (await anonymous.handlers.download(request("GET", "/"), DOC_ID)).status,
    401
  );
  assert.equal(
    (await anonymous.handlers.delete(request("DELETE", "/"), DOC_ID)).status,
    401
  );

  for (const identity of [
    { userId: USER_A, type: "guest" as const, role: "user" as const },
    { userId: USER_A, type: "regular" as const, role: "lawyer" as const },
    { userId: USER_A, type: "regular" as const, role: "admin" as const },
  ]) {
    const h = makeHarness({ authenticatedUser: identity });
    assert.equal(
      (
        await h.handlers.list(
          request("GET", `/api/matter-documents?chatId=${CHAT_A}`)
        )
      ).status,
      403
    );
  }
});

test("foreign conversation upload and list use not-found semantics", async () => {
  const h = makeHarness({ authenticatedUser: userA() });
  assert.equal(
    (
      await h.handlers.upload(
        uploadRequest(CHAT_B, "passport.pdf", "application/pdf", PDF)
      )
    ).status,
    404
  );
  assert.equal(
    (
      await h.handlers.list(
        request("GET", `/api/matter-documents?chatId=${CHAT_B}`)
      )
    ).status,
    404
  );
  assert.equal(h.storage.objects.size, 0);
  assert.equal(h.records.size, 0);
});

test("foreign metadata, download, and delete are indistinguishable from missing", async () => {
  const h = makeHarness({
    authenticatedUser: userA(),
    existingRecord: makeRecord({ userId: USER_B, chatId: CHAT_B }),
  });
  assert.equal(
    (await h.handlers.metadata(request("GET", "/"), DOC_ID)).status,
    404
  );
  assert.equal(
    (await h.handlers.download(request("GET", "/"), DOC_ID)).status,
    404
  );
  assert.equal(
    (await h.handlers.delete(request("DELETE", "/"), DOC_ID)).status,
    404
  );
});

test("owner can list metadata and download only through private authorized route", async () => {
  const h = makeHarness({
    authenticatedUser: userA(),
    existingRecord: makeRecord(),
  });
  await h.storage.put({
    key: "matter-documents/server-generated-key",
    body: PDF,
    contentType: "application/pdf",
    sha256: makeRecord().sha256,
  });
  const list = await h.handlers.list(
    request("GET", `/api/matter-documents?chatId=${CHAT_A}`)
  );
  const listed = (await list.json()) as {
    documents: Record<string, unknown>[];
  };
  assert.equal(listed.documents.length, 1);
  const listedDocument = listed.documents.at(0);
  assert.ok(listedDocument);
  assert.equal("storageKey" in listedDocument, false);
  const metadata = await h.handlers.metadata(request("GET", "/"), DOC_ID);
  assert.equal(metadata.status, 200);
  assert.equal(metadata.headers.get("cache-control"), "private, no-store");

  const download = await h.handlers.download(request("GET", "/"), DOC_ID);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/pdf");
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.match(download.headers.get("content-disposition") ?? "", /attachment/);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), PDF);
});

test("unsupported MIME, signature mismatch, malformed, and wrong-extension files fail", async () => {
  const invalidCases = [
    [
      "passport.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      PDF,
    ],
    ["passport.pdf", "application/pdf", new Uint8Array([0x4d, 0x5a, 0x90, 0])],
    ["empty.pdf", "application/pdf", new Uint8Array()],
    ["wrong.jpg", "image/jpeg", PNG],
    ["passport.jpg", "application/pdf", PDF],
  ] as const;
  for (const [filename, mime, bytes] of invalidCases) {
    const h = makeHarness({ authenticatedUser: userA() });
    assert.equal(
      (await h.handlers.upload(uploadRequest(CHAT_A, filename, mime, bytes)))
        .status,
      400
    );
    assert.equal(h.records.size, 0);
    assert.equal(h.storage.objects.size, 0);
  }
});

test("oversized uploads are rejected at the HTTP boundary", async () => {
  const h = makeHarness({ authenticatedUser: userA() });
  const oversized = request("POST", `/api/matter-documents?chatId=${CHAT_A}`, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(MAX_MATTER_DOCUMENT_BYTES + 1),
      "x-original-filename": "large.pdf",
    },
    body: PDF,
  });
  assert.equal((await h.handlers.upload(oversized)).status, 413);
  assert.equal(h.records.size, 0);
});

test("storage failures and metadata failures do not report a successful upload", async () => {
  const storageFailure = makeHarness({
    authenticatedUser: userA(),
    failStoragePut: true,
  });
  assert.equal(
    (
      await storageFailure.handlers.upload(
        uploadRequest(CHAT_A, "passport.pdf", "application/pdf", PDF)
      )
    ).status,
    503
  );
  assert.equal(storageFailure.records.size, 0);
  const partialStorageFailure = makeHarness({
    authenticatedUser: userA(),
    failAfterStoragePut: true,
  });
  assert.equal(
    (
      await partialStorageFailure.handlers.upload(
        uploadRequest(CHAT_A, "passport.pdf", "application/pdf", PDF)
      )
    ).status,
    503
  );
  assert.equal(partialStorageFailure.records.size, 0);
  assert.equal(partialStorageFailure.storage.objects.size, 0);

  const metadataFailure = makeHarness({
    authenticatedUser: userA(),
    failCreate: true,
  });
  assert.equal(
    (
      await metadataFailure.handlers.upload(
        uploadRequest(CHAT_A, "passport.pdf", "application/pdf", PDF)
      )
    ).status,
    503
  );
  assert.equal(metadataFailure.records.size, 0);
  assert.equal(metadataFailure.storage.objects.size, 0);
});

test("soft deletion hides documents and is idempotent while retaining private bytes", async () => {
  const record = makeRecord();
  const h = makeHarness({ authenticatedUser: userA(), existingRecord: record });
  await h.storage.put({
    key: record.storageKey,
    body: PDF,
    contentType: record.mimeType,
    sha256: record.sha256,
  });
  assert.equal(
    (await h.handlers.delete(request("DELETE", "/"), DOC_ID)).status,
    204
  );
  assert.equal(
    (await h.handlers.delete(request("DELETE", "/"), DOC_ID)).status,
    204
  );
  assert.equal(
    (await h.handlers.metadata(request("GET", "/"), DOC_ID)).status,
    404
  );
  assert.equal(
    (await h.handlers.download(request("GET", "/"), DOC_ID)).status,
    404
  );
  const list = await h.handlers.list(
    request("GET", `/api/matter-documents?chatId=${CHAT_A}`)
  );
  assert.equal(
    ((await list.json()) as { documents: unknown[] }).documents.length,
    0
  );
  assert.equal(h.storage.objects.size, 1);
});

test("downloads fail closed when the stored bytes do not match metadata integrity", async () => {
  const record = makeRecord();
  const h = makeHarness({ authenticatedUser: userA(), existingRecord: record });
  await h.storage.put({
    key: record.storageKey,
    body: JPEG,
    contentType: "image/jpeg",
    sha256: record.sha256,
  });
  assert.equal(
    (await h.handlers.download(request("GET", "/"), DOC_ID)).status,
    503
  );
});
