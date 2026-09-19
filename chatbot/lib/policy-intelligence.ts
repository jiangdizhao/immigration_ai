import type { SiteLocale } from "./site-locale";

export const POLICY_SOURCE_STATUSES = [
  "in_force",
  "announced",
  "proposed",
  "consultation",
  "superseded",
] as const;

export type PolicySourceStatus = (typeof POLICY_SOURCE_STATUSES)[number];

export const POLICY_EDITORIAL_STATUSES = [
  "draft",
  "review_required",
  "published",
  "archived",
] as const;

export type PolicyEditorialStatus = (typeof POLICY_EDITORIAL_STATUSES)[number];

export type PolicyOrigin = "manual" | "automated";

export type LocalizedPolicyCopy = {
  title: string;
  summary: string;
  affectedGroup?: string;
  practicalRelevance?: string;
  aiAnalysis?: string;
};

export type PolicySourceIdentity = {
  authority: string;
  officialTitle: string;
  officialUrl: string;
  sourceDate: string;
  effectiveDate?: string | null;
  jurisdiction: string;
  category: string;
  /**
   * Verbatim source text. Any future translated rendering must use a separate
   * explicitly labelled field and must never be stored in localized copy.
   */
  officialExcerpt?: {
    text: string;
    language: string;
  };
};

export type PolicyEntry = {
  id: string;
  slug: string;
  sourceStatus: PolicySourceStatus;
  editorialStatus: PolicyEditorialStatus;
  origin: PolicyOrigin;
  source: PolicySourceIdentity;
  copy: Record<SiteLocale, LocalizedPolicyCopy>;
  lawyerCommentary?: Record<SiteLocale, string> | null;
  discovery?: {
    method: string;
    discoveredAt?: string;
  } | null;
};

/**
 * Production is intentionally empty until a real source has been manually
 * reviewed and published. Test fixtures belong in policy-intelligence.test.ts.
 */
export const MANUAL_POLICY_ENTRIES: readonly PolicyEntry[] = [];

const sourceStatusLabels: Record<
  SiteLocale,
  Record<PolicySourceStatus, string>
> = {
  "zh-CN": {
    in_force: "现行",
    announced: "已公布",
    proposed: "拟议",
    consultation: "咨询中",
    superseded: "已被取代",
  },
  en: {
    in_force: "In force",
    announced: "Announced",
    proposed: "Proposed",
    consultation: "Consultation",
    superseded: "Superseded",
  },
};

const editorialStatusLabels: Record<
  SiteLocale,
  Record<PolicyEditorialStatus, string>
> = {
  "zh-CN": {
    draft: "草稿",
    review_required: "待核验",
    published: "已发布",
    archived: "已归档",
  },
  en: {
    draft: "Draft",
    review_required: "Review required",
    published: "Published",
    archived: "Archived",
  },
};

export function getPolicySourceStatusLabel(
  status: PolicySourceStatus,
  locale: SiteLocale
) {
  return sourceStatusLabels[locale][status];
}

export function getPolicyEditorialStatusLabel(
  status: PolicyEditorialStatus,
  locale: SiteLocale
) {
  return editorialStatusLabels[locale][status];
}

export function formatPolicyDate(date: string, locale: SiteLocale): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function validatePolicyEntries(entries: readonly PolicyEntry[]): void {
  const ids = new Set<string>();
  const slugs = new Set<string>();

  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate policy id: ${entry.id}`);
    }
    if (slugs.has(entry.slug)) {
      throw new Error(`Duplicate policy slug: ${entry.slug}`);
    }
    ids.add(entry.id);
    slugs.add(entry.slug);

    if (entry.editorialStatus === "published") {
      const requiredSourceFields = [
        entry.source.authority,
        entry.source.officialTitle,
        entry.source.officialUrl,
        entry.source.sourceDate,
        entry.source.jurisdiction,
        entry.source.category,
      ];
      if (requiredSourceFields.some((value) => value.trim().length === 0)) {
        throw new Error(
          `Published policy is missing source metadata: ${entry.id}`
        );
      }
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.source.sourceDate) ||
        !entry.source.officialUrl.startsWith("https://")
      ) {
        throw new Error(
          `Published policy has invalid source metadata: ${entry.id}`
        );
      }
      for (const locale of ["zh-CN", "en"] as const) {
        if (
          entry.copy[locale].title.trim().length === 0 ||
          entry.copy[locale].summary.trim().length === 0
        ) {
          throw new Error(
            `Published policy is missing ${locale} copy: ${entry.id}`
          );
        }
      }
    }
  }
}

validatePolicyEntries(MANUAL_POLICY_ENTRIES);

export function getPublishedPolicies(
  entries: readonly PolicyEntry[] = MANUAL_POLICY_ENTRIES
): PolicyEntry[] {
  validatePolicyEntries(entries);

  return entries
    .filter((entry) => entry.editorialStatus === "published")
    .slice()
    .sort((left, right) => {
      const dateOrder = right.source.sourceDate.localeCompare(
        left.source.sourceDate
      );
      return dateOrder || left.slug.localeCompare(right.slug, "en");
    });
}

export function getPublishedPolicyBySlug(
  slug: string,
  entries: readonly PolicyEntry[] = MANUAL_POLICY_ENTRIES
): PolicyEntry | null {
  return (
    getPublishedPolicies(entries).find((entry) => entry.slug === slug) ?? null
  );
}
