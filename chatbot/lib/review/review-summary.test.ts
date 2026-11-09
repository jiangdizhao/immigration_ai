import assert from "node:assert/strict";
import { test } from "node:test";
import { describeProfessionalReviewAvailability } from "./professional-review-availability";
import {
  candidateFromSubmissionPackage,
  candidatesFromArtifacts,
} from "./review-candidates";
import {
  buildProjectReviewSummary,
  type ReviewCandidate,
  type ReviewProfessionalObservation,
} from "./review-summary";

/**
 * Phase 13 M9-B — the exact-version review read model.
 *
 * These tests pin the separation the product depends on: AI checking, customer
 * confirmation and professional review are three independent states, and every
 * "not actually available" case is reported as itself rather than as success.
 */

const projectId = "22222222-2222-4222-8222-222222222222";
const applicationId = "44444444-4444-4444-8444-444444444444";
const packageId = "55555555-5555-4555-8555-555555555555";
const reviewId = "66666666-6666-4666-8666-666666666666";
const manifest = "a".repeat(64);

const blockedAvailability = describeProfessionalReviewAvailability({
  authorityCode: "deny_by_default_professional_review_authority",
  credentialVerifierCode: "unavailable_professional_credential_verifier",
  enabled: true,
  targetProviderCode: "unavailable_managed_target_provider",
});

const disabledAvailability = describeProfessionalReviewAvailability({
  authorityCode: "deny_by_default_professional_review_authority",
  credentialVerifierCode: "unavailable_professional_credential_verifier",
  enabled: false,
  targetProviderCode: "unavailable_managed_target_provider",
});

function packageCandidate(
  overrides: Partial<{
    confirmations: { confirmationId: string; current: boolean }[];
    integrityVerified: boolean;
    current: boolean;
    targetVersion: number;
  }> = {}
): ReviewCandidate {
  return candidateFromSubmissionPackage({
    targetId: applicationId,
    targetKind: "managed_school_application",
    version: {
      confirmations: overrides.confirmations ?? [],
      createdAt: "2026-11-08T00:00:00.000Z",
      freshness: { current: overrides.current ?? true },
      integrityVerified: overrides.integrityVerified ?? true,
      manifestSha256: manifest,
      packageVersionId: packageId,
      targetVersion: overrides.targetVersion ?? 5,
      version: 2,
    },
  });
}

test("a production-style fail-closed composition can never be reported as available", () => {
  assert.equal(blockedAvailability.state, "unavailable");
  assert.equal(
    blockedAvailability.reasonCode,
    "professional_authority_unavailable"
  );
  assert.equal(disabledAvailability.state, "disabled");
  assert.deepEqual(blockedAvailability.supportedTargetKinds, [
    "managed_school_application",
    "student_500_visa_application",
  ]);
  assert.equal(blockedAvailability.purpose, "managed_handoff_authorization");
});

test("the three dimensions are independent and never implied by each other", () => {
  const summary = buildProjectReviewSummary({
    aiCheckAvailability: "unsupported",
    candidates: [
      packageCandidate({
        confirmations: [{ confirmationId: "c-1", current: true }],
      }),
    ],
    professional: new Map<string, ReviewProfessionalObservation>(),
    professionalAvailability: blockedAvailability,
    projectId,
  });
  const [item] = summary.items;
  assert.ok(item);
  assert.equal(item.confirmation.state, "confirmed");
  assert.deepEqual(item.confirmation.confirmationIds, ["c-1"]);
  assert.equal(item.integrity.state, "verified");
  assert.equal(item.aiCheck.state, "unsupported");
  assert.equal(item.aiCheck.reasonCode, "ai_check_not_integrated");
  assert.equal(item.professionalReview.state, "unavailable");
  assert.equal(
    item.professionalReview.reasonCode,
    "professional_authority_unavailable"
  );
  assert.equal(item.professionalReview.reviewRequestId, null);
  assert.equal(item.requestEligibility.allowed, false);
  assert.equal(
    item.requestEligibility.reasonCode,
    "professional_authority_unavailable"
  );
  assert.equal(summary.aiChecking.state, "unsupported");
});

test("a stale confirmation is reported as stale and never as confirmed", () => {
  const summary = buildProjectReviewSummary({
    aiCheckAvailability: "unsupported",
    candidates: [
      packageCandidate({
        confirmations: [{ confirmationId: "c-1", current: false }],
        current: false,
      }),
    ],
    professional: new Map(),
    professionalAvailability: blockedAvailability,
    projectId,
  });
  const [item] = summary.items;
  assert.ok(item);
  assert.equal(item.confirmation.state, "stale");
  assert.deepEqual(item.confirmation.confirmationIds, []);
  assert.equal(item.confirmation.reasonCode, "confirmation_not_current");
  assert.equal(item.stale, true);
  assert.equal(item.status, "stale");
});

test("an approval bound to another version never becomes current", () => {
  const observationKey = `managed_school_application:${applicationId}:v5`;
  const invalid = buildProjectReviewSummary({
    aiCheckAvailability: "unsupported",
    candidates: [packageCandidate()],
    professional: new Map([
      [
        observationKey,
        {
          reviewRequestId: reviewId,
          state: "approved",
          targetVersion: 5,
          validity: "invalid" as const,
        },
      ],
    ]),
    professionalAvailability: { ...blockedAvailability, state: "available" },
    projectId,
  });
  assert.equal(invalid.items[0]?.professionalReview.state, "invalidated");
  assert.equal(
    invalid.items[0]?.professionalReview.reasonCode,
    "review_no_longer_current"
  );

  const unknown = buildProjectReviewSummary({
    aiCheckAvailability: "unsupported",
    candidates: [packageCandidate()],
    professional: new Map([
      [
        observationKey,
        {
          reviewRequestId: reviewId,
          state: "approved",
          targetVersion: 5,
          validity: "unknown" as const,
        },
      ],
    ]),
    professionalAvailability: { ...blockedAvailability, state: "available" },
    projectId,
  });
  assert.equal(unknown.items[0]?.professionalReview.state, "unavailable");
  assert.equal(
    unknown.items[0]?.professionalReview.reasonCode,
    "review_state_unavailable"
  );
});

test("only a bound exact version can carry a review request", () => {
  const available = {
    ...blockedAvailability,
    state: "available" as const,
    reasonCode: null,
  };
  const summary = buildProjectReviewSummary({
    aiCheckAvailability: "unsupported",
    candidates: [
      packageCandidate(),
      ...candidatesFromArtifacts({
        kinds: {} as never,
        references: [
          {
            createdAt: "2026-11-07T00:00:00.000Z",
            digest: "b".repeat(64),
            kind: "school_application_package",
            ownerView: "applications",
            referenceId: "77777777-7777-4777-8777-777777777777",
            stale: false,
            status: "usable",
            targetId: applicationId,
            version: 1,
          },
        ],
        truncated: false,
      }),
    ],
    professional: new Map([
      [
        `managed_school_application:${applicationId}:v5`,
        {
          reviewRequestId: reviewId,
          state: "requested",
          targetVersion: 5,
          validity: "valid" as const,
        },
      ],
    ]),
    professionalAvailability: available,
    projectId,
  });
  const reviewable = summary.items.find(
    (entry) => entry.artifactKind === "submission_package"
  );
  const artifact = summary.items.find(
    (entry) => entry.artifactKind === "school_application_package"
  );
  assert.ok(reviewable);
  assert.ok(artifact);
  assert.equal(reviewable.professionalReview.state, "requested");
  assert.equal(reviewable.professionalReview.reviewRequestId, reviewId);
  assert.equal(reviewable.reviewTarget?.targetVersion, 5);
  assert.equal(artifact.reviewTarget, null);
  assert.equal(artifact.professionalReview.state, "unsupported");
  assert.equal(
    artifact.requestEligibility.reasonCode,
    "review_target_kind_unsupported"
  );
});

test("items are bounded and deterministically ordered", () => {
  const many: ReviewCandidate[] = [];
  for (let index = 0; index < 30; index += 1) {
    many.push({
      ...packageCandidate(),
      createdAt: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(),
      referenceId: `ref-${String(index).padStart(2, "0")}`,
    });
  }
  const summary = buildProjectReviewSummary({
    aiCheckAvailability: "unsupported",
    candidates: many,
    professional: new Map(),
    professionalAvailability: blockedAvailability,
    projectId,
  });
  assert.equal(summary.items.length, summary.limits.maxItems);
  assert.equal(summary.truncated, true);
  const timestamps = summary.items.map((item) => item.createdAt ?? "");
  assert.deepEqual([...timestamps].sort().reverse(), timestamps);
});

test("the empty state still explains why nothing is shown", () => {
  const summary = buildProjectReviewSummary({
    aiCheckAvailability: "unsupported",
    candidates: [],
    professional: new Map(),
    professionalAvailability: disabledAvailability,
    projectId,
  });
  assert.deepEqual(summary.items, []);
  assert.equal(summary.truncated, false);
  assert.equal(summary.professionalReview.state, "disabled");
});

/**
 * Phase 13 M9-B correction 1 — a candidate is only requestable when the exact version is
 * current, integrity-verified (when a check exists) and completely identifiable. The
 * injected `available` workflow proves the per-version gate is independent of availability.
 */
test("a stale exact version is never requestable even when the workflow is available", () => {
  const available = {
    ...blockedAvailability,
    reasonCode: null,
    state: "available" as const,
  };
  const summary = buildProjectReviewSummary({
    aiCheckAvailability: "unsupported",
    candidates: [packageCandidate({ current: false })],
    professional: new Map(),
    professionalAvailability: available,
    projectId,
  });
  const [item] = summary.items;
  assert.ok(item);
  assert.equal(item.stale, true);
  assert.equal(item.requestEligibility.allowed, false);
  assert.equal(item.requestEligibility.reasonCode, "exact_version_stale");
  // The workflow itself is genuinely available, so this is not an availability refusal.
  assert.equal(summary.professionalReview.state, "available");
  assert.equal(item.professionalReview.state, "not_requested");

  // The same candidate becomes requestable once it is current again.
  const current = buildProjectReviewSummary({
    aiCheckAvailability: "unsupported",
    candidates: [packageCandidate()],
    professional: new Map(),
    professionalAvailability: available,
    projectId,
  });
  assert.equal(current.items[0]?.requestEligibility.allowed, true);
  assert.equal(current.items[0]?.requestEligibility.reasonCode, null);
});

test("a failed integrity check blocks the request even when the workflow is available", () => {
  const summary = buildProjectReviewSummary({
    aiCheckAvailability: "unsupported",
    candidates: [packageCandidate({ integrityVerified: false })],
    professional: new Map(),
    professionalAvailability: {
      ...blockedAvailability,
      reasonCode: null,
      state: "available",
    },
    projectId,
  });
  const [item] = summary.items;
  assert.ok(item);
  assert.equal(item.integrity.state, "unverified");
  assert.equal(item.requestEligibility.allowed, false);
  assert.equal(
    item.requestEligibility.reasonCode,
    "package_integrity_unverified"
  );
  // An unknown integrity state (no check exists) is not a refusal on its own.
  const noIntegrity = buildProjectReviewSummary({
    aiCheckAvailability: "unsupported",
    candidates: [{ ...packageCandidate(), integrityVerified: null }],
    professional: new Map(),
    professionalAvailability: {
      ...blockedAvailability,
      reasonCode: null,
      state: "available",
    },
    projectId,
  });
  assert.equal(noIntegrity.items[0]?.integrity.state, "unknown");
  assert.equal(noIntegrity.items[0]?.requestEligibility.allowed, true);
});

test("an incomplete review-target identity is never requestable", () => {
  const incomplete = [
    { ...(packageCandidate().managedTarget as object), targetSha256: null },
    { ...(packageCandidate().managedTarget as object), targetVersion: 0 },
    { ...(packageCandidate().managedTarget as object), targetId: "" },
    { ...(packageCandidate().managedTarget as object), targetKind: "" },
    { ...(packageCandidate().managedTarget as object), targetSha256: "abc" },
  ];
  for (const managedTarget of incomplete) {
    const summary = buildProjectReviewSummary({
      aiCheckAvailability: "unsupported",
      candidates: [
        {
          ...packageCandidate(),
          managedTarget:
            managedTarget as unknown as ReviewCandidate["managedTarget"],
        },
      ],
      professional: new Map(),
      professionalAvailability: {
        ...blockedAvailability,
        reasonCode: null,
        state: "available",
        supportedTargetKinds: ["managed_school_application"],
      },
      projectId,
    });
    const [item] = summary.items;
    assert.ok(item);
    assert.equal(
      item.requestEligibility.allowed,
      false,
      `identity ${JSON.stringify(managedTarget)} must not be requestable`
    );
    assert.equal(
      item.requestEligibility.reasonCode,
      managedTarget.targetKind === ""
        ? "review_target_kind_unsupported"
        : "review_target_identity_incomplete"
    );
  }
});
