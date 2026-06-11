import { auth } from "@/app/(auth)/auth";
import {
  getImmigrationConversationByChatId,
  getMessagesByChatId,
  getOrCreateLocalImmigrationUserId,
  updateImmigrationConversation,
} from "@/lib/db/queries";

type RouteContext = {
  params: Promise<{ chatId: string }> | { chatId: string };
};

async function currentConversationUserId() {
  const session = await auth();
  return session?.user?.id ?? (await getOrCreateLocalImmigrationUserId());
}

async function getChatId(context: RouteContext) {
  const params = await context.params;
  return params.chatId;
}

function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        (part as { type?: unknown }).type === "text" &&
        "text" in part
      ) {
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export async function GET(_request: Request, context: RouteContext) {
  const userId = await currentConversationUserId();
  const chatId = await getChatId(context);
  const conversation = await getImmigrationConversationByChatId({
    chatId,
    userId,
  });

  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const messages = await getMessagesByChatId({ id: chatId });

  return Response.json({
    chatId: conversation.chatId,
    legalMatterId: conversation.legalMatterId ?? null,
    title:
      conversation.title ??
      conversation.chatTitle ??
      "Immigration conversation",
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: extractTextFromParts(message.parts),
      createdAt: message.createdAt,
    })),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await currentConversationUserId();
  const chatId = await getChatId(context);
  const body = await request.json();

  const updated = await updateImmigrationConversation({
    chatId,
    userId,
    legalMatterId:
      typeof body?.legalMatterId === "string" && body.legalMatterId.trim()
        ? body.legalMatterId.trim()
        : body?.legalMatterId === null
          ? null
          : undefined,
    title:
      typeof body?.title === "string"
        ? body.title.trim().slice(0, 120)
        : undefined,
  });

  if (!updated) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  return Response.json({
    chatId: updated.chatId,
    legalMatterId: updated.legalMatterId ?? null,
    title: updated.title ?? "Immigration conversation",
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
}
