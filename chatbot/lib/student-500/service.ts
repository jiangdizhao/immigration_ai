import {
  isStudent500Uuid,
  normalizeStudent500Context,
  type Student500ApplicationStatus,
  type Student500Context,
  type Student500ContextInput,
  Student500Error,
  type Student500RequestIdentity,
  student500RequestSha256,
  validateStudent500OperationId,
  validateStudent500Revision,
} from "./contracts";
import type {
  Student500ActorContext,
  Student500ApplicationRecord,
  Student500ApplicationStore,
  Student500EventRecord,
} from "./ports";
import type {
  Student500LinkedSchoolApplication,
  Student500RequirementResolver,
  Student500Screening,
} from "./requirement-resolver";

/**
 * Phase 13 M6.1 - Student 500 application service.
 *
 * Owns: server-derived authorization, request identity/idempotency, CAS, Project
 * closure, archive terminality, the bounded per-Project limit, M5.1
 * school-application link re-authorization, and composition of the preliminary
 * legal screening.
 *
 * Does NOT own: persistence (store), legal-source declarations (provider), or
 * customer copy. Every legal statement in the output comes from the resolver and
 * carries its own source-verification state.
 */

export type Student500ApplicationView = {
  readonly applicationId: string;
  readonly projectId: string;
  readonly status: Student500ApplicationStatus;
  readonly revision: number;
  readonly context: Student500Context;
  readonly screening: Student500Screening;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
};

export type Student500ApplicationDetailView = Student500ApplicationView & {
  readonly events: readonly {
    readonly eventType: string;
    readonly subjectKind: string;
    readonly subjectId: string;
    readonly applicationRevision: number;
    readonly createdAt: string;
  }[];
};

export type Student500SchoolApplicationLinkResolver = {
  resolve(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string;
  }): Promise<
    | {
        readonly status: "resolved";
        readonly applicationStatus: string;
        readonly sourceStatus: string;
      }
    | { readonly status: "not_found" }
    | { readonly status: "forbidden" }
  >;
};

export type Student500ServiceOptions = {
  readonly store: Student500ApplicationStore;
  readonly resolver: Student500RequirementResolver;
  /** Optional: resolves the linked M5.1 school application, re-authorized. */
  readonly schoolApplicationLink?: Student500SchoolApplicationLinkResolver;
};

function toIso(value: Date): string {
  return value.toISOString();
}

export function createStudent500Service(options: Student500ServiceOptions) {
  const { store, resolver, schoolApplicationLink } = options;

  /**
   * Server-derived authorization. Project and actor identity always come from the
   * authenticated session; nothing in a payload can widen them.
   */
  async function authorize(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<Student500ActorContext> {
    if (
      !(
        isStudent500Uuid(input.actorUserId) && isStudent500Uuid(input.projectId)
      )
    ) {
      throw new Student500Error("invalid_request");
    }
    const context = await store.readActorContext({ ...input });
    if (context.staff || !context.registeredCustomer) {
      throw new Student500Error("actor_not_eligible");
    }
    if (!context.project) {
      throw new Student500Error("project_not_found");
    }
    const authorized =
      context.project.ownerUserId === input.actorUserId ||
      context.membershipStatus === "active_member";
    if (!authorized) {
      throw new Student500Error("project_forbidden");
    }
    return context;
  }

  function assertWritable(context: Student500ActorContext) {
    if (context.project?.status !== "active") {
      throw new Student500Error("project_closed");
    }
  }

  async function requireApplication(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string;
  }): Promise<Student500ApplicationRecord> {
    if (!isStudent500Uuid(input.applicationId)) {
      throw new Student500Error("application_not_found");
    }
    const application = await store.getApplication({
      applicationId: input.applicationId,
      ownerUserId: input.actorUserId,
      projectId: input.projectId,
    });
    if (!application) {
      // Existence-hiding: another member's, another Project's or a staff-owned
      // application is indistinguishable from a missing one.
      throw new Student500Error("application_not_found");
    }
    return application;
  }

  /**
   * Re-authorizes a linked M5.1 school application and returns only its identity
   * and status. A link that no longer resolves is reported as unavailable and
   * never silently dropped from the screening.
   */
  async function resolveLink(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly context: Student500Context;
  }): Promise<Student500LinkedSchoolApplication | null> {
    const schoolApplicationId = input.context.schoolApplicationId;
    if (!schoolApplicationId) {
      return null;
    }
    if (!schoolApplicationLink) {
      return {
        available: false,
        schoolApplicationId,
        sourceStatus: "unknown",
        status: "unavailable",
      };
    }
    const resolution = await schoolApplicationLink.resolve({
      actorUserId: input.actorUserId,
      applicationId: schoolApplicationId,
      projectId: input.projectId,
    });
    if (resolution.status === "resolved") {
      return {
        available: true,
        schoolApplicationId,
        sourceStatus: resolution.sourceStatus,
        status: resolution.applicationStatus,
      };
    }
    return {
      available: false,
      schoolApplicationId,
      sourceStatus: "unknown",
      status: resolution.status === "forbidden" ? "forbidden" : "not_found",
    };
  }

  /**
   * Operation stamp. `requestSha256` derives from the authored request identity
   * only, so an exact retry matches the recorded operation even after the
   * revision advanced.
   */
  function operationStamp(input: {
    readonly actorUserId: string;
    readonly identity: Student500RequestIdentity;
    readonly operationId: string;
  }): {
    actorUserId: string;
    operationId: string;
    operationType: Student500RequestIdentity["operationType"];
    requestSha256: string;
  } {
    return {
      actorUserId: input.actorUserId,
      operationId: validateStudent500OperationId(input.operationId),
      operationType: input.identity.operationType,
      requestSha256: student500RequestSha256(input.identity),
    };
  }

  async function buildView(
    input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly application: Student500ApplicationRecord;
    },
    events?: readonly Student500EventRecord[]
  ): Promise<Student500ApplicationDetailView> {
    const linkedSchoolApplication = await resolveLink({
      actorUserId: input.actorUserId,
      context: input.application.context,
      projectId: input.projectId,
    });
    const screening = await resolver.resolve({
      context: input.application.context,
      linkedSchoolApplication,
    });
    const view: Student500ApplicationView = {
      applicationId: input.application.id,
      archivedAt: input.application.archivedAt
        ? toIso(input.application.archivedAt)
        : null,
      context: input.application.context,
      createdAt: toIso(input.application.createdAt),
      projectId: input.application.projectId,
      revision: input.application.revision,
      screening,
      status: input.application.status,
      updatedAt: toIso(input.application.updatedAt),
    };
    return {
      ...view,
      events: (events ?? []).map((event) => ({
        applicationRevision: event.applicationRevision,
        createdAt: toIso(event.createdAt),
        eventType: event.eventType,
        subjectId: event.subjectId,
        subjectKind: event.subjectKind,
      })),
    };
  }

  /**
   * Exact-replay resolution that runs before state preconditions: a successful
   * archive makes the application terminal, so the recorded operation is
   * consulted first. Authorization has already run, so idempotency can never
   * bypass a revoked membership or a foreign application.
   */
  async function replayRecorded(input: {
    readonly actorUserId: string;
    readonly application: Student500ApplicationRecord | null;
    readonly identity: Student500RequestIdentity;
    readonly operationId: string;
    readonly projectId: string;
  }): Promise<Student500ApplicationDetailView | null> {
    const lookups = await store.findOperation({
      ...operationStamp({
        actorUserId: input.actorUserId,
        identity: input.identity,
        operationId: input.operationId,
      }),
    });
    if (lookups.status === "absent") {
      return null;
    }
    if (lookups.status === "conflict") {
      throw new Student500Error("idempotency_conflict");
    }
    const application =
      input.application ??
      (await store.getApplication({
        applicationId: lookups.resultId,
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
      }));
    if (!application) {
      throw new Student500Error("application_not_found");
    }
    const events = await store.listEvents({ applicationId: application.id });
    return await buildView(
      {
        actorUserId: input.actorUserId,
        application,
        projectId: input.projectId,
      },
      events
    );
  }

  /**
   * A linked school application must be re-authorized for this actor and Project
   * before it can be recorded, so a foreign or stale link can never be saved and
   * then presented as connected evidence.
   */
  async function assertLinkAuthorized(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly context: Student500Context;
  }): Promise<void> {
    if (!input.context.schoolApplicationId) {
      return;
    }
    const linked = await resolveLink(input);
    if (!linked?.available) {
      throw new Student500Error(
        linked?.status === "forbidden"
          ? "reference_invalid"
          : "reference_unavailable"
      );
    }
  }

  return {
    /** Customer-visible list of the actor's own Student 500 applications. */
    async list(input: {
      readonly actorUserId: string;
      readonly projectId: string;
    }): Promise<readonly Student500ApplicationView[]> {
      await authorize(input);
      const applications = await store.listApplications({
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
      });
      const views: Student500ApplicationView[] = [];
      for (const application of applications) {
        const detail = await buildView({
          actorUserId: input.actorUserId,
          application,
          projectId: input.projectId,
        });
        views.push({
          applicationId: detail.applicationId,
          archivedAt: detail.archivedAt,
          context: detail.context,
          createdAt: detail.createdAt,
          projectId: detail.projectId,
          revision: detail.revision,
          screening: detail.screening,
          status: detail.status,
          updatedAt: detail.updatedAt,
        });
      }
      return views;
    },

    async get(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
    }): Promise<Student500ApplicationDetailView> {
      await authorize(input);
      const application = await requireApplication(input);
      const events = await store.listEvents({ applicationId: application.id });
      return await buildView(
        {
          actorUserId: input.actorUserId,
          application,
          projectId: input.projectId,
        },
        events
      );
    },

    async create(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly operationId: string;
      readonly context?: Student500ContextInput;
    }): Promise<{
      readonly application: Student500ApplicationDetailView;
      readonly replayed: boolean;
    }> {
      const actor = await authorize(input);
      assertWritable(actor);
      const context = normalizeStudent500Context(input.context ?? {});
      const identity = {
        context,
        operationType: "student_500_create",
        projectId: input.projectId,
      } as const;
      const replayed = await replayRecorded({
        actorUserId: input.actorUserId,
        application: null,
        identity,
        operationId: input.operationId,
        projectId: input.projectId,
      });
      if (replayed) {
        return { application: replayed, replayed: true };
      }
      // A link the actor cannot re-authorize is rejected before persistence, so a
      // foreign or stale school application can never be recorded as connected.
      await assertLinkAuthorized({
        actorUserId: input.actorUserId,
        context,
        projectId: input.projectId,
      });
      const result = await store.createApplication({
        operation: operationStamp({
          actorUserId: input.actorUserId,
          identity,
          operationId: input.operationId,
        }),
        projectId: input.projectId,
        values: {
          applicantUserId: input.actorUserId,
          context,
          ownerUserId: input.actorUserId,
        },
      });
      return {
        application: await buildView({
          actorUserId: input.actorUserId,
          application: result.value,
          projectId: input.projectId,
        }),
        replayed: result.replayed,
      };
    },

    async update(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly expectedRevision: number;
      readonly operationId: string;
      readonly context?: Student500ContextInput;
    }): Promise<{
      readonly application: Student500ApplicationDetailView;
      readonly replayed: boolean;
    }> {
      const actor = await authorize(input);
      assertWritable(actor);
      const application = await requireApplication(input);
      const expectedRevision = validateStudent500Revision(
        input.expectedRevision
      );
      const context = normalizeStudent500Context(input.context ?? {});
      const identity = {
        applicationId: application.id,
        context,
        expectedRevision,
        operationType: "student_500_update",
        projectId: input.projectId,
      } as const;
      const replayed = await replayRecorded({
        actorUserId: input.actorUserId,
        application,
        identity,
        operationId: input.operationId,
        projectId: input.projectId,
      });
      if (replayed) {
        return { application: replayed, replayed: true };
      }
      if (application.status === "archived") {
        throw new Student500Error("application_archived");
      }
      await assertLinkAuthorized({
        actorUserId: input.actorUserId,
        context,
        projectId: input.projectId,
      });
      const result = await store.updateApplication({
        applicationId: application.id,
        expectedRevision,
        operation: operationStamp({
          actorUserId: input.actorUserId,
          identity,
          operationId: input.operationId,
        }),
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
        values: {
          applicantUserId: input.actorUserId,
          context,
          ownerUserId: input.actorUserId,
        },
      });
      return {
        application: await buildView({
          actorUserId: input.actorUserId,
          application: result.value,
          projectId: input.projectId,
        }),
        replayed: result.replayed,
      };
    },

    async archive(input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly applicationId: string;
      readonly expectedRevision: number;
      readonly operationId: string;
    }): Promise<{
      readonly application: Student500ApplicationDetailView;
      readonly replayed: boolean;
    }> {
      const actor = await authorize(input);
      assertWritable(actor);
      const application = await requireApplication(input);
      const expectedRevision = validateStudent500Revision(
        input.expectedRevision
      );
      const identity = {
        applicationId: application.id,
        expectedRevision,
        operationType: "student_500_archive",
        projectId: input.projectId,
      } as const;
      const replayed = await replayRecorded({
        actorUserId: input.actorUserId,
        application,
        identity,
        operationId: input.operationId,
        projectId: input.projectId,
      });
      if (replayed) {
        return { application: replayed, replayed: true };
      }
      const result = await store.archiveApplication({
        applicationId: application.id,
        expectedRevision,
        operation: operationStamp({
          actorUserId: input.actorUserId,
          identity,
          operationId: input.operationId,
        }),
        ownerUserId: input.actorUserId,
        projectId: input.projectId,
      });
      return {
        application: await buildView({
          actorUserId: input.actorUserId,
          application: result.value,
          projectId: input.projectId,
        }),
        replayed: result.replayed,
      };
    },
  };
}

export type Student500Service = ReturnType<typeof createStudent500Service>;
