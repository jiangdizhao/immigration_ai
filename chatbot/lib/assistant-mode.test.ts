import assert from "node:assert/strict";
import test from "node:test";
import {
  isAssistantModeAllowed,
  normalizeAssistantMode,
  resolveAllowedAssistantMode,
  widgetRouteForAssistantMode,
} from "./assistant-mode";
import { assistantModeAccessPolicy } from "./assistant-mode-access";

const guestPolicy = {
  userType: "guest" as const,
  fastAllowed: true,
  slowAllowed: false,
  premiumAllowed: false,
};
const freePolicy = {
  userType: "regular" as const,
  fastAllowed: true,
  slowAllowed: false,
  premiumAllowed: false,
};
const vipPolicy = {
  userType: "regular" as const,
  fastAllowed: true,
  slowAllowed: true,
  premiumAllowed: true,
};

test("normalizes canonical and legacy assistant modes at compatibility boundaries", () => {
  assert.equal(normalizeAssistantMode("fast"), "fast");
  assert.equal(normalizeAssistantMode("default"), "default");
  assert.equal(normalizeAssistantMode("premium"), "premium");
  assert.equal(normalizeAssistantMode("default_legal_pipeline"), "default");
  assert.equal(normalizeAssistantMode("premium_direct_gpt55_high"), "premium");
  assert.equal(normalizeAssistantMode("unknown"), "default");
  assert.equal(normalizeAssistantMode(null), "default");
});

test("selects a route from canonical assistant mode only", () => {
  assert.equal(widgetRouteForAssistantMode("fast"), "/api/widget-chat-fast");
  assert.equal(widgetRouteForAssistantMode("default"), "/api/widget-chat");
  assert.equal(
    widgetRouteForAssistantMode("premium"),
    "/api/widget-chat-direct"
  );
});

test("resolves stored modes to the first permitted lane", () => {
  assert.equal(resolveAllowedAssistantMode(null, guestPolicy), "fast");
  assert.equal(resolveAllowedAssistantMode(null, freePolicy), "fast");
  assert.equal(resolveAllowedAssistantMode("premium", guestPolicy), "fast");
  assert.equal(resolveAllowedAssistantMode("default", guestPolicy), "fast");
  assert.equal(resolveAllowedAssistantMode("premium", freePolicy), "fast");
  assert.equal(resolveAllowedAssistantMode("default", freePolicy), "fast");
  assert.equal(resolveAllowedAssistantMode("premium", vipPolicy), "premium");
});

test("builds the role and entitlement access matrix without exposing identity", () => {
  const free = assistantModeAccessPolicy({
    user: { type: "regular", email: "free@example.com" },
    entitlement: { role: "user", membershipTier: "free", vipExpiresAt: null },
  });
  assert.equal(isAssistantModeAllowed("fast", free), true);
  assert.equal(isAssistantModeAllowed("default", free), false);
  assert.equal(isAssistantModeAllowed("premium", free), false);

  assert.deepEqual(
    assistantModeAccessPolicy({
      user: { type: "guest", email: "guest-123@example.invalid" },
      entitlement: null,
    }),
    {
      userType: "guest",
      fastAllowed: true,
      slowAllowed: false,
      premiumAllowed: false,
    }
  );
  assert.deepEqual(
    assistantModeAccessPolicy({
      user: { type: "regular", email: "free@example.com" },
      entitlement: {
        role: "user",
        membershipTier: "free",
        vipExpiresAt: null,
      },
    }),
    {
      userType: "regular",
      fastAllowed: true,
      slowAllowed: false,
      premiumAllowed: false,
    }
  );
  assert.deepEqual(
    assistantModeAccessPolicy({
      user: { type: "regular", email: "vip@example.com" },
      entitlement: {
        role: "user",
        membershipTier: "vip",
        vipExpiresAt: new Date(Date.now() + 86_400_000),
      },
    }),
    {
      userType: "regular",
      fastAllowed: true,
      slowAllowed: true,
      premiumAllowed: true,
    }
  );
  assert.deepEqual(
    assistantModeAccessPolicy({
      user: { type: "regular", email: "lawyer@example.com" },
      entitlement: {
        role: "lawyer",
        membershipTier: "free",
        vipExpiresAt: null,
      },
    }),
    {
      userType: "regular",
      fastAllowed: true,
      slowAllowed: true,
      premiumAllowed: false,
    }
  );
  assert.deepEqual(
    assistantModeAccessPolicy({
      user: { type: "regular", email: "admin@example.com" },
      entitlement: {
        role: "admin",
        membershipTier: "free",
        vipExpiresAt: null,
      },
    }),
    {
      userType: "regular",
      fastAllowed: true,
      slowAllowed: true,
      premiumAllowed: true,
    }
  );
  const entitledLawyer = assistantModeAccessPolicy({
    user: { type: "regular", email: "lawyer-vip@example.com" },
    entitlement: {
      role: "lawyer",
      membershipTier: "vip",
      vipExpiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  assert.equal(entitledLawyer.slowAllowed, true);
  assert.equal(entitledLawyer.premiumAllowed, true);
});
