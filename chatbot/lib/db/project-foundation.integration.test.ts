// biome-ignore-all lint/suspicious/noMisplacedAssertion: helpers are called only by this guarded integration test.
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
import {
  createProjectChatFoundation,
  createProjectFoundationRepository,
  createStudyJourneyProject,
  ProjectFoundationError,
} from "./project-foundation";

const TEST_DATABASE_URL =
  process.env.PHASE13_M1_1_TEST_DATABASE_URL?.trim() ?? "";
const EXPECTED_DATABASE = "immigration_ai_phase13_m1_1_test";
const EXPECTED_MIGRATION_HEAD = "0030_demonic_the_hood";
const skipReason = TEST_DATABASE_URL
  ? false
  : "PHASE13_M1_1_TEST_DATABASE_URL is not configured (isolated database required)";

function assertConfiguredTarget(url: string) {
  const parsed = new URL(url);
  assert.equal(parsed.protocol.startsWith("postgres"), true);
  assert.equal(
    parsed.pathname.replace(/^\//u, ""),
    EXPECTED_DATABASE,
    "refusing M1.1 integration work against a database with the wrong configured name"
  );
  assert.ok(
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname),
    "refusing M1.1 integration work against a non-local database host"
  );
}

async function applyBaseMigrations(sql: ReturnType<typeof postgres>) {
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
  const baseEntries = journal.entries.slice(0, -1);
  const scratch = await mkdtemp(join(tmpdir(), "phase13-m1-1-base-"));
  try {
    await mkdir(join(scratch, "meta"), { recursive: true });
    await writeFile(
      join(scratch, "meta", "_journal.json"),
      JSON.stringify({ ...journal, entries: baseEntries })
    );
    await Promise.all(
      baseEntries.map((entry) =>
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

async function insertUser(
  sql: ReturnType<typeof postgres>,
  label: string
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into "User" ("email", "password")
    values (${`${label.slice(0, 8)}-${randomUUID().replaceAll("-", "").slice(0, 16)}@e.test`}, ${"x".repeat(64)})
    returning "id"
  `;
  return row.id;
}

async function expectProjectError(
  operation: Promise<unknown>,
  code: ProjectFoundationError["code"]
) {
  await assert.rejects(
    operation,
    (error: unknown) =>
      error instanceof ProjectFoundationError && error.code === code
  );
}

async function expectPostgresConstraint(
  operation: Promise<unknown>,
  code: string,
  constraintName: string
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof Error);
    const postgresError = error as Error & {
      code?: string;
      constraint_name?: string;
    };
    assert.equal(postgresError.code, code);
    assert.equal(postgresError.constraint_name, constraintName);
    return true;
  });
}

async function seedStandaloneChat(
  sql: ReturnType<typeof postgres>,
  ownerId: string
) {
  const chatId = randomUUID();
  const turnId = randomUUID();
  const createdAt = new Date("2026-10-01T00:00:00.000Z");
  const createdAtIso = createdAt.toISOString();
  await sql`
    insert into "Chat" ("id", "createdAt", "title", "userId", "visibility")
    values (${chatId}, ${createdAtIso}, 'Standalone before M1.1', ${ownerId}, 'private')
  `;
  await sql`
    insert into "ImmigrationConversation" (
      "chatId", "legalMatterId", "title", "createdAt", "updatedAt"
    ) values (${chatId}, null, 'Standalone before M1.1', ${createdAtIso}, ${createdAtIso})
  `;
  await sql`
    insert into "ConversationTurn" (
      "id", "chatId", "userId", "clientTurnId", "status", "requestHash",
      "executionOwnerId", "executionAttempt", "createdAt", "updatedAt"
    ) values (
      ${turnId}, ${chatId}, ${ownerId}, 'phase13-standalone-preserved',
      'assistant_persisted', ${"a".repeat(64)}, 'fence-before-m11', 2,
      ${createdAtIso}, ${createdAtIso}
    )
  `;
  const [chatRow] = await sql<Record<string, unknown>[]>`
    select * from "Chat" where "id" = ${chatId}
  `;
  const [conversationRow] = await sql<Record<string, unknown>[]>`
    select * from "ImmigrationConversation" where "chatId" = ${chatId}
  `;
  const [turnRow] = await sql<Record<string, unknown>[]>`
    select * from "ConversationTurn" where "id" = ${turnId}
  `;
  return { chatId, turnId, chatRow, conversationRow, turnRow };
}

async function setMembership(
  sql: ReturnType<typeof postgres>,
  input: {
    projectId: string;
    userId: string;
    ownerId: string;
    status: "pending" | "active" | "revoked";
  }
) {
  const now = new Date();
  const nowIso = now.toISOString();
  await sql`
    insert into "ProjectMembership" (
      "projectId", "userId", "status", "invitedByUserId", "acceptedAt", "revokedAt"
    ) values (
      ${input.projectId}, ${input.userId}, ${input.status}, ${input.ownerId},
      ${input.status === "active" ? nowIso : null},
      ${input.status === "revoked" ? nowIso : null}
    )
  `;
}

async function assertMigrationPreservedStandalone(
  sql: ReturnType<typeof postgres>,
  seeded: Awaited<ReturnType<typeof seedStandaloneChat>>
) {
  const [chatRow] = await sql<Record<string, unknown>[]>`
    select * from "Chat" where "id" = ${seeded.chatId}
  `;
  const [conversationRow] = await sql<Record<string, unknown>[]>`
    select * from "ImmigrationConversation" where "chatId" = ${seeded.chatId}
  `;
  const [turnRow] = await sql<Record<string, unknown>[]>`
    select * from "ConversationTurn" where "id" = ${seeded.turnId}
  `;
  assert.deepEqual(chatRow, seeded.chatRow);
  assert.deepEqual(conversationRow, seeded.conversationRow);
  assert.deepEqual(turnRow, seeded.turnRow);
  const association = await sql<{ count: string }[]>`
    select count(*)::text as count from "ProjectConversation"
    where "chatId" = ${seeded.chatId}
  `;
  assert.equal(Number(association[0]?.count ?? 0), 0);
}

test(
  "M1.1 additive migration, constraints, repository transactions and concurrency",
  { skip: skipReason },
  async (t) => {
    assertConfiguredTarget(TEST_DATABASE_URL);
    const sql = postgres(TEST_DATABASE_URL, {
      max: 8,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
      onnotice: () => undefined,
    });
    let seeded: Awaited<ReturnType<typeof seedStandaloneChat>> | null = null;
    const userIds: string[] = [];
    const projectIds: string[] = [];

    try {
      const [identity] = await sql<
        {
          database: string;
          version: string;
        }[]
      >`
        select current_database() as database,
               current_setting('server_version_num') as version
      `;
      assert.equal(
        identity?.database,
        EXPECTED_DATABASE,
        "refusing M1.1 integration work after connected database identity mismatch"
      );
      assert.ok(Number(identity?.version) >= 140_000);
      const [initial] = await sql<{ tables: string; hasLedger: boolean }[]>`
        select
          (select count(*)::text from information_schema.tables where table_schema = 'public') as tables,
          to_regclass('drizzle.__drizzle_migrations') is not null as "hasLedger"
      `;
      assert.equal(initial?.tables, "0", "run the guarded test-db reset first");
      assert.equal(
        initial?.hasLedger,
        false,
        "test database must be fresh before migration proof"
      );

      process.env.POSTGRES_URL = TEST_DATABASE_URL;
      await applyBaseMigrations(sql);
      const ownerId = await insertUser(sql, "owner");
      userIds.push(ownerId);
      const memberId = await insertUser(sql, "member");
      userIds.push(memberId);
      const pendingId = await insertUser(sql, "pending");
      userIds.push(pendingId);
      const revokedId = await insertUser(sql, "revoked");
      userIds.push(revokedId);
      const secondOwnerId = await insertUser(sql, "second-owner");
      userIds.push(secondOwnerId);
      const outsiderId = await insertUser(sql, "outsider");
      userIds.push(outsiderId);
      seeded = await seedStandaloneChat(sql, ownerId);
      assert.ok(seeded);
      const preservedStandaloneChatId = seeded.chatId;

      await migrate(drizzle(sql), {
        migrationsFolder: resolve("lib/db/migrations"),
      });
      await assertMigrationPreservedStandalone(sql, seeded);
      const [migrationCount] = await sql<{ count: string }[]>`
        select count(*)::text as count from drizzle.__drizzle_migrations
      `;
      assert.equal(Number(migrationCount?.count), 31);

      const [inventory] = await sql<
        {
          projects: boolean;
          memberships: boolean;
          conversations: boolean;
          operations: boolean;
          events: boolean;
        }[]
      >`
        select
          to_regclass('public."StudyJourneyProject"') is not null as projects,
          to_regclass('public."ProjectMembership"') is not null as memberships,
          to_regclass('public."ProjectConversation"') is not null as conversations,
          to_regclass('public."ProjectOperation"') is not null as operations,
          to_regclass('public."ProjectEvent"') is not null as events
      `;
      assert.deepEqual(inventory, {
        projects: true,
        memberships: true,
        conversations: true,
        operations: true,
        events: true,
      });

      await t.test(
        "schema inventory stays inside the M1.1 foundation",
        async () => {
          const projectTables = await sql<{ tableName: string }[]>`
          select table_name as "tableName" from information_schema.tables
          where table_schema = 'public'
            and (table_name like 'Project%' or table_name = 'StudyJourneyProject')
          order by table_name
        `;
          assert.deepEqual(
            projectTables.map((row) => row.tableName).sort(),
            [
              "ProjectConversation",
              "ProjectEvent",
              "ProjectMembership",
              "ProjectOperation",
              "StudyJourneyProject",
            ].sort()
          );
          const operationColumns = await sql<{ columnName: string }[]>`
          select column_name as "columnName" from information_schema.columns
          where table_schema = 'public' and table_name = 'ProjectOperation'
        `;
          assert.deepEqual(
            operationColumns.map((row) => row.columnName).sort(),
            [
              "actorUserId",
              "createdAt",
              "id",
              "operationId",
              "operationType",
              "requestHash",
              "resultId",
              "resultKind",
            ].sort()
          );
        }
      );

      await t.test("operation idempotency and Project creation", async () => {
        const created = await createStudyJourneyProject({
          actorUserId: ownerId,
          operationId: "owner-create-primary",
        });
        projectIds.push(created.project.id);
        assert.equal(created.replayed, false);
        assert.equal(created.project.ownerUserId, ownerId);
        assert.equal(created.project.status, "active");
        assert.equal(created.project.revision, 1);
        assert.equal(created.project.closedAt, null);

        const replay = await createStudyJourneyProject({
          actorUserId: ownerId,
          operationId: "owner-create-primary",
        });
        assert.equal(replay.replayed, true);
        assert.equal(replay.project.id, created.project.id);

        const second = await createStudyJourneyProject({
          actorUserId: ownerId,
          operationId: "owner-create-secondary",
        });
        projectIds.push(second.project.id);
        assert.notEqual(second.project.id, created.project.id);

        const sameKeyOtherActor = await createStudyJourneyProject({
          actorUserId: secondOwnerId,
          operationId: "owner-create-primary",
        });
        projectIds.push(sameKeyOtherActor.project.id);
        assert.notEqual(sameKeyOtherActor.project.id, created.project.id);
        const [ownerMemberships] = await sql<{ count: string }[]>`
          select count(*)::text as count from "ProjectMembership"
          where "projectId" = ${created.project.id} and "userId" = ${ownerId}
        `;
        assert.equal(Number(ownerMemberships?.count), 0);
      });

      const projectId = projectIds[0] as string;
      const secondProjectId = projectIds[1] as string;
      await setMembership(sql, {
        projectId,
        userId: memberId,
        ownerId,
        status: "active",
      });
      await setMembership(sql, {
        projectId,
        userId: pendingId,
        ownerId,
        status: "pending",
      });
      await setMembership(sql, {
        projectId,
        userId: revokedId,
        ownerId,
        status: "revoked",
      });

      await t.test("membership and database constraints", async () => {
        const [creationEvent] = await sql<{ operationRecordId: string }[]>`
          select "operationRecordId" from "ProjectEvent"
          where "projectId" = ${projectId} and "projectRevision" = 1
        `;
        assert.ok(creationEvent);

        await assert.rejects(
          sql`
            insert into "ProjectMembership" ("projectId", "userId", "status", "invitedByUserId")
            values (${projectId}, ${memberId}, 'pending', ${ownerId})
          `
        );
        await assert.rejects(
          sql`
            insert into "ProjectMembership" ("projectId", "userId", "status", "invitedByUserId")
            values (${projectId}, ${outsiderId}, 'invited', ${ownerId})
          `
        );
        await assert.rejects(
          sql`
            insert into "ProjectMembership" ("projectId", "userId", "status", "invitedByUserId")
            values (${randomUUID()}, ${outsiderId}, 'pending', ${ownerId})
          `
        );
        await assert.rejects(
          sql`
            insert into "StudyJourneyProject" ("ownerUserId", "status")
            values (${ownerId}, 'pending')
          `
        );
        await assert.rejects(
          sql`
            insert into "StudyJourneyProject" ("ownerUserId", "revision")
            values (${ownerId}, 0)
          `
        );
        await assert.rejects(
          sql`
            insert into "StudyJourneyProject" ("ownerUserId", "status", "revision", "closedAt")
            values (${ownerId}, 'closed', 1, null)
          `
        );
        await assert.rejects(
          sql`
            insert into "ProjectOperation" (
              "actorUserId", "operationType", "operationId", "requestHash", "resultKind", "resultId"
            ) values (${ownerId}, 'unknown', ${randomUUID()}, ${"a".repeat(64)}, 'project', ${randomUUID()})
          `
        );
        await assert.rejects(
          sql`
            insert into "ProjectOperation" (
              "actorUserId", "operationType", "operationId", "requestHash", "resultKind", "resultId"
            ) values (${ownerId}, 'project_create', ${randomUUID()}, 'bad-hash', 'project', ${randomUUID()})
          `
        );
        await expectPostgresConstraint(
          sql`
            insert into "ProjectEvent" (
              "projectId", "actorUserId", "projectRevision", "eventType", "operationRecordId"
            ) values (${projectId}, ${ownerId}, 0, 'project_created', ${creationEvent.operationRecordId})
          `,
          "23514",
          "ProjectEvent_revision_positive_check"
        );
        await expectPostgresConstraint(
          sql`
            insert into "ProjectEvent" (
              "projectId", "actorUserId", "projectRevision", "eventType", "operationRecordId"
            ) values (${projectId}, ${ownerId}, 99, 'unknown', ${creationEvent.operationRecordId})
          `,
          "23514",
          "ProjectEvent_type_check"
        );
        await expectPostgresConstraint(
          sql`
            insert into "ProjectEvent" (
              "projectId", "actorUserId", "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId"
            ) values (${projectId}, ${ownerId}, 50, 'project_created', 'unknown', ${randomUUID()}, ${creationEvent.operationRecordId})
          `,
          "23514",
          "ProjectEvent_subject_check"
        );
        await expectPostgresConstraint(
          sql`
            insert into "ProjectEvent" (
              "projectId", "actorUserId", "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId"
            ) values (${projectId}, ${ownerId}, 51, 'project_created', null, ${randomUUID()}, ${creationEvent.operationRecordId})
          `,
          "23514",
          "ProjectEvent_subject_check"
        );
        await expectPostgresConstraint(
          sql`
            insert into "ProjectEvent" (
              "projectId", "actorUserId", "projectRevision", "eventType", "operationRecordId"
            ) values (${projectId}, ${ownerId}, 1, 'project_created', ${creationEvent.operationRecordId})
          `,
          "23505",
          "ProjectEvent_project_revision_unique"
        );
        await assert.rejects(
          sql`
            insert into "StudyJourneyProject" ("ownerUserId")
            values (${randomUUID()})
          `
        );
        await assert.rejects(
          sql`
            insert into "ProjectMembership" ("projectId", "userId", "status", "invitedByUserId")
            values (${projectId}, ${randomUUID()}, 'pending', ${ownerId})
          `
        );
        await assert.rejects(
          sql`
            insert into "ProjectMembership" ("projectId", "userId", "status", "invitedByUserId")
            values (${projectId}, ${outsiderId}, 'pending', ${randomUUID()})
          `
        );
        await assert.rejects(
          sql`
            insert into "ProjectOperation" (
              "actorUserId", "operationType", "operationId", "requestHash", "resultKind", "resultId"
            ) values (${randomUUID()}, 'project_create', ${randomUUID()}, ${"a".repeat(64)}, 'project', ${randomUUID()})
          `
        );
        await assert.rejects(
          sql`
            insert into "ProjectConversation" ("chatId", "projectId", "createdByUserId")
            values (${randomUUID()}, ${projectId}, ${ownerId})
          `
        );
        await assert.rejects(
          sql`
            insert into "ProjectConversation" ("chatId", "projectId", "createdByUserId")
            values (${preservedStandaloneChatId}, ${randomUUID()}, ${ownerId})
          `
        );
        await assert.rejects(
          sql`
            insert into "ProjectConversation" ("chatId", "projectId", "createdByUserId")
            values (${preservedStandaloneChatId}, ${projectId}, ${randomUUID()})
          `
        );
      });

      await t.test(
        "Project Chat authorization, unique association and replay",
        async () => {
          await expectProjectError(
            createProjectChatFoundation({
              actorUserId: pendingId,
              projectId,
              operationId: "pending-member-chat",
            }),
            "project_forbidden"
          );
          await expectProjectError(
            createProjectChatFoundation({
              actorUserId: revokedId,
              projectId,
              operationId: "revoked-member-chat",
            }),
            "project_forbidden"
          );

          const memberChat = await createProjectChatFoundation({
            actorUserId: memberId,
            projectId,
            operationId: "member-chat-first",
            title: "Member owned chat",
          });
          assert.equal(memberChat.createdByUserId, memberId);
          assert.equal(memberChat.project.revision, 2);
          const replay = await createProjectChatFoundation({
            actorUserId: memberId,
            projectId,
            operationId: "member-chat-first",
            title: "Member owned chat",
          });
          assert.equal(replay.replayed, true);
          assert.equal(replay.chatId, memberChat.chatId);
          await expectProjectError(
            createProjectChatFoundation({
              actorUserId: memberId,
              projectId,
              operationId: "member-chat-first",
              title: "Changed payload",
            }),
            "idempotency_conflict"
          );
          await expectProjectError(
            createProjectChatFoundation({
              actorUserId: ownerId,
              projectId: randomUUID(),
              operationId: "missing-project-chat",
            }),
            "project_not_found"
          );
          await expectProjectError(
            createProjectChatFoundation({
              actorUserId: outsiderId,
              projectId,
              operationId: "outsider-project-chat",
            }),
            "project_forbidden"
          );

          await assert.rejects(
            sql`
            insert into "ProjectConversation" ("chatId", "projectId", "createdByUserId")
            values (${memberChat.chatId}, ${projectId}, ${ownerId})
          `
          );
          await assert.rejects(
            sql`
            insert into "ProjectConversation" ("chatId", "projectId", "createdByUserId")
            values (${memberChat.chatId}, ${projectId}, ${memberId})
          `
          );
          await assert.rejects(
            sql`
            insert into "ProjectConversation" ("chatId", "projectId", "createdByUserId")
            values (${memberChat.chatId}, ${secondProjectId}, ${memberId})
          `
          );
          await assert.rejects(
            sql`
            insert into "ProjectConversation" ("chatId", "projectId", "createdByUserId")
            values (${preservedStandaloneChatId}, ${projectId}, ${outsiderId})
          `
          );
          await assert.rejects(
            sql`
            delete from "Chat" where "id" = ${memberChat.chatId}
          `
          );

          await expectProjectError(
            createProjectFoundationRepository().authorizeProjectAccess({
              actorUserId: ownerId,
              projectId,
              intent: "chat_history",
              chatId: memberChat.chatId,
            }),
            "project_forbidden"
          );
          await createProjectFoundationRepository().authorizeProjectAccess({
            actorUserId: memberId,
            projectId,
            intent: "chat_history",
            chatId: memberChat.chatId,
          });
        }
      );

      await t.test(
        "concurrent operation retries and Project lock serialization",
        async () => {
          const [left, right] = await Promise.all([
            createProjectChatFoundation({
              actorUserId: ownerId,
              projectId,
              operationId: "concurrent-same-chat",
              title: "Concurrent replay",
            }),
            createProjectChatFoundation({
              actorUserId: ownerId,
              projectId,
              operationId: "concurrent-same-chat",
              title: "Concurrent replay",
            }),
          ]);
          assert.equal(left.chatId, right.chatId);
          assert.equal(Number(left.replayed) + Number(right.replayed), 1);

          const [first, second] = await Promise.all([
            createProjectChatFoundation({
              actorUserId: ownerId,
              projectId,
              operationId: "concurrent-chat-a",
            }),
            createProjectChatFoundation({
              actorUserId: ownerId,
              projectId,
              operationId: "concurrent-chat-b",
            }),
          ]);
          assert.notEqual(first.chatId, second.chatId);
          assert.equal(
            Math.max(first.project.revision, second.project.revision),
            Math.min(first.project.revision, second.project.revision) + 1
          );
          const events = await sql<{ projectRevision: number }[]>`
          select "projectRevision" from "ProjectEvent"
          where "projectId" = ${projectId} order by "projectRevision"
        `;
          assert.deepEqual(
            events.map((event) => event.projectRevision),
            Array.from({ length: events.length }, (_, index) => index + 1)
          );
        }
      );

      await t.test(
        "write-boundary failures roll back every resource and event",
        async () => {
          const projectBoundaries = [
            "operation_claimed",
            "project_created",
            "event_created",
          ] as const;
          const [existingOwnerProjectCount] = await sql<{ count: string }[]>`
          select count(*)::text as count from "StudyJourneyProject" where "ownerUserId" = ${ownerId}
        `;
          const [existingOwnerProjectEventCount] = await sql<
            { count: string }[]
          >`
          select count(*)::text as count from "ProjectEvent"
          where "actorUserId" = ${ownerId} and "eventType" = 'project_created'
        `;
          for (const boundary of projectBoundaries) {
            const operationId = `fault-project-${boundary}`;
            const repository = createProjectFoundationRepository({
              testHooks: {
                afterWrite(actual) {
                  if (actual === boundary) {
                    throw new Error("injected_failure");
                  }
                },
              },
            });
            await assert.rejects(
              repository.createProject({ actorUserId: ownerId, operationId }),
              /injected_failure/u
            );
            const [operationCount] = await sql<{ count: string }[]>`
            select count(*)::text as count from "ProjectOperation"
            where "actorUserId" = ${ownerId} and "operationId" = ${operationId}
          `;
            assert.equal(Number(operationCount?.count), 0);
            const [orphanCounts] = await sql<
              {
                projects: string;
                events: string;
              }[]
            >`
            select
              (select count(*)::text from "StudyJourneyProject" where "ownerUserId" = ${ownerId}) as projects,
              (select count(*)::text from "ProjectEvent" where "actorUserId" = ${ownerId} and "eventType" = 'project_created') as events
          `;
            assert.equal(
              Number(orphanCounts?.projects),
              Number(existingOwnerProjectCount?.count)
            );
            assert.equal(
              Number(orphanCounts?.events),
              Number(existingOwnerProjectEventCount?.count)
            );
          }

          const chatBoundaries = [
            "operation_claimed",
            "chat_created",
            "immigration_conversation_created",
            "project_conversation_created",
            "project_revised",
            "event_created",
          ] as const;
          const [initialProject] = await sql<{ revision: number }[]>`
          select "revision" from "StudyJourneyProject" where "id" = ${projectId}
        `;
          const [initialEventCount] = await sql<{ count: string }[]>`
          select count(*)::text as count from "ProjectEvent" where "projectId" = ${projectId}
        `;
          for (const boundary of chatBoundaries) {
            const operationId = `fault-chat-${boundary}`;
            const title = `rollback-${boundary}`;
            const repository = createProjectFoundationRepository({
              testHooks: {
                afterWrite(actual) {
                  if (actual === boundary) {
                    throw new Error("injected_failure");
                  }
                },
              },
            });
            await assert.rejects(
              repository.createProjectChat({
                actorUserId: ownerId,
                projectId,
                operationId,
                title,
              }),
              /injected_failure/u
            );
            const [operationCount] = await sql<{ count: string }[]>`
            select count(*)::text as count from "ProjectOperation"
            where "actorUserId" = ${ownerId} and "operationId" = ${operationId}
          `;
            const [orphanCounts] = await sql<
              {
                chats: string;
                conversations: string;
                associations: string;
                events: string;
              }[]
            >`
            select
              (select count(*)::text from "Chat" where "title" = ${title} and "userId" = ${ownerId}) as chats,
              (select count(*)::text from "ImmigrationConversation" i join "Chat" c on c."id" = i."chatId" where c."title" = ${title} and c."userId" = ${ownerId}) as conversations,
              (select count(*)::text from "ProjectConversation" pc join "Chat" c on c."id" = pc."chatId" where c."title" = ${title} and c."userId" = ${ownerId}) as associations,
              (select count(*)::text from "ProjectEvent" where "projectId" = ${projectId}) as events
          `;
            const [currentProject] = await sql<{ revision: number }[]>`
            select "revision" from "StudyJourneyProject" where "id" = ${projectId}
          `;
            assert.equal(Number(operationCount?.count), 0);
            assert.equal(Number(orphanCounts?.chats), 0);
            assert.equal(Number(orphanCounts?.conversations), 0);
            assert.equal(Number(orphanCounts?.associations), 0);
            assert.equal(
              Number(orphanCounts?.events),
              Number(initialEventCount?.count)
            );
            assert.equal(
              Number(currentProject?.revision),
              initialProject?.revision
            );
          }
        }
      );

      await t.test(
        "authorization and revocation races use Project then Membership locks",
        async () => {
          const raceMemberId = await insertUser(sql, "race-before");
          userIds.push(raceMemberId);
          await setMembership(sql, {
            projectId,
            userId: raceMemberId,
            ownerId,
            status: "active",
          });

          let releaseRevocation: (() => void) | undefined;
          let locked: (() => void) | undefined;
          const lockReady = new Promise<void>((resolveLock) => {
            locked = resolveLock;
          });
          const hold = new Promise<void>((resolveHold) => {
            releaseRevocation = resolveHold;
          });
          const revocation = sql.begin(async (tx) => {
            await tx`select "id" from "StudyJourneyProject" where "id" = ${projectId} for update`;
            await tx`
            select "id" from "ProjectMembership"
            where "projectId" = ${projectId} and "userId" = ${raceMemberId} for update
          `;
            await tx`
            update "ProjectMembership" set "status" = 'revoked', "revokedAt" = now(), "updatedAt" = now()
            where "projectId" = ${projectId} and "userId" = ${raceMemberId}
          `;
            locked?.();
            await hold;
          });
          await lockReady;
          const attemptedAfterRevocationCommit = createProjectChatFoundation({
            actorUserId: raceMemberId,
            projectId,
            operationId: "race-after-revoke",
          });
          releaseRevocation?.();
          await revocation;
          await expectProjectError(
            attemptedAfterRevocationCommit,
            "project_forbidden"
          );

          const raceMemberTwoId = await insertUser(sql, "race-in-flight");
          userIds.push(raceMemberTwoId);
          await setMembership(sql, {
            projectId,
            userId: raceMemberTwoId,
            ownerId,
            status: "active",
          });
          let releaseChat: (() => void) | undefined;
          let chatLocked: (() => void) | undefined;
          const chatLockReady = new Promise<void>((resolveChat) => {
            chatLocked = resolveChat;
          });
          const chatHold = new Promise<void>((resolveChat) => {
            releaseChat = resolveChat;
          });
          const inFlightRepository = createProjectFoundationRepository({
            testHooks: {
              async afterWrite(boundary) {
                if (boundary === "chat_created") {
                  chatLocked?.();
                  await chatHold;
                }
              },
            },
          });
          const inFlight = inFlightRepository.createProjectChat({
            actorUserId: raceMemberTwoId,
            projectId,
            operationId: "race-before-revoke",
          });
          await chatLockReady;
          const concurrentRevoke = sql.begin(async (tx) => {
            await tx`select "id" from "StudyJourneyProject" where "id" = ${projectId} for update`;
            await tx`
            select "id" from "ProjectMembership"
            where "projectId" = ${projectId} and "userId" = ${raceMemberTwoId} for update
          `;
            await tx`
            update "ProjectMembership" set "status" = 'revoked', "revokedAt" = now(), "updatedAt" = now()
            where "projectId" = ${projectId} and "userId" = ${raceMemberTwoId}
          `;
          });
          releaseChat?.();
          const committedBeforeRevoke = await inFlight;
          await concurrentRevoke;
          assert.equal(committedBeforeRevoke.createdByUserId, raceMemberTwoId);
          await expectProjectError(
            createProjectFoundationRepository().authorizeProjectAccess({
              actorUserId: raceMemberTwoId,
              projectId,
              intent: "chat_history",
              chatId: committedBeforeRevoke.chatId,
            }),
            "project_forbidden"
          );
        }
      );

      await t.test(
        "closure, revision conflict and read-only history",
        async () => {
          const [beforeClose] = await sql<{ revision: number }[]>`
          select "revision" from "StudyJourneyProject" where "id" = ${projectId}
        `;
          assert.ok(beforeClose && beforeClose.revision > 1);
          await expectProjectError(
            createProjectFoundationRepository().closeProject({
              actorUserId: ownerId,
              projectId,
              expectedRevision: 1,
              operationId: "stale-close",
            }),
            "revision_conflict"
          );
          const closed = await createProjectFoundationRepository().closeProject(
            {
              actorUserId: ownerId,
              projectId,
              expectedRevision: beforeClose.revision,
              operationId: "owner-close-project",
            }
          );
          assert.equal(closed.project.status, "closed");
          assert.ok(closed.project.closedAt instanceof Date);
          assert.equal(closed.project.revision, beforeClose.revision + 1);
          const replay = await createProjectFoundationRepository().closeProject(
            {
              actorUserId: ownerId,
              projectId,
              expectedRevision: beforeClose.revision,
              operationId: "owner-close-project",
            }
          );
          assert.equal(replay.replayed, true);
          assert.equal(replay.project.status, "closed");

          await expectProjectError(
            createProjectChatFoundation({
              actorUserId: ownerId,
              projectId,
              operationId: "closed-project-chat",
            }),
            "project_closed"
          );
          const projectChats = await sql<{ chatId: string }[]>`
          select "chatId" from "ProjectConversation"
          where "projectId" = ${projectId} and "createdByUserId" = ${memberId}
          limit 1
        `;
          const memberChatId = projectChats[0]?.chatId;
          assert.ok(memberChatId);
          await createProjectFoundationRepository().authorizeProjectAccess({
            actorUserId: memberId,
            projectId,
            intent: "chat_history",
            chatId: memberChatId,
          });
          await createProjectFoundationRepository()
            .authorizeProjectAccess({
              actorUserId: ownerId,
              projectId,
              intent: "project_write",
            })
            .then(
              () =>
                assert.fail(
                  "closed Project write authorization unexpectedly succeeded"
                ),
              (error: unknown) =>
                assert.ok(
                  error instanceof ProjectFoundationError &&
                    error.code === "project_closed"
                )
            );

          const [revisionEvents] = await sql<{ count: string }[]>`
          select count(*)::text as count from "ProjectEvent"
          where "projectId" = ${projectId} and "projectRevision" = ${closed.project.revision}
            and "eventType" = 'project_closed'
        `;
          assert.equal(Number(revisionEvents?.count), 1);
        }
      );

      await t.test(
        "project chat creation replay remains read-only after closure",
        async () => {
          const replay = await createProjectChatFoundation({
            actorUserId: memberId,
            projectId,
            operationId: "member-chat-first",
            title: "Member owned chat",
          });
          assert.equal(replay.replayed, true);
          assert.equal(replay.project.status, "closed");
          await sql`
          update "ProjectMembership" set "status" = 'revoked', "revokedAt" = now(), "updatedAt" = now()
          where "projectId" = ${projectId} and "userId" = ${memberId}
        `;
          await expectProjectError(
            createProjectChatFoundation({
              actorUserId: memberId,
              projectId,
              operationId: "member-chat-first",
              title: "Member owned chat",
            }),
            "project_forbidden"
          );
        }
      );
    } finally {
      if (userIds.length > 0) {
        await sql`
          delete from "ProjectMembership"
          where "userId" = any(${sql.array(userIds)}::uuid[])
        `.catch(() => undefined);
        await sql`
          delete from "ProjectConversation"
          where "createdByUserId" = any(${sql.array(userIds)}::uuid[])
        `.catch(() => undefined);
        await sql`
          delete from "ProjectEvent"
          where "actorUserId" = any(${sql.array(userIds)}::uuid[])
        `.catch(() => undefined);
        await sql`
          delete from "ProjectOperation"
          where "actorUserId" = any(${sql.array(userIds)}::uuid[])
        `.catch(() => undefined);
        await sql`
          delete from "StudyJourneyProject"
          where "ownerUserId" = any(${sql.array(userIds)}::uuid[])
        `.catch(() => undefined);
        await sql`
          delete from "ConversationTurn"
          where "userId" = any(${sql.array(userIds)}::uuid[])
        `.catch(() => undefined);
        await sql`
          delete from "ImmigrationConversation"
          where "chatId" in (select "id" from "Chat" where "userId" = any(${sql.array(userIds)}::uuid[]))
        `.catch(() => undefined);
        await sql`
          delete from "Chat" where "userId" = any(${sql.array(userIds)}::uuid[])
        `.catch(() => undefined);
        await sql`
          delete from "User" where "id" = any(${sql.array(userIds)}::uuid[])
        `.catch(() => undefined);
      }
      await sql.end({ timeout: 5 });
      const runtimeClient = await import("./runtime-client");
      await runtimeClient.closeLazyDatabase();
    }
  }
);
