import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampProjectCenterWidth,
  normalizeProjectSplitRatio,
  PROJECT_SPLITTER_HANDLE_WIDTH,
  PROJECT_SPLITTER_MIN_CENTER,
  PROJECT_SPLITTER_MIN_RIGHT,
  PROJECT_SPLITTER_PREFERENCE_VERSION,
  parseProjectSplitPreference,
  projectCenterWidthForRatio,
  projectSplitBounds,
  projectSplitRatioForCenterWidth,
  projectWorkspaceSplitColumns,
} from "./project-splitter";

test("saved ratios accept finite values between zero and one", () => {
  assert.equal(normalizeProjectSplitRatio(0.5), 0.5);
  assert.equal(normalizeProjectSplitRatio(0.19), 0.19);
  assert.equal(normalizeProjectSplitRatio(0.81), 0.81);
  assert.equal(normalizeProjectSplitRatio(0), null);
  assert.equal(normalizeProjectSplitRatio(1), null);
  assert.equal(normalizeProjectSplitRatio(-0.1), null);
  assert.equal(normalizeProjectSplitRatio(1.1), null);
  assert.equal(normalizeProjectSplitRatio(Number.NaN), null);
  assert.equal(normalizeProjectSplitRatio(Number.POSITIVE_INFINITY), null);
  assert.equal(normalizeProjectSplitRatio(Number.NEGATIVE_INFINITY), null);
  assert.equal(normalizeProjectSplitRatio("0.5"), null);
});

test("malformed, unsupported and invalid stored preferences fall back safely", () => {
  const fallback = 0.66;
  assert.equal(parseProjectSplitPreference(null), fallback);
  assert.equal(parseProjectSplitPreference(""), fallback);
  assert.equal(parseProjectSplitPreference("not-json"), fallback);
  assert.equal(
    parseProjectSplitPreference('{"version":1,"centerRatio":Infinity}'),
    fallback
  );
  assert.equal(parseProjectSplitPreference("null"), fallback);
  assert.equal(parseProjectSplitPreference("[]"), fallback);
  assert.equal(
    parseProjectSplitPreference('{"version":2,"centerRatio":0.5}'),
    fallback
  );
  assert.equal(parseProjectSplitPreference('{"version":1}'), fallback);
  assert.equal(
    parseProjectSplitPreference('{"version":1,"centerRatio":null}'),
    fallback
  );
  assert.equal(
    parseProjectSplitPreference('{"version":1,"centerRatio":0}'),
    fallback
  );
  assert.equal(
    parseProjectSplitPreference('{"version":1,"centerRatio":1}'),
    fallback
  );
  assert.equal(
    parseProjectSplitPreference('{"version":1,"centerRatio":"0.5"}'),
    fallback
  );
});

test("split bounds preserve minimum center and task widths at supported desktop sizes", () => {
  const available = 1200;
  const bounds = projectSplitBounds(available);
  assert.equal(bounds.minCenter, PROJECT_SPLITTER_MIN_CENTER);
  assert.equal(
    bounds.maxCenter,
    available - PROJECT_SPLITTER_HANDLE_WIDTH - PROJECT_SPLITTER_MIN_RIGHT
  );
  assert.equal(clampProjectCenterWidth(100, available), bounds.minCenter);
  assert.equal(clampProjectCenterWidth(2000, available), bounds.maxCenter);
  assert.ok(projectCenterWidthForRatio(0.66, available) >= bounds.minCenter);
  assert.ok(
    available -
      PROJECT_SPLITTER_HANDLE_WIDTH -
      projectCenterWidthForRatio(0.66, available) >=
      PROJECT_SPLITTER_MIN_RIGHT
  );
});

test("minimum, midpoint and maximum widths round-trip at supported desktop sizes", () => {
  for (const availableWidth of [1020, 1200, 1600, 2400]) {
    const bounds = projectSplitBounds(availableWidth);
    const widths = [
      bounds.minCenter,
      (bounds.minCenter + bounds.maxCenter) / 2,
      bounds.maxCenter,
    ];

    for (const centerWidth of widths) {
      const ratio = projectSplitRatioForCenterWidth(
        centerWidth,
        availableWidth
      );
      const serialized = JSON.stringify({
        centerRatio: ratio,
        version: PROJECT_SPLITTER_PREFERENCE_VERSION,
      });
      const restoredRatio = parseProjectSplitPreference(serialized);
      const restoredWidth = projectCenterWidthForRatio(
        restoredRatio,
        availableWidth
      );

      assert.equal(
        restoredWidth,
        centerWidth,
        `round trip at ${availableWidth}px for ${centerWidth}px center width`
      );
      assert.ok(restoredWidth >= bounds.minCenter);
      assert.ok(restoredWidth <= bounds.maxCenter);
      assert.ok(
        availableWidth - PROJECT_SPLITTER_HANDLE_WIDTH - restoredWidth >=
          PROJECT_SPLITTER_MIN_RIGHT
      );
    }
  }

  assert.equal(
    projectWorkspaceSplitColumns("600px"),
    "600px 24px minmax(300px, 1fr)"
  );
  assert.deepEqual(projectSplitBounds(250), { maxCenter: 0, minCenter: 0 });
});
