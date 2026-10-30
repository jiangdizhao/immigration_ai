// biome-ignore-all lint/suspicious/useAwait: this test-only store implements an
// asynchronous persistence port; read helpers resolve synchronously.
import { randomUUID } from "node:crypto";
import {
  SCHOOL_ADMISSIONS_MAX_CASES_PER_PROJECT,
  SCHOOL_ADMISSIONS_MAX_EXCEPTION_VERSIONS,
  SCHOOL_ADMISSIONS_MAX_EXTERNAL_ACTIONS,
  SCHOOL_ADMISSIONS_MAX_OUTCOME_VERSIONS,
  SCHOOL_ADMISSIONS_MAX_PREPARATIONS,
  SchoolAdmissionsError,
} from "./contracts";
import type {
  SchoolAdmissionCaseRecord,
  SchoolAdmissionEventRecord,
  SchoolAdmissionExceptionRecord,
  SchoolAdmissionExternalActionRecord,
  SchoolAdmissionOutcomeRecord,
  SchoolAdmissionPreparationRecord,
  SchoolAdmissionsActorContext,
  SchoolAdmissionsMembershipStatus,
  SchoolAdmissionsOperationResultKind,
  SchoolAdmissionsOperationStamp,
  SchoolAdmissionsStore,
} from "./ports";
import { isSchoolAdmissionsConfirmationForwardOnly } from "./workflow";

/**
 * Deterministic in-memory M5.2 store.
 *
 * It mirrors the SQL adapter's invariants so the domain behaviour is executable
 * without PostgreSQL:
 *   - every mutation is serialized (the SQL adapter uses row locks),
 *   - every mutation is copy-on-write, so a rejected write leaves no residue,
 *   - in-transaction authorization is re-derived on every write,
 *   - operations are unique per (actor, operationId) with a request digest,
 *   - one current outcome per kind and one current exception per case.
 */

type OperationRecord = {
  readonly actorUserId: string;
  readonly operationId: string;
  readonly operationType: string;
  readonly requestSha256: string;
  readonly resultId: string;
  readonly resultKind: SchoolAdmissionsOperationResultKind;
};

export type InMemoryProjectSeed = {
  readonly ownerUserId: string;
  readonly status: "active" | "closed";
};

export type InMemoryActorSeed = {
  readonly registeredCustomer: boolean;
  readonly staff?: boolean;
  readonly memberships?: Readonly<
    Record<string, "active" | "pending" | "revoked">
  >;
};

export type InMemorySchoolAdmissionsStore = SchoolAdmissionsStore & {
  seedProject(projectId: string, project: InMemoryProjectSeed): void;
  seedActor(userId: string, actor: InMemoryActorSeed): void;
  setProjectStatus(projectId: string, status: "active" | "closed"): void;
  setMembership(
    projectId: string,
    userId: string,
    status: "active" | "pending" | "revoked"
  ): void;
  setWriteBarrier(barrier: (() => void | Promise<void>) | null): void;
  state(): {
    readonly cases: readonly SchoolAdmissionCaseRecord[];
    readonly preparations: readonly SchoolAdmissionPreparationRecord[];
    readonly outcomes: readonly SchoolAdmissionOutcomeRecord[];
    readonly externalActions: readonly SchoolAdmissionExternalActionRecord[];
    readonly exceptions: readonly SchoolAdmissionExceptionRecord[];
    readonly events: readonly SchoolAdmissionEventRecord[];
    readonly operations: readonly OperationRecord[];
  };
};

export function createInMemorySchoolAdmissionsStore(
  options: { readonly now?: () => Date; readonly newId?: () => string } = {}
): InMemorySchoolAdmissionsStore {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => randomUUID());

  const projects = new Map<string, InMemoryProjectSeed>();
  const actors = new Map<string, InMemoryActorSeed>();
  const cases = new Map<string, SchoolAdmissionCaseRecord>();
  const preparations = new Map<string, SchoolAdmissionPreparationRecord>();
  const outcomes = new Map<string, SchoolAdmissionOutcomeRecord>();
  const externalActions = new Map<
    string,
    SchoolAdmissionExternalActionRecord
  >();
  const exceptions = new Map<string, SchoolAdmissionExceptionRecord>();
  const events: SchoolAdmissionEventRecord[] = [];
  const operations = new Map<string, OperationRecord>();

  let queue: Promise<unknown> = Promise.resolve();
  let writeBarrier: (() => void | Promise<void>) | null = null;

  function serialize<T>(action: () => Promise<T> | T): Promise<T> {
    const run = queue.then(action, action);
    queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  function assertWriteAuthority(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }) {
    const actor = actors.get(input.actorUserId);
    if (!actor || actor.staff || !actor.registeredCustomer) {
      throw new SchoolAdmissionsError("actor_not_eligible");
    }
    const project = projects.get(input.projectId);
    if (!project) {
      throw new SchoolAdmissionsError("project_not_found");
    }
    const membership = actor.memberships?.[input.projectId] ?? "missing";
    if (project.ownerUserId !== input.actorUserId && membership !== "active") {
      throw new SchoolAdmissionsError("project_forbidden");
    }
    if (project.status !== "active") {
      throw new SchoolAdmissionsError("project_closed");
    }
  }

  function claim(
    operation: SchoolAdmissionsOperationStamp
  ): OperationRecord | null {
    const existing = operations.get(
      `${operation.actorUserId}:${operation.operationId}`
    );
    if (!existing) {
      return null;
    }
    if (
      existing.requestSha256 !== operation.requestSha256 ||
      existing.operationType !== operation.operationType
    ) {
      throw new SchoolAdmissionsError("idempotency_conflict");
    }
    return existing;
  }

  function record(
    operation: SchoolAdmissionsOperationStamp,
    resultKind: SchoolAdmissionsOperationResultKind,
    resultId: string
  ) {
    operations.set(`${operation.actorUserId}:${operation.operationId}`, {
      actorUserId: operation.actorUserId,
      operationId: operation.operationId,
      operationType: operation.operationType,
      requestSha256: operation.requestSha256,
      resultId,
      resultKind,
    });
  }

  function requireCaseForWrite(input: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly caseId: string;
  }): SchoolAdmissionCaseRecord {
    const record = cases.get(input.caseId);
    if (
      !record ||
      record.projectId !== input.projectId ||
      record.ownerUserId !== input.ownerUserId
    ) {
      throw new SchoolAdmissionsError("case_not_found");
    }
    return record;
  }

  function assertRevision(
    record: SchoolAdmissionCaseRecord,
    expectedRevision: number
  ) {
    if (record.revision !== expectedRevision) {
      throw new SchoolAdmissionsError("revision_conflict");
    }
  }

  function appendEvent(input: {
    record: SchoolAdmissionCaseRecord;
    actorUserId: string;
    eventType: string;
    subjectKind: string;
    subjectId: string;
    caseRevision: number;
    at: Date;
  }) {
    events.push({
      actorUserId: input.actorUserId,
      caseId: input.record.id,
      caseRevision: input.caseRevision,
      createdAt: input.at,
      eventType: input.eventType,
      id: newId(),
      projectId: input.record.projectId,
      subjectId: input.subjectId,
      subjectKind: input.subjectKind,
    });
  }

  function updateCase(
    record: SchoolAdmissionCaseRecord,
    patch: Partial<SchoolAdmissionCaseRecord>,
    at: Date
  ): SchoolAdmissionCaseRecord {
    if (
      patch.confirmedPreparationVersion !== undefined &&
      !isSchoolAdmissionsConfirmationForwardOnly(
        record.confirmedPreparationVersion,
        patch.confirmedPreparationVersion
      )
    ) {
      // Mirrors SchoolAdmissionCase_confirmation_forward_only in Migration 0047:
      // confirmation advances or stays, but is never cleared or reversed.
      throw new SchoolAdmissionsError("state_conflict");
    }
    const next: SchoolAdmissionCaseRecord = {
      ...record,
      ...patch,
      revision: record.revision + 1,
      updatedAt: at,
    };
    cases.set(next.id, next);
    return next;
  }

  function currentOutcome(
    caseId: string,
    kind: "offer" | "coe"
  ): SchoolAdmissionOutcomeRecord | null {
    return (
      [...outcomes.values()].find(
        (entry) =>
          entry.caseId === caseId &&
          entry.kind === kind &&
          entry.supersededById === null
      ) ?? null
    );
  }

  function currentException(
    caseId: string
  ): SchoolAdmissionExceptionRecord | null {
    return (
      [...exceptions.values()].find(
        (entry) => entry.caseId === caseId && entry.supersededById === null
      ) ?? null
    );
  }

  return {
    seedProject(projectId, project) {
      projects.set(projectId, project);
    },

    seedActor(userId, actor) {
      actors.set(userId, actor);
    },

    setProjectStatus(projectId, status) {
      const project = projects.get(projectId);
      if (project) {
        projects.set(projectId, { ...project, status });
      }
    },

    setMembership(projectId, userId, status) {
      const actor = actors.get(userId);
      if (!actor) {
        return;
      }
      actors.set(userId, {
        ...actor,
        memberships: { ...actor.memberships, [projectId]: status },
      });
    },

    setWriteBarrier(barrier) {
      writeBarrier = barrier;
    },

    state() {
      return {
        cases: [...cases.values()],
        events: [...events],
        exceptions: [...exceptions.values()],
        externalActions: [...externalActions.values()],
        operations: [...operations.values()],
        outcomes: [...outcomes.values()],
        preparations: [...preparations.values()],
      };
    },

    async readActorContext(input): Promise<SchoolAdmissionsActorContext> {
      const actor = actors.get(input.actorUserId);
      const project = projects.get(input.projectId);
      if (!(actor && project)) {
        return {
          membershipStatus: "missing",
          project: project
            ? {
                id: input.projectId,
                ownerUserId: project.ownerUserId,
                status: project.status,
              }
            : null,
          registeredCustomer: actor?.registeredCustomer ?? false,
          staff: actor?.staff ?? false,
        };
      }
      const membership =
        actor.memberships?.[input.projectId] ??
        (project.ownerUserId === input.actorUserId ? "owner" : "missing");
      const membershipStatus: SchoolAdmissionsMembershipStatus =
        membership === "owner"
          ? "owner"
          : membership === "active"
            ? "active_member"
            : (membership as SchoolAdmissionsMembershipStatus);
      return {
        membershipStatus,
        project: {
          id: input.projectId,
          ownerUserId: project.ownerUserId,
          status: project.status,
        },
        registeredCustomer: actor.registeredCustomer,
        staff: actor.staff ?? false,
      };
    },

    async findOperation(input) {
      const existing = operations.get(
        `${input.actorUserId}:${input.operationId}`
      );
      if (!existing) {
        return { status: "absent" } as const;
      }
      if (
        existing.operationType !== input.operationType ||
        existing.requestSha256 !== input.requestSha256
      ) {
        return { status: "conflict" } as const;
      }
      return {
        resultId: existing.resultId,
        resultKind: existing.resultKind,
        status: "replay",
      } as const;
    },

    async listCases(input) {
      return [...cases.values()]
        .filter(
          (entry) =>
            entry.projectId === input.projectId &&
            entry.ownerUserId === input.ownerUserId
        )
        .sort(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
        );
    },

    async getCase(input) {
      const record = cases.get(input.caseId);
      if (
        !record ||
        record.projectId !== input.projectId ||
        record.ownerUserId !== input.ownerUserId
      ) {
        // Cases are creator-private: Project membership never grants access to
        // another customer's admission case.
        return null;
      }
      return record;
    },

    async getCaseByApplication(input) {
      return (
        [...cases.values()].find(
          (entry) =>
            entry.projectId === input.projectId &&
            entry.ownerUserId === input.ownerUserId &&
            entry.applicationId === input.applicationId
        ) ?? null
      );
    },

    async countCases(input) {
      return [...cases.values()].filter(
        (entry) => entry.projectId === input.projectId
      ).length;
    },

    async listPreparations(input) {
      return [...preparations.values()]
        .filter((entry) => entry.caseId === input.caseId)
        .sort((left, right) => left.version - right.version);
    },

    async listOutcomes(input) {
      return [...outcomes.values()]
        .filter((entry) => entry.caseId === input.caseId)
        .sort(
          (left, right) =>
            left.recordedAt.getTime() - right.recordedAt.getTime()
        );
    },

    async listExternalActions(input) {
      return [...externalActions.values()]
        .filter((entry) => entry.caseId === input.caseId)
        .sort(
          (left, right) =>
            left.recordedAt.getTime() - right.recordedAt.getTime()
        );
    },

    async listExceptions(input) {
      return [...exceptions.values()]
        .filter((entry) => entry.caseId === input.caseId)
        .sort((left, right) => left.version - right.version);
    },

    async listEvents(input) {
      return events
        .filter((entry) => entry.caseId === input.caseId)
        .sort(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
        );
    },

    createCase(input) {
      return serialize(async () => {
        await writeBarrier?.();
        assertWriteAuthority({
          actorUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        if (replay) {
          const existing = cases.get(replay.resultId);
          if (!existing) {
            throw new SchoolAdmissionsError("integrity_conflict");
          }
          return { replayed: true, value: existing };
        }
        const at = now();
        const id = newId();
        const count = [...cases.values()].filter(
          (entry) => entry.projectId === input.projectId
        ).length;
        if (count >= SCHOOL_ADMISSIONS_MAX_CASES_PER_PROJECT) {
          throw new SchoolAdmissionsError("limit_exceeded");
        }
        if (
          input.applicationId &&
          [...cases.values()].some(
            (entry) =>
              entry.projectId === input.projectId &&
              entry.applicationId === input.applicationId
          )
        ) {
          throw new SchoolAdmissionsError("state_conflict");
        }
        const created: SchoolAdmissionCaseRecord = {
          applicationId: input.applicationId,
          confirmedPreparationVersion: null,
          courseTitle: input.courseTitle,
          createdAt: at,
          id,
          institutionName: input.institutionName,
          intakeLabel: input.intakeLabel,
          managedReadinessCheckedAt: null,
          managedReadinessReasonCodes: [],
          managedReadinessStatus: "NOT_EVALUATED",
          managedReadinessToken: null,
          originKind: input.originKind,
          ownerUserId: input.ownerUserId,
          preparationState: "not_started",
          projectId: input.projectId,
          revision: 1,
          serviceMode: input.serviceMode,
          updatedAt: at,
        };
        cases.set(id, created);
        appendEvent({
          actorUserId: input.operation.actorUserId,
          at,
          caseRevision: created.revision,
          eventType: "school_admission_case_created",
          record: created,
          subjectId: id,
          subjectKind: "school_admission_case",
        });
        record(input.operation, "school_admission_case", id);
        return { replayed: false, value: created };
      });
    },

    updateServiceMode(input) {
      return serialize(async () => {
        await writeBarrier?.();
        assertWriteAuthority({
          actorUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        if (replay) {
          return {
            replayed: true,
            value: requireCaseForWrite({
              caseId: replay.resultId,
              ownerUserId: input.ownerUserId,
              projectId: input.projectId,
            }),
          };
        }
        const existing = requireCaseForWrite(input);
        assertRevision(existing, input.expectedRevision);
        const at = now();
        const hasPreparation = [...preparations.values()].some(
          (entry) => entry.caseId === existing.id
        );
        const next = updateCase(
          existing,
          {
            preparationState:
              hasPreparation && existing.serviceMode !== input.serviceMode
                ? "stale"
                : existing.preparationState,
            serviceMode: input.serviceMode,
          },
          at
        );
        appendEvent({
          actorUserId: input.operation.actorUserId,
          at,
          caseRevision: next.revision,
          eventType: "school_admission_service_mode_changed",
          record: next,
          subjectId: next.id,
          subjectKind: "school_admission_case",
        });
        record(input.operation, "school_admission_case", next.id);
        return { replayed: false, value: next };
      });
    },

    recordPreparation(input) {
      return serialize(async () => {
        await writeBarrier?.();
        assertWriteAuthority({
          actorUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        if (replay) {
          const existing = preparations.get(replay.resultId);
          if (!existing) {
            throw new SchoolAdmissionsError("integrity_conflict");
          }
          return { replayed: true, value: existing };
        }
        const current = requireCaseForWrite(input);
        assertRevision(current, input.expectedRevision);
        const forCase = [...preparations.values()].filter(
          (entry) => entry.caseId === current.id
        );
        if (forCase.length >= SCHOOL_ADMISSIONS_MAX_PREPARATIONS) {
          throw new SchoolAdmissionsError("limit_exceeded");
        }
        const at = now();
        const id = newId();
        const preparation: SchoolAdmissionPreparationRecord = {
          applicationRevision: input.preparation.applicationRevision,
          assistKind: input.preparation.assistKind,
          caseId: current.id,
          caseRevision: input.preparation.caseRevision,
          confirmedAt: null,
          contentSha256: input.preparation.contentSha256,
          createdAt: at,
          createdByUserId: input.operation.actorUserId,
          id,
          inputsSha256: input.preparation.inputsSha256,
          operationId: input.operation.operationId,
          packageContentSha256: input.preparation.packageContentSha256,
          packageId: input.preparation.packageId,
          projectId: current.projectId,
          requestSha256: input.operation.requestSha256,
          requirements: input.preparation.requirements,
          schemaVersion: input.preparation.schemaVersion,
          sections: input.preparation.sections,
          serviceMode: input.preparation.serviceMode,
          sourceDigest: input.preparation.sourceDigest,
          version: forCase.length + 1,
        };
        preparations.set(id, preparation);
        const outstanding = input.preparation.requirements.filter(
          (entry) =>
            entry.required &&
            entry.status !== "satisfied" &&
            entry.status !== "not_applicable"
        );
        const next = updateCase(
          current,
          {
            preparationState:
              outstanding.length === 0
                ? "ready_for_customer_review"
                : "in_preparation",
          },
          at
        );
        appendEvent({
          actorUserId: input.operation.actorUserId,
          at,
          caseRevision: next.revision,
          eventType: "school_admission_preparation_recorded",
          record: next,
          subjectId: id,
          subjectKind: "school_admission_preparation",
        });
        record(input.operation, "school_admission_preparation", id);
        return { replayed: false, value: preparation };
      });
    },

    confirmPreparation(input) {
      return serialize(async () => {
        await writeBarrier?.();
        assertWriteAuthority({
          actorUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        if (replay) {
          const existing = preparations.get(replay.resultId);
          if (!existing) {
            throw new SchoolAdmissionsError("integrity_conflict");
          }
          return { replayed: true, value: existing };
        }
        const current = requireCaseForWrite(input);
        assertRevision(current, input.expectedRevision);
        const preparation = preparations.get(input.preparationId);
        if (!preparation || preparation.caseId !== current.id) {
          throw new SchoolAdmissionsError("state_conflict");
        }
        /**
         * Only the newest preparation version may be confirmed, and a version can
         * be confirmed once. Reconfirmation therefore confirms a NEW version; an
         * older confirmed snapshot stays auditable and never becomes current.
         */
        const newest = [...preparations.values()]
          .filter((entry) => entry.caseId === current.id)
          .reduce(
            (highest, entry) =>
              !highest || entry.version > highest.version ? entry : highest,
            null as SchoolAdmissionPreparationRecord | null
          );
        if (newest?.id !== preparation.id) {
          throw new SchoolAdmissionsError("state_conflict");
        }
        if (preparation.confirmedAt) {
          throw new SchoolAdmissionsError("state_conflict");
        }
        const at = now();
        const confirmed: SchoolAdmissionPreparationRecord = {
          ...preparation,
          confirmedAt: at,
        };
        preparations.set(confirmed.id, confirmed);
        const next = updateCase(
          current,
          {
            confirmedPreparationVersion: confirmed.version,
            preparationState: "customer_confirmed",
          },
          at
        );
        appendEvent({
          actorUserId: input.operation.actorUserId,
          at,
          caseRevision: next.revision,
          eventType: "school_admission_preparation_confirmed",
          record: next,
          subjectId: confirmed.id,
          subjectKind: "school_admission_preparation",
        });
        record(input.operation, "school_admission_preparation", confirmed.id);
        return { replayed: false, value: confirmed };
      });
    },

    recordOutcome(input) {
      return serialize(async () => {
        await writeBarrier?.();
        assertWriteAuthority({
          actorUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        if (replay) {
          const existing = outcomes.get(replay.resultId);
          if (!existing) {
            throw new SchoolAdmissionsError("integrity_conflict");
          }
          return { replayed: true, value: existing };
        }
        const current = requireCaseForWrite(input);
        assertRevision(current, input.expectedRevision);
        const at = now();
        const previous = currentOutcome(current.id, input.outcome.kind);
        const versions = [...outcomes.values()].filter(
          (entry) =>
            entry.caseId === current.id && entry.kind === input.outcome.kind
        );
        if (versions.length >= SCHOOL_ADMISSIONS_MAX_OUTCOME_VERSIONS) {
          throw new SchoolAdmissionsError("limit_exceeded");
        }
        const id = newId();
        const created: SchoolAdmissionOutcomeRecord = {
          caseId: current.id,
          decisionOn: input.outcome.decisionOn,
          evidenceReferenceId: input.outcome.evidenceReferenceId,
          evidenceReferenceSha256: input.outcome.evidenceReferenceSha256,
          evidenceReferenceVersion: input.outcome.evidenceReferenceVersion,
          expiresOn: input.outcome.expiresOn,
          id,
          kind: input.outcome.kind,
          operationId: input.operation.operationId,
          projectId: current.projectId,
          provenance: input.outcome.provenance,
          receivedOn: input.outcome.receivedOn,
          recordedAt: at,
          reportedByUserId: input.operation.actorUserId,
          requestSha256: input.operation.requestSha256,
          state: input.outcome.state,
          supersededById: null,
          validFrom: input.outcome.validFrom,
          validTo: input.outcome.validTo,
          version: versions.length + 1,
        };
        // Mirror the SQL protocol: supersede the live row before its successor
        // exists, so the one-live-row invariant holds at every step (the SQL
        // adapter additionally relies on a DEFERRABLE self-FK for the pointer).
        if (previous) {
          outcomes.set(previous.id, { ...previous, supersededById: id });
        }
        outcomes.set(id, created);
        const next = updateCase(current, {}, at);
        appendEvent({
          actorUserId: input.operation.actorUserId,
          at,
          caseRevision: next.revision,
          eventType:
            input.outcome.kind === "offer"
              ? "school_admission_offer_recorded"
              : "school_admission_coe_recorded",
          record: next,
          subjectId: id,
          subjectKind: `school_admission_${input.outcome.kind}`,
        });
        record(input.operation, "school_admission_outcome", id);
        return { replayed: false, value: created };
      });
    },

    transitionOutcome(input) {
      return serialize(async () => {
        await writeBarrier?.();
        assertWriteAuthority({
          actorUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        if (replay) {
          const existing = outcomes.get(replay.resultId);
          if (!existing) {
            throw new SchoolAdmissionsError("integrity_conflict");
          }
          return { replayed: true, value: existing };
        }
        const current = requireCaseForWrite(input);
        assertRevision(current, input.expectedRevision);
        const previous = outcomes.get(input.outcomeId);
        if (
          !previous ||
          previous.caseId !== current.id ||
          previous.supersededById !== null
        ) {
          throw new SchoolAdmissionsError("outcome_not_found");
        }
        const versions = [...outcomes.values()].filter(
          (entry) => entry.caseId === current.id && entry.kind === previous.kind
        );
        if (versions.length >= SCHOOL_ADMISSIONS_MAX_OUTCOME_VERSIONS) {
          throw new SchoolAdmissionsError("limit_exceeded");
        }
        const at = now();
        const id = newId();
        const created: SchoolAdmissionOutcomeRecord = {
          ...previous,
          decisionOn: input.decisionOn ?? previous.decisionOn,
          id,
          operationId: input.operation.operationId,
          recordedAt: at,
          requestSha256: input.operation.requestSha256,
          state: input.state,
          supersededById: null,
          version: versions.length + 1,
        };
        outcomes.set(previous.id, { ...previous, supersededById: id });
        outcomes.set(id, created);
        const next = updateCase(current, {}, at);
        appendEvent({
          actorUserId: input.operation.actorUserId,
          at,
          caseRevision: next.revision,
          eventType:
            previous.kind === "offer"
              ? "school_admission_offer_transition"
              : "school_admission_coe_transition",
          record: next,
          subjectId: id,
          subjectKind: `school_admission_${previous.kind}`,
        });
        record(input.operation, "school_admission_outcome", id);
        return { replayed: false, value: created };
      });
    },

    recordExternalAction(input) {
      return serialize(async () => {
        await writeBarrier?.();
        assertWriteAuthority({
          actorUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        if (replay) {
          const existing = externalActions.get(replay.resultId);
          if (!existing) {
            throw new SchoolAdmissionsError("integrity_conflict");
          }
          return { replayed: true, value: existing };
        }
        const current = requireCaseForWrite(input);
        assertRevision(current, input.expectedRevision);
        const forCase = [...externalActions.values()].filter(
          (entry) => entry.caseId === current.id
        );
        if (forCase.length >= SCHOOL_ADMISSIONS_MAX_EXTERNAL_ACTIONS) {
          throw new SchoolAdmissionsError("limit_exceeded");
        }
        const at = now();
        const id = newId();
        const created: SchoolAdmissionExternalActionRecord = {
          acknowledged: true,
          actionKind: input.action.actionKind,
          caseId: current.id,
          id,
          note: input.action.note,
          operationId: input.operation.operationId,
          performedOn: input.action.performedOn,
          projectId: current.projectId,
          provenance: "customer_reported",
          recordedAt: at,
          reportedByUserId: input.operation.actorUserId,
          requestSha256: input.operation.requestSha256,
        };
        externalActions.set(id, created);
        const next = updateCase(current, {}, at);
        appendEvent({
          actorUserId: input.operation.actorUserId,
          at,
          caseRevision: next.revision,
          eventType: "school_admission_external_action_recorded",
          record: next,
          subjectId: id,
          subjectKind: "school_admission_external_action",
        });
        record(input.operation, "school_admission_external_action", id);
        return { replayed: false, value: created };
      });
    },

    recordException(input) {
      return serialize(async () => {
        await writeBarrier?.();
        assertWriteAuthority({
          actorUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        if (replay) {
          const existing = exceptions.get(replay.resultId);
          if (!existing) {
            throw new SchoolAdmissionsError("integrity_conflict");
          }
          return { replayed: true, value: existing };
        }
        const current = requireCaseForWrite(input);
        assertRevision(current, input.expectedRevision);
        const previous = currentException(current.id);
        const forCase = [...exceptions.values()].filter(
          (entry) => entry.caseId === current.id
        );
        if (forCase.length >= SCHOOL_ADMISSIONS_MAX_EXCEPTION_VERSIONS) {
          throw new SchoolAdmissionsError("limit_exceeded");
        }
        const decided =
          input.claim.state === "verified" || input.claim.state === "rejected";
        const at = now();
        const id = newId();
        const created: SchoolAdmissionExceptionRecord = {
          authorityReference: input.claim.authorityReference,
          caseId: current.id,
          claimKind: input.claim.claimKind,
          decidedAt: decided ? at : null,
          decidedByUserId: decided ? input.operation.actorUserId : null,
          description: input.claim.description,
          id,
          operationId: input.operation.operationId,
          projectId: current.projectId,
          recordedAt: at,
          reportedByUserId:
            previous?.reportedByUserId ?? input.operation.actorUserId,
          requestSha256: input.operation.requestSha256,
          state: input.claim.state,
          supersededById: null,
          version: forCase.length + 1,
        };
        if (previous) {
          exceptions.set(previous.id, { ...previous, supersededById: id });
        }
        exceptions.set(id, created);
        const next = updateCase(current, {}, at);
        appendEvent({
          actorUserId: input.operation.actorUserId,
          at,
          caseRevision: next.revision,
          eventType:
            input.claim.state === "verified"
              ? "school_admission_exception_verified"
              : input.claim.state === "rejected"
                ? "school_admission_exception_rejected"
                : "school_admission_exception_claimed",
          record: next,
          subjectId: id,
          subjectKind: "school_admission_exception",
        });
        record(input.operation, "school_admission_exception", id);
        return { replayed: false, value: created };
      });
    },

    recordManagedReadiness(input) {
      return serialize(async () => {
        await writeBarrier?.();
        assertWriteAuthority({
          actorUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        if (replay) {
          return {
            replayed: true,
            value: requireCaseForWrite({
              caseId: replay.resultId,
              ownerUserId: input.ownerUserId,
              projectId: input.projectId,
            }),
          };
        }
        const current = requireCaseForWrite(input);
        assertRevision(current, input.expectedRevision);
        const at = now();
        const next = updateCase(
          current,
          {
            managedReadinessCheckedAt: input.readiness.checkedAt,
            managedReadinessReasonCodes: input.readiness.reasonCodes,
            managedReadinessStatus: input.readiness.status,
            managedReadinessToken: input.readiness.token || null,
          },
          at
        );
        appendEvent({
          actorUserId: input.operation.actorUserId,
          at,
          caseRevision: next.revision,
          eventType: "school_admission_readiness_evaluated",
          record: next,
          subjectId: next.id,
          subjectKind: "school_admission_case",
        });
        record(input.operation, "school_admission_case", next.id);
        return { replayed: false, value: next };
      });
    },
  };
}
