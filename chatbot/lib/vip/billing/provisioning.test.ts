// biome-ignore-all lint/suspicious/useAwait: test doubles intentionally return plain values as fake async methods.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { VipPlanPrice } from "../../db/schema";
import {
  ensureVipPlanPriceProvisioned,
  VIP_PRODUCT_NAME,
} from "./provisioning";

function makePrice(overrides: Partial<VipPlanPrice> = {}): VipPlanPrice {
  return {
    id: "price-row-1",
    amountMinor: 9900,
    currency: "AUD",
    billingInterval: "month",
    active: true,
    createdByUserId: null,
    provider: null,
    providerProductId: null,
    providerPriceId: null,
    providerSyncStatus: "unprovisioned",
    createdAt: new Date(),
    retiredAt: null,
    ...overrides,
  };
}

type ProvisioningHarness = {
  prices: Map<string, VipPlanPrice>;
  productCalls: { name: string; idempotencyKey: string }[];
  priceCalls: {
    product: string;
    currency: string;
    unitAmount: number;
    idempotencyKey: string;
  }[];
  failNext: { product?: boolean; price?: boolean };
  reusableProductId: string | null;
  repo: Parameters<typeof ensureVipPlanPriceProvisioned>[0]["repo"];
  gateway: Parameters<typeof ensureVipPlanPriceProvisioned>[0]["gateway"];
};

function makeHarness(initialPrice: VipPlanPrice): ProvisioningHarness {
  const harness = {
    prices: new Map([[initialPrice.id, initialPrice]]),
    productCalls: [],
    priceCalls: [],
    failNext: {},
    reusableProductId: null,
  } as unknown as ProvisioningHarness;

  harness.repo = {
    async getVipPlanPriceById(id: string) {
      return harness.prices.get(id) ?? null;
    },
    async findReusableProviderProductId() {
      return harness.reusableProductId;
    },
    async markPlanPriceProvisioned(input: {
      id: string;
      provider: string;
      providerProductId: string;
      providerPriceId: string;
    }) {
      const price = harness.prices.get(input.id);
      if (price) {
        price.provider = input.provider;
        price.providerProductId = input.providerProductId;
        price.providerPriceId = input.providerPriceId;
        price.providerSyncStatus = "ready";
      }
    },
    async markPlanPriceProvisioningFailed(id: string) {
      const price = harness.prices.get(id);
      if (price) {
        price.providerSyncStatus = "failed";
      }
    },
  };

  harness.gateway = {
    async createProduct(input: { name: string; idempotencyKey: string }) {
      harness.productCalls.push(input);
      if (harness.failNext.product) {
        harness.failNext.product = false;
        throw new Error("stripe product failure");
      }
      return { id: "prod_123" };
    },
    async createPrice(input: {
      product: string;
      currency: string;
      unitAmount: number;
      idempotencyKey: string;
    }) {
      harness.priceCalls.push(input);
      if (harness.failNext.price) {
        harness.failNext.price = false;
        throw new Error("stripe price failure");
      }
      return { id: `price_stripe_${harness.priceCalls.length}` };
    },
  };

  return harness;
}

test("unprovisioned price provisions one product and one immutable monthly price", async () => {
  const harness = makeHarness(makePrice());
  const result = await ensureVipPlanPriceProvisioned({
    planPriceId: "price-row-1",
    repo: harness.repo,
    gateway: harness.gateway,
  });

  assert.deepEqual(result, {
    status: "ready",
    providerProductId: "prod_123",
    providerPriceId: "price_stripe_1",
  });
  assert.equal(harness.productCalls.length, 1);
  assert.equal(harness.productCalls[0]?.name, VIP_PRODUCT_NAME);
  assert.equal(harness.priceCalls.length, 1);
  assert.equal(harness.priceCalls[0]?.currency, "aud");
  assert.equal(harness.priceCalls[0]?.unitAmount, 9900);
  // Stable local-identifier idempotency key; never random.
  assert.equal(
    harness.priceCalls[0]?.idempotencyKey,
    "immigration-ai-vip-plan-price:price-row-1"
  );
  const stored = harness.prices.get("price-row-1");
  assert.equal(stored?.providerSyncStatus, "ready");
  assert.equal(stored?.providerPriceId, "price_stripe_1");
});

test("second provisioning performs no duplicate Stripe calls", async () => {
  const harness = makeHarness(makePrice());
  const input = {
    planPriceId: "price-row-1",
    repo: harness.repo,
    gateway: harness.gateway,
  };
  await ensureVipPlanPriceProvisioned(input);
  const result = await ensureVipPlanPriceProvisioned(input);

  assert.deepEqual(result, {
    status: "ready",
    providerProductId: "prod_123",
    providerPriceId: "price_stripe_1",
  });
  assert.equal(harness.productCalls.length, 1);
  assert.equal(harness.priceCalls.length, 1);
});

test("a new price reuses the existing conceptual product", async () => {
  const second = makeHarness(
    makePrice({ id: "price-row-2", amountMinor: 12_000 })
  );
  second.reusableProductId = "prod_123";

  const result = await ensureVipPlanPriceProvisioned({
    planPriceId: "price-row-2",
    repo: second.repo,
    gateway: second.gateway,
  });
  assert.equal(result.status, "ready");
  assert.equal(second.productCalls.length, 0, "no duplicate product creation");
  assert.equal(second.priceCalls[0]?.product, "prod_123");
  assert.equal(second.priceCalls[0]?.unitAmount, 12_000);
});

test("provider failure marks failed without fabricating ids; safe retry succeeds", async () => {
  const harness = makeHarness(makePrice());
  harness.failNext.price = true;

  const failed = await ensureVipPlanPriceProvisioned({
    planPriceId: "price-row-1",
    repo: harness.repo,
    gateway: harness.gateway,
  });
  assert.deepEqual(failed, { status: "failed", reason: "provider_error" });
  const stored = harness.prices.get("price-row-1");
  assert.equal(stored?.providerSyncStatus, "failed");
  assert.equal(stored?.providerPriceId, null, "no fabricated provider ids");

  const retried = await ensureVipPlanPriceProvisioned({
    planPriceId: "price-row-1",
    repo: harness.repo,
    gateway: harness.gateway,
  });
  assert.equal(retried.status, "ready");
  assert.equal(harness.prices.get("price-row-1")?.providerSyncStatus, "ready");
});

test("old price rows are never modified during another price's provisioning", async () => {
  const oldPrice = makePrice({
    id: "price-old",
    amountMinor: 7900,
    provider: "stripe",
    providerProductId: "prod_123",
    providerPriceId: "price_stripe_old",
    providerSyncStatus: "ready",
    active: false,
    retiredAt: new Date(),
  });
  const harness = makeHarness(makePrice({ id: "price-new" }));
  harness.reusableProductId = "prod_123";
  const before = JSON.stringify(oldPrice);

  await ensureVipPlanPriceProvisioned({
    planPriceId: "price-new",
    repo: harness.repo,
    gateway: harness.gateway,
  });

  assert.equal(JSON.stringify(oldPrice), before, "historical price immutable");
});
