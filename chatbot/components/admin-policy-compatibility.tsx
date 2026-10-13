"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminPolicyCompatibilityEntry } from "@/lib/policy-intelligence/admin-api";

const durableStateLabels: Record<
  AdminPolicyCompatibilityEntry["durableState"],
  string
> = {
  not_managed: "Not in the database",
  draft: "Durable draft exists",
  published: "Durable version published",
  withdrawn: "Durable version withdrawn",
};

/**
 * Owner-host correction: the bundled compatibility registry the public page
 * lists alongside durable policies. These entries carry no database identity,
 * so they are shown separately with explicit storage/provenance labels and can
 * only be brought under Policy Editor management through the controlled,
 * idempotent import action (which creates a draft — never a publication).
 */
export function AdminPolicyCompatibility({
  entries,
}: {
  entries: AdminPolicyCompatibilityEntry[];
}) {
  const router = useRouter();
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function importEntry(slug: string) {
    setPendingSlug(slug);
    setNotice(null);
    try {
      const response = await fetch(
        "/api/admin/policy-intelligence/compatibility-import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        }
      );
      const data = (await response.json().catch(() => null)) as {
        outcome?: "draft_created" | "already_managed";
        error?: string;
      } | null;
      if (!response.ok) {
        setNotice(data?.error ?? "Unable to import this compatibility entry.");
        return;
      }
      setNotice(
        data?.outcome === "already_managed"
          ? "This policy is already managed in the database; nothing was duplicated."
          : "Draft created in the Policy Editor workspace. Review and publish it there; the durable revision then replaces the compatibility card."
      );
      router.refresh();
    } catch {
      setNotice("Unable to import this compatibility entry.");
    } finally {
      setPendingSlug(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">
          Compatibility registry (bundled content)
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          These human-compiled entries live in the bundled registry (
          <code>content/policy-intelligence/registry.ts</code>) and are also
          shown on the public Policy Intelligence page. They are reviewed
          compatibility content, not AI-verified analysis and not official
          source text. Importing one creates a draft under normal Policy Editor
          management; a published durable version supersedes the compatibility
          card, and archived durable items are never replaced by it.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Policy / source</th>
              <th className="px-4 py-3 font-semibold">Source date</th>
              <th className="px-4 py-3 font-semibold">Storage</th>
              <th className="px-4 py-3 font-semibold">Provenance</th>
              <th className="px-4 py-3 font-semibold">Durable state</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <CompatibilityRow
                entry={entry}
                key={entry.slug}
                onImport={importEntry}
                pendingSlug={pendingSlug}
              />
            ))}
          </tbody>
        </table>
      </div>
      {notice ? (
        <p
          aria-live="polite"
          className="border-t border-slate-100 px-4 py-3 text-sm text-slate-700"
        >
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function CompatibilityRow({
  entry,
  pendingSlug,
  onImport,
}: {
  entry: AdminPolicyCompatibilityEntry;
  pendingSlug: string | null;
  onImport: (slug: string) => Promise<void>;
}) {
  return (
    <tr>
      <td className="px-4 py-4 align-top">
        <p className="font-semibold text-slate-900">{entry.title.en}</p>
        <p className="mt-1 text-xs text-slate-500">{entry.title["zh-CN"]}</p>
        <p className="mt-1 text-xs text-slate-500">
          {entry.authority} · {entry.slug}
        </p>
        <a
          className="mt-1 block break-all text-xs text-sky-800 underline"
          href={entry.officialUrl}
          rel="noreferrer"
          target="_blank"
        >
          {entry.officialUrl}
        </a>
      </td>
      <td className="px-4 py-4 align-top text-slate-700">{entry.sourceDate}</td>
      <td className="px-4 py-4 align-top text-slate-700">Bundled registry</td>
      <td className="px-4 py-4 align-top text-slate-700">
        Reviewed compatibility content
      </td>
      <td className="px-4 py-4 align-top text-slate-700">
        {durableStateLabels[entry.durableState]}
      </td>
      <td className="px-4 py-4 align-top">
        {entry.durableState === "not_managed" ? (
          <button
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            disabled={pendingSlug !== null}
            onClick={() => onImport(entry.slug).catch(() => undefined)}
            type="button"
          >
            {pendingSlug === entry.slug
              ? "Importing…"
              : "Import into Policy Editor"}
          </button>
        ) : (
          <span className="text-xs text-slate-500">
            {entry.durableState === "draft"
              ? "Draft awaiting review in the Policy Editor workspace."
              : entry.durableState === "published"
                ? "Durable version is the public policy for this slug."
                : "Durable version withdrawn; the compatibility entry stays hidden."}
          </span>
        )}
      </td>
    </tr>
  );
}
