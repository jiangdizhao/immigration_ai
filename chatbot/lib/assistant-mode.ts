/**
 * Public mode contract for the migration widget.
 *
 * The legacy strings remain accepted only at storage/request compatibility
 * boundaries. Everything inside the current UI and the FastAPI payload uses
 * the canonical values below.
 */
export type AssistantMode = "default" | "premium";

export const ASSISTANT_MODE_STORAGE_KEY = "immigration-assistant-mode";

const LEGACY_MODE_ALIASES: Readonly<Record<string, AssistantMode>> = {
  default: "default",
  premium: "premium",
  default_legal_pipeline: "default",
  premium_direct_gpt55_high: "premium",
};

export function normalizeAssistantMode(value: unknown): AssistantMode {
  if (typeof value !== "string") {
    return "default";
  }

  return LEGACY_MODE_ALIASES[value] ?? "default";
}

export function isKnownAssistantMode(value: unknown): boolean {
  return typeof value === "string" && value in LEGACY_MODE_ALIASES;
}

export function widgetRouteForAssistantMode(mode: AssistantMode): string {
  return mode === "premium" ? "/api/widget-chat-direct" : "/api/widget-chat";
}
