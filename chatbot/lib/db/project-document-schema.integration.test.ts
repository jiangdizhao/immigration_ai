// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions are scoped to guarded disposable PostgreSQL tests.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const TEST_DATABASE_URL =
  process.env.PHASE13_M1_1_TEST_DATABASE_URL?.trim() ?? "";
const EXPECTED_DATABASE = "immigration_ai_phase13_m1_1_test";
const EXPECTED_MIGRATION_HEAD = "0031_sour_scarecrow";
const skipReason = TEST_DATABASE_URL
  ? false
  : "PHASE13_M1_1_TEST_DATABASE_URL is not configured (isolated database required)";

type TestSql = ReturnType<typeof postgres>;

function assertConfiguredTarget(url: string) {
  const parsed = new URL(url);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.equal(parsed.pathname.replace(/^\//u, ""), EXPECTED_DATABASE);
  assert.ok(
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname),
    "refusing a non-local PostgreSQL target"
  );
}

async function migrateThroughM1(sql: TestSql) {
  const migrationDirectory = resolve("lib/db/migrations");
  const journalPath = join(migrationDirectory, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
    version: string;
    dialect: string;
    entries: Array<{
      idx: number;
      version: string;
      when: number;
      tag: string;
      breakpoints: boolean;
    }>;
  };
  assert.equal(journal.entries.at(-1)?.tag, EXPECTED_MIGRATION_HEAD);
  const m1Entries = journal.entries.slice(0, -1);
  const scratch = await mkdtemp(join(tmpdir(), "phase13-m2-a0-base-"));
  try {
    await mkdir(join(scratch, "meta"), { recursive: true });
    await writeFile(
      join(scratch, "meta", "_journal.json"),
      JSON.stringify({ ...journal, entries: m1Entries })
    );
    await Promise.all(
      m1Entries.map((entry) =>
        copyFile(
          join(migrationDirectory, `${entry.tag}.sql`),
          join(scratch, `${entry.tag}.sql`)
        )
      )
    );
    await migrate(drizzle(sql), { migrationsFolder: scratch });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function insertUser(sql: TestSql, label: string) {
  const email = `${label.slice(0, 12)}-${randomUUID().slice(0, 8)}@test.invalid`;
  const [row] = await sql<{ id: string }[]>`
    insert into "User" ("email", "password")
    values (${email}, ${"x".repeat(64)})
    returning "id"
  `;
  return row.id;
}

async function insertProject(
  sql: TestSql,
  ownerUserId: string,
  withCreationEvent = false
) {
  const id = randomUUID();
  await sql`
    insert into "StudyJourneyProject" ("id", "ownerUserId")
    values (${id}, ${ownerUserId})
  `;
  if (withCreationEvent) {
    const operationId = randomUUID();
    await sql`
      insert into "ProjectOperation" (
        "id", "actorUserId", "operationType", "operationId", "requestHash",
        "resultKind", "resultId"
      ) values (
        ${operationId}, ${ownerUserId}, 'project_create',
        ${`m2a0-${randomUUID()}`}, ${"a".repeat(64)}, 'project', ${id}
      )
    `;
    await sql`
      insert into "ProjectEvent" (
        "projectId", "actorUserId", "projectRevision", "eventType",
        "subjectKind", "subjectId", "operationRecordId"
      ) values (
        ${id}, ${ownerUserId}, 1, 'project_created', 'project', ${id}, ${operationId}
      )
    `;
  }
  return id;
}

async function seedStandaloneChat(sql: TestSql, ownerUserId: string) {
  const chatId = randomUUID();
  const turnId = randomUUID();
  const createdAt = new Date("2026-10-01T00:00:00.000Z");
  const createdAtIso = createdAt.toISOString();
  await sql`
    insert into "Chat" ("id", "createdAt", "title", "userId", "visibility")
    values (${chatId}, ${createdAtIso}, 'M2-A0 Standalone fixture', ${ownerUserId}, 'private')
  `;
  await sql`
    insert into "ImmigrationConversation" (
      "chatId", "legalMatterId", "title", "createdAt", "updatedAt"
    ) values (${chatId}, null, 'M2-A0 Standalone fixture', ${createdAtIso}, ${createdAtIso})
  `;
  await sql`
    insert into "ConversationTurn" (
      "id", "chatId", "userId", "clientTurnId", "status", "requestHash",
      "executionOwnerId", "executionAttempt", "createdAt", "updatedAt"
    ) values (
      ${turnId}, ${chatId}, ${ownerUserId}, 'm2a0-preserved-turn',
      'assistant_persisted', ${"b".repeat(64)}, 'm2a0-test-fence', 1,
      ${createdAtIso}, ${createdAtIso}
    )
  `;
  const [chat] = await sql<Record<string, unknown>[]>`
    select * from "Chat" where "id" = ${chatId}
  `;
  const [conversation] = await sql<Record<string, unknown>[]>`
    select * from "ImmigrationConversation" where "chatId" = ${chatId}
  `;
  const [turn] = await sql<Record<string, unknown>[]>`
    select * from "ConversationTurn" where "id" = ${turnId}
  `;
  return { chatId, turnId, chat, conversation, turn };
}

async function insertAsset(
  sql: TestSql,
  input: { projectId: string; createdByUserId: string }
) {
  const id = randomUUID();
  await sql`
    insert into "ProjectDocumentAsset" ("id", "projectId", "createdByUserId")
    values (${id}, ${input.projectId}, ${input.createdByUserId})
  `;
  return id;
}

async function insertVersion(
  sql: TestSql,
  input: {
    projectId: string;
    assetId: string;
    uploadedByUserId: string;
    versionNumber: number;
    storageKey?: string;
    sha256?: string;
    originKind?: "direct_upload" | "explicit_chat_import";
    storageStatus?: string;
    securityStatus?: string;
  }
) {
  const versionId = randomUUID();
  const storageKey = input.storageKey ?? `synthetic/m2-a0/${randomUUID()}`;
  const sha256 =
    input.sha256 ??
    randomUUID().replaceAll("-", "").padEnd(64, "c").slice(0, 64);
  await sql`
    insert into "ProjectDocumentVersion" (
              "versionId", "projectId", "assetId", "versionNumber", "storageKey",
              "sha256", "byteSize", "canonicalMime", "originKind", "uploadedByUserId",
      "storageStatus", "securityStatus"
    ) values (
      ${versionId}, ${input.projectId}, ${input.assetId}, ${input.versionNumber},
      ${storageKey}, ${sha256}, 128, 'application/pdf', ${input.originKind ?? "direct_upload"},
      ${input.uploadedByUserId}, ${input.storageStatus ?? "pending"},
      ${input.securityStatus ?? "pending"}
    )
  `;
  return { versionId, storageKey, sha256 };
}

async function expectConstraint(
  operation: Promise<unknown>,
  code: string,
  constraintName?: string
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof Error);
    const pgError = error as Error & {
      code?: string;
      constraint_name?: string;
    };
    assert.equal(pgError.code, code);
    if (constraintName) {
      assert.equal(pgError.constraint_name, constraintName);
    }
    return true;
  });
}

async function expectTerminalRunMutationRejectedUnchanged(
  sql: TestSql,
  runId: string,
  update: () => Promise<unknown>
) {
  const [before] = await sql<Record<string, unknown>[]>`
    select * from "ProjectDocumentProcessingRun" where "id" = ${runId}
  `;
  assert.ok(before);
  await expectConstraint(
    update(),
    "23514",
    "ProjectDocumentProcessingRun_terminal_immutable"
  );
  const [after] = await sql<Record<string, unknown>[]>`
    select * from "ProjectDocumentProcessingRun" where "id" = ${runId}
  `;
  assert.deepEqual(after, before);
}

test(
  "M2-A0 migration adds inert Project document schema and preserves M1/Standalone rows",
  { skip: skipReason },
  async (t) => {
    assertConfiguredTarget(TEST_DATABASE_URL);
    const sql = postgres(TEST_DATABASE_URL, {
      max: 6,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
      onnotice: () => undefined,
    });
    const userIds: string[] = [];
    const projectIds: string[] = [];
    const assetIds: string[] = [];
    const versionIds: string[] = [];
    const grantIds: string[] = [];
    const runIds: string[] = [];
    let standalone: Awaited<ReturnType<typeof seedStandaloneChat>> | null =
      null;

    try {
      const [identity] = await sql<
        { database: string; serverVersion: string }[]
      >`
        select current_database() as database,
               current_setting('server_version_num') as "serverVersion"
      `;
      assert.equal(identity?.database, EXPECTED_DATABASE);
      assert.ok(Number(identity?.serverVersion) >= 140_000);
      const [initial] = await sql<{ tables: string; hasLedger: boolean }[]>`
        select
          (select count(*)::text from information_schema.tables where table_schema = 'public') as tables,
          to_regclass('drizzle.__drizzle_migrations') is not null as "hasLedger"
      `;
      assert.equal(initial?.tables, "0", "run the guarded test-db reset first");
      assert.equal(initial?.hasLedger, false);

      await migrateThroughM1(sql);

      const ownerId = await insertUser(sql, "m2a0-owner");
      userIds.push(ownerId);
      const secondOwnerId = await insertUser(sql, "m2a0-owner2");
      userIds.push(secondOwnerId);
      const recipientId = await insertUser(sql, "m2a0-recipient");
      userIds.push(recipientId);
      const projectId = await insertProject(sql, ownerId, true);
      projectIds.push(projectId);
      const secondProjectId = await insertProject(sql, secondOwnerId);
      projectIds.push(secondProjectId);
      standalone = await seedStandaloneChat(sql, ownerId);

      const [projectBefore] = await sql<Record<string, unknown>[]>`
        select * from "StudyJourneyProject" where "id" = ${projectId}
      `;
      const [operationBefore] = await sql<Record<string, unknown>[]>`
        select * from "ProjectOperation" where "resultId" = ${projectId}
      `;
      const [eventBefore] = await sql<Record<string, unknown>[]>`
        select * from "ProjectEvent" where "projectId" = ${projectId}
      `;

      await migrate(drizzle(sql), {
        migrationsFolder: resolve("lib/db/migrations"),
      });

      const [migrationCount] = await sql<{ count: string }[]>`
        select count(*)::text as count from drizzle.__drizzle_migrations
      `;
      assert.equal(Number(migrationCount?.count), 32);
      const [projectAfter] = await sql<Record<string, unknown>[]>`
        select * from "StudyJourneyProject" where "id" = ${projectId}
      `;
      const [operationAfter] = await sql<Record<string, unknown>[]>`
        select * from "ProjectOperation" where "resultId" = ${projectId}
      `;
      const [eventAfter] = await sql<Record<string, unknown>[]>`
        select * from "ProjectEvent" where "projectId" = ${projectId}
      `;
      assert.deepEqual(projectAfter, projectBefore);
      assert.deepEqual(operationAfter, operationBefore);
      assert.deepEqual(eventAfter, eventBefore);
      const [chatAfter] = await sql<Record<string, unknown>[]>`
        select * from "Chat" where "id" = ${standalone.chatId}
      `;
      const [conversationAfter] = await sql<Record<string, unknown>[]>`
        select * from "ImmigrationConversation" where "chatId" = ${standalone.chatId}
      `;
      const [turnAfter] = await sql<Record<string, unknown>[]>`
        select * from "ConversationTurn" where "id" = ${standalone.turnId}
      `;
      assert.deepEqual(chatAfter, standalone.chat);
      assert.deepEqual(conversationAfter, standalone.conversation);
      assert.deepEqual(turnAfter, standalone.turn);
      const [associationCount] = await sql<{ count: string }[]>`
        select count(*)::text as count from "ProjectConversation"
        where "chatId" = ${standalone.chatId}
      `;
      assert.equal(associationCount?.count, "0");

      const projectTables = await sql<{ tableName: string }[]>`
        select table_name as "tableName" from information_schema.tables
        where table_schema = 'public'
          and (table_name like 'Project%' or table_name = 'StudyJourneyProject')
        order by table_name
      `;
      assert.deepEqual(
        projectTables.map((row) => row.tableName),
        [
          "ProjectConversation",
          "ProjectDocumentAsset",
          "ProjectDocumentGrant",
          "ProjectDocumentProcessingRun",
          "ProjectDocumentVersion",
          "ProjectEvent",
          "ProjectMembership",
          "ProjectOperation",
          "StudyJourneyProject",
        ]
      );

      await t.test(
        "version keys, state checks, and identity immutability",
        async () => {
          const assetId = await insertAsset(sql, {
            projectId,
            createdByUserId: ownerId,
          });
          assetIds.push(assetId);
          const otherAssetId = await insertAsset(sql, {
            projectId: secondProjectId,
            createdByUserId: secondOwnerId,
          });
          assetIds.push(otherAssetId);
          const otherVersion = await insertVersion(sql, {
            projectId: secondProjectId,
            assetId: otherAssetId,
            uploadedByUserId: secondOwnerId,
            versionNumber: 1,
          });
          versionIds.push(otherVersion.versionId);
          const version = await insertVersion(sql, {
            projectId,
            assetId,
            uploadedByUserId: ownerId,
            versionNumber: 1,
          });
          versionIds.push(version.versionId);

          const [pending] = await sql<
            {
              storageStatus: string;
              securityStatus: string;
              processingGeneration: number;
            }[]
          >`
          select "storageStatus", "securityStatus", "processingGeneration"
          from "ProjectDocumentVersion" where "versionId" = ${version.versionId}
        `;
          assert.deepEqual(pending, {
            storageStatus: "pending",
            securityStatus: "pending",
            processingGeneration: 1,
          });
          await sql`
          update "ProjectDocumentVersion" set "storageStatus" = 'stored'
          where "versionId" = ${version.versionId}
        `;
          const [afterStorage] = await sql<
            { storageStatus: string; securityStatus: string }[]
          >`
          select "storageStatus", "securityStatus" from "ProjectDocumentVersion"
          where "versionId" = ${version.versionId}
        `;
          assert.deepEqual(afterStorage, {
            storageStatus: "stored",
            securityStatus: "pending",
          });
          await sql`
          update "ProjectDocumentVersion" set "securityStatus" = 'failed'
          where "versionId" = ${version.versionId}
        `;
          const [afterSecurity] = await sql<
            { storageStatus: string; securityStatus: string }[]
          >`
          select "storageStatus", "securityStatus" from "ProjectDocumentVersion"
          where "versionId" = ${version.versionId}
        `;
          assert.deepEqual(afterSecurity, {
            storageStatus: "stored",
            securityStatus: "failed",
          });

          await expectConstraint(
            insertVersion(sql, {
              projectId,
              assetId,
              uploadedByUserId: ownerId,
              versionNumber: 1,
            }),
            "23505",
            "ProjectDocumentVersion_project_asset_number_unique"
          );
          await expectConstraint(
            insertVersion(sql, {
              projectId,
              assetId,
              uploadedByUserId: ownerId,
              versionNumber: 2,
              storageKey: version.storageKey,
            }),
            "23505",
            "ProjectDocumentVersion_storage_key_unique"
          );
          await expectConstraint(
            insertVersion(sql, {
              projectId,
              assetId: otherAssetId,
              uploadedByUserId: ownerId,
              versionNumber: 1,
            }),
            "23503",
            "ProjectDocumentVersion_project_asset_fk"
          );
          await expectConstraint(
            sql`
            insert into "ProjectDocumentVersion" (
              "projectId", "assetId", "versionNumber", "storageKey", "sha256",
              "byteSize", "canonicalMime", "originKind", "uploadedByUserId",
              "storageStatus"
            ) values (
              ${projectId}, ${assetId}, 3, ${`synthetic/${randomUUID()}`},
              ${"f".repeat(64)}, 1, 'application/pdf', 'direct_upload', ${ownerId}, 'uploading'
            )
          `,
            "23514",
            "ProjectDocumentVersion_storage_status_check"
          );
          await expectConstraint(
            sql`
            insert into "ProjectDocumentVersion" (
              "projectId", "assetId", "versionNumber", "storageKey", "sha256",
              "byteSize", "canonicalMime", "originKind", "uploadedByUserId"
            ) values (
              ${projectId}, ${assetId}, 3, ${`synthetic/${randomUUID()}`},
              'invalid-digest', 1, 'application/pdf', 'direct_upload', ${ownerId}
            )
          `,
            "23514",
            "ProjectDocumentVersion_sha256_check"
          );
          await expectConstraint(
            insertVersion(sql, {
              projectId,
              assetId,
              uploadedByUserId: ownerId,
              versionNumber: 3,
              securityStatus: "scan_complete",
            }),
            "23514",
            "ProjectDocumentVersion_security_status_check"
          );
          await expectConstraint(
            sql`
            update "ProjectDocumentVersion" set "sha256" = ${"d".repeat(64)}
            where "versionId" = ${version.versionId}
          `,
            "23514",
            "ProjectDocumentVersion_identity_immutable"
          );
          await expectConstraint(
            sql`
            update "ProjectDocumentAsset" set "projectId" = ${secondProjectId}
            where "id" = ${assetId}
          `,
            "23514",
            "ProjectDocumentAsset_identity_immutable"
          );
        }
      );

      await t.test(
        "grant scope, purpose, revocation, and restrictive deletion",
        async () => {
          const [version] = await sql<{ versionId: string; sha256: string }[]>`
          select "versionId", "sha256" from "ProjectDocumentVersion"
          where "projectId" = ${projectId} order by "versionNumber" limit 1
        `;
          const [asset] = await sql<{ id: string }[]>`
          select "id" from "ProjectDocumentAsset" where "projectId" = ${projectId} limit 1
        `;
          const [otherVersion] = await sql<
            { versionId: string; sha256: string }[]
          >`
          select "versionId", "sha256" from "ProjectDocumentVersion"
          where "projectId" = ${secondProjectId} limit 1
        `;
          assert.ok(version && asset && otherVersion);

          const grantId = randomUUID();
          await sql`
          insert into "ProjectDocumentGrant" (
            "id", "projectId", "assetId", "versionId", "grantorUserId",
            "grantorAuthorityBasis", "granteeKind", "granteeUserId", "purpose"
          ) values (
            ${grantId}, ${projectId}, ${asset.id}, ${version.versionId}, ${ownerId},
            'synthetic_test', 'user', ${recipientId}, 'content_read'
          )
        `;
          grantIds.push(grantId);
          const projectGrantId = randomUUID();
          await sql`
          insert into "ProjectDocumentGrant" (
            "id", "projectId", "assetId", "versionId", "grantorUserId",
            "grantorAuthorityBasis", "granteeKind", "purpose"
          ) values (
            ${projectGrantId}, ${projectId}, ${asset.id}, ${version.versionId}, ${ownerId},
            'synthetic_test', 'project', 'ai_context'
          )
        `;
          grantIds.push(projectGrantId);
          await expectConstraint(
            sql`
            insert into "ProjectDocumentGrant" (
              "projectId", "assetId", "versionId", "grantorUserId",
              "grantorAuthorityBasis", "granteeKind", "granteeUserId", "purpose"
            ) values (
              ${projectId}, ${asset.id}, ${version.versionId}, ${ownerId},
              'synthetic_test', 'user', ${recipientId}, 'content_read'
            )
          `,
            "23505",
            "ProjectDocumentGrant_active_scope_purpose_unique"
          );
          await expectConstraint(
            sql`
            insert into "ProjectDocumentGrant" (
              "projectId", "assetId", "versionId", "grantorUserId",
              "grantorAuthorityBasis", "granteeKind", "purpose"
            ) values (
              ${projectId}, ${asset.id}, ${version.versionId}, ${ownerId},
              'synthetic_test', 'user', 'content_read'
            )
          `,
            "23514",
            "ProjectDocumentGrant_recipient_shape_check"
          );
          await expectConstraint(
            sql`
            insert into "ProjectDocumentGrant" (
              "projectId", "assetId", "versionId", "grantorUserId",
              "grantorAuthorityBasis", "granteeKind", "granteeUserId", "purpose"
            ) values (
              ${projectId}, ${asset.id}, ${version.versionId}, ${ownerId},
              'synthetic_test', 'user', ${recipientId}, 'all_access'
            )
          `,
            "23514",
            "ProjectDocumentGrant_purpose_check"
          );
          await expectConstraint(
            sql`
            insert into "ProjectDocumentGrant" (
              "projectId", "assetId", "versionId", "grantorUserId",
              "grantorAuthorityBasis", "granteeKind", "granteeUserId", "purpose"
            ) values (
              ${projectId}, ${asset.id}, ${otherVersion.versionId}, ${ownerId},
              'synthetic_test', 'user', ${recipientId}, 'download'
            )
          `,
            "23503",
            "ProjectDocumentGrant_project_asset_version_fk"
          );

          const revokedAt = new Date().toISOString();
          await sql`
          update "ProjectDocumentGrant"
          set "revokedAt" = ${revokedAt}, "revision" = 2
          where "id" = ${grantId}
        `;
          const replacementGrantId = randomUUID();
          await sql`
          insert into "ProjectDocumentGrant" (
            "id", "projectId", "assetId", "versionId", "grantorUserId",
            "grantorAuthorityBasis", "granteeKind", "granteeUserId", "purpose"
          ) values (
            ${replacementGrantId}, ${projectId}, ${asset.id}, ${version.versionId}, ${ownerId},
            'synthetic_test', 'user', ${recipientId}, 'content_read'
          )
        `;
          grantIds.push(replacementGrantId);
          await expectConstraint(
            sql`
            update "ProjectDocumentGrant" set "revokedAt" = null
            where "id" = ${grantId}
          `,
            "23514",
            "ProjectDocumentGrant_revocation_terminal"
          );
          await expectConstraint(
            sql`
            update "ProjectDocumentGrant" set "purpose" = 'ai_context'
            where "id" = ${replacementGrantId}
          `,
            "23514",
            "ProjectDocumentGrant_identity_immutable"
          );

          const runId = randomUUID();
          await sql`
          insert into "ProjectDocumentProcessingRun" (
            "id", "projectId", "versionId", "generation", "operationKind",
            "providerCode", "providerEventId", "servicePrincipalCode",
            "objectSha256"
          ) values (
            ${runId}, ${projectId}, ${version.versionId}, 1, 'scan',
            'synthetic_test', 'm2a0-event-1', 'm2a0_test_worker', ${version.sha256}
          )
        `;
          runIds.push(runId);
          await expectConstraint(
            sql`
            insert into "ProjectDocumentProcessingRun" (
              "projectId", "versionId", "generation", "operationKind",
              "providerCode", "providerEventId", "servicePrincipalCode", "objectSha256"
            ) values (
              ${projectId}, ${version.versionId}, 1, 'scan',
              'synthetic_test', 'm2a0-event-2', 'm2a0_test_worker', ${version.sha256}
            )
          `,
            "23505",
            "ProjectDocRun_project_version_generation_kind_unique"
          );
          await expectConstraint(
            sql`
            insert into "ProjectDocumentProcessingRun" (
              "projectId", "versionId", "generation", "operationKind",
              "providerCode", "providerEventId", "servicePrincipalCode", "objectSha256"
            ) values (
              ${projectId}, ${version.versionId}, 2, 'scan',
              'synthetic_test', 'm2a0-event-1', 'm2a0_test_worker', ${version.sha256}
            )
          `,
            "23505",
            "ProjectDocumentProcessingRun_provider_event_unique"
          );
          await expectConstraint(
            sql`
            insert into "ProjectDocumentProcessingRun" (
              "projectId", "versionId", "generation", "operationKind",
              "providerCode", "servicePrincipalCode", "objectSha256"
            ) values (
              ${projectId}, ${version.versionId}, 0, 'scan',
              'synthetic_test', 'm2a0_test_worker', ${version.sha256}
            )
          `,
            "23514",
            "ProjectDocumentProcessingRun_generation_check"
          );
          await expectConstraint(
            sql`
            insert into "ProjectDocumentProcessingRun" (
              "projectId", "versionId", "generation", "operationKind",
              "providerCode", "servicePrincipalCode", "objectSha256"
            ) values (
              ${projectId}, ${version.versionId}, 2, 'scan',
              'synthetic_test', 'm2a0_test_worker', ${"e".repeat(64)}
            )
          `,
            "23503",
            "ProjectDocumentProcessingRun_project_version_sha256_fk"
          );
          await expectConstraint(
            sql`
            insert into "ProjectDocumentProcessingRun" (
              "projectId", "versionId", "generation", "operationKind",
              "providerCode", "servicePrincipalCode", "objectSha256"
            ) values (
              ${projectId}, ${otherVersion.versionId}, 1, 'scan',
              'synthetic_test', 'm2a0_test_worker', ${otherVersion.sha256}
            )
          `,
            "23503",
            "ProjectDocumentProcessingRun_project_version_sha256_fk"
          );
          await expectConstraint(
            sql`
            update "ProjectDocumentProcessingRun" set "generation" = 3
            where "id" = ${runId}
          `,
            "23514",
            "ProjectDocumentProcessingRun_identity_immutable"
          );

          const completedAt = new Date(Date.now() + 1000).toISOString();
          await sql`
          update "ProjectDocumentProcessingRun"
          set "status" = 'completed', "verdict" = 'result.v2', "completedAt" = ${completedAt}
          where "id" = ${runId}
        `;
          const [completedRun] = await sql<Record<string, unknown>[]>`
          select * from "ProjectDocumentProcessingRun" where "id" = ${runId}
        `;
          assert.equal(completedRun?.status, "completed");
          assert.equal(completedRun?.verdict, "result.v2");

          await sql`
          update "ProjectDocumentProcessingRun" set "verdict" = "verdict"
          where "id" = ${runId}
        `;
          const [completedNoOp] = await sql<Record<string, unknown>[]>`
          select * from "ProjectDocumentProcessingRun" where "id" = ${runId}
        `;
          assert.deepEqual(completedNoOp, completedRun);

          const laterCompletedAt = new Date(
            Date.parse(completedAt) + 60_000
          ).toISOString();
          await expectTerminalRunMutationRejectedUnchanged(
            sql,
            runId,
            () => sql`
            update "ProjectDocumentProcessingRun"
            set "status" = 'started', "verdict" = null,
                "completedAt" = null, "errorCode" = null
            where "id" = ${runId}
          `
          );
          await expectTerminalRunMutationRejectedUnchanged(
            sql,
            runId,
            () => sql`
            update "ProjectDocumentProcessingRun"
            set "status" = 'failed', "verdict" = null, "errorCode" = 'run.failed'
            where "id" = ${runId}
          `
          );
          await expectTerminalRunMutationRejectedUnchanged(
            sql,
            runId,
            () => sql`
            update "ProjectDocumentProcessingRun" set "verdict" = 'result.v3'
            where "id" = ${runId}
          `
          );
          await expectTerminalRunMutationRejectedUnchanged(
            sql,
            runId,
            () => sql`
            update "ProjectDocumentProcessingRun" set "completedAt" = ${laterCompletedAt}
            where "id" = ${runId}
          `
          );
          await expectTerminalRunMutationRejectedUnchanged(
            sql,
            runId,
            () => sql`
            update "ProjectDocumentProcessingRun" set "providerEventId" = 'm2a0-event-updated'
            where "id" = ${runId}
          `
          );

          const nullEventCompletedRunId = randomUUID();
          await sql`
          insert into "ProjectDocumentProcessingRun" (
            "id", "projectId", "versionId", "generation", "operationKind",
            "providerCode", "servicePrincipalCode", "objectSha256"
          ) values (
            ${nullEventCompletedRunId}, ${projectId}, ${version.versionId}, 3,
            'scan', 'synthetic_test', 'm2a0_test_worker', ${version.sha256}
          )
        `;
          runIds.push(nullEventCompletedRunId);
          const nullEventCompletedAt = new Date(
            Date.now() + 60_000
          ).toISOString();
          await sql`
          update "ProjectDocumentProcessingRun"
          set "status" = 'completed', "verdict" = 'result.no_event',
              "completedAt" = ${nullEventCompletedAt}
          where "id" = ${nullEventCompletedRunId}
        `;
          await expectTerminalRunMutationRejectedUnchanged(
            sql,
            nullEventCompletedRunId,
            () => sql`
              update "ProjectDocumentProcessingRun" set "providerEventId" = 'm2a0-late-event'
              where "id" = ${nullEventCompletedRunId}
            `
          );

          const failedRunId = randomUUID();
          await sql`
          insert into "ProjectDocumentProcessingRun" (
            "id", "projectId", "versionId", "generation", "operationKind",
            "providerCode", "servicePrincipalCode", "objectSha256"
          ) values (
            ${failedRunId}, ${projectId}, ${version.versionId}, 2, 'scan',
            'synthetic_test', 'm2a0_test_worker', ${version.sha256}
          )
        `;
          runIds.push(failedRunId);
          const failedAt = new Date(Date.now() + 60_000).toISOString();
          await sql`
          update "ProjectDocumentProcessingRun"
          set "status" = 'failed', "errorCode" = 'worker.failed_v2',
              "completedAt" = ${failedAt}
          where "id" = ${failedRunId}
        `;
          const [failedRun] = await sql<Record<string, unknown>[]>`
          select * from "ProjectDocumentProcessingRun" where "id" = ${failedRunId}
        `;
          assert.equal(failedRun?.status, "failed");
          assert.equal(failedRun?.errorCode, "worker.failed_v2");

          await sql`
          update "ProjectDocumentProcessingRun" set "errorCode" = "errorCode"
          where "id" = ${failedRunId}
        `;
          const [failedNoOp] = await sql<Record<string, unknown>[]>`
          select * from "ProjectDocumentProcessingRun" where "id" = ${failedRunId}
        `;
          assert.deepEqual(failedNoOp, failedRun);

          await expectTerminalRunMutationRejectedUnchanged(
            sql,
            failedRunId,
            () => sql`
            update "ProjectDocumentProcessingRun"
            set "status" = 'started', "errorCode" = null, "completedAt" = null
            where "id" = ${failedRunId}
          `
          );
          await expectTerminalRunMutationRejectedUnchanged(
            sql,
            failedRunId,
            () => sql`
            update "ProjectDocumentProcessingRun"
            set "status" = 'completed', "errorCode" = null, "verdict" = 'result.recovered'
            where "id" = ${failedRunId}
          `
          );
          await expectTerminalRunMutationRejectedUnchanged(
            sql,
            failedRunId,
            () => sql`
            update "ProjectDocumentProcessingRun" set "errorCode" = 'worker.failed_v3'
            where "id" = ${failedRunId}
          `
          );
          await expectTerminalRunMutationRejectedUnchanged(
            sql,
            failedRunId,
            () => sql`
            update "ProjectDocumentProcessingRun" set "completedAt" = ${laterCompletedAt}
            where "id" = ${failedRunId}
          `
          );
          await expectTerminalRunMutationRejectedUnchanged(
            sql,
            failedRunId,
            () => sql`
            update "ProjectDocumentProcessingRun" set "providerEventId" = 'm2a0-late-failed-event'
            where "id" = ${failedRunId}
          `
          );

          await sql`
          update "ProjectDocumentVersion" set "securityStatus" = 'clean'
          where "versionId" = ${version.versionId}
        `;
          const [cleanState] = await sql<
            { storageStatus: string; securityStatus: string }[]
          >`
          select "storageStatus", "securityStatus" from "ProjectDocumentVersion"
          where "versionId" = ${version.versionId}
        `;
          assert.deepEqual(cleanState, {
            storageStatus: "stored",
            securityStatus: "clean",
          });

          await expectConstraint(
            sql`delete from "StudyJourneyProject" where "id" = ${projectId}`,
            "23503"
          );
          await expectConstraint(
            sql`delete from "ProjectDocumentAsset" where "id" = ${asset.id}`,
            "23503"
          );
          await expectConstraint(
            sql`delete from "ProjectDocumentVersion" where "versionId" = ${version.versionId}`,
            "23503"
          );
          await expectConstraint(
            sql`delete from "User" where "id" = ${recipientId}`,
            "23503"
          );
        }
      );
    } finally {
      if (runIds.length > 0) {
        await sql`delete from "ProjectDocumentProcessingRun" where "id" = any(${sql.array(runIds)}::uuid[])`.catch(
          () => undefined
        );
      }
      if (grantIds.length > 0) {
        await sql`delete from "ProjectDocumentGrant" where "id" = any(${sql.array(grantIds)}::uuid[])`.catch(
          () => undefined
        );
      }
      if (versionIds.length > 0) {
        await sql`delete from "ProjectDocumentVersion" where "versionId" = any(${sql.array(versionIds)}::uuid[])`.catch(
          () => undefined
        );
      }
      if (assetIds.length > 0) {
        await sql`delete from "ProjectDocumentAsset" where "id" = any(${sql.array(assetIds)}::uuid[])`.catch(
          () => undefined
        );
      }
      if (projectIds.length > 0) {
        await sql`delete from "ProjectEvent" where "projectId" = any(${sql.array(projectIds)}::uuid[])`.catch(
          () => undefined
        );
        await sql`delete from "ProjectOperation" where "resultId" = any(${sql.array(projectIds)}::uuid[])`.catch(
          () => undefined
        );
        await sql`delete from "ProjectMembership" where "projectId" = any(${sql.array(projectIds)}::uuid[])`.catch(
          () => undefined
        );
        await sql`delete from "ProjectConversation" where "projectId" = any(${sql.array(projectIds)}::uuid[])`.catch(
          () => undefined
        );
        await sql`delete from "StudyJourneyProject" where "id" = any(${sql.array(projectIds)}::uuid[])`.catch(
          () => undefined
        );
      }
      if (standalone) {
        await sql`delete from "ConversationTurn" where "id" = ${standalone.turnId}`.catch(
          () => undefined
        );
        await sql`delete from "ImmigrationConversation" where "chatId" = ${standalone.chatId}`.catch(
          () => undefined
        );
        await sql`delete from "Chat" where "id" = ${standalone.chatId}`.catch(
          () => undefined
        );
      }
      if (userIds.length > 0) {
        await sql`delete from "User" where "id" = any(${sql.array(userIds)}::uuid[])`.catch(
          () => undefined
        );
      }
      await sql.end({ timeout: 5 });
    }
  }
);
