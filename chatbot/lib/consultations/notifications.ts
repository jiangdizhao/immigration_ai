import "server-only";

import { sendConsultationNotificationEmail } from "@/lib/auth/email";
import {
  type ConsultationNotificationKind,
  consultationNotificationsEnabled,
  consultationNotificationTarget,
  deliverConsultationNotification,
} from "./notification-policy";
import { getConsultationNotificationTargets } from "./service";

export type {
  ConsultationNotification,
  ConsultationNotificationKind,
  ConsultationNotificationRecipient,
  ConsultationNotificationSender,
} from "./notification-policy";
export {
  consultationNotificationsEnabled,
  consultationNotificationTarget,
  deliverConsultationNotification,
} from "./notification-policy";

export async function notifyConsultation(
  consultationId: string,
  kind: ConsultationNotificationKind
) {
  if (!consultationNotificationsEnabled()) {
    return false;
  }
  try {
    const targets = await getConsultationNotificationTargets(consultationId);
    if (!targets) {
      return false;
    }
    const recipient = consultationNotificationTarget(
      kind,
      targets,
      process.env.CONSULTATION_STAFF_EMAIL
    );
    if (!recipient) {
      return false;
    }
    return await deliverConsultationNotification(
      { ...recipient, consultationId, kind },
      sendConsultationNotificationEmail
    );
  } catch (error) {
    console.error("Consultation notification preparation failed", {
      consultationId,
      kind,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return false;
  }
}
