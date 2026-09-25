export type PortalTimestamp = string | Date | null;

export type PortalConversation = {
  chatId: string;
  legalMatterId: string | null;
  title: string;
  createdAt: PortalTimestamp;
  updatedAt: PortalTimestamp;
};

export type PortalDocument = {
  documentId: string;
  chatId: string;
  legalMatterId: string | null;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  processingStatus: "not_started" | "processing" | "complete" | "failed";
  securityStatus: "pending" | "clean" | "rejected" | "failed";
  createdAt: PortalTimestamp;
  updatedAt: PortalTimestamp;
};

export type PortalLawyerRequest = {
  requestId: string;
  chatId: string | null;
  legalMatterId: string | null;
  status: string;
  assigned: boolean;
  unread: boolean;
  createdAt: PortalTimestamp;
  updatedAt: PortalTimestamp;
  reviewedAt: PortalTimestamp;
};

export type PortalFact = {
  factKey: string;
  label: string;
  valueDisplay?: string;
  status?: string;
  whyNeeded?: string;
  required?: boolean;
  blocking?: boolean;
};

export type PortalMatterSnapshot = {
  matterId: string;
  backendMatterStatus: string;
  issueSummary: string | null;
  issueType: string | null;
  visaType: string | null;
  confirmedFacts: PortalFact[];
  toConfirm: PortalFact[];
  interactionProgress: {
    collectedRequired: number;
    totalRequired: number;
  } | null;
  nextAction: "answer" | "ask_followup" | "suggest_consultation" | null;
};

export type PortalActivity = {
  id: string;
  kind: "conversation" | "document" | "lawyer_request";
  groupKey: string;
  chatId: string;
  requestId?: string;
  occurredAt: PortalTimestamp;
};

export type PortalMatterGroup = {
  groupKey: string;
  legalMatterId: string | null;
  provisional: boolean;
  displayTitle: string;
  conversations: PortalConversation[];
  defaultContinuationChatId: string;
  latestActivityAt: PortalTimestamp;
  matterSnapshot: PortalMatterSnapshot | null;
  matterSnapshotUnavailable: boolean;
  documents: PortalDocument[];
  lawyerRequests: PortalLawyerRequest[];
};

export type PortalMembership = {
  tier: "free" | "vip";
  active: boolean;
  expired: boolean;
  vipExpiresAt: PortalTimestamp;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: PortalTimestamp;
  premiumAllowed: boolean;
};

export type PortalConsultationSummary = {
  consultationId: string;
  status: string;
  updatedAt: PortalTimestamp;
  scheduledStartAt: PortalTimestamp;
  scheduledEndAt: PortalTimestamp;
  assigned: boolean;
};

export type ClientPortalView = {
  account: { email: string };
  summary: {
    matterGroupCount: number;
    conversationCount: number;
    documentCount: number | null;
    lawyerRequestCount: number;
  };
  documentsAvailable: boolean;
  consultationState:
    | "available"
    | "schema_unavailable"
    | "verification_required";
  consultations: PortalConsultationSummary[];
  membership: PortalMembership;
  matterGroups: PortalMatterGroup[];
  recentActivity: PortalActivity[];
};
