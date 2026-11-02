// biome-ignore-all lint/style/noNonNullAssertion: fixture identifiers are asserted to exist
// biome-ignore-all lint/style/useConsistentArrayType: fixture typing conventions
// biome-ignore-all lint/style/useBlockStatements: fixture typing conventions
/**
 * Phase 13 Post-M5 E2E — completion campaign: independent M4 final replay.
 *
 * These proofs use the REAL professional-review service and the REAL PostgreSQL
 * repository in the isolated cluster, with explicitly tagged synthetic authority
 * ports. They replace the earlier database-only probes that were insufficient to
 * retire M4-FINAL-INT-06/07/12 and M4-FINAL-DB-01/02.
 *
 * A synthetic authority proves workflow behaviour only. It is never real
 * licensed-professional approval.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createPostgresProfessionalReviewStore } from "@/lib/db/professional-review-repository";
import { createProfessionalReviewService } from "@/lib/professional-review/service";
import {
  createSyntheticManagedTargetProvider,
  createSyntheticProfessionalCredentialVerifier,
  createSyntheticProfessionalReviewAuthority,
} from "@/lib/professional-review/synthetic-authorities";
import { closeDb, db, skipReason } from "../env";
import { scenario } from "../scenario";
import { type FixtureGraph, seedFixtureGraph } from "../seed";

const reason = skipReason();
let graph: FixtureGraph;

before(async () => {
  if (reason) return;
  graph = await seedFixtureGraph();
});

after(async () => {
  await closeDb();
});

const TARGET_KIND = "managed_school_application" as const;

type ReviewHarness = {
  service: ReturnType<typeof createProfessionalReviewService>;
  target: {
    targetId: string;
    targetKind: typeof TARGET_KIND;
    targetSha256: string;
    targetVersion: number;
  };
  actor: {
    actorUserId: string;
    actorRole: string;
    reviewerAssignmentId: string | null;
    reviewerAssignmentStatus: "active";
  };
};

function buildHarness(
  input: { mode?: "allowed" | "denied" } = {}
): ReviewHarness {
  const targetId = `pkg-${randomUUID()}`;
  const targetSha256 = "e".repeat(64);
  const targetVersion = 3;
  const actorUserId = graph.actors.customerA!.id;
  const identity = {
    projectId: graph.projects.A!,
    targetId,
    targetKind: TARGET_KIND,
    targetSha256,
    targetVersion,
  };
  const authority = createSyntheticProfessionalReviewAuthority({
    mode: input.mode ?? "allowed",
    scopes: [
      {
        actions: ["request_review", "record_decision", "read_review"],
        actorUserId,
        projectId: graph.projects.A!,
        targetId,
        targetKind: TARGET_KIND,
        targetVersion,
      },
    ],
  });
  const service = createProfessionalReviewService({
    authority,
    credentialVerifier: createSyntheticProfessionalCredentialVerifier({
      mode: "verified",
      verifiedActorUserIds: [actorUserId],
    }),
    store: createPostgresProfessionalReviewStore(),
    targetProvider: createSyntheticManagedTargetProvider({
      fixtures: [{ identity }],
    }),
  });
  return {
    actor: {
      actorRole: "lawyer",
      actorUserId,
      reviewerAssignmentId: randomUUID(),
      reviewerAssignmentStatus: "active",
    },
    service,
    target: { targetId, targetKind: TARGET_KIND, targetSha256, targetVersion },
  };
}

test(
  "M4-FINAL-INT-06 service-level exact-target approval",
  { skip: reason },
  async () => {
    const result = await scenario({
      authorityGrade: "synthetic_test_only",
      evidenceClass: ["real_postgres", "in_process_synthetic_authority"],
      expected:
        "The real review service drives requested -> in_review -> approved with the exact target version/hash bound in every revision, and an illegal changes_requested -> approved transition is rejected with SQLSTATE 23514.",
      gate: "G4",
      id: "M4-FINAL-INT-06",
      run: async (ctx) => {
        const { actor, service, target } = buildHarness();
        const created = await service.createReviewRequest({
          actor,
          operationId: `int06-create-${randomUUID()}`,
          projectId: graph.projects.A!,
          reviewPurpose: "managed_handoff_authorization",
          reviewScope: ["document_completeness"],
          target,
        });
        const reviewRequestId = (created.record as { reviewRequestId: string })
          .reviewRequestId;
        const started = await service.recordDecision({
          action: "start_review",
          actor,
          boundTargetSha256: target.targetSha256,
          boundTargetVersion: target.targetVersion,
          expectedRevision: (created.record as { revision: number }).revision,
          operationId: `int06-start-${randomUUID()}`,
          projectId: graph.projects.A!,
          reviewRequestId,
        });
        const approved = await service.recordDecision({
          action: "approve",
          actor,
          boundTargetSha256: target.targetSha256,
          boundTargetVersion: target.targetVersion,
          expectedRevision: (started.record as { revision: number }).revision,
          operationId: `int06-approve-${randomUUID()}`,
          projectId: graph.projects.A!,
          reviewRequestId,
        });
        assert.equal((approved.record as { state: string }).state, "approved");

        const request = (await db()`
        select state, revision, "targetId", "targetVersion", "targetSha256", "targetBindingSha256"
        from "ProfessionalReviewRequest" where id = ${reviewRequestId}`) as Array<
          Record<string, unknown>
        >;
        assert.equal(request[0]?.state, "approved");
        assert.equal(request[0]?.targetId, target.targetId);
        assert.equal(request[0]?.targetVersion, target.targetVersion);
        assert.equal(request[0]?.targetSha256, target.targetSha256);
        assert.ok(request[0]?.targetBindingSha256);

        const revisions = (await db()`
        select revision, state, action, "boundTargetVersion", "boundTargetSha256"
        from "ProfessionalReviewRevision" where "reviewRequestId" = ${reviewRequestId}
        order by revision`) as Array<Record<string, unknown>>;
        assert.equal(revisions.length, 3, "append-only revision history");
        assert.deepEqual(
          revisions.map((row) => row.state),
          ["requested", "in_review", "approved"]
        );
        for (const row of revisions) {
          assert.equal(row.boundTargetVersion, target.targetVersion);
          assert.equal(row.boundTargetSha256, target.targetSha256);
        }
        ctx.cite(
          "pg ProfessionalReviewRequest approved with exact target; 3 revision rows bound to the same target"
        );

        // Illegal transition: changes_requested -> approved.
        const second = buildHarness();
        const created2 = await second.service.createReviewRequest({
          actor: second.actor,
          operationId: `int06b-create-${randomUUID()}`,
          projectId: graph.projects.A!,
          reviewPurpose: "managed_handoff_authorization",
          reviewScope: ["document_completeness"],
          target: second.target,
        });
        const id2 = (created2.record as { reviewRequestId: string })
          .reviewRequestId;
        const started2 = await second.service.recordDecision({
          action: "start_review",
          actor: second.actor,
          boundTargetSha256: second.target.targetSha256,
          boundTargetVersion: second.target.targetVersion,
          expectedRevision: 1,
          operationId: `int06b-start-${randomUUID()}`,
          projectId: graph.projects.A!,
          reviewRequestId: id2,
        });
        const changes = await second.service.recordDecision({
          action: "request_changes",
          actor: second.actor,
          boundTargetSha256: second.target.targetSha256,
          boundTargetVersion: second.target.targetVersion,
          expectedRevision: (started2.record as { revision: number }).revision,
          operationId: `int06b-changes-${randomUUID()}`,
          projectId: graph.projects.A!,
          reviewRequestId: id2,
        });
        let illegalCode = "no_error";
        try {
          await second.service.recordDecision({
            action: "approve",
            actor: second.actor,
            boundTargetSha256: second.target.targetSha256,
            boundTargetVersion: second.target.targetVersion,
            expectedRevision: (changes.record as { revision: number }).revision,
            operationId: `int06b-approve-${randomUUID()}`,
            projectId: graph.projects.A!,
            reviewRequestId: id2,
          });
        } catch (error) {
          illegalCode =
            (error as { cause?: { code?: string } }).cause?.code ??
            (error as { code?: string }).code ??
            "unknown";
        }
        assert.equal(
          illegalCode,
          "23514",
          `illegal transition must raise 23514 (${illegalCode})`
        );
        const blocked = (await db()`
        select state, revision from "ProfessionalReviewRequest" where id = ${id2}`) as Array<
          Record<string, unknown>
        >;
        assert.equal(blocked[0]?.state, "changes_requested");
        ctx.cite(
          "pg changes_requested -> approved refused with SQLSTATE 23514"
        );
        return `approved via service with exact target binding (3 revisions); illegal transition refused ${illegalCode}`;
      },
    });
    assert.equal(result.verdict, "PASS", result.observed);
  }
);

test(
  "M4-FINAL-INT-07 approved-then-revoked authority invalidates validity",
  { skip: reason },
  async () => {
    const result = await scenario({
      authorityGrade: "synthetic_test_only",
      evidenceClass: ["real_postgres", "in_process_synthetic_authority"],
      expected:
        "A valid target-bound approval is applicable before revocation and becomes invalid afterwards, so no stale approval can support a protected use.",
      gate: "G4",
      id: "M4-FINAL-INT-07",
      run: async (ctx) => {
        const { actor, service, target } = buildHarness();
        const created = await service.createReviewRequest({
          actor,
          operationId: `int07-create-${randomUUID()}`,
          projectId: graph.projects.A!,
          reviewPurpose: "managed_handoff_authorization",
          reviewScope: ["document_completeness"],
          target,
        });
        const reviewRequestId = (created.record as { reviewRequestId: string })
          .reviewRequestId;
        const started = await service.recordDecision({
          action: "start_review",
          actor,
          boundTargetSha256: target.targetSha256,
          boundTargetVersion: target.targetVersion,
          expectedRevision: 1,
          operationId: `int07-start-${randomUUID()}`,
          projectId: graph.projects.A!,
          reviewRequestId,
        });
        await service.recordDecision({
          action: "approve",
          actor,
          boundTargetSha256: target.targetSha256,
          boundTargetVersion: target.targetVersion,
          expectedRevision: (started.record as { revision: number }).revision,
          operationId: `int07-approve-${randomUUID()}`,
          projectId: graph.projects.A!,
          reviewRequestId,
        });

        const base = {
          credential: {
            status: "verified" as const,
            credentialCode: "synthetic_test_credential",
            verifiedAt: new Date().toISOString(),
          },
          projectId: graph.projects.A!,
          targetId: target.targetId,
          targetKind: TARGET_KIND,
          targetSha256: target.targetSha256,
          targetVersion: target.targetVersion,
        };
        const before = await service.evaluateCurrentValidity({
          ...base,
          assignment: { reviewerUserId: actor.actorUserId, status: "active" },
        });
        assert.equal(
          before.status,
          "valid",
          `approval must be applicable before revocation (${JSON.stringify(before)})`
        );
        ctx.cite(`validity before revocation: ${before.status}`);

        const after = await service.evaluateCurrentValidity({
          ...base,
          assignment: { status: "revoked" },
        });
        assert.equal(
          after.status,
          "invalid",
          `approval must be invalid after revocation (${JSON.stringify(after)})`
        );
        ctx.cite(
          `validity after revocation: ${after.status} (${(after as { reasonCode?: string }).reasonCode})`
        );
        return `valid before revocation -> ${after.status} after revocation (${(after as { reasonCode?: string }).reasonCode})`;
      },
    });
    assert.equal(result.verdict, "PASS", result.observed);
  }
);

test(
  "M4-FINAL-INT-12 concurrent revision race cannot create approval",
  { skip: reason },
  async () => {
    const result = await scenario({
      authorityGrade: "synthetic_test_only",
      evidenceClass: ["real_postgres", "in_process_synthetic_authority"],
      expected:
        "Two concurrent approvals at the same expected revision produce exactly one winner and one conflict; the loser cannot create approval, revision advances once, and readiness precedence (NOT_READY for missing, UNKNOWN for undetermined, never READY) is preserved.",
      gate: "G4",
      id: "M4-FINAL-INT-12",
      run: async (ctx) => {
        const { actor, service, target } = buildHarness();
        const created = await service.createReviewRequest({
          actor,
          operationId: `int12-create-${randomUUID()}`,
          projectId: graph.projects.A!,
          reviewPurpose: "managed_handoff_authorization",
          reviewScope: ["document_completeness"],
          target,
        });
        const reviewRequestId = (created.record as { reviewRequestId: string })
          .reviewRequestId;
        const started = await service.recordDecision({
          action: "start_review",
          actor,
          boundTargetSha256: target.targetSha256,
          boundTargetVersion: target.targetVersion,
          expectedRevision: 1,
          operationId: `int12-start-${randomUUID()}`,
          projectId: graph.projects.A!,
          reviewRequestId,
        });
        const revision = (started.record as { revision: number }).revision;
        const decisions = await Promise.allSettled([
          service.recordDecision({
            action: "approve",
            actor,
            boundTargetSha256: target.targetSha256,
            boundTargetVersion: target.targetVersion,
            expectedRevision: revision,
            operationId: `int12-a-${randomUUID()}`,
            projectId: graph.projects.A!,
            reviewRequestId,
          }),
          service.recordDecision({
            action: "approve",
            actor,
            boundTargetSha256: target.targetSha256,
            boundTargetVersion: target.targetVersion,
            expectedRevision: revision,
            operationId: `int12-b-${randomUUID()}`,
            projectId: graph.projects.A!,
            reviewRequestId,
          }),
        ]);
        const winners = decisions.filter(
          (entry) => entry.status === "fulfilled"
        );
        const losers = decisions.filter(
          (entry): entry is PromiseRejectedResult => entry.status === "rejected"
        );
        assert.equal(winners.length, 1, "exactly one concurrent approval wins");
        assert.equal(
          losers.length,
          1,
          "exactly one concurrent approval conflicts"
        );
        const rows = (await db()`
        select revision, state from "ProfessionalReviewRevision"
        where "reviewRequestId" = ${reviewRequestId} order by revision`) as Array<
          Record<string, unknown>
        >;
        const approvedRows = rows.filter((row) => row.state === "approved");
        assert.equal(
          approvedRows.length,
          1,
          "only one approved revision exists"
        );
        assert.equal(
          rows.at(-1)?.revision,
          revision + 1,
          "revision advanced exactly once"
        );

        const validity = await service.evaluateCurrentValidity({
          assignment: { status: "pending" },
          credential: { status: "unverified" },
          projectId: graph.projects.A!,
          targetId: target.targetId,
          targetKind: TARGET_KIND,
          targetSha256: target.targetSha256,
          targetVersion: target.targetVersion,
        });
        assert.notEqual(
          validity.status,
          "valid",
          "a raced/unresolved state must never be valid"
        );
        ctx.cite(
          `concurrent approvals: ${winners.length} winner / ${losers.length} conflict; validity ${validity.status}`
        );
        ctx.note(
          "Owner-approved precedence (Correction D): missing prerequisites -> NOT_READY; undetermined -> UNKNOWN; neither may produce READY. At the review layer the equivalent rule is: never `valid` without a complete applicable binding."
        );
        return `one winner / one conflict; one approved revision; revision +1; validity ${validity.status}`;
      },
    });
    assert.equal(result.verdict, "PASS", result.observed);
  }
);

test(
  "M4-FINAL-DB-01 review revision append-only protections",
  { skip: reason },
  async () => {
    const result = await scenario({
      authorityGrade: "real_postgres",
      evidenceClass: ["real_postgres"],
      expected:
        "ProfessionalReviewRevision refuses UPDATE and DELETE with real SQLSTATE evidence and the revision rows and audit chain are unchanged afterwards.",
      gate: "G4",
      id: "M4-FINAL-DB-01",
      run: async (ctx) => {
        const { actor, service, target } = buildHarness();
        const created = await service.createReviewRequest({
          actor,
          operationId: `db01-create-${randomUUID()}`,
          projectId: graph.projects.A!,
          reviewPurpose: "managed_handoff_authorization",
          reviewScope: ["document_completeness"],
          target,
        });
        const reviewRequestId = (created.record as { reviewRequestId: string })
          .reviewRequestId;
        const before = (await db()`
        select id, revision, state, action from "ProfessionalReviewRevision"
        where "reviewRequestId" = ${reviewRequestId} order by revision`) as Array<
          Record<string, unknown>
        >;
        assert.ok(before.length >= 1);

        const probe = async (statement: () => Promise<unknown>) => {
          try {
            await statement();
            return "no_error";
          } catch (error) {
            return (error as { code?: string }).code ?? "unknown";
          }
        };
        const updateCode = await probe(
          () => db()`
        update "ProfessionalReviewRevision" set state = 'approved'
        where "reviewRequestId" = ${reviewRequestId}`
        );
        const deleteCode = await probe(
          () => db()`
        delete from "ProfessionalReviewRevision" where "reviewRequestId" = ${reviewRequestId}`
        );
        assert.equal(
          updateCode,
          "23514",
          `revision UPDATE must be refused (${updateCode})`
        );
        assert.equal(
          deleteCode,
          "23514",
          `revision DELETE must be refused (${deleteCode})`
        );

        const after = (await db()`
        select id, revision, state, action from "ProfessionalReviewRevision"
        where "reviewRequestId" = ${reviewRequestId} order by revision`) as Array<
          Record<string, unknown>
        >;
        assert.deepEqual(
          after,
          before,
          "revision rows unchanged after refusals"
        );
        ctx.cite(
          `pg revision UPDATE ${updateCode} / DELETE ${deleteCode}; rows unchanged`
        );
        return `revision UPDATE refused ${updateCode}, DELETE refused ${deleteCode}; ${after.length} rows unchanged`;
      },
    });
    assert.equal(result.verdict, "PASS", result.observed);
  }
);

test("M4-FINAL-DB-02 request projection guards", { skip: reason }, async () => {
  const result = await scenario({
    authorityGrade: "real_postgres",
    evidenceClass: ["real_postgres"],
    expected:
      "ProfessionalReviewRequest refuses revision skips, target rebinding and illegal transitions, leaving head, revision and history unchanged.",
    gate: "G4",
    id: "M4-FINAL-DB-02",
    run: async (ctx) => {
      const { actor, service, target } = buildHarness();
      const created = await service.createReviewRequest({
        actor,
        operationId: `db02-create-${randomUUID()}`,
        projectId: graph.projects.A!,
        reviewPurpose: "managed_handoff_authorization",
        reviewScope: ["document_completeness"],
        target,
      });
      const reviewRequestId = (created.record as { reviewRequestId: string })
        .reviewRequestId;
      const baseline = (await db()`
        select state, revision, "targetSha256" from "ProfessionalReviewRequest"
        where id = ${reviewRequestId}`) as Array<Record<string, unknown>>;
      const eventsBefore = (await db()`
        select count(*)::int as n from "ProfessionalReviewRevision"
        where "reviewRequestId" = ${reviewRequestId}`) as Array<{ n: number }>;

      const probe = async (statement: () => Promise<unknown>) => {
        try {
          await statement();
          return "no_error";
        } catch (error) {
          return (error as { code?: string }).code ?? "unknown";
        }
      };
      const skipCode = await probe(
        () => db()`
        update "ProfessionalReviewRequest" set revision = revision + 5
        where id = ${reviewRequestId}`
      );
      const rebindCode = await probe(
        () => db()`
        update "ProfessionalReviewRequest" set "targetSha256" = ${"f".repeat(64)}
        where id = ${reviewRequestId}`
      );
      const illegalCode = await probe(
        () => db()`
        update "ProfessionalReviewRequest" set state = 'approved', revision = revision + 1
        where id = ${reviewRequestId}`
      );

      assert.equal(
        skipCode,
        "23514",
        `revision skip must be refused (${skipCode})`
      );
      assert.equal(
        rebindCode,
        "23514",
        `target rebinding must be refused (${rebindCode})`
      );
      assert.equal(
        illegalCode,
        "23514",
        `illegal transition must be refused (${illegalCode})`
      );
      const after = (await db()`
        select state, revision, "targetSha256" from "ProfessionalReviewRequest"
        where id = ${reviewRequestId}`) as Array<Record<string, unknown>>;
      assert.deepEqual(
        after,
        baseline,
        "request head unchanged after refusals"
      );
      const eventsAfter = (await db()`
        select count(*)::int as n from "ProfessionalReviewRevision"
        where "reviewRequestId" = ${reviewRequestId}`) as Array<{ n: number }>;
      assert.equal(
        eventsAfter[0]?.n,
        eventsBefore[0]?.n,
        "revision history unchanged"
      );
      ctx.cite(
        `pg guards: skip ${skipCode}, rebind ${rebindCode}, illegal ${illegalCode}`
      );
      return `revision-skip ${skipCode}; rebind ${rebindCode}; illegal transition ${illegalCode}; head and history unchanged`;
    },
  });
  assert.equal(result.verdict, "PASS", result.observed);
});
