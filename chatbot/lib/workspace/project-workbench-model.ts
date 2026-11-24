import type { ProjectJourney, ProjectJourneyNode } from "./project-journey";
import type { ActiveStepSelectionV1 } from "./active-step-context";
import {
  defaultWorkflowTaskForTarget,
  projectGoalTask,
  projectWorkflowTaskById,
  type WorkflowTaskProjectionV1,
} from "./project-workflows";

export type ProjectWorkbenchPanelKind =
  | "none"
  | "school_application"
  | "admissions"
  | "student500"
  | "recorded_route"
  | "unavailable";

export type ProjectWorkbenchTargetGroup =
  | "schools"
  | "independent_admissions"
  | "student500";

export type ProjectWorkbenchEffectiveTask =
  | {
      status: "available";
      selection: "explicit" | "default";
      task: WorkflowTaskProjectionV1;
    }
  | {
      status: "unavailable";
      reason:
        | "selected_task_missing"
        | "selected_task_selection_missing"
        | "selected_task_stale"
        | "selected_task_target_mismatch"
        | "selected_target_missing"
        | "default_task_missing";
    };

export function projectWorkbenchDefaultTargetId(
  journey: ProjectJourney
): string | null {
  return (
    journey.nodes.find((node) => node.kind !== "route_entry")?.id ??
    journey.nodes[0]?.id ??
    null
  );
}

export function reconcileProjectWorkbenchTarget(
  selectedNodeId: string | null,
  journey: ProjectJourney,
  preserveProjectSelection = false
): string | null {
  if (selectedNodeId === null && preserveProjectSelection) {
    return null;
  }
  if (
    selectedNodeId &&
    journey.nodes.some((node) => node.id === selectedNodeId)
  ) {
    return selectedNodeId;
  }
  return projectWorkbenchDefaultTargetId(journey);
}

export function projectWorkbenchNodeById(
  journey: ProjectJourney | null,
  nodeId: string | null
): ProjectJourneyNode | null {
  if (!journey || !nodeId) {
    return null;
  }
  return journey.nodes.find((node) => node.id === nodeId) ?? null;
}

export function projectWorkbenchPanelKind(
  journey: ProjectJourney | null,
  node: ProjectJourneyNode | null,
  expectedProjectId: string
): ProjectWorkbenchPanelKind {
  if (!journey || journey.project.id !== expectedProjectId) {
    return "unavailable";
  }
  if (!node) {
    return "none";
  }
  if (!journey.nodes.some((candidate) => candidate.id === node.id)) {
    return "unavailable";
  }
  if (node.kind === "route_entry") {
    return "recorded_route";
  }
  if (node.kind === "school_application") {
    return "school_application";
  }
  if (node.kind === "admission_case") {
    return "admissions";
  }
  if (node.kind === "student500_application") {
    return "student500";
  }
  return "unavailable";
}

export function projectWorkbenchTargetGroupForNode(
  node: ProjectJourneyNode
): ProjectWorkbenchTargetGroup {
  if (node.kind === "school_application") {
    return "schools";
  }
  if (node.kind === "admission_case") {
    return "independent_admissions";
  }
  if (node.kind === "student500_application") {
    return "student500";
  }
  const parent = node.route?.parentNodeId ?? "";
  return parent.startsWith("school:")
    ? "schools"
    : parent.startsWith("admissions:")
      ? "independent_admissions"
      : "student500";
}

export function linkedAdmissionsNodeIds(journey: ProjectJourney): Set<string> {
  return new Set(
    journey.edges
      .filter((edge) => edge.kind === "school_admissions_link")
      .map((edge) => edge.toNodeId)
  );
}

export function recordedRoutesForTarget(
  journey: ProjectJourney,
  nodeId: string
): ProjectJourneyNode[] {
  return journey.nodes.filter(
    (node) => node.kind === "route_entry" && node.route?.parentNodeId === nodeId
  );
}

export function projectWorkbenchNodeIdForWorkflowTask(
  journey: ProjectJourney,
  task: WorkflowTaskProjectionV1
): string | null {
  if (task.targetKind === "project") {
    return null;
  }
  return (
    journey.nodes.find(
      (node) =>
        node.kind !== "route_entry" &&
        node.targetKind === task.targetKind &&
        node.targetId === task.targetId
    )?.id ?? null
  );
}

export function projectWorkbenchSelectionForWorkflowTask(
  journey: ProjectJourney,
  taskId: string
): { taskId: string; targetNodeId: string | null } | null {
  const task = projectWorkflowTaskById(
    journey.workflowProjection?.tasks ?? [],
    taskId
  );
  if (!task || task.projectId !== journey.project.id) {
    return null;
  }
  const targetNodeId = projectWorkbenchNodeIdForWorkflowTask(journey, task);
  if (task.targetKind !== "project" && !targetNodeId) {
    return null;
  }
  return { taskId: task.taskId, targetNodeId };
}

/**
 * Resolve one effective task for the selected Project target. An explicit
 * selection is never replaced by a different task when it becomes stale or
 * belongs to another target. With no explicit task, retain the Workbench's
 * established target-specific default.
 */
export function projectWorkbenchEffectiveTask(input: {
  journey: ProjectJourney;
  selectedNodeId: string | null;
  selectedTaskId: string | null;
  selectedTaskSelection: ActiveStepSelectionV1 | null;
}): ProjectWorkbenchEffectiveTask {
  const {
    journey,
    selectedNodeId,
    selectedTaskId,
    selectedTaskSelection,
  } = input;
  const selectedNode = projectWorkbenchNodeById(journey, selectedNodeId);
  if (selectedNodeId !== null && !selectedNode) {
    return { status: "unavailable", reason: "selected_target_missing" };
  }

  if (selectedTaskId !== null) {
    const selectedTask = projectWorkflowTaskById(
      journey.workflowProjection.tasks,
      selectedTaskId
    );
    if (!selectedTask || selectedTask.projectId !== journey.project.id) {
      return { status: "unavailable", reason: "selected_task_missing" };
    }
    if (!selectedTaskSelection) {
      return {
        status: "unavailable",
        reason: "selected_task_selection_missing",
      };
    }
    const revisionsMatch =
      selectedTask.sourceRevisions.length ===
        selectedTaskSelection.sourceRevisions.length &&
      selectedTask.sourceRevisions.every((revision, index) => {
        const selectedRevision = selectedTaskSelection.sourceRevisions[index];
        return Boolean(
          selectedRevision &&
            selectedRevision.targetKind === revision.targetKind &&
            selectedRevision.targetId === revision.targetId &&
            selectedRevision.revision === revision.revision
        );
      });
    const selectionMatchesTask =
      selectedTaskSelection.projectId === selectedTask.projectId &&
      selectedTaskSelection.taskId === selectedTask.taskId &&
      selectedTaskSelection.workflowKind === selectedTask.workflowKind &&
      selectedTaskSelection.definitionVersion ===
        selectedTask.definitionVersion &&
      selectedTaskSelection.stepKey === selectedTask.stepKey &&
      selectedTaskSelection.targetKind === selectedTask.targetKind &&
      selectedTaskSelection.targetId === selectedTask.targetId &&
      revisionsMatch;
    if (!selectionMatchesTask) {
      return { status: "unavailable", reason: "selected_task_stale" };
    }
    const matchesTarget = selectedNode
      ? selectedTask.targetKind === selectedNode.targetKind &&
        selectedTask.targetId === selectedNode.targetId
      : selectedTask.targetKind === "project" &&
        selectedTask.targetId === journey.project.id;
    if (!matchesTarget) {
      return {
        status: "unavailable",
        reason: "selected_task_target_mismatch",
      };
    }
    return { status: "available", selection: "explicit", task: selectedTask };
  }

  if (selectedTaskSelection !== null) {
    return { status: "unavailable", reason: "selected_task_stale" };
  }

  const defaultTask = selectedNode
    ? defaultWorkflowTaskForTarget(
        journey.workflowProjection.tasks,
        selectedNode.targetKind,
        selectedNode.targetId
      )
    : projectGoalTask(journey.workflowProjection.tasks, journey.project.id);
  return defaultTask
    ? { status: "available", selection: "default", task: defaultTask }
    : { status: "unavailable", reason: "default_task_missing" };
}

export function projectWorkbenchDefaultTaskIdForNode(
  journey: ProjectJourney,
  nodeId: string | null
): string | null {
  if (!journey.workflowProjection) {
    return null;
  }
  if (nodeId === null) {
    return (
      projectGoalTask(journey.workflowProjection.tasks, journey.project.id)
        ?.taskId ?? null
    );
  }
  const node = journey.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.kind === "route_entry") {
    return null;
  }
  return (
    defaultWorkflowTaskForTarget(
      journey.workflowProjection.tasks,
      node.targetKind,
      node.targetId
    )?.taskId ?? null
  );
}

export function reconcileProjectWorkbenchTaskId(
  selectedTaskId: string | null,
  journey: ProjectJourney,
  selectedNodeId: string | null,
  preserveProjectPlanning = false
): string | null {
  const selectedTask = projectWorkflowTaskById(
    journey.workflowProjection?.tasks ?? [],
    selectedTaskId
  );
  if (
    selectedTask &&
    ((selectedNodeId === null && selectedTask.targetKind === "project") ||
      (selectedNodeId !== null &&
        selectedTask.targetKind !== "project" &&
        projectWorkbenchNodeIdForWorkflowTask(journey, selectedTask) ===
          selectedNodeId))
  ) {
    return selectedTask.taskId;
  }
  if (preserveProjectPlanning && selectedNodeId === null) {
    return projectWorkbenchDefaultTaskIdForNode(journey, null);
  }
  return projectWorkbenchDefaultTaskIdForNode(journey, selectedNodeId);
}
