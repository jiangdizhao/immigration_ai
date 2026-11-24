import assert from "node:assert/strict";
import test from "node:test";
import { activeStepSelectionForTask } from "./active-step-context";
import {
  bindCourseResearchResult,
  boundCourseResearchResultSchema,
  courseResearchDiagnosticsSchema,
  courseResearchEmptyState,
  courseResearchResultIsCurrent,
  courseResearchResultMatchesTask,
  courseResearchScopeFingerprint,
  courseResearchSelectionScopeFingerprint,
} from "./course-research";

const projectId = "31000000-0000-4000-8000-000000000001";
const chatId = "31000000-0000-4000-8000-000000000002";
const messageId = "31000000-0000-4000-8000-000000000003";
const targetId = "31000000-0000-4000-8000-000000000004";
const candidateId = "31000000-0000-4000-8000-000000000005";
const sourceId = "31000000-0000-4000-8000-000000000006";

function currentFixture() {
  const revisions = [
    { targetKind: "project", targetId: projectId, revision: 1 },
    { targetKind: "school_application", targetId, revision: 4 },
  ] as const;
  const activeStep = {
    schemaVersion: "phase15.active-step-context.v1" as const,
    projectId,
    chatId,
    definitionVersion: "phase15.project-workflows.v1" as const,
    taskId: `${projectId}:school_application:${targetId}:school_discovery`,
    workflowKind: "school_application" as const,
    stepKey: "school_discovery" as const,
    targetKind: "school_application" as const,
    targetId,
    task: {
      applicability: "unavailable" as const,
      progress: "unknown" as const,
      reasonCodes: ["school_course_source_unverified"],
      dependencies: [],
      actionability: "unavailable" as const,
    },
    sourceRevisions: revisions,
    sourceCoverage: "unavailable" as const,
    matter: null,
  };
  const task = {
    projectId,
    taskId: activeStep.taskId,
    workflowKind: "school_application" as const,
    definitionVersion: "phase15.project-workflows.v1" as const,
    stepKey: "school_discovery" as const,
    targetKind: "school_application" as const,
    targetId,
    sourceRevisions: [...revisions],
    applicability: "unavailable" as const,
    progress: "unknown" as const,
    reasonCodes: ["school_course_source_unverified"],
    actionability: "unavailable" as const,
    dependencies: [],
    dependencySemantics: "none" as const,
    sourceRevision: 4,
    panelKind: "unavailable" as const,
    titleKey: "school_discovery" as const,
    descriptionKey: "school_discovery" as const,
    responsibleActor: "unknown" as const,
    progressCreditKey: null,
    progressCreditOwner: true,
  };
  const context = {
    schemaVersion: "phase15.project-assistant-context.v1" as const,
    contextOrigin: "project_chat" as const,
    availability: "available" as const,
    reasonCode: null,
    consistency: "live_per_source_revision" as const,
    project: { id: projectId, status: "active" },
    capabilities: null,
    facts: null,
    factContext: { state: "unknown" as const, omitted: null },
    indexes: {
      schoolApplications: [],
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
    activeStep,
    omissions: {
      schoolApplications: 0,
      standaloneAdmissions: 0,
      unresolvedLinkedAdmissions: 0,
      student500Applications: 0,
      unresolvedIssues: 0,
      nextActions: 0,
      linkedAdmissions: 0,
      admissionsCases: 0,
    },
  };
  const value = {
    schemaVersion: "phase15.course-research-result.v1",
    projectId,
    chatId,
    taskId: activeStep.taskId,
    definitionVersion: "phase15.project-workflows.v1",
    workflowKind: "school_application",
    stepKey: "school_discovery",
    targetKind: "school_application",
    targetId,
    sourceRevisions: [...revisions],
    observedAt: "2026-11-24T00:00:00.000000Z",
    candidates: [
      {
        candidateId,
        institutionName: "Example University",
        courseTitle: "Master of Applied Example Studies",
        identityEvidenceLevel: "official_source_referenced",
        identitySourceIds: [sourceId],
        fields: [
          {
            key: "tuition_amount",
            value: "AUD 42,000",
            evidenceLevel: "model_research_lead",
            sourceIds: [],
            applicabilityNote: "Fee basis unclear",
            independentObservation: null,
          },
        ],
        sources: [
          {
            sourceId,
            url: "https://cricos.education.gov.au/courses/example",
            title: "CRICOS register record",
            authority: "cricos_registry",
            association: "cited",
            observedAt: "2026-11-24T00:00:00.000000Z",
            currentness: "unknown",
          },
        ],
        limitations: ["Intake and fees are not independently verified."],
        verificationState: "not_requested",
      },
    ],
    limitations: ["Native search provides no exact source text."],
    diagnostics: { invalidCandidateCount: 1 },
  };
  return { value, context, task };
}

test("client selection and server-resolved task produce the same scope fingerprint", () => {
  const fixture = currentFixture();
  const selection = activeStepSelectionForTask(fixture.task as never);
  const clientFingerprint = courseResearchSelectionScopeFingerprint({
    chatId,
    selection,
  });
  const serverFingerprint = courseResearchScopeFingerprint({
    projectId,
    chatId,
    activeStep: fixture.context.activeStep as never,
  });
  assert.equal(clientFingerprint, serverFingerprint);
});

test("course research binds the optional result to exact Project, Chat, target, task and assistant message", () => {
  const fixture = currentFixture();
  const result = bindCourseResearchResult({
    value: fixture.value,
    projectId,
    chatId,
    assistantMessageId: messageId,
    context: fixture.context as never,
  });
  assert.ok(result);
  assert.equal(result.assistantMessageId, messageId);
  assert.equal(
    result.candidates[0]?.fields[0]?.evidenceLevel,
    "model_research_lead"
  );
  assert.equal(
    courseResearchResultMatchesTask({
      result,
      projectId,
      chatId,
      task: fixture.task,
    }),
    true
  );
  assert.equal(
    courseResearchResultIsCurrent({ result, task: fixture.task }),
    true
  );
});

test("course research rejects cross-Project, cross-Chat, changed-target and absent-message bindings", () => {
  const fixture = currentFixture();
  for (const input of [
    {
      projectId: "31000000-0000-4000-8000-000000000099",
      chatId,
      assistantMessageId: messageId,
    },
    {
      projectId,
      chatId: "31000000-0000-4000-8000-000000000099",
      assistantMessageId: messageId,
    },
    { projectId, chatId, assistantMessageId: null },
  ]) {
    assert.equal(
      bindCourseResearchResult({
        ...input,
        value: fixture.value,
        context: fixture.context as never,
      }),
      null
    );
  }
  const wrongTarget = structuredClone(fixture.value);
  wrongTarget.targetId = "31000000-0000-4000-8000-000000000099";
  assert.equal(
    bindCourseResearchResult({
      value: wrongTarget,
      projectId,
      chatId,
      assistantMessageId: messageId,
      context: fixture.context as never,
    }),
    null
  );
});

test("old source revisions remain historical and are not current for a changed task", () => {
  const fixture = currentFixture();
  const result = bindCourseResearchResult({
    value: fixture.value,
    projectId,
    chatId,
    assistantMessageId: messageId,
    context: fixture.context as never,
  });
  assert.ok(result);
  const changedTask = {
    ...fixture.task,
    sourceRevisions: fixture.task.sourceRevisions.map((item, index) =>
      index === 1 ? { ...item, revision: 5 } : item
    ),
  };
  assert.equal(
    courseResearchResultMatchesTask({
      result,
      projectId,
      chatId,
      task: changedTask,
    }),
    true
  );
  assert.equal(
    courseResearchResultIsCurrent({ result, task: changedTask }),
    false
  );
});

test("lookalike source authority, query-bearing links and missing L3 provenance fail strict envelope parsing", () => {
  const fixture = currentFixture();
  const unsafe = structuredClone(fixture.value);
  unsafe.candidates[0].sources[0].url =
    "https://cricos.education.gov.au.attacker.example/course";
  assert.equal(
    bindCourseResearchResult({
      value: unsafe,
      projectId,
      chatId,
      assistantMessageId: messageId,
      context: fixture.context as never,
    }),
    null
  );
  const falseL3 = structuredClone(fixture.value);
  const falseL3Candidate = falseL3.candidates[0];
  assert.ok(falseL3Candidate);
  const falseL3Field = falseL3Candidate.fields[0];
  assert.ok(falseL3Field);
  falseL3Field.evidenceLevel = "independently_verified_field";
  assert.equal(
    bindCourseResearchResult({
      value: falseL3,
      projectId,
      chatId,
      assistantMessageId: messageId,
      context: fixture.context as never,
    }),
    null
  );
});

test("L3 is field-scoped and must bind the exact observed source URL and manifest", () => {
  const fixture = currentFixture();
  type L3Fixture = Record<string, unknown> & {
    candidates: Array<
      Record<string, unknown> & {
        identityEvidenceLevel: string;
        identitySourceIds: string[];
        sources: Record<string, unknown>[];
        fields: Record<string, unknown>[];
        verificationState: string;
      }
    >;
  };
  const valid = structuredClone(fixture.value) as unknown as L3Fixture;
  const validCandidate = valid.candidates[0];
  assert.ok(validCandidate);
  validCandidate.identityEvidenceLevel = "model_research_lead";
  validCandidate.identitySourceIds = [];
  validCandidate.sources = [
    {
      sourceId,
      url: "https://courses.example.edu.au/master-example",
      title: "Course page",
      authority: "approved_institution_source",
      association: "observed_only",
      observedAt: "2026-11-24T00:00:00.000000Z",
      currentness: "unknown",
      manifestId: "reviewed-course-page-v1",
    },
  ];
  validCandidate.fields = [
    {
      key: "course_code",
      value: "EX-2027",
      evidenceLevel: "independently_verified_field",
      sourceIds: [sourceId],
      applicabilityNote: null,
      independentObservation: {
        observedAt: "2026-11-24T00:00:00.000000Z",
        sourceId,
        sourceUrl: "https://courses.example.edu.au/master-example",
        manifestId: "reviewed-course-page-v1",
        snapshotSha256: "a".repeat(64),
        locator: "jsonld:Course.courseCode",
        effectiveFrom: null,
        effectiveTo: null,
        value: "EX-2027",
      },
    },
  ];
  validCandidate.verificationState = "verified_some_fields";
  assert.equal(
    boundCourseResearchResultSchema.safeParse({
      ...valid,
      assistantMessageId: messageId,
    }).success,
    true
  );

  const timezoneLess = structuredClone(valid) as L3Fixture;
  const timezoneLessField = timezoneLess.candidates[0]?.fields[0];
  assert.ok(timezoneLessField);
  (
    timezoneLessField.independentObservation as Record<string, unknown>
  ).observedAt = "2026-11-24T00:00:00.000000";
  assert.equal(
    boundCourseResearchResultSchema.safeParse({
      ...timezoneLess,
      assistantMessageId: messageId,
    }).success,
    false
  );

  const mismatched = structuredClone(valid) as L3Fixture;
  const mismatchedField = mismatched.candidates[0]?.fields[0];
  assert.ok(mismatchedField);
  const mismatchedObservation =
    mismatchedField.independentObservation as Record<string, unknown>;
  mismatchedObservation.sourceUrl =
    "https://courses.example.edu.au/another-course";
  assert.equal(
    boundCourseResearchResultSchema.safeParse({
      ...mismatched,
      assistantMessageId: messageId,
    }).success,
    false
  );

  const falseIdentity = structuredClone(valid) as L3Fixture;
  const falseIdentityCandidate = falseIdentity.candidates[0];
  assert.ok(falseIdentityCandidate);
  falseIdentityCandidate.identityEvidenceLevel = "independently_verified_field";
  assert.equal(
    boundCourseResearchResultSchema.safeParse({
      ...falseIdentity,
      assistantMessageId: messageId,
    }).success,
    false
  );
});

test("Workspace empty state distinguishes not performed, completed empty, failed and stale research", () => {
  const fixture = currentFixture();
  const current = bindCourseResearchResult({
    value: fixture.value,
    projectId,
    chatId,
    assistantMessageId: messageId,
    context: fixture.context as never,
  });
  assert.ok(current);
  const baseDiagnostics = courseResearchDiagnosticsSchema.parse({
    schema_version: "phase15.course-research-diagnostics.v1",
    scope_fingerprint: "0123456789abcdef",
    course_research_enabled: true,
    research_activation_reason: "school_course_source_unverified",
    research_tool_exposed: true,
    research_prompt_enabled: true,
    provider_schema_status: "required",
    suggestion_present: true,
    suggestion_container_status: "empty",
    diagnostic_counter_saturated: false,
    research_status: "completed",
    raw_candidate_count: 0,
    valid_candidate_count: 0,
    rejected_candidate_count: 0,
    rejected_field_count: 0,
    source_locator_count: 0,
    resolved_source_count: 0,
    rejected_source_count: 0,
    python_binding_status: "empty",
    python_binding_reason: "research_completed_without_candidates",
    python_bound_candidate_count: 0,
    frontend_binding_status: "empty_candidates",
    frontend_binding_reason: "empty_candidate_list",
    frontend_bound_candidate_count: 0,
  });
  const emptyCompletedValue = {
    ...structuredClone(fixture.value),
    candidates: [],
    researchStatus: "completed" as const,
  };
  const completedEmpty = bindCourseResearchResult({
    value: emptyCompletedValue,
    projectId,
    chatId,
    assistantMessageId: messageId,
    context: fixture.context as never,
  });
  assert.ok(completedEmpty);
  assert.equal(
    courseResearchEmptyState({
      result: completedEmpty,
      resultIsCurrent: true,
      diagnostics: baseDiagnostics,
    }),
    "completed_without_candidates"
  );

  const notPerformedDiagnostics = courseResearchDiagnosticsSchema.parse({
    ...baseDiagnostics,
    research_status: "not_performed",
  });
  const notPerformedValue = {
    ...emptyCompletedValue,
    researchStatus: "not_performed" as const,
  };
  const notPerformed = bindCourseResearchResult({
    value: notPerformedValue,
    projectId,
    chatId,
    assistantMessageId: messageId,
    context: fixture.context as never,
  });
  assert.ok(notPerformed);
  assert.equal(
    courseResearchEmptyState({
      result: notPerformed,
      resultIsCurrent: true,
      diagnostics: notPerformedDiagnostics,
    }),
    "not_performed"
  );
  assert.equal(
    courseResearchEmptyState({
      result: null,
      resultIsCurrent: false,
      diagnostics: courseResearchDiagnosticsSchema.parse({
        ...baseDiagnostics,
        suggestion_present: false,
        suggestion_container_status: "omitted",
        python_binding_status: "omitted",
        python_binding_reason: "suggestion_omitted",
        frontend_binding_status: "missing",
        frontend_binding_reason: "python_result_missing",
      }),
    }),
    "structured_result_unavailable"
  );
  assert.equal(
    courseResearchEmptyState({
      result: current,
      resultIsCurrent: false,
      diagnostics: baseDiagnostics,
    }),
    "historical_results_stale"
  );
});
