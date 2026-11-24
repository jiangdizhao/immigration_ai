import { auth } from "@/app/(auth)/auth";
import { createDatabaseConversationHistoryHandlers } from "@/lib/conversations/history-runtime";

type RouteContext = {
  params: Promise<{ chatId: string }> | { chatId: string };
};

const handlers = createDatabaseConversationHistoryHandlers(
  async () => {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { userId: session.user.id };
  },
  () => process.env.NEXT_PUBLIC_WIDGET_DEBUG === "true"
);

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  return await handlers.courseResearchDiagnostics(_request, params.chatId);
}
