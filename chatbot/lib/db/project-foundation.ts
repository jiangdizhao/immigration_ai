import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { guestRegex } from "@/lib/constants";
import type { PaginationCursor } from "@/lib/conversations/pagination";
import { projectChatWritesEnabled } from "@/lib/projects/chat-policy";
import {
  hashProjectOperationRequest,
  ProjectFoundationError,
  resolveProjectOperationReplay,
  resolveProjectOperationRequestReplay,
  validateProjectOperationId,
} from "./project-foundation-utils";
import { getLazyDatabase } from "./runtime-client";
import type { ProjectEventSubjectKind } from "./schema";
import {
  chat,
  immigrationConversation,
  type PROJECT_EVENT_TYPES,
  PROJECT_OPERATION_TYPES,
  projectConversation,
  projectEvent,
  projectMembership,
  projectOperation,
  studyJourneyProject,
  user,
} from "./schema";

export type { ProjectFoundationErrorCode } from "./project-foundation-utils";
export {
  canonicalProjectOperationRequest,
  hashProjectOperationRequest,
  ProjectFoundationError,
  resolveProjectOperationReplay,
  resolveProjectOperationRequestReplay,
  validateProjectOperationId,
} from "./project-foundation-utils";

const db = getLazyDatabase();
type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type ProjectFoundationTransaction = Transaction;

export { PROJECT_EVENT_TYPES, PROJECT_OPERATION_TYPES } from "./schema";
export type ProjectOperationType = (typeof PROJECT_OPERATION_TYPES)[number];
export type ProjectEventType = (typeof PROJECT_EVENT_TYPES)[number];

export type ProjectFoundationWriteBoundary =
  | "operation_claimed"
  | "project_created"
  | "membership_created"
  | "membership_updated"
  | "operation_result_updated"
  | "project_revised"
  | "chat_created"
  | "immigration_conversation_created"
  | "project_conversation_created"
  | "event_created";

export type ProjectFoundationTestHooks = {
  /** Internal deterministic fault/barrier seam used only by repository tests. */
  afterWrite?: (
    boundary: ProjectFoundationWriteBoundary
  ) => void | Promise<void>;
};

type RepositoryOptions = {
  database?: Database;
  testHooks?: ProjectFoundationTestHooks;
};

type ProjectRow = typeof studyJourneyProject.$inferSelect;

export type ProjectFoundationProject = Pick<
  ProjectRow,
  | "id"
  | "ownerUserId"
  | "status"
  | "revision"
  | "createdAt"
  | "updatedAt"
  | "closedAt"
>;

export type ProjectOperationOutcome = {
  replayed: boolean;
  project: ProjectFoundationProject;
};

export type ProjectChatOutcome = {
  replayed: boolean;
  project: ProjectFoundationProject;
  chatId: string;
  createdByUserId: string;
};

export type ProjectAccessIntent = "project_write" | "chat_history";

function assertOperationType(
  operationType: string
): asserts operationType is ProjectOperationType {
  if (!(PROJECT_OPERATION_TYPES as readonly string[]).includes(operationType)) {
    throw new ProjectFoundationError("invalid_request");
  }
}

async function afterWrite(
  hooks: ProjectFoundationTestHooks,
  boundary: ProjectFoundationWriteBoundary
) {
  await hooks.afterWrite?.(boundary);
}

async function claimOperation(
  tx: Transaction,
  input: {
    actorUserId: string;
    operationId: string;
    operationType: ProjectOperationType;
    requestHash: string;
    resultId: string;
    resultKind: "project" | "membership" | "chat";
    replayResultKinds?: readonly ("project" | "membership" | "chat")[];
    compareHashOnly?: boolean;
  },
  hooks: ProjectFoundationTestHooks
): Promise<{
  id: string;
  resultId: string;
  resultKind: string;
  replayed: boolean;
}> {
  const [claimed] = await tx
    .insert(projectOperation)
    .values({
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: input.operationType,
      requestHash: input.requestHash,
      resultId: input.resultId,
      resultKind: input.resultKind,
    })
    .onConflictDoNothing({
      target: [
        projectOperation.actorUserId,
        projectOperation.operationType,
        projectOperation.operationId,
      ],
    })
    .returning({
      id: projectOperation.id,
      resultId: projectOperation.resultId,
      resultKind: projectOperation.resultKind,
    });

  if (claimed) {
    await afterWrite(hooks, "operation_claimed");
    return { ...claimed, replayed: false };
  }

  // Unique-key insertion waits for an in-flight winner. Lock and read the
  // committed operation before resolving a replay, preserving the global
  // acquisition order: operation, Project, then Membership.
  const [existing] = await tx
    .select({
      id: projectOperation.id,
      requestHash: projectOperation.requestHash,
      resultId: projectOperation.resultId,
      resultKind: projectOperation.resultKind,
    })
    .from(projectOperation)
    .where(
      and(
        eq(projectOperation.actorUserId, input.actorUserId),
        eq(projectOperation.operationType, input.operationType),
        eq(projectOperation.operationId, input.operationId)
      )
    )
    .for("update")
    .limit(1);

  if (!existing) {
    throw new ProjectFoundationError("integrity_conflict");
  }
  const replay = input.compareHashOnly
    ? resolveProjectOperationRequestReplay(existing, {
        requestHash: input.requestHash,
      })
    : resolveProjectOperationReplay(existing, {
        requestHash: input.requestHash,
        resultKind: input.resultKind,
      });
  if (
    input.replayResultKinds &&
    !input.replayResultKinds.includes(
      replay.resultKind as "project" | "membership" | "chat"
    )
  ) {
    throw new ProjectFoundationError("integrity_conflict");
  }
  return { ...existing, ...replay };
}

async function lockProject(tx: Transaction, projectId: string) {
  const [project] = await tx
    .select()
    .from(studyJourneyProject)
    .where(eq(studyJourneyProject.id, projectId))
    .for("update")
    .limit(1);
  if (!project) {
    throw new ProjectFoundationError("project_not_found");
  }
  return project;
}

async function assertCustomerActor(tx: Transaction, actorUserId: string) {
  const [actor] = await tx
    .select({ email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, actorUserId))
    .limit(1);
  if (!actor || actor.role !== "user" || guestRegex.test(actor.email)) {
    throw new ProjectFoundationError("project_forbidden");
  }
}

async function assertProjectAuthority(
  tx: Transaction,
  project: ProjectRow,
  actorUserId: string,
  intent: ProjectAccessIntent
) {
  if (project.ownerUserId !== actorUserId) {
    // All non-owner authorization reads lock the matching Membership only
    // after locking the Project row. Pending and revoked records never grant
    // access.
    const [membership] = await tx
      .select({ status: projectMembership.status })
      .from(projectMembership)
      .where(
        and(
          eq(projectMembership.projectId, project.id),
          eq(projectMembership.userId, actorUserId)
        )
      )
      .for("update")
      .limit(1);
    if (membership?.status !== "active") {
      throw new ProjectFoundationError("project_forbidden");
    }
  }
  if (intent === "project_write" && project.status !== "active") {
    throw new ProjectFoundationError("project_closed");
  }
}

async function appendEvent(
  tx: Transaction,
  input: {
    projectId: string;
    actorUserId: string;
    projectRevision: number;
    eventType: ProjectEventType;
    subjectKind: ProjectEventSubjectKind;
    subjectId: string;
    operationRecordId: string;
    hooks: ProjectFoundationTestHooks;
    createdAt: Date;
  }
) {
  await tx.insert(projectEvent).values({
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    projectRevision: input.projectRevision,
    eventType: input.eventType,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    operationRecordId: input.operationRecordId,
    createdAt: input.createdAt,
  });
  await afterWrite(input.hooks, "event_created");
}

function operationEvents(tx: Transaction, operationRecordId: string) {
  return tx
    .select({
      projectId: projectEvent.projectId,
      eventType: projectEvent.eventType,
      subjectKind: projectEvent.subjectKind,
      subjectId: projectEvent.subjectId,
    })
    .from(projectEvent)
    .where(eq(projectEvent.operationRecordId, operationRecordId));
}

async function assertMembershipOperationEvent(
  tx: Transaction,
  input: {
    operationRecordId: string;
    projectId: string;
    membershipId: string;
  }
) {
  const events = await operationEvents(tx, input.operationRecordId);
  const [event] = events;
  if (
    events.length !== 1 ||
    event?.projectId !== input.projectId ||
    event.eventType !== "membership_state_changed" ||
    event.subjectKind !== "membership" ||
    event.subjectId !== input.membershipId
  ) {
    throw new ProjectFoundationError("integrity_conflict");
  }
}

export function createProjectFoundationRepository(
  options: RepositoryOptions = {}
) {
  const database = options.database ?? db;
  const hooks = options.testHooks ?? {};

  return {
    createProject(input: {
      actorUserId: string;
      operationId: string;
      now?: Date;
    }): Promise<ProjectOperationOutcome> {
      const operationId = validateProjectOperationId(input.operationId);
      const operationType = "project_create" as const;
      assertOperationType(operationType);
      const projectId = randomUUID();
      const now = input.now ?? new Date();
      const requestHash = hashProjectOperationRequest({});

      return database.transaction(async (tx) => {
        const operation = await claimOperation(
          tx,
          {
            actorUserId: input.actorUserId,
            operationId,
            operationType,
            requestHash,
            resultId: projectId,
            resultKind: "project",
          },
          hooks
        );
        await assertCustomerActor(tx, input.actorUserId);
        if (operation.replayed) {
          const project = await lockProject(tx, operation.resultId);
          if (project.ownerUserId !== input.actorUserId) {
            throw new ProjectFoundationError("project_forbidden");
          }
          if (project.status !== "active") {
            throw new ProjectFoundationError("project_closed");
          }
          return { replayed: true, project };
        }

        const [project] = await tx
          .insert(studyJourneyProject)
          .values({
            id: operation.resultId,
            ownerUserId: input.actorUserId,
            status: "active",
            revision: 1,
            createdAt: now,
            updatedAt: now,
            closedAt: null,
          })
          .returning();
        if (!project) {
          throw new ProjectFoundationError("integrity_conflict");
        }
        await afterWrite(hooks, "project_created");
        await appendEvent(tx, {
          projectId: project.id,
          actorUserId: input.actorUserId,
          projectRevision: 1,
          eventType: "project_created",
          subjectKind: "project",
          subjectId: project.id,
          operationRecordId: operation.id,
          hooks,
          createdAt: now,
        });
        return { replayed: false, project };
      });
    },

    closeProject(input: {
      actorUserId: string;
      projectId: string;
      expectedRevision: number;
      operationId: string;
      now?: Date;
    }): Promise<ProjectOperationOutcome> {
      const operationId = validateProjectOperationId(input.operationId);
      if (
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 1
      ) {
        throw new ProjectFoundationError("invalid_request");
      }
      const operationType = "project_close" as const;
      const now = input.now ?? new Date();
      const requestHash = hashProjectOperationRequest({
        expectedRevision: input.expectedRevision,
        projectId: input.projectId,
      });

      return database.transaction(async (tx) => {
        const operation = await claimOperation(
          tx,
          {
            actorUserId: input.actorUserId,
            operationId,
            operationType,
            requestHash,
            resultId: input.projectId,
            resultKind: "project",
          },
          hooks
        );
        await assertCustomerActor(tx, input.actorUserId);
        const project = await lockProject(tx, operation.resultId);
        if (project.ownerUserId !== input.actorUserId) {
          throw new ProjectFoundationError("project_forbidden");
        }
        if (operation.replayed) {
          return { replayed: true, project };
        }
        if (project.status !== "active") {
          throw new ProjectFoundationError("project_closed");
        }
        if (project.revision !== input.expectedRevision) {
          throw new ProjectFoundationError("revision_conflict");
        }

        const revision = project.revision + 1;
        const [closed] = await tx
          .update(studyJourneyProject)
          .set({
            status: "closed",
            closedAt: now,
            updatedAt: now,
            revision,
          })
          .where(
            and(
              eq(studyJourneyProject.id, project.id),
              eq(studyJourneyProject.revision, project.revision),
              eq(studyJourneyProject.status, "active")
            )
          )
          .returning();
        if (!closed) {
          throw new ProjectFoundationError("revision_conflict");
        }
        await afterWrite(hooks, "project_revised");
        await appendEvent(tx, {
          projectId: project.id,
          actorUserId: input.actorUserId,
          projectRevision: revision,
          eventType: "project_closed",
          subjectKind: "project",
          subjectId: project.id,
          operationRecordId: operation.id,
          hooks,
          createdAt: now,
        });
        return { replayed: false, project: closed };
      });
    },

    async isRegisteredCustomer(userId: string): Promise<boolean> {
      const [account] = await database
        .select({ email: user.email, role: user.role })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      return Boolean(
        account && account.role === "user" && !guestRegex.test(account.email)
      );
    },

    listProjects(actorUserId: string) {
      return database
        .select({
          id: studyJourneyProject.id,
          status: studyJourneyProject.status,
          revision: studyJourneyProject.revision,
          createdAt: studyJourneyProject.createdAt,
          updatedAt: studyJourneyProject.updatedAt,
          closedAt: studyJourneyProject.closedAt,
        })
        .from(studyJourneyProject)
        .leftJoin(
          projectMembership,
          and(
            eq(projectMembership.projectId, studyJourneyProject.id),
            eq(projectMembership.userId, actorUserId),
            eq(projectMembership.status, "active")
          )
        )
        .where(
          and(
            eq(studyJourneyProject.status, "active"),
            or(
              eq(studyJourneyProject.ownerUserId, actorUserId),
              eq(projectMembership.userId, actorUserId)
            )
          )
        )
        .orderBy(
          desc(studyJourneyProject.createdAt),
          desc(studyJourneyProject.id)
        );
    },

    async getProjectForActor(input: {
      actorUserId: string;
      projectId: string;
    }) {
      const [project] = await database
        .select({
          id: studyJourneyProject.id,
          status: studyJourneyProject.status,
          revision: studyJourneyProject.revision,
          createdAt: studyJourneyProject.createdAt,
          updatedAt: studyJourneyProject.updatedAt,
          closedAt: studyJourneyProject.closedAt,
        })
        .from(studyJourneyProject)
        .leftJoin(
          projectMembership,
          and(
            eq(projectMembership.projectId, studyJourneyProject.id),
            eq(projectMembership.userId, input.actorUserId),
            eq(projectMembership.status, "active")
          )
        )
        .where(
          and(
            eq(studyJourneyProject.id, input.projectId),
            eq(studyJourneyProject.status, "active"),
            or(
              eq(studyJourneyProject.ownerUserId, input.actorUserId),
              eq(projectMembership.userId, input.actorUserId)
            )
          )
        )
        .limit(1);
      if (!project) {
        throw new ProjectFoundationError("project_not_found");
      }
      return project;
    },

    async listProjectMembers(input: {
      actorUserId: string;
      projectId: string;
    }) {
      const rows = await database
        .select({
          id: projectMembership.id,
          userId: projectMembership.userId,
          status: projectMembership.status,
          createdAt: projectMembership.createdAt,
          updatedAt: projectMembership.updatedAt,
          acceptedAt: projectMembership.acceptedAt,
          revokedAt: projectMembership.revokedAt,
        })
        .from(studyJourneyProject)
        .leftJoin(
          projectMembership,
          eq(projectMembership.projectId, studyJourneyProject.id)
        )
        .where(
          and(
            eq(studyJourneyProject.id, input.projectId),
            eq(studyJourneyProject.ownerUserId, input.actorUserId),
            eq(studyJourneyProject.status, "active")
          )
        )
        .orderBy(desc(projectMembership.createdAt), desc(projectMembership.id));
      if (rows.length === 0) {
        throw new ProjectFoundationError("project_not_found");
      }
      return rows
        .filter((row) => row.id !== null)
        .map((row) => ({
          id: row.id as string,
          userId: row.userId as string,
          status: row.status as "pending" | "active" | "revoked",
          createdAt: row.createdAt as Date,
          updatedAt: row.updatedAt as Date,
          acceptedAt: row.acceptedAt,
          revokedAt: row.revokedAt,
        }));
    },

    listPendingInvitations(actorUserId: string) {
      return database
        .select({
          membershipId: projectMembership.id,
          projectId: studyJourneyProject.id,
          projectRevision: studyJourneyProject.revision,
          status: projectMembership.status,
          createdAt: projectMembership.createdAt,
          updatedAt: projectMembership.updatedAt,
        })
        .from(projectMembership)
        .innerJoin(
          studyJourneyProject,
          eq(studyJourneyProject.id, projectMembership.projectId)
        )
        .where(
          and(
            eq(projectMembership.userId, actorUserId),
            eq(projectMembership.status, "pending"),
            eq(studyJourneyProject.status, "active")
          )
        )
        .orderBy(desc(projectMembership.createdAt), desc(projectMembership.id));
    },

    inviteProjectMember(input: {
      actorUserId: string;
      projectId: string;
      targetUserId: string;
      expectedRevision: number;
      operationId: string;
      now?: Date;
    }): Promise<{ replayed: boolean; project: ProjectFoundationProject }> {
      const operationId = validateProjectOperationId(input.operationId);
      if (
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 1
      ) {
        throw new ProjectFoundationError("invalid_request");
      }
      const operationType = "membership_invite" as const;
      const now = input.now ?? new Date();
      const requestHash = hashProjectOperationRequest({
        expectedRevision: input.expectedRevision,
        projectId: input.projectId,
        targetUserId: input.targetUserId,
      });

      return database.transaction(async (tx) => {
        const operation = await claimOperation(
          tx,
          {
            actorUserId: input.actorUserId,
            operationId,
            operationType,
            requestHash,
            resultId: input.projectId,
            resultKind: "project",
            replayResultKinds: ["project", "membership"],
            compareHashOnly: true,
          },
          hooks
        );
        await assertCustomerActor(tx, input.actorUserId);
        const project = await lockProject(tx, input.projectId);
        if (project.ownerUserId !== input.actorUserId) {
          throw new ProjectFoundationError("project_forbidden");
        }

        if (operation.replayed) {
          if (operation.resultKind === "project") {
            if (operation.resultId !== project.id) {
              throw new ProjectFoundationError("integrity_conflict");
            }
            if ((await operationEvents(tx, operation.id)).length !== 0) {
              throw new ProjectFoundationError("integrity_conflict");
            }
          } else {
            const [membership] = await tx
              .select({ id: projectMembership.id })
              .from(projectMembership)
              .where(
                and(
                  eq(projectMembership.id, operation.resultId),
                  eq(projectMembership.projectId, project.id),
                  eq(projectMembership.userId, input.targetUserId)
                )
              )
              .for("update")
              .limit(1);
            if (!membership) {
              throw new ProjectFoundationError("integrity_conflict");
            }
            await assertMembershipOperationEvent(tx, {
              operationRecordId: operation.id,
              projectId: project.id,
              membershipId: membership.id,
            });
          }
          return { replayed: true, project };
        }

        if (project.status !== "active") {
          throw new ProjectFoundationError("project_closed");
        }
        if (project.revision !== input.expectedRevision) {
          throw new ProjectFoundationError("revision_conflict");
        }

        const [existingMembership] = await tx
          .select({ id: projectMembership.id })
          .from(projectMembership)
          .where(
            and(
              eq(projectMembership.projectId, project.id),
              eq(projectMembership.userId, input.targetUserId)
            )
          )
          .for("update")
          .limit(1);
        if (existingMembership || input.targetUserId === project.ownerUserId) {
          return { replayed: false, project };
        }

        const [target] = await tx
          .select({ email: user.email, role: user.role })
          .from(user)
          .where(eq(user.id, input.targetUserId))
          .limit(1);
        if (
          !target ||
          target.role !== "user" ||
          guestRegex.test(target.email)
        ) {
          return { replayed: false, project };
        }

        const [membership] = await tx
          .insert(projectMembership)
          .values({
            projectId: project.id,
            userId: input.targetUserId,
            status: "pending",
            invitedByUserId: input.actorUserId,
            createdAt: now,
            updatedAt: now,
            acceptedAt: null,
            revokedAt: null,
          })
          .returning({ id: projectMembership.id });
        if (!membership) {
          throw new ProjectFoundationError("integrity_conflict");
        }
        await afterWrite(hooks, "membership_created");

        const [updatedOperation] = await tx
          .update(projectOperation)
          .set({ resultKind: "membership", resultId: membership.id })
          .where(eq(projectOperation.id, operation.id))
          .returning({ id: projectOperation.id });
        if (!updatedOperation) {
          throw new ProjectFoundationError("integrity_conflict");
        }
        await afterWrite(hooks, "operation_result_updated");

        const revision = project.revision + 1;
        const [updatedProject] = await tx
          .update(studyJourneyProject)
          .set({ revision, updatedAt: now })
          .where(
            and(
              eq(studyJourneyProject.id, project.id),
              eq(studyJourneyProject.revision, project.revision),
              eq(studyJourneyProject.status, "active")
            )
          )
          .returning();
        if (!updatedProject) {
          throw new ProjectFoundationError("revision_conflict");
        }
        await afterWrite(hooks, "project_revised");
        await appendEvent(tx, {
          projectId: project.id,
          actorUserId: input.actorUserId,
          projectRevision: revision,
          eventType: "membership_state_changed",
          subjectKind: "membership",
          subjectId: membership.id,
          operationRecordId: operation.id,
          hooks,
          createdAt: now,
        });
        return { replayed: false, project: updatedProject };
      });
    },

    acceptProjectMembership(input: {
      actorUserId: string;
      projectId: string;
      membershipId: string;
      expectedRevision: number;
      operationId: string;
      now?: Date;
    }): Promise<ProjectOperationOutcome> {
      const operationId = validateProjectOperationId(input.operationId);
      if (
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 1
      ) {
        throw new ProjectFoundationError("invalid_request");
      }
      const operationType = "membership_accept" as const;
      const now = input.now ?? new Date();
      const requestHash = hashProjectOperationRequest({
        expectedRevision: input.expectedRevision,
        membershipId: input.membershipId,
        projectId: input.projectId,
      });

      return database.transaction(async (tx) => {
        const operation = await claimOperation(
          tx,
          {
            actorUserId: input.actorUserId,
            operationId,
            operationType,
            requestHash,
            resultId: input.membershipId,
            resultKind: "membership",
            replayResultKinds: ["membership"],
            compareHashOnly: true,
          },
          hooks
        );
        await assertCustomerActor(tx, input.actorUserId);
        const project = await lockProject(tx, input.projectId);
        const [membership] = await tx
          .select()
          .from(projectMembership)
          .where(
            and(
              eq(projectMembership.id, input.membershipId),
              eq(projectMembership.projectId, project.id)
            )
          )
          .for("update")
          .limit(1);
        if (!membership || membership.userId !== input.actorUserId) {
          throw new ProjectFoundationError("project_forbidden");
        }
        if (operation.replayed) {
          if (
            operation.resultKind !== "membership" ||
            operation.resultId !== membership.id
          ) {
            throw new ProjectFoundationError("integrity_conflict");
          }
          if (membership.status === "revoked") {
            throw new ProjectFoundationError("project_forbidden");
          }
          if (membership.status !== "active") {
            throw new ProjectFoundationError("integrity_conflict");
          }
          await assertMembershipOperationEvent(tx, {
            operationRecordId: operation.id,
            projectId: project.id,
            membershipId: membership.id,
          });
          return { replayed: true, project };
        }
        if (project.status !== "active") {
          throw new ProjectFoundationError("project_closed");
        }
        if (project.revision !== input.expectedRevision) {
          throw new ProjectFoundationError("revision_conflict");
        }
        if (membership.status !== "pending") {
          throw new ProjectFoundationError("state_conflict");
        }
        const [updatedMembership] = await tx
          .update(projectMembership)
          .set({ status: "active", acceptedAt: now, updatedAt: now })
          .where(
            and(
              eq(projectMembership.id, membership.id),
              eq(projectMembership.projectId, project.id),
              eq(projectMembership.status, "pending")
            )
          )
          .returning({ id: projectMembership.id });
        if (!updatedMembership) {
          throw new ProjectFoundationError("state_conflict");
        }
        await afterWrite(hooks, "membership_updated");
        const revision = project.revision + 1;
        const [updatedProject] = await tx
          .update(studyJourneyProject)
          .set({ revision, updatedAt: now })
          .where(
            and(
              eq(studyJourneyProject.id, project.id),
              eq(studyJourneyProject.revision, project.revision),
              eq(studyJourneyProject.status, "active")
            )
          )
          .returning();
        if (!updatedProject) {
          throw new ProjectFoundationError("revision_conflict");
        }
        await afterWrite(hooks, "project_revised");
        await appendEvent(tx, {
          projectId: project.id,
          actorUserId: input.actorUserId,
          projectRevision: revision,
          eventType: "membership_state_changed",
          subjectKind: "membership",
          subjectId: membership.id,
          operationRecordId: operation.id,
          hooks,
          createdAt: now,
        });
        return { replayed: false, project: updatedProject };
      });
    },

    revokeProjectMembership(input: {
      actorUserId: string;
      projectId: string;
      membershipId: string;
      expectedRevision: number;
      operationId: string;
      now?: Date;
    }): Promise<ProjectOperationOutcome> {
      const operationId = validateProjectOperationId(input.operationId);
      if (
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 1
      ) {
        throw new ProjectFoundationError("invalid_request");
      }
      const operationType = "membership_revoke" as const;
      const now = input.now ?? new Date();
      const requestHash = hashProjectOperationRequest({
        expectedRevision: input.expectedRevision,
        membershipId: input.membershipId,
        projectId: input.projectId,
      });

      return database.transaction(async (tx) => {
        const operation = await claimOperation(
          tx,
          {
            actorUserId: input.actorUserId,
            operationId,
            operationType,
            requestHash,
            resultId: input.membershipId,
            resultKind: "membership",
            replayResultKinds: ["membership"],
            compareHashOnly: true,
          },
          hooks
        );
        await assertCustomerActor(tx, input.actorUserId);
        const project = await lockProject(tx, input.projectId);
        if (project.ownerUserId !== input.actorUserId) {
          throw new ProjectFoundationError("project_forbidden");
        }
        const [membership] = await tx
          .select()
          .from(projectMembership)
          .where(
            and(
              eq(projectMembership.id, input.membershipId),
              eq(projectMembership.projectId, project.id)
            )
          )
          .for("update")
          .limit(1);
        if (!membership || membership.userId === project.ownerUserId) {
          throw new ProjectFoundationError("project_not_found");
        }
        if (operation.replayed) {
          if (
            operation.resultKind !== "membership" ||
            operation.resultId !== membership.id ||
            membership.status !== "revoked"
          ) {
            throw new ProjectFoundationError("integrity_conflict");
          }
          await assertMembershipOperationEvent(tx, {
            operationRecordId: operation.id,
            projectId: project.id,
            membershipId: membership.id,
          });
          return { replayed: true, project };
        }
        if (project.status !== "active") {
          throw new ProjectFoundationError("project_closed");
        }
        if (project.revision !== input.expectedRevision) {
          throw new ProjectFoundationError("revision_conflict");
        }
        if (membership.status !== "pending" && membership.status !== "active") {
          throw new ProjectFoundationError("state_conflict");
        }

        const [updatedMembership] = await tx
          .update(projectMembership)
          .set({ status: "revoked", revokedAt: now, updatedAt: now })
          .where(
            and(
              eq(projectMembership.id, membership.id),
              eq(projectMembership.projectId, project.id),
              or(
                eq(projectMembership.status, "pending"),
                eq(projectMembership.status, "active")
              )
            )
          )
          .returning({ id: projectMembership.id });
        if (!updatedMembership) {
          throw new ProjectFoundationError("state_conflict");
        }
        await afterWrite(hooks, "membership_updated");
        const revision = project.revision + 1;
        const [updatedProject] = await tx
          .update(studyJourneyProject)
          .set({ revision, updatedAt: now })
          .where(
            and(
              eq(studyJourneyProject.id, project.id),
              eq(studyJourneyProject.revision, project.revision),
              eq(studyJourneyProject.status, "active")
            )
          )
          .returning();
        if (!updatedProject) {
          throw new ProjectFoundationError("revision_conflict");
        }
        await afterWrite(hooks, "project_revised");
        await appendEvent(tx, {
          projectId: project.id,
          actorUserId: input.actorUserId,
          projectRevision: revision,
          eventType: "membership_state_changed",
          subjectKind: "membership",
          subjectId: membership.id,
          operationRecordId: operation.id,
          hooks,
          createdAt: now,
        });
        return { replayed: false, project: updatedProject };
      });
    },

    createProjectChat(input: {
      actorUserId: string;
      projectId: string;
      operationId: string;
      title?: string;
      now?: Date;
    }): Promise<ProjectChatOutcome> {
      const operationId = validateProjectOperationId(input.operationId);
      const title = input.title?.trim() || "New conversation";
      if (title.length > 1000) {
        throw new ProjectFoundationError("invalid_request");
      }
      const operationType = "project_chat_create" as const;
      const now = input.now ?? new Date();
      const requestHash = hashProjectOperationRequest({
        projectId: input.projectId,
        title,
      });
      const newChatId = randomUUID();

      return database.transaction(async (tx) => {
        const operation = await claimOperation(
          tx,
          {
            actorUserId: input.actorUserId,
            operationId,
            operationType,
            requestHash,
            resultId: newChatId,
            resultKind: "chat",
          },
          hooks
        );
        const project = await lockProject(tx, input.projectId);
        await assertProjectAuthority(
          tx,
          project,
          input.actorUserId,
          operation.replayed ? "chat_history" : "project_write"
        );

        if (operation.replayed) {
          const [association] = await tx
            .select({
              chatId: projectConversation.chatId,
              createdByUserId: projectConversation.createdByUserId,
            })
            .from(projectConversation)
            .innerJoin(chat, eq(chat.id, projectConversation.chatId))
            .innerJoin(
              immigrationConversation,
              eq(immigrationConversation.chatId, projectConversation.chatId)
            )
            .where(
              and(
                eq(projectConversation.chatId, operation.resultId),
                eq(projectConversation.projectId, project.id),
                eq(projectConversation.createdByUserId, input.actorUserId),
                eq(chat.userId, input.actorUserId)
              )
            )
            .limit(1);
          if (!association) {
            throw new ProjectFoundationError("project_forbidden");
          }
          return {
            replayed: true,
            project,
            chatId: association.chatId,
            createdByUserId: association.createdByUserId,
          };
        }

        const [createdChat] = await tx
          .insert(chat)
          .values({
            id: newChatId,
            createdAt: now,
            title,
            userId: input.actorUserId,
            visibility: "private",
          })
          .returning({ id: chat.id, userId: chat.userId });
        if (!createdChat || createdChat.userId !== input.actorUserId) {
          throw new ProjectFoundationError("integrity_conflict");
        }
        await afterWrite(hooks, "chat_created");

        await tx.insert(immigrationConversation).values({
          chatId: newChatId,
          legalMatterId: null,
          title,
          createdAt: now,
          updatedAt: now,
        });
        await afterWrite(hooks, "immigration_conversation_created");

        await tx.insert(projectConversation).values({
          chatId: newChatId,
          projectId: project.id,
          createdByUserId: input.actorUserId,
          createdAt: now,
        });
        await afterWrite(hooks, "project_conversation_created");

        const revision = project.revision + 1;
        const [updatedProject] = await tx
          .update(studyJourneyProject)
          .set({ revision, updatedAt: now })
          .where(
            and(
              eq(studyJourneyProject.id, project.id),
              eq(studyJourneyProject.revision, project.revision),
              eq(studyJourneyProject.status, "active")
            )
          )
          .returning();
        if (!updatedProject) {
          throw new ProjectFoundationError("revision_conflict");
        }
        await afterWrite(hooks, "project_revised");
        await appendEvent(tx, {
          projectId: project.id,
          actorUserId: input.actorUserId,
          projectRevision: revision,
          eventType: "project_chat_created",
          subjectKind: "chat",
          subjectId: newChatId,
          operationRecordId: operation.id,
          hooks,
          createdAt: now,
        });
        return {
          replayed: false,
          project: updatedProject,
          chatId: newChatId,
          createdByUserId: createdChat.userId,
        };
      });
    },

    authorizeProjectAccess(input: {
      actorUserId: string;
      projectId: string;
      intent: ProjectAccessIntent;
      chatId?: string;
    }): Promise<ProjectFoundationProject> {
      return database.transaction(async (tx) => {
        const project = await lockProject(tx, input.projectId);
        await assertProjectAuthority(
          tx,
          project,
          input.actorUserId,
          input.intent
        );
        if (input.intent === "chat_history") {
          if (!input.chatId) {
            throw new ProjectFoundationError("invalid_request");
          }
          const [ownedChat] = await tx
            .select({ chatId: projectConversation.chatId })
            .from(projectConversation)
            .innerJoin(chat, eq(chat.id, projectConversation.chatId))
            .where(
              and(
                eq(projectConversation.projectId, project.id),
                eq(projectConversation.chatId, input.chatId),
                eq(projectConversation.createdByUserId, input.actorUserId),
                eq(chat.userId, input.actorUserId)
              )
            )
            .limit(1);
          if (!ownedChat) {
            throw new ProjectFoundationError("project_forbidden");
          }
        }
        return project;
      });
    },

    getProjectChatOrigin(
      chatId: string
    ): Promise<{ projectId: string } | null> {
      return database
        .select({ projectId: projectConversation.projectId })
        .from(projectConversation)
        .where(eq(projectConversation.chatId, chatId))
        .limit(1)
        .then((rows) => rows[0] ?? null);
    },

    listOwnedProjectChats(input: {
      actorUserId: string;
      projectId: string;
      limit: number;
      cursor: PaginationCursor | null;
    }) {
      const predicates = [
        eq(projectConversation.projectId, input.projectId),
        eq(projectConversation.createdByUserId, input.actorUserId),
        eq(chat.userId, input.actorUserId),
        sql`exists (
          select 1 from "User" projectChatActor
          where projectChatActor."id" = ${input.actorUserId}
            and projectChatActor."role" = 'user'
            and projectChatActor."email" !~* ${guestRegex.source}
        )`,
        or(
          eq(studyJourneyProject.ownerUserId, input.actorUserId),
          sql`exists (
            select 1 from "ProjectMembership" pm
            where pm."projectId" = ${studyJourneyProject.id}
              and pm."userId" = ${input.actorUserId}
              and pm."status" = 'active'
          )`
        ),
      ];
      if (input.cursor) {
        const cursorDate = new Date(input.cursor.timestamp);
        predicates.push(
          or(
            lt(projectConversation.createdAt, cursorDate),
            and(
              eq(projectConversation.createdAt, cursorDate),
              lt(projectConversation.chatId, input.cursor.id)
            )
          ) as (typeof predicates)[number]
        );
      }
      return database
        .select({
          chatId: projectConversation.chatId,
          projectId: projectConversation.projectId,
          title: immigrationConversation.title,
          chatTitle: chat.title,
          createdAt: projectConversation.createdAt,
          updatedAt: immigrationConversation.updatedAt,
          projectStatus: studyJourneyProject.status,
        })
        .from(projectConversation)
        .innerJoin(
          studyJourneyProject,
          eq(studyJourneyProject.id, projectConversation.projectId)
        )
        .innerJoin(chat, eq(chat.id, projectConversation.chatId))
        .innerJoin(
          immigrationConversation,
          eq(immigrationConversation.chatId, projectConversation.chatId)
        )
        .where(and(...predicates))
        .orderBy(
          desc(projectConversation.createdAt),
          desc(projectConversation.chatId)
        )
        .limit(Math.max(1, Math.min(input.limit, 100)) + 1)
        .then((rows) => {
          const hasMore = rows.length > Math.max(1, Math.min(input.limit, 100));
          const conversations = rows
            .slice(0, Math.max(1, Math.min(input.limit, 100)))
            .map(({ projectStatus, ...row }) => ({
              ...row,
              origin: "project" as const,
              readOnly:
                projectStatus !== "active" || !projectChatWritesEnabled(),
            }));
          return { conversations, hasMore };
        });
    },

    withProjectChatTurnAdmission<T>(input: {
      actorUserId: string;
      chatId: string;
      claim: (tx: Transaction) => Promise<T>;
    }): Promise<T> {
      return database.transaction(async (tx) => {
        const [association] = await tx
          .select({ projectId: projectConversation.projectId })
          .from(projectConversation)
          .where(eq(projectConversation.chatId, input.chatId))
          .limit(1);
        if (!association) {
          return input.claim(tx);
        }

        const project = await lockProject(tx, association.projectId);
        await assertCustomerActor(tx, input.actorUserId);
        await assertProjectAuthority(
          tx,
          project,
          input.actorUserId,
          "project_write"
        );
        if (!projectChatWritesEnabled()) {
          throw new ProjectFoundationError("project_forbidden");
        }
        const [ownedChat] = await tx
          .select({ chatId: projectConversation.chatId })
          .from(projectConversation)
          .innerJoin(chat, eq(chat.id, projectConversation.chatId))
          .where(
            and(
              eq(projectConversation.projectId, project.id),
              eq(projectConversation.chatId, input.chatId),
              eq(projectConversation.createdByUserId, input.actorUserId),
              eq(chat.userId, input.actorUserId)
            )
          )
          .limit(1);
        if (!ownedChat) {
          throw new ProjectFoundationError("project_forbidden");
        }
        return input.claim(tx);
      });
    },

    updateOwnedProjectChat(input: {
      actorUserId: string;
      chatId: string;
      title?: string | null;
      legalMatterId?: string | null;
      now?: Date;
    }) {
      if (input.legalMatterId !== undefined && input.legalMatterId !== null) {
        throw new ProjectFoundationError("invalid_request");
      }
      const now = input.now ?? new Date();
      return database.transaction(async (tx) => {
        const [association] = await tx
          .select({ projectId: projectConversation.projectId })
          .from(projectConversation)
          .where(eq(projectConversation.chatId, input.chatId))
          .limit(1);
        if (!association) {
          return null;
        }

        const project = await lockProject(tx, association.projectId);
        await assertCustomerActor(tx, input.actorUserId);
        await assertProjectAuthority(
          tx,
          project,
          input.actorUserId,
          "project_write"
        );
        if (!projectChatWritesEnabled()) {
          throw new ProjectFoundationError("project_forbidden");
        }
        const [ownedChat] = await tx
          .select({ chatId: chat.id })
          .from(projectConversation)
          .innerJoin(chat, eq(chat.id, projectConversation.chatId))
          .where(
            and(
              eq(projectConversation.projectId, project.id),
              eq(projectConversation.chatId, input.chatId),
              eq(projectConversation.createdByUserId, input.actorUserId),
              eq(chat.userId, input.actorUserId)
            )
          )
          .limit(1);
        if (!ownedChat) {
          throw new ProjectFoundationError("project_forbidden");
        }
        const [conversation] = await tx
          .update(immigrationConversation)
          .set({
            ...(input.title !== undefined ? { title: input.title } : {}),
            updatedAt: now,
          })
          .where(eq(immigrationConversation.chatId, input.chatId))
          .returning();
        if (!conversation) {
          throw new ProjectFoundationError("integrity_conflict");
        }
        if (input.title !== undefined) {
          await tx
            .update(chat)
            .set({ title: input.title || "Project conversation" })
            .where(eq(chat.id, input.chatId));
        }
        return { ...conversation, projectId: project.id };
      });
    },
  };
}

const repository = createProjectFoundationRepository();

export const projectFoundationRepository = repository;

export const createStudyJourneyProject = repository.createProject;
export const closeStudyJourneyProject = repository.closeProject;
export const createProjectChatFoundation = repository.createProjectChat;
export const authorizeStudyJourneyProjectAccess =
  repository.authorizeProjectAccess;
