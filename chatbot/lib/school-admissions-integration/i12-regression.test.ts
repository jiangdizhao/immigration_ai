import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateManagedHandoffReadiness } from "../managed-handoff/evaluator";
import { denyAllManagedHandoffPorts } from "../managed-handoff/ports";
import { unavailableManagedTargetProvider } from "../professional-review/target-provider";
import { schoolAdmissionsEnabled } from "../school-admissions/contracts";
import {
  SCHOOL_APPLICATION_TARGET_KIND,
  schoolApplicationsEnabled,
} from "../school-applications/contracts";
import { readyApplication } from "./fixtures";
import { createM5IntegrationHarness } from "./harness";

/**
 * I-12 — regression and coverage classification.
 *
 * This test proves the *classification* claims rather than inflating them: the
 * feature gates stay OFF, the M4 authority surface stays fail-closed, and the
 * deferred post-M5 obligations are recorded as deferred.
 */

/** Deferred to the separate post-M5 School Application E2E acceptance. */
const DEFERRED_POST_M5_OBLIGATIONS = [
  "M4 INT-06",
  "M4 INT-07",
  "M4 INT-12",
  "M4 DB-01",
  "M4 DB-02",
  "M4-005 payment cases",
] as const;

test("I-12 both M5 feature gates remain default OFF", () => {
  assert.equal(schoolApplicationsEnabled(undefined), false);
  assert.equal(schoolApplicationsEnabled(""), false);
  assert.equal(schoolApplicationsEnabled("false"), false);
  assert.equal(schoolAdmissionsEnabled(undefined), false);
  assert.equal(schoolAdmissionsEnabled(""), false);
  assert.equal(schoolAdmissionsEnabled("false"), false);
  assert.equal(schoolApplicationsEnabled("true"), true);
  assert.equal(schoolAdmissionsEnabled("true"), true);
});

test("I-12 the M4 authority surface stays fail-closed under deny-all ports", async () => {
  const result = await evaluateManagedHandoffReadiness(
    {
      actorUserId: "11111111-1111-4111-8111-111111111101",
      messagingConsentPresent: true,
      projectId: "22222222-2222-4222-8222-222222222201",
      target: {
        targetId: "33333333-3333-4333-8333-333333333301",
        targetKind: SCHOOL_APPLICATION_TARGET_KIND,
      },
      vipEntitlementActive: true,
    },
    denyAllManagedHandoffPorts(unavailableManagedTargetProvider)
  );
  assert.notEqual(result.status, "READY");
  assert.ok(["NOT_READY", "UNKNOWN"].includes(result.status));
  assert.ok(result.reasonCodes.length > 0);
  // A VIP entitlement is context only and never produces READY.
  assert.equal(result.status === "READY", false);
});

test("I-12 the integrated journey keeps every frozen disclosure and constant", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness);
  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });
  // Submission stays disconnected and no provider confirmation can be produced.
  assert.equal(opened.case.managedReadiness.submissionState, "not_connected");
  assert.equal(opened.case.journey.student500Eligibility, "not_determined");
  for (const disclosure of [
    "not_a_school_submission",
    "no_institutional_decision",
    "no_verified_offer_or_coe",
    "catalog_not_independently_verified",
  ]) {
    assert.equal(
      opened.case.disclosures.includes(disclosure as never),
      true,
      `${disclosure} must stay disclosed`
    );
  }
  const prepared = await harness.admissions.prepare({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: opened.case.revision,
    operationId: harness.operationId("prep"),
    projectId: harness.projectId,
  });
  // AI drafting stays disabled and the sample stays provisional.
  assert.equal(prepared.case.preparation?.assistKind, "disabled");
  assert.equal(prepared.case.preparation?.provisional, true);
  assert.equal(
    prepared.case.disclosures.includes("ai_assist_unavailable"),
    true
  );
  // The deferred obligations are recorded, never claimed as passing here.
  assert.equal(DEFERRED_POST_M5_OBLIGATIONS.length, 6);
  assert.equal(
    harness.admissionStore
      .state()
      .outcomes.filter((entry) => entry.provenance === "provider_confirmed")
      .length,
    0
  );
});
