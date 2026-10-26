import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import {
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  MATTER_DOCUMENT_MIME,
  MAX_MATTER_DOCUMENT_BYTES,
} from "@/lib/matter-documents/formats";
import {
  isProjectDocumentAwsAdapterEnabled,
  PROJECT_DOCUMENT_AWS_ADAPTERS_FLAG,
  validateObjectVersionId,
  validateProjectDocumentAwsIdentityConfig,
  validateProjectDocumentObjectKey,
} from "./config";
import {
  authenticateScanDeliveryContext,
  type ScanDeliveryAuthenticatorPort,
} from "./delivery-context";
import { ProjectDocumentAwsError } from "./errors";
import {
  type ProjectDocumentGuardDutyConfig,
  parseUntrustedGuardDutyScanEvent,
} from "./guardduty";
import {
  createProjectDocumentS3ObjectStore,
  type ProjectDocumentS3Client,
  type ProjectDocumentS3Command,
  type ProjectDocumentS3ExactVersionInput,
  type ProjectDocumentS3PutInput,
} from "./s3-object-store";
import {
  createProjectDocumentScanCandidateVerifier,
  type PersistedProjectDocumentScanTarget,
} from "./scan-candidate";
import {
  createFakeScanEventFingerprintRegistry,
  createFakeTrustedScanDeliveryContext,
} from "./testing";

const flagEnv = { [PROJECT_DOCUMENT_AWS_ADAPTERS_FLAG]: "true" };
const identityConfig = {
  accountId: "123456789012",
  region: "ap-southeast-2",
  bucket: "phase13-project-documents-test",
};
const guardDutyConfig: ProjectDocumentGuardDutyConfig = {
  ...identityConfig,
  protectionPlanArn:
    "arn:aws:guardduty:ap-southeast-2:123456789012:malware-protection-plan/plan-12345678",
};
const objectKey =
  "project-document/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333";
const objectVersionId = "s3-version-id-opaque-123";
const objectBytes = Buffer.from("synthetic project document bytes");

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function checksumBase64(hex: string) {
  return Buffer.from(hex, "hex").toString("base64");
}

function expectedObjectIdentity(bytes: Uint8Array = objectBytes) {
  return {
    key: objectKey,
    objectVersionId,
    sha256: sha256(bytes),
    byteSize: bytes.byteLength,
  };
}

type FakeS3Options = {
  versioning?: string;
  putVersionId?: string | null;
  putChecksum?: string | null;
  putEncryption?: string | null;
  headVersionId?: string | null;
  getVersionId?: string | null;
  headLength?: number;
  getLength?: number;
  headEncryption?: string | null;
  getEncryption?: string | null;
  getChecksum?: string | null;
  bodyBytes?: Uint8Array;
  bodyStream?: Readable;
  putFailure?: unknown;
  headFailure?: unknown;
  getFailure?: unknown;
};

class FakeS3Client implements ProjectDocumentS3Client {
  readonly region = identityConfig.region;
  readonly commands: ProjectDocumentS3Command[] = [];
  private readonly options: FakeS3Options;

  constructor(options: FakeS3Options = {}) {
    this.options = options;
  }

  send(command: ProjectDocumentS3Command): Promise<unknown> {
    this.commands.push(command);
    const bytes = this.options.bodyBytes ?? objectBytes;
    const digest = sha256(bytes);
    if (command instanceof GetBucketVersioningCommand) {
      return Promise.resolve({ Status: this.options.versioning ?? "Enabled" });
    }
    if (command instanceof PutObjectCommand) {
      if (this.options.putFailure !== undefined) {
        return Promise.reject(this.options.putFailure);
      }
      return Promise.resolve({
        VersionId:
          this.options.putVersionId === undefined
            ? objectVersionId
            : this.options.putVersionId,
        ChecksumSHA256:
          this.options.putChecksum === undefined
            ? checksumBase64(digest)
            : this.options.putChecksum,
        ServerSideEncryption:
          this.options.putEncryption === undefined
            ? "AES256"
            : this.options.putEncryption,
      });
    }
    if (command instanceof HeadObjectCommand) {
      if (this.options.headFailure !== undefined) {
        return Promise.reject(this.options.headFailure);
      }
      return Promise.resolve({
        VersionId:
          this.options.headVersionId === undefined
            ? objectVersionId
            : this.options.headVersionId,
        ContentLength: this.options.headLength ?? bytes.byteLength,
        ServerSideEncryption:
          this.options.headEncryption === undefined
            ? "AES256"
            : this.options.headEncryption,
        ETag: '"misleading-not-a-sha256"',
      });
    }
    if (command instanceof GetObjectCommand) {
      if (this.options.getFailure !== undefined) {
        return Promise.reject(this.options.getFailure);
      }
      return Promise.resolve({
        VersionId:
          this.options.getVersionId === undefined
            ? objectVersionId
            : this.options.getVersionId,
        ContentLength: this.options.getLength ?? bytes.byteLength,
        ServerSideEncryption:
          this.options.getEncryption === undefined
            ? "AES256"
            : this.options.getEncryption,
        ChecksumSHA256: this.options.getChecksum,
        ETag: '"misleading-not-a-sha256"',
        Body: this.options.bodyStream ?? Readable.from([Buffer.from(bytes)]),
      });
    }
    return Promise.reject(new Error("unexpected_fake_s3_command"));
  }
}

function createStore(
  options: FakeS3Options = {},
  region = identityConfig.region
) {
  const client = new FakeS3Client(options);
  const store = createProjectDocumentS3ObjectStore({
    client: { ...client, region, send: client.send.bind(client) },
    config: identityConfig,
    env: flagEnv,
  });
  return { client, store };
}

function putInput(bytes = objectBytes): ProjectDocumentS3PutInput {
  return {
    key: objectKey,
    bytes,
    expectedSha256: sha256(bytes),
    contentType: MATTER_DOCUMENT_MIME.pdf,
  };
}

function exactInput(
  changes: Partial<ProjectDocumentS3ExactVersionInput> = {}
): ProjectDocumentS3ExactVersionInput {
  const identity = expectedObjectIdentity();
  return {
    key: identity.key,
    objectVersionId: identity.objectVersionId,
    expectedSha256: identity.sha256,
    expectedByteSize: identity.byteSize,
    ...changes,
  };
}

function awsErrorCode(error: unknown) {
  if (!(error instanceof ProjectDocumentAwsError)) {
    throw new Error("expected_project_document_aws_error");
  }
  return error.code;
}

test("S3 adapter is default-disabled and validates its isolated identity", () => {
  assert.equal(isProjectDocumentAwsAdapterEnabled({}), false);
  assert.equal(isProjectDocumentAwsAdapterEnabled(flagEnv), true);
  assert.equal(
    awsErrorCode(
      (() => {
        try {
          createProjectDocumentS3ObjectStore({
            client: new FakeS3Client(),
            config: identityConfig,
          });
        } catch (error) {
          return error;
        }
        return new Error("expected adapter_disabled");
      })()
    ),
    "adapter_disabled"
  );
  assert.throws(
    () => createStore({}, "us-east-1"),
    (error) => awsErrorCode(error) === "client_region_mismatch"
  );
  assert.throws(
    () =>
      validateProjectDocumentAwsIdentityConfig({
        ...identityConfig,
        accountId: "1",
      }),
    (error) => awsErrorCode(error) === "invalid_configuration"
  );
  assert.throws(
    () =>
      validateProjectDocumentAwsIdentityConfig({
        ...identityConfig,
        bucket: "bad_bucket",
      }),
    (error) => awsErrorCode(error) === "invalid_configuration"
  );
  assert.throws(
    () => validateProjectDocumentObjectKey("project-document/../secret"),
    (error) => awsErrorCode(error) === "invalid_object_key"
  );
  assert.throws(
    () => validateObjectVersionId("null"),
    (error) => awsErrorCode(error) === "missing_version_id"
  );
});

test("S3 put is conditional, checksums bytes, encryption and returns exact VersionId", async () => {
  const { client, store } = createStore();
  const identity = await store.putNew(putInput());
  assert.deepEqual(identity, expectedObjectIdentity());
  assert.equal(client.commands.length, 2);
  assert.ok(client.commands[0] instanceof GetBucketVersioningCommand);
  assert.ok(client.commands[1] instanceof PutObjectCommand);
  const command = client.commands[1];
  assert.ok(command instanceof PutObjectCommand);
  assert.equal(command.input.IfNoneMatch, "*");
  assert.equal(command.input.ExpectedBucketOwner, identityConfig.accountId);
  assert.equal(command.input.ServerSideEncryption, "AES256");
  assert.equal(command.input.ChecksumAlgorithm, "SHA256");
  assert.equal(
    command.input.ChecksumSHA256,
    checksumBase64(sha256(objectBytes))
  );
  assert.equal(command.input.ContentLength, objectBytes.byteLength);
});

test("S3 exact-version read uses HEAD and GET VersionId and computes SHA despite ETag", async () => {
  const { client, store } = createStore();
  const result = await store.readVersion(exactInput());
  assert.deepEqual(result.identity, expectedObjectIdentity());
  assert.deepEqual(result.bytes, objectBytes);
  assert.equal(client.commands.length, 2);
  const [head, get] = client.commands;
  assert.ok(head instanceof HeadObjectCommand);
  assert.ok(get instanceof GetObjectCommand);
  for (const command of [head, get]) {
    assert.equal(command.input.Key, objectKey);
    assert.equal(command.input.VersionId, objectVersionId);
    assert.equal(command.input.ExpectedBucketOwner, identityConfig.accountId);
  }
  assert.equal(result.identity.sha256, sha256(objectBytes));
  assert.notEqual(result.identity.sha256, '"misleading-not-a-sha256"');
});

test("statIdentity verifies bytes for the requested stored version", async () => {
  const { client, store } = createStore();
  assert.deepEqual(
    await store.statIdentity(exactInput()),
    expectedObjectIdentity()
  );
  assert.deepEqual(
    client.commands.map((command) => command.constructor.name),
    ["HeadObjectCommand", "GetObjectCommand"]
  );
});

test("S3 refuses absent, substituted, or mismatched versions and identities", async () => {
  const missingExpectedVersion = createStore();
  await assert.rejects(
    missingExpectedVersion.store.readVersion(
      exactInput({ objectVersionId: "" })
    ),
    (error) => awsErrorCode(error) === "missing_version_id"
  );
  assert.equal(missingExpectedVersion.client.commands.length, 0);

  const missing = createStore({ headVersionId: null });
  await assert.rejects(
    missing.store.readVersion(exactInput()),
    (error) => awsErrorCode(error) === "missing_version_id"
  );
  assert.equal(missing.client.commands.length, 1);

  const newer = createStore({ headVersionId: "newer-version" });
  await assert.rejects(
    newer.store.readVersion(exactInput()),
    (error) => awsErrorCode(error) === "version_identity_mismatch"
  );
  assert.equal(newer.client.commands.length, 1);

  const getSubstitution = createStore({ getVersionId: "newer-version" });
  await assert.rejects(
    getSubstitution.store.readVersion(exactInput()),
    (error) => awsErrorCode(error) === "version_identity_mismatch"
  );

  const badHash = createStore();
  await assert.rejects(
    badHash.store.readVersion(exactInput({ expectedSha256: "0".repeat(64) })),
    (error) => awsErrorCode(error) === "checksum_mismatch"
  );
  const badSize = createStore();
  await assert.rejects(
    badSize.store.readVersion(
      exactInput({ expectedByteSize: objectBytes.byteLength + 1 })
    ),
    (error) => awsErrorCode(error) === "object_size_mismatch"
  );

  const mismatchedGetBody = Readable.from([Buffer.from(objectBytes)]);
  const mismatchedGetLength = createStore({
    bodyStream: mismatchedGetBody,
    getLength: objectBytes.byteLength - 1,
  });
  await assert.rejects(
    mismatchedGetLength.store.readVersion(exactInput()),
    (error) => awsErrorCode(error) === "object_size_mismatch"
  );
  assert.equal(mismatchedGetBody.destroyed, true);
});

test("S3 rejects oversized uploads and aborts bounded reads", async () => {
  const tooLarge = createStore();
  const oversized = Buffer.alloc(MAX_MATTER_DOCUMENT_BYTES + 1);
  await assert.rejects(
    tooLarge.store.putNew(putInput(oversized)),
    (error) => awsErrorCode(error) === "payload_too_large"
  );
  assert.equal(tooLarge.client.commands.length, 0);

  const overflowBody = Readable.from([Buffer.from("three")]);
  const overflow = createStore({
    bodyBytes: Buffer.from("three"),
    bodyStream: overflowBody,
    headLength: 2,
    getLength: 2,
  });
  await assert.rejects(
    overflow.store.readVersion(
      exactInput({
        expectedByteSize: 2,
        expectedSha256: sha256(Buffer.from("ab")),
      })
    ),
    (error) => awsErrorCode(error) === "read_too_large"
  );
  assert.equal(overflowBody.destroyed, true);
});

test("S3 versioning, checksum, conflicts and ambiguous writes fail closed", async () => {
  const suspended = createStore({ versioning: "Suspended" });
  await assert.rejects(
    suspended.store.putNew(putInput()),
    (error) => awsErrorCode(error) === "bucket_versioning_unavailable"
  );
  assert.equal(suspended.client.commands.length, 1);

  const missingVersion = createStore({ putVersionId: null });
  await assert.rejects(missingVersion.store.putNew(putInput()), (error) => {
    assert.equal(awsErrorCode(error), "missing_version_id");
    assert.equal(
      (error as ProjectDocumentAwsError).writeMayHaveSucceeded,
      true
    );
    return true;
  });

  const wrongChecksum = createStore({ putChecksum: "wrong" });
  await assert.rejects(
    wrongChecksum.store.putNew(putInput()),
    (error) => awsErrorCode(error) === "checksum_mismatch"
  );

  const missingChecksum = createStore({ putChecksum: null });
  await assert.rejects(
    missingChecksum.store.putNew(putInput()),
    (error) => awsErrorCode(error) === "checksum_unverified"
  );

  const wrongEncryption = createStore({ putEncryption: "aws:kms" });
  await assert.rejects(wrongEncryption.store.putNew(putInput()), (error) => {
    assert.equal(awsErrorCode(error), "encryption_mismatch");
    assert.equal(
      (error as ProjectDocumentAwsError).writeMayHaveSucceeded,
      true
    );
    return true;
  });

  const getChecksumMismatch = createStore({ getChecksum: "wrong" });
  await assert.rejects(
    getChecksumMismatch.store.readVersion(exactInput()),
    (error) => awsErrorCode(error) === "checksum_mismatch"
  );

  const readEncryptionMismatch = createStore({ headEncryption: "aws:kms" });
  await assert.rejects(
    readEncryptionMismatch.store.readVersion(exactInput()),
    (error) => awsErrorCode(error) === "encryption_mismatch"
  );
  assert.equal(readEncryptionMismatch.client.commands.length, 1);

  const conflict = createStore({
    putFailure: Object.assign(new Error("conflict"), {
      name: "PreconditionFailed",
    }),
  });
  await assert.rejects(
    conflict.store.putNew(putInput()),
    (error) => awsErrorCode(error) === "write_conflict"
  );

  const ambiguous = createStore({ putFailure: new Error("socket ended") });
  await assert.rejects(ambiguous.store.putNew(putInput()), (error) => {
    assert.equal(awsErrorCode(error), "write_ambiguous");
    assert.equal(
      (error as ProjectDocumentAwsError).writeMayHaveSucceeded,
      true
    );
    return true;
  });

  const unavailable = createStore({
    headFailure: Object.assign(new Error("denied"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    }),
  });
  await assert.rejects(
    unavailable.store.readVersion(exactInput()),
    (error) => awsErrorCode(error) === "storage_unavailable"
  );
});

function eventFixture(changes: Record<string, unknown> = {}) {
  return {
    version: "0",
    id: "event-123",
    time: "2026-10-25T00:00:00.000Z",
    source: "aws.guardduty",
    "detail-type": "GuardDuty Malware Protection Object Scan Result",
    account: guardDutyConfig.accountId,
    region: guardDutyConfig.region,
    resources: [guardDutyConfig.protectionPlanArn],
    detail: {
      schemaVersion: "1.0",
      scanStatus: "COMPLETED",
      resourceType: "S3_OBJECT",
      s3ObjectDetails: {
        bucketName: guardDutyConfig.bucket,
        objectKey,
        eTag: "deliberately-not-a-checksum",
        versionId: objectVersionId,
      },
      scanResultDetails: { scanResultStatus: "NO_THREATS_FOUND" },
    },
    ...changes,
  };
}

function currentTarget(
  changes: Partial<PersistedProjectDocumentScanTarget> = {}
): PersistedProjectDocumentScanTarget {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    assetId: "22222222-2222-4222-8222-222222222222",
    versionId: "33333333-3333-4333-8333-333333333333",
    generation: 2,
    currentGeneration: 2,
    storageKey: objectKey,
    storageObjectVersionId: objectVersionId,
    sha256: sha256(objectBytes),
    byteSize: objectBytes.byteLength,
    objectIdentity: expectedObjectIdentity(),
    storageStatus: "stored",
    storageVerifiedAt: "2026-10-24T23:00:00.000Z",
    securityStatus: "pending",
    assetLifecycle: "active",
    projectLifecycle: "active",
    ...changes,
  };
}

function candidateHarness(
  options: {
    target?: PersistedProjectDocumentScanTarget | null;
    bodyBytes?: Uint8Array;
    freshnessNow?: number;
    maxAgeMs?: number;
  } = {}
) {
  const readRequests: ProjectDocumentS3ExactVersionInput[] = [];
  const targetRequests: Array<{
    bucket: string;
    objectKey: string;
    objectVersionId: string;
  }> = [];
  const bytes = options.bodyBytes ?? objectBytes;
  const verifier = createProjectDocumentScanCandidateVerifier({
    config: guardDutyConfig,
    objectStore: {
      readVersion(input) {
        readRequests.push(input);
        return Promise.resolve({
          identity: {
            ...expectedObjectIdentity(bytes),
            objectVersionId: input.objectVersionId,
            key: input.key,
          },
          bytes,
        });
      },
    },
    targets: {
      findByExactObjectIdentity(input) {
        targetRequests.push(input);
        return Promise.resolve(
          options.target === undefined ? currentTarget() : options.target
        );
      },
    },
    replayRegistry: createFakeScanEventFingerprintRegistry(),
    freshness: {
      maxAgeMs: options.maxAgeMs ?? 60_000,
      maxFutureSkewMs: 0,
      now: () => options.freshnessNow ?? Date.parse("2026-10-25T00:00:00.000Z"),
    },
    env: flagEnv,
  });
  return { verifier, readRequests, targetRequests };
}

async function verifyEvent(
  verifier: ReturnType<typeof candidateHarness>["verifier"],
  event: Record<string, unknown>
) {
  const rawBody = JSON.stringify(event);
  const deliveryContext = await createFakeTrustedScanDeliveryContext(rawBody);
  return verifier({ rawBody, deliveryContext });
}

test("GuardDuty parser emits only a bounded untrusted payload and ignores ETag as digest", () => {
  const parsed = parseUntrustedGuardDutyScanEvent(
    JSON.stringify(eventFixture()),
    guardDutyConfig
  );
  assert.equal(parsed.trust, "untrusted_event_payload");
  assert.equal(parsed.candidateVerdict, "clean");
  assert.equal(parsed.objectVersionId, objectVersionId);
  assert.equal("eTag" in parsed, false);
  assert.equal("proofToken" in parsed, false);
  assert.throws(
    () =>
      parseUntrustedGuardDutyScanEvent(" ".repeat(65 * 1024), guardDutyConfig),
    (error) => awsErrorCode(error) === "event_too_large"
  );
  assert.throws(
    () =>
      parseUntrustedGuardDutyScanEvent(new Uint8Array([0xff]), guardDutyConfig),
    (error) => awsErrorCode(error) === "malformed_event"
  );
});

test("GuardDuty requires exact event identity, plan, Project key and S3 version", () => {
  const invalidEvents = [
    eventFixture({ account: "999999999999" }),
    eventFixture({ region: "us-east-1" }),
    eventFixture({ source: "attacker" }),
    eventFixture({ "detail-type": "other" }),
    eventFixture({ resources: ["arn:wrong"] }),
    eventFixture({
      detail: { ...eventFixture().detail, schemaVersion: "2.0" },
    }),
    eventFixture({
      detail: {
        ...eventFixture().detail,
        s3ObjectDetails: {
          ...eventFixture().detail.s3ObjectDetails,
          bucketName: "other-bucket",
        },
      },
    }),
    eventFixture({
      detail: {
        ...eventFixture().detail,
        s3ObjectDetails: {
          ...eventFixture().detail.s3ObjectDetails,
          objectKey: "matter-documents/unsafe",
        },
      },
    }),
    eventFixture({
      detail: {
        ...eventFixture().detail,
        s3ObjectDetails: {
          ...eventFixture().detail.s3ObjectDetails,
          versionId: "null",
        },
      },
    }),
  ];
  for (const event of invalidEvents) {
    assert.throws(() =>
      parseUntrustedGuardDutyScanEvent(JSON.stringify(event), guardDutyConfig)
    );
  }
  assert.throws(
    () =>
      parseUntrustedGuardDutyScanEvent(
        JSON.stringify(
          eventFixture({
            detail: { ...eventFixture().detail, scanStatus: "SKIPPED" },
          })
        ),
        guardDutyConfig
      ),
    (error) => awsErrorCode(error) === "invalid_scan_result_pair"
  );
});

test("authenticated exact-version event produces only an untrusted clean candidate", async () => {
  const { verifier, readRequests, targetRequests } = candidateHarness();
  const result = await verifyEvent(verifier, eventFixture());
  assert.equal(result.trust, "untrusted_scan_candidate");
  assert.equal(result.verdict, "clean");
  assert.equal(result.replay, "new");
  assert.equal(result.objectIdentity.sha256, sha256(objectBytes));
  assert.equal(readRequests.length, 1);
  assert.deepEqual(targetRequests[0], {
    bucket: guardDutyConfig.bucket,
    objectKey,
    objectVersionId,
  });
  assert.equal("proofToken" in result, false);
});

test("raw JSON and forged delivery contexts cannot bypass transport authentication", async () => {
  const { verifier, targetRequests, readRequests } = candidateHarness();
  const rawBody = JSON.stringify(eventFixture());
  await assert.rejects(
    verifier({ rawBody }),
    (error) => awsErrorCode(error) === "delivery_context_required"
  );
  await assert.rejects(
    verifier({ rawBody, deliveryContext: { trusted: true } }),
    (error) => awsErrorCode(error) === "delivery_context_required"
  );
  const rejectingAuthenticator: ScanDeliveryAuthenticatorPort = {
    authenticate() {
      return Promise.resolve(false);
    },
  };
  await assert.rejects(
    authenticateScanDeliveryContext({
      rawBody,
      transportContext: "aws.guardduty",
      authenticator: rejectingAuthenticator,
    }),
    (error) => awsErrorCode(error) === "delivery_untrusted"
  );
  assert.equal(targetRequests.length, 0);
  assert.equal(readRequests.length, 0);
});

test("threats found is rejected; skipped and failed scans never become clean", async () => {
  const rejectedHarness = candidateHarness();
  const rejected = await verifyEvent(
    rejectedHarness.verifier,
    eventFixture({
      detail: {
        ...eventFixture().detail,
        scanResultDetails: { scanResultStatus: "THREATS_FOUND" },
      },
    })
  );
  assert.equal(rejected.verdict, "rejected");

  const skipped = candidateHarness();
  await assert.rejects(
    verifyEvent(
      skipped.verifier,
      eventFixture({
        detail: {
          ...eventFixture().detail,
          scanStatus: "SKIPPED",
          scanResultDetails: { scanResultStatus: "UNSUPPORTED" },
        },
      })
    ),
    (error) => awsErrorCode(error) === "scan_not_completed"
  );
  const failed = candidateHarness();
  await assert.rejects(
    verifyEvent(
      failed.verifier,
      eventFixture({
        detail: {
          ...eventFixture().detail,
          scanStatus: "FAILED",
          scanResultDetails: { scanResultStatus: "FAILED" },
        },
      })
    ),
    (error) => awsErrorCode(error) === "scan_not_completed"
  );
  assert.equal(skipped.readRequests.length + failed.readRequests.length, 0);
});

test("newer S3 version, withdrawn targets and stale generations fail closed", async () => {
  const newerEvent = eventFixture({
    detail: {
      ...eventFixture().detail,
      s3ObjectDetails: {
        ...eventFixture().detail.s3ObjectDetails,
        versionId: "newer-version-id",
      },
    },
  });
  const newer = candidateHarness();
  await assert.rejects(
    verifyEvent(newer.verifier, newerEvent),
    (error) => awsErrorCode(error) === "scan_identity_mismatch"
  );
  assert.equal(newer.readRequests.length, 0);

  const withdrawn = candidateHarness({
    target: currentTarget({ assetLifecycle: "withdrawn" }),
  });
  await assert.rejects(
    verifyEvent(withdrawn.verifier, eventFixture()),
    (error) => awsErrorCode(error) === "scan_target_stale"
  );

  const staleGeneration = candidateHarness({
    target: currentTarget({ currentGeneration: 3 }),
  });
  await assert.rejects(
    verifyEvent(staleGeneration.verifier, eventFixture()),
    (error) => awsErrorCode(error) === "scan_target_stale"
  );
});

test("target lookup binds Project IDs and persisted SHA/size before object reads", async () => {
  const missing = candidateHarness({ target: null });
  await assert.rejects(
    verifyEvent(missing.verifier, eventFixture()),
    (error) => awsErrorCode(error) === "scan_target_not_found"
  );
  assert.equal(missing.readRequests.length, 0);

  const wrongProject = candidateHarness({
    target: currentTarget({
      projectId: "99999999-9999-4999-8999-999999999999",
    }),
  });
  await assert.rejects(
    verifyEvent(wrongProject.verifier, eventFixture()),
    (error) => awsErrorCode(error) === "scan_identity_mismatch"
  );

  for (const target of [
    currentTarget({ sha256: "0".repeat(64) }),
    currentTarget({ byteSize: objectBytes.byteLength + 1 }),
  ]) {
    const mismatch = candidateHarness({ target });
    await assert.rejects(
      verifyEvent(mismatch.verifier, eventFixture()),
      (error) => awsErrorCode(error) === "scan_identity_mismatch"
    );
    assert.equal(mismatch.readRequests.length, 0);
  }
});

test("exact duplicate event replays; changed fingerprint with the same ID conflicts", async () => {
  const { verifier } = candidateHarness();
  const event = eventFixture();
  const first = await verifyEvent(verifier, event);
  const duplicate = await verifyEvent(verifier, event);
  assert.equal(first.replay, "new");
  assert.equal(duplicate.replay, "duplicate");

  const changed = eventFixture({
    detail: {
      ...eventFixture().detail,
      s3ObjectDetails: {
        ...eventFixture().detail.s3ObjectDetails,
        eTag: "different-opaque-etag",
      },
    },
  });
  await assert.rejects(
    verifyEvent(verifier, changed),
    (error) => awsErrorCode(error) === "event_replay_conflict"
  );
});

test("stale event and independently mismatched bytes are denied", async () => {
  const stale = candidateHarness({ maxAgeMs: 1000 });
  await assert.rejects(
    verifyEvent(
      stale.verifier,
      eventFixture({ time: "2026-10-24T00:00:00.000Z" })
    ),
    (error) => awsErrorCode(error) === "stale_event"
  );

  const wrongBytes = candidateHarness({ bodyBytes: Buffer.from("different") });
  await assert.rejects(
    verifyEvent(wrongBytes.verifier, eventFixture()),
    (error) => awsErrorCode(error) === "scan_identity_mismatch"
  );
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(resolved);
    }
    return /\.(?:ts|tsx|js|jsx)$/u.test(entry.name) ? [resolved] : [];
  });
}

test("AWS adapters remain isolated and B3 is the only persistence consumer", () => {
  const appRoot = process.cwd();
  const awsRoot = path.join(appRoot, "lib/project-documents/aws");
  const consumerRoots = ["app", "components", "lib"]
    .map((relative) => path.join(appRoot, relative))
    .filter((directory) => {
      try {
        readdirSync(directory);
        return true;
      } catch {
        return false;
      }
    });
  const externalFiles = consumerRoots
    .flatMap(sourceFiles)
    .filter((file) => !file.startsWith(awsRoot + path.sep));
  for (const file of externalFiles) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /(?:@\/lib\/project-documents\/aws|project-documents\/aws\/)/u,
      file
    );
  }
  const allModuleFiles = sourceFiles(awsRoot).filter(
    (file) => !file.endsWith(".test.ts") && !file.endsWith("/testing.ts")
  );
  const b3Files = allModuleFiles.filter((file) =>
    file.includes(`${path.sep}b3${path.sep}`)
  );
  const moduleSources = allModuleFiles
    .filter((file) => !file.includes(`${path.sep}b3${path.sep}`))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(moduleSources, /new\s+S3Client\s*\(/u);
  assert.doesNotMatch(moduleSources, /DeleteObjectCommand|deleteObject\s*\(/u);
  assert.doesNotMatch(moduleSources, /fetch\s*\(|https?\.request\s*\(/u);
  assert.doesNotMatch(moduleSources, /\.finalizeScan\s*\(/u);
  assert.match(
    b3Files.map((file) => readFileSync(file, "utf8")).join("\n"),
    /\.finalizeScan\s*\(/u
  );
});
