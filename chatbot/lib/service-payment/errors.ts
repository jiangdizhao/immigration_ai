/**
 * Phase 13 M4-005 sanitized domain error.
 *
 * Callers never receive raw financial references, receipt content, bank detail,
 * provider payloads or condition/evidence identifiers they are not authorized to
 * know about through this surface.
 */
export type ServicePaymentErrorCode =
  | "invalid_request"
  | "not_found"
  | "forbidden"
  | "authority_denied"
  | "state_conflict"
  | "revision_conflict"
  | "idempotency_conflict"
  | "verification_unavailable"
  | "integrity_conflict";

export class ServicePaymentError extends Error {
  readonly code: ServicePaymentErrorCode;

  constructor(code: ServicePaymentErrorCode) {
    super(code);
    this.name = "ServicePaymentError";
    this.code = code;
  }
}
