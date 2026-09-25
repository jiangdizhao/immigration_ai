import type { LawyerWorkspaceQueueBucket } from "./types";

export type LawyerWorkspaceQueueItem = {
  id: string;
  customerEmail: string;
  status: string;
  assistantMode: string | null;
  legalMatterId: string | null;
  questionPreview: string;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
  assignedAt: string | Date | null;
  bucket: LawyerWorkspaceQueueBucket;
};

export type LawyerWorkspaceQueueCounts = Record<
  LawyerWorkspaceQueueBucket | "all",
  number
>;

export const LAWYER_WORKSPACE_QUEUE_LIMIT = 100;
export const LAWYER_WORKSPACE_QUESTION_PREVIEW_CHARS = 180;

export function bucketForLawyerStatus(
  status: string
): LawyerWorkspaceQueueBucket {
  if (status === "pending" || status === "in_review") {
    return "needs_action";
  }
  if (status === "needs_more_information") {
    return "waiting_customer";
  }
  if (status === "confirmed" || status === "corrected") {
    return "reviewed";
  }
  return "closed";
}

function safePreviewText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const cleaned = Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, LAWYER_WORKSPACE_QUESTION_PREVIEW_CHARS);
}

export function buildQuestionPreview(question: unknown): string {
  return safePreviewText(question);
}

export function countLawyerQueue(
  items: readonly LawyerWorkspaceQueueItem[]
): LawyerWorkspaceQueueCounts {
  const counts: LawyerWorkspaceQueueCounts = {
    all: items.length,
    needs_action: 0,
    waiting_customer: 0,
    reviewed: 0,
    closed: 0,
  };
  for (const item of items) {
    counts[item.bucket] += 1;
  }
  return counts;
}
