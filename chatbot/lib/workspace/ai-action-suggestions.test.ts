import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectAssistantContext } from "@/lib/projects/project-assistant-context";
import type { ActiveStepContextV1 } from "./active-step-context";
import {
  type BoundAIActionSuggestionV1,
  bindProjectActionSuggestion,
  boundSuggestionMatchesTask,
} from "./ai-action-suggestions";
import type { WorkflowTaskProjectionV1 } from "./project-workflows";

const projectId = "11111111-1111-4111-8111-111111111111";
const chatId = "22222222-2222-4222-8222-222222222222";
const schoolId = "33333333-3333-4333-8333-333333333333";
const otherSchoolId = "44444444-4444-4444-8444-444444444444";

function context(input?: {
  chatId?: string;
  projectId?: string;
  targetId?: string;
  revision?: number;
  rows?: Array<{
    applicationId: string;
    institutionName: string;
    provenanceRevision: number;
  }>;
}): ProjectAssistantContext {
  const targetId = input?.targetId ?? schoolId;
  const revision = input?.revision ?? 5;
  const rows = input?.rows ?? [
    {
      applicationId: schoolId,
      institutionName: "Northbridge College",
      provenanceRevision: revision,
    },
  ];
  return {
    schemaVersion: "phase15.project-assistant-context.v1",
    contextOrigin: "project_chat",
    availability: "available",
    reasonCode: null,
    consistency: "live_per_source_revision",
    project: {
      id: input?.projectId ?? projectId,
      status: "active",
    } as ProjectAssistantContext["project"],
    capabilities: null,
    facts: null,
    factContext: { state: "unknown", omitted: null },
    indexes: {
      schoolApplications: rows as NonNullable<
        ProjectAssistantContext["indexes"]["schoolApplications"]
      >,
      linkedAdmissions: [],
      standaloneAdmissions: [],
      unresolvedLinkedAdmissions: [],
      student500Applications: [],
    },
    matters: {
      schoolApplications: [],
      standaloneAdmissions: [],
      unresolvedLinkedAdmissions: [],
      student500Applications: [],
    },
    unresolvedIssues: [],
    nextActions: [],
    activeStep: {
      schemaVersion: "phase15.active-step-context.v1",
      projectId: input?.projectId ?? projectId,
      chatId: input?.chatId ?? chatId,
      definitionVersion: "phase15.project-workflows.v1",
      taskId: `school_application:school_discovery:${targetId}`,
      workflowKind: "school_application",
      stepKey: "school_discovery",
      targetKind: "school_application",
      targetId,
      task: {
        applicability: "applicable",
        progress: "in_progress",
        reasonCodes: [],
        dependencies: [],
        actionability: "read_only",
      },
      sourceRevisions: [
        {
          targetKind: "school_application",
          targetId,
          revision,
        },
      ],
      sourceCoverage: "complete",
      matter: null,
    } as ActiveStepContextV1,
    omissions: {
      schoolApplications: rows.length,
      standaloneAdmissions: 0,
      unresolvedLinkedAdmissions: 0,
      student500Applications: 0,
      unresolvedIssues: 0,
      nextActions: 0,
      linkedAdmissions: 0,
      admissionsCases: 0,
    },
  } as ProjectAssistantContext;
}

const suggestion = {
  schema_version: "phase15.ai-action-suggestion.v1",
  operation: "set_customer_reported_field",
  field_path: "schoolApplication.intakeLabel",
  proposed_value: "July 2027",
  source_or_assumption: "The user requested July 2027.",
  explanation: "This records a customer-reported intake label.",
};

test("binds a typed suggestion to the exact current Project Chat task", () => {
  const bound = bindProjectActionSuggestion({
    value: suggestion,
    context: context(),
    chatId,
    projectId,
  });
  assert.ok(bound);
  assert.equal(bound.targetId, schoolId);
  assert.equal(bound.chatId, chatId);
  assert.equal(bound.suggestion.proposedValue, "July 2027");
  assert.equal(boundProjectTask(bound), true);
});

test("rejects wrong Chat, Project, target, field and extra model authority", () => {
  const current = context();
  assert.equal(
    bindProjectActionSuggestion({
      value: suggestion,
      context: current,
      chatId: "99999999-9999-4999-8999-999999999999",
      projectId,
    }),
    null
  );
  assert.equal(
    bindProjectActionSuggestion({
      value: suggestion,
      context: current,
      chatId,
      projectId: otherSchoolId,
    }),
    null
  );
  assert.equal(
    bindProjectActionSuggestion({
      value: { ...suggestion, target_id: otherSchoolId },
      context: current,
      chatId,
      projectId,
    }),
    null
  );
  assert.equal(
    bindProjectActionSuggestion({
      value: { ...suggestion, field_path: "student500.applicationPlace" },
      context: current,
      chatId,
      projectId,
    }),
    null
  );
});

test("ambiguous multi-school suggestions require a unique exact reference", () => {
  const rows = [
    {
      applicationId: schoolId,
      institutionName: "Northbridge College",
      provenanceRevision: 5,
    },
    {
      applicationId: otherSchoolId,
      institutionName: "Southport Institute",
      provenanceRevision: 2,
    },
  ];
  const current = context({ rows });
  assert.equal(
    bindProjectActionSuggestion({
      value: suggestion,
      context: current,
      chatId,
      projectId,
    }),
    null
  );
  const exact = bindProjectActionSuggestion({
    value: { ...suggestion, target_reference: "Northbridge College" },
    context: current,
    chatId,
    projectId,
  });
  assert.ok(exact);
  assert.equal(exact.targetId, schoolId);
  assert.equal(
    bindProjectActionSuggestion({
      value: { ...suggestion, target_reference: otherSchoolId },
      context: current,
      chatId,
      projectId,
    }),
    null
  );
});

test("stale task revisions invalidate a bound suggestion", () => {
  const bound = bindProjectActionSuggestion({
    value: suggestion,
    context: context(),
    chatId,
    projectId,
  }) as BoundAIActionSuggestionV1;
  const task = {
    taskId: bound.taskId,
    projectId,
    workflowKind: "school_application",
    definitionVersion: "phase15.project-workflows.v1",
    stepKey: "school_discovery",
    targetKind: "school_application",
    targetId: schoolId,
    applicability: "applicable",
    progress: "not_started",
    responsibleActor: "customer",
    reasonCodes: [],
    dependencies: [],
    dependencySemantics: "none",
    sourceRevision: 5,
    sourceRevisions: [
      { targetKind: "school_application", targetId: schoolId, revision: 5 },
    ],
    actionability: "read_only",
    panelKind: "school",
    progressCreditKey: null,
    progressCreditOwner: false,
  } as WorkflowTaskProjectionV1;
  assert.equal(
    boundSuggestionMatchesTask({ suggestion: bound, projectId, chatId, task }),
    true
  );
  const staleTask = {
    ...task,
    sourceRevisions: [
      { targetKind: "school_application", targetId: schoolId, revision: 6 },
    ],
  } as WorkflowTaskProjectionV1;
  assert.equal(
    boundSuggestionMatchesTask({
      suggestion: bound,
      projectId,
      chatId,
      task: staleTask,
    }),
    false
  );
});

function boundProjectTask(value: BoundAIActionSuggestionV1): boolean {
  return (
    value.projectId === projectId && value.taskId.includes("school_discovery")
  );
}
