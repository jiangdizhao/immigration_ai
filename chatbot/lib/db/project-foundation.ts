import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  hashProjectOperationRequest,
  ProjectFoundationError,
  resolveProjectOperationReplay,
  validateProjectOperationId,
} from "./project-foundation-utils";
import { getLazyDatabase } from "./runtime-client";
import {
  chat,
  immigrationConversation,
  projectConversation,
  projectEvent,
  projectMembership,
  projectOperation,
  studyJourneyProject,
} from "./schema";

export type { ProjectFoundationErrorCode } from "./project-foundation-utils";
export {
  canonicalProjectOperationRequest,
  hashProjectOperationRequest,
  ProjectFoundationError,
  resolveProjectOperationReplay,
  validateProjectOperationId,
} from "./project-foundation-utils";

const db = getLazyDatabase();
type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const PROJECT_OPERATION_TYPES = [
  "project_create",
  "project_close",
  "membership_invite",
  "membership_accept",
  "membership_revoke",
  "project_chat_create",
] as const;

export type ProjectOperationType = (typeof PROJECT_OPERATION_TYPES)[number];

export const PROJECT_EVENT_TYPES = [
  "project_created",
  "membership_state_changed",
  "project_chat_created",
  "project_closed",
] as const;

export type ProjectEventType = (typeof PROJECT_EVENT_TYPES)[number];

export type ProjectFoundationWriteBoundary =
  | "operation_claimed"
  | "project_created"
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
    resultKind: "project" | "chat";
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
  return {
    ...existing,
    ...resolveProjectOperationReplay(existing, {
      requestHash: input.requestHash,
      resultKind: input.resultKind,
    }),
  };
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
    subjectKind: "project" | "chat";
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
  };
}

const repository = createProjectFoundationRepository();

export const createStudyJourneyProject = repository.createProject;
export const closeStudyJourneyProject = repository.closeProject;
export const createProjectChatFoundation = repository.createProjectChat;
export const authorizeStudyJourneyProjectAccess =
  repository.authorizeProjectAccess;
