export type AdminLawyerRequestPatch = {
  assignedLawyerUserId?: string | null;
  status?: string;
  lawyerResponse?: string;
  correctedAnswer?: string;
};

export type AdminLawyerRequestMutation =
  | "none"
  | "assignment"
  | "review"
  | "mixed";

export function classifyAdminLawyerRequestPatch({
  assignedLawyerUserId,
  status,
  lawyerResponse,
  correctedAnswer,
}: AdminLawyerRequestPatch): AdminLawyerRequestMutation {
  const hasAssignmentMutation = assignedLawyerUserId !== undefined;
  const hasReviewMutation =
    status !== undefined ||
    lawyerResponse !== undefined ||
    correctedAnswer !== undefined;

  if (hasAssignmentMutation && hasReviewMutation) {
    return "mixed";
  }
  if (hasAssignmentMutation) {
    return "assignment";
  }
  if (hasReviewMutation) {
    return "review";
  }
  return "none";
}

export function assignmentEventType(
  previousAssignedLawyerUserId: string | null,
  assignedLawyerUserId: string | null
) {
  if (assignedLawyerUserId) {
    return previousAssignedLawyerUserId ? "reassigned" : "assigned";
  }
  return "unassigned";
}
