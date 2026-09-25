import assert from "node:assert/strict";
import test from "node:test";
import {
  createConsultationSchema,
  customerActionSchema,
  lawyerActionSchema,
  MAX_PREFERRED_HORIZON_MS,
  MAX_WINDOW_DURATION_MS,
  staffActionSchema,
  validateCreateInput,
  validateProposalInterval,
} from "./validation";

const now = new Date("2026-09-25T00:00:00.000Z");
const input = (
  windows: Array<{ startAt: string; endAt: string }>,
  extra: Record<string, unknown> = {}
) => ({
  customerTimezone: "Australia/Sydney",
  preferredWindows: windows,
  methodPreference: "no_preference" as const,
  ...extra,
});
const future = (hours: number) =>
  new Date(now.getTime() + hours * 3_600_000).toISOString();

test("consultation schema requires one to three strictly shaped windows", () => {
  const one = [{ startAt: future(48), endAt: future(49) }];
  assert.equal(createConsultationSchema.safeParse(input(one)).success, true);
  assert.equal(createConsultationSchema.safeParse(input([])).success, false);
  assert.equal(
    createConsultationSchema.safeParse(input([...one, ...one, ...one, ...one]))
      .success,
    false
  );
  assert.equal(
    createConsultationSchema.safeParse({
      ...input(one),
      legalMatterId: "attacker",
    }).success,
    false
  );
  assert.equal(
    createConsultationSchema.safeParse({
      ...input(one),
      assignedLawyerUserId: "00000000-0000-4000-8000-000000000000",
    }).success,
    false
  );
  assert.equal(
    createConsultationSchema.safeParse({
      ...input(one),
      scheduledStartAt: future(50),
    }).success,
    false
  );
});

test("timezone, method, and bounded notes are validated", () => {
  const one = [{ startAt: future(48), endAt: future(49) }];
  assert.equal(
    validateCreateInput(input(one, { customerTimezone: "Mars/Olympus" }), now)
      .ok,
    false
  );
  assert.equal(
    createConsultationSchema.safeParse(
      input(one, { methodPreference: "teleport" })
    ).success,
    false
  );
  assert.equal(
    createConsultationSchema.safeParse(
      input(one, { customerNote: "x".repeat(2001) })
    ).success,
    false
  );
});

test("windows reject reverse, past, duplicate and overlapping intervals", () => {
  const reverse = [{ startAt: future(49), endAt: future(48) }];
  const past = [{ startAt: now.toISOString(), endAt: future(2) }];
  const a = { startAt: future(48), endAt: future(50) };
  const duplicate = [a, { ...a }];
  const overlap = [a, { startAt: future(49), endAt: future(51) }];
  for (const windows of [reverse, past, duplicate, overlap]) {
    const parsed = createConsultationSchema.safeParse(input(windows));
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(validateCreateInput(parsed.data, now).ok, false);
    }
  }
});

test("technical preferred-window bounds are explicit and staff proposals have no invented duration", () => {
  assert.equal(MAX_WINDOW_DURATION_MS, 8 * 60 * 60 * 1000);
  assert.equal(MAX_PREFERRED_HORIZON_MS, 180 * 24 * 60 * 60 * 1000);
  assert.equal(
    validateProposalInterval(new Date(1), new Date(3_600_000), new Date(0)),
    true
  );
  assert.equal(
    validateProposalInterval(new Date(1), new Date(1), new Date(0)),
    false
  );
  assert.equal(
    validateProposalInterval(
      new Date(1),
      new Date(MAX_WINDOW_DURATION_MS + 2),
      new Date(0)
    ),
    true
  );
});

test("staff action schemas reject customer and lawyer field escalation", () => {
  const stamp = "2026-09-25T00:00:00.000Z";
  assert.equal(
    lawyerActionSchema.safeParse({
      action: "assign",
      expectedUpdatedAt: stamp,
      assignedLawyerUserId: "00000000-0000-4000-8000-000000000000",
    }).success,
    false
  );
  assert.equal(
    staffActionSchema.safeParse({
      action: "propose",
      expectedUpdatedAt: stamp,
      startAt: future(50),
      endAt: future(51),
      scheduledMethod: "video",
      meetingInstructions: "x".repeat(2001),
    }).success,
    false
  );
});

test("customer create strictly rejects every staff-controlled scheduling field", () => {
  const one = [{ startAt: future(48), endAt: future(49) }];
  const attempts = [
    { legalMatterId: "matter" },
    { assignedLawyerUserId: "00000000-0000-4000-8000-000000000000" },
    { scheduledStartAt: future(50) },
    { scheduledEndAt: future(51) },
    { scheduledMethod: "video" },
    { meetingInstructions: "private instructions" },
    { proposedAt: future(50) },
    { status: "confirmed" },
  ];
  for (const fields of attempts) {
    assert.equal(
      createConsultationSchema.safeParse({ ...input(one), ...fields }).success,
      false
    );
  }
});

test("customer actions require a positive integer row revision", () => {
  assert.equal(
    customerActionSchema.safeParse({ action: "confirm", expectedRevision: 1 })
      .success,
    true
  );
  assert.equal(
    customerActionSchema.safeParse({ action: "confirm", expectedRevision: 0 })
      .success,
    false
  );
  assert.equal(
    customerActionSchema.safeParse({ action: "confirm", expectedRevision: 1.5 })
      .success,
    false
  );
  assert.equal(
    customerActionSchema.safeParse({
      action: "confirm",
      expectedUpdatedAt: "2026-09-25T00:00:00.000Z",
    }).success,
    false
  );
});
