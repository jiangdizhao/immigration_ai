"use client";

import { Home, ListChecks, MessagesSquare, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceCopy } from "@/lib/workspace-copy";

/**
 * Phase 14-A mobile Workspace navigation.
 *
 * This component is presentation only. Every entry invokes a callback the
 * Workspace already owns (`runProjectNavigationAction`, the Project selection /
 * load-sequence guards, the navigation-busy contract), so the bar cannot create,
 * delete or re-origin a Chat and cannot widen any server authorization.
 *
 * It is deliberately rendered only below the existing `xl` breakpoint; the
 * accepted desktop three-column Workspace is unchanged.
 */
export const MOBILE_WORKSPACE_NAV_KEYS = [
  "conversations",
  "projectHome",
  "steps",
  "navigation",
] as const;

export type MobileWorkspaceNavKey = (typeof MOBILE_WORKSPACE_NAV_KEYS)[number];

/** The one shared Sheet is driven by content mode, never by a second drawer. */
export type MobileWorkspaceSheetMode = "steps" | "navigation";

type MobileNavCopy = WorkspaceCopy["mobileNav"];

const ENTRY_COPY_KEYS = {
  conversations: "conversations",
  projectHome: "projectHome",
  steps: "steps",
  navigation: "navigation",
} as const satisfies Record<MobileWorkspaceNavKey, keyof MobileNavCopy>;

const ENTRY_ICONS = {
  conversations: MessagesSquare,
  navigation: PanelRightOpen,
  projectHome: Home,
  steps: ListChecks,
} as const satisfies Record<MobileWorkspaceNavKey, typeof Home>;

export function MobileWorkspaceNavigation({
  copy,
  disabledEntries = [],
  hidden = false,
  openSheetMode = null,
  onSelect,
}: {
  copy: MobileNavCopy;
  /**
   * Entries whose action cannot run while a turn or a conversation load is
   * active. The Workspace still re-checks the same contract, so a disabled entry
   * is a hint rather than the guard.
   */
  disabledEntries?: readonly MobileWorkspaceNavKey[];
  /** The soft keyboard (or an equivalent overlay) owns the viewport. */
  hidden?: boolean;
  openSheetMode?: MobileWorkspaceSheetMode | null;
  onSelect: (key: MobileWorkspaceNavKey) => void;
}) {
  return (
    <nav
      aria-label={copy.label}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgba(0,23,54,0.45)] backdrop-blur xl:hidden",
        hidden ? "hidden" : "block"
      )}
      data-testid="mobile-workspace-nav"
    >
      <ul className="grid grid-cols-4 gap-1 px-1.5 pt-1.5">
        {MOBILE_WORKSPACE_NAV_KEYS.map((key) => {
          const Icon = ENTRY_ICONS[key];
          const label = copy[ENTRY_COPY_KEYS[key]];
          const disabled = disabledEntries.includes(key);
          const opensSheet = key === "steps" || key === "navigation";
          const sheetOpen = opensSheet && openSheetMode === key;
          return (
            <li key={key}>
              <button
                aria-current={sheetOpen ? "true" : undefined}
                aria-expanded={opensSheet ? sheetOpen : undefined}
                aria-haspopup={opensSheet ? "dialog" : undefined}
                className={cn(
                  "flex h-full min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-semibold leading-3 transition",
                  sheetOpen
                    ? "bg-[#001736] text-white"
                    : "text-slate-600 hover:bg-slate-100",
                  disabled
                    ? "cursor-not-allowed text-slate-400 opacity-70 hover:bg-transparent"
                    : ""
                )}
                data-testid={`mobile-nav-${key}`}
                disabled={disabled}
                onClick={() => onSelect(key)}
                title={disabled ? copy.navigationBusyHint : undefined}
                type="button"
              >
                <Icon aria-hidden="true" className="size-5" />
                <span className="w-full truncate text-center">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
