import type { ConsultationStatus } from "@/lib/db/schema";

export type ConsultationActorRole = "customer" | "lawyer" | "admin";
export type CustomerMethodPreference =
  | "video"
  | "phone"
  | "in_person"
  | "no_preference";
export type ScheduledMethod = "video" | "phone" | "in_person" | "other";

export type PreferredWindow = { startAt: Date; endAt: Date };

export type ConsultationCreateInput = {
  chatId?: string;
  lawyerClarificationRequestId?: string;
  customerTimezone: string;
  preferredWindows: PreferredWindow[];
  methodPreference: CustomerMethodPreference;
  customerNote?: string;
};

export type ConsultationProposalInput = {
  startAt: Date;
  endAt: Date;
  scheduledMethod: ScheduledMethod;
  meetingInstructions?: string;
};

export type ConsultationDTOFields = {
  id: string;
  status: ConsultationStatus;
  revision: number;
  customerTimezone: string;
  preferredWindows: Array<{ startAt: string; endAt: string }>;
  methodPreference: CustomerMethodPreference;
  customerNote: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  scheduledMethod: ScheduledMethod | null;
  meetingInstructions: string | null;
  proposedAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerConsultationDTO = ConsultationDTOFields & {
  assigned: boolean;
};

export type StaffConsultationDTO = ConsultationDTOFields & {
  customer: { id: string; email: string };
  assignedLawyer: { id: string; email: string } | null;
};
