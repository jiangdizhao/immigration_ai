// biome-ignore-all lint/complexity/noVoid: detail-only fields are dropped from the summary view.
// biome-ignore-all lint/style/noExportedImports: the gate and schema constants are re-exported.
// biome-ignore-all lint/suspicious/useAwait: adapter methods are asynchronous by contract.
import {
  coeValidityState,
  isCustomerAuthorableProvenance,
  isSchoolAdmissionsExternalActionKind,
  isSchoolAdmissionsOfferAction,
  isSchoolAdmissionsOriginKind,
  isSchoolAdmissionsServiceMode,
  isSchoolAdmissionsUuid,
  normalizeOptionalSchoolAdmissionsDate,
  normalizeOptionalSchoolAdmissionsText,
  normalizeSchoolAdmissionsText,
  offerExpiryState,
  offerStateForAction,
  provenanceRank,
  requiresAuthoritativeProvenance,
  SCHOOL_ADMISSIONS_CASE_SCHEMA,
  SCHOOL_ADMISSIONS_MAX_CASES_PER_PROJECT,
  SCHOOL_ADMISSIONS_MAX_EXCEPTION_TEXT,
  SCHOOL_ADMISSIONS_MAX_EXCEPTION_VERSIONS,
  SCHOOL_ADMISSIONS_MAX_EXTERNAL_ACTIONS,
  SCHOOL_ADMISSIONS_MAX_LABEL,
  SCHOOL_ADMISSIONS_MAX_NOTE,
  SCHOOL_ADMISSIONS_MAX_TEXT,
  SCHOOL_ADMISSIONS_POLICY_VERSION,
  SCHOOL_ADMISSIONS_PREPARATION_SCHEMA,
  type SchoolAdmissionsCoeState,
  type SchoolAdmissionsDisclosure,
  SchoolAdmissionsError,
  type SchoolAdmissionsExceptionClaimKind,
  type SchoolAdmissionsExceptionState,
  type SchoolAdmissionsExternalActionKind,
  type SchoolAdmissionsNextStep,
  type SchoolAdmissionsOfferAction,
  type SchoolAdmissionsOfferState,
  type SchoolAdmissionsOriginKind,
  type SchoolAdmissionsOutcomeKind,
  type SchoolAdmissionsOutcomeProvenance,
  type SchoolAdmissionsPreparationState,
  type SchoolAdmissionsReadinessStatus,
  type SchoolAdmissionsServiceMode,
  type SchoolAdmissionsStaleReason,
  schoolAdmissionsEnabled,
  schoolAdmissionsRequestSha256,
  validateSchoolAdmissionsOperationId,
  validateSchoolAdmissionsRevision,
} from "./contracts";

import type {
  SchoolAdmissionCaseRecord,
  SchoolAdmissionOutcomeRecord,
  SchoolAdmissionsActorContext,
  SchoolAdmissionsApplicationPort,
  SchoolAdmissionsDocumentOption,
  SchoolAdmissionsDocumentPort,
  SchoolAdmissionsDraftingPort,
  SchoolAdmissionsEducationPort,
  SchoolAdmissionsEvidencePort,
  SchoolAdmissionsManagedPort,
  SchoolAdmissionsOperationStamp,
  SchoolAdmissionsOperationType,
  SchoolAdmissionsStore,
  SchoolAdmissionsVerificationPort,
} from "./ports";
import {
  buildDisclosures,
  buildDraftSections,
  buildNextSteps,
  buildRequirementChecklist,
  preparationContentSha256,
  preparationInputsSha256,
  preparationStaleReasons,
  type SchoolAdmissionsApplicationSnapshot,
  type SchoolAdmissionsDraftSection,
  type SchoolAdmissionsEducationSummary,
  type SchoolAdmissionsEvidenceSummary,
  type SchoolAdmissionsOutcomeSummary,
  type SchoolAdmissionsPreparationInputs,
  type SchoolAdmissionsRequirementItem,
  sourceDigest,
} from "./workflow";

/**
 * Phase 13 M5.2 — Customer School Admissions service.
 *
 * Composition rules that this service will not break:
 *   - it never re-derives M5.1 authorization/freshness (it asks the M5.1 port),
 *   - it never re-derives M4 professional/payment/disclosure authority (it asks
 *     the M4 readiness port, which is deny-only in production),
 *   - it never turns a customer report, a document upload or a model suggestion
 *     into verified evidence,
 *   - it never submits anything anywhere: `submissionState` is a constant.
 */

export type SchoolAdmissionsPreparationView = {
  readonly preparationId: string;
  readonly version: number;
  readonly schemaVersion: string;
  readonly caseRevision: number;
  readonly applicationRevision: number | null;
  readonly serviceMode: SchoolAdmissionsServiceMode;
  readonly assistKind: string;
  readonly provisional: true;
  readonly contentSha256: string;
  readonly inputsSha256: string;
  readonly requirements: readonly SchoolAdmissionsRequirementItem[];
  readonly sections: readonly SchoolAdmissionsDraftSection[];
  readonly createdAt: string;
  readonly confirmedAt: string | null;
  readonly stale: boolean;
  readonly staleReasonCodes: readonly SchoolAdmissionsStaleReason[];
};

export type SchoolAdmissionsOutcomeView = {
  readonly outcomeId: string;
  readonly kind: SchoolAdmissionsOutcomeKind;
  readonly version: number;
  readonly state: SchoolAdmissionsOfferState | SchoolAdmissionsCoeState;
  readonly provenance: SchoolAdmissionsOutcomeProvenance;
  readonly provenanceRank: number;
  /** True only for `source_reviewed`/`provider_confirmed`. Never for a report. */
  readonly independentlyVerified: boolean;
  readonly evidenceAttached: boolean;
  readonly receivedOn: string | null;
  readonly expiresOn: string | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly decisionOn: string | null;
  readonly expiryState: string;
  readonly recordedAt: string;
  readonly superseded: boolean;
};

export type SchoolAdmissionsExternalActionView = {
  readonly actionId: string;
  readonly actionKind: SchoolAdmissionsExternalActionKind;
  readonly performedOn: string;
  readonly note: string | null;
  readonly provenance: "customer_reported";
  readonly verified: false;
  readonly recordedAt: string;
};

export type SchoolAdmissionsExceptionView = {
  readonly exceptionId: string;
  readonly claimKind: SchoolAdmissionsExceptionClaimKind;
  readonly state: SchoolAdmissionsExceptionState;
  readonly description: string;
  readonly authorityReference: string | null;
  readonly recordedAt: string;
  readonly decidedAt: string | null;
};

export type SchoolAdmissionsReadinessView = {
  readonly status: SchoolAdmissionsReadinessStatus;
  readonly reasonCodes: readonly string[];
  readonly checkedAt: string | null;
  readonly revalidationToken: string | null;
  /** Constant: M5.2 has no institutional submission adapter. */
  readonly submissionState: "not_connected";
  readonly disclosures: readonly SchoolAdmissionsDisclosure[];
};

export type SchoolAdmissionsCaseSummary = {
  readonly caseId: string;
  readonly projectId: string;
  readonly applicationId: string | null;
  readonly originKind: SchoolAdmissionsOriginKind;
  readonly institutionName: string;
  readonly courseTitle: string | null;
  readonly intakeLabel: string | null;
  readonly serviceMode: SchoolAdmissionsServiceMode;
  readonly preparationState: SchoolAdmissionsPreparationState;
  readonly revision: number;
  readonly offer: SchoolAdmissionsOutcomeView | null;
  readonly coe: SchoolAdmissionsOutcomeView | null;
  readonly exception: SchoolAdmissionsExceptionView | null;
  readonly managedReadiness: SchoolAdmissionsReadinessView;
  readonly journey: SchoolAdmissionsJourneyView;
  readonly nextStepCodes: readonly SchoolAdmissionsNextStep[];
  readonly disclosures: readonly SchoolAdmissionsDisclosure[];
  readonly preparationStale: boolean;
  readonly staleReasonCodes: readonly SchoolAdmissionsStaleReason[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SchoolAdmissionsCaseDetail = SchoolAdmissionsCaseSummary & {
  readonly application: {
    readonly applicationId: string;
    readonly revision: number;
    readonly status: string;
    readonly archived: boolean;
    readonly sourceStatus: string;
    readonly currentPackage: {
      readonly packageId: string;
      readonly version: number;
      readonly contentSha256: string;
      readonly usable: boolean;
      readonly staleReasonCodes: readonly string[];
    } | null;
    readonly referenceCount: number;
    readonly unavailableReferenceCount: number;
  } | null;
  readonly requirements: readonly SchoolAdmissionsRequirementItem[];
  readonly preparation: SchoolAdmissionsPreparationView | null;
  readonly preparationHistory: readonly {
    readonly preparationId: string;
    readonly version: number;
    readonly createdAt: string;
    readonly confirmedAt: string | null;
  }[];
  readonly outcomeHistory: readonly SchoolAdmissionsOutcomeView[];
  readonly externalActions: readonly SchoolAdmissionsExternalActionView[];
  readonly events: readonly {
    readonly eventType: string;
    readonly subjectKind: string;
    readonly subjectId: string;
    readonly caseRevision: number;
    readonly createdAt: string;
  }[];
  readonly policyVersion: string;
};

export type SchoolAdmissionsJourneyView = {
  readonly offerState: SchoolAdmissionsOfferState | "none";
  readonly offerExpiryState: string;
  readonly coeState: SchoolAdmissionsCoeState | "none";
  readonly coeValidityState: string;
  readonly exceptionState: SchoolAdmissionsExceptionState | "none";
  readonly hasOutcome: boolean;
  readonly offerTerminal: boolean;
  /** Constant: a CoE never establishes Student 500 visa eligibility here. */
  readonly student500Eligibility: "not_determined";
};

/** A selectable M5.1 application, plus whether a case already exists for it. */
export type SchoolAdmissionsApplicationOptionView = {
  readonly applicationId: string;
  readonly institutionName: string;
  readonly courseTitle: string;
  readonly intakeLabel: string | null;
  readonly sourceStatus: string;
  readonly revision: number;
  readonly archived: boolean;
  readonly hasCase: boolean;
};

export type SchoolAdmissionsServiceOptions = {
  readonly store: SchoolAdmissionsStore;
  readonly applicationPort: SchoolAdmissionsApplicationPort;
  readonly evidencePort: SchoolAdmissionsEvidencePort;
  readonly educationPort: SchoolAdmissionsEducationPort;
  readonly draftingPort: SchoolAdmissionsDraftingPort;
  readonly verificationPort: SchoolAdmissionsVerificationPort;
  readonly managedPort: SchoolAdmissionsManagedPort;
  /** Customer-authorized M2 document selection for evidence attachment. */
  readonly documentPort?: SchoolAdmissionsDocumentPort;
  readonly now?: () => Date;
};

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function createSchoolAdmissionsService(
  options: SchoolAdmissionsServiceOptions
) {
  const {
    store,
    applicationPort,
    evidencePort,
    educationPort,
    draftingPort,
    verificationPort,
    managedPort,
    documentPort,
  } = options;
  const now = options.now ?? (() => new Date());

  function operationStamp(input: {
    readonly actorUserId: string;
    readonly operationId: string;
    readonly operationType: SchoolAdmissionsOperationType;
    readonly request: unknown;
  }): SchoolAdmissionsOperationStamp {
    return {
      actorUserId: input.actorUserId,
      operationId: validateSchoolAdmissionsOperationId(input.operationId),
      operationType: input.operationType,
      requestSha256: schoolAdmissionsRequestSha256(input.request),
    };
  }

  /**
   * Resolves an exact retry BEFORE any state precondition is evaluated.
   *
   * A successful first attempt can invalidate the preconditions it satisfied
   * (an archived-once application, a superseded outcome, an advanced revision, a
   * verified exception), so an exact replay must return the recorded result
   * instead of re-running those checks. This runs only after the caller has
   * authorized the actor, the Project and the resource: a replay can never bypass
   * ownership or a revoked permission. A same-operationId, different-payload
   * request is an idempotency conflict, never a replay.
   */
  async function resolveReplay(input: {
    readonly actorUserId: string;
    readonly operation: SchoolAdmissionsOperationStamp;
  }): Promise<
    | { readonly replayed: false }
    | { readonly replayed: true; readonly resultId: string }
  > {
    const existing = await store.findOperation({
      actorUserId: input.actorUserId,
      operationId: input.operation.operationId,
      operationType: input.operation.operationType,
      requestSha256: input.operation.requestSha256,
    });
    if (existing.status === "conflict") {
      throw new SchoolAdmissionsError("idempotency_conflict");
    }
    if (existing.status === "absent") {
      return { replayed: false };
    }
    return { replayed: true, resultId: existing.resultId };
  }

  /**
   * Server-derived authorization. Actor and Project identity always come from the
   * authenticated session; nothing in a payload can widen them, and a staff or
   * non-customer account is rejected before any read.
   */
  async function authorize(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<SchoolAdmissionsActorContext> {
    if (
      !(
        isSchoolAdmissionsUuid(input.actorUserId) &&
        isSchoolAdmissionsUuid(input.projectId)
      )
    ) {
      throw new SchoolAdmissionsError("invalid_request");
    }
    const context = await store.readActorContext({ ...input });
    if (context.staff || !context.registeredCustomer) {
      throw new SchoolAdmissionsError("actor_not_eligible");
    }
    if (!context.project) {
      throw new SchoolAdmissionsError("project_not_found");
    }
    const authorized =
      context.project.ownerUserId === input.actorUserId ||
      context.membershipStatus === "active_member";
    if (!authorized) {
      throw new SchoolAdmissionsError("project_forbidden");
    }
    return context;
  }

  function assertWritable(context: SchoolAdmissionsActorContext) {
    if (context.project?.status !== "active") {
      throw new SchoolAdmissionsError("project_closed");
    }
  }

  async function requireCase(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly caseId: string;
  }): Promise<SchoolAdmissionCaseRecord> {
    if (!isSchoolAdmissionsUuid(input.caseId)) {
      throw new SchoolAdmissionsError("invalid_request");
    }
    const record = await store.getCase({
      caseId: input.caseId,
      ownerUserId: input.actorUserId,
      projectId: input.projectId,
    });
    if (!record) {
      throw new SchoolAdmissionsError("case_not_found");
    }
    return record;
  }

  async function loadApplication(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string | null;
  }): Promise<SchoolAdmissionsApplicationSnapshot | null> {
    if (!input.applicationId) {
      return null;
    }
    const read = await applicationPort.load({
      actorUserId: input.actorUserId,
      applicationId: input.applicationId,
      projectId: input.projectId,
    });
    if (read.status === "not_found") {
      throw new SchoolAdmissionsError("application_not_found");
    }
    if (read.status === "forbidden") {
      throw new SchoolAdmissionsError("project_forbidden");
    }
    if (read.status === "unavailable") {
      // Never guess an application's state: degrade the whole read instead.
      throw new SchoolAdmissionsError("evidence_unavailable");
    }
    return read.application;
  }

  async function loadEvidence(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly application: SchoolAdmissionsApplicationSnapshot | null;
  }): Promise<SchoolAdmissionsEvidenceSummary> {
    const references = input.application?.references ?? [];
    const available = references.filter(
      (entry) => entry.available && !entry.revoked
    );
    const conflictState = input.application
      ? await evidencePort.conflictState({
          actorUserId: input.actorUserId,
          projectId: input.projectId,
        })
      : ("none" as const);
    return {
      conflictState,
      documentCount: available.filter((entry) => entry.kind === "document")
        .length,
      factCount: available.filter((entry) => entry.kind === "fact").length,
      requirementCount: available.filter(
        (entry) => entry.kind === "requirement"
      ).length,
      unavailableCount: references.filter(
        (entry) => !entry.available || entry.revoked
      ).length,
    };
  }

  async function loadEducation(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly application: SchoolAdmissionsApplicationSnapshot | null;
  }): Promise<SchoolAdmissionsEducationSummary> {
    const application = input.application;
    if (!application || !(application.institutionId || application.courseId)) {
      return { status: "not_applicable" };
    }
    return educationPort.resolve({
      actorUserId: input.actorUserId,
      courseId: application.courseId,
      institutionId: application.institutionId,
      projectId: input.projectId,
    });
  }

  async function loadOutcomeSummary(
    caseId: string
  ): Promise<SchoolAdmissionsOutcomeSummary> {
    const outcomes = await store.listOutcomes({ caseId });
    const current = (kind: SchoolAdmissionsOutcomeKind) =>
      outcomes.find(
        (entry) => entry.kind === kind && entry.supersededById === null
      ) ?? null;
    const offer = current("offer");
    const coe = current("coe");
    const exceptions = await store.listExceptions({ caseId });
    const activeException =
      exceptions.find((entry) => entry.supersededById === null) ?? null;
    return {
      coe: coe
        ? {
            provenance: coe.provenance,
            state: coe.state as SchoolAdmissionsCoeState,
            validTo: coe.validTo,
          }
        : null,
      exception: activeException ? { state: activeException.state } : null,
      offer: offer
        ? {
            expiresOn: offer.expiresOn,
            provenance: offer.provenance,
            state: offer.state as SchoolAdmissionsOfferState,
          }
        : null,
    };
  }

  function assistanceKind():
    | "deterministic_template"
    | "stub_suggestion"
    | "disabled" {
    return draftingPort.kind;
  }

  /**
   * Builds the complete, authorized preparation input set. This is the only place
   * requirements/draft inputs are assembled, so the stored snapshot, the staleness
   * comparison and the live checklist can never disagree about their sources.
   */
  async function buildPreparationInputs(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly record: SchoolAdmissionCaseRecord;
    readonly application: SchoolAdmissionsApplicationSnapshot | null;
    readonly confirmed: boolean;
    readonly locale: "zh-CN" | "en";
    readonly managed: SchoolAdmissionsPreparationInputs["managed"];
  }): Promise<SchoolAdmissionsPreparationInputs> {
    const evidence = await loadEvidence({
      actorUserId: input.actorUserId,
      application: input.application,
      projectId: input.projectId,
    });
    const education = await loadEducation({
      actorUserId: input.actorUserId,
      application: input.application,
      projectId: input.projectId,
    });
    const outcomes = await loadOutcomeSummary(input.record.id);
    const base: SchoolAdmissionsPreparationInputs = {
      application: input.application,
      assistKind: assistanceKind(),
      confirmed: input.confirmed,
      education,
      evidence,
      managed: input.managed,
      originKind: input.record.originKind,
      serviceMode: input.record.serviceMode,
      standalone: input.application
        ? null
        : {
            courseTitle: input.record.courseTitle ?? "",
            institutionName: input.record.institutionName,
            intakeLabel: input.record.intakeLabel,
          },
      suggestions: [],
      outcomes,
    };
    const items = buildRequirementChecklist(base);

    let suggestions: SchoolAdmissionsPreparationInputs["suggestions"] = [];
    if (draftingPort.kind !== "disabled") {
      const suggestion = await draftingPort.suggest({
        applicationId: input.record.applicationId,
        authorizedSourceKinds: [
          ...new Set(items.flatMap((entry) => entry.sourceKinds)),
        ],
        caseId: input.record.id,
        courseTitle: input.record.courseTitle,
        institutionName: input.record.institutionName,
        intakeLabel: input.record.intakeLabel,
        locale: input.locale,
        requirementCodes: items.map((entry) => entry.code),
        sectionCodes: [
          "application_summary",
          "academic_background",
          "english_proficiency",
          "financial_capacity",
          "study_purpose",
          "provider_requirements",
          "next_steps",
        ],
      });
      suggestions =
        suggestion.status === "suggested" ? suggestion.suggestions : [];
    }

    return { ...base, suggestions };
  }

  function readinessView(
    record: SchoolAdmissionCaseRecord,
    disclosures: readonly SchoolAdmissionsDisclosure[]
  ): SchoolAdmissionsReadinessView {
    return {
      checkedAt: toIso(record.managedReadinessCheckedAt),
      disclosures: disclosures.filter(
        (code) =>
          code === "managed_submission_not_connected" ||
          code === "vip_not_managed_entitlement" ||
          code === "professional_authority_unavailable" ||
          code === "payment_not_certified"
      ),
      reasonCodes: record.managedReadinessReasonCodes,
      revalidationToken: record.managedReadinessToken,
      status: record.managedReadinessStatus,
      submissionState: "not_connected",
    };
  }

  function outcomeView(
    record: SchoolAdmissionOutcomeRecord,
    at: Date
  ): SchoolAdmissionsOutcomeView {
    const expiry =
      record.kind === "offer"
        ? offerExpiryState({
            expiresOn: record.expiresOn,
            now: at,
            state: record.state as SchoolAdmissionsOfferState,
          })
        : coeValidityState({
            now: at,
            state: record.state as SchoolAdmissionsCoeState,
            validTo: record.validTo,
          });
    return {
      decisionOn: record.decisionOn,
      evidenceAttached: Boolean(record.evidenceReferenceId),
      expiresOn: record.expiresOn,
      expiryState: expiry,
      independentlyVerified: requiresAuthoritativeProvenance(record.provenance),
      kind: record.kind,
      outcomeId: record.id,
      provenance: record.provenance,
      provenanceRank: provenanceRank(record.provenance),
      receivedOn: record.receivedOn,
      recordedAt: record.recordedAt.toISOString(),
      state: record.state,
      superseded: record.supersededById !== null,
      validFrom: record.validFrom,
      validTo: record.validTo,
      version: record.version,
    };
  }

  /**
   * Maps the M4 readiness observation into checklist predicates without inventing
   * anything: a READY result confirms both predicates; a NOT_READY result denies
   * only the predicate family its own reason codes name; everything else is
   * `null` (unknown), never a guess.
   */
  function managedInputs(
    record: SchoolAdmissionCaseRecord
  ): SchoolAdmissionsPreparationInputs["managed"] {
    if (record.serviceMode !== "managed_service") {
      return null;
    }
    const codes = record.managedReadinessReasonCodes;
    const engagementBlocked = codes.some(
      (code) =>
        code.startsWith("engagement_") ||
        code.startsWith("agreement_") ||
        code.startsWith("membership_") ||
        code.startsWith("project_")
    );
    const authorityBlocked = codes.some(
      (code) =>
        code.startsWith("professional_credential") ||
        code.startsWith("lawyer_assignment") ||
        code.startsWith("review_")
    );
    if (record.managedReadinessStatus === "READY") {
      return {
        authorityVerified: true,
        engagementCurrent: true,
        status: "READY",
      };
    }
    if (record.managedReadinessStatus === "NOT_READY") {
      return {
        authorityVerified: authorityBlocked ? false : null,
        engagementCurrent: engagementBlocked ? false : null,
        status: "NOT_READY",
      };
    }
    return {
      authorityVerified: null,
      engagementCurrent: null,
      status: record.managedReadinessStatus,
    };
  }

  function journeyView(
    outcomes: SchoolAdmissionsOutcomeSummary,
    at: Date
  ): SchoolAdmissionsJourneyView {
    return {
      coeState: outcomes.coe?.state ?? "none",
      coeValidityState: outcomes.coe
        ? coeValidityState({
            now: at,
            state: outcomes.coe.state,
            validTo: outcomes.coe.validTo,
          })
        : "not_applicable",
      exceptionState: outcomes.exception?.state ?? "none",
      hasOutcome: Boolean(outcomes.offer || outcomes.coe || outcomes.exception),
      offerExpiryState: outcomes.offer
        ? offerExpiryState({
            expiresOn: outcomes.offer.expiresOn,
            now: at,
            state: outcomes.offer.state,
          })
        : "not_applicable",
      offerState: outcomes.offer?.state ?? "none",
      offerTerminal: outcomes.offer
        ? ["accepted", "declined", "expired"].includes(outcomes.offer.state)
        : false,
      student500Eligibility: "not_determined",
    };
  }

  async function loadDetail(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly record: SchoolAdmissionCaseRecord;
  }): Promise<SchoolAdmissionsCaseDetail> {
    const at = now();
    const application = await loadApplication({
      actorUserId: input.actorUserId,
      applicationId: input.record.applicationId,
      projectId: input.projectId,
    });
    const preparations = await store.listPreparations({
      caseId: input.record.id,
    });
    const latest = [...preparations].sort(
      (left, right) => right.version - left.version
    )[0];
    const confirmed = Boolean(
      latest?.confirmedAt &&
        input.record.confirmedPreparationVersion === latest.version
    );
    const outcomes = await loadOutcomeSummary(input.record.id);
    const buildInputs = await buildPreparationInputs({
      actorUserId: input.actorUserId,
      application,
      confirmed,
      locale: "zh-CN",
      managed: managedInputs(input.record),
      projectId: input.projectId,
      record: input.record,
    });
    const requirements = buildRequirementChecklist(buildInputs);
    const currentSourceDigest = sourceDigest(
      application?.references ?? [],
      buildInputs.education
    );
    const packageSnapshot = application?.currentPackage ?? null;
    const currentInputsSha256 = preparationInputsSha256({
      applicationId: input.record.applicationId,
      applicationRevision: application?.revision ?? null,
      packageContentSha256: packageSnapshot?.contentSha256 ?? null,
      packageId: packageSnapshot?.packageId ?? null,
      requirements,
      serviceMode: input.record.serviceMode,
      sourceDigest: currentSourceDigest,
    });
    const sourceChanged = (application?.references ?? []).some(
      (entry) => entry.changed
    );
    const sourceAvailable = !(application?.references ?? []).some(
      (entry) => !entry.available || entry.revoked
    );
    const staleReasonCodes = latest
      ? preparationStaleReasons({
          current: {
            applicationRevision: application?.revision ?? null,
            archived: application?.archived === true,
            inputsSha256: currentInputsSha256,
            packageContentSha256: packageSnapshot?.contentSha256 ?? null,
            packageId: packageSnapshot?.packageId ?? null,
            sourceAvailable,
            sourceChanged,
          },
          recorded: {
            applicationRevision: latest.applicationRevision,
            inputsSha256: latest.inputsSha256,
            packageContentSha256: latest.packageContentSha256,
            packageId: latest.packageId,
          },
        })
      : [];

    const disclosures = buildDisclosures({
      assistKind: buildInputs.assistKind,
      coe: outcomes.coe,
      education: buildInputs.education,
      exception: outcomes.exception,
      offer: outcomes.offer,
      serviceMode: input.record.serviceMode,
    });
    const nextStepCodes = buildNextSteps({
      expiryState: outcomes.offer
        ? offerExpiryState({
            expiresOn: outcomes.offer.expiresOn,
            now: at,
            state: outcomes.offer.state,
          })
        : "not_applicable",
      items: requirements,
      outcomes,
      readiness: input.record.managedReadinessStatus,
      serviceMode: input.record.serviceMode,
    });

    const outcomeViews = (
      await store.listOutcomes({ caseId: input.record.id })
    ).map((entry) => outcomeView(entry, at));
    const currentOutcomeViews = outcomeViews.filter(
      (entry) => !entry.superseded
    );
    const offerView =
      currentOutcomeViews.find((entry) => entry.kind === "offer") ?? null;
    const coeView =
      currentOutcomeViews.find((entry) => entry.kind === "coe") ?? null;
    const exceptions = await store.listExceptions({ caseId: input.record.id });
    const activeException =
      exceptions.find((entry) => entry.supersededById === null) ?? null;
    const externalActions = await store.listExternalActions({
      caseId: input.record.id,
    });
    const events = await store.listEvents({ caseId: input.record.id });

    const preparationView: SchoolAdmissionsPreparationView | null = latest
      ? {
          applicationRevision: latest.applicationRevision,
          assistKind: latest.assistKind,
          caseRevision: latest.caseRevision,
          confirmedAt: toIso(latest.confirmedAt),
          contentSha256: latest.contentSha256,
          createdAt: latest.createdAt.toISOString(),
          inputsSha256: latest.inputsSha256,
          preparationId: latest.id,
          provisional: true,
          requirements: latest.requirements,
          schemaVersion: latest.schemaVersion,
          sections: latest.sections,
          serviceMode: latest.serviceMode,
          stale: staleReasonCodes.length > 0,
          staleReasonCodes,
          version: latest.version,
        }
      : null;

    const summary: SchoolAdmissionsCaseSummary = {
      applicationId: input.record.applicationId,
      caseId: input.record.id,
      coe: coeView,
      courseTitle: input.record.courseTitle,
      createdAt: input.record.createdAt.toISOString(),
      disclosures,
      exception: activeException
        ? {
            authorityReference: activeException.authorityReference,
            claimKind: activeException.claimKind,
            decidedAt: toIso(activeException.decidedAt),
            description: activeException.description,
            exceptionId: activeException.id,
            recordedAt: activeException.recordedAt.toISOString(),
            state: activeException.state,
          }
        : null,
      institutionName: input.record.institutionName,
      intakeLabel: input.record.intakeLabel,
      journey: journeyView(outcomes, at),
      managedReadiness: readinessView(input.record, disclosures),
      nextStepCodes,
      offer: offerView,
      originKind: input.record.originKind,
      preparationStale: staleReasonCodes.length > 0,
      preparationState: input.record.preparationState,
      projectId: input.record.projectId,
      revision: input.record.revision,
      serviceMode: input.record.serviceMode,
      staleReasonCodes,
      updatedAt: input.record.updatedAt.toISOString(),
    };

    return {
      ...summary,
      application: application
        ? {
            applicationId: application.applicationId,
            archived: application.archived,
            currentPackage: application.currentPackage
              ? {
                  contentSha256: application.currentPackage.contentSha256,
                  packageId: application.currentPackage.packageId,
                  staleReasonCodes: application.currentPackage.staleReasonCodes,
                  usable: application.currentPackage.usable,
                  version: application.currentPackage.version,
                }
              : null,
            referenceCount: application.references.length,
            revision: application.revision,
            sourceStatus: application.sourceStatus,
            status: application.applicationStatus,
            unavailableReferenceCount: application.references.filter(
              (entry) => !entry.available || entry.revoked
            ).length,
          }
        : null,
      events: events.map((entry) => ({
        caseRevision: entry.caseRevision,
        createdAt: entry.createdAt.toISOString(),
        eventType: entry.eventType,
        subjectId: entry.subjectId,
        subjectKind: entry.subjectKind,
      })),
      externalActions: externalActions.map((entry) => ({
        actionId: entry.id,
        actionKind: entry.actionKind,
        note: entry.note,
        performedOn: entry.performedOn,
        provenance: "customer_reported" as const,
        recordedAt: entry.recordedAt.toISOString(),
        verified: false as const,
      })),
      outcomeHistory: outcomeViews,
      policyVersion: SCHOOL_ADMISSIONS_POLICY_VERSION,
      preparation: preparationView,
      preparationHistory: [...preparations]
        .sort((left, right) => right.version - left.version)
        .map((entry) => ({
          confirmedAt: toIso(entry.confirmedAt),
          createdAt: entry.createdAt.toISOString(),
          preparationId: entry.id,
          version: entry.version,
        })),
      requirements,
    };
  }

  async function summaryFor(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly record: SchoolAdmissionCaseRecord;
  }): Promise<SchoolAdmissionsCaseSummary> {
    const detail = await loadDetail(input);
    const {
      application,
      events,
      externalActions,
      outcomeHistory,
      policyVersion,
      preparation,
      preparationHistory,
      requirements,
      ...summary
    } = detail;
    void application;
    void events;
    void externalActions;
    void outcomeHistory;
    void policyVersion;
    void preparation;
    void preparationHistory;
    void requirements;
    return summary;
  }

  async function resolveEvidenceReference(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly referenceId: string | null | undefined;
    readonly provenance: SchoolAdmissionsOutcomeProvenance;
  }): Promise<{
    evidenceReferenceId: string | null;
    evidenceReferenceVersion: number | null;
    evidenceReferenceSha256: string | null;
  }> {
    if (!input.referenceId) {
      if (input.provenance === "document_backed_unverified") {
        throw new SchoolAdmissionsError("evidence_invalid");
      }
      return {
        evidenceReferenceId: null,
        evidenceReferenceSha256: null,
        evidenceReferenceVersion: null,
      };
    }
    if (input.provenance !== "document_backed_unverified") {
      // Evidence is only ever attached at the documented-but-unverified level;
      // attaching a document must never imply review or provider confirmation.
      throw new SchoolAdmissionsError("invalid_request");
    }
    if (!isSchoolAdmissionsUuid(input.referenceId)) {
      throw new SchoolAdmissionsError("evidence_invalid");
    }
    const resolved = await evidencePort.resolve({
      actorUserId: input.actorUserId,
      kind: "document",
      projectId: input.projectId,
      referenceId: input.referenceId,
    });
    if (resolved.status === "not_found" || resolved.status === "forbidden") {
      throw new SchoolAdmissionsError("evidence_invalid");
    }
    if (resolved.status === "unavailable") {
      throw new SchoolAdmissionsError("evidence_unavailable");
    }
    return {
      evidenceReferenceId: input.referenceId,
      evidenceReferenceSha256: resolved.referenceSha256,
      evidenceReferenceVersion: resolved.referenceVersion,
    };
  }

  function assertCustomerProvenance(
    provenance: SchoolAdmissionsOutcomeProvenance
  ) {
    if (!isCustomerAuthorableProvenance(provenance)) {
      // A customer request can never assert review or provider confirmation.
      throw new SchoolAdmissionsError("authority_unavailable");
    }
  }

  return {
    async list(input: {
      readonly actorUserId: string;
      readonly projectId: string;
    }): Promise<{
      readonly cases: readonly SchoolAdmissionsCaseSummary[];
      readonly applications: readonly SchoolAdmissionsApplicationOptionView[];
      readonly documents: readonly SchoolAdmissionsDocumentOption[];
      readonly documentsUnavailable: boolean;
    }> {
      const context = await authorize(input);
      const records = await store.listCases({
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
      });
      const cases: SchoolAdmissionsCaseSummary[] = [];
      for (const record of records) {
        cases.push(await summaryFor({ ...input, record }));
      }
      // Creator-private selections: the M5.1 adapter only ever lists the actor's
      // own applications, and existing cases are marked so the UI cannot offer a
      // second case for the same application.
      const listed = await applicationPort.list(input);
      const bound = new Set(
        records
          .map((record) => record.applicationId)
          .filter((entry): entry is string => entry !== null)
      );
      const applications: SchoolAdmissionsApplicationOptionView[] =
        listed.status === "listed"
          ? listed.applications.map((entry) => ({
              ...entry,
              hasCase: bound.has(entry.applicationId),
            }))
          : [];
      const documents = documentPort
        ? await documentPort.list({
            actorUserId: input.actorUserId,
            projectId: input.projectId,
          })
        : ({ status: "unavailable" } as const);
      void context;
      return {
        applications,
        cases,
        documents: documents.status === "listed" ? documents.documents : [],
        documentsUnavailable: documents.status !== "listed",
      };
    },

    async get(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly caseId: string;
    }): Promise<{ readonly case: SchoolAdmissionsCaseDetail }> {
      await authorize(input);
      const record = await requireCase(input);
      return { case: await loadDetail({ ...input, record }) };
    },

    /**
     * Creates a case. `school_application` binds an existing M5.1 application
     * (exactly one case per application); the other origins record an existing
     * genuine Offer/CoE/exception **without** fabricating an application.
     */
    async createCase(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly originKind: SchoolAdmissionsOriginKind;
      readonly applicationId?: string | null;
      readonly institutionName?: string | null;
      readonly courseTitle?: string | null;
      readonly intakeLabel?: string | null;
      readonly serviceMode?: SchoolAdmissionsServiceMode;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      if (!isSchoolAdmissionsOriginKind(input.originKind)) {
        throw new SchoolAdmissionsError("invalid_request");
      }
      const serviceMode = input.serviceMode ?? "self_service";
      if (!isSchoolAdmissionsServiceMode(serviceMode)) {
        throw new SchoolAdmissionsError("invalid_request");
      }
      const boundApplicationId =
        input.originKind === "school_application"
          ? (input.applicationId ?? null)
          : null;
      if (input.originKind === "school_application") {
        if (!boundApplicationId) {
          throw new SchoolAdmissionsError("invalid_request");
        }
      } else if (input.applicationId) {
        // A standalone entry point must not masquerade as a bound application.
        throw new SchoolAdmissionsError("invalid_request");
      }

      /**
       * The request identity is built from the *authored* fields only, so an exact
       * retry resolves before any derived read. That matters here: the bound
       * application may have been archived since the first attempt, and a replay
       * must still return the case the customer already created.
       */
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "school_admission_case_create",
        request: {
          applicationId: boundApplicationId,
          courseTitle: input.courseTitle ?? null,
          institutionName: input.institutionName ?? null,
          intakeLabel: input.intakeLabel ?? null,
          originKind: input.originKind,
          projectId: input.projectId,
          serviceMode,
        },
      });
      const replay = await resolveReplay({
        actorUserId: input.actorUserId,
        operation,
      });
      if (replay.replayed) {
        const existing = await store.getCase({
          caseId: replay.resultId,
          ownerUserId: input.actorUserId,
          projectId: input.projectId,
        });
        if (!existing) {
          throw new SchoolAdmissionsError("integrity_conflict");
        }
        return {
          case: await loadDetail({ ...input, record: existing }),
          replayed: true,
        };
      }

      const application = await loadApplication({
        actorUserId: input.actorUserId,
        applicationId: boundApplicationId,
        projectId: input.projectId,
      });
      if (application?.archived) {
        throw new SchoolAdmissionsError("application_archived");
      }
      const institutionName = normalizeSchoolAdmissionsText(
        application?.institutionName ?? input.institutionName,
        SCHOOL_ADMISSIONS_MAX_TEXT
      );
      const courseTitle = application
        ? application.courseTitle
        : normalizeSchoolAdmissionsText(
            input.courseTitle,
            SCHOOL_ADMISSIONS_MAX_TEXT
          );
      const intakeLabel = application
        ? application.intakeLabel
        : normalizeOptionalSchoolAdmissionsText(
            input.intakeLabel,
            SCHOOL_ADMISSIONS_MAX_LABEL
          );

      if (boundApplicationId) {
        const existing = await store.getCaseByApplication({
          applicationId: boundApplicationId,
          ownerUserId: input.actorUserId,
          projectId: input.projectId,
        });
        if (existing) {
          throw new SchoolAdmissionsError("state_conflict");
        }
      }
      const count = await store.countCases({ projectId: input.projectId });
      if (count >= SCHOOL_ADMISSIONS_MAX_CASES_PER_PROJECT) {
        throw new SchoolAdmissionsError("limit_exceeded");
      }

      const result = await store.createCase({
        applicationId: boundApplicationId,
        courseTitle,
        institutionName,
        intakeLabel,
        operation,
        originKind: input.originKind,
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
        serviceMode,
      });
      return {
        case: await loadDetail({ ...input, record: result.value }),
        replayed: result.replayed,
      };
    },

    async setServiceMode(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly caseId: string;
      readonly expectedRevision: number;
      readonly serviceMode: SchoolAdmissionsServiceMode;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      if (!isSchoolAdmissionsServiceMode(input.serviceMode)) {
        throw new SchoolAdmissionsError("invalid_request");
      }
      const record = await requireCase(input);
      const expectedRevision = validateSchoolAdmissionsRevision(
        input.expectedRevision
      );
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "school_admission_service_mode",
        request: {
          caseId: record.id,
          expectedRevision,
          projectId: input.projectId,
          serviceMode: input.serviceMode,
        },
      });
      const replay = await resolveReplay({
        actorUserId: input.actorUserId,
        operation,
      });
      if (replay.replayed) {
        // The case revision has advanced since the first attempt; the recorded
        // result is returned instead of re-applying the CAS precondition.
        return {
          case: await loadDetail({
            ...input,
            record: await requireCase(input),
          }),
          replayed: true,
        };
      }
      const result = await store.updateServiceMode({
        caseId: record.id,
        expectedRevision,
        operation,
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
        serviceMode: input.serviceMode,
      });
      return {
        case: await loadDetail({ ...input, record: result.value }),
        replayed: result.replayed,
      };
    },

    /**
     * Builds (or rebuilds) the evidence-limited preparation snapshot. The result
     * is always provisional: it is composed from authorized source *identities*
     * and never from model output, and no requirement becomes `satisfied` because
     * a draft said so.
     */
    async prepare(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly caseId: string;
      readonly expectedRevision: number;
      readonly locale?: "zh-CN" | "en";
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const record = await requireCase(input);
      const expectedRevision = validateSchoolAdmissionsRevision(
        input.expectedRevision
      );
      /**
       * Replay is resolved before the application read: a `prepare` that already
       * succeeded must still be replayable after the application was archived or
       * its source changed.
       */
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "school_admission_prepare",
        request: {
          caseId: record.id,
          expectedRevision,
          locale: input.locale ?? "zh-CN",
          projectId: input.projectId,
        },
      });
      const replay = await resolveReplay({
        actorUserId: input.actorUserId,
        operation,
      });
      if (replay.replayed) {
        const preparations = await store.listPreparations({
          caseId: record.id,
        });
        const recorded =
          preparations.find((entry) => entry.id === replay.resultId) ??
          preparations.at(-1) ??
          null;
        return {
          case: await loadDetail({
            ...input,
            record: await requireCase(input),
          }),
          preparationVersion: recorded?.version ?? 0,
          replayed: true,
        };
      }
      const application = await loadApplication({
        actorUserId: input.actorUserId,
        applicationId: record.applicationId,
        projectId: input.projectId,
      });
      if (application?.archived) {
        throw new SchoolAdmissionsError("case_archived");
      }
      /**
       * Confirmation status is a property of the newest preparation version, so a
       * freshly recorded version correctly reads as unconfirmed even when an
       * earlier version was confirmed.
       */
      const preparationsForCase = await store.listPreparations({
        caseId: record.id,
      });
      const newestPreparation = [...preparationsForCase].sort(
        (left, right) => right.version - left.version
      )[0];
      const confirmed = newestPreparation?.confirmedAt != null;
      const buildInputs = await buildPreparationInputs({
        actorUserId: input.actorUserId,
        application,
        confirmed,
        locale: input.locale ?? "zh-CN",
        managed: managedInputs(record),
        projectId: input.projectId,
        record,
      });
      const requirements = buildRequirementChecklist(buildInputs);
      const sections = buildDraftSections(buildInputs, requirements);
      const packageSnapshot = application?.currentPackage ?? null;
      const digest = sourceDigest(
        application?.references ?? [],
        buildInputs.education
      );
      const inputsSha256 = preparationInputsSha256({
        applicationId: record.applicationId,
        applicationRevision: application?.revision ?? null,
        packageContentSha256: packageSnapshot?.contentSha256 ?? null,
        packageId: packageSnapshot?.packageId ?? null,
        requirements,
        serviceMode: record.serviceMode,
        sourceDigest: digest,
      });
      const result = await store.recordPreparation({
        caseId: record.id,
        expectedRevision,
        operation,
        ownerUserId: input.actorUserId,
        preparation: {
          applicationRevision: application?.revision ?? null,
          assistKind: buildInputs.assistKind,
          caseRevision: record.revision,
          contentSha256: preparationContentSha256(sections),
          inputsSha256,
          packageContentSha256: packageSnapshot?.contentSha256 ?? null,
          packageId: packageSnapshot?.packageId ?? null,
          requirements,
          schemaVersion: SCHOOL_ADMISSIONS_PREPARATION_SCHEMA,
          sections,
          serviceMode: record.serviceMode,
          sourceDigest: digest,
        },
        projectId: input.projectId,
      });
      return {
        case: await loadDetail({
          ...input,
          record: await requireCase(input),
        }),
        preparationVersion: result.value.version,
        replayed: result.replayed,
      };
    },

    /**
     * Records the customer's explicit confirmation of one preparation version.
     * A stale preparation cannot be confirmed: it must be rebuilt first, so the
     * confirmed snapshot always matches the current authorized inputs.
     */
    async confirmPreparation(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly caseId: string;
      readonly expectedRevision: number;
      readonly preparationId: string;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const record = await requireCase(input);
      const expectedRevision = validateSchoolAdmissionsRevision(
        input.expectedRevision
      );
      if (!isSchoolAdmissionsUuid(input.preparationId)) {
        throw new SchoolAdmissionsError("invalid_request");
      }
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "school_admission_confirm",
        request: {
          caseId: record.id,
          expectedRevision,
          preparationId: input.preparationId,
          projectId: input.projectId,
        },
      });
      const replay = await resolveReplay({
        actorUserId: input.actorUserId,
        operation,
      });
      if (replay.replayed) {
        // The revision advanced when the confirmation was recorded; an exact
        // retry returns the recorded confirmation without a second write.
        return {
          case: await loadDetail({
            ...input,
            record: await requireCase(input),
          }),
          preparationId: replay.resultId,
          replayed: true,
        };
      }
      const detail = await loadDetail({ ...input, record });
      const preparation = detail.preparation;
      if (!preparation || preparation.preparationId !== input.preparationId) {
        throw new SchoolAdmissionsError("state_conflict");
      }
      if (preparation.stale) {
        throw new SchoolAdmissionsError("state_conflict");
      }
      const result = await store.confirmPreparation({
        caseId: record.id,
        expectedRevision,
        operation,
        ownerUserId: input.actorUserId,
        preparationId: input.preparationId,
        projectId: input.projectId,
      });
      return {
        case: await loadDetail({ ...input, record: await requireCase(input) }),
        preparationId: result.value.id,
        replayed: result.replayed,
      };
    },

    /**
     * Records an Offer or CoE. Provenance is the customer-report or
     * documented-but-unverified level only; `source_reviewed`/`provider_confirmed`
     * are rejected with `authority_unavailable`.
     */
    async recordOutcome(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly caseId: string;
      readonly expectedRevision: number;
      readonly kind: SchoolAdmissionsOutcomeKind;
      readonly state?: SchoolAdmissionsOfferState | SchoolAdmissionsCoeState;
      readonly provenance: SchoolAdmissionsOutcomeProvenance;
      readonly evidenceReferenceId?: string | null;
      readonly receivedOn?: string | null;
      readonly expiresOn?: string | null;
      readonly validFrom?: string | null;
      readonly validTo?: string | null;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const record = await requireCase(input);
      const expectedRevision = validateSchoolAdmissionsRevision(
        input.expectedRevision
      );
      if (input.kind !== "offer" && input.kind !== "coe") {
        throw new SchoolAdmissionsError("invalid_request");
      }
      assertCustomerProvenance(input.provenance);

      const state =
        input.kind === "offer"
          ? (input.state ?? "received")
          : (input.state ??
            (input.evidenceReferenceId ? "obtained" : "claimed"));
      if (input.kind === "offer" && state !== "received") {
        // A newly recorded offer starts at `received`; decisions are transitions.
        throw new SchoolAdmissionsError("state_conflict");
      }
      if (input.kind === "coe" && state !== "claimed" && state !== "obtained") {
        throw new SchoolAdmissionsError("state_conflict");
      }
      if (
        input.kind === "coe" &&
        state === "obtained" &&
        !input.evidenceReferenceId
      ) {
        throw new SchoolAdmissionsError("evidence_invalid");
      }
      const receivedOn = normalizeOptionalSchoolAdmissionsDate(
        input.receivedOn
      );
      const expiresOn = normalizeOptionalSchoolAdmissionsDate(input.expiresOn);
      const validFrom = normalizeOptionalSchoolAdmissionsDate(input.validFrom);
      const validTo = normalizeOptionalSchoolAdmissionsDate(input.validTo);
      /**
       * Authored fields only: the resolved evidence fingerprint is derived state
       * and must not participate in request identity, otherwise an exact retry
       * could be mistaken for a changed request.
       */
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "school_admission_outcome_record",
        request: {
          caseId: record.id,
          evidenceReferenceId: input.evidenceReferenceId ?? null,
          expectedRevision,
          expiresOn,
          kind: input.kind,
          projectId: input.projectId,
          provenance: input.provenance,
          receivedOn,
          state,
          validFrom,
          validTo,
        },
      });
      const replay = await resolveReplay({
        actorUserId: input.actorUserId,
        operation,
      });
      if (replay.replayed) {
        return {
          case: await loadDetail({
            ...input,
            record: await requireCase(input),
          }),
          outcomeId: replay.resultId,
          replayed: true,
        };
      }
      const evidence = await resolveEvidenceReference({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        provenance: input.provenance,
        referenceId: input.evidenceReferenceId,
      });
      const result = await store.recordOutcome({
        caseId: record.id,
        expectedRevision,
        operation,
        outcome: {
          decisionOn: null,
          evidenceReferenceId: evidence.evidenceReferenceId,
          evidenceReferenceSha256: evidence.evidenceReferenceSha256,
          evidenceReferenceVersion: evidence.evidenceReferenceVersion,
          expiresOn,
          kind: input.kind,
          provenance: input.provenance,
          receivedOn,
          state,
          validFrom,
          validTo,
        },
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
      });
      return {
        case: await loadDetail({ ...input, record: await requireCase(input) }),
        outcomeId: result.value.id,
        replayed: result.replayed,
      };
    },

    /**
     * Advances an Offer decision or a CoE evidence state. The transition table is
     * frozen in `contracts.ts`; re-applying a decision to a terminal state is a
     * `state_conflict`, never a silent "re-confirmation".
     */
    async transitionOutcome(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly caseId: string;
      readonly expectedRevision: number;
      readonly outcomeId: string;
      readonly kind: SchoolAdmissionsOutcomeKind;
      readonly action?: SchoolAdmissionsOfferAction;
      readonly state?: SchoolAdmissionsOfferState | SchoolAdmissionsCoeState;
      readonly decisionOn?: string | null;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const record = await requireCase(input);
      const expectedRevision = validateSchoolAdmissionsRevision(
        input.expectedRevision
      );
      if (!isSchoolAdmissionsUuid(input.outcomeId)) {
        throw new SchoolAdmissionsError("invalid_request");
      }
      const decisionOn = normalizeOptionalSchoolAdmissionsDate(
        input.decisionOn
      );
      /**
       * Replay is resolved before the live-outcome lookup: the first transition
       * supersedes the row this request names, so re-running the lookup would
       * wrongly report `outcome_not_found` for an exact retry.
       */
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "school_admission_outcome_transition",
        request: {
          action: input.action ?? null,
          caseId: record.id,
          decisionOn,
          expectedRevision,
          kind: input.kind,
          outcomeId: input.outcomeId,
          projectId: input.projectId,
          state: input.state ?? null,
        },
      });
      const replay = await resolveReplay({
        actorUserId: input.actorUserId,
        operation,
      });
      if (replay.replayed) {
        return {
          case: await loadDetail({
            ...input,
            record: await requireCase(input),
          }),
          outcomeId: replay.resultId,
          replayed: true,
        };
      }
      const outcomes = await store.listOutcomes({ caseId: record.id });
      const current =
        outcomes.find(
          (entry) =>
            entry.id === input.outcomeId && entry.supersededById === null
        ) ?? null;
      if (!current) {
        throw new SchoolAdmissionsError("outcome_not_found");
      }
      if (current.kind !== input.kind) {
        throw new SchoolAdmissionsError("invalid_request");
      }

      let nextState: SchoolAdmissionsOfferState | SchoolAdmissionsCoeState;
      if (input.kind === "offer") {
        if (!isSchoolAdmissionsOfferAction(input.action)) {
          throw new SchoolAdmissionsError("invalid_request");
        }
        nextState = offerStateForAction(
          current.state as SchoolAdmissionsOfferState,
          input.action
        );
      } else {
        if (
          input.state !== "obtained" &&
          input.state !== "claimed" &&
          input.state !== "superseded"
        ) {
          throw new SchoolAdmissionsError("invalid_request");
        }
        // A claimed CoE may only be upgraded with real evidence attached.
        if (input.state === "obtained" && !current.evidenceReferenceId) {
          throw new SchoolAdmissionsError("evidence_invalid");
        }
        if (current.state === "superseded") {
          throw new SchoolAdmissionsError("state_conflict");
        }
        nextState = input.state;
      }

      const result = await store.transitionOutcome({
        caseId: record.id,
        decisionOn,
        expectedRevision,
        operation,
        outcomeId: input.outcomeId,
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
        state: nextState,
      });
      return {
        case: await loadDetail({ ...input, record: await requireCase(input) }),
        outcomeId: result.value.id,
        replayed: result.replayed,
      };
    },

    /**
     * Self-Service only: records an action the customer performed *outside* this
     * system. It is stored with `customer_reported` provenance and can never be
     * presented as an institutional submission or receipt.
     */
    async recordExternalAction(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly caseId: string;
      readonly expectedRevision: number;
      readonly actionKind: SchoolAdmissionsExternalActionKind;
      readonly performedOn: string;
      readonly note?: string | null;
      readonly acknowledged: true;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const record = await requireCase(input);
      const expectedRevision = validateSchoolAdmissionsRevision(
        input.expectedRevision
      );
      if (record.serviceMode !== "self_service") {
        // In managed mode the service performs the work; the customer does not
        // self-report an external submission.
        throw new SchoolAdmissionsError("state_conflict");
      }
      if (input.acknowledged !== true) {
        throw new SchoolAdmissionsError("invalid_request");
      }
      if (!isSchoolAdmissionsExternalActionKind(input.actionKind)) {
        throw new SchoolAdmissionsError("invalid_request");
      }
      const performedOn = normalizeOptionalSchoolAdmissionsDate(
        input.performedOn
      );
      if (!performedOn) {
        throw new SchoolAdmissionsError("invalid_request");
      }
      const note = normalizeOptionalSchoolAdmissionsText(
        input.note,
        SCHOOL_ADMISSIONS_MAX_NOTE
      );
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "school_admission_external_action",
        request: {
          actionKind: input.actionKind,
          caseId: record.id,
          expectedRevision,
          note,
          performedOn,
          projectId: input.projectId,
        },
      });
      const replay = await resolveReplay({
        actorUserId: input.actorUserId,
        operation,
      });
      if (replay.replayed) {
        return {
          actionId: replay.resultId,
          case: await loadDetail({
            ...input,
            record: await requireCase(input),
          }),
          replayed: true,
        };
      }
      const actions = await store.listExternalActions({ caseId: record.id });
      if (actions.length >= SCHOOL_ADMISSIONS_MAX_EXTERNAL_ACTIONS) {
        throw new SchoolAdmissionsError("limit_exceeded");
      }
      const result = await store.recordExternalAction({
        action: { actionKind: input.actionKind, note, performedOn },
        caseId: record.id,
        expectedRevision,
        operation,
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
      });
      return {
        actionId: result.value.id,
        case: await loadDetail({ ...input, record: await requireCase(input) }),
        replayed: result.replayed,
      };
    },

    /**
     * Records a claimed school-application exception. The claim is stored as
     * `claimed` and is only ever `verified`/`rejected` through the authoritative
     * verification port, which is unavailable in production.
     */
    async claimException(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly caseId: string;
      readonly expectedRevision: number;
      readonly description: string;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const record = await requireCase(input);
      const expectedRevision = validateSchoolAdmissionsRevision(
        input.expectedRevision
      );
      const description = normalizeSchoolAdmissionsText(
        input.description,
        SCHOOL_ADMISSIONS_MAX_EXCEPTION_TEXT
      );
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "school_admission_exception_claim",
        request: {
          caseId: record.id,
          description,
          expectedRevision,
          projectId: input.projectId,
        },
      });
      const replay = await resolveReplay({
        actorUserId: input.actorUserId,
        operation,
      });
      if (replay.replayed) {
        return {
          case: await loadDetail({
            ...input,
            record: await requireCase(input),
          }),
          exceptionId: replay.resultId,
          replayed: true,
        };
      }
      const existing = await store.listExceptions({ caseId: record.id });
      if (existing.length >= SCHOOL_ADMISSIONS_MAX_EXCEPTION_VERSIONS) {
        throw new SchoolAdmissionsError("limit_exceeded");
      }
      const result = await store.recordException({
        caseId: record.id,
        claim: {
          authorityReference: null,
          claimKind: "school_application_exception",
          description,
          state: "claimed",
        },
        expectedRevision,
        operation,
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
      });
      return {
        case: await loadDetail({ ...input, record: await requireCase(input) }),
        exceptionId: result.value.id,
        replayed: result.replayed,
      };
    },

    /**
     * Asks the authoritative verifier about a claimed exception.
     *
     * With no approved authority this fails closed with `authority_unavailable`
     * and changes nothing: a claim never becomes "confirmed" by having been asked
     * about.
     */
    async requestExceptionVerification(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly caseId: string;
      readonly expectedRevision: number;
      readonly exceptionId: string;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const record = await requireCase(input);
      const expectedRevision = validateSchoolAdmissionsRevision(
        input.expectedRevision
      );
      if (!isSchoolAdmissionsUuid(input.exceptionId)) {
        throw new SchoolAdmissionsError("invalid_request");
      }
      /**
       * Replay first: a successful verification supersedes the named exception and
       * changes its state, so an exact retry must return the recorded decision
       * rather than a fresh authority call or `exception_not_found`.
       */
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "school_admission_exception_verify",
        request: {
          caseId: record.id,
          exceptionId: input.exceptionId,
          expectedRevision,
          projectId: input.projectId,
        },
      });
      const replay = await resolveReplay({
        actorUserId: input.actorUserId,
        operation,
      });
      if (replay.replayed) {
        return {
          case: await loadDetail({
            ...input,
            record: await requireCase(input),
          }),
          exceptionId: replay.resultId,
          replayed: true,
        };
      }
      const exceptions = await store.listExceptions({ caseId: record.id });
      const current =
        exceptions.find(
          (entry) =>
            entry.id === input.exceptionId && entry.supersededById === null
        ) ?? null;
      if (!current) {
        throw new SchoolAdmissionsError("exception_not_found");
      }
      const verification = await verificationPort.verifyException({
        caseId: record.id,
        description: current.description,
        projectId: input.projectId,
      });
      if (
        verification.status === "unavailable" ||
        verification.status === "unknown"
      ) {
        throw new SchoolAdmissionsError("authority_unavailable");
      }
      const result = await store.recordException({
        caseId: record.id,
        claim: {
          authorityReference: verification.authorityReference,
          claimKind: current.claimKind,
          description: current.description,
          state: verification.status,
        },
        expectedRevision,
        operation,
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
      });
      return {
        case: await loadDetail({ ...input, record: await requireCase(input) }),
        exceptionId: result.value.id,
        replayed: result.replayed,
      };
    },

    /**
     * Evaluates Managed-Service readiness through the M4 gate and stores the
     * observation. It cannot produce READY where the M4 gate cannot, and it never
     * changes `submissionState` away from `not_connected`.
     */
    async evaluateManagedReadiness(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly caseId: string;
      readonly expectedRevision: number;
      readonly operationId: string;
    }) {
      const context = await authorize(input);
      assertWritable(context);
      const record = await requireCase(input);
      const expectedRevision = validateSchoolAdmissionsRevision(
        input.expectedRevision
      );
      if (record.serviceMode !== "managed_service") {
        throw new SchoolAdmissionsError("state_conflict");
      }
      if (!record.applicationId) {
        // Managed preparation is defined on an exact M5.1 application/package.
        throw new SchoolAdmissionsError("state_conflict");
      }
      const operation = operationStamp({
        actorUserId: input.actorUserId,
        operationId: input.operationId,
        operationType: "school_admission_readiness_evaluate",
        request: {
          caseId: record.id,
          expectedRevision,
          projectId: input.projectId,
        },
      });
      const replay = await resolveReplay({
        actorUserId: input.actorUserId,
        operation,
      });
      if (replay.replayed) {
        return {
          case: await loadDetail({
            ...input,
            record: await requireCase(input),
          }),
          replayed: true,
        };
      }
      const readiness = await managedPort.evaluate({
        actorUserId: input.actorUserId,
        applicationId: record.applicationId,
        projectId: input.projectId,
      });
      const observation =
        readiness.status === "unavailable"
          ? {
              reasonCodes: ["readiness_source_unavailable"],
              status: "UNKNOWN" as const,
              token: "",
            }
          : {
              reasonCodes: [...new Set(readiness.reasonCodes)].sort(),
              status: readiness.status,
              token: readiness.revalidationToken,
            };
      const result = await store.recordManagedReadiness({
        caseId: record.id,
        expectedRevision,
        operation,
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
        readiness: {
          checkedAt: now(),
          reasonCodes: observation.reasonCodes,
          status: observation.status,
          token: observation.token,
        },
      });
      return {
        case: await loadDetail({ ...input, record: result.value }),
        replayed: result.replayed,
      };
    },
  };
}

export type SchoolAdmissionsService = ReturnType<
  typeof createSchoolAdmissionsService
>;
export { schoolAdmissionsEnabled, SCHOOL_ADMISSIONS_CASE_SCHEMA };
