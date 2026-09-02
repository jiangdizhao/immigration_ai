"use client";

import { useCallback, useEffect, useState } from "react";

type Account = {
  id: string;
  email: string;
  role: "user" | "lawyer";
  membershipTier: "free" | "vip";
  emailVerifiedAt: string | null;
};

export function LawyerAccountManagement() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/lawyers");
    const data = (await response.json()) as {
      users?: Account[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error ?? "Unable to load accounts.");
    }
    setAccounts(data.users ?? []);
  }, []);

  useEffect(() => {
    load().catch((error) =>
      setNotice(
        error instanceof Error ? error.message : "Unable to load accounts."
      )
    );
  }, [load]);

  async function changeRole(account: Account) {
    const role = account.role === "lawyer" ? "user" : "lawyer";
    setNotice(null);
    const response = await fetch(`/api/admin/lawyers/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice(data.error ?? "Unable to update role.");
      return;
    }
    await load();
    setNotice("Lawyer access updated.");
  }

  return (
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Lawyer accounts</h2>
      <p className="mt-2 text-sm text-slate-600">
        Only verified non-guest customer accounts appear here. Membership and
        passwords are unchanged.
      </p>
      <div className="mt-4 space-y-2">
        {accounts.map((account) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"
            key={account.id}
          >
            <div>
              <p className="text-sm font-semibold">{account.email}</p>
              <p className="text-xs text-slate-500">
                {account.role} · {account.membershipTier}
              </p>
            </div>
            <button
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold"
              onClick={() => changeRole(account)}
              type="button"
            >
              {account.role === "lawyer"
                ? "Demote to user"
                : "Promote to lawyer"}
            </button>
          </div>
        ))}
      </div>
      {notice ? <p className="mt-3 text-sm text-slate-700">{notice}</p> : null}
    </section>
  );
}
