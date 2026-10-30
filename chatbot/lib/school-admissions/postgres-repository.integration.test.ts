// biome-ignore-all lint/suspicious/noMisplacedAssertion: guarded disposable-database assertions stay in their test scope.
/**
 * Phase 13 M5.2 — PostgreSQL acceptance suite (PREPARED, **NOT RUN**).
 *
 * Every behavioural test drives the real `createPostgresSchoolAdmissionsStore()`
 * against a disposable, isolated PostgreSQL 17 database. The suite skips unless
 * every coordinate below is explicitly provided; a wrong coordinate is a failure,
 * never a fallback. Migration 0047 is unapplied in this worktree and no database
 * is contacted by an un-opted-in run.
 *
 * Required environment (no fallback):
 *
 *   PHASE13_M5_2_DB_INTEGRATION=true
 *   PHASE13_M5_2_TEST_ENVIRONMENT_ID=phase13-m5-2-disposable
 *   PHASE13_M5_2_TEST_DATABASE_ROLE=<dedicated disposable role>
 *   PHASE13_M5_2_TEST_DATABASE_URL=postgres://<role>:…@127.0.0.1:<hostPort>/immigration_ai_phase13_m5_2_test
 *   PHASE13_M5_2_TEST_HOST_PORT=<host-published port, never 5432>
 *   PHASE13_M5_2_TEST_SERVER_PORT=<port PostgreSQL listens on inside its server>
 *   POSTGRES_URL=<the same URL>   # the store resolves its pool from POSTGRES_URL
 *   DATABASE_URL=<the same URL>   # assertion-side client identity
 *
 * Safety: explicit loopback host, explicit host port (5432 refused), the URL port
 * must equal the declared host port, `inet_server_port()` must equal the declared
 * server port, the database name must be the disposable database, the role must
 * be the declared disposable role, and both connection variables must equal the
 * disposable URL so `.env.local` can never point the store at a real database.
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(".env.local"), override: false });

const EXPECTED_DATABASE = "immigration_ai_phase13_m5_2_test";
const EXPECTED_ENVIRONMENT_ID = "phase13-m5-2-disposable";
const FORBIDDEN_DATABASE = "immigration_legal";
const FORBIDDEN_ROLE = "rico_local";
const FORBIDDEN_PORT = "5432";
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1", "[::1]"];

const OPT_IN =
  process.env.PHASE13_M5_2_DB_INTEGRATION?.trim().toLowerCase() === "true";
const TEST_DATABASE_URL =
  process.env.PHASE13_M5_2_TEST_DATABASE_URL?.trim() ?? "";
const TEST_DATABASE_ROLE =
  process.env.PHASE13_M5_2_TEST_DATABASE_ROLE?.trim() ?? "";
const TEST_ENVIRONMENT_ID =
  process.env.PHASE13_M5_2_TEST_ENVIRONMENT_ID?.trim() ?? "";
const TEST_HOST_PORT = process.env.PHASE13_M5_2_TEST_HOST_PORT?.trim() ?? "";
const TEST_SERVER_PORT =
  process.env.PHASE13_M5_2_TEST_SERVER_PORT?.trim() ?? "";

const skipReason = (() => {
  if (!OPT_IN) {
    return "PHASE13_M5_2_DB_INTEGRATION is not enabled (explicit opt-in required)";
  }
  if (!TEST_DATABASE_URL) {
    return "PHASE13_M5_2_TEST_DATABASE_URL is not configured (disposable database required)";
  }
  if (!TEST_DATABASE_ROLE) {
    return "PHASE13_M5_2_TEST_DATABASE_ROLE is not configured (disposable role required)";
  }
  if (!TEST_ENVIRONMENT_ID) {
    return "PHASE13_M5_2_TEST_ENVIRONMENT_ID is not configured (environment identity required)";
  }
  if (!TEST_HOST_PORT) {
    return "PHASE13_M5_2_TEST_HOST_PORT is not configured (host-published port required)";
  }
  if (!TEST_SERVER_PORT) {
    return "PHASE13_M5_2_TEST_SERVER_PORT is not configured (server-side port required)";
  }
  if (!process.env.POSTGRES_URL?.trim()) {
    return "POSTGRES_URL is not scoped to the disposable database (the store would otherwise use .env.local)";
  }
  return false as const;
})();

function assertDisposableTarget() {
  const url = new URL(TEST_DATABASE_URL);
  assert.ok(
    url.protocol === "postgres:" || url.protocol === "postgresql:",
    "the disposable URL must be a PostgreSQL URL"
  );
  assert.ok(
    LOOPBACK_HOSTS.includes(url.hostname),
    `the disposable host must be loopback, got ${url.hostname}`
  );
  assert.ok(
    url.port.length > 0,
    "the disposable URL needs an explicit host port"
  );
  assert.notEqual(url.port, FORBIDDEN_PORT, "port 5432 is reserved");
  assert.equal(
    url.port,
    TEST_HOST_PORT,
    "the URL port must equal the host port"
  );
  assert.notEqual(TEST_SERVER_PORT, "", "the server port must be declared");
  const database = decodeURIComponent(url.pathname.replace(/^\/+/u, ""));
  assert.equal(database, EXPECTED_DATABASE);
  assert.notEqual(database, FORBIDDEN_DATABASE);
  const role = decodeURIComponent(url.username);
  assert.equal(role, TEST_DATABASE_ROLE);
  assert.notEqual(role, FORBIDDEN_ROLE);
  assert.equal(TEST_ENVIRONMENT_ID, EXPECTED_ENVIRONMENT_ID);
  assert.equal(process.env.POSTGRES_URL?.trim(), TEST_DATABASE_URL);
  assert.equal(process.env.DATABASE_URL?.trim(), TEST_DATABASE_URL);
}

test(
  "the disposable target, environment identity and applied 0047 schema are verified",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const postgres = (await import("postgres")).default;
    const sql = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      const [identity] = await sql<
        { database: string; role: string; port: number; version: string }[]
      >`
        select current_database() as database,
               current_user as role,
               inet_server_port() as port,
               current_setting('server_version') as version
      `;
      assert.equal(identity.database, EXPECTED_DATABASE);
      assert.equal(identity.role, TEST_DATABASE_ROLE);
      assert.equal(String(identity.port), TEST_SERVER_PORT);
      assert.match(identity.version, /^17\./u);

      const [tables] = await sql<{ count: number }[]>`
        select count(*)::int as count
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'SchoolAdmissionCase',
            'SchoolAdmissionPreparation',
            'SchoolAdmissionOutcome',
            'SchoolAdmissionExternalAction',
            'SchoolAdmissionException',
            'SchoolAdmissionOperation',
            'SchoolAdmissionEvent'
          )
      `;
      assert.equal(tables.count, 7);
      const [triggers] = await sql<{ count: number }[]>`
        select count(*)::int as count
        from pg_trigger
        where not tgisinternal
          and tgname in (
            'SchoolAdmissionCase_guard',
            'SchoolAdmissionPreparation_guard',
            'SchoolAdmissionOutcome_guard',
            'SchoolAdmissionException_guard',
            'SchoolAdmissionExternalAction_append_only',
            'SchoolAdmissionOperation_append_only',
            'SchoolAdmissionEvent_append_only'
          )
      `;
      assert.equal(triggers.count, 7);
      const [indexes] = await sql<{ count: number }[]>`
        select count(*)::int as count
        from pg_indexes
        where schemaname = 'public'
          and indexname in (
            'SchoolAdmissionCase_project_application_unique',
            'SchoolAdmissionOutcome_current_unique',
            'SchoolAdmissionException_current_unique'
          )
      `;
      assert.equal(indexes.count, 3);
    } finally {
      await closePools(sql);
    }
  }
);

type Sql = import("postgres").Sql;

async function seedOwner(sql: Sql) {
  const email = `m52-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}@example.test`;
  const [user] = await sql<{ id: string }[]>`
    insert into "User" ("email", "password", "role")
    values (${email}, ${"x".repeat(64)}, 'user')
    returning "id"
  `;
  const [project] = await sql<{ id: string }[]>`
    insert into "StudyJourneyProject" ("ownerUserId", "status")
    values (${user.id}, 'active')
    returning "id"
  `;
  return { ownerUserId: user.id, projectId: project.id };
}

async function loadStore() {
  const { createPostgresSchoolAdmissionsStore } = await import(
    "./postgres-repository"
  );
  return createPostgresSchoolAdmissionsStore();
}

function newOperation(
  actorUserId: string,
  operationType:
    | "school_admission_case_create"
    | "school_admission_service_mode"
    | "school_admission_prepare"
    | "school_admission_confirm"
    | "school_admission_outcome_record"
    | "school_admission_outcome_transition"
    | "school_admission_external_action"
    | "school_admission_exception_claim",
  seed: string
) {
  return {
    actorUserId,
    operationId: `op-${crypto.randomUUID()}`,
    operationType,
    requestSha256: seed.repeat(64).slice(0, 64),
  };
}

async function openCase(
  sql: Sql,
  input: {
    originKind: "existing_offer" | "existing_coe" | "claimed_exception";
    courseTitle: string;
    institutionName: string;
  }
) {
  const { ownerUserId, projectId } = await seedOwner(sql);
  const store = await loadStore();
  const operation = newOperation(
    ownerUserId,
    "school_admission_case_create",
    "a"
  );
  const created = await store.createCase({
    applicationId: null,
    courseTitle: input.courseTitle,
    institutionName: input.institutionName,
    intakeLabel: null,
    operation,
    originKind: input.originKind,
    ownerUserId,
    projectId,
    serviceMode: "self_service",
  });
  return { created, operation, ownerUserId, projectId, store };
}

/** Closes the explicit test client(s) and the application's lazy pool. */
async function closePools(...clients: Sql[]) {
  for (const client of clients) {
    await client.end({ timeout: 5 });
  }
  const { closeLazyDatabase } = await import("@/lib/db/runtime-client");
  await closeLazyDatabase();
}

test(
  "a real case is created, replayed with its original operation id, and conflicted",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const postgres = (await import("postgres")).default;
    const sql = postgres(TEST_DATABASE_URL, { max: 2 });
    try {
      const { created, operation, ownerUserId, projectId, store } =
        await openCase(sql, {
          courseTitle: "Bachelor of Nursing",
          institutionName: "Example College",
          originKind: "existing_offer",
        });
      assert.equal(created.replayed, false);
      assert.equal(created.value.revision, 1);

      // The SAME operation identity, so this exercises real exact replay.
      const replay = await store.createCase({
        applicationId: null,
        courseTitle: "Bachelor of Nursing",
        institutionName: "Example College",
        intakeLabel: null,
        operation,
        originKind: "existing_offer",
        ownerUserId,
        projectId,
        serviceMode: "self_service",
      });
      assert.equal(replay.replayed, true);
      assert.equal(replay.value.id, created.value.id);

      // A changed request under the same operation id is a conflict. The store's
      // operation identity is the caller-computed request digest, so a genuinely
      // different request arrives with a different digest: the service derives
      // that digest from the authored fields (and raises `idempotency_conflict`
      // for a changed authored payload — covered offline in service.test.ts).
      await assert.rejects(
        store.createCase({
          applicationId: null,
          courseTitle: "Changed course",
          institutionName: "Example College",
          intakeLabel: null,
          operation: { ...operation, requestSha256: "b".repeat(64) },
          originKind: "existing_offer",
          ownerUserId,
          projectId,
          serviceMode: "self_service",
        }),
        (error: unknown) =>
          (error as { code?: string }).code === "idempotency_conflict"
      );

      const [cases] = await sql<{ count: number }[]>`
        select count(*)::int as count from "SchoolAdmissionCase"
        where "projectId" = ${projectId}
      `;
      assert.equal(cases.count, 1);
      const [operations] = await sql<{ count: number }[]>`
        select count(*)::int as count from "SchoolAdmissionOperation"
        where "actorUserId" = ${ownerUserId}
      `;
      assert.equal(operations.count, 1);
      const [events] = await sql<{ count: number }[]>`
        select count(*)::int as count from "SchoolAdmissionEvent"
        where "projectId" = ${projectId}
      `;
      assert.equal(events.count, 1);
    } finally {
      await closePools(sql);
    }
  }
);

test(
  "CAS admits one writer and audit history stays append-only",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const postgres = (await import("postgres")).default;
    const sql = postgres(TEST_DATABASE_URL, { max: 2 });
    try {
      const { created, ownerUserId, projectId, store } = await openCase(sql, {
        courseTitle: "Diploma of Business",
        institutionName: "CAS College",
        originKind: "existing_coe",
      });
      const mode = (seed: string) => ({
        caseId: created.value.id,
        expectedRevision: 1,
        operation: newOperation(
          ownerUserId,
          "school_admission_service_mode",
          seed
        ),
        ownerUserId,
        projectId,
        serviceMode: "managed_service" as const,
      });
      const results = await Promise.allSettled([
        store.updateServiceMode(mode("c")),
        store.updateServiceMode(mode("d")),
      ]);
      assert.equal(
        results.filter((entry) => entry.status === "fulfilled").length,
        1
      );
      assert.equal(
        results.filter((entry) => entry.status === "rejected").length,
        1
      );
      await assert.rejects(
        sql`update "SchoolAdmissionEvent" set "eventType" = 'school_admission_case_created'`,
        (error: unknown) => (error as { code?: string }).code === "23514"
      );
      await assert.rejects(
        sql`delete from "SchoolAdmissionOperation"`,
        (error: unknown) => (error as { code?: string }).code === "23514"
      );
    } finally {
      await closePools(sql);
    }
  }
);

test(
  "sequential Offer transitions and CoE upgrades respect the supersession protocol",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const postgres = (await import("postgres")).default;
    const sql = postgres(TEST_DATABASE_URL, { max: 2 });
    try {
      const { created, ownerUserId, projectId, store } = await openCase(sql, {
        courseTitle: "Bachelor of Design",
        institutionName: "Transition College",
        originKind: "existing_offer",
      });
      const recordOffer = (revision: number) =>
        store.recordOutcome({
          caseId: created.value.id,
          expectedRevision: revision,
          operation: newOperation(
            ownerUserId,
            "school_admission_outcome_record",
            "b"
          ),
          outcome: {
            decisionOn: null,
            evidenceReferenceId: null,
            evidenceReferenceSha256: null,
            evidenceReferenceVersion: null,
            expiresOn: "2027-01-31",
            kind: "offer",
            provenance: "customer_reported",
            receivedOn: "2026-10-01",
            state: "received",
            validFrom: null,
            validTo: null,
          },
          ownerUserId,
          projectId,
        });
      const offer = await recordOffer(1);
      const transition = (revision: number, outcomeId: string, state: string) =>
        store.transitionOutcome({
          caseId: created.value.id,
          decisionOn: "2026-11-02",
          expectedRevision: revision,
          operation: newOperation(
            ownerUserId,
            "school_admission_outcome_transition",
            "c"
          ),
          outcomeId,
          ownerUserId,
          projectId,
          state: state as "under_review" | "accepted" | "deferred",
        });
      // Three sequential transitions: each supersedes the live row BEFORE its
      // successor exists, so the immediate partial unique index never fails.
      const reviewed = await transition(2, offer.value.id, "under_review");
      const deferred = await transition(3, reviewed.value.id, "deferred");
      const accepted = await transition(4, deferred.value.id, "accepted");
      assert.equal(accepted.value.version, 4);
      assert.equal(accepted.value.state, "accepted");

      const [live] = await sql<{ count: number }[]>`
        select count(*)::int as count from "SchoolAdmissionOutcome"
        where "caseId" = ${created.value.id} and "supersededById" is null
      `;
      assert.equal(live.count, 1);
      const [rows] = await sql<{ count: number }[]>`
        select count(*)::int as count from "SchoolAdmissionOutcome"
        where "caseId" = ${created.value.id}
      `;
      assert.equal(rows.count, 4);
    } finally {
      await closePools(sql);
    }
  }
);

test(
  "repeated exception claims and denied verification are recorded honestly",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const postgres = (await import("postgres")).default;
    const sql = postgres(TEST_DATABASE_URL, { max: 2 });
    try {
      const { created, ownerUserId, projectId, store } = await openCase(sql, {
        courseTitle: "Diploma of Business",
        institutionName: "Exception College",
        originKind: "claimed_exception",
      });
      const claim = (revision: number, description: string) =>
        store.recordException({
          caseId: created.value.id,
          claim: {
            authorityReference: null,
            claimKind: "school_application_exception",
            description,
            state: "claimed",
          },
          expectedRevision: revision,
          operation: newOperation(
            ownerUserId,
            "school_admission_exception_claim",
            "f"
          ),
          ownerUserId,
          projectId,
        });
      await claim(1, "First claim.");
      const second = await claim(2, "Second claim.");
      assert.equal(second.value.version, 2);
      const [live] = await sql<{ count: number }[]>`
        select count(*)::int as count from "SchoolAdmissionException"
        where "caseId" = ${created.value.id} and "supersededById" is null
      `;
      assert.equal(live.count, 1);
      const [history] = await sql<{ count: number }[]>`
        select count(*)::int as count from "SchoolAdmissionException"
        where "caseId" = ${created.value.id}
      `;
      assert.equal(history.count, 2);

      // A denied verification denies through the SERVICE contract, not through an
      // unrelated unique-index failure. Production wires the unavailable
      // verification port, so the authority answer is a refusal and the exception
      // must stay claimed with no authority decision persisted.
      const [{ createSchoolAdmissionsService }, productionPorts] =
        await Promise.all([import("./service"), import("./ports")]);
      const service = createSchoolAdmissionsService({
        applicationPort: {
          list: async () => ({ status: "unavailable" as const }),
          load: async () => ({ status: "unavailable" as const }),
        },
        documentPort: productionPorts.unavailableSchoolAdmissionsDocumentPort,
        draftingPort: productionPorts.disabledSchoolAdmissionsDraftingPort,
        educationPort: {
          resolve: async () => ({ status: "unavailable" as const }),
        },
        evidencePort: {
          conflictState: async () => "unavailable" as const,
          resolve: async () => ({ status: "unavailable" as const }),
        },
        managedPort: productionPorts.unavailableSchoolAdmissionsManagedPort,
        store,
        verificationPort:
          productionPorts.unavailableSchoolAdmissionsVerificationPort,
      });
      const [current] = await sql<{ id: string; state: string }[]>`
        select "id", "state" from "SchoolAdmissionException"
        where "caseId" = ${created.value.id} and "supersededById" is null
      `;
      await assert.rejects(
        service.requestExceptionVerification({
          actorUserId: ownerUserId,
          caseId: created.value.id,
          exceptionId: (current as { id: string }).id,
          expectedRevision: 3,
          operationId: `op-${crypto.randomUUID()}`,
          projectId,
        }),
        (error: unknown) =>
          (error as { code?: string }).code === "authority_unavailable"
      );
      const [stillClaimed] = await sql<
        { authorityReference: string | null; state: string }[]
      >`
        select "state", "authorityReference" from "SchoolAdmissionException"
        where "caseId" = ${created.value.id} and "supersededById" is null
      `;
      assert.equal(
        (stillClaimed as { state: string }).state,
        "claimed",
        "an unavailable authority can never produce a verified exception"
      );
      assert.equal(
        (stillClaimed as { authorityReference: string | null })
          .authorityReference,
        null
      );
      const [denied] = await sql<{ count: number }[]>`
        select count(*)::int as count from "SchoolAdmissionException"
        where "caseId" = ${created.value.id}
          and "state" in ('verified', 'rejected')
      `;
      assert.equal((denied as { count: number }).count, 0);

      // Table integrity (not authorization): a verified/rejected row without an
      // authority decision violates the decision CHECK. This case has no live
      // exception, so it cannot collide with the current-exception unique index.
      const other = await store.createCase({
        applicationId: null,
        courseTitle: "Diploma of Business",
        institutionName: "Exception College",
        intakeLabel: null,
        operation: newOperation(
          ownerUserId,
          "school_admission_case_create",
          "e"
        ),
        originKind: "claimed_exception",
        ownerUserId,
        projectId,
        serviceMode: "self_service",
      });
      await assert.rejects(
        sql`
          insert into "SchoolAdmissionException" (
            "caseId", "projectId", "claimKind", "version", "state",
            "description", "authorityReference", "decidedByUserId", "decidedAt",
            "reportedByUserId", "operationId", "requestSha256"
          ) values (
            ${other.value.id}, ${projectId}, 'school_application_exception', 1,
            'verified', 'undecided', null, null, null,
            ${ownerUserId}, ${`op-${crypto.randomUUID()}`}, ${"a".repeat(64)}
          )
        `,
        (error: unknown) => {
          const failure = error as { code?: string; constraint_name?: string };
          assert.equal(failure.code, "23514");
          assert.equal(
            failure.constraint_name,
            "SchoolAdmissionException_decision_check"
          );
          return true;
        }
      );
    } finally {
      await closePools(sql);
    }
  }
);

test(
  "preparation reconfirmation advances forward and keeps both confirmations",
  { skip: skipReason },
  async () => {
    assertDisposableTarget();
    const postgres = (await import("postgres")).default;
    const sql = postgres(TEST_DATABASE_URL, { max: 2 });
    try {
      const { created, ownerUserId, projectId, store } = await openCase(sql, {
        courseTitle: "Master of Teaching",
        institutionName: "Reconfirm College",
        originKind: "existing_offer",
      });
      const prepare = (revision: number, seed: string) =>
        store.recordPreparation({
          caseId: created.value.id,
          expectedRevision: revision,
          operation: newOperation(
            ownerUserId,
            "school_admission_prepare",
            seed
          ),
          ownerUserId,
          preparation: {
            applicationRevision: null,
            assistKind: "disabled",
            caseRevision: revision,
            contentSha256: seed.repeat(64).slice(0, 64),
            inputsSha256: seed.repeat(64).slice(0, 64),
            packageContentSha256: null,
            packageId: null,
            requirements: [
              {
                appliesTo: "both",
                code: "application_target_complete",
                required: true,
                sourceKinds: ["customer_input"],
                status: "satisfied",
                uncertaintyCodes: [],
              },
            ],
            schemaVersion: "phase13.school-admissions-preparation.v1",
            sections: [
              {
                code: "application_summary",
                sources: ["customer_input"],
                text: "Provisional draft.",
                uncertaintyCodes: ["draft_is_provisional"],
              },
            ],
            serviceMode: "self_service",
            sourceDigest: seed.repeat(64).slice(0, 64),
          },
          projectId,
        });
      const confirm = (revision: number, preparationId: string) =>
        store.confirmPreparation({
          caseId: created.value.id,
          expectedRevision: revision,
          operation: newOperation(ownerUserId, "school_admission_confirm", "9"),
          ownerUserId,
          preparationId,
          projectId,
        });
      const v1 = await prepare(1, "1");
      await confirm(2, v1.value.id);
      const v2 = await prepare(3, "2");
      const confirmedV2 = await confirm(4, v2.value.id);
      assert.equal(confirmedV2.value.version, 2);
      const [caseRow] = await sql<{ confirmed: number }[]>`
        select "confirmedPreparationVersion" as confirmed
        from "SchoolAdmissionCase" where "id" = ${created.value.id}
      `;
      assert.equal(caseRow.confirmed, 2);
      const [confirmedCount] = await sql<{ count: number }[]>`
        select count(*)::int as count from "SchoolAdmissionPreparation"
        where "caseId" = ${created.value.id} and "confirmedAt" is not null
      `;
      assert.equal(confirmedCount.count, 2);
      // A backward confirmation is refused by the forward-only guard.
      await assert.rejects(
        sql`
          update "SchoolAdmissionCase"
          set "confirmedPreparationVersion" = 1,
              "revision" = "revision" + 1,
              "updatedAt" = now()
          where "id" = ${created.value.id}
        `,
        (error: unknown) => {
          const failure = error as {
            code?: string;
            constraint_name?: string;
            message?: string;
          };
          assert.equal(failure.code, "23514");
          assert.match(
            String(failure.message),
            /Preparation confirmation may only advance to a newer version/u
          );
          return true;
        }
      );
      // Clearing a settled confirmation back to "unconfirmed" is refused too.
      await assert.rejects(
        sql`
          update "SchoolAdmissionCase"
          set "confirmedPreparationVersion" = null,
              "revision" = "revision" + 1,
              "updatedAt" = now()
          where "id" = ${created.value.id}
        `,
        (error: unknown) => {
          const failure = error as { code?: string; message?: string };
          assert.equal(failure.code, "23514");
          assert.match(
            String(failure.message),
            /Preparation confirmation may only advance to a newer version/u
          );
          return true;
        }
      );
      // The confirmation pointer and both confirmed versions survived untouched.
      const [afterAttempts] = await sql<{ confirmed: number }[]>`
        select "confirmedPreparationVersion" as confirmed
        from "SchoolAdmissionCase" where "id" = ${created.value.id}
      `;
      assert.equal((afterAttempts as { confirmed: number }).confirmed, 2);
    } finally {
      await closePools(sql);
    }
  }
);
