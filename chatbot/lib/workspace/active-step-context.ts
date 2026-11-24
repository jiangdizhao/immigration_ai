import { z } from "zod";
import type { ProjectState, ProjectStateStudent500 } from "./project-state";
import {
  buildProjectWorkflowProjection,
  PROJECT_WORKFLOW_DEFINITION_VERSION,
  PROJECT_WORKFLOW_KINDS,
  PROJECT_WORKFLOW_STEP_KEYS,
  type ProjectWorkflowTargetKind,
  type WorkflowSourceRevisionV1,
  type WorkflowTaskProjectionV1,
} from "./project-workflows";

const uuid = z.string().uuid();
const sourceRevisionSchema = z
  .object({
    targetKind: z.enum([
      "project",
      "school_application",
      "school_admission_case",
      "student500_application",
    ]),
    targetId: z.string().min(1).max(128),
    revision: z.number().int().nonnegative().safe(),
  })
  .strict();

/** Browser-selected workflow task. Every field is an untrusted lookup hint. */
export const activeStepSelectionV1Schema = z
  .object({
    schemaVersion: z.literal("phase15.active-step-selection.v1"),
    projectId: uuid,
    taskId: z.string().min(1).max(512),
    workflowKind: z.enum(PROJECT_WORKFLOW_KINDS),
    definitionVersion: z.literal(PROJECT_WORKFLOW_DEFINITION_VERSION),
    stepKey: z.enum(PROJECT_WORKFLOW_STEP_KEYS),
    targetKind: z.enum([
      "project",
      "school_application",
      "school_admission_case",
      "student500_application",
    ]),
    targetId: z.string().min(1).max(128),
    sourceRevisions: z.array(sourceRevisionSchema).max(8),
  })
  .strict();

export type ActiveStepSelectionV1 = z.infer<typeof activeStepSelectionV1Schema>;

type ActiveStepMatterV1 =
  | {
      kind: "project";
      status: "active" | "closed";
      purposeState: "unknown";
      revision: number;
    }
  | {
      kind: "school_application";
      status: string;
      institutionName: string;
      courseTitle: string;
      intakeLabel: string | null;
      packageStatus: string | null;
      revision: number;
    }
  | {
      kind: "school_admission_case";
      status: string;
      institutionName: string;
      courseTitle: string | null;
      intakeLabel: string | null;
      outcomeStates: string[];
      revision: number;
    }
  | {
      kind: "student500_application";
      status: string;
      entryRoute: string | null;
      coeStatus: string;
      schoolDependency: ProjectStateStudent500["schoolDependency"];
      revision: number;
    };

export type ActiveStepContextV1 = {
  schemaVersion: "phase15.active-step-context.v1";
  projectId: string;
  chatId: string;
  definitionVersion: typeof PROJECT_WORKFLOW_DEFINITION_VERSION;
  taskId: string;
  workflowKind: WorkflowTaskProjectionV1["workflowKind"];
  stepKey: WorkflowTaskProjectionV1["stepKey"];
  targetKind: ProjectWorkflowTargetKind;
  targetId: string;
  task: {
    applicability: WorkflowTaskProjectionV1["applicability"];
    progress: WorkflowTaskProjectionV1["progress"];
    reasonCodes: string[];
    dependencies: string[];
    actionability: WorkflowTaskProjectionV1["actionability"];
  };
  sourceRevisions: WorkflowSourceRevisionV1[];
  sourceCoverage: "complete" | "partial" | "unavailable";
  matter: ActiveStepMatterV1 | null;
};

export function activeStepSelectionForTask(
  task: WorkflowTaskProjectionV1
): ActiveStepSelectionV1 {
  return {
    schemaVersion: "phase15.active-step-selection.v1",
    projectId: task.projectId,
    taskId: task.taskId,
    workflowKind: task.workflowKind,
    definitionVersion: task.definitionVersion,
    stepKey: task.stepKey,
    targetKind: task.targetKind,
    targetId: task.targetId,
    sourceRevisions: task.sourceRevisions.map((item) => ({ ...item })),
  };
}

export class ActiveStepContextError extends Error {
  readonly code:
    | "active_step_selection_invalid"
    | "active_step_context_unavailable";

  constructor(
    code: "active_step_selection_invalid" | "active_step_context_unavailable"
  ) {
    super(code);
    this.name = "ActiveStepContextError";
    this.code = code;
  }
}

function sameRevisions(
  left: readonly WorkflowSourceRevisionV1[],
  right: readonly WorkflowSourceRevisionV1[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => {
    const other = right[index];
    return Boolean(
      other &&
        entry.targetKind === other.targetKind &&
        entry.targetId === other.targetId &&
        entry.revision === other.revision
    );
  });
}

function admissions(state: ProjectState) {
  const found = new Map<
    string,
    NonNullable<ProjectState["matters"]["standaloneAdmissions"]>[number]
  >();
  for (const item of state.matters.standaloneAdmissions ?? []) {
    found.set(item.caseId, item);
  }
  for (const item of state.matters.unresolvedLinkedAdmissions ?? []) {
    found.set(item.caseId, item);
  }
  for (const item of state.matters.schoolApplications ?? []) {
    if (item.linkedAdmissionsCase) {
      found.set(item.linkedAdmissionsCase.caseId, item.linkedAdmissionsCase);
    }
  }
  return [...found.values()];
}

function activeMatter(
  state: ProjectState,
  targetKind: ProjectWorkflowTargetKind,
  targetId: string
): ActiveStepMatterV1 | null {
  if (targetKind === "project" && targetId === state.project.id) {
    return {
      kind: "project",
      status: state.project.status,
      purposeState: state.project.purpose.state,
      revision: state.project.revision,
    };
  }
  if (targetKind === "school_application") {
    const item = state.matters.schoolApplications?.find(
      (entry) => entry.applicationId === targetId
    );
    return item
      ? {
          kind: "school_application",
          status: item.status,
          institutionName: item.institution.name,
          courseTitle: item.course.title,
          intakeLabel: item.intake.label,
          packageStatus: item.package?.status ?? null,
          revision: item.provenance.revision,
        }
      : null;
  }
  if (targetKind === "school_admission_case") {
    const item = admissions(state).find((entry) => entry.caseId === targetId);
    return item
      ? {
          kind: "school_admission_case",
          status: item.preparationState,
          institutionName: item.institutionName,
          courseTitle: item.courseTitle,
          intakeLabel: item.intakeLabel,
          outcomeStates: item.outcomes
            .slice(0, 8)
            .map((outcome) => outcome.state),
          revision: item.provenance.revision,
        }
      : null;
  }
  if (targetKind === "student500_application") {
    const item = state.matters.student500Applications?.find(
      (entry) => entry.applicationId === targetId
    );
    return item
      ? {
          kind: "student500_application",
          status: item.status,
          entryRoute: item.entryRoute,
          coeStatus: item.coeStatus,
          schoolDependency: item.schoolDependency,
          revision: item.provenance.revision,
        }
      : null;
  }
  return null;
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Resolves and validates a client hint against the exact fresh M1 + E2 projection. */
export function resolveActiveStepContext(input: {
  state: ProjectState | null;
  chatId: string;
  projectId: string | null;
  selection: ActiveStepSelectionV1 | null | undefined;
}): ActiveStepContextV1 | null {
  if (!input.selection) {
    return null;
  }
  if (!input.state || !input.projectId) {
    throw new ActiveStepContextError("active_step_context_unavailable");
  }
  const parsed = activeStepSelectionV1Schema.safeParse(input.selection);
  if (!parsed.success || parsed.data.projectId !== input.projectId) {
    throw new ActiveStepContextError("active_step_selection_invalid");
  }
  const state = input.state;
  if (state.project.id !== input.projectId) {
    throw new ActiveStepContextError("active_step_selection_invalid");
  }
  const task = buildProjectWorkflowProjection(state).tasks.find(
    (entry) => entry.taskId === parsed.data.taskId
  );
  if (
    !task ||
    task.projectId !== parsed.data.projectId ||
    task.workflowKind !== parsed.data.workflowKind ||
    task.definitionVersion !== parsed.data.definitionVersion ||
    task.stepKey !== parsed.data.stepKey ||
    task.targetKind !== parsed.data.targetKind ||
    task.targetId !== parsed.data.targetId ||
    !sameRevisions(task.sourceRevisions, parsed.data.sourceRevisions)
  ) {
    throw new ActiveStepContextError("active_step_selection_invalid");
  }
  const matter = activeMatter(state, task.targetKind, task.targetId);
  if (task.targetKind !== "project" && !matter) {
    throw new ActiveStepContextError("active_step_context_unavailable");
  }
  const sourceCoverage =
    task.applicability === "unavailable" || task.actionability === "unavailable"
      ? "unavailable"
      : task.applicability === "unknown"
        ? "partial"
        : "complete";
  const context: ActiveStepContextV1 = {
    schemaVersion: "phase15.active-step-context.v1",
    projectId: input.projectId,
    chatId: input.chatId,
    definitionVersion: task.definitionVersion,
    taskId: task.taskId,
    workflowKind: task.workflowKind,
    stepKey: task.stepKey,
    targetKind: task.targetKind,
    targetId: task.targetId,
    task: {
      applicability: task.applicability,
      progress: task.progress,
      reasonCodes: [...task.reasonCodes].slice(0, 12),
      dependencies: [...task.dependencies].slice(0, 8),
      actionability: task.actionability,
    },
    sourceRevisions: [...task.sourceRevisions],
    sourceCoverage,
    matter,
  };
  if (jsonBytes(context) > 2000) {
    throw new ActiveStepContextError("active_step_context_unavailable");
  }
  return context;
}
