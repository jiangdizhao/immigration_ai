import type { VipCheckoutCustomerContext } from "./customer-billing-api";
import type { VipBillingProviderGateway } from "./types";

export const WECHAT_VIP_DURATION_DAYS = 30;
export const WECHAT_VIP_CURRENCY = "CNY";
export const WECHAT_VIP_PRODUCT_CODE = "wechat_vip_30d";

const MAX_STRIPE_AMOUNT_MINOR = 999_999_999;

export type VipCheckoutMethod = "card" | "alipay" | "wechat_pay";
type WechatVipEnvironment = {
  [key: string]: string | undefined;
  VIP_WECHAT_PAY_ENABLED?: string;
  VIP_WECHAT_CNY_30_DAY_AMOUNT_MINOR?: string;
};

export function parseVipCheckoutMethod(body: string): VipCheckoutMethod | null {
  if (!body.trim()) {
    return "card";
  }
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const method = (value as Record<string, unknown>).paymentMethod;
  if (method === undefined) {
    return "card";
  }
  return method === "card" || method === "alipay" || method === "wechat_pay"
    ? method
    : null;
}

export function parseConfiguredCnyPrice(
  value: string | undefined
): number | null {
  if (!value || !/^[1-9][0-9]*$/.test(value)) {
    return null;
  }
  const amountMinor = Number(value);
  return Number.isSafeInteger(amountMinor) &&
    amountMinor <= MAX_STRIPE_AMOUNT_MINOR
    ? amountMinor
    : null;
}

export function getWechatVipPrice(
  env: WechatVipEnvironment = process.env
): number | null {
  if (env.VIP_WECHAT_PAY_ENABLED !== "true") {
    return null;
  }
  return parseConfiguredCnyPrice(env.VIP_WECHAT_CNY_30_DAY_AMOUNT_MINOR);
}

export type WechatPrepaidCheckoutDeps = {
  requireCustomer: () => Promise<VipCheckoutCustomerContext | Response>;
  amountMinor: number | null;
  createPurchase(input: {
    id: string;
    userId: string;
    provider: "stripe";
    providerPaymentId: string;
    amountMinor: number;
    currency: typeof WECHAT_VIP_CURRENCY;
  }): Promise<unknown>;
  gateway: Pick<
    VipBillingProviderGateway,
    "createWeChatPrepaidCheckoutSession"
  >;
  getBaseUrl: () => string;
  createPurchaseId: () => string;
};

function unavailable() {
  return Response.json(
    { error: "WeChat Pay membership checkout is unavailable right now." },
    { status: 503 }
  );
}

export async function handleWechatPrepaidCheckout(
  deps: WechatPrepaidCheckoutDeps
): Promise<Response> {
  const customer = await deps.requireCustomer();
  if (customer instanceof Response) {
    return customer;
  }
  if (customer.role !== "user") {
    return Response.json(
      { error: "Prepaid VIP is only available for customer accounts." },
      { status: 403 }
    );
  }
  if (
    deps.amountMinor === null ||
    !Number.isSafeInteger(deps.amountMinor) ||
    deps.amountMinor <= 0 ||
    deps.amountMinor > MAX_STRIPE_AMOUNT_MINOR
  ) {
    return unavailable();
  }

  const purchaseId = deps.createPurchaseId();
  const metadata = {
    vipPurchaseId: purchaseId,
    vipUserId: customer.userId,
    vipProduct: WECHAT_VIP_PRODUCT_CODE,
    vipDurationDays: String(WECHAT_VIP_DURATION_DAYS),
    vipAmountMinor: String(deps.amountMinor),
    vipCurrency: WECHAT_VIP_CURRENCY,
  };
  const baseUrl = deps.getBaseUrl();

  try {
    const session = await deps.gateway.createWeChatPrepaidCheckoutSession({
      amountMinor: deps.amountMinor,
      clientReferenceId: purchaseId,
      metadata,
      successUrl: `${baseUrl}/vip?checkout=success`,
      cancelUrl: `${baseUrl}/vip?checkout=cancelled`,
      idempotencyKey: `immigration-ai-vip-wechat:${purchaseId}`,
    });
    if (!session.url) {
      return unavailable();
    }

    // Persist the provider-issued Checkout Session ID before returning its URL.
    // A fast webhook can retry while this row is absent, then correlate safely.
    await deps.createPurchase({
      id: purchaseId,
      userId: customer.userId,
      provider: "stripe",
      providerPaymentId: session.id,
      amountMinor: deps.amountMinor,
      currency: WECHAT_VIP_CURRENCY,
    });

    return Response.json({ url: session.url });
  } catch {
    return unavailable();
  }
}
