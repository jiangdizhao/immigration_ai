import type {
  ProjectAuthorizationDecision,
  ProjectDocumentActor,
  ProjectDocumentAssetRecord,
  ProjectDocumentErrorCode,
  ProjectDocumentGrantRecord,
  ProjectDocumentObjectIdentity,
  ProjectDocumentOperationRecord,
  ProjectDocumentOperationType,
  ProjectDocumentProcessingRunRecord,
  ProjectDocumentPurpose,
  ProjectDocumentScanAttestation,
  ProjectDocumentStorageStatus,
  ProjectDocumentVersionRecord,
  SourceDocumentBytes,
  SourceDocumentOwnershipDecision,
  VerifiedProjectDocumentScanAttestation,
} from "./types";

export interface ProjectDocumentAuthorizationPort {
  authorizeProject(input: {
    actor: ProjectDocumentActor;
    projectId: string;
  }): Promise<ProjectAuthorizationDecision>;
}

export interface ProjectDocumentSourcePort {
  authorizeOwnedSource(input: {
    actorUserId: string;
    chatId: string;
    documentId: string;
  }): Promise<SourceDocumentOwnershipDecision>;
  readAuthorizedSource(input: {
    actorUserId: string;
    chatId: string;
    documentId: string;
  }): Promise<SourceDocumentBytes | null>;
}

export type ObjectStoreFailureCode =
  | "transient_failure"
  | "already_exists"
  | "not_found"
  | "integrity_mismatch";

export type PutObjectResult =
  | { kind: "created"; identity: ProjectDocumentObjectIdentity }
  | {
      kind: "failed";
      reason: ObjectStoreFailureCode;
      possiblyOwnedIdentity?: ProjectDocumentObjectIdentity;
    };

export type StatObjectResult =
  | { kind: "found"; identity: ProjectDocumentObjectIdentity }
  | { kind: "missing" }
  | { kind: "failed" };

export type ReadObjectResult =
  | {
      kind: "found";
      identity: ProjectDocumentObjectIdentity;
      bytes: Uint8Array;
    }
  | { kind: "missing" }
  | { kind: "failed" };

export type RemoveObjectResult =
  | { kind: "removed" }
  | { kind: "not_owned" }
  | { kind: "failed" };

export interface ProjectDocumentObjectStore {
  putNew(input: {
    key: string;
    bytes: Uint8Array;
    expectedSha256: string;
    contentType: string;
  }): Promise<PutObjectResult>;
  statIdentity(input: { key: string }): Promise<StatObjectResult>;
  readBounded(input: {
    key: string;
    expectedMaxBytes: number;
  }): Promise<ReadObjectResult>;
  removeIfOwned(input: {
    identity: ProjectDocumentObjectIdentity;
  }): Promise<RemoveObjectResult>;
}

export interface ProjectDocumentScanAttestationVerifier {
  verify(
    candidate: ProjectDocumentScanAttestation
  ): Promise<VerifiedProjectDocumentScanAttestation | null>;
}

export type ProjectDocumentOperationKey = {
  actorUserId: string;
  operationType: ProjectDocumentOperationType;
  operationId: string;
};

export type ClaimProjectDocumentIntentResult =
  | { kind: "created"; operation: ProjectDocumentOperationRecord }
  | { kind: "existing"; operation: ProjectDocumentOperationRecord }
  | { kind: "conflict" };

export type ApplyProjectDocumentScanInput = {
  versionId: string;
  expectedGeneration: number;
  eventFingerprint: string;
  attestation: VerifiedProjectDocumentScanAttestation;
  runId: string;
  servicePrincipalCode: "synthetic_attestation_verifier";
  startedAt: string;
  completedAt: string;
};

export type ApplyProjectDocumentScanResult =
  | {
      kind: "applied" | "replayed";
      version: ProjectDocumentVersionRecord;
      run: ProjectDocumentProcessingRunRecord;
    }
  | { kind: "event_conflict" }
  | { kind: "stale_generation" }
  | { kind: "run_conflict" }
  | { kind: "state_conflict" }
  | { kind: "not_found" };

/**
 * A1.0 defines the future durable contract here. Its only implementation is
 * the deterministic in-memory fake; no database repository is provided.
 */
export interface ProjectDocumentRepository {
  findOperation(
    key: ProjectDocumentOperationKey
  ): ProjectDocumentOperationRecord | null;
  claimIntent(input: {
    operation: ProjectDocumentOperationRecord;
    asset: ProjectDocumentAssetRecord;
    version: ProjectDocumentVersionRecord;
  }): ClaimProjectDocumentIntentResult;
  completeStorage(input: {
    key: ProjectDocumentOperationKey;
    expectedGeneration: number;
    identity: ProjectDocumentObjectIdentity;
    completedAt: string;
  }): boolean;
  failStorage(input: {
    key: ProjectDocumentOperationKey;
    expectedGeneration: number;
    status: Extract<ProjectDocumentStorageStatus, "failed" | "cleanup_pending">;
    errorCode: ProjectDocumentErrorCode;
    completedAt: string;
  }): boolean;
  getAsset(assetId: string): ProjectDocumentAssetRecord | null;
  getVersion(versionId: string): ProjectDocumentVersionRecord | null;
  getAssetVersion(input: { assetId: string; versionId: string }): {
    asset: ProjectDocumentAssetRecord;
    version: ProjectDocumentVersionRecord;
  } | null;
  listProjectVersions(projectId: string): Array<{
    asset: ProjectDocumentAssetRecord;
    version: ProjectDocumentVersionRecord;
  }>;
  listActiveGrants(input: {
    versionId: string;
    granteeUserId: string;
  }): ProjectDocumentGrantRecord[];
  getGrant(grantId: string): ProjectDocumentGrantRecord | null;
  findGrant(input: {
    versionId: string;
    granteeUserId: string;
    purpose: ProjectDocumentPurpose;
  }): ProjectDocumentGrantRecord | null;
  createCreatorGrant(input: {
    id: string;
    projectId: string;
    assetId: string;
    versionId: string;
    grantorUserId: string;
    granteeUserId: string;
    purpose: ProjectDocumentPurpose;
    createdAt: string;
  }): {
    kind: "created" | "existing" | "conflict";
    grant?: ProjectDocumentGrantRecord;
  };
  revokeGrant(input: {
    grantId: string;
    actorUserId: string;
    revokedAt: string;
  }): ProjectDocumentGrantRecord | null;
  withdrawAsset(input: {
    assetId: string;
    actorUserId: string;
  }): ProjectDocumentAssetRecord | null;
  failIntegrity(input: {
    versionId: string;
    expectedGeneration: number;
  }): boolean;
  applyScan(
    input: ApplyProjectDocumentScanInput
  ): ApplyProjectDocumentScanResult;
}

export type ProjectDocumentClock = () => string;
export type ProjectDocumentIdFactory = (
  kind: "asset" | "version" | "grant" | "run"
) => string;
