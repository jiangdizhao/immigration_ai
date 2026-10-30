/**
 * Isolated M4-006 PostgreSQL harness.
 *
 * Requires a separate owner authorization supplying an isolated PostgreSQL 17
 * environment and its expectations:
 *
 *   PHASE13_M4_006_DB_URL                    (never port 5432)
 *   PHASE13_M4_006_EXPECTED_DB
 *   PHASE13_M4_006_EXPECTED_ROLE
 *   PHASE13_M4_006_EXPECTED_SYSTEM_IDENTIFIER
 *   PHASE13_M4_006_EXPECTED_HOST
 *   PHASE13_M4_006_EXPECTED_PORT
 *   PHASE13_M4_006_EXPECTED_LEDGER_HASH      (optional; defaults to the pinned file digest)
 *   PHASE13_M4_006_EXPECTED_CONTAINER_ID     (optional container id prefix)
 *
 * It never falls back to a default database, never targets the authoritative
 * corpus, never runs the frozen M4-005 Stage 3B suite, and never reports success
 * while a required scenario is missing, skipped or failed.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadManagedHandoffSnapshot } from "@/lib/db/managed-handoff-snapshot-repository";
import { createPostgresProfessionalReviewStore } from "@/lib/db/professional-review-repository";
import { evaluateManagedHandoffReadiness } from "@/lib/managed-handoff/evaluator";
import type { ManagedHandoffPayload } from "@/lib/managed-handoff/ports";
import { denyAllManagedHandoffPorts } from "@/lib/managed-handoff/ports";
import {
  type ManagedHandoffSnapshot,
  type ManagedHandoffSnapshotPolicy,
  managedHandoffPortsFromSnapshot,
} from "@/lib/managed-handoff/snapshot";
import { createSyntheticManagedHandoffPorts } from "@/lib/managed-handoff/synthetic-adapters";
import { ProfessionalReviewError } from "@/lib/professional-review/errors";
import {
  evaluateProfessionalReviewValidity,
  type ProfessionalReviewRecord,
} from "@/lib/professional-review/policy";
import { unavailableManagedTargetProvider } from "@/lib/professional-review/target-provider";
import {
  checkDatabaseIdentity,
  checkLedgerHistory,
  checkMigrationBytes,
  checkScenarioCoverage,
  checkTesterPrivileges,
  type GuardViolation,
  M4_006_MIGRATION_FILE,
  M4_006_MIGRATION_SHA256,
  M4_006_REQUIRED_SCENARIOS,
  M4_006_SCHEMA_EXPECTATIONS,
} from "./phase13-m4-006-db-test-guard";

const WATCHDOG_MS = 180_000;
const here = dirname(fileURLToPath(import.meta.url));
const chatbotRoot = resolve(here, "..");
const SCENARIOS = M4_006_REQUIRED_SCENARIOS;

const results: { detail: string; id: string; status: "passed" | "failed" }[] =
  [];
const clients: ReturnType<typeof postgres>[] = [];

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function printViolations(label: string, violations: readonly GuardViolation[]) {
  for (const violation of violations) {
    console.error(`GUARD ${label}/${violation.code}: ${violation.detail}`);
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fail(message: string): never {
  throw new Error(message);
}

/** A fresh connection pool; every client is tracked so it is always closed. */
function connect(url: string): ReturnType<typeof postgres> {
  const client = postgres(url, { connection: { TimeZone: "UTC" }, max: 4 });
  clients.push(client);
  return client;
}

type Fixture = {
  ownerUserId: string;
  projectId: string;
  reviewRequestId: string;
  reviewerUserId: string;
  runId: string;
  targetId: string;
  targetKind: "managed_school_application";
  targetSha256: string;
  targetVersion: number;
};

function fixtureRecord(
  fixture: Fixture,
  overrides: Partial<ProfessionalReviewRecord> = {}
): ProfessionalReviewRecord {
  return {
    decision: null,
    operationId: `create-${fixture.runId}`,
    projectId: fixture.projectId,
    requestSha256: sha256(`create:${fixture.runId}`),
    requestedAt: new Date().toISOString(),
    requestedByUserId: fixture.reviewerUserId,
    reviewPurpose: "managed_handoff_authorization",
    reviewRequestId: fixture.reviewRequestId,
    reviewScope: ["eligibility_review"],
    reviewerUserId: null,
    revision: 1,
    state: "requested",
    target: {
      projectId: fixture.projectId,
      targetId: fixture.targetId,
      targetKind: fixture.targetKind,
      targetSha256: fixture.targetSha256,
      targetVersion: fixture.targetVersion,
    },
    targetBindingSha256: sha256(
      JSON.stringify({
        projectId: fixture.projectId,
        targetId: fixture.targetId,
        targetKind: fixture.targetKind,
        targetSha256: fixture.targetSha256,
        targetVersion: fixture.targetVersion,
      })
    ),
    ...overrides,
  };
}

function decisionRecord(
  fixture: Fixture,
  input: {
    action:
      | "start_review"
      | "request_changes"
      | "approve"
      | "reject"
      | "invalidate";
    operationId: string;
    revision: number;
    state: ProfessionalReviewRecord["state"];
  }
): ProfessionalReviewRecord {
  return fixtureRecord(fixture, {
    decision: {
      action: input.action,
      authorityCode: "synthetic_test_scoped_review_authority",
      boundTargetSha256: fixture.targetSha256,
      boundTargetVersion: fixture.targetVersion,
      commentSha256: null,
      credentialCode: null,
      decidedAt: new Date().toISOString(),
      decidedByUserId: fixture.reviewerUserId,
      reasonCode: null,
      revision: input.revision,
    },
    operationId: input.operationId,
    requestSha256: sha256(`${input.operationId}:${fixture.runId}`),
    revision: input.revision,
    reviewerUserId: fixture.reviewerUserId,
    state: input.state,
  });
}

/** Seeds only the two rows M4-006 needs; M4-004 rows are deliberately not faked. */
async function seed(sql: ReturnType<typeof postgres>, fixture: Fixture) {
  await sql`insert into "User" (id, email) values (${fixture.ownerUserId}, ${`harness-owner-${fixture.runId}@example.invalid`})`;
  await sql`insert into "User" (id, email) values (${fixture.reviewerUserId}, ${`harness-reviewer-${fixture.runId}@example.invalid`})`;
  await sql`insert into "StudyJourneyProject" (id, "ownerUserId") values (${fixture.projectId}, ${fixture.ownerUserId})`;
}

/**
 * Cleanup. M4-006 history is append-only by design, so a committed fixture row
 * cannot be deleted; this run therefore only rolls back open work and reports what
 * the disposable database retains. Nothing is force-deleted.
 */
async function cleanup(authoritativeResidue: Fixture | null) {
  if (authoritativeResidue) {
    console.log(
      `residue: project=${authoritativeResidue.projectId} review=${authoritativeResidue.reviewRequestId} (disposable database)`
    );
  }
  for (const client of clients) {
    try {
      await client.end({ timeout: 5 });
    } catch {
      // closing is best effort, never fatal
    }
  }
  clients.length = 0;
}

type ScenarioContext = {
  database: ReturnType<typeof drizzle>;
  databaseSecondary: ReturnType<typeof drizzle>;
  fixture: Fixture;
  sql: ReturnType<typeof postgres>;
  url: string;
};

type Scenario = {
  id: (typeof SCENARIOS)[number];
  run: (ctx: ScenarioContext) => Promise<void>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

async function expectError(
  code: string,
  operation: () => Promise<unknown>
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof ProfessionalReviewError && error.code === code) {
      return;
    }
    throw error;
  }
  fail(`expected error ${code}, but the operation succeeded`);
}

async function revisionCount(
  sql: ReturnType<typeof postgres>,
  reviewRequestId: string
): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from "ProfessionalReviewRevision"
    where "reviewRequestId" = ${reviewRequestId}
  `;
  return Number(row?.count ?? -1);
}

async function headOperation(
  sql: ReturnType<typeof postgres>,
  fixture: Fixture
): Promise<{
  operationId: string;
  requestSha256: string;
  revision: number;
  state: string;
}> {
  const [row] = await sql<
    {
      operationId: string;
      requestSha256: string;
      revision: number;
      state: string;
    }[]
  >`
    select "operationId", "requestSha256", "revision", "state"
    from "ProfessionalReviewRequest" where "id" = ${fixture.reviewRequestId}
  `;
  assert(row, "review request row missing");
  return row;
}

const PRODUCTION_POLICY: ManagedHandoffSnapshotPolicy = {
  confirmation: { status: "policy_unknown" },
  paymentValidity: "untrusted",
  signatureAuthority: "unapproved",
};

function payloadFor(fixture: Fixture): ManagedHandoffPayload {
  return {
    actorUserId: fixture.ownerUserId,
    messagingConsentPresent: false,
    projectId: fixture.projectId,
    target: { targetId: fixture.targetId, targetKind: fixture.targetKind },
    vipEntitlementActive: false,
  };
}

const SCENARIO_BODIES: Scenario[] = [
  {
    id: "INT-01 review request survives a new connection",
    async run({ database, databaseSecondary, fixture, sql }) {
      const created = await createPostgresProfessionalReviewStore({
        database,
      }).create(fixtureRecord(fixture));
      assert(created.replayed === false, "first create must not be a replay");
      // A brand-new pool must observe the committed row.
      const readBack = await createPostgresProfessionalReviewStore({
        database: databaseSecondary,
      }).load(fixture.reviewRequestId);
      assert(
        readBack !== null,
        "review request not visible on a new connection"
      );
      assert(readBack.state === "requested", `state ${readBack.state}`);
      assert(readBack.revision === 1, `revision ${readBack.revision}`);
      const count = await revisionCount(sql, fixture.reviewRequestId);
      assert(count === 1, `expected 1 revision row, found ${count}`);
    },
  },
  {
    id: "INT-02 immutable history reconstructable",
    async run({ database, fixture, sql }) {
      const store = createPostgresProfessionalReviewStore({ database });
      await store.append({
        expectedRevision: 1,
        record: decisionRecord(fixture, {
          action: "start_review",
          operationId: `start-${fixture.runId}`,
          revision: 2,
          state: "in_review",
        }),
      });
      const history = await store.listHistory(fixture.reviewRequestId);
      assert(history.length === 2, `history length ${history.length}`);
      assert(
        history[0]?.revision === 1 && history[1]?.revision === 2,
        "revision order"
      );
      const rows = await sql<
        { action: string; revision: number; state: string }[]
      >`
        select "action", "revision", "state" from "ProfessionalReviewRevision"
        where "reviewRequestId" = ${fixture.reviewRequestId} order by "revision" asc
      `;
      assert(rows.length === 2, `raw rows ${rows.length}`);
      assert(
        rows[0]?.action === "create_request",
        `first action ${rows[0]?.action}`
      );
      assert(
        rows[1]?.action === "start_review",
        `second action ${rows[1]?.action}`
      );
      assert(rows[1]?.state === "in_review", `second state ${rows[1]?.state}`);
    },
  },
  {
    id: "INT-03 concurrent decisions: exactly one winner",
    async run({ database, databaseSecondary, fixture, sql }) {
      const primary = createPostgresProfessionalReviewStore({ database });
      const secondary = createPostgresProfessionalReviewStore({
        database: databaseSecondary,
      });
      const attempt = (store: typeof primary, operationId: string) =>
        store.append({
          expectedRevision: 2,
          record: decisionRecord(fixture, {
            action: "request_changes",
            operationId,
            revision: 3,
            state: "changes_requested",
          }),
        });
      const settled = await Promise.allSettled([
        attempt(primary, `race-a-${fixture.runId}`),
        attempt(secondary, `race-b-${fixture.runId}`),
      ]);
      const fulfilled = settled.filter((entry) => entry.status === "fulfilled");
      const rejected = settled.filter((entry) => entry.status === "rejected");
      assert(fulfilled.length === 1, `${fulfilled.length} writers won`);
      assert(rejected.length === 1, `${rejected.length} writers failed`);
      const reason = (rejected[0] as PromiseRejectedResult).reason;
      assert(
        reason instanceof ProfessionalReviewError &&
          reason.code === "revision_conflict",
        `loser failed with ${reason instanceof ProfessionalReviewError ? reason.code : String(reason)}`
      );
      const head = await headOperation(sql, fixture);
      assert(head.revision === 3, `head revision ${head.revision}`);
      const count = await revisionCount(sql, fixture.reviewRequestId);
      assert(count === 3, `expected 3 revision rows, found ${count}`);
    },
  },
  {
    id: "INT-04 exact replay creates no duplicate revision",
    async run({ database, fixture, sql }) {
      const store = createPostgresProfessionalReviewStore({ database });
      const head = await headOperation(sql, fixture);
      const before = await revisionCount(sql, fixture.reviewRequestId);
      const replay = await store.append({
        expectedRevision: 2,
        record: {
          ...decisionRecord(fixture, {
            action: "request_changes",
            operationId: head.operationId,
            revision: head.revision,
            state: head.state as ProfessionalReviewRecord["state"],
          }),
          requestSha256: head.requestSha256,
        },
      });
      assert(replay.replayed === true, "exact replay must be recognised");
      const after = await revisionCount(sql, fixture.reviewRequestId);
      assert(after === before, `replay wrote a row: ${before} -> ${after}`);
    },
  },
  {
    id: "INT-05 changed replay rejected",
    async run({ database, fixture, sql }) {
      const store = createPostgresProfessionalReviewStore({ database });
      const head = await headOperation(sql, fixture);
      const before = await revisionCount(sql, fixture.reviewRequestId);
      await expectError("idempotency_conflict", () =>
        store.append({
          expectedRevision: 2,
          record: {
            ...decisionRecord(fixture, {
              action: "request_changes",
              operationId: head.operationId,
              revision: head.revision,
              state: head.state as ProfessionalReviewRecord["state"],
            }),
            requestSha256: sha256(`changed-${fixture.runId}`),
          },
        })
      );
      const after = await revisionCount(sql, fixture.reviewRequestId);
      assert(after === before, `conflict wrote a row: ${before} -> ${after}`);
    },
  },
];

SCENARIO_BODIES.push(
  {
    id: "INT-06 approval bound to the exact target version/hash",
    async run({ database, fixture }) {
      const store = createPostgresProfessionalReviewStore({ database });
      // approved at revision 4 (bound to the reviewed version/hash)
      await store.append({
        expectedRevision: 3,
        record: decisionRecord(fixture, {
          action: "approve",
          operationId: `approve-${fixture.runId}`,
          revision: 4,
          state: "approved",
        }),
      });
      const record = await store.load(fixture.reviewRequestId);
      assert(record?.state === "approved", `state ${record?.state}`);
      const assignment = {
        reviewerUserId: fixture.reviewerUserId,
        status: "active" as const,
      };
      const credential = {
        credentialCode: "synthetic_test_practising_certificate",
        status: "verified" as const,
      };
      const exact = evaluateProfessionalReviewValidity({
        assignment,
        credential,
        currentTarget: {
          targetSha256: fixture.targetSha256,
          targetVersion: fixture.targetVersion,
        },
        providerTrustsTarget: true,
        record,
      });
      assert(
        exact.status === "valid",
        `exact target should be valid, got ${exact.status}`
      );
      for (const moved of [
        {
          targetSha256: sha256(`v2-${fixture.runId}`),
          targetVersion: fixture.targetVersion,
        },
        {
          targetSha256: fixture.targetSha256,
          targetVersion: fixture.targetVersion + 1,
        },
      ]) {
        const validity = evaluateProfessionalReviewValidity({
          assignment,
          credential,
          currentTarget: moved,
          providerTrustsTarget: true,
          record,
        });
        assert(
          validity.status === "invalid" &&
            validity.reasonCode === "review_target_changed",
          `moved target accepted: ${JSON.stringify(validity)}`
        );
      }
    },
  },
  {
    id: "INT-07 revoked assignment invalidates review validity",
    async run({ database, fixture }) {
      const record = await createPostgresProfessionalReviewStore({
        database,
      }).load(fixture.reviewRequestId);
      assert(record?.state === "approved", `state ${record?.state}`);
      const validity = evaluateProfessionalReviewValidity({
        assignment: { status: "revoked" },
        credential: { credentialCode: "x", status: "verified" },
        currentTarget: {
          targetSha256: fixture.targetSha256,
          targetVersion: fixture.targetVersion,
        },
        providerTrustsTarget: true,
        record,
      });
      assert(
        validity.status === "invalid" &&
          validity.reasonCode === "review_authority_revoked",
        JSON.stringify(validity)
      );
    },
  },
  {
    id: "INT-08 real Project/Engagement projection through the snapshot",
    async run({ database, fixture, sql }) {
      const snapshot = await loadManagedHandoffSnapshot(
        {
          actorUserId: fixture.ownerUserId,
          credential: "unavailable",
          projectId: fixture.projectId,
          resolvedTarget: null,
          targetId: fixture.targetId,
          targetKind: fixture.targetKind,
        },
        { database }
      );
      const [project] = await sql<{ revision: number; status: string }[]>`
        select revision, status from "StudyJourneyProject" where id = ${fixture.projectId}
      `;
      const projectState = snapshot.project;
      assert(
        projectState.status === "active" &&
          projectState.revision === project?.revision,
        `project ${JSON.stringify(projectState)} vs ${JSON.stringify(project)}`
      );
      // No M4-004 rows were seeded, so the authoritative engagement read is absent
      // (definitive), not unknown.
      assert(
        snapshot.engagement.status === "missing",
        `engagement ${snapshot.engagement.status}`
      );
      const membership = snapshot.membership;
      assert(
        membership !== null &&
          membership !== "unavailable" &&
          membership.status === "owner",
        `membership ${JSON.stringify(membership)}`
      );
      const readiness = await evaluateManagedHandoffReadiness(
        payloadFor(fixture),
        managedHandoffPortsFromSnapshot(snapshot, {
          policy: PRODUCTION_POLICY,
          targetProvider: unavailableManagedTargetProvider,
        })
      );
      assert(readiness.status === "NOT_READY", `status ${readiness.status}`);
      assert(
        readiness.reasonCodes.includes("engagement_missing"),
        JSON.stringify(readiness.reasonCodes)
      );
      assert(
        readiness.checkedRevisions.project === project?.revision,
        `checked project revision ${readiness.checkedRevisions.project}`
      );
    },
  },
  {
    id: "INT-09 undisclosed resource is not authorized",
    async run({ database, fixture }) {
      const snapshot = await loadManagedHandoffSnapshot(
        {
          actorUserId: fixture.ownerUserId,
          credential: "unavailable",
          projectId: fixture.projectId,
          resolvedTarget: null,
          targetId: fixture.targetId,
          targetKind: fixture.targetKind,
        },
        { database }
      );
      const disclosure = snapshot.disclosure;
      assert(
        disclosure !== "unavailable" && disclosure.status === "missing",
        `disclosure ${JSON.stringify(disclosure)}`
      );
      const readiness = await evaluateManagedHandoffReadiness(
        payloadFor(fixture),
        managedHandoffPortsFromSnapshot(snapshot, {
          policy: PRODUCTION_POLICY,
          targetProvider: unavailableManagedTargetProvider,
        })
      );
      assert(
        readiness.reasonCodes.includes("resource_disclosure_missing"),
        JSON.stringify(readiness.reasonCodes)
      );
      assert(
        readiness.evidenceRefs.some((ref) => ref.startsWith("engagement:")) ===
          false,
        "no engagement evidence reference may exist without an engagement"
      );
    },
  },
  {
    id: "INT-10 unknown customer-confirmation policy",
    async run({ database, fixture }) {
      const snapshot = await loadManagedHandoffSnapshot(
        {
          actorUserId: fixture.ownerUserId,
          credential: "unavailable",
          projectId: fixture.projectId,
          resolvedTarget: null,
          targetId: fixture.targetId,
          targetKind: fixture.targetKind,
        },
        { database }
      );
      const readiness = await evaluateManagedHandoffReadiness(
        payloadFor(fixture),
        managedHandoffPortsFromSnapshot(snapshot, {
          policy: PRODUCTION_POLICY,
          targetProvider: unavailableManagedTargetProvider,
        })
      );
      assert(
        readiness.reasonCodes.includes("customer_confirmation_policy_unknown"),
        JSON.stringify(readiness.reasonCodes)
      );
      assert(
        readiness.status !== "READY",
        "an unresolved policy must never be READY"
      );
    },
  },
  {
    id: "INT-11 absent production authorities cannot make READY",
    async run({ database, fixture, sql }) {
      const snapshot = await loadManagedHandoffSnapshot(
        {
          actorUserId: fixture.ownerUserId,
          credential: "unavailable",
          projectId: fixture.projectId,
          resolvedTarget: null,
          targetId: fixture.targetId,
          targetKind: fixture.targetKind,
        },
        { database }
      );
      // Anchor on the real payment table: nothing was recorded, so the predicate is
      // absence, and no positive can be manufactured from it.
      const [payment] = await sql<{ count: number }[]>`
        select count(*)::int as count from "ServicePaymentCondition" where "projectId" = ${fixture.projectId}
      `;
      assert(
        Number(payment?.count ?? -1) === 0,
        "no payment condition expected"
      );
      const readiness = await evaluateManagedHandoffReadiness(
        payloadFor(fixture),
        managedHandoffPortsFromSnapshot(snapshot, {
          policy: PRODUCTION_POLICY,
          targetProvider: unavailableManagedTargetProvider,
        })
      );
      assert(readiness.status !== "READY", "production must never be READY");
      assert(
        readiness.reasonCodes.includes("payment_condition_missing") ||
          readiness.reasonCodes.includes("payment_state_unavailable"),
        JSON.stringify(readiness.reasonCodes)
      );
    },
  }
);

SCENARIO_BODIES.push(
  {
    id: "INT-12 concurrent revision change never becomes permission",
    async run({ database, fixture }) {
      const snapshot = await loadManagedHandoffSnapshot(
        {
          actorUserId: fixture.ownerUserId,
          credential: "unavailable",
          projectId: fixture.projectId,
          resolvedTarget: null,
          targetId: fixture.targetId,
          targetKind: fixture.targetKind,
        },
        { database }
      );
      // The real read is self-consistent: both reads inside the snapshot agree.
      assert(
        snapshot.projectRevisionAfter ===
          (snapshot.project.status === "missing"
            ? null
            : snapshot.project.revision),
        "snapshot observed a project revision drift on a quiet database"
      );
      // A revocation committed between the snapshot and the decision is visible to
      // the evaluator's re-read and can never be promoted into READY.
      const drifted: ManagedHandoffSnapshot = {
        ...snapshot,
        projectRevisionAfter:
          snapshot.project.status === "missing"
            ? null
            : snapshot.project.revision + 1,
      };
      const readiness = await evaluateManagedHandoffReadiness(
        payloadFor(fixture),
        managedHandoffPortsFromSnapshot(drifted, {
          policy: PRODUCTION_POLICY,
          targetProvider: unavailableManagedTargetProvider,
        })
      );
      assert(readiness.status === "UNKNOWN", `status ${readiness.status}`);
      assert(
        readiness.reasonCodes.includes("concurrent_revision_change"),
        JSON.stringify(readiness.reasonCodes)
      );
    },
  },
  {
    id: "INT-13 synthetic READY stays test-only",
    async run({ fixture }) {
      const result = await evaluateManagedHandoffReadiness(
        payloadFor(fixture),
        createSyntheticManagedHandoffPorts({
          actorUserId: fixture.ownerUserId,
          projectId: fixture.projectId,
          targetId: fixture.targetId,
          targetKind: fixture.targetKind,
          targetSha256: fixture.targetSha256,
          targetVersion: fixture.targetVersion,
        })
      );
      assert(result.status === "READY", JSON.stringify(result.reasonCodes));
      assert(
        result.evidenceProvenance === "synthetic_test",
        `provenance ${result.evidenceProvenance}`
      );
    },
  },
  {
    id: "INT-14 production composition never READY",
    async run({ fixture }) {
      const result = await evaluateManagedHandoffReadiness(
        payloadFor(fixture),
        denyAllManagedHandoffPorts(unavailableManagedTargetProvider)
      );
      assert(result.status === "UNKNOWN", `status ${result.status}`);
      assert(
        result.evidenceProvenance === "production",
        "production provenance"
      );
    },
  },
  {
    id: "DB-01 append-only trigger refuses UPDATE and DELETE",
    async run({ fixture, sql }) {
      // One transaction per refused statement, always rolled back: the trigger must
      // refuse the write, and the committed history must stay untouched.
      const attempt = async (statement: string) => {
        try {
          await sql.begin(async (tx) => {
            await tx.unsafe(statement);
            throw new RollbackOnly("statement unexpectedly succeeded");
          });
          return null;
        } catch (error) {
          return error;
        }
      };
      const updated = await attempt(
        `update "ProfessionalReviewRevision" set "state" = 'approved' where "reviewRequestId" = '${fixture.reviewRequestId}'`
      );
      assert(
        isSqlState(updated, "23514"),
        `UPDATE was not refused: ${describe(updated)}`
      );
      const removed = await attempt(
        `delete from "ProfessionalReviewRevision" where "reviewRequestId" = '${fixture.reviewRequestId}'`
      );
      assert(
        isSqlState(removed, "23514"),
        `DELETE was not refused: ${describe(removed)}`
      );
      const [row] = await sql<{ count: number }[]>`
        select count(*)::int as count from "ProfessionalReviewRevision"
        where "reviewRequestId" = ${fixture.reviewRequestId}
      `;
      assert(
        Number(row?.count ?? 0) === 4,
        `history changed: ${describe(row)}`
      );
    },
  },
  {
    id: "DB-02 projection trigger refuses revision skip, rebinding and illegal transitions",
    async run({ fixture, sql }) {
      // Same probe shape as DB-01: the statement must raise, and the probe
      // transaction is always rolled back.
      const attempt = async (statement: string) => {
        try {
          await sql.begin(async (tx) => {
            await tx.unsafe(statement);
            throw new RollbackOnly("statement unexpectedly succeeded");
          });
          return null;
        } catch (error) {
          return error;
        }
      };
      const skip = await attempt(
        `update "ProfessionalReviewRequest" set "revision" = "revision" + 2, "state" = 'in_review' where "id" = '${fixture.reviewRequestId}'`
      );
      assert(
        isSqlState(skip, "23514"),
        `revision skip allowed: ${describe(skip)}`
      );
      const rebind = await attempt(
        `update "ProfessionalReviewRequest" set "targetSha256" = '${sha256("rebind")}', "revision" = "revision" + 1 where "id" = '${fixture.reviewRequestId}'`
      );
      assert(
        isSqlState(rebind, "23514"),
        `target rebinding allowed: ${describe(rebind)}`
      );
      const illegal = await attempt(
        `update "ProfessionalReviewRequest" set "state" = 'approved', "revision" = "revision" + 1 where "id" = '${fixture.reviewRequestId}'`
      );
      assert(
        isSqlState(illegal, "23514"),
        `illegal transition allowed: ${describe(illegal)}`
      );
      const [row] = await sql<{ revision: number; state: string }[]>`
        select "revision", "state" from "ProfessionalReviewRequest" where "id" = ${fixture.reviewRequestId}
      `;
      assert(
        row?.state === "approved" && row.revision === 4,
        `head drifted: ${describe(row)}`
      );
    },
  },
  {
    id: "DB-03 restricted tester cannot DDL or write frozen M4-005 tables",
    async run({ sql }) {
      const [privileges] = await sql<
        {
          can_create_table: boolean;
          can_read_ledger: boolean;
          can_write_payment: boolean;
          can_write_review: boolean;
        }[]
      >`
        select has_schema_privilege(current_user, 'public', 'CREATE') as can_create_table,
               has_table_privilege(current_user, '"ServicePaymentCondition"', 'INSERT') as can_write_payment,
               has_table_privilege(current_user, '"ProfessionalReviewRequest"', 'INSERT,UPDATE') as can_write_review,
               has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'SELECT') as can_read_ledger
      `;
      const violations = checkTesterPrivileges({
        canCreateTable: privileges?.can_create_table ?? true,
        canReadMigrationLedger: privileges?.can_read_ledger ?? false,
        canWritePaymentCondition: privileges?.can_write_payment ?? true,
        canWriteReviewRequest: privileges?.can_write_review ?? false,
      });
      assert(violations.length === 0, JSON.stringify(violations));
    },
  }
);

function isSqlState(value: unknown, state: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { code?: string }).code === state
  );
}

function describe(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "object") {
    const record = value as { code?: unknown; message?: unknown };
    return `${String(record.code)}: ${String(record.message)}`;
  }
  return String(value);
}

/** Raised only to roll a probe transaction back after an unexpected success. */
class RollbackOnly extends Error {}

async function main(): Promise<number> {
  const url = env("PHASE13_M4_006_DB_URL");
  if (!url) {
    console.error(
      "PHASE13_M4_006_DB_URL is required; this harness never falls back to a default database."
    );
    return 2;
  }
  if (/:5432(\/|$|\?)/u.test(url)) {
    console.error(
      "refusing to run against the authoritative database on port 5432"
    );
    return 2;
  }

  const expected = {
    containerId: env("PHASE13_M4_006_EXPECTED_CONTAINER_ID"),
    database: env("PHASE13_M4_006_EXPECTED_DB"),
    host: env("PHASE13_M4_006_EXPECTED_HOST"),
    port: Number(env("PHASE13_M4_006_EXPECTED_PORT") ?? Number.NaN),
    role: env("PHASE13_M4_006_EXPECTED_ROLE"),
    systemIdentifier: env("PHASE13_M4_006_EXPECTED_SYSTEM_IDENTIFIER"),
  };
  const guardFailures: GuardViolation[] = [];

  const sql = connect(url);

  // ---- identity, observed from the server itself ----
  const [identity] = await sql<
    {
      database: string;
      role: string;
      server_version: string;
      system_identifier: string;
      server_addr: string | null;
      server_port: number | null;
    }[]
  >`
    select current_database() as database,
           current_user as role,
           current_setting('server_version') as server_version,
           (select system_identifier::text from pg_control_system()) as system_identifier,
           inet_server_addr()::text as server_addr,
           inet_server_port() as server_port
  `;
  const hostnameObservation = hostname();
  guardFailures.push(
    ...checkDatabaseIdentity(
      {
        containerId: /^[0-9a-f]{12,64}$/u.test(hostnameObservation)
          ? hostnameObservation
          : null,
        database: identity?.database ?? "",
        role: identity?.role ?? "",
        serverAddress: identity?.server_addr ?? null,
        serverPort: identity?.server_port ?? null,
        serverVersion: identity?.server_version ?? "",
        systemIdentifier: identity?.system_identifier ?? "",
      },
      expected
    )
  );

  // ---- migration bytes and complete ledger history ----
  const migrationPath = resolve(chatbotRoot, M4_006_MIGRATION_FILE);
  const migrationBytes = readFileSync(migrationPath);
  guardFailures.push(...checkMigrationBytes(sha256(migrationBytes)));

  const journal = (
    JSON.parse(
      readFileSync(
        resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json"),
        "utf8"
      )
    ) as { entries: { idx: number; tag: string; when: number }[] }
  ).entries;
  const ledger = await sql<{ id: number; hash: string; created_at: string }[]>`
    select id, hash, created_at from drizzle.__drizzle_migrations order by id asc
  `;
  guardFailures.push(
    ...checkLedgerHistory(
      ledger.map((row) => ({
        createdAt: Number(row.created_at),
        hash: row.hash,
        id: Number(row.id),
      })),
      {
        headHash:
          env("PHASE13_M4_006_EXPECTED_LEDGER_HASH") ?? M4_006_MIGRATION_SHA256,
        headTag: journal.at(-1)?.tag ?? "",
        journal,
      }
    )
  );

  // ---- catalogue ----
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ${sql(M4_006_SCHEMA_EXPECTATIONS.tables as unknown as string[])}
  `;
  const indexes = await sql<{ indexname: string }[]>`
    select indexname from pg_indexes
    where schemaname = 'public' and indexname in ${sql(M4_006_SCHEMA_EXPECTATIONS.uniqueIndexes as unknown as string[])}
  `;
  const checks = await sql<{ conname: string }[]>`
    select conname from pg_constraint
    where conname in ${sql(M4_006_SCHEMA_EXPECTATIONS.checkConstraints as unknown as string[])}
  `;
  const triggers = await sql<{ tgname: string }[]>`
    select tgname from pg_trigger
    where tgname in ${sql(M4_006_SCHEMA_EXPECTATIONS.triggers as unknown as string[])}
  `;
  const functions = await sql<{ proname: string }[]>`
    select proname from pg_proc
    where proname in ${sql(M4_006_SCHEMA_EXPECTATIONS.guardFunctions as unknown as string[])}
  `;
  const catalogue: [string, number, number][] = [
    ["tables", tables.length, M4_006_SCHEMA_EXPECTATIONS.tables.length],
    [
      "unique indexes",
      indexes.length,
      M4_006_SCHEMA_EXPECTATIONS.uniqueIndexes.length,
    ],
    [
      "checks",
      checks.length,
      M4_006_SCHEMA_EXPECTATIONS.checkConstraints.length,
    ],
    ["triggers", triggers.length, M4_006_SCHEMA_EXPECTATIONS.triggers.length],
    [
      "guard functions",
      functions.length,
      M4_006_SCHEMA_EXPECTATIONS.guardFunctions.length,
    ],
  ];
  for (const [label, observed, wanted] of catalogue) {
    if (observed !== wanted) {
      guardFailures.push({
        code: "catalogue",
        detail: `${label}: expected ${wanted}, observed ${observed}`,
      });
    }
  }

  if (guardFailures.length > 0) {
    printViolations("preflight", guardFailures);
    return 2;
  }

  // ---- isolated fixtures ----
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const fixture: Fixture = {
    ownerUserId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    reviewRequestId: crypto.randomUUID(),
    reviewerUserId: crypto.randomUUID(),
    runId,
    targetId: `harness-package-${runId}`,
    targetKind: "managed_school_application",
    targetSha256: sha256(`target:${runId}`),
    targetVersion: 3,
  };
  await seed(sql, fixture);

  const database = drizzle(sql);
  const secondaryClient = connect(url);
  const databaseSecondary = drizzle(secondaryClient);
  const ctx: ScenarioContext = {
    database,
    databaseSecondary,
    fixture,
    sql,
    url,
  };

  let exitCode = 0;
  try {
    for (const scenario of SCENARIO_BODIES) {
      try {
        await scenario.run(ctx);
        results.push({ detail: "", id: scenario.id, status: "passed" });
        console.log(`PASS ${scenario.id}`);
      } catch (error) {
        results.push({
          detail: describe(error),
          id: scenario.id,
          status: "failed",
        });
        console.error(`FAIL ${scenario.id}: ${describe(error)}`);
      }
    }
  } finally {
    // Success returns normally: only a missing/skipped/failed scenario sets a
    // non-zero exit code, so the guard can never fail a clean run.
    const coverage = checkScenarioCoverage(results);
    printViolations("coverage", coverage);
    const failed = results.filter((entry) => entry.status === "failed");
    const missing = SCENARIOS.filter(
      (id) => !results.some((entry) => entry.id === id)
    );
    console.log(
      `summary: ${results.filter((entry) => entry.status === "passed").length}/${SCENARIOS.length} scenarios passed, ${failed.length} failed, ${missing.length} not executed`
    );
    if (failed.length > 0 || missing.length > 0 || coverage.length > 0) {
      exitCode = 1;
    }
  }
  await cleanup(fixture);
  return exitCode;
}

const watchdog = setTimeout(() => {
  console.error(`M4-006 harness watchdog exceeded ${WATCHDOG_MS}ms`);
  for (const client of clients) {
    client.end({ timeout: 2 }).catch(() => undefined);
  }
  process.exit(124);
}, WATCHDOG_MS);

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`M4-006 harness failed: ${describe(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    clearTimeout(watchdog);
    await cleanup(null);
  });
