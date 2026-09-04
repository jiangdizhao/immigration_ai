import assert from "node:assert/strict";
import test from "node:test";
import {
  runLearningBridgeFailNeutral,
  trustedStaffProvenance,
} from "./learning-bridge-policy";

test("trusted learning provenance preserves lawyer and admin actors", () => {
  assert.deepEqual(trustedStaffProvenance("lawyer", "lawyer-1"), {
    actingStaffRole: "lawyer",
    reviewerId: "lawyer-1",
  });
  assert.deepEqual(trustedStaffProvenance("admin", "admin-1"), {
    actingStaffRole: "admin",
    reviewerId: "admin-1",
  });
});

test("missing provenance fails closed without a fabricated legal-service payload", () => {
  assert.equal(trustedStaffProvenance(null, "reviewer-1"), null);
  assert.equal(trustedStaffProvenance(undefined, "reviewer-1"), null);
  assert.equal(trustedStaffProvenance("lawyer", null), null);
  assert.equal(trustedStaffProvenance("lawyer", undefined), null);
});

test("an unexpected bridge exception is fail-neutral after finalization", async () => {
  let requestStatus = "pending";
  let responseReturned = false;
  let failureRecorded = false;

  requestStatus = "confirmed";
  await runLearningBridgeFailNeutral(
    () => Promise.reject(new Error("unexpected bridge failure")),
    () => {
      failureRecorded = true;
    }
  );
  responseReturned = true;

  assert.equal(requestStatus, "confirmed");
  assert.equal(responseReturned, true);
  assert.equal(failureRecorded, true);
});
