/**
 * Phase 13 M8.1 - guarded real-PostgreSQL acceptance (AUTHORED, NOT EXECUTED).
 *
 * Refuses to run unless every M8.1 disposable coordinate is supplied explicitly, and
 * it can only ever target the M8.1 disposable database on the M8.1 loopback port.
 *
 * These tests exercise the REAL `createPostgresSubmissionPackageStore()` and the real
 * service against real transactions, row locks, unique indexes, composite foreign
 * keys and triggers. Only the upstream target read is a fixture: M5.1/M6.2 state is
 * an injected port, so no business table outside M8 is written.
 *
 * Required environment (no fallback, never a business database):
 *   PHASE13_M8_1_DB_INTEGRATION=true
 *   PHASE13_M8_1_TEST_ENVIRONMENT_ID=phase13-m8-1-disposable
 *   PHASE13_M8_1_TEST_DATABASE_ROLE=m8_1_test_owner
 *   PHASE13_M8_1_TEST_HOST_PORT=55453
 *   PHASE13_M8_1_TEST_SERVER_PORT=5432
 *   PHASE13_M8_1_TEST_DATABASE_URL=postgres://m8_1_test_owner:...@127.0.0.1:55453/immigration_ai_phase13_m8_1_test
 *   POSTGRES_URL / DATABASE_URL=<the same URL>
 *
 * A skipped run is NOT a pass. Migration 0051 remains unapplied everywhere until an
 * explicitly authorized run of scripts/phase13-m8-1-db-acceptance.sh.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import postgres from "postgres";
import {
  SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
  SubmissionPackageError,
} from "./contracts";
import type { SubmissionTargetState } from "./ports";
import { createPostgresSubmissionPackageStore } from "./postgres-repository";
import { createSubmissionPackageService } from "./service";

const EXPECTED_DATABASE = "immigration_ai_phase13_m8_1_test";
const EXPECTED_ROLE = "m8_1_test_owner";
const EXPECTED_HOST_PORT = "55453";
const EXPECTED_ENVIRONMENT_ID = "phase13-m8-1-disposable";
const FORBIDDEN_DATABASES = new Set([
  "chatbot",
  "immigration_legal",
  "postgres",
  "immigration_ai_phase13_m7_test",
]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const OPT_IN =
  process.env.PHASE13_M8_1_DB_INTEGRATION?.trim().toLowerCase() === "true";
const URL_VALUE = process.env.PHASE13_M8_1_TEST_DATABASE_URL?.trim() ?? "";

export const M8_1_DB_PENDING =
  "M8_1_DATABASE_ACCEPTANCE_PENDING_OWNER_AUTHORIZATION";

const skipReason = ((): string | null => {
  if (!OPT_IN) {
    return M8_1_DB_PENDING;
  }
  if (
    URL_VALUE === "" ||
    process.env.PHASE13_M8_1_TEST_DATABASE_ROLE !== EXPECTED_ROLE ||
    process.env.PHASE13_M8_1_TEST_HOST_PORT !== EXPECTED_HOST_PORT ||
    process.env.PHASE13_M8_1_TEST_SERVER_PORT !== "5432" ||
    process.env.PHASE13_M8_1_TEST_ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT_ID
  ) {
    return "M8.1 disposable database coordinates are incomplete";
  }
  if (
    process.env.POSTGRES_URL !== URL_VALUE ||
    process.env.DATABASE_URL !== URL_VALUE
  ) {
    return "POSTGRES_URL and DATABASE_URL must both equal the disposable URL";
  }
  const parsed = new URL(URL_VALUE);
  if (
    !LOOPBACK_HOSTS.has(parsed.hostname) ||
    parsed.port !== EXPECTED_HOST_PORT
  ) {
    return "the disposable target must be loopback on the M8.1 host port";
  }
  const database = parsed.pathname.replace(/^\//u, "");
  if (database !== EXPECTED_DATABASE || FORBIDDEN_DATABASES.has(database)) {
    return "database must be the M8.1 disposable database";
  }
  return null;
})();

if (skipReason) {
  // biome-ignore lint/suspicious/noSkippedTests: authorization-pending guard only
  test.skip(`${M8_1_DB_PENDING}: ${skipReason}`, () => {
    // never executed while authorization is pending
  });
} else {
  runAcceptance();
}

function runAcceptance(): void {
  const OWNER = "11111111-1111-4111-8111-111111111c01";
  const MEMBER = "11111111-1111-4111-8111-111111111c02";
  const PROJECT = "22222222-2222-4222-8222-222222222c01";
  const TARGET = "44444444-4444-4444-8444-444444444c01";

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

  /** The only injected port: M5.1/M6.2 target state, kept deliberately synthetic. */
  const target: { current: SubmissionTargetState } = {
    current: makeTarget({ revision: 1, draftVersion: 1 }),
  };

  function makeTarget(input: {
    readonly revision: number;
    readonly draftVersion: number;
  }): SubmissionTargetState {
    const draftId = `66666666-6666-4666-8666-666666666c0${input.draftVersion}`;
    return {
      archived: false,
      content: {
        applicationRevision: input.revision,
        applicationStatus: "in_progress",
        school: null,
        student500: {
          applicationPlace: "offshore",
          coeStatus: "reported_not_held",
          coverage: {
            conflicted: 0,
            covered: 1,
            humanReviewRequired: 1,
            missing: 1,
          },
          entryRoute: "offer_only",
          factReferenceCount: 0,
          gsDraft: null,
          preparationSnapshot: null,
        },
        targetLabel: "student_500_application",
        title: "Student 500 application",
      },
      dependencies: {
        applicationRevision: input.revision,
        applicationStatus: "in_progress",
        factReferences: [],
        gsDraft: {
          contentSha256: `${input.draftVersion}`.padStart(64, "c"),
          draftId,
          missingInformation: [],
          redactedSectionCount: 0,
          sectionHeadings: ["Future plans and expected value"],
          sectionKeys: ["future_plans"],
          version: input.draftVersion,
        },
        legalSourceRevision: "declared-2026-10",
        preparationSnapshot: null,
        schoolPackage: null,
        sourceAvailability: "available",
      },
      indicators: [{ code: "human_review_required", kind: "unverified" }],
      review: {
        gsDraft: {
          contentSha256: `${input.draftVersion}`.padStart(64, "c"),
          draftId,
          sections: [
            {
              heading: "Future plans and expected value",
              missingInformation: [],
              sectionKey: "future_plans",
              text: `Exact draft text v${input.draftVersion}`,
            },
          ],
          version: input.draftVersion,
        },
        sections: [],
        source: "pinned_gs_draft_version",
        title: "Student 500 application",
      },
      reviewUnavailableReason: null,
      targetId: TARGET,
      targetKind: "student_500_visa_application",
      targetVersion: input.revision,
    };
  }

  const store = createPostgresSubmissionPackageStore();
  const service = createSubmissionPackageService({
    readTarget: async () => target.current,
    store,
  });

  const scope = {
    actorUserId: OWNER,
    projectId: PROJECT,
    targetId: TARGET,
    targetKind: "student_500_visa_application" as const,
  };

  async function seed(): Promise<void> {
    await withClient(async (sql) => {
      await sql`insert into "User" (id, email, role) values (${OWNER}, ${`${OWNER}@disposable.invalid`}, 'user') on conflict do nothing`;
      await sql`insert into "User" (id, email, role) values (${MEMBER}, ${`${MEMBER}@disposable.invalid`}, 'user') on conflict do nothing`;
      await sql`insert into "StudyJourneyProject" (id, "ownerUserId") values (${PROJECT}, ${OWNER}) on conflict do nothing`;
    });
  }

  test("1: identity, PostgreSQL 17 and the 0000-0051 ledger", async () => {
    const [row] = await withClient(
      (sql) =>
        sql<
          {
            database: string;
            migrated: string;
            role: string;
            version: string;
          }[]
        >`
        select current_database() as database,
               current_user as role,
               current_setting('server_version') as version,
               (select count(*)::text from drizzle.__drizzle_migrations) as migrated
      `
    );
    assert.equal(row?.database, EXPECTED_DATABASE);
    assert.equal(row?.role, EXPECTED_ROLE);
    assert.match(String(row?.version), /^17\./u);
    // 0000-0051 inclusive.
    assert.equal(Number(row?.migrated), 52);
    await seed();
  });

  test("2: the four tables, exact-identity constraints and append-only triggers exist", async () => {
    const relations = await withClient(
      (sql) =>
        sql<{ name: string }[]>`
        select c.relname as name from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in (
          'SubmissionPackage', 'SubmissionPackageConfirmation',
          'SubmissionPackageInvalidation',
          'SubmissionPackageConfirmationFinalization',
          'SubmissionPackage_project_target_version_unique',
          'SubmissionPackage_identity_version_digest_unique',
          'SubmissionPackageConfirmation_package_type_unique',
          'SubmissionPackageConfirmation_identity_package_unique',
          'SubmissionPackageInvalidation_confirmation_dependency_unique',
          'SubmissionPackageConfirmationFinalization_confirmation_unique',
          'SubmissionPackageConfirmationFinalization_identity_unique'
        )
      `
    );
    // 4 tables + the 7 exact-identity indexes named above.
    assert.equal(relations.length, 11);
    const foreignKeys = await withClient(
      (sql) =>
        sql<{ conname: string }[]>`
        select conname from pg_constraint
        where contype = 'f' and conname like 'SubmissionPackage%'
      `
    );
    const names = foreignKeys.map((row) => row.conname);
    assert.ok(
      names.includes("SubmissionPackageConfirmation_parent_identity_fk")
    );
    assert.ok(
      names.includes("SubmissionPackageInvalidation_confirmation_identity_fk")
    );
    assert.ok(
      names.includes(
        "SubmissionPackageConfirmationFinalization_identity_fk"
      ),
      "the finalization record is bound to its confirmation identity"
    );
    const triggers = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        select count(*)::text as count from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal and c.relname like 'SubmissionPackage%'
      `
    );
    // package, confirmation, invalidation and finalization are all append-only.
    assert.equal(Number(triggers[0]?.count), 4);
  });

  test("3: real creation allocates monotonic versions through the repository", async () => {
    const v1 = await service.buildPackage({
      operationId: "m8pg-build-1",
      scope,
    });
    assert.equal(v1.package.version, 1);
    target.current = makeTarget({ revision: 2, draftVersion: 2 });
    const v2 = await service.buildPackage({
      operationId: "m8pg-build-2",
      scope,
    });
    assert.equal(v2.package.version, 2);
    assert.notEqual(v1.package.manifestSha256, v2.package.manifestSha256);

    const persisted = await withClient(
      (sql) =>
        sql<{ count: string; max: string }[]>`
        select count(*)::text as count, max("version")::text as max
        from "SubmissionPackage" where "projectId" = ${PROJECT}
      `
    );
    assert.equal(persisted[0]?.count, "2");
    assert.equal(persisted[0]?.max, "2");
  });

  test("4: exact-version confirmation is durable and bound to the parent identity", async () => {
    const view = await service.get(scope);
    const current = view.currentPackage;
    assert.ok(current);
    const confirmed = await service.confirmPackage({
      confirmationType: "package_content_review",
      consentBinding: {
        manifestSha256: current.manifestSha256,
        packageVersionId: current.packageVersionId,
        projectId: PROJECT,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetId: TARGET,
        targetKind: "student_500_visa_application",
      },
      consentGranted: true,
      manifestSha256: current.manifestSha256,
      operationId: "m8pg-confirm-1",
      packageVersionId: current.packageVersionId,
      scope,
      statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
      targetVersion: current.targetVersion,
    });
    assert.equal(confirmed.confirmation.current, true);
    const rows = await withClient(
      (sql) =>
        sql<{ packageVersion: number; manifestSha256: string }[]>`
        select "packageVersion", "manifestSha256"
        from "SubmissionPackageConfirmation" where "projectId" = ${PROJECT}
      `
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.manifestSha256, current.manifestSha256);
  });

  test("5: operation replay and changed-request conflict use the real unique indexes", async () => {
    const replay = await service.buildPackage({
      operationId: "m8pg-build-2",
      scope,
    });
    assert.equal(replay.replayed, true);
    const rows = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        select count(*)::text as count from "SubmissionPackage"
        where "projectId" = ${PROJECT}
      `
    );
    assert.equal(rows[0]?.count, "2", "replay did not create a row");
    await assert.rejects(
      () =>
        service.buildPackage({
          expectedVersion: 1,
          operationId: "m8pg-build-2",
          scope,
        }),
      (error: unknown) =>
        error instanceof SubmissionPackageError &&
        error.code === "idempotency_conflict"
    );
    // A stale expected revision fails closed before any write.
    await assert.rejects(
      () =>
        service.buildPackage({
          expectedVersion: 99,
          operationId: "m8pg-build-stale",
          scope,
        }),
      (error: unknown) =>
        error instanceof SubmissionPackageError &&
        error.code === "revision_conflict"
    );
  });

  test("6: a revoked member is refused inside the durable write transaction", async () => {
    const view = await service.get(scope);
    const current = view.currentPackage;
    assert.ok(current);
    // The member holds an active membership, builds a version, then loses it.
    await withClient(
      (sql) =>
        sql`insert into "ProjectMembership" (
            "id", "projectId", "userId", "status", "invitedByUserId", "acceptedAt"
          )
          values (
            gen_random_uuid(), ${PROJECT}, ${MEMBER}, 'active', ${OWNER}, now()
          )
          on conflict ("projectId", "userId") do update
            set "status" = 'active', "acceptedAt" = now(), "revokedAt" = null`
    );
    const memberScope = { ...scope, actorUserId: MEMBER };
    const memberBuild = await service.buildPackage({
      operationId: "m8pg-member-build",
      scope: memberScope,
    });
    assert.equal(memberBuild.package.version, 3);

    await withClient(
      (sql) =>
        sql`update "ProjectMembership"
            set "status" = 'revoked', "revokedAt" = now()
            where "projectId" = ${PROJECT} and "userId" = ${MEMBER}`
    );
    await assert.rejects(
      () =>
        service.confirmPackage({
          confirmationType: "customer_declarations",
          consentBinding: {
            manifestSha256: memberBuild.package.manifestSha256,
            packageVersionId: memberBuild.package.packageVersionId,
            projectId: PROJECT,
            statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
            targetId: TARGET,
            targetKind: "student_500_visa_application",
          },
          consentGranted: true,
          manifestSha256: memberBuild.package.manifestSha256,
          operationId: "m8pg-member-confirm",
          packageVersionId: memberBuild.package.packageVersionId,
          scope: memberScope,
          statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
          targetVersion: memberBuild.package.targetVersion,
        }),
      (error: unknown) =>
        error instanceof SubmissionPackageError &&
        (error.code === "project_forbidden" ||
          error.code === "actor_not_eligible")
    );
    // The service refuses before any write, so also assert the boundary itself: the
    // real repository re-derives authority inside its own transaction and must refuse
    // this revoked actor even when called directly.
    await assert.rejects(
      () =>
        store.insertConfirmation({
          guard: { actorUserId: MEMBER, requireActiveProject: true },
          operation: {
            actorUserId: MEMBER,
            operationId: "m8pg-member-store-insert",
            requestSha256: "a".repeat(64),
          },
          projectId: PROJECT,
          values: {
            confirmationType: "package_content_review",
            id: randomUUID(),
            manifestSha256: memberBuild.package.manifestSha256,
            packageVersion: memberBuild.package.version,
            packageVersionId: memberBuild.package.packageVersionId,
            statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
            targetId: TARGET,
            targetKind: "student_500_visa_application",
            targetVersion: memberBuild.package.targetVersion,
          },
        }),
      (error: unknown) =>
        error instanceof SubmissionPackageError &&
        error.code === "project_forbidden",
      "the transaction guard refuses a revoked member on its own"
    );
    const confirmed = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        select count(*)::text as count from "SubmissionPackageConfirmation"
        where "projectId" = ${PROJECT}
      `
    );
    assert.equal(
      confirmed[0]?.count,
      "1",
      "the revoked write persisted nothing"
    );
  });

  test("7: the durable finalization record gates confirmation validity", async () => {
    const rows = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        select count(*)::text as count
        from "SubmissionPackageConfirmationFinalization"
        where "projectId" = ${PROJECT}
      `
    );
    // Test 4 confirmed exactly one version successfully, so exactly one finalization
    // exists; the refused write in test 6 left none.
    assert.equal(rows[0]?.count, "1");
    const view = await service.get(scope);
    assert.equal(view.confirmations.length, 1);
    assert.equal(view.confirmations[0]?.finalized, true);
    assert.equal(view.confirmations[0]?.current, true);

    // Finalization is immutable like the rest of the history.
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`delete from "SubmissionPackageConfirmationFinalization"
              where "projectId" = ${PROJECT}`
        ),
      /not deletable|not allowed/iu
    );
    // And it can never reference a confirmation from another Project/target.
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`insert into "SubmissionPackageConfirmationFinalization" (
            "id", "projectId", "confirmationId", "packageVersionId",
            "validatedDependencySha256", "validatedByUserId"
          ) values (
            gen_random_uuid(), ${PROJECT}, gen_random_uuid(), gen_random_uuid(),
            repeat('a', 64), ${OWNER}
          )`
        ),
      /foreign key|violates/iu
    );
  });

  test("8: contradictory confirmations, rewrites and old-version confirms are refused", async () => {
    const packages = await withClient(
      (sql) =>
        sql<{ id: string; version: number; manifestSha256: string }[]>`
        select "id", "version", "manifestSha256" from "SubmissionPackage"
        where "projectId" = ${PROJECT} order by "version" asc
      `
    );
    assert.equal(packages.length, 3);
    const newest = packages[2];
    const oldest = packages[0];
    assert.ok(newest && oldest);

    // A confirmation that names the newest package but carries the oldest version or
    // digest violates the composite identity key.
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`insert into "SubmissionPackageConfirmation" (
            "id", "projectId", "targetKind", "targetId", "packageVersionId",
            "packageVersion", "manifestSha256", "targetVersion", "confirmationType",
            "statementPolicyVersion", "actorUserId", "operationId", "requestSha256"
          ) values (
            gen_random_uuid(), ${PROJECT}, 'student_500_visa_application', ${TARGET},
            ${newest.id}, ${oldest.version}, ${oldest.manifestSha256}, 1,
            'customer_declarations', 'p', ${OWNER}, 'm8pg-contradict', repeat('a', 64)
          )`
        ),
      /foreign key|violates/iu
    );
    // An unknown parent is refused too.
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`insert into "SubmissionPackageConfirmation" (
            "id", "projectId", "targetKind", "targetId", "packageVersionId",
            "packageVersion", "manifestSha256", "targetVersion", "confirmationType",
            "statementPolicyVersion", "actorUserId", "operationId", "requestSha256"
          ) values (
            gen_random_uuid(), ${PROJECT}, 'student_500_visa_application', ${TARGET},
            gen_random_uuid(), 1, repeat('a', 64), 1,
            'customer_declarations', 'p', ${OWNER}, 'm8pg-orphan', repeat('a', 64)
          )`
        ),
      /foreign key|violates/iu
    );
    // History is append-only.
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`update "SubmissionPackage" set "manifestSha256" = repeat('d', 64)
              where "id" = ${newest.id}`
        ),
      /immutable|not allowed/iu
    );
    await assert.rejects(
      () =>
        withClient(
          (sql) =>
            sql`delete from "SubmissionPackage" where "id" = ${oldest.id}`
        ),
      /not deletable|not allowed/iu
    );
    // An older version cannot receive a fresh confirmation through the service either.
    await assert.rejects(
      () =>
        service.confirmPackage({
          confirmationType: "package_content_review",
          consentBinding: {
            manifestSha256: oldest.manifestSha256,
            packageVersionId: oldest.id,
            projectId: PROJECT,
            statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
            targetId: TARGET,
            targetKind: "student_500_visa_application",
          },
          consentGranted: true,
          manifestSha256: oldest.manifestSha256,
          operationId: "m8pg-old-confirm",
          packageVersionId: oldest.id,
          scope,
          statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
          targetVersion: 1,
        }),
      (error: unknown) =>
        error instanceof SubmissionPackageError &&
        error.code === "state_conflict"
    );
  });
}
