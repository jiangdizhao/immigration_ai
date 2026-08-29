import type { LawyerClarificationRequest } from "@/lib/db/schema";

export const LAWYER_CLARIFICATION_STATUSES = [
  "pending",
  "in_review",
  "confirmed",
  "corrected",
  "needs_more_information",
  "closed",
] as const;

export type LawyerClarificationStatus =
  (typeof LAWYER_CLARIFICATION_STATUSES)[number];

export type LawyerClarificationDisposition = Exclude<
  LawyerClarificationStatus,
  "pending" | "in_review"
>;

const transitions: Record<
  LawyerClarificationStatus,
  readonly LawyerClarificationStatus[]
> = {
  pending: [
    "in_review",
    "confirmed",
    "corrected",
    "needs_more_information",
    "closed",
  ],
  in_review: ["confirmed", "corrected", "needs_more_information", "closed"],
  confirmed: ["closed"],
  corrected: ["closed"],
  needs_more_information: ["in_review", "closed"],
  closed: [],
};

export function isLawyerClarificationStatus(
  value: unknown
): value is LawyerClarificationStatus {
  return (
    typeof value === "string" &&
    (LAWYER_CLARIFICATION_STATUSES as readonly string[]).includes(value)
  );
}

export function canTransitionLawyerClarification(
  current: LawyerClarificationStatus,
  next: LawyerClarificationStatus
) {
  return current === next || transitions[current].includes(next);
}

export type LawyerClarificationUpdate = {
  status: LawyerClarificationStatus;
  lawyerResponse?: string | null;
  correctedAnswer?: string | null;
};

export function validateLawyerClarificationUpdate(
  current: Pick<LawyerClarificationRequest, "status">,
  update: LawyerClarificationUpdate
) {
  if (!canTransitionLawyerClarification(current.status, update.status)) {
    return `Cannot transition a ${current.status} request to ${update.status}.`;
  }

  if (
    (update.status === "confirmed" ||
      update.status === "corrected" ||
      update.status === "needs_more_information") &&
    !update.lawyerResponse?.trim()
  ) {
    return `${update.status} requires a substantive lawyer response.`;
  }

  if (update.status === "corrected" && !update.correctedAnswer?.trim()) {
    return "corrected requires a corrected answer.";
  }

  return null;
}
