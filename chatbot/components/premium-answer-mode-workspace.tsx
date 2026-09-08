"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ASSISTANT_MODE_STORAGE_KEY,
  type AssistantMode,
  type AssistantModeAccessPolicy,
  normalizeAssistantMode,
  resolveAllowedAssistantMode,
} from "@/lib/assistant-mode";
import { ImmigrationAIWorkspace } from "./immigration-ai-workspace";

export function PremiumAnswerModeWorkspace() {
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("fast");
  const [modeHydrated, setModeHydrated] = useState(false);
  const [accessPolicy, setAccessPolicy] =
    useState<AssistantModeAccessPolicy | null>(null);

  useEffect(() => {
    let active = true;
    const storedMode = window.localStorage.getItem(ASSISTANT_MODE_STORAGE_KEY);

    fetch("/api/assistant-mode-access")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("assistant mode access unavailable");
        }
        return (await response.json()) as AssistantModeAccessPolicy;
      })
      .then((policy) => {
        if (!active) {
          return;
        }
        setAccessPolicy(policy);
        setAssistantMode(resolveAllowedAssistantMode(storedMode, policy));
        setModeHydrated(true);
      })
      .catch(() => {
        if (active) {
          setModeHydrated(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!modeHydrated || !accessPolicy) {
      return;
    }
    window.localStorage.setItem(ASSISTANT_MODE_STORAGE_KEY, assistantMode);
  }, [assistantMode, modeHydrated, accessPolicy]);

  if (!accessPolicy || !modeHydrated) {
    return (
      <section className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Preparing the assistant…
        </div>
      </section>
    );
  }

  const hydratedAccessPolicy = accessPolicy;
  const modeAllowed = (mode: AssistantMode) =>
    mode === "fast"
      ? hydratedAccessPolicy.fastAllowed
      : mode === "default"
        ? hydratedAccessPolicy.slowAllowed
        : hydratedAccessPolicy.premiumAllowed;

  return (
    <>
      <section className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Answer mode
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              Choose speed or verification before sending the next question
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Fast gives a concise first answer with optional native web search.
              Slow / Legal Check uses the current source-aware verification
              pipeline. Premium preserves its existing VIP-only direct path.
            </p>
          </div>

          <div className="mt-4 min-w-[280px] sm:mt-0">
            <label
              className="block text-xs font-medium text-slate-500"
              htmlFor="assistant-mode-select"
            >
              Processing mode
            </label>
            <select
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-[#002b5b] focus:ring-2 focus:ring-cyan-100"
              id="assistant-mode-select"
              onChange={(event) =>
                setAssistantMode((current) => {
                  const next = normalizeAssistantMode(event.target.value);
                  return modeAllowed(next) ? next : current;
                })
              }
              value={assistantMode}
            >
              <option value="fast">Fast — Quick Answer</option>
              <option
                disabled={!hydratedAccessPolicy.slowAllowed}
                value="default"
              >
                Slow — Legal Check
              </option>
              <option
                disabled={!hydratedAccessPolicy.premiumAllowed}
                value="premium"
              >
                Premium — Premium Answer
              </option>
            </select>
            {hydratedAccessPolicy.userType === "guest" ? (
              <div className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                <p>Fast is available without signing in.</p>
                <p>
                  Slow is disabled —{" "}
                  <Link className="font-semibold underline" href="/login">
                    sign in to use Legal Check
                  </Link>
                  .
                </p>
                <p>Premium is disabled — VIP membership required.</p>
              </div>
            ) : assistantMode === "premium" ? (
              <div className="mt-2 space-y-1 text-xs leading-5 text-amber-700">
                <p>
                  Premium is the existing direct answer lane for VIP members.
                </p>
              </div>
            ) : assistantMode === "fast" ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Speed-first answer; native web search is used only when Luna
                decides freshness matters. Use Legal Check for deeper
                source-aware verification.
              </p>
            ) : (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Slow mode keeps the source-aware legal workflow.
              </p>
            )}
          </div>
        </div>
      </section>

      <ImmigrationAIWorkspace assistantMode={assistantMode} />
    </>
  );
}
