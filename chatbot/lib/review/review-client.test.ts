import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProjectReviewClient,
  parseProjectReviewSummary,
  reconcileReviewSelection,
  reviewItemKey,
  reviewSummaryPath,
} from "./review-client";
import type { ProjectReviewSummary, ReviewItem } from "./review-summary";

/**
 * Phase 13 M9-B review client.
 *
 * The client may only display server state and forward one bounded request: it never
 * invents a target, never turns a blocked response into success, and never keeps a
 * selection alive across a Project switch.
 */

const projectA = "22222222-2222-4222-8222-222222222222";
const projectB = "33333333-3333-4333-8333-333333333333";

function item(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    aiCheck: { reasonCode: "ai_check_not_integrated", state: "unsupported" },
    artifactKind: "submission_package",
    confirmation: { confirmationIds: [], reasonCode: null, state: "confirmed" },
    createdAt: "2026-11-08T00:00:00.000Z",
    exactVersion: {
      bindingSha256: null,
      contentSha256: "a".repeat(64),
      targetId: "44444444-4444-4444-8444-444444444444",
      targetKind: "submission_package",
      targetVersion: 2,
    },
    integrity: { reasonCode: null, state: "verified" },
    ownerView: "applications",
    professionalReview: {
      reasonCode: "professional_authority_unavailable",
      reviewRequestId: null,
      state: "unavailable",
    },
    referenceId: "ref-1",
    requestEligibility: {
      allowed: false,
      reasonCode: "professional_authority_unavailable",
    },
    reviewTarget: null,
    stale: false,
    status: "current",
    ...overrides,
  };
}

const summary: ProjectReviewSummary = {
  aiChecking: { reasonCode: "ai_check_not_integrated", state: "unsupported" },
  artifactSource: { reasonCode: null, state: "available" },
  items: [item()],
  limits: { maxItems: 20 },
  professionalReview: {
    authorityCode: "deny_by_default_professional_review_authority",
    credentialVerifierCode: "unavailable_professional_credential_verifier",
    purpose: "managed_handoff_authorization",
    reasonCode: "professional_authority_unavailable",
    state: "unavailable",
    supportedTargetKinds: ["managed_school_application"],
    targetProviderCode: "unavailable_managed_target_provider",
  },
  projectId: projectA,
  truncated: false,
};

test("the parse rejects an unexpected payload instead of defaulting", () => {
  assert.equal(parseProjectReviewSummary(null), null);
  assert.equal(parseProjectReviewSummary({ review: {} }), null);
  assert.equal(
    parseProjectReviewSummary({
      review: { ...summary, items: [{ bad: true }] },
    }),
    null
  );
  const parsed = parseProjectReviewSummary({ review: summary });
  assert.ok(parsed);
  assert.equal(parsed.items.length, 1);
});

test("a selection never survives a Project or version change", () => {
  const key = reviewItemKey(item());
  assert.ok(
    reconcileReviewSelection({ review: summary, selectedKey: key }),
    "the same version stays selected"
  );
  assert.equal(
    reconcileReviewSelection({ review: summary, selectedKey: "other:ref-9" }),
    null
  );
  assert.equal(
    reconcileReviewSelection({ review: null, selectedKey: key }),
    null
  );
  const projectBSummary = { ...summary, projectId: projectB, items: [] };
  assert.equal(
    reconcileReviewSelection({ review: projectBSummary, selectedKey: key }),
    null,
    "Project A's version cannot stay selected in Project B"
  );
});

test("a blocked request is reported with its reason and never as success", async () => {
  const client = createProjectReviewClient({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          blocked: true,
          reasonCode: "professional_authority_unavailable",
        }),
        { status: 503 }
      ),
    newOperationId: () => "op-1",
  });
  const state = await client.requestReview({
    item: item({
      requestEligibility: { allowed: true, reasonCode: null },
      reviewTarget: {
        targetId: "44444444-4444-4444-8444-444444444444",
        targetKind: "managed_school_application",
        targetSha256: "a".repeat(64),
        targetVersion: 2,
      },
    }),
    projectId: projectA,
  });
  assert.deepEqual(state, {
    reasonCode: "professional_authority_unavailable",
    status: "blocked",
  });
});

test("an ineligible item is blocked locally without a request", async () => {
  let called = false;
  const client = createProjectReviewClient({
    fetchImpl: () => {
      called = true;
      return Promise.resolve(new Response("{}", { status: 200 }));
    },
  });
  const state = await client.requestReview({
    item: item(),
    projectId: projectA,
  });
  assert.equal(called, false);
  assert.deepEqual(state, {
    reasonCode: "professional_authority_unavailable",
    status: "blocked",
  });
});

test("loading uses the Project-scoped path and reports failure honestly", async () => {
  const paths: string[] = [];
  const client = createProjectReviewClient({
    fetchImpl: (input) => {
      paths.push(String(input));
      return Promise.resolve(
        new Response(JSON.stringify({ review: summary }), { status: 200 })
      );
    },
  });
  const loaded = await client.load(projectA);
  assert.deepEqual(paths, [reviewSummaryPath(projectA)]);
  assert.match(paths[0], new RegExp(projectA, "u"));
  assert.equal(loaded.error, null);
  assert.equal(loaded.review?.projectId, projectA);

  const failing = createProjectReviewClient({
    fetchImpl: async () => new Response("{}", { status: 503 }),
  });
  const failed = await failing.load(projectA);
  assert.equal(failed.error, "unavailable");
  assert.equal(failed.review, null);
});
