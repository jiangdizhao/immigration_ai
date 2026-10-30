import assert from "node:assert/strict";
import { test } from "node:test";
import {
  managedTargetIdentitySha256,
  managedTargetIdentityValid,
  sameManagedTargetVersion,
} from "@/lib/managed-target/policy";
import {
  evaluateProfessionalReviewValidity,
  isProfessionalReviewEnabled,
  PROFESSIONAL_REVIEW_STATES,
  type ProfessionalReviewRecord,
  professionalReviewBinding,
  professionalReviewOperationSha256,
  professionalReviewScopeValid,
  professionalReviewTransitionAllowed,
} from "./policy";

/**
 * REV-04, REV-07, REV-08, REV-09 and the canonical-target rules (frozen in
 * PHASE13_M4_006_007_FROZEN_ACCEPTANCE_CONTRACT.md).
 */
const PROJECT = "11111111-1111-4111-8111-111111111111";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const TARGET = {
  projectId: PROJECT,
  targetId: "school-package-001",
  targetKind: "managed_school_application" as const,
  targetSha256: HASH_A,
  targetVersion: 3,
};

function approvedRecord(
  overrides: Partial<ProfessionalReviewRecord> = {}
): ProfessionalReviewRecord {
  return {
    decision: {
      action: "approve",
      authorityCode: "synthetic_test_scoped_review_authority",
      boundTargetSha256: HASH_A,
      boundTargetVersion: 3,
      commentSha256: null,
      credentialCode: "synthetic_test_practising_certificate",
      decidedAt: "2026-10-30T00:00:00.000Z",
      decidedByUserId: "reviewer-1",
      reasonCode: null,
      revision: 2,
    },
    operationId: "op-approve",
    projectId: PROJECT,
    requestSha256: "c".repeat(64),
    requestedAt: "2026-10-29T00:00:00.000Z",
    requestedByUserId: "reviewer-1",
    reviewPurpose: "managed_handoff_authorization",
    reviewRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    reviewScope: ["eligibility_review"],
    reviewerUserId: "reviewer-1",
    revision: 2,
    state: "approved",
    target: TARGET,
    targetBindingSha256: managedTargetIdentitySha256(TARGET),
    ...overrides,
  };
}

const ACTIVE = { reviewerUserId: "reviewer-1", status: "active" } as const;
const VERIFIED = {
  credentialCode: "synthetic_test_practising_certificate",
  status: "verified",
} as const;

test("REV-04: only the frozen transition graph is accepted", () => {
  assert.equal(
    professionalReviewTransitionAllowed("requested", "start_review"),
    true
  );
  assert.equal(
    professionalReviewTransitionAllowed("requested", "approve"),
    false
  );
  assert.equal(
    professionalReviewTransitionAllowed("requested", "request_changes"),
    false
  );
  assert.equal(
    professionalReviewTransitionAllowed("in_review", "approve"),
    true
  );
  assert.equal(
    professionalReviewTransitionAllowed("in_review", "request_changes"),
    true
  );
  assert.equal(
    professionalReviewTransitionAllowed("in_review", "reject"),
    true
  );
  assert.equal(
    professionalReviewTransitionAllowed("approved", "approve"),
    false
  );
  assert.equal(
    professionalReviewTransitionAllowed("rejected", "approve"),
    false
  );
  assert.equal(
    professionalReviewTransitionAllowed("changes_requested", "approve"),
    false
  );
  assert.equal(
    professionalReviewTransitionAllowed("changes_requested", "start_review"),
    false
  );
  const openStates = PROFESSIONAL_REVIEW_STATES.filter(
    (state) => state !== "invalidated"
  );
  for (const state of openStates) {
    assert.equal(
      professionalReviewTransitionAllowed(state, "invalidate"),
      true,
      `${state} must be invalidatable`
    );
  }
  assert.equal(
    professionalReviewTransitionAllowed("invalidated", "invalidate"),
    false
  );
  assert.equal(
    professionalReviewTransitionAllowed("invalidated", "approve"),
    false
  );
});

test("REV-07: an approval is valid only for the exact target version and hash", () => {
  const base = {
    assignment: ACTIVE,
    credential: VERIFIED,
    providerTrustsTarget: true,
    record: approvedRecord(),
  };
  assert.equal(
    evaluateProfessionalReviewValidity({
      ...base,
      currentTarget: { targetSha256: HASH_A, targetVersion: 3 },
    }).status,
    "valid"
  );
  for (const currentTarget of [
    { targetSha256: HASH_B, targetVersion: 3 },
    { targetSha256: HASH_A, targetVersion: 4 },
    { targetSha256: HASH_B, targetVersion: 4 },
  ]) {
    const validity = evaluateProfessionalReviewValidity({
      ...base,
      currentTarget,
    });
    assert.equal(validity.status, "invalid");
    assert.equal(
      validity.status === "invalid" && validity.reasonCode,
      "review_target_changed"
    );
  }
  // Untrusted or unresolvable target metadata can never be valid.
  const unresolved = evaluateProfessionalReviewValidity({
    ...base,
    currentTarget: null,
  });
  assert.equal(unresolved.status, "unknown");
  const untrusted = evaluateProfessionalReviewValidity({
    ...base,
    currentTarget: { targetSha256: HASH_A, targetVersion: 3 },
    providerTrustsTarget: false,
  });
  assert.equal(untrusted.status, "unknown");
  // The stored record is never mutated by evaluation.
  assert.equal(base.record.revision, 2);
});

test("REV-08: professional qualification can never be assumed from a role", () => {
  const input = {
    assignment: ACTIVE,
    currentTarget: { targetSha256: HASH_A, targetVersion: 3 },
    providerTrustsTarget: true,
    record: approvedRecord(),
  };
  const unverified = evaluateProfessionalReviewValidity({
    ...input,
    credential: { status: "unverified" },
  });
  assert.equal(unverified.status, "invalid");
  assert.equal(
    unverified.status === "invalid" && unverified.reasonCode,
    "professional_credential_unverified"
  );
  const unavailable = evaluateProfessionalReviewValidity({
    ...input,
    credential: "unavailable",
  });
  assert.equal(unavailable.status, "unknown");
  assert.equal(
    unavailable.status === "unknown" && unavailable.reasonCode,
    "professional_credential_unavailable"
  );
});

test("REV-09: revoked or unverifiable reviewer authority invalidates approval", () => {
  const input = {
    credential: VERIFIED,
    currentTarget: { targetSha256: HASH_A, targetVersion: 3 },
    providerTrustsTarget: true,
    record: approvedRecord(),
  };
  for (const assignment of [
    { status: "revoked" } as const,
    { status: "missing" } as const,
  ]) {
    const validity = evaluateProfessionalReviewValidity({
      ...input,
      assignment,
    });
    assert.equal(validity.status, "invalid");
    assert.equal(
      validity.status === "invalid" && validity.reasonCode,
      "review_authority_revoked"
    );
  }
  const unavailable = evaluateProfessionalReviewValidity({
    ...input,
    assignment: "unavailable",
  });
  assert.equal(unavailable.status, "unknown");
  // A different reviewer occupying the slot is not the approving reviewer.
  const reassigned = evaluateProfessionalReviewValidity({
    ...input,
    assignment: { reviewerUserId: "reviewer-2", status: "active" },
  });
  assert.equal(reassigned.status, "invalid");
  assert.equal(
    reassigned.status === "invalid" && reassigned.reasonCode,
    "review_authority_revoked"
  );
});

test("a missing or unapproved review is never valid", () => {
  const missing = evaluateProfessionalReviewValidity({
    assignment: ACTIVE,
    credential: VERIFIED,
    currentTarget: { targetSha256: HASH_A, targetVersion: 3 },
    providerTrustsTarget: true,
    record: null,
  });
  assert.equal(
    missing.status === "invalid" && missing.reasonCode,
    "review_request_missing"
  );
  const inReview = evaluateProfessionalReviewValidity({
    assignment: ACTIVE,
    credential: VERIFIED,
    currentTarget: { targetSha256: HASH_A, targetVersion: 3 },
    providerTrustsTarget: true,
    record: approvedRecord({ decision: null, state: "in_review" }),
  });
  assert.equal(
    inReview.status === "invalid" && inReview.reasonCode,
    "review_not_approved"
  );
  const rejected = evaluateProfessionalReviewValidity({
    assignment: ACTIVE,
    credential: VERIFIED,
    currentTarget: { targetSha256: HASH_A, targetVersion: 3 },
    providerTrustsTarget: true,
    record: approvedRecord({ state: "rejected" }),
  });
  assert.equal(rejected.status, "invalid");
  const invalidated = evaluateProfessionalReviewValidity({
    assignment: ACTIVE,
    credential: VERIFIED,
    currentTarget: { targetSha256: HASH_A, targetVersion: 3 },
    providerTrustsTarget: true,
    record: approvedRecord({ state: "invalidated" }),
  });
  assert.equal(invalidated.status, "invalid");
});

test("canonical target identity rejects shape ambiguity", () => {
  assert.equal(managedTargetIdentityValid(TARGET), true);
  assert.equal(
    managedTargetIdentityValid({ ...TARGET, targetVersion: 0 }),
    false
  );
  assert.equal(
    managedTargetIdentityValid({ ...TARGET, targetVersion: 1.5 }),
    false
  );
  assert.equal(
    managedTargetIdentityValid({ ...TARGET, targetSha256: "A".repeat(64) }),
    false
  );
  assert.equal(
    managedTargetIdentityValid({ ...TARGET, targetKind: "visa_application" }),
    false
  );
  assert.equal(
    managedTargetIdentityValid({ ...TARGET, projectId: "not-a-uuid" }),
    false
  );
  assert.equal(managedTargetIdentityValid({ ...TARGET, targetId: "" }), false);
  // Hash prefix equality is never a match.
  assert.equal(
    sameManagedTargetVersion(
      { targetSha256: HASH_A, targetVersion: 3 },
      { targetSha256: HASH_A.slice(0, 32), targetVersion: 3 }
    ),
    false
  );
  assert.equal(
    professionalReviewBinding(TARGET),
    managedTargetIdentitySha256(TARGET)
  );
  assert.notEqual(
    professionalReviewBinding(TARGET),
    professionalReviewBinding({ ...TARGET, targetVersion: 4 })
  );
  assert.equal(professionalReviewScopeValid(["eligibility_review"]), true);
  assert.equal(professionalReviewScopeValid([]), false);
  assert.equal(
    professionalReviewScopeValid(["eligibility_review", "eligibility_review"]),
    false
  );
  assert.equal(professionalReviewScopeValid(["not_a_scope"]), false);
  assert.notEqual(
    professionalReviewOperationSha256({
      action: "approve",
      actorUserId: "reviewer-1",
      boundTargetSha256: HASH_A,
      boundTargetVersion: 3,
      commentSha256: null,
      expectedRevision: 2,
      projectId: PROJECT,
      reasonCode: null,
      reviewRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }),
    professionalReviewOperationSha256({
      action: "approve",
      actorUserId: "reviewer-1",
      boundTargetSha256: HASH_A,
      boundTargetVersion: 3,
      commentSha256: "d".repeat(64),
      expectedRevision: 2,
      projectId: PROJECT,
      reasonCode: null,
      reviewRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })
  );
});

test("M4-006 ships disabled by default", () => {
  assert.equal(isProfessionalReviewEnabled(undefined), false);
  assert.equal(isProfessionalReviewEnabled(""), false);
  assert.equal(isProfessionalReviewEnabled("false"), false);
  assert.equal(isProfessionalReviewEnabled("1"), false);
  assert.equal(isProfessionalReviewEnabled("true"), true);
});
