import type {
  ProjectDocumentsSummary,
  SchoolApplicationsSummary,
  Student500Summary,
} from "./project-workspace-summary";

/**
 * Deterministic summarisers over the accepted service views.
 *
 * These are pure functions over already-authorized rows. They never fetch, never
 * guess and never upgrade a partial state into a complete one: an unrecognised
 * status is counted under `total` only, and archived records are excluded from the
 * "needs attention" counts so a dismissed record cannot look like open work.
 */

export type SchoolApplicationSummaryInput = {
  status: string;
  archivedAt?: string | null;
  missingDataCodes?: readonly string[];
  packageStale?: boolean;
};

export function summarizeSchoolApplications(
  rows: readonly SchoolApplicationSummaryInput[]
): SchoolApplicationsSummary {
  const summary: SchoolApplicationsSummary = {
    archived: 0,
    draft: 0,
    missingInformation: 0,
    packagePrepared: 0,
    preparing: 0,
    stale: 0,
    stalePackages: 0,
    total: rows.length,
  };
  for (const row of rows) {
    const archived = row.status === "archived" || Boolean(row.archivedAt);
    if (archived) {
      summary.archived += 1;
      continue;
    }
    switch (row.status) {
      case "draft": {
        summary.draft += 1;
        break;
      }
      case "preparing": {
        summary.preparing += 1;
        break;
      }
      case "package_prepared": {
        summary.packagePrepared += 1;
        break;
      }
      case "stale": {
        summary.stale += 1;
        break;
      }
      default: {
        break;
      }
    }
    if ((row.missingDataCodes?.length ?? 0) > 0) {
      summary.missingInformation += 1;
    }
    if (row.packageStale) {
      summary.stalePackages += 1;
    }
  }
  return summary;
}

export type Student500SummaryInput = {
  status: string;
  archivedAt?: string | null;
  screening?: {
    preparationState?: string;
    missingFactCodes?: readonly string[];
    humanReviewReasons?: readonly string[];
  } | null;
};

export function summarizeStudent500(
  rows: readonly Student500SummaryInput[]
): Student500Summary {
  const summary: Student500Summary = {
    archived: 0,
    draft: 0,
    humanReviewRequired: 0,
    inProgress: 0,
    missingFacts: 0,
    screeningIncomplete: 0,
    screeningPendingReview: 0,
    total: rows.length,
  };
  for (const row of rows) {
    const archived = row.status === "archived" || Boolean(row.archivedAt);
    if (archived) {
      summary.archived += 1;
      continue;
    }
    if (row.status === "draft") {
      summary.draft += 1;
    } else if (row.status === "in_progress") {
      summary.inProgress += 1;
    }
    if ((row.screening?.missingFactCodes?.length ?? 0) > 0) {
      summary.missingFacts += 1;
    }
    if ((row.screening?.humanReviewReasons?.length ?? 0) > 0) {
      summary.humanReviewRequired += 1;
    }
    if (row.screening?.preparationState === "screening_incomplete") {
      summary.screeningIncomplete += 1;
    } else if (
      row.screening?.preparationState === "screening_complete_pending_review"
    ) {
      summary.screeningPendingReview += 1;
    }
  }
  return summary;
}

export type ProjectDocumentSummaryInput = {
  lifecycle: string;
  storageStatus: string;
  securityStatus: string;
};

export function summarizeProjectDocuments(
  rows: readonly ProjectDocumentSummaryInput[]
): ProjectDocumentsSummary {
  const summary: ProjectDocumentsSummary = {
    active: 0,
    cleanupPending: 0,
    securityClean: 0,
    securityFailed: 0,
    securityPending: 0,
    securityRejected: 0,
    storageFailed: 0,
    storagePending: 0,
    storageStored: 0,
    total: rows.length,
    withdrawn: 0,
  };
  for (const row of rows) {
    if (row.lifecycle === "active") {
      summary.active += 1;
    } else if (row.lifecycle === "withdrawn") {
      summary.withdrawn += 1;
    }
    switch (row.securityStatus) {
      case "clean": {
        summary.securityClean += 1;
        break;
      }
      case "pending": {
        summary.securityPending += 1;
        break;
      }
      case "rejected": {
        summary.securityRejected += 1;
        break;
      }
      case "failed": {
        summary.securityFailed += 1;
        break;
      }
      default: {
        break;
      }
    }
    switch (row.storageStatus) {
      case "stored": {
        summary.storageStored += 1;
        break;
      }
      case "pending": {
        summary.storagePending += 1;
        break;
      }
      case "failed": {
        summary.storageFailed += 1;
        break;
      }
      case "cleanup_pending": {
        summary.cleanupPending += 1;
        break;
      }
      default: {
        break;
      }
    }
  }
  return summary;
}
