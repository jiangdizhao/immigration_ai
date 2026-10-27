import { projectStaffAssignmentHandlers } from "@/lib/project-staff-assignments/runtime";

export function GET(request: Request) {
  return projectStaffAssignmentHandlers.lawyerInbox(request);
}
