import { z } from "zod";
import { isManagedTargetKind, isUuid } from "@/lib/managed-target/policy";
import type { ProfessionalReviewAssignmentStatus } from "./authority";
import { ProfessionalReviewError } from "./errors";
import {
  PROFESSIONAL_REVIEW_SCOPES,
  type ProfessionalReviewScope,
} from "./policy";
import type {
  ProfessionalReviewActorContext,
  ProfessionalReviewService,
} from "./service";

/**
 * M4-006 bounded HTTP surface.
 *
 * Only four actions exist: create a review request, record a decision, read a
 * review, read its history. There is no package upload, no generic workflow
 * engine, no external submission and no customer-facing approval claim.
 *
 * Authorization is never inferred here: the composition supplies the actor's
 * server-derived assignment state, and the scope-specific authority port still
 * has to allow the exact action on the exact target.
 */
export type ProfessionalReviewHandlerDependencies = {
  authenticate: () => Promise<{ type?: string; userId: string } | null>;
  actorContext: (input: { actorUserId: string; projectId: string }) => Promise<{
    actorRole: string;
    reviewerAssignmentId: string | null;
    reviewerAssignmentStatus: ProfessionalReviewAssignmentStatus;
  }>;
  enabled?: () => boolean;
  rateLimit: (input: {
    action: string;
    actorUserId: string;
    ipAddress?: string | null;
  }) => Promise<boolean>;
  service: ProfessionalReviewService;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const OPERATION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const TARGET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

const createSchema = z
  .object({
    operationId: z.string().regex(OPERATION_ID_RE),
    reviewPurpose: z.literal("managed_handoff_authorization"),
    reviewScope: z.array(z.enum(PROFESSIONAL_REVIEW_SCOPES)).min(1).max(4),
    targetId: z.string().regex(TARGET_ID_RE),
    targetKind: z.string().min(1).max(64),
    targetSha256: z.string().regex(SHA256_RE),
    targetVersion: z.number().int().positive().max(1_000_000),
  })
  .strict();

const decisionSchema = z
  .object({
    action: z.enum([
      "start_review",
      "request_changes",
      "approve",
      "reject",
      "invalidate",
    ]),
    boundTargetSha256: z.string().regex(SHA256_RE),
    boundTargetVersion: z.number().int().positive().max(1_000_000),
    comment: z.string().max(512).optional(),
    expectedRevision: z.number().int().positive().safe(),
    operationId: z.string().regex(OPERATION_ID_RE),
    reasonCode: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u)
      .optional(),
  })
  .strict();

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return request.headers.get("x-real-ip");
}

function mapError(error: unknown) {
  if (error instanceof ProfessionalReviewError) {
    switch (error.code) {
      case "invalid_request":
        return jsonResponse(
          { error: "Invalid professional review request." },
          400
        );
      case "not_found":
        return jsonResponse({ error: "Professional review not found." }, 404);
      case "forbidden":
      case "authority_denied":
        return jsonResponse(
          { error: "Professional review action is not authorized." },
          403
        );
      case "state_conflict":
      case "revision_conflict":
      case "idempotency_conflict":
      case "target_mismatch":
      case "target_untrusted":
      case "target_kind_unsupported":
        return jsonResponse(
          {
            error: "Professional review state changed. Refresh and try again.",
          },
          409
        );
      case "unavailable":
        return jsonResponse(
          { error: "Professional review service is unavailable." },
          503
        );
      default:
        return jsonResponse(
          { error: "Professional review service is unavailable." },
          503
        );
    }
  }
  return jsonResponse(
    { error: "Professional review service is unavailable." },
    503
  );
}

export function createProfessionalReviewHandlers(
  deps: ProfessionalReviewHandlerDependencies
) {
  type Prepared =
    | { ok: true; actor: ProfessionalReviewActorContext }
    | { ok: false; response: Response };

  async function prepare(
    request: Request,
    projectId: string,
    action: string
  ): Promise<Prepared> {
    const session = await deps.authenticate();
    if (!session) {
      return {
        ok: false,
        response: jsonResponse({ error: "Authentication required." }, 401),
      };
    }
    if (!(deps.enabled ?? (() => true))()) {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Professional review not found." },
          404
        ),
      };
    }
    if (!UUID_RE.test(projectId)) {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Professional review not found." },
          404
        ),
      };
    }
    try {
      if (
        !(await deps.rateLimit({
          action,
          actorUserId: session.userId,
          ipAddress: clientIp(request),
        }))
      ) {
        return {
          ok: false,
          response: jsonResponse(
            {
              error: "Too many professional review requests. Try again later.",
            },
            429
          ),
        };
      }
    } catch {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Professional review service is unavailable." },
          503
        ),
      };
    }
    try {
      const context = await deps.actorContext({
        actorUserId: session.userId,
        projectId,
      });
      return {
        actor: {
          actorRole: context.actorRole,
          actorUserId: session.userId,
          reviewerAssignmentId: context.reviewerAssignmentId,
          reviewerAssignmentStatus: context.reviewerAssignmentStatus,
        },
        ok: true,
      };
    } catch {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Professional review service is unavailable." },
          503
        ),
      };
    }
  }

  return {
    async createReviewRequest(request: Request, projectId: string) {
      const prepared = await prepare(
        request,
        projectId,
        "professional_review_request"
      );
      if (!prepared.ok) {
        return prepared.response;
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          { error: "Invalid professional review request." },
          400
        );
      }
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse(
          { error: "Invalid professional review request." },
          400
        );
      }
      const value = parsed.data;
      if (!isManagedTargetKind(value.targetKind)) {
        return jsonResponse(
          { error: "Invalid professional review request." },
          400
        );
      }
      const targetKind = value.targetKind;
      try {
        const result = await deps.service.createReviewRequest({
          actor: prepared.actor,
          operationId: value.operationId,
          projectId,
          reviewPurpose: value.reviewPurpose,
          reviewScope: value.reviewScope as ProfessionalReviewScope[],
          target: {
            targetId: value.targetId,
            targetKind,
            targetSha256: value.targetSha256,
            targetVersion: value.targetVersion,
          },
        });
        return jsonResponse(
          {
            projectId: result.record.projectId,
            replay: result.replayed,
            reviewRequestId: result.record.reviewRequestId,
            revision: result.record.revision,
            state: result.record.state,
            targetBindingSha256: result.record.targetBindingSha256,
            targetId: result.record.target.targetId,
            targetKind: result.record.target.targetKind,
            targetSha256: result.record.target.targetSha256,
            targetVersion: result.record.target.targetVersion,
          },
          result.replayed ? 200 : 201
        );
      } catch (error) {
        return mapError(error);
      }
    },

    async recordDecision(
      request: Request,
      projectId: string,
      reviewRequestId: string
    ) {
      const prepared = await prepare(
        request,
        projectId,
        "professional_review_decision"
      );
      if (!prepared.ok) {
        return prepared.response;
      }
      if (!isUuid(reviewRequestId)) {
        return jsonResponse({ error: "Professional review not found." }, 404);
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          { error: "Invalid professional review request." },
          400
        );
      }
      const parsed = decisionSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse(
          { error: "Invalid professional review request." },
          400
        );
      }
      try {
        const result = await deps.service.recordDecision({
          action: parsed.data.action,
          actor: prepared.actor,
          boundTargetSha256: parsed.data.boundTargetSha256,
          boundTargetVersion: parsed.data.boundTargetVersion,
          comment: parsed.data.comment ?? null,
          expectedRevision: parsed.data.expectedRevision,
          operationId: parsed.data.operationId,
          projectId,
          reasonCode: parsed.data.reasonCode ?? null,
          reviewRequestId,
        });
        return jsonResponse({
          replay: result.replayed,
          reviewRequestId: result.record.reviewRequestId,
          revision: result.record.revision,
          state: result.record.state,
        });
      } catch (error) {
        return mapError(error);
      }
    },

    async getReview(
      request: Request,
      projectId: string,
      reviewRequestId: string
    ) {
      const prepared = await prepare(
        request,
        projectId,
        "professional_review_read"
      );
      if (!prepared.ok) {
        return prepared.response;
      }
      if (!isUuid(reviewRequestId)) {
        return jsonResponse({ error: "Professional review not found." }, 404);
      }
      try {
        return jsonResponse(
          await deps.service.readReview({
            actor: prepared.actor,
            projectId,
            reviewRequestId,
          })
        );
      } catch (error) {
        return mapError(error);
      }
    },

    async getReviewHistory(
      request: Request,
      projectId: string,
      reviewRequestId: string
    ) {
      const prepared = await prepare(
        request,
        projectId,
        "professional_review_read"
      );
      if (!prepared.ok) {
        return prepared.response;
      }
      if (!isUuid(reviewRequestId)) {
        return jsonResponse({ error: "Professional review not found." }, 404);
      }
      try {
        return jsonResponse({
          history: await deps.service.listHistory({
            actor: prepared.actor,
            projectId,
            reviewRequestId,
          }),
        });
      } catch (error) {
        return mapError(error);
      }
    },
  };
}
