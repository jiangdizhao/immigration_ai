"use client";

import type { LawyerWorkspaceDetail } from "@/lib/lawyer-workspace/types";

type Props = {
  detail: LawyerWorkspaceDetail;
  locale: string;
};

export function DetailEvidence({ detail, locale }: Props) {
  const chinese = locale !== "en";
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-950">
          {chinese ? "官方 / 法律依据" : "Official / legal evidence"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {chinese
            ? "提供给 AI 的来源材料；仅有来源标题不代表已核验权威依据。"
            : "Source material supplied to the AI."}
        </p>
        <div className="mt-3 space-y-3">
          {detail.officialEvidence.length === 0 ? (
            <p className="text-sm text-slate-500">
              {chinese ? "暂无官方或法律依据。" : "No official evidence."}
            </p>
          ) : (
            detail.officialEvidence.map((item) => (
              <div
                className="rounded-xl bg-slate-50 p-3"
                key={`${item.kind}-${item.title ?? "untitled"}-${item.quote?.length ?? 0}`}
              >
                <p className="break-words text-sm font-semibold">
                  {item.title ?? item.kind}
                </p>
                {item.authority ? (
                  <p className="mt-1 break-words text-xs text-slate-500">
                    {item.authority}
                    {item.sourceType ? ` · ${item.sourceType}` : ""}
                  </p>
                ) : null}
                {item.usedFor ? (
                  <p className="mt-1 break-words text-xs text-slate-500">
                    {item.usedFor}
                  </p>
                ) : null}
                {item.quote ? (
                  <p className="mt-2 break-words text-sm">{item.quote}</p>
                ) : null}
                {item.url ? (
                  <p className="mt-2 break-all text-xs text-sky-800">
                    {item.url}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-sm font-semibold text-amber-900">
          {chinese ? "客户文件依据" : "Customer document evidence"}
        </h2>
        <p className="mt-1 text-xs text-amber-800">
          {chinese
            ? "客户勾选共享的有限摘录，不是完整文件；每项标明 AI 答复是否声明使用。"
            : "Bounded excerpts the customer chose to share, not full documents. Each item states whether the AI answer acknowledged using it."}
        </p>
        {detail.documentSharing ? (
          <p
            className="mt-1 text-xs text-amber-900"
            data-testid="lawyer-document-sharing"
          >
            {chinese
              ? `客户共享了 ${detail.documentSharing.selectedDocumentCount ?? 0} / ${detail.documentSharing.eligibleDocumentCount ?? 0} 个可选文件；其中 AI 声明使用过 ${detail.documentSharing.acknowledgedSharedCount ?? 0} 个，客户未共享 ${detail.documentSharing.acknowledgedWithheldCount ?? 0} 个 AI 声明使用过的文件。`
              : `Customer shared ${detail.documentSharing.selectedDocumentCount ?? 0} of ${detail.documentSharing.eligibleDocumentCount ?? 0} selectable documents; ${detail.documentSharing.acknowledgedSharedCount ?? 0} were acknowledged by the AI answer, and ${detail.documentSharing.acknowledgedWithheldCount ?? 0} acknowledged document(s) were withheld by customer choice.`}
          </p>
        ) : null}
        <div className="mt-3 space-y-3">
          {detail.customerDocumentEvidence.length === 0 ? (
            <p className="text-sm text-amber-800">
              {chinese ? "暂无客户文件摘录。" : "No customer documents."}
            </p>
          ) : (
            detail.customerDocumentEvidence.map((item) => (
              <div
                className="rounded-xl bg-white p-3"
                key={`${item.filename}-${item.quote.length}`}
              >
                <p className="break-words text-sm font-semibold">
                  {item.filename}
                </p>
                <p className="mt-1 break-words text-xs text-slate-500">
                  {[item.runStatus, item.extractionMethod, item.locator]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p
                  className={`mt-1 text-xs ${
                    item.usedByAnswer ? "text-amber-900" : "text-amber-700"
                  }`}
                >
                  {item.usedByAnswer
                    ? chinese
                      ? "AI 答复已声明使用此文件，且客户选择共享。"
                      : "The AI answer acknowledged using this document, and the customer shared it."
                    : chinese
                      ? "客户选择共享的文件；AI 答复未声明使用。"
                      : "Selected by the customer to share with you; the AI answer did not claim to use it."}
                </p>
                <p className="mt-2 break-words text-sm">{item.quote}</p>
                {item.truncated ? (
                  <p className="mt-1 text-xs text-amber-800">
                    {chinese ? "摘录可能不完整。" : "Excerpt may be truncated."}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
