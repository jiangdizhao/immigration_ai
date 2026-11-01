import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isProjectWorkspaceView,
  nextProjectWorkspaceView,
  PROJECT_WORKSPACE_VIEWS,
  projectSwitchClearsConversation,
  workspaceUrlWithoutChat,
} from "./project-workspace-view";

const projectA = "11111111-1111-4111-8111-111111111111";
const projectB = "22222222-2222-4222-8222-222222222222";

test("only the three authorized Project sections are recognized", () => {
  assert.deepEqual(
    [...PROJECT_WORKSPACE_VIEWS],
    ["home", "applications", "admissions"]
  );
  for (const view of PROJECT_WORKSPACE_VIEWS) {
    assert.equal(isProjectWorkspaceView(view), true);
  }
  for (const value of ["", "documents", "review", "HOME", null, 1, undefined]) {
    assert.equal(isProjectWorkspaceView(value), false);
  }
});

test("a Project switch or a cleared selection always returns to the Project home", () => {
  // Staying on the same Project keeps the section the user chose.
  assert.equal(
    nextProjectWorkspaceView({
      current: "admissions",
      previousProjectId: projectA,
      nextProjectId: projectA,
    }),
    "admissions"
  );
  // A different Project must never inherit the previous Project's section, so
  // Project B cannot open on a form whose data belongs to Project A.
  assert.equal(
    nextProjectWorkspaceView({
      current: "applications",
      previousProjectId: projectA,
      nextProjectId: projectB,
    }),
    "home"
  );
  assert.equal(
    nextProjectWorkspaceView({
      current: "admissions",
      previousProjectId: projectA,
      nextProjectId: null,
    }),
    "home"
  );
  // The first selection also starts on the home section.
  assert.equal(
    nextProjectWorkspaceView({
      current: "admissions",
      previousProjectId: null,
      nextProjectId: projectA,
    }),
    "home"
  );
});

test("a Project switch drops the previous Project Chat but keeps Standalone chats", () => {
  // Moving A → B with A's Project Chat active must clear that Chat identity.
  assert.equal(
    projectSwitchClearsConversation({
      previousProjectId: projectA,
      nextProjectId: projectB,
      conversationOrigin: "project",
    }),
    true
  );
  // Clearing the selection also drops the Project Chat.
  assert.equal(
    projectSwitchClearsConversation({
      previousProjectId: projectA,
      nextProjectId: null,
      conversationOrigin: "project",
    }),
    true
  );
  // Re-selecting the same Project keeps its Chat active.
  assert.equal(
    projectSwitchClearsConversation({
      previousProjectId: projectA,
      nextProjectId: projectA,
      conversationOrigin: "project",
    }),
    false
  );
  // A Standalone conversation is not Project data and is preserved.
  for (const conversationOrigin of ["immigration", "legacy_chat"] as const) {
    assert.equal(
      projectSwitchClearsConversation({
        previousProjectId: projectA,
        nextProjectId: projectB,
        conversationOrigin,
      }),
      false
    );
  }
  // An inconsistent state (a Project Chat with no recorded selection) is also
  // dropped rather than allowed to leak into the newly selected Project.
  assert.equal(
    projectSwitchClearsConversation({
      previousProjectId: null,
      nextProjectId: projectB,
      conversationOrigin: "project",
    }),
    true
  );
});

test("returning to a Project home removes the active chat and launch parameters only", () => {
  const cleaned = new URL(
    workspaceUrlWithoutChat(
      "http://localhost:3000/ai-workspace?chatId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&launch=policy&policy=skilled-visa&tab=2"
    )
  );
  assert.equal(cleaned.pathname, "/ai-workspace");
  assert.equal(cleaned.searchParams.get("chatId"), null);
  assert.equal(cleaned.searchParams.get("launch"), null);
  // Unrelated parameters survive, so a policy context is not silently dropped.
  assert.equal(cleaned.searchParams.get("policy"), "skilled-visa");
  assert.equal(cleaned.searchParams.get("tab"), "2");

  // A URL that never had a chat parameter stays usable.
  assert.equal(
    new URL(workspaceUrlWithoutChat("http://localhost:3000/ai-workspace"))
      .search,
    ""
  );
});
