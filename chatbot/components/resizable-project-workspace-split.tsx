"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clampProjectCenterWidth,
  PROJECT_SPLITTER_DEFAULT_RATIO,
  PROJECT_SPLITTER_PREFERENCE_KEY,
  PROJECT_SPLITTER_PREFERENCE_VERSION,
  parseProjectSplitPreference,
  projectCenterWidthForRatio,
  projectSplitBounds,
  projectSplitRatioForCenterWidth,
} from "../lib/workspace/project-splitter";

const KEYBOARD_STEP = 32;

export type ProjectWorkspaceSeparatorHandlers = {
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
};

function readSavedRatio(): number {
  try {
    return parseProjectSplitPreference(
      window.localStorage.getItem(PROJECT_SPLITTER_PREFERENCE_KEY)
    );
  } catch {
    return PROJECT_SPLITTER_DEFAULT_RATIO;
  }
}

function writeSavedRatio(ratio: number) {
  try {
    window.localStorage.setItem(
      PROJECT_SPLITTER_PREFERENCE_KEY,
      JSON.stringify({
        centerRatio: ratio,
        version: PROJECT_SPLITTER_PREFERENCE_VERSION,
      })
    );
  } catch {
    // Layout preferences are optional; storage denial must not affect the UI.
  }
}

export function useResizableProjectWorkspaceSplit(enabled: boolean): {
  centerColumn: string;
  centerWidth: number;
  maxCenterWidth: number;
  minCenterWidth: number;
  paneRef: Ref<HTMLDivElement>;
  separatorHandlers: ProjectWorkspaceSeparatorHandlers;
} {
  const paneRef = useRef<HTMLDivElement>(null);
  const dragPointerId = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const ratioRef = useRef(PROJECT_SPLITTER_DEFAULT_RATIO);
  const [centerWidth, setCenterWidth] = useState(0);
  const [preferredRatio, setPreferredRatio] = useState(
    PROJECT_SPLITTER_DEFAULT_RATIO
  );
  const [availableWidth, setAvailableWidth] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const stored = readSavedRatio();
    ratioRef.current = stored;
    setPreferredRatio(stored);
    const pane = paneRef.current;
    if (pane) {
      setCenterWidth(projectCenterWidthForRatio(stored, pane.clientWidth));
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const pane = paneRef.current;
    if (!pane) {
      return;
    }
    const measure = () => {
      const width = pane.clientWidth;
      setAvailableWidth(width);
      setCenterWidth(projectCenterWidthForRatio(ratioRef.current, width));
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(pane);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [enabled]);

  const bounds = projectSplitBounds(availableWidth);
  const setCenterWidthFromInput = useCallback(
    (next: number) => {
      const width = paneRef.current?.clientWidth ?? availableWidth;
      const clamped = clampProjectCenterWidth(next, width);
      const ratio = projectSplitRatioForCenterWidth(clamped, width);
      ratioRef.current = ratio;
      setPreferredRatio(ratio);
      setCenterWidth(clamped);
    },
    [availableWidth]
  );
  const persistCenterWidth = useCallback(
    (next: number) => {
      setCenterWidthFromInput(next);
      const width = paneRef.current?.clientWidth ?? availableWidth;
      const clamped = clampProjectCenterWidth(next, width);
      writeSavedRatio(projectSplitRatioForCenterWidth(clamped, width));
    },
    [availableWidth, setCenterWidthFromInput]
  );

  const getPointerCenter = useCallback(
    (clientX: number) => {
      const pane = paneRef.current;
      if (!pane) {
        return centerWidth;
      }
      return (
        clientX - pane.getBoundingClientRect().left - dragOffsetRef.current
      );
    },
    [centerWidth]
  );

  const separatorHandlers: ProjectWorkspaceSeparatorHandlers = {
    onKeyDown(event) {
      let next: number | null = null;
      switch (event.key) {
        case "ArrowLeft":
          next = centerWidth - KEYBOARD_STEP;
          break;
        case "ArrowRight":
          next = centerWidth + KEYBOARD_STEP;
          break;
        case "Home":
          next = bounds.minCenter;
          break;
        case "End":
          next = bounds.maxCenter;
          break;
        default:
          return;
      }
      event.preventDefault();
      persistCenterWidth(next);
    },
    onPointerDown(event) {
      if (event.button !== 0 && event.pointerType !== "touch") {
        return;
      }
      const pane = paneRef.current;
      dragOffsetRef.current = pane
        ? event.clientX - pane.getBoundingClientRect().left - centerWidth
        : 0;
      dragPointerId.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    onPointerMove(event) {
      if (dragPointerId.current !== event.pointerId) {
        return;
      }
      setCenterWidthFromInput(getPointerCenter(event.clientX));
    },
    onPointerUp(event) {
      if (dragPointerId.current !== event.pointerId) {
        return;
      }
      dragPointerId.current = null;
      dragOffsetRef.current = 0;
      writeSavedRatio(ratioRef.current);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    onPointerCancel(event) {
      if (dragPointerId.current === event.pointerId) {
        dragPointerId.current = null;
        dragOffsetRef.current = 0;
        writeSavedRatio(ratioRef.current);
      }
    },
  };

  return {
    centerColumn:
      centerWidth > 0 ? `${centerWidth}px` : `minmax(0, ${preferredRatio}fr)`,
    centerWidth,
    maxCenterWidth: bounds.maxCenter,
    minCenterWidth: bounds.minCenter,
    paneRef,
    separatorHandlers,
  };
}

export function ProjectWorkspaceSplitSeparator({
  accessibleLabel,
  centerWidth,
  controls,
  handlers,
  maxCenterWidth,
  minCenterWidth,
}: {
  accessibleLabel: string;
  centerWidth: number;
  controls: string;
  handlers: ProjectWorkspaceSeparatorHandlers;
  maxCenterWidth: number;
  minCenterWidth: number;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: an interactive splitter needs value ARIA, keyboard focus, pointer handlers, and a grip child.
    <div
      aria-controls={controls}
      aria-label={accessibleLabel}
      aria-orientation="vertical"
      aria-valuemax={Math.round(maxCenterWidth)}
      aria-valuemin={Math.round(minCenterWidth)}
      aria-valuenow={Math.round(centerWidth)}
      className="group relative order-2 m-0 hidden min-h-0 min-w-0 cursor-col-resize select-none items-center justify-center bg-slate-50 transition-colors hover:bg-blue-50 active:bg-blue-100 focus-visible:z-20 focus-visible:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-700 xl:flex"
      data-testid="project-workspace-splitter"
      role="separator"
      style={{
        alignItems: "center",
        cursor: "col-resize",
        height: "100%",
        justifyContent: "center",
        position: "relative",
        touchAction: "none",
        userSelect: "none",
      }}
      tabIndex={0}
      {...handlers}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-slate-400 transition-colors group-hover:bg-blue-600 group-active:bg-blue-700"
        style={{
          bottom: 0,
          left: "50%",
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          transform: "translateX(-50%)",
          width: 2,
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none relative z-10 flex h-12 w-4 flex-col items-center justify-center gap-1 rounded-full border border-slate-400 bg-white shadow-sm transition-colors group-hover:border-blue-600 group-hover:bg-blue-50 group-focus-visible:border-blue-700 group-focus-visible:bg-blue-50 group-active:bg-blue-100"
        style={{
          alignItems: "center",
          backgroundColor: "white",
          borderRadius: 9999,
          borderStyle: "solid",
          borderWidth: 1,
          boxShadow: "0 1px 3px rgb(15 23 42 / 0.16)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          height: 48,
          justifyContent: "center",
          pointerEvents: "none",
          position: "relative",
          width: 16,
          zIndex: 10,
        }}
      >
        <span
          className="size-1 rounded-full bg-slate-500"
          style={{
            backgroundColor: "#64748b",
            borderRadius: 9999,
            height: 4,
            width: 4,
          }}
        />
        <span
          className="size-1 rounded-full bg-slate-500"
          style={{
            backgroundColor: "#64748b",
            borderRadius: 9999,
            height: 4,
            width: 4,
          }}
        />
        <span
          className="size-1 rounded-full bg-slate-500"
          style={{
            backgroundColor: "#64748b",
            borderRadius: 9999,
            height: 4,
            width: 4,
          }}
        />
      </span>
    </div>
  );
}

export function projectWorkspaceSeparatorAria(input: {
  centerWidth: number;
  maxCenterWidth: number;
  minCenterWidth: number;
}): {
  "aria-valuemax": number;
  "aria-valuemin": number;
  "aria-valuenow": number;
} {
  return {
    "aria-valuemax": Math.round(input.maxCenterWidth),
    "aria-valuemin": Math.round(input.minCenterWidth),
    "aria-valuenow": Math.round(input.centerWidth),
  };
}
