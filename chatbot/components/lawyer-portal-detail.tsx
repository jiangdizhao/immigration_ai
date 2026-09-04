"use client";

import { useCallback, useEffect, useState } from "react";

type Message = {
  id: string;
  authorRole: string;
  body: string;
  createdAt: string;
};
type RequestRecord = {
  status: string;
  customerEmail: string;
  questionSnapshot: string;
  answerSnapshot: string;
  evidenceSnapshot: unknown;
  contextSnapshot: unknown;
  customerNote: string | null;
  lawyerResponse: string | null;
  correctedAnswer: string | null;
  preferredReasoningOrResearchApproach?: string | null;
  messages: Message[];
};

export function LawyerPortalDetail({ id }: { id: string }) {
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [lawyerResponse, setLawyerResponse] = useState("");
  const [correctedAnswer, setCorrectedAnswer] = useState("");
  const [
    preferredReasoningOrResearchApproach,
    setPreferredReasoningOrResearchApproach,
  ] = useState("");
  const [createReasoningLessonCandidate, setCreateReasoningLessonCandidate] =
    useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/lawyer-portal/requests/${id}`);
    const data = (await response.json()) as RequestRecord & { error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? "Unable to load request.");
    }
    setRequest(data);
    setLawyerResponse(data.lawyerResponse ?? "");
    setCorrectedAnswer(data.correctedAnswer ?? "");
    setPreferredReasoningOrResearchApproach(
      data.preferredReasoningOrResearchApproach ?? ""
    );
  }, [id]);

  useEffect(() => {
    load().catch((error) =>
      setNotice(
        error instanceof Error ? error.message : "Unable to load request."
      )
    );
  }, [load]);

  async function update(status: string) {
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/lawyer-portal/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          lawyerResponse,
          correctedAnswer,
          preferredReasoningOrResearchApproach,
          createReasoningLessonCandidate,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update request.");
      }
      await load();
      setNotice("Request updated.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to update request."
      );
    } finally {
      setLoading(false);
    }
  }

  if (!request) {
    return (
      <p className="mt-6 text-sm text-slate-600">
        {notice ?? "Loading request..."}
      </p>
    );
  }
  return (
    <div className="mt-6 space-y-5">
      <p className="text-sm text-slate-600">
        Customer:{" "}
        <span className="font-semibold text-slate-900">
          {request.customerEmail}
        </span>{" "}
        · Status:{" "}
        <span className="font-semibold text-slate-900">{request.status}</span>
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Question snapshot
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
            {request.questionSnapshot}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            AI answer snapshot
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
            {request.answerSnapshot}
          </p>
        </div>
      </div>
      {request.customerNote ? (
        <div className="rounded-2xl bg-sky-50 p-5 text-sm">
          <p className="font-semibold">Customer note</p>
          <p className="mt-1 whitespace-pre-wrap">{request.customerNote}</p>
        </div>
      ) : null}
      <details className="rounded-2xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer font-semibold">
          Evidence and context snapshot
        </summary>
        <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-slate-600">
          {JSON.stringify(
            {
              evidence: request.evidenceSnapshot,
              context: request.contextSnapshot,
            },
            null,
            2
          )}
        </pre>
      </details>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Clarification thread</h2>
        <div className="mt-4 space-y-3">
          {request.messages.map((message) => (
            <div className="rounded-xl bg-slate-50 p-4" key={message.id}>
              <p className="text-xs font-semibold capitalize text-slate-500">
                {message.authorRole} ·{" "}
                {new Date(message.createdAt).toLocaleString()}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                {message.body}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="space-y-3">
          <textarea
            className="min-h-28 w-full rounded-xl border border-slate-300 p-3 text-sm"
            maxLength={8000}
            onChange={(event) => setLawyerResponse(event.target.value)}
            placeholder="Response or question for the customer"
            value={lawyerResponse}
          />
          <textarea
            className="min-h-32 w-full rounded-xl border border-slate-300 p-3 text-sm"
            maxLength={12_000}
            onChange={(event) => setCorrectedAnswer(event.target.value)}
            placeholder="Corrected answer (required for correction)"
            value={correctedAnswer}
          />
          <textarea
            className="min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm"
            maxLength={8000}
            onChange={(event) =>
              setPreferredReasoningOrResearchApproach(event.target.value)
            }
            placeholder="Optional procedural reasoning/research approach (for a lesson candidate)"
            value={preferredReasoningOrResearchApproach}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              checked={createReasoningLessonCandidate}
              onChange={(event) =>
                setCreateReasoningLessonCandidate(event.target.checked)
              }
              type="checkbox"
            />
            Create a reasoning lesson candidate
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={loading}
            onClick={() => update("in_review")}
            type="button"
          >
            Mark in review
          </button>
          <button
            className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={loading}
            onClick={() => update("needs_more_information")}
            type="button"
          >
            Request more information
          </button>
          <button
            className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={loading}
            onClick={() => update("confirmed")}
            type="button"
          >
            Confirm
          </button>
          <button
            className="rounded-xl bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={loading}
            onClick={() => update("corrected")}
            type="button"
          >
            Correct
          </button>
          <button
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={loading}
            onClick={() => update("closed")}
            type="button"
          >
            Close
          </button>
        </div>
        {notice ? (
          <p className="mt-3 text-sm text-slate-700">{notice}</p>
        ) : null}
      </section>
    </div>
  );
}
