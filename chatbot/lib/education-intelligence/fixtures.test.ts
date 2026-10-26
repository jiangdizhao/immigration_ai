import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateEducationDataset } from "./contracts";
import {
  createSyntheticEducationFixture,
  createSyntheticEducationFixtureSet,
} from "./fixtures";

test("the five pathway fixtures and negative cases stay synthetic and offline", () => {
  const fixtures = createSyntheticEducationFixtureSet();
  const required = [
    "ELICOS",
    "VET",
    "UNDERGRADUATE",
    "COURSEWORK_MASTERS",
    "RESEARCH",
  ];
  for (const pathway of required) {
    const fixture = fixtures.find((item) => item.scenario === pathway);
    assert.ok(fixture, pathway);
    assert.equal(fixture.marker, "TEST_ONLY_SYNTHETIC");
    assert.equal(validateEducationDataset(fixture.dataset).ok, true, pathway);
  }

  for (const scenario of [
    "MULTI_CAMPUS_MULTIPLE_INTAKES",
    "MISSING_FEE_AND_DEADLINE",
    "INCOMPATIBLE_FEES",
    "CONFLICTING_OFFICIAL_OBSERVATIONS",
    "WITHDRAWN_FIELD",
    "STALE_AFTER_FAILED_PARSE",
    "AMBIGUOUS_COURSE_IDENTITIES",
  ] as const) {
    const fixture = createSyntheticEducationFixture(scenario);
    assert.equal(fixture.marker, "TEST_ONLY_SYNTHETIC", scenario);
    assert.equal(validateEducationDataset(fixture.dataset).ok, true, scenario);
  }
});

test("same fictional course retains separate campuses and intake identities", () => {
  const fixture = createSyntheticEducationFixture(
    "MULTI_CAMPUS_MULTIPLE_INTAKES"
  );
  assert.equal(fixture.dataset.courses.length, 1);
  assert.equal(fixture.dataset.deliveries.length, 2);
  assert.equal(fixture.dataset.intakes.length, 3);
  assert.equal(
    new Set(fixture.dataset.deliveries.map((item) => item.campusId)).size,
    2
  );
  assert.equal(
    new Set(fixture.dataset.intakes.map((item) => item.intakeId)).size,
    3
  );
  assert.equal(
    fixture.dataset.deliveries[0].city,
    fixture.dataset.deliveries[1].city
  );
});

test("the offline kernel does not import Projects, customer facts, Policy Intelligence or live paths", () => {
  const files = [
    "contracts.ts",
    "identity.ts",
    "field-resolution.ts",
    "fixtures.ts",
  ];
  const forbiddenImports =
    /from\s+["'][^"']*(?:project-facts|project-documents|projects\/|policy-intelligence|workspace\/|\/db\/|\/api\/)/i;
  for (const file of files) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, forbiddenImports, file);
    assert.doesNotMatch(source, /\bfetch\s*\(/, file);
    assert.doesNotMatch(source, /\bprocess\.env\b/, file);
  }
});
