import {
  getPolicySourceStatusLabel,
  type PolicyEntry,
  type PolicySourceStatus,
  type PublicPolicyProjection,
  projectPublishedPolicies,
} from "./policy-intelligence";
import type { PolicyAnalysis } from "./policy-intelligence/contracts";
import { isCurrentPublishedPolicyRevision } from "./policy-intelligence/currentness";
import type { SiteLocale } from "./site-locale";

export type LocalizedValue = Record<SiteLocale, string>;
export type ProductNarrative = { id: string; text: LocalizedValue };
export type PolicyImportance = {
  serviceRelevance: number;
  immediacy: number;
  proceduralImpact: number;
  affectedPopulation: number;
  legalForce:
    | "legislation"
    | "legislative_instrument"
    | "official_guidance"
    | "tribunal_process"
    | "other";
};
export type PublicPolicyProduct = {
  id: string;
  slug: string;
  origin: "automated" | "manual";
  sourceStatus: PolicySourceStatus;
  source: {
    authority: string;
    officialTitle: string;
    officialUrl: string;
    sourceDate: string | null;
    effectiveDate: string | null;
    jurisdiction: string;
    category: LocalizedValue;
  };
  copy: Record<SiteLocale, { title: string; summary: string }>;
  analysis: {
    keyChanges: ProductNarrative[];
    affectedGroups: ProductNarrative[];
    practicalImpacts: ProductNarrative[];
    recommendedActions: ProductNarrative[];
    transitionInfo: ProductNarrative | null;
    uncertainties: ProductNarrative[];
  };
  importance: PolicyImportance | null;
  revision: {
    number: number | null;
    generatedAt: string | null;
    publishedAt: string | null;
  };
  aiGenerated: boolean;
  officialExcerpt: { text: string; language: string } | null;
  lawyerCommentary: Record<SiteLocale, string> | null;
};

export type PolicyProductAvailability =
  | "LIVE_AVAILABLE"
  | "LIVE_AVAILABLE_EMPTY"
  | "LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK"
  | "LIVE_UNAVAILABLE";
export type PolicyProductState = {
  availability: PolicyProductAvailability;
  policies: PublicPolicyProduct[];
};

export type PublicPolicyProductPreview = {
  id: string;
  slug: string;
  origin: "automated" | "manual";
  sourceStatus: PolicySourceStatus;
  source: { sourceDate: string | null; category: LocalizedValue };
  copy: Record<SiteLocale, { title: string; summary: string }>;
};
export type PolicyProductPreviewState = {
  availability: PolicyProductAvailability;
  policies: PublicPolicyProductPreview[];
};

export type LivePolicyRecord = {
  id: string;
  slug: string;
  sourceStatus: PolicySourceStatus;
  source: {
    authority: string;
    officialTitle: string;
    officialUrl: string;
    sourceDate: string | null;
    effectiveDate: string | null;
    jurisdiction: string;
    category: string;
  };
  analysis: PolicyAnalysis;
  revision: { number: number; generatedAt: string; publishedAt: string | null };
};

const publicSourceFamilies: Record<string, LocalizedValue> = {
  "home-affairs-guidance": {
    "zh-CN": "内政部移民政策指引",
    en: "Department of Home Affairs guidance",
  },
  "federal-register-legislation": {
    "zh-CN": "澳大利亚联邦立法登记册",
    en: "Federal Register of Legislation",
  },
  "art-immigration-review": {
    "zh-CN": "行政复审法庭移民与公民身份审查",
    en: "Administrative Review Tribunal immigration and citizenship reviews",
  },
};
const genericSourceFamily: LocalizedValue = {
  "zh-CN": "澳大利亚政府政策来源",
  en: "Australian Government policy source",
};

export function publicSourceFamily(sourceConfigId: string): LocalizedValue {
  return { ...(publicSourceFamilies[sourceConfigId] ?? genericSourceFamily) };
}

function assertOfficialHttpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("invalid_policy_public_source_url");
  }
  return url.toString();
}

type Stage1NarrativeUnit = PolicyAnalysis["title"];

function projectNarrative(item: Stage1NarrativeUnit): ProductNarrative {
  return {
    id: item.id,
    text: {
      "zh-CN": item.text["zh-CN"],
      en: item.text.en,
    },
  };
}

function projectNarratives(
  items: readonly Stage1NarrativeUnit[]
): ProductNarrative[] {
  return items.map(projectNarrative);
}

export function projectLivePolicy(
  record: LivePolicyRecord
): PublicPolicyProduct {
  const category = publicSourceFamily(String(record.source.category));
  return {
    id: record.id,
    slug: record.slug,
    origin: "automated",
    sourceStatus: record.sourceStatus,
    source: {
      authority: record.source.authority,
      officialTitle: record.source.officialTitle,
      officialUrl: assertOfficialHttpsUrl(record.source.officialUrl),
      sourceDate: record.source.sourceDate,
      effectiveDate: record.source.effectiveDate,
      jurisdiction: record.source.jurisdiction,
      category,
    },
    copy: {
      "zh-CN": {
        title: record.analysis.title.text["zh-CN"],
        summary: record.analysis.executiveSummary.text["zh-CN"],
      },
      en: {
        title: record.analysis.title.text.en,
        summary: record.analysis.executiveSummary.text.en,
      },
    },
    analysis: {
      keyChanges: projectNarratives(record.analysis.keyChanges),
      affectedGroups: projectNarratives(record.analysis.affectedGroups),
      practicalImpacts: projectNarratives(record.analysis.practicalImpacts),
      recommendedActions: projectNarratives(record.analysis.recommendedActions),
      transitionInfo: record.analysis.transitionInfo
        ? projectNarrative(record.analysis.transitionInfo)
        : null,
      uncertainties: projectNarratives(record.analysis.uncertainties),
    },
    importance: { ...record.analysis.importance },
    revision: { ...record.revision },
    aiGenerated: true,
    officialExcerpt: null,
    lawyerCommentary: null,
  };
}

function projectManualPolicy(
  entry: PublicPolicyProjection
): PublicPolicyProduct {
  const copy = {
    "zh-CN": {
      title: entry.copy["zh-CN"].title,
      summary: entry.copy["zh-CN"].summary,
    },
    en: { title: entry.copy.en.title, summary: entry.copy.en.summary },
  };
  const emptySections: ProductNarrative[] = [];
  return {
    id: entry.id,
    slug: entry.slug,
    origin: "manual",
    sourceStatus: entry.sourceStatus,
    source: {
      authority: entry.source.authority,
      officialTitle: entry.source.officialTitle,
      officialUrl: assertOfficialHttpsUrl(entry.source.officialUrl),
      sourceDate: entry.source.sourceDate || null,
      effectiveDate: entry.source.effectiveDate ?? null,
      jurisdiction: entry.source.jurisdiction,
      category: { "zh-CN": entry.source.category, en: entry.source.category },
    },
    copy,
    analysis: {
      keyChanges: emptySections,
      affectedGroups: entry.copy["zh-CN"].affectedGroup
        ? [
            {
              id: "manual-affected-group",
              text: {
                "zh-CN": entry.copy["zh-CN"].affectedGroup,
                en: entry.copy.en.affectedGroup ?? entry.copy.en.summary,
              },
            },
          ]
        : [],
      practicalImpacts: entry.copy["zh-CN"].practicalRelevance
        ? [
            {
              id: "manual-practical-impact",
              text: {
                "zh-CN": entry.copy["zh-CN"].practicalRelevance,
                en: entry.copy.en.practicalRelevance ?? entry.copy.en.summary,
              },
            },
          ]
        : [],
      recommendedActions: emptySections,
      transitionInfo: null,
      uncertainties: emptySections,
    },
    importance: null,
    revision: { number: null, generatedAt: null, publishedAt: null },
    aiGenerated: false,
    officialExcerpt: entry.source.officialExcerpt
      ? { ...entry.source.officialExcerpt }
      : null,
    lawyerCommentary: entry.lawyerCommentary
      ? { ...entry.lawyerCommentary }
      : null,
  };
}

export function latestPolicyOrder(
  left: PublicPolicyProduct,
  right: PublicPolicyProduct
): number {
  const rightDate = right.revision.publishedAt ?? right.source.sourceDate ?? "";
  const leftDate = left.revision.publishedAt ?? left.source.sourceDate ?? "";
  return (
    rightDate.localeCompare(leftDate) ||
    (right.revision.number ?? 0) - (left.revision.number ?? 0) ||
    left.slug.localeCompare(right.slug, "en") ||
    left.id.localeCompare(right.id, "en")
  );
}

export const LEGAL_FORCE_IMPORTANCE_RANK: Record<
  PolicyImportance["legalForce"],
  number
> = {
  legislation: 5,
  legislative_instrument: 4,
  tribunal_process: 3,
  official_guidance: 2,
  other: 1,
};

export function impactPolicyOrder(
  left: PublicPolicyProduct,
  right: PublicPolicyProduct
): number {
  const a = left.importance;
  const b = right.importance;
  if (!a || !b) {
    return a ? -1 : b ? 1 : latestPolicyOrder(left, right);
  }
  return (
    b.serviceRelevance - a.serviceRelevance ||
    b.immediacy - a.immediacy ||
    b.proceduralImpact - a.proceduralImpact ||
    b.affectedPopulation - a.affectedPopulation ||
    LEGAL_FORCE_IMPORTANCE_RANK[b.legalForce] -
      LEGAL_FORCE_IMPORTANCE_RANK[a.legalForce] ||
    latestPolicyOrder(left, right)
  );
}

export type ProductDiffChange = {
  section:
    | "keyChanges"
    | "affectedGroups"
    | "practicalImpacts"
    | "recommendedActions"
    | "transitionInfo"
    | "uncertainties"
    | "sourceStatus";
  unitId: string;
  kind: "added" | "removed" | "changed";
  before: LocalizedValue | null;
  after: LocalizedValue | null;
};

function normalized(value: LocalizedValue): string {
  return `${value["zh-CN"].normalize("NFC").trim().replace(/\s+/gu, " ")}\u0000${value.en.normalize("NFC").trim().replace(/\s+/gu, " ")}`;
}
function indexed(
  items: readonly ProductNarrative[]
): Map<string, LocalizedValue> {
  return new Map(items.map((item) => [item.id, item.text]));
}
function compareSection(
  section: ProductDiffChange["section"],
  before: Map<string, LocalizedValue>,
  after: Map<string, LocalizedValue>
): ProductDiffChange[] {
  const changes: ProductDiffChange[] = [];
  for (const [unitId, afterText] of after) {
    const beforeText = before.get(unitId);
    if (!beforeText) {
      changes.push({
        section,
        unitId,
        kind: "added",
        before: null,
        after: afterText,
      });
    } else if (normalized(beforeText) !== normalized(afterText)) {
      changes.push({
        section,
        unitId,
        kind: "changed",
        before: beforeText,
        after: afterText,
      });
    }
  }
  for (const [unitId, beforeText] of before) {
    if (!after.has(unitId)) {
      changes.push({
        section,
        unitId,
        kind: "removed",
        before: beforeText,
        after: null,
      });
    }
  }
  return changes;
}

export function diffPublishedPolicies(
  current: PublicPolicyProduct,
  previous: PublicPolicyProduct | null,
  maxChanges = 64
): ProductDiffChange[] {
  if (!previous) {
    return [];
  }
  const sections: [
    ProductDiffChange["section"],
    readonly ProductNarrative[],
    readonly ProductNarrative[],
  ][] = [
    ["keyChanges", previous.analysis.keyChanges, current.analysis.keyChanges],
    [
      "affectedGroups",
      previous.analysis.affectedGroups,
      current.analysis.affectedGroups,
    ],
    [
      "practicalImpacts",
      previous.analysis.practicalImpacts,
      current.analysis.practicalImpacts,
    ],
    [
      "recommendedActions",
      previous.analysis.recommendedActions,
      current.analysis.recommendedActions,
    ],
    [
      "transitionInfo",
      previous.analysis.transitionInfo
        ? [previous.analysis.transitionInfo]
        : [],
      current.analysis.transitionInfo ? [current.analysis.transitionInfo] : [],
    ],
    [
      "uncertainties",
      previous.analysis.uncertainties,
      current.analysis.uncertainties,
    ],
    [
      "sourceStatus",
      previous.sourceStatus === current.sourceStatus
        ? []
        : [
            {
              id: "source-status",
              text: {
                "zh-CN": getPolicySourceStatusLabel(
                  previous.sourceStatus,
                  "zh-CN"
                ),
                en: getPolicySourceStatusLabel(previous.sourceStatus, "en"),
              },
            },
          ],
      previous.sourceStatus === current.sourceStatus
        ? []
        : [
            {
              id: "source-status",
              text: {
                "zh-CN": getPolicySourceStatusLabel(
                  current.sourceStatus,
                  "zh-CN"
                ),
                en: getPolicySourceStatusLabel(current.sourceStatus, "en"),
              },
            },
          ],
    ],
  ];
  return sections
    .flatMap(([section, before, after]) =>
      compareSection(section, indexed(before), indexed(after))
    )
    .slice(0, Math.max(0, Math.min(64, maxChanges)));
}

export type PublicPolicyHistoryEntry = {
  revisionNumber: number;
  publishedAt: string | null;
  editorialStatus: "published" | "superseded";
  title: LocalizedValue;
};
export type PublicPolicyDetail = PublicPolicyProduct & {
  history: PublicPolicyHistoryEntry[];
  diff: ProductDiffChange[];
};

export function projectPublicPolicyHistoryEntry(
  policy: PublicPolicyProduct,
  editorialStatus: PublicPolicyHistoryEntry["editorialStatus"]
): PublicPolicyHistoryEntry {
  return {
    revisionNumber: policy.revision.number ?? 0,
    publishedAt: policy.revision.publishedAt,
    editorialStatus,
    title: {
      "zh-CN": policy.copy["zh-CN"].title,
      en: policy.copy.en.title,
    },
  };
}

export async function loadPolicyProductState(input: {
  checkSchema: () => Promise<boolean>;
  readLive: () => Promise<LivePolicyRecord[]>;
  manualEntries: readonly PolicyEntry[];
}): Promise<PolicyProductState> {
  if (await input.checkSchema()) {
    const policies = (await input.readLive())
      .map(projectLivePolicy)
      .sort(latestPolicyOrder);
    return policies.length
      ? { availability: "LIVE_AVAILABLE", policies }
      : { availability: "LIVE_AVAILABLE_EMPTY", policies: [] };
  }
  const policies = projectPublishedPolicies(input.manualEntries)
    .map(projectManualPolicy)
    .sort(latestPolicyOrder);
  return policies.length
    ? { availability: "LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK", policies }
    : { availability: "LIVE_UNAVAILABLE", policies: [] };
}

export type PolicyWorkspaceReference = {
  slug: string;
  title: LocalizedValue;
  officialTitle: string;
  officialUrl: string;
};

export async function resolvePublishedWorkspaceReference(
  slug: string,
  lookup: (slug: string) => Promise<PublicPolicyProduct | null>
): Promise<PolicyWorkspaceReference | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) {
    return null;
  }
  const policy = await lookup(slug);
  if (
    !policy ||
    policy.slug !== slug ||
    (policy.revision.publishedAt === null && policy.origin === "automated")
  ) {
    return null;
  }
  return {
    slug: policy.slug,
    title: { "zh-CN": policy.copy["zh-CN"].title, en: policy.copy.en.title },
    officialTitle: policy.source.officialTitle,
    officialUrl: policy.source.officialUrl,
  };
}

export function policyWorkspaceHref(slug: string): string {
  return `/ai-workspace?policy=${encodeURIComponent(slug)}`;
}

export function workspaceGuestRedirectUrl(slug: string | null): string {
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) {
    return "/ai-workspace";
  }
  return `/ai-workspace?policy=${encodeURIComponent(slug)}`;
}

export type PublicHistoryJoin = {
  item: {
    id: string;
    editorialStatus: string;
    latestSnapshotId: string | null;
    latestPublishedRevisionId: string | null;
  };
  revision: {
    id: string;
    itemId: string;
    snapshotId: string;
    editorialStatus: string;
    revisionNumber: number;
    publishedAt: Date | string | null;
  };
  snapshot: { id: string; itemId: string };
};

export function currentPublicHistoryRows<T extends PublicHistoryJoin>(
  rows: readonly T[],
  limit = 20
): T[] | null {
  const publicRows = rows.filter(
    ({ item, revision, snapshot }) =>
      (revision.editorialStatus === "published" ||
        revision.editorialStatus === "superseded") &&
      revision.publishedAt !== null &&
      revision.itemId === item.id &&
      snapshot.itemId === item.id &&
      snapshot.id === revision.snapshotId
  );
  const current = publicRows.find(({ item, revision, snapshot }) =>
    isCurrentPublishedPolicyRevision({ item, revision, snapshot })
  );
  if (!current) {
    return null;
  }
  const boundedLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  return [...publicRows]
    .sort(
      (left, right) =>
        right.revision.revisionNumber - left.revision.revisionNumber
    )
    .slice(0, boundedLimit);
}

export function boundedPolicyPreview(
  state: PolicyProductState,
  limit = 3
): PolicyProductPreviewState {
  return {
    availability: state.availability,
    policies: [...state.policies]
      .sort(latestPolicyOrder)
      .slice(0, Math.max(0, Math.min(3, limit)))
      .map((policy) => ({
        id: policy.id,
        slug: policy.slug,
        origin: policy.origin,
        sourceStatus: policy.sourceStatus,
        source: {
          sourceDate: policy.source.sourceDate,
          category: { ...policy.source.category },
        },
        copy: {
          "zh-CN": { ...policy.copy["zh-CN"] },
          en: { ...policy.copy.en },
        },
      })),
  };
}
