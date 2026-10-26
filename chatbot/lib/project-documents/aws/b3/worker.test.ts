// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions are executed by the enclosing node:test cases through injected ports.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ProjectDocumentPersistenceError,
  type ProjectDocumentWorkerOutcome,
} from "../../postgres-repository";
import { ProjectDocumentAwsError } from "../errors";
import {
  type ProjectDocumentGuardDutyConfig,
  parseUntrustedGuardDutyScanEvent,
} from "../guardduty";
import { type B3QueueMessage, createB3ScanQueueWorker } from "./worker";

const body = JSON.stringify({ event: "synthetic" });
const guardDutyConfig: ProjectDocumentGuardDutyConfig = {
  accountId: "123456789012",
  region: "ap-southeast-2",
  bucket: "phase13-project-documents-test",
  protectionPlanArn:
    "arn:aws:guardduty:ap-southeast-2:123456789012:malware-protection-plan/plan-12345678",
};
const candidate = {
  trust: "untrusted_scan_candidate" as const,
  verdict: "clean" as const,
  eventId: "event-1",
  occurredAt: "2026-10-26T00:00:00.000Z",
  eventFingerprint: "a".repeat(64),
  replay: "new" as const,
  projectId: "11111111-1111-4111-8111-111111111111",
  assetId: "22222222-2222-4222-8222-222222222222",
  versionId: "33333333-3333-4333-8333-333333333333",
  generation: 1,
  objectIdentity: {
    key: "project-document/x",
    objectVersionId: "version-1",
    sha256: "b".repeat(64),
    byteSize: 5,
  },
};

function message(changes: Partial<B3QueueMessage> = {}): B3QueueMessage {
  return {
    body,
    receiptHandle: "opaque-receipt-handle",
    approximateReceiveCount: 1,
    transportContext: { source: "injected-test-transport" },
    ...changes,
  };
}

function harness(
  options: {
    authenticated?: boolean;
    candidateError?: Error;
    finalizerError?: Error;
    replayed?: boolean;
    ackError?: Error;
    message?: unknown;
    verdict?: "clean" | "rejected";
    finalizerResponse?: unknown;
  } = {}
) {
  const calls: string[] = [];
  const results = [options.message ?? message()];
  const worker = createB3ScanQueueWorker({
    enabled: true,
    maxMessages: 1,
    maxAttempts: 5,
    waitTimeSeconds: 0,
    maxExecutionMs: 1000,
    transport: {
      receive() {
        calls.push("receive");
        return Promise.resolve(results);
      },
      acknowledge() {
        calls.push("ack");
        return options.ackError
          ? Promise.reject(options.ackError)
          : Promise.resolve();
      },
    },
    authenticator: {
      authenticate() {
        calls.push("authenticate");
        return Promise.resolve(options.authenticated !== false);
      },
    },
    candidateVerifier() {
      calls.push("candidate");
      return options.candidateError
        ? Promise.reject(options.candidateError)
        : Promise.resolve({
            ...candidate,
            verdict: options.verdict ?? "clean",
          });
    },
    attestationIssuer: {
      issue(value) {
        calls.push("issue");
        assert.equal(value.eventFingerprint, candidate.eventFingerprint);
        return Promise.resolve("opaque-attestation");
      },
    },
    finalizer: {
      finalizeScan(value) {
        calls.push("finalize");
        assert.equal(value, "opaque-attestation");
        return options.finalizerError
          ? Promise.reject(options.finalizerError)
          : Promise.resolve(
              (options.finalizerResponse ?? {
                projectId: candidate.projectId,
                versionId: candidate.versionId,
                generation: candidate.generation,
                status: options.verdict ?? "clean",
                securityStatus: options.verdict ?? "clean",
                projectRevision: 2,
                operationId: "opaque-operation-id",
                replayed: options.replayed === true,
              }) as ProjectDocumentWorkerOutcome
            );
      },
    },
  });
  return { worker, calls };
}

test("B3 acknowledges only after committed finalization and reports durable replay", async () => {
  const first = harness();
  const result = await first.worker.runOnce(new AbortController().signal);
  assert.deepEqual(first.calls, [
    "receive",
    "authenticate",
    "candidate",
    "issue",
    "finalize",
    "ack",
  ]);
  assert.deepEqual(result.messages[0], {
    disposition: "ack",
    outcome: "committed",
  });

  const replay = harness({ replayed: true });
  const replayResult = await replay.worker.runOnce(
    new AbortController().signal
  );
  assert.equal(replayResult.messages[0]?.outcome, "identical_replay");
  assert.equal(replay.calls.at(-1), "ack");
});

test("B3 rejects unauthenticated delivery before candidate, storage, persistence, or ack", async () => {
  const { worker, calls } = harness({ authenticated: false });
  const result = await worker.runOnce(new AbortController().signal);
  assert.deepEqual(calls, ["receive", "authenticate"]);
  assert.equal(result.messages[0]?.disposition, "deny_untrusted");
});

test("B3 durably records a malware-rejected result before acknowledgement", async () => {
  const { worker, calls } = harness({ verdict: "rejected" });
  const result = await worker.runOnce(new AbortController().signal);
  assert.equal(result.messages[0]?.outcome, "rejected");
  assert.equal(result.messages[0]?.disposition, "ack");
  assert.ok(calls.indexOf("finalize") < calls.indexOf("ack"));
});

test("B3 quarantines malformed or candidate-mismatched finalizer outcomes", async () => {
  const validOutcome = {
    projectId: candidate.projectId,
    versionId: candidate.versionId,
    generation: candidate.generation,
    status: "clean",
    securityStatus: "clean",
    projectRevision: 2,
    operationId: "opaque-operation-id",
    replayed: false,
  };
  const adversarialOutcomes: Array<{
    verdict: "clean" | "rejected";
    response: unknown;
  }> = [
    {
      verdict: "clean",
      response: { ...validOutcome, projectId: "wrong-project" },
    },
    {
      verdict: "clean",
      response: { ...validOutcome, versionId: "wrong-version" },
    },
    { verdict: "clean", response: { ...validOutcome, generation: 2 } },
    { verdict: "rejected", response: validOutcome },
    {
      verdict: "rejected",
      response: {
        ...validOutcome,
        status: "rejected",
        securityStatus: "clean",
      },
    },
    {
      verdict: "clean",
      response: { ...validOutcome, replayed: undefined },
    },
  ];

  for (const adversary of adversarialOutcomes) {
    const { worker, calls } = harness({
      verdict: adversary.verdict,
      finalizerResponse: adversary.response,
    });
    const result = await worker.runOnce(new AbortController().signal);
    assert.equal(result.messages[0]?.disposition, "quarantine_or_dlq");
    assert.equal(result.messages[0]?.outcome, "quarantined");
    assert.equal(calls.includes("ack"), false);
  }
});

test("B3 failed and skipped scan outcomes never promote clean or receive a success ACK", async () => {
  const cases = [
    {
      scanStatus: "FAILED",
      scanResultStatus: "FAILED",
      attempt: 1,
      expected: "retry",
    },
    {
      scanStatus: "FAILED",
      scanResultStatus: "ACCESS_DENIED",
      attempt: 3,
      expected: "dlq_exhausted",
    },
    {
      scanStatus: "SKIPPED",
      scanResultStatus: "UNSUPPORTED",
      attempt: 1,
      expected: "retry",
    },
    {
      scanStatus: "SKIPPED",
      scanResultStatus: "ACCESS_DENIED",
      attempt: 3,
      expected: "dlq_exhausted",
    },
    {
      scanStatus: "COMPLETED",
      scanResultStatus: "ACCESS_DENIED",
      attempt: 1,
      expected: "quarantine_or_dlq",
    },
  ] as const;

  for (const failure of cases) {
    const scanBody = JSON.stringify({
      version: "0",
      id: `event-${failure.scanStatus}-${failure.scanResultStatus}`,
      time: "2026-10-26T00:00:00.000Z",
      source: "aws.guardduty",
      "detail-type": "GuardDuty Malware Protection Object Scan Result",
      account: guardDutyConfig.accountId,
      region: guardDutyConfig.region,
      resources: [guardDutyConfig.protectionPlanArn],
      detail: {
        schemaVersion: "1.0",
        scanStatus: failure.scanStatus,
        resourceType: "S3_OBJECT",
        s3ObjectDetails: {
          bucketName: guardDutyConfig.bucket,
          objectKey: candidate.objectIdentity.key,
          eTag: "not-a-digest",
          versionId: candidate.objectIdentity.objectVersionId,
        },
        scanResultDetails: { scanResultStatus: failure.scanResultStatus },
      },
    });
    const calls: string[] = [];
    const worker = createB3ScanQueueWorker({
      enabled: true,
      maxMessages: 1,
      maxAttempts: 3,
      waitTimeSeconds: 0,
      maxExecutionMs: 1000,
      transport: {
        receive: () =>
          Promise.resolve([
            message({
              body: scanBody,
              approximateReceiveCount: failure.attempt,
            }),
          ]),
        acknowledge: () => {
          calls.push("ack");
          return Promise.resolve();
        },
      },
      authenticator: { authenticate: async () => true },
      candidateVerifier: ({ rawBody }) => {
        calls.push("candidate");
        const parsed = parseUntrustedGuardDutyScanEvent(
          rawBody,
          guardDutyConfig
        );
        if (parsed.candidateVerdict === "unavailable") {
          return Promise.reject(
            new ProjectDocumentAwsError("scan_not_completed")
          );
        }
        return Promise.resolve({
          ...candidate,
          eventId: parsed.eventId,
          occurredAt: parsed.occurredAt,
          eventFingerprint: parsed.fingerprint,
          verdict: parsed.candidateVerdict,
        });
      },
      attestationIssuer: {
        issue: () => {
          calls.push("issue");
          return Promise.resolve("opaque-attestation");
        },
      },
      finalizer: {
        finalizeScan: () => {
          calls.push("finalize");
          return Promise.resolve({
            projectId: candidate.projectId,
            versionId: candidate.versionId,
            generation: candidate.generation,
            status: "clean",
            securityStatus: "clean",
            projectRevision: 2,
            operationId: "opaque-operation-id",
            replayed: false,
          });
        },
      },
    });

    const result = await worker.runOnce(new AbortController().signal);
    assert.equal(result.messages[0]?.disposition, failure.expected);
    assert.equal(
      result.messages[0]?.outcome,
      failure.expected === "quarantine_or_dlq"
        ? "quarantined"
        : "retryable_failure"
    );
    assert.deepEqual(calls, ["candidate"]);
  }
});

test("B3 quarantines malformed or conflicting candidates without acknowledgement", async () => {
  const malformed = harness({
    candidateError: new ProjectDocumentAwsError("malformed_event"),
  });
  const malformedResult = await malformed.worker.runOnce(
    new AbortController().signal
  );
  assert.equal(malformedResult.messages[0]?.outcome, "quarantined");
  assert.equal(malformed.calls.includes("ack"), false);

  const conflict = harness({
    candidateError: new ProjectDocumentAwsError("event_replay_conflict"),
  });
  const conflictResult = await conflict.worker.runOnce(
    new AbortController().signal
  );
  assert.equal(conflictResult.messages[0]?.disposition, "quarantine_or_dlq");
  assert.equal(conflict.calls.includes("ack"), false);

  const revoked = harness({
    finalizerError: new ProjectDocumentPersistenceError("project_forbidden"),
  });
  const revokedResult = await revoked.worker.runOnce(
    new AbortController().signal
  );
  assert.equal(revokedResult.messages[0]?.outcome, "quarantined");
  assert.equal(revoked.calls.includes("ack"), false);

  const unavailable = harness({
    candidateError: new ProjectDocumentAwsError("scan_not_completed"),
  });
  const unavailableResult = await unavailable.worker.runOnce(
    new AbortController().signal
  );
  assert.equal(unavailableResult.messages[0]?.disposition, "retry");
  assert.equal(unavailable.calls.includes("ack"), false);
});

test("B3 transient persistence failures remain unacknowledged and bounded by attempt count", async () => {
  const retry = harness({ finalizerError: new Error("database unavailable") });
  const retryResult = await retry.worker.runOnce(new AbortController().signal);
  assert.equal(retryResult.messages[0]?.disposition, "retry");
  assert.equal(retry.calls.includes("ack"), false);

  const exhausted = harness({
    message: message({ approximateReceiveCount: 5 }),
    finalizerError: new Error("database unavailable"),
  });
  const exhaustedResult = await exhausted.worker.runOnce(
    new AbortController().signal
  );
  assert.equal(exhaustedResult.messages[0]?.disposition, "dlq_exhausted");
});

test("B3 ack failure after commit leaves replay-safe retry and redacts diagnostics", async () => {
  const { worker, calls } = harness({
    ackError: new Error("secret receipt/account detail"),
  });
  const result = await worker.runOnce(new AbortController().signal);
  assert.equal(calls.at(-1), "ack");
  assert.deepEqual(result.messages[0], {
    disposition: "retry",
    outcome: "retryable_failure",
    errorCode: "ack_failed_after_commit",
  });
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("B3 validates disabled mode and bounded batch configuration before receive", () => {
  assert.throws(
    () =>
      createB3ScanQueueWorker({
        enabled: false,
        maxMessages: 1,
        maxAttempts: 2,
        waitTimeSeconds: 0,
        maxExecutionMs: 1000,
        transport: {} as never,
        authenticator: {} as never,
        candidateVerifier: async () => candidate,
        attestationIssuer: {} as never,
        finalizer: {} as never,
      }),
    (error) =>
      error instanceof ProjectDocumentAwsError &&
      error.code === "adapter_disabled"
  );
});

test("B3 applies one overall deadline to injected queue execution", async () => {
  const worker = createB3ScanQueueWorker({
    enabled: true,
    maxMessages: 1,
    maxAttempts: 2,
    waitTimeSeconds: 0,
    maxExecutionMs: 100,
    transport: {
      receive() {
        return new Promise<unknown[]>(() => undefined);
      },
      acknowledge() {
        return Promise.resolve();
      },
    },
    authenticator: { authenticate: async () => true },
    candidateVerifier: async () => candidate,
    attestationIssuer: { issue: async () => "opaque" },
    finalizer: {
      finalizeScan: () => Promise.reject(new Error("not reached")),
    },
  });
  await assert.rejects(
    worker.runOnce(new AbortController().signal),
    (error) =>
      error instanceof ProjectDocumentAwsError &&
      error.code === "storage_unavailable"
  );
});

test("B3 abort during candidate verification prevents persistence and acknowledgement", async () => {
  const calls: string[] = [];
  const worker = createB3ScanQueueWorker({
    enabled: true,
    maxMessages: 1,
    maxAttempts: 3,
    waitTimeSeconds: 0,
    maxExecutionMs: 1000,
    transport: {
      receive: () => Promise.resolve([message()]),
      acknowledge: () => {
        calls.push("ack");
        return Promise.resolve();
      },
    },
    authenticator: { authenticate: async () => true },
    candidateVerifier: () => {
      calls.push("candidate");
      return new Promise(() => undefined);
    },
    attestationIssuer: {
      issue: () => {
        calls.push("issue");
        return Promise.resolve("opaque");
      },
    },
    finalizer: {
      finalizeScan: () => {
        calls.push("finalize");
        return Promise.reject(new Error("not reached"));
      },
    },
  });
  const controller = new AbortController();
  const pending = worker.runOnce(controller.signal);
  setTimeout(() => controller.abort(), 20);
  const result = await pending;
  assert.equal(result.messages[0]?.disposition, "retry");
  assert.deepEqual(calls, ["candidate"]);
});
