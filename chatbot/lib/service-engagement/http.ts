import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { createServiceEngagementRepository } from "@/lib/db/service-engagement-repository";
import type { ServiceOperatorAuthority } from "./authority";
import {
  evaluateProjectResourceDisclosure,
  type ProjectResourceDisclosureResolver,
} from "./disclosure";
import { ServiceEngagementError } from "./errors";
import {
  DISCLOSURE_GRANTABLE_RESOURCE_CATEGORIES,
  DISCLOSURE_PURPOSE_CODES,
  DISCLOSURE_REVOCATION_REASON_CODES,
  hashServiceEngagementOperationRequest,
  hashServiceResourceObservation,
  isServiceEngagementEnabled,
  isServiceEvidenceRef,
  isServiceResourceFingerprint,
  PROJECT_RESOURCE_DISCLOSURE_NOTICE,
  PROJECT_RESOURCE_DISCLOSURE_NOTICE_SHA256,
  PROJECT_RESOURCE_DISCLOSURE_NOTICE_VERSION,
  parseIsoTimestamp,
  parseServiceAgreementTerms,
  parseServicePageLimit,
  SERVICE_ENGAGEMENT_AGREEMENT_NOTICE,
  SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_SHA256,
  SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
  SERVICE_ENGAGEMENT_LIFECYCLE_ACTIONS,
  SERVICE_ENGAGEMENT_MODES,
  SERVICE_ENGAGEMENT_PAGE_DEFAULT,
  SERVICE_ENGAGEMENT_PAGE_MAX,
  SERVICE_ENGAGEMENT_SCOPE_CODES,
  SERVICE_SIGNATURE_DECLARED_TIME_FUTURE_SKEW_MS,
} from "./policy";
import type { ServiceSignatureEvidenceVerifier } from "./signature";

const UUID = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
  );
const OperationId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
const Revision = z.number().int().positive().safe();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/u);

const createEngagementSchema = z
  .object({
    serviceMode: z.enum(SERVICE_ENGAGEMENT_MODES),
    scopeCodes: z.array(z.enum(SERVICE_ENGAGEMENT_SCOPE_CODES)).min(1).max(2),
    expectedProjectRevision: Revision,
    operationId: OperationId,
  })
  .strict();

const agreementDraftSchema = z
  .object({
    terms: z.unknown(),
    expectedProjectRevision: Revision,
    operationId: OperationId,
  })
  .strict();

const issueAgreementSchema = z
  .object({ expectedProjectRevision: Revision, operationId: OperationId })
  .strict();

const acceptAgreementSchema = z
  .object({
    accepted: z.literal(true),
    termsSha256: Sha256,
    customerNoticeVersion: z
      .string()
      .min(1)
      .max(128)
      .refine((value) => value === SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION),
    expectedProjectRevision: Revision,
    operationId: OperationId,
  })
  .strict();

const signatureSubmitSchema = z
  .object({
    agreementVersionId: UUID,
    termsSha256: Sha256,
    evidenceRef: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => isServiceEvidenceRef(value)),
    evidenceSha256: Sha256,
    declaredSignedAt: z.string().min(20).max(40),
    expectedProjectRevision: Revision,
    operationId: OperationId,
  })
  .strict();

const signatureVerifySchema = z
  .object({
    orderOutcome: z.literal("request_verification").optional(),
    expectedProjectRevision: Revision,
    operationId: OperationId,
  })
  .strict();

const lifecycleSchema = z
  .object({
    action: z.enum(SERVICE_ENGAGEMENT_LIFECYCLE_ACTIONS),
    expectedProjectRevision: Revision,
    operationId: OperationId,
  })
  .strict();

const disclosureCreateSchema = z
  .object({
    accepted: z.literal(true),
    assignmentId: UUID,
    resourceCategory: z.enum(DISCLOSURE_GRANTABLE_RESOURCE_CATEGORIES),
    resourceId: UUID,
    resourceVersion: z.number().int().positive().safe(),
    purposeCode: z.enum(DISCLOSURE_PURPOSE_CODES),
    expiresAt: z.string().min(20).max(40).nullable().optional(),
    expectedProjectRevision: Revision,
    operationId: OperationId,
  })
  .strict();

const disclosureRevokeSchema = z
  .object({
    reasonCode: z.enum(DISCLOSURE_REVOCATION_REASON_CODES),
    expectedProjectRevision: Revision,
    operationId: OperationId,
  })
  .strict();

type Repository = ReturnType<typeof createServiceEngagementRepository>;
type Session = { userId: string; type: "guest" | "regular" };
type PreparedRequest =
  | { ok: true; session: Session }
  | { ok: false; response: Response };
type RateLimitAction =
  | "engagement_create"
  | "engagement_list"
  | "engagement_detail"
  | "agreement_draft"
  | "agreement_issue"
  | "agreement_accept"
  | "signature_submit"
  | "signature_verify"
  | "engagement_lifecycle"
  | "disclosure_create"
  | "disclosure_list"
  | "disclosure_detail"
  | "disclosure_revoke";

type Dependencies = {
  authenticate: () => Promise<Session | null>;
  enabled?: () => boolean;
  schemaAvailable: () => Promise<boolean>;
  repository: Pick<
    Repository,
    | "createEngagement"
    | "listEngagements"
    | "getEngagement"
    | "createAgreementVersion"
    | "issueAgreementVersion"
    | "acceptAgreementVersion"
    | "submitSignatureEvidence"
    | "loadServiceOperatorContext"
    | "loadSignatureVerificationTarget"
    | "recordSignatureVerification"
    | "transitionEngagement"
    | "createDisclosureGrant"
    | "listDisclosureGrants"
    | "loadDisclosureAccessContext"
    | "revokeDisclosureGrant"
  >;
  rateLimit: (input: {
    actorUserId: string;
    ipAddress: string | null;
    action: RateLimitAction;
  }) => Promise<boolean>;
  /** R1-04: scope-specific operator authority for draft/issue/verify actions. */
  issuanceAuthority: ServiceOperatorAuthority;
  signatureVerifier: ServiceSignatureEvidenceVerifier;
  resourceResolver: ProjectResourceDisclosureResolver;
  now?: () => Date;
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",", 1)[0]?.trim();
  const value = first || request.headers.get("x-real-ip")?.trim();
  return value && value.length <= 128 ? value : null;
}

class BodyTooLargeError extends Error {}

async function readJson(request: Request): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;|$)/iu.test(
      request.headers.get("content-type") ?? ""
    )
  ) {
    throw new SyntaxError("invalid content type");
  }
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/u.test(contentLength) || Number(contentLength) > 256 * 1024)
  ) {
    throw new BodyTooLargeError();
  }
  if (!request.body) {
    throw new SyntaxError("missing body");
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
      if (size > 256 * 1024) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLargeError();
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

async function parseBody<T>(request: Request, schema: z.ZodType<T>) {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (parsed.success) {
      return { ok: true as const, value: parsed.data };
    }
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return {
        ok: false as const,
        response: jsonResponse(
          { error: "Service engagement request is too large." },
          413
        ),
      };
    }
  }
  return {
    ok: false as const,
    response: jsonResponse(
      { error: "Invalid service engagement request." },
      400
    ),
  };
}

function mapRepositoryError(error: unknown) {
  if (error instanceof ServiceEngagementError) {
    switch (error.code) {
      case "not_found":
        return jsonResponse({ error: "Service engagement not found." }, 404);
      case "forbidden":
        return jsonResponse({ error: "This action is not authorized." }, 403);
      case "authority_denied":
        return jsonResponse(
          { error: "Required service authority is not available." },
          403
        );
      case "invalid_request":
        return jsonResponse(
          { error: "Invalid service engagement request." },
          400
        );
      case "state_conflict":
      case "revision_conflict":
      case "idempotency_conflict":
        return jsonResponse(
          { error: "Service engagement state changed. Refresh and try again." },
          409
        );
      case "verification_unavailable":
        return jsonResponse(
          {
            error:
              "Signature evidence verification is not available; the engagement remains pending.",
          },
          503
        );
      case "resource_unavailable":
        return jsonResponse(
          {
            error:
              "The protected resource cannot be verified for disclosure; access remains denied.",
          },
          409
        );
      default:
        return jsonResponse(
          { error: "Service engagement service is unavailable." },
          503
        );
    }
  }
  return jsonResponse(
    { error: "Service engagement service is unavailable." },
    503
  );
}

export function createServiceEngagementHandlers(deps: Dependencies) {
  const now = deps.now ?? (() => new Date());

  async function prepare(
    request: Request,
    action: RateLimitAction
  ): Promise<PreparedRequest> {
    const session = await deps.authenticate();
    if (!session) {
      return {
        ok: false,
        response: jsonResponse({ error: "Authentication required." }, 401),
      };
    }
    if (session.type !== "regular") {
      return {
        ok: false,
        response: jsonResponse({ error: "Service engagement not found." }, 404),
      };
    }
    if (!(deps.enabled ?? isServiceEngagementEnabled)()) {
      return {
        ok: false,
        response: jsonResponse({ error: "Service engagement not found." }, 404),
      };
    }
    try {
      if (
        !(await deps.rateLimit({
          actorUserId: session.userId,
          ipAddress: clientIp(request),
          action,
        }))
      ) {
        return {
          ok: false,
          response: jsonResponse(
            { error: "Too many service engagement requests. Try again later." },
            429
          ),
        };
      }
    } catch {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Service engagement service is unavailable." },
          503
        ),
      };
    }
    try {
      if (!(await deps.schemaAvailable())) {
        return {
          ok: false,
          response: jsonResponse(
            { error: "Service engagement service is unavailable." },
            503
          ),
        };
      }
    } catch {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Service engagement service is unavailable." },
          503
        ),
      };
    }
    return { ok: true, session };
  }

  const createEngagement = async (request: Request, projectId: string) => {
    const prepared = await prepare(request, "engagement_create");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (!UUID.safeParse(projectId).success) {
      return jsonResponse({ error: "Service engagement not found." }, 404);
    }
    const parsed = await parseBody(request, createEngagementSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    try {
      const result = await deps.repository.createEngagement({
        actorUserId: prepared.session.userId,
        projectId,
        serviceMode: parsed.value.serviceMode,
        scopeCodes: parsed.value.scopeCodes,
        expectedProjectRevision: parsed.value.expectedProjectRevision,
        operationId: parsed.value.operationId,
        requestHash: hashServiceEngagementOperationRequest({
          action: "engagement_create",
          projectId,
          serviceMode: parsed.value.serviceMode,
          scopeCodes: parsed.value.scopeCodes,
          expectedProjectRevision: parsed.value.expectedProjectRevision,
        }),
      });
      return jsonResponse(result, result.replayed ? 200 : 201);
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  const listEngagements = async (request: Request, projectId: string) => {
    const prepared = await prepare(request, "engagement_list");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (!UUID.safeParse(projectId).success) {
      return jsonResponse({ error: "Service engagement not found." }, 404);
    }
    const limit = parseServicePageLimit({
      limit: new URL(request.url).searchParams.get("limit"),
      defaultLimit: SERVICE_ENGAGEMENT_PAGE_DEFAULT,
      maxLimit: SERVICE_ENGAGEMENT_PAGE_MAX,
    });
    if (!limit) {
      return jsonResponse({ error: "Invalid page request." }, 400);
    }
    try {
      return jsonResponse(
        await deps.repository.listEngagements({
          actorUserId: prepared.session.userId,
          projectId,
          limit,
        })
      );
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  const engagementDetail = async (
    request: Request,
    projectId: string,
    engagementId: string
  ) => {
    const prepared = await prepare(request, "engagement_detail");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !(
        UUID.safeParse(projectId).success &&
        UUID.safeParse(engagementId).success
      )
    ) {
      return jsonResponse({ error: "Service engagement not found." }, 404);
    }
    try {
      const result = await deps.repository.getEngagement({
        actorUserId: prepared.session.userId,
        projectId,
        engagementId,
      });
      return jsonResponse({
        ...result,
        acceptanceNotice: {
          notice: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE,
          noticeVersion: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
          noticeSha256: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_SHA256,
        },
      });
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  const createAgreement = async (
    request: Request,
    projectId: string,
    engagementId: string
  ) => {
    const prepared = await prepare(request, "agreement_draft");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !(
        UUID.safeParse(projectId).success &&
        UUID.safeParse(engagementId).success
      )
    ) {
      return jsonResponse({ error: "Service engagement not found." }, 404);
    }
    const parsed = await parseBody(request, agreementDraftSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const terms = parseServiceAgreementTerms(parsed.value.terms);
    if (!terms) {
      return jsonResponse({ error: "Invalid agreement terms." }, 400);
    }
    const agreementVersionId = randomUUID();
    try {
      // R1-04: the authority decides about the exact persisted target and the
      // operator's current Project-scoped eligibility, never about a bare role.
      const context = await deps.repository.loadServiceOperatorContext({
        actorUserId: prepared.session.userId,
        action: "author_draft",
        draft: {
          agreementVersionId,
          scopeCodes: terms.scopeCodes,
          serviceMode: terms.serviceMode,
          termsSha256: terms.termsSha256,
        },
        engagementId,
        projectId,
      });
      const decision = deps.issuanceAuthority.decide(context.operatorAuthority);
      if (!decision.allowed) {
        return mapRepositoryError(
          new ServiceEngagementError("authority_denied")
        );
      }
      const result = await deps.repository.createAgreementVersion({
        actorUserId: prepared.session.userId,
        agreementVersionId,
        authorityCode: decision.authorityCode,
        authorityRequestSha256: context.operatorAuthority.requestSha256,
        engagementId,
        expectedProjectRevision: parsed.value.expectedProjectRevision,
        operationId: parsed.value.operationId,
        projectId,
        requestHash: hashServiceEngagementOperationRequest({
          action: "agreement_draft",
          agreementVersionId,
          authorityRequestSha256: context.operatorAuthority.requestSha256,
          engagementId,
          expectedProjectRevision: parsed.value.expectedProjectRevision,
          projectId,
          scopeCodes: terms.scopeCodes,
          serviceMode: terms.serviceMode,
          termsPayload: terms.payload,
          termsSha256: terms.termsSha256,
        }),
        scopeCodes: terms.scopeCodes,
        serviceMode: terms.serviceMode,
        termsPayload: terms.payload,
        termsSha256: terms.termsSha256,
      });
      return jsonResponse(result, result.replayed ? 200 : 201);
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  const issueAgreement = async (
    request: Request,
    projectId: string,
    engagementId: string,
    agreementVersionId: string
  ) => {
    const prepared = await prepare(request, "agreement_issue");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !(
        UUID.safeParse(projectId).success &&
        UUID.safeParse(engagementId).success &&
        UUID.safeParse(agreementVersionId).success
      )
    ) {
      return jsonResponse({ error: "Service agreement not found." }, 404);
    }
    const parsed = await parseBody(request, issueAgreementSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    try {
      // R1-04: never substitute nulls for the real contract. The authority sees
      // the persisted version's terms hash, scope, mode and version number.
      const context = await deps.repository.loadServiceOperatorContext({
        actorUserId: prepared.session.userId,
        action: "issue",
        agreementVersionId,
        engagementId,
        projectId,
      });
      const decision = deps.issuanceAuthority.decide(context.operatorAuthority);
      if (!decision.allowed) {
        return mapRepositoryError(
          new ServiceEngagementError("authority_denied")
        );
      }
      const result = await deps.repository.issueAgreementVersion({
        actorUserId: prepared.session.userId,
        agreementVersionId,
        authorityCode: decision.authorityCode,
        authorityRequestSha256: context.operatorAuthority.requestSha256,
        engagementId,
        expectedProjectRevision: parsed.value.expectedProjectRevision,
        operationId: parsed.value.operationId,
        projectId,
        requestHash: hashServiceEngagementOperationRequest({
          action: "agreement_issue",
          agreementVersionId,
          authorityRequestSha256: context.operatorAuthority.requestSha256,
          engagementId,
          expectedProjectRevision: parsed.value.expectedProjectRevision,
          projectId,
        }),
      });
      return jsonResponse(result);
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  const acceptAgreement = async (
    request: Request,
    projectId: string,
    engagementId: string,
    agreementVersionId: string
  ) => {
    const prepared = await prepare(request, "agreement_accept");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !(
        UUID.safeParse(projectId).success &&
        UUID.safeParse(engagementId).success &&
        UUID.safeParse(agreementVersionId).success
      )
    ) {
      return jsonResponse({ error: "Service agreement not found." }, 404);
    }
    const parsed = await parseBody(request, acceptAgreementSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    try {
      const result = await deps.repository.acceptAgreementVersion({
        actorUserId: prepared.session.userId,
        projectId,
        engagementId,
        agreementVersionId,
        termsSha256: parsed.value.termsSha256,
        customerNoticeVersion: parsed.value.customerNoticeVersion,
        expectedProjectRevision: parsed.value.expectedProjectRevision,
        operationId: parsed.value.operationId,
        requestHash: hashServiceEngagementOperationRequest({
          action: "agreement_accept",
          projectId,
          engagementId,
          agreementVersionId,
          accepted: true,
          customerNoticeVersion: parsed.value.customerNoticeVersion,
          termsSha256: parsed.value.termsSha256,
          expectedProjectRevision: parsed.value.expectedProjectRevision,
        }),
      });
      return jsonResponse(
        {
          ...result,
          signatureNotice:
            "This acceptance is not a verified electronic signature. Managed service activation additionally requires independently verified signature evidence.",
        },
        result.replayed ? 200 : 201
      );
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  const submitSignature = async (
    request: Request,
    projectId: string,
    engagementId: string
  ) => {
    const prepared = await prepare(request, "signature_submit");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !(
        UUID.safeParse(projectId).success &&
        UUID.safeParse(engagementId).success
      )
    ) {
      return jsonResponse({ error: "Service engagement not found." }, 404);
    }
    const parsed = await parseBody(request, signatureSubmitSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    if (!UUID.safeParse(parsed.value.agreementVersionId).success) {
      return jsonResponse({ error: "Service agreement not found." }, 404);
    }
    const declaredSignedAt = parseIsoTimestamp(parsed.value.declaredSignedAt);
    if (
      !declaredSignedAt ||
      declaredSignedAt.getTime() >
        now().getTime() + SERVICE_SIGNATURE_DECLARED_TIME_FUTURE_SKEW_MS
    ) {
      return jsonResponse({ error: "Invalid signing time." }, 400);
    }
    try {
      const result = await deps.repository.submitSignatureEvidence({
        actorUserId: prepared.session.userId,
        projectId,
        engagementId,
        agreementVersionId: parsed.value.agreementVersionId,
        termsSha256: parsed.value.termsSha256,
        evidenceRef: parsed.value.evidenceRef,
        evidenceSha256: parsed.value.evidenceSha256,
        declaredSignedAt,
        expectedProjectRevision: parsed.value.expectedProjectRevision,
        operationId: parsed.value.operationId,
        requestHash: hashServiceEngagementOperationRequest({
          action: "signature_submit",
          projectId,
          engagementId,
          agreementVersionId: parsed.value.agreementVersionId,
          termsSha256: parsed.value.termsSha256,
          evidenceRef: parsed.value.evidenceRef,
          evidenceSha256: parsed.value.evidenceSha256,
          declaredSignedAt: declaredSignedAt.toISOString(),
          expectedProjectRevision: parsed.value.expectedProjectRevision,
        }),
      });
      return jsonResponse(
        {
          ...result,
          verificationNotice:
            "Evidence is stored as pending. It becomes verified only through an independently reviewed verification source; a customer submission never verifies itself.",
        },
        result.replayed ? 200 : 201
      );
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  const verifySignature = async (
    request: Request,
    projectId: string,
    engagementId: string,
    evidenceId: string
  ) => {
    const prepared = await prepare(request, "signature_verify");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !(
        UUID.safeParse(projectId).success &&
        UUID.safeParse(engagementId).success &&
        UUID.safeParse(evidenceId).success
      )
    ) {
      return jsonResponse({ error: "Signature evidence not found." }, 404);
    }
    const parsed = await parseBody(request, signatureVerifySchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    try {
      const { operatorAuthority, ...target } =
        await deps.repository.loadSignatureVerificationTarget({
          actorUserId: prepared.session.userId,
          projectId,
          engagementId,
          evidenceId,
        });
      // R1-04: a distinct, scope-bound operator must authorize verification of
      // this exact evidence/version before any provider is contacted.
      const decision = deps.issuanceAuthority.decide(operatorAuthority);
      if (!decision.allowed) {
        return mapRepositoryError(
          new ServiceEngagementError("authority_denied")
        );
      }
      const outcome = await deps.signatureVerifier.verify({
        ...target,
        requestingActorUserId: prepared.session.userId,
      });
      if (outcome.status === "unavailable") {
        return mapRepositoryError(
          new ServiceEngagementError("verification_unavailable")
        );
      }
      const result = await deps.repository.recordSignatureVerification({
        actorUserId: prepared.session.userId,
        authorityRequestSha256: operatorAuthority.requestSha256,
        engagementId,
        evidenceId,
        expectedProjectRevision: parsed.value.expectedProjectRevision,
        operationId: parsed.value.operationId,
        outcome,
        projectId,
        requestHash: hashServiceEngagementOperationRequest({
          action: "signature_verify",
          authorityRequestSha256: operatorAuthority.requestSha256,
          engagementId,
          evidenceId,
          expectedProjectRevision: parsed.value.expectedProjectRevision,
          projectId,
        }),
      });
      return jsonResponse(result);
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  const lifecycle = async (
    request: Request,
    projectId: string,
    engagementId: string
  ) => {
    const prepared = await prepare(request, "engagement_lifecycle");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !(
        UUID.safeParse(projectId).success &&
        UUID.safeParse(engagementId).success
      )
    ) {
      return jsonResponse({ error: "Service engagement not found." }, 404);
    }
    const parsed = await parseBody(request, lifecycleSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    try {
      const result = await deps.repository.transitionEngagement({
        actorUserId: prepared.session.userId,
        projectId,
        engagementId,
        action: parsed.value.action,
        expectedProjectRevision: parsed.value.expectedProjectRevision,
        operationId: parsed.value.operationId,
        requestHash: hashServiceEngagementOperationRequest({
          action: "lifecycle",
          projectId,
          engagementId,
          lifecycleAction: parsed.value.action,
          expectedProjectRevision: parsed.value.expectedProjectRevision,
        }),
      });
      return jsonResponse(result);
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  const createDisclosure = async (request: Request, projectId: string) => {
    const prepared = await prepare(request, "disclosure_create");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (!UUID.safeParse(projectId).success) {
      return jsonResponse({ error: "Project not found." }, 404);
    }
    const parsed = await parseBody(request, disclosureCreateSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    let expiresAt: Date | null = null;
    if (parsed.value.expiresAt) {
      expiresAt = parseIsoTimestamp(parsed.value.expiresAt);
      if (!expiresAt) {
        return jsonResponse({ error: "Invalid expiry time." }, 400);
      }
    }
    try {
      // Resource identity, owner and current version come from a server-side
      // source adapter; the caller only names the resource it wants to share.
      const resource = await deps.resourceResolver.resolve({
        projectId,
        resourceCategory: parsed.value.resourceCategory,
        resourceId: parsed.value.resourceId,
      });
      if (!resource.found) {
        // Fail closed before any persisted disclosure exists.
        return mapRepositoryError(
          new ServiceEngagementError("resource_unavailable")
        );
      }
      if (!isServiceResourceFingerprint(resource.fingerprint)) {
        // R1-05: a source adapter that cannot prove the exact observed
        // version/fingerprint cannot authorize a disclosure.
        return mapRepositoryError(
          new ServiceEngagementError("resource_unavailable")
        );
      }
      // R1-05: bind the grant to this exact observation (adapter, project,
      // owner, category, resource, version and fingerprint). The repository
      // recomputes the hash and revalidates inside its transaction.
      const resourceObservationSha256 = hashServiceResourceObservation({
        adapterCode: deps.resourceResolver.code,
        projectId,
        resourceCategory: parsed.value.resourceCategory,
        resourceFingerprint: resource.fingerprint,
        resourceId: parsed.value.resourceId,
        resourceOwnerUserId: resource.ownerUserId,
        resourceVersion: parsed.value.resourceVersion,
      });
      const result = await deps.repository.createDisclosureGrant({
        actorUserId: prepared.session.userId,
        projectId,
        assignmentId: parsed.value.assignmentId,
        resourceCategory: parsed.value.resourceCategory,
        resourceId: parsed.value.resourceId,
        resourceVersion: parsed.value.resourceVersion,
        purposeCode: parsed.value.purposeCode,
        expiresAt,
        resource,
        observationAdapterCode: deps.resourceResolver.code,
        resourceObservationSha256,
        expectedProjectRevision: parsed.value.expectedProjectRevision,
        operationId: parsed.value.operationId,
        requestHash: hashServiceEngagementOperationRequest({
          action: "disclosure_create",
          projectId,
          assignmentId: parsed.value.assignmentId,
          resourceCategory: parsed.value.resourceCategory,
          resourceId: parsed.value.resourceId,
          resourceObservationSha256,
          resourceVersion: parsed.value.resourceVersion,
          purposeCode: parsed.value.purposeCode,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          accepted: true,
          expectedProjectRevision: parsed.value.expectedProjectRevision,
        }),
      });
      return jsonResponse(
        {
          ...result,
          disclosureNotice: {
            notice: PROJECT_RESOURCE_DISCLOSURE_NOTICE,
            noticeVersion: PROJECT_RESOURCE_DISCLOSURE_NOTICE_VERSION,
            noticeSha256: PROJECT_RESOURCE_DISCLOSURE_NOTICE_SHA256,
          },
        },
        result.replayed ? 200 : 201
      );
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  const listDisclosures = async (request: Request, projectId: string) => {
    const prepared = await prepare(request, "disclosure_list");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (!UUID.safeParse(projectId).success) {
      return jsonResponse({ error: "Project not found." }, 404);
    }
    const limit = parseServicePageLimit({
      limit: new URL(request.url).searchParams.get("limit"),
      defaultLimit: SERVICE_ENGAGEMENT_PAGE_DEFAULT,
      maxLimit: SERVICE_ENGAGEMENT_PAGE_MAX,
    });
    if (!limit) {
      return jsonResponse({ error: "Invalid page request." }, 400);
    }
    try {
      return jsonResponse(
        await deps.repository.listDisclosureGrants({
          actorUserId: prepared.session.userId,
          projectId,
          limit,
        })
      );
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  const disclosureDetail = async (
    request: Request,
    projectId: string,
    grantId: string
  ) => {
    const prepared = await prepare(request, "disclosure_detail");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !(UUID.safeParse(projectId).success && UUID.safeParse(grantId).success)
    ) {
      return jsonResponse({ error: "Disclosure grant not found." }, 404);
    }
    try {
      const context = await deps.repository.loadDisclosureAccessContext({
        actorUserId: prepared.session.userId,
        projectId,
        grantId,
      });
      if (context.accessRole === "resource_owner_audit") {
        // R1-02: the resource owner keeps a historical audit view of their own
        // grant record. This is not an access authorization and no evaluator
        // decision is produced for it.
        return jsonResponse({
          accessRole: context.accessRole,
          auditOnly: true,
          decision: null,
          decisionNotice:
            "Resource-owner audit view only. A Grant record is never an access authorization; access is evaluated solely for its current recipient.",
          grant: context.grant,
          metadataPolicyCode: context.metadataPolicyCode,
          resourceOwnerEligible: context.resourceOwnerEligible,
        });
      }
      const resource = await deps.resourceResolver.resolve({
        projectId,
        resourceCategory: context.requested.resourceCategory,
        resourceId: context.requested.resourceId,
      });
      const decision = evaluateProjectResourceDisclosure({
        now: now().toISOString(),
        action: "read_metadata",
        projectId,
        projectActive: context.projectActive,
        actor: context.actor,
        assignment: context.assignment,
        grant: context.grant,
        resource,
        resourceOwnerEligible: context.resourceOwnerEligible,
        requested: context.requested,
      });
      // Metadata and an explicit decision only. No protected content is served.
      return jsonResponse({
        accessRole: context.accessRole,
        auditOnly: false,
        decision,
        grant: context.grant,
        metadataPolicyCode: context.metadataPolicyCode,
        resourceOwnerEligible: context.resourceOwnerEligible,
      });
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  const revokeDisclosure = async (
    request: Request,
    projectId: string,
    grantId: string
  ) => {
    const prepared = await prepare(request, "disclosure_revoke");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !(UUID.safeParse(projectId).success && UUID.safeParse(grantId).success)
    ) {
      return jsonResponse({ error: "Disclosure grant not found." }, 404);
    }
    const parsed = await parseBody(request, disclosureRevokeSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    try {
      return jsonResponse(
        await deps.repository.revokeDisclosureGrant({
          actorUserId: prepared.session.userId,
          projectId,
          grantId,
          reasonCode: parsed.value.reasonCode,
          expectedProjectRevision: parsed.value.expectedProjectRevision,
          operationId: parsed.value.operationId,
          requestHash: hashServiceEngagementOperationRequest({
            action: "disclosure_revoke",
            projectId,
            grantId,
            revokeReasonCode: parsed.value.reasonCode,
            expectedProjectRevision: parsed.value.expectedProjectRevision,
          }),
        })
      );
    } catch (error) {
      return mapRepositoryError(error);
    }
  };

  return {
    createEngagement,
    listEngagements,
    engagementDetail,
    createAgreement,
    issueAgreement,
    acceptAgreement,
    submitSignature,
    verifySignature,
    lifecycle,
    createDisclosure,
    listDisclosures,
    disclosureDetail,
    revokeDisclosure,
  };
}
