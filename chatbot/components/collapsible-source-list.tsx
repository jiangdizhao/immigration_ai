"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SourceListItem = {
  label: string;
  href?: string;
};

type CollapsibleSourceListProps = {
  items: readonly (SourceListItem | string)[];
  label: string;
  className?: string;
};

function normalizeItem(item: SourceListItem | string): SourceListItem {
  if (typeof item === "string") {
    const url = item.match(/https?:\/\/\S+/i)?.[0];
    return {
      label: item,
      href: url,
    };
  }
  return item;
}

function renderSourceItem(item: SourceListItem, index: number): ReactNode {
  const content = item.href ? (
    <a
      className="min-w-0 break-all underline decoration-slate-300 underline-offset-2 hover:text-slate-950"
      href={item.href}
      rel="noreferrer"
      target="_blank"
    >
      {item.label}
    </a>
  ) : (
    <span className="min-w-0 break-words">{item.label}</span>
  );

  return (
    <li
      className="flex min-w-0 items-start gap-2"
      key={`${item.label}-${index}`}
    >
      <span aria-hidden="true" className="mt-1 shrink-0 text-slate-400">
        •
      </span>
      {content}
    </li>
  );
}

export function CollapsibleSourceList({
  items,
  label,
  className,
}: CollapsibleSourceListProps) {
  if (!items.length) {
    return null;
  }

  const normalizedItems = items.map(normalizeItem);

  return (
    <details
      className={cn("min-w-0 max-w-full text-sm text-slate-700", className)}
      data-testid="source-disclosure"
    >
      <summary className="group flex min-w-0 cursor-pointer list-none items-center rounded-xl px-1 py-1 text-left font-medium text-slate-700 outline-none transition hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-sky-300 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="mr-2 inline-block text-xs text-slate-400 transition-transform group-open:rotate-90"
        >
          ▶
        </span>
        <span>
          {label} ({normalizedItems.length})
        </span>
      </summary>
      <ul className="mt-2 min-w-0 space-y-1.5 pl-2 leading-6">
        {normalizedItems.map(renderSourceItem)}
      </ul>
    </details>
  );
}
