"use client";

import {
  formatLawyerWorkspaceDate,
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
          {formatLawyerWorkspaceDate(detail.request.updatedAt, locale)}
        </span>
      </div>
      {detail.request.legalMatterId ? (
        <p className="mt-3 break-all text-xs text-amber-900">
          {chinese ? "关联事项" : "Linked matter"} ·{" "}
          {detail.request.legalMatterId}
        </p>
      ) : null}
    </section>
  );
}
