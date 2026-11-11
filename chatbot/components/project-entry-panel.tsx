"use client";

import { ArrowLeft, Pencil } from "lucide-react";
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
  createProjectEntrySelectionReconciler,
  openSelectedProjectChat,
  type ProjectEntryAvailability,
  type ProjectEntryChat,
  type ProjectEntryProject,
  projectDisplayLabel,
  projectEntryButtonDisabled,
  projectEntryControlsEnabled,
  runProjectNavigationAction,
} from "@/lib/workspace/project-entry";
import {
  PROJECT_WORKSPACE_VIEWS,
  type ProjectWorkspaceView,
} from "@/lib/workspace/project-workspace-view";
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

const NAV_LABEL_KEYS = {
  home: "projectHomeTab",
  applications: "projectSchoolApplicationsTab",
  admissions: "projectSchoolAdmissionsTab",
  student500: "projectStudent500Tab",
} as const satisfies Record<ProjectPanelView, keyof ProjectEntryCopy>;

/**
 * Phase 13 M9-A: the Project document centre is reached from the step rail and the
 * main-area section tabs, so this legacy compact section list keeps exactly the four
 * sections it has always offered.
 */
type ProjectPanelView = Exclude<ProjectWorkspaceView, "documents" | "review">;
const PANEL_VIEWS: readonly ProjectPanelView[] = PROJECT_WORKSPACE_VIEWS.filter(
  (view): view is ProjectPanelView => view !== "documents" && view !== "review"
);

export function ProjectEntryPanel({
  copy,
  locale,
  onOpenProjectChat,
  onSelectedProjectChange,
  clearSelectionSignal,
  navigationBusy,
  availability = "available",
  temporaryGuestProject = false,
  schoolPreparationRestricted = false,
  projectView = "home",
  onSelectProjectView,
  selectedProjectId: initialSelectedProjectId = null,
}: {
  copy: ProjectEntryCopy;
  locale: string;
  onOpenProjectChat: (chatId: string) => Promise<void> | void;
  /** The second argument is the selected Project record, when known. */
  onSelectedProjectChange: (
    projectId: string | null,
    project?: ProjectEntryProject | null
  ) => void;
  /**
   * Phase 14-A: the Workspace's current Project. The mobile navigation Sheet
   * mounts this panel afresh each time it opens, so the panel adopts this
   * selection instead of publishing an empty one that would clear the Project.
   */
  selectedProjectId?: string | null;
  /** Changed when global history or the Standalone action takes focus. */
  clearSelectionSignal: number;
  /** Mirrors the Workspace's conversation load and active-turn state. */
  navigationBusy: boolean;
  /**
   * Phase 13 P1: server-resolved personal Project capability. The entry stays
   * visible in every state so an unavailable installation explains itself
   * instead of silently disappearing.
   */
  availability?: ProjectEntryAvailability;
  /** Guest Projects are session-scoped and cannot be transferred yet. */
  temporaryGuestProject?: boolean;
  /** M5 preparation is enabled but this identity is not eligible for it. */
  schoolPreparationRestricted?: boolean;
  /**
   * Phase 13 UX: this rail is navigation only. The selected Project's sections
   * (Project home, School applications, Admissions workflow) render in the main
   * content area, so no business form is mounted at navigation width.
   */
  projectView?: ProjectWorkspaceView;
  onSelectProjectView?: (view: ProjectWorkspaceView) => void;
}) {
  const [controller] = useState(() => createProjectEntryController({ copy }));
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);
  /** Phase 14 naming: the create-dialog draft and the rename-dialog draft. */
  const [createName, setCreateName] = useState("");
  const [renameName, setRenameName] = useState("");
  const appliedClearSignal = useRef(clearSelectionSignal);
  const openingChatRef = useRef(false);
  const navigationBusyRef = useRef(navigationBusy);
  navigationBusyRef.current = navigationBusy;
  /**
   * Phase 14-A R1-01: set once the actor has genuinely decided the selection (an
   * explicit pick, a Project the server created and selected, or an explicit clear
   * from the Workspace). A pending reconciliation must never overwrite that
   * decision with the mount-time seed.
   */
  const selectionDecidedRef = useRef(false);
  /**
   * Phase 14-A: the panel only publishes a selection once it knows one. A fresh
   * mount (the mobile navigation Sheet) has no controller selection yet, and
   * forwarding that empty snapshot would clear the Workspace's Project and drop
   * its Project Chat.
   *
   * Phase 14-A R1-01: the reconciliation is a single-flight, not a one-shot latch,
   * because the effect below may be cleaned up and re-run while the first attempt
   * is still in flight. Only a definitive outcome settles this panel.
   */
  const [selectionReconciler] = useState(() =>
    createProjectEntrySelectionReconciler({
      controller,
      initialSelectedProjectId,
      isSelectionDecided: () => selectionDecidedRef.current,
    })
  );
  const [selectionReady, setSelectionReady] = useState(
    initialSelectedProjectId === null
  );
  const controlsEnabled = projectEntryControlsEnabled(availability);
  const availabilityMessage = controlsEnabled
    ? null
    : availability === "disabled"
      ? copy.projectDisabled
      : copy.projectServiceUnavailable;

  function runWhenIdle<T>(action: () => T) {
    return runProjectNavigationAction({
      isBusy: () => navigationBusyRef.current,
      action,
    });
  }

  function selectProject(projectId: string | null) {
    // An explicit choice is always a real decision, even while the seed above is
    // still unresolved.
    selectionDecidedRef.current = true;
    setSelectionReady(true);
    runWhenIdle(() =>
      controller.selectProject(projectId).catch(() => undefined)
    );
  }

  function openCreateProjectDialog() {
    if (!controlsEnabled) {
      return;
    }
    setCreateName("");
    /**
     * Phase 14-A R1-01: opening the dialog is *not* a Project selection. Settling
     * the reconciliation here would publish the controller's still-empty snapshot
     * and could clear the Workspace's active Project or Project Chat. Only a real
     * selection (an explicit pick, or a Project the server created and selected)
     * settles it.
     */
    runWhenIdle(() => controller.openCreateDialog());
  }

  /**
   * Phase 14-A R1-01: creating a Project is a genuine selection change — the
   * server creates it and the controller selects it — so it settles a still-pending
   * reconciliation and may be published. A failed creation settles nothing.
   */
  async function createProject(displayName?: string) {
    const navigation = runWhenIdle(() => controller.createProject(displayName));
    if (!navigation.allowed) {
      return null;
    }
    const project = await navigation.result.catch(() => null);
    if (project) {
      selectionDecidedRef.current = true;
      setSelectionReady(true);
    }
    return project;
  }

  useEffect(() => {
    controller.setCopy(copy);
  }, [controller, copy]);

  useEffect(() => {
    // A disabled or schema-unavailable installation must not call the API just
    // to render "unavailable": the server already resolved the reason.
    if (!controlsEnabled) {
      return;
    }
    /**
     * Phase 14-A R1-01: this effect may be cleaned up and re-run while the first
     * attempt is in flight. The reconciler is single-flight, so a re-run awaits the
     * same attempt instead of starting a second read, and a cancelled attempt can
     * never permanently suppress reconciliation.
     */
    let active = true;
    selectionReconciler
      .reconcile()
      .then((outcome) => {
        if (!active || outcome === "unresolved") {
          return;
        }
        setSelectionReady(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [controlsEnabled, selectionReconciler]);

  const selectedProject = state.projects.find(
    (project) => project.id === state.selectedProjectId
  );

  useEffect(() => {
    if (!selectionReady) {
      return;
    }
    onSelectedProjectChange(state.selectedProjectId, selectedProject ?? null);
  }, [
    onSelectedProjectChange,
    selectedProject,
    selectionReady,
    state.selectedProjectId,
  ]);

  useEffect(() => {
    if (appliedClearSignal.current === clearSelectionSignal) {
      return;
    }
    appliedClearSignal.current = clearSelectionSignal;
    // An explicit Workspace-side clear is a real decision too.
    selectionDecidedRef.current = true;
    controller.selectProject(null).catch(() => undefined);
  }, [clearSelectionSignal, controller]);

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
          disabled={
            !controlsEnabled || projectEntryButtonDisabled(navigationBusy)
          }
          onClick={openCreateProjectDialog}
          type="button"
        >
          + {copy.createProject}
        </button>
      </div>

      {availabilityMessage ? (
        <output
          className="block rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900"
          data-testid="project-availability-notice"
        >
          {availabilityMessage}
        </output>
      ) : null}

      {temporaryGuestProject ? (
        <p
          className="rounded-xl border border-slate-200 bg-white p-2 text-[11px] leading-5 text-slate-600"
          data-testid="guest-project-notice"
          role="note"
        >
          {copy.guestTemporaryProject}
        </p>
      ) : null}

      {schoolPreparationRestricted ? (
        <p
          className="rounded-xl border border-slate-200 bg-white p-2 text-[11px] leading-5 text-slate-600"
          data-testid="school-preparation-restricted"
          role="note"
        >
          {copy.schoolPreparationRestricted}
        </p>
      ) : null}

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
              aria-label={`${projectDisplayLabel(project, locale, copy)} · ${copy.projectId} ${project.id}`}
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
                {projectDisplayLabel(project, locale, copy)}
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
                {projectDisplayLabel(selectedProject, locale, copy)}
              </h3>
              <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                {copy.projectId}: {selectedProject.id}
              </p>
            </div>
            {/* Phase 14: an obvious rename action beside the selected name. */}
            <button
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-300 bg-white px-2 py-1 text-[11px] font-semibold text-blue-900 transition enabled:hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="rename-project"
              disabled={projectEntryButtonDisabled(navigationBusy)}
              onClick={() => {
                setRenameName(selectedProject.displayName ?? "");
                controller.openRenameDialog();
              }}
              type="button"
            >
              <Pencil aria-hidden="true" className="size-3" />
              {copy.renameProject}
            </button>
          </div>
          <p className="text-[11px] leading-4 text-slate-600">
            {copy.projectChatHistoryScope}
          </p>
          {onSelectProjectView ? (
            <nav
              aria-label={copy.projectHomeTitle}
              className="grid gap-1"
              data-testid="project-view-nav"
            >
              {PANEL_VIEWS.map((view) => (
                <button
                  aria-current={projectView === view ? "page" : undefined}
                  className={
                    projectView === view
                      ? "w-full rounded-lg bg-white px-2.5 py-2 text-left text-xs font-semibold text-blue-950 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                      : "w-full rounded-lg bg-white/60 px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  }
                  data-testid={`project-view-${view}`}
                  disabled={projectEntryButtonDisabled(navigationBusy)}
                  key={view}
                  onClick={() => onSelectProjectView(view)}
                  type="button"
                >
                  {copy[NAV_LABEL_KEYS[view]]}
                </button>
              ))}
            </nav>
          ) : null}
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
          {/*
            Phase 14 naming. Optional for backward compatibility: an empty name keeps
            the existing generated date + short-ID label, and the server is the
            authority for trimming and the 100-character bound.
          */}
          <div className="mt-3 space-y-1">
            <label
              className="block text-sm font-semibold text-slate-800"
              htmlFor="create-project-name"
            >
              {copy.projectNameLabel}
            </label>
            <input
              autoComplete="off"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
              data-testid="create-project-name"
              id="create-project-name"
              onChange={(event) => setCreateName(event.target.value)}
              placeholder={copy.projectNamePlaceholder}
              value={createName}
            />
            <p className="text-xs leading-5 text-slate-500">
              {copy.projectNameOptionalHint}
            </p>
          </div>
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
              onClick={() => {
                // Settles the reconciliation only when the server really created
                // and selected the Project (see `createProject`).
                createProject(createName).catch(() => undefined);
              }}
              type="button"
            >
              {state.creatingProject
                ? copy.creatingProject
                : copy.createDialogConfirm}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Phase 14: rename dialog. Cancel performs no write; Save sends one CAS-bound,
        idempotent PATCH and the stored name is only replaced by the server's answer.
        It renders in the same rail/Sheet placement as the create dialog, so mobile
        and desktop keep the Phase 14-A navigation structure unchanged.
      */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            controller.closeRenameDialog();
          }
        }}
        open={state.renameDialogOpen}
      >
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-white p-5 text-slate-950"
          data-testid="rename-project-dialog"
        >
          <DialogTitle className="text-base font-semibold">
            {copy.renameDialogTitle}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            {copy.renameDialogDescription}
          </DialogDescription>
          <div className="mt-3 space-y-1">
            <label
              className="block text-sm font-semibold text-slate-800"
              htmlFor="rename-project-name"
            >
              {copy.projectNameLabel}
            </label>
            <input
              autoComplete="off"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
              data-testid="rename-project-name"
              id="rename-project-name"
              onChange={(event) => setRenameName(event.target.value)}
              placeholder={copy.projectNamePlaceholder}
              value={renameName}
            />
          </div>
          {state.renameError ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {state.renameError}
            </p>
          ) : null}
          <DialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row">
            <button
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
              disabled={state.renamingProject}
              onClick={() => controller.closeRenameDialog()}
              type="button"
            >
              {copy.renameDialogCancel}
            </button>
            <button
              className="rounded-xl bg-[#001736] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              data-testid="rename-project-save"
              disabled={projectEntryButtonDisabled(
                navigationBusy,
                state.renamingProject
              )}
              onClick={() => {
                controller.renameProject(renameName).catch(() => undefined);
              }}
              type="button"
            >
              {state.renamingProject
                ? copy.renamingProject
                : copy.renameDialogSave}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
