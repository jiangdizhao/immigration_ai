import type {
  BuiltSchoolApplicationPackage,
  SchoolApplicationCatalogRecordClass,
  SchoolApplicationOperationResultKind,
  SchoolApplicationOperationType,
  SchoolApplicationPackageStatus,
  SchoolApplicationReferenceKind,
  SchoolApplicationSourceStatus,
  SchoolApplicationStatus,
  SchoolCatalogResolution,
} from "./contracts";

/**
 * Phase 13 M5.1 — injected ports for the School Application service.
 *
 * The service owns authorization, validation, package identity and staleness.
 * Adapters own persistence and existing M1/M2/M3 lookups. No adapter may return
 * document bodies, fact values, chat content or M4 protected resources: a
 * reference is an identity plus a fingerprint, never a disclosure.
 */

export type SchoolApplicationRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly status: SchoolApplicationStatus;
  readonly revision: number;
  readonly institutionName: string;
  readonly institutionId: string | null;
  readonly courseTitle: string;
  readonly courseId: string | null;
  readonly deliveryId: string | null;
  readonly intakeId: string | null;
  readonly intakeLabel: string | null;
  readonly sourceStatus: SchoolApplicationSourceStatus;
  readonly catalogRecordClass: SchoolApplicationCatalogRecordClass | null;
  readonly catalogSnapshotToken: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
};

export type SchoolApplicationReferenceRecord = {
  readonly id: string;
  readonly applicationId: string;
  readonly projectId: string;
  readonly kind: SchoolApplicationReferenceKind;
  readonly referenceId: string;
  readonly referenceVersion: number;
  readonly referenceSha256: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
};

export type SchoolApplicationPackageRecord = {
  readonly id: string;
  readonly applicationId: string;
  readonly projectId: string;
  readonly version: number;
  readonly status: SchoolApplicationPackageStatus;
  readonly schemaVersion: string;
  readonly contentSha256: string;
  readonly inputsSha256: string;
  readonly targetKind: string;
  readonly targetId: string;
  readonly targetVersion: number;
  readonly targetSha256: string;
  readonly targetBindingSha256: string;
  readonly snapshot: unknown;
  readonly createdByUserId: string;
  readonly operationId: string;
  readonly requestSha256: string;
  readonly createdAt: Date;
};

export type SchoolApplicationEventRecord = {
  readonly id: string;
  readonly applicationId: string;
  readonly projectId: string;
  readonly actorUserId: string;
  readonly eventType: string;
  readonly subjectKind: string;
  readonly subjectId: string;
  readonly applicationRevision: number;
  readonly createdAt: Date;
};

export type SchoolApplicationMembershipStatus =
  | "owner"
  | "active_member"
  | "pending"
  | "revoked"
  | "missing";

/**
 * Server-derived actor context. `staff` is true for any non-customer account
 * (lawyer/admin/service); such an actor is never granted private application
 * access by participation or assignment alone.
 */
export type SchoolApplicationActorContext = {
  readonly registeredCustomer: boolean;
  readonly staff: boolean;
  readonly project: {
    readonly id: string;
    readonly ownerUserId: string;
    readonly status: "active" | "closed";
  } | null;
  readonly membershipStatus: SchoolApplicationMembershipStatus;
};

export type SchoolApplicationOperationStamp = {
  readonly actorUserId: string;
  readonly operationId: string;
  readonly operationType: SchoolApplicationOperationType;
  readonly requestSha256: string;
};

export type SchoolApplicationWriteResult<T> = {
  readonly replayed: boolean;
  readonly value: T;
};

export type NewSchoolApplicationValues = {
  readonly ownerUserId: string;
  readonly institutionName: string;
  readonly institutionId: string | null;
  readonly courseTitle: string;
  readonly courseId: string | null;
  readonly deliveryId: string | null;
  readonly intakeId: string | null;
  readonly intakeLabel: string | null;
  readonly sourceStatus: SchoolApplicationSourceStatus;
  readonly catalogRecordClass: SchoolApplicationCatalogRecordClass | null;
  readonly catalogSnapshotToken: string | null;
};

export type SchoolApplicationStore = {
  readActorContext(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<SchoolApplicationActorContext>;

  /**
   * Read-only operation lookup for exact-replay resolution. It must never write,
   * and it must never widen authority: the service still authorizes the actor,
   * the Project/membership and the application ownership before using it.
   */
  findOperation(input: {
    readonly actorUserId: string;
    readonly operationId: string;
    readonly operationType: SchoolApplicationOperationType;
    readonly requestSha256: string;
  }): Promise<SchoolApplicationOperationLookup>;

  listApplications(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
  }): Promise<readonly SchoolApplicationRecord[]>;

  getApplication(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly applicationId: string;
  }): Promise<SchoolApplicationRecord | null>;

  listReferences(input: {
    readonly applicationId: string;
  }): Promise<readonly SchoolApplicationReferenceRecord[]>;

  listPackages(input: {
    readonly applicationId: string;
  }): Promise<readonly SchoolApplicationPackageRecord[]>;

  listEvents(input: {
    readonly applicationId: string;
  }): Promise<readonly SchoolApplicationEventRecord[]>;

  countApplications(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
  }): Promise<number>;

  createApplication(input: {
    readonly projectId: string;
    readonly values: NewSchoolApplicationValues;
    readonly operation: SchoolApplicationOperationStamp;
  }): Promise<SchoolApplicationWriteResult<SchoolApplicationRecord>>;

  updateApplication(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly applicationId: string;
    readonly expectedRevision: number;
    readonly values: NewSchoolApplicationValues;
    readonly operation: SchoolApplicationOperationStamp;
  }): Promise<SchoolApplicationWriteResult<SchoolApplicationRecord>>;

  archiveApplication(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly applicationId: string;
    readonly expectedRevision: number;
    readonly operation: SchoolApplicationOperationStamp;
  }): Promise<SchoolApplicationWriteResult<SchoolApplicationRecord>>;

  bindReference(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly applicationId: string;
    readonly expectedRevision: number;
    readonly kind: SchoolApplicationReferenceKind;
    readonly referenceId: string;
    readonly referenceVersion: number;
    readonly referenceSha256: string;
    readonly operation: SchoolApplicationOperationStamp;
  }): Promise<SchoolApplicationWriteResult<SchoolApplicationReferenceRecord>>;

  revokeReference(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly applicationId: string;
    readonly referenceRecordId: string;
    readonly expectedRevision: number;
    readonly operation: SchoolApplicationOperationStamp;
  }): Promise<SchoolApplicationWriteResult<SchoolApplicationReferenceRecord>>;

  buildPackage(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly applicationId: string;
    readonly expectedRevision: number;
    readonly package: BuiltSchoolApplicationPackage;
    /**
     * Current resolved fingerprints of the references captured by the package.
     * The store refreshes the bound columns in the same transaction so the
     * recorded reference identity always matches the immutable package.
     */
    readonly references: readonly {
      readonly referenceRecordId: string;
      readonly referenceVersion: number;
      readonly referenceSha256: string;
    }[];
    readonly operation: SchoolApplicationOperationStamp;
  }): Promise<SchoolApplicationWriteResult<SchoolApplicationPackageRecord>>;
};

export type SchoolApplicationOperationOutcome = {
  readonly resultId: string;
  readonly resultKind: SchoolApplicationOperationResultKind;
  readonly replayed: boolean;
};

/**
 * Read-only view of a previously recorded operation, used by the service to
 * resolve an exact retry *before* applying state preconditions that a successful
 * first attempt has already invalidated (for example: an archived application is
 * terminal, and a revoked reference is no longer active).
 *
 * `conflict` means the same `(actorUserId, operationId)` was used for a
 * materially different request and must be rejected as an idempotency conflict.
 */
export type SchoolApplicationOperationLookup =
  | { readonly status: "absent" }
  | { readonly status: "conflict" }
  | {
      readonly status: "replay";
      readonly resultId: string;
      readonly resultKind: SchoolApplicationOperationResultKind;
    };

/**
 * M2 reference resolution. Implementations must apply the caller's own Project
 * authorization and M2 ownership rules, and must never return source text.
 */
export type SchoolApplicationReferenceResolution =
  | {
      readonly status: "resolved";
      readonly referenceVersion: number;
      readonly referenceSha256: string;
    }
  | { readonly status: "not_found" }
  | { readonly status: "forbidden" };

export type SchoolApplicationReferenceResolver = {
  resolve(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly kind: SchoolApplicationReferenceKind;
    readonly referenceId: string;
  }): Promise<SchoolApplicationReferenceResolution>;
};

/** M3 catalog resolution. Only M3 record classes may be returned. */
export type SchoolApplicationCatalogResolver = {
  resolve(input: {
    readonly institutionId: string | null;
    readonly courseId: string | null;
    readonly deliveryId: string | null;
    readonly intakeId: string | null;
  }): Promise<SchoolCatalogResolution>;
};
