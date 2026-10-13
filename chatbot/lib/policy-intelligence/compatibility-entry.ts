import type { PolicyEntry } from "../policy-intelligence";
import type { AdminCompatibilitySourceEntry } from "./admin-api";
import {
  POLICY_HUMAN_REVISION_SCHEMA,
  type PolicyHumanRevisionContent,
} from "./contracts";
import {
  type EditorialError,
  editorialError,
  type PolicyEditorialRepository,
} from "./editorial-core";
import {
  isEditorialError,
  type PolicyEditorialService,
} from "./editorial-service";

/**
 * Phase 12 Stage 3 owner-host correction — the pure compatibility-registry
 * bridge.
 *
 * This module deliberately contains no server-only import and no bundled
 * registry import: it takes entries as data, so the mapping and the idempotent
 * import core are directly unit-testable. The server-only wrapper in
 * `compatibility-import.ts` supplies the real bundled entries.
 */

export const COMPATIBILITY_IMPORT_IDEMPOTENCY_PREFIX = "compatibility-import:";

export function compatibilityImportIdempotencyKey(slug: string): string {
  return `${COMPATIBILITY_IMPORT_IDEMPOTENCY_PREFIX}${slug}`.slice(0, 80);
}

/**
 * Honest, non-impersonating attribution for imported compatibility content. It
 * is explicitly a human-compiled summary of official sources, not official
 * text, and it names no government body (the official authority is carried by
 * the source reference instead).
 */
export const COMPATIBILITY_IMPORT_ATTRIBUTION =
  "Platform-compiled compatibility summary of the cited official sources";

export function compatibilityEntryToHumanContent(
  entry: PolicyEntry
): PolicyHumanRevisionContent {
  const zh = entry.copy["zh-CN"];
  const en = entry.copy.en;
  const affectedGroup = zh.affectedGroup ?? en.affectedGroup ?? null;
  const practicalRelevance =
    zh.practicalRelevance ?? en.practicalRelevance ?? null;
  return {
    schemaVersion: POLICY_HUMAN_REVISION_SCHEMA,
    title: { "zh-CN": zh.title, en: en.title },
    overview: { "zh-CN": zh.summary, en: en.summary },
    keyChanges: [],
    affectedGroups: affectedGroup
      ? [
          {
            id: "compatibility-affected-group",
            text: {
              "zh-CN": zh.affectedGroup ?? affectedGroup,
              en: en.affectedGroup ?? affectedGroup,
            },
          },
        ]
      : [],
    implications: practicalRelevance
      ? [
          {
            id: "compatibility-practical-relevance",
            text: {
              "zh-CN": zh.practicalRelevance ?? practicalRelevance,
              en: en.practicalRelevance ?? practicalRelevance,
            },
          },
        ]
      : [],
    recommendedActions: [],
    body: practicalRelevance
      ? {
          "zh-CN": zh.practicalRelevance ?? practicalRelevance,
          en: en.practicalRelevance ?? practicalRelevance,
        }
      : null,
    commentary: null,
    attribution: COMPATIBILITY_IMPORT_ATTRIBUTION,
    sourceStatus: entry.sourceStatus,
    sourceReferences: [
      {
        authority: entry.source.authority,
        title: entry.source.officialTitle,
        url: entry.source.officialUrl,
        date: entry.source.sourceDate || null,
        citation: null,
      },
    ],
    officialSourceDate: entry.source.sourceDate || null,
    commencementDate: entry.source.effectiveDate ?? null,
    reviewedAsOfDate: null,
  };
}

/** The admin-view projection input for one bundled compatibility entry. */
export function toAdminCompatibilitySourceEntry(
  entry: PolicyEntry
): AdminCompatibilitySourceEntry {
  return {
    slug: entry.slug,
    sourceStatus: entry.sourceStatus,
    source: {
      authority: entry.source.authority,
      officialTitle: entry.source.officialTitle,
      officialUrl: entry.source.officialUrl,
      sourceDate: entry.source.sourceDate,
      effectiveDate: entry.source.effectiveDate ?? null,
      category: entry.source.category,
    },
    copy: {
      "zh-CN": {
        title: entry.copy["zh-CN"].title,
        summary: entry.copy["zh-CN"].summary,
      },
      en: { title: entry.copy.en.title, summary: entry.copy.en.summary },
    },
  };
}

export type CompatibilityImportOutcome =
  | {
      status: "ok";
      value: {
        slug: string;
        outcome: "draft_created" | "already_managed";
        itemId: string;
        revisionId: string | null;
      };
    }
  | EditorialError;

/**
 * Idempotent import of one compatibility entry. A durable item already owning
 * the slug is reported as `already_managed` instead of creating a second item
 * (so repeated clicks and retries never duplicate content), and the draft
 * carries a deterministic idempotency key so a retried create resolves to the
 * same revision. Nothing is ever published here.
 */
export async function importCompatibilityEntryForEntry(input: {
  entry: PolicyEntry;
  actorUserId: string;
  service: PolicyEditorialService;
  repository: PolicyEditorialRepository;
}): Promise<CompatibilityImportOutcome> {
  const existing = await input.repository.run(
    async (tx) => await tx.findItemBySlug(input.entry.slug)
  );
  if (existing) {
    return {
      status: "ok",
      value: {
        slug: existing.slug,
        outcome: "already_managed",
        itemId: existing.id,
        revisionId: null,
      },
    };
  }
  const created = await input.service.createManualDraft({
    actorUserId: input.actorUserId,
    slug: input.entry.slug,
    content: compatibilityEntryToHumanContent(input.entry),
    idempotencyKey: compatibilityImportIdempotencyKey(input.entry.slug),
  });
  if (isEditorialError(created)) {
    return created;
  }
  return {
    status: "ok",
    value: {
      slug: created.value.slug,
      outcome: "draft_created",
      itemId: created.value.itemId,
      revisionId: created.value.revisionId,
    },
  };
}

export function compatibilityEntryNotFoundError(): EditorialError {
  return editorialError("item_not_found", "compatibility_entry_not_found");
}
