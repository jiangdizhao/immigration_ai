"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPolicyIntelligenceItem } from "@/lib/policy-intelligence/admin-api";

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeZone: "Australia/Sydney",
  }).format(new Date(value));
}

export function AdminPolicyIntelligence({
  initialItems,
}: {
  initialItems: AdminPolicyIntelligenceItem[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function update(itemId: string, action: "archive" | "restore") {
    setPendingId(itemId);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/policy-intelligence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        setNotice(data?.error ?? "Unable to update this policy item.");
        return;
      }
      setNotice(action === "archive" ? "Policy archived." : "Policy restored.");
      router.refresh();
    } catch {
      setNotice("Unable to update this policy item.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Policy / source</th>
              <th className="px-4 py-3 font-semibold">Source status</th>
              <th className="px-4 py-3 font-semibold">Editorial status</th>
              <th className="px-4 py-3 font-semibold">Published / updated</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialItems.map((item) => {
              const archived = item.editorialStatus === "archived";
              return (
                <tr key={item.id}>
                  <td className="px-4 py-4 align-top">
                    <p className="font-semibold text-slate-900">
                      {item.title ?? item.slug}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.authority ?? item.sourceConfigId} · {item.slug}
                    </p>
                  </td>
                  <td className="px-4 py-4 align-top text-slate-700">
                    {item.sourceStatus}
                  </td>
                  <td className="px-4 py-4 align-top text-slate-700">
                    {item.editorialStatus}
                  </td>
                  <td className="px-4 py-4 align-top text-slate-700">
                    {formatDate(item.publishedAt ?? item.updatedAt)}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <button
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      disabled={pendingId !== null}
                      onClick={() =>
                        update(item.id, archived ? "restore" : "archive")
                      }
                      type="button"
                    >
                      {pendingId === item.id
                        ? "Saving…"
                        : archived
                          ? "Restore"
                          : "Archive / Unpublish"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {initialItems.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                  No durable Policy Intelligence items yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {notice ? (
        <p aria-live="polite" className="border-t border-slate-100 px-4 py-3 text-sm text-slate-700">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
