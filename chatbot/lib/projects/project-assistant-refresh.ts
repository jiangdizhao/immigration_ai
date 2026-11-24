import {
  type ActiveStepSelectionV1,
  resolveActiveStepContext,
} from "@/lib/workspace/active-step-context";
import type { ProjectStateLoadResult } from "@/lib/workspace/project-state-server";
import type { ResolvedProjectContext } from "./context-resolver";
import {
  buildProjectAssistantContext,
  PROJECT_ASSISTANT_CONTEXT_MAX_BYTES,
} from "./project-assistant-context";
import type { ProjectContextPacket } from "./project-context";

/** Loads the M1 view once, then rechecks the persisted Chat and actor authority. */
export async function refreshProjectAssistantContext(input: {
  resolved: ResolvedProjectContext;
  actorUserId: string;
  actorType: "guest" | "regular";
  chatId?: string;
  question?: string;
  activeStepSelection?: ActiveStepSelectionV1 | null;
  loadState: (input: {
    actorUserId: string;
    actorType: "guest" | "regular";
    projectId: string;
  }) => Promise<ProjectStateLoadResult>;
}): Promise<ProjectContextPacket | null> {
  const projectId = input.resolved.projectId;
  if (!projectId) {
    if (input.activeStepSelection) {
      throw new Error("active_step_selection_invalid");
    }
    return input.resolved.refreshBeforeProvider();
  }
  if (input.activeStepSelection && !input.chatId) {
    throw new Error("active_step_selection_invalid");
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
  const activeStep = resolveActiveStepContext({
    state: result.kind === "ok" ? result.state : null,
    chatId: input.chatId ?? "",
    projectId,
    selection: input.activeStepSelection,
  });
  const fresh = await input.resolved.refreshBeforeProvider();
  const activeStepBytes = activeStep
    ? new TextEncoder().encode(JSON.stringify(activeStep)).byteLength + 16
    : 0;
  const assistantContext = buildProjectAssistantContext(
    result.kind === "ok" ? result.state : null,
    "project_state_unavailable",
    input.question,
    PROJECT_ASSISTANT_CONTEXT_MAX_BYTES - activeStepBytes
  );
  assistantContext.activeStep = activeStep;
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
