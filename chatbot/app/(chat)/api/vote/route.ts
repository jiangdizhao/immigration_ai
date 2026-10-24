import { auth } from "@/app/(auth)/auth";
import { createVoteHandlers } from "@/lib/conversations/vote-http";
import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaStatus } from "@/lib/db/project-foundation-schema-availability";
import { getChatById, getVotesByChatId, voteMessage } from "@/lib/db/queries";

const handlers = createVoteHandlers({
  authenticate: auth,
  getChatById,
  async isProjectChat(chatId) {
    const schemaStatus = await projectFoundationSchemaStatus();
    if (schemaStatus === "absent") {
      return false;
    }
    if (schemaStatus !== "ready") {
      throw new Error("Project schema identity is incomplete.");
    }
    return Boolean(
      await projectFoundationRepository.getProjectChatOrigin(chatId)
    );
  },
  getVotesByChatId,
  voteMessage,
});

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
