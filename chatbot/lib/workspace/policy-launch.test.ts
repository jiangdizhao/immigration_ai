import assert from "node:assert/strict";
import test from "node:test";
import {
  clearPolicyLaunchId,
  decodePolicyLaunchFailure,
  policyLaunchStorageKey,
  readOrCreatePolicyLaunchId,
  readPolicyLaunchId,
  writePolicyLaunchId,
  type PolicyLaunchIdStore,
} from "./policy-launch";

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const store: PolicyLaunchIdStore & { values: Map<string, string> } = {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  return store;
}

const SLUG = "evisitor-application-arrangements-lin-26-061";

function failingStore(): PolicyLaunchIdStore {
  return {
    getItem: () => {
      throw new Error("storage disabled");
    },
    setItem: () => {
      throw new Error("storage disabled");
    },
    removeItem: () => {
      throw new Error("storage disabled");
    },
  };
}

test("a policy launch id is remembered per policy and reused on retry", () => {
  const store = memoryStore();
  let generated = 0;
  const generate = () => `launch-${(generated += 1)}`;

  const first = readOrCreatePolicyLaunchId(store, SLUG, generate);
  assert.equal(first, "launch-1");
  assert.equal(readPolicyLaunchId(store, SLUG), "launch-1");
  // A retry of the same launch reuses the id instead of creating a new one.
  assert.equal(readOrCreatePolicyLaunchId(store, SLUG, generate), "launch-1");
  assert.equal(generated, 1);
  // A different policy is a different launch.
  assert.equal(
    readOrCreatePolicyLaunchId(store, "another-policy", generate),
    "launch-2"
  );
});

test("clearing a launch id lets the user start a new policy conversation", () => {
  const store = memoryStore();
  writePolicyLaunchId(store, SLUG, "launch-0009");
  assert.equal(store.values.has(policyLaunchStorageKey(SLUG)), true);
  clearPolicyLaunchId(store, SLUG);
  assert.equal(readPolicyLaunchId(store, SLUG), null);
  assert.equal(
    readOrCreatePolicyLaunchId(store, SLUG, () => "launch-new"),
    "launch-new"
  );
});

test("unusable stored values are treated as no launch id", () => {
  assert.equal(readPolicyLaunchId(memoryStore({ [policyLaunchStorageKey(SLUG)]: "abc" }), SLUG), null);
  assert.equal(
    readPolicyLaunchId(memoryStore({ [policyLaunchStorageKey(SLUG)]: "   " }), SLUG),
    null
  );
  // A storage that throws (private mode, quota) must not break the launch.
  assert.equal(readPolicyLaunchId(failingStore(), SLUG), null);
  assert.doesNotThrow(() => writePolicyLaunchId(failingStore(), SLUG, "launch-0001"));
  assert.doesNotThrow(() => clearPolicyLaunchId(failingStore(), SLUG));
});

test("a refused policy launch is decoded into an explicit retry state", () => {
  assert.deepEqual(
    decodePolicyLaunchFailure({
      status: 503,
      body: { code: "policy_binding_unavailable", retryable: true },
    }),
    {
      code: "policy_binding_unavailable",
      retryable: true,
      schemaUnavailable: true,
    }
  );
  assert.deepEqual(
    decodePolicyLaunchFailure({
      status: 409,
      body: { code: "policy_launch_in_progress", retryable: true },
    }),
    {
      code: "policy_launch_in_progress",
      retryable: true,
      schemaUnavailable: false,
    }
  );
  assert.deepEqual(
    decodePolicyLaunchFailure({
      status: 404,
      body: { code: "policy_topic_unavailable", retryable: false },
    }),
    {
      code: "policy_topic_unavailable",
      retryable: false,
      schemaUnavailable: false,
    }
  );
  // Unknown responses fail closed as retryable rather than as success.
  assert.deepEqual(decodePolicyLaunchFailure({ status: 500, body: null }), {
    code: "policy_launch_failed",
    retryable: true,
    schemaUnavailable: false,
  });
  assert.deepEqual(decodePolicyLaunchFailure({ body: { code: "odd" } }), {
    code: "odd",
    retryable: true,
    schemaUnavailable: false,
  });
  assert.deepEqual(decodePolicyLaunchFailure({ status: 400 }), {
    code: "policy_launch_failed",
    retryable: false,
    schemaUnavailable: false,
  });
});
