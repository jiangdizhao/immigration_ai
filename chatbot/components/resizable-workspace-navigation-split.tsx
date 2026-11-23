"use client";

import { GripVertical } from "lucide-react";
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
  clampWorkspaceNavigationWidth,
  parseWorkspaceNavigationPreference,
  serializeWorkspaceNavigationPreference,
  WORKSPACE_NAVIGATION_DEFAULT_WIDTH,
  WORKSPACE_NAVIGATION_KEYBOARD_STEP,
  WORKSPACE_NAVIGATION_SPLITTER_PREFERENCE_KEY,
  workspaceNavigationBounds,
  workspaceNavigationGridColumns,
} from "@/lib/workspace/workspace-navigation-splitter";

type NavigationSeparatorHandlers = {
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
};

function readSavedWidth(): number {
  try {
    return parseWorkspaceNavigationPreference(
      window.localStorage.getItem(WORKSPACE_NAVIGATION_SPLITTER_PREFERENCE_KEY)
    );
  } catch {
    return WORKSPACE_NAVIGATION_DEFAULT_WIDTH;
  }
}

function saveWidth(width: number) {
  try {
    window.localStorage.setItem(
      WORKSPACE_NAVIGATION_SPLITTER_PREFERENCE_KEY,
      serializeWorkspaceNavigationPreference(width)
    );
  } catch {
    // Layout preferences are optional; storage denial does not affect navigation.
  }
}

export function useResizableWorkspaceNavigationSplit({
  enabled,
  minimumMainContentWidth,
  projectMode,
}: {
  enabled: boolean;
  minimumMainContentWidth: number;
  projectMode: boolean;
}): {
  bounds: { minWidth: number; maxWidth: number };
  containerRef: Ref<HTMLDivElement>;
  gridTemplateColumns: string;
  navigationWidth: number;
  separatorHandlers: NavigationSeparatorHandlers;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragPointerId = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const preferredWidthRef = useRef(WORKSPACE_NAVIGATION_DEFAULT_WIDTH);
  const [preferredWidth, setPreferredWidth] = useState(
    WORKSPACE_NAVIGATION_DEFAULT_WIDTH
  );
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const saved = readSavedWidth();
    preferredWidthRef.current = saved;
    setPreferredWidth(saved);
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const measure = () => setContainerWidth(container.clientWidth);
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(container);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [enabled]);

  const bounds = workspaceNavigationBounds(
    containerWidth,
    minimumMainContentWidth
  );
  const navigationWidth =
    containerWidth > 0
      ? clampWorkspaceNavigationWidth(
          preferredWidth,
          containerWidth,
          minimumMainContentWidth
        )
      : preferredWidth;

  const setWidthFromInput = useCallback(
    (requestedWidth: number) => {
      const width = containerRef.current?.clientWidth ?? containerWidth;
      const next = clampWorkspaceNavigationWidth(
        requestedWidth,
        width,
        minimumMainContentWidth
      );
      preferredWidthRef.current = next;
      setPreferredWidth(next);
    },
    [containerWidth, minimumMainContentWidth]
  );
  const persistWidth = useCallback(
    (requestedWidth: number) => {
      setWidthFromInput(requestedWidth);
      const width = containerRef.current?.clientWidth ?? containerWidth;
      saveWidth(
        clampWorkspaceNavigationWidth(
          requestedWidth,
          width,
          minimumMainContentWidth
        )
      );
    },
    [containerWidth, minimumMainContentWidth, setWidthFromInput]
  );

  const separatorHandlers: NavigationSeparatorHandlers = {
    onKeyDown(event) {
      let next: number | null = null;
      switch (event.key) {
        case "ArrowLeft":
          next = navigationWidth - WORKSPACE_NAVIGATION_KEYBOARD_STEP;
          break;
        case "ArrowRight":
          next = navigationWidth + WORKSPACE_NAVIGATION_KEYBOARD_STEP;
          break;
        case "Home":
          next = bounds.minWidth;
          break;
        case "End":
          next = bounds.maxWidth;
          break;
        default:
          return;
      }
      event.preventDefault();
      persistWidth(next);
    },
    onPointerDown(event) {
      if (event.button !== 0 && event.pointerType !== "touch") {
        return;
      }
      const container = containerRef.current;
      dragOffsetRef.current = container
        ? event.clientX -
          container.getBoundingClientRect().left -
          navigationWidth
        : 0;
      dragPointerId.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    onPointerMove(event) {
      if (dragPointerId.current !== event.pointerId) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const requested =
        event.clientX -
        container.getBoundingClientRect().left -
        dragOffsetRef.current;
      setWidthFromInput(requested);
    },
    onPointerUp(event) {
      if (dragPointerId.current !== event.pointerId) {
        return;
      }
      dragPointerId.current = null;
      dragOffsetRef.current = 0;
      saveWidth(preferredWidthRef.current);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    onPointerCancel(event) {
      if (dragPointerId.current !== event.pointerId) {
        return;
      }
      dragPointerId.current = null;
      dragOffsetRef.current = 0;
      saveWidth(preferredWidthRef.current);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
  };

  return {
    bounds,
    containerRef,
    gridTemplateColumns: workspaceNavigationGridColumns(
      navigationWidth,
      projectMode
    ),
    navigationWidth,
    separatorHandlers,
  };
}

export function WorkspaceNavigationSplitSeparator({
  accessibleLabel,
  bounds,
  controls,
  handlers,
  navigationWidth,
  projectMode,
}: {
  accessibleLabel: string;
  bounds: { minWidth: number; maxWidth: number };
  controls: string;
  handlers: NavigationSeparatorHandlers;
  navigationWidth: number;
  projectMode: boolean;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: an adjustable splitter needs value ARIA, keyboard focus and pointer handlers.
    <div
      aria-controls={controls}
      aria-label={accessibleLabel}
      aria-orientation="vertical"
      aria-valuemax={Math.round(bounds.maxWidth)}
      aria-valuemin={Math.round(bounds.minWidth)}
      aria-valuenow={Math.round(navigationWidth)}
      className={`group relative order-2 hidden min-h-0 min-w-0 cursor-col-resize select-none items-center justify-center border-x border-slate-200 bg-slate-50 transition-colors hover:bg-blue-50 active:bg-blue-100 focus-visible:z-20 focus-visible:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-700 xl:col-start-2 xl:row-start-1 xl:flex ${projectMode ? "xl:row-span-2" : ""}`}
      data-testid="workspace-navigation-splitter"
      role="separator"
      style={{
        cursor: "col-resize",
        height: "100%",
        touchAction: "none",
        userSelect: "none",
      }}
      tabIndex={0}
      {...handlers}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none flex h-12 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition group-hover:border-blue-500 group-hover:text-blue-700 group-active:border-blue-700 group-active:bg-blue-50 group-focus-visible:border-blue-700 group-focus-visible:text-blue-700"
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </span>
    </div>
  );
}
