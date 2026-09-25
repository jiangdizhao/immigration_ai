"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSiteLocale } from "@/components/site-locale-provider";
import {
  formatLawyerWorkspaceDate,
  getLawyerWorkspaceAssistantLabel,
  getLawyerWorkspaceBucketLabel,
  getLawyerWorkspaceStatusLabel,
} from "@/lib/lawyer-workspace/copy";
import type { LawyerWorkspaceQueueItem as LawyerWorkspaceQueueRow } from "@/lib/lawyer-workspace/queue";
import {
  bucketForLawyerStatus,
  countLawyerQueue,
} from "@/lib/lawyer-workspace/queue";
import type { LawyerWorkspaceQueueBucket } from "@/lib/lawyer-workspace/types";

type QueueFilter = LawyerWorkspaceQueueBucket | "all";

const FILTERS: QueueFilter[] = [
  "all",
  "needs_action",
  "waiting_customer",
  "reviewed",
  "closed",
];

export function LawyerWorkspaceQueue() {
  const { locale } = useSiteLocale();
  const chinese = locale !== "en";
  const [requests, setRequests] = useState<LawyerWorkspaceQueueRow[]>([]);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/lawyer-portal/requests")
      .then(async (response) => {
        const data = (await response.json()) as {
          requests?: LawyerWorkspaceQueueRow[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "load failed");
        }
        setRequests(data.requests ?? []);
      })
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error ? loadError.message : "load failed"
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => countLawyerQueue(requests), [requests]);
  const visible = useMemo(() => {
    if (filter === "all") {
      return requests;
    }
    return requests.filter(
      (request) => bucketForLawyerStatus(request.status) === filter
    );
  }, [requests, filter]);

  if (error) {
    return <p className="text-sm text-red-700">{error}</p>;
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        {chinese ? "正在加载已分配请求。" : "Loading assigned requests."}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        {chinese ? "暂无分配给您的请求。" : "No requests are assigned to you."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((value) => (
          <button
            className={
              value === filter
                ? "rounded-full bg-amber-700 px-4 py-2 text-xs font-semibold text-white"
                : "rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
            }
            key={value}
            onClick={() => setFilter(value)}
            type="button"
          >
            {getLawyerWorkspaceBucketLabel(value, locale)}
            {" · "}
            {value === "all" ? counts.all : counts[value]}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {chinese ? "该分类暂无请求。" : "No requests in this category."}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((request) => (
            <Link
              className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-400"
              href={`/lawyer-portal/${request.id}`}
              key={request.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                  {getLawyerWorkspaceStatusLabel(request.status, locale)}
                </p>
                <p className="text-xs text-slate-500">
                  {formatLawyerWorkspaceDate(request.updatedAt, locale)}
                </p>
              </div>
              <p className="mt-3 break-words text-sm text-slate-600">
                {request.customerEmail}
                {" · "}
                {getLawyerWorkspaceAssistantLabel(
                  request.assistantMode,
                  locale
                )}
              </p>
              {request.legalMatterId ? (
                <p className="mt-1 break-all text-xs text-slate-500">
                  {request.legalMatterId}
                </p>
              ) : null}
              <p className="mt-3 line-clamp-2 break-words text-sm leading-6 text-slate-800">
                {request.questionPreview ||
                  (chinese
                    ? "问题预览暂不可用。"
                    : "Question preview unavailable.")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
