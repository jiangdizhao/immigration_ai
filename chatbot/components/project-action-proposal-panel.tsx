"use client";

import { useState } from "react";
import type { ActiveStepSelectionV1 } from "@/lib/workspace/active-step-context";
import {
  type BoundAIActionSuggestionV1,
  boundSuggestionMatchesTask,
} from "@/lib/workspace/ai-action-suggestions";
import type { WorkflowTaskProjectionV1 } from "@/lib/workspace/project-workflows";

type ProposalPreview = {
  proposalId: string;
  targetKind: "school_application" | "student500_application";
  targetId: string;
  fieldPath: string;
  projectId: string;
  baseRevision: number;
  display: {
    targetLabel: string;
    currentValue: string | null;
    proposedValue: string | null;
    sourceLabel: string;
    packageNote: string;
  };
};

type ProposalResponse = {
  proposal?: ProposalPreview;
  confirmationToken?: string;
  error?: string;
  readback?: "verified";
};

function activeSelection(
  task: WorkflowTaskProjectionV1
): ActiveStepSelectionV1 {
  return {
    schemaVersion: "phase15.active-step-selection.v1",
    projectId: task.projectId,
    taskId: task.taskId,
    workflowKind: task.workflowKind,
    definitionVersion: task.definitionVersion,
    stepKey: task.stepKey,
    targetKind: task.targetKind,
    targetId: task.targetId,
    sourceRevisions: task.sourceRevisions.map((revision) => ({ ...revision })),
  };
}

async function responseBody(response: Response): Promise<ProposalResponse> {
  return (await response.json().catch(() => ({}))) as ProposalResponse;
}

export function ProjectActionProposalPanel({
  aiActionSuggestion,
  chatId,
  onApplied,
  projectId,
  task,
  locale,
}: {
  aiActionSuggestion?: BoundAIActionSuggestionV1 | null;
  chatId: string | null;
  onApplied: () => void;
  projectId: string;
  task: WorkflowTaskProjectionV1;
  locale: string;
}) {
  const [intakeLabel, setIntakeLabel] = useState("");
  const [applicationPlace, setApplicationPlace] = useState<
    "onshore" | "offshore" | "unknown"
  >("unknown");
  const [preview, setPreview] = useState<ProposalPreview | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dismissedSuggestionKey, setDismissedSuggestionKey] = useState<
    string | null
  >(null);
  const isChinese = locale.toLowerCase().startsWith("zh");
  const copy = isChinese
    ? {
        title: "审核并确认草稿修改",
        unavailable: "当前步骤不支持可确认的草稿修改。",
        researchUnavailable:
          "当前没有可验证来源身份的结构化课程候选。可以继续在聊天中研究并查看真实引用；这里不会伪造课程记录。",
        customerReportedOnly:
          "保存的批次仍是客户报告信息，不会验证课程来源，也不会因此完成官方来源研究。",
        intake: "申请入学批次标签（客户报告）",
        applicationPlace: "申请地点（客户报告）",
        review: "查看修改预览",
        aiSuggestion: "AI 提出的修改建议（未经验证）",
        aiSuggestionBasis: "AI 说明的依据（未经验证）",
        aiSuggestionDetails: "说明",
        aiSuggestionReview: "审核此 AI 建议",
        dismissSuggestion: "忽略建议",
        confirm: "确认并保存",
        cancel: "取消",
        current: "当前保存值",
        proposed: "拟修改为",
        target: "目标",
        project: "目标项目",
        field: "修改字段",
        revision: "基础版本",
        source: "来源/假设",
        dependency: "相关影响",
        saving: "正在重新授权、保存并读取结果…",
        done: "已从业务服务重新读取保存记录。工作流正在刷新。",
        error:
          "无法创建或确认修改。记录可能已变化、权限已撤销或功能不可用。请刷新后重新审核。",
      }
    : {
        title: "Review and confirm a draft change",
        unavailable:
          "This selected step does not support a confirmable draft change.",
        researchUnavailable:
          "Structured course candidates with verifiable source identity are unavailable. Continue research in Chat and inspect its real citations; this panel will not invent catalog records.",
        customerReportedOnly:
          "The saved intake remains customer-reported. This does not verify the course source or complete official-source research.",
        intake: "Intake label (customer-reported)",
        applicationPlace: "Application place (customer-reported)",
        review: "Review change",
        aiSuggestion: "AI suggested change (unverified)",
        aiSuggestionBasis: "AI stated basis (unverified)",
        aiSuggestionDetails: "Explanation",
        aiSuggestionReview: "Review this AI suggestion",
        dismissSuggestion: "Discard suggestion",
        confirm: "Confirm and save",
        cancel: "Cancel",
        current: "Currently saved",
        proposed: "Proposed value",
        target: "Target",
        project: "Target Project",
        field: "Field",
        revision: "Base revision",
        source: "Source / assumption",
        dependency: "Affected dependency",
        saving: "Reauthorizing, saving and reading back…",
        done: "The owning service read back the saved record. Workflow state is refreshing.",
        error:
          "The change could not be created or confirmed. The record may have changed, access may have been revoked, or the feature may be unavailable. Refresh and review again.",
      };

  const schoolTask =
    task.workflowKind === "school_application" &&
    task.stepKey === "school_discovery" &&
    task.targetKind === "school_application";
  const studentTask =
    task.workflowKind === "student_500" &&
    task.stepKey === "visa_planning" &&
    task.targetKind === "student500_application";
  if (!schoolTask && !studentTask) {
    return null;
  }

  const customerReportedIntakeOnly =
    schoolTask &&
    task.applicability === "unavailable" &&
    task.actionability === "unavailable" &&
    task.reasonCodes.length === 1 &&
    task.reasonCodes[0] === "school_course_source_unverified";
  const enabled = Boolean(
    chatId &&
      task.projectId === projectId &&
      (customerReportedIntakeOnly ||
        (task.applicability === "applicable" &&
          task.actionability !== "unavailable"))
  );

  const currentAiSuggestion = boundSuggestionMatchesTask({
    suggestion: aiActionSuggestion,
    projectId,
    chatId,
    task,
  })
    ? aiActionSuggestion
    : null;
  const currentSuggestionKey = currentAiSuggestion
    ? JSON.stringify(currentAiSuggestion)
    : null;
  const showAiSuggestion = Boolean(
    currentAiSuggestion && currentSuggestionKey !== dismissedSuggestionKey
  );

  async function createPreview(
    suggestion?: BoundAIActionSuggestionV1["suggestion"]
  ) {
    if (!chatId || !enabled) {
      return;
    }
    const fieldPath =
      suggestion?.fieldPath ??
      (schoolTask
        ? "schoolApplication.intakeLabel"
        : "student500.applicationPlace");
    const proposedValue =
      suggestion?.proposedValue ??
      (schoolTask ? intakeLabel.trim() || null : applicationPlace);
    if (
      (schoolTask && fieldPath !== "schoolApplication.intakeLabel") ||
      (studentTask && fieldPath !== "student500.applicationPlace")
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/action-proposals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            selection: activeSelection(task),
            fieldPath,
            proposedValue,
          }),
        }
      );
      const body = await responseBody(response);
      if (!response.ok || !body.proposal || !body.confirmationToken) {
        throw new Error(body.error ?? "proposal_failed");
      }
      setPreview(body.proposal);
      setConfirmationToken(body.confirmationToken);
    } catch {
      setMessage(copy.error);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setPreview(null);
    setConfirmationToken(null);
    setMessage(null);
  }

  async function confirm() {
    if (!confirmationToken) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/action-proposals/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmationToken }),
        }
      );
      const body = await responseBody(response);
      if (!response.ok || body.readback !== "verified") {
        throw new Error(body.error ?? "confirmation_failed");
      }
      setPreview(null);
      setConfirmationToken(null);
      setMessage(copy.done);
      onApplied();
    } catch {
      setMessage(copy.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label={copy.title}
      className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3"
      data-testid="project-action-proposal-panel"
    >
      <h3 className="text-sm font-semibold text-slate-950">{copy.title}</h3>
      {schoolTask ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-950">
          <p>{copy.researchUnavailable}</p>
          {customerReportedIntakeOnly ? (
            <p>{copy.customerReportedOnly}</p>
          ) : null}
        </div>
      ) : null}
      {showAiSuggestion && currentAiSuggestion ? (
        <div
          className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-950"
          data-testid="project-ai-action-suggestion"
        >
          <p className="font-semibold">{copy.aiSuggestion}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="font-semibold">{copy.target}</dt>
            <dd className="break-all">
              {currentAiSuggestion.suggestion.targetReference ??
                currentAiSuggestion.targetId}
            </dd>
            <dt className="font-semibold">{copy.field}</dt>
            <dd>{currentAiSuggestion.suggestion.fieldPath}</dd>
            <dt className="font-semibold">{copy.proposed}</dt>
            <dd className="break-words">
              {currentAiSuggestion.suggestion.proposedValue}
            </dd>
            <dt className="font-semibold">{copy.aiSuggestionBasis}</dt>
            <dd className="break-words">
              {currentAiSuggestion.suggestion.sourceOrAssumption}
            </dd>
            <dt className="font-semibold">{copy.aiSuggestionDetails}</dt>
            <dd className="break-words">
              {currentAiSuggestion.suggestion.explanation}
            </dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-10 rounded-lg bg-violet-900 px-3 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy || !enabled}
              onClick={() => createPreview(currentAiSuggestion.suggestion)}
              type="button"
            >
              {copy.aiSuggestionReview}
            </button>
            <button
              className="min-h-10 rounded-lg border border-violet-300 px-3 text-sm font-semibold text-violet-950 disabled:opacity-50"
              disabled={busy}
              onClick={() => setDismissedSuggestionKey(currentSuggestionKey)}
              type="button"
            >
              {copy.dismissSuggestion}
            </button>
          </div>
        </div>
      ) : null}
      {enabled && !preview ? (
        <div className="space-y-2">
          {schoolTask ? (
            <label className="block space-y-1 text-xs font-medium text-slate-800">
              <span>{copy.intake}</span>
              <input
                className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                maxLength={120}
                onChange={(event) => setIntakeLabel(event.currentTarget.value)}
                value={intakeLabel}
              />
            </label>
          ) : (
            <label className="block space-y-1 text-xs font-medium text-slate-800">
              <span>{copy.applicationPlace}</span>
              <select
                className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                onChange={(event) =>
                  setApplicationPlace(
                    event.currentTarget.value as
                      | "onshore"
                      | "offshore"
                      | "unknown"
                  )
                }
                value={applicationPlace}
              >
                <option value="unknown">Unknown</option>
                <option value="onshore">Onshore</option>
                <option value="offshore">Offshore</option>
              </select>
            </label>
          )}
          <button
            className="min-h-10 rounded-lg bg-blue-900 px-3 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => createPreview()}
            type="button"
          >
            {copy.review}
          </button>
        </div>
      ) : null}
      {enabled ? null : (
        <p className="text-xs leading-5 text-slate-700">{copy.unavailable}</p>
      )}
      {preview ? (
        <div className="space-y-3 rounded-lg border border-slate-300 bg-white p-3 text-xs leading-5 text-slate-800">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="font-semibold">{copy.project}</dt>
            <dd className="break-all">{preview.projectId}</dd>
            <dt className="font-semibold">{copy.target}</dt>
            <dd className="break-all">
              {preview.display.targetLabel} · {preview.targetId}
            </dd>
            <dt className="font-semibold">{copy.field}</dt>
            <dd>{preview.fieldPath}</dd>
            <dt className="font-semibold">{copy.current}</dt>
            <dd>{preview.display.currentValue || "—"}</dd>
            <dt className="font-semibold">{copy.proposed}</dt>
            <dd>{preview.display.proposedValue || "—"}</dd>
            <dt className="font-semibold">{copy.revision}</dt>
            <dd>{preview.baseRevision}</dd>
            <dt className="font-semibold">{copy.source}</dt>
            <dd>{preview.display.sourceLabel}</dd>
            <dt className="font-semibold">{copy.dependency}</dt>
            <dd>{preview.display.packageNote}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-10 rounded-lg bg-blue-900 px-3 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={confirm}
              type="button"
            >
              {busy ? copy.saving : copy.confirm}
            </button>
            <button
              className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 disabled:opacity-50"
              disabled={busy}
              onClick={cancel}
              type="button"
            >
              {copy.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p aria-live="polite" className="text-xs leading-5 text-slate-800">
          {message}
        </p>
      ) : null}
    </section>
  );
}
