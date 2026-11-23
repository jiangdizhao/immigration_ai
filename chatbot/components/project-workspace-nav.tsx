"use client";

import { ChevronRight, MessageSquarePlus } from "lucide-react";
import type { ProjectConversationStageKey } from "@/lib/projects/stage-keys";
import type {
  ProjectStage,
  ProjectStageKey,
} from "@/lib/workspace/project-stages";
import type { ProjectWorkspaceView } from "@/lib/workspace/project-workspace-view";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type NavCopy = WorkspaceCopy["projectEntry"]["projectWorkspace"];

const STAGE_LABEL_KEYS = {
  admissions: "stageAdmissions",
  applications: "stageApplications",
  documents: "stageDocuments",
  student500: "stageStudent500",
} as const satisfies Record<ProjectStageKey, keyof NavCopy>;

function StageIcon() {
  return <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />;
}

/**
 * Phase 13 M9-A Project navigation rail.
 *
 * The rail is navigation only. Application-specific progress and record counts come
 * from the M1 Project Journey in the main canvas, so this older workspace summary
 * cannot present a competing progress story. Every destination still re-checks access.
 */
export function ProjectWorkspaceNav({
  activeStageChatKey,
  copy,
  navigationBusy,
  onOpenStageChat,
  onSelectView,
  pendingStageChatKey,
  stageChatError,
  stages,
  view,
}: {
  activeStageChatKey: ProjectConversationStageKey | null;
  copy: NavCopy;
  navigationBusy: boolean;
  onOpenStageChat: (stageKey: ProjectConversationStageKey) => void;
  onSelectView: (view: ProjectWorkspaceView) => void;
  pendingStageChatKey: ProjectConversationStageKey | null;
  stageChatError: string | null;
  stages: readonly ProjectStage[];
  view: ProjectWorkspaceView;
}) {
  return (
    <nav
      aria-label={copy.navTitle}
      className="mb-4 space-y-2 border-t border-slate-200 pt-3"
      data-testid="project-workspace-nav"
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {copy.navStages}
      </h3>
      <ul className="space-y-1">
        {stages.map((stage) => {
          const selected = stage.view === view;
          const chatStageKey = stage.conversation.stageKey;
          const busy = navigationBusy || pendingStageChatKey === chatStageKey;
          return (
            <li key={stage.key}>
              <div
                className={
                  selected
                    ? "rounded-lg bg-[#001736] px-2 py-1.5 text-white"
                    : "rounded-lg px-2 py-1.5 hover:bg-slate-200/60"
                }
              >
                <button
                  aria-current={selected ? "page" : undefined}
                  className="flex w-full items-center gap-1.5 text-left text-xs font-semibold disabled:opacity-60"
                  data-testid={`project-nav-stage-${stage.key}`}
                  disabled={navigationBusy}
                  onClick={() => onSelectView(stage.view)}
                  type="button"
                >
                  <StageIcon />
                  <span className="min-w-0 flex-1 truncate">
                    {copy[STAGE_LABEL_KEYS[stage.key]]}
                  </span>
                </button>
                {chatStageKey ? (
                  <button
                    aria-pressed={activeStageChatKey === chatStageKey}
                    className={
                      selected
                        ? "mt-1 ml-5 inline-flex min-h-8 items-center gap-1 text-[10px] font-semibold text-cyan-100 underline disabled:opacity-60"
                        : "mt-1 ml-5 inline-flex min-h-8 items-center gap-1 text-[10px] font-semibold text-blue-900 underline disabled:opacity-60"
                    }
                    data-testid={`project-nav-stage-chat-${stage.key}`}
                    disabled={!stage.conversation.available || busy}
                    onClick={() => onOpenStageChat(chatStageKey)}
                    type="button"
                  >
                    <MessageSquarePlus aria-hidden="true" className="size-3" />
                    {pendingStageChatKey === chatStageKey
                      ? copy.stepChatOpening
                      : stage.conversation.bound
                        ? copy.stepChatReopen
                        : copy.stepChatOpen}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {stageChatError ? (
        <p
          className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] leading-4 text-amber-900"
          data-testid="project-nav-stage-chat-error"
        >
          {stageChatError}
        </p>
      ) : null}
    </nav>
  );
}
