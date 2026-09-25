import { canLawyerAccessAssignedRequest } from "@/lib/lawyer-requests/rbac";

export type LawyerWorkspaceActor =
  | { authenticated: false }
  | { authenticated: true; role: string; id: string };

export function lawyerQueueAccessForActor(actor: LawyerWorkspaceActor): {
  allowed: boolean;
  status: number;
  error: string | null;
} {
  if (!actor.authenticated) {
    return {
      allowed: false,
      status: 401,
      error: "Authentication required.",
    };
  }
  if (actor.role !== "lawyer") {
    return {
      allowed: false,
      status: 403,
      error: "Lawyer access required.",
    };
  }
  return { allowed: true, status: 200, error: null };
}

export function lawyerDetailAccessForActor(
  actor: LawyerWorkspaceActor,
  assignedLawyerUserId: string | null
): { allowed: boolean; status: number; error: string | null } {
  const queueAccess = lawyerQueueAccessForActor(actor);
  if (!queueAccess.allowed) {
    return queueAccess;
  }
  const authenticated = actor as { role: string; id: string };
  const allowed = canLawyerAccessAssignedRequest({
    actorId: authenticated.id,
    actorRole: authenticated.role,
    assignedLawyerUserId,
  });
  if (!allowed) {
    return {
      allowed: false,
      status: 403,
      error: "This request is not assigned to you.",
    };
  }
  return { allowed: true, status: 200, error: null };
}
