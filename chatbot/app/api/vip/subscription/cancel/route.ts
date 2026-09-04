import { getValidatedAppBaseUrl } from "@/lib/auth/email-templates";
import {
  getLiveVipSubscriptionForUser,
  synchronizeVipSubscriptionAfterCancelRequest,
} from "@/lib/db/queries";
import { requireRegisteredUser } from "@/lib/vip/access";
import { handleVipSubscriptionCancellation } from "@/lib/vip/billing/customer-billing-api";
import { createStripeBillingGateway } from "@/lib/vip/billing/stripe-adapter";

export async function POST() {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }

  try {
    return await handleVipSubscriptionCancellation({
      requireCustomer: () =>
        Promise.resolve({
          userId: access.userId,
          role: access.entitlement.role,
        }),
      repo: {
        getLiveVipSubscriptionForUser,
        synchronizeVipSubscriptionAfterCancelRequest,
      },
      gateway: createStripeBillingGateway(),
      getBaseUrl: getValidatedAppBaseUrl,
    });
  } catch (error) {
    console.error("VIP subscription cancellation failed:", error);
    return Response.json(
      { error: "Unable to update your subscription right now." },
      { status: 503 }
    );
  }
}
