// biome-ignore-all lint/suspicious/noMisplacedAssertion: all database assertions belong to this guarded test.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { test } from "node:test";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createProjectFoundationRepository } from "../db/project-foundation";
import { createProjectDocumentEvidenceService } from "./evidence";
import { PostgresProjectDocumentEvidencePersistence } from "./postgres-evidence-persistence";
import {
  PostgresProjectDocumentRepository,
  type VerifiedSyntheticScanAttestation,
  type VerifiedSyntheticStorageResult,
} from "./postgres-repository";

loadEnv({ path: resolve(".env.local") });

const DATABASE_URL = process.env.PHASE13_M1_1_TEST_DATABASE_URL?.trim() ?? "";
const DATABASE = "immigration_ai_phase13_m1_1_test";
const HOST = "127.0.0.1";
const PORT = 5432;
const skipReason = DATABASE_URL
  ? false
  : "PHASE13_M1_1_TEST_DATABASE_URL is not configured";

function assertTarget(url: string) {
  const parsed = new URL(url);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.equal(parsed.pathname.slice(1), DATABASE);
  assert.equal(parsed.hostname, HOST);
  assert.equal(Number(parsed.port), PORT);
}

async function expectConstraint(
  operation: Promise<unknown>,
  constraint: string
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error && typeof error === "object");
    const postgresError = error as { code?: string; constraint_name?: string };
    assert.equal(postgresError.code, "23514");
    assert.equal(postgresError.constraint_name, constraint);
    return true;
  });
}

test(
  "A1.1 populated-schema document authorization, isolation and replay are non-destructive",
  { skip: skipReason },
  async () => {
    // Validate configuration before opening a connection or issuing writes.
    assertTarget(DATABASE_URL);
    const sql = postgres(DATABASE_URL, {
      max: 4,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
      onnotice: () => undefined,
    });
    try {
      const [identity] = await sql<
        { database: string; host: string | null; port: number }[]
      >`select current_database() as database, host(inet_server_addr()) as host, inet_server_port() as port`;
      assert.equal(identity?.database, DATABASE);
      assert.equal(identity?.host, HOST);
      assert.equal(Number(identity?.port), PORT);
      const database = drizzle(sql);
      const [latestBefore] = await sql<{ created_at: string }[]>`
        select created_at::text as created_at
        from drizzle.__drizzle_migrations
        order by created_at desc
        limit 1
      `;
      assert.ok(
        [1_793_003_518_726, 1_793_026_866_913].includes(
          Number(latestBefore?.created_at)
        ),
        "refusing to migrate from a database not at 0038 or 0039"
      );
      const migrationDirectory = resolve("lib/db/migrations");
      if (Number(latestBefore?.created_at) === 1_793_003_518_726) {
        await migrate(database, { migrationsFolder: migrationDirectory });
      }
      const [latestAfter] = await sql<{ created_at: string }[]>`
        select created_at::text as created_at
        from drizzle.__drizzle_migrations
        order by created_at desc
        limit 1
      `;
      assert.equal(Number(latestAfter?.created_at), 1_793_026_866_913);
      const [schema] = await sql<
        { project: string | null; asset: string | null }[]
      >`
        select to_regclass('public."StudyJourneyProject"')::text as project,
               to_regclass('public."ProjectDocumentAsset"')::text as asset
      `;
      assert.ok(schema?.project);
      assert.ok(schema?.asset);

      const user = async (label: string) => {
        const email = `${label.slice(0, 8)}-${randomUUID().replaceAll("-", "").slice(0, 16)}@e.test`;
        const [row] = await sql<{ id: string }[]>`
          insert into "User" ("email", "password") values (${email}, ${"x".repeat(64)}) returning "id"
        `;
        assert.ok(row?.id);
        return row.id;
      };
      const ownerId = await user("a13-doc-owner");
      const memberId = await user("a13-doc-member");
      const outsiderId = await user("a13-doc-outsider");
      const foundation = createProjectFoundationRepository({ database });
      const projectOperationId = `a13-doc-project-${randomUUID()}`;
      const created = await foundation.createProject({
        actorUserId: ownerId,
        operationId: projectOperationId,
      });
      const [projectOperation] = await sql<{ id: string }[]>`
        select "id" from "ProjectOperation" where "operationId" = ${projectOperationId}
      `;
      assert.ok(projectOperation?.id);
      const projectId = created.project.id;
      await sql`
        insert into "ProjectMembership" ("projectId", "userId", "status", "invitedByUserId", "acceptedAt")
        values (${projectId}, ${memberId}, 'active', ${ownerId}, now())
      `;

      const storageResults = new Map<string, VerifiedSyntheticStorageResult>();
      const scanAttestations = new Map<
        string,
        VerifiedSyntheticScanAttestation
      >();
      const repository = new PostgresProjectDocumentRepository({
        database,
        trustedPorts: {
          verifyImportConsent: async () => null,
          verifyGrantConsent: async (value, expected) =>
            ({
              ...expected,
              noticeVersion: "synthetic-test-notice-v1",
              acceptedAt: "2026-10-26T00:00:00.000Z",
              ...(typeof value === "object" && value !== null ? value : {}),
            }) as never,
          verifyStorageResult: async (value) =>
            typeof value === "string"
              ? (storageResults.get(value) ?? null)
              : null,
          verifyScanAttestation: async (value) =>
            typeof value === "string"
              ? (scanAttestations.get(value) ?? null)
              : null,
        },
      });
      const content = "synthetic document fixture";
      const metadata = {
        sha256: createHash("sha256").update(content).digest("hex"),
        byteSize: Buffer.byteLength(content),
        canonicalMime: "text/plain",
        formatId: "txt",
      };
      const uploadOperationId = `a13-doc-upload-${randomUUID()}`;
      const input = {
        actorUserId: ownerId,
        projectId,
        operationId: uploadOperationId,
        expectedProjectRevision: created.project.revision,
        metadata,
      };
      const first = await repository.createDirectUploadIntent(input);
      const replay = await repository.createDirectUploadIntent(input);
      assert.equal(first.replayed, false);
      assert.equal(replay.replayed, true);
      assert.equal(replay.assetId, first.assetId);
      assert.equal(replay.versionId, first.versionId);
      assert.equal(first.storageStatus, "pending");
      assert.equal(first.securityStatus, "pending");
      await assert.rejects(
        repository.authorizeExactVersionRead({
          actorUserId: ownerId,
          projectId,
          assetId: first.assetId,
          versionId: first.versionId,
          purpose: "content_read",
        }),
        { code: "project_forbidden" }
      );
      let readAttempted = false;
      const evidence = createProjectDocumentEvidenceService({
        persistence: new PostgresProjectDocumentEvidencePersistence(
          database,
          async () => null
        ),
        reader: {
          readExactVersion: () => {
            readAttempted = true;
            throw new Error("pending version must never be read");
          },
        },
        verifyAuthenticatedScan: async () => null,
      });
      await assert.rejects(
        evidence.extract({
          actorUserId: ownerId,
          projectId,
          assetId: first.assetId,
          versionId: first.versionId,
          operationId: `a13-doc-pending-extract-${randomUUID()}`,
          expectedProjectRevision: first.projectRevision,
        }),
        { code: "source_unavailable" }
      );
      assert.equal(readAttempted, false);

      const storageKey = `project-document/${projectId}/${first.assetId}/${first.versionId}`;
      const objectVersionId = `synthetic-object-version-${randomUUID()}`;
      const validStorage: VerifiedSyntheticStorageResult = {
        projectId,
        versionId: first.versionId,
        generation: first.generation,
        storageKey,
        sha256: metadata.sha256,
        byteSize: metadata.byteSize,
        outcome: "stored",
        objectVersionId,
      };
      await assert.rejects(
        repository.finalizeStorage("unissued-forged-token"),
        {
          code: "worker_untrusted",
        }
      );
      const mismatchedStorageToken = randomUUID();
      storageResults.set(mismatchedStorageToken, {
        ...validStorage,
        storageKey: `${storageKey}/wrong-source`,
      });
      await assert.rejects(repository.finalizeStorage(mismatchedStorageToken), {
        code: "state_conflict",
      });
      const storageToken = randomUUID();
      storageResults.set(storageToken, validStorage);
      const stored = await repository.finalizeStorage(storageToken);
      const storageReplay = await repository.finalizeStorage(storageToken);
      assert.equal(stored.status, "stored");
      assert.equal(stored.securityStatus, "pending");
      assert.equal(stored.replayed, false);
      assert.equal(storageReplay.replayed, true);
      assert.equal(storageReplay.projectRevision, stored.projectRevision);
      const [storageAudit] = await sql<
        {
          operations: string;
          events: string;
          operationActorKind: string;
          operationPrincipal: string | null;
          eventActorKind: string;
          eventPrincipal: string | null;
        }[]
      >`
        select count(distinct op."id")::text as operations,
          count(event."id")::text as events,
          min(op."actorKind") as "operationActorKind",
          min(op."servicePrincipalCode") as "operationPrincipal",
          min(event."actorKind") as "eventActorKind",
          min(event."servicePrincipalCode") as "eventPrincipal"
        from "ProjectOperation" op
        left join "ProjectEvent" event on event."operationRecordId" = op."id"
        where op."operationId" = ${stored.operationId}
      `;
      assert.equal(storageAudit?.operations, "1");
      assert.equal(storageAudit?.events, "1");
      assert.equal(storageAudit?.operationActorKind, "service");
      assert.equal(
        storageAudit?.operationPrincipal,
        "project_document_storage_worker"
      );
      assert.equal(storageAudit?.eventActorKind, "service");
      assert.equal(
        storageAudit?.eventPrincipal,
        "project_document_storage_worker"
      );

      await assert.rejects(
        repository.finalizeScan("unissued-forged-scan-token"),
        {
          code: "worker_untrusted",
        }
      );
      const mismatchedScanToken = randomUUID();
      scanAttestations.set(mismatchedScanToken, {
        projectId,
        versionId: randomUUID(),
        generation: first.generation,
        storageKey,
        storageObjectVersionId: objectVersionId,
        sha256: metadata.sha256,
        byteSize: metadata.byteSize,
        providerCode: "synthetic_test_scanner",
        providerEventId: `synthetic-${randomUUID()}`,
        occurredAt: new Date().toISOString(),
        result: "clean",
      });
      await assert.rejects(repository.finalizeScan(mismatchedScanToken), {
        code: "state_conflict",
      });
      const mismatchedObjectToken = randomUUID();
      scanAttestations.set(mismatchedObjectToken, {
        projectId,
        versionId: first.versionId,
        generation: first.generation,
        storageKey,
        storageObjectVersionId: `wrong-${objectVersionId}`,
        sha256: metadata.sha256,
        byteSize: metadata.byteSize,
        providerCode: "synthetic_test_scanner",
        providerEventId: `synthetic-${randomUUID()}`,
        occurredAt: new Date().toISOString(),
        result: "clean",
      });
      await assert.rejects(repository.finalizeScan(mismatchedObjectToken), {
        code: "state_conflict",
      });
      const scanToken = randomUUID();
      scanAttestations.set(scanToken, {
        projectId,
        versionId: first.versionId,
        generation: first.generation,
        storageKey,
        storageObjectVersionId: objectVersionId,
        sha256: metadata.sha256,
        byteSize: metadata.byteSize,
        providerCode: "synthetic_test_scanner",
        providerEventId: `synthetic-${randomUUID()}`,
        occurredAt: new Date().toISOString(),
        result: "clean",
      });
      const scanned = await repository.finalizeScan(scanToken);
      const scanReplay = await repository.finalizeScan(scanToken);
      assert.equal(scanned.securityStatus, "clean");
      assert.equal(scanReplay.replayed, true);
      assert.equal(scanReplay.projectRevision, scanned.projectRevision);
      const [scanAudit] = await sql<
        {
          runs: string;
          operations: string;
          events: string;
          operationActorKind: string;
          operationPrincipal: string | null;
          eventActorKind: string;
          eventPrincipal: string | null;
        }[]
      >`
        select
          (select count(*) from "ProjectDocumentProcessingRun" where "projectId" = ${projectId} and "versionId" = ${first.versionId} and "operationKind" = 'scan')::text as runs,
          count(distinct op."id")::text as operations,
          count(event."id")::text as events,
          min(op."actorKind") as "operationActorKind",
          min(op."servicePrincipalCode") as "operationPrincipal",
          min(event."actorKind") as "eventActorKind",
          min(event."servicePrincipalCode") as "eventPrincipal"
        from "ProjectOperation" op
        left join "ProjectEvent" event on event."operationRecordId" = op."id"
        where op."operationId" = ${scanned.operationId}
      `;
      assert.equal(scanAudit?.runs, "1");
      assert.equal(scanAudit?.operations, "1");
      assert.equal(scanAudit?.events, "1");
      assert.equal(scanAudit?.operationActorKind, "service");
      assert.equal(
        scanAudit?.operationPrincipal,
        "project_document_scan_worker"
      );
      assert.equal(scanAudit?.eventActorKind, "service");
      assert.equal(scanAudit?.eventPrincipal, "project_document_scan_worker");

      const extractGrant = await repository.createCreatorGrant({
        actorUserId: ownerId,
        projectId,
        assetId: first.assetId,
        versionId: first.versionId,
        operationId: `a13-doc-extract-grant-${randomUUID()}`,
        expectedProjectRevision: scanned.projectRevision,
        purpose: "extract",
        acknowledgement: { accepted: true },
      });
      const evidencePersistence =
        new PostgresProjectDocumentEvidencePersistence(
          database,
          async ({ source }) => ({
            authenticated: true,
            verdict: "clean",
            projectId: source.projectId,
            versionId: source.versionId,
            generation: source.generation,
            objectVersionId: source.objectVersionId ?? "",
            sha256: source.sha256,
          })
        );
      const makeEvidenceService = () =>
        createProjectDocumentEvidenceService({
          persistence: evidencePersistence,
          reader: {
            readExactVersion: (request) => {
              assert.equal(request.storageKey, storageKey);
              assert.equal(request.objectVersionId, objectVersionId);
              assert.equal(request.expectedSha256, metadata.sha256);
              assert.equal(request.expectedByteSize, metadata.byteSize);
              return Promise.resolve(Buffer.from(content, "utf8"));
            },
          },
          verifyAuthenticatedScan: async ({ source }) => ({
            authenticated: true,
            verdict: "clean",
            projectId: source.projectId,
            versionId: source.versionId,
            generation: source.generation,
            objectVersionId: source.objectVersionId ?? "",
            sha256: source.sha256,
          }),
        });
      const extractInput = (operationId: string) => ({
        actorUserId: ownerId,
        projectId,
        assetId: first.assetId,
        versionId: first.versionId,
        operationId,
        expectedProjectRevision: extractGrant.projectRevision,
      });
      let mismatchedReaderCalled = false;
      const mismatchedEvidence = createProjectDocumentEvidenceService({
        persistence: evidencePersistence,
        reader: {
          readExactVersion: () => {
            mismatchedReaderCalled = true;
            throw new Error(
              "mismatched scan evidence must fail before reading"
            );
          },
        },
        verifyAuthenticatedScan: async ({ source }) => ({
          authenticated: true,
          verdict: "clean",
          projectId: source.projectId,
          versionId: source.versionId,
          generation: source.generation,
          objectVersionId: `wrong-${source.objectVersionId}`,
          sha256: source.sha256,
        }),
      });
      await assert.rejects(
        mismatchedEvidence.extract(
          extractInput(`a13-doc-bad-proof-${randomUUID()}`)
        ),
        { code: "scan_unverified" }
      );
      assert.equal(mismatchedReaderCalled, false);
      const extracted = await makeEvidenceService().extract(
        extractInput(`a13-doc-extract-${randomUUID()}`)
      );
      assert.equal(extracted.status, "complete");
      assert.ok(extracted.candidates.length > 0);
      const refs = await makeEvidenceService().issueEvidenceRefs({
        actorUserId: ownerId,
        projectId,
        runId: extracted.id,
      });
      assert.ok(refs.length > 0);
      assert.ok(
        await makeEvidenceService().resolveEvidenceRef({
          actorUserId: ownerId,
          projectId,
          evidenceRef: refs[0] ?? "",
        })
      );
      assert.equal(
        await makeEvidenceService().resolveEvidenceRef({
          actorUserId: memberId,
          projectId,
          evidenceRef: refs[0] ?? "",
        }),
        null
      );
      const [afterExtract] = await sql<{ revision: number }[]>`
        select "revision" from "StudyJourneyProject" where "id" = ${projectId}
      `;
      assert.ok(afterExtract);
      const [storageOperation] = await sql<{ id: string }[]>`
        select "id" from "ProjectOperation" where "operationId" = ${stored.operationId}
      `;
      assert.ok(storageOperation?.id);
      await expectConstraint(
        sql`
          insert into "ProjectEvent" (
            "projectId", "actorKind", "actorUserId", "servicePrincipalCode",
            "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId"
          ) values (
            ${projectId}, 'service', null, 'project_document_storage_worker',
            ${afterExtract.revision}, 'project_fact_changed', 'project_fact_assertion',
            ${randomUUID()}, ${storageOperation.id}
          )
        `,
        "ProjectRound2Event_actor_match"
      );
      await expectConstraint(
        sql`
          insert into "ProjectEvent" (
            "projectId", "actorKind", "actorUserId", "servicePrincipalCode",
            "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId"
          ) values (
            ${projectId}, 'service', null, 'project_document_storage_worker',
            ${afterExtract.revision}, 'project_evidence_extraction_completed',
            'document_extraction_run', ${randomUUID()}, ${storageOperation.id}
          )
        `,
        "ProjectRound2Event_actor_match"
      );
      await expectConstraint(
        sql`
          insert into "ProjectEvent" (
            "projectId", "actorKind", "actorUserId", "servicePrincipalCode",
            "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId"
          ) values (
            ${projectId}, 'user', ${ownerId}, null,
            ${afterExtract.revision}, 'project_fact_changed', 'project_fact_assertion',
            ${randomUUID()}, ${projectOperation.id}
          )
        `,
        "ProjectFactEvent_operation_match"
      );
      await expectConstraint(
        sql`
          insert into "ProjectEvent" (
            "projectId", "actorKind", "actorUserId", "servicePrincipalCode",
            "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId"
          ) values (
            ${projectId}, 'user', ${ownerId}, null,
            ${afterExtract.revision}, 'project_evidence_extraction_completed',
            'document_extraction_run', ${randomUUID()}, ${projectOperation.id}
          )
        `,
        "ProjectEvidenceEvent_operation_match"
      );
      const extractionRevoked = await repository.revokeCreatorGrant({
        actorUserId: ownerId,
        projectId,
        grantId: extractGrant.grantId,
        operationId: `a13-doc-extract-revoke-${randomUUID()}`,
        expectedProjectRevision: afterExtract.revision,
      });
      await assert.rejects(
        makeEvidenceService().extract(
          extractInput(`a13-doc-revoked-extract-${randomUUID()}`)
        ),
        { code: "forbidden" }
      );

      const grant = await repository.createCreatorGrant({
        actorUserId: ownerId,
        projectId,
        assetId: first.assetId,
        versionId: first.versionId,
        operationId: `a13-doc-grant-${randomUUID()}`,
        expectedProjectRevision: extractionRevoked.projectRevision,
        purpose: "metadata_read",
        acknowledgement: { accepted: true },
      });
      assert.equal(
        (
          await repository.listGrantedMetadata({
            actorUserId: ownerId,
            projectId,
          })
        ).length,
        1
      );
      assert.equal(
        (
          await repository.listGrantedMetadata({
            actorUserId: memberId,
            projectId,
          })
        ).length,
        0
      );
      await assert.rejects(
        repository.listGrantedMetadata({ actorUserId: outsiderId, projectId }),
        { code: "project_forbidden" }
      );
      await assert.rejects(
        repository.authorizeExactVersionRead({
          actorUserId: ownerId,
          projectId,
          assetId: first.assetId,
          versionId: first.versionId,
          purpose: "content_read",
        }),
        { code: "project_forbidden" }
      );
      const revokeOperationId = `a13-doc-revoke-${randomUUID()}`;
      await repository.revokeCreatorGrant({
        actorUserId: ownerId,
        projectId,
        grantId: grant.grantId,
        operationId: revokeOperationId,
        expectedProjectRevision: grant.projectRevision,
      });
      const revokeReplay = await repository.revokeCreatorGrant({
        actorUserId: ownerId,
        projectId,
        grantId: grant.grantId,
        operationId: revokeOperationId,
        expectedProjectRevision: grant.projectRevision,
      });
      assert.equal(revokeReplay.replayed, true);
      assert.equal(
        (
          await repository.listGrantedMetadata({
            actorUserId: ownerId,
            projectId,
          })
        ).length,
        0
      );
      const withdrawn = await repository.withdrawDocument({
        actorUserId: ownerId,
        projectId,
        assetId: first.assetId,
        operationId: `a13-doc-withdraw-${randomUUID()}`,
        expectedProjectRevision: revokeReplay.projectRevision,
      });
      assert.equal(withdrawn.lifecycle, "withdrawn");
      await assert.rejects(
        makeEvidenceService().extract(
          extractInput(`a13-doc-withdrawn-extract-${randomUUID()}`)
        ),
        { code: "source_unavailable" }
      );
      const [counts] = await sql<{ assets: string; versions: string }[]>`
        select (select count(*) from "ProjectDocumentAsset" where "projectId" = ${projectId})::text as assets,
               (select count(*) from "ProjectDocumentVersion" where "projectId" = ${projectId})::text as versions
      `;
      assert.equal(counts?.assets, "1");
      assert.equal(counts?.versions, "1");
    } finally {
      await sql.end();
    }
  }
);
