import { createHash } from "node:crypto";
import {
  hashProjectOperationRequest,
  validateProjectOperationId,
} from "@/lib/db/project-foundation-utils";
import {
  canonicalJson,
  MANAGED_TARGET_KINDS,
  managedTargetIdentitySha256,
} from "@/lib/managed-target/policy";

/**
 * Phase 13 M5.1 — School Application foundation contracts.
 *
 * This module is the single definition of:
 *   - the School Application lifecycle and its bounded input shapes,
 *   - what "source status" may ever mean (never `official`, never `verified`),
 *   - the deterministic immutable preparation package and its identity,
 *   - deterministic staleness, and
 *   - the capability/feature gate.
 *
 * The package target identity deliberately reuses the frozen M4 canonical
 * managed-target identity (`@/lib/managed-target/policy`) so a future exact
 * professional review can bind to the same target without a second model.
 * M5.1 never enables M4 review, readiness, submission or provider behaviour.
 */

export const SCHOOL_APPLICATION_TARGET_KIND =
  "managed_school_application" as const;

/** Runtime drift guard: M5.1 may only ever emit an M4-known target kind. */
if (
  !(MANAGED_TARGET_KINDS as readonly string[]).includes(
    SCHOOL_APPLICATION_TARGET_KIND
  )
) {
  throw new Error("school_application_target_kind_not_managed");
}

export const SCHOOL_APPLICATION_PACKAGE_SCHEMA =
  "phase13.school-application-preparation-package.v1" as const;

/**
 * Bounds. The contract requires "at least three concurrent schools"; the
 * per-project bound is deliberately higher while still bounded.
 */
export const SCHOOL_APPLICATION_MAX_APPLICATIONS_PER_PROJECT = 12;
export const SCHOOL_APPLICATION_MAX_REFERENCES = 40;
export const SCHOOL_APPLICATION_MAX_TEXT = 200;
export const SCHOOL_APPLICATION_MAX_LABEL = 120;
export const SCHOOL_APPLICATION_MAX_ID = 128;
export const SCHOOL_APPLICATION_MAX_PACKAGE_BYTES = 64 * 1024;

export const SCHOOL_APPLICATION_STATUSES = [
  "draft",
  "preparing",
  "package_prepared",
  "stale",
  "archived",
] as const;
export type SchoolApplicationStatus =
  (typeof SCHOOL_APPLICATION_STATUSES)[number];

/**
 * Source status is derived from an authoritative catalog resolver only. There is
 * no `official` and no `verified` member: M3's catalog record classes are
 * `SYNTHETIC` and `UNVERIFIED`, so no code path can claim otherwise.
 */
export const SCHOOL_APPLICATION_SOURCE_STATUSES = [
  "unverified_customer_declared",
  "unverified_catalog_match",
  "synthetic_catalog_match",
] as const;
export type SchoolApplicationSourceStatus =
  (typeof SCHOOL_APPLICATION_SOURCE_STATUSES)[number];

export const SCHOOL_APPLICATION_CATALOG_RECORD_CLASSES = [
  "SYNTHETIC",
  "UNVERIFIED",
] as const;
export type SchoolApplicationCatalogRecordClass =
  (typeof SCHOOL_APPLICATION_CATALOG_RECORD_CLASSES)[number];

export const SCHOOL_APPLICATION_REFERENCE_KINDS = [
  "fact",
  "requirement",
  "document",
] as const;
export type SchoolApplicationReferenceKind =
  (typeof SCHOOL_APPLICATION_REFERENCE_KINDS)[number];

export const SCHOOL_APPLICATION_PACKAGE_STATUSES = [
  "current",
  "superseded",
  "stale",
] as const;
export type SchoolApplicationPackageStatus =
  (typeof SCHOOL_APPLICATION_PACKAGE_STATUSES)[number];

export const SCHOOL_APPLICATION_OPERATION_TYPES = [
  "school_application_create",
  "school_application_update",
  "school_application_archive",
  "school_application_reference_bind",
  "school_application_reference_revoke",
  "school_application_package_build",
] as const;
export type SchoolApplicationOperationType =
  (typeof SCHOOL_APPLICATION_OPERATION_TYPES)[number];

export const SCHOOL_APPLICATION_OPERATION_RESULT_KINDS = [
  "school_application",
  "school_application_reference",
  "school_application_package",
] as const;
export type SchoolApplicationOperationResultKind =
  (typeof SCHOOL_APPLICATION_OPERATION_RESULT_KINDS)[number];

export const SCHOOL_APPLICATION_EVENT_TYPES = [
  "school_application_created",
  "school_application_updated",
  "school_application_archived",
  "school_application_reference_bound",
  "school_application_reference_revoked",
  "school_application_package_built",
  "school_application_package_invalidated",
] as const;
export type SchoolApplicationEventType =
  (typeof SCHOOL_APPLICATION_EVENT_TYPES)[number];

export const SCHOOL_APPLICATION_EVENT_SUBJECT_KINDS = [
  "school_application",
  "school_application_reference",
  "school_application_package",
] as const;
export type SchoolApplicationEventSubjectKind =
  (typeof SCHOOL_APPLICATION_EVENT_SUBJECT_KINDS)[number];

/** Deterministic, customer-visible non-authority disclosures. */
export const SCHOOL_APPLICATION_DISCLOSURE_CODES = [
  "not_a_school_submission",
  "not_professionally_reviewed",
  "no_admission_decision",
  "no_offer_or_coe",
  "no_payment_confirmation",
  "source_not_independently_verified",
] as const;
export type SchoolApplicationDisclosureCode =
  (typeof SCHOOL_APPLICATION_DISCLOSURE_CODES)[number];

export const SCHOOL_APPLICATION_MISSING_DATA_CODES = [
  "intake_not_selected",
  "source_not_independently_verified",
  "no_application_references",
] as const;
export type SchoolApplicationMissingDataCode =
  (typeof SCHOOL_APPLICATION_MISSING_DATA_CODES)[number];

export const SCHOOL_APPLICATION_STALE_REASON_CODES = [
  "material_inputs_changed",
  "reference_changed",
  "reference_unavailable",
  /** The application was archived: no package is usable for preparation/handoff. */
  "application_archived",
] as const;
export type SchoolApplicationStaleReasonCode =
  (typeof SCHOOL_APPLICATION_STALE_REASON_CODES)[number];

export type SchoolApplicationErrorCode =
  | "invalid_request"
  | "actor_not_eligible"
  | "project_not_found"
  | "project_forbidden"
  | "project_closed"
  | "application_not_found"
  | "application_archived"
  | "revision_conflict"
  | "idempotency_conflict"
  | "state_conflict"
  | "limit_exceeded"
  | "reference_invalid"
  | "reference_unavailable"
  | "package_conflict"
  | "integrity_conflict";

export class SchoolApplicationError extends Error {
  readonly code: SchoolApplicationErrorCode;

  constructor(code: SchoolApplicationErrorCode) {
    super(code);
    this.name = "SchoolApplicationError";
    this.code = code;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const OPAQUE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function isSchoolApplicationUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isSchoolApplicationSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_RE.test(value);
}

/** M3 catalog identifiers are opaque bounded tokens, never free text. */
export function isSchoolCatalogIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= SCHOOL_APPLICATION_MAX_ID &&
    OPAQUE_ID_RE.test(value)
  );
}

export function isSchoolApplicationStatus(
  value: unknown
): value is SchoolApplicationStatus {
  return (
    typeof value === "string" &&
    (SCHOOL_APPLICATION_STATUSES as readonly string[]).includes(value)
  );
}

export function isSchoolApplicationReferenceKind(
  value: unknown
): value is SchoolApplicationReferenceKind {
  return (
    typeof value === "string" &&
    (SCHOOL_APPLICATION_REFERENCE_KINDS as readonly string[]).includes(value)
  );
}

export function isSchoolApplicationCatalogRecordClass(
  value: unknown
): value is SchoolApplicationCatalogRecordClass {
  return (
    typeof value === "string" &&
    (SCHOOL_APPLICATION_CATALOG_RECORD_CLASSES as readonly string[]).includes(
      value
    )
  );
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/** Normalizes bounded display text; throws on empty, over-long or control input. */
export function normalizeSchoolApplicationText(
  value: unknown,
  max: number = SCHOOL_APPLICATION_MAX_TEXT
): string {
  if (typeof value !== "string") {
    throw new SchoolApplicationError("invalid_request");
  }
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    normalized.length === 0 ||
    normalized.length > max ||
    hasControlCharacters(normalized)
  ) {
    throw new SchoolApplicationError("invalid_request");
  }
  return normalized;
}

export function normalizeOptionalSchoolApplicationText(
  value: unknown,
  max: number = SCHOOL_APPLICATION_MAX_TEXT
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new SchoolApplicationError("invalid_request");
  }
  if (value.trim().length === 0) {
    return null;
  }
  return normalizeSchoolApplicationText(value, max);
}

export function normalizeOptionalSchoolCatalogIdentifier(
  value: unknown
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isSchoolCatalogIdentifier(value)) {
    throw new SchoolApplicationError("invalid_request");
  }
  return value;
}

export function validateSchoolApplicationOperationId(value: unknown): string {
  if (typeof value !== "string") {
    throw new SchoolApplicationError("invalid_request");
  }
  try {
    return validateProjectOperationId(value);
  } catch {
    throw new SchoolApplicationError("invalid_request");
  }
}

export function validateSchoolApplicationRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new SchoolApplicationError("invalid_request");
  }
  return value;
}

export function hashSchoolApplicationRequest(value: unknown): string {
  return hashProjectOperationRequest(value);
}

/**
 * Request identity of a mutation, expressed **only** from fields the caller
 * authored (session actor, route identity, CAS revision and the submitted
 * values). Derived state — resolved M2 fingerprints, catalog classification,
 * package digests, revision-bearing snapshots — is deliberately excluded, so an
 * exact client replay always reproduces the same digest and therefore replays
 * the previously accepted result instead of a spurious idempotency conflict.
 */
export type SchoolApplicationRequestIdentity = {
  readonly operationType: SchoolApplicationOperationType;
  readonly projectId: string;
  readonly applicationId?: string;
  readonly expectedRevision?: number;
  readonly target?: SchoolApplicationTargetFields;
  readonly kind?: SchoolApplicationReferenceKind;
  readonly referenceId?: string;
  readonly referenceRecordId?: string;
};

export function schoolApplicationRequestSha256(
  identity: SchoolApplicationRequestIdentity
): string {
  return hashProjectOperationRequest({
    applicationId: identity.applicationId ?? null,
    expectedRevision: identity.expectedRevision ?? null,
    kind: identity.kind ?? null,
    operationType: identity.operationType,
    projectId: identity.projectId,
    referenceId: identity.referenceId ?? null,
    referenceRecordId: identity.referenceRecordId ?? null,
    target: identity.target
      ? {
          courseId: identity.target.courseId,
          courseTitle: identity.target.courseTitle,
          deliveryId: identity.target.deliveryId,
          institutionId: identity.target.institutionId,
          institutionName: identity.target.institutionName,
          intakeId: identity.target.intakeId,
          intakeLabel: identity.target.intakeLabel,
        }
      : null,
  });
}

export function schoolApplicationTextSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export type SchoolApplicationTargetFields = {
  readonly institutionName: string;
  readonly institutionId: string | null;
  readonly courseTitle: string;
  readonly courseId: string | null;
  readonly deliveryId: string | null;
  readonly intakeId: string | null;
  readonly intakeLabel: string | null;
};

export type SchoolApplicationTargetInput = SchoolApplicationTargetFields;

/**
 * Catalog resolution result supplied by an injected M3 adapter. It is the only
 * source of `SYNTHETIC`/`UNVERIFIED` classification; absence of a resolution can
 * never be upgraded into a stronger status by the caller or the service.
 */
export type SchoolCatalogResolution =
  | { readonly status: "unresolved" }
  | { readonly status: "unavailable" }
  | {
      readonly status: "resolved";
      readonly recordClass: SchoolApplicationCatalogRecordClass;
      readonly institutionId: string;
      readonly institutionName: string;
      readonly courseId: string;
      readonly courseTitle: string;
      readonly deliveryId: string | null;
      readonly intakeId: string | null;
      readonly intakeLabel: string | null;
      readonly snapshotToken: string | null;
    };

export type ResolvedSchoolApplicationTarget = {
  readonly target: SchoolApplicationTargetFields;
  readonly sourceStatus: SchoolApplicationSourceStatus;
  readonly catalogRecordClass: SchoolApplicationCatalogRecordClass | null;
  readonly catalogSnapshotToken: string | null;
};

/**
 * Deterministically combines caller fields with catalog resolution. A caller may
 * never assert a catalog identity that the resolver did not confirm: a supplied
 * catalog id that does not resolve is rejected instead of silently downgraded.
 */
export function resolveSchoolApplicationTarget(input: {
  readonly fields: SchoolApplicationTargetFields;
  readonly resolution: SchoolCatalogResolution;
}): ResolvedSchoolApplicationTarget {
  const fields = input.fields;
  const anyCatalogId = Boolean(
    fields.institutionId ||
      fields.courseId ||
      fields.deliveryId ||
      fields.intakeId
  );
  if (input.resolution.status === "resolved") {
    const resolved = input.resolution;
    if (
      fields.institutionId !== null &&
      fields.institutionId !== resolved.institutionId
    ) {
      throw new SchoolApplicationError("reference_invalid");
    }
    if (fields.courseId !== null && fields.courseId !== resolved.courseId) {
      throw new SchoolApplicationError("reference_invalid");
    }
    if (
      fields.deliveryId !== null &&
      resolved.deliveryId !== null &&
      fields.deliveryId !== resolved.deliveryId
    ) {
      throw new SchoolApplicationError("reference_invalid");
    }
    if (
      fields.intakeId !== null &&
      resolved.intakeId !== null &&
      fields.intakeId !== resolved.intakeId
    ) {
      throw new SchoolApplicationError("reference_invalid");
    }
    return {
      target: {
        courseId: resolved.courseId,
        courseTitle: normalizeSchoolApplicationText(resolved.courseTitle),
        deliveryId: fields.deliveryId ?? resolved.deliveryId,
        institutionId: resolved.institutionId,
        institutionName: normalizeSchoolApplicationText(
          resolved.institutionName
        ),
        intakeId: fields.intakeId ?? resolved.intakeId,
        intakeLabel: fields.intakeLabel ?? resolved.intakeLabel,
      },
      catalogRecordClass: resolved.recordClass,
      catalogSnapshotToken: resolved.snapshotToken,
      sourceStatus:
        resolved.recordClass === "SYNTHETIC"
          ? "synthetic_catalog_match"
          : "unverified_catalog_match",
    };
  }
  if (anyCatalogId) {
    // A catalog id that could not be confirmed is never treated as an unverified
    // manual candidate: that would let a caller assert catalog identity.
    throw new SchoolApplicationError(
      input.resolution.status === "unavailable"
        ? "reference_unavailable"
        : "reference_invalid"
    );
  }
  return {
    target: fields,
    catalogRecordClass: null,
    catalogSnapshotToken: null,
    sourceStatus: "unverified_customer_declared",
  };
}

export function schoolApplicationMissingDataCodes(input: {
  readonly intakeId: string | null;
  readonly intakeLabel: string | null;
  readonly referenceCount: number;
}): SchoolApplicationMissingDataCode[] {
  const codes: SchoolApplicationMissingDataCode[] = [];
  if (!(input.intakeId || input.intakeLabel)) {
    codes.push("intake_not_selected");
  }
  codes.push("source_not_independently_verified");
  if (input.referenceCount === 0) {
    codes.push("no_application_references");
  }
  return codes;
}

export type SchoolApplicationPackageReference = {
  readonly kind: SchoolApplicationReferenceKind;
  readonly referenceId: string;
  readonly referenceVersion: number;
  readonly referenceSha256: string;
};

export type SchoolApplicationPackageInputs = {
  readonly applicationId: string;
  readonly projectId: string;
  readonly applicationRevision: number;
  readonly target: SchoolApplicationTargetFields;
  readonly sourceStatus: SchoolApplicationSourceStatus;
  readonly catalogRecordClass: SchoolApplicationCatalogRecordClass | null;
  readonly catalogSnapshotToken: string | null;
  readonly references: readonly SchoolApplicationPackageReference[];
  readonly missingDataCodes: readonly SchoolApplicationMissingDataCode[];
};

/**
 * Canonical package input digest. Reference order is normalized so two requests
 * that bound the same references produce the same digest.
 *
 * `applicationRevision` is deliberately excluded: the digest describes the
 * material inputs only, so a package cannot become stale merely because its own
 * build incremented the application revision.
 */
export function schoolApplicationInputsSha256(
  input: SchoolApplicationPackageInputs
): string {
  const references = [...input.references]
    .map((reference) => ({
      kind: reference.kind,
      referenceId: reference.referenceId,
      referenceSha256: reference.referenceSha256,
      referenceVersion: reference.referenceVersion,
    }))
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.referenceId.localeCompare(right.referenceId) ||
        left.referenceVersion - right.referenceVersion
    );
  return createHash("sha256")
    .update(
      canonicalJson({
        applicationId: input.applicationId,
        catalogRecordClass: input.catalogRecordClass,
        catalogSnapshotToken: input.catalogSnapshotToken,
        missingDataCodes: [...input.missingDataCodes],
        projectId: input.projectId,
        references,
        sourceStatus: input.sourceStatus,
        target: {
          courseId: input.target.courseId,
          courseTitle: input.target.courseTitle,
          deliveryId: input.target.deliveryId,
          institutionId: input.target.institutionId,
          institutionName: input.target.institutionName,
          intakeId: input.target.intakeId,
          intakeLabel: input.target.intakeLabel,
        },
      }),
      "utf8"
    )
    .digest("hex");
}

export type SchoolApplicationPackageSnapshot = {
  readonly schema: typeof SCHOOL_APPLICATION_PACKAGE_SCHEMA;
  readonly applicationId: string;
  readonly projectId: string;
  readonly applicationRevision: number;
  readonly packageVersion: number;
  readonly target: {
    readonly kind: typeof SCHOOL_APPLICATION_TARGET_KIND;
    readonly id: string;
    readonly version: number;
    readonly sha256: string;
  };
  readonly institution: {
    readonly name: string;
    readonly catalogId: string | null;
    readonly sourceStatus: SchoolApplicationSourceStatus;
    readonly catalogRecordClass: SchoolApplicationCatalogRecordClass | null;
    readonly catalogSnapshotToken: string | null;
  };
  readonly course: {
    readonly title: string;
    readonly catalogId: string | null;
  };
  readonly deliveryId: string | null;
  readonly intake: {
    readonly id: string | null;
    readonly label: string | null;
  };
  readonly references: readonly SchoolApplicationPackageReference[];
  readonly missingDataCodes: readonly SchoolApplicationMissingDataCode[];
  readonly disclosures: readonly SchoolApplicationDisclosureCode[];
  readonly submissionStatus: "not_submitted";
  readonly admissionStatus: "no_decision";
  readonly offerStatus: "no_offer";
  readonly coeStatus: "no_coe";
  readonly professionalReviewStatus: "not_requested";
  readonly inputsSha256: string;
};

export type BuiltSchoolApplicationPackage = {
  readonly version: number;
  readonly contentSha256: string;
  readonly inputsSha256: string;
  readonly schemaVersion: typeof SCHOOL_APPLICATION_PACKAGE_SCHEMA;
  readonly targetKind: typeof SCHOOL_APPLICATION_TARGET_KIND;
  readonly targetId: string;
  readonly targetVersion: number;
  readonly targetSha256: string;
  readonly targetBindingSha256: string;
  readonly snapshot: SchoolApplicationPackageSnapshot;
};

/**
 * Builds the immutable preparation package. `contentSha256` covers the complete
 * canonical snapshot (the digest itself is excluded), so the same inputs at the
 * same version always produce exactly the same hash.
 */
export function buildSchoolApplicationPackage(input: {
  readonly packageVersion: number;
  readonly inputs: SchoolApplicationPackageInputs;
}): BuiltSchoolApplicationPackage {
  if (!Number.isSafeInteger(input.packageVersion) || input.packageVersion < 1) {
    throw new SchoolApplicationError("invalid_request");
  }
  const inputsSha256 = schoolApplicationInputsSha256(input.inputs);
  const orderedReferences = [...input.inputs.references].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.referenceId.localeCompare(right.referenceId) ||
      left.referenceVersion - right.referenceVersion
  );
  const body = {
    admissionStatus: "no_decision" as const,
    applicationId: input.inputs.applicationId,
    applicationRevision: input.inputs.applicationRevision,
    coeStatus: "no_coe" as const,
    course: {
      catalogId: input.inputs.target.courseId,
      title: input.inputs.target.courseTitle,
    },
    deliveryId: input.inputs.target.deliveryId,
    disclosures: [...SCHOOL_APPLICATION_DISCLOSURE_CODES],
    inputsSha256,
    institution: {
      catalogId: input.inputs.target.institutionId,
      catalogRecordClass: input.inputs.catalogRecordClass,
      catalogSnapshotToken: input.inputs.catalogSnapshotToken,
      name: input.inputs.target.institutionName,
      sourceStatus: input.inputs.sourceStatus,
    },
    intake: {
      id: input.inputs.target.intakeId,
      label: input.inputs.target.intakeLabel,
    },
    missingDataCodes: [...input.inputs.missingDataCodes],
    offerStatus: "no_offer" as const,
    packageVersion: input.packageVersion,
    professionalReviewStatus: "not_requested" as const,
    projectId: input.inputs.projectId,
    references: orderedReferences.map((reference) => ({
      kind: reference.kind,
      referenceId: reference.referenceId,
      referenceSha256: reference.referenceSha256,
      referenceVersion: reference.referenceVersion,
    })),
    schema: SCHOOL_APPLICATION_PACKAGE_SCHEMA,
    submissionStatus: "not_submitted" as const,
    target: {
      id: input.inputs.applicationId,
      kind: SCHOOL_APPLICATION_TARGET_KIND,
      version: input.packageVersion,
    },
  };
  const contentSha256 = createHash("sha256")
    .update(canonicalJson(body), "utf8")
    .digest("hex");
  const snapshot: SchoolApplicationPackageSnapshot = {
    ...body,
    target: { ...body.target, sha256: contentSha256 },
  };
  const targetBindingSha256 = managedTargetIdentitySha256({
    projectId: input.inputs.projectId,
    targetId: input.inputs.applicationId,
    targetKind: SCHOOL_APPLICATION_TARGET_KIND,
    targetSha256: contentSha256,
    targetVersion: input.packageVersion,
  });
  return {
    contentSha256,
    inputsSha256,
    schemaVersion: SCHOOL_APPLICATION_PACKAGE_SCHEMA,
    snapshot,
    targetBindingSha256,
    targetId: input.inputs.applicationId,
    targetKind: SCHOOL_APPLICATION_TARGET_KIND,
    targetSha256: contentSha256,
    targetVersion: input.packageVersion,
    version: input.packageVersion,
  };
}

/**
 * Recomputes the snapshot digest from a persisted snapshot and rejects any
 * mismatch: a stored package whose bytes no longer match its recorded hash is
 * never silently trusted.
 */
export function verifySchoolApplicationPackageSnapshot(
  snapshot: unknown,
  expectedContentSha256: string
): boolean {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }
  const record = snapshot as Record<string, unknown>;
  if (record.schema !== SCHOOL_APPLICATION_PACKAGE_SCHEMA) {
    return false;
  }
  const target = record.target as Record<string, unknown> | undefined;
  if (!target || typeof target !== "object") {
    return false;
  }
  const withoutDigest = {
    ...record,
    target: { id: target.id, kind: target.kind, version: target.version },
  };
  const digest = createHash("sha256")
    .update(canonicalJson(withoutDigest), "utf8")
    .digest("hex");
  return digest === expectedContentSha256;
}

export type SchoolApplicationPackageFreshness = {
  readonly stale: boolean;
  readonly reasonCodes: readonly SchoolApplicationStaleReasonCode[];
};

/**
 * How strongly a package's validity was established for this read.
 *
 * `live_references` means every active M2 reference was re-resolved for this
 * request. M5.1 never serves a package as usable on bound fingerprints alone.
 */
export type SchoolApplicationPackageVerification = "live_references";

export type SchoolApplicationPackageUsability = {
  readonly usable: boolean;
  readonly reasonCodes: readonly SchoolApplicationStaleReasonCode[];
  readonly verification: SchoolApplicationPackageVerification;
};

/**
 * The single definition of "this package is current and usable".
 *
 * `get`, `list`, `listPackages`, package planning and any future managed-target
 * consumer call exactly this function, so a package can never be advertised as
 * valid by one read path and stale by another. A package is usable only when:
 *   - the application is not archived (archived applications are terminal and
 *     must never present a package for current preparation or managed handoff),
 *   - it is the stored `current` row,
 *   - its immutable input digest still matches the freshly computed digest of the
 *     application's material inputs, and
 *   - every active M2 reference still resolves to the exact identity it was built
 *     from.
 */
export function schoolApplicationPackageUsability(input: {
  readonly applicationStatus: SchoolApplicationStatus;
  readonly currentPackage: {
    readonly status: SchoolApplicationPackageStatus;
    readonly inputsSha256: string;
  } | null;
  readonly currentInputsSha256: string;
  readonly unavailableReferenceCount: number;
  readonly changedReferenceCount: number;
}): SchoolApplicationPackageUsability {
  const verification: SchoolApplicationPackageVerification = "live_references";
  const archived = input.applicationStatus === "archived";
  if (!input.currentPackage) {
    return {
      reasonCodes: archived ? ["application_archived"] : [],
      usable: false,
      verification,
    };
  }
  const reasonCodes: SchoolApplicationStaleReasonCode[] = [];
  if (archived) {
    // Historical package bytes stay readable, but nothing is usable for current
    // preparation or future managed handoff once the application is archived.
    reasonCodes.push("application_archived");
  }
  if (input.currentPackage.status !== "current") {
    reasonCodes.push("material_inputs_changed");
  }
  if (input.currentPackage.inputsSha256 !== input.currentInputsSha256) {
    reasonCodes.push("material_inputs_changed");
  }
  if (input.changedReferenceCount > 0) {
    reasonCodes.push("reference_changed");
  }
  if (input.unavailableReferenceCount > 0) {
    reasonCodes.push("reference_unavailable");
  }
  const unique = [...new Set(reasonCodes)];
  return {
    reasonCodes: unique,
    usable: unique.length === 0,
    verification,
  };
}

/** Backwards-compatible projection of the unified usability decision. */
export function schoolApplicationPackageFreshness(input: {
  readonly applicationStatus: SchoolApplicationStatus;
  readonly currentPackage: {
    readonly status: SchoolApplicationPackageStatus;
    readonly inputsSha256: string;
  } | null;
  readonly currentInputsSha256: string;
  readonly unavailableReferenceCount: number;
  readonly changedReferenceCount: number;
}): SchoolApplicationPackageFreshness {
  const usability = schoolApplicationPackageUsability(input);
  return {
    reasonCodes: usability.reasonCodes,
    // "No package yet" is not staleness; only an unusable *existing* package is
    // (an archived application is always stale, with or without a package).
    stale:
      input.applicationStatus === "archived" ||
      (input.currentPackage !== null && !usability.usable),
  };
}

export type SchoolApplicationAllowedAction =
  | "update"
  | "archive"
  | "package_build"
  | "reference_bind";

const allowedActions: Record<
  SchoolApplicationStatus,
  readonly SchoolApplicationAllowedAction[]
> = {
  draft: ["update", "archive", "package_build", "reference_bind"],
  preparing: ["update", "archive", "package_build", "reference_bind"],
  package_prepared: ["update", "archive", "package_build", "reference_bind"],
  stale: ["update", "archive", "package_build", "reference_bind"],
  // Archive is terminal: no delete, no reuse, no un-archive.
  archived: [],
};

export function schoolApplicationActionAllowed(
  status: SchoolApplicationStatus,
  action: SchoolApplicationAllowedAction
): boolean {
  return allowedActions[status].includes(action);
}

/** Every material change invalidates a current package instead of reusing it. */
export function schoolApplicationStatusAfterMaterialChange(input: {
  readonly hasCurrentPackage: boolean;
}): {
  readonly status: SchoolApplicationStatus;
  readonly invalidateCurrentPackage: boolean;
} {
  return input.hasCurrentPackage
    ? { invalidateCurrentPackage: true, status: "stale" }
    : { invalidateCurrentPackage: false, status: "preparing" };
}

export type SchoolApplicationPackageBuildPlan =
  | { readonly kind: "reuse_current"; readonly version: number }
  | { readonly kind: "create"; readonly version: number };

export function planSchoolApplicationPackageBuild(input: {
  readonly currentPackage: {
    readonly version: number;
    readonly inputsSha256: string;
  } | null;
  readonly highestVersion: number;
  readonly inputsSha256: string;
}): SchoolApplicationPackageBuildPlan {
  if (
    input.currentPackage &&
    input.currentPackage.inputsSha256 === input.inputsSha256
  ) {
    return { kind: "reuse_current", version: input.currentPackage.version };
  }
  return { kind: "create", version: input.highestVersion + 1 };
}

export function schoolApplicationsEnabled(
  value: string | undefined = process.env.PHASE13_SCHOOL_APPLICATIONS_ENABLED
): boolean {
  return value?.trim().toLowerCase() === "true";
}
