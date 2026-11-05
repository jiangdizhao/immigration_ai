/**
 * Phase 13 M8.2 - client surface contract.
 *
 * The client may not invent an action, a locale, a validity verdict or a provenance
 * label. These tests pin the parts a browser would otherwise be trusted with.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { submissionAuthorizationLocaleFor } from "@/components/submission-authorization-section";
import { submissionAuthorizationCopy } from "@/lib/workspace-copy";
import {
  AUTHORIZATION_ACTIONS,
  canCancelHandoff,
  offeredActions,
  parseSubmissionAuthorizationView,
  type SubmissionAuthorizationWorkspaceView,
  submissionAuthorizationActionPath,
  submissionAuthorizationPath,
} from "./submission-authorization";

function view(
  overrides: Partial<SubmissionAuthorizationWorkspaceView> = {}
): SubmissionAuthorizationWorkspaceView {
  return {
    authorization: null,
    authorizations: [],
    currentManifestSha256: null,
    currentPackageVersion: null,
    currentPackageVersionId: null,
    disclosurePolicyVersion: "phase13.m8-2.authorization-disclosures.v1",
    externalRecords: [],
    handoff: null,
    handoffEligibility: { reasonCodes: [], status: "unknown" },
    handoffs: [],
    limits: {
      maxAuthorizationsPerTarget: 12,
      maxExternalRecordsPerTarget: 40,
      maxHandoffsPerTarget: 24,
    },
    modes: {
      managed_service: {
        available: false,
        reasonCodes: ["source_unavailable"],
        requiredDisclosures: [
          "named_professional_performs_external_submission",
        ],
      },
      self_service: {
        available: false,
        reasonCodes: ["source_unavailable"],
        requiredDisclosures: [
          "customer_performs_external_submission_personally",
        ],
      },
    },
    nextAction: "unavailable",
    package: {
      effectiveConfirmationIds: [],
      reasonCodes: [],
      staleReasonCodes: [],
      status: "unknown",
    },
    policyVersion: "phase13.m8-2.authorization-policy.v1",
    projectId: "11111111-1111-4111-8111-111111111111",
    schemaVersion: "phase13.m8-2.submission-authorization.v1",
    submissionState: "not_submitted",
    targetId: "33333333-3333-4333-8333-333333333333",
    targetKind: "student_500_visa_application",
    ...overrides,
  } as SubmissionAuthorizationWorkspaceView;
}

describe("submission authorization client", () => {
  it("builds Project-scoped paths and validates the server view", () => {
    assert.equal(
      submissionAuthorizationPath({
        projectId: "p 1",
        targetId: "t1",
        targetKind: "student_500_visa_application",
      }),
      "/api/projects/p%201/submission-authorization?targetId=t1&targetKind=student_500_visa_application"
    );
    assert.equal(
      submissionAuthorizationActionPath("p 1"),
      "/api/projects/p%201/submission-authorization"
    );
    assert.equal(parseSubmissionAuthorizationView(null), null);
    assert.equal(parseSubmissionAuthorizationView({ projectId: "x" }), null);
    assert.equal(
      parseSubmissionAuthorizationView({ ...view(), modes: null }),
      null
    );
    assert.ok(parseSubmissionAuthorizationView(view()));
  });

  it("offers only actions the server currently permits", () => {
    assert.deepEqual(offeredActions(view()), [], "nothing available");

    const selfOnly = view({
      modes: {
        ...view().modes,
        self_service: { ...view().modes.self_service, available: true },
      },
    });
    assert.deepEqual(offeredActions(selfOnly), ["authorize_self_service"]);

    const both = view({
      modes: {
        managed_service: { ...view().modes.managed_service, available: true },
        self_service: { ...view().modes.self_service, available: true },
      },
    });
    assert.deepEqual(offeredActions(both), [
      "authorize_self_service",
      "authorize_managed_service",
    ]);

    // An authorization that is not effective never unlocks submission actions.
    const ineffective = view({
      ...both,
      authorization: {
        acknowledgedDisclosures: [],
        authorizationId: "a1",
        authorizationType: "self_service_external_submission",
        authorizedAt: "2026-11-05T00:00:00.000Z",
        bindingSha256: "0".repeat(64),
        disclosurePolicyVersion: "v1",
        manifestSha256: "a".repeat(64),
        mode: "self_service",
        packageVersion: 1,
        packageVersionId: "p1",
        validity: {
          reasonCodes: ["package_not_current"],
          status: "ineffective",
        },
      },
    });
    assert.deepEqual(offeredActions(ineffective), [
      "authorize_self_service",
      "authorize_managed_service",
    ]);
  });
});

describe("submission authorization handoff and locale contracts", () => {
  it("offers a handoff only for an effective managed authorization", () => {
    const base = view({
      authorization: {
        acknowledgedDisclosures: [],
        authorizationId: "a1",
        authorizationType: "managed_service_professional_handoff",
        authorizedAt: "2026-11-05T00:00:00.000Z",
        bindingSha256: "0".repeat(64),
        disclosurePolicyVersion: "v1",
        manifestSha256: "a".repeat(64),
        mode: "managed_service",
        packageVersion: 1,
        packageVersionId: "p1",
        validity: { reasonCodes: [], status: "effective" },
      },
      handoffEligibility: { reasonCodes: [], status: "eligible" },
      modes: {
        managed_service: { ...view().modes.managed_service, available: true },
        self_service: { ...view().modes.self_service, available: false },
      },
    });
    assert.deepEqual(offeredActions(base), [
      "authorize_managed_service",
      "record_external_record",
      "request_handoff",
    ]);
    // A live handoff removes the duplicate-request action but stays cancellable.
    const live = {
      ...base,
      handoff: {
        authorizationId: "a1",
        createdAt: "2026-11-05T00:00:00.000Z",
        handoffId: "h1",
        history: [],
        manifestSha256: "a".repeat(64),
        packageVersion: 1,
        packageVersionId: "p1",
        recipientUserId: null,
        requestedByUserId: "u1",
        revision: 1,
        status: "requested",
        updatedAt: "2026-11-05T00:00:00.000Z",
      },
    } as SubmissionAuthorizationWorkspaceView;
    assert.deepEqual(offeredActions(live), [
      "authorize_managed_service",
      "record_external_record",
    ]);
    assert.equal(canCancelHandoff(live), true);
    for (const action of offeredActions(base)) {
      assert.ok((AUTHORIZATION_ACTIONS as readonly string[]).includes(action));
    }
  });

  it("resolves the three locales and keeps every label honest", () => {
    assert.equal(submissionAuthorizationLocaleFor("en"), "en");
    assert.equal(submissionAuthorizationLocaleFor("zh-Hans"), "zh-Hans");
    assert.equal(submissionAuthorizationLocaleFor("zh-CN"), "zh-Hans");
    assert.equal(submissionAuthorizationLocaleFor("zh-Hant"), "zh-Hant");
    assert.equal(submissionAuthorizationLocaleFor("zh-TW"), "zh-Hant");
    assert.equal(submissionAuthorizationLocaleFor(undefined), "en");

    for (const locale of ["en", "zh-Hans", "zh-Hant"] as const) {
      const copy = submissionAuthorizationCopy[locale];
      const text = JSON.stringify(copy);
      // No approval, eligibility or verification claim is rendered here.
      for (const banned of [
        "Application approved",
        "Visa eligible",
        "Officially verified",
        "Successfully submitted",
        "申请已获批准",
        "簽證合資格",
        "官方核實",
      ]) {
        assert.equal(
          text.includes(banned),
          false,
          `${locale} must not say ${banned}`
        );
      }
      // Every provenance label exists in every locale.
      for (const provenance of [
        "customer_reported",
        "staff_attested",
        "document_backed_unverified",
        "provider_verified",
      ]) {
        assert.ok(
          (copy.provenance as Record<string, string>)[provenance],
          `${locale} labels ${provenance}`
        );
      }
      // Every disclosure the server can require has wording in every locale.
      assert.ok(
        (copy.disclosure as Record<string, string>)
          .named_professional_performs_external_submission
      );
      assert.ok(
        (copy.disclosure as Record<string, string>)
          .customer_performs_external_submission_personally
      );
    }
  });
});
