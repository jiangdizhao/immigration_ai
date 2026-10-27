export type ProjectStaffAssignmentErrorCode =
  | "invalid_request"
  | "not_found"
  | "forbidden"
  | "state_conflict"
  | "revision_conflict"
  | "idempotency_conflict"
  | "integrity_conflict";

export class ProjectStaffAssignmentError extends Error {
  readonly code: ProjectStaffAssignmentErrorCode;

  constructor(code: ProjectStaffAssignmentErrorCode) {
    super(code);
    this.name = "ProjectStaffAssignmentError";
    this.code = code;
  }
}
