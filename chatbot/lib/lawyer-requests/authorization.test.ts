import assert from "node:assert/strict";
import test from "node:test";
import {
  canCreateLawyerClarificationRequest,
  requestSourceForRole,
} from "./authorization";

const now = new Date("2026-08-29T00:00:00.000Z");

test("only active VIP and admin entitlements may create requests", () => {
  assert.equal(
    canCreateLawyerClarificationRequest(
      { role: "user", membershipTier: "free", vipExpiresAt: null },
      now
    ),
    false
  );
  assert.equal(
    canCreateLawyerClarificationRequest(
      {
        role: "user",
        membershipTier: "vip",
        vipExpiresAt: "2026-08-28T00:00:00.000Z",
      },
      now
    ),
    false
  );
  assert.equal(
    canCreateLawyerClarificationRequest(
      {
        role: "user",
        membershipTier: "vip",
        vipExpiresAt: "2026-08-30T00:00:00.000Z",
      },
      now
    ),
    true
  );
  assert.equal(
    canCreateLawyerClarificationRequest(
      { role: "admin", membershipTier: "free", vipExpiresAt: null },
      now
    ),
    true
  );
});

test("request source is server-derived from role", () => {
  assert.equal(requestSourceForRole("user"), "vip_customer");
  assert.equal(requestSourceForRole("admin"), "admin_test");
});
