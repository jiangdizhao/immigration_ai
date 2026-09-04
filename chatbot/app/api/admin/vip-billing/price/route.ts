import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import {
  handleAdminVipBillingPriceGet,
  handleAdminVipBillingPriceSet,
} from "@/lib/vip/billing/admin-price-api";
import {
  getActiveVipMonthlyPrice,
  setActiveVipMonthlyPrice,
} from "@/lib/vip/billing/price-service";

function requireAdminWithUserId() {
  return requireAdminUser().then((admin) =>
    admin instanceof Response ? admin : { userId: admin.id }
  );
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
  });
}
