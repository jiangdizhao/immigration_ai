import assert from "node:assert/strict";
import { test } from "node:test";

import {
  reviewAccessDecision,
  reviewAuthorizationResponse,
  trustedAssertionHeaders,
} from "./access";

test("only an authenticated administrator gets lawyer-review access", () => {
  assert.equal(reviewAccessDecision(null), "unauthenticated");
  assert.equal(
    reviewAccessDecision({
      user: { email: "phase8-free-test@local.test", role: "user" },
    }),
    "forbidden"
  );
  assert.equal(
    reviewAccessDecision({
      user: { email: "phase8-admin-test@local.test", role: "admin" },
    }),
    "allowed"
  );
  assert.equal(
    reviewAccessDecision({ user: { email: "guest-123", role: "admin" } }),
    "unauthenticated"
  );
});

test("review authorization returns distinct authentication and role failures", () => {
  assert.equal(reviewAuthorizationResponse(null)?.status, 401);
  assert.equal(
    reviewAuthorizationResponse({ user: { role: "user" } })?.status,
    403
  );
  assert.equal(reviewAuthorizationResponse({ user: { role: "admin" } }), null);
});

test("an authorized admin receives only the private server assertion", () => {
  assert.deepEqual(trustedAssertionHeaders("private-secret"), {
    "X-Lawyer-Review-Assertion": "private-secret",
  });
  assert.deepEqual(trustedAssertionHeaders(undefined), {});
});
