import type { DBMessage } from "@/lib/db/schema";

export const LAWYER_REQUEST_SNAPSHOT_VERSION = "phase8.m3.v1";

export type LawyerRequestContextItem = {
  role: "user" | "assistant";
  text: string;
  messageId: string;
};

export type LawyerRequestEvidenceItem = {
  kind: "compact_source" | "citation";
  title?: string | null;
  source_id?: string | null;
  quote?: string | null;
  used_for?: string | null;
  url?: string | null;
  source_type?: string | null;
  authority?: string | null;
};

export type LawyerRequestSnapshot = {
  userMessageId: string;
  assistantMessageId: string;
  questionSnapshot: string;
  answerSnapshot: string;
  contextSnapshot: LawyerRequestContextItem[];
  evidenceSnapshot: LawyerRequestEvidenceItem[];
  assistantMode: "default" | "premium" | "unknown";
};

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function visibleMessageText(parts: unknown) {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => {
      const record = recordFromUnknown(part);
      return record?.type === "text" && typeof record.text === "string"
        ? record.text
        : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function metadataFromParts(parts: unknown) {
  if (!Array.isArray(parts)) {
    return null;
  }
  for (const part of parts) {
    const record = recordFromUnknown(part);
    if (record?.type === "metadata") {
      return record;
    }
  }
  return null;
}

function safeString(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key] : null;
}

function safeEvidence(parts: unknown): LawyerRequestEvidenceItem[] {
  const metadata = metadataFromParts(parts);
  if (!metadata) {
    return [];
  }

  const evidence: LawyerRequestEvidenceItem[] = [];
  if (Array.isArray(metadata.compactSources)) {
    for (const source of metadata.compactSources) {
      if (typeof source === "string" && source.trim()) {
        evidence.push({ kind: "compact_source", title: source.trim() });
      }
    }
  }

  if (Array.isArray(metadata.citations)) {
    for (const citation of metadata.citations) {
      const record = recordFromUnknown(citation);
      if (!record) {
        continue;
      }
      evidence.push({
        kind: "citation",
        source_id: safeString(record, "source_id"),
        title: safeString(record, "title"),
        quote: safeString(record, "quote"),
        used_for: safeString(record, "used_for"),
        url: safeString(record, "url"),
        source_type: safeString(record, "source_type"),
        authority: safeString(record, "authority"),
      });
    }
  }

  return evidence;
}

function chronologicalMessages(messages: DBMessage[]) {
  return [...messages].sort((left, right) => {
    const createdDifference =
      left.createdAt.getTime() - right.createdAt.getTime();
    return createdDifference || left.id.localeCompare(right.id);
  });
}

export function buildLawyerRequestSnapshot({
  messages,
  assistantMessageId,
}: {
  messages: DBMessage[];
  assistantMessageId: string;
}): LawyerRequestSnapshot | { error: string } {
  const ordered = chronologicalMessages(messages);
  const assistantIndex = ordered.findIndex(
    (message) => message.id === assistantMessageId
  );
  const assistant = ordered[assistantIndex];

  if (!assistant || assistant.role !== "assistant") {
    return { error: "The selected message is not an assistant answer." };
  }

  const answerSnapshot = visibleMessageText(assistant.parts);
  if (!answerSnapshot) {
    return { error: "The selected assistant answer has no visible text." };
  }

  let userMessage: DBMessage | undefined;
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (
      ordered[index].role === "user" &&
      visibleMessageText(ordered[index].parts)
    ) {
      userMessage = ordered[index];
      break;
    }
  }
  if (!userMessage) {
    return { error: "The selected answer has no preceding customer question." };
  }

  const contextSnapshot = ordered
    .slice(0, assistantIndex + 1)
    .filter(
      (message): message is DBMessage & { role: "user" | "assistant" } =>
        (message.role === "user" || message.role === "assistant") &&
        Boolean(visibleMessageText(message.parts))
    )
    .slice(-8)
    .map((message) => ({
      role: message.role,
      text: visibleMessageText(message.parts),
      messageId: message.id,
    }));

  const metadata = metadataFromParts(assistant.parts);
  const assistantMode =
    metadata?.assistantMode === "default" ||
    metadata?.assistantMode === "premium"
      ? metadata.assistantMode
      : "unknown";

  return {
    userMessageId: userMessage.id,
    assistantMessageId,
    questionSnapshot: visibleMessageText(userMessage.parts),
    answerSnapshot,
    contextSnapshot,
    evidenceSnapshot: safeEvidence(assistant.parts),
    assistantMode,
  };
}
