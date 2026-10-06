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
  sourceConfigId: string;
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
  };
}

export type AdminPolicyIntelligenceUpdate =
  | {
      status: "updated";
      editorialStatus: "archived" | "published" | "review_required";
    }
  | { status: "not_found" }
  | { status: "not_archived" };

export type AdminPolicyIntelligenceService = {
  listItems(): Promise<AdminPolicyIntelligenceItem[]>;
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
    "listItems" | "listSourceSyncRuns"
  >;
}): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }
  const [items, sourceSyncRuns] = await Promise.all([
    service.listItems(),
    service.listSourceSyncRuns(),
  ]);
  return Response.json({
    items,
    sourceSyncRuns: sourceSyncRuns.map(projectAdminPolicyIntelligenceSyncRun),
  });
}

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
