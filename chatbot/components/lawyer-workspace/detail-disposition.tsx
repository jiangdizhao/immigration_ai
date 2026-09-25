"use client";

import { getLawyerWorkspaceActionLabel } from "@/lib/lawyer-workspace/copy";

type Props = {
  actions: string[];
  loading: boolean;
  notice: string | null;
  locale: string;
  lawyerResponse: string;
  onLawyerResponse: (value: string) => void;
  correctedAnswer: string;
  onCorrectedAnswer: (value: string) => void;
  approach: string;
  onApproach: (value: string) => void;
  createCandidate: boolean;
  onCreateCandidate: (value: boolean) => void;
  learningAvailable: boolean;
  onUpdate: (status: string) => void;
};

export function DetailDisposition(props: Props) {
  const chinese = props.locale !== "en";
  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-950">
        {chinese ? "律师处理" : "Lawyer disposition"}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {chinese
          ? "律师回复不同于 AI 回答。服务器校验仍然有效。"
          : "A lawyer response is not the AI answer. Server validation applies."}
      </p>
      <label className="mt-4 block text-xs font-semibold text-slate-700">
        {chinese ? "律师回复" : "Lawyer response"}
        <textarea
          className="mt-1 min-h-28 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal"
          onChange={(event) => props.onLawyerResponse(event.target.value)}
          value={props.lawyerResponse}
        />
      </label>
      <label className="mt-3 block text-xs font-semibold text-slate-700">
        {chinese ? "修正答复" : "Corrected answer"}
        <textarea
          className="mt-1 min-h-32 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal"
          onChange={(event) => props.onCorrectedAnswer(event.target.value)}
          value={props.correctedAnswer}
        />
      </label>
      <div className="mt-3 rounded-xl bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-700">
          {chinese ? "高级 AI 改进反馈" : "Advanced AI improvement feedback"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {chinese
            ? "可选的现有学习流程反馈，不会改变面向客户的处理结果本身。"
            : "Optional feedback for the existing learning pipeline."}
        </p>
        {props.learningAvailable ? (
          <>
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal"
              onChange={(event) => props.onApproach(event.target.value)}
              value={props.approach}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
              <input
                checked={props.createCandidate}
                onChange={(event) =>
                  props.onCreateCandidate(event.target.checked)
                }
                type="checkbox"
              />
              {chinese
                ? "创建推理课程候选"
                : "Create a reasoning lesson candidate"}
            </label>
          </>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            {chinese ? "暂无学习反馈。" : "Learning feedback unavailable."}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {props.actions.map((action) => (
          <button
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={props.loading}
            key={action}
            onClick={() => props.onUpdate(action)}
            type="button"
          >
            {getLawyerWorkspaceActionLabel(action, props.locale)}
          </button>
        ))}
      </div>
      {props.notice ? (
        <p className="mt-3 text-sm text-slate-700">{props.notice}</p>
      ) : null}
    </section>
  );
}
