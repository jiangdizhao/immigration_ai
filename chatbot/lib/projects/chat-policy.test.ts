import assert from "node:assert/strict";
import { test } from "node:test";
import {
  projectChatIdentifierRequiresScopedIngress,
  projectChatWritesEnabled,
} from "./chat-policy";

test("Project Chat writes are enabled by default and only an explicit disable wins", () => {
  // Phase 13 P1: an unset flag must not hide Project creation or Project Chat.
  assert.equal(projectChatWritesEnabled(undefined), true);
  assert.equal(projectChatWritesEnabled(""), true);
  assert.equal(projectChatWritesEnabled(" true "), true);
  assert.equal(projectChatWritesEnabled("TRUE"), true);
  for (const disabled of ["false", "FALSE", "0", "off", "no", "disabled"]) {
    assert.equal(projectChatWritesEnabled(disabled), false);
  }
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
