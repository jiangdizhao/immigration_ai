import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  canonicalizeEducationUrl,
  isReservedSyntheticHostForFamily,
} from "./identity";

const repositoryRoot = resolve(process.cwd(), "..");
const migrationDirectory = resolve(repositoryRoot, "chatbot/lib/db/migrations");
const migration = readFileSync(
  resolve(migrationDirectory, "0040_phase13_m3_education_catalog.sql"),
  "utf8"
);
const journal = JSON.parse(
  readFileSync(resolve(migrationDirectory, "meta/_journal.json"), "utf8")
) as {
  readonly entries: readonly {
    readonly idx: number;
    readonly tag: string;
    readonly when: number;
  }[];
};

test("the catalog adds exactly seven isolated tables with integrity and history guards", () => {
  const schema = readFileSync(
    resolve(repositoryRoot, "chatbot/lib/db/schema.ts"),
    "utf8"
  );
  const expectedTables = [
    "EducationProvider",
    "EducationCourse",
    "EducationDelivery",
    "EducationIntake",
    "EducationSource",
    "EducationSnapshot",
    "EducationFieldObservation",
  ];
  for (const table of expectedTables) {
    assert.match(schema, new RegExp(`pgTable\\(\\s*"${table}"`));
    assert.match(
      migration,
      new RegExp(`CREATE TABLE IF NOT EXISTS \\"${table}\\"`)
    );
  }
  assert.equal(
    [...migration.matchAll(/CREATE TABLE IF NOT EXISTS "Education/g)].length,
    7
  );
  for (const expected of [
    "EducationSource_catalog_family_url_unique",
    "EducationSource_provider_family_url_unique",
    "EducationFieldObservation_snapshot_evidence_fk",
    "EducationFieldObservation_course_target_fk",
    "EducationSource_access_class_check",
    "EducationProvider_aliases_check",
    "EducationSource_family_check",
    "EducationFieldObservation_source_scope_target_check",
    "EducationSnapshot_append_only",
    "EducationFieldObservation_append_only",
    "EducationSnapshot_truncate_guard",
    "EducationFieldObservation_truncate_guard",
    "EducationSource_identity_immutable",
  ]) {
    assert.ok(migration.includes(expected), `missing ${expected}`);
  }
  assert.doesNotMatch(migration, /Project|PolicyIntelligence|LegalMatter/);
});

test("migration journal appends 0040 and migration 0039 remains byte-identical", () => {
  const entries = journal.entries;
  assert.equal(entries.at(-2)?.idx, 39);
  assert.equal(entries.at(-2)?.tag, "0039_phase13_m2_round2_event_actor_scope");
  assert.equal(entries.at(-1)?.idx, 40);
  assert.equal(entries.at(-1)?.tag, "0040_phase13_m3_education_catalog");
  assert.equal(entries.at(-1)?.when, 1_793_052_726_837);
  const migration0039Path =
    "chatbot/lib/db/migrations/0039_phase13_m2_round2_event_actor_scope.sql";
  const worktreeContents = readFileSync(
    resolve(repositoryRoot, migration0039Path),
    "utf8"
  );
  assert.equal(
    createHash("sha256").update(worktreeContents).digest("hex"),
    "c82ce72d8302e6cf9404c9ac0163c43a828fb4bdbdace1a11bb9c5fb6a1826ed"
  );
});

test("migration 0040 has a new matching snapshot and no legacy migration rewrite", () => {
  const snapshot = JSON.parse(
    readFileSync(resolve(migrationDirectory, "meta/0040_snapshot.json"), "utf8")
  ) as { readonly prevId: string; readonly id: string };
  const prior = JSON.parse(
    readFileSync(resolve(migrationDirectory, "meta/0038_snapshot.json"), "utf8")
  ) as { readonly id: string };
  assert.equal(snapshot.prevId, prior.id);
  assert.ok(snapshot.id);
});

test("source host integrity uses URL authority and exact family suffixes", () => {
  const schema = readFileSync(
    resolve(repositoryRoot, "chatbot/lib/db/schema.ts"),
    "utf8"
  );
  const migrationCheck = migration.match(
    /ADD CONSTRAINT "EducationSource_class_host_check" CHECK \(([\s\S]*?)\),\n\tADD CONSTRAINT "EducationSource_language_check"/u
  )?.[1];
  const snapshot = JSON.parse(
    readFileSync(resolve(migrationDirectory, "meta/0040_snapshot.json"), "utf8")
  ) as {
    readonly version: string;
    readonly tables: Readonly<
      Record<
        string,
        {
          readonly checkConstraints?: unknown;
        }
      >
    >;
  };

  assert.ok(migrationCheck);
  // Drizzle Kit 0.25's strict v7 serializer omits CHECK constraints from snapshots.
  assert.equal(snapshot.version, "7");
  assert.equal(
    snapshot.tables["public.EducationSource"]?.checkConstraints,
    undefined
  );
  assert.ok(
    migrationCheck.includes(
      "substring(\"canonicalUrl\" from '^https://([^/@:?#]+)')"
    )
  );
  assert.match(schema, /educationUrlHostname\(table\.canonicalUrl\)/u);
  assert.ok(schema.includes("from '^https://([^/@:?#]+)')"));
  assert.ok(schema.includes("from '^https://[^/?#]+')"));
  assert.ok(schema.includes("sourceFamily} = 'CRICOS'"));
  assert.ok(schema.includes("sourceFamily} = 'STUDY_AUSTRALIA'"));
  assert.ok(schema.includes("sourceFamily} = 'INSTITUTION'"));
  assert.ok(migrationCheck.includes("[.]cricos[.]example$"));
  assert.ok(migrationCheck.includes("[.]study-australia[.]example$"));
  assert.ok(migrationCheck.includes("[.]institution[.]example$"));
  assert.ok(migrationCheck.includes("!~ '[.]example$'"));
  assert.doesNotMatch(migrationCheck, /canonicalUrl"\s*~\*/u);
});

function hostCheckOperands(check: string) {
  const extraction = check.match(
    /CASE WHEN substring\("canonicalUrl" from '([^']+)'\) ~ '([^']+)' THEN lower\(substring\("canonicalUrl" from '([^']+)'\)\) ELSE NULL END/u
  );
  if (!extraction) {
    throw new Error("hostname CASE expression is missing from migration 0040");
  }
  const familyPatterns = Object.fromEntries(
    [
      ...check.matchAll(
        /"sourceFamily" = '(CRICOS|STUDY_AUSTRALIA|INSTITUTION)' AND \(CASE WHEN[\s\S]*? END\) ~ '([^']+)'/gu
      ),
    ].map((match) => [match[1], match[2]])
  ) as Record<"CRICOS" | "STUDY_AUSTRALIA" | "INSTITUTION", string>;
  const unverifiedPattern = check.match(
    /"recordClass" = 'UNVERIFIED' AND \(CASE WHEN[\s\S]*? END\) !~ '([^']+)'/u
  )?.[1];
  if (!unverifiedPattern) {
    throw new Error(
      "UNVERIFIED reserved-host pattern is missing from migration 0040"
    );
  }
  return {
    authorityPattern: extraction[1] as string,
    authorityGuardPattern: extraction[2] as string,
    hostnamePattern: extraction[3] as string,
    familyPatterns,
    unverifiedPattern,
  };
}

function postgresSubstring(value: string, pattern: string): string | null {
  const match = new RegExp(pattern, "u").exec(value);
  if (!match) {
    return null;
  }
  // PostgreSQL substring(string FROM regex) returns the first capture when the
  // regex has a capturing group; the patterns are read directly from migration 0040.
  return (match[1] ?? match[0]) as string;
}

function migrationHostnameValue(
  canonicalUrl: string,
  operands: ReturnType<typeof hostCheckOperands>
): string | null {
  const authority = postgresSubstring(canonicalUrl, operands.authorityPattern);
  if (
    !authority ||
    !new RegExp(operands.authorityGuardPattern, "u").test(authority)
  ) {
    return null;
  }
  return (
    postgresSubstring(canonicalUrl, operands.hostnamePattern)?.toLowerCase() ??
    null
  );
}

function hostConstraintPasses(
  hostname: string | null,
  family: "CRICOS" | "STUDY_AUSTRALIA" | "INSTITUTION",
  recordClass: "SYNTHETIC" | "UNVERIFIED",
  operands: ReturnType<typeof hostCheckOperands>
): boolean {
  if (!hostname) {
    return false;
  }
  if (recordClass === "UNVERIFIED") {
    return !new RegExp(operands.unverifiedPattern, "u").test(hostname);
  }
  return new RegExp(operands.familyPatterns[family], "u").test(hostname);
}

test("source host SQL semantics use only the canonical URL hostname", () => {
  const migrationCheck = migration.match(
    /ADD CONSTRAINT "EducationSource_class_host_check" CHECK \(([\s\S]*?)\),\n\tADD CONSTRAINT "EducationSource_language_check"/u
  )?.[1];
  assert.ok(migrationCheck);
  const operands = hostCheckOperands(migrationCheck);
  assert.deepEqual(Object.keys(operands.familyPatterns).sort(), [
    "CRICOS",
    "INSTITUTION",
    "STUDY_AUSTRALIA",
  ]);
  const cases = [
    {
      label: "CRICOS synthetic host",
      url: "https://pilot.cricos.example/course",
      family: "CRICOS",
      recordClass: "SYNTHETIC",
      hostname: "pilot.cricos.example",
      passes: true,
    },
    {
      label: "Study Australia synthetic host",
      url: "https://pilot.study-australia.example/course",
      family: "STUDY_AUSTRALIA",
      recordClass: "SYNTHETIC",
      hostname: "pilot.study-australia.example",
      passes: true,
    },
    {
      label: "institution synthetic host",
      url: "https://pilot.institution.example/course",
      family: "INSTITUTION",
      recordClass: "SYNTHETIC",
      hostname: "pilot.institution.example",
      passes: true,
    },
    {
      label: "wrong source family suffix",
      url: "https://pilot.cricos.example/course",
      family: "STUDY_AUSTRALIA",
      recordClass: "SYNTHETIC",
      hostname: "pilot.cricos.example",
      passes: false,
    },
    {
      label: "reserved host cannot be UNVERIFIED",
      url: "https://pilot.cricos.example/course",
      family: "CRICOS",
      recordClass: "UNVERIFIED",
      hostname: "pilot.cricos.example",
      passes: false,
    },
    {
      label: "path suffix does not make a real host synthetic",
      url: "https://catalog.education.gov.au/course/cricos.example",
      family: "CRICOS",
      recordClass: "SYNTHETIC",
      hostname: "catalog.education.gov.au",
      passes: false,
    },
    {
      label: "query suffix does not make a real host synthetic",
      url: "https://catalog.education.gov.au/search?host=cricos.example",
      family: "CRICOS",
      recordClass: "SYNTHETIC",
      hostname: "catalog.education.gov.au",
      passes: false,
    },
    {
      label: "path suffix does not reserve a real host",
      url: "https://catalog.education.gov.au/course/.example",
      family: "CRICOS",
      recordClass: "UNVERIFIED",
      hostname: "catalog.education.gov.au",
      passes: true,
    },
    {
      label: "query suffix does not reserve a real host",
      url: "https://catalog.education.gov.au/search?mirror=.example",
      family: "CRICOS",
      recordClass: "UNVERIFIED",
      hostname: "catalog.education.gov.au",
      passes: true,
    },
    {
      label: "lookalike suffix cannot impersonate CRICOS",
      url: "https://pilot.cricos.example.attacker.test/course",
      family: "CRICOS",
      recordClass: "SYNTHETIC",
      hostname: "pilot.cricos.example.attacker.test",
      passes: false,
    },
  ] as const;

  for (const candidate of cases) {
    const canonicalUrl = canonicalizeEducationUrl(candidate.url);
    const hostname = migrationHostnameValue(canonicalUrl, operands);
    assert.equal(hostname, candidate.hostname, `${candidate.label}: hostname`);
    assert.equal(
      hostConstraintPasses(
        hostname,
        candidate.family,
        candidate.recordClass,
        operands
      ),
      candidate.passes,
      `${candidate.label}: CHECK outcome`
    );
    if (candidate.recordClass === "SYNTHETIC") {
      assert.equal(
        isReservedSyntheticHostForFamily(canonicalUrl, candidate.family),
        candidate.passes,
        `${candidate.label}: M3-001 identity mapping`
      );
    }
  }

  assert.equal(
    migrationHostnameValue(
      "https://user:secret@pilot.cricos.example/course",
      operands
    ),
    null,
    "userinfo is not hostname evidence"
  );
  assert.equal(
    migrationHostnameValue(
      "https://pilot.cricos.example:8443/course",
      operands
    ),
    null,
    "port text is not hostname evidence"
  );
  assert.equal(
    migrationHostnameValue(
      "https://catalog.education.gov.au/?next=pilot.cricos.example",
      operands
    ),
    "catalog.education.gov.au",
    "query text is excluded from hostname extraction"
  );
});
