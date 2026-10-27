import { projectStaffAssignmentHandlers } from "@/lib/project-staff-assignments/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectStaffAssignmentHandlers.ownerList(request, projectId);
}
