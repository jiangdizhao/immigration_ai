import { randomUUID } from "node:crypto";
import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import {
  normalizeOperationId,
  SUBMISSION_PACKAGE_DISCLOSURES,
  SUBMISSION_PACKAGE_LIMITS,
  SUBMISSION_PACKAGE_SCHEMA,
  SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
  SUBMISSION_STALE_REASONS,
  type SubmissionConfirmationType,
  SubmissionPackageError,
  type SubmissionStaleReason,
  submissionDigest,
} from "./contracts";
import {
  buildSubmissionManifest,
  consentBindingSha256,
  dependenciesSha256,
  evaluateSubmissionFreshness,
  mergeInvalidationEvidence,
  normalizeIndicators,
  packageUsability,
  projectManifestForActor,
  readFrozenDependencies,
  SUBMISSION_STATEMENTS,
  type SubmissionConsentBinding,
} from "./policy";
import type {
  SubmissionActorContext,
  SubmissionConfirmationRecord,
  SubmissionFinalizationRecord,
  SubmissionInvalidationRecord,
  SubmissionPackageRecord,
  SubmissionPackageStore,
  SubmissionTargetReader,
  SubmissionTargetState,
} from "./ports";

/**
 * Phase 13 M8.1 - exact-version submission package service.
 *
 * Responsibilities, in order of authority:
 *
 *   1. authorization from persisted Project state (never from the request body);
 *   2. one canonical manifest per frozen version, hashed server-side;
 *   3. exact-version confirmation bound to package id + manifest digest + target
 *      version + statement policy version;
 *   4. freshness derived from live upstream dependencies with deterministic codes;
 *   5. append-only invalidation evidence that never rewrites history.
 *
 * It never decides legal correctness, professional review, eligibility or
 * submission, and it cannot read or store document bodies, fact values or chats.
 */

export type SubmissionScope = {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
};

export type SubmissionConfirmationView = {
  readonly confirmationId: string;
  readonly confirmationType: SubmissionConfirmationType;
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly manifestSha256: string;
  readonly targetVersion: number;
  readonly statementPolicyVersion: string;
  readonly confirmedAt: string;
  readonly current: boolean;
  /** True only when the mandatory post-write validation completed durably. */
  readonly finalized: boolean;
  readonly invalidatedReasonCodes: readonly SubmissionStaleReason[];
};

export type SubmissionPackageView = {
  readonly packageVersionId: string;
  readonly version: number;
  readonly status: "frozen";
  readonly schemaVersion: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly targetVersion: number;
  readonly manifestSha256: string;
  readonly dependencySha256: string;
  readonly createdAt: string;
  readonly integrityVerified: boolean;
  /** The frozen manifest, or `null` when its stored bytes fail their digest. */
  readonly manifest: unknown;
  readonly redactedFactReferenceCount: number;
  /** Exact identity this version's consent must be bound to. */
  readonly consentBindingSha256: string;
  readonly freshness: {
    readonly current: boolean;
    readonly reasonCodes: readonly SubmissionStaleReason[];
  };
  readonly confirmations: readonly SubmissionConfirmationView[];
};

export type SubmissionWorkspaceView = {
  readonly schemaVersion: typeof SUBMISSION_PACKAGE_SCHEMA;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly targetVersion: number;
  readonly archived: boolean;
  readonly applicationStatus: string;
  readonly content: SubmissionTargetState["content"];
  readonly indicators: SubmissionTargetState["indicators"];
  /** The content the customer reviews, reconstructed from the pinned version. */
  readonly review: SubmissionTargetState["review"];
  readonly reviewUnavailableReason: SubmissionStaleReason | null;
  readonly latestVersion: number;
  readonly packages: readonly SubmissionPackageView[];
  readonly currentPackage: SubmissionPackageView | null;
  readonly confirmations: readonly SubmissionConfirmationView[];
  readonly statements: readonly {
    readonly confirmationType: SubmissionConfirmationType;
    readonly policyVersion: string;
    readonly confirmable: boolean;
    readonly reasonCode: string | null;
  }[];
  readonly disclosures: readonly string[];
  readonly honesty: {
    readonly submissionStatus: "not_submission_ready";
    readonly professionalReviewStatus: "not_requested";
    readonly legalCoverage: "partial_unverified";
    readonly documentsTrust: "unavailable";
  };
  readonly nextAction:
    | "build_package"
    | "review_package"
    | "confirm_package"
    | "rebuild_package"
    | "unavailable";
  readonly limits: { readonly maxVersionsPerTarget: number };
};

export type SubmissionPackageServiceOptions = {
  readonly store: SubmissionPackageStore;
  readonly readTarget: SubmissionTargetReader;
};

function iso(value: Date): string {
  return value.toISOString();
}

function requireScope(scope: SubmissionScope): void {
  if (
    typeof scope.actorUserId !== "string" ||
    scope.actorUserId.length === 0 ||
    typeof scope.projectId !== "string" ||
    scope.projectId.length === 0 ||
    typeof scope.targetId !== "string" ||
    scope.targetId.length === 0 ||
    (scope.targetKind !== "managed_school_application" &&
      scope.targetKind !== "student_500_visa_application")
  ) {
    throw new SubmissionPackageError("invalid_request");
  }
}

export function createSubmissionPackageService(
  options: SubmissionPackageServiceOptions
) {
  const { store, readTarget } = options;

  /**
   * Current authorization, derived only from persisted Project state. A staff
   * account is never granted private application access here, and a non-member is
   * reported exactly like a foreign Project so existence is not leaked.
   */
  async function authorize(
    input: { readonly actorUserId: string; readonly projectId: string },
    mode: "read" | "write"
  ): Promise<SubmissionActorContext> {
    const context = await store.readActorContext({ ...input });
    if (!context.registeredCustomer || context.staff) {
      throw new SubmissionPackageError("actor_not_eligible");
    }
    if (context.project === null) {
      throw new SubmissionPackageError("project_not_found");
    }
    if (
      context.membershipStatus !== "owner" &&
      context.membershipStatus !== "active_member"
    ) {
      throw new SubmissionPackageError("project_forbidden");
    }
    if (mode === "write" && context.project.status !== "active") {
      throw new SubmissionPackageError("project_closed");
    }
    return context;
  }

  /**
   * Reads the live target through the owning M5.1/M6.2 service. A target that cannot
   * be read is never treated as unchanged: it fails closed.
   */
  async function loadTarget(
    scope: SubmissionScope
  ): Promise<SubmissionTargetState> {
    let target: SubmissionTargetState;
    try {
      target = await readTarget({
        actorUserId: scope.actorUserId,
        projectId: scope.projectId,
        targetId: scope.targetId,
        targetKind: scope.targetKind,
      });
    } catch (error) {
      if (
        error instanceof SubmissionPackageError &&
        (error.code === "target_not_found" || error.code === "target_archived")
      ) {
        throw error;
      }
      throw new SubmissionPackageError("source_unavailable");
    }
    if (
      target.targetKind !== scope.targetKind ||
      target.targetId !== scope.targetId
    ) {
      throw new SubmissionPackageError("source_unavailable");
    }
    return target;
  }

  function readableFactReferenceIds(
    target: SubmissionTargetState
  ): ReadonlySet<string> {
    return new Set(
      target.dependencies.factReferences.map(
        (reference) => reference.factReferenceId
      )
    );
  }

  /** The exact upstream version this package froze, read from its own manifest. */
  function manifestTargetVersion(record: SubmissionPackageRecord): number {
    const value = (record.manifest as { targetVersion?: unknown } | null)
      ?.targetVersion;
    return typeof value === "number" ? value : 0;
  }

  /** Recomputes a stored manifest digest: a tampered row is never trusted. */
  function integrityVerified(record: SubmissionPackageRecord): boolean {
    if (!readFrozenDependencies(record.manifest)) {
      return false;
    }
    return submissionDigest(record.manifest) === record.manifestSha256;
  }

  function packageView(input: {
    readonly record: SubmissionPackageRecord;
    readonly target: SubmissionTargetState;
    readonly actorContext: SubmissionActorContext;
    readonly confirmations: readonly SubmissionConfirmationRecord[];
    readonly finalizations: readonly SubmissionFinalizationRecord[];
    readonly invalidations: readonly SubmissionInvalidationRecord[];
  }): SubmissionPackageView {
    const frozen = readFrozenDependencies(input.record.manifest);
    const digestVerified = integrityVerified(input.record);
    const dependencyFreshness =
      frozen === null
        ? {
            current: false,
            reasonCodes: [
              "source_unavailable",
            ] as readonly SubmissionStaleReason[],
          }
        : evaluateSubmissionFreshness({
            actorContext: input.actorContext,
            current: input.target,
            frozen,
          });
    // Stored bytes that no longer match their digest are never current, and a
    // persisted invalidation record permanently ends this version's validity.
    const freshness = packageUsability({
      freshness: mergeInvalidationEvidence({
        freshness: dependencyFreshness,
        invalidations: input.invalidations,
      }),
      integrityVerified: digestVerified,
    });
    const projection = projectManifestForActor(
      input.record.manifest,
      readableFactReferenceIds(input.target)
    );
    const binding: SubmissionConsentBinding = {
      manifestSha256: input.record.manifestSha256,
      packageVersionId: input.record.id,
      projectId: input.record.projectId,
      statementPolicyVersion: input.record.statementPolicyVersion,
      targetId: input.record.targetId,
      targetKind: input.record.targetKind,
    };
    return {
      confirmations: input.confirmations.map((confirmation) =>
        confirmationView({
          confirmation,
          finalized: input.finalizations.some(
            (finalization) => finalization.confirmationId === confirmation.id
          ),
          freshness: confirmationValidity({
            freshness,
            confirmationId: confirmation.id,
            finalizations: input.finalizations,
            invalidations: input.invalidations,
          }),
        })
      ),
      consentBindingSha256: consentBindingSha256(binding),
      createdAt: iso(input.record.createdAt),
      dependencySha256: input.record.dependencySha256,
      freshness,
      // A tampered row is never served: the digest, not the bytes, is authoritative.
      integrityVerified: digestVerified,
      manifest: digestVerified ? projection.manifest : null,
      manifestSha256: input.record.manifestSha256,
      packageVersionId: input.record.id,
      redactedFactReferenceCount: projection.redactedFactReferenceCount,
      schemaVersion: input.record.schemaVersion,
      status: input.record.status,
      targetId: input.record.targetId,
      targetKind: input.record.targetKind,
      targetVersion: manifestTargetVersion(input.record),
      version: input.record.version,
    };
  }

  /** Per-confirmation validity, including its own invalidation evidence. */
  function confirmationValidity(input: {
    readonly freshness: {
      readonly current: boolean;
      readonly reasonCodes: readonly SubmissionStaleReason[];
    };
    readonly confirmationId: string;
    readonly invalidations: readonly SubmissionInvalidationRecord[];
    readonly finalizations: readonly SubmissionFinalizationRecord[];
  }): {
    readonly current: boolean;
    readonly reasonCodes: readonly SubmissionStaleReason[];
  } {
    const merged = mergeInvalidationEvidence({
      freshness: input.freshness,
      invalidations: input.invalidations.filter(
        (invalidation) => invalidation.confirmationId === input.confirmationId
      ),
    });
    const finalized = input.finalizations.some(
      (finalization) => finalization.confirmationId === input.confirmationId
    );
    if (finalized) {
      return merged;
    }
    // A confirmation whose mandatory post-write validation never completed is never
    // current, however healthy its dependencies look now.
    return {
      current: false,
      reasonCodes: SUBMISSION_STALE_REASONS.filter(
        (reason) =>
          merged.reasonCodes.includes(reason) ||
          reason === "confirmation_not_finalized"
      ),
    };
  }

  function confirmationView(input: {
    readonly confirmation: SubmissionConfirmationRecord;
    readonly finalized: boolean;
    readonly freshness: {
      readonly current: boolean;
      readonly reasonCodes: readonly SubmissionStaleReason[];
    };
  }): SubmissionConfirmationView {
    return {
      confirmationId: input.confirmation.id,
      confirmationType: input.confirmation.confirmationType,
      confirmedAt: iso(input.confirmation.confirmedAt),
      current: input.freshness.current,
      finalized: input.finalized,
      invalidatedReasonCodes: input.freshness.reasonCodes,
      manifestSha256: input.confirmation.manifestSha256,
      packageVersion: input.confirmation.packageVersion,
      packageVersionId: input.confirmation.packageVersionId,
      statementPolicyVersion: input.confirmation.statementPolicyVersion,
      targetVersion: input.confirmation.targetVersion,
    };
  }

  async function listState(scope: SubmissionScope) {
    const [records, confirmations, invalidations, finalizations] =
      await Promise.all([
        store.listPackages({ ...scope }),
        store.listConfirmations({ ...scope }),
        store.listInvalidations({ ...scope }),
        store.listFinalizations({ ...scope }),
      ]);
    return { confirmations, finalizations, invalidations, records };
  }

  function confirmationState(input: {
    readonly target: SubmissionTargetState;
    readonly actorContext: SubmissionActorContext;
    readonly packages: readonly SubmissionPackageRecord[];
    readonly confirmations: readonly SubmissionConfirmationRecord[];
    readonly finalizations: readonly SubmissionFinalizationRecord[];
    readonly invalidations: readonly SubmissionInvalidationRecord[];
  }): {
    readonly packages: readonly SubmissionPackageView[];
    readonly confirmations: readonly SubmissionConfirmationView[];
    readonly currentPackage: SubmissionPackageView | null;
    readonly latestVersion: number;
  } {
    const views = input.packages.map((record) =>
      packageView({
        actorContext: input.actorContext,
        confirmations: input.confirmations.filter(
          (confirmation) => confirmation.packageVersionId === record.id
        ),
        finalizations: input.finalizations.filter(
          (finalization) => finalization.packageVersionId === record.id
        ),
        invalidations: input.invalidations.filter(
          (invalidation) => invalidation.packageVersionId === record.id
        ),
        record,
        target: input.target,
      })
    );
    const newestFirst = [...views].sort(
      (left, right) => right.version - left.version
    );
    const newest = newestFirst.at(0) ?? null;
    return {
      confirmations: newestFirst.flatMap((view) => view.confirmations),
      // Only the newest fully usable version can be the current one.
      currentPackage: newest?.freshness.current ? newest : null,
      latestVersion: newest?.version ?? 0,
      packages: newestFirst,
    };
  }

  /**
   * Read-only workspace: live target content, every frozen version, current
   * freshness for each, and the confirmation history. No write happens here, so a
   * GET can never create state or rewrite a confirmation.
   */
  async function get(scope: SubmissionScope): Promise<SubmissionWorkspaceView> {
    requireScope(scope);
    const actorContext = await authorize(scope, "read");
    const target = await loadTarget(scope);
    const { confirmations, finalizations, invalidations, records } =
      await listState(scope);
    const state = confirmationState({
      actorContext,
      confirmations,
      finalizations,
      invalidations,
      packages: records,
      target,
    });
    // Review availability is the gate for both the primary action and every
    // confirmation statement.
    const reviewAvailable = target.review !== null;
    const statements = SUBMISSION_STATEMENTS.map((statement) => {
      const newest = state.packages.at(0) ?? null;
      const existing = newest?.confirmations.find(
        (confirmation) =>
          confirmation.confirmationType === statement.confirmationType
      );
      // `confirmable` must describe what the customer can actually do: the exact
      // pinned content has to be readable *and* the newest version current.
      const blocked = target.archived
        ? "target_archived"
        : actorContext.project?.status !== "active"
          ? "project_closed"
          : newest === null
            ? "package_required"
            : reviewAvailable
              ? newest.freshness.current
                ? existing !== undefined
                  ? "already_confirmed"
                  : null
                : "package_not_current"
              : "review_unavailable";
      return {
        confirmationType: statement.confirmationType,
        confirmable: blocked === null,
        policyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        reasonCode: blocked,
      };
    });
    return {
      applicationStatus: target.dependencies.applicationStatus,
      archived: target.archived,
      confirmations: state.confirmations,
      content: target.content,
      currentPackage: state.currentPackage,
      disclosures: [...SUBMISSION_PACKAGE_DISCLOSURES],
      honesty: {
        documentsTrust: "unavailable",
        legalCoverage: "partial_unverified",
        professionalReviewStatus: "not_requested",
        submissionStatus: "not_submission_ready",
      },
      indicators: normalizeIndicators(target.indicators),
      latestVersion: state.latestVersion,
      limits: {
        maxVersionsPerTarget: SUBMISSION_PACKAGE_LIMITS.maxVersionsPerTarget,
      },
      // One honest primary action: nothing can be built or confirmed while the exact
      // pinned content cannot be reconstructed for this actor.
      nextAction:
        target.archived || !reviewAvailable
          ? "unavailable"
          : state.packages.length === 0
            ? "build_package"
            : state.currentPackage === null
              ? "rebuild_package"
              : state.confirmations.length === 0
                ? "confirm_package"
                : "review_package",
      packages: state.packages,
      projectId: scope.projectId,
      // Fail-closed review content: `null` means the exact pinned version cannot be
      // reconstructed under current authorization, so nothing may be confirmed.
      review: target.review,
      reviewUnavailableReason: target.reviewUnavailableReason,
      schemaVersion: SUBMISSION_PACKAGE_SCHEMA,
      statements,
      targetId: scope.targetId,
      targetKind: scope.targetKind,
      targetVersion: target.targetVersion,
    };
  }

  /** Append-only invalidation evidence for confirmations that stopped being current. */
  async function recordInvalidations(input: {
    readonly scope: SubmissionScope;
    readonly target: SubmissionTargetState;
    readonly actorContext: SubmissionActorContext;
    readonly packages: readonly SubmissionPackageRecord[];
    readonly confirmations: readonly SubmissionConfirmationRecord[];
  }): Promise<void> {
    if (input.confirmations.length === 0) {
      return;
    }
    const byPackage = new Map(
      input.packages.map((record) => [record.id, record])
    );
    for (const confirmation of input.confirmations) {
      const record = byPackage.get(confirmation.packageVersionId);
      const frozen = record ? readFrozenDependencies(record.manifest) : null;
      if (frozen === null) {
        continue;
      }
      const freshness = evaluateSubmissionFreshness({
        actorContext: input.actorContext,
        current: input.target,
        frozen,
      });
      if (freshness.current) {
        continue;
      }
      try {
        await options.store.recordInvalidation({
          dependencySha256: dependenciesSha256(input.target.dependencies),
          detectedByUserId: input.scope.actorUserId,
          id: randomUUID(),
          packageVersionId: record?.id ?? confirmation.packageVersionId,
          confirmationId: confirmation.id,
          projectId: input.scope.projectId,
          reasonCodes: freshness.reasonCodes,
        });
      } catch {
        // Evidence is best-effort and insert-once; a failure must never turn a
        // successful customer action into an error or rewrite history.
      }
    }
  }

  function requestDigest(value: unknown): string {
    return submissionDigest(value);
  }

  /**
   * Freeze one exact version.
   *
   * Replay is checked before the target is re-read, so an identical retry returns
   * the original frozen package even if upstream content has since changed. A changed
   * payload under the same operation id is refused rather than silently re-used.
   */
  async function buildPackage(input: {
    readonly scope: SubmissionScope;
    readonly operationId: unknown;
    readonly expectedVersion?: number | null;
  }): Promise<{
    readonly package: SubmissionPackageView;
    readonly replayed: boolean;
  }> {
    requireScope(input.scope);
    const operationId = normalizeOperationId(input.operationId);
    const actorContext = await authorize(input.scope, "write");
    const expectedVersion =
      input.expectedVersion === undefined || input.expectedVersion === null
        ? null
        : input.expectedVersion;
    if (
      expectedVersion !== null &&
      (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
    ) {
      throw new SubmissionPackageError("invalid_request");
    }
    const requestSha256 = requestDigest({
      action: "build_package",
      expectedVersion,
      projectId: input.scope.projectId,
      targetId: input.scope.targetId,
      targetKind: input.scope.targetKind,
    });

    const replay = await store.findPackageOperation({
      operationId,
      projectId: input.scope.projectId,
    });
    if (replay !== null) {
      if (replay.requestSha256 !== requestSha256) {
        throw new SubmissionPackageError("idempotency_conflict");
      }
      const target = await loadTarget(input.scope);
      const { confirmations, finalizations, invalidations, records } =
        await listState(input.scope);
      const state = confirmationState({
        actorContext,
        confirmations,
        finalizations,
        invalidations,
        packages: records,
        target,
      });
      const view = state.packages.find(
        (entry) => entry.packageVersionId === replay.id
      );
      if (!view) {
        throw new SubmissionPackageError("integrity_conflict");
      }
      return { package: view, replayed: true };
    }
    return {
      package: await buildFresh(
        input,
        actorContext,
        operationId,
        requestSha256,
        expectedVersion
      ),
      replayed: false,
    };
  }

  async function buildFresh(
    input: {
      readonly scope: SubmissionScope;
      readonly operationId: unknown;
      readonly expectedVersion?: number | null;
    },
    actorContext: SubmissionActorContext,
    operationId: string,
    requestSha256: string,
    expectedVersion: number | null
  ): Promise<SubmissionPackageView> {
    const target = await loadTarget(input.scope);
    if (target.archived) {
      throw new SubmissionPackageError("target_archived");
    }
    if (target.dependencies.sourceAvailability !== "available") {
      throw new SubmissionPackageError("source_unavailable");
    }
    if (target.review === null) {
      // The exact pinned content cannot be read by this actor right now, so a package
      // that could never be reviewed or confirmed is not created at all.
      throw new SubmissionPackageError("source_unavailable");
    }
    const existingCount = await store.countPackages({ ...input.scope });
    if (existingCount >= SUBMISSION_PACKAGE_LIMITS.maxVersionsPerTarget) {
      throw new SubmissionPackageError("limit_exceeded");
    }
    if (expectedVersion !== null && target.targetVersion !== expectedVersion) {
      // The caller froze against a version that is no longer current.
      throw new SubmissionPackageError("revision_conflict");
    }

    const operation = {
      actorUserId: input.scope.actorUserId,
      operationId,
      requestSha256,
    };
    // Bounded optimistic allocation: the store owns the unique version index, so a
    // lost race is retried with the next free version instead of overwriting.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const version = (await store.countPackages({ ...input.scope })) + 1;
      const built = buildSubmissionManifest({
        packageVersion: version,
        projectId: input.scope.projectId,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        target,
      });
      try {
        const inserted = await store.insertPackage({
          guard: {
            actorUserId: input.scope.actorUserId,
            requireActiveProject: true,
          },
          operation,
          projectId: input.scope.projectId,
          values: {
            dependencySha256: built.dependencySha256,
            id: randomUUID(),
            manifest: built.manifest,
            manifestSha256: built.manifestSha256,
            schemaVersion: SUBMISSION_PACKAGE_SCHEMA,
            statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
            targetId: input.scope.targetId,
            targetKind: input.scope.targetKind,
            version,
          },
        });
        const { confirmations, finalizations, invalidations, records } =
          await listState(input.scope);
        await recordInvalidations({
          actorContext,
          confirmations,
          packages: records,
          scope: input.scope,
          target,
        });
        const state = confirmationState({
          actorContext,
          confirmations,
          finalizations,
          invalidations,
          packages: records,
          target,
        });
        const view = state.packages.find(
          (entry) => entry.packageVersionId === inserted.value.id
        );
        if (!view) {
          throw new SubmissionPackageError("integrity_conflict");
        }
        return view;
      } catch (error) {
        if (
          error instanceof SubmissionPackageError &&
          (error.code === "version_conflict" ||
            error.code === "idempotency_conflict")
        ) {
          const concurrent = await store.findPackageOperation({
            operationId,
            projectId: input.scope.projectId,
          });
          if (concurrent !== null) {
            if (concurrent.requestSha256 !== requestSha256) {
              throw new SubmissionPackageError("idempotency_conflict");
            }
            const { confirmations, finalizations, invalidations, records } =
              await listState(input.scope);
            const state = confirmationState({
              actorContext,
              confirmations,
              finalizations,
              invalidations,
              packages: records,
              target,
            });
            const view = state.packages.find(
              (entry) => entry.packageVersionId === concurrent.id
            );
            if (view) {
              return view;
            }
          }
          continue;
        }
        throw error;
      }
    }
    throw new SubmissionPackageError("version_conflict");
  }

  /**
   * Record an explicit customer confirmation of one exact package version.
   *
   * Exact identity is required: package id, manifest digest and target version must
   * all match what is stored, the content must be re-verified, the package must still
   * be current for this actor, and the customer must have granted the statement's
   * consent. Nothing is inferred from reading, owning, uploading or from an M7 GS
   * proposal acceptance.
   */
  async function confirmPackage(input: {
    readonly scope: SubmissionScope;
    readonly packageVersionId: unknown;
    readonly manifestSha256: unknown;
    readonly targetVersion: unknown;
    readonly confirmationType: unknown;
    readonly statementPolicyVersion: unknown;
    readonly consentGranted: unknown;
    readonly operationId: unknown;
    /** Exactly what the customer consented to, re-verified against stored data. */
    readonly consentBinding: {
      readonly projectId: unknown;
      readonly targetKind: unknown;
      readonly targetId: unknown;
      readonly packageVersionId: unknown;
      readonly manifestSha256: unknown;
      readonly statementPolicyVersion: unknown;
    };
  }): Promise<{
    readonly confirmation: SubmissionConfirmationView;
    readonly package: SubmissionPackageView;
    readonly replayed: boolean;
  }> {
    requireScope(input.scope);
    const operationId = normalizeOperationId(input.operationId);
    const actorContext = await authorize(input.scope, "write");
    if (input.consentGranted !== true) {
      throw new SubmissionPackageError("consent_required");
    }
    if (
      typeof input.packageVersionId !== "string" ||
      typeof input.manifestSha256 !== "string" ||
      typeof input.targetVersion !== "number" ||
      input.statementPolicyVersion !==
        SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION
    ) {
      throw new SubmissionPackageError("invalid_request");
    }
    const declaration = SUBMISSION_STATEMENTS.find(
      (statement) => statement.confirmationType === input.confirmationType
    );
    if (declaration === undefined) {
      throw new SubmissionPackageError("invalid_request");
    }
    const confirmationType = declaration.confirmationType;
    // The consent must name exactly what the server is about to record. The digest is
    // recomputed server-side from stored data, so a browser cannot widen, narrow or
    // re-target a consent by editing the payload.
    const consentBinding: SubmissionConsentBinding = {
      manifestSha256: input.manifestSha256,
      packageVersionId: input.packageVersionId,
      projectId: input.scope.projectId,
      statementPolicyVersion: input.statementPolicyVersion,
      targetId: input.scope.targetId,
      targetKind: input.scope.targetKind,
    };
    if (
      input.consentBinding.projectId !== consentBinding.projectId ||
      input.consentBinding.targetKind !== consentBinding.targetKind ||
      input.consentBinding.targetId !== consentBinding.targetId ||
      input.consentBinding.packageVersionId !==
        consentBinding.packageVersionId ||
      input.consentBinding.manifestSha256 !== consentBinding.manifestSha256 ||
      input.consentBinding.statementPolicyVersion !==
        consentBinding.statementPolicyVersion
    ) {
      // Consent for another version, target or policy is not consent for this one.
      throw new SubmissionPackageError("consent_required");
    }
    const consentSha256 = consentBindingSha256(consentBinding);
    const requestSha256 = requestDigest({
      action: "confirm_package",
      confirmationType,
      consentSha256,
      manifestSha256: input.manifestSha256,
      packageVersionId: input.packageVersionId,
      projectId: input.scope.projectId,
      statementPolicyVersion: input.statementPolicyVersion,
      targetId: input.scope.targetId,
      targetKind: input.scope.targetKind,
      targetVersion: input.targetVersion,
    });

    const replay = await store.findConfirmationOperation({
      operationId,
      projectId: input.scope.projectId,
    });
    if (replay !== null) {
      if (replay.requestSha256 !== requestSha256) {
        throw new SubmissionPackageError("idempotency_conflict");
      }
      const target = await loadTarget(input.scope);
      const { confirmations, finalizations, invalidations, records } =
        await listState(input.scope);
      const state = confirmationState({
        actorContext,
        confirmations,
        finalizations,
        invalidations,
        packages: records,
        target,
      });
      const view = state.packages.find(
        (entry) => entry.packageVersionId === replay.packageVersionId
      );
      const confirmation = view?.confirmations.find(
        (entry) => entry.confirmationId === replay.id
      );
      if (!(view && confirmation)) {
        throw new SubmissionPackageError("integrity_conflict");
      }
      return { confirmation, package: view, replayed: true };
    }

    const record = await store.getPackage({
      packageVersionId: input.packageVersionId,
      projectId: input.scope.projectId,
    });
    if (
      record === null ||
      record.targetKind !== input.scope.targetKind ||
      record.targetId !== input.scope.targetId
    ) {
      throw new SubmissionPackageError("package_not_found");
    }
    if (!integrityVerified(record)) {
      throw new SubmissionPackageError("integrity_conflict");
    }
    const frozen = readFrozenDependencies(record.manifest);
    if (frozen === null) {
      throw new SubmissionPackageError("integrity_conflict");
    }
    if (record.manifestSha256 !== input.manifestSha256) {
      // The customer confirmed a digest that is not this package's content.
      throw new SubmissionPackageError("integrity_conflict");
    }
    const frozenTargetVersion = manifestTargetVersion(record);
    if (frozenTargetVersion !== input.targetVersion) {
      throw new SubmissionPackageError("revision_conflict");
    }

    const target = await loadTarget(input.scope);
    if (target.archived) {
      throw new SubmissionPackageError("target_archived");
    }
    const freshness = evaluateSubmissionFreshness({
      actorContext,
      current: target,
      frozen,
    });
    if (!freshness.current) {
      // A confirmation can never authorize content that has already changed.
      throw new SubmissionPackageError("state_conflict");
    }
    // The reviewed content must itself be reconstructable right now; otherwise the
    // customer would be confirming something they cannot see.
    if (target.review === null) {
      throw new SubmissionPackageError("state_conflict");
    }
    // Only the newest immutable version may gain a confirmation. An older version can
    // never become confirmable again merely because its fingerprints match once more.
    const latestVersion = await store.latestVersion({
      projectId: input.scope.projectId,
      targetId: input.scope.targetId,
      targetKind: input.scope.targetKind,
    });
    if (record.version !== latestVersion) {
      throw new SubmissionPackageError("state_conflict");
    }

    const existing = await store.getConfirmation({
      confirmationType,
      packageVersionId: record.id,
      projectId: input.scope.projectId,
    });
    if (existing !== null) {
      if (existing.operationId === operationId) {
        const { confirmations, finalizations, invalidations, records } =
          await listState(input.scope);
        const state = confirmationState({
          actorContext,
          confirmations,
          finalizations,
          invalidations,
          packages: records,
          target,
        });
        const view = state.packages.find(
          (entry) => entry.packageVersionId === existing.packageVersionId
        );
        const confirmation = view?.confirmations.find(
          (entry) => entry.confirmationId === existing.id
        );
        if (view && confirmation) {
          return { confirmation, package: view, replayed: true };
        }
      }
      // One current confirmation per exact package and statement type.
      throw new SubmissionPackageError("state_conflict");
    }

    const operation = {
      actorUserId: input.scope.actorUserId,
      operationId,
      requestSha256,
    };
    const inserted = await store
      .insertConfirmation({
        guard: {
          actorUserId: input.scope.actorUserId,
          requireActiveProject: true,
        },
        operation,
        projectId: input.scope.projectId,
        values: {
          confirmationType,
          id: randomUUID(),
          manifestSha256: record.manifestSha256,
          packageVersion: record.version,
          packageVersionId: record.id,
          statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
          targetId: record.targetId,
          targetKind: record.targetKind,
          targetVersion: frozenTargetVersion,
        },
      })
      .catch(async (error: unknown) => {
        if (
          error instanceof SubmissionPackageError &&
          (error.code === "state_conflict" ||
            error.code === "idempotency_conflict" ||
            error.code === "version_conflict")
        ) {
          // A concurrent confirmation won. Re-read once: the identical request is a
          // replay, a different one is refused.
          const concurrent = await store.findConfirmationOperation({
            operationId,
            projectId: input.scope.projectId,
          });
          if (concurrent !== null) {
            if (concurrent.requestSha256 !== requestSha256) {
              throw new SubmissionPackageError("idempotency_conflict");
            }
            return { replayed: true, value: concurrent };
          }
          const current = await store.getConfirmation({
            confirmationType,
            packageVersionId: record.id,
            projectId: input.scope.projectId,
          });
          if (current !== null) {
            throw new SubmissionPackageError("state_conflict");
          }
        }
        throw error;
      });

    // ---- Mandatory durable finalization --------------------------------------
    // The confirmation row exists, but nothing treats it as current until the
    // append-only finalization record below exists. The sequence is therefore
    // fail-closed by construction: an interrupted insert -> recheck -> finalize
    // leaves a confirmation that can never be treated as current.
    //
    // Neither the invalidation write nor the finalization write is wrapped in a
    // catch: a failed mandatory durability step surfaces instead of being hidden.
    //
    // Limitation, stated plainly: the upstream dependency read and this M8 write are
    // still separate transactions, so this is fail-closed compensation, not
    // serializability. It removes the *effect* of the race (an unfinalized or
    // invalidated confirmation is never current), not the race itself.
    let recheck: SubmissionTargetState;
    try {
      recheck = await loadTarget(input.scope);
    } catch {
      // The validation could not run. Recording why is itself mandatory.
      await store.recordInvalidation({
        confirmationId: inserted.value.id,
        dependencySha256: record.dependencySha256,
        detectedByUserId: input.scope.actorUserId,
        id: randomUUID(),
        packageVersionId: record.id,
        projectId: input.scope.projectId,
        reasonCodes: ["source_unavailable"],
      });
      throw new SubmissionPackageError("source_unavailable");
    }
    const recheckFreshness = evaluateSubmissionFreshness({
      actorContext,
      current: recheck,
      frozen,
    });
    if (!recheckFreshness.current || recheck.review === null) {
      // The dependencies moved inside the cross-module window. Persisting that
      // evidence is mandatory and is never silently swallowed.
      await store.recordInvalidation({
        confirmationId: inserted.value.id,
        dependencySha256: dependenciesSha256(recheck.dependencies),
        detectedByUserId: input.scope.actorUserId,
        id: randomUUID(),
        packageVersionId: record.id,
        projectId: input.scope.projectId,
        reasonCodes: recheckFreshness.current
          ? ["source_unavailable"]
          : recheckFreshness.reasonCodes,
      });
      throw new SubmissionPackageError("state_conflict");
    }
    // The validation matched the frozen identity: only now may this confirmation
    // become usable.
    await store.recordFinalization({
      confirmationId: inserted.value.id,
      id: randomUUID(),
      packageVersionId: record.id,
      projectId: input.scope.projectId,
      validatedByUserId: input.scope.actorUserId,
      validatedDependencySha256: dependenciesSha256(recheck.dependencies),
    });

    const { confirmations, finalizations, invalidations, records } =
      await listState(input.scope);
    await recordInvalidations({
      actorContext,
      confirmations,
      packages: records,
      scope: input.scope,
      target,
    });
    const state = confirmationState({
      actorContext,
      confirmations,
      finalizations,
      invalidations,
      packages: records,
      target,
    });
    const view = state.packages.find(
      (entry) => entry.packageVersionId === record.id
    );
    const confirmation = view?.confirmations.find(
      (entry) => entry.confirmationId === inserted.value.id
    );
    if (!(view && confirmation)) {
      throw new SubmissionPackageError("integrity_conflict");
    }
    return {
      confirmation,
      package: view,
      replayed: inserted.replayed,
    };
  }

  return {
    /** Immutable version count for one target, used by the UI limits. */
    buildPackage,
    confirmPackage,
    get,
    statements: SUBMISSION_STATEMENTS,
  };
}

export type SubmissionPackageService = ReturnType<
  typeof createSubmissionPackageService
>;
