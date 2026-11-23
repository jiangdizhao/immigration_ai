import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceNavigationSplitSeparator } from "@/components/resizable-workspace-navigation-split";
import {
  PROJECT_SPLITTER_HANDLE_WIDTH,
  PROJECT_SPLITTER_MIN_CENTER,
  PROJECT_SPLITTER_MIN_RIGHT,
  PROJECT_SPLITTER_PREFERENCE_KEY,
} from "./project-splitter";
import {
  clampWorkspaceNavigationWidth,
  parseWorkspaceNavigationPreference,
  serializeWorkspaceNavigationPreference,
  WORKSPACE_NAVIGATION_DEFAULT_WIDTH,
  WORKSPACE_NAVIGATION_MAX_WIDTH,
  WORKSPACE_NAVIGATION_MIN_STANDALONE_CONTENT,
  WORKSPACE_NAVIGATION_MIN_WIDTH,
  WORKSPACE_NAVIGATION_SPLITTER_PREFERENCE_KEY,
  WORKSPACE_NAVIGATION_SPLITTER_PREFERENCE_VERSION,
  WORKSPACE_NAVIGATION_SPLITTER_WIDTH,
  workspaceNavigationBounds,
  workspaceNavigationGridColumns,
} from "./workspace-navigation-splitter";

const projectMainMinimum =
  PROJECT_SPLITTER_MIN_CENTER +
  PROJECT_SPLITTER_HANDLE_WIDTH +
  PROJECT_SPLITTER_MIN_RIGHT;

test("left navigation bounds use the measured container and preserve both Project panes", () => {
  for (const containerWidth of [1280, 1920]) {
    const bounds = workspaceNavigationBounds(
      containerWidth,
      projectMainMinimum
    );
    assert.equal(bounds.minWidth, WORKSPACE_NAVIGATION_MIN_WIDTH);
    assert.equal(bounds.maxWidth, WORKSPACE_NAVIGATION_MAX_WIDTH);
    assert.ok(
      containerWidth - bounds.maxWidth - WORKSPACE_NAVIGATION_SPLITTER_WIDTH >=
        projectMainMinimum
    );
    assert.equal(
      clampWorkspaceNavigationWidth(
        WORKSPACE_NAVIGATION_DEFAULT_WIDTH,
        containerWidth,
        projectMainMinimum
      ),
      WORKSPACE_NAVIGATION_DEFAULT_WIDTH
    );
  }

  const constrained = workspaceNavigationBounds(1040, projectMainMinimum);
  assert.deepEqual(constrained, { maxWidth: 232, minWidth: 232 });
  assert.equal(
    clampWorkspaceNavigationWidth(400, 1040, projectMainMinimum),
    232
  );

  const standalone = workspaceNavigationBounds(
    1280,
    WORKSPACE_NAVIGATION_MIN_STANDALONE_CONTENT
  );
  assert.deepEqual(standalone, { maxWidth: 400, minWidth: 236 });
});

test("navigation preference round-trips safely and stays separate from the E1 splitter", () => {
  const serialized = serializeWorkspaceNavigationPreference(312);
  assert.deepEqual(JSON.parse(serialized), {
    version: WORKSPACE_NAVIGATION_SPLITTER_PREFERENCE_VERSION,
    width: 312,
  });
  assert.equal(parseWorkspaceNavigationPreference(serialized), 312);
  assert.equal(parseWorkspaceNavigationPreference(null), 288);
  for (const invalid of [
    "",
    "not-json",
    "null",
    "{}",
    '{"version":2,"width":312}',
    '{"version":1,"width":null}',
    '{"version":1,"width":NaN}',
    '{"version":1,"width":120}',
    '{"version":1,"width":401}',
  ]) {
    assert.equal(
      parseWorkspaceNavigationPreference(invalid),
      WORKSPACE_NAVIGATION_DEFAULT_WIDTH,
      invalid
    );
  }
  assert.notEqual(
    WORKSPACE_NAVIGATION_SPLITTER_PREFERENCE_KEY,
    PROJECT_SPLITTER_PREFERENCE_KEY
  );
});

test("the left and E1 splitter tracks compose without sharing their width state", () => {
  assert.equal(
    workspaceNavigationGridColumns(288, true),
    "288px 24px minmax(0, 1fr)"
  );
  assert.equal(
    workspaceNavigationGridColumns(288, false),
    "288px 24px minmax(0, 1fr) 220px"
  );
  assert.equal(PROJECT_SPLITTER_HANDLE_WIDTH, 24);
  assert.equal(projectMainMinimum, 784);
});

test("the desktop navigation separator is visible, keyboard focusable and labeled", () => {
  const markup = renderToStaticMarkup(
    React.createElement(WorkspaceNavigationSplitSeparator, {
      accessibleLabel: "Resize workspace navigation",
      bounds: { maxWidth: 400, minWidth: 236 },
      controls: "workspace-history-panel",
      handlers: {
        onKeyDown: () => undefined,
        onPointerCancel: () => undefined,
        onPointerDown: () => undefined,
        onPointerMove: () => undefined,
        onPointerUp: () => undefined,
      },
      navigationWidth: 288,
      projectMode: true,
    })
  );
  assert.match(markup, /role="separator"/u);
  assert.match(markup, /aria-orientation="vertical"/u);
  assert.match(markup, /aria-valuemin="236"/u);
  assert.match(markup, /aria-valuemax="400"/u);
  assert.match(markup, /aria-valuenow="288"/u);
  assert.match(markup, /aria-controls="workspace-history-panel"/u);
  assert.match(markup, /tabindex="0"/u);
  assert.match(markup, /cursor-col-resize/u);
  assert.match(markup, /lucide-grip-vertical/u);
  assert.match(markup, /xl:row-span-2/u);
});
