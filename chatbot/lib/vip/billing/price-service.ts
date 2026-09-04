import "server-only";

import {
  getActiveVipPlanPrice,
  replaceActiveVipPlanPrice,
} from "@/lib/db/queries";
import type { VipMonthlyPriceSnapshot } from "./price-decision";
import { decideVipMonthlyPriceChange } from "./price-decision";

// Server-side administrator pricing service for the recurring VIP monthly
// price. Currency (AUD) and billing interval (month) are server-owned; only
// the integer minor-unit amount is accepted from the administrator. Stripe
// product/price identifiers are server-owned and are never accepted from the
// browser; M2 will provision them.

export class VipBillingPriceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function toSnapshot(price: {
  id: string;
  amountMinor: number;
  currency: string;
  billingInterval: string;
  active: boolean;
  retiredAt: Date | null;
}): VipMonthlyPriceSnapshot {
  return {
    id: price.id,
    amountMinor: price.amountMinor,
    currency: price.currency,
    billingInterval: price.billingInterval,
    active: price.active,
    retiredAt: price.retiredAt,
  };
}

export async function getActiveVipMonthlyPrice() {
  return await getActiveVipPlanPrice();
}

export async function setActiveVipMonthlyPrice({
  amountMinor,
  adminUserId,
}: {
  amountMinor: number;
  adminUserId: string | null;
}) {
  const currentPrice = await getActiveVipPlanPrice();
  const decision = decideVipMonthlyPriceChange({
    requestedAmountMinor: amountMinor,
    currentActivePrice: currentPrice ? toSnapshot(currentPrice) : null,
  });

  if (decision.action === "reject") {
    throw new VipBillingPriceError(
      "invalid_amount",
      "Monthly price must be a positive integer amount in minor units."
    );
  }

  if (decision.action === "idempotent") {
    return currentPrice;
  }

  return await replaceActiveVipPlanPrice({
    amountMinor: decision.createPrice.amountMinor,
    currency: decision.createPrice.currency,
    billingInterval: decision.createPrice.billingInterval,
    adminUserId,
    retirePriceId: decision.retirePriceId,
  });
}
