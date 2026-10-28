import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, lt, or } from "drizzle-orm";
import { ProjectHumanMessagingError } from "@/lib/project-human-messaging/errors";
import {
  canAccessProjectHumanThread,
  canOwnerSendToCurrentLawyer,
  hashHumanMessageRequest,
  hashThreadConsentRequest,
  isNonGuestMessagingAccount,
  PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
  PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
  PROJECT_HUMAN_MESSAGING_PURPOSE,
  type ProjectHumanMessagingActor,
  resolveProjectHumanThreadListScope,
} from "@/lib/project-human-messaging/policy";
import { hashStaffEmail } from "@/lib/project-staff-assignments/policy";
import { getLazyDatabase } from "./runtime-client";
import {
  projectEvent,
  projectHumanMessage,
  projectHumanThread,
  projectOperation,
  projectStaffAssignment,
  projectThreadParticipationConsent,
  studyJourneyProject,
  user,
} from "./schema";

const db = getLazyDatabase();
type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type Account = {
  id: string;
  email: string;
  role: "user" | "lawyer" | "admin";
  emailVerifiedAt: Date | null;
};
type ProjectRow = typeof studyJourneyProject.$inferSelect;
type ThreadRow = typeof projectHumanThread.$inferSelect;
type ConsentRow = typeof projectThreadParticipationConsent.$inferSelect;
type AssignmentRow = typeof projectStaffAssignment.$inferSelect;
type OperationType =
  | "project_thread_participation_consent_create"
  | "project_thread_participation_consent_withdraw"
  | "project_human_message_send";
type ResultKind =
  | "project_thread_participation_consent"
  | "project_human_message";

function currentAccount(account: Account | undefined): account is Account {
  return Boolean(account && isNonGuestMessagingAccount(account.email));
}

function currentOwner(account: Account | undefined, project: ProjectRow) {
  return Boolean(
    currentAccount(account) &&
      account.role === "user" &&
      account.id === project.ownerUserId
  );
}

function currentLawyerMatches(
  account: Account | undefined,
  assignment: AssignmentRow
) {
  return Boolean(
    currentAccount(account) &&
      account.role === "lawyer" &&
      account.emailVerifiedAt &&
      assignment.status === "active" &&
      assignment.purpose === "project_staff_collaboration" &&
      hashStaffEmail(account.email) === assignment.staffEmailSha256
  );
}

function notFound(): never {
  throw new ProjectHumanMessagingError("not_found");
}

async function lockProject(tx: Transaction, projectId: string) {
  const [project] = await tx
    .select()
    .from(studyJourneyProject)
    .where(eq(studyJourneyProject.id, projectId))
    .for("update")
    .limit(1);
  if (!project || project.status !== "active") {
    notFound();
  }
  return project;
}

async function lockAccounts(tx: Transaction, ids: readonly string[]) {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) {
    return new Map<string, Account>();
  }
  const firstId = unique[0] ?? "";
  const accounts = await tx
    .select({
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
    })
    .from(user)
    .where(
      unique.length === 1
        ? eq(user.id, firstId)
        : or(...unique.map((id) => eq(user.id, id)))
    )
    .orderBy(asc(user.id))
    .for("no key update");
  return new Map(accounts.map((account) => [account.id, account as Account]));
}

async function lockAssignment(
  tx: Transaction,
  projectId: string,
  assignmentId: string,
  lawyerUserId: string
) {
  const [assignment] = await tx
    .select()
    .from(projectStaffAssignment)
    .where(
      and(
        eq(projectStaffAssignment.id, assignmentId),
        eq(projectStaffAssignment.projectId, projectId),
        eq(projectStaffAssignment.staffUserId, lawyerUserId)
      )
    )
    .for("update")
    .limit(1);
  if (!assignment) {
    notFound();
  }
  return assignment;
}

async function claimOperation(
  tx: Transaction,
  input: {
    actorUserId: string;
    operationId: string;
    operationType: OperationType;
    requestHash: string;
    resultId: string;
    resultKind: ResultKind;
  }
) {
  const [inserted] = await tx
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
      requestHash: projectOperation.requestHash,
    });
  if (inserted) {
    return { ...inserted, replayed: false };
  }

  const [existing] = await tx
    .select({
      id: projectOperation.id,
      resultId: projectOperation.resultId,
      resultKind: projectOperation.resultKind,
      requestHash: projectOperation.requestHash,
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
  if (!existing || existing.requestHash !== input.requestHash) {
    throw new ProjectHumanMessagingError("idempotency_conflict");
  }
  if (existing.resultKind !== input.resultKind) {
    throw new ProjectHumanMessagingError("integrity_conflict");
  }
  return { ...existing, replayed: true };
}

async function advanceProject(tx: Transaction, project: ProjectRow, now: Date) {
  const nextRevision = project.revision + 1;
  const [updated] = await tx
    .update(studyJourneyProject)
    .set({ revision: nextRevision, updatedAt: now })
    .where(
      and(
        eq(studyJourneyProject.id, project.id),
        eq(studyJourneyProject.revision, project.revision),
        eq(studyJourneyProject.status, "active")
      )
    )
    .returning({ revision: studyJourneyProject.revision });
  if (!updated) {
    throw new ProjectHumanMessagingError("revision_conflict");
  }
  return updated.revision;
}

async function appendConsentEvent(
  tx: Transaction,
  input: {
    projectId: string;
    actorUserId: string;
    projectRevision: number;
    eventType:
      | "project_thread_participation_consent_created"
      | "project_thread_participation_consent_withdrawn";
    consentId: string;
    operationRecordId: string;
    createdAt: Date;
  }
) {
  await tx.insert(projectEvent).values({
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    projectRevision: input.projectRevision,
    eventType: input.eventType,
    subjectKind: "project_thread_participation_consent",
    subjectId: input.consentId,
    operationRecordId: input.operationRecordId,
    createdAt: input.createdAt,
  });
}

type ThreadContext = {
  project: ProjectRow;
  thread: ThreadRow;
  consent: ConsentRow;
  assignment: AssignmentRow;
  actor: Account;
  owner: Account;
  lawyer: Account;
  policyActor: ProjectHumanMessagingActor;
};

async function loadThreadContext(
  tx: Transaction,
  input: { actorUserId: string; projectId: string; threadId: string }
): Promise<ThreadContext> {
  const project = await lockProject(tx, input.projectId);
  const [identity] = await tx
    .select()
    .from(projectHumanThread)
    .where(
      and(
        eq(projectHumanThread.id, input.threadId),
        eq(projectHumanThread.projectId, input.projectId)
      )
    )
    .limit(1);
  if (!identity) {
    notFound();
  }
  const accounts = await lockAccounts(tx, [
    input.actorUserId,
    identity.ownerUserId,
    identity.lawyerUserId,
  ]);
  const actor = accounts.get(input.actorUserId);
  const owner = accounts.get(identity.ownerUserId);
  const lawyer = accounts.get(identity.lawyerUserId);
  if (!(actor && owner && lawyer)) {
    notFound();
  }
  const assignment = await lockAssignment(
    tx,
    input.projectId,
    identity.assignmentId,
    identity.lawyerUserId
  );
  const [thread] = await tx
    .select()
    .from(projectHumanThread)
    .where(
      and(
        eq(projectHumanThread.id, input.threadId),
        eq(projectHumanThread.projectId, input.projectId)
      )
    )
    .for("update")
    .limit(1);
  const [consent] = await tx
    .select()
    .from(projectThreadParticipationConsent)
    .where(eq(projectThreadParticipationConsent.threadId, input.threadId))
    .for("update")
    .limit(1);
  if (!thread || !consent) {
    throw new ProjectHumanMessagingError("integrity_conflict");
  }
  if (
    thread.ownerUserId !== project.ownerUserId ||
    thread.assignmentId !== assignment.id ||
    thread.lawyerUserId !== assignment.staffUserId ||
    consent.threadId !== thread.id ||
    consent.projectId !== project.id ||
    consent.ownerUserId !== project.ownerUserId ||
    consent.assignmentId !== assignment.id ||
    consent.lawyerUserId !== assignment.staffUserId
  ) {
    throw new ProjectHumanMessagingError("integrity_conflict");
  }
  return {
    project,
    thread,
    consent,
    assignment,
    actor,
    owner,
    lawyer,
    policyActor: {
      userId: actor.id,
      role: actor.role,
      nonGuest: currentAccount(actor),
      emailVerified: Boolean(actor.emailVerifiedAt),
    },
  };
}

function policyAuthority(context: ThreadContext) {
  return {
    projectId: context.project.id,
    projectActive: context.project.status === "active",
    ownerUserId: context.project.ownerUserId,
    ownerEligible: currentOwner(context.owner, context.project),
    threadId: context.thread.id,
    threadProjectId: context.thread.projectId,
    threadActive: context.thread.status === "active",
    assignmentId: context.assignment.id,
    assignmentProjectId: context.assignment.projectId,
    assignmentStaffUserId: context.assignment.staffUserId,
    assignmentActive: context.assignment.status === "active",
    assignedLawyerEligible: currentLawyerMatches(
      context.lawyer,
      context.assignment
    ),
    consentStatus: context.consent.status,
  } as const;
}

function requireThreadRead(context: ThreadContext) {
  if (
    !canAccessProjectHumanThread(
      context.policyActor,
      policyAuthority(context),
      "read"
    )
  ) {
    notFound();
  }
}

function requireThreadSend(context: ThreadContext) {
  const authority = policyAuthority(context);
  const ownerCanSend = canOwnerSendToCurrentLawyer(
    context.policyActor,
    authority
  );
  const lawyerCanSend = canAccessProjectHumanThread(
    context.policyActor,
    authority,
    "send"
  );
  if (!(ownerCanSend || lawyerCanSend) || context.thread.status !== "active") {
    notFound();
  }
}

function requireOwner(context: ThreadContext) {
  if (!currentOwner(context.actor, context.project)) {
    notFound();
  }
}

function threadDto(thread: ThreadRow, consent: ConsentRow) {
  return {
    threadId: thread.id,
    projectId: thread.projectId,
    assignmentId: thread.assignmentId,
    ownerUserId: thread.ownerUserId,
    lawyerUserId: thread.lawyerUserId,
    purpose: thread.purpose,
    noticeVersion: thread.noticeVersion,
    noticeSha256: thread.noticeSha256,
    threadStatus: thread.status,
    consentStatus: consent.status,
    lastMessageSequence: thread.lastMessageSequence,
    createdAt: thread.createdAt,
    consentAcceptedAt: consent.acceptedAt,
    consentWithdrawnAt: consent.withdrawnAt,
  };
}

function threadPageResult(
  rows: Array<{ thread: ThreadRow; consent: ConsentRow }>,
  limit: number
) {
  const page = rows.slice(0, limit);
  const cursor = page.at(-1)?.thread;
  const hasMore = rows.length > limit;
  return {
    items: page.map(({ thread, consent }) => threadDto(thread, consent)),
    hasMore,
    nextCursor:
      hasMore && cursor
        ? {
            beforeCreatedAt: cursor.createdAt.toISOString(),
            beforeThreadId: cursor.id,
          }
        : null,
  };
}

export function createProjectHumanMessagingRepository(
  options: { database?: Database } = {}
) {
  const database = options.database ?? db;

  return {
    createThread(input: {
      actorUserId: string;
      projectId: string;
      assignmentId: string;
      lawyerUserId: string;
      expectedProjectRevision: number;
      operationId: string;
    }) {
      const requestHash = hashThreadConsentRequest({
        action: "create",
        assignmentId: input.assignmentId,
        expectedProjectRevision: input.expectedProjectRevision,
        lawyerUserId: input.lawyerUserId,
        noticeSha256: PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
        noticeVersion: PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
        operationId: input.operationId,
        projectId: input.projectId,
        purpose: PROJECT_HUMAN_MESSAGING_PURPOSE,
      });
      const threadId = randomUUID();
      const consentId = randomUUID();
      return database.transaction(async (tx) => {
        const operation = await claimOperation(tx, {
          actorUserId: input.actorUserId,
          operationId: input.operationId,
          operationType: "project_thread_participation_consent_create",
          requestHash,
          resultId: consentId,
          resultKind: "project_thread_participation_consent",
        });
        const project = await lockProject(tx, input.projectId);
        const accounts = await lockAccounts(tx, [
          input.actorUserId,
          input.lawyerUserId,
        ]);
        const owner = accounts.get(input.actorUserId);
        const lawyer = accounts.get(input.lawyerUserId);
        if (!owner || !currentOwner(owner, project)) {
          notFound();
        }
        if (operation.replayed) {
          const [consent] = await tx
            .select()
            .from(projectThreadParticipationConsent)
            .where(eq(projectThreadParticipationConsent.id, operation.resultId))
            .limit(1);
          if (
            !consent ||
            consent.projectId !== project.id ||
            consent.ownerUserId !== owner.id
          ) {
            throw new ProjectHumanMessagingError("integrity_conflict");
          }
          const context = await loadThreadContext(tx, {
            actorUserId: input.actorUserId,
            projectId: input.projectId,
            threadId: consent.threadId,
          });
          requireOwner(context);
          return {
            replayed: true,
            projectRevision: context.project.revision,
            ...threadDto(context.thread, context.consent),
          };
        }
        if (
          !currentAccount(lawyer) ||
          lawyer.role !== "lawyer" ||
          !lawyer.emailVerifiedAt
        ) {
          notFound();
        }
        const assignment = await lockAssignment(
          tx,
          input.projectId,
          input.assignmentId,
          input.lawyerUserId
        );
        if (
          project.revision !== input.expectedProjectRevision ||
          assignment.status !== "active" ||
          !currentLawyerMatches(lawyer, assignment)
        ) {
          throw new ProjectHumanMessagingError(
            project.revision !== input.expectedProjectRevision
              ? "revision_conflict"
              : "state_conflict"
          );
        }
        const now = new Date();
        const nextRevision = await advanceProject(tx, project, now);
        const operationRecordId = operation.id;
        await tx.insert(projectHumanThread).values({
          id: threadId,
          projectId: project.id,
          ownerUserId: owner.id,
          assignmentId: assignment.id,
          lawyerUserId: lawyer.id,
          purpose: PROJECT_HUMAN_MESSAGING_PURPOSE,
          noticeVersion: PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
          noticeSha256: PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
          createdAt: now,
        });
        await tx.insert(projectThreadParticipationConsent).values({
          id: consentId,
          threadId,
          projectId: project.id,
          ownerUserId: owner.id,
          assignmentId: assignment.id,
          lawyerUserId: lawyer.id,
          purpose: PROJECT_HUMAN_MESSAGING_PURPOSE,
          noticeVersion: PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
          noticeSha256: PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
          acceptedByUserId: owner.id,
          acceptedAt: now,
          createdOperationRecordId: operationRecordId,
          createdProjectRevision: nextRevision,
        });
        await appendConsentEvent(tx, {
          projectId: project.id,
          actorUserId: owner.id,
          projectRevision: nextRevision,
          eventType: "project_thread_participation_consent_created",
          consentId,
          operationRecordId,
          createdAt: now,
        });
        return {
          replayed: false,
          projectRevision: nextRevision,
          ...threadDto(
            {
              id: threadId,
              projectId: project.id,
              ownerUserId: owner.id,
              assignmentId: assignment.id,
              lawyerUserId: lawyer.id,
              purpose: PROJECT_HUMAN_MESSAGING_PURPOSE,
              noticeVersion: PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
              noticeSha256: PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
              status: "active",
              lastMessageSequence: 0,
              createdAt: now,
            },
            {
              id: consentId,
              threadId,
              projectId: project.id,
              ownerUserId: owner.id,
              assignmentId: assignment.id,
              lawyerUserId: lawyer.id,
              purpose: PROJECT_HUMAN_MESSAGING_PURPOSE,
              noticeVersion: PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
              noticeSha256: PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
              status: "active",
              acceptedByUserId: owner.id,
              acceptedAt: now,
              createdOperationRecordId: operationRecordId,
              createdProjectRevision: nextRevision,
              withdrawnByUserId: null,
              withdrawnAt: null,
              withdrawnOperationRecordId: null,
              withdrawnProjectRevision: null,
            }
          ),
        };
      });
    },

    listThreads(input: {
      actorUserId: string;
      projectId: string;
      beforeCreatedAt?: string;
      beforeThreadId?: string;
      limit: number;
    }) {
      return database.transaction(async (tx) => {
        const project = await lockProject(tx, input.projectId);
        const accounts = await lockAccounts(tx, [
          input.actorUserId,
          project.ownerUserId,
        ]);
        const actor = accounts.get(input.actorUserId);
        if (!currentAccount(actor)) {
          notFound();
        }
        const owner = accounts.get(project.ownerUserId);
        const scope = resolveProjectHumanThreadListScope({
          actor: {
            userId: actor.id,
            role: actor.role,
            nonGuest: currentAccount(actor),
            emailVerified: Boolean(actor.emailVerifiedAt),
          },
          projectId: project.id,
          projectActive: project.status === "active",
          ownerUserId: project.ownerUserId,
          ownerEligible: currentOwner(owner, project),
          staffEmailSha256: hashStaffEmail(actor.email),
        });
        if (!scope) {
          notFound();
        }
        const consentIdentity = and(
          eq(projectThreadParticipationConsent.threadId, projectHumanThread.id),
          eq(
            projectThreadParticipationConsent.projectId,
            projectHumanThread.projectId
          ),
          eq(
            projectThreadParticipationConsent.ownerUserId,
            projectHumanThread.ownerUserId
          ),
          eq(
            projectThreadParticipationConsent.assignmentId,
            projectHumanThread.assignmentId
          ),
          eq(
            projectThreadParticipationConsent.lawyerUserId,
            projectHumanThread.lawyerUserId
          )
        );
        const cursorFilter =
          input.beforeCreatedAt && input.beforeThreadId
            ? or(
                lt(
                  projectHumanThread.createdAt,
                  new Date(input.beforeCreatedAt)
                ),
                and(
                  eq(
                    projectHumanThread.createdAt,
                    new Date(input.beforeCreatedAt)
                  ),
                  lt(projectHumanThread.id, input.beforeThreadId)
                )
              )
            : undefined;
        const pageClause = cursorFilter ? [cursorFilter] : [];
        if (scope.kind === "owner_history") {
          const rows = await tx
            .select({
              thread: projectHumanThread,
              consent: projectThreadParticipationConsent,
            })
            .from(projectHumanThread)
            .innerJoin(projectThreadParticipationConsent, consentIdentity)
            .where(
              and(
                eq(projectHumanThread.projectId, scope.projectId),
                eq(projectHumanThread.ownerUserId, project.ownerUserId),
                ...pageClause
              )
            )
            .orderBy(
              desc(projectHumanThread.createdAt),
              desc(projectHumanThread.id)
            )
            .limit(input.limit + 1);
          return threadPageResult(rows, input.limit);
        }

        const lawyerClauses = [
          eq(projectHumanThread.projectId, scope.projectId),
          eq(projectHumanThread.ownerUserId, project.ownerUserId),
          eq(projectHumanThread.lawyerUserId, scope.lawyerUserId),
          eq(projectHumanThread.status, "active"),
          eq(projectHumanThread.purpose, PROJECT_HUMAN_MESSAGING_PURPOSE),
          eq(projectThreadParticipationConsent.projectId, scope.projectId),
          eq(
            projectThreadParticipationConsent.ownerUserId,
            project.ownerUserId
          ),
          eq(
            projectThreadParticipationConsent.assignmentId,
            projectHumanThread.assignmentId
          ),
          eq(
            projectThreadParticipationConsent.lawyerUserId,
            scope.lawyerUserId
          ),
          eq(projectThreadParticipationConsent.status, "active"),
          eq(
            projectThreadParticipationConsent.purpose,
            PROJECT_HUMAN_MESSAGING_PURPOSE
          ),
          eq(projectStaffAssignment.id, projectHumanThread.assignmentId),
          eq(projectStaffAssignment.projectId, scope.projectId),
          eq(projectStaffAssignment.staffUserId, scope.lawyerUserId),
          eq(projectStaffAssignment.status, "active"),
          eq(projectStaffAssignment.purpose, "project_staff_collaboration"),
          eq(projectStaffAssignment.assignmentRole, "lawyer"),
          eq(projectStaffAssignment.staffEmailSha256, scope.staffEmailSha256),
        ];
        const [accessibleThread] = await tx
          .select({ id: projectHumanThread.id })
          .from(projectHumanThread)
          .innerJoin(projectThreadParticipationConsent, consentIdentity)
          .innerJoin(
            projectStaffAssignment,
            eq(projectStaffAssignment.id, projectHumanThread.assignmentId)
          )
          .where(and(...lawyerClauses))
          .limit(1);
        if (!accessibleThread) {
          notFound();
        }
        const rows = await tx
          .select({
            thread: projectHumanThread,
            consent: projectThreadParticipationConsent,
          })
          .from(projectHumanThread)
          .innerJoin(projectThreadParticipationConsent, consentIdentity)
          .innerJoin(
            projectStaffAssignment,
            eq(projectStaffAssignment.id, projectHumanThread.assignmentId)
          )
          .where(and(...lawyerClauses, ...pageClause))
          .orderBy(
            desc(projectHumanThread.createdAt),
            desc(projectHumanThread.id)
          )
          .limit(input.limit + 1);
        return threadPageResult(rows, input.limit);
      });
    },

    getThread(input: {
      actorUserId: string;
      projectId: string;
      threadId: string;
    }) {
      return database.transaction(async (tx) => {
        const context = await loadThreadContext(tx, input);
        requireThreadRead(context);
        return threadDto(context.thread, context.consent);
      });
    },

    listMessages(input: {
      actorUserId: string;
      projectId: string;
      threadId: string;
      beforeSequence?: number;
      limit: number;
    }) {
      return database.transaction(async (tx) => {
        const context = await loadThreadContext(tx, input);
        requireThreadRead(context);
        const clauses = [
          eq(projectHumanMessage.threadId, context.thread.id),
          eq(projectHumanMessage.projectId, context.project.id),
        ];
        if (input.beforeSequence !== undefined) {
          clauses.push(lt(projectHumanMessage.sequence, input.beforeSequence));
        }
        const rows = await tx
          .select()
          .from(projectHumanMessage)
          .where(and(...clauses))
          .orderBy(desc(projectHumanMessage.sequence))
          .limit(input.limit + 1);
        const hasMore = rows.length > input.limit;
        const page = rows.slice(0, input.limit).reverse();
        return {
          items: page.map((row) => ({
            messageId: row.id,
            threadId: row.threadId,
            sequence: row.sequence,
            authorUserId: row.authorUserId,
            body: row.body,
            createdAt: row.createdAt,
          })),
          hasMore,
          nextBeforeSequence:
            hasMore && page.length > 0 ? (page[0]?.sequence ?? null) : null,
        };
      });
    },

    sendMessage(input: {
      actorUserId: string;
      projectId: string;
      threadId: string;
      operationId: string;
      body: string;
    }) {
      const requestHash = hashHumanMessageRequest(input);
      const messageId = randomUUID();
      return database.transaction(async (tx) => {
        const operation = await claimOperation(tx, {
          actorUserId: input.actorUserId,
          operationId: input.operationId,
          operationType: "project_human_message_send",
          requestHash,
          resultId: messageId,
          resultKind: "project_human_message",
        });
        const context = await loadThreadContext(tx, input);
        requireThreadSend(context);
        if (operation.replayed) {
          const [existing] = await tx
            .select()
            .from(projectHumanMessage)
            .where(
              and(
                eq(projectHumanMessage.id, operation.resultId),
                eq(projectHumanMessage.threadId, input.threadId),
                eq(projectHumanMessage.projectId, input.projectId),
                eq(projectHumanMessage.authorUserId, input.actorUserId)
              )
            )
            .limit(1);
          if (!existing) {
            throw new ProjectHumanMessagingError("integrity_conflict");
          }
          return {
            replayed: true,
            messageId: existing.id,
            sequence: existing.sequence,
            createdAt: existing.createdAt,
          };
        }
        const [next] = await tx
          .update(projectHumanThread)
          .set({
            lastMessageSequence: context.thread.lastMessageSequence + 1,
          })
          .where(
            and(
              eq(projectHumanThread.id, context.thread.id),
              eq(
                projectHumanThread.lastMessageSequence,
                context.thread.lastMessageSequence
              ),
              eq(projectHumanThread.status, "active")
            )
          )
          .returning({ sequence: projectHumanThread.lastMessageSequence });
        if (!next) {
          throw new ProjectHumanMessagingError("state_conflict");
        }
        const now = new Date();
        await tx.insert(projectHumanMessage).values({
          id: messageId,
          threadId: context.thread.id,
          projectId: context.project.id,
          sequence: next.sequence,
          authorUserId: input.actorUserId,
          operationRecordId: operation.id,
          body: input.body,
          createdAt: now,
        });
        return {
          replayed: false,
          messageId,
          sequence: next.sequence,
          createdAt: now,
        };
      });
    },

    withdrawConsent(input: {
      actorUserId: string;
      projectId: string;
      threadId: string;
      expectedProjectRevision: number;
      operationId: string;
    }) {
      const requestHash = hashThreadConsentRequest({
        action: "withdraw",
        assignmentId: "",
        expectedProjectRevision: input.expectedProjectRevision,
        lawyerUserId: "",
        noticeSha256: PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
        noticeVersion: PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
        operationId: input.operationId,
        projectId: input.projectId,
        purpose: PROJECT_HUMAN_MESSAGING_PURPOSE,
        threadId: input.threadId,
      });
      return database.transaction(async (tx) => {
        const [consentIdentity] = await tx
          .select({ id: projectThreadParticipationConsent.id })
          .from(projectThreadParticipationConsent)
          .where(
            and(
              eq(projectThreadParticipationConsent.threadId, input.threadId),
              eq(projectThreadParticipationConsent.projectId, input.projectId)
            )
          )
          .limit(1);
        if (!consentIdentity) {
          const [existingOperation] = await tx
            .select({
              requestHash: projectOperation.requestHash,
              resultKind: projectOperation.resultKind,
            })
            .from(projectOperation)
            .where(
              and(
                eq(projectOperation.actorUserId, input.actorUserId),
                eq(
                  projectOperation.operationType,
                  "project_thread_participation_consent_withdraw"
                ),
                eq(projectOperation.operationId, input.operationId)
              )
            )
            .for("update")
            .limit(1);
          if (
            existingOperation &&
            existingOperation.requestHash !== requestHash
          ) {
            throw new ProjectHumanMessagingError("idempotency_conflict");
          }
          if (
            existingOperation &&
            existingOperation.resultKind !==
              "project_thread_participation_consent"
          ) {
            throw new ProjectHumanMessagingError("integrity_conflict");
          }
          notFound();
        }
        const operation = await claimOperation(tx, {
          actorUserId: input.actorUserId,
          operationId: input.operationId,
          operationType: "project_thread_participation_consent_withdraw",
          requestHash,
          resultId: consentIdentity.id,
          resultKind: "project_thread_participation_consent",
        });
        const context = await loadThreadContext(tx, input);
        requireOwner(context);
        if (operation.resultId !== context.consent.id) {
          notFound();
        }
        if (operation.replayed) {
          return {
            replayed: true,
            projectRevision: context.project.revision,
            ...threadDto(context.thread, context.consent),
          };
        }
        if (context.project.revision !== input.expectedProjectRevision) {
          throw new ProjectHumanMessagingError("revision_conflict");
        }
        if (
          context.consent.status !== "active" ||
          context.thread.status !== "active"
        ) {
          throw new ProjectHumanMessagingError("state_conflict");
        }
        const now = new Date();
        const nextRevision = await advanceProject(tx, context.project, now);
        const [updatedConsent] = await tx
          .update(projectThreadParticipationConsent)
          .set({
            status: "withdrawn",
            withdrawnByUserId: context.actor.id,
            withdrawnAt: now,
            withdrawnOperationRecordId: operation.id,
            withdrawnProjectRevision: nextRevision,
          })
          .where(
            and(
              eq(projectThreadParticipationConsent.id, context.consent.id),
              eq(projectThreadParticipationConsent.status, "active")
            )
          )
          .returning();
        const [updatedThread] = await tx
          .update(projectHumanThread)
          .set({ status: "closed" })
          .where(
            and(
              eq(projectHumanThread.id, context.thread.id),
              eq(projectHumanThread.status, "active")
            )
          )
          .returning();
        if (!(updatedConsent && updatedThread)) {
          throw new ProjectHumanMessagingError("state_conflict");
        }
        await appendConsentEvent(tx, {
          projectId: context.project.id,
          actorUserId: context.actor.id,
          projectRevision: nextRevision,
          eventType: "project_thread_participation_consent_withdrawn",
          consentId: context.consent.id,
          operationRecordId: operation.id,
          createdAt: now,
        });
        return {
          replayed: false,
          projectRevision: nextRevision,
          ...threadDto(updatedThread, updatedConsent),
        };
      });
    },
  };
}

export const projectHumanMessagingRepository =
  createProjectHumanMessagingRepository();
