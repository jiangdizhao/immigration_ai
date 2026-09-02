"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LawyerRequest = {
  id: string;
  chatId: string | null;
  legalMatterId: string | null;
  status: string;
  assistantMode: string;
  questionSnapshot: string;
  answerSnapshot: string;
  evidenceSnapshot: unknown[];
  contextSnapshot: unknown[];
  customerNote: string | null;
  lawyerResponse: string | null;
  correctedAnswer: string | null;
  createdAt: string;
  reviewedAt: string | null;
  assigned: boolean;
  unread: boolean;
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  in_review: "In review",
  confirmed: "Confirmed",
  corrected: "Correction provided",
  needs_more_information: "More information requested",
  closed: "Closed",
};

export function LawyerRequestHistory() {
  const [requests, setRequests] = useState<LawyerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/lawyer-requests")
      .then(async (response) => {
        const data = (await response.json()) as {
          requests?: LawyerRequest[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load lawyer requests.");
        }
        setRequests(data.requests ?? []);
      })
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load lawyer requests."
        );
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="space-y-5">
      {loading ? (
        <p className="text-sm text-slate-500">Loading requests...</p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {!loading && !error && requests.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No lawyer review requests yet. Return to the{" "}
          <Link
            className="font-semibold text-sky-800 underline"
            href="/ai-workspace"
          >
            AI Workspace
          </Link>{" "}
          to request a review of an answer.
        </div>
      ) : null}
      {requests.map((request) => (
        <article
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          key={request.id}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {statusLabels[request.status] ?? request.status}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Submitted {new Date(request.createdAt).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {request.assigned
                  ? "Assigned to a lawyer"
                  : "Waiting for lawyer assignment"}
                {request.unread ? " · Update available" : ""}
              </p>
            </div>
            <Link
              className="text-sm font-semibold text-sky-800 underline"
              href={`/lawyer-requests/${request.id}`}
            >
              Request details
            </Link>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Your question
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {request.questionSnapshot}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                AI answer under review
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {request.answerSnapshot}
              </p>
            </div>
          </div>
          {request.customerNote ? (
            <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-950">
              <p className="font-semibold">Your note</p>
              <p className="mt-1 whitespace-pre-wrap">{request.customerNote}</p>
            </div>
          ) : null}
          {request.lawyerResponse ? (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-semibold">Lawyer response</p>
              <p className="mt-1 whitespace-pre-wrap">
                {request.lawyerResponse}
              </p>
            </div>
          ) : null}
          {request.correctedAnswer ? (
            <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-950">
              <p className="font-semibold">Corrected answer</p>
              <p className="mt-1 whitespace-pre-wrap">
                {request.correctedAnswer}
              </p>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
