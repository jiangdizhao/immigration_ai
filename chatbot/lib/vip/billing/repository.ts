import "server-only";

import type { VipBillingWebhookRepository } from "./types";

// Postgres implementation of the webhook processing repository. All functions
// delegate to the transactional queries in lib/db/queries.ts.

import {
  applyVipCheckoutBinding,
  applyVipInvoicePaid,
  applyVipPaymentFailed,
  applyVipSubscriptionDeleted,
  applyVipSubscriptionStatusUpdate,
  claimVipBillingEvent,
  claimVipBillingNotification,
  getLiveVipSubscriptionForUser,
  getUserEmailById,
  getVipSubscriptionById,
  getVipSubscriptionByProviderSubscriptionId,
  incrementVipBillingEventAttempt,
  listVipBillingNotificationsForEvent,
  markVipBillingEventFailed,
  markVipBillingEventIgnored,
  markVipBillingEventProcessed,
  markVipBillingNotificationFailed,
  markVipBillingNotificationSent,
} from "@/lib/db/queries";

export function createPostgresVipBillingRepository(): VipBillingWebhookRepository {
  return {
    claimVipBillingEvent: (input) => claimVipBillingEvent(input),
    incrementVipBillingEventAttempt: (id) =>
      incrementVipBillingEventAttempt(id),
    markVipBillingEventProcessed: (id, token, now) =>
      markVipBillingEventProcessed(id, token, now),
    markVipBillingEventIgnored: (id, token, now) =>
      markVipBillingEventIgnored(id, token, now),
    markVipBillingEventFailed: (id, code, token, now) =>
      markVipBillingEventFailed(id, code, token, now),
    getVipSubscriptionById: (id) => getVipSubscriptionById(id),
    getLiveVipSubscriptionForUser: (userId) =>
      getLiveVipSubscriptionForUser(userId),
    getVipSubscriptionByProviderSubscriptionId: (input) =>
      getVipSubscriptionByProviderSubscriptionId(input),
    applyVipCheckoutBinding: (input) => applyVipCheckoutBinding(input),
    applyVipInvoicePaid: (input) => applyVipInvoicePaid(input),
    applyVipPaymentFailed: (input) => applyVipPaymentFailed(input),
    applyVipSubscriptionStatusUpdate: (input) =>
      applyVipSubscriptionStatusUpdate(input),
    applyVipSubscriptionDeleted: (input) => applyVipSubscriptionDeleted(input),
    listVipBillingNotificationsForEvent: (billingEventId) =>
      listVipBillingNotificationsForEvent(billingEventId),
    claimVipBillingNotification: (id, now) =>
      claimVipBillingNotification(id, now),
    markVipBillingNotificationSent: (id, token, now) =>
      markVipBillingNotificationSent(id, token, now),
    markVipBillingNotificationFailed: (id, code, token, now) =>
      markVipBillingNotificationFailed(id, code, token, now),
    getUserEmailById: (userId) => getUserEmailById(userId),
  };
}
