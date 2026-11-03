import type {
  Student500ApplicationStatus,
  Student500Context,
  Student500OperationResultKind,
  Student500OperationType,
} from "./contracts";

/**
 * Phase 13 M6.1 - injected ports for the Student 500 service.
 *
 * The service owns authorization, validation, screening composition and
 * lifecycle. Adapters own persistence and existing M5.1 lookups. No adapter may
 * return document bodies, fact values, chat content or M4 protected resources: a
 * school-application link is an identity plus a status, never a disclosure.
 */

export type Student500ApplicationRecord = {
  readonly id: string;
  readonly projectId: string;
  /** Immutable creator (mutable ownership is not representable). */
  readonly ownerUserId: string;
  /**
   * The person the preparation is for. M6.1 has no delegation flow, so the store
   * requires this to equal `ownerUserId`; the column exists to keep the
   * customer/applicant separation explicit for a future authorized flow.
   */
  readonly applicantUserId: string;
  readonly status: Student500ApplicationStatus;
  readonly revision: number;
  readonly context: Student500Context;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
};

export type Student500EventRecord = {
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

export type Student500MembershipStatus =
  | "owner"
  | "active_member"
  | "pending"
  | "revoked"
  | "missing";

/**
 * Server-derived actor context. `staff` is true for any non-customer account
 * (lawyer/admin/service); such an actor is never granted private preparation
 * access by participation or assignment alone.
 */
export type Student500ActorContext = {
  readonly registeredCustomer: boolean;
  readonly staff: boolean;
  readonly project: {
    readonly id: string;
    readonly ownerUserId: string;
    readonly status: "active" | "closed";
  } | null;
  readonly membershipStatus: Student500MembershipStatus;
};

export type Student500OperationStamp = {
  readonly actorUserId: string;
  readonly operationId: string;
  readonly operationType: Student500OperationType;
  readonly requestSha256: string;
};

export type Student500WriteResult<T> = {
  readonly replayed: boolean;
  readonly value: T;
};

export type NewStudent500ApplicationValues = {
  readonly ownerUserId: string;
  readonly applicantUserId: string;
  readonly context: Student500Context;
};

export type Student500OperationLookup =
  | { readonly status: "absent" }
  | { readonly status: "conflict" }
  | {
      readonly status: "replay";
      readonly resultId: string;
      readonly resultKind: Student500OperationResultKind;
    };

export type Student500ApplicationStore = {
  readActorContext(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<Student500ActorContext>;

  /**
   * Read-only operation lookup for exact-replay resolution. It must never write
   * and must never widen authority: the service still authorizes the actor, the
   * Project/membership and the application ownership first.
   */
  findOperation(input: {
    readonly actorUserId: string;
    readonly operationId: string;
    readonly operationType: Student500OperationType;
    readonly requestSha256: string;
  }): Promise<Student500OperationLookup>;

  listApplications(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
  }): Promise<readonly Student500ApplicationRecord[]>;

  getApplication(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly applicationId: string;
  }): Promise<Student500ApplicationRecord | null>;

  listEvents(input: {
    readonly applicationId: string;
  }): Promise<readonly Student500EventRecord[]>;

  countApplications(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
  }): Promise<number>;

  createApplication(input: {
    readonly projectId: string;
    readonly values: NewStudent500ApplicationValues;
    readonly operation: Student500OperationStamp;
  }): Promise<Student500WriteResult<Student500ApplicationRecord>>;

  updateApplication(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly applicationId: string;
    readonly expectedRevision: number;
    readonly values: NewStudent500ApplicationValues;
    readonly operation: Student500OperationStamp;
  }): Promise<Student500WriteResult<Student500ApplicationRecord>>;

  archiveApplication(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly applicationId: string;
    readonly expectedRevision: number;
    readonly operation: Student500OperationStamp;
  }): Promise<Student500WriteResult<Student500ApplicationRecord>>;
};
