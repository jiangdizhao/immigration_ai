/**
 * Phase 13 M8.1 - client controller contract.
 *
 * Proves the surface never invents state: an unavailable/unapplied feature stays
 * unavailable, a conflict is surfaced instead of silently retried, consent is a hard
 * precondition, and only the newest read may win.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  consentBindingForView,
  consentBindingKey,
  consentMustReset,
  createSubmissionPackageController,
  EMPTY_SUBMISSION_CONSENT,
  parseSubmissionWorkspaceView,
  submissionConsentAllows,
  submissionConsentReducer,
  submissionPackagesPath,
} from "./submission-packages";

const PROJECT = "22222222-2222-4222-8222-222222222901";
const TARGET = "44444444-4444-4444-8444-444444444901";
const request = {
  projectId: PROJECT,
  targetId: TARGET,
  targetKind: "student_500_visa_application" as const,
};

function view(overrides: Record<string, unknown> = {}) {
  return {
    applicationStatus: "in_progress",
    archived: false,
    confirmations: [],
    currentPackage: null,
    disclosures: ["not_professionally_reviewed"],
    honesty: {
      documentsTrust: "unavailable",
      legalCoverage: "partial_unverified",
      professionalReviewStatus: "not_requested",
      submissionStatus: "not_submission_ready",
    },
    indicators: [],
    latestVersion: 0,
    limits: { maxVersionsPerTarget: 12 },
    nextAction: "build_package",
    packages: [],
    projectId: PROJECT,
    schemaVersion: "phase13.m8.submission-package.v1",
    statements: [],
    targetId: TARGET,
    targetKind: "student_500_visa_application",
    targetVersion: 1,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("the path encodes the exact target and Project", () => {
  assert.equal(
    submissionPackagesPath(request),
    `/api/projects/${PROJECT}/submission-packages?targetId=${TARGET}&targetKind=student_500_visa_application`
  );
});

test("an unexpected payload shape is rejected instead of half-rendered", () => {
  assert.equal(parseSubmissionWorkspaceView(null), null);
  assert.equal(parseSubmissionWorkspaceView({ projectId: PROJECT }), null);
  assert.equal(parseSubmissionWorkspaceView(view({ packages: "nope" })), null);
  assert.ok(parseSubmissionWorkspaceView(view()));
});

test("loading, empty, unavailable and error states are distinct", async () => {
  const empty = createSubmissionPackageController(async () =>
    jsonResponse(view())
  );
  const emptyState = await empty.load(request);
  assert.equal(emptyState.status, "ready");
  assert.equal(
    emptyState.status === "ready" ? emptyState.view.packages.length : -1,
    0
  );

  const unavailable = createSubmissionPackageController(() =>
    Promise.resolve(jsonResponse({ error: "unavailable" }, 503))
  );
  assert.equal((await unavailable.load(request)).status, "unavailable");

  const notFound = createSubmissionPackageController(() =>
    Promise.resolve(jsonResponse({ error: "not found" }, 404))
  );
  assert.equal((await notFound.load(request)).status, "unavailable");

  const failing = createSubmissionPackageController(() => {
    throw new Error("offline");
  });
  assert.equal((await failing.load(request)).status, "error");
});

test("only the newest read may win", async () => {
  const deferred: { resolve: ((value: Response) => void) | null } = {
    resolve: null,
  };
  let call = 0;
  const controller = createSubmissionPackageController(async () => {
    call += 1;
    if (call === 1) {
      return await new Promise<Response>((resolve) => {
        deferred.resolve = resolve;
      });
    }
    return jsonResponse(view({ latestVersion: 2 }));
  });
  const first = controller.load(request);
  const second = await controller.load(request);
  deferred.resolve?.(jsonResponse(view({ latestVersion: 1 })));
  const stale = await first;
  assert.equal(stale.status, "idle", "the superseded read is discarded");
  assert.equal(second.status === "ready" ? second.view.latestVersion : -1, 2);
});

test("confirmation requires consent and sends the server digest", async () => {
  const calls: { body: Record<string, unknown>; url: string }[] = [];
  const controller = createSubmissionPackageController((url, init) => {
    if (init?.method === "POST") {
      calls.push({
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
        url,
      });
      return Promise.resolve(jsonResponse({ ok: true }, 201));
    }
    return Promise.resolve(jsonResponse(view()));
  });
  const binding = consentBindingForView({
    manifestSha256: "b".repeat(64),
    packageVersionId: "99999999-9999-4999-8999-999999999901",
    projectId: PROJECT,
    statementPolicyVersion: "phase13.m8.customer-statements.v1",
    targetId: TARGET,
    targetKind: "student_500_visa_application",
  });
  const withoutConsent = await controller.confirm({
    confirmationType: "package_content_review",
    consentBinding: binding,
    consentGranted: false,
    manifestSha256: "a".repeat(64),
    packageVersionId: "99999999-9999-4999-8999-999999999901",
    request,
    statementPolicyVersion: "phase13.m8.customer-statements.v1",
    targetVersion: 1,
  });
  assert.equal(withoutConsent.status, "error");
  assert.equal(calls.length, 0, "no request is sent without consent");

  await controller.confirm({
    confirmationType: "customer_declarations",
    consentBinding: binding,
    consentGranted: true,
    manifestSha256: "b".repeat(64),
    packageVersionId: "99999999-9999-4999-8999-999999999901",
    request,
    statementPolicyVersion: "phase13.m8.customer-statements.v1",
    targetVersion: 7,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.body.manifestSha256, "b".repeat(64));
  assert.equal(calls[0]?.body.targetVersion, 7);
  assert.equal(calls[0]?.body.confirmationType, "customer_declarations");
  assert.match(String(calls[0]?.body.operationId), /^m8ui-confirm-/u);
  assert.equal(calls[0]?.url, `/api/projects/${PROJECT}/submission-packages`);
});

test("a conflict is surfaced, never silently retried", async () => {
  let posts = 0;
  const controller = createSubmissionPackageController((_url, init) => {
    if (init?.method === "POST") {
      posts += 1;
      return Promise.resolve(jsonResponse({ error: "changed" }, 409));
    }
    return Promise.resolve(jsonResponse(view()));
  });
  const state = await controller.build(request);
  assert.equal(state.status, "error");
  assert.equal(state.status === "error" ? state.message : "", "conflict");
  assert.equal(posts, 1);
});

test("a consent is bound to one exact version and is reset when it changes", () => {
  const v1 = consentBindingForView({
    manifestSha256: "a".repeat(64),
    packageVersionId: "99999999-9999-4999-8999-999999999901",
    projectId: PROJECT,
    statementPolicyVersion: "phase13.m8.customer-statements.v1",
    targetId: TARGET,
    targetKind: "student_500_visa_application",
  });
  const v2 = consentBindingForView({
    ...v1,
    manifestSha256: "b".repeat(64),
    packageVersionId: "99999999-9999-4999-8999-999999999902",
  });
  assert.notEqual(consentBindingKey(v1), consentBindingKey(v2));
  // Nothing consented yet: no reset work.
  assert.equal(
    consentMustReset({ consented: null, current: consentBindingKey(v1) }),
    false
  );
  // Same version: consent stands.
  assert.equal(
    consentMustReset({
      consented: consentBindingKey(v1),
      current: consentBindingKey(v1),
    }),
    false
  );
  // A new version, or a version that is no longer usable, clears the consent.
  assert.equal(
    consentMustReset({
      consented: consentBindingKey(v1),
      current: consentBindingKey(v2),
    }),
    true
  );
  assert.equal(
    consentMustReset({ consented: consentBindingKey(v1), current: null }),
    true
  );
});

test("a v1 consent can never be sent as a v2 confirmation", async () => {
  const posts: Record<string, unknown>[] = [];
  const controller = createSubmissionPackageController((_url, init) => {
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Promise.resolve(jsonResponse({ ok: true }, 201));
    }
    return Promise.resolve(jsonResponse(view()));
  });
  const v1Binding = consentBindingForView({
    manifestSha256: "a".repeat(64),
    packageVersionId: "99999999-9999-4999-8999-999999999901",
    projectId: PROJECT,
    statementPolicyVersion: "phase13.m8.customer-statements.v1",
    targetId: TARGET,
    targetKind: "student_500_visa_application",
  });
  const result = await controller.confirm({
    confirmationType: "package_content_review",
    consentBinding: v1Binding,
    consentGranted: true,
    manifestSha256: "b".repeat(64),
    packageVersionId: "99999999-9999-4999-8999-999999999902",
    request,
    statementPolicyVersion: "phase13.m8.customer-statements.v1",
    targetVersion: 2,
  });
  assert.equal(result.status, "error");
  assert.equal(
    result.status === "error" ? result.message : "",
    "consent_required"
  );
  assert.equal(posts.length, 0, "a mismatched consent is never sent");
});

test("declarations-only consent cannot be reused after a rebuild or target switch", () => {
  const v1Key = consentBindingKey(
    consentBindingForView({
      manifestSha256: "a".repeat(64),
      packageVersionId: "99999999-9999-4999-8999-999999999901",
      projectId: PROJECT,
      statementPolicyVersion: "phase13.m8.customer-statements.v1",
      targetId: TARGET,
      targetKind: "student_500_visa_application",
    })
  );
  const v2Key = consentBindingKey(
    consentBindingForView({
      manifestSha256: "b".repeat(64),
      packageVersionId: "99999999-9999-4999-8999-999999999902",
      projectId: PROJECT,
      statementPolicyVersion: "phase13.m8.customer-statements.v1",
      targetId: TARGET,
      targetKind: "student_500_visa_application",
    })
  );
  const otherTargetKey = consentBindingKey(
    consentBindingForView({
      manifestSha256: "a".repeat(64),
      packageVersionId: "99999999-9999-4999-8999-999999999901",
      projectId: PROJECT,
      statementPolicyVersion: "phase13.m8.customer-statements.v1",
      targetId: "44444444-4444-4444-8444-444444444999",
      targetKind: "student_500_visa_application",
    })
  );

  // The declarations checkbox alone establishes the binding.
  const consented = submissionConsentReducer(EMPTY_SUBMISSION_CONSENT, {
    checked: true,
    currentKey: v1Key,
    type: "customer_declarations",
  });
  assert.equal(consented.consentedKey, v1Key);
  assert.equal(consented.checks.customer_declarations, true);
  assert.equal(consented.checks.package_content_review, false);
  assert.equal(
    submissionConsentAllows({
      confirmable: true,
      consent: consented,
      currentKey: v1Key,
      type: "customer_declarations",
    }),
    true
  );
  // The content statement was *not* consented to and stays refused.
  assert.equal(
    submissionConsentAllows({
      confirmable: true,
      consent: consented,
      currentKey: v1Key,
      type: "package_content_review",
    }),
    false
  );

  // A package re-builed to v2: the same consent is unusable without a new action.
  assert.equal(
    consentMustReset({ consented: consented.consentedKey, current: v2Key }),
    true
  );
  assert.equal(
    submissionConsentAllows({
      confirmable: true,
      consent: consented,
      currentKey: v2Key,
      type: "customer_declarations",
    }),
    false
  );
  // Switching target is just as unusable.
  assert.equal(
    submissionConsentAllows({
      confirmable: true,
      consent: consented,
      currentKey: otherTargetKey,
      type: "customer_declarations",
    }),
    false
  );
  // Re-checking on v2 records a fresh consent bound to v2 only.
  const reconsented = submissionConsentReducer(consented, {
    checked: true,
    currentKey: v2Key,
    type: "customer_declarations",
  });
  assert.equal(reconsented.consentedKey, v2Key);
  assert.equal(reconsented.checks.customer_declarations, true);
  assert.equal(reconsented.checks.package_content_review, false);
  assert.equal(
    submissionConsentAllows({
      confirmable: true,
      consent: reconsented,
      currentKey: v1Key,
      type: "customer_declarations",
    }),
    false,
    "the v2 consent cannot be replayed against v1"
  );
  // Without a usable identity a check cannot establish consent at all.
  assert.equal(
    submissionConsentReducer(EMPTY_SUBMISSION_CONSENT, {
      checked: true,
      currentKey: null,
      type: "package_content_review",
    }).consentedKey,
    null
  );
  // An unavailable statement is never confirmable even with consent.
  assert.equal(
    submissionConsentAllows({
      confirmable: false,
      consent: reconsented,
      currentKey: v2Key,
      type: "customer_declarations",
    }),
    false
  );
});
