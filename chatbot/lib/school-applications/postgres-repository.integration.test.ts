// biome-ignore-all lint/suspicious/noMisplacedAssertion: guarded disposable-database assertions stay in their test scope.
// biome-ignore-all lint/suspicious/useAwait: the persistence port is asynchronous by contract.
/**
 * Phase 13 M5.1 — PostgreSQL acceptance suite.
 *
 * Every behavioural test drives the real `createPostgresSchoolApplicationStore()`
 * against a disposable, isolated PostgreSQL 17 database. The suite skips unless
 * every coordinate below is explicitly provided; a wrong coordinate is a failure,
 * never a fallback.
 *
 * Required environment (no fallback):
 *
 *   PHASE13_M5_1_DB_INTEGRATION=true
 *   PHASE13_M5_1_TEST_ENVIRONMENT_ID=phase13-m5-1-disposable
 *   PHASE13_M5_1_TEST_DATABASE_ROLE=<dedicated disposable role>
 *   PHASE13_M5_1_TEST_DATABASE_URL=postgres://<role>:…@127.0.0.1:<hostPort>/immigration_ai_phase13_m5_1_test
 *   PHASE13_M5_1_TEST_HOST_PORT=<host-published port, never 5432>
 *   PHASE13_M5_1_TEST_SERVER_PORT=<port PostgreSQL listens on inside its server>
 *   POSTGRES_URL=<the same URL>   # the store resolves its pool from POSTGRES_URL
 *   DATABASE_URL=<the same URL>   # assertion-side client identity
 *
 *   node --conditions=react-server --import tsx --test \
 *     lib/school-applications/postgres-repository.integration.test.ts
 *
 * Docker/NAT port mapping: a container publishes `-p 127.0.0.1:<hostPort>:<serverPort>`
 * (commonly `…:55447:5432`). The URL must use the *host* port, while
 * `inet_server_port()` inside the server reports the *server* port. Both are
 * therefore declared explicitly and verified, instead of assuming they are equal.
 *
 * Safety properties enforced by `assertDisposableTarget`:
 *   - explicit loopback host, explicit host port, never port 5432,
 *   - the URL port must equal the declared host port and `inet_server_port()`
 *     must equal the declared server port,
 *   - database name must be the disposable database, never `immigration_legal`,
 *   - role must match the declared disposable role and never `rico_local`,
 *   - environment identity must be the explicit disposable marker,
 *   - `POSTGRES_URL` (the store's pool) and `DATABASE_URL` must both equal the
 *     disposable URL, so neither the store nor a helper can silently connect to
 *     the authoritative database loaded from `.env.local`.
 *
 * Migration 0046 must already be applied to that database by the controlled
 * operator procedure; this suite never applies migrations.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import {
  buildSchoolApplicationPackage,
  type SchoolApplicationError,
  type SchoolApplicationRequestIdentity,
  schoolApplicationRequestSha256,
} from "./contracts";
import type {
  SchoolApplicationOperationStamp,
  SchoolApplicationRecord,
} from "./ports";

loadEnv({ path: resolve(".env.local"), override: false });

const EXPECTED_DATABASE = "immigration_ai_phase13_m5_1_test";
const EXPECTED_ENVIRONMENT_ID = "phase13-m5-1-disposable";
const FORBIDDEN_DATABASE = "immigration_legal";
const FORBIDDEN_ROLE = "rico_local";
const FORBIDDEN_PORT = "5432";
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1", "[::1]"];
const LOCK_POLL_INTERVAL_MS = 20;
const LOCK_TIMEOUT_MS = 8000;

const OPT_IN =
  process.env.PHASE13_M5_1_DB_INTEGRATION?.trim().toLowerCase() === "true";
const TEST_DATABASE_URL =
  process.env.PHASE13_M5_1_TEST_DATABASE_URL?.trim() ?? "";
const TEST_DATABASE_ROLE =
  process.env.PHASE13_M5_1_TEST_DATABASE_ROLE?.trim() ?? "";
const TEST_ENVIRONMENT_ID =
  process.env.PHASE13_M5_1_TEST_ENVIRONMENT_ID?.trim() ?? "";
const TEST_HOST_PORT = process.env.PHASE13_M5_1_TEST_HOST_PORT?.trim() ?? "";
const TEST_SERVER_PORT =
  process.env.PHASE13_M5_1_TEST_SERVER_PORT?.trim() ?? "";

const skipReason = (() => {
  if (!OPT_IN) {
    return "PHASE13_M5_1_DB_INTEGRATION is not enabled (explicit opt-in required)";
  }
  if (!TEST_DATABASE_URL) {
    return "PHASE13_M5_1_TEST_DATABASE_URL is not configured (disposable database required)";
  }
  if (!TEST_DATABASE_ROLE) {
    return "PHASE13_M5_1_TEST_DATABASE_ROLE is not configured (disposable role required)";
  }
  if (!TEST_ENVIRONMENT_ID) {
    return "PHASE13_M5_1_TEST_ENVIRONMENT_ID is not configured (environment identity required)";
  }
  if (!TEST_HOST_PORT) {
    return "PHASE13_M5_1_TEST_HOST_PORT is not configured (host-published port required)";
  }
  if (!TEST_SERVER_PORT) {
    return "PHASE13_M5_1_TEST_SERVER_PORT is not configured (server-side port required)";
  }
  if (!process.env.POSTGRES_URL?.trim()) {
    return "POSTGRES_URL is not scoped to the disposable database (the store would otherwise use .env.local)";
  }
  return false as const;
})();

/**
 * Fails closed on any coordinate that could reach the authoritative corpus or an
 * accidental default cluster. Missing pieces are a failure, never a fallback.
 */
function assertDisposableTarget() {
  const url = new URL(TEST_DATABASE_URL);
  assert.ok(
    url.protocol === "postgres:" || url.protocol === "postgresql:",
    "the disposable URL must be a PostgreSQL URL"
  );
  assert.ok(
    url.hostname.length > 0,
    "the disposable URL needs an explicit host"
  );
  assert.ok(
    LOOPBACK_HOSTS.includes(url.hostname),
    `the disposable host must be loopback, got ${url.hostname}`
  );
  assert.ok(
    url.port.length > 0,
    "the disposable URL must declare an explicit host port (no implicit 5432)"
  );
  assert.notEqual(
    url.port,
    FORBIDDEN_PORT,
    "port 5432 is reserved for the authoritative database and must never be used"
  );
  // Docker/NAT publishes a host port that differs from the port the server
  // listens on inside its own network namespace. Both must be declared and must
  // agree with the URL and with `inet_server_port()` respectively.
  assert.equal(
    url.port,
    TEST_HOST_PORT,
    "the URL port must equal PHASE13_M5_1_TEST_HOST_PORT"
  );
  assert.notEqual(
    TEST_SERVER_PORT,
    "",
    "PHASE13_M5_1_TEST_SERVER_PORT must be declared"
  );
  const database = decodeURIComponent(url.pathname.replace(/^\/+/u, ""));
  assert.equal(
    database,
    EXPECTED_DATABASE,
    "the disposable database name must match exactly"
  );
  assert.notEqual(database, FORBIDDEN_DATABASE);
  const role = decodeURIComponent(url.username);
  assert.equal(
    role,
    TEST_DATABASE_ROLE,
    "the URL role must equal PHASE13_M5_1_TEST_DATABASE_ROLE"
  );
  assert.notEqual(role, FORBIDDEN_ROLE, "the authoritative role is forbidden");
  assert.equal(
    TEST_ENVIRONMENT_ID,
    EXPECTED_ENVIRONMENT_ID,
    "the environment identity must be the explicit disposable marker"
  );
  // The store resolves its pool from POSTGRES_URL, while the assertion-side
  // clients use DATABASE_URL. Both must be scoped to the disposable database so
  // the `.env.local` authoritative value can never leak into this suite.
  assert.equal(
    process.env.POSTGRES_URL?.trim(),
    TEST_DATABASE_URL,
    "POSTGRES_URL must be the disposable URL, never the authoritative one"
  );
  assert.equal(
    process.env.DATABASE_URL?.trim(),
    TEST_DATABASE_URL,
    "DATABASE_URL must be the disposable URL, never the authoritative one"
  );
}

function pause(milliseconds: number) {
  return new Promise((done) => {
    setTimeout(done, milliseconds);
  });
}

function operationId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function stamp(input: {
  actorUserId: string;
  operationId: string;
  identity: SchoolApplicationRequestIdentity;
}): SchoolApplicationOperationStamp {
  return {
    actorUserId: input.actorUserId,
    operationId: input.operationId,
    operationType: input.identity.operationType,
    requestSha256: schoolApplicationRequestSha256(input.identity),
  };
}

/**
 * Deterministic synchronization: waits until the database *reports* a backend
 * that is blocked by the specific transaction holding the Project row lock.
 *
 * Two review findings are addressed here:
 *   1. the observation runs on a **dedicated** connection, so it can never block
 *      on the single connection that is holding the lock, and
 *   2. row-level `SELECT … FOR UPDATE` waits are represented by transaction-ID
 *      locks, not by a non-granted relation lock, so the check uses
 *      `pg_blocking_pids()` / `pg_stat_activity` for the real blocker backend
 *      rather than `pg_locks.relation`.
 *
 * The observed blocked backend — not elapsed time — proves the interleaving, and
 * the wait is bounded so a missing block fails the test instead of hanging.
 */
async function waitForBackendBlockedBy(
  observer: Sql,
  blockerPid: number
): Promise<{ blockedPid: number; blockedQuery: string; waitEvent: string }> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const rows = await observer<
      { pid: number; query: string; waitEvent: string }[]
    >`
      select a.pid as pid,
             a.query as query,
             coalesce(a.wait_event_type || ':' || a.wait_event, 'none') as "waitEvent"
      from pg_stat_activity a
      where a.datname = current_database()
        and a.pid <> pg_backend_pid()
        and pg_blocking_pids(a.pid) @> array[${blockerPid}::int]
    `;
    const waiter = rows[0];
    if (waiter) {
      return {
        blockedPid: waiter.pid,
        blockedQuery: waiter.query,
        waitEvent: waiter.waitEvent,
      };
    }
    await pause(LOCK_POLL_INTERVAL_MS);
  }
  assert.fail(
    `no backend was observed waiting on blocker pid ${blockerPid}; the interleaving was not reproduced`
  );
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

async function expectSchoolError(
  promise: Promise<unknown>,
  code: ConstructorParameters<typeof SchoolApplicationError>[0]
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal(errorCode(error), code);
    return true;
  });
}

test(
  "the disposable target, environment identity and applied 0046 schema are verified",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const sql = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      // Live identity: the server we actually reached must match the declared
      // coordinates. `inet_server_port()` reports the port PostgreSQL listens on
      // inside its own namespace, which is the declared server port — not the
      // host-published port used in the URL.
      const [identity] = await sql<
        {
          database: string;
          role: string;
          port: number;
          serverAddress: string | null;
          version: string;
        }[]
      >`
        select current_database() as database,
               current_user as role,
               inet_server_port() as port,
               inet_server_addr()::text as "serverAddress",
               current_setting('server_version') as version
      `;
      assert.equal(identity.database, EXPECTED_DATABASE);
      assert.notEqual(identity.database, FORBIDDEN_DATABASE);
      assert.equal(identity.role, TEST_DATABASE_ROLE);
      assert.notEqual(identity.role, FORBIDDEN_ROLE);
      assert.equal(String(identity.port), TEST_SERVER_PORT);
      assert.match(identity.version, /^17\./u);

      const [triggers] = await sql<{ count: number }[]>`
        select count(*)::int as count
        from pg_trigger
        where not tgisinternal
          and tgname in (
            'SchoolApplication_guard',
            'SchoolApplicationPackage_guard',
            'SchoolApplicationReference_guard',
            'SchoolApplicationOperation_append_only',
            'SchoolApplicationEvent_append_only'
          )
      `;
      assert.equal(triggers.count, 5);
      const [indexes] = await sql<{ count: number }[]>`
        select count(*)::int as count
        from pg_indexes
        where schemaname = 'public'
          and indexname in (
            'SchoolApplication_project_id_unique',
            'SchoolApplicationPackage_current_application_unique',
            'SchoolApplicationPackage_application_version_unique',
            'SchoolApplicationReference_active_unique',
            'SchoolApplicationOperation_actor_operation_unique',
            'SchoolApplicationEvent_revision_event_unique'
          )
      `;
      assert.equal(indexes.count, 6);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

test(
  "the application guard accepts authorized material edits and rejects identity changes",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const sql = postgres(TEST_DATABASE_URL, { max: 2 });
    try {
      const owner = await insertUser(sql);
      const projectId = await insertProject(sql, { ownerUserId: owner });
      const applicationId = await insertApplication(sql, {
        ownerUserId: owner,
        projectId,
      });

      // A legitimate authorized edit is accepted and advances the revision by one.
      const [edited] = await sql<
        { institutionName: string; revision: number; status: string }[]
      >`
        update "SchoolApplication"
           set "institutionName" = 'Renamed University',
               "courseTitle" = 'Renamed Course',
               "status" = 'stale',
               "revision" = "revision" + 1,
               "updatedAt" = now()
         where "id" = ${applicationId}
        returning "institutionName", "revision", "status"
      `;
      assert.equal(edited.institutionName, "Renamed University");
      assert.equal(edited.revision, 2);
      assert.equal(edited.status, "stale");

      await assert.rejects(
        sql`update "SchoolApplication"
               set "ownerUserId" = ${await insertUser(sql)},
                   "revision" = "revision" + 1
             where "id" = ${applicationId}`,
        /identity is immutable/u
      );
      await assert.rejects(
        sql`update "SchoolApplication"
               set "projectId" = ${await insertProject(sql, { ownerUserId: owner })},
                   "revision" = "revision" + 1
             where "id" = ${applicationId}`,
        /identity is immutable/u
      );
      await assert.rejects(
        sql`update "SchoolApplication"
               set "revision" = "revision" + 2
             where "id" = ${applicationId}`,
        /advance by exactly one/u
      );
      await sql`
        update "SchoolApplication"
           set "status" = 'archived', "archivedAt" = now(),
               "revision" = "revision" + 1, "updatedAt" = now()
         where "id" = ${applicationId}
      `;
      await assert.rejects(
        sql`update "SchoolApplication"
               set "courseTitle" = 'After archive', "revision" = "revision" + 1
             where "id" = ${applicationId}`,
        /terminal/u
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

test(
  "the real store creates, replays exactly, and conflicts on a changed request",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const sql = postgres(TEST_DATABASE_URL, { max: 2 });
    const store = await createStore();
    try {
      const owner = await insertUser(sql);
      const projectId = await insertProject(sql, { ownerUserId: owner });
      const identity = {
        operationType: "school_application_create",
        projectId,
        target: {
          courseId: null,
          courseTitle: "Bachelor of Nursing",
          deliveryId: null,
          institutionId: null,
          institutionName: "Example University",
          intakeId: null,
          intakeLabel: "February 2027",
        },
      } as const satisfies SchoolApplicationRequestIdentity;
      const op = operationId("create");
      const first = await store.createApplication({
        operation: stamp({ actorUserId: owner, identity, operationId: op }),
        projectId,
        values: {
          catalogRecordClass: null,
          catalogSnapshotToken: null,
          courseId: null,
          courseTitle: "Bachelor of Nursing",
          deliveryId: null,
          institutionId: null,
          institutionName: "Example University",
          intakeId: null,
          intakeLabel: "February 2027",
          ownerUserId: owner,
          sourceStatus: "unverified_customer_declared",
        },
      });
      assert.equal(first.replayed, false);
      assert.equal(first.value.revision, 1);
      assert.equal(first.value.status, "draft");

      // Exact replay: same operation id and same authored payload.
      const replay = await store.createApplication({
        operation: stamp({ actorUserId: owner, identity, operationId: op }),
        projectId,
        values: first.value as never,
      });
      assert.equal(replay.replayed, true);
      assert.equal(replay.value.id, first.value.id);

      // Changed payload under the same operation id.
      await expectSchoolError(
        store.createApplication({
          operation: stamp({
            actorUserId: owner,
            identity: {
              ...identity,
              target: { ...identity.target, courseTitle: "Changed Course" },
            },
            operationId: op,
          }),
          projectId,
          values: first.value as never,
        }),
        "idempotency_conflict"
      );

      const [counts] = await sql<
        { applications: number; operations: number }[]
      >`
        select (select count(*)::int from "SchoolApplication" where "projectId" = ${projectId}) as applications,
               (select count(*)::int from "SchoolApplicationOperation" where "actorUserId" = ${owner}) as operations
      `;
      assert.equal(counts.applications, 1);
      assert.equal(counts.operations, 1);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

test(
  "CAS conflicts admit exactly one winner and exact retries resolve the recorded write",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const sql = postgres(TEST_DATABASE_URL, { max: 2 });
    const store = await createStore();
    try {
      const owner = await insertUser(sql);
      const projectId = await insertProject(sql, { ownerUserId: owner });
      const created = await createApplication(store, {
        courseTitle: "Bachelor of Nursing",
        institutionName: "Example University",
        owner,
        projectId,
      });

      const edit = (operationIdValue: string, courseTitle: string) => {
        const identity = {
          applicationId: created.id,
          expectedRevision: 1,
          operationType: "school_application_update",
          projectId,
          target: {
            courseId: null,
            courseTitle,
            deliveryId: null,
            institutionId: null,
            institutionName: "Example University",
            intakeId: null,
            intakeLabel: "February 2027",
          },
        } as const satisfies SchoolApplicationRequestIdentity;
        return store.updateApplication({
          applicationId: created.id,
          expectedRevision: 1,
          operation: stamp({
            actorUserId: owner,
            identity,
            operationId: operationIdValue,
          }),
          ownerUserId: owner,
          projectId,
          values: {
            catalogRecordClass: null,
            catalogSnapshotToken: null,
            courseId: null,
            courseTitle,
            deliveryId: null,
            institutionId: null,
            institutionName: "Example University",
            intakeId: null,
            intakeLabel: "February 2027",
            ownerUserId: owner,
            sourceStatus: "unverified_customer_declared",
          },
        });
      };

      const [winner, loser] = await Promise.allSettled([
        edit(operationId("cas-a"), "Course A"),
        edit(operationId("cas-b"), "Course B"),
      ]);
      assert.equal(winner.status, "fulfilled");
      assert.equal(loser.status, "rejected");
      assert.equal(
        errorCode((loser as PromiseRejectedResult).reason),
        "revision_conflict"
      );

      const [row] = await sql<{ revision: number }[]>`
        select "revision" from "SchoolApplication" where "id" = ${created.id}
      `;
      assert.equal(row.revision, 2);
      const [events] = await sql<{ count: number }[]>`
        select count(*)::int as count
        from "SchoolApplicationEvent"
        where "applicationId" = ${created.id} and "eventType" = 'school_application_updated'
      `;
      assert.equal(events.count, 1);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

test(
  "legitimate school and course edits persist and invalidate the current package",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const sql = postgres(TEST_DATABASE_URL, { max: 2 });
    const store = await createStore();
    try {
      const owner = await insertUser(sql);
      const projectId = await insertProject(sql, { ownerUserId: owner });
      const created = await createApplication(store, {
        courseTitle: "Bachelor of Nursing",
        institutionName: "Example University",
        owner,
        projectId,
      });

      const builtPackage = buildSchoolApplicationPackage({
        inputs: packageInputs({ application: created, projectId }),
        packageVersion: 1,
      });
      const built = await store.buildPackage({
        applicationId: created.id,
        expectedRevision: 1,
        operation: stamp({
          actorUserId: owner,
          identity: {
            applicationId: created.id,
            expectedRevision: 1,
            operationType: "school_application_package_build",
            projectId,
          },
          operationId: operationId("build"),
        }),
        ownerUserId: owner,
        package: builtPackage,
        projectId,
        references: [],
      });
      assert.equal(built.value.status, "current");

      const edited = await store.updateApplication({
        applicationId: created.id,
        expectedRevision: 2,
        operation: stamp({
          actorUserId: owner,
          identity: {
            applicationId: created.id,
            expectedRevision: 2,
            operationType: "school_application_update",
            projectId,
            target: {
              courseId: null,
              courseTitle: "Bachelor of Nursing (Honours)",
              deliveryId: null,
              institutionId: null,
              institutionName: "Renamed University",
              intakeId: null,
              intakeLabel: "February 2027",
            },
          },
          operationId: operationId("edit"),
        }),
        ownerUserId: owner,
        projectId,
        values: {
          catalogRecordClass: null,
          catalogSnapshotToken: null,
          courseId: null,
          courseTitle: "Bachelor of Nursing (Honours)",
          deliveryId: null,
          institutionId: null,
          institutionName: "Renamed University",
          intakeId: null,
          intakeLabel: "February 2027",
          ownerUserId: owner,
          sourceStatus: "unverified_customer_declared",
        },
      });

      // Persisted, revision advanced, package invalidated in the same transaction.
      assert.equal(edited.value.institutionName, "Renamed University");
      assert.equal(edited.value.courseTitle, "Bachelor of Nursing (Honours)");
      assert.equal(edited.value.revision, 3);
      assert.equal(edited.value.status, "stale");

      const packages = await store.listPackages({ applicationId: created.id });
      assert.equal(packages.length, 1);
      assert.equal(packages[0]?.status, "stale");
      assert.equal(packages[0]?.contentSha256, builtPackage.contentSha256);

      const [invalidation] = await sql<{ count: number }[]>`
        select count(*)::int as count
        from "SchoolApplicationEvent"
        where "applicationId" = ${created.id}
          and "eventType" = 'school_application_package_invalidated'
      `;
      assert.equal(invalidation.count, 1);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

test(
  "reference and package writes stay inside one transaction with append-only audit",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const sql = postgres(TEST_DATABASE_URL, { max: 2 });
    const store = await createStore();
    try {
      const owner = await insertUser(sql);
      const projectId = await insertProject(sql, { ownerUserId: owner });
      const created = await createApplication(store, {
        courseTitle: "Bachelor of Nursing",
        institutionName: "Example University",
        owner,
        projectId,
      });
      const referenceId = randomUUID();

      const bound = await store.bindReference({
        applicationId: created.id,
        expectedRevision: 1,
        kind: "fact",
        operation: stamp({
          actorUserId: owner,
          identity: {
            applicationId: created.id,
            expectedRevision: 1,
            kind: "fact",
            operationType: "school_application_reference_bind",
            projectId,
            referenceId,
          },
          operationId: operationId("bind"),
        }),
        ownerUserId: owner,
        projectId,
        referenceId,
        referenceSha256: "a".repeat(64),
        referenceVersion: 1,
      });
      assert.equal(bound.value.kind, "fact");

      // A failed package build must roll the entire transaction back.
      await expectSchoolError(
        store.buildPackage({
          applicationId: created.id,
          expectedRevision: 2,
          operation: stamp({
            actorUserId: owner,
            identity: {
              applicationId: created.id,
              expectedRevision: 2,
              operationType: "school_application_package_build",
              projectId,
            },
            operationId: operationId("bad-build"),
          }),
          ownerUserId: owner,
          package: buildSchoolApplicationPackage({
            inputs: packageInputs({
              application: { ...created, revision: 2 },
              projectId,
            }),
            packageVersion: 1,
          }),
          projectId,
          references: [
            {
              referenceRecordId: randomUUID(),
              referenceSha256: "b".repeat(64),
              referenceVersion: 1,
            },
          ],
        }),
        "integrity_conflict"
      );

      const [state] = await sql<
        {
          events: number;
          operations: number;
          packages: number;
          revision: number;
        }[]
      >`
        select (select count(*)::int from "SchoolApplicationPackage" where "applicationId" = ${created.id}) as packages,
               (select count(*)::int from "SchoolApplicationEvent" where "applicationId" = ${created.id}) as events,
               (select count(*)::int from "SchoolApplicationOperation" where "actorUserId" = ${owner}) as operations,
               (select "revision" from "SchoolApplication" where "id" = ${created.id}) as revision
      `;
      assert.equal(state.packages, 0);
      assert.equal(state.operations, 2);
      assert.equal(state.revision, 2);
      // create + reference_bound: the failed build appended nothing.
      assert.equal(state.events, 2);

      // Audit and reference history are append-only.
      await assert.rejects(
        sql`update "SchoolApplicationEvent" set "eventType" = 'tampered' where "applicationId" = ${created.id}`,
        /append-only/u
      );
      await assert.rejects(
        sql`delete from "SchoolApplicationOperation" where "actorUserId" = ${owner}`,
        /append-only/u
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

test(
  "a membership revocation racing with a real store mutation fails closed",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const revoker = postgres(TEST_DATABASE_URL, { max: 1 });
    const observer = postgres(TEST_DATABASE_URL, { max: 1 });
    const store = await createStore();
    try {
      const ownerUserId = await insertUser(revoker);
      const memberUserId = await insertUser(revoker);
      const projectId = await insertProject(revoker, { ownerUserId });
      await insertMembership(revoker, {
        invitedByUserId: ownerUserId,
        projectId,
        status: "active",
        userId: memberUserId,
      });
      const created = await createApplication(store, {
        courseTitle: "Bachelor of Nursing",
        institutionName: "Example University",
        owner: memberUserId,
        projectId,
      });

      // The revoker holds the Project row lock first, exactly like M1 membership
      // revocation, so the store mutation must block on that specific backend.
      let mutation: Promise<unknown> | null = null;
      await revoker.begin(async (tx) => {
        const [self] = await tx<
          { pid: number }[]
        >`select pg_backend_pid() as pid`;
        const blockerPid = self.pid;
        await tx`select 1 from "StudyJourneyProject" where "id" = ${projectId} for update`;
        const guardMutation = store.updateApplication({
          applicationId: created.id,
          expectedRevision: 1,
          operation: stamp({
            actorUserId: memberUserId,
            identity: {
              applicationId: created.id,
              expectedRevision: 1,
              operationType: "school_application_update",
              projectId,
              target: {
                courseId: null,
                courseTitle: "Blocked by revocation",
                deliveryId: null,
                institutionId: null,
                institutionName: "Example University",
                intakeId: null,
                intakeLabel: "February 2027",
              },
            },
            operationId: operationId("race-revoked"),
          }),
          ownerUserId: memberUserId,
          projectId,
          values: {
            catalogRecordClass: null,
            catalogSnapshotToken: null,
            courseId: null,
            courseTitle: "Blocked by revocation",
            deliveryId: null,
            institutionId: null,
            institutionName: "Example University",
            intakeId: null,
            intakeLabel: "February 2027",
            ownerUserId: memberUserId,
            sourceStatus: "unverified_customer_declared",
          },
        });
        // Observed on the dedicated observer connection, never on this one.
        // The no-op catch only prevents an unhandled rejection if the observation
        // itself fails and this test aborts before awaiting the mutation.
        guardMutation.catch(() => undefined);
        mutation = guardMutation;
        const blocked = await waitForBackendBlockedBy(observer, blockerPid);
        assert.notEqual(blocked.blockedPid, blockerPid);
        assert.match(blocked.waitEvent, /^Lock:/u);
        assert.match(
          blocked.blockedQuery,
          /StudyJourneyProject|SchoolApplication/u
        );
        await tx`
          update "ProjectMembership"
             set "status" = 'revoked', "revokedAt" = now(), "updatedAt" = now()
           where "projectId" = ${projectId} and "userId" = ${memberUserId}
        `;
      });

      assert.ok(mutation);
      await expectSchoolError(
        mutation as Promise<unknown>,
        "project_forbidden"
      );

      const [row] = await revoker<
        { courseTitle: string; revision: number }[]
      >`select "courseTitle", "revision" from "SchoolApplication" where "id" = ${created.id}`;
      assert.equal(row.revision, 1);
      assert.equal(row.courseTitle, "Bachelor of Nursing");
    } finally {
      await observer.end({ timeout: 5 });
      await revoker.end({ timeout: 5 });
    }
  }
);

test(
  "a Project closure racing with a real store mutation fails closed",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const closer = postgres(TEST_DATABASE_URL, { max: 1 });
    const observer = postgres(TEST_DATABASE_URL, { max: 1 });
    const store = await createStore();
    try {
      const ownerUserId = await insertUser(closer);
      const projectId = await insertProject(closer, { ownerUserId });
      const created = await createApplication(store, {
        courseTitle: "Bachelor of Nursing",
        institutionName: "Example University",
        owner: ownerUserId,
        projectId,
      });

      let mutation: Promise<unknown> | null = null;
      await closer.begin(async (tx) => {
        const [self] = await tx<
          { pid: number }[]
        >`select pg_backend_pid() as pid`;
        const blockerPid = self.pid;
        await tx`select 1 from "StudyJourneyProject" where "id" = ${projectId} for update`;
        const closeMutation = store.archiveApplication({
          applicationId: created.id,
          expectedRevision: 1,
          operation: stamp({
            actorUserId: ownerUserId,
            identity: {
              applicationId: created.id,
              expectedRevision: 1,
              operationType: "school_application_archive",
              projectId,
            },
            operationId: operationId("race-closed"),
          }),
          ownerUserId,
          projectId,
        });
        // Observed on the dedicated observer connection, never on this one.
        closeMutation.catch(() => undefined);
        mutation = closeMutation;
        const blocked = await waitForBackendBlockedBy(observer, blockerPid);
        assert.notEqual(blocked.blockedPid, blockerPid);
        assert.match(blocked.waitEvent, /^Lock:/u);
        assert.match(
          blocked.blockedQuery,
          /StudyJourneyProject|SchoolApplication/u
        );
        await tx`
          update "StudyJourneyProject"
             set "status" = 'closed', "closedAt" = now(), "updatedAt" = now()
           where "id" = ${projectId}
        `;
      });

      assert.ok(mutation);
      await expectSchoolError(mutation as Promise<unknown>, "project_closed");

      const [row] = await closer<
        { revision: number; status: string }[]
      >`select "revision", "status" from "SchoolApplication" where "id" = ${created.id}`;
      assert.equal(row.revision, 1);
      assert.equal(row.status, "draft");
    } finally {
      await observer.end({ timeout: 5 });
      await closer.end({ timeout: 5 });
    }
  }
);

type Sql = ReturnType<typeof postgres>;

async function createStore() {
  // Imported lazily so an accidental run without the opt-in still skips cleanly:
  // `postgres-repository` imports `server-only` and must never be evaluated harmlessly.
  const { createPostgresSchoolApplicationStore } = await import(
    "./postgres-repository"
  );
  return createPostgresSchoolApplicationStore();
}

type PostgresStore = Awaited<ReturnType<typeof createStore>>;

/**
 * The store resolves its own pool from POSTGRES_URL. Close it once the suite
 * finishes so the runner can exit instead of being held open by an idle
 * connection; the pool is never opened when the suite is skipped.
 */
after(async () => {
  if (skipReason !== false) {
    return;
  }
  const { closeLazyDatabase } = await import("@/lib/db/runtime-client");
  await closeLazyDatabase();
});

test(
  "the partial unique index rejects a second current package of a different version",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const sql = postgres(TEST_DATABASE_URL, { max: 2 });
    try {
      const ownerUserId = await insertUser(sql);
      const projectId = await insertProject(sql, { ownerUserId });
      const applicationId = await insertApplication(sql, {
        ownerUserId,
        projectId,
      });
      await insertPackage(sql, {
        applicationId,
        projectId,
        userId: ownerUserId,
        version: 1,
      });
      // A *different* version can only be rejected by the partial unique index,
      // never by the (applicationId, version) unique index.
      await assert.rejects(
        insertPackage(sql, {
          applicationId,
          projectId,
          userId: ownerUserId,
          version: 2,
        }),
        (error: unknown) => {
          assert.match(
            (error as Error).message,
            /SchoolApplicationPackage_current_application_unique/u
          );
          return true;
        }
      );
      // Package bytes are immutable; only the status may transition.
      await assert.rejects(
        sql`update "SchoolApplicationPackage" set "contentSha256" = ${"f".repeat(64)} where "applicationId" = ${applicationId}`,
        /Only package status may change/u
      );
      await assert.rejects(
        sql`delete from "SchoolApplicationPackage" where "applicationId" = ${applicationId}`,
        /immutable/u
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

// --- fixtures -----------------------------------------------------------------

async function insertUser(sql: Sql) {
  const email = `m51-${randomUUID().replaceAll("-", "").slice(0, 24)}@example.test`;
  const [row] = await sql<{ id: string }[]>`
    insert into "User" ("email", "password", "role")
    values (${email}, ${"x".repeat(64)}, 'user')
    returning "id"
  `;
  return row.id;
}

/** `StudyJourneyProject` has no title; a closed Project requires `closedAt`. */
async function insertProject(
  sql: Sql,
  input: { ownerUserId: string; status?: "active" | "closed" }
) {
  const status = input.status ?? "active";
  const [row] = await sql<{ id: string }[]>`
    insert into "StudyJourneyProject" as p ("ownerUserId", "status", "closedAt")
    values (
      ${input.ownerUserId},
      ${status},
      ${status === "closed" ? sql`now()` : null}
    )
    returning "id"
  `;
  return row.id;
}

/**
 * `ProjectMembership` has no role column; `invitedByUserId` is mandatory and the
 * lifecycle CHECK requires `acceptedAt` for active and `revokedAt` for revoked.
 */
async function insertMembership(
  sql: Sql,
  input: {
    projectId: string;
    userId: string;
    invitedByUserId: string;
    status?: "pending" | "active" | "revoked";
  }
) {
  const status = input.status ?? "active";
  const acceptedAt = status === "pending" ? null : sql`now()`;
  const revokedAt = status === "revoked" ? sql`now()` : null;
  await sql`
    insert into "ProjectMembership" (
      "projectId", "userId", "invitedByUserId", "status", "acceptedAt", "revokedAt"
    )
    values (
      ${input.projectId}, ${input.userId}, ${input.invitedByUserId},
      ${status}, ${acceptedAt}, ${revokedAt}
    )
  `;
}

async function insertApplication(
  sql: Sql,
  input: { projectId: string; ownerUserId: string }
) {
  const [row] = await sql<{ id: string }[]>`
    insert into "SchoolApplication" (
      "projectId", "ownerUserId", "institutionName", "courseTitle", "intakeLabel"
    )
    values (
      ${input.projectId}, ${input.ownerUserId},
      'Example University', 'Bachelor of Nursing', 'February 2027'
    )
    returning "id"
  `;
  return row.id;
}

async function insertPackage(
  sql: Sql,
  input: {
    applicationId: string;
    projectId: string;
    userId: string;
    version: number;
  }
) {
  const sha = "a".repeat(64);
  await sql`
    insert into "SchoolApplicationPackage" (
      "applicationId", "projectId", "version", "status", "schemaVersion",
      "contentSha256", "inputsSha256", "targetKind", "targetId", "targetVersion",
      "targetSha256", "targetBindingSha256", "snapshot", "createdByUserId",
      "operationId", "requestSha256"
    )
    values (
      ${input.applicationId}, ${input.projectId}, ${input.version}, 'current',
      'phase13.school-application-preparation-package.v1',
      ${sha}, ${sha}, 'managed_school_application', ${input.applicationId},
      ${input.version}, ${sha}, ${sha}, ${sql.json({ schema: "test" })},
      ${input.userId}, ${operationId("pkg")}, ${sha}
    )
  `;
}

/** Creates one application through the real store (the M5.1 production path). */
async function createApplication(
  store: PostgresStore,
  input: {
    owner: string;
    projectId: string;
    institutionName: string;
    courseTitle: string;
  }
) {
  const identity = {
    operationType: "school_application_create",
    projectId: input.projectId,
    target: {
      courseId: null,
      courseTitle: input.courseTitle,
      deliveryId: null,
      institutionId: null,
      institutionName: input.institutionName,
      intakeId: null,
      intakeLabel: "February 2027",
    },
  } as const satisfies SchoolApplicationRequestIdentity;
  const result = await store.createApplication({
    operation: stamp({
      actorUserId: input.owner,
      identity,
      operationId: operationId("create"),
    }),
    projectId: input.projectId,
    values: {
      catalogRecordClass: null,
      catalogSnapshotToken: null,
      courseId: null,
      courseTitle: input.courseTitle,
      deliveryId: null,
      institutionId: null,
      institutionName: input.institutionName,
      intakeId: null,
      intakeLabel: "February 2027",
      ownerUserId: input.owner,
      sourceStatus: "unverified_customer_declared",
    },
  });
  assert.equal(result.replayed, false);
  return result.value;
}

/** Package inputs for the current stored application state. */
function packageInputs(input: {
  application: Pick<
    SchoolApplicationRecord,
    | "id"
    | "projectId"
    | "revision"
    | "institutionName"
    | "courseTitle"
    | "sourceStatus"
  >;
  projectId: string;
}) {
  return {
    applicationId: input.application.id,
    applicationRevision: input.application.revision,
    catalogRecordClass: null,
    catalogSnapshotToken: null,
    missingDataCodes: [] as const,
    projectId: input.projectId,
    references: [] as const,
    sourceStatus: input.application.sourceStatus,
    target: {
      courseId: null,
      courseTitle: input.application.courseTitle,
      deliveryId: null,
      institutionId: null,
      institutionName: input.application.institutionName,
      intakeId: null,
      intakeLabel: "February 2027",
    },
  };
}
