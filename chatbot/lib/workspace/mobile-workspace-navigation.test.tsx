import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MOBILE_WORKSPACE_NAV_KEYS,
  MobileWorkspaceNavigation,
  type MobileWorkspaceNavKey,
  type MobileWorkspaceSheetMode,
} from "@/components/mobile-workspace-navigation";
import type { SiteLocale } from "@/lib/site-locale";
import { getWorkspaceCopy } from "@/lib/workspace-copy";

/**
 * Phase 14-A mobile Workspace navigation.
 *
 * The bar is presentation only: it renders the four approved entries, keeps the
 * bilingual labels of the shared copy map and reflects the navigation-busy and
 * open-Sheet state it is given. The actions themselves stay in the Workspace and
 * are covered by the existing navigation contracts.
 */
function render(
  locale: SiteLocale = "en",
  {
    disabledEntries,
    hidden,
    openSheetMode,
  }: {
    disabledEntries?: readonly MobileWorkspaceNavKey[];
    hidden?: boolean;
    openSheetMode?: MobileWorkspaceSheetMode | null;
  } = {}
) {
  return renderToStaticMarkup(
    React.createElement(MobileWorkspaceNavigation, {
      copy: getWorkspaceCopy(locale).mobileNav,
      disabledEntries,
      hidden,
      onSelect: () => undefined,
      openSheetMode,
    })
  );
}

/** The whole `<button>` element for one entry, attributes on both sides. */
function buttonFor(markup: string, key: MobileWorkspaceNavKey) {
  const index = markup.indexOf(`data-testid="mobile-nav-${key}"`);
  if (index < 0) {
    throw new Error(`missing the "${key}" entry`);
  }
  const start = markup.lastIndexOf("<button", index);
  const end = markup.indexOf("</button>", index);
  return markup.slice(start, end);
}

test("the mobile bottom bar offers exactly the four approved entries", () => {
  assert.deepEqual(
    [...MOBILE_WORKSPACE_NAV_KEYS],
    ["conversations", "projectHome", "steps", "navigation"]
  );
  const markup = render();
  assert.match(markup, /data-testid="mobile-workspace-nav"/u);
  assert.match(markup, /aria-label="Workspace navigation"/u);
  for (const key of MOBILE_WORKSPACE_NAV_KEYS) {
    assert.match(markup, new RegExp(`data-testid="mobile-nav-${key}"`, "u"));
  }
  // No fifth entry and no hidden duplicate surface.
  assert.equal(
    (markup.match(/data-testid="mobile-nav-/gu) ?? []).length,
    MOBILE_WORKSPACE_NAV_KEYS.length
  );
  // Every entry is a real button with a phone-sized tap target.
  assert.equal((markup.match(/<button/gu) ?? []).length, 4);
  assert.equal(
    (markup.match(/min-h-11/gu) ?? []).length,
    MOBILE_WORKSPACE_NAV_KEYS.length
  );
});

test("the entries are localized instead of hard-coded in one language", () => {
  const zh = getWorkspaceCopy("zh-CN").mobileNav;
  const en = getWorkspaceCopy("en").mobileNav;
  assert.equal(zh.conversations, "全部对话");
  assert.equal(zh.projectHome, "项目主页");
  assert.equal(zh.steps, "工作步骤");
  assert.equal(zh.navigation, "导航");
  assert.equal(en.conversations, "All conversations");
  assert.equal(en.projectHome, "Project home");
  assert.equal(en.steps, "Work steps");
  assert.equal(en.navigation, "Navigation");
  const zhMarkup = render("zh-CN");
  for (const label of [
    zh.conversations,
    zh.projectHome,
    zh.steps,
    zh.navigation,
  ]) {
    assert.match(zhMarkup, new RegExp(label, "u"));
  }
  // The Sheet headings are distinct per mode and never promise progress.
  assert.notEqual(zh.sheetStepsTitle, zh.sheetNavigationTitle);
  assert.notEqual(en.sheetStepsTitle, en.sheetNavigationTitle);
  assert.doesNotMatch(Object.values(zh).join(" "), /保证|一定获批|必然/u);
});

test("busy navigation is offered as unavailable instead of silently ignored", () => {
  const markup = render("en", {
    disabledEntries: ["conversations", "projectHome"],
  });
  assert.match(
    buttonFor(markup, "conversations"),
    /disabled/u,
    "leaving a busy conversation must be disabled, not silently dropped"
  );
  assert.match(buttonFor(markup, "projectHome"), /disabled/u);
  assert.doesNotMatch(buttonFor(markup, "steps"), /disabled/u);
  assert.match(markup, /title="A response is in progress/u);
});

test("the bar steps aside for the soft keyboard and marks the open Sheet mode", () => {
  assert.match(render("en", { hidden: true }), /xl:hidden hidden/u);
  const open = render("en", { openSheetMode: "steps" });
  const stepsButton = buttonFor(open, "steps");
  assert.match(stepsButton, /aria-expanded="true"/u);
  assert.match(stepsButton, /aria-current="true"/u);
  assert.match(stepsButton, /aria-haspopup="dialog"/u);
  assert.match(buttonFor(open, "navigation"), /aria-expanded="false"/u);
  // The action entries are not presented as open drawers.
  const conversationsButton = buttonFor(open, "conversations");
  assert.doesNotMatch(conversationsButton, /aria-expanded/u);
  assert.doesNotMatch(conversationsButton, /aria-haspopup/u);
});
