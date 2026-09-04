import assert from "node:assert/strict";
import { test } from "node:test";

import { decideVipMonthlyPriceChange } from "./price-decision";

const activePrice = {
  id: "price-old",
  amountMinor: 9900,
  currency: "AUD",
  billingInterval: "month",
  active: true,
  retiredAt: null,
};

test("first price creates a new active AUD monthly price", () => {
  const decision = decideVipMonthlyPriceChange({
    requestedAmountMinor: 9900,
    currentActivePrice: null,
  });
  assert.equal(decision.action, "replace");
  if (decision.action === "replace") {
    assert.equal(decision.retirePriceId, null);
    assert.deepEqual(decision.createPrice, {
      amountMinor: 9900,
      currency: "AUD",
      billingInterval: "month",
    });
  }
});

test("price change retires the historical price and creates a new one", () => {
  const decision = decideVipMonthlyPriceChange({
    requestedAmountMinor: 12_000,
    currentActivePrice: activePrice,
  });
  assert.equal(decision.action, "replace");
  if (decision.action === "replace") {
    assert.equal(decision.retirePriceId, "price-old");
    assert.deepEqual(decision.createPrice, {
      amountMinor: 12_000,
      currency: "AUD",
      billingInterval: "month",
    });
  }
});

test("submitting the exact already-active amount is idempotent", () => {
  const decision = decideVipMonthlyPriceChange({
    requestedAmountMinor: 9900,
    currentActivePrice: activePrice,
  });
  assert.deepEqual(decision, {
    action: "idempotent",
    existingPriceId: "price-old",
  });
});

test("historical prices are never mutated, only retired and replaced", () => {
  const decision = decideVipMonthlyPriceChange({
    requestedAmountMinor: 5000,
    currentActivePrice: activePrice,
  });
  assert.equal(decision.action, "replace");
  if (decision.action === "replace") {
    // The decision carries the old id for retirement and a brand-new price
    // request; no mutation of the existing row is ever represented.
    assert.equal(decision.retirePriceId, "price-old");
    assert.notEqual(decision.createPrice.amountMinor, activePrice.amountMinor);
  }
});

test("invalid amounts are rejected", () => {
  for (const invalid of [0, -1, 1.5, Number.NaN, "9900", null, undefined]) {
    const decision = decideVipMonthlyPriceChange({
      requestedAmountMinor: invalid,
      currentActivePrice: null,
    });
    assert.deepEqual(decision, {
      action: "reject",
      reason: "invalid_amount",
    });
  }
});
