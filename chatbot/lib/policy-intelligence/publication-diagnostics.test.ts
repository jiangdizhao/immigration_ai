import assert from "node:assert/strict";
import test from "node:test";
import {
  POLICY_ANALYSIS_SCHEMA,
  POLICY_VERIFICATION_SCHEMA,
  policyAnalysisSchema,
} from "./contracts";
import {
  buildAdminSourceSyncDiagnostic,
  buildAdminPublicationDiagnostics,
  explainPublicationReason,
} from "./publication-diagnostics";

const ref = "policy-snapshot:snapshot-1";
const evidence = {
  evidenceRef: ref,
  snapshotId: "snapshot-1",
  sourceConfigId: "home-affairs-guidance",
  sourceId: "source-1",
  authority: "Department of Home Affairs",
  canonicalUrl: "https://immi.homeaffairs.gov.au/policy/example",
  officialTitle: "Policy example",
  retrievedAt: "2026-10-01T00:00:00.000Z",
  contentHash: "content-hash",
  sourceDate: null,
  effectiveDate: null,
  evidenceTruncated: false,
  text: "Stored source evidence.",
} as const;

function analysis() {
  const text = { "zh-CN": "来源支持的说明。", en: "A supported summary." };
  const linked = { ...text, claimRefs: ["claim-1"], uncertainty: null };
  const narrative = (id: string) => ({
    id,
    kind: "source_fact" as const,
    text: linked,
    evidenceRefs: [ref],
  });
  return policyAnalysisSchema.parse({
    schemaVersion: POLICY_ANALYSIS_SCHEMA,
    publicationEligibility: {
      id: "policy-relevance",
      classification: "policy_relevant",
      evidenceRefs: [ref],
    },
    title: narrative("title"),
    executiveSummary: narrative("executive-summary"),
    keyChanges: [narrative("change-1")],
    affectedGroups: [narrative("group-1")],
    practicalImpacts: [
      {
        ...narrative("impact-1"),
        kind: "practical_interpretation",
      },
    ],
    recommendedActions: [],
    transitionInfo: null,
    uncertainties: [],
    relatedSnapshotRefs: [],
    sourceStatus: {
      id: "source-status",
      value: "announced",
      certain: false,
      claimRef: "claim-1",
      evidenceRefs: [ref],
    },
    materialClaims: [
      {
        id: "claim-1",
        kind: "source_fact",
        decisive: true,
        conditional: false,
        text,
        uncertainty: null,
        evidenceRefs: [ref],
      },
    ],
    importance: {
      affectedPopulation: 2,
      legalForce: "official_guidance",
      immediacy: 2,
      serviceRelevance: 3,
      proceduralImpact: 2,
    },
  });
}

function verification(draft: ReturnType<typeof analysis>) {
  const units = [
    ...draft.materialClaims,
    draft.title,
    draft.executiveSummary,
    ...draft.keyChanges,
    ...draft.affectedGroups,
    ...draft.practicalImpacts,
    ...draft.recommendedActions,
    ...(draft.transitionInfo ? [draft.transitionInfo] : []),
    ...draft.uncertainties,
    draft.publicationEligibility,
    draft.sourceStatus,
  ];
  return {
    schemaVersion: POLICY_VERIFICATION_SCHEMA,
    assessments: units.map((unit) => {
      const unsupported =
        unit.id === "claim-1" || unit.id === "policy-relevance";
      return {
        unitId: unit.id,
        verdict: unsupported
          ? ("unsupported" as const)
          : ("supported" as const),
        evidenceRefs: unsupported ? [] : [...unit.evidenceRefs],
        reasonCode: unsupported
          ? ("insufficient_support" as const)
          : ("direct_support" as const),
      };
    }),
  };
}

test("published item has no blocking diagnostics", () => {
  assert.deepEqual(
    buildAdminPublicationDiagnostics({
      editorialStatus: "published",
      analysis: null,
      verification: null,
      evidence: null,
    }),
    { published: true, reasons: [], advisories: [] }
  );
});

test("a held item exposes structural blockers and non-blocking advisories", () => {
  const draft = analysis();
  const diagnostics = buildAdminPublicationDiagnostics({
    editorialStatus: "review_required",
    analysis: draft,
    verification: verification(draft),
    evidence,
  });

  // D-072: AI opinions are advisories, never blocking reasons. A held item with
  // no structural blocker reports no blocking reason at all.
  assert.equal(diagnostics.published, false);
  assert.deepEqual(diagnostics.reasons, []);
  assert.deepEqual(
    diagnostics.advisories
      .filter((advisory) => !advisory.unitId)
      .map((advisory) => advisory.reasonCode)
      .sort(),
    [
      "analysis_withheld_title_or_summary",
      "publication_eligibility_not_verified",
      "source_status_recorded_as_uncertain",
    ]
  );
  assert.ok(
    diagnostics.advisories.some(
      (advisory) =>
        advisory.reasonCode === "insufficient_support" &&
        advisory.unitId === "claim-1" &&
        advisory.explanation.length > 0
    )
  );
});

test("a structurally blocked item reports the blocker as the only reason", () => {
  const draft = analysis();
  const diagnostics = buildAdminPublicationDiagnostics({
    editorialStatus: "review_required",
    analysis: draft,
    verification: verification(draft),
    evidence: { ...evidence, canonicalUrl: "" },
  });
  assert.deepEqual(
    diagnostics.reasons.map((reason) => reason.reasonCode),
    ["source_identity_incomplete"]
  );
});

test("source sync failure is kept separate from item publication diagnostics", () => {
  const diagnostics = buildAdminPublicationDiagnostics({
    editorialStatus: "draft",
    analysis: null,
    verification: null,
    evidence: null,
  });
  const sourceDiagnostic = buildAdminSourceSyncDiagnostic({
    status: "partial",
    safeErrorCode: "provider_timeout",
  });

  assert.equal(diagnostics.reasons.some(({ reasonCode }) => reasonCode === "provider_timeout"), false);
  assert.deepEqual(sourceDiagnostic, {
    status: "partial",
    errorCode: "provider_timeout",
    explanation: "The analysis provider exceeded its configured timeout during source sync.",
  });
  const unknownSourceDiagnostic = buildAdminSourceSyncDiagnostic({
    status: "failed",
    safeErrorCode: "new_pipeline_reason_42",
  });
  assert.equal(unknownSourceDiagnostic?.errorCode, "new_pipeline_reason_42");
  assert.equal(
    unknownSourceDiagnostic?.explanation,
    "No explanation is registered for this diagnostic code."
  );
  assert.equal(
    explainPublicationReason("unrecognized_reason"),
    "No explanation is registered for this diagnostic code."
  );
  assert.equal(
    explainPublicationReason("toString"),
    "No explanation is registered for this diagnostic code."
  );
});

test("unknown stored verifier reason code is retained for an unsupported unit", () => {
  const draft = analysis();
  const storedVerification = structuredClone(
    verification(draft)
  ) as unknown as {
    assessments: Array<Record<string, unknown>>;
  };
  const claimAssessment = storedVerification.assessments.find(
    (assessment) => assessment.unitId === "claim-1"
  );
  assert.ok(claimAssessment);
  claimAssessment.reasonCode = "future_verifier_reason";

  const diagnostics = buildAdminPublicationDiagnostics({
    editorialStatus: "review_required",
    analysis: draft,
    verification: storedVerification,
    evidence,
  });
  // D-072: the unknown verifier reason is retained as an advisory for the unit.
  assert.ok(
    diagnostics.advisories.some(
      ({ reasonCode, explanation, unitId }) =>
        reasonCode === "future_verifier_reason" &&
        explanation ===
          "No explanation is registered for this diagnostic code." &&
        unitId === "claim-1"
    )
  );
});

test("archived item always includes the archived suppression reason", () => {
  const diagnostics = buildAdminPublicationDiagnostics({
    editorialStatus: "archived",
    analysis: null,
    verification: null,
    evidence: null,
  });

  assert.equal(diagnostics.published, false);
  assert.ok(
    diagnostics.reasons.some(({ reasonCode }) => reasonCode === "item_archived")
  );
});
