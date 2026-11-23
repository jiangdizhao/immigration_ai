import type { ProjectJourney, ProjectJourneyNode } from "./project-journey";

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
  journey: ProjectJourney
): string | null {
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
