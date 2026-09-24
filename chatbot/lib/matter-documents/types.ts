import type { MatterDocument } from "@/lib/db/schema";

export type MatterDocumentMimeType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png";

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
  }): Promise<MatterDocument>;
  list(input: { chatId: string; userId: string }): Promise<MatterDocument[]>;
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
