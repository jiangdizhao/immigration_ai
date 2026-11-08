import { isProjectConversationStageKey } from "@/lib/projects/stage-keys";
import {
  PROJECT_ARTIFACT_KIND_STATES,
  PROJECT_ARTIFACT_KINDS,
  PROJECT_ARTIFACT_OWNER_VIEWS,
  type ProjectArtifactKind,
  type ProjectArtifactOwnerView,
  type ProjectArtifactReference,
  type ProjectArtifactsSummary,
} from "./project-artifacts";
import {
  type ProjectDocumentsSummary,
  type ProjectStageChatsState,
  type ProjectWorkspaceSummary,
  type SchoolApplicationsSummary,
  type Student500Summary,
  WORKSPACE_CAPABILITY_STATES,
  type WorkspaceCapability,
  type WorkspaceCapabilityState,
} from "./project-workspace-summary";

/**
 * Strict client-side validation of the M9-A summary projection.
 *
 * The workspace refuses an unexpected shape instead of coercing it: an unknown
 * capability state, a missing counter or a `summary` attached to a non-available
 * capability is treated as an unreadable response. That keeps a partial server
 * rollout from being rendered as a confident overview.
 */

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCapabilityState(value: unknown): value is WorkspaceCapabilityState {
  return (
    typeof value === "string" &&
    (WORKSPACE_CAPABILITY_STATES as readonly string[]).includes(value)
  );
}

function countFields<T extends Record<string, number>>(
  value: unknown,
  fields: readonly (keyof T & string)[]
): T | null {
  if (!isRecord(value)) {
    return null;
  }
  const result: Record<string, number> = {};
  for (const field of fields) {
    if (!isCount(value[field])) {
      return null;
    }
    result[field] = value[field];
  }
  return result as T;
}

const SCHOOL_APPLICATION_FIELDS = [
  "total",
  "draft",
  "preparing",
  "packagePrepared",
  "stale",
  "archived",
  "missingInformation",
  "stalePackages",
] as const satisfies readonly (keyof SchoolApplicationsSummary)[];

const STUDENT_500_FIELDS = [
  "total",
  "draft",
  "inProgress",
  "archived",
  "missingFacts",
  "humanReviewRequired",
  "screeningIncomplete",
  "screeningPendingReview",
] as const satisfies readonly (keyof Student500Summary)[];

const DOCUMENT_FIELDS = [
  "total",
  "active",
  "withdrawn",
  "securityPending",
  "securityClean",
  "securityRejected",
  "securityFailed",
  "storagePending",
  "storageStored",
  "storageFailed",
  "cleanupPending",
] as const satisfies readonly (keyof ProjectDocumentsSummary)[];

function parseCapability<T extends Record<string, number>>(
  value: unknown,
  fields: readonly (keyof T & string)[]
): WorkspaceCapability<T> | null {
  if (!isRecord(value) || !isCapabilityState(value.state)) {
    return null;
  }
  if (value.state !== "available") {
    // A blocked capability must not carry numbers: that is how a fabricated
    // progress indicator would appear.
    return value.summary === null
      ? { state: value.state, summary: null }
      : null;
  }
  const summary = countFields<T>(value.summary, fields);
  return summary ? { state: value.state, summary } : null;
}

function parseStageChats(value: unknown): ProjectStageChatsState | null {
  if (
    !isRecord(value) ||
    (value.state !== "available" && value.state !== "unavailable") ||
    !Array.isArray(value.bindings)
  ) {
    return null;
  }
  const bindings: ProjectStageChatsState["bindings"] = [];
  for (const entry of value.bindings) {
    if (
      !isRecord(entry) ||
      !isProjectConversationStageKey(entry.stageKey) ||
      typeof entry.chatId !== "string"
    ) {
      return null;
    }
    bindings.push({ chatId: entry.chatId, stageKey: entry.stageKey });
  }
  return { bindings, state: value.state };
}

function parseArtifacts(value: unknown): ProjectArtifactsSummary | null {
  if (!isRecord(value) || !Array.isArray(value.references)) {
    return null;
  }
  if (typeof value.truncated !== "boolean" || !isRecord(value.kinds)) {
    return null;
  }
  const kinds = {} as ProjectArtifactsSummary["kinds"];
  for (const kind of PROJECT_ARTIFACT_KINDS) {
    const state = value.kinds[kind];
    if (
      typeof state !== "string" ||
      !(PROJECT_ARTIFACT_KIND_STATES as readonly string[]).includes(state)
    ) {
      return null;
    }
    kinds[kind] = state as ProjectArtifactsSummary["kinds"][typeof kind];
  }
  const references: ProjectArtifactReference[] = [];
  for (const entry of value.references) {
    if (
      !isRecord(entry) ||
      !(PROJECT_ARTIFACT_KINDS as readonly string[]).includes(
        entry.kind as string
      ) ||
      typeof entry.referenceId !== "string" ||
      !(entry.version === null || isCount(entry.version)) ||
      !(entry.targetId === null || typeof entry.targetId === "string") ||
      !(entry.status === null || typeof entry.status === "string") ||
      !(entry.digest === null || typeof entry.digest === "string") ||
      !(entry.createdAt === null || typeof entry.createdAt === "string") ||
      typeof entry.stale !== "boolean" ||
      !(PROJECT_ARTIFACT_OWNER_VIEWS as readonly string[]).includes(
        entry.ownerView as string
      )
    ) {
      return null;
    }
    references.push({
      createdAt: entry.createdAt,
      digest: entry.digest,
      kind: entry.kind as ProjectArtifactKind,
      ownerView: entry.ownerView as ProjectArtifactOwnerView,
      referenceId: entry.referenceId,
      stale: entry.stale,
      status: entry.status,
      targetId: entry.targetId,
      version: entry.version,
    });
  }
  return { kinds, references, truncated: value.truncated };
}

export function parseProjectWorkspaceSummary(
  value: unknown
): ProjectWorkspaceSummary | null {
  if (
    !isRecord(value) ||
    typeof value.projectId !== "string" ||
    (value.projectStatus !== "active" && value.projectStatus !== "closed") ||
    !isCount(value.revision)
  ) {
    return null;
  }
  const schoolApplications = parseCapability<SchoolApplicationsSummary>(
    value.schoolApplications,
    SCHOOL_APPLICATION_FIELDS
  );
  const student500 = parseCapability<Student500Summary>(
    value.student500,
    STUDENT_500_FIELDS
  );
  const documents = parseCapability<ProjectDocumentsSummary>(
    value.documents,
    DOCUMENT_FIELDS
  );
  const stageChats = parseStageChats(value.stageChats);
  const artifacts = parseArtifacts(value.artifacts);
  if (
    !(schoolApplications && student500 && documents && stageChats && artifacts)
  ) {
    return null;
  }
  return {
    artifacts,
    documents,
    projectId: value.projectId,
    projectStatus: value.projectStatus,
    revision: value.revision,
    schoolApplications,
    stageChats,
    student500,
  };
}

export type ProjectWorkspaceSummaryResult =
  | { ok: true; summary: ProjectWorkspaceSummary }
  | {
      ok: false;
      state: "request_failed" | "authentication_required" | "unavailable";
    };

/**
 * Loads the overview projection for one Project.
 *
 * The Project id is the only input: the actor, the Project authority and every
 * capability state are resolved server-side, so a tampered client cannot widen what
 * the overview describes.
 */
export async function loadProjectWorkspaceSummary(input: {
  projectId: string;
  fetchImpl?: FetchLike;
}): Promise<ProjectWorkspaceSummaryResult> {
  const fetchImpl: FetchLike =
    input.fetchImpl ?? ((request, init) => fetch(request as string, init));
  let response: Response;
  try {
    response = await fetchImpl(
      `/api/projects/${encodeURIComponent(input.projectId)}/workspace-summary`,
      {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      }
    );
  } catch {
    return { ok: false, state: "request_failed" };
  }
  if (response.status === 401) {
    return { ok: false, state: "authentication_required" };
  }
  if (!response.ok) {
    return { ok: false, state: "unavailable" };
  }
  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    return { ok: false, state: "request_failed" };
  }
  const summary = parseProjectWorkspaceSummary(
    isRecord(body) ? body.summary : null
  );
  return summary
    ? { ok: true, summary }
    : { ok: false, state: "request_failed" };
}
