/**
 * Phase 14 Project naming — guarded real-PostgreSQL acceptance (NOT executed here).
 *
 * Excluded from `test:unit` and from default globs. It applies migration 0054 through the
 * Drizzle migrator (so the ledger stays authoritative) and writes synthetic rows, so it is
 * doubly guarded: it skips unless the owner explicitly opts in AND the connection is the
 * verified local Unix socket to the one authorized isolated database.
 *
 * Connection (owner environment): Unix socket `/var/run/postgresql/.s.PGSQL.5432`,
 * database `immigration_ai_phase14_b_test`, user `rico`. `POSTGRES_URL`, `.env.local`,
 * TCP credentials and every other database are deliberately never read or used.
 *
 * Owner-authorized run (applying 0054 is itself the separate owner approval):
 *
 *   PHASE14_NAMING_POSTGRES_ACCEPTANCE=1 \
 *     node --conditions=react-server --import tsx --test \
 *     lib/db/project-naming.postgres.integration.test.ts
 *
 * It never touches `chatbot`, `immigration_legal`, AWS/S3 or any remote environment.
 */
// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions belong to the guarded integration test below.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  createProjectFoundationRepository,
  ProjectFoundationError,
} from "./project-foundation";
import { projectEvent, projectOperation } from "./schema";

const SOCKET_PATH = "/var/run/postgresql/.s.PGSQL.5432";
const DATABASE_NAME = "immigration_ai_phase14_b_test";
const DATABASE_USER = "rico";
const LEDGER_BEFORE = 54;
const LEDGER_AFTER = 55;
const AUTHORIZED = process.env.PHASE14_NAMING_POSTGRES_ACCEPTANCE === "1";
const skipReason = AUTHORIZED
  ? false
  : "PHASE14_NAMING_POSTGRES_ACCEPTANCE is not 1 (guarded: applies migration 0054 to the isolated acceptance database)";

async function verifyIdentity(sql: ReturnType<typeof postgres>) {
  const [identity] = await sql<
    {
      database: string;
      db_user: string;
      server_version: string;
      port: string;
      client_addr: string | null;
    }[]
  >`
    select current_database() as database,
           current_user as db_user,
           version() as server_version,
           current_setting('port') as port,
           (select a.client_addr::text from pg_stat_activity a
             where a.pid = pg_backend_pid()) as client_addr
  `;
  assert.equal(identity?.database, DATABASE_NAME);
  assert.equal(identity?.db_user, DATABASE_USER);
  assert.match(identity?.server_version ?? "", /^PostgreSQL 17\./u);
  assert.equal(identity?.port, "5432");
  // A Unix-domain connection is reported with a NULL peer address.
  assert.equal(identity?.client_addr, null);
}

async function ledgerCount(sql: ReturnType<typeof postgres>) {
  const [row] = await sql<{ count: string }[]>`
    select count(*)::text as count from drizzle.__drizzle_migrations
  `;
  return Number(row?.count ?? -1);
}

async function expectCode(code: string, run: () => Promise<unknown>) {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof ProjectFoundationError);
    assert.equal(error.code, code);
    return true;
  });
}

test(
  "Phase 14 naming — migration 0054 and the owner-only rename contract",
  { skip: skipReason },
  async () => {
    assert.equal(
      existsSync(SOCKET_PATH),
      true,
      `the approved PostgreSQL socket must exist: ${SOCKET_PATH}`
    );
    const sql = postgres({
      path: SOCKET_PATH,
      database: DATABASE_NAME,
      username: DATABASE_USER,
      max: 1,
      connect_timeout: 10,
    });
    const database = drizzle(sql);
    const actorUserId = randomUUID();
    const memberUserId = randomUUID();
    try {
      // Identity and ledger BEFORE any write.
      await verifyIdentity(sql);
      const appliedBefore = await ledgerCount(sql);
      const beforeColumn = await sql`
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'StudyJourneyProject'
          and column_name = 'displayName'
      `;

      if (appliedBefore === LEDGER_BEFORE) {
        assert.equal(beforeColumn.length, 0, "0054 column unexpectedly present");
        await migrate(database, {
          migrationsFolder: resolve("lib/db/migrations"),
        });
      } else {
        assert.equal(appliedBefore, LEDGER_AFTER, "Unexpected migration ledger");
        assert.equal(beforeColumn.length, 1, "0054 column missing");
      }

      assert.equal(await ledgerCount(sql), LEDGER_AFTER);
      const [afterColumn] = await sql<
        { data_type: string; max_length: number; is_nullable: string }[]
      >`
        select data_type,
               character_maximum_length as max_length,
               is_nullable
        from information_schema.columns
        where table_name = 'StudyJourneyProject' and column_name = 'displayName'
      `;
      assert.equal(afterColumn?.data_type, "character varying");
      assert.equal(Number(afterColumn?.max_length), 100);
      assert.equal(afterColumn?.is_nullable, "YES");

      await sql`
        insert into "User" (id, email, role)
        values (${actorUserId}, ${`phase14naming.${randomUUID().slice(0, 8)}@test.invalid`}, 'user'),
               (${memberUserId}, ${`phase14naming.${randomUUID().slice(0, 8)}@test.invalid`}, 'user')
      `;
      const repository = createProjectFoundationRepository({ database });

      // A named creation persists the normalized name; a legacy one stays NULL.
      const named = await repository.createProject({
        actorUserId,
        operationId: "p14n.create.named",
        displayName: "  2027 Student 500 Application  ",
      });
      assert.equal(named.project.displayName, "2027 Student 500 Application");
      assert.equal(named.project.revision, 1);
      const legacy = await repository.createProject({
        actorUserId,
        operationId: "p14n.create.legacy",
      });
      assert.equal(legacy.project.displayName, null);

      // Owner rename: one revision bump, one project_renamed event, one operation row.
      const renamed = await repository.renameProject({
        actorUserId,
        projectId: named.project.id,
        expectedRevision: 1,
        operationId: "p14n.rename.one",
        displayName: "Renamed Application",
      });
      assert.equal(renamed.replayed, false);
      assert.equal(renamed.project.displayName, "Renamed Application");
      assert.equal(renamed.project.revision, 2);
      const events = await database
        .select({ eventType: projectEvent.eventType })
        .from(projectEvent)
        .where(eq(projectEvent.projectId, named.project.id));
      assert.deepEqual(events.map((event) => event.eventType).sort(), [
        "project_created",
        "project_renamed",
      ]);
      const operations = await database
        .select({ operationType: projectOperation.operationType })
        .from(projectOperation)
        .where(eq(projectOperation.actorUserId, actorUserId));
      assert.equal(
        operations.filter((row) => row.operationType === "project_rename")
          .length,
        1
      );

      // Replay with the ORIGINAL (now stale) revision must not write again.
      const replayed = await repository.renameProject({
        actorUserId,
        projectId: named.project.id,
        expectedRevision: 1,
        operationId: "p14n.rename.one",
        displayName: "Renamed Application",
      });
      assert.equal(replayed.replayed, true);
      assert.equal(replayed.project.revision, 2);
      // A changed payload under the same operation id conflicts instead of replaying.
      await expectCode("idempotency_conflict", () =>
        repository.renameProject({
          actorUserId,
          projectId: named.project.id,
          expectedRevision: 1,
          operationId: "p14n.rename.one",
          displayName: "Different Name",
        })
      );
      // A stale revision with a fresh operation id is a truthful CAS conflict.
      await expectCode("revision_conflict", () =>
        repository.renameProject({
          actorUserId,
          projectId: named.project.id,
          expectedRevision: 1,
          operationId: "p14n.rename.stale",
          displayName: "Stale Attempt",
        })
      );

      // Membership is not ownership: an ACTIVE member can never rename.
      await sql`
        insert into "ProjectMembership"
          ("projectId", "userId", "status", "invitedByUserId", "acceptedAt")
        values (${named.project.id}, ${memberUserId}, 'active', ${actorUserId}, now())
      `;
      await expectCode("project_forbidden", () =>
        repository.renameProject({
          actorUserId: memberUserId,
          projectId: named.project.id,
          expectedRevision: 2,
          operationId: "p14n.rename.member",
          displayName: "Member Attempt",
        })
      );

      // The rename is durable for a fresh reader (not just the mutation snapshot).
      const [stored] = await sql<
        { displayName: string | null; revision: number }[]
      >`
        select "displayName", revision from "StudyJourneyProject"
        where id = ${named.project.id}
      `;
      assert.equal(stored?.displayName, "Renamed Application");
      assert.equal(Number(stored?.revision), 2);
      console.log(
        "PHASE14_NAMING_POSTGRES_ACCEPTANCE_PASS — socket identity verified; 0054 applied; named/legacy creation, rename CAS, replay, conflict and membership rejection verified"
      );
    } finally {
      // Only synthetic rows are addressed. The Phase 13 append-only guards may retain
      // audit rows inside this disposable database; its lifecycle stays with the owner.
      await sql`
        delete from "ProjectMembership"
        where "userId" in (${actorUserId}, ${memberUserId})
      `.catch(() => undefined);
      await sql`
        delete from "StudyJourneyProject"
        where "ownerUserId" = ${actorUserId}
      `.catch(() => undefined);
      await sql`
        delete from "User" where id in (${actorUserId}, ${memberUserId})
      `.catch(() => undefined);
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }
  }
);
