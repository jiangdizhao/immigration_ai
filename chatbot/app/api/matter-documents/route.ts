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

export const POST = handlers.upload;
export const GET = handlers.list;
