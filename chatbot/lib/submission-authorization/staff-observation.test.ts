import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FORBIDDEN_STAFF_OBSERVATION_FIELDS,
  observeHandoffPackageCurrency,
  STAFF_OBSERVATION_PURPOSE,
} from "./staff-observation";

/**
 * Phase 13 M9-B — M8 staff/handoff observation boundary (security audit evidence).
 *
 * The M8 accept path evaluates one package read under the *customer's* authority because
 * the M8.1 view refuses a staff actor. These tests pin what may and may not cross that
 * boundary, so a future refactor cannot turn the currency check into a content read.
 */

const staffUserId = "11111111-1111-4111-8111-111111111111";
const customerUserId = "22222222-2222-4222-8222-222222222222";
const packageVersionId = "55555555-5555-4555-8555-555555555555";
const manifestSha256 = "c".repeat(64);

function observe(
  observed: { packageVersionId: string; manifestSha256: string } | null
) {
  return observeHandoffPackageCurrency({
    boundManifestSha256: manifestSha256,
    boundPackageVersionId: packageVersionId,
    handoffRequestedByUserId: customerUserId,
    observedCurrentPackage: observed,
    staffActorUserId: staffUserId,
  });
}

test("a matching exact package is current and reveals no reason code", () => {
  const result = observe({ manifestSha256, packageVersionId });
  assert.equal(result.outcome, "current");
  assert.equal(result.staffVisibleReasonCode, null);
});

test("a moved or mismatched package is not current with a coarse reason", () => {
  const movedVersion = observe({
    manifestSha256,
    packageVersionId: "77777777-7777-4777-8777-777777777777",
  });
  assert.equal(movedVersion.outcome, "not_current");
  assert.equal(movedVersion.staffVisibleReasonCode, "handoff_not_current");

  const changedManifest = observe({
    manifestSha256: "d".repeat(64),
    packageVersionId,
  });
  assert.equal(changedManifest.outcome, "not_current");
  assert.equal(changedManifest.staffVisibleReasonCode, "handoff_not_current");
});

test("an unobservable package is unknown and never treated as current", () => {
  const result = observe(null);
  assert.equal(result.outcome, "unknown");
  assert.equal(result.staffVisibleReasonCode, "handoff_state_unavailable");
});

test("the observation records the customer authority and the requesting staff actor", () => {
  const result = observe({ manifestSha256, packageVersionId });
  assert.equal(result.observation.observedAsUserId, customerUserId);
  assert.equal(result.observation.requestedByStaffUserId, staffUserId);
  assert.equal(result.observation.purpose, STAFF_OBSERVATION_PURPOSE);
  assert.equal(result.observation.boundPackageVersionId, packageVersionId);
  assert.equal(result.observation.boundManifestSha256, manifestSha256);
});

test("no package content field can cross the boundary", () => {
  const serialized = JSON.stringify(
    observe({ manifestSha256, packageVersionId })
  );
  for (const forbidden of FORBIDDEN_STAFF_OBSERVATION_FIELDS) {
    assert.equal(
      serialized.includes(`"${forbidden}"`),
      false,
      `${forbidden} must not appear in a staff observation`
    );
  }
  // The only identifiers present are the ones the audit record needs.
  assert.deepEqual(Object.keys(observe(null)).sort(), [
    "observation",
    "outcome",
    "staffVisibleReasonCode",
  ]);
});

test("the reason code never reveals readiness, authorization or disclosure detail", () => {
  const reasons = [
    observe(null).staffVisibleReasonCode,
    observe({ manifestSha256: "e".repeat(64), packageVersionId })
      .staffVisibleReasonCode,
  ];
  for (const reason of reasons) {
    assert.ok(
      reason === null ||
        reason === "handoff_not_current" ||
        reason === "handoff_state_unavailable"
    );
  }
});
