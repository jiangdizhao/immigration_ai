import "server-only";

import { and, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { guestRegex } from "@/lib/constants";
import {
  type ConsultationRequest,
  chat,
  consultationEvent,
  consultationRequest,
  immigrationConversation,
  lawyerClarificationRequest,
  user,
} from "@/lib/db/schema";
import type { ConsultationActor } from "./access";
import {
  canAccessConsultation,
  canAssignConsultationLawyer,
  canManageConsultationAssignments,
  consultationContinuityLinksMatch,
  consultationLinkOwnedBy,
} from "./access-policy";
import { buildConsultationEvent, type ConsultationEventInput } from "./events";
import type { ConsultationAction } from "./state";
import {
  consultationRevisionMatches,
  customerLifecycleTimestamps,
  hasScheduleConflict,
  validateTransition,
} from "./state";
import type {
  ConsultationCreateInput,
  ConsultationProposalInput,
} from "./types";
import { validateProposalInterval } from "./validation";

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) {
  throw new Error("POSTGRES_URL is not configured");
}
const client = postgres(postgresUrl, { connection: { TimeZone: "UTC" } });
const db = drizzle(client);
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class ConsultationDomainError extends Error {
  readonly status: 400 | 403 | 404 | 409;
  constructor(message: string, status: 400 | 403 | 404 | 409) {
    super(message);
    this.status = status;
    this.name = "ConsultationDomainError";
  }
}

function event(tx: Transaction, input: ConsultationEventInput) {
  return tx.insert(consultationEvent).values(buildConsultationEvent(input));
}

async function requestForUpdate(tx: Transaction, id: string) {
  const [record] = await tx
    .select()
    .from(consultationRequest)
    .where(eq(consultationRequest.id, id))
    .limit(1)
    .for("update");
  if (!record) {
    throw new ConsultationDomainError("Consultation not found.", 404);
  }
  return record;
}

function assertFresh(record: ConsultationRequest, expectedRevision: number) {
  if (!consultationRevisionMatches(record.revision, expectedRevision)) {
    throw new ConsultationDomainError(
      "Consultation changed; reload and try again.",
      409
    );
  }
}

function assertActorScope(
  actor: ConsultationActor,
  record: ConsultationRequest
) {
  if (!canAccessConsultation(actor, record)) {
    throw new ConsultationDomainError("Consultation not found.", 404);
  }
}

function assertTransition(
  actor: ConsultationActor,
  record: ConsultationRequest,
  action: ConsultationAction
) {
  assertActorScope(actor, record);
  const transition = validateTransition(actor.role, record.status, action);
  if (!transition.ok) {
    throw new ConsultationDomainError(transition.reason, 409);
  }
  return transition.toStatus;
}

export function createConsultation(
  actor: ConsultationActor,
  input: ConsultationCreateInput
) {
  if (actor.role !== "customer") {
    throw new ConsultationDomainError("Customer access required.", 403);
  }
  return db.transaction(async (tx) => {
    const [owner] = await tx
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerifiedAt: user.emailVerifiedAt,
      })
      .from(user)
      .where(eq(user.id, actor.id))
      .limit(1);
    if (
      !owner ||
      owner.role !== "user" ||
      !owner.emailVerifiedAt ||
      guestRegex.test(owner.email)
    ) {
      throw new ConsultationDomainError(
        "A verified registered customer account is required.",
        403
      );
    }
    let legalMatterId: string | null = null;
    if (input.chatId) {
      const [ownedChat] = await tx
        .select({ id: chat.id, userId: chat.userId })
        .from(chat)
        .where(eq(chat.id, input.chatId))
        .limit(1);
      if (!ownedChat || !consultationLinkOwnedBy(actor.id, ownedChat.userId)) {
        throw new ConsultationDomainError("Conversation not found.", 404);
      }
      const [conversation] = await tx
        .select({ legalMatterId: immigrationConversation.legalMatterId })
        .from(immigrationConversation)
        .where(eq(immigrationConversation.chatId, input.chatId))
        .limit(1);
      legalMatterId = conversation?.legalMatterId ?? null;
    }
    if (input.lawyerClarificationRequestId) {
      const [ownedRequest] = await tx
        .select({
          id: lawyerClarificationRequest.id,
          userId: lawyerClarificationRequest.userId,
          chatId: lawyerClarificationRequest.chatId,
        })
        .from(lawyerClarificationRequest)
        .where(
          eq(lawyerClarificationRequest.id, input.lawyerClarificationRequestId)
        )
        .limit(1);
      if (
        !ownedRequest ||
        !consultationLinkOwnedBy(actor.id, ownedRequest.userId)
      ) {
        throw new ConsultationDomainError("Lawyer request not found.", 404);
      }
      if (
        !consultationContinuityLinksMatch(input.chatId, ownedRequest.chatId)
      ) {
        throw new ConsultationDomainError(
          "The selected continuity references do not match.",
          400
        );
      }
    }
    const [created] = await tx
      .insert(consultationRequest)
      .values({
        userId: actor.id,
        chatId: input.chatId ?? null,
        legalMatterId,
        lawyerClarificationRequestId:
          input.lawyerClarificationRequestId ?? null,
        status: "requested",
        customerTimezone: input.customerTimezone,
        preferredWindows: input.preferredWindows.map(({ startAt, endAt }) => ({
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        })),
        methodPreference: input.methodPreference,
        customerNote: input.customerNote || null,
      })
      .returning();
    if (!created) {
      throw new ConsultationDomainError("Unable to create consultation.", 400);
    }
    await event(tx, {
      requestId: created.id,
      actor,
      eventType: "created",
      fromStatus: null,
      toStatus: "requested",
    });
    return created;
  });
}

export function listCustomerConsultations(userId: string) {
  return db
    .select()
    .from(consultationRequest)
    .where(eq(consultationRequest.userId, userId))
    .orderBy(desc(consultationRequest.updatedAt))
    .limit(100);
}

export async function getCustomerConsultation(userId: string, id: string) {
  const [record] = await db
    .select()
    .from(consultationRequest)
    .where(
      and(
        eq(consultationRequest.id, id),
        eq(consultationRequest.userId, userId)
      )
    )
    .limit(1);
  return record ?? null;
}

export async function listAdminConsultations() {
  const records = await db
    .select()
    .from(consultationRequest)
    .orderBy(desc(consultationRequest.updatedAt))
    .limit(200);
  return Promise.all(
    records.map((request) => getConsultationStaffProjection(request))
  );
}

export async function getAdminConsultation(id: string) {
  const [record] = await db
    .select()
    .from(consultationRequest)
    .where(eq(consultationRequest.id, id))
    .limit(1);
  return record ? getConsultationStaffProjection(record) : null;
}

export async function listLawyerConsultations(lawyerId: string) {
  const records = await db
    .select()
    .from(consultationRequest)
    .where(eq(consultationRequest.assignedLawyerUserId, lawyerId))
    .orderBy(desc(consultationRequest.updatedAt))
    .limit(200);
  return Promise.all(
    records.map((request) => getConsultationStaffProjection(request))
  );
}

export async function getLawyerConsultation(lawyerId: string, id: string) {
  const [record] = await db
    .select()
    .from(consultationRequest)
    .where(
      and(
        eq(consultationRequest.id, id),
        eq(consultationRequest.assignedLawyerUserId, lawyerId)
      )
    )
    .limit(1);
  return record ? getConsultationStaffProjection(record) : null;
}

function staffMutation(input: {
  actor: ConsultationActor;
  id: string;
  expectedRevision: number;
  action: "cancel" | "complete";
}) {
  return db.transaction(async (tx) => {
    const current = await requestForUpdate(tx, input.id);
    assertActorScope(input.actor, current);
    assertFresh(current, input.expectedRevision);
    const toStatus = assertTransition(input.actor, current, input.action);
    const now = new Date();
    const [updated] = await tx
      .update(consultationRequest)
      .set({
        status: toStatus,
        cancelledAt: input.action === "cancel" ? now : current.cancelledAt,
        completedAt: input.action === "complete" ? now : current.completedAt,
        updatedAt: now,
        revision: current.revision + 1,
      })
      .where(
        and(
          eq(consultationRequest.id, input.id),
          eq(consultationRequest.status, current.status),
          eq(consultationRequest.revision, current.revision)
        )
      )
      .returning();
    if (!updated) {
      throw new ConsultationDomainError(
        "Consultation changed; reload and try again.",
        409
      );
    }
    await event(tx, {
      requestId: input.id,
      actor: input.actor,
      eventType: input.action === "cancel" ? "cancelled" : "completed",
      fromStatus: current.status,
      toStatus,
    });
    return updated;
  });
}

export function cancelConsultation(
  actor: ConsultationActor,
  id: string,
  expectedRevision: number
) {
  return staffMutation({ actor, id, expectedRevision, action: "cancel" });
}
export function completeConsultation(
  actor: ConsultationActor,
  id: string,
  expectedRevision: number
) {
  return staffMutation({ actor, id, expectedRevision, action: "complete" });
}

export function customerConsultationAction(
  actor: ConsultationActor,
  id: string,
  expectedRevision: number,
  action: "confirm" | "request_reschedule" | "cancel"
) {
  return db.transaction(async (tx) => {
    const current = await requestForUpdate(tx, id);
    assertActorScope(actor, current);
    assertFresh(current, expectedRevision);
    const toStatus = assertTransition(actor, current, action);
    const now = new Date();
    const clearProposal = action === "request_reschedule";
    const [updated] = await tx
      .update(consultationRequest)
      .set({
        status: toStatus,
        ...customerLifecycleTimestamps(current, action, now),
        scheduledStartAt: clearProposal ? null : current.scheduledStartAt,
        scheduledEndAt: clearProposal ? null : current.scheduledEndAt,
        scheduledMethod: clearProposal ? null : current.scheduledMethod,
        meetingInstructions: clearProposal ? null : current.meetingInstructions,
        proposedAt: clearProposal ? null : current.proposedAt,
        updatedAt: now,
        revision: current.revision + 1,
      })
      .where(
        and(
          eq(consultationRequest.id, id),
          eq(consultationRequest.status, current.status),
          eq(consultationRequest.revision, current.revision)
        )
      )
      .returning();
    if (!updated) {
      throw new ConsultationDomainError(
        "Consultation changed; reload and try again.",
        409
      );
    }
    await event(tx, {
      requestId: id,
      actor,
      eventType:
        action === "confirm"
          ? "confirmed"
          : action === "request_reschedule"
            ? "reschedule_requested"
            : "cancelled",
      fromStatus: current.status,
      toStatus,
      metadata: clearProposal
        ? {
            priorProposalCleared: true,
            priorStartAt: current.scheduledStartAt?.toISOString() ?? null,
            priorEndAt: current.scheduledEndAt?.toISOString() ?? null,
            priorScheduledMethod: current.scheduledMethod,
          }
        : {},
    });
    return updated;
  });
}

export function assignConsultation(
  actor: ConsultationActor,
  id: string,
  expectedRevision: number,
  assignedLawyerUserId: string | null
) {
  if (!canManageConsultationAssignments(actor.role)) {
    throw new ConsultationDomainError("Administrator access required.", 403);
  }
  return db.transaction(async (tx) => {
    const current = await requestForUpdate(tx, id);
    assertFresh(current, expectedRevision);
    const action = assignedLawyerUserId ? "assign" : "unassign";
    assertTransition(actor, current, action);
    if (assignedLawyerUserId) {
      // This shared User-row lock serializes assignment with lawyer demotion.
      const [target] = await tx
        .select({
          id: user.id,
          email: user.email,
          role: user.role,
          emailVerifiedAt: user.emailVerifiedAt,
        })
        .from(user)
        .where(eq(user.id, assignedLawyerUserId))
        .limit(1)
        .for("update");
      if (!canAssignConsultationLawyer(target ?? null)) {
        throw new ConsultationDomainError(
          "Only verified, non-guest lawyer accounts may be assigned.",
          400
        );
      }
    }
    const now = new Date();
    const [updated] = await tx
      .update(consultationRequest)
      .set({
        assignedLawyerUserId,
        assignedAt: assignedLawyerUserId ? now : null,
        updatedAt: now,
        revision: current.revision + 1,
      })
      .where(
        and(
          eq(consultationRequest.id, id),
          eq(consultationRequest.status, current.status),
          eq(consultationRequest.revision, current.revision)
        )
      )
      .returning();
    if (!updated) {
      throw new ConsultationDomainError(
        "Consultation changed; reload and try again.",
        409
      );
    }
    await event(tx, {
      requestId: id,
      actor,
      eventType: assignedLawyerUserId ? "assigned" : "unassigned",
      fromStatus: current.status,
      toStatus: current.status,
      metadata: {
        previousAssignedLawyerUserId: current.assignedLawyerUserId,
        assignedLawyerUserId,
      },
    });
    return updated;
  });
}

export function proposeConsultation(
  actor: ConsultationActor,
  id: string,
  expectedRevision: number,
  proposal: ConsultationProposalInput
) {
  if (!validateProposalInterval(proposal.startAt, proposal.endAt)) {
    throw new ConsultationDomainError(
      "Proposal must have a future start and end after its start.",
      400
    );
  }
  return db.transaction(async (tx) => {
    const [snapshot] = await tx
      .select()
      .from(consultationRequest)
      .where(eq(consultationRequest.id, id))
      .limit(1);
    if (!snapshot) {
      throw new ConsultationDomainError("Consultation not found.", 404);
    }
    assertActorScope(actor, snapshot);
    const lawyerId = snapshot.assignedLawyerUserId;
    if (!lawyerId) {
      throw new ConsultationDomainError(
        "Assign a lawyer before proposing a slot.",
        409
      );
    }
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lawyerId}::text, 0::bigint))`
    );
    const current = await requestForUpdate(tx, id);
    assertActorScope(actor, current);
    assertFresh(current, expectedRevision);
    if (current.assignedLawyerUserId !== lawyerId) {
      throw new ConsultationDomainError(
        "The consultation assignment changed; reload and try again.",
        409
      );
    }
    const toStatus = assertTransition(actor, current, "propose");
    const [conflict] = await tx
      .select({
        id: consultationRequest.id,
        assignedLawyerUserId: consultationRequest.assignedLawyerUserId,
        status: consultationRequest.status,
        scheduledStartAt: consultationRequest.scheduledStartAt,
        scheduledEndAt: consultationRequest.scheduledEndAt,
      })
      .from(consultationRequest)
      .where(
        and(
          eq(consultationRequest.assignedLawyerUserId, lawyerId),
          inArray(consultationRequest.status, ["proposed", "confirmed"]),
          ne(consultationRequest.id, id),
          lt(consultationRequest.scheduledStartAt, proposal.endAt),
          gt(consultationRequest.scheduledEndAt, proposal.startAt)
        )
      )
      .limit(1);
    if (
      conflict &&
      hasScheduleConflict([conflict], {
        requestId: id,
        lawyerId,
        startAt: proposal.startAt,
        endAt: proposal.endAt,
      })
    ) {
      throw new ConsultationDomainError(
        "This lawyer already has an overlapping consultation proposal.",
        409
      );
    }
    const now = new Date();
    const [updated] = await tx
      .update(consultationRequest)
      .set({
        status: toStatus,
        scheduledStartAt: proposal.startAt,
        scheduledEndAt: proposal.endAt,
        scheduledMethod: proposal.scheduledMethod,
        meetingInstructions: proposal.meetingInstructions || null,
        proposedAt: now,
        confirmedAt: null,
        updatedAt: now,
        revision: current.revision + 1,
      })
      .where(
        and(
          eq(consultationRequest.id, id),
          eq(consultationRequest.status, current.status),
          eq(consultationRequest.revision, current.revision)
        )
      )
      .returning();
    if (!updated) {
      throw new ConsultationDomainError(
        "Consultation changed; reload and try again.",
        409
      );
    }
    await event(tx, {
      requestId: id,
      actor,
      eventType: "proposed",
      fromStatus: current.status,
      toStatus,
      metadata: {
        startAt: proposal.startAt.toISOString(),
        endAt: proposal.endAt.toISOString(),
        scheduledMethod: proposal.scheduledMethod,
      },
    });
    return updated;
  });
}

export async function getConsultationNotificationTargets(id: string) {
  const [request] = await db
    .select({
      userId: consultationRequest.userId,
      assignedLawyerUserId: consultationRequest.assignedLawyerUserId,
    })
    .from(consultationRequest)
    .where(eq(consultationRequest.id, id))
    .limit(1);
  if (!request) {
    return null;
  }
  const [customer] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, request.userId))
    .limit(1);
  const [lawyer] = request.assignedLawyerUserId
    ? await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, request.assignedLawyerUserId))
        .limit(1)
    : [];
  return {
    customerEmail: customer?.email ?? null,
    assignedLawyerEmail: lawyer?.email ?? null,
  };
}

export async function getConsultationStaffProjection(
  record: ConsultationRequest
) {
  const [owner] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, record.userId))
    .limit(1);
  const [lawyer] = record.assignedLawyerUserId
    ? await db
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(eq(user.id, record.assignedLawyerUserId))
        .limit(1)
    : [];
  return {
    request: record,
    customerId: owner?.id ?? record.userId,
    customerEmail: owner?.email ?? "",
    lawyerId: lawyer?.id ?? null,
    lawyerEmail: lawyer?.email ?? null,
  };
}
