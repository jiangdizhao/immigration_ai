import assert from "node:assert/strict";
import test from "node:test";
import { POLICY_DISCOVERY_SOURCES } from "./policy-intelligence-discovery";
import { runPolicySyncAll } from "./policy-sync-all";

const expectedSourceOrder = [
  "home-affairs-guidance",
  "federal-register-legislation",
  "art-immigration-review",
];

test("all configured policy sources run serially in the required order", async () => {
  const started: string[] = [];
  let active = 0;
  let maxActive = 0;
  const result = await runPolicySyncAll(async (sourceId) => {
    active++;
    maxActive = Math.max(maxActive, active);
    started.push(sourceId);
    await Promise.resolve();
    active--;
  });

  assert.deepEqual(
    POLICY_DISCOVERY_SOURCES.map((source) => source.id),
    expectedSourceOrder
  );
  assert.deepEqual(started, expectedSourceOrder);
  assert.equal(maxActive, 1);
  assert.equal(result.status, "succeeded");
  assert.equal(result.exitCode, 0);
});

test("a source failure does not prevent later sources and yields aggregate failure", async () => {
  const attempted: string[] = [];
  const result = await runPolicySyncAll(async (sourceId) => {
    attempted.push(sourceId);
    if (sourceId === expectedSourceOrder[0]) {
      throw new Error("provider_secret raw source payload");
    }
  });

  assert.deepEqual(attempted, expectedSourceOrder);
  assert.deepEqual(result, {
    status: "partial_failure",
    exitCode: 1,
    sources: [
      { sourceId: expectedSourceOrder[0], status: "failed" },
      { sourceId: expectedSourceOrder[1], status: "succeeded" },
      { sourceId: expectedSourceOrder[2], status: "succeeded" },
    ],
  });
  assert.doesNotMatch(JSON.stringify(result), /provider_secret|raw source payload/);
});

test("an all-success aggregate contains only bounded source status", async () => {
  const result = await runPolicySyncAll(async () => {});

  assert.deepEqual(result, {
    status: "succeeded",
    exitCode: 0,
    sources: expectedSourceOrder.map((sourceId) => ({
      sourceId,
      status: "succeeded",
    })),
  });
  assert.equal(JSON.stringify(result).length < 500, true);
});
