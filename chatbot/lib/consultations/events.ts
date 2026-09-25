import type { ConsultationStatus, consultationEvent } from "@/lib/db/schema";
import type { ScheduledMethod } from "./types";

export type ConsultationEventType =
  | "created"
  | "assigned"
  | "unassigned"
  | "proposed"
  | "confirmed"
  | "reschedule_requested"
  | "cancelled"
  | "completed";

export type ConsultationEventActor = {
  id: string;
  role: "customer" | "lawyer" | "admin";
} | null;

export type ConsultationEventInput = {
  requestId: string;
  actor: ConsultationEventActor;
  eventType: ConsultationEventType;
  fromStatus: ConsultationStatus | null;
  toStatus: ConsultationStatus | null;
  metadata?: Record<string, unknown>;
};

const scheduledMethods: ScheduledMethod[] = [
  "video",
  "phone",
  "in_person",
  "other",
];

function boundedId(value: unknown) {
  return typeof value === "string" && value.length <= 36 ? value : null;
}

function boundedInstant(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !Number.isFinite(Date.parse(value))
  ) {
    return null;
  }
  return new Date(value).toISOString();
}

function boundedMethod(value: unknown): ScheduledMethod | null {
  return typeof value === "string" &&
    scheduledMethods.includes(value as ScheduledMethod)
    ? (value as ScheduledMethod)
    : null;
}

function schedulingMetadata(input: ConsultationEventInput) {
  const metadata = input.metadata ?? {};
  if (input.eventType === "assigned" || input.eventType === "unassigned") {
    return {
      previousAssignedLawyerUserId: boundedId(
        metadata.previousAssignedLawyerUserId
      ),
      assignedLawyerUserId: boundedId(metadata.assignedLawyerUserId),
    };
  }
  if (input.eventType === "proposed") {
    const startAt = boundedInstant(metadata.startAt);
    const endAt = boundedInstant(metadata.endAt);
    const scheduledMethod = boundedMethod(metadata.scheduledMethod);
    return startAt && endAt && scheduledMethod
      ? { startAt, endAt, scheduledMethod }
      : {};
  }
  if (input.eventType === "reschedule_requested") {
    return {
      priorProposalCleared: metadata.priorProposalCleared === true,
      priorStartAt: boundedInstant(metadata.priorStartAt),
      priorEndAt: boundedInstant(metadata.priorEndAt),
      priorScheduledMethod: boundedMethod(metadata.priorScheduledMethod),
    };
  }
  return {};
}

export function buildConsultationEvent(input: ConsultationEventInput) {
  return {
    consultationRequestId: input.requestId,
    actorUserId: input.actor?.id ?? null,
    actorRole: input.actor?.role ?? "system",
    eventType: input.eventType,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    metadata: schedulingMetadata(input),
  } satisfies typeof consultationEvent.$inferInsert;
}
