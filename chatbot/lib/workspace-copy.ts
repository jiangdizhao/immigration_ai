import type { SiteLocale } from "./site-locale";

export type WorkspaceCopy = {
  identity: { title: string; subtitle: string };
  status: {
    label: string;
    ready: string;
    submitted: string;
    typing: string;
    loading: string;
    noMatter: string;
  };
  history: {
    title: string;
    newConversation: string;
    loading: string;
    empty: string;
    unnamed: string;
    updatedUnavailable: string;
    chat: string;
    matter: string;
    quickQuestions: string;
    loadOlder: string;
    allLoaded: string;
    loadFailed: string;
  };
  messages: {
    loadEarlier: string;
    loadingEarlier: string;
  };
  /**
   * Phase 12 Stage 1 R3: archived (legacy) conversation read-only surface.
   * A legacy chat is retained history whose immigration conversation record was
   * never created, so new messages cannot be accepted here.
   */
  legacy: {
    badge: string;
    title: string;
    description: string;
    listHint: string;
    readOnlySubmitBlocked: string;
    readOnlyIntakeBlocked: string;
    readOnlyUploadBlocked: string;
    readOnlyLawyerBlocked: string;
    startNewConversation: string;
    startNewConversationHint: string;
  };
  persistence: {
    notSaved: string;
    retrySave: string;
    retrying: string;
    savedAcrossDevices: string;
    answerInProgress: string;
    checkSavedAnswer: string;
    messageNotSaved: string;
    retrySending: string;
  };
  fileHistory: {
    title: string;
    description: string;
    loading: string;
    empty: string;
    error: string;
    loadMore: string;
    download: string;
    conversation: string;
    processing: string;
    ready: string;
    failed: string;
    saved: string;
  };
  quickQuestions: readonly string[];
  consultation: {
    title: string;
    status: string;
    generalInformation: string;
    australiaFocus: string;
    emptyTitle: string;
    emptyDescription: string;
    sources: string;
    escalationTitle: string;
    escalationDescription: string;
    requestedFact: string;
    placeholder: string;
    composerHelp: string;
    send: string;
  };
  matter: {
    knownFacts: string;
    factsCount: (count: number) => string;
    noFacts: string;
    toConfirm: string;
    noRequestedFacts: string;
    whyNeeded: string;
    generateSummary: string;
    regenerateSummary: string;
    summaryGenerated: string;
  };
  factLabels: Readonly<Record<string, string>>;
  legalDisclaimer: string;
  mode: {
    title: string;
    fast: string;
    legalCheck: string;
    premium: string;
    processingMode: string;
    guestFast: string;
    guestLegalCheck: string;
    signIn: string;
    guestPremium: string;
    premiumDescription: string;
    fastDescription: string;
    legalCheckDescription: string;
    loading: string;
  };
  documents: {
    title: string;
    upload: string;
    documents: string;
    processing: string;
    ready: string;
    partial: string;
    needsReview: string;
    failed: string;
    notStarted: string;
    availableToAI: string;
    uploaded: string;
    noEvidence: string;
    delete: string;
    download: string;
    retry: string;
    reprocess: string;
    unverified: string;
    formats: string;
    uploadError: string;
    incomplete: string;
    customerEvidence: string;
    warning: string;
    visionUnavailable: string;
  };
  lawyerRequest: {
    reviewPrompt: string;
    signIn: string;
    toReview: string;
    upgrade: string;
    toAskReview: string;
    askReview: string;
    submitted: string;
    viewStatus: string;
    details: string;
    answerPreview: string;
    optionalNote: string;
    submitting: string;
    submit: string;
    consultationTitle: string;
    consultationDescription: string;
    consultationLink: string;
  };
};

const zh: WorkspaceCopy = {
  identity: { title: "AI 工作台", subtitle: "移民咨询与案件上下文" },
  status: {
    label: "助手状态",
    ready: "就绪",
    submitted: "正在核对来源",
    typing: "正在整理答复",
    loading: "加载中",
    noMatter: "尚未关联案件",
  },
  history: {
    title: "对话记录",
    newConversation: "新建对话",
    loading: "正在加载对话…",
    empty: "暂无对话记录。",
    unnamed: "移民咨询对话",
    updatedUnavailable: "更新时间不可用",
    chat: "对话",
    matter: "案件",
    quickQuestions: "常见移民问题",
    loadOlder: "加载更早的对话",
    allLoaded: "已加载全部对话。",
    loadFailed: "无法加载更早的对话，请重试。",
  },
  messages: {
    loadEarlier: "加载更早的消息",
    loadingEarlier: "正在加载更早的消息…",
  },
  legacy: {
    badge: "历史归档",
    title: "历史对话（只读）",
    description:
      "这是账号中保留下来的历史对话记录（只读）。您可以完整查看原有消息、来源与时间，但不能在此对话中继续提问或修改内容。",
    listHint: "只读历史",
    readOnlySubmitBlocked: "该历史对话为只读，请新建对话后继续提问。",
    readOnlyIntakeBlocked: "该历史对话为只读，无法在此提交信息。请新建对话。",
    readOnlyUploadBlocked: "该历史对话为只读，无法上传文件。请新建对话。",
    readOnlyLawyerBlocked:
      "该历史对话为只读，无法在此发起人工复核。请新建对话。",
    startNewConversation: "新建对话",
    startNewConversationHint:
      "在新建对话中继续向 AI 提问，历史记录会保留在这里。",
  },
  persistence: {
    notSaved: "此回复尚未保存到您的账号，刷新后可能丢失。",
    retrySave: "重新保存",
    retrying: "正在重新保存…",
    savedAcrossDevices: "已保存到您的账号，可在其他设备查看。",
    answerInProgress: "这条消息仍在生成答复，请稍候查看已保存的回复。",
    checkSavedAnswer: "查看已保存的回复",
    messageNotSaved: "这条消息尚未保存到您的账号，请重新发送。",
    retrySending: "重新发送",
  },
  fileHistory: {
    title: "我的历史文件",
    description: "登录同一账号可在任意设备查看已上传的原始文件。",
    loading: "正在加载历史文件…",
    empty: "暂无历史文件。",
    error: "无法加载历史文件，请重试。",
    loadMore: "加载更多文件",
    download: "下载",
    conversation: "所属对话",
    processing: "处理中",
    ready: "处理完成",
    failed: "处理失败",
    saved: "已保存到您的账号",
  },
  quickQuestions: [
    "完成授课型硕士后，申请 485 签证需要考虑哪些条件？",
    "学生签证被拒后，我可以先做什么？",
    "签证决定后是否可以申请复审？",
    "持过桥签证期间离开澳大利亚会有什么影响？",
    "签证条件 8501 通常是什么意思？",
    "我想了解如何联系律师进行咨询。",
  ],
  consultation: {
    title: "当前咨询",
    status: "AI 助手",
    generalInformation: "一般信息，不构成法律意见",
    australiaFocus: "澳大利亚移民与留学",
    emptyTitle: "从签证、拒签、签证条件或咨询问题开始。",
    emptyDescription:
      "助手会根据问题提供一般信息，并在需要时询问关键事实。答复语言由你的问题和答复内容决定。",
    sources: "参考来源",
    escalationTitle: "建议咨询律师",
    escalationDescription: "此事项可能涉及期限、材料或个案事实。",
    requestedFact: "待补充信息",
    placeholder: "输入问题。按 Enter 换行，再点击发送。",
    composerHelp:
      "按 Enter 换行，点击发送提交。仅供一般信息参考，不构成法律意见。",
    send: "发送",
  },
  matter: {
    knownFacts: "已知信息",
    factsCount: (count) => `${count} 项`,
    noFacts: "目前还没有已知信息。",
    toConfirm: "待确认",
    noRequestedFacts: "目前没有待确认的问题。",
    whyNeeded: "用途",
    generateSummary: "生成案件摘要",
    regenerateSummary: "重新生成摘要",
    summaryGenerated: "案件摘要快照（仅在点击生成或重新生成时更新）",
  },
  factLabels: {
    completion_date: "课程完成日期",
    qualification_level: "学历层级",
    course_cricos_registered: "课程 CRICOS 注册情况",
    australian_study_requirement_met: "澳大利亚学习要求情况",
    first_485_or_subsequent: "首次或后续 485 申请",
    current_visa: "当前签证或身份",
    current_location: "当前所在地",
    application_timing: "计划申请时间",
    refusal_notice_available: "是否有拒签通知",
    notification_date: "通知日期",
    onshore_offshore: "决定时所在位置",
    refusal_reason_if_known: "已知拒签原因",
    age: "年龄",
    qualification: "学历或资格",
    visa_subclass: "签证类别",
  },
  legalDisclaimer: "此处为 AI 一般信息说明；个案法律意见应由律师提供。",
  mode: {
    title: "答复模式",
    fast: "Fast · 快速答复",
    legalCheck: "Legal Check · 来源核对",
    premium: "Premium · VIP 答复",
    processingMode: "选择答复模式",
    guestFast: "未登录也可使用 Fast。",
    guestLegalCheck: "Legal Check 需要登录。",
    signIn: "登录",
    guestPremium: "Premium 需要 VIP 会员资格。",
    premiumDescription: "VIP 会员可使用现有 Premium 答复模式。",
    fastDescription: "快速答复；如问题涉及最新信息，系统可能进行网页搜索。",
    legalCheckDescription: "使用现有的来源核对移民法律工作流。",
    loading: "正在加载助手…",
  },
  documents: {
    title: "案件文件",
    upload: "上传文件",
    documents: "文件",
    processing: "处理中",
    ready: "处理完成",
    partial: "部分提取",
    needsReview: "需要检查",
    failed: "处理失败",
    notStarted: "尚未处理",
    availableToAI: "可供 AI 使用",
    uploaded: "上传成功",
    noEvidence: "已保存，但未提取到可用内容，暂不能用于 AI 分析",
    delete: "删除",
    download: "下载",
    retry: "重试",
    reprocess: "重新处理",
    unverified: "客户文件由您提供，不属于官方法律来源。",
    formats:
      "PDF、JPG/JPEG、PNG、DOC/DOCX、TXT、MD、JSON、CSV、XLS/XLSX；最多 25 MiB。",
    uploadError: "文件操作失败。",
    incomplete: "提取内容可能不完整。",
    customerEvidence: "客户文件证据",
    visionUnavailable: "需要视觉提取服务",
    warning: "仅向 AI 提供了文件中有界的提取内容。文件可能还包含其他信息。",
  },
  lawyerRequest: {
    reviewPrompt: "需要进一步专业审核？",
    signIn: "登录",
    toReview: "后可请求律师审阅此答复。",
    upgrade: "升级 VIP",
    toAskReview: "后可请求人工律师审阅此答复。",
    askReview: "请求律师审阅此答复",
    submitted: "律师审阅请求已提交。查看进度：",
    viewStatus: "律师请求",
    details:
      "律师会收到已保存的问题、答复、可见上下文及本次对话允许传递的证据。",
    answerPreview: "答复预览：",
    optionalNote: "给律师的补充说明（选填）",
    submitting: "正在提交…",
    submit: "提交审阅请求",
    consultationTitle: "预约一对一律师咨询",
    consultationDescription: "律师审阅此答复与一对一咨询是两项独立服务。",
    consultationLink: "预约一对一咨询",
  },
};

const en: WorkspaceCopy = {
  identity: {
    title: "AI Workspace",
    subtitle: "Consultation and matter context",
  },
  status: {
    label: "Assistant status",
    ready: "Ready",
    submitted: "Checking sources",
    typing: "Preparing answer",
    loading: "Loading",
    noMatter: "No matter linked yet",
  },
  history: {
    title: "Conversations",
    newConversation: "New conversation",
    loading: "Loading conversations…",
    empty: "No conversations yet.",
    unnamed: "Immigration conversation",
    updatedUnavailable: "Updated time unavailable",
    chat: "Chat",
    matter: "Matter",
    quickQuestions: "Common migration questions",
    loadOlder: "Load older conversations",
    allLoaded: "All conversations are loaded.",
    loadFailed: "Could not load older conversations. Please retry.",
  },
  messages: {
    loadEarlier: "Load earlier messages",
    loadingEarlier: "Loading earlier messages…",
  },
  legacy: {
    badge: "Archived",
    title: "Archived conversation (read-only)",
    description:
      "This is retained history from your account, shown read-only. You can read the original messages, sources and timestamps, but new questions and edits are not accepted in this conversation.",
    listHint: "Read-only history",
    readOnlySubmitBlocked:
      "This archived conversation is read-only. Start a new conversation to ask a new question.",
    readOnlyIntakeBlocked:
      "This archived conversation is read-only, so case details cannot be submitted here. Start a new conversation.",
    readOnlyUploadBlocked:
      "This archived conversation is read-only, so files cannot be uploaded here. Start a new conversation.",
    readOnlyLawyerBlocked:
      "This archived conversation is read-only, so a lawyer review cannot be requested here. Start a new conversation.",
    startNewConversation: "Start a new conversation",
    startNewConversationHint:
      "Ask the AI in a new conversation — this archived history stays available here.",
  },
  persistence: {
    notSaved:
      "This answer was not saved to your account and may be lost after a refresh.",
    retrySave: "Retry saving",
    retrying: "Retrying save…",
    savedAcrossDevices:
      "Saved to your account and available on your other devices.",
    answerInProgress:
      "This message is still being answered. Please check again for the saved reply.",
    checkSavedAnswer: "Check the saved reply",
    messageNotSaved:
      "This message could not be saved to your account. Please send it again.",
    retrySending: "Send again",
  },
  fileHistory: {
    title: "My files",
    description:
      "Sign in with the same account on any device to see your uploaded original files.",
    loading: "Loading your files…",
    empty: "No files yet.",
    error: "Could not load your files. Please retry.",
    loadMore: "Load more files",
    download: "Download",
    conversation: "Conversation",
    processing: "Processing",
    ready: "Processing complete",
    failed: "Processing failed",
    saved: "Saved to your account",
  },
  quickQuestions: [
    "After a coursework master’s degree, what should I check for a 485 visa?",
    "My student visa was refused. What can I do first?",
    "Can a visa decision be reviewed?",
    "What should I consider before leaving Australia on a bridging visa?",
    "What does visa condition 8501 generally mean?",
    "How can I ask a lawyer about a consultation?",
  ],
  consultation: {
    title: "Active consultation",
    status: "AI assistant",
    generalInformation: "General information, not legal advice",
    australiaFocus: "Australian migration and study",
    emptyTitle:
      "Start with a visa, refusal, condition, or consultation question.",
    emptyDescription:
      "The assistant provides general information and may ask for key facts. Answer language follows your question and the generated response.",
    sources: "Sources considered",
    escalationTitle: "A lawyer consultation may help",
    escalationDescription:
      "This matter may involve deadlines, documents, or case-specific facts.",
    requestedFact: "Information to confirm",
    placeholder:
      "Type your question. Press Enter for a new paragraph, then click Send.",
    composerHelp:
      "Press Enter for a new paragraph, then click Send. General information only, not legal advice.",
    send: "Send",
  },
  matter: {
    knownFacts: "Known information",
    factsCount: (count) => `${count} items`,
    noFacts: "There is no known information yet.",
    toConfirm: "To confirm",
    noRequestedFacts: "There are no outstanding questions to confirm.",
    whyNeeded: "Why it matters",
    generateSummary: "Generate case summary",
    regenerateSummary: "Regenerate summary",
    summaryGenerated:
      "Case summary snapshot (updates only when generated again)",
  },
  factLabels: {
    completion_date: "Course completion date",
    qualification_level: "Qualification level",
    course_cricos_registered: "CRICOS course status",
    australian_study_requirement_met: "Australian Study Requirement status",
    first_485_or_subsequent: "First or subsequent 485 application",
    current_visa: "Current visa or status",
    current_location: "Current location",
    application_timing: "Application timing",
    refusal_notice_available: "Refusal notice availability",
    notification_date: "Notification date",
    onshore_offshore: "Location at decision",
    refusal_reason_if_known: "Known refusal reason",
    age: "Age",
    qualification: "Qualification",
    visa_subclass: "Visa subclass",
  },
  legalDisclaimer:
    "AI provides general information here; a lawyer should provide case-specific advice.",
  mode: {
    title: "Answer mode",
    fast: "Fast · Quick answer",
    legalCheck: "Legal Check · Source review",
    premium: "Premium · VIP answer",
    processingMode: "Choose an answer mode",
    guestFast: "Fast is available without signing in.",
    guestLegalCheck: "Legal Check requires an account.",
    signIn: "Sign in",
    guestPremium: "Premium requires VIP membership.",
    premiumDescription: "VIP members can use the existing Premium answer mode.",
    fastDescription:
      "Quick answers; web search may be used when current information matters.",
    legalCheckDescription: "Uses the existing source-aware legal workflow.",
    loading: "Preparing the assistant…",
  },
  documents: {
    title: "Matter documents",
    upload: "Upload file",
    documents: "Documents",
    processing: "Processing",
    ready: "Processing complete",
    partial: "Partial extraction",
    needsReview: "Needs review",
    failed: "Processing failed",
    notStarted: "Not processed",
    availableToAI: "Available to AI",
    uploaded: "Upload complete",
    noEvidence:
      "Saved, but no usable content was extracted and it cannot be used for AI analysis yet",
    delete: "Delete",
    download: "Download",
    retry: "Retry",
    reprocess: "Reprocess",
    unverified:
      "Customer files are provided by you and are not official legal sources.",
    formats:
      "PDF, JPG/JPEG, PNG, DOC/DOCX, TXT, MD, JSON, CSV, XLS/XLSX; up to 25 MiB.",
    uploadError: "Document action failed.",
    incomplete: "Extracted content may be incomplete.",
    customerEvidence: "Customer document evidence",
    visionUnavailable: "Vision extraction unavailable",
    warning:
      "Only bounded extracted portions of this file were supplied to the AI. The document may contain additional information.",
  },
  lawyerRequest: {
    reviewPrompt: "Need professional review?",
    signIn: "Sign in",
    toReview: " to ask a lawyer to review this answer.",
    upgrade: "Upgrade to VIP",
    toAskReview: " to request a human lawyer review of this answer.",
    askReview: "Ask a lawyer to review this answer",
    submitted:
      "Your lawyer review request has been submitted. View its status in",
    viewStatus: "lawyer requests",
    details:
      "The lawyer will receive the saved question, answer, visible context, and allowlisted evidence from this conversation.",
    answerPreview: "Answer preview: ",
    optionalNote: "Optional note for the lawyer",
    submitting: "Submitting…",
    submit: "Submit review request",
    consultationTitle: "Book a one-to-one lawyer consultation",
    consultationDescription:
      "A lawyer review of this answer and a one-to-one consultation are separate services.",
    consultationLink: "Book a one-to-one consultation",
  },
};

export const WORKSPACE_COPY: Record<SiteLocale, WorkspaceCopy> = {
  "zh-CN": zh,
  en,
};

export function getWorkspaceCopy(locale: SiteLocale): WorkspaceCopy {
  return WORKSPACE_COPY[locale];
}
