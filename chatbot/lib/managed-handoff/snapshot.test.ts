import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProfessionalReviewValidity } from "@/lib/professional-review/policy";
import { createSyntheticManagedTargetProvider } from "@/lib/professional-review/synthetic-authorities";
import { unavailableManagedTargetProvider } from "@/lib/professional-review/target-provider";
import { evaluateManagedHandoffReadiness } from "./evaluator";
import {
  denyAllManagedHandoffPorts,
  type ManagedHandoffPayload,
} from "./ports";
import {
  type ManagedHandoffSnapshot,
  type ManagedHandoffSnapshotPolicy,
  managedHandoffPaymentState,
  managedHandoffPortsFromSnapshot,
} from "./snapshot";

/**
 * INT-07 … INT-14: the authoritative snapshot adapter.
 *
 * The snapshot mirrors what the PostgreSQL read model produces (this test does not
 * touch a database). The point is that upstream authority is either genuinely
 * present or explicitly unavailable, and that a production configuration can never
 * be promoted to READY.
 */
const PROJECT = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const REVIEWER = "33333333-3333-4333-8333-333333333333";
const TARGET_ID = "school-package-001";
const HASH = "a".repeat(64);
const IDENTITY = {
  projectId: PROJECT,
  targetId: TARGET_ID,
  targetKind: "managed_school_application" as const,
  targetSha256: HASH,
  targetVersion: 3,
};
const IDENTITY_PROVIDER = createSyntheticManagedTargetProvider({
  fixtures: [{ identity: IDENTITY }],
});

const READY_REVIEW: ProfessionalReviewValidity = {
  policyVersion: "phase13-m4-006-professional-review-v1",
  reviewRequestId: "44444444-4444-4444-8444-444444444444",
  reviewerUserId: REVIEWER,
  revision: 3,
  status: "valid",
  targetBindingSha256: "f".repeat(64),
};

const TRUSTED_POLICY: ManagedHandoffSnapshotPolicy = {
  confirmation: {
    policyCode: "synthetic_no_confirmation_required",
    status: "not_required",
  },
  paymentValidity: "trusted",
  signatureAuthority: "approved",
};

const PRODUCTION_POLICY: ManagedHandoffSnapshotPolicy = {
  confirmation: { status: "policy_unknown" },
  paymentValidity: "untrusted",
  signatureAuthority: "unapproved",
};

function snapshot(
  overrides: Partial<ManagedHandoffSnapshot> = {}
): ManagedHandoffSnapshot {
  return {
    actorUserId: OWNER,
    agreement: {
      agreementVersionId: "55555555-5555-4555-8555-555555555555",
      revision: 2,
      status: "accepted",
      termsSha256: "e".repeat(64),
    },
    assignment: {
      assignmentId: "66666666-6666-4666-8666-666666666666",
      assignmentRevision: 7,
      reviewerUserId: REVIEWER,
      status: "active",
    },
    disclosure: {
      disclosureId: "77777777-7777-4777-8777-777777777777",
      resourceKey: "engagement:88888888-8888-4888-8888-888888888888@4",
      status: "granted",
    },
    engagement: {
      engagementId: "88888888-8888-4888-8888-888888888888",
      revision: 4,
      scopeCodes: ["school_admissions"],
      serviceMode: "managed",
      status: "current",
    },
    engagementRevisionAfter: 4,
    loadedAt: "2026-10-30T00:00:00.000Z",
    membership: { expiresAt: null, membershipId: null, status: "owner" },
    payment: {
      conditionId: "99999999-9999-4999-8999-999999999999",
      contractualBasisCode: "agreement_clause",
      evidenceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "SATISFIED",
    },
    project: { revision: 8, status: "active" },
    projectId: PROJECT,
    projectRevisionAfter: 8,
    review: { validity: READY_REVIEW },
    signature: {
      signatureEvidenceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "verified",
    },
    targetId: TARGET_ID,
    targetKind: "managed_school_application",
    ...overrides,
  };
}

function payload(): ManagedHandoffPayload {
  return {
    actorUserId: OWNER,
    messagingConsentPresent: false,
    projectId: PROJECT,
    target: { targetId: TARGET_ID, targetKind: "managed_school_application" },
    vipEntitlementActive: false,
  };
}

function evaluate(
  source: ManagedHandoffSnapshot,
  policy: ManagedHandoffSnapshotPolicy = TRUSTED_POLICY
) {
  return evaluateManagedHandoffReadiness(
    payload(),
    managedHandoffPortsFromSnapshot(source, {
      policy,
      targetProvider: IDENTITY_PROVIDER,
    })
  );
}

test("INT-08: the real read model projects Project, Engagement and Agreement state", async () => {
  const result = await evaluate(snapshot());
  assert.equal(result.status, "READY", JSON.stringify(result.reasonCodes));
  assert.equal(result.checkedRevisions.project, 8);
  assert.equal(result.checkedRevisions.engagement, 4);
  assert.equal(
    result.checkedRevisions.assignment,
    "66666666-6666-4666-8666-666666666666"
  );
  assert.equal(
    result.checkedRevisions.agreement,
    `55555555-5555-4555-8555-555555555555@${"e".repeat(64)}`
  );
  assert.equal(
    result.checkedRevisions.target,
    `managed_school_application:${TARGET_ID}@3:${HASH}`
  );
  assert.equal(result.engagementId, "88888888-8888-4888-8888-888888888888");
  assert.equal(result.evidenceProvenance, "synthetic_test");
});

test("INT-09: an undisclosed private resource is never authorized", async () => {
  const missing = await evaluate(
    snapshot({
      disclosure: {
        disclosureId: null,
        resourceKey: "engagement:none",
        status: "missing",
      },
    })
  );
  assert.equal(missing.status, "NOT_READY");
  assert.ok(missing.reasonCodes.includes("resource_disclosure_missing"));
  const expired = await evaluate(
    snapshot({
      disclosure: {
        disclosureId: null,
        resourceKey: "engagement:none",
        status: "expired",
      },
    })
  );
  assert.ok(expired.reasonCodes.includes("resource_disclosure_expired"));
  assert.equal(expired.checkedRevisions.disclosure, null);
});

test("INT-07: a revoked assignment invalidates the persisted approval", async () => {
  const validity: ProfessionalReviewValidity = {
    reasonCode: "review_authority_revoked",
    reviewRequestId: "44444444-4444-4444-8444-444444444444",
    status: "invalid",
  };
  const result = await evaluate(
    snapshot({
      assignment: {
        assignmentId: "66666666-6666-4666-8666-666666666666",
        assignmentRevision: 7,
        reviewerUserId: REVIEWER,
        status: "revoked",
      },
      review: { validity },
    })
  );
  assert.equal(result.status, "NOT_READY");
  assert.ok(result.reasonCodes.includes("lawyer_assignment_revoked"));
  assert.ok(result.reasonCodes.includes("review_authority_revoked"));
});

test("INT-11: unapproved signature/payment/credential sources cannot make READY", async () => {
  const result = await evaluate(snapshot(), PRODUCTION_POLICY);
  assert.notEqual(result.status, "READY");
  assert.equal(result.status, "UNKNOWN");
  assert.ok(result.reasonCodes.includes("signature_authority_unavailable"));
  assert.ok(result.reasonCodes.includes("payment_state_unavailable"));
  assert.ok(
    result.reasonCodes.includes("customer_confirmation_policy_unknown")
  );

  // The payment gate alone is enough to stop a positive assertion.
  const gated = managedHandoffPaymentState(
    {
      conditionId: "99999999-9999-4999-8999-999999999999",
      contractualBasisCode: null,
      evidenceId: null,
      status: "SATISFIED",
    },
    PRODUCTION_POLICY
  );
  assert.equal(gated, "unavailable");
  const notRequired = managedHandoffPaymentState(
    {
      conditionId: "99999999-9999-4999-8999-999999999999",
      contractualBasisCode: "explicit_no_advance_fee",
      evidenceId: null,
      status: "NOT_REQUIRED",
    },
    PRODUCTION_POLICY
  );
  assert.equal(notRequired, "unavailable");
  // Conservative negatives always pass through.
  for (const status of [
    "REVERSED",
    "DISPUTED",
    "VOID",
    "REQUIRED_UNSATISFIED",
    "EVIDENCE_PENDING",
  ] as const) {
    const state = managedHandoffPaymentState(
      {
        conditionId: "99999999-9999-4999-8999-999999999999",
        contractualBasisCode: null,
        evidenceId: null,
        status,
      },
      PRODUCTION_POLICY
    );
    assert.notEqual(state, "unavailable", status);
  }
});

test("INT-12: a concurrent revision change cannot become a durable permission", async () => {
  const projectMoved = await evaluate(snapshot({ projectRevisionAfter: 9 }));
  assert.equal(projectMoved.status, "UNKNOWN");
  assert.ok(projectMoved.reasonCodes.includes("concurrent_revision_change"));

  const engagementMoved = await evaluate(
    snapshot({ engagementRevisionAfter: 5 })
  );
  assert.equal(engagementMoved.status, "UNKNOWN");
  assert.ok(engagementMoved.reasonCodes.includes("concurrent_revision_change"));

  // The token differs from the stable evaluation, so a stale token is detectable.
  const stable = await evaluate(snapshot());
  assert.notEqual(stable.revalidationToken, engagementMoved.revalidationToken);
});

test("INT-13/INT-14: synthetic positivity is marked, production is never READY", async () => {
  const synthetic = await evaluate(snapshot());
  assert.equal(synthetic.status, "READY");
  assert.equal(synthetic.evidenceProvenance, "synthetic_test");

  const productionPorts = denyAllManagedHandoffPorts(
    unavailableManagedTargetProvider
  );
  const production = await evaluateManagedHandoffReadiness(
    payload(),
    productionPorts
  );
  assert.equal(production.status, "UNKNOWN");
  assert.notEqual(production.status, "READY");
  assert.equal(production.evidenceProvenance, "production");
});

test("a missing Project row is definitive and an empty membership is not authorized", async () => {
  const missingProject = await evaluate(
    snapshot({ project: { status: "missing" } })
  );
  assert.equal(missingProject.status, "NOT_READY");
  assert.ok(missingProject.reasonCodes.includes("project_not_found"));

  const stranger = await evaluate(
    snapshot({
      membership: { expiresAt: null, membershipId: null, status: "none" },
    })
  );
  assert.ok(stranger.reasonCodes.includes("actor_not_authorized"));
});
