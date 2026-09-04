// Pure helpers for Phase 9 M2 Stripe billing webhook processing. No I/O.

export type VipSubscriptionLocalStatus =
  | "pending"
  | "incomplete"
  | "active"
  | "past_due"
  | "unpaid"
  | "paused"
  | "cancelled";

export type VipBillingNotificationType =
  | "vip_activated"
  | "vip_renewal_paid"
  | "vip_payment_failed"
  | "vip_cancellation_scheduled";

/**
 * Map a provider (Stripe) subscription status to the local subscription
 * status. Unknown/provider-only statuses (e.g. trialing, which this product
 * does not offer) map to null so callers fail closed.
 */
export function mapStripeSubscriptionStatusToLocal(
  status: string
): VipSubscriptionLocalStatus | null {
  switch (status) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "paused":
      return "paused";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    case "incomplete":
      return "incomplete";
    default:
      return null;
  }
}

export function isTerminalSubscriptionStatus(status: string): boolean {
  return status === "cancelled";
}

export type VipBillingCorrelationMetadata = {
  vipSubscriptionId: string;
  vipUserId: string;
  vipPlanPriceId: string;
};

/**
 * Extract the exact correlation metadata this application attaches to Stripe
 * objects. Returns null unless all three identifiers are present so callers
 * fail closed instead of fuzzy matching.
 */
export function extractVipBillingMetadata(
  metadata: Record<string, string | null | undefined> | null | undefined
): VipBillingCorrelationMetadata | null {
  const vipSubscriptionId = metadata?.vipSubscriptionId;
  const vipUserId = metadata?.vipUserId;
  const vipPlanPriceId = metadata?.vipPlanPriceId;

  if (
    typeof vipSubscriptionId !== "string" ||
    vipSubscriptionId.length === 0 ||
    typeof vipUserId !== "string" ||
    vipUserId.length === 0 ||
    typeof vipPlanPriceId !== "string" ||
    vipPlanPriceId.length === 0
  ) {
    return null;
  }

  return { vipSubscriptionId, vipUserId, vipPlanPriceId };
}

/**
 * Decide the notification type for a successfully paid invoice based on the
 * local subscription's prior paid state. A subscription that has never had a
 * paid invoice is an activation; anything later is a renewal.
 */
export function decidePaidNotificationType(input: {
  lastPaidInvoiceId: string | null;
  lastPaidAt: Date | null;
}): VipBillingNotificationType {
  return input.lastPaidInvoiceId || input.lastPaidAt
    ? "vip_renewal_paid"
    : "vip_activated";
}

/**
 * Bounded server-owned error codes for billing event processing. Raw provider
 * or exception messages must never be persisted.
 */
export const VIP_BILLING_ERROR_CODES = {
  correlationMismatch: "correlation_mismatch",
  unknownSubscription: "unknown_subscription",
  customerMismatch: "customer_mismatch",
  priceMismatch: "price_mismatch",
  userMismatch: "user_mismatch",
  metadataMismatch: "metadata_mismatch",
  missingPeriod: "missing_period",
  subscriptionNotActive: "subscription_not_active",
  notSubscriptionInvoice: "not_subscription_invoice",
  unsupportedProviderStatus: "unsupported_provider_status",
  missingProviderSubscription: "missing_provider_subscription",
  duplicateInvoice: "duplicate_invoice",
  processingError: "processing_error",
  missingEmail: "missing_email",
  deliveryFailed: "delivery_failed",
} as const;

export type VipBillingErrorCode =
  (typeof VIP_BILLING_ERROR_CODES)[keyof typeof VIP_BILLING_ERROR_CODES];

/** Correlation metadata attached to Stripe Checkout sessions/subscriptions. */
export function buildVipBillingMetadata(input: {
  subscriptionId: string;
  userId: string;
  planPriceId: string;
}): Record<string, string> {
  return {
    vipSubscriptionId: input.subscriptionId,
    vipUserId: input.userId,
    vipPlanPriceId: input.planPriceId,
  };
}
