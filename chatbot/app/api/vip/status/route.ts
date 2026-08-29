import { requireRegisteredUser } from "@/lib/vip/access";
import { getVipProductConfig, isVipSimulationEnabled } from "@/lib/vip/config";
import { entitlementState } from "@/lib/vip/entitlement";

export async function GET() {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }

  const state = entitlementState(access.entitlement);
  const product = isVipSimulationEnabled() ? getVipProductConfig() : null;

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
  });
}
