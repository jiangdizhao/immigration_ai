import "server-only";

import Stripe from "stripe";

import { getVipBillingProviderConfig } from "./config";

// Server-only Stripe client boundary for Phase 9 recurring VIP billing.
//
// M1 only establishes this boundary: no checkout sessions, webhooks, billing
// portal, or any other live Stripe API calls are made yet (that is M2). The
// client is created lazily so unit tests never require a Stripe account or a
// real key, and the secret key never leaves the server module graph.

let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  const config = getVipBillingProviderConfig();
  if (config.provider !== "stripe") {
    throw new Error(
      "The Stripe client is only available when VIP_BILLING_PROVIDER=stripe."
    );
  }

  if (!cachedClient) {
    cachedClient = new Stripe(config.secretKey);
  }

  return cachedClient;
}

/** Test/worker helper: drops the cached client so a new config can be picked up. */
export function resetStripeClientForTests(): void {
  cachedClient = null;
}
