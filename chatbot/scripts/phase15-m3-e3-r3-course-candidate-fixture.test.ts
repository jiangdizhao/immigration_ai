import assert from "node:assert/strict";
import { test } from "node:test";
import { boundCourseResearchResultSchema } from "../lib/workspace/course-research";
import type { WorkflowTaskProjectionV1 } from "../lib/workspace/project-workflows";
import {
  assertR3HttpStatus,
  buildR3CourseCandidateEnvelope,
} from "./phase15-m3-e3-r1-postgres-acceptance";

const projectId = "11111111-1111-4111-8111-111111111111";
const chatId = "22222222-2222-4222-8222-222222222222";
const schoolId = "33333333-3333-4333-8333-333333333333";
const assistantMessageId = "44444444-4444-4444-8444-444444444444";
const candidateId = "55555555-5555-4555-8555-555555555555";

const task = {
  taskId: `school_application:school_discovery:${schoolId}`,
  workflowKind: "school_application",
  definitionVersion: "phase15.project-workflows.v1",
  projectId,
  stepKey: "school_discovery",
  targetKind: "school_application",
  targetId: schoolId,
  applicability: "applicable",
  progress: "in_progress",
  responsibleActor: "customer",
  reasonCodes: [],
  dependencies: [],
  dependencySemantics: "none",
  sourceRevision: 2,
  sourceRevisions: [
    { targetKind: "school_application", targetId: schoolId, revision: 2 },
  ],
  actionability: "read_only",
  panelKind: "school",
  progressCreditKey: null,
  progressCreditOwner: true,
} as WorkflowTaskProjectionV1;

test("R3 fixture preserves observation instant and validates the full production envelope", () => {
  const observedAt = new Date("2026-11-24T09:22:33.326Z");
  const envelope = buildR3CourseCandidateEnvelope({
    chatId,
    task,
    institutionName: "Synthetic University R3 New",
    courseTitle: "Synthetic Selected Course R3",
    observedAt,
    assistantMessageId,
    candidateId,
  });

  assert.equal(envelope.observedAt, "2026-11-24T09:22:33.326000Z");
  assert.equal(Date.parse(envelope.observedAt), observedAt.getTime());
  assert.equal(envelope.assistantMessageId, assistantMessageId);
  assert.equal(envelope.candidates[0]?.candidateId, candidateId);
  assert.deepEqual(
    boundCourseResearchResultSchema.safeParse(envelope).success,
    true
  );
});

test("R3 fixture fails closed before persistence when the timestamp is invalid", () => {
  assert.throws(
    () =>
      buildR3CourseCandidateEnvelope({
        chatId,
        task,
        institutionName: "Synthetic University R3 New",
        courseTitle: "Synthetic Selected Course R3",
        observedAt: new Date(Number.NaN),
        assistantMessageId,
        candidateId,
      }),
    /Invalid time value/u
  );
});

test("unexpected R3 HTTP statuses report only the sanitized application error code", async () => {
  const secret = "confirmation-token-must-not-be-logged";
  const response = Response.json(
    { error: "candidate_not_current_or_not_found", confirmationToken: secret },
    { status: 409 }
  );

  await assert.rejects(
    assertR3HttpStatus(response, 200, "course_selection", "preview"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        "PG-E3 scenario=course_selection stage=preview expected_http=200 actual_http=409 application_error_code=candidate_not_current_or_not_found"
      );
      assert.equal(error.message.includes(secret), false);
      return true;
    }
  );
});

test("R3 status diagnostics replace unsafe application error text", async () => {
  const response = Response.json(
    { error: "private token value: do not expose" },
    { status: 503 }
  );
  await assert.rejects(
    assertR3HttpStatus(response, 200, "course_selection", "confirmation"),
    /application_error_code=unavailable$/u
  );
});
