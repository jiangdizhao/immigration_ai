import { createHash } from "node:crypto";
import {
  hashProjectOperationRequest,
  validateProjectOperationId,
} from "@/lib/db/project-foundation-utils";
import {
  MAX_MATTER_DOCUMENT_BYTES,
  validateMatterDocument,
} from "@/lib/matter-documents/validation";
import type {
  ApplyProjectDocumentScanResult,
  ProjectDocumentAuthorizationPort,
  ProjectDocumentClock,
  ProjectDocumentIdFactory,
  ProjectDocumentObjectStore,
  ProjectDocumentOperationKey,
  ProjectDocumentRepository,
  ProjectDocumentScanAttestationVerifier,
  ProjectDocumentSourcePort,
  PutObjectResult,
  ReadObjectResult,
  StatObjectResult,
} from "./ports";
import type {
  ProjectAuthorizationDecision,
  ProjectDocumentActor,
  ProjectDocumentAssetRecord,
  ProjectDocumentErrorCode,
  ProjectDocumentMetadata,
  ProjectDocumentMutationResult,
  ProjectDocumentObjectIdentity,
  ProjectDocumentOperationReceipt,
  ProjectDocumentOperationRecord,
  ProjectDocumentOperationType,
  ProjectDocumentPurpose,
  ProjectDocumentScanAttestation,
  ProjectDocumentScanReceipt,
  ProjectDocumentServiceResult,
  ProjectDocumentVersionRecord,
  SourceDocumentBytes,
  SourceDocumentOwnershipDecision,
  VerifiedProjectDocumentScanAttestation,
} from "./types";
import { PROJECT_DOCUMENT_PURPOSES } from "./types";

export type ProjectDocumentServiceDependencies = {
  repository: ProjectDocumentRepository;
  objectStore: ProjectDocumentObjectStore;
  attestationVerifier: ProjectDocumentScanAttestationVerifier;
  authorization: ProjectDocumentAuthorizationPort;
  sources: ProjectDocumentSourcePort;
  createId: ProjectDocumentIdFactory;
  clock: ProjectDocumentClock;
};

type ValidatedBytes = {
  bytes: Uint8Array;
  filename: string;
  declaredMimeType: string;
  canonicalMime: string;
  formatId: ProjectDocumentVersionRecord["formatId"];
  sha256: string;
  byteSize: number;
};

type IntentSpec = {
  actor: Extract<ProjectDocumentActor, { kind: "registered_customer" }>;
  projectId: string;
  operationId: string;
  operationType: ProjectDocumentOperationType;
  requestHash: string;
  content: ValidatedBytes;
  origin: ProjectDocumentVersionRecord["origin"];
  recheckSource?: () => Promise<boolean>;
};

type InFlightOperation = {
  requestHash: string;
  promise: Promise<
    ProjectDocumentServiceResult<ProjectDocumentOperationReceipt>
  >;
};

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isSafeNonEmpty(value: string) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeOpaqueId(value: string) {
  return /^[A-Za-z0-9_-]{1,128}$/u.test(value);
}

function mapAuthorizationDecision(
  actor: ProjectDocumentActor,
  projectId: string,
  decision: ProjectAuthorizationDecision
): ProjectDocumentErrorCode | null {
  if (actor.kind !== "registered_customer" || !isSafeNonEmpty(actor.userId)) {
    return "invalid_actor";
  }
  if (
    decision.projectId !== projectId ||
    decision.actorUserId !== actor.userId
  ) {
    return "authorization_unavailable";
  }
  if (decision.kind === "denied") {
    switch (decision.reason) {
      case "project_not_found":
        return "project_not_found";
      case "project_closed":
        return "project_closed";
      case "not_registered":
      case "pending_membership":
      case "revoked_membership":
      case "unrelated_actor":
        return "project_forbidden";
      default:
        return "project_forbidden";
    }
  }
  if (
    decision.projectStatus !== "active" ||
    decision.registeredCustomer !== true ||
    !["owner", "active_member"].includes(decision.relationship) ||
    !Number.isSafeInteger(decision.revision) ||
    decision.revision < 1
  ) {
    return "project_forbidden";
  }
  return null;
}

function publicReceipt(
  operation: ProjectDocumentOperationRecord,
  version: ProjectDocumentVersionRecord
): ProjectDocumentOperationReceipt {
  return {
    operationId: operation.operationId,
    operationType: operation.operationType,
    assetId: operation.assetId,
    versionId: operation.versionId,
    status: operation.status,
    storageStatus: version.storageStatus,
    securityStatus: version.securityStatus,
  };
}

function asReplay<T>(result: ProjectDocumentServiceResult<T>) {
  return result.ok
    ? { ...result, replayed: true as const }
    : { ...result, replayed: true as const };
}

export type CreateProjectDocumentIntentInput = {
  actor: ProjectDocumentActor;
  projectId: string;
  operationId: string;
  filename: string;
  declaredMimeType: string;
  bytes: Uint8Array;
};

export type ImportProjectChatDocumentInput = {
  actor: ProjectDocumentActor;
  projectId: string;
  operationId: string;
  sourceChatId: string;
  sourceDocumentId: string;
  /** Synthetic acknowledgement only; this is not durable production consent. */
  consentAccepted: boolean;
};

export class ProjectDocumentService {
  private readonly inFlight = new Map<string, InFlightOperation>();
  private readonly dependencies: ProjectDocumentServiceDependencies;

  constructor(dependencies: ProjectDocumentServiceDependencies) {
    this.dependencies = dependencies;
  }

  async createDirectUploadIntent(
    input: CreateProjectDocumentIntentInput
  ): Promise<ProjectDocumentServiceResult<ProjectDocumentOperationReceipt>> {
    const actorError = await this.authorize(input.actor, input.projectId);
    if (actorError) {
      return { ok: false, error: actorError };
    }
    const content = await this.validateBytes({
      filename: input.filename,
      declaredMimeType: input.declaredMimeType,
      bytes: input.bytes,
    });
    if (!content.ok) {
      return content;
    }
    let operationId: string;
    try {
      operationId = validateProjectOperationId(input.operationId);
    } catch {
      return { ok: false, error: "invalid_request" };
    }
    const actor = input.actor;
    if (actor.kind !== "registered_customer") {
      return { ok: false, error: "invalid_actor" };
    }
    const requestHash = hashProjectOperationRequest({
      actorUserId: actor.userId,
      projectId: input.projectId,
      operationType: "direct_upload",
      filename: content.value.filename,
      declaredMimeType: content.value.declaredMimeType,
      canonicalMime: content.value.canonicalMime,
      formatId: content.value.formatId,
      sha256: content.value.sha256,
      byteSize: content.value.byteSize,
    });
    return this.startOrReplayIntent({
      actor,
      projectId: input.projectId,
      operationId,
      operationType: "direct_upload",
      requestHash,
      content: content.value,
      origin: { kind: "direct_upload" },
    });
  }

  async importOwnedChatDocument(
    input: ImportProjectChatDocumentInput
  ): Promise<ProjectDocumentServiceResult<ProjectDocumentOperationReceipt>> {
    if (input.consentAccepted !== true) {
      return { ok: false, error: "invalid_request" };
    }
    const projectError = await this.authorize(input.actor, input.projectId);
    if (projectError) {
      return { ok: false, error: projectError };
    }
    if (input.actor.kind !== "registered_customer") {
      return { ok: false, error: "invalid_actor" };
    }
    const actor = input.actor;
    if (
      !isSafeNonEmpty(input.sourceChatId) ||
      !isSafeNonEmpty(input.sourceDocumentId)
    ) {
      return { ok: false, error: "invalid_request" };
    }
    let operationId: string;
    try {
      operationId = validateProjectOperationId(input.operationId);
    } catch {
      return { ok: false, error: "invalid_request" };
    }

    let ownership: SourceDocumentOwnershipDecision;
    try {
      ownership = await this.dependencies.sources.authorizeOwnedSource({
        actorUserId: actor.userId,
        chatId: input.sourceChatId,
        documentId: input.sourceDocumentId,
      });
    } catch {
      return { ok: false, error: "source_not_owned" };
    }
    if (
      ownership.kind !== "owned" ||
      ownership.ownerUserId !== actor.userId ||
      ownership.chatId !== input.sourceChatId ||
      ownership.documentId !== input.sourceDocumentId
    ) {
      return { ok: false, error: "source_not_owned" };
    }

    let source: SourceDocumentBytes | null;
    try {
      source = await this.dependencies.sources.readAuthorizedSource({
        actorUserId: actor.userId,
        chatId: input.sourceChatId,
        documentId: input.sourceDocumentId,
      });
    } catch {
      return { ok: false, error: "source_unavailable" };
    }
    if (
      !source ||
      source.ownerUserId !== actor.userId ||
      source.chatId !== input.sourceChatId ||
      source.documentId !== input.sourceDocumentId
    ) {
      return { ok: false, error: "source_not_owned" };
    }
    const content = await this.validateBytes(source);
    if (!content.ok) {
      return content;
    }
    if (
      source.byteSize !== content.value.byteSize ||
      source.sha256 !== content.value.sha256
    ) {
      return { ok: false, error: "integrity_mismatch" };
    }

    const recheckSource = async () => {
      try {
        const decision = await this.dependencies.sources.authorizeOwnedSource({
          actorUserId: actor.userId,
          chatId: input.sourceChatId,
          documentId: input.sourceDocumentId,
        });
        return (
          decision.kind === "owned" &&
          decision.ownerUserId === actor.userId &&
          decision.chatId === input.sourceChatId &&
          decision.documentId === input.sourceDocumentId
        );
      } catch {
        return false;
      }
    };
    if (!(await recheckSource())) {
      return { ok: false, error: "source_not_owned" };
    }

    const requestHash = hashProjectOperationRequest({
      actorUserId: actor.userId,
      projectId: input.projectId,
      operationType: "chat_document_import",
      consentAccepted: input.consentAccepted,
      sourceChatId: input.sourceChatId,
      sourceDocumentId: input.sourceDocumentId,
      sourceSha256: content.value.sha256,
      sourceByteSize: content.value.byteSize,
      filename: content.value.filename,
      canonicalMime: content.value.canonicalMime,
      formatId: content.value.formatId,
    });
    return this.startOrReplayIntent({
      actor,
      projectId: input.projectId,
      operationId,
      operationType: "chat_document_import",
      requestHash,
      content: content.value,
      origin: {
        kind: "explicit_chat_import",
        sourceChatId: input.sourceChatId,
        sourceDocumentId: input.sourceDocumentId,
        sourceSha256: content.value.sha256,
      },
      recheckSource,
    });
  }

  async grantCreatorPurpose(input: {
    actor: ProjectDocumentActor;
    assetId: string;
    versionId: string;
    purpose: ProjectDocumentPurpose;
    consentAccepted: boolean;
  }): Promise<
    ProjectDocumentServiceResult<{
      grantId: string;
      purpose: ProjectDocumentPurpose;
    }>
  > {
    if (
      !PROJECT_DOCUMENT_PURPOSES.some((purpose) => purpose === input.purpose)
    ) {
      return { ok: false, error: "purpose_forbidden" };
    }
    const pair = this.dependencies.repository.getAssetVersion(input);
    if (!pair) {
      return { ok: false, error: "not_found" };
    }
    const authError = await this.authorize(input.actor, pair.asset.projectId);
    if (authError) {
      return { ok: false, error: authError };
    }
    if (
      input.actor.kind !== "registered_customer" ||
      !input.consentAccepted ||
      pair.asset.lifecycle !== "active" ||
      pair.asset.createdByUserId !== input.actor.userId
    ) {
      return { ok: false, error: "project_forbidden" };
    }
    const existing = this.dependencies.repository.findGrant({
      versionId: input.versionId,
      granteeUserId: input.actor.userId,
      purpose: input.purpose,
    });
    if (existing) {
      return {
        ok: true,
        value: { grantId: existing.id, purpose: existing.purpose },
        replayed: true,
      };
    }
    let grantId: string;
    try {
      grantId = this.dependencies.createId("grant");
    } catch {
      return { ok: false, error: "state_conflict" };
    }
    const grant = this.dependencies.repository.createCreatorGrant({
      id: grantId,
      projectId: pair.asset.projectId,
      assetId: pair.asset.id,
      versionId: pair.version.versionId,
      grantorUserId: input.actor.userId,
      granteeUserId: input.actor.userId,
      purpose: input.purpose,
      createdAt: this.dependencies.clock(),
    });
    if (grant.kind === "conflict" || !grant.grant) {
      return { ok: false, error: "state_conflict" };
    }
    return {
      ok: true,
      value: { grantId: grant.grant.id, purpose: grant.grant.purpose },
      replayed: grant.kind === "existing",
    };
  }

  async listMetadata(input: {
    actor: ProjectDocumentActor;
    projectId: string;
  }): Promise<ProjectDocumentServiceResult<ProjectDocumentMetadata[]>> {
    const authError = await this.authorize(input.actor, input.projectId);
    if (authError) {
      return { ok: false, error: authError };
    }
    if (input.actor.kind !== "registered_customer") {
      return { ok: false, error: "invalid_actor" };
    }
    const metadata: ProjectDocumentMetadata[] = [];
    for (const {
      asset,
      version,
    } of this.dependencies.repository.listProjectVersions(input.projectId)) {
      if (
        asset.lifecycle !== "active" ||
        !this.dependencies.repository.findGrant({
          versionId: version.versionId,
          granteeUserId: input.actor.userId,
          purpose: "metadata_read",
        })
      ) {
        continue;
      }
      metadata.push({
        assetId: asset.id,
        versionId: version.versionId,
        versionNumber: version.versionNumber,
        lifecycle: asset.lifecycle,
        originKind: version.origin.kind,
        canonicalMime: version.canonicalMime,
        formatId: version.formatId,
        byteSize: version.byteSize,
        sha256: version.sha256,
        storageStatus: version.storageStatus,
        securityStatus: version.securityStatus,
      });
    }
    return { ok: true, value: metadata, replayed: false };
  }

  readContent(input: {
    actor: ProjectDocumentActor;
    assetId: string;
    versionId: string;
  }): Promise<ProjectDocumentServiceResult<Uint8Array>> {
    return this.readByPurpose(input, "content_read");
  }

  download(input: {
    actor: ProjectDocumentActor;
    assetId: string;
    versionId: string;
  }): Promise<ProjectDocumentServiceResult<Uint8Array>> {
    return this.readByPurpose(input, "download");
  }

  async reconcileScan(input: {
    candidate: ProjectDocumentScanAttestation;
  }): Promise<ProjectDocumentServiceResult<ProjectDocumentScanReceipt>> {
    let verified: VerifiedProjectDocumentScanAttestation | null;
    try {
      verified = await this.dependencies.attestationVerifier.verify(
        input.candidate
      );
    } catch {
      return { ok: false, error: "scan_unverified" };
    }
    if (!verified) {
      return { ok: false, error: "scan_unverified" };
    }
    const pair = this.dependencies.repository.getVersion(verified.versionId);
    if (!pair) {
      return { ok: false, error: "not_found" };
    }
    if (verified.generation !== pair.processingGeneration) {
      return { ok: false, error: "stale_generation" };
    }
    if (
      !verified.objectIdentity ||
      typeof verified.objectIdentity.key !== "string" ||
      typeof verified.objectIdentity.objectVersionId !== "string" ||
      typeof verified.objectIdentity.sha256 !== "string" ||
      !Number.isSafeInteger(verified.objectIdentity.byteSize) ||
      verified.projectId !== pair.projectId ||
      verified.objectIdentity.key !== pair.storageKey ||
      verified.objectIdentity.sha256 !== pair.sha256 ||
      verified.objectIdentity.byteSize !== pair.byteSize ||
      !this.sameObjectIdentity(verified.objectIdentity, pair.objectIdentity)
    ) {
      return { ok: false, error: "scan_identity_mismatch" };
    }
    const authError = await this.authorize(
      { kind: "registered_customer", userId: pair.uploadedByUserId },
      pair.projectId
    );
    if (authError) {
      return { ok: false, error: authError };
    }
    if (
      !isSafeNonEmpty(verified.providerCode) ||
      verified.providerCode.length > 64 ||
      !isSafeNonEmpty(verified.providerEventId) ||
      verified.providerEventId.length > 128 ||
      !Number.isSafeInteger(verified.generation) ||
      verified.generation < 1 ||
      !Number.isFinite(Date.parse(verified.occurredAt)) ||
      !["clean", "rejected", "failed"].includes(verified.result)
    ) {
      return { ok: false, error: "scan_unverified" };
    }
    let currentIdentity: StatObjectResult;
    try {
      currentIdentity = await this.dependencies.objectStore.statIdentity({
        key: pair.storageKey,
      });
    } catch {
      return { ok: false, error: "storage_failed" };
    }
    if (currentIdentity.kind === "failed") {
      return { ok: false, error: "storage_failed" };
    }
    if (
      currentIdentity.kind !== "found" ||
      !this.sameObjectIdentity(currentIdentity.identity, pair.objectIdentity)
    ) {
      this.dependencies.repository.failIntegrity({
        versionId: pair.versionId,
        expectedGeneration: pair.processingGeneration,
      });
      return { ok: false, error: "scan_identity_mismatch" };
    }
    let scannedBytes: ReadObjectResult;
    try {
      scannedBytes = await this.dependencies.objectStore.readBounded({
        key: pair.storageKey,
        expectedMaxBytes: pair.byteSize,
      });
    } catch {
      return { ok: false, error: "storage_failed" };
    }
    if (scannedBytes.kind !== "found") {
      return { ok: false, error: "storage_failed" };
    }
    if (
      !this.sameObjectIdentity(scannedBytes.identity, pair.objectIdentity) ||
      scannedBytes.bytes.byteLength !== pair.byteSize ||
      sha256(scannedBytes.bytes) !== pair.sha256
    ) {
      this.dependencies.repository.failIntegrity({
        versionId: pair.versionId,
        expectedGeneration: pair.processingGeneration,
      });
      return { ok: false, error: "integrity_mismatch" };
    }
    const currentAuthError = await this.authorize(
      { kind: "registered_customer", userId: pair.uploadedByUserId },
      pair.projectId
    );
    if (currentAuthError) {
      return { ok: false, error: currentAuthError };
    }
    let runId: string;
    const startedAt = this.dependencies.clock();
    try {
      runId = this.dependencies.createId("run");
    } catch {
      return { ok: false, error: "state_conflict" };
    }
    const applied: ApplyProjectDocumentScanResult =
      this.dependencies.repository.applyScan({
        versionId: pair.versionId,
        expectedGeneration: verified.generation,
        eventFingerprint: hashProjectOperationRequest(verified),
        attestation: verified,
        runId,
        servicePrincipalCode: "synthetic_attestation_verifier",
        startedAt,
        completedAt: this.dependencies.clock(),
      });
    switch (applied.kind) {
      case "applied":
      case "replayed":
        return {
          ok: true,
          value: {
            versionId: applied.version.versionId,
            generation: applied.version.processingGeneration,
            securityStatus: applied.version.securityStatus,
            processingRunId: applied.run.id,
          },
          replayed: applied.kind === "replayed",
        };
      case "event_conflict":
        return { ok: false, error: "scan_event_conflict" };
      case "stale_generation":
        return { ok: false, error: "stale_generation" };
      case "not_found":
        return { ok: false, error: "not_found" };
      case "run_conflict":
      case "state_conflict":
        return { ok: false, error: "state_conflict" };
      default:
        return { ok: false, error: "state_conflict" };
    }
  }

  async revokeGrant(input: {
    actor: ProjectDocumentActor;
    grantId: string;
  }): Promise<
    ProjectDocumentServiceResult<{ grantId: string; revoked: true }>
  > {
    const grant = this.dependencies.repository.getGrant(input.grantId);
    if (!grant) {
      return { ok: false, error: "not_found" };
    }
    const authError = await this.authorize(input.actor, grant.projectId);
    if (authError) {
      return { ok: false, error: authError };
    }
    if (
      input.actor.kind !== "registered_customer" ||
      grant.grantorUserId !== input.actor.userId
    ) {
      return { ok: false, error: "not_found" };
    }
    const updated = this.dependencies.repository.revokeGrant({
      grantId: grant.id,
      actorUserId: input.actor.userId,
      revokedAt: this.dependencies.clock(),
    });
    if (!updated) {
      return { ok: false, error: "not_found" };
    }
    return {
      ok: true,
      value: { grantId: updated.id, revoked: true },
      replayed: grant.revokedAt !== null,
    };
  }

  async withdrawAsset(input: {
    actor: ProjectDocumentActor;
    assetId: string;
  }): Promise<ProjectDocumentServiceResult<ProjectDocumentMutationResult>> {
    const asset = this.dependencies.repository.getAsset(input.assetId);
    if (!asset) {
      return { ok: false, error: "not_found" };
    }
    const authError = await this.authorize(input.actor, asset.projectId);
    if (authError) {
      return { ok: false, error: authError };
    }
    if (
      input.actor.kind !== "registered_customer" ||
      asset.createdByUserId !== input.actor.userId
    ) {
      return { ok: false, error: "not_found" };
    }
    const updated = this.dependencies.repository.withdrawAsset({
      assetId: asset.id,
      actorUserId: input.actor.userId,
    });
    if (!updated) {
      return { ok: false, error: "not_found" };
    }
    return {
      ok: true,
      value: { assetId: updated.id, lifecycle: updated.lifecycle },
      replayed: asset.lifecycle !== "active",
    };
  }

  private async readByPurpose(
    input: { actor: ProjectDocumentActor; assetId: string; versionId: string },
    purpose: Extract<ProjectDocumentPurpose, "content_read" | "download">
  ): Promise<ProjectDocumentServiceResult<Uint8Array>> {
    const pair = this.dependencies.repository.getAssetVersion(input);
    if (!pair) {
      return { ok: false, error: "not_found" };
    }
    const authError = await this.authorize(input.actor, pair.asset.projectId);
    if (authError) {
      return { ok: false, error: authError };
    }
    if (input.actor.kind !== "registered_customer") {
      return { ok: false, error: "invalid_actor" };
    }
    const actorUserId = input.actor.userId;
    if (
      pair.asset.lifecycle !== "active" ||
      !this.dependencies.repository.findGrant({
        versionId: pair.version.versionId,
        granteeUserId: actorUserId,
        purpose,
      })
    ) {
      return { ok: false, error: "not_found" };
    }
    if (
      pair.version.storageStatus !== "stored" ||
      !pair.version.objectIdentity
    ) {
      return { ok: false, error: "document_not_stored" };
    }
    if (pair.version.securityStatus !== "clean") {
      return { ok: false, error: "document_not_clean" };
    }
    let stored: ReadObjectResult;
    try {
      stored = await this.dependencies.objectStore.readBounded({
        key: pair.version.storageKey,
        expectedMaxBytes: pair.version.byteSize,
      });
    } catch {
      return { ok: false, error: "storage_failed" };
    }
    if (stored.kind !== "found") {
      return { ok: false, error: "storage_failed" };
    }
    if (
      !this.sameObjectIdentity(stored.identity, pair.version.objectIdentity) ||
      stored.bytes.byteLength !== pair.version.byteSize ||
      sha256(stored.bytes) !== pair.version.sha256
    ) {
      this.dependencies.repository.failIntegrity({
        versionId: pair.version.versionId,
        expectedGeneration: pair.version.processingGeneration,
      });
      return { ok: false, error: "integrity_mismatch" };
    }
    const currentAuthError = await this.authorize(
      input.actor,
      pair.asset.projectId
    );
    if (currentAuthError) {
      return { ok: false, error: currentAuthError };
    }
    const currentPair = this.dependencies.repository.getAssetVersion(input);
    if (!currentPair || currentPair.asset.lifecycle !== "active") {
      return { ok: false, error: "not_found" };
    }
    if (
      currentPair.version.storageStatus !== "stored" ||
      !currentPair.version.objectIdentity
    ) {
      return { ok: false, error: "document_not_stored" };
    }
    if (currentPair.version.securityStatus !== "clean") {
      return { ok: false, error: "document_not_clean" };
    }
    if (
      !this.sameObjectIdentity(
        pair.version.objectIdentity,
        currentPair.version.objectIdentity
      ) ||
      currentPair.version.sha256 !== pair.version.sha256 ||
      currentPair.version.byteSize !== pair.version.byteSize
    ) {
      this.dependencies.repository.failIntegrity({
        versionId: pair.version.versionId,
        expectedGeneration: currentPair.version.processingGeneration,
      });
      return { ok: false, error: "integrity_mismatch" };
    }
    if (
      !this.dependencies.repository.findGrant({
        versionId: currentPair.version.versionId,
        granteeUserId: actorUserId,
        purpose,
      })
    ) {
      return { ok: false, error: "not_found" };
    }
    return {
      ok: true,
      value: new Uint8Array(stored.bytes),
      replayed: false,
    };
  }

  private async startOrReplayIntent(
    spec: IntentSpec
  ): Promise<ProjectDocumentServiceResult<ProjectDocumentOperationReceipt>> {
    const key: ProjectDocumentOperationKey = {
      actorUserId: spec.actor.userId,
      operationType: spec.operationType,
      operationId: spec.operationId,
    };
    const flightKey = JSON.stringify([
      key.actorUserId,
      key.operationType,
      key.operationId,
    ]);
    const inFlight = this.inFlight.get(flightKey);
    if (inFlight) {
      if (inFlight.requestHash !== spec.requestHash) {
        return { ok: false, error: "idempotency_conflict" };
      }
      return asReplay(await inFlight.promise);
    }
    const existing = this.dependencies.repository.findOperation(key);
    if (existing) {
      if (existing.requestHash !== spec.requestHash) {
        return { ok: false, error: "idempotency_conflict" };
      }
      if (existing.status !== "intent_created") {
        return this.replayOperation(existing);
      }
      const asset = this.dependencies.repository.getAsset(existing.assetId);
      const version = this.dependencies.repository.getVersion(
        existing.versionId
      );
      if (!asset || !version) {
        return { ok: false, error: "state_conflict" };
      }
      const promise = this.storeIntent({
        spec,
        key,
        operation: existing,
        asset,
        version,
      });
      this.inFlight.set(flightKey, { requestHash: spec.requestHash, promise });
      try {
        return asReplay(await promise);
      } finally {
        this.inFlight.delete(flightKey);
      }
    }

    let assetId: string;
    let versionId: string;
    let operationId: string;
    try {
      assetId = this.dependencies.createId("asset");
      versionId = this.dependencies.createId("version");
      operationId = spec.operationId;
    } catch {
      return { ok: false, error: "invalid_request" };
    }
    if (![assetId, versionId].every(isSafeOpaqueId)) {
      return { ok: false, error: "invalid_request" };
    }
    const now = this.dependencies.clock();
    const storageKey = `project-documents/${assetId}/${versionId}/bytes`;
    const asset: ProjectDocumentAssetRecord = {
      id: assetId,
      projectId: spec.projectId,
      createdByUserId: spec.actor.userId,
      lifecycle: "active",
      createdAt: now,
    };
    const version: ProjectDocumentVersionRecord = {
      projectId: spec.projectId,
      assetId,
      versionId,
      versionNumber: 1,
      storageKey,
      sha256: spec.content.sha256,
      byteSize: spec.content.byteSize,
      canonicalMime: spec.content.canonicalMime,
      formatId: spec.content.formatId,
      origin: { ...spec.origin },
      uploadedByUserId: spec.actor.userId,
      createdAt: now,
      storageStatus: "pending",
      securityStatus: "pending",
      processingGeneration: 1,
      objectIdentity: null,
    };
    const operation: ProjectDocumentOperationRecord = {
      actorUserId: spec.actor.userId,
      projectId: spec.projectId,
      operationId,
      operationType: spec.operationType,
      requestHash: spec.requestHash,
      assetId,
      versionId,
      status: "intent_created",
      errorCode: null,
      createdAt: now,
      completedAt: null,
    };
    const claim = this.dependencies.repository.claimIntent({
      operation,
      asset,
      version,
    });
    if (claim.kind === "conflict") {
      return { ok: false, error: "idempotency_conflict" };
    }
    if (claim.kind === "existing") {
      if (claim.operation.requestHash !== spec.requestHash) {
        return { ok: false, error: "idempotency_conflict" };
      }
      const existingAsset = this.dependencies.repository.getAsset(
        claim.operation.assetId
      );
      const existingVersion = this.dependencies.repository.getVersion(
        claim.operation.versionId
      );
      if (!existingAsset || !existingVersion) {
        return { ok: false, error: "state_conflict" };
      }
      return this.replayOperation(
        claim.operation,
        existingAsset,
        existingVersion
      );
    }
    const promise = this.storeIntent({ spec, key, operation, asset, version });
    this.inFlight.set(flightKey, { requestHash: spec.requestHash, promise });
    try {
      return await promise;
    } finally {
      this.inFlight.delete(flightKey);
    }
  }

  private async storeIntent(input: {
    spec: IntentSpec;
    key: ProjectDocumentOperationKey;
    operation: ProjectDocumentOperationRecord;
    asset: ProjectDocumentAssetRecord;
    version: ProjectDocumentVersionRecord;
  }): Promise<ProjectDocumentServiceResult<ProjectDocumentOperationReceipt>> {
    let put: PutObjectResult;
    try {
      put = await this.dependencies.objectStore.putNew({
        key: input.version.storageKey,
        bytes: new Uint8Array(input.spec.content.bytes),
        expectedSha256: input.version.sha256,
        contentType: input.version.canonicalMime,
      });
    } catch {
      return this.failIntent(input, "cleanup_pending", "cleanup_pending");
    }
    if (put.kind === "failed" && put.reason === "already_exists") {
      let existingStat: StatObjectResult;
      let existingRead: ReadObjectResult;
      try {
        existingStat = await this.dependencies.objectStore.statIdentity({
          key: input.version.storageKey,
        });
        existingRead = await this.dependencies.objectStore.readBounded({
          key: input.version.storageKey,
          expectedMaxBytes: input.version.byteSize,
        });
      } catch {
        return this.failIntent(input, "failed", "storage_failed");
      }
      if (
        existingStat.kind !== "found" ||
        existingRead.kind !== "found" ||
        !this.matchesExpectedIdentity(existingStat.identity, input.version) ||
        !this.sameObjectIdentity(
          existingRead.identity,
          existingStat.identity
        ) ||
        existingRead.bytes.byteLength !== input.version.byteSize ||
        sha256(existingRead.bytes) !== input.version.sha256
      ) {
        return this.failIntent(input, "failed", "integrity_mismatch");
      }
      put = { kind: "created" as const, identity: existingStat.identity };
    }
    if (put.kind === "failed") {
      if (put.possiblyOwnedIdentity) {
        return this.cleanupAndFail(
          input,
          put.possiblyOwnedIdentity,
          put.reason === "integrity_mismatch"
            ? "integrity_mismatch"
            : "storage_failed"
        );
      }
      const error =
        put.reason === "integrity_mismatch"
          ? "integrity_mismatch"
          : "storage_failed";
      return this.failIntent(input, "failed", error);
    }

    if (!this.matchesExpectedIdentity(put.identity, input.version)) {
      return this.cleanupAndFail(input, put.identity, "integrity_mismatch");
    }
    let stat: StatObjectResult;
    try {
      stat = await this.dependencies.objectStore.statIdentity({
        key: input.version.storageKey,
      });
    } catch {
      return this.cleanupAndFail(input, put.identity, "integrity_mismatch");
    }
    if (
      stat.kind !== "found" ||
      !this.sameObjectIdentity(stat.identity, put.identity)
    ) {
      return this.cleanupAndFail(input, put.identity, "integrity_mismatch");
    }
    let storedBytes: ReadObjectResult;
    try {
      storedBytes = await this.dependencies.objectStore.readBounded({
        key: input.version.storageKey,
        expectedMaxBytes: input.version.byteSize,
      });
    } catch {
      return this.cleanupAndFail(input, put.identity, "storage_failed");
    }
    if (
      storedBytes.kind !== "found" ||
      !this.sameObjectIdentity(storedBytes.identity, put.identity) ||
      storedBytes.bytes.byteLength !== input.version.byteSize ||
      sha256(storedBytes.bytes) !== input.version.sha256
    ) {
      return this.cleanupAndFail(input, put.identity, "integrity_mismatch");
    }

    if (input.spec.recheckSource && !(await input.spec.recheckSource())) {
      return this.cleanupAndFail(input, put.identity, "source_not_owned");
    }
    const authError = await this.authorize(
      input.spec.actor,
      input.spec.projectId
    );
    if (authError) {
      return this.cleanupAndFail(input, put.identity, authError);
    }
    const completedAt = this.dependencies.clock();
    const completed = this.dependencies.repository.completeStorage({
      key: input.key,
      expectedGeneration: input.version.processingGeneration,
      identity: put.identity,
      completedAt,
    });
    if (!completed) {
      return this.cleanupAndFail(input, put.identity, "state_conflict");
    }
    const operation = this.dependencies.repository.findOperation(input.key);
    const version = this.dependencies.repository.getVersion(
      input.version.versionId
    );
    if (!operation || !version) {
      return { ok: false, error: "state_conflict" };
    }
    return {
      ok: true,
      value: publicReceipt(operation, version),
      replayed: false,
    };
  }

  private async cleanupAndFail(
    input: {
      key: ProjectDocumentOperationKey;
      operation: ProjectDocumentOperationRecord;
      asset: ProjectDocumentAssetRecord;
      version: ProjectDocumentVersionRecord;
    },
    identity: ProjectDocumentObjectIdentity,
    originalError: ProjectDocumentErrorCode
  ): Promise<ProjectDocumentServiceResult<ProjectDocumentOperationReceipt>> {
    let cleanupStatus: "failed" | "cleanup_pending" = "cleanup_pending";
    try {
      const removed = await this.dependencies.objectStore.removeIfOwned({
        identity,
      });
      if (removed.kind === "removed") {
        cleanupStatus = "failed";
      }
    } catch {
      cleanupStatus = "cleanup_pending";
    }
    const error =
      cleanupStatus === "cleanup_pending" ? "cleanup_pending" : originalError;
    return this.failIntent(input, cleanupStatus, error);
  }

  private failIntent(
    input: {
      key: ProjectDocumentOperationKey;
      operation: ProjectDocumentOperationRecord;
      asset: ProjectDocumentAssetRecord;
      version: ProjectDocumentVersionRecord;
    },
    status: "failed" | "cleanup_pending",
    error: ProjectDocumentErrorCode
  ): ProjectDocumentServiceResult<ProjectDocumentOperationReceipt> {
    const failed = this.dependencies.repository.failStorage({
      key: input.key,
      expectedGeneration: input.version.processingGeneration,
      status,
      errorCode: error,
      completedAt: this.dependencies.clock(),
    });
    if (!failed) {
      return { ok: false, error: "state_conflict" };
    }
    const operation = this.dependencies.repository.findOperation(input.key);
    const version = this.dependencies.repository.getVersion(
      input.version.versionId
    );
    if (!operation || !version) {
      return { ok: false, error: "state_conflict" };
    }
    return {
      ok: false,
      error,
      operation: publicReceipt(operation, version),
    };
  }

  private replayOperation(
    operation: ProjectDocumentOperationRecord,
    knownAsset?: ProjectDocumentAssetRecord,
    knownVersion?: ProjectDocumentVersionRecord
  ): ProjectDocumentServiceResult<ProjectDocumentOperationReceipt> {
    const version =
      knownVersion ??
      this.dependencies.repository.getVersion(operation.versionId);
    const asset =
      knownAsset ?? this.dependencies.repository.getAsset(operation.assetId);
    if (!version || !asset) {
      return { ok: false, error: "state_conflict", replayed: true };
    }
    const receipt = publicReceipt(operation, version);
    if (operation.status === "stored") {
      if (version.storageStatus !== "stored") {
        return {
          ok: false,
          error: "document_not_stored",
          operation: receipt,
          replayed: true,
        };
      }
      return { ok: true, value: receipt, replayed: true };
    }
    if (operation.status === "intent_created") {
      return {
        ok: false,
        error: "state_conflict",
        operation: receipt,
        replayed: true,
      };
    }
    return {
      ok: false,
      error: operation.errorCode ?? "storage_failed",
      operation: receipt,
      replayed: true,
    };
  }

  private async validateBytes(input: {
    filename: string;
    declaredMimeType: string;
    bytes: Uint8Array;
  }): Promise<ProjectDocumentServiceResult<ValidatedBytes>> {
    if (
      typeof input.filename !== "string" ||
      typeof input.declaredMimeType !== "string" ||
      !(input.bytes instanceof Uint8Array) ||
      input.bytes.byteLength === 0
    ) {
      return { ok: false, error: "invalid_document" };
    }
    if (input.bytes.byteLength > MAX_MATTER_DOCUMENT_BYTES) {
      return { ok: false, error: "invalid_document" };
    }
    try {
      const bytes = new Uint8Array(input.bytes);
      const valid = await validateMatterDocument({
        filename: input.filename,
        declaredMimeType: input.declaredMimeType,
        bytes,
      });
      return {
        ok: true,
        value: {
          bytes,
          filename: valid.originalFilename,
          declaredMimeType: input.declaredMimeType,
          canonicalMime: valid.mimeType,
          formatId: valid.format.id,
          sha256: sha256(bytes),
          byteSize: bytes.byteLength,
        },
        replayed: false,
      };
    } catch {
      return { ok: false, error: "invalid_document" };
    }
  }

  private async authorize(
    actor: ProjectDocumentActor,
    projectId: string
  ): Promise<ProjectDocumentErrorCode | null> {
    if (
      actor.kind !== "registered_customer" ||
      !isSafeNonEmpty(actor.userId) ||
      !isSafeNonEmpty(projectId)
    ) {
      return "invalid_actor";
    }
    let decision: ProjectAuthorizationDecision;
    try {
      decision = await this.dependencies.authorization.authorizeProject({
        actor,
        projectId,
      });
    } catch {
      return "authorization_unavailable";
    }
    return mapAuthorizationDecision(actor, projectId, decision);
  }

  private matchesExpectedIdentity(
    identity: ProjectDocumentObjectIdentity,
    version: ProjectDocumentVersionRecord
  ) {
    return (
      identity.key === version.storageKey &&
      identity.sha256 === version.sha256 &&
      identity.byteSize === version.byteSize &&
      isSafeNonEmpty(identity.objectVersionId)
    );
  }

  private sameObjectIdentity(
    left: ProjectDocumentObjectIdentity,
    right: ProjectDocumentObjectIdentity | null
  ) {
    return (
      right !== null &&
      left.key === right.key &&
      left.objectVersionId === right.objectVersionId &&
      left.sha256 === right.sha256 &&
      left.byteSize === right.byteSize
    );
  }
}

export function createProjectDocumentService(
  dependencies: ProjectDocumentServiceDependencies
) {
  return new ProjectDocumentService(dependencies);
}
