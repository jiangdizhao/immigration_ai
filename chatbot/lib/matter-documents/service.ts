import { createHash, randomUUID } from "node:crypto";
import type { MatterDocument } from "@/lib/db/schema";
import type {
  MatterDocumentRepository,
  MatterDocumentStorage,
  PublicMatterDocument,
} from "./types";
import { validateMatterDocument } from "./validation";

export class MatterDocumentNotFoundError extends Error {
  constructor() {
    super("Document not found.");
    this.name = "MatterDocumentNotFoundError";
  }
}

export class MatterDocumentStorageError extends Error {
  constructor() {
    super("Document storage is temporarily unavailable.");
    this.name = "MatterDocumentStorageError";
  }
}

export function publicMatterDocument(
  record: MatterDocument
): PublicMatterDocument {
  return {
    id: record.id,
    chatId: record.chatId,
    legalMatterId: record.legalMatterId,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    sha256: record.sha256,
    processingStatus: record.processingStatus,
    securityStatus: record.securityStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function createMatterDocumentService(deps: {
  repository: MatterDocumentRepository;
  storage: MatterDocumentStorage;
  newId?: () => string;
  now?: () => Date;
}) {
  const newId = deps.newId ?? randomUUID;
  const now = deps.now ?? (() => new Date());

  async function cleanupUpload(documentId: string): Promise<boolean> {
    const record = await deps.repository.getForStorageCleanup(documentId);
    if (!record || record.storageStatus === "stored") {
      return false;
    }
    let pending = record;
    if (record.storageStatus !== "cleanup_pending") {
      const transitioned = await deps.repository.transitionStorageStatus({
        documentId,
        expected:
          record.storageStatus === "uploading"
            ? ["uploading"]
            : ["storage_failed"],
        next: "cleanup_pending",
      });
      if (!transitioned) {
        const latest = await deps.repository.getForStorageCleanup(documentId);
        if (latest?.storageStatus === "storage_failed") {
          return true;
        }
        if (latest?.storageStatus === "stored") {
          return false;
        }
        throw new MatterDocumentStorageError();
      }
      pending = transitioned;
    }

    try {
      await deps.storage.delete({ key: pending.storageKey });
    } catch {
      throw new MatterDocumentStorageError();
    }

    const cleaned = await deps.repository.transitionStorageStatus({
      documentId,
      expected: ["cleanup_pending"],
      next: "storage_failed",
    });
    if (!cleaned) {
      const latest = await deps.repository.getForStorageCleanup(documentId);
      if (latest?.storageStatus === "storage_failed") {
        return true;
      }
      if (latest?.storageStatus === "stored") {
        return false;
      }
      throw new MatterDocumentStorageError();
    }
    return true;
  }

  return {
    cleanupUpload,
    async upload(input: {
      userId: string;
      chatId: string;
      filename: string;
      declaredMimeType: string;
      bytes: Uint8Array;
    }): Promise<PublicMatterDocument> {
      const conversation = await deps.repository.getOwnedConversation({
        chatId: input.chatId,
        userId: input.userId,
      });
      if (!conversation) {
        throw new MatterDocumentNotFoundError();
      }

      const validated = await validateMatterDocument({
        bytes: input.bytes,
        declaredMimeType: input.declaredMimeType,
        filename: input.filename,
      });
      const sha256 = createHash("sha256").update(input.bytes).digest("hex");
      const storageKey = `matter-documents/${newId()}`;
      let intent: MatterDocument;
      try {
        intent = await deps.repository.create({
          userId: input.userId,
          chatId: input.chatId,
          legalMatterId: conversation.legalMatterId,
          originalFilename: validated.originalFilename,
          storageKey,
          mimeType: validated.mimeType,
          byteSize: input.bytes.byteLength,
          sha256,
          processingStatus: "not_started",
          securityStatus: "pending",
          storageStatus: "uploading",
        });
      } catch {
        throw new MatterDocumentStorageError();
      }

      const storageInput = {
        key: storageKey,
        body: input.bytes,
        contentType: validated.mimeType,
        sha256,
      };
      try {
        await deps.storage.put(storageInput);
      } catch {
        await cleanupUpload(intent.id).catch(() => false);
        throw new MatterDocumentStorageError();
      }

      try {
        const stored = await deps.repository.transitionStorageStatus({
          documentId: intent.id,
          expected: ["uploading"],
          next: "stored",
        });
        if (!stored) {
          throw new MatterDocumentStorageError();
        }
        return publicMatterDocument(stored);
      } catch {
        // The original intent retains the storage key if the final state write
        // fails. Try durable cleanup; if the database is unavailable, the row
        // remains hidden in uploading and can be recovered later.
        await cleanupUpload(intent.id).catch(() => false);
        throw new MatterDocumentStorageError();
      }
    },

    async list(input: { userId: string; chatId: string }) {
      const conversation = await deps.repository.getOwnedConversation(input);
      if (!conversation) {
        throw new MatterDocumentNotFoundError();
      }
      return (await deps.repository.list(input)).map(publicMatterDocument);
    },

    async get(input: { userId: string; documentId: string }) {
      const record = await deps.repository.getForOwner(input);
      return record ? publicMatterDocument(record) : null;
    },

    async download(input: { userId: string; documentId: string }) {
      const record = await deps.repository.getForOwner(input);
      if (!record) {
        return null;
      }
      try {
        const bytes = await deps.storage.get({ key: record.storageKey });
        if (
          bytes.byteLength !== record.byteSize ||
          createHash("sha256").update(bytes).digest("hex") !== record.sha256
        ) {
          throw new MatterDocumentStorageError();
        }
        return {
          bytes,
          filename: record.originalFilename,
          mimeType: record.mimeType,
        };
      } catch {
        throw new MatterDocumentStorageError();
      }
    },

    async delete(input: { userId: string; documentId: string }) {
      const record = await deps.repository.getForOwner({
        ...input,
        includeDeleted: true,
      });
      if (!record) {
        return false;
      }
      if (record.deletedAt) {
        return true;
      }
      const deleted = await deps.repository.softDelete({
        ...input,
        deletedAt: now(),
      });
      if (deleted) {
        return true;
      }
      const latest = await deps.repository.getForOwner({
        ...input,
        includeDeleted: true,
      });
      return Boolean(latest?.deletedAt);
    },
  };
}

export type MatterDocumentService = ReturnType<
  typeof createMatterDocumentService
>;
