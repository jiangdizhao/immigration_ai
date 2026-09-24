import type { MatterDocumentStorage } from "./types";

export type ConversationDocumentRef = {
  id: string;
  storageKey: string;
  storageStatus: "uploading" | "stored" | "cleanup_pending" | "storage_failed";
};

export class MatterDocumentCleanupPendingError extends Error {
  readonly failedObjectCount: number;

  constructor(failedObjectCount: number) {
    super("Private conversation documents could not be safely removed.");
    this.name = "MatterDocumentCleanupPendingError";
    this.failedObjectCount = failedObjectCount;
  }
}

export type ChatDeletionRepository = {
  listConversationDocuments(chatId: string): Promise<ConversationDocumentRef[]>;
  deleteConversationAndData(input: {
    chatId: string;
    documentIds: string[];
  }): Promise<unknown>;
  listUserChatIds(userId: string): Promise<string[]>;
};

export function createChatDeletionService(deps: {
  repository: ChatDeletionRepository;
  storage: Pick<MatterDocumentStorage, "delete">;
}) {
  async function deleteOne(chatId: string) {
    const documents = await deps.repository.listConversationDocuments(chatId);
    if (documents.some(({ storageStatus }) => storageStatus === "uploading")) {
      throw new MatterDocumentCleanupPendingError(1);
    }
    const failures: unknown[] = [];
    for (const document of documents) {
      try {
        await deps.storage.delete({ key: document.storageKey });
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new MatterDocumentCleanupPendingError(failures.length);
    }
    return deps.repository.deleteConversationAndData({
      chatId,
      documentIds: documents.map(({ id }) => id),
    });
  }

  return {
    deleteChatById: deleteOne,
    async deleteAllChatsByUserId(userId: string) {
      const chatIds = await deps.repository.listUserChatIds(userId);
      let deletedCount = 0;
      let cleanupPendingCount = 0;
      for (const chatId of chatIds) {
        try {
          await deleteOne(chatId);
          deletedCount += 1;
        } catch (error) {
          if (!(error instanceof MatterDocumentCleanupPendingError)) {
            throw error;
          }
          cleanupPendingCount += 1;
        }
      }
      return { deletedCount, cleanupPendingCount };
    },
  };
}
