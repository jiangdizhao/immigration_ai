// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertion helpers are only called from test bodies in this file.
// biome-ignore-all lint/suspicious/useAwait: promise helpers intentionally avoid await.
import assert from "node:assert/strict";
import { test } from "node:test";
import { unavailableManagedTargetProvider } from "@/lib/professional-review/target-provider";
import { evaluateManagedHandoffReadiness } from "./evaluator";
import {
  isManagedHandoffEnabled,
  type ManagedHandoffResult,
  managedHandoffRequiredScope,
} from "./policy";
import {
  denyAllManagedHandoffPorts,
  type ManagedHandoffPayload,
} from "./ports";
import {
  createSyntheticManagedHandoffPorts,
  type SyntheticManagedHandoffFixture,
} from "./synthetic-adapters";

/**
 * Frozen system acceptance scenarios SYS-01 … SYS-17.
 *
 * Every positive here is synthetic: the injected adapters are test-only and the
 * result is marked `evidenceProvenance: "synthetic_test"`.
 */
const PROJECT = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const TARGET_ID = "school-package-001";
const TARGET_KIND = "managed_school_application" as const;
const HASH = "a".repeat(64);

function fixture(
  overrides: Partial<SyntheticManagedHandoffFixture> = {}
): SyntheticManagedHandoffFixture {
  return {
    actorUserId: OWNER,
    projectId: PROJECT,
    targetId: TARGET_ID,
    targetKind: "managed_school_application",
    targetSha256: HASH,
    targetVersion: 3,
    ...overrides,
  };
}

function payload(
  overrides: Partial<ManagedHandoffPayload> = {}
): ManagedHandoffPayload {
  return {
    actorUserId: OWNER,
    messagingConsentPresent: false,
    projectId: PROJECT,
    target: { targetId: TARGET_ID, targetKind: "managed_school_application" },
    vipEntitlementActive: false,
    ...overrides,
  };
}

async function run(
  overrides: Partial<SyntheticManagedHandoffFixture> = {},
  payloadOverrides: Partial<ManagedHandoffPayload> = {}
): Promise<ManagedHandoffResult> {
  return evaluateManagedHandoffReadiness(
    payload(payloadOverrides),
    createSyntheticManagedHandoffPorts(fixture(overrides))
  );
}

function assertBlocked(result: ManagedHandoffResult, code: string) {
  assert.equal(result.status, "NOT_READY", JSON.stringify(result.reasonCodes));
  assert.ok(
    result.reasonCodes.includes(code as never),
    JSON.stringify(result.reasonCodes)
  );
}

function assertUnknown(result: ManagedHandoffResult, code: string) {
  assert.equal(result.status, "UNKNOWN", JSON.stringify(result.reasonCodes));
  assert.ok(
    result.reasonCodes.includes(code as never),
    JSON.stringify(result.reasonCodes)
  );
}

test("SYS-16: a fully synthetic trustworthy path is READY and marked test-only", async () => {
  const result = await run();
  assert.equal(result.status, "READY", JSON.stringify(result.reasonCodes));
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.evidenceProvenance, "synthetic_test");
  assert.equal(result.paymentPredicate, "REQUIRED_SATISFIED");
  assert.equal(result.target.targetVersion, 3);
  assert.equal(result.target.targetSha256, HASH);
  assert.equal(result.checkedRevisions.review !== null, true);
  assert.equal(result.checkedRevisions.project, 8);
  assert.equal(result.checkedRevisions.engagement, 4);
  assert.equal(
    result.checkedRevisions.membership,
    "66666666-6666-4666-8666-666666666666"
  );
  assert.equal(
    result.checkedRevisions.assignment,
    "77777777-7777-4777-8777-777777777777"
  );
  assert.equal(
    result.checkedRevisions.disclosure,
    "88888888-8888-4888-8888-888888888888"
  );
  assert.equal(
    result.checkedRevisions.target,
    `${TARGET_KIND}:${TARGET_ID}@3:${HASH}`
  );
  assert.match(result.checkedRevisions.agreement ?? "", /@[0-9a-f]{64}$/u);
  assert.equal(
    result.policyVersions.handoff,
    "phase13-m4-007-managed-handoff-v1"
  );
  assert.equal(result.revalidationToken.length, 64);
  // Privacy: only opaque references, never content.
  const serialized = JSON.stringify(result);
  assert.equal(
    /packageText|document|content|bankReference/i.test(serialized),
    false
  );
  for (const ref of result.evidenceRefs) {
    assert.match(
      ref,
      /^(target|engagement|agreement|payment-condition|payment-evidence|professional-review):/u
    );
  }
  // Deterministic: the same state yields the same revalidation token.
  const again = await run();
  assert.equal(again.revalidationToken, result.revalidationToken);
});

test("SYS-01: no valid engagement blocks the handoff", async () => {
  assertBlocked(await run({ engagement: "missing" }), "engagement_missing");
  assertBlocked(
    await run({ engagement: "superseded" }),
    "engagement_superseded"
  );
  assertBlocked(
    await run({ engagement: "scope_mismatch" }),
    "engagement_scope_mismatch"
  );
  assertUnknown(
    await run({ engagement: "unavailable" }),
    "engagement_unavailable"
  );
});

test("SYS-02: a revoked or absent named-lawyer assignment blocks", async () => {
  assertBlocked(
    await run({ assignment: "revoked" }),
    "lawyer_assignment_revoked"
  );
  assertBlocked(
    await run({ assignment: "missing" }),
    "lawyer_assignment_missing"
  );
  assertBlocked(
    await run({ assignment: "pending" }),
    "lawyer_assignment_pending"
  );
  assertUnknown(
    await run({ assignment: "unavailable" }),
    "lawyer_assignment_unavailable"
  );
});

test("SYS-03: messaging consent never substitutes for resource disclosure", async () => {
  const result = await run(
    { disclosure: "missing" },
    { messagingConsentPresent: true }
  );
  assertBlocked(result, "resource_disclosure_missing");
  assertBlocked(
    await run({ disclosure: "expired" }),
    "resource_disclosure_expired"
  );
  assertUnknown(
    await run({ disclosure: "unavailable" }),
    "resource_disclosure_unavailable"
  );
  // A messaging-consent-only Project cannot reach READY at all.
  assert.notEqual(
    (
      await run(
        { disclosure: "missing", signature: "missing" },
        { messagingConsentPresent: true }
      )
    ).status,
    "READY"
  );
});

test("SYS-04: unsigned or untrusted signature evidence blocks", async () => {
  assertBlocked(await run({ signature: "unverified" }), "signature_unverified");
  assertBlocked(await run({ signature: "missing" }), "signature_missing");
  assertBlocked(
    await run({ signature: "untrusted" }),
    "signature_authority_untrusted"
  );
  assertUnknown(
    await run({ signature: "unavailable" }),
    "signature_authority_unavailable"
  );
});

test("SYS-05: payment must be genuinely satisfied before handoff", async () => {
  assertBlocked(
    await run({ payment: "required_unsatisfied" }),
    "payment_required_unsatisfied"
  );
  assertBlocked(
    await run({ payment: "evidence_pending" }),
    "payment_evidence_pending"
  );
  assertBlocked(await run({ payment: "missing" }), "payment_condition_missing");
  assertUnknown(
    await run({ payment: "unavailable" }),
    "payment_state_unavailable"
  );
});

test("SYS-06: an effective reversal, dispute or void blocks the handoff", async () => {
  assertBlocked(await run({ payment: "reversed" }), "payment_reversed");
  assertBlocked(await run({ payment: "disputed" }), "payment_disputed");
  assertBlocked(await run({ payment: "void" }), "payment_void");
  const reversed = await run({ payment: "reversed" });
  assert.equal(reversed.paymentPredicate, "REVERSED");
  assert.equal(reversed.status, "NOT_READY");
});

test("SYS-07: NOT_REQUIRED is distinct from missing payment evidence", async () => {
  const notRequired = await run({ payment: "not_required" });
  assert.equal(notRequired.paymentPredicate, "NOT_REQUIRED");
  assert.equal(
    notRequired.status,
    "READY",
    JSON.stringify(notRequired.reasonCodes)
  );
  assert.equal(
    notRequired.evidenceRefs.some((ref) => ref.startsWith("payment-evidence:")),
    false,
    "no zero-dollar payment evidence may be fabricated"
  );
  // Missing evidence is a different predicate and a different outcome.
  const missing = await run({ payment: "missing" });
  assert.equal(missing.paymentPredicate, "UNSATISFIED");
  assert.equal(missing.status, "NOT_READY");
});

test("SYS-08: a changed target version or hash invalidates the approval", async () => {
  assertBlocked(
    await run({ reviewMode: "target_changed" }),
    "review_target_changed"
  );
});

test("SYS-09: an unverifiable professional qualification is never approval", async () => {
  assertBlocked(
    await run({ reviewMode: "credential_unverified" }),
    "professional_credential_unverified"
  );
  assertUnknown(
    await run({ reviewMode: "credential_unavailable" }),
    "professional_credential_unavailable"
  );
  // A lawyer account role alone changes nothing.
  const lawyerRole = await run({
    reviewMode: "missing",
    assignment: "revoked",
  });
  assert.equal(lawyerRole.status, "NOT_READY");
});

test("SYS-10: an unauthorized or absent approver never yields approval", async () => {
  assertBlocked(await run({ reviewMode: "missing" }), "review_missing");
  assertBlocked(
    await run({ reviewMode: "not_approved" }),
    "review_not_approved"
  );
  assertUnknown(
    await run({ reviewMode: "unavailable" }),
    "review_state_unavailable"
  );
});

test("SYS-12: revoked reviewer authority invalidates a prior approval", async () => {
  assertBlocked(
    await run({ reviewMode: "authority_revoked" }),
    "review_authority_revoked"
  );
  assertBlocked(
    await run({ reviewMode: "authority_revoked" }, { actorUserId: OWNER }),
    "review_authority_revoked"
  );
});

test("SYS-11: cross-project or undisclosed material is not authorized", async () => {
  assertBlocked(await run({ membership: "none" }), "actor_not_authorized");
  assertBlocked(await run({ membership: "expired" }), "membership_expired");
  assertUnknown(
    await run({ membership: "unavailable" }),
    "membership_unavailable"
  );
});

test("SYS-13: a concurrent authoritative change never yields a stale READY", async () => {
  const result = await run({ concurrentRevisionChange: true });
  assert.equal(result.status, "UNKNOWN", JSON.stringify(result.reasonCodes));
  assert.ok(result.reasonCodes.includes("concurrent_revision_change"));
});

test("SYS-15: VIP entitlement or messaging consent alone is never readiness", async () => {
  const result = await evaluateManagedHandoffReadiness(
    payload({ messagingConsentPresent: true, vipEntitlementActive: true }),
    createSyntheticManagedHandoffPorts(
      fixture({
        agreement: "missing",
        assignment: "missing",
        disclosure: "missing",
        engagement: "missing",
        payment: "missing",
        reviewMode: "missing",
        signature: "missing",
      })
    )
  );
  assert.equal(result.status, "NOT_READY");
});

test("SYS-17: the production composition can only ever answer UNKNOWN", async () => {
  const result = await evaluateManagedHandoffReadiness(
    payload(),
    denyAllManagedHandoffPorts(
      unavailableManagedTargetProvider,
      () => new Date("2026-10-30T00:00:00.000Z")
    )
  );
  assert.equal(result.status, "UNKNOWN", JSON.stringify(result.reasonCodes));
  assert.equal(result.evidenceProvenance, "production");
  for (const code of [
    "target_provider_unavailable",
    "project_state_unavailable",
    "membership_unavailable",
    "lawyer_assignment_unavailable",
    "engagement_unavailable",
    "payment_state_unavailable",
    "review_state_unavailable",
  ]) {
    assert.ok(result.reasonCodes.includes(code as never), `${code} missing`);
  }
  assert.deepEqual(result.evidenceRefs, []);
});

test("a closed project and a mismatched target are definitive blocks", async () => {
  assertBlocked(await run({ project: "closed" }), "project_not_active");
  const otherTarget = await evaluateManagedHandoffReadiness(
    payload({
      target: {
        targetId: "unknown-package",
        targetKind: "managed_school_application",
      },
    }),
    createSyntheticManagedHandoffPorts(fixture())
  );
  assertBlocked(otherTarget, "target_not_found");
  assertUnknown(
    await run({ project: "unavailable" }),
    "project_state_unavailable"
  );
});

test("M4-007 ships disabled by default", () => {
  assert.equal(isManagedHandoffEnabled(undefined), false);
  assert.equal(isManagedHandoffEnabled(""), false);
  assert.equal(isManagedHandoffEnabled("false"), false);
  assert.equal(isManagedHandoffEnabled("true"), true);
});

test("INT-10: an unresolved customer-confirmation policy is UNKNOWN, not 'not required'", async () => {
  const unknown = await run({ confirmation: "policy_unknown" });
  assert.equal(unknown.status, "UNKNOWN");
  assert.ok(
    unknown.reasonCodes.includes("customer_confirmation_policy_unknown")
  );
  assert.notEqual(unknown.status, "READY");
  assertUnknown(
    await run({ confirmation: "unavailable" }),
    "customer_confirmation_policy_unknown"
  );
  assertBlocked(
    await run({ confirmation: "required_not_confirmed" }),
    "customer_confirmation_missing"
  );
  const confirmed = await run({ confirmation: "required_and_confirmed" });
  assert.equal(
    confirmed.status,
    "READY",
    JSON.stringify(confirmed.reasonCodes)
  );
  assert.ok(
    confirmed.evidenceRefs.some((ref) =>
      ref.startsWith("customer-confirmation:")
    )
  );
});

test("the M4-004 scope vocabulary and service mode are authoritative", async () => {
  assertBlocked(
    await run({ engagement: "scope_mismatch" }),
    "engagement_scope_mismatch"
  );
  assertBlocked(
    await run({ engagement: "self_service" }),
    "engagement_service_mode_mismatch"
  );
  // The student 500 package maps to the `student_500_visa` engagement scope.
  const visa = await evaluateManagedHandoffReadiness(
    payload({
      target: {
        targetId: TARGET_ID,
        targetKind: "student_500_visa_application",
      },
    }),
    createSyntheticManagedHandoffPorts(
      fixture({ targetKind: "student_500_visa_application" })
    )
  );
  assert.equal(visa.status, "READY", JSON.stringify(visa.reasonCodes));
  assert.equal(
    managedHandoffRequiredScope("managed_school_application"),
    "school_admissions"
  );
  assert.equal(
    managedHandoffRequiredScope("student_500_visa_application"),
    "student_500_visa"
  );
  assert.equal(managedHandoffRequiredScope("visa_application"), null);
  // The previously provisional value must not exist anywhere in the contract.
  assert.equal(
    JSON.stringify(visa.checkedRevisions).includes(
      "managed_application_handoff"
    ),
    false
  );
});

test("the revalidation token binds the observed vector and policy versions", async () => {
  const first = await run();
  const second = await run();
  assert.equal(first.revalidationToken, second.revalidationToken);
  const movedReview = await run({ reviewRevision: 5 });
  assert.notEqual(movedReview.revalidationToken, first.revalidationToken);
  const blocked = await run({ payment: "reversed" });
  assert.notEqual(blocked.revalidationToken, first.revalidationToken);
  assert.equal(blocked.status, "NOT_READY");
});
