import type { MatterDocumentService } from "./service";
import {
  MatterDocumentNotFoundError,
  MatterDocumentStorageError,
} from "./service";
import {
  MAX_MATTER_DOCUMENT_BYTES,
  MatterDocumentValidationError,
} from "./validation";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOWNLOAD_DISPOSITION = "attachment";

type AuthenticatedDocumentUser = {
  userId: string;
  type: "guest" | "regular";
  role: "user" | "lawyer" | "admin";
};

type HttpDependencies = {
  authenticate: () => Promise<AuthenticatedDocumentUser | null>;
  service: MatterDocumentService;
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function jsonError(error: string, status: number) {
  return jsonResponse({ error }, status);
}

function mapError(error: unknown): Response {
  if (error instanceof MatterDocumentValidationError) {
    return jsonError(error.message, error.status);
  }
  if (error instanceof MatterDocumentNotFoundError) {
    return jsonError("Document or conversation not found.", 404);
  }
  if (error instanceof MatterDocumentStorageError) {
    return jsonError("Document storage is temporarily unavailable.", 503);
  }
  return jsonError("Unable to process the document request.", 500);
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_MATTER_DOCUMENT_BYTES
  ) {
    throw new MatterDocumentValidationError(
      "Files must be 25 MiB or smaller.",
      413
    );
  }
  if (!request.body) {
    throw new MatterDocumentValidationError("The selected file is empty.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > MAX_MATTER_DOCUMENT_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new MatterDocumentValidationError(
          "Files must be 25 MiB or smaller.",
          413
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function originalFilename(request: Request): string {
  const encoded = request.headers.get("x-original-filename");
  if (!encoded) {
    return "";
  }
  if (encoded.length > 1024) {
    throw new MatterDocumentValidationError("Choose a valid file name.");
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    throw new MatterDocumentValidationError("Choose a valid file name.");
  }
}

function contentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename).replaceAll("'", "%27");
  return `${DOWNLOAD_DISPOSITION}; filename*=UTF-8''${encoded}`;
}

export function createMatterDocumentHandlers(deps: HttpDependencies) {
  async function customer(): Promise<
    { userId: string } | { response: Response }
  > {
    const user = await deps.authenticate();
    if (!user) {
      return { response: jsonError("Authentication required.", 401) };
    }
    if (user.type !== "regular" || user.role !== "user") {
      return { response: jsonError("Customer access required.", 403) };
    }
    return { userId: user.userId };
  }

  return {
    async upload(request: Request) {
      const access = await customer();
      if ("response" in access) {
        return access.response;
      }
      const chatId = new URL(request.url).searchParams.get("chatId") ?? "";
      if (!UUID_PATTERN.test(chatId)) {
        return jsonError("A valid conversation is required.", 400);
      }
      try {
        const bytes = await readBoundedBody(request);
        const document = await deps.service.upload({
          userId: access.userId,
          chatId,
          filename: originalFilename(request),
          declaredMimeType: request.headers.get("content-type") ?? "",
          bytes,
        });
        return jsonResponse({ document }, 201);
      } catch (error) {
        return mapError(error);
      }
    },

    async list(request: Request) {
      const access = await customer();
      if ("response" in access) {
        return access.response;
      }
      const chatId = new URL(request.url).searchParams.get("chatId") ?? "";
      if (!UUID_PATTERN.test(chatId)) {
        return jsonError("A valid conversation is required.", 400);
      }
      try {
        const documents = await deps.service.list({
          userId: access.userId,
          chatId,
        });
        return jsonResponse({ documents });
      } catch (error) {
        return mapError(error);
      }
    },

    async metadata(_request: Request, documentId: string) {
      const access = await customer();
      if ("response" in access) {
        return access.response;
      }
      if (!UUID_PATTERN.test(documentId)) {
        return jsonError("Document not found.", 404);
      }
      try {
        const document = await deps.service.get({
          userId: access.userId,
          documentId,
        });
        return document
          ? jsonResponse({ document })
          : jsonError("Document not found.", 404);
      } catch (error) {
        return mapError(error);
      }
    },

    async download(_request: Request, documentId: string) {
      const access = await customer();
      if ("response" in access) {
        return access.response;
      }
      if (!UUID_PATTERN.test(documentId)) {
        return jsonError("Document not found.", 404);
      }
      try {
        const result = await deps.service.download({
          userId: access.userId,
          documentId,
        });
        if (!result) {
          return jsonError("Document not found.", 404);
        }
        return new Response(result.bytes, {
          headers: {
            "Content-Type": result.mimeType,
            "Content-Length": String(result.bytes.byteLength),
            "Content-Disposition": contentDisposition(result.filename),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",
          },
        });
      } catch (error) {
        return mapError(error);
      }
    },

    async delete(_request: Request, documentId: string) {
      const access = await customer();
      if ("response" in access) {
        return access.response;
      }
      if (!UUID_PATTERN.test(documentId)) {
        return jsonError("Document not found.", 404);
      }
      try {
        const deleted = await deps.service.delete({
          userId: access.userId,
          documentId,
        });
        return deleted
          ? new Response(null, { status: 204 })
          : jsonError("Document not found.", 404);
      } catch (error) {
        return mapError(error);
      }
    },
  };
}
