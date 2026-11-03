import type { Student500RequirementKey } from "../contracts";
import type {
  Student500OutcomeKind,
  Student500OutcomeProvenance,
  Student500PreparationOperationType,
  Student500PreparationResultKind,
  Student500SchoolContextKind,
  Student500StudyEvidenceKind,
} from "./contracts";

/**
 * Phase 13 M6.2 - injected ports for the preparation service.
 *
 * The store owns persistence of preparation records only. The fact port owns the
 * one authorized read of M2 state; it must never return a full fact projection,
 * document bodies, Chat content or professional-review material. The admission
 * port is a read-only M5.2 lookup.
 */

export type Student500FactReferenceRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly applicationId: string;
  readonly factAssertionId: string;
  readonly factVersion: number;
  readonly factKey: string;
  readonly originKind: string;
  readonly stateAtUse: string;
  readonly aiUseAuthorizedAtSelection: boolean;
  readonly authorizationAudience: "none" | "actor_only" | "project";
  readonly authorizationActorUserId: string | null;
  readonly sourceEvidenceRef: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
};

export type Student500SchoolContextRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly applicationId: string;
  readonly kind: Student500SchoolContextKind;
  readonly studyEvidenceKind: Student500StudyEvidenceKind;
  readonly schoolApplicationId: string | null;
  readonly admissionCaseId: string | null;
  readonly admissionOutcomeKind: Student500OutcomeKind | null;
  readonly admissionOutcomeVersion: number | null;
  readonly admissionOutcomeProvenance: Student500OutcomeProvenance | null;
  readonly admissionOutcomeVerified: boolean | null;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly updatedByUserId: string;
};

export type Student500GsDraftRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly applicationId: string;
  readonly version: number;
  readonly origin: "deterministic_starter" | "customer_edit";
  readonly sections: readonly {
    readonly sectionKey: string;
    readonly heading: string;
    readonly text: string;
    readonly source: "authorized_fact" | "customer_text" | "missing";
    readonly factReferenceIds: readonly string[];
    readonly missingInformation: readonly string[];
  }[];
  readonly sectionCount: number;
  readonly contentSha256: string;
  readonly inputDigest: string;
  readonly sourceFactReferenceIds: readonly string[];
  readonly supersedesDraftId: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
};

export type Student500PreparationSnapshotRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly applicationId: string;
  readonly version: number;
  readonly applicationRevision: number;
  readonly content: unknown;
  readonly contentSha256: string;
  readonly inputDigest: string;
  readonly gsDraftId: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
};

/** One bounded, authorized M2 fact candidate. Never a raw projection row. */
export type Student500FactCandidate = {
  readonly factAssertionId: string;
  readonly version: number;
  readonly key: string;
  readonly originKind: string;
  readonly state: string;
  /** Bounded display value; never a nested document or raw JSON blob. */
  readonly valueDisplay: string;
  readonly customerConfirmed: boolean;
  readonly aiUseAuthorized: boolean;
  readonly authorizedAudience: "none" | "actor_only" | "project";
  readonly authorizationActorUserId: string | null;
  readonly stale: boolean;
  /** Currently in an unresolved visible conflict. */
  readonly conflicted: boolean;
  readonly sourceEvidenceRef: string | null;
};

/**
 * The M2 evidence boundary. `unavailable` is a first-class answer: when the
 * projection cannot be read (feature gate, schema, authorization) the preparation
 * reports an honest gap instead of assuming anything.
 */
export type Student500FactContextPort = {
  list(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<
    | {
        readonly status: "available";
        readonly facts: readonly Student500FactCandidate[];
      }
    | { readonly status: "unavailable"; readonly reason: string }
  >;
};

/** Read-only M5.2 admission lookup; never mutates or creates a case. */
export type Student500AdmissionLinkResolver = {
  resolve(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly caseId: string;
  }): Promise<
    | {
        readonly status: "resolved";
        readonly originKind: string;
        readonly revision: number;
        readonly offer: {
          readonly kind: "offer";
          readonly version: number;
          readonly provenance: string;
          readonly independentlyVerified: boolean;
          readonly superseded: boolean;
        } | null;
        readonly coe: {
          readonly kind: "coe";
          readonly version: number;
          readonly provenance: string;
          readonly independentlyVerified: boolean;
          readonly superseded: boolean;
        } | null;
      }
    | { readonly status: "not_found" }
    | { readonly status: "forbidden" }
  >;
};

export type Student500PreparationOperationStamp = {
  readonly actorUserId: string;
  readonly operationId: string;
  readonly operationType: Student500PreparationOperationType;
  readonly requestSha256: string;
  readonly resultKind: Student500PreparationResultKind;
};

export type Student500PreparationWriteResult<T> = {
  readonly replayed: boolean;
  readonly value: T;
};

export type Student500PreparationOperationLookup =
  | { readonly status: "absent" }
  | { readonly status: "conflict" }
  | {
      readonly status: "replay";
      readonly resultId: string;
      readonly resultKind: Student500PreparationResultKind;
    };

export type NewSchoolContextValues = {
  readonly kind: Student500SchoolContextKind;
  readonly studyEvidenceKind: Student500StudyEvidenceKind;
  readonly schoolApplicationId: string | null;
  readonly admissionCaseId: string | null;
  readonly admissionOutcomeKind: Student500OutcomeKind | null;
  readonly admissionOutcomeVersion: number | null;
  readonly admissionOutcomeProvenance: Student500OutcomeProvenance | null;
  readonly admissionOutcomeVerified: boolean | null;
};

export type NewGsDraftValues = {
  readonly origin: "deterministic_starter" | "customer_edit";
  readonly sections: Student500GsDraftRecord["sections"];
  readonly contentSha256: string;
  readonly inputDigest: string;
  readonly sourceFactReferenceIds: readonly string[];
  readonly supersedesDraftId: string | null;
  /** Optimistic concurrency: the version this edit was based on. */
  readonly expectedPreviousVersion: number | null;
};

export type NewPreparationSnapshotValues = {
  readonly applicationRevision: number;
  readonly content: unknown;
  readonly contentSha256: string;
  readonly inputDigest: string;
  readonly gsDraftId: string | null;
};

export type Student500PreparationStore = {
  findOperation(
    input: Student500PreparationOperationStamp
  ): Promise<Student500PreparationOperationLookup>;

  listFactReferences(input: {
    readonly applicationId: string;
  }): Promise<readonly Student500FactReferenceRecord[]>;

  insertFactReference(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly factAssertionId: string;
    readonly factVersion: number;
    readonly factKey: string;
    readonly originKind: string;
    readonly stateAtUse: string;
    readonly aiUseAuthorizedAtSelection: boolean;
    readonly authorizationAudience: "none" | "actor_only" | "project";
    readonly authorizationActorUserId: string | null;
    readonly sourceEvidenceRef: string | null;
    readonly createdByUserId: string;
    readonly operation: Student500PreparationOperationStamp;
  }): Promise<Student500PreparationWriteResult<Student500FactReferenceRecord>>;

  revokeFactReference(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly factReferenceId: string;
    readonly actorUserId: string;
    readonly operation: Student500PreparationOperationStamp;
  }): Promise<Student500PreparationWriteResult<Student500FactReferenceRecord>>;

  getSchoolContext(input: {
    readonly applicationId: string;
  }): Promise<Student500SchoolContextRecord | null>;

  putSchoolContext(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly expectedRevision: number | null;
    readonly values: NewSchoolContextValues;
    readonly actorUserId: string;
    readonly operation: Student500PreparationOperationStamp;
  }): Promise<Student500PreparationWriteResult<Student500SchoolContextRecord>>;

  listDrafts(input: {
    readonly applicationId: string;
  }): Promise<readonly Student500GsDraftRecord[]>;

  getDraft(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly draftId: string;
  }): Promise<Student500GsDraftRecord | null>;

  insertDraft(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly values: NewGsDraftValues;
    readonly actorUserId: string;
    readonly operation: Student500PreparationOperationStamp;
  }): Promise<Student500PreparationWriteResult<Student500GsDraftRecord>>;

  listSnapshots(input: {
    readonly applicationId: string;
  }): Promise<readonly Student500PreparationSnapshotRecord[]>;

  getSnapshot(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly snapshotId: string;
  }): Promise<Student500PreparationSnapshotRecord | null>;

  insertSnapshot(input: {
    readonly projectId: string;
    readonly applicationId: string;
    readonly values: NewPreparationSnapshotValues;
    readonly actorUserId: string;
    readonly operation: Student500PreparationOperationStamp;
  }): Promise<
    Student500PreparationWriteResult<Student500PreparationSnapshotRecord>
  >;

  countFactReferences(input: {
    readonly applicationId: string;
  }): Promise<number>;

  countDrafts(input: { readonly applicationId: string }): Promise<number>;

  countSnapshots(input: { readonly applicationId: string }): Promise<number>;
};

export type Student500RequirementCoverageInput = {
  readonly requirementKey: Student500RequirementKey;
};
