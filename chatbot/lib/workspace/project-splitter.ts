export const PROJECT_SPLITTER_PREFERENCE_KEY =
  "phase15.project-workspace.split.v1";

export const PROJECT_SPLITTER_HANDLE_WIDTH = 24;
export const PROJECT_SPLITTER_MIN_CENTER = 460;
export const PROJECT_SPLITTER_MIN_RIGHT = 300;
export const PROJECT_SPLITTER_DEFAULT_RATIO = 0.66;
export const PROJECT_SPLITTER_PREFERENCE_VERSION = 1;

export function normalizeProjectSplitRatio(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value >= 1
  ) {
    return null;
  }
  return value;
}

export function parseProjectSplitPreference(raw: string | null): number {
  if (!raw) {
    return PROJECT_SPLITTER_DEFAULT_RATIO;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== PROJECT_SPLITTER_PREFERENCE_VERSION ||
      !("centerRatio" in parsed)
    ) {
      return PROJECT_SPLITTER_DEFAULT_RATIO;
    }
    return (
      normalizeProjectSplitRatio(parsed.centerRatio) ??
      PROJECT_SPLITTER_DEFAULT_RATIO
    );
  } catch {
    return PROJECT_SPLITTER_DEFAULT_RATIO;
  }
}

export function projectSplitBounds(availableWidth: number): {
  minCenter: number;
  maxCenter: number;
} {
  const safeAvailableWidth = Number.isFinite(availableWidth)
    ? Math.max(0, availableWidth)
    : 0;
  const usable = Math.max(
    0,
    safeAvailableWidth - PROJECT_SPLITTER_HANDLE_WIDTH
  );
  const maxCenter = Math.max(0, usable - PROJECT_SPLITTER_MIN_RIGHT);
  const minCenter = Math.min(PROJECT_SPLITTER_MIN_CENTER, maxCenter);
  return { maxCenter, minCenter };
}

export function clampProjectCenterWidth(
  requestedWidth: number,
  availableWidth: number
): number {
  const { maxCenter, minCenter } = projectSplitBounds(availableWidth);
  const safeRequestedWidth = Number.isFinite(requestedWidth)
    ? requestedWidth
    : minCenter;
  return Math.min(maxCenter, Math.max(minCenter, safeRequestedWidth));
}

export function projectCenterWidthForRatio(
  ratio: number,
  availableWidth: number
): number {
  const safeAvailableWidth = Number.isFinite(availableWidth)
    ? Math.max(0, availableWidth)
    : 0;
  const usable = Math.max(
    0,
    safeAvailableWidth - PROJECT_SPLITTER_HANDLE_WIDTH
  );
  const safeRatio =
    normalizeProjectSplitRatio(ratio) ?? PROJECT_SPLITTER_DEFAULT_RATIO;
  // Browser layout widths are subpixel values, but ratio round-trips can add
  // floating point noise (for example 460 -> 460.00000000000006). Keep useful
  // pointer precision while making persisted widths stable to 0.01 CSS pixels.
  const requestedWidth = Math.round(usable * safeRatio * 100) / 100;
  return clampProjectCenterWidth(requestedWidth, safeAvailableWidth);
}

export function projectSplitRatioForCenterWidth(
  centerWidth: number,
  availableWidth: number
): number {
  const safeAvailableWidth = Number.isFinite(availableWidth)
    ? Math.max(0, availableWidth)
    : 0;
  const usable = safeAvailableWidth - PROJECT_SPLITTER_HANDLE_WIDTH;
  if (usable <= 0) {
    return PROJECT_SPLITTER_DEFAULT_RATIO;
  }
  const clampedCenterWidth = clampProjectCenterWidth(
    centerWidth,
    safeAvailableWidth
  );
  return (
    normalizeProjectSplitRatio(clampedCenterWidth / usable) ??
    PROJECT_SPLITTER_DEFAULT_RATIO
  );
}

export function projectWorkspaceSplitColumns(centerColumn: string): string {
  return `${centerColumn} ${PROJECT_SPLITTER_HANDLE_WIDTH}px minmax(300px, 1fr)`;
}
