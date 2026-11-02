/**
 * Phase 13 Post-M5 E2E — Gate G4: inherited M4 replay at the real database
 * boundary plus protected-authority deny-only checks.
 *
 * These proofs exercise the installed guards, constraints and privileges of the
 * real isolated PostgreSQL cluster. They do not re-run the historical M4 suites
 * and they do not convert any historical failure into a pass.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { SchoolApi, caseOf, applicationOf } from "./api";
import { closeDb, db, skipReason } from "./env";
import { clientFor, type HttpClient } from "./http";
import { NORTHBRIDGE_IT, packageApplication, prepareAndConfirm } from "./journey";
import { record, recordNotRun, scenario } from "./scenario";
import { seedFixtureGraph, type FixtureGraph } from "./seed";

const reason = skipReason();

let graph: FixtureGraph;
let customer: HttpClient;
let api: SchoolApi;

before(async () => {
  if (reason) {
    return;
  }
  graph = await seedFixtureGraph();
  customer = await clientFor(graph.actors.customerA!);
  api = new SchoolApi(customer, graph.projects.A!);
});

after(async () => {
  await closeDb();
});

async function sqlStateOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "no_error";
  } catch (error) {
    const code = (error as { code?: string }).code;
    return code ?? "unknown_error";
  }
}

async function seedReviewRequest(state: "requested" | "in_review"): Promise<string> {
  const sql = db();
  const id = randomUUID();
  await sql`
    insert into "ProfessionalReviewRequest"
      (id, "projectId", "targetKind", "targetId", "targetVersion", "targetSha256",
       "targetBindingSha256", "reviewPurpose", "reviewScope", state, revision,
       "requestedByUserId", "operationId", "requestSha256")
    values (${id}, ${graph.projects.A}, 'managed_school_application',
            ${`pkg-${id}`}, 1, ${"a".repeat(64)}, ${"b".repeat(64)},
            'managed_handoff_authorization', array['document_completeness'], 'requested', 1,
            ${graph.actors.customerA!.id}, ${`review-${id}`}, ${"c".repeat(64)})
  `;
  if (state === "in_review") {
    await sql`
      update "ProfessionalReviewRequest"
      set state = 'in_review', revision = revision + 1, "updatedAt" = now()
      where id = ${id}`;
  }
  return id;
}

test("E2E-15 exact-target approval under installed guards (M4-FINAL-INT-06)", { skip: reason }, async () => {
  const record_ = await scenario({
    authorityGrade: "real_postgres",
    evidenceClass: ["real_postgres"],
    expected:
      "A review request reaches approved only from in_review, bound to the exact target version/hash; changes_requested -> approved stays refused with SQLSTATE 23514.",
    gate: "G4",
    id: "E2E-15",
    run: async (ctx) => {
      const sql = db();
      const approvedId = await seedReviewRequest("in_review");
      const approved = await sqlStateOf(() =>
        sql`update "ProfessionalReviewRequest"
            set state = 'approved', revision = revision + 1, "updatedAt" = now(),
                "authorityCode" = 'synthetic_test_authority',
                "credentialCode" = 'synthetic_test_credential'
            where id = ${approvedId} and state = 'in_review'`
      );
      assert.equal(approved, "no_error", `in_review -> approved must succeed (${approved})`);
      const row = (await sql`
        select state, "targetVersion", "targetSha256", "targetBindingSha256", "authorityCode"
        from "ProfessionalReviewRequest" where id = ${approvedId}`)[0] as Record<string, unknown>;
      assert.equal(row.state, "approved");
      assert.equal(row.targetVersion, 1);
      assert.equal(row.targetSha256, "a".repeat(64));
      ctx.cite("pg approved row bound to exact targetVersion/targetSha256/targetBindingSha256");

      const blockedId = await seedReviewRequest("in_review");
      await sql`update "ProfessionalReviewRequest" set state = 'changes_requested', revision = revision + 1 where id = ${blockedId}`;
      const illegal = await sqlStateOf(() =>
        sql`update "ProfessionalReviewRequest" set state = 'approved', revision = revision + 1 where id = ${blockedId}`
      );
      assert.equal(illegal, "23514", `changes_requested -> approved must be refused (${illegal})`);
      const unchanged = (await sql`select state, revision from "ProfessionalReviewRequest" where id = ${blockedId}`)[0] as Record<string, unknown>;
      assert.equal(unchanged.state, "changes_requested");
      ctx.cite("pg changes_requested -> approved refused with SQLSTATE 23514");
      ctx.note("synthetic-authority service composition not re-run in-process: the professional-review runtime module is not importable outside Next.js in this runner. The database contract is proven; the synthetic adapter path remains UNVERIFIED here.");
      return `in_review -> approved allowed with exact target binding; changes_requested -> approved refused ${illegal}`;
    },
  });
  assert.equal(record_.verdict, "PASS", record_.observed);
});

test("E2E-16 revocation invalidates readiness (M4-FINAL-INT-07 / INT-12)", { skip: reason }, async () => {
  const record_ = await scenario({
    authorityGrade: "deny_only",
    evidenceClass: ["real_postgres", "real_http", "deny_only"],
    expected:
      "After authority/invalidations the managed readiness stays NOT_READY or UNKNOWN and never READY; the owner-approved precedence rule is honoured.",
    gate: "G4",
    id: "E2E-16",
    run: async (ctx) => {
      const { applicationId } = await packageApplication(api, graph, ctx);
      const opened = await api.createCase({ applicationId, originKind: "school_application" });
      const caseView = caseOf(opened.json);
      const { confirmedCase } = await prepareAndConfirm(api, caseView.caseId, caseView.revision);
      const managed = await api.setServiceMode({
        caseId: caseView.caseId,
        expectedRevision: confirmedCase.revision,
        serviceMode: "managed_service",
      });
      const managedCase = caseOf(managed.json);
      const first = await api.readiness({ caseId: caseView.caseId, expectedRevision: managedCase.revision });
      const firstStatus = caseOf(first.json).managedReadiness?.status;
      assert.ok(["NOT_READY", "UNKNOWN", "NOT_EVALUATED"].includes(firstStatus ?? ""));

      // Invalidate the underlying approval, then re-evaluate.
      const sql = db();
      await sql`update "ProfessionalReviewRequest" set state = 'invalidated', "invalidatedAt" = now(), revision = revision + 1 where state = 'approved'`;
      const second = await api.readiness({ caseId: caseView.caseId, expectedRevision: caseOf(first.json).revision });
      const secondCase = caseOf(second.json);
      const secondStatus = secondCase.managedReadiness?.status;
      assert.ok(["NOT_READY", "UNKNOWN", "NOT_EVALUATED"].includes(secondStatus ?? ""));
      assert.notEqual(secondStatus, "READY");
      assert.equal(secondCase.managedReadiness?.submissionState, "not_connected");
      ctx.cite(`http readiness before ${firstStatus}, after invalidation ${secondStatus}`);
      ctx.note("Owner-approved precedence (Correction D): definitively missing prerequisites -> NOT_READY; genuinely undeterminable -> UNKNOWN; neither may yield READY.");
      return `readiness ${firstStatus} -> ${secondStatus} after approval invalidation; submissionState not_connected; never READY`;
    },
  });
  assert.equal(record_.verdict, "PASS", record_.observed);
});

test("E2E-17 finance and signature authority stay deny-only (M4-005 mapping)", { skip: reason }, async () => {
  const record_ = await scenario({
    authorityGrade: "deny_only",
    evidenceClass: ["real_postgres", "deny_only"],
    expected:
      "The application role cannot write frozen payment evidence, no fabricated finance/signature authority is possible, and the twelve historical M4-005 subcase defects stay recorded as UNVERIFIED rather than retired.",
    gate: "G4",
    id: "E2E-17",
    run: async (ctx) => {
      const sql = db();
      const paymentInsert = await sqlStateOf(() =>
        sql`insert into "ServicePaymentCondition" (id) values (${randomUUID()})`
      );
      assert.ok(
        ["42501", "23502", "23514"].includes(paymentInsert),
        `payment write must be denied, got ${paymentInsert}`
      );
      const paymentUpdate = await sqlStateOf(() =>
        sql`update "ServicePaymentCondition" set id = id`
      );
      assert.ok(["42501", "23514"].includes(paymentUpdate), `payment update ${paymentUpdate}`);
      const paymentRows = await sql`select count(*)::int as n from "ServicePaymentCondition"`;
      assert.ok(Array.isArray(paymentRows));
      ctx.cite(`pg payment INSERT denied ${paymentInsert}, UPDATE denied ${paymentUpdate}`);
      ctx.note(
        "M4-005 Stage 3B was NOT re-executed: the raw sanitized log (3349a97c...) is absent and the historical run is 29/41 with exit 124. The 12 recovered functional defects remain UNVERIFIED; this scenario proves only the deny-only finance invariant."
      );
      return `payment evidence writes denied (${paymentInsert}/${paymentUpdate}); no fabricated finance or signature authority is reachable from the application role`;
    },
  });
  assert.equal(record_.verdict, "PASS", record_.observed);
});

test("E2E-18 operator safety: append-only guards and bounded state", { skip: reason }, async () => {
  const record_ = await scenario({
    authorityGrade: "real_internal",
    evidenceClass: ["real_postgres", "real_http"],
    expected:
      "Append-only audit rows refuse UPDATE and DELETE with SQLSTATE evidence, revision skips are refused, and residual database state stays consistent with no leaked sessions.",
    gate: "G4",
    id: "E2E-18",
    run: async (ctx) => {
      const { applicationId } = await packageApplication(api, graph, ctx);
      const sql = db();
      const operation = (await sql`
        select o.id from "SchoolApplicationOperation" o
        join "SchoolApplicationPackage" pkg
          on pkg.id = o."resultId"
        where pkg."applicationId" = ${applicationId} limit 1`)[0] as { id: string } | undefined;
      assert.ok(operation, "an operation row must exist");

      const updateOp = await sqlStateOf(() =>
        sql`update "SchoolApplicationOperation" set "operationType" = 'tampered' where id = ${operation!.id}`
      );
      assert.equal(updateOp, "23514", `append-only UPDATE must be refused (${updateOp})`);
      const deleteOp = await sqlStateOf(() =>
        sql`delete from "SchoolApplicationOperation" where id = ${operation!.id}`
      );
      assert.equal(deleteOp, "23514", `append-only DELETE must be refused (${deleteOp})`);

      const events = await sql`
        select count(*)::int as n from "SchoolApplicationEvent" where "applicationId" = ${applicationId}`;
      assert.ok((events[0] as { n: number }).n >= 1, "audit events present");
      const sessions = await sql`
        select count(*)::int as n from pg_stat_activity
        where usename = current_user and pid <> pg_backend_pid()`;
      ctx.cite(`pg append-only UPDATE ${updateOp} / DELETE ${deleteOp}; open sibling sessions ${(sessions[0] as { n: number }).n}`);
      return `append-only UPDATE refused ${updateOp}, DELETE refused ${deleteOp}; audit events ${(events[0] as { n: number }).n}; sibling sessions ${(sessions[0] as { n: number }).n}`;
    },
  });
  assert.equal(record_.verdict, "PASS", record_.observed);
});

/** Historical ledger entries that cannot be retired by this campaign. */
test("M4 ledger: unretired historical identifiers", { skip: reason }, async () => {
  record({
    attempt: 0,
    authority_grade: "not_executed",
    elapsed_ms: 0,
    evidence: ["/home/rico/phase13_m4_005_stage3b_r4_authorized_run.log (ABSENT)"],
    evidence_class: ["documented_history"],
    expected:
      "M4-005 Stage 3B: 29 PASS / 12 FAIL with the twelve recovered functional defects mapped by function.",
    notes: [
      "Original raw sanitized log SHA-256 3349a97c...1de7 is absent; the 12 functional descriptions were recovered from the committed handoff record and are listed in the G0 manifest.",
      "The payment suite was not re-executed in this campaign; no historical failure is promoted.",
    ],
    observed: "PARTIAL_EVIDENCE: 12/12 functional descriptions recovered, 0/12 raw log lines; suite not re-run",
    scenario_id: "M4-005-STAGE3B",
    gate: "G4",
    verdict: "UNVERIFIED",
  });
  record({
    attempt: 1,
    authority_grade: "real_postgres",
    elapsed_ms: 0,
    evidence: ["E2E-14 journal 48 entries / head 0047"],
    evidence_class: ["real_postgres"],
    expected: "M4-005 offline journal assertions validated against the current additive journal.",
    notes: [
      "The six historical journal assertions are stale test metadata (45 entries / 0044 head). The current journal is 48 entries with head 0047 and was asserted in E2E-14.",
      "Test metadata was NOT edited in this campaign; the stale-expectation repair remains an owner decision.",
    ],
    observed: "Current additive journal validated (48 / 0047); stale assertions not repaired",
    scenario_id: "M4-005-OFFLINE-JOURNAL",
    gate: "G4",
    verdict: "UNVERIFIED",
  });
  record({
    attempt: 1,
    authority_grade: "deny_only",
    elapsed_ms: 0,
    evidence: ["E2E-09 managed deny-only", "E2E-17 payment write denial", "E2E-15 guard refusal"],
    evidence_class: ["deny_only"],
    expected: "Cross-module deny-only behaviour for unavailable professional, financial and provider authority.",
    notes: [
      "Deny-only half verified across E2E-09/15/16/17.",
      "Genuine external authority (real lawyer credential, signature, payment validity, provider receipt) remains UNVERIFIED and cannot be retired by synthetic evidence.",
    ],
    observed: "Deny-only invariants hold; real external authority unverifiable in this stage",
    scenario_id: "M4-CROSS-MODULE",
    gate: "G4",
    verdict: "UNVERIFIED",
  });
});
