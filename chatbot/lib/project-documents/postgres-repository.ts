import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { guestRegex } from "@/lib/constants";
import {
  hashProjectOperationRequest,
  validateProjectOperationId,
} from "@/lib/db/project-foundation-utils";
import type { getLazyDatabase } from "@/lib/db/runtime-client";
import type {
  ProjectEventSubjectKind,
  ProjectEventType,
  ProjectOperationResultKind,
  ProjectOperationType,
} from "@/lib/db/schema";
import {
  chat,
  matterDocument,
  projectDocumentAsset,
  projectDocumentGrant,
  projectDocumentImportConsent,
  projectDocumentIntent,
  projectDocumentProcessingRun,
  projectDocumentVersion,
  projectEvent,
  projectMembership,
  projectOperation,
  studyJourneyProject,
  user,
} from "@/lib/db/schema";
import { MATTER_DOCUMENT_MIME } from "@/lib/matter-documents/formats";
import { MAX_MATTER_DOCUMENT_BYTES } from "@/lib/matter-documents/validation";
import type { ProjectDocumentPurpose } from "./types";

type Database = ReturnType<typeof getLazyDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type ProjectDocumentPersistenceErrorCode =
  | "invalid_request"
  | "invalid_operation_id"
  | "idempotency_conflict"
  | "project_not_found"
  | "project_forbidden"
  | "project_closed"
  | "revision_conflict"
  | "state_conflict"
  | "integrity_conflict"
  | "consent_unverified"
  | "worker_untrusted"
  | "source_not_owned";

export class ProjectDocumentPersistenceError extends Error {
  readonly code: ProjectDocumentPersistenceErrorCode;

  constructor(code: ProjectDocumentPersistenceErrorCode) {
    super(code);
    this.name = "ProjectDocumentPersistenceError";
    this.code = code;
  }
}

export type ValidatedProjectDocumentMetadata = {
  sha256: string;
  byteSize: number;
  canonicalMime: string;
  formatId: string;
};

export type ImportConsentExpectation = {
  accepted: true;
  actorUserId: string;
  projectId: string;
  sourceChatId: string;
  sourceDocumentId: string;
  sourceSha256: string;
};

export type VerifiedSyntheticImportConsent = ImportConsentExpectation & {
  noticeVersion: string;
  acceptedAt: string;
};

export type GrantConsentExpectation = {
  accepted: true;
  actorUserId: string;
  projectId: string;
  assetId: string;
  versionId: string;
  purpose: ProjectDocumentPurpose;
};

export type VerifiedSyntheticGrantConsent = GrantConsentExpectation & {
  noticeVersion: string;
  acceptedAt: string;
};

export type StorageResultExpectation = {
  projectId: string;
  versionId: string;
  generation: number;
  storageKey: string;
  sha256: string;
  byteSize: number;
  outcome: "stored" | "failed" | "cleanup_pending";
  objectVersionId?: string;
  errorCode?: string;
};

export type VerifiedSyntheticStorageResult = StorageResultExpectation;

export type ScanAttestationExpectation = {
  projectId: string;
  versionId: string;
  generation: number;
  storageKey: string;
  storageObjectVersionId: string;
  sha256: string;
  byteSize: number;
  providerCode: string;
  providerEventId: string;
  /** Canonical source-event fingerprint, when supplied by a trusted adapter. */
  eventFingerprint?: string;
  occurredAt: string;
  result: "clean" | "rejected" | "failed";
};

export type VerifiedSyntheticScanAttestation = ScanAttestationExpectation;

/**
 * These ports are injected internal capabilities. Their string values are
 * audit data only; a caller-supplied service principal is never accepted.
 */
export type ProjectDocumentTrustedPersistencePorts = {
  verifyImportConsent(
    input: unknown,
    expected: ImportConsentExpectation
  ): Promise<VerifiedSyntheticImportConsent | null>;
  verifyGrantConsent(
    input: unknown,
    expected: GrantConsentExpectation
  ): Promise<VerifiedSyntheticGrantConsent | null>;
  verifyStorageResult(
    input: unknown
  ): Promise<VerifiedSyntheticStorageResult | null>;
  verifyScanAttestation(
    input: unknown
  ): Promise<VerifiedSyntheticScanAttestation | null>;
};

export type ProjectDocumentPostgresWriteBoundary =
  | "operation_claimed"
  | "asset_created"
  | "version_created"
  | "intent_created"
  | "consent_created"
  | "storage_version_updated"
  | "intent_updated"
  | "scan_run_started"
  | "scan_run_completed"
  | "grant_created"
  | "grant_revoked"
  | "asset_withdrawn"
  | "project_revised"
  | "event_created";

export type ProjectDocumentPostgresTestHooks = {
  afterWrite?: (
    boundary: ProjectDocumentPostgresWriteBoundary
  ) => void | Promise<void>;
};

export type ProjectDocumentPostgresRepositoryOptions = {
  database: Database;
  trustedPorts: ProjectDocumentTrustedPersistencePorts;
  testHooks?: ProjectDocumentPostgresTestHooks;
};

export type ProjectDocumentIntentOutcome = {
  operationId: string;
  operationType:
    | "project_document_upload_intent"
    | "project_document_import_intent";
  projectId: string;
  assetId: string;
  versionId: string;
  generation: number;
  status: "intent_created" | "stored" | "failed" | "cleanup_pending";
  storageStatus: "pending" | "stored" | "failed" | "cleanup_pending";
  securityStatus: "pending" | "clean" | "rejected" | "failed";
  projectRevision: number;
  replayed: boolean;
};

export type ProjectDocumentWorkerOutcome = {
  projectId: string;
  versionId: string;
  generation: number;
  status: "stored" | "failed" | "cleanup_pending" | "clean" | "rejected";
  securityStatus: "pending" | "clean" | "rejected" | "failed";
  projectRevision: number;
  operationId: string;
  replayed: boolean;
};

export type ProjectDocumentGrantOutcome = {
  projectId: string;
  grantId: string;
  assetId: string;
  versionId: string;
  purpose: ProjectDocumentPurpose;
  revokedAt: string | null;
  revision: number;
  projectRevision: number;
  replayed: boolean;
};

export type ProjectDocumentPostgresMetadata = {
  projectId: string;
  assetId: string;
  versionId: string;
  versionNumber: number;
  lifecycle: "active" | "withdrawn" | "deletion_pending" | "deleted";
  canonicalMime: string;
  byteSize: number;
  sha256: string;
  originKind: "direct_upload" | "explicit_chat_import";
  storageStatus: "pending" | "stored" | "failed" | "cleanup_pending";
  securityStatus: "pending" | "clean" | "rejected" | "failed";
};

type OperationClaim = {
  id: string;
  resultId: string;
  resultKind: string;
  requestHash: string;
  replayed: boolean;
};

type ProjectAccess = {
  id: string;
  ownerUserId: string;
  status: "active" | "closed";
  revision: number;
};

function fail(code: ProjectDocumentPersistenceErrorCode): never {
  throw new ProjectDocumentPersistenceError(code);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value
  );
}

function requireUuid(value: string): string {
  if (typeof value !== "string" || !isUuid(value)) {
    return fail("invalid_request");
  }
  return value;
}

function requireMetadata(metadata: ValidatedProjectDocumentMetadata) {
  if (
    !metadata ||
    typeof metadata.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(metadata.sha256) ||
    !Number.isSafeInteger(metadata.byteSize) ||
    metadata.byteSize <= 0 ||
    metadata.byteSize > MAX_MATTER_DOCUMENT_BYTES ||
    typeof metadata.canonicalMime !== "string" ||
    typeof metadata.formatId !== "string" ||
    !Object.entries(MATTER_DOCUMENT_MIME).some(
      ([formatId, mime]) =>
        formatId === metadata.formatId && mime === metadata.canonicalMime
    )
  ) {
    return fail("invalid_request");
  }
}

function requireOperationId(operationId: string): string {
  try {
    return validateProjectOperationId(operationId);
  } catch {
    return fail("invalid_operation_id");
  }
}

function canonicalDate(value: string): Date {
  if (typeof value !== "string") {
    return fail("invalid_request");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    return fail("invalid_request");
  }
  return date;
}

function validBoundedCode(value: string, maxLength: number): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength &&
    /^[a-z][a-z0-9_.-]*$/u.test(value)
  );
}

function databaseErrorDetails(
  error: unknown
): { code: string; constraint: string | null } | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = error.code;
  if (typeof code !== "string") {
    return null;
  }
  const constraint =
    "constraint_name" in error && typeof error.constraint_name === "string"
      ? error.constraint_name
      : null;
  return { code, constraint };
}

function mapDatabaseError(error: unknown): unknown {
  if (error instanceof ProjectDocumentPersistenceError) {
    return error;
  }
  const details = databaseErrorDetails(error);
  if (!details) {
    return error;
  }
  if (details.code === "23505") {
    if (
      details.constraint === "ProjectOperation_actor_type_operation_unique" ||
      details.constraint === "ProjectOperation_service_type_operation_unique"
    ) {
      return new ProjectDocumentPersistenceError("idempotency_conflict");
    }
    return new ProjectDocumentPersistenceError("state_conflict");
  }
  if (["23503", "23514", "23P01"].includes(details.code)) {
    return new ProjectDocumentPersistenceError("integrity_conflict");
  }
  return error;
}

async function afterWrite(
  hooks: ProjectDocumentPostgresTestHooks,
  boundary: ProjectDocumentPostgresWriteBoundary
) {
  await hooks.afterWrite?.(boundary);
}

async function claimUserOperation(
  tx: Transaction,
  input: {
    actorUserId: string;
    operationId: string;
    operationType: ProjectOperationType;
    requestHash: string;
    resultId: string;
    resultKind: ProjectOperationResultKind;
  },
  hooks: ProjectDocumentPostgresTestHooks
): Promise<OperationClaim> {
  const [claimed] = await tx
    .insert(projectOperation)
    .values({
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: input.operationType,
      requestHash: input.requestHash,
      resultKind: input.resultKind,
      resultId: input.resultId,
    })
    .onConflictDoNothing({
      target: [
        projectOperation.actorUserId,
        projectOperation.operationType,
        projectOperation.operationId,
      ],
    })
    .returning({
      id: projectOperation.id,
      resultId: projectOperation.resultId,
      resultKind: projectOperation.resultKind,
      requestHash: projectOperation.requestHash,
    });
  if (claimed) {
    await afterWrite(hooks, "operation_claimed");
    return { ...claimed, replayed: false };
  }
  const [existing] = await tx
    .select({
      id: projectOperation.id,
      resultId: projectOperation.resultId,
      resultKind: projectOperation.resultKind,
      requestHash: projectOperation.requestHash,
    })
    .from(projectOperation)
    .where(
      and(
        eq(projectOperation.actorUserId, input.actorUserId),
        eq(projectOperation.operationType, input.operationType),
        eq(projectOperation.operationId, input.operationId)
      )
    )
    .for("update")
    .limit(1);
  if (!existing) {
    return fail("integrity_conflict");
  }
  if (existing.requestHash !== input.requestHash) {
    return fail("idempotency_conflict");
  }
  if (existing.resultKind !== input.resultKind) {
    return fail("integrity_conflict");
  }
  return { ...existing, replayed: true };
}

async function claimServiceOperation(
  tx: Transaction,
  input: {
    servicePrincipalCode:
      | "project_document_storage_worker"
      | "project_document_scan_worker";
    operationId: string;
    operationType: ProjectOperationType;
    requestHash: string;
    resultId: string;
    resultKind: ProjectOperationResultKind;
  },
  hooks: ProjectDocumentPostgresTestHooks
): Promise<OperationClaim> {
  const [claimed] = await tx
    .insert(projectOperation)
    .values({
      actorKind: "service",
      actorUserId: null,
      servicePrincipalCode: input.servicePrincipalCode,
      operationId: input.operationId,
      operationType: input.operationType,
      requestHash: input.requestHash,
      resultKind: input.resultKind,
      resultId: input.resultId,
    })
    .onConflictDoNothing()
    .returning({
      id: projectOperation.id,
      resultId: projectOperation.resultId,
      resultKind: projectOperation.resultKind,
      requestHash: projectOperation.requestHash,
    });
  if (claimed) {
    await afterWrite(hooks, "operation_claimed");
    return { ...claimed, replayed: false };
  }
  const [existing] = await tx
    .select({
      id: projectOperation.id,
      resultId: projectOperation.resultId,
      resultKind: projectOperation.resultKind,
      requestHash: projectOperation.requestHash,
    })
    .from(projectOperation)
    .where(
      and(
        eq(projectOperation.actorKind, "service"),
        eq(projectOperation.servicePrincipalCode, input.servicePrincipalCode),
        eq(projectOperation.operationType, input.operationType),
        eq(projectOperation.operationId, input.operationId)
      )
    )
    .for("update")
    .limit(1);
  if (!existing) {
    return fail("integrity_conflict");
  }
  if (
    existing.requestHash !== input.requestHash ||
    existing.resultKind !== input.resultKind
  ) {
    return fail("idempotency_conflict");
  }
  return { ...existing, replayed: true };
}

async function lockProject(
  tx: Transaction,
  projectId: string
): Promise<ProjectAccess> {
  const [project] = await tx
    .select({
      id: studyJourneyProject.id,
      ownerUserId: studyJourneyProject.ownerUserId,
      status: studyJourneyProject.status,
      revision: studyJourneyProject.revision,
    })
    .from(studyJourneyProject)
    .where(eq(studyJourneyProject.id, projectId))
    .for("update")
    .limit(1);
  if (!project) {
    return fail("project_not_found");
  }
  return project;
}

async function assertUserProjectAuthority(
  tx: Transaction,
  project: ProjectAccess,
  actorUserId: string
) {
  const [actor] = await tx
    .select({ email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, actorUserId))
    .limit(1);
  if (!actor || actor.role !== "user" || guestRegex.test(actor.email)) {
    return fail("project_forbidden");
  }
  if (project.ownerUserId !== actorUserId) {
    const [membership] = await tx
      .select({ status: projectMembership.status })
      .from(projectMembership)
      .where(
        and(
          eq(projectMembership.projectId, project.id),
          eq(projectMembership.userId, actorUserId)
        )
      )
      .for("update")
      .limit(1);
    if (membership?.status !== "active") {
      return fail("project_forbidden");
    }
  }
  if (project.status !== "active") {
    return fail("project_closed");
  }
}

async function assertWorkerCreatorCurrentAuthority(
  tx: Transaction,
  project: ProjectAccess,
  projectId: string,
  versionId: string
): Promise<string> {
  // Read the immutable creator id without taking a document lock so current
  // Membership is still locked before any document rows.
  const [version] = await tx
    .select({ uploadedByUserId: projectDocumentVersion.uploadedByUserId })
    .from(projectDocumentVersion)
    .where(
      and(
        eq(projectDocumentVersion.projectId, projectId),
        eq(projectDocumentVersion.versionId, versionId)
      )
    )
    .limit(1);
  if (!version) {
    return fail("state_conflict");
  }
  await assertUserProjectAuthority(tx, project, version.uploadedByUserId);
  return version.uploadedByUserId;
}

async function assertNoRevokedGrantForAsset(
  tx: Transaction,
  projectId: string,
  assetId: string
) {
  const [revokedGrant] = await tx
    .select({ id: projectDocumentGrant.id })
    .from(projectDocumentGrant)
    .where(
      and(
        eq(projectDocumentGrant.projectId, projectId),
        eq(projectDocumentGrant.assetId, assetId),
        isNotNull(projectDocumentGrant.revokedAt)
      )
    )
    .limit(1);
  if (revokedGrant) {
    return fail("state_conflict");
  }
}

async function assertSourceChatDocumentOwned(
  tx: Transaction,
  input: {
    actorUserId: string;
    sourceChatId: string;
    sourceDocumentId: string;
    sourceSha256: string;
  }
) {
  const [source] = await tx
    .select({
      chatId: matterDocument.chatId,
      documentId: matterDocument.id,
      sha256: matterDocument.sha256,
    })
    .from(matterDocument)
    .innerJoin(chat, eq(chat.id, matterDocument.chatId))
    .where(
      and(
        eq(matterDocument.id, input.sourceDocumentId),
        eq(matterDocument.chatId, input.sourceChatId),
        eq(matterDocument.userId, input.actorUserId),
        eq(chat.userId, input.actorUserId),
        isNull(matterDocument.deletedAt),
        eq(matterDocument.sha256, input.sourceSha256)
      )
    )
    .for("update")
    .limit(1);
  if (!source || source.chatId !== input.sourceChatId) {
    return fail("source_not_owned");
  }
}

async function assertOperationEvent(
  tx: Transaction,
  input: {
    operationRecordId: string;
    projectId: string;
    eventType: ProjectEventType;
    subjectKind: ProjectEventSubjectKind;
    subjectId: string;
    actorKind: "user" | "service";
    actorUserId: string | null;
    servicePrincipalCode: string | null;
  }
) {
  const events = await tx
    .select()
    .from(projectEvent)
    .where(eq(projectEvent.operationRecordId, input.operationRecordId));
  if (
    events.length !== 1 ||
    events[0]?.projectId !== input.projectId ||
    events[0]?.eventType !== input.eventType ||
    events[0]?.subjectKind !== input.subjectKind ||
    events[0]?.subjectId !== input.subjectId ||
    events[0]?.actorKind !== input.actorKind ||
    events[0]?.actorUserId !== input.actorUserId ||
    events[0]?.servicePrincipalCode !== input.servicePrincipalCode
  ) {
    return fail("integrity_conflict");
  }
  return events[0];
}

function assertExpectedRevision(
  project: ProjectAccess,
  expectedProjectRevision: number
) {
  if (
    !Number.isSafeInteger(expectedProjectRevision) ||
    expectedProjectRevision < 1
  ) {
    return fail("invalid_request");
  }
  if (project.revision !== expectedProjectRevision) {
    return fail("revision_conflict");
  }
}

async function reviseProjectAndAppendEvent(
  tx: Transaction,
  input: {
    project: ProjectAccess;
    operationRecordId: string;
    eventType:
      | "project_document_intent_created"
      | "project_document_storage_changed"
      | "project_document_security_changed"
      | "project_document_grant_changed"
      | "project_document_withdrawn";
    subjectKind:
      | "document_asset"
      | "document_version"
      | "document_scan_run"
      | "document_grant";
    subjectId: string;
    actorKind: "user" | "service";
    actorUserId: string | null;
    servicePrincipalCode: string | null;
    hooks: ProjectDocumentPostgresTestHooks;
  }
) {
  const createdAt = new Date();
  const projectRevision = input.project.revision + 1;
  const [updated] = await tx
    .update(studyJourneyProject)
    .set({ revision: projectRevision, updatedAt: createdAt })
    .where(
      and(
        eq(studyJourneyProject.id, input.project.id),
        eq(studyJourneyProject.revision, input.project.revision),
        eq(studyJourneyProject.status, "active")
      )
    )
    .returning({ revision: studyJourneyProject.revision });
  if (!updated || updated.revision !== projectRevision) {
    return fail("revision_conflict");
  }
  await afterWrite(input.hooks, "project_revised");
  await tx.insert(projectEvent).values({
    projectId: input.project.id,
    actorKind: input.actorKind,
    actorUserId: input.actorUserId,
    servicePrincipalCode: input.servicePrincipalCode,
    projectRevision,
    eventType: input.eventType,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    operationRecordId: input.operationRecordId,
    createdAt,
  });
  await afterWrite(input.hooks, "event_created");
  return projectRevision;
}

function validateConsentResult(
  consent: VerifiedSyntheticImportConsent | null,
  expected: ImportConsentExpectation
): VerifiedSyntheticImportConsent {
  if (
    !consent ||
    consent.accepted !== true ||
    consent.actorUserId !== expected.actorUserId ||
    consent.projectId !== expected.projectId ||
    consent.sourceChatId !== expected.sourceChatId ||
    consent.sourceDocumentId !== expected.sourceDocumentId ||
    consent.sourceSha256 !== expected.sourceSha256 ||
    !validBoundedCode(consent.noticeVersion, 128)
  ) {
    return fail("consent_unverified");
  }
  canonicalDate(consent.acceptedAt);
  return consent;
}

function validateGrantConsentResult(
  consent: VerifiedSyntheticGrantConsent | null,
  expected: GrantConsentExpectation
): VerifiedSyntheticGrantConsent {
  if (
    !consent ||
    consent.accepted !== true ||
    consent.actorUserId !== expected.actorUserId ||
    consent.projectId !== expected.projectId ||
    consent.assetId !== expected.assetId ||
    consent.versionId !== expected.versionId ||
    consent.purpose !== expected.purpose ||
    !validBoundedCode(consent.noticeVersion, 128)
  ) {
    return fail("consent_unverified");
  }
  canonicalDate(consent.acceptedAt);
  return consent;
}

function workerOperationId(
  versionId: string,
  generation: number,
  fingerprint: string
): string {
  return createHash("sha256")
    .update(`${versionId}:${generation}:${fingerprint}`, "utf8")
    .digest("hex");
}

function validateStorageResult(
  result: VerifiedSyntheticStorageResult | null
): VerifiedSyntheticStorageResult {
  if (
    !result ||
    !isUuid(result.projectId) ||
    !isUuid(result.versionId) ||
    !Number.isSafeInteger(result.generation) ||
    result.generation < 1 ||
    typeof result.storageKey !== "string" ||
    result.storageKey.trim().length < 1 ||
    result.storageKey.length > 512 ||
    !/^[0-9a-f]{64}$/u.test(result.sha256) ||
    !Number.isSafeInteger(result.byteSize) ||
    result.byteSize < 1 ||
    !["stored", "failed", "cleanup_pending"].includes(result.outcome)
  ) {
    return fail("worker_untrusted");
  }
  if (result.outcome === "stored") {
    if (
      typeof result.objectVersionId !== "string" ||
      result.objectVersionId.trim().length < 1 ||
      result.objectVersionId.length > 256 ||
      result.errorCode !== undefined
    ) {
      return fail("worker_untrusted");
    }
  } else if (
    result.objectVersionId !== undefined ||
    !validBoundedCode(result.errorCode ?? "", 64)
  ) {
    return fail("worker_untrusted");
  }
  return result;
}

function validateScanAttestation(
  attestation: VerifiedSyntheticScanAttestation | null
): VerifiedSyntheticScanAttestation {
  if (
    !attestation ||
    !isUuid(attestation.projectId) ||
    !isUuid(attestation.versionId) ||
    !Number.isSafeInteger(attestation.generation) ||
    attestation.generation < 1 ||
    typeof attestation.storageKey !== "string" ||
    attestation.storageKey.trim().length < 1 ||
    attestation.storageKey.length > 512 ||
    typeof attestation.storageObjectVersionId !== "string" ||
    attestation.storageObjectVersionId.trim().length < 1 ||
    attestation.storageObjectVersionId.length > 256 ||
    !/^[0-9a-f]{64}$/u.test(attestation.sha256) ||
    !Number.isSafeInteger(attestation.byteSize) ||
    attestation.byteSize < 1 ||
    !validBoundedCode(attestation.providerCode, 64) ||
    typeof attestation.providerEventId !== "string" ||
    attestation.providerEventId.trim().length < 1 ||
    attestation.providerEventId.length > 128 ||
    (attestation.eventFingerprint !== undefined &&
      !/^[0-9a-f]{64}$/u.test(attestation.eventFingerprint)) ||
    !["clean", "rejected", "failed"].includes(attestation.result)
  ) {
    return fail("worker_untrusted");
  }
  canonicalDate(attestation.occurredAt);
  return attestation;
}

function isGrantPurpose(value: string): value is ProjectDocumentPurpose {
  return ["metadata_read", "content_read", "download"].includes(value);
}

function resultToIntentOutcome(input: {
  operationId: string;
  operationType: ProjectDocumentIntentOutcome["operationType"];
  intent: typeof projectDocumentIntent.$inferSelect;
  version: typeof projectDocumentVersion.$inferSelect;
  projectRevision: number;
  replayed: boolean;
}): ProjectDocumentIntentOutcome {
  return {
    operationId: input.operationId,
    operationType: input.operationType,
    projectId: input.intent.projectId,
    assetId: input.intent.assetId,
    versionId: input.intent.versionId,
    generation: input.intent.generation,
    status: input.intent.status,
    storageStatus: input.version.storageStatus,
    securityStatus: input.version.securityStatus,
    projectRevision: input.projectRevision,
    replayed: input.replayed,
  };
}

export class PostgresProjectDocumentRepository {
  private readonly database: Database;
  private readonly trustedPorts: ProjectDocumentTrustedPersistencePorts;
  private readonly testHooks: ProjectDocumentPostgresTestHooks;

  constructor(options: ProjectDocumentPostgresRepositoryOptions) {
    this.database = options.database;
    this.trustedPorts = options.trustedPorts;
    this.testHooks = options.testHooks ?? {};
  }

  private async inTransaction<T>(
    operation: (tx: Transaction) => Promise<T>
  ): Promise<T> {
    try {
      return await this.database.transaction(operation);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  createDirectUploadIntent(input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    metadata: ValidatedProjectDocumentMetadata;
  }): Promise<ProjectDocumentIntentOutcome> {
    const actorUserId = requireUuid(input.actorUserId);
    const projectId = requireUuid(input.projectId);
    const operationId = requireOperationId(input.operationId);
    requireMetadata(input.metadata);
    if (
      !Number.isSafeInteger(input.expectedProjectRevision) ||
      input.expectedProjectRevision < 1
    ) {
      return fail("invalid_request");
    }
    const assetId = randomUUID();
    const versionId = randomUUID();
    const requestHash = hashProjectOperationRequest({
      actorUserId,
      projectId,
      operationType: "project_document_upload_intent",
      originKind: "direct_upload",
      sha256: input.metadata.sha256,
      byteSize: input.metadata.byteSize,
      canonicalMime: input.metadata.canonicalMime,
      formatId: input.metadata.formatId,
    });
    return this.createUserIntent({
      actorUserId,
      projectId,
      operationId,
      operationType: "project_document_upload_intent",
      intentKind: "direct_upload",
      expectedProjectRevision: input.expectedProjectRevision,
      metadata: input.metadata,
      assetId,
      versionId,
      requestHash,
    });
  }

  async importOwnedChatDocumentIntent(input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    sourceChatId: string;
    sourceDocumentId: string;
    sourceSha256: string;
    metadata: ValidatedProjectDocumentMetadata;
    consentAcknowledgement: unknown;
  }): Promise<ProjectDocumentIntentOutcome> {
    const actorUserId = requireUuid(input.actorUserId);
    const projectId = requireUuid(input.projectId);
    const sourceChatId = requireUuid(input.sourceChatId);
    const sourceDocumentId = requireUuid(input.sourceDocumentId);
    const operationId = requireOperationId(input.operationId);
    requireMetadata(input.metadata);
    if (
      !Number.isSafeInteger(input.expectedProjectRevision) ||
      input.expectedProjectRevision < 1 ||
      !/^[0-9a-f]{64}$/u.test(input.sourceSha256) ||
      input.metadata.sha256 !== input.sourceSha256
    ) {
      return fail("invalid_request");
    }
    const expectedConsent: ImportConsentExpectation = {
      accepted: true,
      actorUserId,
      projectId,
      sourceChatId,
      sourceDocumentId,
      sourceSha256: input.sourceSha256,
    };
    const consent = validateConsentResult(
      await this.trustedPorts.verifyImportConsent(
        input.consentAcknowledgement,
        expectedConsent
      ),
      expectedConsent
    );
    const assetId = randomUUID();
    const versionId = randomUUID();
    const requestHash = hashProjectOperationRequest({
      actorUserId,
      projectId,
      operationType: "project_document_import_intent",
      originKind: "chat_document_import",
      sourceChatId,
      sourceDocumentId,
      sourceSha256: input.sourceSha256,
      sha256: input.metadata.sha256,
      byteSize: input.metadata.byteSize,
      canonicalMime: input.metadata.canonicalMime,
      formatId: input.metadata.formatId,
      consent: {
        accepted: consent.accepted,
        noticeVersion: consent.noticeVersion,
        acceptedAt: consent.acceptedAt,
      },
    });
    return this.createUserIntent({
      actorUserId,
      projectId,
      operationId,
      operationType: "project_document_import_intent",
      intentKind: "chat_document_import",
      expectedProjectRevision: input.expectedProjectRevision,
      metadata: input.metadata,
      assetId,
      versionId,
      requestHash,
      source: {
        sourceChatId,
        sourceDocumentId,
        sourceSha256: input.sourceSha256,
      },
      consent,
    });
  }

  private createUserIntent(input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    operationType:
      | "project_document_upload_intent"
      | "project_document_import_intent";
    intentKind: "direct_upload" | "chat_document_import";
    expectedProjectRevision: number;
    metadata: ValidatedProjectDocumentMetadata;
    assetId: string;
    versionId: string;
    requestHash: string;
    source?: {
      sourceChatId: string;
      sourceDocumentId: string;
      sourceSha256: string;
    };
    consent?: VerifiedSyntheticImportConsent;
  }): Promise<ProjectDocumentIntentOutcome> {
    return this.inTransaction(async (tx) => {
      const operation = await claimUserOperation(
        tx,
        {
          actorUserId: input.actorUserId,
          operationId: input.operationId,
          operationType: input.operationType,
          requestHash: input.requestHash,
          resultId: input.assetId,
          resultKind: "document_asset",
        },
        this.testHooks
      );
      if (operation.resultKind !== "document_asset") {
        return fail("integrity_conflict");
      }
      const project = await lockProject(tx, input.projectId);
      await assertUserProjectAuthority(tx, project, input.actorUserId);
      if (operation.replayed) {
        const [intent] = await tx
          .select()
          .from(projectDocumentIntent)
          .where(eq(projectDocumentIntent.operationRecordId, operation.id))
          .for("update")
          .limit(1);
        if (
          !intent ||
          intent.projectId !== input.projectId ||
          intent.assetId !== operation.resultId ||
          intent.intentKind !== input.intentKind
        ) {
          return fail("integrity_conflict");
        }
        const [asset] = await tx
          .select()
          .from(projectDocumentAsset)
          .where(eq(projectDocumentAsset.id, intent.assetId))
          .for("update")
          .limit(1);
        const [version] = await tx
          .select()
          .from(projectDocumentVersion)
          .where(eq(projectDocumentVersion.versionId, intent.versionId))
          .for("update")
          .limit(1);
        if (
          !asset ||
          !version ||
          asset.projectId !== input.projectId ||
          asset.lifecycle !== "active" ||
          version.projectId !== input.projectId ||
          version.assetId !== intent.assetId
        ) {
          return fail("integrity_conflict");
        }
        if (input.source) {
          await assertSourceChatDocumentOwned(tx, {
            actorUserId: input.actorUserId,
            ...input.source,
          });
          const [receipt] = await tx
            .select()
            .from(projectDocumentImportConsent)
            .where(
              eq(projectDocumentImportConsent.operationRecordId, operation.id)
            )
            .limit(1);
          if (
            !receipt ||
            !input.consent ||
            receipt.projectId !== input.projectId ||
            receipt.actorUserId !== input.actorUserId ||
            receipt.sourceChatId !== input.source.sourceChatId ||
            receipt.sourceDocumentId !== input.source.sourceDocumentId ||
            receipt.sourceSha256 !== input.source.sourceSha256 ||
            receipt.noticeVersion !== input.consent.noticeVersion ||
            receipt.acceptedAt.toISOString() !== input.consent.acceptedAt ||
            receipt.accepted !== true
          ) {
            return fail("integrity_conflict");
          }
        }
        const event = await assertOperationEvent(tx, {
          operationRecordId: operation.id,
          projectId: input.projectId,
          eventType: "project_document_intent_created",
          subjectKind: "document_asset",
          subjectId: intent.assetId,
          actorKind: "user",
          actorUserId: input.actorUserId,
          servicePrincipalCode: null,
        });
        return resultToIntentOutcome({
          operationId: input.operationId,
          operationType: input.operationType,
          intent,
          version,
          projectRevision: event.projectRevision,
          replayed: true,
        });
      }
      assertExpectedRevision(project, input.expectedProjectRevision);
      if (input.source) {
        await assertSourceChatDocumentOwned(tx, {
          actorUserId: input.actorUserId,
          ...input.source,
        });
        if (!input.consent) {
          return fail("consent_unverified");
        }
      }
      const createdAt = new Date();
      const storageKey = `project-document/${input.projectId}/${input.assetId}/${input.versionId}`;
      await tx.insert(projectDocumentAsset).values({
        id: input.assetId,
        projectId: input.projectId,
        createdByUserId: input.actorUserId,
        lifecycle: "active",
        createdAt,
      });
      await afterWrite(this.testHooks, "asset_created");
      await tx.insert(projectDocumentVersion).values({
        projectId: input.projectId,
        assetId: input.assetId,
        versionId: input.versionId,
        versionNumber: 1,
        storageKey,
        sha256: input.metadata.sha256,
        byteSize: input.metadata.byteSize,
        canonicalMime: input.metadata.canonicalMime,
        originKind:
          input.intentKind === "direct_upload"
            ? "direct_upload"
            : "explicit_chat_import",
        sourceChatId: input.source?.sourceChatId ?? null,
        sourceDocumentId: input.source?.sourceDocumentId ?? null,
        sourceSha256: input.source?.sourceSha256 ?? null,
        uploadedByUserId: input.actorUserId,
        createdAt,
        storageStatus: "pending",
        securityStatus: "pending",
        processingGeneration: 1,
      });
      await afterWrite(this.testHooks, "version_created");
      await tx.insert(projectDocumentIntent).values({
        operationRecordId: operation.id,
        projectId: input.projectId,
        assetId: input.assetId,
        versionId: input.versionId,
        intentKind: input.intentKind,
        status: "intent_created",
        generation: 1,
        errorCode: null,
        createdAt,
        updatedAt: createdAt,
      });
      await afterWrite(this.testHooks, "intent_created");
      if (input.source && input.consent) {
        await tx.insert(projectDocumentImportConsent).values({
          operationRecordId: operation.id,
          projectId: input.projectId,
          actorUserId: input.actorUserId,
          sourceChatId: input.source.sourceChatId,
          sourceDocumentId: input.source.sourceDocumentId,
          sourceSha256: input.source.sourceSha256,
          noticeVersion: input.consent.noticeVersion,
          acceptedAt: canonicalDate(input.consent.acceptedAt),
          accepted: true,
        });
        await afterWrite(this.testHooks, "consent_created");
      }
      const projectRevision = await reviseProjectAndAppendEvent(tx, {
        project,
        operationRecordId: operation.id,
        eventType: "project_document_intent_created",
        subjectKind: "document_asset",
        subjectId: input.assetId,
        actorKind: "user",
        actorUserId: input.actorUserId,
        servicePrincipalCode: null,
        hooks: this.testHooks,
      });
      const [intent] = await tx
        .select()
        .from(projectDocumentIntent)
        .where(eq(projectDocumentIntent.operationRecordId, operation.id));
      const [version] = await tx
        .select()
        .from(projectDocumentVersion)
        .where(eq(projectDocumentVersion.versionId, input.versionId));
      if (!intent || !version) {
        return fail("integrity_conflict");
      }
      return resultToIntentOutcome({
        operationId: input.operationId,
        operationType: input.operationType,
        intent,
        version,
        projectRevision,
        replayed: false,
      });
    });
  }

  async finalizeStorage(input: unknown): Promise<ProjectDocumentWorkerOutcome> {
    const result = validateStorageResult(
      await this.trustedPorts.verifyStorageResult(input)
    );
    const operationType =
      result.outcome === "stored"
        ? "project_document_storage_finalize"
        : "project_document_storage_fail";
    const servicePrincipalCode = "project_document_storage_worker" as const;
    const fingerprint = hashProjectOperationRequest({
      projectId: result.projectId,
      versionId: result.versionId,
      generation: result.generation,
      storageKey: result.storageKey,
      sha256: result.sha256,
      byteSize: result.byteSize,
      outcome: result.outcome,
      objectVersionId: result.objectVersionId ?? null,
      errorCode: result.errorCode ?? null,
    });
    const operationId = workerOperationId(
      result.versionId,
      result.generation,
      fingerprint
    );
    const requestHash = hashProjectOperationRequest({
      operationType,
      servicePrincipalCode,
      ...result,
      fingerprint,
    });
    return this.inTransaction(async (tx) => {
      const operation = await claimServiceOperation(
        tx,
        {
          servicePrincipalCode,
          operationId,
          operationType,
          requestHash,
          resultId: result.versionId,
          resultKind: "document_version",
        },
        this.testHooks
      );
      const project = await lockProject(tx, result.projectId);
      if (project.status !== "active") {
        return fail("project_closed");
      }
      const creatorUserId = await assertWorkerCreatorCurrentAuthority(
        tx,
        project,
        result.projectId,
        result.versionId
      );
      const [version] = await tx
        .select()
        .from(projectDocumentVersion)
        .where(
          and(
            eq(projectDocumentVersion.projectId, result.projectId),
            eq(projectDocumentVersion.versionId, result.versionId)
          )
        )
        .for("update")
        .limit(1);
      if (!version) {
        return fail("state_conflict");
      }
      const [asset] = await tx
        .select()
        .from(projectDocumentAsset)
        .where(
          and(
            eq(projectDocumentAsset.projectId, result.projectId),
            eq(projectDocumentAsset.id, version.assetId)
          )
        )
        .for("update")
        .limit(1);
      const [intent] = await tx
        .select()
        .from(projectDocumentIntent)
        .where(
          and(
            eq(projectDocumentIntent.projectId, result.projectId),
            eq(projectDocumentIntent.versionId, result.versionId)
          )
        )
        .for("update")
        .limit(1);
      if (
        !asset ||
        !intent ||
        asset.lifecycle !== "active" ||
        version.uploadedByUserId !== creatorUserId ||
        version.storageKey !== result.storageKey ||
        version.sha256 !== result.sha256 ||
        version.byteSize !== result.byteSize ||
        version.processingGeneration !== result.generation ||
        intent.generation !== result.generation
      ) {
        return fail("state_conflict");
      }
      await assertNoRevokedGrantForAsset(tx, result.projectId, asset.id);
      if (operation.replayed) {
        const expectedStorage = result.outcome;
        if (
          version.storageStatus !== expectedStorage ||
          intent.status !== expectedStorage ||
          (result.outcome === "stored" &&
            version.storageObjectVersionId !== result.objectVersionId) ||
          (result.outcome !== "stored" && intent.errorCode !== result.errorCode)
        ) {
          return fail("integrity_conflict");
        }
        const event = await assertOperationEvent(tx, {
          operationRecordId: operation.id,
          projectId: result.projectId,
          eventType: "project_document_storage_changed",
          subjectKind: "document_version",
          subjectId: result.versionId,
          actorKind: "service",
          actorUserId: null,
          servicePrincipalCode,
        });
        return {
          projectId: result.projectId,
          versionId: result.versionId,
          generation: result.generation,
          status: result.outcome,
          securityStatus: version.securityStatus,
          projectRevision: event.projectRevision,
          operationId,
          replayed: true,
        };
      }
      if (
        version.storageStatus !== "pending" ||
        version.securityStatus !== "pending" ||
        intent.status !== "intent_created"
      ) {
        return fail("state_conflict");
      }
      const now = new Date();
      const [updatedVersion] = await tx
        .update(projectDocumentVersion)
        .set(
          result.outcome === "stored"
            ? {
                storageStatus: "stored",
                storageObjectVersionId: result.objectVersionId,
                storageVerifiedAt: now,
              }
            : { storageStatus: result.outcome }
        )
        .where(
          and(
            eq(projectDocumentVersion.projectId, result.projectId),
            eq(projectDocumentVersion.versionId, result.versionId),
            eq(projectDocumentVersion.processingGeneration, result.generation),
            eq(projectDocumentVersion.storageStatus, "pending"),
            eq(projectDocumentVersion.securityStatus, "pending")
          )
        )
        .returning();
      if (!updatedVersion) {
        return fail("state_conflict");
      }
      await afterWrite(this.testHooks, "storage_version_updated");
      const [updatedIntent] = await tx
        .update(projectDocumentIntent)
        .set({
          status: result.outcome,
          errorCode: result.errorCode ?? null,
          updatedAt: now,
        })
        .where(
          and(
            eq(
              projectDocumentIntent.operationRecordId,
              intent.operationRecordId
            ),
            eq(projectDocumentIntent.generation, result.generation),
            eq(projectDocumentIntent.status, "intent_created")
          )
        )
        .returning();
      if (!updatedIntent) {
        return fail("state_conflict");
      }
      await afterWrite(this.testHooks, "intent_updated");
      const projectRevision = await reviseProjectAndAppendEvent(tx, {
        project,
        operationRecordId: operation.id,
        eventType: "project_document_storage_changed",
        subjectKind: "document_version",
        subjectId: result.versionId,
        actorKind: "service",
        actorUserId: null,
        servicePrincipalCode,
        hooks: this.testHooks,
      });
      return {
        projectId: result.projectId,
        versionId: result.versionId,
        generation: result.generation,
        status: result.outcome,
        securityStatus: updatedVersion.securityStatus,
        projectRevision,
        operationId,
        replayed: false,
      };
    });
  }

  async finalizeScan(input: unknown): Promise<ProjectDocumentWorkerOutcome> {
    const attestation = validateScanAttestation(
      await this.trustedPorts.verifyScanAttestation(input)
    );
    const servicePrincipalCode = "project_document_scan_worker" as const;
    const eventFingerprint = hashProjectOperationRequest(attestation);
    const operationId = workerOperationId(
      attestation.versionId,
      attestation.generation,
      eventFingerprint
    );
    const operationType = "project_document_scan_finalize" as const;
    const requestHash = hashProjectOperationRequest({
      operationType,
      servicePrincipalCode,
      attestation,
      eventFingerprint,
    });
    return this.inTransaction(async (tx) => {
      const operation = await claimServiceOperation(
        tx,
        {
          servicePrincipalCode,
          operationId,
          operationType,
          requestHash,
          resultId: randomUUID(),
          resultKind: "document_scan_run",
        },
        this.testHooks
      );
      const project = await lockProject(tx, attestation.projectId);
      if (project.status !== "active") {
        return fail("project_closed");
      }
      const creatorUserId = await assertWorkerCreatorCurrentAuthority(
        tx,
        project,
        attestation.projectId,
        attestation.versionId
      );
      const [version] = await tx
        .select()
        .from(projectDocumentVersion)
        .where(
          and(
            eq(projectDocumentVersion.projectId, attestation.projectId),
            eq(projectDocumentVersion.versionId, attestation.versionId)
          )
        )
        .for("update")
        .limit(1);
      if (!version) {
        return fail("state_conflict");
      }
      const [asset] = await tx
        .select()
        .from(projectDocumentAsset)
        .where(
          and(
            eq(projectDocumentAsset.projectId, attestation.projectId),
            eq(projectDocumentAsset.id, version.assetId)
          )
        )
        .for("update")
        .limit(1);
      if (
        !asset ||
        asset.lifecycle !== "active" ||
        version.uploadedByUserId !== creatorUserId ||
        version.processingGeneration !== attestation.generation ||
        version.storageStatus !== "stored" ||
        version.storageKey !== attestation.storageKey ||
        version.storageObjectVersionId !== attestation.storageObjectVersionId ||
        version.sha256 !== attestation.sha256 ||
        version.byteSize !== attestation.byteSize
      ) {
        return fail("state_conflict");
      }
      await assertNoRevokedGrantForAsset(tx, attestation.projectId, asset.id);
      if (operation.replayed) {
        const [run] = await tx
          .select()
          .from(projectDocumentProcessingRun)
          .where(
            and(
              eq(projectDocumentProcessingRun.projectId, attestation.projectId),
              eq(projectDocumentProcessingRun.versionId, attestation.versionId),
              eq(
                projectDocumentProcessingRun.generation,
                attestation.generation
              ),
              eq(projectDocumentProcessingRun.operationKind, "scan")
            )
          )
          .for("update")
          .limit(1);
        if (
          !run ||
          run.eventFingerprint !== eventFingerprint ||
          run.providerCode !== attestation.providerCode ||
          run.providerEventId !== attestation.providerEventId ||
          run.servicePrincipalCode !== servicePrincipalCode ||
          run.objectSha256 !== attestation.sha256
        ) {
          return fail("integrity_conflict");
        }
        const event = await assertOperationEvent(tx, {
          operationRecordId: operation.id,
          projectId: attestation.projectId,
          eventType: "project_document_security_changed",
          subjectKind: "document_scan_run",
          subjectId: run.id,
          actorKind: "service",
          actorUserId: null,
          servicePrincipalCode,
        });
        const securityStatus =
          attestation.result === "clean"
            ? "clean"
            : attestation.result === "rejected"
              ? "rejected"
              : "failed";
        if (version.securityStatus !== securityStatus) {
          return fail("integrity_conflict");
        }
        return {
          projectId: attestation.projectId,
          versionId: attestation.versionId,
          generation: attestation.generation,
          status: attestation.result,
          securityStatus,
          projectRevision: event.projectRevision,
          operationId,
          replayed: true,
        };
      }
      if (version.securityStatus !== "pending") {
        return fail("state_conflict");
      }
      const runId = operation.resultId;
      const startedAt = new Date();
      const completedAt = new Date(
        Math.max(
          startedAt.getTime(),
          canonicalDate(attestation.occurredAt).getTime()
        )
      );
      await tx.insert(projectDocumentProcessingRun).values({
        id: runId,
        projectId: attestation.projectId,
        versionId: attestation.versionId,
        generation: attestation.generation,
        operationKind: "scan",
        providerCode: attestation.providerCode,
        providerEventId: attestation.providerEventId,
        initiatedByUserId: null,
        servicePrincipalCode,
        objectSha256: attestation.sha256,
        eventFingerprint,
        status: "started",
        verdict: null,
        startedAt,
        completedAt: null,
        errorCode: null,
      });
      await afterWrite(this.testHooks, "scan_run_started");
      const status = attestation.result === "failed" ? "failed" : "completed";
      const verdict =
        attestation.result === "failed" ? null : attestation.result;
      const errorCode =
        attestation.result === "failed" ? "scanner_failed" : null;
      const [run] = await tx
        .update(projectDocumentProcessingRun)
        .set({ status, verdict, errorCode, completedAt })
        .where(
          and(
            eq(projectDocumentProcessingRun.id, runId),
            eq(projectDocumentProcessingRun.status, "started"),
            eq(projectDocumentProcessingRun.eventFingerprint, eventFingerprint)
          )
        )
        .returning();
      if (!run) {
        return fail("state_conflict");
      }
      const securityStatus =
        attestation.result === "clean"
          ? "clean"
          : attestation.result === "rejected"
            ? "rejected"
            : "failed";
      const [updatedVersion] = await tx
        .update(projectDocumentVersion)
        .set({ securityStatus })
        .where(
          and(
            eq(projectDocumentVersion.projectId, attestation.projectId),
            eq(projectDocumentVersion.versionId, attestation.versionId),
            eq(
              projectDocumentVersion.processingGeneration,
              attestation.generation
            ),
            eq(projectDocumentVersion.storageStatus, "stored"),
            eq(projectDocumentVersion.securityStatus, "pending"),
            eq(
              projectDocumentVersion.storageObjectVersionId,
              attestation.storageObjectVersionId
            ),
            eq(projectDocumentVersion.sha256, attestation.sha256),
            eq(projectDocumentVersion.byteSize, attestation.byteSize)
          )
        )
        .returning();
      if (!updatedVersion) {
        return fail("state_conflict");
      }
      await afterWrite(this.testHooks, "scan_run_completed");
      const projectRevision = await reviseProjectAndAppendEvent(tx, {
        project,
        operationRecordId: operation.id,
        eventType: "project_document_security_changed",
        subjectKind: "document_scan_run",
        subjectId: runId,
        actorKind: "service",
        actorUserId: null,
        servicePrincipalCode,
        hooks: this.testHooks,
      });
      return {
        projectId: attestation.projectId,
        versionId: attestation.versionId,
        generation: attestation.generation,
        status: attestation.result,
        securityStatus,
        projectRevision,
        operationId,
        replayed: false,
      };
    });
  }

  async createCreatorGrant(input: {
    actorUserId: string;
    projectId: string;
    assetId: string;
    versionId: string;
    operationId: string;
    expectedProjectRevision: number;
    purpose: string;
    acknowledgement: unknown;
  }): Promise<ProjectDocumentGrantOutcome> {
    const actorUserId = requireUuid(input.actorUserId);
    const projectId = requireUuid(input.projectId);
    const assetId = requireUuid(input.assetId);
    const versionId = requireUuid(input.versionId);
    const operationId = requireOperationId(input.operationId);
    const purpose = input.purpose;
    if (
      !isGrantPurpose(purpose) ||
      !Number.isSafeInteger(input.expectedProjectRevision) ||
      input.expectedProjectRevision < 1
    ) {
      return fail("invalid_request");
    }
    const expected: GrantConsentExpectation = {
      accepted: true,
      actorUserId,
      projectId,
      assetId,
      versionId,
      purpose,
    };
    const consent = validateGrantConsentResult(
      await this.trustedPorts.verifyGrantConsent(
        input.acknowledgement,
        expected
      ),
      expected
    );
    const grantId = randomUUID();
    const requestHash = hashProjectOperationRequest({
      operationType: "project_document_grant_create",
      actorUserId,
      projectId,
      assetId,
      versionId,
      purpose,
      consent: {
        accepted: consent.accepted,
        noticeVersion: consent.noticeVersion,
        acceptedAt: consent.acceptedAt,
      },
    });
    return this.inTransaction(async (tx) => {
      const operation = await claimUserOperation(
        tx,
        {
          actorUserId,
          operationId,
          operationType: "project_document_grant_create",
          requestHash,
          resultId: grantId,
          resultKind: "document_grant",
        },
        this.testHooks
      );
      if (operation.resultKind !== "document_grant") {
        return fail("integrity_conflict");
      }
      const project = await lockProject(tx, projectId);
      await assertUserProjectAuthority(tx, project, actorUserId);
      if (!operation.replayed) {
        assertExpectedRevision(project, input.expectedProjectRevision);
      }
      const [asset] = await tx
        .select()
        .from(projectDocumentAsset)
        .where(
          and(
            eq(projectDocumentAsset.projectId, projectId),
            eq(projectDocumentAsset.id, assetId)
          )
        )
        .for("update")
        .limit(1);
      const [version] = await tx
        .select()
        .from(projectDocumentVersion)
        .where(
          and(
            eq(projectDocumentVersion.projectId, projectId),
            eq(projectDocumentVersion.assetId, assetId),
            eq(projectDocumentVersion.versionId, versionId)
          )
        )
        .for("update")
        .limit(1);
      if (
        !asset ||
        !version ||
        asset.lifecycle !== "active" ||
        asset.createdByUserId !== actorUserId
      ) {
        return fail("project_forbidden");
      }
      if (
        (purpose === "content_read" || purpose === "download") &&
        (version.storageStatus !== "stored" ||
          version.securityStatus !== "clean")
      ) {
        return fail("state_conflict");
      }
      if (operation.replayed) {
        const [grant] = await tx
          .select()
          .from(projectDocumentGrant)
          .where(eq(projectDocumentGrant.id, operation.resultId))
          .for("update")
          .limit(1);
        if (
          !grant ||
          grant.projectId !== projectId ||
          grant.assetId !== assetId ||
          grant.versionId !== versionId ||
          grant.grantorUserId !== actorUserId ||
          grant.granteeKind !== "user" ||
          grant.granteeUserId !== actorUserId ||
          grant.purpose !== purpose
        ) {
          return fail("integrity_conflict");
        }
        const event = await assertOperationEvent(tx, {
          operationRecordId: operation.id,
          projectId,
          eventType: "project_document_grant_changed",
          subjectKind: "document_grant",
          subjectId: grant.id,
          actorKind: "user",
          actorUserId,
          servicePrincipalCode: null,
        });
        return {
          projectId,
          grantId: grant.id,
          assetId,
          versionId,
          purpose,
          revokedAt: grant.revokedAt?.toISOString() ?? null,
          revision: grant.revision,
          projectRevision: event.projectRevision,
          replayed: true,
        };
      }
      const createdAt = new Date();
      await tx.insert(projectDocumentGrant).values({
        id: grantId,
        projectId,
        assetId,
        versionId,
        grantorUserId: actorUserId,
        grantorAuthorityBasis: "asset_creator",
        granteeKind: "user",
        granteeUserId: actorUserId,
        purpose,
        createdAt,
        revokedAt: null,
        revision: 1,
      });
      await afterWrite(this.testHooks, "grant_created");
      const projectRevision = await reviseProjectAndAppendEvent(tx, {
        project,
        operationRecordId: operation.id,
        eventType: "project_document_grant_changed",
        subjectKind: "document_grant",
        subjectId: grantId,
        actorKind: "user",
        actorUserId,
        servicePrincipalCode: null,
        hooks: this.testHooks,
      });
      return {
        projectId,
        grantId,
        assetId,
        versionId,
        purpose,
        revokedAt: null,
        revision: 1,
        projectRevision,
        replayed: false,
      };
    });
  }

  revokeCreatorGrant(input: {
    actorUserId: string;
    projectId: string;
    grantId: string;
    operationId: string;
    expectedProjectRevision: number;
  }): Promise<ProjectDocumentGrantOutcome> {
    const actorUserId = requireUuid(input.actorUserId);
    const projectId = requireUuid(input.projectId);
    const grantId = requireUuid(input.grantId);
    const operationId = requireOperationId(input.operationId);
    if (
      !Number.isSafeInteger(input.expectedProjectRevision) ||
      input.expectedProjectRevision < 1
    ) {
      return fail("invalid_request");
    }
    const requestHash = hashProjectOperationRequest({
      operationType: "project_document_grant_revoke",
      actorUserId,
      projectId,
      grantId,
    });
    return this.inTransaction(async (tx) => {
      const operation = await claimUserOperation(
        tx,
        {
          actorUserId,
          operationId,
          operationType: "project_document_grant_revoke",
          requestHash,
          resultId: grantId,
          resultKind: "document_grant",
        },
        this.testHooks
      );
      if (
        operation.resultKind !== "document_grant" ||
        operation.resultId !== grantId
      ) {
        return fail("integrity_conflict");
      }
      const project = await lockProject(tx, projectId);
      await assertUserProjectAuthority(tx, project, actorUserId);
      if (!operation.replayed) {
        assertExpectedRevision(project, input.expectedProjectRevision);
      }
      const [grant] = await tx
        .select()
        .from(projectDocumentGrant)
        .where(
          and(
            eq(projectDocumentGrant.projectId, projectId),
            eq(projectDocumentGrant.id, grantId)
          )
        )
        .for("update")
        .limit(1);
      if (!grant) {
        return fail("state_conflict");
      }
      const purpose = grant.purpose;
      if (
        !isGrantPurpose(purpose) ||
        grant.granteeKind !== "user" ||
        grant.granteeUserId !== actorUserId ||
        grant.grantorUserId !== actorUserId
      ) {
        return fail("project_forbidden");
      }
      const [asset] = await tx
        .select()
        .from(projectDocumentAsset)
        .where(
          and(
            eq(projectDocumentAsset.projectId, projectId),
            eq(projectDocumentAsset.id, grant.assetId)
          )
        )
        .for("update")
        .limit(1);
      if (!asset || asset.createdByUserId !== actorUserId) {
        return fail("project_forbidden");
      }
      if (operation.replayed) {
        if (!grant.revokedAt) {
          return fail("integrity_conflict");
        }
        const event = await assertOperationEvent(tx, {
          operationRecordId: operation.id,
          projectId,
          eventType: "project_document_grant_changed",
          subjectKind: "document_grant",
          subjectId: grantId,
          actorKind: "user",
          actorUserId,
          servicePrincipalCode: null,
        });
        return {
          projectId,
          grantId,
          assetId: grant.assetId,
          versionId: grant.versionId,
          purpose,
          revokedAt: grant.revokedAt.toISOString(),
          revision: grant.revision,
          projectRevision: event.projectRevision,
          replayed: true,
        };
      }
      assertExpectedRevision(project, input.expectedProjectRevision);
      if (grant.revokedAt) {
        return fail("state_conflict");
      }
      const revokedAt = new Date();
      const [revoked] = await tx
        .update(projectDocumentGrant)
        .set({ revokedAt, revision: grant.revision + 1 })
        .where(
          and(
            eq(projectDocumentGrant.projectId, projectId),
            eq(projectDocumentGrant.id, grantId),
            isNull(projectDocumentGrant.revokedAt),
            eq(projectDocumentGrant.revision, grant.revision)
          )
        )
        .returning();
      if (!revoked) {
        return fail("state_conflict");
      }
      await afterWrite(this.testHooks, "grant_revoked");
      const projectRevision = await reviseProjectAndAppendEvent(tx, {
        project,
        operationRecordId: operation.id,
        eventType: "project_document_grant_changed",
        subjectKind: "document_grant",
        subjectId: grantId,
        actorKind: "user",
        actorUserId,
        servicePrincipalCode: null,
        hooks: this.testHooks,
      });
      return {
        projectId,
        grantId,
        assetId: revoked.assetId,
        versionId: revoked.versionId,
        purpose,
        revokedAt: revokedAt.toISOString(),
        revision: revoked.revision,
        projectRevision,
        replayed: false,
      };
    });
  }

  withdrawDocument(input: {
    actorUserId: string;
    projectId: string;
    assetId: string;
    operationId: string;
    expectedProjectRevision: number;
  }): Promise<{
    projectId: string;
    assetId: string;
    lifecycle: "withdrawn";
    projectRevision: number;
    replayed: boolean;
  }> {
    const actorUserId = requireUuid(input.actorUserId);
    const projectId = requireUuid(input.projectId);
    const assetId = requireUuid(input.assetId);
    const operationId = requireOperationId(input.operationId);
    if (
      !Number.isSafeInteger(input.expectedProjectRevision) ||
      input.expectedProjectRevision < 1
    ) {
      return fail("invalid_request");
    }
    const requestHash = hashProjectOperationRequest({
      operationType: "project_document_withdraw",
      actorUserId,
      projectId,
      assetId,
    });
    return this.inTransaction(async (tx) => {
      const operation = await claimUserOperation(
        tx,
        {
          actorUserId,
          operationId,
          operationType: "project_document_withdraw",
          requestHash,
          resultId: assetId,
          resultKind: "document_asset",
        },
        this.testHooks
      );
      if (
        operation.resultKind !== "document_asset" ||
        operation.resultId !== assetId
      ) {
        return fail("integrity_conflict");
      }
      const project = await lockProject(tx, projectId);
      await assertUserProjectAuthority(tx, project, actorUserId);
      if (!operation.replayed) {
        assertExpectedRevision(project, input.expectedProjectRevision);
      }
      const [asset] = await tx
        .select()
        .from(projectDocumentAsset)
        .where(
          and(
            eq(projectDocumentAsset.projectId, projectId),
            eq(projectDocumentAsset.id, assetId)
          )
        )
        .for("update")
        .limit(1);
      if (!asset || asset.createdByUserId !== actorUserId) {
        return fail("project_forbidden");
      }
      if (operation.replayed) {
        if (asset.lifecycle !== "withdrawn") {
          return fail("integrity_conflict");
        }
        const event = await assertOperationEvent(tx, {
          operationRecordId: operation.id,
          projectId,
          eventType: "project_document_withdrawn",
          subjectKind: "document_asset",
          subjectId: assetId,
          actorKind: "user",
          actorUserId,
          servicePrincipalCode: null,
        });
        return {
          projectId,
          assetId,
          lifecycle: "withdrawn",
          projectRevision: event.projectRevision,
          replayed: true,
        };
      }
      if (asset.lifecycle !== "active") {
        return fail("state_conflict");
      }
      const [withdrawn] = await tx
        .update(projectDocumentAsset)
        .set({ lifecycle: "withdrawn" })
        .where(
          and(
            eq(projectDocumentAsset.projectId, projectId),
            eq(projectDocumentAsset.id, assetId),
            eq(projectDocumentAsset.lifecycle, "active")
          )
        )
        .returning();
      if (!withdrawn) {
        return fail("state_conflict");
      }
      await afterWrite(this.testHooks, "asset_withdrawn");
      const projectRevision = await reviseProjectAndAppendEvent(tx, {
        project,
        operationRecordId: operation.id,
        eventType: "project_document_withdrawn",
        subjectKind: "document_asset",
        subjectId: assetId,
        actorKind: "user",
        actorUserId,
        servicePrincipalCode: null,
        hooks: this.testHooks,
      });
      return {
        projectId,
        assetId,
        lifecycle: "withdrawn",
        projectRevision,
        replayed: false,
      };
    });
  }

  listGrantedMetadata(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<ProjectDocumentPostgresMetadata[]> {
    const actorUserId = requireUuid(input.actorUserId);
    const projectId = requireUuid(input.projectId);
    return this.inTransaction(async (tx) => {
      const project = await lockProject(tx, projectId);
      await assertUserProjectAuthority(tx, project, actorUserId);
      const rows = await tx
        .select({
          projectId: projectDocumentAsset.projectId,
          assetId: projectDocumentAsset.id,
          versionId: projectDocumentVersion.versionId,
          versionNumber: projectDocumentVersion.versionNumber,
          lifecycle: projectDocumentAsset.lifecycle,
          canonicalMime: projectDocumentVersion.canonicalMime,
          byteSize: projectDocumentVersion.byteSize,
          sha256: projectDocumentVersion.sha256,
          originKind: projectDocumentVersion.originKind,
          storageStatus: projectDocumentVersion.storageStatus,
          securityStatus: projectDocumentVersion.securityStatus,
        })
        .from(projectDocumentGrant)
        .innerJoin(
          projectDocumentAsset,
          and(
            eq(projectDocumentAsset.projectId, projectDocumentGrant.projectId),
            eq(projectDocumentAsset.id, projectDocumentGrant.assetId)
          )
        )
        .innerJoin(
          projectDocumentVersion,
          and(
            eq(
              projectDocumentVersion.projectId,
              projectDocumentGrant.projectId
            ),
            eq(projectDocumentVersion.assetId, projectDocumentGrant.assetId),
            eq(projectDocumentVersion.versionId, projectDocumentGrant.versionId)
          )
        )
        .where(
          and(
            eq(projectDocumentGrant.projectId, projectId),
            eq(projectDocumentGrant.granteeKind, "user"),
            eq(projectDocumentGrant.granteeUserId, actorUserId),
            eq(projectDocumentGrant.purpose, "metadata_read"),
            isNull(projectDocumentGrant.revokedAt),
            eq(projectDocumentAsset.lifecycle, "active")
          )
        );
      return rows;
    });
  }

  authorizeExactVersionRead(input: {
    actorUserId: string;
    projectId: string;
    assetId: string;
    versionId: string;
    purpose: "content_read" | "download";
  }): Promise<{
    projectId: string;
    assetId: string;
    versionId: string;
    purpose: "content_read" | "download";
  }> {
    const actorUserId = requireUuid(input.actorUserId);
    const projectId = requireUuid(input.projectId);
    const assetId = requireUuid(input.assetId);
    const versionId = requireUuid(input.versionId);
    return this.inTransaction(async (tx) => {
      const project = await lockProject(tx, projectId);
      await assertUserProjectAuthority(tx, project, actorUserId);
      const [pair] = await tx
        .select({
          assetId: projectDocumentAsset.id,
          versionId: projectDocumentVersion.versionId,
          lifecycle: projectDocumentAsset.lifecycle,
          storageStatus: projectDocumentVersion.storageStatus,
          securityStatus: projectDocumentVersion.securityStatus,
          storageObjectVersionId: projectDocumentVersion.storageObjectVersionId,
          storageVerifiedAt: projectDocumentVersion.storageVerifiedAt,
        })
        .from(projectDocumentAsset)
        .innerJoin(
          projectDocumentVersion,
          and(
            eq(
              projectDocumentVersion.projectId,
              projectDocumentAsset.projectId
            ),
            eq(projectDocumentVersion.assetId, projectDocumentAsset.id)
          )
        )
        .innerJoin(
          projectDocumentGrant,
          and(
            eq(
              projectDocumentGrant.projectId,
              projectDocumentVersion.projectId
            ),
            eq(projectDocumentGrant.assetId, projectDocumentVersion.assetId),
            eq(projectDocumentGrant.versionId, projectDocumentVersion.versionId)
          )
        )
        .innerJoin(
          projectDocumentProcessingRun,
          and(
            eq(projectDocumentProcessingRun.projectId, projectId),
            eq(projectDocumentProcessingRun.versionId, versionId),
            eq(
              projectDocumentProcessingRun.generation,
              projectDocumentVersion.processingGeneration
            ),
            eq(projectDocumentProcessingRun.operationKind, "scan"),
            eq(
              projectDocumentProcessingRun.objectSha256,
              projectDocumentVersion.sha256
            ),
            eq(projectDocumentProcessingRun.status, "completed"),
            eq(projectDocumentProcessingRun.verdict, "clean"),
            isNotNull(projectDocumentProcessingRun.eventFingerprint),
            isNull(projectDocumentProcessingRun.initiatedByUserId),
            eq(
              projectDocumentProcessingRun.servicePrincipalCode,
              "project_document_scan_worker"
            )
          )
        )
        .innerJoin(
          projectOperation,
          and(
            eq(
              projectOperation.operationType,
              "project_document_scan_finalize"
            ),
            eq(projectOperation.resultKind, "document_scan_run"),
            eq(projectOperation.resultId, projectDocumentProcessingRun.id),
            eq(projectOperation.actorKind, "service"),
            isNull(projectOperation.actorUserId),
            eq(
              projectOperation.servicePrincipalCode,
              "project_document_scan_worker"
            )
          )
        )
        .innerJoin(
          projectEvent,
          and(
            eq(projectEvent.operationRecordId, projectOperation.id),
            eq(projectEvent.projectId, projectId),
            eq(projectEvent.eventType, "project_document_security_changed"),
            eq(projectEvent.subjectKind, "document_scan_run"),
            eq(projectEvent.subjectId, projectDocumentProcessingRun.id),
            eq(projectEvent.actorKind, "service"),
            isNull(projectEvent.actorUserId),
            eq(
              projectEvent.servicePrincipalCode,
              "project_document_scan_worker"
            )
          )
        )
        .where(
          and(
            eq(projectDocumentAsset.projectId, projectId),
            eq(projectDocumentAsset.id, assetId),
            eq(projectDocumentVersion.versionId, versionId),
            eq(projectDocumentGrant.granteeKind, "user"),
            eq(projectDocumentGrant.granteeUserId, actorUserId),
            eq(projectDocumentGrant.purpose, input.purpose),
            isNull(projectDocumentGrant.revokedAt),
            isNotNull(projectDocumentVersion.storageObjectVersionId),
            isNotNull(projectDocumentVersion.storageVerifiedAt)
          )
        )
        .for("update")
        .limit(1);
      if (
        !pair ||
        pair.lifecycle !== "active" ||
        pair.storageStatus !== "stored" ||
        !pair.storageObjectVersionId ||
        !pair.storageVerifiedAt ||
        pair.securityStatus !== "clean"
      ) {
        return fail("project_forbidden");
      }
      return { projectId, assetId, versionId, purpose: input.purpose };
    });
  }
}
