import assert from "node:assert/strict";
import test from "node:test";
import { guestRegex } from "./constants";

test("guestRegex accepts legacy and current UUID guest identities", () => {
  assert.equal(guestRegex.test("guest-1234567890123"), true);
  assert.equal(
    guestRegex.test("guest-1234567890123-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"),
    false
  );
  assert.equal(
    guestRegex.test("guest-1234567890123-123e4567-e89b-42d3-a456-426614174000"),
    true
  );
});

test("guestRegex rejects unbounded or malformed guest identities", () => {
  assert.equal(guestRegex.test("guest-"), false);
  assert.equal(guestRegex.test("guest-1234567890123-extra"), false);
  assert.equal(
    guestRegex.test("guest-1234567890123-123e4567-e89b-12d3-a456-426614174000"),
    false
  );
});
