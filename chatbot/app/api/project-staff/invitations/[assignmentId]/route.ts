import { projectStaffAssignmentHandlers } from "@/lib/project-staff-assignments/runtime";

type RouteContext = { params: Promise<{ assignmentId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { assignmentId } = await context.params;
  return projectStaffAssignmentHandlers.lawyerTransition(request, assignmentId);
}
