import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSULTATION_NOTIFICATION_KINDS,
  type ConsultationNotification,
  consultationNotificationsEnabled,
  consultationNotificationTarget,
  deliverConsultationNotification,
} from "./notification-policy";

test("consultation notification types are separate from lawyer-request events", () => {
  assert.deepEqual(CONSULTATION_NOTIFICATION_KINDS, [
    "request_created",
    "request_assigned",
    "proposal_ready",
    "customer_confirmed",
    "reschedule_requested",
    "customer_cancelled",
    "staff_cancelled",
    "completed",
  ]);
  const consultation: ConsultationNotification = {
    email: "customer@example.test",
    consultationId: "request-id",
    recipient: "customer",
    kind: "proposal_ready",
  };
  assert.equal(consultation.kind, "proposal_ready");
  assert.equal("requestId" in consultation, false);
  assert.equal("consultationId" in consultation, true);
  assert.equal("requestId" in consultation, false);
  assert.equal(
    CONSULTATION_NOTIFICATION_KINDS.includes(
      "needs_more_information" as (typeof CONSULTATION_NOTIFICATION_KINDS)[number]
    ),
    false
  );
});

test("consultation notifications are disabled unless the exact flag is enabled", () => {
  const previous = process.env.CONSULTATION_NOTIFICATIONS_ENABLED;
  process.env.CONSULTATION_NOTIFICATIONS_ENABLED = undefined;
  assert.equal(consultationNotificationsEnabled(), false);
  if (previous !== undefined) {
    process.env.CONSULTATION_NOTIFICATIONS_ENABLED = previous;
  }
  assert.equal(
    consultationNotificationsEnabled({
      CONSULTATION_NOTIFICATIONS_ENABLED: "false",
    }),
    false
  );
  assert.equal(
    consultationNotificationsEnabled({
      CONSULTATION_NOTIFICATIONS_ENABLED: "true",
    }),
    true
  );
});

test("notification targets follow event role and configured staff fallback", () => {
  const targets = {
    customerEmail: "customer@example.test",
    assignedLawyerEmail: "lawyer@example.test",
  };
  assert.deepEqual(
    consultationNotificationTarget(
      "request_created",
      targets,
      "staff@example.test"
    ),
    { email: "staff@example.test", recipient: "staff" }
  );
  assert.deepEqual(
    consultationNotificationTarget("request_assigned", targets, undefined),
    { email: "lawyer@example.test", recipient: "lawyer" }
  );
  assert.deepEqual(
    consultationNotificationTarget("proposal_ready", targets, undefined),
    { email: "customer@example.test", recipient: "customer" }
  );
  assert.deepEqual(
    consultationNotificationTarget("customer_cancelled", targets, undefined),
    { email: "lawyer@example.test", recipient: "lawyer" }
  );
  assert.deepEqual(
    consultationNotificationTarget(
      "customer_cancelled",
      { ...targets, assignedLawyerEmail: null },
      "staff@example.test"
    ),
    { email: "staff@example.test", recipient: "staff" }
  );
  assert.equal(
    consultationNotificationTarget(
      "customer_cancelled",
      { ...targets, assignedLawyerEmail: null },
      undefined
    ),
    null
  );
});

test("delivery failure returns false and never throws", async () => {
  const result = await deliverConsultationNotification(
    {
      email: "customer@example.test",
      consultationId: "request-id",
      recipient: "customer",
      kind: "proposal_ready",
    },
    () => Promise.reject(new Error("private email content must not be logged"))
  );
  assert.equal(result, false);
});
