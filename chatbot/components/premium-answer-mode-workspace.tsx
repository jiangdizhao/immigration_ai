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
import type { PolicyLaunchRequestState } from "@/lib/policy-intelligence/conversation-policy-binding";
import type { PolicyWorkspaceReference } from "@/lib/policy-intelligence-product";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import { ImmigrationAIWorkspace } from "./immigration-ai-workspace";
import { useSiteLocale } from "./site-locale-provider";

export function PremiumAnswerModeWorkspace({
  policyReference = null,
  policyLaunch = false,
  policyLaunchState = "resolved",
  requestedPolicySlug = null,
  initialChatId = null,
  projectWorkspaceEnabled = false,
  schoolApplicationsEnabled = false,
  schoolAdmissionsEnabled = false,
}: {
  policyReference?: PolicyWorkspaceReference | null;
  policyLaunch?: boolean;
  /** Phase 12 Stage 2 explicit policy launch state from the server page. */
  policyLaunchState?: PolicyLaunchRequestState;
  requestedPolicySlug?: string | null;
  initialChatId?: string | null;
  /** Server-derived registered-customer and Project Chat write capability. */
  projectWorkspaceEnabled?: boolean;
  /** Phase 13 M5.1 capability; default OFF and re-checked by the API. */
  schoolApplicationsEnabled?: boolean;
  /** Phase 13 M5.2 capability; default OFF and re-checked by the API. */
  schoolAdmissionsEnabled?: boolean;
}) {
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
    <div className="flex min-h-0 flex-col xl:h-full">
      {/*
        Phase 12 Stage 2 compact toolbar: one row on every viewport. The mode
        description is kept as an accessible hint instead of a permanent block so
        the conversation area gets the space back.
      */}
      <section className="mx-auto w-full shrink-0 max-w-[1600px] px-3 pt-2 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {copy.title}
          </span>
          <p className="hidden min-w-0 flex-1 truncate text-xs leading-5 text-slate-600 lg:block">
            {assistantMode === "fast"
              ? copy.fastDescription
              : assistantMode === "default"
                ? copy.legalCheckDescription
                : copy.premiumDescription}
          </p>
          <div className="min-w-0 flex-1 sm:flex-none sm:min-w-[220px]">
            <label className="sr-only" htmlFor="assistant-mode-select">
              {copy.processingMode}
            </label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#002b5b] focus:ring-2 focus:ring-cyan-100"
              data-testid="assistant-mode-select"
              id="assistant-mode-select"
              onChange={(event) => {
                const next = normalizeAssistantMode(event.target.value);
                setAssistantMode((current) =>
                  modeAllowed(next) ? next : current
                );
              }}
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
          </div>
          {hydratedAccessPolicy.userType === "guest" ? (
            <div className="flex w-full flex-wrap gap-x-1 text-[11px] leading-5 text-slate-600">
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
          ) : !hydratedAccessPolicy.slowAllowed ||
            !hydratedAccessPolicy.premiumAllowed ? (
            <div className="flex w-full flex-wrap gap-x-1 text-[11px] leading-5 text-slate-600">
              {hydratedAccessPolicy.slowAllowed ? null : (
                <span>{copy.registeredVipRequired}</span>
              )}
              {hydratedAccessPolicy.premiumAllowed ? null : (
                <span>{copy.premiumDescription}</span>
              )}
            </div>
          ) : assistantMode === "premium" ? (
            <span className="text-[11px] leading-5 text-amber-700">
              {copy.premiumDescription}
            </span>
          ) : null}
        </div>
      </section>

      <ImmigrationAIWorkspace
        assistantMode={assistantMode}
        initialChatId={initialChatId}
        policyLaunch={policyLaunch}
        policyLaunchState={policyLaunchState}
        policyReference={policyReference}
        projectWorkspaceEnabled={projectWorkspaceEnabled}
        requestedPolicySlug={requestedPolicySlug}
        schoolAdmissionsEnabled={schoolAdmissionsEnabled}
        schoolApplicationsEnabled={schoolApplicationsEnabled}
        userType={hydratedAccessPolicy.userType}
      />
    </div>
  );
}
