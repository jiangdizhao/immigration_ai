"use client";

import type { ReactNode } from "react";
import { Fragment } from "react";

function stableTextKey(value: string) {
  let hash = 0;
  for (let position = 0; position < value.length; position += 1) {
    hash = (hash * 31 + value.charCodeAt(position)) >>> 0;
  }
  return hash.toString(36);
}

function keyedTextParts(parts: string[]) {
  const counts = new Map<string, number>();
  return parts.map((part) => {
    const count = counts.get(part) ?? 0;
    counts.set(part, count + 1);
    return { key: `${stableTextKey(part || "<blank>")}-${count}`, value: part };
  });
}

function stripOuterPipes(line: string) {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.endsWith("|")) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

function splitMarkdownTableRow(line: string) {
  return stripOuterPipes(line)
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparatorLine(line: string) {
  const cells = splitMarkdownTableRow(line);
  return (
    cells.length >= 2 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))
  );
}

function isPotentialMarkdownTableRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return false;
  }
  return splitMarkdownTableRow(trimmed).length >= 2;
}

function isMarkdownTableStart(lines: string[], index: number) {
  return (
    index + 1 < lines.length &&
    isPotentialMarkdownTableRow(lines[index] ?? "") &&
    isMarkdownTableSeparatorLine(lines[index + 1] ?? "")
  );
}

function normalizeTableRows(rows: string[][], columnCount: number) {
  return rows.map((row) => {
    const normalized = row.slice(0, columnCount);
    while (normalized.length < columnCount) {
      normalized.push("");
    }
    return normalized;
  });
}

function InlineRichText({ text }: { text: string }) {
  const parts = keyedTextParts(
    text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
  );

  return (
    <>
      {parts.map(({ key, value }) => {
        if (!value) {
          return null;
        }
        if (value.startsWith("**") && value.endsWith("**") && value.length > 4) {
          return <strong key={key}>{value.slice(2, -2)}</strong>;
        }
        if (value.startsWith("`") && value.endsWith("`") && value.length > 2) {
          return (
            <code
              className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] text-slate-800"
              key={key}
            >
              {value.slice(1, -1)}
            </code>
          );
        }
        const linkMatch = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const [, label, href] = linkMatch;
          const safeHref = href?.trim() ?? "";
          const isExternal = /^https?:\/\//i.test(safeHref);
          return (
            <a
              className="font-medium text-sky-700 underline decoration-sky-200 underline-offset-2 hover:text-sky-900"
              href={safeHref}
              key={key}
              rel={isExternal ? "noreferrer" : undefined}
              target={isExternal ? "_blank" : undefined}
            >
              {label}
            </a>
          );
        }
        return <span key={key}>{value}</span>;
      })}
    </>
  );
}

function MarkdownTable({ header, rows }: { header: string[]; rows: string[][] }) {
  const columnCount = Math.max(header.length, ...rows.map((row) => row.length), 1);
  const normalizedHeader = normalizeTableRows([header], columnCount)[0] ?? [];
  const normalizedRows = normalizeTableRows(rows, columnCount);

  return (
    <div className="my-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-[680px] border-collapse text-left text-sm leading-6 text-slate-700">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {normalizedHeader.map((cell, index) => (
              <th
                className="border-b border-slate-200 px-3 py-2 align-top"
                key={`${stableTextKey(cell || "header")}-${index}`}
                scope="col"
              >
                <InlineRichText text={cell || "—"} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {normalizedRows.map((row, rowIndex) => (
            <tr
              className="odd:bg-white even:bg-slate-50/70"
              key={`${rowIndex}-${stableTextKey(row.join("|"))}`}
            >
              {row.map((cell, cellIndex) => (
                <td
                  className="border-b border-slate-100 px-3 py-2 align-top last:border-b-0"
                  key={`${rowIndex}-${cellIndex}-${stableTextKey(cell || "cell")}`}
                >
                  <InlineRichText text={cell || "—"} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderLine(line: string, key: string): ReactNode {
  const trimmed = line.trim();

  if (!trimmed) {
    return <div className="h-1" key={`blank-${key}`} />;
  }
  if (trimmed === "---") {
    return <div className="my-3 border-t border-slate-200" key={`rule-${key}`} />;
  }
  if (trimmed.startsWith("### ")) {
    return (
      <h4 className="pt-2 text-sm font-semibold leading-6 text-slate-900" key={`h3-${key}`}>
        <InlineRichText text={trimmed.replace(/^###\s+/, "")} />
      </h4>
    );
  }
  if (trimmed.startsWith("## ")) {
    return (
      <h3 className="pt-2 text-base font-semibold leading-7 text-slate-950" key={`h2-${key}`}>
        <InlineRichText text={trimmed.replace(/^##\s+/, "")} />
      </h3>
    );
  }
  if (trimmed.startsWith("# ")) {
    return (
      <h2 className="pt-2 text-lg font-semibold leading-8 text-slate-950" key={`h1-${key}`}>
        <InlineRichText text={trimmed.replace(/^#\s+/, "")} />
      </h2>
    );
  }
  if (/^[-*]\s+/.test(trimmed)) {
    return (
      <div className="flex gap-2 pl-1 text-[15px] leading-7 text-slate-800" key={`li-${key}`}>
        <span className="mt-[0.65rem] size-1.5 shrink-0 rounded-full bg-slate-400" />
        <span>
          <InlineRichText text={trimmed.replace(/^[-*]\s+/, "")} />
        </span>
      </div>
    );
  }
  if (/^\d+[.)）]\s+/.test(trimmed)) {
    return (
      <p className="pl-1 text-[15px] leading-7 text-slate-800" key={`num-${key}`}>
        <InlineRichText text={trimmed} />
      </p>
    );
  }
  if (trimmed.startsWith(">")) {
    return (
      <blockquote
        className="rounded-2xl border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-[15px] leading-7 text-slate-700"
        key={`quote-${key}`}
      >
        <InlineRichText text={trimmed.replace(/^>\s?/, "")} />
      </blockquote>
    );
  }

  return (
    <p className="text-[15px] leading-7 text-slate-800" key={`p-${key}`}>
      <InlineRichText text={trimmed} />
    </p>
  );
}

export function AssistantRichMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (isMarkdownTableStart(lines, index)) {
      const header = splitMarkdownTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && isPotentialMarkdownTableRow(lines[index] ?? "")) {
        rows.push(splitMarkdownTableRow(lines[index] ?? ""));
        index += 1;
      }
      blocks.push(
        <MarkdownTable
          header={header}
          key={`table-${blocks.length}-${stableTextKey(header.join("|"))}`}
          rows={rows}
        />
      );
      continue;
    }

    blocks.push(
      <Fragment key={`line-${index}-${stableTextKey(line || "<blank>")}`}>
        {renderLine(line, `${index}-${stableTextKey(line || "<blank>")}`)}
      </Fragment>
    );
    index += 1;
  }

  return <div className="space-y-2">{blocks}</div>;
}
