/**
 * Phase 13 M4-006 sanitized domain error.
 *
 * Callers never receive protected package content, review notes, credential
 * evidence or another Project's identifiers through this surface.
 */
export type ProfessionalReviewErrorCode =
  | "invalid_request"
  | "not_found"
  | "forbidden"
  | "authority_denied"
  | "state_conflict"
  | "revision_conflict"
  | "idempotency_conflict"
  | "target_untrusted"
  | "target_kind_unsupported"
  | "target_mismatch"
  | "integrity_conflict"
  | "unavailable";

export class ProfessionalReviewError extends Error {
  readonly code: ProfessionalReviewErrorCode;

  constructor(code: ProfessionalReviewErrorCode) {
    super(code);
    this.name = "ProfessionalReviewError";
    this.code = code;
  }
}
