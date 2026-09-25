import type { SiteLocale } from "@/lib/site-locale";
import { normalizeSiteLocale } from "@/lib/site-locale";

export type LawyerWorkspacePageCopy = {
  staffService: string;
  workspaceTitle: string;
  workspaceSubtitle: string;
  backToWorkspace: string;
  assignedRequest: string;
  statusLabel: string;
};

export function getLawyerWorkspacePageCopy(
  locale: SiteLocale | string | null | undefined
): LawyerWorkspacePageCopy {
  const normalized = normalizeSiteLocale(locale);
  if (normalized === "en") {
    return {
      staffService: "Staff service",
      workspaceTitle: "Lawyer workspace",
      workspaceSubtitle:
        "Review only the requests assigned to you. Each request carries its captured handoff.",
      backToWorkspace: "Back to lawyer workspace",
      assignedRequest: "Assigned request",
      statusLabel: "Status",
    };
  }
  return {
    staffService: "律师服务",
    workspaceTitle: "律师工作台",
    workspaceSubtitle:
      "仅处理已分配给您的请求，每个请求都附带已捕获的交接信息。",
    backToWorkspace: "返回律师工作台",
    assignedRequest: "已分配请求",
    statusLabel: "状态",
  };
}
