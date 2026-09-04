import type { Stripe } from "stripe";

import type { VipBillingProcessingOutcome } from "./webhook-processing";
import type { VipBillingWebhookVerificationResult } from "./webhook-verification";

// Injectable webhook route handler. Signature verification happens on the RAW
// request body before any JSON parsing; verified events are processed with
// exact idempotency; invalid signatures always return 400.

export type VipBillingWebhookDeps = {
  verify: (
    payload: string,
    signature: string | null
  ) => VipBillingWebhookVerificationResult;
  process: (event: Stripe.Event) => Promise<VipBillingProcessingOutcome>;
};

export async function handleVipBillingWebhook(
  deps: VipBillingWebhookDeps,
  request: Request
): Promise<Response> {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  const verified = deps.verify(payload, signature);
  if (!verified.ok) {
    return Response.json(
      { error: "Invalid webhook signature." },
      { status: 400 }
    );
  }

  const outcome = await deps.process(verified.event);
  if (outcome.status === "failed" && outcome.retryable) {
    // Recoverable failure: ask Stripe to retry the same event.
    return Response.json(
      { error: "Webhook processing failed." },
      { status: 500 }
    );
  }
  return Response.json({ received: true });
}
