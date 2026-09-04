import type {
  VipBillingEvent,
  VipBillingNotification,
  VipPlanPrice,
  VipSubscription,
} from "@/lib/db/schema";
import type { VipBillingNotificationType } from "./webhook-events";

// Shared dependency-injection shapes for the Phase 9 M2 Stripe billing
// lifecycle. Concrete Postgres/Stripe/SES implementations live in server-only
// modules; unit tests inject fakes so no database, Stripe network, or SES
// network is ever required.

export type VipPlanPriceRow = VipPlanPrice;
export type VipSubscriptionRow = VipSubscription;
export type VipBillingEventRow = VipBillingEvent;
export type VipBillingNotificationRow = VipBillingNotification;

export type StripeSubscriptionSnapshot = {
  id: string;
  status: string;
  customer: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: number | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  priceId: string | null;
  metadata: Record<string, string | null | undefined>;
};

export interface VipBillingProviderGateway {
  createProduct(input: {
    name: string;
    idempotencyKey: string;
  }): Promise<{ id: string }>;
  createPrice(input: {
    product: string;
    currency: "aud";
    unitAmount: number;
    idempotencyKey: string;
  }): Promise<{ id: string }>;
  createCheckoutSession(input: {
    priceId: string;
    clientReferenceId: string;
    metadata: Record<string, string>;
    subscriptionMetadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<{ id: string; url: string | null }>;
  retrieveSubscription(
    subscriptionId: string
  ): Promise<StripeSubscriptionSnapshot>;
  requestCancelAtPeriodEnd(
    subscriptionId: string
  ): Promise<StripeSubscriptionSnapshot>;
  createPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
}

export interface VipBillingWebhookRepository {
  claimVipBillingEvent(input: {
    provider: string;
    providerEventId: string;
    eventType: string;
    now?: Date;
  }): Promise<{
    event: VipBillingEventRow;
    claim: "new" | "existing";
    owned: boolean;
  } | null>;
  incrementVipBillingEventAttempt(id: string): Promise<void>;
  markVipBillingEventProcessed(
    id: string,
    processingToken: string,
    now?: Date
  ): Promise<boolean>;
  markVipBillingEventIgnored(
    id: string,
    processingToken: string,
    now?: Date
  ): Promise<boolean>;
  markVipBillingEventFailed(
    id: string,
    lastErrorCode: string,
    processingToken: string,
    now?: Date
  ): Promise<boolean>;
  getVipSubscriptionById(id: string): Promise<VipSubscriptionRow | null>;
  getLiveVipSubscriptionForUser(
    userId: string
  ): Promise<VipSubscriptionRow | null>;
  getVipSubscriptionByProviderSubscriptionId(input: {
    provider: string;
    providerSubscriptionId: string;
  }): Promise<VipSubscriptionRow | null>;
  applyVipCheckoutBinding(input: {
    billingEventId: string;
    processingToken: string;
    subscriptionId: string;
    providerCheckoutSessionId: string;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    providerPriceId: string | null;
    status: VipSubscription["status"];
    now?: Date;
  }): Promise<VipSubscriptionRow | null>;
  applyVipInvoicePaid(input: {
    billingEventId: string;
    processingToken: string;
    subscriptionId: string;
    providerSubscriptionId: string;
    invoiceId: string;
    status: VipSubscription["status"];
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    providerCustomerId: string | null;
    providerPriceId: string | null;
    cancelAtPeriodEnd: boolean;
    now?: Date;
  }): Promise<{
    subscription: VipSubscriptionRow | null;
    notification: VipBillingNotificationRow | null;
    duplicate: boolean;
  }>;
  applyVipPaymentFailed(input: {
    billingEventId: string;
    processingToken: string;
    subscriptionId: string;
    providerSubscriptionId: string;
    status: VipSubscription["status"];
    providerCustomerId: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    now?: Date;
  }): Promise<{
    subscription: VipSubscriptionRow | null;
    notification: VipBillingNotificationRow | null;
  }>;
  applyVipSubscriptionStatusUpdate(input: {
    billingEventId: string;
    processingToken: string;
    subscriptionId: string;
    providerSubscriptionId: string;
    providerCustomerId: string | null;
    providerPriceId: string | null;
    status: VipSubscription["status"];
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: Date | null;
    now?: Date;
  }): Promise<{
    subscription: VipSubscriptionRow | null;
    cancellationNotification: VipBillingNotificationRow | null;
  }>;
  applyVipSubscriptionDeleted(input: {
    billingEventId: string;
    processingToken: string;
    subscriptionId: string;
    canceledAt: Date | null;
    now?: Date;
  }): Promise<VipSubscriptionRow | null>;
  listVipBillingNotificationsForEvent(
    billingEventId: string
  ): Promise<VipBillingNotificationRow[]>;
  claimVipBillingNotification(
    id: string,
    now?: Date
  ): Promise<VipBillingNotificationRow | null>;
  markVipBillingNotificationSent(
    id: string,
    deliveryToken: string,
    now?: Date
  ): Promise<boolean>;
  markVipBillingNotificationFailed(
    id: string,
    lastErrorCode: string,
    deliveryToken: string,
    now?: Date
  ): Promise<boolean>;
  getUserEmailById(userId: string): Promise<string | null>;
}

export type VipBillingMailInput = {
  to: string;
  notificationType: VipBillingNotificationType;
  amountMinor: number;
  currency: string;
  periodEnd: Date | null;
};

export interface VipBillingMailer {
  send(input: VipBillingMailInput): Promise<void>;
}
