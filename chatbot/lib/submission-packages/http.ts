import { z } from "zod";
import {
  isSubmissionOperationId,
  isSubmissionPackageUuid,
  isSubmissionTargetKind,
  SUBMISSION_CONFIRMATION_TYPES,
  SUBMISSION_PACKAGE_LIMITS,
  SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
  SubmissionPackageError,
} from "./contracts";
import type { SubmissionPackageService } from "./service";

/**
 * Phase 13 M8.1 HTTP surface.
 *
 * Same posture as the accepted M5.1/M6.x/M7 handlers: the actor comes from the
 * authenticated session, the Project comes from the route, and every body schema is
 * strict - a payload can never supply identity, ownership, a role, a digest the
 * server did not compute, or a verification/approval verdict.
 */

const MAX_BODY_BYTES = 16 * 1024;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const buildBody = z
  .object({
    action: z.literal("build_package"),
    expectedVersion: z.number().int().nonnegative().safe().nullish(),
    operationId: z
      .string()
      .min(1)
      .max(SUBMISSION_PACKAGE_LIMITS.maxOperationIdLength),
    targetId: z.string().regex(UUID),
    targetKind: z.enum([
      "managed_school_application",
      "student_500_visa_application",
    ]),
  })
  .strict();

const confirmBody = z
  .object({
    action: z.literal("confirm_package"),
    confirmationType: z.enum(SUBMISSION_CONFIRMATION_TYPES),
    // The customer's consent names the exact identity it was given for. The server
    // recomputes that identity from stored data and refuses any mismatch.
    consentBinding: z
      .object({
        manifestSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        packageVersionId: z.string().regex(UUID),
        projectId: z.string().min(1).max(128),
        statementPolicyVersion: z.string().min(1).max(64),
        targetId: z.string().regex(UUID),
        targetKind: z.enum([
          "managed_school_application",
          "student_500_visa_application",
        ]),
      })
      .strict(),
    consentGranted: z.literal(true),
    manifestSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    operationId: z
      .string()
      .min(1)
      .max(SUBMISSION_PACKAGE_LIMITS.maxOperationIdLength),
    packageVersionId: z.string().regex(UUID),
    statementPolicyVersion: z.literal(
      SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION
    ),
    targetId: z.string().regex(UUID),
    targetKind: z.enum([
      "managed_school_application",
      "student_500_visa_application",
    ]),
    targetVersion: z.number().int().positive().safe(),
  })
  .strict();

const actionBody = z.discriminatedUnion("action", [buildBody, confirmBody]);

type AuthenticatedSession = { userId: string; type: "guest" | "regular" };

type HandlerDependencies = {
  authenticate: () => Promise<AuthenticatedSession | null>;
  enabled: () => boolean;
  schemaAvailable: () => Promise<boolean>;
  projectWritesEnabled?: () => boolean;
  service: Pick<
    SubmissionPackageService,
    "get" | "buildPackage" | "confirmPackage"
  >;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

function mapError(error: unknown): Response {
  if (error instanceof SubmissionPackageError) {
    switch (error.code) {
      case "invalid_request":
        return errorResponse("Invalid submission package request.", 400);
      case "consent_required":
        return errorResponse("Customer confirmation is required.", 400);
      case "actor_not_eligible":
      case "project_not_found":
      case "project_forbidden":
      case "target_not_found":
        return errorResponse("Submission package not found.", 404);
      case "package_not_found":
      case "confirmation_not_found":
        return errorResponse("Submission package version not found.", 404);
      case "project_closed":
        return errorResponse("Project is closed.", 409);
      case "target_archived":
        return errorResponse("This application is archived.", 409);
      case "source_unavailable":
        return errorResponse("Application data is unavailable.", 503);
      case "revision_conflict":
      case "version_conflict":
      case "state_conflict":
        return errorResponse("Submission package changed.", 409);
      case "idempotency_conflict":
      case "integrity_conflict":
        return errorResponse("Submission package conflict.", 409);
      case "limit_exceeded":
        return errorResponse("Submission package limit reached.", 429);
      default:
        return errorResponse("Submission package failed.", 500);
    }
  }
  return errorResponse("Submission package failed.", 500);
}

async function readBoundedJson(
  request: Request
): Promise<{ value: unknown } | { response: Response }> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return {
      response: errorResponse("Invalid submission package request.", 400),
    };
  }
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return {
      response: errorResponse("Invalid submission package request.", 400),
    };
  }
}

export function createSubmissionPackageHandlers(deps: HandlerDependencies) {
  async function invoke(
    action: (actorUserId: string) => Promise<Response>,
    options: { readonly mode?: "read" | "write" } = {}
  ): Promise<Response> {
    if (!deps.enabled()) {
      return errorResponse("Submission packages are not available.", 404);
    }
    const session = await deps.authenticate();
    if (!session) {
      return errorResponse("Authentication required.", 401);
    }
    if (session.type !== "regular") {
      return errorResponse("Submission package not found.", 404);
    }
    if (options.mode === "write" && !(deps.projectWritesEnabled?.() ?? true)) {
      return errorResponse(
        "Submission package changes are disabled right now.",
        503
      );
    }
    let schemaReady: boolean;
    try {
      schemaReady = await deps.schemaAvailable();
    } catch {
      schemaReady = false;
    }
    if (!schemaReady) {
      return errorResponse("Submission packages are unavailable.", 503);
    }
    try {
      return await action(session.userId);
    } catch (error) {
      return mapError(error);
    }
  }

  return {
    /** List frozen versions + live freshness + confirmation history for one target. */
    get(request: Request, projectId: string) {
      return invoke(async (actorUserId) => {
        if (typeof projectId !== "string" || projectId.length === 0) {
          return errorResponse("Invalid submission package request.", 400);
        }
        const url = new URL(request.url);
        const targetKind = url.searchParams.get("targetKind");
        const targetId = url.searchParams.get("targetId");
        if (
          !isSubmissionTargetKind(targetKind) ||
          !isSubmissionPackageUuid(targetId)
        ) {
          return errorResponse("Invalid submission package request.", 400);
        }
        return jsonResponse(
          await deps.service.get({
            actorUserId,
            projectId,
            targetId,
            targetKind,
          })
        );
      });
    },

    act(request: Request, projectId: string) {
      return invoke(
        async (actorUserId) => {
          if (typeof projectId !== "string" || projectId.length === 0) {
            return errorResponse("Invalid submission package request.", 400);
          }
          const body = await readBoundedJson(request);
          if ("response" in body) {
            return body.response;
          }
          const parsed = actionBody.safeParse(body.value);
          if (!parsed.success) {
            return errorResponse("Invalid submission package request.", 400);
          }
          const value = parsed.data;
          if (
            !isSubmissionOperationId(value.operationId) ||
            !isSubmissionTargetKind(value.targetKind)
          ) {
            return errorResponse("Invalid submission package request.", 400);
          }
          const scope = {
            actorUserId,
            projectId,
            targetId: value.targetId,
            targetKind: value.targetKind,
          };
          if (value.action === "build_package") {
            const result = await deps.service.buildPackage({
              expectedVersion: value.expectedVersion ?? null,
              operationId: value.operationId,
              scope,
            });
            return jsonResponse(
              { package: result.package, replayed: result.replayed },
              201
            );
          }
          const result = await deps.service.confirmPackage({
            confirmationType: value.confirmationType,
            consentBinding: value.consentBinding,
            consentGranted: value.consentGranted,
            manifestSha256: value.manifestSha256,
            operationId: value.operationId,
            packageVersionId: value.packageVersionId,
            scope,
            statementPolicyVersion: value.statementPolicyVersion,
            targetVersion: value.targetVersion,
          });
          return jsonResponse(
            {
              confirmation: result.confirmation,
              package: result.package,
              replayed: result.replayed,
            },
            201
          );
        },
        { mode: "write" }
      );
    },
  };
}
