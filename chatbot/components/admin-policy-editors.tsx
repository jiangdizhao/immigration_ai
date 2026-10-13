"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EditorialGrantRow } from "@/lib/policy-intelligence/editorial-core";

function formatDateTime(value: Date | string | null) {
  if (!value) {
    return "—";
  }
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  }).format(date);
}

type GrantView = {
  userId: string;
  email: string;
  grantedAt: string | null;
  revokedAt: string | null;
};

function toGrantView(grant: EditorialGrantRow): GrantView {
  const toIso = (value: Date | string | null) =>
    value === null ? null : new Date(value).toISOString();
  return {
    userId: grant.userId,
    email: grant.email,
    grantedAt: toIso(grant.grantedAt),
    revokedAt: toIso(grant.revokedAt),
  };
}

/**
 * Administrators grant and revoke the explicit Policy Editor capability here.
 * Per D-070 the Admin account is the firm's principal lawyer and already holds
 * full editorial authority; the grant system extends the same capability to
 * other verified lawyers, and only a verified lawyer account may hold it.
 */
export function AdminPolicyEditors({
  initialGrants,
}: {
  initialGrants: EditorialGrantRow[];
}) {
  const router = useRouter();
  const [grants, setGrants] = useState<GrantView[]>(
    initialGrants.map(toGrantView)
  );
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function update(action: "grant" | "revoke", target: string) {
    setPending(`${action}:${target}`);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/policy-editors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target, action }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        reactivated?: boolean;
        outcome?: "revoked" | "already_revoked" | "not_granted";
      } | null;
      if (!response.ok) {
        setNotice(data?.error ?? "Unable to update this capability.");
        return;
      }
      // R3 P0: report the real revoke outcome — a user who was never granted
      // the capability, or whose grant was already revoked, must not be shown as
      // if a change happened (and no grant exists to display).
      if (action === "revoke") {
        if (data?.outcome === "not_granted") {
          setNotice(
            `${target} never held the Policy Editor capability; nothing changed.`
          );
          return;
        }
        if (data?.outcome === "already_revoked") {
          setNotice(
            `${target} already had no active Policy Editor capability; nothing changed.`
          );
          return;
        }
      }
      setNotice(
        action === "grant"
          ? data?.reactivated
            ? `Policy Editor capability re-activated for ${target}.`
            : `Policy Editor capability granted to ${target}.`
          : `Policy Editor capability revoked for ${target}.`
      );
      setGrants((current) => {
        if (action === "grant") {
          const existing = current.find((grant) => grant.email === target);
          const rest = current.filter((grant) => grant.email !== target);
          return [
            {
              userId: existing?.userId ?? target,
              email: target,
              grantedAt: new Date().toISOString(),
              revokedAt: null,
            },
            ...rest,
          ];
        }
        return current.map((grant) =>
          grant.email === target
            ? { ...grant, revokedAt: new Date().toISOString() }
            : grant
        );
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-bold text-[#092c52]">
          Policy Editor capability
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          The Admin account is the firm&apos;s principal lawyer and already
          holds full Policy Intelligence editorial authority (publishing,
          overriding, archiving, restoring and official-URL submission) without
          needing a grant. This page extends the same editorial capability to
          other staff: only a verified lawyer account may hold an active Policy
          Editor grant, and ordinary lawyers, customer accounts and unverified
          accounts cannot be granted it.
        </p>
      </header>
      <div className="px-5 py-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const target = email.trim().toLowerCase();
            if (target) {
              update("grant", target).catch(() => undefined);
            }
          }}
        >
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-semibold text-slate-700">
            Account email
            <input
              className="border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="lawyer@example.com"
              type="email"
              value={email}
            />
          </label>
          <button
            className="border border-[#092c52] bg-[#092c52] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            disabled={pending !== null || email.trim().length === 0}
            type="submit"
          >
            {pending?.startsWith("grant") ? "Granting…" : "Grant capability"}
          </button>
        </form>
        {notice ? (
          <p className="mt-3 text-xs font-medium text-slate-700">{notice}</p>
        ) : null}
        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">Account</th>
              <th className="py-2 pr-3">Granted</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {grants.length === 0 ? (
              <tr>
                <td className="py-3 text-sm text-slate-500" colSpan={4}>
                  No Policy Editor grants yet.
                </td>
              </tr>
            ) : (
              grants.map((grant) => (
                <tr className="border-b border-slate-100" key={grant.userId}>
                  <td className="py-2 pr-3 text-slate-900">{grant.email}</td>
                  <td className="py-2 pr-3 text-slate-600">
                    {formatDateTime(grant.grantedAt)}
                  </td>
                  <td className="py-2 pr-3">
                    {grant.revokedAt ? (
                      <span className="text-slate-500">
                        Revoked {formatDateTime(grant.revokedAt)}
                      </span>
                    ) : (
                      <span className="font-semibold text-emerald-700">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    {grant.revokedAt ? (
                      <button
                        className="text-xs font-semibold text-[#092c52] underline"
                        disabled={pending !== null}
                        onClick={() =>
                          update("grant", grant.email).catch(() => undefined)
                        }
                        type="button"
                      >
                        Re-grant
                      </button>
                    ) : (
                      <button
                        className="text-xs font-semibold text-red-700 underline"
                        disabled={pending !== null}
                        onClick={() =>
                          update("revoke", grant.email).catch(() => undefined)
                        }
                        type="button"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
