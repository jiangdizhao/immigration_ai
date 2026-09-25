import assert from "node:assert/strict";
import test from "node:test";
import {
  consultationRevisionMatches,
  customerLifecycleTimestamps,
  hasScheduleConflict,
  intervalsOverlap,
  validateTransition,
} from "./state";

const transitionTo = (
  role: "customer" | "lawyer" | "admin",
  status: "requested" | "proposed" | "confirmed" | "completed" | "cancelled",
  action: Parameters<typeof validateTransition>[2]
) => {
  const result = validateTransition(role, status, action);
  return result.ok ? result.toStatus : null;
};

test("consultation lifecycle and authorized side paths", () => {
  assert.equal(transitionTo("customer", "requested", "create"), "requested");
  assert.equal(transitionTo("admin", "requested", "propose"), "proposed");
  assert.equal(transitionTo("lawyer", "proposed", "propose"), "proposed");
  assert.equal(transitionTo("admin", "confirmed", "propose"), "proposed");
  assert.equal(transitionTo("customer", "proposed", "confirm"), "confirmed");
  assert.equal(
    transitionTo("customer", "proposed", "request_reschedule"),
    "requested"
  );
  assert.equal(transitionTo("admin", "confirmed", "complete"), "completed");
  for (const status of ["requested", "proposed", "confirmed"] as const) {
    assert.equal(transitionTo("customer", status, "cancel"), "cancelled");
  }
  assert.equal(transitionTo("admin", "completed", "cancel"), null);
  assert.equal(transitionTo("admin", "cancelled", "propose"), null);
  assert.equal(transitionTo("lawyer", "requested", "assign"), null);
  assert.equal(transitionTo("customer", "requested", "propose"), null);
});

test("customer lifecycle timestamps preserve confirmation when cancelling", () => {
  const confirmedAt = new Date("2026-09-25T10:00:00.000Z");
  const cancelledAt = new Date("2026-09-26T10:00:00.000Z");

  assert.deepEqual(
    customerLifecycleTimestamps(
      { confirmedAt, cancelledAt: null },
      "cancel",
      cancelledAt
    ),
    { confirmedAt, cancelledAt }
  );
  assert.deepEqual(
    customerLifecycleTimestamps(
      { confirmedAt: null, cancelledAt: null },
      "confirm",
      confirmedAt
    ),
    { confirmedAt, cancelledAt: null }
  );
  assert.deepEqual(
    customerLifecycleTimestamps(
      { confirmedAt, cancelledAt: null },
      "request_reschedule",
      cancelledAt
    ),
    { confirmedAt: null, cancelledAt: null }
  );
});

test("half-open overlap allows adjacent intervals", () => {
  const start = new Date("2026-10-01T10:00:00Z");
  const end = new Date("2026-10-01T11:00:00Z");
  const adjacent = new Date("2026-10-01T11:00:00Z");
  assert.equal(
    intervalsOverlap(start, end, adjacent, new Date("2026-10-01T12:00:00Z")),
    false
  );
  assert.equal(
    intervalsOverlap(
      start,
      end,
      new Date("2026-10-01T10:30:00Z"),
      new Date("2026-10-01T11:30:00Z")
    ),
    true
  );
});

test("overlap policy rejects every half-open overlap shape", () => {
  const proposal = {
    requestId: "current",
    lawyerId: "lawyer-a",
    startAt: new Date("2026-10-01T10:00:00Z"),
    endAt: new Date("2026-10-01T11:00:00Z"),
  };
  const candidate = (
    id: string,
    lawyerId: string,
    status: "proposed" | "confirmed" | "cancelled" | "completed",
    start: string,
    end: string
  ) => ({
    id,
    assignedLawyerUserId: lawyerId,
    status,
    scheduledStartAt: new Date(start),
    scheduledEndAt: new Date(end),
  });
  const overlaps = [
    candidate(
      "other",
      "lawyer-a",
      "proposed",
      "2026-10-01T10:30:00Z",
      "2026-10-01T11:30:00Z"
    ),
    candidate(
      "other",
      "lawyer-a",
      "confirmed",
      "2026-10-01T10:15:00Z",
      "2026-10-01T10:45:00Z"
    ),
    candidate(
      "other",
      "lawyer-a",
      "proposed",
      "2026-10-01T09:00:00Z",
      "2026-10-01T12:00:00Z"
    ),
    candidate(
      "other",
      "lawyer-a",
      "confirmed",
      "2026-10-01T10:00:00Z",
      "2026-10-01T11:00:00Z"
    ),
  ];
  for (const item of overlaps) {
    assert.equal(hasScheduleConflict([item], proposal), true);
  }
});

test("overlap policy allows adjacent slots and ignores different lawyers, terminal history, and self", () => {
  const proposal = {
    requestId: "current",
    lawyerId: "lawyer-a",
    startAt: new Date("2026-10-01T10:00:00Z"),
    endAt: new Date("2026-10-01T11:00:00Z"),
  };
  const candidate = (
    id: string,
    lawyerId: string,
    status: "proposed" | "confirmed" | "cancelled" | "completed",
    start: string,
    end: string
  ) => ({
    id,
    assignedLawyerUserId: lawyerId,
    status,
    scheduledStartAt: new Date(start),
    scheduledEndAt: new Date(end),
  });
  const cases = [
    candidate(
      "adjacent",
      "lawyer-a",
      "proposed",
      "2026-10-01T11:00:00Z",
      "2026-10-01T12:00:00Z"
    ),
    candidate(
      "other-lawyer",
      "lawyer-b",
      "confirmed",
      "2026-10-01T10:15:00Z",
      "2026-10-01T10:45:00Z"
    ),
    candidate(
      "cancelled",
      "lawyer-a",
      "cancelled",
      "2026-10-01T10:15:00Z",
      "2026-10-01T10:45:00Z"
    ),
    candidate(
      "completed",
      "lawyer-a",
      "completed",
      "2026-10-01T10:15:00Z",
      "2026-10-01T10:45:00Z"
    ),
    candidate(
      "current",
      "lawyer-a",
      "confirmed",
      "2026-10-01T10:15:00Z",
      "2026-10-01T10:45:00Z"
    ),
  ];
  for (const item of cases) {
    assert.equal(hasScheduleConflict([item], proposal), false);
  }
});

test("a stale confirmation revision is rejected even when timestamps share one JS millisecond", () => {
  const firstPgTimestamp = new Date("2026-09-25T01:02:03.123100Z");
  const replacementPgTimestamp = new Date("2026-09-25T01:02:03.123900Z");
  assert.equal(firstPgTimestamp.getTime(), replacementPgTimestamp.getTime());
  assert.equal(
    firstPgTimestamp.toISOString(),
    replacementPgTimestamp.toISOString()
  );
  assert.equal(consultationRevisionMatches(8, 8), true);
  assert.equal(consultationRevisionMatches(9, 8), false);
});
