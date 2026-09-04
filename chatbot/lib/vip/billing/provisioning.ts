import type { VipBillingProviderGateway, VipPlanPriceRow } from "./types";

// Server-side Stripe Product/Price provisioning for the active VIP monthly
// price. One conceptual Stripe product ("Au Lawyers VIP Membership") is reused
// across price versions; each administrator price becomes a NEW immutable
// Stripe Price. Provider IDs originate only from Stripe responses.

export const VIP_PRODUCT_NAME = "Au Lawyers VIP Membership";
const VIP_PRODUCT_IDEMPOTENCY_KEY = "immigration-ai-vip-product";

export type VipProvisioningRepo = {
  getVipPlanPriceById(id: string): Promise<VipPlanPriceRow | null>;
  findReusableProviderProductId(): Promise<string | null>;
  markPlanPriceProvisioned(input: {
    id: string;
    provider: string;
    providerProductId: string;
    providerPriceId: string;
  }): Promise<void>;
  markPlanPriceProvisioningFailed(id: string): Promise<void>;
};

export type VipProvisioningResult =
  | {
      status: "ready";
      providerProductId: string;
      providerPriceId: string;
    }
  | {
      status: "failed";
      reason: "price_not_found" | "invalid_price" | "provider_error";
    };

export function vipPlanPriceIdempotencyKey(planPriceId: string): string {
  return `immigration-ai-vip-plan-price:${planPriceId}`;
}

export async function ensureVipPlanPriceProvisioned({
  planPriceId,
  repo,
  gateway,
}: {
  planPriceId: string;
  repo: VipProvisioningRepo;
  gateway: Pick<VipBillingProviderGateway, "createProduct" | "createPrice">;
}): Promise<VipProvisioningResult> {
  const price = await repo.getVipPlanPriceById(planPriceId);
  if (!price) {
    return { status: "failed", reason: "price_not_found" };
  }

  // Already provisioned: no duplicate Stripe Price creation.
  if (
    price.providerSyncStatus === "ready" &&
    price.providerPriceId &&
    price.providerProductId
  ) {
    return {
      status: "ready",
      providerProductId: price.providerProductId,
      providerPriceId: price.providerPriceId,
    };
  }

  if (
    price.currency !== "AUD" ||
    price.billingInterval !== "month" ||
    !Number.isSafeInteger(price.amountMinor) ||
    price.amountMinor <= 0
  ) {
    await repo.markPlanPriceProvisioningFailed(price.id);
    return { status: "failed", reason: "invalid_price" };
  }

  try {
    const reusableProductId = await repo.findReusableProviderProductId();
    const productId =
      reusableProductId ??
      (
        await gateway.createProduct({
          name: VIP_PRODUCT_NAME,
          idempotencyKey: VIP_PRODUCT_IDEMPOTENCY_KEY,
        })
      ).id;

    const createdPrice = await gateway.createPrice({
      product: productId,
      currency: "aud",
      unitAmount: price.amountMinor,
      idempotencyKey: vipPlanPriceIdempotencyKey(price.id),
    });

    await repo.markPlanPriceProvisioned({
      id: price.id,
      provider: "stripe",
      providerProductId: productId,
      providerPriceId: createdPrice.id,
    });

    return {
      status: "ready",
      providerProductId: productId,
      providerPriceId: createdPrice.id,
    };
  } catch (error) {
    // Bounded handling: never surface raw provider errors to the admin UI,
    // never fabricate provider IDs, and never corrupt local price history.
    console.error("VIP plan price provisioning failed:", error);
    await repo.markPlanPriceProvisioningFailed(price.id);
    return { status: "failed", reason: "provider_error" };
  }
}
