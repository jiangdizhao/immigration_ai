import assert from "node:assert/strict";
import { test } from "node:test";
import { getVipProductConfig, isVipSimulationEnabled } from "./config";

test("simulation requires an explicit non-production configuration", () => {
  const enabled: NodeJS.ProcessEnv = {
    NODE_ENV: "development",
    VIP_PAYMENT_PROVIDER: "simulation",
    VIP_SIMULATED_PAYMENT_ENABLED: "true",
    VIP_PRICE_MINOR: "12345",
    VIP_DURATION_DAYS: "45",
  };
  assert.equal(isVipSimulationEnabled(enabled), true);
  assert.deepEqual(getVipProductConfig(enabled), {
    provider: "simulation",
    amountMinor: 12_345,
    currency: "AUD",
    durationDays: 45,
  });
});

test("simulation fails closed in production and when disabled", () => {
  const production: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    VIP_PAYMENT_PROVIDER: "simulation",
    VIP_SIMULATED_PAYMENT_ENABLED: "true",
  };
  assert.equal(isVipSimulationEnabled(production), false);
  assert.throws(() => getVipProductConfig(production));
  assert.equal(
    isVipSimulationEnabled({
      NODE_ENV: "test",
      APP_ENV: "production",
      VIP_PAYMENT_PROVIDER: "simulation",
      VIP_SIMULATED_PAYMENT_ENABLED: "true",
    }),
    false
  );
  assert.equal(
    isVipSimulationEnabled({
      NODE_ENV: "development",
      VIP_PAYMENT_PROVIDER: "simulation",
      VIP_SIMULATED_PAYMENT_ENABLED: "false",
    } as NodeJS.ProcessEnv),
    false
  );
});

test("invalid product configuration uses documented local defaults", () => {
  assert.deepEqual(
    getVipProductConfig({
      NODE_ENV: "test",
      VIP_PAYMENT_PROVIDER: "simulation",
      VIP_SIMULATED_PAYMENT_ENABLED: "true",
      VIP_PRICE_MINOR: "not-a-number",
      VIP_DURATION_DAYS: "0",
    } as NodeJS.ProcessEnv),
    {
      provider: "simulation",
      amountMinor: 9900,
      currency: "AUD",
      durationDays: 30,
    }
  );
});
