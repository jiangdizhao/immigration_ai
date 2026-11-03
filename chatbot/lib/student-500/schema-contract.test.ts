// biome-ignore-all lint/suspicious/noMisplacedAssertion: helpers are scoped to this structural contract test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  STUDENT_500_AGE_BAND_VALUES,
  STUDENT_500_APPLICATION_PLACE_VALUES,
  STUDENT_500_APPLICATION_STATUS_VALUES,
  STUDENT_500_COE_STATUS_VALUES,
  STUDENT_500_DEPENDANT_BAND_VALUES,
  STUDENT_500_ENTRY_ROUTE_VALUES,
  STUDENT_500_EVENT_SUBJECT_KIND_VALUES,
  STUDENT_500_EVENT_TYPE_VALUES,
  STUDENT_500_EVIDENCE_STATUS_VALUES,
  STUDENT_500_HISTORY_DECLARATION_VALUES,
  STUDENT_500_HISTORY_FLAG_VALUES,
  STUDENT_500_OPERATION_RESULT_KIND_VALUES,
  STUDENT_500_OPERATION_TYPE_VALUES,
} from "@/lib/db/schema";
import {
  STUDENT_500_AGE_BANDS,
  STUDENT_500_APPLICATION_PLACES,
  STUDENT_500_APPLICATION_STATUSES,
  STUDENT_500_COE_STATUSES,
  STUDENT_500_DEPENDANT_BANDS,
  STUDENT_500_ENTRY_ROUTES,
  STUDENT_500_EVENT_TYPES,
  STUDENT_500_EVIDENCE_STATUSES,
  STUDENT_500_HISTORY_DECLARATIONS,
  STUDENT_500_HISTORY_FLAGS,
  STUDENT_500_OPERATION_RESULT_KINDS,
  STUDENT_500_OPERATION_TYPES,
} from "./contracts";
import { STUDENT_500_LEGAL_SOURCES } from "./legal-source-catalog";

/**
 * Phase 13 M6.1 schema/contract consistency (offline, no database).
 *
 * The persisted enums, the runtime contracts and the migration must not drift, and
 * the declared legal-source catalog must never claim a verification it did not
 * perform.
 */

const here = dirname(fileURLToPath(import.meta.url));
const chatbotRoot = resolve(here, "../..");
const MIGRATION = resolve(
  chatbotRoot,
  "lib/db/migrations/0048_phase13_m6_1_student500_applications.sql"
);
const JOURNAL = resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json");
const SNAPSHOT = resolve(
  chatbotRoot,
  "lib/db/migrations/meta/0048_snapshot.json"
);
const SCHEMA = resolve(chatbotRoot, "lib/db/schema.ts");

const sql = readFileSync(MIGRATION, "utf8");
const journal = JSON.parse(readFileSync(JOURNAL, "utf8")) as {
  entries: { idx: number; tag: string }[];
};
const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as {
  tables: Record<string, unknown>;
};

const TABLES = [
  "Student500Application",
  "Student500ApplicationEvent",
  "Student500ApplicationOperation",
] as const;

test("runtime contract enums and persisted enums cannot drift", () => {
  assert.deepEqual(
    [...STUDENT_500_APPLICATION_STATUS_VALUES],
    [...STUDENT_500_APPLICATION_STATUSES]
  );
  assert.deepEqual(
    [...STUDENT_500_ENTRY_ROUTE_VALUES],
    [...STUDENT_500_ENTRY_ROUTES]
  );
  assert.deepEqual(
    [...STUDENT_500_COE_STATUS_VALUES],
    [...STUDENT_500_COE_STATUSES]
  );
  assert.deepEqual(
    [...STUDENT_500_APPLICATION_PLACE_VALUES],
    [...STUDENT_500_APPLICATION_PLACES]
  );
  assert.deepEqual(
    [...STUDENT_500_AGE_BAND_VALUES],
    [...STUDENT_500_AGE_BANDS]
  );
  assert.deepEqual(
    [...STUDENT_500_DEPENDANT_BAND_VALUES],
    [...STUDENT_500_DEPENDANT_BANDS]
  );
  assert.deepEqual(
    [...STUDENT_500_EVIDENCE_STATUS_VALUES],
    [...STUDENT_500_EVIDENCE_STATUSES]
  );
  assert.deepEqual(
    [...STUDENT_500_HISTORY_DECLARATION_VALUES],
    [...STUDENT_500_HISTORY_DECLARATIONS]
  );
  assert.deepEqual(
    [...STUDENT_500_HISTORY_FLAG_VALUES],
    [...STUDENT_500_HISTORY_FLAGS]
  );
  assert.deepEqual(
    [...STUDENT_500_OPERATION_TYPE_VALUES],
    [...STUDENT_500_OPERATION_TYPES]
  );
  assert.deepEqual(
    [...STUDENT_500_OPERATION_RESULT_KIND_VALUES],
    [...STUDENT_500_OPERATION_RESULT_KINDS]
  );
  assert.deepEqual(
    [...STUDENT_500_EVENT_TYPE_VALUES],
    [...STUDENT_500_EVENT_TYPES]
  );
  assert.deepEqual(
    [...STUDENT_500_EVENT_SUBJECT_KIND_VALUES],
    ["student_500_application"]
  );
});

test("no persisted column can express eligibility or verification", () => {
  const schemaSource = readFileSync(SCHEMA, "utf8");
  const block = schemaSource.slice(
    schemaSource.indexOf('"Student500Application"'),
    schemaSource.indexOf('"Student500ApplicationOperation"')
  );
  for (const forbidden of [
    "eligib",
    "approved",
    "verifiedCoe",
    "submissionReady",
    "professionalReview",
    "checklistComplete",
  ]) {
    assert.equal(
      block.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      forbidden
    );
  }
});

test("migration 0048 is journaled and creates every M6.1 table", () => {
  /**
   * Phase-aware: later additive migrations (0049 and any later M6.2/M6.3 work)
   * follow 0048, so it is no longer the journal head. Its presence, tag and
   * snapshot linkage are still asserted, and the journal order stays monotonic.
   */
  const entry = journal.entries.find((candidate) => candidate.idx === 48);
  assert.equal(entry?.tag, "0048_phase13_m6_1_student500_applications");
  const indexes = journal.entries.map((candidate) => candidate.idx);
  assert.deepEqual(
    [...indexes].sort((left, right) => left - right),
    indexes,
    "journal indexes must be monotonic"
  );
  for (const later of journal.entries.filter(
    (candidate) => candidate.idx > 48
  )) {
    assert.ok(later.idx > 48);
  }
  for (const table of TABLES) {
    assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS "${table}"`), table);
    assert.ok(
      Object.hasOwn(snapshot.tables, `public.${table}`),
      `snapshot missing ${table}`
    );
  }
});

test("the migration is additive: no destructive statement", () => {
  for (const forbidden of [
    /\bDROP TABLE\b/iu,
    /\bDROP COLUMN\b/iu,
    /\bTRUNCATE\b/iu,
    /\bDELETE FROM\b/iu,
    /ALTER TABLE "(?!Student500)/u,
  ]) {
    assert.doesNotMatch(sql, forbidden);
  }
});

test("the declared legal-source catalog never claims verification", () => {
  assert.ok(STUDENT_500_LEGAL_SOURCES.length >= 10);
  const ids = new Set<string>();
  for (const source of STUDENT_500_LEGAL_SOURCES) {
    assert.equal(
      ids.has(source.sourceId),
      false,
      `duplicate ${source.sourceId}`
    );
    ids.add(source.sourceId);
    assert.equal(source.urlVerified, false, source.sourceId);
    assert.notEqual(
      source.verification,
      "verified_official_corpus",
      source.sourceId
    );
    assert.ok(source.provisionLocator.trim().length > 0, source.sourceId);
    assert.ok(source.instrumentTitle.trim().length > 0, source.sourceId);
    assert.ok(source.declarationNote.trim().length > 0, source.sourceId);
    if (source.officialUrl !== null) {
      assert.match(source.officialUrl, /^https:\/\//u, source.sourceId);
    }
    // Commencement is not asserted without an authoritative retrieval.
    assert.equal(source.effectiveFrom, null, source.sourceId);
    assert.equal(source.effectiveTo, null, source.sourceId);
  }
  const legislation = STUDENT_500_LEGAL_SOURCES.filter(
    (source) => source.authorityClass === "legislation"
  );
  assert.ok(legislation.length >= 5);
  assert.ok(
    STUDENT_500_LEGAL_SOURCES.some(
      (source) => source.verification === "unavailable"
    )
  );
});
