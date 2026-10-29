export type ServiceEngagementErrorCode =
  | "invalid_request"
  | "not_found"
  | "forbidden"
  | "authority_denied"
  | "state_conflict"
  | "revision_conflict"
  | "idempotency_conflict"
  | "verification_unavailable"
  | "resource_unavailable"
  | "integrity_conflict";

/**
 * Sanitized domain error. Callers never receive raw evidence, protected resource
 * identifiers or provider detail through this surface.
 */
export class ServiceEngagementError extends Error {
  readonly code: ServiceEngagementErrorCode;

  constructor(code: ServiceEngagementErrorCode) {
    super(code);
    this.name = "ServiceEngagementError";
    this.code = code;
  }
}
