import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import type {
  SubmissionConfirmationType,
  SubmissionIndicatorKind,
  SubmissionPackageStatus,
  SubmissionStaleReason,
} from "./contracts";

/**
 * Phase 13 M8.1 - injected ports.
 *
 * The service owns authorization, manifest identity, exact-version confirmation and
 * freshness. Adapters own persistence and the two upstream target reads. No port may
 * return document bodies, fact values, chat content or M4 protected material: a
 * package is identities, digests, status indicators and disclosures.
 */

export type SubmissionMembershipStatus =
  | "owner"
  | "active_member"
  | "pending"
  | "revoked"
  | "missing";

/**
 * Server-derived actor context. `staff` is true for any non-customer account; such
 * an actor is never granted private application access by participation alone.
 */
export type SubmissionActorContext = {
  readonly registeredCustomer: boolean;
  readonly staff: boolean;
  readonly project: {
    readonly id: string;
    readonly ownerUserId: string;
    readonly status: "active" | "closed";
  } | null;
  readonly membershipStatus: SubmissionMembershipStatus;
};

/** One fact reference identity. Values are deliberately absent. */
export type SubmissionFactReferenceIdentity = {
  readonly factReferenceId: string;
  readonly factAssertionId: string;
  readonly factVersion: number;
  readonly factKey: string;
};

export type SubmissionGsDraftIdentity = {
  readonly draftId: string;
  readonly version: number;
  readonly contentSha256: string;
  readonly sectionKeys: readonly string[];
  readonly sectionHeadings: readonly string[];
  readonly missingInformation: readonly string[];
  readonly redactedSectionCount: number;
};

export type SubmissionPreparationSnapshotIdentity = {
  readonly snapshotId: string;
  readonly version: number;
  readonly contentSha256: string;
  readonly legalSourceRevision: string | null;
};

export type SubmissionSchoolPackageIdentity = {
  readonly packageId: string;
  readonly version: number;
  readonly contentSha256: string;
  readonly targetBindingSha256: string;
  readonly usable: boolean;
};

/**
 * The dependency identity set a frozen package is bound to. Staleness is a pure
 * comparison between this frozen set and the current one.
 */
export type SubmissionDependencies = {
  readonly applicationRevision: number;
  readonly applicationStatus: string;
  readonly gsDraft: SubmissionGsDraftIdentity | null;
  readonly preparationSnapshot: SubmissionPreparationSnapshotIdentity | null;
  readonly factReferences: readonly SubmissionFactReferenceIdentity[];
  readonly legalSourceRevision: string | null;
  readonly schoolPackage: SubmissionSchoolPackageIdentity | null;
  readonly sourceAvailability:
    | "available"
    | "partially_unavailable"
    | "unavailable";
};

/** Customer-visible, non-sensitive summary content frozen into the manifest. */
export type SubmissionTargetContent = {
  readonly title: string;
  readonly targetLabel: string;
  readonly applicationStatus: string;
  readonly applicationRevision: number;
  readonly school: {
    readonly institutionName: string;
    readonly courseTitle: string;
    readonly intakeLabel: string | null;
    readonly sourceStatus: string;
    readonly catalogRecordClass: string | null;
    readonly referenceCount: number;
  } | null;
  readonly student500: {
    readonly applicationPlace: string;
    readonly entryRoute: string | null;
    readonly coeStatus: string;
    readonly gsDraft: SubmissionGsDraftIdentity | null;
    readonly preparationSnapshot: SubmissionPreparationSnapshotIdentity | null;
    readonly coverage: {
      readonly covered: number;
      readonly missing: number;
      readonly conflicted: number;
      readonly humanReviewRequired: number;
    };
    readonly factReferenceCount: number;
  } | null;
};

export type SubmissionIndicator = {
  readonly kind: SubmissionIndicatorKind;
  readonly code: string;
};

/** One reconstructed review block: labelled lines the customer can actually read. */
export type SubmissionReviewSection = {
  readonly key: string;
  readonly heading: string;
  readonly lines: readonly {
    readonly label: string;
    readonly value: string;
  }[];
};

/** The exact pinned GS draft version, reconstructed under current authorization. */
export type SubmissionGsDraftReview = {
  readonly draftId: string;
  readonly version: number;
  readonly contentSha256: string;
  readonly sections: readonly {
    readonly sectionKey: string;
    readonly heading: string;
    readonly text: string;
    readonly missingInformation: readonly string[];
  }[];
};

/**
 * The customer-visible content being confirmed.
 *
 * It is always reconstructed from the *pinned* immutable upstream version the frozen
 * manifest names - never from a later "latest" artifact - and only while the current
 * actor may still read every part of it. `null` means the exact content cannot be
 * reconstructed under current authorization, in which case confirmation fails closed.
 */
export type SubmissionReview = {
  readonly source: "pinned_gs_draft_version" | "pinned_school_package_version";
  readonly title: string;
  readonly sections: readonly SubmissionReviewSection[];
  readonly gsDraft: SubmissionGsDraftReview | null;
};

/**
 * A read-time snapshot of the upstream target. `readTarget` always re-reads live
 * state through the owning M5.1/M6.2 service, so a frozen row is never trusted as
 * proof that its sources are still current or still visible to this actor.
 */
export type SubmissionTargetState = {
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly targetVersion: number;
  readonly archived: boolean;
  readonly content: SubmissionTargetContent;
  readonly dependencies: SubmissionDependencies;
  readonly indicators: readonly SubmissionIndicator[];
  /** `null` when the pinned content is not fully readable for this actor. */
  readonly review: SubmissionReview | null;
  readonly reviewUnavailableReason: SubmissionStaleReason | null;
};

export type SubmissionPackageRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly version: number;
  readonly status: SubmissionPackageStatus;
  readonly schemaVersion: string;
  readonly manifest: unknown;
  readonly manifestSha256: string;
  readonly dependencySha256: string;
  readonly statementPolicyVersion: string;
  readonly createdByUserId: string;
  readonly operationId: string;
  readonly requestSha256: string;
  readonly createdAt: Date;
};

export type SubmissionConfirmationRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly manifestSha256: string;
  readonly targetVersion: number;
  readonly confirmationType: SubmissionConfirmationType;
  readonly statementPolicyVersion: string;
  readonly actorUserId: string;
  readonly operationId: string;
  readonly requestSha256: string;
  readonly confirmedAt: Date;
};

/** Append-only audit evidence that a confirmation stopped being current. */
/**
 * Proof that a confirmation completed its mandatory post-write validation.
 *
 * The row is append-only and insert-once. A confirmation without one is never
 * current, which is exactly the fail-closed state after an interrupted
 * insert -> recheck -> finalize sequence.
 */
export type SubmissionFinalizationRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly confirmationId: string;
  readonly packageVersionId: string;
  readonly validatedDependencySha256: string;
  readonly validatedAt: Date;
  readonly validatedByUserId: string;
};

export type SubmissionInvalidationRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly confirmationId: string;
  readonly packageVersionId: string;
  readonly dependencySha256: string;
  readonly reasonCodes: readonly SubmissionStaleReason[];
  readonly detectedAt: Date;
  readonly detectedByUserId: string;
};

export type SubmissionOperationStamp = {
  readonly actorUserId: string;
  readonly operationId: string;
  readonly requestSha256: string;
};

/**
 * What must still hold *inside* the durable write transaction.
 *
 * Authorization is re-derived from persisted rows at commit time, so a membership
 * revocation or Project closure between the preliminary read and the write cannot
 * produce a successful invalid confirmation.
 */
export type SubmissionWriteGuard = {
  readonly actorUserId: string;
  readonly requireActiveProject: boolean;
};

export type SubmissionWriteResult<T> = {
  readonly replayed: boolean;
  readonly value: T;
};

export type NewSubmissionPackageValues = {
  readonly id: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly version: number;
  readonly schemaVersion: string;
  readonly manifest: unknown;
  readonly manifestSha256: string;
  readonly dependencySha256: string;
  readonly statementPolicyVersion: string;
};

export type NewSubmissionConfirmationValues = {
  readonly id: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly manifestSha256: string;
  readonly targetVersion: number;
  readonly confirmationType: SubmissionConfirmationType;
  readonly statementPolicyVersion: string;
};

export type SubmissionPackageStore = {
  readActorContext(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<SubmissionActorContext>;

  listPackages(input: {
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
  }): Promise<readonly SubmissionPackageRecord[]>;

  getPackage(input: {
    readonly projectId: string;
    readonly packageVersionId: string;
  }): Promise<SubmissionPackageRecord | null>;

  findPackageOperation(input: {
    readonly projectId: string;
    readonly operationId: string;
  }): Promise<SubmissionPackageRecord | null>;

  countPackages(input: {
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
  }): Promise<number>;

  /** Allocates the next version under a Project lock and inserts insert-once. */
  insertPackage(input: {
    readonly projectId: string;
    readonly values: NewSubmissionPackageValues;
    readonly operation: SubmissionOperationStamp;
    readonly guard: SubmissionWriteGuard;
  }): Promise<SubmissionWriteResult<SubmissionPackageRecord>>;

  listConfirmations(input: {
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
  }): Promise<readonly SubmissionConfirmationRecord[]>;

  getConfirmation(input: {
    readonly projectId: string;
    readonly packageVersionId: string;
    readonly confirmationType: SubmissionConfirmationType;
  }): Promise<SubmissionConfirmationRecord | null>;

  findConfirmationOperation(input: {
    readonly projectId: string;
    readonly operationId: string;
  }): Promise<SubmissionConfirmationRecord | null>;

  insertConfirmation(input: {
    readonly projectId: string;
    readonly values: NewSubmissionConfirmationValues;
    readonly operation: SubmissionOperationStamp;
    readonly guard: SubmissionWriteGuard;
  }): Promise<SubmissionWriteResult<SubmissionConfirmationRecord>>;

  listInvalidations(input: {
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
  }): Promise<readonly SubmissionInvalidationRecord[]>;

  /** Record the completed validation. Insert-once; never updated. */
  recordFinalization(input: {
    readonly id: string;
    readonly projectId: string;
    readonly confirmationId: string;
    readonly packageVersionId: string;
    readonly validatedDependencySha256: string;
    readonly validatedByUserId: string;
  }): Promise<SubmissionFinalizationRecord>;

  listFinalizations(input: {
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
  }): Promise<readonly SubmissionFinalizationRecord[]>;

  /** Newest immutable version number for one target (0 when none exists). */
  latestVersion(input: {
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
  }): Promise<number>;

  /** Insert-once per (confirmationId, dependencySha256); never updates history. */
  recordInvalidation(input: {
    readonly id: string;
    readonly projectId: string;
    readonly confirmationId: string;
    readonly packageVersionId: string;
    readonly dependencySha256: string;
    readonly reasonCodes: readonly SubmissionStaleReason[];
    readonly detectedByUserId: string;
  }): Promise<void>;
};

/** Reads live upstream target state through the owning M5.1/M6.2 service. */
export type SubmissionTargetReader = (input: {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
}) => Promise<SubmissionTargetState>;
