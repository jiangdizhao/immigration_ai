// biome-ignore-all lint/suspicious/useAwait: test doubles intentionally return plain values as fake async methods.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { VipPlanPrice, VipSubscription } from "../../db/schema";
import { handleVipSubscriptionCheckout } from "./customer-billing-api";

const USER_ID = "22222222-2222-2222-2222-222222222222";
const PRICE_ID = "33333333-3333-3333-3333-333333333333";

function makePrice(): VipPlanPrice {
  return {
    id: PRICE_ID,
    amountMinor: 9900,
    currency: "AUD",
    billingInterval: "month",
    active: true,
    createdByUserId: null,
    provider: "stripe",
    providerProductId: "prod_1",
    providerPriceId: "price_stripe_1",
    providerSyncStatus: "ready",
    createdAt: new Date(),
    retiredAt: null,
  };
}

function makeSubscription(overrides: Partial<VipSubscription> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    userId: USER_ID,
    planPriceId: PRICE_ID,
    provider: "stripe",
    providerCustomerId: null,
    providerSubscriptionId: null,
    providerCheckoutSessionId: null,
    providerPriceId: null,
    amountMinor: 9900,
    currency: "AUD",
    status: "pending",
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
  } as VipSubscription;
}

function makeDeps(overrides: {
  price?: VipPlanPrice | null;
  provisioning?: "ready" | "failed";
  liveSubscription?: VipSubscription | null;
  role?: "user" | "lawyer" | "admin";
}) {
  const created: VipSubscription[] = [];
  const rebinds: { planPriceId: string; amountMinor: number }[] = [];
  const sessions: Record<string, unknown>[] = [];
  const markedSessions: string[] = [];

  const deps = {
    requireCustomer: () =>
      Promise.resolve({
        userId: USER_ID,
        role: overrides.role ?? ("user" as const),
      }),
    repo: {
      async getActiveVipPlanPrice() {
        return overrides.price === undefined ? makePrice() : overrides.price;
      },
      async ensurePlanPriceProvisioned() {
        return overrides.provisioning === "failed"
          ? { status: "failed" as const, reason: "provider_error" as const }
          : {
              status: "ready" as const,
              providerProductId: "prod_1",
              providerPriceId: "price_stripe_1",
            };
      },
      async getLiveVipSubscriptionForUser() {
        return overrides.liveSubscription ?? null;
      },
      async createPendingVipSubscription(input: {
        userId: string;
        planPriceId: string;
        amountMinor: number;
        currency: string;
      }) {
        const subscription = makeSubscription({
          userId: input.userId,
          planPriceId: input.planPriceId,
          amountMinor: input.amountMinor,
          currency: input.currency,
        });
        created.push(subscription);
        return subscription;
      },
      async rebindPendingVipSubscriptionToPrice(input: {
        planPriceId: string;
        amountMinor: number;
      }) {
        rebinds.push({
          planPriceId: input.planPriceId,
          amountMinor: input.amountMinor,
        });
        return makeSubscription({
          planPriceId: input.planPriceId,
          amountMinor: input.amountMinor,
        });
      },
      async markVipSubscriptionCheckoutSession(input: {
        providerCheckoutSessionId: string;
      }) {
        markedSessions.push(input.providerCheckoutSessionId);
      },
    },
    gateway: {
      async createCheckoutSession(input: Record<string, unknown>) {
        sessions.push(input);
        return { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" };
      },
    },
    getBaseUrl: () => "https://example.com",
  };

  return { deps, created, rebinds, sessions, markedSessions };
}

test("checkout uses the exact server-owned Stripe Price and correlation metadata", async () => {
  const env = makeDeps({});
  const response = await handleVipSubscriptionCheckout(env.deps);

  assert.equal(response.status, 200);
  assert.equal(env.created.length, 1);
  assert.equal(env.created[0]?.status, "pending");
  assert.equal(env.created[0]?.amountMinor, 9900);
  assert.equal(env.created[0]?.currency, "AUD");

  const session = env.sessions[0] as {
    priceId: string;
    metadata: Record<string, string>;
    subscriptionMetadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
  };
  assert.equal(session.priceId, "price_stripe_1");
  assert.equal(session.metadata.vipSubscriptionId, env.created[0]?.id);
  assert.equal(session.metadata.vipUserId, USER_ID);
  assert.equal(session.metadata.vipPlanPriceId, PRICE_ID);
  assert.deepEqual(session.subscriptionMetadata, session.metadata);
  assert.equal(session.successUrl, "https://example.com/vip?checkout=success");
  assert.equal(session.cancelUrl, "https://example.com/vip?checkout=cancelled");
  assert.equal(env.markedSessions[0], "cs_1");

  const data = (await response.json()) as { url: string };
  assert.equal(data.url, "https://checkout.stripe.com/c/pay/cs_1");
});

test("checkout is denied for staff/admin roles", async () => {
  const admin = await handleVipSubscriptionCheckout(
    makeDeps({ role: "admin" }).deps
  );
  assert.equal(admin.status, 403);
  const lawyer = await handleVipSubscriptionCheckout(
    makeDeps({ role: "lawyer" }).deps
  );
  assert.equal(lawyer.status, 403);
});

test("checkout fails closed without a price or a provisioned Stripe Price", async () => {
  const noPrice = await handleVipSubscriptionCheckout(
    makeDeps({ price: null }).deps
  );
  assert.equal(noPrice.status, 503);

  const unprovisioned = await handleVipSubscriptionCheckout(
    makeDeps({ provisioning: "failed" }).deps
  );
  assert.equal(unprovisioned.status, 503);
});

test("checkout blocks duplicate live subscriptions and retries pending safely", async () => {
  const activeBlock = await handleVipSubscriptionCheckout(
    makeDeps({
      liveSubscription: makeSubscription({
        providerSubscriptionId: "sub_stripe_1",
      }),
    }).deps
  );
  assert.equal(activeBlock.status, 409);

  const statusBlock = await handleVipSubscriptionCheckout(
    makeDeps({
      liveSubscription: makeSubscription({ status: "active" }),
    }).deps
  );
  assert.equal(statusBlock.status, 409);

  // Narrow retry: pending without provider binding follows the current price.
  const retry = makeDeps({
    liveSubscription: makeSubscription({
      planPriceId: "44444444-4444-4444-4444-444444444444",
      amountMinor: 7900,
    }),
  });
  const retryResponse = await handleVipSubscriptionCheckout(retry.deps);
  assert.equal(retryResponse.status, 200);
  assert.deepEqual(retry.rebinds, [
    { planPriceId: PRICE_ID, amountMinor: 9900 },
  ]);
  const session = retry.sessions[0] as { priceId: string };
  assert.equal(session.priceId, "price_stripe_1");
});

test("the browser cannot influence amount or price identifiers", async () => {
  // The handler accepts no request body at all: amount, plan price, and the
  // Stripe Price come only from the server-owned active VipPlanPrice and its
  // provisioning result.
  const env = makeDeps({});
  const response = await handleVipSubscriptionCheckout(env.deps);
  const data = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(data), ["url"]);
  const session = env.sessions[0] as { priceId: string };
  assert.equal(session.priceId, "price_stripe_1");
});
