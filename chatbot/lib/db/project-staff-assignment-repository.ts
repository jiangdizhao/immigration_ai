import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { guestRegex } from "@/lib/constants";
import { ProjectStaffAssignmentError } from "@/lib/project-staff-assignments/errors";
import {
  buildStaffAssignmentOperationRequest,
  buildStaffAssignmentProposalHash,
  hashStaffEmail,
  maskVerifiedStaffEmail,
  PROJECT_STAFF_ASSIGNMENT_NOTICE,
  PROJECT_STAFF_ASSIGNMENT_NOTICE_SHA256,
  PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
  PROJECT_STAFF_ASSIGNMENT_PURPOSE,
  PROJECT_STAFF_ASSIGNMENT_ROLE,
  type ProjectStaffAssignmentAction,
  projectStaffTransitionAllowed,
} from "@/lib/project-staff-assignments/policy";
import {
  hashProjectOperationRequest,
  validateProjectOperationId,
} from "./project-foundation-utils";
import { getLazyDatabase } from "./runtime-client";
import {
  projectEvent,
  projectOperation,
  projectStaffAssignment,
  studyJourneyProject,
  user,
} from "./schema";

const db = getLazyDatabase();
type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type StaffActor = {
  id: string;
  email: string;
  role: "user" | "lawyer" | "admin";
  emailVerifiedAt: Date | null;
};

type ProjectRow = typeof studyJourneyProject.$inferSelect;
type AssignmentRow = typeof projectStaffAssignment.$inferSelect;

const operationForAction = {
  owner_approve: "project_staff_assignment_owner_approve",
  owner_decline: "project_staff_assignment_owner_decline",
  owner_revoke: "project_staff_assignment_owner_revoke",
  lawyer_accept: "project_staff_assignment_lawyer_accept",
  lawyer_decline: "project_staff_assignment_lawyer_decline",
  lawyer_resign: "project_staff_assignment_lawyer_resign",
  admin_withdraw: "project_staff_assignment_admin_withdraw",
  admin_revoke: "project_staff_assignment_admin_revoke",
} as const;

const eventForAction = {
  owner_approve: "project_staff_assignment_owner_approved",
  owner_decline: "project_staff_assignment_owner_declined",
  owner_revoke: "project_staff_assignment_owner_revoked",
  lawyer_accept: "project_staff_assignment_lawyer_accepted",
  lawyer_decline: "project_staff_assignment_lawyer_declined",
  lawyer_resign: "project_staff_assignment_lawyer_resigned",
  admin_withdraw: "project_staff_assignment_admin_withdrawn",
  admin_revoke: "project_staff_assignment_admin_revoked",
} as const;

const operationForProposal = "project_staff_assignment_propose" as const;
const eventForProposal = "project_staff_assignment_proposed" as const;

function operationRequestHash(input: unknown) {
  return hashProjectOperationRequest(input);
}

function validatedOperationId(value: string) {
  try {
    return validateProjectOperationId(value);
  } catch {
    throw new ProjectStaffAssignmentError("invalid_request");
  }
}

function isNonGuest(email: string) {
  return email.trim().length > 0 && !guestRegex.test(email);
}

function requireUuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value
    )
  ) {
    throw new ProjectStaffAssignmentError("invalid_request");
  }
}

async function claimOperation(
  tx: Transaction,
  input: {
    actorUserId: string;
    operationId: string;
    operationType: (typeof projectOperation.$inferInsert)["operationType"];
    requestHash: string;
    resultId: string;
  }
): Promise<{
  id: string;
  resultId: string;
  requestHash: string;
  replayed: boolean;
}> {
  const [inserted] = await tx
    .insert(projectOperation)
    .values({
      actorUserId: input.actorUserId,
      operationType: input.operationType,
      operationId: input.operationId,
      requestHash: input.requestHash,
      resultKind: "project_staff_assignment",
      resultId: input.resultId,
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
      requestHash: projectOperation.requestHash,
    });
  if (inserted) {
    return { ...inserted, replayed: false };
  }

  const [existing] = await tx
    .select({
      id: projectOperation.id,
      resultId: projectOperation.resultId,
      requestHash: projectOperation.requestHash,
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
  if (
    !existing ||
    existing.resultKind !== "project_staff_assignment" ||
    existing.requestHash !== input.requestHash
  ) {
    throw new ProjectStaffAssignmentError("idempotency_conflict");
  }
  return { ...existing, replayed: true };
}

async function lockProject(tx: Transaction, projectId: string) {
  const [project] = await tx
    .select()
    .from(studyJourneyProject)
    .where(eq(studyJourneyProject.id, projectId))
    .for("update")
    .limit(1);
  if (!project) {
    throw new ProjectStaffAssignmentError("not_found");
  }
  return project;
}

async function lockUsers(tx: Transaction, ids: readonly string[]) {
  const uniqueIds = [...new Set(ids)].sort();
  const rows = await tx
    .select({
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
    })
    .from(user)
    .where(inArray(user.id, uniqueIds))
    .orderBy(asc(user.id))
    .for("no key update");
  return new Map(rows.map((row) => [row.id, row as StaffActor]));
}

function currentAdmin(actor: StaffActor | undefined): actor is StaffActor {
  return Boolean(actor && actor.role === "admin" && isNonGuest(actor.email));
}

function currentOwner(actor: StaffActor | undefined): actor is StaffActor {
  return Boolean(actor && actor.role === "user" && isNonGuest(actor.email));
}

function currentLawyer(actor: StaffActor | undefined): actor is StaffActor {
  return Boolean(
    actor &&
      actor.role === "lawyer" &&
      actor.emailVerifiedAt &&
      isNonGuest(actor.email)
  );
}

function identityMatches(
  assignment: AssignmentRow,
  lawyer: StaffActor | undefined
) {
  return Boolean(
    currentLawyer(lawyer) &&
      hashStaffEmail(lawyer.email) === assignment.staffEmailSha256
  );
}

function proposalSnapshotCurrent(
  assignment: AssignmentRow,
  project: ProjectRow,
  lawyer: StaffActor | undefined
) {
  return Boolean(
    identityMatches(assignment, lawyer) &&
      assignment.noticeVersion === PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION &&
      assignment.noticeSha256 === PROJECT_STAFF_ASSIGNMENT_NOTICE_SHA256 &&
      buildStaffAssignmentProposalHash({
        projectId: project.id,
        projectOwnerUserId: project.ownerUserId,
        staffUserId: assignment.staffUserId,
        staffEmailSha256: assignment.staffEmailSha256,
        noticeVersion: assignment.noticeVersion,
        noticeSha256: assignment.noticeSha256,
      }) === assignment.proposalSha256
  );
}

async function lockAssignment(
  tx: Transaction,
  projectId: string,
  assignmentId: string
) {
  const [assignment] = await tx
    .select()
    .from(projectStaffAssignment)
    .where(
      and(
        eq(projectStaffAssignment.id, assignmentId),
        eq(projectStaffAssignment.projectId, projectId)
      )
    )
    .for("update")
    .limit(1);
  if (!assignment) {
    throw new ProjectStaffAssignmentError("not_found");
  }
  return assignment;
}

async function verifyOperationEvent(
  tx: Transaction,
  input: {
    operationRecordId: string;
    projectId: string;
    assignmentId: string;
    eventType: string;
    projectRevision?: number;
  }
) {
  const events = await tx
    .select({
      projectId: projectEvent.projectId,
      eventType: projectEvent.eventType,
      subjectKind: projectEvent.subjectKind,
      subjectId: projectEvent.subjectId,
      projectRevision: projectEvent.projectRevision,
    })
    .from(projectEvent)
    .where(eq(projectEvent.operationRecordId, input.operationRecordId));
  const [event] = events;
  if (
    events.length !== 1 ||
    event?.projectId !== input.projectId ||
    event.eventType !== input.eventType ||
    event.subjectKind !== "project_staff_assignment" ||
    event.subjectId !== input.assignmentId ||
    (input.projectRevision !== undefined &&
      event.projectRevision !== input.projectRevision)
  ) {
    throw new ProjectStaffAssignmentError("integrity_conflict");
  }
}

function assignmentDto(assignment: AssignmentRow, projectRevision: number) {
  return {
    assignmentId: assignment.id,
    projectId: assignment.projectId,
    purpose: assignment.purpose,
    assignmentRole: assignment.assignmentRole,
    assignmentStatus: assignment.status,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    ownerApprovedAt: assignment.ownerApprovedAt,
    lawyerAcceptedAt: assignment.lawyerAcceptedAt,
    terminalAt: assignment.terminalAt,
    expectedProjectRevision: projectRevision,
  };
}

function eventTypeForStatusAction(action: ProjectStaffAssignmentAction) {
  return eventForAction[action];
}

function actionPatch(
  assignment: AssignmentRow,
  action: ProjectStaffAssignmentAction,
  actorUserId: string,
  now: Date,
  nextRevision: number,
  operationRecordId: string
) {
  const base = {
    updatedAt: now,
    lastProjectRevision: nextRevision,
    lastOperationRecordId: operationRecordId,
  };
  switch (action) {
    case "owner_approve":
      return {
        ...base,
        status: "owner_approved" as const,
        ownerApprovedByUserId: actorUserId,
        ownerApprovedAt: now,
        ownerApprovalSha256: assignment.proposalSha256,
      };
    case "owner_decline":
      return {
        ...base,
        status: "declined" as const,
        terminalActorUserId: actorUserId,
        terminalReasonCode: "owner_declined" as const,
        terminalAt: now,
      };
    case "lawyer_accept":
      return { ...base, status: "active" as const, lawyerAcceptedAt: now };
    case "lawyer_decline":
      return {
        ...base,
        status: "declined" as const,
        terminalActorUserId: actorUserId,
        terminalReasonCode: "lawyer_declined" as const,
        terminalAt: now,
      };
    case "admin_withdraw":
      return {
        ...base,
        status: "withdrawn" as const,
        terminalActorUserId: actorUserId,
        terminalReasonCode: "admin_withdrawn" as const,
        terminalAt: now,
      };
    case "owner_revoke":
    case "admin_revoke":
      return {
        ...base,
        status: "revoked" as const,
        terminalActorUserId: actorUserId,
        terminalReasonCode:
          action === "owner_revoke"
            ? ("owner_revoked" as const)
            : ("admin_revoked" as const),
        terminalAt: now,
      };
    case "lawyer_resign":
      return {
        ...base,
        status: "revoked" as const,
        terminalActorUserId: actorUserId,
        terminalReasonCode: "lawyer_resigned" as const,
        terminalAt: now,
      };
    default:
      throw new ProjectStaffAssignmentError("invalid_request");
  }
}

async function reviseProjectAndAppendEvent(
  tx: Transaction,
  input: {
    project: ProjectRow;
    actorUserId: string;
    assignmentId: string;
    eventType: string;
    operationRecordId: string;
    now: Date;
  }
) {
  const nextRevision = input.project.revision + 1;
  const [updatedProject] = await tx
    .update(studyJourneyProject)
    .set({ revision: nextRevision, updatedAt: input.now })
    .where(
      and(
        eq(studyJourneyProject.id, input.project.id),
        eq(studyJourneyProject.revision, input.project.revision),
        eq(studyJourneyProject.status, "active")
      )
    )
    .returning();
  if (!updatedProject) {
    throw new ProjectStaffAssignmentError("revision_conflict");
  }
  await tx.insert(projectEvent).values({
    projectId: input.project.id,
    actorUserId: input.actorUserId,
    projectRevision: nextRevision,
    eventType:
      input.eventType as (typeof projectEvent.$inferInsert)["eventType"],
    subjectKind: "project_staff_assignment",
    subjectId: input.assignmentId,
    operationRecordId: input.operationRecordId,
    createdAt: input.now,
  });
  return { project: updatedProject, revision: nextRevision };
}

function translateUniqueConflict(error: unknown): never {
  const value = error as { constraint?: unknown; code?: unknown };
  if (
    value?.code === "23505" &&
    value.constraint ===
      "ProjectStaffAssignment_project_staff_purpose_live_unique"
  ) {
    throw new ProjectStaffAssignmentError("state_conflict");
  }
  throw error;
}

export function createProjectStaffAssignmentRepository(
  database: Database = db
) {
  return {
    async propose(input: {
      actorUserId: string;
      projectId: string;
      staffUserId: string;
      operationId: string;
      now?: Date;
    }) {
      requireUuid(input.actorUserId);
      requireUuid(input.projectId);
      requireUuid(input.staffUserId);
      const operationId = validatedOperationId(input.operationId);
      const assignmentId = randomUUID();
      const now = input.now ?? new Date();
      const requestHash = operationRequestHash({
        assignmentRole: PROJECT_STAFF_ASSIGNMENT_ROLE,
        noticeSha256: PROJECT_STAFF_ASSIGNMENT_NOTICE_SHA256,
        noticeVersion: PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
        projectId: input.projectId,
        purpose: PROJECT_STAFF_ASSIGNMENT_PURPOSE,
        staffUserId: input.staffUserId,
      });

      try {
        return await database.transaction(async (tx) => {
          const operation = await claimOperation(tx, {
            actorUserId: input.actorUserId,
            operationId,
            operationType: operationForProposal,
            requestHash,
            resultId: assignmentId,
          });
          const project = await lockProject(tx, input.projectId);
          if (project.status !== "active") {
            throw new ProjectStaffAssignmentError("not_found");
          }
          const actors = await lockUsers(tx, [
            input.actorUserId,
            project.ownerUserId,
            input.staffUserId,
          ]);
          const admin = actors.get(input.actorUserId);
          const owner = actors.get(project.ownerUserId);
          const lawyer = actors.get(input.staffUserId);
          if (
            !currentAdmin(admin) ||
            !currentOwner(owner) ||
            !currentLawyer(lawyer)
          ) {
            throw new ProjectStaffAssignmentError("not_found");
          }
          const emailSha256 = hashStaffEmail(lawyer.email);
          const proposalSha256 = buildStaffAssignmentProposalHash({
            projectId: project.id,
            projectOwnerUserId: project.ownerUserId,
            staffUserId: lawyer.id,
            staffEmailSha256: emailSha256,
            noticeVersion: PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
            noticeSha256: PROJECT_STAFF_ASSIGNMENT_NOTICE_SHA256,
          });

          if (operation.replayed) {
            if (operation.resultId === assignmentId) {
              throw new ProjectStaffAssignmentError("integrity_conflict");
            }
            const assignment = await lockAssignment(
              tx,
              project.id,
              operation.resultId
            );
            if (
              assignment.proposedByAdminUserId !== input.actorUserId ||
              assignment.staffUserId !== lawyer.id ||
              assignment.proposalSha256 !== proposalSha256
            ) {
              throw new ProjectStaffAssignmentError("integrity_conflict");
            }
            await verifyOperationEvent(tx, {
              operationRecordId: operation.id,
              projectId: project.id,
              assignmentId: assignment.id,
              eventType: eventForProposal,
            });
            return { accepted: true, replayed: true };
          }

          const [existing] = await tx
            .select({ id: projectStaffAssignment.id })
            .from(projectStaffAssignment)
            .where(
              and(
                eq(projectStaffAssignment.projectId, project.id),
                eq(projectStaffAssignment.staffUserId, lawyer.id),
                eq(
                  projectStaffAssignment.purpose,
                  PROJECT_STAFF_ASSIGNMENT_PURPOSE
                ),
                sql`${projectStaffAssignment.status} in ('proposed', 'owner_approved', 'active')`
              )
            )
            .for("update")
            .limit(1);
          if (existing) {
            throw new ProjectStaffAssignmentError("state_conflict");
          }
          const nextRevision = project.revision + 1;
          await tx.insert(projectStaffAssignment).values({
            id: operation.resultId,
            projectId: project.id,
            staffUserId: lawyer.id,
            proposedByAdminUserId: input.actorUserId,
            purpose: PROJECT_STAFF_ASSIGNMENT_PURPOSE,
            assignmentRole: PROJECT_STAFF_ASSIGNMENT_ROLE,
            status: "proposed",
            staffEmailSha256: emailSha256,
            noticeVersion: PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
            noticeSha256: PROJECT_STAFF_ASSIGNMENT_NOTICE_SHA256,
            proposalSha256,
            lastProjectRevision: nextRevision,
            lastOperationRecordId: operation.id,
            createdAt: now,
            updatedAt: now,
          });
          await reviseProjectAndAppendEvent(tx, {
            project,
            actorUserId: input.actorUserId,
            assignmentId: operation.resultId,
            eventType: eventForProposal,
            operationRecordId: operation.id,
            now,
          });
          return { accepted: true, replayed: false };
        });
      } catch (error) {
        translateUniqueConflict(error);
      }
    },

    listAdminAssignments(input: { actorUserId: string; projectId: string }) {
      requireUuid(input.actorUserId);
      requireUuid(input.projectId);
      return database.transaction(async (tx) => {
        const actors = await lockUsers(tx, [input.actorUserId]);
        if (!currentAdmin(actors.get(input.actorUserId))) {
          throw new ProjectStaffAssignmentError("forbidden");
        }
        const rows = await tx
          .select({
            assignmentId: projectStaffAssignment.id,
            assignmentStatus: projectStaffAssignment.status,
            createdAt: projectStaffAssignment.createdAt,
            updatedAt: projectStaffAssignment.updatedAt,
            ownerApprovedAt: projectStaffAssignment.ownerApprovedAt,
            lawyerAcceptedAt: projectStaffAssignment.lawyerAcceptedAt,
            terminalAt: projectStaffAssignment.terminalAt,
          })
          .from(projectStaffAssignment)
          .where(
            and(
              eq(projectStaffAssignment.projectId, input.projectId),
              eq(
                projectStaffAssignment.proposedByAdminUserId,
                input.actorUserId
              )
            )
          )
          .orderBy(asc(projectStaffAssignment.createdAt));
        return rows;
      });
    },

    listOwnerAssignments(input: { actorUserId: string; projectId: string }) {
      requireUuid(input.actorUserId);
      requireUuid(input.projectId);
      return database.transaction(async (tx) => {
        const project = await lockProject(tx, input.projectId);
        if (
          project.status !== "active" ||
          project.ownerUserId !== input.actorUserId
        ) {
          throw new ProjectStaffAssignmentError("not_found");
        }
        const initialRows = await tx
          .select({ staffUserId: projectStaffAssignment.staffUserId })
          .from(projectStaffAssignment)
          .where(eq(projectStaffAssignment.projectId, project.id));
        const actors = await lockUsers(tx, [
          input.actorUserId,
          ...initialRows.map((row) => row.staffUserId),
        ]);
        const owner = actors.get(input.actorUserId);
        if (!currentOwner(owner)) {
          throw new ProjectStaffAssignmentError("not_found");
        }
        const rows = await tx
          .select()
          .from(projectStaffAssignment)
          .where(eq(projectStaffAssignment.projectId, project.id))
          .orderBy(asc(projectStaffAssignment.createdAt))
          .for("update");
        return rows.map((assignment) => {
          const lawyer = actors.get(assignment.staffUserId);
          const exactIdentity = proposalSnapshotCurrent(
            assignment,
            project,
            lawyer
          );
          return {
            ...assignmentDto(assignment, project.revision),
            staffUserId: assignment.staffUserId,
            staffAccountIdentifierMasked:
              exactIdentity && lawyer
                ? maskVerifiedStaffEmail(lawyer.email)
                : null,
            staffIdentityCurrent: exactIdentity,
            noticeVersion: assignment.noticeVersion,
            notice:
              assignment.noticeSha256 === PROJECT_STAFF_ASSIGNMENT_NOTICE_SHA256
                ? PROJECT_STAFF_ASSIGNMENT_NOTICE
                : null,
            proposalSha256: assignment.proposalSha256,
          };
        });
      });
    },

    listLawyerInvitations(input: { actorUserId: string }) {
      requireUuid(input.actorUserId);
      return database.transaction(async (tx) => {
        const assignments = await tx
          .select()
          .from(projectStaffAssignment)
          .where(
            and(
              eq(projectStaffAssignment.staffUserId, input.actorUserId),
              eq(projectStaffAssignment.status, "owner_approved")
            )
          )
          .orderBy(asc(projectStaffAssignment.createdAt));
        const projectIds = [
          ...new Set(assignments.map((row) => row.projectId)),
        ];
        if (!projectIds.length) {
          const actors = await lockUsers(tx, [input.actorUserId]);
          if (!currentLawyer(actors.get(input.actorUserId))) {
            throw new ProjectStaffAssignmentError("forbidden");
          }
          return [];
        }
        const projects = await tx
          .select()
          .from(studyJourneyProject)
          .where(inArray(studyJourneyProject.id, projectIds))
          .orderBy(asc(studyJourneyProject.id))
          .for("update");
        const projectById = new Map(
          projects.map((project) => [project.id, project])
        );
        const owners = projects.map((project) => project.ownerUserId);
        const actors = await lockUsers(tx, [input.actorUserId, ...owners]);
        const lawyer = actors.get(input.actorUserId);
        if (!currentLawyer(lawyer)) {
          throw new ProjectStaffAssignmentError("forbidden");
        }
        const rows = await tx
          .select()
          .from(projectStaffAssignment)
          .where(
            and(
              eq(projectStaffAssignment.staffUserId, input.actorUserId),
              eq(projectStaffAssignment.status, "owner_approved")
            )
          )
          .orderBy(asc(projectStaffAssignment.createdAt))
          .for("update");
        return rows
          .filter((assignment) => {
            const project = projectById.get(assignment.projectId);
            const owner = project ? actors.get(project.ownerUserId) : undefined;
            return Boolean(
              project &&
                project.status === "active" &&
                currentOwner(owner) &&
                assignment.ownerApprovalSha256 === assignment.proposalSha256 &&
                proposalSnapshotCurrent(assignment, project, lawyer)
            );
          })
          .map((assignment) => {
            const project = projectById.get(assignment.projectId);
            if (!project) {
              throw new ProjectStaffAssignmentError("integrity_conflict");
            }
            return {
              assignmentId: assignment.id,
              projectId: assignment.projectId,
              purpose: assignment.purpose,
              assignmentRole: assignment.assignmentRole,
              assignmentStatus: assignment.status,
              noticeVersion: assignment.noticeVersion,
              notice:
                assignment.noticeSha256 ===
                PROJECT_STAFF_ASSIGNMENT_NOTICE_SHA256
                  ? PROJECT_STAFF_ASSIGNMENT_NOTICE
                  : null,
              proposalSha256: assignment.proposalSha256,
              expectedProjectRevision: project.revision,
              createdAt: assignment.createdAt,
              ownerApprovedAt: assignment.ownerApprovedAt,
            };
          });
      });
    },

    getStaffShell(input: { actorUserId: string; projectId: string }) {
      requireUuid(input.actorUserId);
      requireUuid(input.projectId);
      return database.transaction(async (tx) => {
        const project = await lockProject(tx, input.projectId);
        const initialRows = await tx
          .select({
            id: projectStaffAssignment.id,
            staffUserId: projectStaffAssignment.staffUserId,
          })
          .from(projectStaffAssignment)
          .where(
            and(
              eq(projectStaffAssignment.projectId, project.id),
              eq(projectStaffAssignment.staffUserId, input.actorUserId),
              eq(projectStaffAssignment.status, "active")
            )
          );
        const actors = await lockUsers(tx, [
          input.actorUserId,
          project.ownerUserId,
        ]);
        const lawyer = actors.get(input.actorUserId);
        const owner = actors.get(project.ownerUserId);
        if (
          project.status !== "active" ||
          !currentLawyer(lawyer) ||
          !currentOwner(owner)
        ) {
          throw new ProjectStaffAssignmentError("not_found");
        }
        const [assignment] = await tx
          .select()
          .from(projectStaffAssignment)
          .where(
            and(
              eq(projectStaffAssignment.projectId, project.id),
              eq(projectStaffAssignment.staffUserId, input.actorUserId),
              eq(projectStaffAssignment.status, "active")
            )
          )
          .for("update")
          .limit(1);
        if (
          !assignment ||
          !initialRows.some((row) => row.id === assignment.id) ||
          !proposalSnapshotCurrent(assignment, project, lawyer) ||
          assignment.ownerApprovalSha256 !== assignment.proposalSha256 ||
          !assignment.lawyerAcceptedAt
        ) {
          throw new ProjectStaffAssignmentError("not_found");
        }
        return {
          projectId: project.id,
          assignmentId: assignment.id,
          assignmentRole: "lawyer" as const,
          assignmentStatus: "active" as const,
          projectLifecycle: "active" as const,
          createdAt: assignment.createdAt,
          updatedAt: assignment.updatedAt,
          acceptedAt: assignment.lawyerAcceptedAt,
        };
      });
    },

    transition(input: {
      actorUserId: string;
      projectId: string;
      assignmentId: string;
      action: ProjectStaffAssignmentAction;
      expectedProjectRevision?: number;
      proposalSha256?: string;
      noticeVersion?: string;
      operationId: string;
      now?: Date;
    }) {
      requireUuid(input.actorUserId);
      requireUuid(input.projectId);
      requireUuid(input.assignmentId);
      const operationId = validatedOperationId(input.operationId);
      const adminAction =
        input.action === "admin_withdraw" || input.action === "admin_revoke";
      if (
        (!adminAction &&
          (!Number.isSafeInteger(input.expectedProjectRevision) ||
            (input.expectedProjectRevision ?? 0) < 1)) ||
        (input.expectedProjectRevision !== undefined &&
          (!Number.isSafeInteger(input.expectedProjectRevision) ||
            input.expectedProjectRevision < 1))
      ) {
        throw new ProjectStaffAssignmentError("invalid_request");
      }
      const requestHash = operationRequestHash(
        buildStaffAssignmentOperationRequest(input)
      );
      const now = input.now ?? new Date();

      return database.transaction(async (tx) => {
        const operation = await claimOperation(tx, {
          actorUserId: input.actorUserId,
          operationId,
          operationType: operationForAction[input.action],
          requestHash,
          resultId: input.assignmentId,
        });
        const project = await lockProject(tx, input.projectId);
        const [unlockedAssignment] = await tx
          .select({ staffUserId: projectStaffAssignment.staffUserId })
          .from(projectStaffAssignment)
          .where(
            and(
              eq(projectStaffAssignment.id, input.assignmentId),
              eq(projectStaffAssignment.projectId, project.id)
            )
          )
          .limit(1);
        if (!unlockedAssignment) {
          throw new ProjectStaffAssignmentError("not_found");
        }
        const actors = await lockUsers(tx, [
          input.actorUserId,
          project.ownerUserId,
          unlockedAssignment.staffUserId,
        ]);
        const actor = actors.get(input.actorUserId);
        const owner = actors.get(project.ownerUserId);
        const lawyer = actors.get(unlockedAssignment.staffUserId);
        const assignment = await lockAssignment(
          tx,
          project.id,
          input.assignmentId
        );
        if (
          assignment.staffUserId !== unlockedAssignment.staffUserId ||
          project.status !== "active"
        ) {
          throw new ProjectStaffAssignmentError("not_found");
        }

        switch (input.action) {
          case "owner_approve":
          case "owner_decline":
          case "owner_revoke":
            if (
              !currentOwner(actor) ||
              !currentOwner(owner) ||
              project.ownerUserId !== input.actorUserId
            ) {
              throw new ProjectStaffAssignmentError("not_found");
            }
            break;
          case "lawyer_accept":
          case "lawyer_decline":
          case "lawyer_resign":
            if (
              !currentLawyer(actor) ||
              !currentOwner(owner) ||
              input.actorUserId !== assignment.staffUserId
            ) {
              throw new ProjectStaffAssignmentError("not_found");
            }
            break;
          case "admin_withdraw":
          case "admin_revoke":
            if (
              !currentAdmin(actor) ||
              !currentOwner(owner) ||
              assignment.proposedByAdminUserId !== input.actorUserId
            ) {
              throw new ProjectStaffAssignmentError("not_found");
            }
            break;
          default:
            throw new ProjectStaffAssignmentError("invalid_request");
        }

        const roleSensitive = [
          "owner_approve",
          "lawyer_accept",
          "lawyer_decline",
          "lawyer_resign",
        ].includes(input.action);
        if (
          roleSensitive &&
          !proposalSnapshotCurrent(assignment, project, lawyer)
        ) {
          throw new ProjectStaffAssignmentError("state_conflict");
        }
        if (
          input.action === "owner_approve" &&
          (input.proposalSha256 !== assignment.proposalSha256 ||
            input.noticeVersion !== assignment.noticeVersion ||
            !proposalSnapshotCurrent(assignment, project, lawyer))
        ) {
          throw new ProjectStaffAssignmentError("state_conflict");
        }

        if (operation.replayed) {
          if (operation.resultId !== assignment.id) {
            throw new ProjectStaffAssignmentError("integrity_conflict");
          }
          await verifyOperationEvent(tx, {
            operationRecordId: operation.id,
            projectId: project.id,
            assignmentId: assignment.id,
            eventType: eventTypeForStatusAction(input.action),
            projectRevision:
              input.expectedProjectRevision === undefined
                ? undefined
                : input.expectedProjectRevision + 1,
          });
          return {
            replayed: true,
            assignment: assignmentDto(assignment, project.revision),
          };
        }
        const expectedRevision =
          input.expectedProjectRevision ?? project.revision;
        if (project.revision !== expectedRevision) {
          throw new ProjectStaffAssignmentError("revision_conflict");
        }
        if (!projectStaffTransitionAllowed(assignment.status, input.action)) {
          throw new ProjectStaffAssignmentError("state_conflict");
        }
        if (
          input.action === "lawyer_accept" &&
          (assignment.ownerApprovalSha256 !== assignment.proposalSha256 ||
            !assignment.ownerApprovedByUserId ||
            !assignment.ownerApprovedAt)
        ) {
          throw new ProjectStaffAssignmentError("state_conflict");
        }
        const nextRevision = project.revision + 1;
        const [updatedAssignment] = await tx
          .update(projectStaffAssignment)
          .set(
            actionPatch(
              assignment,
              input.action,
              input.actorUserId,
              now,
              nextRevision,
              operation.id
            )
          )
          .where(
            and(
              eq(projectStaffAssignment.id, assignment.id),
              eq(projectStaffAssignment.projectId, project.id),
              eq(projectStaffAssignment.status, assignment.status)
            )
          )
          .returning();
        if (!updatedAssignment) {
          throw new ProjectStaffAssignmentError("state_conflict");
        }
        const result = await reviseProjectAndAppendEvent(tx, {
          project,
          actorUserId: input.actorUserId,
          assignmentId: assignment.id,
          eventType: eventTypeForStatusAction(input.action),
          operationRecordId: operation.id,
          now,
        });
        return {
          replayed: false,
          assignment: assignmentDto(updatedAssignment, result.revision),
        };
      });
    },
  };
}

export const projectStaffAssignmentRepository =
  createProjectStaffAssignmentRepository();
