import "server-only";

import { createHash } from "node:crypto";
import type { ProjectDocumentObjectIdentity } from "../types";
import {
  isProjectDocumentAwsAdapterEnabled,
  validateProjectDocumentAwsIdentityConfig,
} from "./config";
import {
  isTrustedScanDeliveryContextForBody,
  type TrustedScanDeliveryContext,
} from "./delivery-context";
import { ProjectDocumentAwsError } from "./errors";
import {
  type ProjectDocumentGuardDutyConfig,
  parseUntrustedGuardDutyScanEvent,
  type UntrustedGuardDutyScanEvent,
} from "./guardduty";
import type { ProjectDocumentS3ObjectStore } from "./s3-object-store";

export type PersistedProjectDocumentScanTarget = {
  projectId: string;
  assetId: string;
  versionId: string;
  generation: number;
  currentGeneration: number;
  storageKey: string;
  storageObjectVersionId: string | null;
  sha256: string;
  byteSize: number;
  objectIdentity: ProjectDocumentObjectIdentity | null;
  storageStatus: string;
  storageVerifiedAt: string | null;
  securityStatus: string;
  assetLifecycle: string;
  projectLifecycle: string;
};

export interface ProjectDocumentScanTargetLookup {
  findByExactObjectIdentity(input: {
    bucket: string;
    objectKey: string;
    objectVersionId: string;
  }): Promise<PersistedProjectDocumentScanTarget | null>;
}

export interface ScanEventFingerprintRegistry {
  observe(input: {
    eventId: string;
    fingerprint: string;
  }): Promise<"new" | "duplicate" | "conflict">;
}

export type ProjectDocumentScanCandidate = {
  readonly trust: "untrusted_scan_candidate";
  readonly verdict: "clean" | "rejected";
  readonly eventId: string;
  readonly eventFingerprint: string;
  readonly replay: "new" | "duplicate";
  readonly projectId: string;
  readonly assetId: string;
  readonly versionId: string;
  readonly generation: number;
  readonly objectIdentity: ProjectDocumentObjectIdentity;
};

export type ScanEventFreshnessPolicy = {
  maxAgeMs: number;
  maxFutureSkewMs: number;
  now: () => number;
};

function isValidFreshnessPolicy(
  policy: unknown
): policy is ScanEventFreshnessPolicy {
  if (typeof policy !== "object" || policy === null) {
    return false;
  }
  const candidate = policy as Record<string, unknown>;
  return (
    Number.isSafeInteger(candidate.maxAgeMs) &&
    (candidate.maxAgeMs as number) > 0 &&
    Number.isSafeInteger(candidate.maxFutureSkewMs) &&
    (candidate.maxFutureSkewMs as number) >= 0 &&
    typeof candidate.now === "function"
  );
}

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameIdentity(
  left: ProjectDocumentObjectIdentity,
  right: ProjectDocumentObjectIdentity
) {
  return (
    left.key === right.key &&
    left.objectVersionId === right.objectVersionId &&
    left.sha256 === right.sha256 &&
    left.byteSize === right.byteSize
  );
}

function assertTargetIsCurrent(
  event: UntrustedGuardDutyScanEvent,
  target: PersistedProjectDocumentScanTarget
): ProjectDocumentObjectIdentity {
  const identity = target.objectIdentity;
  const expectedStorageKey = `project-document/${target.projectId}/${target.assetId}/${target.versionId}`;
  if (
    target.storageKey !== event.objectKey ||
    target.storageKey !== expectedStorageKey ||
    !identity ||
    identity.key !== event.objectKey ||
    identity.objectVersionId !== event.objectVersionId ||
    target.storageObjectVersionId !== event.objectVersionId ||
    identity.sha256 !== target.sha256 ||
    identity.byteSize !== target.byteSize
  ) {
    throw new ProjectDocumentAwsError("scan_identity_mismatch");
  }
  if (
    target.storageStatus !== "stored" ||
    typeof target.storageVerifiedAt !== "string" ||
    !Number.isFinite(Date.parse(target.storageVerifiedAt)) ||
    target.securityStatus !== "pending"
  ) {
    throw new ProjectDocumentAwsError("scan_target_not_active");
  }
  if (
    target.assetLifecycle !== "active" ||
    target.projectLifecycle !== "active" ||
    target.currentGeneration !== target.generation
  ) {
    throw new ProjectDocumentAwsError("scan_target_stale");
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      target.projectId
    ) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      target.assetId
    ) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      target.versionId
    ) ||
    !Number.isSafeInteger(target.generation) ||
    target.generation < 1 ||
    !Number.isSafeInteger(target.currentGeneration) ||
    !/^[0-9a-f]{64}$/u.test(target.sha256) ||
    !Number.isSafeInteger(target.byteSize) ||
    target.byteSize < 1
  ) {
    throw new ProjectDocumentAwsError("scan_identity_mismatch");
  }
  return identity;
}

function validatePlanArn(config: ProjectDocumentGuardDutyConfig) {
  if (
    typeof config.protectionPlanArn !== "string" ||
    typeof config.region !== "string" ||
    typeof config.accountId !== "string"
  ) {
    throw new ProjectDocumentAwsError("invalid_configuration");
  }
  const escapedRegion = config.region.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const escapedAccount = config.accountId.replace(
    /[.*+?^${}()|[\]\\]/gu,
    "\\$&"
  );
  const pattern = new RegExp(
    `^arn:(?:aws|aws-us-gov|aws-cn):guardduty:${escapedRegion}:${escapedAccount}:malware-protection-plan/[A-Za-z0-9-]+$`,
    "u"
  );
  if (!pattern.test(config.protectionPlanArn)) {
    throw new ProjectDocumentAwsError("invalid_configuration");
  }
}

/**
 * Correlates authenticated scan delivery to a current persisted exact version.
 * The output is evidence for review only; this module never mints an A1.1
 * VerifiedProjectDocumentScanAttestation or calls finalizeScan().
 */
export function createProjectDocumentScanCandidateVerifier(input: {
  config: ProjectDocumentGuardDutyConfig;
  objectStore: Pick<ProjectDocumentS3ObjectStore, "readVersion">;
  targets: ProjectDocumentScanTargetLookup;
  replayRegistry: ScanEventFingerprintRegistry;
  freshness: ScanEventFreshnessPolicy;
  env?: Readonly<Record<string, string | undefined>>;
}) {
  if (!isProjectDocumentAwsAdapterEnabled(input.env)) {
    throw new ProjectDocumentAwsError("adapter_disabled");
  }
  const identityConfig = validateProjectDocumentAwsIdentityConfig(input.config);
  const config = Object.freeze({
    ...identityConfig,
    protectionPlanArn: input.config.protectionPlanArn,
  });
  validatePlanArn(config);
  if (!isValidFreshnessPolicy(input.freshness)) {
    throw new ProjectDocumentAwsError("invalid_configuration");
  }
  const freshness = Object.freeze({ ...input.freshness });

  return async function verifyCandidate(inputEvent: {
    rawBody: string | Uint8Array;
    deliveryContext?: TrustedScanDeliveryContext | unknown;
  }): Promise<ProjectDocumentScanCandidate> {
    if (
      !isTrustedScanDeliveryContextForBody(
        inputEvent.deliveryContext,
        inputEvent.rawBody
      )
    ) {
      throw new ProjectDocumentAwsError("delivery_context_required");
    }

    const event = parseUntrustedGuardDutyScanEvent(inputEvent.rawBody, config);
    if (event.candidateVerdict === "unavailable") {
      throw new ProjectDocumentAwsError("scan_not_completed");
    }
    const now = freshness.now();
    const occurredAt = Date.parse(event.occurredAt);
    if (
      !Number.isFinite(now) ||
      occurredAt > now + freshness.maxFutureSkewMs ||
      now - occurredAt > freshness.maxAgeMs
    ) {
      throw new ProjectDocumentAwsError("stale_event");
    }

    const target = await input.targets.findByExactObjectIdentity({
      bucket: config.bucket,
      objectKey: event.objectKey,
      objectVersionId: event.objectVersionId,
    });
    if (!target) {
      throw new ProjectDocumentAwsError("scan_target_not_found");
    }
    const persistedIdentity = assertTargetIsCurrent(event, target);
    const objectRead = await input.objectStore.readVersion({
      key: persistedIdentity.key,
      objectVersionId: persistedIdentity.objectVersionId,
      expectedSha256: persistedIdentity.sha256,
      expectedByteSize: persistedIdentity.byteSize,
    });
    if (
      !objectRead ||
      !objectRead.identity ||
      !(objectRead.bytes instanceof Uint8Array) ||
      !sameIdentity(objectRead.identity, persistedIdentity) ||
      objectRead.bytes.byteLength !== persistedIdentity.byteSize ||
      digest(objectRead.bytes) !== persistedIdentity.sha256
    ) {
      throw new ProjectDocumentAwsError("scan_identity_mismatch");
    }

    const replay = await input.replayRegistry.observe({
      eventId: event.eventId,
      fingerprint: event.fingerprint,
    });
    if (replay === "conflict") {
      throw new ProjectDocumentAwsError("event_replay_conflict");
    }
    if (replay !== "new" && replay !== "duplicate") {
      throw new ProjectDocumentAwsError("event_replay_conflict");
    }
    return Object.freeze({
      trust: "untrusted_scan_candidate" as const,
      verdict: event.candidateVerdict,
      eventId: event.eventId,
      eventFingerprint: event.fingerprint,
      replay,
      projectId: target.projectId,
      assetId: target.assetId,
      versionId: target.versionId,
      generation: target.generation,
      objectIdentity: { ...persistedIdentity },
    });
  };
}
