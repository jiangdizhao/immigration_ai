// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertion helpers are only called from test bodies in this file.
// biome-ignore-all lint/suspicious/useAwait: promise helpers intentionally avoid await.
import assert from "node:assert/strict";
import { test } from "node:test";
import { managedTargetIdentitySha256 } from "@/lib/managed-target/policy";
import { denyAllProfessionalReviewAuthority } from "./authority";
import { ProfessionalReviewError } from "./errors";
import { createProfessionalReviewService } from "./service";
import { createInMemoryProfessionalReviewStore } from "./store";
import {
  createSyntheticManagedTargetProvider,
  createSyntheticProfessionalCredentialVerifier,
  createSyntheticProfessionalReviewAuthority,
} from "./synthetic-authorities";
import type { ManagedTargetProvider } from "./target-provider";

/**
 * REV-01, REV-02, REV-03, REV-05, REV-06, REV-11 plus target-change handling.
 * All authority here is explicitly synthetic test-only.
 */
const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT = "99999999-9999-4999-8999-999999999999";
const REVIEWER = "22222222-2222-4222-8222-222222222222";
const OTHER_REVIEWER = "33333333-3333-4333-8333-333333333333";
const TARGET_ID = "school-package-001";
const TARGET_KIND = "managed_school_application" as const;
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const REVIEW_ID = "44444444-4444-4444-8444-444444444444";
const IDENTITY = {
  projectId: PROJECT,
  targetId: TARGET_ID,
  targetKind: TARGET_KIND,
  targetSha256: HASH_A,
  targetVersion: 3,
};
const TARGET = {
  targetId: TARGET_ID,
  targetKind: TARGET_KIND,
  targetSha256: HASH_A,
  targetVersion: 3,
};
const ACTOR = {
  actorRole: "lawyer",
  actorUserId: REVIEWER,
  reviewerAssignmentId: "assignment-1",
  reviewerAssignmentStatus: "active" as const,
};

function harness(
  options: {
    authorityMode?: "allowed" | "denied" | "unavailable";
    credentialMode?: "verified" | "unverified" | "unavailable" | "throws";
    provider?: ManagedTargetProvider;
    scopes?: Array<{
      actions: readonly (
        | "request_review"
        | "record_decision"
        | "read_review"
      )[];
      actorUserId: string;
      projectId?: string;
      targetId?: string;
      targetKind?: typeof TARGET_KIND;
      targetVersion?: number;
    }>;
  } = {}
) {
  const store = createInMemoryProfessionalReviewStore();
  const provider =
    options.provider ??
    createSyntheticManagedTargetProvider({
      fixtures: [{ identity: IDENTITY }],
    });
  const scopes = (
    options.scopes ?? [
      {
        actions: ["request_review", "record_decision", "read_review"] as const,
        actorUserId: REVIEWER,
      },
    ]
  ).map((scope) => ({
    actions: scope.actions,
    actorUserId: scope.actorUserId,
    projectId: scope.projectId ?? PROJECT,
    targetId: scope.targetId ?? TARGET_ID,
    targetKind: scope.targetKind ?? TARGET_KIND,
    targetVersion: scope.targetVersion ?? 3,
  }));
  const service = createProfessionalReviewService({
    authority: createSyntheticProfessionalReviewAuthority({
      mode: options.authorityMode ?? "allowed",
      scopes,
    }),
    credentialVerifier: createSyntheticProfessionalCredentialVerifier({
      mode: options.credentialMode ?? "verified",
      verifiedActorUserIds: [REVIEWER],
    }),
    newReviewRequestId: () => REVIEW_ID,
    now: () => new Date("2026-10-30T00:00:00.000Z"),
    store,
    targetProvider: provider,
  });
  return { service, store };
}

async function createRequest(
  service: ReturnType<typeof harness>["service"],
  overrides: Record<string, unknown> = {}
) {
  return service.createReviewRequest({
    actor: ACTOR,
    operationId: "op-create-1",
    projectId: PROJECT,
    reviewPurpose: "managed_handoff_authorization",
    reviewScope: ["eligibility_review"],
    target: TARGET,
    ...overrides,
  });
}

async function approveFlow(service: ReturnType<typeof harness>["service"]) {
  await createRequest(service);
  await service.recordDecision({
    action: "start_review",
    actor: ACTOR,
    boundTargetSha256: HASH_A,
    boundTargetVersion: 3,
    expectedRevision: 1,
    operationId: "op-start-1",
    projectId: PROJECT,
    reviewRequestId: REVIEW_ID,
  });
  return service.recordDecision({
    action: "approve",
    actor: ACTOR,
    boundTargetSha256: HASH_A,
    boundTargetVersion: 3,
    comment: "synthetic review note",
    expectedRevision: 2,
    operationId: "op-approve-1",
    projectId: PROJECT,
    reviewRequestId: REVIEW_ID,
  });
}

async function rejectsWith(
  code: string,
  operation: () => Promise<unknown>
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof ProfessionalReviewError, String(error));
    assert.equal(error.code, code);
    return true;
  });
}

test("REV-01: a review request binds the provider's exact immutable target", async () => {
  const { service, store } = harness();
  const created = await createRequest(service);
  assert.equal(created.replayed, false);
  assert.equal(created.record.state, "requested");
  assert.equal(created.record.revision, 1);
  assert.equal(created.record.decision, null);
  assert.equal(
    created.record.targetBindingSha256,
    managedTargetIdentitySha256(IDENTITY)
  );
  assert.deepEqual(created.record.reviewScope, ["eligibility_review"]);
  assert.equal((await store.listHistory(REVIEW_ID)).length, 1);

  // Negative controls: unsupported kind, untrusted source, wrong version, no scope.
  await rejectsWith("target_kind_unsupported", () =>
    createRequest(harness().service, {
      target: { ...TARGET, targetKind: "visa_application" },
    })
  );
  const untrusted = harness({
    provider: createSyntheticManagedTargetProvider({
      fixtures: [{ identity: IDENTITY }],
      mode: "untrusted",
    }),
  });
  await rejectsWith("target_untrusted", () => createRequest(untrusted.service));
  await rejectsWith("target_mismatch", () =>
    createRequest(harness().service, {
      target: { ...TARGET, targetVersion: 4 },
    })
  );
  await rejectsWith("target_mismatch", () =>
    createRequest(harness().service, {
      target: { ...TARGET, targetSha256: HASH_B },
    })
  );
  await rejectsWith("invalid_request", () =>
    createRequest(harness().service, { reviewScope: [] })
  );
  const unavailable = harness({
    provider: createSyntheticManagedTargetProvider({
      fixtures: [],
      mode: "unavailable",
    }),
  });
  await rejectsWith("unavailable", () => createRequest(unavailable.service));
});

test("REV-02: the production authority denies every action regardless of role", async () => {
  const store = createInMemoryProfessionalReviewStore();
  const service = createProfessionalReviewService({
    authority: denyAllProfessionalReviewAuthority,
    credentialVerifier: createSyntheticProfessionalCredentialVerifier({
      mode: "verified",
      verifiedActorUserIds: [REVIEWER],
    }),
    newReviewRequestId: () => REVIEW_ID,
    store,
    targetProvider: createSyntheticManagedTargetProvider({
      fixtures: [{ identity: IDENTITY }],
    }),
  });
  for (const actorRole of ["lawyer", "admin", "user"]) {
    await rejectsWith("unavailable", () =>
      createRequest(service, { actor: { ...ACTOR, actorRole } })
    );
  }
  assert.equal((await store.listHistory(REVIEW_ID)).length, 0);
});

test("REV-03: an authorized synthetic approval binds the reviewed target immutably", async () => {
  const { service, store } = harness();
  const approved = await approveFlow(service);
  assert.equal(approved.record.state, "approved");
  assert.equal(approved.record.revision, 3);
  assert.equal(approved.record.decision?.boundTargetVersion, 3);
  assert.equal(approved.record.decision?.boundTargetSha256, HASH_A);
  assert.equal(
    approved.record.decision?.credentialCode,
    "synthetic_test_practising_certificate"
  );
  assert.equal(approved.record.decision?.commentSha256?.length, 64);
  const history = await store.listHistory(REVIEW_ID);
  assert.deepEqual(
    history.map((entry) => entry.state),
    ["requested", "in_review", "approved"]
  );

  // A reviewer who is not scoped for this target cannot decide.
  const unscoped = harness();
  await createRequest(unscoped.service);
  await rejectsWith("authority_denied", () =>
    unscoped.service.recordDecision({
      action: "start_review",
      actor: { ...ACTOR, actorUserId: OTHER_REVIEWER },
      boundTargetSha256: HASH_A,
      boundTargetVersion: 3,
      expectedRevision: 1,
      operationId: "op-other",
      projectId: PROJECT,
      reviewRequestId: REVIEW_ID,
    })
  );
  // A reviewer scoped for a different project cannot decide either.
  const crossProject = harness({
    scopes: [
      {
        actions: ["request_review", "record_decision"],
        actorUserId: REVIEWER,
        projectId: OTHER_PROJECT,
      },
    ],
  });
  await rejectsWith("authority_denied", () =>
    createRequest(crossProject.service)
  );
});

test("REV-03: approval requires a verified professional credential", async () => {
  for (const [mode, code] of [
    ["unverified", "authority_denied"],
    ["unavailable", "unavailable"],
    ["throws", "unavailable"],
  ] as const) {
    const { service } = harness({ credentialMode: mode });
    await createRequest(service);
    await service.recordDecision({
      action: "start_review",
      actor: ACTOR,
      boundTargetSha256: HASH_A,
      boundTargetVersion: 3,
      expectedRevision: 1,
      operationId: "op-start",
      projectId: PROJECT,
      reviewRequestId: REVIEW_ID,
    });
    await rejectsWith(code, () =>
      service.recordDecision({
        action: "approve",
        actor: ACTOR,
        boundTargetSha256: HASH_A,
        boundTargetVersion: 3,
        expectedRevision: 2,
        operationId: "op-approve",
        projectId: PROJECT,
        reviewRequestId: REVIEW_ID,
      })
    );
  }
});

test("REV-05: concurrent decisions are compare-and-set, not last-write-wins", async () => {
  const { service, store } = harness();
  await createRequest(service);
  const decision = (operationId: string) =>
    service.recordDecision({
      action: "start_review",
      actor: ACTOR,
      boundTargetSha256: HASH_A,
      boundTargetVersion: 3,
      expectedRevision: 1,
      operationId,
      projectId: PROJECT,
      reviewRequestId: REVIEW_ID,
    });
  const results = await Promise.allSettled([
    decision("op-a"),
    decision("op-b"),
    decision("op-c"),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 2);
  for (const failure of rejected) {
    const error = (failure as PromiseRejectedResult).reason;
    assert.ok(error instanceof ProfessionalReviewError);
    assert.equal(error.code, "revision_conflict");
  }
  const history = await store.listHistory(REVIEW_ID);
  assert.equal(history.length, 2);
  assert.equal(history.at(-1)?.revision, 2);
  // A stale revision can never regress the record.
  await rejectsWith("revision_conflict", () => decision("op-stale"));
});

test("REV-06: replay is idempotent and a changed request conflicts", async () => {
  const { service } = harness();
  await createRequest(service);
  const approve = (operationId: string, comment: string) =>
    service.recordDecision({
      action: "start_review",
      actor: ACTOR,
      boundTargetSha256: HASH_A,
      boundTargetVersion: 3,
      comment,
      expectedRevision: 1,
      operationId,
      projectId: PROJECT,
      reviewRequestId: REVIEW_ID,
    });
  const first = await approve("op-start", "note");
  assert.equal(first.replayed, false);
  const replay = await approve("op-start", "note");
  assert.equal(replay.replayed, true);
  assert.equal(replay.record.revision, first.record.revision);
  await rejectsWith("idempotency_conflict", () =>
    approve("op-start", "different")
  );
  await rejectsWith("idempotency_conflict", () =>
    service.recordDecision({
      action: "reject",
      actor: ACTOR,
      boundTargetSha256: HASH_A,
      boundTargetVersion: 3,
      comment: "note",
      expectedRevision: 1,
      operationId: "op-start",
      projectId: PROJECT,
      reviewRequestId: REVIEW_ID,
    })
  );
  assert.equal(
    (
      await service.readReview({
        actor: ACTOR,
        projectId: PROJECT,
        reviewRequestId: REVIEW_ID,
      })
    ).revision,
    2
  );
  // A different Project cannot read the record (no cross-project disclosure).
  await rejectsWith("not_found", () =>
    service.readReview({
      actor: ACTOR,
      projectId: OTHER_PROJECT,
      reviewRequestId: REVIEW_ID,
    })
  );
});

test("REV-11: invalidation is terminal, auditable and reason-coded", async () => {
  const { service, store } = harness();
  await approveFlow(service);
  const invalidated = await service.recordDecision({
    action: "invalidate",
    actor: ACTOR,
    boundTargetSha256: HASH_A,
    boundTargetVersion: 3,
    expectedRevision: 3,
    operationId: "op-invalidate",
    projectId: PROJECT,
    reasonCode: "target_withdrawn",
    reviewRequestId: REVIEW_ID,
  });
  assert.equal(invalidated.record.state, "invalidated");
  assert.equal(invalidated.record.decision?.reasonCode, "target_withdrawn");
  const history = await store.listHistory(REVIEW_ID);
  assert.equal(history.length, 4);
  assert.equal(history[2]?.state, "approved");
  await rejectsWith("state_conflict", () =>
    service.recordDecision({
      action: "approve",
      actor: ACTOR,
      boundTargetSha256: HASH_A,
      boundTargetVersion: 3,
      expectedRevision: 4,
      operationId: "op-approve-again",
      projectId: PROJECT,
      reviewRequestId: REVIEW_ID,
    })
  );
  await rejectsWith("state_conflict", () =>
    service.recordDecision({
      action: "invalidate",
      actor: ACTOR,
      boundTargetSha256: HASH_A,
      boundTargetVersion: 3,
      expectedRevision: 4,
      operationId: "op-invalidate-again",
      projectId: PROJECT,
      reviewRequestId: REVIEW_ID,
    })
  );
});

test("a changed target invalidates the approval without mutating history", async () => {
  let version = 3;
  let hash = HASH_A;
  const mutable: ManagedTargetProvider = {
    code: "synthetic_mutable_provider",
    provenance: "synthetic_test",
    resolve({ projectId, targetId, targetKind }) {
      return {
        identity: {
          projectId,
          targetId,
          targetKind: targetKind as typeof TARGET_KIND,
          targetSha256: hash,
          targetVersion: version,
        },
        provenance: "synthetic_test",
        resolvedAt: "2026-10-30T00:00:00.000Z",
        status: "resolved",
      };
    },
  };
  const { service, store } = harness({ provider: mutable });
  await approveFlow(service);
  version = 4;
  hash = HASH_B;
  // A decision that claims the old target is refused once the target moved on.
  await rejectsWith("state_conflict", () =>
    service.recordDecision({
      action: "approve",
      actor: ACTOR,
      boundTargetSha256: HASH_A,
      boundTargetVersion: 3,
      expectedRevision: 3,
      operationId: "op-approve-stale-target",
      projectId: PROJECT,
      reviewRequestId: REVIEW_ID,
    })
  );
  const validity = await service.evaluateCurrentValidity({
    assignment: { reviewerUserId: REVIEWER, status: "active" },
    credential: {
      credentialCode: "synthetic_test_practising_certificate",
      status: "verified",
    },
    projectId: PROJECT,
    targetId: TARGET_ID,
    targetKind: TARGET_KIND,
    targetSha256: HASH_B,
    targetVersion: 4,
  });
  assert.equal(validity.status, "invalid");
  assert.equal(
    validity.status === "invalid" && validity.reasonCode,
    "review_target_changed"
  );
  // The stored history is untouched: the approval is invalid, not rewritten.
  const history = await store.listHistory(REVIEW_ID);
  assert.deepEqual(
    history.map((entry) => entry.state),
    ["requested", "in_review", "approved"]
  );
});

test("SYS-14: review operation replay is idempotent and conflicts are rejected", async () => {
  const { service, store } = harness();
  await createRequest(service);
  const decide = (
    operationId: string,
    expectedRevision: number,
    action: string
  ) =>
    service.recordDecision({
      action,
      actor: ACTOR,
      boundTargetSha256: HASH_A,
      boundTargetVersion: 3,
      expectedRevision,
      operationId,
      projectId: PROJECT,
      reviewRequestId: REVIEW_ID,
    });
  const first = await decide("sys14-op", 1, "start_review");
  const replay = await decide("sys14-op", 1, "start_review");
  assert.equal(replay.replayed, true);
  assert.equal(replay.record.revision, first.record.revision);
  assert.equal((await store.listHistory(REVIEW_ID)).length, 2);
  await rejectsWith("idempotency_conflict", () =>
    decide("sys14-op", 1, "reject")
  );
  await rejectsWith("idempotency_conflict", () =>
    decide("sys14-op", 2, "start_review")
  );
  // A genuinely new operation still advances the record exactly once.
  const next = await decide("sys14-op-2", 2, "approve");
  assert.equal(next.record.state, "approved");
  assert.equal((await store.listHistory(REVIEW_ID)).length, 3);
});
