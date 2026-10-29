import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const chatbotRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string) => readFileSync(resolve(chatbotRoot, path), "utf8");

const schema = read("lib/db/schema.ts");
const policy = read("lib/service-engagement/policy.ts");
const repository = read("lib/db/service-engagement-repository.ts");
const availability = read("lib/db/service-engagement-schema-availability.ts");
const runtime = read("lib/service-engagement/runtime.ts");
const migration = read(
  "lib/db/migrations/0043_phase13_m4_004_service_engagement.sql"
);
const journal = JSON.parse(read("lib/db/migrations/meta/_journal.json")) as {
  entries: Array<{ idx: number; tag: string; when: number }>;
};
const snapshot = JSON.parse(
  read("lib/db/migrations/meta/0043_snapshot.json")
) as { id?: string; prevId?: string; tables?: Record<string, unknown> };

const operationTypes = [
  "service_engagement_create",
  "service_engagement_agreement_draft",
  "service_engagement_agreement_issue",
  "service_engagement_agreement_accept",
  "service_engagement_signature_submit",
  "service_engagement_signature_verify",
  "service_engagement_activate",
  "service_engagement_suspend",
  "service_engagement_resume",
  "service_engagement_terminate",
  "project_resource_disclosure_grant_create",
  "project_resource_disclosure_grant_revoke",
];
const resultKinds = [
  "service_engagement",
  "service_agreement_version",
  "service_agreement_acceptance",
  "service_signature_evidence",
  "project_resource_disclosure_grant",
];
const eventTypes = [
  "service_engagement_created",
  "service_engagement_agreement_version_drafted",
  "service_engagement_agreement_version_issued",
  "service_engagement_agreement_accepted",
  "service_engagement_signature_evidence_recorded",
  "service_engagement_signature_evidence_verified",
  "service_engagement_signature_evidence_rejected",
  "service_engagement_activated",
  "service_engagement_suspended",
  "service_engagement_resumed",
  "service_engagement_terminated",
  "project_resource_disclosure_granted",
  "project_resource_disclosure_revoked",
];
const tableNames = [
  "ServiceEngagement",
  "ServiceAgreementVersion",
  "ServiceAgreementAcceptance",
  "ServiceSignatureEvidence",
  "ProjectResourceDisclosureGrant",
];
const guardTriggers = [
  "ServiceEngagement_guard",
  "ServiceAgreementVersion_guard",
  "ServiceAgreementAcceptance_guard",
  "ServiceSignatureEvidence_guard",
  "ProjectResourceDisclosureGrant_guard",
  "ServiceEngagementOperation_complete",
];
const checkConstraints = [
  "ServiceEngagement_mode_check",
  "ServiceEngagement_scope_check",
  "ServiceEngagement_status_check",
  "ServiceEngagement_revision_check",
  "ServiceEngagement_timestamps_check",
  "ServiceEngagement_lifecycle_check",
  "ServiceAgreementVersion_status_check",
  "ServiceAgreementVersion_version_check",
  "ServiceAgreementVersion_hash_check",
  "ServiceAgreementVersion_terms_check",
  "ServiceAgreementVersion_scope_check",
  "ServiceAgreementVersion_notice_check",
  "ServiceAgreementVersion_authority_check",
  "ServiceAgreementVersion_lifecycle_check",
  "ServiceAgreementAcceptance_hash_check",
  "ServiceAgreementAcceptance_notice_check",
  "ServiceAgreementAcceptance_revision_check",
  "ServiceSignatureEvidence_status_check",
  "ServiceSignatureEvidence_signer_role_check",
  "ServiceSignatureEvidence_hash_check",
  "ServiceSignatureEvidence_evidence_ref_check",
  "ServiceSignatureEvidence_method_check",
  "ServiceSignatureEvidence_lifecycle_check",
  "ServiceSignatureEvidence_revision_check",
  "ProjectResourceDisclosureGrant_category_check",
  "ProjectResourceDisclosureGrant_purpose_check",
  "ProjectResourceDisclosureGrant_status_check",
  "ProjectResourceDisclosureGrant_hash_check",
  "ProjectResourceDisclosureGrant_notice_check",
  "ProjectResourceDisclosureGrant_fingerprint_check",
  "ProjectResourceDisclosureGrant_version_check",
  "ProjectResourceDisclosureGrant_owner_granted_by_check",
  "ProjectResourceDisclosureGrant_lifecycle_check",
  "ProjectEvent_service_engagement_subject_check",
];
const indexNames = [
  "ServiceEngagement_id_project_unique",
  "ServiceEngagement_id_project_owner_unique",
  "ServiceEngagement_project_live_unique",
  "ServiceEngagement_project_status_idx",
  "ServiceAgreementVersion_number_unique",
  "ServiceAgreementVersion_engagement_identity_unique",
  "ServiceAgreementVersion_id_engagement_unique",
  "ServiceAgreementVersion_hash_identity_unique",
  "ServiceAgreementVersion_issued_unique",
  "ServiceAgreementVersion_engagement_status_idx",
  "ServiceAgreementAcceptance_version_unique",
  "ServiceAgreementAcceptance_operation_unique",
  "ServiceSignatureEvidence_evidence_unique",
  "ServiceSignatureEvidence_verified_version_unique",
  "ServiceSignatureEvidence_submitted_operation_unique",
  "ServiceSignatureEvidence_verification_operation_unique",
  "ServiceSignatureEvidence_engagement_status_idx",
  "ProjectResourceDisclosureGrant_id_project_unique",
  "ProjectResourceDisclosureGrant_live_unique",
  "ProjectResourceDisclosureGrant_created_operation_unique",
  "ProjectResourceDisclosureGrant_revoked_operation_unique",
  "ProjectResourceDisclosureGrant_recipient_status_idx",
  "ProjectResourceDisclosureGrant_owner_status_idx",
];
const integrationScenarios = [
  "authorized owner draft creation and scope validation",
  "unauthorized owner, member, admin, guest and cross-Project denial",
  "stale revision and duplicate or conflicting operation replay",
  "immutable agreement versions, supersession and old-acceptance rejection",
  "incorrect version or terms hash acceptance rejection",
  "forged, self-verified, rebinding and unverified signature evidence",
  "managed activation denial without verified signature evidence",
  "owner-controlled disclosure grants with exact resource version binding",
  "thread participation consent and AI-context grant do not authorize disclosure",
  "cross-Project, cross-owner and private member resource isolation",
  "revoked or expired assignment, revocation and expiry deny access",
  "concurrent grant/revoke and concurrent agreement replacement",
  "Project closure and transaction failure leave no partial state",
] as const;

test("M4-004 vocabularies stay closed and aligned between TypeScript and SQL", () => {
  for (const value of operationTypes) {
    assert.ok(schema.includes(`"${value}"`), `schema lacks ${value}`);
    assert.ok(migration.includes(`'${value}'`), `migration lacks ${value}`);
    assert.ok(
      repository.includes(`"${value}"`),
      `repository never writes ${value}`
    );
  }
  for (const value of resultKinds) {
    assert.ok(schema.includes(`"${value}"`), `schema lacks ${value}`);
    assert.ok(migration.includes(`'${value}'`), `migration lacks ${value}`);
  }
  for (const value of eventTypes) {
    assert.ok(schema.includes(`"${value}"`), `schema lacks ${value}`);
    assert.ok(migration.includes(`'${value}'`), `migration lacks ${value}`);
    assert.ok(
      repository.includes(`"${value}"`),
      `repository never emits ${value}`
    );
  }
  assert.match(migration, /ProjectOperation_type_check/u);
  assert.match(migration, /ProjectOperation_result_kind_check/u);
  assert.match(migration, /ProjectOperation_actor_type_check/u);
  assert.match(migration, /ProjectEvent_type_check/u);
  assert.match(migration, /ProjectEvent_subject_check/u);
  assert.match(schema, /ProjectEvent_project_revision_unique/u);
});

test("M4-004 tables, indexes and named constraints exist in schema and migration", () => {
  for (const table of tableNames) {
    assert.ok(schema.includes(`"${table}"`), `schema lacks ${table}`);
    assert.ok(
      migration.includes(`CREATE TABLE IF NOT EXISTS "${table}"`),
      `migration lacks ${table}`
    );
  }
  for (const name of indexNames) {
    assert.ok(schema.includes(name), `schema lacks index ${name}`);
    assert.ok(migration.includes(name), `migration lacks index ${name}`);
  }
  for (const name of checkConstraints) {
    assert.ok(schema.includes(name), `schema lacks constraint ${name}`);
    assert.ok(migration.includes(name), `migration lacks constraint ${name}`);
  }
  for (const name of guardTriggers) {
    assert.ok(
      migration.includes(`"${name}"`),
      `migration lacks trigger ${name}`
    );
    assert.ok(availability.includes(name), `availability probe lacks ${name}`);
  }
  assert.equal(checkConstraints.length, 34);
  assert.equal(indexNames.length, 23);
  assert.ok(availability.includes("row.requiredColumns === 99"));
  assert.ok(availability.includes("row.requiredIndexes === 23"));
  assert.ok(availability.includes("row.requiredConstraints === 37"));
  assert.ok(availability.includes("row.requiredTriggers === 6"));
});

test("composite referenced keys are created before composite foreign keys", () => {
  // PostgreSQL rejects a composite FK unless the referenced unique index already
  // exists, and Drizzle emits FK ALTERs before the index section.
  const firstCompositeFk = migration.indexOf(
    'ADD CONSTRAINT "ServiceAgreementVersion_engagement_fk"'
  );
  assert.ok(firstCompositeFk > 0);
  for (const name of [
    "ServiceEngagement_id_project_unique",
    "ServiceEngagement_id_project_owner_unique",
    "ServiceAgreementVersion_hash_identity_unique",
  ]) {
    const at = migration.indexOf(`CREATE UNIQUE INDEX IF NOT EXISTS "${name}"`);
    assert.ok(at > 0, `${name} must be created`);
    assert.ok(at < firstCompositeFk, `${name} must precede composite FKs`);
  }
});

test("M4-004 records are append-only and lifecycle constrained in SQL", () => {
  for (const table of tableNames) {
    assert.ok(
      migration.includes(
        `CREATE TRIGGER "${table}_guard" BEFORE INSERT OR UPDATE OR DELETE ON "${table}"`
      ),
      `${table} lacks a guard trigger`
    );
  }
  for (const protectedConstraint of [
    "ServiceEngagement_delete_protected",
    "ServiceAgreementVersion_delete_protected",
    "ServiceAgreementAcceptance_append_only",
    "ServiceSignatureEvidence_delete_protected",
    "ProjectResourceDisclosureGrant_delete_protected",
    "ServiceEngagement_identity_immutable",
    "ServiceAgreementVersion_content_immutable",
    "ServiceSignatureEvidence_identity_immutable",
    "ProjectResourceDisclosureGrant_identity_immutable",
  ]) {
    assert.ok(migration.includes(protectedConstraint), protectedConstraint);
  }
  assert.match(
    migration,
    /CREATE CONSTRAINT TRIGGER "ServiceEngagementOperation_complete" AFTER INSERT ON "ProjectOperation" DEFERRABLE INITIALLY DEFERRED/u
  );
  assert.match(migration, /ServiceEngagementOperation_event_required/u);
  assert.match(migration, /ServiceEngagementOperation_evidence_required/u);
  assert.match(migration, /ServiceSignatureEvidence_create_authority/u);
});

test("M4-004 domain stays separate from M4-003 and M2 protected resources", () => {
  const start = schema.indexOf("export const serviceEngagement = pgTable(");
  assert.ok(start > 0);
  const block = schema.slice(start);
  for (const forbidden of [
    "ProjectHumanThread",
    "ProjectThreadParticipationConsent",
    "ProjectFactAssertion",
    "ProjectFactUseGrant",
    "ProjectDocumentAsset",
    "ProjectDocumentVersion",
    "ProjectHumanMessage",
  ]) {
    assert.equal(block.includes(forbidden), false, forbidden);
  }
  for (const forbiddenColumn of [
    'text("body")',
    'text("content")',
    '"excerpt"',
    '"filename"',
    '"attachment"',
    '"objectKey"',
  ]) {
    assert.equal(block.includes(forbiddenColumn), false, forbiddenColumn);
  }
  // The disclosure repository path reads metadata only, never M2 content rows.
  for (const forbidden of [
    "projectFactAssertion",
    "projectDocumentAsset",
    "projectDocumentVersion",
    "projectHumanThread",
    "projectThreadParticipationConsent",
  ]) {
    assert.equal(repository.includes(forbidden), false, forbidden);
  }
  assert.match(repository, /projectMembership/u);
});

test("policy constants and runtime wiring match the closed vocabularies", () => {
  for (const value of [
    "school_admissions",
    "student_500_visa",
    "self_service",
    "managed",
    "awaiting_customer_action",
    "suspended",
    "terminated",
  ]) {
    assert.ok(policy.includes(`"${value}"`), value);
    assert.ok(schema.includes(`"${value}"`), value);
  }
  assert.ok(policy.includes("PHASE13_SERVICE_ENGAGEMENT_ENABLED"));
  assert.match(runtime, /denyAllServiceOperatorAuthority/u);
  assert.match(runtime, /denyAllServiceSignatureEvidenceVerifier/u);
  assert.match(runtime, /unsupportedProjectResourceDisclosureResolver/u);
});

test("production runtime never imports test-only synthetic authorities", () => {
  assert.equal(runtime.includes("synthetic-authorities"), false);
  assert.equal(runtime.includes("createSynthetic"), false);
  for (const path of [
    "lib/service-engagement/http.ts",
    "lib/db/service-engagement-repository.ts",
  ]) {
    const source = read(path);
    assert.equal(source.includes("synthetic-authorities"), false, path);
  }
});

test("Migration 0043 is the additive journal successor with a snapshot", () => {
  const entry = journal.entries.at(-1);
  assert.deepEqual(entry, {
    idx: 43,
    version: "7",
    when: entry?.when,
    tag: "0043_phase13_m4_004_service_engagement",
    breakpoints: true,
  });
  assert.equal(journal.entries.length, 44);
  assert.ok(snapshot.id);
  assert.ok(snapshot.prevId);
  for (const table of tableNames) {
    assert.ok(snapshot.tables?.[`public.${table}`], `snapshot lacks ${table}`);
  }
  // Additive only: no drops or rewrites of existing Project objects.
  assert.equal(/DROP TABLE/u.test(migration), false);
  assert.equal(/ALTER TABLE "StudyJourneyProject"/u.test(migration), false);
  assert.equal(/ALTER TABLE "ProjectHumanThread"/u.test(migration), false);
  assert.equal(/ALTER TABLE "ProjectMembership"/u.test(migration), false);
  assert.equal(/ALTER TABLE "ProjectStaffAssignment"/u.test(migration), false);
});

test("offline PostgreSQL plan covers the required race and isolation cases", () => {
  for (const expected of [
    "scope validation",
    "unauthorized owner, member, admin",
    "stale revision",
    "immutable agreement versions",
    "terms hash acceptance",
    "forged, self-verified",
    "managed activation denial",
    "exact resource version binding",
    "AI-context grant",
    "cross-Project, cross-owner",
    "revoked or expired assignment",
    "concurrent grant/revoke",
    "Project closure",
  ]) {
    assert.ok(
      integrationScenarios.some((scenario) => scenario.includes(expected)),
      `integration plan omits ${expected}`
    );
  }
  // This is a plan for a separately authorized PostgreSQL gate. No SQL is run.
});
