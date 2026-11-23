import type { ProjectStateLoadResult } from "@/lib/workspace/project-state-server";
import type { ResolvedProjectContext } from "./context-resolver";
import { buildProjectAssistantContext } from "./project-assistant-context";
import type { ProjectContextPacket } from "./project-context";

/** Loads the M1 view once, then rechecks the persisted Chat and actor authority. */
export async function refreshProjectAssistantContext(input: {
  resolved: ResolvedProjectContext;
  actorUserId: string;
  actorType: "guest" | "regular";
  question?: string;
  loadState: (input: {
    actorUserId: string;
    actorType: "guest" | "regular";
    projectId: string;
  }) => Promise<ProjectStateLoadResult>;
}): Promise<ProjectContextPacket | null> {
  const projectId = input.resolved.projectId;
  if (!projectId) {
    return input.resolved.refreshBeforeProvider();
  }
  const result = await input.loadState({
    actorUserId: input.actorUserId,
    actorType: input.actorType,
    projectId,
  });
  // A missing or unauthorized Project must never be treated as Standalone.
  if (result.kind === "not_found") {
    throw new Error("project_context_unavailable");
  }
  if (result.kind === "ok" && result.state.project.id !== projectId) {
    throw new Error("project_context_unavailable");
  }
  const fresh = await input.resolved.refreshBeforeProvider();
  const assistantContext = buildProjectAssistantContext(
    result.kind === "ok" ? result.state : null,
    "project_state_unavailable",
    input.question
  );
  assistantContext.factContext = {
    state: fresh?.factSourceState ?? "unknown",
    omitted:
      fresh?.factSourceState === "available" ? (fresh.omittedFacts ?? 0) : null,
  };
  return {
    ...(fresh ?? {
      schemaVersion: "phase13.project-context.v1" as const,
      contextOrigin: "project_chat" as const,
      projectId,
      confirmedProjectFacts: [],
      documentEvidence: [],
    }),
    assistantContext,
  };
}
