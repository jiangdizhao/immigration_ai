import type { SiteLocale } from "@/lib/site-locale";
import { getConsultationCopy } from "./copy";
import type { CustomerConsultationDTO } from "./types";

export type ConsultationAction = "confirm" | "request_reschedule" | "cancel";

export function customerActionsForStatus(
  status: CustomerConsultationDTO["status"]
): ConsultationAction[] {
  if (status === "requested" || status === "confirmed") {
    return ["cancel"];
  }
  if (status === "proposed") {
    return ["confirm", "request_reschedule", "cancel"];
  }
  return [];
}

export function consultationCreateHref(chatId?: string | null) {
  return chatId
    ? `/consultations/new?chatId=${encodeURIComponent(chatId)}`
    : "/consultations/new";
}

export function browserTimezone(
  value: string | null | undefined
): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

export function localDateTimeToIso(
  localValue: string,
  timezone: string | null
): string | null {
  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (
    !browserTimezone(timezone) ||
    timezone !== systemTimezone ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localValue)
  ) {
    return null;
  }
  const date = new Date(localValue);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  const [datePart, timePart] = localValue.split("T");
  if (
    date.toString() === "Invalid Date" ||
    `${date.getFullYear().toString().padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` !==
      `${datePart}T${timePart}`
  ) {
    return null;
  }
  return date.toISOString();
}

export function consultationDate(
  value: string | null | undefined,
  timezone: string,
  locale: string
) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(date);
  } catch {
    return null;
  }
}

export function shouldShowConsultationCreateForm(input: {
  availabilityChecked: boolean;
  loading: boolean;
  unavailable: boolean;
  error: string;
}) {
  return (
    input.availabilityChecked &&
    !input.loading &&
    !input.unavailable &&
    !input.error
  );
}

export function shouldShowConsultationHistory(input: {
  loading: boolean;
  unavailable: boolean;
  error: string;
}) {
  return !input.loading && !input.unavailable && !input.error;
}

export async function runCustomerAction(options: {
  send: () => Promise<Response>;
  reload: () => Promise<void>;
  onStart?: () => void;
}) {
  options.onStart?.();
  const response = await options.send();
  if (response.status === 409) {
    await options.reload();
    return "stale" as const;
  }
  if (response.status === 503) {
    const payload: unknown = await response.json().catch(() => null);
    if (
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      payload.code === "consultation_schema_unavailable"
    ) {
      return "unavailable" as const;
    }
  }
  if (response.status === 401 || response.status === 403) {
    return "unauthorized" as const;
  }
  return response.ok ? ("success" as const) : ("error" as const);
}

export function consultationStatusLabel(status: string, locale: SiteLocale) {
  const copy = getConsultationCopy(locale);
  switch (status) {
    case "requested":
      return copy.requested;
    case "proposed":
      return copy.proposed;
    case "confirmed":
      return copy.confirmed;
    case "completed":
      return copy.completed;
    case "cancelled":
      return copy.cancelled;
    default:
      return copy.unknownStatus;
  }
}
