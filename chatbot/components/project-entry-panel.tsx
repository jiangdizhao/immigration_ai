"use client";

import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  MessageSquareText,
  Pencil,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
import { getProjectWorkflowCopy } from "@/lib/workspace/project-workflow-copy";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

type ProjectEntryCopy = WorkspaceCopy["projectEntry"];
type ProjectNavigationTab = "workflows" | "chats";

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
  selectedProjectId: selectedProjectIdProp,
  activeConversationId,
  generalHeader,
  recentConversations,
  projectConversationAction,
  workflowNavigation,
  projectToolsNavigation,
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
  activeConversationId?: string | null;
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
  generalHeader?: ReactNode;
  recentConversations?: ReactNode;
  projectConversationAction?: ReactNode;
  workflowNavigation?: ReactNode;
  projectToolsNavigation?: ReactNode;
}) {
  const initialSelectedProjectId = selectedProjectIdProp ?? null;
  const [controller] = useState(() => createProjectEntryController({ copy }));
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [projectSelectorExpanded, setProjectSelectorExpanded] = useState(false);
  const [projectNavigationTab, setProjectNavigationTab] =
    useState<ProjectNavigationTab>("workflows");
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);
  /** Phase 14 naming: the create-dialog draft and the rename-dialog draft. */
  const [createName, setCreateName] = useState("");
  const [renameName, setRenameName] = useState("");
  const projectTabRefs = useRef<
    Record<ProjectNavigationTab, HTMLButtonElement | null>
  >({
    chats: null,
    workflows: null,
  });
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
  const workflowCopy = getProjectWorkflowCopy(locale);
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
    setProjectSelectorExpanded(false);
    if (projectId !== state.selectedProjectId) {
      setProjectNavigationTab("workflows");
    }
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

  const activeProjectId =
    selectedProjectIdProp === undefined
      ? state.selectedProjectId
      : selectedProjectIdProp;
  const selectedProject = state.projects.find(
    (project) => project.id === activeProjectId
  );
  const controllerSelectedProject = state.projects.find(
    (project) => project.id === state.selectedProjectId
  );
  const inProjectMode = activeProjectId !== null;
  const observedProjectId = useRef(activeProjectId);

  useEffect(() => {
    if (observedProjectId.current === activeProjectId) {
      return;
    }
    observedProjectId.current = activeProjectId;
    setProjectNavigationTab("workflows");
    setProjectSelectorExpanded(false);
  }, [activeProjectId]);

  function handleProjectTabsKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: ProjectNavigationTab
  ) {
    const tabs: ProjectNavigationTab[] = ["workflows", "chats"];
    const index = tabs.indexOf(currentTab);
    const nextIndex = (() => {
      switch (event.key) {
        case "ArrowRight":
          return (index + 1) % tabs.length;
        case "ArrowLeft":
          return (index + tabs.length - 1) % tabs.length;
        case "Home":
          return 0;
        case "End":
          return tabs.length - 1;
        default:
          return -1;
      }
    })();
    if (nextIndex < 0) {
      return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setProjectNavigationTab(nextTab);
    projectTabRefs.current[nextTab]?.focus();
  }

  useEffect(() => {
    if (!selectionReady) {
      return;
    }
    onSelectedProjectChange(
      state.selectedProjectId,
      controllerSelectedProject ?? null
    );
  }, [
    controllerSelectedProject,
    onSelectedProjectChange,
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
      aria-label={inProjectMode ? copy.selectedProject : copy.projects}
      className="mb-4 flex min-w-0 flex-col gap-3"
      data-testid="project-entry-panel"
    >
      {inProjectMode ? (
        <>
          <div className="space-y-1.5">
            <BackToConversationsButton
              disabled={projectEntryButtonDisabled(navigationBusy)}
              label={copy.backToConversations}
              onClick={() => selectProject(null)}
            />
            {projectConversationAction}
          </div>

          <section
            aria-label={copy.selectedProject}
            className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/70 p-2.5"
            data-testid="selected-project-navigation"
          >
            <div className="flex min-w-0 items-start gap-2">
              <button
                aria-controls="workspace-project-selector-list"
                aria-expanded={projectSelectorExpanded}
                aria-label={`${workflowCopy.navigation.switchProject}: ${selectedProject ? projectDisplayLabel(selectedProject, locale, copy) : copy.loadingProjects}`}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg border border-blue-200 bg-white px-2.5 py-2 text-left transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="project-selector"
                disabled={projectEntryButtonDisabled(navigationBusy)}
                onClick={() =>
                  setProjectSelectorExpanded((expanded) => !expanded)
                }
                type="button"
              >
                <FolderKanban
                  aria-hidden="true"
                  className="size-5 shrink-0 text-blue-800"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-blue-950">
                    {selectedProject
                      ? projectDisplayLabel(selectedProject, locale, copy)
                      : copy.loadingProjects}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-slate-600">
                    {workflowCopy.navigation.activeProject}
                  </span>
                </span>
                {projectSelectorExpanded ? (
                  <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
                ) : (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                )}
              </button>
              {selectedProject ? (
                <button
                  aria-label={`${copy.renameProject}: ${projectDisplayLabel(selectedProject, locale, copy)}`}
                  className="inline-flex min-h-12 shrink-0 items-center gap-1 rounded-lg border border-blue-300 bg-white px-2.5 text-[11px] font-semibold text-blue-900 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="rename-project"
                  disabled={projectEntryButtonDisabled(navigationBusy)}
                  onClick={() => {
                    setRenameName(selectedProject.displayName ?? "");
                    controller.openRenameDialog();
                  }}
                  type="button"
                >
                  <Pencil aria-hidden="true" className="size-3.5" />
                  {copy.renameProject}
                </button>
              ) : null}
            </div>
            <div
              className="space-y-1 border-t border-blue-100 pt-2"
              data-testid="workspace-project-selector-list"
              hidden={!projectSelectorExpanded}
              id="workspace-project-selector-list"
            >
              {state.loadingProjects ? (
                <p className="rounded-lg bg-white p-2 text-xs text-slate-500">
                  {copy.loadingProjects}
                </p>
              ) : null}
              {state.projects.map((project) => {
                const projectLabel = projectDisplayLabel(project, locale, copy);
                const selected = project.id === activeProjectId;
                return (
                  <button
                    aria-current={selected ? "page" : undefined}
                    aria-label={`${projectLabel} · ${workflowCopy.navigation.activeProject}`}
                    className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${selected ? "bg-blue-100 font-semibold text-blue-950" : "text-slate-700 hover:bg-white"}`}
                    data-testid="project-selector-item"
                    disabled={projectEntryButtonDisabled(navigationBusy)}
                    key={project.id}
                    onClick={() => selectProject(project.id)}
                    type="button"
                  >
                    <FolderKanban
                      aria-hidden="true"
                      className="size-4 shrink-0 text-blue-800"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {projectLabel}
                    </span>
                    {project.status === "active" ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-900">
                        {workflowCopy.navigation.activeProject}
                      </span>
                    ) : null}
                  </button>
                );
              })}
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
          </section>

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

          <div
            aria-label={workflowCopy.navigation.workflows}
            className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1"
            data-testid="project-navigation-tabs"
            role="tablist"
          >
            {(
              [
                ["workflows", workflowCopy.navigation.workflows],
                ["chats", workflowCopy.navigation.projectChats],
              ] as const
            ).map(([tab, label]) => (
              <button
                aria-controls={`project-navigation-panel-${tab}`}
                aria-selected={projectNavigationTab === tab}
                className={`min-h-10 rounded-lg px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-1 ${projectNavigationTab === tab ? "bg-white text-blue-950 shadow-sm ring-1 ring-blue-200" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}
                data-testid={`project-navigation-tab-${tab}`}
                id={`project-navigation-tab-button-${tab}`}
                key={tab}
                onClick={() => setProjectNavigationTab(tab)}
                onKeyDown={(event) => handleProjectTabsKeyDown(event, tab)}
                ref={(element) => {
                  projectTabRefs.current[tab] = element;
                }}
                role="tab"
                tabIndex={projectNavigationTab === tab ? 0 : -1}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <section
            aria-labelledby="project-navigation-tab-button-workflows"
            className="space-y-3"
            data-testid="project-navigation-panel-workflows"
            hidden={projectNavigationTab !== "workflows"}
            id="project-navigation-panel-workflows"
            role="tabpanel"
          >
            {workflowNavigation}
            <details
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              data-testid="project-tools-disclosure"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
                <span>{workflowCopy.navigation.projectTools}</span>
                <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
              </summary>
              <div
                className="border-t border-slate-100 p-2"
                data-testid="project-tools-content"
              >
                {projectToolsNavigation}
              </div>
            </details>
          </section>

          <section
            aria-labelledby="project-navigation-tab-button-chats"
            className="space-y-2"
            data-testid="project-navigation-panel-chats"
            hidden={projectNavigationTab !== "chats"}
            id="project-navigation-panel-chats"
            role="tabpanel"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-slate-950">
                  {copy.chatsTitle}
                </h3>
                <p className="mt-0.5 text-[10px] leading-4 text-slate-600">
                  {copy.projectChatHistoryScope}
                </p>
              </div>
              <MessageSquareText
                aria-hidden="true"
                className="size-4 shrink-0 text-blue-800"
              />
            </div>
            {state.loadingChats ? (
              <p className="rounded-lg bg-white p-2 text-xs text-slate-500">
                {copy.loadingChats}
              </p>
            ) : null}
            {!state.loadingChats && state.chats.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-white p-2 text-xs leading-5 text-slate-600">
                {copy.chatsEmpty}
              </p>
            ) : null}
            <div className="space-y-1.5">
              {state.chats.map((chat) => (
                <button
                  aria-current={
                    chat.chatId === activeConversationId ? "page" : undefined
                  }
                  aria-label={`${chat.title || copy.chatsTitle} · ${chat.readOnly ? copy.readOnly : copy.projectChatLabel}`}
                  className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs leading-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-60 ${chat.chatId === activeConversationId || chat.chatId === openingChatId ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/60"}`}
                  data-testid="project-chat-list-item"
                  disabled={projectEntryButtonDisabled(
                    navigationBusy,
                    openingChatId !== null
                  )}
                  key={chat.chatId}
                  onClick={() => openChat(chat).catch(() => undefined)}
                  type="button"
                >
                  <MessageSquareText
                    aria-hidden="true"
                    className="size-4 shrink-0 text-blue-800"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {chat.title || copy.chatsTitle}
                    </span>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ${chat.readOnly ? "bg-slate-100 text-slate-700" : "bg-blue-50 text-blue-900"}`}
                    >
                      {chat.readOnly ? copy.readOnly : copy.projectChatLabel}
                    </span>
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
                className="min-h-10 w-full rounded-lg border border-dashed border-blue-300 bg-white px-2.5 py-2 text-xs font-semibold text-blue-900 disabled:opacity-50"
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
              className="min-h-11 w-full rounded-lg bg-[#001736] px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-[#002b5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:opacity-50"
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
        </>
      ) : (
        <>
          {generalHeader}
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

          <section
            aria-label={copy.projects}
            className="space-y-2"
            data-testid="workspace-my-projects"
          >
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                aria-controls="workspace-project-list"
                aria-expanded={projectsExpanded}
                aria-label={`${copy.projects} · ${projectsExpanded ? copy.collapseProjects : copy.expandProjects}`}
                className="flex min-h-12 w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold text-slate-900 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                data-testid="toggle-project-list"
                onClick={() => setProjectsExpanded((expanded) => !expanded)}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FolderKanban
                    aria-hidden="true"
                    className="size-4 shrink-0 text-blue-800"
                  />
                  <span>{copy.projects}</span>
                </span>
                {projectsExpanded ? (
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 text-slate-600"
                  />
                ) : (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-slate-600"
                  />
                )}
              </button>
              <div
                className="space-y-1.5 border-t border-slate-100 p-2"
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
                {state.projects.map((project) => {
                  const projectLabel = projectDisplayLabel(
                    project,
                    locale,
                    copy
                  );
                  return (
                    <button
                      aria-label={`${projectLabel} · ${workflowCopy.navigation.activeProject}`}
                      className={`flex min-h-14 w-full min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${project.id === state.selectedProjectId ? "border-blue-500 bg-blue-50 text-blue-950 shadow-sm" : "border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/60"}`}
                      data-testid="project-list-item"
                      disabled={projectEntryButtonDisabled(navigationBusy)}
                      key={project.id}
                      onClick={() => selectProject(project.id)}
                      title={projectLabel}
                      type="button"
                    >
                      <FolderKanban
                        aria-hidden="true"
                        className="size-5 shrink-0 text-blue-800"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">
                          {projectLabel}
                        </span>
                        <span className="mt-1 block text-[10px] text-slate-600">
                          {project.status === "active"
                            ? workflowCopy.navigation.activeProject
                            : ""}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-slate-500"
                      />
                    </button>
                  );
                })}
                {state.error && !selectedProject ? (
                  <div
                    className="flex items-center justify-between gap-2"
                    role="alert"
                  >
                    <p className="min-w-0 text-xs text-red-700">
                      {state.error}
                    </p>
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
            <button
              className="min-h-11 w-full rounded-xl border border-blue-300 bg-white px-3 py-2 text-left text-xs font-semibold text-blue-950 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="create-project-open"
              disabled={
                !controlsEnabled || projectEntryButtonDisabled(navigationBusy)
              }
              onClick={openCreateProjectDialog}
              type="button"
            >
              + {copy.createProject}
            </button>
          </section>
          {recentConversations}
        </>
      )}

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
