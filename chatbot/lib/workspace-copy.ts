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
    /**
     * Phase 13 P1 truthful availability copy. A guest Project is tied to the
     * temporary guest session and has no account-transfer path yet.
     */
    guestTemporaryProject: string;
    /** Explicit administrator disable; ordinary conversations still work. */
    projectDisabled: string;
    /** Missing/incomplete schema or an unavailable Project service. */
    projectServiceUnavailable: string;
    /** M5 preparation is not open to this identity yet. */
    schoolPreparationRestricted: string;
    /** Bounded creation: the actor owns the maximum number of active Projects. */
    limitReached: string;
    /**
     * Phase 13 Project Workspace UX: the selected Project's main-content home
     * and its section navigation. Presentation only — no stage or progress copy.
     */
    projectHomeTitle: string;
    projectHomeSubtitle: string;
    projectHomeTab: string;
    projectSchoolApplicationsTab: string;
    projectSchoolAdmissionsTab: string;
    projectStudent500Tab: string;
    /** Phase 13 M9-A: the Project-level document centre section label. */
    projectDocumentsTab: string;
    projectReviewTab: string;
    projectHomeNextSteps: string;
    projectHomeOpenApplications: string;
    projectHomeOpenAdmissions: string;
    projectHomeApplicationsUnavailable: string;
    projectHomeAdmissionsUnavailable: string;
    /** Concise restriction wording for the home cards (registered-accounts-only). */
    projectHomeApplicationsRestricted: string;
    projectHomeAdmissionsRestricted: string;
    projectHomeOpenStudent500: string;
    projectHomeStudent500Unavailable: string;
    projectHomeStudent500Restricted: string;
    projectHomeLimits: string;
    projectHomeChatsHint: string;
    returnToProjectHome: string;
    projectStatusActive: string;
    projectStatusClosed: string;
    projectCreatedOn: string;
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
    /**
     * Phase 13 M9-A integrated customer workspace: Project navigation, the truthful
     * overview, step conversations, the contextual materials rail and the document
     * centre. Every label below describes real persisted state or an honest blocked
     * state; none of them is an eligibility, readiness, approval or submission claim.
     */
    projectWorkspace: {
      navTitle: string;
      navStages: string;
      navConversations: string;
      stageApplications: string;
      stageAdmissions: string;
      stageStudent500: string;
      stageDocuments: string;
      statusNotStarted: string;
      statusInProgress: string;
      statusNeedsInformation: string;
      statusBlocked: string;
      statusUnknown: string;
      stepChatOpen: string;
      stepChatReopen: string;
      stepChatUnavailable: string;
      stepChatOpening: string;
      overviewTitle: string;
      overviewPreparation: string;
      overviewReadiness: string;
      overviewBlockers: string;
      overviewNoBlockers: string;
      overviewNextAction: string;
      coverage: (readable: number, total: number) => string;
      openItems: (count: number) => string;
      needsAttention: (count: number) => string;
      progressUnavailable: string;
      readinessDisabled: string;
      readinessNotAssessed: string;
      blockerDocumentsUnavailable: string;
      blockerApplicationsDisabled: string;
      blockerStudent500Disabled: string;
      blockerStepChatsUnavailable: string;
      blockerApplicationMissingInformation: string;
      blockerApplicationPackageStale: string;
      blockerStudent500MissingFacts: string;
      blockerStudent500HumanReview: string;
      nextNeedsInformation: string;
      nextInProgress: string;
      nextNotStarted: string;
      nextDocuments: string;
      nextNone: string;
      refresh: string;
      loading: string;
      loadFailed: string;
      materialsTitle: string;
      materialsDocuments: string;
      materialsConversation: string;
      materialsNextAction: string;
      materialsStepUnavailable: string;
      materialsNoDocuments: string;
      materialsOpenDocuments: string;
      documentsCenterTitle: string;
      documentsCenterSubtitle: string;
      documentsFilterAll: string;
      documentsFilterSource: string;
      documentsFilterState: string;
      documentsSearch: string;
      documentsSearchPlaceholder: string;
      documentsSelected: string;
      documentsVersionHistory: string;
      documentsVersionLabel: (version: number) => string;
      documentsOrigin: string;
      documentsProvenance: string;
      documentsNoSelection: string;
      documentsEmptyFilter: string;
      documentsBackToStep: string;
      /** Phase 13 M9-A R1-04: return to whichever view the customer came from. */
      documentsBackToPrevious: string;
      /** Phase 13 M9-A R1-05: metadata-only generated-artifact references. */
      artifactsTitle: string;
      artifactsSubtitle: string;
      artifactsEmpty: string;
      /**
       * Phase 13 M9-C: shown instead of `artifactsEmpty` when the Project summary that
       * carries these references could not be read, so a failed read never looks like a
       * verified empty list.
       */
      artifactsUnavailable: string;
      artifactsTruncated: string;
      artifactsNoContent: string;
      artifactOpenOwner: string;
      artifactVersion: string;
      artifactStale: string;
      artifactKindSchoolApplicationPackage: string;
      artifactKindStudent500GsDraft: string;
      artifactKindStudent500Snapshot: string;
      artifactKindSubmissionPackage: string;
      artifactKindDisabled: string;
      artifactKindUnsupported: string;
      artifactKindUnavailable: string;
      documentsUnavailable: string;
      sourceDirectUpload: string;
      sourceChatImport: string;
      lifecycleActive: string;
      lifecycleWithdrawn: string;
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
    /**
     * Phase 13 M9-A final UX correction 3 — locale presentation of the stored M5.2 draft.
     * The stored body stays English; these keys localize the *view*.
     */
    draftSectionOther: string;
    draftViewNotice: string;
    draftAssistedNotice: string;
    draftStoredOriginalLabel: string;
    draftOutstandingHeading: string;
    draftOutstandingEmpty: string;
    draftUnknownRequirement: string;
    draftTemplate: {
      application_summary: string;
      intakeClause: string;
      academic_background_satisfied: string;
      academic_background_missing: string;
      english_proficiency: string;
      financial_capacity: string;
      study_purpose: string;
      provider_requirements_unverified: string;
      provider_requirements_missing: string;
      provider_requirements_unavailable: string;
      next_steps: string;
    };
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
  /**
   * Phase 13 M6.1 Student 500 application preparation surface. Every label below
   * describes a *preliminary screening*: no eligibility decision, no verified
   * CoE, no legal verification, no professional review and no submission.
   */
  student500: {
    title: string;
    subtitle: string;
    notice: string;
    submissionNotice: string;
    legalSourceHeading: string;
    legalSourceRevisionLabel: string;
    legalSourceVersionsLabel: string;
    legalSourceAsOfLabel: string;
    checklistHeading: string;
    checklistNote: string;
    checklistOpen: string;
    sourceNotice: string;
    loading: string;
    empty: string;
    create: string;
    createTitle: string;
    createDescription: string;
    cancel: string;
    confirm: string;
    creating: string;
    edit: string;
    save: string;
    saving: string;
    archive: string;
    archiving: string;
    refresh: string;
    detailTitle: string;
    selectPrompt: string;
    revisionLabel: (revision: number) => string;
    entryRouteLabel: string;
    entryRoute: Record<string, string>;
    applicationPlaceLabel: string;
    applicationPlace: Record<string, string>;
    coeStatusLabel: string;
    coeStatus: Record<string, string>;
    asOfDateLabel: string;
    asOfDateHint: string;
    currentVisaLabel: string;
    currentVisaHint: string;
    historyDeclarationLabel: string;
    historyDeclaration: Record<string, string>;
    historyFlagsLabel: string;
    historyFlag: Record<string, string>;
    ageBandLabel: string;
    ageBand: Record<string, string>;
    dependantsLabel: string;
    dependants: Record<string, string>;
    englishLabel: string;
    financialLabel: string;
    oshcLabel: string;
    evidenceStatus: Record<string, string>;
    schoolApplicationLabel: string;
    schoolApplicationHint: string;
    linkLoad: string;
    linkLoading: string;
    linkEmpty: string;
    linkError: string;
    linkNoneOption: string;
    linkRequired: string;
    optionalHint: string;
    screeningHeading: string;
    preparationState: Record<string, string>;
    countsLabel: string;
    countApplicable: string;
    countConditional: string;
    countNotApplicable: string;
    countUnknown: string;
    nextActionHeading: string;
    nextAction: Record<string, string>;
    missingHeading: string;
    missing: Record<string, string>;
    humanReviewHeading: string;
    humanReview: Record<string, string>;
    requirementsHeading: string;
    requirementLabels: Record<string, string>;
    requirementStatus: Record<string, string>;
    sourceVerification: Record<string, string>;
    evidencePreparation: Record<string, string>;
    sourcesHeading: string;
    sourceAuthority: Record<string, string>;
    sourcePendingNotice: string;
    sourceOpen: string;
    linkedSchoolHeading: string;
    linkedSchoolUnavailable: string;
    linkedSchoolStatus: (status: string) => string;
    disclosuresHeading: string;
    disclosure: Record<string, string>;
    errorAuthenticationRequired: string;
    errorNotFound: string;
    errorStateChanged: string;
    errorLimit: string;
    errorInvalid: string;
    errorUnavailable: string;
    errorRequestFailed: string;
    archivedNotice: string;
    prepTitle: string;
    prepSubtitle: string;
    prepNotice: string;
    prepSchoolHeading: string;
    prepSchoolNone: string;
    prepSchoolSelectRecord: string;
    prepSchoolEmpty: string;
    prepSchoolUnavailable: string;
    prepSchoolNoLongerCurrent: string;
    prepSchoolKind: Record<string, string>;
    prepFactsHeading: string;
    prepFactsEmpty: string;
    prepFactsUnavailable: string;
    prepFactsSelect: string;
    prepFactsRemove: string;
    prepFactsAiGrantMissing: string;
    prepFactsUnconfirmed: string;
    prepGapsHeading: string;
    prepGapsEmpty: string;
    prepConflictVisible: string;
    prepReviewRequired: string;
    prepDraftHeading: string;
    prepDraftEmpty: string;
    prepDraftCreate: string;
    prepDraftSave: string;
    prepDraftVersion: (version: number, origin: string) => string;
    prepDraftStale: string;
    prepDraftPlaceholder: string;
    prepDraftEditHint: string;
    prepSnapshotHeading: string;
    prepSnapshotEmpty: string;
    prepSnapshotCreate: string;
    prepSnapshotVersion: (version: number, revision: number) => string;
    prepSnapshotStale: string;
    prepNextActionsHeading: string;
    prepLoading: string;
    prepUnavailable: string;
    prepCoverage: Record<string, string>;
    prepGap: Record<string, string>;
    prepAction: Record<string, string>;
    prepStaleReason: Record<string, string>;
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
  /**
   * Phase 13 M9-B exact-version review surface (Picture3). Three independent dimensions
   * are named separately on purpose: no label may imply that one substitutes for another.
   */
  projectReview: {
    tab: string;
    heading: string;
    subtitle: string;
    notice: string;
    loading: string;
    empty: string;
    error: string;
    retry: string;
    refreshed: string;
    selectedHeading: string;
    versionLabel: string;
    digestLabel: string;
    digestUnknown: string;
    sourceLabel: string;
    kindLabel: Record<string, string>;
    dimensionsHeading: string;
    aiCheckLabel: string;
    confirmationLabel: string;
    professionalLabel: string;
    integrityLabel: string;
    aiCheck: Record<string, string>;
    confirmation: Record<string, string>;
    professional: Record<string, string>;
    integrity: Record<string, string>;
    /** Phase 13 M9-B correction 3: what the artifact source actually did. */
    sourceState: Record<string, string>;
    reason: Record<string, string>;
    requestReview: string;
    requesting: string;
    requestBlocked: string;
    requestRecorded: string;
    requestHistoryNote: string;
    reviewHistoryNote: string;
    staleNote: string;
    truncatedNote: string;
    approvalsAreExactVersion: string;
    notLegalAdvice: string;
    openOwnerView: string;
    professionalScope: string;
  };
  /** Phase 13 M9-B staff/lawyer workspace (queue + scoped detail). */
  staffWorkspace: {
    heading: string;
    subtitle: string;
    notice: string;
    loading: string;
    empty: string;
    error: string;
    retry: string;
    bucketsHeading: string;
    bucket: Record<string, string>;
    categoriesHeading: string;
    category: Record<string, string>;
    categoryState: Record<string, string>;
    entryLabel: Record<string, string>;
    openProject: string;
    detailHeading: string;
    shellHeading: string;
    disclosureHeading: string;
    permittedHeading: string;
    blockedHeading: string;
    reviewHeading: string;
    assignmentLabel: string;
    assignmentStatusLabel: string;
    acceptedLabel: string;
    lifecycleLabel: string;
    disclosureAllowed: string;
    disclosureDenied: string;
    noContentNotice: string;
    professionalNotice: string;
    backToQueue: string;
    reason: Record<string, string>;
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
    guestTemporaryProject:
      "访客项目仅属于本次访客会话：其他访客无法访问，目前也无法转移到注册账户。",
    projectDisabled: "项目创建已被管理员临时停用。普通对话不受影响。",
    projectServiceUnavailable:
      "项目服务暂时不可用。普通对话不受影响，请稍后重试。",
    schoolPreparationRestricted:
      "学校申请与入学准备目前仅向已注册个人账户开放。访客与工作人员账户可以创建自己的项目，但暂时不能使用该准备功能。",
    limitReached:
      "您已达到可同时拥有的项目数量上限。请先关闭不再使用的项目，然后再新建。",
    projectHomeTitle: "项目主页",
    projectHomeSubtitle:
      "在这里查看项目信息，或进入学校申请与入学准备。所有状态均来自服务器的真实数据。",
    projectHomeTab: "项目主页",
    projectSchoolApplicationsTab: "学校申请",
    projectSchoolAdmissionsTab: "入学流程",
    projectStudent500Tab: "学生签证 500",
    projectDocumentsTab: "项目文件",
    projectReviewTab: "律师审核",
    projectHomeNextSteps: "下一步",
    projectHomeOpenApplications: "查看或新建学校申请草稿。",
    projectHomeOpenAdmissions: "查看入学准备流程及其真实状态。",
    projectHomeApplicationsUnavailable: "当前环境尚未开放学校申请功能。",
    projectHomeAdmissionsUnavailable: "当前环境尚未开放入学流程功能。",
    projectHomeApplicationsRestricted: "学校申请目前仅向已注册个人账户开放。",
    projectHomeOpenStudent500: "记录申请人情况，查看带来源标注的初步要求清单。",
    projectHomeStudent500Unavailable: "当前环境尚未开放学生签证 500 准备功能。",
    projectHomeStudent500Restricted:
      "学生签证 500 准备目前仅向已注册个人账户开放。",
    projectHomeAdmissionsRestricted: "入学流程目前仅向已注册个人账户开放。",
    projectHomeLimits:
      "项目文件、共享事实与分阶段进度尚未开放；此处不会显示模拟进度、Offer、CoE 或律师批准。",
    projectHomeChatsHint:
      "您的项目对话列在左侧导航中。选择一条即可继续，或新建项目对话。",
    returnToProjectHome: "返回项目主页",
    projectStatusActive: "进行中",
    projectStatusClosed: "已关闭",
    projectCreatedOn: "创建于",
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
    projectWorkspace: {
      navTitle: "项目导航",
      navStages: "工作步骤",
      navConversations: "项目对话",
      stageApplications: "学校申请",
      stageAdmissions: "入学流程",
      stageStudent500: "学生签证 500 准备",
      stageDocuments: "项目文件中心",
      statusNotStarted: "尚未开始",
      statusInProgress: "进行中",
      statusNeedsInformation: "需要补充信息",
      statusBlocked: "当前不可用",
      statusUnknown: "状态未知",
      stepChatOpen: "打开本步骤对话",
      stepChatReopen: "返回本步骤对话",
      stepChatUnavailable: "步骤对话暂不可用（步骤绑定尚未启用）。",
      stepChatOpening: "正在打开步骤对话…",
      overviewTitle: "项目概览",
      overviewPreparation: "准备工作",
      overviewReadiness: "提交准备状态",
      overviewBlockers: "阻塞与限制",
      overviewNoBlockers: "未发现来自系统记录的阻塞项。",
      overviewNextAction: "建议的下一步",
      coverage: (readable, total) =>
        `可读取 ${readable} / ${total} 个工作区域；其余区域在此环境不可用。`,
      openItems: (count) => `系统记录中的相关条目：${count}`,
      needsAttention: (count) => `需要您处理：${count}`,
      progressUnavailable: "当前没有可读取的项目记录，因此不显示任何进度。",
      readinessDisabled: "此版本尚未启用提交能力，因此没有权威的提交准备状态。",
      readinessNotAssessed: "提交准备状态由具体流程自行判定，此处不做推断。",
      blockerDocumentsUnavailable:
        "项目文件中心尚未开放：生产文件存储与扫描尚未获批。",
      blockerApplicationsDisabled: "当前环境未开放学校申请功能。",
      blockerStudent500Disabled: "当前环境未开放学生签证 500 准备功能。",
      blockerStepChatsUnavailable: "步骤对话尚未启用；项目对话仍可正常使用。",
      blockerApplicationMissingInformation: "有学校申请草稿仍缺少必填信息。",
      blockerApplicationPackageStale:
        "有学校申请准备包的输入已变化，需要重新生成。",
      blockerStudent500MissingFacts: "有学生签证 500 申请仍缺少事实信息。",
      blockerStudent500HumanReview: "有学生签证 500 要求需要人工复核。",
      nextNeedsInformation: "先补充缺失信息。",
      nextInProgress: "继续未完成的工作。",
      nextNotStarted: "开始这一步骤。",
      nextDocuments: "查看项目文件中心。",
      nextNone: "当前没有可执行的下一步；请在左侧选择项目对话继续沟通。",
      refresh: "刷新",
      loading: "正在加载项目状态…",
      loadFailed: "无法加载项目状态。",
      materialsTitle: "本步骤材料",
      materialsDocuments: "相关文件与版本",
      materialsConversation: "本步骤对话",
      materialsNextAction: "可执行动作",
      materialsStepUnavailable: "此步骤的材料在此环境不可用。",
      materialsNoDocuments: "此步骤没有您可查看的文件。",
      materialsOpenDocuments: "打开文件中心",
      documentsCenterTitle: "项目文件中心",
      documentsCenterSubtitle:
        "仅显示您被授权查看的文件与版本；文件存在不等于可以读取内容或下载。",
      documentsFilterAll: "全部",
      documentsFilterSource: "来源",
      documentsFilterState: "状态",
      documentsSearch: "搜索文件",
      documentsSearchPlaceholder: "按类型或来源筛选",
      documentsSelected: "已选版本",
      documentsVersionHistory: "版本记录",
      documentsVersionLabel: (version) => `第 ${version} 版`,
      documentsOrigin: "来源",
      documentsProvenance: "来源信息",
      documentsNoSelection: "尚未选择文件版本。",
      documentsEmptyFilter: "没有符合筛选条件的文件。",
      documentsBackToStep: "返回相关步骤",
      documentsBackToPrevious: "返回上一视图",
      artifactsTitle: "生成的成果（仅引用）",
      artifactsSubtitle:
        "这些条目来自学校申请与学生签证 500 流程自身保存的版本，只显示身份、版本与状态；它们不是项目上传文件，也不在此处提供内容预览或下载。",
      artifactsEmpty: "此项目暂无可引用的生成成果。",
      artifactsUnavailable:
        "此项目的成果来源当前无法读取，因此这里不显示为空列表；请稍后重试。",
      artifactsTruncated: "仅显示最新的部分成果。",
      artifactsNoContent:
        "此处不复制成果正文，也不新增任何访问权限；请在所属流程中查看与操作。",
      artifactOpenOwner: "打开所属流程",
      artifactVersion: "版本",
      artifactStale: "输入已变化，需要重新生成",
      artifactKindSchoolApplicationPackage: "学校申请准备包",
      artifactKindStudent500GsDraft: "学生签证 500 陈述草稿",
      artifactKindStudent500Snapshot: "学生签证 500 准备快照",
      artifactKindSubmissionPackage: "提交包",
      artifactKindDisabled: "此环境尚未开放该类成果。",
      artifactKindUnsupported:
        "本里程碑不提供该类成果的汇总引用（仅支持按目标读取）。",
      artifactKindUnavailable: "暂时无法读取该类成果。",
      documentsUnavailable: "项目文件中心当前不可用。",
      sourceDirectUpload: "直接上传",
      sourceChatImport: "从对话导入",
      lifecycleActive: "有效",
      lifecycleWithdrawn: "已撤回",
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
    draftSectionOther: "其他草稿部分",
    draftViewNotice:
      "草稿正文保存时的语言为英文。下方为同一确定性模板的中文视图，未修改已保存的版本、内容哈希或来源记录；英文原文始终可以查看。",
    draftAssistedNotice:
      "此版本的草稿正文包含辅助生成内容，不一定是确定性模板，因此不做翻译：下方原样显示保存时的英文正文。",
    draftStoredOriginalLabel: "查看已保存的英文原文",
    draftOutstandingHeading: "仍需完成的检查项",
    draftOutstandingEmpty: "目前没有仍需完成的检查项。",
    draftUnknownRequirement: "其他检查项（该内部代码暂无本地化名称）",
    draftTemplate: {
      application_summary:
        "「{institution} — {course}」的临时准备草稿{intake_clause}。目标信息由客户提供，未经任何院校独立核实；准备包是否可用请以学校申请的准备包状态为准。",
      intakeClause: "，入学批次：{intake}",
      academic_background_satisfied:
        "本草案引用了经客户授权的学习事实记录。其数值必须由客户确认，院校要求的任何学术陈述都必须由授权文件支持。",
      academic_background_missing:
        "本流程目前没有可用的、经客户授权的学习事实，因此不撰写任何学术陈述。",
      english_proficiency:
        "本流程未审阅任何经独立核实的英语能力结果。请仅依据授权文件记录考试类型、日期与分数；此处不作任何推断。",
      financial_capacity:
        "本流程尚未认证任何资金证明。学费、生活费或押金数额必须来自授权文件或获批的院校声明；本草案不对任何金额或付款作出断言。",
      study_purpose:
        "请以客户自己的语言撰写学习目的。本部分仅为占位内容：此处不生成、不评估也不保证任何真实临时入境或签证论点。",
      provider_requirements_unverified:
        "教育目录记录匹配了所填院校/课程。目录记录并非院校的独立确认，本流程不对任何院校要求、截止日期或费用作出断言。",
      provider_requirements_missing:
        "没有目录记录匹配所填院校/课程。在客户或获授权审核人提供之前，院校要求仍属未知。",
      provider_requirements_unavailable:
        "本流程无法获得院校要求，因此不作任何断言。",
      next_steps: "以下检查项仍未完成：",
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
  student500: {
    title: "学生签证 500 申请准备",
    subtitle: "在受权项目中记录申请人情况，并查看带来源标注的初步要求清单。",
    notice:
      "本页面是初步筛查，不是签证资格判断、法律意见或提交服务。每条法律要求都需人工核实。",
    submissionNotice:
      "此记录不代表已可提交的签证申请。系统不会提交任何政府申请，也不会生成官方表格。",
    sourceNotice:
      "法源状态为“已声明、待核实”：本环境未获取权威法条原文，也未检索官方材料清单。",
    legalSourceHeading: "法律来源状态",
    legalSourceRevisionLabel: "来源清单版本",
    legalSourceVersionsLabel: "使用的登记编号",
    legalSourceAsOfLabel: "适用的参照日期",
    checklistHeading: "官方材料清单",
    checklistNote:
      "官方清单取决于申请人护照国家与就读院校，系统不会自动获取。本页任何内容都不是官方清单结果。",
    checklistOpen: "打开官方清单工具",
    loading: "正在加载…",
    empty: "此项目中还没有学生签证 500 准备记录。",
    create: "新建准备记录",
    createTitle: "新建学生签证 500 准备记录",
    createDescription:
      "只填写您实际知道的情况。未知项保持“未填写”，不会被当作“否”。",
    cancel: "取消",
    confirm: "保存",
    creating: "正在保存…",
    edit: "修改情况",
    save: "保存更改",
    saving: "正在保存…",
    archive: "归档",
    archiving: "正在归档…",
    refresh: "刷新",
    detailTitle: "准备记录",
    selectPrompt: "选择一条准备记录以查看详情。",
    revisionLabel: (revision: number) => `版本 r${revision}`,
    entryRouteLabel: "学习证据路径",
    entryRoute: {
      existing_coe: "已有 CoE（您自述）",
      no_school_application: "尚未开始学校申请",
      offer_only: "仅有 Offer，尚无 CoE",
      school_application_in_progress: "学校申请进行中",
    },
    applicationPlaceLabel: "申请地点",
    applicationPlace: {
      offshore: "澳大利亚境外",
      onshore: "澳大利亚境内",
      unknown: "未填写",
    },
    coeStatusLabel: "CoE 状态（您自述）",
    coeStatus: {
      reported_held: "自述已持有",
      reported_not_held: "自述尚未持有",
      unknown: "未填写",
    },
    asOfDateLabel: "意向申请日期或参照日期",
    asOfDateHint: "用于确定按哪个日期查看法律要求。",
    currentVisaLabel: "当前签证类别（可选）",
    currentVisaHint: "例如 500、485 或 bridging；系统不会据此判断资格。",
    historyDeclarationLabel: "签证历史声明",
    historyDeclaration: {
      not_declared: "未声明",
      declared_none: "声明不含相关记录",
      declared_some: "声明存在相关记录",
    },
    historyFlagsLabel: "相关记录类型",
    historyFlag: {
      prior_immigration_detention: "曾被移民拘留",
      prior_unlawful_period: "曾有非法居留期间",
      prior_visa_cancellation: "签证曾被取消",
      prior_visa_condition_breach: "曾被指违反签证条件",
      prior_visa_refusal: "签证曾被拒签",
    },
    ageBandLabel: "申请人年龄区间",
    ageBand: {
      adult: "18 岁及以上",
      under_18: "未满 18 岁",
      unknown: "未填写",
    },
    dependantsLabel: "随行家庭成员",
    dependants: { none: "无", one_or_more: "有一位或以上", unknown: "未填写" },
    englishLabel: "英语能力证明（您自述）",
    financialLabel: "资金能力证明（您自述）",
    oshcLabel: "海外学生健康保险（您自述）",
    evidenceStatus: {
      reported_held: "自述已具备",
      reported_not_held: "自述尚未具备",
      unknown: "未填写",
    },
    schoolApplicationLabel: "关联的学校申请",
    schoolApplicationHint: "只能选择您本人在此项目中已有的学校申请。",
    linkLoad: "加载学校申请",
    linkLoading: "正在加载…",
    linkEmpty: "本项目还没有学校申请。请先在“学校申请”中创建。",
    linkError: "无法加载学校申请列表。",
    linkNoneOption: "不关联",
    linkRequired: "选择“学校申请进行中”时，需要关联一条学校申请记录。",
    optionalHint: "留空表示未填写，不代表“没有”。",
    screeningHeading: "初步要求清单",
    preparationState: {
      screening_complete_pending_review:
        "筛查信息已填写，等待法律核实与人工审核",
      screening_incomplete: "筛查信息未完整",
    },
    countsLabel: "要求分布",
    countApplicable: "适用",
    countConditional: "视情况适用",
    countNotApplicable: "不适用",
    countUnknown: "待确认",
    nextActionHeading: "建议的下一步",
    nextAction: {
      await_authoritative_legal_source: "等待权威法源核实后再作判断。",
      connect_school_application: "连接本项目中的学校申请记录。",
      declare_applicant_age_band: "填写申请人年龄区间。",
      declare_dependants: "填写是否有随行家庭成员。",
      declare_english_evidence: "填写英语能力证明情况。",
      declare_financial_evidence: "填写资金能力证明情况。",
      declare_immigration_history: "声明签证历史（含拒签、取消等）。",
      declare_oshc_evidence: "填写海外学生健康保险情况。",
      declare_study_evidence_route:
        "选择学习证据路径（CoE、Offer 或学校申请）。",
      review_requirement_checklist: "查看要求清单与来源说明。",
      seek_human_review: "此情况建议由人工（律师）复核。",
      set_application_place: "填写申请地点（境内或境外）。",
      set_as_of_date: "填写意向申请日期或参照日期。",
      set_current_visa_subclass: "填写当前签证类别。",
    },
    missingHeading: "仍缺少的信息",
    missing: {
      applicant_age_band: "申请人年龄区间",
      application_place: "申请地点",
      as_of_date: "意向申请或参照日期",
      current_visa_subclass: "当前签证类别",
      dependants: "随行家庭成员",
      english_evidence: "英语能力证明",
      financial_evidence: "资金能力证明",
      immigration_history: "签证历史声明",
      linked_school_application: "关联的学校申请",
      oshc_evidence: "海外学生健康保险",
      study_evidence_route: "学习证据路径",
    },
    humanReviewHeading: "建议人工复核的原因",
    humanReview: {
      applicant_under_18: "申请人未满 18 岁",
      as_of_date_outside_declared_coverage:
        "该日期超出本环境声明的筛查覆盖范围",
      dependant_family_member_declared: "声明有随行家庭成员",
      legal_source_not_verified: "法律来源尚未核实",
      official_checklist_unavailable: "官方材料清单未能获取",
      onshore_application_context_incomplete: "境内申请情况不完整",
      prior_condition_breach_or_unlawful_period_declared:
        "声明涉及条件违反或非法居留",
      prior_refusal_or_cancellation_declared: "声明涉及拒签或签证取消",
      study_evidence_not_independently_verified: "学习证据未经独立核实",
    },
    requirementsHeading: "逐项要求",
    requirementLabels: {
      character_public_interest: "品格（公共利益标准）",
      english_language_evidence: "英语能力",
      family_unit_member_requirements: "家庭成员要求",
      financial_capacity_evidence: "资金能力",
      genuine_student: "真实学生要求",
      health_public_interest: "健康（公共利益标准）",
      offshore_application_entry: "境外申请入境路径",
      onshore_application_restrictions: "境内申请限制",
      overseas_student_health_cover: "海外学生健康保险",
      prior_immigration_history_disclosure: "签证历史披露",
      schedule1_valid_application: "有效申请（附表 1）",
      student_visa_conditions_acknowledgement: "学生签证条件",
      study_evidence_coe_or_alternative: "学习证据（CoE 或替代材料）",
      under_18_welfare_arrangements: "未满 18 岁福利安排",
    },
    requirementStatus: {
      applicable: "适用",
      conditional: "视情况适用",
      not_applicable: "不适用",
      unknown: "待确认",
    },
    sourceVerification: {
      declared_pending_verification: "已声明、待核实",
      insufficient_authority: "缺少权威法源",
      unavailable: "法源不可用",
      verified_official_corpus: "已核对权威语料",
    },
    evidencePreparation: {
      not_applicable: "无证据项",
      not_declared: "未填写",
      reported_held: "自述已具备",
      reported_not_held: "自述尚未具备",
    },
    sourcesHeading: "来源",
    sourceAuthority: {
      legal: "法律",
      legislation: "立法",
      legislative_instrument: "立法文书",
      official_guidance: "官方指南",
    },
    sourcePendingNotice: "来源仅为声明，未取得原文。",
    sourceOpen: "打开官方链接",
    linkedSchoolHeading: "关联的学校申请",
    linkedSchoolUnavailable: "关联记录当前不可用（可能已被撤销或无权查看）。",
    linkedSchoolStatus: (status: string) =>
      `学校申请状态：${status}（未经核实）`,
    disclosuresHeading: "重要说明",
    disclosure: {
      legal_sources_pending_verification: "法律来源尚未核实。",
      no_eligibility_determination: "系统未作出任何资格判断。",
      not_government_submission: "这不是政府申请，也不会被提交。",
      not_legal_advice: "这不是法律意见。",
      not_professionally_reviewed: "尚未经过律师或专业人士审核。",
      preliminary_screening_only: "仅为初步筛查。",
      study_evidence_not_independently_verified: "学习证据未经独立核实。",
    },
    errorAuthenticationRequired: "请先登录。",
    errorNotFound: "找不到该记录，或您无权查看。",
    errorStateChanged: "记录已在别处更新，请刷新后重试。",
    errorLimit: "此项目的准备记录数量已达上限。",
    errorInvalid: "请求内容无效，请检查填写项。",
    errorUnavailable: "学生签证 500 准备功能当前不可用。",
    errorRequestFailed: "操作未完成，请稍后重试。",
    archivedNotice: "此记录已归档，仅可查看，不能修改。",
    prepTitle: "申请准备",
    prepSubtitle:
      "把已授权的事实与就学证据整理成可保存的准备记录和初步 GS 草稿。",
    prepNotice:
      "本准备记录仅用于整理材料，不是法律意见，未经专业审阅，也不会提交给移民局。",
    prepSchoolHeading: "就学证据",
    prepSchoolNone: "尚未关联任何就学证据。",
    prepSchoolSelectRecord: "选择已授权的记录",
    prepSchoolEmpty: "本项目中无可选的已授权记录。",
    prepSchoolUnavailable: "无法加载就学证据列表。",
    prepSchoolNoLongerCurrent: "关联的就学证据已不再当前，请重新选择。",
    prepSchoolKind: {
      admission_case: "入学申请案件（M5.2）",
      customer_reported_coe: "客户申报的 CoE",
      none: "未关联",
      school_application: "学校申请（M5.1）",
    },
    prepFactsHeading: "已选用的已授权事实",
    prepFactsEmpty:
      "还没有选用任何事实。只有您授权用于 AI 处理的事实才会进入草稿。",
    prepFactsUnavailable: "当前无法读取事实授权状态，因此不会显示任何事实。",
    prepFactsSelect: "选用",
    prepFactsRemove: "移除",
    prepFactsAiGrantMissing: "未授权 AI 使用",
    prepFactsUnconfirmed: "尚未由客户确认",
    prepGapsHeading: "要求与证据缺口",
    prepGapsEmpty: "暂无已评估的要求。",
    prepConflictVisible: "存在尚未解决的矛盾事实，草稿不会自动选择任一方。",
    prepReviewRequired: "需要人工法律审阅",
    prepDraftHeading: "初步 GS 草稿",
    prepDraftEmpty: "还没有草稿。可以根据已授权事实生成一份结构化初稿。",
    prepDraftCreate: "生成初步草稿",
    prepDraftSave: "保存为新版本",
    prepDraftVersion: (version: number, origin: string) =>
      `版本 ${version}（${origin === "customer_edit" ? "客户编辑" : "系统结构化初稿"}）`,
    prepDraftStale: "此版本已过期，需要复核",
    prepDraftPlaceholder: "系统未提供该部分内容，也没有编造任何细节。",
    prepDraftEditHint:
      "您可以自由编辑文字。保存会创建新版本，旧版本永远不被覆盖。",
    prepSnapshotHeading: "申请准备摘要",
    prepSnapshotEmpty: "还没有保存的准备摘要版本。",
    prepSnapshotCreate: "保存准备摘要",
    prepSnapshotVersion: (version: number, revision: number) =>
      `摘要 v${version}（申请表修订 ${revision}）`,
    prepSnapshotStale: "摘要中有输入已变更",
    prepNextActionsHeading: "建议的下一步",
    prepLoading: "正在加载申请准备…",
    prepUnavailable: "申请准备当前不可用。",
    prepCoverage: {
      blocked_fact_conflicting: "事实存在冲突",
      blocked_fact_not_ai_authorized: "事实未授权 AI 使用",
      blocked_fact_revoked: "事实授权已撤销",
      blocked_fact_stale: "事实已过期",
      covered_by_authorized_fact: "已有已授权事实支持",
      covered_by_customer_report_only: "仅有客户申报",
      evidence_channel_unavailable: "证据通道不可用",
      missing_evidence: "缺少证据",
      not_applicable: "不适用",
      not_assessed: "尚未评估",
    },
    prepGap: {
      ai_use_not_authorized: "未授权 AI 使用",
      coe_not_reported: "未申报 CoE",
      conflict_unresolved: "矛盾尚未解决",
      document_trust_gate_closed: "文档可信度未开放",
      fact_authorization_revoked: "事实授权已撤销",
      fact_not_customer_confirmed: "事实尚未确认",
      fact_source_stale: "事实已过期",
      fact_source_superseded: "事实已被取代",
      independent_verification_unavailable: "尚无独立核验",
      legal_source_unverified: "法律依据尚未核验",
      no_authorized_fact_selected: "未选用已授权事实",
      project_documents_unavailable: "项目文档当前不可用",
      school_context_not_linked: "未关联就学证据",
      school_context_unavailable: "就学证据不可用",
    },
    prepAction: {
      await_authoritative_legal_source: "等待权威法律来源接入",
      confirm_fact_with_customer: "请客户确认事实",
      create_gs_draft: "生成初步 GS 草稿",
      edit_gs_draft: "编辑 GS 草稿",
      grant_ai_use_for_fact: "为事实授权 AI 使用",
      link_school_context: "关联就学证据",
      record_missing_information: "记录缺失信息",
      refresh_superseded_fact: "更新已被取代的事实",
      report_coe_or_offer: "申报 CoE 或 Offer",
      resolve_fact_conflict: "解决事实矛盾",
      review_evidence_gaps: "查看证据缺口",
      save_preparation_snapshot: "保存准备摘要",
      seek_human_review: "申请人工审阅",
      select_authorized_facts: "选用已授权事实",
    },
    prepStaleReason: {
      application_context_changed: "申请背景已变更",
      application_revision_advanced: "申请表修订已更新",
      fact_ai_grant_revoked: "事实的 AI 授权已撤销",
      fact_confirmation_withdrawn: "事实确认已撤回",
      fact_key_set_changed: "选用的事实集合已变更",
      fact_no_longer_visible: "事实已不可见",
      fact_source_stale: "事实已过期",
      fact_version_superseded: "事实版本已被取代",
      legal_source_currentness_unknown: "法律时效未知",
      school_context_changed: "就学证据已变更",
      school_context_unavailable: "就学证据不可用",
      school_outcome_superseded: "录取结果已被取代",
    },
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
  projectReview: {
    tab: "律师审核",
    heading: "精确版本审核",
    subtitle:
      "每个版本分开查看：AI 检查、您的确认与律师审核是三件互不替代的事。",
    notice:
      "此处只显示来源系统真实记录的状态。律师审核由独立的专业审核流程记录，本项目目前无法发起或展示其结论。",
    loading: "正在加载审核信息…",
    empty: "此项目目前没有可审核的精确版本记录。生成准备包或提交包后才会出现。",
    error: "无法加载审核信息，请稍后重试。",
    retry: "重新加载",
    refreshed: "审核信息已更新",
    selectedHeading: "所选版本",
    versionLabel: "版本",
    digestLabel: "内容摘要",
    digestUnknown: "未提供内容摘要",
    sourceLabel: "来源类型",
    kindLabel: {
      school_application_package: "学校申请准备包",
      student500_gs_draft: "学生 500 GS 草稿",
      student500_snapshot: "学生 500 准备快照",
      submission_package: "提交包",
    },
    dimensionsHeading: "三项独立状态",
    aiCheckLabel: "AI 检查",
    confirmationLabel: "您的确认",
    professionalLabel: "律师审核",
    integrityLabel: "完整性校验",
    aiCheck: {
      checked: "已检查",
      failed: "检查发现问题",
      not_checked: "尚未检查",
      unsupported: "本平台未提供 AI 检查",
      unavailable: "检查服务不可用",
    },
    confirmation: {
      confirmed: "已确认此版本",
      stale: "确认已不适用于此版本",
      not_confirmed: "尚未确认",
      not_applicable: "此类型无需确认",
      unavailable: "确认状态不可用",
    },
    professional: {
      not_requested: "未申请",
      requested: "已提交申请",
      in_review: "审核中",
      changes_requested: "需要修改",
      approved: "已批准（仅对此精确版本）",
      rejected: "未通过",
      invalidated: "已失效",
      unsupported: "此版本类型不支持律师审核",
      unavailable: "律师审核暂不可用",
    },
    integrity: {
      verified: "校验通过",
      unverified: "校验未通过",
      unknown: "无独立校验记录",
    },
    sourceState: {
      available: "已读取来源",
      empty: "没有符合条件的最新版本",
      partial: "部分来源未能读取",
      disabled: "来源功能未启用",
      restricted: "来源仅限受限账号",
      unavailable: "来源暂时无法读取",
    },
    reason: {
      ai_check_not_integrated: "本平台尚未接入按版本执行的 AI 检查。",
      ai_check_result_missing: "尚未对此版本执行检查。",
      confirmation_not_applicable_to_kind:
        "此类记录没有客户确认流程，确认只适用于提交包版本。",
      confirmation_not_current: "此前的确认不适用于当前版本内容。",
      professional_review_disabled: "专业审核功能在当前环境未启用。",
      professional_authority_unavailable:
        "尚未配置经批准的专业审核权限，因此任何人都无法发起或查看审核结论。",
      professional_credential_registry_unavailable:
        "尚未接入执业资格核验，无法确认审核人资格。",
      managed_target_provider_unavailable: "尚未接入可审核的目标版本来源。",
      review_authority_denied: "当前账号无权执行此审核操作。",
      review_target_kind_unsupported: "此版本类型不能绑定律师审核。",
      review_state_not_requestable: "当前状态下不能再次申请审核。",
      review_no_longer_current: "审核结论已不再适用于当前版本。",
      review_state_unavailable: "审核状态暂时无法确认。",
      integrity_not_applicable_to_kind: "此类型没有独立完整性校验。",
      package_integrity_unverified: "提交包完整性校验未通过。",
      submission_packages_disabled: "提交包功能未启用。",
      submission_packages_restricted: "提交包仅对已注册账号开放。",
      exact_version_stale: "此版本已被更新的版本取代，不能申请审核。",
      review_target_identity_incomplete:
        "此版本的审核目标标识不完整，无法绑定审核申请。",
      artifact_source_unavailable: "暂时无法读取本项目的版本来源。",
      artifact_source_restricted: "当前账号无法读取本项目的版本来源。",
      artifact_source_partial: "部分版本来源未能读取，列表可能不完整。",
      artifact_source_disabled: "本项目的版本来源功能未启用。",
      submission_source_unavailable: "暂时无法读取提交包来源。",
    },
    requestReview: "申请律师审核",
    requesting: "正在提交…",
    requestBlocked: "当前无法申请律师审核",
    requestRecorded: "审核申请已记录",
    requestHistoryNote:
      "本次申请的编号仅在本次会话中显示；本环境尚未提供按项目列出全部审核申请的接口。",
    reviewHistoryNote: "审核决定逐条追加，历史记录不会被覆盖。",
    staleNote: "此版本已被更新版本取代。",
    truncatedNote: "仅显示最近的部分版本。",
    approvalsAreExactVersion:
      "任何批准只对显示的这个精确版本有效，不会转移到新版本。",
    notLegalAdvice: "以上状态不是法律意见，也不代表院校或政府的任何决定。",
    openOwnerView: "前往相关步骤",
    professionalScope: "审核范围",
  },
  staffWorkspace: {
    heading: "律师工作台",
    subtitle: "只显示已授权给您的项目与审核事项。",
    notice:
      "项目成员身份或分配本身不授予客户文件、事实、AI 对话或提交包内容的访问权。需要单独的客户披露授权。",
    loading: "正在加载工作台…",
    empty: "当前没有已授权给您的项目或事项。",
    error: "无法加载律师工作台，请稍后重试。",
    retry: "重新加载",
    bucketsHeading: "待办分组",
    bucket: {
      assigned_projects: "已分配项目",
      needs_review: "需要您处理",
      awaiting_customer: "等待客户",
      reviewed: "已处理",
      blocked: "受限",
    },
    categoriesHeading: "事项类别",
    category: {
      project_assignments: "项目分配",
      professional_reviews: "专业审核",
      lawyer_requests: "律师请求",
      human_messages: "人工消息",
      managed_handoffs: "代办交接",
    },
    categoryState: {
      available: "可读取",
      disabled: "未启用",
      unavailable: "暂不可用",
      unsupported: "尚未接入",
      restricted: "受限",
    },
    entryLabel: {
      staffInvitationPending: "待您确认的项目分配邀请",
      staffAssignedProject: "已生效的项目分配",
    },
    openProject: "查看项目详情",
    detailHeading: "项目审核详情",
    shellHeading: "最小项目外壳",
    disclosureHeading: "内容授权",
    permittedHeading: "您可查看的字段",
    blockedHeading: "未授权的内容",
    reviewHeading: "审核事项",
    assignmentLabel: "分配编号",
    assignmentStatusLabel: "分配状态",
    acceptedLabel: "接受时间",
    lifecycleLabel: "项目状态",
    disclosureAllowed: "内容授权已通过",
    disclosureDenied: "内容授权未通过",
    noContentNotice:
      "未获得客户对具体资源的披露授权前，本页面不会返回任何受保护内容。",
    professionalNotice: "专业审核结论需要经批准的专业审核权限。",
    backToQueue: "返回工作台",
    reason: {
      staff_workspace_disabled: "律师工作台在当前环境未启用。",
      staff_workspace_schema_unavailable:
        "律师工作台所需的数据库结构尚未就绪。",
      staff_workspace_unavailable: "律师工作台暂时不可用。",
      staff_invitations_unavailable: "无法读取分配邀请。",
      category_not_integrated: "此类别尚未接入本工作台。",
      review_enumeration_unavailable: "尚未提供按项目列出审核申请的接口。",
      professional_authority_unavailable: "尚未配置经批准的专业审核权限。",
      professional_review_disabled: "专业审核功能未启用。",
      professional_credential_registry_unavailable: "尚未接入执业资格核验。",
      resource_source_unavailable: "客户内容的权威来源适配器尚未接入。",
      disclosure_unverified: "内容授权无法核实。",
      staff_role_required: "需要律师账号。",
      staff_assignment_missing: "没有有效的项目分配。",
      staff_assignment_inactive: "项目分配已失效。",
      staff_assignment_unavailable: "无法确认项目分配状态。",
      staff_project_shell_unavailable: "无法确认最小项目外壳。",
      project_not_active: "项目当前不可用。",
      project_not_found: "项目不存在或未分配给您。",
    },
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
    guestTemporaryProject:
      "Guest Projects belong to this temporary guest session only. Other guests cannot access them, and they cannot be transferred to a registered account yet.",
    projectDisabled:
      "Project creation is temporarily disabled by an administrator. Standard conversations are unaffected.",
    projectServiceUnavailable:
      "The Project service is temporarily unavailable. Your standard conversations are unaffected; please try again later.",
    schoolPreparationRestricted:
      "School application and admission preparation is currently open to registered personal accounts only. Guest and staff accounts can create their own Project but cannot use this preparation surface yet.",
    limitReached:
      "You have reached the maximum number of active Projects. Close a Project you no longer use, then create a new one.",
    projectHomeTitle: "Project home",
    projectHomeSubtitle:
      "Review this Project here, or open its school applications and admission preparation. Every state comes from the server.",
    projectHomeTab: "Project home",
    projectSchoolApplicationsTab: "School applications",
    projectSchoolAdmissionsTab: "Admissions workflow",
    projectStudent500Tab: "Student 500 visa",
    projectDocumentsTab: "Project documents",
    projectReviewTab: "Lawyer review",
    projectHomeNextSteps: "Next steps",
    projectHomeOpenApplications: "Review or create a school application draft.",
    projectHomeOpenAdmissions:
      "Review the admission workflow and its real state.",
    projectHomeApplicationsUnavailable:
      "School applications are not enabled in this environment.",
    projectHomeAdmissionsUnavailable:
      "The admissions workflow is not enabled in this environment.",
    projectHomeApplicationsRestricted:
      "School applications are currently open to registered personal accounts only.",
    projectHomeOpenStudent500:
      "Record the applicant circumstances and review a sourced preliminary requirement checklist.",
    projectHomeStudent500Unavailable:
      "Student 500 preparation is not enabled in this environment.",
    projectHomeStudent500Restricted:
      "Student 500 preparation is currently open to registered personal accounts only.",
    projectHomeAdmissionsRestricted:
      "The admissions workflow is currently open to registered personal accounts only.",
    projectHomeLimits:
      "Project documents, shared facts and staged progress are not available yet. No simulated progress, Offer, CoE or lawyer approval is shown here.",
    projectHomeChatsHint:
      "Your Project Chats are listed in the left navigation. Open one to continue, or create a new Project Chat.",
    returnToProjectHome: "Back to Project home",
    projectStatusActive: "Active",
    projectStatusClosed: "Closed",
    projectCreatedOn: "Created",
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
    projectWorkspace: {
      navTitle: "Project navigation",
      navStages: "Work steps",
      navConversations: "Project conversations",
      stageApplications: "School applications",
      stageAdmissions: "Admissions workflow",
      stageStudent500: "Student 500 preparation",
      stageDocuments: "Project document centre",
      statusNotStarted: "Not started",
      statusInProgress: "In progress",
      statusNeedsInformation: "Needs information",
      statusBlocked: "Unavailable here",
      statusUnknown: "State unknown",
      stepChatOpen: "Open this step's conversation",
      stepChatReopen: "Return to this step's conversation",
      stepChatUnavailable:
        "Step conversations are not available yet (the step binding is not enabled).",
      stepChatOpening: "Opening the step conversation…",
      overviewTitle: "Project overview",
      overviewPreparation: "Preparation",
      overviewReadiness: "Submission readiness",
      overviewBlockers: "Blockers and limits",
      overviewNoBlockers: "No blocker was reported by the system records.",
      overviewNextAction: "Suggested next step",
      coverage: (readable, total) =>
        `${readable} of ${total} work areas can be read; the rest are unavailable in this environment.`,
      openItems: (count) => `Records reported by the system: ${count}`,
      needsAttention: (count) => `Needs your input: ${count}`,
      progressUnavailable:
        "No Project records can be read, so no progress is shown.",
      readinessDisabled:
        "Submission is not enabled in this build, so no authoritative readiness state exists.",
      readinessNotAssessed:
        "Readiness is decided by the specific workflow; nothing is inferred here.",
      blockerDocumentsUnavailable:
        "The Project document centre is not open: production storage and scanning are not approved.",
      blockerApplicationsDisabled:
        "School applications are not enabled in this environment.",
      blockerStudent500Disabled:
        "Student 500 preparation is not enabled in this environment.",
      blockerStepChatsUnavailable:
        "Step conversations are not enabled yet; Project conversations still work.",
      blockerApplicationMissingInformation:
        "A school application draft is still missing required information.",
      blockerApplicationPackageStale:
        "A school application package no longer matches its inputs and must be regenerated.",
      blockerStudent500MissingFacts:
        "A Student 500 application is still missing fact information.",
      blockerStudent500HumanReview:
        "A Student 500 requirement needs human review.",
      nextNeedsInformation: "Supply the missing information first.",
      nextInProgress: "Continue the unfinished work.",
      nextNotStarted: "Start this step.",
      nextDocuments: "Open the Project document centre.",
      nextNone:
        "No next action is available. Use a Project conversation on the left to continue.",
      refresh: "Refresh",
      loading: "Loading Project state…",
      loadFailed: "The Project state could not be loaded.",
      materialsTitle: "Materials for this step",
      materialsDocuments: "Related documents and versions",
      materialsConversation: "This step's conversation",
      materialsNextAction: "Available action",
      materialsStepUnavailable:
        "Materials for this step are unavailable in this environment.",
      materialsNoDocuments: "You have no viewable documents for this step.",
      materialsOpenDocuments: "Open the document centre",
      documentsCenterTitle: "Project document centre",
      documentsCenterSubtitle:
        "Only documents and versions you are authorized to view are listed; a listed file is not permission to read or download its content.",
      documentsFilterAll: "All",
      documentsFilterSource: "Source",
      documentsFilterState: "State",
      documentsSearch: "Search documents",
      documentsSearchPlaceholder: "Filter by type or origin",
      documentsSelected: "Selected version",
      documentsVersionHistory: "Version history",
      documentsVersionLabel: (version) => `Version ${version}`,
      documentsOrigin: "Origin",
      documentsProvenance: "Provenance",
      documentsNoSelection: "No document version is selected.",
      documentsEmptyFilter: "No document matches the current filter.",
      documentsBackToStep: "Return to the related step",
      documentsBackToPrevious: "Return to the previous view",
      artifactsTitle: "Generated artifacts (references only)",
      artifactsSubtitle:
        "These entries come from the versions the school-application and Student 500 workflows already saved. They show identity, version and status only, are not project uploads, and no content preview or download is offered here.",
      artifactsEmpty: "No generated artifact is available to reference yet.",
      artifactsUnavailable:
        "This Project's artifact source could not be read, so this is not an empty list. Try again shortly.",
      artifactsTruncated: "Only the most recent artifacts are listed.",
      artifactsNoContent:
        "No artifact text is copied here and no access is added; open the owning workflow to view or act on it.",
      artifactOpenOwner: "Open the owning workflow",
      artifactVersion: "Version",
      artifactStale: "Inputs changed; regenerate required",
      artifactKindSchoolApplicationPackage: "School application package",
      artifactKindStudent500GsDraft: "Student 500 statement draft",
      artifactKindStudent500Snapshot: "Student 500 preparation snapshot",
      artifactKindSubmissionPackage: "Submission package",
      artifactKindDisabled:
        "This artifact type is not open in this environment.",
      artifactKindUnsupported:
        "This milestone does not aggregate this artifact type (per-target reads only).",
      artifactKindUnavailable: "This artifact type cannot be read right now.",
      documentsUnavailable:
        "The Project document centre is unavailable right now.",
      sourceDirectUpload: "Direct upload",
      sourceChatImport: "Imported from a conversation",
      lifecycleActive: "Active",
      lifecycleWithdrawn: "Withdrawn",
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
    draftSectionOther: "Other draft section",
    draftViewNotice:
      "Draft bodies are stored in English, which is the original language of the saved version.",
    draftAssistedNotice:
      "This draft version contains assisted prose, so it is shown exactly as stored in English and is not translated.",
    draftStoredOriginalLabel: "View the stored English text",
    draftOutstandingHeading: "Outstanding checks",
    draftOutstandingEmpty: "No outstanding checks are recorded.",
    draftUnknownRequirement:
      "Other check (no localized name exists for this internal code)",
    draftTemplate: {
      application_summary:
        "Provisional draft for {institution} — {course}{intake_clause}. Target details were provided by the customer and are not independently verified by any institution.",
      intakeClause: ", intake {intake}",
      academic_background_satisfied:
        "This draft references customer-authorised study fact records. Their values must be confirmed by the customer, and any academic claim required by the institution must be supported by an authorised document.",
      academic_background_missing:
        "No customer-authorised study facts are available to this workflow yet, so no academic claim is drafted.",
      english_proficiency:
        "No independently verified English proficiency result is reviewed in this workflow. Record the test type, date and score only from an authorised document; nothing is inferred here.",
      financial_capacity:
        "No financial evidence has been certified in this workflow. Any tuition, living-cost or deposit figure must come from an authorised document or an approved provider statement; this draft asserts no amount and no payment.",
      study_purpose:
        "Draft the customer's own study purpose in their words. This section is a placeholder: no genuine temporary entrant or visa argument is generated, assessed or guaranteed here.",
      provider_requirements_unverified:
        "An education catalogue record matched the recorded institution/course. Catalogue records are not independent institutional confirmation, and this workflow asserts no institutional requirement, deadline or fee.",
      provider_requirements_missing:
        "No catalogue record matched the recorded institution/course. Institutional requirements remain unknown until the customer or an authorised reviewer supplies them.",
      provider_requirements_unavailable:
        "Institutional requirements are unavailable in this workflow and are therefore left unasserted.",
      next_steps: "The following checks are still outstanding:",
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
  student500: {
    title: "Student 500 application preparation",
    subtitle:
      "Record the applicant's circumstances in an authorized Project and review a sourced preliminary requirement checklist.",
    notice:
      "This is a preliminary screening, not a visa eligibility decision, legal advice or a submission service. Every legal requirement still needs human verification.",
    submissionNotice:
      "This record is not a submittable visa application. The service submits nothing to government and generates no official form.",
    sourceNotice:
      "Legal sources are declared, not verified: no authoritative provision text was retrieved and no official document checklist was fetched in this environment.",
    legalSourceHeading: "Legal source status",
    legalSourceRevisionLabel: "Source manifest",
    legalSourceVersionsLabel: "Register identities in use",
    legalSourceAsOfLabel: "As-of date applied",
    checklistHeading: "Official document checklist",
    checklistNote:
      "The official checklist depends on the applicant's passport country and education provider and is not retrieved automatically. Nothing here is an official checklist result.",
    checklistOpen: "Open the official checklist tool",
    loading: "Loading…",
    empty: "This Project has no Student 500 preparation record yet.",
    create: "New preparation record",
    createTitle: "New Student 500 preparation record",
    createDescription:
      'Only enter what you actually know. Anything left blank stays "not declared" and is never read as a "no".',
    cancel: "Cancel",
    confirm: "Save",
    creating: "Saving…",
    edit: "Edit circumstances",
    save: "Save changes",
    saving: "Saving…",
    archive: "Archive",
    archiving: "Archiving…",
    refresh: "Refresh",
    detailTitle: "Preparation record",
    selectPrompt: "Select a preparation record to see its detail.",
    revisionLabel: (revision: number) => `revision r${revision}`,
    entryRouteLabel: "Study evidence route",
    entryRoute: {
      existing_coe: "CoE reported held (self-reported)",
      no_school_application: "No school application started",
      offer_only: "Offer only, no CoE yet",
      school_application_in_progress: "School application in progress",
    },
    applicationPlaceLabel: "Place of application",
    applicationPlace: {
      offshore: "Outside Australia",
      onshore: "In Australia",
      unknown: "Not declared",
    },
    coeStatusLabel: "CoE status (self-reported)",
    coeStatus: {
      reported_held: "Reported held",
      reported_not_held: "Reported not held",
      unknown: "Not declared",
    },
    asOfDateLabel: "Intended application date or reference date",
    asOfDateHint: "Used to decide which dated legal requirements apply.",
    currentVisaLabel: "Current visa subclass (optional)",
    currentVisaHint:
      "For example 500, 485 or bridging. The service does not infer eligibility from it.",
    historyDeclarationLabel: "Immigration history declaration",
    historyDeclaration: {
      not_declared: "Not declared",
      declared_none: "Declared none relevant",
      declared_some: "Declared some relevant",
    },
    historyFlagsLabel: "Relevant record types",
    historyFlag: {
      prior_immigration_detention: "Previous immigration detention",
      prior_unlawful_period: "Previous unlawful period",
      prior_visa_cancellation: "Previous visa cancellation",
      prior_visa_condition_breach: "Previous visa condition breach",
      prior_visa_refusal: "Previous visa refusal",
    },
    ageBandLabel: "Applicant age band",
    ageBand: {
      adult: "18 or over",
      under_18: "Under 18",
      unknown: "Not declared",
    },
    dependantsLabel: "Accompanying family members",
    dependants: {
      none: "None",
      one_or_more: "One or more",
      unknown: "Not declared",
    },
    englishLabel: "English evidence (self-reported)",
    financialLabel: "Financial capacity evidence (self-reported)",
    oshcLabel: "Overseas student health cover (self-reported)",
    evidenceStatus: {
      reported_held: "Reported held",
      reported_not_held: "Reported not held",
      unknown: "Not declared",
    },
    schoolApplicationLabel: "Linked school application",
    schoolApplicationHint:
      "You can only select a school application you own in this Project.",
    linkLoad: "Load school applications",
    linkLoading: "Loading…",
    linkEmpty:
      "This Project has no school applications yet. Create one in School applications first.",
    linkError: "Could not load the school application list.",
    linkNoneOption: "Not linked",
    linkRequired:
      "The in-progress route needs one linked school application record.",
    optionalHint: 'Blank means not declared, not "none".',
    screeningHeading: "Preliminary requirement checklist",
    preparationState: {
      screening_complete_pending_review:
        "Screening information complete, awaiting legal verification and human review",
      screening_incomplete: "Screening information incomplete",
    },
    countsLabel: "Requirement spread",
    countApplicable: "Applicable",
    countConditional: "Conditional",
    countNotApplicable: "Not applicable",
    countUnknown: "To be confirmed",
    nextActionHeading: "Suggested next step",
    nextAction: {
      await_authoritative_legal_source:
        "Wait for an authoritative source check before relying on this checklist.",
      connect_school_application:
        "Connect the school application record in this Project.",
      declare_applicant_age_band: "Enter the applicant's age band.",
      declare_dependants: "Enter whether family members accompany you.",
      declare_english_evidence: "Enter the English evidence position.",
      declare_financial_evidence: "Enter the financial evidence position.",
      declare_immigration_history:
        "Declare the immigration history, including refusals and cancellations.",
      declare_oshc_evidence: "Enter the health cover position.",
      declare_study_evidence_route:
        "Choose the study evidence route (CoE, offer or school application).",
      review_requirement_checklist:
        "Review the requirement checklist and its sources.",
      seek_human_review:
        "This situation should be reviewed by a person (lawyer).",
      set_application_place: "Enter the place of application.",
      set_as_of_date: "Enter the intended application or reference date.",
      set_current_visa_subclass: "Enter the current visa subclass.",
    },
    missingHeading: "Information still missing",
    missing: {
      applicant_age_band: "Applicant age band",
      application_place: "Place of application",
      as_of_date: "Intended application or reference date",
      current_visa_subclass: "Current visa subclass",
      dependants: "Accompanying family members",
      english_evidence: "English evidence",
      financial_evidence: "Financial capacity evidence",
      immigration_history: "Immigration history declaration",
      linked_school_application: "Linked school application",
      oshc_evidence: "Overseas student health cover",
      study_evidence_route: "Study evidence route",
    },
    humanReviewHeading: "Reasons for human review",
    humanReview: {
      applicant_under_18: "Applicant is under 18",
      as_of_date_outside_declared_coverage:
        "The date is outside the screening coverage declared in this environment",
      dependant_family_member_declared: "Accompanying family members declared",
      legal_source_not_verified: "Legal sources are not verified",
      official_checklist_unavailable:
        "The official document checklist is unavailable",
      onshore_application_context_incomplete: "Onshore context is incomplete",
      prior_condition_breach_or_unlawful_period_declared:
        "Condition breach or unlawful period declared",
      prior_refusal_or_cancellation_declared:
        "Refusal or cancellation declared",
      study_evidence_not_independently_verified:
        "Study evidence is not independently verified",
    },
    requirementsHeading: "Requirement by requirement",
    requirementLabels: {
      character_public_interest: "Character (public interest criteria)",
      english_language_evidence: "English language evidence",
      family_unit_member_requirements: "Family member requirements",
      financial_capacity_evidence: "Financial capacity",
      genuine_student: "Genuine Student requirement",
      health_public_interest: "Health (public interest criteria)",
      offshore_application_entry: "Offshore application entry",
      onshore_application_restrictions: "Onshore application restrictions",
      overseas_student_health_cover: "Overseas student health cover",
      prior_immigration_history_disclosure: "Immigration history disclosure",
      schedule1_valid_application: "Valid application (Schedule 1)",
      student_visa_conditions_acknowledgement: "Student visa conditions",
      study_evidence_coe_or_alternative: "Study evidence (CoE or alternative)",
      under_18_welfare_arrangements: "Under-18 welfare arrangements",
    },
    requirementStatus: {
      applicable: "Applicable",
      conditional: "Conditional",
      not_applicable: "Not applicable",
      unknown: "To be confirmed",
    },
    sourceVerification: {
      declared_pending_verification: "Declared, pending verification",
      insufficient_authority: "No legislative source identified",
      unavailable: "Source unavailable",
      verified_official_corpus: "Checked against the official corpus",
    },
    evidencePreparation: {
      not_applicable: "No evidence item",
      not_declared: "Not declared",
      reported_held: "Reported held",
      reported_not_held: "Reported not held",
    },
    sourcesHeading: "Sources",
    sourceAuthority: {
      legislation: "Legislation",
      legislative_instrument: "Legislative instrument",
      official_guidance: "Official guidance",
    },
    sourcePendingNotice: "Declared identity only; the text was not retrieved.",
    sourceOpen: "Open official link",
    linkedSchoolHeading: "Linked school application",
    linkedSchoolUnavailable:
      "The linked record is currently unavailable (revoked, removed, or not yours).",
    linkedSchoolStatus: (status: string) =>
      `School application status: ${status} (not verified)`,
    disclosuresHeading: "Important notices",
    disclosure: {
      legal_sources_pending_verification: "Legal sources are not verified yet.",
      no_eligibility_determination:
        "The service makes no eligibility decision.",
      not_government_submission:
        "This is not a government application and is never submitted.",
      not_legal_advice: "This is not legal advice.",
      not_professionally_reviewed:
        "No lawyer or other professional has reviewed it.",
      preliminary_screening_only: "Preliminary screening only.",
      study_evidence_not_independently_verified:
        "Study evidence is not independently verified.",
    },
    errorAuthenticationRequired: "Please sign in first.",
    errorNotFound: "That record was not found, or you may not view it.",
    errorStateChanged: "The record changed elsewhere. Refresh and try again.",
    errorLimit:
      "This Project already has the maximum number of preparation records.",
    errorInvalid: "The request was invalid. Check the entered values.",
    errorUnavailable: "Student 500 preparation is unavailable right now.",
    errorRequestFailed: "The action did not complete. Please retry.",
    archivedNotice: "This record is archived: view only, no further edits.",
    prepTitle: "Application preparation",
    prepSubtitle:
      "Organise authorized facts and study evidence into a saved preparation record and a preliminary GS draft.",
    prepNotice:
      "This preparation record is for your own organisation only. It is not legal advice, it is not professionally reviewed, and nothing here is submitted to the Department.",
    prepSchoolHeading: "Study evidence",
    prepSchoolNone: "No study evidence linked yet.",
    prepSchoolSelectRecord: "Select an authorized record",
    prepSchoolEmpty: "This Project has no selectable authorized record.",
    prepSchoolUnavailable: "Could not load the study evidence list.",
    prepSchoolNoLongerCurrent:
      "The linked study evidence is no longer current. Select it again.",
    prepSchoolKind: {
      admission_case: "Admission case (M5.2)",
      customer_reported_coe: "Customer-reported CoE",
      none: "Not linked",
      school_application: "School application (M5.1)",
    },
    prepFactsHeading: "Selected authorized facts",
    prepFactsEmpty:
      "No facts selected yet. Only facts you authorized for AI use can appear in a draft.",
    prepFactsUnavailable:
      "Fact authorization cannot be read right now, so no facts are shown.",
    prepFactsSelect: "Select",
    prepFactsRemove: "Remove",
    prepFactsAiGrantMissing: "AI use not authorized",
    prepFactsUnconfirmed: "Not customer-confirmed",
    prepGapsHeading: "Requirements and evidence gaps",
    prepGapsEmpty: "No requirements assessed yet.",
    prepConflictVisible:
      "Some facts conflict. The draft will not silently pick either version.",
    prepReviewRequired: "Human legal review required",
    prepDraftHeading: "Preliminary GS draft",
    prepDraftEmpty:
      "No draft yet. A structured starter can be built from authorized facts.",
    prepDraftCreate: "Create preliminary draft",
    prepDraftSave: "Save as new version",
    prepDraftVersion: (version: number, origin: string) =>
      `Version ${version} (${origin === "customer_edit" ? "your edit" : "structured starter"})`,
    prepDraftStale: "This version is stale and needs review",
    prepDraftPlaceholder:
      "The system supplied no content here and invented no details.",
    prepDraftEditHint:
      "Edit the text freely. Saving creates a new version; earlier versions are never overwritten.",
    prepSnapshotHeading: "Preparation summary",
    prepSnapshotEmpty: "No preparation summary saved yet.",
    prepSnapshotCreate: "Save preparation summary",
    prepSnapshotVersion: (version: number, revision: number) =>
      `Summary v${version} (application revision ${revision})`,
    prepSnapshotStale: "Some inputs changed after this summary",
    prepNextActionsHeading: "Suggested next steps",
    prepLoading: "Loading application preparation…",
    prepUnavailable: "Application preparation is unavailable right now.",
    prepCoverage: {
      blocked_fact_conflicting: "Facts conflict",
      blocked_fact_not_ai_authorized: "Fact not authorized for AI use",
      blocked_fact_revoked: "Fact authorization revoked",
      blocked_fact_stale: "Fact is stale",
      covered_by_authorized_fact: "Supported by authorized fact",
      covered_by_customer_report_only: "Customer report only",
      evidence_channel_unavailable: "Evidence channel unavailable",
      missing_evidence: "Evidence missing",
      not_applicable: "Not applicable",
      not_assessed: "Not assessed",
    },
    prepGap: {
      ai_use_not_authorized: "AI use not authorized",
      coe_not_reported: "CoE not reported",
      conflict_unresolved: "Conflict unresolved",
      document_trust_gate_closed: "Document trust gate closed",
      fact_authorization_revoked: "Fact authorization revoked",
      fact_not_customer_confirmed: "Fact not customer-confirmed",
      fact_source_stale: "Fact source stale",
      fact_source_superseded: "Fact source superseded",
      independent_verification_unavailable: "No independent verification",
      legal_source_unverified: "Legal source unverified",
      no_authorized_fact_selected: "No authorized fact selected",
      project_documents_unavailable: "Project documents unavailable",
      school_context_not_linked: "Study evidence not linked",
      school_context_unavailable: "Study evidence unavailable",
    },
    prepAction: {
      await_authoritative_legal_source:
        "Wait for an authoritative legal source",
      confirm_fact_with_customer: "Confirm the fact with the customer",
      create_gs_draft: "Create the preliminary GS draft",
      edit_gs_draft: "Edit the GS draft",
      grant_ai_use_for_fact: "Grant AI use for a fact",
      link_school_context: "Link study evidence",
      record_missing_information: "Record missing information",
      refresh_superseded_fact: "Refresh a superseded fact",
      report_coe_or_offer: "Report a CoE or Offer",
      resolve_fact_conflict: "Resolve a fact conflict",
      review_evidence_gaps: "Review the evidence gaps",
      save_preparation_snapshot: "Save a preparation summary",
      seek_human_review: "Request human review",
      select_authorized_facts: "Select authorized facts",
    },
    prepStaleReason: {
      application_context_changed: "Application context changed",
      application_revision_advanced: "Application revision advanced",
      fact_ai_grant_revoked: "Fact AI grant revoked",
      fact_confirmation_withdrawn: "Fact confirmation withdrawn",
      fact_key_set_changed: "Selected fact set changed",
      fact_no_longer_visible: "Fact no longer visible",
      fact_source_stale: "Fact source stale",
      fact_version_superseded: "Fact version superseded",
      legal_source_currentness_unknown: "Legal currentness unknown",
      school_context_changed: "Study evidence changed",
      school_context_unavailable: "Study evidence unavailable",
      school_outcome_superseded: "Admission outcome superseded",
    },
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
  projectReview: {
    tab: "Lawyer review",
    heading: "Exact-version review",
    subtitle:
      "Each version is shown separately: AI checking, your confirmation and lawyer review are three different things.",
    notice:
      "Only states recorded by the source systems are shown. Lawyer review is recorded by a separate professional-review workflow, and this environment cannot currently start one or display a decision.",
    loading: "Loading review information…",
    empty:
      "This Project has no reviewable exact version yet. Versions appear once a preparation or submission package exists.",
    error: "Review information could not be loaded. Try again later.",
    retry: "Reload",
    refreshed: "Review information refreshed",
    selectedHeading: "Selected version",
    versionLabel: "Version",
    digestLabel: "Content digest",
    digestUnknown: "No content digest provided",
    sourceLabel: "Source type",
    kindLabel: {
      school_application_package: "School application preparation package",
      student500_gs_draft: "Student 500 GS draft",
      student500_snapshot: "Student 500 preparation snapshot",
      submission_package: "Submission package",
    },
    dimensionsHeading: "Three independent states",
    aiCheckLabel: "AI check",
    confirmationLabel: "Your confirmation",
    professionalLabel: "Lawyer review",
    integrityLabel: "Integrity check",
    aiCheck: {
      checked: "Checked",
      failed: "Check found a problem",
      not_checked: "Not checked",
      unsupported: "No AI check is provided",
      unavailable: "Check service unavailable",
    },
    confirmation: {
      confirmed: "This version is confirmed",
      stale: "The confirmation no longer applies",
      not_confirmed: "Not confirmed",
      not_applicable: "Not applicable to this kind",
      unavailable: "Confirmation state unavailable",
    },
    professional: {
      not_requested: "Not requested",
      requested: "Requested",
      in_review: "In review",
      changes_requested: "Changes requested",
      approved: "Approved (this exact version only)",
      rejected: "Not approved",
      invalidated: "No longer valid",
      unsupported: "Lawyer review is not supported for this kind",
      unavailable: "Lawyer review unavailable",
    },
    integrity: {
      verified: "Verified",
      unverified: "Not verified",
      unknown: "No separate integrity record",
    },
    sourceState: {
      available: "Source read",
      empty: "No matching versions exist",
      partial: "Some sources could not be read",
      disabled: "Source capability not enabled",
      restricted: "Source is restricted",
      unavailable: "Source currently unreadable",
    },
    reason: {
      ai_check_not_integrated:
        "No per-version AI check is integrated in this platform.",
      ai_check_result_missing: "No check has run for this version.",
      confirmation_not_applicable_to_kind:
        "This record has no customer confirmation workflow; confirmation applies to submission package versions.",
      confirmation_not_current:
        "An earlier confirmation does not apply to this version's content.",
      professional_review_disabled:
        "Professional review is not enabled in this environment.",
      professional_authority_unavailable:
        "No approved professional-review authority is configured, so nobody can start or read a review decision.",
      professional_credential_registry_unavailable:
        "No practising-credential verification is integrated, so reviewer qualification cannot be established.",
      managed_target_provider_unavailable:
        "No authoritative reviewable target source is integrated.",
      review_authority_denied:
        "This account may not perform that review action.",
      review_target_kind_unsupported:
        "Lawyer review cannot be bound to this version kind.",
      review_state_not_requestable:
        "A review cannot be requested in this state.",
      review_no_longer_current:
        "The review decision no longer applies to the current version.",
      review_state_unavailable:
        "The review state cannot be confirmed right now.",
      integrity_not_applicable_to_kind:
        "This kind has no separate integrity check.",
      package_integrity_unverified:
        "The submission package integrity check did not pass.",
      submission_packages_disabled: "Submission packages are not enabled.",
      submission_packages_restricted:
        "Submission packages are available to registered accounts only.",
      exact_version_stale:
        "A newer version has superseded this one, so it cannot be sent for review.",
      review_target_identity_incomplete:
        "This version's review target identity is incomplete, so a review cannot be bound to it.",
      artifact_source_unavailable:
        "This Project's version source cannot be read right now.",
      artifact_source_restricted:
        "This account may not read this Project's version source.",
      artifact_source_partial:
        "Some version sources could not be read, so the list may be incomplete.",
      artifact_source_disabled:
        "The version source capability is not enabled for this Project.",
      submission_source_unavailable:
        "The submission package source cannot be read right now.",
    },
    requestReview: "Request lawyer review",
    requesting: "Submitting…",
    requestBlocked: "Lawyer review cannot be requested now",
    requestRecorded: "Review request recorded",
    requestHistoryNote:
      "This request's identifier is shown for this session only; no per-Project review listing API exists in this environment yet.",
    reviewHistoryNote:
      "Review decisions are appended, never overwritten, and history is retained.",
    staleNote: "A newer version has superseded this one.",
    truncatedNote: "Only the most recent versions are shown.",
    approvalsAreExactVersion:
      "Any approval applies only to the exact version shown and never transfers to a new version.",
    notLegalAdvice:
      "These states are not legal advice and do not represent any institution or government decision.",
    openOwnerView: "Open the owning step",
    professionalScope: "Review scope",
  },
  staffWorkspace: {
    heading: "Lawyer workspace",
    subtitle: "Only Projects and review items authorized for you are listed.",
    notice:
      "Project membership or an assignment does not grant access to customer documents, facts, AI chats or submission package content. Separate customer disclosure authorization is required.",
    loading: "Loading the workspace…",
    empty: "No Project or item is currently authorized for you.",
    error: "The lawyer workspace could not be loaded. Try again later.",
    retry: "Reload",
    bucketsHeading: "Queue groups",
    bucket: {
      assigned_projects: "Assigned Projects",
      needs_review: "Needs your action",
      awaiting_customer: "Waiting for the customer",
      reviewed: "Reviewed",
      blocked: "Restricted",
    },
    categoriesHeading: "Categories",
    category: {
      project_assignments: "Project assignments",
      professional_reviews: "Professional reviews",
      lawyer_requests: "Lawyer requests",
      human_messages: "Human messages",
      managed_handoffs: "Managed handoffs",
    },
    categoryState: {
      available: "Readable",
      disabled: "Not enabled",
      unavailable: "Unavailable",
      unsupported: "Not integrated",
      restricted: "Restricted",
    },
    entryLabel: {
      staffInvitationPending: "Project assignment invitation awaiting you",
      staffAssignedProject: "Active Project assignment",
    },
    openProject: "Open Project detail",
    detailHeading: "Project review detail",
    shellHeading: "Minimal Project shell",
    disclosureHeading: "Content authorization",
    permittedHeading: "Fields you may see",
    blockedHeading: "Withheld content",
    reviewHeading: "Review items",
    assignmentLabel: "Assignment",
    assignmentStatusLabel: "Assignment status",
    acceptedLabel: "Accepted",
    lifecycleLabel: "Project status",
    disclosureAllowed: "Content authorization allowed",
    disclosureDenied: "Content authorization denied",
    noContentNotice:
      "No protected content is returned on this page until the customer authorizes disclosure for that specific resource.",
    professionalNotice:
      "A professional review decision requires approved professional-review authority.",
    backToQueue: "Back to the workspace",
    reason: {
      staff_workspace_disabled:
        "The lawyer workspace is not enabled in this environment.",
      staff_workspace_schema_unavailable:
        "The database schema the lawyer workspace needs is not ready.",
      staff_workspace_unavailable: "The lawyer workspace is unavailable.",
      staff_invitations_unavailable:
        "Assignment invitations could not be read.",
      category_not_integrated: "This category is not integrated yet.",
      review_enumeration_unavailable:
        "No per-Project review listing API exists yet.",
      professional_authority_unavailable:
        "No approved professional-review authority is configured.",
      professional_review_disabled: "Professional review is not enabled.",
      professional_credential_registry_unavailable:
        "No practising-credential verification is integrated.",
      resource_source_unavailable:
        "No authoritative source adapter for customer content is integrated.",
      disclosure_unverified: "Content authorization could not be verified.",
      staff_role_required: "A lawyer account is required.",
      staff_assignment_missing: "No current Project assignment exists.",
      staff_assignment_inactive: "The Project assignment is no longer active.",
      staff_assignment_unavailable:
        "The Project assignment state could not be confirmed.",
      staff_project_shell_unavailable:
        "The minimal Project shell could not be confirmed.",
      project_not_active: "The Project is not currently active.",
      project_not_found:
        "The Project does not exist or is not assigned to you.",
    },
  },
};

export const WORKSPACE_COPY: Record<SiteLocale, WorkspaceCopy> = {
  "zh-CN": zh,
  en,
};

export function getWorkspaceCopy(locale: SiteLocale): WorkspaceCopy {
  return WORKSPACE_COPY[locale];
}

/**
 * Phase 13 M7 deep-preparation copy. Kept as a separate bilingual map so the M7
 * surface never implies progress, approval or submission readiness in any locale.
 */
export type Student500DeepCopy =
  (typeof student500DeepCopy)[keyof typeof student500DeepCopy];

const M7_EN = {
  accept: "Accept these edits",
  actionFailed: "That action could not be completed.",
  authorityUnavailable: "Professional editorial authority is not available.",
  complexity: {
    complex: "Complex case",
    standard: "Standard case",
    unresolved: "Unresolved",
  },
  consentCheckbox:
    "I agree to share this exact draft version and the selected facts with a professional reviewer, and I understand editorial feedback is not a legal sign-off.",
  consentDraftLabel: "Draft version and content",
  consentFactsLabel: "Facts the draft depends on",
  consentHeading: "Before you request review",
  consentNeedsDraft:
    "Save a draft version before requesting professional review.",
  consentNotShared:
    "Nothing else is shared: no other draft versions, no other facts, and no other Project member's information.",
  consentScopeIntro: "A reviewer would see only:",
  consentSharedWithReviewer:
    "The draft sections of this version, plus a short summary of the selected facts.",
  disclaimer:
    "Preparation only. This is not legal advice, not an assessment of eligibility and not a government checklist result.",
  editorial: "Professional editorial review",
  editorialAvailable: "A reviewer can be invited for this draft.",
  editorialUnavailable:
    "Professional editorial review is not available yet. Your request can be recorded, but no reviewer has verified credentials.",
  followUps: "Follow-up questions",
  needsConfirmation: "Statements needing your confirmation",
  noProposal: "No draft revision proposal yet.",
  noProposalAction: "This proposal has been decided.",
  notSignOff: "Editorial feedback is not a lawyer's legal sign-off.",
  notSubmissionReady:
    "Not submission ready. Formal submission stays unavailable in this stage.",
  propose: "Suggest the next draft revision",
  proposal: "Draft revision proposal",
  proposalRedacted: "some sections withheld",
  proposalStale: "built on an earlier draft version",
  proposalStatus: {
    accepted: "Accepted",
    proposed: "Awaiting your decision",
    rejected: "Rejected",
    superseded: "Superseded",
  },
  questionFallback: "Please provide this information.",
  questions: {},
  reject: "Reject",
  requestReview: "Request professional editorial review",
  reviewStale: "no longer applies",
  reviewStatus: {
    accepted_by_customer: "You accepted the feedback",
    authority_unavailable: "Review pending - no verified reviewer yet",
    feedback_provided: "Feedback received",
    rejected_by_customer: "You rejected the feedback",
    requested: "Review requested",
    superseded: "No longer applies",
  },
  savedNewVersion: "Saved as a new draft version.",
  scenario: {
    applicant_under_18: "Applicant under 18",
    dependants_or_family_unit: "Dependants or family unit",
    onshore_with_current_visa: "Applying in Australia",
    prior_immigration_adverse_history: "Prior immigration history recorded",
    prior_study_or_employment_change: "Study or employment change",
    standard_offshore_first_application: "First application from overseas",
    study_evidence_coe_reported: "CoE reported (unverified)",
    study_evidence_coe_verified: "CoE verified",
    study_evidence_offer_only: "Offer only, no CoE",
    unresolved_requires_human_review: "Needs human review",
  },
  taskReasons: {
    fact_conflict_visible: "Two recorded facts conflict.",
    gs_section_missing_information: "A draft section is incomplete.",
    professional_authority_unavailable:
      "Professional review cannot be completed yet.",
    requirement_applicability_unknown:
      "The rule in force for your date is unknown.",
    requirement_evidence_blocked: "Evidence you selected needs attention.",
    requirement_evidence_missing: "A preparation item has no evidence yet.",
    requirement_fact_not_authorized: "A fact is not authorized for AI use.",
    requirement_legal_source_unverified:
      "The official source is not fully verified.",
    school_context_missing: "No school offer or CoE is linked.",
  },
  tasks: "What needs attention",
  title: "Deep preparation",
  unavailable: "Deep preparation is unavailable right now.",
} as const;

const M7_ZH_HANS = {
  ...M7_EN,
  consentCheckbox:
    "我同意将这确切的草稿版本和草稿所依赖的事实分享给专业审核人，并了解编辑意见不构成法律签署。",
  consentDraftLabel: "草稿版本与内容",
  consentFactsLabel: "草稿所依赖的事实",
  consentHeading: "申请专业审核前请确认",
  consentNeedsDraft: "请先保存草稿版本，再申请专业审核。",
  consentNotShared:
    "其他内容不会分享：不分享其他草稿版本、其他事实，也不分享其他项目成员的信息。",
  consentScopeIntro: "审核人只会看到：",
  consentSharedWithReviewer: "该版本的草稿章节，以及所选事实的简短摘要。",
  accept: "接受这些修改",
  actionFailed: "该操作未能完成。",
  authorityUnavailable: "目前没有可用的专业编辑审核授权。",
  complexity: { complex: "复杂案件", standard: "标准案件", unresolved: "待定" },
  disclaimer:
    "这里只提供准备辅助，不构成法律意见，不是资格评估，也不是官方清单结果。",
  editorial: "专业编辑审核",
  editorialAvailable: "可以为这份草稿邀请审核人。",
  editorialUnavailable:
    "专业编辑审核暂不可用。可以记录你的请求，但还没有审核人的资格得到核实。",
  followUps: "后续问题",
  needsConfirmation: "需要你确认的表述",
  noProposal: "目前还没有草稿修改建议。",
  noProposalAction: "该建议已处理。",
  notSignOff: "编辑意见不是律师的法律签署。",
  notSubmissionReady: "尚未达到递交条件。本阶段的正式递交仍不可用。",
  propose: "生成下一版草稿建议",
  proposal: "草稿修改建议",
  proposalRedacted: "部分章节已隐藏",
  proposalStale: "基于较早的草稿版本",
  proposalStatus: {
    accepted: "已接受",
    proposed: "等待你的决定",
    rejected: "已拒绝",
    superseded: "已失效",
  },
  questionFallback: "请补充这项信息。",
  reject: "拒绝",
  requestReview: "申请专业编辑审核",
  reviewStale: "已不再适用",
  reviewStatus: {
    accepted_by_customer: "你已接受意见",
    authority_unavailable: "审核待处理 - 暂无已核实资格的审核人",
    feedback_provided: "已收到意见",
    rejected_by_customer: "你已拒绝意见",
    requested: "已申请审核",
    superseded: "已不再适用",
  },
  savedNewVersion: "已保存为新的草稿版本。",
  tasks: "需要注意的事项",
  title: "深度准备",
  unavailable: "深度准备暂不可用。",
} as const;

const M7_ZH_HANT = {
  ...M7_ZH_HANS,
  consentCheckbox:
    "我同意將這確切的草稿版本和草稿所依賴的事實分享給專業審核人，並了解編輯意見不構成法律簽署。",
  consentDraftLabel: "草稿版本與內容",
  consentFactsLabel: "草稿所依賴的事實",
  consentHeading: "申請專業審核前請確認",
  consentNeedsDraft: "請先儲存草稿版本，再申請專業審核。",
  consentNotShared:
    "其他內容不會分享：不分享其他草稿版本、其他事實，也不分享其他專案成員的資訊。",
  consentScopeIntro: "審核人只會看到：",
  consentSharedWithReviewer: "該版本的草稿章節，以及所選事實的簡短摘要。",
  accept: "接受這些修改",
  authorityUnavailable: "目前沒有可用的專業編輯審核授權。",
  complexity: { complex: "複雜案件", standard: "標準案件", unresolved: "待定" },
  disclaimer:
    "這裡只提供準備輔助，不構成法律意見，不是資格評估，也不是官方清單結果。",
  editorial: "專業編輯審核",
  editorialAvailable: "可以為這份草稿邀請審核人。",
  editorialUnavailable:
    "專業編輯審核暫不可用。可以記錄你的請求，但還沒有審核人的資格得到核實。",
  followUps: "後續問題",
  needsConfirmation: "需要你確認的表述",
  noProposal: "目前還沒有草稿修改建議。",
  notSignOff: "編輯意見不是律師的法律簽署。",
  notSubmissionReady: "尚未達到遞交條件。本階段的正式遞交仍不可用。",
  propose: "產生下一版草稿建議",
  proposal: "草稿修改建議",
  proposalRedacted: "部分章節已隱藏",
  proposalStale: "基於較早的草稿版本",
  proposalStatus: {
    accepted: "已接受",
    proposed: "等待你的決定",
    rejected: "已拒絕",
    superseded: "已失效",
  },
  questionFallback: "請補充這項資訊。",
  reject: "拒絕",
  requestReview: "申請專業編輯審核",
  reviewStale: "已不再適用",
  savedNewVersion: "已儲存為新的草稿版本。",
  tasks: "需要注意的事項",
  title: "深度準備",
  unavailable: "深度準備暫不可用。",
} as const;

export const student500DeepCopy = {
  en: M7_EN,
  "zh-Hans": M7_ZH_HANS,
  "zh-Hant": M7_ZH_HANT,
} as const;

/**
 * Phase 13 M8.1 - submission package copy (en / zh-Hans / zh-Hant).
 *
 * Chinese-first, and deliberately plain about what a package is not: it is not
 * legal advice, not professionally reviewed, and not submitted anywhere.
 */
const M8_EN = {
  build: "Build package version",
  buildHint:
    "Freezes the exact content you are reviewing into an immutable version.",
  confirm: "Confirm this version",
  confirmHint:
    "Your confirmation records what you reviewed. It is not a professional or legal approval.",
  confirmedAt: "Confirmed",
  confirmDeclarations:
    "I confirm my own declarations and the facts shown are true and complete to the best of my knowledge.",
  confirmContent:
    "I have reviewed this exact package version and the items listed above.",
  current: "Current",
  currentPackage: "Current package version",
  disclosures: "What this package is not",
  disclosure: {
    customer_confirmed_package_not_legal_advice:
      "A customer confirmation is not legal advice.",
    legal_coverage_partial_and_unverified:
      "Legal coverage is partial and not independently verified.",
    not_professionally_reviewed: "No qualified professional has reviewed it.",
    not_submitted_to_any_authority:
      "Nothing has been submitted to any school or government agency.",
    customer_reported_evidence_unverified:
      "Customer-reported evidence has not been verified.",
  } as Record<string, string>,
  empty:
    "No package version yet. Build one to review and confirm the exact content.",
  history: "Version history",
  indicator: "What still needs attention",
  indicatorKind: {
    conflicted: "Conflict",
    missing: "Missing",
    unknown: "Unknown",
    unverified: "Unverified",
  } as Record<string, string>,
  integrity: "Integrity verified",
  integrityFailed: "Integrity could not be verified",
  loading: "Loading submission package...",
  nextAction: {
    build_package: "Build the first package version.",
    confirm_package: "Review and confirm this version.",
    rebuild_package: "Something changed. Build a new version to review.",
    review_package:
      "You have confirmed this version. Nothing else is required here yet.",
    unavailable: "This application cannot be packaged right now.",
  } as Record<string, string>,
  review: "What you are reviewing",
  reviewPinnedDraft: (version: number) => `Exact GS draft version ${version}`,
  reviewMissingInfo: "Needs your input",
  reviewUnavailable:
    "The exact content of this version cannot be shown to you right now, so it cannot be confirmed.",
  reason: {
    access_revoked: "Your access to this Project changed.",
    confirmation_not_finalized: "This confirmation did not finish validating.",
    application_revision_changed: "The application changed since this version.",
    fact_not_visible: "A source fact is no longer shared with you.",
    fact_reference_changed: "A source fact changed.",
    gs_draft_changed: "The GS draft changed since this version.",
    gs_draft_unavailable: "The GS draft is no longer fully visible.",
    legal_source_revision_changed: "The legal source revision changed.",
    preparation_snapshot_changed: "The preparation summary changed.",
    project_closed: "This Project is closed.",
    school_application_changed: "The school application changed.",
    school_package_changed: "The prepared school package changed.",
    source_unavailable: "A source is temporarily unavailable.",
    target_archived: "This application is archived.",
  } as Record<string, string>,
  redacted: "Some source details are hidden because access was withdrawn.",
  stale: "No longer current",
  statement: "Customer statements",
  submission: "Not submission ready",
  title: "Submission package",
  unavailable: "Submission packages are not available here.",
  version: (version: number) => `Version ${version}`,
};

const M8_ZH_HANS: typeof M8_EN = {
  build: "生成申请材料版本",
  buildHint: "将你正在查看的内容固定为一个不可更改的版本。",
  confirm: "确认此版本",
  confirmHint: "你的确认只记录你查看过的内容，不代表专业或法律批准。",
  confirmedAt: "确认时间",
  confirmDeclarations: "我确认以上由我本人提供的声明与事实真实、完整。",
  confirmContent: "我已查看此确切版本以及以上列出的内容。",
  current: "当前有效",
  currentPackage: "当前材料版本",
  disclosures: "此版本不代表的含义",
  disclosure: {
    customer_confirmed_package_not_legal_advice: "客户确认不构成法律意见。",
    legal_coverage_partial_and_unverified:
      "法律依据覆盖不完整，且未经独立核实。",
    not_professionally_reviewed: "没有任何合资格专业人士审阅过。",
    not_submitted_to_any_authority: "尚未向任何学校或政府机构提交。",
    customer_reported_evidence_unverified: "客户申报的证据尚未核实。",
  } as Record<string, string>,
  empty: "尚未生成材料版本。请先生成一个版本，以便查看并确认确切内容。",
  history: "版本记录",
  indicator: "仍需处理的事项",
  indicatorKind: {
    conflicted: "存在冲突",
    missing: "缺少",
    unknown: "未知",
    unverified: "未核实",
  } as Record<string, string>,
  integrity: "完整性已校验",
  integrityFailed: "无法校验完整性",
  loading: "正在加载申请材料版本...",
  nextAction: {
    build_package: "请生成第一个材料版本。",
    confirm_package: "请查看并确认此版本。",
    rebuild_package: "相关内容已变更，请重新生成版本后再查看。",
    review_package: "你已确认此版本，暂时无需其他操作。",
    unavailable: "此申请目前无法生成材料版本。",
  } as Record<string, string>,
  review: "你正在查看的内容",
  reviewPinnedDraft: (version: number) => `确切的 GS 草稿版本 ${version}`,
  reviewMissingInfo: "需要你补充",
  reviewUnavailable: "此版本的确切内容目前无法展示给你，因此不能确认。",
  reason: {
    access_revoked: "你对本项目的访问权限已变更。",
    confirmation_not_finalized: "此确认未完成校验。",
    application_revision_changed: "申请内容在此版本之后已变更。",
    fact_not_visible: "某项来源事实已不再共享给你。",
    fact_reference_changed: "某项来源事实已变更。",
    gs_draft_changed: "GS 草稿在此版本之后已变更。",
    gs_draft_unavailable: "GS 草稿已不能完整查看。",
    legal_source_revision_changed: "法律依据版本已变更。",
    preparation_snapshot_changed: "准备摘要已变更。",
    project_closed: "本项目已关闭。",
    school_application_changed: "学校申请内容已变更。",
    school_package_changed: "已准备的学校材料包已变更。",
    source_unavailable: "某项来源暂时不可用。",
    target_archived: "此申请已归档。",
  } as Record<string, string>,
  redacted: "部分来源信息因权限撤回而已隐藏。",
  stale: "已不再有效",
  statement: "客户声明",
  submission: "尚不可提交",
  title: "申请材料版本",
  unavailable: "此处暂不可使用申请材料版本功能。",
  version: (version: number) => `版本 ${version}`,
};

const M8_ZH_HANT: typeof M8_EN = {
  build: "產生申請材料版本",
  buildHint: "將你正在查看的內容固定為一個不可更改的版本。",
  confirm: "確認此版本",
  confirmHint: "你的確認只記錄你查看過的內容，不代表專業或法律批准。",
  confirmedAt: "確認時間",
  confirmDeclarations: "我確認以上由我本人提供的聲明與事實真實、完整。",
  confirmContent: "我已查看此確切版本以及以上列出的內容。",
  current: "目前有效",
  currentPackage: "目前材料版本",
  disclosures: "此版本不代表的意思",
  disclosure: {
    customer_confirmed_package_not_legal_advice: "客戶確認不構成法律意見。",
    legal_coverage_partial_and_unverified:
      "法律依據覆蓋不完整，且未經獨立核實。",
    not_professionally_reviewed: "沒有任何合資格專業人士審閱過。",
    not_submitted_to_any_authority: "尚未向任何學校或政府機構提交。",
    customer_reported_evidence_unverified: "客戶申報的證據尚未核實。",
  } as Record<string, string>,
  empty: "尚未產生材料版本。請先產生一個版本，以便查看並確認確切內容。",
  history: "版本記錄",
  indicator: "仍需處理的事項",
  indicatorKind: {
    conflicted: "存在衝突",
    missing: "缺少",
    unknown: "未知",
    unverified: "未核實",
  } as Record<string, string>,
  integrity: "完整性已校驗",
  integrityFailed: "無法校驗完整性",
  loading: "正在載入申請材料版本...",
  nextAction: {
    build_package: "請產生第一個材料版本。",
    confirm_package: "請查看並確認此版本。",
    rebuild_package: "相關內容已變更，請重新產生版本後再查看。",
    review_package: "你已確認此版本，暫時無需其他操作。",
    unavailable: "此申請目前無法產生材料版本。",
  } as Record<string, string>,
  review: "你正在查看的內容",
  reviewPinnedDraft: (version: number) => `確切的 GS 草稿版本 ${version}`,
  reviewMissingInfo: "需要你補充",
  reviewUnavailable: "此版本的確切內容目前無法展示給你，因此不能確認。",
  reason: {
    access_revoked: "你對本專案的存取權限已變更。",
    confirmation_not_finalized: "此確認未完成校驗。",
    application_revision_changed: "申請內容在此版本之後已變更。",
    fact_not_visible: "某項來源事實已不再分享給你。",
    fact_reference_changed: "某項來源事實已變更。",
    gs_draft_changed: "GS 草稿在此版本之後已變更。",
    gs_draft_unavailable: "GS 草稿已不能完整查看。",
    legal_source_revision_changed: "法律依據版本已變更。",
    preparation_snapshot_changed: "準備摘要已變更。",
    project_closed: "本專案已關閉。",
    school_application_changed: "學校申請內容已變更。",
    school_package_changed: "已準備的學校材料包已變更。",
    source_unavailable: "某項來源暫時無法使用。",
    target_archived: "此申請已歸檔。",
  } as Record<string, string>,
  redacted: "部分來源資訊因權限撤回而已隱藏。",
  stale: "已不再有效",
  statement: "客戶聲明",
  submission: "尚不可提交",
  title: "申請材料版本",
  unavailable: "此處暫不可使用申請材料版本功能。",
  version: (version: number) => `版本 ${version}`,
};

export const submissionPackageCopy = {
  en: M8_EN,
  "zh-Hans": M8_ZH_HANS,
  "zh-Hant": M8_ZH_HANT,
} as const;

/**
 * Phase 13 M8.2 - submission authorization, managed handoff and external records.
 *
 * The wording is deliberately narrow: nothing here says approved, eligible, verified,
 * successful or submitted unless the record itself carries the provenance such a claim
 * requires.
 */
const M8_2_EN = {
  authorizeHint:
    "This records who may act on the exact version above. It is not a decision on your application.",
  authorizeManaged: "Authorize managed service",
  authorizeSelf: "Authorize self-service",
  authorizedAt: "Authorized",
  cancelHandoff: "Cancel handoff request",
  current: "Current",
  disclosures: "Before you authorize",
  disclosure: {
    customer_performs_external_submission_personally:
      "You will complete and lodge the external application yourself.",
    customer_responsible_for_accuracy_and_deadlines:
      "You remain responsible for the accuracy of the content and for every deadline.",
    engagement_terms_and_payment_apply:
      "The engagement terms, fees and payment conditions in your service agreement apply.",
    external_evidence_recorded_with_provenance:
      "Any external evidence is stored with the source that reported it.",
    external_outcomes_remain_unverified:
      "Any outcome you or we record stays unverified unless a trusted external source confirms it.",
    named_professional_performs_external_submission:
      "One named, assigned professional acts on this package on your behalf.",
    no_legal_correctness_asserted:
      "Nothing here confirms that every legal requirement is met.",
    no_outcome_guaranteed:
      "No outcome is guaranteed: no school or government decision is promised.",
    no_professional_review_included:
      "No qualified professional reviews this package in self-service.",
    no_submission_before_handoff_acceptance:
      "Nothing is submitted until an authorized professional accepts the handoff.",
    platform_does_not_submit_or_receive_receipts:
      "This platform does not lodge the application and does not receive official receipts for you.",
    professional_review_of_this_exact_version_required:
      "A professional review of this exact version must be current.",
  } as Record<string, string>,
  error: "The authorization could not be loaded.",
  externalRecords: "External action you reported",
  externalUnverifiedNote:
    "Customer-reported and staff-recorded entries are unverified. They are not official receipts.",
  handoff: "Human handoff",
  handoffEligible: "This package currently meets the handoff conditions.",
  handoffHint:
    "A handoff asks an assigned professional to act on this exact version.",
  handoffNotEligible:
    "This package does not currently meet the handoff conditions.",
  handoffStatus: {
    accepted: "Accepted by a professional",
    cancelled: "Cancelled",
    declined: "Declined",
    requested: "Requested",
    superseded: "Superseded",
  } as Record<string, string>,
  intro:
    "Choose who acts on this exact package version: you, or a professional acting for you.",
  loading: "Loading authorization...",
  modeManaged: "Managed service",
  modeManagedHelp:
    "Requires a current engagement, agreement, payment condition, disclosure, professional review and credential.",
  modeSelf: "Self-service",
  modeSelfHelp:
    "You review the package and lodge the external application yourself.",
  modeUnavailable: "Not available",
  nextAction: {
    authorize_managed_service: "Authorize managed service to continue.",
    authorize_self_service: "Authorize self-service to continue.",
    await_handoff: "Waiting for the professional to accept the handoff.",
    await_professional_submission:
      "A professional has accepted. Submission happens outside this platform.",
    build_package: "Build a package version first.",
    confirm_package: "Confirm the current package version first.",
    none: "Nothing else is required here.",
    rebuild_package: "Something changed. Build and confirm a new version.",
    record_external_action:
      "When you lodge the application yourself, record it here as unverified.",
    request_handoff: "Request a handoff to an assigned professional.",
    unavailable: "This package cannot be authorized right now.",
  } as Record<string, string>,
  noExternalRecords: "No externally reported action yet.",
  noPackage: "No package version to authorize yet.",
  notCurrent: "No longer current",
  provenance: {
    customer_reported: "Reported by you",
    document_backed_unverified: "Document attached, not verified",
    provider_verified: "Verified by an external source",
    staff_attested: "Recorded by staff",
  } as Record<string, string>,
  reason: {
    authorization_superseded: "A newer decision replaced this one.",
    confirmation_missing: "A required confirmation is missing.",
    confirmation_not_current: "A confirmation is no longer current.",
    confirmation_not_finalized: "A confirmation did not finish validating.",
    confirmation_policy_unknown:
      "The disclosure wording changed. Confirm again.",
    managed_readiness_not_ready:
      "Your managed service conditions are not met yet.",
    managed_readiness_unknown:
      "Managed service conditions cannot be confirmed.",
    package_freshness_lost: "The application changed since this version.",
    package_integrity_unverified: "This version failed its integrity check.",
    package_not_current: "A newer package version is current.",
    professional_authority_denied: "Professional authority was withdrawn.",
    professional_credential_unverified:
      "The professional's credential is not verified.",
    professional_review_not_approved:
      "A current professional review is missing.",
    source_unavailable: "A source is temporarily unavailable.",
  } as Record<string, string>,
  recordExternal: "Record that I lodged it myself",
  requestHandoff: "Request handoff",
  state: "Authorization",
  status: {
    effective: "Effective for this version",
    ineffective: "Not effective",
    unknown: "Cannot be confirmed",
  } as Record<string, string>,
  submissionState: {
    not_submitted: "Nothing recorded as lodged",
    reported_unverified: "Reported as lodged, unverified",
    verified: "Verified as lodged",
  } as Record<string, string>,
  title: "Who acts on this package",
  unavailable: "Submission authorization is not available here.",
};

const M8_2_ZH_HANS: typeof M8_2_EN = {
  authorizeHint:
    "此操作记录谁可以处理以上确切版本，并不构成对你申请的审批结果。",
  authorizeManaged: "授权托管服务",
  authorizeSelf: "授权自助服务",
  authorizedAt: "授权时间",
  cancelHandoff: "取消交接请求",
  current: "当前有效",
  disclosures: "授权前请确认",
  disclosure: {
    customer_performs_external_submission_personally:
      "外部申请将由你本人填写并提交。",
    customer_responsible_for_accuracy_and_deadlines:
      "你仍需对内容准确性以及所有截止日期负责。",
    engagement_terms_and_payment_apply:
      "你的服务协议中的服务条款、费用与付款条件适用。",
    external_evidence_recorded_with_provenance:
      "任何外部证据都会连同其上报来源一起保存。",
    external_outcomes_remain_unverified:
      "你或我们记录的任何结果，未经可信外部来源确认前都保持未核实状态。",
    named_professional_performs_external_submission:
      "由一位具名且已指派给本项目的专业人士代表你处理此材料。",
    no_legal_correctness_asserted: "此处不确认所有法律要求均已满足。",
    no_outcome_guaranteed: "不保证任何结果：不承诺学校或政府的决定。",
    no_professional_review_included: "自助服务不包含合资格专业人士审阅。",
    no_submission_before_handoff_acceptance:
      "在获授权的专业人士接受交接之前，不会提交任何内容。",
    platform_does_not_submit_or_receive_receipts:
      "本平台不代为提交申请，也不代你接收官方回执。",
    professional_review_of_this_exact_version_required:
      "针对此确切版本的专业审阅必须仍然有效。",
  } as Record<string, string>,
  error: "无法加载授权信息。",
  externalRecords: "你上报的外部操作",
  externalUnverifiedNote:
    "客户上报与工作人员记录的条目均为未核实状态，不属于官方回执。",
  handoff: "人工交接",
  handoffEligible: "此材料当前满足交接条件。",
  handoffHint: "交接即请已指派的专业人士处理此确切版本。",
  handoffNotEligible: "此材料当前不满足交接条件。",
  handoffStatus: {
    accepted: "专业人士已接受",
    cancelled: "已取消",
    declined: "已拒绝",
    requested: "已请求",
    superseded: "已被取代",
  } as Record<string, string>,
  intro: "请选择由谁处理此确切版本：你本人，或代表你的专业人士。",
  loading: "正在加载授权信息...",
  modeManaged: "托管服务",
  modeManagedHelp:
    "需要当前有效的服务关系、协议、付款条件、资源披露、专业审阅与专业资格。",
  modeSelf: "自助服务",
  modeSelfHelp: "你自行查看材料并提交外部申请。",
  modeUnavailable: "暂不可用",
  nextAction: {
    authorize_managed_service: "请授权托管服务以继续。",
    authorize_self_service: "请授权自助服务以继续。",
    await_handoff: "正在等待专业人士接受交接。",
    await_professional_submission: "专业人士已接受，提交将在此平台之外完成。",
    build_package: "请先生成材料版本。",
    confirm_package: "请先确认当前材料版本。",
    none: "此步骤无需其他操作。",
    rebuild_package: "内容已变更，请生成并确认新版本。",
    record_external_action: "当你本人提交后，可在此记录为未核实。",
    request_handoff: "请向已指派的专业人士请求交接。",
    unavailable: "此材料目前无法授权。",
  } as Record<string, string>,
  noExternalRecords: "尚无外部操作记录。",
  noPackage: "尚无可授权的材料版本。",
  notCurrent: "已不再有效",
  provenance: {
    customer_reported: "由你上报",
    document_backed_unverified: "附有文件，尚未核实",
    provider_verified: "已由外部来源核实",
    staff_attested: "由工作人员记录",
  } as Record<string, string>,
  reason: {
    authorization_superseded: "已被更新的决定取代。",
    confirmation_missing: "缺少必需的确认。",
    confirmation_not_current: "某项确认已不再有效。",
    confirmation_not_finalized: "某项确认未完成校验。",
    confirmation_policy_unknown: "披露条款已更新，请重新确认。",
    managed_readiness_not_ready: "托管服务条件尚未满足。",
    managed_readiness_unknown: "无法确认托管服务条件。",
    package_freshness_lost: "此版本之后申请内容已变更。",
    package_integrity_unverified: "此版本未通过完整性校验。",
    package_not_current: "已有更新的材料版本。",
    professional_authority_denied: "专业授权已被撤回。",
    professional_credential_unverified: "专业人士的资格尚未核实。",
    professional_review_not_approved: "缺少有效的专业审阅。",
    source_unavailable: "某来源暂时不可用。",
  } as Record<string, string>,
  recordExternal: "记录我本人已提交",
  requestHandoff: "请求交接",
  state: "授权状态",
  status: {
    effective: "对此版本有效",
    ineffective: "无效",
    unknown: "无法确认",
  } as Record<string, string>,
  submissionState: {
    not_submitted: "未记录为已提交",
    reported_unverified: "已上报为提交，未核实",
    verified: "已核实为已提交",
  } as Record<string, string>,
  title: "由谁处理此材料",
  unavailable: "此处暂不可使用提交授权功能。",
};

const M8_2_ZH_HANT: typeof M8_2_EN = {
  authorizeHint:
    "此操作記錄誰可以處理以上確切版本，並不構成對你申請的審批結果。",
  authorizeManaged: "授權託管服務",
  authorizeSelf: "授權自助服務",
  authorizedAt: "授權時間",
  cancelHandoff: "取消交接請求",
  current: "目前有效",
  disclosures: "授權前請確認",
  disclosure: {
    customer_performs_external_submission_personally:
      "外部申請將由你本人填寫並提交。",
    customer_responsible_for_accuracy_and_deadlines:
      "你仍需對內容準確性以及所有截止日期負責。",
    engagement_terms_and_payment_apply:
      "你的服務協議中的服務條款、費用與付款條件適用。",
    external_evidence_recorded_with_provenance:
      "任何外部證據都會連同其上報來源一起保存。",
    external_outcomes_remain_unverified:
      "你或我們記錄的任何結果，未經可信外部來源確認前都保持未核實狀態。",
    named_professional_performs_external_submission:
      "由一位具名且已指派給本專案的專業人士代表你處理此材料。",
    no_legal_correctness_asserted: "此處不確認所有法律要求均已滿足。",
    no_outcome_guaranteed: "不保證任何結果：不承諾學校或政府的決定。",
    no_professional_review_included: "自助服務不包含合資格專業人士審閱。",
    no_submission_before_handoff_acceptance:
      "在獲授權的專業人士接受交接之前，不會提交任何內容。",
    platform_does_not_submit_or_receive_receipts:
      "本平台不代為提交申請，也不代你接收官方回執。",
    professional_review_of_this_exact_version_required:
      "針對此確切版本的專業審閱必須仍然有效。",
  } as Record<string, string>,
  error: "無法載入授權資訊。",
  externalRecords: "你上報的外部操作",
  externalUnverifiedNote:
    "客戶上報與工作人員記錄的項目均為未核實狀態，不屬於官方回執。",
  handoff: "人工交接",
  handoffEligible: "此材料目前符合交接條件。",
  handoffHint: "交接即請已指派的專業人士處理此確切版本。",
  handoffNotEligible: "此材料目前不符合交接條件。",
  handoffStatus: {
    accepted: "專業人士已接受",
    cancelled: "已取消",
    declined: "已拒絕",
    requested: "已請求",
    superseded: "已被取代",
  } as Record<string, string>,
  intro: "請選擇由誰處理此確切版本：你本人，或代表你的專業人士。",
  loading: "正在載入授權資訊...",
  modeManaged: "託管服務",
  modeManagedHelp:
    "需要目前有效的服務關係、協議、付款條件、資源揭露、專業審閱與專業資格。",
  modeSelf: "自助服務",
  modeSelfHelp: "你自行檢視材料並提交外部申請。",
  modeUnavailable: "暫不可用",
  nextAction: {
    authorize_managed_service: "請授權託管服務以繼續。",
    authorize_self_service: "請授權自助服務以繼續。",
    await_handoff: "正在等待專業人士接受交接。",
    await_professional_submission: "專業人士已接受，提交將在此平台之外完成。",
    build_package: "請先產生材料版本。",
    confirm_package: "請先確認目前材料版本。",
    none: "此步驟無需其他操作。",
    rebuild_package: "內容已變更，請產生並確認新版本。",
    record_external_action: "當你本人提交後，可在此記錄為未核實。",
    request_handoff: "請向已指派的專業人士請求交接。",
    unavailable: "此材料目前無法授權。",
  } as Record<string, string>,
  noExternalRecords: "尚無外部操作記錄。",
  noPackage: "尚無可授權的材料版本。",
  notCurrent: "已不再有效",
  provenance: {
    customer_reported: "由你上報",
    document_backed_unverified: "附有文件，尚未核實",
    provider_verified: "已由外部來源核實",
    staff_attested: "由工作人員記錄",
  } as Record<string, string>,
  reason: {
    authorization_superseded: "已被更新的決定取代。",
    confirmation_missing: "缺少必需的確認。",
    confirmation_not_current: "某項確認已不再有效。",
    confirmation_not_finalized: "某項確認未完成校驗。",
    confirmation_policy_unknown: "揭露條款已更新，請重新確認。",
    managed_readiness_not_ready: "託管服務條件尚未滿足。",
    managed_readiness_unknown: "無法確認託管服務條件。",
    package_freshness_lost: "此版本之後申請內容已變更。",
    package_integrity_unverified: "此版本未通過完整性校驗。",
    package_not_current: "已有更新的材料版本。",
    professional_authority_denied: "專業授權已被撤回。",
    professional_credential_unverified: "專業人士的資格尚未核實。",
    professional_review_not_approved: "缺少有效的專業審閱。",
    source_unavailable: "某來源暫時不可用。",
  } as Record<string, string>,
  recordExternal: "記錄我本人已提交",
  requestHandoff: "請求交接",
  state: "授權狀態",
  status: {
    effective: "對此版本有效",
    ineffective: "無效",
    unknown: "無法確認",
  } as Record<string, string>,
  submissionState: {
    not_submitted: "未記錄為已提交",
    reported_unverified: "已上報為提交，未核實",
    verified: "已核實為已提交",
  } as Record<string, string>,
  title: "由誰處理此材料",
  unavailable: "此處暫不可使用提交授權功能。",
};

export const submissionAuthorizationCopy = {
  en: M8_2_EN,
  "zh-Hans": M8_2_ZH_HANS,
  "zh-Hant": M8_2_ZH_HANT,
} as const;
