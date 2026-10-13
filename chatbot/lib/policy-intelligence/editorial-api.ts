import { z } from "zod";
import type { EditorialError } from "./editorial-core";
import type { PolicyEditorialService } from "./editorial-service";
import type { OperatorSubmissionService } from "./operator-submission";

/**
 * Phase 12 Stage 3 — HTTP contract for the Policy Intelligence editorial
 * workspace. Handlers are I/O-thin: the authenticated actor always comes from
 * the server session (`resolveActor`); nothing in the request body can name an
 * actor or a role, and every schema is strict, so a forged actor/role field is
 * a validation failure rather than an authorization bypass.
 */

export const EDITORIAL_BODY_LIMIT_BYTES = 256 * 1024;

/**
 * Phase 12 Stage 3 R1 — a *real* bounded request-body reader.
 *
 * The declared `Content-Length` is only a fast path: it is attacker-supplied,
 * so the reader also enforces the byte budget on the stream itself and stops
 * reading as soon as the limit is exceeded. Nothing larger than the budget is
 * ever buffered or parsed.
 */
export async function readBoundedEditorialJsonBody(
  request: Request,
  limit = EDITORIAL_BODY_LIMIT_BYTES
): Promise<unknown | Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }
  if (!request.body) {
    return null;
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return Response.json({ error: "payload_too_large" }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  if (total === 0) {
    return null;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(merged));
  } catch {
    return null;
  }
}

export type EditorialActorResolver = () => Promise<
  { userId: string } | Response
>;

const itemIdSchema = z.string().uuid();
const idempotencyKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._:-]{8,80}$/u)
  .nullable()
  .optional();

const createDraftSchema = z
  .object({
    content: z.unknown(),
    slug: z.string().trim().max(120).nullable().optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

const saveDraftSchema = z
  .object({
    itemId: itemIdSchema,
    revisionId: itemIdSchema,
    expectedContentVersion: z.string().trim().min(8).max(128),
    content: z.unknown(),
  })
  .strict();

const createRevisionSchema = z.object({ itemId: itemIdSchema }).strict();

const publishDraftSchema = z
  .object({
    itemId: itemIdSchema,
    revisionId: itemIdSchema,
    expectedContentVersion: z.string().trim().min(8).max(128),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

const forcePublishSchema = z
  .object({
    itemId: itemIdSchema,
    baseRevisionId: itemIdSchema,
    expectedBaseRevisionNumber: z.number().int().min(1).max(1_000_000),
    expectedPublishedRevisionId: itemIdSchema.nullable(),
    overrideReason: z.string().trim().min(3).max(2000),
    content: z.unknown(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

const archiveSchema = z
  .object({
    itemId: itemIdSchema,
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const restoreSchema = z.object({ itemId: itemIdSchema }).strict();

/**
 * Phase 12 Stage 3 — Publish Official Source. The editor supplies only the
 * item; the server resolves the persisted official snapshot itself.
 */
const publishSourceSchema = z.object({ itemId: itemIdSchema }).strict();

const releaseProtectionSchema = z
  .object({
    itemId: itemIdSchema,
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

/**
 * Bounded pagination for the editorial workspace. Older held/manual items stay
 * discoverable instead of being cut off by a fixed 100-item limit.
 */
const workspaceQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

/** Lossless draft-history lookup: item + revision of that item. */
const draftHistoryQuerySchema = z.object({
  itemId: itemIdSchema,
  revisionId: itemIdSchema,
});

const grantSchema = z
  .object({
    email: z.string().trim().email().max(64),
    action: z.enum(["grant", "revoke"]),
  })
  .strict();

const submitUrlSchema = z
  .object({
    url: z.string().trim().min(1).max(2000),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const errorStatus: Record<EditorialError["code"], number> = {
  unauthenticated: 401,
  capability_required: 403,
  admin_required: 403,
  identity_not_verified: 403,
  publication_authority_required: 403,
  grant_target_not_eligible: 409,
  validation_failed: 400,
  item_not_found: 404,
  item_not_archived: 409,
  user_not_found: 404,
  revision_not_found: 404,
  item_archived: 409,
  not_a_draft: 409,
  stale_draft_conflict: 409,
  stale_publication_conflict: 409,
  stale_base_revision_conflict: 409,
  revision_not_overridable: 409,
  idempotency_key_reused: 409,
  not_manual_origin: 400,
  slug_unavailable: 409,
  duplicate_submission: 409,
  invalid_official_url: 400,
};

export function editorialErrorResponse(error: EditorialError): Response {
  return Response.json(
    { error: error.code, detail: error.detail ?? null },
    { status: errorStatus[error.code] ?? 400 }
  );
}

export function invalidEditorialBody(detail?: string): Response {
  return Response.json(
    { error: "validation_failed", detail: detail ?? null },
    { status: 400 }
  );
}

function normalizeHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/:(443|80)$/u, "");
}

/**
 * Same-origin guard for editorial mutations (D-065 CSRF requirement).
 *
 * The project's session-security pattern is a first-party Auth.js session
 * cookie; there is no separate CSRF-token framework, so this handler-level
 * check provides the defence-in-depth layer:
 *
 * - `Sec-Fetch-Site: cross-site` is rejected outright (modern browsers send it
 *   on cross-site requests, including navigations and form posts).
 * - A supplied `Origin` must match the request host, so a cross-site
 *   `fetch`/form POST cannot ride the session cookie.
 * - A request without either header is not a browser CSRF vector (curl,
 *   operator scripts, server-to-server); it still needs an authenticated
 *   session and an active capability, both enforced by the service.
 */
export function crossSiteEditorialRequestGuard(
  request: Request
): Response | null {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite.trim().toLowerCase() === "cross-site") {
    return Response.json(
      { error: "cross_site_request_rejected" },
      { status: 403 }
    );
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return Response.json(
      { error: "cross_site_request_rejected" },
      { status: 403 }
    );
  }
  const requestHost =
    request.headers.get("host") ?? new URL(request.url).host ?? "";
  if (
    !requestHost ||
    normalizeHost(originHost) !== normalizeHost(requestHost)
  ) {
    return Response.json(
      { error: "cross_site_request_rejected" },
      { status: 403 }
    );
  }
  return null;
}

async function readMutationBody(request: Request): Promise<unknown | Response> {
  const crossSite = crossSiteEditorialRequestGuard(request);
  if (crossSite) {
    return crossSite;
  }
  return await readBoundedEditorialJsonBody(request);
}

export async function handleEditorialWorkspaceGet({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request?: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const query = workspaceQuerySchema.safeParse({
    limit: request?.url
      ? (new URL(request.url).searchParams.get("limit") ?? undefined)
      : undefined,
    offset: request?.url
      ? (new URL(request.url).searchParams.get("offset") ?? undefined)
      : undefined,
  });
  if (!query.success) {
    return invalidEditorialBody("pagination");
  }
  const canEdit = await service.canEdit(actor.userId);
  if (!canEdit) {
    return editorialErrorResponse({
      status: "error",
      code: "capability_required",
    });
  }
  const page = await service.listWorkspacePaginated({
    limit: query.data.limit ?? null,
    offset: query.data.offset ?? null,
  });
  return Response.json({
    canEdit,
    items: page.items,
    page: page.page,
  });
}

export async function handleEditorialItemGet({
  resolveActor,
  service,
  itemId,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  itemId: string;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  if (!(await service.canEdit(actor.userId))) {
    return editorialErrorResponse({
      status: "error",
      code: "capability_required",
    });
  }
  if (!itemIdSchema.safeParse(itemId).success) {
    return invalidEditorialBody("itemId");
  }
  const detail = await service.getItemDetail(itemId);
  if (!detail) {
    return editorialErrorResponse({ status: "error", code: "item_not_found" });
  }
  return Response.json({ item: detail });
}

export async function handleCreateManualDraft({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readMutationBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = createDraftSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody();
  }
  const result = await service.createManualDraft({
    actorUserId: actor.userId,
    content: parsed.data.content,
    slug: parsed.data.slug ?? null,
    idempotencyKey: parsed.data.idempotencyKey ?? null,
  });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value, { status: 201 });
}

export async function handleSaveManualDraft({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readMutationBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = saveDraftSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody();
  }
  const result = await service.saveManualDraft({
    actorUserId: actor.userId,
    itemId: parsed.data.itemId,
    revisionId: parsed.data.revisionId,
    content: parsed.data.content,
    expectedContentVersion: parsed.data.expectedContentVersion,
  });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value);
}

export async function handleCreateManualRevision({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readMutationBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = createRevisionSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody();
  }
  const result = await service.createManualRevision({
    actorUserId: actor.userId,
    itemId: parsed.data.itemId,
  });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value, { status: 201 });
}

export async function handlePublishManualDraft({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readMutationBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = publishDraftSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody();
  }
  const result = await service.publishManualRevision({
    actorUserId: actor.userId,
    itemId: parsed.data.itemId,
    revisionId: parsed.data.revisionId,
    expectedContentVersion: parsed.data.expectedContentVersion,
    idempotencyKey: parsed.data.idempotencyKey ?? null,
  });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value);
}

/**
 * Lawyer force publish (D-065). The body may only carry the corrected content
 * and its provenance; the caller cannot name an actor, and no AI dependency is
 * consulted anywhere on this path.
 */
export async function handleForcePublishOverride({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readMutationBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = forcePublishSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody();
  }
  const result = await service.forcePublishOverride({
    actorUserId: actor.userId,
    itemId: parsed.data.itemId,
    baseRevisionId: parsed.data.baseRevisionId,
    expectedBaseRevisionNumber: parsed.data.expectedBaseRevisionNumber,
    expectedPublishedRevisionId: parsed.data.expectedPublishedRevisionId,
    overrideReason: parsed.data.overrideReason,
    content: parsed.data.content,
    idempotencyKey: parsed.data.idempotencyKey ?? null,
  });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value);
}

export async function handleArchivePolicyItem({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readMutationBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = archiveSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody();
  }
  const result = await service.archiveItem({
    actorUserId: actor.userId,
    itemId: parsed.data.itemId,
    reason: parsed.data.reason ?? null,
  });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value);
}

/**
 * Phase 12 Stage 3 owner-host correction — the Admin archive/restore action.
 *
 * The Admin page posts `{ itemId, action }`. The archive/restore handlers are
 * strict (`{ itemId, reason? }` / `{ itemId }`), so forwarding the routing field
 * made every Admin archive/restore request fail schema validation with
 * `validation_failed` before any service call. The action is therefore
 * validated once here (strictly), and only the handler payload is re-presented.
 */
export const adminPolicyItemActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("archive"),
      itemId: itemIdSchema,
      reason: z.string().trim().max(500).nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("restore"),
      itemId: itemIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("publish_source"),
      itemId: itemIdSchema,
    })
    .strict(),
]);

/**
 * The body has already been read under the byte budget, so the validated
 * payload is re-presented to the shared handler as a small in-memory request.
 * This keeps one code path for validation while never re-reading the network
 * stream.
 */
function handlerPayloadRequest(payload: Record<string, unknown>): Request {
  return new Request("https://internal.invalid/policy-editor-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function handleAdminPolicyItemAction({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request: Request;
}): Promise<Response> {
  const crossSite = crossSiteEditorialRequestGuard(request);
  if (crossSite) {
    return crossSite;
  }
  const body = await readBoundedEditorialJsonBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = adminPolicyItemActionSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody();
  }
  if (parsed.data.action === "archive") {
    return await handleArchivePolicyItem({
      resolveActor,
      service,
      request: handlerPayloadRequest({
        itemId: parsed.data.itemId,
        reason: parsed.data.reason ?? null,
      }),
    });
  }
  if (parsed.data.action === "publish_source") {
    return await handlePublishOfficialSource({
      resolveActor,
      service,
      request: handlerPayloadRequest({ itemId: parsed.data.itemId }),
    });
  }
  return await handleRestorePolicyItem({
    resolveActor,
    service,
    request: handlerPayloadRequest({ itemId: parsed.data.itemId }),
  });
}

export async function handlePublishOfficialSource({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readMutationBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = publishSourceSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody();
  }
  const result = await service.publishOfficialSource({
    actorUserId: actor.userId,
    itemId: parsed.data.itemId,
  });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value);
}

export async function handleRestorePolicyItem({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readMutationBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = restoreSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody();
  }
  const result = await service.restoreItem({
    actorUserId: actor.userId,
    itemId: parsed.data.itemId,
  });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value);
}

export async function handleReleasePublicationProtection({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readMutationBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = releaseProtectionSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody();
  }
  const result = await service.releasePublicationProtection({
    actorUserId: actor.userId,
    itemId: parsed.data.itemId,
    reason: parsed.data.reason ?? null,
  });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value);
}

export async function handleDraftHistoryGet({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const url = new URL(request.url);
  const query = draftHistoryQuerySchema.safeParse({
    itemId: url.searchParams.get("itemId") ?? undefined,
    revisionId: url.searchParams.get("revisionId") ?? undefined,
  });
  if (!query.success) {
    return invalidEditorialBody("draftHistory");
  }
  const result = await service.getDraftHistory({
    actorUserId: actor.userId,
    itemId: query.data.itemId,
    revisionId: query.data.revisionId,
  });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value);
}

export async function handlePolicyEditorGrantsGet({
  resolveActor,
  service,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  // Administrative capability: grant management is administrator-only and is
  // deliberately independent of legal publication authority (D-065 R1).
  if (!(await service.isAdministrator(actor.userId))) {
    return editorialErrorResponse({
      status: "error",
      code: "admin_required",
    });
  }
  const grants = await service.listPolicyEditorGrants();
  return Response.json({ grants });
}

export async function handlePolicyEditorGrantUpdate({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: PolicyEditorialService;
  request: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readMutationBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody();
  }
  const result =
    parsed.data.action === "grant"
      ? await service.grantPolicyEditor({
          actorUserId: actor.userId,
          email: parsed.data.email,
        })
      : await service.revokePolicyEditor({
          actorUserId: actor.userId,
          email: parsed.data.email,
        });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value);
}

export async function handleOperatorSubmissionCreate({
  resolveActor,
  service,
  request,
}: {
  resolveActor: EditorialActorResolver;
  service: OperatorSubmissionService;
  request: Request;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  const body = await readMutationBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = submitUrlSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody();
  }
  const result = await service.submit({
    actorUserId: actor.userId,
    url: parsed.data.url,
    note: parsed.data.note ?? null,
  });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value, { status: 201 });
}

export async function handleOperatorSubmissionList({
  resolveActor,
  service,
}: {
  resolveActor: EditorialActorResolver;
  service: OperatorSubmissionService;
}): Promise<Response> {
  const actor = await resolveActor();
  if (actor instanceof Response) {
    return actor;
  }
  // R3 P1: listing is the same privileged capability as submitting, so the
  // service re-verifies publication authority against the database (verified
  // lawyer + currently active grant) rather than trusting authentication alone.
  const result = await service.list({ actorUserId: actor.userId });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json({ submissions: result.value });
}
