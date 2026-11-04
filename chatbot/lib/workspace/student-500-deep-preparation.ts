/**
 * Phase 13 M7 - client access to the deep-preparation view.
 *
 * Deliberately thin: the server owns scenario, tasks, proposals, consent and
 * authority. The client can only read the view and ask for one of the bounded M7
 * actions. It never computes readiness, approval, verification or progress.
 */

export type DeepPreparationTaskView = {
  readonly taskId: string;
  readonly kind: string;
  readonly reasonCode: string;
  readonly severity: "blocking" | "advisory";
  readonly requirementKeys: readonly string[];
  readonly gsSectionKeys: readonly string[];
  readonly action: string;
  readonly missingFactKeys: readonly string[];
  readonly questionKey: string | null;
};

export type DeepPreparationView = {
  readonly scenario: {
    readonly scenarioKinds: readonly string[];
    readonly complexity: "standard" | "complex" | "unresolved";
    readonly unresolvedRequirementKeys: readonly string[];
    readonly humanReviewRequired: true;
  };
  readonly tasks: readonly DeepPreparationTaskView[];
  readonly followUpQuestions: readonly {
    readonly questionId: string;
    readonly questionKey: string;
    readonly recordingMode: string;
  }[];
  readonly primaryNextAction: string | null;
  readonly proposal: {
    readonly proposalId: string;
    readonly status: string;
    readonly composerKind: string;
    readonly readable: boolean;
    readonly redactedSectionCount: number;
    readonly stale: boolean;
    readonly sections: readonly {
      readonly sectionKey: string;
      readonly heading: string;
      readonly text: string;
      readonly missingInformation: readonly string[];
      readonly unverifiedAssertionCount: number;
    }[];
    readonly statementsNeedingConfirmation: readonly {
      readonly sectionKey: string;
      readonly assertionText: string;
    }[];
    readonly acceptedDraftId: string | null;
  } | null;
  readonly editorialReviews: readonly {
    readonly reviewId: string;
    readonly reviewRound: number;
    readonly status: string;
    readonly draftVersion: number;
    readonly stale: boolean;
    readonly redacted: boolean;
    readonly professionalSignOff: "not_established";
    readonly reviewerCredentialStatus: string;
    readonly comments: readonly { readonly body: string }[];
    readonly proposedEdits: readonly {
      readonly sectionKey: string;
      readonly proposedText: string;
    }[];
  }[];
  readonly editorialAuthority: {
    readonly available: boolean;
    readonly credentialStatus: string;
  };
  /** Server-confirmed current draft identity; a review request must name it. */
  readonly currentDraft: {
    readonly draftId: string;
    readonly version: number;
    readonly contentSha256: string;
  } | null;
  readonly disclosureScope: {
    readonly readableFactReferenceIds: readonly string[];
    readonly factBearingDraftReferenceIds: readonly string[];
  };
  readonly submissionStatus: "not_submission_ready";
  readonly submissionActionsAvailable: readonly never[];
  readonly limits: {
    readonly maxTasks: number;
    readonly maxProposals: number;
    readonly maxEditorialRounds: number;
  };
};

export function deepPreparationPath(
  projectId: string,
  applicationId: string
): string {
  return `/api/projects/${encodeURIComponent(projectId)}/student-500-applications/${encodeURIComponent(applicationId)}/deep-preparation`;
}

export function parseDeepPreparationView(
  value: unknown
): DeepPreparationView | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.scenario !== "object" || record.scenario === null) {
    return null;
  }
  if (!Array.isArray(record.tasks) || !Array.isArray(record.editorialReviews)) {
    return null;
  }
  if (record.submissionStatus !== "not_submission_ready") {
    return null;
  }
  return value as DeepPreparationView;
}

/**
 * Which copy map a deep-preparation section uses.
 *
 * Resolved from the document language the server rendered, so the section follows the
 * real site locale instead of defaulting to English.
 */
export type DeepPreparationLocale = "en" | "zh-Hans" | "zh-Hant";

export function resolveDeepPreparationLocale(
  lang: string | null | undefined
): DeepPreparationLocale {
  const value = (lang ?? "").toLowerCase();
  if (value.startsWith("zh")) {
    return value.includes("hant") ||
      value.includes("tw") ||
      value.includes("hk")
      ? "zh-Hant"
      : "zh-Hans";
  }
  return "en";
}
