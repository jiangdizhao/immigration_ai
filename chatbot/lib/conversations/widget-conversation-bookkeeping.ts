import "server-only";

import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaStatus } from "@/lib/db/project-foundation-schema-availability";
import {
  touchImmigrationConversation,
  updateImmigrationConversation,
} from "@/lib/db/queries";

/** Keep Project title bookkeeping on the dual-authorized write boundary. */
export async function updateWidgetConversationBookkeeping(input: {
  chatId: string;
  userId: string;
  title: string;
  legalMatterId: string | null;
}) {
  const schemaStatus = await projectFoundationSchemaStatus();
  if (schemaStatus === "partial") {
    throw new Error("Project schema identity is incomplete.");
  }
  if (schemaStatus === "ready") {
    const origin = await projectFoundationRepository.getProjectChatOrigin(
      input.chatId
    );
    if (origin) {
      return await projectFoundationRepository.updateOwnedProjectChat({
        actorUserId: input.userId,
        chatId: input.chatId,
        title: input.title,
        legalMatterId: null,
      });
    }
  }

  if (input.legalMatterId) {
    return await updateImmigrationConversation({
      chatId: input.chatId,
      userId: input.userId,
      legalMatterId: input.legalMatterId,
      title: input.title,
    });
  }
  return await touchImmigrationConversation({
    chatId: input.chatId,
    userId: input.userId,
  });
}
