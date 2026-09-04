// Server-side recurring VIP billing provider configuration. This is a NEW
// boundary for Phase 9 recurring billing; the historical one-time simulated
// payment configuration in ../config.ts is untouched.
//
// Production must never silently fall back to simulation. A missing Stripe
// secret fails closed.

export type VipBillingProviderName = "simulation" | "stripe";

export type VipBillingProviderConfig =
  | { provider: "simulation"; simulationEnabled: true }
  | { provider: "stripe"; secretKey: string };

export function isProductionBillingEnvironment(
  env: NodeJS.ProcessEnv
): boolean {
  return (
    env.NODE_ENV === "production" ||
    env.APP_ENV === "production" ||
    env.VERCEL_ENV === "production"
  );
}

export function isVipBillingSimulationEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    !isProductionBillingEnvironment(env) &&
    env.VIP_BILLING_PROVIDER === "simulation" &&
    env.VIP_BILLING_SIMULATION_ENABLED === "true"
  );
}

/**
 * Resolve the recurring billing provider configuration. Throws (fails closed)
 * when the provider is unconfigured, when simulation is not explicitly enabled
 * in a non-production environment, or when the Stripe provider is selected
 * without a server-side secret key.
 */
export function getVipBillingProviderConfig(
  env: NodeJS.ProcessEnv = process.env
): VipBillingProviderConfig {
  const provider = env.VIP_BILLING_PROVIDER;

  if (provider === "stripe") {
    const secretKey = env.STRIPE_SECRET_KEY;
    if (typeof secretKey !== "string" || secretKey.trim().length === 0) {
      throw new Error(
        "STRIPE_SECRET_KEY is required when VIP_BILLING_PROVIDER=stripe."
      );
    }
    return { provider: "stripe", secretKey };
  }

  if (provider === "simulation") {
    if (!isVipBillingSimulationEnabled(env)) {
      throw new Error(
        "VIP recurring billing simulation requires an explicit non-production opt-in."
      );
    }
    return { provider: "simulation", simulationEnabled: true };
  }

  throw new Error(
    "VIP_BILLING_PROVIDER must be explicitly set to 'stripe' or 'simulation'."
  );
}

export type VipBillingProviderStatus = {
  provider: VipBillingProviderName | "unconfigured";
  ready: boolean;
};

/**
 * Client-safe provider status. Never includes the Stripe secret key or any
 * other credential material.
 */
export function describeVipBillingProvider(
  env: NodeJS.ProcessEnv = process.env
): VipBillingProviderStatus {
  const provider = env.VIP_BILLING_PROVIDER;

  if (provider === "stripe") {
    const hasSecretKey =
      typeof env.STRIPE_SECRET_KEY === "string" &&
      env.STRIPE_SECRET_KEY.trim().length > 0;
    return { provider: "stripe", ready: hasSecretKey };
  }

  if (provider === "simulation") {
    return {
      provider: "simulation",
      ready: isVipBillingSimulationEnabled(env),
    };
  }

  return { provider: "unconfigured", ready: false };
}
