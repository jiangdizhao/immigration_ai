import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpaqueToken,
  hashOpaqueToken,
  isPlausibleOpaqueToken,
} from "./tokens";

test("account tokens have 256 bits of random material and only hashes are stable", () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();

  assert.equal(first.rawToken.length, 43);
  assert.equal(isPlausibleOpaqueToken(first.rawToken), true);
  assert.notEqual(first.rawToken, second.rawToken);
  assert.equal(first.tokenHash, hashOpaqueToken(first.rawToken));
  assert.equal(first.tokenHash.length, 64);
  assert.notEqual(first.tokenHash, first.rawToken);
});

test("malformed account tokens are rejected before database lookup", () => {
  assert.equal(isPlausibleOpaqueToken(""), false);
  assert.equal(isPlausibleOpaqueToken("a".repeat(43)), true);
  assert.equal(isPlausibleOpaqueToken("a".repeat(42)), false);
  assert.equal(isPlausibleOpaqueToken("a".repeat(44)), false);
  assert.equal(isPlausibleOpaqueToken(null), false);
});
