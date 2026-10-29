import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildServiceEngagementOperationRequest,
  canonicalScopeCodes,
  DISCLOSURE_GRANTABLE_RESOURCE_CATEGORIES,
  hashServiceAgreementTermsPayload,
  hashServiceEngagementOperationRequest,
  isDisclosurePurposeCode,
  isDisclosureRevocationReasonCode,
  isGrantableResourceCategory,
  isServiceEngagementEnabled,
  isServiceEvidenceRef,
  PROJECT_RESOURCE_DISCLOSURE_NOTICE,
  PROJECT_RESOURCE_DISCLOSURE_NOTICE_SHA256,
  PROJECT_RESOURCE_DISCLOSURE_NOTICE_VERSION,
  parseIsoTimestamp,
  parseServiceAgreementTerms,
  parseServicePageLimit,
  SERVICE_AGREEMENT_TERMS_SCHEMA_VERSION,
  SERVICE_ENGAGEMENT_AGREEMENT_NOTICE,
  SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_SHA256,
  SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
  SERVICE_ENGAGEMENT_SCOPE_CODES,
  sameScopeCodes,
  serviceActivationRequiresVerifiedSignature,
  serviceEngagementTransitionAllowed,
  serviceLifecycleSourceStatuses,
  serviceLifecycleTargetStatus,
} from "./policy";

const syntheticTerms = {
  schemaVersion: SERVICE_AGREEMENT_TERMS_SCHEMA_VERSION,
  title: "Synthetic engagement terms",
  serviceMode: "managed" as const,
  scopeCodes: ["student_500_visa", "school_admissions"],
  clauses: [
    {
      clauseId: "scope",
      heading: "Scope",
      body: "Synthetic clause used only to exercise hashing and binding.",
    },
  ],
};

test("engagement scope vocabulary is a closed, canonically ordered allowlist", () => {
  assert.deepEqual(canonicalScopeCodes(["student_500_visa"]), [
    "student_500_visa",
  ]);
  assert.deepEqual(
    canonicalScopeCodes(["student_500_visa", "school_admissions"]),
    ["school_admissions", "student_500_visa"]
  );
  assert.equal(canonicalScopeCodes([]), null);
  assert.equal(canonicalScopeCodes(["unknown_service"]), null);
  assert.equal(
    canonicalScopeCodes(["school_admissions", "school_admissions"]),
    null
  );
  assert.equal(
    canonicalScopeCodes([...SERVICE_ENGAGEMENT_SCOPE_CODES, "extra"]),
    null
  );
  assert.ok(sameScopeCodes(["school_admissions"], ["school_admissions"]));
  assert.equal(
    sameScopeCodes(["school_admissions"], ["student_500_visa"]),
    false
  );
});

test("agreement terms are canonical, hash-stable and reject foreign shapes", () => {
  const first = parseServiceAgreementTerms(syntheticTerms);
  assert.ok(first);
  // Key order in the input must not change the canonical hash.
  const reordered = parseServiceAgreementTerms({
    clauses: syntheticTerms.clauses,
    scopeCodes: syntheticTerms.scopeCodes,
    serviceMode: syntheticTerms.serviceMode,
    title: syntheticTerms.title,
    schemaVersion: syntheticTerms.schemaVersion,
  });
  assert.ok(reordered);
  assert.equal(first.termsSha256, reordered.termsSha256);
  assert.equal(first.payload, reordered.payload);
  assert.deepEqual(first.scopeCodes, ["school_admissions", "student_500_visa"]);
  assert.equal(
    first.termsSha256,
    hashServiceAgreementTermsPayload(first.payload)
  );

  assert.equal(
    parseServiceAgreementTerms({ ...syntheticTerms, extra: "nope" }),
    null
  );
  assert.equal(
    parseServiceAgreementTerms({ ...syntheticTerms, schemaVersion: "other" }),
    null
  );
  assert.equal(
    parseServiceAgreementTerms({
      ...syntheticTerms,
      scopeCodes: ["school_admissions", "school_admissions"],
    }),
    null
  );
  assert.equal(
    parseServiceAgreementTerms({ ...syntheticTerms, clauses: [] }),
    null
  );
  assert.equal(parseServiceAgreementTerms(null), null);
});

test("engagement lifecycle transitions and activation rules stay closed", () => {
  assert.ok(
    serviceEngagementTransitionAllowed("draft", "awaiting_customer_action")
  );
  assert.ok(
    serviceEngagementTransitionAllowed("awaiting_customer_action", "active")
  );
  assert.ok(serviceEngagementTransitionAllowed("active", "suspended"));
  assert.ok(serviceEngagementTransitionAllowed("suspended", "active"));
  assert.ok(serviceEngagementTransitionAllowed("active", "terminated"));
  assert.equal(serviceEngagementTransitionAllowed("draft", "active"), false);
  assert.equal(
    serviceEngagementTransitionAllowed("terminated", "active"),
    false
  );
  assert.equal(
    serviceEngagementTransitionAllowed("awaiting_customer_action", "suspended"),
    false
  );

  assert.equal(serviceLifecycleTargetStatus("activate"), "active");
  assert.equal(serviceLifecycleTargetStatus("resume"), "active");
  assert.equal(serviceLifecycleTargetStatus("suspend"), "suspended");
  assert.equal(serviceLifecycleTargetStatus("terminate"), "terminated");
  assert.deepEqual(serviceLifecycleSourceStatuses("activate"), [
    "awaiting_customer_action",
  ]);
  assert.ok(serviceLifecycleSourceStatuses("terminate").includes("active"));

  // Managed service always needs independently verified signature evidence.
  assert.equal(serviceActivationRequiresVerifiedSignature("managed"), true);
  assert.equal(
    serviceActivationRequiresVerifiedSignature("self_service"),
    false
  );
});

test("operation request hashes are deterministic and replay-sensitive", () => {
  const base = {
    action: "agreement_accept" as const,
    projectId: "project",
    engagementId: "engagement",
    agreementVersionId: "version",
    termsSha256: "a".repeat(64),
    customerNoticeVersion: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
    accepted: true,
    expectedProjectRevision: 4,
  };
  const first = buildServiceEngagementOperationRequest(base);
  const second = buildServiceEngagementOperationRequest({ ...base });
  assert.deepEqual(first, second);
  assert.equal(
    hashServiceEngagementOperationRequest(base),
    hashServiceEngagementOperationRequest({ ...base })
  );
  assert.notEqual(
    hashServiceEngagementOperationRequest(base),
    hashServiceEngagementOperationRequest({
      ...base,
      expectedProjectRevision: 5,
    })
  );
  assert.notEqual(
    hashServiceEngagementOperationRequest(base),
    hashServiceEngagementOperationRequest({
      ...base,
      termsSha256: "b".repeat(64),
    })
  );
  // Absent optional fields are explicitly null rather than omitted, so two
  // structurally different requests cannot share a hash accidentally.
  assert.equal(first.grantId, null);
  assert.equal(first.lifecycleAction, null);
});

test("notices, hashes and feature flag defaults are stable", () => {
  assert.match(
    SERVICE_ENGAGEMENT_AGREEMENT_NOTICE,
    /not a verified electronic signature/u
  );
  assert.match(
    PROJECT_RESOURCE_DISCLOSURE_NOTICE,
    /may revoke it at any time/u
  );
  assert.match(SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_SHA256, /^[0-9a-f]{64}$/u);
  assert.match(PROJECT_RESOURCE_DISCLOSURE_NOTICE_SHA256, /^[0-9a-f]{64}$/u);
  assert.equal(
    SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
    "m4-004-service-agreement-acceptance-v1"
  );
  assert.equal(
    PROJECT_RESOURCE_DISCLOSURE_NOTICE_VERSION,
    "m4-004-resource-disclosure-v1"
  );
  assert.equal(isServiceEngagementEnabled(undefined), false);
  assert.equal(isServiceEngagementEnabled(""), false);
  assert.equal(isServiceEngagementEnabled("TRUE"), true);
});

test("disclosure vocabulary and small parsers reject malformed input", () => {
  assert.ok(isGrantableResourceCategory("project_fact"));
  assert.ok(isGrantableResourceCategory("project_document"));
  assert.equal(isGrantableResourceCategory("private_chat"), false);
  assert.deepEqual(DISCLOSURE_GRANTABLE_RESOURCE_CATEGORIES, [
    "project_fact",
    "project_document",
  ]);
  assert.ok(isDisclosurePurposeCode("professional_review"));
  assert.equal(isDisclosurePurposeCode("marketing"), false);
  assert.ok(isDisclosureRevocationReasonCode("owner_revoked"));
  assert.equal(isDisclosureRevocationReasonCode("admin_revoked"), false);

  assert.ok(isServiceEvidenceRef("envelope_01H.ABC:def/ghi"));
  assert.equal(isServiceEvidenceRef("has space"), false);
  assert.equal(isServiceEvidenceRef("-leading"), false);

  assert.equal(
    parseServicePageLimit({ limit: null, defaultLimit: 25, maxLimit: 50 }),
    25
  );
  assert.equal(
    parseServicePageLimit({ limit: "50", defaultLimit: 25, maxLimit: 50 }),
    50
  );
  assert.equal(
    parseServicePageLimit({ limit: "51", defaultLimit: 25, maxLimit: 50 }),
    null
  );
  assert.equal(
    parseServicePageLimit({ limit: "0", defaultLimit: 25, maxLimit: 50 }),
    null
  );
  assert.equal(
    parseServicePageLimit({ limit: "1.5", defaultLimit: 25, maxLimit: 50 }),
    null
  );

  assert.equal(
    parseIsoTimestamp("2026-10-29T00:00:00.000Z")?.toISOString(),
    "2026-10-29T00:00:00.000Z"
  );
  assert.equal(parseIsoTimestamp("2026-10-29"), null);
  assert.equal(parseIsoTimestamp("not-a-time"), null);
});
