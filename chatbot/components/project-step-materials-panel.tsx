"use client";

import { FileText, MessageSquare, ShieldAlert } from "lucide-react";
import type { ProjectConversationStageKey } from "@/lib/projects/stage-keys";
import type { ProjectOverview } from "@/lib/workspace/project-overview";
import type {
  ProjectStage,
  ProjectStageKey,
} from "@/lib/workspace/project-stages";
import type { ProjectWorkspaceView } from "@/lib/workspace/project-workspace-view";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type MaterialsCopy = WorkspaceCopy["projectEntry"]["projectWorkspace"];

const STAGE_LABEL_KEYS = {
  admissions: "stageAdmissions",
  applications: "stageApplications",
  documents: "stageDocuments",
  student500: "stageStudent500",
} as const satisfies Record<ProjectStageKey, keyof MaterialsCopy>;

/**
 * Phase 13 M9-A contextual materials rail.
 *
 * Everything here belongs to the *currently selected step*, so switching Project or
 * step cannot leave stale detail behind: the parent keys the component by Project and
 * section, and it only ever receives the current selection's real data.
 *
 * It offers at most one action per surface, and a closed capability is reported as a
 * blocked line instead of an empty list or a fake "all good" state.
 */
export function ProjectStepMaterialsPanel({
  copy,
  navigationBusy,
  onOpenStageChat,
  onSelectView,
  overview,
  pendingStageChatKey,
  stageChatError,
  stages,
  view,
}: {
  activeStageChatKey: ProjectConversationStageKey | null;
  copy: MaterialsCopy;
  navigationBusy: boolean;
  onOpenStageChat: (stageKey: ProjectConversationStageKey) => void;
  onSelectView: (view: ProjectWorkspaceView) => void;
  overview: ProjectOverview | null;
  pendingStageChatKey: ProjectConversationStageKey | null;
  stageChatError: string | null;
  stages: readonly ProjectStage[];
  view: ProjectWorkspaceView;
}) {
  const stage = stages.find((entry) => entry.view === view) ?? null;
  const documents = stages.find((entry) => entry.key === "documents");
  const chatStageKey = stage?.conversation.stageKey ?? null;
  return (
    <section
      className="rounded-xl bg-white p-3"
      data-testid="project-step-materials"
    >
      <h3 className="text-xs font-semibold text-slate-950">
        {copy.materialsTitle}
      </h3>
      <p
        className="mt-1 text-[11px] text-slate-600"
        data-testid="project-step-materials-step"
      >
        {stage ? copy[STAGE_LABEL_KEYS[stage.key]] : copy.overviewTitle}
        {stage && stage.count !== null ? ` · ${stage.count}` : null}
      </p>

      {chatStageKey ? (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {copy.materialsConversation}
          </p>
          {stage?.conversation.available ? (
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              data-testid="project-step-materials-chat"
              disabled={navigationBusy || pendingStageChatKey === chatStageKey}
              onClick={() => onOpenStageChat(chatStageKey)}
              type="button"
            >
              <MessageSquare aria-hidden="true" className="size-3" />
              {pendingStageChatKey === chatStageKey
                ? copy.stepChatOpening
                : stage?.conversation.bound
                  ? copy.stepChatReopen
                  : copy.stepChatOpen}
            </button>
          ) : (
            <p
              className="text-[10px] leading-4 text-amber-900"
              data-testid="project-step-materials-chat-unavailable"
            >
              {copy.stepChatUnavailable}
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-2 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {copy.materialsDocuments}
        </p>
        {documents && documents.capability === "available" ? (
          <>
            <p className="text-[11px] text-slate-600">
              {copy.openItems(documents.count ?? 0)}
            </p>
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              data-testid="project-step-materials-documents"
              disabled={navigationBusy}
              onClick={() => onSelectView("documents")}
              type="button"
            >
              <FileText aria-hidden="true" className="size-3" />
              {copy.materialsOpenDocuments}
            </button>
          </>
        ) : (
          <p
            className="flex items-start gap-1 text-[10px] leading-4 text-amber-900"
            data-testid="project-step-materials-documents-blocked"
          >
            <ShieldAlert
              aria-hidden="true"
              className="mt-0.5 size-3 shrink-0"
            />
            <span>
              {copy.materialsNoDocuments} {copy.blockerDocumentsUnavailable}
            </span>
          </p>
        )}
      </div>

      {overview ? (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {copy.materialsNextAction}
          </p>
          <p className="text-[11px] leading-5 text-slate-700">
            {overview.nextAction.kind === "open_stage"
              ? overview.nextAction.reason === "needs_information"
                ? copy.nextNeedsInformation
                : overview.nextAction.reason === "in_progress"
                  ? copy.nextInProgress
                  : copy.nextNotStarted
              : overview.nextAction.kind === "open_documents"
                ? copy.nextDocuments
                : copy.nextNone}
          </p>
        </div>
      ) : null}

      {stageChatError ? (
        <p
          className="mt-2 rounded bg-amber-50 px-2 py-1 text-[10px] leading-4 text-amber-900"
          data-testid="project-step-materials-chat-error"
        >
          {stageChatError}
        </p>
      ) : null}
    </section>
  );
}
