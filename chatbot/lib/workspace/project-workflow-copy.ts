import type {
  ProjectWorkflowKind,
  ProjectWorkflowStepKey,
  TaskApplicability,
  TaskProgress,
} from "./project-workflows";

export type ProjectWorkflowCopy = {
  railHeading: string;
  navigation: {
    workspaceTitle: string;
    activeProject: string;
    switchProject: string;
    workflows: string;
    projectChats: string;
    projectTools: string;
    recentConversations: string;
    resizeWorkspaceNavigation: string;
    collapseMatter: string;
    expandMatter: string;
    currentTask: string;
  };
  profileLabels: Record<ProjectWorkflowKind, string>;
  stepTitles: Record<ProjectWorkflowStepKey, string>;
  stepDescriptions: Record<ProjectWorkflowStepKey, string>;
  compactKnownProgress: (completed: number, applicable: number) => string;
  applicability: Record<TaskApplicability, string>;
  progress: Record<TaskProgress, string>;
  responsibleActorTitle: string;
  responsibleActor: Record<
    "customer" | "external_institution" | "unknown",
    string
  >;
  reasons: Readonly<Record<string, string>>;
  genericReason: string;
  selectStep: string;
  panelHeading: string;
  progressTitle: string;
  targetIdentity: string;
  projectStatus: string;
  projectRevision: string;
  unknownValue: string;
  noStudyContext: string;
  fields: {
    institution: string;
    course: string;
    intake: string;
    status: string;
    serviceScope: string;
    missingInformation: string;
    noRequirements: string;
    stale: string;
  };
  stepDetails: string;
  sourceRevision: (
    targetKind: string,
    targetId: string,
    revision: number
  ) => string;
  relatedRecords: string;
  relationshipOnly: string;
  projectGoalUnknown: string;
  projectScopeUnknown: string;
  recordedProjectRoutes: string;
  noRecordedProjectRoutes: string;
  knownProgress: (completed: number, applicable: number) => string;
  unknownApplicability: (count: number) => string;
  unavailableTasks: (count: number) => string;
  notApplicableTasks: (count: number) => string;
  unknownProgressTasks: (count: number) => string;
  coverage: Record<"complete" | "partial" | "unavailable", string>;
  compactCoverage: Record<"complete" | "partial" | "unavailable", string>;
  progressBarLabel: string;
  completionEvidence: string;
  notEligibility: string;
  school: {
    section: string;
    sourceStatus: string;
    sourceStatusLabels: Readonly<Record<string, string>>;
    packageState: string;
    missingInformation: (count: number) => string;
    noRequirements: string;
    noSubmission: string;
  };
  admissions: {
    section: string;
    origin: string;
    originLabels: Readonly<Record<string, string>>;
    serviceMode: string;
    serviceModeLabels: Readonly<Record<string, string>>;
    preparation: string;
    requirementStatus: string;
    outcomeEvidence: string;
    noOutcome: string;
    handoff: string;
  };
  student: {
    section: string;
    route: string;
    routeLabels: Readonly<Record<string, string>>;
    coeStatus: string;
    coeStatusLabels: Readonly<Record<string, string>>;
    schoolDependency: string;
    dependencyLabels: Readonly<Record<string, string>>;
    sourceVerification: string;
    schoolContext: string;
    studyEvidenceKind: string;
    studyEvidenceLabels: Readonly<Record<string, string>>;
    contextCurrent: string;
    contextNotCurrent: string;
    independent: string;
    notIndependent: string;
    preparation: string;
    noStudyContext: string;
    drafts: (count: number) => string;
    snapshots: (count: number) => string;
    staleArtifacts: string;
    legalCurrentness: string;
    currentnessLabels: Readonly<Record<string, string>>;
    noGovernmentState: string;
  };
};

const EN: ProjectWorkflowCopy = {
  railHeading: "Workflow steps",
  navigation: {
    workspaceTitle: "AI Workspace",
    activeProject: "Active Project",
    switchProject: "Switch Project",
    workflows: "Workflows",
    projectChats: "Project Chats",
    projectTools: "Project Tools and Business Management",
    recentConversations: "Recent Conversations",
    resizeWorkspaceNavigation: "Resize workspace navigation",
    collapseMatter: "Collapse matter",
    expandMatter: "Expand matter",
    currentTask: "Current task",
  },
  profileLabels: {
    project_planning: "Project planning",
    school_application: "School Application",
    school_admissions: "Admissions route",
    student_500: "Student 500",
  },
  stepTitles: {
    project_goal: "Confirm the Project goal",
    workflow_scope: "Confirm which work applies",
    source_coverage: "Source data availability",
    planning: "Planning and starting point",
    school_discovery: "School and course discovery",
    academic_readiness: "Academic and admissions readiness",
    language_preparation: "Conditional language preparation",
    finance_documents: "Finance and documents",
    statements_materials: "Statements and application materials",
    pre_submission: "Pre-submission preparation",
    admissions_planning: "Admissions route planning",
    admissions_requirements: "Recorded admissions requirements",
    offer_coe_evidence: "Verified Offer or CoE evidence",
    external_handoff: "Managed handoff readiness",
    visa_planning: "Visa planning and personal context",
    study_evidence_coe: "Study evidence and CoE",
    genuine_student_preparation: "Genuine Student preparation",
    financial_capacity: "Financial capacity",
    conditional_supporting_requirements: "Conditional supporting requirements",
    pre_lodgement: "Pre-lodgement review",
    lodgement_events: "Lodgement and later events",
  },
  stepDescriptions: {
    project_goal:
      "M1 records the Project purpose as unknown. This planning task is visible, but E2 cannot confirm or save a goal.",
    workflow_scope:
      "Only actual authorized School, Admissions and Student 500 records create those profiles. Without a confirmed Project goal, missing records do not prove that a workflow is unnecessary.",
    source_coverage:
      "The corresponding M1 source is restricted, disabled or unavailable. This is not an empty-record result.",
    planning:
      "This is tied to the exact School Application. A record or selected course does not prove that the Project goal or plan is complete.",
    school_discovery:
      "The stored institution and course are not independently verified by M1. E2 does not search or certify official course offerings.",
    academic_readiness:
      "M1 does not expose a current, institution-specific academic checklist that can prove applicability or completion.",
    language_preparation:
      "Language applicability depends on current course-specific requirements that are not established in this M1 read.",
    finance_documents:
      "Document trust and current requirement sources remain capability-gated. A missing reference is not proof of a complete document list.",
    statements_materials:
      "M1 package metadata and missing-field codes are shown. A generated or usable package remains preparation, not submission.",
    pre_submission:
      "Package readiness does not prove a school submission, external receipt or professional approval.",
    admissions_planning:
      "This panel is tied to this exact Admissions Case and its recorded route.",
    admissions_requirements:
      "Only the requirement rows returned by M1 are shown. They do not establish a complete checklist or professional sign-off.",
    offer_coe_evidence:
      "Current valid, independently verified Offer or CoE evidence completes this step. A verified accepted Offer counts as recorded Admissions evidence only; acceptance does not establish current Offer validity or a current CoE and never completes Student 500 CoE evidence.",
    external_handoff:
      "READY means preparation readiness only. Customer-reported external actions do not verify a send, acknowledgment or school receipt.",
    visa_planning:
      "The recorded Student 500 context is user preparation data. It does not establish eligibility or a visa outcome.",
    study_evidence_coe:
      "A reported Offer or CoE remains unverified. Completion requires a current, independently verified CoE in the linked M1 Admissions record.",
    genuine_student_preparation:
      "Only bounded draft and snapshot metadata is available here. A draft does not establish completion, current law or professional approval.",
    financial_capacity:
      "Current applicable financial rules and case-specific applicability are not established by this M1 projection.",
    conditional_supporting_requirements:
      "Conditional items remain unknown until the existing authorized source establishes that they apply to this matter.",
    pre_lodgement:
      "M1 does not provide a complete current pre-lodgement checklist or establish legal readiness.",
    lodgement_events:
      "M1 has no government lodgement, receipt or subsequent event source for this workflow.",
  },
  applicability: {
    applicable: "Applies to this recorded matter",
    not_applicable: "Not applicable from a recorded condition",
    unknown: "Applicability unknown",
    unavailable: "Cannot determine from available sources",
  },
  progress: {
    not_started: "Not started",
    in_progress: "In progress",
    needs_information: "Needs information",
    waiting: "Waiting",
    blocked: "Blocked",
    completed: "Completed from recorded evidence",
    unknown: "Progress unknown",
  },
  responsibleActorTitle: "Who acts next",
  responsibleActor: {
    customer: "You need to provide or confirm information",
    external_institution: "Waiting for the school or institution",
    unknown: "The responsible person is not recorded",
  },
  reasons: {
    project_purpose_not_recorded:
      "The authoritative M1 Project purpose is unknown.",
    planning_not_completed:
      "M1 has no confirmed Project planning completion field.",
    project_goal_source_not_recorded:
      "No confirmed Project goal source is recorded.",
    source_records_unavailable:
      "The corresponding M1 source could not be read.",
    school_application_source_unavailable:
      "School Application capability is unavailable.",
    school_application_records_unavailable:
      "School Application records are unavailable.",
    school_admissions_source_unavailable:
      "Admissions capability is unavailable.",
    school_admissions_records_unavailable:
      "Admissions records are unavailable.",
    student500_source_unavailable: "Student 500 capability is unavailable.",
    student500_records_unavailable: "Student 500 records are unavailable.",
    target_archived:
      "This record is archived and contributes no positive progress.",
    verified_existing_offer_or_coe_route:
      "A matching current Offer or CoE is recorded with independent verification and attached evidence.",
    verified_accepted_offer_route:
      "A verified accepted Offer is linked to this exact School route. It records an Admissions decision, but does not establish a current Offer or CoE or Student 500 CoE evidence.",
    school_course_source_unverified:
      "The School Application source is not independently verified.",
    school_discovery_completion_not_recorded:
      "M1 does not record verified course discovery completion.",
    current_school_requirements_unavailable:
      "Current institution-specific requirements are not available in M1.",
    specific_document_requirements_not_in_m1:
      "M1 does not expose the exact applicable document checklist.",
    project_documents_capability_unavailable:
      "Project Documents are not available through the current capability.",
    school_materials_have_missing_information:
      "M1 reports missing School Application information.",
    school_package_stale_or_unusable:
      "The current package is stale or unusable.",
    usable_package_is_preparation_not_completion:
      "A usable package is preparation, not a completed application.",
    school_package_not_recorded: "No School Application package is recorded.",
    package_does_not_prove_school_submission:
      "M1 does not record a school submission or receipt.",
    linked_school_target_unavailable:
      "The exact linked School Application cannot be resolved.",
    admissions_preparation_not_started:
      "The Admissions Case preparation state is not started.",
    admissions_requirements_not_recorded:
      "No Admissions requirement rows are recorded.",
    admissions_requirement_gap_recorded:
      "M1 records a missing or conflicting requirement row.",
    admissions_requirement_verification_unknown:
      "One or more requirement rows are unknown or unverified.",
    m1_requirement_rows_not_comprehensive_completion_proof:
      "Recorded requirement rows do not establish a complete checklist.",
    verified_outcome_evidence_recorded:
      "A matching current valid outcome has independent verification and attached evidence and is not superseded.",
    verified_accepted_offer_evidence_recorded:
      "The accepted Offer is independently verified, has attached evidence and is not superseded. This records the Admissions decision only; it does not establish current CoE validity.",
    offer_coe_not_independently_verified:
      "The recorded Offer or CoE is not independently verified with evidence attached.",
    offer_coe_outcome_not_current_verified:
      "Recorded Offer or CoE history has no current independently verified outcome with evidence attached.",
    offer_coe_evidence_not_recorded:
      "No matching Offer or CoE evidence is recorded.",
    claimed_exception_not_verified:
      "The exception route is a recorded claim, not a verified outcome.",
    future_offer_or_coe_not_recorded:
      "No Offer or CoE outcome is recorded yet.",
    self_service_has_no_managed_handoff:
      "Self-service mode has no managed handoff task.",
    handoff_readiness_does_not_prove_send:
      "Readiness does not prove that an external handoff was sent.",
    managed_handoff_not_ready:
      "M1 reports that the managed handoff is not ready.",
    managed_handoff_status_unknown:
      "M1 does not establish managed handoff readiness.",
    customer_reported_external_action_unverified:
      "External actions are customer-reported and unverified.",
    route_recorded_customer_context_only:
      "A route is recorded as preparation context only.",
    student_context_missing_information:
      "M1 reports missing Student 500 context information.",
    student_route_not_recorded: "No Student 500 route is recorded.",
    student_study_route_and_evidence_unknown:
      "The Student 500 route or study-evidence source is unknown.",
    student_preparation_source_unavailable:
      "Student 500 preparation data is unavailable.",
    current_independently_verified_coe_recorded:
      "The linked M1 Admissions record has a current independently verified CoE with attached evidence.",
    customer_reported_study_evidence_not_verified:
      "The Offer or CoE is reported but not independently verified.",
    recorded_study_evidence_target_unavailable:
      "The exact linked study-evidence target is unavailable.",
    no_platform_school_dependency_required:
      "M1 records a route that does not require a platform School Application.",
    study_evidence_not_independently_verified:
      "M1 does not record current independently verified study evidence.",
    student_draft_metadata_recorded_not_complete:
      "Draft metadata exists; it does not show approval or completion.",
    student_drafts_stale: "Recorded Student 500 drafts are stale.",
    no_student_draft_recorded_and_applicability_unknown:
      "No draft is recorded and task applicability is not established.",
    current_personal_applicability_not_exposed_by_m1:
      "A source snapshot exists, but M1 does not expose its current personal applicability.",
    current_legal_source_or_applicability_unavailable:
      "Current legal source or case-specific applicability is unavailable.",
    government_lodgement_and_receipt_not_in_m1:
      "M1 has no government lodgement or receipt source.",
  },
  genericReason:
    "M1 does not provide enough information to determine this task.",
  selectStep: "Select a step to view its current M1 data.",
  panelHeading: "Task and source details",
  progressTitle: "Project workflow progress",
  targetIdentity: "Authorized target",
  projectStatus: "Recorded Project status",
  projectRevision: "Project revision",
  unknownValue: "Unknown",
  noStudyContext: "No linked study-evidence context is recorded.",
  fields: {
    institution: "Recorded institution",
    course: "Recorded course",
    intake: "Recorded intake",
    status: "M1 status",
    serviceScope: "Recorded service scope",
    missingInformation: "Recorded missing information",
    noRequirements: "No requirement rows are recorded.",
    stale: "stale",
  },
  stepDetails: "Current step",
  sourceRevision: (targetKind, targetId, revision) =>
    `${targetKind} ${targetId} · revision ${revision}`,
  relatedRecords: "Recorded related task",
  relationshipOnly:
    "This is a recorded relationship for context, not a required order.",
  projectGoalUnknown: "Project goal: not recorded in M1.",
  projectScopeUnknown:
    "Workflow scope remains unknown until an authoritative Project goal is recorded.",
  recordedProjectRoutes: "Recorded Offer/CoE and Student 500 routes",
  noRecordedProjectRoutes:
    "No Offer/CoE or Student 500 entry route is recorded in M1.",
  knownProgress: (completed, applicable) =>
    `${completed} of ${applicable} known-applicable tasks complete`,
  compactKnownProgress: (completed, applicable) =>
    `${completed} / ${applicable} complete`,
  unknownApplicability: (count) =>
    `${count} task(s) with unknown applicability`,
  unavailableTasks: (count) => `${count} unavailable task(s)`,
  notApplicableTasks: (count) => `${count} not-applicable task(s)`,
  unknownProgressTasks: (count) => `${count} task(s) with unknown progress`,
  coverage: {
    complete: "Coverage is established for the projected tasks.",
    partial:
      "Partial counts only. Unknown and unavailable work is excluded from the denominator.",
    unavailable: "Project task progress is unavailable.",
  },
  compactCoverage: {
    complete: "Coverage known",
    partial: "Partial stats",
    unavailable: "Unavailable",
  },
  progressBarLabel: "Known applicable task completion",
  completionEvidence:
    "Task status is derived from the listed M1 fields and rule.",
  notEligibility:
    "These workflow states are not legal eligibility, submission, professional approval or outcome determinations.",
  school: {
    section: "School Application context",
    sourceStatus: "Recorded source status",
    sourceStatusLabels: {
      unverified_customer_declared: "Customer-declared, unverified",
      unverified_catalog_match: "Unverified catalog match",
      synthetic_catalog_match: "Synthetic catalog match",
    },
    packageState: "Package state",
    missingInformation: (count) =>
      `${count} missing information item(s) are recorded.`,
    noRequirements:
      "Current School requirements are not represented in this Project State view.",
    noSubmission: "No school submission or school receipt is recorded here.",
  },
  admissions: {
    section: "Admissions Case context",
    origin: "Recorded route",
    originLabels: {
      school_application: "School Application",
      existing_offer: "Existing Offer route",
      existing_coe: "Existing CoE route",
      claimed_exception: "Claimed exception, unverified",
    },
    serviceMode: "Service mode",
    serviceModeLabels: {
      self_service: "Self-service",
      managed_service: "Managed service",
    },
    preparation: "Preparation state",
    requirementStatus: "Recorded requirement rows",
    outcomeEvidence: "Recorded Offer/CoE outcomes",
    noOutcome: "No Offer or CoE outcome is recorded.",
    handoff: "Managed handoff state",
  },
  student: {
    section: "Student 500 context",
    route: "Recorded entry route",
    routeLabels: {
      existing_coe: "Existing CoE reported",
      offer_only: "Offer-only route reported",
      school_application_in_progress: "School Application in progress",
      no_school_application: "No platform School Application required",
    },
    coeStatus: "CoE status (customer-reported)",
    coeStatusLabels: {
      reported_held: "Reported held, not independently verified",
      reported_not_held: "Reported not held",
      unknown: "Unknown",
    },
    schoolDependency: "Recorded School relationship",
    dependencyLabels: {
      linked: "Linked to an exact M1 record",
      not_applicable: "No platform School Application required",
      unknown: "Relationship unknown",
      unavailable: "Linked record unavailable",
    },
    sourceVerification: "Legal source verification state",
    schoolContext: "Study evidence source",
    studyEvidenceKind: "Study evidence kind",
    studyEvidenceLabels: {
      none: "No evidence recorded",
      offer_only: "Offer only; not a CoE",
      coe_reported: "CoE reported, not independently verified",
      coe_independently_verified: "CoE independently verified",
    },
    contextCurrent: "The linked study context is current in M1.",
    contextNotCurrent: "The linked study context is stale or not current.",
    independent: "Independent verification recorded",
    notIndependent: "Independent verification not recorded",
    preparation: "Preparation state",
    noStudyContext: "No linked study-evidence context is recorded.",
    drafts: (count) => `${count} draft metadata record(s)`,
    snapshots: (count) => `${count} snapshot metadata record(s)`,
    staleArtifacts: "One or more preparation records are stale.",
    legalCurrentness: "Snapshot legal currentness",
    currentnessLabels: {
      current: "Current for the recorded source revision",
      superseded: "Superseded",
      unestablished: "Not established",
    },
    noGovernmentState:
      "Government lodgement, receipt and visa outcome are not represented in M1.",
  },
};

const ZH_HANS: ProjectWorkflowCopy = {
  railHeading: "工作流程步骤",
  navigation: {
    workspaceTitle: "AI 工作区",
    activeProject: "进行中的项目",
    switchProject: "切换项目",
    workflows: "工作流程",
    projectChats: "项目对话",
    projectTools: "项目工具与业务管理",
    recentConversations: "最近对话",
    resizeWorkspaceNavigation: "调整工作区导航宽度",
    collapseMatter: "收起业务事项",
    expandMatter: "展开业务事项",
    currentTask: "当前任务",
  },
  profileLabels: {
    project_planning: "项目规划",
    school_application: "学校申请",
    school_admissions: "入学流程",
    student_500: "学生签证 500",
  },
  stepTitles: {
    project_goal: "确认项目目标",
    workflow_scope: "确认适用的工作范围",
    source_coverage: "数据来源可用性",
    planning: "规划与起点",
    school_discovery: "学校与课程探索",
    academic_readiness: "学业与入学准备",
    language_preparation: "条件性语言准备",
    finance_documents: "资金与文件",
    statements_materials: "陈述与申请材料",
    pre_submission: "递交前准备",
    admissions_planning: "入学路径规划",
    admissions_requirements: "已记录的入学要求",
    offer_coe_evidence: "已核验的 Offer 或 CoE 证据",
    external_handoff: "受托服务交接准备",
    visa_planning: "签证规划与个人情况",
    study_evidence_coe: "学习证据与 CoE",
    genuine_student_preparation: "Genuine Student 准备",
    financial_capacity: "资金能力",
    conditional_supporting_requirements: "条件性支持要求",
    pre_lodgement: "递交前检查",
    lodgement_events: "递交及后续事件",
  },
  stepDescriptions: {
    project_goal:
      "M1 将项目目的标记为未知。此规划任务会显示，但 E2 不能确认或保存目标。",
    workflow_scope:
      "只有实际且已授权读取的学校、入学或学生签证记录才会创建对应流程。没有已确认项目目标时，缺少记录不能证明某个流程不需要。",
    source_coverage:
      "对应的 M1 数据来源受限、关闭或暂不可用。这不代表没有相关记录。",
    planning:
      "此步骤仅对应当前学校申请。记录或选定课程并不能证明项目目标或规划已完成。",
    school_discovery:
      "M1 未独立核验已记录的学校和课程。E2 不会搜索或认证官方课程。",
    academic_readiness:
      "M1 未提供可证明适用性或完成状态的当前院校学业要求清单。",
    language_preparation:
      "语言要求取决于当前课程要求；当前 M1 读取无法确定是否适用。",
    finance_documents:
      "文件信任门和当前要求来源仍受能力开关限制。缺少文件引用不代表文件清单完整。",
    statements_materials:
      "显示 M1 材料包元数据和缺失字段。生成或可用的材料包仍属于准备，不代表已递交。",
    pre_submission:
      "材料包准备就绪不代表已向学校递交、学校已收件或已获专业批准。",
    admissions_planning: "此面板对应当前 Admissions Case 及其已记录路径。",
    admissions_requirements:
      "仅显示 M1 返回的要求条目；不代表完整清单或专业签核。",
    offer_coe_evidence:
      "当前有效、独立核验并附有证据的 Offer 或 CoE 可完成此步骤。已核验的已接受 Offer 仅算作 Admissions 已记录证据；接受状态不证明 Offer 当前有效或已有当前 CoE，也不能完成 Student 500 的 CoE 证据步骤。",
    external_handoff:
      "READY 仅表示准备就绪。客户报告的外部操作不能证明已发送、已确认或学校已收件。",
    visa_planning:
      "已记录的 Student 500 情况是用户提供的准备数据，不代表签证资格或结果。",
    study_evidence_coe:
      "客户报告的 Offer/CoE 仍未核验。完成需有当前且独立核验的已关联 M1 Admissions CoE。",
    genuine_student_preparation:
      "这里只提供草稿和快照元数据。草稿不代表完成、当前法律要求或专业批准。",
    financial_capacity: "此 M1 投影无法确定当前适用的资金规则及个案适用性。",
    conditional_supporting_requirements:
      "只有现有授权来源确认适用后，条件性事项才可确定。",
    pre_lodgement:
      "M1 未提供完整且当前的递交前清单，也未确定法律上的可递交状态。",
    lodgement_events: "M1 没有政府递交、收件或后续事件来源。",
  },
  applicability: {
    applicable: "适用于此已记录事项",
    not_applicable: "根据已记录条件不适用",
    unknown: "适用性未知",
    unavailable: "无法从现有来源确定",
  },
  progress: {
    not_started: "尚未开始",
    in_progress: "进行中",
    needs_information: "需要补充信息",
    waiting: "等待中",
    blocked: "受阻",
    completed: "有记录证据证明完成",
    unknown: "进度未知",
  },
  responsibleActorTitle: "当前由谁处理",
  responsibleActor: {
    customer: "您需要提供或确认信息",
    external_institution: "等待学校或机构处理",
    unknown: "负责人尚未记录",
  },
  reasons: {
    project_purpose_not_recorded: "M1 中的项目目的为未知。",
    planning_not_completed: "M1 没有已确认的项目规划完成字段。",
    project_goal_source_not_recorded: "没有已记录的项目目标来源。",
    school_application_source_unavailable: "学校申请能力不可用。",
    school_application_records_unavailable: "学校申请记录不可用。",
    school_admissions_source_unavailable: "Admissions 能力不可用。",
    school_admissions_records_unavailable: "Admissions 记录不可用。",
    student500_source_unavailable: "Student 500 能力不可用。",
    student500_records_unavailable: "Student 500 记录不可用。",
    target_archived: "该记录已归档，不计入正向进度。",
    verified_existing_offer_or_coe_route:
      "记录了匹配、当前且独立核验并附有证据的 Offer 或 CoE。",
    verified_accepted_offer_route:
      "此 School 路径准确关联了已核验的已接受 Offer。它记录了 Admissions 决定，但不证明当前 Offer 或 CoE 有效，也不构成 Student 500 CoE 证据。",
    school_course_source_unverified: "学校申请来源尚未独立核验。",
    school_discovery_completion_not_recorded: "M1 未记录已核验课程探索完成。",
    current_school_requirements_unavailable: "M1 中没有当前院校具体要求。",
    specific_document_requirements_not_in_m1: "M1 未显示确切适用的文件清单。",
    project_documents_capability_unavailable: "当前能力下无法使用项目文件。",
    school_materials_have_missing_information: "M1 记录了缺失的学校申请信息。",
    school_package_stale_or_unusable: "当前材料包已过期或不可用。",
    usable_package_is_preparation_not_completion:
      "可用材料包属于准备，不代表申请完成。",
    school_package_not_recorded: "尚无学校申请材料包记录。",
    package_does_not_prove_school_submission: "M1 未记录学校递交或收件。",
    linked_school_target_unavailable: "无法解析确切关联的学校申请。",
    admissions_preparation_not_started: "Admissions Case 准备状态尚未开始。",
    admissions_requirements_not_recorded: "没有已记录的 Admissions 要求条目。",
    admissions_requirement_gap_recorded: "M1 记录了缺失或冲突的要求条目。",
    admissions_requirement_verification_unknown:
      "一个或多个要求条目未知或未核验。",
    m1_requirement_rows_not_comprehensive_completion_proof:
      "已记录的要求条目不能证明清单完整。",
    verified_outcome_evidence_recorded:
      "匹配的当前有效结果已独立核验、附有证据且未被取代。",
    verified_accepted_offer_evidence_recorded:
      "已接受的 Offer 已独立核验、附有证据且未被取代。此项只记录 Admissions 决定，不证明当前 CoE 有效。",
    offer_coe_not_independently_verified:
      "记录的 Offer 或 CoE 未独立核验或未附证据。",
    offer_coe_outcome_not_current_verified:
      "已记录的 Offer 或 CoE 历史中没有当前且附有证据的独立核验结果。",
    offer_coe_evidence_not_recorded: "没有匹配的 Offer 或 CoE 证据记录。",
    claimed_exception_not_verified: "例外路径只是已记录的声明，尚未核验。",
    future_offer_or_coe_not_recorded: "尚无 Offer 或 CoE 结果记录。",
    self_service_has_no_managed_handoff: "自助服务模式不包含受托服务交接任务。",
    handoff_readiness_does_not_prove_send: "准备就绪不能证明已发送外部交接。",
    managed_handoff_not_ready: "M1 记录受托服务交接尚未准备就绪。",
    managed_handoff_status_unknown: "M1 未确定受托服务交接准备状态。",
    customer_reported_external_action_unverified:
      "外部操作由客户报告，尚未核验。",
    route_recorded_customer_context_only: "路径仅记录为准备情况。",
    student_context_missing_information: "M1 记录 Student 500 情况仍缺少信息。",
    student_route_not_recorded: "尚未记录 Student 500 路径。",
    student_study_route_and_evidence_unknown:
      "Student 500 路径或学习证据来源未知。",
    student_preparation_source_unavailable: "Student 500 准备数据不可用。",
    current_independently_verified_coe_recorded:
      "关联 M1 Admissions 中有当前且独立核验并附证据的 CoE。",
    customer_reported_study_evidence_not_verified:
      "Offer 或 CoE 仅由客户报告，尚未独立核验。",
    recorded_study_evidence_target_unavailable:
      "确切关联的学习证据事项不可用。",
    no_platform_school_dependency_required:
      "M1 记录的路径不需要平台内学校申请。",
    study_evidence_not_independently_verified:
      "M1 未记录当前且独立核验的学习证据。",
    student_draft_metadata_recorded_not_complete:
      "存在草稿元数据，但不代表已批准或完成。",
    student_drafts_stale: "已记录的 Student 500 草稿已过期。",
    no_student_draft_recorded_and_applicability_unknown:
      "没有草稿记录，且无法确定任务是否适用。",
    current_personal_applicability_not_exposed_by_m1:
      "存在来源快照，但 M1 未提供其对当前个案的适用性。",
    current_legal_source_or_applicability_unavailable:
      "当前法律来源或个案适用性不可用。",
    government_lodgement_and_receipt_not_in_m1: "M1 没有政府递交或收件来源。",
  },
  genericReason: "M1 信息不足，无法确定此任务。",
  selectStep: "选择步骤以查看当前 M1 数据。",
  panelHeading: "任务与来源详情",
  progressTitle: "项目工作流程进度",
  targetIdentity: "已授权目标",
  projectStatus: "已记录的项目状态",
  projectRevision: "项目版本",
  unknownValue: "未知",
  noStudyContext: "尚未记录关联的学习证据情况。",
  fields: {
    institution: "已记录院校",
    course: "已记录课程",
    intake: "已记录入学时间",
    status: "M1 状态",
    serviceScope: "已记录服务范围",
    missingInformation: "已记录的缺失信息",
    noRequirements: "尚未记录要求条目。",
    stale: "已过期",
  },
  stepDetails: "当前步骤",
  sourceRevision: (kind, id, revision) => `${kind} ${id} · 版本 ${revision}`,
  relatedRecords: "已记录的关联任务",
  relationshipOnly: "此关联仅供了解关系，不表示必须按固定顺序完成。",
  projectGoalUnknown: "项目目标：M1 尚未记录。",
  projectScopeUnknown: "在权威项目目标记录前，整体工作范围仍未知。",
  recordedProjectRoutes: "已记录的 Offer/CoE 与 Student 500 路径",
  noRecordedProjectRoutes:
    "M1 中没有已记录的 Offer/CoE 或 Student 500 入口路径。",
  knownProgress: (done, total) => `已知适用任务完成 ${done} / ${total} 项`,
  compactKnownProgress: (done, total) => `已完成 ${done} / ${total}`,
  unknownApplicability: (count) => `${count} 项任务的适用性未知`,
  unavailableTasks: (count) => `${count} 项任务不可用`,
  notApplicableTasks: (count) => `${count} 项任务不适用`,
  unknownProgressTasks: (count) => `${count} 项任务进度未知`,
  coverage: {
    complete: "已确定所投影任务的覆盖范围。",
    partial: "仅显示部分计数；未知和不可用任务不计入分母。",
    unavailable: "项目任务进度不可用。",
  },
  compactCoverage: {
    complete: "统计范围已确定",
    partial: "部分统计",
    unavailable: "进度不可用",
  },
  progressBarLabel: "已知适用任务完成情况",
  completionEvidence: "任务状态由列出的 M1 字段和规则推导。",
  notEligibility: "这些流程状态不代表法律资格、申请递交、专业批准或结果。",
  school: {
    section: "学校申请情况",
    sourceStatus: "已记录来源状态",
    sourceStatusLabels: {
      unverified_customer_declared: "客户声明，未核验",
      unverified_catalog_match: "目录匹配，未核验",
      synthetic_catalog_match: "合成目录匹配",
    },
    packageState: "材料包状态",
    missingInformation: (count) => `记录了 ${count} 项缺失信息。`,
    noRequirements: "此项目状态视图未提供当前学校要求。",
    noSubmission: "此处没有学校递交或学校收件记录。",
  },
  admissions: {
    section: "Admissions Case 情况",
    origin: "记录的路径",
    originLabels: {
      school_application: "学校申请",
      existing_offer: "已有 Offer 路径",
      existing_coe: "已有 CoE 路径",
      claimed_exception: "声明的例外，未核验",
    },
    serviceMode: "服务模式",
    serviceModeLabels: {
      self_service: "自助服务",
      managed_service: "受托服务",
    },
    preparation: "准备状态",
    requirementStatus: "已记录要求条目",
    outcomeEvidence: "已记录的 Offer/CoE 结果",
    noOutcome: "尚无 Offer 或 CoE 结果记录。",
    handoff: "受托服务交接状态",
  },
  student: {
    section: "学生签证 500 情况",
    route: "已记录的进入路径",
    routeLabels: {
      existing_coe: "报告已有 CoE",
      offer_only: "报告仅有 Offer",
      school_application_in_progress: "学校申请进行中",
      no_school_application: "不需要平台内学校申请",
    },
    coeStatus: "CoE 状态（客户报告）",
    coeStatusLabels: {
      reported_held: "报告已持有，未独立核验",
      reported_not_held: "报告尚未持有",
      unknown: "未知",
    },
    schoolDependency: "已记录的学校关联",
    dependencyLabels: {
      linked: "关联到确切 M1 记录",
      not_applicable: "不需要平台内学校申请",
      unknown: "关联未知",
      unavailable: "关联记录不可用",
    },
    sourceVerification: "法律来源核验状态",
    schoolContext: "学习证据来源",
    studyEvidenceKind: "学习证据类型",
    studyEvidenceLabels: {
      none: "没有证据记录",
      offer_only: "仅 Offer，不是 CoE",
      coe_reported: "报告 CoE，未独立核验",
      coe_independently_verified: "CoE 已独立核验",
    },
    contextCurrent: "M1 中的关联学习情况为当前状态。",
    contextNotCurrent: "关联学习情况已过期或非当前状态。",
    independent: "已记录独立核验",
    notIndependent: "未记录独立核验",
    preparation: "准备状态",
    noStudyContext: "尚未记录关联的学习证据情况。",
    drafts: (count) => `${count} 项草稿元数据记录`,
    snapshots: (count) => `${count} 项快照元数据记录`,
    staleArtifacts: "一项或多项准备记录已过期。",
    legalCurrentness: "快照法律时效",
    currentnessLabels: {
      current: "对已记录来源版本而言当前",
      superseded: "已被取代",
      unestablished: "尚未确定",
    },
    noGovernmentState: "M1 未记录政府递交、收件或签证结果。",
  },
};

const ZH_HANT: ProjectWorkflowCopy = {
  ...ZH_HANS,
  railHeading: "工作流程步驟",
  navigation: {
    workspaceTitle: "AI 工作區",
    activeProject: "進行中的專案",
    switchProject: "切換專案",
    workflows: "工作流程",
    projectChats: "專案對話",
    projectTools: "專案工具與業務管理",
    recentConversations: "最近對話",
    resizeWorkspaceNavigation: "調整工作區導覽寬度",
    collapseMatter: "收合業務事項",
    expandMatter: "展開業務事項",
    currentTask: "目前任務",
  },
  profileLabels: {
    project_planning: "專案規劃",
    school_application: "學校申請",
    school_admissions: "入學流程",
    student_500: "學生簽證 500",
  },
  stepTitles: {
    ...ZH_HANS.stepTitles,
    project_goal: "確認專案目標",
    workflow_scope: "確認適用的工作範圍",
    source_coverage: "資料來源可用性",
    planning: "規劃與起點",
    school_discovery: "學校與課程探索",
    academic_readiness: "學業與入學準備",
    language_preparation: "條件性語言準備",
    finance_documents: "資金與文件",
    statements_materials: "陳述與申請資料",
    pre_submission: "遞交前準備",
    admissions_planning: "入學路徑規劃",
    admissions_requirements: "已記錄的入學要求",
    offer_coe_evidence: "已核驗的 Offer 或 CoE 證據",
    external_handoff: "受託服務交接準備",
    visa_planning: "簽證規劃與個人情況",
    study_evidence_coe: "學習證據與 CoE",
    genuine_student_preparation: "Genuine Student 準備",
    financial_capacity: "資金能力",
    conditional_supporting_requirements: "條件性支持要求",
    pre_lodgement: "遞交前檢查",
    lodgement_events: "遞交及後續事件",
  },
  stepDescriptions: {
    ...ZH_HANS.stepDescriptions,
    project_goal:
      "M1 將專案目的標記為未知。此規劃任務會顯示，但 E2 不能確認或儲存目標。",
    workflow_scope:
      "只有實際且已授權讀取的學校、入學或學生簽證記錄才會建立對應流程。沒有已確認專案目標時，缺少記錄不能證明某個流程不需要。",
    source_coverage:
      "對應的 M1 資料來源受限、關閉或暫不可用。這不代表沒有相關記錄。",
    planning:
      "此步驟僅對應目前學校申請。記錄或選定課程並不能證明專案目標或規劃已完成。",
    school_discovery:
      "M1 未獨立核驗已記錄的學校和課程。E2 不會搜尋或認證官方課程。",
    academic_readiness:
      "M1 未提供可證明適用性或完成狀態的目前院校學業要求清單。",
    language_preparation:
      "語言要求取決於目前課程要求；目前 M1 讀取無法確定是否適用。",
    finance_documents:
      "文件信任門和目前要求來源仍受能力開關限制。缺少文件引用不代表文件清單完整。",
    statements_materials:
      "顯示 M1 材料包中繼資料和缺失欄位。生成或可用的材料包仍屬於準備，不代表已遞交。",
    pre_submission:
      "材料包準備就緒不代表已向學校遞交、學校已收件或已獲專業批准。",
    admissions_planning: "此面板對應目前 Admissions Case 及其已記錄路徑。",
    admissions_requirements:
      "僅顯示 M1 返回的要求項目；不代表完整清單或專業簽核。",
    offer_coe_evidence:
      "目前有效、獨立核驗並附有證據的 Offer 或 CoE 可完成此步驟。已核驗的已接受 Offer 僅算作 Admissions 已記錄證據；接受狀態不證明 Offer 目前有效或已有目前 CoE，也不能完成 Student 500 的 CoE 證據步驟。",
    external_handoff:
      "READY 僅表示準備就緒。客戶報告的外部操作不能證明已傳送、已確認或學校已收件。",
    visa_planning:
      "已記錄的 Student 500 情況是使用者提供的準備資料，不代表簽證資格或結果。",
    study_evidence_coe:
      "客戶報告的 Offer/CoE 仍未核驗。完成需有目前且獨立核驗的已關聯 M1 Admissions CoE。",
    genuine_student_preparation:
      "這裡只提供草稿和快照中繼資料。草稿不代表完成、目前法律要求或專業批准。",
    financial_capacity: "此 M1 投影無法確定目前適用的資金規則及個案適用性。",
    conditional_supporting_requirements:
      "只有現有授權來源確認適用後，條件性事項才可確定。",
    pre_lodgement:
      "M1 未提供完整且目前的遞交前清單，也未確定法律上的可遞交狀態。",
    lodgement_events: "M1 沒有政府遞交、收件或後續事件來源。",
  },
  applicability: {
    applicable: "適用於此已記錄事項",
    not_applicable: "根據已記錄條件不適用",
    unknown: "適用性未知",
    unavailable: "無法從現有來源確定",
  },
  progress: {
    not_started: "尚未開始",
    in_progress: "進行中",
    needs_information: "需要補充資料",
    waiting: "等待中",
    blocked: "受阻",
    completed: "有記錄證據證明完成",
    unknown: "進度未知",
  },
  responsibleActorTitle: "目前由誰處理",
  responsibleActor: {
    customer: "您需要提供或確認資訊",
    external_institution: "等待學校或機構處理",
    unknown: "負責人尚未記錄",
  },
  reasons: {
    ...ZH_HANS.reasons,
    project_purpose_not_recorded: "M1 中的專案目的為未知。",
    planning_not_completed: "M1 沒有已確認的專案規劃完成欄位。",
    project_goal_source_not_recorded: "沒有已記錄的專案目標來源。",
    school_application_source_unavailable: "學校申請能力不可用。",
    school_application_records_unavailable: "學校申請記錄不可用。",
    school_admissions_source_unavailable: "Admissions 能力不可用。",
    school_admissions_records_unavailable: "Admissions 記錄不可用。",
    student500_source_unavailable: "Student 500 能力不可用。",
    student500_records_unavailable: "Student 500 記錄不可用。",
    target_archived: "該記錄已封存，不計入正向進度。",
    verified_existing_offer_or_coe_route:
      "記錄了匹配、目前且獨立核驗並附有證據的 Offer 或 CoE。",
    verified_accepted_offer_route:
      "此 School 路徑準確關聯了已核驗的已接受 Offer。它記錄了 Admissions 決定，但不證明目前 Offer 或 CoE 有效，也不構成 Student 500 CoE 證據。",
    school_course_source_unverified: "學校申請來源尚未獨立核驗。",
    school_discovery_completion_not_recorded: "M1 未記錄已核驗課程探索完成。",
    current_school_requirements_unavailable: "M1 中沒有目前院校具體要求。",
    specific_document_requirements_not_in_m1: "M1 未顯示確切適用的文件清單。",
    project_documents_capability_unavailable: "目前能力下無法使用專案文件。",
    school_materials_have_missing_information: "M1 記錄了缺失的學校申請資料。",
    school_package_stale_or_unusable: "目前材料包已過期或不可用。",
    usable_package_is_preparation_not_completion:
      "可用材料包屬於準備，不代表申請完成。",
    school_package_not_recorded: "尚無學校申請材料包記錄。",
    package_does_not_prove_school_submission: "M1 未記錄學校遞交或收件。",
    linked_school_target_unavailable: "無法解析確切關聯的學校申請。",
    admissions_preparation_not_started: "Admissions Case 準備狀態尚未開始。",
    admissions_requirements_not_recorded: "沒有已記錄的 Admissions 要求項目。",
    admissions_requirement_gap_recorded: "M1 記錄了缺失或衝突的要求項目。",
    admissions_requirement_verification_unknown:
      "一個或多個要求項目未知或未核驗。",
    m1_requirement_rows_not_comprehensive_completion_proof:
      "已記錄的要求項目不能證明清單完整。",
    verified_outcome_evidence_recorded:
      "匹配的目前有效結果已獨立核驗、附有證據且未被取代。",
    verified_accepted_offer_evidence_recorded:
      "已接受的 Offer 已獨立核驗、附有證據且未被取代。此項只記錄 Admissions 決定，不證明目前 CoE 有效。",
    offer_coe_not_independently_verified:
      "記錄的 Offer 或 CoE 未獨立核驗或未附證據。",
    offer_coe_outcome_not_current_verified:
      "已記錄的 Offer 或 CoE 歷史中沒有目前且附有證據的獨立核驗結果。",
    offer_coe_evidence_not_recorded: "沒有匹配的 Offer 或 CoE 證據記錄。",
    claimed_exception_not_verified: "例外路徑只是已記錄的聲明，尚未核驗。",
    future_offer_or_coe_not_recorded: "尚無 Offer 或 CoE 結果記錄。",
    self_service_has_no_managed_handoff: "自助服務模式不包含受託服務交接任務。",
    handoff_readiness_does_not_prove_send: "準備就緒不能證明已傳送外部交接。",
    managed_handoff_not_ready: "M1 記錄受託服務交接尚未準備就緒。",
    managed_handoff_status_unknown: "M1 未確定受託服務交接準備狀態。",
    customer_reported_external_action_unverified:
      "外部操作由客戶報告，尚未核驗。",
    route_recorded_customer_context_only: "路徑僅記錄為準備情況。",
    student_context_missing_information: "M1 記錄 Student 500 情況仍缺少資料。",
    student_route_not_recorded: "尚未記錄 Student 500 路徑。",
    student_study_route_and_evidence_unknown:
      "Student 500 路徑或學習證據來源未知。",
    student_preparation_source_unavailable: "Student 500 準備資料不可用。",
    current_independently_verified_coe_recorded:
      "關聯 M1 Admissions 中有目前且獨立核驗並附證據的 CoE。",
    customer_reported_study_evidence_not_verified:
      "Offer 或 CoE 僅由客戶報告，尚未獨立核驗。",
    recorded_study_evidence_target_unavailable:
      "確切關聯的學習證據事項不可用。",
    no_platform_school_dependency_required:
      "M1 記錄的路徑不需要平台內學校申請。",
    study_evidence_not_independently_verified:
      "M1 未記錄目前且獨立核驗的學習證據。",
    student_draft_metadata_recorded_not_complete:
      "存在草稿中繼資料，但不代表已批准或完成。",
    student_drafts_stale: "已記錄的 Student 500 草稿已過期。",
    no_student_draft_recorded_and_applicability_unknown:
      "沒有草稿記錄，且無法確定任務是否適用。",
    current_personal_applicability_not_exposed_by_m1:
      "存在來源快照，但 M1 未提供其對目前個案的適用性。",
    current_legal_source_or_applicability_unavailable:
      "目前法律來源或個案適用性不可用。",
    government_lodgement_and_receipt_not_in_m1: "M1 沒有政府遞交或收件來源。",
  },
  genericReason: "M1 資訊不足，無法確定此任務。",
  selectStep: "選擇步驟以查看目前 M1 資料。",
  panelHeading: "任務與來源詳情",
  progressTitle: "專案工作流程進度",
  targetIdentity: "已授權目標",
  projectStatus: "已記錄的專案狀態",
  projectRevision: "專案版本",
  unknownValue: "未知",
  noStudyContext: "尚未記錄關聯的學習證據情況。",
  fields: {
    institution: "已記錄院校",
    course: "已記錄課程",
    intake: "已記錄入學時間",
    status: "M1 狀態",
    serviceScope: "已記錄服務範圍",
    missingInformation: "已記錄的缺失資訊",
    noRequirements: "尚未記錄要求項目。",
    stale: "已過期",
  },
  stepDetails: "目前步驟",
  sourceRevision: (kind, id, revision) => `${kind} ${id} · 版本 ${revision}`,
  relatedRecords: "已記錄的關聯任務",
  relationshipOnly: "此關聯僅供了解關係，不表示必須按固定順序完成。",
  projectGoalUnknown: "專案目標：M1 尚未記錄。",
  projectScopeUnknown: "在權威專案目標記錄前，整體工作範圍仍未知。",
  recordedProjectRoutes: "已記錄的 Offer/CoE 與 Student 500 路徑",
  noRecordedProjectRoutes:
    "M1 中沒有已記錄的 Offer/CoE 或 Student 500 入口路徑。",
  knownProgress: (done, total) => `已知適用任務完成 ${done} / ${total} 項`,
  compactKnownProgress: (done, total) => `已完成 ${done} / ${total}`,
  unknownApplicability: (count) => `${count} 項任務的適用性未知`,
  unavailableTasks: (count) => `${count} 項任務不可用`,
  notApplicableTasks: (count) => `${count} 項任務不適用`,
  unknownProgressTasks: (count) => `${count} 項任務進度未知`,
  coverage: {
    complete: "已確定所投影任務的覆蓋範圍。",
    partial: "僅顯示部分計數；未知和不可用任務不計入分母。",
    unavailable: "專案任務進度不可用。",
  },
  compactCoverage: {
    complete: "統計範圍已確定",
    partial: "部分統計",
    unavailable: "進度不可用",
  },
  progressBarLabel: "已知適用任務完成情況",
  completionEvidence: "任務狀態由列出的 M1 欄位和規則推導。",
  notEligibility: "這些流程狀態不代表法律資格、申請遞交、專業批准或結果。",
  school: {
    ...ZH_HANS.school,
    section: "學校申請情況",
    sourceStatus: "已記錄來源狀態",
    sourceStatusLabels: {
      unverified_customer_declared: "客戶聲明，未核驗",
      unverified_catalog_match: "目錄匹配，未核驗",
      synthetic_catalog_match: "合成目錄匹配",
    },
    packageState: "材料包狀態",
    missingInformation: (count) => `記錄了 ${count} 項缺失資料。`,
    noRequirements: "此專案狀態檢視未提供目前學校要求。",
    noSubmission: "此處沒有學校遞交或學校收件記錄。",
  },
  admissions: {
    ...ZH_HANS.admissions,
    section: "Admissions Case 情況",
    origin: "記錄的路徑",
    originLabels: {
      school_application: "學校申請",
      existing_offer: "已有 Offer 路徑",
      existing_coe: "已有 CoE 路徑",
      claimed_exception: "聲明的例外，未核驗",
    },
    serviceMode: "服務模式",
    serviceModeLabels: {
      self_service: "自助服務",
      managed_service: "受託服務",
    },
    preparation: "準備狀態",
    requirementStatus: "已記錄要求項目",
    outcomeEvidence: "已記錄的 Offer/CoE 結果",
    noOutcome: "尚無 Offer 或 CoE 結果記錄。",
    handoff: "受託服務交接狀態",
  },
  student: {
    ...ZH_HANS.student,
    section: "學生簽證 500 情況",
    route: "已記錄的進入路徑",
    routeLabels: {
      existing_coe: "報告已有 CoE",
      offer_only: "報告僅有 Offer",
      school_application_in_progress: "學校申請進行中",
      no_school_application: "不需要平台內學校申請",
    },
    coeStatus: "CoE 狀態（客戶報告）",
    coeStatusLabels: {
      reported_held: "報告已持有，未獨立核驗",
      reported_not_held: "報告尚未持有",
      unknown: "未知",
    },
    schoolDependency: "已記錄的學校關聯",
    dependencyLabels: {
      linked: "關聯到確切 M1 記錄",
      not_applicable: "不需要平台內學校申請",
      unknown: "關聯未知",
      unavailable: "關聯記錄不可用",
    },
    sourceVerification: "法律來源核驗狀態",
    schoolContext: "學習證據來源",
    studyEvidenceKind: "學習證據類型",
    studyEvidenceLabels: {
      none: "沒有證據記錄",
      offer_only: "僅 Offer，不是 CoE",
      coe_reported: "報告 CoE，未獨立核驗",
      coe_independently_verified: "CoE 已獨立核驗",
    },
    contextCurrent: "M1 中的關聯學習情況為目前狀態。",
    contextNotCurrent: "關聯學習情況已過期或非目前狀態。",
    independent: "已記錄獨立核驗",
    notIndependent: "未記錄獨立核驗",
    preparation: "準備狀態",
    noStudyContext: "尚未記錄關聯的學習證據情況。",
    drafts: (count) => `${count} 項草稿中繼資料記錄`,
    snapshots: (count) => `${count} 項快照中繼資料記錄`,
    staleArtifacts: "一項或多項準備記錄已過期。",
    legalCurrentness: "快照法律時效",
    currentnessLabels: {
      current: "對已記錄來源版本而言目前",
      superseded: "已被取代",
      unestablished: "尚未確定",
    },
    noGovernmentState: "M1 未記錄政府遞交、收件或簽證結果。",
  },
};

export function getProjectWorkflowCopy(locale: string): ProjectWorkflowCopy {
  if (
    locale === "zh-Hant" ||
    locale.startsWith("zh-Hant-") ||
    locale === "zh-TW"
  ) {
    return ZH_HANT;
  }
  if (locale.startsWith("zh")) {
    return ZH_HANS;
  }
  return EN;
}
