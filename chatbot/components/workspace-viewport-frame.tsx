"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";

/**
 * Keep the workspace inside the visible viewport. `dvh` follows browser chrome,
 * while VisualViewport updates also account for mobile keyboards that resize
 * the visual viewport without resizing the layout viewport.
 */
export function WorkspaceViewportFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateHeight = () => {
      const height = viewport?.height ?? window.innerHeight;
      const frame = frameRef.current;
      if (frame && Number.isFinite(height) && height > 0) {
        frame.style.height = `${Math.round(height)}px`;
      }
    };
    const frame = frameRef.current;
    let observedNavigation: HTMLElement | null = null;
    const updateNavigationInset = () => {
      const currentFrame = frameRef.current;
      if (!currentFrame) {
        return;
      }
      const navigation = currentFrame.querySelector<HTMLElement>(
        '[data-testid="mobile-workspace-nav"]'
      );
      if (navigation !== observedNavigation) {
        if (observedNavigation) {
          navigationObserver.unobserve(observedNavigation);
        }
        observedNavigation = navigation;
        if (navigation) {
          navigationObserver.observe(navigation);
        }
      }
      if (!navigation) {
        currentFrame.style.removeProperty(
          "--workspace-mobile-navigation-inset"
        );
        return;
      }
      const isVisible = getComputedStyle(navigation).display !== "none";
      const height = isVisible
        ? Math.ceil(navigation.getBoundingClientRect().height)
        : 0;
      currentFrame.style.setProperty(
        "--workspace-mobile-navigation-inset",
        `${height}px`
      );
    };
    const navigationObserver = new ResizeObserver(updateNavigationInset);
    const navigationMutationObserver = new MutationObserver(
      updateNavigationInset
    );
    if (frame) {
      navigationMutationObserver.observe(frame, {
        attributes: true,
        attributeFilter: ["class"],
        childList: true,
        subtree: true,
      });
    }

    updateHeight();
    updateNavigationInset();
    window.addEventListener("resize", updateHeight);
    viewport?.addEventListener("resize", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
      viewport?.removeEventListener("resize", updateHeight);
      navigationObserver.disconnect();
      navigationMutationObserver.disconnect();
      frameRef.current?.style.removeProperty("height");
      frameRef.current?.style.removeProperty(
        "--workspace-mobile-navigation-inset"
      );
    };
  }, []);

  return (
    <div
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f3f5f7] text-slate-900"
      data-testid="workspace-viewport-frame"
      ref={frameRef}
      style={
        {
          "--workspace-mobile-navigation-inset":
            "calc(3.5rem + env(safe-area-inset-bottom))",
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
