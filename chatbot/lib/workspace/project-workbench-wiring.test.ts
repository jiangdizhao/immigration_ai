import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workspace = readFileSync(
  new URL("../../components/immigration-ai-workspace.tsx", import.meta.url),
  "utf8"
);
const splitter = readFileSync(
  new URL(
    "../../components/resizable-project-workspace-split.tsx",
    import.meta.url
  ),
  "utf8"
);
const splitterModel = readFileSync(
  new URL("./project-splitter.ts", import.meta.url),
  "utf8"
);
const navigationSplitter = readFileSync(
  new URL(
    "../../components/resizable-workspace-navigation-split.tsx",
    import.meta.url
  ),
  "utf8"
);
const navigationSplitterModel = readFileSync(
  new URL("./workspace-navigation-splitter.ts", import.meta.url),
  "utf8"
);
const projectEntry = readFileSync(
  new URL("../../components/project-entry-panel.tsx", import.meta.url),
  "utf8"
);

function section(start: string, end: string): string {
  const startIndex = workspace.indexOf(start);
  const endIndex = workspace.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex <= startIndex) {
    throw new Error(`missing section: ${start}`);
  }
  return workspace.slice(startIndex, endIndex);
}

test("the Project workspace uses one shared M1 read for workflow navigation, progress and the Task panel", () => {
  assert.equal(
    (workspace.match(/useProjectJourney\(selectedProjectId\)/gu) ?? []).length,
    1
  );
  assert.match(
    workspace,
    /ProjectWorkflowNavigation[\s\S]*?journeyLoad=\{projectJourneyResource\.load\}/u
  );
  assert.match(
    workspace,
    /ProjectWorkbenchHeader[\s\S]*?journeyLoad=\{projectJourneyResource\.load\}/u
  );
  assert.match(
    workspace,
    /ProjectTaskWorkspacePanel[\s\S]*?journeyLoad=\{projectJourneyResource\.load\}/u
  );
  assert.match(workspace, /onRefresh=\{projectJourneyResource\.refresh\}/u);
});

test("changing target or Project section does not reset the active chat, while a real Project switch clears it", () => {
  const target = section(
    "const handleSelectProjectTarget",
    "const returnToPreviousProjectView"
  );
  assert.match(target, /setSelectedProjectTargetId\(exactNodeId\)/u);
  assert.match(target, /setProjectView\("home"\)/u);
  assert.doesNotMatch(
    target,
    /resetProjectConversation|setMessages\(\[\]\)|setInput\(""\)|submitMessage/u
  );

  const taskSelection = section(
    "const handleSelectProjectWorkflowTask",
    "const returnToPreviousProjectView"
  );
  assert.match(taskSelection, /projectWorkbenchSelectionForWorkflowTask/u);
  assert.match(
    taskSelection,
    /setSelectedProjectWorkflowTaskId\(selection\.taskId\)/u
  );
  assert.doesNotMatch(
    taskSelection,
    /fetch\(|resetProjectConversation|setMessages\(\[\]\)|setInput\(""\)|submitMessage/u
  );

  const sectionNavigation = section(
    "const handleSelectProjectView",
    "const handleSelectProjectTarget"
  );
  assert.doesNotMatch(sectionNavigation, /resetProjectConversation/u);

  const projectSwitch = section(
    "const handleSelectedProjectChange",
    "const handleSelectProjectView"
  );
  assert.match(projectSwitch, /resetProjectConversation\(\)/u);
  assert.match(projectSwitch, /setInput\(""\)/u);
});

test("loading another Chat clears its draft only after the stale-response guard, while same-Chat refresh preserves it", () => {
  const loader = section(
    "const loadConversation = useCallback",
    "Phase 13 M9-A: open (or reopen) the actor's own conversation"
  );
  const staleResponseGuard = loader.indexOf("shouldApplyConversationDetail({");
  const draftClear = loader.indexOf(
    "if (conversationIdRef.current !== data.chatId)"
  );
  const chatAssignment = loader.indexOf(
    "conversationIdRef.current = data.chatId"
  );

  assert.ok(staleResponseGuard >= 0);
  assert.ok(draftClear > staleResponseGuard);
  assert.ok(chatAssignment > draftClear);
  assert.match(
    loader.slice(draftClear, chatAssignment),
    /if \(conversationIdRef\.current !== data\.chatId\) \{\s*setInput\(""\);\s*\}/u
  );
  assert.equal((loader.match(/setInput\(""\)/gu) ?? []).length, 1);
});

test("the Project shell mounts the existing Composer once and uses a neutral no-chat state", () => {
  assert.equal((workspace.match(/<WorkspaceChatComposer\b/gu) ?? []).length, 1);
  assert.match(
    workspace,
    /selectedProjectId && !isActiveSelectedProjectConversation/u
  );
  assert.match(workspace, /data-testid="project-chat-empty-state"/u);
  assert.match(workspace, /data-testid="open-project-conversations"/u);
  assert.match(
    workspace,
    /conversationOrigin === "project" &&[\s\S]*?conversationProjectId === selectedProjectId/u
  );
});

test("the responsive splitter keeps both surfaces mounted and supports keyboard and pointer resizing", () => {
  assert.match(workspace, /<ProjectWorkspaceSplitSeparator/u);
  assert.match(
    workspace,
    /isWideViewport \? \([\s\S]*?<ProjectWorkspaceSplitSeparator/u
  );
  assert.match(workspace, /hidden xl:flex/u);
  assert.match(
    workspace,
    /mobileProjectSurface === "chat" \? "flex" : "hidden xl:flex"/u
  );
  assert.match(
    workspace,
    /mobileProjectSurface === "task" \? "flex" : "hidden xl:flex"/u
  );
  assert.match(
    splitter,
    /localStorage\.getItem\(PROJECT_SPLITTER_PREFERENCE_KEY\)/u
  );
  assert.match(splitter, /localStorage\.setItem\(/u);
  assert.match(splitter, /role="separator"/u);
  assert.match(splitter, /aria-orientation="vertical"/u);
  assert.match(splitter, /cursor: "col-resize"/u);
  assert.match(splitter, /w-0\.5/u);
  assert.match(splitter, /hover:bg-blue-50/u);
  assert.match(splitter, /active:bg-blue-100/u);
  assert.match(splitter, /focus-visible:outline/u);
  assert.match(splitter, /touchAction: "none"/u);
  assert.match(splitter, /case "ArrowLeft"/u);
  assert.match(splitter, /case "Home"/u);
  assert.match(splitter, /onPointerDown\(event\)/u);
  assert.match(splitter, /onPointerMove\(event\)/u);
  assert.match(splitterModel, /PROJECT_SPLITTER_MIN_CENTER/u);
  assert.match(splitterModel, /PROJECT_SPLITTER_MIN_RIGHT/u);
});

test("the desktop splitter remains Project-only and is omitted from mobile rendering", () => {
  const splitterIndex = workspace.indexOf("<ProjectWorkspaceSplitSeparator");
  assert.ok(splitterIndex > 0);
  assert.match(
    workspace.slice(splitterIndex - 160, splitterIndex),
    /isWideViewport \? \(/u
  );
  assert.match(
    workspace,
    /selectedProjectId\n\s*\? "order-2 grid[\s\S]*?: "contents"/u
  );
  assert.match(splitter, /hidden[\s\S]*?xl:flex/u);
});

test("the independent left splitter reserves actual Project content and remains absent on mobile", () => {
  assert.equal(
    (workspace.match(/useResizableWorkspaceNavigationSplit\(/gu) ?? []).length,
    1
  );
  assert.match(workspace, /<WorkspaceNavigationSplitSeparator/u);
  assert.match(workspace, /ref=\{workspaceNavigationSplit\.containerRef\}/u);
  assert.match(
    workspace,
    /gridTemplateColumns:\s*workspaceNavigationSplit\.gridTemplateColumns/u
  );
  assert.match(
    workspace,
    /PROJECT_SPLITTER_MIN_CENTER[\s\S]*?PROJECT_SPLITTER_MIN_RIGHT/u
  );
  assert.match(navigationSplitter, /role="separator"/u);
  assert.match(navigationSplitter, /aria-valuemin=/u);
  assert.match(navigationSplitter, /aria-valuemax=/u);
  assert.match(navigationSplitter, /cursor-col-resize/u);
  assert.match(navigationSplitter, /case "ArrowLeft"/u);
  assert.match(navigationSplitter, /case "ArrowRight"/u);
  assert.match(navigationSplitter, /case "Home"/u);
  assert.match(navigationSplitter, /case "End"/u);
  assert.match(navigationSplitter, /setPointerCapture\(event.pointerId\)/u);
  assert.match(navigationSplitter, /releasePointerCapture\(event.pointerId\)/u);
  assert.match(navigationSplitter, /new ResizeObserver\(measure\)/u);
  assert.match(
    navigationSplitter,
    /localStorage\.getItem\(\s*WORKSPACE_NAVIGATION_SPLITTER_PREFERENCE_KEY/u
  );
  assert.match(navigationSplitter, /localStorage\.setItem\(/u);
  assert.match(
    navigationSplitterModel,
    /width - WORKSPACE_NAVIGATION_SPLITTER_WIDTH - contentWidth/u
  );
  assert.match(navigationSplitterModel, /WORKSPACE_NAVIGATION_MAX_WIDTH/u);
  assert.match(projectEntry, /data-testid="project-navigation-tabs"/u);
  assert.match(projectEntry, /data-testid="project-tools-disclosure"/u);
  assert.match(
    projectEntry,
    /hidden=\{projectNavigationTab !== "workflows"\}/u
  );
  assert.match(projectEntry, /hidden=\{projectNavigationTab !== "chats"\}/u);
  assert.match(workspace, /<ProjectWorkflowNavigation/u);
  assert.match(workspace, /mobileSheetMode === "steps"/u);
});
