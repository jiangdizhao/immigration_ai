// biome-ignore-all lint/suspicious/useAwait: test doubles intentionally return plain values as fake async methods.

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  VipBillingEvent,
  VipBillingNotification,
  VipSubscription,
} from "../../db/schema";
import type {
  StripeSubscriptionSnapshot,
  VipBillingMailer,
  VipBillingWebhookRepository,
} from "./types";
import { buildVipBillingMetadata } from "./webhook-events";
import {
  normalizeProviderSubscription,
  processVerifiedVipBillingEvent,
} from "./webhook-processing";

const SUB_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const PLAN_PRICE_ID = "33333333-3333-3333-3333-333333333333";
const CORRELATION = buildVipBillingMetadata({
  subscriptionId: SUB_ID,
  userId: USER_ID,
  planPriceId: PLAN_PRICE_ID,
});
const PROVIDER_SUB_ID = "sub_stripe_1";
const PERIOD_1_START = Date.UTC(2026, 0, 1) / 1000;
const PERIOD_1_END = Date.UTC(2026, 1, 1) / 1000;
const PERIOD_2_END = Date.UTC(2026, 2, 1) / 1000;

function makeSubscription(
  overrides: Partial<VipSubscription> = {}
): VipSubscription {
  return {
    id: SUB_ID,
    userId: USER_ID,
    planPriceId: PLAN_PRICE_ID,
    provider: "stripe",
    providerCustomerId: null,
    providerSubscriptionId: null,
    providerCheckoutSessionId: null,
    providerPriceId: null,
    amountMinor: 9900,
    currency: "AUD",
    status: "pending",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    endedAt: null,
    lastPaidInvoiceId: null,
    lastPaidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function snapshot(overrides: Partial<StripeSubscriptionSnapshot> = {}) {
  return {
    id: PROVIDER_SUB_ID,
    status: "active",
    customer: "cus_1",
    cancelAtPeriodEnd: false,
    canceledAt: null,
    currentPeriodStart: PERIOD_1_START,
    currentPeriodEnd: PERIOD_1_END,
    priceId: "price_stripe_1",
    metadata: CORRELATION,
    ...overrides,
  };
}

function eventFor(
  id: string,
  type: string,
  object: unknown
): { id: string; type: string; data: { object: unknown } } {
  return { id, type, data: { object } };
}

function checkoutCompletedEvent(id: string) {
  return eventFor(id, "checkout.session.completed", {
    id: "cs_1",
    mode: "subscription",
    subscription: PROVIDER_SUB_ID,
    metadata: CORRELATION,
  });
}

function invoicePaidEvent(id: string, invoiceId: string) {
  return eventFor(id, "invoice.paid", {
    id: invoiceId,
    currency: "aud",
    parent: {
      type: "subscription_details",
      subscription_details: {
        subscription: PROVIDER_SUB_ID,
        metadata: CORRELATION,
      },
    },
  });
}

function makeEnvironment(input: {
  subscription: VipSubscription;
  snapshot?: StripeSubscriptionSnapshot;
  mailFailures?: number;
}) {
  const events = new Map<string, VipBillingEvent>();
  const notifications: VipBillingNotification[] = [];
  const user = {
    id: USER_ID,
    email: "customer@example.com",
    membershipTier: "free",
    vipExpiresAt: null as Date | null,
  };
  const subscription = input.subscription;
  const mails: { to: string; notificationType: string }[] = [];
  let mailFailures = input.mailFailures ?? 0;
  let invoiceAppliedCount = 0;
  let eventCounter = 0;
  let notificationCounter = 0;

  function findEvent(id: string) {
    for (const event of events.values()) {
      if (event.id === id) {
        return event;
      }
    }
    return null;
  }

  function assertOwned(id: string, token: string) {
    const event = findEvent(id);
    if (
      event?.processingStatus !== "processing" ||
      event.processingToken !== token
    ) {
      throw new Error("event ownership assertion failed");
    }
  }

  function markEvent(
    billingEventId: string,
    status: VipBillingEvent["processingStatus"]
  ) {
    const event = findEvent(billingEventId);
    if (event) {
      event.processingStatus = status;
      if (status !== "processing") {
        event.processingToken = null;
        event.processingStartedAt = null;
      }
    }
  }

  function insertNotificationIfAbsent(
    billingEventId: string,
    notificationType: VipBillingNotification["notificationType"]
  ) {
    const existing = notifications.find(
      (row) =>
        row.billingEventId === billingEventId &&
        row.notificationType === notificationType
    );
    if (existing) {
      return { notification: existing, created: false };
    }
    notificationCounter += 1;
    const notification: VipBillingNotification = {
      id: `notif_${notificationCounter}`,
      billingEventId,
      userId: USER_ID,
      notificationType,
      deliveryStatus: "pending",
      deliveryToken: null,
      attemptCount: 0,
      lastErrorCode: null,
      sentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    notifications.push(notification);
    return { notification, created: true };
  }

  const repo = {
    async claimVipBillingEvent(claimInput: {
      provider: string;
      providerEventId: string;
      eventType: string;
      now?: Date;
    }) {
      const key = `${claimInput.provider}:${claimInput.providerEventId}`;
      const existing = events.get(key);
      if (existing) {
        const staleProcessing =
          existing.processingStatus === "processing" &&
          (!existing.processingStartedAt ||
            (claimInput.now ?? new Date()).getTime() -
              existing.processingStartedAt.getTime() >=
              5 * 60 * 1000);
        if (
          existing.processingStatus === "failed" ||
          existing.processingStatus === "received" ||
          staleProcessing
        ) {
          existing.processingStatus = "processing";
          existing.processingToken = `token_${++eventCounter}`;
          existing.processingStartedAt = claimInput.now ?? new Date();
          existing.attemptCount += 1;
          return { event: existing, claim: "existing" as const, owned: true };
        }
        return { event: existing, claim: "existing" as const, owned: false };
      }
      eventCounter += 1;
      const event: VipBillingEvent = {
        id: `evt_local_${eventCounter}`,
        provider: claimInput.provider,
        providerEventId: claimInput.providerEventId,
        eventType: claimInput.eventType,
        processingStatus: "processing",
        processingToken: `token_${eventCounter}`,
        processingStartedAt: claimInput.now ?? new Date(),
        attemptCount: 1,
        lastErrorCode: null,
        receivedAt: claimInput.now ?? new Date(),
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      events.set(key, event);
      return { event, claim: "new" as const, owned: true };
    },
    async incrementVipBillingEventAttempt(id: string) {
      const event = findEvent(id);
      if (event) {
        event.attemptCount += 1;
      }
    },
    async markVipBillingEventProcessed(id: string, token: string) {
      const event = findEvent(id);
      if (
        event?.processingStatus === "processing" &&
        event.processingToken === token
      ) {
        event.processingStatus = "processed";
        event.processingToken = null;
        event.processingStartedAt = null;
        return true;
      }
      return false;
    },
    async markVipBillingEventIgnored(id: string, token: string) {
      const event = findEvent(id);
      if (
        event?.processingStatus === "processing" &&
        event.processingToken === token
      ) {
        event.processingStatus = "ignored";
        event.processingToken = null;
        event.processingStartedAt = null;
        return true;
      }
      return false;
    },
    async markVipBillingEventFailed(id: string, code: string, token: string) {
      const event = findEvent(id);
      if (
        event?.processingStatus === "processing" &&
        event.processingToken === token
      ) {
        event.processingStatus = "failed";
        event.lastErrorCode = code;
        event.processingToken = null;
        event.processingStartedAt = null;
        return true;
      }
      return false;
    },
    async getVipSubscriptionById(id: string) {
      return subscription.id === id ? subscription : null;
    },
    async getLiveVipSubscriptionForUser(userId: string) {
      return subscription.userId === userId &&
        subscription.status !== "cancelled"
        ? subscription
        : null;
    },
    async getVipSubscriptionByProviderSubscriptionId(lookup: {
      provider: string;
      providerSubscriptionId: string;
    }) {
      return subscription.providerSubscriptionId ===
        lookup.providerSubscriptionId
        ? subscription
        : null;
    },
    async applyVipCheckoutBinding(binding: {
      billingEventId: string;
      processingToken: string;
      providerCheckoutSessionId: string;
      providerCustomerId: string | null;
      providerSubscriptionId: string | null;
      providerPriceId: string | null;
      status: VipSubscription["status"];
    }) {
      assertOwned(binding.billingEventId, binding.processingToken);
      subscription.providerCheckoutSessionId =
        binding.providerCheckoutSessionId;
      subscription.providerCustomerId = binding.providerCustomerId;
      subscription.providerSubscriptionId = binding.providerSubscriptionId;
      subscription.providerPriceId = binding.providerPriceId;
      subscription.status = binding.status;
      markEvent(binding.billingEventId, "processed");
      return subscription;
    },
    async applyVipInvoicePaid(
      paid: Parameters<VipBillingWebhookRepository["applyVipInvoicePaid"]>[0]
    ) {
      assertOwned(paid.billingEventId, paid.processingToken);
      invoiceAppliedCount += 1;
      if (subscription.lastPaidInvoiceId === paid.invoiceId) {
        markEvent(paid.billingEventId, "ignored");
        return { subscription, notification: null, duplicate: true };
      }
      const isFirstPaid =
        subscription.lastPaidInvoiceId === null &&
        subscription.lastPaidAt === null;
      subscription.status = paid.status;
      subscription.providerSubscriptionId = paid.providerSubscriptionId;
      subscription.currentPeriodStart = paid.currentPeriodStart;
      subscription.currentPeriodEnd = paid.currentPeriodEnd;
      subscription.providerCustomerId = paid.providerCustomerId;
      subscription.providerPriceId = paid.providerPriceId;
      subscription.cancelAtPeriodEnd = paid.cancelAtPeriodEnd;
      subscription.lastPaidInvoiceId = paid.invoiceId;
      subscription.lastPaidAt = paid.now ?? new Date();
      user.membershipTier = "vip";
      user.vipExpiresAt = paid.currentPeriodEnd;

      markEvent(paid.billingEventId, "processed");
      const created = insertNotificationIfAbsent(
        paid.billingEventId,
        isFirstPaid ? "vip_activated" : "vip_renewal_paid"
      );
      return {
        subscription,
        notification: created.notification,
        duplicate: false,
      };
    },
    async applyVipPaymentFailed(
      failed: Parameters<
        VipBillingWebhookRepository["applyVipPaymentFailed"]
      >[0]
    ) {
      assertOwned(failed.billingEventId, failed.processingToken);
      subscription.status = failed.status;
      subscription.providerCustomerId =
        failed.providerCustomerId ?? subscription.providerCustomerId;
      subscription.providerSubscriptionId = failed.providerSubscriptionId;
      if (failed.currentPeriodStart) {
        subscription.currentPeriodStart = failed.currentPeriodStart;
      }
      if (failed.currentPeriodEnd) {
        subscription.currentPeriodEnd = failed.currentPeriodEnd;
      }
      subscription.cancelAtPeriodEnd = failed.cancelAtPeriodEnd;
      markEvent(failed.billingEventId, "processed");
      const created = insertNotificationIfAbsent(
        failed.billingEventId,
        "vip_payment_failed"
      );
      return { subscription, notification: created.notification };
    },
    async applyVipSubscriptionStatusUpdate(
      updated: Parameters<
        VipBillingWebhookRepository["applyVipSubscriptionStatusUpdate"]
      >[0]
    ) {
      assertOwned(updated.billingEventId, updated.processingToken);
      const priorCancel = subscription.cancelAtPeriodEnd;
      subscription.status = updated.status;
      subscription.providerSubscriptionId = updated.providerSubscriptionId;
      subscription.providerCustomerId =
        updated.providerCustomerId ?? subscription.providerCustomerId;
      subscription.providerPriceId =
        updated.providerPriceId ?? subscription.providerPriceId;
      if (updated.currentPeriodStart) {
        subscription.currentPeriodStart = updated.currentPeriodStart;
      }
      if (updated.currentPeriodEnd) {
        subscription.currentPeriodEnd = updated.currentPeriodEnd;
      }
      subscription.cancelAtPeriodEnd = updated.cancelAtPeriodEnd;
      if (updated.canceledAt) {
        subscription.cancelledAt = updated.canceledAt;
      }
      markEvent(updated.billingEventId, "processed");
      let cancellationNotification: VipBillingNotification | null = null;
      if (!priorCancel && updated.cancelAtPeriodEnd) {
        const created = insertNotificationIfAbsent(
          updated.billingEventId,
          "vip_cancellation_scheduled"
        );
        cancellationNotification = created.notification;
      }
      return { subscription, cancellationNotification };
    },
    async applyVipSubscriptionDeleted(deleted: {
      billingEventId: string;
      processingToken: string;
      now?: Date;
    }) {
      assertOwned(deleted.billingEventId, deleted.processingToken);
      subscription.status = "cancelled";
      subscription.endedAt = deleted.now ?? new Date();
      subscription.cancelAtPeriodEnd = false;
      user.membershipTier = "free";
      user.vipExpiresAt = null;
      markEvent(deleted.billingEventId, "processed");
      return subscription;
    },
    async listVipBillingNotificationsForEvent(billingEventId: string) {
      return notifications.filter(
        (notification) => notification.billingEventId === billingEventId
      );
    },
    async claimVipBillingNotification(id: string, now = new Date()) {
      const notification = notifications.find((row) => row.id === id);
      if (!notification || notification.deliveryStatus === "sent") {
        return null;
      }
      if (
        notification.deliveryStatus === "sending" &&
        notification.updatedAt.getTime() > now.getTime() - 5 * 60 * 1000
      ) {
        return null;
      }
      notification.deliveryStatus = "sending";
      notification.attemptCount += 1;
      notification.deliveryToken = `delivery_${notification.id}_${notification.attemptCount}`;
      notification.updatedAt = now;
      return notification;
    },
    async markVipBillingNotificationSent(id: string, token: string) {
      const notification = notifications.find((row) => row.id === id);
      if (
        notification?.deliveryStatus === "sending" &&
        notification.deliveryToken === token
      ) {
        notification.deliveryStatus = "sent";
        notification.sentAt = new Date();
        notification.deliveryToken = null;
        return true;
      }
      return false;
    },
    async markVipBillingNotificationFailed(
      id: string,
      code: string,
      token: string
    ) {
      const notification = notifications.find((row) => row.id === id);
      if (
        notification?.deliveryStatus === "sending" &&
        notification.deliveryToken === token
      ) {
        notification.deliveryStatus = "failed";
        notification.lastErrorCode = code;
        notification.deliveryToken = null;
        return true;
      }
      return false;
    },
    async getUserEmailById(userId: string) {
      return user.id === userId ? user.email : null;
    },
  } as unknown as VipBillingWebhookRepository;

  const mailer: VipBillingMailer = {
    async send(mailInput) {
      if (mailFailures > 0) {
        mailFailures -= 1;
        throw new Error("ses unavailable");
      }
      mails.push({
        to: mailInput.to,
        notificationType: mailInput.notificationType,
      });
    },
  };

  return {
    repo,
    mailer,
    mails,
    notifications,
    user,
    subscription,
    snapshot: input.snapshot ?? snapshot(),
    setMailFailures: (count: number) => {
      mailFailures = count;
    },
    getInvoiceAppliedCount: () => invoiceAppliedCount,
    getEventByProviderEventId: (providerEventId: string) =>
      events.get(`stripe:${providerEventId}`) ?? null,
  };
}

function processingDeps(env: ReturnType<typeof makeEnvironment>) {
  return {
    repo: env.repo,
    provider: {
      retrieveSubscription: async () => env.snapshot,
    },
    mailer: env.mailer,
  };
}

function invoicePaymentFailedEvent(id: string, invoiceId: string) {
  return eventFor(id, "invoice.payment_failed", {
    id: invoiceId,
    currency: "aud",
    parent: {
      type: "subscription_details",
      subscription_details: {
        subscription: PROVIDER_SUB_ID,
        metadata: CORRELATION,
      },
    },
  });
}

function subscriptionUpdatedEvent(id: string) {
  return eventFor(id, "customer.subscription.updated", {
    id: PROVIDER_SUB_ID,
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: false,
    canceled_at: null,
    items: {
      data: [
        {
          current_period_start: PERIOD_1_START,
          current_period_end: PERIOD_1_END,
          price: { id: "price_stripe_1" },
        },
      ],
    },
    metadata: CORRELATION,
  });
}

test("checkout.session.completed binds provider identity but never grants VIP", async () => {
  const env = makeEnvironment({ subscription: makeSubscription() });
  const outcome = await processVerifiedVipBillingEvent(
    checkoutCompletedEvent("evt_ck_1"),
    processingDeps(env)
  );

  assert.deepEqual(outcome, { status: "processed", retryable: false });
  assert.equal(env.subscription.providerSubscriptionId, PROVIDER_SUB_ID);
  assert.equal(env.subscription.providerCustomerId, "cus_1");
  assert.equal(env.subscription.status, "active");
  assert.equal(env.subscription.providerPriceId, "price_stripe_1");
  // Browser success is NOT payment evidence: no entitlement projection.
  assert.equal(env.user.membershipTier, "free");
  assert.equal(env.user.vipExpiresAt, null);
  assert.equal(env.mails.length, 0);
});

test("first invoice.paid activates VIP to the trusted provider period end", async () => {
  const env = makeEnvironment({
    subscription: makeSubscription({
      providerSubscriptionId: PROVIDER_SUB_ID,
      providerCustomerId: "cus_1",
      providerPriceId: "price_stripe_1",
      status: "incomplete",
    }),
  });
  const outcome = await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_paid_1", "in_1"),
    processingDeps(env)
  );

  assert.deepEqual(outcome, { status: "processed", retryable: false });
  assert.equal(env.user.membershipTier, "vip");
  assert.deepEqual(
    env.user.vipExpiresAt,
    new Date(PERIOD_1_END * 1000),
    "vipExpiresAt comes from the provider paid period, not now+30d"
  );
  assert.equal(env.subscription.status, "active");
  assert.equal(env.subscription.lastPaidInvoiceId, "in_1");
  const activation = env.notifications.filter(
    (row) => row.notificationType === "vip_activated"
  );
  assert.equal(activation.length, 1);
  assert.equal(env.mails.length, 1);
  assert.equal(env.mails[0]?.notificationType, "vip_activated");
});

test("renewal invoice.paid extends entitlement exactly to the new provider period", async () => {
  const env = makeEnvironment({
    subscription: makeSubscription({
      providerSubscriptionId: PROVIDER_SUB_ID,
      providerCustomerId: "cus_1",
      providerPriceId: "price_stripe_1",
      status: "active",
      lastPaidInvoiceId: "in_1",
      lastPaidAt: new Date(PERIOD_1_START * 1000),
      currentPeriodStart: new Date(PERIOD_1_START * 1000),
      currentPeriodEnd: new Date(PERIOD_1_END * 1000),
    }),
  });
  env.user.membershipTier = "vip";
  env.user.vipExpiresAt = new Date(PERIOD_1_END * 1000);

  const outcome = await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_paid_2", "in_2"),
    {
      repo: env.repo,
      provider: {
        retrieveSubscription: async () =>
          snapshot({ currentPeriodEnd: PERIOD_2_END }),
      },
      mailer: env.mailer,
    }
  );

  assert.deepEqual(outcome, { status: "processed", retryable: false });
  assert.deepEqual(env.user.vipExpiresAt, new Date(PERIOD_2_END * 1000));
  const renewals = env.notifications.filter(
    (row) => row.notificationType === "vip_renewal_paid"
  );
  assert.equal(renewals.length, 1);
  assert.equal(env.mails.length, 1);
});

test("duplicate invoice.paid event delivery does not double-apply or double-notify", async () => {
  const env = makeEnvironment({
    subscription: makeSubscription({
      providerSubscriptionId: PROVIDER_SUB_ID,
      providerCustomerId: "cus_1",
      providerPriceId: "price_stripe_1",
      status: "active",
    }),
  });
  const deps = processingDeps(env);
  await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_paid_dup", "in_1"),
    deps
  );
  const expiryAfterFirst = env.user.vipExpiresAt;

  // Stripe redelivers the SAME event id: no reapplication, only notification retry.
  const redelivered = await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_paid_dup", "in_1"),
    deps
  );
  assert.deepEqual(redelivered, { status: "processed", retryable: false });
  assert.deepEqual(env.user.vipExpiresAt, expiryAfterFirst);
  assert.equal(env.notifications.length, 1);
  assert.equal(env.mails.length, 1);

  // A different event id for the SAME invoice is a duplicate application:
  // recorded as ignored, no second notification, no second email.
  const duplicateInvoice = await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_paid_dup_other", "in_1"),
    deps
  );
  assert.deepEqual(duplicateInvoice, { status: "ignored", retryable: false });
  assert.deepEqual(env.user.vipExpiresAt, expiryAfterFirst);
  assert.equal(env.notifications.length, 1);
  assert.equal(env.mails.length, 1);
});

test("payment failure synchronizes state without extending paid entitlement", async () => {
  const env = makeEnvironment({
    subscription: makeSubscription({
      providerSubscriptionId: PROVIDER_SUB_ID,
      providerCustomerId: "cus_1",
      providerPriceId: "price_stripe_1",
      status: "active",
      lastPaidInvoiceId: "in_1",
      lastPaidAt: new Date(PERIOD_1_START * 1000),
      currentPeriodEnd: new Date(PERIOD_1_END * 1000),
    }),
  });
  env.user.membershipTier = "vip";
  env.user.vipExpiresAt = new Date(PERIOD_1_END * 1000);

  const outcome = await processVerifiedVipBillingEvent(
    invoicePaymentFailedEvent("evt_failed_1", "in_2"),
    {
      repo: env.repo,
      provider: {
        retrieveSubscription: async () => snapshot({ status: "past_due" }),
      },
      mailer: env.mailer,
    }
  );

  assert.deepEqual(outcome, { status: "processed", retryable: false });
  assert.equal(env.subscription.status, "past_due");
  // Existing paid-through access remains untouched.
  assert.equal(env.user.membershipTier, "vip");
  assert.deepEqual(env.user.vipExpiresAt, new Date(PERIOD_1_END * 1000));
  assert.equal(
    env.notifications.filter(
      (row) => row.notificationType === "vip_payment_failed"
    ).length,
    1
  );
  assert.equal(env.mails.length, 1);
});

test("subscription.updated schedules cancellation once and never activates VIP", async () => {
  const env = makeEnvironment({
    subscription: makeSubscription({
      providerSubscriptionId: PROVIDER_SUB_ID,
      providerCustomerId: "cus_1",
      providerPriceId: "price_stripe_1",
      status: "active",
    }),
  });

  const updatedEvent = eventFor("evt_upd_1", "customer.subscription.updated", {
    id: PROVIDER_SUB_ID,
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: true,
    canceled_at: 1_767_225_700,
    items: {
      data: [
        {
          current_period_start: PERIOD_1_START,
          current_period_end: PERIOD_1_END,
          price: { id: "price_stripe_1" },
        },
      ],
    },
    metadata: CORRELATION,
  });

  const outcome = await processVerifiedVipBillingEvent(
    updatedEvent,
    processingDeps(env)
  );
  assert.deepEqual(outcome, { status: "processed", retryable: false });
  assert.equal(env.subscription.cancelAtPeriodEnd, true);
  // A subscription update alone cannot activate a never-paid account.
  assert.equal(env.user.membershipTier, "free");
  assert.equal(env.user.vipExpiresAt, null);
  const cancellations = env.notifications.filter(
    (row) => row.notificationType === "vip_cancellation_scheduled"
  );
  assert.equal(cancellations.length, 1);
  assert.equal(env.mails.length, 1);

  // Same event redelivered: cancellation email is not sent twice.
  await processVerifiedVipBillingEvent(updatedEvent, processingDeps(env));
  assert.equal(env.notifications.length, 1);
  assert.equal(env.mails.length, 1);
});

test("subscription.deleted terminates the subscription and closes entitlement", async () => {
  const env = makeEnvironment({
    subscription: makeSubscription({
      providerSubscriptionId: PROVIDER_SUB_ID,
      providerCustomerId: "cus_1",
      providerPriceId: "price_stripe_1",
      status: "active",
      cancelAtPeriodEnd: true,
      lastPaidInvoiceId: "in_1",
      lastPaidAt: new Date(PERIOD_1_START * 1000),
      currentPeriodEnd: new Date(PERIOD_1_END * 1000),
    }),
  });
  env.user.membershipTier = "vip";
  env.user.vipExpiresAt = new Date(PERIOD_1_END * 1000);

  const outcome = await processVerifiedVipBillingEvent(
    eventFor("evt_del_1", "customer.subscription.deleted", {
      id: PROVIDER_SUB_ID,
      status: "canceled",
      customer: "cus_1",
      cancel_at_period_end: false,
      canceled_at: PERIOD_1_END,
      items: { data: [] },
      metadata: CORRELATION,
    }),
    processingDeps(env)
  );

  assert.deepEqual(outcome, { status: "processed", retryable: false });
  assert.equal(env.subscription.status, "cancelled");
  assert.equal(env.subscription.endedAt instanceof Date, true);
  assert.equal(env.user.membershipTier, "free");
  assert.equal(env.user.vipExpiresAt, null);
});

test("email failure retries the notification only on duplicate delivery", async () => {
  const env = makeEnvironment({
    subscription: makeSubscription({
      providerSubscriptionId: PROVIDER_SUB_ID,
      providerCustomerId: "cus_1",
      providerPriceId: "price_stripe_1",
      status: "incomplete",
    }),
    mailFailures: 1,
  });
  const outcome = await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_mail_1", "in_1"),
    processingDeps(env)
  );

  // Billing mutation and entitlement applied exactly once despite email failure.
  assert.deepEqual(outcome, { status: "processed", retryable: false });
  assert.equal(env.user.membershipTier, "vip");
  assert.equal(env.mails.length, 0);
  assert.equal(env.notifications[0]?.deliveryStatus, "failed");
  assert.equal(env.notifications[0]?.lastErrorCode, "delivery_failed");
  const appliedAfterFirst = env.getInvoiceAppliedCount();
  const expiryAfterFirst = env.user.vipExpiresAt;

  // Event retry with mail recovered: notification sent, billing NOT replayed.
  env.setMailFailures(0);
  const retried = await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_mail_1", "in_1"),
    processingDeps(env)
  );
  assert.deepEqual(retried, { status: "processed", retryable: false });
  assert.equal(env.mails.length, 1);
  assert.equal(env.notifications[0]?.deliveryStatus, "sent");
  assert.deepEqual(env.user.vipExpiresAt, expiryAfterFirst);
  assert.equal(env.getInvoiceAppliedCount(), appliedAfterFirst);
});

test("correlation mismatches fail closed without mutating anything", async () => {
  // Unknown local subscription.
  const unknownEnv = makeEnvironment({ subscription: makeSubscription() });
  unknownEnv.snapshot = snapshot({
    metadata: buildVipBillingMetadata({
      subscriptionId: "99999999-9999-9999-9999-999999999999",
      userId: USER_ID,
      planPriceId: PLAN_PRICE_ID,
    }),
  });
  const unknownOutcome = await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_sec_1", "in_sec"),
    processingDeps(unknownEnv)
  );
  assert.deepEqual(unknownOutcome, { status: "failed", retryable: false });
  assert.equal(unknownEnv.user.membershipTier, "free");
  assert.equal(unknownEnv.getInvoiceAppliedCount(), 0);

  // Provider price mismatch on the subscription.
  const priceEnv = makeEnvironment({
    subscription: makeSubscription({
      providerSubscriptionId: PROVIDER_SUB_ID,
      providerCustomerId: "cus_1",
      providerPriceId: "price_stripe_1",
      status: "active",
    }),
  });
  const priceOutcome = await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_sec_2", "in_sec"),
    {
      repo: priceEnv.repo,
      provider: {
        retrieveSubscription: async () =>
          snapshot({ priceId: "price_stripe_OTHER" }),
      },
      mailer: priceEnv.mailer,
    }
  );
  assert.deepEqual(priceOutcome, { status: "failed", retryable: false });
  assert.equal(priceEnv.user.membershipTier, "free");

  // Invoice metadata does not correlate to the local subscription.
  const metadataEnv = makeEnvironment({
    subscription: makeSubscription({
      providerSubscriptionId: PROVIDER_SUB_ID,
      providerCustomerId: "cus_1",
      status: "active",
    }),
  });
  const metadataOutcome = await processVerifiedVipBillingEvent(
    eventFor("evt_sec_3", "invoice.paid", {
      id: "in_sec",
      currency: "aud",
      parent: {
        type: "subscription_details",
        subscription_details: {
          subscription: PROVIDER_SUB_ID,
          metadata: buildVipBillingMetadata({
            subscriptionId: "88888888-8888-8888-8888-888888888888",
            userId: USER_ID,
            planPriceId: PLAN_PRICE_ID,
          }),
        },
      },
    }),
    processingDeps(metadataEnv)
  );
  assert.deepEqual(metadataOutcome, { status: "failed", retryable: false });
  assert.equal(metadataEnv.user.membershipTier, "free");
});

test("paid invoice on a non-active provider subscription does not grant VIP", async () => {
  const env = makeEnvironment({
    subscription: makeSubscription({
      providerSubscriptionId: PROVIDER_SUB_ID,
      providerCustomerId: "cus_1",
      status: "active",
    }),
  });
  const outcome = await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_inactive", "in_inactive"),
    {
      repo: env.repo,
      provider: {
        retrieveSubscription: async () => snapshot({ status: "canceled" }),
      },
      mailer: env.mailer,
    }
  );
  assert.deepEqual(outcome, { status: "failed", retryable: false });
  assert.equal(env.user.membershipTier, "free");
});

test("unknown event types are recorded as ignored and return success", async () => {
  const env = makeEnvironment({ subscription: makeSubscription() });
  const outcome = await processVerifiedVipBillingEvent(
    eventFor("evt_unknown", "invoice.created", { id: "in_x" }),
    processingDeps(env)
  );
  assert.deepEqual(outcome, { status: "ignored", retryable: false });
  assert.equal(env.user.membershipTier, "free");
});

test("normalizeProviderSubscription reads period fields from subscription items", () => {
  const normalized = normalizeProviderSubscription({
    id: PROVIDER_SUB_ID,
    status: "active",
    customer: { id: "cus_obj" },
    cancel_at_period_end: true,
    canceled_at: 123,
    items: {
      data: [
        {
          current_period_start: PERIOD_1_START,
          current_period_end: PERIOD_1_END,
          price: { id: "price_stripe_1" },
        },
      ],
    },
    metadata: CORRELATION,
  });
  assert.deepEqual(normalized, {
    id: PROVIDER_SUB_ID,
    status: "active",
    customer: "cus_obj",
    cancelAtPeriodEnd: true,
    canceledAt: 123,
    currentPeriodStart: PERIOD_1_START,
    currentPeriodEnd: PERIOD_1_END,
    priceId: "price_stripe_1",
    metadata: CORRELATION,
  });
  assert.equal(normalizeProviderSubscription(null), null);
  assert.equal(normalizeProviderSubscription({ status: "active" }), null);
});

test("concurrent delivery gives one worker the event processing lease", async () => {
  const env = makeEnvironment({ subscription: makeSubscription() });
  let releaseProvider!: () => void;
  let providerStarted!: () => void;
  const providerReady = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });
  const providerRelease = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  const deps = {
    repo: env.repo,
    provider: {
      retrieveSubscription: async () => {
        providerStarted();
        await providerRelease;
        return env.snapshot;
      },
    },
    mailer: env.mailer,
  };

  const first = processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_race", "in_race"),
    deps
  );
  await providerReady;
  const second = await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_race", "in_race"),
    deps
  );
  releaseProvider();
  const firstOutcome = await first;

  assert.deepEqual(firstOutcome, { status: "processed", retryable: false });
  assert.deepEqual(second, { status: "failed", retryable: true });
  assert.equal(env.getInvoiceAppliedCount(), 1);
  assert.equal(env.notifications.length, 1);
  assert.equal(env.mails.length, 1);
});

test("stale event owner cannot overwrite a terminal event", async () => {
  const env = makeEnvironment({ subscription: makeSubscription() });
  const claim = await env.repo.claimVipBillingEvent({
    provider: "stripe",
    providerEventId: "evt_stale_owner",
    eventType: "invoice.paid",
  });
  assert.ok(claim?.event.processingToken);
  const token = claim.event.processingToken as string;

  assert.equal(
    await env.repo.markVipBillingEventProcessed(claim.event.id, token),
    true
  );
  assert.equal(
    await env.repo.markVipBillingEventFailed(
      claim.event.id,
      "stale_worker",
      token
    ),
    false
  );
  assert.equal(claim.event.processingStatus, "processed");
});

test("fresh and stale event leases have exclusive reclaim semantics", async () => {
  const env = makeEnvironment({ subscription: makeSubscription() });
  const first = await env.repo.claimVipBillingEvent({
    provider: "stripe",
    providerEventId: "evt_lease",
    eventType: "checkout.session.completed",
    now: new Date(100_000),
  });
  assert.ok(first?.event.processingToken);
  const firstToken = first.event.processingToken as string;

  const fresh = await env.repo.claimVipBillingEvent({
    provider: "stripe",
    providerEventId: "evt_lease",
    eventType: "checkout.session.completed",
    now: new Date(100_001),
  });
  assert.equal(fresh?.owned, false);

  const stored = env.getEventByProviderEventId("evt_lease");
  assert.ok(stored);
  stored.processingStartedAt = new Date(0);
  const reclaimed = await env.repo.claimVipBillingEvent({
    provider: "stripe",
    providerEventId: "evt_lease",
    eventType: "checkout.session.completed",
    now: new Date(5 * 60 * 1000),
  });
  assert.equal(reclaimed?.owned, true);
  assert.notEqual(reclaimed?.event.processingToken, firstToken);

  await assert.rejects(() =>
    env.repo.applyVipCheckoutBinding({
      billingEventId: reclaimed?.event.id ?? "",
      processingToken: firstToken,
      subscriptionId: SUB_ID,
      providerCheckoutSessionId: "cs_stale",
      providerCustomerId: "cus_stale",
      providerSubscriptionId: PROVIDER_SUB_ID,
      providerPriceId: "price_stripe_1",
      status: "active",
    })
  );
  assert.equal(env.subscription.providerSubscriptionId, null);
});

test("failed event delivery is reclaimable by one retry", async () => {
  const env = makeEnvironment({ subscription: makeSubscription() });
  const first = await env.repo.claimVipBillingEvent({
    provider: "stripe",
    providerEventId: "evt_failed_retry",
    eventType: "invoice.paid",
  });
  assert.ok(first?.event.processingToken);
  const token = first.event.processingToken as string;
  assert.equal(
    await env.repo.markVipBillingEventFailed(
      first.event.id,
      "temporary_failure",
      token
    ),
    true
  );

  const retry = await env.repo.claimVipBillingEvent({
    provider: "stripe",
    providerEventId: "evt_failed_retry",
    eventType: "invoice.paid",
  });
  assert.equal(retry?.owned, true);
  assert.notEqual(retry?.event.processingToken, token);
});

test("concurrent notification delivery claims send exactly once", async () => {
  const env = makeEnvironment({
    subscription: makeSubscription({
      providerSubscriptionId: PROVIDER_SUB_ID,
      providerCustomerId: "cus_1",
      providerPriceId: "price_stripe_1",
      status: "incomplete",
    }),
  });
  let releaseMail!: () => void;
  let mailStarted!: () => void;
  const mailReady = new Promise<void>((resolve) => {
    mailStarted = resolve;
  });
  const mailRelease = new Promise<void>((resolve) => {
    releaseMail = resolve;
  });
  env.mailer.send = async (input) => {
    mailStarted();
    await mailRelease;
    env.mails.push({ to: input.to, notificationType: input.notificationType });
  };

  const deps = processingDeps(env);
  const first = processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_mail_race", "in_mail_race"),
    deps
  );
  await mailReady;
  const second = await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_mail_race", "in_mail_race"),
    deps
  );
  releaseMail();
  const firstOutcome = await first;

  assert.deepEqual(firstOutcome, { status: "processed", retryable: false });
  assert.deepEqual(second, { status: "processed", retryable: false });
  assert.equal(env.mails.length, 1);
  assert.equal(env.notifications[0]?.deliveryStatus, "sent");
});

test("fresh notification lease blocks a send and stale lease can be reclaimed", async () => {
  const env = makeEnvironment({ subscription: makeSubscription() });
  const event = await env.repo.claimVipBillingEvent({
    provider: "stripe",
    providerEventId: "evt_notification_lease",
    eventType: "invoice.paid",
  });
  assert.ok(event);
  const notification = {
    id: "notif_manual",
    billingEventId: event.event.id,
    userId: USER_ID,
    notificationType: "vip_activated" as const,
    deliveryStatus: "pending" as const,
    deliveryToken: null,
    attemptCount: 0,
    lastErrorCode: null,
    sentAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } satisfies VipBillingNotification;
  env.notifications.push(notification);

  const first = await env.repo.claimVipBillingNotification(
    notification.id,
    new Date(100_000)
  );
  assert.ok(first?.deliveryToken);
  const firstToken = first.deliveryToken;
  const fresh = await env.repo.claimVipBillingNotification(
    notification.id,
    new Date(100_001)
  );
  assert.equal(fresh, null);
  const stale = await env.repo.claimVipBillingNotification(
    notification.id,
    new Date(100_000 + 5 * 60 * 1000)
  );
  assert.ok(stale?.deliveryToken);
  assert.notEqual(stale?.deliveryToken, firstToken);
});

test("invoice.paid can bind exact metadata before checkout completion", async () => {
  const env = makeEnvironment({ subscription: makeSubscription() });
  const paid = await processVerifiedVipBillingEvent(
    invoicePaidEvent("evt_invoice_first", "in_invoice_first"),
    processingDeps(env)
  );
  const checkout = await processVerifiedVipBillingEvent(
    checkoutCompletedEvent("evt_checkout_later"),
    processingDeps(env)
  );

  assert.deepEqual(paid, { status: "processed", retryable: false });
  assert.deepEqual(checkout, { status: "processed", retryable: false });
  assert.equal(env.subscription.providerSubscriptionId, PROVIDER_SUB_ID);
  assert.equal(env.subscription.status, "active");
  assert.equal(env.user.membershipTier, "vip");
  assert.equal(env.notifications.length, 1);
  assert.equal(env.mails.length, 1);
});

test("subscription.updated can bind exact metadata before checkout without granting VIP", async () => {
  const env = makeEnvironment({ subscription: makeSubscription() });
  const updated = await processVerifiedVipBillingEvent(
    subscriptionUpdatedEvent("evt_update_first"),
    processingDeps(env)
  );
  const checkout = await processVerifiedVipBillingEvent(
    checkoutCompletedEvent("evt_checkout_after_update"),
    processingDeps(env)
  );

  assert.deepEqual(updated, { status: "processed", retryable: false });
  assert.deepEqual(checkout, { status: "processed", retryable: false });
  assert.equal(env.subscription.providerSubscriptionId, PROVIDER_SUB_ID);
  assert.equal(env.subscription.status, "active");
  assert.equal(env.user.membershipTier, "free");
  assert.equal(env.notifications.length, 0);
  assert.equal(env.mails.length, 0);
});
