/**
 * Deterministic display status for a stored customer document.
 *
 * Upload success (durable storage) and extraction success (usable evidence) are
 * different outcomes: a stored document whose extraction produced no evidence
 * units must not be presented as available for AI analysis.
 */
export type MatterDocumentDisplayStatus =
  | "not_started"
  | "processing"
  | "failed"
  | "incomplete"
  | "available_to_ai"
  | "no_usable_evidence";

const FINISHED_RUN_STATUSES = ["complete", "partial", "needs_review"];

export function matterDocumentDisplayStatus(input: {
  processingStatus: string;
  runStatus?: string | null;
  unitCount?: number | null;
}): MatterDocumentDisplayStatus {
  const runStatus = input.runStatus ?? null;
  const unitCount = input.unitCount ?? null;

  if (runStatus) {
    if (FINISHED_RUN_STATUSES.includes(runStatus)) {
      if ((unitCount ?? 0) > 0) {
        return runStatus === "complete" ? "available_to_ai" : "incomplete";
      }
      return "no_usable_evidence";
    }
    if (runStatus === "failed") {
      return "failed";
    }
    if (runStatus === "processing") {
      return "processing";
    }
  }

  if (input.processingStatus === "complete") {
    // Stored as complete but without a verified evidence count: the file is
    // available, yet no claim about AI usability is made.
    return "no_usable_evidence";
  }
  if (input.processingStatus === "processing") {
    return "processing";
  }
  if (input.processingStatus === "failed") {
    return "failed";
  }
  return "not_started";
}
