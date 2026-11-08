import "server-only";

import { auth } from "@/app/(auth)/auth";
import {
  ProjectFoundationError,
  projectFoundationRepository,
} from "@/lib/db/project-foundation";
import { projectStageChatSchemaAvailable } from "@/lib/db/project-stage-chat-schema-availability";
import { schoolApplicationSchemaAvailable } from "@/lib/db/school-application-schema-availability";
import { student500SchemaAvailable } from "@/lib/db/student-500-schema-availability";
import { listStageChatBindings } from "@/lib/projects/stage-chat-repository";
import { schoolApplicationsEnabled } from "@/lib/school-applications/contracts";
import { schoolApplicationService } from "@/lib/school-applications/runtime";
import { student500ApplicationsEnabled } from "@/lib/student-500/contracts";
import { student500PreparationService } from "@/lib/student-500/preparation/runtime";
import { student500Service } from "@/lib/student-500/runtime";
import { submissionPackagesEnabled } from "@/lib/submission-packages/contracts";
import {
  buildProjectArtifacts,
  type ProjectArtifactsSummary,
  type SchoolApplicationArtifactInput,
  type Student500PreparationArtifactInput,
} from "./project-artifacts";
import {
  summarizeSchoolApplications,
  summarizeStudent500,
} from "./project-workspace-summaries";
import type {
  ProjectDocumentsSummary,
  ProjectWorkspaceSummary,
  WorkspaceCapability,
} from "./project-workspace-summary";

/**
 * Phase 13 M9-A read model.
 *
 * This is a *presentation* composition over the accepted services. It adds no
 * authority of its own:
 *   - the Project is resolved through the M1 repository (`getProjectForActor`), so a
 *     non-member and a foreign Project are indistinguishable;
 *   - School Applications and Student 500 are read through their own services, which
 *     re-authorize the actor and apply their own feature flag and schema probe;
 *   - documents reuse the real M2 gate, which is currently closed because the
 *     production document runtime has no approved adapter, so the honest answer is a
 *     blocked capability rather than an empty list;
 *   - nothing is fetched for a capability that is disabled, restricted or
 *     unreadable, and a failed read is reported as `unavailable` rather than zero.
 */

function failureState(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  if (
    code === "actor_not_eligible" ||
    code === "project_forbidden" ||
    code === "project_not_found"
  ) {
    return "restricted" as const;
  }
  return "unavailable" as const;
}

function blocked<T>(
  state: WorkspaceCapability<T>["state"]
): WorkspaceCapability<T> {
  return { state, summary: null };
}

/**
 * Project documents stay blocked in this environment.
 *
 * `PHASE13_PROJECT_DOCUMENTS_ENABLED` is the ordinary feature flag, but the accepted
 * runtime additionally requires an approved production document adapter
 * (`trustedLiveReadiness`/`application`) that is intentionally `null`. The overview
 * therefore reports "disabled" or "unavailable" and never a document count it could
 * not have read.
 */
function documentsCapability(): WorkspaceCapability<ProjectDocumentsSummary> {
  const featureEnabled =
    process.env.PHASE13_PROJECT_DOCUMENTS_ENABLED?.trim().toLowerCase() ===
    "true";
  return blocked(featureEnabled ? "unavailable" : "disabled");
}

export type WorkspaceSummaryResult =
  | { kind: "ok"; summary: ProjectWorkspaceSummary }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export async function loadWorkspaceSummaryForActor(input: {
  actorUserId: string;
  actorType: "guest" | "regular";
  projectId: string;
}): Promise<WorkspaceSummaryResult> {
  let project: { id: string; status: "active" | "closed"; revision: number };
  try {
    project = await projectFoundationRepository.getProjectForActor({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
    });
  } catch (error) {
    return {
      kind:
        error instanceof ProjectFoundationError ? "not_found" : "unavailable",
    };
  }

  let schoolApplications: WorkspaceCapability<
    ReturnType<typeof summarizeSchoolApplications>
  > = blocked("unavailable");
  let schoolApplicationRows: Awaited<
    ReturnType<typeof schoolApplicationService.list>
  > = [];
  if (!schoolApplicationsEnabled()) {
    schoolApplications = blocked("disabled");
  } else if (input.actorType === "guest") {
    // M5.1 preparation is registered-account private by the accepted contract.
    schoolApplications = blocked("restricted");
  } else {
    try {
      if (await schoolApplicationSchemaAvailable()) {
        schoolApplicationRows = await schoolApplicationService.list({
          actorUserId: input.actorUserId,
          projectId: input.projectId,
        });
        schoolApplications = {
          state: "available",
          summary: summarizeSchoolApplications(schoolApplicationRows),
        };
      }
    } catch (error) {
      schoolApplications = blocked(failureState(error));
    }
  }

  let student500: WorkspaceCapability<ReturnType<typeof summarizeStudent500>> =
    blocked("unavailable");
  let student500Rows: Awaited<ReturnType<typeof student500Service.list>> = [];
  if (!student500ApplicationsEnabled()) {
    student500 = blocked("disabled");
  } else if (input.actorType === "guest") {
    student500 = blocked("restricted");
  } else {
    try {
      if (await student500SchemaAvailable()) {
        student500Rows = await student500Service.list({
          actorUserId: input.actorUserId,
          projectId: input.projectId,
        });
        student500 = {
          state: "available",
          summary: summarizeStudent500(student500Rows),
        };
      }
    } catch (error) {
      student500 = blocked(failureState(error));
    }
  }

  const artifacts = await collectProjectArtifacts({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    schoolApplicationRows,
    schoolApplicationsState: schoolApplications.state,
    student500Rows,
    student500State: student500.state,
  });

  let stageChats: ProjectWorkspaceSummary["stageChats"] = {
    bindings: [],
    state: "unavailable",
  };
  try {
    if (await projectStageChatSchemaAvailable()) {
      const bindings = await listStageChatBindings({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
      });
      stageChats = {
        bindings: bindings.map((binding) => ({
          chatId: binding.chatId,
          stageKey: binding.stageKey,
        })),
        state: "available",
      };
    }
  } catch {
    stageChats = { bindings: [], state: "unavailable" };
  }

  return {
    kind: "ok",
    summary: {
      artifacts,
      documents: documentsCapability(),
      projectId: project.id,
      projectStatus: project.status,
      revision: project.revision,
      schoolApplications,
      stageChats,
      student500,
    },
  };
}

/** Bounded number of Student 500 preparations read for artifact references. */
const MAX_PREPARATION_READS = 5;

function artifactKindState(
  capability: WorkspaceCapability<unknown>["state"]
): "available" | "disabled" | "unavailable" {
  if (capability === "available") {
    return "available";
  }
  return capability === "unavailable" ? "unavailable" : "disabled";
}

/**
 * Metadata-only artifact references.
 *
 * M5.1 rows are already in hand. M6.2 has only id-addressed reads, so a bounded number
 * of non-archived applications is read through its own authorized `get` (which applies
 * present-time redaction); a failure for one application is simply omitted, and if
 every attempt fails the kind is reported unavailable instead of empty.
 */
async function collectProjectArtifacts(input: {
  actorUserId: string;
  projectId: string;
  schoolApplicationRows: readonly {
    applicationId: string;
    archivedAt: string | null;
    status: string;
    packages: readonly {
      packageId: string;
      version: number;
      status: string;
      contentSha256: string;
      createdAt: string;
      usable: boolean;
    }[];
  }[];
  schoolApplicationsState: WorkspaceCapability<unknown>["state"];
  student500Rows: readonly {
    applicationId: string;
    archivedAt: string | null;
    status: string;
  }[];
  student500State: WorkspaceCapability<unknown>["state"];
}): Promise<ProjectArtifactsSummary> {
  const schoolInputs: SchoolApplicationArtifactInput[] =
    input.schoolApplicationRows.map((row) => ({
      applicationId: row.applicationId,
      packages: row.packages.map((pkg) => ({
        contentSha256: pkg.contentSha256,
        createdAt: pkg.createdAt,
        packageId: pkg.packageId,
        status: pkg.status,
        usable: pkg.usable,
        version: pkg.version,
      })),
      status: row.status,
    }));

  let student500State = artifactKindState(input.student500State);
  const student500Inputs: Student500PreparationArtifactInput[] = [];
  if (student500State === "available") {
    const open = input.student500Rows
      .filter((row) => row.status !== "archived" && !row.archivedAt)
      .slice(0, MAX_PREPARATION_READS);
    let failures = 0;
    for (const row of open) {
      try {
        const view = await student500PreparationService.get({
          actorUserId: input.actorUserId,
          applicationId: row.applicationId,
          projectId: input.projectId,
        });
        student500Inputs.push({
          applicationId: row.applicationId,
          drafts: view.drafts.map((draft) => ({
            contentSha256: draft.contentSha256,
            createdAt: draft.createdAt,
            draftId: draft.draftId,
            stale: draft.stale,
            version: draft.version,
          })),
          snapshots: view.snapshots.map((snapshot) => ({
            contentSha256: snapshot.contentSha256,
            createdAt: snapshot.createdAt,
            snapshotId: snapshot.snapshotId,
            stale: snapshot.stale,
            version: snapshot.version,
          })),
        });
      } catch {
        failures += 1;
      }
    }
    if (open.length > 0 && failures === open.length) {
      student500State = "unavailable";
    }
  }

  return buildProjectArtifacts({
    schoolApplicationRows: schoolInputs,
    schoolApplications: artifactKindState(input.schoolApplicationsState),
    student500: student500State,
    student500Rows: student500Inputs,
    submissionPackages: submissionPackagesEnabled()
      ? "unsupported"
      : "disabled",
  });
}

export async function workspaceSummaryResponse(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      { error: "Authentication required." },
      { headers: { "Cache-Control": "private, no-store" }, status: 401 }
    );
  }
  const result = await loadWorkspaceSummaryForActor({
    actorType: session.user.type === "guest" ? "guest" : "regular",
    actorUserId: session.user.id,
    projectId,
  });
  if (result.kind === "ok") {
    return Response.json(
      { summary: result.summary },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  return Response.json(
    {
      error:
        result.kind === "not_found"
          ? "Project not found."
          : "Project workspace is unavailable.",
    },
    {
      headers: { "Cache-Control": "private, no-store" },
      status: result.kind === "not_found" ? 404 : 503,
    }
  );
}
