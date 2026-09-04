import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSafeStripeTestSecret,
  m3AcceptanceOverall,
  m3RunMetadata,
  m3StripeObjectId,
  m3SyntheticPlanPriceId,
} from "./m3-safety";
import { vipPlanPriceIdempotencyKey } from "./provisioning";

test("M3 Stripe acceptance accepts only unmistakable test secrets", () => {
  assert.equal(isSafeStripeTestSecret("sk_test_abc123"), true);
  assert.equal(isSafeStripeTestSecret("sk_live_abc123"), false);
  assert.equal(isSafeStripeTestSecret("rk_test_abc123"), false);
  assert.equal(isSafeStripeTestSecret("sk_test_"), false);
  assert.equal(isSafeStripeTestSecret(undefined), false);
});

test("M3 synthetic metadata is stable and run-scoped", () => {
  assert.deepEqual(m3RunMetadata("run-123"), {
    immigration_ai_phase: "phase9_m3",
    immigration_ai_m3_run_id: "run-123",
  });
});

test("M3 Stripe relationship references normalize expanded and unexpanded forms", () => {
  assert.equal(m3StripeObjectId("pm_card_visa"), "pm_card_visa");
  assert.equal(m3StripeObjectId({ id: "pm_generated" }), "pm_generated");
  assert.equal(m3StripeObjectId(null), null);
});

test("M3 synthetic plan-price identity scopes Stripe idempotency by run", () => {
  const first = m3SyntheticPlanPriceId("run-a");
  const second = m3SyntheticPlanPriceId("run-b");
  assert.equal(
    vipPlanPriceIdempotencyKey(first),
    vipPlanPriceIdempotencyKey(first)
  );
  assert.notEqual(first, second);
  assert.notEqual(
    vipPlanPriceIdempotencyKey(first),
    vipPlanPriceIdempotencyKey(second)
  );
});

test("M3 Test Clock required checks cannot be reported as overall PASS", () => {
  assert.equal(
    m3AcceptanceOverall({
      stripeCredentialBlocked: false,
      stripeTestClockAttempted: true,
      renewalPass: false,
      failurePass: false,
      cancellationPass: false,
    }),
    "PARTIAL"
  );
  assert.equal(
    m3AcceptanceOverall({
      stripeCredentialBlocked: false,
      stripeTestClockAttempted: true,
      renewalPass: true,
      failurePass: true,
      cancellationPass: true,
    }),
    "PASS"
  );
  assert.equal(
    m3AcceptanceOverall({
      stripeCredentialBlocked: false,
      stripeTestClockAttempted: true,
      renewalPass: true,
      failurePass: false,
      cancellationPass: true,
    }),
    "PARTIAL"
  );
});

test("M3 Stripe contract failure cannot be reported as overall PASS", () => {
  assert.equal(
    m3AcceptanceOverall({
      stripeCredentialBlocked: false,
      stripeContractFailed: true,
      stripeTestClockAttempted: false,
    }),
    "FAIL"
  );
});
