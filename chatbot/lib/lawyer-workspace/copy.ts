import type { SiteLocale } from "@/lib/site-locale";

export function getLawyerWorkspaceStatusLabel(
  status: string,
  locale: SiteLocale | string
): string {
  const chinese = locale !== "en";
  switch (status) {
    case "pending":
      return chinese ? "待处理" : "Pending";
    case "in_review":
      return chinese ? "审核中" : "In review";
    case "needs_more_information":
      return chinese ? "需要补充信息" : "Needs more information";
    case "confirmed":
      return chinese ? "已确认" : "Confirmed";
    case "corrected":
      return chinese ? "已修正" : "Corrected";
    case "closed":
      return chinese ? "已关闭" : "Closed";
    default:
      return chinese ? "暂不可用" : "Unavailable";
  }
}

export function getLawyerWorkspaceBucketLabel(
  bucket: string,
  locale: SiteLocale | string
): string {
  const chinese = locale !== "en";
  switch (bucket) {
    case "needs_action":
      return chinese ? "需要律师处理" : "Needs lawyer action";
    case "waiting_customer":
      return chinese ? "等待客户补充" : "Waiting for customer";
    case "reviewed":
      return chinese ? "已审核" : "Reviewed";
    case "closed":
      return chinese ? "已关闭" : "Closed";
    case "all":
      return chinese ? "全部已分配" : "All assigned";
    default:
      return chinese ? "暂不可用" : "Unavailable";
  }
}

export function getLawyerWorkspaceAssistantLabel(
  mode: string | null,
  locale: SiteLocale | string
): string {
  const chinese = locale !== "en";
  switch (mode) {
    case "default":
      return chinese ? "标准法律核查" : "Legal Check";
    case "premium":
      return chinese ? "高级咨询" : "Premium";
    case "unknown":
      return chinese ? "未知模式" : "Unknown mode";
    case null:
      return chinese ? "暂不可用" : "Unavailable";
    default:
      return chinese ? "暂不可用" : "Unavailable";
  }
}

export function getLawyerWorkspaceRoleLabel(
  role: string,
  locale: SiteLocale | string
): string {
  const chinese = locale !== "en";
  switch (role) {
    case "customer":
      return chinese ? "客户" : "Customer";
    case "lawyer":
      return chinese ? "律师" : "Lawyer";
    case "admin":
      return chinese ? "管理员" : "Administrator";
    default:
      return chinese ? "暂不可用" : "Unavailable";
  }
}

export function getLawyerWorkspaceContextRoleLabel(
  role: string,
  locale: SiteLocale | string
): string {
  const chinese = locale !== "en";
  if (role === "user") {
    return chinese ? "客户" : "Customer";
  }
  if (role === "assistant") {
    return chinese ? "AI 助手" : "AI assistant";
  }
  return chinese ? "暂不可用" : "Unavailable";
}

export function getLawyerWorkspaceActionLabel(
  action: string,
  locale: SiteLocale | string
): string {
  const chinese = locale !== "en";
  if (action === "in_review") {
    return chinese ? "标记为审核中" : "Mark in review";
  }
  if (action === "needs_more_information") {
    return chinese ? "要求补充信息" : "Request more information";
  }
  if (action === "confirmed") {
    return chinese ? "确认" : "Confirm";
  }
  if (action === "corrected") {
    return chinese ? "修正" : "Correct";
  }
  if (action === "closed") {
    return chinese ? "关闭" : "Close";
  }
  return chinese ? "暂不可用" : "Unavailable";
}

export function formatLawyerWorkspaceDate(
  value: string | Date | null | undefined,
  locale: string
): string {
  if (!value) {
    return "—";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  try {
    return date.toLocaleString(locale === "en" ? "en" : "zh-CN");
  } catch {
    return date.toISOString();
  }
}
