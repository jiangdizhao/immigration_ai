import { projectStaffAssignmentHandlers } from "@/lib/project-staff-assignments/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; assignmentId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId, assignmentId } = await context.params;
  return projectStaffAssignmentHandlers.ownerTransition(
    request,
    projectId,
    assignmentId
  );
}
