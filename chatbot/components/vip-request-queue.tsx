"use client";

import { useCallback, useEffect, useState } from "react";

type RequestRecord = {
  id: string;
  customerEmail: string;
  requestSource: string;
  status: string;
  questionSnapshot: string;
  answerSnapshot: string;
  customerNote: string | null;
  lawyerResponse: string | null;
  correctedAnswer: string | null;
  createdAt: string;
  assignedLawyerUserId: string | null;
  assignedAt: string | null;
  learningBridge?: { status: string } | null;
};

type LawyerOption = { id: string; email: string; role: "user" | "lawyer" };

const statuses = [
  "all",
  "pending",
  "in_review",
  "confirmed",
  "corrected",
  "needs_more_information",
  "closed",
];
const labels: Record<string, string> = {
  pending: "Pending",
  in_review: "In review",
  confirmed: "Confirmed",
  corrected: "Corrected",
  needs_more_information: "Needs more information",
  closed: "Closed",
};

export function VipRequestQueue() {
  const [filter, setFilter] = useState("pending");
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [selected, setSelected] = useState<RequestRecord | null>(null);
  const [lawyerResponse, setLawyerResponse] = useState("");
  const [correctedAnswer, setCorrectedAnswer] = useState("");
  const [
    preferredReasoningOrResearchApproach,
    setPreferredReasoningOrResearchApproach,
  ] = useState("");
  const [createReasoningLessonCandidate, setCreateReasoningLessonCandidate] =
    useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lawyers, setLawyers] = useState<LawyerOption[]>([]);
  const [selectedLawyerId, setSelectedLawyerId] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/lawyer-requests?status=${filter}`
      );
      const data = (await response.json()) as {
        requests?: RequestRecord[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load request queue.");
      }
      setRequests(data.requests ?? []);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load request queue."
      );
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    fetch("/api/admin/lawyers")
      .then(async (response) => {
        const data = (await response.json()) as { users?: LawyerOption[] };
        if (response.ok) {
          setLawyers(
            (data.users ?? []).filter((user) => user.role === "lawyer")
          );
        }
      })
      .catch(() => {
        // The request queue remains usable if account management is unavailable.
      });
  }, []);

  function selectRequest(request: RequestRecord) {
    setSelected(request);
    setLawyerResponse(request.lawyerResponse ?? "");
    setCorrectedAnswer(request.correctedAnswer ?? "");
    setPreferredReasoningOrResearchApproach("");
    setCreateReasoningLessonCandidate(false);
    setSelectedLawyerId(request.assignedLawyerUserId ?? "");
    setMessage(null);
  }

  async function updateAssignment() {
    if (!selected) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/lawyer-requests/${selected.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignedLawyerUserId: selectedLawyerId || null,
          }),
        }
      );
      const data = (await response.json()) as RequestRecord & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update assignment.");
      }
      setSelected(data);
      setMessage("Assignment updated.");
      await loadQueue();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update assignment."
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(status: string) {
    if (!selected) {
      return;
    }
    if (
      (status === "confirmed" ||
        status === "corrected" ||
        status === "needs_more_information") &&
      !lawyerResponse.trim()
    ) {
      setMessage("A substantive lawyer response is required.");
      return;
    }
    if (status === "corrected" && !correctedAnswer.trim()) {
      setMessage("A corrected answer is required.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/lawyer-requests/${selected.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            lawyerResponse,
            correctedAnswer,
            preferredReasoningOrResearchApproach,
            createReasoningLessonCandidate,
          }),
        }
      );
      const data = (await response.json()) as RequestRecord & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update request.");
      }
      setSelected(data);
      setMessage("Request updated.");
      await loadQueue();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update request."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Request queue</h2>
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            onChange={(event) => setFilter(event.target.value)}
            value={filter}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All statuses" : labels[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 space-y-2">
          {requests.map((request) => (
            <button
              className={`w-full rounded-2xl border p-4 text-left transition ${selected?.id === request.id ? "border-sky-400 bg-sky-50" : "border-slate-200 hover:border-sky-300"}`}
              key={request.id}
              onClick={() => selectRequest(request)}
              type="button"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {labels[request.status] ?? request.status}
              </p>
              <p className="mt-1 truncate text-sm font-semibold">
                {request.customerEmail}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(request.createdAt).toLocaleString()}
              </p>
            </button>
          ))}
          {!loading && requests.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              No requests in this filter.
            </p>
          ) : null}
        </div>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {selected ? (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  {labels[selected.status] ?? selected.status}
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  {selected.customerEmail}
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Source: {selected.requestSource}
              </p>
            </div>
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Question snapshot
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {selected.questionSnapshot}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Answer snapshot
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {selected.answerSnapshot}
                </p>
              </div>
              {selected.customerNote ? (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm">
                  <p className="font-semibold">Customer note</p>
                  <p className="mt-1 whitespace-pre-wrap">
                    {selected.customerNote}
                  </p>
                </div>
              ) : null}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Assignment
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <select
                    className="min-w-56 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    onChange={(event) =>
                      setSelectedLawyerId(event.target.value)
                    }
                    value={selectedLawyerId}
                  >
                    <option value="">Unassigned</option>
                    {lawyers.map((lawyer) => (
                      <option key={lawyer.id} value={lawyer.id}>
                        {lawyer.email}
                      </option>
                    ))}
                  </select>
                  <button
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    disabled={loading}
                    onClick={updateAssignment}
                    type="button"
                  >
                    Save assignment
                  </button>
                </div>
              </div>
              <textarea
                className="min-h-28 w-full rounded-2xl border border-slate-200 p-3 text-sm"
                maxLength={8000}
                onChange={(event) => setLawyerResponse(event.target.value)}
                placeholder="Lawyer response"
                value={lawyerResponse}
              />
              <textarea
                className="min-h-32 w-full rounded-2xl border border-slate-200 p-3 text-sm"
                maxLength={12_000}
                onChange={(event) => setCorrectedAnswer(event.target.value)}
                placeholder="Corrected answer (required for correction)"
                value={correctedAnswer}
              />
              <textarea
                className="min-h-24 w-full rounded-2xl border border-slate-200 p-3 text-sm"
                maxLength={8000}
                onChange={(event) =>
                  setPreferredReasoningOrResearchApproach(event.target.value)
                }
                placeholder="Optional procedural reasoning/research approach"
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
                Create reasoning lesson candidate
              </label>
              <p className="text-sm text-slate-600">
                Learning bridge:{" "}
                {selected.learningBridge?.status ?? "not finalized"} · runtime
                effect: shadow/none
              </p>
              {selected.learningBridge &&
              [
                "failed_retryable",
                "blocked_missing_trace_link",
                "blocked_missing_experience",
              ].includes(selected.learningBridge.status) ? (
                <button
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await fetch(
                        `/api/admin/lawyer-requests/${selected.id}/learning`,
                        {
                          method: "POST",
                        }
                      );
                      await loadQueue();
                    } finally {
                      setLoading(false);
                    }
                  }}
                  type="button"
                >
                  Retry learning bridge
                </button>
              ) : null}
              {message ? (
                <p className="text-sm text-slate-700">{message}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  disabled={loading}
                  onClick={() => updateStatus("in_review")}
                  type="button"
                >
                  Mark in review
                </button>
                <button
                  className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={loading}
                  onClick={() => updateStatus("confirmed")}
                  type="button"
                >
                  Confirm answer
                </button>
                <button
                  className="rounded-xl bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={loading}
                  onClick={() => updateStatus("corrected")}
                  type="button"
                >
                  Provide correction
                </button>
                <button
                  className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={loading}
                  onClick={() => updateStatus("needs_more_information")}
                  type="button"
                >
                  Need more information
                </button>
                <button
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  disabled={loading}
                  onClick={() => updateStatus("closed")}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Select a request to review its immutable customer snapshot.
          </p>
        )}
      </section>
    </div>
  );
}
