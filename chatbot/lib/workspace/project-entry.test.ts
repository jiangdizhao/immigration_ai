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
import {
  buildStandaloneConversationRequest,
  canShowProjectWorkspace,
  createProjectEntryController,
  isProjectNavigationBusy,
  openSelectedProjectChat,
  type ProjectEntryCopy,
  projectEntryButtonDisabled,
  projectEntryErrorMessage,
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

function project(id: string, status = "active") {
  return {
    id,
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

test("Project workspace controls require the server-derived customer and flag", () => {
  assert.equal(
    canShowProjectWorkspace({
      writesEnabled: false,
      regularSession: true,
      registeredCustomer: true,
    }),
    false
  );
  assert.equal(
    canShowProjectWorkspace({
      writesEnabled: true,
      regularSession: false,
      registeredCustomer: true,
    }),
    false
  );
  assert.equal(
    canShowProjectWorkspace({
      writesEnabled: true,
      regularSession: true,
      registeredCustomer: false,
    }),
    false
  );
  assert.equal(
    canShowProjectWorkspace({
      writesEnabled: true,
      regularSession: true,
      registeredCustomer: true,
    }),
    true
  );
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
  assert.match(
    workspaceSource,
    /xl:grid-cols-\[250px_minmax\(0,1fr\)_290px\]/u
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
