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
  {
    id: "manual-student-visa-onshore-preclusion-2026-09-24",
    slug: "student-visa-onshore-preclusion-lin-26-068",
    sourceStatus: "in_force",
    editorialStatus: "published",
    origin: "manual",
    source: {
      authority: "Federal Register of Legislation",
      officialTitle:
        "Migration (Visas that Preclude a Person from Lodging a Student Visa Application in Australia) Instrument 2026",
      officialUrl: "https://www.legislation.gov.au/F2026L01282/asmade",
      sourceDate: "2026-09-24",
      effectiveDate: "2026-09-25",
      jurisdiction: "Australia",
      category: "Student visa eligibility / 学生签证境内递交限制",
    },
    copy: {
      "zh-CN": {
        title: "LIN 26/068：更新境内递交学生签证时受限制的临时签证类别",
        summary:
          "该 2026 年立法文书依据 Migration Regulations 1994 指定一组 substantive temporary visas；相关持有人在澳大利亚境内递交 Student visa 申请时会受到 Schedule 1 item 1222 的限制。文书列明的类别包括 485、600、601、602、651、771、988 等，并取代 2016 年旧文书。",
        affectedGroup:
          "目前持有该文书列明临时签证，并计划在澳大利亚境内递交 Subclass 500 Student visa 的人员。",
        practicalRelevance:
          "在准备境内学生签证申请前，应先核对当前所持签证是否属于 LIN 26/068 列明范围，并结合 Migration Regulations 1994 的现行条款确认是否能够在境内有效递交。",
      },
      en: {
        title:
          "LIN 26/068 updates temporary visas that preclude an onshore Student visa application",
        summary:
          "This 2026 instrument specifies substantive temporary visas for the purposes of Schedule 1 item 1222 of the Migration Regulations 1994. The listed subclasses include 485, 600, 601, 602, 651, 771 and 988, among others, and the instrument repeals the previous 2016 specification.",
        affectedGroup:
          "People in Australia holding a visa specified by the instrument who are considering an onshore Subclass 500 Student visa application.",
        practicalRelevance:
          "Before lodging onshore, applicants should check whether their current visa falls within LIN 26/068 and confirm the current operation of item 1222 of Schedule 1 to the Migration Regulations 1994.",
      },
    },
    lawyerCommentary: null,
    discovery: {
      method: "manual-reviewed-official-source",
      discoveredAt: "2026-10-01T00:00:00.000Z",
    },
  },
  {
    id: "manual-evisitor-arrangements-2026-09-28",
    slug: "evisitor-application-arrangements-lin-26-061",
    sourceStatus: "in_force",
    editorialStatus: "published",
    origin: "manual",
    source: {
      authority: "Federal Register of Legislation",
      officialTitle:
        "Migration (Arrangements for eVisitor Visa Applications) Instrument 2026",
      officialUrl: "https://www.legislation.gov.au/F2026L01306/asmade",
      sourceDate: "2026-09-28",
      effectiveDate: "2026-09-29",
      jurisdiction: "Australia",
      category: "eVisitor application arrangements / eVisitor 申请安排",
    },
    copy: {
      "zh-CN": {
        title: "LIN 26/061：Subclass 651 eVisitor 申请安排更新",
        summary:
          "该立法文书规定 Subclass 651 eVisitor 申请使用 Form 1362 (Internet)，并要求以 internet application 方式递交；同时废止 2016 年旧版 eVisitor 申请安排文书。",
        affectedGroup:
          "计划申请 Subclass 651 eVisitor visa 的申请人。",
        practicalRelevance:
          "申请人应按照现行线上申请安排递交 Subclass 651 申请，并以 Federal Register 上的现行文书核对正式要求。",
      },
      en: {
        title: "LIN 26/061 updates Subclass 651 eVisitor application arrangements",
        summary:
          "The instrument specifies Form 1362 (Internet) for a Subclass 651 eVisitor application and requires the application to be made as an internet application. It also repeals the previous 2016 eVisitor arrangements instrument.",
        affectedGroup:
          "Applicants seeking a Subclass 651 eVisitor visa.",
        practicalRelevance:
          "Applicants should follow the current online application arrangement and check the in-force Federal Register instrument when lodging.",
      },
    },
    lawyerCommentary: null,
    discovery: {
      method: "manual-reviewed-official-source",
      discoveredAt: "2026-10-01T00:00:00.000Z",
    },
  },
  {
    id: "manual-health-specified-countries-2026-09-28",
    slug: "migration-health-specified-countries-lin-26-090",
    sourceStatus: "in_force",
    editorialStatus: "published",
    origin: "manual",
    source: {
      authority: "Federal Register of Legislation",
      officialTitle:
        "Migration (Health Criteria—Specified Countries) Instrument 2026",
      officialUrl: "https://www.legislation.gov.au/F2026L01315/asmade",
      sourceDate: "2026-09-28",
      effectiveDate: "2026-09-29",
      jurisdiction: "Australia",
      category: "Migration health criteria / 移民健康标准",
    },
    copy: {
      "zh-CN": {
        title: "LIN 26/090：移民健康标准中的 specified countries 清单更新",
        summary:
          "该立法文书依据 Migration Regulations 1994 第 2.25A(1)(b) 款指定国家清单，并适用于文书生效后递交的签证申请，以及在生效前已经递交但尚未最终决定的申请。",
        affectedGroup:
          "其签证申请健康标准评估涉及 regulation 2.25A 指定国家规则的申请人。",
        practicalRelevance:
          "对于健康要求仍在评估中的新申请和未最终决定申请，应核对 LIN 26/090 的现行指定国家清单及其适用条款。",
      },
      en: {
        title: "LIN 26/090 updates specified countries for migration health criteria",
        summary:
          "The instrument specifies countries for subparagraph 2.25A(1)(b) of the Migration Regulations 1994. It applies to visa applications made on or after commencement and to applications made earlier that had not been finally determined before commencement.",
        affectedGroup:
          "Visa applicants whose health-criteria assessment engages the specified-country rules under regulation 2.25A.",
        practicalRelevance:
          "For new and undecided applications where these health rules are relevant, the current LIN 26/090 country list and application provisions should be checked.",
      },
    },
    lawyerCommentary: null,
    discovery: {
      method: "manual-reviewed-official-source",
      discoveredAt: "2026-10-01T00:00:00.000Z",
    },
  }
];
