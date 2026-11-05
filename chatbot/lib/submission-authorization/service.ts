import { randomUUID } from "node:crypto";
import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import {
  type AuthorizationValidityReason,
  type AuthorizationValidityStatus,
  authorizationDigest,
  type DerivedSubmissionState,
  type ExternalEvidenceProvenance,
  type ExternalOutcomeCode,
  type ExternalRecordKind,
  type ExternalSubmissionChannel,
  isExternalEvidenceProvenance,
  isExternalOutcomeCode,
  isExternalRecordKind,
  isExternalReference,
  isExternalSubmissionChannel,
  isSubmissionAuthorizationType,
  isSubmissionPackageUuid,
  isSubmissionTargetKind,
  normalizeSubmissionOperationId,
  SUBMISSION_AUTHORIZATION_DISCLOSURE_POLICY_VERSION,
  SUBMISSION_AUTHORIZATION_LIMITS,
  SUBMISSION_AUTHORIZATION_POLICY_VERSION,
  SUBMISSION_AUTHORIZATION_SCHEMA,
  SubmissionAuthorizationError,
  type SubmissionAuthorizationType,
  type SubmissionHandoffStatus,
} from "./contracts";
import {
  assessAuthorizationValidity,
  assessExactPackage,
  assessExternalEvidence,
  assessHandoffEligibility,
  assessManagedGate,
  authorizationBindingSha256,
  authorizationMode,
  derivedSubmissionState,
  type ExactPackageAssessment,
  HANDOFF_REQUEST_TARGET_STATUS,
  handoffTransitionAllowed,
  type ManagedGateAssessment,
  missingDisclosures,
  requiredDisclosures,
  type SubmissionAuthorizationBinding,
  type SubmissionHandoffTransitionRequest,
} from "./policy";
import type {
  AuthorizationActorContext,
  AuthorizationWriteGuard,
  ExactPackageReader,
  ExactPackageState,
  ExternalVerifier,
  HandoffAuthorityPort,
  ManagedReadinessReader,
  NewSubmissionAuthorizationValues,
  SubmissionAuthorizationRecord,
  SubmissionAuthorizationStore,
  SubmissionExternalRecord,
  SubmissionHandoffEventRecord,
  SubmissionHandoffRecord,
} from "./ports";

/**
 * Phase 13 M8.2 - submission authorization, sign-off and handoff service.
 *
 * Responsibilities, in order of authority:
 *
 *   1. authorization from persisted Project state (never from the request body);
 *   2. exact-version binding to one immutable M8.1 package version and digest;
 *   3. explicit, versioned disclosure acknowledgement per authorization type;
 *   4. managed-service authorization gated on the M4-007 readiness result;
 *   5. durable, compare-and-set human handoff with an append-only audit trail;
 *   6. external records whose provenance - never the authorization - decides what
 *      may be claimed.
 *
 * It never submits anything, never invents a professional, a signature, a payment
 * or a receipt, and it never reports an unverified record as verified.
 */

/** Both M8.1 confirmations must be current before any authorization is recorded. */
export const AUTHORIZATION_REQUIRED_CONFIRMATIONS = [
  "customer_declarations",
  "package_content_review",
] as const;

export type AuthorizationScope = {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
};

export type SubmissionAuthorizationSummary = {
  readonly authorizationId: string;
  readonly authorizationType: SubmissionAuthorizationType;
  readonly mode: "self_service" | "managed_service";
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly targetVersion: number;
  readonly manifestSha256: string;
  readonly disclosurePolicyVersion: string;
  readonly acknowledgedDisclosures: readonly string[];
  readonly bindingSha256: string;
  readonly authorizedAt: string;
  readonly validity: {
    readonly status: AuthorizationValidityStatus;
    readonly reasonCodes: readonly AuthorizationValidityReason[];
  };
};

export type SubmissionHandoffSummary = {
  readonly handoffId: string;
  readonly status: SubmissionHandoffStatus;
  readonly revision: number;
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly manifestSha256: string;
  readonly authorizationId: string;
  readonly requestedByUserId: string;
  readonly recipientUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly history: readonly {
    readonly status: SubmissionHandoffStatus;
    readonly at: string;
    readonly actorUserId: string;
    readonly reasonCode: string | null;
  }[];
};

export type SubmissionExternalRecordSummary = {
  readonly recordId: string;
  readonly kind: ExternalRecordKind;
  readonly channel: ExternalSubmissionChannel | null;
  readonly outcomeCode: ExternalOutcomeCode | null;
  readonly reference: string | null;
  readonly provenance: ExternalEvidenceProvenance;
  readonly verification: "unverified" | "verified";
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly packageVersion: number;
  readonly handoffId: string | null;
};

export type SubmissionAuthorizationModeView = {
  readonly available: boolean;
  readonly reasonCodes: readonly AuthorizationValidityReason[];
  readonly requiredDisclosures: readonly string[];
};

/** The one honest next step for the current state. Never an approval language. */
export const SUBMISSION_NEXT_ACTIONS = [
  "authorize_managed_service",
  "authorize_self_service",
  "await_handoff",
  "await_professional_submission",
  "build_package",
  "confirm_package",
  "none",
  "rebuild_package",
  "record_external_action",
  "request_handoff",
  "unavailable",
] as const;
export type SubmissionNextAction = (typeof SUBMISSION_NEXT_ACTIONS)[number];

export function nextActionFor(input: {
  readonly assessment: ExactPackageAssessment;
  readonly gate: ManagedGateAssessment;
  readonly primaryAuthorization: SubmissionAuthorizationRecord | null;
  readonly primaryHandoff: SubmissionHandoffSummary | null;
  readonly primaryValidity: {
    readonly status: AuthorizationValidityStatus;
  } | null;
  readonly submissionState: DerivedSubmissionState;
}): SubmissionNextAction {
  if (input.assessment.status === "unknown") {
    return "unavailable";
  }
  if (input.assessment.package === null) {
    return "build_package";
  }
  if (input.assessment.status !== "valid") {
    const rebuild = input.assessment.reasonCodes.some(
      (reason) =>
        reason === "package_not_current" ||
        reason === "package_freshness_lost" ||
        reason === "package_integrity_unverified"
    );
    // A confirmation problem needs a fresh confirmation; a changed package needs a
    // new version. Neither is ever reported as "ready".
    return rebuild ? "rebuild_package" : "confirm_package";
  }
  if (input.primaryValidity?.status !== "effective") {
    const managedPreferred =
      input.gate.status === "effective" ||
      input.primaryAuthorization?.authorizationType ===
        "managed_service_professional_handoff";
    return managedPreferred
      ? "authorize_managed_service"
      : "authorize_self_service";
  }
  if (
    input.primaryAuthorization?.authorizationType ===
    "self_service_external_submission"
  ) {
    return input.submissionState === "not_submitted"
      ? "record_external_action"
      : "none";
  }
  const handoff = input.primaryHandoff;
  if (handoff === null) {
    return "request_handoff";
  }
  if (handoff.status === "requested") {
    return "await_handoff";
  }
  if (handoff.status === "accepted") {
    return "await_professional_submission";
  }
  return "request_handoff";
}

export type SubmissionAuthorizationView = {
  readonly schemaVersion: typeof SUBMISSION_AUTHORIZATION_SCHEMA;
  readonly policyVersion: string;
  readonly disclosurePolicyVersion: string;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly currentPackageVersionId: string | null;
  readonly currentPackageVersion: number | null;
  readonly currentManifestSha256: string | null;
  readonly package: {
    readonly status: "valid" | "invalid" | "unknown";
    readonly reasonCodes: readonly AuthorizationValidityReason[];
    readonly staleReasonCodes: readonly string[];
    readonly effectiveConfirmationIds: readonly string[];
  };
  readonly modes: {
    readonly self_service: SubmissionAuthorizationModeView;
    readonly managed_service: SubmissionAuthorizationModeView & {
      readonly readinessStatus: ManagedGateAssessment["readinessStatus"];
      readonly readinessReasonCodes: readonly string[];
      readonly evidenceProvenance: ManagedGateAssessment["evidenceProvenance"];
    };
  };
  readonly authorization: SubmissionAuthorizationSummary | null;
  readonly authorizations: readonly SubmissionAuthorizationSummary[];
  readonly handoff: SubmissionHandoffSummary | null;
  readonly handoffs: readonly SubmissionHandoffSummary[];
  readonly handoffEligibility: {
    readonly status: "eligible" | "not_eligible" | "unknown";
    readonly reasonCodes: readonly AuthorizationValidityReason[];
  };
  readonly externalRecords: readonly SubmissionExternalRecordSummary[];
  readonly submissionState: DerivedSubmissionState;
  readonly nextAction: SubmissionNextAction;
  readonly limits: {
    readonly maxAuthorizationsPerTarget: number;
    readonly maxHandoffsPerTarget: number;
    readonly maxExternalRecordsPerTarget: number;
  };
};

export type SubmissionAuthorizationServiceOptions = {
  readonly store: SubmissionAuthorizationStore;
  readonly readExactPackage: ExactPackageReader;
  readonly readManagedReadiness: ManagedReadinessReader;
  readonly handoffAuthority: HandoffAuthorityPort;
  readonly externalVerifier: ExternalVerifier;
  readonly now?: () => Date;
};

function iso(value: Date): string {
  return value.toISOString();
}

function requireScope(scope: AuthorizationScope): void {
  if (
    typeof scope.actorUserId !== "string" ||
    scope.actorUserId.length === 0 ||
    typeof scope.projectId !== "string" ||
    scope.projectId.length === 0 ||
    typeof scope.targetId !== "string" ||
    scope.targetId.length === 0 ||
    !isSubmissionTargetKind(scope.targetKind)
  ) {
    throw new SubmissionAuthorizationError("invalid_request");
  }
}

/** Maps a failed exact-package assessment onto a stable, non-leaking error code. */
function packageError(
  assessment: ExactPackageAssessment
): SubmissionAuthorizationError {
  const reasons = assessment.reasonCodes;
  if (reasons.includes("package_integrity_unverified")) {
    return new SubmissionAuthorizationError("package_integrity_unverified");
  }
  if (reasons.includes("package_not_current")) {
    return new SubmissionAuthorizationError("package_not_current");
  }
  if (reasons.includes("confirmation_not_finalized")) {
    return new SubmissionAuthorizationError("confirmation_not_finalized");
  }
  if (reasons.includes("confirmation_not_current")) {
    return new SubmissionAuthorizationError("confirmation_not_current");
  }
  if (reasons.includes("confirmation_missing")) {
    return new SubmissionAuthorizationError("confirmation_missing");
  }
  if (reasons.includes("confirmation_policy_unknown")) {
    return new SubmissionAuthorizationError("confirmation_policy_unknown");
  }
  if (reasons.includes("package_freshness_lost")) {
    return new SubmissionAuthorizationError("package_not_current");
  }
  return new SubmissionAuthorizationError("source_unavailable");
}

/** Maps a failed managed gate onto a stable error code. */
function managedError(
  gate: ManagedGateAssessment
): SubmissionAuthorizationError {
  if (gate.status === "unknown") {
    return new SubmissionAuthorizationError("readiness_unknown");
  }
  if (gate.reasonCodes.includes("professional_credential_unverified")) {
    return new SubmissionAuthorizationError(
      "professional_credential_unverified"
    );
  }
  if (gate.reasonCodes.includes("professional_authority_denied")) {
    return new SubmissionAuthorizationError("professional_authority_denied");
  }
  if (gate.reasonCodes.includes("professional_review_not_approved")) {
    return new SubmissionAuthorizationError("professional_review_missing");
  }
  return new SubmissionAuthorizationError("readiness_not_ready");
}

export function createSubmissionAuthorizationService(
  options: SubmissionAuthorizationServiceOptions
) {
  const {
    store,
    readExactPackage,
    readManagedReadiness,
    handoffAuthority,
    externalVerifier,
  } = options;
  const now = options.now ?? (() => new Date());

  /**
   * Current customer authorization, derived only from persisted Project state. A
   * staff account is never granted private application access here.
   */
  async function requireCustomer(
    input: { readonly actorUserId: string; readonly projectId: string },
    mode: "read" | "write"
  ): Promise<AuthorizationActorContext> {
    const context = await store.readActorContext({ ...input });
    if (!context.registeredCustomer || context.staff) {
      throw new SubmissionAuthorizationError("actor_not_eligible");
    }
    if (context.project === null) {
      throw new SubmissionAuthorizationError("project_not_found");
    }
    if (
      context.membershipStatus !== "owner" &&
      context.membershipStatus !== "active_member"
    ) {
      throw new SubmissionAuthorizationError("project_forbidden");
    }
    if (mode === "write" && context.project.status !== "active") {
      throw new SubmissionAuthorizationError("project_closed");
    }
    return context;
  }

  /**
   * Staff authorization for handoff actions: the account must be staff, must have an
   * active Project assignment and must be explicitly allowed by the authority port.
   * The production port is unavailable, so this can only ever fail closed today.
   */
  async function requireStaff(
    input: {
      readonly actorUserId: string;
      readonly projectId: string;
      readonly targetKind: ManagedTargetKind;
      readonly targetId: string;
    },
    action: "accept_handoff" | "record_external_evidence"
  ): Promise<AuthorizationActorContext> {
    const context = await store.readActorContext({ ...input });
    if (context.project === null) {
      throw new SubmissionAuthorizationError("project_not_found");
    }
    if (!context.staff) {
      throw new SubmissionAuthorizationError("actor_not_staff");
    }
    if (context.project.status !== "active") {
      throw new SubmissionAuthorizationError("project_closed");
    }
    const decision = handoffAuthority.decide({
      action,
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      staffAssignmentId: context.staffAssignment?.id ?? null,
      staffAssignmentStatus: context.staffAssignment?.status ?? "missing",
      staffRole: context.staffRole,
      targetId: input.targetId,
      targetKind: input.targetKind,
    });
    if (decision.status === "unavailable") {
      throw new SubmissionAuthorizationError(
        "professional_authority_unavailable"
      );
    }
    if (decision.status === "denied") {
      throw new SubmissionAuthorizationError("handoff_actor_not_authorized");
    }
    if (context.staffAssignment?.status !== "active") {
      // An authority decision alone is insufficient: the Assignment must be current.
      throw new SubmissionAuthorizationError("handoff_actor_not_authorized");
    }
    return context;
  }

  async function readPackageState(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
  }): Promise<ExactPackageState | null> {
    try {
      return await readExactPackage(input);
    } catch {
      // An unreadable package state is `unknown`, never "no package".
      return null;
    }
  }

  function assessPackage(
    state: ExactPackageState | null,
    packageVersionId: string | null
  ): ExactPackageAssessment {
    if (state === null) {
      return {
        effectiveConfirmationIds: [],
        package: null,
        reasonCodes: ["source_unavailable"],
        staleReasonCodes: [],
        status: "unknown",
      };
    }
    const targetPackageId = packageVersionId ?? state.currentPackageVersionId;
    return assessExactPackage({
      currentPackageVersionId: state.currentPackageVersionId,
      packageVersionId: targetPackageId ?? "",
      packages: state.packages,
      requiredConfirmations: AUTHORIZATION_REQUIRED_CONFIRMATIONS,
    });
  }

  async function readGate(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
    readonly targetVersion: number;
    readonly targetSha256: string;
  }): Promise<ManagedGateAssessment> {
    try {
      return assessManagedGate(await readManagedReadiness(input));
    } catch {
      return assessManagedGate("unavailable");
    }
  }

  function summary(
    record: SubmissionAuthorizationRecord,
    validity: {
      readonly status: AuthorizationValidityStatus;
      readonly reasonCodes: readonly AuthorizationValidityReason[];
    }
  ): SubmissionAuthorizationSummary {
    return {
      acknowledgedDisclosures: [...record.acknowledgedDisclosures],
      authorizationId: record.id,
      authorizationType: record.authorizationType,
      authorizedAt: iso(record.authorizedAt),
      bindingSha256: record.bindingSha256,
      disclosurePolicyVersion: record.disclosurePolicyVersion,
      manifestSha256: record.manifestSha256,
      mode: authorizationMode(record.authorizationType),
      packageVersion: record.packageVersion,
      packageVersionId: record.packageVersionId,
      targetVersion: record.targetVersion,
      validity,
    };
  }

  function validityOf(
    record: SubmissionAuthorizationRecord,
    assessment: ExactPackageAssessment,
    gate: ManagedGateAssessment
  ) {
    return assessAuthorizationValidity({
      assessment,
      authorization: {
        acknowledgedDisclosures: record.acknowledgedDisclosures,
        authorizationId: record.id,
        authorizationType: record.authorizationType,
        disclosurePolicyVersion: record.disclosurePolicyVersion,
        manifestSha256: record.manifestSha256,
        packageVersion: record.packageVersion,
        packageVersionId: record.packageVersionId,
        targetVersion: record.targetVersion,
      },
      managed:
        record.authorizationType === "managed_service_professional_handoff"
          ? gate
          : null,
    });
  }

  function handoffSummary(
    record: SubmissionHandoffRecord,
    events: readonly SubmissionHandoffEventRecord[]
  ): SubmissionHandoffSummary {
    return {
      authorizationId: record.authorizationId,
      createdAt: iso(record.createdAt),
      handoffId: record.id,
      history: events
        .filter((event) => event.handoffId === record.id)
        .map((event) => ({
          actorUserId: event.actorUserId,
          at: iso(event.createdAt),
          reasonCode: event.reasonCode,
          status: event.status,
        })),
      manifestSha256: record.manifestSha256,
      packageVersion: record.packageVersion,
      packageVersionId: record.packageVersionId,
      recipientUserId: record.recipientUserId,
      requestedByUserId: record.requestedByUserId,
      revision: record.revision,
      status: record.status,
      updatedAt: iso(record.updatedAt),
    };
  }

  function externalSummary(
    record: SubmissionExternalRecord,
    packageVersions: ReadonlyMap<string, number>
  ): SubmissionExternalRecordSummary {
    return {
      channel: record.channel,
      handoffId: record.handoffId,
      kind: record.kind,
      occurredAt: record.occurredAt,
      outcomeCode: record.outcomeCode,
      packageVersion: packageVersions.get(record.packageVersionId) ?? 0,
      recordId: record.id,
      recordedAt: iso(record.createdAt),
      reference: record.reference,
      provenance: record.provenance,
      verification: record.verification,
    };
  }

  /**
   * The newest effective authorization wins; otherwise the newest record is shown.
   *
   * Ties are broken deterministically: a managed authorization outranks a
   * self-service one for the same package version, because it is the stronger of two
   * coexisting decisions and is what the handoff path depends on. History is never
   * collapsed - every record remains in `authorizations`.
   */
  function pickAuthorization(
    records: readonly SubmissionAuthorizationRecord[],
    validity: ReadonlyMap<string, { status: AuthorizationValidityStatus }>
  ): SubmissionAuthorizationRecord | null {
    const rank = (record: SubmissionAuthorizationRecord): number =>
      record.authorizationType === "managed_service_professional_handoff"
        ? 0
        : 1;
    const newest = [...records].sort(
      (left, right) =>
        right.authorizedAt.getTime() - left.authorizedAt.getTime() ||
        rank(left) - rank(right) ||
        left.id.localeCompare(right.id)
    );
    return (
      newest.find(
        (record) => validity.get(record.id)?.status === "effective"
      ) ??
      newest.at(0) ??
      null
    );
  }

  /**
   * The durable-write guard. `allowAssignedStaff` is used for staff transitions, and
   * the repository re-derives the same authority inside the transaction.
   */
  function guard(
    actorUserId: string,
    allowAssignedStaff = false
  ): AuthorizationWriteGuard {
    return { actorUserId, allowAssignedStaff, requireActiveProject: true };
  }

  function authorizationsFor(
    scope: AuthorizationScope
  ): Promise<readonly SubmissionAuthorizationRecord[]> {
    return store.listAuthorizations({
      projectId: scope.projectId,
      targetId: scope.targetId,
      targetKind: scope.targetKind,
    });
  }

  /**
   * Read-only workspace: the current exact package, both mode availabilities, the
   * authorization history with live validity, the handoff state and every external
   * record with its provenance. No write happens here.
   */
  async function get(
    scope: AuthorizationScope
  ): Promise<SubmissionAuthorizationView> {
    requireScope(scope);
    await requireCustomer(scope, "read");
    const [state, authorizationRecords, handoffRecords, externalRecords] =
      await Promise.all([
        readPackageState(scope),
        authorizationsFor(scope),
        store.listHandoffs({ ...scope }),
        store.listExternalRecords({ ...scope }),
      ]);
    const assessment = assessPackage(
      state,
      state?.currentPackageVersionId ?? null
    );
    const pkg = assessment.package;
    const gate =
      pkg === null
        ? assessManagedGate("unavailable")
        : await readGate({
            actorUserId: scope.actorUserId,
            projectId: scope.projectId,
            targetId: scope.targetId,
            targetKind: scope.targetKind,
            targetSha256: pkg.manifestSha256,
            targetVersion: pkg.targetVersion,
          });
    const validity = new Map(
      authorizationRecords.map((record) => [
        record.id,
        validityOf(record, assessment, gate),
      ])
    );
    const primaryAuthorization = pickAuthorization(
      authorizationRecords,
      validity
    );
    const primaryValidity = primaryAuthorization
      ? (validity.get(primaryAuthorization.id) ?? null)
      : null;
    const events = await Promise.all(
      handoffRecords.map((handoff) =>
        store.listHandoffEvents({
          handoffId: handoff.id,
          projectId: scope.projectId,
        })
      )
    );
    const handoffs = handoffRecords.map((handoff, index) =>
      handoffSummary(handoff, events[index] ?? [])
    );
    const byRecency = [...handoffs].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
    const primaryHandoff =
      byRecency.find(
        (handoff) =>
          handoff.status === "accepted" || handoff.status === "requested"
      ) ??
      byRecency.at(0) ??
      null;
    const eligibility = assessHandoffEligibility({
      authorization: primaryValidity,
      authorizationType: primaryAuthorization?.authorizationType ?? null,
      managed: gate,
    });
    const packageVersions = new Map(
      (state?.packages ?? []).map((entry) => [
        entry.packageVersionId,
        entry.version,
      ])
    );
    const submissionState = derivedSubmissionState(
      externalRecords.map((record) => ({
        kind: record.kind,
        packageVersionId: record.packageVersionId,
        verification: record.verification,
      })),
      state?.currentPackageVersionId ?? null
    );
    const unknownValidity = { reasonCodes: [], status: "unknown" as const };
    return {
      authorization: primaryAuthorization
        ? summary(primaryAuthorization, primaryValidity ?? unknownValidity)
        : null,
      authorizations: [...authorizationRecords]
        .sort(
          (left, right) =>
            right.authorizedAt.getTime() - left.authorizedAt.getTime()
        )
        .map((record) =>
          summary(record, validity.get(record.id) ?? unknownValidity)
        ),
      currentManifestSha256: pkg?.manifestSha256 ?? null,
      currentPackageVersion: pkg?.version ?? null,
      currentPackageVersionId: pkg?.packageVersionId ?? null,
      disclosurePolicyVersion:
        SUBMISSION_AUTHORIZATION_DISCLOSURE_POLICY_VERSION,
      externalRecords: externalRecords
        .map((record) => externalSummary(record, packageVersions))
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
      handoff: primaryHandoff,
      handoffEligibility: eligibility,
      handoffs,
      limits: {
        maxAuthorizationsPerTarget:
          SUBMISSION_AUTHORIZATION_LIMITS.maxAuthorizationsPerTarget,
        maxExternalRecordsPerTarget:
          SUBMISSION_AUTHORIZATION_LIMITS.maxExternalRecordsPerTarget,
        maxHandoffsPerTarget:
          SUBMISSION_AUTHORIZATION_LIMITS.maxHandoffsPerTarget,
      },
      modes: {
        managed_service: {
          available:
            assessment.status === "valid" && gate.status === "effective",
          evidenceProvenance: gate.evidenceProvenance,
          readinessReasonCodes: gate.readinessReasonCodes,
          readinessStatus: gate.readinessStatus,
          reasonCodes: [...assessment.reasonCodes, ...gate.reasonCodes],
          requiredDisclosures: requiredDisclosures(
            "managed_service_professional_handoff"
          ),
        },
        self_service: {
          available: assessment.status === "valid",
          reasonCodes: [...assessment.reasonCodes],
          requiredDisclosures: requiredDisclosures(
            "self_service_external_submission"
          ),
        },
      },
      nextAction: nextActionFor({
        assessment,
        gate,
        primaryAuthorization,
        primaryHandoff,
        primaryValidity,
        submissionState,
      }),
      package: {
        effectiveConfirmationIds: assessment.effectiveConfirmationIds,
        reasonCodes: assessment.reasonCodes,
        staleReasonCodes: assessment.staleReasonCodes,
        status: assessment.status,
      },
      policyVersion: SUBMISSION_AUTHORIZATION_POLICY_VERSION,
      projectId: scope.projectId,
      schemaVersion: SUBMISSION_AUTHORIZATION_SCHEMA,
      submissionState,
      targetId: scope.targetId,
      targetKind: scope.targetKind,
    };
  }

  /**
   * Record one immutable authorization bound to one exact package version.
   *
   * The package version, digest and target version are re-derived from the M8.1
   * service; the browser only names which package it is looking at, and a mismatch
   * is refused rather than corrected.
   */
  async function recordAuthorization(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
    readonly packageVersionId: string;
    readonly authorizationType: SubmissionAuthorizationType;
    readonly acknowledgedDisclosures: readonly unknown[];
    readonly operationId: string;
  }): Promise<{
    readonly replayed: boolean;
    readonly authorization: SubmissionAuthorizationSummary;
  }> {
    if (
      !isSubmissionPackageUuid(input.packageVersionId) ||
      !isSubmissionPackageUuid(input.targetId) ||
      !isSubmissionTargetKind(input.targetKind) ||
      !isSubmissionAuthorizationType(input.authorizationType)
    ) {
      throw new SubmissionAuthorizationError("invalid_request");
    }
    const operationId = normalizeSubmissionOperationId(input.operationId);
    await requireCustomer(input, "write");
    const scope: AuthorizationScope = {
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      targetId: input.targetId,
      targetKind: input.targetKind,
    };
    const state = await readPackageState(scope);
    const assessment = assessPackage(state, input.packageVersionId);
    if (assessment.status !== "valid" || assessment.package === null) {
      throw packageError(assessment);
    }
    const pkg = assessment.package;
    const required = requiredDisclosures(input.authorizationType);
    const missing = missingDisclosures({
      acknowledged: input.acknowledgedDisclosures,
      required,
    });
    if (missing.length > 0) {
      throw new SubmissionAuthorizationError("disclosure_not_acknowledged");
    }
    const gate =
      input.authorizationType === "managed_service_professional_handoff"
        ? await readGate({
            actorUserId: input.actorUserId,
            projectId: input.projectId,
            targetId: input.targetId,
            targetKind: input.targetKind,
            targetSha256: pkg.manifestSha256,
            targetVersion: pkg.targetVersion,
          })
        : assessManagedGate("unavailable");
    if (
      input.authorizationType === "managed_service_professional_handoff" &&
      gate.status !== "effective"
    ) {
      throw managedError(gate);
    }
    const binding: SubmissionAuthorizationBinding = {
      actorUserId: input.actorUserId,
      authorizationType: input.authorizationType,
      disclosurePolicyVersion:
        SUBMISSION_AUTHORIZATION_DISCLOSURE_POLICY_VERSION,
      manifestSha256: pkg.manifestSha256,
      packageVersion: pkg.version,
      packageVersionId: pkg.packageVersionId,
      projectId: input.projectId,
      targetId: input.targetId,
      targetKind: input.targetKind,
      targetVersion: pkg.targetVersion,
    };
    const bindingSha256 = authorizationBindingSha256(binding);
    const requestSha256 = authorizationDigest({
      acknowledgedDisclosures: [...required],
      action: "authorize",
      bindingSha256,
      operationId,
    });
    const existing = await store.findAuthorizationOperation({
      operationId,
      projectId: input.projectId,
    });
    if (existing) {
      if (existing.requestSha256 !== requestSha256) {
        throw new SubmissionAuthorizationError("idempotency_conflict");
      }
      return {
        authorization: summary(
          existing,
          validityOf(existing, assessment, gate)
        ),
        replayed: true,
      };
    }
    const records = await authorizationsFor(scope);
    const duplicate = records.find(
      (record) =>
        record.bindingSha256 === bindingSha256 &&
        record.authorizationType === input.authorizationType
    );
    if (duplicate) {
      // Repeating the exact same authorization is a replay, not a second decision.
      return {
        authorization: summary(
          duplicate,
          validityOf(duplicate, assessment, gate)
        ),
        replayed: true,
      };
    }
    if (
      records.length >=
      SUBMISSION_AUTHORIZATION_LIMITS.maxAuthorizationsPerTarget
    ) {
      throw new SubmissionAuthorizationError("limit_exceeded");
    }
    const values: NewSubmissionAuthorizationValues = {
      acknowledgedDisclosures: [...required],
      authorizationType: input.authorizationType,
      bindingSha256,
      disclosurePolicyVersion:
        SUBMISSION_AUTHORIZATION_DISCLOSURE_POLICY_VERSION,
      id: randomUUID(),
      manifestSha256: pkg.manifestSha256,
      packageVersion: pkg.version,
      packageVersionId: pkg.packageVersionId,
      targetId: input.targetId,
      targetKind: input.targetKind,
      targetVersion: pkg.targetVersion,
    };
    let written: Awaited<
      ReturnType<SubmissionAuthorizationStore["insertAuthorization"]>
    >;
    try {
      written = await store.insertAuthorization({
        guard: guard(input.actorUserId),
        operation: {
          actorUserId: input.actorUserId,
          operationId,
          requestSha256,
        },
        projectId: input.projectId,
        values,
      });
    } catch (error) {
      if (
        error instanceof SubmissionAuthorizationError &&
        error.code === "integrity_conflict"
      ) {
        // A concurrent duplicate lost the unique-binding race. The winner is the
        // recorded decision, so both callers observe the same one.
        const winner = (await authorizationsFor(scope)).find(
          (record) => record.bindingSha256 === bindingSha256
        );
        if (winner) {
          return {
            authorization: summary(
              winner,
              validityOf(winner, assessment, gate)
            ),
            replayed: true,
          };
        }
      }
      throw error;
    }
    // Re-derive validity from the state that exists *after* the write. A dependency
    // that changed between the preliminary read and the commit therefore never
    // produces an optimistic "effective" answer.
    const after = await readPackageState(scope);
    const afterAssessment = assessPackage(
      after,
      written.value.packageVersionId
    );
    const afterGate =
      input.authorizationType === "managed_service_professional_handoff"
        ? await readGate({
            actorUserId: input.actorUserId,
            projectId: input.projectId,
            targetId: input.targetId,
            targetKind: input.targetKind,
            targetSha256: pkg.manifestSha256,
            targetVersion: pkg.targetVersion,
          })
        : assessManagedGate("unavailable");
    return {
      authorization: summary(
        written.value,
        validityOf(written.value, afterAssessment, afterGate)
      ),
      replayed: written.replayed,
    };
  }

  function authorizeSelfService(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
    readonly packageVersionId: string;
    readonly acknowledgedDisclosures: readonly unknown[];
    readonly operationId: string;
  }) {
    return recordAuthorization({
      ...input,
      authorizationType: "self_service_external_submission",
    });
  }

  function authorizeManagedService(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
    readonly packageVersionId: string;
    readonly acknowledgedDisclosures: readonly unknown[];
    readonly operationId: string;
  }) {
    return recordAuthorization({
      ...input,
      authorizationType: "managed_service_professional_handoff",
    });
  }

  /**
   * Re-derive the effective managed authorization and M4 gate for one exact package.
   * Used by every handoff transition, so a cached green result is never reused.
   */
  async function managedContext(scope: AuthorizationScope) {
    const state = await readPackageState(scope);
    const assessment = assessPackage(
      state,
      state?.currentPackageVersionId ?? null
    );
    const pkg = assessment.package;
    const gate =
      pkg === null
        ? assessManagedGate("unavailable")
        : await readGate({
            actorUserId: scope.actorUserId,
            projectId: scope.projectId,
            targetId: scope.targetId,
            targetKind: scope.targetKind,
            targetSha256: pkg.manifestSha256,
            targetVersion: pkg.targetVersion,
          });
    const records = await authorizationsFor(scope);
    const validity = new Map(
      records.map((record) => [record.id, validityOf(record, assessment, gate)])
    );
    const managed = records
      .filter(
        (record) =>
          record.authorizationType === "managed_service_professional_handoff" &&
          validity.get(record.id)?.status === "effective"
      )
      .sort(
        (left, right) =>
          right.authorizedAt.getTime() - left.authorizedAt.getTime()
      )
      .at(0);
    return { assessment, gate, managed, pkg, records, state, validity };
  }

  /**
   * Request a human handoff for the current exact package.
   *
   * Requires an *effective managed* authorization and a satisfied M4 predicate set,
   * both re-derived now. A self-service authorization can never produce a handoff.
   */
  async function requestHandoff(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
    readonly packageVersionId: string;
    readonly recipientUserId?: string | null;
    readonly operationId: string;
  }): Promise<{
    readonly replayed: boolean;
    readonly handoff: SubmissionHandoffSummary;
  }> {
    if (
      !isSubmissionPackageUuid(input.packageVersionId) ||
      !isSubmissionPackageUuid(input.targetId) ||
      !isSubmissionTargetKind(input.targetKind)
    ) {
      throw new SubmissionAuthorizationError("invalid_request");
    }
    const recipient = input.recipientUserId ?? null;
    if (recipient !== null && !isSubmissionPackageUuid(recipient)) {
      throw new SubmissionAuthorizationError("invalid_request");
    }
    const operationId = normalizeSubmissionOperationId(input.operationId);
    await requireCustomer(input, "write");
    const scope: AuthorizationScope = {
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      targetId: input.targetId,
      targetKind: input.targetKind,
    };
    const state = await readPackageState(scope);
    const assessment = assessPackage(state, input.packageVersionId);
    if (assessment.status !== "valid" || assessment.package === null) {
      throw packageError(assessment);
    }
    const pkg = assessment.package;
    const context = await managedContext(scope);
    const managed = context.managed;
    if (
      managed === undefined ||
      managed.packageVersionId !== input.packageVersionId
    ) {
      throw new SubmissionAuthorizationError("authorization_not_current");
    }
    const eligibility = assessHandoffEligibility({
      authorization: context.validity.get(managed.id) ?? null,
      authorizationType: managed.authorizationType,
      managed: context.gate,
    });
    if (eligibility.status === "unknown") {
      throw new SubmissionAuthorizationError("readiness_unknown");
    }
    if (eligibility.status !== "eligible") {
      throw context.gate.status === "effective"
        ? new SubmissionAuthorizationError("authorization_not_current")
        : managedError(context.gate);
    }
    const requestSha256 = authorizationDigest({
      action: "request_handoff",
      authorizationId: managed.id,
      operationId,
      packageVersionId: pkg.packageVersionId,
      recipientUserId: recipient,
    });
    const existingOperation = await store.findHandoffOperation({
      operationId,
      projectId: input.projectId,
    });
    if (existingOperation) {
      if (existingOperation.requestSha256 !== requestSha256) {
        throw new SubmissionAuthorizationError("idempotency_conflict");
      }
      return {
        handoff: handoffSummary(
          existingOperation,
          await store.listHandoffEvents({
            handoffId: existingOperation.id,
            projectId: input.projectId,
          })
        ),
        replayed: true,
      };
    }
    const handoffs = await store.listHandoffs({ ...scope });
    const active = handoffs.find(
      (handoff) =>
        handoff.packageVersionId === pkg.packageVersionId &&
        (handoff.status === "requested" || handoff.status === "accepted")
    );
    if (active) {
      // One live handoff per package version: a second request would duplicate a
      // human action, so the existing handoff is returned instead.
      return {
        handoff: handoffSummary(
          active,
          await store.listHandoffEvents({
            handoffId: active.id,
            projectId: input.projectId,
          })
        ),
        replayed: true,
      };
    }
    if (
      handoffs.length >= SUBMISSION_AUTHORIZATION_LIMITS.maxHandoffsPerTarget
    ) {
      throw new SubmissionAuthorizationError("limit_exceeded");
    }
    const written = await store.insertHandoff({
      guard: guard(input.actorUserId),
      operation: { actorUserId: input.actorUserId, operationId, requestSha256 },
      projectId: input.projectId,
      values: {
        authorizationId: managed.id,
        id: randomUUID(),
        manifestSha256: pkg.manifestSha256,
        packageVersion: pkg.version,
        packageVersionId: pkg.packageVersionId,
        recipientUserId: recipient,
        targetId: input.targetId,
        targetKind: input.targetKind,
      },
    });
    return {
      handoff: handoffSummary(
        written.value,
        await store.listHandoffEvents({
          handoffId: written.value.id,
          projectId: input.projectId,
        })
      ),
      replayed: written.replayed,
    };
  }

  /**
   * Apply one handoff transition.
   *
   * `accept`/`decline` require an authorized, currently assigned staff actor and - for
   * acceptance - a re-proved exact package, effective managed authorization and M4
   * gate. `cancel` requires the requesting customer. Every transition is a
   * compare-and-set, so a concurrent change is a conflict and never an overwrite.
   */
  async function transitionHandoff(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
    readonly handoffId: string;
    readonly action: Extract<
      SubmissionHandoffTransitionRequest,
      "accept" | "decline" | "cancel"
    >;
    readonly expectedRevision: number;
    readonly operationId: string;
    readonly reasonCode?: string | null;
  }): Promise<{
    readonly handoff: SubmissionHandoffSummary;
    readonly replayed: boolean;
  }> {
    if (
      !isSubmissionPackageUuid(input.handoffId) ||
      !isSubmissionPackageUuid(input.targetId) ||
      !isSubmissionTargetKind(input.targetKind) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1
    ) {
      throw new SubmissionAuthorizationError("invalid_request");
    }
    // Validated for shape only: a transition is identified by the handoff revision,
    // never by a client-supplied id that could be replayed against another handoff.
    normalizeSubmissionOperationId(input.operationId);
    const scope: AuthorizationScope = {
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      targetId: input.targetId,
      targetKind: input.targetKind,
    };
    const toStatus = HANDOFF_REQUEST_TARGET_STATUS[input.action];
    const handoffs = await store.listHandoffs({ ...scope });
    const handoff = handoffs.find((entry) => entry.id === input.handoffId);
    if (!handoff) {
      throw new SubmissionAuthorizationError("handoff_not_found");
    }
    if (input.action === "cancel") {
      const context = await requireCustomer(input, "write");
      if (
        handoff.requestedByUserId !== input.actorUserId &&
        context.membershipStatus !== "owner"
      ) {
        throw new SubmissionAuthorizationError("handoff_actor_not_authorized");
      }
    } else {
      await requireStaff(input, "accept_handoff");
      if (
        handoff.recipientUserId !== null &&
        handoff.recipientUserId !== input.actorUserId
      ) {
        // A handoff names one recipient; an unrelated assigned staff member may not
        // take it over, because the customer consented to that named person.
        throw new SubmissionAuthorizationError("handoff_actor_not_authorized");
      }
    }
    const replay = async (): Promise<{
      readonly handoff: SubmissionHandoffSummary;
      readonly replayed: boolean;
    }> => ({
      handoff: handoffSummary(
        handoff,
        await store.listHandoffEvents({
          handoffId: handoff.id,
          projectId: input.projectId,
        })
      ),
      replayed: true,
    });
    if (handoff.status === toStatus) {
      // Already in the requested state: this is a replay, never a second human
      // action. A different target state is a conflict below.
      return await replay();
    }
    if (handoff.revision !== input.expectedRevision) {
      throw new SubmissionAuthorizationError("revision_conflict");
    }
    if (!handoffTransitionAllowed(handoff.status, toStatus)) {
      throw new SubmissionAuthorizationError("handoff_state_conflict");
    }
    if (input.action === "accept") {
      // The exact package and the M4 engagement belong to the customer who requested the
      // handoff. The M8.1 package view is customer-authorized and deliberately refuses a
      // staff actor, so reading it under the staff identity always failed closed and no
      // human could ever accept. Staff authorization is unchanged: requireStaff (role +
      // active assignment + authority decision) and the recipient check above still gate
      // this action, and no package content is returned to the staff member.
      const context = await managedContext({
        ...scope,
        actorUserId: handoff.requestedByUserId,
      });
      if (
        context.pkg === null ||
        context.pkg.packageVersionId !== handoff.packageVersionId ||
        context.pkg.manifestSha256 !== handoff.manifestSha256
      ) {
        throw new SubmissionAuthorizationError("handoff_not_current");
      }
      const managed = context.managed;
      const eligibility = assessHandoffEligibility({
        authorization:
          managed === undefined
            ? null
            : (context.validity.get(managed.id) ?? null),
        authorizationType: managed?.authorizationType ?? null,
        managed: context.gate,
      });
      if (eligibility.status === "unknown") {
        throw new SubmissionAuthorizationError("readiness_unknown");
      }
      if (eligibility.status !== "eligible") {
        throw context.gate.status === "effective"
          ? new SubmissionAuthorizationError("handoff_not_current")
          : managedError(context.gate);
      }
      if (managed === undefined || managed.id !== handoff.authorizationId) {
        throw new SubmissionAuthorizationError("handoff_not_current");
      }
    }
    const transitioned = await store.transitionHandoff({
      actorUserId: input.actorUserId,
      eventId: randomUUID(),
      expectedRevision: input.expectedRevision,
      guard: guard(input.actorUserId, input.action !== "cancel"),
      handoffId: handoff.id,
      projectId: input.projectId,
      reasonCode: input.reasonCode ?? null,
      toStatus,
    });
    if (
      transitioned.status !== toStatus ||
      transitioned.revision !== handoff.revision + 1
    ) {
      throw new SubmissionAuthorizationError("integrity_conflict");
    }
    return {
      handoff: handoffSummary(
        transitioned,
        await store.listHandoffEvents({
          handoffId: transitioned.id,
          projectId: input.projectId,
        })
      ),
      replayed: false,
    };
  }

  /**
   * Record one external action or outcome with explicit provenance.
   *
   * The record's `verification` comes from the provenance and from an actual trusted
   * verifier, never from the caller's assertion and never from an authorization. In
   * production no verifier exists, so only unverified records can be produced.
   */
  async function recordExternalRecord(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
    readonly packageVersionId: string;
    readonly kind: unknown;
    readonly channel?: unknown;
    readonly outcomeCode?: unknown;
    readonly reference?: unknown;
    readonly provenance: unknown;
    readonly occurredAt?: string | null;
    readonly handoffId?: string | null;
    readonly operationId: string;
  }): Promise<{
    readonly replayed: boolean;
    readonly record: SubmissionExternalRecordSummary;
  }> {
    if (
      !isSubmissionPackageUuid(input.packageVersionId) ||
      !isSubmissionPackageUuid(input.targetId) ||
      !isSubmissionTargetKind(input.targetKind) ||
      !isExternalRecordKind(input.kind) ||
      !isExternalEvidenceProvenance(input.provenance)
    ) {
      throw new SubmissionAuthorizationError("invalid_request");
    }
    const channel = input.channel ?? null;
    if (channel !== null && !isExternalSubmissionChannel(channel)) {
      throw new SubmissionAuthorizationError("invalid_request");
    }
    const outcomeCode = input.outcomeCode ?? null;
    if (outcomeCode !== null && !isExternalOutcomeCode(outcomeCode)) {
      throw new SubmissionAuthorizationError("invalid_request");
    }
    const reference = input.reference ?? null;
    if (reference !== null && !isExternalReference(reference)) {
      throw new SubmissionAuthorizationError("invalid_request");
    }
    const handoffId = input.handoffId ?? null;
    if (handoffId !== null && !isSubmissionPackageUuid(handoffId)) {
      throw new SubmissionAuthorizationError("invalid_request");
    }
    const operationId = normalizeSubmissionOperationId(input.operationId);
    const occurredAt = input.occurredAt ?? now().toISOString();
    if (Number.isNaN(Date.parse(occurredAt))) {
      throw new SubmissionAuthorizationError("invalid_request");
    }
    const scope: AuthorizationScope = {
      actorUserId: input.actorUserId,
      projectId: input.projectId,
      targetId: input.targetId,
      targetKind: input.targetKind,
    };
    const context = await store.readActorContext({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
    });
    const isStaff = context.staff;
    if (isStaff) {
      await requireStaff(input, "record_external_evidence");
      if (input.provenance === "customer_reported") {
        // A staff record must carry staff provenance; mislabelling it would let an
        // internal note masquerade as the customer's own report.
        throw new SubmissionAuthorizationError("evidence_provenance_invalid");
      }
    } else {
      await requireCustomer(input, "write");
      if (input.provenance !== "customer_reported") {
        throw new SubmissionAuthorizationError("evidence_provenance_invalid");
      }
    }
    // A staff record is evaluated against the requesting customer's exact package and M4
    // engagement for the same reason as handoff acceptance: the M8.1 package view refuses
    // a staff actor. Staff authorization is unchanged (requireStaff above), and the
    // handoff acceptance + exact identity checks below still gate the write.
    const staffHandoff =
      isStaff && handoffId !== null
        ? ((await store.listHandoffs({ ...scope })).find(
            (entry) => entry.id === handoffId
          ) ?? null)
        : null;
    const evidenceScope: AuthorizationScope =
      isStaff && staffHandoff !== null
        ? { ...scope, actorUserId: staffHandoff.requestedByUserId }
        : scope;
    const state = await readPackageState(evidenceScope);
    const assessment = assessPackage(state, input.packageVersionId);
    if (assessment.status !== "valid" || assessment.package === null) {
      throw packageError(assessment);
    }
    const pkg = assessment.package;
    const live = await managedContext(evidenceScope);
    const effective = live.records.some(
      (record) => live.validity.get(record.id)?.status === "effective"
    );
    if (!effective) {
      throw new SubmissionAuthorizationError("authorization_not_current");
    }
    if (isStaff) {
      if (handoffId === null) {
        throw new SubmissionAuthorizationError("handoff_not_found");
      }
      const handoff = staffHandoff;
      if (!handoff) {
        throw new SubmissionAuthorizationError("handoff_not_found");
      }
      if (handoff.status !== "accepted") {
        throw new SubmissionAuthorizationError("handoff_state_conflict");
      }
      if (
        handoff.packageVersionId !== pkg.packageVersionId ||
        handoff.manifestSha256 !== pkg.manifestSha256
      ) {
        throw new SubmissionAuthorizationError("handoff_not_current");
      }
    }
    let trustedVerifierCode: string | null = null;
    if (input.provenance === "provider_verified") {
      if (reference === null) {
        throw new SubmissionAuthorizationError("evidence_provenance_invalid");
      }
      const verified = externalVerifier.verify({ kind: input.kind, reference });
      if (verified.status !== "verified") {
        throw new SubmissionAuthorizationError("evidence_verifier_unavailable");
      }
      trustedVerifierCode = verified.verifierCode;
    }
    const evidence = assessExternalEvidence({
      channel,
      kind: input.kind,
      outcomeCode,
      provenance: input.provenance,
      reference,
      trustedVerifierCode,
    });
    if (evidence.status === "reject") {
      throw new SubmissionAuthorizationError(evidence.reasonCode);
    }
    const requestSha256 = authorizationDigest({
      action: "record_external_action",
      channel,
      handoffId,
      kind: input.kind,
      occurredAt,
      operationId,
      outcomeCode,
      packageVersionId: pkg.packageVersionId,
      provenance: input.provenance,
      reference,
    });
    const existing = await store.findExternalRecordOperation({
      operationId,
      projectId: input.projectId,
    });
    if (existing) {
      if (existing.requestSha256 !== requestSha256) {
        throw new SubmissionAuthorizationError("idempotency_conflict");
      }
      return {
        record: externalSummary(
          existing,
          new Map([[pkg.packageVersionId, pkg.version]])
        ),
        replayed: true,
      };
    }
    const records = await store.listExternalRecords({ ...scope });
    if (
      records.length >=
      SUBMISSION_AUTHORIZATION_LIMITS.maxExternalRecordsPerTarget
    ) {
      throw new SubmissionAuthorizationError("limit_exceeded");
    }
    const written = await store.insertExternalRecord({
      guard: guard(input.actorUserId, isStaff),
      operation: { actorUserId: input.actorUserId, operationId, requestSha256 },
      projectId: input.projectId,
      values: {
        channel,
        handoffId,
        id: randomUUID(),
        kind: input.kind,
        occurredAt: new Date(occurredAt).toISOString(),
        outcomeCode,
        packageVersionId: pkg.packageVersionId,
        provenance: input.provenance,
        reference,
        targetId: input.targetId,
        targetKind: input.targetKind,
        verification: evidence.verification,
        verifierCode: evidence.verifierCode,
      },
    });
    return {
      record: externalSummary(
        written.value,
        new Map([[pkg.packageVersionId, pkg.version]])
      ),
      replayed: written.replayed,
    };
  }

  return {
    authorizeManagedService,
    authorizeSelfService,
    get,
    recordExternalRecord,
    requestHandoff,
    transitionHandoff,
  };
}

export type SubmissionAuthorizationService = ReturnType<
  typeof createSubmissionAuthorizationService
>;
