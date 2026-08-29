import { z } from "zod";
import { getVipPurchaseForUser, settleVipPurchase } from "@/lib/db/queries";
import { requireRegisteredUser } from "@/lib/vip/access";
import { getVipPaymentProvider } from "@/lib/vip/payment-provider";

const cancelSchema = z.object({
  purchaseId: z.string().uuid(),
  providerPaymentId: z.string().min(1).max(255),
});

export async function POST(request: Request) {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }

  try {
    const body = cancelSchema.parse(await request.json());
    const purchase = await getVipPurchaseForUser({
      purchaseId: body.purchaseId,
      userId: access.userId,
    });
    if (!purchase || purchase.providerPaymentId !== body.providerPaymentId) {
      return Response.json({ error: "Purchase not found" }, { status: 404 });
    }
    if (purchase.status !== "pending") {
      return Response.json({ purchase });
    }

    const provider = getVipPaymentProvider();
    const cancellation = await provider.cancelCheckout({
      providerPaymentId: purchase.providerPaymentId,
      userId: access.userId,
    });
    const settled = await settleVipPurchase({
      purchaseId: purchase.id,
      userId: access.userId,
      provider: purchase.provider,
      providerPaymentId: purchase.providerPaymentId,
      providerStatus:
        cancellation.status === "cancelled" ? "cancelled" : "failed",
      durationDays: 1,
    });
    return Response.json({ purchase: settled });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid purchase cancellation" },
        { status: 400 }
      );
    }
    console.error("VIP cancellation unavailable:", error);
    return Response.json(
      { error: "VIP payment cancellation failed" },
      { status: 503 }
    );
  }
}
