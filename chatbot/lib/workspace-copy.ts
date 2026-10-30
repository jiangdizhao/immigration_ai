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
    createFailed: string;
    policyTopicBadge: string;
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
  projectChat: {
    badge: string;
    readOnlyBadge: string;
    title: string;
    description: string;
    listHint: string;
    readOnlySubmitBlocked: string;
    unsupportedWorkflowBlocked: string;
    startNewConversation: string;
    startNewConversationHint: string;
  };
  projectEntry: {
    createProject: string;
    projects: string;
    expandProjects: string;
    collapseProjects: string;
    projectLabel: (date: string, shortId: string) => string;
    selectedProject: string;
    projectId: string;
    createDialogTitle: string;
    createDialogDescription: string;
    createDialogCancel: string;
    createDialogConfirm: string;
    creatingProject: string;
    loadingProjects: string;
    projectsEmpty: string;
    chatsTitle: string;
    loadingChats: string;
    chatsEmpty: string;
    projectChatLabel: string;
    newProjectChat: string;
    creatingChat: string;
    openingChat: string;
    backToConversations: string;
    standaloneConversation: string;
    projectChatHistoryScope: string;
    projectContextUnavailable: string;
    readOnly: string;
    retry: string;
    loadFailed: string;
    authenticationRequired: string;
    accessDenied: string;
    notFound: string;
    stateChanged: string;
    unavailable: string;
    requestFailed: string;
    networkFailed: string;
    loadMoreChats: string;
    documents: {
      title: string;
      unavailable: string;
      ownOnly: string;
      scannerGate: string;
      loading: string;
      empty: string;
      loadFailed: string;
      upload: string;
      importing: string;
      sourceChatId: string;
      sourceDocumentId: string;
      consent: string;
      import: string;
      download: string;
      withdraw: string;
      pendingScan: string;
      stored: string;
      clean: string;
      rejected: string;
      failed: string;
      uploading: string;
      storagePending: string;
      storageStored: string;
      cleanupPending: string;
      securityPending: string;
      securityFailed: string;
    };
  };
  /**
   * Phase 13 M5.1 School Application surface inside a Project workspace.
   * Every status below is a preparation status: none of them is an admission
   * decision, an offer, a CoE, a payment confirmation, a lawyer approval or a
   * submitted application.
   */
  /**
   * Phase 13 M5.2 School Admissions Workflow surface. Every label below describes
   * a provisional, evidence-limited internal workflow: no admission decision, no
   * verified Offer/CoE, no Student 500 eligibility and no institutional
   * submission is ever claimed by this UI.
   */
  schoolAdmissions: {
    title: string;
    subtitle: string;
    notice: string;
    loading: string;
    empty: string;
    createFromApplication: string;
    createStandalone: string;
    createTitle: string;
    createDescription: string;
    selectApplicationLabel: string;
    selectApplicationPlaceholder: string;
    noSelectableApplications: string;
    selectDocumentLabel: string;
    selectDocumentPlaceholder: string;
    documentsEmpty: string;
    documentsUnavailable: string;
    recordWithDocument: string;
    institutionLabel: string;
    courseLabel: string;
    intakeLabel: string;
    originLabel: string;
    origin: Record<string, string>;
    serviceModeLabel: string;
    serviceMode: Record<string, string>;
    selfNotice: string;
    managedNotice: string;
    checklistHeading: string;
    requirement: Record<string, string>;
    requirementStatus: Record<string, string>;
    draftHeading: string;
    provisionalNotice: string;
    section: Record<string, string>;
    confirmDraft: string;
    confirmedNotice: string;
    staleNotice: string;
    offerHeading: string;
    recordOffer: string;
    transitionOffer: string;
    offerAction: Record<string, string>;
    offerState: Record<string, string>;
    expiryState: Record<string, string>;
    coeHeading: string;
    recordCoe: string;
    coeState: Record<string, string>;
    evidenceNotice: string;
    externalActionHeading: string;
    externalAction: Record<string, string>;
    externalActionNotice: string;
    recordExternalAction: string;
    exceptionHeading: string;
    exceptionNotice: string;
    claimException: string;
    verifyException: string;
    readinessHeading: string;
    evaluateReadiness: string;
    readinessStatus: Record<string, string>;
    submissionNotice: string;
    nextStepsHeading: string;
    nextStep: Record<string, string>;
    disclosuresHeading: string;
    disclosure: Record<string, string>;
    errorNotFound: string;
    errorStateChanged: string;
    errorAuthority: string;
    errorUnavailable: string;
    errorInvalid: string;
    actionFailed: string;
    refresh: string;
  };
  schoolApplications: {
    title: string;
    subtitle: string;
    notice: string;
    loading: string;
    empty: string;
    create: string;

    createTitle: string;
    createDescription: string;
    cancel: string;
    confirm: string;
    creating: string;
    institutionLabel: string;
    institutionIdLabel: string;
    courseLabel: string;
    courseIdLabel: string;
    deliveryIdLabel: string;
    intakeLabel: string;
    intakeIdLabel: string;
    optionalHint: string;
    statusDraft: string;
    statusPreparing: string;
    statusPackagePrepared: string;
    statusStale: string;
    statusArchived: string;
    sourceHeading: string;
    sourceUnverifiedCustomer: string;
    sourceUnverifiedCatalog: string;
    sourceSyntheticCatalog: string;
    revisionLabel: (revision: number) => string;
    packageHeading: string;
    packageVersion: (version: number) => string;
    noPackage: string;
    packageStaleNotice: string;
    /** Shown when the application is archived: no rebuild is possible. */
    packageArchivedNotice: string;
    /** Shown only when the server reports the package as currently usable. */
    packageUsable: string;
    packageHash: (hash: string) => string;
    packageIntegrityOk: string;
    packageIntegrityFailed: string;
    buildPackage: string;
    buildingPackage: string;
    archive: string;
    archiving: string;
    edit: string;
    save: string;
    saving: string;
    detailTitle: string;
    selectPrompt: string;
    referencesHeading: string;
    referencesEmpty: string;
    referenceKindLabel: string;
    referenceKindFact: string;
    referenceKindRequirement: string;
    referenceKindDocument: string;
    referenceIdLabel: string;
    bindReference: string;
    bindingReference: string;
    revokeReference: string;
    revokingReference: string;
    referenceUnavailable: string;
    referenceChanged: string;
    referenceRevoked: string;
    missingDataHeading: string;
    missingIntake: string;
    missingVerification: string;
    missingReferences: string;
    threeSchoolHint: string;
    archivedNotice: string;
    loadFailed: string;
    saveFailed: string;
    stateChanged: string;
    unavailable: string;
    authenticationRequired: string;
    limitReached: string;
    validationFailed: string;
    notFound: string;
    retry: string;
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
    /** Pipeline finished; usability is still shown in the conversation panel. */
    extractionFinished: string;
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
    registeredVipRequired: string;
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
    /** Stored durably but extraction has not produced usable text yet. */
    stored: string;
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
    /** Guest accounts cannot own documents, so files require an account. */
    signInForFiles: string;
    /** Project shared documents are not part of the M1.4 scope. */
    projectDocumentsUnavailable: string;
  };
  /**
   * Phase 12 Stage 2 compact workspace: the chat is the primary reading area and
   * the side panels are reachable through one labelled tab strip on narrow
   * viewports instead of a forced right-hand column.
   */
  panels: {
    label: string;
    history: string;
    conversationFiles: string;
    accountFiles: string;
    caseSummary: string;
    close: string;
    conversationFilesEmpty: string;
    conversationFilesHint: string;
  };
  policy: {
    /** The card is a topic reference, not verified current law. */
    snapshotNotice: string;
    revision: string;
    revisionUnknown: string;
    boundAt: string;
    sourceUnavailableTitle: string;
    sourceUnavailableBody: string;
    launchFailedTitle: string;
    launchFailedBody: string;
    launchSchemaTitle: string;
    launchSchemaBody: string;
    retry: string;
    continueWithoutPolicy: string;
    openPolicy: string;
    listBadge: string;
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
    questionPreview: string;
    answerPreview: string;
    optionalNote: string;
    submitting: string;
    submit: string;
    attachmentsTitle: string;
    attachmentsIntro: string;
    attachmentsNone: string;
    attachmentsLoading: string;
    attachmentsLoadError: string;
    attachmentsUnavailable: string;
    attachmentsSelectedPrefix: string;
    attachmentsAcknowledged: string;
    attachmentsNotAcknowledged: string;
    attachmentsWithheldWarning: string;
    attachmentsLimitError: string;
    attachmentsNoSelection: string;
    attachmentsRetry: string;
    attachmentsLoadBlocked: string;
    attachmentsAlreadyRequested: string;
    attachmentsViewExisting: string;
    sharedDocumentsLabel: string;
    attachmentsCountUnknown: string;
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
    createFailed: "无法创建对话，请重试。",
    policyTopicBadge: "政策主题",
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
  projectChat: {
    badge: "项目对话",
    readOnlyBadge: "项目对话（只读）",
    title: "项目对话（只读）",
    description: "此项目对话目前仅供查看，因为项目已关闭或项目对话写入已暂停。",
    listHint: "项目对话只读",
    readOnlySubmitBlocked: "此项目对话目前为只读。请新建普通对话后继续提问。",
    unsupportedWorkflowBlocked:
      "项目对话目前仅支持聊天，无法上传文件或发起人工复核。",
    startNewConversation: "新建普通对话",
    startNewConversationHint: "此项目对话仍可在项目状态允许时查看。",
  },
  projectEntry: {
    createProject: "新建项目",
    projects: "我的项目",
    expandProjects: "展开我的项目",
    collapseProjects: "收起我的项目",
    projectLabel: (date, shortId) => `项目 · ${date} · #${shortId}`,
    selectedProject: "已选择项目",
    projectId: "项目编号",
    createDialogTitle: "新建项目",
    createDialogDescription:
      "这会创建一个空项目容器，用于保存您自己的项目对话。项目文件、共享事实和学习流程尚未开放。",
    createDialogCancel: "取消",
    createDialogConfirm: "创建项目",
    creatingProject: "正在创建项目…",
    loadingProjects: "正在加载项目…",
    projectsEmpty: "还没有项目。",
    chatsTitle: "此项目中的我的对话",
    loadingChats: "正在加载项目对话…",
    chatsEmpty: "此项目还没有对话。您可以新建一条项目对话。",
    projectChatLabel: "项目对话",
    newProjectChat: "新建项目对话",
    creatingChat: "正在创建项目对话…",
    openingChat: "正在打开对话…",
    backToConversations: "返回全部对话",
    standaloneConversation: "新建普通对话",
    projectChatHistoryScope: "每条项目对话都有独立的消息记录。",
    projectContextUnavailable:
      "项目文件、共享事实和学习流程目前尚不可用。此项目尚未打开任何对话。",
    readOnly: "只读",
    retry: "重试",
    loadFailed: "无法加载项目，请重试。",
    authenticationRequired: "登录状态已失效，请重新登录后重试。",
    accessDenied: "您目前无权访问此项目。项目选择已清除。",
    notFound: "项目或对话已不可用。项目选择已清除。",
    stateChanged: "项目状态已更改，请刷新后重试。",
    unavailable: "项目服务暂时不可用，请稍后重试。",
    requestFailed: "项目请求失败，请重试。",
    networkFailed: "网络请求未能确认结果。请重试；安全重试会沿用原操作编号。",
    loadMoreChats: "加载更多项目对话",
    documents: {
      title: "项目文件",
      unavailable: "项目文件功能尚未开放。此处不会显示模拟文件。",
      ownOnly:
        "文件访问仅限本人，并按用途单独授权；项目所有者不会自动看到其他成员的文件。",
      scannerGate:
        "上传、导入和下载将在扫描来源认证、隐私告知与保留规则获批后开放。",
      loading: "正在加载授权访问的文件…",
      empty: "此项目没有您可查看的文件。",
      loadFailed: "无法加载文件。",
      upload: "上传项目文件",
      importing: "从我的对话导入",
      sourceChatId: "来源对话编号",
      sourceDocumentId: "来源文件编号",
      consent:
        "我确认将此文件复制到所选项目，并了解项目成员不会因此自动获得访问权限。",
      import: "确认并导入",
      download: "下载",
      withdraw: "撤回文件",
      pendingScan: "等待安全扫描；尚不可下载。",
      stored: "文件已存储",
      clean: "已完成可信扫描",
      rejected: "扫描未通过；不可下载。",
      failed: "文件不可用",
      uploading: "正在处理…",
      storagePending: "存储状态：等待中",
      storageStored: "存储状态：已保存",
      cleanupPending: "存储状态：等待安全清理",
      securityPending: "安全状态：等待扫描",
      securityFailed: "安全状态：扫描失败",
    },
  },
  schoolAdmissions: {
    title: "入学申请流程",
    subtitle:
      "每所学校独立管理：申请准备、自助或代办、录取通知与 CoE 证据，都按来源与确认状态如实显示。",
    notice:
      "这里只记录准备过程与客户提供的材料。系统不会向学校提交申请，也不会自动确认录取、CoE 或签证资格。",
    loading: "正在加载入学申请…",
    empty:
      "还没有入学申请。可基于学校申请创建，或直接记录已有的录取通知 / CoE。",
    createFromApplication: "从学校申请创建",
    createStandalone: "记录已有录取通知 / CoE",
    createTitle: "新建入学申请记录",
    createDescription:
      "学校申请会自动带入学校与课程；如已收到录取通知或 CoE，可直接记录，无需虚构学校申请。",
    selectApplicationLabel: "选择已有学校申请",
    selectApplicationPlaceholder: "请选择要办理的学校申请",
    noSelectableApplications:
      "暂无可用的学校申请（已建立入学记录的申请不会重复列出）。",
    selectDocumentLabel: "选择已上传的文件（可选）",
    selectDocumentPlaceholder: "不附带文件",
    documentsEmpty: "暂无已通过安全检查的文件。",
    documentsUnavailable: "文件列表暂不可用。",
    recordWithDocument: "附带文件记录（文件未核验）",
    institutionLabel: "学校名称",
    courseLabel: "课程名称",
    intakeLabel: "入学时间",
    originLabel: "入口类型",
    origin: {
      school_application: "基于学校申请",
      existing_offer: "已有录取通知",
      existing_coe: "已有 CoE",
      claimed_exception: "声明的例外情况",
    },
    serviceModeLabel: "服务方式",
    serviceMode: {
      self_service: "自助服务",
      managed_service: "代办服务",
    },
    selfNotice:
      "自助服务：您自行准备材料并在系统外提交，系统只记录您报告的操作。",
    managedNotice:
      "代办服务：需要正式签约、指派、资料授权、专业审核与付款条件；当前权威接口不可用，结果只会显示 UNKNOWN 或未就绪。会员身份不等于代办资格。",
    checklistHeading: "材料清单",
    requirement: {
      application_target_complete: "学校与课程信息完整",
      evidence_fact_available: "已确认的项目事实",
      evidence_document_available: "可用的授权文件",
      education_source_resolved: "教育目录来源匹配",
      preparation_package_usable: "可用的不可变准备包",
      customer_confirmation_recorded: "客户已确认草稿",
      managed_engagement_current: "有效的代办委托",
      managed_authority_verified: "已核实的专业权限",
      outcome_pathway_present: "已记录录取/例外路径",
      coe_evidence_recorded: "已记录 CoE 证据",
    },
    requirementStatus: {
      satisfied: "已满足",
      missing: "缺失",
      unverified: "未核实",
      conflicting: "存在冲突",
      unknown: "无法确定",
      not_applicable: "不适用",
    },
    draftHeading: "准备草稿",
    provisionalNotice:
      "草稿始终为暂定内容：由系统按已授权来源生成，未经学校、律师或任何官方机构确认。",
    section: {
      application_summary: "申请概要",
      academic_background: "学术背景",
      english_proficiency: "英语能力",
      financial_capacity: "资金能力",
      study_purpose: "学习目的",
      provider_requirements: "学校要求",
      next_steps: "下一步",
    },
    confirmDraft: "确认此草稿版本",
    confirmedNotice:
      "您已确认该草稿版本；如来源或申请内容变化，将自动标记为过期。",
    staleNotice:
      "此草稿已过期：相关来源、申请内容或服务方式发生变化，请重新生成。",
    offerHeading: "录取通知（Offer）",
    recordOffer: "记录录取通知",
    transitionOffer: "更新录取状态",
    offerAction: {
      start_review: "开始审核",
      accept: "接受",
      decline: "拒绝",
      expire: "标记已过期",
      defer: "延期决定",
    },
    offerState: {
      none: "尚未收到",
      received: "已收到（客户报告）",
      under_review: "审核中",
      accepted: "已接受",
      declined: "已拒绝",
      expired: "已过期",
      deferred: "已延期",
    },
    expiryState: {
      valid: "仍在有效期",
      expiring_soon: "即将到期",
      expired: "已过期",
      unknown: "有效期未知",
      not_applicable: "不适用",
    },
    coeHeading: "CoE（入学确认）",
    recordCoe: "记录 CoE",
    coeState: {
      none: "尚未获得",
      claimed: "客户声称已获得（未提供证据）",
      obtained: "已提供文件（未核验）",
      superseded: "已被更新记录取代",
    },
    evidenceNotice:
      "附带文件只表示客户提供了文件，不代表文件真实、学校确认或已通过审核。CoE 不会自动产生学生 500 签证资格。",
    externalActionHeading: "我在系统外的操作",
    externalAction: {
      school_portal_submission: "在学校门户提交",
      email_submission: "通过邮件提交",
      paper_form_submission: "纸质表格提交",
      agent_submission: "通过中介提交",
      phone_follow_up: "电话跟进",
      other: "其他",
    },
    externalActionNotice:
      "这些记录只代表您自己的报告，系统无法核实，也不等同于学校已收到或已受理。",
    recordExternalAction: "记录自助操作",
    exceptionHeading: "学校申请例外",
    exceptionNotice:
      "例外声明必须由权威来源核实；在核实之前，系统只会显示为待核实，不会视为可跳过学校申请。",
    claimException: "声明例外",
    verifyException: "请求权威核实",
    readinessHeading: "代办就绪度",
    evaluateReadiness: "重新评估就绪度",
    readinessStatus: {
      NOT_EVALUATED: "尚未评估",
      READY: "条件齐备（仍需人工确认）",
      NOT_READY: "未就绪",
      UNKNOWN: "无法确定",
    },
    submissionNotice:
      "即使就绪度为 READY，系统也没有任何学校提交接口：提交状态永远是“未连接”。",
    nextStepsHeading: "下一步建议",
    nextStep: {
      complete_application_details: "补全学校与课程信息",
      bind_source_evidence: "绑定项目事实或文件",
      resolve_conflicting_facts: "处理冲突的项目事实",
      build_preparation_package: "生成不可变准备包",
      record_customer_confirmation: "确认草稿版本",
      select_service_mode: "选择服务方式",
      record_offer_or_exception: "记录录取通知或例外",
      record_coe_evidence: "记录 CoE 文件",
      review_offer_expiry: "检查录取通知有效期",
      await_institutional_response: "等待学校回复",
      request_managed_service_support: "联系团队了解代办条件",
      verify_exception_authoritatively: "等待权威核实例外",
    },
    disclosuresHeading: "重要说明",
    disclosure: {
      not_a_school_submission: "本页不是学校申请提交。",
      no_institutional_decision: "没有任何学校录取决定被记录或确认。",
      no_verified_offer_or_coe: "没有经过核实的录取通知或 CoE。",
      customer_report_not_verified: "客户报告的信息未被独立核实。",
      document_not_authenticated: "上传文件未做真实性鉴定。",
      coe_does_not_establish_student_500_eligibility:
        "CoE 不代表已具备学生 500 签证资格。",
      managed_submission_not_connected: "代办提交接口尚未连接。",
      vip_not_managed_entitlement: "会员身份不包含代办服务。",
      professional_authority_unavailable: "专业审核与签名授权当前不可用。",
      ai_assist_unavailable: "AI 辅助撰写当前未启用。",
      draft_is_provisional: "草稿内容为暂定，需您本人确认。",
      catalog_not_independently_verified: "教育目录信息未获学校独立确认。",
      requirements_not_legal_advice: "材料清单不构成法律意见。",
      payment_not_certified: "付款条件未被确认。",
    },
    errorNotFound: "未找到该入学申请记录。",
    errorStateChanged: "状态已变化，请刷新后重试。",
    errorAuthority: "该操作需要当前不可用的权威核实。",
    errorUnavailable: "相关服务暂时不可用，请稍后重试。",
    errorInvalid: "请求内容无效。",
    actionFailed: "操作未完成，请重试。",
    refresh: "刷新",
  },

  schoolApplications: {
    title: "我的学校申请",
    subtitle:
      "每个学校申请都是独立记录：同一项目下可同时管理多所学校、课程与入学时间。",
    notice:
      "这里只保存您的准备资料，不会向任何学校提交申请；不代表录取结果、Offer、CoE、付款确认或律师专业审核。",
    loading: "正在加载学校申请…",
    empty: "此项目还没有学校申请。您可以先添加第一所学校。",
    create: "添加学校申请",
    createTitle: "新增学校申请",
    createDescription:
      "请填写学校与课程资料。未获得可信目录确认的信息会明确标注为“未核实”，不会被视为官方信息。",
    cancel: "取消",
    confirm: "保存学校申请",
    creating: "正在保存…",
    institutionLabel: "学校名称",
    institutionIdLabel: "目录学校编号（可选）",
    courseLabel: "课程名称",
    courseIdLabel: "目录课程编号（可选）",
    deliveryIdLabel: "授课地点编号（可选）",
    intakeLabel: "入学时间（可选）",
    intakeIdLabel: "目录入学批次编号（可选）",
    optionalHint: "留空即表示由您自行填写，未经核实。",
    statusDraft: "草稿",
    statusPreparing: "准备中",
    statusPackagePrepared: "准备包已生成",
    statusStale: "资料已变更，准备包已失效",
    statusArchived: "已归档",
    sourceHeading: "资料来源",
    sourceUnverifiedCustomer: "您自行填写，未核实；不是学校官方信息。",
    sourceUnverifiedCatalog:
      "来自教育目录（未核实类记录），不代表学校官方确认。",
    sourceSyntheticCatalog: "来自合成测试目录，仅用于演示，不是真实学校信息。",
    revisionLabel: (revision) => `版本 ${revision}`,
    packageHeading: "准备包版本",
    packageVersion: (version) => `第 ${version} 版`,
    noPackage: "尚未生成准备包。",
    packageStaleNotice:
      "资料或引用已变更，当前准备包已失效；请重新生成以取得新的版本与哈希。",
    packageArchivedNotice:
      "该申请已归档，历史准备包仅作记录保留，不能用于当前准备或后续提交。",
    packageUsable: "当前准备包可用（资料与引用均已核对）。",
    packageHash: (hash) => `内容哈希 ${hash.slice(0, 16)}…`,
    packageIntegrityOk: "哈希校验通过",
    packageIntegrityFailed: "哈希校验失败，请勿使用此准备包",
    buildPackage: "生成准备包",
    buildingPackage: "正在生成…",
    archive: "归档",
    archiving: "正在归档…",
    edit: "修改资料",
    save: "保存修改",
    saving: "正在保存…",
    detailTitle: "申请详情",
    selectPrompt: "选择左侧的学校申请查看详情。",
    referencesHeading: "引用的项目资料",
    referencesEmpty: "尚未引用任何项目资料。",
    referenceKindLabel: "资料类型",
    referenceKindFact: "事实",
    referenceKindRequirement: "材料要求",
    referenceKindDocument: "文件",
    referenceIdLabel: "资料编号",
    bindReference: "引用此资料",
    bindingReference: "正在引用…",
    revokeReference: "取消引用",
    revokingReference: "正在取消…",
    referenceUnavailable: "您已无权访问此资料，准备包已标记为失效。",
    referenceChanged: "引用资料的版本已变更，准备包需要重新生成。",
    referenceRevoked: "已取消引用",
    missingDataHeading: "仍缺少的资料",
    missingIntake: "尚未选择入学时间",
    missingVerification: "学校/课程信息未核实",
    missingReferences: "尚未引用任何项目资料",
    threeSchoolHint:
      "可同时管理多所学校申请；每所学校的版本与失效状态互相独立。",
    archivedNotice: "此申请已归档，不能继续修改。",
    loadFailed: "无法加载学校申请，请重试。",
    saveFailed: "保存失败，请重试。",
    stateChanged: "资料已在他处更新，请刷新后重试。",
    unavailable: "学校申请功能暂时不可用。",
    authenticationRequired: "登录状态已失效，请重新登录。",
    limitReached: "此项目的学校申请数量已达上限。",
    validationFailed: "请检查填写内容后重试。",
    notFound: "找不到此学校申请。",
    retry: "重试",
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
    extractionFinished: "解析流程已完成（是否可用于 AI 请见本对话文件列表）",
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
    registeredVipRequired: "Legal Check 需要有效 VIP 会员资格。",
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
    stored: "已保存，等待解析",
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
    signInForFiles: "登录账号后即可上传并管理文件。",
    projectDocumentsUnavailable: "项目文件目前尚不可用。",
    warning: "仅向 AI 提供了文件中有界的提取内容。文件可能还包含其他信息。",
  },
  panels: {
    label: "上下文面板",
    history: "历史对话",
    conversationFiles: "本对话文件",
    accountFiles: "我的历史文件",
    caseSummary: "案件摘要",
    close: "收起面板",
    conversationFilesEmpty: "本对话还没有文件。",
    conversationFilesHint:
      "在此管理本对话的文件。只有本对话的文件会提供给 AI；账号历史文件仅用于您自己查看与下载。",
  },
  policy: {
    snapshotNotice:
      "此卡片记录本对话最初提问的政策主题（创建时快照），不是当前有效法律的证明。请以官方来源与回答中的来源为准。",
    revision: "创建时版本",
    revisionUnknown: "创建时版本未记录",
    boundAt: "关联时间",
    sourceUnavailableTitle: "该政策主题当前不可用",
    sourceUnavailableBody:
      "本对话关联的政策主题已无法在已发布列表中解析（可能已下架、被撤回或尚未发布）。历史对话仍然保留，您可以继续追问，但请勿把该主题当作现行法律。",
    launchFailedTitle: "无法打开该政策对话",
    launchFailedBody:
      "我们无法把这次政策提问保存到您的账号，因此没有创建新对话。您可以重试，或直接开始一个普通对话。",
    launchSchemaTitle: "政策关联功能尚未在此环境中启用",
    launchSchemaBody:
      "当前数据库尚未包含政策关联结构，因此这次政策提问无法保存。请联系管理员或稍后重试；您也可以开始一个普通对话。",
    retry: "重试",
    continueWithoutPolicy: "不带政策并开始普通对话",
    openPolicy: "查看政策页面",
    listBadge: "政策",
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
      "律师会收到已保存的问题、答复、可见上下文，以及你在下方勾选共享的文件摘录。未勾选的文件不会发送。",
    questionPreview: "问题预览：",
    answerPreview: "答复预览：",
    optionalNote: "给律师的补充说明（选填）",
    submitting: "正在提交…",
    submit: "提交审阅请求",
    attachmentsTitle: "选择要共享给律师的文件",
    attachmentsIntro:
      "默认不共享任何文件。只有你勾选的文件及其允许的证据摘录（受现有摘录上限限制）会发送给律师。你可以不勾选任何文件，仍提交审阅请求。",
    attachmentsNone: "本次对话没有可作为附件共享的文件。",
    attachmentsLoading: "正在加载可共享文件…",
    attachmentsLoadError: "无法加载可共享文件，请重试。",
    attachmentsUnavailable: "部分文件当前不可共享，已从列表中移除。",
    attachmentsSelectedPrefix: "已选择",
    attachmentsAcknowledged: "AI 答复声明使用过此文件",
    attachmentsNotAcknowledged: "AI 答复未声明使用此文件",
    attachmentsWithheldWarning:
      "以下 AI 答复声明使用过的文件你没有勾选，律师将不会收到它们的任何内容：",
    attachmentsLimitError: "最多只能共享 4 个文件，请取消勾选多余的文件。",
    attachmentsNoSelection: "未选择任何文件，律师将不会收到文件摘录。",
    attachmentsRetry: "重新加载附件",
    attachmentsLoadBlocked: "在文件列表成功加载之前，无法提交审阅请求。",
    attachmentsAlreadyRequested:
      "此答复已提交过律师审阅请求，无法再次提交，也无法修改已共享的附件。",
    attachmentsViewExisting: "查看已有律师请求",
    sharedDocumentsLabel: "已共享附件",
    attachmentsCountUnknown: "未记录",
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
    createFailed: "The conversation could not be created. Please try again.",
    policyTopicBadge: "Policy topic",
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
  projectChat: {
    badge: "Project chat",
    readOnlyBadge: "Project chat (read-only)",
    title: "Project chat (read-only)",
    description:
      "This Project Chat is available for reading because the Project is closed or Project Chat writes are paused.",
    listHint: "Read-only Project Chat",
    readOnlySubmitBlocked:
      "This Project Chat is read-only. Start a new standard conversation to ask a new question.",
    unsupportedWorkflowBlocked:
      "Project Chats currently support chat turns only. File uploads and lawyer review are unavailable.",
    startNewConversation: "Start a standard conversation",
    startNewConversationHint:
      "This Project Chat remains available for reading while you are authorized.",
  },
  projectEntry: {
    createProject: "Create Project",
    projects: "My Projects",
    expandProjects: "Expand My Projects",
    collapseProjects: "Collapse My Projects",
    projectLabel: (date, shortId) => `Project · ${date} · #${shortId}`,
    selectedProject: "Selected Project",
    projectId: "Project ID",
    createDialogTitle: "Create Project",
    createDialogDescription:
      "This creates an empty Project container for your own Project Chats. Project files, shared facts and study workflows are not available yet.",
    createDialogCancel: "Cancel",
    createDialogConfirm: "Create Project",
    creatingProject: "Creating Project…",
    loadingProjects: "Loading Projects…",
    projectsEmpty: "You do not have any Projects yet.",
    chatsTitle: "My Chats in this Project",
    loadingChats: "Loading Project Chats…",
    chatsEmpty: "This Project has no Chats yet. You can create a Project Chat.",
    projectChatLabel: "Project Chat",
    newProjectChat: "New Project Chat",
    creatingChat: "Creating Project Chat…",
    openingChat: "Opening Chat…",
    backToConversations: "Back to all conversations",
    standaloneConversation: "New standard conversation",
    projectChatHistoryScope: "Each Project Chat has its own message history.",
    projectContextUnavailable:
      "Project files, shared facts and study workflows are not available yet. No Chat is open for this Project.",
    readOnly: "Read-only",
    retry: "Retry",
    loadFailed: "Could not load Projects. Please try again.",
    authenticationRequired: "Your sign-in has expired. Sign in and try again.",
    accessDenied:
      "You cannot access this Project now. Project selection was cleared.",
    notFound:
      "The Project or Chat is no longer available. Project selection was cleared.",
    stateChanged: "Project state changed. Refresh and try again.",
    unavailable:
      "The Project service is temporarily unavailable. Try again later.",
    requestFailed: "The Project request failed. Please try again.",
    networkFailed:
      "The network could not confirm the result. Retry safely; the same operation ID will be reused.",
    loadMoreChats: "Load more Project Chats",
    documents: {
      title: "Project documents",
      unavailable:
        "Project documents are not enabled. No sample files are shown here.",
      ownOnly:
        "Access is limited to the owner and grants for a specific purpose; Project owners do not automatically see members' files.",
      scannerGate:
        "Upload, import and download require approved scan-origin authentication, privacy notice and retention rules.",
      loading: "Loading files you are authorized to see…",
      empty: "This Project has no files available to you.",
      loadFailed: "Could not load documents.",
      upload: "Upload a Project document",
      importing: "Import from my Chat",
      sourceChatId: "Source Chat ID",
      sourceDocumentId: "Source document ID",
      consent:
        "I agree to copy this file into the selected Project and understand membership does not automatically grant access.",
      import: "Confirm and import",
      download: "Download",
      withdraw: "Withdraw document",
      pendingScan: "Waiting for security scan; download is unavailable.",
      stored: "Stored",
      clean: "Trusted scan complete",
      rejected: "Scan rejected; download unavailable.",
      failed: "Unavailable",
      uploading: "Working…",
      storagePending: "Storage: pending",
      storageStored: "Storage: stored",
      cleanupPending: "Storage: cleanup pending",
      securityPending: "Security: scan pending",
      securityFailed: "Security: scan failed",
    },
  },
  schoolAdmissions: {
    title: "Admissions workflow",
    subtitle:
      "Each school is managed on its own: preparation, self-service or managed service, offers and CoE evidence are shown exactly as sourced and confirmed.",
    notice:
      "This records preparation and customer-provided material only. Nothing is submitted to a school, and no admission, CoE or visa outcome is ever confirmed automatically.",
    loading: "Loading admissions cases…",
    empty:
      "No admissions case yet. Start from a school application, or record an existing Offer or CoE.",
    createFromApplication: "Start from a school application",
    createStandalone: "Record an existing Offer or CoE",
    createTitle: "New admissions case",
    createDescription:
      "A school application brings its institution and course across. If you already hold an Offer or CoE you can record it without inventing an application.",
    selectApplicationLabel: "Choose an existing school application",
    selectApplicationPlaceholder: "Select the school application to work on",
    noSelectableApplications:
      "No school application is available (applications that already have an admission case are not listed again).",
    selectDocumentLabel: "Choose an uploaded document (optional)",
    selectDocumentPlaceholder: "No document attached",
    documentsEmpty: "No document has passed the security scan yet.",
    documentsUnavailable: "The document list is temporarily unavailable.",
    recordWithDocument: "Record with document (document not authenticated)",
    institutionLabel: "Institution",
    courseLabel: "Course",
    intakeLabel: "Intake",
    originLabel: "Entry point",
    origin: {
      school_application: "From a school application",
      existing_offer: "Existing offer",
      existing_coe: "Existing CoE",
      claimed_exception: "Claimed exception",
    },
    serviceModeLabel: "Service mode",
    serviceMode: {
      self_service: "Self-service",
      managed_service: "Managed service",
    },
    selfNotice:
      "Self-service: you prepare and submit outside this system. Only your own reported actions are recorded here.",
    managedNotice:
      "Managed service requires a real engagement, assignment, disclosure grant, professional review and payment condition. The authorities are unavailable, so the result can only be UNKNOWN or not ready. Membership is not managed-service entitlement.",
    checklistHeading: "Requirement checklist",
    requirement: {
      application_target_complete: "Institution and course complete",
      evidence_fact_available: "Confirmed Project facts",
      evidence_document_available: "Authorised documents",
      education_source_resolved: "Education catalogue match",
      preparation_package_usable: "Usable immutable package",
      customer_confirmation_recorded: "Customer confirmation",
      managed_engagement_current: "Current managed engagement",
      managed_authority_verified: "Verified professional authority",
      outcome_pathway_present: "Offer or exception recorded",
      coe_evidence_recorded: "CoE evidence recorded",
    },
    requirementStatus: {
      satisfied: "Satisfied",
      missing: "Missing",
      unverified: "Unverified",
      conflicting: "Conflicting",
      unknown: "Unknown",
      not_applicable: "Not applicable",
    },
    draftHeading: "Preparation draft",
    provisionalNotice:
      "This draft is always provisional: it is composed from authorised sources and is not confirmed by any school, lawyer or official body.",
    section: {
      application_summary: "Application summary",
      academic_background: "Academic background",
      english_proficiency: "English proficiency",
      financial_capacity: "Financial capacity",
      study_purpose: "Study purpose",
      provider_requirements: "Provider requirements",
      next_steps: "Next steps",
    },
    confirmDraft: "Confirm this draft version",
    confirmedNotice:
      "You confirmed this draft version. It becomes stale automatically if a source, the application or the service mode changes.",
    staleNotice:
      "This draft is stale: a source, the application or the service mode changed. Rebuild it before confirming.",
    offerHeading: "Offer",
    recordOffer: "Record an offer",
    transitionOffer: "Update offer status",
    offerAction: {
      start_review: "Start review",
      accept: "Accept",
      decline: "Decline",
      expire: "Mark expired",
      defer: "Defer",
    },
    offerState: {
      none: "None received",
      received: "Received (customer reported)",
      under_review: "Under review",
      accepted: "Accepted",
      declined: "Declined",
      expired: "Expired",
      deferred: "Deferred",
    },
    expiryState: {
      valid: "Within validity",
      expiring_soon: "Expiring soon",
      expired: "Expired",
      unknown: "Expiry unknown",
      not_applicable: "Not applicable",
    },
    coeHeading: "CoE",
    recordCoe: "Record a CoE",
    coeState: {
      none: "Not obtained",
      claimed: "Claimed by customer (no evidence)",
      obtained: "Document attached (not authenticated)",
      superseded: "Superseded by a later record",
    },
    evidenceNotice:
      "An attached document means the customer supplied a file. It is not authenticated, not school-confirmed and not reviewed. A CoE never establishes Student 500 eligibility.",
    externalActionHeading: "What I did outside this system",
    externalAction: {
      school_portal_submission: "Submitted in a school portal",
      email_submission: "Submitted by email",
      paper_form_submission: "Submitted a paper form",
      agent_submission: "Submitted through an agent",
      phone_follow_up: "Followed up by phone",
      other: "Other",
    },
    externalActionNotice:
      "These are your own reports. They cannot be verified here and do not mean a school received or accepted anything.",
    recordExternalAction: "Record self-service action",
    exceptionHeading: "School-application exception",
    exceptionNotice:
      "An exception claim needs authoritative verification. Until then it stays unverified and never means the school application can be skipped.",
    claimException: "Claim an exception",
    verifyException: "Request authoritative verification",
    readinessHeading: "Managed-service readiness",
    evaluateReadiness: "Re-evaluate readiness",
    readinessStatus: {
      NOT_EVALUATED: "Not evaluated",
      READY: "Conditions met (human confirmation still required)",
      NOT_READY: "Not ready",
      UNKNOWN: "Unknown",
    },
    submissionNotice:
      "Even a READY observation cannot submit anything: there is no institutional submission adapter, so submission state is always not connected.",
    nextStepsHeading: "Suggested next steps",
    nextStep: {
      complete_application_details:
        "Complete the institution and course details",
      bind_source_evidence: "Bind Project facts or documents",
      resolve_conflicting_facts: "Resolve conflicting Project facts",
      build_preparation_package: "Build the immutable preparation package",
      record_customer_confirmation: "Confirm the draft version",
      select_service_mode: "Choose a service mode",
      record_offer_or_exception: "Record an offer or exception",
      record_coe_evidence: "Record CoE evidence",
      review_offer_expiry: "Review the offer expiry",
      await_institutional_response: "Await the institution's response",
      request_managed_service_support: "Contact the team about managed service",
      verify_exception_authoritatively: "Await authoritative exception review",
    },
    disclosuresHeading: "Important limits",
    disclosure: {
      not_a_school_submission:
        "This page is not a school application submission.",
      no_institutional_decision:
        "No institutional decision has been recorded or confirmed.",
      no_verified_offer_or_coe: "No verified offer or CoE exists.",
      customer_report_not_verified:
        "Customer-reported information is not independently verified.",
      document_not_authenticated: "Uploaded documents are not authenticated.",
      coe_does_not_establish_student_500_eligibility:
        "A CoE does not establish Student 500 visa eligibility.",
      managed_submission_not_connected:
        "The managed submission channel is not connected.",
      vip_not_managed_entitlement:
        "Membership does not include managed service.",
      professional_authority_unavailable:
        "Professional review and signature authority are unavailable.",
      ai_assist_unavailable: "AI drafting assistance is not enabled.",
      draft_is_provisional:
        "The draft is provisional and needs your confirmation.",
      catalog_not_independently_verified:
        "Education catalogue data is not independently institution-confirmed.",
      requirements_not_legal_advice: "The checklist is not legal advice.",
      payment_not_certified: "No payment condition has been certified.",
    },
    errorNotFound: "Admissions case not found.",
    errorStateChanged: "The state changed. Refresh and try again.",
    errorAuthority: "This action needs an authority that is not available.",
    errorUnavailable:
      "The service is temporarily unavailable. Try again later.",
    errorInvalid: "The request was not valid.",
    actionFailed: "The action did not complete. Please retry.",
    refresh: "Refresh",
  },

  schoolApplications: {
    title: "My school applications",
    subtitle:
      "Each school application is a separate record: manage several schools, courses and intakes inside one Project.",
    notice:
      "This only stores your preparation data. Nothing is submitted to any school and it is not an admission outcome, an Offer, a CoE, a payment confirmation or a lawyer approval.",
    loading: "Loading school applications…",
    empty:
      "This Project has no school applications yet. Add your first school.",
    create: "Add school application",
    createTitle: "New school application",
    createDescription:
      "Enter the school and course details. Details that are not confirmed by a trusted catalog are shown as unverified and are never treated as official.",
    cancel: "Cancel",
    confirm: "Save application",
    creating: "Saving…",
    institutionLabel: "Institution name",
    institutionIdLabel: "Catalog institution ID (optional)",
    courseLabel: "Course title",
    courseIdLabel: "Catalog course ID (optional)",
    deliveryIdLabel: "Campus/delivery ID (optional)",
    intakeLabel: "Intake (optional)",
    intakeIdLabel: "Catalog intake ID (optional)",
    optionalHint:
      "Leave the catalog IDs empty to record your own unverified details.",
    statusDraft: "Draft",
    statusPreparing: "Preparing",
    statusPackagePrepared: "Package prepared",
    statusStale: "Changed — package invalidated",
    statusArchived: "Archived",
    sourceHeading: "Source of information",
    sourceUnverifiedCustomer:
      "Entered by you and unverified; not official school information.",
    sourceUnverifiedCatalog:
      "From the education catalog (unverified record class); not confirmed by the school.",
    sourceSyntheticCatalog:
      "From the synthetic test catalog; demonstration data only, not a real school.",
    revisionLabel: (revision) => `Version ${revision}`,
    packageHeading: "Preparation package",
    packageVersion: (version) => `Version ${version}`,
    noPackage: "No preparation package yet.",
    packageStaleNotice:
      "Material data or a reference changed, so the current package is invalidated. Rebuild it to obtain a new version and hash.",
    packageArchivedNotice:
      "This application is archived. Its historical packages are retained as records only and cannot be used for current preparation or a future submission.",
    packageUsable:
      "The current package is usable: its material data and references were re-checked.",
    packageHash: (hash) => `Content hash ${hash.slice(0, 16)}…`,
    packageIntegrityOk: "Hash verified",
    packageIntegrityFailed: "Hash mismatch — do not use this package",
    buildPackage: "Build package",
    buildingPackage: "Building…",
    archive: "Archive",
    archiving: "Archiving…",
    edit: "Edit details",
    save: "Save changes",
    saving: "Saving…",
    detailTitle: "Application detail",
    selectPrompt: "Select a school application to see its detail.",
    referencesHeading: "Referenced Project data",
    referencesEmpty: "No Project data is referenced yet.",
    referenceKindLabel: "Reference type",
    referenceKindFact: "Fact",
    referenceKindRequirement: "Requirement",
    referenceKindDocument: "Document",
    referenceIdLabel: "Reference ID",
    bindReference: "Reference this item",
    bindingReference: "Referencing…",
    revokeReference: "Remove reference",
    revokingReference: "Removing…",
    referenceUnavailable:
      "You no longer have access to this item, so the package is marked stale.",
    referenceChanged:
      "The referenced item changed version. Rebuild the package to refresh it.",
    referenceRevoked: "Reference removed",
    missingDataHeading: "Still missing",
    missingIntake: "No intake selected",
    missingVerification: "Institution/course is unverified",
    missingReferences: "No Project data referenced",
    threeSchoolHint:
      "You can manage several school applications at once; each keeps its own version and stale state.",
    archivedNotice: "This application is archived and cannot be edited.",
    loadFailed: "Could not load school applications. Please retry.",
    saveFailed: "Could not save. Please retry.",
    stateChanged: "This record changed elsewhere. Refresh and try again.",
    unavailable: "School applications are temporarily unavailable.",
    authenticationRequired: "Your session expired. Please sign in again.",
    limitReached:
      "This Project already has the maximum number of school applications.",
    validationFailed: "Please check the fields and try again.",
    notFound: "That school application was not found.",
    retry: "Retry",
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
    extractionFinished:
      "Extraction finished (AI usability is shown in this conversation's file list)",
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
    registeredVipRequired: "Legal Check requires an active VIP membership.",
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
    stored: "Saved, awaiting extraction",
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
    signInForFiles: "Sign in to your account to upload and manage files.",
    projectDocumentsUnavailable: "Project documents are not available yet.",
    warning:
      "Only bounded extracted portions of this file were supplied to the AI. The document may contain additional information.",
  },
  panels: {
    label: "Context panels",
    history: "Conversations",
    conversationFiles: "This conversation",
    accountFiles: "My files",
    caseSummary: "Case summary",
    close: "Collapse panel",
    conversationFilesEmpty: "No files in this conversation yet.",
    conversationFilesHint:
      "Manage this conversation's files here. Only this conversation's files are supplied to the AI; your account-wide files are for your own review and download.",
  },
  policy: {
    snapshotNotice:
      "This card records the policy topic this conversation started from (a snapshot taken at creation). It is not proof of the law currently in force — rely on the official source and the sources shown in answers.",
    revision: "Revision at creation",
    revisionUnknown: "Revision at creation not recorded",
    boundAt: "Linked",
    sourceUnavailableTitle: "This policy topic is currently unavailable",
    sourceUnavailableBody:
      "The policy topic linked to this conversation can no longer be resolved in the published list (it may have been withdrawn, superseded or unpublished). The retained conversation is unchanged and you can keep asking, but do not treat that topic as current law.",
    launchFailedTitle: "This policy conversation could not be opened",
    launchFailedBody:
      "Your policy question could not be saved to your account, so no new conversation was created. You can retry, or start an ordinary conversation instead.",
    launchSchemaTitle: "Policy linking is not enabled in this environment yet",
    launchSchemaBody:
      "This database does not include the policy-linking structure yet, so this policy launch cannot be saved. Ask an administrator or try again later; you can also start an ordinary conversation.",
    retry: "Retry",
    continueWithoutPolicy: "Continue without the policy topic",
    openPolicy: "Open the policy page",
    listBadge: "Policy",
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
      "The lawyer will receive the saved question, answer, visible context, and the document excerpts you choose to share below. Documents you do not check are not sent.",
    questionPreview: "Question preview: ",
    answerPreview: "Answer preview: ",
    optionalNote: "Optional note for the lawyer",
    submitting: "Submitting…",
    submit: "Submit review request",
    attachmentsTitle: "Choose the documents to share with the lawyer",
    attachmentsIntro:
      "Nothing is shared by default. Only the documents you check, and their permitted evidence excerpts (within the existing excerpt limit), are sent to the lawyer. You can submit the request without sharing any document.",
    attachmentsNone:
      "No document from this conversation can be shared as an attachment.",
    attachmentsLoading: "Loading the documents you can share…",
    attachmentsLoadError:
      "Unable to load the documents you can share. Please try again.",
    attachmentsUnavailable:
      "Some documents cannot be shared right now and were removed from this list.",
    attachmentsSelectedPrefix: "Selected",
    attachmentsAcknowledged: "The AI answer said it used this document",
    attachmentsNotAcknowledged:
      "The AI answer did not claim to use this document",
    attachmentsWithheldWarning:
      "You have not checked these documents that the AI answer said it used; the lawyer will not receive any part of them:",
    attachmentsLimitError:
      "You can share at most four documents. Uncheck the extra ones.",
    attachmentsNoSelection:
      "No document selected; the lawyer will not receive document excerpts.",
    attachmentsRetry: "Retry loading attachments",
    attachmentsLoadBlocked:
      "You cannot submit the review request until the document list has loaded.",
    attachmentsAlreadyRequested:
      "This answer already has a lawyer review request; it cannot be submitted again and its shared attachments cannot be changed.",
    attachmentsViewExisting: "View the existing lawyer request",
    sharedDocumentsLabel: "Shared attachments",
    attachmentsCountUnknown: "not recorded",
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
