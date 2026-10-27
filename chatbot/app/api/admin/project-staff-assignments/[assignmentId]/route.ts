import { projectStaffAssignmentHandlers } from "@/lib/project-staff-assignments/runtime";

type RouteContext = { params: Promise<{ assignmentId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { assignmentId } = await context.params;
  return projectStaffAssignmentHandlers.adminTransition(request, assignmentId);
}
