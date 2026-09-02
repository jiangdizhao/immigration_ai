"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Message = {
  id: string;
  authorRole: "customer" | "lawyer" | "admin";
  body: string;
  createdAt: string;
};

type RequestRecord = {
  status: string;
  questionSnapshot: string;
  answerSnapshot: string;
  customerNote: string | null;
  lawyerResponse: string | null;
  correctedAnswer: string | null;
  assigned: boolean;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  in_review: "In review",
  confirmed: "Confirmed",
  corrected: "Correction provided",
  needs_more_information: "More information requested",
  closed: "Closed",
};

export function LawyerRequestDetail({ id }: { id: string }) {
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadRequest = useCallback(async () => {
    const response = await fetch(`/api/lawyer-requests/${id}`);
    const data = (await response.json()) as RequestRecord & { error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? "Unable to load lawyer request.");
    }
    setRequest(data);
    await fetch(`/api/lawyer-requests/${id}/viewed`, { method: "POST" });
  }, [id]);

  useEffect(() => {
    loadRequest().catch((error) => {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load lawyer request."
      );
    });
  }, [loadRequest]);

  async function submitReply() {
    if (!reply.trim()) {
      setMessage("Write a reply before sending.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/lawyer-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to send reply.");
      }
      setReply("");
      await loadRequest();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to send reply."
      );
    } finally {
      setLoading(false);
    }
  }

  if (message && !request) {
    return <p className="mt-6 text-sm text-red-700">{message}</p>;
  }
  if (!request) {
    return <p className="mt-6 text-sm text-slate-500">Loading request...</p>;
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <p>
          Status:{" "}
          <span className="font-semibold text-slate-900">
            {statusLabels[request.status] ?? request.status}
          </span>
        </p>
        <p>
          {request.assigned
            ? "Assigned to a lawyer"
            : "Waiting for lawyer assignment"}
        </p>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Your question
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
          {request.questionSnapshot}
        </p>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          AI answer under review
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
          {request.answerSnapshot}
        </p>
      </div>
      {request.customerNote ? (
        <div className="rounded-2xl bg-sky-50 p-5 text-sm">
          <p className="font-semibold">Your note</p>
          <p className="mt-1 whitespace-pre-wrap">{request.customerNote}</p>
        </div>
      ) : null}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Clarification thread</h2>
        <div className="mt-4 space-y-3">
          {request.messages.length === 0 ? (
            <p className="text-sm text-slate-500">No messages yet.</p>
          ) : (
            request.messages.map((threadMessage) => (
              <div
                className="rounded-xl bg-slate-50 p-4"
                key={threadMessage.id}
              >
                <div className="flex justify-between gap-3 text-xs text-slate-500">
                  <span className="font-semibold capitalize">
                    {threadMessage.authorRole}
                  </span>
                  <span>
                    {new Date(threadMessage.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {threadMessage.body}
                </p>
              </div>
            ))
          )}
        </div>
        {request.status === "needs_more_information" ? (
          <div className="mt-5 space-y-3">
            <textarea
              className="min-h-28 w-full rounded-xl border border-slate-300 p-3 text-sm"
              maxLength={8000}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Reply to the lawyer"
              value={reply}
            />
            <button
              className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={loading}
              onClick={submitReply}
              type="button"
            >
              Send reply
            </button>
          </div>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm text-slate-700">{message}</p>
        ) : null}
      </section>
      {request.status === "confirmed" && request.lawyerResponse ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm">
          <p className="font-semibold">Lawyer confirmation</p>
          <p className="mt-1 whitespace-pre-wrap">{request.lawyerResponse}</p>
        </div>
      ) : null}
      {request.status === "corrected" ? (
        <div className="space-y-3 rounded-2xl border border-violet-100 bg-violet-50 p-5 text-sm">
          <p className="font-semibold">Lawyer correction</p>
          {request.correctedAnswer ? (
            <p className="whitespace-pre-wrap">{request.correctedAnswer}</p>
          ) : null}
          {request.lawyerResponse ? (
            <p className="whitespace-pre-wrap">{request.lawyerResponse}</p>
          ) : null}
        </div>
      ) : null}
      <Link
        className="inline-block text-sm font-semibold text-sky-800 underline"
        href="/lawyer-requests"
      >
        Back to lawyer requests
      </Link>
    </div>
  );
}
