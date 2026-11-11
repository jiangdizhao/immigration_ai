import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BackToConversationsButton,
  ProjectEntryPanel,
} from "@/components/project-entry-panel";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import { shouldApplyConversationDetail } from "./conversation-origin";
import {
  buildStandaloneConversationRequest,
  createProjectEntryController,
  createProjectEntrySelectionReconciler,
  isProjectNavigationBusy,
  openSelectedProjectChat,
  type ProjectEntryCopy,
  type ProjectEntryProject,
  type ProjectRefreshResult,
  projectDisplayLabel,
  projectEntryButtonDisabled,
  projectEntryControlsEnabled,
  projectEntryErrorMessage,
  resolveProjectEntrySelectionSeed,
  runProjectNavigationAction,
  shouldApplyProjectChatResponse,
  shouldShowNeutralProjectSelection,
} from "./project-entry";

const projectA = "11111111-1111-4111-8111-111111111111";
const projectB = "22222222-2222-4222-8222-222222222222";
const chatA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const chatB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const timestamp = "2026-10-24T00:00:00.000Z";
const projectPanelSource = readFileSync(
  new URL("../../components/project-entry-panel.tsx", import.meta.url),
  "utf8"
);
const workspaceSource = readFileSync(
  new URL("../../components/immigration-ai-workspace.tsx", import.meta.url),
  "utf8"
);

function project(
  id: string,
  status = "active",
  displayName: string | null = null
) {
  return {
    id,
    displayName,
    status,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function projectChat(
  chatId: string,
  projectId: string,
  readOnly = false,
  origin = "project"
) {
  return {
    chatId,
    projectId,
    title: `Conversation ${chatId.slice(0, 8)}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    origin,
    readOnly,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function controllerCopy(): ProjectEntryCopy {
  return getWorkspaceCopy("en").projectEntry;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("Project entry controls stay interactive only for the server-resolved available state", () => {
  assert.equal(projectEntryControlsEnabled("available"), true);
  assert.equal(projectEntryControlsEnabled("disabled"), false);
  assert.equal(projectEntryControlsEnabled("unavailable"), false);
});

test("Project entry renders accessible Chinese-default and English responsive controls", () => {
  for (const locale of ["zh-CN", "en"] as const) {
    const copy = getWorkspaceCopy(locale);
    const markup = renderToStaticMarkup(
      React.createElement(ProjectEntryPanel, {
        clearSelectionSignal: 0,
        copy: copy.projectEntry,
        locale,
        navigationBusy: false,
        onOpenProjectChat: () => undefined,
        onSelectedProjectChange: () => undefined,
      })
    );
    assert.match(markup, /aria-label=/u);
    assert.match(markup, /aria-expanded="false"/u);
    assert.match(markup, /data-testid="create-project-open"/u);
    assert.match(markup, /sm:gap-3/u);
    assert.match(markup, /xl:gap-2/u);
    assert.match(markup, new RegExp(copy.projectEntry.createProject, "u"));
  }
});

test("Back navigation is a visible, keyboard-accessible full-width button above the Project title", () => {
  const selectedPanelStart = projectPanelSource.indexOf(
    'data-testid="selected-project-chats"'
  );
  const backButtonStart = projectPanelSource.indexOf(
    "<BackToConversationsButton",
    selectedPanelStart
  );
  const titleRowStart = projectPanelSource.indexOf(
    '<div className="flex items-start justify-between gap-2">',
    selectedPanelStart
  );
  assert.ok(selectedPanelStart >= 0);
  assert.ok(backButtonStart > selectedPanelStart);
  assert.ok(titleRowStart > backButtonStart);
  assert.match(
    projectPanelSource,
    /onClick=\{\(\) => selectProject\(null\)\}/u
  );
  assert.match(
    projectPanelSource,
    /disabled=\{projectEntryButtonDisabled\(navigationBusy\)\}/u
  );
  assert.match(projectPanelSource, /break-all font-mono/u);
  /*
    Layout correction (post-Phase-13 desktop workspace task): the desktop grid keeps
    the same three-region contract — a bounded left rail, a flexible centre column and
    a bounded right rail — but the rails were narrowed (250/290 → 210/220) so the
    centre, where the Project workspace lives, receives substantially more width. The
    assertion pins the *contract* (fixed rails + `minmax(0,1fr)` centre), not the old
    pixel values.
  */
  assert.match(
    workspaceSource,
    /xl:grid-cols-\[\d+px_minmax\(0,1fr\)_\d+px\]/u
  );
  assert.match(
    workspaceSource,
    /xl:grid-cols-\[210px_minmax\(0,1fr\)_220px\]/u
  );
  assert.match(workspaceSource, /grid min-w-0 grid-cols-1/u);
  assert.match(projectPanelSource, /min-w-0 flex-1 text-left leading-4/u);

  for (const [locale, expectedLabel] of [
    ["zh-CN", "返回全部对话"],
    ["en", "Back to all conversations"],
  ] as const) {
    const copy = getWorkspaceCopy(locale).projectEntry;
    assert.equal(copy.backToConversations, expectedLabel);
    const renderButton = (disabled: boolean) =>
      renderToStaticMarkup(
        React.createElement(BackToConversationsButton, {
          disabled,
          label: copy.backToConversations,
          onClick: () => undefined,
        })
      );
    const enabledMarkup = renderButton(false);
    const disabledMarkup = renderButton(true);
    assert.match(enabledMarkup, /<button[^>]*type="button"/u);
    assert.match(enabledMarkup, /data-testid="back-to-all-conversations"/u);
    assert.match(enabledMarkup, /lucide-arrow-left/u);
    assert.match(enabledMarkup, /aria-hidden="true"/u);
    assert.match(enabledMarkup, /class="[^"]*h-10[^"]*w-full/u);
    assert.match(enabledMarkup, /text-sm/u);
    assert.match(enabledMarkup, /enabled:hover:bg-blue-50/u);
    assert.match(enabledMarkup, /focus-visible:ring-2/u);
    assert.match(enabledMarkup, new RegExp(expectedLabel, "u"));
    assert.doesNotMatch(enabledMarkup, /disabled=""/u);
    assert.match(disabledMarkup, /data-testid="back-to-all-conversations"/u);
    assert.match(disabledMarkup, /disabled=""/u);
    assert.match(disabledMarkup, /disabled:cursor-not-allowed/u);
  }
});

test("Project entry controls render disabled state from the parent navigation contract", () => {
  const copy = getWorkspaceCopy("en");
  const renderPanel = (navigationBusy: boolean) =>
    renderToStaticMarkup(
      React.createElement(ProjectEntryPanel, {
        clearSelectionSignal: 0,
        copy: copy.projectEntry,
        locale: "en",
        navigationBusy,
        onOpenProjectChat: () => undefined,
        onSelectedProjectChange: () => undefined,
      })
    );

  const busyMarkup = renderPanel(true);
  assert.match(
    busyMarkup,
    /<button[^>]*data-testid="create-project-open"[^>]*disabled=""/u
  );
  assert.equal(projectEntryButtonDisabled(true), true);
  assert.equal(projectEntryButtonDisabled(true, true), true);
  assert.equal(projectEntryButtonDisabled(false, true), true);
  assert.equal(projectEntryButtonDisabled(false), false);
  assert.doesNotMatch(
    renderPanel(false),
    /<button[^>]*data-testid="create-project-open"[^>]*disabled=""/u
  );
});

test("Project navigation blocks active turns/loading, avoids stale response contamination, and resumes when ready", async () => {
  let status: "ready" | "submitted" | "typing" = "typing";
  let conversationLoading = false;
  let currentConversationId = "standalone-current";
  let openedChatCount = 0;
  const isBusy = () => isProjectNavigationBusy(status, conversationLoading);
  const openProjectChat = () =>
    openSelectedProjectChat({
      chatId: chatA,
      projectId: projectA,
      selectedProjectId: projectA,
      onOpen: (chatId) => {
        openedChatCount += 1;
        currentConversationId = chatId;
      },
    });
  const attemptNavigation = () =>
    runProjectNavigationAction({ isBusy, action: openProjectChat });

  for (const [activeStatus, loading] of [
    ["typing", false],
    ["submitted", false],
    ["ready", true],
  ] as const) {
    status = activeStatus;
    conversationLoading = loading;
    assert.equal(isProjectNavigationBusy(status, conversationLoading), true);
    assert.equal(projectEntryButtonDisabled(isBusy()), true);
    const blocked = attemptNavigation();
    assert.deepEqual(blocked, { allowed: false });
    assert.equal(openedChatCount, 0);
    assert.equal(currentConversationId, "standalone-current");
  }

  status = "ready";
  conversationLoading = false;
  assert.equal(isProjectNavigationBusy(status, conversationLoading), false);
  assert.equal(projectEntryButtonDisabled(isBusy()), false);
  const resumed = attemptNavigation();
  assert.equal(resumed.allowed, true);
  if (resumed.allowed) {
    assert.equal(await resumed.result, true);
  }
  assert.equal(openedChatCount, 1);
  assert.equal(currentConversationId, chatA);
});

test("owner and active-member projections list only their own Project Chats", async () => {
  for (const actor of ["owner", "member"] as const) {
    const requestedUrls: string[] = [];
    const subjectChat = actor === "owner" ? chatA : chatB;
    const client = createProjectEntryController({
      copy: controllerCopy(),
      fetcher: (url) => {
        requestedUrls.push(String(url));
        if (String(url) === "/api/projects") {
          return json({ projects: [project(projectA)] });
        }
        return json({
          conversations: [
            projectChat(subjectChat, projectA),
            projectChat(actor === "owner" ? chatB : chatA, projectB),
            projectChat(
              "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              projectA,
              false,
              "immigration"
            ),
          ],
          hasMore: false,
          nextCursor: null,
        });
      },
    });
    await client.refreshProjects();
    await client.selectProject(projectA);
    assert.deepEqual(
      client.getSnapshot().chats.map((chat) => chat.chatId),
      [subjectChat]
    );
    assert.ok(
      requestedUrls.includes(`/api/projects/${projectA}/chats?limit=50`)
    );
    client.dispose();
  }
});

test("revoked access clears a selected Project after the scoped API denies it", async () => {
  const client = createProjectEntryController({
    copy: controllerCopy(),
    fetcher: (url) =>
      String(url) === "/api/projects"
        ? json({ projects: [project(projectA)] })
        : json({ error: "forbidden" }, 403),
  });
  await client.refreshProjects();
  await client.selectProject(projectA);
  assert.equal(client.getSnapshot().selectedProjectId, null);
  assert.equal(client.getSnapshot().chats.length, 0);
  assert.equal(client.getSnapshot().error, controllerCopy().accessDenied);
  client.dispose();
});

test("refreshing Projects after 403 clears cached Projects, selection, Chats, and pagination", async () => {
  let denyProjectRefresh = false;
  const client = createProjectEntryController({
    copy: controllerCopy(),
    fetcher: (url) => {
      if (String(url) === "/api/projects") {
        return denyProjectRefresh
          ? json({ error: "forbidden" }, 403)
          : json({ projects: [project(projectA)] });
      }
      return json({
        conversations: [projectChat(chatA, projectA)],
        hasMore: true,
        nextCursor: "older-chat-cursor",
      });
    },
  });
  await client.refreshProjects();
  await client.selectProject(projectA);
  assert.equal(client.getSnapshot().projects.length, 1);
  assert.equal(client.getSnapshot().chats.length, 1);
  assert.equal(client.getSnapshot().hasMore, true);
  assert.equal(client.getSnapshot().nextCursor, "older-chat-cursor");

  denyProjectRefresh = true;
  await client.refreshProjects();
  assert.deepEqual(client.getSnapshot().projects, []);
  assert.equal(client.getSnapshot().selectedProjectId, null);
  assert.deepEqual(client.getSnapshot().chats, []);
  assert.equal(client.getSnapshot().hasMore, false);
  assert.equal(client.getSnapshot().nextCursor, null);
  assert.equal(client.getSnapshot().loadingChats, false);
  assert.equal(client.getSnapshot().loadingMoreChats, false);
  assert.equal(client.getSnapshot().error, controllerCopy().accessDenied);
  client.dispose();
});

test("Project creation followed by Project and delayed Chat 403 keeps all Project state invalidated", async () => {
  const projectRefreshResponse = deferred<Response>();
  const pendingChatResponse = deferred<Response>();
  const projectRefreshStarted = deferred<void>();
  const pendingChatsStarted = deferred<void>();
  const requestSequence: string[] = [];
  let projectListCalls = 0;
  let chatListCalls = 0;
  const client = createProjectEntryController({
    copy: controllerCopy(),
    operationId: () => "project-create-after-access-change",
    fetcher: (url, init) => {
      const path = String(url);
      if (path === "/api/projects" && init?.method === "POST") {
        requestSequence.push("POST /api/projects");
        return json({ project: project(projectB) }, 201);
      }
      if (path === "/api/projects") {
        projectListCalls += 1;
        if (projectListCalls === 1) {
          return json({ projects: [project(projectA)] });
        }
        requestSequence.push("GET /api/projects");
        projectRefreshStarted.resolve();
        return projectRefreshResponse.promise;
      }
      if (path.startsWith(`/api/projects/${projectA}/chats?`)) {
        chatListCalls += 1;
        if (chatListCalls === 1) {
          return json({
            conversations: [projectChat(chatA, projectA)],
            hasMore: true,
            nextCursor: "older-chat-cursor",
          });
        }
        requestSequence.push("GET /api/projects/{id}/chats");
        pendingChatsStarted.resolve();
        return pendingChatResponse.promise;
      }
      throw new Error(`Unexpected request: ${path}`);
    },
  });

  await client.refreshProjects();
  await client.selectProject(projectA);
  const creatingProject = client.createProject();
  await projectRefreshStarted.promise;
  const loadingMoreChats = client.loadMoreChats();
  await pendingChatsStarted.promise;
  assert.deepEqual(requestSequence, [
    "POST /api/projects",
    "GET /api/projects",
    "GET /api/projects/{id}/chats",
  ]);

  projectRefreshResponse.resolve(json({ error: "forbidden" }, 403));
  assert.equal(await creatingProject, null);
  pendingChatResponse.resolve(json({ error: "forbidden" }, 403));
  await loadingMoreChats;

  assert.deepEqual(client.getSnapshot().projects, []);
  assert.equal(client.getSnapshot().selectedProjectId, null);
  assert.deepEqual(client.getSnapshot().chats, []);
  assert.equal(client.getSnapshot().nextCursor, null);
  assert.equal(client.getSnapshot().hasMore, false);
  assert.equal(client.getSnapshot().loadingChats, false);
  assert.equal(client.getSnapshot().loadingMoreChats, false);
  assert.equal(client.getSnapshot().error, controllerCopy().accessDenied);
  client.dispose();
});

test("delayed successful Project Chat page cannot restore state after a Project refresh 403", async () => {
  const delayedChatResponse = deferred<Response>();
  const chatRequestStarted = deferred<void>();
  let projectListCalls = 0;
  let chatListCalls = 0;
  const client = createProjectEntryController({
    copy: controllerCopy(),
    fetcher: (url) => {
      const path = String(url);
      if (path === "/api/projects") {
        projectListCalls += 1;
        return projectListCalls === 1
          ? json({ projects: [project(projectA)] })
          : json({ error: "forbidden" }, 403);
      }
      if (path.startsWith(`/api/projects/${projectA}/chats?`)) {
        chatListCalls += 1;
        if (chatListCalls === 1) {
          return json({
            conversations: [projectChat(chatA, projectA)],
            hasMore: true,
            nextCursor: "older-chat-cursor",
          });
        }
        chatRequestStarted.resolve();
        return delayedChatResponse.promise;
      }
      throw new Error(`Unexpected request: ${path}`);
    },
  });

  await client.refreshProjects();
  await client.selectProject(projectA);
  const delayedChatPage = client.loadMoreChats();
  await chatRequestStarted.promise;
  await client.refreshProjects();
  assert.deepEqual(client.getSnapshot().projects, []);
  assert.equal(client.getSnapshot().selectedProjectId, null);

  delayedChatResponse.resolve(
    json({
      conversations: [projectChat(chatB, projectA)],
      hasMore: true,
      nextCursor: "stale-next-cursor",
    })
  );
  await delayedChatPage;

  assert.deepEqual(client.getSnapshot().projects, []);
  assert.equal(client.getSnapshot().selectedProjectId, null);
  assert.deepEqual(client.getSnapshot().chats, []);
  assert.equal(client.getSnapshot().nextCursor, null);
  assert.equal(client.getSnapshot().hasMore, false);
  assert.equal(client.getSnapshot().error, controllerCopy().accessDenied);
  client.dispose();
});

test("transient Project refresh failures retain cached selection and Chats", async () => {
  for (const transientFailure of ["service-unavailable", "network"] as const) {
    let failProjectRefresh = false;
    const client = createProjectEntryController({
      copy: controllerCopy(),
      fetcher: (url) => {
        if (String(url) === "/api/projects") {
          if (!failProjectRefresh) {
            return json({ projects: [project(projectA)] });
          }
          if (transientFailure === "network") {
            throw new TypeError("network unavailable");
          }
          return json({ error: "unavailable" }, 503);
        }
        return json({
          conversations: [projectChat(chatA, projectA)],
          hasMore: true,
          nextCursor: "older-chat-cursor",
        });
      },
    });
    await client.refreshProjects();
    await client.selectProject(projectA);
    failProjectRefresh = true;
    await client.refreshProjects();

    assert.equal(client.getSnapshot().projects.length, 1);
    assert.equal(client.getSnapshot().selectedProjectId, projectA);
    assert.equal(client.getSnapshot().chats[0]?.chatId, chatA);
    assert.equal(client.getSnapshot().hasMore, true);
    assert.equal(client.getSnapshot().nextCursor, "older-chat-cursor");
    assert.notEqual(client.getSnapshot().error, null);
    client.dispose();
  }
});

test("transient refresh after confirmed Project creation does not take the authorization-denied path", async () => {
  for (const transientFailure of ["service-unavailable", "network"] as const) {
    let projectListCalls = 0;
    const client = createProjectEntryController({
      copy: controllerCopy(),
      operationId: () => "transient-project-create-operation",
      fetcher: (url, init) => {
        const path = String(url);
        if (path === "/api/projects" && init?.method === "POST") {
          return json({ project: project(projectB) }, 201);
        }
        if (path === "/api/projects") {
          projectListCalls += 1;
          if (projectListCalls === 1) {
            return json({ projects: [project(projectA)] });
          }
          if (transientFailure === "network") {
            throw new TypeError("network unavailable");
          }
          return json({ error: "unavailable" }, 503);
        }
        if (path.startsWith(`/api/projects/${projectA}/chats?`)) {
          return json({
            conversations: [projectChat(chatA, projectA)],
            hasMore: false,
            nextCursor: null,
          });
        }
        if (path.startsWith(`/api/projects/${projectB}/chats?`)) {
          return json({ conversations: [], hasMore: false, nextCursor: null });
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    });

    await client.refreshProjects();
    await client.selectProject(projectA);
    const created = await client.createProject();

    assert.equal(created?.id, projectB);
    assert.deepEqual(
      client.getSnapshot().projects.map((item) => item.id),
      [projectA, projectB]
    );
    assert.equal(client.getSnapshot().selectedProjectId, projectB);
    assert.equal(client.getSnapshot().error, null);
    client.dispose();
  }
});

test("closed Projects are excluded and read-only Project Chats stay Project-origin", async () => {
  const client = createProjectEntryController({
    copy: controllerCopy(),
    fetcher: (url) =>
      String(url) === "/api/projects"
        ? json({ projects: [project(projectA), project(projectB, "closed")] })
        : json({
            conversations: [projectChat(chatA, projectA, true)],
            hasMore: false,
            nextCursor: null,
          }),
  });
  await client.refreshProjects();
  assert.deepEqual(
    client.getSnapshot().projects.map((item) => item.id),
    [projectA]
  );
  await client.selectProject(projectA);
  assert.equal(client.getSnapshot().chats[0]?.origin, "project");
  assert.equal(client.getSnapshot().chats[0]?.readOnly, true);
  client.dispose();
});

test("returning to all conversations clears Project selection without creating a linked Chat", async () => {
  let projectChatRequests = 0;
  let writes = 0;
  const client = createProjectEntryController({
    copy: controllerCopy(),
    fetcher: (url, init) => {
      if (String(url) === "/api/projects") {
        return json({ projects: [project(projectA)] });
      }
      if (init?.method === "POST") {
        writes += 1;
      }
      projectChatRequests += 1;
      return json({ conversations: [], hasMore: false, nextCursor: null });
    },
  });
  await client.refreshProjects();
  await client.selectProject(projectA);
  await client.selectProject(null);
  assert.equal(client.getSnapshot().selectedProjectId, null);
  assert.equal(projectChatRequests, 1);
  assert.equal(writes, 0);
  client.dispose();
});

test("Project Chat open stays scoped and Standalone policy requests retain their binding", async () => {
  const opened: string[] = [];
  assert.equal(
    await openSelectedProjectChat({
      chatId: chatA,
      projectId: projectA,
      selectedProjectId: projectB,
      onOpen: (chatId) => {
        opened.push(chatId);
      },
    }),
    false
  );
  assert.equal(
    await openSelectedProjectChat({
      chatId: chatA,
      projectId: projectA,
      selectedProjectId: projectA,
      onOpen: (chatId) => {
        opened.push(chatId);
      },
    }),
    true
  );
  assert.deepEqual(opened, [chatA]);

  assert.deepEqual(
    buildStandaloneConversationRequest({
      title: "Policy conversation",
      policySlug: "student-visa",
      policyLaunchId: "launch-1",
    }),
    {
      title: "Policy conversation",
      policySlug: "student-visa",
      policyLaunchId: "launch-1",
    }
  );
  assert.equal(
    Object.hasOwn(
      buildStandaloneConversationRequest({ title: "Standard conversation" }),
      "projectId"
    ),
    false
  );
});

test("Project selection hides stale Standalone context and keeps closed history Project-origin", () => {
  assert.equal(
    shouldShowNeutralProjectSelection({
      selectedProjectId: projectA,
      conversationOrigin: "immigration",
      conversationProjectId: null,
    }),
    true
  );
  assert.equal(
    shouldShowNeutralProjectSelection({
      selectedProjectId: projectA,
      conversationOrigin: "project",
      conversationProjectId: projectB,
    }),
    true
  );
  assert.equal(
    shouldShowNeutralProjectSelection({
      selectedProjectId: projectA,
      conversationOrigin: "project",
      conversationProjectId: projectA,
    }),
    false
  );
  assert.equal(
    shouldShowNeutralProjectSelection({
      selectedProjectId: null,
      conversationOrigin: "project",
      conversationProjectId: projectA,
    }),
    false
  );
});

test("stale Project Chat list responses cannot replace the latest selection", async () => {
  const stale = deferred<Response>();
  const client = createProjectEntryController({
    copy: controllerCopy(),
    fetcher: (url) => {
      if (String(url) === "/api/projects") {
        return json({ projects: [project(projectA), project(projectB)] });
      }
      if (String(url).includes(projectA)) {
        return stale.promise;
      }
      return json({
        conversations: [projectChat(chatB, projectB)],
        hasMore: false,
        nextCursor: null,
      });
    },
  });
  await client.refreshProjects();
  const firstSelection = client.selectProject(projectA);
  await client.selectProject(projectB);
  stale.resolve(
    json({
      conversations: [projectChat(chatA, projectA)],
      hasMore: false,
      nextCursor: null,
    })
  );
  await firstSelection;
  assert.equal(client.getSnapshot().selectedProjectId, projectB);
  assert.deepEqual(
    client.getSnapshot().chats.map((chat) => chat.chatId),
    [chatB]
  );
  assert.equal(
    shouldApplyProjectChatResponse({
      requestProjectId: projectA,
      selectedProjectId: projectB,
      requestSequence: 1,
      latestRequestSequence: 2,
    }),
    false
  );
  client.dispose();
});

test("Create Project retries reuse one operation ID and send no invented fields", async () => {
  const operationIds: string[] = [];
  let attempts = 0;
  const client = createProjectEntryController({
    copy: controllerCopy(),
    operationId: () => "project-create-attempt-1",
    fetcher: (url, init) => {
      if (String(url) === "/api/projects" && init?.method === "POST") {
        attempts += 1;
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        operationIds.push(String(body.operationId));
        assert.deepEqual(Object.keys(body), ["operationId"]);
        if (attempts === 1) {
          throw new TypeError("offline");
        }
        return json({ project: project(projectA) }, 201);
      }
      if (String(url) === "/api/projects") {
        return json({ projects: [project(projectA)] });
      }
      return json({ conversations: [], hasMore: false, nextCursor: null });
    },
  });
  assert.equal(await client.createProject(), null);
  assert.equal(client.getSnapshot().error, controllerCopy().networkFailed);
  const created = await client.createProject();
  assert.equal(created?.id, projectA);
  assert.deepEqual(operationIds, [
    "project-create-attempt-1",
    "project-create-attempt-1",
  ]);
  assert.equal(client.getSnapshot().selectedProjectId, projectA);
  client.dispose();
});

test("duplicate Project Chat submission is single-flight and uses the scoped API", async () => {
  const createResponse = deferred<Response>();
  const postedBodies: string[] = [];
  let postCount = 0;
  const client = createProjectEntryController({
    copy: controllerCopy(),
    operationId: () => "project-chat-attempt-1",
    fetcher: (url, init) => {
      if (String(url) === "/api/projects") {
        return json({ projects: [project(projectA)] });
      }
      if (init?.method === "POST") {
        postCount += 1;
        postedBodies.push(String(init.body));
        return createResponse.promise;
      }
      return json({ conversations: [], hasMore: false, nextCursor: null });
    },
  });
  await client.refreshProjects();
  await client.selectProject(projectA);
  const firstCreate = client.createProjectChat();
  const duplicateCreate = client.createProjectChat();
  assert.equal(await duplicateCreate, null);
  assert.equal(postCount, 1);
  createResponse.resolve(
    json(
      {
        chatId: chatA,
        projectId: projectA,
        origin: "project",
        readOnly: false,
        replayed: false,
      },
      201
    )
  );
  const created = await firstCreate;
  assert.equal(created?.chatId, chatA);
  assert.deepEqual(JSON.parse(postedBodies[0] ?? "{}"), {
    operationId: "project-chat-attempt-1",
  });
  assert.match(
    projectEntryErrorMessage(409, controllerCopy()),
    /state changed/iu
  );
  client.dispose();
});

test("Project Chat network retries preserve their operation ID", async () => {
  const operationIds: string[] = [];
  let attempts = 0;
  const client = createProjectEntryController({
    copy: controllerCopy(),
    operationId: () => "same-project-chat-operation",
    fetcher: (url, init) => {
      if (String(url) === "/api/projects") {
        return json({ projects: [project(projectA)] });
      }
      if (init?.method === "POST") {
        attempts += 1;
        operationIds.push(
          String(
            (JSON.parse(String(init.body)) as { operationId: string })
              .operationId
          )
        );
        if (attempts === 1) {
          throw new TypeError("connection lost");
        }
        return json(
          {
            chatId: chatA,
            projectId: projectA,
            origin: "project",
            readOnly: false,
          },
          201
        );
      }
      return json({ conversations: [], hasMore: false, nextCursor: null });
    },
  });
  await client.refreshProjects();
  await client.selectProject(projectA);
  assert.equal(await client.createProjectChat(), null);
  assert.equal(client.getSnapshot().error, controllerCopy().networkFailed);
  assert.equal((await client.createProjectChat())?.chatId, chatA);
  assert.deepEqual(operationIds, [
    "same-project-chat-operation",
    "same-project-chat-operation",
  ]);
  client.dispose();
});

test("HTTP access and transient failures use localized, non-success messages", () => {
  const copy = controllerCopy();
  assert.equal(
    projectEntryErrorMessage(401, copy),
    copy.authenticationRequired
  );
  assert.equal(projectEntryErrorMessage(403, copy), copy.accessDenied);
  assert.equal(projectEntryErrorMessage(404, copy), copy.notFound);
  assert.equal(projectEntryErrorMessage(503, copy), copy.unavailable);
  assert.match(copy.networkFailed, /could not confirm/u);
});

test("the Project rail is navigation-only and the M5 panels live in the main area", () => {
  // The rail must not mount business forms at navigation width any more.
  assert.doesNotMatch(projectPanelSource, /<SchoolApplicationsPanel/u);
  assert.doesNotMatch(projectPanelSource, /<SchoolAdmissionsWorkflowPanel/u);
  assert.doesNotMatch(projectPanelSource, /<ProjectDocumentsPanel/u);
  assert.match(projectPanelSource, /data-testid="project-view-nav"/u);
  assert.match(projectPanelSource, /project-view-\$\{view\}/u);
});

test("the workspace renders the Project home in the main pane and can return to it", () => {
  // A selected Project without a Chat shows the home, not the neutral placeholder.
  assert.match(workspaceSource, /<ProjectWorkspaceHome/u);
  assert.match(
    workspaceSource,
    /isNeutralProjectSelection \? \(\s*selectedProject \?/u
  );
  // A Project Chat still offers an explicit, non-creating return to the home.
  assert.match(workspaceSource, /data-testid="return-to-project-home"/u);
  assert.match(workspaceSource, /const returnToProjectHome = useCallback/u);
  // Returning home invalidates in-flight conversation loads through the shared
  // reset, and the navigation itself obeys the busy contract.
  assert.match(
    workspaceSource,
    /const resetProjectConversation = useCallback\(\(\) => \{\s*conversationLoadSeqRef\.current \+= 1;/u
  );
  assert.match(workspaceSource, /action: resetProjectConversation,/u);
  // The home is a presentation layer only: it reuses the existing panels.
  assert.match(
    workspaceSource,
    /schoolApplicationsCopy=\{copy\.schoolApplications\}/u
  );
  assert.match(
    workspaceSource,
    /schoolAdmissionsCopy=\{copy\.schoolAdmissions\}/u
  );
});

/* ------------------------------------------------------------------------- *
 * R1 navigation-state correction (2026-11-01)
 *
 * A Project Chat may only stay active for the Project it belongs to, and the
 * Project home/section controls may not run while a turn or a conversation load
 * is in progress. These tests pin the wiring, not the visual layout.
 * ------------------------------------------------------------------------- */

const resetSource = workspaceSource.slice(
  workspaceSource.indexOf("const resetProjectConversation = useCallback"),
  workspaceSource.indexOf("const returnToProjectHome = useCallback")
);
const projectNavSource = workspaceSource.slice(
  workspaceSource.indexOf("const returnToProjectHome = useCallback"),
  workspaceSource.indexOf("const latestAssistant = useMemo")
);
const railNavSource = projectPanelSource.slice(
  projectPanelSource.indexOf('data-testid="project-view-nav"'),
  projectPanelSource.indexOf("</nav>")
);

test("Project home and section navigation reuse the navigation-busy contract", () => {
  assert.ok(projectNavSource.length > 0);
  // Both actions are guarded by the same shared busy gate.
  const guards =
    projectNavSource.match(
      /runProjectNavigationAction\(\{\s*isBusy: \(\) => projectNavigationBusyRef\.current,/gu
    ) ?? [];
  // Phase 13 M9-A R1-04 adds a third busy-gated Project section action: the document
  // centre's "return to the previous view". Every Project section action still goes
  // through the one shared gate, so a new ungated action cannot be added silently.
  assert.ok(
    guards.length >= 3,
    `every Project section action must use the shared busy gate (found ${guards.length})`
  );
  assert.match(
    workspaceSource,
    /projectNavigationBusyRef\.current = projectNavigationBusy;/u
  );
  // The rail links are visually disabled by the existing button contract.
  assert.match(
    railNavSource,
    /disabled=\{projectEntryButtonDisabled\(navigationBusy\)\}/u
  );
  // The chat header control is disabled too.
  const buttonIndex = workspaceSource.indexOf(
    'data-testid="return-to-project-home"'
  );
  assert.ok(buttonIndex > 0);
  const buttonWindow = workspaceSource.slice(
    buttonIndex - 400,
    buttonIndex + 400
  );
  assert.match(buttonWindow, /disabled=\{projectNavigationBusy\}/u);
});

test("a busy workspace refuses Project section navigation and leaves the section unchanged", () => {
  let busy = true;
  let sectionChanges = 0;
  let resets = 0;
  const navigateToSection = () =>
    runProjectNavigationAction({
      isBusy: () => busy,
      action: () => {
        resets += 1;
        sectionChanges += 1;
        return "applications";
      },
    });

  // A turn in progress or a conversation still loading blocks the change.
  assert.deepEqual(navigateToSection(), { allowed: false });
  assert.equal(sectionChanges, 0);
  assert.equal(resets, 0);

  busy = false;
  assert.deepEqual(navigateToSection(), {
    allowed: true,
    result: "applications",
  });
  assert.equal(sectionChanges, 1);
});

test("switching Projects drops the previous Project Chat identity and chatId", () => {
  // The switch decision keeps a Project Chat from following the selection.
  assert.match(workspaceSource, /projectSwitchClearsConversation\(\{/u);
  assert.match(
    workspaceSource,
    /nextProjectId: projectId,\s*conversationOrigin: conversationOriginRef\.current,/u
  );
  // The reset is the shared one, so the URL cannot keep the old chatId.
  assert.match(resetSource, /clearWorkspaceChatParam\(\);/u);
  assert.match(
    workspaceSource,
    /window\.history\.replaceState\(\s*null,\s*"",\s*workspaceUrlWithoutChat\(window\.location\.href\)\s*\);/u
  );
  // The reset only touches client state: no Chat is created, closed or deleted.
  assert.doesNotMatch(
    resetSource,
    /fetch\(|createProjectChat|method: "POST"|method: "DELETE"|\/api\/projects/gu
  );
});

test("a delayed conversation response cannot repaint after a Project reset", () => {
  // The reset bumps the load sequence before clearing state, so the sequence the
  // in-flight request captured is no longer the newest one.
  assert.match(resetSource, /conversationLoadSeqRef\.current \+= 1;/u);
  const inFlightSequence = 1;
  const sequenceAfterReset = inFlightSequence + 1;
  assert.equal(
    shouldApplyConversationDetail({
      requestSeq: inFlightSequence,
      latestRequestSeq: sequenceAfterReset,
      requestedChatId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      loadedChatId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }),
    false
  );
  // The same response is applied only while it is still the newest request.
  assert.equal(
    shouldApplyConversationDetail({
      requestSeq: sequenceAfterReset,
      latestRequestSeq: sequenceAfterReset,
      requestedChatId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      loadedChatId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    }),
    true
  );
});

test("a freshly mounted Project panel adopts the Workspace selection instead of clearing it", () => {
  /**
   * Phase 14-A: the mobile navigation Sheet mounts ProjectEntryPanel each time it
   * opens, so its controller starts with no selection. The Workspace's Project is
   * still the source of truth: publishing that empty snapshot would clear the
   * Project and drop its Project Chat.
   */
  const listed = [project(projectA)] as ProjectEntryProject[];
  assert.equal(
    resolveProjectEntrySelectionSeed({
      initialSelectedProjectId: projectA,
      projectListResult: { kind: "success", projects: listed },
      projects: listed,
    }),
    "seed",
    "an authorized Project must be re-adopted, not cleared"
  );
  assert.equal(
    resolveProjectEntrySelectionSeed({
      initialSelectedProjectId: null,
      projectListResult: { kind: "success", projects: listed },
      projects: listed,
    }),
    "settled",
    "a panel with no Workspace selection settles immediately"
  );
  const otherList = [project(projectB)] as ProjectEntryProject[];
  assert.equal(
    resolveProjectEntrySelectionSeed({
      initialSelectedProjectId: projectA,
      projectListResult: { kind: "success", projects: otherList },
      projects: otherList,
    }),
    "settled",
    "a Project the authorized list no longer offers is genuinely gone"
  );
  assert.equal(
    resolveProjectEntrySelectionSeed({
      initialSelectedProjectId: projectA,
      projectListResult: { kind: "authorization_denied" },
      projects: [],
    }),
    "settled",
    "a denied read is a real answer: that selection cannot stand"
  );
  for (const projectListResult of [
    null,
    { kind: "transient_failure" as const },
    { kind: "superseded" as const },
  ]) {
    assert.equal(
      resolveProjectEntrySelectionSeed({
        initialSelectedProjectId: projectA,
        projectListResult,
        projects: [],
      }),
      "unresolved",
      "an unreadable list is not proof that the Project was withdrawn"
    );
  }
  // The panel stays silent until it is ready, and the Sheet hands it the
  // Workspace's selection instead of letting a fresh controller invent one.
  assert.match(
    projectPanelSource,
    /selectedProjectId: initialSelectedProjectId = null/u
  );
  assert.match(
    projectPanelSource,
    /const \[selectionReady, setSelectionReady\] = useState\(/u
  );
  assert.match(projectPanelSource, /if \(!selectionReady\) \{\s*return;/u);
  assert.match(workspaceSource, /selectedProjectId=\{selectedProjectId\}/u);
});

/**
 * Phase 14-A R1-01: a structural fake of the Project entry controller, so the
 * reconciliation can be exercised without React, a network or a database.
 */
function fakeSelectionController(input: {
  refresh: () => Promise<ProjectRefreshResult>;
}) {
  const selections: (string | null)[] = [];
  // Mirrors the real controller: the visible project list is whatever the last
  // authorized read produced, so a failed read leaves it unchanged.
  let projects: ProjectEntryProject[] = [];
  return {
    controller: {
      getSnapshot: () => ({ projects }),
      refreshProjects: async () => {
        const result = await input.refresh();
        if (result.kind === "success") {
          projects = result.projects;
        }
        return result;
      },
      selectProject: (projectId: string | null) => {
        selections.push(projectId);
        return Promise.resolve();
      },
    },
    selections,
  };
}

test("an interrupted first reconciliation still resolves the panel", async () => {
  const listed = [project(projectA)] as ProjectEntryProject[];
  let refreshCalls = 0;
  const { controller, selections } = fakeSelectionController({
    refresh: () => {
      refreshCalls += 1;
      return Promise.resolve<ProjectRefreshResult>({
        kind: "success",
        projects: listed,
      });
    },
  });
  const reconciler = createProjectEntrySelectionReconciler({
    controller,
    initialSelectedProjectId: projectA,
  });

  // The first effect run starts the read; the cleanup that follows abandons its
  // result, and the re-run asks again before the first attempt has settled.
  const firstRun = reconciler.reconcile();
  const secondRun = reconciler.reconcile();

  assert.equal(await firstRun, "seed");
  assert.equal(await secondRun, "seed");
  assert.equal(refreshCalls, 1, "one read serves both effect runs");
  assert.deepEqual(
    selections,
    [projectA],
    "the Workspace Project is adopted exactly once"
  );
});

test("a settled reconciliation is not repeated", async () => {
  const listed = [project(projectA)] as ProjectEntryProject[];
  let refreshCalls = 0;
  const { controller, selections } = fakeSelectionController({
    refresh: () => {
      refreshCalls += 1;
      return Promise.resolve<ProjectRefreshResult>({
        kind: "success",
        projects: listed,
      });
    },
  });
  const reconciler = createProjectEntrySelectionReconciler({
    controller,
    initialSelectedProjectId: projectA,
  });

  assert.equal(await reconciler.reconcile(), "seed");
  assert.equal(await reconciler.reconcile(), "seed");
  assert.equal(refreshCalls, 1, "a definitive outcome is not re-attempted");
  assert.deepEqual(selections, [projectA]);
});

test("an unreadable project list is retried instead of cached as empty", async () => {
  const listed = [project(projectA)] as ProjectEntryProject[];
  let refreshCalls = 0;
  const { controller, selections } = fakeSelectionController({
    refresh: () => {
      refreshCalls += 1;
      return Promise.resolve<ProjectRefreshResult>(
        refreshCalls === 1
          ? { kind: "transient_failure" }
          : { kind: "success", projects: listed }
      );
    },
  });
  const reconciler = createProjectEntrySelectionReconciler({
    controller,
    initialSelectedProjectId: projectA,
  });

  assert.equal(await reconciler.reconcile(), "unresolved");
  assert.deepEqual(
    selections,
    [],
    "an unreadable list never clears the Project"
  );
  assert.equal(await reconciler.reconcile(), "seed");
  assert.equal(refreshCalls, 2, "the retry performs a real second read");
  assert.deepEqual(selections, [projectA]);
});

test("a Project the authorized list no longer offers settles instead of re-adopting", async () => {
  const otherList = [project(projectB)] as ProjectEntryProject[];
  const { controller, selections } = fakeSelectionController({
    refresh: () =>
      Promise.resolve<ProjectRefreshResult>({
        kind: "success",
        projects: otherList,
      }),
  });
  const reconciler = createProjectEntrySelectionReconciler({
    controller,
    initialSelectedProjectId: projectA,
  });

  assert.equal(await reconciler.reconcile(), "settled");
  assert.deepEqual(selections, [], "a withdrawn Project is not re-selected");
});

test("opening the Create Project dialog is not a Project selection", () => {
  const dialogHandler = projectPanelSource.match(
    /function openCreateProjectDialog\(\) \{[\s\S]*?\n {2}\}/u
  )?.[0];
  assert.ok(dialogHandler, "the dialog handler must exist");
  assert.doesNotMatch(
    dialogHandler,
    /setSelectionReady/u,
    "opening a dialog must never settle the selection"
  );
  // A real creation does settle it, because the server creates and selects it.
  const createHandler = projectPanelSource.match(
    /async function createProject\(displayName\?: string\) \{[\s\S]*?\n {2}\}/u
  )?.[0];
  assert.ok(createHandler, "the create handler must exist");
  // Phase 14: the optional name is forwarded, never invented client-side.
  assert.match(createHandler, /controller\.createProject\(displayName\)/u);
  assert.match(
    createHandler,
    /if \(project\) \{\s*selectionDecidedRef\.current = true;\s*setSelectionReady\(true\);/u,
    "only a Project the server actually created settles the selection"
  );
});

test("the panel reconciles through the single-flight reconciler", () => {
  assert.match(
    projectPanelSource,
    /createProjectEntrySelectionReconciler\(\{/u,
    "the panel must use the reconciler"
  );
  assert.doesNotMatch(
    projectPanelSource,
    /seedReconciledRef/u,
    "the cancellable one-shot latch must be gone"
  );
  assert.match(
    projectPanelSource,
    /if \(!active \|\| outcome === "unresolved"\)/u,
    "a cancelled or unresolved attempt must not settle the panel"
  );
  assert.match(
    projectPanelSource,
    /if \(!selectionReady\) \{\s*return;/u,
    "an unresolved controller must never publish a selection"
  );
});

test("an explicit decision made while the list is in flight is not overwritten by the seed", async () => {
  const listed = [project(projectA)] as ProjectEntryProject[];
  let resolveRefresh: ((value: ProjectRefreshResult) => void) | null = null;
  const { controller, selections } = fakeSelectionController({
    refresh: () =>
      new Promise<ProjectRefreshResult>((resolve) => {
        resolveRefresh = resolve;
      }),
  });
  let decided = false;
  const reconciler = createProjectEntrySelectionReconciler({
    controller,
    initialSelectedProjectId: projectA,
    isSelectionDecided: () => decided,
  });

  const pending = reconciler.reconcile();
  // The actor clears or changes the Project while the read is still running.
  decided = true;
  const resolve = resolveRefresh as
    | ((value: ProjectRefreshResult) => void)
    | null;
  assert.ok(resolve, "the refresh must be pending");
  resolve({ kind: "success", projects: listed });

  assert.equal(await pending, "seed");
  assert.deepEqual(
    selections,
    [],
    "the stale seed must not re-select the Project the actor just left"
  );
});

const projectC = "33333333-3333-4333-8333-333333333333";

test("the Project parser normalizes the optional name and the shared label prefers it", async () => {
  const client = createProjectEntryController({
    copy: controllerCopy(),
    fetcher: () =>
      json({
        projects: [
          { ...project(projectA), displayName: "2027 Application" },
          { ...project(projectB), displayName: null },
          // A legacy server response that predates the naming column.
          {
            id: projectC,
            status: "active",
            revision: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
  });
  await client.refreshProjects();
  const projects = client.getSnapshot().projects;
  assert.equal(projects[0]?.displayName, "2027 Application");
  assert.equal(projects[1]?.displayName, null);
  assert.equal(projects[2]?.displayName, null);
  client.dispose();

  const zh = getWorkspaceCopy("zh-CN").projectEntry;
  const en = getWorkspaceCopy("en").projectEntry;
  assert.equal(
    projectDisplayLabel(
      { ...project(projectA), displayName: "  2027 申请  " },
      "zh-CN",
      zh
    ),
    "2027 申请"
  );
  assert.equal(
    projectDisplayLabel(project(projectB), "zh-CN", zh),
    zh.projectLabel(
      new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(timestamp)),
      projectB.slice(0, 8)
    )
  );
  assert.equal(
    projectDisplayLabel(project(projectB), "en", en),
    en.projectLabel(
      new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(timestamp)),
      projectB.slice(0, 8)
    )
  );
});

test("Project creation sends an optional name and omits the field for a legacy blank name", async () => {
  const bodies: unknown[] = [];
  const buildClient = (name: string | undefined) => {
    const client = createProjectEntryController({
      copy: controllerCopy(),
      operationId: () => "create-naming-operation",
      fetcher: (url, init) => {
        const path = String(url);
        if (path === "/api/projects" && init?.method === "POST") {
          bodies.push(JSON.parse(String(init.body)));
          return json(
            {
              project: {
                ...project(projectB),
                displayName: "My 2027 Application",
              },
            },
            201
          );
        }
        if (path === "/api/projects") {
          return json({
            projects: [
              { ...project(projectB), displayName: "My 2027 Application" },
            ],
          });
        }
        return json({ conversations: [], hasMore: false, nextCursor: null });
      },
    });
    return { client, name };
  };

  const named = buildClient("  My 2027 Application  ");
  const created = await named.client.createProject(named.name);
  assert.deepEqual(bodies[0], {
    operationId: "create-naming-operation",
    displayName: "My 2027 Application",
  });
  assert.equal(created?.displayName, "My 2027 Application");
  named.client.dispose();

  const blank = buildClient("   ");
  const legacy = await blank.client.createProject(blank.name);
  const legacyBody = bodies[1] as Record<string, unknown>;
  assert.equal("displayName" in legacyBody, false);
  assert.equal(legacyBody.operationId, "create-naming-operation");
  assert.equal(legacy?.displayName, "My 2027 Application");
  blank.client.dispose();
});

test("renaming updates exactly one Project record and preserves selection, Chats and section", async () => {
  const requests: Array<{ method?: string; body?: unknown }> = [];
  const client = createProjectEntryController({
    copy: controllerCopy(),
    operationId: () => "rename-naming-operation",
    fetcher: (url, init) => {
      const path = String(url);
      if (path.startsWith(`/api/projects/${projectA}/chats?`)) {
        return json({
          conversations: [projectChat(chatA, projectA)],
          hasMore: false,
          nextCursor: null,
        });
      }
      if (path === `/api/projects/${projectA}` && init?.method === "PATCH") {
        requests.push({
          method: init.method,
          body: JSON.parse(String(init.body)),
        });
        return json({
          project: {
            ...project(projectA, "active", "Renamed Project A"),
            revision: 2,
          },
        });
      }
      if (path === "/api/projects") {
        return json({
          projects: [project(projectA, "active", "Renamed Project A")],
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    },
  });
  await client.refreshProjects();
  await client.selectProject(projectA);
  const chatsBefore = client.getSnapshot().chats.map((chat) => chat.chatId);
  client.openRenameDialog();
  assert.equal(client.getSnapshot().renameDialogOpen, true);

  const updated = await client.renameProject("  Renamed Project A  ");
  assert.deepEqual(requests, [
    {
      method: "PATCH",
      body: {
        operationId: "rename-naming-operation",
        expectedRevision: 1,
        displayName: "Renamed Project A",
      },
    },
  ]);
  assert.equal(updated?.displayName, "Renamed Project A");
  const after = client.getSnapshot();
  assert.equal(after.projects.length, 1);
  assert.equal(after.projects[0]?.displayName, "Renamed Project A");
  assert.equal(after.projects[0]?.revision, 2);
  assert.equal(after.selectedProjectId, projectA);
  assert.deepEqual(
    after.chats.map((chat) => chat.chatId),
    chatsBefore,
    "the open Project Chat must survive a rename"
  );
  assert.equal(after.renameDialogOpen, false);
  assert.equal(after.renameError, null);
  client.dispose();
});

test("renaming can be cancelled and invalid names never reach the API", async () => {
  let patchCalls = 0;
  const client = createProjectEntryController({
    copy: controllerCopy(),
    fetcher: (url, init) => {
      const path = String(url);
      if (init?.method === "PATCH") {
        patchCalls += 1;
        return json({ project: project(projectA) });
      }
      if (path === "/api/projects") {
        return json({ projects: [project(projectA)] });
      }
      return json({ conversations: [], hasMore: false, nextCursor: null });
    },
  });
  await client.refreshProjects();
  await client.selectProject(projectA);

  client.openRenameDialog();
  client.closeRenameDialog();
  assert.equal(client.getSnapshot().renameDialogOpen, false);
  assert.equal(patchCalls, 0, "cancel must never write");

  await client.renameProject("   ");
  assert.equal(
    client.getSnapshot().renameError,
    controllerCopy().projectNameRequired
  );
  await client.renameProject("x".repeat(101));
  assert.equal(
    client.getSnapshot().renameError,
    controllerCopy().projectNameInvalid
  );
  await client.renameProject("line\nbreak");
  assert.equal(
    client.getSnapshot().renameError,
    controllerCopy().projectNameInvalid
  );
  assert.equal(patchCalls, 0);
  assert.equal(client.getSnapshot().projects[0]?.displayName, null);
  client.dispose();
});

test("a conflicting rename reports state change, keeps the stored name and re-reads the list", async () => {
  let listCalls = 0;
  const client = createProjectEntryController({
    copy: controllerCopy(),
    operationId: () => "rename-conflict-operation",
    fetcher: (url, init) => {
      const path = String(url);
      if (path === "/api/projects") {
        listCalls += 1;
        return json({
          projects: [project(projectA, "active", "Original Name")],
        });
      }
      if (init?.method === "PATCH") {
        return json({ error: "revision conflict" }, 409);
      }
      return json({ conversations: [], hasMore: false, nextCursor: null });
    },
  });
  await client.refreshProjects();
  await client.selectProject(projectA);
  client.openRenameDialog();
  const result = await client.renameProject("Attempted Name");
  assert.equal(result, null);
  const state = client.getSnapshot();
  assert.equal(state.renameError, controllerCopy().stateChanged);
  assert.equal(state.renamingProject, false);
  assert.equal(state.selectedProjectId, projectA);
  // Only the server's authoritative name is displayed; a failed edit never wins.
  assert.equal(state.projects[0]?.displayName, "Original Name");
  assert.equal(
    listCalls,
    2,
    "a conflict triggers one authoritative list re-read"
  );
  client.dispose();
});

test("rename retries reuse the operation id only for an identical request", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  let failRemaining = 2;
  let operationSequence = 0;
  const client = createProjectEntryController({
    copy: controllerCopy(),
    operationId: () => {
      operationSequence += 1;
      return `rename-op-${operationSequence}`;
    },
    fetcher: (url, init) => {
      const path = String(url);
      if (path === "/api/projects") {
        return json({ projects: [project(projectA)] });
      }
      if (init?.method === "PATCH") {
        bodies.push(JSON.parse(String(init.body)));
        if (failRemaining > 0) {
          failRemaining -= 1;
          return json({ error: "unavailable" }, 503);
        }
        return json({
          project: {
            ...project(projectA, "active", "Final Name"),
            revision: 2,
          },
        });
      }
      return json({ conversations: [], hasMore: false, nextCursor: null });
    },
  });
  await client.refreshProjects();
  await client.selectProject(projectA);

  await client.renameProject("Same Name");
  await client.renameProject("Same Name");
  assert.equal(
    bodies[0]?.operationId,
    bodies[1]?.operationId,
    "an identical retry replays the same operation"
  );
  const renamed = await client.renameProject("Other Name");
  assert.equal(renamed?.displayName, "Final Name");
  assert.notEqual(
    bodies[2]?.operationId,
    bodies[0]?.operationId,
    "a changed payload must never reuse an operation id"
  );
  assert.equal(client.getSnapshot().projects[0]?.displayName, "Final Name");
  client.dispose();
});

test("the panel exposes the bilingual name field and one obvious rename action", () => {
  const zh = getWorkspaceCopy("zh-CN").projectEntry;
  const en = getWorkspaceCopy("en").projectEntry;
  assert.equal(zh.projectNameLabel, "项目名称");
  assert.equal(en.projectNameLabel, "Project name");
  assert.equal(zh.projectNamePlaceholder, "例如：2027 年 Student 500 签证申请");
  assert.equal(en.projectNamePlaceholder, "e.g. 2027 Student 500 Application");
  assert.equal(zh.renameProject, "重命名");
  assert.equal(en.renameProject, "Rename");
  assert.match(projectPanelSource, /data-testid="create-project-name"/u);
  assert.match(projectPanelSource, /copy.projectNamePlaceholder/u);
  assert.match(projectPanelSource, /data-testid="rename-project"/u);
  assert.match(projectPanelSource, /data-testid="rename-project-dialog"/u);
  assert.match(projectPanelSource, /data-testid="rename-project-save"/u);
  assert.match(projectPanelSource, /controller.openRenameDialog\(\)/u);
  assert.match(projectPanelSource, /controller.closeRenameDialog\(\)/u);
  assert.match(projectPanelSource, /controller.renameProject\(renameName\)/u);
});

test("creation retries reuse the operation id only for the same requested name", async () => {
  const posts: Array<Record<string, unknown>> = [];
  let failRemaining = 2;
  let sequence = 0;
  const client = createProjectEntryController({
    copy: controllerCopy(),
    operationId: () => {
      sequence += 1;
      return `create-name-op-${sequence}`;
    },
    fetcher: (url, init) => {
      const path = String(url);
      if (path === "/api/projects" && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        if (failRemaining > 0) {
          failRemaining -= 1;
          return json({ error: "unavailable" }, 503);
        }
        return json(
          { project: { ...project(projectB), displayName: "Name B" } },
          201
        );
      }
      if (path === "/api/projects") {
        return json({
          projects: [{ ...project(projectB), displayName: "Name B" }],
        });
      }
      return json({ conversations: [], hasMore: false, nextCursor: null });
    },
  });

  // 1. A create with name A fails.
  assert.equal(await client.createProject("Name A"), null);
  // 2. Retrying name A reuses the operation id (identical payload).
  assert.equal(await client.createProject("Name A"), null);
  assert.equal(
    posts[0]?.operationId,
    posts[1]?.operationId,
    "an identical named retry must replay the same operation"
  );
  // 3. Changing the name starts a new operation (new payload identity).
  const created = await client.createProject("Name B");
  assert.notEqual(
    posts[2]?.operationId,
    posts[0]?.operationId,
    "a changed name must never reuse the previous operation id"
  );
  assert.equal(posts[2]?.displayName, "Name B");
  assert.equal(created?.displayName, "Name B");

  // 4. A blank name keeps the legacy unnamed contract: no displayName key, and it is
  // its own request identity rather than a reuse of the named attempt.
  await client.createProject("   ");
  const blank = posts[3] as Record<string, unknown>;
  assert.equal("displayName" in blank, false);
  // op-1 served A (twice), op-2 served B, so the blank payload is the third operation.
  assert.equal(blank.operationId, "create-name-op-3");
  assert.notEqual(blank.operationId, posts[2]?.operationId);
  client.dispose();
});
