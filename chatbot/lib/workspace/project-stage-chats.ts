import {
  isProjectConversationStageKey,
  type ProjectConversationStageKey,
} from "@/lib/projects/stage-keys";

/**
 * Phase 13 M9-A client for step-bound Project conversations.
 *
 * Pure transport + strict validation, no React. The client can only ever ask the
 * server to open *the caller's own* conversation for a step; Project identity, Chat
 * ownership and read-only state all come back from the server, so nothing here can
 * widen access or resurrect another Project's Chat.
 */

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type ProjectStageChatErrorKind =
  | "authentication_required"
  | "not_found"
  | "state_changed"
  | "unavailable"
  | "request_failed";

export type ProjectStageChatBinding = {
  stageKey: ProjectConversationStageKey;
  chatId: string;
  createdAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function classify(status: number): ProjectStageChatErrorKind {
  switch (status) {
    case 401: {
      return "authentication_required";
    }
    case 404: {
      return "not_found";
    }
    case 409: {
      return "state_changed";
    }
    default: {
      return status >= 500 ? "unavailable" : "request_failed";
    }
  }
}

function endpoint(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/stage-chats`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** Lists the actor's own step conversations in one Project. */
export async function loadProjectStageChats(input: {
  projectId: string;
  fetchImpl?: FetchLike;
}): Promise<
  | { ok: true; stageChats: ProjectStageChatBinding[] }
  | { ok: false; state: ProjectStageChatErrorKind }
> {
  const fetchImpl: FetchLike =
    input.fetchImpl ?? ((request, init) => fetch(request as string, init));
  let response: Response;
  try {
    response = await fetchImpl(endpoint(input.projectId), {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
  } catch {
    return { ok: false, state: "request_failed" };
  }
  if (!response.ok) {
    return { ok: false, state: classify(response.status) };
  }
  const body = await readJson(response);
  const rows = isRecord(body) ? body.stageChats : null;
  if (!Array.isArray(rows)) {
    return { ok: false, state: "request_failed" };
  }
  const stageChats: ProjectStageChatBinding[] = [];
  for (const row of rows) {
    if (
      !isRecord(row) ||
      !isProjectConversationStageKey(row.stageKey) ||
      typeof row.chatId !== "string" ||
      !(row.createdAt === null || typeof row.createdAt === "string")
    ) {
      return { ok: false, state: "request_failed" };
    }
    stageChats.push({
      chatId: row.chatId,
      createdAt: row.createdAt,
      stageKey: row.stageKey,
    });
  }
  return { ok: true, stageChats };
}

/**
 * Finds — or creates once — the actor's conversation for one step.
 *
 * The body carries only the step key. No title, no chat id and no project id from the
 * client participates in the binding, so a tampered request cannot attach the step to
 * a foreign Chat.
 */
export async function openProjectStageChat(input: {
  projectId: string;
  stageKey: ProjectConversationStageKey;
  fetchImpl?: FetchLike;
}): Promise<
  | {
      ok: true;
      chatId: string;
      stageKey: ProjectConversationStageKey;
      readOnly: boolean;
      replayed: boolean;
    }
  | { ok: false; state: ProjectStageChatErrorKind }
> {
  const fetchImpl: FetchLike =
    input.fetchImpl ?? ((request, init) => fetch(request as string, init));
  let response: Response;
  try {
    response = await fetchImpl(endpoint(input.projectId), {
      body: JSON.stringify({ stageKey: input.stageKey }),
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      method: "POST",
    });
  } catch {
    return { ok: false, state: "request_failed" };
  }
  if (!response.ok) {
    return { ok: false, state: classify(response.status) };
  }
  const body = await readJson(response);
  if (
    !isRecord(body) ||
    typeof body.chatId !== "string" ||
    body.projectId !== input.projectId ||
    body.origin !== "project" ||
    body.stageKey !== input.stageKey ||
    typeof body.readOnly !== "boolean"
  ) {
    return { ok: false, state: "request_failed" };
  }
  return {
    chatId: body.chatId,
    ok: true,
    readOnly: body.readOnly,
    replayed: body.replayed === true,
    stageKey: input.stageKey,
  };
}
