export const CONSULTATION_NOTIFICATION_KINDS = [
  "request_created",
  "request_assigned",
  "proposal_ready",
  "customer_confirmed",
  "reschedule_requested",
  "customer_cancelled",
  "staff_cancelled",
  "completed",
] as const;

export type ConsultationNotificationKind =
  (typeof CONSULTATION_NOTIFICATION_KINDS)[number];
export type ConsultationNotificationRecipient = "customer" | "lawyer" | "staff";

export type ConsultationNotification = {
  email: string;
  consultationId: string;
  recipient: ConsultationNotificationRecipient;
  kind: ConsultationNotificationKind;
};

export type ConsultationNotificationTargets = {
  customerEmail: string | null;
  assignedLawyerEmail: string | null;
};

export function consultationNotificationsEnabled(
  environment: Record<string, string | undefined> = process.env
) {
  return environment.CONSULTATION_NOTIFICATIONS_ENABLED === "true";
}

export function consultationNotificationTarget(
  kind: ConsultationNotificationKind,
  targets: ConsultationNotificationTargets,
  staffEmail: string | undefined
): { email: string; recipient: ConsultationNotificationRecipient } | null {
  const configuredStaffEmail = staffEmail?.trim() || null;
  if (kind === "request_created") {
    return configuredStaffEmail
      ? { email: configuredStaffEmail, recipient: "staff" }
      : null;
  }
  if (
    kind === "request_assigned" ||
    kind === "customer_confirmed" ||
    kind === "reschedule_requested"
  ) {
    return targets.assignedLawyerEmail
      ? { email: targets.assignedLawyerEmail, recipient: "lawyer" }
      : null;
  }
  if (kind === "customer_cancelled" && targets.assignedLawyerEmail) {
    return { email: targets.assignedLawyerEmail, recipient: "lawyer" };
  }
  if (kind === "customer_cancelled") {
    return configuredStaffEmail
      ? { email: configuredStaffEmail, recipient: "staff" }
      : null;
  }
  return targets.customerEmail
    ? { email: targets.customerEmail, recipient: "customer" }
    : null;
}

export type ConsultationNotificationSender = (
  notification: ConsultationNotification
) => Promise<void>;

export async function deliverConsultationNotification(
  notification: ConsultationNotification,
  sender: ConsultationNotificationSender
) {
  try {
    await sender(notification);
    return true;
  } catch (error) {
    console.error("Consultation notification delivery failed", {
      consultationId: notification.consultationId,
      recipient: notification.recipient,
      kind: notification.kind,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return false;
  }
}
