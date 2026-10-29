import { createHash } from "node:crypto";
import { z } from "zod";
import { guestRegex } from "@/lib/constants";
import {
  canonicalProjectOperationRequest,
  hashProjectOperationRequest,
} from "@/lib/db/project-foundation-utils";

/**
 * Phase 13 M4-004 — service engagement, immutable agreement versions, signature
 * evidence and customer-to-staff protected resource disclosure.
 *
 * This module is deliberately provider-free: it contains no database, network
 * or model access so the authorization and lifecycle contract can be unit
 * tested offline. It never authorizes a professional act, a legally effective
 * signature or a protected-resource disclosure by itself; those require the
 * separately injected ports in `authority.ts`, `signature.ts` and
 * `disclosure.ts`, all of which deny by default in production.
 */

export const SERVICE_ENGAGEMENT_SCOPE_CODES = [
  "school_admissions",
  "student_500_visa",
] as const;
export const SERVICE_ENGAGEMENT_TERMINAL_REASON_CODES = [
  "owner_terminated",
  "owner_requested",
] as const;
export const SERVICE_ENGAGEMENT_MODES = ["self_service", "managed"] as const;
export const SERVICE_ENGAGEMENT_STATUSES = [
  "draft",
  "awaiting_customer_action",
  "active",
  "suspended",
  "terminated",
] as const;
export const SERVICE_AGREEMENT_VERSION_STATUSES = [
  "draft",
  "issued",
  "superseded",
] as const;
export const SERVICE_SIGNATURE_VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "rejected",
] as const;
export const DISCLOSURE_RESOURCE_CATEGORIES = [
  "project_fact",
  "project_document",
  "private_chat",
  "financial_record",
  "engagement_record",
] as const;
export const DISCLOSURE_GRANTABLE_RESOURCE_CATEGORIES = [
  "project_fact",
  "project_document",
] as const;
export const DISCLOSURE_PURPOSE_CODES = [
  "professional_review",
  "service_delivery",
] as const;
export const DISCLOSURE_GRANT_STATUSES = [
  "granted",
  "revoked",
  "expired",
] as const;
export const DISCLOSURE_REVOCATION_REASON_CODES = [
  "owner_revoked",
  "owner_expired",
] as const;

export type ServiceEngagementScopeCode =
  (typeof SERVICE_ENGAGEMENT_SCOPE_CODES)[number];
export type ServiceEngagementMode = (typeof SERVICE_ENGAGEMENT_MODES)[number];
export type ServiceEngagementStatus =
  (typeof SERVICE_ENGAGEMENT_STATUSES)[number];
export type ServiceAgreementVersionStatus =
  (typeof SERVICE_AGREEMENT_VERSION_STATUSES)[number];
export type ServiceSignatureVerificationStatus =
  (typeof SERVICE_SIGNATURE_VERIFICATION_STATUSES)[number];
export type DisclosureResourceCategory =
  (typeof DISCLOSURE_RESOURCE_CATEGORIES)[number];
export type DisclosurePurposeCode = (typeof DISCLOSURE_PURPOSE_CODES)[number];
export type DisclosureGrantStatus = (typeof DISCLOSURE_GRANT_STATUSES)[number];
export type DisclosureRevocationReasonCode =
  (typeof DISCLOSURE_REVOCATION_REASON_CODES)[number];

export const SERVICE_AGREEMENT_TERMS_SCHEMA_VERSION =
  "m4-004-service-terms-v1" as const;
export const SERVICE_SIGNATURE_PURPOSE =
  "m4-004_customer_service_agreement_signature" as const;
export const SERVICE_ENGAGEMENT_LIFECYCLE_ACTIONS = [
  "activate",
  "suspend",
  "resume",
  "terminate",
] as const;
export type ServiceEngagementLifecycleAction =
  (typeof SERVICE_ENGAGEMENT_LIFECYCLE_ACTIONS)[number];

export const SERVICE_AGREEMENT_TERMS_MAX_BYTES = 64 * 1024;
export const SERVICE_SIGNATURE_EVIDENCE_REF_MAX = 256;
/**
 * Maximum tolerated future skew for a customer-declared signing time. The same
 * limit is enforced by Migration 0043's signature guard trigger
 * (`declaredSignedAt <= submittedAt + interval '5 minutes'`) and by the HTTP
 * boundary; `schema-contract.test.ts` asserts the two stay identical.
 */
export const SERVICE_SIGNATURE_DECLARED_TIME_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const SERVICE_ENGAGEMENT_PAGE_DEFAULT = 25;
export const SERVICE_ENGAGEMENT_PAGE_MAX = 50;
export const SERVICE_DISCLOSURE_PAGE_DEFAULT = 25;
export const SERVICE_DISCLOSURE_PAGE_MAX = 50;

export type ServiceEngagementActor = {
  userId: string;
  role: "user" | "lawyer" | "admin";
  nonGuest: boolean;
  emailVerified: boolean;
};

export function isServiceEngagementEnabled(
  value: string | undefined = process.env.PHASE13_SERVICE_ENGAGEMENT_ENABLED
) {
  return value?.trim().toLowerCase() === "true";
}

export function isNonGuestServiceAccount(email: string) {
  return email.trim().length > 0 && !guestRegex.test(email);
}

/**
 * SQL mirror of `guestRegex` for *pre-filtering* only.
 *
 * It is the same anchored pattern (PostgreSQL `~*` is case-insensitive), so the
 * SQL predicate and `guestRegex` agree exactly, including emails such as
 * `guest-1@example.test` (not a guest account because the pattern is anchored) and
 * `guest-foo` (no digit after the prefix). `isNonGuestServiceAccount` remains the
 * authoritative check and is still applied after the query.
 */
export const SERVICE_GUEST_EMAIL_SQL_REGEX =
  "^guest-[0-9]+(-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$";

export const SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION =
  "m4-004-service-agreement-acceptance-v1" as const;
export const SERVICE_ENGAGEMENT_AGREEMENT_NOTICE =
  "I confirm that I am the owner of this Project and that I have read and accept this exact agreement version for the exact service scope shown. This acceptance is a record of my decision about these terms only. It is not a verified electronic signature, it does not activate a managed professional service, and it does not authorize any staff member to read Project Facts, Documents, private AI Chats or any other protected Project resource. An AI answer, a chat message, an account membership or a VIP subscription never creates an engagement. I may terminate the engagement, and any separate resource disclosure grant I make can be revoked.";
export const SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_SHA256 = createHash("sha256")
  .update(SERVICE_ENGAGEMENT_AGREEMENT_NOTICE, "utf8")
  .digest("hex");

export const PROJECT_RESOURCE_DISCLOSURE_NOTICE_VERSION =
  "m4-004-resource-disclosure-v1" as const;
export const PROJECT_RESOURCE_DISCLOSURE_NOTICE =
  "I authorize the specifically named assigned professional, for the stated purpose only, to access the exact single Project resource and resource version listed here. This grant is limited to that resource and version. A newer resource version is not covered. This grant does not share any other Fact, Document, private AI Chat, contract, engagement record or financial record, it does not apply to any other Project, it is not the same permission as an AI-context grant, and it is not the same permission as consent to participate in a human message thread. I may revoke it at any time; after revocation the professional can no longer read the resource.";
export const PROJECT_RESOURCE_DISCLOSURE_NOTICE_SHA256 = createHash("sha256")
  .update(PROJECT_RESOURCE_DISCLOSURE_NOTICE, "utf8")
  .digest("hex");

export function canonicalScopeCodes(
  input: readonly string[]
): ServiceEngagementScopeCode[] | null {
  if (
    input.length === 0 ||
    input.length > SERVICE_ENGAGEMENT_SCOPE_CODES.length
  ) {
    return null;
  }
  const unique = new Set<string>();
  for (const value of input) {
    if (
      !(SERVICE_ENGAGEMENT_SCOPE_CODES as readonly string[]).includes(value)
    ) {
      return null;
    }
    if (unique.has(value)) {
      return null;
    }
    unique.add(value);
  }
  return SERVICE_ENGAGEMENT_SCOPE_CODES.filter((code) => unique.has(code));
}

export function sameScopeCodes(
  left: readonly string[],
  right: readonly string[]
) {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}

const serviceAgreementClauseSchema = z
  .object({
    clauseId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u),
    heading: z.string().min(1).max(200),
    body: z.string().min(1).max(4000),
  })
  .strict();

export const serviceAgreementTermsSchema = z
  .object({
    schemaVersion: z.literal(SERVICE_AGREEMENT_TERMS_SCHEMA_VERSION),
    title: z.string().min(1).max(200),
    serviceMode: z.enum(SERVICE_ENGAGEMENT_MODES),
    scopeCodes: z.array(z.enum(SERVICE_ENGAGEMENT_SCOPE_CODES)).min(1).max(2),
    clauses: z.array(serviceAgreementClauseSchema).min(1).max(40),
  })
  .strict();

export type ServiceAgreementTerms = z.infer<typeof serviceAgreementTermsSchema>;

export type ParsedServiceAgreementTerms = {
  payload: string;
  termsSha256: string;
  scopeCodes: ServiceEngagementScopeCode[];
  serviceMode: ServiceEngagementMode;
  schemaVersion: typeof SERVICE_AGREEMENT_TERMS_SCHEMA_VERSION;
};

/**
 * Canonical terms are the exact bytes the customer accepts. The server always
 * derives the hash itself; a caller-supplied hash is never trusted.
 */
export function parseServiceAgreementTerms(
  value: unknown
): ParsedServiceAgreementTerms | null {
  const parsed = serviceAgreementTermsSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const scopeCodes = canonicalScopeCodes(parsed.data.scopeCodes);
  if (!scopeCodes) {
    return null;
  }
  const canonicalTerms: ServiceAgreementTerms = { ...parsed.data, scopeCodes };
  const payload = canonicalProjectOperationRequest(canonicalTerms);
  if (
    new TextEncoder().encode(payload).byteLength >
    SERVICE_AGREEMENT_TERMS_MAX_BYTES
  ) {
    return null;
  }
  return {
    payload,
    termsSha256: createHash("sha256").update(payload, "utf8").digest("hex"),
    scopeCodes,
    serviceMode: canonicalTerms.serviceMode,
    schemaVersion: canonicalTerms.schemaVersion,
  };
}

export function hashServiceAgreementTermsPayload(payload: string) {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * FIX-03: the agreements write boundary accepts only canonical terms.
 *
 * The persisted payload must be byte-identical to the canonical serialization that
 * `parseServiceAgreementTerms` produces, the declared hash must be the hash of
 * those exact bytes, and the declared scope/mode must match the payload. Without
 * this gate an internal caller could persist arbitrary JSON, a hash of unrelated
 * text, or terms for a different scope than the draft it authorizes, and the
 * customer acceptance record would then vouch for bytes the server never produced.
 *
 * Returns the parsed terms on success and `null` on any mismatch.
 */
export function serviceAgreementTermsWriteMatches(input: {
  termsPayload: string;
  termsSha256: string;
  scopeCodes: readonly string[];
  serviceMode: string;
}) {
  if (typeof input.termsPayload !== "string") {
    return null;
  }
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(input.termsPayload);
  } catch {
    return null;
  }
  const terms = parseServiceAgreementTerms(parsedPayload);
  if (!terms) {
    return null;
  }
  if (terms.payload !== input.termsPayload) {
    return null;
  }
  if (terms.termsSha256 !== input.termsSha256) {
    return null;
  }
  if (terms.serviceMode !== input.serviceMode) {
    return null;
  }
  if (!sameScopeCodes(terms.scopeCodes, input.scopeCodes)) {
    return null;
  }
  return terms;
}

const TRANSPARENT_EVIDENCE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;

export function isServiceEvidenceRef(value: string) {
  return TRANSPARENT_EVIDENCE_REF.test(value);
}

export function isSha256Hex(value: string) {
  return SHA256_HEX.test(value);
}

/**
 * Opaque adapter fingerprint for an observed protected resource (R1-05). It must
 * be a bounded, URL-safe identifier so it can be persisted and compared without
 * transformation.
 */
export const SERVICE_RESOURCE_FINGERPRINT_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;

export function isServiceResourceFingerprint(value: unknown): value is string {
  return (
    typeof value === "string" &&
    SERVICE_RESOURCE_FINGERPRINT_PATTERN.test(value)
  );
}

export function buildServiceSignaturePayload(input: {
  engagementId: string;
  agreementVersionId: string;
  termsSha256: string;
  signerUserId: string;
  evidenceRef: string;
  evidenceSha256: string;
  signedAt: string;
}) {
  return {
    agreementVersionId: input.agreementVersionId,
    engagementId: input.engagementId,
    evidenceRef: input.evidenceRef,
    evidenceSha256: input.evidenceSha256,
    purpose: SERVICE_SIGNATURE_PURPOSE,
    signedAt: input.signedAt,
    signerUserId: input.signerUserId,
    termsSha256: input.termsSha256,
  };
}

export function hashServiceSignaturePayload(
  payload: ReturnType<typeof buildServiceSignaturePayload>
) {
  return hashProjectOperationRequest(payload);
}

export type ServiceEngagementOperationAction =
  | "engagement_create"
  | "agreement_draft"
  | "agreement_issue"
  | "agreement_accept"
  | "signature_submit"
  | "signature_verify"
  | "lifecycle"
  | "disclosure_create"
  | "disclosure_revoke";

export type ServiceEngagementOperationRequestInput = {
  action: ServiceEngagementOperationAction;
  projectId: string;
  engagementId?: string;
  agreementVersionId?: string;
  evidenceId?: string;
  grantId?: string;
  lifecycleAction?: ServiceEngagementLifecycleAction;
  expectedProjectRevision?: number;
  expectedEngagementRevision?: number;
  serviceMode?: string;
  scopeCodes?: readonly string[];
  termsSha256?: string;
  customerNoticeVersion?: string;
  termsPayload?: string;
  accepted?: boolean;
  assignmentId?: string;
  resourceCategory?: string;
  resourceId?: string;
  resourceVersion?: number;
  purposeCode?: string;
  expiresAt?: string | null;
  evidenceRef?: string;
  evidenceSha256?: string;
  declaredSignedAt?: string;
  revokeReasonCode?: string;
  /** R1-04: canonical hash of the operator-authority request (target binding). */
  authorityRequestSha256?: string;
  /** R1-05: canonical hash of the resource observation (target binding). */
  resourceObservationSha256?: string;
};

/**
 * Deterministic canonical request hash. Every mutation field that affects the
 * persisted outcome participates, so an identical replay is idempotent and a
 * changed request with the same operation ID conflicts.
 */
export function buildServiceEngagementOperationRequest(
  input: ServiceEngagementOperationRequestInput
) {
  return {
    accepted: input.accepted ?? null,
    action: input.action,
    agreementVersionId: input.agreementVersionId ?? null,
    assignmentId: input.assignmentId ?? null,
    authorityRequestSha256: input.authorityRequestSha256 ?? null,
    customerNoticeVersion: input.customerNoticeVersion ?? null,
    declaredSignedAt: input.declaredSignedAt ?? null,
    engagementId: input.engagementId ?? null,
    evidenceId: input.evidenceId ?? null,
    evidenceRef: input.evidenceRef ?? null,
    evidenceSha256: input.evidenceSha256 ?? null,
    expiresAt: input.expiresAt ?? null,
    expectedEngagementRevision: input.expectedEngagementRevision ?? null,
    expectedProjectRevision: input.expectedProjectRevision ?? null,
    grantId: input.grantId ?? null,
    lifecycleAction: input.lifecycleAction ?? null,
    projectId: input.projectId,
    purposeCode: input.purposeCode ?? null,
    resourceCategory: input.resourceCategory ?? null,
    resourceId: input.resourceId ?? null,
    resourceObservationSha256: input.resourceObservationSha256 ?? null,
    resourceVersion: input.resourceVersion ?? null,
    revokeReasonCode: input.revokeReasonCode ?? null,
    scopeCodes: input.scopeCodes ? [...input.scopeCodes] : null,
    serviceMode: input.serviceMode ?? null,
    termsPayload: input.termsPayload ?? null,
    termsSha256: input.termsSha256 ?? null,
  };
}

export function hashServiceEngagementOperationRequest(
  input: ServiceEngagementOperationRequestInput
) {
  return hashProjectOperationRequest(
    buildServiceEngagementOperationRequest(input)
  );
}

const engagementTransitions: Record<
  ServiceEngagementStatus,
  readonly ServiceEngagementStatus[]
> = {
  draft: ["awaiting_customer_action", "terminated"],
  awaiting_customer_action: ["active", "terminated"],
  active: ["suspended", "terminated"],
  suspended: ["active", "terminated"],
  terminated: [],
};

export function serviceEngagementTransitionAllowed(
  from: ServiceEngagementStatus,
  to: ServiceEngagementStatus
) {
  return engagementTransitions[from].includes(to);
}

export function serviceLifecycleTargetStatus(
  action: ServiceEngagementLifecycleAction
): ServiceEngagementStatus {
  switch (action) {
    case "activate":
    case "resume":
      return "active";
    case "suspend":
      return "suspended";
    default:
      return "terminated";
  }
}

export function serviceLifecycleSourceStatuses(
  action: ServiceEngagementLifecycleAction
): readonly ServiceEngagementStatus[] {
  switch (action) {
    case "activate":
      return ["awaiting_customer_action"];
    case "suspend":
      return ["active"];
    case "resume":
      return ["suspended"];
    default:
      return ["draft", "awaiting_customer_action", "active", "suspended"];
  }
}

/**
 * Managed service keeps fail-closed activation: verified, independently
 * attested signature evidence is mandatory, and `self_service` never claims a
 * professional or lawyer approval.
 */
export function serviceActivationRequiresVerifiedSignature(
  mode: ServiceEngagementMode
) {
  return mode === "managed";
}

export function isGrantableResourceCategory(
  value: string
): value is (typeof DISCLOSURE_GRANTABLE_RESOURCE_CATEGORIES)[number] {
  return (
    DISCLOSURE_GRANTABLE_RESOURCE_CATEGORIES as readonly string[]
  ).includes(value);
}

export function isDisclosurePurposeCode(
  value: string
): value is DisclosurePurposeCode {
  return (DISCLOSURE_PURPOSE_CODES as readonly string[]).includes(value);
}

export function isDisclosureRevocationReasonCode(
  value: string
): value is DisclosureRevocationReasonCode {
  return (DISCLOSURE_REVOCATION_REASON_CODES as readonly string[]).includes(
    value
  );
}

export function parseServicePageLimit(input: {
  limit?: string | null;
  defaultLimit: number;
  maxLimit: number;
}) {
  const raw = input.limit ?? String(input.defaultLimit);
  if (!/^\d+$/u.test(raw)) {
    return null;
  }
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > input.maxLimit) {
    return null;
  }
  return limit;
}

export function parseIsoTimestamp(value: string) {
  if (!Number.isFinite(Date.parse(value))) {
    return null;
  }
  const date = new Date(value);
  return date.toISOString() === value ? date : null;
}

/**
 * Staff metadata disclosure policy (R1-01).
 *
 * An active M4-002 staff assignment establishes Project-scope staff
 * participation only. It does not by itself authorize disclosure of Engagement
 * service scope, service mode or lifecycle status. Those protected fields are
 * withheld unless an explicitly approved policy authorizes them, and every
 * response states which policy was applied.
 */
export const SERVICE_ENGAGEMENT_METADATA_FIELDS = [
  "serviceMode",
  "scopeCodes",
  "status",
] as const;
export type ServiceEngagementMetadataField =
  (typeof SERVICE_ENGAGEMENT_METADATA_FIELDS)[number];

export type ServiceEngagementMetadataPolicy = {
  policyCode: string;
  authorize: Record<ServiceEngagementMetadataField, boolean>;
};

export const SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY_CODE =
  "m4-004-staff-metadata-deny-by-default" as const;
export const SERVICE_ENGAGEMENT_OWNER_METADATA_POLICY_CODE =
  "m4-004-project-owner-full-metadata" as const;

/**
 * Production default for staff callers: no protected Engagement metadata is
 * disclosed until an approved staff-metadata policy exists.
 */
export const SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY: ServiceEngagementMetadataPolicy =
  {
    policyCode: SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY_CODE,
    authorize: { scopeCodes: false, serviceMode: false, status: false },
  };

/** The Project owner is the engagement counterparty, so all fields apply. */
export const SERVICE_ENGAGEMENT_OWNER_METADATA_POLICY: ServiceEngagementMetadataPolicy =
  {
    policyCode: SERVICE_ENGAGEMENT_OWNER_METADATA_POLICY_CODE,
    authorize: { scopeCodes: true, serviceMode: true, status: true },
  };

export function serviceEngagementMetadataAuthorized(
  policy: ServiceEngagementMetadataPolicy,
  field: ServiceEngagementMetadataField
) {
  return policy.authorize[field] === true;
}

/**
 * Canonical request presented to a scope-specific service operator authority.
 *
 * R1-04: a global `lawyer`/`admin` account role is never sufficient. The
 * authority receives the actual persisted Project/Engagement/Agreement-version
 * target, the exact action and the operator's server-derived current
 * eligibility, and the repository later re-derives the same canonical hash from
 * the rows it locks. A mismatch means the decision was made about a different
 * target and the operation is refused.
 */
export const SERVICE_OPERATOR_ACTIONS = [
  "author_draft",
  "issue",
  "verify_signature",
] as const;
export type ServiceOperatorAction = (typeof SERVICE_OPERATOR_ACTIONS)[number];

export const SERVICE_OPERATOR_ASSIGNMENT_STATUSES = [
  "proposed",
  "owner_approved",
  "active",
  "declined",
  "withdrawn",
  "revoked",
] as const;
export type ServiceOperatorAssignmentStatus =
  (typeof SERVICE_OPERATOR_ASSIGNMENT_STATUSES)[number];

export type ServiceOperatorAuthorityRequestInput = {
  action: ServiceOperatorAction;
  projectId: string;
  engagementId: string;
  serviceMode: string;
  scopeCodes: readonly ServiceEngagementScopeCode[];
  engagementStatus: string;
  agreementVersionId: string | null;
  agreementVersionStatus: string | null;
  versionNumber: number | null;
  termsSha256: string | null;
  evidenceId: string | null;
  evidenceVerificationStatus: string | null;
  signerUserId: string | null;
  operatorUserId: string;
  operatorRole: "user" | "lawyer" | "admin";
  operatorEmailVerified: boolean;
  operatorAssignmentId: string | null;
  operatorAssignmentStatus: ServiceOperatorAssignmentStatus | null;
  operatorEligible: boolean;
};

export function buildServiceOperatorAuthorityRequest(
  input: ServiceOperatorAuthorityRequestInput
) {
  return {
    action: input.action,
    agreementVersionId: input.agreementVersionId,
    agreementVersionStatus: input.agreementVersionStatus,
    engagementId: input.engagementId,
    engagementStatus: input.engagementStatus,
    evidenceId: input.evidenceId,
    evidenceVerificationStatus: input.evidenceVerificationStatus,
    operatorAssignmentId: input.operatorAssignmentId,
    operatorAssignmentStatus: input.operatorAssignmentStatus,
    operatorEligible: input.operatorEligible,
    operatorEmailVerified: input.operatorEmailVerified,
    operatorRole: input.operatorRole,
    operatorUserId: input.operatorUserId,
    projectId: input.projectId,
    scopeCodes: [...input.scopeCodes].sort(),
    serviceMode: input.serviceMode,
    signerUserId: input.signerUserId,
    termsSha256: input.termsSha256,
    versionNumber: input.versionNumber,
  };
}

export function hashServiceOperatorAuthorityRequest(
  input: ServiceOperatorAuthorityRequestInput
) {
  return hashProjectOperationRequest(
    buildServiceOperatorAuthorityRequest(input)
  );
}

/**
 * Resource observation identity (R1-05).
 *
 * A protected resource adapter must return the exact version plus an opaque
 * fingerprint of the bytes/metadata it observed. The observation hash binds
 * Project, category, resource id, version, owner, adapter code and fingerprint,
 * so a grant can only be persisted for the exact observation that was authorized.
 * The repository recomputes it from persisted values and refuses any grant whose
 * observation cannot be reproduced.
 */
export type ServiceResourceObservationInput = {
  adapterCode: string;
  projectId: string;
  resourceCategory: string;
  resourceId: string;
  resourceVersion: number;
  resourceOwnerUserId: string;
  resourceFingerprint: string;
};

export function buildServiceResourceObservation(
  input: ServiceResourceObservationInput
) {
  return {
    adapterCode: input.adapterCode,
    projectId: input.projectId,
    resourceCategory: input.resourceCategory,
    resourceFingerprint: input.resourceFingerprint,
    resourceId: input.resourceId,
    resourceOwnerUserId: input.resourceOwnerUserId,
    resourceVersion: input.resourceVersion,
  };
}

export function hashServiceResourceObservation(
  input: ServiceResourceObservationInput
) {
  return hashProjectOperationRequest(buildServiceResourceObservation(input));
}
