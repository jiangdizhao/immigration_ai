export type LawyerWorkspaceQueueBucket =
  | "needs_action"
  | "waiting_customer"
  | "reviewed"
  | "closed";

export type LawyerWorkspaceStatus =
  | "pending"
  | "in_review"
  | "needs_more_information"
  | "confirmed"
  | "corrected"
  | "closed";

export type LawyerWorkspaceAction =
  | "in_review"
  | "needs_more_information"
  | "confirmed"
  | "corrected"
  | "closed";

export const LAWYER_WORKSPACE_ACTIONS: LawyerWorkspaceAction[] = [
  "in_review",
  "needs_more_information",
  "confirmed",
  "corrected",
  "closed",
];

export function availableLawyerActions(
  status: string
): LawyerWorkspaceAction[] {
  if (status === "pending") {
    return [
      "in_review",
      "needs_more_information",
      "confirmed",
      "corrected",
      "closed",
    ];
  }
  if (status === "in_review") {
    return ["needs_more_information", "confirmed", "corrected", "closed"];
  }
  if (status === "needs_more_information") {
    return ["in_review", "closed"];
  }
  if (status === "confirmed" || status === "corrected") {
    return ["closed"];
  }
  return [];
}

export function canProvideLawyerLearningFeedback(status: string): boolean {
  const actions = availableLawyerActions(status);
  return actions.includes("confirmed") || actions.includes("corrected");
}

export type LawyerWorkspaceMessage = {
  id: string;
  authorRole: "customer" | "lawyer" | "admin" | "unsupported";
  body: string;
  createdAt: string | Date | null;
};

export type LawyerWorkspaceDetail = {
  request: {
    id: string;
    status: string;
    assistantMode: string | null;
    legalMatterId: string | null;
    createdAt: string | Date | null;
    updatedAt: string | Date | null;
    assignedAt: string | Date | null;
    reviewedAt: string | Date | null;
    closedAt: string | Date | null;
  };
  customerEmail: string;
  question: string;
  aiAnswer: string;
  customerNote: string | null;
  handoffContext: LawyerWorkspaceContextItem[];
  officialEvidence: LawyerWorkspaceOfficialEvidenceItem[];
  customerDocumentEvidence: LawyerWorkspaceCustomerDocumentItem[];
  unsupportedEvidenceCount: number;
  messages: LawyerWorkspaceMessage[];
  lawyerDisposition: {
    lawyerResponse: string | null;
    correctedAnswer: string | null;
    preferredReasoningOrResearchApproach: string | null;
    createReasoningLessonCandidate: boolean;
  };
};

export type LawyerWorkspaceContextItem = {
  role: "user" | "assistant" | "unsupported";
  text: string;
  order: number;
};

export type LawyerWorkspaceOfficialEvidenceItem = {
  kind: "citation" | "compact_source";
  title: string | null;
  authority: string | null;
  sourceType: string | null;
  usedFor: string | null;
  quote: string | null;
  url: string | null;
  sourceId: string | null;
};

export type LawyerWorkspaceCustomerDocumentItem = {
  filename: string;
  runStatus: string | null;
  extractionMethod: string | null;
  locator: string | null;
  quote: string;
  truncated: boolean;
};
