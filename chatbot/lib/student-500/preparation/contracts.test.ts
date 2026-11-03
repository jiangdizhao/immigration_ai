import assert from "node:assert/strict";
import { test } from "node:test";
import { STUDENT_500_REQUIREMENT_KEYS } from "../contracts";
import {
  factKeyMatches,
  normalizeGsSectionText,
  preparationDigest,
  requirementFactKeys,
  STUDENT_500_COVERAGE_STATES,
  STUDENT_500_EVIDENCE_GAPS,
  STUDENT_500_GS_SECTION_KEYS,
  STUDENT_500_PREPARATION_ACTIONS,
  STUDENT_500_PREPARATION_DISCLOSURES,
  STUDENT_500_REQUIREMENT_FACT_KEYS,
  STUDENT_500_STALE_REASONS,
} from "./contracts";
import {
  buildStarterDraft,
  draftContentSha256,
  normalizeEditedSections,
} from "./gs-draft";
import {
  factReferenceState,
  reconciliationFor,
  staleReasonsForArtifact,
} from "./reconciliation";
import { fact } from "./testing";

/**
 * Contract-level invariants for M6.2: the vocabulary may not express approval,
 * verification, submission or eligibility; missing information stays first class.
 */

const FORBIDDEN =
  /eligib|approv|verified_coe|submission_ready|complete\b|certified|professional_ok/u;

function vocabulary(): string[] {
  return [
    ...STUDENT_500_COVERAGE_STATES,
    ...STUDENT_500_EVIDENCE_GAPS,
    ...STUDENT_500_PREPARATION_ACTIONS,
    ...STUDENT_500_PREPARATION_DISCLOSURES,
    ...STUDENT_500_STALE_REASONS,
    ...STUDENT_500_GS_SECTION_KEYS,
  ];
}

test("no M6.2 vocabulary member can express approval, verification or eligibility", () => {
  for (const value of vocabulary()) {
    assert.doesNotMatch(value, FORBIDDEN, value);
  }
  // The only place verification may appear is a *negative* statement.
  assert.ok(
    STUDENT_500_EVIDENCE_GAPS.includes("independent_verification_unavailable")
  );
  assert.ok(STUDENT_500_COVERAGE_STATES.includes("not_assessed"));
  assert.ok(STUDENT_500_COVERAGE_STATES.includes("missing_evidence"));
});

test("every screening dimension has a declared coverage mapping", () => {
  for (const key of STUDENT_500_REQUIREMENT_KEYS) {
    assert.ok(Array.isArray(requirementFactKeys(key)), key);
  }
  assert.deepEqual(
    STUDENT_500_REQUIREMENT_FACT_KEYS.english_language_evidence,
    ["language.", "english."]
  );
});

test("declared fact-key matching is prefix-or-exact, never fuzzy", () => {
  assert.equal(factKeyMatches("language.testscore", ["language."]), true);
  assert.equal(factKeyMatches("language", ["language."]), false);
  assert.equal(factKeyMatches("fees.budget", ["fees.budget"]), true);
  assert.equal(factKeyMatches("fees.budget_total", ["fees.budget"]), false);
});

test("content digests are canonical and change with content", () => {
  assert.equal(
    preparationDigest({ a: 1, b: 2 }),
    preparationDigest({ b: 2, a: 1 })
  );
  assert.notEqual(preparationDigest({ a: 1 }), preparationDigest({ a: 2 }));
  const sections = buildStarterDraft([]).sections;
  assert.equal(draftContentSha256(sections).length, 64);
});

test("GS section text is bounded and rejects control characters", () => {
  assert.equal(normalizeGsSectionText("  hello \n world "), "hello \n world");
  assert.throws(() => normalizeGsSectionText("   "));
  assert.throws(() => normalizeGsSectionText("a".repeat(1300)));
  assert.throws(() => normalizeGsSectionText("bad\u0007text"));
  assert.throws(() => normalizeGsSectionText(42 as unknown as string));
});

test("the starter emits all sections and never invents content", () => {
  const draft = buildStarterDraft([]);
  assert.equal(draft.sections.length, STUDENT_500_GS_SECTION_KEYS.length);
  assert.equal(draft.sourceFactReferenceIds.length, 0);
  for (const section of draft.sections) {
    assert.equal(section.source, "missing");
    assert.deepEqual(section.missingInformation, [
      "no_authorized_fact_for_section",
    ]);
    assert.match(section.text, /has not invented any details/u);
  }
});

test("customer edits cannot invent sections, facts or attribution", () => {
  const base = buildStarterDraft([
    {
      factAssertionId: "55555555-5555-4555-8555-5555555555c1",
      factKey: "study.course_name",
      factReferenceId: "99999999-9999-4999-8999-999999999901",
      factVersion: 3,
      originKind: "customer_stated",
      valueDisplay: "Bachelor of Nursing",
    },
  ]).sections;
  const edited = normalizeEditedSections({
    edits: [{ sectionKey: "course_and_reasons", text: "My own wording." }],
    previous: base,
  });
  const course = edited.find(
    (section) => section.sectionKey === "course_and_reasons"
  );
  assert.equal(course?.text, "My own wording.");
  assert.equal(course?.source, "customer_text");
  // Provenance stays attached; a customer cannot drop the fact dependency.
  assert.deepEqual(course?.factReferenceIds, [
    "99999999-9999-4999-8999-999999999901",
  ]);
  assert.throws(() =>
    normalizeEditedSections({
      edits: [{ sectionKey: "invented_section", text: "x" }],
      previous: base,
    })
  );
  assert.throws(() => normalizeEditedSections({ edits: [], previous: base }));
});

function reference(overrides: Record<string, unknown> = {}) {
  return {
    aiUseAuthorizedAtSelection: true,
    applicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
    authorizationActorUserId: "11111111-1111-4111-8111-111111111201",
    authorizationAudience: "project" as const,
    createdAt: new Date("2026-11-03T00:00:00.000Z"),
    createdByUserId: "11111111-1111-4111-8111-111111111201",
    factAssertionId: "55555555-5555-4555-8555-555555555501",
    factKey: "language.testscore",
    factVersion: 1,
    id: "99999999-9999-4999-8999-999999999902",
    originKind: "customer_stated",
    projectId: "22222222-2222-4222-8222-222222222301",
    revokedAt: null,
    sourceEvidenceRef: null,
    stateAtUse: "customer_confirmed",
    ...overrides,
  };
}

test("a live reference state is derived, never stored as a conclusion", () => {
  assert.equal(
    factReferenceState({
      applicationArchived: false,
      candidate: fact({ key: "language.testscore" }),
      reference: reference(),
    }).state,
    "covered_by_authorized_fact"
  );
  assert.equal(
    factReferenceState({
      applicationArchived: false,
      candidate: null,
      reference: reference(),
    }).state,
    "blocked_fact_stale"
  );
  assert.equal(
    factReferenceState({
      applicationArchived: false,
      candidate: fact({
        key: "language.testscore",
        state: "superseded",
        version: 2,
      }),
      reference: reference(),
    }).state,
    "blocked_fact_stale"
  );
  assert.equal(
    factReferenceState({
      applicationArchived: false,
      candidate: fact({ key: "language.testscore", conflicted: true }),
      reference: reference(),
    }).state,
    "blocked_fact_conflicting"
  );
  assert.equal(
    factReferenceState({
      applicationArchived: false,
      candidate: fact({
        key: "language.testscore",
        aiUseAuthorized: false,
        authorizedAudience: "none",
      }),
      reference: reference(),
    }).state,
    "blocked_fact_not_ai_authorized"
  );
  assert.equal(
    factReferenceState({
      applicationArchived: false,
      candidate: fact({ key: "language.testscore" }),
      reference: reference({ revokedAt: new Date() }),
    }).state,
    "blocked_fact_revoked"
  );
});

test("selective invalidation names only provable reasons", () => {
  const ref = reference();
  assert.deepEqual(
    staleReasonsForArtifact({
      applicationRevisionAdvanced: false,
      artifactFactReferenceIds: [ref.id],
      candidates: [fact({ key: "language.testscore" })],
      currentFactReferenceIds: [ref.id],
      inputDigestMatches: true,
      references: [ref],
      schoolContextDigestMatches: true,
    }),
    []
  );
  const reasons = staleReasonsForArtifact({
    applicationRevisionAdvanced: true,
    artifactFactReferenceIds: [ref.id],
    candidates: [fact({ key: "language.testscore", version: 4 })],
    currentFactReferenceIds: [],
    inputDigestMatches: false,
    references: [ref],
    schoolContextDigestMatches: false,
  });
  assert.ok(reasons.includes("fact_version_superseded"));
  assert.ok(reasons.includes("fact_key_set_changed"));
  assert.ok(reasons.includes("application_revision_advanced"));
  assert.ok(reasons.includes("school_context_changed"));
  // Legal currentness is never simulated as a detected change.
  assert.equal(reasons.includes("legal_source_currentness_unknown"), false);
});

test("reconciliation never yields a single completeness boolean", () => {
  const screening = {
    asOfDate: "2026-11-03",
    counts: { applicable: 1, conditional: 0, notApplicable: 0, unknown: 0 },
    disclosures: [],
    humanReviewReasons: [],
    missingFactCodes: [],
    nextAction: "review_requirement_checklist",
    preparationState: "screening_incomplete",
    requirements: [
      {
        evidencePreparation: "not_declared",
        humanReviewRequired: true,
        missingFactCodes: [],
        reasonCode: "selected_for_all_student_500_applications",
        requirementKey: "english_language_evidence",
        sourceVerification: "declared_pending_verification",
        sources: [],
        status: "applicable",
      },
    ],
    schemaVersion: "phase13.student500-screening.v1",
    studyEvidence: {
      coeStatus: "unknown",
      coeVerification: "unknown",
      linkedSchoolApplication: null,
      route: null,
    },
    submissionStatus: "not_submission_ready",
  } as unknown as Parameters<typeof reconciliationFor>[0]["screening"];

  const missing = reconciliationFor({
    applicationArchived: false,
    candidates: [],
    factsAvailable: true,
    factsUnavailableReason: null,
    hasDraft: false,
    references: [],
    schoolContext: null,
    screening,
  });
  assert.equal(missing.requirements[0]?.coverage, "missing_evidence");
  assert.equal(missing.counts.missing, 1);
  assert.ok(missing.disclosures.includes("not_an_official_checklist_result"));
  assert.equal("complete" in missing, false);
});
