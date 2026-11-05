import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import {
  SUBMISSION_PACKAGE_DISCLOSURES,
  SUBMISSION_PACKAGE_SCHEMA,
  SUBMISSION_STALE_REASONS,
  SubmissionPackageError,
  type SubmissionStaleReason,
  submissionDigest,
} from "./contracts";
import type {
  SubmissionActorContext,
  SubmissionDependencies,
  SubmissionFactReferenceIdentity,
  SubmissionIndicator,
  SubmissionTargetState,
} from "./ports";

/**
 * Phase 13 M8.1 - deterministic package policy.
 *
 * Three pure responsibilities live here, so they can be tested without a database,
 * HTTP or UI:
 *
 *   1. build the canonical manifest that the customer reviews and freezes;
 *   2. normalize and digest the dependency identity set;
 *   3. decide current usability by comparing that frozen set with live state.
 *
 * No function here decides legal correctness, eligibility, professional review or
 * submission readiness, and none of them can invent missing data: an input that
 * cannot be read is reported as `source_unavailable`, never assumed current.
 */

export type SubmissionManifest = {
  readonly schema: typeof SUBMISSION_PACKAGE_SCHEMA;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly targetVersion: number;
  readonly packageVersion: number;
  readonly statementPolicyVersion: string;
  readonly application: {
    readonly status: string;
    readonly revision: number;
  };
  readonly content: SubmissionTargetState["content"];
  readonly dependencies: SubmissionDependencies;
  readonly indicators: readonly SubmissionIndicator[];
  readonly disclosures: readonly string[];
  readonly honesty: {
    readonly submissionStatus: "not_submission_ready";
    readonly professionalReviewStatus: "not_requested";
    readonly legalCoverage: "partial_unverified";
    readonly documentsTrust: "unavailable";
  };
};

/**
 * Fact reference order is part of the digest, so it is normalized rather than left
 * to the upstream service's incidental ordering.
 */
export function normalizeFactReferences(
  references: readonly SubmissionFactReferenceIdentity[]
): readonly SubmissionFactReferenceIdentity[] {
  return [...references]
    .map((reference) => ({
      factAssertionId: reference.factAssertionId,
      factKey: reference.factKey,
      factReferenceId: reference.factReferenceId,
      factVersion: reference.factVersion,
    }))
    .sort(
      (left, right) =>
        left.factReferenceId.localeCompare(right.factReferenceId) ||
        left.factAssertionId.localeCompare(right.factAssertionId)
    );
}

export function normalizeIndicators(
  indicators: readonly SubmissionIndicator[]
): readonly SubmissionIndicator[] {
  return [...indicators]
    .map((indicator) => ({ code: indicator.code, kind: indicator.kind }))
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.code.localeCompare(right.code)
    );
}

/** Digest of the exact dependency identity set a package is bound to. */
export function dependenciesSha256(
  dependencies: SubmissionDependencies
): string {
  return submissionDigest({
    applicationRevision: dependencies.applicationRevision,
    applicationStatus: dependencies.applicationStatus,
    factReferences: normalizeFactReferences(dependencies.factReferences),
    gsDraft: dependencies.gsDraft
      ? {
          contentSha256: dependencies.gsDraft.contentSha256,
          draftId: dependencies.gsDraft.draftId,
          version: dependencies.gsDraft.version,
        }
      : null,
    legalSourceRevision: dependencies.legalSourceRevision,
    preparationSnapshot: dependencies.preparationSnapshot
      ? {
          contentSha256: dependencies.preparationSnapshot.contentSha256,
          snapshotId: dependencies.preparationSnapshot.snapshotId,
          version: dependencies.preparationSnapshot.version,
        }
      : null,
    schoolPackage: dependencies.schoolPackage
      ? {
          contentSha256: dependencies.schoolPackage.contentSha256,
          packageId: dependencies.schoolPackage.packageId,
          version: dependencies.schoolPackage.version,
        }
      : null,
    sourceAvailability: dependencies.sourceAvailability,
  });
}

export function buildSubmissionManifest(input: {
  readonly projectId: string;
  readonly target: SubmissionTargetState;
  readonly packageVersion: number;
  readonly statementPolicyVersion: string;
}): {
  readonly manifest: SubmissionManifest;
  readonly manifestSha256: string;
  readonly dependencySha256: string;
} {
  if (!Number.isSafeInteger(input.packageVersion) || input.packageVersion < 1) {
    throw new SubmissionPackageError("invalid_request");
  }
  const dependencies: SubmissionDependencies = {
    ...input.target.dependencies,
    factReferences: normalizeFactReferences(
      input.target.dependencies.factReferences
    ),
  };
  const manifest: SubmissionManifest = {
    application: {
      revision: input.target.dependencies.applicationRevision,
      status: input.target.dependencies.applicationStatus,
    },
    content: input.target.content,
    dependencies,
    disclosures: [...SUBMISSION_PACKAGE_DISCLOSURES],
    honesty: {
      documentsTrust: "unavailable",
      legalCoverage: "partial_unverified",
      professionalReviewStatus: "not_requested",
      submissionStatus: "not_submission_ready",
    },
    indicators: normalizeIndicators(input.target.indicators),
    packageVersion: input.packageVersion,
    projectId: input.projectId,
    schema: SUBMISSION_PACKAGE_SCHEMA,
    statementPolicyVersion: input.statementPolicyVersion,
    targetId: input.target.targetId,
    targetKind: input.target.targetKind,
    targetVersion: input.target.targetVersion,
  };
  const manifestSha256 = submissionDigest(manifest);
  return {
    dependencySha256: dependenciesSha256(dependencies),
    manifest,
    manifestSha256,
  };
}

/** Narrow, defensive read of a persisted manifest for freshness comparison. */
export function readFrozenDependencies(
  manifest: unknown
): SubmissionDependencies | null {
  if (!manifest || typeof manifest !== "object") {
    return null;
  }
  const dependencies = (manifest as { dependencies?: unknown }).dependencies;
  if (!dependencies || typeof dependencies !== "object") {
    return null;
  }
  const value = dependencies as Record<string, unknown>;
  if (
    typeof value.applicationRevision !== "number" ||
    typeof value.applicationStatus !== "string" ||
    !Array.isArray(value.factReferences) ||
    typeof value.sourceAvailability !== "string"
  ) {
    return null;
  }
  return dependencies as SubmissionDependencies;
}

/**
 * Current usability of a frozen package for *this* actor right now.
 *
 * Deliberately separate concerns that must never be conflated:
 *   - historical integrity of the frozen row (checked elsewhere, always true);
 *   - current source availability (`source_unavailable`);
 *   - current actor view authorization (`access_revoked`, `fact_not_visible`);
 *   - current confirmation validity (this function);
 *   - future submission readiness (never decided here).
 *
 * An unreadable upstream source is reported, never silently treated as unchanged.
 */
export function evaluateSubmissionFreshness(input: {
  readonly actorContext: SubmissionActorContext;
  readonly current: SubmissionTargetState;
  readonly frozen: SubmissionDependencies;
}): {
  readonly current: boolean;
  readonly reasonCodes: readonly SubmissionStaleReason[];
} {
  const reasons = new Set<SubmissionStaleReason>();
  const { actorContext, current, frozen } = input;

  if (actorContext.project === null) {
    reasons.add("access_revoked");
  } else if (
    actorContext.membershipStatus !== "owner" &&
    actorContext.membershipStatus !== "active_member"
  ) {
    reasons.add("access_revoked");
  }
  if (actorContext.project?.status === "closed") {
    reasons.add("project_closed");
  }
  if (current.archived) {
    reasons.add("target_archived");
  }
  if (current.dependencies.sourceAvailability !== "available") {
    reasons.add("source_unavailable");
  }
  if (
    current.dependencies.applicationRevision !== frozen.applicationRevision ||
    current.dependencies.applicationStatus !== frozen.applicationStatus
  ) {
    reasons.add("application_revision_changed");
  }

  // Student 500 dependency comparison.
  const frozenDraft = frozen.gsDraft;
  const currentDraft = current.dependencies.gsDraft;
  if (frozenDraft !== null) {
    if (currentDraft === null || currentDraft.redactedSectionCount > 0) {
      reasons.add("gs_draft_unavailable");
    }
    if (
      currentDraft !== null &&
      (currentDraft.draftId !== frozenDraft.draftId ||
        currentDraft.version !== frozenDraft.version ||
        currentDraft.contentSha256 !== frozenDraft.contentSha256)
    ) {
      reasons.add("gs_draft_changed");
    }
  }
  const frozenSnapshot = frozen.preparationSnapshot;
  const currentSnapshot = current.dependencies.preparationSnapshot;
  if (
    (frozenSnapshot?.snapshotId ?? null) !==
      (currentSnapshot?.snapshotId ?? null) ||
    (frozenSnapshot?.version ?? null) !== (currentSnapshot?.version ?? null) ||
    (frozenSnapshot?.contentSha256 ?? null) !==
      (currentSnapshot?.contentSha256 ?? null)
  ) {
    reasons.add("preparation_snapshot_changed");
  }
  if (
    (frozen.legalSourceRevision ?? null) !==
    (current.dependencies.legalSourceRevision ?? null)
  ) {
    reasons.add("legal_source_revision_changed");
  }
  const frozenFacts = normalizeFactReferences(frozen.factReferences);
  const currentFacts = normalizeFactReferences(
    current.dependencies.factReferences
  );
  const currentById = new Map(
    currentFacts.map((reference) => [reference.factReferenceId, reference])
  );
  const factsChanged =
    frozenFacts.length !== currentFacts.length ||
    frozenFacts.some((reference) => {
      const live = currentById.get(reference.factReferenceId);
      return (
        live === undefined ||
        live.factAssertionId !== reference.factAssertionId ||
        live.factVersion !== reference.factVersion
      );
    });
  if (factsChanged) {
    reasons.add("fact_reference_changed");
    reasons.add("fact_not_visible");
  }

  // School dependency comparison.
  const frozenSchool = frozen.schoolPackage;
  const currentSchool = current.dependencies.schoolPackage;
  if (frozenSchool !== null) {
    if (currentSchool === null) {
      reasons.add("school_package_changed");
    } else if (
      currentSchool.packageId !== frozenSchool.packageId ||
      currentSchool.version !== frozenSchool.version ||
      currentSchool.contentSha256 !== frozenSchool.contentSha256
    ) {
      reasons.add("school_package_changed");
    }
  }

  const ordered = SUBMISSION_STALE_REASONS.filter((reason) =>
    reasons.has(reason)
  );
  return { current: ordered.length === 0, reasonCodes: ordered };
}

/**
 * The two customer statements M8.1 records. They are wording contracts, not
 * approvals: neither one asserts professional review, legal correctness, eligibility
 * or external submission.
 */
export const SUBMISSION_STATEMENTS = [
  {
    confirmationType: "package_content_review" as const,
    failureCode: "confirmed_package_requires_rebuild",
    requiresPolicyVersion: true,
  },
  {
    confirmationType: "customer_declarations" as const,
    failureCode: "declarations_require_customer_action",
    requiresPolicyVersion: true,
  },
] as const;

/**
 * Defensive projection of a persisted manifest for one actor.
 *
 * Fact reference *identities* and digests are preserved (so integrity and audit are
 * unchanged), but a fact key the actor may no longer read is suppressed. Revoked
 * source content can therefore never be re-exposed through package history, a
 * cached preview or an operation replay.
 */
export function projectManifestForActor(
  manifest: unknown,
  readableFactReferenceIds: ReadonlySet<string>
): { readonly manifest: unknown; readonly redactedFactReferenceCount: number } {
  if (!manifest || typeof manifest !== "object") {
    return { manifest, redactedFactReferenceCount: 0 };
  }
  const dependencies = readFrozenDependencies(manifest);
  if (dependencies === null) {
    return { manifest, redactedFactReferenceCount: 0 };
  }
  let redacted = 0;
  const factReferences = dependencies.factReferences.map((reference) => {
    if (readableFactReferenceIds.has(reference.factReferenceId)) {
      return reference;
    }
    redacted += 1;
    return { ...reference, factKey: "" };
  });
  return {
    manifest: {
      ...(manifest as Record<string, unknown>),
      dependencies: { ...dependencies, factReferences },
    },
    redactedFactReferenceCount: redacted,
  };
}

/**
 * The exact identity a customer consents to.
 *
 * A consent is only ever usable for the tuple it froze: a different Project, target,
 * package version, manifest digest or statement policy is a different consent. The
 * server recomputes this from stored data and never accepts a browser-supplied hash
 * as evidence of what was reviewed.
 */
export type SubmissionConsentBinding = {
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly packageVersionId: string;
  readonly manifestSha256: string;
  readonly statementPolicyVersion: string;
};

export function consentBindingSha256(
  binding: SubmissionConsentBinding
): string {
  return submissionDigest({
    manifestSha256: binding.manifestSha256,
    packageVersionId: binding.packageVersionId,
    projectId: binding.projectId,
    statementPolicyVersion: binding.statementPolicyVersion,
    targetId: binding.targetId,
    targetKind: binding.targetKind,
  });
}

/**
 * A persisted invalidation record proves a confirmation stopped being current at a
 * known dependency state. It is never removed, so a later return to the same
 * dependency fingerprints can never silently resurrect the old authorization.
 */
export function mergeInvalidationEvidence(input: {
  readonly freshness: {
    readonly current: boolean;
    readonly reasonCodes: readonly SubmissionStaleReason[];
  };
  readonly invalidations: readonly {
    readonly reasonCodes: readonly SubmissionStaleReason[];
  }[];
}): {
  readonly current: boolean;
  readonly reasonCodes: readonly SubmissionStaleReason[];
} {
  if (input.invalidations.length === 0) {
    return input.freshness;
  }
  const reasons = new Set<SubmissionStaleReason>(input.freshness.reasonCodes);
  for (const invalidation of input.invalidations) {
    for (const reason of invalidation.reasonCodes) {
      reasons.add(reason);
    }
  }
  return {
    current: false,
    reasonCodes: SUBMISSION_STALE_REASONS.filter((reason) =>
      reasons.has(reason)
    ),
  };
}

/**
 * A package is only usable - current and confirmable - when its stored bytes still
 * match their recorded digest *and* every dependency still holds. An integrity
 * failure is never reported as current, and its manifest content is not served.
 */
export function packageUsability(input: {
  readonly integrityVerified: boolean;
  readonly freshness: {
    readonly current: boolean;
    readonly reasonCodes: readonly SubmissionStaleReason[];
  };
}): {
  readonly current: boolean;
  readonly reasonCodes: readonly SubmissionStaleReason[];
} {
  if (input.integrityVerified) {
    return input.freshness;
  }
  const reasons = new Set<SubmissionStaleReason>(input.freshness.reasonCodes);
  reasons.add("source_unavailable");
  return {
    current: false,
    reasonCodes: SUBMISSION_STALE_REASONS.filter((reason) =>
      reasons.has(reason)
    ),
  };
}
