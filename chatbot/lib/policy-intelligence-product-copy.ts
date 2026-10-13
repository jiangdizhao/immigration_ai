import {
  getPolicySourceStatusLabel,
  type PolicySourceStatus,
} from "./policy-intelligence";
import type { PolicyProductAvailability } from "./policy-intelligence-product";
import type { SiteLocale } from "./site-locale";

/**
 * Phase 12 Stage 3 D-073 — public presentation groups.
 *
 * Every valid public status belongs to exactly one visible group. This is a
 * total function on the status vocabulary: an unmapped future status defaults
 * to `official_update` so an authentic official update can never silently
 * disappear from the product merely because its status is new or unverified.
 */
export type PolicyPresentationGroup =
  | "published"
  | "proposed"
  | "official_update";

export function getPolicyPresentationGroup(
  status: PolicySourceStatus
): PolicyPresentationGroup {
  switch (status) {
    case "in_force":
    case "published_guidance":
    case "announced":
      return "published";
    case "proposed":
    case "consultation":
      return "proposed";
    case "enacted_not_commenced":
    case "superseded":
    case "withdrawn":
    case "unknown":
      return "official_update";
    default:
      // Default publication: keep an unrecognized status visible as an
      // official update (with its own honest status label) instead of hiding it.
      return "official_update";
  }
}

export function getPolicyPresentationGroupLabel(
  group: PolicyPresentationGroup,
  locale: SiteLocale
): string {
  if (group === "published") {
    return locale === "zh-CN" ? "已发布或现行" : "Published or in force";
  }
  if (group === "proposed") {
    return locale === "zh-CN" ? "拟议 / 计划中" : "Proposed / Planned";
  }
  return locale === "zh-CN"
    ? "官方更新（尚未生效或待确认）"
    : "Official updates (not in force or awaiting confirmation)";
}

export function getPolicyPresentationStatusLabel(
  status: PolicySourceStatus,
  locale: SiteLocale
): string {
  const group = getPolicyPresentationGroup(status);
  // The coarse group label is used only when it states the same thing as the
  // status. Official updates always display their exact, honest status
  // (enacted but not commenced, superseded, withdrawn, legal effect not yet
  // verified) rather than a "published" bucket label.
  return group === "official_update"
    ? getPolicySourceStatusLabel(status, locale)
    : getPolicyPresentationGroupLabel(group, locale);
}

const copy = {
  "zh-CN": {
    availability: {
      LIVE_AVAILABLE: "实时政策更新",
      LIVE_AVAILABLE_EMPTY: "实时内容暂为空",
      LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK: "当前显示人工发布的兼容内容",
      LIVE_UNAVAILABLE: "政策情报尚未启用",
    },
    availabilityDescription: {
      LIVE_AVAILABLE:
        "内容来自当前已发布的政策分析及其官方来源记录，并同时显示已审核的兼容内容条目；每条内容都会标注其来源方式。",
      LIVE_AVAILABLE_EMPTY: "实时政策库已启用，目前没有可公开展示的现行内容。",
      LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK:
        "当前没有可公开展示的实时条目；以下显示已审核的兼容内容。",
      LIVE_UNAVAILABLE: "实时政策库尚不可用，且目前没有可展示的兼容内容。",
    },
    liveOrigin: "实时发布",
    manualOrigin: "人工兼容内容",
    provenanceCuratedReviewed: "已审核的兼容内容（人工汇编，非官方原文）",
    provenanceOfficialSourceUpdate: "官方来源更新（AI 解读待补充）",
    analysisPendingLabel: "官方来源更新",
    analysisPendingNotice:
      "这是已核验的官方来源更新。结构化 AI 解读尚未生成或不完整，因此暂不提供解读内容，也不会以解读形式呈现未经核实的说法；法律效力状态仅在可以确认时标注，否则如实显示为待确认。",
    sourceExcerptNotice: "以下文字为官方来源原文摘录，不是 AI 解读。",
    provenanceAutomatedVerified: "AI 生成解读（已核验来源）",
    provenanceLawyerOverride: "经授权律师修订并由律师发布",
    provenanceLawyerAuthored: "由授权律师撰写",
    provenanceLawyerAuthoredNotice:
      "本页面内容由平台授权 Policy Editor 律师撰写，属专业分析与评论，不是官方原文，也不代表政府立场。",
    provenanceLawyerOverrideNotice:
      "本页面内容由授权律师在 AI 分析基础上修订后发布；AI 核验结论可能与律师最终发布内容不一致。",
    newerSourcePendingReview:
      "已获取该官方来源的更新版本，目前正在审核中；本页面内容可能尚未反映最新来源文本，请在采取行动前核对官方来源。",
    humanPublicationProtectedNotice:
      "本页内容由授权律师审定发布。之后获取到的新官方更新会作为待审核版本保留，不会自动替换本页内容。",
    editorialDates: "律师标注日期",
    officialSourceDate: "来源标注日期",
    commencementDate: "生效 / 实施日期",
    commencementDateNotEstablished: "尚未确立生效日期",
    reviewedAsOfDate: "法律复核基准日",
    sourceReferences: "作者提供的官方来源引用",
    authorAttribution: "作者署名",
    noOfficialSource: "作者未提供官方来源链接。",
    manualSummary: "政策摘要",
    aiLabel: "AI 生成的解读",
    bodyContent: "详细内容",
    aiDisclaimer:
      "这是对官方来源的 AI 生成解读，不是官方原文，也不是律师意见。",
    officialSource: "官方来源",
    lawyerCommentary: "律师评论",
    lawyerAbsent: "目前没有已提供的律师评论。",
    notStated: "未注明",
    generatedAt: "分析生成时间",
    publishedAt: "发布时间",
    revision: "版本",
    search: "搜索中英文标题、摘要、来源或类别",
    allSources: "全部来源类别",
    allStatuses: "全部动态分组",
    latest: "最新",
    impact: "影响排序",
    noResults: "没有符合条件的内容",
    sectionSummary: "执行摘要",
    sourceStatus: "公开分组",
    keyChanges: "主要变化",
    affectedGroups: "可能受影响的人群",
    practicalImpacts: "实际影响",
    recommendedActions: "建议的下一步",
    transitionInfo: "过渡安排",
    uncertainties: "适用范围与不确定事项",
    importance: "影响维度",
    serviceRelevance: "服务相关性",
    immediacy: "时间紧迫性",
    proceduralImpact: "程序影响",
    affectedPopulation: "影响范围",
    importanceLevels: {
      serviceRelevance: [
        "关联很低",
        "关联较低",
        "中等关联",
        "关联较高",
        "关联很高",
      ],
      immediacy: [
        "目前不紧迫",
        "紧迫性较低",
        "中等紧迫",
        "时间较紧",
        "时间紧迫",
      ],
      proceduralImpact: [
        "程序影响很有限",
        "程序影响较小",
        "中等程序影响",
        "程序影响较大",
        "程序变化显著",
      ],
      affectedPopulation: [
        "涉及范围较窄",
        "涉及部分群体",
        "涉及多个群体",
        "涉及范围较广",
        "涉及范围广泛",
      ],
    },
    legalForce: "来源类型",
    legalForceNames: {
      legislation: "法规文本",
      legislative_instrument: "立法文书",
      tribunal_process: "审裁程序资料",
      official_guidance: "官方指引",
      other: "其他来源",
    },
    history: "已发布版本记录",
    noHistory: "暂无更早的已发布版本。",
    current: "当前版本",
    previous: "此前版本",
    diff: "与此前已发布版本的结构化变化",
    added: "新增",
    removed: "已移除",
    changed: "已更改",
    askAi: "就这项政策向 AI 提问",
    continuityNotice: "仅用于延续话题；AI 将根据你的问题另行核查来源。",
    workspaceOpener:
      "你已从这项法律或政策动态开始新的咨询。你可以询问它是否与你的情况有关；AI 会在回答时重新核对相关来源。",
    viewDetails: "查看政策简报",
  },
  en: {
    availability: {
      LIVE_AVAILABLE: "Live policy updates",
      LIVE_AVAILABLE_EMPTY: "Live feed is currently empty",
      LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK:
        "Showing manually published compatibility content",
      LIVE_UNAVAILABLE: "Policy Intelligence is not yet activated",
    },
    availabilityDescription: {
      LIVE_AVAILABLE:
        "Content comes from currently published policy analysis and its recorded official source, and reviewed compatibility entries are listed alongside them; every entry states how it was produced.",
      LIVE_AVAILABLE_EMPTY:
        "The live policy store is available, with no current public items.",
      LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK:
        "There are currently no public live items; the reviewed compatibility entries are shown below.",
      LIVE_UNAVAILABLE:
        "The live policy store is unavailable and there is no published compatibility content.",
    },
    liveOrigin: "Live publication",
    manualOrigin: "Manual compatibility content",
    provenanceCuratedReviewed:
      "Reviewed compatibility entry (human-compiled, not official source text)",
    provenanceOfficialSourceUpdate:
      "Official source update (AI analysis pending)",
    analysisPendingLabel: "Official source update",
    analysisPendingNotice:
      "This is a verified official source update. The structured AI analysis is not available yet, so no analysis is shown and no unverified interpretation is presented; the legal-effect status is only stated when it can be verified and is otherwise shown as not yet verified.",
    sourceExcerptNotice:
      "The text below is a verbatim excerpt of the official source, not AI interpretation.",
    provenanceAutomatedVerified: "AI-generated analysis (source-verified)",
    provenanceLawyerOverride: "Revised and published by an authorized lawyer",
    provenanceLawyerAuthored: "Written by an authorized lawyer",
    provenanceLawyerAuthoredNotice:
      "This page is commentary written by an authorized Policy Editor lawyer. It is professional analysis, not official source text, and it does not represent a government position.",
    provenanceLawyerOverrideNotice:
      "This page was published by an authorized lawyer after revising the AI analysis. The AI verification outcome may not match the lawyer's final published content.",
    newerSourcePendingReview:
      "A newer version of this official source has been captured and is pending review. This page may not yet reflect the newest source text; check the official source before acting.",
    humanPublicationProtectedNotice:
      "This page was reviewed and published by an authorized lawyer. Newer official updates are kept as pending review and will not automatically replace this page.",
    editorialDates: "Editor-stated dates",
    officialSourceDate: "Stated source date",
    commencementDate: "Commencement / effective date",
    commencementDateNotEstablished: "No commencement date established",
    reviewedAsOfDate: "Law reviewed as of",
    sourceReferences: "Official references provided by the author",
    authorAttribution: "Attribution",
    noOfficialSource: "No official source link was provided by the author.",
    manualSummary: "Policy summary",
    aiLabel: "AI-generated interpretation",
    bodyContent: "Detailed content",
    aiDisclaimer:
      "This is an AI-generated interpretation of an official source, not official wording or legal advice from a lawyer.",
    officialSource: "Official source",
    lawyerCommentary: "Lawyer commentary",
    lawyerAbsent: "No lawyer commentary has been provided.",
    notStated: "Not stated",
    generatedAt: "Analysis generated",
    publishedAt: "Published",
    revision: "Revision",
    search: "Search bilingual titles, summaries, sources or categories",
    allSources: "All source families",
    allStatuses: "All update groups",
    latest: "Latest",
    impact: "Impact order",
    noResults: "No items match these filters",
    sectionSummary: "Executive summary",
    sourceStatus: "Public group",
    keyChanges: "Key changes",
    affectedGroups: "Potentially affected groups",
    practicalImpacts: "Practical impacts",
    recommendedActions: "Suggested next steps",
    transitionInfo: "Transition information",
    uncertainties: "Scope and uncertainties",
    importance: "Impact dimensions",
    serviceRelevance: "Service relevance",
    immediacy: "Immediacy",
    proceduralImpact: "Procedural impact",
    affectedPopulation: "Affected population",
    importanceLevels: {
      serviceRelevance: [
        "Very limited relevance",
        "Limited relevance",
        "Moderate relevance",
        "High relevance",
        "Very high relevance",
      ],
      immediacy: [
        "Not urgent currently",
        "Lower urgency",
        "Moderate urgency",
        "Time-sensitive",
        "Urgent timing",
      ],
      proceduralImpact: [
        "Very limited procedural effect",
        "Limited procedural effect",
        "Moderate procedural effect",
        "Substantial procedural effect",
        "Significant procedural change",
      ],
      affectedPopulation: [
        "Narrow group",
        "Some groups",
        "Several groups",
        "Broad range",
        "Very broad range",
      ],
    },
    legalForce: "Source type",
    legalForceNames: {
      legislation: "Legislation",
      legislative_instrument: "Legislative instrument",
      tribunal_process: "Tribunal process material",
      official_guidance: "Official guidance",
      other: "Other source",
    },
    history: "Published revision history",
    noHistory: "There are no earlier published revisions.",
    current: "Current revision",
    previous: "Previous revision",
    diff: "Structured changes from the previous published revision",
    added: "Added",
    removed: "Removed",
    changed: "Changed",
    askAi: "Ask AI about this policy",
    continuityNotice:
      "Topic continuity only; AI will research sources for your question independently.",
    workspaceOpener:
      "You started a new consultation from this legal or policy update. Ask how it may relate to your circumstances; the AI will check relevant sources when answering.",
    viewDetails: "View policy brief",
  },
} as const;

export type PolicyProductCopy = (typeof copy)[SiteLocale];
export function getPolicyProductCopy(locale: SiteLocale): PolicyProductCopy {
  return copy[locale];
}
export function getPolicyAvailabilityLabel(
  availability: PolicyProductAvailability,
  locale: SiteLocale
): string {
  return copy[locale].availability[availability];
}

export type PublicImportanceDimension =
  | "serviceRelevance"
  | "immediacy"
  | "proceduralImpact"
  | "affectedPopulation";

export function getPublicImportanceLabel(
  dimension: PublicImportanceDimension,
  value: number,
  locale: SiteLocale
): string {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new RangeError("policy_importance_out_of_range");
  }
  return copy[locale].importanceLevels[dimension][value - 1];
}
