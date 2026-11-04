import {
  type ProfessionalCredentialVerifier,
  unavailableProfessionalCredentialVerifier,
} from "../../professional-review/authority";
import {
  isStudent500GsSectionKey,
  isStudent500PreparationSha256,
  preparationDigest,
  Student500PreparationError,
} from "./contracts";
import {
  isStudent500EditorialDisclosureScope,
  isStudent500EditorialRationaleCode,
  STUDENT_500_EDITORIAL_STALE_REASONS,
  STUDENT_500_EDITORIAL_STATUSES,
  STUDENT_500_MAX_DISCLOSED_FACTS,
  STUDENT_500_MAX_EDITORIAL_EDITS,
  type Student500EditorialConsent,
  type Student500EditorialEdit,
  type Student500EditorialReviewRecord,
  type Student500EditorialStaleReason,
  type Student500EditorialStatus,
  validateEditorialCommentBody,
} from "./m7-contracts";

/**
 * Phase 13 M7 - professional editorial review boundary.
 *
 * Editorial review is *not* M4 professional sign-off and *not* M8 package approval.
 * The M7 rule is that an editorial round can only exist when three independent
 * things are true, and any missing one keeps the round in a pending/fail-closed
 * state:
 *
 *   1. the customer explicitly consented to disclose that exact draft version and
 *      those exact fact references;
 *   2. an editorial authority policy allows this actor this action on this target;
 *   3. a professional credential source can confirm the reviewer's qualification.
 *
 * No credential registry is integrated (the accepted M4 verifier reports
 * `unavailable`), so requirement 3 cannot currently be satisfied. M7 therefore ships
 * a deny-by-default authority plus the M4 unavailable verifier, which means a
 * review can be requested and persisted, but it can never become "approved",
 * "verified" or a professional sign-off.
 */

export const STUDENT_500_EDITORIAL_AUTHORITY_ACTIONS = [
  "request_editorial_review",
  "submit_editorial_feedback",
  "read_editorial_review",
] as const;
export type Student500EditorialAuthorityAction =
  (typeof STUDENT_500_EDITORIAL_AUTHORITY_ACTIONS)[number];

export type Student500EditorialAssignmentStatus =
  | "active"
  | "pending"
  | "revoked"
  | "missing"
  | "unavailable";

export type Student500EditorialAuthorityRequest = {
  readonly action: Student500EditorialAuthorityAction;
  readonly actorUserId: string;
  /** Server-derived account role; informational only, never sufficient. */
  readonly actorRole: string;
  readonly projectId: string;
  readonly applicationId: string;
  readonly draftId: string;
  readonly draftVersion: number;
  /** Hash of the exact target draft, so authority can never float to a new version. */
  readonly draftContentSha256: string;
  readonly reviewId: string | null;
  readonly reviewerAssignmentStatus: Student500EditorialAssignmentStatus;
  readonly requestSha256: string;
};

export type Student500EditorialAuthorityDecision =
  | {
      readonly allowed: true;
      readonly authorityCode: string;
      readonly policyVersion: string;
    }
  | {
      readonly allowed: false;
      readonly reasonCode:
        | "editorial_authority_unavailable"
        | "editorial_authority_denied"
        | "editorial_target_denied";
    };

export type Student500EditorialAuthority = {
  readonly code: string;
  decide: (
    request: Student500EditorialAuthorityRequest
  ) => Student500EditorialAuthorityDecision;
};

export const DENY_ALL_STUDENT_500_EDITORIAL_AUTHORITY_CODE =
  "deny_by_default_student500_editorial_authority" as const;

/**
 * Production default. No approved Student 500 editorial-review authority policy
 * exists, and an account `role = "lawyer"` is not evidence of qualification, so
 * nobody may read or submit feedback on a disclosed draft.
 */
export const denyAllStudent500EditorialAuthority: Student500EditorialAuthority =
  {
    code: DENY_ALL_STUDENT_500_EDITORIAL_AUTHORITY_CODE,
    decide() {
      return { allowed: false, reasonCode: "editorial_authority_unavailable" };
    },
  };

/** Refuses every credential claim until a registry is actually integrated. */
export const student500EditorialCredentialVerifier: ProfessionalCredentialVerifier =
  unavailableProfessionalCredentialVerifier;

export function editorialAuthorityRequestSha256(input: {
  readonly action: string;
  readonly actorUserId: string;
  readonly projectId: string;
  readonly applicationId: string;
  readonly draftId: string;
  readonly draftVersion: number;
  readonly draftContentSha256: string;
  readonly reviewId: string | null;
  readonly reviewerAssignmentStatus: string;
}): string {
  return preparationDigest(input);
}

export function editorialConsentSha256(
  consent: Student500EditorialConsent
): string {
  return preparationDigest({
    consentCode: consent.consentCode,
    consentGranted: consent.consentGranted,
    disclosureScopes: [...consent.disclosureScopes].sort(),
    draftContentSha256: consent.draftContentSha256,
    draftId: consent.draftId,
    draftVersion: consent.draftVersion,
    factReferenceIds: [...consent.factReferenceIds].sort(),
  });
}

/**
 * Consent is validated structurally: the exact draft version and hash must be
 * named, the scopes must be explicit and non-empty, and `consentGranted` must be
 * literally true. Nothing here infers consent from M4 human messaging consent,
 * Project membership, prior reviews or an account role.
 */
export function validateEditorialConsent(input: {
  readonly draftId: unknown;
  readonly draftVersion: unknown;
  readonly draftContentSha256: unknown;
  readonly disclosureScopes: unknown;
  readonly factReferenceIds: unknown;
  readonly consentGranted: unknown;
  readonly consentCode: unknown;
}): Student500EditorialConsent {
  if (input.consentGranted !== true) {
    throw new Student500PreparationError("consent_required");
  }
  if (
    typeof input.draftId !== "string" ||
    typeof input.draftVersion !== "number" ||
    !Number.isInteger(input.draftVersion) ||
    input.draftVersion < 1 ||
    !isStudent500PreparationSha256(input.draftContentSha256) ||
    typeof input.consentCode !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input.consentCode)
  ) {
    throw new Student500PreparationError("invalid_request");
  }
  if (
    !Array.isArray(input.disclosureScopes) ||
    input.disclosureScopes.length === 0
  ) {
    throw new Student500PreparationError("consent_required");
  }
  const scopes = input.disclosureScopes.map((scope) => {
    if (!isStudent500EditorialDisclosureScope(scope)) {
      throw new Student500PreparationError("invalid_request");
    }
    return scope;
  });
  if (!Array.isArray(input.factReferenceIds)) {
    throw new Student500PreparationError("invalid_request");
  }
  if (input.factReferenceIds.length > STUDENT_500_MAX_DISCLOSED_FACTS) {
    throw new Student500PreparationError("limit_exceeded");
  }
  const factReferenceIds = input.factReferenceIds.map((entry) => {
    if (typeof entry !== "string" || entry.length === 0 || entry.length > 128) {
      throw new Student500PreparationError("invalid_request");
    }
    return entry;
  });
  return {
    consentCode: input.consentCode,
    consentGranted: true,
    disclosureScopes: [...new Set(scopes)],
    draftContentSha256: input.draftContentSha256,
    draftId: input.draftId,
    draftVersion: input.draftVersion,
    factReferenceIds: [...new Set(factReferenceIds)],
  };
}

export function validateEditorialEdits(
  value: unknown
): readonly Student500EditorialEdit[] {
  if (!Array.isArray(value) || value.length > STUDENT_500_MAX_EDITORIAL_EDITS) {
    throw new Student500PreparationError("invalid_request");
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Student500PreparationError("invalid_request");
    }
    const record = entry as Record<string, unknown>;
    if (!isStudent500GsSectionKey(record.sectionKey)) {
      throw new Student500PreparationError("invalid_request");
    }
    return {
      proposedText: validateEditorialCommentBody(record.proposedText),
      rationaleCode: (() => {
        if (!isStudent500EditorialRationaleCode(record.rationaleCode)) {
          throw new Student500PreparationError("invalid_request");
        }
        return record.rationaleCode;
      })(),
      sectionKey: record.sectionKey,
    };
  });
}

export const isStudent500EditorialStatus = (
  value: unknown
): value is Student500EditorialStatus =>
  typeof value === "string" &&
  (STUDENT_500_EDITORIAL_STATUSES as readonly string[]).includes(value);

/**
 * Selective invalidation for one editorial round. Only reasons this system can
 * actually prove are reported; a review never claims a legal change occurred.
 */
export function editorialStaleReasons(input: {
  readonly review: Pick<
    Student500EditorialReviewRecord,
    "draftId" | "draftContentSha256" | "disclosedFactReferenceIds"
  >;
  readonly currentDraftId: string | null;
  readonly currentDraftContentSha256: string | null;
  readonly readableFactReferenceIds: readonly string[];
  readonly authorityAllowed: boolean;
}): readonly Student500EditorialStaleReason[] {
  const reasons = new Set<Student500EditorialStaleReason>();
  if (
    input.currentDraftId === null ||
    input.currentDraftId !== input.review.draftId
  ) {
    reasons.add("draft_superseded");
  } else if (
    input.currentDraftContentSha256 !== null &&
    input.currentDraftContentSha256 !== input.review.draftContentSha256
  ) {
    reasons.add("draft_content_changed");
  }
  const readable = new Set(input.readableFactReferenceIds);
  for (const factReferenceId of input.review.disclosedFactReferenceIds) {
    if (!readable.has(factReferenceId)) {
      reasons.add("disclosed_fact_unreadable");
    }
  }
  if (!input.authorityAllowed) {
    reasons.add("authority_revoked");
  }
  return [...reasons].filter((reason) =>
    (STUDENT_500_EDITORIAL_STALE_REASONS as readonly string[]).includes(reason)
  );
}
