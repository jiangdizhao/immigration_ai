import type { ManagedTargetKind } from "@/lib/managed-target/policy";

/**
 * Phase 13 M8.2 - client access to the submission authorization surface.
 *
 * Deliberately thin, exactly like the M8.1 client: the server owns authorization,
 * exact-version binding, disclosure policy, handoff transitions and provenance. The
 * client can read the workspace and ask for one of five bounded actions. It never
 * computes a digest, a validity verdict, a verification level or a handoff state.
 */

export type AuthorizationValidityView = {
  readonly status: string;
  readonly reasonCodes: readonly string[];
};

export type AuthorizationSummaryView = {
  readonly authorizationId: string;
  readonly authorizationType: string;
  readonly mode: string;
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly manifestSha256: string;
  readonly disclosurePolicyVersion: string;
  readonly acknowledgedDisclosures: readonly string[];
  readonly bindingSha256: string;
  readonly authorizedAt: string;
  readonly validity: AuthorizationValidityView;
};

export type HandoffView = {
  readonly handoffId: string;
  readonly status: string;
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
    readonly status: string;
    readonly at: string;
    readonly actorUserId: string;
    readonly reasonCode: string | null;
  }[];
};

export type ExternalRecordView = {
  readonly recordId: string;
  readonly kind: string;
  readonly channel: string | null;
  readonly outcomeCode: string | null;
  readonly reference: string | null;
  readonly provenance: string;
  readonly verification: string;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly packageVersion: number;
  readonly handoffId: string | null;
};

export type SubmissionAuthorizationModeView = {
  readonly available: boolean;
  readonly reasonCodes: readonly string[];
  readonly requiredDisclosures: readonly string[];
  readonly readinessStatus?: string;
  readonly readinessReasonCodes?: readonly string[];
  readonly evidenceProvenance?: string;
};

export type SubmissionAuthorizationWorkspaceView = {
  readonly schemaVersion: string;
  readonly policyVersion: string;
  readonly disclosurePolicyVersion: string;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly currentPackageVersionId: string | null;
  readonly currentPackageVersion: number | null;
  readonly currentManifestSha256: string | null;
  readonly package: {
    readonly status: string;
    readonly reasonCodes: readonly string[];
    readonly staleReasonCodes: readonly string[];
    readonly effectiveConfirmationIds: readonly string[];
  };
  readonly modes: {
    readonly self_service: SubmissionAuthorizationModeView;
    readonly managed_service: SubmissionAuthorizationModeView;
  };
  readonly authorization: AuthorizationSummaryView | null;
  readonly authorizations: readonly AuthorizationSummaryView[];
  readonly handoff: HandoffView | null;
  readonly handoffs: readonly HandoffView[];
  readonly handoffEligibility: {
    readonly status: string;
    readonly reasonCodes: readonly string[];
  };
  readonly externalRecords: readonly ExternalRecordView[];
  readonly submissionState: string;
  readonly nextAction: string;
  readonly limits: {
    readonly maxAuthorizationsPerTarget: number;
    readonly maxHandoffsPerTarget: number;
    readonly maxExternalRecordsPerTarget: number;
  };
};

export function submissionAuthorizationPath(input: {
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
}): string {
  const query = new URLSearchParams({
    targetId: input.targetId,
    targetKind: input.targetKind,
  });
  return `/api/projects/${encodeURIComponent(input.projectId)}/submission-authorization?${query.toString()}`;
}

export function submissionAuthorizationActionPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/submission-authorization`;
}

/** Strict-enough parse: an unexpected shape is an error, never a silent default. */
export function parseSubmissionAuthorizationView(
  value: unknown
): SubmissionAuthorizationWorkspaceView | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const view = value as Record<string, unknown>;
  if (
    typeof view.projectId !== "string" ||
    typeof view.targetId !== "string" ||
    (view.targetKind !== "managed_school_application" &&
      view.targetKind !== "student_500_visa_application") ||
    typeof view.package !== "object" ||
    view.package === null ||
    typeof view.modes !== "object" ||
    view.modes === null ||
    !Array.isArray(view.authorizations) ||
    !Array.isArray(view.handoffs) ||
    !Array.isArray(view.externalRecords) ||
    typeof view.nextAction !== "string" ||
    typeof view.submissionState !== "string"
  ) {
    return null;
  }
  return view as unknown as SubmissionAuthorizationWorkspaceView;
}

/** What the customer may currently do, derived only from the server's view. */
export const AUTHORIZATION_ACTIONS = [
  "authorize_self_service",
  "authorize_managed_service",
  "record_external_record",
  "request_handoff",
] as const;
export type AuthorizationAction = (typeof AUTHORIZATION_ACTIONS)[number];

/**
 * The single honest action the surface may offer.
 *
 * A mode that is not available is never rendered as if a professional were ready, and
 * an action is never offered without an effective authorization for the current
 * package version.
 */
export function offeredActions(
  view: SubmissionAuthorizationWorkspaceView
): readonly AuthorizationAction[] {
  const actions: AuthorizationAction[] = [];
  if (view.modes.self_service.available) {
    actions.push("authorize_self_service");
  }
  if (view.modes.managed_service.available) {
    actions.push("authorize_managed_service");
  }
  const effective = view.authorization?.validity.status === "effective";
  if (!effective) {
    return actions;
  }
  actions.push("record_external_record");
  const handoffClosed =
    view.handoff === null ||
    view.handoff.status === "declined" ||
    view.handoff.status === "cancelled" ||
    view.handoff.status === "superseded";
  if (
    view.authorization?.mode === "managed_service" &&
    view.handoffEligibility.status === "eligible" &&
    handoffClosed
  ) {
    actions.push("request_handoff");
  }
  return actions;
}

/**
 * A handoff may be cancelled by the customer only while it is live. Acceptance is a
 * staff action and is never offered here.
 */
export function canCancelHandoff(
  view: SubmissionAuthorizationWorkspaceView
): boolean {
  return (
    view.handoff?.status === "requested" || view.handoff?.status === "accepted"
  );
}
