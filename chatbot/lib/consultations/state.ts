import type { ConsultationStatus } from "@/lib/db/schema";
import type { ConsultationActorRole } from "./types";

export type ConsultationAction =
  | "create"
  | "assign"
  | "unassign"
  | "propose"
  | "confirm"
  | "request_reschedule"
  | "cancel"
  | "complete";

export type TransitionResult =
  | { ok: true; toStatus: ConsultationStatus }
  | { ok: false; reason: string };

export function validateTransition(
  role: ConsultationActorRole,
  status: ConsultationStatus,
  action: ConsultationAction
): TransitionResult {
  if (action === "create") {
    return role === "customer" && status === "requested"
      ? { ok: true, toStatus: "requested" }
      : {
          ok: false,
          reason: "Only customers can create a requested consultation.",
        };
  }
  if (action === "assign" || action === "unassign") {
    return role === "admin" && status === "requested"
      ? { ok: true, toStatus: status }
      : {
          ok: false,
          reason:
            "Assignment changes are allowed only by admin while requested.",
        };
  }
  if (action === "propose") {
    return (role === "admin" || role === "lawyer") &&
      ["requested", "proposed", "confirmed"].includes(status)
      ? { ok: true, toStatus: "proposed" }
      : {
          ok: false,
          reason: "This consultation cannot be proposed in its current state.",
        };
  }
  if (action === "confirm") {
    return role === "customer" && status === "proposed"
      ? { ok: true, toStatus: "confirmed" }
      : {
          ok: false,
          reason:
            "Only a proposed consultation can be confirmed by its customer.",
        };
  }
  if (action === "request_reschedule") {
    return role === "customer" && status === "proposed"
      ? { ok: true, toStatus: "requested" }
      : {
          ok: false,
          reason:
            "Only a proposed consultation can be rescheduled by its customer.",
        };
  }
  if (action === "cancel") {
    return status === "completed" || status === "cancelled"
      ? { ok: false, reason: "Terminal consultations cannot be changed." }
      : role === "customer" || role === "lawyer" || role === "admin"
        ? { ok: true, toStatus: "cancelled" }
        : { ok: false, reason: "Actor cannot cancel this consultation." };
  }
  if (action === "complete") {
    return (role === "admin" || role === "lawyer") && status === "confirmed"
      ? { ok: true, toStatus: "completed" }
      : {
          ok: false,
          reason: "Only a confirmed consultation can be completed by staff.",
        };
  }
  return { ok: false, reason: "Unknown consultation action." };
}

export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
) {
  return aStart < bEnd && aEnd > bStart;
}

export type ScheduleCandidate = {
  id: string;
  assignedLawyerUserId: string | null;
  status: ConsultationStatus;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
};

export function hasScheduleConflict(
  candidates: ScheduleCandidate[],
  input: { requestId: string; lawyerId: string; startAt: Date; endAt: Date }
) {
  return candidates.some(
    (candidate) =>
      candidate.id !== input.requestId &&
      candidate.assignedLawyerUserId === input.lawyerId &&
      (candidate.status === "proposed" || candidate.status === "confirmed") &&
      candidate.scheduledStartAt !== null &&
      candidate.scheduledEndAt !== null &&
      intervalsOverlap(
        candidate.scheduledStartAt,
        candidate.scheduledEndAt,
        input.startAt,
        input.endAt
      )
  );
}

export function customerLifecycleTimestamps(
  current: { confirmedAt: Date | null; cancelledAt: Date | null },
  action: "confirm" | "request_reschedule" | "cancel",
  now: Date
) {
  return {
    confirmedAt:
      action === "confirm"
        ? now
        : action === "request_reschedule"
          ? null
          : current.confirmedAt,
    cancelledAt: action === "cancel" ? now : current.cancelledAt,
  };
}

export function consultationRevisionMatches(
  currentRevision: number,
  expectedRevision: number
) {
  return (
    Number.isSafeInteger(expectedRevision) &&
    currentRevision === expectedRevision
  );
}
