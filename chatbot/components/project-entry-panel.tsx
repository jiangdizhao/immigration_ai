"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createProjectEntryController,
  openSelectedProjectChat,
  type ProjectEntryChat,
  type ProjectEntryProject,
  projectEntryButtonDisabled,
  runProjectNavigationAction,
} from "@/lib/workspace/project-entry";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type ProjectEntryCopy = WorkspaceCopy["projectEntry"];

export function BackToConversationsButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex h-10 min-h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 text-sm font-semibold text-blue-950 shadow-sm transition enabled:hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-75"
      data-testid="back-to-all-conversations"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 text-left leading-4">{label}</span>
    </button>
  );
}

function projectLabel(
  project: ProjectEntryProject,
  locale: string,
  copy: ProjectEntryCopy
) {
  const date = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(project.createdAt));
  return copy.projectLabel(date, project.id.slice(0, 8));
}

export function ProjectEntryPanel({
  copy,
  locale,
  onOpenProjectChat,
  onSelectedProjectChange,
  clearSelectionSignal,
  navigationBusy,
}: {
  copy: ProjectEntryCopy;
  locale: string;
  onOpenProjectChat: (chatId: string) => Promise<void> | void;
  onSelectedProjectChange: (projectId: string | null) => void;
  /** Changed when global history or the Standalone action takes focus. */
  clearSelectionSignal: number;
  /** Mirrors the Workspace's conversation load and active-turn state. */
  navigationBusy: boolean;
}) {
  const [controller] = useState(() => createProjectEntryController({ copy }));
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);
  const appliedClearSignal = useRef(clearSelectionSignal);
  const openingChatRef = useRef(false);
  const navigationBusyRef = useRef(navigationBusy);
  navigationBusyRef.current = navigationBusy;

  function runWhenIdle<T>(action: () => T) {
    return runProjectNavigationAction({
      isBusy: () => navigationBusyRef.current,
      action,
    });
  }

  function selectProject(projectId: string | null) {
    runWhenIdle(() =>
      controller.selectProject(projectId).catch(() => undefined)
    );
  }

  function openCreateProjectDialog() {
    runWhenIdle(() => controller.openCreateDialog());
  }

  useEffect(() => {
    controller.setCopy(copy);
  }, [controller, copy]);

  useEffect(() => {
    controller.refreshProjects().catch(() => undefined);
  }, [controller]);

  useEffect(() => {
    onSelectedProjectChange(state.selectedProjectId);
  }, [onSelectedProjectChange, state.selectedProjectId]);

  useEffect(() => {
    if (appliedClearSignal.current === clearSelectionSignal) {
      return;
    }
    appliedClearSignal.current = clearSelectionSignal;
    controller.selectProject(null).catch(() => undefined);
  }, [clearSelectionSignal, controller]);

  const selectedProject = state.projects.find(
    (project) => project.id === state.selectedProjectId
  );

  async function openChat(chat: ProjectEntryChat) {
    await openProjectChat(chat.chatId, chat.projectId);
  }

  async function openProjectChat(chatId: string, projectId: string) {
    const navigation = runWhenIdle(() => {
      if (openingChatRef.current) {
        return null;
      }
      openingChatRef.current = true;
      setOpeningChatId(chatId);
      return openSelectedProjectChat({
        chatId,
        projectId,
        selectedProjectId: controller.getSnapshot().selectedProjectId,
        onOpen: onOpenProjectChat,
      });
    });
    if (!navigation.allowed || navigation.result === null) {
      return;
    }
    try {
      await navigation.result;
    } catch {
      controller.setError(copy.requestFailed);
    } finally {
      openingChatRef.current = false;
      setOpeningChatId(null);
    }
  }

  async function createProjectChat() {
    const navigation = runWhenIdle(() => controller.createProjectChat());
    if (!navigation.allowed) {
      return;
    }
    const chat = await navigation.result;
    if (
      chat &&
      !navigationBusyRef.current &&
      controller.getSnapshot().selectedProjectId === chat.projectId
    ) {
      await openProjectChat(chat.chatId, chat.projectId);
    }
  }

  return (
    <section
      aria-label={copy.projects}
      className="mb-4 flex flex-col gap-2 sm:gap-3 xl:gap-2"
      data-testid="project-entry-panel"
    >
      <div>
        <button
          className="w-full rounded-xl bg-[#001736] px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-[#002b5b] disabled:opacity-50"
          data-testid="create-project-open"
          disabled={projectEntryButtonDisabled(navigationBusy)}
          onClick={openCreateProjectDialog}
          type="button"
        >
          + {copy.createProject}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <button
          aria-controls="workspace-project-list"
          aria-expanded={projectsExpanded}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50"
          data-testid="toggle-project-list"
          onClick={() => setProjectsExpanded((expanded) => !expanded)}
          type="button"
        >
          <span>{copy.projects}</span>
          <span aria-hidden="true">{projectsExpanded ? "−" : "+"}</span>
        </button>
        <div
          className="space-y-1 border-t border-slate-100 p-2"
          data-testid="workspace-project-list"
          hidden={!projectsExpanded}
          id="workspace-project-list"
        >
          {state.loadingProjects ? (
            <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
              {copy.loadingProjects}
            </p>
          ) : null}
          {!state.loadingProjects && state.projects.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
              {copy.projectsEmpty}
            </p>
          ) : null}
          {state.projects.map((project) => (
            <button
              aria-label={`${projectLabel(project, locale, copy)} · ${copy.projectId} ${project.id}`}
              className={`block w-full rounded-lg px-2.5 py-2 text-left text-xs leading-5 transition ${
                project.id === state.selectedProjectId
                  ? "bg-blue-50 font-semibold text-blue-950"
                  : "text-slate-700 hover:bg-slate-50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
              data-testid="project-list-item"
              disabled={projectEntryButtonDisabled(navigationBusy)}
              key={project.id}
              onClick={() => selectProject(project.id)}
              title={`${copy.projectId}: ${project.id}`}
              type="button"
            >
              <span className="block break-words">
                {projectLabel(project, locale, copy)}
              </span>
            </button>
          ))}
          {state.error && !selectedProject ? (
            <div
              className="flex items-center justify-between gap-2"
              role="alert"
            >
              <p className="min-w-0 text-xs text-red-700">{state.error}</p>
              <button
                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-800 underline"
                onClick={() =>
                  controller.refreshProjects().catch(() => undefined)
                }
                type="button"
              >
                {copy.retry}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {selectedProject ? (
        <section
          aria-label={copy.selectedProject}
          className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3"
          data-testid="selected-project-chats"
        >
          <BackToConversationsButton
            disabled={projectEntryButtonDisabled(navigationBusy)}
            label={copy.backToConversations}
            onClick={() => selectProject(null)}
          />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="break-words text-xs font-semibold text-blue-950">
                {projectLabel(selectedProject, locale, copy)}
              </h3>
              <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                {copy.projectId}: {selectedProject.id}
              </p>
            </div>
          </div>
          <p className="text-[11px] leading-4 text-slate-600">
            {copy.projectChatHistoryScope}
          </p>
          <h4 className="pt-1 text-xs font-semibold text-slate-800">
            {copy.chatsTitle}
          </h4>
          {state.loadingChats ? (
            <p className="rounded-lg bg-white p-2 text-xs text-slate-500">
              {copy.loadingChats}
            </p>
          ) : null}
          {!state.loadingChats && state.chats.length === 0 ? (
            <p className="rounded-lg bg-white p-2 text-xs text-slate-500">
              {copy.chatsEmpty}
            </p>
          ) : null}
          <div className="space-y-1">
            {state.chats.map((chat) => (
              <button
                className="block w-full rounded-lg bg-white px-2.5 py-2 text-left text-xs leading-5 text-slate-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="project-chat-list-item"
                disabled={projectEntryButtonDisabled(
                  navigationBusy,
                  openingChatId !== null
                )}
                key={chat.chatId}
                onClick={() => openChat(chat).catch(() => undefined)}
                type="button"
              >
                <span className="block truncate font-semibold">
                  {chat.title}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] text-slate-500">
                  {chat.chatId.slice(0, 8)}
                  {chat.readOnly
                    ? ` · ${copy.readOnly}`
                    : ` · ${copy.projectChatLabel}`}
                </span>
              </button>
            ))}
          </div>
          {state.error ? (
            <p className="text-xs text-red-700" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.hasMore ? (
            <button
              className="w-full rounded-lg border border-dashed border-blue-300 bg-white px-2.5 py-2 text-xs font-semibold text-blue-900 disabled:opacity-50"
              disabled={projectEntryButtonDisabled(
                navigationBusy,
                state.loadingMoreChats
              )}
              onClick={() =>
                runWhenIdle(() =>
                  controller.loadMoreChats().catch(() => undefined)
                )
              }
              type="button"
            >
              {copy.loadMoreChats}
            </button>
          ) : null}
          <button
            className="w-full rounded-lg bg-[#001736] px-2.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
            data-testid="new-project-chat"
            disabled={projectEntryButtonDisabled(
              navigationBusy,
              state.creatingChat || state.loadingChats
            )}
            onClick={() => createProjectChat().catch(() => undefined)}
            type="button"
          >
            {state.creatingChat ? copy.creatingChat : copy.newProjectChat}
          </button>
        </section>
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            controller.closeCreateDialog();
          }
        }}
        open={state.createDialogOpen}
      >
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-white p-5 text-slate-950"
          data-testid="create-project-dialog"
        >
          <DialogTitle className="text-base font-semibold">
            {copy.createDialogTitle}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            {copy.createDialogDescription}
          </DialogDescription>
          {state.error ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {state.error}
            </p>
          ) : null}
          <DialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row">
            <button
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
              disabled={state.creatingProject}
              onClick={() => controller.closeCreateDialog()}
              type="button"
            >
              {copy.createDialogCancel}
            </button>
            <button
              className="rounded-xl bg-[#001736] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              data-testid="create-project-confirm"
              disabled={projectEntryButtonDisabled(
                navigationBusy,
                state.creatingProject
              )}
              onClick={() =>
                runWhenIdle(() =>
                  controller.createProject().catch(() => undefined)
                )
              }
              type="button"
            >
              {state.creatingProject
                ? copy.creatingProject
                : copy.createDialogConfirm}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
