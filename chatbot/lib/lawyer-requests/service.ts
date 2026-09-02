import "server-only";

import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { guestRegex } from "@/lib/constants";
import {
  lawyerClarificationEvent,
  lawyerClarificationMessage,
  lawyerClarificationRequest,
  user,
} from "@/lib/db/schema";
import type { StaffActor } from "./access";
import { assignmentEventType } from "./admin-update";
import { canLawyerAccessAssignedRequest } from "./rbac";
import {
  type LawyerClarificationStatus,
  validateLawyerClarificationUpdate,
} from "./status";

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) {
  throw new Error("POSTGRES_URL is not configured");
}
const client = postgres(postgresUrl);
const db = drizzle(client);

export class LawyerRequestDomainError extends Error {
  readonly status: 400 | 403 | 404 | 409;

  constructor(message: string, status: 400 | 403 | 404 | 409) {
    super(message);
    this.status = status;
    this.name = "LawyerRequestDomainError";
  }
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RequestInsert = typeof lawyerClarificationRequest.$inferInsert;

async function recordEvent(
  tx: Transaction,
  values: typeof lawyerClarificationEvent.$inferInsert
) {
  await tx.insert(lawyerClarificationEvent).values(values);
}

async function getRequestForUpdate(tx: Transaction, id: string) {
  const [request] = await tx
    .select()
    .from(lawyerClarificationRequest)
    .where(eq(lawyerClarificationRequest.id, id))
    .limit(1);
  if (!request) {
    throw new LawyerRequestDomainError("Lawyer request not found.", 404);
  }
  return request;
}

export function createLawyerRequestWithEvent(values: RequestInsert) {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .insert(lawyerClarificationRequest)
      .values(values)
      .returning();
    if (!request) {
      throw new LawyerRequestDomainError(
        "Unable to create lawyer request.",
        400
      );
    }
    await recordEvent(tx, {
      requestId: request.id,
      actorUserId: request.userId,
      actorRole: "customer",
      eventType: "created",
      toStatus: request.status,
    });
    return request;
  });
}

export async function getCustomerLawyerRequest({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  const [request] = await db
    .select()
    .from(lawyerClarificationRequest)
    .where(
      and(
        eq(lawyerClarificationRequest.id, id),
        eq(lawyerClarificationRequest.userId, userId)
      )
    )
    .limit(1);
  if (!request) {
    return null;
  }
  const messages = await db
    .select({
      id: lawyerClarificationMessage.id,
      authorRole: lawyerClarificationMessage.authorRole,
      body: lawyerClarificationMessage.body,
      createdAt: lawyerClarificationMessage.createdAt,
    })
    .from(lawyerClarificationMessage)
    .where(eq(lawyerClarificationMessage.requestId, id))
    .orderBy(lawyerClarificationMessage.createdAt);
  return { request, messages };
}

export function listCustomerLawyerRequests(userId: string) {
  return db
    .select()
    .from(lawyerClarificationRequest)
    .where(eq(lawyerClarificationRequest.userId, userId))
    .orderBy(desc(lawyerClarificationRequest.createdAt))
    .limit(100);
}

export function listAdminLawyerRequests(status?: LawyerClarificationStatus) {
  const condition = status
    ? eq(lawyerClarificationRequest.status, status)
    : undefined;
  const base = db
    .select({
      request: lawyerClarificationRequest,
      customerEmail: user.email,
    })
    .from(lawyerClarificationRequest)
    .innerJoin(user, eq(lawyerClarificationRequest.userId, user.id));
  return condition
    ? base
        .where(condition)
        .orderBy(desc(lawyerClarificationRequest.createdAt))
        .limit(100)
    : base.orderBy(desc(lawyerClarificationRequest.createdAt)).limit(100);
}

export async function getStaffLawyerRequest(id: string) {
  const [result] = await db
    .select({ request: lawyerClarificationRequest, customerEmail: user.email })
    .from(lawyerClarificationRequest)
    .innerJoin(user, eq(lawyerClarificationRequest.userId, user.id))
    .where(eq(lawyerClarificationRequest.id, id))
    .limit(1);
  if (!result) {
    return null;
  }
  const messages = await db
    .select()
    .from(lawyerClarificationMessage)
    .where(eq(lawyerClarificationMessage.requestId, id))
    .orderBy(lawyerClarificationMessage.createdAt);
  return { ...result, messages };
}

export async function getLawyerRequestNotificationTargets(requestId: string) {
  const [record] = await db
    .select({
      customerEmail: user.email,
      assignedLawyerUserId: lawyerClarificationRequest.assignedLawyerUserId,
    })
    .from(lawyerClarificationRequest)
    .innerJoin(user, eq(lawyerClarificationRequest.userId, user.id))
    .where(eq(lawyerClarificationRequest.id, requestId))
    .limit(1);
  if (!record) {
    return null;
  }
  const [lawyer] = record.assignedLawyerUserId
    ? await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, record.assignedLawyerUserId))
        .limit(1)
    : [];
  return {
    customerEmail: record.customerEmail,
    lawyerEmail: lawyer?.email ?? null,
  };
}

export function listAssignedLawyerRequests(lawyerId: string) {
  return db
    .select({
      request: lawyerClarificationRequest,
      customerEmail: user.email,
    })
    .from(lawyerClarificationRequest)
    .innerJoin(user, eq(lawyerClarificationRequest.userId, user.id))
    .where(eq(lawyerClarificationRequest.assignedLawyerUserId, lawyerId))
    .orderBy(desc(lawyerClarificationRequest.updatedAt))
    .limit(100);
}

export function assignLawyer({
  actor,
  requestId,
  assignedLawyerUserId,
}: {
  actor: StaffActor;
  requestId: string;
  assignedLawyerUserId: string | null;
}) {
  if (actor.role !== "admin") {
    throw new LawyerRequestDomainError("Administrator access required.", 403);
  }

  return db.transaction(async (tx) => {
    const current = await getRequestForUpdate(tx, requestId);
    if (current.status === "closed") {
      throw new LawyerRequestDomainError(
        "Closed requests cannot be assigned.",
        409
      );
    }

    if (assignedLawyerUserId) {
      const [target] = await tx
        .select({
          id: user.id,
          email: user.email,
          role: user.role,
          emailVerifiedAt: user.emailVerifiedAt,
        })
        .from(user)
        .where(eq(user.id, assignedLawyerUserId))
        .limit(1);
      if (
        target?.role !== "lawyer" ||
        !target?.emailVerifiedAt ||
        guestRegex.test(target?.email ?? "")
      ) {
        throw new LawyerRequestDomainError(
          "Requests may only be assigned to verified lawyer accounts.",
          400
        );
      }
    }

    const now = new Date();
    const [updated] = await tx
      .update(lawyerClarificationRequest)
      .set({
        assignedLawyerUserId,
        assignedAt: assignedLawyerUserId ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(lawyerClarificationRequest.id, requestId),
          eq(lawyerClarificationRequest.status, current.status),
          current.assignedLawyerUserId
            ? eq(
                lawyerClarificationRequest.assignedLawyerUserId,
                current.assignedLawyerUserId
              )
            : isNull(lawyerClarificationRequest.assignedLawyerUserId)
        )
      )
      .returning();
    if (!updated) {
      throw new LawyerRequestDomainError(
        "Request assignment changed; reload and try again.",
        409
      );
    }

    const eventType = assignmentEventType(
      current.assignedLawyerUserId,
      assignedLawyerUserId
    );
    await recordEvent(tx, {
      requestId,
      actorUserId: actor.id,
      actorRole: actor.role,
      eventType,
      metadata: {
        previousAssignedLawyerUserId: current.assignedLawyerUserId,
        assignedLawyerUserId,
      },
    });
    return updated;
  });
}

function assertStaffCanAct(
  actor: StaffActor,
  assignedLawyerUserId: string | null
) {
  if (
    !canLawyerAccessAssignedRequest({
      actorId: actor.id,
      actorRole: actor.role,
      assignedLawyerUserId,
    })
  ) {
    throw new LawyerRequestDomainError(
      actor.role === "lawyer"
        ? "This request is not assigned to you."
        : "Staff access required.",
      403
    );
  }
}

export function updateStaffRequest({
  actor,
  requestId,
  status,
  lawyerResponse,
  correctedAnswer,
}: {
  actor: StaffActor;
  requestId: string;
  status: LawyerClarificationStatus;
  lawyerResponse?: string | null;
  correctedAnswer?: string | null;
}) {
  return db.transaction(async (tx) => {
    const current = await getRequestForUpdate(tx, requestId);
    assertStaffCanAct(actor, current.assignedLawyerUserId);
    if (current.status === "closed") {
      throw new LawyerRequestDomainError(
        "Closed requests cannot be modified.",
        409
      );
    }

    const update = {
      status,
      lawyerResponse: lawyerResponse ?? current.lawyerResponse,
      correctedAnswer: correctedAnswer ?? current.correctedAnswer,
    } as const;
    if (status === "needs_more_information" && !update.lawyerResponse?.trim()) {
      throw new LawyerRequestDomainError(
        "A response is required when requesting more information.",
        400
      );
    }
    const validationError = validateLawyerClarificationUpdate(current, update);
    if (validationError) {
      throw new LawyerRequestDomainError(validationError, 400);
    }

    const now = new Date();
    const substantive =
      status === "needs_more_information" ||
      status === "confirmed" ||
      status === "corrected";
    const [updated] = await tx
      .update(lawyerClarificationRequest)
      .set({
        status,
        reviewerUserId: substantive ? actor.id : current.reviewerUserId,
        lawyerResponse:
          lawyerResponse === undefined
            ? current.lawyerResponse
            : lawyerResponse?.trim() || null,
        correctedAnswer:
          correctedAnswer === undefined
            ? current.correctedAnswer
            : correctedAnswer?.trim() || null,
        ...(substantive ? { reviewedAt: now } : {}),
        ...(status === "closed" ? { closedAt: now } : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(lawyerClarificationRequest.id, requestId),
          eq(lawyerClarificationRequest.status, current.status),
          current.assignedLawyerUserId
            ? eq(
                lawyerClarificationRequest.assignedLawyerUserId,
                current.assignedLawyerUserId
              )
            : isNull(lawyerClarificationRequest.assignedLawyerUserId)
        )
      )
      .returning();
    if (!updated) {
      throw new LawyerRequestDomainError(
        "Request changed; reload and try again.",
        409
      );
    }

    if (substantive && lawyerResponse?.trim()) {
      await tx.insert(lawyerClarificationMessage).values({
        requestId,
        authorUserId: actor.id,
        authorRole: actor.role,
        body: lawyerResponse.trim(),
      });
      await recordEvent(tx, {
        requestId,
        actorUserId: actor.id,
        actorRole: actor.role,
        eventType: "staff_message_added",
      });
    }
    await recordEvent(tx, {
      requestId,
      actorUserId: actor.id,
      actorRole: actor.role,
      eventType: "status_changed",
      fromStatus: current.status,
      toStatus: status,
    });
    return updated;
  });
}

export function addCustomerReply({
  userId,
  requestId,
  body,
}: {
  userId: string;
  requestId: string;
  body: string;
}) {
  const normalizedBody = body.trim();
  if (!normalizedBody || normalizedBody.length > 8000) {
    throw new LawyerRequestDomainError(
      "A reply between 1 and 8000 characters is required.",
      400
    );
  }

  return db.transaction(async (tx) => {
    const current = await getRequestForUpdate(tx, requestId);
    if (current.userId !== userId) {
      throw new LawyerRequestDomainError("Lawyer request not found.", 404);
    }
    if (current.status !== "needs_more_information") {
      throw new LawyerRequestDomainError(
        "Replies are only available when more information is requested.",
        409
      );
    }
    const [message] = await tx
      .insert(lawyerClarificationMessage)
      .values({
        requestId,
        authorUserId: userId,
        authorRole: "customer",
        body: normalizedBody,
      })
      .returning();
    const now = new Date();
    const [updated] = await tx
      .update(lawyerClarificationRequest)
      .set({ status: "in_review", updatedAt: now })
      .where(
        and(
          eq(lawyerClarificationRequest.id, requestId),
          eq(lawyerClarificationRequest.userId, userId),
          eq(lawyerClarificationRequest.status, "needs_more_information")
        )
      )
      .returning();
    if (!updated) {
      throw new LawyerRequestDomainError(
        "Request changed; reload and try again.",
        409
      );
    }
    await recordEvent(tx, {
      requestId,
      actorUserId: userId,
      actorRole: "customer",
      eventType: "customer_message_added",
    });
    await recordEvent(tx, {
      requestId,
      actorUserId: userId,
      actorRole: "customer",
      eventType: "status_changed",
      fromStatus: current.status,
      toStatus: "in_review",
    });
    return { request: updated, message };
  });
}

export function markCustomerViewed({
  userId,
  requestId,
}: {
  userId: string;
  requestId: string;
}) {
  return db.transaction(async (tx) => {
    const current = await getRequestForUpdate(tx, requestId);
    if (current.userId !== userId) {
      throw new LawyerRequestDomainError("Lawyer request not found.", 404);
    }
    const viewedAt = new Date();
    const [updated] = await tx
      .update(lawyerClarificationRequest)
      .set({ customerLastViewedAt: viewedAt })
      .where(
        and(
          eq(lawyerClarificationRequest.id, requestId),
          eq(lawyerClarificationRequest.userId, userId)
        )
      )
      .returning();
    if (!updated) {
      throw new LawyerRequestDomainError(
        "Request changed; reload and try again.",
        409
      );
    }
    await recordEvent(tx, {
      requestId,
      actorUserId: userId,
      actorRole: "customer",
      eventType: "customer_viewed",
    });
    return updated;
  });
}

export function listManageableLawyers() {
  return db
    .select({
      id: user.id,
      email: user.email,
      role: user.role,
      membershipTier: user.membershipTier,
      emailVerifiedAt: user.emailVerifiedAt,
    })
    .from(user)
    .where(
      and(
        ne(user.role, "admin"),
        isNotNull(user.emailVerifiedAt),
        sql`${user.email} NOT LIKE 'guest-%'`
      )
    )
    .orderBy(user.email)
    .limit(500);
}

export function setManagedLawyerRole({
  actor,
  targetUserId,
  role,
}: {
  actor: StaffActor;
  targetUserId: string;
  role: "user" | "lawyer";
}) {
  if (actor.role !== "admin") {
    throw new LawyerRequestDomainError("Administrator access required.", 403);
  }
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1);
    if (!target || target.role === "admin" || guestRegex.test(target.email)) {
      throw new LawyerRequestDomainError(
        "This account cannot be managed as a lawyer.",
        400
      );
    }
    if (!target.emailVerifiedAt) {
      throw new LawyerRequestDomainError(
        "Only verified accounts may be lawyers.",
        400
      );
    }
    if (target.role === role) {
      return target;
    }
    if (role === "user") {
      const [activeAssignment] = await tx
        .select({ id: lawyerClarificationRequest.id })
        .from(lawyerClarificationRequest)
        .where(
          and(
            eq(lawyerClarificationRequest.assignedLawyerUserId, targetUserId),
            ne(lawyerClarificationRequest.status, "closed")
          )
        )
        .limit(1);
      if (activeAssignment) {
        throw new LawyerRequestDomainError(
          "Reassign or unassign active requests before demoting this lawyer.",
          409
        );
      }
    }
    const [updated] = await tx
      .update(user)
      .set({ role })
      .where(and(eq(user.id, targetUserId), eq(user.role, target.role)))
      .returning();
    if (!updated) {
      throw new LawyerRequestDomainError(
        "Account changed; reload and try again.",
        409
      );
    }
    return updated;
  });
}

export function listRequestEvents(requestId: string) {
  return db
    .select()
    .from(lawyerClarificationEvent)
    .where(eq(lawyerClarificationEvent.requestId, requestId))
    .orderBy(lawyerClarificationEvent.createdAt);
}
