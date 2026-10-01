import {
  evaluatePublicationGate,
  policyAnalysisSchema,
  type PolicyEvidencePacketItem,
  type PolicyVerification,
} from "./contracts";

export type AdminPublicationReason = {
  reasonCode: string;
  explanation: string;
  scope?: "item" | "source_sync";
  unitId?: string;
};

export type AdminPublicationDiagnostics = {
  published: boolean;
  reasons: AdminPublicationReason[];
};

const PUBLICATION_REASON_EXPLANATIONS: Record<string, string> = {
  analysis_revision_unavailable:
    "No analysis revision is stored for the latest source snapshot.",
  analysis_payload_invalid:
    "The stored analysis could not be read using the current policy schema.",
  conditional_claim_missing_uncertainty:
    "A conditional claim is missing its required uncertainty statement.",
  item_archived:
    "This item was archived by an administrator and is suppressed from publication.",
  missing_claim_verification:
    "A material claim has no corresponding verifier assessment.",
  missing_narrative_verification:
    "A narrative section has no corresponding verifier assessment.",
  partial_claim_missing_bilingual_uncertainty:
    "A partially supported claim lacks the required uncertainty in both languages.",
  partial_narrative_missing_bilingual_uncertainty:
    "A partially supported narrative lacks the required uncertainty in both languages.",
  partial_source_fact_claim:
    "A source fact was only partially supported; source facts require full support.",
  partial_source_fact_narrative:
    "A source fact narrative was only partially supported.",
  publication_eligibility_not_supported:
    "The policy relevance assessment was not fully supported by the verifier.",
  source_identity_incomplete:
    "The source snapshot is missing required identity or provenance information.",
  source_status_not_fully_supported:
    "The verifier did not fully support the source status assessment.",
  source_status_uncertain:
    "The analysis could not determine the official source status with certainty.",
  source_sync_failed:
    "The most recent sync for this source recorded a failure.",
  source_not_policy_relevant:
    "The analysis did not classify this source as policy relevant.",
  unsupported_material_claim:
    "A material claim lacks sufficient evidence support.",
  unsupported_narrative_unit:
    "A displayed narrative section lacks sufficient evidence support.",
  unknown_analysis_evidence_ref:
    "The analysis refers to evidence that is not present in the stored source snapshot.",
  unknown_narrative_claim_ref:
    "A narrative section refers to a material claim that is not present in the analysis.",
  unknown_source_status_claim:
    "The source status refers to a material claim that is not present in the analysis.",
  verification_invalid:
    "The stored verifier result is incomplete or does not match the analysis.",
  snapshot_evidence_unavailable:
    "The latest analysis revision has no matching stored source snapshot.",
  insufficient_support:
    "The verifier found insufficient support for this analysis unit.",
  contradicted:
    "The verifier found evidence that contradicts this analysis unit.",
  unclear:
    "The verifier could not determine whether this analysis unit is supported.",
};

export function explainPublicationReason(reasonCode: string): string {
  return Object.hasOwn(PUBLICATION_REASON_EXPLANATIONS, reasonCode)
    ? PUBLICATION_REASON_EXPLANATIONS[reasonCode]
    : "No explanation is registered for this diagnostic code.";
}

function unsupportedVerifierReasons(verification: unknown) {
  if (
    typeof verification !== "object" ||
    verification === null ||
    !("assessments" in verification) ||
    !Array.isArray(verification.assessments)
  ) {
    return [];
  }

  return verification.assessments.flatMap((assessment) => {
    if (
      typeof assessment !== "object" ||
      assessment === null ||
      !("verdict" in assessment) ||
      assessment.verdict !== "unsupported" ||
      !("reasonCode" in assessment) ||
      typeof assessment.reasonCode !== "string" ||
      assessment.reasonCode.length === 0 ||
      assessment.reasonCode.length > 100
    ) {
      return [];
    }
    return [
      {
        reasonCode: assessment.reasonCode,
        unitId:
          "unitId" in assessment &&
          typeof assessment.unitId === "string" &&
          assessment.unitId.length <= 100
            ? assessment.unitId
            : undefined,
      },
    ];
  });
}

export function buildAdminPublicationDiagnostics(input: {
  editorialStatus: string;
  analysis: unknown | null;
  verification: unknown | null;
  evidence: PolicyEvidencePacketItem | null;
  latestSourceRun?: {
    status: string;
    safeErrorCode: string | null;
  } | null;
}): AdminPublicationDiagnostics {
  const published = input.editorialStatus === "published";
  if (published) {
    return { published: true, reasons: [] };
  }

  const reasons: AdminPublicationReason[] = [];
  const addReason = (
    reasonCode: string,
    details: Pick<AdminPublicationReason, "scope" | "unitId"> = {}
  ) => {
    reasons.push({
      reasonCode,
      explanation: explainPublicationReason(reasonCode),
      ...details,
    });
  };

  if (input.editorialStatus === "archived") {
    addReason("item_archived");
  }

  if (input.analysis === null) {
    addReason("analysis_revision_unavailable");
  } else if (!input.evidence) {
    addReason("snapshot_evidence_unavailable");
  } else {
    const parsedAnalysis = policyAnalysisSchema.safeParse(input.analysis);
    if (!parsedAnalysis.success) {
      addReason("analysis_payload_invalid");
    } else {
      const gate = evaluatePublicationGate({
        analysis: parsedAnalysis.data,
        verification: input.verification as PolicyVerification,
        evidence: [input.evidence],
        acquisitionComplete: !input.evidence.evidenceTruncated,
      });
      for (const reasonCode of gate.reasons) {
        addReason(reasonCode);
      }

      for (const reason of unsupportedVerifierReasons(input.verification)) {
        addReason(reason.reasonCode, { unitId: reason.unitId });
      }
    }
  }

  if (
    input.latestSourceRun &&
    ["failed", "partial"].includes(input.latestSourceRun.status) &&
    input.latestSourceRun.safeErrorCode
  ) {
    addReason(input.latestSourceRun.safeErrorCode, { scope: "source_sync" });
  }

  return { published: false, reasons };
}
