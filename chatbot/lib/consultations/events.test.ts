import assert from "node:assert/strict";
import test from "node:test";
import { buildConsultationEvent, type ConsultationEventInput } from "./events";

const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  role: "admin" as const,
};
const stamp = "2026-10-01T10:00:00.000Z";
const base = (
  eventType: ConsultationEventInput["eventType"],
  fromStatus: ConsultationEventInput["fromStatus"],
  toStatus: ConsultationEventInput["toStatus"],
  role: "customer" | "lawyer" | "admin" = "admin"
): ConsultationEventInput => ({
  requestId: "00000000-0000-4000-8000-000000000002",
  actor: { id: actor.id, role },
  eventType,
  fromStatus,
  toStatus,
});

test("event builder captures each lifecycle transition without database access", () => {
  const cases: ConsultationEventInput[] = [
    base("created", null, "requested", "customer"),
    {
      ...base("assigned", "requested", "requested"),
      metadata: {
        previousAssignedLawyerUserId: null,
        assignedLawyerUserId: actor.id,
      },
    },
    {
      ...base("unassigned", "requested", "requested"),
      metadata: {
        previousAssignedLawyerUserId: actor.id,
        assignedLawyerUserId: null,
      },
    },
    {
      ...base("proposed", "requested", "proposed"),
      metadata: {
        startAt: stamp,
        endAt: "2026-10-01T11:00:00.000Z",
        scheduledMethod: "video",
      },
    },
    {
      ...base("proposed", "proposed", "proposed"),
      metadata: {
        startAt: stamp,
        endAt: "2026-10-01T11:30:00.000Z",
        scheduledMethod: "phone",
      },
    },
    {
      ...base("proposed", "confirmed", "proposed"),
      metadata: {
        startAt: stamp,
        endAt: "2026-10-01T12:00:00.000Z",
        scheduledMethod: "other",
      },
    },
    base("confirmed", "proposed", "confirmed", "customer"),
    {
      ...base("reschedule_requested", "proposed", "requested", "customer"),
      metadata: {
        priorProposalCleared: true,
        priorStartAt: stamp,
        priorEndAt: "2026-10-01T11:00:00.000Z",
        priorScheduledMethod: "video",
      },
    },
    base("cancelled", "requested", "cancelled", "customer"),
    base("cancelled", "proposed", "cancelled", "admin"),
    base("cancelled", "confirmed", "cancelled", "lawyer"),
    base("completed", "confirmed", "completed", "admin"),
  ];

  for (const input of cases) {
    const row = buildConsultationEvent(input);
    assert.equal(row.eventType, input.eventType);
    assert.equal(row.fromStatus, input.fromStatus);
    assert.equal(row.toStatus, input.toStatus);
    assert.equal(row.actorRole, input.actor?.role);
  }
});

test("event metadata is restricted to bounded scheduling transition facts", () => {
  const row = buildConsultationEvent({
    ...base("proposed", "requested", "proposed"),
    metadata: {
      startAt: stamp,
      endAt: "2026-10-01T11:00:00.000Z",
      scheduledMethod: "video",
      rawChatContent: "private chat text",
      matterDocumentText: "private document text",
      providerPayload: { token: "secret" },
      password: "secret",
      meetingInstructions: "not copied into event metadata",
    },
  });
  assert.deepEqual(row.metadata, {
    startAt: stamp,
    endAt: "2026-10-01T11:00:00.000Z",
    scheduledMethod: "video",
  });
  assert.ok(JSON.stringify(row.metadata).length < 256);

  const reschedule = buildConsultationEvent({
    ...base("reschedule_requested", "proposed", "requested", "customer"),
    metadata: {
      priorProposalCleared: true,
      priorStartAt: stamp,
      priorEndAt: "2026-10-01T11:00:00.000Z",
      priorScheduledMethod: "video",
      rawChatContent: "private",
    },
  });
  assert.deepEqual(reschedule.metadata, {
    priorProposalCleared: true,
    priorStartAt: stamp,
    priorEndAt: "2026-10-01T11:00:00.000Z",
    priorScheduledMethod: "video",
  });
  assert.ok(JSON.stringify(reschedule.metadata).length < 256);
});

test("event builder strips malformed or oversized metadata values", () => {
  const row = buildConsultationEvent({
    ...base("assigned", "requested", "requested"),
    metadata: {
      previousAssignedLawyerUserId: "x".repeat(1000),
      assignedLawyerUserId: "lawyer-id",
      arbitrary: "ignored",
    },
  });
  assert.deepEqual(row.metadata, {
    previousAssignedLawyerUserId: null,
    assignedLawyerUserId: "lawyer-id",
  });
});
