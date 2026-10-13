import {
  getPolicySourceStatusLabel,
  type PolicyEntry,
  type PolicySourceStatus,
  type PublicPolicyProjection,
  projectPublishedPolicies,
} from "./policy-intelligence";
import type {
  PolicyAnalysis,
  PolicyHumanRevisionContent,
} from "./policy-intelligence/contracts";
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

/**
 * Phase 12 Stage 3 — public editorial provenance. Keeps the three publication
 * pathways and the reviewed registry fallback visually distinct:
 * - `automated_verified`: AI analysis published after automated verification.
 * - `lawyer_override`: an authorized lawyer revised and published the content.
 * - `lawyer_authored`: fully human-authored commentary.
 * - `curated_reviewed`: reviewed compatibility fallback content (registry).
 */
export type PolicyEditorialProvenance =
  | "automated_verified"
  | "lawyer_override"
  | "lawyer_authored"
  | "curated_reviewed"
  /**
   * Phase 12 Stage 3 D-072 — a published official-source update whose AI
   * analysis is not available yet. It is neither AI analysis nor lawyer
   * commentary and must be labelled as such.
   */
  | "official_source_update";

export type PublicPolicySourceReference = {
  authority: string;
  title: string;
  url: string;
  date: string | null;
  citation: string | null;
};

export type PublicPolicyProduct = {
  id: string;
  slug: string;
  origin: "automated" | "manual";
  provenance: PolicyEditorialProvenance;
  sourceStatus: PolicySourceStatus;
  source: {
    authority: string;
    /** Official source title. Null when no official source exists. */
    officialTitle: string | null;
    /** Official source URL. Null for lawyer-authored commentary. */
    officialUrl: string | null;
    sourceDate: string | null;
    effectiveDate: string | null;
    jurisdiction: string;
    category: LocalizedValue;
    sourceReferences: PublicPolicySourceReference[];
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
  /** Long-form authored body, when present. */
  body: Record<SiteLocale, string> | null;
  importance: PolicyImportance | null;
  revision: {
    number: number | null;
    generatedAt: string | null;
    publishedAt: string | null;
  };
  aiGenerated: boolean;
  officialExcerpt: { text: string; language: string } | null;
  /**
   * Phase 12 Stage 3 D-072 — true when this is a source-first publication:
   * the official source update is public while the richer AI analysis is
   * pending or unavailable. Nothing has been fabricated to fill the gap.
   */
  analysisPending: boolean;
  lawyerCommentary: Record<SiteLocale, string> | null;
  /** Public author attribution for human-authored/overridden content. */
  publicAttribution: string | null;
  /**
   * Editor-stated dates (author-declared), displayed separately from the
   * platform-observed official snapshot dates. Null when the published content
   * is fully automated.
   */
  editorialDates: {
    officialSourceDate: string | null;
    commencementDate: string | null;
    reviewedAsOfDate: string | null;
  } | null;
  /**
   * True when an authorized Policy Editor approved the current public revision,
   * so newer official updates are captured as pending review rather than
   * silently replacing it.
   */
  humanPublicationProtected: boolean;
  /** A newer official-source version exists and is pending review. */
  newerSourcePendingReview: boolean;
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
  provenance: PolicyEditorialProvenance;
  sourceStatus: PolicySourceStatus;
  source: { sourceDate: string | null; category: LocalizedValue };
  copy: Record<SiteLocale, { title: string; summary: string }>;
  /** D-072: true when this card is an official-source update awaiting analysis. */
  analysisPending: boolean;
};
export type PolicyProductPreviewState = {
  availability: PolicyProductAvailability;
  policies: PublicPolicyProductPreview[];
};

export type LivePolicyRecord = {
  id: string;
  slug: string;
  origin: "automated" | "manual";
  provenance: PolicyEditorialProvenance;
  sourceStatus: PolicySourceStatus;
  source: {
    authority: string;
    officialTitle: string | null;
    officialUrl: string | null;
    sourceDate: string | null;
    effectiveDate: string | null;
    jurisdiction: string;
    category: string;
  };
  analysis: PolicyAnalysis | null;
  humanContent: PolicyHumanRevisionContent | null;
  /**
   * Phase 12 Stage 3 D-072 — source-first publication payload. Present only
   * when the pipeline published the authentic official source without a usable
   * AI analysis; `excerpt` is a bounded slice of the stored official text.
   */
  sourceFirst: {
    reason: string;
    excerpt: string | null;
    /** Display language hint for the verbatim excerpt. */
    excerptLanguage: "zh-CN" | "en";
    advisories: string[];
  } | null;
  revision: {
    id: string;
    number: number;
    generatedAt: string;
    publishedAt: string | null;
  };
  publicAttribution: string | null;
  /** Durable human-publication protection, when an editor approved the item. */
  publicationMode: "automatic" | "human_protected";
  /**
   * Author-stated dates, kept separate from platform-observed official source
   * dates (`source.sourceDate` / `source.effectiveDate`). Null for automated
   * content, which has no human-stated dates.
   */
  editorialDates: {
    officialSourceDate: string | null;
    commencementDate: string | null;
    reviewedAsOfDate: string | null;
  } | null;
  newerSourcePendingReview: boolean;
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
type HumanNarrativeUnit = PolicyHumanRevisionContent["keyChanges"][number];

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

function projectHumanNarrative(item: HumanNarrativeUnit): ProductNarrative {
  return {
    id: item.id,
    text: {
      "zh-CN": item.text["zh-CN"],
      en: item.text.en,
    },
  };
}

function projectHumanNarratives(
  items: readonly HumanNarrativeUnit[]
): ProductNarrative[] {
  return items.map(projectHumanNarrative);
}

function nullableOfficialUrl(value: string | null): string | null {
  if (value === null || value.trim().length === 0) {
    return null;
  }
  return assertOfficialHttpsUrl(value);
}

/**
 * Projects one unified live record (automated, lawyer override or
 * lawyer-authored) into the public product contract. Human content is
 * normalized into the same display sections, but never gains AI metadata:
 * `aiGenerated` stays false and `provenance` carries the true editorial origin.
 */
export function projectLivePolicy(
  record: LivePolicyRecord
): PublicPolicyProduct {
  const category = publicSourceFamily(String(record.source.category));
  const analysis = record.analysis;
  const human = record.humanContent;
  const sourceFirst = record.sourceFirst;
  if (!analysis && !human && !sourceFirst) {
    throw new Error("policy_live_record_content_missing");
  }
  const narratives = sourceFirst
    ? {
        keyChanges: [] as ProductNarrative[],
        affectedGroups: [] as ProductNarrative[],
        practicalImpacts: [] as ProductNarrative[],
        recommendedActions: [] as ProductNarrative[],
        transitionInfo: null,
        uncertainties: [] as ProductNarrative[],
      }
    : analysis
    ? {
        keyChanges: projectNarratives(analysis.keyChanges),
        affectedGroups: projectNarratives(analysis.affectedGroups),
        practicalImpacts: projectNarratives(analysis.practicalImpacts),
        recommendedActions: projectNarratives(analysis.recommendedActions),
        transitionInfo: analysis.transitionInfo
          ? projectNarrative(analysis.transitionInfo)
          : null,
        uncertainties: projectNarratives(analysis.uncertainties),
      }
    : {
        keyChanges: projectHumanNarratives(human?.keyChanges ?? []),
        affectedGroups: projectHumanNarratives(human?.affectedGroups ?? []),
        practicalImpacts: projectHumanNarratives(human?.implications ?? []),
        recommendedActions: projectHumanNarratives(
          human?.recommendedActions ?? []
        ),
        transitionInfo: null,
        uncertainties: [] as ProductNarrative[],
      };
  const copy = sourceFirst
    ? {
        "zh-CN": {
          title: record.source.officialTitle ?? "",
          summary: sourceFirst.excerpt ?? "",
        },
        en: {
          title: record.source.officialTitle ?? "",
          summary: sourceFirst.excerpt ?? "",
        },
      }
    : analysis
    ? {
        "zh-CN": {
          title: analysis.title.text["zh-CN"],
          summary: analysis.executiveSummary.text["zh-CN"],
        },
        en: {
          title: analysis.title.text.en,
          summary: analysis.executiveSummary.text.en,
        },
      }
    : {
        "zh-CN": {
          title: human?.title["zh-CN"] ?? "",
          summary: human?.overview["zh-CN"] ?? "",
        },
        en: {
          title: human?.title.en ?? "",
          summary: human?.overview.en ?? "",
        },
      };
  return {
    id: record.id,
    slug: record.slug,
    origin: record.origin,
    provenance: record.provenance,
    sourceStatus: record.sourceStatus,
    source: {
      authority: record.source.authority,
      officialTitle: record.source.officialTitle,
      officialUrl: nullableOfficialUrl(record.source.officialUrl),
      sourceDate: record.source.sourceDate,
      effectiveDate: record.source.effectiveDate,
      jurisdiction: record.source.jurisdiction,
      category,
      sourceReferences:
        human?.sourceReferences.map((reference) => ({
          authority: reference.authority,
          title: reference.title,
          url: reference.url,
          date: reference.date,
          citation: reference.citation,
        })) ?? [],
    },
    copy,
    analysis: narratives,
    body: human?.body
      ? { "zh-CN": human.body["zh-CN"], en: human.body.en }
      : null,
    importance: analysis ? { ...analysis.importance } : null,
    revision: {
      number: record.revision.number,
      generatedAt: record.revision.generatedAt,
      publishedAt: record.revision.publishedAt,
    },
    aiGenerated: record.provenance === "automated_verified",
    // A source-first excerpt is verbatim official text shown as an excerpt; it
    // is never presented as AI interpretation.
    officialExcerpt:
      sourceFirst?.excerpt && record.source.officialUrl
        ? { text: sourceFirst.excerpt, language: sourceFirst.excerptLanguage }
        : null,
    analysisPending: Boolean(sourceFirst),
    lawyerCommentary: human?.commentary
      ? { "zh-CN": human.commentary["zh-CN"], en: human.commentary.en }
      : null,
    publicAttribution: record.publicAttribution,
    editorialDates: human
      ? {
          officialSourceDate: human.officialSourceDate,
          commencementDate: human.commencementDate,
          reviewedAsOfDate: human.reviewedAsOfDate,
        }
      : null,
    humanPublicationProtected: record.publicationMode === "human_protected",
    newerSourcePendingReview: record.newerSourcePendingReview,
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
    provenance: "curated_reviewed",
    sourceStatus: entry.sourceStatus,
    source: {
      authority: entry.source.authority,
      officialTitle: entry.source.officialTitle,
      officialUrl: assertOfficialHttpsUrl(entry.source.officialUrl),
      sourceDate: entry.source.sourceDate || null,
      effectiveDate: entry.source.effectiveDate ?? null,
      jurisdiction: entry.source.jurisdiction,
      category: { "zh-CN": entry.source.category, en: entry.source.category },
      sourceReferences: [],
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
    body: null,
    importance: null,
    revision: { number: null, generatedAt: null, publishedAt: null },
    aiGenerated: false,
    officialExcerpt: entry.source.officialExcerpt
      ? { ...entry.source.officialExcerpt }
      : null,
    analysisPending: false,
    lawyerCommentary: entry.lawyerCommentary
      ? { ...entry.lawyerCommentary }
      : null,
    publicAttribution: null,
    editorialDates: null,
    humanPublicationProtected: false,
    newerSourcePendingReview: false,
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

/**
 * Phase 12 Stage 3 owner-host correction — durable and compatibility content
 * coexist on the public intelligence page.
 *
 * Durable (database-backed) published policies and the bundled compatibility
 * registry are merged by slug with strict rules:
 * - a durable published revision always wins for a matching slug (precedence);
 * - a slug whose durable item has ever published a revision but is no longer
 *   public (archived/withdrawn/held) is suppressed outright, so an obsolete
 *   bundled compatibility entry can never be resurrected as if it were current;
 * - every other compatibility entry stays visible, before and after the first
 *   durable policy is published, and duplicate slugs never produce two cards.
 */
export type PolicyDurabilityRow = {
  slug: string;
  everPublished: boolean;
};

export async function loadPolicyProductState(input: {
  checkSchema: () => Promise<boolean>;
  readLive: () => Promise<LivePolicyRecord[]>;
  manualEntries: readonly PolicyEntry[];
  /**
   * Durable slug index. Optional so existing callers/tests keep working; when
   * absent only the published list is used to decide precedence.
   */
  readDurability?: () => Promise<readonly PolicyDurabilityRow[]>;
}): Promise<PolicyProductState> {
  if (await input.checkSchema()) {
    const live = (await input.readLive())
      .map(projectLivePolicy)
      .sort(latestPolicyOrder);
    const liveSlugs = new Set(live.map((policy) => policy.slug));
    const durability = input.readDurability ? await input.readDurability() : [];
    const suppressedSlugs = new Set(
      durability
        .filter((row) => row.everPublished && !liveSlugs.has(row.slug))
        .map((row) => row.slug)
    );
    const manualPolicies = projectPublishedPolicies(input.manualEntries)
      .map(projectManualPolicy)
      .filter(
        (policy) =>
          !liveSlugs.has(policy.slug) && !suppressedSlugs.has(policy.slug)
      );
    const policies = [...live, ...dedupeBySlug(manualPolicies, liveSlugs)].sort(
      latestPolicyOrder
    );
    if (!policies.length) {
      return { availability: "LIVE_AVAILABLE_EMPTY", policies: [] };
    }
    return live.length
      ? { availability: "LIVE_AVAILABLE", policies }
      : {
          availability: "LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK",
          policies,
        };
  }
  const policies = dedupeBySlug(
    projectPublishedPolicies(input.manualEntries).map(projectManualPolicy),
    new Set()
  ).sort(latestPolicyOrder);
  return policies.length
    ? { availability: "LIVE_UNAVAILABLE_WITH_MANUAL_FALLBACK", policies }
    : { availability: "LIVE_UNAVAILABLE", policies: [] };
}

/** One public card per slug, even if a source accidentally repeats a slug. */
function dedupeBySlug(
  policies: readonly PublicPolicyProduct[],
  alreadyUsed: ReadonlySet<string>
): PublicPolicyProduct[] {
  const seen = new Set(alreadyUsed);
  const unique: PublicPolicyProduct[] = [];
  for (const policy of policies) {
    if (seen.has(policy.slug)) {
      continue;
    }
    seen.add(policy.slug);
    unique.push(policy);
  }
  return unique;
}

export type PolicyWorkspaceReference = {
  slug: string;
  title: LocalizedValue;
  /** Official source title, or null for lawyer-authored commentary. */
  officialTitle: string | null;
  /** Official source URL, or null for lawyer-authored commentary. */
  officialUrl: string | null;
  /**
   * Phase 12 Stage 2: identity of the published revision this reference was
   * resolved from. `snapshot: true` marks a reference rebuilt from a persisted
   * conversation binding, i.e. the topic the conversation started from rather
   * than the currently published revision.
   */
  revision?: {
    number: number | null;
    publishedAt: string | null;
    sourceStatus: string | null;
    snapshot: boolean;
  } | null;
};

export const POLICY_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;

export function shouldCreatePolicyWorkspaceConversation(input: {
  policyReference: PolicyWorkspaceReference | null;
  launchIntent: string | null;
  chatId: string | null;
}): boolean {
  return Boolean(
    input.policyReference && input.launchIntent === "policy" && !input.chatId
  );
}

export function isPolicyLinkedConversation(
  activeChatId: string | null,
  policyChatId: string | null,
  policyReference: PolicyWorkspaceReference | null
): boolean {
  return Boolean(
    activeChatId &&
      policyChatId &&
      activeChatId === policyChatId &&
      policyReference
  );
}

export function linkedPolicySlugForConversation(
  activeChatId: string | null,
  policyChatId: string | null,
  policyReference: PolicyWorkspaceReference | null
): string | undefined {
  return isPolicyLinkedConversation(activeChatId, policyChatId, policyReference)
    ? policyReference?.slug
    : undefined;
}

export function buildPolicyTopicContext(
  reference: PolicyWorkspaceReference | null
): string | null {
  if (!reference || !POLICY_SLUG_PATTERN.test(reference.slug)) {
    return null;
  }
  // A lawyer-authored commentary entry may legitimately carry no official
  // source URL. That is an honest absence, not a reason to drop the topic; the
  // context explicitly records that no official URL was provided.
  let serializedSourceUrl: string | null = null;
  if (reference.officialUrl) {
    let sourceUrl: URL;
    try {
      sourceUrl = new URL(reference.officialUrl);
    } catch {
      return null;
    }
    if (
      sourceUrl.protocol !== "https:" ||
      sourceUrl.username ||
      sourceUrl.password
    ) {
      return null;
    }
    serializedSourceUrl = sourceUrl.toString();
    if (serializedSourceUrl.length > 500) {
      return null;
    }
  }
  const bounded = (value: string, limit: number) =>
    [...value]
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join("")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, limit);
  const titleZh = bounded(reference.title["zh-CN"], 180);
  const titleEn = bounded(reference.title.en, 180);
  const officialTitle = bounded(
    reference.officialTitle ?? reference.title.en,
    240
  );
  if (!titleZh || !titleEn || !officialTitle) {
    return null;
  }
  return [
    "The user opened a Legal Update to ask about this selected policy. Resolve references such as 'this policy' to the title below. This is a topic hint, not legal evidence; independently verify current sources when answering.",
    `Published policy title (English): ${titleEn}`,
    `Published policy title (Chinese): ${titleZh}`,
    `Official source title: ${officialTitle}`,
    serializedSourceUrl
      ? `Official source URL: ${serializedSourceUrl}`
      : "Official source URL: none provided by the author (lawyer-authored commentary)",
  ].join("\n");
}

export function policyTopicContextEntry(
  reference: PolicyWorkspaceReference | null
): {
  id: string;
  role: "system";
  policy_topic_reference: true;
  text: string;
} | null {
  const text = buildPolicyTopicContext(reference);
  return text
    ? {
        id: "policy-topic-reference",
        role: "system",
        policy_topic_reference: true,
        text,
      }
    : null;
}

export async function resolvePublishedWorkspaceReference(
  slug: string,
  lookup: (slug: string) => Promise<PublicPolicyProduct | null>
): Promise<PolicyWorkspaceReference | null> {
  if (!POLICY_SLUG_PATTERN.test(slug)) {
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
    revision: {
      number:
        typeof policy.revision.number === "number"
          ? policy.revision.number
          : null,
      publishedAt: policy.revision.publishedAt ?? null,
      sourceStatus: policy.sourceStatus ?? null,
      snapshot: false,
    },
  };
}

export function policyWorkspaceHref(slug: string): string {
  if (!POLICY_SLUG_PATTERN.test(slug)) {
    return "/ai-workspace";
  }
  const params = new URLSearchParams({ policy: slug, launch: "policy" });
  return `/ai-workspace?${params.toString()}`;
}

export function workspaceGuestRedirectUrl(
  slug: string | null,
  launchIntent: string | null = "policy",
  chatId: string | null = null
): string {
  if (!slug || !POLICY_SLUG_PATTERN.test(slug)) {
    return "/ai-workspace";
  }
  const params = new URLSearchParams({ policy: slug });
  if (launchIntent === "policy" && !chatId) {
    params.set("launch", "policy");
  }
  if (chatId && /^[0-9a-f-]{36}$/iu.test(chatId)) {
    params.set("chatId", chatId);
  }
  return `/ai-workspace?${params.toString()}`;
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
    snapshotId: string | null;
    editorialStatus: string;
    revisionNumber: number;
    publishedAt: Date | string | null;
  };
  snapshot: { id: string; itemId: string } | null;
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
      (revision.snapshotId === null
        ? snapshot === null
        : snapshot !== null &&
          snapshot.id === revision.snapshotId &&
          snapshot.itemId === item.id)
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
        provenance: policy.provenance,
        sourceStatus: policy.sourceStatus,
        source: {
          sourceDate: policy.source.sourceDate,
          category: { ...policy.source.category },
        },
        copy: {
          "zh-CN": { ...policy.copy["zh-CN"] },
          en: { ...policy.copy.en },
        },
        analysisPending: policy.analysisPending,
      })),
  };
}
