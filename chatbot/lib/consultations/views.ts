import type { ConsultationRequest } from "@/lib/db/schema";
import type {
  ConsultationDTOFields,
  CustomerConsultationDTO,
  StaffConsultationDTO,
} from "./types";

type Lawyer = { id: string; email: string } | null;
type Customer = { id: string; email: string };

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function windows(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const item = entry as Record<string, unknown>;
    if (typeof item.startAt !== "string" || typeof item.endAt !== "string") {
      return [];
    }
    return [{ startAt: item.startAt, endAt: item.endAt }];
  });
}

function consultationFields(
  record: ConsultationRequest
): ConsultationDTOFields {
  return {
    id: record.id,
    status: record.status,
    revision: record.revision,
    customerTimezone: record.customerTimezone,
    preferredWindows: windows(record.preferredWindows),
    methodPreference: record.methodPreference,
    customerNote: record.customerNote,
    scheduledStartAt: iso(record.scheduledStartAt),
    scheduledEndAt: iso(record.scheduledEndAt),
    scheduledMethod: record.scheduledMethod,
    meetingInstructions: record.meetingInstructions,
    proposedAt: iso(record.proposedAt),
    confirmedAt: iso(record.confirmedAt),
    completedAt: iso(record.completedAt),
    cancelledAt: iso(record.cancelledAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function consultationRequestView(
  record: ConsultationRequest
): CustomerConsultationDTO {
  return {
    ...consultationFields(record),
    assigned: record.assignedLawyerUserId !== null,
  };
}

export function staffConsultationView(
  record: ConsultationRequest,
  customer: Customer,
  lawyer: Lawyer
): StaffConsultationDTO {
  return {
    ...consultationFields(record),
    customer,
    assignedLawyer: lawyer,
  };
}
