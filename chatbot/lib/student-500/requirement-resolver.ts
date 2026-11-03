import {
  STUDENT_500_DISCLOSURE_CODES,
  STUDENT_500_REQUIREMENT_KEYS,
  STUDENT_500_SCREENING_SCHEMA,
  type Student500Context,
  type Student500DisclosureCode,
  type Student500EvidenceStatus,
  type Student500HumanReviewReason,
  type Student500MissingFactCode,
  type Student500NextAction,
  type Student500PreparationState,
  type Student500ReasonCode,
  type Student500RequirementKey,
  type Student500RequirementStatus,
  type Student500SourceVerification,
} from "./contracts";
import type {
  Student500LegalSourceProvider,
  Student500ResolvedLegalSource,
} from "./legal-source-provider";

/**
 * Phase 13 M6.1 - preliminary Student 500 applicability and requirement resolver.
 *
 * What this resolver does
 * -----------------------
 * It maps the *reported* applicant circumstances onto a bounded set of screening
 * dimensions, and attaches to each dimension the official sources the repository
 * declares, the as-of coverage of those declarations, and the information that is
 * still missing.
 *
 * What it deliberately does not do
 * --------------------------------
 *   - It never decides whether a criterion is legally satisfied.
 *   - It never states a threshold, deadline, fee, eligibility conclusion or
 *     "ready to apply" status.
 *   - It never treats an absent answer as a negative answer.
 *   - It never upgrades a declaration into verified current law: every
 *     requirement carries an explicit source-verification state, and M6.1's
 *     declared provider can only produce `declared_pending_verification`,
 *     `insufficient_authority` or `unavailable`.
 */

export type Student500LinkedSchoolApplication = {
  readonly schoolApplicationId: string;
  readonly status: string;
  readonly sourceStatus: string;
  /** False when the link could not be re-authorized or no longer resolves. */
  readonly available: boolean;
};

export type Student500RequirementAssessment = {
  readonly requirementKey: Student500RequirementKey;
  readonly status: Student500RequirementStatus;
  readonly reasonCode: Student500ReasonCode;
  readonly missingFactCodes: readonly Student500MissingFactCode[];
  /** Customer-reported evidence position for this dimension, if it has one. */
  readonly evidencePreparation:
    | "reported_held"
    | "reported_not_held"
    | "not_declared"
    | "not_applicable";
  readonly sourceVerification: Student500SourceVerification;
  readonly sources: readonly Student500ResolvedLegalSource[];
  /**
   * True whenever the dimension still needs human legal review. In M6.1 that is
   * always true: no requirement has a verified official source, so no requirement
   * may look individually exempt from review.
   */
  readonly humanReviewRequired: boolean;
};

export type Student500StudyEvidenceView = {
  readonly route: Student500Context["entryRoute"];
  readonly coeStatus: Student500Context["coeStatus"];
  /**
   * A customer-reported CoE is never verified by this system. `none_reported`
   * simply means the customer has not reported holding one.
   */
  readonly coeVerification:
    | "customer_reported_not_verified"
    | "none_reported"
    | "unknown";
  readonly linkedSchoolApplication: Student500LinkedSchoolApplication | null;
};

export type Student500Screening = {
  readonly schemaVersion: typeof STUDENT_500_SCREENING_SCHEMA;
  readonly asOfDate: string | null;
  readonly submissionStatus: "not_submission_ready";
  readonly preparationState: Student500PreparationState;
  readonly requirements: readonly Student500RequirementAssessment[];
  readonly counts: {
    readonly applicable: number;
    readonly conditional: number;
    readonly notApplicable: number;
    readonly unknown: number;
  };
  readonly missingFactCodes: readonly Student500MissingFactCode[];
  readonly humanReviewReasons: readonly Student500HumanReviewReason[];
  readonly nextAction: Student500NextAction;
  readonly disclosures: readonly Student500DisclosureCode[];
  readonly studyEvidence: Student500StudyEvidenceView;
};

type Applicability = {
  readonly status: Student500RequirementStatus;
  readonly reasonCode: Student500ReasonCode;
  readonly missingFactCodes?: readonly Student500MissingFactCode[];
};

type RequirementRule = {
  readonly requirementKey: Student500RequirementKey;
  readonly sourceIds: readonly string[];
  readonly evidence?: (context: Student500Context) => Student500EvidenceStatus;
  readonly applicability: (context: Student500Context) => Applicability;
  readonly humanReview?: (
    context: Student500Context
  ) => readonly Student500HumanReviewReason[];
};

const APPLICABLE_ALWAYS: Applicability = {
  reasonCode: "selected_for_all_student_500_applications",
  status: "applicable",
};

/**
 * Applicability of the requirement set itself depends on course/passport/timing
 * questions that only authoritative law can settle, so it is reported as
 * conditional rather than asserted.
 */
const CONDITIONAL_PENDING_VERIFICATION: Applicability = {
  reasonCode: "conditionally_applicable_pending_legal_verification",
  status: "conditional",
};

/**
 * The bounded M6.1 rule pack. Most dimensions map 1:1 onto the Subclass 500
 * criterion identities already declared by the legal-service criterion pack; the
 * remaining ones are Project-preparation dimensions (valid-application gateway,
 * history disclosure, study-evidence route).
 */
const RULES: RequirementRule[] = [
  {
    applicability: () => APPLICABLE_ALWAYS,
    requirementKey: "schedule1_valid_application",
    sourceIds: [
      "au.reg.migration-regulations-1994.sch1.student",
      "au.act.migration-act-1958.s65",
      "au.homeaffairs.subclass-500.listing",
    ],
  },
  {
    applicability: (context) => {
      switch (context.entryRoute) {
        case null:
          return {
            missingFactCodes: ["study_evidence_route"],
            reasonCode: "unknown_study_evidence_route_missing",
            status: "unknown",
          };
        case "existing_coe":
          return {
            reasonCode: "selected_by_study_evidence_route",
            status: "applicable",
          };
        default:
          // Offer-only, school-application-in-progress and no-school-application
          // routes are preparation states: the dimension applies but nothing this
          // system has seen satisfies it.
          return {
            reasonCode: "selected_by_study_evidence_route",
            status: "conditional",
          };
      }
    },
    humanReview: () => ["study_evidence_not_independently_verified"],
    requirementKey: "study_evidence_coe_or_alternative",
    sourceIds: [
      "au.reg.migration-regulations-1994.sch2.500.primary",
      "au.homeaffairs.subclass-500.listing",
    ],
  },
  {
    applicability: () => APPLICABLE_ALWAYS,
    requirementKey: "genuine_student",
    sourceIds: [
      "au.reg.migration-regulations-1994.sch2.500.primary",
      "au.instrument.subclass-500.genuine-student",
      "au.homeaffairs.subclass-500.listing",
    ],
  },
  {
    applicability: () => CONDITIONAL_PENDING_VERIFICATION,
    evidence: (context) => context.englishEvidence,
    requirementKey: "english_language_evidence",
    sourceIds: [
      "au.reg.migration-regulations-1994.sch2.500.primary",
      "au.instrument.subclass-500.english",
      "au.homeaffairs.subclass-500.listing",
    ],
  },
  {
    applicability: () => CONDITIONAL_PENDING_VERIFICATION,
    evidence: (context) => context.financialEvidence,
    requirementKey: "financial_capacity_evidence",
    sourceIds: [
      "au.reg.migration-regulations-1994.sch2.500.primary",
      "au.instrument.subclass-500.financial-capacity",
      "au.homeaffairs.subclass-500.listing",
    ],
  },
  {
    applicability: () => CONDITIONAL_PENDING_VERIFICATION,
    evidence: (context) => context.oshcEvidence,
    requirementKey: "overseas_student_health_cover",
    sourceIds: [
      "au.reg.migration-regulations-1994.sch2.500.conditions",
      "au.homeaffairs.subclass-500.listing",
    ],
  },
  {
    applicability: () => CONDITIONAL_PENDING_VERIFICATION,
    requirementKey: "health_public_interest",
    sourceIds: ["au.reg.migration-regulations-1994.sch4.public-interest"],
  },
  {
    applicability: () => CONDITIONAL_PENDING_VERIFICATION,
    requirementKey: "character_public_interest",
    sourceIds: ["au.reg.migration-regulations-1994.sch4.public-interest"],
  },
];

RULES.push(
  {
    applicability: (context) => {
      switch (context.applicantAgeBand) {
        case "under_18":
          return {
            reasonCode: "selected_by_age_band_under_18",
            status: "applicable",
          };
        case "adult":
          return {
            reasonCode: "not_applicable_adult_applicant",
            status: "not_applicable",
          };
        default:
          return {
            missingFactCodes: ["applicant_age_band"],
            reasonCode: "unknown_age_band_missing",
            status: "unknown",
          };
      }
    },
    humanReview: () => ["applicant_under_18"],
    requirementKey: "under_18_welfare_arrangements",
    sourceIds: ["au.reg.migration-regulations-1994.sch2.500.under-18"],
  },
  {
    applicability: (context) => {
      switch (context.dependants) {
        case "one_or_more":
          return {
            reasonCode: "selected_by_declared_dependants",
            status: "applicable",
          };
        case "none":
          return {
            reasonCode: "not_applicable_no_declared_dependants",
            status: "not_applicable",
          };
        default:
          return {
            missingFactCodes: ["dependants"],
            reasonCode: "unknown_dependants_missing",
            status: "unknown",
          };
      }
    },
    humanReview: () => ["dependant_family_member_declared"],
    requirementKey: "family_unit_member_requirements",
    sourceIds: [
      "au.reg.migration-regulations-1994.sch2.500.secondary",
      "au.homeaffairs.subclass-500.listing",
    ],
  },
  {
    applicability: (context) => {
      switch (context.applicationPlace) {
        case "onshore":
          return {
            missingFactCodes: context.currentVisaSubclass
              ? undefined
              : ["current_visa_subclass"],
            reasonCode: "selected_by_application_place_onshore",
            status: "applicable",
          };
        case "offshore":
          return {
            reasonCode: "not_applicable_offshore_application",
            status: "not_applicable",
          };
        default:
          return {
            missingFactCodes: ["application_place"],
            reasonCode: "unknown_application_place_missing",
            status: "unknown",
          };
      }
    },
    humanReview: (context) =>
      context.applicationPlace === "onshore" && !context.currentVisaSubclass
        ? ["onshore_application_context_incomplete"]
        : [],
    requirementKey: "onshore_application_restrictions",
    sourceIds: [
      "au.reg.migration-regulations-1994.sch2.500.onshore",
      "au.reg.migration-regulations-1994.sch1.student",
    ],
  }
);

RULES.push(
  {
    applicability: (context) => {
      switch (context.applicationPlace) {
        case "offshore":
          return {
            reasonCode: "selected_by_application_place_offshore",
            status: "applicable",
          };
        case "onshore":
          return {
            reasonCode: "not_applicable_offshore_application",
            status: "not_applicable",
          };
        default:
          return {
            missingFactCodes: ["application_place"],
            reasonCode: "unknown_application_place_missing",
            status: "unknown",
          };
      }
    },
    requirementKey: "offshore_application_entry",
    sourceIds: [
      "au.reg.migration-regulations-1994.sch1.student",
      "au.act.migration-act-1958.s65",
    ],
  },
  {
    applicability: (context) => {
      switch (context.historyDeclaration) {
        case "declared_some":
          return {
            reasonCode: "selected_by_declared_immigration_history",
            status: "applicable",
          };
        case "declared_none":
          return {
            reasonCode: "not_applicable_no_declared_immigration_history",
            status: "not_applicable",
          };
        default:
          return {
            missingFactCodes: ["immigration_history"],
            reasonCode: "unknown_history_not_declared",
            status: "unknown",
          };
      }
    },
    humanReview: (context) => {
      const reasons: Student500HumanReviewReason[] = [];
      const flags = new Set(context.historyFlags.map((entry) => entry.flag));
      if (
        flags.has("prior_visa_refusal") ||
        flags.has("prior_visa_cancellation")
      ) {
        reasons.push("prior_refusal_or_cancellation_declared");
      }
      if (
        flags.has("prior_visa_condition_breach") ||
        flags.has("prior_unlawful_period") ||
        flags.has("prior_immigration_detention")
      ) {
        reasons.push("prior_condition_breach_or_unlawful_period_declared");
      }
      return reasons;
    },
    requirementKey: "prior_immigration_history_disclosure",
    sourceIds: ["au.reg.migration-regulations-1994.sch1.student"],
  },
  {
    applicability: () => APPLICABLE_ALWAYS,
    requirementKey: "student_visa_conditions_acknowledgement",
    sourceIds: ["au.reg.migration-regulations-1994.sch2.500.conditions"],
  }
);

const RULE_BY_KEY = new Map(RULES.map((rule) => [rule.requirementKey, rule]));

// The rule pack and the published requirement-key contract must never drift: a
// missing rule would silently disappear from the customer checklist.
if (RULE_BY_KEY.size !== STUDENT_500_REQUIREMENT_KEYS.length) {
  throw new Error("student_500_rule_pack_incomplete");
}
for (const key of STUDENT_500_REQUIREMENT_KEYS) {
  if (!RULE_BY_KEY.has(key)) {
    throw new Error(`student_500_rule_missing:${key}`);
  }
}

/**
 * Worst-case source verification for one requirement.
 *
 * `unavailable` wins because a material declared source could not even be
 * identified; a requirement with no legislative source at all is
 * `insufficient_authority` (guidance alone never supports a criterion); otherwise
 * the requirement is `declared_pending_verification`.
 */
function combineVerification(
  sources: readonly Student500ResolvedLegalSource[]
): Student500SourceVerification {
  if (sources.length === 0) {
    return "unavailable";
  }
  if (sources.some((source) => source.verification === "unavailable")) {
    return "unavailable";
  }
  if (!sources.some((source) => source.authorityClass === "legislation")) {
    return "insufficient_authority";
  }
  if (
    sources.every(
      (source) => source.verification === "verified_official_corpus"
    )
  ) {
    // Reachable only through an authoritative adapter; the M6.1 declared catalog
    // never produces a verified source, so this branch stays dormant.
    return "verified_official_corpus";
  }
  return "declared_pending_verification";
}

function evidencePreparationFor(
  rule: RequirementRule,
  context: Student500Context,
  status: Student500RequirementStatus
): Student500RequirementAssessment["evidencePreparation"] {
  if (!rule.evidence || status === "not_applicable") {
    return "not_applicable";
  }
  switch (rule.evidence(context)) {
    case "reported_held":
      return "reported_held";
    case "reported_not_held":
      return "reported_not_held";
    default:
      return "not_declared";
  }
}

/**
 * The screening facts that are genuinely required for the declared route.
 *
 * Nothing is required that the route does not need: an offshore applicant is not
 * asked for a current visa subclass, and an existing-CoE applicant is not asked to
 * connect a school application.
 */
export function student500MissingFactCodes(
  context: Student500Context
): Student500MissingFactCode[] {
  const missing: Student500MissingFactCode[] = [];
  if (context.entryRoute === null) {
    missing.push("study_evidence_route");
  }
  if (context.applicationPlace === "unknown") {
    missing.push("application_place");
  } else if (
    context.applicationPlace === "onshore" &&
    !context.currentVisaSubclass
  ) {
    missing.push("current_visa_subclass");
  }
  if (!context.asOfDate) {
    missing.push("as_of_date");
  }
  if (context.historyDeclaration === "not_declared") {
    missing.push("immigration_history");
  }
  if (context.applicantAgeBand === "unknown") {
    missing.push("applicant_age_band");
  }
  if (context.dependants === "unknown") {
    missing.push("dependants");
  }
  if (context.englishEvidence === "unknown") {
    missing.push("english_evidence");
  }
  if (context.financialEvidence === "unknown") {
    missing.push("financial_evidence");
  }
  if (context.oshcEvidence === "unknown") {
    missing.push("oshc_evidence");
  }
  if (
    context.entryRoute === "school_application_in_progress" &&
    !context.schoolApplicationId
  ) {
    missing.push("linked_school_application");
  }
  return missing;
}

const HUMAN_REVIEW_ORDER: readonly Student500HumanReviewReason[] = [
  "legal_source_not_verified",
  "as_of_date_outside_declared_coverage",
  "official_checklist_unavailable",
  "study_evidence_not_independently_verified",
  "prior_refusal_or_cancellation_declared",
  "prior_condition_breach_or_unlawful_period_declared",
  "onshore_application_context_incomplete",
  "applicant_under_18",
  "dependant_family_member_declared",
];

function orderedHumanReviewReasons(
  reasons: Iterable<Student500HumanReviewReason>
): Student500HumanReviewReason[] {
  const present = new Set(reasons);
  return HUMAN_REVIEW_ORDER.filter((reason) => present.has(reason));
}

/**
 * Deterministic single next action. Ordering is deliberate: the study-evidence
 * route, place and as-of date frame every other question, so a missing screening
 * fact is always surfaced before a review/checklist prompt.
 */
function selectNextAction(input: {
  readonly humanReviewReasons: readonly Student500HumanReviewReason[];
  readonly missingFactCodes: readonly Student500MissingFactCode[];
}): Student500NextAction {
  const order: ReadonlyArray<
    readonly [Student500MissingFactCode, Student500NextAction]
  > = [
    ["study_evidence_route", "declare_study_evidence_route"],
    ["application_place", "set_application_place"],
    ["as_of_date", "set_as_of_date"],
    ["immigration_history", "declare_immigration_history"],
    ["applicant_age_band", "declare_applicant_age_band"],
    ["current_visa_subclass", "set_current_visa_subclass"],
    ["linked_school_application", "connect_school_application"],
    ["english_evidence", "declare_english_evidence"],
    ["financial_evidence", "declare_financial_evidence"],
    ["oshc_evidence", "declare_oshc_evidence"],
    ["dependants", "declare_dependants"],
  ];
  const missing = new Set(input.missingFactCodes);
  for (const [code, action] of order) {
    if (missing.has(code)) {
      return action;
    }
  }
  if (input.humanReviewReasons.length > 0) {
    return "seek_human_review";
  }
  return "review_requirement_checklist";
}

export type Student500ScreeningInput = {
  readonly context: Student500Context;
  readonly provider: Student500LegalSourceProvider;
  readonly linkedSchoolApplication?: Student500LinkedSchoolApplication | null;
};

/**
 * Resolves the preliminary screening for one applicant context.
 *
 * Deterministic given the context and provider output, so the same persisted
 * context always renders the same checklist, missing information and next action.
 */
export async function resolveStudent500Screening(
  input: Student500ScreeningInput
): Promise<Student500Screening> {
  const context = input.context;
  const allSourceIds = [...new Set(RULES.flatMap((rule) => rule.sourceIds))];
  const resolved = await input.provider.resolve({
    asOfDate: context.asOfDate,
    sourceIds: allSourceIds,
  });
  const sourceById = new Map(
    resolved.map((source) => [source.sourceId, source])
  );

  const requirements: Student500RequirementAssessment[] = [];
  const missing = new Set<Student500MissingFactCode>();
  const humanReviewReasons = new Set<Student500HumanReviewReason>();
  const counts = {
    applicable: 0,
    conditional: 0,
    notApplicable: 0,
    unknown: 0,
  };

  for (const key of STUDENT_500_REQUIREMENT_KEYS) {
    const rule = RULE_BY_KEY.get(key);
    if (!rule) {
      throw new Error(`student_500_rule_missing:${key}`);
    }
    const sources = rule.sourceIds.map((sourceId) => {
      const source = sourceById.get(sourceId);
      if (!source) {
        throw new Error(`student_500_legal_source_unresolved:${sourceId}`);
      }
      return source;
    });
    const applicability = rule.applicability(context);
    const sourceVerification = combineVerification(sources);
    const outsideDeclaredCoverage = sources.some(
      (source) => source.asOfCoverage === "outside_declared_coverage"
    );

    let status = applicability.status;
    let reasonCode = applicability.reasonCode;
    // Source-driven downgrades apply to every dimension, including a
    // `not_applicable` conclusion: without a legislative basis, or outside the
    // declared coverage window, the screening cannot assert that a criterion even
    // existed - so nothing is asserted.
    if (sourceVerification === "insufficient_authority") {
      status = "unknown";
      reasonCode = "not_assessable_no_legislative_source";
    } else if (outsideDeclaredCoverage) {
      status = "unknown";
      reasonCode = "not_assessable_as_of_date_outside_declared_coverage";
    }

    const ruleMissing = applicability.missingFactCodes ?? [];
    for (const code of ruleMissing) {
      missing.add(code);
    }
    // A rule-level human-review reason only applies when the condition was
    // positively triggered; an unknown band is not evidence that it applies.
    const ruleReview =
      status === "applicable" || status === "conditional"
        ? (rule.humanReview?.(context) ?? [])
        : [];
    for (const reason of ruleReview) {
      humanReviewReasons.add(reason);
    }

    if (status === "applicable") {
      counts.applicable += 1;
    } else if (status === "conditional") {
      counts.conditional += 1;
    } else if (status === "not_applicable") {
      counts.notApplicable += 1;
    } else {
      counts.unknown += 1;
    }

    requirements.push({
      evidencePreparation: evidencePreparationFor(rule, context, status),
      // A requirement whose legal basis is not verified is never presented as
      // individually review-exempt. `declared_pending_verification` is *not* a
      // weaker form of verification: it means the official text was never
      // retrieved, so every such dimension still needs legal review - even when its
      // applicability is otherwise clear. Only a genuinely verified source can
      // clear this flag, and M6.1 never produces one.
      humanReviewRequired:
        status === "unknown" ||
        sourceVerification !== "verified_official_corpus" ||
        ruleReview.length > 0,
      missingFactCodes: ruleMissing,
      reasonCode,
      requirementKey: key,
      sourceVerification,
      sources,
      status,
    });
  }

  for (const code of student500MissingFactCodes(context)) {
    missing.add(code);
  }
  // M6.1 performs no authoritative retrieval, so source verification and official
  // checklist completeness are always disclosed as pending.
  humanReviewReasons.add("legal_source_not_verified");
  humanReviewReasons.add("official_checklist_unavailable");
  if (
    requirements.some(
      (requirement) =>
        requirement.reasonCode ===
        "not_assessable_as_of_date_outside_declared_coverage"
    )
  ) {
    humanReviewReasons.add("as_of_date_outside_declared_coverage");
  }

  const missingFactCodes = [...missing];
  const orderedReasons = orderedHumanReviewReasons(humanReviewReasons);

  return {
    asOfDate: context.asOfDate,
    counts,
    disclosures: STUDENT_500_DISCLOSURE_CODES.filter(
      (code) =>
        code !== "study_evidence_not_independently_verified" ||
        context.entryRoute !== null
    ),
    humanReviewReasons: orderedReasons,
    missingFactCodes,
    nextAction: selectNextAction({
      humanReviewReasons: orderedReasons,
      missingFactCodes,
    }),
    preparationState:
      missingFactCodes.length === 0
        ? "screening_complete_pending_review"
        : "screening_incomplete",
    requirements,
    schemaVersion: STUDENT_500_SCREENING_SCHEMA,
    studyEvidence: {
      coeStatus: context.coeStatus,
      coeVerification:
        context.coeStatus === "reported_held"
          ? "customer_reported_not_verified"
          : context.coeStatus === "reported_not_held"
            ? "none_reported"
            : "unknown",
      linkedSchoolApplication: input.linkedSchoolApplication ?? null,
      route: context.entryRoute,
    },
    submissionStatus: "not_submission_ready",
  };
}

export type Student500RequirementResolver = {
  resolve(
    input: Omit<Student500ScreeningInput, "provider">
  ): Promise<Student500Screening>;
};

/** The resolver bound to one legal-source provider (the service composition). */
export function createStudent500RequirementResolver(input: {
  readonly provider: Student500LegalSourceProvider;
}): Student500RequirementResolver {
  return {
    resolve(screeningInput) {
      return resolveStudent500Screening({
        ...screeningInput,
        provider: input.provider,
      });
    },
  };
}
