import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { AuthorizedProjectFact } from "../projects/project-context";
import type { EducationDataset, EducationFieldObservation } from "./contracts";
import {
  createSyntheticEducationFixture,
  type SyntheticEducationFixture,
} from "./fixtures";
import {
  compareReviewedEducationCriterion as compareRawCriterion,
  computeEducationCriterionBindingSha256,
  type EducationCriterionReviewAuthority,
  missingReviewedRule,
  type ReviewedEducationCriterion,
  type TrustedEducationCriterionApproval,
  unknownUnstructuredSchoolRule,
} from "./option-comparison";

const ASSESSED_AT = "2026-10-27T12:00:00.000Z";
const ASSESSMENT_DATE = "2026-10-27";
const PRIVATE_VALUE = "private-applicant-score-value";

function fact(
  overrides: Partial<AuthorizedProjectFact> = {}
): AuthorizedProjectFact {
  return {
    assertionId: "project-fact-language-score",
    assertionVersion: 3,
    key: "language.testscore",
    valueType: "json",
    value: { value: 7, unit: "IELTS" },
    originKind: "customer_stated",
    confirmedByUserId: "user-a",
    effectiveFrom: null,
    effectiveTo: null,
    observedAt: "2026-10-26T00:00:00.000Z",
    sourceEvidenceRef: null,
    state: "customer_confirmed",
    stale: false,
    ...overrides,
  };
}

function evidenceFor(
  dataset: EducationDataset,
  observation: EducationFieldObservation
): ReviewedEducationCriterion["ruleEvidence"] {
  const snapshot = dataset.snapshots.find(
    (item) => item.snapshotId === observation.provenance.snapshotId
  );
  if (!snapshot) {
    throw new Error("Synthetic source evidence missing.");
  }
  return {
    observationId: observation.observationId,
    snapshotId: snapshot.snapshotId,
    sourceId: observation.provenance.sourceId,
    sourceFamily: observation.provenance.sourceFamily,
    sourceUrl: observation.provenance.sourceUrl,
    contentSha256: observation.provenance.contentSha256,
    locator: observation.provenance.locator,
    excerpt:
      observation.provenance.excerpt ??
      "Synthetic withdrawal contains no value excerpt.",
  };
}

function criterionForObservation(
  fixture: SyntheticEducationFixture,
  observation: EducationFieldObservation,
  overrides: Partial<ReviewedEducationCriterion> = {}
): ReviewedEducationCriterion {
  return {
    criterionId: "reviewed-english-score",
    schoolField: {
      target: observation.target,
      fieldKey: observation.fieldKey,
      observationId: observation.observationId,
      snapshotId: observation.provenance.snapshotId,
    },
    ruleEvidence: evidenceFor(fixture.dataset, observation),
    comparator: { kind: "NUMBER_MINIMUM", threshold: 6.5, unit: "IELTS" },
    applicantFact: {
      key: "language.testscore",
      valueType: "json",
      assertionId: "project-fact-language-score",
      assertionVersion: 3,
    },
    applicability: { status: "APPLIES" },
    review: {
      status: "APPROVED",
      reviewId: "operator-review-1",
      revision: "1",
    },
    ...overrides,
  };
}

function admissionsCriterion(
  fixture: SyntheticEducationFixture,
  overrides: Partial<ReviewedEducationCriterion> = {}
): ReviewedEducationCriterion {
  const observation = fixture.dataset.observations.find(
    (item) => item.fieldKey === "COURSE_ADMISSIONS_CRITERIA"
  );
  if (!observation) {
    throw new Error("Synthetic admissions observation missing.");
  }
  return criterionForObservation(fixture, observation, overrides);
}

function fixtureWithReviewedAdmissionsEvidence(
  fixture: SyntheticEducationFixture
): SyntheticEducationFixture {
  const original = fixture.dataset.observations.find(
    (item) => item.fieldKey === "COURSE_ADMISSIONS_CRITERIA"
  );
  if (!original) {
    throw new Error("Synthetic admissions observation missing.");
  }
  const quote =
    "Synthetic test admissions rule: IELTS overall score minimum 6.5.";
  const snapshotId = `${original.provenance.snapshotId}-reviewed-rule`;
  const contentSha256 = createHash("sha256")
    .update(quote, "utf8")
    .digest("hex");
  const snapshot = fixture.dataset.snapshots.find(
    (item) => item.snapshotId === original.provenance.snapshotId
  );
  if (!snapshot) {
    throw new Error("Synthetic admissions snapshot missing.");
  }
  const evidenceSnapshot = {
    ...snapshot,
    snapshotId,
    contentSha256,
    contentExcerpt: quote,
    locator: "/fixture/reviewed-ielts-rule",
  };
  const evidenceObservation: EducationFieldObservation = {
    ...original,
    observationId: `${original.observationId}-reviewed-rule`,
    value: { kind: "text", value: quote },
    provenance: {
      ...original.provenance,
      snapshotId,
      contentSha256,
      locator: "/fixture/reviewed-ielts-rule",
      excerpt: quote,
    },
  };
  const dataset: EducationDataset = {
    ...fixture.dataset,
    snapshots: [...fixture.dataset.snapshots, evidenceSnapshot],
    observations: [
      ...fixture.dataset.observations.filter(
        (item) => item.observationId !== original.observationId
      ),
      evidenceObservation,
    ],
  };
  return { ...fixture, dataset };
}

function trustedReviewAuthority(
  criteria: readonly ReviewedEducationCriterion[]
): EducationCriterionReviewAuthority {
  const approvals: TrustedEducationCriterionApproval[] = criteria.map(
    (criterion) => ({
      status: "APPROVED",
      reviewId: criterion.review.reviewId,
      revision: criterion.review.revision,
      reviewerId: "trusted-offline-operator",
      reviewedAt: "2026-10-27T00:00:00.000Z",
      bindingSha256: computeEducationCriterionBindingSha256(criterion),
    })
  );
  return {
    findApproval({ reviewId, revision }) {
      return approvals.find(
        (approval) =>
          approval.reviewId === reviewId && approval.revision === revision
      );
    },
  };
}

const NO_APPROVAL: EducationCriterionReviewAuthority = {
  findApproval() {
    return undefined;
  },
};

function compareCriterion(input: {
  readonly dataset: EducationDataset;
  readonly criterion: ReviewedEducationCriterion;
  readonly authorizedFacts: readonly AuthorizedProjectFact[];
  readonly assessedAt: string;
  readonly assessmentDate: string;
  readonly reviewAuthority?: EducationCriterionReviewAuthority;
}): ReturnType<typeof compareRawCriterion> {
  return compareRawCriterion({
    ...input,
    reviewAuthority:
      input.reviewAuthority ?? trustedReviewAuthority([input.criterion]),
  });
}

function dateFact(value: string): AuthorizedProjectFact {
  return fact({
    assertionId: "project-fact-application-date",
    key: "intake.application_date",
    valueType: "date",
    value,
  });
}

function deadlineCriterion(
  fixture: SyntheticEducationFixture,
  comparator:
    | { readonly kind: "DATE_EQUALS"; readonly expected: string }
    | { readonly kind: "DATE_ON_OR_BEFORE"; readonly latest: string }
): ReviewedEducationCriterion {
  const observation = fixture.dataset.observations.find(
    (item) => item.fieldKey === "APPLICATION_DEADLINE"
  );
  if (!observation) {
    throw new Error("Synthetic application deadline observation missing.");
  }
  return criterionForObservation(fixture, observation, {
    criterionId: `reviewed-deadline-${comparator.kind.toLowerCase()}`,
    comparator,
    applicantFact: {
      key: "intake.application_date",
      valueType: "date",
      assertionId: "project-fact-application-date",
      assertionVersion: 3,
    },
    review: {
      status: "APPROVED",
      reviewId: `review-deadline-${comparator.kind.toLowerCase()}`,
      revision: "1",
    },
  });
}

test("reviewed typed criterion compares compatible facts and retains provenance", () => {
  const fixture = fixtureWithReviewedAdmissionsEvidence(
    createSyntheticEducationFixture("VET")
  );
  const criterion = admissionsCriterion(fixture);
  const matched = compareCriterion({
    dataset: fixture.dataset,
    criterion,
    authorizedFacts: [fact()],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.equal(matched.outcome, "MATCHES", JSON.stringify(matched));
  assert.equal(matched.review?.revision, "1");
  assert.equal(matched.review?.reviewerId, "trusted-offline-operator");
  assert.match(matched.review?.bindingSha256 ?? "", /^[a-f0-9]{64}$/u);
  assert.equal(matched.applicantFactReference?.assertionVersion, 3);
  assert.equal(
    matched.applicantFactReference?.verificationLabel,
    "customer-confirmed; not independently verified"
  );
  assert.equal(matched.schoolReference?.recordClass, "SYNTHETIC");
  assert.equal(matched.noEligibilitySignal, true);
  assert.equal(JSON.stringify(matched).includes(PRIVATE_VALUE), false);

  const mismatch = compareCriterion({
    dataset: fixture.dataset,
    criterion,
    authorizedFacts: [fact({ value: { value: 5.5, unit: "IELTS" } })],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.equal(mismatch.outcome, "DOES_NOT_MATCH");
});

test("numeric comparisons require a trusted immutable evidence and comparator binding", () => {
  const fixture = fixtureWithReviewedAdmissionsEvidence(
    createSyntheticEducationFixture("VET")
  );
  const criterion = admissionsCriterion(fixture);
  const trusted = trustedReviewAuthority([criterion]);
  const compare = (
    candidate: ReviewedEducationCriterion,
    dataset: EducationDataset = fixture.dataset,
    reviewAuthority: EducationCriterionReviewAuthority = trusted
  ) =>
    compareCriterion({
      dataset,
      criterion: candidate,
      reviewAuthority,
      authorizedFacts: [fact()],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    });

  const callerOnlyApproval = compare(criterion, fixture.dataset, NO_APPROVAL);
  assert.equal(callerOnlyApproval.outcome, "UNKNOWN");
  assert.ok(callerOnlyApproval.reasons.includes("REVIEW_APPROVAL_MISSING"));
  assert.equal(callerOnlyApproval.comparator, undefined);

  for (const altered of [
    {
      ...criterion,
      comparator: {
        kind: "NUMBER_MINIMUM" as const,
        threshold: 7,
        unit: "IELTS",
      },
    },
    {
      ...criterion,
      comparator: {
        kind: "NUMBER_MINIMUM" as const,
        threshold: 6.5,
        unit: "TOEFL",
      },
    },
  ]) {
    const result = compare(altered);
    assert.equal(result.outcome, "UNKNOWN");
    assert.ok(result.reasons.includes("REVIEW_BINDING_MISMATCH"));
  }

  const changedEvidence = compare({
    ...criterion,
    ruleEvidence: {
      ...criterion.ruleEvidence,
      excerpt:
        "Synthetic test admissions rule: IELTS overall score minimum 5.5.",
    },
  });
  assert.equal(changedEvidence.outcome, "UNKNOWN");
  assert.ok(changedEvidence.reasons.includes("RULE_EVIDENCE_MISMATCH"));

  const admissionsSnapshotId = criterion.schoolField.snapshotId;
  const changedSourceDataset: EducationDataset = {
    ...fixture.dataset,
    snapshots: fixture.dataset.snapshots.map((snapshot) =>
      snapshot.snapshotId === admissionsSnapshotId
        ? { ...snapshot, contentExcerpt: "Changed synthetic source evidence." }
        : snapshot
    ),
  };
  const changedSource = compare(criterion, changedSourceDataset);
  assert.equal(changedSource.outcome, "UNKNOWN");
  assert.ok(changedSource.reasons.includes("RULE_EVIDENCE_MISMATCH"));

  const staleDataset: EducationDataset = {
    ...fixture.dataset,
    snapshots: fixture.dataset.snapshots.map((snapshot) =>
      snapshot.snapshotId === admissionsSnapshotId
        ? { ...snapshot, effectiveTo: "2026-10-26" }
        : snapshot
    ),
  };
  const stale = compare(criterion, staleDataset);
  assert.equal(stale.outcome, "UNKNOWN");
  assert.ok(stale.reasons.includes("STALE_SCHOOL_SOURCE"));

  const courseTitle = fixture.dataset.observations.find(
    (observation) => observation.fieldKey === "COURSE_TITLE"
  );
  assert.ok(courseTitle);
  const unrelatedNumericRule = criterionForObservation(fixture, courseTitle);
  const unrelated = compareCriterion({
    dataset: fixture.dataset,
    criterion: unrelatedNumericRule,
    reviewAuthority: trustedReviewAuthority([unrelatedNumericRule]),
    authorizedFacts: [fact()],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.equal(unrelated.outcome, "UNKNOWN");
  assert.ok(unrelated.reasons.includes("NUMERIC_RULE_NOT_GROUNDED"));
});

test("generic admissions prose cannot support a numeric requirement even with an approval status", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const criterion = admissionsCriterion(fixture);
  const result = compareCriterion({
    dataset: fixture.dataset,
    criterion,
    reviewAuthority: trustedReviewAuthority([criterion]),
    authorizedFacts: [fact()],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.equal(result.outcome, "UNKNOWN");
  assert.ok(result.reasons.includes("RULE_EVIDENCE_MISMATCH"));
  assert.equal(result.comparator, undefined);
});

test("date-only applicant facts compare before, on, and after an evidenced deadline", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const criterion = deadlineCriterion(fixture, {
    kind: "DATE_ON_OR_BEFORE",
    latest: "2027-01-15",
  });
  for (const [value, expected] of [
    ["2027-01-14", "MATCHES"],
    ["2027-01-15", "MATCHES"],
    ["2027-01-16", "DOES_NOT_MATCH"],
  ] as const) {
    const result = compareCriterion({
      dataset: fixture.dataset,
      criterion,
      authorizedFacts: [dateFact(value)],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    });
    assert.equal(result.outcome, expected, value);
  }

  const equality = deadlineCriterion(fixture, {
    kind: "DATE_EQUALS",
    expected: "2027-01-15",
  });
  assert.equal(
    compareCriterion({
      dataset: fixture.dataset,
      criterion: equality,
      authorizedFacts: [dateFact("2027-01-15")],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    }).outcome,
    "MATCHES"
  );
  assert.equal(
    compareCriterion({
      dataset: fixture.dataset,
      criterion: equality,
      authorizedFacts: [dateFact("2027-01-16")],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    }).outcome,
    "DOES_NOT_MATCH"
  );
});

test("zoned applicant timestamps remain UNKNOWN without reviewed calendar semantics", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const beforeOrOn = deadlineCriterion(fixture, {
    kind: "DATE_ON_OR_BEFORE",
    latest: "2027-01-15",
  });
  const equalsDeadline = deadlineCriterion(fixture, {
    kind: "DATE_EQUALS",
    expected: "2027-01-15",
  });
  const boundaryTimestamps = [
    "2027-01-16T00:30:00+11:00",
    "2027-01-14T23:30:00-02:00",
  ];
  for (const timestamp of boundaryTimestamps) {
    for (const criterion of [beforeOrOn, equalsDeadline]) {
      const result = compareCriterion({
        dataset: fixture.dataset,
        criterion,
        authorizedFacts: [dateFact(timestamp)],
        assessedAt: ASSESSED_AT,
        assessmentDate: ASSESSMENT_DATE,
      });
      assert.equal(result.outcome, "UNKNOWN", timestamp);
      assert.ok(
        result.reasons.includes("UNSUPPORTED_CALENDAR_DATE_SEMANTICS"),
        JSON.stringify(result)
      );
    }
  }
});

test("missing facts, proposed review, unknown applicability, and raw text remain UNKNOWN", () => {
  const fixture = fixtureWithReviewedAdmissionsEvidence(
    createSyntheticEducationFixture("VET")
  );
  const criterion = admissionsCriterion(fixture);
  const missing = compareCriterion({
    dataset: fixture.dataset,
    criterion,
    authorizedFacts: [],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.equal(missing.outcome, "UNKNOWN");
  assert.ok(
    missing.reasons.includes("MISSING_STUDENT_FACT"),
    JSON.stringify(missing)
  );

  const wrongVersion = compareCriterion({
    dataset: fixture.dataset,
    criterion,
    authorizedFacts: [fact({ assertionVersion: 4 })],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.equal(wrongVersion.outcome, "UNKNOWN");
  assert.ok(
    wrongVersion.reasons.includes("MISSING_OR_UNAUTHORIZED_STUDENT_FACT")
  );

  const proposed = compareCriterion({
    dataset: fixture.dataset,
    criterion: {
      ...criterion,
      review: { ...criterion.review, status: "PROPOSED" },
    },
    authorizedFacts: [fact()],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.equal(proposed.outcome, "UNKNOWN");
  assert.ok(proposed.reasons.includes("UNREVIEWED_COMPARATOR"));

  const unknownApplicability = compareCriterion({
    dataset: fixture.dataset,
    criterion: {
      ...criterion,
      applicability: { status: "UNKNOWN" },
    },
    authorizedFacts: [fact()],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.equal(unknownApplicability.outcome, "UNKNOWN");
  assert.ok(unknownApplicability.reasons.includes("UNKNOWN_APPLICABILITY"));

  assert.equal(
    missingReviewedRule({ criterionId: "raw-rule" }).outcome,
    "UNKNOWN"
  );
  assert.ok(
    unknownUnstructuredSchoolRule({
      criterionId: "raw-prose",
    }).reasons.includes("MISSING_SCHOOL_RULE")
  );
});

test("source authority and exact source/snapshot identity are required", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const discoveryObservation = fixture.dataset.observations.find(
    (item) => item.fieldKey === "DISCOVERY_REFERENCE"
  );
  assert.ok(discoveryObservation);
  const discoveryCriterion = criterionForObservation(
    fixture,
    discoveryObservation,
    {
      criterionId: "discovery-cannot-prove-admission",
      schoolField: {
        target: discoveryObservation.target,
        fieldKey: "DISCOVERY_REFERENCE",
        observationId: discoveryObservation.observationId,
        snapshotId: discoveryObservation.provenance.snapshotId,
      },
    }
  );
  const discovery = compareCriterion({
    dataset: fixture.dataset,
    criterion: discoveryCriterion,
    authorizedFacts: [fact()],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.equal(discovery.outcome, "UNKNOWN");
  assert.ok(
    discovery.reasons.includes("INCOMPATIBLE_SOURCE_AUTHORITY"),
    JSON.stringify(discovery)
  );

  const cricosObservation = fixture.dataset.observations.find(
    (item) => item.fieldKey === "CRICOS_COURSE_STATUS"
  );
  assert.ok(cricosObservation);
  const cricos = compareCriterion({
    dataset: fixture.dataset,
    criterion: criterionForObservation(fixture, cricosObservation, {
      criterionId: "cricos-cannot-prove-admission",
      schoolField: {
        target: cricosObservation.target,
        fieldKey: cricosObservation.fieldKey,
        observationId: cricosObservation.observationId,
        snapshotId: cricosObservation.provenance.snapshotId,
      },
    }),
    authorizedFacts: [fact()],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.equal(cricos.outcome, "UNKNOWN");
  assert.ok(cricos.reasons.includes("INCOMPATIBLE_SOURCE_AUTHORITY"));

  const mismatch = compareCriterion({
    dataset: fixture.dataset,
    criterion: {
      ...admissionsCriterion(fixture),
      schoolField: {
        ...admissionsCriterion(fixture).schoolField,
        snapshotId: "another-snapshot",
      },
    },
    authorizedFacts: [fact()],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.equal(mismatch.outcome, "UNKNOWN");
  assert.ok(mismatch.reasons.includes("SCHOOL_SOURCE_REFERENCE_MISMATCH"));
});

test("stale, conflicting, and withdrawn school fields do not become mismatches", () => {
  for (const scenario of [
    "STALE_AFTER_FAILED_PARSE",
    "CONFLICTING_OFFICIAL_OBSERVATIONS",
    "WITHDRAWN_FIELD",
  ] as const) {
    const fixture = createSyntheticEducationFixture(scenario);
    const feeObservation = fixture.dataset.observations.find(
      (item) => item.fieldKey === "TUITION_FEE"
    );
    assert.ok(feeObservation);
    const criterion = criterionForObservation(fixture, feeObservation, {
      criterionId: `fee-${scenario}`,
      schoolField: {
        target: feeObservation.target,
        fieldKey: "TUITION_FEE",
        observationId: feeObservation.observationId,
        snapshotId: feeObservation.provenance.snapshotId,
      },
      comparator: { kind: "SCHOOL_FEE_WITHIN_BUDGET" },
      applicantFact: {
        key: "fees.budget",
        valueType: "json",
        assertionId: "project-fact-language-score",
        assertionVersion: 3,
      },
    });
    const result = compareCriterion({
      dataset: fixture.dataset,
      criterion,
      authorizedFacts: [
        fact({
          key: "fees.budget",
          value: {
            kind: "money",
            amount: 2_000_000,
            currency: "AUD",
            audience: "INTERNATIONAL",
            basis: "ANNUAL",
            year: 2027,
            inclusions: [],
          },
        }),
      ],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    });
    assert.notEqual(result.outcome, "DOES_NOT_MATCH", scenario);
  }
});

test("fee comparisons fail UNKNOWN on currency or fee-scope mismatch without conversion", () => {
  const fixture = createSyntheticEducationFixture("VET");
  const feeObservation = fixture.dataset.observations.find(
    (item) => item.fieldKey === "TUITION_FEE"
  );
  assert.ok(feeObservation);
  const criterion = criterionForObservation(fixture, feeObservation, {
    criterionId: "budget-comparison",
    schoolField: {
      target: feeObservation.target,
      fieldKey: "TUITION_FEE",
      observationId: feeObservation.observationId,
      snapshotId: feeObservation.provenance.snapshotId,
    },
    comparator: { kind: "SCHOOL_FEE_WITHIN_BUDGET" },
    applicantFact: {
      key: "fees.budget",
      valueType: "json",
      assertionId: "project-fact-language-score",
      assertionVersion: 3,
    },
  });
  const incompatible = compareCriterion({
    dataset: fixture.dataset,
    criterion,
    authorizedFacts: [
      fact({
        key: "fees.budget",
        value: {
          kind: "money",
          amount: 2_000_000,
          currency: "NZD",
          audience: "INTERNATIONAL",
          basis: "ANNUAL",
          year: 2027,
          inclusions: [],
        },
      }),
    ],
    assessedAt: ASSESSED_AT,
    assessmentDate: ASSESSMENT_DATE,
  });
  assert.equal(incompatible.outcome, "UNKNOWN");
  assert.ok(incompatible.reasons.includes("INCOMPATIBLE_MONEY_SCOPE"));

  const incompatibleBudgets = [
    {
      currency: "AUD",
      audience: "DOMESTIC",
      basis: "ANNUAL",
      year: 2027,
      inclusions: [],
    },
    {
      currency: "AUD",
      audience: "INTERNATIONAL",
      basis: "SEMESTER",
      year: 2027,
      period: "Semester 1",
      inclusions: [],
    },
    {
      currency: "AUD",
      audience: "INTERNATIONAL",
      basis: "ANNUAL",
      year: 2028,
      inclusions: [],
    },
    {
      currency: "AUD",
      audience: "INTERNATIONAL",
      basis: "ANNUAL",
      year: 2027,
      inclusions: ["materials"],
    },
  ];
  for (const budget of incompatibleBudgets) {
    const result = compareCriterion({
      dataset: fixture.dataset,
      criterion,
      authorizedFacts: [
        fact({
          key: "fees.budget",
          value: { kind: "money", amount: 2_000_000, ...budget },
        }),
      ],
      assessedAt: ASSESSED_AT,
      assessmentDate: ASSESSMENT_DATE,
    });
    assert.equal(result.outcome, "UNKNOWN");
    assert.ok(result.reasons.includes("INCOMPATIBLE_MONEY_SCOPE"));
  }
});
