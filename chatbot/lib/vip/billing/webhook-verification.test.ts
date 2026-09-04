import assert from "node:assert/strict";
import { test } from "node:test";

import Stripe from "stripe";

import { verifyVipBillingWebhookPayload } from "./webhook-verification";

// Uses the official Stripe SDK header helper. No network is used; the fake
// values below are obvious test-only fixtures, never real credentials.
const SECRET = "whsec_test_fake";
const PAYLOAD = JSON.stringify({
  id: "evt_test_1",
  object: "event",
  type: "invoice.paid",
  data: { object: { id: "in_1" } },
});

function generateHeader(payload: string): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: SECRET,
  });
}

test("validly signed webhook payloads verify and construct events", () => {
  const signature = generateHeader(PAYLOAD);
  const result = verifyVipBillingWebhookPayload({
    payload: PAYLOAD,
    signature,
    secret: SECRET,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.event.id, "evt_test_1");
    assert.equal(result.event.type, "invoice.paid");
  }
});

test("missing signature, missing secret, and tampered payloads are rejected", () => {
  const missingSignature = verifyVipBillingWebhookPayload({
    payload: PAYLOAD,
    signature: null,
    secret: SECRET,
  });
  assert.deepEqual(missingSignature, {
    ok: false,
    reason: "missing_signature",
  });

  const missingSecret = verifyVipBillingWebhookPayload({
    payload: PAYLOAD,
    signature: generateHeader(PAYLOAD),
    secret: undefined,
  });
  assert.deepEqual(missingSecret, { ok: false, reason: "missing_secret" });

  const tamperedPayload = verifyVipBillingWebhookPayload({
    payload: PAYLOAD.replace("invoice.paid", "invoice.paid_evil"),
    signature: generateHeader(PAYLOAD),
    secret: SECRET,
  });
  assert.deepEqual(tamperedPayload, { ok: false, reason: "invalid_signature" });

  const wrongSecret = verifyVipBillingWebhookPayload({
    payload: PAYLOAD,
    signature: generateHeader(PAYLOAD),
    secret: "whsec_other_fake",
  });
  assert.deepEqual(wrongSecret, { ok: false, reason: "invalid_signature" });
});
