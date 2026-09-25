"use client";

import { getLawyerWorkspaceContextRoleLabel } from "@/lib/lawyer-workspace/copy";
import type { LawyerWorkspaceDetail } from "@/lib/lawyer-workspace/types";

type Props = {
  detail: LawyerWorkspaceDetail;
  locale: string;
};

export function DetailSnapshots({ detail, locale }: Props) {
  const chinese = locale !== "en";
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-950">
          {chinese ? "客户问题" : "Customer question"}
        </h2>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
          {detail.question || "—"}
        </p>
        {detail.customerNote ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-600">
              {chinese ? "客户备注" : "Customer note"}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {detail.customerNote}
            </p>
          </div>
        ) : null}
      </section>
      <section className="rounded-2xl border border-purple-200 bg-purple-50 p-5">
        <h2 className="text-sm font-semibold text-purple-900">
          {chinese ? "待审核 AI 回答" : "AI answer under review"}
        </h2>
        <p className="mt-1 text-xs text-purple-800">
          {chinese
            ? "AI 分析内容，不是律师意见。"
            : "AI analysis. This is not lawyer advice."}
        </p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">
          {detail.aiAnswer || "—"}
        </p>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:col-span-2">
        <h2 className="text-sm font-semibold text-slate-950">
          {chinese ? "交接上下文" : "Captured handoff context"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {chinese
            ? "已捕获的有限上下文，不是客户完整的实时对话记录。"
            : "Captured bounded context. This is not the full live conversation."}
        </p>
        <div className="mt-3 space-y-2">
          {detail.handoffContext.length === 0 ? (
            <p className="text-sm text-slate-500">
              {chinese ? "暂无交接上下文。" : "No handoff context."}
            </p>
          ) : (
            detail.handoffContext.map((item) => (
              <p className="break-words text-sm" key={item.order}>
                {getLawyerWorkspaceContextRoleLabel(item.role, locale)}
                {": "}
                {item.text || "—"}
              </p>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
