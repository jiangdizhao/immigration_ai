import { projectStaffAssignmentHandlers } from "@/lib/project-staff-assignments/runtime";

export function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  return projectStaffAssignmentHandlers.adminList(request, projectId);
}

export function POST(request: Request) {
  return projectStaffAssignmentHandlers.adminPropose(request);
}
