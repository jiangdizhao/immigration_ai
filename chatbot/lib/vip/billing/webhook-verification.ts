import Stripe from "stripe";

// Webhook trust boundary. The raw request body must be verified with the
// Stripe signature BEFORE any JSON parsing; only verified events may proceed.

export type VipBillingWebhookVerificationResult =
  | { ok: true; event: Stripe.Event }
  | {
      ok: false;
      reason: "missing_signature" | "missing_secret" | "invalid_signature";
    };

export function verifyVipBillingWebhookPayload({
  payload,
  signature,
  secret,
}: {
  payload: string;
  signature: string | null;
  secret: string | null | undefined;
}): VipBillingWebhookVerificationResult {
  if (!signature) {
    return { ok: false, reason: "missing_signature" };
  }
  if (typeof secret !== "string" || secret.trim().length === 0) {
    return { ok: false, reason: "missing_secret" };
  }

  try {
    return {
      ok: true,
      event: Stripe.webhooks.constructEvent(payload, signature, secret),
    };
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }
}
