// biome-ignore-all lint/suspicious/useAwait: synchronous fake repository and storage adapters.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: repository assertion runs only when a test invokes deletion.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createChatDeletionService,
  MatterDocumentCleanupPendingError,
} from "./chat-deletion";

function harness() {
  const documents = new Map([
    [
      "chat-a",
      [
        {
          id: "doc-a",
          storageKey: "opaque-a",
          storageStatus: "stored" as const,
        },
      ],
    ],
    [
      "chat-b",
      [
        {
          id: "doc-b",
          storageKey: "opaque-b",
          storageStatus: "stored" as const,
        },
      ],
    ],
  ]);
  const objects = new Set(["opaque-a", "opaque-b"]);
  const deletedChats: string[] = [];
  let failKey: string | null = null;
  const service = createChatDeletionService({
    storage: {
      async delete({ key }) {
        if (key === failKey) {
          throw new Error("storage unavailable");
        }
        objects.delete(key);
      },
    },
    repository: {
      async listConversationDocuments(chatId) {
        return documents.get(chatId) ?? [];
      },
      async deleteConversationAndData({ chatId, documentIds }) {
        assert.deepEqual(
          (documents.get(chatId) ?? []).map(({ id }) => id),
          documentIds
        );
        documents.delete(chatId);
        deletedChats.push(chatId);
      },
      async listUserChatIds() {
        return [...documents.keys()];
      },
    },
  });
  return {
    service,
    documents,
    objects,
    deletedChats,
    fail(key: string | null) {
      failKey = key;
    },
  };
}

test("single chat without documents deletes normally", async () => {
  const h = harness();
  h.documents.delete("chat-a");
  await h.service.deleteChatById("chat-a");
  assert.deepEqual(h.deletedChats, ["chat-a"]);
});

test("single chat removes objects before metadata and retry retains metadata on failure", async () => {
  const h = harness();
  h.fail("opaque-a");
  await assert.rejects(
    h.service.deleteChatById("chat-a"),
    MatterDocumentCleanupPendingError
  );
  assert.equal(h.documents.has("chat-a"), true);
  assert.equal(h.objects.has("opaque-a"), true);
  assert.deepEqual(h.deletedChats, []);
  h.fail(null);
  await h.service.deleteChatById("chat-a");
  assert.equal(h.documents.has("chat-a"), false);
  assert.equal(h.objects.has("opaque-a"), false);
  await h.service.deleteChatById("chat-a");
  assert.deepEqual(h.deletedChats, ["chat-a", "chat-a"]);
  assert.equal(h.objects.has("opaque-a"), false);
});

test("bulk deletion continues after a per-chat object failure and supports retry", async () => {
  const h = harness();
  h.fail("opaque-b");
  assert.deepEqual(await h.service.deleteAllChatsByUserId("user"), {
    deletedCount: 1,
    cleanupPendingCount: 1,
  });
  assert.deepEqual(h.deletedChats, ["chat-a"]);
  assert.equal(h.documents.has("chat-b"), true);
  assert.equal(h.objects.has("opaque-b"), true);
  h.fail(null);
  assert.deepEqual(await h.service.deleteAllChatsByUserId("user"), {
    deletedCount: 1,
    cleanupPendingCount: 0,
  });
  assert.deepEqual(h.deletedChats, ["chat-a", "chat-b"]);
  assert.equal(h.objects.size, 0);
});

test("conversation deletion waits for an active upload to settle", async () => {
  const h = harness();
  h.documents.set("chat-a", [
    { id: "doc-a", storageKey: "opaque-a", storageStatus: "uploading" },
  ]);
  await assert.rejects(
    h.service.deleteChatById("chat-a"),
    MatterDocumentCleanupPendingError
  );
  assert.equal(h.documents.has("chat-a"), true);
  assert.equal(h.objects.has("opaque-a"), true);
  assert.deepEqual(h.deletedChats, []);
});
