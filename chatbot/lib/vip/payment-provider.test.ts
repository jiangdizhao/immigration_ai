import assert from "node:assert/strict";
import { test } from "node:test";
import { SimulatedVipPaymentProvider } from "./payment-provider";

test("simulated checkout requires provider-issued user-bound references", async () => {
  const provider = new SimulatedVipPaymentProvider();
  const checkout = await provider.createCheckout({
    amountMinor: 9900,
    currency: "AUD",
    userId: "user-a",
  });
  assert.equal(checkout.status, "pending");

  const wrongUser = await provider.verifyPayment({
    providerPaymentId: checkout.providerPaymentId,
    userId: "user-b",
  });
  assert.equal(wrongUser.status, "failed");

  const paid = await provider.verifyPayment({
    providerPaymentId: checkout.providerPaymentId,
    userId: "user-a",
  });
  assert.equal(paid.status, "paid");
  const repeated = await provider.verifyPayment({
    providerPaymentId: checkout.providerPaymentId,
    userId: "user-a",
  });
  assert.equal(repeated.status, "paid");
});

test("cancelled simulation never verifies as paid", async () => {
  const provider = new SimulatedVipPaymentProvider();
  const checkout = await provider.createCheckout({
    amountMinor: 9900,
    currency: "AUD",
    userId: "user-a",
  });
  const cancelled = await provider.cancelCheckout({
    providerPaymentId: checkout.providerPaymentId,
    userId: "user-a",
  });
  assert.equal(cancelled.status, "cancelled");
  const repeated = await provider.verifyPayment({
    providerPaymentId: checkout.providerPaymentId,
    userId: "user-a",
  });
  assert.equal(repeated.status, "cancelled");
});
