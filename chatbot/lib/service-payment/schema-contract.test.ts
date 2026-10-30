import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SERVICE_PAYMENT_EFFECTIVE_STATUSES,
  SERVICE_PAYMENT_EVIDENCE_CATEGORIES,
  SERVICE_PAYMENT_EVIDENCE_STATUSES,
  SERVICE_PAYMENT_REQUIREMENTS,
  SERVICE_PAYMENT_RESOLUTION_KINDS,
  SERVICE_PAYMENT_VERIFICATION_METHODS,
} from "./policy";

const here = dirname(fileURLToPath(import.meta.url));
const chatbotRoot = resolve(here, "../..");

function read(path: string) {
  return readFileSync(resolve(chatbotRoot, path), "utf8");
}

const migration = read(
  "lib/db/migrations/0044_phase13_m4_005_service_payment.sql"
);
const schema = read("lib/db/schema.ts");
const runtime = read("lib/service-payment/runtime.ts");
const journal = JSON.parse(read("lib/db/migrations/meta/_journal.json")) as {
  entries: Array<{ idx: number; tag: string }>;
};

function _quoted(values: readonly string[]) {
  return values.map((value) => `'${value}'`);
}

test("the migration is the next journal entry after M4-004", () => {
  const indexes = journal.entries.map((entry) => entry.idx);
  assert.equal(new Set(indexes).size, indexes.length);
  assert.equal(Math.max(...indexes), 44);
  const last = journal.entries.at(-1);
  assert.equal(last?.idx, 44);
  assert.equal(last?.tag, "0044_phase13_m4_005_service_payment");
});

test("earlier migrations are untouched by M4-005", () => {
  const earlier = read(
    "lib/db/migrations/0043_phase13_m4_004_service_engagement.sql"
  );
  assert.ok(earlier.includes("ServiceSignatureEvidence"));
  assert.equal(earlier.includes("ServicePaymentCondition"), false);
});

test("the migration creates exactly the three M4-005 tables", () => {
  for (const table of [
    "ServicePaymentCondition",
    "ServicePaymentEvidence",
    "ServicePaymentResolution",
  ]) {
    assert.match(
      migration,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`, "u")
    );
    assert.ok(
      schema.includes(`pgTable(\n  "${table}"`) || schema.includes(`"${table}"`)
    );
  }
  assert.equal(/CREATE TABLE IF NOT EXISTS/.exec(migration)?.length, 1);
  const created = migration.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/gu) ?? [];
  assert.equal(created.length, 3);
});

test("the migration never mutates existing M4-004 tables", () => {
  for (const forbidden of [
    'ALTER TABLE "ServiceEngagement"',
    'ALTER TABLE "ServiceAgreementVersion"',
    'ALTER TABLE "ServiceAgreementAcceptance"',
    'ALTER TABLE "ServiceSignatureEvidence"',
    'ALTER TABLE "ProjectResourceDisclosureGrant"',
    "DROP TABLE",
    "TRUNCATE",
    "DELETE FROM",
  ]) {
    assert.equal(
      migration.includes(forbidden),
      false,
      `unexpected statement: ${forbidden}`
    );
  }
});

test("policy vocabularies match the migration CHECK constraints", () => {
  for (const value of SERVICE_PAYMENT_REQUIREMENTS) {
    assert.ok(
      migration.includes(`'${value}'`),
      `requirement ${value} missing from migration`
    );
  }
  for (const value of SERVICE_PAYMENT_EVIDENCE_CATEGORIES) {
    assert.ok(migration.includes(`'${value}'`));
  }
  for (const value of SERVICE_PAYMENT_EVIDENCE_STATUSES) {
    assert.ok(migration.includes(`'${value}'`));
  }
  for (const value of SERVICE_PAYMENT_RESOLUTION_KINDS) {
    assert.ok(migration.includes(`'${value}'`));
  }
  assert.equal(SERVICE_PAYMENT_EFFECTIVE_STATUSES.length, 8);
  assert.equal(SERVICE_PAYMENT_VERIFICATION_METHODS.length, 2);
});

test("the effective status vocabulary is never persisted as a column", () => {
  for (const status of SERVICE_PAYMENT_EFFECTIVE_STATUSES) {
    assert.equal(
      migration.includes(`'${status}'`),
      false,
      `${status} must stay derived, not stored`
    );
  }
  // No mutable paid flag may exist as a column in either the schema or SQL.
  assert.equal(/isPaid\s*:/u.test(schema), false);
  assert.equal(/"isPaid"/u.test(schema), false);
  assert.equal(/"isPaid"/u.test(migration), false);
});

test("the migration extends the accepted operation and event vocabularies", () => {
  for (const value of [
    "service_payment_condition_record",
    "service_payment_evidence_submit",
    "service_payment_evidence_verify",
    "service_payment_resolution_record",
  ]) {
    assert.ok(migration.includes(`'${value}'`), value);
    assert.ok(schema.includes(`"${value}"`), value);
  }
  for (const value of [
    "service_payment_condition",
    "service_payment_evidence",
    "service_payment_resolution",
  ]) {
    assert.ok(migration.includes(`'${value}'`), value);
  }
  for (const value of [
    "service_payment_condition_recorded",
    "service_payment_evidence_recorded",
    "service_payment_evidence_verified",
    "service_payment_evidence_rejected",
    "service_payment_resolution_recorded",
  ]) {
    assert.ok(migration.includes(`'${value}'`), value);
  }
  // The M4-004 constraint must survive unmodified.
  assert.ok(migration.includes('DROP CONSTRAINT "ProjectEvent_type_check"'));
  assert.equal(
    migration.includes(
      'DROP CONSTRAINT "ProjectEvent_service_engagement_subject_check"'
    ),
    false
  );
});

test("named constraints, indexes and triggers match the availability probe", () => {
  const probe = read("lib/db/service-payment-schema-availability.ts");
  const names = [
    ...(migration.match(
      /(?:CONSTRAINT|INDEX IF NOT EXISTS) "(ServicePayment\w+)"/gu
    ) ?? []),
  ];
  assert.ok(names.length > 20);
  for (const match of names) {
    const name = /"(\w+)"/u.exec(match)?.[1];
    // Foreign keys are asserted by count; the probe pins the mode/count
    // invariants that matter for fail-closed availability.
    if (name?.endsWith("_fk")) {
      continue;
    }
    if (name) {
      assert.ok(probe.includes(name), `probe missing ${name}`);
    }
  }
  for (const trigger of [
    "ServicePaymentCondition_guard",
    "ServicePaymentCondition_supersession_lineage",
    "ServicePaymentEvidence_guard",
    "ServicePaymentResolution_guard",
    "ServicePaymentOperation_complete",
  ]) {
    assert.ok(
      migration.includes(`CREATE TRIGGER "${trigger}"`) ||
        migration.includes(`CREATE CONSTRAINT TRIGGER "${trigger}"`)
    );
    assert.ok(probe.includes(trigger));
  }
});

test("append-only and immutability guards exist for every M4-005 table", () => {
  for (const table of [
    "ServicePaymentCondition",
    "ServicePaymentEvidence",
    "ServicePaymentResolution",
  ]) {
    assert.ok(
      migration.includes(`BEFORE INSERT OR UPDATE OR DELETE ON "${table}"`)
    );
  }
  assert.match(
    migration,
    /Service payment evidence cannot be verified by its submitter/u
  );
  assert.match(
    migration,
    /Service payment resolution must target verified evidence/u
  );
  assert.match(migration, /Service payment conditions are append-only/u);
});

test("deletion of financial audit evidence is restricted, not cascaded", () => {
  assert.equal(/ON DELETE cascade/iu.test(migration), false);
  const fkCount = (migration.match(/ON DELETE restrict/gu) ?? []).length;
  assert.ok(fkCount >= 10, `expected restrictive FKs, found ${fkCount}`);
});

test("the production runtime composes only deny-by-default ports", () => {
  assert.ok(runtime.includes("denyAllServicePaymentContractAuthority"));
  assert.ok(runtime.includes("denyAllServicePaymentFinanceAuthority"));
  assert.ok(runtime.includes("denyAllServicePaymentEvidenceVerifier"));
  assert.ok(runtime.includes("unsupportedServicePaymentReversalResolver"));
  assert.equal(runtime.includes("synthetic-authorities"), false);
  assert.equal(runtime.includes("createSynthetic"), false);
});

test("no production module imports the test-only synthetic ports", () => {
  for (const path of [
    "lib/service-payment/runtime.ts",
    "lib/service-payment/http.ts",
    "lib/service-payment/policy.ts",
    "lib/service-payment/authority.ts",
    "lib/service-payment/verification.ts",
    "lib/db/service-payment-repository.ts",
    "lib/db/service-payment-schema-availability.ts",
  ]) {
    assert.equal(
      read(path).includes("synthetic-authorities"),
      false,
      `${path} must not import test-only authorities`
    );
  }
});

test("the HTTP surface adds no checkout, invoice, Stripe or email capability", () => {
  const http = read("lib/service-payment/http.ts");
  for (const forbidden of [
    "stripe",
    "checkout",
    "invoice",
    "sendEmail",
    "bankAccount",
    "cardNumber",
  ]) {
    assert.equal(
      http.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `payment surface must not implement ${forbidden}`
    );
  }
});

test("the M4-005 routes are project- and engagement-scoped only", () => {
  const routes = [
    "app/api/projects/[projectId]/engagements/[engagementId]/payments/route.ts",
    "app/api/projects/[projectId]/engagements/[engagementId]/payments/condition/route.ts",
    "app/api/projects/[projectId]/engagements/[engagementId]/payments/evidence/route.ts",
    "app/api/projects/[projectId]/engagements/[engagementId]/payments/evidence/[evidenceId]/verification/route.ts",
    "app/api/projects/[projectId]/engagements/[engagementId]/payments/resolutions/route.ts",
  ];
  for (const path of routes) {
    const content = read(path);
    assert.ok(content.includes("servicePaymentHandlers"), path);
    assert.ok(content.includes("projectId"), path);
  }
});

test("the repository binds the exact agreement version and terms hash", () => {
  const repository = read("lib/db/service-payment-repository.ts");
  assert.ok(repository.includes("requireCurrentAgreement"));
  assert.ok(
    repository.includes("engagement.currentAgreementVersionId !== version.id")
  );
  assert.ok(repository.includes("contractAuthorityRequestSha256"));
  assert.ok(repository.includes("financeAuthorityRequestSha256"));
  // History is always read newest-first with a bounded limit.
  assert.match(repository, /orderBy\(\s*desc\(/u);
  assert.ok(repository.includes("SERVICE_PAYMENT_HISTORY_MAX"));
  // Lock order: project, then engagement, then accounts, then domain rows.
  const order = repository.indexOf("async function lockEngagement");
  assert.ok(order > 0);
});

/* ------------------------------------------------------------------------- *
 * M4-005 R1 corrections
 * ------------------------------------------------------------------------- */

test("FIX-01: the live slot and the supersession lineage are jointly enforceable", () => {
  // Exactly one live condition stays a hard partial unique index; it is never
  // dropped or weakened to make replacement work.
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentCondition_live_unique" ON "ServicePaymentCondition" USING btree \("projectId","engagementId"\) WHERE "ServicePaymentCondition"\."supersededAt" is null;/u
  );
  // The successor pointer is a deferrable self-referencing foreign key ...
  assert.match(
    migration,
    // PostgreSQL requires referential actions before the deferrability clause.
    /ADD CONSTRAINT "ServicePaymentCondition_superseded_by_fk" FOREIGN KEY \("supersededByConditionId","projectId"\) REFERENCES "public"\."ServicePaymentCondition"\("id","projectId"\) ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;/u
  );
  // ... and the both-way lineage check is deferred to COMMIT.
  assert.match(
    migration,
    /CREATE CONSTRAINT TRIGGER "ServicePaymentCondition_supersession_lineage" AFTER INSERT OR UPDATE ON "ServicePaymentCondition" DEFERRABLE INITIALLY DEFERRED/u
  );
  // The immediate INSERT guard now requires a predecessor that this successor has
  // already retired, which is the only ordering compatible with the live index.
  assert.match(
    migration,
    /target_row\."supersededByConditionId" IS DISTINCT FROM NEW\."id"/u
  );
  // The immediate condition guard no longer performs the cross-row lineage check:
  // only the deferred trigger may, otherwise the retire-before-insert order is
  // impossible.
  const guard = migration.slice(
    migration.indexOf('CREATE FUNCTION "phase13_m4_005_condition_guard"'),
    migration.indexOf('CREATE FUNCTION "phase13_m4_005_condition_lineage"')
  );
  assert.equal(
    guard.includes("ServicePaymentCondition_supersede_lineage"),
    false
  );
});

test("FIX-01: the repository retires the live condition before inserting its successor", () => {
  const repository = read("lib/db/service-payment-repository.ts");
  const body = repository.slice(
    repository.indexOf("function runRecordPaymentCondition("),
    repository.indexOf("export type SubmitPaymentEvidenceInput")
  );
  const retireAt = body.indexOf(".update(servicePaymentCondition)");
  const insertAt = body.indexOf(".insert(servicePaymentCondition)");
  assert.ok(retireAt > 0, "the retiring update must exist");
  assert.ok(insertAt > retireAt, "the successor insert must follow the retire");
  assert.ok(body.includes("ServicePaymentCondition_live_unique") === false);
  assert.ok(body.includes('for("update")'));
});

test("FIX-03: evaluation never depends on the bounded history window", () => {
  const repository = read("lib/db/service-payment-repository.ts");
  const facts = repository.slice(
    repository.indexOf("async function loadEvaluationFacts("),
    repository.indexOf("async function loadPaymentHistory(")
  );
  assert.equal(facts.includes("SERVICE_PAYMENT_HISTORY_MAX"), false);
  assert.ok(facts.includes("servicePaymentResolution.supersedesResolutionId"));
  assert.ok(repository.includes("evaluateServicePaymentFacts("));
  const history = repository.slice(
    repository.indexOf("async function loadPaymentHistory("),
    repository.indexOf("function statusView(")
  );
  assert.ok(history.includes("SERVICE_PAYMENT_HISTORY_MAX"));
  assert.ok(history.includes("Display-only history" as never) === false);
  assert.match(repository, /isolationLevel: "repeatable read"/u);
  assert.match(repository, /isNull\(servicePaymentCondition\.supersededAt\)/u);
});

test("FIX-02: the production read authority is deny-all and the repository enforces it", () => {
  const authority = read("lib/service-payment/authority.ts");
  assert.ok(authority.includes("denyAllServicePaymentStatusReadAuthority"));
  const repository = read("lib/db/service-payment-repository.ts");
  assert.ok(repository.includes("statusReadAuthority.decide("));
  assert.ok(repository.includes("hashServicePaymentStatusReadRequest"));
  // The deny-all read authority is the default for any repository instance that
  // does not receive an explicit decision port.
  assert.ok(repository.includes("denyAllServicePaymentStatusReadAuthority"));
  const runtime = read("lib/service-payment/runtime.ts");
  assert.ok(runtime.includes("denyAllServicePaymentStatusReadAuthority"));
  assert.equal(
    runtime.includes("createSyntheticServicePaymentStatusReadAuthority"),
    false
  );
});

test("FIX-04: verification revalidates the contract chain before transitioning", () => {
  const repository = read("lib/db/service-payment-repository.ts");
  const verify = repository.slice(
    repository.indexOf("function runRecordPaymentEvidenceVerification("),
    repository.indexOf("export type RecordPaymentResolutionInput")
  );
  assert.ok(verify.includes("requireCurrentAgreement("));
  assert.ok(verify.includes("condition.supersededAt !== null"));
  assert.ok(
    verify.includes(
      "condition.agreementVersionId !== evidence.agreementVersionId"
    )
  );
  assert.ok(
    verify.indexOf("requireCurrentAgreement(") <
      verify.indexOf("advanceProject(")
  );
});

test("FIX-05: every mutation re-derives its canonical request identity", () => {
  const repository = read("lib/db/service-payment-repository.ts");
  for (const identity of [
    "servicePaymentConditionRequestIdentity",
    "servicePaymentEvidenceRequestIdentity",
    "servicePaymentVerificationRequestIdentity",
    "servicePaymentResolutionRequestIdentity",
  ]) {
    assert.ok(repository.includes(identity), identity);
  }
  const http = read("lib/service-payment/http.ts");
  for (const identity of [
    "servicePaymentConditionRequestIdentity",
    "servicePaymentEvidenceRequestIdentity",
    "servicePaymentVerificationRequestIdentity",
    "servicePaymentResolutionRequestIdentity",
  ]) {
    assert.ok(http.includes(identity), identity);
  }
  // A mismatching caller-supplied hash is refused, never silently accepted.
  assert.match(
    repository,
    /requestHash !== input\.requestHash[\s\S]{0,80}integrity_conflict/u
  );
});

test("FIX-05: a correction cannot name evidence at any layer", () => {
  assert.match(
    migration,
    /"resolutionKind" = 'correction' AND "evidenceId" IS NULL/u
  );
  const policy = read("lib/service-payment/policy.ts");
  assert.match(
    policy,
    /kind === "correction"[\s\S]{0,160}supersedesResolutionId !== null && input\.evidenceId === null/u
  );
});

/* ------------------------------------------------------------------------- *
 * M4-005 final pre-database convergence
 * ------------------------------------------------------------------------- */

test("Correction A: one correction per resolution is enforced in every layer", () => {
  const index = "ServicePaymentResolution_superseded_target_unique";
  // Migration 0044
  assert.match(
    migration,
    new RegExp(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${index}" ON "ServicePaymentResolution" USING btree \\("supersedesResolutionId"\\) WHERE "ServicePaymentResolution"\\."supersedesResolutionId" is not null;`,
      "u"
    )
  );
  // Drizzle schema
  const schema = read("lib/db/schema.ts");
  assert.ok(schema.includes(index));
  assert.match(
    schema,
    /supersededTargetUnique: uniqueIndex\(\s*"ServicePaymentResolution_superseded_target_unique"\s*\)\s*\.on\(table\.supersedesResolutionId\)\s*\.where\(sql`\$\{table\.supersedesResolutionId\} is not null`\)/u
  );
  // Drizzle snapshot
  const snapshot = JSON.parse(
    read("lib/db/migrations/meta/0044_snapshot.json")
  ) as {
    tables: Record<
      string,
      { indexes: Record<string, { isUnique: boolean; where?: string }> }
    >;
  };
  const entry =
    snapshot.tables["public.ServicePaymentResolution"]?.indexes[index];
  assert.ok(entry, "the snapshot must record the new unique index");
  assert.equal(entry.isUnique, true);
  assert.equal(
    entry.where,
    '"ServicePaymentResolution"."supersedesResolutionId" is not null'
  );
  // The availability probe covers it.
  assert.ok(
    read("lib/db/service-payment-schema-availability.ts").includes(index)
  );
});

test("Correction A: append-only semantics and same-condition validation are unchanged", () => {
  const guard = migration.slice(
    migration.indexOf('CREATE FUNCTION "phase13_m4_005_resolution_guard"'),
    migration.indexOf('CREATE TRIGGER "ServicePaymentResolution_guard"')
  );
  assert.match(guard, /are append-only/u);
  // Same-condition validation and the "already superseded" pre-check are preserved.
  assert.match(guard, /condition_row\."supersededAt" IS NOT NULL/u);
  assert.match(guard, /That resolution was already superseded/u);
  assert.match(guard, /A correction must supersede one earlier resolution/u);
  assert.equal(guard.includes("UPDATE"), false);
});

test("Correction B: persisted audit fields participate in the canonical identity", () => {
  const policy = read("lib/service-payment/policy.ts");
  const repository = read("lib/db/service-payment-repository.ts");
  const http = read("lib/service-payment/http.ts");
  for (const field of [
    "contractAuthorityCode",
    "financeAuthorityCode",
    "observationCode",
  ]) {
    assert.ok(policy.includes(field), `${field} must exist in policy.ts`);
    assert.ok(
      repository.includes(field),
      `${field} must exist in the repository`
    );
    assert.ok(http.includes(field), `${field} must exist in the HTTP layer`);
  }
  // The provenance *digest* is derived inside the shared builder, so only policy.ts
  // names it; both callers pass the raw value to that one builder.
  assert.ok(
    policy.includes("verificationProvenanceSha256"),
    "verificationProvenanceSha256 must exist in policy.ts"
  );
  // Raw provenance never enters the hash: only a domain-separated digest does.
  assert.match(
    policy,
    /verificationProvenanceSha256: servicePaymentVerificationProvenanceSha256\(\s*input\.provenance\s*\)/u
  );
  assert.equal(
    /provenance: input\.provenance/u.test(policy),
    false,
    "the raw provenance text must not be an identity field"
  );
  // Both layers hand the same material values to the shared builders.
  for (const wiring of [
    "contractAuthorityCode: input.contractAuthorityCode",
    "financeAuthorityCode: input.financeAuthorityCode",
    "observationCode: input.observationCode",
    "provenance: outcome.provenance",
  ]) {
    assert.ok(repository.includes(wiring), `repository must bind ${wiring}`);
  }
  for (const wiring of [
    "contractAuthorityCode: decision.authorityCode",
    "financeAuthorityCode: decision.authorityCode",
    "observationCode,",
    "provenance: outcome.provenance",
  ]) {
    assert.ok(http.includes(wiring), `HTTP must bind ${wiring}`);
  }
});

test("Correction C: condition replacement selects the live row, never the newest timestamp", () => {
  const repository = read("lib/db/service-payment-repository.ts");
  const body = repository.slice(
    repository.indexOf("function runRecordPaymentCondition("),
    repository.indexOf("export type SubmitPaymentEvidenceInput")
  );
  const selection = body.slice(
    body.indexOf("Correction C: the replacement target"),
    body.indexOf("const now = new Date();")
  );
  assert.ok(selection.includes("isNull(servicePaymentCondition.supersededAt)"));
  assert.equal(selection.includes("orderBy"), false);
  assert.equal(selection.includes("createdAt"), false);
  // The atomic sequence and its guards are untouched.
  assert.ok(body.includes('.for("update")'));
  assert.ok(body.includes("deferred self-referencing FK"));
  assert.ok(body.includes("supersededByConditionId: conditionId"));
});

/* ------------------------------------------------------------------------- *
 * Migration installation contract (Stage 3A repair)
 * ------------------------------------------------------------------------- */

test("the composite resolution FK target is declared in every schema layer", () => {
  const index = "ServicePaymentCondition_id_project_engagement_unique";
  const snapshot = JSON.parse(
    read("lib/db/migrations/meta/0044_snapshot.json")
  ) as {
    tables: Record<
      string,
      {
        indexes: Record<
          string,
          {
            columns: { expression: string }[];
            isUnique: boolean;
            where?: string;
          }
        >;
      }
    >;
  };
  // Drizzle schema
  assert.match(
    read("lib/db/schema.ts"),
    /idProjectEngagementUnique: uniqueIndex\(\s*"ServicePaymentCondition_id_project_engagement_unique"\s*\)\s*\.on\(\s*table\.id,\s*table\.projectId,\s*table\.engagementId\s*\)/u
  );
  // Migration 0044 (non-partial, usable as a referenced key)
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS "ServicePaymentCondition_id_project_engagement_unique" ON "ServicePaymentCondition" USING btree \("id","projectId","engagementId"\);/u
  );
  // Drizzle snapshot
  const entry =
    snapshot.tables["public.ServicePaymentCondition"]?.indexes[index];
  assert.ok(entry, "the snapshot must record the composite target index");
  assert.equal(entry.isUnique, true);
  assert.equal(entry.where, undefined);
  assert.deepEqual(
    entry.columns.map((column) => column.expression),
    ["id", "projectId", "engagementId"]
  );
  // Availability probe
  assert.ok(
    read("lib/db/service-payment-schema-availability.ts").includes(index)
  );
});

test("Migration 0044 keeps the contractual installation order", () => {
  const lines = migration.split("\n");
  const firstIndex = lines.findIndex((line) =>
    line.startsWith("CREATE UNIQUE INDEX IF NOT EXISTS")
  );
  const firstForeignKey = lines.findIndex((line) =>
    line.includes("FOREIGN KEY")
  );
  const firstFunction = lines.findIndex((line) =>
    line.startsWith('CREATE FUNCTION "phase13_m4_005_')
  );
  assert.ok(firstIndex > 0 && firstForeignKey > 0 && firstFunction > 0);
  assert.ok(
    firstIndex < firstForeignKey,
    "every index that backs an FK must be created before the FK"
  );
  assert.ok(
    firstForeignKey < firstFunction,
    "foreign keys must exist before the dependent guard functions"
  );
  // Nothing outside M4-005 is created by this migration.
  for (const table of [
    "ServicePaymentCondition",
    "ServicePaymentEvidence",
    "ServicePaymentResolution",
  ]) {
    assert.match(
      migration,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`, "u")
    );
  }
});
