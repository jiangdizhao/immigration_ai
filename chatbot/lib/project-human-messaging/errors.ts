export type ProjectHumanMessagingErrorCode =
  | "invalid_request"
  | "not_found"
  | "state_conflict"
  | "revision_conflict"
  | "idempotency_conflict"
  | "integrity_conflict";

export class ProjectHumanMessagingError extends Error {
  readonly code: ProjectHumanMessagingErrorCode;

  constructor(code: ProjectHumanMessagingErrorCode) {
    super(code);
    this.name = "ProjectHumanMessagingError";
    this.code = code;
  }
}
