import type { SiteLocale } from "@/lib/site-locale";

export const CLIENT_PORTAL_COPY = {
  "zh-CN": {
    title: "客户中心",
    subtitle: "查看您的事项、已提供的信息和后续服务入口。",
    matters: "我的事项",
    linkedMatter: "已关联法律事项",
    provisional: "对话事项（暂未关联法律事项）",
    conversationContext: "对话背景",
    issueType: "当前事项类型（系统背景）",
    visaType: "当前签证背景",
    lastActivity: "最近活动",
    confirmed: "已确认信息",
    toConfirm: "待确认",
    documents: "已提供的文件",
    lawyerReview: "律师审核",
    conversations: "相关对话",
    membership: "会员状态",
    continueWithAi: "继续 AI 咨询",
    openConversation: "打开对话",
    viewRequest: "查看请求",
    manageMembership: "管理会员",
    noMatters: "暂无事项。开始 AI 咨询后，对话会显示在这里。",
    matterUnavailable: "暂时无法获取该法律事项的系统摘要。",
    securityPending: "安全核验待完成",
    securityRecorded: "安全状态已记录",
    securityRejected: "安全核验未通过",
    securityFailed: "安全核验暂不可用",
    processingNotStarted: "尚未开始处理",
    processing: "处理中",
    processingComplete: "处理已完成",
    processingFailed: "处理未完成",
    needsReview: "需要查看",
    updateAvailable: "有新的律师审核更新",
    activeReview: "审核处理中",
    closedReview: "已结束",
    requestNeedsMoreInformation: "需要补充信息",
    requestPending: "等待律师审核",
    requestInReview: "律师审核中",
    requestConfirmed: "律师审核已确认",
    requestCorrected: "已提供修正答复",
    requestClosed: "请求已结束",
    requestStatusUnavailable: "暂不可用",
    free: "免费账户",
    vipActive: "VIP 有效",
    vipExpired: "VIP 已过期",
    cancelAtPeriodEnd: "将在当前周期结束时取消",
    premiumAvailable: "可使用 Premium AI",
    premiumUnavailable: "Premium AI 当前不可用",
    noFacts: "暂无已确认信息",
    noToConfirm: "暂无待确认项目",
    noDocuments: "暂无已存储文件",
    noLawyerRequests: "暂无律师审核请求",
    unavailable: "暂不可用",
    confirmedCount: "已收集必填信息",
    nextAction: "下一步",
  },
  en: {
    title: "Client Portal",
    subtitle:
      "Review your matters, shared information, and service next steps.",
    matters: "Your matters",
    linkedMatter: "Linked legal matter",
    provisional: "Conversation context (not linked to a legal matter)",
    conversationContext: "Conversation context",
    issueType: "Current matter type (system context)",
    visaType: "Current visa context",
    lastActivity: "Last activity",
    confirmed: "Confirmed by you",
    toConfirm: "To confirm",
    documents: "Documents provided",
    lawyerReview: "Lawyer review",
    conversations: "Conversations",
    membership: "Membership",
    continueWithAi: "Continue with AI",
    openConversation: "Open conversation",
    viewRequest: "View request",
    manageMembership: "Manage membership",
    noMatters:
      "No matters yet. Start an AI consultation and it will appear here.",
    matterUnavailable: "The legal matter summary is temporarily unavailable.",
    securityPending: "Security verification pending",
    securityRecorded: "Security status recorded",
    securityRejected: "Security review did not pass",
    securityFailed: "Security check unavailable",
    processingNotStarted: "Not started",
    processing: "Processing",
    processingComplete: "Processing complete",
    processingFailed: "Processing incomplete",
    needsReview: "Needs review",
    updateAvailable: "Lawyer review update available",
    activeReview: "Review in progress",
    closedReview: "Closed",
    requestNeedsMoreInformation: "More information needed",
    requestPending: "Awaiting lawyer review",
    requestInReview: "Lawyer review in progress",
    requestConfirmed: "Lawyer review confirmed",
    requestCorrected: "Corrected response provided",
    requestClosed: "Request closed",
    requestStatusUnavailable: "Unavailable",
    free: "Free account",
    vipActive: "VIP active",
    vipExpired: "VIP expired",
    cancelAtPeriodEnd: "Cancels at the end of the current period",
    premiumAvailable: "Premium AI available",
    premiumUnavailable: "Premium AI unavailable",
    noFacts: "No confirmed information yet",
    noToConfirm: "No items to confirm",
    noDocuments: "No stored documents",
    noLawyerRequests: "No lawyer review requests",
    unavailable: "Unavailable",
    confirmedCount: "Required information collected",
    nextAction: "Next step",
  },
} as const;

export function getClientPortalCopy(locale: SiteLocale) {
  return CLIENT_PORTAL_COPY[locale];
}

export function getLawyerRequestStatusLabel(
  status: string,
  locale: SiteLocale
) {
  const copy = getClientPortalCopy(locale);
  switch (status) {
    case "needs_more_information":
      return copy.requestNeedsMoreInformation;
    case "pending":
      return copy.requestPending;
    case "in_review":
      return copy.requestInReview;
    case "confirmed":
      return copy.requestConfirmed;
    case "corrected":
      return copy.requestCorrected;
    case "closed":
      return copy.requestClosed;
    default:
      return copy.requestStatusUnavailable;
  }
}
