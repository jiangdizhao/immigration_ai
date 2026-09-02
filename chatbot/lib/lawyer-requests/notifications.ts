import "server-only";

import { sendLawyerRequestNotificationEmail } from "@/lib/auth/email";

export type LawyerRequestNotification = {
  email: string;
  requestId: string;
  recipient: "customer" | "lawyer" | "staff";
  kind:
    | "request_created"
    | "request_assigned"
    | "needs_more_information"
    | "customer_replied"
    | "review_completed";
};

export type NotificationSender = (
  notification: LawyerRequestNotification
) => Promise<void>;

export async function deliverLawyerRequestNotification(
  notification: LawyerRequestNotification,
  sender: NotificationSender = sendLawyerRequestNotificationEmail
) {
  try {
    await sender(notification);
    return true;
  } catch (error) {
    console.error("Lawyer request notification failed", {
      requestId: notification.requestId,
      recipient: notification.recipient,
      kind: notification.kind,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return false;
  }
}

export function notifyLawyerRequest(notification: LawyerRequestNotification) {
  if (process.env.LAWYER_REQUEST_NOTIFICATIONS_ENABLED !== "true") {
    return false;
  }
  return deliverLawyerRequestNotification(notification);
}
