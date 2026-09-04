import type {
  StripeSubscriptionSnapshot,
  VipBillingEventRow,
  VipBillingMailer,
  VipBillingNotificationRow,
  VipBillingProviderGateway,
  VipBillingWebhookRepository,
  VipSubscriptionRow,
} from "./types";
import {
  extractVipBillingMetadata,
  mapStripeSubscriptionStatusToLocal,
  VIP_BILLING_ERROR_CODES,
  type VipBillingNotificationType,
} from "./webhook-events";

// Verified-event billing lifecycle processor. Trust comes exclusively from the
// webhook signature verification performed upstream; this module correlates
// every event against exact local identifiers and fails closed on mismatch.

export type VipBillingProcessingOutcome = {
  status: "processed" | "ignored" | "failed";
  retryable: boolean;
};

type VipBillingProcessorDeps = {
  repo: VipBillingWebhookRepository;
  provider: Pick<VipBillingProviderGateway, "retrieveSubscription">;
  mailer: VipBillingMailer;
  now?: () => Date;
};

type VipBillingEventInput = {
  id: string;
  type: string;
  data: { object: unknown };
};

export const SUPPORTED_VIP_BILLING_EVENT_TYPES = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

function extractSubscriptionId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return null;
}

/**
 * Normalize a provider subscription snapshot (an event payload object or an
 * SDK object) into the trusted snapshot shape. Period fields live on
 * subscription items in the current Stripe API, not on the subscription.
 */
export function normalizeProviderSubscription(
  object: unknown
): StripeSubscriptionSnapshot | null {
  if (!object || typeof object !== "object") {
    return null;
  }
  const record = object as Record<string, unknown>;
  const id = extractSubscriptionId(record.id);
  if (!id || typeof record.status !== "string") {
    return null;
  }

  const items = record.items as
    | { data?: (Record<string, unknown> | undefined)[] }
    | undefined;
  const firstItem = items?.data?.[0];
  const price = firstItem?.price as { id?: string } | undefined;

  return {
    id,
    status: record.status as string,
    customer: extractSubscriptionId(record.customer) ?? "",
    cancelAtPeriodEnd: record.cancel_at_period_end === true,
    canceledAt:
      typeof record.canceled_at === "number"
        ? (record.canceled_at as number)
        : null,
    currentPeriodStart:
      typeof firstItem?.current_period_start === "number"
        ? (firstItem.current_period_start as number)
        : null,
    currentPeriodEnd:
      typeof firstItem?.current_period_end === "number"
        ? (firstItem.current_period_end as number)
        : null,
    priceId: price?.id ?? null,
    metadata:
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, string | null | undefined>)
        : {},
  };
}

export async function processVerifiedVipBillingEvent(
  event: VipBillingEventInput,
  deps: VipBillingProcessorDeps
): Promise<VipBillingProcessingOutcome> {
  const now = deps.now ?? (() => new Date());

  const claim = await deps.repo.claimVipBillingEvent({
    provider: "stripe",
    providerEventId: event.id,
    eventType: event.type,
    now: now(),
  });
  if (!claim) {
    return { status: "failed", retryable: true };
  }
  const { event: billingEvent, owned } = claim;

  if (
    !owned &&
    (billingEvent.processingStatus === "processed" ||
      billingEvent.processingStatus === "ignored")
  ) {
    // Duplicate delivery: never reapply billing mutations; only retry any
    // notification that has not been sent yet.
    await deliverPendingNotificationsForEvent(billingEvent.id, deps, now);
    return {
      status:
        billingEvent.processingStatus === "processed" ? "processed" : "ignored",
      retryable: false,
    };
  }

  if (!owned) {
    // A fresh processing lease belongs to another worker. Returning a
    // retryable failure lets the provider redeliver after the bounded lease;
    // this worker must not touch the subscription or event terminal state.
    return { status: "failed", retryable: true };
  }
  const processingToken = billingEvent.processingToken;
  if (!processingToken) {
    return { status: "failed", retryable: true };
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        return await handleCheckoutCompleted(
          billingEvent,
          processingToken,
          event.data.object,
          deps,
          now
        );
      case "invoice.paid":
        return await handleInvoicePaid(
          billingEvent,
          processingToken,
          event.data.object,
          deps,
          now
        );
      case "invoice.payment_failed":
        return await handleInvoicePaymentFailed(
          billingEvent,
          processingToken,
          event.data.object,
          deps,
          now
        );
      case "customer.subscription.updated":
        return await handleSubscriptionUpdated(
          billingEvent,
          processingToken,
          event.data.object,
          deps,
          now
        );
      case "customer.subscription.deleted":
        return await handleSubscriptionDeleted(
          billingEvent,
          processingToken,
          event.data.object,
          deps,
          now
        );
      default:
        return await ignoreEvent(billingEvent, deps, now);
    }
  } catch (error) {
    console.error("VIP billing event processing failed:", error);
    try {
      await deps.repo.markVipBillingEventFailed(
        billingEvent.id,
        VIP_BILLING_ERROR_CODES.processingError,
        processingToken,
        now()
      );
    } catch {
      // Database unavailable; Stripe retry will reprocess the event.
    }
    return { status: "failed", retryable: true };
  }
}

async function failEvent(
  billingEvent: VipBillingEventRow,
  code: string,
  deps: VipBillingProcessorDeps,
  now: () => Date
): Promise<VipBillingProcessingOutcome> {
  const processingToken = billingEvent.processingToken;
  if (!processingToken) {
    return { status: "failed", retryable: true };
  }
  const marked = await deps.repo.markVipBillingEventFailed(
    billingEvent.id,
    code,
    processingToken,
    now()
  );
  return { status: "failed", retryable: !marked };
}

async function ignoreEvent(
  billingEvent: VipBillingEventRow,
  deps: VipBillingProcessorDeps,
  now: () => Date
): Promise<VipBillingProcessingOutcome> {
  const processingToken = billingEvent.processingToken;
  if (!processingToken) {
    return { status: "failed", retryable: true };
  }
  const marked = await deps.repo.markVipBillingEventIgnored(
    billingEvent.id,
    processingToken,
    now()
  );
  return marked
    ? { status: "ignored", retryable: false }
    : { status: "failed", retryable: true };
}

async function deliverNotification(
  notification: VipBillingNotificationRow | null,
  subscription: VipSubscriptionRow,
  deps: VipBillingProcessorDeps,
  now: () => Date
): Promise<void> {
  // The provider send happens after the durable claim. A crash after the
  // provider accepts the message but before the sent update leaves a stale
  // lease and can cause an at-least-once duplicate on retry.
  if (!notification || notification.deliveryStatus === "sent") {
    return;
  }

  const claimed = await deps.repo.claimVipBillingNotification(
    notification.id,
    now()
  );
  if (!claimed) {
    return;
  }

  const email = await deps.repo.getUserEmailById(claimed.userId);
  if (!email) {
    await deps.repo.markVipBillingNotificationFailed(
      claimed.id,
      VIP_BILLING_ERROR_CODES.missingEmail,
      claimed.deliveryToken ?? "",
      now()
    );
    return;
  }

  try {
    await deps.mailer.send({
      to: email,
      notificationType: claimed.notificationType as VipBillingNotificationType,
      amountMinor: subscription.amountMinor,
      currency: subscription.currency,
      periodEnd: subscription.currentPeriodEnd,
    });
    await deps.repo.markVipBillingNotificationSent(
      claimed.id,
      claimed.deliveryToken ?? "",
      now()
    );
  } catch (error) {
    // Bounded error code only; never persist raw provider/SES messages.
    console.error("VIP billing notification delivery failed:", error);
    await deps.repo.markVipBillingNotificationFailed(
      claimed.id,
      VIP_BILLING_ERROR_CODES.deliveryFailed,
      claimed.deliveryToken ?? "",
      now()
    );
  }
}

async function deliverPendingNotificationsForEvent(
  billingEventId: string,
  deps: VipBillingProcessorDeps,
  now: () => Date
): Promise<void> {
  const notifications =
    await deps.repo.listVipBillingNotificationsForEvent(billingEventId);
  for (const notification of notifications) {
    if (notification.deliveryStatus === "sent") {
      continue;
    }
    const subscription = await deps.repo.getLiveVipSubscriptionForUser(
      notification.userId
    );
    if (!subscription) {
      const claimed = await deps.repo.claimVipBillingNotification(
        notification.id,
        now()
      );
      if (!claimed) {
        continue;
      }
      await deps.repo.markVipBillingNotificationFailed(
        claimed.id,
        VIP_BILLING_ERROR_CODES.unknownSubscription,
        claimed.deliveryToken ?? "",
        now()
      );
      continue;
    }
    await deliverNotification(notification, subscription, deps, now);
  }
}

type CheckoutSessionObject = {
  id: string;
  mode?: string;
  subscription?: unknown;
  metadata?: Record<string, string | null | undefined> | null;
};

type InvoiceObject = {
  id: string;
  currency?: string;
  parent?: {
    type?: string;
    subscription_details?: {
      subscription?: unknown;
      metadata?: Record<string, string | null | undefined> | null;
    } | null;
  } | null;
};

function resolveInvoiceSubscriptionId(invoice: InvoiceObject): string | null {
  const details = invoice.parent?.subscription_details;
  if (invoice.parent?.type && invoice.parent.type !== "subscription_details") {
    return null;
  }
  return extractSubscriptionId(details?.subscription);
}

async function handleCheckoutCompleted(
  billingEvent: VipBillingEventRow,
  processingToken: string,
  object: unknown,
  deps: VipBillingProcessorDeps,
  now: () => Date
): Promise<VipBillingProcessingOutcome> {
  const session = object as CheckoutSessionObject;
  if (session.mode !== "subscription") {
    return await ignoreEvent(billingEvent, deps, now);
  }

  const correlation = extractVipBillingMetadata(session.metadata ?? undefined);
  if (!correlation) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.correlationMismatch,
      deps,
      now
    );
  }

  const local = await deps.repo.getVipSubscriptionById(
    correlation.vipSubscriptionId
  );
  if (!local) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.unknownSubscription,
      deps,
      now
    );
  }
  if (local.userId !== correlation.vipUserId) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.userMismatch,
      deps,
      now
    );
  }
  if (local.planPriceId !== correlation.vipPlanPriceId) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.metadataMismatch,
      deps,
      now
    );
  }

  const providerSubscriptionId = extractSubscriptionId(session.subscription);
  if (!providerSubscriptionId) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.missingProviderSubscription,
      deps,
      now
    );
  }

  // Trusted provider fetch happens before the mutation transaction.
  const snapshot = await deps.provider.retrieveSubscription(
    providerSubscriptionId
  );
  const snapshotCorrelation = extractVipBillingMetadata(snapshot.metadata);
  if (
    !snapshotCorrelation ||
    snapshotCorrelation.vipSubscriptionId !== local.id ||
    snapshotCorrelation.vipUserId !== local.userId ||
    snapshotCorrelation.vipPlanPriceId !== local.planPriceId ||
    snapshot.id !== providerSubscriptionId
  ) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.metadataMismatch,
      deps,
      now
    );
  }
  if (
    local.providerCustomerId &&
    snapshot.customer !== local.providerCustomerId
  ) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.customerMismatch,
      deps,
      now
    );
  }
  const status = mapStripeSubscriptionStatusToLocal(snapshot.status);
  if (!status) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.unsupportedProviderStatus,
      deps,
      now
    );
  }

  // Binding only: checkout completion MUST NOT grant VIP entitlement.
  const updated = await deps.repo.applyVipCheckoutBinding({
    billingEventId: billingEvent.id,
    processingToken,
    subscriptionId: local.id,
    providerCheckoutSessionId: session.id,
    providerCustomerId: snapshot.customer,
    providerSubscriptionId: snapshot.id,
    providerPriceId: snapshot.priceId,
    status,
    now: now(),
  });
  if (!updated) {
    return { status: "failed", retryable: false };
  }
  return { status: "processed", retryable: false };
}

async function handleInvoicePaid(
  billingEvent: VipBillingEventRow,
  processingToken: string,
  object: unknown,
  deps: VipBillingProcessorDeps,
  now: () => Date
): Promise<VipBillingProcessingOutcome> {
  const invoice = object as InvoiceObject;
  const providerSubscriptionId = resolveInvoiceSubscriptionId(invoice);
  if (!providerSubscriptionId) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.notSubscriptionInvoice,
      deps,
      now
    );
  }

  const invoiceCorrelation = extractVipBillingMetadata(
    invoice.parent?.subscription_details?.metadata ?? undefined
  );
  const local = invoiceCorrelation
    ? await deps.repo.getVipSubscriptionById(
        invoiceCorrelation.vipSubscriptionId
      )
    : await deps.repo.getVipSubscriptionByProviderSubscriptionId({
        provider: "stripe",
        providerSubscriptionId,
      });
  if (!local) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.unknownSubscription,
      deps,
      now
    );
  }
  if (local.status === "cancelled") {
    return await ignoreEvent(billingEvent, deps, now);
  }

  if (
    !invoiceCorrelation ||
    invoiceCorrelation.vipSubscriptionId !== local.id ||
    invoiceCorrelation.vipUserId !== local.userId ||
    invoiceCorrelation.vipPlanPriceId !== local.planPriceId ||
    (local.providerSubscriptionId !== null &&
      local.providerSubscriptionId !== providerSubscriptionId)
  ) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.metadataMismatch,
      deps,
      now
    );
  }
  if (
    invoice.currency &&
    local.currency &&
    invoice.currency.toLowerCase() !== local.currency.toLowerCase()
  ) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.priceMismatch,
      deps,
      now
    );
  }

  const snapshot = await deps.provider.retrieveSubscription(
    providerSubscriptionId
  );
  const snapshotCorrelation = extractVipBillingMetadata(snapshot.metadata);
  if (
    !snapshotCorrelation ||
    snapshotCorrelation.vipSubscriptionId !== local.id ||
    snapshotCorrelation.vipUserId !== local.userId ||
    snapshotCorrelation.vipPlanPriceId !== local.planPriceId
  ) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.metadataMismatch,
      deps,
      now
    );
  }
  if (
    local.providerCustomerId &&
    snapshot.customer !== local.providerCustomerId
  ) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.customerMismatch,
      deps,
      now
    );
  }
  if (snapshot.status !== "active") {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.subscriptionNotActive,
      deps,
      now
    );
  }
  if (!snapshot.currentPeriodStart || !snapshot.currentPeriodEnd) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.missingPeriod,
      deps,
      now
    );
  }
  if (
    local.providerPriceId &&
    snapshot.priceId &&
    snapshot.priceId !== local.providerPriceId
  ) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.priceMismatch,
      deps,
      now
    );
  }

  const status = mapStripeSubscriptionStatusToLocal(snapshot.status);
  if (!status) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.unsupportedProviderStatus,
      deps,
      now
    );
  }

  const result = await deps.repo.applyVipInvoicePaid({
    billingEventId: billingEvent.id,
    processingToken,
    subscriptionId: local.id,
    providerSubscriptionId,
    invoiceId: invoice.id,
    status,
    currentPeriodStart: new Date(snapshot.currentPeriodStart * 1000),
    currentPeriodEnd: new Date(snapshot.currentPeriodEnd * 1000),
    providerCustomerId: snapshot.customer,
    providerPriceId: snapshot.priceId,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    now: now(),
  });

  if (result.duplicate) {
    return { status: "ignored", retryable: false };
  }
  if (!result.subscription) {
    return { status: "failed", retryable: false };
  }

  await deliverNotification(
    result.notification,
    result.subscription,
    deps,
    now
  );
  return { status: "processed", retryable: false };
}

async function handleInvoicePaymentFailed(
  billingEvent: VipBillingEventRow,
  processingToken: string,
  object: unknown,
  deps: VipBillingProcessorDeps,
  now: () => Date
): Promise<VipBillingProcessingOutcome> {
  const invoice = object as InvoiceObject;
  const providerSubscriptionId = resolveInvoiceSubscriptionId(invoice);
  if (!providerSubscriptionId) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.notSubscriptionInvoice,
      deps,
      now
    );
  }

  const invoiceCorrelation = extractVipBillingMetadata(
    invoice.parent?.subscription_details?.metadata ?? undefined
  );
  const local = invoiceCorrelation
    ? await deps.repo.getVipSubscriptionById(
        invoiceCorrelation.vipSubscriptionId
      )
    : await deps.repo.getVipSubscriptionByProviderSubscriptionId({
        provider: "stripe",
        providerSubscriptionId,
      });
  if (!local) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.unknownSubscription,
      deps,
      now
    );
  }

  if (
    !invoiceCorrelation ||
    invoiceCorrelation.vipSubscriptionId !== local.id ||
    invoiceCorrelation.vipUserId !== local.userId ||
    invoiceCorrelation.vipPlanPriceId !== local.planPriceId ||
    (local.providerSubscriptionId !== null &&
      local.providerSubscriptionId !== providerSubscriptionId)
  ) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.metadataMismatch,
      deps,
      now
    );
  }

  const snapshot = await deps.provider.retrieveSubscription(
    providerSubscriptionId
  );
  if (
    local.providerCustomerId &&
    snapshot.customer !== local.providerCustomerId
  ) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.customerMismatch,
      deps,
      now
    );
  }
  const status = mapStripeSubscriptionStatusToLocal(snapshot.status);
  if (!status || status === "active" || status === "cancelled") {
    // A failed invoice must not be used to mark an active/closed subscription.
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.subscriptionNotActive,
      deps,
      now
    );
  }

  const result = await deps.repo.applyVipPaymentFailed({
    billingEventId: billingEvent.id,
    processingToken,
    subscriptionId: local.id,
    providerSubscriptionId,
    status,
    providerCustomerId: snapshot.customer,
    currentPeriodStart: snapshot.currentPeriodStart
      ? new Date(snapshot.currentPeriodStart * 1000)
      : null,
    currentPeriodEnd: snapshot.currentPeriodEnd
      ? new Date(snapshot.currentPeriodEnd * 1000)
      : null,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    now: now(),
  });

  if (!result.subscription) {
    return { status: "failed", retryable: false };
  }

  await deliverNotification(
    result.notification,
    result.subscription,
    deps,
    now
  );
  return { status: "processed", retryable: false };
}

async function handleSubscriptionUpdated(
  billingEvent: VipBillingEventRow,
  processingToken: string,
  object: unknown,
  deps: VipBillingProcessorDeps,
  now: () => Date
): Promise<VipBillingProcessingOutcome> {
  const snapshot = normalizeProviderSubscription(object);
  if (!snapshot) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.correlationMismatch,
      deps,
      now
    );
  }

  const correlation = extractVipBillingMetadata(snapshot.metadata);
  const local = correlation
    ? await deps.repo.getVipSubscriptionById(correlation.vipSubscriptionId)
    : await deps.repo.getVipSubscriptionByProviderSubscriptionId({
        provider: "stripe",
        providerSubscriptionId: snapshot.id,
      });
  if (!local) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.unknownSubscription,
      deps,
      now
    );
  }

  if (
    !correlation ||
    correlation.vipSubscriptionId !== local.id ||
    correlation.vipUserId !== local.userId ||
    correlation.vipPlanPriceId !== local.planPriceId
  ) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.metadataMismatch,
      deps,
      now
    );
  }
  if (
    local.providerCustomerId &&
    snapshot.customer !== local.providerCustomerId
  ) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.customerMismatch,
      deps,
      now
    );
  }

  const status = mapStripeSubscriptionStatusToLocal(snapshot.status);
  if (!status) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.unsupportedProviderStatus,
      deps,
      now
    );
  }

  // Synchronization only: a subscription update alone can never activate a
  // never-paid account.
  const result = await deps.repo.applyVipSubscriptionStatusUpdate({
    billingEventId: billingEvent.id,
    processingToken,
    subscriptionId: local.id,
    providerSubscriptionId: snapshot.id,
    providerCustomerId: snapshot.customer,
    providerPriceId: snapshot.priceId,
    status,
    currentPeriodStart: snapshot.currentPeriodStart
      ? new Date(snapshot.currentPeriodStart * 1000)
      : null,
    currentPeriodEnd: snapshot.currentPeriodEnd
      ? new Date(snapshot.currentPeriodEnd * 1000)
      : null,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    canceledAt: snapshot.canceledAt
      ? new Date(snapshot.canceledAt * 1000)
      : null,
    now: now(),
  });

  if (!result.subscription) {
    return { status: "failed", retryable: false };
  }

  await deliverNotification(
    result.cancellationNotification,
    result.subscription,
    deps,
    now
  );
  return { status: "processed", retryable: false };
}

async function handleSubscriptionDeleted(
  billingEvent: VipBillingEventRow,
  processingToken: string,
  object: unknown,
  deps: VipBillingProcessorDeps,
  now: () => Date
): Promise<VipBillingProcessingOutcome> {
  const snapshot = normalizeProviderSubscription(object);
  if (!snapshot) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.correlationMismatch,
      deps,
      now
    );
  }

  const correlation = extractVipBillingMetadata(snapshot.metadata);
  const local = correlation
    ? await deps.repo.getVipSubscriptionById(correlation.vipSubscriptionId)
    : await deps.repo.getVipSubscriptionByProviderSubscriptionId({
        provider: "stripe",
        providerSubscriptionId: snapshot.id,
      });
  if (!local) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.unknownSubscription,
      deps,
      now
    );
  }

  if (
    !correlation ||
    correlation.vipSubscriptionId !== local.id ||
    correlation.vipUserId !== local.userId ||
    correlation.vipPlanPriceId !== local.planPriceId
  ) {
    return await failEvent(
      billingEvent,
      VIP_BILLING_ERROR_CODES.metadataMismatch,
      deps,
      now
    );
  }

  const updated = await deps.repo.applyVipSubscriptionDeleted({
    billingEventId: billingEvent.id,
    processingToken,
    subscriptionId: local.id,
    canceledAt: snapshot.canceledAt
      ? new Date(snapshot.canceledAt * 1000)
      : null,
    now: now(),
  });
  if (!updated) {
    return { status: "failed", retryable: false };
  }
  return { status: "processed", retryable: false };
}
