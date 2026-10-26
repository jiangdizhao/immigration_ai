import assert from "node:assert/strict";
import test from "node:test";
import {
  type EducationDataset,
  type EducationSource,
  validateEducationDataset,
} from "./contracts";
import {
  EducationContractError,
  resolveEducationField,
} from "./field-resolution";
import {
  createSyntheticEducationFixture,
  createSyntheticEducationFixtureSet,
} from "./fixtures";
import { canonicalizeEducationUrl } from "./identity";

test("every generated pathway and edge fixture is structurally valid and marked synthetic", () => {
  const fixtures = createSyntheticEducationFixtureSet();
  assert.equal(fixtures.length >= 5, true);
  for (const fixture of fixtures) {
    assert.equal(fixture.marker, "TEST_ONLY_SYNTHETIC");
    assert.equal(
      validateEducationDataset(fixture.dataset).ok,
      true,
      fixture.scenario
    );
    assert.equal(
      fixture.dataset.sources.every(
        (source) => source.recordClass === "SYNTHETIC"
      ),
      true,
      fixture.scenario
    );
    assert.equal(
      fixture.dataset.sources.every((source) =>
        new URL(source.canonicalUrl).hostname.endsWith(".example")
      ),
      true,
      fixture.scenario
    );
  }
});

test("canonical source URLs require safe HTTPS identity and normalize fragments", () => {
  assert.equal(
    canonicalizeEducationUrl(
      "HTTPS://Registry.CRicos.Example:443/provider/a#section"
    ),
    "https://registry.cricos.example/provider/a"
  );
  for (const url of [
    "http://registry.cricos.example/provider/a",
    "https://user:pass@registry.cricos.example/provider/a",
    "https://127.0.0.1/provider/a",
    "https://localhost/provider/a",
    "file:///tmp/course.pdf",
    "not a url",
  ]) {
    assert.throws(() => canonicalizeEducationUrl(url), url);
  }
});

test("provider display names and course titles are required", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const invalid: unknown = {
    ...fixture.dataset,
    providers: fixture.dataset.providers.map((provider) => ({
      ...provider,
      displayName: undefined,
    })),
    courses: fixture.dataset.courses.map((course) => ({
      ...course,
      title: undefined,
    })),
  };
  const validation = validateEducationDataset(invalid);
  assert.equal(validation.ok, false);
  assert.equal(
    validation.issues.some(
      (issue) =>
        issue.code === "INVALID_ENTITY_TEXT" &&
        issue.path.endsWith(".displayName")
    ),
    true
  );
  assert.equal(
    validation.issues.some(
      (issue) =>
        issue.code === "INVALID_ENTITY_TEXT" && issue.path.endsWith(".title")
    ),
    true
  );
});

test("synthetic evidence cannot establish known fields on an unverified entity hierarchy", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const invalid: EducationDataset = {
    ...fixture.dataset,
    providers: fixture.dataset.providers.map((item) => ({
      ...item,
      recordClass: "UNVERIFIED",
    })),
    courses: fixture.dataset.courses.map((item) => ({
      ...item,
      recordClass: "UNVERIFIED",
    })),
    deliveries: fixture.dataset.deliveries.map((item) => ({
      ...item,
      recordClass: "UNVERIFIED",
    })),
    intakes: fixture.dataset.intakes.map((item) => ({
      ...item,
      recordClass: "UNVERIFIED",
    })),
  };
  const validation = validateEducationDataset(invalid);
  assert.equal(validation.ok, false);
  assert.equal(
    validation.issues.some(
      (issue) => issue.code === "SOURCE_ENTITY_RECORD_CLASS_MISMATCH"
    ),
    true
  );
  assert.equal(
    validation.issues.some(
      (issue) => issue.code === "OBSERVATION_ENTITY_RECORD_CLASS_MISMATCH"
    ),
    true
  );
  assert.throws(
    () =>
      resolveEducationField(
        invalid,
        { type: "COURSE", id: invalid.courses[0].courseId },
        "TUITION_FEE",
        { assessedAt: "2026-10-27T12:00:00.000Z", assessmentDate: "2026-10-27" }
      ),
    EducationContractError
  );
});

test("a source family label does not promote an unverified source into authority", () => {
  const fixture = createSyntheticEducationFixture("ELICOS");
  const source = fixture.dataset.sources.find(
    (item) => item.sourceFamily === "CRICOS"
  );
  assert.ok(source);
  const unverifiedSource: EducationSource = {
    ...source,
    recordClass: "UNVERIFIED",
    authorityName: "CRICOS official register",
    originalUrl: "https://unverified-source.invalid/provider/register/",
    canonicalUrl: "https://unverified-source.invalid/provider/register/",
    accessMode: "CURATED_REFERENCE",
  };
  const dataset: EducationDataset = {
    ...fixture.dataset,
    providers: fixture.dataset.providers.map((item) => ({
      ...item,
      recordClass: "UNVERIFIED",
    })),
    courses: fixture.dataset.courses.map((item) => ({
      ...item,
      recordClass: "UNVERIFIED",
    })),
    deliveries: fixture.dataset.deliveries.map((item) => ({
      ...item,
      recordClass: "UNVERIFIED",
    })),
    intakes: fixture.dataset.intakes.map((item) => ({
      ...item,
      recordClass: "UNVERIFIED",
    })),
    sources: [unverifiedSource],
    snapshots: fixture.dataset.snapshots
      .filter((snapshot) => snapshot.sourceId === source.sourceId)
      .map((snapshot) => ({
        ...snapshot,
        recordClass: "UNVERIFIED" as const,
        sourceUrl: unverifiedSource.canonicalUrl,
      })),
    observations: fixture.dataset.observations
      .filter(
        (observation) => observation.provenance.sourceId === source.sourceId
      )
      .map((observation) => ({
        ...observation,
        recordClass: "UNVERIFIED" as const,
        provenance: {
          ...observation.provenance,
          sourceUrl: unverifiedSource.canonicalUrl,
        },
      })),
  };
  assert.equal(validateEducationDataset(dataset).ok, true);
  const resolution = resolveEducationField(
    dataset,
    { type: "COURSE", id: fixture.dataset.courses[0].courseId },
    "CRICOS_COURSE_STATUS",
    { assessedAt: "2026-10-27T12:00:00.000Z", assessmentDate: "2026-10-27" }
  );
  assert.equal(resolution.status, "UNKNOWN");
  assert.deepEqual(resolution.reasons, ["SOURCE_NOT_VERIFIED"]);
  assert.equal(resolution.resolvedValue, undefined);
});

test("CRICOS registration evidence cannot be relabeled as school admissions evidence", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const course = fixture.dataset.courses[0];
  const cricos = fixture.dataset.sources.find(
    (source) => source.sourceFamily === "CRICOS"
  );
  const snapshot = fixture.dataset.snapshots.find(
    (item) => item.sourceId === cricos?.sourceId
  );
  assert.ok(cricos && snapshot);
  const admissions = fixture.dataset.observations.find(
    (item) => item.fieldKey === "COURSE_ADMISSIONS_CRITERIA"
  );
  assert.ok(admissions);
  const invalid: EducationDataset = {
    ...fixture.dataset,
    observations: fixture.dataset.observations.map((item) =>
      item.observationId === admissions.observationId
        ? {
            ...item,
            provenance: {
              ...item.provenance,
              sourceId: cricos.sourceId,
              snapshotId: snapshot.snapshotId,
              sourceFamily: "CRICOS" as const,
              sourceUrl: snapshot.sourceUrl,
              contentSha256: snapshot.contentSha256 as string,
            },
          }
        : item
    ),
  };
  const validation = validateEducationDataset(invalid);
  assert.equal(validation.ok, false);
  assert.equal(
    validation.issues.some(
      (issue) => issue.code === "SOURCE_CLAIM_DOMAIN_MISMATCH"
    ),
    true
  );
  assert.equal(course.courseId, admissions.target.id);
});

test("provider-scoped provenance cannot support a different provider", () => {
  const fixture = createSyntheticEducationFixture("ELICOS");
  const provider = fixture.dataset.providers[0];
  const secondProvider = {
    providerId: "test-provider-out-of-scope",
    recordClass: "SYNTHETIC" as const,
    displayName: "Synthetic out-of-scope provider",
  };
  const institutionSource = fixture.dataset.sources.find(
    (source) => source.sourceFamily === "INSTITUTION"
  );
  assert.ok(institutionSource);
  const invalid: EducationDataset = {
    ...fixture.dataset,
    providers: [...fixture.dataset.providers, secondProvider],
    sources: fixture.dataset.sources.map((source) =>
      source.sourceId === institutionSource.sourceId
        ? {
            ...source,
            scope: {
              kind: "PROVIDER" as const,
              providerId: secondProvider.providerId,
            },
          }
        : source
    ),
  };
  const validation = validateEducationDataset(invalid);
  assert.equal(validation.ok, false);
  assert.equal(
    validation.issues.some(
      (issue) => issue.code === "CROSS_PROVIDER_PROVENANCE"
    ),
    true
  );
  assert.ok(provider.providerId !== secondProvider.providerId);
});

test("source IDs, canonical URL, snapshot hash and observation lineage are checked exactly", () => {
  const fixture = createSyntheticEducationFixture("UNDERGRADUATE");
  const targetObservation = fixture.dataset.observations[0];
  const invalid: EducationDataset = {
    ...fixture.dataset,
    observations: fixture.dataset.observations.map((observation) =>
      observation.observationId === targetObservation.observationId
        ? {
            ...observation,
            provenance: {
              ...observation.provenance,
              contentSha256: "0".repeat(64),
            },
          }
        : observation
    ),
  };
  const validation = validateEducationDataset(invalid);
  assert.equal(validation.ok, false);
  assert.equal(
    validation.issues.some((issue) => issue.code === "PROVENANCE_MISMATCH"),
    true
  );
});

test("duplicate source family, scope and canonical URL is ambiguous", () => {
  const fixture = createSyntheticEducationFixture("UNDERGRADUATE");
  const original = fixture.dataset.sources[0];
  const invalid: EducationDataset = {
    ...fixture.dataset,
    sources: [
      ...fixture.dataset.sources,
      { ...original, sourceId: "test-source-same-identity" },
    ],
  };
  const validation = validateEducationDataset(invalid);
  assert.equal(validation.ok, false);
  assert.equal(
    validation.issues.some(
      (issue) =>
        issue.code === "AMBIGUOUS_EXTERNAL_IDENTITY" &&
        issue.message.includes("source family")
    ),
    true
  );
});

test("malformed collection records are rejected without throwing", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const invalid: unknown = {
    ...fixture.dataset,
    observations: [...fixture.dataset.observations, null],
  };
  const validation = validateEducationDataset(invalid);
  assert.equal(validation.ok, false);
  assert.equal(
    validation.issues.some((issue) => issue.code === "INVALID_RECORD"),
    true
  );

  const malformedCodeScope: unknown = {
    ...fixture.dataset,
    courses: [
      {
        ...fixture.dataset.courses[0],
        providerId: Symbol("invalid provider id"),
        institutionCourseCode: "SYNTHETIC-CODE",
      },
    ],
  };
  const identityValidation = validateEducationDataset(malformedCodeScope);
  assert.equal(identityValidation.ok, false);
});

test("synthetic source family must use its matching reserved test host", () => {
  const fixture = createSyntheticEducationFixture("RESEARCH");
  const institution = fixture.dataset.sources.find(
    (source) => source.sourceFamily === "INSTITUTION"
  );
  assert.ok(institution);
  const invalid: EducationDataset = {
    ...fixture.dataset,
    sources: fixture.dataset.sources.map((source) =>
      source.sourceId === institution.sourceId
        ? {
            ...source,
            originalUrl:
              "https://registry.cricos.example/not-an-institution-source",
            canonicalUrl:
              "https://registry.cricos.example/not-an-institution-source",
          }
        : source
    ),
    snapshots: fixture.dataset.snapshots.map((snapshot) =>
      snapshot.sourceId === institution.sourceId
        ? {
            ...snapshot,
            sourceUrl:
              "https://registry.cricos.example/not-an-institution-source",
          }
        : snapshot
    ),
    observations: fixture.dataset.observations.map((observation) =>
      observation.provenance.sourceId === institution.sourceId
        ? {
            ...observation,
            provenance: {
              ...observation.provenance,
              sourceUrl:
                "https://registry.cricos.example/not-an-institution-source",
            },
          }
        : observation
    ),
  };
  const validation = validateEducationDataset(invalid);
  assert.equal(validation.ok, false);
  assert.equal(
    validation.issues.some(
      (issue) => issue.code === "SYNTHETIC_SOURCE_FAMILY_URL_MISMATCH"
    ),
    true
  );
});
