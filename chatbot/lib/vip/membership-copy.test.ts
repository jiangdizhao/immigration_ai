import assert from "node:assert/strict";
import { test } from "node:test";

import { isActiveVip } from "./entitlement";
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

test("prepaid VIP with an abandoned recurring checkout has no renewal controls", () => {
  const now = new Date("2026-10-10T00:00:00.000Z");
  const prepaidMembership = {
    membershipTier: "vip" as const,
    vipExpiresAt: new Date("2026-11-10T00:00:00.000Z"),
  };
  assert.equal(isActiveVip(prepaidMembership, now), true);

  for (const status of [
    "pending",
    "incomplete",
    "unpaid",
    "past_due",
    "paused",
  ]) {
    assert.deepEqual(
      getVipRenewalPresentation({ status, cancelAtPeriodEnd: false }),
      {
        renewalCopy: "This prepaid membership does not renew automatically.",
        showBillingManagement: false,
        showCancelRenewal: false,
      }
    );
  }
});

test("recurring VIP retains billing and cancellation management", () => {
  assert.deepEqual(
    getVipRenewalPresentation({ status: "active", cancelAtPeriodEnd: false }),
    {
      renewalCopy: "Renews automatically until cancelled.",
      showBillingManagement: true,
      showCancelRenewal: true,
    }
  );
  assert.deepEqual(
    getVipRenewalPresentation({ status: "active", cancelAtPeriodEnd: true }),
    {
      renewalCopy:
        "Renewal is cancelled; membership stays active until the end of the paid period.",
      showBillingManagement: true,
      showCancelRenewal: false,
    }
  );
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
