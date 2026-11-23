import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import tailwindcss from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

declare global {
  interface Window {
    __r1ApiRequests: number;
  }
}

const fixtureSource = `
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LegacyConversationNotice } from "./components/legacy-conversation-notice";
import { MobileWorkspaceNavigation } from "./components/mobile-workspace-navigation";
import { ProjectWorkbenchHeader } from "./components/project-workbench";
import { WorkspaceChatComposer } from "./components/workspace-chat-composer";
import { WorkspaceViewportFrame } from "./components/workspace-viewport-frame";
import { getWorkspaceCopy } from "./lib/workspace-copy";

const copy = getWorkspaceCopy("en");
const projectId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-11-24T00:00:00.000Z";
const project = { id: projectId, displayName: "Synthetic Project", status: "active", revision: 1, createdAt: timestamp, updatedAt: timestamp };
const journey = {
  project: { id: projectId, status: "active", revision: 1, purpose: { state: "unknown", reasonCode: "project_purpose_not_recorded" }, serviceScope: { state: "available", engagements: [] } },
  workflowProjection: { definitionVersion: "phase15.project-workflows.v1", progress: { coverage: "partial", definitionVersion: "phase15.project-workflows.v1", completedKnownApplicable: 0, knownApplicableTotal: 0, notApplicableCount: 0, percent: null, unavailableCount: 0, unknownApplicabilityCount: 1, unknownProgressCount: 0 } },
  nodes: [],
};
const journeyLoad = { status: "ready", projectId, requestId: 1, state: {}, journey };
window.__r1ApiRequests = 0;
const originalFetch = window.fetch.bind(window);
window.fetch = (...args) => {
  window.__r1ApiRequests += 1;
  return originalFetch(...args);
};

function Fixture() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1280px)").matches);
  const [surface, setSurface] = useState("chat");
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const isEmpty = new URLSearchParams(window.location.search).has("empty");
  const isReadOnly = new URLSearchParams(window.location.search).has("readonly");
  const isShort = new URLSearchParams(window.location.search).has("short");

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const messages = Array.from({ length: isShort ? 2 : 32 }, (_, index) => (
    <article className="mb-4 rounded-xl bg-white p-3" key={index}>
      <h2 className="font-semibold">Message {index + 1}</h2>
      {isShort ? <p className="mt-2 leading-6">A short chat message.</p> : <><p className="mt-2 leading-6">A longer synthetic Project Chat message with multiple lines to make the message region scroll independently while the Composer remains in its own row.</p><p className="mt-2 leading-6">This additional paragraph checks that text can grow and scroll inside the conversation without pushing the Composer off the available viewport.</p></>}
    </article>
  ));

  return (
    <WorkspaceViewportFrame>
      <header className="sticky top-0 z-50 shrink-0 border-b border-white/10 bg-[#001736] text-white" data-testid="site-header">
        <div className="mx-auto flex min-h-[72px] w-full items-center justify-between px-5">
          <strong>Immigration AI</strong>
          <button onClick={() => setHeaderExpanded((current) => !current)} type="button">{headerExpanded ? "Close menu" : "Open menu"}</button>
        </div>
        {headerExpanded ? <div className="grid gap-2 border-t border-white/10 px-5 py-4"><span>Responsive site navigation item one</span><span>Responsive site navigation item two</span></div> : null}
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:overflow-hidden" data-testid="page-main">
        <div className="flex min-h-0 flex-1 flex-col xl:h-full" data-testid="mode-workspace">
          <section className="w-full shrink-0 px-3 pt-1.5 sm:px-4 lg:px-6" data-testid="mode-toolbar">
            <div className="flex min-h-10 flex-wrap items-center gap-3 rounded-xl bg-white/90 px-3 py-1.5 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wide">Assistant mode</span>
              <select aria-label="Assistant mode"><option>Fast</option></select>
            </div>
          </section>
          <section className={"flex min-h-0 w-full flex-1 flex-col px-3 pt-2 sm:px-4 lg:px-6 xl:h-full xl:pb-3 " + (focused ? "pb-[env(safe-area-inset-bottom)]" : "pb-[var(--workspace-mobile-navigation-inset)]")} data-testid="ai-workspace" id="ai-workspace">
            <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-3 xl:gap-0 xl:overflow-hidden xl:rounded-2xl xl:bg-white xl:shadow-sm xl:grid-cols-[288px_24px_minmax(0,1fr)] xl:grid-rows-[auto_minmax(0,1fr)]" data-testid="workspace-layout-grid">
              <div className="order-1 min-w-0 xl:order-3 xl:col-start-3 xl:row-start-1">
                <ProjectWorkbenchHeader
                  enabledSections={{ applications: true, admissions: true, student500: true }}
                  journeyCopy={copy.projectEntry.projectJourney}
                  journeyLoad={journeyLoad}
                  locale="en"
                  mobileSurface={surface}
                  navigationBusy={false}
                  onMobileSurfaceChange={setSurface}
                  onRefresh={() => undefined}
                  onSelectNode={() => undefined}
                  onSelectView={() => undefined}
                  project={project}
                  projectId={projectId}
                  selectedNodeId={null}
                  workbenchCopy={copy.projectEntry.projectWorkbench}
                />
              </div>
              <div className="order-2 grid h-full min-h-0 min-w-0 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-0 xl:order-4 xl:col-start-3 xl:row-start-2 xl:h-full xl:min-h-0 xl:grid-rows-1 xl:grid-cols-[minmax(460px,1fr)_24px_minmax(300px,0.72fr)]" data-testid="project-workspace-split">
                <section className={"order-1 flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm xl:order-1 xl:rounded-none xl:shadow-none " + (surface === "chat" ? "flex" : "hidden xl:flex")} data-testid="project-chat-region" id="project-chat-region">
                  <header className="shrink-0 border-b border-slate-100 px-4 py-2"><h2 className="font-semibold">Project Chat</h2>{isEmpty ? null : <p data-testid="conversation-identity">chat-1234 · Project #{projectId.slice(0, 8)}</p>}</header>
                  {isEmpty ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-8" data-testid="project-chat-empty-state">
                      <div className="max-w-lg text-center"><h2 className="text-lg font-semibold">{copy.projectEntry.projectWorkbench.noProjectChatTitle}</h2><p className="mt-3 text-sm leading-6">{copy.projectEntry.projectWorkbench.noProjectChatDescription}</p><button className="mt-4 rounded-lg border px-3 py-2" type="button">{copy.projectEntry.projectWorkbench.openProjectChats}</button></div>
                    </div>
                  ) : (
                    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-4" data-testid="workspace-message-list">
                      {messages}
                    </div>
                  )}
                  {!isEmpty ? (
                    <div className="shrink-0 border-t border-slate-100 bg-white p-2 sm:p-3" data-testid="project-chat-composer-shell">
                      {isReadOnly ? (
                        <LegacyConversationNotice copy={copy} onStartNewConversation={() => undefined} projectChat />
                      ) : (
                        <WorkspaceChatComposer
                          disabled={false}
                          inputLabel={copy.consultation.inputLabel}
                          onBlur={() => setFocused(false)}
                          onFocus={() => setFocused(true)}
                          onSubmit={() => setSubmitCount((current) => current + 1)}
                          onValueChange={setDraft}
                          placeholder={copy.consultation.placeholder}
                          sendLabel={copy.consultation.send}
                          status="ready"
                          submittedLabel={copy.status.submitted}
                          typingLabel={copy.status.typing}
                          value={draft}
                        />
                      )}
                    </div>
                  ) : null}
                </section>
                <aside className={"order-3 h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm xl:rounded-none xl:shadow-none " + (surface === "task" ? "flex" : "hidden xl:flex")} data-testid="project-task-region" id="project-task-region">
                  <div className="shrink-0 border-b p-3"><h2 className="font-semibold">Task Workspace</h2></div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-3">Task content</div>
                </aside>
              </div>
            </div>
            <p className="mt-3 shrink-0 px-1 text-xs leading-5 text-slate-500" data-testid="workspace-disclaimer">This workspace provides general information only. A longer disclaimer occupies the normal flow below the Chat.</p>
            {!wide ? <MobileWorkspaceNavigation copy={copy.mobileNav} hidden={focused} onSelect={() => undefined} /> : null}
          </section>
        </div>
      </main>
      <output className="sr-only" data-testid="submit-count">{submitCount}</output>
    </WorkspaceViewportFrame>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
`;

let fixtureBundle = "";
let workspaceCss = "";

test.beforeAll(async () => {
  const globalCssPath = resolve(process.cwd(), "app/globals.css");
  const globalCssSource = await readFile(globalCssPath, "utf8");
  const cssResult = await postcss([tailwindcss()]).process(globalCssSource, {
    from: globalCssPath,
  });
  workspaceCss = cssResult.css;
  const result = await build({
    absWorkingDir: process.cwd(),
    bundle: true,
    define: { "process.env.NODE_ENV": '"production"' },
    format: "iife",
    platform: "browser",
    stdin: {
      contents: fixtureSource,
      loader: "tsx",
      resolveDir: process.cwd(),
      sourcefile: "phase15-m3-e2-5-r1-mobile-layout-fixture.tsx",
    },
    target: "chrome116",
    write: false,
  });
  fixtureBundle = result.outputFiles[0]?.text ?? "";
  expect(fixtureBundle.length).toBeGreaterThan(0);
});

test.beforeEach(async ({ page }) => {
  await page.route("http://127.0.0.1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/workspace.css") {
      await route.fulfill({ body: workspaceCss, contentType: "text/css" });
      return;
    }
    if (path === "/layout.js") {
      await route.fulfill({
        body: fixtureBundle,
        contentType: "text/javascript",
      });
      return;
    }
    await route.fulfill({
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/workspace.css"></head><body><div id="root"></div><script src="/layout.js"></script></body></html>`,
      contentType: "text/html",
    });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://127.0.0.1/phase15-m3-e2-5-r1-layout");
  await expect(page.getByTestId("workspace-input")).toBeVisible();
});

test("Project Chat keeps its Composer reachable across mobile and desktop viewports", async ({
  page,
}) => {
  const composer = page.getByTestId("workspace-input");
  await composer.fill("Draft survives desktop to mobile and back.");
  await composer.blur();
  await expect(page.getByTestId("conversation-identity")).toContainText(
    "chat-1234"
  );

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByTestId("project-mobile-chat-tab-label")
    ).toBeVisible();
    await expect(page.getByTestId("mobile-workspace-nav")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number.parseFloat(
            getComputedStyle(
              document.querySelector<HTMLElement>(
                '[data-testid="workspace-viewport-frame"]'
              ) as HTMLElement
            ).height
          )
        )
      )
      .toBe(viewport.height);
    const metrics = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) {
          return null;
        }
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          top: box.top,
          bottom: box.bottom,
          height: box.height,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          overflowY: style.overflowY,
          overscrollBehaviorY: style.overscrollBehaviorY,
        };
      };
      const composer = rect('[data-testid="workspace-composer"]');
      const navigation = rect('[data-testid="mobile-workspace-nav"]');
      const frame = document.querySelector<HTMLElement>(
        '[data-testid="workspace-viewport-frame"]'
      );
      const visualViewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const main = document.querySelector<HTMLElement>(
        '[data-testid="page-main"]'
      );
      return {
        viewport: {
          innerHeight: window.innerHeight,
          visualViewportHeight,
          width: window.innerWidth,
        },
        frame: frame
          ? {
              rect: rect('[data-testid="workspace-viewport-frame"]'),
              inlineHeight: frame.style.height,
              className: frame.className,
            }
          : null,
        siteHeader: rect('[data-testid="site-header"]'),
        toolbar: rect('[data-testid="mode-toolbar"]'),
        projectHeader: rect('[data-testid="project-workbench-header"]'),
        workspace: rect('[data-testid="ai-workspace"]'),
        grid: rect('[data-testid="workspace-layout-grid"]'),
        chat: rect('[data-testid="project-chat-region"]'),
        messages: rect('[data-testid="workspace-message-list"]'),
        composer,
        navigation,
        main: main
          ? {
              clientHeight: main.clientHeight,
              scrollHeight: main.scrollHeight,
              scrollTop: main.scrollTop,
              overflowY: getComputedStyle(main).overflowY,
            }
          : null,
        document: {
          clientHeight: document.documentElement.clientHeight,
          scrollHeight: document.documentElement.scrollHeight,
          scrollTop: document.documentElement.scrollTop,
        },
        composerIntersectsViewport: Boolean(
          composer && composer.bottom > 0 && composer.top < visualViewportHeight
        ),
        composerFullyVisible: Boolean(
          composer &&
            composer.top >= 0 &&
            composer.bottom <= visualViewportHeight
        ),
        composerAboveNavigation: Boolean(
          composer && navigation && composer.bottom <= navigation.top
        ),
      };
    });
    console.log(
      `R1 mobile layout metrics ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)}`
    );
    expect(metrics.composerFullyVisible).toBe(true);
    expect(metrics.composerAboveNavigation).toBe(true);
    expect(metrics.main?.scrollHeight).toBe(metrics.main?.clientHeight);
    expect(metrics.document.scrollHeight).toBe(metrics.document.clientHeight);
    expect(metrics.chat?.height).toBeGreaterThan(0);
    expect(metrics.chat?.scrollHeight).toBeLessThanOrEqual(
      metrics.chat?.clientHeight ?? 0
    );
    expect(metrics.messages?.overflowY).toBe("auto");
    expect(metrics.messages?.overscrollBehaviorY).toBe("contain");
    expect(await composer.inputValue()).toBe(
      "Draft survives desktop to mobile and back."
    );
    expect(
      await page.getByTestId("conversation-identity").textContent()
    ).toContain("chat-1234");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(viewport.width);

    if (viewport.width === 390) {
      const composerBox = await page
        .getByTestId("workspace-composer")
        .boundingBox();
      await page
        .getByTestId("site-header")
        .getByRole("button", { name: "Open menu" })
        .click();
      const expandedLayout = await page.evaluate(() => {
        const composerElement = document.querySelector<HTMLElement>(
          '[data-testid="workspace-composer"]'
        );
        const navigationElement = document.querySelector<HTMLElement>(
          '[data-testid="mobile-workspace-nav"]'
        );
        if (!composerElement || !navigationElement) {
          return null;
        }
        return {
          composerBottom: composerElement.getBoundingClientRect().bottom,
          navigationTop: navigationElement.getBoundingClientRect().top,
          headerHeight:
            document
              .querySelector<HTMLElement>('[data-testid="site-header"]')
              ?.getBoundingClientRect().height ?? 0,
        };
      });
      expect(expandedLayout).not.toBeNull();
      expect(expandedLayout?.headerHeight).toBeGreaterThan(73);
      expect(expandedLayout?.composerBottom).toBeLessThanOrEqual(
        expandedLayout?.navigationTop ?? 0
      );
      await expect(page.getByTestId("workspace-composer")).toBeVisible();
      await expect(page.getByTestId("mobile-workspace-nav")).toBeVisible();
      await page
        .getByTestId("site-header")
        .getByRole("button", { name: "Close menu" })
        .click();

      await page.getByTestId("workspace-message-list").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect
        .poll(() =>
          page
            .getByTestId("workspace-message-list")
            .evaluate((element) => element.scrollTop)
        )
        .toBeGreaterThan(0);
      const composerAfterScroll = await page
        .getByTestId("workspace-composer")
        .boundingBox();
      expect(composerAfterScroll?.y).toBe(composerBox?.y);
      const scrollState = await page.evaluate(() => ({
        mainScrollTop:
          document.querySelector<HTMLElement>('[data-testid="page-main"]')
            ?.scrollTop ?? -1,
        pageScrollTop: document.documentElement.scrollTop,
      }));
      expect(scrollState).toEqual({ mainScrollTop: 0, pageScrollTop: 0 });

      await page.getByTestId("project-mobile-task-tab-label").click();
      await expect(page.getByTestId("project-chat-region")).toBeHidden();
      await expect(page.getByTestId("project-task-region")).toBeVisible();
      await expect(composer).toHaveValue(
        "Draft survives desktop to mobile and back."
      );
      await page.getByTestId("project-mobile-chat-tab-label").click();
      await expect(page.getByTestId("project-chat-region")).toBeVisible();
      await expect(composer).toHaveValue(
        "Draft survives desktop to mobile and back."
      );
    }
  }

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1920, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page.evaluate(() => window.matchMedia("(min-width: 1280px)").matches)
      )
      .toBe(true);
    await expect(page.getByTestId("conversation-identity")).toContainText(
      "chat-1234"
    );
    await expect(composer).toHaveValue(
      "Draft survives desktop to mobile and back."
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => window.__r1ApiRequests)).toBe(0);
  }
});

test("empty and read-only Project Chats remain truthful inside the bounded layout", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1/phase15-m3-e2-5-r1-layout?short=1");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByTestId("workspace-message-list").locator("article")
  ).toHaveCount(2);
  await expect(page.getByTestId("workspace-composer")).toBeVisible();
  await expect(page.getByTestId("mobile-workspace-nav")).toBeVisible();

  await page.goto("http://127.0.0.1/phase15-m3-e2-5-r1-layout?empty=1");
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.getByTestId("project-chat-empty-state")).toBeVisible();
  await expect(page.getByTestId("conversation-identity")).toHaveCount(0);
  await expect(page.getByTestId("workspace-message-list")).toHaveCount(0);
  await expect(page.getByTestId("workspace-input")).toHaveCount(0);
  await expect(page.getByTestId("project-chat-empty-state")).toContainText(
    "No Project AI conversation is open"
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(375);

  await page.goto("http://127.0.0.1/phase15-m3-e2-5-r1-layout?readonly=1");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("project-chat-read-only-notice")).toBeVisible();
  await expect(page.getByTestId("workspace-input")).toHaveCount(0);
  await expect(page.getByTestId("workspace-message-list")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => window.__r1ApiRequests)).toBe(0);
});
