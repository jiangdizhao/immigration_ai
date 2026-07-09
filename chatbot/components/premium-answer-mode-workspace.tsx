"use client";

import { useEffect, useRef, useState } from "react";
import { ImmigrationAIWorkspace } from "./immigration-ai-workspace";

type AssistantMode = "default_legal_pipeline" | "premium_direct_gpt55_high";

const ASSISTANT_MODE_STORAGE_KEY = "immigration-assistant-mode";

function isAssistantMode(value: string | null): value is AssistantMode {
  return value === "default_legal_pipeline" || value === "premium_direct_gpt55_high";
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function shouldRouteToPremiumDirect(url: string) {
  return url === "/api/widget-chat" || url.endsWith("/api/widget-chat");
}

export function PremiumAnswerModeWorkspace() {
  const [assistantMode, setAssistantMode] = useState<AssistantMode>(
    "default_legal_pipeline"
  );
  const assistantModeRef = useRef<AssistantMode>(assistantMode);

  useEffect(() => {
    const stored = window.localStorage.getItem(ASSISTANT_MODE_STORAGE_KEY);
    if (isAssistantMode(stored)) {
      setAssistantMode(stored);
      assistantModeRef.current = stored;
    }
  }, []);

  useEffect(() => {
    assistantModeRef.current = assistantMode;
    window.localStorage.setItem(ASSISTANT_MODE_STORAGE_KEY, assistantMode);
  }, [assistantMode]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const isPremium = assistantModeRef.current === "premium_direct_gpt55_high";
      const method = String(init?.method ?? "GET").toUpperCase();

      if (
        isPremium &&
        method === "POST" &&
        shouldRouteToPremiumDirect(url) &&
        typeof init?.body === "string"
      ) {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          return originalFetch("/api/widget-chat-direct", {
            ...init,
            body: JSON.stringify({
              ...body,
              assistantMode: "premium_direct_gpt55_high",
            }),
          });
        } catch (error) {
          console.warn("Unable to route premium direct request; using default route", error);
        }
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

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
              Default legal check uses the current Schedule/RAG verification pipeline. GPT-5.5 High quick answer keeps the politics-sensitive filter, then skips the slower legal-source helper chain for a model-only answer.
            </p>
          </div>

          <div className="mt-4 min-w-[280px] sm:mt-0">
            <label className="block text-xs font-medium text-slate-500" htmlFor="assistant-mode-select">
              Processing mode
            </label>
            <select
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-[#002b5b] focus:ring-2 focus:ring-cyan-100"
              id="assistant-mode-select"
              onChange={(event) => setAssistantMode(event.target.value as AssistantMode)}
              value={assistantMode}
            >
              <option value="default_legal_pipeline">Default legal check</option>
              <option value="premium_direct_gpt55_high">GPT-5.5 High quick answer</option>
            </select>
            {assistantMode === "premium_direct_gpt55_high" ? (
              <p className="mt-2 text-xs leading-5 text-amber-700">
                Fast mode is not source-verified. Use it for customer-friendly first views, not final case advice.
              </p>
            ) : (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Safer default mode keeps the source-aware legal workflow.
              </p>
            )}
          </div>
        </div>
      </section>

      <ImmigrationAIWorkspace />
    </>
  );
}
