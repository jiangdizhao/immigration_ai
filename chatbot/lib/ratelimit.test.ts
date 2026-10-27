import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatbotError } from "./errors";
import { createIpRateLimitChecker } from "./ratelimit";

function rateLimitError(type: ChatbotError["type"]) {
  return (error: unknown) =>
    error instanceof ChatbotError && error.type === type;
}

test("strict rate limiting fails closed when the limiter is unavailable", async () => {
  const noConfiguredStore = createIpRateLimitChecker({
    getStore: () => null,
    isProduction: false,
  });
  await assert.rejects(
    noConfiguredStore("staff-user", {}, { failClosed: true }),
    rateLimitError("offline")
  );

  const unavailableStore = createIpRateLimitChecker({
    getStore: () => ({
      isReady: false,
      incrementWithExpiry: async () => 1,
    }),
    isProduction: true,
  });
  await assert.rejects(
    unavailableStore("staff-user", {}, { failClosed: true }),
    rateLimitError("offline")
  );
});

test("strict rate limiting fails closed on limiter infrastructure errors", async () => {
  const storeLookupFailure = createIpRateLimitChecker({
    getStore: () => {
      throw new Error("simulated limiter discovery failure");
    },
    isProduction: true,
  });
  await assert.rejects(
    storeLookupFailure("staff-user", {}, { failClosed: true }),
    rateLimitError("offline")
  );

  const counterFailure = createIpRateLimitChecker({
    getStore: () => ({
      isReady: true,
      incrementWithExpiry: () =>
        Promise.reject(new Error("simulated counter failure")),
    }),
    isProduction: true,
  });
  await assert.rejects(
    counterFailure("staff-user", {}, { failClosed: true }),
    rateLimitError("offline")
  );
});

test("strict rate limiting reports exhaustion without suppressing it", async () => {
  const exhaustedStore = createIpRateLimitChecker({
    getStore: () => ({
      isReady: true,
      incrementWithExpiry: async () => 4,
    }),
    isProduction: false,
  });
  await assert.rejects(
    exhaustedStore("staff-user", { maxRequests: 3 }, { failClosed: true }),
    rateLimitError("rate_limit")
  );
});

test("legacy rate limiting keeps its existing non-production skip", async () => {
  let storeLookups = 0;
  const legacyChecker = createIpRateLimitChecker({
    getStore: () => {
      storeLookups += 1;
      return null;
    },
    isProduction: false,
  });
  await legacyChecker("ordinary-user");
  assert.equal(storeLookups, 0);
});
