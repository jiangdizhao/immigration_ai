import type { ConsultationStatus } from "@/lib/db/schema";
import type { ScheduledMethod } from "./types";

export type ConsultationStaffAction =
  | "assign"
  | "unassign"
  | "propose"
  | "cancel"
  | "complete";

export type ConsultationProposalDraftMetadata = {
  scheduledMethod: ScheduledMethod;
  meetingInstructions: string;
};

export function proposalDraftMetadata(value: {
  scheduledMethod: ScheduledMethod | null | undefined;
  meetingInstructions: string | null | undefined;
}): ConsultationProposalDraftMetadata {
  const scheduledMethod =
    value.scheduledMethod === "video" ||
    value.scheduledMethod === "phone" ||
    value.scheduledMethod === "in_person" ||
    value.scheduledMethod === "other"
      ? value.scheduledMethod
      : "video";
  return {
    scheduledMethod,
    meetingInstructions:
      typeof value.meetingInstructions === "string"
        ? value.meetingInstructions
        : "",
  };
}

export function adminConsultationActions(
  status: ConsultationStatus,
  assigned: boolean
): ConsultationStaffAction[] {
  if (status === "requested") {
    return [
      "assign",
      "unassign",
      ...(assigned ? (["propose"] as const) : []),
      "cancel",
    ];
  }
  if (status === "proposed") {
    return ["propose", "cancel"];
  }
  if (status === "confirmed") {
    return ["propose", "cancel", "complete"];
  }
  return [];
}

export function lawyerConsultationActions(
  status: ConsultationStatus
): Exclude<ConsultationStaffAction, "assign" | "unassign">[] {
  if (status === "requested") {
    return ["propose", "cancel"];
  }
  if (status === "proposed") {
    return ["propose", "cancel"];
  }
  if (status === "confirmed") {
    return ["propose", "cancel", "complete"];
  }
  return [];
}

export function adminAssignmentControlsVisible(status: ConsultationStatus) {
  return status === "requested";
}

export function lawyerAssignmentControlsVisible() {
  return false;
}

export function consultationStaffUrl(
  recipient: "customer" | "lawyer" | "staff",
  id: string
) {
  const consultationId = encodeURIComponent(id);
  if (recipient === "customer") {
    return `/consultations/${consultationId}`;
  }
  if (recipient === "lawyer") {
    return `/lawyer-portal/consultations/${consultationId}`;
  }
  return `/admin-portal/consultations/${consultationId}`;
}

export function isConsultationSchemaUnavailable(status: number, body: unknown) {
  return (
    status === 503 &&
    Boolean(
      body &&
        typeof body === "object" &&
        "code" in body &&
        body.code === "consultation_schema_unavailable"
    )
  );
}

function localDateParts(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

export function staffLocalDateTimeToIso(
  localValue: string,
  timezone: string | null | undefined
): string | null {
  if (!timezone || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localValue)) {
    return null;
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) {
    return null;
  }
  const requested = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  if (
    requested.month < 1 ||
    requested.month > 12 ||
    requested.day < 1 ||
    requested.day > 31 ||
    requested.hour > 23 ||
    requested.minute > 59
  ) {
    return null;
  }
  const wallClockAsUtc = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute
  );
  const normalized = new Date(wallClockAsUtc);
  if (
    normalized.getUTCFullYear() !== requested.year ||
    normalized.getUTCMonth() + 1 !== requested.month ||
    normalized.getUTCDate() !== requested.day ||
    normalized.getUTCHours() !== requested.hour ||
    normalized.getUTCMinutes() !== requested.minute
  ) {
    return null;
  }

  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = wallClockAsUtc + hours * 60 * 60 * 1000;
    const local = localDateParts(sample, timezone);
    offsets.add(
      Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute
      ) - sample
    );
  }
  const candidates = [...offsets]
    .map((offset) => wallClockAsUtc - offset)
    .filter((timestamp) => {
      const actual = localDateParts(timestamp, timezone);
      return (
        actual.year === requested.year &&
        actual.month === requested.month &&
        actual.day === requested.day &&
        actual.hour === requested.hour &&
        actual.minute === requested.minute
      );
    })
    .sort((left, right) => left - right);
  return candidates.length ? new Date(candidates[0]).toISOString() : null;
}

export async function runConsultationStaffMutation(
  send: () => Promise<Response>,
  refetch: () => Promise<void>
) {
  const response = await send();
  if (response.status === 409) {
    await refetch();
    return { kind: "conflict" as const };
  }
  return {
    kind: response.ok ? ("success" as const) : ("error" as const),
    response,
  };
}
