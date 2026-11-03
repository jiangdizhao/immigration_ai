/**
 * Phase 13 M6.3 - real PostgreSQL acceptance (M6.3 disposable environment).
 *
 * Distinct from the retired M6.1/M6.2 guards: this suite refuses to run unless every
 * M6.3 coordinate is explicitly supplied, and it can only ever target the M6.3
 * disposable database on the M6.3 loopback port. It reuses the production M6.1 and
 * M6.2 services and PostgreSQL repositories - no business logic is duplicated here.
 *
 * Required environment (no fallback, no business database):
 *   PHASE13_M6_3_DB_INTEGRATION=true
 *   PHASE13_M6_3_TEST_ENVIRONMENT_ID=phase13-m6-3-disposable
 *   PHASE13_M6_3_TEST_DATABASE_ROLE=m6_3_test_owner
 *   PHASE13_M6_3_TEST_HOST_PORT=55452
 *   PHASE13_M6_3_TEST_SERVER_PORT=5432
 *   PHASE13_M6_3_TEST_DATABASE_URL=postgres://m6_3_test_owner:...@127.0.0.1:55452/immigration_ai_phase13_m6_3_test
 *   POSTGRES_URL / DATABASE_URL=<the same URL>
 *
 * A skipped run is NOT a pass: the acceptance runner additionally rejects any
 * result whose summary reports skipped tests or fewer than M6_3_MIN_PASS passes.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import postgres from "postgres";
import {
  normalizeStudent500Context,
  student500RequestSha256,
} from "../contracts";
import { createDeclaredStudent500LegalSourceProvider } from "../legal-source-provider";
import { createPostgresStudent500Store } from "../postgres-repository";
import { createStudent500RequirementResolver } from "../requirement-resolver";
import { createPostgresPreparationStore } from "./postgres-repository";
import {
  createStudent500PreparationService,
  type Student500PreparationServiceOptions,
} from "./service";

const EXPECTED_DATABASE = "immigration_ai_phase13_m6_3_test";
const EXPECTED_ENVIRONMENT_ID = "phase13-m6-3-disposable";
const EXPECTED_ROLE = "m6_3_test_owner";
const EXPECTED_HOST_PORT = "55452";
const EXPECTED_SERVER_PORT = "5432";
const FORBIDDEN_DATABASES = new Set([
  "chatbot",
  "immigration_legal",
  "postgres",
  "immigration_ai_phase13_m6_2_test",
]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const OPT_IN =
  process.env.PHASE13_M6_3_DB_INTEGRATION?.trim().toLowerCase() === "true";
const URL_VALUE = process.env.PHASE13_M6_3_TEST_DATABASE_URL?.trim() ?? "";
const ROLE = process.env.PHASE13_M6_3_TEST_DATABASE_ROLE?.trim() ?? "";
const ENVIRONMENT_ID =
  process.env.PHASE13_M6_3_TEST_ENVIRONMENT_ID?.trim() ?? "";
const HOST_PORT = process.env.PHASE13_M6_3_TEST_HOST_PORT?.trim() ?? "";
const SERVER_PORT = process.env.PHASE13_M6_3_TEST_SERVER_PORT?.trim() ?? "";
const POSTGRES_URL_VALUE = process.env.POSTGRES_URL?.trim() ?? "";
const DATABASE_URL_VALUE = process.env.DATABASE_URL?.trim() ?? "";

const skipReason = ((): string | null => {
  if (!OPT_IN) {
    return "M6_3_DATABASE_ACCEPTANCE_PENDING_OWNER_AUTHORIZATION";
  }
  if (!(URL_VALUE && ROLE && ENVIRONMENT_ID && HOST_PORT && SERVER_PORT)) {
    return "M6.3 disposable database coordinates are incomplete";
  }
  if (ROLE !== EXPECTED_ROLE) {
    return "the M6.3 test role must be the dedicated disposable role";
  }
  if (POSTGRES_URL_VALUE !== URL_VALUE || DATABASE_URL_VALUE !== URL_VALUE) {
    return "POSTGRES_URL and DATABASE_URL must both equal the disposable URL";
  }
  if (ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT_ID) {
    return "environment identity must be the explicit M6.3 disposable marker";
  }
  if (
    HOST_PORT !== EXPECTED_HOST_PORT ||
    SERVER_PORT !== EXPECTED_SERVER_PORT
  ) {
    return "the M6.3 disposable ports are fixed";
  }
  let parsed: URL;
  try {
    parsed = new URL(URL_VALUE);
  } catch {
    return "the disposable URL is not parseable";
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    return "the disposable target must be loopback";
  }
  if (parsed.port !== EXPECTED_HOST_PORT) {
    return "the disposable URL port must be the M6.3 host port";
  }
  const database = parsed.pathname.replace(/^\//u, "");
  if (database !== EXPECTED_DATABASE) {
    return "database must be the M6.3 disposable database";
  }
  if (FORBIDDEN_DATABASES.has(database)) {
    return "the target must never be an existing business database";
  }
  return null;
})();

if (skipReason) {
  // Explicitly skipped while owner authorization is pending. The acceptance
  // runner rejects any summary with a non-zero skip count, so this can never
  // masquerade as a passing real-PostgreSQL result.
  // biome-ignore lint/suspicious/noSkippedTests: authorization-pending guard only
  test.skip(`M6_3_DB_ACCEPTANCE_PENDING_OWNER_AUTHORIZATION: ${skipReason}`, () => {
    // never executed while authorization is pending
  });
} else {
  const OWNER = "11111111-1111-4111-8111-111111111401";
  const OTHER = "11111111-1111-4111-8111-111111111402";
  const PROJECT = "22222222-2222-4222-8222-222222222501";
  const FACT_ID = "55555555-5555-4555-8555-555555555501";

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

  after(async () => {
    const { closeLazyDatabase } = await import("@/lib/db/runtime-client");
    await closeLazyDatabase();
  });

  function buildService(facts: Student500PreparationServiceOptions["facts"]) {
    const applications = createPostgresStudent500Store();
    const resolver = createStudent500RequirementResolver({
      provider: createDeclaredStudent500LegalSourceProvider(),
    });
    return createStudent500PreparationService({
      applications,
      facts,
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

  // M2 projection, switchable to simulate a sharing grant revoked by the owner of
  // the fact. The database side is real: only the upstream projection changes.
  let factVisible = true;
  const factPort = {
    list: () =>
      Promise.resolve({
        facts:
          factVisible === false
            ? []
            : [
                {
                  aiUseAuthorized: true,
                  authorizationActorUserId: OWNER,
                  authorizedAudience: "project" as const,
                  conflicted: false,
                  customerConfirmed: true,
                  factAssertionId: FACT_ID,
                  key: "study.course_name",
                  originKind: "customer_stated",
                  sourceEvidenceRef: null,
                  stale: false,
                  state: "customer_confirmed" as const,
                  valueDisplay: "Diploma of Laboratory Technology",
                  version: 1,
                },
              ],
        status: "available" as const,
      }),
  };

  async function seed(projectId: string, suffix: string) {
    await withClient(async (sql) => {
      await sql`INSERT INTO "User" (id, email, role) VALUES (${OWNER}, ${`${OWNER}@disposable.invalid`}, 'user') ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO "User" (id, email, role) VALUES (${OTHER}, ${`${OTHER}@disposable.invalid`}, 'user') ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO "StudyJourneyProject" (id, "ownerUserId") VALUES (${projectId}, ${OWNER}) ON CONFLICT DO NOTHING`;
    });
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
        operationId: `m6-3-seed-${suffix}`,
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

  test("the disposable database identity and migration ledger are the M6.3 ones", async () => {
    const [identity] = await withClient(
      (sql) =>
        sql<
          {
            database: string;
            role: string;
            server_port: number;
            superuser: boolean;
            version: string;
          }[]
        >`
        SELECT current_database() AS database,
               current_user AS role,
               inet_server_port() AS server_port,
               (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser,
               current_setting('server_version') AS version
      `
    );
    assert.equal(identity?.database, EXPECTED_DATABASE);
    assert.equal(identity?.role, EXPECTED_ROLE);
    assert.equal(identity?.server_port, Number(EXPECTED_SERVER_PORT));
    assert.equal(identity?.superuser, false, "test role must not be superuser");
    assert.match(identity?.version ?? "", /^17\./u);
    const [ledger] = await withClient(
      (sql) =>
        sql<
          { count: string }[]
        >`SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`
    );
    assert.equal(ledger?.count, "50", "migrations 0000-0049 must be applied");
  });

  test("both milestone schemas are present with their guards", async () => {
    const [tables] = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM information_schema.tables
        WHERE table_name IN ('Student500Application','Student500ApplicationOperation',
          'Student500FactReference','Student500GsDraft','Student500PreparationSnapshot','Student500SchoolContext')
      `
    );
    assert.equal(tables?.count, "6");
    // pg_trigger, not information_schema.triggers: the latter exposes one row per
    // event, so a BEFORE UPDATE OR DELETE trigger appears twice.
    const [triggers] = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM pg_trigger
        WHERE NOT tgisinternal AND tgname LIKE 'Student500%'
      `
    );
    assert.equal(triggers?.count, "11");
  });

  test("an application persists and reopens through a fresh repository instance", async () => {
    const projectId = PROJECT;
    const created = await seed(projectId, "reopen");
    const reopenedStore = createPostgresStudent500Store();
    const reopened = await reopenedStore.getApplication({
      applicationId: created.id,
      ownerUserId: OWNER,
      projectId,
    });
    assert.ok(reopened);
    assert.equal(reopened.context.applicationPlace, "offshore");
    assert.equal(reopened.revision, created.revision);
    const forbidden = await reopenedStore.getApplication({
      applicationId: created.id,
      ownerUserId: OTHER,
      projectId,
    });
    assert.equal(forbidden, null, "a non-owner must not read the application");
  });

  test("fact references version, reject duplicates and survive reselection", async () => {
    const projectId = PROJECT;
    const application = await seed(projectId, "facts");
    const service = buildService(factPort);
    const first = await service.selectFact({
      actorUserId: OWNER,
      applicationId: application.id,
      factAssertionId: FACT_ID,
      factVersion: 1,
      operationId: "m6-3-fact-select",
      projectId,
    });
    assert.equal(first.reference.readable, true);
    await assert.rejects(
      () =>
        service.selectFact({
          actorUserId: OWNER,
          applicationId: application.id,
          factAssertionId: FACT_ID,
          factVersion: 1,
          operationId: "m6-3-fact-dup",
          projectId,
        }),
      /integrity_conflict|fact_not_available/u
    );
    await service.unselectFact({
      actorUserId: OWNER,
      applicationId: application.id,
      factReferenceId: first.reference.id,
      operationId: "m6-3-fact-unselect",
      projectId,
    });
    const again = await service.selectFact({
      actorUserId: OWNER,
      applicationId: application.id,
      factAssertionId: FACT_ID,
      factVersion: 1,
      operationId: "m6-3-fact-reselect",
      projectId,
    });
    assert.notEqual(again.reference.id, first.reference.id);
    const rows = await withClient(
      (sql) =>
        sql<{ active: string; total: string }[]>`
        SELECT count(*)::text AS total,
               count(*) FILTER (WHERE "revokedAt" IS NULL)::text AS active
        FROM "Student500FactReference" WHERE "applicationId" = ${application.id}
      `
    );
    assert.equal(rows[0]?.total, "2");
    assert.equal(rows[0]?.active, "1");
  });

  test("GS drafts are immutable, replayed exactly and guarded against CAS drift", async () => {
    const projectId = PROJECT;
    const application = await seed(projectId, "drafts");
    const service = buildService(factPort);
    await service.selectFact({
      actorUserId: OWNER,
      applicationId: application.id,
      factAssertionId: FACT_ID,
      factVersion: 1,
      operationId: "m6-3-draft-select",
      projectId,
    });
    const v1 = await service.createDraft({
      actorUserId: OWNER,
      applicationId: application.id,
      operationId: "m6-3-draft-create",
      projectId,
    });
    const replay = await service.createDraft({
      actorUserId: OWNER,
      applicationId: application.id,
      operationId: "m6-3-draft-create",
      projectId,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.draft.id, v1.draft.id);
    const v2 = await service.saveDraft({
      actorUserId: OWNER,
      applicationId: application.id,
      baseDraftId: v1.draft.id,
      edits: [{ sectionKey: "future_plans", text: "Customer authored text." }],
      operationId: "m6-3-draft-save",
      projectId,
    });
    assert.equal(v2.draft.version, 2);
    const historical = await service.getDraft({
      actorUserId: OWNER,
      applicationId: application.id,
      draftId: v1.draft.id,
      projectId,
    });
    assert.equal(historical.contentSha256, v1.draft.contentSha256);
    await assert.rejects(
      () =>
        service.saveDraft({
          actorUserId: OWNER,
          applicationId: application.id,
          baseDraftId: "99999999-9999-4999-8999-999999999999",
          edits: [{ sectionKey: "future_plans", text: "Stale base." }],
          operationId: "m6-3-draft-cas",
          projectId,
        }),
      /draft_not_found|version_conflict/u
    );
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`UPDATE "Student500GsDraft" SET "contentSha256" = 'tampered' WHERE "id" = ${v1.draft.id}`
        ),
      /immutable/u
    );
  });

  test("preparation snapshots version and stay queryable", async () => {
    const projectId = PROJECT;
    const application = await seed(projectId, "snapshots");
    const service = buildService(factPort);
    const first = await service.createSnapshot({
      actorUserId: OWNER,
      applicationId: application.id,
      operationId: "m6-3-snap-1",
      projectId,
    });
    const second = await service.createSnapshot({
      actorUserId: OWNER,
      applicationId: application.id,
      operationId: "m6-3-snap-2",
      projectId,
    });
    assert.equal(second.snapshot.version, first.snapshot.version + 1);
    const read = await service.getSnapshot({
      actorUserId: OWNER,
      applicationId: application.id,
      projectId,
      snapshotId: first.snapshot.id,
    });
    assert.equal(read.contentSha256, first.snapshot.contentSha256);
  });

  test("a revoked M2 sharing grant redacts persisted preparation content", async () => {
    const projectId = PROJECT;
    factVisible = true;
    const application = await seed(projectId, "revocation");
    const service = buildService(factPort);
    await service.selectFact({
      actorUserId: OWNER,
      applicationId: application.id,
      factAssertionId: FACT_ID,
      factVersion: 1,
      operationId: "m6-3-revoke-select",
      projectId,
    });
    const draft = await service.createDraft({
      actorUserId: OWNER,
      applicationId: application.id,
      operationId: "m6-3-revoke-draft",
      projectId,
    });
    const beforeRevocation = JSON.stringify(draft.draft.sections);
    assert.match(
      beforeRevocation,
      /Diploma of Laboratory Technology/u,
      "the authorized fact must reach the draft before revocation"
    );

    // The sharing member revokes: the fact leaves this actor's M2 projection.
    factVisible = false;
    const view = await service.get({
      actorUserId: OWNER,
      applicationId: application.id,
      projectId,
    });
    const historical = await service.getDraft({
      actorUserId: OWNER,
      applicationId: application.id,
      draftId: draft.draft.id,
      projectId,
    });
    const replay = await service.selectFact({
      actorUserId: OWNER,
      applicationId: application.id,
      factAssertionId: FACT_ID,
      factVersion: 1,
      operationId: "m6-3-revoke-select",
      projectId,
    });
    for (const [label, value] of [
      ["view", view],
      ["historical draft", historical],
      ["select replay", replay],
    ] as const) {
      const json = JSON.stringify(value);
      assert.doesNotMatch(json, /Diploma of Laboratory Technology/u, label);
      assert.doesNotMatch(json, /study\.course_name/u, label);
      assert.doesNotMatch(json, new RegExp(FACT_ID, "u"), label);
    }
    assert.equal(replay.reference.readable, false);
    assert.equal(replay.replayed, true);
    // The immutable database rows and the content hash are untouched.
    assert.equal(historical.contentSha256, draft.draft.contentSha256);
    const stored = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM "Student500GsDraft"
        WHERE "id" = ${draft.draft.id} AND "contentSha256" = ${draft.draft.contentSha256}
      `
    );
    assert.equal(stored[0]?.count, "1");
    factVisible = true;
  });

  test("operations stay referentially complete with no orphan records", async () => {
    const [orphans] = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM "Student500ApplicationOperation" o
        WHERE o."resultKind" = 'gs_draft'
          AND NOT EXISTS (SELECT 1 FROM "Student500GsDraft" d WHERE d."id" = o."resultId")
      `
    );
    assert.equal(orphans?.count, "0");
    const [snapshotOrphans] = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM "Student500ApplicationOperation" o
        WHERE o."resultKind" = 'preparation_snapshot'
          AND NOT EXISTS (SELECT 1 FROM "Student500PreparationSnapshot" s WHERE s."id" = o."resultId")
      `
    );
    assert.equal(snapshotOrphans?.count, "0");
  });
}
