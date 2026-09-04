import type { VipProvisioningResult } from "./provisioning";
import type {
  StripeSubscriptionSnapshot,
  VipBillingProviderGateway,
  VipPlanPriceRow,
  VipSubscriptionRow,
} from "./types";
import {
  buildVipBillingMetadata,
  extractVipBillingMetadata,
  mapStripeSubscriptionStatusToLocal,
} from "./webhook-events";

// Injectable customer billing handlers. Request bodies are never trusted: the
// authenticated customer, active price, Stripe Price, and all provider
// identifiers are server-owned.

export type VipCheckoutCustomerContext = {
  userId: string;
  role: "user" | "lawyer" | "admin";
};

export type VipCheckoutAuthenticator = () => Promise<
  VipCheckoutCustomerContext | Response
>;

export type VipCheckoutRepo = {
  getActiveVipPlanPrice(): Promise<VipPlanPriceRow | null>;
  ensurePlanPriceProvisioned(
    planPriceId: string
  ): Promise<VipProvisioningResult>;
  getLiveVipSubscriptionForUser(
    userId: string
  ): Promise<VipSubscriptionRow | null>;
  createPendingVipSubscription(input: {
    userId: string;
    planPriceId: string;
    provider: string;
    amountMinor: number;
    currency: string;
  }): Promise<VipSubscriptionRow>;
  rebindPendingVipSubscriptionToPrice(input: {
    subscriptionId: string;
    planPriceId: string;
    amountMinor: number;
  }): Promise<VipSubscriptionRow | null>;
  markVipSubscriptionCheckoutSession(input: {
    subscriptionId: string;
    providerCheckoutSessionId: string;
  }): Promise<void>;
};

export type VipCheckoutDeps = {
  requireCustomer: VipCheckoutAuthenticator;
  repo: VipCheckoutRepo;
  gateway: Pick<VipBillingProviderGateway, "createCheckoutSession">;
  getBaseUrl: () => string;
};

function unavailable() {
  return Response.json(
    { error: "VIP membership checkout is unavailable right now." },
    { status: 503 }
  );
}

export async function handleVipSubscriptionCheckout(
  deps: VipCheckoutDeps
): Promise<Response> {
  const customer = await deps.requireCustomer();
  if (customer instanceof Response) {
    return customer;
  }

  // Administrators have a Premium override; staff roles are not purchasers.
  if (customer.role !== "user") {
    return Response.json(
      { error: "VIP subscriptions are only available for customer accounts." },
      { status: 403 }
    );
  }

  const price = await deps.repo.getActiveVipPlanPrice();
  if (!price) {
    return unavailable();
  }

  const provisioned = await deps.repo.ensurePlanPriceProvisioned(price.id);
  if (provisioned.status !== "ready") {
    // Fail closed until a real provider Price exists. Safe retry is possible.
    return unavailable();
  }

  const existing = await deps.repo.getLiveVipSubscriptionForUser(
    customer.userId
  );
  let subscription = existing;

  if (subscription) {
    if (subscription.providerSubscriptionId) {
      return Response.json(
        { error: "You already have a VIP subscription in progress." },
        { status: 409 }
      );
    }
    if (
      subscription.status !== "pending" &&
      subscription.status !== "incomplete"
    ) {
      return Response.json(
        { error: "You already have a VIP subscription in progress." },
        { status: 409 }
      );
    }
    // Narrow checkout retry: a never-paid pending checkout may safely follow
    // the current active price.
    if (subscription.planPriceId !== price.id) {
      const rebound = await deps.repo.rebindPendingVipSubscriptionToPrice({
        subscriptionId: subscription.id,
        planPriceId: price.id,
        amountMinor: price.amountMinor,
      });
      if (!rebound) {
        return Response.json(
          { error: "You already have a VIP subscription in progress." },
          { status: 409 }
        );
      }
      subscription = rebound;
    }
  } else {
    subscription = await deps.repo.createPendingVipSubscription({
      userId: customer.userId,
      planPriceId: price.id,
      provider: "stripe",
      amountMinor: price.amountMinor,
      currency: price.currency,
    });
  }

  const correlation = buildVipBillingMetadata({
    subscriptionId: subscription.id,
    userId: customer.userId,
    planPriceId: price.id,
  });
  const baseUrl = deps.getBaseUrl();

  const session = await deps.gateway.createCheckoutSession({
    priceId: provisioned.providerPriceId,
    clientReferenceId: subscription.id,
    metadata: correlation,
    subscriptionMetadata: correlation,
    successUrl: `${baseUrl}/vip?checkout=success`,
    cancelUrl: `${baseUrl}/vip?checkout=cancelled`,
    idempotencyKey: `immigration-ai-vip-checkout:${subscription.id}:${price.id}`,
  });

  await deps.repo.markVipSubscriptionCheckoutSession({
    subscriptionId: subscription.id,
    providerCheckoutSessionId: session.id,
  });

  if (!session.url) {
    return unavailable();
  }

  // Only the safe hosted-checkout URL is returned. This is NOT payment
  // evidence; activation happens exclusively through the verified webhook.
  return Response.json({ url: session.url });
}

export type VipCustomerBillingRepo = {
  getLiveVipSubscriptionForUser(
    userId: string
  ): Promise<VipSubscriptionRow | null>;
  synchronizeVipSubscriptionAfterCancelRequest(input: {
    subscriptionId: string;
    status: VipSubscriptionRow["status"];
    cancelAtPeriodEnd: boolean;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    canceledAt: Date | null;
  }): Promise<VipSubscriptionRow | null>;
};

export type VipCustomerBillingDeps = {
  requireCustomer: VipCheckoutAuthenticator;
  repo: VipCustomerBillingRepo;
  gateway: Pick<
    VipBillingProviderGateway,
    "requestCancelAtPeriodEnd" | "createPortalSession"
  >;
  getBaseUrl: () => string;
};

function safeSubscriptionView(subscription: VipSubscriptionRow) {
  return {
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
}

/**
 * Customer-authenticated cancel-at-period-end. The browser supplies no
 * provider identifiers; the server locates the customer's own subscription.
 * Idempotent: an already-scheduled cancellation returns current safe state.
 */
export async function handleVipSubscriptionCancellation(
  deps: VipCustomerBillingDeps
): Promise<Response> {
  const customer = await deps.requireCustomer();
  if (customer instanceof Response) {
    return customer;
  }

  const subscription = await deps.repo.getLiveVipSubscriptionForUser(
    customer.userId
  );
  if (!subscription?.providerSubscriptionId) {
    return Response.json(
      { error: "No active VIP subscription found." },
      { status: 404 }
    );
  }

  // Already scheduled (or terminal): idempotent no-op, no provider call.
  if (subscription.cancelAtPeriodEnd || subscription.status === "cancelled") {
    return Response.json({
      subscription: safeSubscriptionView(subscription),
      idempotent: true,
    });
  }

  const snapshot: StripeSubscriptionSnapshot =
    await deps.gateway.requestCancelAtPeriodEnd(
      subscription.providerSubscriptionId
    );

  // Fail closed on any correlation mismatch; the webhook remains
  // authoritative for durable state.
  const correlation = extractVipBillingMetadata(snapshot.metadata);
  if (!correlation || correlation.vipSubscriptionId !== subscription.id) {
    return Response.json(
      { error: "Unable to update your subscription right now." },
      { status: 503 }
    );
  }
  const status = mapStripeSubscriptionStatusToLocal(snapshot.status);
  if (!status) {
    return Response.json(
      { error: "Unable to update your subscription right now." },
      { status: 503 }
    );
  }

  const updated = await deps.repo.synchronizeVipSubscriptionAfterCancelRequest({
    subscriptionId: subscription.id,
    status,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    currentPeriodStart: snapshot.currentPeriodStart
      ? new Date(snapshot.currentPeriodStart * 1000)
      : null,
    currentPeriodEnd: snapshot.currentPeriodEnd
      ? new Date(snapshot.currentPeriodEnd * 1000)
      : null,
    canceledAt: snapshot.canceledAt
      ? new Date(snapshot.canceledAt * 1000)
      : null,
  });

  return Response.json({
    subscription: safeSubscriptionView(updated ?? subscription),
    idempotent: false,
  });
}

/**
 * Customer billing portal session. The provider customer id comes only from
 * the local DB record owned by the authenticated customer.
 */
export async function handleVipPortalSession(
  deps: Omit<VipCustomerBillingDeps, "repo"> & {
    repo: Pick<VipCustomerBillingRepo, "getLiveVipSubscriptionForUser">;
  }
): Promise<Response> {
  const customer = await deps.requireCustomer();
  if (customer instanceof Response) {
    return customer;
  }

  const subscription = await deps.repo.getLiveVipSubscriptionForUser(
    customer.userId
  );
  if (!subscription?.providerCustomerId) {
    return Response.json(
      { error: "No VIP billing profile found." },
      { status: 404 }
    );
  }

  const session = await deps.gateway.createPortalSession({
    customerId: subscription.providerCustomerId,
    returnUrl: `${deps.getBaseUrl()}/vip`,
  });
  return Response.json({ url: session.url });
}
