import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type {
  EducationDataset,
  EducationFieldObservation,
  EducationSnapshot,
} from "./contracts";
import { resolveEducationField } from "./field-resolution";
import {
  createSyntheticEducationFixture,
  syntheticFixtureTimes,
} from "./fixtures";

const CURRENT_ASSESSMENT = {
  assessedAt: "2026-10-27T12:00:00.000Z",
  assessmentDate: "2026-10-27",
} as const;

function feeInput(
  fixtureName:
    | "VET"
    | "MISSING_FEE_AND_DEADLINE"
    | "CONFLICTING_OFFICIAL_OBSERVATIONS"
    | "INCOMPATIBLE_FEES"
    | "WITHDRAWN_FIELD"
    | "STALE_AFTER_FAILED_PARSE"
) {
  const fixture = createSyntheticEducationFixture(fixtureName);
  return { fixture, courseId: fixture.dataset.courses[0].courseId };
}

test("missing tuition and intake deadline remain UNKNOWN without fabricated defaults", () => {
  const fixture = createSyntheticEducationFixture("MISSING_FEE_AND_DEADLINE");
  const course = fixture.dataset.courses[0];
  const intake = fixture.dataset.intakes[0];
  const fee = resolveEducationField(
    fixture.dataset,
    { type: "COURSE", id: course.courseId },
    "TUITION_FEE",
    CURRENT_ASSESSMENT
  );
  const deadline = resolveEducationField(
    fixture.dataset,
    { type: "INTAKE", id: intake.intakeId },
    "APPLICATION_DEADLINE",
    CURRENT_ASSESSMENT
  );
  assert.equal(fee.status, "UNKNOWN");
  assert.equal(deadline.status, "UNKNOWN");
  assert.deepEqual(fee.reasons, ["NO_OBSERVATIONS"]);
  assert.equal(fee.resolvedValue, undefined);
  assert.equal(deadline.resolvedValue, undefined);
  assert.equal(fixture.dataset.intakes[0].applicationDeadline, undefined);
});

test("a consistent sourced field resolves with source, snapshot and field provenance", () => {
  const { fixture, courseId } = feeInput("VET");
  const result = resolveEducationField(
    fixture.dataset,
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    CURRENT_ASSESSMENT
  );
  assert.equal(result.status, "KNOWN");
  assert.equal(result.evidenceClass, "SYNTHETIC_ONLY");
  assert.deepEqual(result.reasons, ["RESOLVED_IDENTICAL_VALUES"]);
  assert.equal(result.sourceRefs.length, 1);
  assert.equal(result.history.length, 1);
  assert.equal(
    result.sourceRefs[0].snapshotId,
    result.history[0].provenance.snapshotId
  );
  assert.equal(result.sourceRefs[0].contentSha256.length, 64);
  assert.equal(result.sourceRefs[0].locator.length > 0, true);
});

test("conflicting compatible fee observations remain CONFLICTED with all provenance", () => {
  const { fixture, courseId } = feeInput("CONFLICTING_OFFICIAL_OBSERVATIONS");
  const result = resolveEducationField(
    fixture.dataset,
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    CURRENT_ASSESSMENT
  );
  assert.equal(result.status, "CONFLICTED");
  assert.deepEqual(result.reasons, ["CONFLICTING_VALUES"]);
  assert.equal(result.resolvedValue, undefined);
  assert.equal(result.sourceRefs.length, 2);
  assert.equal(result.history.length, 2);
});

test("different fee basis remains UNKNOWN and is never auto-merged or compared", () => {
  const { fixture, courseId } = feeInput("INCOMPATIBLE_FEES");
  const result = resolveEducationField(
    fixture.dataset,
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    CURRENT_ASSESSMENT
  );
  assert.equal(result.status, "UNKNOWN");
  assert.deepEqual(result.reasons, ["INCOMPATIBLE_FEE_SCOPE"]);
  assert.equal(result.resolvedValue, undefined);
  assert.equal(result.sourceRefs.length, 2);
});

test("fee currency, audience, year and period must agree before candidates compare", () => {
  const { fixture, courseId } = feeInput("CONFLICTING_OFFICIAL_OBSERVATIONS");
  const feeObservations = fixture.dataset.observations.filter(
    (item) => item.fieldKey === "TUITION_FEE"
  );
  assert.equal(feeObservations.length, 2);
  const second = feeObservations[1];
  assert.ok(second.value?.kind === "money");
  const incompatibleScopes = [
    { ...second.value, currency: "USD" },
    { ...second.value, audience: "DOMESTIC" as const },
    { ...second.value, year: 2028 },
    {
      ...second.value,
      basis: "SEMESTER" as const,
      period: "Synthetic Semester",
    },
  ];
  for (const value of incompatibleScopes) {
    const dataset: EducationDataset = {
      ...fixture.dataset,
      observations: fixture.dataset.observations.map((item) =>
        item.observationId === second.observationId ? { ...item, value } : item
      ),
    };
    const result = resolveEducationField(
      dataset,
      { type: "COURSE", id: courseId },
      "TUITION_FEE",
      CURRENT_ASSESSMENT
    );
    assert.equal(result.status, "UNKNOWN");
    assert.deepEqual(result.reasons, ["INCOMPATIBLE_FEE_SCOPE"]);
  }
});

test("a later failed parse marks the old value STALE while preserving its history", () => {
  const { fixture, courseId } = feeInput("STALE_AFTER_FAILED_PARSE");
  const result = resolveEducationField(
    fixture.dataset,
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    { assessedAt: syntheticFixtureTimes.laterAt, assessmentDate: "2026-10-28" }
  );
  assert.equal(result.status, "STALE");
  assert.deepEqual(result.reasons, ["LATEST_SOURCE_ATTEMPT_FAILED"]);
  assert.equal(result.resolvedValue, undefined);
  assert.deepEqual(
    result.historicalValue,
    fixture.dataset.observations.find((item) => item.fieldKey === "TUITION_FEE")
      ?.value
  );
  assert.equal(result.history.length, 1);
  assert.equal(result.sourceSnapshotHistory.length, 2);
  assert.equal(
    result.sourceSnapshotHistory.at(-1)?.acquisitionOutcome,
    "FAILED_PARSE"
  );
});

test("freshness is applied only when an explicit field policy is supplied", () => {
  const { fixture, courseId } = feeInput("VET");
  const noPolicy = resolveEducationField(
    fixture.dataset,
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    { assessedAt: "2027-01-01T00:00:00.000Z", assessmentDate: "2027-01-01" }
  );
  const expiredPolicy = resolveEducationField(
    fixture.dataset,
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    {
      assessedAt: "2027-01-01T00:00:00.000Z",
      assessmentDate: "2027-01-01",
      maxAgeMsByField: { TUITION_FEE: 60_000 },
    }
  );
  assert.equal(noPolicy.status, "KNOWN");
  assert.equal(expiredPolicy.status, "STALE");
  assert.deepEqual(expiredPolicy.reasons, ["FRESHNESS_WINDOW_EXCEEDED"]);
  assert.equal(expiredPolicy.historicalValue?.kind, "money");
});

test("a later explicit withdrawal is not confused with a missing field", () => {
  const { fixture, courseId } = feeInput("WITHDRAWN_FIELD");
  const result = resolveEducationField(
    fixture.dataset,
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    { assessedAt: syntheticFixtureTimes.laterAt, assessmentDate: "2026-10-28" }
  );
  assert.equal(result.status, "WITHDRAWN");
  assert.deepEqual(result.reasons, ["ALL_SOURCES_WITHDREW_FIELD"]);
  assert.equal(result.resolvedValue, undefined);
  assert.equal(result.history.length, 2);
  assert.equal(result.sourceRefs.length, 2);
});

test("same snapshot duplicates are deterministic and preserve snapshot history", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const original = fixture.dataset.observations.find(
    (item) => item.fieldKey === "TUITION_FEE"
  );
  assert.ok(original);
  const duplicate: EducationFieldObservation = {
    ...original,
    observationId: "test-observation-fee-idempotent-copy",
  };
  const dataset: EducationDataset = {
    ...fixture.dataset,
    observations: [...fixture.dataset.observations, duplicate],
  };
  const first = resolveEducationField(
    dataset,
    { type: "COURSE", id: fixture.dataset.courses[0].courseId },
    "TUITION_FEE",
    CURRENT_ASSESSMENT
  );
  const second = resolveEducationField(
    dataset,
    { type: "COURSE", id: fixture.dataset.courses[0].courseId },
    "TUITION_FEE",
    CURRENT_ASSESSMENT
  );
  assert.equal(first.status, "KNOWN");
  assert.deepEqual(first, second);
  assert.equal(first.history.length, 2);
  assert.equal(first.sourceSnapshotHistory.length, 1);
});

test("different currently applicable assertions from one source are not silently latest-wins", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const previous = fixture.dataset.observations.find(
    (item) => item.fieldKey === "TUITION_FEE"
  );
  const source = fixture.dataset.sources.find(
    (item) => item.sourceFamily === "INSTITUTION"
  );
  assert.ok(previous && source);
  const excerpt =
    "TEST_ONLY_SYNTHETIC second snapshot with a different annual fee value";
  const contentSha256 = createHash("sha256")
    .update(excerpt, "utf8")
    .digest("hex");
  const snapshot: EducationSnapshot = {
    snapshotId: "test-snapshot-newer-fee",
    sourceId: source.sourceId,
    recordClass: "SYNTHETIC",
    sourceUrl: source.canonicalUrl,
    retrievedAt: "2026-10-28T00:00:00.000Z",
    observedAt: "2026-10-28T00:00:00.000Z",
    contentSha256,
    parserVersion: "synthetic-fixture-v1",
    contentExcerpt: excerpt,
    acquisitionOutcome: "CAPTURED",
  };
  const newer: EducationFieldObservation = {
    ...previous,
    observationId: "test-observation-newer-fee",
    observedAt: snapshot.observedAt,
    provenance: {
      ...previous.provenance,
      snapshotId: snapshot.snapshotId,
      contentSha256,
      locator: "/fixture/newer-fee",
    },
    value: {
      ...(previous.value as Extract<
        NonNullable<EducationFieldObservation["value"]>,
        { readonly kind: "money" }
      >),
      amount: 1_400_000,
    },
  };
  const dataset: EducationDataset = {
    ...fixture.dataset,
    snapshots: [...fixture.dataset.snapshots, snapshot],
    observations: [...fixture.dataset.observations, newer],
  };
  const result = resolveEducationField(
    dataset,
    { type: "COURSE", id: fixture.dataset.courses[0].courseId },
    "TUITION_FEE",
    { assessedAt: syntheticFixtureTimes.laterAt, assessmentDate: "2026-10-28" }
  );
  assert.equal(result.status, "CONFLICTED");
  assert.deepEqual(result.reasons, ["CONFLICTING_VALUES"]);
  assert.equal(result.resolvedValue, undefined);
  assert.equal(result.history.length, 2);
  assert.equal(result.sourceRefs.length, 2);
  assert.equal(result.sourceSnapshotHistory.length, 2);
});

test("an assertion cannot coexist with another source withdrawal or non-applicability", () => {
  const { fixture, courseId } = feeInput("CONFLICTING_OFFICIAL_OBSERVATIONS");
  const feeObservations = fixture.dataset.observations.filter(
    (item) => item.fieldKey === "TUITION_FEE"
  );
  assert.equal(feeObservations.length, 2);
  for (const disposition of ["WITHDRAWAL", "NOT_APPLICABLE"] as const) {
    const terminal = feeObservations[1];
    const dataset: EducationDataset = {
      ...fixture.dataset,
      observations: fixture.dataset.observations.map((item) =>
        item.observationId === terminal.observationId
          ? { ...item, disposition, value: undefined }
          : item
      ),
    };
    const result = resolveEducationField(
      dataset,
      { type: "COURSE", id: courseId },
      "TUITION_FEE",
      CURRENT_ASSESSMENT
    );
    assert.equal(result.status, "CONFLICTED", disposition);
    assert.deepEqual(result.reasons, ["CONFLICTING_DISPOSITIONS"]);
    assert.equal(result.resolvedValue, undefined);
    assert.equal(result.sourceRefs.length, 2);
    assert.equal(result.history.length, 2);
  }
});

test("term labels never synthesize an application deadline or start date", () => {
  const fixture = createSyntheticEducationFixture("MISSING_FEE_AND_DEADLINE");
  const intake = fixture.dataset.intakes[0];
  const deadline = resolveEducationField(
    fixture.dataset,
    { type: "INTAKE", id: intake.intakeId },
    "APPLICATION_DEADLINE",
    CURRENT_ASSESSMENT
  );
  assert.equal(intake.term, "Example Term");
  assert.equal(deadline.status, "UNKNOWN");
  assert.equal(deadline.resolvedValue, undefined);
});

test("explicit non-applicability and not-yet-effective observations stay distinct", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const courseId = fixture.dataset.courses[0].courseId;
  const original = fixture.dataset.observations.find(
    (item) => item.fieldKey === "TUITION_FEE"
  );
  const source = fixture.dataset.sources.find(
    (item) => item.sourceFamily === "INSTITUTION"
  );
  const snapshot = fixture.dataset.snapshots.find(
    (item) => item.sourceId === source?.sourceId
  );
  assert.ok(original && source && snapshot);
  const notApplicable = {
    ...original,
    observationId: "test-observation-not-applicable",
    disposition: "NOT_APPLICABLE" as const,
    value: undefined,
  };
  const naDataset: EducationDataset = {
    ...fixture.dataset,
    observations: fixture.dataset.observations
      .filter((item) => item.observationId !== original.observationId)
      .concat(notApplicable),
  };
  const naResult = resolveEducationField(
    naDataset,
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    CURRENT_ASSESSMENT
  );
  assert.equal(naResult.status, "NOT_APPLICABLE");

  const future: EducationFieldObservation = {
    ...original,
    observationId: "test-observation-future-effective",
    observedAt: "2026-10-27T00:00:00.000Z",
    effectiveFrom: "2026-10-28",
    provenance: {
      ...original.provenance,
      locator: "/fixture/future-effective",
    },
  };
  const futureDataset: EducationDataset = {
    ...fixture.dataset,
    observations: fixture.dataset.observations.map((item) =>
      item.observationId === original.observationId ? future : item
    ),
  };
  const futureResult = resolveEducationField(
    futureDataset,
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    CURRENT_ASSESSMENT
  );
  assert.equal(futureResult.status, "UNKNOWN");
  assert.deepEqual(futureResult.reasons, ["FUTURE_OBSERVATION"]);
  assert.equal(futureResult.sourceSnapshotHistory.length, 1);
  assert.ok(snapshot);
});

test("expired snapshot effectiveness makes its assertion stale while retaining history", () => {
  const { fixture, courseId } = feeInput("VET");
  const feeObservation = fixture.dataset.observations.find(
    (item) => item.fieldKey === "TUITION_FEE"
  );
  assert.ok(feeObservation);
  const dataset: EducationDataset = {
    ...fixture.dataset,
    snapshots: fixture.dataset.snapshots.map((item) =>
      item.snapshotId === feeObservation.provenance.snapshotId
        ? { ...item, effectiveTo: "2026-10-26" }
        : item
    ),
  };
  const result = resolveEducationField(
    dataset,
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    CURRENT_ASSESSMENT
  );
  assert.equal(result.status, "STALE");
  assert.deepEqual(result.reasons, ["SOURCE_EFFECTIVITY_ENDED"]);
  assert.equal(result.history.length, 1);
  assert.equal(result.sourceRefs.length, 1);
  assert.equal(result.historicalValue?.kind, "money");
});

test("a future-effective later revision does not hide a currently applicable older assertion", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const previous = fixture.dataset.observations.find(
    (item) => item.fieldKey === "TUITION_FEE"
  );
  const source = fixture.dataset.sources.find(
    (item) => item.sourceFamily === "INSTITUTION"
  );
  assert.ok(previous && source);
  const excerpt = "TEST_ONLY_SYNTHETIC future-effective revised fee";
  const contentSha256 = createHash("sha256")
    .update(excerpt, "utf8")
    .digest("hex");
  const futureSnapshot: EducationSnapshot = {
    snapshotId: "test-snapshot-future-fee-revision",
    sourceId: source.sourceId,
    recordClass: "SYNTHETIC",
    sourceUrl: source.canonicalUrl,
    retrievedAt: "2026-10-27T11:00:00.000Z",
    observedAt: "2026-10-27T11:00:00.000Z",
    effectiveFrom: "2026-10-28",
    contentSha256,
    parserVersion: "synthetic-fixture-v1",
    contentExcerpt: excerpt,
    acquisitionOutcome: "CAPTURED",
  };
  const futureObservation: EducationFieldObservation = {
    ...previous,
    observationId: "test-observation-future-fee-revision",
    observedAt: futureSnapshot.observedAt,
    effectiveFrom: futureSnapshot.effectiveFrom,
    provenance: {
      ...previous.provenance,
      snapshotId: futureSnapshot.snapshotId,
      contentSha256,
      locator: "/fixture/future-fee-revision",
    },
    value: {
      ...(previous.value as Extract<
        NonNullable<EducationFieldObservation["value"]>,
        { readonly kind: "money" }
      >),
      amount: 1_400_000,
    },
  };
  const dataset: EducationDataset = {
    ...fixture.dataset,
    snapshots: [...fixture.dataset.snapshots, futureSnapshot],
    observations: [...fixture.dataset.observations, futureObservation],
  };
  const result = resolveEducationField(
    dataset,
    { type: "COURSE", id: fixture.dataset.courses[0].courseId },
    "TUITION_FEE",
    CURRENT_ASSESSMENT
  );
  assert.equal(result.status, "KNOWN");
  assert.deepEqual(result.resolvedValue, previous.value);
  assert.equal(result.history.length, 2);
  assert.equal(result.sourceRefs.length, 2);
  assert.equal(result.sourceSnapshotHistory.length, 2);
});

test("date-only applicability uses assessmentDate and timestamp boundaries use assessedAt", () => {
  const { fixture, courseId } = feeInput("VET");
  const feeObservation = fixture.dataset.observations.find(
    (item) => item.fieldKey === "TUITION_FEE"
  );
  assert.ok(feeObservation);
  const snapshotId = feeObservation.provenance.snapshotId;
  const assessAtMidday = {
    assessedAt: "2026-10-27T12:00:00.000Z",
    assessmentDate: "2026-10-27",
  } as const;
  const dateOnly = resolveEducationField(
    {
      ...fixture.dataset,
      snapshots: fixture.dataset.snapshots.map((item) =>
        item.snapshotId === snapshotId
          ? { ...item, effectiveTo: "2026-10-27" }
          : item
      ),
    },
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    assessAtMidday
  );
  const timestampBeforeAssessment = resolveEducationField(
    {
      ...fixture.dataset,
      snapshots: fixture.dataset.snapshots.map((item) =>
        item.snapshotId === snapshotId
          ? { ...item, effectiveTo: "2026-10-27T11:59:59.999Z" }
          : item
      ),
    },
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    assessAtMidday
  );
  const timestampAtAssessment = resolveEducationField(
    {
      ...fixture.dataset,
      snapshots: fixture.dataset.snapshots.map((item) =>
        item.snapshotId === snapshotId
          ? { ...item, effectiveTo: "2026-10-27T12:00:00.000Z" }
          : item
      ),
    },
    { type: "COURSE", id: courseId },
    "TUITION_FEE",
    assessAtMidday
  );
  assert.equal(dateOnly.status, "KNOWN");
  assert.equal(timestampBeforeAssessment.status, "STALE");
  assert.equal(timestampAtAssessment.status, "KNOWN");
});
