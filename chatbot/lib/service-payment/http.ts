import { z } from "zod";
import type { createServicePaymentRepository } from "@/lib/db/service-payment-repository";
import {
  SERVICE_PAYMENT_FINANCE_ACTION_BY_RESOLUTION,
  type ServicePaymentContractAuthority,
  type ServicePaymentFinanceAuthority,
} from "./authority";
import { ServicePaymentError } from "./errors";
import {
  hashServicePaymentOperationRequest,
  hashServicePaymentStaffResolutionObservation,
  isServicePaymentEnabled,
  parseServicePaymentIsoTimestamp,
  requiresExternalResolutionObservation,
  SERVICE_PAYMENT_CONTRACTUAL_BASIS_CODES,
  SERVICE_PAYMENT_EVIDENCE_CATEGORIES,
  SERVICE_PAYMENT_REQUIREMENTS,
  SERVICE_PAYMENT_RESOLUTION_KINDS,
  type ServicePaymentResolutionKind,
  servicePaymentConditionRequestIdentity,
  servicePaymentEvidenceRequestIdentity,
  servicePaymentResolutionRequestIdentity,
  servicePaymentResolutionShapeValid,
  servicePaymentVerificationRequestIdentity,
} from "./policy";
import type {
  ServicePaymentEvidenceVerifier,
  ServicePaymentReversalResolver,
} from "./verification";

/**
 * Phase 13 M4-005 HTTP surface.
 *
 * Every mutating request is authorized by a scope-specific authority port that
 * receives the exact persisted target; the repository re-derives that binding
 * inside the transaction. A caller cannot obtain payment authority by supplying an
 * operation id, an evidence digest, an `admin`/`lawyer` role or a "paid" flag.
 */

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
const ReasonCode = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const BasisRef = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/u);
const AmountMinor = z.number().int().positive().max(999_999_999_999);
const Currency = z.string().regex(/^[A-Z]{3}$/u);

const conditionSchema = z
  .object({
    agreementVersionId: UUID,
    requirement: z.enum(SERVICE_PAYMENT_REQUIREMENTS),
    amountMinor: AmountMinor.nullable().optional(),
    currency: Currency.nullable().optional(),
    contractualBasisCode: z.enum(SERVICE_PAYMENT_CONTRACTUAL_BASIS_CODES),
    contractualBasisRef: BasisRef.nullable().optional(),
    expectedProjectRevision: Revision,
    operationId: OperationId,
  })
  .strict();

const evidenceSchema = z
  .object({
    conditionId: UUID,
    evidenceCategory: z.enum(SERVICE_PAYMENT_EVIDENCE_CATEGORIES),
    referenceSha256: Sha256,
    observationSha256: Sha256,
    declaredAmountMinor: AmountMinor,
    declaredCurrency: Currency,
    paidAt: z.string().min(20).max(40),
    expectedProjectRevision: Revision,
    operationId: OperationId,
  })
  .strict();

const verificationSchema = z
  .object({ expectedProjectRevision: Revision, operationId: OperationId })
  .strict();

const resolutionSchema = z
  .object({
    conditionId: UUID,
    resolutionKind: z.enum(SERVICE_PAYMENT_RESOLUTION_KINDS),
    evidenceId: UUID.nullable().optional(),
    reasonCode: ReasonCode,
    referenceSha256: Sha256,
    supersedesResolutionId: UUID.nullable().optional(),
    expectedProjectRevision: Revision,
    operationId: OperationId,
  })
  .strict();

type Repository = ReturnType<typeof createServicePaymentRepository>;
type Session = { userId: string; type: "guest" | "regular" };
type Prepared =
  | { ok: true; session: Session }
  | { ok: false; response: Response };
type RateLimitAction =
  | "payment_status_read"
  | "payment_condition_record"
  | "payment_evidence_submit"
  | "payment_evidence_verify"
  | "payment_resolution_record";

export type ServicePaymentHandlerDependencies = {
  authenticate: () => Promise<Session | null>;
  enabled?: () => boolean;
  schemaAvailable: () => Promise<boolean>;
  repository: Pick<
    Repository,
    | "loadPaymentStatus"
    | "loadContractTarget"
    | "loadFinanceTarget"
    | "recordCondition"
    | "submitEvidence"
    | "recordEvidenceVerification"
    | "recordResolution"
  >;
  rateLimit: (input: {
    actorUserId: string;
    ipAddress: string | null;
    action: RateLimitAction;
  }) => Promise<boolean>;
  contractAuthority: ServicePaymentContractAuthority;
  financeAuthority: ServicePaymentFinanceAuthority;
  evidenceVerifier: ServicePaymentEvidenceVerifier;
  reversalResolver: ServicePaymentReversalResolver;
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
    (!/^\d+$/u.test(contentLength) || Number(contentLength) > 64 * 1024)
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
      if (size > 64 * 1024) {
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
          { error: "Service payment request is too large." },
          413
        ),
      };
    }
  }
  return {
    ok: false as const,
    response: jsonResponse({ error: "Invalid service payment request." }, 400),
  };
}

function mapError(error: unknown) {
  if (error instanceof ServicePaymentError) {
    switch (error.code) {
      case "not_found":
        return jsonResponse(
          { error: "Service payment record not found." },
          404
        );
      case "forbidden":
      case "authority_denied":
        return jsonResponse(
          { error: "Service payment action is not authorized." },
          403
        );
      case "state_conflict":
      case "revision_conflict":
      case "idempotency_conflict":
      case "integrity_conflict":
        return jsonResponse(
          { error: "Service payment state changed. Refresh and try again." },
          409
        );
      case "verification_unavailable":
        return jsonResponse(
          {
            error:
              "External payment evidence verification is not available; the record stays pending.",
          },
          503
        );
      case "invalid_request":
        return jsonResponse({ error: "Invalid service payment request." }, 400);
      default:
        return jsonResponse(
          { error: "Service payment service is unavailable." },
          503
        );
    }
  }
  return jsonResponse(
    { error: "Service payment service is unavailable." },
    503
  );
}

export function createServicePaymentHandlers(
  deps: ServicePaymentHandlerDependencies
) {
  const _now = deps.now ?? (() => new Date());

  async function prepare(
    request: Request,
    action: RateLimitAction
  ): Promise<Prepared> {
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
        response: jsonResponse(
          { error: "Service payment record not found." },
          404
        ),
      };
    }
    if (!(deps.enabled ?? isServicePaymentEnabled)()) {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Service payment record not found." },
          404
        ),
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
            { error: "Too many service payment requests. Try again later." },
            429
          ),
        };
      }
    } catch {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Service payment service is unavailable." },
          503
        ),
      };
    }
    try {
      if (!(await deps.schemaAvailable())) {
        return {
          ok: false,
          response: jsonResponse(
            { error: "Service payment service is unavailable." },
            503
          ),
        };
      }
    } catch {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Service payment service is unavailable." },
          503
        ),
      };
    }
    return { ok: true, session };
  }

  const getPaymentStatus = async (
    request: Request,
    projectId: string,
    engagementId: string
  ) => {
    const prepared = await prepare(request, "payment_status_read");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !UUID.safeParse(projectId).success ||
      !UUID.safeParse(engagementId).success
    ) {
      return jsonResponse({ error: "Service payment record not found." }, 404);
    }
    try {
      const status = await deps.repository.loadPaymentStatus({
        actorUserId: prepared.session.userId,
        engagementId,
        projectId,
      });
      return jsonResponse(status);
    } catch (error) {
      return mapError(error);
    }
  };

  const recordCondition = async (
    request: Request,
    projectId: string,
    engagementId: string
  ) => {
    const prepared = await prepare(request, "payment_condition_record");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !UUID.safeParse(projectId).success ||
      !UUID.safeParse(engagementId).success
    ) {
      return jsonResponse({ error: "Service payment record not found." }, 404);
    }
    const parsed = await parseBody(request, conditionSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;
    try {
      const target = await deps.repository.loadContractTarget({
        actorUserId: prepared.session.userId,
        agreementVersionId: body.agreementVersionId,
        amountMinor: body.amountMinor ?? null,
        contractualBasisCode: body.contractualBasisCode,
        contractualBasisRef: body.contractualBasisRef ?? null,
        currency: body.currency ?? null,
        engagementId,
        projectId,
        requirement: body.requirement,
      });
      const decision = deps.contractAuthority.decide(target.authorityRequest);
      if (!decision.allowed) {
        return jsonResponse(
          {
            error:
              "No approved contract-payment authority exists for this condition.",
          },
          403
        );
      }
      const result = await deps.repository.recordCondition({
        actorUserId: prepared.session.userId,
        agreementVersionId: body.agreementVersionId,
        amountMinor: body.amountMinor ?? null,
        contractAuthorityCode: decision.authorityCode,
        contractAuthorityRequestSha256: target.authorityRequest.requestSha256,
        contractObservationSha256: target.contractObservationSha256,
        contractualBasisCode: body.contractualBasisCode,
        contractualBasisRef: body.contractualBasisRef ?? null,
        currency: body.currency ?? null,
        engagementId,
        expectedProjectRevision: body.expectedProjectRevision,
        operationId: body.operationId,
        projectId,
        requestHash: hashServicePaymentOperationRequest(
          servicePaymentConditionRequestIdentity({
            agreementTermsSha256: target.authorityRequest.agreementTermsSha256,
            agreementVersionId: body.agreementVersionId,
            amountMinor: body.amountMinor ?? null,
            contractualBasisCode: body.contractualBasisCode,
            contractualBasisRef: body.contractualBasisRef ?? null,
            contractAuthorityCode: decision.authorityCode,
            contractObservationSha256: target.contractObservationSha256,
            currency: body.currency ?? null,
            engagementId,
            expectedProjectRevision: body.expectedProjectRevision,
            projectId,
            requirement: body.requirement,
          })
        ),
        requirement: body.requirement,
      });
      return jsonResponse(result, result.replayed ? 200 : 201);
    } catch (error) {
      return mapError(error);
    }
  };

  const submitEvidence = async (
    request: Request,
    projectId: string,
    engagementId: string
  ) => {
    const prepared = await prepare(request, "payment_evidence_submit");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !UUID.safeParse(projectId).success ||
      !UUID.safeParse(engagementId).success
    ) {
      return jsonResponse({ error: "Service payment record not found." }, 404);
    }
    const parsed = await parseBody(request, evidenceSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;
    const paidAt = parseServicePaymentIsoTimestamp(body.paidAt);
    if (!paidAt) {
      return jsonResponse({ error: "Invalid service payment request." }, 400);
    }
    try {
      const target = await deps.repository.loadFinanceTarget({
        action: "submit_evidence",
        actorUserId: prepared.session.userId,
        conditionId: body.conditionId,
        engagementId,
        observationSha256: body.observationSha256,
        projectId,
      });
      const decision = deps.financeAuthority.decide(target.authorityRequest);
      if (!decision.allowed) {
        return jsonResponse(
          { error: "Payment attestation authority is not available." },
          403
        );
      }
      const result = await deps.repository.submitEvidence({
        actorUserId: prepared.session.userId,
        conditionId: body.conditionId,
        declaredAmountMinor: body.declaredAmountMinor,
        declaredCurrency: body.declaredCurrency,
        engagementId,
        evidenceCategory: body.evidenceCategory,
        expectedProjectRevision: body.expectedProjectRevision,
        financeAuthorityCode: decision.authorityCode,
        financeAuthorityRequestSha256: target.authorityRequest.requestSha256,
        observationSha256: body.observationSha256,
        operationId: body.operationId,
        paidAt,
        projectId,
        referenceSha256: body.referenceSha256,
        requestHash: hashServicePaymentOperationRequest(
          servicePaymentEvidenceRequestIdentity({
            agreementTermsSha256: target.authorityRequest.agreementTermsSha256,
            agreementVersionId: target.authorityRequest.agreementVersionId,
            conditionId: body.conditionId,
            declaredAmountMinor: body.declaredAmountMinor,
            declaredCurrency: body.declaredCurrency,
            engagementId,
            evidenceCategory: body.evidenceCategory,
            expectedProjectRevision: body.expectedProjectRevision,
            observationSha256: body.observationSha256,
            paidAt: paidAt.toISOString(),
            projectId,
            referenceSha256: body.referenceSha256,
          })
        ),
      });
      return jsonResponse(result, result.replayed ? 200 : 201);
    } catch (error) {
      return mapError(error);
    }
  };

  const verifyEvidence = async (
    request: Request,
    projectId: string,
    engagementId: string,
    evidenceId: string
  ) => {
    const prepared = await prepare(request, "payment_evidence_verify");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !UUID.safeParse(projectId).success ||
      !UUID.safeParse(engagementId).success ||
      !UUID.safeParse(evidenceId).success
    ) {
      return jsonResponse({ error: "Service payment record not found." }, 404);
    }
    const parsed = await parseBody(request, verificationSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;
    try {
      const target = await deps.repository.loadFinanceTarget({
        action: "verify_evidence",
        actorUserId: prepared.session.userId,
        engagementId,
        evidenceId,
        projectId,
      });
      if (!(target.verification && target.evidence)) {
        return jsonResponse(
          { error: "Service payment record not found." },
          404
        );
      }
      const decision = deps.financeAuthority.decide(target.authorityRequest);
      if (!decision.allowed) {
        return jsonResponse(
          { error: "Payment verification authority is not available." },
          403
        );
      }
      const outcome = await deps.evidenceVerifier.verify(target.verification);
      if (outcome.status === "unavailable") {
        return jsonResponse(
          {
            error:
              "External payment evidence verification is not available; the record stays pending.",
          },
          503
        );
      }
      const result = await deps.repository.recordEvidenceVerification({
        actorUserId: prepared.session.userId,
        engagementId,
        evidenceId,
        expectedProjectRevision: body.expectedProjectRevision,
        financeAuthorityCode: decision.authorityCode,
        financeAuthorityRequestSha256: target.authorityRequest.requestSha256,
        operationId: body.operationId,
        outcome,
        projectId,
        requestHash: hashServicePaymentOperationRequest(
          servicePaymentVerificationRequestIdentity({
            agreementTermsSha256: target.authorityRequest.agreementTermsSha256,
            agreementVersionId: target.authorityRequest.agreementVersionId,
            amountMinor: target.authorityRequest.amountMinor,
            conditionId: target.authorityRequest.conditionId,
            currency: target.authorityRequest.currency,
            engagementId,
            evidenceId,
            expectedProjectRevision: body.expectedProjectRevision,
            method: outcome.method,
            observationSha256: outcome.observationSha256,
            projectId,
            provenance: outcome.provenance,
            providerCode: outcome.providerCode.slice(0, 64),
            reasonCode:
              outcome.status === "rejected"
                ? outcome.reasonCode.slice(0, 64)
                : null,
            status: outcome.status,
          })
        ),
      });
      return jsonResponse(result, result.replayed ? 200 : 200);
    } catch (error) {
      return mapError(error);
    }
  };

  const recordResolution = async (
    request: Request,
    projectId: string,
    engagementId: string
  ) => {
    const prepared = await prepare(request, "payment_resolution_record");
    if (!prepared.ok) {
      return prepared.response;
    }
    if (
      !UUID.safeParse(projectId).success ||
      !UUID.safeParse(engagementId).success
    ) {
      return jsonResponse({ error: "Service payment record not found." }, 404);
    }
    const parsed = await parseBody(request, resolutionSchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.value;
    const kind = body.resolutionKind as ServicePaymentResolutionKind;
    const evidenceId = body.evidenceId ?? null;
    const supersedesResolutionId = body.supersedesResolutionId ?? null;
    if (
      !servicePaymentResolutionShapeValid({
        evidenceId,
        kind,
        supersedesResolutionId,
      })
    ) {
      return jsonResponse({ error: "Invalid service payment request." }, 400);
    }
    try {
      let observationSha256: string;
      let observationCode: string | null = null;
      if (requiresExternalResolutionObservation(kind)) {
        const observation = await deps.reversalResolver.observe({
          conditionId: body.conditionId,
          engagementId,
          evidenceId: evidenceId as string,
          projectId,
          referenceSha256: body.referenceSha256,
          requestingActorUserId: prepared.session.userId,
          resolutionKind: kind as "refund" | "reversal",
        });
        if (observation.status === "unavailable") {
          return jsonResponse(
            {
              error:
                "No approved reversal/refund observation source is available; nothing was recorded.",
            },
            503
          );
        }
        if (observation.status === "none") {
          return jsonResponse(
            {
              error:
                "No authoritative reversal or refund observation exists for this payment.",
            },
            409
          );
        }
        observationSha256 = observation.observationSha256;
        observationCode = observation.observationCode.slice(0, 64);
      } else {
        observationSha256 = hashServicePaymentStaffResolutionObservation({
          conditionId: body.conditionId,
          evidenceId,
          reasonCode: body.reasonCode,
          referenceSha256: body.referenceSha256,
          resolutionKind: kind,
        });
      }
      const target = await deps.repository.loadFinanceTarget({
        action: SERVICE_PAYMENT_FINANCE_ACTION_BY_RESOLUTION[kind],
        actorUserId: prepared.session.userId,
        conditionId: body.conditionId,
        engagementId,
        evidenceId,
        observationSha256,
        projectId,
      });
      const decision = deps.financeAuthority.decide(target.authorityRequest);
      if (!decision.allowed) {
        return jsonResponse(
          { error: "Payment resolution authority is not available." },
          403
        );
      }
      const result = await deps.repository.recordResolution({
        actorUserId: prepared.session.userId,
        conditionId: body.conditionId,
        engagementId,
        evidenceId,
        expectedProjectRevision: body.expectedProjectRevision,
        financeAuthorityCode: decision.authorityCode,
        financeAuthorityRequestSha256: target.authorityRequest.requestSha256,
        observationCode,
        observationSha256,
        operationId: body.operationId,
        projectId,
        reasonCode: body.reasonCode,
        requestHash: hashServicePaymentOperationRequest(
          servicePaymentResolutionRequestIdentity({
            agreementTermsSha256: target.authorityRequest.agreementTermsSha256,
            agreementVersionId: target.authorityRequest.agreementVersionId,
            amountMinor: target.authorityRequest.amountMinor,
            conditionId: body.conditionId,
            currency: target.authorityRequest.currency,
            engagementId,
            evidenceId,
            expectedProjectRevision: body.expectedProjectRevision,
            financeAuthorityCode: decision.authorityCode,
            kind,
            observationCode,
            observationSha256,
            projectId,
            reasonCode: body.reasonCode,
            supersedesResolutionId,
          })
        ),
        resolutionKind: kind,
        supersedesResolutionId,
      });
      return jsonResponse(result, result.replayed ? 200 : 201);
    } catch (error) {
      return mapError(error);
    }
  };

  return {
    getPaymentStatus,
    recordCondition,
    recordResolution,
    submitEvidence,
    verifyEvidence,
  };
}
