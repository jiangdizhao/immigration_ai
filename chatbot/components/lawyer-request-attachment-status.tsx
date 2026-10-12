"use client";

import Link from "next/link";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

export type LawyerAttachmentStatusCopy = WorkspaceCopy["lawyerRequest"];

/**
 * Phase 12 Stage 2 final correction.
 *
 * A failed eligible-document lookup blocks submission and offers an explicit
 * retry, so a customer can never be pushed into submitting without reviewing the
 * list (or without explicitly confirming that nothing is shared).
 */
export function LawyerAttachmentLoadFailure({
  copy,
  onRetry,
}: {
  copy: LawyerAttachmentStatusCopy;
  onRetry: () => void;
}) {
  return (
    <div
      className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3"
      data-testid="lawyer-attachment-load-failure"
    >
      <p className="text-xs font-semibold text-red-800" role="alert">
        {copy.attachmentsLoadError}
      </p>
      <p className="text-xs text-red-800">{copy.attachmentsLoadBlocked}</p>
      <button
        className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-900 hover:bg-red-100"
        data-testid="lawyer-attachment-retry"
        onClick={onRetry}
        type="button"
      >
        {copy.attachmentsRetry}
      </button>
    </div>
  );
}

/**
 * A lawyer-review request already exists for this answer.
 *
 * The shared-document count is the persisted one; when the stored request does
 * not record it the count is shown as unknown instead of being inferred from the
 * current checkboxes.
 */
export function LawyerAttachmentExistingNotice({
  copy,
  requestId,
  sharedDocumentCount,
}: {
  copy: LawyerAttachmentStatusCopy;
  requestId: string | null;
  sharedDocumentCount: number | null;
}) {
  return (
    <div
      className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:p-4"
      data-testid="lawyer-attachment-existing"
    >
      <p className="font-semibold text-slate-900">
        {copy.attachmentsAlreadyRequested}
      </p>
      <p
        className="text-xs text-slate-600"
        data-testid="lawyer-attachment-existing-count"
      >
        {copy.sharedDocumentsLabel}:{" "}
        {sharedDocumentCount === null
          ? copy.attachmentsCountUnknown
          : sharedDocumentCount}
      </p>
      <Link
        className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 underline-offset-2 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
        data-testid="lawyer-attachment-existing-link"
        href={requestId ? `/lawyer-requests/${requestId}` : "/lawyer-requests"}
      >
        {copy.attachmentsViewExisting}
      </Link>
    </div>
  );
}
