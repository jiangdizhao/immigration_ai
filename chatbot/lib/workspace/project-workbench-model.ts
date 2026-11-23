import type { ProjectJourney, ProjectJourneyNode } from "./project-journey";
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
