// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions are scoped to this guarded database suite.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import {
  evaluateStageChatTestGuards,
  type StageChatTestMigrationSnapshot,
  verifyStageChatTestMigrationReadiness,
  verifyStageChatTestServerIdentity,
} from "./stage-chat-test-database-target";

/**
 * Phase 13 M9-A — GUARDED PostgreSQL integration suite for the persisted
 * step-conversation binding.
 *
 * This suite is **NOT RUN** by the implementation delivery and must not be reported as
 * passing. Migration 0053 is authored but intentionally unapplied in the delivery
 * environment; applying it to a disposable database requires separate owner
 * authorization. The suite itself creates no database, drops nothing and deletes no
 * row: it only inserts its own fixtures into an already-migrated disposable database.
 *
 * Guard requirements (all three):
 *   PHASE13_M9_A_TEST_DATABASE_URL   exactly
 *                                    postgres://127.0.0.1:5432/immigration_ai_phase13_m9_a_test
 *                                    (`localhost` is also accepted)
 *   PHASE13_M9_A_TEST_RUNNER_VERIFIED=1
 *   PHASE13_M9_A_TEST_APPROVAL=PHASE13_M9_A_OWNER_APPROVED_DISPOSABLE_DB
 *
 * Owner-run command (after applying 0053 to that disposable database):
 *
 *   PHASE13_M9_A_TEST_DATABASE_URL='postgres://127.0.0.1:5432/immigration_ai_phase13_m9_a_test' \
 *   PHASE13_M9_A_TEST_RUNNER_VERIFIED=1 \
 *   PHASE13_M9_A_TEST_APPROVAL=PHASE13_M9_A_OWNER_APPROVED_DISPOSABLE_DB \
 *   pnpm test:phase13:m9-a:integration
 *
 * `--conditions=react-server` (inside that script) is required: the suite imports the
 * production repository, which is `server-only`.
 *
 * R1-T02 target safety — three independent layers, all fail-closed, in
 * `stage-chat-test-database-target.ts`:
 *   1. **URL allowlist before any pool exists.** Only loopback host, port 5432 and the one
 *      approved database name are accepted. `chatbot`, `immigration_legal`, `postgres`,
 *      any other name, a remote host, a Unix socket, a multi-host list, a non-5432 port
 *      and any URL parameter (host/hostaddr/port/dbname/service/passfile/options) are
 *      rejected structurally — not by substring matching. An authorised run with an
 *      unsafe target fails loudly instead of skipping.
 *   2. **Runtime identity.** After connecting, `current_database()`,
 *      `inet_server_addr()` and `inet_server_port()` must confirm the approved database on
 *      loopback:5432; a NULL peer address (Unix socket) or any unexpected form fails.
 *   3. **Migration 0053 readiness.** The table, primary key, closed-vocabulary CHECK,
 *      composite foreign key and owner/stage unique index are verified from their catalog
 *      definitions before the first fixture write. The suite never applies the migration.
 *
 * R1 harness corrections preserved here (independent review of the first delivery):
 *   1. the composite-FK negatives use previously unbound Chat ids, so the primary key on
 *      `chatId` cannot fire first and mask the foreign key;
 *   2. the owner/stage uniqueness case first inserts a valid binding, then attempts a
 *      different Chat for the same (projectId, createdByUserId, stageKey);
 *   3. the unauthorized-actor case asserts rejection, because R1-02 authorizes the
 *      current Project before reading anything;
 *   4. one real two-Project scenario proves Project-specific idempotency (R1-01);
 *   5. one membership-revocation / closed-Project scenario records the real read-path
 *      behaviour, including the residual authorization/read window (see the note in
 *      that test).
 */

const TEST_DATABASE_URL =
  process.env.PHASE13_M9_A_TEST_DATABASE_URL?.trim() ?? "";
const guardDecision = evaluateStageChatTestGuards({
  approval: process.env.PHASE13_M9_A_TEST_APPROVAL,
  databaseUrl: TEST_DATABASE_URL,
  runnerVerified: process.env.PHASE13_M9_A_TEST_RUNNER_VERIFIED,
});
// Safe default-deny: without all three owner guards the suite only skips. With the guards
// present, an unsafe target throws from `evaluateStageChatTestGuards` at load time so it
// can never be silently skipped.
const isGuardedRun = guardDecision.run;
const skipReason = guardDecision.run ? false : guardDecision.skipReason;

// The repositories resolve their client lazily, so pointing POSTGRES_URL at the
// disposable database here is enough for every query below.
if (isGuardedRun) {
  process.env.POSTGRES_URL = TEST_DATABASE_URL;
}

const uuid = () => randomUUID();

/**
 * Layer 2 — the server-reported identity.
 *
 * The URL allowlist already refused every non-loopback target, but a `localhost` that
 * resolves elsewhere, a proxy, or a socket fallback would still be wrong. This read-only
 * query verifies what the server actually is before any fixture is written.
 */
async function assertServerIdentity(sql: postgres.Sql) {
  const [row] = await sql<
    { database: string | null; address: string | null; port: number | null }[]
  >`
    SELECT
      current_database() AS "database",
      host(inet_server_addr()) AS "address",
      inet_server_port() AS "port"
  `;
  const identity = verifyStageChatTestServerIdentity({
    currentDatabase: row?.database ?? null,
    serverAddress: row?.address ?? null,
    serverPort: row?.port ?? null,
  });
  if (!identity.ok) {
    throw new Error(
      `M9-A integration target identity check failed (${identity.reason}): ${identity.detail}`
    );
  }
}

/**
 * Layer 3 — read-only catalog snapshot of migration 0053.
 *
 * No DDL is executed anywhere in this suite: every statement below is a `SELECT` from
 * `information_schema` / `pg_catalog`.
 */
async function readMigrationSnapshot(
  sql: postgres.Sql
): Promise<StageChatTestMigrationSnapshot> {
  const [table] = await sql<{ present: boolean }[]>`
    SELECT to_regclass('"ProjectConversationStage"') IS NOT NULL AS "present"
  `;
  if (!table?.present) {
    return {
      checkConstraints: [],
      columns: [],
      foreignKeys: [],
      primaryKeyColumns: [],
      tableExists: false,
      uniqueIndexes: [],
    };
  }

  const columns = await sql<
    {
      name: string;
      dataType: string;
      isNullable: boolean;
      columnDefault: string | null;
    }[]
  >`
    SELECT
      column_name AS "name",
      data_type AS "dataType",
      (is_nullable = 'YES') AS "isNullable",
      column_default AS "columnDefault"
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'ProjectConversationStage'
    ORDER BY ordinal_position
  `;

  const primaryKeyColumns = await sql<{ name: string }[]>`
    SELECT a.attname AS "name"
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE c.relname = 'ProjectConversationStage'
      AND n.nspname = current_schema()
      AND i.indisprimary
  `;

  const checkConstraints = await sql<{ name: string; definition: string }[]>`
    SELECT con.conname AS "name", pg_get_constraintdef(con.oid) AS "definition"
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'ProjectConversationStage'
      AND n.nspname = current_schema()
      AND con.contype = 'c'
  `;

  const foreignKeys = await sql<{ name: string; definition: string }[]>`
    SELECT con.conname AS "name", pg_get_constraintdef(con.oid) AS "definition"
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'ProjectConversationStage'
      AND n.nspname = current_schema()
      AND con.contype = 'f'
  `;

  const uniqueIndexes = await sql<{ name: string; definition: string }[]>`
    SELECT indexname AS "name", indexdef AS "definition"
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'ProjectConversationStage'
  `;

  return {
    checkConstraints,
    columns,
    foreignKeys,
    primaryKeyColumns: primaryKeyColumns.map((row) => row.name),
    tableExists: true,
    uniqueIndexes,
  };
}

/**
 * Fail with a precise diagnostic when migration 0053 is missing or incomplete. The
 * migration is never applied here — the owner applies it on the disposable database
 * through the controlled procedure.
 */
async function assertMigrationReady(sql: postgres.Sql) {
  const readiness = verifyStageChatTestMigrationReadiness(
    await readMigrationSnapshot(sql)
  );
  if (!readiness.ok) {
    throw new Error(
      [
        "migration 0053 is not ready on the disposable database (nothing was written):",
        ...readiness.problems.map((problem) => `  - ${problem}`),
      ].join("\n")
    );
  }
}

async function withGuardedSql<T>(
  work: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  // The URL was already allowlisted at module load, before this pool exists.
  const sql = postgres(TEST_DATABASE_URL, {
    connection: { TimeZone: "UTC" },
    max: 2,
  });
  try {
    // Read-only checks first: identity, then migration readiness. Only after both pass
    // does the caller insert its fixtures.
    await assertServerIdentity(sql);
    await assertMigrationReady(sql);
    return await work(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function createActor(sql: postgres.Sql) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO "User" ("id","email","password")
    VALUES (${uuid()}, ${`m9-a-${uuid()}@example.test`}, 'x')
    RETURNING "id"
  `;
  return row.id;
}

async function createProject(sql: postgres.Sql, ownerUserId: string) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO "StudyJourneyProject" ("id","ownerUserId","status","revision","createdAt","updatedAt")
    VALUES (${uuid()}, ${ownerUserId}, 'active', 1, now(), now())
    RETURNING "id"
  `;
  return row.id;
}

/**
 * A real owner-scoped Project Chat that is **not** bound to a stage yet.
 *
 * The "unbound" property is what makes the constraint negatives meaningful: a binding
 * insert for this Chat cannot collide on the `chatId` primary key, so the only possible
 * failure is the constraint under test.
 */
async function createUnboundProjectChat(
  sql: postgres.Sql,
  input: { ownerUserId: string; projectId: string }
) {
  const chatId = uuid();
  await sql`
    INSERT INTO "Chat" ("id","createdAt","title","userId","visibility")
    VALUES (${chatId}, now(), 'M9-A integration chat', ${input.ownerUserId}, 'private')
  `;
  await sql`
    INSERT INTO "ImmigrationConversation" ("chatId","createdAt","updatedAt")
    VALUES (${chatId}, now(), now())
  `;
  await sql`
    INSERT INTO "ProjectConversation" ("chatId","projectId","createdByUserId")
    VALUES (${chatId}, ${input.projectId}, ${input.ownerUserId})
  `;
  return chatId;
}

async function bindStage(
  sql: postgres.Sql,
  input: {
    chatId: string;
    projectId: string;
    createdByUserId: string;
    stageKey: string;
  }
) {
  await sql`
    INSERT INTO "ProjectConversationStage" ("chatId","projectId","createdByUserId","stageKey")
    VALUES (${input.chatId}, ${input.projectId}, ${input.createdByUserId}, ${input.stageKey})
  `;
}

async function addActiveMembership(
  sql: postgres.Sql,
  input: { projectId: string; userId: string; invitedByUserId: string }
) {
  await sql`
    INSERT INTO "ProjectMembership"
      ("id","projectId","userId","status","invitedByUserId","createdAt","updatedAt","acceptedAt")
    VALUES
      (${uuid()}, ${input.projectId}, ${input.userId}, 'active', ${input.invitedByUserId}, now(), now(), now())
  `;
}

async function revokeMembership(
  sql: postgres.Sql,
  input: { projectId: string; userId: string }
) {
  await sql`
    UPDATE "ProjectMembership"
    SET "status" = 'revoked', "revokedAt" = now(), "updatedAt" = now()
    WHERE "projectId" = ${input.projectId} AND "userId" = ${input.userId}
  `;
}

async function restoreMembership(
  sql: postgres.Sql,
  input: { projectId: string; userId: string }
) {
  // M1 re-accept path shape: active with an acceptedAt and no revokedAt.
  await sql`
    UPDATE "ProjectMembership"
    SET "status" = 'active', "acceptedAt" = now(), "revokedAt" = NULL, "updatedAt" = now()
    WHERE "projectId" = ${input.projectId} AND "userId" = ${input.userId}
  `;
}

async function closeProject(sql: postgres.Sql, projectId: string) {
  await sql`
    UPDATE "StudyJourneyProject"
    SET "status" = 'closed', "closedAt" = now(), "updatedAt" = now()
    WHERE "id" = ${projectId}
  `;
}

async function countStageRows(
  sql: postgres.Sql,
  input: { projectId: string; createdByUserId: string }
) {
  const [row] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS "count"
    FROM "ProjectConversationStage"
    WHERE "projectId" = ${input.projectId}
      AND "createdByUserId" = ${input.createdByUserId}
  `;
  return Number(row?.count ?? "0");
}

async function countActorChats(sql: postgres.Sql, actorUserId: string) {
  const [row] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS "count" FROM "Chat" WHERE "userId" = ${actorUserId}
  `;
  return Number(row?.count ?? "0");
}

/**
 * Match a SQLSTATE and, when supplied, the exact violated constraint or unique index.
 *
 * postgres.js exposes the server's constraint name as `constraint_name` (drizzle uses
 * the same driver), so both spellings are accepted to keep the assertion stable.
 */
function isSqlViolation(input: { code: string; constraint?: string }) {
  return (error: unknown) => {
    const candidate = error as {
      code?: string;
      constraint?: string;
      constraint_name?: string;
    };
    if (String(candidate.code) !== input.code) {
      return false;
    }
    if (!input.constraint) {
      return true;
    }
    const name = candidate.constraint_name ?? candidate.constraint;
    return name === input.constraint;
  };
}

function isFoundationError(code: string) {
  return (error: unknown) =>
    (error as { name?: string }).name === "ProjectFoundationError" &&
    (error as { code?: string }).code === code;
}

test(
  "step bindings are isolated by Project and by owner at the database level",
  { skip: skipReason },
  async () => {
    await withGuardedSql(async (sql) => {
      const ownerA = await createActor(sql);
      const ownerB = await createActor(sql);
      const projectA = await createProject(sql, ownerA);
      const projectB = await createProject(sql, ownerB);

      // Every Chat below is a real Project Conversation that is **not** bound to a
      // stage yet, so a negative insert can only fail on the constraint under test.
      const chatA = await createUnboundProjectChat(sql, {
        ownerUserId: ownerA,
        projectId: projectA,
      });
      const unboundInProjectA = await createUnboundProjectChat(sql, {
        ownerUserId: ownerA,
        projectId: projectA,
      });
      const unboundInProjectB = await createUnboundProjectChat(sql, {
        ownerUserId: ownerB,
        projectId: projectB,
      });
      const duplicateStageChat = await createUnboundProjectChat(sql, {
        ownerUserId: ownerA,
        projectId: projectA,
      });

      // The correct binding is accepted.
      await bindStage(sql, {
        chatId: chatA,
        createdByUserId: ownerA,
        projectId: projectA,
        stageKey: "student500",
      });

      // R1 harness correction 1: an unbound Project A Chat cannot be bound inside
      // Project B. Before the correction this reused the already-bound chatA, so the
      // `chatId` primary key raised 23505 and the composite foreign key was untested.
      await assert.rejects(
        bindStage(sql, {
          chatId: unboundInProjectA,
          createdByUserId: ownerA,
          projectId: projectB,
          stageKey: "school_applications",
        }),
        isSqlViolation({
          code: "23503",
          constraint: "ProjectConversationStage_conversation_fk",
        }),
        "a Chat from Project A must not be bindable inside Project B"
      );

      // Cross-owner binding is impossible: A cannot claim a Chat B created.
      await assert.rejects(
        bindStage(sql, {
          chatId: unboundInProjectB,
          createdByUserId: ownerA,
          projectId: projectB,
          stageKey: "school_admissions",
        }),
        isSqlViolation({
          code: "23503",
          constraint: "ProjectConversationStage_conversation_fk",
        }),
        "a binding must agree on both the Project and the creator"
      );

      // The closed step vocabulary is a database constraint (and nothing else fails
      // here, because this Chat does belong to projectB/ownerB).
      await assert.rejects(
        bindStage(sql, {
          chatId: unboundInProjectB,
          createdByUserId: ownerB,
          projectId: projectB,
          stageKey: "universal_step_9",
        }),
        isSqlViolation({
          code: "23514",
          constraint: "ProjectConversationStage_stage_key_check",
        })
      );

      // R1 harness correction 2: one conversation per owner per step. A valid binding
      // already exists for (projectA, ownerA, student500); a *different* unbound Chat
      // for the same triple must collide on the unique index.
      await assert.rejects(
        bindStage(sql, {
          chatId: duplicateStageChat,
          createdByUserId: ownerA,
          projectId: projectA,
          stageKey: "student500",
        }),
        isSqlViolation({
          code: "23505",
          constraint: "ProjectConversationStage_owner_stage_unique",
        }),
        "a second Chat must not be bindable to an already-bound Project step"
      );

      // The rejected attempts left nothing behind: exactly one binding exists, and it is
      // the accepted one.
      assert.equal(
        await countStageRows(sql, {
          createdByUserId: ownerA,
          projectId: projectA,
        }),
        1
      );
      assert.equal(
        await countStageRows(sql, {
          createdByUserId: ownerB,
          projectId: projectB,
        }),
        0
      );
      const rows = await sql<{ chatId: string; stageKey: string }[]>`
        SELECT "chatId","stageKey" FROM "ProjectConversationStage"
        WHERE "projectId" = ${projectA}
      `;
      assert.deepEqual(
        rows.map((row) => ({ chatId: row.chatId, stageKey: row.stageKey })),
        [{ chatId: chatA, stageKey: "student500" }]
      );
    });
  }
);

test(
  "find-or-create is idempotent per Project, and an unauthorized actor is refused",
  { skip: skipReason },
  async () => {
    const { findOrCreateStageChat, listStageChatBindings } = await import(
      "./stage-chat-repository"
    );
    const { closeLazyDatabase } = await import("@/lib/db/runtime-client");

    try {
      await withGuardedSql(async (sql) => {
        const owner = await createActor(sql);
        const projectA = await createProject(sql, owner);
        const projectB = await createProject(sql, owner);

        const firstA = await findOrCreateStageChat({
          actorUserId: owner,
          projectId: projectA,
          stageKey: "school_applications",
        });
        const reopenedA = await findOrCreateStageChat({
          actorUserId: owner,
          projectId: projectA,
          stageKey: "school_applications",
        });
        // Two calls, one Chat: the deterministic operation id replays the create.
        assert.equal(reopenedA.chatId, firstA.chatId);
        assert.equal(reopenedA.replayed, true);
        assert.equal(reopenedA.readOnly, false);

        // R1-01 real-database scenario: the same actor opening the same step in a
        // second Project must receive a *different* authorized Chat. Before the fix the
        // Project-independent operation id made this replay A's operation and fail.
        const firstB = await findOrCreateStageChat({
          actorUserId: owner,
          projectId: projectB,
          stageKey: "school_applications",
        });
        assert.notEqual(
          firstB.chatId,
          firstA.chatId,
          "Project B must own its own step conversation"
        );
        assert.equal(firstB.replayed, false);

        // Reopening either Project still replays, and never creates a duplicate.
        const reopenedB = await findOrCreateStageChat({
          actorUserId: owner,
          projectId: projectB,
          stageKey: "school_applications",
        });
        assert.equal(reopenedB.chatId, firstB.chatId);
        assert.equal(reopenedB.replayed, true);
        assert.equal(
          (
            await findOrCreateStageChat({
              actorUserId: owner,
              projectId: projectA,
              stageKey: "school_applications",
            })
          ).chatId,
          firstA.chatId
        );

        // One binding per Project, each pointing at its own Chat.
        const bindingsA = await listStageChatBindings({
          actorUserId: owner,
          projectId: projectA,
        });
        const bindingsB = await listStageChatBindings({
          actorUserId: owner,
          projectId: projectB,
        });
        assert.deepEqual(
          bindingsA.map((binding) => ({
            chatId: binding.chatId,
            stageKey: binding.stageKey,
          })),
          [{ chatId: firstA.chatId, stageKey: "school_applications" }]
        );
        assert.deepEqual(
          bindingsB.map((binding) => ({
            chatId: binding.chatId,
            stageKey: binding.stageKey,
          })),
          [{ chatId: firstB.chatId, stageKey: "school_applications" }]
        );
        assert.equal(
          await countStageRows(sql, {
            createdByUserId: owner,
            projectId: projectA,
          }),
          1
        );
        assert.equal(
          await countStageRows(sql, {
            createdByUserId: owner,
            projectId: projectB,
          }),
          1
        );

        // R1 harness correction 3: R1-02 authorizes the current Project *before* any
        // binding read, so a non-member is **rejected**, not handed an empty list.
        const stranger = await createActor(sql);
        await assert.rejects(
          listStageChatBindings({ actorUserId: stranger, projectId: projectA }),
          isFoundationError("project_forbidden"),
          "a non-member must not be able to enumerate another Project's step Chats"
        );
        await assert.rejects(
          findOrCreateStageChat({
            actorUserId: stranger,
            projectId: projectA,
            stageKey: "school_applications",
          }),
          isFoundationError("project_forbidden"),
          "a non-member must not receive (or create) a step conversation"
        );
        // Nothing was created for the stranger, and the owner's rows are untouched.
        assert.equal(await countActorChats(sql, stranger), 0);
        assert.equal(
          await countStageRows(sql, {
            createdByUserId: stranger,
            projectId: projectA,
          }),
          0
        );
        assert.equal(
          await countStageRows(sql, {
            createdByUserId: owner,
            projectId: projectA,
          }),
          1
        );
      });
    } finally {
      await closeLazyDatabase();
    }
  }
);

test(
  "revoked membership is refused at read time and a closed Project stays read-only",
  { skip: skipReason },
  async () => {
    /**
     * Residual authorization/read window (TOCTOU) — recorded, not fixed here.
     *
     * `listStageChatBindings` authorizes with `authorizeProjectRead` (its own committed
     * transaction: Project row lock, then the membership check) and only afterwards runs
     * the binding SELECT in a separate statement. A membership revocation committed in
     * between is therefore not observed by *that one* read. The same read-then-act shape
     * already exists in accepted M1 read paths, so it is not reopened in M9-A.
     *
     * Consequences, which are what make the window acceptable here:
     *   - the exposure is limited to the actor's **own** prior binding rows (their own
     *     Chat ids, which they created while authorized); the query still filters on
     *     `createdByUserId = actor`, so no other member's Chat becomes visible;
     *   - the window cannot write: `findOrCreateStageChat` and `createProjectChat`
     *     re-authorize *inside* their own transaction, and the write path refuses a
     *     revoked actor, so no row is created for them;
     *   - the window closes on the next request, because every step-chat read
     *     re-authorizes first.
     *
     * This is a bounded read-only staleness window on the actor's own data, not a
     * privilege escalation. Closing it would require a single transaction spanning
     * authorization plus the binding read (or a row-locked read) across the M1
     * repository — a general M1 change that is deliberately out of M9-A scope.
     */
    const { findOrCreateStageChat, listStageChatBindings } = await import(
      "./stage-chat-repository"
    );
    const { closeLazyDatabase } = await import("@/lib/db/runtime-client");

    try {
      await withGuardedSql(async (sql) => {
        const owner = await createActor(sql);
        const member = await createActor(sql);
        const projectId = await createProject(sql, owner);
        await addActiveMembership(sql, {
          invitedByUserId: owner,
          projectId,
          userId: member,
        });

        // An ACTIVE member (not the owner) may open and read their own step
        // conversation; the Chat is created by the accepted M1 write path.
        const memberChat = await findOrCreateStageChat({
          actorUserId: member,
          projectId,
          stageKey: "student500",
        });
        assert.equal(memberChat.readOnly, false);
        assert.equal(
          (
            await listStageChatBindings({
              actorUserId: member,
              projectId,
            })
          ).length,
          1
        );

        // Revocation is enforced at read time: no enumeration and no replay, even for a
        // binding the member created while authorized.
        await revokeMembership(sql, { projectId, userId: member });
        await assert.rejects(
          listStageChatBindings({ actorUserId: member, projectId }),
          isFoundationError("project_forbidden"),
          "a revoked member must not be able to enumerate their former step Chats"
        );
        await assert.rejects(
          findOrCreateStageChat({
            actorUserId: member,
            projectId,
            stageKey: "student500",
          }),
          isFoundationError("project_forbidden"),
          "a revoked member must not reopen a step conversation"
        );
        // The revocation changed no stored row: the owner still sees exactly one binding.
        assert.equal(
          await countStageRows(sql, {
            createdByUserId: member,
            projectId,
          }),
          1
        );

        // Restore the membership (M1 re-accept path) so the closed-Project read path can
        // be exercised by an actor who really owns a step binding here.
        await restoreMembership(sql, { projectId, userId: member });
        await closeProject(sql, projectId);

        // A closed Project's own step conversations stay readable as history.
        const closedBindings = await listStageChatBindings({
          actorUserId: member,
          projectId,
        });
        assert.deepEqual(
          closedBindings.map((binding) => binding.chatId),
          [memberChat.chatId],
          "a closed Project must still expose the actor's own step binding"
        );

        // Reopening the existing binding replays it read-only; nothing is created.
        const reopened = await findOrCreateStageChat({
          actorUserId: member,
          projectId,
          stageKey: "student500",
        });
        assert.equal(reopened.chatId, memberChat.chatId);
        assert.equal(reopened.replayed, true);
        assert.equal(
          reopened.readOnly,
          true,
          "a closed Project is read-only even for an active member"
        );

        // A *new* step cannot be opened in a closed Project: the M1 write path refuses
        // it and the failed attempt persists nothing.
        await assert.rejects(
          findOrCreateStageChat({
            actorUserId: member,
            projectId,
            stageKey: "school_applications",
          }),
          isFoundationError("project_closed"),
          "a closed Project must refuse a new step conversation"
        );
        assert.equal(
          await countStageRows(sql, { createdByUserId: member, projectId }),
          1,
          "a refused closed-Project create must not leave a binding behind"
        );
      });
    } finally {
      await closeLazyDatabase();
    }
  }
);
