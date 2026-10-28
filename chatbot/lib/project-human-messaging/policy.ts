import { createHash } from "node:crypto";
import { guestRegex } from "@/lib/constants";
import { hashProjectOperationRequest } from "@/lib/db/project-foundation-utils";

export const PROJECT_HUMAN_MESSAGING_PURPOSE =
  "one_to_one_plain_text_project_collaboration" as const;
export const PROJECT_HUMAN_MESSAGING_NOTICE_VERSION =
  "m4-003-thread-participation-v1" as const;
export const PROJECT_HUMAN_MESSAGING_NOTICE =
  "I authorize the specifically named lawyer assigned to this Project to participate in this one-to-one plain-text message thread for Project collaboration. This consent permits communication in this thread only. It does not give access to Project Facts, Documents, private AI Chats, member Chats, or any other protected Project resource. Attachments and resource sharing are not permitted. You may withdraw this thread participation consent; after withdrawal the lawyer cannot read the thread history or send further messages.";
export const PROJECT_HUMAN_MESSAGING_NOTICE_SHA256 = createHash("sha256")
  .update(PROJECT_HUMAN_MESSAGING_NOTICE, "utf8")
  .digest("hex");

export const PROJECT_HUMAN_MESSAGE_MAX_BYTES = 8 * 1024;
export const PROJECT_HUMAN_MESSAGE_PAGE_MAX = 50;
export const PROJECT_HUMAN_MESSAGE_PAGE_DEFAULT = 25;
export const PROJECT_HUMAN_THREAD_PAGE_MAX = 50;
export const PROJECT_HUMAN_THREAD_PAGE_DEFAULT = 25;

export type ProjectHumanMessagingActor = {
  userId: string;
  role: "user" | "lawyer" | "admin";
  nonGuest: boolean;
  emailVerified: boolean;
};

export type ProjectHumanThreadAuthority = {
  projectId: string;
  projectActive: boolean;
  ownerUserId: string;
  ownerEligible: boolean;
  threadId: string;
  threadProjectId: string;
  threadActive: boolean;
  assignmentId: string;
  assignmentProjectId: string | null;
  assignmentStaffUserId: string | null;
  assignmentActive: boolean;
  assignedLawyerEligible: boolean;
  consentStatus: "active" | "withdrawn" | null;
};

export type ProjectHumanThreadAction = "read" | "send" | "withdraw_consent";

export type ProjectHumanThreadListScope =
  | { kind: "owner_history"; projectId: string }
  | {
      kind: "assigned_active";
      projectId: string;
      lawyerUserId: string;
      staffEmailSha256: string;
    };

function isCurrentOwner(
  actor: ProjectHumanMessagingActor,
  authority: ProjectHumanThreadAuthority
) {
  return (
    actor.userId === authority.ownerUserId &&
    actor.role === "user" &&
    actor.nonGuest
  );
}

export function resolveProjectHumanThreadListScope(input: {
  actor: ProjectHumanMessagingActor;
  projectId: string;
  projectActive: boolean;
  ownerUserId: string;
  ownerEligible: boolean;
  staffEmailSha256: string;
}): ProjectHumanThreadListScope | null {
  if (!input.projectActive) {
    return null;
  }
  if (
    input.actor.userId === input.ownerUserId &&
    input.actor.role === "user" &&
    input.actor.nonGuest
  ) {
    return { kind: "owner_history", projectId: input.projectId };
  }
  if (
    input.ownerEligible &&
    input.actor.role === "lawyer" &&
    input.actor.nonGuest &&
    input.actor.emailVerified &&
    input.staffEmailSha256.length > 0
  ) {
    return {
      kind: "assigned_active",
      projectId: input.projectId,
      lawyerUserId: input.actor.userId,
      staffEmailSha256: input.staffEmailSha256,
    };
  }
  return null;
}

function activeAssignmentMatches(authority: ProjectHumanThreadAuthority) {
  return (
    authority.assignmentProjectId === authority.projectId &&
    authority.assignmentStaffUserId !== null &&
    authority.assignmentActive &&
    authority.threadActive &&
    authority.assignedLawyerEligible &&
    authority.ownerEligible &&
    authority.consentStatus === "active"
  );
}

function isCurrentAssignedLawyer(
  actor: ProjectHumanMessagingActor,
  authority: ProjectHumanThreadAuthority
) {
  return (
    actor.userId === authority.assignmentStaffUserId &&
    actor.role === "lawyer" &&
    actor.nonGuest &&
    actor.emailVerified &&
    activeAssignmentMatches(authority)
  );
}

export function canAccessProjectHumanThread(
  actor: ProjectHumanMessagingActor,
  authority: ProjectHumanThreadAuthority,
  action: ProjectHumanThreadAction
): boolean {
  if (
    !authority.projectActive ||
    authority.threadProjectId !== authority.projectId
  ) {
    return false;
  }

  if (action === "withdraw_consent") {
    return isCurrentOwner(actor, authority);
  }

  if (action === "read" && isCurrentOwner(actor, authority)) {
    // The owner retains access to their own audit history after lawyer
    // assignment/consent termination; no staff access is retained by this.
    return true;
  }

  if (!isCurrentAssignedLawyer(actor, authority)) {
    return false;
  }

  return action === "read" || action === "send";
}

export function canOwnerSendToCurrentLawyer(
  actor: ProjectHumanMessagingActor,
  authority: ProjectHumanThreadAuthority
) {
  return (
    isCurrentOwner(actor, authority) &&
    authority.projectActive &&
    authority.threadProjectId === authority.projectId &&
    activeAssignmentMatches(authority)
  );
}

export function isProjectHumanMessagingEnabled(
  value: string | undefined = process.env
    .PHASE13_PROJECT_HUMAN_MESSAGING_ENABLED
) {
  return value?.trim().toLowerCase() === "true";
}

export function isNonGuestMessagingAccount(email: string) {
  return email.trim().length > 0 && !guestRegex.test(email);
}

export function hashHumanMessageRequest(input: {
  projectId: string;
  threadId: string;
  body: string;
}) {
  return hashProjectOperationRequest({
    action: "send_message",
    body: input.body,
    projectId: input.projectId,
    threadId: input.threadId,
  });
}

export function hashThreadConsentRequest(input: {
  action: "create" | "withdraw";
  assignmentId: string;
  expectedProjectRevision: number;
  lawyerUserId: string;
  noticeSha256: string;
  noticeVersion: string;
  operationId: string;
  projectId: string;
  purpose: typeof PROJECT_HUMAN_MESSAGING_PURPOSE;
  threadId?: string;
}) {
  const request: Record<string, unknown> = {
    action: input.action,
    accepted: input.action === "create",
    assignmentId: input.assignmentId,
    expectedProjectRevision: input.expectedProjectRevision,
    lawyerUserId: input.lawyerUserId,
    noticeSha256: input.noticeSha256,
    noticeVersion: input.noticeVersion,
    projectId: input.projectId,
    purpose: input.purpose,
  };
  if (input.threadId) {
    request.threadId = input.threadId;
  }
  return hashProjectOperationRequest(request);
}

export function parseMessagePagination(input: {
  beforeSequence?: string | null;
  limit?: string | null;
}) {
  const rawLimit = input.limit ?? String(PROJECT_HUMAN_MESSAGE_PAGE_DEFAULT);
  if (!/^\d+$/u.test(rawLimit)) {
    return null;
  }
  const limit = Number(rawLimit);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > PROJECT_HUMAN_MESSAGE_PAGE_MAX
  ) {
    return null;
  }

  let beforeSequence: number | undefined;
  if (input.beforeSequence !== undefined && input.beforeSequence !== null) {
    if (!/^\d+$/u.test(input.beforeSequence)) {
      return null;
    }
    beforeSequence = Number(input.beforeSequence);
    if (!Number.isSafeInteger(beforeSequence) || beforeSequence < 1) {
      return null;
    }
  }
  return { beforeSequence, limit };
}

export function parseThreadPagination(input: {
  beforeCreatedAt?: string | null;
  beforeThreadId?: string | null;
  limit?: string | null;
}) {
  const rawLimit = input.limit ?? String(PROJECT_HUMAN_THREAD_PAGE_DEFAULT);
  if (!/^\d+$/u.test(rawLimit)) {
    return null;
  }
  const limit = Number(rawLimit);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > PROJECT_HUMAN_THREAD_PAGE_MAX
  ) {
    return null;
  }
  const beforeCreatedAt = input.beforeCreatedAt ?? undefined;
  const beforeThreadId = input.beforeThreadId ?? undefined;
  if (Boolean(beforeCreatedAt) !== Boolean(beforeThreadId)) {
    return null;
  }
  if (
    beforeCreatedAt &&
    (!Number.isFinite(Date.parse(beforeCreatedAt)) ||
      new Date(beforeCreatedAt).toISOString() !== beforeCreatedAt)
  ) {
    return null;
  }
  if (
    beforeThreadId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      beforeThreadId
    )
  ) {
    return null;
  }
  return { beforeCreatedAt, beforeThreadId, limit };
}
