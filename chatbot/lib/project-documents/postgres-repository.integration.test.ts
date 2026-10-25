// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions are scoped to a guarded disposable PostgreSQL test.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createProjectFoundationRepository } from "../db/project-foundation";
import {
  PostgresProjectDocumentRepository,
  ProjectDocumentPersistenceError,
  type ProjectDocumentPostgresTestHooks,
  type ProjectDocumentTrustedPersistencePorts,
  type ScanAttestationExpectation,
  type StorageResultExpectation,
  type VerifiedSyntheticImportConsent,
  type VerifiedSyntheticScanAttestation,
  type VerifiedSyntheticStorageResult,
} from "./postgres-repository";

loadEnv({ path: resolve(".env.local") });

const TEST_DATABASE_URL =
  process.env.PHASE13_M1_1_TEST_DATABASE_URL?.trim() ?? "";
const EXPECTED_DATABASE = "immigration_ai_phase13_m1_1_test";
const EXPECTED_MIGRATION_HEAD = "0033_phase13_m2_a1_2_b1_audit_protection";
const EXPECTED_HOST = "127.0.0.1";
const EXPECTED_PORT = 5432;
const CONSENT_AT = "2026-10-25T00:00:00.000Z";
const IMPORT_ACK = "synthetic-import-ack";
const GRANT_ACK = "synthetic-grant-ack";
const SCAN_AT = "2026-10-25T00:01:00.000Z";
const skipReason = TEST_DATABASE_URL
  ? false
  : "PHASE13_M1_1_TEST_DATABASE_URL is not configured (isolated database required)";

type TestSql = ReturnType<typeof postgres>;
type QueryParameter = string | number | boolean | null;

function assertConfiguredTarget(url: string) {
  const parsed = new URL(url);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.equal(
    parsed.pathname.replace(/^\//u, ""),
    EXPECTED_DATABASE,
    "refusing a migration against a database with the wrong configured name"
  );
  assert.equal(
    parsed.hostname,
    EXPECTED_HOST,
    "refusing a migration against a database with the wrong configured host"
  );
  assert.equal(
    Number(parsed.port),
    EXPECTED_PORT,
    "refusing a migration against a database with the wrong configured port"
  );
}

async function rows<T>(
  sql: TestSql,
  statement: string,
  parameters: QueryParameter[] = []
): Promise<T[]> {
  return await sql.unsafe<T[]>(statement, parameters);
}

async function count(
  sql: TestSql,
  statement: string,
  parameters: QueryParameter[] = []
): Promise<number> {
  const [row] = await rows<{ count: string }>(sql, statement, parameters);
  return Number(row?.count ?? "0");
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function operationId(label: string) {
  return `${label}-${randomUUID()}`;
}

function metadata(value: string, byteSize = value.length) {
  return {
    sha256: digest(value),
    byteSize,
    canonicalMime: "application/pdf",
    formatId: "pdf",
  };
}

function isPostgresError(
  error: unknown
): error is { code?: unknown; constraint_name?: unknown } {
  return typeof error === "object" && error !== null;
}

async function expectConstraint(
  operation: Promise<unknown>,
  code: string,
  constraint?: string
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(isPostgresError(error));
    assert.equal(error.code, code);
    if (constraint) {
      assert.equal(error.constraint_name, constraint);
    }
    return true;
  });
}

async function expectPersistenceCode(
  operation: Promise<unknown>,
  code: ProjectDocumentPersistenceError["code"]
) {
  await assert.rejects(
    operation,
    (error: unknown) =>
      error instanceof ProjectDocumentPersistenceError && error.code === code
  );
}

async function insertUser(sql: TestSql, label: string) {
  const [row] = await rows<{ id: string }>(
    sql,
    'insert into "User" ("email", "password") values ($1, $2) returning "id"',
    [
      label +
        "-" +
        randomUUID().replaceAll("-", "").slice(0, 20) +
        "@test.invalid",
      "x".repeat(64),
    ]
  );
  assert.ok(row?.id);
  return row.id;
}

async function insertProject(sql: TestSql, ownerUserId: string) {
  const projectId = randomUUID();
  const operationKey = operationId("phase13-a11-project-create");
  const [operation] = await rows<{ id: string }>(
    sql,
    'insert into "ProjectOperation" ("actorUserId", "operationType", "operationId", "requestHash", "resultKind", "resultId") values ($1, $2, $3, $4, $5, $6) returning "id"',
    [
      ownerUserId,
      "project_create",
      operationKey,
      "a".repeat(64),
      "project",
      projectId,
    ]
  );
  assert.ok(operation?.id);
  await rows(
    sql,
    'insert into "StudyJourneyProject" ("id", "ownerUserId", "revision") values ($1, $2, 1)',
    [projectId, ownerUserId]
  );
  await rows(
    sql,
    'insert into "ProjectEvent" ("projectId", "actorUserId", "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId") values ($1, $2, 1, $3, $4, $5, $6)',
    [
      projectId,
      ownerUserId,
      "project_created",
      "project",
      projectId,
      operation.id,
    ]
  );
  return { projectId, operationRecordId: operation.id, operationKey };
}

async function activateMembership(
  sql: TestSql,
  input: { projectId: string; userId: string; ownerUserId: string }
) {
  const [row] = await rows<{ id: string }>(
    sql,
    'insert into "ProjectMembership" ("projectId", "userId", "status", "invitedByUserId", "acceptedAt") values ($1, $2, $3, $4, now()) returning "id"',
    [input.projectId, input.userId, "active", input.ownerUserId]
  );
  assert.ok(row?.id);
  return row.id;
}

async function seedOwnedChatDocument(
  sql: TestSql,
  ownerUserId: string,
  contentLabel: string
) {
  const chatId = randomUUID();
  const documentId = randomUUID();
  const sourceSha256 = digest(contentLabel);
  const now = new Date().toISOString();
  await rows(
    sql,
    'insert into "Chat" ("id", "createdAt", "title", "userId", "visibility") values ($1, $2, $3, $4, $5)',
    [chatId, now, "Synthetic Phase 13 source", ownerUserId, "private"]
  );
  await rows(
    sql,
    'insert into "ImmigrationConversation" ("chatId", "legalMatterId", "title", "createdAt", "updatedAt") values ($1, null, $2, $3, $3)',
    [chatId, "Synthetic Phase 13 source", now]
  );
  await rows(
    sql,
    'insert into "MatterDocument" ("id", "userId", "chatId", "originalFilename", "storageKey", "mimeType", "byteSize", "sha256", "storageStatus", "securityStatus") values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [
      documentId,
      ownerUserId,
      chatId,
      "synthetic.pdf",
      `synthetic/phase13/${documentId}`,
      "application/pdf",
      contentLabel.length,
      sourceSha256,
      "stored",
      "clean",
    ]
  );
  return {
    chatId,
    documentId,
    sha256: sourceSha256,
    byteSize: contentLabel.length,
  };
}

function createRepository(
  database: ReturnType<typeof drizzle>,
  hooks?: ProjectDocumentPostgresTestHooks,
  sharedPayloads?: {
    storagePayloads: Map<string, VerifiedSyntheticStorageResult>;
    scanPayloads: Map<string, VerifiedSyntheticScanAttestation>;
  }
) {
  const storagePayloads =
    sharedPayloads?.storagePayloads ??
    new Map<string, VerifiedSyntheticStorageResult>();
  const scanPayloads =
    sharedPayloads?.scanPayloads ??
    new Map<string, VerifiedSyntheticScanAttestation>();
  const trustedPorts: ProjectDocumentTrustedPersistencePorts = {
    verifyImportConsent(input, expected) {
      if (input !== IMPORT_ACK) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        ...expected,
        noticeVersion: "synthetic-import-notice-v1",
        acceptedAt: CONSENT_AT,
      } satisfies VerifiedSyntheticImportConsent);
    },
    verifyGrantConsent(input, expected) {
      if (input !== GRANT_ACK) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        ...expected,
        noticeVersion: "synthetic-grant-notice-v1",
        acceptedAt: CONSENT_AT,
      });
    },
    verifyStorageResult(input) {
      return Promise.resolve(
        typeof input === "string" ? (storagePayloads.get(input) ?? null) : null
      );
    },
    verifyScanAttestation(input) {
      return Promise.resolve(
        typeof input === "string" ? (scanPayloads.get(input) ?? null) : null
      );
    },
  };
  return {
    repository: new PostgresProjectDocumentRepository({
      database,
      trustedPorts,
      testHooks: hooks,
    }),
    storagePayloads,
    scanPayloads,
  };
}

function storageResult(input: {
  projectId: string;
  versionId: string;
  generation: number;
  storageKey: string;
  sha256: string;
  byteSize: number;
  outcome: StorageResultExpectation["outcome"];
  objectVersionId?: string;
  errorCode?: string;
}): VerifiedSyntheticStorageResult {
  return input;
}

function scanAttestation(input: {
  projectId: string;
  versionId: string;
  generation: number;
  storageKey: string;
  storageObjectVersionId: string;
  sha256: string;
  byteSize: number;
  providerCode: string;
  providerEventId: string;
  result: ScanAttestationExpectation["result"];
}): VerifiedSyntheticScanAttestation {
  return { ...input, occurredAt: SCAN_AT };
}

async function insertAuditedSyntheticScanFixture(
  sql: TestSql,
  input: {
    projectId: string;
    versionId: string;
    generation: number;
    sha256: string;
    result: "clean" | "rejected" | "failed";
  }
) {
  const runId = randomUUID();
  const eventFingerprint = digest(
    `synthetic-audited-scan-fixture:${JSON.stringify(input)}:${runId}`
  );
  const operationId = digest(`synthetic-scan-operation:${runId}`);
  const requestHash = digest(`synthetic-scan-request:${runId}`);
  const startedAt = new Date(Date.now() - 1000);
  const completedAt = new Date();
  const runStatus = input.result === "failed" ? "failed" : "completed";
  const verdict = input.result === "failed" ? null : input.result;
  const errorCode = input.result === "failed" ? "synthetic_scan_failure" : null;

  await sql.begin(async (tx) => {
    await tx.unsafe(
      'insert into "ProjectDocumentProcessingRun" ("id", "projectId", "versionId", "generation", "operationKind", "providerCode", "providerEventId", "initiatedByUserId", "servicePrincipalCode", "objectSha256", "eventFingerprint", "status", "verdict", "startedAt", "completedAt", "errorCode") values ($1, $2, $3, $4, $5, $6, $7, null, $8, $9, $10, \'started\', null, $11, null, null)',
      [
        runId,
        input.projectId,
        input.versionId,
        input.generation,
        "scan",
        "synthetic_test_scanner",
        `synthetic-fixture-${runId}`,
        "project_document_scan_worker",
        input.sha256,
        eventFingerprint,
        startedAt.toISOString(),
      ]
    );
    await tx.unsafe(
      'update "ProjectDocumentProcessingRun" set "status" = $2, "verdict" = $3, "completedAt" = $4, "errorCode" = $5 where "id" = $1',
      [runId, runStatus, verdict, completedAt.toISOString(), errorCode]
    );
    const [project] = await tx.unsafe<{ revision: number }[]>(
      'select "revision" from "StudyJourneyProject" where "id" = $1 for update',
      [input.projectId]
    );
    assert.ok(project);
    const projectRevision = Number(project.revision) + 1;
    await tx.unsafe(
      'update "StudyJourneyProject" set "revision" = $2 where "id" = $1',
      [input.projectId, projectRevision]
    );
    const [operation] = await tx.unsafe<{ id: string }[]>(
      'insert into "ProjectOperation" ("actorKind", "actorUserId", "servicePrincipalCode", "operationType", "operationId", "requestHash", "resultKind", "resultId") values ($1, null, $2, $3, $4, $5, $6, $7) returning "id"',
      [
        "service",
        "project_document_scan_worker",
        "project_document_scan_finalize",
        operationId,
        requestHash,
        "document_scan_run",
        runId,
      ]
    );
    assert.ok(operation?.id);
    await tx.unsafe(
      'insert into "ProjectEvent" ("projectId", "actorKind", "actorUserId", "servicePrincipalCode", "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId") values ($1, $2, null, $3, $4, $5, $6, $7, $8)',
      [
        input.projectId,
        "service",
        "project_document_scan_worker",
        projectRevision,
        "project_document_security_changed",
        "document_scan_run",
        runId,
        operation.id,
      ]
    );
  });

  return runId;
}

function directInput(input: {
  actorUserId: string;
  projectId: string;
  operationId: string;
  expectedProjectRevision: number;
  fileLabel?: string;
}) {
  const fileLabel = input.fileLabel ?? "synthetic direct upload";
  return {
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    operationId: input.operationId,
    expectedProjectRevision: input.expectedProjectRevision,
    metadata: metadata(fileLabel),
  };
}

async function projectRevision(sql: TestSql, projectId: string) {
  const [row] = await rows<{ revision: number }>(
    sql,
    'select "revision" from "StudyJourneyProject" where "id" = $1',
    [projectId]
  );
  assert.ok(row);
  return row.revision;
}

async function assertNoOperation(sql: TestSql, operationKey: string) {
  assert.equal(
    await count(
      sql,
      'select count(*)::text as count from "ProjectOperation" where "operationId" = $1',
      [operationKey]
    ),
    0
  );
}

async function assertOneDocumentEvent(
  sql: TestSql,
  operationKey: string,
  expectedActorKind: "user" | "service",
  expectedPrincipal: string | null
) {
  const [row] = await rows<{
    operations: string;
    events: string;
    actorKind: string;
    servicePrincipalCode: string | null;
    actorUserId: string | null;
  }>(
    sql,
    'select count(distinct op."id")::text as operations, count(ev."id")::text as events, min(ev."actorKind") as "actorKind", min(ev."servicePrincipalCode") as "servicePrincipalCode", min(ev."actorUserId"::text) as "actorUserId" from "ProjectOperation" op left join "ProjectEvent" ev on ev."operationRecordId" = op."id" where op."operationId" = $1',
    [operationKey]
  );
  assert.equal(row?.operations, "1");
  assert.equal(row?.events, "1");
  assert.equal(row?.actorKind, expectedActorKind);
  assert.equal(row?.servicePrincipalCode, expectedPrincipal);
  if (expectedActorKind === "service") {
    assert.equal(row?.actorUserId, null);
  }
}

async function assertProjectEventLedger(sql: TestSql, projectId: string) {
  const [row] = await rows<{
    revision: number;
    eventCount: string;
    distinctRevisions: string;
    maxEventRevision: number;
  }>(
    sql,
    'select p."revision", count(e."id")::text as "eventCount", count(distinct e."projectRevision")::text as "distinctRevisions", max(e."projectRevision") as "maxEventRevision" from "StudyJourneyProject" p left join "ProjectEvent" e on e."projectId" = p."id" where p."id" = $1 group by p."id"',
    [projectId]
  );
  assert.ok(row);
  assert.equal(Number(row.eventCount), row.revision);
  assert.equal(Number(row.distinctRevisions), row.revision);
  assert.equal(row.maxEventRevision, row.revision);
}

function collectSourceFiles(directory: string): Promise<string[]> {
  return readdir(directory, { withFileTypes: true }).then((entries) =>
    Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          return collectSourceFiles(path);
        }
        return Promise.resolve(
          /\.(?:ts|tsx|js|jsx)$/u.test(entry.name) ? [path] : []
        );
      })
    ).then((nested) => nested.flat())
  );
}

test(
  "M2-A1.1 durable repository and 0032 work only on the guarded disposable PostgreSQL target",
  { skip: skipReason },
  async (t) => {
    assertConfiguredTarget(TEST_DATABASE_URL);
    const statements: string[] = [];
    const sql = postgres(TEST_DATABASE_URL, {
      max: 12,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
      onnotice: () => undefined,
      debug: (_connection, query) => statements.push(query),
    });
    const database = drizzle(sql);
    const userIds: string[] = [];
    const projectIds: string[] = [];

    try {
      const [identity] = await rows<{
        database: string;
        host: string | null;
        port: number;
        serverVersion: string;
      }>(
        sql,
        "select current_database() as database, host(inet_server_addr()) as host, inet_server_port() as port, current_setting('server_version_num') as \"serverVersion\""
      );
      assert.equal(identity?.database, EXPECTED_DATABASE);
      assert.equal(identity?.host, EXPECTED_HOST);
      assert.equal(Number(identity?.port), EXPECTED_PORT);
      assert.ok(Number(identity?.serverVersion) >= 140_000);
      const [initial] = await rows<{ tables: string; hasLedger: boolean }>(
        sql,
        "select (select count(*)::text from information_schema.tables where table_schema = 'public') as tables, to_regclass('drizzle.__drizzle_migrations') is not null as \"hasLedger\""
      );
      assert.equal(initial?.tables, "0", "run the guarded test-db reset first");
      assert.equal(initial?.hasLedger, false);

      const migrationDirectory = resolve("lib/db/migrations");
      const journalPath = join(migrationDirectory, "meta", "_journal.json");
      const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
        entries: Array<{ idx: number; tag: string }>;
      };
      assert.equal(journal.entries.at(-1)?.tag, EXPECTED_MIGRATION_HEAD);
      assert.equal(journal.entries.at(-1)?.idx, 33);
      await migrate(database, { migrationsFolder: migrationDirectory });
      assert.equal(
        await count(
          sql,
          "select count(*)::text as count from drizzle.__drizzle_migrations"
        ),
        journal.entries.length
      );

      const ownerId = await insertUser(sql, "phase13-a11-owner");
      userIds.push(ownerId);
      const memberId = await insertUser(sql, "phase13-a11-member");
      userIds.push(memberId);
      const secondOwnerId = await insertUser(sql, "phase13-a11-owner-two");
      userIds.push(secondOwnerId);
      const outsiderId = await insertUser(sql, "phase13-a11-outsider");
      userIds.push(outsiderId);
      const primary = await insertProject(sql, ownerId);
      projectIds.push(primary.projectId);
      const closedProject = await insertProject(sql, secondOwnerId);
      projectIds.push(closedProject.projectId);
      const membershipId = await activateMembership(sql, {
        projectId: primary.projectId,
        userId: memberId,
        ownerUserId: ownerId,
      });
      const source = await seedOwnedChatDocument(
        sql,
        memberId,
        "member source bytes"
      );
      const harness = createRepository(database);
      const projectRepository = createProjectFoundationRepository({
        database,
      });

      await t.test(
        "migration 0032 and legacy M1 user rows remain compatible",
        async () => {
          const [columns] = await rows<{
            actorKind: string;
            servicePrincipalCode: string | null;
          }>(
            sql,
            'select "actorKind", "servicePrincipalCode" from "ProjectOperation" where "id" = $1',
            [primary.operationRecordId]
          );
          assert.deepEqual(columns, {
            actorKind: "user",
            servicePrincipalCode: null,
          });
          const [eventActor] = await rows<{
            actorKind: string;
            servicePrincipalCode: string | null;
          }>(
            sql,
            'select "actorKind", "servicePrincipalCode" from "ProjectEvent" where "operationRecordId" = $1',
            [primary.operationRecordId]
          );
          assert.deepEqual(eventActor, {
            actorKind: "user",
            servicePrincipalCode: null,
          });
          assert.equal(
            await count(
              sql,
              "select count(*)::text as count from pg_constraint where conrelid = 'public.\"ProjectOperation\"'::regclass and confrelid = 'public.\"User\"'::regclass"
            ),
            1
          );
          const projectTables = await rows<{ tableName: string }>(
            sql,
            "select table_name as \"tableName\" from information_schema.tables where table_schema = 'public' and table_name in ('ProjectDocumentIntent', 'ProjectDocumentImportConsent') order by table_name"
          );
          assert.deepEqual(
            projectTables.map((row) => row.tableName),
            ["ProjectDocumentImportConsent", "ProjectDocumentIntent"]
          );
          const [identityColumns] = await rows<{
            storageObjectVersionId: boolean;
            storageVerifiedAt: boolean;
            eventFingerprint: boolean;
          }>(
            sql,
            "select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ProjectDocumentVersion' and column_name = 'storageObjectVersionId') as \"storageObjectVersionId\", exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ProjectDocumentVersion' and column_name = 'storageVerifiedAt') as \"storageVerifiedAt\", exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ProjectDocumentProcessingRun' and column_name = 'eventFingerprint') as \"eventFingerprint\""
          );
          assert.deepEqual(identityColumns, {
            storageObjectVersionId: true,
            storageVerifiedAt: true,
            eventFingerprint: true,
          });
        }
      );

      await t.test(
        "user and service actor shapes, allowlists, FKs, and uniqueness fail closed",
        async () => {
          const operationInsert = (values: {
            actorKind: string;
            actorUserId: string | null;
            servicePrincipalCode: string | null;
            operationType?: string;
            operationId?: string;
          }) =>
            rows(
              sql,
              'insert into "ProjectOperation" ("actorKind", "actorUserId", "servicePrincipalCode", "operationType", "operationId", "requestHash", "resultKind", "resultId") values ($1, $2, $3, $4, $5, $6, $7, $8)',
              [
                values.actorKind,
                values.actorUserId,
                values.servicePrincipalCode,
                values.operationType ?? "project_document_upload_intent",
                values.operationId ?? operationId("actor-shape"),
                "b".repeat(64),
                "document_asset",
                randomUUID(),
              ]
            );
          await expectConstraint(
            operationInsert({
              actorKind: "user",
              actorUserId: null,
              servicePrincipalCode: null,
            }),
            "23514",
            "ProjectOperation_actor_shape_check"
          );
          await expectConstraint(
            operationInsert({
              actorKind: "user",
              actorUserId: ownerId,
              servicePrincipalCode: "project_document_storage_worker",
            }),
            "23514",
            "ProjectOperation_actor_shape_check"
          );
          await expectConstraint(
            operationInsert({
              actorKind: "service",
              actorUserId: null,
              servicePrincipalCode: "arbitrary_worker",
              operationType: "project_document_storage_finalize",
              operationId: "c".repeat(64),
            }),
            "23514",
            "ProjectOperation_actor_shape_check"
          );
          await expectConstraint(
            operationInsert({
              actorKind: "service",
              actorUserId: ownerId,
              servicePrincipalCode: "project_document_storage_worker",
              operationType: "project_document_storage_finalize",
              operationId: "d".repeat(64),
            }),
            "23514",
            "ProjectOperation_actor_shape_check"
          );
          await expectConstraint(
            operationInsert({
              actorKind: "user",
              actorUserId: ownerId,
              servicePrincipalCode: "project_document_scan_worker",
            }),
            "23514",
            "ProjectOperation_actor_shape_check"
          );
          await expectConstraint(
            operationInsert({
              actorKind: "service",
              actorUserId: null,
              servicePrincipalCode: "project_document_scan_worker",
              operationType: "project_document_storage_finalize",
              operationId: "e".repeat(64),
            }),
            "23514",
            "ProjectOperation_actor_type_check"
          );
          await expectConstraint(
            operationInsert({
              actorKind: "user",
              actorUserId: randomUUID(),
              servicePrincipalCode: null,
              operationType: "project_create",
            }),
            "23503",
            "ProjectOperation_actorUserId_User_id_fk"
          );
          const duplicate = await rows<{ id: string }>(
            sql,
            'select "id" from "ProjectOperation" where "id" = $1',
            [primary.operationRecordId]
          );
          assert.equal(duplicate.length, 1);
          await expectConstraint(
            rows(
              sql,
              'insert into "ProjectOperation" ("actorUserId", "operationType", "operationId", "requestHash", "resultKind", "resultId") values ($1, $2, $3, $4, $5, $6)',
              [
                ownerId,
                "project_create",
                primary.operationKey,
                "a".repeat(64),
                "project",
                primary.projectId,
              ]
            ),
            "23505",
            "ProjectOperation_actor_type_operation_unique"
          );
        }
      );

      let sharedIntent:
        | Awaited<
            ReturnType<typeof harness.repository.createDirectUploadIntent>
          >
        | undefined;
      await t.test(
        "concurrent identical intent replay, conflict, revision CAS, and atomic audit",
        async () => {
          const startingRevision = await projectRevision(
            sql,
            primary.projectId
          );
          const input = directInput({
            actorUserId: ownerId,
            projectId: primary.projectId,
            operationId: operationId("same-direct-intent"),
            expectedProjectRevision: startingRevision,
            fileLabel: "concurrent direct document",
          });
          const [first, second] = await Promise.all([
            harness.repository.createDirectUploadIntent(input),
            harness.repository.createDirectUploadIntent(input),
          ]);
          assert.equal(first.assetId, second.assetId);
          assert.equal(first.versionId, second.versionId);
          assert.equal(
            [first.replayed, second.replayed].filter(Boolean).length,
            1
          );
          assert.equal(first.projectRevision, startingRevision + 1);
          assert.equal(second.projectRevision, startingRevision + 1);
          assert.equal(
            await projectRevision(sql, primary.projectId),
            startingRevision + 1
          );
          sharedIntent = first;
          assert.equal(
            await count(
              sql,
              'select count(*)::text as count from "ProjectDocumentAsset" where "id" = $1',
              [first.assetId]
            ),
            1
          );
          assert.equal(
            await count(
              sql,
              'select count(*)::text as count from "ProjectDocumentVersion" where "versionId" = $1',
              [first.versionId]
            ),
            1
          );
          assert.equal(
            await count(
              sql,
              'select count(*)::text as count from "ProjectDocumentIntent" where "versionId" = $1',
              [first.versionId]
            ),
            1
          );
          await assertOneDocumentEvent(sql, input.operationId, "user", null);
          await expectPersistenceCode(
            harness.repository.createDirectUploadIntent({
              ...input,
              metadata: {
                ...input.metadata,
                byteSize: input.metadata.byteSize + 1,
              },
              expectedProjectRevision: await projectRevision(
                sql,
                primary.projectId
              ),
            }),
            "idempotency_conflict"
          );
          const beforeStale = await projectRevision(sql, primary.projectId);
          const staleKey = operationId("stale-project-revision");
          await expectPersistenceCode(
            harness.repository.createDirectUploadIntent(
              directInput({
                actorUserId: ownerId,
                projectId: primary.projectId,
                operationId: staleKey,
                expectedProjectRevision: beforeStale - 1,
              })
            ),
            "revision_conflict"
          );
          await assertNoOperation(sql, staleKey);
          await assertProjectEventLedger(sql, primary.projectId);
        }
      );

      let memberImport:
        | Awaited<
            ReturnType<typeof harness.repository.importOwnedChatDocumentIntent>
          >
        | undefined;
      await t.test(
        "import requires verified consent before source access and individual source ownership",
        async () => {
          const importInput = {
            actorUserId: memberId,
            projectId: primary.projectId,
            operationId: operationId("missing-import-consent"),
            expectedProjectRevision: await projectRevision(
              sql,
              primary.projectId
            ),
            sourceChatId: source.chatId,
            sourceDocumentId: source.documentId,
            sourceSha256: source.sha256,
            metadata: metadata("member source bytes", source.byteSize),
            consentAcknowledgement: "invalid",
          };
          const [stateBeforeRejections] = await rows<{
            importOperations: string;
            assets: string;
            versions: string;
            intents: string;
            receipts: string;
            events: string;
          }>(
            sql,
            'select (select count(*)::text from "ProjectOperation" where "operationType" = $1) as "importOperations", (select count(*)::text from "ProjectDocumentAsset" where "projectId" = $2) as assets, (select count(*)::text from "ProjectDocumentVersion" where "projectId" = $2) as versions, (select count(*)::text from "ProjectDocumentIntent" where "projectId" = $2) as intents, (select count(*)::text from "ProjectDocumentImportConsent" where "projectId" = $2) as receipts, (select count(*)::text from "ProjectEvent" where "projectId" = $2) as events',
            ["project_document_import_intent", primary.projectId]
          );
          assert.ok(stateBeforeRejections);
          const statementCountBefore = statements.length;
          await expectPersistenceCode(
            harness.repository.importOwnedChatDocumentIntent(importInput),
            "consent_unverified"
          );
          assert.equal(
            statements.length,
            statementCountBefore,
            "an unverified acknowledgement must fail before any SQL source lookup"
          );
          await expectPersistenceCode(
            harness.repository.importOwnedChatDocumentIntent({
              ...importInput,
              consentAcknowledgement: false,
            }),
            "consent_unverified"
          );
          const missingAcknowledgement = { ...importInput };
          Reflect.deleteProperty(
            missingAcknowledgement,
            "consentAcknowledgement"
          );
          await expectPersistenceCode(
            harness.repository.importOwnedChatDocumentIntent(
              missingAcknowledgement
            ),
            "consent_unverified"
          );
          assert.equal(statements.length, statementCountBefore);
          assert.equal(harness.storagePayloads.size, 0);
          await expectPersistenceCode(
            harness.repository.importOwnedChatDocumentIntent({
              ...importInput,
              actorUserId: ownerId,
              operationId: operationId("owner-cannot-import-member-chat"),
              expectedProjectRevision: await projectRevision(
                sql,
                primary.projectId
              ),
              consentAcknowledgement: IMPORT_ACK,
            }),
            "source_not_owned"
          );
          const [stateAfterRejections] = await rows<
            typeof stateBeforeRejections
          >(
            sql,
            'select (select count(*)::text from "ProjectOperation" where "operationType" = $1) as "importOperations", (select count(*)::text from "ProjectDocumentAsset" where "projectId" = $2) as assets, (select count(*)::text from "ProjectDocumentVersion" where "projectId" = $2) as versions, (select count(*)::text from "ProjectDocumentIntent" where "projectId" = $2) as intents, (select count(*)::text from "ProjectDocumentImportConsent" where "projectId" = $2) as receipts, (select count(*)::text from "ProjectEvent" where "projectId" = $2) as events',
            ["project_document_import_intent", primary.projectId]
          );
          assert.deepEqual(stateAfterRejections, stateBeforeRejections);
          assert.equal(harness.storagePayloads.size, 0);
          memberImport = await harness.repository.importOwnedChatDocumentIntent(
            {
              ...importInput,
              operationId: operationId("member-owned-import"),
              expectedProjectRevision: await projectRevision(
                sql,
                primary.projectId
              ),
              consentAcknowledgement: IMPORT_ACK,
            }
          );
          assert.equal(memberImport.status, "intent_created");
          assert.equal(memberImport.securityStatus, "pending");
          const [receipt] = await rows<{
            accepted: boolean;
            actorUserId: string;
            sourceChatId: string;
            sourceDocumentId: string;
            sourceSha256: string;
            noticeVersion: string;
          }>(
            sql,
            'select "accepted", "actorUserId", "sourceChatId", "sourceDocumentId", "sourceSha256", "noticeVersion" from "ProjectDocumentImportConsent" where "projectId" = $1 and "sourceDocumentId" = $2',
            [primary.projectId, source.documentId]
          );
          assert.deepEqual(receipt, {
            accepted: true,
            actorUserId: memberId,
            sourceChatId: source.chatId,
            sourceDocumentId: source.documentId,
            sourceSha256: source.sha256,
            noticeVersion: "synthetic-import-notice-v1",
          });
          assert.equal(
            await count(
              sql,
              'select count(*)::text as count from "ProjectDocumentAsset" where "id" = $1',
              [memberImport.assetId]
            ),
            1
          );
        }
      );

      await t.test(
        "same-Project FKs reject cross-Project intent injection",
        async () => {
          assert.ok(sharedIntent);
          assert.ok(sharedIntent);
          await expectConstraint(
            rows(
              sql,
              'insert into "ProjectDocumentIntent" ("operationRecordId", "projectId", "assetId", "versionId", "intentKind", "generation") values ($1, $2, $3, $4, $5, 1)',
              [
                closedProject.operationRecordId,
                closedProject.projectId,
                sharedIntent.assetId,
                sharedIntent.versionId,
                "direct_upload",
              ]
            ),
            "23503",
            "ProjectDocumentIntent_project_asset_version_fk"
          );
        }
      );

      await t.test(
        "storage CAS preserves pending scan state and immutable object identity",
        async () => {
          assert.ok(sharedIntent);
          const storageKey = "store-shared-intent";
          const storageInput = storageResult({
            projectId: primary.projectId,
            versionId: sharedIntent.versionId,
            generation: sharedIntent.generation,
            storageKey:
              "project-document/" +
              primary.projectId +
              "/" +
              sharedIntent.assetId +
              "/" +
              sharedIntent.versionId,
            sha256: digest("concurrent direct document"),
            byteSize: "concurrent direct document".length,
            outcome: "stored",
            objectVersionId: "synthetic-object-version-shared-v1",
          });
          harness.storagePayloads.set(storageKey, storageInput);
          const before = await projectRevision(sql, primary.projectId);
          const finalized =
            await harness.repository.finalizeStorage(storageKey);
          assert.equal(finalized.status, "stored");
          assert.equal(finalized.securityStatus, "pending");
          assert.equal(finalized.projectRevision, before + 1);
          const replay = await harness.repository.finalizeStorage(storageKey);
          assert.equal(replay.replayed, true);
          assert.equal(replay.projectRevision, finalized.projectRevision);
          assert.equal(
            await projectRevision(sql, primary.projectId),
            before + 1
          );
          await assertOneDocumentEvent(
            sql,
            finalized.operationId,
            "service",
            "project_document_storage_worker"
          );
          const [version] = await rows<{
            storageStatus: string;
            securityStatus: string;
            storageObjectVersionId: string | null;
            storageVerifiedAt: Date | null;
          }>(
            sql,
            'select "storageStatus", "securityStatus", "storageObjectVersionId", "storageVerifiedAt" from "ProjectDocumentVersion" where "versionId" = $1',
            [sharedIntent.versionId]
          );
          assert.equal(version?.storageStatus, "stored");
          assert.equal(version?.securityStatus, "pending");
          assert.equal(
            version?.storageObjectVersionId,
            "synthetic-object-version-shared-v1"
          );
          assert.ok(version?.storageVerifiedAt);
          const beforeReplay = await projectRevision(sql, primary.projectId);
          const oldRevisionReplay =
            await harness.repository.createDirectUploadIntent(
              directInput({
                actorUserId: ownerId,
                projectId: primary.projectId,
                operationId: sharedIntent.operationId,
                expectedProjectRevision: 1,
                fileLabel: "concurrent direct document",
              })
            );
          assert.equal(oldRevisionReplay.replayed, true);
          assert.equal(
            oldRevisionReplay.projectRevision,
            sharedIntent.projectRevision
          );
          assert.equal(
            await projectRevision(sql, primary.projectId),
            beforeReplay
          );
          const conflictingStorageKey = "conflicting-storage-object-version";
          harness.storagePayloads.set(
            conflictingStorageKey,
            storageResult({
              ...storageInput,
              objectVersionId: "synthetic-object-version-conflict",
            })
          );
          await expectPersistenceCode(
            harness.repository.finalizeStorage(conflictingStorageKey),
            "state_conflict"
          );
          await expectConstraint(
            rows(
              sql,
              'update "ProjectDocumentVersion" set "storageObjectVersionId" = $1, "storageVerifiedAt" = now() where "versionId" = $2',
              ["synthetic-object-version-mutated", sharedIntent.versionId]
            ),
            "23514",
            "ProjectDocumentVersion_storage_object_version_once"
          );
          await expectConstraint(
            rows(
              sql,
              'update "ProjectDocumentIntent" set "status" = $1, "errorCode" = $2, "updatedAt" = now() where "versionId" = $3',
              ["failed", "late_failure", sharedIntent.versionId]
            ),
            "23514",
            "ProjectDocumentIntent_status_transition"
          );
          await assertProjectEventLedger(sql, primary.projectId);
        }
      );

      await t.test(
        "security promotion requires an exact audited terminal scan result",
        async () => {
          assert.ok(sharedIntent);
          const initialCleanAssetId = randomUUID();
          const initialCleanVersionId = randomUUID();
          await expectConstraint(
            sql.begin(async (tx) => {
              await tx.unsafe(
                'insert into "ProjectDocumentAsset" ("id", "projectId", "createdByUserId", "lifecycle") values ($1, $2, $3, $4)',
                [initialCleanAssetId, primary.projectId, ownerId, "active"]
              );
              await tx.unsafe(
                'insert into "ProjectDocumentVersion" ("projectId", "assetId", "versionId", "versionNumber", "storageKey", "sha256", "byteSize", "canonicalMime", "originKind", "uploadedByUserId", "storageStatus", "securityStatus", "processingGeneration") values ($1, $2, $3, 1, $4, $5, 1, $6, $7, $8, $9, $10, 1)',
                [
                  primary.projectId,
                  initialCleanAssetId,
                  initialCleanVersionId,
                  `project-document/${primary.projectId}/${initialCleanAssetId}/${initialCleanVersionId}`,
                  digest("direct clean insertion"),
                  "application/pdf",
                  "direct_upload",
                  ownerId,
                  "pending",
                  "clean",
                ]
              );
            }),
            "23514",
            "ProjectDocumentVersion_security_status_terminal"
          );
          assert.equal(
            await count(
              sql,
              'select count(*)::text as count from "ProjectDocumentAsset" where "id" = $1',
              [initialCleanAssetId]
            ),
            0
          );

          const assertPromotionDenied = async (versionId: string) => {
            const [before] = await rows<{
              revision: number;
              scanOperations: string;
              scanRuns: string;
              projectEvents: string;
            }>(
              sql,
              'select (select "revision" from "StudyJourneyProject" where "id" = $1) as revision, (select count(*)::text from "ProjectOperation" where "operationType" = $2) as "scanOperations", (select count(*)::text from "ProjectDocumentProcessingRun" where "projectId" = $1) as "scanRuns", (select count(*)::text from "ProjectEvent" where "projectId" = $1) as "projectEvents"',
              [primary.projectId, "project_document_scan_finalize"]
            );
            assert.ok(before);
            await expectConstraint(
              rows(
                sql,
                'update "ProjectDocumentVersion" set "securityStatus" = $1 where "projectId" = $2 and "versionId" = $3',
                ["clean", primary.projectId, versionId]
              ),
              "23514",
              "ProjectDocumentVersion_security_scan_provenance"
            );
            const [after] = await rows<typeof before>(
              sql,
              'select (select "revision" from "StudyJourneyProject" where "id" = $1) as revision, (select count(*)::text from "ProjectOperation" where "operationType" = $2) as "scanOperations", (select count(*)::text from "ProjectDocumentProcessingRun" where "projectId" = $1) as "scanRuns", (select count(*)::text from "ProjectEvent" where "projectId" = $1) as "projectEvents"',
              [primary.projectId, "project_document_scan_finalize"]
            );
            assert.deepEqual(after, before);
            const [version] = await rows<{ securityStatus: string }>(
              sql,
              'select "securityStatus" from "ProjectDocumentVersion" where "projectId" = $1 and "versionId" = $2',
              [primary.projectId, versionId]
            );
            assert.equal(version?.securityStatus, "pending");
          };

          await assertPromotionDenied(sharedIntent.versionId);

          const prepareStoredIntent = async (label: string) => {
            const content = `scan provenance ${label}`;
            const intent = await harness.repository.createDirectUploadIntent(
              directInput({
                actorUserId: ownerId,
                projectId: primary.projectId,
                operationId: operationId(`scan-provenance-${label}`),
                expectedProjectRevision: await projectRevision(
                  sql,
                  primary.projectId
                ),
                fileLabel: content,
              })
            );
            const storageKey = `scan-provenance-storage-${label}`;
            harness.storagePayloads.set(
              storageKey,
              storageResult({
                projectId: primary.projectId,
                versionId: intent.versionId,
                generation: intent.generation,
                storageKey: `project-document/${primary.projectId}/${intent.assetId}/${intent.versionId}`,
                sha256: digest(content),
                byteSize: content.length,
                outcome: "stored",
                objectVersionId: `synthetic-object-version-${label}`,
              })
            );
            await harness.repository.finalizeStorage(storageKey);
            return { intent, content };
          };

          const differentVersion =
            await prepareStoredIntent("different-version");
          const differentVersionStorageKey =
            "scan-provenance-different-version-scan-storage";
          harness.scanPayloads.set(
            differentVersionStorageKey,
            scanAttestation({
              projectId: primary.projectId,
              versionId: differentVersion.intent.versionId,
              generation: differentVersion.intent.generation,
              storageKey: `project-document/${primary.projectId}/${differentVersion.intent.assetId}/${differentVersion.intent.versionId}`,
              storageObjectVersionId:
                "synthetic-object-version-different-version",
              sha256: digest(differentVersion.content),
              byteSize: differentVersion.content.length,
              providerCode: "synthetic_test_scanner",
              providerEventId: `synthetic-different-version-${differentVersion.intent.versionId}`,
              result: "clean",
            })
          );
          assert.equal(
            (await harness.repository.finalizeScan(differentVersionStorageKey))
              .securityStatus,
            "clean"
          );
          await assertPromotionDenied(sharedIntent.versionId);

          await insertAuditedSyntheticScanFixture(sql, {
            projectId: primary.projectId,
            versionId: sharedIntent.versionId,
            generation: sharedIntent.generation + 1,
            sha256: digest("concurrent direct document"),
            result: "clean",
          });
          await assertPromotionDenied(sharedIntent.versionId);

          const wrongProjectRunId = randomUUID();
          await expectConstraint(
            rows(
              sql,
              'insert into "ProjectDocumentProcessingRun" ("id", "projectId", "versionId", "generation", "operationKind", "providerCode", "providerEventId", "servicePrincipalCode", "objectSha256", "eventFingerprint") values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
              [
                wrongProjectRunId,
                closedProject.projectId,
                sharedIntent.versionId,
                sharedIntent.generation,
                "scan",
                "synthetic_test_scanner",
                `wrong-project-${wrongProjectRunId}`,
                "project_document_scan_worker",
                digest("concurrent direct document"),
                digest(`wrong-project-${wrongProjectRunId}`),
              ]
            ),
            "23503",
            "ProjectDocumentProcessingRun_project_version_sha256_fk"
          );
          const wrongDigestRunId = randomUUID();
          await expectConstraint(
            rows(
              sql,
              'insert into "ProjectDocumentProcessingRun" ("id", "projectId", "versionId", "generation", "operationKind", "providerCode", "providerEventId", "servicePrincipalCode", "objectSha256", "eventFingerprint") values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
              [
                wrongDigestRunId,
                primary.projectId,
                sharedIntent.versionId,
                sharedIntent.generation,
                "scan",
                "synthetic_test_scanner",
                `wrong-digest-${wrongDigestRunId}`,
                "project_document_scan_worker",
                digest("incorrect scan digest"),
                digest(`wrong-digest-${wrongDigestRunId}`),
              ]
            ),
            "23503",
            "ProjectDocumentProcessingRun_project_version_sha256_fk"
          );
          await assertPromotionDenied(sharedIntent.versionId);

          for (const result of ["rejected", "failed"] as const) {
            const target = await prepareStoredIntent(`matching-${result}`);
            await insertAuditedSyntheticScanFixture(sql, {
              projectId: primary.projectId,
              versionId: target.intent.versionId,
              generation: target.intent.generation,
              sha256: digest(target.content),
              result,
            });
            await assertPromotionDenied(target.intent.versionId);
          }
          await assertProjectEventLedger(sql, primary.projectId);
        }
      );

      await t.test(
        "failed scan promotion rolls back run, version, revision, and event",
        async () => {
          const content = "synthetic rollback scan promotion";
          const intent = await harness.repository.createDirectUploadIntent(
            directInput({
              actorUserId: ownerId,
              projectId: primary.projectId,
              operationId: operationId("scan-promotion-rollback-intent"),
              expectedProjectRevision: await projectRevision(
                sql,
                primary.projectId
              ),
              fileLabel: content,
            })
          );
          const storageKey = "scan-promotion-rollback-storage";
          harness.storagePayloads.set(
            storageKey,
            storageResult({
              projectId: primary.projectId,
              versionId: intent.versionId,
              generation: intent.generation,
              storageKey: `project-document/${primary.projectId}/${intent.assetId}/${intent.versionId}`,
              sha256: digest(content),
              byteSize: content.length,
              outcome: "stored",
              objectVersionId: "synthetic-object-version-rollback-scan",
            })
          );
          await harness.repository.finalizeStorage(storageKey);
          const scanKey = "scan-promotion-rollback-result";
          harness.scanPayloads.set(
            scanKey,
            scanAttestation({
              projectId: primary.projectId,
              versionId: intent.versionId,
              generation: intent.generation,
              storageKey: `project-document/${primary.projectId}/${intent.assetId}/${intent.versionId}`,
              storageObjectVersionId: "synthetic-object-version-rollback-scan",
              sha256: digest(content),
              byteSize: content.length,
              providerCode: "synthetic_test_scanner",
              providerEventId: `synthetic-rollback-${intent.versionId}`,
              result: "clean",
            })
          );
          const [before] = await rows<{
            revision: number;
            scanOperations: string;
            scanRuns: string;
            securityEvents: string;
          }>(
            sql,
            'select (select "revision" from "StudyJourneyProject" where "id" = $1) as revision, (select count(*)::text from "ProjectOperation" where "operationType" = $2) as "scanOperations", (select count(*)::text from "ProjectDocumentProcessingRun" where "projectId" = $1 and "versionId" = $3) as "scanRuns", (select count(*)::text from "ProjectEvent" where "projectId" = $1 and "eventType" = $4) as "securityEvents"',
            [
              primary.projectId,
              "project_document_scan_finalize",
              intent.versionId,
              "project_document_security_changed",
            ]
          );
          assert.ok(before);
          const failingRepository = createRepository(
            database,
            {
              afterWrite(boundary) {
                if (boundary === "scan_run_completed") {
                  throw new Error("injected-scan-promotion-failure");
                }
              },
            },
            harness
          ).repository;
          await assert.rejects(
            failingRepository.finalizeScan(scanKey),
            /injected-scan-promotion-failure/u
          );
          const [after] = await rows<typeof before>(
            sql,
            'select (select "revision" from "StudyJourneyProject" where "id" = $1) as revision, (select count(*)::text from "ProjectOperation" where "operationType" = $2) as "scanOperations", (select count(*)::text from "ProjectDocumentProcessingRun" where "projectId" = $1 and "versionId" = $3) as "scanRuns", (select count(*)::text from "ProjectEvent" where "projectId" = $1 and "eventType" = $4) as "securityEvents"',
            [
              primary.projectId,
              "project_document_scan_finalize",
              intent.versionId,
              "project_document_security_changed",
            ]
          );
          assert.deepEqual(after, before);
          const [version] = await rows<{ securityStatus: string }>(
            sql,
            'select "securityStatus" from "ProjectDocumentVersion" where "projectId" = $1 and "versionId" = $2',
            [primary.projectId, intent.versionId]
          );
          assert.equal(version?.securityStatus, "pending");
          await assertProjectEventLedger(sql, primary.projectId);
        }
      );

      await t.test(
        "synthetic scan attestation binds exact object, replays once, and terminal outcomes stay immutable",
        async () => {
          assert.ok(sharedIntent);
          const objectVersionId = "synthetic-object-version-shared-v1";
          const payloadKey = "scan-clean";
          const cleanAttestation = scanAttestation({
            projectId: primary.projectId,
            versionId: sharedIntent.versionId,
            generation: sharedIntent.generation,
            storageKey:
              "project-document/" +
              primary.projectId +
              "/" +
              sharedIntent.assetId +
              "/" +
              sharedIntent.versionId,
            storageObjectVersionId: objectVersionId,
            sha256: digest("concurrent direct document"),
            byteSize: "concurrent direct document".length,
            providerCode: "synthetic_test_scanner",
            providerEventId: `synthetic-event-${sharedIntent.versionId}`,
            result: "clean",
          });
          harness.scanPayloads.set(payloadKey, cleanAttestation);
          const before = await projectRevision(sql, primary.projectId);
          const clean = await harness.repository.finalizeScan(payloadKey);
          assert.equal(clean.securityStatus, "clean");
          assert.equal(clean.projectRevision, before + 1);
          const replay = await harness.repository.finalizeScan(payloadKey);
          assert.equal(replay.replayed, true);
          assert.equal(replay.projectRevision, clean.projectRevision);
          assert.equal(
            await projectRevision(sql, primary.projectId),
            before + 1
          );
          await assertOneDocumentEvent(
            sql,
            clean.operationId,
            "service",
            "project_document_scan_worker"
          );
          const [run] = await rows<{
            id: string;
            status: string;
            verdict: string | null;
            eventFingerprint: string;
            servicePrincipalCode: string;
            initiatedByUserId: string | null;
          }>(
            sql,
            'select "id", "status", "verdict", "eventFingerprint", "servicePrincipalCode", "initiatedByUserId" from "ProjectDocumentProcessingRun" where "projectId" = $1 and "versionId" = $2 and "generation" = $3 and "operationKind" = $4',
            [
              primary.projectId,
              sharedIntent.versionId,
              sharedIntent.generation,
              "scan",
            ]
          );
          assert.ok(run?.eventFingerprint);
          assert.match(run.eventFingerprint, /^[0-9a-f]{64}$/u);
          assert.equal(run.status, "completed");
          assert.equal(run.verdict, "clean");
          assert.equal(
            run.servicePrincipalCode,
            "project_document_scan_worker"
          );
          assert.equal(run.initiatedByUserId, null);
          await expectConstraint(
            rows(
              sql,
              'update "ProjectDocumentVersion" set "securityStatus" = $1 where "versionId" = $2',
              ["pending", sharedIntent.versionId]
            ),
            "23514",
            "ProjectDocumentVersion_security_status_terminal"
          );
          await expectConstraint(
            rows(
              sql,
              'update "ProjectDocumentVersion" set "securityStatus" = $1 where "versionId" = $2',
              ["rejected", sharedIntent.versionId]
            ),
            "23514",
            "ProjectDocumentVersion_security_status_terminal"
          );
          const [identicalSecurityNoop] = await rows<{
            securityStatus: string;
          }>(
            sql,
            'update "ProjectDocumentVersion" set "securityStatus" = $1 where "versionId" = $2 returning "securityStatus"',
            ["clean", sharedIntent.versionId]
          );
          assert.equal(identicalSecurityNoop?.securityStatus, "clean");
          const conflictingKey = "conflicting-scan-event";
          harness.scanPayloads.set(
            conflictingKey,
            scanAttestation({
              ...cleanAttestation,
              result: "rejected",
              providerEventId: `different-event-${sharedIntent.versionId}`,
            })
          );
          await expectPersistenceCode(
            harness.repository.finalizeScan(conflictingKey),
            "state_conflict"
          );
          await expectPersistenceCode(
            harness.repository.finalizeScan("unverified-scan-input"),
            "worker_untrusted"
          );
          await expectConstraint(
            rows(
              sql,
              'update "ProjectDocumentProcessingRun" set "eventFingerprint" = $1 where "id" = $2',
              ["f".repeat(64), run.id]
            ),
            "23514",
            "ProjectDocumentProcessingRun_event_fingerprint_once"
          );
          await expectConstraint(
            rows(
              sql,
              'update "ProjectDocumentProcessingRun" set "errorCode" = $1 where "id" = $2',
              ["late_failure", run.id]
            ),
            "23514",
            "ProjectDocumentProcessingRun_terminal_immutable"
          );
          await assertProjectEventLedger(sql, primary.projectId);
        }
      );

      await t.test(
        "failed and rejected scans never become clean; storage failures remain pending security",
        async () => {
          const failedIntent =
            await harness.repository.createDirectUploadIntent(
              directInput({
                actorUserId: ownerId,
                projectId: primary.projectId,
                operationId: operationId("storage-cleanup-pending"),
                expectedProjectRevision: await projectRevision(
                  sql,
                  primary.projectId
                ),
                fileLabel: "cleanup pending document",
              })
            );
          const cleanupKey = "storage-cleanup-pending";
          harness.storagePayloads.set(
            cleanupKey,
            storageResult({
              projectId: primary.projectId,
              versionId: failedIntent.versionId,
              generation: failedIntent.generation,
              storageKey:
                "project-document/" +
                primary.projectId +
                "/" +
                failedIntent.assetId +
                "/" +
                failedIntent.versionId,
              sha256: digest("cleanup pending document"),
              byteSize: "cleanup pending document".length,
              outcome: "cleanup_pending",
              errorCode: "storage_unknown",
            })
          );
          const cleanup = await harness.repository.finalizeStorage(cleanupKey);
          assert.equal(cleanup.status, "cleanup_pending");
          assert.equal(cleanup.securityStatus, "pending");
          const failedStorageIntent =
            await harness.repository.createDirectUploadIntent(
              directInput({
                actorUserId: ownerId,
                projectId: primary.projectId,
                operationId: operationId("storage-failed"),
                expectedProjectRevision: await projectRevision(
                  sql,
                  primary.projectId
                ),
                fileLabel: "storage failed document",
              })
            );
          const failedStorageKey = "storage-failed";
          harness.storagePayloads.set(
            failedStorageKey,
            storageResult({
              projectId: primary.projectId,
              versionId: failedStorageIntent.versionId,
              generation: failedStorageIntent.generation,
              storageKey:
                "project-document/" +
                primary.projectId +
                "/" +
                failedStorageIntent.assetId +
                "/" +
                failedStorageIntent.versionId,
              sha256: digest("storage failed document"),
              byteSize: "storage failed document".length,
              outcome: "failed",
              errorCode: "storage_failed",
            })
          );
          const failedStorage =
            await harness.repository.finalizeStorage(failedStorageKey);
          assert.equal(failedStorage.status, "failed");
          assert.equal(failedStorage.securityStatus, "pending");
          for (const [label, verdict] of [
            ["rejected", "rejected"],
            ["failed", "failed"],
          ] as const) {
            const intent = await harness.repository.createDirectUploadIntent(
              directInput({
                actorUserId: ownerId,
                projectId: primary.projectId,
                operationId: operationId(`scan-${label}`),
                expectedProjectRevision: await projectRevision(
                  sql,
                  primary.projectId
                ),
                fileLabel: `scan ${label} document`,
              })
            );
            const storagePayloadKey = `store-before-scan-${label}`;
            harness.storagePayloads.set(
              storagePayloadKey,
              storageResult({
                projectId: primary.projectId,
                versionId: intent.versionId,
                generation: intent.generation,
                storageKey:
                  "project-document/" +
                  primary.projectId +
                  "/" +
                  intent.assetId +
                  "/" +
                  intent.versionId,
                sha256: digest(`scan ${label} document`),
                byteSize: `scan ${label} document`.length,
                outcome: "stored",
                objectVersionId: `synthetic-object-${label}`,
              })
            );
            await harness.repository.finalizeStorage(storagePayloadKey);
            const scanKey = `scan-result-${label}`;
            harness.scanPayloads.set(
              scanKey,
              scanAttestation({
                projectId: primary.projectId,
                versionId: intent.versionId,
                generation: intent.generation,
                storageKey:
                  "project-document/" +
                  primary.projectId +
                  "/" +
                  intent.assetId +
                  "/" +
                  intent.versionId,
                storageObjectVersionId: `synthetic-object-${label}`,
                sha256: digest(`scan ${label} document`),
                byteSize: `scan ${label} document`.length,
                providerCode: "synthetic_test_scanner",
                providerEventId: `synthetic-event-${label}-${intent.versionId}`,
                result: verdict,
              })
            );
            const result = await harness.repository.finalizeScan(scanKey);
            assert.equal(result.securityStatus, verdict);
          }
          const [cleanupVersion] = await rows<{
            storageStatus: string;
            securityStatus: string;
            storageObjectVersionId: string | null;
          }>(
            sql,
            'select "storageStatus", "securityStatus", "storageObjectVersionId" from "ProjectDocumentVersion" where "versionId" = $1',
            [failedIntent.versionId]
          );
          assert.deepEqual(cleanupVersion, {
            storageStatus: "cleanup_pending",
            securityStatus: "pending",
            storageObjectVersionId: null,
          });
        }
      );

      await t.test(
        "creator grants are purpose-specific, revocable, and withdrawal removes access",
        async () => {
          assert.ok(sharedIntent);
          await expectPersistenceCode(
            harness.repository.createCreatorGrant({
              actorUserId: memberId,
              projectId: primary.projectId,
              assetId: sharedIntent.assetId,
              versionId: sharedIntent.versionId,
              operationId: operationId("member-cannot-grant-owner-asset"),
              expectedProjectRevision: await projectRevision(
                sql,
                primary.projectId
              ),
              purpose: "metadata_read",
              acknowledgement: GRANT_ACK,
            }),
            "project_forbidden"
          );
          const invalidPurposeKey = operationId("ai-grant-forbidden");
          await expectPersistenceCode(
            harness.repository.createCreatorGrant({
              actorUserId: ownerId,
              projectId: primary.projectId,
              assetId: sharedIntent.assetId,
              versionId: sharedIntent.versionId,
              operationId: invalidPurposeKey,
              expectedProjectRevision: await projectRevision(
                sql,
                primary.projectId
              ),
              purpose: "ai_context",
              acknowledgement: GRANT_ACK,
            }),
            "invalid_request"
          );
          await assertNoOperation(sql, invalidPurposeKey);
          const metadataGrant = await harness.repository.createCreatorGrant({
            actorUserId: ownerId,
            projectId: primary.projectId,
            assetId: sharedIntent.assetId,
            versionId: sharedIntent.versionId,
            operationId: operationId("grant-metadata"),
            expectedProjectRevision: await projectRevision(
              sql,
              primary.projectId
            ),
            purpose: "metadata_read",
            acknowledgement: GRANT_ACK,
          });
          assert.equal(metadataGrant.purpose, "metadata_read");
          assert.equal(metadataGrant.grantId.length > 0, true);
          assert.equal(
            await count(
              sql,
              'select count(*)::text as count from "ProjectDocumentGrant" where "id" = $1 and "granteeKind" = $2 and "granteeUserId" = $3 and "purpose" = $4',
              [metadataGrant.grantId, "user", ownerId, "metadata_read"]
            ),
            1
          );
          const metadataList = await harness.repository.listGrantedMetadata({
            actorUserId: ownerId,
            projectId: primary.projectId,
          });
          assert.equal(metadataList.length, 1);
          assert.equal("storageKey" in (metadataList[0] ?? {}), false);
          const revoked = await harness.repository.revokeCreatorGrant({
            actorUserId: ownerId,
            projectId: primary.projectId,
            grantId: metadataGrant.grantId,
            operationId: operationId("revoke-metadata"),
            expectedProjectRevision: await projectRevision(
              sql,
              primary.projectId
            ),
          });
          assert.ok(revoked.revokedAt);
          assert.equal(
            (
              await harness.repository.listGrantedMetadata({
                actorUserId: ownerId,
                projectId: primary.projectId,
              })
            ).length,
            0
          );
          const regrant = await harness.repository.createCreatorGrant({
            actorUserId: ownerId,
            projectId: primary.projectId,
            assetId: sharedIntent.assetId,
            versionId: sharedIntent.versionId,
            operationId: operationId("fresh-metadata-regrant"),
            expectedProjectRevision: await projectRevision(
              sql,
              primary.projectId
            ),
            purpose: "metadata_read",
            acknowledgement: GRANT_ACK,
          });
          assert.notEqual(regrant.grantId, metadataGrant.grantId);
          const contentGrant = await harness.repository.createCreatorGrant({
            actorUserId: ownerId,
            projectId: primary.projectId,
            assetId: sharedIntent.assetId,
            versionId: sharedIntent.versionId,
            operationId: operationId("grant-content"),
            expectedProjectRevision: await projectRevision(
              sql,
              primary.projectId
            ),
            purpose: "content_read",
            acknowledgement: GRANT_ACK,
          });
          assert.deepEqual(
            await harness.repository.authorizeExactVersionRead({
              actorUserId: ownerId,
              projectId: primary.projectId,
              assetId: sharedIntent.assetId,
              versionId: sharedIntent.versionId,
              purpose: "content_read",
            }),
            {
              projectId: primary.projectId,
              assetId: sharedIntent.assetId,
              versionId: sharedIntent.versionId,
              purpose: "content_read",
            }
          );
          assert.equal(
            await count(
              sql,
              'select count(*)::text as count from "ProjectDocumentProcessingRun" where "projectId" = $1 and "versionId" = $2 and "generation" = $3 and "operationKind" = $4 and "verdict" = $5',
              [
                primary.projectId,
                sharedIntent.versionId,
                sharedIntent.generation,
                "scan",
                "clean",
              ]
            ),
            1
          );
          await expectConstraint(
            sql`
              delete from "ProjectDocumentProcessingRun"
              where "projectId" = ${primary.projectId}
                and "versionId" = ${sharedIntent.versionId}
                and "generation" = ${sharedIntent.generation}
                and "operationKind" = 'scan'
            `,
            "23514",
            "ProjectDocumentProcessingRun_delete_protected"
          );
          assert.deepEqual(
            await harness.repository.authorizeExactVersionRead({
              actorUserId: ownerId,
              projectId: primary.projectId,
              assetId: sharedIntent.assetId,
              versionId: sharedIntent.versionId,
              purpose: "content_read",
            }),
            {
              projectId: primary.projectId,
              assetId: sharedIntent.assetId,
              versionId: sharedIntent.versionId,
              purpose: "content_read",
            }
          );
          await harness.repository.revokeCreatorGrant({
            actorUserId: ownerId,
            projectId: primary.projectId,
            grantId: contentGrant.grantId,
            operationId: operationId("revoke-content"),
            expectedProjectRevision: await projectRevision(
              sql,
              primary.projectId
            ),
          });
          await expectPersistenceCode(
            harness.repository.authorizeExactVersionRead({
              actorUserId: ownerId,
              projectId: primary.projectId,
              assetId: sharedIntent.assetId,
              versionId: sharedIntent.versionId,
              purpose: "content_read",
            }),
            "project_forbidden"
          );
          const withdrawal = await harness.repository.withdrawDocument({
            actorUserId: ownerId,
            projectId: primary.projectId,
            assetId: sharedIntent.assetId,
            operationId: operationId("withdraw-shared-asset"),
            expectedProjectRevision: await projectRevision(
              sql,
              primary.projectId
            ),
          });
          assert.equal(withdrawal.lifecycle, "withdrawn");
          await expectPersistenceCode(
            harness.repository.authorizeExactVersionRead({
              actorUserId: ownerId,
              projectId: primary.projectId,
              assetId: sharedIntent.assetId,
              versionId: sharedIntent.versionId,
              purpose: "download",
            }),
            "project_forbidden"
          );
          const afterWithdrawScanKey = "scan-after-withdrawal";
          harness.scanPayloads.set(
            afterWithdrawScanKey,
            scanAttestation({
              projectId: primary.projectId,
              versionId: sharedIntent.versionId,
              generation: sharedIntent.generation,
              storageKey:
                "project-document/" +
                primary.projectId +
                "/" +
                sharedIntent.assetId +
                "/" +
                sharedIntent.versionId,
              storageObjectVersionId: "synthetic-object-version-shared-v1",
              sha256: digest("concurrent direct document"),
              byteSize: "concurrent direct document".length,
              providerCode: "synthetic_test_scanner",
              providerEventId: `post-withdraw-${sharedIntent.versionId}`,
              result: "clean",
            })
          );
          await expectPersistenceCode(
            harness.repository.finalizeScan(afterWithdrawScanKey),
            "state_conflict"
          );
          await assertProjectEventLedger(sql, primary.projectId);
        }
      );

      await t.test(
        "revoked grants stop delayed storage finalization",
        async () => {
          const intent = await harness.repository.createDirectUploadIntent(
            directInput({
              actorUserId: ownerId,
              projectId: primary.projectId,
              operationId: operationId("grant-revocation-storage-intent"),
              expectedProjectRevision: await projectRevision(
                sql,
                primary.projectId
              ),
              fileLabel: "revoked grant document",
            })
          );
          const grant = await harness.repository.createCreatorGrant({
            actorUserId: ownerId,
            projectId: primary.projectId,
            assetId: intent.assetId,
            versionId: intent.versionId,
            operationId: operationId("grant-before-storage"),
            expectedProjectRevision: await projectRevision(
              sql,
              primary.projectId
            ),
            purpose: "metadata_read",
            acknowledgement: GRANT_ACK,
          });
          await harness.repository.revokeCreatorGrant({
            actorUserId: ownerId,
            projectId: primary.projectId,
            grantId: grant.grantId,
            operationId: operationId("revoke-before-storage"),
            expectedProjectRevision: await projectRevision(
              sql,
              primary.projectId
            ),
          });
          const workerKey = "storage-after-grant-revocation";
          const revisionBeforeWorker = await projectRevision(
            sql,
            primary.projectId
          );
          harness.storagePayloads.set(
            workerKey,
            storageResult({
              projectId: primary.projectId,
              versionId: intent.versionId,
              generation: intent.generation,
              storageKey:
                "project-document/" +
                primary.projectId +
                "/" +
                intent.assetId +
                "/" +
                intent.versionId,
              sha256: digest("revoked grant document"),
              byteSize: "revoked grant document".length,
              outcome: "stored",
              objectVersionId: "synthetic-revoked-grant-object",
            })
          );
          await expectPersistenceCode(
            harness.repository.finalizeStorage(workerKey),
            "state_conflict"
          );
          assert.equal(
            await projectRevision(sql, primary.projectId),
            revisionBeforeWorker
          );
          assert.equal(
            await count(
              sql,
              'select count(*)::text as count from "ProjectOperation" where "resultKind" = $1 and "resultId" = $2 and "actorKind" = $3',
              ["document_version", intent.versionId, "service"]
            ),
            0
          );
        }
      );

      await t.test(
        "injected failures roll back operation, document rows, revision, and event",
        async () => {
          for (const boundary of [
            "operation_claimed",
            "intent_created",
            "project_revised",
            "event_created",
          ] as const) {
            const startingRevision = await projectRevision(
              sql,
              primary.projectId
            );
            const key = operationId(`rollback-${boundary}`);
            const beforeCounts = await rows<{
              assets: string;
              versions: string;
              intents: string;
              events: string;
            }>(
              sql,
              'select (select count(*)::text from "ProjectDocumentAsset" where "projectId" = $1) as assets, (select count(*)::text from "ProjectDocumentVersion" where "projectId" = $1) as versions, (select count(*)::text from "ProjectDocumentIntent" where "projectId" = $1) as intents, (select count(*)::text from "ProjectEvent" where "projectId" = $1) as events',
              [primary.projectId]
            );
            const failing = createRepository(database, {
              afterWrite(observed) {
                if (observed === boundary) {
                  throw new Error(`injected-${boundary}`);
                }
              },
            }).repository;
            await assert.rejects(
              failing.createDirectUploadIntent(
                directInput({
                  actorUserId: ownerId,
                  projectId: primary.projectId,
                  operationId: key,
                  expectedProjectRevision: startingRevision,
                  fileLabel: `rollback ${boundary}`,
                })
              ),
              new RegExp(`injected-${boundary}`, "u")
            );
            await assertNoOperation(sql, key);
            assert.equal(
              await projectRevision(sql, primary.projectId),
              startingRevision
            );
            const afterCounts = await rows<{
              assets: string;
              versions: string;
              intents: string;
              events: string;
            }>(
              sql,
              'select (select count(*)::text from "ProjectDocumentAsset" where "projectId" = $1) as assets, (select count(*)::text from "ProjectDocumentVersion" where "projectId" = $1) as versions, (select count(*)::text from "ProjectDocumentIntent" where "projectId" = $1) as intents, (select count(*)::text from "ProjectEvent" where "projectId" = $1) as events',
              [primary.projectId]
            );
            assert.deepEqual(afterCounts, beforeCounts);
          }
          await assertProjectEventLedger(sql, primary.projectId);
        }
      );

      await t.test(
        "worker/event actor mismatch and terminal storage identity are rejected",
        async () => {
          const currentRevision = await projectRevision(sql, primary.projectId);
          await expectConstraint(
            sql.begin(async (tx) => {
              const workerOperationId = "e".repeat(64);
              const [operation] = await tx.unsafe<{ id: string }[]>(
                'insert into "ProjectOperation" ("actorKind", "actorUserId", "servicePrincipalCode", "operationType", "operationId", "requestHash", "resultKind", "resultId") values ($1, null, $2, $3, $4, $5, $6, $7) returning "id"',
                [
                  "service",
                  "project_document_storage_worker",
                  "project_document_storage_finalize",
                  workerOperationId,
                  digest("mismatched worker event"),
                  "document_version",
                  sharedIntent?.versionId ?? randomUUID(),
                ]
              );
              assert.ok(operation?.id);
              await tx.unsafe(
                'insert into "ProjectEvent" ("projectId", "actorKind", "actorUserId", "servicePrincipalCode", "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId") values ($1, $2, $3, null, $4, $5, $6, $7, $8)',
                [
                  primary.projectId,
                  "user",
                  ownerId,
                  currentRevision,
                  "project_document_storage_changed",
                  "document_version",
                  sharedIntent?.versionId ?? randomUUID(),
                  operation.id,
                ]
              );
            }),
            "23514",
            "ProjectEvent_operation_actor_match"
          );
          const direct = await harness.repository.createDirectUploadIntent(
            directInput({
              actorUserId: ownerId,
              projectId: primary.projectId,
              operationId: operationId("terminal-storage-status"),
              expectedProjectRevision: await projectRevision(
                sql,
                primary.projectId
              ),
              fileLabel: "terminal storage status",
            })
          );
          await expectConstraint(
            rows(
              sql,
              'insert into "ProjectDocumentVersion" ("projectId", "assetId", "versionId", "versionNumber", "storageKey", "sha256", "byteSize", "canonicalMime", "originKind", "uploadedByUserId", "storageStatus", "storageObjectVersionId", "storageVerifiedAt") values ($1, $2, $3, 1, $4, $5, 5, $6, $7, $8, $9, null, null)',
              [
                primary.projectId,
                direct.assetId,
                randomUUID(),
                "invalid/stored-without-object-version",
                digest("dummy"),
                "application/pdf",
                "direct_upload",
                ownerId,
                "stored",
              ]
            ),
            "23514",
            "ProjectDocumentVersion_storage_object_version_once"
          );
        }
      );

      await t.test(
        "Project closure and Membership revocation serialize before worker finalization",
        async () => {
          const closeIntent = await harness.repository.createDirectUploadIntent(
            directInput({
              actorUserId: secondOwnerId,
              projectId: closedProject.projectId,
              operationId: operationId("close-race-intent"),
              expectedProjectRevision: await projectRevision(
                sql,
                closedProject.projectId
              ),
              fileLabel: "close race document",
            })
          );
          const closeWorkerKey = "close-race-worker";
          harness.storagePayloads.set(
            closeWorkerKey,
            storageResult({
              projectId: closedProject.projectId,
              versionId: closeIntent.versionId,
              generation: closeIntent.generation,
              storageKey:
                "project-document/" +
                closedProject.projectId +
                "/" +
                closeIntent.assetId +
                "/" +
                closeIntent.versionId,
              sha256: digest("close race document"),
              byteSize: "close race document".length,
              outcome: "stored",
              objectVersionId: "synthetic-close-race-object",
            })
          );
          let releaseCloseWorker: (() => void) | undefined;
          let reachedCloseClaim: (() => void) | undefined;
          const closeClaimed = new Promise<void>((resolveClaim) => {
            reachedCloseClaim = resolveClaim;
          });
          const closeRelease = new Promise<void>((resolveRelease) => {
            releaseCloseWorker = resolveRelease;
          });
          const pausedCloseRepository = createRepository(
            database,
            {
              async afterWrite(boundary) {
                if (boundary === "operation_claimed") {
                  reachedCloseClaim?.();
                  await closeRelease;
                }
              },
            },
            harness
          ).repository;
          const pendingCloseWorker =
            pausedCloseRepository.finalizeStorage(closeWorkerKey);
          await closeClaimed;
          await projectRepository.closeProject({
            actorUserId: secondOwnerId,
            projectId: closedProject.projectId,
            expectedRevision: await projectRevision(
              sql,
              closedProject.projectId
            ),
            operationId: operationId("close-during-storage-finalize"),
          });
          releaseCloseWorker?.();
          await expectPersistenceCode(pendingCloseWorker, "project_closed");
          assert.equal(
            await count(
              sql,
              'select count(*)::text as count from "ProjectOperation" where "actorKind" = $1 and "resultId" = $2',
              ["service", closeIntent.versionId]
            ),
            0
          );

          assert.ok(memberImport);
          const memberStorageKey = "membership-revoke-race-worker";
          harness.storagePayloads.set(
            memberStorageKey,
            storageResult({
              projectId: primary.projectId,
              versionId: memberImport.versionId,
              generation: memberImport.generation,
              storageKey:
                "project-document/" +
                primary.projectId +
                "/" +
                memberImport.assetId +
                "/" +
                memberImport.versionId,
              sha256: source.sha256,
              byteSize: source.byteSize,
              outcome: "stored",
              objectVersionId: "synthetic-membership-race-object",
            })
          );
          let releaseMemberWorker: (() => void) | undefined;
          let reachedMemberClaim: (() => void) | undefined;
          const memberClaimed = new Promise<void>((resolveClaim) => {
            reachedMemberClaim = resolveClaim;
          });
          const memberRelease = new Promise<void>((resolveRelease) => {
            releaseMemberWorker = resolveRelease;
          });
          const pausedMemberRepository = createRepository(
            database,
            {
              async afterWrite(boundary) {
                if (boundary === "operation_claimed") {
                  reachedMemberClaim?.();
                  await memberRelease;
                }
              },
            },
            harness
          ).repository;
          const pendingMemberWorker =
            pausedMemberRepository.finalizeStorage(memberStorageKey);
          await memberClaimed;
          await projectRepository.revokeProjectMembership({
            actorUserId: ownerId,
            projectId: primary.projectId,
            membershipId,
            expectedRevision: await projectRevision(sql, primary.projectId),
            operationId: operationId("revoke-before-storage-finalize"),
          });
          releaseMemberWorker?.();
          await expectPersistenceCode(pendingMemberWorker, "project_forbidden");
          assert.equal(
            await count(
              sql,
              'select count(*)::text as count from "ProjectOperation" where "actorKind" = $1 and "resultId" = $2',
              ["service", memberImport.versionId]
            ),
            0
          );
          await assertProjectEventLedger(sql, primary.projectId);
          await assertProjectEventLedger(sql, closedProject.projectId);
        }
      );

      await t.test(
        "B1 audit rows block deletes and post-event changes without weakening the M1 pre-event invitation transition",
        async () => {
          const [event] = await rows<{ id: string; operationRecordId: string }>(
            sql,
            'select "id", "operationRecordId" from "ProjectEvent" where "projectId" = $1 order by "projectRevision" desc limit 1',
            [primary.projectId]
          );
          assert.ok(event);
          await expectConstraint(
            sql`delete from "ProjectEvent" where "id" = ${event.id}`,
            "23514",
            "ProjectEvent_delete_protected"
          );
          await expectConstraint(
            sql`update "ProjectEvent" set "createdAt" = "createdAt" + interval '1 millisecond' where "id" = ${event.id}`,
            "23514",
            "ProjectEvent_immutable"
          );
          await expectConstraint(
            sql`delete from "ProjectOperation" where "id" = ${event.operationRecordId}`,
            "23514",
            "ProjectOperation_delete_protected"
          );
          await expectConstraint(
            sql`update "ProjectOperation" set "requestHash" = ${"f".repeat(64)} where "id" = ${event.operationRecordId}`,
            "23514",
            "ProjectOperation_immutable"
          );

          const [run] = await rows<{ id: string }>(
            sql,
            'select "id" from "ProjectDocumentProcessingRun" where "projectId" = $1 and "status" in (\'completed\', \'failed\') limit 1',
            [primary.projectId]
          );
          assert.ok(run);
          await expectConstraint(
            sql`delete from "ProjectDocumentProcessingRun" where "id" = ${run.id}`,
            "23514",
            "ProjectDocumentProcessingRun_delete_protected"
          );
          await expectConstraint(
            sql`update "ProjectDocumentProcessingRun" set "errorCode" = 'tampered' where "id" = ${run.id}`,
            "23514",
            "ProjectDocumentProcessingRun_terminal_immutable"
          );

          const targetUserId = await insertUser(sql, "b1-invite-target");
          userIds.push(targetUserId);
          const operationKey = operationId("b1-invite-without-event");
          const membershipId = randomUUID();
          await assert.rejects(
            sql.begin(async (tx) => {
              await tx.unsafe(
                'insert into "ProjectOperation" ("actorUserId", "operationType", "operationId", "requestHash", "resultKind", "resultId") values ($1, \'membership_invite\', $2, $3, \'project\', $4)',
                [ownerId, operationKey, "a".repeat(64), primary.projectId]
              );
              await tx.unsafe(
                'insert into "ProjectMembership" ("id", "projectId", "userId", "status", "invitedByUserId") values ($1, $2, $3, \'pending\', $4)',
                [membershipId, primary.projectId, targetUserId, ownerId]
              );
              await tx.unsafe(
                'update "ProjectOperation" set "resultKind" = \'membership\', "resultId" = $1 where "operationId" = $2',
                [membershipId, operationKey]
              );
            }),
            (error: unknown) => {
              assert.ok(isPostgresError(error));
              assert.equal(error.code, "23514");
              assert.equal(
                error.constraint_name,
                "ProjectOperation_membership_event_required"
              );
              return true;
            }
          );
          assert.equal(
            await count(
              sql,
              'select count(*)::text as count from "ProjectOperation" where "operationId" = $1',
              [operationKey]
            ),
            0
          );
          assert.equal(
            await count(
              sql,
              'select count(*)::text as count from "ProjectMembership" where "id" = $1',
              [membershipId]
            ),
            0
          );
        }
      );

      await t.test(
        "repository has no runtime route, widget, or AI consumer",
        async () => {
          const projectRoot = resolve(".");
          const scanRoots = ["app", "components", "lib"].map((path) =>
            join(projectRoot, path)
          );
          const files = (
            await Promise.all(scanRoots.map((root) => collectSourceFiles(root)))
          )
            .flat()
            .filter(
              (path) =>
                !path.startsWith(
                  `${join(projectRoot, "lib", "project-documents")}/`
                )
            );
          const reference =
            /from\s+["'][^"']*project-documents\/postgres-repository(?:\.ts)?["']/u;
          for (const path of files) {
            const source = await readFile(path, "utf8");
            assert.doesNotMatch(source, reference, path);
          }
        }
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);
