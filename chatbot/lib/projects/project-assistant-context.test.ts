// biome-ignore-all lint/suspicious/useAwait: Async test fakes return immediate values.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildAssistantMessageParts,
  extractAssistantMetadata,
} from "@/lib/conversations/message-parts";
import { defaultAgentRuntimeDebug } from "@/lib/default-agent-runtime-debug";
import { preservePublicAnswer } from "@/lib/public-answer-preservation";
import {
  bindCourseResearchResultWithDiagnostics,
  courseResearchDiagnosticsForTask,
  courseResearchDiagnosticsSchema,
  courseResearchResultIsCurrent,
  courseResearchResultMatchesTask,
  courseResearchSelection,
} from "@/lib/workspace/course-research";
import type {
  ProjectState,
  ProjectStateAdmission,
  ProjectStateProvenance,
  ProjectStateStudent500,
} from "@/lib/workspace/project-state";
import { buildProjectWorkflowProjection } from "@/lib/workspace/project-workflows";
import {
  buildProjectAssistantContext,
  PROJECT_ASSISTANT_CONTEXT_MAX_BYTES,
} from "./project-assistant-context";
import { refreshProjectAssistantContext } from "./project-assistant-refresh";
import { projectContextRequestPayload } from "./project-context";

const pythonWorkingDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../legal-service"
);

const provenance = (
  id: string,
  source: ProjectStateProvenance["source"] = "school_application"
): ProjectStateProvenance => ({
  source,
  recordId: id,
  revision: 2,
  updatedAt: "2026-11-21T00:00:00Z",
  latestEvent: null,
  history: [
    {
      eventType: "created",
      subjectKind: "test",
      subjectId: id,
      revision: 1,
      createdAt: "2026-11-19T00:00:00Z",
    },
    {
      eventType: "updated",
      subjectKind: "test",
      subjectId: id,
      revision: 2,
      createdAt: "2026-11-20T00:00:00Z",
    },
    {
      eventType: "earlier",
      subjectKind: "test",
      subjectId: id,
      revision: 3,
      createdAt: "2026-11-21T00:00:00Z",
    },
  ],
  historyTruncated: false,
});
const school = (id: string, name: string, code: string) => ({
  applicationId: id,
  stage: "school_application",
  status: "draft",
  progress: "needs_information",
  institution: { name, catalogId: null },
  course: { title: `Course ${id}`, catalogId: null },
  intake: { id: null, label: "March 2027" },
  source: { status: "customer_reported", independentlyVerified: false },
  missingInformationCodes: [code],
  package: null,
  linkedAdmissionsCase: null,
  responsibleActor: "unknown",
  provenance: provenance(id),
});
const admissionRecord = (
  id: string,
  schoolApplicationId: string | null,
  linkState: ProjectStateAdmission["schoolApplicationLinkState"] = schoolApplicationId
    ? "available"
    : "not_linked"
): ProjectStateAdmission => ({
  caseId: id,
  originKind: schoolApplicationId ? "school_application" : "existing_coe",
  linkedSchoolApplicationId: schoolApplicationId,
  schoolApplicationLinkState: linkState,
  institutionName: `Institution ${id}`,
  courseTitle: `Course ${id}`,
  intakeLabel: "March 2027",
  serviceMode: "self_service",
  preparationState: "in_progress",
  progress: "in_progress",
  nextStepCodes: [],
  requirements: [],
  outcomes: [
    {
      outcomeId: `outcome-${id}`,
      kind: "coe",
      state: "reported",
      provenance: "customer_reported",
      independentlyVerified: false,
      evidenceAttached: false,
      version: 1,
      recordedAt: "2026-11-20T00:00:00Z",
      superseded: false,
    },
  ],
  externalActions: [],
  schoolReceipt: { state: "unrecorded" },
  responsibleActor: "unknown",
  externalHandoff: { status: "UNKNOWN", reasonCodes: [] },
  blockedReasonCodes: [],
  provenance: provenance(id, "school_admission_case"),
});
const studentRecord = (
  id: string,
  schoolApplicationId: string | null
): ProjectStateStudent500 => ({
  applicationId: id,
  stage: "student500",
  status: "in_progress",
  progress: "in_progress",
  entryRoute: "higher_education",
  routeState: "recorded",
  coeStatus: "reported",
  schoolDependency: schoolApplicationId
    ? { state: "linked", schoolApplicationId }
    : { state: "not_applicable", reasonCode: "visa_only" },
  missingInformationCodes: ["source_not_verified"],
  sourceVerification: "declared_pending_verification",
  preparation: {
    state: "available",
    schoolContext: null,
    drafts: [
      {
        draftId: `draft-${id}`,
        version: 1,
        stale: false,
        staleReasonCodes: [],
        createdAt: "2026-11-20T00:00:00Z",
      },
    ],
    snapshots: [],
  },
  responsibleActor: "unknown",
  provenance: provenance(id, "student500_application"),
});
function state(): ProjectState {
  return {
    schemaVersion: "phase15.project-state.v1",
    generatedAt: "2026-11-21T00:00:00Z",
    consistency: "live_per_source_revision",
    coverage: "current_actor_authorized_records",
    project: {
      id: "project-a",
      status: "active",
      revision: 1,
      purpose: { state: "unknown", reasonCode: "project_purpose_not_recorded" },
      serviceScope: { state: "unavailable", engagements: null },
    },
    capabilities: {
      schoolApplications: { state: "available", reasonCode: null },
      schoolAdmissions: { state: "available", reasonCode: null },
      student500: { state: "available", reasonCode: null },
      student500Preparation: { state: "available", reasonCode: null },
      projectFacts: {
        state: "unavailable",
        reasonCode: "project_fact_source_exceeds_bound",
      },
      projectDocuments: {
        state: "unavailable",
        reasonCode: "trusted_project_document_read_unavailable",
      },
      submissionPackages: { state: "unsupported", reasonCode: null },
      serviceEngagements: { state: "unavailable", reasonCode: null },
    },
    facts: { state: "unavailable", authorizedForAI: null, conflictCount: null },
    matters: {
      schoolApplications: [
        school("school-a", "Northbridge University", "intake_missing"),
        school("school-b", "Harbour University", "transcript_missing"),
      ],
      standaloneAdmissions: [],
      unresolvedLinkedAdmissions: [],
      student500Applications: [],
    },
    unresolvedIssues: [],
    nextActions: [
      {
        targetKind: "school_application",
        targetId: "school-a",
        code: "complete_application_details",
        reasonCode: "missing",
        responsibleActor: "customer",
        actionability: "executable",
      },
    ],
  } as unknown as ProjectState;
}

test("bounded Project brief preserves independent schools, action targets, unknown purpose and source failures", () => {
  const packet = buildProjectAssistantContext(state());
  assert.equal(packet.project?.purpose.state, "unknown");
  assert.equal(packet.facts?.state, "unavailable");
  assert.equal(packet.capabilities?.projectDocuments.state, "unavailable");
  assert.equal(packet.matters.schoolApplications?.length, 2);
  assert.equal(
    packet.matters.schoolApplications?.[0].applicationId,
    "school-a"
  );
  assert.equal(
    packet.matters.schoolApplications?.[1].applicationId,
    "school-b"
  );
  assert.equal(packet.nextActions[0].targetId, "school-a");
  assert.equal(
    (packet.nextActions[0].actions as Array<{ actionability: string }>)[0]
      .actionability,
    "executable"
  );
  assert.equal(
    (
      packet.matters.schoolApplications?.[0].provenance as {
        historyTruncated: boolean;
      }
    ).historyTruncated,
    true
  );
  assert.equal(packet.omissions.schoolApplications, 0);
});

test("large M1-bounded Projects retain every school, Admissions and Student 500 identity", () => {
  const input = state();
  const linkedAdmissions = Array.from({ length: 4 }, (_, i) =>
    admissionRecord(`linked-${i + 1}`, `school-${i + 1}`)
  );
  const schools = Array.from({ length: 12 }, (_, i) => ({
    ...school(
      `school-${i + 1}`,
      i === 11 ? "Harbour University" : `University ${i + 1}`,
      "x".repeat(1500)
    ),
    linkedAdmissionsCase: linkedAdmissions[i] ?? null,
  }));
  input.matters.schoolApplications = schools as never;
  input.matters.standaloneAdmissions = Array.from({ length: 6 }, (_, i) =>
    admissionRecord(`standalone-${i + 1}`, null)
  );
  input.matters.unresolvedLinkedAdmissions = Array.from({ length: 6 }, (_, i) =>
    admissionRecord(
      `unresolved-${i + 1}`,
      `missing-school-${i + 1}`,
      "unavailable"
    )
  );
  input.matters.student500Applications = Array.from({ length: 6 }, (_, i) =>
    studentRecord(`visa-${i + 1}`, i < 4 ? `school-${i + 1}` : null)
  );
  const packet = buildProjectAssistantContext(
    input,
    "project_state_unavailable",
    "请告诉我第二所学校的当前进展"
  );
  assert.ok(
    new TextEncoder().encode(JSON.stringify(packet)).length <=
      PROJECT_ASSISTANT_CONTEXT_MAX_BYTES
  );
  assert.equal(packet.indexes.schoolApplications?.length, 12);
  assert.equal(packet.indexes.standaloneAdmissions?.length, 6);
  assert.equal(packet.indexes.unresolvedLinkedAdmissions?.length, 6);
  assert.equal(packet.indexes.linkedAdmissions?.length, 4);
  assert.equal(packet.indexes.student500Applications?.length, 6);
  assert.deepEqual(
    packet.indexes.schoolApplications?.map((item) => item.projectOrdinal),
    Array.from({ length: 12 }, (_, i) => i + 1)
  );
  assert.equal(
    packet.matters.schoolApplications?.[0].applicationId,
    "school-2"
  );
  assert.equal(packet.matters.schoolApplications?.[0].projectOrdinal, 2);
  assert.ok(packet.omissions.schoolApplications > 0);
  assert.ok(packet.omissions.admissionsCases > 0);
  assert.equal(
    packet.indexes.schoolApplications?.[1].institutionName,
    "University 2"
  );
  assert.equal(
    packet.indexes.schoolApplications?.[1].relatedStudent500ApplicationIds[0],
    "visa-2"
  );
  assert.equal(
    (packet.matters.schoolApplications?.length ?? 0) +
      packet.omissions.schoolApplications,
    12
  );
  assert.equal(
    (packet.matters.student500Applications?.length ?? 0) +
      packet.omissions.student500Applications,
    6
  );
});

test("exact IDs and course names prioritize detail; unsupported pronouns keep source order", () => {
  const input = state();
  const byCourse = buildProjectAssistantContext(
    input,
    "project_state_unavailable",
    "Show the Course school-b record"
  );
  assert.equal(
    byCourse.matters.schoolApplications?.[0].applicationId,
    "school-b"
  );
  const byId = buildProjectAssistantContext(
    input,
    "project_state_unavailable",
    "Show school-a, not school-ab"
  );
  assert.equal(byId.matters.schoolApplications?.[0].applicationId, "school-a");
  const unsupported = buildProjectAssistantContext(
    input,
    "project_state_unavailable",
    "What about the second one?"
  );
  assert.equal(
    unsupported.matters.schoolApplications?.[0].applicationId,
    "school-a"
  );
});

test("Project indexes fail explicitly if they exceed accepted M1 source limits", () => {
  const input = state();
  input.matters.schoolApplications = Array.from({ length: 13 }, (_, i) =>
    school(`school-${i + 1}`, `University ${i + 1}`, "intake_missing")
  ) as never;
  const packet = buildProjectAssistantContext(input);
  assert.equal(packet.availability, "unavailable");
  assert.equal(
    packet.reasonCode,
    "project_matter_index_exceeds_m1_record_limit"
  );
  assert.equal(packet.indexes.schoolApplications, null);
});

test("the complete index fails closed when authorized metadata leaves no packet room", () => {
  const input = state();
  input.facts = {
    state: "available",
    conflictCount: 0,
    authorizedForAI: Array.from({ length: 100 }, (_, i) => ({
      assertionId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      version: 1,
      key: `f${"x".repeat(127)}`,
      sourceEvidenceRef: `00000000-0000-4000-8000-${String(i + 100).padStart(12, "0")}`,
    })),
  };
  const packet = buildProjectAssistantContext(input);
  assert.equal(packet.availability, "unavailable");
  assert.equal(packet.reasonCode, "project_matter_index_exceeds_context_bound");
  assert.equal(packet.indexes.schoolApplications, null);
});

test("one state read is followed by fresh authorization and serialized into the backend request", async () => {
  let reads = 0;
  let rechecks = 0;
  const result = await refreshProjectAssistantContext({
    actorUserId: "owner",
    actorType: "regular",
    question: "What remains?",
    resolved: {
      projectId: "project-a",
      packet: null,
      diagnostic: "no_authorized_content",
      refreshBeforeProvider: async () => {
        rechecks += 1;
        return null;
      },
    },
    loadState: async () => {
      reads += 1;
      return { kind: "ok", state: state() };
    },
  });
  assert.equal(reads, 1);
  assert.equal(rechecks, 1);
  const payload = projectContextRequestPayload(result);
  assert.ok("project_assistant_context" in payload);
  assert.match(JSON.stringify(payload), /Northbridge University/);
  assert.match(JSON.stringify(payload), /Harbour University/);
});

test("fresh selected task is added as a bounded overlay without replacing whole-Project context", async () => {
  const projectId = "123e4567-e89b-42d3-a456-426614174000";
  const chatId = "123e4567-e89b-42d3-a456-426614174001";
  const current = state();
  current.project.id = projectId;
  const task = buildProjectWorkflowProjection(current).tasks.find(
    (entry) => entry.stepKey === "project_goal"
  );
  assert.ok(task);
  const selection = {
    schemaVersion: "phase15.active-step-selection.v1" as const,
    projectId,
    taskId: task.taskId,
    workflowKind: task.workflowKind,
    definitionVersion: task.definitionVersion,
    stepKey: task.stepKey,
    targetKind: task.targetKind,
    targetId: task.targetId,
    sourceRevisions: task.sourceRevisions.map((item) => ({ ...item })),
  };
  const packet = await refreshProjectAssistantContext({
    actorUserId: "owner",
    actorType: "regular",
    chatId,
    activeStepSelection: selection,
    question: "What is happening across the Project?",
    resolved: {
      projectId,
      packet: null,
      diagnostic: "no_authorized_content",
      refreshBeforeProvider: async () => null,
    },
    loadState: async () => ({ kind: "ok", state: current }),
  });
  assert.equal(packet?.assistantContext?.activeStep?.taskId, task.taskId);
  assert.equal(packet?.assistantContext?.project?.id, projectId);
  assert.equal(packet?.assistantContext?.indexes.schoolApplications?.length, 2);
  const payload = projectContextRequestPayload(packet);
  assert.match(JSON.stringify(payload), /Harbour University/);
  assert.match(JSON.stringify(payload), /project_goal/);

  let authorizationRechecks = 0;
  await assert.rejects(
    refreshProjectAssistantContext({
      actorUserId: "owner",
      actorType: "regular",
      chatId,
      activeStepSelection: {
        ...selection,
        sourceRevisions: selection.sourceRevisions.map((item) => ({
          ...item,
          revision: item.revision + 1,
        })),
      },
      resolved: {
        projectId,
        packet: null,
        diagnostic: "no_authorized_content",
        refreshBeforeProvider: async () => {
          authorizationRechecks += 1;
          return null;
        },
      },
      loadState: async () => ({ kind: "ok", state: current }),
    })
  );
  assert.equal(authorizationRechecks, 0);
});

test("standalone never loads Project state; revocation and wrong Project fail closed", async () => {
  let reads = 0;
  const standalone = await refreshProjectAssistantContext({
    actorUserId: "owner",
    actorType: "regular",
    resolved: {
      projectId: null,
      packet: null,
      diagnostic: "standalone",
      refreshBeforeProvider: async () => null,
    },
    loadState: async () => {
      reads += 1;
      return { kind: "not_found" };
    },
  });
  assert.equal(standalone, null);
  assert.equal(reads, 0);
  await assert.rejects(
    refreshProjectAssistantContext({
      actorUserId: "owner",
      actorType: "regular",
      resolved: {
        projectId: "project-a",
        packet: null,
        diagnostic: "no_authorized_content",
        refreshBeforeProvider: async () => {
          throw new Error("revoked");
        },
      },
      loadState: async () => ({ kind: "ok", state: state() }),
    })
  );
  const wrong = state();
  wrong.project.id = "project-b";
  await assert.rejects(
    refreshProjectAssistantContext({
      actorUserId: "owner",
      actorType: "regular",
      resolved: {
        projectId: "project-a",
        packet: null,
        diagnostic: "no_authorized_content",
        refreshBeforeProvider: async () => null,
      },
      loadState: async () => ({ kind: "ok", state: wrong }),
    })
  );
});

test("R5: real TypeScript active-task request survives the mocked Responses runtime, binding and history reload", async () => {
  const projectId = "123e4567-e89b-42d3-a456-426614174000";
  const chatId = "123e4567-e89b-42d3-a456-426614174001";
  const schoolId = "123e4567-e89b-42d3-a456-426614174002";
  const assistantMessageId = "123e4567-e89b-42d3-a456-426614174003";
  const current = state();
  current.project.id = projectId;
  current.matters.schoolApplications = [
    school(schoolId, "Synthetic Northbridge", "course_source_unverified"),
  ] as unknown as NonNullable<ProjectState["matters"]["schoolApplications"]>;

  const task = buildProjectWorkflowProjection(current).tasks.find(
    (entry) =>
      entry.stepKey === "school_discovery" && entry.targetId === schoolId
  );
  assert.ok(task);
  assert.equal(task.applicability, "unavailable");
  assert.equal(task.actionability, "unavailable");
  assert.deepEqual(task.reasonCodes, ["school_course_source_unverified"]);
  const selection = {
    schemaVersion: "phase15.active-step-selection.v1" as const,
    projectId,
    taskId: task.taskId,
    workflowKind: task.workflowKind,
    definitionVersion: task.definitionVersion,
    stepKey: task.stepKey,
    targetKind: task.targetKind,
    targetId: task.targetId,
    sourceRevisions: task.sourceRevisions.map((item) => ({ ...item })),
  };
  const packet = await refreshProjectAssistantContext({
    actorUserId: "synthetic-owner",
    actorType: "regular",
    chatId,
    activeStepSelection: selection,
    question:
      "请研究并比较四个适合国际学生的澳大利亚人工智能硕士课程，学费和未来入学时间未知时请明确说明。",
    resolved: {
      projectId,
      packet: null,
      diagnostic: "no_authorized_content",
      refreshBeforeProvider: async () => null,
    },
    loadState: async () => ({ kind: "ok", state: current }),
  });
  assert.equal(packet?.assistantContext?.activeStep?.taskId, task.taskId);
  assert.deepEqual(packet?.assistantContext?.activeStep?.task.reasonCodes, [
    "school_course_source_unverified",
  ]);
  const requestPayload = projectContextRequestPayload(packet);
  const syntheticRequest = {
    ...requestPayload,
    frontend_chat_id: chatId,
    question:
      "请研究并比较四个适合国际学生的澳大利亚人工智能硕士课程，学费和未来入学时间未知时请明确说明。",
  };
  const fixtureDirectory = mkdtempSync(
    join(tmpdir(), "phase15-m3-e3-r5-cross-runtime-")
  );
  const requestFile = join(fixtureDirectory, "request.json");
  writeFileSync(requestFile, JSON.stringify(syntheticRequest));
  const python =
    process.env.PHASE15_M3_E3_R5_PYTHON ??
    process.env.PYTHON ??
    (existsSync("/home/rico/anaconda3/envs/torch/bin/python")
      ? "/home/rico/anaconda3/envs/torch/bin/python"
      : "python3");
  const fixturePath = resolve(
    pythonWorkingDirectory,
    "tests/phase15_m3_e3_r5_cross_runtime_fixture.py"
  );
  const produced = spawnSync(python, ["-u", fixturePath, requestFile], {
    cwd: pythonWorkingDirectory,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 1_000_000,
    timeout: 15_000,
  });
  rmSync(fixtureDirectory, { recursive: true, force: true });
  assert.equal(
    produced.status,
    0,
    produced.stderr ||
      produced.error?.message ||
      "synthetic Python runtime failed"
  );
  const pythonOutput = JSON.parse(produced.stdout) as {
    activation_reason: string;
    course_research_enabled: boolean;
    provider_calls: number;
    provider_schema_required: boolean;
    submission_accepted_count: number;
    state_patch: unknown[];
    registered_native_web_refs: number;
    long_provider_url_length: number;
    response: {
      answer: string;
      citations: Record<string, unknown>[];
      compact_sources: string[];
      course_research_result: unknown;
      retrieval_debug: Record<string, unknown>;
    };
  };
  assert.equal(
    pythonOutput.activation_reason,
    "school_course_source_unverified"
  );
  assert.equal(pythonOutput.course_research_enabled, true);
  assert.equal(pythonOutput.provider_calls, 1);
  assert.equal(pythonOutput.provider_schema_required, true);
  assert.equal(pythonOutput.submission_accepted_count, 1);
  assert.deepEqual(pythonOutput.state_patch, []);
  assert.equal(pythonOutput.registered_native_web_refs, 4);
  assert.equal(pythonOutput.long_provider_url_length > 1000, true);
  assert.equal(pythonOutput.response.citations.length, 4);
  assert.equal(pythonOutput.response.compact_sources.length, 4);

  const runtimeDebug = defaultAgentRuntimeDebug(
    pythonOutput.response.retrieval_debug
  );
  const backendDiagnostics = courseResearchDiagnosticsSchema.parse(
    runtimeDebug?.course_research
  );
  assert.equal(backendDiagnostics.python_binding_status, "bound");
  assert.equal(backendDiagnostics.valid_candidate_count, 4);
  assert.equal(backendDiagnostics.rejected_source_count >= 2, true);
  const binding = bindCourseResearchResultWithDiagnostics({
    value: pythonOutput.response.course_research_result,
    projectId,
    chatId,
    assistantMessageId,
    context: packet?.assistantContext ?? null,
  });
  assert.equal(
    binding.status,
    "bound",
    `${binding.reason}: ${JSON.stringify({ active: packet?.assistantContext?.activeStep?.sourceRevisions, result: (pythonOutput.response.course_research_result as { sourceRevisions?: unknown })?.sourceRevisions })}`
  );
  assert.equal(binding.boundCandidateCount, 4);
  assert.ok(binding.result);
  assert.equal(
    courseResearchResultMatchesTask({
      result: binding.result,
      projectId,
      chatId,
      task,
    }),
    true
  );
  assert.equal(
    courseResearchResultIsCurrent({ result: binding.result, task }),
    true
  );
  assert.equal(
    binding.result.candidates[0]?.identityEvidenceLevel,
    "official_source_referenced"
  );
  assert.equal(
    binding.result.candidates[0]?.fields.find(
      (field) => field.key === "cricos_code"
    )?.evidenceLevel,
    "official_source_referenced"
  );
  assert.equal(
    binding.result.candidates[0]?.fields.find(
      (field) => field.key === "tuition_amount"
    )?.value,
    null
  );
  assert.equal(
    binding.result.candidates[2]?.fields.find(
      (field) => field.key === "course_code"
    )?.evidenceLevel,
    "model_research_lead"
  );
  assert.equal(
    binding.result.candidates[3]?.identityEvidenceLevel,
    "model_research_lead"
  );
  assert.deepEqual(binding.result.candidates[3]?.sources, []);

  const frontendDiagnostics = courseResearchDiagnosticsSchema.parse({
    ...backendDiagnostics,
    frontend_binding_status: binding.status,
    frontend_binding_reason: binding.reason,
    frontend_bound_candidate_count: binding.boundCandidateCount,
  });
  const publicAnswer = preservePublicAnswer({
    backendAnswer: pythonOutput.response.answer,
    emptyFallback: "No answer was returned.",
    forbiddenFallback: "The answer could not be displayed.",
  });
  assert.equal(publicAnswer.preservedBackendAnswer, true);
  assert.doesNotMatch(publicAnswer.text, /turn\d+search\d+/u);
  assert.doesNotMatch(publicAnswer.text, /[\uE200-\uE20F]/u);
  const parts = buildAssistantMessageParts({
    text: publicAnswer.text,
    metadata: {
      citations: pythonOutput.response.citations,
      compactSources: pythonOutput.response.compact_sources,
      courseResearchResult: binding.result,
      retrievalDebug: {
        defaultAgentRuntime: {
          ...runtimeDebug,
          course_research: frontendDiagnostics,
        },
      },
    },
  });
  const reloaded = extractAssistantMetadata(parts);
  assert.equal(reloaded.courseResearchResult?.candidates.length, 4);
  assert.equal(reloaded.citations.length, 4);
  assert.deepEqual(
    reloaded.compactSources,
    pythonOutput.response.compact_sources
  );
  const persistedDiagnostics = courseResearchDiagnosticsSchema.parse(
    (reloaded.retrievalDebug as Record<string, any>).defaultAgentRuntime
      .course_research
  );
  assert.equal(persistedDiagnostics.frontend_binding_status, "bound");
  assert.equal(persistedDiagnostics.frontend_bound_candidate_count, 4);
  assert.equal(reloaded.courseResearchResult?.candidates.length, 4);
  assert.ok(
    courseResearchDiagnosticsForTask({
      value: persistedDiagnostics,
      projectId,
      chatId,
      task,
    })
  );
  const persistedResult = reloaded.courseResearchResult;
  assert.ok(persistedResult);
  const workspaceCandidate = persistedResult.candidates[0];
  assert.ok(workspaceCandidate);
  const workspaceSelection = courseResearchSelection({
    result: persistedResult,
    task,
    candidate: workspaceCandidate,
  });
  assert.equal(workspaceSelection.candidateId, workspaceCandidate.candidateId);
  assert.deepEqual(
    workspaceSelection.selection.sourceRevisions,
    task.sourceRevisions
  );
});

test("unavailable state is explicit and is not presented as empty complete data", async () => {
  const result = await refreshProjectAssistantContext({
    actorUserId: "owner",
    actorType: "regular",
    resolved: {
      projectId: "project-a",
      packet: null,
      diagnostic: "no_authorized_content",
      refreshBeforeProvider: async () => null,
    },
    loadState: async () => ({ kind: "unavailable" }),
  });
  assert.equal(result?.assistantContext?.availability, "unavailable");
  assert.equal(result?.assistantContext?.matters.schoolApplications, null);
});

test("all widget schemas discard browser-supplied Project context fields", async () => {
  const {
    fastWidgetRequestSchema,
    legalCheckWidgetRequestSchema,
    premiumWidgetRequestSchema,
  } = await import("@/lib/conversations/widget-turn-schemas");
  const body = {
    id: "11111111-1111-4111-8111-111111111111",
    messages: [
      { id: "message", role: "user", parts: [{ type: "text", text: "Hello" }] },
    ],
    selectedChatModel: "synthetic",
    project_assistant_context: { project: { id: "forged-project" } },
    project_context: { project_id: "forged-project" },
  };
  for (const schema of [
    fastWidgetRequestSchema,
    legalCheckWidgetRequestSchema,
    premiumWidgetRequestSchema,
  ]) {
    const parsed = schema.parse(body);
    assert.equal("project_assistant_context" in parsed, false);
    assert.equal("project_context" in parsed, false);
  }
});
