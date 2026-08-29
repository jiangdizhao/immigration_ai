"use client";

import { useEffect, useState } from "react";

type RequestRecord = {
  status: string;
  questionSnapshot: string;
  answerSnapshot: string;
  customerNote: string | null;
  lawyerResponse: string | null;
  correctedAnswer: string | null;
  createdAt: string;
};

export function LawyerRequestDetail({ id }: { id: string }) {
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/lawyer-requests/${id}`)
      .then(async (response) => {
        const data = (await response.json()) as RequestRecord & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load lawyer request.");
        }
        setRequest(data);
      })
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load lawyer request."
        );
      });
  }, [id]);

  if (error) {
    return <p className="mt-6 text-sm text-red-700">{error}</p>;
  }
  if (!request) {
    return <p className="mt-6 text-sm text-slate-500">Loading request...</p>;
  }

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-slate-500">
        Status:{" "}
        <span className="font-semibold text-slate-800">{request.status}</span> ·
        Submitted {new Date(request.createdAt).toLocaleString()}
      </p>
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Question
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
          {request.questionSnapshot}
        </p>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          AI answer
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
      {request.lawyerResponse ? (
        <div className="rounded-2xl bg-emerald-50 p-5 text-sm">
          <p className="font-semibold">Lawyer response</p>
          <p className="mt-1 whitespace-pre-wrap">{request.lawyerResponse}</p>
        </div>
      ) : null}
      {request.correctedAnswer ? (
        <div className="rounded-2xl bg-violet-50 p-5 text-sm">
          <p className="font-semibold">Corrected answer</p>
          <p className="mt-1 whitespace-pre-wrap">{request.correctedAnswer}</p>
        </div>
      ) : null}
    </div>
  );
}
