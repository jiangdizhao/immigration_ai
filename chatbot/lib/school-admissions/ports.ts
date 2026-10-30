import type {
  SchoolAdmissionsCoeState,
  SchoolAdmissionsExceptionClaimKind,
  SchoolAdmissionsExceptionState,
  SchoolAdmissionsExternalActionKind,
  SchoolAdmissionsOfferState,
  SchoolAdmissionsOriginKind,
  SchoolAdmissionsOutcomeKind,
  SchoolAdmissionsOutcomeProvenance,
  SchoolAdmissionsPreparationState,
  SchoolAdmissionsReadinessStatus,
  SchoolAdmissionsSectionCode,
  SchoolAdmissionsServiceMode,
} from "./contracts";
import type {
  SchoolAdmissionsApplicationSnapshot,
  SchoolAdmissionsDraftSection,
  SchoolAdmissionsEducationSummary,
  SchoolAdmissionsRequirementItem,
} from "./workflow";

/**
 * Phase 13 M5.2 — injected ports.
 *
 * The service owns authorization, provenance rules, state transitions, digests
 * and disclosures. Adapters own persistence and the read-only composition of
 * existing M1/M2/M3/M4 modules. No adapter may invent an authority: each adapter
 * distinguishes "definitely absent" from "cannot be established", because the
 * latter must surface as `unknown` rather than as a negative or a positive.
 */

export type SchoolAdmissionCaseRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly applicationId: string | null;
  readonly originKind: SchoolAdmissionsOriginKind;
  readonly institutionName: string;
  readonly courseTitle: string | null;
  readonly intakeLabel: string | null;
  readonly serviceMode: SchoolAdmissionsServiceMode;
  readonly preparationState: SchoolAdmissionsPreparationState;
  readonly revision: number;
  readonly confirmedPreparationVersion: number | null;
  readonly managedReadinessStatus: SchoolAdmissionsReadinessStatus;
  readonly managedReadinessReasonCodes: readonly string[];
  readonly managedReadinessCheckedAt: Date | null;
  readonly managedReadinessToken: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type SchoolAdmissionPreparationRecord = {
  readonly id: string;
  readonly caseId: string;
  readonly projectId: string;
  readonly version: number;
  readonly schemaVersion: string;
  readonly caseRevision: number;
  readonly applicationRevision: number | null;
  readonly serviceMode: SchoolAdmissionsServiceMode;
  readonly packageId: string | null;
  readonly packageContentSha256: string | null;
  readonly sourceDigest: string;
  readonly inputsSha256: string;
  readonly contentSha256: string;
  readonly requirements: readonly SchoolAdmissionsRequirementItem[];
  readonly sections: readonly SchoolAdmissionsDraftSection[];
  readonly assistKind: string;
  readonly confirmedAt: Date | null;
  readonly createdByUserId: string;
  readonly operationId: string;
  readonly requestSha256: string;
  readonly createdAt: Date;
};

export type SchoolAdmissionOutcomeRecord = {
  readonly id: string;
  readonly caseId: string;
  readonly projectId: string;
  readonly kind: SchoolAdmissionsOutcomeKind;
  readonly version: number;
  readonly state: SchoolAdmissionsOfferState | SchoolAdmissionsCoeState;
  readonly provenance: SchoolAdmissionsOutcomeProvenance;
  readonly evidenceReferenceId: string | null;
  readonly evidenceReferenceVersion: number | null;
  readonly evidenceReferenceSha256: string | null;
  readonly receivedOn: string | null;
  readonly expiresOn: string | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly decisionOn: string | null;
  readonly reportedByUserId: string;
  readonly recordedAt: Date;
  readonly supersededById: string | null;
  readonly operationId: string;
  readonly requestSha256: string;
};

export type SchoolAdmissionExternalActionRecord = {
  readonly id: string;
  readonly caseId: string;
  readonly projectId: string;
  readonly actionKind: SchoolAdmissionsExternalActionKind;
  readonly performedOn: string;
  readonly note: string | null;
  readonly acknowledged: true;
  readonly provenance: "customer_reported";
  readonly reportedByUserId: string;
  readonly recordedAt: Date;
  readonly operationId: string;
  readonly requestSha256: string;
};

export type SchoolAdmissionExceptionRecord = {
  readonly id: string;
  readonly caseId: string;
  readonly projectId: string;
  readonly claimKind: SchoolAdmissionsExceptionClaimKind;
  readonly version: number;
  readonly state: SchoolAdmissionsExceptionState;
  readonly description: string;
  readonly authorityReference: string | null;
  readonly decidedByUserId: string | null;
  readonly decidedAt: Date | null;
  readonly reportedByUserId: string;
  readonly recordedAt: Date;
  readonly supersededById: string | null;
  readonly operationId: string;
  readonly requestSha256: string;
};

export type SchoolAdmissionEventRecord = {
  readonly id: string;
  readonly caseId: string;
  readonly projectId: string;
  readonly actorUserId: string;
  readonly eventType: string;
  readonly subjectKind: string;
  readonly subjectId: string;
  readonly caseRevision: number;
  readonly createdAt: Date;
};

export type SchoolAdmissionsMembershipStatus =
  | "owner"
  | "active_member"
  | "pending"
  | "revoked"
  | "missing";

export type SchoolAdmissionsActorContext = {
  readonly registeredCustomer: boolean;
  readonly staff: boolean;
  readonly project: {
    readonly id: string;
    readonly ownerUserId: string;
    readonly status: "active" | "closed";
  } | null;
  readonly membershipStatus: SchoolAdmissionsMembershipStatus;
};

export const SCHOOL_ADMISSIONS_OPERATION_TYPES = [
  "school_admission_case_create",
  "school_admission_service_mode",
  "school_admission_prepare",
  "school_admission_confirm",
  "school_admission_outcome_record",
  "school_admission_outcome_transition",
  "school_admission_external_action",
  "school_admission_exception_claim",
  "school_admission_exception_verify",
  "school_admission_readiness_evaluate",
] as const;
export type SchoolAdmissionsOperationType =
  (typeof SCHOOL_ADMISSIONS_OPERATION_TYPES)[number];

export type SchoolAdmissionsOperationResultKind =
  | "school_admission_case"
  | "school_admission_preparation"
  | "school_admission_outcome"
  | "school_admission_external_action"
  | "school_admission_exception";

export type SchoolAdmissionsOperationStamp = {
  readonly actorUserId: string;
  readonly operationId: string;
  readonly operationType: SchoolAdmissionsOperationType;
  readonly requestSha256: string;
};

export type SchoolAdmissionsWriteResult<T> = {
  readonly replayed: boolean;
  readonly value: T;
};

export type SchoolAdmissionsOperationLookup =
  | { readonly status: "absent" }
  | { readonly status: "conflict" }
  | {
      readonly status: "replay";
      readonly resultId: string;
      readonly resultKind: SchoolAdmissionsOperationResultKind;
    };

export type SchoolAdmissionsPreparationDraft = {
  readonly schemaVersion: string;
  readonly caseRevision: number;
  readonly applicationRevision: number | null;
  readonly serviceMode: SchoolAdmissionsServiceMode;
  readonly packageId: string | null;
  readonly packageContentSha256: string | null;
  readonly sourceDigest: string;
  readonly inputsSha256: string;
  readonly contentSha256: string;
  readonly requirements: readonly SchoolAdmissionsRequirementItem[];
  readonly sections: readonly SchoolAdmissionsDraftSection[];
  readonly assistKind: string;
};

export type SchoolAdmissionsOutcomeDraft = {
  readonly kind: SchoolAdmissionsOutcomeKind;
  readonly state: SchoolAdmissionsOfferState | SchoolAdmissionsCoeState;
  readonly provenance: SchoolAdmissionsOutcomeProvenance;
  readonly evidenceReferenceId: string | null;
  readonly evidenceReferenceVersion: number | null;
  readonly evidenceReferenceSha256: string | null;
  readonly receivedOn: string | null;
  readonly expiresOn: string | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly decisionOn: string | null;
};

export type SchoolAdmissionsExternalActionDraft = {
  readonly actionKind: SchoolAdmissionsExternalActionKind;
  readonly performedOn: string;
  readonly note: string | null;
};

export type SchoolAdmissionsExceptionDraft = {
  readonly claimKind: SchoolAdmissionsExceptionClaimKind;
  readonly state: SchoolAdmissionsExceptionState;
  readonly description: string;
  readonly authorityReference: string | null;
};

export type SchoolAdmissionsReadinessDraft = {
  readonly status: SchoolAdmissionsReadinessStatus;
  readonly reasonCodes: readonly string[];
  readonly checkedAt: Date;
  readonly token: string;
};

export type SchoolAdmissionsStore = {
  readActorContext(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<SchoolAdmissionsActorContext>;

  /**
   * Read-only exact-replay lookup. It never writes and never widens authority:
   * the service still authorizes the actor and the case ownership before use.
   */
  findOperation(input: {
    readonly actorUserId: string;
    readonly operationId: string;
    readonly operationType: SchoolAdmissionsOperationType;
    readonly requestSha256: string;
  }): Promise<SchoolAdmissionsOperationLookup>;

  listCases(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
  }): Promise<SchoolAdmissionCaseRecord[]>;
  getCase(input: {
    readonly projectId: string;
    readonly caseId: string;
    readonly ownerUserId: string;
  }): Promise<SchoolAdmissionCaseRecord | null>;
  getCaseByApplication(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly ownerUserId: string;
  }): Promise<SchoolAdmissionCaseRecord | null>;
  countCases(input: { readonly projectId: string }): Promise<number>;

  listPreparations(input: {
    readonly caseId: string;
  }): Promise<SchoolAdmissionPreparationRecord[]>;
  listOutcomes(input: {
    readonly caseId: string;
  }): Promise<SchoolAdmissionOutcomeRecord[]>;
  listExternalActions(input: {
    readonly caseId: string;
  }): Promise<SchoolAdmissionExternalActionRecord[]>;
  listExceptions(input: {
    readonly caseId: string;
  }): Promise<SchoolAdmissionExceptionRecord[]>;
  listEvents(input: {
    readonly caseId: string;
  }): Promise<SchoolAdmissionEventRecord[]>;

  createCase(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly applicationId: string | null;
    readonly originKind: SchoolAdmissionsOriginKind;
    readonly institutionName: string;
    readonly courseTitle: string | null;
    readonly intakeLabel: string | null;
    readonly serviceMode: SchoolAdmissionsServiceMode;
    readonly operation: SchoolAdmissionsOperationStamp;
  }): Promise<SchoolAdmissionsWriteResult<SchoolAdmissionCaseRecord>>;

  updateServiceMode(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly caseId: string;
    readonly expectedRevision: number;
    readonly serviceMode: SchoolAdmissionsServiceMode;
    readonly operation: SchoolAdmissionsOperationStamp;
  }): Promise<SchoolAdmissionsWriteResult<SchoolAdmissionCaseRecord>>;

  recordPreparation(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly caseId: string;
    readonly expectedRevision: number;
    readonly preparation: SchoolAdmissionsPreparationDraft;
    readonly operation: SchoolAdmissionsOperationStamp;
  }): Promise<SchoolAdmissionsWriteResult<SchoolAdmissionPreparationRecord>>;

  confirmPreparation(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly caseId: string;
    readonly expectedRevision: number;
    readonly preparationId: string;
    readonly operation: SchoolAdmissionsOperationStamp;
  }): Promise<SchoolAdmissionsWriteResult<SchoolAdmissionPreparationRecord>>;

  recordOutcome(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly caseId: string;
    readonly expectedRevision: number;
    readonly outcome: SchoolAdmissionsOutcomeDraft;
    readonly operation: SchoolAdmissionsOperationStamp;
  }): Promise<SchoolAdmissionsWriteResult<SchoolAdmissionOutcomeRecord>>;

  transitionOutcome(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly caseId: string;
    readonly expectedRevision: number;
    readonly outcomeId: string;
    readonly state: SchoolAdmissionsOfferState | SchoolAdmissionsCoeState;
    readonly decisionOn: string | null;
    readonly operation: SchoolAdmissionsOperationStamp;
  }): Promise<SchoolAdmissionsWriteResult<SchoolAdmissionOutcomeRecord>>;

  recordExternalAction(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly caseId: string;
    readonly expectedRevision: number;
    readonly action: SchoolAdmissionsExternalActionDraft;
    readonly operation: SchoolAdmissionsOperationStamp;
  }): Promise<SchoolAdmissionsWriteResult<SchoolAdmissionExternalActionRecord>>;

  recordException(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly caseId: string;
    readonly expectedRevision: number;
    readonly claim: SchoolAdmissionsExceptionDraft;
    readonly operation: SchoolAdmissionsOperationStamp;
  }): Promise<SchoolAdmissionsWriteResult<SchoolAdmissionExceptionRecord>>;

  recordManagedReadiness(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly caseId: string;
    readonly expectedRevision: number;
    readonly readiness: SchoolAdmissionsReadinessDraft;
    readonly operation: SchoolAdmissionsOperationStamp;
  }): Promise<SchoolAdmissionsWriteResult<SchoolAdmissionCaseRecord>>;
};

/**
 * M5.1 application read-model adapter.
 *
 * The production implementation calls the existing M5.1 service, so M5.2 reuses
 * M5.1 authorization, reference freshness and package-usability decisions instead
 * of re-deriving them.
 */
export type SchoolAdmissionsApplicationRead =
  | {
      readonly status: "found";
      readonly application: SchoolAdmissionsApplicationSnapshot;
    }
  | { readonly status: "not_found" }
  | { readonly status: "forbidden" }
  | { readonly status: "unavailable" };

export type SchoolAdmissionsApplicationPort = {
  load(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string;
  }): Promise<SchoolAdmissionsApplicationRead>;
  /**
   * Selectable M5.1 applications for this actor inside this Project.
   *
   * Creator-private: only applications the requesting customer created, so a
   * Project member never sees another member's applications to attach a case to.
   */
  list(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<
    | {
        readonly status: "listed";
        readonly applications: readonly SchoolAdmissionsApplicationOption[];
      }
    | { readonly status: "unavailable" }
  >;
};

export type SchoolAdmissionsApplicationOption = {
  readonly applicationId: string;
  readonly institutionName: string;
  readonly courseTitle: string;
  readonly intakeLabel: string | null;
  readonly sourceStatus: string;
  readonly revision: number;
  readonly archived: boolean;
};

/**
 * Selectable M2 document references for evidence attachment.
 *
 * Only identity and a display label cross this boundary: never content, never a
 * storage locator, never an AI-use grant. The adapter applies the accepted M2
 * ownership, lifecycle, scan-status and storage-status rules.
 */
export type SchoolAdmissionsDocumentOption = {
  readonly referenceId: string;
  readonly version: number;
  readonly label: string | null;
};

export type SchoolAdmissionsDocumentPort = {
  list(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<
    | {
        readonly status: "listed";
        readonly documents: readonly SchoolAdmissionsDocumentOption[];
      }
    | { readonly status: "unavailable" }
  >;
};

export const unavailableSchoolAdmissionsDocumentPort: SchoolAdmissionsDocumentPort =
  {
    list: async () => ({ status: "unavailable" as const }),
  };

/**
 * M2 evidence adapter. Returns identity/freshness only — never a fact value, a
 * document body, a requirement body or any other disclosure.
 */
export type SchoolAdmissionsEvidencePort = {
  resolve(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly kind: "fact" | "document" | "requirement";
    readonly referenceId: string;
  }): Promise<
    | {
        readonly status: "resolved";
        readonly referenceVersion: number;
        readonly referenceSha256: string;
      }
    | { readonly status: "not_found" }
    | { readonly status: "forbidden" }
    | { readonly status: "unavailable" }
  >;
  conflictState(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<"none" | "conflicts" | "unavailable">;
};

/** M3 education adapter. Only the M3 record classes may ever be returned. */
export type SchoolAdmissionsEducationPort = {
  resolve(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly institutionId: string | null;
    readonly courseId: string | null;
  }): Promise<SchoolAdmissionsEducationSummary>;
};

/**
 * Bounded draft-assist adapter.
 *
 * `kind: "disabled"` is the only approved production value: no model provider has
 * been authorized, so no Project data may leave the process. The request shape
 * carries codes and already-visible customer text only — never M2 fact values,
 * document contents, private messages or credentials.
 */
export type SchoolAdmissionsDraftingRequest = {
  readonly caseId: string;
  readonly applicationId: string | null;
  readonly locale: "zh-CN" | "en";
  readonly institutionName: string;
  readonly courseTitle: string | null;
  readonly intakeLabel: string | null;
  readonly requirementCodes: readonly string[];
  readonly authorizedSourceKinds: readonly string[];
  readonly sectionCodes: readonly SchoolAdmissionsSectionCode[];
};

export type SchoolAdmissionsDraftingPort = {
  readonly kind: "deterministic_template" | "stub_suggestion" | "disabled";
  suggest(request: SchoolAdmissionsDraftingRequest): Promise<
    | {
        readonly status: "suggested";
        readonly suggestions: readonly {
          readonly sectionCode: SchoolAdmissionsSectionCode;
          readonly text: string;
          readonly sourceCodes: readonly string[];
          readonly uncertaintyCodes: readonly string[];
        }[];
      }
    | { readonly status: "unavailable" }
  >;
};

export const disabledSchoolAdmissionsDraftingPort: SchoolAdmissionsDraftingPort =
  {
    kind: "disabled",
    suggest: async () => ({ status: "unavailable" as const }),
  };

/**
 * Authoritative exception/outcome verification adapter.
 *
 * Production wires `unavailableSchoolAdmissionsVerificationPort`, so a claimed
 * exception can never become `verified` and a customer-reported Offer/CoE can
 * never become `source_reviewed`/`provider_confirmed`.
 */
export type SchoolAdmissionsVerificationPort = {
  verifyException(input: {
    readonly projectId: string;
    readonly caseId: string;
    readonly description: string;
  }): Promise<
    | { readonly status: "verified"; readonly authorityReference: string }
    | { readonly status: "rejected"; readonly authorityReference: string }
    | { readonly status: "unknown" }
    | { readonly status: "unavailable" }
  >;
};

export const unavailableSchoolAdmissionsVerificationPort: SchoolAdmissionsVerificationPort =
  {
    verifyException: async () => ({ status: "unavailable" as const }),
  };

/**
 * M4 managed-readiness adapter (M4-007).
 *
 * The production composition evaluates the existing deny-only readiness gate, so
 * the result can only be NOT_READY or UNKNOWN. M5.2 never computes professional,
 * payment, signature, disclosure or assignment authority itself.
 */
export type SchoolAdmissionsManagedReadinessRead = {
  readonly status: "READY" | "NOT_READY" | "UNKNOWN";
  readonly reasonCodes: readonly string[];
  readonly checkedAt: Date;
  readonly revalidationToken: string;
  readonly evidenceProvenance: "production" | "synthetic_test";
};

export type SchoolAdmissionsManagedPort = {
  evaluate(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string;
  }): Promise<
    SchoolAdmissionsManagedReadinessRead | { readonly status: "unavailable" }
  >;
};

export const unavailableSchoolAdmissionsManagedPort: SchoolAdmissionsManagedPort =
  {
    evaluate: async () => ({ status: "unavailable" as const }),
  };
