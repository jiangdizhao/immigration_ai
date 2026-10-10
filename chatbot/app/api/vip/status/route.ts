import {
  getActiveVipPlanPrice,
  getLiveVipSubscriptionForUser,
} from "@/lib/db/queries";
import { requireRegisteredUser } from "@/lib/vip/access";
import {
  getWechatVipPrice,
  WECHAT_VIP_CURRENCY,
  WECHAT_VIP_DURATION_DAYS,
} from "@/lib/vip/billing/china-payments";
import {
  describeVipBillingProvider,
  isStripeWebhookSecretConfigured,
} from "@/lib/vip/billing/config";
import { getVipProductConfig, isVipSimulationEnabled } from "@/lib/vip/config";
import { entitlementState } from "@/lib/vip/entitlement";

export async function GET() {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }

  const state = entitlementState(access.entitlement);
  const product = isVipSimulationEnabled() ? getVipProductConfig() : null;
  const billingProvider = describeVipBillingProvider();
  const wechatAmountMinor = getWechatVipPrice();
  const wechatAvailable =
    billingProvider.provider === "stripe" &&
    billingProvider.ready &&
    isStripeWebhookSecretConfigured() &&
    wechatAmountMinor !== null;
  const activePlan = await getActiveVipPlanPrice();
  const liveSubscription = await getLiveVipSubscriptionForUser(access.userId);

  return Response.json({
    role: access.entitlement.role,
    membershipTier: access.entitlement.membershipTier,
    vipExpiresAt: access.entitlement.vipExpiresAt,
    ...state,
    simulationEnabled: product !== null,
    product: product
      ? {
          amountMinor: product.amountMinor,
          currency: product.currency,
          durationDays: product.durationDays,
        }
      : null,
    // Safe recurring-billing state. No provider identifiers or secrets.
    billingProvider: {
      provider: billingProvider.provider,
      ready: billingProvider.ready,
    },
    activePlan: activePlan
      ? {
          amountMinor: activePlan.amountMinor,
          currency: activePlan.currency,
          interval: activePlan.billingInterval,
        }
      : null,
    subscription: liveSubscription
      ? {
          status: liveSubscription.status,
          currentPeriodEnd: liveSubscription.currentPeriodEnd,
          cancelAtPeriodEnd: liveSubscription.cancelAtPeriodEnd,
        }
      : null,
    chinaPayments: {
      // Alipay recurring is private-preview and remains unavailable until
      // Stripe grants access and the approved authorization flow is added.
      alipayRecurring: { available: false },
      wechatPrepaid: {
        available: wechatAvailable,
        amountMinor: wechatAvailable ? wechatAmountMinor : null,
        currency: WECHAT_VIP_CURRENCY,
        durationDays: WECHAT_VIP_DURATION_DAYS,
      },
    },
  });
}
