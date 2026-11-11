/**
 * Phase 14-B — focused real-PostgreSQL acceptance test (owner-authorized, 2026-11-11).
 *
 * Target: the isolated, owner-created and pre-migrated database
 * `immigration_ai_phase14_b_test`, reached ONLY through the approved Unix socket
 * /var/run/postgresql/.s.PGSQL.5432 as database user `rico` (no TCP, no fallback).
 * `POSTGRES_URL` / `.env.local` are deliberately never read; the connection below is
 * hard-coded to the approved target so an unsafe environment cannot redirect it.
 *
 * Scope: T1 CAS revision · T2 idempotent replay after a changed revision ·
 * T3 correction (incl. recoverable partial correction) · T4 publication + separate AI-use
 * grants + revocation · T5 project/actor isolation + evidence fail-closed.
 * It exercises the real `PostgresProjectFactRepository` over real Drizzle/PostgreSQL
 * transactions. No migration, TRUNCATE, DROP or production service is touched, and only
 * the synthetic rows created by this run are deleted (FK-safe order).
 *
 * Execution:
 *   cd chatbot && node --conditions=react-server --import tsx scripts/phase14-b-postgres-acceptance.ts
 *
 * Success marker: PHASE14_B_POSTGRES_ACCEPTANCE_PASS (exit 0)
 * Failure marker:  PHASE14_B_POSTGRES_ACCEPTANCE_FAIL (exit 1)
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  projectEvent,
  projectFactAssertion,
  projectFactAssertionEvent,
  projectFactAssertionEvidence,
  projectFactConflict,
  projectFactPublication,
  projectFactUseGrant,
  projectOperation,
  studyJourneyProject,
  user as userTable,
} from "@/lib/db/schema";
import { createProjectFactManagementService } from "@/lib/project-facts/facts";
import { PostgresProjectFactRepository } from "@/lib/project-facts/postgres-repository";
import { createProjectFactReviewService } from "@/lib/project-facts/review";

const SOCKET_PATH = "/var/run/postgresql/.s.PGSQL.5432";
const DATABASE_NAME = "immigration_ai_phase14_b_test";
const DATABASE_USER = "rico";
const LEDGER_REQUIRED_ROWS = 54;

function check(condition: boolean, detail: string): void {
  if (!condition) {
    throw new Error(`check_failed: ${detail}`);
  }
}

async function expectErrorCode(
  expected: string,
  run: () => Promise<unknown>
): Promise<string> {
  try {
    await run();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code !== expected) {
      throw new Error(
        `expected_failure_mismatch: expected ${expected}, got ${String(code)}`
      );
    }
    return expected;
  }
  throw new Error(`expected_failure_not_thrown: ${expected}`);
}

function valueNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : -1;
}

function valueText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

async function main(): Promise<void> {
  if (!existsSync(SOCKET_PATH)) {
    throw new Error(`approved_socket_missing: ${SOCKET_PATH}`);
  }
  const client = postgres({
    path: SOCKET_PATH,
    database: DATABASE_NAME,
    username: DATABASE_USER,
    max: 1,
    connect_timeout: 5,
    idle_timeout: 1,
  });
  const database = drizzle(client);

  const ids = {
    userA: randomUUID(),
    userB: randomUUID(),
    userC: randomUUID(),
    projectA: randomUUID(),
    projectB: randomUUID(),
  };
  /**
   * Migrations 0035/0037 deliberately make Project Fact publications, grants, assertion
   * events and assertion identity append-only/immutable: DELETEs raise guard exceptions
   * (SQLSTATE 23514) and retained rows then FK-protect their projects and users (23503).
   * The test never weakens those guards and never truncates or drops anything: it deletes
   * everything the schema allows, records exactly which guard retained each table, and
   * proves the remaining residue sits strictly inside this run's synthetic ids in the
   * owner's disposable isolated database (lifecycle beyond that stays with the owner).
   */
  const retainedRows: string[] = [];
  const attemptDelete = async (
    label: string,
    run: () => Promise<unknown>
  ): Promise<void> => {
    try {
      await run();
    } catch (error) {
      const code = valueText((error as { code?: unknown }).code);
      if (code === "23514" || code === "23503") {
        const constraint = valueText(
          (error as { constraint?: unknown }).constraint
        );
        retainedRows.push(`${label}(${constraint === "" ? code : constraint})`);
        return;
      }
      throw error;
    }
  };
  const cleanupIfNeeded = async () => {
    retainedRows.length = 0;
    const projectIds = [ids.projectA, ids.projectB];
    const userIds = [ids.userA, ids.userB, ids.userC];
    // FK-safe order; scoped strictly to the synthetic ids of this run.
    await attemptDelete("ProjectFactUseGrant", () =>
      database
        .delete(projectFactUseGrant)
        .where(inArray(projectFactUseGrant.projectId, projectIds))
    );
    await attemptDelete("ProjectFactPublication", () =>
      database
        .delete(projectFactPublication)
        .where(inArray(projectFactPublication.projectId, projectIds))
    );
    await attemptDelete("ProjectFactConflict", () =>
      database
        .delete(projectFactConflict)
        .where(inArray(projectFactConflict.projectId, projectIds))
    );
    await attemptDelete("ProjectFactAssertionEvent", () =>
      database
        .delete(projectFactAssertionEvent)
        .where(inArray(projectFactAssertionEvent.projectId, projectIds))
    );
    await attemptDelete("ProjectFactAssertionEvidence", () =>
      database
        .delete(projectFactAssertionEvidence)
        .where(inArray(projectFactAssertionEvidence.projectId, projectIds))
    );
    await attemptDelete("ProjectFactAssertion", () =>
      database
        .delete(projectFactAssertion)
        .where(inArray(projectFactAssertion.projectId, projectIds))
    );
    await attemptDelete("ProjectEvent", () =>
      database
        .delete(projectEvent)
        .where(inArray(projectEvent.projectId, projectIds))
    );
    await attemptDelete("ProjectOperation", () =>
      database
        .delete(projectOperation)
        .where(
          and(
            inArray(projectOperation.actorUserId, userIds),
            eq(projectOperation.operationType, "project_fact_mutation")
          )
        )
    );
    await attemptDelete("StudyJourneyProject", () =>
      database
        .delete(studyJourneyProject)
        .where(inArray(studyJourneyProject.id, projectIds))
    );
    await attemptDelete("User", () =>
      database.delete(userTable).where(inArray(userTable.id, userIds))
    );
  };
  const scopedCounts = async () => {
    const [row] = await client`
      select
        (select count(*)::int from "ProjectFactAssertion" where "projectId" in (${ids.projectA}, ${ids.projectB})) as fact_assertion,
        (select count(*)::int from "ProjectFactAssertionEvent" where "projectId" in (${ids.projectA}, ${ids.projectB})) as fact_event,
        (select count(*)::int from "ProjectFactAssertionEvidence" where "projectId" in (${ids.projectA}, ${ids.projectB})) as fact_evidence,
        (select count(*)::int from "ProjectFactConflict" where "projectId" in (${ids.projectA}, ${ids.projectB})) as fact_conflict,
        (select count(*)::int from "ProjectFactPublication" where "projectId" in (${ids.projectA}, ${ids.projectB})) as fact_publication,
        (select count(*)::int from "ProjectFactUseGrant" where "projectId" in (${ids.projectA}, ${ids.projectB})) as fact_use_grant,
        (select count(*)::int from "ProjectEvent" where "projectId" in (${ids.projectA}, ${ids.projectB})) as project_event,
        (select count(*)::int from "ProjectOperation" where "actorUserId" in (${ids.userA}, ${ids.userB}, ${ids.userC})) as project_operation,
        (select count(*)::int from "StudyJourneyProject" where "id" in (${ids.projectA}, ${ids.projectB})) as project,
        (select count(*)::int from "User" where "id" in (${ids.userA}, ${ids.userB}, ${ids.userC})) as "user"
    `;
    return {
      fact_assertion: valueNumber(row?.fact_assertion),
      fact_event: valueNumber(row?.fact_event),
      fact_evidence: valueNumber(row?.fact_evidence),
      fact_conflict: valueNumber(row?.fact_conflict),
      fact_publication: valueNumber(row?.fact_publication),
      fact_use_grant: valueNumber(row?.fact_use_grant),
      project_event: valueNumber(row?.project_event),
      project_operation: valueNumber(row?.project_operation),
      project: valueNumber(row?.project),
      user: valueNumber(row?.user),
    };
  };

  try {
    // ---------- 0. Identity gate: verify BEFORE anything is written ----------
    const [identityRow] = await client`
      select current_database() as database,
             current_user as db_user,
             current_setting('port') as port,
             version() as server_version,
             (select a.client_addr::text from pg_stat_activity a
               where a.pid = pg_backend_pid()) as client_addr
    `;
    const identity = {
      database: valueText(identityRow?.database),
      dbUser: valueText(identityRow?.db_user),
      port: valueText(identityRow?.port),
      serverVersion: valueText(identityRow?.server_version),
      clientAddr:
        identityRow?.client_addr === null ||
        identityRow?.client_addr === undefined
          ? null
          : valueText(identityRow?.client_addr),
    };
    check(
      identity.database === DATABASE_NAME,
      `current_database must be ${DATABASE_NAME} (got ${identity.database})`
    );
    check(
      identity.dbUser === DATABASE_USER,
      `current_user must be ${DATABASE_USER} (got ${identity.dbUser})`
    );
    check(
      identity.port === "5432",
      `server port must be 5432 (got ${identity.port})`
    );
    check(
      identity.clientAddr === null,
      `connection must use the Unix domain socket, not TCP (client_addr=${identity.clientAddr})`
    );
    const versionMatch = /PostgreSQL (17\.\d+)/u.exec(identity.serverVersion);
    check(
      Boolean(versionMatch),
      `server version must be PostgreSQL 17.x (got ${identity.serverVersion})`
    );
    const [ledgerRow] = await client`
      select count(*)::int as rows from drizzle.__drizzle_migrations
    `;
    const ledgerRows = valueNumber(ledgerRow?.rows);
    check(
      ledgerRows === LEDGER_REQUIRED_ROWS,
      `migration ledger must have ${String(LEDGER_REQUIRED_ROWS)} entries (got ${String(ledgerRows)})`
    );
    const [latestLedgerRow] = await client`
      select hash, created_at from drizzle.__drizzle_migrations order by id desc limit 1
    `;
    const latestLedgerAt =
      latestLedgerRow?.created_at instanceof Date
        ? latestLedgerRow.created_at.toISOString()
        : valueText(latestLedgerRow?.created_at);
    console.log(
      `[IDENTITY PASS] database=${identity.database} user=${identity.dbUser} socket=${SOCKET_PATH} port=${identity.port} peer=null server=${versionMatch?.[1]} ledger=${String(ledgerRows)}/${String(LEDGER_REQUIRED_ROWS)} latest_hash=${valueText(latestLedgerRow?.hash)} latest_at=${latestLedgerAt}`
    );

    // ---------- baseline residue counters (proof of no unrelated writes) ----------
    const snapshotCounts = async () => {
      const [row] = await client`
        select
          (select count(*)::int from "ProjectFactAssertion") as fact_assertion,
          (select count(*)::int from "ProjectFactAssertionEvent") as fact_event,
          (select count(*)::int from "ProjectFactAssertionEvidence") as fact_evidence,
          (select count(*)::int from "ProjectFactConflict") as fact_conflict,
          (select count(*)::int from "ProjectFactPublication") as fact_publication,
          (select count(*)::int from "ProjectFactUseGrant") as fact_use_grant,
          (select count(*)::int from "ProjectEvent") as project_event,
          (select count(*)::int from "ProjectOperation") as project_operation,
          (select count(*)::int from "StudyJourneyProject") as project,
          (select count(*)::int from "User") as "user"
      `;
      return {
        fact_assertion: valueNumber(row?.fact_assertion),
        fact_event: valueNumber(row?.fact_event),
        fact_evidence: valueNumber(row?.fact_evidence),
        fact_conflict: valueNumber(row?.fact_conflict),
        fact_publication: valueNumber(row?.fact_publication),
        fact_use_grant: valueNumber(row?.fact_use_grant),
        project_event: valueNumber(row?.project_event),
        project_operation: valueNumber(row?.project_operation),
        project: valueNumber(row?.project),
        user: valueNumber(row?.user),
      };
    };
    const baseline = await snapshotCounts();

    // ---------- 0b. Defensive seed precondition: my ids must not exist ----------
    const [existingRow] = await client`
      select
        (select count(*)::int from "User" where id in (${ids.userA}, ${ids.userB}, ${ids.userC})) as users,
        (select count(*)::int from "StudyJourneyProject" where id in (${ids.projectA}, ${ids.projectB})) as projects
    `;
    check(
      valueNumber(existingRow?.users) === 0 &&
        valueNumber(existingRow?.projects) === 0,
      "synthetic ids must not pre-exist"
    );

    await database.insert(userTable).values([
      {
        id: ids.userA,
        email: `phase14b.a.${randomUUID().slice(0, 8)}@test.invalid`,
        role: "user",
      },
      {
        id: ids.userB,
        email: `phase14b.b.${randomUUID().slice(0, 8)}@test.invalid`,
        role: "user",
      },
      {
        id: ids.userC,
        email: `phase14b.c.${randomUUID().slice(0, 8)}@test.invalid`,
        role: "lawyer",
      },
    ]);
    await database.insert(studyJourneyProject).values([
      {
        id: ids.projectA,
        ownerUserId: ids.userA,
        status: "active",
        revision: 1,
      },
      {
        id: ids.projectB,
        ownerUserId: ids.userB,
        status: "active",
        revision: 1,
      },
    ]);
    console.log(
      "[SEED PASS] synthetic users + projects A/B created (isolated database)"
    );

    // ---------- composition: real repository, real transactions ----------
    // No evidence verifier is composed anywhere in this test: production has no approved
    // authenticated-scan attestation provider, so document-derived facts must FAIL CLOSED.
    const repository = new PostgresProjectFactRepository(database);
    const facts = createProjectFactManagementService({ repository });
    const revisionOf = async (projectId: string): Promise<number> => {
      const [row] = await database
        .select({ revision: studyJourneyProject.revision })
        .from(studyJourneyProject)
        .where(eq(studyJourneyProject.id, projectId));
      return row?.revision ?? -1;
    };
    const review = createProjectFactReviewService({
      facts,
      readProjectRevision: async ({ projectId }) => revisionOf(projectId),
      readFactState: async ({ actorUserId, projectId, assertionId }) => {
        const projection = await facts.stableProjection({
          actorUserId,
          projectId,
        });
        const row = [
          ...projection.unresolvedCandidates,
          ...projection.authorizedForAI,
        ].find((entry) => entry.id === assertionId);
        return row ? { state: row.state, version: row.version } : null;
      },
    });

    const eventKinds = async (assertionId: string): Promise<string> => {
      const rows = await database
        .select({ kind: projectFactAssertionEvent.eventKind })
        .from(projectFactAssertionEvent)
        .where(eq(projectFactAssertionEvent.assertionId, assertionId));
      return rows
        .map((row) => row.kind)
        .sort()
        .join(",");
    };
    const operationInfo = async (actorUserId: string, operationId: string) => {
      const rows = await database
        .select({
          hash: projectOperation.requestHash,
          resultId: projectOperation.resultId,
        })
        .from(projectOperation)
        .where(
          and(
            eq(projectOperation.actorUserId, actorUserId),
            eq(projectOperation.operationId, operationId)
          )
        );
      return rows;
    };
    const keyAssertionCount = async (
      projectId: string,
      key: string
    ): Promise<number> => {
      const rows = await database
        .select({ id: projectFactAssertion.id })
        .from(projectFactAssertion)
        .where(
          and(
            eq(projectFactAssertion.projectId, projectId),
            eq(projectFactAssertion.key, key)
          )
        );
      return rows.length;
    };
    const assertionRow = async (assertionId: string) => {
      const [row] = await database
        .select()
        .from(projectFactAssertion)
        .where(eq(projectFactAssertion.id, assertionId));
      return row;
    };

    const P1 = ids.projectA;
    const A = ids.userA;
    const B = ids.userB;
    const baseFact = {
      actorUserId: "",
      projectId: "",
      operationId: "",
      expectedProjectRevision: 1,
      key: "",
      valueType: "string" as const,
      value: "",
      originKind: "customer_stated" as const,
      sourceEvidenceRef: null,
      effectiveFrom: null,
      effectiveTo: null,
      observedAt: null,
      supersedesAssertionId: null,
    };

    // ---------- T1: CAS revision ----------
    const t1Start = await revisionOf(P1);
    check(
      t1Start === 1,
      `T1 start revision must be 1 (got ${String(t1Start)})`
    );
    const factA = await repository.createCandidate({
      ...baseFact,
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t1.propose-a",
      expectedProjectRevision: t1Start,
      key: "p14b.t1.a",
      value: "Bachelor of Nursing",
    });
    check(
      (await revisionOf(P1)) === t1Start + 1,
      "T1 revision must advance exactly once per successful mutation (propose a)"
    );
    await expectErrorCode("revision_conflict", () =>
      repository.createCandidate({
        ...baseFact,
        actorUserId: A,
        projectId: P1,
        operationId: "p14b.t1.stale-a",
        expectedProjectRevision: t1Start,
        key: "p14b.t1.stale",
        value: "Stale",
      })
    );
    check(
      (await revisionOf(P1)) === t1Start + 1,
      "T1 failed (stale) mutation must not advance the revision"
    );
    const confirmedA = await repository.transition({
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t1.confirm-a",
      expectedProjectRevision: t1Start + 1,
      assertionId: factA.id,
      assertionVersion: factA.version,
      to: "customer_confirmed",
    });
    check(
      confirmedA.state === "customer_confirmed",
      "T1 confirm-a state must be customer_confirmed"
    );
    if (confirmedA.version !== 1) {
      throw new Error(
        `T1 unexpected version bump: SQL transition returned version ${String(confirmedA.version)}`
      );
    }
    console.log(
      `[DIVERGENCE OBSERVED D-1] real SQL transition does NOT increment ProjectFactAssertion.version (confirm-a returned version=${String(confirmedA.version)}); the offline strict simulator increments to 2. Recorded, not auto-fixed.`
    );
    factA.version = confirmedA.version;
    check(
      (await revisionOf(P1)) === t1Start + 2,
      "T1 revision must advance exactly once per confirmation (confirm a)"
    );
    await expectErrorCode("revision_conflict", () =>
      repository.transition({
        actorUserId: A,
        projectId: P1,
        operationId: "p14b.t1.stale-confirm-a",
        expectedProjectRevision: t1Start,
        assertionId: factA.id,
        assertionVersion: factA.version,
        to: "customer_confirmed",
      })
    );
    console.log(
      "[DIVERGENCE OBSERVED D-2] real SQL rejects a second confirm (already customer_confirmed) with code revision_conflict; the strict simulator uses state_conflict. Recorded, not auto-fixed."
    );
    const factB = await repository.createCandidate({
      ...baseFact,
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t1.propose-b",
      expectedProjectRevision: t1Start + 2,
      key: "p14b.t1.b",
      value: "Bachelor of Laws",
    });
    const confirmedB = await repository.transition({
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t1.confirm-b",
      expectedProjectRevision: t1Start + 3,
      assertionId: factB.id,
      assertionVersion: factB.version,
      to: "customer_confirmed",
    });
    check(
      confirmedB.state === "customer_confirmed" &&
        (await revisionOf(P1)) === t1Start + 4,
      "T1 sequential confirm of b must reach revision start+4"
    );
    console.log(
      `[T1 CAS_REVISION PASS] revision ladder 1->${String(await revisionOf(P1))} with exactly one increment per mutation; stale propose and stale confirm rejected with revision_conflict`
    );

    // ---------- T2: idempotent replay after a changed revision ----------
    const t2Start = await revisionOf(P1);
    const factC = await repository.createCandidate({
      ...baseFact,
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t2.propose-c",
      expectedProjectRevision: t2Start,
      key: "p14b.t2.c",
      value: "Sydney",
    });
    const factD = await repository.createCandidate({
      ...baseFact,
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t2.advance-d",
      expectedProjectRevision: t2Start + 1,
      key: "p14b.t2.d",
      value: "Bachelor of IT",
    });
    check(
      (await revisionOf(P1)) === t2Start + 2,
      "T2 advance-d must move revision to start+2"
    );
    check(
      factD.state === "proposed",
      "T2 the revision-advancing operation must itself persist as a proposed fact"
    );
    const originalOperation = (await operationInfo(A, "p14b.t2.propose-c"))[0];
    check(Boolean(originalOperation), "T2 propose-c operation row must exist");
    const replayed = await repository.createCandidate({
      ...baseFact,
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t2.propose-c",
      expectedProjectRevision: t2Start + 2,
      key: "p14b.t2.c",
      value: "Sydney",
    });
    check(
      replayed.id === factC.id && replayed.version === factC.version,
      "T2 retry with CHANGED revision must replay the original result (same assertion id/version)"
    );
    check(
      (await revisionOf(P1)) === t2Start + 2,
      "T2 replay must not advance the revision"
    );
    const replayRows = await operationInfo(A, "p14b.t2.propose-c");
    check(
      replayRows.length === 1 &&
        replayRows[0]?.hash === originalOperation?.hash,
      "T2 replay must leave exactly one operation row with an unchanged request hash"
    );
    check(
      (await eventKinds(factC.id)) === "proposed",
      "T2 replay must not duplicate assertion events"
    );
    const projectEventsForC = await database
      .select({ id: projectEvent.id })
      .from(projectEvent)
      .where(eq(projectEvent.subjectId, factC.id));
    check(
      projectEventsForC.length === 1,
      "T2 replay must not duplicate ProjectEvent rows"
    );
    check(
      (await keyAssertionCount(P1, "p14b.t2.c")) === 1,
      "T2 replay must not duplicate the assertion row"
    );
    await expectErrorCode("operation_conflict", () =>
      repository.createCandidate({
        ...baseFact,
        actorUserId: A,
        projectId: P1,
        operationId: "p14b.t2.propose-c",
        expectedProjectRevision: t2Start + 2,
        key: "p14b.t2.c",
        value: "Melbourne",
      })
    );
    check(
      (await revisionOf(P1)) === t2Start + 2 &&
        (await keyAssertionCount(P1, "p14b.t2.c")) === 1,
      "T2 different payload under the same operation id must be rejected without writes"
    );
    console.log(
      `[T2 IDEMPOTENT_REPLAY PASS] retry of op p14b.t2.propose-c with revision ${String(t2Start)}->${String(t2Start + 2)} replayed the stored outcome; one operation row (hash ${String(originalOperation?.hash.slice(0, 12))}…), one assertion, one audit event, one project event; different payload -> operation_conflict`
    );

    // ---------- T3: correction, history, recoverable partial correction ----------
    const t3Start = await revisionOf(P1);
    const confirmedC = await repository.transition({
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t3.confirm-c",
      expectedProjectRevision: t3Start,
      assertionId: factC.id,
      assertionVersion: factC.version,
      to: "customer_confirmed",
    });
    check(
      confirmedC.state === "customer_confirmed" &&
        (await eventKinds(factC.id)) === "confirmed,proposed",
      "T3 confirm-c must be recorded"
    );
    // Simulate a crashed correction: the supersede half committed, the create half did not.
    await repository.transition({
      actorUserId: A,
      projectId: P1,
      operationId: `p14b.t3c:correct-supersede-${factC.id}`,
      expectedProjectRevision: t3Start + 1,
      assertionId: factC.id,
      assertionVersion: factC.version,
      to: "superseded",
    });
    const supersededRow = await assertionRow(factC.id);
    check(
      supersededRow?.state === "superseded" &&
        (await revisionOf(P1)) === t3Start + 2,
      "T3 crashed-supersede must leave the original superseded and the revision advanced"
    );
    const corrected = await review.correct({
      actor: {
        actorUserId: A,
        projectId: P1,
        expectedProjectRevision: t3Start + 2,
      },
      operationId: "p14b.t3c",
      item: { assertionId: factC.id, assertionVersion: factC.version },
      key: "p14b.t2.c",
      valueType: "string",
      value: "Dentistry",
    });
    check(
      corrected.status === "corrected",
      `T3 recovery must complete with 'corrected' (got ${String(corrected.status)} code=${String(corrected.code)})`
    );
    check(
      corrected.created?.state === "proposed" &&
        corrected.created?.supersedesAssertionId === factC.id &&
        corrected.created?.originKind === "customer_stated",
      "T3 replacement must be a proposed customer_stated assertion pointing at the original"
    );
    check(
      corrected.superseded?.state === "superseded",
      "T3 reported supersession must reflect the observed state"
    );
    check(
      (await revisionOf(P1)) === t3Start + 3,
      "T3 recovery must perform exactly one new write (the replacement) — supersede replayed"
    );
    check(
      (await eventKinds(factC.id)) === "confirmed,proposed,superseded",
      "T3 original must keep its full history (proposed, confirmed, superseded) with no duplicates"
    );
    check(
      (await eventKinds(corrected.created?.id ?? "")) === "proposed",
      "T3 replacement must have exactly one audit event"
    );
    const postCorrectProjection = await facts.stableProjection({
      actorUserId: A,
      projectId: P1,
    });
    check(
      postCorrectProjection.authorizedForAI.length === 0,
      "T3 correction must not auto-confirm, auto-publish or auto-AI-authorize anything"
    );
    const t3PublicationRows = await database
      .select({ id: projectFactPublication.id })
      .from(projectFactPublication)
      .where(
        inArray(projectFactPublication.assertionId, [
          factC.id,
          corrected.created?.id ?? "",
        ])
      );
    const t3GrantRows = await database
      .select({ id: projectFactUseGrant.id })
      .from(projectFactUseGrant)
      .where(
        inArray(projectFactUseGrant.assertionId, [
          factC.id,
          corrected.created?.id ?? "",
        ])
      );
    check(
      t3PublicationRows.length === 0 && t3GrantRows.length === 0,
      "T3 correction must create no publication or AI-use grant rows"
    );
    // Full correction replay across "another request": same operation id is fully idempotent.
    const correctedAgain = await review.correct({
      actor: {
        actorUserId: A,
        projectId: P1,
        expectedProjectRevision: t3Start + 3,
      },
      operationId: "p14b.t3c",
      item: { assertionId: factC.id, assertionVersion: factC.version },
      key: "p14b.t2.c",
      valueType: "string",
      value: "Dentistry",
    });
    check(
      correctedAgain.status === "corrected" &&
        correctedAgain.created?.id === corrected.created?.id,
      "T3 full correction replay must return the same replacement"
    );
    check(
      (await revisionOf(P1)) === t3Start + 3 &&
        (await operationInfo(A, "p14b.t3c:correct-create")).length === 1,
      "T3 full correction replay must not create duplicates (one operation row, no revision bump)"
    );
    check(
      (await keyAssertionCount(P1, "p14b.t2.c")) === 2,
      "T3 history: exactly the original (superseded) + the replacement remain"
    );
    // A failure BEFORE supersession must report failed_before_supersession, original untouched.
    const beforeWrongVersion = await revisionOf(P1);
    const wrongVersion = await review.correct({
      actor: {
        actorUserId: A,
        projectId: P1,
        expectedProjectRevision: beforeWrongVersion,
      },
      operationId: "p14b.t3b",
      item: { assertionId: factB.id, assertionVersion: 999 },
      key: "p14b.t1.b",
      valueType: "string",
      value: "Should never be written",
    });
    check(
      wrongVersion.status === "failed_before_supersession" &&
        wrongVersion.superseded === null &&
        wrongVersion.created === null,
      `T3 un-supersedeable item must report failed_before_supersession (got ${String(wrongVersion.status)})`
    );
    const bRow = await assertionRow(factB.id);
    check(
      bRow?.state === "customer_confirmed" &&
        bRow?.value === "Bachelor of Laws" &&
        (await revisionOf(P1)) === beforeWrongVersion &&
        (await eventKinds(factB.id)) === "confirmed,proposed",
      "T3 failed_before_supersession must leave the original byte-identical, revision unchanged"
    );
    console.log(
      `[T3 FACT_CORRECTION PASS] supersede->create recovery completed after a simulated crash (status corrected); original retained in history with events=${await eventKinds(factC.id)}; replacement strictly proposed; whole correction replay idempotent; pre-supersession failure reported precisely (failed_before_supersession)`
    );

    // ---------- T4: publication and separate AI-use grants + revocation ----------
    const t4Start = await revisionOf(P1);
    await repository.publish({
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t4.publish-a",
      expectedProjectRevision: t4Start,
      assertionId: factA.id,
      assertionVersion: factA.version,
      audience: "actor_only",
    });
    await repository.grantAIUse({
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t4.grant-a",
      expectedProjectRevision: t4Start + 1,
      assertionId: factA.id,
      assertionVersion: factA.version,
      audience: "actor_only",
    });
    await repository.publish({
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t4.publish-b",
      expectedProjectRevision: t4Start + 2,
      assertionId: factB.id,
      assertionVersion: factB.version,
      audience: "actor_only",
    });
    await repository.grantAIUse({
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t4.grant-b",
      expectedProjectRevision: t4Start + 3,
      assertionId: factB.id,
      assertionVersion: factB.version,
      audience: "actor_only",
    });
    check(
      (await revisionOf(P1)) === t4Start + 4,
      "T4 publish+grant must advance the revision exactly four times"
    );
    const publications = await database
      .select()
      .from(projectFactPublication)
      .where(eq(projectFactPublication.projectId, P1));
    const grants = await database
      .select()
      .from(projectFactUseGrant)
      .where(eq(projectFactUseGrant.projectId, P1));
    check(
      publications.length === 2 &&
        publications.every((row) => row.active && row.revokedAt === null) &&
        grants.length === 2 &&
        grants.every(
          (row) => row.purpose === "ai_context" && row.revokedAt === null
        ),
      "T4 publication records and ai_context use grants must exist as separate rows"
    );

    const authorizedBefore = await facts.stableProjection({
      actorUserId: A,
      projectId: P1,
    });
    check(
      authorizedBefore.authorizedForAI.length === 2,
      "T4 stable projection must authorize both published+granted facts"
    );
    await repository.revokeAIUse({
      actorUserId: A,
      projectId: P1,
      operationId: "p14b.t4.revoke-a",
      expectedProjectRevision: t4Start + 4,
      assertionId: factA.id,
      assertionVersion: factA.version,
    });
    check(
      (await revisionOf(P1)) === t4Start + 5,
      "T4 revoke must advance the revision exactly once"
    );
    const grantsAfterRevoke = await database
      .select()
      .from(projectFactUseGrant)
      .where(eq(projectFactUseGrant.projectId, P1));
    const grantA = grantsAfterRevoke.find(
      (row) => row.assertionId === factA.id
    );
    const grantB = grantsAfterRevoke.find(
      (row) => row.assertionId === factB.id
    );
    check(
      Boolean(grantA && grantA.revokedAt !== null) &&
        Boolean(grantB && grantB.revokedAt === null),
      "T4 revoke must set revokedAt only on the revoked grant"
    );
    const publicationsAfterRevoke = await database
      .select()
      .from(projectFactPublication)
      .where(
        and(
          eq(projectFactPublication.projectId, P1),
          eq(projectFactPublication.assertionId, factA.id)
        )
      );
    check(
      publicationsAfterRevoke.length === 1 &&
        publicationsAfterRevoke[0]?.revokedAt === null,
      "T4 revoked AI use must leave the publication row active (separate authorizations)"
    );
    const authorizedAfter = await facts.stableProjection({
      actorUserId: A,
      projectId: P1,
    });
    check(
      authorizedAfter.authorizedForAI.length === 1 &&
        authorizedAfter.authorizedForAI[0]?.id === factB.id,
      "T4 stable projection must exclude the revoked fact and keep the other"
    );
    console.log(
      `[T4 PUBLICATION_GRANT PASS] two active publications and two ai_context use grants as separate rows; revoke-a set only grant-a revokedAt (publication stays active); stable projection authorized ${String(authorizedBefore.authorizedForAI.length)} -> ${String(authorizedAfter.authorizedForAI.length)} (revoked fact excluded)`
    );

    // ---------- T5: isolation + fail-closed evidence verification ----------
    const t5Start = await revisionOf(P1);
    const p2BaseRevision = await revisionOf(ids.projectB);
    await expectErrorCode("forbidden", () =>
      repository.createCandidate({
        ...baseFact,
        actorUserId: B,
        projectId: P1,
        operationId: "p14b.t5.b-propose",
        expectedProjectRevision: t5Start,
        key: "p14b.t5.b",
        value: "Foreign write attempt",
      })
    );
    await expectErrorCode("forbidden", () =>
      repository.transition({
        actorUserId: B,
        projectId: P1,
        operationId: "p14b.t5.b-confirm-a",
        expectedProjectRevision: t5Start,
        assertionId: factA.id,
        assertionVersion: factA.version,
        to: "customer_confirmed",
      })
    );
    const outsiderProjection = await repository.projection({
      actorUserId: ids.userC,
      projectId: P1,
    });
    check(
      outsiderProjection === null,
      "T5 an unrelated actor's projection must be refused (null)"
    );
    const outsiderStable = await facts.stableProjection({
      actorUserId: ids.userC,
      projectId: P1,
    });
    check(
      outsiderStable.available === false &&
        outsiderStable.authorizedForAI.length === 0,
      "T5 stable projection must answer unavailable for an unrelated actor"
    );
    await expectErrorCode("forbidden", () =>
      repository.createCandidate({
        ...baseFact,
        actorUserId: ids.userC,
        projectId: P1,
        operationId: "p14b.t5.c-propose",
        expectedProjectRevision: t5Start,
        key: "p14b.t5.c",
        value: "Outsider write attempt",
      })
    );
    await expectErrorCode("forbidden", () =>
      repository.createCandidate({
        ...baseFact,
        actorUserId: randomUUID(),
        projectId: P1,
        operationId: "p14b.t5.ghost-propose",
        expectedProjectRevision: t5Start,
        key: "p14b.t5.ghost",
        value: "Nonexistent actor",
      })
    );
    const p2Fact = await repository.createCandidate({
      ...baseFact,
      actorUserId: B,
      projectId: ids.projectB,
      operationId: "p14b.t5.p2-propose",
      expectedProjectRevision: p2BaseRevision,
      key: "p14b.t5.isolated",
      value: "Only project B sees this",
    });
    const crossView = await repository.projection({
      actorUserId: A,
      projectId: ids.projectB,
    });
    check(crossView === null, "T5 project A's owner must not read project B");
    const leakCheck = await facts.stableProjection({
      actorUserId: A,
      projectId: P1,
    });
    check(
      ![...leakCheck.authorizedForAI, ...leakCheck.unresolvedCandidates].some(
        (row) => row.id === p2Fact.id
      ),
      "T5 project B facts must never appear in project A projections"
    );

    await expectErrorCode("evidence_unverified", () =>
      repository.createCandidate({
        ...baseFact,
        actorUserId: A,
        projectId: P1,
        operationId: "p14b.t5.doc-fact",
        expectedProjectRevision: t5Start,
        key: "p14b.t5.doc",
        value: "Extracted from a document",
        originKind: "document_extracted",
        sourceEvidenceRef: randomUUID(),
      })
    );
    await expectErrorCode("evidence_unverified", () =>
      facts.propose({
        ...baseFact,
        actorUserId: A,
        projectId: P1,
        operationId: "p14b.t5.doc-service",
        expectedProjectRevision: t5Start,
        key: "p14b.t5.doc2",
        value: "Service-level attempt",
        originKind: "document_extracted",
        sourceEvidenceRef: randomUUID(),
      })
    );
    await expectErrorCode("evidence_unverified", () =>
      repository.createCandidate({
        ...baseFact,
        actorUserId: A,
        projectId: P1,
        operationId: "p14b.t5.ref-without-verifier",
        expectedProjectRevision: t5Start,
        key: "p14b.t5.ref",
        value: "Customer fact with an evidence reference",
        originKind: "customer_stated",
        sourceEvidenceRef: randomUUID(),
      })
    );
    check(
      (await revisionOf(P1)) === t5Start,
      "T5 all refused attempts must leave project A revision untouched"
    );
    for (const rejectedKey of ["p14b.t5.doc", "p14b.t5.doc2", "p14b.t5.ref"]) {
      check(
        (await keyAssertionCount(P1, rejectedKey)) === 0,
        `T5 rejected fact ${rejectedKey} must not be persisted`
      );
    }
    console.log(
      "[T5 ISOLATION_EVIDENCE PASS] foreign owner/unrelated actor/nonexistent actor rejected with forbidden; cross-project projection null; document_extracted facts and unverified evidence references fail closed at repository AND service level with evidence_unverified, zero persisted rows and no revision movement; no scan attestation was synthesized"
    );

    // ---------- evidence witness + cleanup that respects append-only retention ----------
    const witness = await snapshotCounts();
    const scopedBefore = await scopedCounts();
    console.log(
      `[WITNESS] this run created facts=${String(scopedBefore.fact_assertion)} events=${String(scopedBefore.fact_event)} operations=${String(scopedBefore.project_operation)} publications=${String(scopedBefore.fact_publication)} grants=${String(scopedBefore.fact_use_grant)} projects=${String(scopedBefore.project)} users=${String(scopedBefore.user)}; project A final revision=${String(await revisionOf(P1))} project B final revision=${String(await revisionOf(ids.projectB))}; global table counts pre-cleanup=${JSON.stringify(witness)}`
    );
    await cleanupIfNeeded();
    const residue = await snapshotCounts();
    const scopedAfter = await scopedCounts();
    for (const [key, before] of Object.entries(baseline)) {
      const after = residue[key as keyof typeof residue];
      const retained = scopedAfter[key as keyof typeof scopedAfter];
      if (before + retained !== after) {
        throw new Error(
          `residue scope check failed for ${key}: baseline=${String(before)} synthetic_retained=${String(retained)} final=${String(after)}`
        );
      }
    }
    console.log(
      `[CLEANUP REPORT] deletable synthetic rows were deleted; append-only schema guards (never weakened) retained: ${retainedRows.join(", ")}`
    );
    console.log(
      `[RETENTION] synthetic rows remaining in this run's scope inside the disposable isolated test database: facts=${String(scopedAfter.fact_assertion)} events=${String(scopedAfter.fact_event)} operations=${String(scopedAfter.project_operation)} publications=${String(scopedAfter.fact_publication)} grants=${String(scopedAfter.fact_use_grant)} project_events=${String(scopedAfter.project_event)} projects=${String(scopedAfter.project)} users=${String(scopedAfter.user)}; the database lifecycle stays with the owner`
    );
    console.log("PHASE14_B_POSTGRES_ACCEPTANCE_PASS");
  } catch (error) {
    console.error(`[FATAL] ${(error as Error).message}`);
    console.error((error as Error).stack ?? "");
    console.log("PHASE14_B_POSTGRES_ACCEPTANCE_FAIL");
    process.exitCode = 1;
  } finally {
    try {
      await cleanupIfNeeded();
    } catch (cleanupError) {
      console.error(`[CLEANUP WARNING] ${(cleanupError as Error).message}`);
      process.exitCode = 1;
    }
    await client.end({ timeout: 5 });
  }
}

main();
