// biome-ignore-all lint/suspicious/useAwait: test doubles intentionally return plain values as fake async methods.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getWechatVipPrice,
  handleWechatPrepaidCheckout,
  parseConfiguredCnyPrice,
  parseVipCheckoutMethod,
  WECHAT_VIP_CURRENCY,
  WECHAT_VIP_DURATION_DAYS,
} from "./china-payments";

const USER_ID = "22222222-2222-2222-2222-222222222222";
const PURCHASE_ID = "44444444-4444-4444-4444-444444444444";

test("CNY price configuration accepts only positive safe Stripe minor units", () => {
  assert.equal(parseConfiguredCnyPrice("2500"), 2500);
  for (const value of [
    undefined,
    "",
    "0",
    "-1",
    "25.00",
    "2e3",
    " 2500",
    "9007199254740992",
  ]) {
    assert.equal(parseConfiguredCnyPrice(value), null);
  }
  assert.equal(
    getWechatVipPrice({
      VIP_WECHAT_PAY_ENABLED: "true",
      VIP_WECHAT_CNY_30_DAY_AMOUNT_MINOR: "2500",
    }),
    2500
  );
  assert.equal(
    getWechatVipPrice({
      VIP_WECHAT_CNY_30_DAY_AMOUNT_MINOR: "2500",
    }),
    null
  );
  assert.equal(
    getWechatVipPrice({
      VIP_WECHAT_PAY_ENABLED: "false",
      VIP_WECHAT_CNY_30_DAY_AMOUNT_MINOR: "2500",
    }),
    null
  );
  assert.equal(
    getWechatVipPrice({
      VIP_WECHAT_PAY_ENABLED: "true",
      VIP_WECHAT_CNY_30_DAY_AMOUNT_MINOR: "invalid",
    }),
    null
  );
});

test("checkout method parser ignores client amount, currency, and duration", () => {
  assert.equal(parseVipCheckoutMethod(""), "card");
  assert.equal(
    parseVipCheckoutMethod(
      JSON.stringify({
        paymentMethod: "wechat_pay",
        amountMinor: 1,
        currency: "AUD",
        durationDays: 365,
      })
    ),
    "wechat_pay"
  );
  assert.equal(parseVipCheckoutMethod('{"paymentMethod":"alipay"}'), "alipay");
  assert.equal(parseVipCheckoutMethod("not-json"), null);
  assert.equal(parseVipCheckoutMethod('{"paymentMethod":"paypal"}'), null);
});

test("WeChat checkout uses only server configuration and saves the Stripe Session reference", async () => {
  const createdSessions: Record<string, unknown>[] = [];
  const createdPurchases: Record<string, unknown>[] = [];
  const response = await handleWechatPrepaidCheckout({
    requireCustomer: () => Promise.resolve({ userId: USER_ID, role: "user" }),
    amountMinor: 2500,
    createPurchase: (input) => {
      createdPurchases.push(input);
      return Promise.resolve(input);
    },
    gateway: {
      createWeChatPrepaidCheckoutSession: (input) => {
        createdSessions.push(input);
        return Promise.resolve({
          id: "cs_wechat_123",
          url: "https://checkout.stripe.com/c/pay/cs_wechat_123",
        });
      },
    },
    getBaseUrl: () => "https://example.com",
    createPurchaseId: () => PURCHASE_ID,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    url: "https://checkout.stripe.com/c/pay/cs_wechat_123",
  });
  assert.deepEqual(createdSessions, [
    {
      amountMinor: 2500,
      clientReferenceId: PURCHASE_ID,
      metadata: {
        vipPurchaseId: PURCHASE_ID,
        vipUserId: USER_ID,
        vipProduct: "wechat_vip_30d",
        vipDurationDays: "30",
        vipAmountMinor: "2500",
        vipCurrency: "CNY",
      },
      successUrl: "https://example.com/vip?checkout=success",
      cancelUrl: "https://example.com/vip?checkout=cancelled",
      idempotencyKey: `immigration-ai-vip-wechat:${PURCHASE_ID}`,
    },
  ]);
  assert.deepEqual(createdPurchases, [
    {
      id: PURCHASE_ID,
      userId: USER_ID,
      provider: "stripe",
      providerPaymentId: "cs_wechat_123",
      amountMinor: 2500,
      currency: WECHAT_VIP_CURRENCY,
    },
  ]);
  assert.equal(WECHAT_VIP_DURATION_DAYS, 30);
});

test("missing or invalid WeChat price fails closed without contacting Stripe", async () => {
  let providerCalls = 0;
  let purchaseCalls = 0;
  const response = await handleWechatPrepaidCheckout({
    requireCustomer: () => Promise.resolve({ userId: USER_ID, role: "user" }),
    amountMinor: null,
    createPurchase: () => {
      purchaseCalls += 1;
      return Promise.resolve(null);
    },
    gateway: {
      createWeChatPrepaidCheckoutSession: () => {
        providerCalls += 1;
        return Promise.resolve({ id: "cs_1", url: "https://stripe.test" });
      },
    },
    getBaseUrl: () => "https://example.com",
    createPurchaseId: () => PURCHASE_ID,
  });

  assert.equal(response.status, 503);
  assert.equal(providerCalls, 0);
  assert.equal(purchaseCalls, 0);
});

test("staff accounts cannot create a WeChat prepaid purchase", async () => {
  let providerCalls = 0;
  const response = await handleWechatPrepaidCheckout({
    requireCustomer: () => Promise.resolve({ userId: USER_ID, role: "admin" }),
    amountMinor: 2500,
    createPurchase: () => Promise.resolve(null),
    gateway: {
      createWeChatPrepaidCheckoutSession: () => {
        providerCalls += 1;
        return Promise.resolve({ id: "cs_1", url: "https://stripe.test" });
      },
    },
    getBaseUrl: () => "https://example.com",
    createPurchaseId: () => PURCHASE_ID,
  });

  assert.equal(response.status, 403);
  assert.equal(providerCalls, 0);
});
