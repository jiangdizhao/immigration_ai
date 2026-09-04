import "server-only";

import type Stripe from "stripe";

import { getVipBillingProviderConfig } from "./config";
import { getStripeClient } from "./stripe-client";
import type {
  StripeSubscriptionSnapshot,
  VipBillingProviderGateway,
} from "./types";

// Adapts the installed official Stripe Node SDK to the injectable billing
// gateway interface. Server-only: the secret key never leaves this module.

export function toSubscriptionSnapshot(
  subscription: Stripe.Subscription
): StripeSubscriptionSnapshot {
  const item = subscription.items.data[0];
  const customer =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  return {
    id: subscription.id,
    status: subscription.status,
    customer,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at ?? null,
    currentPeriodStart: item?.current_period_start ?? null,
    currentPeriodEnd: item?.current_period_end ?? null,
    priceId: item?.price?.id ?? null,
    metadata: subscription.metadata ?? {},
  };
}

export function createStripeBillingGateway(): VipBillingProviderGateway {
  const config = getVipBillingProviderConfig();
  if (config.provider !== "stripe") {
    throw new Error(
      "The Stripe billing gateway requires VIP_BILLING_PROVIDER=stripe."
    );
  }

  const client = getStripeClient();

  return {
    async createProduct({ name, idempotencyKey }) {
      const product = await client.products.create(
        { name },
        { idempotencyKey }
      );
      return { id: product.id };
    },
    async createPrice({ product, currency, unitAmount, idempotencyKey }) {
      const price = await client.prices.create(
        {
          product,
          currency,
          unit_amount: unitAmount,
          recurring: { interval: "month" },
        },
        { idempotencyKey }
      );
      return { id: price.id };
    },
    async createCheckoutSession({
      priceId,
      clientReferenceId,
      metadata,
      subscriptionMetadata,
      successUrl,
      cancelUrl,
      idempotencyKey,
    }) {
      const session = await client.checkout.sessions.create(
        {
          mode: "subscription",
          line_items: [{ price: priceId, quantity: 1 }],
          client_reference_id: clientReferenceId,
          metadata,
          subscription_data: { metadata: subscriptionMetadata },
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
        { idempotencyKey }
      );
      return { id: session.id, url: session.url };
    },
    async retrieveSubscription(subscriptionId) {
      return toSubscriptionSnapshot(
        await client.subscriptions.retrieve(subscriptionId)
      );
    },
    async requestCancelAtPeriodEnd(subscriptionId) {
      return toSubscriptionSnapshot(
        await client.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        })
      );
    },
    async createPortalSession({ customerId, returnUrl }) {
      const session = await client.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return { url: session.url };
    },
  };
}
