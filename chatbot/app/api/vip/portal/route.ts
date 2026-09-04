import { getValidatedAppBaseUrl } from "@/lib/auth/email-templates";
import { getLiveVipSubscriptionForUser } from "@/lib/db/queries";
import { requireRegisteredUser } from "@/lib/vip/access";
import { handleVipPortalSession } from "@/lib/vip/billing/customer-billing-api";
import { createStripeBillingGateway } from "@/lib/vip/billing/stripe-adapter";

export async function POST() {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }

  try {
    return await handleVipPortalSession({
      requireCustomer: () =>
        Promise.resolve({
          userId: access.userId,
          role: access.entitlement.role,
        }),
      repo: { getLiveVipSubscriptionForUser },
      gateway: createStripeBillingGateway(),
      getBaseUrl: getValidatedAppBaseUrl,
    });
  } catch (error) {
    console.error("VIP billing portal unavailable:", error);
    return Response.json(
      { error: "Billing management is unavailable right now." },
      { status: 503 }
    );
  }
}
