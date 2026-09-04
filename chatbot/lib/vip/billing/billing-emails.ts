import type { EmailMessage } from "@/lib/auth/email-templates";

import { formatMinorAmountAsAud } from "./money";
import type { VipBillingNotificationType } from "./webhook-events";

// Pure VIP billing email builders. Only safe, customer-facing content is
// included: event description, amount, currency, and the paid-through date.
// Never include Stripe identifiers, webhook IDs, secrets, or legal matter data.

function formatPaidThrough(periodEnd: Date | null): string {
  if (!periodEnd) {
    return "your current paid period";
  }
  return periodEnd.toISOString().slice(0, 10);
}

export function buildVipBillingEmail({
  to,
  notificationType,
  amountMinor,
  currency,
  periodEnd,
  vipUrl,
}: {
  to: string;
  notificationType: VipBillingNotificationType;
  amountMinor: number;
  currency: string;
  periodEnd: Date | null;
  vipUrl: string;
}): EmailMessage {
  if (currency !== "AUD") {
    throw new Error("Only AUD billing emails are supported.");
  }
  const amount = formatMinorAmountAsAud(amountMinor);
  const paidThrough = formatPaidThrough(periodEnd);
  const safeVipUrl = vipUrl;

  switch (notificationType) {
    case "vip_activated":
      return {
        to,
        subject: "Your VIP membership is active",
        text: `Your first VIP payment of ${amount} (AUD) was received. Your membership is now active and renews monthly until cancelled.\n\nManage your membership: ${safeVipUrl}`,
        html: `<p>Your first VIP payment of <strong>${amount}</strong> (AUD) was received.</p><p>Your membership is now active and renews monthly until cancelled.</p><p><a href="${safeVipUrl}">Manage your membership</a></p>`,
      };
    case "vip_renewal_paid":
      return {
        to,
        subject: "Your VIP membership renewed",
        text: `Your monthly VIP payment of ${amount} (AUD) was received. Your membership is paid through ${paidThrough}.\n\nManage your membership: ${safeVipUrl}`,
        html: `<p>Your monthly VIP payment of <strong>${amount}</strong> (AUD) was received.</p><p>Your membership is paid through <strong>${paidThrough}</strong>.</p><p><a href="${safeVipUrl}">Manage your membership</a></p>`,
      };
    case "vip_payment_failed":
      return {
        to,
        subject: "Action needed: your VIP payment failed",
        text: `We could not process your monthly VIP payment of ${amount} (AUD). Time you have already paid for remains available until ${paidThrough}. Please update your payment method to keep your VIP membership active.\n\nUpdate your billing details: ${safeVipUrl}`,
        html: `<p>We could not process your monthly VIP payment of <strong>${amount}</strong> (AUD).</p><p>Time you have already paid for remains available until <strong>${paidThrough}</strong>.</p><p>Please update your payment method to keep your VIP membership active.</p><p><a href="${safeVipUrl}">Update your billing details</a></p>`,
      };
    case "vip_cancellation_scheduled":
      return {
        to,
        subject: "Your VIP membership will not renew",
        text: `Your VIP membership renewal was cancelled. No further payments will be taken. Your membership remains active through ${paidThrough}.\n\nManage your membership: ${safeVipUrl}`,
        html: `<p>Your VIP membership renewal was cancelled. No further payments will be taken.</p><p>Your membership remains active through <strong>${paidThrough}</strong>.</p><p><a href="${safeVipUrl}">Manage your membership</a></p>`,
      };
    default: {
      const exhaustive: never = notificationType;
      throw new Error(
        `Unsupported billing notification: ${String(exhaustive)}`
      );
    }
  }
}
