import { z } from "zod";

export const POLICY_ANALYSIS_SCHEMA =
  "policy-intelligence.analysis.v2" as const;
export const POLICY_VERIFICATION_SCHEMA =
  "policy-intelligence.verification.v2" as const;
export const POLICY_ANALYZER_VERSION =
  "policy-intelligence.analyzer.v2.1" as const;
export const POLICY_VERIFIER_VERSION =
  "policy-intelligence.verifier.v2.1" as const;

const localizedText = z
  .object({
    "zh-CN": z.string().trim().min(1).max(4000),
    en: z.string().trim().min(1).max(4000),
  })
  .strict();
const evidenceRefs = z.array(z.string().min(1).max(120)).min(1).max(8);
const claimRefs = z
  .array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/))
  .min(1)
  .max(8);
const stableId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const linkedLocalizedText = z
  .object({
    "zh-CN": z.string().trim().min(1).max(4000),
    en: z.string().trim().min(1).max(4000),
    claimRefs,
    uncertainty: localizedText.nullable(),
  })
  .strict();

export const materialClaimSchema = z
  .object({
    id: stableId,
    kind: z.enum(["source_fact", "practical_interpretation"]),
    decisive: z.boolean(),
    conditional: z.boolean(),
    text: localizedText,
    uncertainty: localizedText.nullable(),
    evidenceRefs,
  })
  .strict();

const narrativeUnitSchema = z
  .object({
    id: stableId,
    kind: z.enum(["source_fact", "practical_interpretation"]),
    text: linkedLocalizedText,
    evidenceRefs,
  })
  .strict();

const publicationEligibilitySchema = z
  .object({
    id: z.literal("policy-relevance"),
    classification: z.enum([
      "policy_relevant",
      "operational_notice",
      "navigation_content",
      "unrelated",
      "uncertain",
    ]),
    evidenceRefs,
  })
  .strict();

export const policyAnalysisSchema = z
  .object({
    schemaVersion: z.literal(POLICY_ANALYSIS_SCHEMA),
    publicationEligibility: publicationEligibilitySchema,
    title: narrativeUnitSchema,
    executiveSummary: narrativeUnitSchema,
    keyChanges: z.array(narrativeUnitSchema).min(1).max(8),
    affectedGroups: z.array(narrativeUnitSchema).min(1).max(8),
    practicalImpacts: z.array(narrativeUnitSchema).min(1).max(8),
    recommendedActions: z.array(narrativeUnitSchema).max(8),
    transitionInfo: narrativeUnitSchema.nullable(),
    uncertainties: z.array(narrativeUnitSchema).max(8),
    relatedSnapshotRefs: z.array(z.string().min(1).max(120)).max(8),
    sourceStatus: z
      .object({
        id: z.literal("source-status"),
        value: z.enum([
          "in_force",
          "announced",
          "proposed",
          "consultation",
          "superseded",
        ]),
        certain: z.boolean(),
        claimRef: stableId,
        evidenceRefs,
      })
      .strict(),
    materialClaims: z.array(materialClaimSchema).min(1).max(16),
    importance: z
      .object({
        affectedPopulation: z.number().int().min(1).max(5),
        legalForce: z.enum([
          "legislation",
          "legislative_instrument",
          "official_guidance",
          "tribunal_process",
          "other",
        ]),
        immediacy: z.number().int().min(1).max(5),
        serviceRelevance: z.number().int().min(1).max(5),
        proceduralImpact: z.number().int().min(1).max(5),
      })
      .strict(),
  })
  .strict();

const assessmentSchema = z
  .object({
    unitId: stableId,
    verdict: z.enum(["supported", "partial", "unsupported"]),
    evidenceRefs: z.array(z.string().min(1).max(120)).max(8),
    reasonCode: z.enum([
      "direct_support",
      "qualified_support",
      "insufficient_support",
      "contradicted",
      "unclear",
    ]),
  })
  .strict();

export const policyVerificationSchema = z
  .object({
    schemaVersion: z.literal(POLICY_VERIFICATION_SCHEMA),
    assessments: z.array(assessmentSchema).min(1).max(64),
  })
  .strict();

export type PolicyAnalysis = z.infer<typeof policyAnalysisSchema>;
export type PolicyVerification = z.infer<typeof policyVerificationSchema>;
export type MaterialClaim = z.infer<typeof materialClaimSchema>;
export type PolicyEvidencePacketItem = {
  evidenceRef: string;
  snapshotId: string;
  sourceConfigId: string;
  sourceId: string;
  authority: string;
  canonicalUrl: string;
  officialTitle: string;
  retrievedAt: string;
  contentHash: string;
  sourceDate: string | null;
  effectiveDate: string | null;
  evidenceTruncated: boolean;
  text: string;
};
export type PolicyPublicationGate = {
  eligible: boolean;
  reasons: string[];
  verification: PolicyVerification;
};

type VerificationUnit = {
  id: string;
  evidenceRefs: readonly string[];
  allowsPartial: boolean;
};

function allNarrativeUnits(analysis: PolicyAnalysis) {
  return [
    analysis.title,
    analysis.executiveSummary,
    ...analysis.keyChanges,
    ...analysis.affectedGroups,
    ...analysis.practicalImpacts,
    ...analysis.recommendedActions,
    ...(analysis.transitionInfo ? [analysis.transitionInfo] : []),
    ...analysis.uncertainties,
  ];
}

function verificationUnits(analysis: PolicyAnalysis): VerificationUnit[] {
  return [
    ...analysis.materialClaims.map((claim) => ({
      id: claim.id,
      evidenceRefs: claim.evidenceRefs,
      allowsPartial:
        claim.kind === "practical_interpretation" && claim.conditional,
    })),
    ...allNarrativeUnits(analysis).map((unit) => ({
      id: unit.id,
      evidenceRefs: unit.evidenceRefs,
      allowsPartial:
        unit.kind === "practical_interpretation" &&
        Boolean(unit.text.uncertainty?.["zh-CN"].trim()) &&
        Boolean(unit.text.uncertainty?.en.trim()),
    })),
    {
      id: analysis.publicationEligibility.id,
      evidenceRefs: analysis.publicationEligibility.evidenceRefs,
      allowsPartial: false,
    },
    {
      id: analysis.sourceStatus.id,
      evidenceRefs: analysis.sourceStatus.evidenceRefs,
      allowsPartial: false,
    },
  ];
}

export function validatePolicyVerification(
  raw: unknown,
  analysisInput: PolicyAnalysis,
  allowedEvidenceRefs: ReadonlySet<string>
): PolicyVerification {
  const analysis = policyAnalysisSchema.parse(analysisInput);
  const verification = policyVerificationSchema.parse(raw);
  const units = verificationUnits(analysis);
  const expected = new Map(units.map((unit) => [unit.id, unit]));
  if (expected.size !== units.length) {
    throw new Error("duplicate_analysis_unit_id");
  }
  const seen = new Set<string>();
  for (const assessment of verification.assessments) {
    const unit = expected.get(assessment.unitId);
    if (!unit || seen.has(assessment.unitId)) {
      throw new Error("invalid_verification_unit_set");
    }
    seen.add(assessment.unitId);
    if (assessment.evidenceRefs.some((ref) => !allowedEvidenceRefs.has(ref))) {
      throw new Error("unknown_verification_evidence_ref");
    }
    if (
      assessment.evidenceRefs.some((ref) => !unit.evidenceRefs.includes(ref))
    ) {
      throw new Error("verification_ref_not_unit_evidence");
    }
    if (
      assessment.verdict !== "unsupported" &&
      !assessment.evidenceRefs.length
    ) {
      throw new Error("supported_unit_without_evidence");
    }
    if (
      assessment.verdict === "supported" &&
      assessment.reasonCode !== "direct_support"
    ) {
      throw new Error("verdict_reason_mismatch");
    }
    if (
      assessment.verdict === "partial" &&
      (assessment.reasonCode !== "qualified_support" || !unit.allowsPartial)
    ) {
      throw new Error("verdict_reason_mismatch");
    }
    if (
      assessment.verdict === "unsupported" &&
      !["insufficient_support", "contradicted", "unclear"].includes(
        assessment.reasonCode
      )
    ) {
      throw new Error("verdict_reason_mismatch");
    }
  }
  if (seen.size !== expected.size) {
    throw new Error("incomplete_verification_unit_set");
  }
  return verification;
}

export function evaluatePublicationGate(input: {
  analysis: PolicyAnalysis;
  verification: PolicyVerification;
  evidence: readonly PolicyEvidencePacketItem[];
  acquisitionComplete: boolean;
}): PolicyPublicationGate {
  const reasons: string[] = [];
  const analysis = policyAnalysisSchema.parse(input.analysis);
  const refs = new Set(input.evidence.map((item) => item.evidenceRef));
  // Evidence truncation is a model-input/resource bound, not a policy
  // relevance or publication veto. The analyzer and verifier assess exactly
  // the bounded evidence packet they receive. Provenance still records
  // evidenceTruncated for auditability.
  if (
    input.evidence.length === 0 ||
    input.evidence.some(
      (item) => !item.canonicalUrl || !item.authority || !item.contentHash
    )
  ) {
    reasons.push("source_identity_incomplete");
  }
  const allRefs = [
    ...verificationUnits(analysis).flatMap((unit) => unit.evidenceRefs),
    ...analysis.sourceStatus.evidenceRefs,
    ...analysis.relatedSnapshotRefs,
  ];
  if (
    allRefs.some(
      (ref) =>
        !refs.has(ref) &&
        !input.evidence.some((item) => item.snapshotId === ref)
    )
  ) {
    reasons.push("unknown_analysis_evidence_ref");
  }
  if (analysis.publicationEligibility.classification !== "policy_relevant") {
    reasons.push("source_not_policy_relevant");
  }
  if (!analysis.sourceStatus.certain) {
    reasons.push("source_status_uncertain");
  }
  if (
    !analysis.materialClaims.some(
      (claim) => claim.id === analysis.sourceStatus.claimRef
    )
  ) {
    reasons.push("unknown_source_status_claim");
  }
  const knownClaimIds = new Set(
    analysis.materialClaims.map((claim) => claim.id)
  );
  if (
    allNarrativeUnits(analysis).some((unit) =>
      unit.text.claimRefs.some((claimRef) => !knownClaimIds.has(claimRef))
    )
  ) {
    reasons.push("unknown_narrative_claim_ref");
  }

  let verification: PolicyVerification;
  let assessments = new Map<
    string,
    PolicyVerification["assessments"][number]
  >();
  try {
    verification = validatePolicyVerification(
      input.verification,
      analysis,
      refs
    );
    assessments = new Map(
      verification.assessments.map((assessment) => [
        assessment.unitId,
        assessment,
      ])
    );
  } catch {
    verification = input.verification;
    reasons.push("verification_invalid");
  }

  const publicationAssessment = assessments.get(
    analysis.publicationEligibility.id
  );
  if (publicationAssessment?.verdict !== "supported") {
    reasons.push("publication_eligibility_not_supported");
  }
  if (assessments.get(analysis.sourceStatus.id)?.verdict !== "supported") {
    reasons.push("source_status_not_fully_supported");
  }
  for (const claim of analysis.materialClaims) {
    const assessment = assessments.get(claim.id);
    if (!assessment) {
      reasons.push("missing_claim_verification");
      continue;
    }
    if (assessment.verdict === "unsupported") {
      reasons.push("unsupported_material_claim");
    }
    if (
      assessment.verdict === "partial" &&
      claim.kind !== "practical_interpretation"
    ) {
      reasons.push("partial_source_fact_claim");
    }
    if (
      assessment.verdict === "partial" &&
      (!claim.conditional ||
        !claim.uncertainty?.["zh-CN"].trim() ||
        !claim.uncertainty.en.trim())
    ) {
      reasons.push("partial_claim_missing_bilingual_uncertainty");
    }
    if (
      assessment.verdict === "supported" &&
      claim.conditional &&
      !claim.uncertainty
    ) {
      reasons.push("conditional_claim_missing_uncertainty");
    }
  }
  for (const unit of allNarrativeUnits(analysis)) {
    const assessment = assessments.get(unit.id);
    if (!assessment) {
      reasons.push("missing_narrative_verification");
      continue;
    }
    if (assessment.verdict === "unsupported") {
      reasons.push("unsupported_narrative_unit");
    }
    if (
      assessment.verdict === "partial" &&
      unit.kind !== "practical_interpretation"
    ) {
      reasons.push("partial_source_fact_narrative");
    }
    if (
      assessment.verdict === "partial" &&
      (!unit.text.uncertainty?.["zh-CN"].trim() ||
        !unit.text.uncertainty.en.trim())
    ) {
      reasons.push("partial_narrative_missing_bilingual_uncertainty");
    }
  }
  return {
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    verification,
  };
}
