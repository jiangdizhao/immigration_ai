import assert from "node:assert/strict";
import test from "node:test";
import type { ConsultationRequest } from "@/lib/db/schema";
import { consultationRequestView, staffConsultationView } from "./views";

const assignedLawyerId = "00000000-0000-4000-8000-000000000005";

const record = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  chatId: "00000000-0000-4000-8000-000000000003",
  legalMatterId: "matter-private",
  lawyerClarificationRequestId: "00000000-0000-4000-8000-000000000004",
  status: "proposed",
  revision: 3,
  customerTimezone: "Australia/Sydney",
  preferredWindows: [
    { startAt: "2026-10-01T10:00:00.000Z", endAt: "2026-10-01T11:00:00.000Z" },
  ],
  methodPreference: "video",
  customerNote: "Customer note",
  assignedLawyerUserId: assignedLawyerId,
  assignedAt: new Date("2026-09-25T00:00:00.000Z"),
  scheduledStartAt: new Date("2026-10-01T10:00:00.000Z"),
  scheduledEndAt: new Date("2026-10-01T11:00:00.000Z"),
  scheduledMethod: "video",
  meetingInstructions: "Staff instructions",
  proposedAt: new Date("2026-09-25T00:00:00.000Z"),
  confirmedAt: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date("2026-09-25T00:00:00.000Z"),
  updatedAt: new Date("2026-09-25T00:00:00.000Z"),
} satisfies ConsultationRequest;

test("customer and staff consultation projections omit continuity capabilities and document/chat data", () => {
  const customer = consultationRequestView(record);
  const staff = staffConsultationView(
    record,
    { id: record.userId, email: "customer@example.com" },
    { id: assignedLawyerId, email: "lawyer@example.com" }
  );
  const forbidden = [
    "chatId",
    "legalMatterId",
    "lawyerClarificationRequestId",
    "matterDocuments",
    "documentText",
    "rawTrace",
    "providerPayload",
  ];
  for (const key of forbidden) {
    assert.equal(
      Object.hasOwn(customer, key),
      false,
      `customer projection exposed ${key}`
    );
    assert.equal(
      Object.hasOwn(staff, key),
      false,
      `staff projection exposed ${key}`
    );
  }
  assert.equal(customer.revision, 3);
  assert.equal(customer.status, "proposed");
  assert.equal(customer.assigned, true);
  assert.equal(Object.hasOwn(customer, "assignedLawyer"), false);
  assert.equal(JSON.stringify(customer).includes("lawyer@example.com"), false);
  assert.equal(
    consultationRequestView({ ...record, assignedLawyerUserId: null }).assigned,
    false
  );
  assert.deepEqual(staff.customer, {
    id: record.userId,
    email: "customer@example.com",
  });
  assert.deepEqual(staff.assignedLawyer, {
    id: assignedLawyerId,
    email: "lawyer@example.com",
  });
});
