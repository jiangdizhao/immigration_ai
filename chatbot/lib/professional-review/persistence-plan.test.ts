import assert from "node:assert/strict";
import { test } from "node:test";
import { managedTargetIdentitySha256 } from "@/lib/managed-target/policy";
import {
  planProfessionalReviewAppend,
  planProfessionalReviewCreate,
} from "./persistence-plan";
import type { ProfessionalReviewRecord } from "./policy";

/**
 * INT-03, INT-04 and INT-05: the durability decision procedure that the PostgreSQL
 * adapter applies after it locks the head row. These prove the concurrency and
 * replay semantics without a database; the database then enforces them with
 * row locks, unique indexes and the append-only trigger.
 */
const PROJECT = "11111111-1111-4111-8111-111111111111";
const HASH = "a".repeat(64);
const BINDING = managedTargetIdentitySha256({
  projectId: PROJECT,
  targetId: "school-package-001",
  targetKind: "managed_school_application",
  targetSha256: HASH,
  targetVersion: 3,
});

function record(
  overrides: Partial<ProfessionalReviewRecord> = {}
): ProfessionalReviewRecord {
  return {
    decision: {
      action: "start_review",
      authorityCode: "synthetic_test_scoped_review_authority",
      boundTargetSha256: HASH,
      boundTargetVersion: 3,
      commentSha256: null,
      credentialCode: null,
      decidedAt: "2026-10-30T00:00:00.000Z",
      decidedByUserId: "22222222-2222-4222-8222-222222222222",
      reasonCode: null,
      revision: 2,
    },
    operationId: "op-2",
    projectId: PROJECT,
    requestSha256: "b".repeat(64),
    requestedAt: "2026-10-29T00:00:00.000Z",
    requestedByUserId: "22222222-2222-4222-8222-222222222222",
    reviewPurpose: "managed_handoff_authorization",
    reviewRequestId: "33333333-3333-4333-8333-333333333333",
    reviewScope: ["eligibility_review"],
    reviewerUserId: "22222222-2222-4222-8222-222222222222",
    revision: 2,
    state: "in_review",
    target: {
      projectId: PROJECT,
      targetId: "school-package-001",
      targetKind: "managed_school_application",
      targetSha256: HASH,
      targetVersion: 3,
    },
    targetBindingSha256: BINDING,
    ...overrides,
  };
}

const HEAD = {
  projectId: PROJECT,
  revision: 1,
  state: "requested",
  targetBindingSha256: BINDING,
};

test("INT-03: two decisions at the same revision cannot both win", () => {
  const first = planProfessionalReviewAppend({
    current: HEAD,
    expectedRevision: 1,
    operation: null,
    record: record(),
    requestSha256: "b".repeat(64),
  });
  assert.deepEqual(first, { kind: "insert", revision: 2 });
  // The second writer still believes the head is revision 1.
  const second = planProfessionalReviewAppend({
    current: { ...HEAD, revision: 2, state: "in_review" },
    expectedRevision: 1,
    operation: null,
    record: record({ operationId: "op-3" }),
    requestSha256: "c".repeat(64),
  });
  assert.deepEqual(second, { kind: "conflict", reason: "revision_conflict" });
});

test("INT-04/INT-05: exact replay is idempotent and a changed request conflicts", () => {
  const replay = planProfessionalReviewAppend({
    current: { ...HEAD, revision: 2, state: "in_review" },
    expectedRevision: 1,
    operation: { requestSha256: "b".repeat(64), revision: 2 },
    record: record(),
    requestSha256: "b".repeat(64),
  });
  assert.deepEqual(replay, { kind: "replay", revision: 2 });

  const conflict = planProfessionalReviewAppend({
    current: { ...HEAD, revision: 2, state: "in_review" },
    expectedRevision: 1,
    operation: { requestSha256: "b".repeat(64), revision: 2 },
    record: record({ operationId: "op-2" }),
    requestSha256: "d".repeat(64),
  });
  assert.deepEqual(conflict, {
    kind: "conflict",
    reason: "idempotency_conflict",
  });
});

test("create is idempotent per operation and never cross-Project", () => {
  assert.deepEqual(
    planProfessionalReviewCreate({
      existingOperation: null,
      requestSha256: "a".repeat(64),
    }),
    { kind: "insert" }
  );
  assert.deepEqual(
    planProfessionalReviewCreate({
      existingOperation: {
        requestSha256: "a".repeat(64),
        reviewRequestId: "44444444-4444-4444-8444-444444444444",
      },
      requestSha256: "a".repeat(64),
    }),
    { kind: "replay", reviewRequestId: "44444444-4444-4444-8444-444444444444" }
  );
  assert.deepEqual(
    planProfessionalReviewCreate({
      existingOperation: {
        requestSha256: "a".repeat(64),
        reviewRequestId: "44444444-4444-4444-8444-444444444444",
      },
      requestSha256: "b".repeat(64),
    }),
    { kind: "conflict", reason: "idempotency_conflict" }
  );
});

test("append refuses cross-Project, missing and rebound targets", () => {
  assert.deepEqual(
    planProfessionalReviewAppend({
      current: null,
      expectedRevision: 1,
      operation: null,
      record: record(),
      requestSha256: "b".repeat(64),
    }),
    { kind: "not_found" }
  );
  assert.deepEqual(
    planProfessionalReviewAppend({
      current: { ...HEAD, projectId: "99999999-9999-4999-8999-999999999999" },
      expectedRevision: 1,
      operation: null,
      record: record(),
      requestSha256: "b".repeat(64),
    }),
    { kind: "not_found" }
  );
  assert.deepEqual(
    planProfessionalReviewAppend({
      current: { ...HEAD, targetBindingSha256: "e".repeat(64) },
      expectedRevision: 1,
      operation: null,
      record: record(),
      requestSha256: "b".repeat(64),
    }),
    { kind: "conflict", reason: "integrity_conflict" }
  );
});
