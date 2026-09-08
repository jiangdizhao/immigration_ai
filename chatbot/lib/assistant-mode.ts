/**
 * Public mode contract for the migration widget.
 *
 * The legacy strings remain accepted only at storage/request compatibility
 * boundaries. Everything inside the current UI and the FastAPI payload uses
 * the canonical values below.
 */
export type AssistantMode = "fast" | "default" | "premium";

export type AssistantModeAccessPolicy = {
  userType: "guest" | "regular";
  fastAllowed: boolean;
  slowAllowed: boolean;
  premiumAllowed: boolean;
};

export const ASSISTANT_MODE_STORAGE_KEY = "immigration-assistant-mode";

const LEGACY_MODE_ALIASES: Readonly<Record<string, AssistantMode>> = {
  fast: "fast",
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
  if (mode === "fast") {
    return "/api/widget-chat-fast";
  }
  return mode === "premium" ? "/api/widget-chat-direct" : "/api/widget-chat";
}

export function isAssistantModeAllowed(
  mode: AssistantMode,
  policy: AssistantModeAccessPolicy
): boolean {
  if (mode === "fast") {
    return policy.fastAllowed;
  }
  if (mode === "default") {
    return policy.slowAllowed;
  }
  return policy.premiumAllowed;
}

export function resolveAllowedAssistantMode(
  storedMode: unknown,
  policy: AssistantModeAccessPolicy
): AssistantMode {
  // No saved preference means Fast is the product default for both guests and
  // registered free users. A saved canonical/legacy mode remains a preference
  // when the current access policy permits it.
  const normalized =
    storedMode === null || storedMode === undefined || storedMode === ""
      ? "fast"
      : normalizeAssistantMode(storedMode);
  if (isAssistantModeAllowed(normalized, policy)) {
    return normalized;
  }

  for (const candidate of ["fast", "default", "premium"] as const) {
    if (isAssistantModeAllowed(candidate, policy)) {
      return candidate;
    }
  }

  // A policy with no allowed lane is invalid, but keep this helper total so a
  // transient access response cannot produce an undefined request mode.
  return "fast";
}
