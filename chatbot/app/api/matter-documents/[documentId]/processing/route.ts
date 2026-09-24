import { auth } from "@/app/(auth)/auth";
import {
  ProcessingConflictError,
  ProcessingIntegrityError,
  ProcessingNotFoundError,
} from "@/lib/matter-documents/processing/service";
import { getMatterDocumentProcessingService } from "@/lib/matter-documents/runtime";
import { publicMatterDocument } from "@/lib/matter-documents/service";

type RouteContext = {
  params: Promise<{ documentId: string }> | { documentId: string };
};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
async function customer() {
  const session = await auth();
  return session?.user?.id &&
    session.user.type === "regular" &&
    session.user.role === "user"
    ? session.user.id
    : null;
}
function failure(error: unknown) {
  if (error instanceof ProcessingNotFoundError) {
    return json({ error: "Document not found." }, 404);
  }
  if (error instanceof ProcessingIntegrityError) {
    return json({ error: "Stored document integrity check failed." }, 422);
  }
  if (error instanceof ProcessingConflictError) {
    return json(
      { error: "Document cannot be processed in its current state." },
      409
    );
  }
  return json({ error: "Unable to process the document." }, 500);
}
export async function POST(request: Request, context: RouteContext) {
  const userId = await customer();
  if (!userId) {
    return json({ error: "Authentication required." }, 401);
  }
  const { documentId } = await context.params;
  if (!UUID_PATTERN.test(documentId)) {
    return json({ error: "Document not found." }, 404);
  }
  let retryFailed = false;
  try {
    const bodyText = await request.text();
    if (bodyText.length > 1024) {
      throw new Error("body_too_large");
    }
    const body = (bodyText ? JSON.parse(bodyText) : {}) as {
      retryFailed?: unknown;
    };
    if (
      body.retryFailed !== undefined &&
      typeof body.retryFailed !== "boolean"
    ) {
      return json({ error: "Invalid processing request." }, 400);
    }
    retryFailed = body.retryFailed === true;
  } catch {
    return json({ error: "Invalid processing request." }, 400);
  }
  try {
    return json(
      await getMatterDocumentProcessingService().process({
        documentId,
        userId,
        retryFailed,
      })
    );
  } catch (error) {
    return failure(error);
  }
}
export async function GET(request: Request, context: RouteContext) {
  const userId = await customer();
  if (!userId) {
    return json({ error: "Authentication required." }, 401);
  }
  const { documentId } = await context.params;
  if (!UUID_PATTERN.test(documentId)) {
    return json({ error: "Document not found." }, 404);
  }
  const runId = new URL(request.url).searchParams.get("runId") ?? undefined;
  if (runId && !UUID_PATTERN.test(runId)) {
    return json({ error: "Document not found." }, 404);
  }
  try {
    const result = (await getMatterDocumentProcessingService().getEvidence({
      documentId,
      userId,
      runId,
    })) as {
      document: Parameters<typeof publicMatterDocument>[0];
      run: unknown;
      units: unknown[];
    } | null;
    if (!result) {
      return json({ error: "Document not found." }, 404);
    }
    return json({
      document: publicMatterDocument(result.document),
      run: result.run,
      units: result.units,
    });
  } catch {
    return json({ error: "Unable to load document extraction." }, 500);
  }
}
