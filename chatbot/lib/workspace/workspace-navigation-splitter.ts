export const WORKSPACE_NAVIGATION_SPLITTER_PREFERENCE_KEY =
  "phase15.workspace-navigation.split.v1";
export const WORKSPACE_NAVIGATION_SPLITTER_PREFERENCE_VERSION = 1;
export const WORKSPACE_NAVIGATION_SPLITTER_WIDTH = 24;
export const WORKSPACE_NAVIGATION_MIN_WIDTH = 236;
export const WORKSPACE_NAVIGATION_DEFAULT_WIDTH = 288;
export const WORKSPACE_NAVIGATION_MAX_WIDTH = 400;
export const WORKSPACE_NAVIGATION_KEYBOARD_STEP = 32;
export const WORKSPACE_NAVIGATION_MIN_STANDALONE_CONTENT = 680;

export function workspaceNavigationBounds(
  containerWidth: number,
  minimumMainContentWidth: number
): { minWidth: number; maxWidth: number } {
  const width = Number.isFinite(containerWidth)
    ? Math.max(0, containerWidth)
    : 0;
  const contentWidth = Number.isFinite(minimumMainContentWidth)
    ? Math.max(0, minimumMainContentWidth)
    : 0;
  const maxWidth = Math.max(
    0,
    Math.min(
      WORKSPACE_NAVIGATION_MAX_WIDTH,
      width - WORKSPACE_NAVIGATION_SPLITTER_WIDTH - contentWidth
    )
  );
  return {
    maxWidth,
    minWidth: Math.min(WORKSPACE_NAVIGATION_MIN_WIDTH, maxWidth),
  };
}

export function clampWorkspaceNavigationWidth(
  requestedWidth: number,
  containerWidth: number,
  minimumMainContentWidth: number
): number {
  const bounds = workspaceNavigationBounds(
    containerWidth,
    minimumMainContentWidth
  );
  const safeRequested = Number.isFinite(requestedWidth)
    ? requestedWidth
    : WORKSPACE_NAVIGATION_DEFAULT_WIDTH;
  return Math.min(bounds.maxWidth, Math.max(bounds.minWidth, safeRequested));
}

export function parseWorkspaceNavigationPreference(raw: string | null): number {
  if (!raw) {
    return WORKSPACE_NAVIGATION_DEFAULT_WIDTH;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== WORKSPACE_NAVIGATION_SPLITTER_PREFERENCE_VERSION ||
      !("width" in parsed) ||
      typeof parsed.width !== "number" ||
      !Number.isFinite(parsed.width) ||
      parsed.width < WORKSPACE_NAVIGATION_MIN_WIDTH ||
      parsed.width > WORKSPACE_NAVIGATION_MAX_WIDTH
    ) {
      return WORKSPACE_NAVIGATION_DEFAULT_WIDTH;
    }
    return parsed.width;
  } catch {
    return WORKSPACE_NAVIGATION_DEFAULT_WIDTH;
  }
}

export function serializeWorkspaceNavigationPreference(width: number): string {
  return JSON.stringify({
    version: WORKSPACE_NAVIGATION_SPLITTER_PREFERENCE_VERSION,
    width,
  });
}

export function workspaceNavigationGridColumns(
  navigationWidth: number,
  projectMode: boolean
): string {
  const centerAndTask = projectMode ? "minmax(0, 1fr)" : "minmax(0, 1fr) 220px";
  return `${navigationWidth}px ${WORKSPACE_NAVIGATION_SPLITTER_WIDTH}px ${centerAndTask}`;
}
