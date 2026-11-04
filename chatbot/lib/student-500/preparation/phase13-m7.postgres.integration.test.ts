/**
 * Phase 13 M7 - real PostgreSQL engineering acceptance.
 *
 * Runs only against the M7 disposable database on the M7 loopback port and refuses
 * every other coordinate. It exercises the REAL M7 PostgreSQL repository, the REAL
 * M7 service and the REAL M6 preparation service - no SQL simulator and no in-memory
 * substitute for the behaviour under test.
 *
 * A skipped run is NOT a pass: the M7 acceptance runner rejects any summary with a
 * non-zero skip count or fewer than M7_MIN_PASS passes.
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
import { denyAllStudent500EditorialAuthority } from "./editorial";
import { deterministicGsComposer } from "./gs-composer";
import { createPostgresDeepPreparationStore } from "./m7-postgres-store";
import {
  createStudent500DeepPreparationService,
  type Scope,
} from "./m7-service";
import { createPostgresPreparationStore } from "./postgres-repository";
import {
  createStudent500PreparationService,
  type Student500PreparationServiceOptions,
} from "./service";

const EXPECTED_DATABASE = "immigration_ai_phase13_m7_test";
const EXPECTED_ENVIRONMENT_ID = "phase13-m7-disposable";
const EXPECTED_ROLE = "m7_test_owner";
const EXPECTED_HOST_PORT = "55451";
const EXPECTED_SERVER_PORT = "5432";
const FORBIDDEN_DATABASES = new Set([
  "chatbot",
  "immigration_legal",
  "postgres",
  "immigration_ai_phase13_m6_3_test",
]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const OPT_IN =
  process.env.PHASE13_M7_DB_INTEGRATION?.trim().toLowerCase() === "true";
const URL_VALUE = process.env.PHASE13_M7_TEST_DATABASE_URL?.trim() ?? "";
const ROLE = process.env.PHASE13_M7_TEST_DATABASE_ROLE?.trim() ?? "";
const ENVIRONMENT_ID = process.env.PHASE13_M7_TEST_ENVIRONMENT_ID?.trim() ?? "";
const HOST_PORT = process.env.PHASE13_M7_TEST_HOST_PORT?.trim() ?? "";
const SERVER_PORT = process.env.PHASE13_M7_TEST_SERVER_PORT?.trim() ?? "";
const POSTGRES_URL_VALUE = process.env.POSTGRES_URL?.trim() ?? "";
const DATABASE_URL_VALUE = process.env.DATABASE_URL?.trim() ?? "";

const skipReason = ((): string | null => {
  if (!OPT_IN) {
    return "M7_DATABASE_ACCEPTANCE_PENDING_OWNER_AUTHORIZATION";
  }
  if (!(URL_VALUE && ROLE && ENVIRONMENT_ID && HOST_PORT && SERVER_PORT)) {
    return "M7 disposable database coordinates are incomplete";
  }
  if (ROLE !== EXPECTED_ROLE) {
    return "the M7 test role must be the dedicated disposable role";
  }
  if (POSTGRES_URL_VALUE !== URL_VALUE || DATABASE_URL_VALUE !== URL_VALUE) {
    return "POSTGRES_URL and DATABASE_URL must both equal the disposable URL";
  }
  if (ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT_ID) {
    return "environment identity must be the explicit M7 disposable marker";
  }
  if (
    HOST_PORT !== EXPECTED_HOST_PORT ||
    SERVER_PORT !== EXPECTED_SERVER_PORT
  ) {
    return "the M7 disposable ports are fixed";
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
    return "the disposable URL port must be the M7 host port";
  }
  const database = parsed.pathname.replace(/^\//u, "");
  if (database !== EXPECTED_DATABASE) {
    return "database must be the M7 disposable database";
  }
  if (FORBIDDEN_DATABASES.has(database)) {
    return "the target must never be an existing business database";
  }
  return null;
})();

if (skipReason) {
  // biome-ignore lint/suspicious/noSkippedTests: authorization-pending guard only
  test.skip(`M7_DB_ACCEPTANCE_PENDING_OWNER_AUTHORIZATION: ${skipReason}`, () => {
    // never executed while authorization is pending
  });
} else {
  runAcceptance();
}

function runAcceptance(): void {
  const OWNER = "11111111-1111-4111-8111-111111111701";
  const OTHER = "11111111-1111-4111-8111-111111111702";
  const OTHER_PROJECT = "22222222-2222-4222-8222-222222222702";
  const FACT_ID = "55555555-5555-4555-8555-555555555701";
  const FOREIGN_FACT_ID = "55555555-5555-4555-8555-555555555799";

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

  /** M2 projection, switchable to simulate a fact-sharing revocation. */
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
  } as unknown as Student500PreparationServiceOptions["facts"];

  function buildServices() {
    const applications = createPostgresStudent500Store();
    const preparationStore = createPostgresPreparationStore();
    const resolver = createStudent500RequirementResolver({
      provider: createDeclaredStudent500LegalSourceProvider(),
    });
    const preparation = createStudent500PreparationService({
      applications,
      facts: factPort,
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
      store: preparationStore,
    });
    const store = createPostgresDeepPreparationStore();
    const deep = createStudent500DeepPreparationService({
      composer: deterministicGsComposer,
      credentialVerifier: {
        code: "unavailable_professional_credential_verifier",
        verify: () => ({
          reasonCode: "professional_credential_registry_unavailable",
          status: "unavailable" as const,
        }),
      },
      editorialAuthority: denyAllStudent500EditorialAuthority,
      preparation,
      resolveDisclosedFactAccess: async () => "unavailable",
      resolveDraftIdentity: async ({ applicationId }) => {
        const drafts = await preparationStore.listDrafts({ applicationId });
        const latest = drafts.at(-1);
        return latest
          ? {
              contentSha256: latest.contentSha256,
              draftId: latest.id,
              version: latest.version,
            }
          : null;
      },
      resolveReviewerAssignment: async () => "unavailable",
      store,
    });
    return { applications, deep, preparation, preparationStore, store };
  }

  let projectSeq = 0;
  /** A fresh synthetic Project per scenario: M6 caps applications per Project. */
  function nextProjectId(): string {
    projectSeq += 1;
    return `22222222-2222-4222-8222-${String(projectSeq).padStart(12, "0")}`;
  }

  async function seed(projectId: string, suffix: string) {
    await withClient(async (sql) => {
      await sql`INSERT INTO "User" (id, email, role) VALUES (${OWNER}, ${`${OWNER}@disposable.invalid`}, 'user') ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO "User" (id, email, role) VALUES (${OTHER}, ${`${OTHER}@disposable.invalid`}, 'user') ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO "StudyJourneyProject" (id, "ownerUserId") VALUES (${projectId}, ${OWNER}) ON CONFLICT DO NOTHING`;
    });
    const applications = createPostgresStudent500Store();
    const context = normalizeStudent500Context({
      applicationPlace: "offshore",
      asOfDate: "2026-11-04",
      coeStatus: "reported_not_held",
      entryRoute: "offer_only",
    });
    const result = await applications.createApplication({
      operation: {
        actorUserId: OWNER,
        operationId: `m7-seed-${suffix}`,
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

  /** One synthetic application with an authorised fact and a saved draft. */
  async function seedWithDraft(suffix: string) {
    const projectId = nextProjectId();
    const application = await seed(projectId, suffix);
    factVisible = true;
    const { preparation } = buildServices();
    const scope: Scope = {
      actorUserId: OWNER,
      applicationId: application.id,
      projectId,
    };
    await preparation.selectFact({
      actorUserId: OWNER,
      applicationId: application.id,
      factAssertionId: FACT_ID,
      factVersion: 1,
      operationId: `m7-fact-${suffix}`,
      projectId,
    });
    await preparation.createDraft({
      actorUserId: OWNER,
      applicationId: application.id,
      operationId: `m7-draft-${suffix}`,
      projectId,
    });
    return { applicationId: application.id, scope };
  }

  test("A1: disposable identity, PostgreSQL 17 and the 0000-0050 ledger", async () => {
    const [identity] = await withClient(
      (sql) =>
        sql<
          {
            database: string;
            migrated: string;
            role: string;
            server_port: number;
            version: string;
          }[]
        >`
        SELECT current_database() AS database,
               current_user AS role,
               inet_server_port() AS server_port,
               current_setting('server_version') AS version,
               (SELECT count(*)::text FROM drizzle.__drizzle_migrations) AS migrated
      `
    );
    assert.equal(identity?.database, EXPECTED_DATABASE);
    assert.equal(identity?.role, EXPECTED_ROLE);
    assert.equal(Number(identity?.server_port), 5432);
    assert.match(String(identity?.version), /^17\./u);
    // 0000-0050 inclusive = 51 migrations, in order, none skipped.
    assert.equal(Number(identity?.migrated), 51);
  });

  test("A2: both M7 tables exist with their uniques and guard triggers", async () => {
    const relations = await withClient(
      (sql) =>
        sql<{ name: string }[]>`
        SELECT c.relname AS name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
            'Student500GsRevisionProposal',
            'Student500EditorialReview',
            'Student500GsRevisionProposal_project_id_unique',
            'Student500GsRevisionProposal_application_content_unique',
            'Student500GsRevisionProposal_application_created_idx',
            'Student500EditorialReview_project_id_unique',
            'Student500EditorialReview_application_round_unique',
            'Student500EditorialReview_application_created_idx'
          )
      `
    );
    const names = new Set(relations.map((row) => row.name));
    for (const expected of [
      "Student500GsRevisionProposal",
      "Student500EditorialReview",
      "Student500GsRevisionProposal_project_id_unique",
      "Student500GsRevisionProposal_application_content_unique",
      "Student500EditorialReview_project_id_unique",
      "Student500EditorialReview_application_round_unique",
    ]) {
      assert.ok(names.has(expected), `${expected} must exist`);
    }
    assert.equal(names.size, 8, "all six indexes and both tables must exist");
    const triggers = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal
          AND c.relname IN (
            'Student500GsRevisionProposal',
            'Student500EditorialReview'
          )
      `
    );
    assert.equal(Number(triggers[0]?.count), 2);
    const functions = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM pg_proc
        WHERE proname IN ('phase13_m7_proposal_guard', 'phase13_m7_editorial_guard')
      `
    );
    assert.equal(Number(functions[0]?.count), 2);
  });

  test("A3: migration 0049 tables are present and intact", async () => {
    const rows = await withClient(
      (sql) =>
        sql<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'Student500FactReference',
            'Student500GsDraft',
            'Student500PreparationSnapshot',
            'Student500SchoolContext'
          )
      `
    );
    assert.equal(rows.length, 4, "0049 was applied, not skipped");
  });

  test("A4: unique indexes, insert-once replay and immutability are database-enforced", async () => {
    const { scope } = await seedWithDraft("unique");
    const { deep } = buildServices();
    const first = await deep.proposeRevision(scope);
    const again = await deep.proposeRevision(scope);
    assert.equal(again.proposal.proposalId, first.proposal.proposalId);
    assert.equal(again.replayed, true);
    const rows = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM "Student500GsRevisionProposal"
        WHERE "applicationId" = ${scope.applicationId}
      `
    );
    assert.equal(rows[0]?.count, "1", "replay must not create a second row");
    await assert.rejects(() =>
      withClient(
        (sql) =>
          sql`INSERT INTO "Student500GsRevisionProposal" (
            "id", "projectId", "applicationId", "baseDraftId", "baseDraftVersion",
            "baseDraftContentSha256", "sections", "sectionCount", "contentSha256",
            "inputDigest", "status", "composerKind", "composerCode", "attribution",
            "createdByUserId"
          ) SELECT gen_random_uuid(), "projectId", "applicationId", "baseDraftId",
            "baseDraftVersion", "baseDraftContentSha256", "sections", "sectionCount",
            "contentSha256", "inputDigest", "status", "composerKind", "composerCode",
            "attribution", "createdByUserId"
            FROM "Student500GsRevisionProposal" WHERE "applicationId" = ${scope.applicationId}`
      )
    );
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`UPDATE "Student500GsRevisionProposal" SET "contentSha256" = ${"f".repeat(64)}
              WHERE "applicationId" = ${scope.applicationId}`
        ),
      /not allowed|immutable/u
    );
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`DELETE FROM "Student500GsRevisionProposal" WHERE "applicationId" = ${scope.applicationId}`
        ),
      /not deletable|not allowed/u
    );
  });

  test("A5: the database enforces the claim protocol and rejects terminal reversal", async () => {
    const { scope } = await seedWithDraft("transitions");
    const { deep } = buildServices();
    const proposal = await deep.proposeRevision(scope);
    const id = proposal.proposal.proposalId;
    // proposed -> accepted skips the claim and is refused.
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`UPDATE "Student500GsRevisionProposal"
              SET "status" = 'accepted', "decidedByUserId" = ${OWNER}, "decidedAt" = now()
              WHERE "id" = ${id}`
        ),
      /not allowed/u
    );
    // An invented status is refused.
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`UPDATE "Student500GsRevisionProposal" SET "status" = 'approved'
              WHERE "id" = ${id}`
        ),
      /not allowed/u
    );
    // The legal claim step is allowed.
    await withClient(
      (sql) =>
        sql`UPDATE "Student500GsRevisionProposal" SET "status" = 'accepting'
          WHERE "id" = ${id}`
    );
    // A claim can never be rejected: that is the race the protocol forbids.
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`UPDATE "Student500GsRevisionProposal"
              SET "status" = 'rejected', "decidedByUserId" = ${OWNER}, "decidedAt" = now()
              WHERE "id" = ${id}`
        ),
      /not allowed/u
    );
    // accepted without naming its draft is refused...
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`UPDATE "Student500GsRevisionProposal"
              SET "status" = 'accepted', "decidedByUserId" = ${OWNER}, "decidedAt" = now()
              WHERE "id" = ${id}`
        ),
      /accepted draft|not allowed/u
    );
    // ...and an accepted row is terminal.
    const decided = await deep.decideProposal({
      decision: "accept",
      proposalId: id,
      scope,
    });
    assert.equal(decided.proposal.status, "accepted");
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`UPDATE "Student500GsRevisionProposal" SET "status" = 'accepting'
              WHERE "id" = ${id}`
        ),
      /terminal|not allowed/u
    );
  });

  async function proposalRow(applicationId: string) {
    const rows = await withClient(
      (sql) =>
        sql<{ acceptedDraftId: string | null; status: string }[]>`
        SELECT "status", "acceptedDraftId" FROM "Student500GsRevisionProposal"
        WHERE "applicationId" = ${applicationId}
        ORDER BY "createdAt" ASC
      `
    );
    return rows;
  }

  async function draftCount(applicationId: string): Promise<number> {
    const rows = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM "Student500GsDraft"
        WHERE "applicationId" = ${applicationId}
      `
    );
    return Number(rows[0]?.count);
  }

  test("B1: proposed -> accepting -> accepted saves exactly one immutable draft", async () => {
    const { scope } = await seedWithDraft("accept");
    const { deep, preparationStore } = buildServices();
    const proposed = await deep.proposeRevision(scope);
    assert.equal(proposed.proposal.status, "proposed");
    const before = await draftCount(scope.applicationId);

    const decided = await deep.decideProposal({
      decision: "accept",
      proposalId: proposed.proposal.proposalId,
      scope,
    });
    assert.equal(decided.proposal.status, "accepted");
    assert.ok(decided.draftId);
    assert.equal(await draftCount(scope.applicationId), before + 1);

    const [row] = await proposalRow(scope.applicationId);
    assert.equal(row?.status, "accepted");
    assert.equal(row?.acceptedDraftId, decided.draftId);

    // The saved draft is the new current version and is immutable.
    const drafts = await preparationStore.listDrafts({
      applicationId: scope.applicationId,
    });
    assert.equal(drafts.at(-1)?.id, decided.draftId);
    const stored = await withClient(
      (sql) =>
        sql<{ hash: string }[]>`
        SELECT "contentSha256" AS hash FROM "Student500GsDraft"
        WHERE "id" = ${decided.draftId}
      `
    );
    assert.match(String(stored[0]?.hash), /^[0-9a-f]{64}$/u);
  });

  test("B2: a proposed revision can be rejected and stays rejected", async () => {
    const { scope } = await seedWithDraft("reject");
    const { deep } = buildServices();
    const proposed = await deep.proposeRevision(scope);
    const before = await draftCount(scope.applicationId);
    const rejected = await deep.decideProposal({
      decision: "reject",
      proposalId: proposed.proposal.proposalId,
      scope,
    });
    assert.equal(rejected.proposal.status, "rejected");
    assert.equal(rejected.draftId, null);
    assert.equal(
      await draftCount(scope.applicationId),
      before,
      "no draft is written"
    );
    await assert.rejects(
      () =>
        deep.decideProposal({
          decision: "accept",
          proposalId: proposed.proposal.proposalId,
          scope,
        }),
      (error: unknown) => (error as { code?: string }).code === "state_conflict"
    );
  });

  test("B3: a claimed revision cannot be rejected", async () => {
    const { scope } = await seedWithDraft("claimed-reject");
    const { deep, store } = buildServices();
    const proposed = await deep.proposeRevision(scope);
    const claim = await store.claimProposal({
      actorUserId: OWNER,
      applicationId: scope.applicationId,
      projectId: scope.projectId,
      proposalId: proposed.proposal.proposalId,
    });
    assert.equal(claim.claimed, true);
    assert.equal(claim.record.status, "accepting");
    await assert.rejects(
      () =>
        deep.decideProposal({
          decision: "reject",
          proposalId: proposed.proposal.proposalId,
          scope,
        }),
      (error: unknown) => (error as { code?: string }).code === "state_conflict"
    );
    await assert.rejects(
      () =>
        store.decideProposal({
          acceptedDraftId: null,
          actorUserId: OWNER,
          applicationId: scope.applicationId,
          projectId: scope.projectId,
          proposalId: proposed.proposal.proposalId,
          status: "rejected",
        }),
      (error: unknown) => (error as { code?: string }).code === "state_conflict"
    );
    const [row] = await proposalRow(scope.applicationId);
    assert.equal(row?.status, "accepting", "the claim is still held");
  });

  test("B4: concurrent accept and reject leave no contradictory state", async () => {
    const { scope } = await seedWithDraft("race");
    const proposal = await buildServices().deep.proposeRevision(scope);
    // Two independent service instances: two real database sessions, no shared state.
    const acceptor = buildServices().deep;
    const rejecter = buildServices().deep;
    const results = await Promise.allSettled([
      acceptor.decideProposal({
        decision: "accept",
        proposalId: proposal.proposal.proposalId,
        scope,
      }),
      rejecter.decideProposal({
        decision: "reject",
        proposalId: proposal.proposal.proposalId,
        scope,
      }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    assert.ok(fulfilled.length >= 1, "at least one decision must complete");
    const [row] = await proposalRow(scope.applicationId);
    const drafts = await draftCount(scope.applicationId);
    if (row?.status === "accepted") {
      assert.ok(row.acceptedDraftId, "an accepted row names its draft");
      assert.equal(drafts, 2, "one accepted draft on top of the seeded one");
    } else {
      assert.equal(row?.status, "rejected");
      assert.equal(row?.acceptedDraftId, null);
      assert.equal(drafts, 1, "a rejected revision writes no draft");
    }
  });

  test("B5: replaying an accepted decision never duplicates the draft", async () => {
    const { scope } = await seedWithDraft("replay");
    const { deep } = buildServices();
    const proposal = await deep.proposeRevision(scope);
    const first = await deep.decideProposal({
      decision: "accept",
      proposalId: proposal.proposal.proposalId,
      scope,
    });
    const afterFirst = await draftCount(scope.applicationId);
    const second = await deep.decideProposal({
      decision: "accept",
      proposalId: proposal.proposal.proposalId,
      scope,
    });
    assert.equal(second.draftId, first.draftId);
    assert.equal(await draftCount(scope.applicationId), afterFirst);
    const [row] = await proposalRow(scope.applicationId);
    assert.equal(row?.status, "accepted");
  });

  test("B6: an interrupted claim is recovered by replaying accept", async () => {
    const { scope } = await seedWithDraft("interrupted");
    const { deep, store } = buildServices();
    const proposal = await deep.proposeRevision(scope);
    // Simulate a crash after the claim and before the draft write.
    const claim = await store.claimProposal({
      actorUserId: OWNER,
      applicationId: scope.applicationId,
      projectId: scope.projectId,
      proposalId: proposal.proposal.proposalId,
    });
    assert.equal(claim.record.status, "accepting");
    const before = await draftCount(scope.applicationId);
    const recovered = await deep.decideProposal({
      decision: "accept",
      proposalId: proposal.proposal.proposalId,
      scope,
    });
    assert.equal(recovered.proposal.status, "accepted");
    assert.equal(await draftCount(scope.applicationId), before + 1);
  });

  test("B7: a stale base version cannot be accepted", async () => {
    const { scope } = await seedWithDraft("stale");
    const { deep, preparation, preparationStore } = buildServices();
    const proposal = await deep.proposeRevision(scope);
    const drafts = await preparationStore.listDrafts({
      applicationId: scope.applicationId,
    });
    const base = drafts.at(-1);
    assert.ok(base);
    // A newer draft version arrives after the proposal was built.
    await preparation.saveDraft({
      actorUserId: OWNER,
      applicationId: scope.applicationId,
      baseDraftId: base.id,
      edits: [{ sectionKey: "future_plans", text: "A later customer edit." }],
      operationId: "m7-stale-save",
      projectId: scope.projectId,
    });
    const superseded =
      await buildServices().store.supersedeProposalsForApplication({
        applicationId: scope.applicationId,
      });
    assert.equal(superseded, 1);
    await assert.rejects(
      () =>
        deep.decideProposal({
          decision: "accept",
          proposalId: proposal.proposal.proposalId,
          scope,
        }),
      (error: unknown) => (error as { code?: string }).code === "state_conflict"
    );
    const [row] = await proposalRow(scope.applicationId);
    assert.equal(row?.status, "superseded");
    assert.equal(row?.acceptedDraftId, null);
  });

  test("C1: another Project, another user and a revoked reader cannot read M7 records", async () => {
    const { scope } = await seedWithDraft("isolation");
    const { deep } = buildServices();
    await deep.proposeRevision(scope);
    // A different Project cannot reach the application.
    await assert.rejects(
      () => deep.get({ ...scope, projectId: OTHER_PROJECT }),
      (error: unknown) => (error as { code?: string }).code !== undefined
    );
    // A different user cannot read it through the owner Project either.
    await assert.rejects(
      () => deep.get({ ...scope, actorUserId: OTHER }),
      (error: unknown) => (error as { code?: string }).code !== undefined
    );
    const own = await deep.get(scope);
    assert.equal(own.proposal?.status, "proposed");
  });

  test("C2: a revoked fact sharing hides fact-derived proposal sections without mutating the row", async () => {
    const { scope } = await seedWithDraft("revocation");
    const { deep, preparationStore, store } = buildServices();
    const drafts = await preparationStore.listDrafts({
      applicationId: scope.applicationId,
    });
    const base = drafts.at(-1);
    assert.ok(base);
    // The deterministic composer emits no fact-bearing section for this synthetic
    // fact key, so the fact-derived proposal row is written through the REAL
    // repository. What is under test here is server-side redaction of a stored row
    // whose sharing is later revoked, plus the immutability of that row.
    const initial = await deep.get(scope);
    const factReferenceId =
      initial.disclosureScope.factBearingDraftReferenceIds[0];
    assert.ok(factReferenceId, "the seeded draft must rest on a readable fact");
    const proposedId = "44444444-4444-4444-8444-444444444701";
    await store.insertProposal({
      actorUserId: OWNER,
      applicationId: scope.applicationId,
      projectId: scope.projectId,
      values: {
        attribution: {
          assertionCount: 1,
          unattributedAssertionCount: 0,
          unverifiedAssertionCount: 0,
        },
        baseDraftContentSha256: base.contentSha256,
        baseDraftId: base.id,
        baseDraftVersion: base.version,
        composerCode: "deterministic_section_composer_v1",
        composerKind: "deterministic",
        contentSha256: "d".repeat(64),
        id: proposedId,
        inputDigest: "e".repeat(64),
        sections: [
          {
            assertions: [
              {
                assertionId: "as_course_and_reasons_0",
                assertionText:
                  "Recorded fact (study.course_name): Diploma of Laboratory Technology",
                factReferenceIds: [factReferenceId],
                support: "authorized_fact",
              },
            ],
            factReferenceIds: [factReferenceId],
            heading: "Course choice and reasons for study",
            missingInformation: [],
            sectionKey: "course_and_reasons",
            source: "authorized_fact",
            text: "Recorded fact (study.course_name): Diploma of Laboratory Technology",
          },
          {
            assertions: [
              {
                assertionId: "as_future_plans_0",
                assertionText: "I plan to work in a laboratory.",
                factReferenceIds: [],
                support: "customer_authored",
              },
            ],
            factReferenceIds: [],
            heading: "Future plans and expected value",
            missingInformation: [],
            sectionKey: "future_plans",
            source: "customer_text",
            text: "I plan to work in a laboratory.",
          },
        ],
      },
    });
    const stored = await store.getProposal({
      applicationId: scope.applicationId,
      projectId: scope.projectId,
      proposalId: proposedId,
    });
    assert.ok(stored);
    const originalHash = stored.contentSha256;
    const before = await deep.get(scope);
    assert.equal(before.proposal?.readable, true);
    assert.equal(before.proposal?.redactedSectionCount, 0);
    assert.equal(before.proposal?.sections.length, 2);

    factVisible = false;
    try {
      // The sharing of the fact that section rests on is revoked upstream.
      const hidden = await deep.get(scope);
      assert.deepEqual(hidden.disclosureScope.readableFactReferenceIds, []);
      assert.deepEqual(hidden.disclosureScope.factBearingDraftReferenceIds, []);
      const view = hidden.proposal;
      assert.ok(view);
      assert.equal(view.readable, false);
      assert.equal(view.redactedSectionCount, 1);
      assert.equal(view.sections.length, 1);
      assert.deepEqual(
        view.sections.map((section) => section.sectionKey),
        ["future_plans"]
      );
      assert.doesNotMatch(
        JSON.stringify(view),
        /Diploma of Laboratory Technology/u
      );
      // Nothing historical was rewritten by the revocation.
      const after = await store.getProposal({
        applicationId: scope.applicationId,
        projectId: scope.projectId,
        proposalId: proposedId,
      });
      assert.equal(after?.contentSha256, originalHash);
      assert.deepEqual(after?.sections, stored.sections);
    } finally {
      factVisible = true;
    }
  });

  test("C3: an unauthorised fact reference cannot enter a composition", async () => {
    await seedWithDraft("unauthorized-fact");
    const { validateComposition } = await import("./gs-composer");
    assert.throws(() =>
      validateComposition({
        allowedFactReferenceIds: [FACT_ID],
        sections: [
          {
            assertions: [],
            factReferenceIds: [FOREIGN_FACT_ID],
            heading: "Genuine Student",
            missingInformation: [],
            sectionKey: "understanding_of_study",
            source: "authorized_fact",
            text: "A fact this application never authorised.",
          },
        ],
      })
    );
  });

  /**
   * Consent as the UI builds it: the exact current draft plus every protected fact
   * dependency the server reported for that draft.
   */
  function consentFor(
    draft: { contentSha256?: string; draftId: string; version: number },
    view: {
      disclosureScope: { factBearingDraftReferenceIds: readonly string[] };
    },
    overrides?: Record<string, unknown>
  ) {
    return {
      consentCode: "student500_editorial_review.v1",
      consentGranted: true,
      disclosureScopes: ["gs_draft_sections", "selected_fact_summaries"],
      draftContentSha256: draft.contentSha256,
      draftId: draft.draftId,
      draftVersion: draft.version,
      factReferenceIds: [...view.disclosureScope.factBearingDraftReferenceIds],
      ...overrides,
    };
  }

  test("C4: editorial authority and professional credentials stay unavailable", async () => {
    const { scope } = await seedWithDraft("authority");
    const { deep } = buildServices();
    const view = await deep.get(scope);
    assert.equal(view.editorialAuthority.available, false);
    assert.equal(
      view.editorialAuthority.authorityCode,
      "deny_by_default_student500_editorial_authority"
    );
    assert.notEqual(view.editorialAuthority.credentialStatus, "verified");
    assert.ok(view.currentDraft);
    const requested = await deep.requestEditorialReview({
      consent: consentFor(view.currentDraft, view),
      scope,
    });
    assert.equal(requested.review.status, "authority_unavailable");
    assert.notEqual(requested.review.reviewerCredentialStatus, "verified");
    assert.equal(requested.review.professionalSignOff, "not_established");
    // A reviewer can never supply feedback while authority is denied.
    await assert.rejects(
      () =>
        deep.submitEditorialFeedback({
          comments: [{ body: "Approved by your lawyer." }],
          proposedEdits: [],
          reviewId: requested.review.reviewId,
          scope: { ...scope, actorUserId: OTHER },
        }),
      (error: unknown) => (error as { code?: string }).code !== undefined
    );
  });

  test("C5: a fabricated lawyer approval cannot be persisted", async () => {
    const { scope } = await seedWithDraft("fake-approval");
    const { deep, store } = buildServices();
    const view = await deep.get(scope);
    assert.ok(view.currentDraft);
    const requested = await deep.requestEditorialReview({
      consent: consentFor(view.currentDraft, view),
      scope,
    });
    await assert.rejects(() =>
      deep.submitEditorialFeedback({
        comments: [],
        proposedEdits: [
          {
            proposedText: "This application is professionally approved.",
            rationaleCode: "clarity",
            sectionKey: "understanding_of_study",
          },
        ],
        reviewId: requested.review.reviewId,
        scope: { ...scope, actorUserId: OTHER },
      })
    );
    const stored = await store.getEditorialReview({
      applicationId: scope.applicationId,
      projectId: scope.projectId,
      reviewId: requested.review.reviewId,
    });
    assert.deepEqual(stored?.comments ?? [], []);
    assert.deepEqual(stored?.proposedEdits ?? [], []);
    assert.equal(stored?.status, "authority_unavailable");
    assert.equal(stored?.reviewerUserId ?? null, null);
  });

  test("C6: consent must name the exact draft, version and dependencies", async () => {
    const { scope } = await seedWithDraft("consent");
    const { deep } = buildServices();
    const view = await deep.get(scope);
    assert.ok(view.currentDraft);
    const draft = view.currentDraft;
    // A different version is refused.
    await assert.rejects(
      () =>
        deep.requestEditorialReview({
          consent: consentFor(draft, view, { draftVersion: draft.version + 1 }),
          scope,
        }),
      (error: unknown) => (error as { code?: string }).code === "state_conflict"
    );
    // Asking for fact summaries while omitting the draft's dependencies is refused.
    await assert.rejects(
      () =>
        deep.requestEditorialReview({
          consent: consentFor(draft, view, { factReferenceIds: [] }),
          scope,
        }),
      (error: unknown) =>
        (error as { code?: string }).code === "consent_required"
    );
    // An unrelated fact cannot be disclosed.
    await assert.rejects(
      () =>
        deep.requestEditorialReview({
          consent: consentFor(draft, view, {
            factReferenceIds: [FOREIGN_FACT_ID],
          }),
          scope,
        }),
      (error: unknown) =>
        (error as { code?: string }).code === "consent_required"
    );
    // Without explicit consent nothing can be requested.
    await assert.rejects(() =>
      deep.requestEditorialReview({
        consent: consentFor(draft, view, { consentGranted: false }),
        scope,
      })
    );
  });

  test("C7: duplicate editorial requests are idempotent", async () => {
    const { scope } = await seedWithDraft("idempotent");
    const { deep } = buildServices();
    const view = await deep.get(scope);
    assert.ok(view.currentDraft);
    const consent = consentFor(view.currentDraft, view);
    const first = await deep.requestEditorialReview({ consent, scope });
    const second = await deep.requestEditorialReview({ consent, scope });
    assert.equal(second.review.reviewId, first.review.reviewId);
    assert.equal(second.replayed, true);
    const rows = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM "Student500EditorialReview"
        WHERE "applicationId" = ${scope.applicationId}
      `
    );
    assert.equal(rows[0]?.count, "1");
  });
}
