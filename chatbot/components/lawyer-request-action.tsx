"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { consultationCreateHref } from "@/lib/consultations/customer-ui";
import {
  attachmentDecisionPayload,
  canSubmitLawyerRequestWithAttachments,
  LAWYER_ATTACHMENT_DEFAULT_LIMIT,
  type LawyerAttachmentConsentState,
  loadAttachmentConsentState,
  sharedDocumentCountFromSharing,
} from "@/lib/lawyer-requests/attachment-consent-state";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import { LawyerRequestAttachmentConsent } from "./lawyer-request-attachment-consent";
import {
  LawyerAttachmentExistingNotice,
  LawyerAttachmentLoadFailure,
} from "./lawyer-request-attachment-status";
import { useSiteLocale } from "./site-locale-provider";

type AccessState = "loading" | "unauthenticated" | "upgrade" | "allowed";

/**
 * What the server persisted for this submission. Counts always come from the
 * response, never from the checkbox state.
 */
type SubmissionOutcome = {
  existing: boolean;
  requestId: string | null;
  sharedDocumentCount: number | null;
};

export function LawyerRequestAction({
  chatId,
  assistantMessageId,
  answerPreview,
}: {
  chatId: string;
  assistantMessageId: string;
  answerPreview: string;
}) {
  const { locale } = useSiteLocale();
  const copy = getWorkspaceCopy(locale).lawyerRequest;
  const [accessState, setAccessState] = useState<AccessState>("loading");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<SubmissionOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<LawyerAttachmentConsentState>({
    status: "idle",
  });
  /** Every document starts unchecked: nothing is shared without a choice. */
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [questionPreview, setQuestionPreview] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vip/status")
      .then(async (response) => {
        if (cancelled) {
          return;
        }
        if (response.status === 401) {
          setAccessState("unauthenticated");
          return;
        }
        if (!response.ok) {
          setAccessState("upgrade");
          return;
        }
        const data = (await response.json()) as { premiumAllowed?: boolean };
        setAccessState(data.premiumAllowed ? "allowed" : "upgrade");
      })
      .catch(() => {
        if (!cancelled) {
          setAccessState("upgrade");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAttachmentOptions = useCallback(async () => {
    setAttachments({ status: "loading" });
    setSelectionError(null);
    // Never throws: a failure becomes the explicit `failed` state, which blocks
    // submission instead of being read as "share nothing".
    const result = await loadAttachmentConsentState({
      chatId,
      assistantMessageId,
    });
    if (result.questionPreview) {
      setQuestionPreview(result.questionPreview);
    }
    setAttachments(result.state);
  }, [assistantMessageId, chatId]);

  useEffect(() => {
    if (!open || attachments.status !== "idle") {
      return;
    }
    loadAttachmentOptions().catch(() => undefined);
  }, [attachments.status, loadAttachmentOptions, open]);

  const readyForSubmission = canSubmitLawyerRequestWithAttachments(attachments);
  const maxSelectable =
    attachments.status === "ready"
      ? attachments.maxSelectable
      : LAWYER_ATTACHMENT_DEFAULT_LIMIT;
  const overLimit =
    readyForSubmission && selectedDocumentIds.length > maxSelectable;

  function toggleDocument(documentId: string) {
    setSelectionError(null);
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((value) => value !== documentId)
        : [...current, documentId]
    );
  }

  /**
   * An existing request is never presented as a new submission: it is detected
   * either from the submission response or from a fresh eligibility load, and it
   * replaces the whole new-request interface.
   */
  const existingRequest =
    outcome?.existing === true
      ? {
          requestId: outcome.requestId,
          sharedDocumentCount: outcome.sharedDocumentCount,
        }
      : attachments.status === "already_requested"
        ? {
            requestId: attachments.requestId,
            sharedDocumentCount: attachments.sharedDocumentCount,
          }
        : null;

  async function submit() {
    // The decision must be explicitly constructed from a successfully loaded
    // list; a missing list is not consent to share zero documents.
    const decision = attachmentDecisionPayload(
      attachments,
      selectedDocumentIds
    );
    if (!decision) {
      setSelectionError(
        overLimit ? copy.attachmentsLimitError : copy.attachmentsLoadBlocked
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/lawyer-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          assistantMessageId,
          customerNote: note,
          attachments: decision,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        id?: unknown;
        existingRequest?: unknown;
        documentSharing?: unknown;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to submit the lawyer request.");
      }
      setOutcome({
        // A repeat submission returns the stored request (HTTP 200) instead of
        // creating a second one.
        existing: data?.existingRequest === true || response.status === 200,
        requestId:
          typeof data?.id === "string" && data.id.trim().length > 0
            ? data.id
            : null,
        sharedDocumentCount: sharedDocumentCountFromSharing(
          data?.documentSharing
        ),
      });
      setOpen(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit the lawyer request."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (existingRequest) {
    return (
      <div className="space-y-3">
        <LawyerAttachmentExistingNotice
          copy={copy}
          requestId={existingRequest.requestId}
          sharedDocumentCount={existingRequest.sharedDocumentCount}
        />
        <ConsultationLink chatId={chatId} copy={copy} />
      </div>
    );
  }

  if (outcome) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {copy.submitted}{" "}
          <Link
            className="font-semibold underline"
            href={
              outcome.requestId
                ? `/lawyer-requests/${outcome.requestId}`
                : "/lawyer-requests"
            }
          >
            {copy.viewStatus}
          </Link>
          .
          <p className="mt-1 text-xs" data-testid="lawyer-request-shared-count">
            {copy.sharedDocumentsLabel}:{" "}
            {outcome.sharedDocumentCount === null
              ? copy.attachmentsCountUnknown
              : outcome.sharedDocumentCount}
          </p>
        </div>
        <ConsultationLink chatId={chatId} copy={copy} />
      </div>
    );
  }

  if (accessState === "loading") {
    return null;
  }

  if (accessState === "unauthenticated") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <p className="mb-2 font-semibold text-slate-900">{copy.reviewPrompt}</p>
        <p>
          <Link className="font-semibold text-sky-800 underline" href="/login">
            {copy.signIn}
          </Link>
          {copy.toReview}
        </p>
      </div>
    );
  }

  if (accessState === "upgrade") {
    return (
      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
        <p className="mb-2 font-semibold">{copy.reviewPrompt}</p>
        <p>
          <Link className="font-semibold underline" href="/vip">
            {copy.upgrade}
          </Link>
          {copy.toAskReview}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 sm:p-4">
        <p className="mb-2 font-semibold">{copy.reviewPrompt}</p>
        <button
          className="inline-flex min-h-10 items-center rounded-lg bg-sky-800 px-3 py-2 font-semibold text-white underline-offset-2 hover:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          data-testid="ask-lawyer-review"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {copy.askReview}
        </button>
        {open ? (
          <div className="mt-3 space-y-3">
            <div className="rounded-xl bg-white/70 p-3 text-xs leading-5 text-slate-600">
              <p>{copy.details}</p>
              {questionPreview ? (
                <p className="mt-2 text-slate-500">
                  {copy.questionPreview}
                  {questionPreview.slice(0, 240)}
                </p>
              ) : null}
              <p className="mt-2 text-slate-500">
                {copy.answerPreview}
                {(answerPreview || "").slice(0, 240)}
              </p>
            </div>
            {attachments.status === "loading" ? (
              <p className="text-xs text-slate-600">
                {copy.attachmentsLoading}
              </p>
            ) : null}
            {attachments.status === "failed" ? (
              <LawyerAttachmentLoadFailure
                copy={copy}
                onRetry={() => loadAttachmentOptions().catch(() => undefined)}
              />
            ) : null}
            {attachments.status === "ready" ? (
              <LawyerRequestAttachmentConsent
                copy={copy}
                documents={attachments.documents}
                error={overLimit ? copy.attachmentsLimitError : selectionError}
                maxSelectable={maxSelectable}
                onToggle={toggleDocument}
                selectedDocumentIds={selectedDocumentIds}
                unavailableCount={attachments.unavailableCount}
              />
            ) : null}
            <textarea
              className="min-h-20 w-full rounded-xl border border-sky-200 bg-white p-3 text-sm outline-none focus:border-sky-500"
              maxLength={4000}
              onChange={(event) => setNote(event.target.value)}
              placeholder={copy.optionalNote}
              value={note}
            />
            {error ? <p className="text-red-700">{error}</p> : null}
            <button
              className="rounded-xl bg-sky-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
              data-testid="lawyer-request-submit"
              disabled={submitting || !readyForSubmission || overLimit}
              onClick={submit}
              type="button"
            >
              {submitting ? copy.submitting : copy.submit}
            </button>
            {readyForSubmission || attachments.status === "failed" ? null : (
              <p className="text-xs text-slate-600">
                {copy.attachmentsLoadBlocked}
              </p>
            )}
          </div>
        ) : null}
      </div>
      <ConsultationLink chatId={chatId} copy={copy} />
    </div>
  );
}

function ConsultationLink({
  chatId,
  copy,
}: {
  chatId: string;
  copy: ReturnType<typeof getWorkspaceCopy>["lawyerRequest"];
}) {
  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950 sm:p-4">
      <p className="font-semibold">{copy.consultationTitle}</p>
      <p className="mt-1 text-xs leading-5 text-violet-900">
        {copy.consultationDescription}
      </p>
      <Link
        className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-violet-300 bg-white px-3 py-2 font-semibold text-violet-900 underline-offset-2 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        href={consultationCreateHref(chatId)}
      >
        {copy.consultationLink}
      </Link>
    </div>
  );
}
