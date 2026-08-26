"use client";

import { useEffect, useMemo, useState } from "react";

type ConversationQueueItem = {
  matter_id: string;
  session_id?: string | null;
  frontend_chat_id?: string | null;
  first_user_message?: string | null;
  latest_user_message?: string | null;
  latest_assistant_answer_preview?: string | null;
  issue_type?: string | null;
  visa_type?: string | null;
  risk_level?: string | null;
  trace_count?: number;
  reviewed_trace_count?: number;
  unreviewed_trace_count?: number;
  critical_review_count?: number;
  comment_status?: string | null;
  created_at?: string | null;
};

type AnswerReview = {
  id: string;
  answer_trace_id: string;
  matter_id?: string | null;
  reviewer_name?: string | null;
  reviewer_role?: string | null;
  rating?: string | null;
  severity?: string | null;
  error_categories?: string[] | null;
  lawyer_comment?: string | null;
  corrected_answer?: string | null;
  lesson_candidate?: string | null;
  review_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type MatterReview = {
  matter_id: string;
  matter: Record<string, unknown>;
  conversation_history: Record<string, unknown>[];
  traces: Record<string, unknown>[];
  reviews: AnswerReview[];
};

const ERROR_CATEGORIES = [
  "wrong_legal_conclusion",
  "unsupported_conclusion",
  "missing_decisive_fact",
  "wrong_visa_frame",
  "retrieval_or_citation_problem",
  "too_generic",
  "too_template_like",
  "missed_user_intent",
  "failed_to_perform_requested_service",
  "should_have_escalated",
  "over_escalated",
  "good_answer",
];

function preview(value: unknown, maxLength = 180) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function claimIdsFromTrace(trace: Record<string, unknown> | null) {
  const paths = [
    ["trace_json", "response", "legal_reasoning_trace", "claims"],
    ["trace_json", "response", "accepted_submission", "claims"],
    ["trace_json", "legal_reasoning_trace", "claims"],
  ];
  const ids: string[] = [];
  for (const path of paths) {
    let value: unknown = trace;
    for (const key of path) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        value = null;
        break;
      }
      value = (value as Record<string, unknown>)[key];
    }
    if (!Array.isArray(value)) {
      continue;
    }
    for (const claim of value) {
      if (
        claim &&
        typeof claim === "object" &&
        typeof (claim as Record<string, unknown>).claim_id === "string"
      ) {
        const id = String((claim as Record<string, unknown>).claim_id);
        if (id && !ids.includes(id)) {
          ids.push(id);
        }
      }
    }
  }
  return ids;
}

function reviewDateLabel(value?: string | null) {
  if (!value) {
    return "time unknown";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function commentStatusForItem(item: ConversationQueueItem) {
  if (item.comment_status) {
    return item.comment_status;
  }
  const traceCount = item.trace_count ?? 0;
  const reviewedCount = item.reviewed_trace_count ?? 0;
  const unreviewedCount = item.unreviewed_trace_count ?? 0;
  if (traceCount <= 0) {
    return "not_reviewable";
  }
  if (reviewedCount <= 0) {
    return "uncommented";
  }
  if (unreviewedCount <= 0) {
    return "fully_commented";
  }
  return "partially_commented";
}

function commentStatusLabel(item: ConversationQueueItem) {
  const status = commentStatusForItem(item);
  if (status === "fully_commented") {
    return "Commented";
  }
  if (status === "partially_commented") {
    return `${item.unreviewed_trace_count ?? 0} left`;
  }
  if (status === "not_reviewable") {
    return "No answer traces";
  }
  return "Uncommented";
}

function commentStatusClass(item: ConversationQueueItem) {
  const status = commentStatusForItem(item);
  if (status === "fully_commented") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (status === "partially_commented") {
    return "bg-sky-100 text-sky-800";
  }
  if (status === "not_reviewable") {
    return "bg-slate-100 text-slate-500";
  }
  return "bg-amber-100 text-amber-800";
}

export default function LawyerReviewPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("uncommented");
  const [queue, setQueue] = useState<ConversationQueueItem[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null);
  const [matter, setMatter] = useState<MatterReview | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">(
    "info"
  );
  const [reviewerName, setReviewerName] = useState("");
  const [rating, setRating] = useState("mostly_correct");
  const [severity, setSeverity] = useState("medium");
  const [categories, setCategories] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [correctedAnswer, setCorrectedAnswer] = useState("");
  const [lessonCandidate, setLessonCandidate] = useState("");
  const [reviewOutcome, setReviewOutcome] = useState("unclassified");
  const [addToEvaluationBank, setAddToEvaluationBank] = useState(false);
  const [createLessonCandidate, setCreateLessonCandidate] = useState(false);
  const [affectedClaimIds, setAffectedClaimIds] = useState<string[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem("lawyerReviewToken") ?? "";
    if (saved) {
      setToken(saved);
    }
  }, []);

  const selectedTrace = useMemo(() => {
    return (
      (matter?.traces ?? []).find((trace) => trace.id === selectedTraceId) ??
      null
    );
  }, [matter, selectedTraceId]);

  const selectedTraceReviews = useMemo(() => {
    if (!selectedTraceId) {
      return [];
    }
    return (matter?.reviews ?? []).filter(
      (review) => String(review.answer_trace_id ?? "") === selectedTraceId
    );
  }, [matter, selectedTraceId]);

  const structuredClaimIds = useMemo(
    () => claimIdsFromTrace(selectedTrace),
    [selectedTrace]
  );

  function resetReviewForm() {
    setRating("mostly_correct");
    setSeverity("medium");
    setCategories([]);
    setComment("");
    setCorrectedAnswer("");
    setLessonCandidate("");
    setReviewOutcome("unclassified");
    setAddToEvaluationBank(false);
    setCreateLessonCandidate(false);
    setAffectedClaimIds([]);
  }

  function selectAnswerTrace(traceId: string | null) {
    setSelectedTraceId(traceId);
    resetReviewForm();
    setMessage(null);
    setMessageTone("info");
  }

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(`/api/lawyer-review${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Review-Token": token,
        ...(init.headers ?? {}),
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error ?? "Review API request failed");
    }
    return data;
  }

  async function loadQueue() {
    setLoading(true);
    setMessage(null);
    setMessageTone("info");
    try {
      window.localStorage.setItem("lawyerReviewToken", token);
      const data = await api(
        `?conversations=true&status=${encodeURIComponent(status)}&limit=80`
      );
      setQueue(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error ? error.message : "Failed to load queue"
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadMatter(
    matterId: string,
    preferredTraceId?: string | null
  ) {
    setLoading(true);
    setSelectedMatterId(matterId);
    setMessage(null);
    setMessageTone("info");
    try {
      const data = await api(`?matterId=${encodeURIComponent(matterId)}`);
      setMatter(data as MatterReview);
      const firstTrace = (data?.traces ?? [])[0];
      const preferredTrace = (data?.traces ?? []).find(
        (trace: Record<string, unknown>) =>
          String(trace.id ?? "") === preferredTraceId
      );
      const targetTrace = preferredTrace ?? firstTrace;
      selectAnswerTrace(targetTrace?.id ? String(targetTrace.id) : null);
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error ? error.message : "Failed to load matter"
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitReview() {
    if (!selectedTraceId) {
      setMessage("Select an answer trace first.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const submitted = await api("", {
        method: "POST",
        body: JSON.stringify({
          traceId: selectedTraceId,
          reviewer_name: reviewerName || null,
          reviewer_role: "lawyer",
          rating,
          severity,
          error_categories: categories,
          lawyer_comment: comment || null,
          corrected_answer: correctedAnswer || null,
          lesson_candidate: lessonCandidate || null,
          review_outcome:
            reviewOutcome === "unclassified" ? null : reviewOutcome,
          affected_claim_ids: affectedClaimIds,
          preferred_reasoning_or_research_approach: lessonCandidate || null,
          add_to_evaluation_bank: addToEvaluationBank,
          create_reasoning_lesson_candidate: createLessonCandidate,
          // Preserve legacy fields for older operational consumers, but do
          // not derive them from categories or lesson text.
          should_create_eval_case: addToEvaluationBank,
          should_create_lesson: createLessonCandidate,
          should_create_patch_task:
            severity === "high" || severity === "critical",
          review_status: "submitted",
        }),
      });
      if (selectedMatterId) {
        await loadMatter(selectedMatterId);
      }
      await loadQueue();
      resetReviewForm();
      setMessageTone("success");
      const artifactStatuses = Array.isArray(submitted?.phase7_artifacts)
        ? submitted.phase7_artifacts
            .map((item: { status?: string }) => item.status)
            .filter(Boolean)
            .join(", ")
        : "";
      setMessage(
        `Review submitted successfully. This answer is now marked as commented.${
          artifactStatuses ? ` Phase-7 artifacts: ${artifactStatuses}.` : ""
        }`
      );
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error ? error.message : "Failed to submit review"
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleCategory(category: string) {
    setCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">
            Immigration AI lawyer review
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Conversation audit and turn-level feedback
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            This page is a passive review surface. It reads stored answer traces
            and submits lawyer feedback. It does not alter chatbot inference,
            retrieval, or answer generation.
          </p>
        </header>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              onChange={(event) => setToken(event.target.value)}
              placeholder="Review token"
              type="password"
              value={token}
            />
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="uncommented">Uncommented conversations</option>
              <option value="commented">Commented conversations</option>
              <option value="all">All reviewable conversations</option>
            </select>
            <button
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={loading}
              onClick={loadQueue}
              type="button"
            >
              Load queue
            </button>
          </div>
          {message ? (
            <p
              className={`mt-3 rounded-xl px-3 py-2 text-sm ${
                messageTone === "success"
                  ? "bg-emerald-50 text-emerald-800"
                  : messageTone === "error"
                    ? "bg-red-50 text-red-700"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {message}
            </p>
          ) : null}
        </section>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.35fr]">
          <section className="rounded-3xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Conversation queue</h2>
            <p className="mt-1 text-sm text-slate-500">
              Only conversations with reviewable answer traces are shown.
            </p>
            <div className="mt-4 space-y-3">
              {queue.map((item) => (
                <button
                  className={`w-full rounded-2xl border p-4 text-left text-sm hover:border-sky-400 hover:bg-sky-50 ${
                    selectedMatterId === item.matter_id
                      ? "border-sky-500 bg-sky-50"
                      : "border-slate-200 bg-white"
                  }`}
                  key={item.matter_id}
                  onClick={() => loadMatter(item.matter_id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">
                      {item.issue_type || "Unclassified conversation"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${commentStatusClass(item)}`}
                    >
                      {commentStatusLabel(item)}
                    </span>
                  </div>
                  <p className="mt-2 text-slate-600">
                    {preview(
                      item.latest_user_message || item.first_user_message
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    matter {item.matter_id.slice(0, 8)} · traces{" "}
                    {item.trace_count ?? 0} · reviewed{" "}
                    {item.reviewed_trace_count ?? 0} · unreviewed{" "}
                    {item.unreviewed_trace_count ?? 0}
                  </p>
                </button>
              ))}
              {queue.length ? null : (
                <p className="text-sm text-slate-500">
                  No reviewable conversations found for this filter.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Matter review</h2>
              {matter ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                    <p>
                      <strong>Matter:</strong> {matter.matter_id}
                    </p>
                    <p>
                      <strong>Issue:</strong>{" "}
                      {String(matter.matter?.issue_type ?? "-")}
                    </p>
                    <p>
                      <strong>Visa:</strong>{" "}
                      {String(matter.matter?.visa_type ?? "-")}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold">Conversation history</h3>
                    <div className="mt-2 max-h-72 space-y-2 overflow-auto rounded-2xl border p-3 text-sm">
                      {matter.conversation_history.map((turn) => (
                        <div
                          className="rounded-xl bg-slate-50 p-3"
                          key={`${String(turn.role ?? "turn")}-${String(turn.timestamp ?? "")}-${String(turn.content ?? "").slice(0, 48)}`}
                        >
                          <p className="text-xs font-semibold uppercase text-slate-500">
                            {String(turn.role ?? "turn")}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap">
                            {String(turn.content ?? "")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold">Answer traces</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(matter.traces ?? []).map((trace) => (
                        <button
                          className={`rounded-full border px-3 py-1 text-xs ${
                            selectedTraceId === trace.id
                              ? "border-sky-500 bg-sky-50 text-sky-800"
                              : String(trace.review_status ?? "unreviewed") ===
                                  "reviewed"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-amber-200 bg-amber-50 text-amber-800"
                          }`}
                          key={String(trace.id)}
                          onClick={() => selectAnswerTrace(String(trace.id))}
                          type="button"
                        >
                          {String(trace.id).slice(0, 8)} ·{" "}
                          {String(trace.review_status ?? "unreviewed")}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Select a matter from the queue.
                </p>
              )}
            </div>

            {selectedTrace ? (
              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Selected answer</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      User
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {String(selectedTrace.user_message ?? "")}
                    </p>
                  </div>
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Assistant
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {String(selectedTrace.assistant_answer ?? "")}
                    </p>
                  </div>
                  <details className="rounded-2xl border p-4">
                    <summary className="cursor-pointer font-semibold">
                      Debug trace
                    </summary>
                    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-slate-600">
                      {JSON.stringify(selectedTrace.trace_json ?? {}, null, 2)}
                    </pre>
                  </details>
                </div>

                {selectedTraceReviews.length ? (
                  <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold text-emerald-950">
                        Existing lawyer comments
                      </h3>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-emerald-800">
                        {selectedTraceReviews.length} submitted
                      </span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {selectedTraceReviews.map((review, index) => (
                        <div
                          className="rounded-2xl border border-emerald-200 bg-white p-4 text-sm"
                          key={
                            review.id || `${review.answer_trace_id}-${index}`
                          }
                        >
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">
                              {review.reviewer_name || "Lawyer review"}
                            </span>
                            <span>·</span>
                            <span>{reviewDateLabel(review.created_at)}</span>
                            <span>·</span>
                            <span>rating: {review.rating || "-"}</span>
                            <span>·</span>
                            <span>severity: {review.severity || "-"}</span>
                          </div>
                          {review.error_categories?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {review.error_categories.map((category) => (
                                <span
                                  className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
                                  key={category}
                                >
                                  {category}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {review.lawyer_comment ? (
                            <div className="mt-3">
                              <p className="text-xs font-semibold uppercase text-slate-500">
                                Lawyer comment
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-slate-800">
                                {review.lawyer_comment}
                              </p>
                            </div>
                          ) : null}
                          {review.corrected_answer ? (
                            <div className="mt-3">
                              <p className="text-xs font-semibold uppercase text-slate-500">
                                Corrected answer
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-slate-800">
                                {review.corrected_answer}
                              </p>
                            </div>
                          ) : null}
                          {review.lesson_candidate ? (
                            <div className="mt-3">
                              <p className="text-xs font-semibold uppercase text-slate-500">
                                Reusable lesson candidate
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-slate-800">
                                {review.lesson_candidate}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    No lawyer comment has been submitted for this answer yet.
                  </div>
                )}

                <div className="mt-6 space-y-4 rounded-2xl bg-slate-50 p-4">
                  <h3 className="font-semibold">Lawyer review</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-sm font-medium">
                      Review outcome
                      <select
                        className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal"
                        onChange={(event) =>
                          setReviewOutcome(event.target.value)
                        }
                        value={reviewOutcome}
                      >
                        <option value="unclassified">Select outcome</option>
                        <option value="correct">Correct</option>
                        <option value="minor_issue">Minor issue</option>
                        <option value="material_issue">Material issue</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <input
                      className="rounded-xl border px-3 py-2 text-sm"
                      onChange={(event) => setReviewerName(event.target.value)}
                      placeholder="Reviewer name"
                      value={reviewerName}
                    />
                    <select
                      className="rounded-xl border px-3 py-2 text-sm"
                      onChange={(event) => setRating(event.target.value)}
                      value={rating}
                    >
                      <option value="correct">Correct</option>
                      <option value="mostly_correct">Mostly correct</option>
                      <option value="partially_correct">
                        Partially correct
                      </option>
                      <option value="incorrect">Incorrect</option>
                      <option value="unsafe">Unsafe / should not answer</option>
                    </select>
                    <select
                      className="rounded-xl border px-3 py-2 text-sm"
                      onChange={(event) => setSeverity(event.target.value)}
                      value={severity}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ERROR_CATEGORIES.map((category) => (
                      <button
                        className={`rounded-full border px-3 py-1 text-xs ${categories.includes(category) ? "border-sky-600 bg-sky-100" : "bg-white"}`}
                        key={category}
                        onClick={() => toggleCategory(category)}
                        type="button"
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="min-h-24 w-full rounded-xl border px-3 py-2 text-sm"
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Lawyer comment"
                    value={comment}
                  />
                  <textarea
                    className="min-h-24 w-full rounded-xl border px-3 py-2 text-sm"
                    onChange={(event) => setCorrectedAnswer(event.target.value)}
                    placeholder="Corrected answer or preferred wording"
                    value={correctedAnswer}
                  />
                  <textarea
                    className="min-h-20 w-full rounded-xl border px-3 py-2 text-sm"
                    onChange={(event) => setLessonCandidate(event.target.value)}
                    placeholder="Reasoning/research strategy: what should the system do differently next time?"
                    value={lessonCandidate}
                  />
                  {structuredClaimIds.length ? (
                    <fieldset className="rounded-xl border bg-white p-3 text-sm">
                      <legend className="px-1 font-semibold">
                        Affected claim IDs (optional)
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {structuredClaimIds.map((claimId) => (
                          <label
                            className="flex items-center gap-2"
                            key={claimId}
                          >
                            <input
                              checked={affectedClaimIds.includes(claimId)}
                              onChange={(event) =>
                                setAffectedClaimIds((current) =>
                                  event.target.checked
                                    ? [...current, claimId]
                                    : current.filter((item) => item !== claimId)
                                )
                              }
                              type="checkbox"
                            />
                            {claimId}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  <div className="space-y-2 rounded-xl border bg-white p-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        checked={addToEvaluationBank}
                        onChange={(event) =>
                          setAddToEvaluationBank(event.target.checked)
                        }
                        type="checkbox"
                      />
                      Add this review to Evaluation Bank
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        checked={createLessonCandidate}
                        onChange={(event) =>
                          setCreateLessonCandidate(event.target.checked)
                        }
                        type="checkbox"
                      />
                      Create reasoning lesson candidate
                    </label>
                  </div>
                  <button
                    className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={loading || !selectedTraceId}
                    onClick={submitReview}
                    type="button"
                  >
                    {loading ? "Submitting..." : "Submit review"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
