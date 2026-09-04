// Pure decision logic for administrator changes to the active VIP monthly
// price. Historical prices are immutable: a change always retires the previous
// active row and creates a new one; it never mutates an existing price row.
// Existing subscriptions keep referencing their historical price row.

export type VipMonthlyPriceSnapshot = {
  id: string;
  amountMinor: number;
  currency: string;
  billingInterval: string;
  active: boolean;
  retiredAt: Date | null;
};

export type VipMonthlyPriceRequest = {
  amountMinor: number;
  currency: "AUD";
  billingInterval: "month";
};

export type VipMonthlyPriceDecision =
  | { action: "reject"; reason: "invalid_amount" }
  | { action: "idempotent"; existingPriceId: string }
  | {
      action: "replace";
      retirePriceId: string | null;
      createPrice: VipMonthlyPriceRequest;
    };

export function isValidVipMonthlyAmountMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function decideVipMonthlyPriceChange({
  requestedAmountMinor,
  currentActivePrice,
}: {
  requestedAmountMinor: unknown;
  currentActivePrice: VipMonthlyPriceSnapshot | null;
}): VipMonthlyPriceDecision {
  if (!isValidVipMonthlyAmountMinor(requestedAmountMinor)) {
    return { action: "reject", reason: "invalid_amount" };
  }

  if (
    currentActivePrice &&
    !currentActivePrice.retiredAt &&
    currentActivePrice.active &&
    currentActivePrice.currency === "AUD" &&
    currentActivePrice.billingInterval === "month" &&
    currentActivePrice.amountMinor === requestedAmountMinor
  ) {
    return { action: "idempotent", existingPriceId: currentActivePrice.id };
  }

  return {
    action: "replace",
    retirePriceId:
      currentActivePrice && !currentActivePrice.retiredAt
        ? currentActivePrice.id
        : null,
    createPrice: {
      amountMinor: requestedAmountMinor,
      currency: "AUD",
      billingInterval: "month",
    },
  };
}
