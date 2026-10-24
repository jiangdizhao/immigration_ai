import assert from "node:assert/strict";
import { test } from "node:test";
import {
  projectChatIdentifierRequiresScopedIngress,
  projectChatWritesEnabled,
} from "./chat-policy";

test("Project Chat writes are disabled unless explicitly enabled", () => {
  assert.equal(projectChatWritesEnabled(undefined), false);
  assert.equal(projectChatWritesEnabled("false"), false);
  assert.equal(projectChatWritesEnabled(" true "), true);
});

test("Project Chat identifiers cannot be submitted through unscoped ingress", () => {
  assert.equal(
    projectChatIdentifierRequiresScopedIngress({
      projectChatIds: ["project-chat"],
    }),
    true
  );
  assert.equal(
    projectChatIdentifierRequiresScopedIngress({
      projectChatIds: ["project-chat"],
      frontendChatId: "project-chat",
    }),
    false
  );
  assert.equal(
    projectChatIdentifierRequiresScopedIngress({
      projectChatIds: ["project-chat", "another-project-chat"],
      frontendChatId: "project-chat",
    }),
    true
  );
});
