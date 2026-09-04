import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildVipBillingMetadata,
  decidePaidNotificationType,
  extractVipBillingMetadata,
  mapStripeSubscriptionStatusToLocal,
} from "./webhook-events";

test("provider subscription statuses map to local statuses and fail closed", () => {
  assert.equal(mapStripeSubscriptionStatusToLocal("active"), "active");
  assert.equal(mapStripeSubscriptionStatusToLocal("past_due"), "past_due");
  assert.equal(mapStripeSubscriptionStatusToLocal("unpaid"), "unpaid");
  assert.equal(mapStripeSubscriptionStatusToLocal("paused"), "paused");
  assert.equal(mapStripeSubscriptionStatusToLocal("incomplete"), "incomplete");
  assert.equal(mapStripeSubscriptionStatusToLocal("canceled"), "cancelled");
  assert.equal(
    mapStripeSubscriptionStatusToLocal("incomplete_expired"),
    "cancelled"
  );
  // Provider-only statuses (e.g. trialing) are unsupported: fail closed.
  assert.equal(mapStripeSubscriptionStatusToLocal("trialing"), null);
  assert.equal(mapStripeSubscriptionStatusToLocal("unknown"), null);
});

test("correlation metadata requires all three exact identifiers", () => {
  const full = buildVipBillingMetadata({
    subscriptionId: "11111111-1111-1111-1111-111111111111",
    userId: "22222222-2222-2222-2222-222222222222",
    planPriceId: "33333333-3333-3333-3333-333333333333",
  });
  assert.deepEqual(extractVipBillingMetadata(full), {
    vipSubscriptionId: "11111111-1111-1111-1111-111111111111",
    vipUserId: "22222222-2222-2222-2222-222222222222",
    vipPlanPriceId: "33333333-3333-3333-3333-333333333333",
  });

  assert.equal(extractVipBillingMetadata(null), null);
  assert.equal(extractVipBillingMetadata({}), null);
  assert.equal(
    extractVipBillingMetadata({ vipSubscriptionId: "x" }),
    null,
    "partial metadata must not correlate"
  );
  assert.equal(
    extractVipBillingMetadata({
      vipSubscriptionId: "x",
      vipUserId: "",
      vipPlanPriceId: "z",
    }),
    null
  );
});

test("paid notification type is activation only before any paid invoice", () => {
  assert.equal(
    decidePaidNotificationType({ lastPaidInvoiceId: null, lastPaidAt: null }),
    "vip_activated"
  );
  assert.equal(
    decidePaidNotificationType({
      lastPaidInvoiceId: "in_1",
      lastPaidAt: new Date(),
    }),
    "vip_renewal_paid"
  );
  assert.equal(
    decidePaidNotificationType({
      lastPaidInvoiceId: null,
      lastPaidAt: new Date(),
    }),
    "vip_renewal_paid"
  );
});
