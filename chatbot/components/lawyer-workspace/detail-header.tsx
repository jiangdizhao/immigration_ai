"use client";

import {
  formatLawyerWorkspaceDate,
  getLawyerWorkspaceAssistantLabel,
  getLawyerWorkspaceStatusLabel,
} from "@/lib/lawyer-workspace/copy";
import type { LawyerWorkspaceDetail } from "@/lib/lawyer-workspace/types";

type Props = {
  detail: LawyerWorkspaceDetail;
  locale: string;
};

export function DetailHeader({ detail, locale }: Props) {
  const chinese = locale !== "en";
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
        {chinese ? "已分配请求" : "Assigned request"}
      </p>
      <h2 className="mt-2 break-words text-lg font-semibold text-slate-950">
        {chinese ? "客户" : "Customer"} · {detail.customerEmail || "—"}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-amber-700 px-3 py-1 font-semibold text-white">
          {getLawyerWorkspaceStatusLabel(detail.request.status, locale)}
        </span>
        <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-700">
          {getLawyerWorkspaceAssistantLabel(
            detail.request.assistantMode,
            locale
          )}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded-xl bg-white p-3">
          <dt className="font-semibold text-slate-500">
            {chinese ? "关联事项" : "Linked matter"}
          </dt>
          <dd className="mt-1 break-all text-slate-800">
            {detail.request.legalMatterId || "—"}
          </dd>
        </div>
        <div className="rounded-xl bg-white p-3">
          <dt className="font-semibold text-slate-500">
            {chinese ? "创建时间" : "Created"}
          </dt>
          <dd className="mt-1 break-words text-slate-800">
            {formatLawyerWorkspaceDate(detail.request.createdAt, locale)}
          </dd>
        </div>
        <div className="rounded-xl bg-white p-3">
          <dt className="font-semibold text-slate-500">
            {chinese ? "更新时间" : "Updated"}
          </dt>
          <dd className="mt-1 break-words text-slate-800">
            {formatLawyerWorkspaceDate(detail.request.updatedAt, locale)}
          </dd>
        </div>
        <div className="rounded-xl bg-white p-3">
          <dt className="font-semibold text-slate-500">
            {chinese ? "审核时间" : "Reviewed"}
          </dt>
          <dd className="mt-1 break-words text-slate-800">
            {formatLawyerWorkspaceDate(detail.request.reviewedAt, locale)}
          </dd>
        </div>
        {detail.request.closedAt ? (
          <div className="rounded-xl bg-white p-3 sm:col-span-2">
            <dt className="font-semibold text-slate-500">
              {chinese ? "关闭时间" : "Closed"}
            </dt>
            <dd className="mt-1 break-words text-slate-800">
              {formatLawyerWorkspaceDate(detail.request.closedAt, locale)}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
