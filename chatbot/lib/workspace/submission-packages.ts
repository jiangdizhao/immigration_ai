/**
 * Phase 13 M8.1 - client access to the submission package surface.
 *
 * Deliberately thin: the server owns authorization, manifest identity, freshness and
 * confirmations. The client can only read the workspace and ask for one of the two
 * bounded actions. It never computes a digest, a readiness verdict or a staleness
 * decision, and it never sends an identity the server did not provide.
 */

import type { ManagedTargetKind } from "@/lib/managed-target/policy";

export type SubmissionPackageVersionView = {
  readonly packageVersionId: string;
  readonly version: number;
  readonly targetVersion: number;
  readonly manifestSha256: string;
  readonly createdAt: string;
  readonly integrityVerified: boolean;
  readonly manifest: unknown;
  readonly consentBindingSha256: string;
  readonly freshness: {
    readonly current: boolean;
    readonly reasonCodes: readonly string[];
  };
  readonly redactedFactReferenceCount: number;
  readonly confirmations: readonly SubmissionConfirmationView[];
};

export type SubmissionConfirmationView = {
  readonly confirmationId: string;
  readonly confirmationType: string;
  readonly packageVersion: number;
  readonly manifestSha256: string;
  readonly confirmedAt: string;
  readonly current: boolean;
  readonly invalidatedReasonCodes: readonly string[];
};

export type SubmissionReviewSection = {
  readonly key: string;
  readonly heading: string;
  readonly lines: readonly { readonly label: string; readonly value: string }[];
};

export type SubmissionReview = {
  readonly source: string;
  readonly title: string;
  readonly sections: readonly SubmissionReviewSection[];
  readonly gsDraft: {
    readonly draftId: string;
    readonly version: number;
    readonly contentSha256: string;
    readonly sections: readonly {
      readonly sectionKey: string;
      readonly heading: string;
      readonly text: string;
      readonly missingInformation: readonly string[];
    }[];
  } | null;
};

export type SubmissionWorkspaceView = {
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly targetVersion: number;
  readonly archived: boolean;
  readonly applicationStatus: string;
  readonly latestVersion: number;
  readonly packages: readonly SubmissionPackageVersionView[];
  readonly currentPackage: SubmissionPackageVersionView | null;
  readonly confirmations: readonly SubmissionConfirmationView[];
  readonly indicators: readonly {
    readonly kind: string;
    readonly code: string;
  }[];
  /** The exact pinned content to review, or `null` when it cannot be shown. */
  readonly review: SubmissionReview | null;
  readonly reviewUnavailableReason: string | null;
  readonly statements: readonly {
    readonly confirmationType: string;
    readonly policyVersion: string;
    readonly confirmable: boolean;
    readonly reasonCode: string | null;
  }[];
  readonly disclosures: readonly string[];
  readonly honesty: {
    readonly submissionStatus: string;
    readonly professionalReviewStatus: string;
    readonly legalCoverage: string;
    readonly documentsTrust: string;
  };
  readonly nextAction: string;
  readonly limits: { readonly maxVersionsPerTarget: number };
};

export function submissionPackagesPath(input: {
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
}): string {
  const query = new URLSearchParams({
    targetId: input.targetId,
    targetKind: input.targetKind,
  });
  return `/api/projects/${encodeURIComponent(input.projectId)}/submission-packages?${query.toString()}`;
}

export function submissionPackagesActionPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/submission-packages`;
}

/** Strict-enough parse: an unexpected shape is an error, never a silent default. */
export function parseSubmissionWorkspaceView(
  value: unknown
): SubmissionWorkspaceView | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const view = value as Record<string, unknown>;
  if (
    typeof view.projectId !== "string" ||
    typeof view.targetId !== "string" ||
    (view.targetKind !== "managed_school_application" &&
      view.targetKind !== "student_500_visa_application") ||
    typeof view.latestVersion !== "number" ||
    !Array.isArray(view.packages) ||
    !Array.isArray(view.confirmations) ||
    !Array.isArray(view.statements) ||
    !Array.isArray(view.disclosures) ||
    typeof view.nextAction !== "string"
  ) {
    return null;
  }
  return view as unknown as SubmissionWorkspaceView;
}

export type SubmissionPackageState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | {
      readonly message: string;
      readonly status: "unavailable";
    }
  | { readonly message: string; readonly status: "error" }
  | {
      readonly status: "ready";
      readonly pending: null | "build" | "confirm";
      readonly view: SubmissionWorkspaceView;
    };

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** One transport boundary: a rejection and a synchronous throw are the same thing. */
async function settle(run: () => Promise<Response>): Promise<Response | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

export type SubmissionPackageRequest = {
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
};

/**
 * Conflict-safe client controller.
 *
 *   - only the newest load may update state (monotonic sequence);
 *   - a mutation is refused while another is pending, so a double click cannot
 *     produce two operations with different ids;
 *   - a confirmation always sends the server-provided digest and version of the
 *     package the customer actually sees.
 */
export function createSubmissionPackageController(fetcher: Fetcher = fetch) {
  let sequence = 0;
  let pending: null | "build" | "confirm" = null;
  let operationSeq = 0;

  const operationId = (kind: string): string => {
    operationSeq += 1;
    return `m8ui-${kind}-${Date.now().toString(36)}-${operationSeq}`;
  };

  function readError(response: Response): string {
    if (response.status === 401) {
      return "unauthorized";
    }
    if (response.status === 404) {
      return "unavailable";
    }
    if (response.status === 503) {
      return "unavailable";
    }
    if (response.status === 409) {
      return "conflict";
    }
    if (response.status === 429) {
      return "limit";
    }
    return "error";
  }

  /** Read the workspace for one exact target. */
  async function load(
    request: SubmissionPackageRequest
  ): Promise<SubmissionPackageState> {
    sequence += 1;
    const current = sequence;
    const response = await settle(() =>
      fetcher(submissionPackagesPath(request), {
        cache: "no-store",
        headers: { accept: "application/json" },
      })
    );
    if (current !== sequence) {
      return { status: "idle" };
    }
    if (!response) {
      return { message: "error", status: "error" };
    }
    if (!response.ok) {
      const reason = await readError(response);
      return reason === "unavailable"
        ? { message: reason, status: "unavailable" }
        : { message: reason, status: "error" };
    }
    const parsed = parseSubmissionWorkspaceView(
      (await response.json().catch(() => null)) as unknown
    );
    if (!parsed) {
      return { message: "error", status: "error" };
    }
    return { pending: null, status: "ready", view: parsed };
  }

  return {
    load,

    /** Freeze a new immutable version of the exact current target. */
    async build(
      request: SubmissionPackageRequest
    ): Promise<SubmissionPackageState> {
      if (pending !== null) {
        return { message: "busy", status: "error" };
      }
      pending = "build";
      try {
        const response = await settle(() =>
          fetcher(submissionPackagesActionPath(request.projectId), {
            body: JSON.stringify({
              action: "build_package",
              operationId: operationId("build"),
              targetId: request.targetId,
              targetKind: request.targetKind,
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          })
        );
        if (!response) {
          return { message: "error", status: "error" };
        }
        if (!response.ok) {
          const reason = readError(response);
          return { message: reason, status: "error" };
        }
      } finally {
        pending = null;
      }
      return await load(request);
    },

    /**
     * Confirm one exact package version. The digest and target version must come from
     * the view the customer is looking at; the server re-derives the rest.
     */
    async confirm(input: {
      readonly request: SubmissionPackageRequest;
      readonly packageVersionId: string;
      readonly manifestSha256: string;
      readonly targetVersion: number;
      readonly confirmationType: string;
      readonly statementPolicyVersion: string;
      readonly consentGranted: boolean;
      readonly consentBinding: ConsentBindingKey;
    }): Promise<SubmissionPackageState> {
      if (!input.consentGranted) {
        return { message: "consent_required", status: "error" };
      }
      if (
        input.consentBinding.packageVersionId !== input.packageVersionId ||
        input.consentBinding.manifestSha256 !== input.manifestSha256 ||
        input.consentBinding.projectId !== input.request.projectId ||
        input.consentBinding.targetId !== input.request.targetId ||
        input.consentBinding.targetKind !== input.request.targetKind
      ) {
        // A consent for another version or target is never sent as this one.
        return { message: "consent_required", status: "error" };
      }
      if (pending !== null) {
        return { message: "busy", status: "error" };
      }
      pending = "confirm";
      try {
        const response = await settle(() =>
          fetcher(submissionPackagesActionPath(input.request.projectId), {
            body: JSON.stringify({
              action: "confirm_package",
              confirmationType: input.confirmationType,
              consentBinding: input.consentBinding,
              consentGranted: true,
              manifestSha256: input.manifestSha256,
              operationId: operationId("confirm"),
              packageVersionId: input.packageVersionId,
              statementPolicyVersion: input.statementPolicyVersion,
              targetId: input.request.targetId,
              targetKind: input.request.targetKind,
              targetVersion: input.targetVersion,
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          })
        );
        if (!response) {
          return { message: "error", status: "error" };
        }
        if (!response.ok) {
          const reason = readError(response);
          return { message: reason, status: "error" };
        }
      } finally {
        pending = null;
      }
      return await load(input.request);
    },
  };
}

export type SubmissionPackageController = ReturnType<
  typeof createSubmissionPackageController
>;

/**
 * The exact identity a customer consent is given for.
 *
 * It is derived only from what the server returned. Any change to the tuple drops the
 * consent, so a consent given for version 1 can never be replayed against version 2.
 */
export function consentBindingForView(input: {
  readonly projectId: string;
  readonly targetKind: string;
  readonly targetId: string;
  readonly packageVersionId: string;
  readonly manifestSha256: string;
  readonly statementPolicyVersion: string;
}) {
  return {
    manifestSha256: input.manifestSha256,
    packageVersionId: input.packageVersionId,
    projectId: input.projectId,
    statementPolicyVersion: input.statementPolicyVersion,
    targetId: input.targetId,
    targetKind: input.targetKind,
  };
}

export type ConsentBindingKey = ReturnType<typeof consentBindingForView>;

export function consentBindingKey(binding: ConsentBindingKey): string {
  return [
    binding.projectId,
    binding.targetKind,
    binding.targetId,
    binding.packageVersionId,
    binding.manifestSha256,
    binding.statementPolicyVersion,
  ].join("|");
}

/**
 * True when a stored consent may no longer be used: a different target, a different
 * package version or digest, a different statement policy, or no usable version at
 * all. The UI clears both checkboxes when this returns true.
 */
export function consentMustReset(input: {
  readonly consented: string | null;
  readonly current: string | null;
}): boolean {
  if (input.consented === null) {
    return false;
  }
  if (input.current === null) {
    return true;
  }
  return input.consented !== input.current;
}

/** The two customer confirmations are independent, exactly as the statements are. */
export const SUBMISSION_CONSENT_TYPES = [
  "package_content_review",
  "customer_declarations",
] as const;

export type SubmissionConsentType = (typeof SUBMISSION_CONSENT_TYPES)[number];

export type SubmissionConsentState = {
  readonly checks: Readonly<Record<SubmissionConsentType, boolean>>;
  /** The exact identity both checks belong to; `null` when nothing is checked. */
  readonly consentedKey: string | null;
};

export const EMPTY_SUBMISSION_CONSENT: SubmissionConsentState = {
  checks: { customer_declarations: false, package_content_review: false },
  consentedKey: null,
};

function clearConsent(): SubmissionConsentState {
  return EMPTY_SUBMISSION_CONSENT;
}

/**
 * One reducer for both checkboxes.
 *
 * A check binds the consent as a whole to `currentKey`, and an uncheck clears it. When
 * the identity is not available (`currentKey === null`) a check cannot be recorded at
 * all. Every transition therefore keeps both boxes on a single exact identity, so a
 * declarations-only consent for version 1 can never be reused for version 2, after a
 * rebuild, or after switching target.
 */
export function submissionConsentReducer(
  state: SubmissionConsentState,
  action: {
    readonly type: SubmissionConsentType;
    readonly checked: boolean;
    readonly currentKey: string | null;
  }
): SubmissionConsentState {
  if (!action.checked) {
    const checks = { ...state.checks, [action.type]: false };
    const anyChecked = SUBMISSION_CONSENT_TYPES.some((type) => checks[type]);
    return anyChecked
      ? { checks, consentedKey: state.consentedKey }
      : clearConsent();
  }
  if (action.currentKey === null) {
    // Nothing usable is on screen: a check cannot establish consent.
    return clearConsent();
  }
  if (state.consentedKey !== null && state.consentedKey !== action.currentKey) {
    // The identity moved. The old consent is gone and the new one starts here.
    return {
      checks: {
        customer_declarations: false,
        package_content_review: false,
        [action.type]: true,
      },
      consentedKey: action.currentKey,
    };
  }
  return {
    checks: { ...state.checks, [action.type]: true },
    consentedKey: action.currentKey,
  };
}

/**
 * Whether a confirmation button may be pressed.
 *
 * All three facts must agree: the server says the statement is confirmable, the exact
 * identity on screen still matches, and the customer's recorded consent belongs to
 * that identity. A stale consent (after a rebuild, a reloaded version, an invalidated
 * package or a target switch) can therefore never enable a button.
 */
export function submissionConsentAllows(input: {
  readonly consent: SubmissionConsentState;
  readonly type: SubmissionConsentType;
  readonly currentKey: string | null;
  readonly confirmable: boolean;
}): boolean {
  if (!input.confirmable || input.currentKey === null) {
    return false;
  }
  if (input.consent.consentedKey !== input.currentKey) {
    return false;
  }
  return input.consent.checks[input.type];
}
