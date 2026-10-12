"use client";

import type { LawyerAttachmentOption } from "@/lib/lawyer-requests/attachment-consent-state";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

export type LawyerAttachmentCopy = WorkspaceCopy["lawyerRequest"];

/**
 * Phase 12 Stage 2 closure: explicit per-document consent before a lawyer
 * request is submitted.
 *
 * Everything is unchecked by default and the customer controls each document
 * individually. The panel states plainly that only checked documents (and their
 * permitted excerpts) are shared, and it names the AI-acknowledged documents the
 * customer chose to withhold so the decision is never silent.
 */
export function LawyerRequestAttachmentConsent({
  copy,
  documents,
  selectedDocumentIds,
  maxSelectable,
  unavailableCount = 0,
  error,
  onToggle,
}: {
  copy: LawyerAttachmentCopy;
  documents: LawyerAttachmentOption[];
  selectedDocumentIds: string[];
  maxSelectable: number;
  unavailableCount?: number;
  error?: string | null;
  onToggle: (documentId: string) => void;
}) {
  const selected = new Set(selectedDocumentIds);
  const withheldAcknowledged = documents.filter(
    (document) => document.usedByAnswer && !selected.has(document.documentId)
  );

  return (
    <fieldset
      className="space-y-2 rounded-xl border border-sky-200 bg-white/80 p-3"
      data-testid="lawyer-attachment-consent"
    >
      <legend className="px-1 text-xs font-semibold text-slate-800">
        {copy.attachmentsTitle}
      </legend>
      <p className="text-xs leading-5 text-slate-600">
        {copy.attachmentsIntro}
      </p>
      {unavailableCount > 0 ? (
        <p className="text-xs text-amber-800">{copy.attachmentsUnavailable}</p>
      ) : null}
      {documents.length === 0 ? (
        <p className="text-xs text-slate-600">{copy.attachmentsNone}</p>
      ) : (
        <ul className="space-y-1">
          {documents.map((document) => (
            <li key={document.documentId}>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 text-xs text-slate-800 hover:bg-sky-50">
                <input
                  checked={selected.has(document.documentId)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  data-testid="lawyer-attachment-option"
                  onChange={() => onToggle(document.documentId)}
                  type="checkbox"
                  value={document.documentId}
                />
                <span className="min-w-0">
                  <span className="block break-all font-medium">
                    {document.filename}
                  </span>
                  <span className="mt-0.5 block text-slate-500">
                    {[
                      document.runStatus,
                      document.usedByAnswer
                        ? copy.attachmentsAcknowledged
                        : copy.attachmentsNotAcknowledged,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p
        className="text-xs font-semibold text-slate-800"
        data-testid="lawyer-attachment-count"
      >
        {copy.attachmentsSelectedPrefix}: {selected.size} / {maxSelectable}
      </p>
      {selected.size === 0 ? (
        <p className="text-xs text-slate-600">{copy.attachmentsNoSelection}</p>
      ) : null}
      {withheldAcknowledged.length > 0 ? (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          <p>{copy.attachmentsWithheldWarning}</p>
          <ul className="mt-1 list-disc pl-4">
            {withheldAcknowledged.map((document) => (
              <li className="break-all" key={document.documentId}>
                {document.filename}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? (
        <p className="text-xs font-semibold text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
