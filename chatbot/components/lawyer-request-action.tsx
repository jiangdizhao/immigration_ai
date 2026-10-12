"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { consultationCreateHref } from "@/lib/consultations/customer-ui";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import {
  type LawyerAttachmentOption,
  LawyerRequestAttachmentConsent,
} from "./lawyer-request-attachment-consent";
import { useSiteLocale } from "./site-locale-provider";

type AccessState = "loading" | "unauthenticated" | "upgrade" | "allowed";

type AttachmentSelectionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "failed" }
  | {
      status: "ready";
      documents: LawyerAttachmentOption[];
      maxSelectable: number;
      acknowledgedCount: number;
      unavailableCount: number;
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
  const [submitted, setSubmitted] = useState(false);
  const [submittedShareCount, setSubmittedShareCount] = useState<number | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentSelectionState>({
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
    try {
      const query = new URLSearchParams({ chatId, assistantMessageId });
      const response = await fetch(`/api/lawyer-requests?${query}`, {
        method: "GET",
      });
      if (!response.ok) {
        throw new Error("load_failed");
      }
      const data = (await response.json()) as {
        questionPreview?: string;
        attachmentSelection?: {
          status?: string;
          maxSelectable?: number;
          documents?: LawyerAttachmentOption[];
          acknowledgedCount?: number;
          unavailableCount?: number;
        };
      };
      if (typeof data.questionPreview === "string") {
        setQuestionPreview(data.questionPreview);
      }
      const selection = data.attachmentSelection;
      if (!selection || selection.status !== "selectable") {
        setAttachments({
          status: "ready",
          documents: [],
          maxSelectable: 0,
          acknowledgedCount: 0,
          unavailableCount: 0,
        });
        return;
      }
      setAttachments({
        status: "ready",
        documents: Array.isArray(selection.documents)
          ? selection.documents
          : [],
        maxSelectable:
          typeof selection.maxSelectable === "number"
            ? selection.maxSelectable
            : 4,
        acknowledgedCount:
          typeof selection.acknowledgedCount === "number"
            ? selection.acknowledgedCount
            : 0,
        unavailableCount:
          typeof selection.unavailableCount === "number"
            ? selection.unavailableCount
            : 0,
      });
    } catch {
      // A failed lookup never shares anything: the request is still allowed, but
      // without attachments.
      setAttachments({ status: "failed" });
    }
  }, [assistantMessageId, chatId]);

  useEffect(() => {
    if (!open || attachments.status !== "idle") {
      return;
    }
    loadAttachmentOptions().catch(() => undefined);
  }, [attachments.status, loadAttachmentOptions, open]);

  const maxSelectable =
    attachments.status === "ready" ? attachments.maxSelectable : 4;
  const overLimit = selectedDocumentIds.length > maxSelectable;

  function toggleDocument(documentId: string) {
    setSelectionError(null);
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((value) => value !== documentId)
        : [...current, documentId]
    );
  }

  async function submit() {
    if (overLimit) {
      setSelectionError(copy.attachmentsLimitError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      /**
       * The explicit decision travels with the request. When the option list
       * could not be loaded, no `attachments` field is sent at all — the server
       * then shares nothing rather than guessing.
       */
      const body: Record<string, unknown> = {
        chatId,
        assistantMessageId,
        customerNote: note,
      };
      if (attachments.status === "ready") {
        body.attachments = { consent: true, selectedDocumentIds };
      }
      const response = await fetch("/api/lawyer-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to submit the lawyer request.");
      }
      setSubmittedShareCount(
        attachments.status === "ready" ? selectedDocumentIds.length : null
      );
      setSubmitted(true);
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

  if (submitted) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {copy.submitted}{" "}
          <Link className="font-semibold underline" href="/lawyer-requests">
            {copy.viewStatus}
          </Link>
          .
          {submittedShareCount !== null ? (
            <p className="mt-1 text-xs">
              {copy.attachmentsSelectedPrefix}: {submittedShareCount}
            </p>
          ) : null}
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
              <div className="space-y-2">
                <p className="text-xs text-red-700" role="alert">
                  {copy.attachmentsLoadError}
                </p>
                <button
                  className="rounded-lg border border-sky-300 bg-white px-3 py-1 text-xs font-semibold text-sky-900"
                  onClick={() => loadAttachmentOptions().catch(() => undefined)}
                  type="button"
                >
                  {copy.askReview}
                </button>
              </div>
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
              disabled={
                submitting || overLimit || attachments.status === "loading"
              }
              onClick={submit}
              type="button"
            >
              {submitting ? copy.submitting : copy.submit}
            </button>
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
