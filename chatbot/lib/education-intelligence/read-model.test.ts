import assert from "node:assert/strict";
import test from "node:test";
import type { EducationDataset, ResolutionReason } from "./contracts";
import {
  createSyntheticEducationFixture,
  type SyntheticEducationFixture,
} from "./fixtures";
import {
  buildEducationResolvedReadModel,
  type EducationCatalogReader,
  type EducationCatalogReadSnapshot,
} from "./read-model";

const ASSESSED_AT = "2026-10-27T12:00:00.000Z";
const ASSESSMENT_DATE = "2026-10-27";

function readSnapshot(
  fixture: SyntheticEducationFixture
): EducationCatalogReadSnapshot {
  const ids = fixture.dataset.courses.map((course) => course.courseId);
  return {
    consistency: "CONSISTENT",
    snapshotToken: `snapshot-${fixture.scenario}`,
    complete: true,
    courseSelections: ids.map((courseId) => ({
      courseId,
      status: "FOUND" as const,
    })),
    dataset: fixture.dataset,
  };
}

function readerFor(
  snapshot: EducationCatalogReadSnapshot
): EducationCatalogReader {
  return {
    readConsistent() {
      return Promise.resolve(snapshot);
    },
  };
}

test("CRICOS registration stays separate from fee, deadline, and eligibility", async () => {
  const fixture = createSyntheticEducationFixture("MISSING_FEE_AND_DEADLINE");
  const courseId = fixture.dataset.courses[0].courseId;
  const result = await buildEducationResolvedReadModel(
    readerFor(readSnapshot(fixture)),
    {
      courseIds: [courseId],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    }
  );
  const path = result.paths[0];
  const registration = path.fields.find(
    (field) => field.fieldKey === "CRICOS_COURSE_STATUS"
  );
  assert.equal(registration?.status, "KNOWN");
  assert.equal(registration?.evidenceClass, "SYNTHETIC_ONLY");
  assert.equal(
    registration?.sourceRefs[0].authorityRole,
    "CRICOS_REGISTRATION_ONLY"
  );
  assert.equal(
    path.fields.find((field) => field.fieldKey === "TUITION_FEE")?.status,
    "UNKNOWN"
  );
  assert.equal(
    path.fields.find((field) => field.fieldKey === "APPLICATION_DEADLINE")
      ?.status,
    "UNKNOWN"
  );
  assert.equal(result.noPassSignal, true);
  assert.equal(path.label, "Possible option for further review");
});

test("intake entity deadlines are never current without source field resolution", async () => {
  const fixture = createSyntheticEducationFixture("MISSING_FEE_AND_DEADLINE");
  const dataset: EducationDataset = {
    ...fixture.dataset,
    intakes: fixture.dataset.intakes.map((intake) => ({
      ...intake,
      applicationDeadline: "2027-01-15",
    })),
  };
  const updated = { ...fixture, dataset };
  const result = await buildEducationResolvedReadModel(
    readerFor(readSnapshot(updated)),
    {
      courseIds: [dataset.courses[0].courseId],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    }
  );
  const path = result.paths.find((item) => item.intake);
  assert.ok(path?.intake);
  assert.equal(Object.hasOwn(path.intake, "applicationDeadline"), false);
  assert.equal(Object.hasOwn(path.intake, "startDate"), false);
  const deadline = path.fields.find(
    (field) =>
      field.target.type === "INTAKE" &&
      field.fieldKey === "APPLICATION_DEADLINE"
  );
  assert.equal(deadline?.status, "UNKNOWN");
  assert.equal(deadline?.resolvedValue, undefined);
});

test("deadline status preserves withdrawn, stale and conflicted source semantics", async () => {
  const base = createSyntheticEducationFixture("VET");
  const deadline = base.dataset.observations.find(
    (observation) => observation.fieldKey === "APPLICATION_DEADLINE"
  );
  assert.ok(deadline);
  const scenarios: readonly {
    readonly status:
      | "WITHDRAWN"
      | "STALE"
      | "CONFLICTED"
      | "NOT_APPLICABLE"
      | "UNKNOWN";
    readonly reason?: ResolutionReason;
    readonly dataset: EducationDataset;
  }[] = [
    {
      status: "WITHDRAWN",
      dataset: {
        ...base.dataset,
        observations: base.dataset.observations.map((observation) => {
          if (observation.observationId !== deadline.observationId) {
            return observation;
          }
          const { value: _value, ...withoutValue } = observation;
          return { ...withoutValue, disposition: "WITHDRAWAL" as const };
        }),
      },
    },
    {
      status: "STALE",
      dataset: {
        ...base.dataset,
        snapshots: base.dataset.snapshots.map((snapshot) =>
          snapshot.snapshotId === deadline.provenance.snapshotId
            ? { ...snapshot, effectiveTo: "2026-10-26" }
            : snapshot
        ),
      },
    },
    {
      status: "CONFLICTED",
      dataset: {
        ...base.dataset,
        observations: [
          ...base.dataset.observations,
          {
            ...deadline,
            observationId: `${deadline.observationId}-conflicting-revision`,
            value: { kind: "date" as const, value: "2027-01-20" },
            provenance: {
              ...deadline.provenance,
              locator: "/fixture/deadline-conflict",
              excerpt: "Synthetic conflicting deadline revision",
            },
          },
        ],
      },
    },
    {
      status: "NOT_APPLICABLE",
      dataset: {
        ...base.dataset,
        observations: base.dataset.observations.map((observation) => {
          if (observation.observationId !== deadline.observationId) {
            return observation;
          }
          const { value: _value, ...withoutValue } = observation;
          return { ...withoutValue, disposition: "NOT_APPLICABLE" as const };
        }),
      },
    },
    {
      status: "UNKNOWN",
      reason: "FUTURE_OBSERVATION",
      dataset: {
        ...base.dataset,
        observations: base.dataset.observations.map((observation) =>
          observation.observationId === deadline.observationId
            ? { ...observation, effectiveFrom: "2026-10-28" }
            : observation
        ),
      },
    },
  ];

  for (const scenario of scenarios) {
    const fixture = { ...base, dataset: scenario.dataset };
    const result = await buildEducationResolvedReadModel(
      readerFor(readSnapshot(fixture)),
      {
        courseIds: [scenario.dataset.courses[0].courseId],
        assessedAt: ASSESSED_AT,
        assessmentDate: ASSESSMENT_DATE,
      }
    );
    const path = result.paths.find((item) => item.intake);
    assert.ok(path?.intake);
    assert.equal(Object.hasOwn(path.intake, "applicationDeadline"), false);
    const resolved = path.fields.find(
      (field) =>
        field.target.type === "INTAKE" &&
        field.fieldKey === "APPLICATION_DEADLINE"
    );
    assert.equal(resolved?.status, scenario.status, scenario.status);
    assert.equal(resolved?.resolvedValue, undefined, scenario.status);
    assert.ok(resolved?.history.length, scenario.status);
    if (scenario.reason) {
      assert.ok(resolved?.reasons.includes(scenario.reason));
    }
  }
});

test("exact hierarchy preserves campuses, intakes, years, and same-title provider identities", async () => {
  const multi = createSyntheticEducationFixture(
    "MULTI_CAMPUS_MULTIPLE_INTAKES"
  );
  const multiResult = await buildEducationResolvedReadModel(
    readerFor(readSnapshot(multi)),
    {
      courseIds: [multi.dataset.courses[0].courseId],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    }
  );
  assert.equal(multiResult.paths.length, 3);
  assert.equal(
    new Set(multiResult.paths.map((path) => path.delivery?.deliveryId)).size,
    2
  );
  assert.equal(
    new Set(multiResult.paths.map((path) => path.intake?.intakeId)).size,
    3
  );

  const sameTitle = createSyntheticEducationFixture(
    "AMBIGUOUS_COURSE_IDENTITIES"
  );
  const sameTitleResult = await buildEducationResolvedReadModel(
    readerFor(readSnapshot(sameTitle)),
    {
      courseIds: sameTitle.dataset.courses.map((course) => course.courseId),
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    }
  );
  assert.equal(sameTitleResult.paths.length, 2);
  assert.deepEqual(
    new Set(
      sameTitleResult.paths.map((path) => path.course.provider.providerId)
    ),
    new Set(sameTitle.dataset.providers.map((provider) => provider.providerId))
  );
});

test("reused intake codes remain distinct when academic year and start date differ", async () => {
  const fixture = createSyntheticEducationFixture(
    "MULTI_CAMPUS_MULTIPLE_INTAKES"
  );
  const changedIntakes = fixture.dataset.intakes.map((intake, index) =>
    index < 2
      ? {
          ...intake,
          intakeCode: "REUSED-TERM-CODE",
          year: index === 0 ? 2027 : 2028,
          startDate: index === 0 ? "2027-03-01" : "2028-03-01",
        }
      : intake
  );
  const withReusedCode = {
    ...fixture,
    dataset: { ...fixture.dataset, intakes: changedIntakes },
  };
  const result = await buildEducationResolvedReadModel(
    readerFor(readSnapshot(withReusedCode)),
    {
      courseIds: [fixture.dataset.courses[0].courseId],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    }
  );
  const reused = result.paths.filter(
    (path) => path.intake?.intakeCode === "REUSED-TERM-CODE"
  );
  assert.equal(reused.length, 2);
  assert.deepEqual(
    reused.map((path) => path.intake?.year).sort(),
    [2027, 2028]
  );
});

test("preserves stale, conflict, withdrawal and failed-attempt provenance", async () => {
  for (const scenario of [
    "STALE_AFTER_FAILED_PARSE",
    "CONFLICTING_OFFICIAL_OBSERVATIONS",
    "WITHDRAWN_FIELD",
  ] as const) {
    const fixture = createSyntheticEducationFixture(scenario);
    const isLaterScenario = scenario !== "CONFLICTING_OFFICIAL_OBSERVATIONS";
    const result = await buildEducationResolvedReadModel(
      readerFor(readSnapshot(fixture)),
      {
        courseIds: [fixture.dataset.courses[0].courseId],
        assessedAt: isLaterScenario ? "2026-10-28T00:00:00.000Z" : ASSESSED_AT,
        assessmentDate: isLaterScenario ? "2026-10-28" : ASSESSMENT_DATE,
      }
    );
    const fee = result.paths[0].fields.find(
      (field) => field.fieldKey === "TUITION_FEE"
    );
    assert.ok(fee);
    assert.ok(["STALE", "CONFLICTED", "WITHDRAWN"].includes(fee.status));
    assert.ok(fee.history.length > 0);
    assert.ok(fee.sourceAttempts.length > 0);
    assert.ok(
      fee.sourceRefs.every((source) => source.sourceUrl.startsWith("https://"))
    );
  }
});

test("field history is deterministic and does not expose raw snapshot HTML", async () => {
  const fixture = createSyntheticEducationFixture("VET");
  const snapshot = readSnapshot(fixture);
  const first = await buildEducationResolvedReadModel(readerFor(snapshot), {
    courseIds: [fixture.dataset.courses[0].courseId],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  const second = await buildEducationResolvedReadModel(readerFor(snapshot), {
    courseIds: [fixture.dataset.courses[0].courseId],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first).includes("<html"), false);
  assert.equal(
    first.paths[0].fields.find(
      (field) => field.fieldKey === "CRICOS_COURSE_STATUS"
    )?.evidenceClass,
    "SYNTHETIC_ONLY"
  );
});

test("future and expired source evidence keep their resolver statuses and history", async () => {
  const fixture = createSyntheticEducationFixture("VET");
  const feeObservation = fixture.dataset.observations.find(
    (item) => item.fieldKey === "TUITION_FEE"
  );
  assert.ok(feeObservation);
  const futureDataset: EducationDataset = {
    ...fixture.dataset,
    observations: fixture.dataset.observations.map((item) =>
      item.observationId === feeObservation.observationId
        ? { ...item, effectiveFrom: "2026-10-28" }
        : item
    ),
  };
  const futureFixture = { ...fixture, dataset: futureDataset };
  const future = await buildEducationResolvedReadModel(
    readerFor(readSnapshot(futureFixture)),
    {
      courseIds: [fixture.dataset.courses[0].courseId],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    }
  );
  const futureFee = future.paths[0].fields.find(
    (field) => field.fieldKey === "TUITION_FEE"
  );
  assert.equal(futureFee?.status, "UNKNOWN");
  assert.ok(futureFee?.reasons.includes("FUTURE_OBSERVATION"));
  assert.equal(futureFee?.history.length, 1);

  const expiredDataset: EducationDataset = {
    ...fixture.dataset,
    snapshots: fixture.dataset.snapshots.map((snapshot) =>
      snapshot.snapshotId === feeObservation.provenance.snapshotId
        ? { ...snapshot, effectiveTo: "2026-10-26" }
        : snapshot
    ),
  };
  const expired = await buildEducationResolvedReadModel(
    readerFor(readSnapshot({ ...fixture, dataset: expiredDataset })),
    {
      courseIds: [fixture.dataset.courses[0].courseId],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    }
  );
  const expiredFee = expired.paths[0].fields.find(
    (field) => field.fieldKey === "TUITION_FEE"
  );
  assert.equal(expiredFee?.status, "STALE");
  assert.equal(expiredFee?.resolvedValue, undefined);
  assert.ok(expiredFee?.historicalValue);
});

test("NOT_APPLICABLE stays distinct from unknown and does not fabricate a value", async () => {
  const fixture = createSyntheticEducationFixture("VET");
  const original = fixture.dataset.observations.find(
    (item) => item.fieldKey === "COURSE_AVAILABILITY"
  );
  assert.ok(original);
  const notApplicable = {
    ...original,
    observationId: "test-observation-course-availability-not-applicable",
    disposition: "NOT_APPLICABLE" as const,
    value: undefined,
  };
  const dataset: EducationDataset = {
    ...fixture.dataset,
    observations: fixture.dataset.observations
      .filter((item) => item.observationId !== original.observationId)
      .concat(notApplicable),
  };
  const result = await buildEducationResolvedReadModel(
    readerFor(readSnapshot({ ...fixture, dataset })),
    {
      courseIds: [fixture.dataset.courses[0].courseId],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    }
  );
  const field = result.paths[0].fields.find(
    (item) => item.fieldKey === "COURSE_AVAILABILITY"
  );
  assert.equal(field?.status, "NOT_APPLICABLE");
  assert.equal(field?.resolvedValue, undefined);
  assert.equal(field?.history[0].disposition, "NOT_APPLICABLE");
});

test("exact absent and ambiguous selectors remain explicit exclusions", async () => {
  const dataset: EducationDataset = {
    providers: [],
    courses: [],
    deliveries: [],
    intakes: [],
    sources: [],
    snapshots: [],
    observations: [],
  };
  const snapshot: EducationCatalogReadSnapshot = {
    consistency: "CONSISTENT",
    snapshotToken: "empty-exact-read",
    complete: true,
    courseSelections: [
      { courseId: "course-absent", status: "ABSENT" },
      { courseId: "course-ambiguous", status: "AMBIGUOUS" },
    ],
    dataset,
  };
  const result = await buildEducationResolvedReadModel(readerFor(snapshot), {
    courseIds: ["course-absent", "course-ambiguous"],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.deepEqual(
    result.exclusions.map((item) => [item.status, item.reason]),
    [
      ["ABSENT", "EXACT_COURSE_ID_NOT_FOUND"],
      ["AMBIGUOUS", "EXACT_ID_AMBIGUOUS"],
    ]
  );
  assert.equal(result.paths.length, 0);
});

test("incomplete, inconsistent, invalid, and over-bound reads fail closed", async () => {
  const fixture = createSyntheticEducationFixture(
    "MULTI_CAMPUS_MULTIPLE_INTAKES"
  );
  const base = readSnapshot(fixture);
  for (const [snapshot, expected] of [
    [{ ...base, complete: false }, "INCOMPLETE_SNAPSHOT"],
    [
      { ...base, consistency: "INCONSISTENT" as const },
      "INCONSISTENT_SNAPSHOT",
    ],
  ] as const) {
    await assert.rejects(
      buildEducationResolvedReadModel(readerFor(snapshot), {
        courseIds: [fixture.dataset.courses[0].courseId],
        assessedAt: ASSESSED_AT,
        assessmentDate: ASSESSMENT_DATE,
      }),
      (error: unknown) => (error as { code?: string }).code === expected
    );
  }
  await assert.rejects(
    buildEducationResolvedReadModel(readerFor(base), {
      courseIds: [fixture.dataset.courses[0].courseId],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
      limits: { optionPaths: 2 },
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "READ_BOUND_EXCEEDED"
  );
  await assert.rejects(
    buildEducationResolvedReadModel(
      {
        readConsistent() {
          return Promise.reject(new Error("private adapter detail"));
        },
      },
      {
        courseIds: [fixture.dataset.courses[0].courseId],
        assessedAt: ASSESSED_AT,
        assessmentDate: ASSESSMENT_DATE,
      }
    ),
    (error: unknown) => {
      assert.equal((error as Error).message, "READ_FAILED");
      assert.equal(
        (error as Error).message.includes("private adapter detail"),
        false
      );
      return true;
    }
  );
});

test("a timed-out catalog reader is aborted and cannot return a partial read", async () => {
  const fixture = createSyntheticEducationFixture("VET");
  let aborted = false;
  await assert.rejects(
    buildEducationResolvedReadModel(
      {
        readConsistent({ signal }) {
          return new Promise((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => {
                aborted = true;
                reject(new Error("read aborted"));
              },
              { once: true }
            );
          });
        },
      },
      {
        courseIds: [fixture.dataset.courses[0].courseId],
        assessedAt: ASSESSED_AT,
        assessmentDate: ASSESSMENT_DATE,
        limits: { readerTimeoutMs: 10 },
      }
    ),
    (error: unknown) => (error as { code?: string }).code === "READ_FAILED"
  );
  assert.equal(aborted, true);
});
