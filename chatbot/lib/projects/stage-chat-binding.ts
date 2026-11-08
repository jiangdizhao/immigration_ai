import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";
import { projectChatWritesEnabled } from "@/lib/projects/chat-policy";
import type { ProjectConversationStageKey } from "@/lib/projects/stage-keys";

export {
  isProjectConversationStageKey,
  PROJECT_CONVERSATION_STAGE_KEYS,
  type ProjectConversationStageKey,
} from "@/lib/projects/stage-keys";

/**
 * Phase 13 M9-A — the pure core of persisted owner-scoped step conversations.
 *
 * This module has no database, session or `server-only` dependency, so the two
 * invariants that matter can be proven offline in the ordinary unit suite:
 *
 *   - **Project-specific idempotency.** The operation id includes the Project, because
 *     M1's `ProjectOperation` is unique on `(actorUserId, operationType, operationId)`
 *     while the create request hash includes `projectId`. A Project-independent id
 *     would make a second Project's create replay onto the first Project's operation
 *     instead of creating its own Chat.
 *   - **Read authorization first.** Every read calls the M1 read-authority method
 *     before touching a binding, so a revoked, foreign or unknown actor cannot
 *     enumerate Chat ids.
 *
 * The concrete store/session wiring lives in `stage-chat-repository.ts`, which is
 * `server-only` and uses the accepted M1 repository as the only authority. A stage
 * binding is *navigation identity only*: it grants no document, fact, evidence,
 * review or submission authority.
 */

/**
 * Fixed, server-owned titles.
 *
 * The title participates in the Project operation request hash, so it must be
 * deterministic: a replayed create with a different title would be rejected as an
 * idempotency conflict. Localised stage names are rendered from copy in the UI, not
 * persisted from client input.
 */
export const STAGE_CHAT_TITLES: Record<ProjectConversationStageKey, string> = {
  school_applications: "School applications",
  school_admissions: "Admissions workflow",
  student500: "Student 500 preparation",
};

/**
 * Deterministic operation id for one step conversation.
 *
 * Length: `stage-chat:` (11) + 36 (uuid) + `:` (1) + stage key (<= 18) + `:v1` (3)
 * = at most 69 characters, inside M1's 128-character operation-id limit.
 */
export function stageChatOperationId(input: {
  projectId: string;
  stageKey: ProjectConversationStageKey;
}) {
  return `stage-chat:${input.projectId}:${input.stageKey}:v1`;
}

export type StageChatBinding = {
  stageKey: ProjectConversationStageKey;
  chatId: string;
  createdAt: Date;
};

export type StageChatOutcome = {
  chatId: string;
  stageKey: ProjectConversationStageKey;
  readOnly: boolean;
  replayed: boolean;
};

type AuthorizedProject = { id: string; status: "active" | "closed" };

type CreatedChat = {
  chatId: string;
  replayed: boolean;
  project: AuthorizedProject;
};

/** Every dependency of the step-conversation repository. */
export type StageChatRepositoryDeps = {
  authorizeProjectRead(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<AuthorizedProject>;
  createProjectChat(input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    title: string;
  }): Promise<CreatedChat>;
  listBindings(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<StageChatBinding[]>;
  findBinding(input: {
    actorUserId: string;
    projectId: string;
    stageKey: ProjectConversationStageKey;
  }): Promise<StageChatBinding | null>;
  insertBinding(input: {
    actorUserId: string;
    projectId: string;
    stageKey: ProjectConversationStageKey;
    chatId: string;
  }): Promise<void>;
};

function projectReadOnly(status: "active" | "closed") {
  return status !== "active" || !projectChatWritesEnabled();
}

export function createStageChatRepository(deps: StageChatRepositoryDeps) {
  /**
   * Every step conversation this actor has open in one Project.
   *
   * Authorization happens **before** any query, so a revoked or foreign actor cannot
   * learn how many bindings exist, let alone their Chat ids. A closed Project stays
   * readable (read-only history), matching the M1 intent already used for Chat
   * history.
   */
  async function listStageChatBindings(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<StageChatBinding[]> {
    await deps.authorizeProjectRead(input);
    return deps.listBindings(input);
  }

  /**
   * Find-or-create one step conversation.
   *
   * Order matters: authorize the current Project read first, then reuse an existing
   * binding (read-only once the Project is closed), and only then let
   * `createProjectChat` apply its own write + closed-Project rules. Nothing here
   * bypasses an M1 rule.
   *
   * Idempotency has two independent layers, so a double click, a retry after a
   * network error or two concurrent tabs cannot create two Chats for one step:
   *   1. an existing binding is returned immediately;
   *   2. `createProjectChat` is called with the deterministic, Project-specific,
   *      server-derived operation id, so a concurrent create replays onto the same
   *      Chat *within that Project*.
   */
  async function findOrCreateStageChat(input: {
    actorUserId: string;
    projectId: string;
    stageKey: ProjectConversationStageKey;
  }): Promise<StageChatOutcome> {
    const project = await deps.authorizeProjectRead(input);
    const existing = await deps.findBinding(input);
    if (existing) {
      return {
        chatId: existing.chatId,
        readOnly: projectReadOnly(project.status),
        replayed: true,
        stageKey: input.stageKey,
      };
    }

    const created = await deps.createProjectChat({
      actorUserId: input.actorUserId,
      operationId: stageChatOperationId({
        projectId: input.projectId,
        stageKey: input.stageKey,
      }),
      projectId: input.projectId,
      title: STAGE_CHAT_TITLES[input.stageKey],
    });

    await deps.insertBinding({
      actorUserId: input.actorUserId,
      chatId: created.chatId,
      projectId: input.projectId,
      stageKey: input.stageKey,
    });

    const settled = await deps.findBinding(input);
    if (!settled) {
      // The binding insert could not be observed after a successful Chat create.
      // Fail closed rather than returning a Chat the actor cannot navigate back to
      // from the step they asked for.
      throw new ProjectFoundationError("outcome_unavailable");
    }

    return {
      chatId: settled.chatId,
      readOnly: projectReadOnly(created.project.status),
      replayed: created.replayed || settled.chatId !== created.chatId,
      stageKey: input.stageKey,
    };
  }

  return { findOrCreateStageChat, listStageChatBindings };
}
