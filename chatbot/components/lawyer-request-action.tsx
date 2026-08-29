"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AccessState = "loading" | "unauthenticated" | "upgrade" | "allowed";

export function LawyerRequestAction({
  chatId,
  assistantMessageId,
  answerPreview,
}: {
  chatId: string;
  assistantMessageId: string;
  answerPreview: string;
}) {
  const [accessState, setAccessState] = useState<AccessState>("loading");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function submit() {
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
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to submit the lawyer request.");
      }
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
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Your lawyer review request has been submitted. View its status in{" "}
        <Link className="font-semibold underline" href="/lawyer-requests">
          Lawyer requests
        </Link>
        .
      </div>
    );
  }

  if (accessState === "loading") {
    return null;
  }

  if (accessState === "unauthenticated") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <Link className="font-semibold text-sky-800 underline" href="/login">
          Sign in
        </Link>{" "}
        to ask a lawyer to review this answer.
      </div>
    );
  }

  if (accessState === "upgrade") {
    return (
      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
        <Link className="font-semibold underline" href="/vip">
          Upgrade to VIP
        </Link>{" "}
        to request a human lawyer review of this answer.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
      <button
        className="font-semibold underline"
        data-testid="ask-lawyer-review"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        Ask a lawyer to review this answer
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="rounded-xl bg-white/70 p-3 text-xs leading-5 text-slate-600">
            The lawyer will receive the saved question, answer, visible context,
            and allowlisted evidence from this conversation.
            <br />
            <span className="text-slate-500">
              Answer preview: {answerPreview.slice(0, 240)}
            </span>
          </p>
          <textarea
            className="min-h-20 w-full rounded-xl border border-sky-200 bg-white p-3 text-sm outline-none focus:border-sky-500"
            maxLength={4000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note for the lawyer"
            value={note}
          />
          {error ? <p className="text-red-700">{error}</p> : null}
          <button
            className="rounded-xl bg-sky-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={submitting}
            onClick={submit}
            type="button"
          >
            {submitting ? "Submitting..." : "Submit review request"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
