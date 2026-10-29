import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { guestRegex } from "@/lib/constants";
import {
  buildServiceOperatorAuthorityRequest,
  hashServiceOperatorAuthorityRequest,
  hashServiceResourceObservation,
  isNonGuestServiceAccount,
  SERVICE_ENGAGEMENT_OWNER_METADATA_POLICY,
  SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY,
  SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY_CODE,
  SERVICE_SIGNATURE_DECLARED_TIME_FUTURE_SKEW_MS,
  type ServiceOperatorAuthorityRequestInput,
  serviceEngagementMetadataAuthorized,
} from "./policy";

const chatbotRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string) => readFileSync(resolve(chatbotRoot, path), "utf8");
const migration = read(
  "lib/db/migrations/0043_phase13_m4_004_service_engagement.sql"
);
const schema = read("lib/db/schema.ts");
const repository = read("lib/db/service-engagement-repository.ts");
const runtime = read("lib/service-engagement/runtime.ts");
const snapshot = JSON.parse(
  read("lib/db/migrations/meta/0043_snapshot.json")
) as { tables?: Record<string, { columns?: Record<string, unknown> }> };

function authorityInput(
  overrides: Partial<ServiceOperatorAuthorityRequestInput> = {}
): ServiceOperatorAuthorityRequestInput {
  return {
    action: "issue",
    agreementVersionId: "version-1",
    agreementVersionStatus: "draft",
    engagementId: "engagement-a",
    engagementStatus: "awaiting_customer_action",
    evidenceId: null,
    evidenceVerificationStatus: null,
    operatorAssignmentId: "assignment-a",
    operatorAssignmentStatus: "active",
    operatorEligible: true,
    operatorEmailVerified: true,
    operatorRole: "lawyer",
    operatorUserId: "operator-1",
    projectId: "project-a",
    scopeCodes: ["school_admissions"],
    serviceMode: "managed",
    signerUserId: null,
    termsSha256: "f".repeat(64),
    versionNumber: 1,
    ...overrides,
  };
}

test("R1-01: an active assignment alone discloses no protected Engagement metadata", () => {
  for (const field of ["serviceMode", "scopeCodes", "status"] as const) {
    assert.equal(
      serviceEngagementMetadataAuthorized(
        SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY,
        field
      ),
      false,
      `${field} must be denied by default for staff`
    );
    assert.equal(
      serviceEngagementMetadataAuthorized(
        SERVICE_ENGAGEMENT_OWNER_METADATA_POLICY,
        field
      ),
      true,
      `${field} is authorized for the Project owner`
    );
    assert.equal(
      serviceEngagementMetadataAuthorized(
        {
          ...SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY,
          authorize: {
            ...SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY.authorize,
            [field]: true,
          },
        },
        field
      ),
      true,
      "an explicitly authorized policy field is disclosed"
    );
  }
  assert.equal(
    SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY.policyCode,
    SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY_CODE
  );
  // R2-03: staff Engagement detail is denied outright, so the staff policy is a
  // blocked position rather than a live projection. Only the owner projection
  // exists, and it must use the owner policy.
  assert.match(
    repository,
    /engagementMetadataView\(row, SERVICE_ENGAGEMENT_OWNER_METADATA_POLICY\)/u
  );
  assert.equal(
    /engagementMetadataView\(\s*engagement,\s*SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY\s*\)/u.test(
      repository
    ),
    false,
    "no staff projection may be wired"
  );
  assert.match(repository, /metadataPolicyCode: policy\.policyCode/u);
});

test("R1-04: the authority request binds action, persisted target and operator", () => {
  const base = hashServiceOperatorAuthorityRequest(authorityInput());
  assert.match(base, /^[0-9a-f]{64}$/u);
  assert.equal(hashServiceOperatorAuthorityRequest(authorityInput()), base);

  const mutations: Partial<ServiceOperatorAuthorityRequestInput>[] = [
    { action: "author_draft" },
    { action: "verify_signature" },
    { projectId: "project-b" },
    { engagementId: "engagement-b" },
    { serviceMode: "self_service" },
    { scopeCodes: ["student_500_visa"] },
    { engagementStatus: "active" },
    { agreementVersionId: "version-2" },
    { agreementVersionStatus: "issued" },
    { versionNumber: 2 },
    { termsSha256: "0".repeat(64) },
    { evidenceId: "evidence-1" },
    { evidenceVerificationStatus: "pending" },
    { signerUserId: "owner-a" },
    { operatorUserId: "operator-2" },
    { operatorRole: "admin" },
    { operatorEmailVerified: false },
    { operatorAssignmentId: null },
    { operatorAssignmentStatus: null },
    { operatorAssignmentStatus: "revoked" },
    { operatorEligible: false },
  ];
  for (const mutation of mutations) {
    assert.notEqual(
      hashServiceOperatorAuthorityRequest(authorityInput(mutation)),
      base,
      `authority hash must change for ${JSON.stringify(mutation)}`
    );
  }
  // Scope ordering is canonical, so a reordered-but-equal scope set is the same
  // request (and cannot be used to sidestep an earlier decision).
  assert.equal(
    hashServiceOperatorAuthorityRequest(
      authorityInput({ scopeCodes: ["student_500_visa", "school_admissions"] })
    ),
    hashServiceOperatorAuthorityRequest(
      authorityInput({ scopeCodes: ["school_admissions", "student_500_visa"] })
    )
  );
  assert.deepEqual(
    buildServiceOperatorAuthorityRequest(authorityInput()).scopeCodes,
    ["school_admissions"]
  );
});

test("R1-02/R2-01: disclosure metadata authorization is independent of the access decision", () => {
  // The repository computes metadata authorization from current state and
  // returns an explicit role + policy code; the handler never invents it.
  assert.match(repository, /metadataAuthorized: true/u);
  assert.match(repository, /m4-004-resource-owner-audit/u);
  assert.match(repository, /m4-004-recipient-current-access/u);
  // R2-01: detail and list share exactly one recipient predicate.
  const predicateUses = repository.match(
    /recipientGrantMetadataEligible\(\{/gu
  );
  assert.ok(
    (predicateUses?.length ?? 0) >= 2,
    "list and detail must both use the shared predicate"
  );
  assert.match(
    repository,
    /const recipientCurrent =\s*actor\.id === grant\.recipientUserId &&\s*recipientGrantMetadataEligible\(\{/u
  );
  assert.match(repository, /grant\.status !== "granted"/u);
  assert.match(
    repository,
    /grant\.expiresAt\.getTime\(\) <= now\.getTime\(\)/u
  );
  assert.match(repository, /return input\.resourceOwnerEligible;/u);
  // A DENY decision cannot be the thing that authorizes the grant object.
  assert.match(
    read("lib/service-engagement/http.ts"),
    /if \(context\.accessRole === "resource_owner_audit"\)/u
  );
  // A former recipient (assignment revoked / account demoted / grant revoked)
  // reaches notFound() before any metadata leaves the repository.
  assert.match(repository, /if \(!accessRole\) \{\n\s*\/\/ Former recipient/u);
  // FIX-04: eligibility is a SQL predicate, so the page is selected from
  // authorized rows and only post-checked in JavaScript.
  assert.match(
    repository,
    /const visible = rows\.filter\(\(grant\) =>\s*recipientGrantMetadataEligible\(\{/
  );
  assert.match(repository, /recipientGrantOwnerEligibilitySql\(project\)/u);
  assert.match(
    repository,
    /items: visible\.slice\(0, input\.limit\)\.map\(grantView\)/u
  );
  assert.match(repository, /hasMore: visible\.length > input\.limit/u);
});

test("R1-03: an ineligible resource owner invalidates the grant at evaluation", async () => {
  const { evaluateProjectResourceDisclosure } = await import("./disclosure");
  const request = {
    now: "2026-10-29T00:00:00.000Z",
    action: "read_metadata" as const,
    projectId: "project-a",
    projectActive: true,
    resourceOwnerEligible: true,
    actor: {
      userId: "lawyer-a",
      role: "lawyer" as const,
      nonGuest: true,
      emailVerified: true,
      staffEmailSha256: "a".repeat(64),
    },
    assignment: {
      assignmentId: "assignment-a",
      projectId: "project-a",
      staffUserId: "lawyer-a",
      staffEmailSha256: "a".repeat(64),
      status: "active" as const,
      purpose: "project_staff_collaboration",
    },
    grant: {
      grantId: "grant-a",
      projectId: "project-a",
      resourceOwnerUserId: "owner-a",
      recipientAssignmentId: "assignment-a",
      recipientUserId: "lawyer-a",
      resourceCategory: "project_document",
      resourceId: "11111111-1111-4111-8111-111111111111",
      resourceVersion: 3,
      resourceFingerprint: "doc-v3-abcdef",
      purposeCode: "professional_review",
      status: "granted" as const,
      expiresAt: null,
    },
    resource: {
      found: true as const,
      projectId: "project-a",
      ownerUserId: "owner-a",
      version: 3,
      category: "project_document" as const,
      fingerprint: "doc-v3-abcdef",
    },
    requested: {
      resourceCategory: "project_document",
      resourceId: "11111111-1111-4111-8111-111111111111",
      resourceVersion: 3,
      purposeCode: "professional_review",
    },
  };
  assert.deepEqual(evaluateProjectResourceDisclosure(request), {
    decision: "ALLOW",
    reasonCode: "allowed",
  });
  // The owner's membership was revoked: the very same grant now denies.
  assert.deepEqual(
    evaluateProjectResourceDisclosure({
      ...request,
      resourceOwnerEligible: false,
    }),
    { decision: "DENY", reasonCode: "resource_owner_ineligible" }
  );
  // A closed Project still wins, so telemetry stays ordered.
  assert.deepEqual(
    evaluateProjectResourceDisclosure({
      ...request,
      projectActive: false,
      resourceOwnerEligible: false,
    }),
    { decision: "DENY", reasonCode: "project_inactive" }
  );
  // A former member may not revoke: the repository distinguishes "not the
  // owner" (404) from "owner but no longer eligible" (403).
  assert.match(
    repository,
    /if \(grant\.resourceOwnerUserId !== input\.actorUserId\) \{[\s\S]{0,220}?notFound\(\);\s*\}\s*if \(!\(await isActiveProjectParticipant\(tx, project, actor\)\)\) \{[\s\S]{0,320}?new ServiceEngagementError\("forbidden"\)/u
  );
  // No general Project access is restored to enable that revocation.
  assert.match(
    repository,
    /General Project access is deliberately not restored/u
  );
});

test("R1-05: the resource observation hash binds every identity field", () => {
  const base = {
    adapterCode: "synthetic_test_resource_resolver",
    projectId: "project-a",
    resourceCategory: "project_document",
    resourceFingerprint: "doc-v3-abcdef",
    resourceId: "11111111-1111-4111-8111-111111111111",
    resourceOwnerUserId: "owner-a",
    resourceVersion: 3,
  };
  const hash = hashServiceResourceObservation(base);
  assert.match(hash, /^[0-9a-f]{64}$/u);
  assert.equal(hashServiceResourceObservation({ ...base }), hash);
  for (const mutation of [
    { adapterCode: "unsupported_no_verified_source_adapter" },
    { projectId: "project-b" },
    { resourceCategory: "project_fact" },
    { resourceFingerprint: "doc-v3-rewritten" },
    { resourceId: "22222222-2222-4222-8222-222222222222" },
    { resourceOwnerUserId: "owner-b" },
    { resourceVersion: 4 },
  ]) {
    assert.notEqual(
      hashServiceResourceObservation({ ...base, ...mutation }),
      hash,
      JSON.stringify(mutation)
    );
  }
  // The repository re-derives the observation and refuses a mismatch, and it
  // cannot create a grant without an in-transaction revalidator.
  assert.match(
    repository,
    /expectedObservation !== input\.resourceObservationSha256/u
  );
  assert.match(repository, /if \(!deps\.resourceRevalidator\)/u);
  assert.match(repository, /await deps\.resourceRevalidator\.revalidate\(/u);
  // Production composes no revalidator, so grant creation stays fail-closed.
  assert.equal(runtime.includes("resourceRevalidator:"), false);
  assert.equal(/createSynthetic|synthetic-authorities/u.test(runtime), false);
});

test("R1-05: a changed fingerprint at the same version denies evaluation", async () => {
  const { evaluateProjectResourceDisclosure } = await import("./disclosure");
  const request = {
    now: "2026-10-29T00:00:00.000Z",
    action: "read_metadata" as const,
    projectId: "project-a",
    projectActive: true,
    resourceOwnerEligible: true,
    actor: {
      userId: "lawyer-a",
      role: "lawyer" as const,
      nonGuest: true,
      emailVerified: true,
      staffEmailSha256: "a".repeat(64),
    },
    assignment: {
      assignmentId: "assignment-a",
      projectId: "project-a",
      staffUserId: "lawyer-a",
      staffEmailSha256: "a".repeat(64),
      status: "active" as const,
      purpose: "project_staff_collaboration",
    },
    grant: {
      grantId: "grant-a",
      projectId: "project-a",
      resourceOwnerUserId: "owner-a",
      recipientAssignmentId: "assignment-a",
      recipientUserId: "lawyer-a",
      resourceCategory: "project_document",
      resourceId: "11111111-1111-4111-8111-111111111111",
      resourceVersion: 3,
      resourceFingerprint: "doc-v3-abcdef",
      purposeCode: "professional_review",
      status: "granted" as const,
      expiresAt: null,
    },
    resource: {
      found: true as const,
      projectId: "project-a",
      ownerUserId: "owner-a",
      version: 3,
      category: "project_document" as const,
      fingerprint: "doc-v3-rewritten",
    },
    requested: {
      resourceCategory: "project_document",
      resourceId: "11111111-1111-4111-8111-111111111111",
      resourceVersion: 3,
      purposeCode: "professional_review",
    },
  };
  assert.deepEqual(evaluateProjectResourceDisclosure(request), {
    decision: "DENY",
    reasonCode: "resource_observation_mismatch",
  });
});

test("R1-06a: scope CHECKs reject an empty array instead of passing on NULL", () => {
  // `array_length('{}', 1)` is NULL, and a CHECK that evaluates to NULL passes.
  for (const constraint of [
    "ServiceEngagement_scope_check",
    "ServiceAgreementVersion_scope_check",
  ]) {
    const at = migration.indexOf(`ADD CONSTRAINT "${constraint}"`);
    assert.ok(at > 0, constraint);
    const statement = migration.slice(at, migration.indexOf("\n", at));
    assert.match(statement, /cardinality\("scopeCodes"\) BETWEEN 1 AND 2/u);
    assert.match(statement, /"scopeCodes" IS NOT NULL/u);
    assert.equal(statement.includes("array_length"), false, constraint);
    assert.match(
      statement,
      /<@ array\['school_admissions','student_500_visa'\]/u
    );
    // Drizzle's check() text must express the same predicate.
    const schemaAt = schema.indexOf(`"${constraint}"`);
    const schemaStatement = schema.slice(
      schemaAt,
      schema.indexOf("\n    ),", schemaAt)
    );
    assert.match(schemaStatement, /cardinality\(\$\{table\.scopeCodes\}\)/u);
    // Only the executable predicate matters; comments may explain the bug.
    const predicate = schemaStatement
      .split("\n")
      .filter((line) => line.includes("sql`"))
      .join("\n");
    assert.ok(predicate.length > 0, constraint);
    assert.equal(predicate.includes("array_length"), false, constraint);
  }
});

test("R1-06b: the current agreement version cannot belong to another engagement", () => {
  const at = migration.indexOf(
    'ADD CONSTRAINT "ServiceEngagement_current_agreement_fk"'
  );
  assert.ok(at > 0);
  const statement = migration.slice(at, migration.indexOf("\n", at));
  assert.match(
    statement,
    /FOREIGN KEY \("currentAgreementVersionId","id"\) REFERENCES "public"\."ServiceAgreementVersion"\("id","engagementId"\)/u
  );
  // The referenced key must exist as an exact unique index.
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAgreementVersion_id_engagement_unique" ON "ServiceAgreementVersion" USING btree \("id","engagementId"\)/u
  );
  assert.match(
    schema,
    /"ServiceAgreementVersion_id_engagement_unique"\s*\)\.on\(table\.id, table\.engagementId\)/u
  );
});

test("R1-06c: HTTP, repository and SQL share one declared-time skew window", () => {
  const interval = migration.match(
    /NEW\."declaredSignedAt" > NEW\."submittedAt" \+ interval '(\d+) minutes'/u
  );
  assert.ok(
    interval,
    "signature guard must bound future-declared signing times"
  );
  assert.equal(
    Number(interval[1]) * 60 * 1000,
    SERVICE_SIGNATURE_DECLARED_TIME_FUTURE_SKEW_MS
  );
  assert.match(
    read("lib/service-engagement/http.ts"),
    /now\(\)\.getTime\(\) \+ SERVICE_SIGNATURE_DECLARED_TIME_FUTURE_SKEW_MS/u
  );
  assert.match(
    repository,
    /now\.getTime\(\) \+ SERVICE_SIGNATURE_DECLARED_TIME_FUTURE_SKEW_MS/u
  );
  // No stale literal or renamed constant may survive on any side.
  for (const source of [read("lib/service-engagement/http.ts"), repository]) {
    assert.equal(
      source.includes("SERVICE_SIGNATURE_DECLARED_TIME_SKEW_MS"),
      false
    );
    assert.equal(/\+ 5 \* 60 \* 1000/u.test(source), false);
  }
});

test("R1-05/R1-06: the fingerprint column and CHECK agree across schema and SQL", () => {
  assert.match(migration, /"resourceFingerprint" varchar\(128\) NOT NULL/u);
  const fingerprintCheckAt = migration.indexOf(
    'ADD CONSTRAINT "ProjectResourceDisclosureGrant_fingerprint_check"'
  );
  assert.ok(fingerprintCheckAt > 0);
  const fingerprintCheck = migration.slice(
    fingerprintCheckAt,
    migration.indexOf("\n", fingerprintCheckAt)
  );
  assert.ok(fingerprintCheck.includes('CHECK ("resourceFingerprint" ~ '));
  assert.ok(fingerprintCheck.includes("A-Za-z0-9"));
  assert.ok(fingerprintCheck.includes("{0,127}"));
  assert.match(
    schema,
    /resourceFingerprint: varchar\("resourceFingerprint", \{\s*length: 128,\s*\}\)\.notNull\(\)/u
  );
  assert.match(schema, /"ProjectResourceDisclosureGrant_fingerprint_check"/u);
  assert.ok(
    snapshot.tables?.["public.ProjectResourceDisclosureGrant"]?.columns
      ?.resourceFingerprint,
    "snapshot must contain the fingerprint column"
  );
  // The migration stays additive and never rewrites earlier phases.
  assert.equal(/DROP TABLE/u.test(migration), false);
  assert.equal(/ALTER TABLE "ProjectStaffAssignment"/u.test(migration), false);
  assert.equal(/ALTER TABLE "ProjectHumanThread"/u.test(migration), false);
  assert.equal(/ALTER TABLE "StudyJourneyProject"/u.test(migration), false);
});

test("R1-04: no global-role operator path remains in the repository", () => {
  assert.equal(repository.includes("isServiceOperatorAccount"), false);
  assert.equal(
    /role === "admin"\)\s*&&/u.test(repository),
    false,
    "role alone must not gate a contract operation"
  );
  // Every contract mutation requires the bound authority hash.
  assert.equal(
    (
      repository.match(
        /authorityRequestSha256: input\.authorityRequestSha256/g
      ) ?? []
    ).length,
    0,
    "binding is passed positionally, not re-read from input"
  );
  assert.ok(
    (repository.match(/expectedSha256: input\.authorityRequestSha256/g) ?? [])
      .length >= 3,
    "draft, issue and verify must all assert the binding"
  );
  assert.match(repository, /if \(!input\.operator\.eligible\) \{/u);
  assert.match(repository, /new ServiceEngagementError\("forbidden"\)/u);
});

test("R2-02: the draft version id is part of the authorized identity", () => {
  const draftA = authorityInput({
    action: "author_draft",
    agreementVersionId: "draft-a",
    agreementVersionStatus: "draft",
    termsSha256: "a".repeat(64),
    versionNumber: null,
  });
  const draftB = {
    ...draftA,
    agreementVersionId: "draft-b",
  };
  // Identical terms, scope, mode, engagement and operator: only the draft id
  // differs, and that must change the canonical authority identity.
  assert.notEqual(
    hashServiceOperatorAuthorityRequest(draftA),
    hashServiceOperatorAuthorityRequest(draftB)
  );
  assert.equal(
    buildServiceOperatorAuthorityRequest(draftB).agreementVersionId,
    "draft-b"
  );
  // Re-declaring the same draft is stable (positive binding).
  assert.equal(
    hashServiceOperatorAuthorityRequest(draftA),
    hashServiceOperatorAuthorityRequest({ ...draftA })
  );
  // The repository derives that identity from the persisted/declared draft id
  // and re-derives it under lock before inserting.
  assert.match(
    repository,
    /agreementVersionId:\s*agreement\?\.id \?\? input\.draft\?\.agreementVersionId \?\? null,/u
  );
  assert.match(
    repository,
    /agreementVersionStatus:\s*agreement\?\.status \?\? \(input\.draft \? "draft" : null\),/u
  );
  assert.match(
    repository,
    /draft: \{\s*agreementVersionId: input\.agreementVersionId,/u
  );
  assert.match(repository, /expectedSha256: input\.authorityRequestSha256/u);
});

test("R2-01/FIX-04: the recipient list shares the detail predicate and pages on authorized rows", () => {
  // One predicate function, used by both read paths.
  assert.match(
    repository,
    /function recipientGrantMetadataEligible\(input: \{/u
  );
  assert.match(
    repository,
    /if \(!isEligibleStaff\(actor\)\) \{\s*return false;/u
  );
  assert.match(repository, /assignment\.id !== grant\.recipientAssignmentId/u);
  assert.match(repository, /assignment\.status !== "active"/u);
  assert.match(repository, /return input\.resourceOwnerEligible;/u);
  // FIX-04: owner/account eligibility is pushed into SQL so `LIMIT limit + 1`
  // already selects authorized rows; the shared predicate still post-checks.
  assert.match(
    repository,
    /function recipientGrantOwnerEligibilitySql\(project: ProjectRow\)/u
  );
  assert.match(
    repository,
    /from "User" owner_account\s+where owner_account\."id" = \$\{grant\.resourceOwnerUserId\}/u
  );
  assert.match(
    repository,
    /from "ProjectMembership" owner_membership\s+where owner_membership\."projectId" = \$\{grant\.projectId\}/u
  );
  assert.match(repository, /and owner_membership\."status" = 'active'/u);
  assert.match(
    repository,
    /recipientGrantOwnerEligibilitySql\(project\)\s*\)\s*\n\s*\)\s*\n\s*\.orderBy\(/u
  );
  assert.match(
    repository,
    /const visible = rows\.filter\(\(grant\) =>\s*recipientGrantMetadataEligible\(\{/u
  );
  assert.match(
    repository,
    /items: visible\.slice\(0, input\.limit\)\.map\(grantView\)/u
  );
  assert.match(repository, /hasMore: visible\.length > input\.limit/u);
  // No post-LIMIT re-scan of an unauthorized window may remain.
  assert.equal(
    /eligibleResourceOwnerIds/u.test(repository),
    false,
    "the pre-LIMIT batching helper must be gone"
  );
  assert.equal(
    /items: candidates\.slice\(0, input\.limit\)/u.test(repository),
    false,
    "unauthorized candidates must never reach the page"
  );
  // The SQL guest prefix is derived from one shared constant.
  assert.match(repository, /SERVICE_GUEST_EMAIL_SQL_REGEX/u);
});

test("FIX-03: the agreements write boundary only accepts canonical terms", async () => {
  const { parseServiceAgreementTerms, serviceAgreementTermsWriteMatches } =
    await import("./policy");
  const canonical = parseServiceAgreementTerms({
    clauses: [{ body: "Body text.", clauseId: "clause-a", heading: "Heading" }],
    schemaVersion: "m4-004-service-terms-v1",
    scopeCodes: ["school_admissions"],
    serviceMode: "managed",
    title: "Agreement",
  });
  assert.ok(canonical);
  const base = {
    scopeCodes: ["school_admissions"],
    serviceMode: "managed",
    termsPayload: canonical.payload,
    termsSha256: canonical.termsSha256,
  };
  // Positive: the canonical payload is accepted.
  assert.equal(
    serviceAgreementTermsWriteMatches(base)?.termsSha256,
    canonical.termsSha256
  );
  // Negative: reformatted but semantically identical JSON is not canonical bytes.
  const reordered = JSON.stringify({
    title: "Agreement",
    serviceMode: "managed",
    scopeCodes: ["school_admissions"],
    schemaVersion: "m4-004-service-terms-v1",
    clauses: [{ body: "Body text.", clauseId: "clause-a", heading: "Heading" }],
  });
  assert.notEqual(reordered, canonical.payload);
  assert.equal(
    serviceAgreementTermsWriteMatches({ ...base, termsPayload: reordered }),
    null
  );
  // Negative: a hash of unrelated text.
  assert.equal(
    serviceAgreementTermsWriteMatches({
      ...base,
      termsSha256: "b".repeat(64),
    }),
    null
  );
  // Negative: scope and mode must match the payload.
  assert.equal(
    serviceAgreementTermsWriteMatches({
      ...base,
      scopeCodes: ["student_500_visa"],
    }),
    null
  );
  assert.equal(
    serviceAgreementTermsWriteMatches({ ...base, serviceMode: "self_service" }),
    null
  );
  // Negative: not JSON, unknown schema version, unknown keys.
  assert.equal(
    serviceAgreementTermsWriteMatches({ ...base, termsPayload: "not-json" }),
    null
  );
  assert.equal(
    serviceAgreementTermsWriteMatches({
      ...base,
      termsPayload: canonical.payload.replace(
        "m4-004-service-terms-v1",
        "m4-004-service-terms-v2"
      ),
    }),
    null
  );
  // The repository consults the gate before any write.
  assert.match(
    repository,
    /if \(\s*!serviceAgreementTermsWriteMatches\(\{\s*scopeCodes: input\.scopeCodes,/u
  );
});

test("FIX-04: the SQL guest prefix is equivalent to guestRegex", async () => {
  const { SERVICE_GUEST_EMAIL_SQL_REGEX } = await import("./policy");
  const sqlGuest = new RegExp(SERVICE_GUEST_EMAIL_SQL_REGEX, "i");
  const samples = [
    "guest-1",
    "guest-42-3f2a1b2c-1111-4222-8333-444455556666",
    "GUEST-7",
    "guest-1@example.test",
    "guest-foo",
    "guest-",
    "notguest-1",
    "owner@example.test",
    "lawyer@m4-004.test",
  ];
  for (const email of samples) {
    // The SQL pre-filter must agree with the authoritative JavaScript pattern.
    assert.equal(sqlGuest.test(email), guestRegex.test(email), email);
    assert.equal(
      isNonGuestServiceAccount(email),
      email.trim().length > 0 && !guestRegex.test(email),
      email
    );
  }
  assert.equal(guestRegex.test("guest-1"), true);
  assert.equal(guestRegex.test("guest-1@example.test"), false);
});
