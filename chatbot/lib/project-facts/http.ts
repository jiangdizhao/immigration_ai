import type {
  ProjectFactAssertion,
  ProjectFactPublication,
  ProjectFactUseGrant,
} from "./facts";
import type {
  FactActorContext,
  FactBatchResult,
  FactOperationFailure,
  FactReviewItem,
} from "./review";

/**
 * Phase 14-B Project basic-information API surface.
 *
 * Every request re-authenticates, re-checks Project membership/revision server-side, and
 * reads/writes only through the authorised fact service. The browser never supplies a
 * Project revision, an evidence reference or an `actorUserId`.
 */

export type ProjectFactActor = { userId: string; type?: string };

export type ProjectFactProjection = {
  candidates: Array<{
    assertionId: string;
    assertionVersion: number;
    key: string;
    valueType: string;
    value: unknown;
    originKind: string;
    sourceEvidenceRef: string | null;
    state: string;
    conflicts: boolean;
  }>;
  authorizedForAI: Array<{
    assertionId: string;
    assertionVersion: number;
    key: string;
    valueType: string;
    value: unknown;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    sourceEvidenceRef: string | null;
  }>;
  conflictCount: number;
};

export type ProjectFactHttpDependencies = {
  authenticate: () => Promise<ProjectFactActor | null>;
  isRegisteredCustomer: (userId: string) => Promise<boolean>;
  schemaAvailable: () => Promise<boolean>;
  featureEnabled: () => boolean;
  authorize: (input: {
    actorUserId: string;
    projectId: string;
    intent: "project_write" | "chat_history";
  }) => Promise<{ id: string; status: string; revision: number }>;
  projection: (input: {
    actorUserId: string;
    projectId: string;
  }) => Promise<ProjectFactProjection | null>;
  review: {
    confirmMany: (input: {
      actor: FactActorContext;
      operationId: string;
      items: readonly FactReviewItem[];
    }) => Promise<FactBatchResult<ProjectFactAssertion>>;
    rejectMany: (input: {
      actor: FactActorContext;
      operationId: string;
      items: readonly FactReviewItem[];
    }) => Promise<FactBatchResult<ProjectFactAssertion>>;
    correct: (input: {
      actor: FactActorContext;
      operationId: string;
      item: FactReviewItem;
      key: string;
      valueType: ProjectFactAssertion["valueType"];
      value: unknown;
    }) => Promise<{
      status:
        | "corrected"
        | "failed_before_supersession"
        | "replacement_missing";
      created: ProjectFactAssertion | null;
      superseded: ProjectFactAssertion | null;
      code: string | null;
    }>;
    authorizeForAI: (input: {
      actor: FactActorContext;
      operationId: string;
      items: readonly FactReviewItem[];
      audience: "actor_only" | "project";
    }) => Promise<{
      publications: ProjectFactPublication[];
      grants: ProjectFactUseGrant[];
      failures: FactOperationFailure[];
      complete: boolean;
      sawRevisionConflict: boolean;
    }>;
    revokeAIUse: (input: {
      actor: FactActorContext;
      operationId: string;
      items: readonly FactReviewItem[];
    }) => Promise<FactBatchResult<ProjectFactUseGrant>>;
  };
};

const MAX_BATCH_ITEMS = 20;
const MAX_VALUE_CHARS = 4096;
const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function fail(code: string, status: number): Response {
  return json({ error: code }, status);
}

export function createProjectFactHandlers(deps: ProjectFactHttpDependencies) {
  const resolveActor = async (
    projectId: string,
    intent: "project_write" | "chat_history"
  ) => {
    const actor = await deps.authenticate();
    if (!actor?.userId || actor.type === "guest") {
      return { kind: "unauthenticated" as const };
    }
    if (!(await deps.isRegisteredCustomer(actor.userId))) {
      return { kind: "forbidden" as const };
    }
    if (!(await deps.schemaAvailable()) || !deps.featureEnabled()) {
      return { kind: "unavailable" as const };
    }
    try {
      const decision = await deps.authorize({
        actorUserId: actor.userId,
        projectId,
        intent,
      });
      if (decision.id !== projectId) {
        return { kind: "forbidden" as const };
      }
      if (intent === "project_write" && decision.status !== "active") {
        return { kind: "forbidden" as const };
      }
      return {
        kind: "authorized" as const,
        actorUserId: actor.userId,
        revision: decision.revision,
      };
    } catch {
      return { kind: "forbidden" as const };
    }
  };

  /**
   * A batch is only reported as success when every requested operation completed. Partial
   * completion returns 409 with the exact failures plus the refreshed projection, so the UI
   * can never show "authorized" for a fact whose grant was not written.
   */
  async function settle(
    actorUserId: string,
    projectId: string,
    summary: {
      action: string;
      complete: boolean;
      completedCount: number;
      requestedCount: number;
      failures: readonly {
        index?: number;
        assertionId: string;
        code: string;
        revisionConflict: boolean;
      }[];
      sawRevisionConflict: boolean;
    }
  ): Promise<Response> {
    const projection = await deps
      .projection({ actorUserId, projectId })
      .catch(() => null);
    const payload = {
      action: summary.action,
      complete: summary.complete,
      completedCount: summary.completedCount,
      requestedCount: summary.requestedCount,
      failures: summary.failures.map((failure) => ({
        assertionId: failure.assertionId,
        code: failure.code,
      })),
      sawRevisionConflict: summary.sawRevisionConflict,
      projection,
    };
    return json(payload, summary.complete ? 200 : 409);
  }

  return {
    async list(_request: Request, projectId: string): Promise<Response> {
      const actor = await resolveActor(projectId, "chat_history");
      if (actor.kind === "unauthenticated") {
        return fail("unauthenticated", 401);
      }
      if (actor.kind === "forbidden") {
        return fail("forbidden", 403);
      }
      if (actor.kind === "unavailable") {
        return fail("unavailable", 503);
      }
      try {
        const projection = await deps.projection({
          actorUserId: actor.actorUserId,
          projectId,
        });
        return projection ? json({ projection }, 200) : fail("forbidden", 403);
      } catch {
        return fail("unavailable", 503);
      }
    },

    async apply(request: Request, projectId: string): Promise<Response> {
      const actor = await resolveActor(projectId, "project_write");
      if (actor.kind === "unauthenticated") {
        return fail("unauthenticated", 401);
      }
      if (actor.kind === "forbidden") {
        return fail("forbidden", 403);
      }
      if (actor.kind === "unavailable") {
        return fail("unavailable", 503);
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return fail("invalid_request", 400);
      }
      const parsed = parseAction(body);
      if (!parsed.ok) {
        return fail(parsed.error, 400);
      }
      const factActor: FactActorContext = {
        actorUserId: actor.actorUserId,
        projectId,
        // Revision comes from the server-side authorization decision, never the client.
        expectedProjectRevision: actor.revision,
      };
      try {
        switch (parsed.action.kind) {
          case "confirm":
          case "reject":
          case "revoke_ai": {
            const result =
              parsed.action.kind === "confirm"
                ? await deps.review.confirmMany({
                    actor: factActor,
                    operationId: parsed.operationId,
                    items: parsed.action.items,
                  })
                : parsed.action.kind === "reject"
                  ? await deps.review.rejectMany({
                      actor: factActor,
                      operationId: parsed.operationId,
                      items: parsed.action.items,
                    })
                  : await deps.review.revokeAIUse({
                      actor: factActor,
                      operationId: parsed.operationId,
                      items: parsed.action.items,
                    });
            return await settle(actor.actorUserId, projectId, {
              action: parsed.action.kind,
              complete: result.complete,
              completedCount: result.completed.length,
              requestedCount: parsed.action.items.length,
              failures: result.failures,
              sawRevisionConflict: result.sawRevisionConflict,
            });
          }
          case "correct": {
            const result = await deps.review.correct({
              actor: factActor,
              operationId: parsed.operationId,
              item: parsed.action.item,
              key: parsed.action.key,
              valueType: parsed.action.valueType,
              value: parsed.action.value,
            });
            return await settle(actor.actorUserId, projectId, {
              action: "correct",
              complete: result.status === "corrected",
              completedCount: result.status === "corrected" ? 1 : 0,
              requestedCount: 1,
              failures:
                result.status === "corrected"
                  ? []
                  : [
                      {
                        index: 0,
                        assertionId: parsed.action.item.assertionId,
                        // The original is superseded but the replacement is missing; a
                        // retry with the same operation id completes it.
                        code: result.status,
                        revisionConflict: false,
                      },
                    ],
              sawRevisionConflict: false,
            });
          }
          case "authorize_for_ai": {
            const result = await deps.review.authorizeForAI({
              actor: factActor,
              operationId: parsed.operationId,
              items: parsed.action.items,
              audience: parsed.action.audience,
            });
            return await settle(actor.actorUserId, projectId, {
              action: "authorize_for_ai",
              // A grant, not a publication, is what makes the fact available to AI.
              complete: result.complete,
              completedCount: result.grants.length,
              requestedCount: parsed.action.items.length,
              failures: result.failures,
              sawRevisionConflict: result.sawRevisionConflict,
            });
          }
          default:
            return fail("invalid_request", 400);
        }
      } catch (error) {
        return fail(projectFactErrorCode(error), 409);
      }
    },
  };
}

function projectFactErrorCode(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "state_conflict";
  const passthrough = new Set([
    "forbidden",
    "invalid_request",
    "operation_conflict",
    "revision_conflict",
    "state_conflict",
    "evidence_unverified",
    "supersession_conflict",
  ]);
  return passthrough.has(code) ? code : "state_conflict";
}

function parseItems(value: unknown): FactReviewItem[] | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_BATCH_ITEMS
  ) {
    return null;
  }
  const items: FactReviewItem[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      return null;
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record.assertionId !== "string" ||
      record.assertionId.length < 1 ||
      record.assertionId.length > 80 ||
      typeof record.assertionVersion !== "number" ||
      !Number.isSafeInteger(record.assertionVersion) ||
      record.assertionVersion < 1
    ) {
      return null;
    }
    items.push({
      assertionId: record.assertionId,
      assertionVersion: record.assertionVersion,
    });
  }
  return items;
}

type ParsedAction =
  | { kind: "confirm"; items: FactReviewItem[] }
  | { kind: "reject"; items: FactReviewItem[] }
  | { kind: "revoke_ai"; items: FactReviewItem[] }
  | {
      kind: "authorize_for_ai";
      items: FactReviewItem[];
      audience: "actor_only" | "project";
    }
  | {
      kind: "correct";
      item: FactReviewItem;
      key: string;
      valueType: ProjectFactAssertion["valueType"];
      value: unknown;
    };

function parseAction(
  body: unknown
):
  | { ok: true; action: ParsedAction; operationId: string }
  | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "invalid_request" };
  }
  const record = body as Record<string, unknown>;
  const operationId =
    typeof record.operationId === "string" ? record.operationId : "";
  if (!OPERATION_ID.test(operationId)) {
    return { ok: false, error: "invalid_request" };
  }
  const action = record.action;
  if (action === "confirm" || action === "reject" || action === "revoke_ai") {
    const items = parseItems(record.items);
    return items
      ? { ok: true, operationId, action: { kind: action, items } }
      : { ok: false, error: "invalid_request" };
  }
  if (action === "authorize_for_ai") {
    const items = parseItems(record.items);
    const audience = record.audience ?? "actor_only";
    if (!items || (audience !== "actor_only" && audience !== "project")) {
      return { ok: false, error: "invalid_request" };
    }
    return {
      ok: true,
      operationId,
      action: { kind: "authorize_for_ai", items, audience },
    };
  }
  if (action === "correct") {
    const items = parseItems([record.item]);
    const key = typeof record.key === "string" ? record.key : "";
    const valueType = record.valueType;
    const value = record.value;
    if (
      !items?.[0] ||
      !/^[a-z][a-z0-9_.-]{0,127}$/u.test(key) ||
      (valueType !== "string" &&
        valueType !== "number" &&
        valueType !== "boolean" &&
        valueType !== "date") ||
      typeof value !== "string" ||
      value.length < 1 ||
      value.length > MAX_VALUE_CHARS
    ) {
      return { ok: false, error: "invalid_request" };
    }
    return {
      ok: true,
      operationId,
      action: { kind: "correct", item: items[0], key, valueType, value },
    };
  }
  return { ok: false, error: "invalid_request" };
}
