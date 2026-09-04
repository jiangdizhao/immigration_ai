import assert from "node:assert/strict";
import { test } from "node:test";

import { buildVipBillingEmail } from "./billing-emails";

const BASE = {
  to: "customer@example.com",
  amountMinor: 9900,
  currency: "AUD",
  periodEnd: new Date(Date.UTC(2026, 1, 1)),
  vipUrl: "https://example.com/vip",
};

test("billing emails contain only safe customer-facing content", () => {
  const activated = buildVipBillingEmail({
    ...BASE,
    notificationType: "vip_activated",
  });
  assert.match(activated.subject, /active/i);
  assert.match(activated.text, /A\$99\.00/);
  assert.match(activated.html, /A\$99\.00/);
  assert.match(activated.text, /https:\/\/example\.com\/vip/);

  const renewal = buildVipBillingEmail({
    ...BASE,
    notificationType: "vip_renewal_paid",
  });
  assert.match(renewal.subject, /renewed/i);
  assert.match(renewal.text, /2026-02-01/);

  const failed = buildVipBillingEmail({
    ...BASE,
    notificationType: "vip_payment_failed",
  });
  assert.match(failed.subject, /failed/i);
  assert.match(failed.text, /update your payment method/i);

  const cancelled = buildVipBillingEmail({
    ...BASE,
    notificationType: "vip_cancellation_scheduled",
  });
  assert.match(cancelled.subject, /will not renew/i);
  assert.match(cancelled.text, /remains active through 2026-02-01/);
});

test("billing emails never include provider identifiers or secrets", () => {
  for (const notificationType of [
    "vip_activated",
    "vip_renewal_paid",
    "vip_payment_failed",
    "vip_cancellation_scheduled",
  ] as const) {
    const email = buildVipBillingEmail({ ...BASE, notificationType });
    const combined = `${email.subject}\n${email.text}\n${email.html}`;
    for (const forbidden of [
      "cus_",
      "sub_",
      "in_",
      "evt_",
      "whsec_",
      "sk_",
      "price_stripe",
      "stripe-signature",
    ]) {
      assert.equal(
        combined.includes(forbidden),
        false,
        `${notificationType} leaked ${forbidden}`
      );
    }
  }
});

test("billing emails are AUD-only and need a period or paid-period fallback", () => {
  assert.throws(() =>
    buildVipBillingEmail({
      ...BASE,
      currency: "USD",
      notificationType: "vip_activated",
    })
  );

  const noPeriod = buildVipBillingEmail({
    ...BASE,
    periodEnd: null,
    notificationType: "vip_renewal_paid",
  });
  assert.match(noPeriod.text, /your current paid period/);
});
