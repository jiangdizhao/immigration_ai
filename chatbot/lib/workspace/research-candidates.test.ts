import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ResearchCandidateV1,
  researchCandidateV1Schema,
  type TrustedCandidateSource,
  validateResearchCandidateV1,
} from "./research-candidates";

const projectId = "123e4567-e89b-42d3-a456-426614174000";
const targetId = "123e4567-e89b-42d3-a456-426614174001";
const source: TrustedCandidateSource = {
  refId: "request-source-1",
  url: "https://www.northbridge.example.edu/course-x",
  title: "Bachelor of Example",
  sourceKind: "institution_official",
  observedAt: "2026-11-24T00:00:00.000Z",
  currentness: "current",
  observedFields: {
    institution_name: "Northbridge University",
    course_title: "Bachelor of Example",
  },
  allowedHostname: "www.northbridge.example.edu",
};

function candidate(
  overrides: Partial<ResearchCandidateV1> = {}
): ResearchCandidateV1 {
  return {
    schemaVersion: "phase15.research-candidate.v1",
    candidateId: "candidate-1",
    projectId,
    targetSchoolApplicationId: targetId,
    institution: { name: "Northbridge University", officialIdentity: null },
    course: {
      title: "Bachelor of Example",
      officialCourseCode: null,
      qualification: null,
      campus: null,
      intake: null,
    },
    observedFields: [
      {
        key: "institution_name",
        value: "Northbridge University",
        sourceRefId: source.refId,
        observedAt: source.observedAt,
        currentness: "current",
      },
      {
        key: "course_title",
        value: "Bachelor of Example",
        sourceRefId: source.refId,
        observedAt: source.observedAt,
        currentness: "current",
      },
    ],
    sources: [
      {
        refId: source.refId,
        url: source.url,
        title: source.title,
        sourceKind: source.sourceKind,
        observedAt: source.observedAt,
        currentness: source.currentness,
      },
    ],
    unknownFields: ["intake", "tuition"],
    status: "source_backed_candidate",
    ...overrides,
  };
}

test("source-backed course fields require exact same-request source observations", () => {
  const result = validateResearchCandidateV1({
    value: candidate(),
    projectId,
    targetSchoolApplicationId: targetId,
    trustedSources: new Map([[source.refId, source]]),
  });
  assert.equal(result.state, "source_backed_candidate");
  assert.equal(result.reasonCode, null);
});

test("model-invented URL, field, cross-Project or cross-school data cannot become source-backed", () => {
  const forgedSource = candidate({
    sources: [
      {
        refId: "forged",
        url: "https://example.com/fake-course",
        title: "Official course",
        sourceKind: "institution_official",
        observedAt: source.observedAt,
        currentness: "current",
      },
    ],
  });
  const map = new Map([[source.refId, source]]);
  assert.equal(
    validateResearchCandidateV1({
      value: forgedSource,
      projectId,
      targetSchoolApplicationId: targetId,
      trustedSources: map,
    }).state,
    "unverified"
  );
  assert.equal(
    validateResearchCandidateV1({
      value: candidate({ projectId: "123e4567-e89b-42d3-a456-426614174099" }),
      projectId,
      targetSchoolApplicationId: targetId,
      trustedSources: map,
    }).reasonCode,
    "candidate_scope_mismatch"
  );
  assert.equal(
    validateResearchCandidateV1({
      value: candidate({ targetSchoolApplicationId: null }),
      projectId,
      targetSchoolApplicationId: targetId,
      trustedSources: map,
    }).state,
    "unavailable"
  );
});

test("unknown, conflicting or stale fields stay partial and synthetic data is rejected", () => {
  const changedSource = { ...source, currentness: "stale" as const };
  const stale = validateResearchCandidateV1({
    value: candidate(),
    projectId,
    targetSchoolApplicationId: targetId,
    trustedSources: new Map([[source.refId, changedSource]]),
  });
  assert.equal(stale.state, "unverified");

  const wrongField = candidate({
    observedFields: [
      {
        key: "course_title",
        value: "An invented research area",
        sourceRefId: source.refId,
        observedAt: source.observedAt,
        currentness: "current",
      },
    ],
  });
  assert.equal(
    validateResearchCandidateV1({
      value: wrongField,
      projectId,
      targetSchoolApplicationId: targetId,
      trustedSources: new Map([[source.refId, source]]),
    }).state,
    "partial"
  );

  const synthetic = candidate({
    sources: [
      {
        refId: source.refId,
        url: source.url,
        title: source.title,
        sourceKind: "synthetic_fixture" as never,
        observedAt: source.observedAt,
        currentness: "current",
      },
    ],
  });
  assert.equal(
    validateResearchCandidateV1({
      value: synthetic,
      projectId,
      targetSchoolApplicationId: targetId,
      trustedSources: new Map([[source.refId, source]]),
    }).state,
    "unavailable"
  );
});

test("candidate institution and course identities must equal trusted observations", () => {
  const trustedSources = new Map([[source.refId, source]]);
  const forgedCourse = candidate({
    course: {
      title: "Invented Bachelor of Migration",
      officialCourseCode: null,
      qualification: null,
      campus: null,
      intake: null,
    },
  });
  const forgedInstitution = candidate({
    institution: { name: "Invented University", officialIdentity: null },
  });

  for (const forged of [forgedCourse, forgedInstitution]) {
    const result = validateResearchCandidateV1({
      value: forged,
      projectId,
      targetSchoolApplicationId: targetId,
      trustedSources,
    });
    assert.equal(result.state, "partial");
    assert.equal(result.reasonCode, "candidate_identity_fields_unverified");
  }
});

test("official source host allowlisting cannot admit loopback or IP literal hosts", () => {
  const localSource = {
    ...source,
    url: "https://127.0.0.1/course",
    allowedHostname: "127.0.0.1",
  };
  const result = validateResearchCandidateV1({
    value: candidate({
      sources: [
        {
          refId: localSource.refId,
          url: localSource.url,
          title: localSource.title,
          sourceKind: localSource.sourceKind,
          observedAt: localSource.observedAt,
          currentness: localSource.currentness,
        },
      ],
    }),
    projectId,
    targetSchoolApplicationId: targetId,
    trustedSources: new Map([[localSource.refId, localSource]]),
  });
  assert.equal(result.state, "unverified");
  assert.equal(result.reasonCode, "candidate_source_identity_unverified");
});

test("genuinely observed but conflicting course fields stay qualified", () => {
  const secondSource: TrustedCandidateSource = {
    ...source,
    refId: "request-source-2",
    url: "https://www.northbridge.example.edu/alternate-course",
    title: "Alternate course page",
    observedFields: {
      institution_name: "Northbridge University",
      course_title: "Bachelor of Another Example",
    },
  };
  const result = validateResearchCandidateV1({
    value: candidate({
      observedFields: [
        ...candidate().observedFields,
        {
          key: "course_title",
          value: "Bachelor of Another Example",
          sourceRefId: secondSource.refId,
          observedAt: secondSource.observedAt,
          currentness: "current",
        },
      ],
      sources: [
        ...candidate().sources,
        {
          refId: secondSource.refId,
          url: secondSource.url,
          title: secondSource.title,
          sourceKind: secondSource.sourceKind,
          observedAt: secondSource.observedAt,
          currentness: secondSource.currentness,
        },
      ],
    }),
    projectId,
    targetSchoolApplicationId: targetId,
    trustedSources: new Map([
      [source.refId, source],
      [secondSource.refId, secondSource],
    ]),
  });
  assert.equal(result.state, "partial");
  assert.equal(result.reasonCode, "candidate_source_fields_conflict");
});

test("candidate schema enforces its total serialized byte bound", () => {
  const huge = candidate({
    observedFields: [
      "institution_name",
      "official_institution_identity",
      "course_title",
      "official_course_code",
      "qualification",
      "campus",
      "intake",
      "tuition",
      "entry_requirements",
    ].map((key) => ({
      key: key as ResearchCandidateV1["observedFields"][number]["key"],
      value: "x".repeat(500),
      sourceRefId: source.refId,
      observedAt: source.observedAt,
      currentness: "current" as const,
    })),
    sources: Array.from({ length: 6 }, (_, index) => ({
      refId: `source-${index}`,
      url: `https://www.northbridge.example.edu/${"x".repeat(1800)}`,
      title: "x".repeat(240),
      sourceKind: "institution_official" as const,
      observedAt: source.observedAt,
      currentness: "current" as const,
    })),
  });
  assert.equal(researchCandidateV1Schema.safeParse(huge).success, false);
});
