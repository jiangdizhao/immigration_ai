import {
  getPolicySourceStatusLabel,
  type PolicySourceStatus,
} from "./policy-intelligence";
import type { PolicyProductAvailability } from "./policy-intelligence-product";
import type { SiteLocale } from "./site-locale";

export type PolicyPresentationGroup = "published" | "proposed";

export function getPolicyPresentationGroup(
  status: PolicySourceStatus
): PolicyPresentationGroup | null {
  if (status === "in_force" || status === "announced") {
    return "published";
  }
  if (status === "proposed" || status === "consultation") {
    return "proposed";
  }
  return null;
}

export function getPolicyPresentationGroupLabel(
  group: PolicyPresentationGroup,
  locale: SiteLocale
): string {
  return group === "published"
    ? locale === "zh-CN"
      ? "已公布 / 已实施"
      : "Published / In force"
    : locale === "zh-CN"
      ? "拟议 / 计划中"
      : "Proposed / Planned";
}

export function getPolicyPresentationStatusLabel(
  status: PolicySourceStatus,
  locale: SiteLocale
): string {
  const group = getPolicyPresentationGroup(status);
  return group
    ? getPolicyPresentationGroupLabel(group, locale)
    : getPolicySourceStatusLabel(status, locale);
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
      LIVE_AVAILABLE: "内容来自当前已发布的政策分析及其官方来源记录。",
      LIVE_AVAILABLE_EMPTY: "实时政策库已启用，目前没有可公开展示的现行内容。",
      LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK:
        "当前没有可公开展示的实时条目；以下显示已审核的人工发布政策内容。",
      LIVE_UNAVAILABLE: "实时政策库尚不可用，且目前没有已发布的兼容内容。",
    },
    liveOrigin: "实时发布",
    manualOrigin: "人工兼容内容",
    manualSummary: "政策摘要",
    aiLabel: "AI 生成的解读",
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
        "Content comes from currently published policy analysis and its recorded official source.",
      LIVE_AVAILABLE_EMPTY:
        "The live policy store is available, with no current public items.",
      LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK:
        "There are currently no public live items; reviewed manually published policy content is shown below.",
      LIVE_UNAVAILABLE:
        "The live policy store is unavailable and there is no published compatibility content.",
    },
    liveOrigin: "Live publication",
    manualOrigin: "Manual compatibility content",
    manualSummary: "Policy summary",
    aiLabel: "AI-generated interpretation",
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
