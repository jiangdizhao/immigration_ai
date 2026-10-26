import { createHash } from "node:crypto";
import { z } from "zod";
import { MATTER_DOCUMENT_MIME_TYPES } from "@/lib/matter-documents/formats";
import {
  MAX_MATTER_DOCUMENT_BYTES,
  MatterDocumentValidationError,
  normalizeOriginalFilename,
  validateMatterDocument,
} from "@/lib/matter-documents/validation";
import { PROJECT_DOCUMENT_IMPORT_NOTICE_VERSION } from "./types";

const UUID = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
  );
const OPERATION_ID = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const EXPECTED_REVISION = z.number().int().positive().safe();
const JSON_BODY_LIMIT = 8 * 1024;

export { PROJECT_DOCUMENT_IMPORT_NOTICE_VERSION } from "./types";

export type ProjectDocumentApplicationFailureCode =
  | "invalid_request"
  | "invalid_document"
  | "project_not_found"
  | "project_forbidden"
  | "project_closed"
  | "document_not_found"
  | "source_not_owned"
  | "consent_unverified"
  | "grant_required"
  | "document_not_clean"
  | "scan_unverified"
  | "revision_conflict"
  | "idempotency_conflict"
  | "state_conflict"
  | "storage_failed"
  | "unavailable";

export class ProjectDocumentApplicationError extends Error {
  readonly code: ProjectDocumentApplicationFailureCode;

  constructor(code: ProjectDocumentApplicationFailureCode) {
    super(code);
    this.name = "ProjectDocumentApplicationError";
    this.code = code;
  }
}

export type ProjectDocumentPublicMetadata = {
  assetId: string;
  versionId: string;
  versionNumber: number;
  lifecycle: "active" | "withdrawn" | "deletion_pending" | "deleted";
  originKind: "direct_upload" | "explicit_chat_import";
  canonicalMime: string;
  byteSize: number;
  storageStatus: "pending" | "stored" | "failed" | "cleanup_pending";
  securityStatus: "pending" | "clean" | "rejected" | "failed";
};

export type ProjectDocumentOperationResponse = {
  operationId: string;
  assetId: string;
  versionId: string;
  status: "intent_created" | "stored" | "failed" | "cleanup_pending";
  storageStatus: "pending" | "stored" | "failed" | "cleanup_pending";
  securityStatus: "pending" | "clean" | "rejected" | "failed";
  projectRevision: number;
  replayed: boolean;
};

export type ProjectDocumentDownload = {
  filename: string;
  canonicalMime: string;
  bytes: Uint8Array;
  expectedSha256: string;
  expectedByteSize: number;
  storageStatus: "stored";
  securityStatus: "clean";
  /** Internal app capability asserts current grant + trusted exact-version scan audit. */
  exactVersionCleanAuthorized: boolean;
};

/**
 * The application adapter owns Project/membership/creator/grant authorization and
 * must recheck it around byte access. A1.0's in-memory repository is deliberately
 * not accepted here as a substitute for A1.1 persistence.
 */
export interface ProjectDocumentCustomerApplication {
  listMetadata(input: {
    actorUserId: string;
    projectId: string;
    limit: number;
  }): Promise<ProjectDocumentPublicMetadata[]>;
  createDirectUpload(input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    filename: string;
    declaredMimeType: string;
    canonicalMime: string;
    formatId: string;
    sha256: string;
    bytes: Uint8Array;
  }): Promise<ProjectDocumentOperationResponse>;
  issueImportConsentAcknowledgement(input: {
    actorUserId: string;
    projectId: string;
    sourceChatId: string;
    sourceDocumentId: string;
    consentAccepted: true;
    noticeVersion: typeof PROJECT_DOCUMENT_IMPORT_NOTICE_VERSION;
  }): Promise<{ acknowledgement: string }>;
  importOwnedChatDocument(input: {
    actorUserId: string;
    projectId: string;
    operationId: string;
    expectedProjectRevision: number;
    sourceChatId: string;
    sourceDocumentId: string;
    /** Versioned acceptance is bound to the authenticated actor by the server adapter. */
    consentAcknowledgement: string;
  }): Promise<ProjectDocumentOperationResponse>;
  getMetadata(input: {
    actorUserId: string;
    projectId: string;
    assetId: string;
  }): Promise<ProjectDocumentPublicMetadata | null>;
  download(input: {
    actorUserId: string;
    projectId: string;
    assetId: string;
    versionId: string;
  }): Promise<ProjectDocumentDownload | null>;
  withdraw(input: {
    actorUserId: string;
    projectId: string;
    assetId: string;
    operationId: string;
    expectedProjectRevision: number;
  }): Promise<{
    assetId: string;
    lifecycle: "withdrawn";
    projectRevision: number;
    replayed: boolean;
  }>;
  revokeCreatorGrant(input: {
    actorUserId: string;
    projectId: string;
    grantId: string;
    operationId: string;
    expectedProjectRevision: number;
  }): Promise<{ grantId: string; revoked: true; replayed: boolean }>;
}

export type ProjectDocumentHttpSession = {
  userId: string;
  type: "guest" | "regular";
};

export type ProjectDocumentHttpDependencies = {
  authenticate: () => Promise<ProjectDocumentHttpSession | null>;
  isRegisteredCustomer: (userId: string) => Promise<boolean>;
  schemaAvailable: () => Promise<boolean>;
  featureEnabled: () => boolean;
  /** Independent readiness gate. Production currently has no trusted provider. */
  trustedLiveReadiness: () => Promise<boolean>;
  application: ProjectDocumentCustomerApplication | null;
  rateLimit?: (input: {
    actorUserId: string;
    projectId: string;
    action: "list" | "upload" | "import" | "read" | "download" | "withdraw";
  }) => Promise<boolean>;
};
type ProjectDocumentHttpAction =
  | "list"
  | "upload"
  | "import"
  | "read"
  | "download"
  | "withdraw";

const uploadHeadersSchema = z.object({
  operationId: OPERATION_ID,
  expectedProjectRevision: z.coerce.number().int().positive().safe(),
  filename: z.string().min(1).max(1024),
});
const importBodySchema = z
  .object({
    operationId: OPERATION_ID,
    expectedProjectRevision: EXPECTED_REVISION,
    sourceChatId: UUID,
    sourceDocumentId: UUID,
    consentAcknowledgement: z.string().min(32).max(2048),
  })
  .strict();
const importConsentBodySchema = z
  .object({
    sourceChatId: UUID,
    sourceDocumentId: UUID,
    accepted: z.literal(true),
    noticeVersion: z.literal(PROJECT_DOCUMENT_IMPORT_NOTICE_VERSION),
  })
  .strict();
const withdrawBodySchema = z
  .object({
    operationId: OPERATION_ID,
    expectedProjectRevision: EXPECTED_REVISION,
  })
  .strict();
const publicOperationResponseSchema = z.object({
  operationId: OPERATION_ID,
  assetId: UUID,
  versionId: UUID,
  status: z.enum(["intent_created", "stored", "failed", "cleanup_pending"]),
  storageStatus: z.enum(["pending", "stored", "failed", "cleanup_pending"]),
  securityStatus: z.enum(["pending", "clean", "rejected", "failed"]),
  projectRevision: EXPECTED_REVISION,
  replayed: z.boolean(),
});
const publicWithdrawalResponseSchema = z.object({
  assetId: UUID,
  lifecycle: z.literal("withdrawn"),
  projectRevision: EXPECTED_REVISION,
  replayed: z.boolean(),
});
const publicGrantRevocationResponseSchema = z.object({
  grantId: UUID,
  revoked: z.literal(true),
  replayed: z.boolean(),
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" },
  });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

function applicationFailureResponse(
  cause: unknown,
  fallbackMessage = "Project documents are unavailable."
): Response {
  if (!(cause instanceof ProjectDocumentApplicationError)) {
    return error(fallbackMessage, 503);
  }
  switch (cause.code) {
    case "invalid_request":
    case "invalid_document":
      return error("Invalid document request.", 400);
    case "project_closed":
    case "revision_conflict":
    case "idempotency_conflict":
    case "state_conflict":
      return error(
        "Project document state changed. Refresh and try again.",
        409
      );
    case "project_not_found":
    case "project_forbidden":
    case "document_not_found":
    case "source_not_owned":
    case "grant_required":
      return error("Document not found.", 404);
    case "consent_unverified":
    case "document_not_clean":
    case "scan_unverified":
    case "storage_failed":
    case "unavailable":
      return error(fallbackMessage, 503);
    default:
      return error(fallbackMessage, 503);
  }
}

async function boundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new TypeError("invalid_json");
  }
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/u.test(declared) || Number(declared) > JSON_BODY_LIMIT)
  ) {
    throw new RangeError("body_too_large");
  }
  if (!request.body) {
    throw new TypeError("invalid_json");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > JSON_BODY_LIMIT) {
        await reader.cancel().catch(() => undefined);
        throw new RangeError("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function boundedBytes(request: Request): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/u.test(contentLength) ||
      Number(contentLength) > MAX_MATTER_DOCUMENT_BYTES)
  ) {
    throw new RangeError("body_too_large");
  }
  if (!request.body) {
    throw new MatterDocumentValidationError("The selected file is empty.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > MAX_MATTER_DOCUMENT_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RangeError("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeMetadata(value: ProjectDocumentPublicMetadata) {
  return {
    assetId: value.assetId,
    versionId: value.versionId,
    versionNumber: value.versionNumber,
    lifecycle: value.lifecycle,
    originKind: value.originKind,
    canonicalMime: value.canonicalMime,
    byteSize: value.byteSize,
    storageStatus: value.storageStatus,
    securityStatus: value.securityStatus,
  };
}

function safeOperationResponse(value: unknown, expectedOperationId: string) {
  const parsed = publicOperationResponseSchema.parse(value);
  if (parsed.operationId !== expectedOperationId) {
    throw new TypeError("invalid_application_result");
  }
  return parsed;
}

function safeWithdrawalResponse(value: unknown, expectedAssetId: string) {
  const parsed = publicWithdrawalResponseSchema.parse(value);
  if (parsed.assetId !== expectedAssetId) {
    throw new TypeError("invalid_application_result");
  }
  return parsed;
}

function safeGrantRevocationResponse(value: unknown, expectedGrantId: string) {
  const parsed = publicGrantRevocationResponseSchema.parse(value);
  if (parsed.grantId !== expectedGrantId) {
    throw new TypeError("invalid_application_result");
  }
  return parsed;
}

export function createProjectDocumentHandlers(
  deps: ProjectDocumentHttpDependencies
) {
  type AccessResult =
    | { response: Response }
    | { actorUserId: string; application: ProjectDocumentCustomerApplication };
  async function access(
    _request: Request,
    projectId: string,
    action: ProjectDocumentHttpAction
  ): Promise<AccessResult> {
    if (!UUID.safeParse(projectId).success) {
      return { response: error("Invalid document request.", 400) } as const;
    }
    let session: ProjectDocumentHttpSession | null;
    try {
      session = await deps.authenticate();
    } catch {
      return {
        response: error("Authentication is temporarily unavailable.", 503),
      } as const;
    }
    if (!session?.userId || session.type !== "regular") {
      return { response: error("Authentication required.", 401) } as const;
    }
    let ready = false;
    try {
      ready = deps.featureEnabled() && (await deps.trustedLiveReadiness());
    } catch {
      ready = false;
    }
    if (!ready || !deps.application) {
      return {
        response: error("Project documents are unavailable.", 503),
      } as const;
    }
    let registered = false;
    try {
      registered = await deps.isRegisteredCustomer(session.userId);
    } catch {
      return {
        response: error("Project documents are unavailable.", 503),
      } as const;
    }
    if (!registered) {
      return {
        response: error("Customer account access required.", 403),
      } as const;
    }
    try {
      if (!(await deps.schemaAvailable())) {
        return {
          response: error("Project documents are unavailable.", 503),
        } as const;
      }
    } catch {
      return {
        response: error("Project documents are unavailable.", 503),
      } as const;
    }
    if (deps.rateLimit) {
      let allowed = false;
      try {
        allowed = await deps.rateLimit({
          actorUserId: session.userId,
          projectId,
          action,
        });
      } catch {
        allowed = false;
      }
      if (!allowed) {
        return {
          response: error("Too many document requests. Try again later.", 429),
        } as const;
      }
    }
    return {
      actorUserId: session.userId,
      application: deps.application,
    } as const;
  }

  return {
    async list(request: Request, projectId: string): Promise<Response> {
      const auth = await access(request, projectId, "list");
      if ("response" in auth) {
        return auth.response;
      }
      try {
        const rows = await auth.application.listMetadata({
          actorUserId: auth.actorUserId,
          projectId,
          limit: 50,
        });
        return json({ documents: rows.map(safeMetadata) });
      } catch (cause) {
        return applicationFailureResponse(cause);
      }
    },

    async upload(request: Request, projectId: string): Promise<Response> {
      const auth = await access(request, projectId, "upload");
      if ("response" in auth) {
        return auth.response;
      }
      const headers = uploadHeadersSchema.safeParse({
        operationId: request.headers.get("x-operation-id"),
        expectedProjectRevision: request.headers.get(
          "x-expected-project-revision"
        ),
        filename: request.headers.get("x-original-filename"),
      });
      if (!headers.success) {
        return error("Invalid document request.", 400);
      }
      try {
        const bytes = await boundedBytes(request);
        let decodedFilename: string;
        try {
          decodedFilename = decodeURIComponent(headers.data.filename);
        } catch {
          return error("Invalid document request.", 400);
        }
        const filename = normalizeOriginalFilename(decodedFilename);
        const declaredMimeType =
          request.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
        const validated = await validateMatterDocument({
          bytes,
          filename,
          declaredMimeType,
        });
        const receipt = safeOperationResponse(
          await auth.application.createDirectUpload({
            actorUserId: auth.actorUserId,
            projectId,
            operationId: headers.data.operationId,
            expectedProjectRevision: headers.data.expectedProjectRevision,
            filename: validated.originalFilename,
            declaredMimeType,
            canonicalMime: validated.mimeType,
            formatId: validated.format.id,
            sha256: sha256(bytes),
            bytes,
          }),
          headers.data.operationId
        );
        return json({ document: receipt }, receipt.replayed ? 200 : 201);
      } catch (cause) {
        if (cause instanceof RangeError) {
          return error("The selected file is too large.", 413);
        }
        if (cause instanceof MatterDocumentValidationError) {
          return error(cause.message, cause.status);
        }
        return applicationFailureResponse(cause);
      }
    },

    async importChatDocument(
      request: Request,
      projectId: string
    ): Promise<Response> {
      const auth = await access(request, projectId, "import");
      if ("response" in auth) {
        return auth.response;
      }
      let raw: unknown;
      try {
        raw = await boundedJson(request);
      } catch (cause) {
        return error(
          "Invalid document request.",
          cause instanceof RangeError ? 413 : 400
        );
      }
      const body = importBodySchema.safeParse(raw);
      if (!body.success) {
        return error(
          "Explicit versioned import acknowledgement is required.",
          400
        );
      }
      try {
        const receipt = safeOperationResponse(
          await auth.application.importOwnedChatDocument({
            actorUserId: auth.actorUserId,
            projectId,
            ...body.data,
          }),
          body.data.operationId
        );
        return json({ document: receipt }, receipt.replayed ? 200 : 201);
      } catch (cause) {
        return applicationFailureResponse(
          cause,
          "Project document import is unavailable."
        );
      }
    },

    async createImportConsentAcknowledgement(
      request: Request,
      projectId: string
    ): Promise<Response> {
      const auth = await access(request, projectId, "import");
      if ("response" in auth) {
        return auth.response;
      }
      let raw: unknown;
      try {
        raw = await boundedJson(request);
      } catch (cause) {
        return error(
          "Invalid consent request.",
          cause instanceof RangeError ? 413 : 400
        );
      }
      const body = importConsentBodySchema.safeParse(raw);
      if (!body.success) {
        return error("Explicit import consent is required.", 400);
      }
      try {
        const receipt =
          await auth.application.issueImportConsentAcknowledgement({
            actorUserId: auth.actorUserId,
            projectId,
            sourceChatId: body.data.sourceChatId,
            sourceDocumentId: body.data.sourceDocumentId,
            consentAccepted: true,
            noticeVersion: body.data.noticeVersion,
          });
        if (
          typeof receipt.acknowledgement !== "string" ||
          receipt.acknowledgement.length < 32 ||
          receipt.acknowledgement.length > 2048
        ) {
          return error("Consent service is unavailable.", 503);
        }
        return json({ acknowledgement: receipt.acknowledgement }, 201);
      } catch (cause) {
        return applicationFailureResponse(
          cause,
          "Consent service is unavailable."
        );
      }
    },

    async metadata(
      request: Request,
      projectId: string,
      assetId: string
    ): Promise<Response> {
      const auth = await access(request, projectId, "read");
      if ("response" in auth) {
        return auth.response;
      }
      if (!UUID.safeParse(assetId).success) {
        return error("Document not found.", 404);
      }
      try {
        const value = await auth.application.getMetadata({
          actorUserId: auth.actorUserId,
          projectId,
          assetId,
        });
        return value
          ? json({ document: safeMetadata(value) })
          : error("Document not found.", 404);
      } catch (cause) {
        return applicationFailureResponse(
          cause,
          "Document lookup is unavailable."
        );
      }
    },

    async download(
      request: Request,
      projectId: string,
      assetId: string
    ): Promise<Response> {
      const auth = await access(request, projectId, "download");
      if ("response" in auth) {
        return auth.response;
      }
      const versionId =
        new URL(request.url).searchParams.get("versionId") ?? "";
      if (
        !UUID.safeParse(assetId).success ||
        !UUID.safeParse(versionId).success
      ) {
        return error("Document not found.", 404);
      }
      try {
        const value = await auth.application.download({
          actorUserId: auth.actorUserId,
          projectId,
          assetId,
          versionId,
        });
        if (!value) {
          return error("Document not found.", 404);
        }
        if (
          value.exactVersionCleanAuthorized !== true ||
          value.storageStatus !== "stored" ||
          value.securityStatus !== "clean" ||
          value.bytes.byteLength !== value.expectedByteSize ||
          sha256(value.bytes) !== value.expectedSha256
        ) {
          return error("Document content is not available.", 503);
        }
        if (
          !MATTER_DOCUMENT_MIME_TYPES.some(
            (mime) => mime === value.canonicalMime
          )
        ) {
          return error("Document content is not available.", 503);
        }
        const filename = normalizeOriginalFilename(value.filename);
        const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(filename).replaceAll("'", "%27")}`;
        return new Response(value.bytes, {
          status: 200,
          headers: {
            "Cache-Control": "private, no-store",
            Pragma: "no-cache",
            "Content-Type": value.canonicalMime,
            "Content-Length": String(value.bytes.byteLength),
            "Content-Disposition": disposition,
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch (cause) {
        return applicationFailureResponse(
          cause,
          "Document content is not available."
        );
      }
    },

    async withdraw(
      request: Request,
      projectId: string,
      assetId: string
    ): Promise<Response> {
      const auth = await access(request, projectId, "withdraw");
      if ("response" in auth) {
        return auth.response;
      }
      if (!UUID.safeParse(assetId).success) {
        return error("Document not found.", 404);
      }
      let raw: unknown;
      try {
        raw = await boundedJson(request);
      } catch (cause) {
        return error(
          "Invalid document request.",
          cause instanceof RangeError ? 413 : 400
        );
      }
      const body = withdrawBodySchema.safeParse(raw);
      if (!body.success) {
        return error("Invalid document request.", 400);
      }
      try {
        const result = safeWithdrawalResponse(
          await auth.application.withdraw({
            actorUserId: auth.actorUserId,
            projectId,
            assetId,
            ...body.data,
          }),
          assetId
        );
        return json({ document: result });
      } catch (cause) {
        return applicationFailureResponse(
          cause,
          "Document withdrawal is unavailable."
        );
      }
    },

    async revokeGrant(
      request: Request,
      projectId: string,
      grantId: string
    ): Promise<Response> {
      const auth = await access(request, projectId, "withdraw");
      if ("response" in auth) {
        return auth.response;
      }
      if (!UUID.safeParse(grantId).success) {
        return error("Grant not found.", 404);
      }
      let raw: unknown;
      try {
        raw = await boundedJson(request);
      } catch (cause) {
        return error(
          "Invalid document request.",
          cause instanceof RangeError ? 413 : 400
        );
      }
      const body = withdrawBodySchema.safeParse(raw);
      if (!body.success) {
        return error("Invalid document request.", 400);
      }
      try {
        const result = safeGrantRevocationResponse(
          await auth.application.revokeCreatorGrant({
            actorUserId: auth.actorUserId,
            projectId,
            grantId,
            ...body.data,
          }),
          grantId
        );
        return json({ grant: result });
      } catch (cause) {
        return applicationFailureResponse(
          cause,
          "Grant revocation is unavailable."
        );
      }
    },
  };
}
