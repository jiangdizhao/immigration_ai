import "server-only";

import {
  ProjectDocumentPersistenceError,
  type ProjectDocumentWorkerOutcome,
} from "../../postgres-repository";
import {
  authenticateScanDeliveryContext,
  type ScanDeliveryAuthenticatorPort,
} from "../delivery-context";
import { ProjectDocumentAwsError } from "../errors";
import type { ProjectDocumentGuardDutyConfig } from "../guardduty";
import type { ProjectDocumentS3ObjectStore } from "../s3-object-store";
import {
  createProjectDocumentScanCandidateVerifier,
  type PersistedProjectDocumentScanTarget,
  type ProjectDocumentScanCandidate,
  type ProjectDocumentScanTargetLookup,
  type ScanEventFingerprintRegistry,
} from "../scan-candidate";
import {
  planQueueMessageDisposition,
  type QueueMessageDisposition,
} from "../security-readiness/queue-disposition";

export type B3QueueMessage = {
  body: string | Uint8Array;
  receiptHandle: string;
  approximateReceiveCount: number;
  /** Independently populated by the injected queue transport, never parsed from body. */
  transportContext: unknown;
};

export interface B3ScanQueueTransport {
  receive(input: {
    maxMessages: number;
    waitTimeSeconds: number;
    signal: AbortSignal;
  }): Promise<unknown>;
  acknowledge(input: {
    receiptHandle: string;
    signal: AbortSignal;
  }): Promise<void>;
}

export interface B3ScanAttestationIssuer {
  /** Server-held capability. Production issuance is intentionally not implemented here. */
  issue(input: ProjectDocumentScanCandidate): Promise<unknown>;
}

export interface B3ScanFinalizer {
  finalizeScan(input: unknown): Promise<ProjectDocumentWorkerOutcome>;
}

export type B3WorkerMessageResult = {
  disposition: QueueMessageDisposition["action"];
  outcome:
    | "committed"
    | "identical_replay"
    | "rejected"
    | "retryable_failure"
    | "unauthenticated"
    | "quarantined";
  errorCode?: string;
};

export type B3WorkerBatchResult = {
  received: number;
  messages: B3WorkerMessageResult[];
};

const MAX_BATCH_SIZE = 10;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_RECEIVE_COUNT = 1000;
const SAFE_ERROR_CODES = new Set([
  "adapter_disabled",
  "delivery_context_required",
  "delivery_untrusted",
  "event_too_large",
  "malformed_event",
  "invalid_event_shape",
  "unsupported_event_type",
  "event_identity_mismatch",
  "invalid_scan_status",
  "invalid_object_key_in_event",
  "invalid_scan_result_pair",
  "scan_not_completed",
  "scan_target_not_found",
  "scan_identity_mismatch",
  "scan_target_not_active",
  "scan_target_stale",
  "stale_event",
  "event_replay_conflict",
  "event_already_processed",
  "project_closed",
  "project_forbidden",
  "source_not_owned",
  "state_conflict",
  "integrity_conflict",
  "idempotency_conflict",
  "worker_untrusted",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMessage(value: unknown): value is B3QueueMessage {
  if (!isRecord(value)) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    const keys = Reflect.ownKeys(value);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      keys.length !== 4 ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          ![
            "body",
            "receiptHandle",
            "approximateReceiveCount",
            "transportContext",
          ].includes(key)
      ) ||
      keys.some((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return !descriptor || !Object.hasOwn(descriptor, "value");
      })
    ) {
      return false;
    }
  } catch {
    return false;
  }
  return (
    (typeof value.body === "string" || value.body instanceof Uint8Array) &&
    (typeof value.body === "string"
      ? Buffer.byteLength(value.body, "utf8")
      : value.body.byteLength) <= MAX_BODY_BYTES &&
    typeof value.receiptHandle === "string" &&
    value.receiptHandle.length > 0 &&
    value.receiptHandle.length <= 2048 &&
    Number.isSafeInteger(value.approximateReceiveCount) &&
    typeof value.approximateReceiveCount === "number" &&
    value.approximateReceiveCount >= 1 &&
    value.approximateReceiveCount <= MAX_RECEIVE_COUNT &&
    Object.hasOwn(value, "transportContext")
  );
}

function safeErrorCode(error: unknown): string | undefined {
  if (!isRecord(error) || typeof error.code !== "string") {
    return undefined;
  }
  if (SAFE_ERROR_CODES.has(error.code)) {
    return error.code;
  }
  return undefined;
}

const WORKER_OUTCOME_FIELDS = [
  "projectId",
  "versionId",
  "generation",
  "status",
  "securityStatus",
  "projectRevision",
  "operationId",
  "replayed",
] as const;

function isCommittedOutcomeForCandidate(
  value: unknown,
  candidate: ProjectDocumentScanCandidate
): value is ProjectDocumentWorkerOutcome {
  if (!isRecord(value)) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    const keys = Reflect.ownKeys(value);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      keys.length !== WORKER_OUTCOME_FIELDS.length ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          !WORKER_OUTCOME_FIELDS.includes(
            key as (typeof WORKER_OUTCOME_FIELDS)[number]
          )
      )
    ) {
      return false;
    }
    const fields: Record<string, unknown> = {};
    for (const field of WORKER_OUTCOME_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) {
        return false;
      }
      fields[field] = descriptor.value;
    }
    return (
      (candidate.verdict === "clean" || candidate.verdict === "rejected") &&
      fields.projectId === candidate.projectId &&
      fields.versionId === candidate.versionId &&
      fields.generation === candidate.generation &&
      fields.status === candidate.verdict &&
      fields.securityStatus === candidate.verdict &&
      Number.isSafeInteger(fields.projectRevision) &&
      typeof fields.projectRevision === "number" &&
      fields.projectRevision >= 1 &&
      typeof fields.operationId === "string" &&
      fields.operationId.trim().length > 0 &&
      fields.operationId.length <= 128 &&
      typeof fields.replayed === "boolean"
    );
  } catch {
    return false;
  }
}

function disposition(input: {
  body: unknown;
  context: unknown;
  message: string;
  persistence: string;
  ack: string;
  attempt: number;
  maximumAttempts: number;
}) {
  return planQueueMessageDisposition({
    rawBody: input.body,
    deliveryContext: input.context,
    message: input.message,
    persistenceAssertion: input.persistence,
    acknowledgement: input.ack,
    attempt: input.attempt,
    maximumAttempts: input.maximumAttempts,
  });
}

function bounded<T>(
  operation: () => Promise<T>,
  deadlineAt: number,
  now: () => number,
  signal: AbortSignal
): Promise<T> {
  const remaining = deadlineAt - now();
  if (signal.aborted || remaining <= 0) {
    return Promise.reject(new ProjectDocumentAwsError("storage_unavailable"));
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  const operationResult = operation();
  return Promise.race([
    operationResult,
    new Promise<T>((_resolve, reject) => {
      abortHandler = () =>
        reject(new ProjectDocumentAwsError("storage_unavailable"));
      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener("abort", abortHandler, { once: true });
      }
    }),
    new Promise<T>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new ProjectDocumentAwsError("storage_unavailable")),
        remaining
      );
    }),
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
    if (abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
  });
}

/**
 * One bounded, sequential SQS receive/dispatch pass. All network capabilities
 * are injected. The default path is disabled and no AWS client is constructed.
 */
export function createB3ScanQueueWorker(input: {
  enabled: boolean;
  transport: B3ScanQueueTransport;
  authenticator: ScanDeliveryAuthenticatorPort;
  candidateVerifier: (input: {
    rawBody: string | Uint8Array;
    deliveryContext?: unknown;
  }) => Promise<ProjectDocumentScanCandidate>;
  attestationIssuer: B3ScanAttestationIssuer;
  finalizer: B3ScanFinalizer;
  maxMessages: number;
  maxAttempts: number;
  waitTimeSeconds: number;
  maxExecutionMs: number;
  now?: () => number;
}) {
  if (
    input.enabled !== true ||
    !Number.isSafeInteger(input.maxMessages) ||
    input.maxMessages < 1 ||
    input.maxMessages > MAX_BATCH_SIZE ||
    !Number.isSafeInteger(input.maxAttempts) ||
    input.maxAttempts < 1 ||
    input.maxAttempts > MAX_RECEIVE_COUNT ||
    !Number.isSafeInteger(input.waitTimeSeconds) ||
    input.waitTimeSeconds < 0 ||
    input.waitTimeSeconds > 20 ||
    !Number.isSafeInteger(input.maxExecutionMs) ||
    input.maxExecutionMs < 100 ||
    input.maxExecutionMs > 120_000
  ) {
    throw new ProjectDocumentAwsError("adapter_disabled");
  }

  return {
    async runOnce(signal: AbortSignal): Promise<B3WorkerBatchResult> {
      if (signal.aborted) {
        throw new ProjectDocumentAwsError("storage_unavailable");
      }
      const now = input.now ?? Date.now;
      const deadlineAt = now() + input.maxExecutionMs;
      const received = await bounded(
        () =>
          input.transport.receive({
            maxMessages: input.maxMessages,
            waitTimeSeconds: input.waitTimeSeconds,
            signal,
          }),
        deadlineAt,
        now,
        signal
      );
      if (!Array.isArray(received) || received.length > input.maxMessages) {
        throw new ProjectDocumentAwsError("invalid_s3_response");
      }
      const messages: B3WorkerMessageResult[] = [];
      for (const rawMessage of received) {
        if (!isMessage(rawMessage)) {
          messages.push({
            disposition: "quarantine_or_dlq",
            outcome: "quarantined",
            errorCode: "invalid_queue_message",
          });
          continue;
        }
        const message = rawMessage;
        let context: object | undefined;
        try {
          context = await bounded(
            () =>
              authenticateScanDeliveryContext({
                rawBody: message.body,
                transportContext: message.transportContext,
                authenticator: input.authenticator,
              }),
            deadlineAt,
            now,
            signal
          );
        } catch (error) {
          const planned = disposition({
            body: message.body,
            context: undefined,
            message: "forged_or_cross_account",
            persistence: "not_attempted",
            ack: "not_attempted",
            attempt: message.approximateReceiveCount,
            maximumAttempts: input.maxAttempts,
          });
          messages.push({
            disposition: planned.action,
            outcome: "unauthenticated",
            ...(safeErrorCode(error)
              ? { errorCode: safeErrorCode(error) }
              : {}),
          });
          continue;
        }

        let candidate: ProjectDocumentScanCandidate;
        try {
          candidate = await bounded(
            () =>
              input.candidateVerifier({
                rawBody: message.body,
                deliveryContext: context,
              }),
            deadlineAt,
            now,
            signal
          );
        } catch (error) {
          const code = safeErrorCode(error);
          const security = [
            "malformed_event",
            "invalid_event_shape",
            "unsupported_event_type",
            "event_identity_mismatch",
            "invalid_scan_result_pair",
            "invalid_object_key_in_event",
            "stale_event",
            "scan_target_not_found",
            "scan_target_not_active",
            "scan_target_stale",
            "event_replay_conflict",
            "scan_identity_mismatch",
          ].includes(code ?? "");
          const planned = disposition({
            body: message.body,
            context,
            message: security ? "conflicting_duplicate" : "transient_failure",
            persistence: "not_attempted",
            ack: "not_attempted",
            attempt: message.approximateReceiveCount,
            maximumAttempts: input.maxAttempts,
          });
          messages.push({
            disposition: planned.action,
            outcome: security ? "quarantined" : "retryable_failure",
            ...(code ? { errorCode: code } : {}),
          });
          continue;
        }

        let committed: ProjectDocumentWorkerOutcome;
        try {
          const issued = await bounded(
            () => input.attestationIssuer.issue(candidate),
            deadlineAt,
            now,
            signal
          );
          committed = await bounded(
            () => input.finalizer.finalizeScan(issued),
            deadlineAt,
            now,
            signal
          );
        } catch (error) {
          const code = safeErrorCode(error);
          const conflict =
            error instanceof ProjectDocumentPersistenceError &&
            [
              "idempotency_conflict",
              "integrity_conflict",
              "state_conflict",
              "project_forbidden",
              "project_closed",
              "source_not_owned",
              "worker_untrusted",
            ].includes(error.code);
          const planned = disposition({
            body: message.body,
            context,
            message: conflict ? "conflicting_duplicate" : "transient_failure",
            persistence: "not_attempted",
            ack: "not_attempted",
            attempt: message.approximateReceiveCount,
            maximumAttempts: input.maxAttempts,
          });
          messages.push({
            disposition: planned.action,
            outcome: conflict ? "quarantined" : "retryable_failure",
            ...(code ? { errorCode: code } : {}),
          });
          continue;
        }

        if (!isCommittedOutcomeForCandidate(committed, candidate)) {
          messages.push({
            disposition: "quarantine_or_dlq",
            outcome: "quarantined",
            errorCode: "unexpected_scan_outcome",
          });
          continue;
        }
        const resultOutcome = committed.replayed
          ? "identical_replay"
          : committed.status === "rejected"
            ? "rejected"
            : "committed";
        try {
          const planned = disposition({
            body: message.body,
            context,
            message: "well_formed",
            persistence: committed.replayed ? "identical_replay" : "committed",
            ack: "not_attempted",
            attempt: message.approximateReceiveCount,
            maximumAttempts: input.maxAttempts,
          });
          if (!planned.acknowledge) {
            messages.push({
              disposition: planned.action,
              outcome: resultOutcome,
            });
            continue;
          }
          await bounded(
            () =>
              input.transport.acknowledge({
                receiptHandle: message.receiptHandle,
                signal,
              }),
            deadlineAt,
            now,
            signal
          );
          messages.push({
            disposition: "ack",
            outcome: resultOutcome,
          });
        } catch {
          const planned = disposition({
            body: message.body,
            context,
            message: "well_formed",
            persistence: committed.replayed ? "identical_replay" : "committed",
            ack: "failed_after_commit",
            attempt: message.approximateReceiveCount,
            maximumAttempts: input.maxAttempts,
          });
          messages.push({
            disposition: planned.action,
            outcome: "retryable_failure",
            errorCode: "ack_failed_after_commit",
          });
        }
      }
      return { received: received.length, messages };
    },
  };
}

/** Shared concrete dependencies for callers; no clients are created here. */
export type B3CandidateDependencies = {
  config: ProjectDocumentGuardDutyConfig;
  objectStore: Pick<ProjectDocumentS3ObjectStore, "readVersion">;
  targets: ProjectDocumentScanTargetLookup;
  replayRegistry: ScanEventFingerprintRegistry;
  freshness: { maxAgeMs: number; maxFutureSkewMs: number; now: () => number };
  env?: Readonly<Record<string, string | undefined>>;
};

export function createB3CandidateVerifier(
  dependencies: B3CandidateDependencies
) {
  return createProjectDocumentScanCandidateVerifier(dependencies);
}

export type B3ScanTarget = PersistedProjectDocumentScanTarget;
