import { auth } from "@/app/(auth)/auth";
import { createDatabaseConversationHistoryHandlers } from "@/lib/conversations/history-runtime";

const handlers = createDatabaseConversationHistoryHandlers(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return { userId: session.user.id };
});

export async function GET(request: Request) {
  return await handlers.list(request);
}

export async function POST(request: Request) {
  return await handlers.create(request);
}
