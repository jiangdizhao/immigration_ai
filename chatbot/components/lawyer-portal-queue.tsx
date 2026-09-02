"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RequestRecord = {
  id: string;
  customerEmail: string;
  status: string;
  questionSnapshot: string;
  updatedAt: string;
};

const labels: Record<string, string> = {
  pending: "Pending",
  in_review: "In review",
  confirmed: "Confirmed",
  corrected: "Corrected",
  needs_more_information: "Needs more information",
  closed: "Closed",
};

export function LawyerPortalQueue() {
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/lawyer-portal/requests")
      .then(async (response) => {
        const data = (await response.json()) as {
          requests?: RequestRecord[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load assigned requests.");
        }
        setRequests(data.requests ?? []);
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load assigned requests."
        )
      );
  }, []);

  if (error) {
    return <p className="text-sm text-red-700">{error}</p>;
  }
  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        No requests are assigned to you.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <Link
          className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-300"
          href={`/lawyer-portal/${request.id}`}
          key={request.id}
        >
          <div className="flex flex-wrap justify-between gap-3">
            <p className="font-semibold">
              {labels[request.status] ?? request.status}
            </p>
            <p className="text-xs text-slate-500">
              Updated {new Date(request.updatedAt).toLocaleString()}
            </p>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Customer: {request.customerEmail}
          </p>
          <p className="mt-3 line-clamp-2 text-sm text-slate-700">
            {request.questionSnapshot}
          </p>
        </Link>
      ))}
    </div>
  );
}
