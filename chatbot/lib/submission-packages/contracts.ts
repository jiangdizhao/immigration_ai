import {
  canonicalJson,
  isManagedTargetKind,
  type ManagedTargetKind,
  sha256Hex,
} from "@/lib/managed-target/policy";
import {
  type CapabilityEnvironment,
  parseCapabilityFlag,
} from "@/lib/platform/capability-environment";

/**
 * Phase 13 M8.1 - exact-version submission package contracts.
 *
 * One shared package lifecycle for the two existing managed target kinds. A package
 * is a *manifest*: identities, digests, status indicators and disclosures that
 * reference immutable M5.1/M6.2/M7 artifacts. It never copies document bodies, chat
 * content, fact values or legal text, and it never asserts legal correctness,
 * professional review, eligibility or submission.
 *
 * Nothing here decides whether an application *should* be submitted; that is M8.2.
 * M8.1 only records exactly what the customer reviewed and confirmed.
 */

export const SUBMISSION_PACKAGE_SCHEMA =
  "phase13.m8.submission-package.v1" as const;
export const SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION =
  "phase13.m8.customer-statements.v1" as const;

/** Frozen rows are immutable; this is the only stored status. */
export const SUBMISSION_PACKAGE_STATUSES = ["frozen"] as const;
export type SubmissionPackageStatus =
  (typeof SUBMISSION_PACKAGE_STATUSES)[number];

/**
 * Two distinct customer confirmations. They are deliberately separate: reviewing
 * displayed package content is not the same statement as confirming that the
 * customer's own declarations and facts are true and complete.
 */
export const SUBMISSION_CONFIRMATION_TYPES = [
  "package_content_review",
  "customer_declarations",
] as const;
export type SubmissionConfirmationType =
  (typeof SUBMISSION_CONFIRMATION_TYPES)[number];

/**
 * Deterministic reasons a frozen package or its confirmation is no longer current.
 * Every code comes from a compared dependency identity - never from a timer, a
 * heuristic score or a guess.
 */
export const SUBMISSION_STALE_REASONS = [
  "target_archived",
  "project_closed",
  "access_revoked",
  "application_revision_changed",
  "gs_draft_changed",
  "gs_draft_unavailable",
  "preparation_snapshot_changed",
  "fact_reference_changed",
  "fact_not_visible",
  "legal_source_revision_changed",
  "school_package_changed",
  "school_application_changed",
  "source_unavailable",
  // The confirmation exists but its mandatory post-write validation did not
  // complete, so it is never current.
  "confirmation_not_finalized",
] as const;
export type SubmissionStaleReason = (typeof SUBMISSION_STALE_REASONS)[number];

export const SUBMISSION_PACKAGE_DISCLOSURES = [
  "customer_confirmed_package_not_legal_advice",
  "not_professionally_reviewed",
  "not_submitted_to_any_authority",
  "legal_coverage_partial_and_unverified",
  "customer_reported_evidence_unverified",
] as const;
export type SubmissionPackageDisclosure =
  (typeof SUBMISSION_PACKAGE_DISCLOSURES)[number];

/** Indicator buckets shown to the customer; never a readiness score. */
export const SUBMISSION_INDICATOR_KINDS = [
  "missing",
  "unverified",
  "conflicted",
  "unknown",
] as const;
export type SubmissionIndicatorKind =
  (typeof SUBMISSION_INDICATOR_KINDS)[number];

export const SUBMISSION_PACKAGE_ERROR_CODES = [
  "invalid_request",
  "actor_not_eligible",
  "project_not_found",
  "project_forbidden",
  "project_closed",
  "target_not_found",
  "target_archived",
  "package_not_found",
  "confirmation_not_found",
  "source_unavailable",
  "revision_conflict",
  "version_conflict",
  "state_conflict",
  "idempotency_conflict",
  "integrity_conflict",
  "consent_required",
  "limit_exceeded",
] as const;
export type SubmissionPackageErrorCode =
  (typeof SUBMISSION_PACKAGE_ERROR_CODES)[number];

export class SubmissionPackageError extends Error {
  readonly code: SubmissionPackageErrorCode;

  constructor(code: SubmissionPackageErrorCode) {
    super(code);
    this.name = "SubmissionPackageError";
    this.code = code;
  }
}

export const SUBMISSION_PACKAGE_LIMITS = {
  /** Immutable versions retained per (project, target). */
  maxVersionsPerTarget: 12,
  /** Invalidation evidence rows retained per confirmation. */
  maxInvalidationRecords: 24,
  /** Bound on the serialized manifest, so a package can never smuggle bodies. */
  maxManifestBytes: 48 * 1024,
  maxOperationIdLength: 128,
} as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const OPERATION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function isSubmissionPackageUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isSubmissionPackageSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_RE.test(value);
}

export function isSubmissionOperationId(value: unknown): value is string {
  return typeof value === "string" && OPERATION_ID_RE.test(value);
}

export function isSubmissionConfirmationType(
  value: unknown
): value is SubmissionConfirmationType {
  return (
    typeof value === "string" &&
    (SUBMISSION_CONFIRMATION_TYPES as readonly string[]).includes(value)
  );
}

export function isSubmissionTargetKind(
  value: unknown
): value is ManagedTargetKind {
  return isManagedTargetKind(value);
}

/**
 * M8 default-OFF capability.
 *
 * Unlike the local preparation capabilities this is *not* enabled merely by a
 * non-production environment: an unset flag keeps the whole M8 surface absent until
 * an explicit owner decision, and an unrecognised value fails closed.
 */
export function submissionPackagesEnabled(
  value: string | undefined = process.env.PHASE13_SUBMISSION_PACKAGES_ENABLED,
  _environment?: CapabilityEnvironment
): boolean {
  return parseCapabilityFlag(value) ?? false;
}

/** Canonical digest of any manifest-shaped value. */
export function submissionDigest(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/** Validate an operation id from request input without trusting its content. */
export function normalizeOperationId(value: unknown): string {
  if (!isSubmissionOperationId(value)) {
    throw new SubmissionPackageError("invalid_request");
  }
  return value;
}
