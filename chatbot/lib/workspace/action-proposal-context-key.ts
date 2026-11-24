import type { WorkflowTaskProjectionV1 } from "./project-workflows";

/**
 * Client-only lifetime key for a proposal preview and its confirmation token.
 * Server-side authorization remains authoritative; this prevents a preview
 * from surviving a visible Chat, target, task, or source-revision change.
 */
export function projectActionProposalContextKey(input: {
  chatId: string | null;
  projectId: string;
  task: WorkflowTaskProjectionV1;
}): string {
  const { chatId, projectId, task } = input;
  return `e3-action:${JSON.stringify([
    projectId,
    chatId,
    task.projectId,
    task.taskId,
    task.workflowKind,
    task.definitionVersion,
    task.stepKey,
    task.targetKind,
    task.targetId,
    task.sourceRevisions.map(({ targetKind, targetId, revision }) => [
      targetKind,
      targetId,
      revision,
    ]),
  ])}`;
}

/**
 * Course workspace state is also bound to the assistant message that produced
 * the current research envelope. A fresh research result for the same task is
 * a new selection scope and invalidates prior previews and verification state.
 */
export function courseResearchWorkspaceContextKey(input: {
  chatId: string | null;
  projectId: string;
  task: WorkflowTaskProjectionV1;
  researchAssistantMessageId: string | null;
}): string {
  return `e3-course-research:${projectActionProposalContextKey(input)}:${
    input.researchAssistantMessageId ?? "no-research-message"
  }`;
}
