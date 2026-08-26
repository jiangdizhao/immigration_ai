import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasAuthenticatedLawyerToken,
  isAuthorized,
  trustedAssertionHeaders,
} from "./route";

test("development review bypass is not a trusted assertion", () => {
  const request = new Request("http://localhost", { method: "POST" });

  assert.equal(
    isAuthorized(request, { reviewToken: undefined, nodeEnv: "development" }),
    true
  );
  assert.equal(hasAuthenticatedLawyerToken(request, undefined), false);
  assert.deepEqual(
    trustedAssertionHeaders(request, undefined, "private-secret"),
    {}
  );
});

test("only a configured matching review token gets the private assertion", () => {
  const request = new Request("http://localhost", {
    method: "POST",
    headers: { "X-Review-Token": "review-token" },
  });

  assert.equal(
    isAuthorized(request, {
      reviewToken: "review-token",
      nodeEnv: "production",
    }),
    true
  );
  assert.equal(hasAuthenticatedLawyerToken(request, "review-token"), true);
  assert.deepEqual(
    trustedAssertionHeaders(request, "review-token", "private-secret"),
    { "X-Lawyer-Review-Assertion": "private-secret" }
  );
  assert.deepEqual(
    trustedAssertionHeaders(request, "wrong-token", "private-secret"),
    {}
  );
});
