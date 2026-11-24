import assert from "node:assert/strict";
import { test } from "node:test";
import {
  courseResearchWorkspaceContextKey,
  projectActionProposalContextKey,
} from "./action-proposal-context-key";
import type { WorkflowTaskProjectionV1 } from "./project-workflows";

const baseTask: WorkflowTaskProjectionV1 = {
  actionability: "unavailable",
  applicability: "unavailable",
  definitionVersion: "phase15.project-workflows.v1",
  dependencies: [],
  dependencySemantics: "none",
  panelKind: "school",
  progress: "needs_information",
  progressCreditKey: null,
  progressCreditOwner: false,
  projectId: "project-a",
  reasonCodes: ["school_course_source_unverified"],
  responsibleActor: "customer",
  sourceRevision: 4,
  sourceRevisions: [
    { targetKind: "school_application", targetId: "school-a", revision: 4 },
  ],
  stepKey: "school_discovery",
  targetId: "school-a",
  targetKind: "school_application",
  taskId: "school-task-a",
  workflowKind: "school_application",
};

const key = (
  task: WorkflowTaskProjectionV1 = baseTask,
  chatId: string | null = "chat-a",
  projectId = "project-a"
) => projectActionProposalContextKey({ chatId, projectId, task });

test("proposal context key changes for Chat, Project, task, target and revisions", () => {
  const original = key();
  assert.notEqual(key(baseTask, "chat-b"), original);
  assert.notEqual(key(baseTask, "chat-a", "project-b"), original);
  assert.notEqual(key({ ...baseTask, taskId: "school-task-b" }), original);
  const otherSchool = {
    ...baseTask,
    targetId: "school-b",
    taskId: "school-task-b",
    sourceRevisions: [
      {
        targetKind: "school_application" as const,
        targetId: "school-b",
        revision: 4,
      },
    ],
  };
  assert.notEqual(key(otherSchool), original);
  const staleRevision = {
    ...baseTask,
    sourceRevision: 5,
    sourceRevisions: [
      {
        targetKind: "school_application" as const,
        targetId: "school-a",
        revision: 5,
      },
    ],
  };
  assert.notEqual(key(staleRevision), original);
  assert.equal(key({ ...baseTask }), original);
});

test("course research context also invalidates when its source message changes", () => {
  const courseKey = (researchAssistantMessageId: string | null) =>
    courseResearchWorkspaceContextKey({
      chatId: "chat-a",
      projectId: "project-a",
      task: baseTask,
      researchAssistantMessageId,
    });
  const original = courseKey("research-message-a");
  assert.notEqual(courseKey("research-message-b"), original);
  assert.notEqual(courseKey(null), original);
  assert.equal(courseKey("research-message-a"), original);
  assert.notEqual(
    courseResearchWorkspaceContextKey({
      chatId: "chat-b",
      projectId: "project-a",
      task: baseTask,
      researchAssistantMessageId: "research-message-a",
    }),
    original
  );
  assert.notEqual(
    courseResearchWorkspaceContextKey({
      chatId: "chat-a",
      projectId: "project-a",
      task: {
        ...baseTask,
        sourceRevisions: [
          {
            targetKind: "school_application",
            targetId: "school-a",
            revision: 5,
          },
        ],
      },
      researchAssistantMessageId: "research-message-a",
    }),
    original
  );
});
