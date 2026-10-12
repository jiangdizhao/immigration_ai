/**
 * Phase 12 Stage 2 — localized labels for a document's deterministic display
 * status. One mapping is shared by the conversation file panel, the composer
 * upload control and the account-wide file history so the same stored file can
 * never be described differently in two places.
 */
import type { WorkspaceCopy } from "@/lib/workspace-copy";
import type { MatterDocumentDisplayStatus } from "./display-status";

export function matterDocumentStatusLabel(
  copy: WorkspaceCopy,
  status: MatterDocumentDisplayStatus,
  options?: { visionUnavailable?: boolean }
): string {
  const labels = copy.documents;
  switch (status) {
    case "available_to_ai":
      return labels.availableToAI;
    case "no_usable_evidence":
      return labels.noEvidence;
    case "incomplete":
      return labels.partial;
    case "processing":
      return labels.processing;
    case "failed":
      return options?.visionUnavailable
        ? labels.visionUnavailable
        : labels.failed;
    case "not_started":
      return labels.stored;
    default:
      return labels.needsReview;
  }
}
