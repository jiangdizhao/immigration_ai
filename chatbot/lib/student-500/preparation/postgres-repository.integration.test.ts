// biome-ignore-all lint/suspicious/noMisplacedAssertion: guarded disposable-database assertions stay in test scope.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import {
  normalizeStudent500Context,
  student500RequestSha256,
} from "../contracts";
import { createDeclaredStudent500LegalSourceProvider } from "../legal-source-provider";
import { createPostgresStudent500Store } from "../postgres-repository";
import { createStudent500RequirementResolver } from "../requirement-resolver";
import { createPostgresPreparationStore } from "./postgres-repository";
import { createStudent500PreparationService } from "./service";

loadEnv({ path: resolve(".env.local"), override: false });

/**
 * Phase 13 M6.2 - guarded real-PostgreSQL preparation suite.
 *
 * M6_2_DATABASE_INTEGRATION_PENDING_OWNER_AUTHORIZATION
 *
 * The owner authorization for the M6.1 disposable database does not extend to a
 * new M6.2 environment, so this suite skips unless every disposable coordinate is
 * explicitly provided. A skipped suite is NOT a pass, and it never runs against an
 * existing business database.
 *
 * Required environment (no fallback):
 *   PHASE13_M6_2_DB_INTEGRATION=true
 *   PHASE13_M6_2_TEST_ENVIRONMENT_ID=phase13-m6-2-disposable
 *   PHASE13_M6_2_TEST_DATABASE_ROLE=<dedicated disposable role>
 *   PHASE13_M6_2_TEST_DATABASE_URL=postgres://role:...@127.0.0.1:<port>/immigration_ai_phase13_m6_2_test
 *   PHASE13_M6_2_TEST_HOST_PORT=<host port, never 5432>
 *   PHASE13_M6_2_TEST_SERVER_PORT=<server port>
 *   POSTGRES_URL=<the same URL>
 *   DATABASE_URL=<the same URL>
 */

const EXPECTED_DATABASE = "immigration_ai_phase13_m6_2_test";
const EXPECTED_ENVIRONMENT_ID = "phase13-m6-2-disposable";
const FORBIDDEN_DATABASE = "immigration_legal";
const FORBIDDEN_ROLE = "rico_local";
const FORBIDDEN_PORT = "5432";
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1", "[::1]"];

const OPT_IN =
  process.env.PHASE13_M6_2_DB_INTEGRATION?.trim().toLowerCase() === "true";
const URL_VALUE = process.env.PHASE13_M6_2_TEST_DATABASE_URL?.trim() ?? "";
const ROLE = process.env.PHASE13_M6_2_TEST_DATABASE_ROLE?.trim() ?? "";
const ENVIRONMENT_ID =
  process.env.PHASE13_M6_2_TEST_ENVIRONMENT_ID?.trim() ?? "";
const HOST_PORT = process.env.PHASE13_M6_2_TEST_HOST_PORT?.trim() ?? "";
const SERVER_PORT = process.env.PHASE13_M6_2_TEST_SERVER_PORT?.trim() ?? "";
const POSTGRES_URL = process.env.POSTGRES_URL?.trim() ?? "";
const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? "";

const skipReason = (() => {
  if (!OPT_IN) {
    return "M6_2_DATABASE_INTEGRATION_PENDING_OWNER_AUTHORIZATION";
  }
  if (!(URL_VALUE && ROLE && ENVIRONMENT_ID && HOST_PORT && SERVER_PORT)) {
    return "M6.2 disposable database coordinates are incomplete";
  }
  if (POSTGRES_URL !== URL_VALUE || DATABASE_URL !== URL_VALUE) {
    return "POSTGRES_URL and DATABASE_URL must both equal the disposable URL";
  }
  const url = new URL(URL_VALUE);
  if (!LOOPBACK_HOSTS.includes(url.hostname)) {
    return "the disposable target must be loopback";
  }
  if (url.port === FORBIDDEN_PORT || HOST_PORT === FORBIDDEN_PORT) {
    return "the authoritative port is forbidden";
  }
  if (ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT_ID) {
    return "environment identity must be the explicit disposable marker";
  }
  if (url.pathname.replace(/^\//u, "") !== EXPECTED_DATABASE) {
    return "database must be the disposable M6.2 database";
  }
  if (url.pathname.replace(/^\//u, "") === FORBIDDEN_DATABASE) {
    return "the authoritative corpus database is forbidden";
  }
  if (url.username === FORBIDDEN_ROLE || ROLE === FORBIDDEN_ROLE) {
    return "the authoritative role is forbidden";
  }
  return false as const;
})();

/** The store resolves its pool from POSTGRES_URL; close it so the runner exits. */
after(async () => {
  if (skipReason !== false) {
    return;
  }
  const { closeLazyDatabase } = await import("@/lib/db/runtime-client");
  await closeLazyDatabase();
});

if (skipReason) {
  test(`M6_2_DATABASE_INTEGRATION_PENDING_OWNER_AUTHORIZATION: ${skipReason}`, async (context) => {
    context.skip(skipReason);
  });
} else {
  const OWNER = "11111111-1111-4111-8111-111111111301";
  const PROJECT = "22222222-2222-4222-8222-222222222401";
  const ORDERED_PROJECT = "22222222-2222-4222-8222-222222222402";

  async function withClient<T>(
    run: (sql: ReturnType<typeof postgres>) => Promise<T>
  ): Promise<T> {
    const client = postgres(URL_VALUE, { max: 1 });
    try {
      return await run(client);
    } finally {
      await client.end({ timeout: 5 });
    }
  }

  async function seedProject(
    sql: ReturnType<typeof postgres>,
    projectId: string,
    owner: string
  ) {
    await sql`INSERT INTO "User" (id, email, role) VALUES (${owner}, ${`${owner}@disposable.invalid`}, 'user') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO "StudyJourneyProject" (id, "ownerUserId") VALUES (${projectId}, ${owner}) ON CONFLICT DO NOTHING`;
  }

  function buildService() {
    const applications = createPostgresStudent500Store();
    const resolver = createStudent500RequirementResolver({
      provider: createDeclaredStudent500LegalSourceProvider(),
    });
    return createStudent500PreparationService({
      applications,
      facts: {
        list: () =>
          Promise.resolve({ facts: [], status: "available" as const }),
      },
      screen: async (input) => {
        const application = await applications.getApplication({
          applicationId: input.applicationId,
          ownerUserId: input.actorUserId,
          projectId: input.projectId,
        });
        if (!application) {
          throw new Error("application_not_found");
        }
        return resolver.resolve({
          context: application.context,
          linkedSchoolApplication: null,
        });
      },
      store: createPostgresPreparationStore(),
    });
  }

  async function seedApplication(projectId: string, suffix: string) {
    const applications = createPostgresStudent500Store();
    const context = normalizeStudent500Context({
      applicationPlace: "offshore",
      asOfDate: "2026-11-03",
      coeStatus: "reported_not_held",
      entryRoute: "offer_only",
    });
    const result = await applications.createApplication({
      operation: {
        actorUserId: OWNER,
        operationId: `m6-2-seed-${suffix}`,
        operationType: "student_500_create",
        requestSha256: student500RequestSha256({
          context,
          operationType: "student_500_create",
          projectId,
        }),
      },
      projectId,
      values: { applicantUserId: OWNER, context, ownerUserId: OWNER },
    });
    return result.value;
  }

  test("the M6.2 schema probe reports the applied disposable schema", async () => {
    const {
      closeStudent500PreparationSchemaClient,
      student500PreparationSchemaAvailable,
    } = await import("@/lib/db/student-500-preparation-schema-availability");
    try {
      assert.equal(await student500PreparationSchemaAvailable(), true);
    } finally {
      await closeStudent500PreparationSchemaClient();
    }
  });

  test("drafts, snapshots and fact selections persist with real versioning", async () => {
    await withClient(async (sql) => {
      await seedProject(sql, PROJECT, OWNER);
      await seedProject(sql, ORDERED_PROJECT, OWNER);
    });
    const service = buildService();
    const application = await seedApplication(PROJECT, "persist");

    const draft = await service.createDraft({
      actorUserId: OWNER,
      applicationId: application.id,
      operationId: "m6-2-create-draft",
      projectId: PROJECT,
    });
    assert.equal(draft.draft.version, 1);
    const replay = await service.createDraft({
      actorUserId: OWNER,
      applicationId: application.id,
      operationId: "m6-2-create-draft",
      projectId: PROJECT,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.draft.id, draft.draft.id);

    const edited = await service.saveDraft({
      actorUserId: OWNER,
      applicationId: application.id,
      baseDraftId: draft.draft.id,
      edits: [{ sectionKey: "future_plans", text: "A real edit." }],
      operationId: "m6-2-save-draft",
      projectId: PROJECT,
    });
    assert.equal(edited.draft.version, 2);
    // Concurrent edit based on the superseded version is rejected by the CAS path.
    await assert.rejects(
      () =>
        service.saveDraft({
          actorUserId: OWNER,
          applicationId: application.id,
          baseDraftId: draft.draft.id,
          edits: [{ sectionKey: "future_plans", text: "A stale edit." }],
          operationId: "m6-2-save-draft-stale",
          projectId: PROJECT,
        }),
      /version_conflict/u
    );

    await service.setSchoolContext({
      actorUserId: OWNER,
      admissionCaseId: null,
      applicationId: application.id,
      expectedRevision: null,
      kind: "customer_reported_coe",
      operationId: "m6-2-school",
      projectId: PROJECT,
      schoolApplicationId: null,
    });
    await assert.rejects(
      () =>
        service.setSchoolContext({
          actorUserId: OWNER,
          admissionCaseId: null,
          applicationId: application.id,
          expectedRevision: 7,
          kind: "none",
          operationId: "m6-2-school-stale",
          projectId: PROJECT,
          schoolApplicationId: null,
        }),
      /revision_conflict/u
    );

    const snapshot = await service.createSnapshot({
      actorUserId: OWNER,
      applicationId: application.id,
      operationId: "m6-2-snapshot",
      projectId: PROJECT,
    });
    assert.equal(snapshot.snapshot.version, 1);

    await withClient(async (sql) => {
      const [orphans] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM "Student500ApplicationOperation" o
        WHERE o."resultId" NOT IN (SELECT "id" FROM "Student500GsDraft")
          AND o."resultId" NOT IN (SELECT "id" FROM "Student500PreparationSnapshot")
          AND o."resultId" NOT IN (SELECT "id" FROM "Student500FactReference")
          AND o."resultId" NOT IN (SELECT "id" FROM "Student500SchoolContext")
          AND o."resultId" NOT IN (SELECT "id" FROM "Student500Application")
      `;
      assert.equal(orphans?.count, "0");
      const [versions] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM "Student500GsDraft" WHERE "applicationId" = ${application.id}
      `;
      assert.equal(versions?.count, "2");
    });
  });

  test("a revoked reference can be selected again and history is preserved", async () => {
    const application = await seedApplication(PROJECT, "reselect");
    const factId = "55555555-5555-4555-8555-5555555555f1";
    const first = await withClient(async (sql) => {
      // Seed one authorized fact reference directly, then revoke it through the
      // service so the partial unique index is exercised against real SQL.
      const [user] = await sql<
        { id: string }[]
      >`SELECT "id" FROM "User" WHERE "id" = ${OWNER}`;
      return user;
    });
    const selected = await withClient(async (sql) => {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO "Student500FactReference" ("projectId","applicationId","factAssertionId","factVersion","factKey","originKind","stateAtUse","aiUseAuthorizedAtSelection","authorizationAudience","createdByUserId")
        VALUES (${PROJECT}, ${application.id}, ${factId}, 1, 'study.course_name', 'customer_stated', 'customer_confirmed', true, 'project', ${OWNER})
        RETURNING "id"
      `;
      return row?.id ?? "";
    });
    assert.ok(selected);
    const revoked = await withClient(async (sql) => {
      const [row] = await sql<{ id: string }[]>`
        UPDATE "Student500FactReference" SET "revokedAt" = now() WHERE "id" = ${selected} RETURNING "id"
      `;
      return row?.id ?? "";
    });
    assert.equal(revoked, selected);
    // A second ACTIVE reference for the same assertion/version is now allowed.
    const reselected = await withClient(async (sql) => {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO "Student500FactReference" ("projectId","applicationId","factAssertionId","factVersion","factKey","originKind","stateAtUse","aiUseAuthorizedAtSelection","authorizationAudience","createdByUserId")
        VALUES (${PROJECT}, ${application.id}, ${factId}, 1, 'study.course_name', 'customer_stated', 'customer_confirmed', true, 'project', ${OWNER})
        RETURNING "id"
      `;
      return row?.id ?? "";
    });
    assert.notEqual(reselected, selected);
    // A duplicate ACTIVE reference is still rejected by the partial index.
    await assert.rejects(
      () =>
        withClient(async (sql) => {
          await sql`
            INSERT INTO "Student500FactReference" ("projectId","applicationId","factAssertionId","factVersion","factKey","originKind","stateAtUse","aiUseAuthorizedAtSelection","authorizationAudience","createdByUserId")
            VALUES (${PROJECT}, ${application.id}, ${factId}, 1, 'study.course_name', 'customer_stated', 'customer_confirmed', true, 'project', ${OWNER})
          `;
        }),
      /duplicate key|unique/u
    );
    // Both rows survive: history is immutable, exactly one is active.
    const counts = await withClient(async (sql) => {
      const [row] = await sql<{ total: string; active: string }[]>`
        SELECT count(*)::text AS total, count(*) FILTER (WHERE "revokedAt" IS NULL)::text AS active
        FROM "Student500FactReference" WHERE "applicationId" = ${application.id}
      `;
      return row;
    });
    assert.equal(counts?.total, "2");
    assert.equal(counts?.active, "1");
  });

  test("school-context kinds satisfy the 0049 coherence check", async () => {
    const service = buildService();
    const application = await seedApplication(ORDERED_PROJECT, "kinds");
    await withClient(async (sql) => {
      await sql`UPDATE "StudyJourneyProject" SET status = 'active', "closedAt" = NULL WHERE id = ${ORDERED_PROJECT}`;
    });
    const reported = await service.setSchoolContext({
      actorUserId: OWNER,
      admissionCaseId: null,
      applicationId: application.id,
      expectedRevision: null,
      kind: "customer_reported_coe",
      operationId: "m6-2-r1-coe",
      projectId: ORDERED_PROJECT,
      schoolApplicationId: null,
    });
    assert.equal(
      reported.schoolContext.admissionOutcomeProvenance,
      "customer_reported"
    );
    assert.equal(reported.schoolContext.admissionOutcomeVerified, false);
    const none = await service.setSchoolContext({
      actorUserId: OWNER,
      admissionCaseId: null,
      applicationId: application.id,
      expectedRevision: reported.schoolContext.revision,
      kind: "none",
      operationId: "m6-2-r1-none",
      projectId: ORDERED_PROJECT,
      schoolApplicationId: null,
    });
    assert.equal(none.schoolContext.kind, "none");
  });

  test("partially NULL outcome bundles violate the coherence CHECK", async () => {
    const service = buildService();
    const application = await seedApplication(ORDERED_PROJECT, "nulls");
    await withClient(async (sql) => {
      await sql`UPDATE "StudyJourneyProject" SET status = 'active', "closedAt" = NULL WHERE id = ${ORDERED_PROJECT}`;
    });
    await service.setSchoolContext({
      actorUserId: OWNER,
      admissionCaseId: null,
      applicationId: application.id,
      expectedRevision: null,
      kind: "customer_reported_coe",
      operationId: "m6-2-null-base",
      projectId: ORDERED_PROJECT,
      schoolApplicationId: null,
    });
    const [contextRow] = await withClient(async (sql) => {
      return await sql<{ id: string }[]>`
        SELECT "id" FROM "Student500SchoolContext"
        WHERE "applicationId" = ${application.id} AND "kind" = 'customer_reported_coe'
      `;
    });
    assert.ok(contextRow?.id);
    // Each partial bundle must be rejected: SQL UNKNOWN may not satisfy the CHECK.
    // The update also advances the revision by exactly one and refreshes
    // "updatedAt", so the *only* violated rule is the outcome coherence constraint
    // (otherwise the revision guard would reject first and prove nothing).
    const partialBundles = [
      {
        id: "null kind",
        kind: null,
        provenance: "customer_reported",
        verified: false,
        version: 1,
      },
      {
        id: "null provenance",
        kind: "coe",
        provenance: null,
        verified: false,
        version: 1,
      },
      {
        id: "null verified",
        kind: "coe",
        provenance: "customer_reported",
        verified: null,
        version: 1,
      },
      {
        id: "null version",
        kind: "coe",
        provenance: "customer_reported",
        verified: false,
        version: null,
      },
      {
        id: "verified report",
        kind: "coe",
        provenance: "customer_reported",
        verified: true,
        version: 1,
      },
    ];
    const expectCoherenceViolation = async (
      statement: (sql: ReturnType<typeof postgres>) => Promise<unknown>,
      label: string
    ) => {
      await assert.rejects(
        () => withClient(statement),
        (error: unknown) => {
          const pgError = error as {
            code?: string;
            constraint?: string;
            constraint_name?: string;
            message?: string;
          };
          const detail = `${label}: expected SQLSTATE 23514 raised by the outcome coherence CHECK; got code=${pgError.code ?? "?"} constraint=${pgError.constraint_name ?? pgError.constraint ?? "?"} message=${pgError.message ?? "?"}`;
          assert.equal(pgError.code, "23514", detail);
          // The named constraint is asserted from the server message, which is the
          // only place PostgreSQL identifies the violated CHECK for every driver.
          assert.match(
            pgError.message ?? "",
            /outcome_coherence_check/u,
            detail
          );
          return true;
        }
      );
    };
    for (const bundle of partialBundles) {
      await expectCoherenceViolation(
        (sql) => sql`
          UPDATE "Student500SchoolContext"
          SET "admissionOutcomeKind" = ${bundle.kind},
              "admissionOutcomeProvenance" = ${bundle.provenance},
              "admissionOutcomeVerified" = ${bundle.verified},
              "admissionOutcomeVersion" = ${bundle.version},
              "revision" = "revision" + 1,
              "updatedAt" = now()
          WHERE "id" = ${contextRow?.id}
        `,
        bundle.id
      );
    }
    // A control update proves the same statement shape succeeds when only the
    // outcome bundle is changed legitimately, so the rejection above is specific.
    await withClient(async (sql) => {
      await sql`
        UPDATE "Student500SchoolContext"
        SET "revision" = "revision" + 1, "updatedAt" = now()
        WHERE "id" = ${contextRow?.id}
      `;
    });
    const [after] = await withClient(async (sql) => {
      return await sql<
        { provenance: string | null; verified: boolean | null }[]
      >`
        SELECT "admissionOutcomeVerified" AS verified, "admissionOutcomeProvenance" AS provenance
        FROM "Student500SchoolContext" WHERE "id" = ${contextRow?.id}
      `;
    });
    assert.equal(after?.verified, false);
    assert.equal(after?.provenance, "customer_reported");
  });

  test("archived applications and closed Projects reject M6.2 writes", async () => {
    const service = buildService();
    const application = await seedApplication(ORDERED_PROJECT, "closed");
    await withClient(async (sql) => {
      await sql`UPDATE "StudyJourneyProject" SET status = 'closed', "closedAt" = now() WHERE id = ${ORDERED_PROJECT}`;
    });
    await assert.rejects(
      () =>
        service.createDraft({
          actorUserId: OWNER,
          applicationId: application.id,
          operationId: "m6-2-closed-draft",
          projectId: ORDERED_PROJECT,
        }),
      /project_closed/u
    );
  });
}
