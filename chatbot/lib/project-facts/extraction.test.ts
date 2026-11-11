import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractProjectFactCandidates,
  PROJECT_FACT_EXTRACTION_VERSION,
  type ProjectEvidenceUnitInput,
  parseDocumentDate,
} from "./extraction";

function candidate(ordinal: number, excerpt: string): ProjectEvidenceUnitInput {
  return {
    ordinal,
    locator: { kind: "block", start: ordinal, end: ordinal },
    excerpt,
  };
}

const REFS = new Map<number, string>([
  [1, "evidence-ref-1"],
  [2, "evidence-ref-2"],
  [3, "evidence-ref-3"],
]);

const COE_EXCERPT = [
  "Confirmation of Enrolment",
  "Student name: Lin Wei",
  "Date of birth: 04/07/2004",
  "Education provider: Example Institute of Technology",
  "Course name: Bachelor of Information Technology",
  "Campus: Sydney",
  "Course start date: 01/03/2027",
  "Course end date: 30/11/2029",
  "CoE reference: 9F7A2C1B44",
].join("\n");

const OSHC_EXCERPT = [
  "Overseas Student Health Cover",
  "Student name: Lin Wei",
  "OSHC start date: 20/02/2027",
  "OSHC expiry date: 19/02/2030",
].join("\n");

const VISA_EXCERPT = [
  "Visa grant notice",
  "Subclass: 500",
  "Visa conditions: 8105, 8202, 8501",
  "Visa expiry date: 15/03/2030",
].join("\n");

test("proposes labelled fields from CoE, OSHC and visa evidence with exact refs", () => {
  const result = extractProjectFactCandidates({
    candidates: [
      candidate(1, COE_EXCERPT),
      candidate(2, OSHC_EXCERPT),
      candidate(3, VISA_EXCERPT),
    ],
    refsByOrdinal: REFS,
  });

  assert.equal(result.extractionVersion, PROJECT_FACT_EXTRACTION_VERSION);
  const byKey = new Map(result.drafts.map((draft) => [draft.key, draft]));

  assert.equal(byKey.get("applicant.full_name")?.value, "Lin Wei");
  assert.equal(byKey.get("applicant.date_of_birth")?.value, "2004-07-04");
  assert.equal(
    byKey.get("study.school")?.value,
    "Example Institute of Technology"
  );
  assert.equal(
    byKey.get("study.course")?.value,
    "Bachelor of Information Technology"
  );
  assert.equal(byKey.get("study.campus")?.value, "Sydney");
  assert.equal(byKey.get("study.course_start_date")?.value, "2027-03-01");
  assert.equal(byKey.get("study.course_end_date")?.value, "2029-11-30");
  assert.equal(byKey.get("study.coe_reference")?.value, "9F7A2C1B44");
  assert.equal(byKey.get("insurance.oshc_start_date")?.value, "2027-02-20");
  assert.equal(byKey.get("insurance.oshc_expiry_date")?.value, "2030-02-19");
  assert.equal(byKey.get("visa.category")?.value, "500");
  assert.equal(byKey.get("visa.conditions")?.value, "8105, 8202, 8501");
  assert.equal(byKey.get("visa.expiry_date")?.value, "2030-03-15");

  // Every draft is an unconfirmed, evidence-linked proposal.
  for (const draft of result.drafts) {
    assert.equal(draft.originKind, "document_extracted");
    assert.equal(draft.matchKind, "explicit_label");
    assert.equal(draft.observedAt, null);
    assert.equal(draft.supersedesAssertionId, null);
    assert.match(draft.sourceEvidenceRef, /^evidence-ref-[123]$/u);
  }
  const coeDraft = byKey.get("study.course");
  assert.equal(coeDraft?.sourceEvidenceRef, "evidence-ref-1");
  assert.equal(coeDraft?.documentKind, "coe");
  assert.deepEqual(result.documentKinds, ["coe", "oshc", "visa"]);
});

test("never invents subject identity or values that are not explicitly labelled", () => {
  const result = extractProjectFactCandidates({
    candidates: [
      candidate(
        1,
        [
          "Confirmation of Enrolment",
          "Course name: Bachelor of Nursing",
          "Course start date: 01/03/2027",
        ].join("\n")
      ),
    ],
    refsByOrdinal: REFS,
  });
  const keys = result.drafts.map((draft) => draft.key);
  assert.ok(keys.includes("study.course"));
  // No explicit student/applicant label means no person-scoped fact at all.
  assert.ok(!keys.includes("applicant.full_name"));
  assert.ok(!keys.includes("applicant.date_of_birth"));

  const unlabelled = extractProjectFactCandidates({
    candidates: [
      candidate(
        2,
        [
          "Overseas Student Health Cover",
          "Policy summary for the period 20/02/2027 to 19/02/2030",
        ].join("\n")
      ),
    ],
    refsByOrdinal: REFS,
  });
  assert.deepEqual(unlabelled.drafts, []);
  assert.equal(unlabelled.unitsWithoutFields, 1);
});

test("ignores units with no recognised document kind or no issued evidence ref", () => {
  const result = extractProjectFactCandidates({
    candidates: [
      candidate(1, "Student name: Lin Wei\nCourse name: Fine Arts"),
      candidate(9, "Confirmation of Enrolment\nCourse name: Diploma of Design"),
    ],
    refsByOrdinal: REFS,
  });
  assert.deepEqual(result.drafts, []);
  assert.equal(result.unitsWithoutFields, 2);
  // A unit with no issued reference cannot characterise the document either.
  assert.deepEqual(result.documentKinds, []);
});

test("the document kind is decided per document, not per paragraph", () => {
  const result = extractProjectFactCandidates({
    candidates: [
      candidate(1, "Confirmation of Enrolment"),
      candidate(2, "Course name: Bachelor of Nursing"),
    ],
    refsByOrdinal: REFS,
  });
  const course = result.drafts.find((draft) => draft.key === "study.course");
  assert.equal(course?.value, "Bachelor of Nursing");
  assert.equal(course?.documentKind, "coe");
});

test("a newer conflicting value is proposed alongside history, never overwriting", () => {
  const result = extractProjectFactCandidates({
    candidates: [candidate(1, COE_EXCERPT)],
    refsByOrdinal: REFS,
    existingFacts: [
      {
        assertionId: "assertion-old-course",
        key: "study.course",
        value: "Bachelor of Business",
        state: "customer_confirmed",
      },
    ],
  });
  const course = result.drafts.find((draft) => draft.key === "study.course");
  assert.ok(course, "the new value is still proposed");
  assert.equal(course?.value, "Bachelor of Information Technology");
  assert.equal(course?.conflictsWithExisting, true);
  assert.equal(course?.supersedesAssertionId, null);
  assert.deepEqual(result.conflicts, [
    {
      key: "study.course",
      existingAssertionId: "assertion-old-course",
      existingValue: "Bachelor of Business",
      proposedValue: "Bachelor of Information Technology",
      sourceEvidenceRef: "evidence-ref-1",
    },
  ]);
});

test("identical existing values are not proposed again", () => {
  const result = extractProjectFactCandidates({
    candidates: [candidate(1, COE_EXCERPT)],
    refsByOrdinal: REFS,
    existingFacts: [
      {
        assertionId: "assertion-course",
        key: "study.course",
        value: "  bachelor of information technology ",
        state: "customer_confirmed",
      },
    ],
  });
  assert.equal(result.duplicatesSkipped, 1);
  assert.equal(
    result.drafts.some((draft) => draft.key === "study.course"),
    false
  );
  assert.deepEqual(result.conflicts, []);
});

test("document dates are parsed only from unambiguous shapes", () => {
  assert.equal(parseDocumentDate("2027-03-01"), "2027-03-01");
  assert.equal(parseDocumentDate("01/03/2027"), "2027-03-01");
  assert.equal(parseDocumentDate("13/05/2027"), "2027-05-13");
  assert.equal(parseDocumentDate("1 March 2027"), "2027-03-01");
  assert.equal(parseDocumentDate("March 1, 2027"), "2027-03-01");
  // Month-first/ambiguous and impossible shapes produce no value at all.
  assert.equal(parseDocumentDate("05/13/2027"), null);
  assert.equal(parseDocumentDate("31/02/2027"), null);
  assert.equal(parseDocumentDate("not a date"), null);
  assert.equal(parseDocumentDate("01/03/27"), null);
});

test("extraction is bounded and deterministic for repeated runs", () => {
  const units = Array.from({ length: 60 }, (_, index) =>
    candidate(
      index + 1,
      `Confirmation of Enrolment\nStudent name: Candidate ${index + 1}`
    )
  );
  const refs = new Map(
    units.map((unit) => [unit.ordinal, `ref-${unit.ordinal}`])
  );
  const first = extractProjectFactCandidates({
    candidates: units,
    refsByOrdinal: refs,
  });
  assert.ok(first.drafts.length <= 40);
  const second = extractProjectFactCandidates({
    candidates: [...units].reverse(),
    refsByOrdinal: refs,
  });
  assert.deepEqual(
    second.drafts.map((draft) => [draft.key, draft.value]),
    first.drafts.map((draft) => [draft.key, draft.value])
  );
});
