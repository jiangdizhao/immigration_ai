import { expect, test } from "@playwright/test";
import { build } from "esbuild";

const fixtureSource = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ProjectWorkspaceSplitSeparator,
  useResizableProjectWorkspaceSplit,
} from "./components/resizable-project-workspace-split";
import { projectWorkspaceSplitColumns } from "./lib/workspace/project-splitter";

function SplitterFixture() {
  const split = useResizableProjectWorkspaceSplit(true);
  const [draft, setDraft] = useState("");
  const [sentCount, setSentCount] = useState(0);

  return (
    <div data-testid="fixture-shell" id="fixture-shell">
      <nav aria-label="Project navigation" />
      <main
        data-testid="project-workspace-split"
        id="project-workspace-split-region"
        ref={split.paneRef}
        style={{
          display: "grid",
          gridTemplateColumns: projectWorkspaceSplitColumns(split.centerColumn),
          height: "100%",
          minWidth: 0,
        }}
      >
        <section aria-label="AI conversation" id="project-chat-region">
          <ul data-testid="workspace-message-list">
            <li data-testid="chat-message">Existing message one</li>
            <li data-testid="chat-message">Existing message two</li>
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSentCount((count) => count + 1);
            }}
          >
            <textarea
              aria-label="Composer"
              data-testid="workspace-input"
              onChange={(event) => setDraft(event.target.value)}
              value={draft}
            />
            <button type="submit">Send</button>
          </form>
          <output data-testid="sent-count">{sentCount}</output>
        </section>
        <ProjectWorkspaceSplitSeparator
          accessibleLabel="Resize conversation and task panels"
          centerWidth={split.centerWidth}
          controls="project-chat-region project-task-region"
          handlers={split.separatorHandlers}
          maxCenterWidth={split.maxCenterWidth}
          minCenterWidth={split.minCenterWidth}
        />
        <aside aria-label="Project task" id="project-task-region">
          Project task content
        </aside>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<SplitterFixture />);
`;

let fixtureBundle = "";

test.beforeAll(async () => {
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
      sourcefile: "phase15-m3-e1-splitter-fixture.tsx",
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
    if (path === "/splitter.js") {
      await route.fulfill({
        body: fixtureBundle,
        contentType: "text/javascript",
      });
      return;
    }

    await route.fulfill({
      body: `<!doctype html>
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          *, *::before, *::after { box-sizing: border-box; }
          html, body, #root { width: 100%; height: 100%; margin: 0; overflow: hidden; }
          body { font: 14px/1.4 sans-serif; }
          #fixture-shell { display: grid; grid-template-columns: 220px minmax(0, 1fr); width: 100vw; height: 100vh; }
          #fixture-shell > nav { background: #e2e8f0; }
          #project-workspace-split-region { min-width: 0; width: 100%; overflow: hidden; }
          #project-chat-region, #project-task-region { min-width: 0; height: 100%; overflow: hidden; padding: 12px; }
          #project-chat-region { display: flex; flex-direction: column; justify-content: space-between; }
          #project-task-region { background: #f8fafc; }
          #project-workspace-split-region [data-testid="project-workspace-splitter"] { display: flex; }
          #project-chat-region textarea { display: block; width: 100%; height: 72px; }
          #project-chat-region button { margin-top: 4px; }
          #project-workspace-split-region [data-testid="project-workspace-splitter"] > span:first-child { background: #94a3b8; }
        </style></head>
        <body><div id="root"></div><script src="/splitter.js"></script></body></html>`,
      contentType: "text/html",
    });
  });
  await page.setViewportSize({ width: 1913, height: 900 });
  await page.goto("http://127.0.0.1/project-workspace-splitter-test");
  await expect(page.getByTestId("project-workspace-splitter")).toBeVisible();
});

test("the rendered separator has a hit target and resizes both panels by the pointer delta", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      apiRequests.push(request.url());
    }
  });
  const separator = page.getByTestId("project-workspace-splitter");
  const chat = page.locator("#project-chat-region");
  const task = page.locator("#project-task-region");
  const separatorBox = await separator.boundingBox();
  expect(separatorBox).not.toBeNull();
  expect(separatorBox?.width).toBe(24);
  expect(separatorBox?.height).toBe(900);
  await expect(separator).toHaveAttribute("role", "separator");
  await expect(
    page.getByRole("separator", {
      name: "Resize conversation and task panels",
    })
  ).toBeVisible();
  await expect(separator).toHaveAttribute("aria-orientation", "vertical");
  await expect(separator).toHaveAttribute(
    "aria-controls",
    "project-chat-region project-task-region"
  );
  await expect(separator).toHaveAttribute("aria-valuemin", "460");

  const hitTest = await separator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    return {
      cursor: hit ? getComputedStyle(hit).cursor : "",
      isSeparator: hit === element,
    };
  });
  expect(hitTest.isSeparator).toBe(true);
  expect(hitTest.cursor).toBe("col-resize");
  expect(
    await separator.evaluate((element) => {
      const style = getComputedStyle(element);
      return { touchAction: style.touchAction, userSelect: style.userSelect };
    })
  ).toEqual({ touchAction: "none", userSelect: "none" });
  const grip = separator.locator(":scope > span").nth(1);
  const line = separator.locator(":scope > span").first();
  const gripBox = await grip.boundingBox();
  const lineBox = await line.boundingBox();
  expect(gripBox?.width).toBe(16);
  expect(gripBox?.height).toBe(48);
  expect(lineBox?.width).toBe(2);
  expect(lineBox?.height).toBe(900);
  expect(
    await grip.evaluate((element) => getComputedStyle(element).borderTopStyle)
  ).toBe("solid");

  const initialChatWidth = (await chat.boundingBox())?.width ?? 0;
  const initialTaskWidth = (await task.boundingBox())?.width ?? 0;
  const input = page.getByTestId("workspace-input");
  await input.fill("unsent text stays in the same Chat");
  expect(await page.getByTestId("chat-message").count()).toBe(2);

  const pointerX = (separatorBox?.x ?? 0) + (separatorBox?.width ?? 0) / 2;
  const pointerY = (separatorBox?.y ?? 0) + (separatorBox?.height ?? 0) / 2;
  await page.mouse.move(pointerX, pointerY);
  await page.mouse.down();
  await page.mouse.move(pointerX + 120, pointerY, { steps: 8 });
  await page.mouse.up();

  const resizedChatWidth = (await chat.boundingBox())?.width ?? 0;
  const resizedTaskWidth = (await task.boundingBox())?.width ?? 0;
  expect(Math.abs(resizedChatWidth - initialChatWidth - 120)).toBeLessThan(2);
  expect(Math.abs(initialTaskWidth - resizedTaskWidth - 120)).toBeLessThan(2);
  expect(resizedChatWidth).toBeGreaterThanOrEqual(460);
  expect(resizedTaskWidth).toBeGreaterThanOrEqual(300);
  expect(await input.inputValue()).toBe("unsent text stays in the same Chat");
  expect(await page.getByTestId("chat-message").count()).toBe(2);
  expect(await page.getByTestId("sent-count").textContent()).toBe("0");
  expect(apiRequests).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(1913);

  console.log(
    `Chromium 1913x900 splitter: handle=${separatorBox?.width}x${separatorBox?.height}; chat ${initialChatWidth}->${resizedChatWidth}px; task ${initialTaskWidth}->${resizedTaskWidth}px`
  );
});

test("keyboard bounds, saved width restoration, and invalid preference fallback work in Chromium", async ({
  page,
}) => {
  const separator = page.getByTestId("project-workspace-splitter");
  const chat = page.locator("#project-chat-region");
  const task = page.locator("#project-task-region");
  const initialWidth = (await chat.boundingBox())?.width ?? 0;

  await separator.focus();
  expect(
    await separator.evaluate((element) => document.activeElement === element)
  ).toBe(true);
  await page.keyboard.press("ArrowLeft");
  const afterArrowLeft = (await chat.boundingBox())?.width ?? 0;
  expect(Math.abs(initialWidth - afterArrowLeft - 32)).toBeLessThan(2);
  await page.keyboard.press("ArrowRight");
  expect(
    Math.abs(((await chat.boundingBox())?.width ?? 0) - initialWidth)
  ).toBeLessThan(2);

  await page.keyboard.press("Home");
  expect((await chat.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(460);
  expect((await chat.boundingBox())?.width ?? 0).toBeCloseTo(460, 0);
  expect(Number(await separator.getAttribute("aria-valuenow"))).toBe(460);
  await page.keyboard.press("End");
  const maximumChatWidth = (await chat.boundingBox())?.width ?? 0;
  const minimumTaskWidth = (await task.boundingBox())?.width ?? 0;
  expect(maximumChatWidth).toBeGreaterThanOrEqual(460);
  expect(minimumTaskWidth).toBeGreaterThanOrEqual(300);
  expect(minimumTaskWidth).toBeCloseTo(300, 0);
  expect(Number(await separator.getAttribute("aria-valuemax"))).toBe(
    Math.round(maximumChatWidth)
  );

  await separator.focus();
  await page.keyboard.press("ArrowLeft");
  const savedWidth = (await chat.boundingBox())?.width ?? 0;
  await page.reload();
  await expect(separator).toBeVisible();
  const restoredWidth = (await chat.boundingBox())?.width ?? 0;
  expect(Math.abs(restoredWidth - savedWidth)).toBeLessThan(1);

  await page.evaluate(() => {
    localStorage.setItem(
      "phase15.project-workspace.split.v1",
      '{"version":1,"centerRatio":1.7}'
    );
  });
  await page.reload();
  await expect(separator).toBeVisible();
  const fallbackWidth = (await chat.boundingBox())?.width ?? 0;
  expect(fallbackWidth).toBeGreaterThan(460);
  expect(fallbackWidth).toBeLessThan(maximumChatWidth);
  expect(await page.getByTestId("workspace-input").inputValue()).toBe("");
});
