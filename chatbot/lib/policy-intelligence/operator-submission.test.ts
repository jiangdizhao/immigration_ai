import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOfficialUrlAllowed,
  type DiscoveryFetchOptions,
  discoverOperatorSubmissionCandidates,
  getPolicyDiscoverySource,
  OPERATOR_SUBMISSION_SOURCE_ID,
  POLICY_DISCOVERY_SOURCES,
} from "../../scripts/policy-intelligence-discovery";
import {
  createInMemoryOperatorSubmissionRepository,
  createInMemoryOperatorSubmissionStore,
} from "./editorial-memory";
import {
  createOperatorSubmissionService,
  planOperatorSubmissionOutcomes,
  validateSubmittedOfficialUrl,
} from "./operator-submission";

const FIXTURE_HTML = `<!doctype html><html><head><title>Official policy update</title><meta name="date" content="2026-10-02"></head><body><main><h1>Official policy update</h1><p>${"Detailed official content. ".repeat(20)}</p></main></body></html>`;

function fixtureFetch(
  options: { body?: string; status?: number; contentType?: string } = {}
): DiscoveryFetchOptions {
  return {
    lookupHost: () => Promise.resolve(["203.0.113.10"]),
    fetchImpl: () =>
      Promise.resolve(
        new Response(options.body ?? FIXTURE_HTML, {
          status: options.status ?? 200,
          headers: {
            "content-type": options.contentType ?? "text/html; charset=utf-8",
          },
        })
      ),
  };
}

test("the expanded discovery configuration covers announcements, consultations, bills and operator submissions", () => {
  const ids = POLICY_DISCOVERY_SOURCES.map((source) => source.id);
  for (const expected of [
    "home-affairs-guidance",
    "federal-register-legislation",
    "art-immigration-review",
    "home-affairs-announcements",
    "home-affairs-consultations",
    "ministerial-announcements",
    "parliamentary-bills",
    "operator-submitted-official-url",
  ]) {
    assert.ok(ids.includes(expected), expected);
  }
  for (const source of POLICY_DISCOVERY_SOURCES) {
    for (const seedUrl of source.seedUrls) {
      assert.equal(seedUrl.startsWith("https://"), true, seedUrl);
      assert.doesNotThrow(() => assertOfficialUrlAllowed(seedUrl, source));
    }
  }
  const operatorSource = getPolicyDiscoverySource(
    OPERATOR_SUBMISSION_SOURCE_ID
  );
  assert.deepEqual(operatorSource.allowedHostnameSuffixes, [".gov.au"]);
  // The suffix rule belongs to the operator source only.
  const guidanceSource = getPolicyDiscoverySource("home-affairs-guidance");
  assert.throws(
    () =>
      assertOfficialUrlAllowed("https://www.aph.gov.au/bills", guidanceSource),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === "disallowed_host"
  );
  assert.equal(
    assertOfficialUrlAllowed("https://www.aph.gov.au/bills", operatorSource),
    "https://www.aph.gov.au/bills"
  );
  assert.equal(
    assertOfficialUrlAllowed(
      "https://www.legislation.gov.au/F2026L01282/asmade",
      operatorSource
    ),
    "https://www.legislation.gov.au/F2026L01282/asmade"
  );
});

test("submitted URL validation enforces HTTPS, official hosts and safe syntax", () => {
  const accepted = [
    "https://immi.homeaffairs.gov.au/visas/getting-a-visa",
    "https://immi.homeaffairs.gov.au/visas/getting-a-visa?utm_source=x&page=2",
  ];
  for (const url of accepted) {
    const result = validateSubmittedOfficialUrl(url);
    assert.equal(result.status, "ok", url);
  }
  const canonical = validateSubmittedOfficialUrl(accepted[1]);
  assert.equal(canonical.status, "ok");
  if (canonical.status === "ok") {
    assert.equal(
      canonical.value,
      "https://immi.homeaffairs.gov.au/visas/getting-a-visa?page=2"
    );
  }
  for (const url of [
    "",
    "http://immi.homeaffairs.gov.au/x",
    "https://example.com/x",
    "https://immi.homeaffairs.gov.au.evil.example/x",
    "https://immi.homeaffairs.gov.au:8443/x",
    "https://user:secret@immi.homeaffairs.gov.au/x",
    "https://localhost/x",
    "https://10.0.0.5/x",
    "https://[::1]/x",
    `https://immi.homeaffairs.gov.au/${"x".repeat(2100)}`,
  ]) {
    const result = validateSubmittedOfficialUrl(url);
    assert.equal(result.status, "error", url);
    if (result.status === "error") {
      assert.equal(result.code, "invalid_official_url", url);
    }
  }
});

test("operator submission service requires capability, deduplicates and audits", async () => {
  const store = createInMemoryOperatorSubmissionStore();
  const verifiedAt = new Date("2026-09-01T00:00:00.000Z");
  store.actors.set("user-editor", {
    userId: "user-editor",
    role: "lawyer",
    email: "editor@example.test",
    emailVerifiedAt: verifiedAt,
  });
  store.actors.set("user-other", {
    userId: "user-other",
    role: "lawyer",
    email: "other@example.test",
    emailVerifiedAt: verifiedAt,
  });
  store.actors.set("user-admin", {
    userId: "user-admin",
    role: "admin",
    email: "admin@example.test",
    emailVerifiedAt: verifiedAt,
  });
  store.actors.set("user-customer", {
    userId: "user-customer",
    role: "user",
    email: "customer@example.test",
    emailVerifiedAt: verifiedAt,
  });
  store.actors.set("user-unverified", {
    userId: "user-unverified",
    role: "lawyer",
    email: "unverified@example.test",
    emailVerifiedAt: null,
  });
  store.grants.set("user-editor", { revokedAt: null });
  const service = createOperatorSubmissionService(
    createInMemoryOperatorSubmissionRepository(store)
  );

  const denied = await service.submit({
    actorUserId: "user-other",
    url: "https://immi.homeaffairs.gov.au/news",
  });
  assert.equal(denied.status, "error");
  if (denied.status === "error") {
    assert.equal(denied.code, "capability_required");
  }

  const submitted = await service.submit({
    actorUserId: "user-editor",
    url: "https://immi.homeaffairs.gov.au/news",
    note: "Check for a new announcement",
  });
  assert.equal(submitted.status, "ok");
  const duplicate = await service.submit({
    actorUserId: "user-editor",
    url: "https://immi.homeaffairs.gov.au/news",
  });
  assert.equal(duplicate.status, "error");
  if (duplicate.status === "error") {
    assert.equal(duplicate.code, "duplicate_submission");
  }
  const listed = await service.list({ actorUserId: "user-editor" });
  assert.equal(listed.status, "ok");
  if (listed.status !== "ok") {
    return;
  }
  assert.equal(listed.value.length, 1);
  assert.equal(listed.value[0].status, "pending");
  assert.equal(store.audit.length, 1);
  assert.equal(store.audit[0].action, "submit_official_url");

  // A revoked capability cannot submit either.
  store.grants.set("user-editor", { revokedAt: new Date() });
  const revoked = await service.submit({
    actorUserId: "user-editor",
    url: "https://www.aph.gov.au/bills",
  });
  assert.equal(revoked.status, "error");
});

test("official URL submission follows the D-070 authority model (verified Admin or granted lawyer)", async () => {
  const store = createInMemoryOperatorSubmissionStore();
  const verifiedAt = new Date("2026-09-01T00:00:00.000Z");
  store.actors.set("user-admin", {
    userId: "user-admin",
    role: "admin",
    email: "admin@example.test",
    emailVerifiedAt: verifiedAt,
  });
  store.actors.set("user-admin-unverified", {
    userId: "user-admin-unverified",
    role: "admin",
    email: "admin-unverified@example.test",
    emailVerifiedAt: null,
  });
  store.actors.set("user-customer", {
    userId: "user-customer",
    role: "user",
    email: "customer@example.test",
    emailVerifiedAt: verifiedAt,
  });
  store.actors.set("user-unverified", {
    userId: "user-unverified",
    role: "lawyer",
    email: "unverified@example.test",
    emailVerifiedAt: null,
  });
  store.actors.set("user-editor", {
    userId: "user-editor",
    role: "lawyer",
    email: "editor@example.test",
    emailVerifiedAt: verifiedAt,
  });
  // A forged/improperly assigned grant must never be enough on its own.
  store.grants.set("user-customer", { revokedAt: null });
  store.grants.set("user-unverified", { revokedAt: null });
  store.grants.set("user-editor", { revokedAt: null });
  const service = createOperatorSubmissionService(
    createInMemoryOperatorSubmissionRepository(store)
  );

  // D-070: the verified Admin is the firm's principal lawyer and may feed the
  // official-source pipeline without any grant.
  const adminAttempt = await service.submit({
    actorUserId: "user-admin",
    url: "https://immi.homeaffairs.gov.au/news",
  });
  assert.equal(adminAttempt.status, "ok");
  const adminListed = await service.list({ actorUserId: "user-admin" });
  assert.equal(adminListed.status, "ok");
  const adminUnverified = await service.submit({
    actorUserId: "user-admin-unverified",
    url: "https://immi.homeaffairs.gov.au/news?page=2",
  });
  assert.equal(adminUnverified.status, "error");
  if (adminUnverified.status === "error") {
    assert.equal(adminUnverified.code, "identity_not_verified");
  }
  const customerAttempt = await service.submit({
    actorUserId: "user-customer",
    url: "https://immi.homeaffairs.gov.au/news",
  });
  assert.equal(customerAttempt.status, "error");
  if (customerAttempt.status === "error") {
    assert.equal(customerAttempt.code, "publication_authority_required");
  }
  const unverifiedAttempt = await service.submit({
    actorUserId: "user-unverified",
    url: "https://immi.homeaffairs.gov.au/news",
  });
  assert.equal(unverifiedAttempt.status, "error");
  if (unverifiedAttempt.status === "error") {
    assert.equal(unverifiedAttempt.code, "identity_not_verified");
  }
  // Denied attempts leave no submission and no audit trail behind: only the
  // verified Admin's accepted submission exists at this point.
  assert.equal(store.submissions.length, 1);
  assert.equal(store.audit.length, 1);

  const allowed = await service.submit({
    actorUserId: "user-editor",
    url: "https://immi.homeaffairs.gov.au/news-update",
  });
  assert.equal(allowed.status, "ok");
  assert.equal(store.audit.length, 2);
});

test("operator submissions become normal discovery candidates through the protected fetch path", async () => {
  const discovery = await discoverOperatorSubmissionCandidates({
    submissions: [
      {
        id: "submission-1",
        submittedUrl:
          "https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation",
      },
    ],
    fetchOptions: fixtureFetch(),
    now: () => "2026-10-02T00:00:00.000Z",
  });
  assert.equal(discovery.failures.length, 0);
  assert.equal(discovery.candidates.length, 1);
  const candidate = discovery.candidates[0];
  assert.equal(candidate.sourceConfigId, OPERATOR_SUBMISSION_SOURCE_ID);
  assert.equal(candidate.discoveryStrategy, "operator_submission");
  assert.equal(candidate.sourceMetadata.urlProvenance, "operator_submission");
  assert.equal(candidate.sourceMetadata.operatorSubmissionId, "submission-1");
  assert.equal(
    candidate.canonicalUrl,
    "https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation"
  );
  assert.equal(candidate.sourceMetadata.httpStatus, 200);
});

test("a failed operator submission is reported without aborting the others", async () => {
  const lookups: string[] = [];
  const discovery = await discoverOperatorSubmissionCandidates({
    submissions: [
      {
        id: "submission-bad",
        submittedUrl: "https://example.com/not-official",
      },
      {
        id: "submission-good",
        submittedUrl: "https://immi.homeaffairs.gov.au/news",
      },
    ],
    fetchOptions: {
      lookupHost: (hostname) => {
        lookups.push(hostname);
        return Promise.resolve(["203.0.113.10"]);
      },
      fetchImpl: () =>
        Promise.resolve(
          new Response(FIXTURE_HTML, {
            status: 200,
            headers: { "content-type": "text/html" },
          })
        ),
    },
  });
  assert.equal(discovery.candidates.length, 1);
  assert.equal(discovery.failures.length, 1);
  assert.deepEqual(discovery.failures[0], {
    submissionId: "submission-bad",
    errorCode: "disallowed_host",
  });
  // The disallowed submission never reached DNS resolution.
  assert.deepEqual(lookups, ["immi.homeaffairs.gov.au"]);
});

test("oversized responses fail safely inside the existing transport limits", async () => {
  const accepted = await discoverOperatorSubmissionCandidates({
    submissions: [
      {
        id: "submission-small",
        submittedUrl: "https://immi.homeaffairs.gov.au/news",
      },
    ],
    fetchOptions: fixtureFetch({ body: "x".repeat(5000) }),
  });
  assert.equal(accepted.candidates.length, 1);

  const oversized = await discoverOperatorSubmissionCandidates({
    submissions: [
      {
        id: "submission-huge",
        submittedUrl: "https://immi.homeaffairs.gov.au/news",
      },
    ],
    fetchOptions: {
      ...fixtureFetch({ body: "ignored" }),
      fetchImpl: () =>
        Promise.resolve(
          new Response("x", {
            status: 200,
            headers: {
              "content-type": "text/html",
              "content-length": String(500 * 1024 * 1024),
            },
          })
        ),
    },
  });
  assert.equal(oversized.candidates.length, 0);
  assert.equal(oversized.failures[0]?.errorCode, "response_too_large");
});

test("submission outcomes map truthfully to consumed, failed and untouched statuses", () => {
  const planned = planOperatorSubmissionOutcomes({
    submissions: [
      { id: "s-1", candidateId: "c-1" },
      { id: "s-2", candidateId: "c-2" },
      { id: "s-3", candidateId: null },
    ],
    failures: [{ submissionId: "s-4", errorCode: "timeout" }],
    outcomes: [
      { candidateId: "c-1", outcome: "published" },
      { candidateId: "c-2", outcome: "failed", reasonCode: "provider_error" },
    ],
  });
  assert.deepEqual(planned, [
    { id: "s-1", status: "consumed", errorCode: null },
    { id: "s-2", status: "failed", errorCode: "provider_error" },
  ]);
});

test("listing operator submissions requires the same active Policy Editor authority as submitting (R3)", async () => {
  const store = createInMemoryOperatorSubmissionStore();
  const verifiedAt = new Date("2026-09-01T00:00:00.000Z");
  store.actors.set("user-editor", {
    userId: "user-editor",
    role: "lawyer",
    email: "editor@example.test",
    emailVerifiedAt: verifiedAt,
  });
  store.actors.set("user-lawyer", {
    userId: "user-lawyer",
    role: "lawyer",
    email: "lawyer@example.test",
    emailVerifiedAt: verifiedAt,
  });
  store.actors.set("user-unverified", {
    userId: "user-unverified",
    role: "lawyer",
    email: "unverified@example.test",
    emailVerifiedAt: null,
  });
  store.actors.set("user-revoked", {
    userId: "user-revoked",
    role: "lawyer",
    email: "revoked@example.test",
    emailVerifiedAt: verifiedAt,
  });
  store.actors.set("user-admin", {
    userId: "user-admin",
    role: "admin",
    email: "admin@example.test",
    emailVerifiedAt: verifiedAt,
  });
  store.actors.set("user-admin-unverified", {
    userId: "user-admin-unverified",
    role: "admin",
    email: "admin-unverified@example.test",
    emailVerifiedAt: null,
  });
  store.actors.set("user-customer", {
    userId: "user-customer",
    role: "user",
    email: "customer@example.test",
    emailVerifiedAt: verifiedAt,
  });
  // Only the editor holds a currently active grant. The unverified lawyer has a
  // grant row but an unverified identity; the revoked lawyer has a revoked
  // grant; the forged customer grant must still be refused by role.
  store.grants.set("user-editor", { revokedAt: null });
  store.grants.set("user-unverified", { revokedAt: null });
  store.grants.set("user-revoked", { revokedAt: new Date("2026-09-02") });
  store.grants.set("user-customer", { revokedAt: null });
  const service = createOperatorSubmissionService(
    createInMemoryOperatorSubmissionRepository(store)
  );
  // The authorized editor owns one pending submission to observe.
  const submitted = await service.submit({
    actorUserId: "user-editor",
    url: "https://immi.homeaffairs.gov.au/news",
  });
  assert.equal(submitted.status, "ok");

  const denials: [string, string][] = [
    ["user-customer", "publication_authority_required"],
    ["user-lawyer", "capability_required"],
    ["user-unverified", "identity_not_verified"],
    ["user-revoked", "capability_required"],
  ];
  for (const [actorUserId, expectedCode] of denials) {
    const denied = await service.list({ actorUserId });
    assert.equal(denied.status, "error", actorUserId);
    if (denied.status === "error") {
      assert.equal(denied.code, expectedCode, actorUserId);
    }
  }
  // D-070: the verified Admin is the principal lawyer and may read the queue
  // without a grant; an unverified Admin still may not.
  const adminList = await service.list({ actorUserId: "user-admin" });
  assert.equal(adminList.status, "ok");
  if (adminList.status === "ok") {
    assert.equal(adminList.value.length, 1);
  }
  const unverifiedAdminList = await service.list({
    actorUserId: "user-admin-unverified",
  });
  assert.equal(unverifiedAdminList.status, "error");
  if (unverifiedAdminList.status === "error") {
    assert.equal(unverifiedAdminList.code, "identity_not_verified");
  }
  // An unknown actor id is treated as unauthenticated, never as an empty list.
  const anonymous = await service.list({ actorUserId: "user-missing" });
  assert.equal(anonymous.status, "error");
  if (anonymous.status === "error") {
    assert.equal(anonymous.code, "unauthenticated");
  }

  // The authorized, verified Policy Editor keeps the intended workflow.
  const allowed = await service.list({ actorUserId: "user-editor" });
  assert.equal(allowed.status, "ok");
  if (allowed.status === "ok") {
    assert.equal(allowed.value.length, 1);
  }
  // Denied listing attempts leave no audit trail (nothing privileged happened).
  assert.equal(store.audit.length, 1);
});
