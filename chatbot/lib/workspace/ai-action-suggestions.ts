import { z } from "zod";
import type { ProjectAssistantContext } from "@/lib/projects/project-assistant-context";
import type { ActiveStepContextV1 } from "./active-step-context";
import type {
  WorkflowSourceRevisionV1,
  WorkflowTaskProjectionV1,
} from "./project-workflows";

const schoolSuggestionWireSchema = z
  .object({
    schema_version: z.literal("phase15.ai-action-suggestion.v1"),
    operation: z.literal("set_customer_reported_field"),
    field_path: z.literal("schoolApplication.intakeLabel"),
    proposed_value: z.string().min(1).max(120),
    target_reference: z.string().max(120).nullable().optional(),
    source_or_assumption: z.string().min(1).max(240),
    explanation: z.string().min(1).max(240),
  })
  .strict();

const studentSuggestionWireSchema = z
  .object({
    schema_version: z.literal("phase15.ai-action-suggestion.v1"),
    operation: z.literal("set_customer_reported_field"),
    field_path: z.literal("student500.applicationPlace"),
    proposed_value: z.enum(["onshore", "offshore", "unknown"]),
    target_reference: z.string().max(120).nullable().optional(),
    source_or_assumption: z.string().min(1).max(240),
    explanation: z.string().min(1).max(240),
  })
  .strict();

export const aiActionSuggestionWireSchema = z.discriminatedUnion("field_path", [
  schoolSuggestionWireSchema,
  studentSuggestionWireSchema,
]);

export const aiActionSuggestionV1Schema = z.discriminatedUnion("fieldPath", [
  z
    .object({
      schemaVersion: z.literal("phase15.ai-action-suggestion.v1"),
      operation: z.literal("set_customer_reported_field"),
      fieldPath: z.literal("schoolApplication.intakeLabel"),
      proposedValue: z.string().min(1).max(120),
      targetReference: z.string().max(120).nullable(),
      sourceOrAssumption: z.string().min(1).max(240),
      explanation: z.string().min(1).max(240),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal("phase15.ai-action-suggestion.v1"),
      operation: z.literal("set_customer_reported_field"),
      fieldPath: z.literal("student500.applicationPlace"),
      proposedValue: z.enum(["onshore", "offshore", "unknown"]),
      targetReference: z.string().max(120).nullable(),
      sourceOrAssumption: z.string().min(1).max(240),
      explanation: z.string().min(1).max(240),
    })
    .strict(),
]);

export const boundAiActionSuggestionV1Schema = z
  .object({
    schemaVersion: z.literal("phase15.bound-ai-action-suggestion.v1"),
    suggestion: aiActionSuggestionV1Schema,
    projectId: z.string().uuid(),
    chatId: z.string().uuid(),
    taskId: z.string().min(1).max(512),
    definitionVersion: z.literal("phase15.project-workflows.v1"),
    workflowKind: z.enum([
      "project_planning",
      "school_application",
      "school_admissions",
      "student_500",
    ]),
    stepKey: z.string().min(1).max(128),
    targetKind: z.enum([
      "project",
      "school_application",
      "school_admission_case",
      "student500_application",
    ]),
    targetId: z.string().min(1).max(128),
    sourceRevisions: z
      .array(
        z
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
          .strict()
      )
      .max(8),
  })
  .strict();

export type AIActionSuggestionV1 = z.infer<typeof aiActionSuggestionV1Schema>;
export type BoundAIActionSuggestionV1 = z.infer<
  typeof boundAiActionSuggestionV1Schema
>;

function normalizedReference(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function targetRows(
  context: ProjectAssistantContext,
  targetKind: "school_application" | "student500_application"
) {
  return targetKind === "school_application"
    ? context.indexes.schoolApplications
    : context.indexes.student500Applications;
}

function suggestionPathMatchesStep(
  suggestion: AIActionSuggestionV1,
  active: ActiveStepContextV1
): boolean {
  return (
    (suggestion.fieldPath === "schoolApplication.intakeLabel" &&
      active.workflowKind === "school_application" &&
      active.stepKey === "school_discovery" &&
      active.targetKind === "school_application") ||
    (suggestion.fieldPath === "student500.applicationPlace" &&
      active.workflowKind === "student_500" &&
      active.stepKey === "visa_planning" &&
      active.targetKind === "student500_application")
  );
}

function activeTaskAllowsSuggestion(active: ActiveStepContextV1): boolean {
  if (
    active.task.applicability === "applicable" &&
    active.task.actionability === "read_only" &&
    active.sourceCoverage === "complete"
  ) {
    return true;
  }
  return (
    active.workflowKind === "school_application" &&
    active.stepKey === "school_discovery" &&
    active.targetKind === "school_application" &&
    active.task.applicability === "unavailable" &&
    active.task.actionability === "unavailable" &&
    active.task.reasonCodes.length === 1 &&
    active.task.reasonCodes[0] === "school_course_source_unverified" &&
    active.sourceCoverage === "unavailable"
  );
}

function exactReferenceMatchesCurrentTarget(input: {
  suggestion: AIActionSuggestionV1;
  rows: NonNullable<ReturnType<typeof targetRows>>;
  targetKind: "school_application" | "student500_application";
  targetId: string;
}): boolean {
  if (input.rows.length > 1 && !input.suggestion.targetReference) {
    return false;
  }
  const reference = input.suggestion.targetReference;
  if (!reference) {
    return true;
  }
  const normalized = normalizedReference(reference);
  const matches = input.rows.filter((row) => {
    const identifiers = [row.applicationId];
    if (input.targetKind === "school_application" && "institutionName" in row) {
      identifiers.push(row.institutionName);
    }
    return identifiers.some(
      (identifier) =>
        typeof identifier === "string" &&
        normalizedReference(identifier) === normalized
    );
  });
  return matches.length === 1 && matches[0]?.applicationId === input.targetId;
}

/** Bind untrusted Default output to this request's fresh server context. */
export function bindProjectActionSuggestion(input: {
  value: unknown;
  context: ProjectAssistantContext | null;
  chatId: string | null;
  projectId: string | null;
}): BoundAIActionSuggestionV1 | null {
  const parsed = aiActionSuggestionWireSchema.safeParse(input.value);
  const context = input.context;
  const active = context?.activeStep;
  if (
    !parsed.success ||
    !context ||
    !active ||
    !input.chatId ||
    !input.projectId ||
    context.contextOrigin !== "project_chat" ||
    context.availability !== "available" ||
    context.consistency !== "live_per_source_revision" ||
    context.project?.status !== "active" ||
    context.project.id !== input.projectId ||
    active.projectId !== input.projectId ||
    active.chatId !== input.chatId ||
    !suggestionPathMatchesStep(
      {
        schemaVersion: "phase15.ai-action-suggestion.v1",
        operation: parsed.data.operation,
        fieldPath: parsed.data.field_path,
        proposedValue: parsed.data.proposed_value,
        targetReference: parsed.data.target_reference ?? null,
        sourceOrAssumption: parsed.data.source_or_assumption,
        explanation: parsed.data.explanation,
      } as AIActionSuggestionV1,
      active
    ) ||
    !activeTaskAllowsSuggestion(active) ||
    active.targetKind === "project" ||
    active.targetKind === "school_admission_case"
  ) {
    return null;
  }

  const suggestion = aiActionSuggestionV1Schema.parse({
    schemaVersion: parsed.data.schema_version,
    operation: parsed.data.operation,
    fieldPath: parsed.data.field_path,
    proposedValue: parsed.data.proposed_value,
    targetReference: parsed.data.target_reference ?? null,
    sourceOrAssumption: parsed.data.source_or_assumption,
    explanation: parsed.data.explanation,
  });
  const rows = targetRows(context, active.targetKind);
  if (!rows) {
    return null;
  }
  const targetRowsForId = rows.filter(
    (row) => row.applicationId === active.targetId
  );
  const sourceRevisions = active.sourceRevisions;
  const targetRevision = sourceRevisions.filter(
    (item) =>
      item.targetKind === active.targetKind && item.targetId === active.targetId
  );
  if (
    targetRowsForId.length !== 1 ||
    targetRevision.length !== 1 ||
    targetRowsForId[0]?.provenanceRevision !== targetRevision[0]?.revision ||
    !exactReferenceMatchesCurrentTarget({
      suggestion,
      rows,
      targetKind: active.targetKind,
      targetId: active.targetId,
    })
  ) {
    return null;
  }

  return boundAiActionSuggestionV1Schema.parse({
    schemaVersion: "phase15.bound-ai-action-suggestion.v1",
    suggestion,
    projectId: active.projectId,
    chatId: active.chatId,
    taskId: active.taskId,
    definitionVersion: active.definitionVersion,
    workflowKind: active.workflowKind,
    stepKey: active.stepKey,
    targetKind: active.targetKind,
    targetId: active.targetId,
    sourceRevisions: active.sourceRevisions.map((item) => ({ ...item })),
  });
}

export function boundSuggestionMatchesTask(input: {
  suggestion: BoundAIActionSuggestionV1 | null | undefined;
  projectId: string | null;
  chatId: string | null;
  task: WorkflowTaskProjectionV1 | null;
}): input is {
  suggestion: BoundAIActionSuggestionV1;
  projectId: string;
  chatId: string;
  task: WorkflowTaskProjectionV1;
} {
  const parsed = boundAiActionSuggestionV1Schema.safeParse(input.suggestion);
  const task = input.task;
  if (!parsed.success || !task || !input.chatId || !input.projectId) {
    return false;
  }
  const value = parsed.data;
  return (
    value.projectId === input.projectId &&
    value.chatId === input.chatId &&
    value.taskId === task.taskId &&
    value.definitionVersion === task.definitionVersion &&
    value.workflowKind === task.workflowKind &&
    value.stepKey === task.stepKey &&
    value.targetKind === task.targetKind &&
    value.targetId === task.targetId &&
    value.sourceRevisions.length === task.sourceRevisions.length &&
    value.sourceRevisions.every((revision, index) => {
      const current: WorkflowSourceRevisionV1 | undefined =
        task.sourceRevisions[index];
      return Boolean(
        current &&
          revision.targetKind === current.targetKind &&
          revision.targetId === current.targetId &&
          revision.revision === current.revision
      );
    })
  );
}
