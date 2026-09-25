"use client";

import { getLawyerWorkspaceRoleLabel } from "@/lib/lawyer-workspace/copy";
import type { LawyerWorkspaceDetail } from "@/lib/lawyer-workspace/types";

type Props = {
  detail: LawyerWorkspaceDetail;
  locale: string;
};

export function DetailThread({ detail, locale }: Props) {
  const chinese = locale !== "en";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-950">
        {chinese ? "澄清沟通记录" : "Clarification thread"}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {chinese
          ? "该请求的已保存澄清消息，不是实时聊天。"
          : "Saved clarification messages. This is not a real-time chat."}
      </p>
      <div className="mt-3 space-y-3">
        {detail.messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            {chinese ? "暂无澄清消息。" : "No clarification messages yet."}
          </p>
        ) : (
          detail.messages.map((message) => (
            <div className="rounded-xl bg-slate-50 p-3" key={message.id}>
              <p className="text-xs font-semibold text-slate-500">
                {getLawyerWorkspaceRoleLabel(message.authorRole, locale)}
              </p>
              <p className="mt-1 break-words text-sm">{message.body}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
