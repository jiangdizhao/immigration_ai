// biome-ignore-all lint/suspicious/useAwait: test doubles intentionally return plain values as fake async methods.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { VipSubscription } from "../../db/schema";
import {
  handleVipPortalSession,
  handleVipSubscriptionCancellation,
} from "./customer-billing-api";

const SUB_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

function makeSubscription(
  overrides: Partial<VipSubscription> = {}
): VipSubscription {
  return {
    id: SUB_ID,
    userId: USER_ID,
    planPriceId: "33333333-3333-3333-3333-333333333333",
    provider: "stripe",
    providerCustomerId: "cus_1",
    providerSubscriptionId: "sub_stripe_1",
    providerCheckoutSessionId: null,
    providerPriceId: "price_stripe_1",
    amountMinor: 9900,
    currency: "AUD",
    status: "active",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    endedAt: null,
    lastPaidInvoiceId: null,
    lastPaidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function authOk() {
  return () => Promise.resolve({ userId: USER_ID, role: "user" as const });
}

function authDenied(status: number) {
  return () => Promise.resolve(Response.json({ error: "denied" }, { status }));
}

const cancelSnapshot = (subscription: VipSubscription) => ({
  id: "sub_stripe_1",
  status: "active",
  customer: "cus_1",
  cancelAtPeriodEnd: true,
  canceledAt: null,
  currentPeriodStart: 1_767_225_600,
  currentPeriodEnd: 1_769_904_000,
  priceId: "price_stripe_1",
  metadata: {
    vipSubscriptionId: subscription.id,
    vipUserId: subscription.userId,
    vipPlanPriceId: subscription.planPriceId,
  },
});

test("cancel requests cancel_at_period_end server-side and returns safe state", async () => {
  const subscription = makeSubscription();
  const calls: string[] = [];
  let synced: { cancelAtPeriodEnd?: boolean } | null = null;
  const response = await handleVipSubscriptionCancellation({
    requireCustomer: authOk(),
    repo: {
      async getLiveVipSubscriptionForUser(userId) {
        return userId === USER_ID ? subscription : null;
      },
      async synchronizeVipSubscriptionAfterCancelRequest(input) {
        synced = input;
        subscription.cancelAtPeriodEnd = input.cancelAtPeriodEnd;
        return subscription;
      },
    },
    gateway: {
      async requestCancelAtPeriodEnd(providerSubscriptionId) {
        calls.push(providerSubscriptionId);
        return cancelSnapshot(subscription);
      },
    },
    getBaseUrl: () => "https://example.com",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["sub_stripe_1"]);
  assert.equal(synced?.cancelAtPeriodEnd, true);
  const data = (await response.json()) as {
    subscription: Record<string, unknown>;
  };
  // Only safe state is exposed; no provider identifiers.
  assert.deepEqual(Object.keys(data.subscription).sort(), [
    "cancelAtPeriodEnd",
    "currentPeriodEnd",
    "status",
  ]);
});

test("repeated cancellation is idempotent without a provider call", async () => {
  const subscription = makeSubscription({ cancelAtPeriodEnd: true });
  let providerCalls = 0;
  const response = await handleVipSubscriptionCancellation({
    requireCustomer: authOk(),
    repo: {
      async getLiveVipSubscriptionForUser() {
        return subscription;
      },
      async synchronizeVipSubscriptionAfterCancelRequest() {
        return subscription;
      },
    },
    gateway: {
      async requestCancelAtPeriodEnd() {
        providerCalls += 1;
        throw new Error("must not be called");
      },
    },
    getBaseUrl: () => "https://example.com",
  });
  assert.equal(response.status, 200);
  const data = (await response.json()) as { idempotent: boolean };
  assert.equal(data.idempotent, true);
  assert.equal(providerCalls, 0);
});

test("cancellation requires an owned live subscription and denies strangers", async () => {
  const notFound = await handleVipSubscriptionCancellation({
    requireCustomer: authOk(),
    repo: {
      async getLiveVipSubscriptionForUser() {
        return null;
      },
      async synchronizeVipSubscriptionAfterCancelRequest() {
        return null;
      },
    },
    gateway: {
      async requestCancelAtPeriodEnd() {
        throw new Error("must not be called");
      },
    },
    getBaseUrl: () => "https://example.com",
  });
  assert.equal(notFound.status, 404);

  const denied = await handleVipSubscriptionCancellation({
    requireCustomer: authDenied(401),
    repo: {
      async getLiveVipSubscriptionForUser() {
        throw new Error("must not be called");
      },
      async synchronizeVipSubscriptionAfterCancelRequest() {
        return null;
      },
    },
    gateway: {
      async requestCancelAtPeriodEnd() {
        throw new Error("must not be called");
      },
    },
    getBaseUrl: () => "https://example.com",
  });
  assert.equal(denied.status, 401);
});

test("cancellation fails closed on provider correlation mismatch", async () => {
  const subscription = makeSubscription();
  const response = await handleVipSubscriptionCancellation({
    requireCustomer: authOk(),
    repo: {
      async getLiveVipSubscriptionForUser() {
        return subscription;
      },
      async synchronizeVipSubscriptionAfterCancelRequest() {
        throw new Error("must not be called");
      },
    },
    gateway: {
      async requestCancelAtPeriodEnd() {
        return {
          id: "sub_stripe_1",
          status: "active",
          customer: "cus_1",
          cancelAtPeriodEnd: true,
          canceledAt: null,
          currentPeriodStart: 1_767_225_600,
          currentPeriodEnd: 1_769_904_000,
          priceId: "price_stripe_1",
          // Correlation metadata points to a DIFFERENT local subscription.
          metadata: {
            vipSubscriptionId: "99999999-9999-9999-9999-999999999999",
            vipUserId: USER_ID,
            vipPlanPriceId: subscription.planPriceId,
          },
        };
      },
    },
    getBaseUrl: () => "https://example.com",
  });
  assert.equal(response.status, 503);
});

test("portal session uses the server-owned provider customer id", async () => {
  const portalCalls: { customerId: string; returnUrl: string }[] = [];
  const response = await handleVipPortalSession({
    requireCustomer: authOk(),
    repo: {
      async getLiveVipSubscriptionForUser() {
        return makeSubscription();
      },
    },
    gateway: {
      async createPortalSession(input) {
        portalCalls.push(input);
        return { url: "https://billing.stripe.com/session/abc" };
      },
    },
    getBaseUrl: () => "https://example.com",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(portalCalls, [
    { customerId: "cus_1", returnUrl: "https://example.com/vip" },
  ]);
  const data = (await response.json()) as { url: string };
  assert.equal(data.url, "https://billing.stripe.com/session/abc");
});

test("portal requires an owned subscription with a provider customer", async () => {
  const noCustomer = await handleVipPortalSession({
    requireCustomer: authOk(),
    repo: {
      async getLiveVipSubscriptionForUser() {
        return makeSubscription({ providerCustomerId: null });
      },
    },
    gateway: {
      async createPortalSession() {
        throw new Error("must not be called");
      },
    },
    getBaseUrl: () => "https://example.com",
  });
  assert.equal(noCustomer.status, 404);

  const noSubscription = await handleVipPortalSession({
    requireCustomer: authOk(),
    repo: {
      async getLiveVipSubscriptionForUser() {
        return null;
      },
    },
    gateway: {
      async createPortalSession() {
        throw new Error("must not be called");
      },
    },
    getBaseUrl: () => "https://example.com",
  });
  assert.equal(noSubscription.status, 404);

  const unauthenticated = await handleVipPortalSession({
    requireCustomer: authDenied(403),
    repo: {
      async getLiveVipSubscriptionForUser() {
        throw new Error("must not be called");
      },
    },
    gateway: {
      async createPortalSession() {
        throw new Error("must not be called");
      },
    },
    getBaseUrl: () => "https://example.com",
  });
  assert.equal(unauthenticated.status, 403);
});
