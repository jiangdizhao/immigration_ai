import { randomUUID } from "node:crypto";
import { getValidatedAppBaseUrl } from "@/lib/auth/email-templates";
import {
  createPendingVipSubscription,
  createVipPurchase,
  findReusableVipProviderProductId,
  getActiveVipPlanPrice,
  getLiveVipSubscriptionForUser,
  getVipPlanPriceById,
  markVipPlanPriceProvisioned,
  markVipPlanPriceProvisioningFailed,
  markVipSubscriptionCheckoutSession,
  rebindPendingVipSubscriptionToPrice,
} from "@/lib/db/queries";
import { requireRegisteredUser } from "@/lib/vip/access";
import {
  getWechatVipPrice,
  handleWechatPrepaidCheckout,
  parseVipCheckoutMethod,
} from "@/lib/vip/billing/china-payments";
import {
  describeVipBillingProvider,
  isStripeWebhookSecretConfigured,
} from "@/lib/vip/billing/config";
import { handleVipSubscriptionCheckout } from "@/lib/vip/billing/customer-billing-api";
import { ensureVipPlanPriceProvisioned } from "@/lib/vip/billing/provisioning";
import { createStripeBillingGateway } from "@/lib/vip/billing/stripe-adapter";
import { getVipProductConfig } from "@/lib/vip/config";
import { getVipPaymentProvider } from "@/lib/vip/payment-provider";

// Legacy local one-time simulation path, preserved for non-production local
// compatibility. Production recurring billing never reaches this.
async function legacySimulationCheckout(access: { userId: string }) {
  try {
    const product = getVipProductConfig();
    const provider = getVipPaymentProvider();
    const checkout = await provider.createCheckout({
      amountMinor: product.amountMinor,
      currency: product.currency,
      userId: access.userId,
    });
    const purchase = await createVipPurchase({
      userId: access.userId,
      provider: checkout.provider,
      providerPaymentId: checkout.providerPaymentId,
      amountMinor: product.amountMinor,
      currency: product.currency,
    });

    return Response.json({
      purchaseId: purchase.id,
      provider: purchase.provider,
      providerPaymentId: purchase.providerPaymentId,
      status: purchase.status,
      amountMinor: purchase.amountMinor,
      currency: purchase.currency,
      durationDays: product.durationDays,
    });
  } catch (error) {
    console.error("VIP checkout unavailable:", error);
    return Response.json(
      { error: "VIP simulated payment is unavailable in this environment." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }

  const method = parseVipCheckoutMethod(await request.text());
  if (!method) {
    return Response.json(
      { error: "Invalid VIP checkout option." },
      { status: 400 }
    );
  }

  const billingProvider = describeVipBillingProvider();
  if (method === "wechat_pay") {
    if (
      billingProvider.provider !== "stripe" ||
      !billingProvider.ready ||
      !isStripeWebhookSecretConfigured()
    ) {
      return Response.json(
        { error: "WeChat Pay membership checkout is unavailable right now." },
        { status: 503 }
      );
    }
    return await handleWechatPrepaidCheckout({
      requireCustomer: () =>
        Promise.resolve({
          userId: access.userId,
          role: access.entitlement.role,
        }),
      amountMinor: getWechatVipPrice(),
      createPurchase: createVipPurchase,
      gateway: createStripeBillingGateway(),
      getBaseUrl: getValidatedAppBaseUrl,
      createPurchaseId: randomUUID,
    });
  }

  if (method === "alipay") {
    // Stripe Alipay recurring remains unavailable until the account receives
    // Stripe preview approval and its supported authorization flow is wired.
    return Response.json(
      { error: "Alipay monthly membership is not available yet." },
      { status: 503 }
    );
  }

  if (billingProvider.provider === "simulation" && billingProvider.ready) {
    return legacySimulationCheckout(access);
  }

  try {
    return await handleVipSubscriptionCheckout({
      requireCustomer: () =>
        Promise.resolve({
          userId: access.userId,
          role: access.entitlement.role,
        }),
      repo: {
        getActiveVipPlanPrice,
        ensurePlanPriceProvisioned: (planPriceId) =>
          ensureVipPlanPriceProvisioned({
            planPriceId,
            repo: {
              getVipPlanPriceById,
              findReusableProviderProductId: findReusableVipProviderProductId,
              markPlanPriceProvisioned: markVipPlanPriceProvisioned,
              markPlanPriceProvisioningFailed:
                markVipPlanPriceProvisioningFailed,
            },
            gateway: createStripeBillingGateway(),
          }),
        getLiveVipSubscriptionForUser,
        createPendingVipSubscription,
        rebindPendingVipSubscriptionToPrice,
        markVipSubscriptionCheckoutSession,
      },
      gateway: createStripeBillingGateway(),
      getBaseUrl: getValidatedAppBaseUrl,
    });
  } catch (error) {
    console.error("VIP checkout unavailable:", error);
    return Response.json(
      { error: "VIP membership checkout is unavailable right now." },
      { status: 503 }
    );
  }
}
