export type ProjectEntryProject = {
  id: string;
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
  error: string | null;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response> | Response;

type ProjectListResponse = { projects?: unknown };
type ProjectRefreshResult =
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

function isProject(value: unknown): value is ProjectEntryProject {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.status === "active" &&
    typeof value.revision === "number" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
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

export function canShowProjectWorkspace(input: {
  writesEnabled: boolean;
  regularSession: boolean;
  registeredCustomer: boolean;
}): boolean {
  return (
    input.writesEnabled && input.regularSession && input.registeredCustomer
  );
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
  let projectOperationId: string | null = null;
  const chatOperationIds = new Map<string, string>();
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
        ? data.projects.filter(isProject)
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
    async createProject() {
      if (state.creatingProject) {
        return null;
      }
      projectOperationId ??= makeOperationId();
      publish({ creatingProject: true, error: null });
      try {
        const response = await fetcher("/api/projects", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operationId: projectOperationId }),
        });
        const data = await readResponse<{
          project?: unknown;
        }>(response);
        if (!isProject(data.project)) {
          throw new TypeError("invalid project response");
        }
        const project = data.project;
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
