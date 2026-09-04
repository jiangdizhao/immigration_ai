import assert from "node:assert/strict";
import { test } from "node:test";

import {
  describeVipBillingProvider,
  getVipBillingProviderConfig,
  isVipBillingSimulationEnabled,
} from "./config";

test("stripe provider requires a server-side secret key and fails closed without one", () => {
  assert.throws(() =>
    getVipBillingProviderConfig({
      NODE_ENV: "production",
      VIP_BILLING_PROVIDER: "stripe",
    } as NodeJS.ProcessEnv)
  );
  assert.throws(() =>
    getVipBillingProviderConfig({
      NODE_ENV: "development",
      VIP_BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "   ",
    } as NodeJS.ProcessEnv)
  );
  assert.deepEqual(
    getVipBillingProviderConfig({
      NODE_ENV: "production",
      VIP_BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_example",
    } as NodeJS.ProcessEnv),
    { provider: "stripe", secretKey: "sk_test_example" }
  );
});

test("client-safe provider status never contains the Stripe secret", () => {
  const env = {
    NODE_ENV: "production",
    VIP_BILLING_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: "sk_live_super_secret_value",
  } as NodeJS.ProcessEnv;

  const status = describeVipBillingProvider(env);
  assert.deepEqual(status, { provider: "stripe", ready: true });
  assert.equal(
    JSON.stringify(status).includes("sk_live_super_secret_value"),
    false
  );
  assert.equal("secretKey" in status, false);

  assert.deepEqual(describeVipBillingProvider({} as NodeJS.ProcessEnv), {
    provider: "unconfigured",
    ready: false,
  });
  assert.deepEqual(
    describeVipBillingProvider({
      NODE_ENV: "development",
      VIP_BILLING_PROVIDER: "stripe",
    } as NodeJS.ProcessEnv),
    { provider: "stripe", ready: false }
  );
});

test("simulation requires an explicit non-production opt-in", () => {
  assert.equal(
    isVipBillingSimulationEnabled({
      NODE_ENV: "development",
      VIP_BILLING_PROVIDER: "simulation",
      VIP_BILLING_SIMULATION_ENABLED: "true",
    } as NodeJS.ProcessEnv),
    true
  );
  assert.deepEqual(
    getVipBillingProviderConfig({
      NODE_ENV: "development",
      VIP_BILLING_PROVIDER: "simulation",
      VIP_BILLING_SIMULATION_ENABLED: "true",
    } as NodeJS.ProcessEnv),
    { provider: "simulation", simulationEnabled: true }
  );
});

test("simulation never runs in production or without explicit opt-in", () => {
  for (const env of [
    {
      NODE_ENV: "production",
      VIP_BILLING_PROVIDER: "simulation",
      VIP_BILLING_SIMULATION_ENABLED: "true",
    },
    {
      NODE_ENV: "development",
      APP_ENV: "production",
      VIP_BILLING_PROVIDER: "simulation",
      VIP_BILLING_SIMULATION_ENABLED: "true",
    },
    {
      NODE_ENV: "development",
      VIP_BILLING_PROVIDER: "simulation",
      VIP_BILLING_SIMULATION_ENABLED: "false",
    },
    {
      NODE_ENV: "development",
      VIP_BILLING_PROVIDER: "simulation",
    },
  ]) {
    assert.equal(
      isVipBillingSimulationEnabled(env as NodeJS.ProcessEnv),
      false
    );
    assert.throws(() => getVipBillingProviderConfig(env as NodeJS.ProcessEnv));
  }
});

test("unconfigured provider fails closed with no silent fallback", () => {
  assert.throws(() => getVipBillingProviderConfig({} as NodeJS.ProcessEnv));
  assert.throws(() =>
    getVipBillingProviderConfig({
      NODE_ENV: "development",
      VIP_BILLING_PROVIDER: "paypal",
    } as NodeJS.ProcessEnv)
  );
});
