import {
  provenanceRank,
  SCHOOL_ADMISSIONS_MAX_NOTE,
  type SchoolAdmissionsCatalogRecordClass,
  type SchoolAdmissionsCoeState,
  type SchoolAdmissionsDisclosure,
  type SchoolAdmissionsExceptionState,
  type SchoolAdmissionsNextStep,
  type SchoolAdmissionsOfferState,
  type SchoolAdmissionsOriginKind,
  type SchoolAdmissionsOutcomeProvenance,
  type SchoolAdmissionsReadinessStatus,
  type SchoolAdmissionsRequirementCode,
  type SchoolAdmissionsRequirementStatus,
  type SchoolAdmissionsSectionCode,
  type SchoolAdmissionsServiceMode,
  type SchoolAdmissionsSourceStatus,
  type SchoolAdmissionsStaleReason,
  schoolAdmissionsSha256,
} from "./contracts";

export type SchoolAdmissionsApplicationReference = {
  readonly kind: "fact" | "document" | "requirement";
  readonly referenceId: string;
  readonly referenceVersion: number;
  readonly referenceSha256: string;
  readonly available: boolean;
  readonly changed: boolean;
  readonly revoked: boolean;
};

export type SchoolAdmissionsApplicationPackageSnapshot = {
  readonly packageId: string;
  readonly version: number;
  readonly contentSha256: string;
  readonly inputsSha256: string;
  readonly targetBindingSha256: string;
  readonly usable: boolean;
  readonly staleReasonCodes: readonly string[];
};

/** Authorized M5.1 read-model, produced by the M5.1 service (no re-derivation). */
export type SchoolAdmissionsApplicationSnapshot = {
  readonly applicationId: string;
  readonly projectId: string;
  readonly revision: number;
  readonly applicationStatus:
    | "draft"
    | "preparing"
    | "package_prepared"
    | "stale"
    | "archived";
  readonly archived: boolean;
  readonly institutionName: string;
  readonly institutionId: string | null;
  readonly courseTitle: string;
  readonly courseId: string | null;
  readonly deliveryId: string | null;
  readonly intakeId: string | null;
  readonly intakeLabel: string | null;
  readonly sourceStatus: SchoolAdmissionsSourceStatus;
  readonly catalogRecordClass: SchoolAdmissionsCatalogRecordClass | null;
  readonly catalogSnapshotToken: string | null;
  readonly missingDataCodes: readonly string[];
  readonly references: readonly SchoolAdmissionsApplicationReference[];
  readonly currentPackage: SchoolAdmissionsApplicationPackageSnapshot | null;
};

export type SchoolAdmissionsEvidenceSummary = {
  /** Authorized, currently resolved references only. No values ever. */
  readonly factCount: number;
  readonly documentCount: number;
  readonly requirementCount: number;
  /** References the customer bound that can no longer be read or have moved. */
  readonly unavailableCount: number;
  readonly conflictState: "none" | "conflicts" | "unavailable";
};

export type SchoolAdmissionsEducationSummary =
  | {
      readonly status: "resolved";
      readonly recordClass: SchoolAdmissionsCatalogRecordClass;
      readonly snapshotToken: string | null;
      readonly institutionLabel: string | null;
      readonly courseLabel: string | null;
    }
  | { readonly status: "not_found" }
  | { readonly status: "unavailable" }
  | { readonly status: "not_applicable" };

export type SchoolAdmissionsOutcomeSummary = {
  readonly offer: {
    readonly state: SchoolAdmissionsOfferState;
    readonly provenance: SchoolAdmissionsOutcomeProvenance;
    readonly expiresOn: string | null;
  } | null;
  readonly coe: {
    readonly state: SchoolAdmissionsCoeState;
    readonly provenance: SchoolAdmissionsOutcomeProvenance;
    readonly validTo: string | null;
  } | null;
  readonly exception: {
    readonly state: SchoolAdmissionsExceptionState;
  } | null;
};

export type SchoolAdmissionsRequirementItem = {
  readonly code: SchoolAdmissionsRequirementCode;
  readonly status: SchoolAdmissionsRequirementStatus;
  readonly appliesTo: SchoolAdmissionsServiceMode | "both";
  readonly required: boolean;
  readonly sourceKinds: readonly string[];
  readonly uncertaintyCodes: readonly string[];
};

export type SchoolAdmissionsDraftSection = {
  readonly code: SchoolAdmissionsSectionCode;
  readonly text: string;
  readonly sources: readonly string[];
  readonly uncertaintyCodes: readonly string[];
};

export type SchoolAdmissionsPreparationInputs = {
  readonly originKind: SchoolAdmissionsOriginKind;
  readonly serviceMode: SchoolAdmissionsServiceMode;
  readonly application: SchoolAdmissionsApplicationSnapshot | null;
  readonly standalone: {
    readonly institutionName: string;
    readonly courseTitle: string;
    readonly intakeLabel: string | null;
  } | null;
  readonly evidence: SchoolAdmissionsEvidenceSummary;
  readonly education: SchoolAdmissionsEducationSummary;
  readonly confirmed: boolean;
  readonly outcomes: SchoolAdmissionsOutcomeSummary;
  readonly managed: {
    readonly status: SchoolAdmissionsReadinessStatus;
    readonly engagementCurrent: boolean | null;
    readonly authorityVerified: boolean | null;
  } | null;
  readonly assistKind:
    | "deterministic_template"
    | "stub_suggestion"
    | "disabled";
  readonly suggestions: readonly {
    readonly sectionCode: SchoolAdmissionsSectionCode;
    readonly text: string;
    readonly sourceCodes: readonly string[];
    readonly uncertaintyCodes: readonly string[];
  }[];
};

/**
 * Phase 13 M5.2 — deterministic, evidence-limited preparation engine.
 *
 * Everything here is a pure function of already-authorized inputs. There is no
 * model call, no network call and no free-form generation: the checklist and the
 * draft are composed from typed facts about *what evidence exists*, never from
 * invented content. A requirement can only be `satisfied` by real resolved
 * evidence, and catalog data is never more than `unverified` because the M3
 * catalog record classes are `SYNTHETIC`/`UNVERIFIED`.
 */

function clampNote(value: string): string {
  return value.length <= SCHOOL_ADMISSIONS_MAX_NOTE
    ? value
    : `${value.slice(0, SCHOOL_ADMISSIONS_MAX_NOTE - 1)}…`;
}

function item(
  code: SchoolAdmissionsRequirementCode,
  status: SchoolAdmissionsRequirementStatus,
  input: {
    appliesTo?: SchoolAdmissionsServiceMode | "both";
    required?: boolean;
    sourceKinds?: readonly string[];
    uncertaintyCodes?: readonly string[];
  } = {}
): SchoolAdmissionsRequirementItem {
  return {
    appliesTo: input.appliesTo ?? "both",
    code,
    required: input.required ?? true,
    sourceKinds: input.sourceKinds ?? [],
    status,
    uncertaintyCodes: input.uncertaintyCodes ?? [],
  };
}

function targetComplete(input: SchoolAdmissionsPreparationInputs): boolean {
  if (input.application) {
    return Boolean(
      input.application.institutionName.trim() &&
        input.application.courseTitle.trim() &&
        (input.application.intakeId || input.application.intakeLabel)
    );
  }
  return Boolean(
    input.standalone?.institutionName.trim() &&
      input.standalone.courseTitle.trim()
  );
}

function originRequiresOutcome(
  originKind: SchoolAdmissionsOriginKind
): boolean {
  return (
    originKind === "existing_offer" ||
    originKind === "existing_coe" ||
    originKind === "claimed_exception"
  );
}

/**
 * Deterministic mirror of the `SchoolAdmissionCase_confirmation_forward_only`
 * database guard (Migration 0047).
 *
 * Confirmation may advance to a newer preparation version, or stay unchanged.
 * It can never move backwards and it can never be cleared back to
 * "unconfirmed", because a confirmed snapshot must stay auditable and an older
 * version must never silently become current again.
 */
export function isSchoolAdmissionsConfirmationForwardOnly(
  previous: number | null,
  next: number | null
): boolean {
  if (previous === null) {
    return true;
  }
  if (next === null) {
    return false;
  }
  return next >= previous;
}

/**
 * Deterministic requirement checklist.
 *
 * Ordering is fixed by construction so a stored preparation and a later
 * recomputation can be compared byte-for-byte.
 */
export function buildRequirementChecklist(
  input: SchoolAdmissionsPreparationInputs
): SchoolAdmissionsRequirementItem[] {
  const { evidence, education, outcomes, managed } = input;
  const managedMode = input.serviceMode === "managed_service";
  const items: SchoolAdmissionsRequirementItem[] = [];

  items.push(
    targetComplete(input)
      ? item("application_target_complete", "satisfied", {
          sourceKinds: ["customer_input"],
        })
      : item("application_target_complete", "missing", {
          sourceKinds: ["customer_input"],
          uncertaintyCodes: ["target_details_incomplete"],
        })
  );

  if (evidence.conflictState === "conflicts") {
    items.push(
      item("evidence_fact_available", "conflicting", {
        sourceKinds: ["m2_fact"],
        uncertaintyCodes: ["conflicting_facts"],
      })
    );
  } else if (evidence.conflictState === "unavailable") {
    items.push(
      item("evidence_fact_available", "unknown", {
        sourceKinds: ["m2_fact"],
        uncertaintyCodes: ["conflict_state_unavailable"],
      })
    );
  } else if (evidence.factCount > 0) {
    items.push(
      item("evidence_fact_available", "satisfied", {
        sourceKinds: ["m2_fact"],
      })
    );
  } else {
    items.push(
      item("evidence_fact_available", "missing", {
        sourceKinds: ["m2_fact"],
        uncertaintyCodes: ["no_confirmed_fact"],
      })
    );
  }

  items.push(
    evidence.documentCount > 0
      ? item("evidence_document_available", "satisfied", {
          sourceKinds: ["m2_document"],
        })
      : item("evidence_document_available", "missing", {
          sourceKinds: ["m2_document"],
          uncertaintyCodes: ["no_available_document"],
        })
  );

  if (education.status === "resolved") {
    // Catalog resolution is never independent verification, whatever its class.
    items.push(
      item("education_source_resolved", "unverified", {
        sourceKinds: ["m3_catalog"],
        uncertaintyCodes: [
          education.recordClass === "SYNTHETIC"
            ? "synthetic_catalog_record"
            : "unverified_catalog_record",
        ],
      })
    );
  } else if (education.status === "not_found") {
    items.push(
      item("education_source_resolved", "missing", {
        sourceKinds: ["m3_catalog"],
        uncertaintyCodes: ["catalog_record_not_found"],
      })
    );
  } else if (education.status === "unavailable") {
    items.push(
      item("education_source_resolved", "unknown", {
        sourceKinds: ["m3_catalog"],
        uncertaintyCodes: ["catalog_unavailable"],
      })
    );
  } else {
    items.push(
      item("education_source_resolved", "not_applicable", {
        sourceKinds: ["m3_catalog"],
      })
    );
  }

  const pkg = input.application?.currentPackage ?? null;
  if (input.application) {
    items.push(
      pkg?.usable
        ? item("preparation_package_usable", "satisfied", {
            sourceKinds: ["m5_1_package"],
          })
        : item("preparation_package_usable", "missing", {
            sourceKinds: ["m5_1_package"],
            uncertaintyCodes: pkg
              ? ["package_not_usable"]
              : ["package_missing"],
          })
    );
  } else {
    items.push(
      item(
        "preparation_package_usable",
        managedMode ? "missing" : "not_applicable",
        {
          appliesTo: "managed_service",
          sourceKinds: ["m5_1_package"],
          uncertaintyCodes: managedMode ? ["package_missing"] : [],
        }
      )
    );
  }

  items.push(
    input.confirmed
      ? item("customer_confirmation_recorded", "satisfied", {
          sourceKinds: ["customer_input"],
        })
      : item("customer_confirmation_recorded", "missing", {
          sourceKinds: ["customer_input"],
          uncertaintyCodes: ["customer_confirmation_required"],
        })
  );

  if (managedMode) {
    items.push(
      item(
        "managed_engagement_current",
        managed?.engagementCurrent === true
          ? "satisfied"
          : managed?.engagementCurrent === false
            ? "missing"
            : "unknown",
        {
          appliesTo: "managed_service",
          sourceKinds: ["m4_engagement", "m4_readiness"],
          uncertaintyCodes:
            managed === null || managed.engagementCurrent === null
              ? ["engagement_state_unavailable"]
              : [],
        }
      ),
      item(
        "managed_authority_verified",
        managed?.authorityVerified === true
          ? "satisfied"
          : managed?.authorityVerified === false
            ? "missing"
            : "unknown",
        {
          appliesTo: "managed_service",
          sourceKinds: ["m4_professional_authority"],
          uncertaintyCodes:
            managed === null || managed.authorityVerified === null
              ? ["professional_authority_unavailable"]
              : [],
        }
      )
    );
  } else {
    items.push(
      item("managed_engagement_current", "not_applicable", {
        appliesTo: "managed_service",
        required: false,
      }),
      item("managed_authority_verified", "not_applicable", {
        appliesTo: "managed_service",
        required: false,
      })
    );
  }

  const pathwayPresent = Boolean(
    outcomes.offer || outcomes.coe || outcomes.exception
  );
  items.push(
    pathwayPresent
      ? item("outcome_pathway_present", "satisfied", {
          sourceKinds: ["customer_input", "m2_document"],
        })
      : item(
          "outcome_pathway_present",
          originRequiresOutcome(input.originKind)
            ? "missing"
            : "not_applicable",
          {
            required: originRequiresOutcome(input.originKind),
            sourceKinds: ["customer_input"],
            uncertaintyCodes: originRequiresOutcome(input.originKind)
              ? ["outcome_not_recorded"]
              : [],
          }
        )
  );

  if (outcomes.coe) {
    const documented =
      provenanceRank(outcomes.coe.provenance) >=
      provenanceRank("document_backed_unverified");
    items.push(
      item("coe_evidence_recorded", documented ? "satisfied" : "unverified", {
        sourceKinds: ["m2_document"],
        uncertaintyCodes: documented ? [] : ["coe_claimed_without_evidence"],
      })
    );
  } else {
    items.push(
      item(
        "coe_evidence_recorded",
        input.originKind === "existing_coe" ? "missing" : "not_applicable",
        {
          required: input.originKind === "existing_coe",
          sourceKinds: ["m2_document"],
          uncertaintyCodes:
            input.originKind === "existing_coe" ? ["coe_not_recorded"] : [],
        }
      )
    );
  }

  return items;
}

function requirementStatus(
  items: readonly SchoolAdmissionsRequirementItem[],
  code: SchoolAdmissionsRequirementCode
): SchoolAdmissionsRequirementStatus {
  return items.find((entry) => entry.code === code)?.status ?? "unknown";
}

/**
 * Customer-visible next steps. Deterministic: derived only from checklist state,
 * offer expiry observation and the managed readiness result. Never from a model.
 */
export function buildNextSteps(input: {
  readonly items: readonly SchoolAdmissionsRequirementItem[];
  readonly outcomes: SchoolAdmissionsOutcomeSummary;
  readonly serviceMode: SchoolAdmissionsServiceMode;
  readonly readiness: SchoolAdmissionsReadinessStatus;
  readonly expiryState: string;
}): SchoolAdmissionsNextStep[] {
  const steps: SchoolAdmissionsNextStep[] = [];
  const status = (code: SchoolAdmissionsRequirementCode) =>
    requirementStatus(input.items, code);

  if (status("application_target_complete") === "missing") {
    steps.push("complete_application_details");
  }
  if (status("evidence_fact_available") === "conflicting") {
    steps.push("resolve_conflicting_facts");
  }
  if (
    status("evidence_fact_available") === "missing" ||
    status("evidence_document_available") === "missing"
  ) {
    steps.push("bind_source_evidence");
  }
  if (status("preparation_package_usable") === "missing") {
    steps.push("build_preparation_package");
  }
  if (status("customer_confirmation_recorded") === "missing") {
    steps.push("record_customer_confirmation");
  }
  if (status("outcome_pathway_present") === "missing") {
    steps.push("record_offer_or_exception");
  }
  if (status("coe_evidence_recorded") === "missing") {
    steps.push("record_coe_evidence");
  }
  if (
    input.expiryState === "expiring_soon" ||
    input.expiryState === "expired"
  ) {
    steps.push("review_offer_expiry");
  }
  if (input.outcomes.exception?.state === "needs_verification") {
    steps.push("verify_exception_authoritatively");
  }
  if (
    input.outcomes.offer &&
    (input.outcomes.offer.state === "received" ||
      input.outcomes.offer.state === "under_review") &&
    input.expiryState !== "expiring_soon" &&
    input.expiryState !== "expired"
  ) {
    steps.push("await_institutional_response");
  }
  if (input.serviceMode === "managed_service" && input.readiness !== "READY") {
    steps.push("request_managed_service_support");
  }

  return [...new Set(steps)];
}

/**
 * Deterministic draft composition.
 *
 * The template never states a legal conclusion, an admission likelihood, a fee,
 * a scholarship, a deadline or a visa outcome. Where evidence is absent the text
 * says so. A bounded assist suggestion may only *replace the prose of a section*
 * while keeping the section's deterministic sources/uncertainty codes, and it is
 * always marked provisional.
 */
export function buildDraftSections(
  input: SchoolAdmissionsPreparationInputs,
  items: readonly SchoolAdmissionsRequirementItem[]
): SchoolAdmissionsDraftSection[] {
  const institution =
    input.application?.institutionName ??
    input.standalone?.institutionName ??
    "the recorded institution";
  const course =
    input.application?.courseTitle ??
    input.standalone?.courseTitle ??
    "the recorded course";
  const intake =
    input.application?.intakeLabel ??
    input.application?.intakeId ??
    input.standalone?.intakeLabel ??
    null;
  const status = (code: SchoolAdmissionsRequirementCode) =>
    requirementStatus(items, code);
  const suggestion = (code: SchoolAdmissionsSectionCode) =>
    input.suggestions.find((entry) => entry.sectionCode === code) ?? null;

  function section(
    code: SchoolAdmissionsSectionCode,
    template: string,
    sources: readonly string[],
    uncertaintyCodes: readonly string[] = []
  ): SchoolAdmissionsDraftSection {
    const suggested = suggestion(code);
    return {
      code,
      sources: [...new Set([...sources, ...(suggested?.sourceCodes ?? [])])],
      text: clampNote(suggested?.text ?? template),
      uncertaintyCodes: [
        ...new Set([
          ...uncertaintyCodes,
          ...(suggested?.uncertaintyCodes ?? []),
        ]),
      ],
    };
  }

  const packageNote = input.application?.currentPackage?.usable
    ? `Immutable preparation package version ${input.application.currentPackage.version} is current and usable.`
    : input.application
      ? "No usable immutable preparation package is recorded for this school application yet."
      : "This case is not bound to a school application, so no preparation package identity exists.";

  return [
    section(
      "application_summary",
      `Provisional draft for ${institution} — ${course}${
        intake ? `, intake ${intake}` : ""
      }. Target details were provided by the customer and are not independently verified by any institution. ${packageNote}`,
      ["customer_input", "m5_1_package"],
      ["draft_is_provisional", "target_not_independently_verified"]
    ),
    section(
      "academic_background",
      status("evidence_fact_available") === "satisfied"
        ? `This draft references ${input.evidence.factCount} customer-authorised study fact record(s). Their values must be confirmed by the customer, and any academic claim required by the institution must be supported by an authorised document.`
        : "No customer-authorised study facts are available to this workflow yet, so no academic claim is drafted.",
      ["authorized_m2_fact"],
      status("evidence_fact_available") === "satisfied"
        ? ["facts_not_institution_verified"]
        : ["no_confirmed_fact"]
    ),
    section(
      "english_proficiency",
      "No independently verified English proficiency result is reviewed in this workflow. Record the test type, date and score only from an authorised document; nothing is inferred here.",
      ["deterministic_template"],
      ["english_evidence_not_reviewed"]
    ),
    section(
      "financial_capacity",
      "No financial evidence has been certified in this workflow. Any tuition, living-cost or deposit figure must come from an authorised document or an approved provider statement; this draft asserts no amount and no payment.",
      ["deterministic_template"],
      ["payment_not_certified", "no_fee_assertion"]
    ),
    section(
      "study_purpose",
      "Draft the customer's own study purpose in their words. This section is a placeholder: no genuine temporary entrant or visa argument is generated, assessed or guaranteed here.",
      ["deterministic_template"],
      ["no_visa_outcome_claim", "draft_is_provisional"]
    ),
    section(
      "provider_requirements",
      status("education_source_resolved") === "unverified"
        ? "An education catalogue record matched the recorded institution/course. Catalogue records are not independent institutional confirmation, and this workflow asserts no institutional requirement, deadline or fee."
        : status("education_source_resolved") === "missing"
          ? "No catalogue record matched the recorded institution/course. Institutional requirements remain unknown until the customer or an authorised reviewer supplies them."
          : "Institutional requirements are unavailable in this workflow and are therefore left unasserted.",
      ["m3_catalog"],
      ["catalog_not_independently_verified"]
    ),
    section(
      "next_steps",
      `Outstanding items: ${
        items
          .filter(
            (entry) =>
              entry.required &&
              entry.status !== "satisfied" &&
              entry.status !== "not_applicable"
          )
          .map((entry) => entry.code)
          .join(", ") || "none recorded"
      }.`,
      ["deterministic_template"],
      []
    ),
  ];
}

/**
 * Snapshot digest of the *material* inputs a preparation was derived from.
 *
 * It deliberately excludes the case revision itself, the composed prose and the
 * customer-confirmation status: recording an external action or confirming the
 * draft must not retroactively invalidate the snapshot it was confirmed against.
 * A material change (service mode, checklist evidence state, package identity,
 * application revision, authorized source identities) always produces a new
 * digest, so the stored preparation is reported stale instead of reused.
 */
export function preparationInputsSha256(input: {
  readonly applicationId: string | null;
  readonly applicationRevision: number | null;
  readonly serviceMode: SchoolAdmissionsServiceMode;
  readonly requirements: readonly SchoolAdmissionsRequirementItem[];
  readonly packageId: string | null;
  readonly packageContentSha256: string | null;
  readonly sourceDigest: string;
}): string {
  return schoolAdmissionsSha256({
    applicationId: input.applicationId,
    applicationRevision: input.applicationRevision,
    packageContentSha256: input.packageContentSha256,
    packageId: input.packageId,
    requirements: input.requirements
      .filter((entry) => entry.code !== "customer_confirmation_recorded")
      .map((entry) => ({ code: entry.code, status: entry.status })),
    serviceMode: input.serviceMode,
    sourceDigest: input.sourceDigest,
  });
}

export function preparationContentSha256(
  sections: readonly SchoolAdmissionsDraftSection[]
): string {
  return schoolAdmissionsSha256(
    sections.map((entry) => ({
      code: entry.code,
      sources: [...entry.sources].sort(),
      text: entry.text,
      uncertaintyCodes: [...entry.uncertaintyCodes].sort(),
    }))
  );
}

/** Deterministic digest of the authorized source identities actually observed. */
export function sourceDigest(
  references: readonly SchoolAdmissionsApplicationReference[],
  education: SchoolAdmissionsEducationSummary
): string {
  const refs = [...references]
    .map((entry) => ({
      available: entry.available,
      changed: entry.changed,
      kind: entry.kind,
      referenceId: entry.referenceId,
      referenceSha256: entry.referenceSha256,
      referenceVersion: entry.referenceVersion,
      revoked: entry.revoked,
    }))
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.referenceId.localeCompare(right.referenceId)
    );
  return schoolAdmissionsSha256({
    education:
      education.status === "resolved"
        ? {
            recordClass: education.recordClass,
            snapshotToken: education.snapshotToken,
            status: education.status,
          }
        : { status: education.status },
    references: refs,
  });
}

/**
 * Deterministic staleness of a stored preparation against today's authorized
 * state. A preparation is only usable when it was derived from the current case
 * revision, the current M5.1 application/package identity and the same authorized
 * sources; otherwise it is reported stale and never silently reused.
 */
export function preparationStaleReasons(input: {
  readonly recorded: {
    readonly applicationRevision: number | null;
    readonly packageId: string | null;
    readonly packageContentSha256: string | null;
    readonly inputsSha256: string;
  };
  readonly current: {
    readonly applicationRevision: number | null;
    readonly packageId: string | null;
    readonly packageContentSha256: string | null;
    readonly inputsSha256: string;
    readonly archived: boolean;
    readonly sourceAvailable: boolean;
    readonly sourceChanged: boolean;
  };
}): SchoolAdmissionsStaleReason[] {
  const reasons: SchoolAdmissionsStaleReason[] = [];
  if (input.current.archived) {
    reasons.push("case_archived");
  }
  if (input.recorded.inputsSha256 !== input.current.inputsSha256) {
    reasons.push("requirements_changed");
  }
  if (
    input.recorded.applicationRevision !== input.current.applicationRevision
  ) {
    reasons.push("application_changed");
  }
  if (
    input.recorded.packageId !== input.current.packageId ||
    input.recorded.packageContentSha256 !== input.current.packageContentSha256
  ) {
    reasons.push("package_changed");
  }
  if (input.current.sourceChanged) {
    reasons.push("source_changed");
  }
  if (!input.current.sourceAvailable) {
    reasons.push("source_unavailable");
  }
  return [...new Set(reasons)];
}

/**
 * Customer-visible disclosures. Deterministic and additive: the set can never
 * quietly shrink because a positive authority appeared.
 */
export function buildDisclosures(input: {
  readonly serviceMode: SchoolAdmissionsServiceMode;
  readonly assistKind: SchoolAdmissionsPreparationInputs["assistKind"];
  readonly offer: SchoolAdmissionsOutcomeSummary["offer"];
  readonly coe: SchoolAdmissionsOutcomeSummary["coe"];
  readonly exception: SchoolAdmissionsOutcomeSummary["exception"];
  readonly education: SchoolAdmissionsEducationSummary;
}): SchoolAdmissionsDisclosure[] {
  const codes = new Set<SchoolAdmissionsDisclosure>([
    "not_a_school_submission",
    "no_institutional_decision",
    "requirements_not_legal_advice",
  ]);
  const verifiedOffer =
    input.offer !== null &&
    provenanceRank(input.offer.provenance) >= provenanceRank("source_reviewed");
  const verifiedCoe =
    input.coe !== null &&
    provenanceRank(input.coe.provenance) >= provenanceRank("source_reviewed");

  if (!(verifiedOffer && verifiedCoe)) {
    codes.add("no_verified_offer_or_coe");
  }
  if (input.offer && !verifiedOffer) {
    codes.add("customer_report_not_verified");
    if (input.offer.provenance === "document_backed_unverified") {
      codes.add("document_not_authenticated");
    }
  }
  if (input.coe) {
    codes.add("coe_does_not_establish_student_500_eligibility");
    if (!verifiedCoe) {
      codes.add("customer_report_not_verified");
    }
    if (input.coe.provenance === "document_backed_unverified") {
      codes.add("document_not_authenticated");
    }
  }
  if (input.exception) {
    codes.add("professional_authority_unavailable");
  }
  if (input.serviceMode === "managed_service") {
    codes.add("managed_submission_not_connected");
    codes.add("vip_not_managed_entitlement");
    codes.add("payment_not_certified");
  }
  if (input.assistKind === "disabled") {
    codes.add("ai_assist_unavailable");
  }
  codes.add("draft_is_provisional");
  if (input.education.status === "resolved") {
    codes.add("catalog_not_independently_verified");
  }
  return [...codes].sort();
}
