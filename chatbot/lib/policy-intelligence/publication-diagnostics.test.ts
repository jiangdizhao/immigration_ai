import assert from "node:assert/strict";
import test from "node:test";
import {
  POLICY_ANALYSIS_SCHEMA,
  POLICY_VERIFICATION_SCHEMA,
  policyAnalysisSchema,
} from "./contracts";
import {
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
    { published: true, reasons: [] }
  );
});

test("unpublished item returns all gate and verifier reason codes", () => {
  const draft = analysis();
  const diagnostics = buildAdminPublicationDiagnostics({
    editorialStatus: "review_required",
    analysis: draft,
    verification: verification(draft),
    evidence,
  });

  assert.equal(diagnostics.published, false);
  assert.deepEqual(
    diagnostics.reasons
      .filter((reason) => !reason.unitId)
      .map((reason) => reason.reasonCode),
    [
      "source_status_uncertain",
      "publication_eligibility_not_supported",
      "unsupported_material_claim",
    ]
  );
  assert.ok(
    diagnostics.reasons.some(
      (reason) =>
        reason.reasonCode === "insufficient_support" &&
        reason.unitId === "claim-1" &&
        reason.explanation.length > 0
    )
  );
});

test("unknown reason code is retained and receives a safe fallback explanation", () => {
  const diagnostics = buildAdminPublicationDiagnostics({
    editorialStatus: "draft",
    analysis: null,
    verification: null,
    evidence: null,
    latestSourceRun: {
      status: "failed",
      safeErrorCode: "new_pipeline_reason_42",
    },
  });

  assert.ok(
    diagnostics.reasons.some(
      ({ reasonCode, explanation, scope }) =>
        reasonCode === "new_pipeline_reason_42" &&
        explanation ===
          "No explanation is registered for this diagnostic code." &&
        scope === "source_sync"
    )
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
  assert.ok(
    diagnostics.reasons.some(
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
