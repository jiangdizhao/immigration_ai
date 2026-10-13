import {
  evaluatePolicyPublicationDecision,
  type PolicyEvidencePacketItem,
  type PolicyVerification,
  policyAnalysisSchema,
} from "./contracts";

export type AdminPublicationReason = {
  reasonCode: string;
  explanation: string;
  unitId?: string;
};

export type AdminPublicationDiagnostics = {
  published: boolean;
  /**
   * Structural blockers that withheld the item from the public page. Under
   * D-072 these are source-identity problems only, never AI quality opinions.
   */
  reasons: AdminPublicationReason[];
  /**
   * Non-blocking advisories: AI signals that were recorded for review but did
   * not decide publication (relevance classification, unverified status,
   * withheld prose units, verifier disagreements).
   */
  advisories: AdminPublicationReason[];
};

const PUBLICATION_REASON_EXPLANATIONS: Record<string, string> = {
  analysis_revision_unavailable:
    "No analysis revision is stored for the latest source snapshot.",
  analysis_payload_invalid:
    "The stored analysis could not be read using the current policy schema.",
  analysis_unavailable:
    "The analyzer did not return a usable analysis; the official source was published as a source-first notice.",
  analysis_invalid:
    "The analyzer output did not match the analysis contract; the official source was published as a source-first notice.",
  analysis_evidence_mismatch:
    "The analysis cited evidence outside the retrieved snapshot; the official source was published as a source-first notice.",
  analysis_unusable:
    "Nothing in the analysis could be published honestly; the official source was published as a source-first notice.",
  verification_unavailable:
    "The verifier did not return a usable result; the official source was published as a source-first notice.",
  verification_unusable:
    "The verifier result could not be validated against the analysis; the official source was published as a source-first notice.",
  lawyer_source_publication:
    "An authorized editor published the official source snapshot directly; AI analysis is not part of this publication.",
  analysis_withheld_title_or_summary:
    "The verifier did not support the title or executive summary, so no analysis prose was published.",
  analysis_withheld_required_sections:
    "Too many analysis sections were unsupported to publish an analysis; a source-first notice was published instead.",
  analysis_pruned_to_invalid_document:
    "After withholding unsupported prose the analysis no longer formed a valid document.",
  narrative_lost_all_supported_claims:
    "Every claim this section depended on was withheld, so the section was withheld too.",
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
  publication_eligibility_not_verified:
    "The verifier did not confirm the policy-relevance assessment. This is recorded for review and does not block publication.",
  publication_eligibility_not_supported:
    "The verifier did not confirm the policy-relevance assessment. This is recorded for review and does not block publication.",
  publication_eligibility_policy_relevant:
    "The analyzer classified this source as policy relevant.",
  publication_eligibility_operational_notice:
    "The analyzer classified this source as an operational notice. Recorded for review; it does not block publication.",
  publication_eligibility_navigation_content:
    "The analyzer classified this source as navigation content. Recorded for review; it does not block publication.",
  publication_eligibility_unrelated:
    "The analyzer classified this source as unrelated. Recorded for review; it does not block publication.",
  publication_eligibility_uncertain:
    "The analyzer could not classify this source with confidence. Recorded for review; it does not block publication.",
  source_identity_incomplete:
    "The source snapshot is missing required identity or provenance information.",
  source_status_not_verified:
    "The verifier did not support the stated source status, so it is reported as not yet verified.",
  source_status_not_fully_supported:
    "The verifier did not support the stated source status, so it is reported as not yet verified.",
  source_status_recorded_as_uncertain:
    "The analyzer recorded the source status as uncertain. Recorded for review; it does not block publication.",
  source_status_reported_as_unknown:
    "The published legal-effect status is reported as not yet verified.",
  unsupported_prose_withheld:
    "Unsupported analysis prose was withheld from the published revision.",
  analysis_internal_error:
    "An internal error prevented policy analysis from completing.",
  empty_model_output:
    "The analysis provider returned no usable output; the official source was published as a source-first notice.",
  invalid_analysis_output:
    "The analysis provider returned output that could not be used; the official source was published as a source-first notice.",
  structured_output_error:
    "The analyzer output could not be parsed as structured data; the official source was published as a source-first notice.",
  schema_validation_error:
    "The analyzer output did not match the required schema; the official source was published as a source-first notice.",
  provider_error:
    "The analysis provider could not complete the request; the official source was published as a source-first notice.",
  publication_gate_source_first:
    "The official source was published as a source-first notice while analysis is pending.",
  human_publication_protected:
    "This item is editor-protected: the newer revision was captured and held for review instead of replacing the published human revision.",
  source_status_uncertain:
    "The analysis could not determine the official source status with certainty.",
  provider_timeout:
    "The analysis provider exceeded its configured timeout during source sync.",
  source_not_policy_relevant:
    "The analyzer did not classify this source as policy relevant. Recorded for review; it does not block publication.",
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
  /** Stored revision content kind (`source_first` publishes without analysis). */
  contentKind?: string | null;
  /** Stored revision metadata, which carries the recorded advisories. */
  revisionMetadata?: unknown | null;
}): AdminPublicationDiagnostics {
  const advisories: AdminPublicationReason[] = [];
  const addAdvisory = (
    reasonCode: string,
    details: Pick<AdminPublicationReason, "unitId"> = {}
  ) => {
    advisories.push({
      reasonCode,
      explanation: explainPublicationReason(reasonCode),
      ...details,
    });
  };
  for (const reasonCode of storedAdvisoryCodes(input.revisionMetadata)) {
    addAdvisory(reasonCode);
  }
  const published = input.editorialStatus === "published";
  if (published) {
    return { published: true, reasons: [], advisories };
  }

  const reasons: AdminPublicationReason[] = [];
  const addReason = (
    reasonCode: string,
    details: Pick<AdminPublicationReason, "unitId"> = {}
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
    if (input.contentKind === "source_first") {
      addAdvisory("analysis_pending");
    } else {
      addReason("analysis_revision_unavailable");
    }
  } else if (input.evidence) {
    const parsedAnalysis = policyAnalysisSchema.safeParse(input.analysis);
    if (parsedAnalysis.success) {
      const decision = evaluatePolicyPublicationDecision({
        analysis: parsedAnalysis.data,
        verification: input.verification as PolicyVerification,
        evidence: [input.evidence],
      });
      // Blockers are structural source problems; everything else is advisory.
      for (const reasonCode of decision.blockers) {
        addReason(reasonCode);
      }
      for (const reasonCode of decision.advisories) {
        addAdvisory(reasonCode);
      }
      for (const withheld of decision.withheld) {
        addAdvisory(withheld.reasonCode, { unitId: withheld.unitId });
      }
      for (const reason of unsupportedVerifierReasons(input.verification)) {
        addAdvisory(reason.reasonCode, { unitId: reason.unitId });
      }
    } else {
      addReason("analysis_payload_invalid");
    }
  } else {
    addReason("snapshot_evidence_unavailable");
  }

  return { published: false, reasons, advisories };
}

/** Reads the bounded stored advisory codes from revision metadata. */
export function storedAdvisoryCodes(metadata: unknown): string[] {
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    !("advisories" in metadata) ||
    !Array.isArray(metadata.advisories)
  ) {
    return [];
  }
  return metadata.advisories
    .filter(
      (code): code is string =>
        typeof code === "string" &&
        code.length > 0 &&
        code.length <= 100 &&
        /^[a-z0-9_]+$/.test(code)
    )
    .slice(0, 40);
}

/** Deterministic, bounded advisory histogram for the admin projection. */
export function advisoryReasonCounts(
  warnings: readonly { reasonCode: string }[] | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const warning of warnings ?? []) {
    counts[warning.reasonCode] = (counts[warning.reasonCode] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, 30)
  );
}

export type AdminSourceSyncDiagnostic = {
  status: "failed" | "partial";
  errorCode: string;
  explanation: string;
};

/**
 * Phase 12 Stage 3 D-072 — operator-facing publication metrics. They separate
 * successful automatic releases (full analysis and source-first fallback) from
 * genuine technical holds, and they surface advisory warnings without counting
 * them as failures.
 */
export type AdminSourceSyncPublicationMetrics = {
  publishedCount: number;
  fullAnalysisPublishedCount: number;
  sourceFirstPublishedCount: number;
  heldCount: number;
  failureCount: number;
  advisoryCount: number;
  advisoryReasons: Array<{ reasonCode: string; count: number }>;
};

export function buildAdminSourceSyncPublicationMetrics(input: {
  publishedCount: number;
  heldCount: number;
  failureCount: number;
  metadata: unknown;
}): AdminSourceSyncPublicationMetrics {
  const metadata =
    typeof input.metadata === "object" && input.metadata !== null
      ? (input.metadata as Record<string, unknown>)
      : {};
  const sourceFirstPublishedCount =
    typeof metadata.sourceFirstPublishedCount === "number" &&
    Number.isInteger(metadata.sourceFirstPublishedCount) &&
    metadata.sourceFirstPublishedCount >= 0
      ? metadata.sourceFirstPublishedCount
      : 0;
  const advisoryReasons =
    typeof metadata.advisoryReasons === "object" &&
    metadata.advisoryReasons !== null
      ? Object.entries(metadata.advisoryReasons as Record<string, unknown>)
          .filter(
            ([reasonCode, count]) =>
              /^[a-z0-9_]{1,100}$/.test(reasonCode) &&
              typeof count === "number" &&
              Number.isInteger(count) &&
              count > 0
          )
          .map(([reasonCode, count]) => ({
            reasonCode,
            count: count as number,
          }))
          .sort((left, right) =>
            left.reasonCode.localeCompare(right.reasonCode)
          )
          .slice(0, 20)
      : [];
  return {
    publishedCount: input.publishedCount,
    fullAnalysisPublishedCount: Math.max(
      0,
      input.publishedCount - sourceFirstPublishedCount
    ),
    sourceFirstPublishedCount,
    heldCount: input.heldCount,
    failureCount: input.failureCount,
    advisoryCount: advisoryReasons.reduce(
      (total, entry) => total + entry.count,
      0
    ),
    advisoryReasons,
  };
}

export function buildAdminSourceSyncDiagnostic(
  input:
    | {
        status: string;
        safeErrorCode: string | null;
      }
    | null
    | undefined
): AdminSourceSyncDiagnostic | null {
  if (
    !input ||
    (input.status !== "failed" && input.status !== "partial") ||
    !input.safeErrorCode ||
    !/^[a-z0-9_]{1,80}$/.test(input.safeErrorCode)
  ) {
    return null;
  }
  return {
    status: input.status,
    errorCode: input.safeErrorCode,
    explanation: explainPublicationReason(input.safeErrorCode),
  };
}
