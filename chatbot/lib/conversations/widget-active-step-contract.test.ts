import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWidgetTurnRequestBody } from "./widget-turn-request";
import {
  fastWidgetRequestSchema,
  legalCheckWidgetRequestSchema,
  premiumWidgetRequestSchema,
} from "./widget-turn-schemas";

const selection = {
  schemaVersion: "phase15.active-step-selection.v1",
  projectId: "123e4567-e89b-42d3-a456-426614174000",
  taskId:
    "phase15.project-workflows.v1:school_application:school_discovery:school_application:abc",
  workflowKind: "school_application",
  definitionVersion: "phase15.project-workflows.v1",
  stepKey: "school_discovery",
  targetKind: "school_application",
  targetId: "123e4567-e89b-42d3-a456-426614174001",
  sourceRevisions: [
    {
      targetKind: "school_application",
      targetId: "123e4567-e89b-42d3-a456-426614174001",
      revision: 8,
    },
  ],
};

test("the same bounded ActiveStep selection crosses Fast, Default and Premium request schemas", () => {
  const shared = {
    id: "123e4567-e89b-42d3-a456-426614174002",
    messages: [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Find course options" }],
      },
    ],
    activeStepSelection: selection,
  };
  assert.equal(
    fastWidgetRequestSchema.safeParse({ ...shared, assistantMode: "fast" })
      .success,
    true
  );
  assert.equal(
    legalCheckWidgetRequestSchema.safeParse({
      ...shared,
      selectedChatModel: "model",
      assistantMode: "default",
    }).success,
    true
  );
  assert.equal(
    premiumWidgetRequestSchema.safeParse({
      ...shared,
      assistantMode: "premium",
    }).success,
    true
  );
});

test("malformed or old-version ActiveStep hints are rejected and request construction preserves exact revisions", () => {
  const malformed = { ...selection, definitionVersion: "old" };
  const body = {
    id: "123e4567-e89b-42d3-a456-426614174002",
    messages: [
      { id: "m1", role: "user", parts: [{ type: "text", text: "question" }] },
    ],
    activeStepSelection: malformed,
  };
  assert.equal(
    fastWidgetRequestSchema.safeParse({ ...body, assistantMode: "fast" })
      .success,
    false
  );

  const built = buildWidgetTurnRequestBody({
    conversationId: "123e4567-e89b-42d3-a456-426614174002",
    matterId: null,
    intakeFacts: {},
    currentIntakeFacts: {},
    answerPreference: "answer_first",
    assistantMode: "fast",
    policySlug: null,
    messages: [{ id: "m1", role: "user", text: "question" }],
    activeStepSelection: selection as never,
  });
  assert.deepEqual(
    built.activeStepSelection?.sourceRevisions,
    selection.sourceRevisions
  );
  const noSelection = buildWidgetTurnRequestBody({
    conversationId: "123e4567-e89b-42d3-a456-426614174002",
    matterId: null,
    intakeFacts: {},
    currentIntakeFacts: {},
    answerPreference: "answer_first",
    assistantMode: "fast",
    policySlug: null,
    messages: [{ id: "m1", role: "user", text: "question" }],
  });
  assert.equal("activeStepSelection" in noSelection, false);
});
