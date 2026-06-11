import { auth } from "@/app/(auth)/auth";
import {
  createImmigrationConversation,
  getOrCreateLocalImmigrationUserId,
  listImmigrationConversations,
} from "@/lib/db/queries";

async function currentConversationUserId() {
  const session = await auth();
  return session?.user?.id ?? (await getOrCreateLocalImmigrationUserId());
}

export async function GET() {
  const userId = await currentConversationUserId();
  const conversations = await listImmigrationConversations({
    userId,
    limit: 80,
  });

  return Response.json({
    conversations: conversations.map((conversation) => ({
      chatId: conversation.chatId,
      legalMatterId: conversation.legalMatterId ?? null,
      title:
        conversation.title ??
        conversation.chatTitle ??
        "Immigration conversation",
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const userId = await currentConversationUserId();
  let title = "New immigration conversation";

  try {
    const body = await request.json();
    if (typeof body?.title === "string" && body.title.trim()) {
      title = body.title.trim().slice(0, 120);
    }
  } catch {
    // Empty body is allowed.
  }

  const conversation = await createImmigrationConversation({ userId, title });

  return Response.json({
    chatId: conversation.chatId,
    legalMatterId: conversation.legalMatterId ?? null,
    title: conversation.title ?? title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  });
}
