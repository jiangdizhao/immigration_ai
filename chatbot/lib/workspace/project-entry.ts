import type { ProjectEntryAvailability } from "@/lib/projects/personal-project-capability";

export type { ProjectEntryAvailability } from "@/lib/projects/personal-project-capability";

export type ProjectEntryProject = {
  id: string;
  /**
   * Phase 14: the customer's own Project name. `null` for legacy Projects, which
   * keep the localized date + short-ID label.
   */
  displayName: string | null;
  status: "active";
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectEntryChat = {
  chatId: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  origin: "project";
  readOnly: boolean;
};

export type ProjectEntryCopy = {
  loadingProjects: string;
  projectsEmpty: string;
  chatsEmpty: string;
  loadFailed: string;
  authenticationRequired: string;
  accessDenied: string;
  notFound: string;
  stateChanged: string;
  /** Phase 14 rename validation (also used for a create-time name). */
  projectNameRequired: string;
  projectNameInvalid: string;
  /** Bounded creation: the actor owns the maximum active Projects. */
  limitReached: string;
  unavailable: string;
  requestFailed: string;
  networkFailed: string;
};

export type ProjectEntryState = {
  projects: ProjectEntryProject[];
  selectedProjectId: string | null;
  chats: ProjectEntryChat[];
  nextCursor: string | null;
  hasMore: boolean;
  loadingProjects: boolean;
  loadingChats: boolean;
  loadingMoreChats: boolean;
  creatingProject: boolean;
  creatingChat: boolean;
  createDialogOpen: boolean;
  /** Phase 14: rename dialog state, kept separate from the list error surface. */
  renameDialogOpen: boolean;
  renamingProject: boolean;
  renameError: string | null;
  error: string | null;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response> | Response;

type ProjectListResponse = { projects?: unknown };
export type ProjectRefreshResult =
  | { kind: "success"; projects: ProjectEntryProject[] }
  | { kind: "authorization_denied" }
  | { kind: "transient_failure" }
  | { kind: "superseded" };
type ProjectChatListResponse = {
  conversations?: unknown;
  hasMore?: unknown;
  nextCursor?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Phase 14: parse an authorized Project projection.
 *
 * `displayName` is accepted as a string or null/absent (a legacy server response or
 * a legacy row) and normalized to `null`, so no caller branches on the wire shape.
 * Every other field keeps the previous strict contract.
 */
function toProjectEntryProject(value: unknown): ProjectEntryProject | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.status !== "active" ||
    typeof value.revision !== "number" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  const displayName = value.displayName;
  if (
    displayName !== undefined &&
    displayName !== null &&
    typeof displayName !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    displayName: typeof displayName === "string" ? displayName : null,
    status: "active",
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

/**
 * Phase 14: ONE display label for the Project list, the selected Project area and
 * Project Home. A non-empty customer name wins; otherwise the existing localized
 * date + short-ID label is used unchanged.
 */
export function projectDisplayLabel(
  project: Pick<ProjectEntryProject, "displayName" | "id" | "createdAt">,
  locale: string,
  copy: { projectLabel: (date: string, shortId: string) => string }
): string {
  const name = project.displayName?.trim();
  if (name) {
    return name;
  }
  const date = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(project.createdAt));
  return copy.projectLabel(date, project.id.slice(0, 8));
}

function isProjectChat(value: unknown): value is ProjectEntryChat {
  return (
    isRecord(value) &&
    typeof value.chatId === "string" &&
    typeof value.projectId === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    value.origin === "project" &&
    typeof value.readOnly === "boolean"
  );
}

export function projectEntryErrorMessage(
  status: number,
  copy: ProjectEntryCopy
): string {
  switch (status) {
    case 401:
      return copy.authenticationRequired;
    case 403:
      return copy.accessDenied;
    case 404:
      return copy.notFound;
    case 409:
      return copy.stateChanged;
    case 429:
      // Bounded creation: an explicit quota message, not a false outage claim.
      return copy.limitReached;
    case 503:
      return copy.unavailable;
    default:
      return copy.requestFailed;
  }
}

export function isProjectNavigationBusy(
  conversationStatus: "ready" | "submitted" | "typing",
  conversationLoading: boolean
): boolean {
  return conversationStatus !== "ready" || conversationLoading;
}

export function projectEntryButtonDisabled(
  navigationBusy: boolean,
  localBusy = false
): boolean {
  return navigationBusy || localBusy;
}

export function runProjectNavigationAction<T>(input: {
  isBusy: () => boolean;
  action: () => T;
}): { allowed: true; result: T } | { allowed: false } {
  if (input.isBusy()) {
    return { allowed: false };
  }
  return { allowed: true, result: input.action() };
}

export function shouldApplyProjectChatResponse(input: {
  requestProjectId: string;
  selectedProjectId: string | null;
  requestSequence: number;
  latestRequestSequence: number;
}): boolean {
  return (
    input.requestProjectId === input.selectedProjectId &&
    input.requestSequence === input.latestRequestSequence
  );
}

/**
 * Phase 13 P1: the Project entry is always rendered. Only the interactive
 * controls depend on the server-resolved capability, so a disabled or
 * schema-unavailable installation explains itself instead of silently hiding
 * Project creation from the customer.
 */
export function projectEntryControlsEnabled(
  availability: ProjectEntryAvailability
): boolean {
  return availability === "available";
}

export function buildStandaloneConversationRequest(input: {
  title: string;
  policySlug?: string | null;
  policyLaunchId?: string | null;
}) {
  return {
    title: input.title,
    policySlug: input.policySlug ?? null,
    policyLaunchId: input.policyLaunchId ?? null,
  };
}

export function shouldShowNeutralProjectSelection(input: {
  selectedProjectId: string | null;
  conversationOrigin: "immigration" | "legacy_chat" | "project";
  conversationProjectId: string | null;
}): boolean {
  return Boolean(
    input.selectedProjectId &&
      !(
        input.conversationOrigin === "project" &&
        input.conversationProjectId === input.selectedProjectId
      )
  );
}

export async function openSelectedProjectChat(input: {
  chatId: string;
  projectId: string;
  selectedProjectId: string | null;
  onOpen: (chatId: string) => Promise<void> | void;
}): Promise<boolean> {
  if (input.projectId !== input.selectedProjectId) {
    return false;
  }
  await input.onOpen(input.chatId);
  return true;
}

/**
 * Phase 14-A: the mobile navigation Sheet mounts `ProjectEntryPanel` afresh each
 * time it opens, so its controller starts with no selection. The Workspace's
 * selected Project remains the source of truth; publishing that empty initial
 * snapshot would clear the Project and drop its Project Chat. This decides what a
 * fresh panel may do once the authorized project list has been read:
 *
 * - `seed` — the Workspace's Project is still offered, so adopt it silently.
 * - `settled` — the read was authorized and no longer offers it, so the panel may
 *   publish its (genuinely) empty selection.
 * - `unresolved` — the list could not be read. That is not proof that the Project
 *   was withdrawn, so the panel keeps the Workspace's selection and publishes
 *   nothing until the actor picks a Project explicitly.
 */
export function resolveProjectEntrySelectionSeed(input: {
  initialSelectedProjectId: string | null;
  projectListResult: ProjectRefreshResult | null;
  projects: readonly ProjectEntryProject[];
}): "seed" | "settled" | "unresolved" {
  const initial = input.initialSelectedProjectId;
  if (initial === null) {
    return "settled";
  }
  if (input.projects.some((project) => project.id === initial)) {
    return "seed";
  }
  const kind =
    input.projectListResult === null ? null : input.projectListResult.kind;
  if (kind === null || kind === "transient_failure" || kind === "superseded") {
    return "unresolved";
  }
  return "settled";
}

/** The outcome of resolving a fresh panel's selection (see the resolver above). */
export type ProjectEntrySelectionOutcome = "seed" | "settled" | "unresolved";

/**
 * The small part of the Project entry controller the reconciliation needs. Kept
 * structural so the decision can be exercised without a React tree or a network.
 */
type ProjectEntrySelectionController = {
  getSnapshot: () => Pick<ProjectEntryState, "projects">;
  refreshProjects: () => Promise<ProjectRefreshResult>;
  selectProject: (projectId: string | null) => Promise<void>;
};

/**
 * Phase 14-A R1-01: resolve a freshly mounted panel's selection against the
 * authorized project list.
 *
 * The consumer is a React effect that may be cleaned up and re-run while the first
 * attempt is still in flight (StrictMode double-invocation, or a dependency
 * change). A one-shot "already started" latch is therefore wrong: the cancelled
 * attempt could leave the panel permanently unresolved. This is a single-flight
 * instead —
 *
 * - repeated/concurrent calls share one attempt, so a re-run neither duplicates the
 *   read nor loses the result;
 * - only a *definitive* outcome (`seed`/`settled`) is remembered, so a cancelled
 *   attempt can never suppress reconciliation;
 * - an unreadable list stays `unresolved` and is retried by the next call instead
 *   of being cached as "nothing is selected".
 */
export function createProjectEntrySelectionReconciler(input: {
  controller: ProjectEntrySelectionController;
  initialSelectedProjectId: string | null;
  /**
   * Phase 14-A R1-01: the panel reports that the actor has already decided the
   * selection (an explicit pick or an explicit clear) while this attempt was in
   * flight. Such a decision always wins over the mount-time seed, otherwise a slow
   * project read could re-select a Project the customer just left.
   */
  isSelectionDecided?: () => boolean;
}): { reconcile: () => Promise<ProjectEntrySelectionOutcome> } {
  let inflight: Promise<ProjectEntrySelectionOutcome> | null = null;
  let settled: ProjectEntrySelectionOutcome | null = null;

  const reconcileOnce = async (): Promise<ProjectEntrySelectionOutcome> => {
    const result = await input.controller.refreshProjects().catch(() => null);
    const outcome = resolveProjectEntrySelectionSeed({
      initialSelectedProjectId: input.initialSelectedProjectId,
      projectListResult: result,
      projects: input.controller.getSnapshot().projects,
    });
    const selectionDecided = input.isSelectionDecided?.() ?? false;
    if (
      outcome === "seed" &&
      input.initialSelectedProjectId &&
      !selectionDecided
    ) {
      // Adopt the Workspace's Project silently: it is the same Project, so no
      // section reset and no Project Chat drop.
      await input.controller
        .selectProject(input.initialSelectedProjectId)
        .catch(() => undefined);
    }
    return outcome;
  };

  return {
    reconcile() {
      if (settled !== null) {
        return Promise.resolve(settled);
      }
      if (inflight) {
        return inflight;
      }
      const attempt = reconcileOnce().then(
        (outcome) => {
          inflight = null;
          if (outcome !== "unresolved") {
            settled = outcome;
          }
          return outcome;
        },
        (error: unknown) => {
          inflight = null;
          throw error;
        }
      );
      inflight = attempt;
      return attempt;
    },
  };
}

export function createProjectEntryController(input: {
  fetcher?: FetchLike;
  operationId?: () => string;
  copy: ProjectEntryCopy;
}) {
  const fetcher = input.fetcher ?? fetch;
  const makeOperationId = input.operationId ?? (() => crypto.randomUUID());
  let copy = input.copy;
  const listeners = new Set<() => void>();
  let projectsRequestSequence = 0;
  let chatsRequestSequence = 0;
  let projectOperationId: { name: string; operationId: string } | null = null;
  const chatOperationIds = new Map<string, string>();
  /**
   * Phase 14: one operation id per distinct rename request. An identical retry (same
   * Project, revision and name) replays safely; editing the name or reacting to a
   * new revision creates a new operation id, so a changed payload never masquerades
   * as an idempotent replay.
   */
  let renameAttempt: { key: string; operationId: string } | null = null;
  let disposed = false;
  let state: ProjectEntryState = {
    projects: [],
    selectedProjectId: null,
    chats: [],
    nextCursor: null,
    hasMore: false,
    loadingProjects: false,
    loadingChats: false,
    loadingMoreChats: false,
    creatingProject: false,
    creatingChat: false,
    createDialogOpen: false,
    renameDialogOpen: false,
    renamingProject: false,
    renameError: null,
    error: null,
  };

  function publish(patch: Partial<ProjectEntryState>) {
    if (disposed) {
      return;
    }
    state = { ...state, ...patch };
    for (const listener of listeners) {
      listener();
    }
  }

  function errorFor(error: unknown) {
    if (error instanceof ProjectEntryHttpError) {
      return projectEntryErrorMessage(error.status, copy);
    }
    if (error instanceof TypeError) {
      return copy.networkFailed;
    }
    return copy.requestFailed;
  }

  async function readResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new ProjectEntryHttpError(response.status);
    }
    return (await response.json()) as T;
  }

  async function refreshProjects(): Promise<ProjectRefreshResult> {
    const requestSequence = ++projectsRequestSequence;
    publish({ loadingProjects: true, error: null });
    try {
      const response = await fetcher("/api/projects", {
        method: "GET",
        cache: "no-store",
      });
      const data = await readResponse<ProjectListResponse>(response);
      if (requestSequence !== projectsRequestSequence || disposed) {
        return { kind: "superseded" };
      }
      const projects = Array.isArray(data.projects)
        ? data.projects
            .map(toProjectEntryProject)
            .filter((row): row is ProjectEntryProject => row !== null)
        : [];
      const selectionStillAvailable = projects.some(
        (project) => project.id === state.selectedProjectId
      );
      if (!selectionStillAvailable && state.selectedProjectId) {
        chatsRequestSequence += 1;
      }
      publish({
        projects,
        selectedProjectId: selectionStillAvailable
          ? state.selectedProjectId
          : null,
        chats: selectionStillAvailable ? state.chats : [],
        nextCursor: selectionStillAvailable ? state.nextCursor : null,
        hasMore: selectionStillAvailable ? state.hasMore : false,
        loadingChats: false,
        loadingProjects: false,
      });
      return { kind: "success", projects };
    } catch (error) {
      if (requestSequence === projectsRequestSequence && !disposed) {
        const status =
          error instanceof ProjectEntryHttpError ? error.status : null;
        if (status === 401 || status === 403) {
          chatsRequestSequence += 1;
          publish({
            projects: [],
            selectedProjectId: null,
            chats: [],
            nextCursor: null,
            hasMore: false,
            loadingProjects: false,
            loadingChats: false,
            loadingMoreChats: false,
            error: errorFor(error),
          });
          return { kind: "authorization_denied" };
        }
        publish({ loadingProjects: false, error: errorFor(error) });
        return { kind: "transient_failure" };
      }
      return { kind: "superseded" };
    }
  }

  async function loadChats(
    projectId: string,
    cursor: string | null = null,
    append = false
  ): Promise<ProjectEntryChat[] | null> {
    const requestSequence = ++chatsRequestSequence;
    publish({
      ...(append ? { loadingMoreChats: true } : { loadingChats: true }),
      error: null,
    });
    const query = new URLSearchParams({ limit: "50" });
    if (cursor) {
      query.set("cursor", cursor);
    }
    try {
      const response = await fetcher(
        `/api/projects/${encodeURIComponent(projectId)}/chats?${query}`,
        { method: "GET", cache: "no-store" }
      );
      const data = await readResponse<ProjectChatListResponse>(response);
      if (
        !shouldApplyProjectChatResponse({
          requestProjectId: projectId,
          selectedProjectId: state.selectedProjectId,
          requestSequence,
          latestRequestSequence: chatsRequestSequence,
        }) ||
        disposed
      ) {
        return null;
      }
      const page = Array.isArray(data.conversations)
        ? data.conversations.filter(
            (chat): chat is ProjectEntryChat =>
              isProjectChat(chat) && chat.projectId === projectId
          )
        : [];
      const existing = append ? state.chats : [];
      const seen = new Set(existing.map((chat) => chat.chatId));
      const chats = [
        ...existing,
        ...page.filter((chat) => !seen.has(chat.chatId)),
      ];
      publish({
        chats,
        nextCursor:
          typeof data.nextCursor === "string" ? data.nextCursor : null,
        hasMore: data.hasMore === true,
        loadingChats: false,
        loadingMoreChats: false,
      });
      return page;
    } catch (error) {
      if (
        shouldApplyProjectChatResponse({
          requestProjectId: projectId,
          selectedProjectId: state.selectedProjectId,
          requestSequence,
          latestRequestSequence: chatsRequestSequence,
        }) &&
        !disposed
      ) {
        const status =
          error instanceof ProjectEntryHttpError ? error.status : null;
        if (status === 401 || status === 403 || status === 404) {
          publish({
            selectedProjectId: null,
            chats: [],
            nextCursor: null,
            hasMore: false,
            loadingChats: false,
            loadingMoreChats: false,
            error: projectEntryErrorMessage(status, copy),
          });
        } else {
          publish({
            loadingChats: false,
            loadingMoreChats: false,
            error:
              status === null
                ? errorFor(error)
                : projectEntryErrorMessage(status, copy),
          });
        }
      }
      return null;
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return state;
    },
    refreshProjects() {
      return refreshProjects();
    },
    setCopy(nextCopy: ProjectEntryCopy) {
      copy = nextCopy;
    },
    async selectProject(projectId: string | null) {
      chatsRequestSequence += 1;
      if (
        projectId !== null &&
        !state.projects.some((project) => project.id === projectId)
      ) {
        publish({
          selectedProjectId: null,
          chats: [],
          nextCursor: null,
          hasMore: false,
          loadingChats: false,
        });
        return;
      }
      publish({
        selectedProjectId: projectId,
        chats: [],
        nextCursor: null,
        hasMore: false,
        loadingChats: Boolean(projectId),
        loadingMoreChats: false,
        error: null,
      });
      if (projectId) {
        await loadChats(projectId);
      }
    },
    loadMoreChats() {
      const projectId = state.selectedProjectId;
      if (!projectId || !state.hasMore || !state.nextCursor) {
        return Promise.resolve(null);
      }
      return loadChats(projectId, state.nextCursor, true);
    },
    openCreateDialog() {
      publish({ createDialogOpen: true, error: null });
    },
    closeCreateDialog() {
      if (!state.creatingProject) {
        publish({ createDialogOpen: false });
      }
    },
    async createProject(inputName?: string) {
      if (state.creatingProject) {
        return null;
      }
      /**
       * Phase 14 naming: a blank name is omitted from the body entirely, so a
       * legacy creation keeps its exact request identity (and generated label).
       */
      const trimmedName = typeof inputName === "string" ? inputName.trim() : "";
      if (
        trimmedName.length > 0 &&
        (Array.from(trimmedName).length > 100 ||
          /[\u0000-\u001F\u007F\u2028\u2029]/u.test(trimmedName))
      ) {
        publish({ error: copy.projectNameInvalid });
        return null;
      }
      /**
       * Phase 14 R1-03: the pending creation operation id belongs to ONE requested
       * name. An identical retry (the same normalized name, including the blank /
       * unnamed payload) replays safely; changing the name creates a new operation,
       * because the request payload identity changed and the server would (correctly)
       * answer idempotency_conflict for a reused id.
       */
      if (projectOperationId?.name !== trimmedName) {
        projectOperationId = {
          name: trimmedName,
          operationId: makeOperationId(),
        };
      }
      publish({ creatingProject: true, error: null });
      try {
        const response = await fetcher("/api/projects", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId: projectOperationId.operationId,
            ...(trimmedName.length > 0 ? { displayName: trimmedName } : {}),
          }),
        });
        const data = await readResponse<{
          project?: unknown;
        }>(response);
        const project = toProjectEntryProject(data.project);
        if (!project) {
          throw new TypeError("invalid project response");
        }
        projectOperationId = null;
        const refreshResult = await refreshProjects();
        if (
          refreshResult.kind === "authorization_denied" ||
          refreshResult.kind === "superseded"
        ) {
          publish({ creatingProject: false, createDialogOpen: false });
          return null;
        }
        const listedProject = state.projects.find(
          (item) => item.id === project.id
        );
        if (!listedProject) {
          publish({ projects: [...state.projects, project] });
        }
        chatsRequestSequence += 1;
        publish({
          selectedProjectId: project.id,
          chats: [],
          nextCursor: null,
          hasMore: false,
          loadingChats: true,
          creatingProject: false,
          createDialogOpen: false,
        });
        await loadChats(project.id);
        return project;
      } catch (error) {
        publish({
          creatingProject: false,
          error:
            error instanceof ProjectEntryHttpError
              ? projectEntryErrorMessage(error.status, copy)
              : errorFor(error),
        });
        return null;
      }
    },
    async createProjectChat(): Promise<Pick<
      ProjectEntryChat,
      "chatId" | "projectId" | "origin" | "readOnly"
    > | null> {
      const projectId = state.selectedProjectId;
      if (!projectId || state.creatingChat) {
        return null;
      }
      const operationId = chatOperationIds.get(projectId) ?? makeOperationId();
      chatOperationIds.set(projectId, operationId);
      publish({ creatingChat: true, error: null });
      try {
        const response = await fetcher(
          `/api/projects/${encodeURIComponent(projectId)}/chats`,
          {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operationId }),
          }
        );
        const data = await readResponse<unknown>(response);
        if (
          !isRecord(data) ||
          typeof data.chatId !== "string" ||
          data.projectId !== projectId ||
          data.origin !== "project" ||
          typeof data.readOnly !== "boolean"
        ) {
          throw new TypeError("invalid Project Chat response");
        }
        const chat: Pick<
          ProjectEntryChat,
          "chatId" | "projectId" | "origin" | "readOnly"
        > = {
          chatId: data.chatId,
          projectId,
          origin: "project",
          readOnly: data.readOnly,
        };
        chatOperationIds.delete(projectId);
        publish({ creatingChat: false });
        if (state.selectedProjectId === projectId) {
          await loadChats(projectId);
        }
        return chat;
      } catch (error) {
        publish({
          creatingChat: false,
          error:
            error instanceof ProjectEntryHttpError
              ? projectEntryErrorMessage(error.status, copy)
              : errorFor(error),
        });
        return null;
      }
    },
    /**
     * Phase 14 rename. Cancel never writes; a failed save keeps the previous name and
     * reports a localized error; success replaces exactly one list record (selection,
     * Project Chat list, current section and conversation history are untouched).
     */
    openRenameDialog() {
      if (!state.selectedProjectId) {
        return;
      }
      publish({ renameDialogOpen: true, renameError: null });
    },
    closeRenameDialog() {
      if (!state.renamingProject) {
        publish({ renameDialogOpen: false, renameError: null });
      }
    },
    async renameProject(
      inputName: string
    ): Promise<ProjectEntryProject | null> {
      const project = state.projects.find(
        (row) => row.id === state.selectedProjectId
      );
      if (!project || state.renamingProject) {
        return null;
      }
      const name = inputName.trim();
      if (name.length === 0) {
        publish({ renameError: copy.projectNameRequired });
        return null;
      }
      if (
        Array.from(name).length > 100 ||
        /[\u0000-\u001F\u007F\u2028\u2029]/u.test(name)
      ) {
        publish({ renameError: copy.projectNameInvalid });
        return null;
      }
      const attemptKey = `${project.id}:${project.revision}:${name}`;
      if (renameAttempt?.key !== attemptKey) {
        renameAttempt = { key: attemptKey, operationId: makeOperationId() };
      }
      const operationId = renameAttempt.operationId;
      publish({ renamingProject: true, renameError: null });
      try {
        const response = await fetcher(
          `/api/projects/${encodeURIComponent(project.id)}`,
          {
            method: "PATCH",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operationId,
              expectedRevision: project.revision,
              displayName: name,
            }),
          }
        );
        const data = await readResponse<{ project?: unknown }>(response);
        const updated = toProjectEntryProject(data.project);
        if (!updated || updated.id !== project.id) {
          throw new TypeError("invalid project response");
        }
        renameAttempt = null;
        publish({
          projects: state.projects.map((row) =>
            row.id === updated.id ? updated : row
          ),
          renamingProject: false,
          renameDialogOpen: false,
          renameError: null,
          error: null,
        });
        return updated;
      } catch (error) {
        const status =
          error instanceof ProjectEntryHttpError ? error.status : null;
        publish({
          renamingProject: false,
          renameError:
            status === null
              ? errorFor(error)
              : status === 400
                ? copy.projectNameInvalid
                : projectEntryErrorMessage(status, copy),
        });
        if (status === 409) {
          // The Project moved on (revision or name). Re-read the authoritative list
          // so the next attempt targets the real revision; the displayed name is
          // only replaced by what the server reports.
          renameAttempt = null;
          await refreshProjects().catch(() => null);
        }
        return null;
      }
    },
    dismissError() {
      publish({ error: null });
    },
    setError(message: string) {
      publish({ error: message });
    },
    dispose() {
      disposed = true;
      projectsRequestSequence += 1;
      chatsRequestSequence += 1;
      listeners.clear();
    },
  };
}

class ProjectEntryHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Project API returned ${status}`);
    this.status = status;
  }
}
