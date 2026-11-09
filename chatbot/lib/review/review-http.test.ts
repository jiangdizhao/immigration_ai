import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createReviewHandlers,
  type ReviewHandlerDependencies,
} from "./review-http";
import { buildProjectReviewSummary } from "./review-summary";

/**
 * Phase 13 M9-B review HTTP surface.
 *
 * The tests verify backend responses rather than UI state: unauthenticated and disabled
 * surfaces disclose nothing, a foreign Project is indistinguishable from an absent one,
 * and a blocked review request returns a reason code with no review data.
 */

const projectId = "22222222-2222-4222-8222-222222222222";
const targetId = "44444444-4444-4444-8444-444444444444";

const availability = {
  authorityCode: "deny_by_default_professional_review_authority",
  credentialVerifierCode: "unavailable_professional_credential_verifier",
  purpose: "managed_handoff_authorization",
  reasonCode: "professional_authority_unavailable",
  state: "unavailable" as const,
  supportedTargetKinds: [
    "managed_school_application",
    "student_500_visa_application",
  ],
  targetProviderCode: "unavailable_managed_target_provider",
};

const summary = buildProjectReviewSummary({
  aiCheckAvailability: "unsupported",
  candidates: [],
  professional: new Map(),
  professionalAvailability: availability,
  projectId,
});

function handlers(overrides: Partial<ReviewHandlerDependencies> = {}) {
  const calls: string[] = [];
  const deps: ReviewHandlerDependencies = {
    authenticate: () => Promise.resolve({ type: "regular", userId: "u-1" }),
    enabled: () => true,
    loadSummary: () => {
      calls.push("loadSummary");
      return Promise.resolve({ kind: "ok" as const, summary });
    },
    requestReview: () => {
      calls.push("requestReview");
      return Promise.resolve({
        kind: "blocked" as const,
        reasonCode: "professional_authority_unavailable",
        status: 503,
      });
    },
    ...overrides,
  };
  return { calls, handlers: createReviewHandlers(deps) };
}

function post(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${projectId}/review-summary`,
    {
      body: JSON.stringify(body),
      method: "POST",
    }
  );
}

test("an unauthenticated request is refused before any load", async () => {
  const { calls, handlers: h } = handlers({ authenticate: async () => null });
  const response = await h.getProjectReview(
    new Request("http://localhost/x"),
    projectId
  );
  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
});

test("a disabled surface is indistinguishable from an absent Project", async () => {
  const { calls, handlers: h } = handlers({ enabled: () => false });
  const response = await h.getProjectReview(
    new Request("http://localhost/x"),
    projectId
  );
  assert.equal(response.status, 404);
  assert.deepEqual(calls, []);
});

test("a foreign or absent Project is reported as 404 without a body leak", async () => {
  const { handlers: h } = handlers({
    loadSummary: async () => ({ kind: "not_found" }),
  });
  const response = await h.getProjectReview(
    new Request("http://localhost/x"),
    projectId
  );
  assert.equal(response.status, 404);
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["error"]);
});

test("an authorized read returns the composed summary", async () => {
  const { handlers: h } = handlers();
  const response = await h.getProjectReview(
    new Request("http://localhost/x"),
    projectId
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { review: typeof summary };
  assert.equal(body.review.professionalReview.state, "unavailable");
  assert.deepEqual(body.review.items, []);
});

test("a malformed review request is rejected without reaching the service", async () => {
  const { calls, handlers: h } = handlers();
  const response = await h.requestProjectReview(
    post({ operationId: "op-1" }),
    projectId
  );
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});

test("a blocked review request returns its reason and no review data", async () => {
  const { handlers: h } = handlers();
  const response = await h.requestProjectReview(
    post({
      operationId: "op-1",
      reviewScope: ["eligibility_review"],
      targetId,
      targetKind: "managed_school_application",
      targetSha256: "a".repeat(64),
      targetVersion: 5,
    }),
    projectId
  );
  assert.equal(response.status, 503);
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(body, {
    blocked: true,
    reasonCode: "professional_authority_unavailable",
  });
  assert.equal("reviewRequestId" in body, false);
});

test("a created review request is reported with its identity only", async () => {
  const { handlers: h } = handlers({
    requestReview: async () => ({
      kind: "created",
      reviewRequestId: "66666666-6666-4666-8666-666666666666",
      revision: 1,
      state: "requested",
    }),
  });
  const response = await h.requestProjectReview(
    post({
      operationId: "op-1",
      reviewScope: ["eligibility_review"],
      targetId,
      targetKind: "managed_school_application",
      targetSha256: "a".repeat(64),
      targetVersion: 5,
    }),
    projectId
  );
  assert.equal(response.status, 201);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.state, "requested");
  assert.equal(body.replayed, false);
  assert.equal(body.reviewRequestId, "66666666-6666-4666-8666-666666666666");
});
