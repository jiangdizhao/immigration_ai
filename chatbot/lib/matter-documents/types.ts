import type { PaginationCursor } from "@/lib/conversations/pagination";
import type { MatterDocument } from "@/lib/db/schema";
import type { MatterDocumentMimeType } from "./formats";

export type { MatterDocumentMimeType } from "./formats";

export type MatterDocumentStorageStatus =
  | "uploading"
  | "stored"
  | "cleanup_pending"
  | "storage_failed";

export type PublicMatterDocument = Pick<
  MatterDocument,
  | "id"
  | "chatId"
  | "legalMatterId"
  | "originalFilename"
  | "mimeType"
  | "byteSize"
  | "sha256"
  | "processingStatus"
  | "securityStatus"
  | "createdAt"
  | "updatedAt"
>;

/**
 * Owner-level historical file index entry.
 *
 * Account-wide *visibility* of retained files is deliberately separate from AI
 * working context: `DocumentAccessScope` keeps model evidence scoped to the
 * current conversation.
 */
export type PublicUserDocument = PublicMatterDocument & {
  conversationTitle: string | null;
  projectId: null;
  evidenceScope: "conversation";
};

export type MatterDocumentHistoryPage = {
  documents: PublicUserDocument[];
  hasMore: boolean;
};

export type MatterDocumentHistoryListing = {
  userId: string;
  limit: number;
  cursor: PaginationCursor | null;
};

export type MatterDocumentHistoryRow = PublicMatterDocument & {
  conversationTitle: string | null;
};

export type MatterDocumentRepository = {
  getOwnedConversation(input: {
    chatId: string;
    userId: string;
  }): Promise<{ legalMatterId: string | null } | null>;
  create(input: {
    userId: string;
    chatId: string;
    legalMatterId: string | null;
    originalFilename: string;
    storageKey: string;
    mimeType: MatterDocumentMimeType;
    byteSize: number;
    sha256: string;
    processingStatus: "not_started";
    securityStatus: "pending";
    storageStatus: "uploading";
  }): Promise<MatterDocument>;
  getForStorageCleanup(documentId: string): Promise<MatterDocument | null>;
  transitionStorageStatus(input: {
    documentId: string;
    expected: readonly MatterDocumentStorageStatus[];
    next: MatterDocumentStorageStatus;
  }): Promise<MatterDocument | null>;
  list(input: { chatId: string; userId: string }): Promise<MatterDocument[]>;
  listForUserHistory(
    input: MatterDocumentHistoryListing
  ): Promise<{ documents: MatterDocumentHistoryRow[]; hasMore: boolean }>;
  getForOwner(input: {
    documentId: string;
    userId: string;
    includeDeleted?: boolean;
  }): Promise<MatterDocument | null>;
  softDelete(input: {
    documentId: string;
    userId: string;
    deletedAt: Date;
  }): Promise<MatterDocument | null>;
};

export type MatterDocumentStorage = {
  put(input: {
    key: string;
    body: Uint8Array;
    contentType: MatterDocumentMimeType;
    sha256: string;
  }): Promise<void>;
  get(input: { key: string }): Promise<Uint8Array>;
  delete(input: { key: string }): Promise<void>;
};
