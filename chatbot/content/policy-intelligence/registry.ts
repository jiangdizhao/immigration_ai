import "server-only";

import type { PolicyEntry } from "@/lib/policy-intelligence";

/**
 * Reviewed production fallback content. These entries are sourced from
 * published Australian Government material and remain separate from the
 * automated ingestion pipeline.
 */
export const MANUAL_POLICY_ENTRIES: readonly PolicyEntry[] = [
  {
    id: "manual-skilled-processing-priorities-2026-09-19",
    slug: "skilled-visa-processing-priorities-2026-09-19",
    sourceStatus: "in_force",
    editorialStatus: "published",
    origin: "manual",
    source: {
      authority: "Department of Home Affairs",
      officialTitle: "Skilled visa processing priorities",
      officialUrl:
        "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-processing-times/visa-processing-priorities/skilled-visa",
      sourceDate: "2026-09-19",
      effectiveDate: "2026-09-19",
      jurisdiction: "Australia",
      category: "Skilled visa processing priorities / 技术签证处理优先顺序",
    },
    copy: {
      "zh-CN": {
        title: "技术签证处理优先顺序自 2026 年 9 月 19 日起更新",
        summary:
          "澳大利亚内政部说明，针对部分技术签证申请的处理优先顺序现由部长指示 121 和 122 规定，两项指示自 2026 年 9 月 19 日起生效，并取代部长指示 119 下的相关处理优先顺序。",
        affectedGroup: "适用于相关临时、临时性及永久技术签证申请人。",
        practicalRelevance:
          "该变化影响相关技术签证申请的处理先后顺序；具体适用范围应以官方页面及相应部长指示为准。",
      },
      en: {
        title: "Skilled visa processing priorities updated from 19 September 2026",
        summary:
          "The Department of Home Affairs states that processing priorities for certain skilled visa applications are now set by Ministerial Directions 121 and 122. Both directions took effect on 19 September 2026 and replaced the relevant priorities under Ministerial Direction 119.",
        affectedGroup:
          "Applicants for the relevant temporary, provisional and permanent skilled visas.",
        practicalRelevance:
          "The change affects the order in which relevant skilled visa applications are processed; the official page and applicable Ministerial Direction remain the source of truth for scope.",
      },
    },
    lawyerCommentary: null,
    discovery: {
      method: "manual-reviewed-official-source",
      discoveredAt: "2026-10-01T00:00:00.000Z",
    },
  },
];
