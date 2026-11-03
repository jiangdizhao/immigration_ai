// biome-ignore-all lint/style/noDoneCallback: the guarded skip is a declared skip, not a done-callback test.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: guarded disposable-database assertions stay in test scope.
// biome-ignore-all lint/suspicious/useAwait: the persistence port is asynchronous by contract.
/**
 * Phase 13 M6.1 - guarded PostgreSQL acceptance suite.
 *
 * M6_1_DATABASE_INTEGRATION_PENDING_OWNER_TEST_DB
 *
 * No authorized disposable M6.1 database exists yet, so this suite skips unless
 * every coordinate below is explicitly provided. A wrong coordinate is a failure,
 * never a fallback, and skipping is NOT a pass.
 *
 * Required environment (no fallback):
 *
 *   PHASE13_M6_1_DB_INTEGRATION=true
 *   PHASE13_M6_1_TEST_ENVIRONMENT_ID=phase13-m6-1-disposable
 *   PHASE13_M6_1_TEST_DATABASE_ROLE=<dedicated disposable role>
 *   PHASE13_M6_1_TEST_DATABASE_URL=postgres://<role>:…@127.0.0.1:<hostPort>/immigration_ai_phase13_m6_1_test
 *   PHASE13_M6_1_TEST_HOST_PORT=<host-published port, never 5432>
 *   PHASE13_M6_1_TEST_SERVER_PORT=<port PostgreSQL listens on inside its server>
 *   POSTGRES_URL=<the same URL>   # the store resolves its pool from POSTGRES_URL
 *   DATABASE_URL=<the same URL>   # assertion-side client identity
 *
 * Migration 0048 must already be applied to that database by the controlled
 * operator procedure; this suite never applies migrations and never writes to an
 * existing business database.
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import {
  closeStudent500SchemaClient,
  student500SchemaAvailable,
} from "@/lib/db/student-500-schema-availability";
import {
  normalizeStudent500Context,
  type Student500OperationType,
  student500RequestSha256,
} from "./contracts";
import { createDeclaredStudent500LegalSourceProvider } from "./legal-source-provider";
import { createPostgresStudent500Store } from "./postgres-repository";
import { createStudent500RequirementResolver } from "./requirement-resolver";
import { createStudent500Service } from "./service";

loadEnv({ path: resolve(".env.local"), override: false });

const EXPECTED_DATABASE = "immigration_ai_phase13_m6_1_test";
const EXPECTED_ENVIRONMENT_ID = "phase13-m6-1-disposable";
const FORBIDDEN_DATABASE = "immigration_legal";
const FORBIDDEN_ROLE = "rico_local";
const FORBIDDEN_PORT = "5432";
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1", "[::1]"];

const OPT_IN =
  process.env.PHASE13_M6_1_DB_INTEGRATION?.trim().toLowerCase() === "true";
const TEST_DATABASE_URL =
  process.env.PHASE13_M6_1_TEST_DATABASE_URL?.trim() ?? "";
const TEST_DATABASE_ROLE =
  process.env.PHASE13_M6_1_TEST_DATABASE_ROLE?.trim() ?? "";
const TEST_ENVIRONMENT_ID =
  process.env.PHASE13_M6_1_TEST_ENVIRONMENT_ID?.trim() ?? "";
const TEST_HOST_PORT = process.env.PHASE13_M6_1_TEST_HOST_PORT?.trim() ?? "";
const TEST_SERVER_PORT =
  process.env.PHASE13_M6_1_TEST_SERVER_PORT?.trim() ?? "";
const POSTGRES_URL = process.env.POSTGRES_URL?.trim() ?? "";
const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? "";

const skipReason = (() => {
  if (!OPT_IN) {
    return "M6_1_DATABASE_INTEGRATION_PENDING_OWNER_TEST_DB: PHASE13_M6_1_DB_INTEGRATION is not enabled";
  }
  if (!TEST_DATABASE_URL) {
    return "PHASE13_M6_1_TEST_DATABASE_URL is not configured (disposable database required)";
  }
  if (!TEST_DATABASE_ROLE) {
    return "PHASE13_M6_1_TEST_DATABASE_ROLE is not configured (disposable role required)";
  }
  if (!TEST_ENVIRONMENT_ID) {
    return "PHASE13_M6_1_TEST_ENVIRONMENT_ID is not configured (environment identity required)";
  }
  if (!TEST_HOST_PORT || !TEST_SERVER_PORT) {
    return "PHASE13_M6_1_TEST_HOST_PORT / _SERVER_PORT are not configured";
  }
  if (
    POSTGRES_URL !== TEST_DATABASE_URL ||
    DATABASE_URL !== TEST_DATABASE_URL
  ) {
    return "POSTGRES_URL and DATABASE_URL must both equal the disposable URL";
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
    LOOPBACK_HOSTS.includes(url.hostname),
    `the disposable target must be loopback, got ${url.hostname}`
  );
  assert.equal(
    url.port,
    TEST_HOST_PORT,
    "URL port must match the declared host port"
  );
  assert.notEqual(
    url.port,
    FORBIDDEN_PORT,
    "the authoritative port is forbidden"
  );
  assert.equal(
    TEST_ENVIRONMENT_ID,
    EXPECTED_ENVIRONMENT_ID,
    "environment identity must be the explicit disposable marker"
  );
  assert.equal(
    decodeURIComponent(url.username),
    TEST_DATABASE_ROLE,
    "role must match the declared disposable role"
  );
  assert.notEqual(
    url.username,
    FORBIDDEN_ROLE,
    "the authoritative role is forbidden"
  );
  assert.equal(
    url.pathname.replace(/^\//u, ""),
    EXPECTED_DATABASE,
    "database must be the disposable M6.1 database"
  );
  assert.notEqual(
    url.pathname.replace(/^\//u, ""),
    FORBIDDEN_DATABASE,
    "the authoritative corpus database is forbidden"
  );
}

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

if (skipReason) {
  test(`M6_1_DATABASE_INTEGRATION_PENDING_OWNER_TEST_DB: ${skipReason}`, async (context) => {
    context.skip(skipReason);
  });
} else {
  assertDisposableTarget();

  const OWNER = "11111111-1111-4111-8111-111111111101";
  /** Project of the persistence/replay/archive/closure test (closed at its end). */
  const PROJECT = "22222222-2222-4222-8222-222222222201";
  /** Unrelated Project used to prove cross-Project isolation. */
  const OTHER_PROJECT = "22222222-2222-4222-8222-222222222202";
  /**
   * Independent Project for the create-order/idempotency test.
   *
   * It must not share `PROJECT`: that Project is closed by the previous test (a
   * deliberate Project-closed assertion) and already owns one application and one
   * event, which would make this test's assertions depend on execution order.
   */
  const ORDERED_PROJECT = "22222222-2222-4222-8222-222222222203";
  const OTHER_OWNER = "11111111-1111-4111-8111-111111111102";

  function sleep(ms: number) {
    return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
  }

  function operation(
    operationId: string,
    operationType: Student500OperationType,
    requestSha256: string
  ) {
    return { actorUserId: OWNER, operationId, operationType, requestSha256 };
  }

  /**
   * Seeds only the rows the calling test needs. Every test owns its Project, so
   * no test inherits another test's closure/archival state.
   */
  async function seedProject(
    sql: ReturnType<typeof postgres>,
    projectId: string,
    ownerUserId: string
  ): Promise<void> {
    await sql`INSERT INTO "User" (id, email, role) VALUES (${ownerUserId}, ${`${ownerUserId}@disposable.invalid`}, 'user') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO "StudyJourneyProject" (id, "ownerUserId") VALUES (${projectId}, ${ownerUserId}) ON CONFLICT DO NOTHING`;
  }

  async function withClient<T>(
    run: (sql: ReturnType<typeof postgres>) => Promise<T>
  ): Promise<T> {
    const client = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      return await run(client);
    } finally {
      await client.end({ timeout: 5 });
    }
  }

  test("the M6.1 schema probe reports the applied disposable schema", async () => {
    try {
      assert.equal(
        await student500SchemaAvailable(),
        true,
        "migration 0048 must be applied to the disposable database before this suite runs"
      );
    } finally {
      await closeStudent500SchemaClient();
    }
  });

  test("the real store persists, replays and isolates Student 500 records", async () => {
    await withClient(async (sql) => {
      await seedProject(sql, PROJECT, OWNER);
      await seedProject(sql, OTHER_PROJECT, OTHER_OWNER);
    });

    const store = createPostgresStudent500Store();
    const service = createStudent500Service({
      resolver: createStudent500RequirementResolver({
        provider: createDeclaredStudent500LegalSourceProvider(),
      }),
      store,
    });

    const context = normalizeStudent500Context({
      applicationPlace: "offsore".replace("offsore", "offshore"),
      asOfDate: "2026-11-03",
      coeStatus: "reported_not_held",
      entryRoute: "offer_only",
    });
    const digest = student500RequestSha256({
      context,
      operationType: "student_500_create",
      projectId: PROJECT,
    });

    const created = await store.createApplication({
      operation: operation("m6-1-int-create", "student_500_create", digest),
      projectId: PROJECT,
      values: { applicantUserId: OWNER, context, ownerUserId: OWNER },
    });
    assert.equal(created.replayed, false);
    assert.equal(created.value.revision, 1);

    const replay = await store.createApplication({
      operation: operation("m6-1-int-create", "student_500_create", digest),
      projectId: PROJECT,
      values: { applicantUserId: OWNER, context, ownerUserId: OWNER },
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.value.id, created.value.id);

    // A different request under the same operation id is a conflict.
    await assert.rejects(
      () =>
        store.createApplication({
          operation: operation(
            "m6-1-int-create",
            "student_500_create",
            "0".repeat(64)
          ),
          projectId: PROJECT,
          values: { applicantUserId: OWNER, context, ownerUserId: OWNER },
        }),
      /idempotency_conflict/u
    );

    // CAS: the stored revision must match.
    await assert.rejects(
      () =>
        store.updateApplication({
          applicationId: created.value.id,
          expectedRevision: 99,
          operation: operation(
            "m6-1-int-update-stale",
            "student_500_update",
            "1".repeat(64)
          ),
          ownerUserId: OWNER,
          projectId: PROJECT,
          values: { applicantUserId: OWNER, context, ownerUserId: OWNER },
        }),
      /revision_conflict/u
    );

    // Another Project can never read the record.
    assert.equal(
      await store.getApplication({
        applicationId: created.value.id,
        ownerUserId: OWNER,
        projectId: OTHER_PROJECT,
      }),
      null
    );

    // The service composes the persisted record into a screening view.
    const detail = await service.get({
      actorUserId: OWNER,
      applicationId: created.value.id,
      projectId: PROJECT,
    });
    assert.equal(detail.screening.submissionStatus, "not_submission_ready");
    assert.equal(detail.events.length, 1);

    // Archiving is terminal and its exact retry replays.
    const archived = await store.archiveApplication({
      applicationId: created.value.id,
      expectedRevision: 1,
      operation: operation(
        "m6-1-int-archive",
        "student_500_archive",
        "2".repeat(64)
      ),
      ownerUserId: OWNER,
      projectId: PROJECT,
    });
    assert.equal(archived.value.status, "archived");
    const archiveReplay = await store.archiveApplication({
      applicationId: created.value.id,
      expectedRevision: 1,
      operation: operation(
        "m6-1-int-archive",
        "student_500_archive",
        "2".repeat(64)
      ),
      ownerUserId: OWNER,
      projectId: PROJECT,
    });
    assert.equal(archiveReplay.replayed, true);

    // Closing the Project blocks further writes once the store re-checks it.
    await withClient(async (sql) => {
      await sql`UPDATE "StudyJourneyProject" SET status = 'closed', "closedAt" = now() WHERE id = ${PROJECT}`;
    });
    await sleep(10);
    await assert.rejects(
      () =>
        store.createApplication({
          operation: operation(
            "m6-1-int-closed",
            "student_500_create",
            "3".repeat(64)
          ),
          projectId: PROJECT,
          values: { applicantUserId: OWNER, context, ownerUserId: OWNER },
        }),
      /project_closed/u
    );
  });
  test("create is ordered, idempotent and leaves no orphan rows", async () => {
    // Own Project, seeded here: the previous test closes its Project and already
    // owns applications, so reusing it would make this test order-dependent.
    await withClient(async (sql) => {
      await seedProject(sql, ORDERED_PROJECT, OWNER);
    });
    const store = createPostgresStudent500Store();
    const context = normalizeStudent500Context({
      applicationPlace: "offshore",
      asOfDate: "2026-11-03",
      coeStatus: "reported_not_held",
      entryRoute: "offer_only",
    });
    const values = { applicantUserId: OWNER, context, ownerUserId: OWNER };
    const digest = student500RequestSha256({
      context,
      operationType: "student_500_create",
      projectId: ORDERED_PROJECT,
    });

    // 1. First creation: the application row must exist before the operation row
    //    (the composite FK is immediate), so a successful insert proves the order.
    const created = await store.createApplication({
      operation: operation("m6-1-r1-create", "student_500_create", digest),
      projectId: ORDERED_PROJECT,
      values,
    });
    assert.equal(created.replayed, false);

    // 2. Exact replay resolves the persisted result id, not a generated one.
    const replay = await store.createApplication({
      operation: operation("m6-1-r1-create", "student_500_create", digest),
      projectId: ORDERED_PROJECT,
      values,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.value.id, created.value.id);

    // 3. A changed payload under the same operation id is a conflict.
    const changed = normalizeStudent500Context({
      applicationPlace: "onshore",
      asOfDate: "2026-11-03",
      coeStatus: "reported_not_held",
      currentVisaSubclass: "500",
      entryRoute: "offer_only",
    });
    await assert.rejects(
      () =>
        store.createApplication({
          operation: operation(
            "m6-1-r1-create",
            "student_500_create",
            student500RequestSha256({
              context: changed,
              operationType: "student_500_create",
              projectId: ORDERED_PROJECT,
            })
          ),
          projectId: ORDERED_PROJECT,
          values: { ...values, context: changed },
        }),
      /idempotency_conflict/u
    );

    // 4. Concurrent identical creates converge on a single application.
    const concurrent = await Promise.all([
      store.createApplication({
        operation: operation(
          "m6-1-r1-concurrent",
          "student_500_create",
          digest
        ),
        projectId: ORDERED_PROJECT,
        values,
      }),
      store.createApplication({
        operation: operation(
          "m6-1-r1-concurrent",
          "student_500_create",
          digest
        ),
        projectId: ORDERED_PROJECT,
        values,
      }),
    ]);
    assert.equal(
      new Set(concurrent.map((result) => result.value.id)).size,
      1,
      "both callers must observe the same application"
    );

    // 5. No orphan rows: every operation resolves to an existing application, and
    //    the counts agree with the two successful application writes above.
    await withClient(async (sql) => {
      const [orphans] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM "Student500ApplicationOperation" o
        LEFT JOIN "Student500Application" a
          ON a."projectId" = o."projectId" AND a."id" = o."resultId"
        WHERE a."id" IS NULL
      `;
      assert.equal(
        orphans?.count,
        "0",
        "operation rows must never be orphaned"
      );
      const [applications] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM "Student500Application"
        WHERE "projectId" = ${ORDERED_PROJECT} AND "ownerUserId" = ${OWNER}
      `;
      assert.equal(applications?.count, "2");
      const [events] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM "Student500ApplicationEvent"
        WHERE "projectId" = ${ORDERED_PROJECT}
      `;
      assert.equal(events?.count, "2", "one created event per application");
    });
  });
}
