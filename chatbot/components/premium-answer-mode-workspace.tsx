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
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import { ImmigrationAIWorkspace } from "./immigration-ai-workspace";
import { useSiteLocale } from "./site-locale-provider";

export function PremiumAnswerModeWorkspace() {
  const { locale } = useSiteLocale();
  const copy = getWorkspaceCopy(locale).mode;
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
      <section className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          {copy.loading}
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
      <section className="mx-auto w-full max-w-[1600px] px-4 pt-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 rounded-2xl bg-white/90 px-4 py-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {copy.title}
            </span>
            <span
              aria-hidden="true"
              className="hidden h-5 w-px bg-slate-200 sm:block"
            />
            <p className="min-w-0 text-sm leading-5 text-slate-600">
              {assistantMode === "fast"
                ? copy.fastDescription
                : assistantMode === "default"
                  ? copy.legalCheckDescription
                  : copy.premiumDescription}
            </p>
          </div>

          <div className="w-full shrink-0 sm:w-auto sm:min-w-[260px]">
            <label className="sr-only" htmlFor="assistant-mode-select">
              {copy.processingMode}
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#002b5b] focus:ring-2 focus:ring-cyan-100"
              id="assistant-mode-select"
              onChange={(event) =>
                setAssistantMode((current) => {
                  const next = normalizeAssistantMode(event.target.value);
                  return modeAllowed(next) ? next : current;
                })
              }
              value={assistantMode}
            >
              <option value="fast">{copy.fast}</option>
              <option
                disabled={!hydratedAccessPolicy.slowAllowed}
                value="default"
              >
                {copy.legalCheck}
              </option>
              <option
                disabled={!hydratedAccessPolicy.premiumAllowed}
                value="premium"
              >
                {copy.premium}
              </option>
            </select>
            {hydratedAccessPolicy.userType === "guest" ? (
              <div className="mt-2 flex flex-wrap gap-x-1 text-xs leading-5 text-slate-600">
                <span>{copy.guestFast}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {copy.guestLegalCheck}{" "}
                  <Link className="font-semibold underline" href="/login">
                    {copy.signIn}
                  </Link>
                </span>
                <span aria-hidden="true">·</span>
                <span>{copy.guestPremium}</span>
              </div>
            ) : assistantMode === "premium" ? (
              <div className="mt-2 text-xs leading-5 text-amber-700">
                {copy.premiumDescription}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <ImmigrationAIWorkspace assistantMode={assistantMode} />
    </>
  );
}
