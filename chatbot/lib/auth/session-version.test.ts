import assert from "node:assert/strict";
import test from "node:test";

import { isSessionVersionValid } from "./session-version";

test("regular sessions require an exact current authVersion", () => {
  assert.equal(
    isSessionVersionValid({
      type: "regular",
      tokenAuthVersion: 1,
      currentAuthVersion: 1,
    }),
    true
  );
  assert.equal(
    isSessionVersionValid({
      type: "regular",
      tokenAuthVersion: 1,
      currentAuthVersion: 2,
    }),
    false
  );
  assert.equal(
    isSessionVersionValid({
      type: "regular",
      tokenAuthVersion: undefined,
      currentAuthVersion: 1,
    }),
    false
  );
});

test("guest sessions remain independent of regular-user authVersion", () => {
  assert.equal(
    isSessionVersionValid({
      type: "guest",
      tokenAuthVersion: null,
      currentAuthVersion: null,
    }),
    true
  );
});
