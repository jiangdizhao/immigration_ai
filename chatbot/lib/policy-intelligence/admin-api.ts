import { z } from "zod";
import type {
  AdminPipelineFailureDiagnostic,
  AdminPolicyAnalysisAttempt,
} from "./pipeline-failure-diagnostics";
import type {
  AdminPublicationDiagnostics,
  AdminSourceSyncDiagnostic,
} from "./publication-diagnostics";

export type AdminPolicyIntelligenceSnapshot = {
  sourceUrl: string;
  retrievedAt: string;
  sourceTitle: string;
};

export type AdminPolicyIntelligenceRevision = {
  revisionNumber: number;
  generatedAt: string;
  editorialStatus: string;
};

export type AdminPolicyIntelligenceItem = {
  id: string;
  slug: string;
  title: string | null;
  authority: string | null;
  /** Null for lawyer-authored items that have no crawler source config. */
  sourceConfigId: string | null;
  sourceStatus: string;
  editorialStatus: string;
  publishedAt: string | null;
  updatedAt: string;
  latestSnapshot: AdminPolicyIntelligenceSnapshot | null;
  latestRevision: AdminPolicyIntelligenceRevision | null;
  pipelineFailures: AdminPipelineFailureDiagnostic[];
  analysisAttempts: AdminPolicyAnalysisAttempt[];
  sourceSyncDiagnostic: AdminSourceSyncDiagnostic | null;
  publicationDiagnostics: AdminPublicationDiagnostics;
};

export type AdminPolicyIntelligenceSyncRun = {
  sourceConfigId: string;
  status: "running" | "complete" | "partial" | "failed";
  startedAt: string;
  completedAt: string | null;
  discoveredCount: number;
  snapshottedCount: number;
  unchangedCount: number;
  analyzedCount: number;
  publishedCount: number;
  heldCount: number;
  failureCount: number;
  safeErrorCode: string | null;
  /**
   * Phase 12 Stage 3 D-072 — publication metrics that separate successful
   * automatic releases (full analysis and source-first fallback) from genuine
   * technical holds, plus the recorded non-blocking advisories.
   */
  fullAnalysisPublishedCount: number;
  sourceFirstPublishedCount: number;
  advisoryCount: number;
  advisoryReasons: Array<{ reasonCode: string; count: number }>;
};

export const ADMIN_SYNC_RUNS_PER_SOURCE = 5;
export const ADMIN_SYNC_SOURCE_LIMIT = 20;

export function projectAdminPolicyIntelligenceSyncRun(
  run: AdminPolicyIntelligenceSyncRun
): AdminPolicyIntelligenceSyncRun {
  return {
    sourceConfigId: run.sourceConfigId,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    discoveredCount: run.discoveredCount,
    snapshottedCount: run.snapshottedCount,
    unchangedCount: run.unchangedCount,
    analyzedCount: run.analyzedCount,
    publishedCount: run.publishedCount,
    heldCount: run.heldCount,
    failureCount: run.failureCount,
    safeErrorCode:
      run.safeErrorCode &&
      /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(run.safeErrorCode)
        ? run.safeErrorCode
        : null,
    fullAnalysisPublishedCount: run.fullAnalysisPublishedCount,
    sourceFirstPublishedCount: run.sourceFirstPublishedCount,
    advisoryCount: run.advisoryCount,
    advisoryReasons: run.advisoryReasons
      .filter(
        (entry) =>
          /^[a-z0-9_]{1,100}$/.test(entry.reasonCode) &&
          Number.isInteger(entry.count) &&
          entry.count > 0
      )
      .slice(0, 20),
  };
}

export type AdminPolicyIntelligenceUpdate =
  | {
      status: "updated";
      editorialStatus: "archived" | "published" | "review_required";
    }
  | { status: "not_found" }
  | { status: "not_archived" };

/**
 * Phase 12 Stage 3 owner-host correction — compatibility registry view.
 *
 * The Admin page must show *both* data sources with their storage/provenance:
 * durable database-backed items and the bundled compatibility registry that the
 * public page also lists. Compatibility entries have no database identity, so
 * they are listed separately and can only be brought under normal editorial
 * management through the controlled import action.
 */
export type AdminPolicyCompatibilityDurability =
  | "not_managed"
  | "draft"
  | "published"
  | "withdrawn";

export type AdminCompatibilitySourceEntry = {
  slug: string;
  sourceStatus: string;
  source: {
    authority: string;
    officialTitle: string;
    officialUrl: string;
    sourceDate: string;
    effectiveDate: string | null;
    category: string;
  };
  copy: {
    "zh-CN": { title: string; summary: string };
    en: { title: string; summary: string };
  };
};

export type AdminPolicyCompatibilityEntry = {
  slug: string;
  title: { "zh-CN": string; en: string };
  summary: { "zh-CN": string; en: string };
  authority: string;
  officialTitle: string;
  officialUrl: string;
  sourceDate: string;
  effectiveDate: string | null;
  sourceStatus: string;
  category: string;
  /** Storage label: these entries live in the bundled registry, not the DB. */
  storage: "bundled_registry";
  /** Provenance label: human-compiled reviewed compatibility content. */
  provenance: "curated_reviewed";
  editorialStatus: "published";
  /** Whether a durable item with this slug exists, and in which state. */
  durableState: AdminPolicyCompatibilityDurability;
};

export function projectAdminCompatibilityEntries(input: {
  entries: readonly AdminCompatibilitySourceEntry[];
  durableState: ReadonlyMap<string, AdminPolicyCompatibilityDurability>;
}): AdminPolicyCompatibilityEntry[] {
  return input.entries.map((entry) => ({
    slug: entry.slug,
    title: { "zh-CN": entry.copy["zh-CN"].title, en: entry.copy.en.title },
    summary: {
      "zh-CN": entry.copy["zh-CN"].summary,
      en: entry.copy.en.summary,
    },
    authority: entry.source.authority,
    officialTitle: entry.source.officialTitle,
    officialUrl: entry.source.officialUrl,
    sourceDate: entry.source.sourceDate,
    effectiveDate: entry.source.effectiveDate,
    sourceStatus: entry.sourceStatus,
    category: entry.source.category,
    storage: "bundled_registry",
    provenance: "curated_reviewed",
    editorialStatus: "published",
    durableState: input.durableState.get(entry.slug) ?? "not_managed",
  }));
}

export type AdminPolicyIntelligenceService = {
  listItems(): Promise<AdminPolicyIntelligenceItem[]>;
  listCompatibilityEntries(): Promise<AdminPolicyCompatibilityEntry[]>;
  listSourceSyncRuns(): Promise<AdminPolicyIntelligenceSyncRun[]>;
  updateItem(
    itemId: string,
    action: "archive" | "restore"
  ): Promise<AdminPolicyIntelligenceUpdate>;
};

export type PolicyAdminAuthenticator = () => Promise<
  { userId: string | null } | Response
>;

const itemIdSchema = z.string().uuid();
const actionSchema = z
  .object({
    itemId: itemIdSchema,
    action: z.enum(["archive", "restore"]),
  })
  .strict();

export async function handleAdminPolicyIntelligenceGet({
  requireAdmin,
  service,
}: {
  requireAdmin: PolicyAdminAuthenticator;
  service: Pick<
    AdminPolicyIntelligenceService,
    "listItems" | "listSourceSyncRuns" | "listCompatibilityEntries"
  >;
}): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }
  const [items, sourceSyncRuns, compatibilityEntries] = await Promise.all([
    service.listItems(),
    service.listSourceSyncRuns(),
    service.listCompatibilityEntries(),
  ]);
  return Response.json({
    items,
    sourceSyncRuns: sourceSyncRuns.map(projectAdminPolicyIntelligenceSyncRun),
    compatibilityEntries,
  });
}

/**
 * Legacy Admin update path kept for its existing contract tests. The live
 * Admin page does NOT use this function: `app/api/admin/policy-intelligence`
 * routes archive/restore through the audited editorial handler
 * (`handleAdminPolicyItemAction`), which is the single validation path for the
 * Admin `{ itemId, action }` payload. Do not re-wire the page here without
 * moving the audit semantics with it.
 */
export async function handleAdminPolicyIntelligenceUpdate({
  requireAdmin,
  service,
  request,
}: {
  requireAdmin: PolicyAdminAuthenticator;
  service: Pick<AdminPolicyIntelligenceService, "updateItem">;
  request: Request;
}): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid policy item action." },
      { status: 400 }
    );
  }

  const result = await service.updateItem(
    parsed.data.itemId,
    parsed.data.action
  );
  if (result.status === "not_found") {
    return Response.json({ error: "Policy item not found." }, { status: 404 });
  }
  if (result.status === "not_archived") {
    return Response.json(
      { error: "Only archived policy items can be restored." },
      { status: 409 }
    );
  }
  return Response.json({
    id: parsed.data.itemId,
    editorialStatus: result.editorialStatus,
  });
}
