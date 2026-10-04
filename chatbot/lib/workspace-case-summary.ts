import type { InteractionFactRequest } from "@/components/guided-intake-types";

export type WorkspaceCaseSummary = {
  knownFacts: Array<{ key: string; label: string; value: string }>;
  requestedFacts: Array<{
    key: string;
    label: string;
    prompt: string;
    whyNeeded: string | null;
  }>;
};

export function shouldClearWorkspaceCaseSummary(
  currentChatId: string | null,
  nextChatId: string
) {
  return currentChatId !== nextChatId;
}

export function buildWorkspaceCaseSummary(
  knownFacts: Record<string, string | number | boolean | null>,
  requestedFacts: readonly InteractionFactRequest[],
  factLabels: Readonly<Record<string, string>>,
  locale: "zh-CN" | "en"
): WorkspaceCaseSummary {
  return {
    knownFacts: Object.entries(knownFacts).map(([key, value]) => ({
      key,
      label: factLabels[key] ?? key.replaceAll("_", " "),
      value:
        value === null || value === ""
          ? "—"
          : typeof value === "boolean"
            ? value
              ? locale === "zh-CN"
                ? "是"
                : "Yes"
              : locale === "zh-CN"
                ? "否"
                : "No"
            : String(value),
    })),
    requestedFacts: requestedFacts.map((fact) => ({
      key: fact.key,
      label: factLabels[fact.key] ?? fact.label,
      prompt: fact.prompt?.trim() || fact.label,
      whyNeeded: fact.why_needed?.trim() || null,
    })),
  };
}
