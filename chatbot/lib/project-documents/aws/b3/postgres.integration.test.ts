// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions are scoped to the identity-guarded disposable PostgreSQL integration test.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { test } from "node:test";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  PostgresProjectDocumentRepository,
  type ProjectDocumentTrustedPersistencePorts,
  type VerifiedSyntheticImportConsent,
  type VerifiedSyntheticScanAttestation,
  type VerifiedSyntheticStorageResult,
} from "../../postgres-repository";
import { createProjectDocumentScanCandidateVerifier } from "../scan-candidate";
import { PostgresProjectDocumentScanTargetLookup } from "./postgres-target-lookup";
import { createB3ScanQueueWorker } from "./worker";

loadEnv({ path: resolve(".env.local") });

const databaseUrl = process.env.PHASE13_M1_1_TEST_DATABASE_URL?.trim() ?? "";
const expectedDatabase = "immigration_ai_phase13_m1_1_test";
const expectedHost = "127.0.0.1";
const expectedPort = 5432;
const skipReason = databaseUrl
  ? false
  : "PHASE13_M1_1_TEST_DATABASE_URL is not configured";

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

test(
  "B3 commits verified scan and acknowledges only after PostgreSQL replay-safe finalization",
  { skip: skipReason },
  async () => {
    const target = new URL(databaseUrl);
    assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
    assert.equal(target.pathname.slice(1), expectedDatabase);
    assert.equal(target.hostname, expectedHost);
    assert.equal(Number(target.port), expectedPort);

    const sql = postgres(databaseUrl, {
      max: 4,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
      onnotice: () => undefined,
    });
    try {
      const [identity] = await sql<
        { database: string; host: string; port: number }[]
      >`
        select current_database() as database,
          host(inet_server_addr()) as host,
          inet_server_port() as port
      `;
      assert.deepEqual(identity, {
        database: expectedDatabase,
        host: expectedHost,
        port: expectedPort,
      });
      const [schema] = await sql<
        { hasVersionColumn: boolean; migrationCount: number }[]
      >`
        select
          exists (
            select 1 from information_schema.columns
            where table_schema = 'public'
              and table_name = 'ProjectDocumentVersion'
              and column_name = 'storageObjectVersionId'
          ) as "hasVersionColumn",
          (select count(*)::integer from drizzle.__drizzle_migrations) as "migrationCount"
      `;
      assert.equal(schema?.hasVersionColumn, true);
      assert.ok((schema?.migrationCount ?? 0) >= 34);

      const label = `phase13-b3-${randomUUID()}`;
      const [user] = await sql<{ id: string }[]>`
        insert into "User" ("email", "password")
        values (${`${label}@test.invalid`}, ${"x".repeat(64)})
        returning "id"
      `;
      assert.ok(user?.id);
      const projectId = randomUUID();
      const projectOperationId = `${label}-project`;
      const projectRequestHash = sha256(`${label}-project-request`);
      const [projectOperation] = await sql<{ id: string }[]>`
        insert into "ProjectOperation"
          ("actorUserId", "operationType", "operationId", "requestHash", "resultKind", "resultId")
        values (${user.id}, 'project_create', ${projectOperationId}, ${projectRequestHash}, 'project', ${projectId})
        returning "id"
      `;
      assert.ok(projectOperation?.id);
      await sql`
        insert into "StudyJourneyProject" ("id", "ownerUserId", "revision")
        values (${projectId}, ${user.id}, 1)
      `;
      await sql`
        insert into "ProjectEvent"
          ("projectId", "actorUserId", "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId")
        values (${projectId}, ${user.id}, 1, 'project_created', 'project', ${projectId}, ${projectOperation.id})
      `;

      const documentBytes = Buffer.from(`synthetic B3 document ${label}`);
      const objectDigest = sha256(documentBytes);
      const storagePayloads = new Map<string, VerifiedSyntheticStorageResult>();
      const scanPayloads = new Map<string, VerifiedSyntheticScanAttestation>();
      const trustedPorts: ProjectDocumentTrustedPersistencePorts = {
        verifyImportConsent: async (_input, expected) =>
          ({
            ...expected,
            noticeVersion: "synthetic",
            acceptedAt: new Date().toISOString(),
          }) satisfies VerifiedSyntheticImportConsent,
        verifyGrantConsent: async () => null,
        verifyStorageResult: async (input) =>
          (typeof input === "string" ? storagePayloads.get(input) : null) ??
          null,
        verifyScanAttestation: async (input) =>
          (typeof input === "string" ? scanPayloads.get(input) : null) ?? null,
      };
      const database = drizzle(sql);
      const repository = new PostgresProjectDocumentRepository({
        database,
        trustedPorts,
      });
      const directIntent = await repository.createDirectUploadIntent({
        actorUserId: user.id,
        projectId,
        operationId: `${label}-upload`,
        expectedProjectRevision: 1,
        metadata: {
          sha256: objectDigest,
          byteSize: documentBytes.byteLength,
          canonicalMime: "application/pdf",
          formatId: "pdf",
        },
      });
      const storageKey = `project-document/${projectId}/${directIntent.assetId}/${directIntent.versionId}`;
      const objectVersionId = `synthetic-${randomUUID()}`;
      const storageToken = `${label}-storage`;
      storagePayloads.set(storageToken, {
        projectId,
        versionId: directIntent.versionId,
        generation: directIntent.generation,
        storageKey,
        sha256: objectDigest,
        byteSize: documentBytes.byteLength,
        outcome: "stored",
        objectVersionId,
      });
      await repository.finalizeStorage(storageToken);

      const config = {
        accountId: "123456789012",
        region: "ap-southeast-2",
        bucket: "phase13-project-documents-test",
        protectionPlanArn:
          "arn:aws:guardduty:ap-southeast-2:123456789012:malware-protection-plan/plan-12345678",
      };
      const occurredAt = new Date().toISOString();
      const providerEventId = `synthetic-${randomUUID()}`;
      const body = JSON.stringify({
        version: "0",
        id: providerEventId,
        time: occurredAt,
        source: "aws.guardduty",
        "detail-type": "GuardDuty Malware Protection Object Scan Result",
        account: config.accountId,
        region: config.region,
        resources: [config.protectionPlanArn],
        detail: {
          schemaVersion: "1.0",
          scanStatus: "COMPLETED",
          resourceType: "S3_OBJECT",
          s3ObjectDetails: {
            bucketName: config.bucket,
            objectKey: storageKey,
            eTag: "synthetic-not-a-hash",
            versionId: objectVersionId,
          },
          scanResultDetails: { scanResultStatus: "NO_THREATS_FOUND" },
        },
      });
      const targetLookup = new PostgresProjectDocumentScanTargetLookup({
        database,
        expectedBucket: config.bucket,
      });
      const candidateVerifier = createProjectDocumentScanCandidateVerifier({
        config,
        objectStore: {
          readVersion: async (request) => ({
            identity: {
              key: request.key,
              objectVersionId: request.objectVersionId,
              sha256: sha256(documentBytes),
              byteSize: documentBytes.byteLength,
            },
            bytes: documentBytes,
          }),
        },
        targets: targetLookup,
        replayRegistry: {
          observe: () => Promise.resolve("new"),
        },
        freshness: {
          maxAgeMs: 60_000,
          maxFutureSkewMs: 0,
          now: () => Date.now(),
        },
        env: { PHASE13_PROJECT_DOCUMENT_AWS_ADAPTERS_ENABLED: "true" },
      });
      let ackAttempts = 0;
      let ackFailurePending = true;
      let acknowledged = 0;
      let activeBody = body;
      const issuedAttestations: VerifiedSyntheticScanAttestation[] = [];
      const [projectBeforeScan] = await sql<{ revision: number }[]>`
        select "revision" from "StudyJourneyProject" where "id" = ${projectId}
      `;
      assert.ok(projectBeforeScan);
      const revisionBeforeScan = projectBeforeScan.revision;
      const worker = createB3ScanQueueWorker({
        enabled: true,
        maxMessages: 1,
        maxAttempts: 5,
        waitTimeSeconds: 0,
        maxExecutionMs: 10_000,
        transport: {
          receive: async () => [
            {
              body: activeBody,
              receiptHandle: "synthetic-receipt",
              approximateReceiveCount: 1,
              transportContext: { fakeDelivery: true },
            },
          ],
          acknowledge: () => {
            ackAttempts += 1;
            if (ackFailurePending) {
              ackFailurePending = false;
              return Promise.reject(new Error("synthetic ack failure"));
            }
            acknowledged += 1;
            return Promise.resolve();
          },
        },
        authenticator: { authenticate: async () => true },
        candidateVerifier,
        attestationIssuer: {
          issue: (candidate) => {
            const token = `${label}-scan`;
            const attestation: VerifiedSyntheticScanAttestation = {
              projectId: candidate.projectId,
              versionId: candidate.versionId,
              generation: candidate.generation,
              storageKey: candidate.objectIdentity.key,
              storageObjectVersionId: candidate.objectIdentity.objectVersionId,
              sha256: candidate.objectIdentity.sha256,
              byteSize: candidate.objectIdentity.byteSize,
              providerCode: "synthetic_guardduty",
              providerEventId: candidate.eventId,
              eventFingerprint: candidate.eventFingerprint,
              occurredAt: candidate.occurredAt,
              result: candidate.verdict,
            };
            issuedAttestations.push(attestation);
            scanPayloads.set(token, attestation);
            return Promise.resolve(token);
          },
        },
        finalizer: repository,
      });
      const signal = new AbortController().signal;
      const first = await worker.runOnce(signal);
      assert.equal(first.messages[0]?.outcome, "retryable_failure");
      assert.equal(first.messages[0]?.disposition, "retry");
      assert.equal(ackAttempts, 1);
      assert.equal(acknowledged, 0);
      const replay = await worker.runOnce(signal);
      assert.equal(replay.messages[0]?.outcome, "identical_replay");
      assert.equal(replay.messages[0]?.disposition, "ack");
      assert.equal(ackAttempts, 2);
      assert.equal(acknowledged, 1);
      assert.deepEqual(issuedAttestations[0], issuedAttestations[1]);
      activeBody = JSON.stringify({
        ...JSON.parse(body),
        syntheticReplayMutation: true,
      });
      const conflict = await worker.runOnce(signal);
      assert.equal(conflict.messages[0]?.outcome, "quarantined");
      assert.notEqual(conflict.messages[0]?.disposition, "ack");
      assert.equal(ackAttempts, 2);
      assert.equal(acknowledged, 1);
      assert.notDeepEqual(issuedAttestations[0], issuedAttestations[2]);

      const [audit] = await sql<
        {
          runs: number;
          operations: number;
          events: number;
          projectRevision: number;
          securityStatus: string;
        }[]
      >`
        select
          (select count(*)::integer from "ProjectDocumentProcessingRun" where "versionId" = ${directIntent.versionId} and "operationKind" = 'scan') as runs,
          (select count(*)::integer from "ProjectOperation" op join "ProjectDocumentProcessingRun" run on run."id" = op."resultId" where run."versionId" = ${directIntent.versionId} and op."operationType" = 'project_document_scan_finalize') as operations,
          (select count(*)::integer from "ProjectEvent" where "projectId" = ${projectId} and "eventType" = 'project_document_security_changed') as events,
          (select "revision" from "StudyJourneyProject" where "id" = ${projectId}) as "projectRevision",
          (select "securityStatus" from "ProjectDocumentVersion" where "versionId" = ${directIntent.versionId}) as "securityStatus"
      `;
      assert.deepEqual(audit, {
        runs: 1,
        operations: 1,
        events: 1,
        projectRevision: revisionBeforeScan + 1,
        securityStatus: "clean",
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);
