import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateVipWindow,
  entitlementState,
  isActiveVip,
  isPremiumAllowed,
} from "./entitlement";

const now = new Date("2026-08-29T00:00:00.000Z");

test("free users cannot use Premium", () => {
  assert.equal(
    isActiveVip({ membershipTier: "free", vipExpiresAt: null }, now),
    false
  );
  assert.equal(
    isPremiumAllowed(
      { role: "user", membershipTier: "free", vipExpiresAt: null },
      now
    ),
    false
  );
});

test("active VIP users can use Premium", () => {
  const user = {
    role: "user" as const,
    membershipTier: "vip" as const,
    vipExpiresAt: new Date("2026-08-30T00:00:00.000Z"),
  };
  assert.equal(isActiveVip(user, now), true);
  assert.equal(isPremiumAllowed(user, now), true);
  assert.deepEqual(entitlementState(user, now), {
    activeVip: true,
    premiumAllowed: true,
    expiredVip: false,
  });
});

test("expired and inconsistent VIP values are not active", () => {
  assert.equal(
    isActiveVip(
      {
        membershipTier: "vip",
        vipExpiresAt: new Date("2026-08-28T00:00:00.000Z"),
      },
      now
    ),
    false
  );
  assert.equal(
    isActiveVip({ membershipTier: "vip", vipExpiresAt: null }, now),
    false
  );
  assert.equal(
    isPremiumAllowed(
      { role: "user", membershipTier: "vip", vipExpiresAt: null },
      now
    ),
    false
  );
});

test("administrator access is a separate Premium override", () => {
  const admin = {
    role: "admin" as const,
    membershipTier: "free" as const,
    vipExpiresAt: null,
  };
  assert.equal(isActiveVip(admin, now), false);
  assert.equal(isPremiumAllowed(admin, now), true);
  assert.equal(entitlementState(admin, now).premiumAllowed, true);
  assert.equal(admin.membershipTier, "free");
});

test("renewal starts at the later of now and current expiry", () => {
  const existingExpiry = new Date("2026-09-05T00:00:00.000Z");
  const window = calculateVipWindow(existingExpiry, now, 30);
  assert.equal(window.vipStartsAt.toISOString(), existingExpiry.toISOString());
  assert.equal(window.vipExpiresAt.toISOString(), "2026-10-05T00:00:00.000Z");

  const expiredWindow = calculateVipWindow(
    new Date("2026-08-28T00:00:00.000Z"),
    now,
    30
  );
  assert.equal(expiredWindow.vipStartsAt.toISOString(), now.toISOString());
});
