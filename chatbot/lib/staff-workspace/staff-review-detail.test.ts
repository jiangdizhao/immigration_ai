import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProjectReviewSummary } from "@/lib/review/review-summary";
import type { StaffProjectShell } from "./staff-queue";
import {
  buildStaffReviewDetail,
  staffReviewItemIdentity,
} from "./staff-review-detail";

/**
 * Phase 13 M9-B staff Project review detail.
 *
 * The shape is the boundary: a denied content gate must produce `review: null` even if the
 * caller passes a populated summary, and an absent shell must deny before anything else.
 */

const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const shell: StaffProjectShell = {
  acceptedAt: "2026-11-08T00:00:00.000Z",
  assignmentId: "assignment-1",
  assignmentRole: "lawyer",
  assignmentStatus: "active",
  projectId,
  projectLifecycle: "active",
  updatedAt: "2026-11-08T00:00:00.000Z",
};
const professionalReview = {
  reasonCode: "professional_authority_unavailable",
  state: "unavailable",
};

const populated = buildProjectReviewSummary({
  aiCheckAvailability: "unsupported",
  candidates: [],
  professional: new Map(),
  professionalAvailability: {
    authorityCode: "deny_by_default_professional_review_authority",
    credentialVerifierCode: "unavailable_professional_credential_verifier",
    purpose: "managed_handoff_authorization",
    reasonCode: "professional_authority_unavailable",
    state: "unavailable",
    supportedTargetKinds: [],
    targetProviderCode: "unavailable_managed_target_provider",
  },
  projectId,
});

test("a non-lawyer actor is denied with no shell and no review", () => {
  const detail = buildStaffReviewDetail({
    actorRole: "user",
    assignmentStatus: "active",
    disclosure: { decision: "ALLOW", reasonCode: "allowed" },
    professionalReview,
    projectId,
    projectLifecycle: "active",
    review: populated,
    shell,
  });
  assert.equal(detail.shell, null);
  assert.equal(detail.review, null);
  assert.equal(detail.disclosure.decision, "DENY");
  assert.deepEqual(detail.permitted, []);
  assert.deepEqual(detail.blockedReasonCodes, ["staff_role_required"]);
});

test("an inactive assignment or closed Project is denied even with an ALLOW gate", () => {
  for (const input of [
    {
      assignmentStatus: "revoked" as const,
      projectLifecycle: "active" as const,
    },
    {
      assignmentStatus: "active" as const,
      projectLifecycle: "closed" as const,
    },
  ]) {
    const detail = buildStaffReviewDetail({
      actorRole: "lawyer",
      disclosure: { decision: "ALLOW", reasonCode: "allowed" },
      professionalReview,
      projectId,
      review: populated,
      shell,
      ...input,
    });
    assert.equal(detail.review, null);
    assert.equal(detail.disclosure.decision, "DENY");
    assert.equal(detail.permitted.includes("review_version_identity"), false);
  }
});

test("a denied disclosure returns the gate reason and never a populated review", () => {
  const detail = buildStaffReviewDetail({
    actorRole: "lawyer",
    assignmentStatus: "active",
    disclosure: {
      decision: "DENY",
      reasonCode: "resource_source_unavailable",
    },
    professionalReview,
    projectId,
    projectLifecycle: "active",
    review: populated,
    shell,
  });
  assert.ok(detail.shell);
  assert.equal(detail.review, null);
  assert.equal(detail.disclosure.reasonCode, "resource_source_unavailable");
  assert.deepEqual(detail.permitted, [
    "project_shell",
    "assignment_identity",
    "disclosure_state",
    "review_status",
  ]);
  assert.deepEqual(detail.blockedReasonCodes, [
    "resource_source_unavailable",
    "professional_authority_unavailable",
  ]);
});

test("a missing gate result is denied, never assumed", () => {
  const detail = buildStaffReviewDetail({
    actorRole: "lawyer",
    assignmentStatus: "active",
    disclosure: null,
    professionalReview,
    projectId,
    projectLifecycle: "active",
    review: populated,
    shell,
  });
  assert.equal(detail.disclosure.decision, "DENY");
  assert.equal(detail.disclosure.reasonCode, "disclosure_unverified");
  assert.equal(detail.review, null);
});

test("the staff-visible item identity carries no content", () => {
  const identity = staffReviewItemIdentity({
    aiCheck: { reasonCode: null, state: "unsupported" },
    artifactKind: "submission_package",
    confirmation: { confirmationIds: [], reasonCode: null, state: "confirmed" },
    createdAt: null,
    exactVersion: {
      bindingSha256: null,
      contentSha256: null,
      targetId: projectId,
      targetKind: "submission_package",
      targetVersion: 3,
    },
    integrity: { reasonCode: null, state: "verified" },
    ownerView: "applications",
    professionalReview: {
      reasonCode: null,
      reviewRequestId: null,
      state: "not_requested",
    },
    referenceId: "ref-1",
    requestEligibility: { allowed: false, reasonCode: null },
    reviewTarget: null,
    stale: false,
    status: "current",
  });
  assert.deepEqual(Object.keys(identity).sort(), [
    "artifactKind",
    "confirmationState",
    "professionalState",
    "status",
    "version",
  ]);
});
