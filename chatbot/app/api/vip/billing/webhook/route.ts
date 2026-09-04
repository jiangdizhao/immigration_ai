import { createSesVipBillingMailer } from "@/lib/vip/billing/billing-email-sender";
import { getStripeWebhookSecret } from "@/lib/vip/billing/config";
import { createPostgresVipBillingRepository } from "@/lib/vip/billing/repository";
import { createStripeBillingGateway } from "@/lib/vip/billing/stripe-adapter";
import { handleVipBillingWebhook } from "@/lib/vip/billing/webhook-api";
import { processVerifiedVipBillingEvent } from "@/lib/vip/billing/webhook-processing";
import { verifyVipBillingWebhookPayload } from "@/lib/vip/billing/webhook-verification";

const billingRepository = createPostgresVipBillingRepository();

// Stripe webhook endpoint. Trust comes exclusively from signature
// verification against the raw request body; no session/cookie is required.
export async function POST(request: Request) {
  return await handleVipBillingWebhook(
    {
      verify: (payload, signature) =>
        verifyVipBillingWebhookPayload({
          payload,
          signature,
          secret: getStripeWebhookSecret(),
        }),
      process: (event) =>
        processVerifiedVipBillingEvent(event, {
          repo: billingRepository,
          provider: createStripeBillingGateway(),
          mailer: createSesVipBillingMailer(),
        }),
    },
    request
  );
}
