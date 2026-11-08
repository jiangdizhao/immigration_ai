import "server-only";

import { and, eq } from "drizzle-orm";
import {
  type ProjectFoundationProject,
  projectFoundationRepository,
} from "@/lib/db/project-foundation";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import { projectConversationStage } from "@/lib/db/schema";
import {
  createStageChatRepository,
  type StageChatBinding,
  type StageChatRepositoryDeps,
} from "@/lib/projects/stage-chat-binding";

/**
 * Phase 13 M9-A — production wiring for persisted owner-scoped step conversations.
 *
 * The rules themselves live in the pure `stage-chat-binding` core; this module only
 * supplies the accepted M1 repository (authority + Chat creation) and the binding
 * store, so nothing here re-implements Project authorization, membership status,
 * closed-Project behaviour, write gating or operation idempotency.
 *
 * The repository deliberately exposes no non-authorizing finder: both public methods
 * call `authorizeProjectRead` before reading a binding.
 */

export {
  isProjectConversationStageKey,
  PROJECT_CONVERSATION_STAGE_KEYS,
  type ProjectConversationStageKey,
  STAGE_CHAT_TITLES,
  type StageChatBinding,
  type StageChatOutcome,
  type StageChatRepositoryDeps,
  stageChatOperationId,
} from "@/lib/projects/stage-chat-binding";

const db = getLazyDatabase();

function bindingColumns() {
  return {
    chatId: projectConversationStage.chatId,
    createdAt: projectConversationStage.createdAt,
    stageKey: projectConversationStage.stageKey,
  };
}

const deps: StageChatRepositoryDeps = {
  async authorizeProjectRead(
    input
  ): Promise<Pick<ProjectFoundationProject, "id" | "status">> {
    const project =
      await projectFoundationRepository.authorizeProjectRead(input);
    return { id: project.id, status: project.status };
  },
  async createProjectChat(input) {
    const created = await projectFoundationRepository.createProjectChat(input);
    return {
      chatId: created.chatId,
      project: { id: created.project.id, status: created.project.status },
      replayed: created.replayed,
    };
  },
  async insertBinding(input) {
    await db
      .insert(projectConversationStage)
      .values({
        chatId: input.chatId,
        createdByUserId: input.actorUserId,
        projectId: input.projectId,
        stageKey: input.stageKey,
      })
      // A concurrent request for the same step may already hold the unique
      // `(projectId, createdByUserId, stageKey)` row; that is the idempotent case.
      .onConflictDoNothing();
  },
  findBinding: async (input) => {
    const [row] = await db
      .select(bindingColumns())
      .from(projectConversationStage)
      .where(
        and(
          eq(projectConversationStage.projectId, input.projectId),
          eq(projectConversationStage.createdByUserId, input.actorUserId),
          eq(projectConversationStage.stageKey, input.stageKey)
        )
      )
      .limit(1);
    return (row as StageChatBinding | undefined) ?? null;
  },
  listBindings: (input) =>
    db
      .select(bindingColumns())
      .from(projectConversationStage)
      .where(
        and(
          eq(projectConversationStage.projectId, input.projectId),
          eq(projectConversationStage.createdByUserId, input.actorUserId)
        )
      ) as Promise<StageChatBinding[]>,
};

export const stageChatRepository = createStageChatRepository(deps);

export const listStageChatBindings = stageChatRepository.listStageChatBindings;
export const findOrCreateStageChat = stageChatRepository.findOrCreateStageChat;
