import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getVipCheckoutReturnNotice,
  getVipRenewalPresentation,
} from "./membership-copy";

test("prepaid VIP has no automatic renewal copy or subscription controls", () => {
  const presentation = getVipRenewalPresentation(null);
  assert.match(presentation.renewalCopy, /does not renew automatically/);
  assert.equal(presentation.showBillingManagement, false);
  assert.equal(presentation.showCancelRenewal, false);
});

test("recurring VIP retains billing and cancellation management", () => {
  assert.deepEqual(getVipRenewalPresentation({ cancelAtPeriodEnd: false }), {
    renewalCopy: "Renews automatically until cancelled.",
    showBillingManagement: true,
    showCancelRenewal: true,
  });
  assert.deepEqual(getVipRenewalPresentation({ cancelAtPeriodEnd: true }), {
    renewalCopy:
      "Renewal is cancelled; membership stays active until the end of the paid period.",
    showBillingManagement: true,
    showCancelRenewal: false,
  });
});

test("checkout success redirects are notices only and never imply activation", () => {
  assert.equal(
    getVipCheckoutReturnNotice("?checkout=success"),
    "Payment submitted. Membership activates after secure payment confirmation."
  );
  assert.equal(
    getVipCheckoutReturnNotice("?checkout=cancelled"),
    "Checkout was cancelled. You were not charged."
  );
  assert.equal(
    getVipCheckoutReturnNotice("?checkout=success&vip=true"),
    "Payment submitted. Membership activates after secure payment confirmation."
  );
  assert.equal(getVipCheckoutReturnNotice("?vip=true"), null);
});
