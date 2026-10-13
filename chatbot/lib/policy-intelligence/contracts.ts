import { z } from "zod";

export const POLICY_ANALYSIS_SCHEMA =
  "policy-intelligence.analysis.v2" as const;
export const POLICY_VERIFICATION_SCHEMA =
  "policy-intelligence.verification.v2" as const;
/**
 * Phase 12 Stage 3 D-072 — analyzer/verifier prompt and contract revision.
 *
 * v2.3 removes the subjective AI publication veto: relevance classification,
 * source-status certainty and verifier disagreement are advisory annotations
 * that can qualify or withhold individual prose units, but they never decide
 * whether an authentic official source update is published. The version bump
 * intentionally invalidates stored analysis fingerprints so previously gated
 * snapshots are re-analyzed under the corrected contract.
 */
export const POLICY_ANALYZER_VERSION =
  "policy-intelligence.analyzer.v2.3" as const;
export const POLICY_VERIFIER_VERSION =
  "policy-intelligence.verifier.v2.3" as const;
/**
 * Phase 12 Stage 3 D-072 — the source-first publication contract. A published
 * source-first revision carries no fabricated analysis: it is the authentic
 * official source identity, title, dates, a bounded official excerpt and an
 * explicit "AI analysis pending" state.
 */
export const POLICY_SOURCE_FIRST_SCHEMA =
  "policy-intelligence.source-first.v1" as const;

/**
 * Status vocabulary shared by stored items, stored revisions and the analysis
 * contract. `enacted_not_commenced` and `withdrawn` were added in Phase 12
 * Stage 3 so official material can be described truthfully instead of being
 * forced into an inaccurate value.
 *
 * Phase 12 Stage 3 D-072: `unknown` is the honest value when the platform
 * cannot establish legal effect (for example a source-first publication, or a
 * status the verifier could not support). It never asserts legal force.
 */
export const POLICY_SOURCE_STATUS_VALUES = [
  "in_force",
  "published_guidance",
  "announced",
  "proposed",
  "consultation",
  "enacted_not_commenced",
  "superseded",
  "withdrawn",
  "unknown",
] as const;
/**
 * Phase 12 Stage 3 — human editorial content contract version. Human revisions
 * are validated against this schema and never fabricated into AI metadata.
 */
export const POLICY_HUMAN_REVISION_SCHEMA =
  "policy-intelligence.human-revision.v1" as const;

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
        value: z.enum(POLICY_SOURCE_STATUS_VALUES),
        certain: z.boolean(),
        /**
         * D-072: a concrete status must cite the material claim that supports
         * it; `unknown` is the honest value when no status could be
         * established and therefore needs no supporting claim.
         */
        claimRef: stableId.nullable(),
        evidenceRefs,
      })
      .strict()
      .superRefine((status, context) => {
        if (status.value !== "unknown" && status.claimRef === null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["claimRef"],
            message: "concrete_source_status_requires_claim_ref",
          });
        }
        if (status.value === "unknown" && status.certain) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["certain"],
            message: "unknown_source_status_must_not_be_certain",
          });
        }
      }),
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

const humanLocalizedText = z
  .object({
    "zh-CN": z.string().trim().min(1).max(8000),
    en: z.string().trim().min(1).max(8000),
  })
  .strict();

/**
 * Phase 12 Stage 3 R1 — an author-stated ISO calendar date (YYYY-MM-DD).
 *
 * The platform stores exactly what the author stated and never infers,
 * normalizes or "corrects" a legal date. `null` means the author did not state
 * one (for example a proposed or consultation policy has no established
 * commencement date yet). These fields are deliberately distinct from
 * platform-observed official snapshot dates.
 */
const humanDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "human_date_must_be_iso_yyyy_mm_dd")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const probe = new Date(Date.UTC(year, month - 1, day));
    return (
      probe.getUTCFullYear() === year &&
      probe.getUTCMonth() === month - 1 &&
      probe.getUTCDate() === day
    );
  }, "human_date_must_be_a_real_calendar_date")
  .nullable()
  .default(null);

/**
 * Deterministic guard: a lawyer-entered public byline is an author-declared
 * label (firm, team, practitioner) and must never impersonate an official
 * government authority or regulator. The authenticated author identity is
 * stored server-side separately and is not affected by this label.
 */
const OFFICIAL_AUTHORITY_IMPERSONATION_PATTERNS: RegExp[] = [
  /department\s+of\s+home\s+affairs/iu,
  /\bhome\s+affairs\b/iu,
  /\bminister\s+for\b/iu,
  /\bcommonwealth\s+of\s+australia\b/iu,
  /\baustralian\s+government\b/iu,
  /\bgovernment\s+of\s+australia\b/iu,
  /\bdept\.?\s+of\s+immigration\b/iu,
  /\bimmigration\s+department\b/iu,
  /\bmigration\s+agents\s+registration\s+authority\b/iu,
  /\badministrative\s+appeals\s+tribunal\b/iu,
  /\bimmigration\s+assessment\s+authority\b/iu,
  /内政部/u,
  /移民局/u,
  /移民部/u,
  /澳洲政府/u,
  /澳大利亚政府/u,
  /移民与公民/u,
];

export function attributionImpersonatesOfficialAuthority(
  attribution: string
): boolean {
  return OFFICIAL_AUTHORITY_IMPERSONATION_PATTERNS.some((pattern) =>
    pattern.test(attribution)
  );
}

export const policyHumanNarrativeSchema = z
  .object({
    id: stableId,
    text: humanLocalizedText,
  })
  .strict();

/**
 * A genuine official-source reference supplied by the author. The URL must be
 * HTTPS and credential-free. Nothing here is verified by the platform; it is
 * the author's asserted reference and is displayed as such.
 */
export const policyHumanSourceReferenceSchema = z
  .object({
    authority: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(300),
    url: z
      .string()
      .trim()
      .max(500)
      .refine((value) => {
        try {
          const parsed = new URL(value);
          return (
            parsed.protocol === "https:" && !parsed.username && !parsed.password
          );
        } catch {
          return false;
        }
      }, "official_source_reference_must_be_https"),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    citation: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();

const humanNarrativeList = z.array(policyHumanNarrativeSchema).max(8);

/**
 * Phase 12 Stage 3 — validated durable content of a human-authored or
 * lawyer-overridden revision.
 *
 * The author is accountable for every claim here; the platform stores it
 * verbatim and never upgrades it into AI-verified or "verified law" status.
 * `sourceReferences` may be empty: an authorized Policy Editor may publish
 * transparently attributed professional commentary without an official source.
 */
export const policyHumanRevisionContentSchema = z
  .object({
    schemaVersion: z.literal(POLICY_HUMAN_REVISION_SCHEMA),
    title: humanLocalizedText,
    overview: humanLocalizedText,
    keyChanges: humanNarrativeList,
    affectedGroups: humanNarrativeList,
    implications: humanNarrativeList,
    recommendedActions: humanNarrativeList,
    body: humanLocalizedText.nullable(),
    commentary: humanLocalizedText.nullable(),
    /** Public attribution label for the responsible human author/editor. */
    attribution: z.string().trim().min(2).max(160),
    /** The author's stated legal/source status; the platform does not verify it. */
    sourceStatus: z.enum(POLICY_SOURCE_STATUS_VALUES),
    sourceReferences: z.array(policyHumanSourceReferenceSchema).max(8),
    /**
     * Author-stated date of the official source material this assessment rests
     * on. Distinct from each `sourceReferences[].date` (per-reference official
     * date) and from platform-observed snapshot dates.
     */
    officialSourceDate: humanDate,
    /**
     * Author-stated established commencement/effective date. `null` when no
     * commencement date is established (proposed, consultation, announced) —
     * the platform never infers a commencement date.
     */
    commencementDate: humanDate,
    /** Date as of which the author reviewed the law ("law reviewed as of"). */
    reviewedAsOfDate: humanDate,
  })
  .strict()
  .superRefine((content, context) => {
    if (attributionImpersonatesOfficialAuthority(content.attribution)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["attribution"],
        message: "attribution_must_not_impersonate_official_authority",
      });
    }
    const seen = new Set<string>();
    const sections = [
      content.keyChanges,
      content.affectedGroups,
      content.implications,
      content.recommendedActions,
    ];
    for (const section of sections) {
      for (const unit of section) {
        if (seen.has(unit.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate_human_narrative_id:${unit.id}`,
          });
        }
        seen.add(unit.id);
      }
    }
  });

export type PolicyHumanRevisionContent = z.infer<
  typeof policyHumanRevisionContentSchema
>;
export type PolicyHumanSourceReference = z.infer<
  typeof policyHumanSourceReferenceSchema
>;
export type PolicyHumanNarrative = z.infer<typeof policyHumanNarrativeSchema>;

/** The stored revision origins, including the D-072 source-first notice. */
export const POLICY_REVISION_CONTENT_KINDS = [
  "ai_analysis",
  "lawyer_override",
  "lawyer_authored",
  "source_first",
] as const;
export type PolicyRevisionContentKind =
  (typeof POLICY_REVISION_CONTENT_KINDS)[number];
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
/**
 * Phase 12 Stage 3 D-072 — why an authentic source update was published as a
 * source-first notice instead of a full AI analysis.
 */
export type PolicySourceFirstReason =
  | "analysis_unavailable"
  | "analysis_invalid"
  | "analysis_evidence_mismatch"
  | "analysis_unusable"
  | "verification_unavailable"
  | "verification_unusable"
  /**
   * Phase 12 Stage 3 — an authorized editor deliberately published the official
   * source snapshot without waiting for AI analysis (lawyer-final authority).
   */
  | "lawyer_source_publication";

export type PolicyWithheldUnit = {
  unitId: string;
  reasonCode: string;
};

export type PolicyAnalysisPruningResult = {
  /** Publishable analysis, or null when nothing honest can be displayed. */
  analysis: PolicyAnalysis | null;
  advisories: string[];
  withheld: PolicyWithheldUnit[];
  /** True when the published status had to be reported as `unknown`. */
  statusDowngraded: boolean;
};

type PolicyPublicationDecisionBase = {
  /** Non-blocking advisory signals recorded for the operator and lawyer. */
  advisories: string[];
  /** Analysis units withheld from the published analysis, with reason codes. */
  withheld: PolicyWithheldUnit[];
};

/**
 * Phase 12 Stage 3 D-072 — the publication decision.
 *
 * Structural source identity is the only blocking condition. AI relevance
 * classification, source-status certainty, verifier disagreement and partial
 * interpretations are *advisory*: they may withhold individual prose units or
 * downgrade an unverifiable status to `unknown`, but they never decide whether
 * an authentic, readable official source update is published.
 */
export type PolicyPublicationDecision =
  | (PolicyPublicationDecisionBase & {
      mode: "blocked";
      /** Structural blockers (source identity only). */
      blockers: string[];
      analysis: null;
      verification: null;
      sourceFirstReason: null;
    })
  | (PolicyPublicationDecisionBase & {
      mode: "source_first";
      blockers: [];
      analysis: null;
      verification: null;
      sourceFirstReason: PolicySourceFirstReason;
    })
  | (PolicyPublicationDecisionBase & {
      mode: "full_analysis";
      blockers: [];
      analysis: PolicyAnalysis;
      verification: PolicyVerification;
      sourceFirstReason: null;
    });

type VerifierVerdict = PolicyVerification["assessments"][number]["verdict"];

function hasBilingualUncertainty(
  uncertainty: { "zh-CN": string; en: string } | null | undefined
): boolean {
  return Boolean(uncertainty?.["zh-CN"].trim() && uncertainty?.en.trim());
}

function verdictForUnit(
  assessments: ReadonlyMap<string, { verdict: VerifierVerdict }>,
  unitId: string
): VerifierVerdict {
  // A missing assessment can only happen if a caller bypassed
  // `validatePolicyVerification`; fail closed by treating the unit as
  // unsupported instead of publishing unverified prose.
  return assessments.get(unitId)?.verdict ?? "unsupported";
}

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
    // reasonCode is redundant metadata derived from the verifier verdict.
    // Normalize inconsistent pairs instead of failing the entire policy item.
    // A structurally disallowed partial verdict still fails closed by being
    // downgraded to unsupported.
    if (assessment.verdict === "supported") {
      assessment.reasonCode = "direct_support";
    } else if (assessment.verdict === "partial") {
      if (unit.allowsPartial) {
        assessment.reasonCode = "qualified_support";
      } else {
        assessment.verdict = "unsupported";
        assessment.reasonCode = "unclear";
      }
    } else if (
      !["insufficient_support", "contradicted", "unclear"].includes(
        assessment.reasonCode
      )
    ) {
      assessment.reasonCode = "unclear";
    }
  }
  if (seen.size !== expected.size) {
    throw new Error("incomplete_verification_unit_set");
  }
  return verification;
}

/**
 * Deterministic, non-generative pruning of an analysis for publication.
 *
 * Rules (no thresholds, no keyword lists, no subjectivity):
 * - material claims and narrative units the verifier found `unsupported` are
 *   omitted;
 * - `partial` units are kept only when they are conditional interpretations
 *   that carry bilingual uncertainty, otherwise they are omitted;
 * - a unit whose supported claims were all withheld cannot be published as a
 *   linked narrative and is omitted as well;
 * - a status the verifier did not support is reported honestly as `unknown`.
 *
 * The pruned analysis is re-validated against the strict analysis schema; when
 * it cannot be represented honestly (title/summary withheld, required sections
 * emptied) the caller publishes source-first instead of inventing content.
 */
export function pruneUnpublishableAnalysis(input: {
  analysis: PolicyAnalysis;
  assessments: ReadonlyMap<string, { verdict: VerifierVerdict }>;
}): PolicyAnalysisPruningResult {
  const analysis = input.analysis;
  const advisories = new Set<string>();
  const withheld: PolicyWithheldUnit[] = [];

  const keptClaims = analysis.materialClaims.filter((claim) => {
    const verdict = verdictForUnit(input.assessments, claim.id);
    if (verdict === "supported") {
      return true;
    }
    if (
      verdict === "partial" &&
      claim.kind === "practical_interpretation" &&
      claim.conditional &&
      hasBilingualUncertainty(claim.uncertainty)
    ) {
      return true;
    }
    withheld.push({
      unitId: claim.id,
      reasonCode:
        verdict === "partial"
          ? claim.kind === "practical_interpretation"
            ? "partial_claim_missing_bilingual_uncertainty"
            : "partial_source_fact_claim"
          : "unsupported_material_claim",
    });
    return false;
  });
  const keptClaimIds = new Set(keptClaims.map((claim) => claim.id));

  const pruneLinkedUnit = <
    T extends {
      id: string;
      kind: "source_fact" | "practical_interpretation";
      text: {
        claimRefs: string[];
        uncertainty: { "zh-CN": string; en: string } | null;
      };
    },
  >(
    unit: T
  ): T | null => {
    const verdict = verdictForUnit(input.assessments, unit.id);
    const qualifiedInterpretation =
      unit.kind === "practical_interpretation" &&
      hasBilingualUncertainty(unit.text.uncertainty);
    if (verdict === "partial" && !qualifiedInterpretation) {
      withheld.push({
        unitId: unit.id,
        reasonCode:
          unit.kind === "practical_interpretation"
            ? "partial_narrative_missing_bilingual_uncertainty"
            : "partial_source_fact_narrative",
      });
      return null;
    }
    if (verdict === "unsupported") {
      withheld.push({
        unitId: unit.id,
        reasonCode: "unsupported_narrative_unit",
      });
      return null;
    }
    const claimRefs = unit.text.claimRefs.filter((ref) =>
      keptClaimIds.has(ref)
    );
    if (claimRefs.length === 0) {
      withheld.push({
        unitId: unit.id,
        reasonCode: "narrative_lost_all_supported_claims",
      });
      return null;
    }
    return { ...unit, text: { ...unit.text, claimRefs } };
  };

  const title = pruneLinkedUnit(analysis.title);
  const executiveSummary = pruneLinkedUnit(analysis.executiveSummary);
  if (!title || !executiveSummary) {
    advisories.add("analysis_withheld_title_or_summary");
    return {
      analysis: null,
      advisories: [...advisories],
      withheld,
      statusDowngraded: false,
    };
  }
  const keyChanges = analysis.keyChanges
    .map((unit) => pruneLinkedUnit(unit))
    .filter(
      (unit): unit is (typeof analysis.keyChanges)[number] => unit !== null
    );
  const affectedGroups = analysis.affectedGroups
    .map((unit) => pruneLinkedUnit(unit))
    .filter(
      (unit): unit is (typeof analysis.affectedGroups)[number] => unit !== null
    );
  const practicalImpacts = analysis.practicalImpacts
    .map((unit) => pruneLinkedUnit(unit))
    .filter(
      (unit): unit is (typeof analysis.practicalImpacts)[number] =>
        unit !== null
    );
  const recommendedActions = analysis.recommendedActions
    .map((unit) => pruneLinkedUnit(unit))
    .filter(
      (unit): unit is (typeof analysis.recommendedActions)[number] =>
        unit !== null
    );
  const transitionInfo = analysis.transitionInfo
    ? pruneLinkedUnit(analysis.transitionInfo)
    : null;
  const uncertainties = analysis.uncertainties
    .map((unit) => pruneLinkedUnit(unit))
    .filter(
      (unit): unit is (typeof analysis.uncertainties)[number] => unit !== null
    );

  // The published analysis contract requires at least one entry in these
  // sections; a pruned analysis that cannot satisfy that is published
  // source-first instead of being padded with invented content.
  if (
    keyChanges.length === 0 ||
    affectedGroups.length === 0 ||
    practicalImpacts.length === 0
  ) {
    advisories.add("analysis_withheld_required_sections");
    return {
      analysis: null,
      advisories: [...advisories],
      withheld,
      statusDowngraded: false,
    };
  }

  const statusVerdict = verdictForUnit(
    input.assessments,
    analysis.sourceStatus.id
  );
  const statusClaimKept =
    analysis.sourceStatus.claimRef !== null &&
    keptClaimIds.has(analysis.sourceStatus.claimRef);
  const statusDowngraded =
    analysis.sourceStatus.value === "unknown"
      ? false
      : // D-072: legal effect is only published as stated when the analyzer was
        // certain AND the verifier supported the exact status. Otherwise the
        // honest reported status is `unknown`.
        !analysis.sourceStatus.certain ||
        statusVerdict !== "supported" ||
        !statusClaimKept;
  const sourceStatus = statusDowngraded
    ? {
        ...analysis.sourceStatus,
        value: "unknown" as const,
        certain: false,
        claimRef: null,
      }
    : analysis.sourceStatus;

  const candidate: PolicyAnalysis = {
    ...analysis,
    title,
    executiveSummary,
    keyChanges,
    affectedGroups,
    practicalImpacts,
    recommendedActions,
    transitionInfo,
    uncertainties,
    sourceStatus,
  };
  const parsed = policyAnalysisSchema.safeParse(candidate);
  if (!parsed.success) {
    advisories.add("analysis_pruned_to_invalid_document");
    return {
      analysis: null,
      advisories: [...advisories],
      withheld,
      statusDowngraded,
    };
  }
  if (statusDowngraded) {
    advisories.add("source_status_reported_as_unknown");
  }
  if (withheld.length) {
    advisories.add("unsupported_prose_withheld");
  }
  return {
    analysis: parsed.data,
    advisories: [...advisories],
    withheld,
    statusDowngraded,
  };
}

export function evaluatePolicyPublicationDecision(input: {
  analysis: PolicyAnalysis;
  verification: PolicyVerification;
  evidence: readonly PolicyEvidencePacketItem[];
}): PolicyPublicationDecision {
  const advisories = new Set<string>();
  const analysis = policyAnalysisSchema.parse(input.analysis);

  const blocked = (blocker: string): PolicyPublicationDecision => ({
    mode: "blocked",
    blockers: [blocker],
    advisories: [...advisories],
    withheld: [],
    analysis: null,
    verification: null,
    sourceFirstReason: null,
  });
  const sourceFirst = (
    reason: PolicySourceFirstReason,
    withheld: PolicyWithheldUnit[] = []
  ): PolicyPublicationDecision => ({
    mode: "source_first",
    blockers: [],
    advisories: [...advisories],
    withheld,
    analysis: null,
    verification: null,
    sourceFirstReason: reason,
  });

  // The only blocking condition: which official source this content came from
  // cannot be established, so publishing anything would be fabrication.
  if (
    input.evidence.length === 0 ||
    input.evidence.some(
      (item) => !item.canonicalUrl || !item.authority || !item.contentHash
    )
  ) {
    return blocked("source_identity_incomplete");
  }

  // Relevance and status certainty are advisory metadata. They are recorded
  // and may attract review attention, but they never veto publication.
  if (analysis.publicationEligibility.classification !== "policy_relevant") {
    advisories.add(
      `publication_eligibility_${analysis.publicationEligibility.classification}`
    );
  }
  if (!analysis.sourceStatus.certain) {
    advisories.add("source_status_recorded_as_uncertain");
  }

  const refs = new Set(input.evidence.map((item) => item.evidenceRef));
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
    // The analysis cites evidence we did not retrieve: its prose cannot be
    // trusted, but the authentic source update itself is still publishable.
    advisories.add("unknown_analysis_evidence_ref");
    return sourceFirst("analysis_evidence_mismatch");
  }

  let verification: PolicyVerification;
  let assessments = new Map<string, { verdict: VerifierVerdict }>();
  try {
    verification = validatePolicyVerification(
      input.verification,
      analysis,
      refs
    );
    assessments = new Map(
      verification.assessments.map((assessment) => [
        assessment.unitId,
        { verdict: assessment.verdict },
      ])
    );
  } catch {
    advisories.add("verification_invalid");
    return sourceFirst("verification_unusable");
  }

  if (
    assessments.get(analysis.publicationEligibility.id)?.verdict !== "supported"
  ) {
    advisories.add("publication_eligibility_not_verified");
  }
  if (assessments.get(analysis.sourceStatus.id)?.verdict !== "supported") {
    advisories.add("source_status_not_verified");
  }

  // Internally inconsistent analysis documents cannot be published as
  // analysis, but they do not suppress the authenticated source.
  if (
    analysis.sourceStatus.claimRef !== null &&
    !analysis.materialClaims.some(
      (claim) => claim.id === analysis.sourceStatus.claimRef
    )
  ) {
    advisories.add("unknown_source_status_claim");
    return sourceFirst("analysis_unusable");
  }
  const knownClaimIds = new Set(
    analysis.materialClaims.map((claim) => claim.id)
  );
  if (
    allNarrativeUnits(analysis).some((unit) =>
      unit.text.claimRefs.some((claimRef) => !knownClaimIds.has(claimRef))
    )
  ) {
    advisories.add("unknown_narrative_claim_ref");
    return sourceFirst("analysis_unusable");
  }

  const pruned = pruneUnpublishableAnalysis({ analysis, assessments });
  for (const advisory of pruned.advisories) {
    advisories.add(advisory);
  }
  if (!pruned.analysis) {
    return sourceFirst("analysis_unusable", pruned.withheld);
  }
  return {
    mode: "full_analysis",
    blockers: [],
    advisories: [...advisories],
    withheld: pruned.withheld,
    analysis: pruned.analysis,
    verification,
    sourceFirstReason: null,
  };
}

/**
 * Honest source status for a source-first publication.
 *
 * A source-first notice never asserts legal force: unless the acquisition
 * recorded an explicit, allowlisted declared status the published status is
 * `unknown`, which the public UI renders as "not yet verified".
 */
export function deriveSourceFirstSourceStatus(input: {
  declaredSourceStatus?: unknown;
}): (typeof POLICY_SOURCE_STATUS_VALUES)[number] {
  const declared = input.declaredSourceStatus;
  if (
    typeof declared === "string" &&
    (POLICY_SOURCE_STATUS_VALUES as readonly string[]).includes(declared) &&
    declared !== "unknown"
  ) {
    return declared as (typeof POLICY_SOURCE_STATUS_VALUES)[number];
  }
  return "unknown";
}

/**
 * Reads the optional, explicit `declaredSourceStatus` recorded by an
 * acquisition. Only the allowlisted status vocabulary is accepted; anything
 * else (including a tampered or unknown value) resolves to `unknown`.
 */
export function declaredSourceStatusFromMetadata(
  sourceMetadata: unknown
): (typeof POLICY_SOURCE_STATUS_VALUES)[number] {
  if (
    typeof sourceMetadata !== "object" ||
    sourceMetadata === null ||
    !("declaredSourceStatus" in sourceMetadata)
  ) {
    return "unknown";
  }
  return deriveSourceFirstSourceStatus({
    declaredSourceStatus: (sourceMetadata as { declaredSourceStatus?: unknown })
      .declaredSourceStatus,
  });
}
