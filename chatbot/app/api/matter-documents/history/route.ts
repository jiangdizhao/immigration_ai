import { auth } from "@/app/(auth)/auth";
import { createMatterDocumentHandlers } from "@/lib/matter-documents/http";
import { getMatterDocumentService } from "@/lib/matter-documents/runtime";

const handlers = createMatterDocumentHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return {
      userId: session.user.id,
      type: session.user.type,
      role: session.user.role,
    };
  },
  service: getMatterDocumentService(),
});

// Account-level historical file index. Documents stay scoped to their owner;
// listing them here never grants another conversation AI access to them.
export const GET = handlers.history;
