import assert from "node:assert/strict";
import test from "node:test";
import type { ConsultationStatus } from "@/lib/db/schema";
import { getConsultationStaffCopy } from "./staff-copy";
import {
  adminAssignmentControlsVisible,
  adminConsultationActions,
  consultationStaffUrl,
  isConsultationSchemaUnavailable,
  lawyerAssignmentControlsVisible,
  lawyerConsultationActions,
  proposalDraftMetadata,
  runConsultationStaffMutation,
  staffLocalDateTimeToIso,
} from "./staff-ui";

const statuses: ConsultationStatus[] = [
  "requested",
  "proposed",
  "confirmed",
  "completed",
  "cancelled",
];

test("admin actions follow consultation status and assignment state", () => {
  assert.deepEqual(adminConsultationActions("requested", false), [
    "assign",
    "unassign",
    "cancel",
  ]);
  assert.deepEqual(adminConsultationActions("requested", true), [
    "assign",
    "unassign",
    "propose",
    "cancel",
  ]);
  assert.deepEqual(adminConsultationActions("proposed", true), [
    "propose",
    "cancel",
  ]);
  assert.deepEqual(adminConsultationActions("confirmed", true), [
    "propose",
    "cancel",
    "complete",
  ]);
  for (const status of ["completed", "cancelled"] as const) {
    assert.deepEqual(adminConsultationActions(status, true), []);
  }
});

test("lawyer actions follow status and never include assignment controls", () => {
  assert.deepEqual(lawyerConsultationActions("requested"), [
    "propose",
    "cancel",
  ]);
  assert.deepEqual(lawyerConsultationActions("proposed"), [
    "propose",
    "cancel",
  ]);
  assert.deepEqual(lawyerConsultationActions("confirmed"), [
    "propose",
    "cancel",
    "complete",
  ]);
  for (const status of ["completed", "cancelled"] as const) {
    assert.deepEqual(lawyerConsultationActions(status), []);
  }
  for (const _status of statuses) {
    assert.equal(lawyerAssignmentControlsVisible(), false);
  }
});

test("admin assignment controls are visible only while requested", () => {
  assert.equal(adminAssignmentControlsVisible("requested"), true);
  for (const status of statuses.filter((value) => value !== "requested")) {
    assert.equal(adminAssignmentControlsVisible(status), false);
  }
});

test("staff local date conversion uses the explicit IANA zone, not the CI machine zone", () => {
  assert.equal(
    staffLocalDateTimeToIso("2026-01-05T10:00", "Australia/Sydney"),
    "2026-01-04T23:00:00.000Z"
  );
  assert.equal(
    staffLocalDateTimeToIso("2026-01-05T10:00", "UTC"),
    "2026-01-05T10:00:00.000Z"
  );
  assert.equal(staffLocalDateTimeToIso("not-a-date", "Australia/Sydney"), null);
  assert.equal(staffLocalDateTimeToIso("2026-02-30T10:00", "UTC"), null);
  assert.equal(
    staffLocalDateTimeToIso("2026-01-05T10:00", "Invalid/Zone"),
    null
  );
  assert.equal(staffLocalDateTimeToIso("2026-01-05T10:00", null), null);
});

test("consultation links stay in role-specific route namespaces", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  assert.equal(consultationStaffUrl("customer", id), `/consultations/${id}`);
  assert.equal(
    consultationStaffUrl("lawyer", id),
    `/lawyer-portal/consultations/${id}`
  );
  assert.equal(
    consultationStaffUrl("staff", id),
    `/admin-portal/consultations/${id}`
  );
  assert.equal(
    consultationStaffUrl("lawyer", "id/other"),
    "/lawyer-portal/consultations/id%2Fother"
  );
});

test("schema unavailable is distinct from a successful empty queue", () => {
  assert.equal(
    isConsultationSchemaUnavailable(503, {
      code: "consultation_schema_unavailable",
    }),
    true
  );
  assert.equal(
    isConsultationSchemaUnavailable(200, { consultations: [] }),
    false
  );
  assert.equal(
    isConsultationSchemaUnavailable(503, { error: "database unavailable" }),
    false
  );
});

test("staff 409 performs one refetch and never retries the mutation", async () => {
  let sends = 0;
  let refetches = 0;
  const result = await runConsultationStaffMutation(
    () => {
      sends += 1;
      return Promise.resolve(new Response(null, { status: 409 }));
    },
    () => {
      refetches += 1;
      return Promise.resolve();
    }
  );
  assert.equal(result.kind, "conflict");
  assert.equal(sends, 1);
  assert.equal(refetches, 1);
});

test("re-proposal drafts preserve existing method and instructions", () => {
  assert.deepEqual(
    proposalDraftMetadata({
      scheduledMethod: "phone",
      meetingInstructions: "Call on arrival.",
    }),
    { scheduledMethod: "phone", meetingInstructions: "Call on arrival." }
  );
  assert.deepEqual(
    proposalDraftMetadata({
      scheduledMethod: "other",
      meetingInstructions: "Bring documents.",
    }),
    { scheduledMethod: "other", meetingInstructions: "Bring documents." }
  );
  assert.deepEqual(
    proposalDraftMetadata({ scheduledMethod: null, meetingInstructions: null }),
    { scheduledMethod: "video", meetingInstructions: "" }
  );
  assert.deepEqual(
    proposalDraftMetadata({
      scheduledMethod: undefined,
      meetingInstructions: undefined,
    }),
    { scheduledMethod: "video", meetingInstructions: "" }
  );
});

test("staff consultation copy follows the persisted Chinese/English locale", () => {
  assert.equal(
    getConsultationStaffCopy("zh-CN").schedulingLabel,
    "咨询预约安排"
  );
  assert.equal(
    getConsultationStaffCopy("en").schedulingLabel,
    "Consultation scheduling"
  );
  assert.match(
    getConsultationStaffCopy("en").preferences,
    /preferences only, not availability/
  );
});
