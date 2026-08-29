import { createVipPurchase } from "@/lib/db/queries";
import { requireRegisteredUser } from "@/lib/vip/access";
import { getVipProductConfig } from "@/lib/vip/config";
import { getVipPaymentProvider } from "@/lib/vip/payment-provider";

export async function POST() {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }

  try {
    const product = getVipProductConfig();
    const provider = getVipPaymentProvider();
    const checkout = await provider.createCheckout({
      amountMinor: product.amountMinor,
      currency: product.currency,
      userId: access.userId,
    });
    const purchase = await createVipPurchase({
      userId: access.userId,
      provider: checkout.provider,
      providerPaymentId: checkout.providerPaymentId,
      amountMinor: product.amountMinor,
      currency: product.currency,
    });

    return Response.json({
      purchaseId: purchase.id,
      provider: purchase.provider,
      providerPaymentId: purchase.providerPaymentId,
      status: purchase.status,
      amountMinor: purchase.amountMinor,
      currency: purchase.currency,
      durationDays: product.durationDays,
    });
  } catch (error) {
    console.error("VIP checkout unavailable:", error);
    return Response.json(
      { error: "VIP simulated payment is unavailable in this environment." },
      { status: 503 }
    );
  }
}
