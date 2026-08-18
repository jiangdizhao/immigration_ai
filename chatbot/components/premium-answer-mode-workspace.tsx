"use client";

import { useEffect, useState } from "react";
import {
  ASSISTANT_MODE_STORAGE_KEY,
  type AssistantMode,
  normalizeAssistantMode,
} from "@/lib/assistant-mode";
import { ImmigrationAIWorkspace } from "./immigration-ai-workspace";

export function PremiumAnswerModeWorkspace() {
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("default");
  const [modeHydrated, setModeHydrated] = useState(false);

  useEffect(() => {
    setAssistantMode(
      normalizeAssistantMode(
        window.localStorage.getItem(ASSISTANT_MODE_STORAGE_KEY)
      )
    );
    setModeHydrated(true);
  }, []);

  useEffect(() => {
    if (!modeHydrated) {
      return;
    }
    window.localStorage.setItem(ASSISTANT_MODE_STORAGE_KEY, assistantMode);
  }, [assistantMode, modeHydrated]);

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
              Default legal check uses the current Schedule/RAG verification
              pipeline. Direct LLM quick answer keeps lightweight recent chat
              history and the politics-sensitive filter, then skips the slower
              legal-source helper chain for a model-only answer.
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
                setAssistantMode(normalizeAssistantMode(event.target.value))
              }
              value={assistantMode}
            >
              <option value="default">Default legal check</option>
              <option value="premium">Premium direct answer</option>
            </select>
            {assistantMode === "premium" ? (
              <p className="mt-2 text-xs leading-5 text-amber-700">
                Fast mode is not source-verified. Use it for customer-friendly
                first views, not final case advice.
              </p>
            ) : (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Safer default mode keeps the source-aware legal workflow.
              </p>
            )}
          </div>
        </div>
      </section>

      <ImmigrationAIWorkspace assistantMode={assistantMode} />
    </>
  );
}
