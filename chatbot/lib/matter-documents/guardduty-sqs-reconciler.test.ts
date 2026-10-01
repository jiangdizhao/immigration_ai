import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  type MalwareDocumentLookup,
  MalwareMessageError,
  mapGuardDutyStatus,
  processGuardDutySqsMessage,
  reconcileGuardDutyQueueMessage,
  validateGuardDutyEvent,
} from "./guardduty-sqs-reconciler";
import type { ScannerVerdict } from "./security-reconciliation";

const config = {
  expectedAccountId: "123456789012",
  region: "ap-southeast-2",
  bucket: "private-documents",
};
const storageKey = "matter-documents/6ac93d4e-72b6-421f-9945-f8c78371998e";
const baseEvent = {
  version: "0",
  id: "evt-guardduty-123",
  time: "2026-10-01T00:00:00Z",
  resources: [],
  source: "aws.guardduty",
  "detail-type": "GuardDuty Malware Protection Object Scan Result",
  account: config.expectedAccountId,
  region: config.region,
  detail: {
    schemaVersion: "1.0",
    resourceType: "S3_OBJECT",
    s3ObjectDetails: { bucketName: config.bucket, objectKey: storageKey },
    scanResultDetails: { scanResultStatus: "NO_THREATS_FOUND" },
  },
};

function eventBody(
  update: (event: typeof baseEvent & Record<string, unknown>) => void = () =>
    undefined
): string {
  const event = structuredClone(baseEvent) as typeof baseEvent &
    Record<string, unknown>;
  update(event);
  return JSON.stringify(event);
}

function fakeRepository(initial: string | null = "pending") {
  let status = initial;
  const lookedUp: string[] = [];
  const transitions: Array<{ documentId: string; next: ScannerVerdict }> = [];
  const repository: MalwareDocumentLookup = {
    getByStorageKey(key) {
      lookedUp.push(key);
      return Promise.resolve(
        status === null
          ? null
          : { documentId: "doc-123", securityStatus: status }
      );
    },
    getSecurityStatus() {
      return Promise.resolve(status);
    },
    transitionSecurityStatus(input) {
      transitions.push({ documentId: input.documentId, next: input.next });
      if (status !== input.expected) {
        return Promise.resolve(false);
      }
      status = input.next;
      return Promise.resolve(true);
    },
  };
  return {
    repository,
    lookedUp,
    transitions,
    status: () => status,
    setStatus: (next: string | null) => {
      status = next;
    },
  };
}

function sqsMessage(body = eventBody()) {
  return { messageId: "msg-1", receiptHandle: "receipt-safe", body };
}

function assertCode(code: string, fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    if (error instanceof MalwareMessageError && error.code === code) {
      return;
    }
    throw new Error("unexpected_error_code");
  }
  throw new Error("expected_error_not_thrown");
}

for (const [status, verdict] of [
  ["NO_THREATS_FOUND", "clean"],
  ["THREATS_FOUND", "rejected"],
  ["UNSUPPORTED", "failed"],
  ["ACCESS_DENIED", "failed"],
  ["FAILED", "failed"],
] as const) {
  test(`GuardDuty ${status} maps to ${verdict}`, () => {
    assert.equal(mapGuardDutyStatus(status), verdict);
    const body = eventBody((event) => {
      (
        event.detail.scanResultDetails as { scanResultStatus: string }
      ).scanResultStatus = status;
    });
    assert.equal(
      validateGuardDutyEvent(body, config).detail.scanResultDetails
        .scanResultStatus,
      status
    );
  });
}

test("unknown status fails closed", () => {
  assertCode("unknown_scan_status", () => mapGuardDutyStatus("NEW_STATUS"));
  const body = eventBody((event) => {
    (
      event.detail.scanResultDetails as { scanResultStatus: string }
    ).scanResultStatus = "NEW_STATUS";
  });
  assertCode("unknown_scan_status", () => validateGuardDutyEvent(body, config));
});

test("wrong source and detail type are rejected", () => {
  for (const [field, value] of [
    ["source", "custom.guardduty"],
    ["detail-type", "Other"],
  ] as const) {
    const body = eventBody((event) => {
      event[field] = value;
    });
    assertCode("unsupported_event_type", () =>
      validateGuardDutyEvent(body, config)
    );
  }
});

test("wrong account and region are rejected", () => {
  for (const [field, value] of [
    ["account", "000000000000"],
    ["region", "us-east-1"],
  ] as const) {
    const body = eventBody((event) => {
      event[field] = value;
    });
    assertCode("event_identity_mismatch", () =>
      validateGuardDutyEvent(body, config)
    );
  }
});

test("wrong bucket is rejected", () => {
  const body = eventBody((event) => {
    (event.detail.s3ObjectDetails as { bucketName: string }).bucketName =
      "other-bucket";
  });
  assertCode("invalid_s3_object_details", () =>
    validateGuardDutyEvent(body, config)
  );
});

test("wrong object prefix is rejected", () => {
  const body = eventBody((event) => {
    (event.detail.s3ObjectDetails as { objectKey: string }).objectKey =
      "other-prefix/file";
  });
  assertCode("invalid_object_key", () => validateGuardDutyEvent(body, config));
});

test("malformed JSON and oversized event are rejected", () => {
  assertCode("malformed_json", () => validateGuardDutyEvent("{bad", config));
  assertCode("event_too_large", () =>
    validateGuardDutyEvent(" ".repeat(64 * 1024 + 1), config)
  );
});

test("uses exact storageKey lookup", async () => {
  const fake = fakeRepository();
  await reconcileGuardDutyQueueMessage({
    message: sqsMessage(),
    config,
    repository: fake.repository,
  });
  assert.deepEqual(fake.lookedUp, [storageKey]);
});

test("missing MatterDocument does not mutate another record", async () => {
  const fake = fakeRepository(null);
  await assert.rejects(
    reconcileGuardDutyQueueMessage({
      message: sqsMessage(),
      config,
      repository: fake.repository,
    }),
    (error: unknown) =>
      error instanceof MalwareMessageError &&
      error.code === "document_not_found"
  );
  assert.equal(fake.transitions.length, 0);
});

test("duplicate same-result delivery is idempotent", async () => {
  const fake = fakeRepository();
  const input = { message: sqsMessage(), config, repository: fake.repository };
  assert.equal(
    (await reconcileGuardDutyQueueMessage(input)).result,
    "reconciled"
  );
  assert.equal(
    (await reconcileGuardDutyQueueMessage(input)).result,
    "already_reconciled"
  );
  assert.equal(fake.status(), "clean");
  assert.equal(fake.transitions.length, 1);
});

test("conflicting terminal result does not overwrite existing state", async () => {
  const fake = fakeRepository("rejected");
  await assert.rejects(
    reconcileGuardDutyQueueMessage({
      message: sqsMessage(),
      config,
      repository: fake.repository,
    }),
    (error: unknown) =>
      error instanceof MalwareMessageError && error.code === "conflict"
  );
  assert.equal(fake.status(), "rejected");
  assert.equal(fake.transitions.length, 0);
});

test("database and CAS failures do not acknowledge the message", async () => {
  let deletes = 0;
  const failing = fakeRepository();
  failing.repository.getByStorageKey = () =>
    Promise.reject(new Error("private database failure"));
  await assert.rejects(
    processGuardDutySqsMessage({
      message: sqsMessage(),
      config,
      repository: failing.repository,
      deleteMessage: () => {
        deletes += 1;
        return Promise.resolve();
      },
      log: () => undefined,
    })
  );
  const casFail = fakeRepository();
  casFail.repository.transitionSecurityStatus = () => Promise.resolve(false);
  await assert.rejects(
    processGuardDutySqsMessage({
      message: sqsMessage(),
      config,
      repository: casFail.repository,
      deleteMessage: () => {
        deletes += 1;
        return Promise.resolve();
      },
      log: () => undefined,
    })
  );
  assert.equal(deletes, 0);
});

test("successful safe handling deletes exactly the SQS receipt", async () => {
  const fake = fakeRepository();
  const deleted: string[] = [];
  await processGuardDutySqsMessage({
    message: sqsMessage(),
    config,
    repository: fake.repository,
    deleteMessage: (receipt) => {
      deleted.push(receipt);
      return Promise.resolve();
    },
    log: () => undefined,
  });
  assert.deepEqual(deleted, ["receipt-safe"]);
});

test("safe logs omit storage key, raw event, secret, and customer payload", async () => {
  const fake = fakeRepository();
  const eventText = eventBody((event) => {
    event["raw-secret"] = "super-secret-value";
    event.threats = [{ name: "customer-threat-name" }];
    event.customerPayload = "private-customer-content";
  });
  const entries: unknown[] = [];
  await processGuardDutySqsMessage({
    message: sqsMessage(eventText),
    config,
    repository: fake.repository,
    deleteMessage: async () => undefined,
    log: (entry) => entries.push(entry),
  });
  const logs = JSON.stringify(entries);
  for (const secret of [
    storageKey,
    eventText,
    "super-secret-value",
    "customer-threat-name",
    "private-customer-content",
  ]) {
    assert.equal(logs.includes(secret), false);
  }
});

test("normal production chatbot startup CMD remains unchanged", async () => {
  const dockerfile = await readFile(
    new URL("../../Dockerfile.production", import.meta.url),
    "utf8"
  );
  assert.match(dockerfile, /CMD \["node", "server\.js"\]/);
  assert.match(dockerfile, /guardduty-malware-reconciler\.cjs/);
});

test("compiled production worker self-test needs no tsx, Corepack, or pnpm", async () => {
  const artifact = new URL(
    "../../.worker-build/guardduty-malware-reconciler.cjs",
    import.meta.url
  );
  const contents = await readFile(artifact, "utf8");
  assert.doesNotMatch(
    contents,
    /node --import tsx|corepack|pnpm (?:db:|exec|run)/i
  );
  const result = spawnSync(
    process.execPath,
    [artifact.pathname, "--self-test"],
    {
      encoding: "utf8",
      env: { PATH: process.env.PATH },
      timeout: 15_000,
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /guardduty_worker_self_test=passed/);
});
