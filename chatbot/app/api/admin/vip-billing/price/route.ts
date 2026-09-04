import {
  findReusableVipProviderProductId,
  getVipPlanPriceById,
  markVipPlanPriceProvisioned,
  markVipPlanPriceProvisioningFailed,
} from "@/lib/db/queries";
import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import {
  handleAdminVipBillingPriceGet,
  handleAdminVipBillingPriceSet,
} from "@/lib/vip/billing/admin-price-api";
import { describeVipBillingProvider } from "@/lib/vip/billing/config";
import {
  getActiveVipMonthlyPrice,
  setActiveVipMonthlyPrice,
} from "@/lib/vip/billing/price-service";
import { ensureVipPlanPriceProvisioned } from "@/lib/vip/billing/provisioning";
import { createStripeBillingGateway } from "@/lib/vip/billing/stripe-adapter";

function requireAdminWithUserId() {
  return requireAdminUser().then((admin) =>
    admin instanceof Response ? admin : { userId: admin.id }
  );
}

function createPriceProvisioningHook() {
  return async (price: { id: string }) => {
    const provider = describeVipBillingProvider();
    if (provider.provider !== "stripe" || !provider.ready) {
      // Leave the price unprovisioned; checkout fails closed until Stripe is
      // configured and a later save/retry provisions it.
      return;
    }
    await ensureVipPlanPriceProvisioned({
      planPriceId: price.id,
      repo: {
        getVipPlanPriceById,
        findReusableProviderProductId: findReusableVipProviderProductId,
        markPlanPriceProvisioned: markVipPlanPriceProvisioned,
        markPlanPriceProvisioningFailed: markVipPlanPriceProvisioningFailed,
      },
      gateway: createStripeBillingGateway(),
    });
  };
}

export async function GET() {
  return await handleAdminVipBillingPriceGet({
    requireAdmin: requireAdminWithUserId,
    service: { getActiveVipMonthlyPrice },
  });
}

export async function POST(request: Request) {
  return await handleAdminVipBillingPriceSet({
    requireAdmin: requireAdminWithUserId,
    service: { setActiveVipMonthlyPrice },
    request,
    onPriceCreated: createPriceProvisioningHook(),
  });
}
