import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type AdminAuthenticator,
  type AdminPriceService,
  handleAdminVipBillingPriceGet,
  handleAdminVipBillingPriceSet,
} from "./admin-price-api";

function makeService() {
  const calls: {
    setPrice?: { amountMinor: number; adminUserId: string | null };
  }[] = [];
  const currentPrice = {
    id: "price-1",
    amountMinor: 9900,
    currency: "AUD",
    billingInterval: "month",
    providerSyncStatus: "unprovisioned",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    createdByUserId: null,
    provider: null,
    providerProductId: null,
    providerPriceId: null,
    active: true,
    retiredAt: null,
  };

  const service: AdminPriceService = {
    getActiveVipMonthlyPrice() {
      return Promise.resolve(currentPrice);
    },
    setActiveVipMonthlyPrice(input) {
      calls.push({ setPrice: input });
      return Promise.resolve({
        ...currentPrice,
        id: "price-2",
        amountMinor: input.amountMinor,
      });
    },
  };

  return { service, calls };
}

const adminAuth: AdminAuthenticator = () =>
  Promise.resolve({ userId: "admin-1" });

function deniedAuth(status: number): AdminAuthenticator {
  return () =>
    Promise.resolve(
      Response.json({ error: "Administrator access required." }, { status })
    );
}

function jsonRequest(body: unknown, raw?: string) {
  return new Request("http://localhost/api/admin/vip-billing/price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

test("admin can read the current active monthly price", async () => {
  const { service } = makeService();
  const response = await handleAdminVipBillingPriceGet({
    requireAdmin: adminAuth,
    service,
  });
  assert.equal(response.status, 200);
  const data = (await response.json()) as { price: { amountMinor: number } };
  assert.equal(data.price.amountMinor, 9900);
});

test("unauthenticated, normal user, and lawyer requests are denied", async () => {
  const { service } = makeService();

  for (const status of [401, 403]) {
    const getResponse = await handleAdminVipBillingPriceGet({
      requireAdmin: deniedAuth(status),
      service,
    });
    assert.equal(getResponse.status, status);

    const setResponse = await handleAdminVipBillingPriceSet({
      requireAdmin: deniedAuth(status),
      service,
      request: jsonRequest({ amountMinor: 9900 }),
    });
    assert.equal(setResponse.status, status);
  }

  assert.equal(makeService().calls.length, 0);
});

test("admin can create or change the monthly price", async () => {
  const { service, calls } = makeService();
  const response = await handleAdminVipBillingPriceSet({
    requireAdmin: adminAuth,
    service,
    request: jsonRequest({ amountMinor: 12_000 }),
  });
  assert.equal(response.status, 200);
  const data = (await response.json()) as { price: { amountMinor: number } };
  assert.equal(data.price.amountMinor, 12_000);
  assert.deepEqual(calls[0]?.setPrice, {
    amountMinor: 12_000,
    adminUserId: "admin-1",
  });
});

test("malformed and invalid amounts are rejected without touching the service", async () => {
  const { service, calls } = makeService();

  const invalidBodies: unknown[] = [
    { amountMinor: 0 },
    { amountMinor: -1 },
    { amountMinor: 1.5 },
    { amountMinor: "9900" },
    {},
    { amountMinor: 9900, providerPriceId: "price_abc" },
    { amountMinor: 9900, currency: "USD" },
    { amountMinor: Number.NaN },
  ];

  for (const body of invalidBodies) {
    const response = await handleAdminVipBillingPriceSet({
      requireAdmin: adminAuth,
      service,
      request: jsonRequest(body),
    });
    assert.equal(response.status, 400, JSON.stringify(body));
  }

  const rawResponse = await handleAdminVipBillingPriceSet({
    requireAdmin: adminAuth,
    service,
    request: jsonRequest(null, "not-json"),
  });
  assert.equal(rawResponse.status, 400);

  assert.equal(calls.length, 0);
});

test("responses never include provider identifiers or credentials", async () => {
  const { service } = makeService();
  const response = await handleAdminVipBillingPriceGet({
    requireAdmin: adminAuth,
    service,
  });
  const text = await response.clone().text();
  assert.equal(
    text.includes("providerPriceId") || text.includes("providerProductId"),
    false
  );
  assert.equal(text.includes("secret"), false);
  await response.json();
});
