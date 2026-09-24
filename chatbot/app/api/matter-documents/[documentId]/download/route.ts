import { auth } from "@/app/(auth)/auth";
import { createMatterDocumentHandlers } from "@/lib/matter-documents/http";
import { getMatterDocumentService } from "@/lib/matter-documents/runtime";

type RouteContext = {
  params: Promise<{ documentId: string }> | { documentId: string };
};

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

export async function GET(request: Request, context: RouteContext) {
  const { documentId } = await context.params;
  return handlers.download(request, documentId);
}
