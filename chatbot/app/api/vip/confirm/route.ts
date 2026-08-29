import { z } from "zod";
import {
  getUserEntitlementById,
  getVipPurchaseForUser,
  settleVipPurchase,
} from "@/lib/db/queries";
import { requireRegisteredUser } from "@/lib/vip/access";
import { getVipProductConfig } from "@/lib/vip/config";
import { getVipPaymentProvider } from "@/lib/vip/payment-provider";

const confirmSchema = z.object({
  purchaseId: z.string().uuid(),
  providerPaymentId: z.string().min(1).max(255),
});

export async function POST(request: Request) {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }

  try {
    const body = confirmSchema.parse(await request.json());
    const purchase = await getVipPurchaseForUser({
      purchaseId: body.purchaseId,
      userId: access.userId,
    });
    if (!purchase || purchase.providerPaymentId !== body.providerPaymentId) {
      return Response.json({ error: "Purchase not found" }, { status: 404 });
    }

    if (purchase.status === "paid") {
      const entitlement = await getUserEntitlementById(access.userId);
      return Response.json({ purchase, entitlement, idempotent: true });
    }

    const provider = getVipPaymentProvider();
    const verification = await provider.verifyPayment({
      providerPaymentId: purchase.providerPaymentId,
      userId: access.userId,
    });
    const product = getVipProductConfig();
    const providerStatus =
      verification.status === "paid"
        ? "paid"
        : verification.status === "cancelled"
          ? "cancelled"
          : "failed";
    const settled = await settleVipPurchase({
      purchaseId: purchase.id,
      userId: access.userId,
      provider: purchase.provider,
      providerPaymentId: purchase.providerPaymentId,
      providerStatus,
      durationDays: product.durationDays,
    });
    if (!settled) {
      return Response.json(
        { error: "Purchase could not be settled" },
        { status: 409 }
      );
    }

    const entitlement = await getUserEntitlementById(access.userId);
    return Response.json({ purchase: settled, entitlement, idempotent: false });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid purchase confirmation" },
        { status: 400 }
      );
    }
    console.error("VIP confirmation unavailable:", error);
    return Response.json(
      { error: "VIP payment confirmation failed" },
      { status: 503 }
    );
  }
}
