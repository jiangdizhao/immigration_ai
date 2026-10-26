import "server-only";

import { createHash } from "node:crypto";
import type { ProjectDocumentS3ObjectStore } from "./aws/s3-object-store";
import type {
  ProjectDocumentCustomerApplication,
  ProjectDocumentDownload,
  ProjectDocumentOperationResponse,
  ProjectDocumentPublicMetadata,
} from "./http";
import { ProjectDocumentApplicationError } from "./http";
import {
  type PostgresProjectDocumentRepository,
  ProjectDocumentPersistenceError,
} from "./postgres-repository";

type RepositoryPort = Pick<
  PostgresProjectDocumentRepository,
  | "createDirectUploadIntent"
  | "finalizeStorage"
  | "listGrantedMetadata"
  | "getExactVersionStorageDescriptor"
  | "authorizeExactVersionRead"
  | "withdrawDocument"
  | "revokeCreatorGrant"
>;

type StorageExpectation = {
  projectId: string;
  versionId: string;
  generation: number;
  storageKey: string;
  sha256: string;
  byteSize: number;
  outcome: "stored";
  objectVersionId: string;
};

export type ProjectDocumentDownloadScanGate = (input: {
  projectId: string;
  assetId: string;
  versionId: string;
  sha256: string;
  storageObjectVersionId: string;
}) => Promise<boolean>;

export function createPostgresProjectDocumentApplication(input: {
  repository: RepositoryPort;
  objectStore: ProjectDocumentS3ObjectStore;
  /** Existing trusted persistence boundary validates this issued capability. */
  issueVerifiedStorageResult?: (value: StorageExpectation) => Promise<unknown>;
  /** No production implementation exists until B2 producer authentication is accepted. */
  trustedScanReadiness?: ProjectDocumentDownloadScanGate;
}): ProjectDocumentCustomerApplication {
  const asOperationResponse = (
    operationId: string,
    result: {
      assetId: string;
      versionId: string;
      status: ProjectDocumentOperationResponse["status"];
      storageStatus: ProjectDocumentOperationResponse["storageStatus"];
      securityStatus: ProjectDocumentOperationResponse["securityStatus"];
      projectRevision: number;
      replayed: boolean;
    }
  ): ProjectDocumentOperationResponse => ({ operationId, ...result });

  const toApplicationFailure = (cause: unknown): never => {
    if (cause instanceof ProjectDocumentApplicationError) {
      throw cause;
    }
    if (cause instanceof ProjectDocumentPersistenceError) {
      const code = cause.code;
      if (code === "invalid_request" || code === "invalid_operation_id") {
        throw new ProjectDocumentApplicationError("invalid_request");
      }
      if (code === "project_not_found") {
        throw new ProjectDocumentApplicationError("project_not_found");
      }
      if (code === "project_closed") {
        throw new ProjectDocumentApplicationError("project_closed");
      }
      if (code === "revision_conflict") {
        throw new ProjectDocumentApplicationError("revision_conflict");
      }
      if (code === "idempotency_conflict") {
        throw new ProjectDocumentApplicationError("idempotency_conflict");
      }
      if (code === "consent_unverified") {
        throw new ProjectDocumentApplicationError("consent_unverified");
      }
      if (code === "source_not_owned") {
        throw new ProjectDocumentApplicationError("source_not_owned");
      }
      if (code === "project_forbidden") {
        throw new ProjectDocumentApplicationError("project_forbidden");
      }
      if (code === "state_conflict" || code === "integrity_conflict") {
        throw new ProjectDocumentApplicationError("state_conflict");
      }
    }
    throw new ProjectDocumentApplicationError("unavailable");
  };

  return {
    async listMetadata({
      actorUserId,
      projectId,
    }): Promise<ProjectDocumentPublicMetadata[]> {
      try {
        const rows = await input.repository.listGrantedMetadata({
          actorUserId,
          projectId,
        });
        return rows.map((row) => ({
          assetId: row.assetId,
          versionId: row.versionId,
          versionNumber: row.versionNumber,
          lifecycle: row.lifecycle,
          originKind: row.originKind,
          canonicalMime: row.canonicalMime,
          byteSize: row.byteSize,
          storageStatus: row.storageStatus,
          securityStatus: row.securityStatus,
        }));
      } catch (cause) {
        return toApplicationFailure(cause);
      }
    },

    async createDirectUpload(
      request
    ): Promise<ProjectDocumentOperationResponse> {
      try {
        if (!input.issueVerifiedStorageResult) {
          throw new ProjectDocumentApplicationError("storage_failed");
        }
        const intent = await input.repository.createDirectUploadIntent({
          actorUserId: request.actorUserId,
          projectId: request.projectId,
          operationId: request.operationId,
          expectedProjectRevision: request.expectedProjectRevision,
          metadata: {
            sha256: request.sha256,
            byteSize: request.bytes.byteLength,
            canonicalMime: request.canonicalMime,
            formatId: request.formatId,
          },
        });
        if (intent.replayed) {
          if (
            intent.storageStatus === "pending" ||
            intent.status === "intent_created"
          ) {
            throw new ProjectDocumentApplicationError("recovery_needed");
          }
          return asOperationResponse(request.operationId, intent);
        }
        if (
          intent.status !== "intent_created" ||
          intent.storageStatus !== "pending"
        ) {
          throw new ProjectDocumentApplicationError("state_conflict");
        }

        try {
          const storageKey = `project-document/${request.projectId}/${intent.assetId}/${intent.versionId}`;
          const written = await input.objectStore.putNew({
            key: storageKey,
            bytes: request.bytes,
            expectedSha256: request.sha256,
            contentType: request.canonicalMime,
          });
          const verified = await input.objectStore.readVersion({
            key: storageKey,
            objectVersionId: written.objectVersionId,
            expectedSha256: request.sha256,
            expectedByteSize: request.bytes.byteLength,
          });
          const actualSha256 = createHash("sha256")
            .update(verified.bytes)
            .digest("hex");
          if (
            written.key !== storageKey ||
            verified.identity.key !== storageKey ||
            verified.identity.objectVersionId !== written.objectVersionId ||
            verified.identity.sha256 !== request.sha256 ||
            actualSha256 !== request.sha256 ||
            verified.identity.byteSize !== request.bytes.byteLength ||
            verified.bytes.byteLength !== request.bytes.byteLength
          ) {
            throw new ProjectDocumentApplicationError("storage_failed");
          }
          const verifiedResult = await input.issueVerifiedStorageResult({
            projectId: request.projectId,
            versionId: intent.versionId,
            generation: intent.generation,
            storageKey,
            sha256: request.sha256,
            byteSize: request.bytes.byteLength,
            outcome: "stored",
            objectVersionId: written.objectVersionId,
          });
          const finalized =
            await input.repository.finalizeStorage(verifiedResult);
          const storageStatus =
            finalized.status === "stored" ||
            finalized.status === "failed" ||
            finalized.status === "cleanup_pending"
              ? finalized.status
              : null;
          if (!storageStatus || finalized.securityStatus !== "pending") {
            throw new ProjectDocumentApplicationError("recovery_needed");
          }
          return asOperationResponse(request.operationId, {
            assetId: intent.assetId,
            versionId: intent.versionId,
            status: storageStatus,
            storageStatus,
            securityStatus: "pending",
            projectRevision: finalized.projectRevision,
            replayed: finalized.replayed,
          });
        } catch {
          // The durable intent may now correspond to an object or a completed
          // finalization. Do not retry putNew here; an operator/reconciler must
          // inspect the exact immutable object identity before recovery.
          throw new ProjectDocumentApplicationError("recovery_needed");
        }
      } catch (cause) {
        return toApplicationFailure(cause);
      }
    },

    issueImportConsentAcknowledgement(): Promise<never> {
      // A1.1 persists consent only inside the import-intent transaction. It has
      // no durable pre-import receipt issuer; do not mint a process-local token.
      return Promise.reject(
        new ProjectDocumentApplicationError("consent_unverified")
      );
    },

    importOwnedChatDocument(): Promise<never> {
      // Fail before source lookup/read until durable, expiring consent can be
      // issued and verified independently of source ownership.
      return Promise.reject(
        new ProjectDocumentApplicationError("consent_unverified")
      );
    },

    async getMetadata({ actorUserId, projectId, assetId }) {
      try {
        const rows = await input.repository.listGrantedMetadata({
          actorUserId,
          projectId,
        });
        const row = rows.find((candidate) => candidate.assetId === assetId);
        return row
          ? {
              assetId: row.assetId,
              versionId: row.versionId,
              versionNumber: row.versionNumber,
              lifecycle: row.lifecycle,
              originKind: row.originKind,
              canonicalMime: row.canonicalMime,
              byteSize: row.byteSize,
              storageStatus: row.storageStatus,
              securityStatus: row.securityStatus,
            }
          : null;
      } catch (cause) {
        return toApplicationFailure(cause);
      }
    },

    async download({
      actorUserId,
      projectId,
      assetId,
      versionId,
    }): Promise<ProjectDocumentDownload | null> {
      try {
        const descriptor =
          await input.repository.getExactVersionStorageDescriptor({
            actorUserId,
            projectId,
            assetId,
            versionId,
            purpose: "download",
          });
        const trusted = await input.trustedScanReadiness?.({
          projectId,
          assetId,
          versionId,
          sha256: descriptor.sha256,
          storageObjectVersionId: descriptor.storageObjectVersionId,
        });
        if (trusted !== true) {
          return null;
        }
        const object = await input.objectStore.readVersion({
          key: descriptor.storageKey,
          objectVersionId: descriptor.storageObjectVersionId,
          expectedSha256: descriptor.sha256,
          expectedByteSize: descriptor.byteSize,
        });
        const actualSha256 = createHash("sha256")
          .update(object.bytes)
          .digest("hex");
        if (
          object.identity.key !== descriptor.storageKey ||
          object.identity.objectVersionId !==
            descriptor.storageObjectVersionId ||
          object.identity.sha256 !== descriptor.sha256 ||
          object.identity.byteSize !== descriptor.byteSize ||
          actualSha256 !== descriptor.sha256 ||
          object.bytes.byteLength !== descriptor.byteSize
        ) {
          throw new ProjectDocumentApplicationError("storage_failed");
        }
        await input.repository.authorizeExactVersionRead({
          actorUserId,
          projectId,
          assetId,
          versionId,
          purpose: "download",
        });
        return {
          filename: "project-document",
          canonicalMime: descriptor.canonicalMime,
          bytes: object.bytes,
          expectedSha256: descriptor.sha256,
          expectedByteSize: descriptor.byteSize,
          storageStatus: "stored",
          securityStatus: "clean",
          exactVersionCleanAuthorized: true,
        };
      } catch (cause) {
        return toApplicationFailure(cause);
      }
    },

    async withdraw({
      actorUserId,
      projectId,
      assetId,
      operationId,
      expectedProjectRevision,
    }) {
      try {
        const result = await input.repository.withdrawDocument({
          actorUserId,
          projectId,
          assetId,
          operationId,
          expectedProjectRevision,
        });
        return {
          assetId: result.assetId,
          lifecycle: result.lifecycle,
          projectRevision: result.projectRevision,
          replayed: result.replayed,
        };
      } catch (cause) {
        return toApplicationFailure(cause);
      }
    },

    async revokeCreatorGrant({
      actorUserId,
      projectId,
      grantId,
      operationId,
      expectedProjectRevision,
    }) {
      try {
        const result = await input.repository.revokeCreatorGrant({
          actorUserId,
          projectId,
          grantId,
          operationId,
          expectedProjectRevision,
        });
        return {
          grantId: result.grantId,
          revoked: true,
          replayed: result.replayed,
        };
      } catch (cause) {
        return toApplicationFailure(cause);
      }
    },
  };
}
