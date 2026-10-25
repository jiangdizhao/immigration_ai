// biome-ignore-all lint/suspicious/useAwait: fake ports intentionally implement Promise-based interfaces.
import { createHash } from "node:crypto";
import { hashProjectOperationRequest } from "@/lib/db/project-foundation-utils";
import type {
  ApplyProjectDocumentScanInput,
  ApplyProjectDocumentScanResult,
  ProjectDocumentAuthorizationPort,
  ProjectDocumentObjectStore,
  ProjectDocumentOperationKey,
  ProjectDocumentRepository,
  ProjectDocumentScanAttestationVerifier,
  ProjectDocumentSourcePort,
  PutObjectResult,
  ReadObjectResult,
  RemoveObjectResult,
  StatObjectResult,
} from "./ports";
import type {
  ProjectAuthorizationDecision,
  ProjectDocumentActor,
  ProjectDocumentAssetRecord,
  ProjectDocumentGrantRecord,
  ProjectDocumentObjectIdentity,
  ProjectDocumentOperationRecord,
  ProjectDocumentProcessingRunRecord,
  ProjectDocumentPurpose,
  ProjectDocumentScanAttestation,
  ProjectDocumentVersionRecord,
  SourceDocumentBytes,
  SourceDocumentOwnershipDecision,
  VerifiedProjectDocumentScanAttestation,
} from "./types";
import { PROJECT_DOCUMENT_PURPOSES } from "./types";

function copyIdentity(
  identity: ProjectDocumentObjectIdentity | null
): ProjectDocumentObjectIdentity | null {
  return identity ? { ...identity } : null;
}

function copyAsset(
  asset: ProjectDocumentAssetRecord
): ProjectDocumentAssetRecord {
  return { ...asset };
}

function copyVersion(
  version: ProjectDocumentVersionRecord
): ProjectDocumentVersionRecord {
  return {
    ...version,
    origin: { ...version.origin },
    objectIdentity: copyIdentity(version.objectIdentity),
  };
}

function copyGrant(
  grant: ProjectDocumentGrantRecord
): ProjectDocumentGrantRecord {
  return { ...grant };
}

function copyOperation(
  operation: ProjectDocumentOperationRecord
): ProjectDocumentOperationRecord {
  return { ...operation };
}

function operationKey(key: ProjectDocumentOperationKey) {
  return JSON.stringify([key.actorUserId, key.operationType, key.operationId]);
}

function eventKey(providerCode: string, providerEventId: string) {
  return JSON.stringify([providerCode, providerEventId]);
}

function runKey(versionId: string, generation: number) {
  return JSON.stringify([versionId, generation, "scan"]);
}

function sameIdentity(
  left: ProjectDocumentObjectIdentity | null,
  right: ProjectDocumentObjectIdentity | null
) {
  return (
    left !== null &&
    right !== null &&
    left.key === right.key &&
    left.objectVersionId === right.objectVersionId &&
    left.sha256 === right.sha256 &&
    left.byteSize === right.byteSize
  );
}

export class InMemoryProjectDocumentRepository
  implements ProjectDocumentRepository
{
  private readonly assets = new Map<string, ProjectDocumentAssetRecord>();
  private readonly versions = new Map<string, ProjectDocumentVersionRecord>();
  private readonly operations = new Map<
    string,
    ProjectDocumentOperationRecord
  >();
  private readonly grants = new Map<string, ProjectDocumentGrantRecord>();
  private readonly runs = new Map<string, ProjectDocumentProcessingRunRecord>();
  private readonly events = new Map<
    string,
    { fingerprint: string; runKey: string }
  >();

  findOperation(key: ProjectDocumentOperationKey) {
    const operation = this.operations.get(operationKey(key));
    return operation ? copyOperation(operation) : null;
  }

  claimIntent(input: {
    operation: ProjectDocumentOperationRecord;
    asset: ProjectDocumentAssetRecord;
    version: ProjectDocumentVersionRecord;
  }) {
    const key = operationKey(input.operation);
    const existing = this.operations.get(key);
    if (existing) {
      return existing.requestHash === input.operation.requestHash
        ? { kind: "existing" as const, operation: copyOperation(existing) }
        : { kind: "conflict" as const };
    }
    if (
      this.assets.has(input.asset.id) ||
      this.versions.has(input.version.versionId) ||
      input.version.assetId !== input.asset.id ||
      input.version.projectId !== input.asset.projectId ||
      input.operation.assetId !== input.asset.id ||
      input.operation.versionId !== input.version.versionId ||
      input.operation.projectId !== input.asset.projectId ||
      input.operation.actorUserId !== input.asset.createdByUserId ||
      input.operation.actorUserId !== input.version.uploadedByUserId ||
      input.operation.status !== "intent_created" ||
      input.version.versionNumber !== 1 ||
      input.version.storageStatus !== "pending" ||
      input.version.securityStatus !== "pending" ||
      input.version.processingGeneration !== 1 ||
      input.version.objectIdentity !== null
    ) {
      return { kind: "conflict" as const };
    }

    this.operations.set(key, copyOperation(input.operation));
    this.assets.set(input.asset.id, copyAsset(input.asset));
    this.versions.set(input.version.versionId, copyVersion(input.version));
    return {
      kind: "created" as const,
      operation: copyOperation(input.operation),
    };
  }

  completeStorage(input: {
    key: ProjectDocumentOperationKey;
    expectedGeneration: number;
    identity: ProjectDocumentObjectIdentity;
    completedAt: string;
  }) {
    const operation = this.operations.get(operationKey(input.key));
    const version = operation && this.versions.get(operation.versionId);
    const asset = operation && this.assets.get(operation.assetId);
    if (
      !operation ||
      !version ||
      !asset ||
      operation.status !== "intent_created" ||
      version.processingGeneration !== input.expectedGeneration ||
      version.storageStatus !== "pending" ||
      version.securityStatus !== "pending" ||
      asset.lifecycle !== "active" ||
      input.identity.key !== version.storageKey ||
      input.identity.sha256 !== version.sha256 ||
      input.identity.byteSize !== version.byteSize ||
      !input.identity.objectVersionId.trim()
    ) {
      return false;
    }
    version.storageStatus = "stored";
    version.objectIdentity = copyIdentity(input.identity);
    operation.status = "stored";
    operation.completedAt = input.completedAt;
    return true;
  }

  failStorage(input: {
    key: ProjectDocumentOperationKey;
    expectedGeneration: number;
    status: "failed" | "cleanup_pending";
    errorCode: ProjectDocumentOperationRecord["errorCode"];
    completedAt: string;
  }) {
    const operation = this.operations.get(operationKey(input.key));
    const version = operation && this.versions.get(operation.versionId);
    if (
      !operation ||
      !version ||
      operation.status !== "intent_created" ||
      version.processingGeneration !== input.expectedGeneration ||
      version.storageStatus !== "pending"
    ) {
      return false;
    }
    version.storageStatus = input.status;
    operation.status = input.status;
    operation.errorCode = input.errorCode;
    operation.completedAt = input.completedAt;
    return true;
  }

  getAsset(assetId: string) {
    const asset = this.assets.get(assetId);
    return asset ? copyAsset(asset) : null;
  }

  getVersion(versionId: string) {
    const version = this.versions.get(versionId);
    return version ? copyVersion(version) : null;
  }

  getAssetVersion(input: { assetId: string; versionId: string }) {
    const asset = this.assets.get(input.assetId);
    const version = this.versions.get(input.versionId);
    if (!asset || !version || version.assetId !== asset.id) {
      return null;
    }
    return { asset: copyAsset(asset), version: copyVersion(version) };
  }

  listProjectVersions(projectId: string) {
    return [...this.versions.values()]
      .filter((version) => version.projectId === projectId)
      .flatMap((version) => {
        const asset = this.assets.get(version.assetId);
        return asset
          ? [{ asset: copyAsset(asset), version: copyVersion(version) }]
          : [];
      });
  }

  listActiveGrants(input: { versionId: string; granteeUserId: string }) {
    return [...this.grants.values()]
      .filter(
        (grant) =>
          grant.versionId === input.versionId &&
          grant.granteeUserId === input.granteeUserId &&
          grant.revokedAt === null
      )
      .map(copyGrant);
  }

  getGrant(grantId: string) {
    const grant = this.grants.get(grantId);
    return grant ? copyGrant(grant) : null;
  }

  findGrant(input: {
    versionId: string;
    granteeUserId: string;
    purpose: ProjectDocumentPurpose;
  }) {
    const grant = [...this.grants.values()].find(
      (item) =>
        item.versionId === input.versionId &&
        item.granteeUserId === input.granteeUserId &&
        item.purpose === input.purpose &&
        item.revokedAt === null
    );
    return grant ? copyGrant(grant) : null;
  }

  createCreatorGrant(input: {
    id: string;
    projectId: string;
    assetId: string;
    versionId: string;
    grantorUserId: string;
    granteeUserId: string;
    purpose: ProjectDocumentPurpose;
    createdAt: string;
  }) {
    const asset = this.assets.get(input.assetId);
    const version = this.versions.get(input.versionId);
    if (
      !asset ||
      !version ||
      asset.projectId !== input.projectId ||
      version.projectId !== input.projectId ||
      version.assetId !== input.assetId ||
      !PROJECT_DOCUMENT_PURPOSES.includes(input.purpose) ||
      asset.createdByUserId !== input.grantorUserId ||
      input.grantorUserId !== input.granteeUserId ||
      asset.lifecycle !== "active"
    ) {
      return { kind: "conflict" as const };
    }
    const existing = [...this.grants.values()].find(
      (grant) =>
        grant.versionId === input.versionId &&
        grant.granteeUserId === input.granteeUserId &&
        grant.purpose === input.purpose &&
        grant.revokedAt === null
    );
    if (existing) {
      return { kind: "existing" as const, grant: copyGrant(existing) };
    }
    if (this.grants.has(input.id)) {
      return { kind: "conflict" as const };
    }
    const grant: ProjectDocumentGrantRecord = {
      ...input,
      revokedAt: null,
      revision: 1,
    };
    this.grants.set(grant.id, grant);
    return { kind: "created" as const, grant: copyGrant(grant) };
  }

  revokeGrant(input: {
    grantId: string;
    actorUserId: string;
    revokedAt: string;
  }) {
    const grant = this.grants.get(input.grantId);
    if (!grant || grant.grantorUserId !== input.actorUserId) {
      return null;
    }
    if (grant.revokedAt === null) {
      grant.revokedAt = input.revokedAt;
      grant.revision += 1;
    }
    return copyGrant(grant);
  }

  withdrawAsset(input: { assetId: string; actorUserId: string }) {
    const asset = this.assets.get(input.assetId);
    if (!asset || asset.createdByUserId !== input.actorUserId) {
      return null;
    }
    if (asset.lifecycle === "active") {
      asset.lifecycle = "withdrawn";
    }
    return copyAsset(asset);
  }

  failIntegrity(input: { versionId: string; expectedGeneration: number }) {
    const version = this.versions.get(input.versionId);
    if (
      !version ||
      version.processingGeneration !== input.expectedGeneration ||
      version.storageStatus !== "stored"
    ) {
      return false;
    }
    version.storageStatus = "failed";
    return true;
  }

  applyScan(
    input: ApplyProjectDocumentScanInput
  ): ApplyProjectDocumentScanResult {
    const attestation = input.attestation;
    const eventId = eventKey(
      attestation.providerCode,
      attestation.providerEventId
    );
    const existingEvent = this.events.get(eventId);
    if (existingEvent) {
      const run = this.runs.get(existingEvent.runKey);
      const version = this.versions.get(attestation.versionId);
      if (existingEvent.fingerprint !== input.eventFingerprint) {
        return { kind: "event_conflict" };
      }
      if (!run || !version) {
        return { kind: "state_conflict" };
      }
      return {
        kind: "replayed",
        version: copyVersion(version),
        run: { ...run },
      };
    }

    const version = this.versions.get(input.versionId);
    const asset = version && this.assets.get(version.assetId);
    if (!version || !asset) {
      return { kind: "not_found" };
    }
    if (version.processingGeneration !== input.expectedGeneration) {
      return { kind: "stale_generation" };
    }
    if (
      attestation.projectId !== version.projectId ||
      attestation.versionId !== version.versionId ||
      attestation.generation !== version.processingGeneration ||
      !sameIdentity(attestation.objectIdentity, version.objectIdentity) ||
      attestation.objectIdentity.sha256 !== version.sha256 ||
      attestation.objectIdentity.byteSize !== version.byteSize
    ) {
      return { kind: "state_conflict" };
    }
    if (
      asset.lifecycle !== "active" ||
      version.storageStatus !== "stored" ||
      version.securityStatus !== "pending"
    ) {
      return { kind: "state_conflict" };
    }

    const key = runKey(version.versionId, version.processingGeneration);
    if (this.runs.has(key)) {
      return { kind: "run_conflict" };
    }
    const run: ProjectDocumentProcessingRunRecord = {
      id: input.runId,
      projectId: version.projectId,
      versionId: version.versionId,
      generation: version.processingGeneration,
      operationKind: "scan",
      providerCode: attestation.providerCode,
      providerEventId: attestation.providerEventId,
      servicePrincipalCode: input.servicePrincipalCode,
      objectSha256: version.sha256,
      status: attestation.result === "failed" ? "failed" : "completed",
      verdict: attestation.result === "failed" ? null : attestation.result,
      errorCode: attestation.result === "failed" ? "scanner_failed" : null,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
    };
    version.securityStatus = attestation.result;
    this.runs.set(key, run);
    this.events.set(eventId, {
      fingerprint: input.eventFingerprint,
      runKey: key,
    });
    return { kind: "applied", version: copyVersion(version), run: { ...run } };
  }

  /** Test seam to simulate a newer worker generation winning a CAS race. */
  advanceGenerationForTest(versionId: string, expectedGeneration: number) {
    const version = this.versions.get(versionId);
    if (!version || version.processingGeneration !== expectedGeneration) {
      return false;
    }
    version.processingGeneration += 1;
    return true;
  }

  snapshot() {
    return {
      assets: [...this.assets.values()].map(copyAsset),
      versions: [...this.versions.values()].map(copyVersion),
      operations: [...this.operations.values()].map(copyOperation),
      grants: [...this.grants.values()].map(copyGrant),
      runs: [...this.runs.values()].map((run) => ({ ...run })),
    };
  }
}

export class InMemoryProjectDocumentAuthorization
  implements ProjectDocumentAuthorizationPort
{
  private readonly decisions = new Map<string, ProjectAuthorizationDecision>();

  setDecision(decision: ProjectAuthorizationDecision) {
    this.decisions.set(
      JSON.stringify([decision.actorUserId, decision.projectId]),
      { ...decision }
    );
  }

  async authorizeProject(input: {
    actor: ProjectDocumentActor;
    projectId: string;
  }) {
    const actorUserId =
      "userId" in input.actor ? (input.actor.userId ?? "") : "";
    const decision = this.decisions.get(
      JSON.stringify([actorUserId, input.projectId])
    );
    return decision
      ? { ...decision }
      : {
          kind: "denied" as const,
          projectId: input.projectId,
          actorUserId,
          reason: "project_not_found" as const,
        };
  }
}

export class InMemoryProjectDocumentSource
  implements ProjectDocumentSourcePort
{
  private readonly sources = new Map<string, SourceDocumentBytes>();
  ownershipCheckCount = 0;
  readCount = 0;

  register(source: SourceDocumentBytes) {
    this.sources.set(JSON.stringify([source.chatId, source.documentId]), {
      ...source,
      bytes: new Uint8Array(source.bytes),
    });
  }

  remove(chatId: string, documentId: string) {
    this.sources.delete(JSON.stringify([chatId, documentId]));
  }

  async authorizeOwnedSource(input: {
    actorUserId: string;
    chatId: string;
    documentId: string;
  }): Promise<SourceDocumentOwnershipDecision> {
    this.ownershipCheckCount += 1;
    const source = this.sources.get(
      JSON.stringify([input.chatId, input.documentId])
    );
    if (!source || source.ownerUserId !== input.actorUserId) {
      return { kind: "denied" };
    }
    return {
      kind: "owned",
      ownerUserId: source.ownerUserId,
      chatId: source.chatId,
      documentId: source.documentId,
    };
  }

  async readAuthorizedSource(input: {
    actorUserId: string;
    chatId: string;
    documentId: string;
  }) {
    const source = this.sources.get(
      JSON.stringify([input.chatId, input.documentId])
    );
    if (!source || source.ownerUserId !== input.actorUserId) {
      return null;
    }
    this.readCount += 1;
    return { ...source, bytes: new Uint8Array(source.bytes) };
  }
}

type StoredFakeObject = {
  identity: ProjectDocumentObjectIdentity;
  bytes: Uint8Array;
};

export type FakeProjectDocumentObjectStoreOptions = {
  beforePut?: () => void | Promise<void>;
  beforeRead?: () => void | Promise<void>;
};

export class InMemoryProjectDocumentObjectStore
  implements ProjectDocumentObjectStore
{
  private readonly objects = new Map<string, StoredFakeObject>();
  private beforeRead?: () => void | Promise<void>;
  private nextObjectVersion = 1;
  private nextPutFailure: "before_write" | "after_write" | null = null;
  private nextCorruptReceipt = false;
  private nextStatFailure = false;
  private nextReadFailure = false;
  private nextRemoveFailure = false;
  private readonly beforePut?: () => void | Promise<void>;

  constructor(options: FakeProjectDocumentObjectStoreOptions = {}) {
    this.beforePut = options.beforePut;
    this.beforeRead = options.beforeRead;
  }

  setBeforeRead(handler: (() => void | Promise<void>) | undefined) {
    this.beforeRead = handler;
  }

  failNextPut(mode: "before_write" | "after_write") {
    this.nextPutFailure = mode;
  }

  corruptNextPutReceipt() {
    this.nextCorruptReceipt = true;
  }

  failNextStat() {
    this.nextStatFailure = true;
  }

  failNextRead() {
    this.nextReadFailure = true;
  }

  failNextRemove() {
    this.nextRemoveFailure = true;
  }

  async putNew(input: {
    key: string;
    bytes: Uint8Array;
    expectedSha256: string;
    contentType: string;
  }): Promise<PutObjectResult> {
    await this.beforePut?.();
    const failure = this.nextPutFailure;
    this.nextPutFailure = null;
    if (failure === "before_write") {
      return { kind: "failed", reason: "transient_failure" };
    }
    if (this.objects.has(input.key)) {
      return { kind: "failed", reason: "already_exists" };
    }
    const bytes = new Uint8Array(input.bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== input.expectedSha256) {
      return { kind: "failed", reason: "integrity_mismatch" };
    }
    const identity: ProjectDocumentObjectIdentity = {
      key: input.key,
      objectVersionId: `memory-object-${this.nextObjectVersion++}`,
      sha256,
      byteSize: bytes.byteLength,
    };
    this.objects.set(input.key, { identity, bytes });
    if (failure === "after_write") {
      return {
        kind: "failed",
        reason: "transient_failure",
        possiblyOwnedIdentity: { ...identity },
      };
    }
    if (this.nextCorruptReceipt) {
      this.nextCorruptReceipt = false;
      return {
        kind: "created",
        identity: { ...identity, sha256: "0".repeat(64) },
      };
    }
    return { kind: "created", identity: { ...identity } };
  }

  async statIdentity(input: { key: string }): Promise<StatObjectResult> {
    if (this.nextStatFailure) {
      this.nextStatFailure = false;
      return { kind: "failed" };
    }
    const object = this.objects.get(input.key);
    return object
      ? { kind: "found", identity: { ...object.identity } }
      : { kind: "missing" };
  }

  async readBounded(input: {
    key: string;
    expectedMaxBytes: number;
  }): Promise<ReadObjectResult> {
    await this.beforeRead?.();
    if (this.nextReadFailure) {
      this.nextReadFailure = false;
      return { kind: "failed" };
    }
    const object = this.objects.get(input.key);
    if (!object) {
      return { kind: "missing" };
    }
    if (object.bytes.byteLength > input.expectedMaxBytes) {
      return { kind: "failed" };
    }
    return {
      kind: "found",
      identity: { ...object.identity },
      bytes: new Uint8Array(object.bytes),
    };
  }

  async removeIfOwned(input: {
    identity: ProjectDocumentObjectIdentity;
  }): Promise<RemoveObjectResult> {
    if (this.nextRemoveFailure) {
      this.nextRemoveFailure = false;
      return { kind: "failed" };
    }
    const object = this.objects.get(input.identity.key);
    if (!object) {
      return { kind: "removed" };
    }
    if (!sameIdentity(object.identity, input.identity)) {
      return { kind: "not_owned" };
    }
    this.objects.delete(input.identity.key);
    return { kind: "removed" };
  }

  hasObject(key: string) {
    return this.objects.has(key);
  }

  objectCount() {
    return this.objects.size;
  }

  corruptBytesForTest(key: string, bytes: Uint8Array) {
    const object = this.objects.get(key);
    if (!object) {
      return false;
    }
    object.bytes = new Uint8Array(bytes);
    return true;
  }
}

function attestationPayload(
  candidate: ProjectDocumentScanAttestation
): VerifiedProjectDocumentScanAttestation {
  return {
    providerCode: candidate.providerCode,
    providerEventId: candidate.providerEventId,
    projectId: candidate.projectId,
    versionId: candidate.versionId,
    generation: candidate.generation,
    objectIdentity: { ...candidate.objectIdentity },
    result: candidate.result,
    occurredAt: candidate.occurredAt,
  };
}

export class InMemoryTrustedProjectDocumentScanVerifier
  implements ProjectDocumentScanAttestationVerifier
{
  private readonly issued = new Map<
    string,
    { fingerprint: string; payload: VerifiedProjectDocumentScanAttestation }
  >();
  private nextProof = 1;

  /** Issues synthetic test proofs; this is not a production signing facility. */
  issue(
    payload: VerifiedProjectDocumentScanAttestation
  ): ProjectDocumentScanAttestation {
    const proofToken = `synthetic-proof-${this.nextProof++}`;
    const candidate: ProjectDocumentScanAttestation = {
      ...payload,
      objectIdentity: { ...payload.objectIdentity },
      proofToken,
    };
    this.issued.set(proofToken, {
      fingerprint: hashProjectOperationRequest(payload),
      payload: attestationPayload(candidate),
    });
    return candidate;
  }

  async verify(candidate: ProjectDocumentScanAttestation) {
    const issued = this.issued.get(candidate.proofToken);
    if (
      !issued ||
      issued.fingerprint !==
        hashProjectOperationRequest(attestationPayload(candidate))
    ) {
      return null;
    }
    return {
      ...issued.payload,
      objectIdentity: { ...issued.payload.objectIdentity },
    };
  }
}
