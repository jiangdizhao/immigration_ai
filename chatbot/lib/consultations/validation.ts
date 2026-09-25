import { z } from "zod";

export const CUSTOMER_NOTE_MAX_LENGTH = 2000;
export const MEETING_INSTRUCTIONS_MAX_LENGTH = 2000;
export const MAX_PREFERRED_WINDOWS = 3;
export const MAX_WINDOW_DURATION_MS = 8 * 60 * 60 * 1000;
export const MAX_PREFERRED_HORIZON_MS = 180 * 24 * 60 * 60 * 1000;

const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });

export const createConsultationSchema = z
  .object({
    chatId: uuid.optional(),
    lawyerClarificationRequestId: uuid.optional(),
    customerTimezone: z.string().trim().min(1).max(128),
    preferredWindows: z
      .array(z.object({ startAt: isoDate, endAt: isoDate }).strict())
      .min(1)
      .max(MAX_PREFERRED_WINDOWS),
    methodPreference: z.enum(["video", "phone", "in_person", "no_preference"]),
    customerNote: z.string().trim().max(CUSTOMER_NOTE_MAX_LENGTH).optional(),
  })
  .strict();

export const expectedRevision = z.number().int().positive().max(2_147_483_647);
export const customerActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), expectedRevision }).strict(),
  z
    .object({
      action: z.literal("request_reschedule"),
      expectedRevision,
    })
    .strict(),
  z.object({ action: z.literal("cancel"), expectedRevision }).strict(),
]);

export const staffActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("assign"),
      expectedRevision,
      assignedLawyerUserId: uuid.nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("propose"),
      expectedRevision,
      startAt: isoDate,
      endAt: isoDate,
      scheduledMethod: z.enum(["video", "phone", "in_person", "other"]),
      meetingInstructions: z
        .string()
        .trim()
        .max(MEETING_INSTRUCTIONS_MAX_LENGTH)
        .optional(),
    })
    .strict(),
  z.object({ action: z.literal("cancel"), expectedRevision }).strict(),
  z
    .object({
      action: z.literal("complete"),
      expectedRevision,
    })
    .strict(),
]);

export const lawyerActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("propose"),
      expectedRevision,
      startAt: isoDate,
      endAt: isoDate,
      scheduledMethod: z.enum(["video", "phone", "in_person", "other"]),
      meetingInstructions: z
        .string()
        .trim()
        .max(MEETING_INSTRUCTIONS_MAX_LENGTH)
        .optional(),
    })
    .strict(),
  z.object({ action: z.literal("cancel"), expectedRevision }).strict(),
  z
    .object({
      action: z.literal("complete"),
      expectedRevision,
    })
    .strict(),
]);

export function validateCreateInput(
  value: z.infer<typeof createConsultationSchema>,
  now = new Date()
) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.customerTimezone });
  } catch {
    return { ok: false as const, error: "Invalid IANA timezone." };
  }
  const windows = value.preferredWindows.map(({ startAt, endAt }) => ({
    startAt: new Date(startAt),
    endAt: new Date(endAt),
  }));
  for (const window of windows) {
    const duration = window.endAt.getTime() - window.startAt.getTime();
    if (duration <= 0) {
      return {
        ok: false as const,
        error: "Each preferred window must end after it starts.",
      };
    }
    if (window.startAt <= now) {
      return {
        ok: false as const,
        error: "Preferred windows must be in the future.",
      };
    }
    if (duration > MAX_WINDOW_DURATION_MS) {
      return {
        ok: false as const,
        error: "A preferred window exceeds the technical duration limit.",
      };
    }
    if (window.endAt.getTime() - now.getTime() > MAX_PREFERRED_HORIZON_MS) {
      return {
        ok: false as const,
        error: "A preferred window exceeds the technical horizon limit.",
      };
    }
  }
  const sorted = [...windows].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime()
  );
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].startAt < sorted[i - 1].endAt) {
      return {
        ok: false as const,
        error: "Preferred windows may not overlap or duplicate each other.",
      };
    }
  }
  return { ok: true as const, data: { ...value, preferredWindows: windows } };
}

export function validateProposalInterval(
  startAt: Date,
  endAt: Date,
  now = new Date()
) {
  const duration = endAt.getTime() - startAt.getTime();
  return Number.isFinite(duration) && startAt > now && duration > 0;
}
