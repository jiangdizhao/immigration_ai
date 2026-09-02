export function canLawyerAccessAssignedRequest({
  actorId,
  actorRole,
  assignedLawyerUserId,
}: {
  actorId: string;
  actorRole: string;
  assignedLawyerUserId: string | null;
}) {
  return (
    actorRole === "admin" ||
    (actorRole === "lawyer" && assignedLawyerUserId === actorId)
  );
}

export function canManageLawyerAssignments(role: string) {
  return role === "admin";
}

export function canManageLawyerRoles(role: string) {
  return role === "admin";
}

export function canCustomerReplyToLawyerRequest({
  ownerId,
  actorId,
  status,
}: {
  ownerId: string;
  actorId: string;
  status: string;
}) {
  return ownerId === actorId && status === "needs_more_information";
}
