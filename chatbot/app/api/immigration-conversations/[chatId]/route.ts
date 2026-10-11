import { auth } from "@/app/(auth)/auth";
import { createDatabaseConversationHistoryHandlers } from "@/lib/conversations/history-runtime";

type RouteContext = {
  params: Promise<{ chatId: string }> | { chatId: string };
};

const handlers = createDatabaseConversationHistoryHandlers(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return { userId: session.user.id };
});

async function getChatId(context: RouteContext) {
  const params = await context.params;
  return params.chatId;
}

export async function GET(request: Request, context: RouteContext) {
  return await handlers.detail(request, await getChatId(context));
}

export async function PATCH(request: Request, context: RouteContext) {
  return await handlers.update(request, await getChatId(context));
}
