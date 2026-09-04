// biome-ignore lint/style/useFilenamingConvention: The underscore filename is the documented M3 CLI name.
/* biome-ignore-all lint/suspicious/useAwait: In-memory DI fake mirrors async service contracts. */
/*
 * Phase 9 M3 acceptance runner.
 *
 * This is deliberately an acceptance harness, not a second billing runtime.
 * The deterministic and Postgres modes call the M2 services/repository with
 * controlled dependencies. Stripe modes fail closed before client creation
 * unless STRIPE_SECRET_KEY is unmistakably a test-mode secret.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { config } from "dotenv";
import postgres from "postgres";
import Stripe from "stripe";
import {
  isSafeStripeTestSecret,
  m3AcceptanceOverall,
  m3RunMetadata,
  m3StripeObjectId,
  m3SyntheticPlanPriceId,
} from "../lib/vip/billing/m3-safety";
import {
  buildVipBillingMetadata,
  type VipBillingNotificationType,
} from "../lib/vip/billing/webhook-events";

type JsonRecord = Record<string, unknown>;

const runId = randomUUID().replaceAll("-", "");
const startedAt = new Date().toISOString();
const eventPrefix = `m3_${runId}`;
const billingLeaseMs = 5 * 60 * 1000;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function dateFromSeconds(seconds: number): Date {
  return new Date(seconds * 1000);
}

function snapshot(input: {
  subscriptionId: string;
  customerId: string;
  priceId: string;
  metadata: Record<string, string>;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  periodStart?: number;
  periodEnd?: number;
}) {
  return {
    id: input.subscriptionId,
    status: input.status ?? "active",
    customer: input.customerId,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    canceledAt: null,
    currentPeriodStart: input.periodStart ?? 1_700_000_000,
    currentPeriodEnd: input.periodEnd ?? 1_702_592_000,
    priceId: input.priceId,
    metadata: input.metadata,
  };
}

function checkoutEvent(
  id: string,
  metadata: Record<string, string>,
  subscriptionId: string
) {
  return {
    id,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${id}`,
        mode: "subscription",
        subscription: subscriptionId,
        metadata,
      },
    },
  };
}

function invoiceEvent(
  id: string,
  invoiceId: string,
  metadata: Record<string, string>,
  subscriptionId: string,
  type = "invoice.paid"
) {
  return {
    id,
    type,
    data: {
      object: {
        id: invoiceId,
        currency: "aud",
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: subscriptionId, metadata },
        },
      },
    },
  };
}

function subscriptionEvent(
  id: string,
  metadata: Record<string, string>,
  value: ReturnType<typeof snapshot>,
  type = "customer.subscription.updated"
) {
  return {
    id,
    type,
    data: {
      object: {
        ...value,
        metadata,
        cancel_at_period_end: value.cancelAtPeriodEnd,
        canceled_at: value.canceledAt,
        current_period_start: value.currentPeriodStart,
        current_period_end: value.currentPeriodEnd,
        items: {
          data: [
            {
              current_period_start: value.currentPeriodStart,
              current_period_end: value.currentPeriodEnd,
              price: { id: value.priceId },
            },
          ],
        },
      },
    },
  };
}

function newUser(id: string, email: string) {
  return {
    id,
    email,
    role: "user",
    membershipTier: "free",
    vipExpiresAt: null,
  } as JsonRecord;
}

function newSubscription(
  id: string,
  userId: string,
  planPriceId: string,
  amountMinor = 7900
) {
  return {
    id,
    userId,
    planPriceId,
    provider: "stripe",
    providerCustomerId: null,
    providerSubscriptionId: null,
    providerCheckoutSessionId: null,
    providerPriceId: null,
    amountMinor,
    currency: "AUD",
    status: "pending",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    endedAt: null,
    lastPaidInvoiceId: null,
    lastPaidAt: null,
  } as JsonRecord;
}

class MemoryBillingStore {
  readonly users = new Map<string, JsonRecord>();
  readonly subscriptions = new Map<string, JsonRecord>();
  readonly events = new Map<string, JsonRecord>();
  readonly notifications = new Map<string, JsonRecord>();
  readonly sent: JsonRecord[] = [];
  reusableProductId = "prod_m3_fake";
  readonly price: JsonRecord = {
    id: m3SyntheticPlanPriceId(runId),
    amountMinor: 7900,
    currency: "AUD",
    billingInterval: "month",
    active: true,
    provider: null,
    providerProductId: null,
    providerPriceId: null,
    providerSyncStatus: "unprovisioned",
  };
  gateway: JsonRecord | null = null;
  private eventSequence = 0;

  addUser(id = `user-${this.users.size + 1}`) {
    const user = newUser(
      id,
      `phase9-m3-${runId}-${this.users.size}@example.invalid`
    );
    this.users.set(id, user);
    return user;
  }

  addSubscription(userId: string, amountMinor = 7900) {
    const sub = newSubscription(
      `sub-local-${this.subscriptions.size + 1}`,
      userId,
      String(this.price.id),
      amountMinor
    );
    this.subscriptions.set(String(sub.id), sub);
    return sub;
  }

  async getActiveVipPlanPrice() {
    return this.price as never;
  }
  async getVipPlanPriceById(id: string) {
    return id === this.price.id ? (this.price as never) : null;
  }
  async findReusableProviderProductId() {
    return this.reusableProductId;
  }
  async markPlanPriceProvisioned(input: JsonRecord) {
    Object.assign(this.price, {
      provider: input.provider,
      providerProductId: input.providerProductId,
      providerPriceId: input.providerPriceId,
      providerSyncStatus: "ready",
    });
  }
  async markPlanPriceProvisioningFailed() {
    this.price.providerSyncStatus = "failed";
  }
  async ensurePlanPriceProvisioned(id: string) {
    const { ensureVipPlanPriceProvisioned } = await import(
      "../lib/vip/billing/provisioning"
    );
    return ensureVipPlanPriceProvisioned({
      planPriceId: id,
      repo: this as never,
      gateway: this.gateway as never,
    });
  }
  async getLiveVipSubscriptionForUser(userId: string) {
    return (
      ([...this.subscriptions.values()].find(
        (sub) => sub.userId === userId && sub.status !== "cancelled"
      ) as never) ?? null
    );
  }
  async getVipSubscriptionById(id: string) {
    return (this.subscriptions.get(id) as never) ?? null;
  }
  async getVipSubscriptionByProviderSubscriptionId(input: JsonRecord) {
    return (
      ([...this.subscriptions.values()].find(
        (sub) =>
          sub.provider === input.provider &&
          sub.providerSubscriptionId === input.providerSubscriptionId
      ) as never) ?? null
    );
  }
  async createPendingVipSubscription(input: JsonRecord) {
    const sub = newSubscription(
      `sub-local-${this.subscriptions.size + 1}`,
      String(input.userId),
      String(input.planPriceId),
      Number(input.amountMinor)
    );
    this.subscriptions.set(String(sub.id), sub);
    return sub as never;
  }
  async rebindPendingVipSubscriptionToPrice(input: JsonRecord) {
    const sub = this.subscriptions.get(String(input.subscriptionId));
    if (!sub || !["pending", "incomplete"].includes(String(sub.status))) {
      return null;
    }
    Object.assign(sub, {
      planPriceId: input.planPriceId,
      amountMinor: input.amountMinor,
    });
    return sub as never;
  }
  async markVipSubscriptionCheckoutSession(input: JsonRecord) {
    const sub = this.subscriptions.get(String(input.subscriptionId));
    if (sub) {
      sub.providerCheckoutSessionId = input.providerCheckoutSessionId;
    }
  }
  async synchronizeVipSubscriptionAfterCancelRequest(input: JsonRecord) {
    const sub = this.subscriptions.get(String(input.subscriptionId));
    if (sub) {
      Object.assign(sub, input, { updatedAt: new Date() });
    }
    return (sub as never) ?? null;
  }

  async claimVipBillingEvent(input: JsonRecord) {
    const key = String(input.providerEventId);
    const existing = this.events.get(key);
    if (!existing) {
      const event = {
        id: `event-local-${++this.eventSequence}`,
        provider: "stripe",
        providerEventId: key,
        eventType: input.eventType,
        processingStatus: "processing",
        processingToken: `token-${key}`,
        attemptCount: 1,
      };
      this.events.set(key, event);
      return { event: event as never, claim: "new" as const, owned: true };
    }
    if (["processed", "ignored"].includes(String(existing.processingStatus))) {
      return {
        event: existing as never,
        claim: "existing" as const,
        owned: false,
      };
    }
    return {
      event: existing as never,
      claim: "existing" as const,
      owned: false,
    };
  }
  async incrementVipBillingEventAttempt() {
    // The M2 processor does not need this optional fake operation.
  }
  private finish(id: string, token: string, status: string) {
    const event = [...this.events.values()].find((item) => item.id === id);
    if (!event || event.processingToken !== token) {
      return false;
    }
    Object.assign(event, { processingStatus: status, processingToken: null });
    return true;
  }
  async markVipBillingEventProcessed(id: string, token: string) {
    return this.finish(id, token, "processed");
  }
  async markVipBillingEventIgnored(id: string, token: string) {
    return this.finish(id, token, "ignored");
  }
  async markVipBillingEventFailed(id: string, _code: string, token: string) {
    return this.finish(id, token, "failed");
  }
  async applyVipCheckoutBinding(input: JsonRecord) {
    const sub = this.subscriptions.get(String(input.subscriptionId));
    if (!sub) {
      return null;
    }
    Object.assign(sub, {
      providerCheckoutSessionId: input.providerCheckoutSessionId,
      providerCustomerId: input.providerCustomerId,
      providerSubscriptionId: input.providerSubscriptionId,
      providerPriceId: input.providerPriceId,
      status: input.status,
    });
    this.finish(
      String(input.billingEventId),
      String(input.processingToken),
      "processed"
    );
    return sub as never;
  }
  async applyVipInvoicePaid(input: JsonRecord) {
    const sub = this.subscriptions.get(String(input.subscriptionId));
    if (!sub) {
      return { subscription: null, notification: null, duplicate: false };
    }
    if (sub.lastPaidInvoiceId === input.invoiceId) {
      this.finish(
        String(input.billingEventId),
        String(input.processingToken),
        "ignored"
      );
      return {
        subscription: sub as never,
        notification: null,
        duplicate: true,
      };
    }
    const first = !sub.lastPaidInvoiceId;
    Object.assign(sub, {
      status: input.status,
      providerSubscriptionId: input.providerSubscriptionId,
      providerCustomerId: input.providerCustomerId,
      providerPriceId: input.providerPriceId,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      lastPaidInvoiceId: input.invoiceId,
      lastPaidAt: new Date(),
    });
    const user = this.users.get(String(sub.userId));
    if (user) {
      Object.assign(user, {
        membershipTier: "vip",
        vipExpiresAt: input.currentPeriodEnd,
      });
    }
    const notification = this.addNotification(
      String(input.billingEventId),
      String(sub.userId),
      first ? "vip_activated" : "vip_renewal_paid"
    );
    this.finish(
      String(input.billingEventId),
      String(input.processingToken),
      "processed"
    );
    return {
      subscription: sub as never,
      notification: notification as never,
      duplicate: false,
    };
  }
  async applyVipPaymentFailed(input: JsonRecord) {
    const sub = this.subscriptions.get(String(input.subscriptionId));
    if (!sub) {
      return { subscription: null, notification: null };
    }
    Object.assign(sub, {
      status: input.status,
      providerSubscriptionId: input.providerSubscriptionId,
      currentPeriodStart: input.currentPeriodStart ?? sub.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd ?? sub.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    });
    const notification = this.addNotification(
      String(input.billingEventId),
      String(sub.userId),
      "vip_payment_failed"
    );
    this.finish(
      String(input.billingEventId),
      String(input.processingToken),
      "processed"
    );
    return { subscription: sub as never, notification: notification as never };
  }
  async applyVipSubscriptionStatusUpdate(input: JsonRecord) {
    const sub = this.subscriptions.get(String(input.subscriptionId));
    if (!sub) {
      return { subscription: null, cancellationNotification: null };
    }
    const shouldNotify =
      !sub.cancelAtPeriodEnd && input.cancelAtPeriodEnd === true;
    Object.assign(sub, {
      status: input.status,
      providerSubscriptionId: input.providerSubscriptionId,
      providerCustomerId: input.providerCustomerId,
      providerPriceId: input.providerPriceId,
      currentPeriodStart: input.currentPeriodStart ?? sub.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd ?? sub.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      cancelledAt: input.canceledAt ?? sub.cancelledAt,
    });
    const notification = shouldNotify
      ? this.addNotification(
          String(input.billingEventId),
          String(sub.userId),
          "vip_cancellation_scheduled"
        )
      : null;
    this.finish(
      String(input.billingEventId),
      String(input.processingToken),
      "processed"
    );
    return {
      subscription: sub as never,
      cancellationNotification: notification as never,
    };
  }
  async applyVipSubscriptionDeleted(input: JsonRecord) {
    const sub = this.subscriptions.get(String(input.subscriptionId));
    if (!sub) {
      return null;
    }
    Object.assign(sub, {
      status: "cancelled",
      cancelAtPeriodEnd: false,
      endedAt: new Date(),
      cancelledAt: input.canceledAt ?? new Date(),
    });
    const user = this.users.get(String(sub.userId));
    if (user) {
      Object.assign(user, { membershipTier: "free", vipExpiresAt: null });
    }
    this.finish(
      String(input.billingEventId),
      String(input.processingToken),
      "processed"
    );
    return sub as never;
  }
  private addNotification(
    eventId: string,
    userId: string,
    type: VipBillingNotificationType
  ) {
    const key = `${eventId}:${type}`;
    const existing = [...this.notifications.values()].find(
      (item) => item.key === key
    );
    if (existing) {
      return existing;
    }
    const notification = {
      id: `notification-${this.notifications.size + 1}`,
      key,
      billingEventId: eventId,
      userId,
      notificationType: type,
      deliveryStatus: "pending",
      deliveryToken: null,
    };
    this.notifications.set(String(notification.id), notification);
    return notification;
  }
  async listVipBillingNotificationsForEvent(id: string) {
    return [...this.notifications.values()].filter(
      (item) => item.billingEventId === id
    ) as never;
  }
  async claimVipBillingNotification(id: string) {
    const item = this.notifications.get(id);
    if (!item || item.deliveryStatus !== "pending") {
      return null;
    }
    Object.assign(item, {
      deliveryStatus: "sending",
      deliveryToken: `delivery-${id}`,
    });
    return item as never;
  }
  async markVipBillingNotificationSent(id: string, token: string) {
    const item = this.notifications.get(id);
    if (
      !item ||
      item.deliveryStatus !== "sending" ||
      item.deliveryToken !== token
    ) {
      return false;
    }
    Object.assign(item, { deliveryStatus: "sent", deliveryToken: null });
    return true;
  }
  async markVipBillingNotificationFailed(
    id: string,
    _code: string,
    token: string
  ) {
    const item = this.notifications.get(id);
    if (
      !item ||
      item.deliveryStatus !== "sending" ||
      item.deliveryToken !== token
    ) {
      return false;
    }
    Object.assign(item, { deliveryStatus: "failed", deliveryToken: null });
    return true;
  }
  async getUserEmailById(id: string) {
    return this.users.get(id)?.email ?? null;
  }
}

class MemoryGateway {
  productCalls = 0;
  priceCalls = 0;
  sessionCalls = 0;
  snapshot: JsonRecord;
  constructor(subscriptionId: string, customerId: string) {
    this.snapshot = snapshot({
      subscriptionId,
      customerId,
      priceId: "price_provider_m3",
      metadata: {},
    });
  }
  async createProduct() {
    this.productCalls += 1;
    return { id: "prod_m3_fake" };
  }
  async createPrice() {
    this.priceCalls += 1;
    return { id: "price_provider_m3" };
  }
  async createCheckoutSession() {
    this.sessionCalls += 1;
    return {
      id: `cs_m3_${this.sessionCalls}`,
      url: "https://checkout.test.invalid/m3",
    };
  }
  async retrieveSubscription() {
    return { ...this.snapshot } as never;
  }
  async requestCancelAtPeriodEnd() {
    this.snapshot.cancelAtPeriodEnd = true;
    return { ...this.snapshot } as never;
  }
  async createPortalSession() {
    return { url: "https://billing.test.invalid/m3" };
  }
}

async function processMemoryEvent(
  event: JsonRecord,
  store: MemoryBillingStore,
  gateway: MemoryGateway,
  now: () => Date
) {
  const { processVerifiedVipBillingEvent } = await import(
    "../lib/vip/billing/webhook-processing"
  );
  return processVerifiedVipBillingEvent(event as never, {
    repo: store as never,
    provider: gateway as never,
    mailer: {
      async send(input: JsonRecord) {
        store.sent.push({ notificationType: input.notificationType });
      },
    },
    now,
  });
}

async function deterministicCampaign() {
  const store = new MemoryBillingStore();
  const user = store.addUser();
  const sub = store.addSubscription(String(user.id));
  const metadata = buildVipBillingMetadata({
    subscriptionId: String(sub.id),
    userId: String(user.id),
    planPriceId: String(store.price.id),
  });
  let current = new Date("2026-01-01T00:00:00.000Z");
  const gateway = new MemoryGateway(String(sub.id), "cus_m3_fake");
  gateway.snapshot = snapshot({
    subscriptionId: "sub_m3_fake",
    customerId: "cus_m3_fake",
    priceId: "price_provider_m3",
    metadata,
    periodStart: 1_767_225_600,
    periodEnd: 1_769_817_600,
  });
  store.gateway = gateway as never;
  const now = () => new Date(current);

  const { handleVipSubscriptionCancellation, handleVipSubscriptionCheckout } =
    await import("../lib/vip/billing/customer-billing-api");
  const checkout = await handleVipSubscriptionCheckout({
    requireCustomer: async () => ({ userId: String(user.id), role: "user" }),
    repo: store as never,
    gateway: gateway as never,
    getBaseUrl: () => "http://localhost:3000",
  });
  check(
    checkout.status === 200 && store.price.providerSyncStatus === "ready",
    "new-customer checkout failed"
  );
  check(
    store.users.get(String(user.id))?.membershipTier === "free",
    "checkout granted entitlement early"
  );

  const checkoutResult = await processMemoryEvent(
    checkoutEvent(`${eventPrefix}_checkout`, metadata, "sub_m3_fake"),
    store,
    gateway,
    now
  );
  check(
    checkoutResult.status === "processed" &&
      store.users.get(String(user.id))?.membershipTier === "free",
    "checkout binding contract failed"
  );
  await processMemoryEvent(
    checkoutEvent(`${eventPrefix}_checkout`, metadata, "sub_m3_fake"),
    store,
    gateway,
    now
  );

  const firstEnd = 1_769_817_600;
  const paid = await processMemoryEvent(
    invoiceEvent(
      `${eventPrefix}_paid_1`,
      `${eventPrefix}_invoice_1`,
      metadata,
      "sub_m3_fake"
    ),
    store,
    gateway,
    now
  );
  check(
    paid.status === "processed" &&
      store.users.get(String(user.id))?.membershipTier === "vip" &&
      store.users.get(String(user.id))?.vipExpiresAt instanceof Date,
    "first paid invoice failed"
  );
  check(
    store.sent.filter((item) => item.notificationType === "vip_activated")
      .length === 1,
    "activation email was not sent once"
  );

  gateway.snapshot = snapshot({
    subscriptionId: "sub_m3_fake",
    customerId: "cus_m3_fake",
    priceId: "price_provider_m3",
    metadata,
    periodStart: firstEnd,
    periodEnd: firstEnd + 2_592_000,
  });
  current = new Date("2026-02-01T00:00:00.000Z");
  await processMemoryEvent(
    invoiceEvent(
      `${eventPrefix}_paid_2`,
      `${eventPrefix}_invoice_2`,
      metadata,
      "sub_m3_fake"
    ),
    store,
    gateway,
    now
  );
  const renewedExpiry = store.users.get(String(user.id))?.vipExpiresAt;
  check(
    renewedExpiry instanceof Date &&
      renewedExpiry.getTime() ===
        dateFromSeconds(firstEnd + 2_592_000).getTime(),
    "renewal did not use provider period end"
  );
  check(
    store.sent.filter((item) => item.notificationType === "vip_renewal_paid")
      .length === 1,
    "renewal email was not sent once"
  );

  const paidExpiry = store.users.get(String(user.id))?.vipExpiresAt;
  gateway.snapshot = snapshot({
    subscriptionId: "sub_m3_fake",
    customerId: "cus_m3_fake",
    priceId: "price_provider_m3",
    metadata,
    status: "past_due",
    periodStart: firstEnd + 2_592_000,
    periodEnd: firstEnd + 5_184_000,
  });
  await processMemoryEvent(
    invoiceEvent(
      `${eventPrefix}_failed`,
      `${eventPrefix}_failed_invoice`,
      metadata,
      "sub_m3_fake",
      "invoice.payment_failed"
    ),
    store,
    gateway,
    now
  );
  check(
    store.users.get(String(user.id))?.vipExpiresAt === paidExpiry,
    "failed payment extended entitlement"
  );
  check(
    store.sent.filter((item) => item.notificationType === "vip_payment_failed")
      .length === 1,
    "payment failure email was not sent once"
  );

  gateway.snapshot = snapshot({
    subscriptionId: "sub_m3_fake",
    customerId: "cus_m3_fake",
    priceId: "price_provider_m3",
    metadata,
    periodStart: firstEnd + 5_184_000,
    periodEnd: firstEnd + 7_776_000,
  });
  await processMemoryEvent(
    invoiceEvent(
      `${eventPrefix}_recovery`,
      `${eventPrefix}_recovery_invoice`,
      metadata,
      "sub_m3_fake"
    ),
    store,
    gateway,
    now
  );
  const beforeCancel = store.users.get(String(user.id))?.vipExpiresAt;

  gateway.snapshot.cancelAtPeriodEnd = true;
  await processMemoryEvent(
    subscriptionEvent(
      `${eventPrefix}_cancel`,
      metadata,
      gateway.snapshot as never
    ),
    store,
    gateway,
    now
  );
  const cancelResponse = await handleVipSubscriptionCancellation({
    requireCustomer: async () => ({ userId: String(user.id), role: "user" }),
    repo: store as never,
    gateway: gateway as never,
    getBaseUrl: () => "http://localhost:3000",
  });
  check(
    cancelResponse.status === 200 &&
      store.subscriptions.get(String(sub.id))?.cancelAtPeriodEnd === true &&
      store.users.get(String(user.id))?.vipExpiresAt === beforeCancel,
    "cancellation-at-period-end failed"
  );
  check(
    store.sent.filter(
      (item) => item.notificationType === "vip_cancellation_scheduled"
    ).length === 1,
    "cancellation email was not sent once"
  );

  await processMemoryEvent(
    subscriptionEvent(
      `${eventPrefix}_cancel`,
      metadata,
      gateway.snapshot as never
    ),
    store,
    gateway,
    now
  );
  await processMemoryEvent(
    subscriptionEvent(
      `${eventPrefix}_deleted`,
      metadata,
      {
        ...gateway.snapshot,
        status: "canceled",
        cancelAtPeriodEnd: false,
      } as never,
      "customer.subscription.deleted"
    ),
    store,
    gateway,
    now
  );
  check(
    store.users.get(String(user.id))?.membershipTier === "free" &&
      store.users.get(String(user.id))?.vipExpiresAt === null,
    "subscription deletion did not close entitlement"
  );

  const duplicatePaid = await processMemoryEvent(
    invoiceEvent(
      `${eventPrefix}_paid_duplicate`,
      `${eventPrefix}_recovery_invoice`,
      metadata,
      "sub_m3_fake"
    ),
    store,
    gateway,
    now
  );
  check(
    duplicatePaid.status === "ignored",
    "same paid invoice with a different event was not ignored"
  );
  const malformed = await processMemoryEvent(
    {
      id: `${eventPrefix}_malformed`,
      type: "checkout.session.completed",
      data: { object: { mode: "subscription" } },
    },
    store,
    gateway,
    now
  );
  check(malformed.status === "failed", "malformed metadata was not rejected");
  const unknown = await processMemoryEvent(
    {
      id: `${eventPrefix}_unknown`,
      type: "provider.unknown",
      data: { object: {} },
    },
    store,
    gateway,
    now
  );
  check(
    unknown.status === "ignored",
    "unknown provider event was not safely ignored"
  );

  const orderedUser = store.addUser("ordered-user");
  const orderedSub = store.addSubscription(String(orderedUser.id));
  const orderedMeta = buildVipBillingMetadata({
    subscriptionId: String(orderedSub.id),
    userId: String(orderedUser.id),
    planPriceId: String(store.price.id),
  });
  gateway.snapshot = snapshot({
    subscriptionId: "sub_m3_ordered",
    customerId: "cus_m3_ordered",
    priceId: "price_provider_m3",
    metadata: orderedMeta,
    periodStart: 1_800_000_000,
    periodEnd: 1_802_592_000,
  });
  await processMemoryEvent(
    invoiceEvent(
      `${eventPrefix}_order_invoice`,
      `${eventPrefix}_order_paid`,
      orderedMeta,
      "sub_m3_ordered"
    ),
    store,
    gateway,
    now
  );
  await processMemoryEvent(
    checkoutEvent(
      `${eventPrefix}_order_checkout`,
      orderedMeta,
      "sub_m3_ordered"
    ),
    store,
    gateway,
    now
  );
  check(
    store.users.get(String(orderedUser.id))?.membershipTier === "vip",
    "invoice-before-checkout ordering failed"
  );

  const updateUser = store.addUser("update-user");
  const updateSub = store.addSubscription(String(updateUser.id));
  const updateMeta = buildVipBillingMetadata({
    subscriptionId: String(updateSub.id),
    userId: String(updateUser.id),
    planPriceId: String(store.price.id),
  });
  gateway.snapshot = snapshot({
    subscriptionId: "sub_m3_update",
    customerId: "cus_m3_update",
    priceId: "price_provider_m3",
    metadata: updateMeta,
  });
  await processMemoryEvent(
    subscriptionEvent(
      `${eventPrefix}_order_update`,
      updateMeta,
      gateway.snapshot as never
    ),
    store,
    gateway,
    now
  );
  check(
    store.users.get(String(updateUser.id))?.membershipTier === "free",
    "subscription update granted entitlement"
  );
  await processMemoryEvent(
    checkoutEvent(
      `${eventPrefix}_order_update_checkout`,
      updateMeta,
      "sub_m3_update"
    ),
    store,
    gateway,
    now
  );

  const priceSnapshot = {
    amountMinor: Number(sub.amountMinor),
    planPriceId: sub.planPriceId,
  };
  const customerB = store.addUser("price-change-user");
  const subB = store.addSubscription(String(customerB.id), 9900);
  check(
    priceSnapshot.amountMinor === 7900 &&
      subB.amountMinor === 9900 &&
      subB.amountMinor !== sub.amountMinor,
    "price-change regression setup invalid"
  );
  return {
    status: "pass",
    lifecycle: true,
    adversarial: true,
    notificationTypes: [
      "vip_activated",
      "vip_renewal_paid",
      "vip_payment_failed",
      "vip_cancellation_scheduled",
    ],
    priceChange: true,
  };
}

function protectedDatabaseTarget() {
  const value = process.env.POSTGRES_URL;
  if (!value) {
    throw new Error("POSTGRES_URL is not configured");
  }
  const url = new URL(value);
  check(
    ["localhost", "127.0.0.1"].includes(url.hostname),
    "database host is not local"
  );
  check(url.port === "5432", "database port is not 5432");
  check(
    url.pathname.replace(/^\//, "") === "chatbot",
    "database is not chatbot"
  );
  return { url: value, host: url.hostname, port: 5432, database: "chatbot" };
}

async function postgresCampaign() {
  const target = protectedDatabaseTarget();
  // The M2 query module owns its own bounded pool. Keep this inspection pool
  // small so the local Postgres max_connections setting cannot mask lease
  // behavior as a harness failure.
  const sql = postgres(target.url, { max: 4 });
  const [roleTimezone] = await sql`
    select current_setting('TimeZone') as timezone
  `;
  const applicationProbe = postgres(target.url, {
    max: 1,
    connection: { TimeZone: "UTC" },
  });
  const [applicationTimezone] = await applicationProbe`
    select current_setting('TimeZone') as timezone
  `;
  check(
    roleTimezone?.timezone === "Australia/Sydney",
    "local chatbot PostgreSQL role default timezone is not Australia/Sydney"
  );
  check(
    applicationTimezone?.timezone === "UTC",
    "application PostgreSQL session timezone is not UTC"
  );
  const ids = {
    user: randomUUID(),
    price: randomUUID(),
    subscription: randomUUID(),
    eventPaid: `${eventPrefix}_pg_paid`,
    eventFailed: `${eventPrefix}_pg_failed`,
    eventStale: `${eventPrefix}_pg_stale`,
    notificationEvent: `${eventPrefix}_pg_notification`,
  };
  const providerSubscriptionId = `${eventPrefix}_pg_sub`;
  const providerCustomerId = `${eventPrefix}_pg_cus`;
  const providerPriceId = `${eventPrefix}_pg_price`;
  const metadata = buildVipBillingMetadata({
    subscriptionId: ids.subscription,
    userId: ids.user,
    planPriceId: ids.price,
  });
  const periodStart = 1_800_000_000;
  const periodEnd = 1_802_592_000;
  const provider = {
    async retrieveSubscription() {
      return snapshot({
        subscriptionId: providerSubscriptionId,
        customerId: providerCustomerId,
        priceId: providerPriceId,
        metadata,
        periodStart,
        periodEnd,
      });
    },
  };
  const sent: JsonRecord[] = [];
  const mailer = {
    async send(input: JsonRecord) {
      sent.push({ notificationType: input.notificationType });
    },
  };
  let schemaReady = false;
  try {
    const tables =
      await sql`select to_regclass('public."VipBillingEvent"') as event_table, to_regclass('public."VipBillingNotification"') as notification_table`;
    check(
      tables[0]?.event_table && tables[0]?.notification_table,
      "M2 billing tables are not installed"
    );
    schemaReady = true;
    await sql`insert into "User" ("id", "email", "emailVerifiedAt") values (${ids.user}, ${`phase9-m3-${runId}@example.invalid`}, now())`;
    await sql`insert into "VipPlanPrice" ("id", "amountMinor", "currency", "billingInterval", "active") values (${ids.price}, 7900, 'AUD', 'month', false)`;
    await sql`insert into "VipSubscription" ("id", "userId", "planPriceId", "provider", "amountMinor", "currency", "status") values (${ids.subscription}, ${ids.user}, ${ids.price}, 'stripe', 7900, 'AUD', 'pending')`;
    const { createPostgresVipBillingRepository } = await import(
      "../lib/vip/billing/repository"
    );
    const { processVerifiedVipBillingEvent } = await import(
      "../lib/vip/billing/webhook-processing"
    );
    const repo = createPostgresVipBillingRepository();
    const paidEvent = invoiceEvent(
      ids.eventPaid,
      `${eventPrefix}_pg_invoice`,
      metadata,
      providerSubscriptionId
    );
    const results = await Promise.all(
      Array.from({ length: 16 }, () =>
        processVerifiedVipBillingEvent(paidEvent as never, {
          repo,
          provider,
          mailer,
          now: () => new Date(),
        })
      )
    );
    const [subRow] =
      await sql`select "status", "lastPaidInvoiceId", "currentPeriodEnd" from "VipSubscription" where "id" = ${ids.subscription}`;
    const [userRow] =
      await sql`select "membershipTier", "vipExpiresAt" from "User" where "id" = ${ids.user}`;
    const [notificationCount] =
      await sql`select count(*)::int as count from "VipBillingNotification" n join "VipBillingEvent" e on e."id" = n."billingEventId" where e."providerEventId" = ${ids.eventPaid}`;
    check(
      results.some((result) => result.status === "processed") &&
        subRow?.status === "active" &&
        subRow.lastPaidInvoiceId === `${eventPrefix}_pg_invoice` &&
        userRow?.membershipTier === "vip" &&
        Number(notificationCount?.count) === 1,
      "Postgres concurrent paid event campaign failed"
    );

    const failedClaimNow = new Date();
    const failedClaim = await repo.claimVipBillingEvent({
      provider: "stripe",
      providerEventId: ids.eventFailed,
      eventType: "invoice.payment_failed",
      now: failedClaimNow,
    });
    check(
      failedClaim?.owned && failedClaim.event.processingToken,
      "failed event setup failed"
    );
    const [failedLeaseRow] =
      await applicationProbe`select "processingStartedAt" at time zone 'UTC' as "processingStartedAt" from "VipBillingEvent" where "id" = ${failedClaim.event.id}`;
    check(
      failedLeaseRow?.processingStartedAt instanceof Date &&
        failedLeaseRow.processingStartedAt.getTime() ===
          failedClaimNow.getTime(),
      `billing lease Date did not round-trip to the same instant (expected ${failedClaimNow.toISOString()}, read ${failedLeaseRow?.processingStartedAt instanceof Date ? failedLeaseRow.processingStartedAt.toISOString() : String(failedLeaseRow?.processingStartedAt)})`
    );
    const freshLease = await repo.claimVipBillingEvent({
      provider: "stripe",
      providerEventId: ids.eventFailed,
      eventType: "invoice.payment_failed",
      now: new Date(failedClaimNow.getTime() + billingLeaseMs - 1),
    });
    check(
      !freshLease?.owned,
      "fresh billing lease was incorrectly reclaimable"
    );
    await repo.markVipBillingEventFailed(
      failedClaim.event.id,
      "m3_test_failure",
      failedClaim.event.processingToken as string
    );
    const reclaimResults = await Promise.all(
      Array.from({ length: 16 }, () =>
        repo.claimVipBillingEvent({
          provider: "stripe",
          providerEventId: ids.eventFailed,
          eventType: "invoice.payment_failed",
        })
      )
    );
    check(
      reclaimResults.filter((result) => result?.owned).length === 1,
      "failed event was reclaimed by more than one worker"
    );
    const newFailedClaim = reclaimResults.find((result) => result?.owned);
    if (newFailedClaim?.owned) {
      await repo.markVipBillingEventFailed(
        newFailedClaim.event.id,
        "m3_cleanup",
        newFailedClaim.event.processingToken as string
      );
    }

    const staleClaim = await repo.claimVipBillingEvent({
      provider: "stripe",
      providerEventId: ids.eventStale,
      eventType: "invoice.paid",
    });
    check(
      staleClaim?.owned && staleClaim.event.processingToken,
      "stale event setup failed"
    );
    await sql`update "VipBillingEvent" set "processingStartedAt" = now() - interval '10 minutes', "updatedAt" = now() - interval '10 minutes' where "id" = ${staleClaim.event.id}`;
    const [staleLeaseRow] =
      await applicationProbe`select "processingStartedAt" at time zone 'UTC' as "processingStartedAt" from "VipBillingEvent" where "id" = ${staleClaim.event.id}`;
    check(
      staleLeaseRow?.processingStartedAt instanceof Date,
      "stale billing lease Date could not be read back"
    );
    // Exercise the exact lease boundary while avoiding any session-timezone
    // dependence: one millisecond before expiry is fresh, one after is stale.
    const beforeExpiry = await repo.claimVipBillingEvent({
      provider: "stripe",
      providerEventId: ids.eventStale,
      eventType: "invoice.paid",
      now: new Date(
        staleLeaseRow.processingStartedAt.getTime() + billingLeaseMs - 1
      ),
    });
    check(!beforeExpiry?.owned, "billing lease was reclaimable before expiry");
    const staleNow = new Date(
      staleLeaseRow.processingStartedAt.getTime() + billingLeaseMs + 1
    );
    const staleResults = await Promise.all(
      Array.from({ length: 16 }, () =>
        repo.claimVipBillingEvent({
          provider: "stripe",
          providerEventId: ids.eventStale,
          eventType: "invoice.paid",
          now: staleNow,
        })
      )
    );
    check(
      staleResults.filter((result) => result?.owned).length === 1,
      `stale lease was reclaimed by more than one worker (${staleResults.filter((result) => result?.owned).length})`
    );
    let staleOwnerRejected = false;
    try {
      await repo.markVipBillingEventProcessed(
        staleClaim.event.id,
        staleClaim.event.processingToken as string
      );
    } catch {
      staleOwnerRejected = true;
    }
    check(
      staleOwnerRejected,
      "stale former owner terminal update was accepted"
    );
    const currentStale = staleResults.find((result) => result?.owned);
    if (currentStale?.owned) {
      await repo.markVipBillingEventFailed(
        currentStale.event.id,
        "m3_cleanup",
        currentStale.event.processingToken as string
      );
    }

    const notificationEventClaim = await repo.claimVipBillingEvent({
      provider: "stripe",
      providerEventId: ids.notificationEvent,
      eventType: "test.notification",
    });
    check(notificationEventClaim?.owned, "notification event setup failed");
    await repo.markVipBillingEventProcessed(
      notificationEventClaim.event.id,
      notificationEventClaim.event.processingToken as string
    );
    const notificationId = randomUUID();
    await sql`insert into "VipBillingNotification" ("id", "billingEventId", "userId", "notificationType", "deliveryStatus") values (${notificationId}, ${notificationEventClaim.event.id}, ${ids.user}, 'vip_renewal_paid', 'pending')`;
    const notificationNow = new Date();
    const notificationClaims = await Promise.all(
      Array.from({ length: 16 }, () =>
        repo.claimVipBillingNotification(notificationId, notificationNow)
      )
    );
    const ownedNotifications = notificationClaims.filter(Boolean);
    check(
      ownedNotifications.length === 1,
      `notification was claimed by more than one worker (${ownedNotifications.length})`
    );
    if (ownedNotifications[0]?.deliveryToken) {
      sent.push({ notificationType: ownedNotifications[0].notificationType });
      await repo.markVipBillingNotificationSent(
        notificationId,
        ownedNotifications[0].deliveryToken
      );
    }
    check(
      sent.filter((item) => item.notificationType === "vip_renewal_paid")
        .length === 1,
      "concurrent notification delivery was not once-claimed"
    );
    return {
      status: "pass",
      sessionTimeZone: {
        roleDefault: roleTimezone.timezone,
        application: applicationTimezone.timezone,
      },
      target: {
        host: target.host,
        port: target.port,
        database: target.database,
      },
      concurrentWorkers: 16,
      paidNotificationRows: Number(notificationCount?.count),
      staleFormerOwnerRejected: true,
      fakeMailerSends: sent.length,
      cleanupCounts: {
        users: 0,
        prices: 0,
        subscriptions: 0,
        events: 0,
        notifications: 0,
      },
    };
  } finally {
    if (schemaReady) {
      await sql`delete from "VipBillingNotification" where "billingEventId" in (select "id" from "VipBillingEvent" where "providerEventId" in (${ids.eventPaid}, ${ids.eventFailed}, ${ids.eventStale}, ${ids.notificationEvent}))`;
      await sql`delete from "VipBillingEvent" where "provider" = 'stripe' and "providerEventId" in (${ids.eventPaid}, ${ids.eventFailed}, ${ids.eventStale}, ${ids.notificationEvent})`;
      await sql`delete from "VipSubscription" where "id" = ${ids.subscription}`;
      await sql`delete from "VipPlanPrice" where "id" = ${ids.price}`;
      await sql`delete from "User" where "id" = ${ids.user}`;
    }
    const verify = postgres(target.url, { max: 1 });
    const counts = await verify.begin(async (tx) => {
      const [userCount] =
        await tx`select count(*)::int as count from "User" where "id" = ${ids.user}`;
      const [priceCount] =
        await tx`select count(*)::int as count from "VipPlanPrice" where "id" = ${ids.price}`;
      const [subCount] =
        await tx`select count(*)::int as count from "VipSubscription" where "id" = ${ids.subscription}`;
      const [eventCount] =
        await tx`select count(*)::int as count from "VipBillingEvent" where "provider" = 'stripe' and "providerEventId" in (${ids.eventPaid}, ${ids.eventFailed}, ${ids.eventStale}, ${ids.notificationEvent})`;
      return {
        users: Number(userCount?.count),
        prices: Number(priceCount?.count),
        subscriptions: Number(subCount?.count),
        events: Number(eventCount?.count),
      };
    });
    await verify.end();
    await applicationProbe.end();
    check(
      Object.values(counts).every((count) => count === 0),
      "Postgres M3 cleanup was not zero"
    );
    await sql.end();
  }
}

async function stripeContract() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!isSafeStripeTestSecret(secret)) {
    return {
      status: "blocked_by_test_credential",
      attempted: false,
      stripeTestModeCredentialPresent: false,
    };
  }
  const oldProvider = process.env.VIP_BILLING_PROVIDER;
  process.env.VIP_BILLING_PROVIDER = "stripe";
  const stripe = new Stripe(secret);
  let productId: string | null = null;
  let priceId: string | null = null;
  let customerId: string | null = null;
  let checkoutId: string | null = null;
  let stage = "create_product";
  let provisioningError: unknown;
  try {
    const metadata = m3RunMetadata(runId);
    stage = "create_product";
    const product = await stripe.products.create({
      name: `M3 ${runId}`,
      metadata,
    });
    productId = product.id;
    const store = new MemoryBillingStore();
    const { ensureVipPlanPriceProvisioned } = await import(
      "../lib/vip/billing/provisioning"
    );
    const gateway = (
      await import("../lib/vip/billing/stripe-adapter")
    ).createStripeBillingGateway();
    store.gateway = gateway as never;
    store.reusableProductId = product.id;
    stage = "provision_price";
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (args[0] === "VIP plan price provisioning failed:") {
        provisioningError = args[1];
        return;
      }
      originalConsoleError(...args);
    };
    let provisioned: Awaited<ReturnType<typeof ensureVipPlanPriceProvisioned>>;
    try {
      provisioned = await ensureVipPlanPriceProvisioned({
        planPriceId: String(store.price.id),
        repo: store as never,
        gateway,
      });
    } finally {
      console.error = originalConsoleError;
    }
    check(
      provisioned.status === "ready",
      "real Stripe Price provisioning failed"
    );
    priceId = provisioned.providerPriceId;
    stage = "retrieve_price";
    await stripe.prices.update(priceId, { metadata });
    const retrievedPrice = await stripe.prices.retrieve(priceId);
    check(
      retrievedPrice.livemode === false &&
        retrievedPrice.currency === "aud" &&
        retrievedPrice.recurring?.interval === "month" &&
        retrievedPrice.unit_amount === 7900,
      "real Stripe Price contract mismatch"
    );
    stage = "create_customer";
    const customer = await stripe.customers.create({
      email: `phase9-m3-${runId}@example.invalid`,
      metadata,
    });
    customerId = customer.id;
    const user = store.addUser("stripe-user");
    const checkoutGateway = gateway;
    const { handleVipSubscriptionCheckout } = await import(
      "../lib/vip/billing/customer-billing-api"
    );
    stage = "create_checkout";
    const checkout = await handleVipSubscriptionCheckout({
      requireCustomer: async () => ({ userId: String(user.id), role: "user" }),
      repo: store as never,
      gateway: checkoutGateway,
      getBaseUrl: () => "http://localhost:3000",
    });
    check(checkout.status === 200, "real Stripe Checkout creation failed");
    const checkoutData = (await checkout.json()) as { url?: string };
    check(typeof checkoutData.url === "string", "Stripe Checkout URL missing");
    stage = "retrieve_checkout";
    const sessions = await stripe.checkout.sessions.list({ limit: 20 });
    const session = sessions.data.find((item) => item.url === checkoutData.url);
    check(
      session?.livemode === false &&
        session.mode === "subscription" &&
        session.client_reference_id ===
          store.subscriptions.values().next().value?.id &&
        session.metadata?.vipUserId === user.id,
      "real Stripe Checkout contract mismatch"
    );
    checkoutId = session.id;
    let portal: "pass" | "configuration_gap" = "pass";
    try {
      await stripe.billingPortal.sessions.create({
        customer: customer.id,
        return_url: "http://localhost:3000/vip",
      });
    } catch {
      portal = "configuration_gap";
    }
    return {
      status: "pass",
      attempted: true,
      stripeTestModeCredentialPresent: true,
      productPriceCheckout: true,
      checkoutSubscriptionMetadataRequestAccepted: true,
      portal,
      testObjectCleanup: "archive_or_delete_exact_run_objects",
    };
  } catch (error) {
    return {
      status: "fail",
      attempted: true,
      stripeTestModeCredentialPresent: true,
      diagnostic: stripeDiagnostic(stage, provisioningError ?? error),
    };
  } finally {
    try {
      if (checkoutId) {
        const session = await stripe.checkout.sessions.retrieve(checkoutId);
        if (session.status === "open") {
          await stripe.checkout.sessions.expire(checkoutId);
        }
      }
    } catch {
      /* bounded cleanup */
    }
    try {
      if (priceId) {
        await stripe.prices.update(priceId, { active: false });
      }
    } catch {
      /* bounded cleanup */
    }
    try {
      if (productId) {
        await stripe.products.update(productId, { active: false });
      }
    } catch {
      /* bounded cleanup */
    }
    try {
      if (customerId) {
        await stripe.customers.del(customerId);
      }
    } catch {
      /* report via retained-object status if provider refuses */
    }
    if (oldProvider === undefined) {
      process.env.VIP_BILLING_PROVIDER = undefined;
    } else {
      process.env.VIP_BILLING_PROVIDER = oldProvider;
    }
  }
}

type StripeTestClockStage =
  | "create_clock"
  | "create_customer"
  | "create_failure_subscription"
  | "attach_payment_method"
  | "create_subscription"
  | "advance_to_renewal"
  | "wait_clock_ready"
  | "finalize_invoice_window"
  | "retrieve_invoice"
  | "retrieve_failure_event"
  | "cancel_at_period_end"
  | "advance_to_end"
  | "cleanup";

type StripeDiagnostic = {
  stage: string;
  stripeErrorType?: string;
  stripeErrorCode?: string;
  httpStatus?: number;
  reason?: string;
};
type StripeTestClockDiagnostic = StripeDiagnostic & {
  stage: StripeTestClockStage;
};
type StripeCustomerConfigurationDiagnostic = {
  stage: "create_customer";
  classification: "TEST_HARNESS_DEFECT";
  customerCreated: boolean;
  testClockReferencePresent: boolean;
  testClockReferenceKind: "string" | "object" | "null";
  testClockMatches: boolean;
  defaultPaymentMethodPresent: boolean;
  defaultPaymentMethodReferenceKind: "string" | "object" | "null";
  defaultPaymentMethodAttachedToCustomer: boolean;
};
type StripeTestClockFailureDiagnostic =
  | StripeTestClockDiagnostic
  | StripeCustomerConfigurationDiagnostic
  | FailureTimingFailureDiagnostic;

type FailureInvoiceSummary = {
  status: string | null;
  paid: boolean;
  amountDuePositive: boolean;
  billingReason: string | null;
  parentSubscriptionMatches: boolean;
  createdAfterTrialEnd: boolean;
};

type M3StripeInvoice = {
  id: string;
  status: string | null;
  paid?: boolean;
  attempted?: boolean;
  attempt_count?: number;
  amount_due: number;
  billing_reason: string | null;
  created: number;
  subscription?: unknown;
  parent?: {
    subscription_details?: { subscription?: unknown };
  } | null;
};

type FailureTimingDiagnostic = {
  subscriptionCreated: boolean;
  subscriptionStatus: string | null;
  trialEndPresent: boolean;
  trialEndAfterFrozenTime: boolean;
  customerHasDefaultPaymentMethod: boolean;
  testClockAssociationPresent: boolean;
  postTrialSubscriptionStatus: string | null;
  trialEnded: boolean;
  customerScopedInvoiceCount: number;
  subscriptionScopedInvoiceCount: number;
  matchingInvoices: FailureInvoiceSummary[];
};
type FailureTimingFailureDiagnostic = FailureTimingDiagnostic & {
  stage: StripeTestClockStage;
  classification: "TEST_HARNESS_DEFECT";
};

function safeStripeDiagnosticToken(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(value)
    ? value
    : undefined;
}

function stripeDiagnostic(stage: string, error: unknown): StripeDiagnostic {
  const candidate = (error ?? {}) as {
    type?: unknown;
    code?: unknown;
    statusCode?: unknown;
    raw?: { type?: unknown; code?: unknown; statusCode?: unknown };
  };
  const type = safeStripeDiagnosticToken(candidate.type ?? candidate.raw?.type);
  const code = safeStripeDiagnosticToken(candidate.code ?? candidate.raw?.code);
  const status = candidate.statusCode ?? candidate.raw?.statusCode;
  return {
    stage,
    ...(type ? { stripeErrorType: type } : {}),
    ...(code ? { stripeErrorCode: code } : {}),
    ...(typeof status === "number" && Number.isInteger(status) && status > 0
      ? { httpStatus: status }
      : {}),
  };
}

function stripeTestClockDiagnostic(
  stage: StripeTestClockStage,
  error: unknown
): StripeTestClockDiagnostic {
  return stripeDiagnostic(stage, error) as StripeTestClockDiagnostic;
}

function referenceKind(value: unknown): "string" | "object" | "null" {
  if (typeof value === "string") {
    return "string";
  }
  if (value !== null && typeof value === "object") {
    return "object";
  }
  return "null";
}

async function stripeTestClock() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!isSafeStripeTestSecret(secret)) {
    return {
      status: "blocked_by_test_credential",
      attempted: false,
      renewalPass: false,
      failurePass: false,
      cancellationPass: false,
    };
  }
  const stripe = new Stripe(secret);
  let clockId: string | null = null;
  let customerId: string | null = null;
  let productId: string | null = null;
  let priceId: string | null = null;
  let stage: StripeTestClockStage = "create_clock";
  let renewalPass = false;
  let failurePass = false;
  let cancellationPass = false;
  const cleanupDiagnostics: StripeTestClockDiagnostic[] = [];
  let paymentFailure: JsonRecord = {
    status: "external_test_limitation",
    reason: "payment-failure scenario was not completed",
  };

  async function stripeCall<T>(
    nextStage: StripeTestClockStage,
    operation: () => Promise<T>
  ): Promise<T> {
    stage = nextStage;
    try {
      return await operation();
    } catch (error) {
      const wrapped = new Error("stripe_test_clock_api_error");
      Object.assign(wrapped, {
        diagnostic: stripeTestClockDiagnostic(nextStage, error),
      });
      throw wrapped;
    }
  }

  async function cleanupCall(operation: () => Promise<unknown>) {
    try {
      await stripeCall("cleanup", operation);
    } catch (error) {
      const diagnostic = (error as { diagnostic?: StripeTestClockDiagnostic })
        .diagnostic;
      cleanupDiagnostics.push(
        diagnostic ?? stripeTestClockDiagnostic("cleanup", error)
      );
    }
  }

  function diagnosticForFailure(
    error: unknown
  ): StripeTestClockFailureDiagnostic {
    const diagnostic = (
      error as { diagnostic?: StripeTestClockFailureDiagnostic }
    ).diagnostic;
    if (diagnostic) {
      return diagnostic;
    }
    return {
      stage,
      reason:
        error instanceof Error ? error.message.slice(0, 160) : "unknown_error",
    };
  }

  try {
    const clock = await stripeCall("create_clock", () =>
      stripe.testHelpers.testClocks.create({
        frozen_time: Math.floor(Date.now() / 1000) - 60,
        name: `phase9-m3-${runId}`,
      })
    );
    clockId = clock.id;
    const product = await stripeCall("create_customer", () =>
      stripe.products.create({
        name: `M3 Clock VIP ${runId}`,
        metadata: m3RunMetadata(runId),
      })
    );
    productId = product.id;
    const price = await stripeCall("create_customer", () =>
      stripe.prices.create({
        product: product.id,
        currency: "aud",
        unit_amount: 7900,
        recurring: { interval: "month" },
        metadata: m3RunMetadata(runId),
      })
    );
    priceId = price.id;
    const createdCustomer = await stripeCall("create_customer", () =>
      stripe.customers.create({
        email: `phase9-m3-clock-${runId}@example.invalid`,
        test_clock: clock.id,
        payment_method: "pm_card_visa",
        invoice_settings: { default_payment_method: "pm_card_visa" },
        metadata: m3RunMetadata(runId),
      })
    );
    customerId = createdCustomer.id;
    const retrievedCustomer = await stripeCall("create_customer", () =>
      stripe.customers.retrieve(createdCustomer.id)
    );
    const customer =
      "deleted" in retrievedCustomer && retrievedCustomer.deleted
        ? null
        : retrievedCustomer;
    const testClockReference = customer?.test_clock;
    const defaultPaymentMethodReference =
      customer?.invoice_settings?.default_payment_method;
    const testClockId = m3StripeObjectId(testClockReference);
    const defaultPaymentMethodId = m3StripeObjectId(
      defaultPaymentMethodReference
    );
    const defaultPaymentMethod = defaultPaymentMethodId
      ? await stripeCall("create_customer", () =>
          stripe.paymentMethods.retrieve(defaultPaymentMethodId)
        )
      : null;
    const defaultPaymentMethodAttachedToCustomer = Boolean(
      defaultPaymentMethod &&
        defaultPaymentMethod.livemode === false &&
        defaultPaymentMethod.type === "card" &&
        m3StripeObjectId(defaultPaymentMethod.customer) === createdCustomer.id
    );
    const customerConfiguration = {
      stage: "create_customer" as const,
      classification: "TEST_HARNESS_DEFECT" as const,
      customerCreated: Boolean(createdCustomer.id),
      testClockReferencePresent: testClockId !== null,
      testClockReferenceKind: referenceKind(testClockReference),
      testClockMatches: testClockId === clock.id,
      defaultPaymentMethodPresent: defaultPaymentMethodId !== null,
      defaultPaymentMethodReferenceKind: referenceKind(
        defaultPaymentMethodReference
      ),
      defaultPaymentMethodAttachedToCustomer,
    } satisfies StripeCustomerConfigurationDiagnostic;
    if (
      !(
        customerConfiguration.customerCreated &&
        customerConfiguration.testClockReferencePresent &&
        customerConfiguration.testClockMatches &&
        customerConfiguration.defaultPaymentMethodPresent &&
        customerConfiguration.defaultPaymentMethodAttachedToCustomer
      )
    ) {
      const assertionError = new Error(
        "test_clock_customer_semantic_validation_failed"
      );
      Object.assign(assertionError, { diagnostic: customerConfiguration });
      throw assertionError;
    }
    check(customer, "Test Clock customer was deleted");
    const subscription = await stripeCall("create_subscription", () =>
      stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: price.id }],
        metadata: m3RunMetadata(runId),
        payment_behavior: "error_if_incomplete",
      })
    );
    const firstItem = subscription.items.data[0];
    check(
      m3StripeObjectId(subscription.test_clock) === clock.id &&
        subscription.status === "active" &&
        firstItem?.current_period_end,
      "Test Clock initial subscription was not active or clock-associated"
    );

    async function waitForClockReady(clockIdToWait: string) {
      stage = "wait_clock_ready";
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const current = await stripeCall("wait_clock_ready", () =>
          stripe.testHelpers.testClocks.retrieve(clockIdToWait)
        );
        if (current.status === "ready") {
          return current;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error("test_clock_not_ready_within_bounded_wait");
    }

    const initialInvoices = await stripeCall("retrieve_invoice", () =>
      stripe.invoices.list({
        customer: customer.id,
        subscription: subscription.id,
        limit: 100,
      })
    );
    const initialInvoice = initialInvoices.data.find(
      (invoice) => invoice.billing_reason === "subscription_create"
    );
    check(
      initialInvoice?.status === "paid",
      "Test Clock initial subscription invoice was not paid"
    );

    await stripeCall("advance_to_renewal", () =>
      stripe.testHelpers.testClocks.advance(clock.id, {
        frozen_time: firstItem.current_period_end + 60,
      })
    );
    await waitForClockReady(clock.id);
    const renewalWindow = await stripeCall("retrieve_invoice", () =>
      stripe.invoices.list({
        customer: customer.id,
        subscription: subscription.id,
        limit: 100,
      })
    );
    const draftRenewal = renewalWindow.data.find(
      (invoice) => invoice.billing_reason === "subscription_cycle"
    );
    check(draftRenewal, "Test Clock renewal invoice was not created");

    await stripeCall("finalize_invoice_window", () =>
      stripe.testHelpers.testClocks.advance(clock.id, {
        frozen_time: firstItem.current_period_end + 60 + 60 * 60,
      })
    );
    await waitForClockReady(clock.id);
    const renewed = await stripeCall("retrieve_invoice", () =>
      stripe.subscriptions.retrieve(subscription.id)
    );
    const renewedItem = renewed.items.data[0];
    const renewalInvoices = await stripeCall("retrieve_invoice", () =>
      stripe.invoices.list({
        customer: customer.id,
        subscription: subscription.id,
        limit: 100,
      })
    );
    const renewalInvoice = renewalInvoices.data.find(
      (invoice) => invoice.billing_reason === "subscription_cycle"
    );
    check(
      renewalInvoice?.status === "paid" &&
        renewedItem &&
        renewedItem.current_period_end > firstItem.current_period_end,
      "Test Clock renewal invoice was not paid with an advanced provider period"
    );
    const exactRenewalInvoice = renewalInvoice
      ? await stripeCall("retrieve_invoice", () =>
          stripe.invoices.retrieve(renewalInvoice.id)
        )
      : null;
    check(
      exactRenewalInvoice?.status === "paid" &&
        m3StripeObjectId(
          exactRenewalInvoice.parent?.subscription_details?.subscription
        ) === subscription.id,
      "Test Clock exact renewal invoice retrieval failed"
    );
    renewalPass = true;

    async function runPaymentFailureScenario(): Promise<JsonRecord> {
      let failureClockId: string | null = null;
      let failureCustomerId: string | null = null;
      const failureTiming: FailureTimingDiagnostic = {
        subscriptionCreated: false,
        subscriptionStatus: null,
        trialEndPresent: false,
        trialEndAfterFrozenTime: false,
        customerHasDefaultPaymentMethod: false,
        testClockAssociationPresent: false,
        postTrialSubscriptionStatus: null,
        trialEnded: false,
        customerScopedInvoiceCount: 0,
        subscriptionScopedInvoiceCount: 0,
        matchingInvoices: [],
      };
      try {
        const failureClock = await stripeCall("create_clock", () =>
          stripe.testHelpers.testClocks.create({
            frozen_time: Math.floor(Date.now() / 1000) - 60,
            name: `phase9-m3-failure-${runId}`,
          })
        );
        failureClockId = failureClock.id;
        const createdFailureCustomer = await stripeCall("create_customer", () =>
          stripe.customers.create({
            email: `phase9-m3-failure-${runId}@example.invalid`,
            test_clock: failureClock.id,
            payment_method: "pm_card_chargeCustomerFail",
            invoice_settings: {
              default_payment_method: "pm_card_chargeCustomerFail",
            },
            metadata: m3RunMetadata(runId),
          })
        );
        failureCustomerId = createdFailureCustomer.id;
        const retrievedFailureCustomer = await stripeCall(
          "create_customer",
          () => stripe.customers.retrieve(createdFailureCustomer.id)
        );
        const failureCustomer =
          "deleted" in retrievedFailureCustomer &&
          retrievedFailureCustomer.deleted
            ? null
            : retrievedFailureCustomer;
        const failureTestClockReference = failureCustomer?.test_clock;
        const failureDefaultPaymentMethodReference =
          failureCustomer?.invoice_settings?.default_payment_method;
        const failureDefaultPaymentMethodId = m3StripeObjectId(
          failureDefaultPaymentMethodReference
        );
        const failureDefaultPaymentMethod = failureDefaultPaymentMethodId
          ? await stripeCall("create_customer", () =>
              stripe.paymentMethods.retrieve(failureDefaultPaymentMethodId)
            )
          : null;
        const failureCustomerConfiguration = {
          stage: "create_customer" as const,
          classification: "TEST_HARNESS_DEFECT" as const,
          customerCreated: Boolean(createdFailureCustomer.id),
          testClockReferencePresent:
            m3StripeObjectId(failureTestClockReference) !== null,
          testClockReferenceKind: referenceKind(failureTestClockReference),
          testClockMatches:
            m3StripeObjectId(failureTestClockReference) === failureClock.id,
          defaultPaymentMethodPresent: failureDefaultPaymentMethodId !== null,
          defaultPaymentMethodReferenceKind: referenceKind(
            failureDefaultPaymentMethodReference
          ),
          defaultPaymentMethodAttachedToCustomer: Boolean(
            failureDefaultPaymentMethod &&
              failureDefaultPaymentMethod.livemode === false &&
              failureDefaultPaymentMethod.type === "card" &&
              m3StripeObjectId(failureDefaultPaymentMethod.customer) ===
                createdFailureCustomer.id
          ),
        } satisfies StripeCustomerConfigurationDiagnostic;
        failureTiming.customerHasDefaultPaymentMethod =
          failureCustomerConfiguration.defaultPaymentMethodPresent &&
          failureCustomerConfiguration.defaultPaymentMethodAttachedToCustomer;
        failureTiming.testClockAssociationPresent =
          failureCustomerConfiguration.testClockMatches;
        if (
          !(
            failureCustomerConfiguration.customerCreated &&
            failureCustomerConfiguration.testClockReferencePresent &&
            failureCustomerConfiguration.testClockMatches &&
            failureCustomerConfiguration.defaultPaymentMethodPresent &&
            failureCustomerConfiguration.defaultPaymentMethodAttachedToCustomer
          )
        ) {
          const assertionError = new Error(
            "test_clock_failure_customer_semantic_validation_failed"
          );
          Object.assign(assertionError, {
            diagnostic: failureCustomerConfiguration,
          });
          throw assertionError;
        }
        if (!failureCustomer) {
          throw new Error("Test Clock failure customer was deleted");
        }
        const failureCustomerRecord = failureCustomer;
        const requestedFailureTrialEnd = failureClock.frozen_time + 15 * 60;
        const createdFailureSubscription = await stripeCall(
          "create_failure_subscription",
          () =>
            stripe.subscriptions.create({
              customer: failureCustomerRecord.id,
              items: [{ price: price.id }],
              metadata: m3RunMetadata(runId),
              trial_end: requestedFailureTrialEnd,
            })
        );
        failureTiming.subscriptionCreated = Boolean(
          createdFailureSubscription.id
        );
        const failureSubscription = await stripeCall(
          "create_failure_subscription",
          () => stripe.subscriptions.retrieve(createdFailureSubscription.id)
        );
        const failureTrialEndValue = failureSubscription.trial_end;
        failureTiming.subscriptionStatus = failureSubscription.status;
        failureTiming.trialEndPresent =
          typeof failureTrialEndValue === "number";
        failureTiming.trialEndAfterFrozenTime =
          typeof failureTrialEndValue === "number" &&
          failureTrialEndValue > failureClock.frozen_time;
        failureTiming.testClockAssociationPresent =
          failureTiming.testClockAssociationPresent &&
          m3StripeObjectId(failureSubscription.test_clock) === failureClock.id;
        if (
          !(
            failureTiming.subscriptionCreated &&
            failureSubscription.status === "trialing" &&
            failureTiming.trialEndPresent &&
            failureTiming.trialEndAfterFrozenTime &&
            failureTiming.testClockAssociationPresent
          )
        ) {
          const assertionError = new Error(
            "test_clock_failure_subscription_semantic_validation_failed"
          );
          Object.assign(assertionError, {
            diagnostic: {
              stage: "create_failure_subscription",
              classification: "TEST_HARNESS_DEFECT",
              ...failureTiming,
            } satisfies FailureTimingFailureDiagnostic,
          });
          throw assertionError;
        }
        if (typeof failureTrialEndValue !== "number") {
          throw new Error("Test Clock failure subscription trial_end missing");
        }
        const failureTrialEnd = failureTrialEndValue;

        const summarizeInvoice = (
          invoice: M3StripeInvoice,
          trialEnd: number
        ): FailureInvoiceSummary => ({
          status: invoice.status,
          paid: invoice.paid === true,
          amountDuePositive: invoice.amount_due > 0,
          billingReason: invoice.billing_reason,
          parentSubscriptionMatches:
            m3StripeObjectId(
              invoice.parent?.subscription_details?.subscription
            ) === failureSubscription.id,
          createdAfterTrialEnd: invoice.created >= trialEnd,
        });

        async function retrieveFailureInvoiceScopes(trialEnd: number) {
          const customerInvoices = await stripeCall("retrieve_invoice", () =>
            stripe.invoices.list({
              customer: failureCustomerRecord.id,
              limit: 100,
            })
          );
          const subscriptionInvoices = await stripeCall(
            "retrieve_invoice",
            () =>
              stripe.invoices.list({
                subscription: failureSubscription.id,
                limit: 100,
              })
          );
          const customerInvoiceData =
            customerInvoices.data as unknown as M3StripeInvoice[];
          const subscriptionInvoiceData =
            subscriptionInvoices.data as unknown as M3StripeInvoice[];
          failureTiming.customerScopedInvoiceCount = customerInvoiceData.length;
          failureTiming.subscriptionScopedInvoiceCount =
            subscriptionInvoiceData.length;
          const uniqueInvoices = new Map<string, M3StripeInvoice>();
          for (const invoice of [
            ...customerInvoiceData,
            ...subscriptionInvoiceData,
          ]) {
            uniqueInvoices.set(invoice.id, invoice);
          }
          const matchingInvoices = [...uniqueInvoices.values()].filter(
            (invoice) =>
              invoice.amount_due > 0 &&
              invoice.created >= trialEnd &&
              (m3StripeObjectId(invoice.subscription) ===
                failureSubscription.id ||
                m3StripeObjectId(
                  invoice.parent?.subscription_details?.subscription
                ) === failureSubscription.id)
          );
          failureTiming.matchingInvoices = matchingInvoices
            .slice(0, 20)
            .map((invoice) => summarizeInvoice(invoice, trialEnd));
          return matchingInvoices;
        }

        async function pollFailureInvoice(requireFinalized: boolean) {
          for (let attempt = 0; attempt < 15; attempt += 1) {
            const matchingInvoices =
              await retrieveFailureInvoiceScopes(failureTrialEnd);
            const candidate = matchingInvoices.find(
              (invoice) => !requireFinalized || invoice.status !== "draft"
            );
            if (candidate) {
              return candidate;
            }
            if (attempt < 14) {
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          }
          throw new Error(
            requireFinalized
              ? "Test Clock failure invoice did not finalize within bounded window"
              : "Test Clock failure invoice was not created within bounded window"
          );
        }

        await stripeCall("advance_to_renewal", () =>
          stripe.testHelpers.testClocks.advance(failureClock.id, {
            frozen_time: failureTrialEnd + 60,
          })
        );
        const postTrialClock = await waitForClockReady(failureClock.id);
        const postTrialSubscription = await stripeCall("retrieve_invoice", () =>
          stripe.subscriptions.retrieve(failureSubscription.id)
        );
        failureTiming.postTrialSubscriptionStatus =
          postTrialSubscription.status;
        failureTiming.trialEnded =
          postTrialClock.frozen_time >= failureTrialEnd &&
          postTrialSubscription.trial_end !== null &&
          postTrialSubscription.trial_end <= postTrialClock.frozen_time;
        let failureRenewal = await pollFailureInvoice(false);
        if (failureRenewal.status === "draft") {
          const finalizationFrozenTime =
            Math.max(postTrialClock.frozen_time, failureTrialEnd) + 60 * 60;
          await stripeCall("finalize_invoice_window", () =>
            stripe.testHelpers.testClocks.advance(failureClock.id, {
              frozen_time: finalizationFrozenTime,
            })
          );
          await waitForClockReady(failureClock.id);
          failureRenewal = await pollFailureInvoice(true);
        }
        const exactFailureInvoice = (await stripeCall("retrieve_invoice", () =>
          stripe.invoices.retrieve(failureRenewal.id, {
            expand: ["payment_intent"],
          })
        )) as unknown as M3StripeInvoice;
        const failureEvents = await stripeCall("retrieve_failure_event", () =>
          stripe.events.list({
            type: "invoice.payment_failed",
            created: { gte: failureTrialEnd },
            limit: 100,
          })
        );
        const paymentFailedEventObserved = failureEvents.data.some((event) => {
          const eventInvoice = event.data.object as {
            id?: unknown;
            customer?: unknown;
            subscription?: unknown;
            metadata?: unknown;
          };
          const eventMetadata =
            eventInvoice.metadata && typeof eventInvoice.metadata === "object"
              ? (eventInvoice.metadata as Record<string, unknown>)
              : {};
          return (
            eventInvoice.id === exactFailureInvoice.id &&
            (eventMetadata.immigration_ai_m3_run_id === runId ||
              m3StripeObjectId(eventInvoice.customer) ===
                failureCustomerRecord.id ||
              m3StripeObjectId(eventInvoice.subscription) ===
                failureSubscription.id)
          );
        });
        const failedInvoiceState =
          exactFailureInvoice.status === "open" &&
          exactFailureInvoice.paid === false &&
          exactFailureInvoice.attempted === true &&
          exactFailureInvoice.attempt_count !== undefined &&
          exactFailureInvoice.attempt_count > 0;
        check(
          paymentFailedEventObserved || failedInvoiceState,
          "Test Clock failure PaymentMethod did not produce an authoritative failed payment state"
        );
        return {
          status: "pass",
          providerFailureState:
            failedInvoiceState || paymentFailedEventObserved,
          paymentFailedEventObserved,
          failedInvoiceState,
          paidEntitlementNotExtended: "trial_scenario_no_prior_paid_period",
          invoiceTiming: failureTiming,
        };
      } catch (error) {
        return {
          status: "test_harness_defect",
          diagnostic: {
            ...diagnosticForFailure(error),
            ...failureTiming,
          },
          reason:
            "The documented failing PaymentMethod Test Clock scenario did not complete; inspect bounded invoice timing diagnostics",
        };
      } finally {
        if (failureCustomerId) {
          await cleanupCall(() =>
            stripe.customers.del(failureCustomerId as string)
          );
        }
        if (failureClockId) {
          await cleanupCall(() =>
            stripe.testHelpers.testClocks.del(failureClockId as string)
          );
        }
      }
    }

    paymentFailure = await runPaymentFailureScenario();
    failurePass = paymentFailure.status === "pass";

    const cancellationRequested = await stripeCall("cancel_at_period_end", () =>
      stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
      })
    );
    check(
      cancellationRequested.cancel_at_period_end === true,
      "Test Clock provider did not accept cancel_at_period_end"
    );
    await stripeCall("advance_to_end", () =>
      stripe.testHelpers.testClocks.advance(clock.id, {
        frozen_time: renewedItem.current_period_end + 60,
      })
    );
    await waitForClockReady(clock.id);
    let ended = await stripeCall("retrieve_invoice", () =>
      stripe.subscriptions.retrieve(subscription.id)
    );
    if (ended.status !== "canceled") {
      await stripeCall("advance_to_end", () =>
        stripe.testHelpers.testClocks.advance(clock.id, {
          frozen_time: renewedItem.current_period_end + 60 + 60 * 60,
        })
      );
      await waitForClockReady(clock.id);
      ended = await stripeCall("retrieve_invoice", () =>
        stripe.subscriptions.retrieve(subscription.id)
      );
    }
    check(
      ended.status === "canceled",
      "Test Clock subscription did not reach terminal cancellation"
    );
    cancellationPass = true;
    return {
      status: failurePass
        ? "pass"
        : paymentFailure.status === "test_harness_defect"
          ? "test_harness_defect"
          : "external_test_limitation",
      attempted: true,
      renewalPass,
      failurePass,
      cancellationPass,
      paymentFailure,
      reason: failurePass
        ? "Stripe Test Clock renewal, payment failure, and cancellation acceptance passed"
        : "payment-failure Test Clock acceptance did not pass; inspect paymentFailure diagnostics",
    };
  } catch (error) {
    const diagnostic = diagnosticForFailure(error);
    return {
      status: "partial",
      attempted: true,
      renewalPass,
      failurePass,
      cancellationPass,
      paymentFailure,
      diagnostic,
      reason: "required Test Clock acceptance did not pass",
    };
  } finally {
    if (customerId) {
      await cleanupCall(() => stripe.customers.del(customerId as string));
    }
    if (priceId) {
      await cleanupCall(() =>
        stripe.prices.update(priceId as string, { active: false })
      );
    }
    if (productId) {
      await cleanupCall(() =>
        stripe.products.update(productId as string, { active: false })
      );
    }
    if (clockId) {
      await cleanupCall(() =>
        stripe.testHelpers.testClocks.del(clockId as string)
      );
    }
    if (cleanupDiagnostics.length > 0) {
      console.error(
        JSON.stringify({ stripeTestClockCleanup: cleanupDiagnostics })
      );
    }
  }
}

function installServerOnlyShim() {
  const require = createRequire(import.meta.url);
  const modulePath = require.resolve("server-only");
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: {},
  } as never;
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds = 60_000
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("bounded_timeout")),
          milliseconds
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

const acceptanceModes = [
  "all",
  "deterministic",
  "postgres",
  "stripe-contract",
  "stripe-test-clock",
] as const;
type AcceptanceMode = (typeof acceptanceModes)[number];

function parseAcceptanceMode(args: string[]): AcceptanceMode | "help" {
  if (args.includes("--help") || args.includes("-h")) {
    return "help";
  }
  const modeIndex = args.indexOf("--mode");
  if (modeIndex === -1) {
    return "all";
  }
  const value = args[modeIndex + 1];
  if (!value || !acceptanceModes.includes(value as AcceptanceMode)) {
    throw new Error(
      `invalid --mode; expected one of ${acceptanceModes.join(", ")}`
    );
  }
  return value as AcceptanceMode;
}

function printAcceptanceHelp() {
  console.log(
    [
      "Usage: pnpm phase9:m3 -- --mode <mode>",
      "Modes: all, deterministic, postgres, stripe-contract, stripe-test-clock",
      "Options: --help, -h",
    ].join("\n")
  );
}

async function main() {
  config({ path: ".env.local" });
  installServerOnlyShim();
  const mode = parseAcceptanceMode(process.argv.slice(2));
  if (mode === "help") {
    printAcceptanceHelp();
    return;
  }
  const result: JsonRecord = { runId, startedAt, mode };
  if (["all", "deterministic"].includes(mode)) {
    result.deterministic = await withTimeout(deterministicCampaign());
  }
  if (["all", "postgres"].includes(mode)) {
    result.postgresConcurrency = await withTimeout(postgresCampaign());
  }
  if (["all", "stripe-contract"].includes(mode)) {
    result.stripeTestMode = await withTimeout(stripeContract());
  }
  if (["all", "stripe-test-clock"].includes(mode)) {
    result.stripeTestClock = await withTimeout(stripeTestClock());
  }
  const stripeBlocked = [result.stripeTestMode, result.stripeTestClock].some(
    (item) =>
      (item as JsonRecord | undefined)?.status === "blocked_by_test_credential"
  );
  const clock = result.stripeTestClock as JsonRecord | undefined;
  result.overall = m3AcceptanceOverall({
    stripeCredentialBlocked: stripeBlocked,
    stripeContractFailed:
      (result.stripeTestMode as JsonRecord | undefined)?.status === "fail",
    stripeTestClockAttempted: Boolean(clock?.attempted),
    renewalPass: clock?.renewalPass === true,
    failurePass: clock?.failurePass === true,
    cancellationPass: clock?.cancellationPass === true,
  });
  result.completedAt = new Date().toISOString();
  const artifactDirectory = "/tmp/immigration-ai-phase9-m3";
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    `${artifactDirectory}/phase9-m3-${runId}.json`,
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 }
  );
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const e = error as {
      name?: string;
      type?: string;
      code?: string;
      statusCode?: number;
      message?: string;
    };

    console.error(
      JSON.stringify(
        {
          error: "Phase 9 M3 acceptance failed in a bounded runner.",
          name: e?.name ?? null,
          type: e?.type ?? null,
          code: e?.code ?? null,
          httpStatus: e?.statusCode ?? null,
          message: e?.message ?? null,
        },
        null,
        2
      )
    );

    process.exit(1);
  });
