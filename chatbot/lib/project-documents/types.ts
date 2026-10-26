import type { MatterDocumentFormatId } from "@/lib/matter-documents/formats";

export const PROJECT_DOCUMENT_PURPOSES = [
  "metadata_read",
  "content_read",
  "download",
  "extract",
] as const;

export const PROJECT_DOCUMENT_IMPORT_NOTICE_VERSION =
  "project-document-import-v1" as const;

export type ProjectDocumentPurpose = (typeof PROJECT_DOCUMENT_PURPOSES)[number];

export type ProjectDocumentActor =
  | { kind: "registered_customer"; userId: string }
  | { kind: "unregistered_customer"; userId: string }
  | { kind: "guest"; userId?: string }
  | { kind: "anonymous" };

export type ProjectAuthorizationDenialCode =
  | "project_not_found"
  | "project_closed"
  | "not_registered"
  | "pending_membership"
  | "revoked_membership"
  | "unrelated_actor";

export type ProjectAuthorizationDecision =
  | {
      kind: "authorized";
      projectId: string;
      actorUserId: string;
      projectStatus: "active";
      registeredCustomer: true;
      relationship: "owner" | "active_member";
      revision: number;
    }
  | {
      kind: "denied";
      projectId: string;
      actorUserId: string;
      reason: ProjectAuthorizationDenialCode;
    };

export type SourceDocumentOwnershipDecision =
  | {
      kind: "owned";
      ownerUserId: string;
      chatId: string;
      documentId: string;
    }
  | { kind: "denied" };

export type SourceDocumentBytes = {
  ownerUserId: string;
  chatId: string;
  documentId: string;
  filename: string;
  declaredMimeType: string;
  byteSize: number;
  sha256: string;
  bytes: Uint8Array;
};

export type ProjectDocumentOrigin =
  | { kind: "direct_upload" }
  | {
      kind: "explicit_chat_import";
      sourceChatId: string;
      sourceDocumentId: string;
      sourceSha256: string;
    };

export type ProjectDocumentAssetLifecycle =
  | "active"
  | "withdrawn"
  | "deletion_pending"
  | "deleted";

export type ProjectDocumentStorageStatus =
  | "pending"
  | "stored"
  | "failed"
  | "cleanup_pending";

export type ProjectDocumentSecurityStatus =
  | "pending"
  | "clean"
  | "rejected"
  | "failed";

export type ProjectDocumentAssetRecord = {
  id: string;
  projectId: string;
  createdByUserId: string;
  lifecycle: ProjectDocumentAssetLifecycle;
  createdAt: string;
};

/** Internal immutable version record. Storage identity is never returned as metadata. */
export type ProjectDocumentVersionRecord = {
  projectId: string;
  assetId: string;
  versionId: string;
  versionNumber: 1;
  storageKey: string;
  sha256: string;
  byteSize: number;
  canonicalMime: string;
  formatId: MatterDocumentFormatId;
  origin: ProjectDocumentOrigin;
  uploadedByUserId: string;
  createdAt: string;
  storageStatus: ProjectDocumentStorageStatus;
  securityStatus: ProjectDocumentSecurityStatus;
  processingGeneration: number;
  objectIdentity: ProjectDocumentObjectIdentity | null;
};

export type ProjectDocumentGrantRecord = {
  id: string;
  projectId: string;
  assetId: string;
  versionId: string;
  grantorUserId: string;
  granteeUserId: string;
  purpose: ProjectDocumentPurpose;
  createdAt: string;
  revokedAt: string | null;
  revision: number;
};

export type ProjectDocumentOperationType =
  | "direct_upload"
  | "chat_document_import";

export type ProjectDocumentOperationStatus =
  | "intent_created"
  | "stored"
  | "failed"
  | "cleanup_pending";

export type ProjectDocumentOperationRecord = {
  actorUserId: string;
  projectId: string;
  operationId: string;
  operationType: ProjectDocumentOperationType;
  requestHash: string;
  assetId: string;
  versionId: string;
  status: ProjectDocumentOperationStatus;
  errorCode: ProjectDocumentErrorCode | null;
  createdAt: string;
  completedAt: string | null;
};

export type ProjectDocumentObjectIdentity = {
  key: string;
  objectVersionId: string;
  sha256: string;
  byteSize: number;
};

export type ProjectDocumentProcessingRunRecord = {
  id: string;
  projectId: string;
  versionId: string;
  generation: number;
  operationKind: "scan";
  providerCode: string;
  providerEventId: string;
  servicePrincipalCode: "synthetic_attestation_verifier";
  objectSha256: string;
  status: "completed" | "failed";
  verdict: "clean" | "rejected" | null;
  errorCode: "scanner_failed" | null;
  startedAt: string;
  completedAt: string;
};

export type ProjectDocumentScanResult = "clean" | "rejected" | "failed";

export type ProjectDocumentScanAttestation = {
  providerCode: string;
  providerEventId: string;
  projectId: string;
  versionId: string;
  generation: number;
  objectIdentity: ProjectDocumentObjectIdentity;
  result: ProjectDocumentScanResult;
  occurredAt: string;
  proofToken: string;
};

/** Claims returned only by the injected verifier after it trusts an attestation. */
export type VerifiedProjectDocumentScanAttestation = Omit<
  ProjectDocumentScanAttestation,
  "proofToken"
>;

export type ProjectDocumentOperationReceipt = {
  operationId: string;
  operationType: ProjectDocumentOperationType;
  assetId: string;
  versionId: string;
  status: ProjectDocumentOperationStatus;
  storageStatus: ProjectDocumentStorageStatus;
  securityStatus: ProjectDocumentSecurityStatus;
};

export type ProjectDocumentMetadata = {
  assetId: string;
  versionId: string;
  versionNumber: 1;
  lifecycle: ProjectDocumentAssetLifecycle;
  originKind: ProjectDocumentOrigin["kind"];
  canonicalMime: string;
  formatId: MatterDocumentFormatId;
  byteSize: number;
  sha256: string;
  storageStatus: ProjectDocumentStorageStatus;
  securityStatus: ProjectDocumentSecurityStatus;
};

export type ProjectDocumentErrorCode =
  | "invalid_actor"
  | "invalid_request"
  | "project_not_found"
  | "project_forbidden"
  | "project_closed"
  | "authorization_unavailable"
  | "source_not_owned"
  | "source_unavailable"
  | "invalid_document"
  | "integrity_mismatch"
  | "idempotency_conflict"
  | "storage_failed"
  | "cleanup_pending"
  | "not_found"
  | "asset_withdrawn"
  | "grant_required"
  | "purpose_forbidden"
  | "document_not_stored"
  | "document_not_clean"
  | "scan_unverified"
  | "scan_identity_mismatch"
  | "scan_event_conflict"
  | "stale_generation"
  | "state_conflict";

export type ProjectDocumentServiceResult<T> =
  | { ok: true; value: T; replayed: boolean }
  | {
      ok: false;
      error: ProjectDocumentErrorCode;
      operation?: ProjectDocumentOperationReceipt;
      replayed?: boolean;
    };

export type ProjectDocumentMutationResult = {
  assetId: string;
  lifecycle: ProjectDocumentAssetLifecycle;
};

export type ProjectDocumentScanReceipt = {
  versionId: string;
  generation: number;
  securityStatus: ProjectDocumentSecurityStatus;
  processingRunId: string;
};
