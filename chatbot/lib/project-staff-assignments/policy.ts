import { createHash } from "node:crypto";
import { hashProjectOperationRequest } from "@/lib/db/project-foundation-utils";

export const PROJECT_STAFF_ASSIGNMENT_PURPOSE =
  "project_staff_collaboration" as const;
export const PROJECT_STAFF_ASSIGNMENT_ROLE = "lawyer" as const;
export const PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION =
  "m4-002-staff-assignment-notice-v1" as const;
export const PROJECT_STAFF_ASSIGNMENT_NOTICE =
  "You are approving a staff relationship with the named lawyer for this Project. This approval permits the lawyer to receive only a minimal Project shell after the lawyer accepts. It does not share Project Facts, Documents, private AI Chats, messages, tasks, financial information, engagement records, or other protected Project resources, and it does not create an engagement.";

export const PROJECT_STAFF_ASSIGNMENT_NOTICE_SHA256 = createHash("sha256")
  .update(PROJECT_STAFF_ASSIGNMENT_NOTICE, "utf8")
  .digest("hex");

export type ProjectStaffAssignmentAction =
  | "owner_approve"
  | "owner_decline"
  | "owner_revoke"
  | "lawyer_accept"
  | "lawyer_decline"
  | "lawyer_resign"
  | "admin_withdraw"
  | "admin_revoke";

export type ProjectStaffAssignmentStatus =
  | "proposed"
  | "owner_approved"
  | "active"
  | "declined"
  | "withdrawn"
  | "revoked";

export function buildStaffAssignmentOperationRequest(input: {
  action: ProjectStaffAssignmentAction;
  assignmentId: string;
  projectId: string;
  expectedProjectRevision?: number;
  proposalSha256?: string;
  noticeVersion?: string;
}) {
  const request: Record<string, unknown> = {
    action: input.action,
    assignmentId: input.assignmentId,
    expectedProjectRevision: input.expectedProjectRevision ?? null,
    projectId: input.projectId,
  };
  if (input.action === "owner_approve") {
    request.proposalSha256 = input.proposalSha256 ?? null;
    request.noticeVersion = input.noticeVersion ?? null;
  }
  return request;
}

export function projectStaffAssignmentsEnabled(
  value: string | undefined = process.env
    .PHASE13_PROJECT_STAFF_ASSIGNMENT_ENABLED
): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function normalizeStaffEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashStaffEmail(email: string): string {
  return createHash("sha256")
    .update(normalizeStaffEmail(email), "utf8")
    .digest("hex");
}

export function maskVerifiedStaffEmail(email: string): string {
  const [local, domain] = normalizeStaffEmail(email).split("@");
  if (!local || !domain) {
    return "verified account";
  }
  return `${local.slice(0, 1)}***@${domain}`;
}

export function buildStaffAssignmentProposalHash(input: {
  projectId: string;
  projectOwnerUserId: string;
  staffUserId: string;
  staffEmailSha256: string;
  noticeVersion: string;
  noticeSha256: string;
}) {
  return hashProjectOperationRequest({
    assignmentRole: PROJECT_STAFF_ASSIGNMENT_ROLE,
    noticeSha256: input.noticeSha256,
    noticeVersion: input.noticeVersion,
    projectId: input.projectId,
    projectOwnerUserId: input.projectOwnerUserId,
    purpose: PROJECT_STAFF_ASSIGNMENT_PURPOSE,
    staffEmailSha256: input.staffEmailSha256,
    staffUserId: input.staffUserId,
  });
}

const transitions: Record<
  ProjectStaffAssignmentAction,
  readonly ProjectStaffAssignmentStatus[]
> = {
  owner_approve: ["proposed"],
  owner_decline: ["proposed"],
  owner_revoke: ["proposed", "owner_approved", "active"],
  lawyer_accept: ["owner_approved"],
  lawyer_decline: ["owner_approved"],
  lawyer_resign: ["active"],
  admin_withdraw: ["proposed", "owner_approved"],
  admin_revoke: ["active"],
};

export function projectStaffTransitionAllowed(
  status: ProjectStaffAssignmentStatus,
  action: ProjectStaffAssignmentAction
): boolean {
  return transitions[action].includes(status);
}

export type ProtectedProjectResource =
  | "project_fact"
  | "project_document"
  | "private_chat"
  | "task"
  | "requirement"
  | "message"
  | "financial_record"
  | "engagement_record"
  | "other_project_resource";

/** M4-004 owns disclosure policy; M4-002 never authorizes protected resources. */
export function authorizeProjectStaffDisclosure(_input: {
  assignmentId: string;
  projectId: string;
  staffUserId: string;
  resource: ProtectedProjectResource;
}): { decision: "DENY"; reason: "m4_004_disclosure_policy_pending" } {
  return { decision: "DENY", reason: "m4_004_disclosure_policy_pending" };
}
