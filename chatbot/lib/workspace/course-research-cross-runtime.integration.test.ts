import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildProjectJourney } from "./project-journey";
import {
  buildProjectState,
  type ProjectStateInput,
} from "./project-state";
import { activeStepSelectionForTask } from "./active-step-context";
import { refreshProjectAssistantContext } from "@/lib/projects/project-assistant-refresh";
import type { ResolvedProjectContext } from "@/lib/projects/context-resolver";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildAssistantMessageParts,
  extractAssistantMetadata,
} from "../conversations/message-parts";
import {
  bindCourseResearchResult,
  courseResearchScopeFingerprint,
  courseResearchSelectionScopeFingerprint,
} from "./course-research";

const projectId = "11111111-1111-4111-8111-111111111111";
const chatId = "22222222-2222-4222-8222-222222222222";
const schoolId = "33333333-3333-4333-8333-333333333333";
const assistantMessageId = "44444444-4444-4444-8444-444444444444";
type ProducerCandidate = {
  candidateId: string;
  identityEvidenceLevel: string;
  sources: Array<{ sourceId: string; observedAt: string }>;
  fields: Array<{
    key: string;
    evidenceLevel: string;
    sourceIds: string[];
  }>;
};
type ProducerResult = {
  [key: string]: unknown;
  projectId: string;
  chatId: string;
  targetId: string;
  taskId: string;
  definitionVersion: string;
  workflowKind: string;
  stepKey: string;
  targetKind: string;
  sourceRevisions: Record<string, unknown>[];
  observedAt: string;
  candidates: ProducerCandidate[];
};
const pythonWorkingDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../legal-service"
);

function runPythonProducer() {
  const source = `
import json
import sys
sys.path.insert(0, "tests")
from test_phase15_m3_e3_r3_course_research_bridge import _context, _registry, _suggestion, CHAT_ID
from app.services.course_research_bridge import bind_course_research_suggestion

registry, _ = _registry(cited=True)
suggestion = _suggestion()
suggestion["candidates"].append({
    "institution_name": "Plain Institute",
    "course_title": "Bachelor of Plain Studies",
    "identity_source_locators": [],
    "fields": [{"key": "duration", "value": "Three years", "source_locators": []}],
    "source_locators": [],
    "limitations": ["No source was cited or independently checked."],
})
result = bind_course_research_suggestion(
    raw=suggestion, context=_context(), frontend_chat_id=CHAT_ID, registry=registry
)
if result is None:
    raise RuntimeError("actual Python producer returned no result")
print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
`;
  const approvedPython = "/home/rico/anaconda3/envs/torch/bin/python";
  const python =
    process.env.PHASE15_R4_PYTHON ??
    process.env.PYTHON ??
    (existsSync(approvedPython) ? approvedPython : "python3");
  const output = spawnSync(python, ["-c", source], {
    cwd: pythonWorkingDirectory,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 1_000_000,
  });
  if (output.status !== 0) {
    throw new Error(
      `Python course producer failed: ${output.stderr || output.error?.message || "unknown error"}`
    );
  }
  return JSON.parse(output.stdout) as ProducerResult;
}

function runDefaultRuntimeFixture(projectAssistantContext: unknown) {
  const fixturePath = resolve(
    pythonWorkingDirectory,
    "tests/phase15_m3_e3_r5_cross_runtime_fixture.py"
  );
  const approvedPython = "/home/rico/anaconda3/envs/torch/bin/python";
  const python =
    process.env.PHASE15_R4_PYTHON ??
    process.env.PYTHON ??
    (existsSync(approvedPython) ? approvedPython : "python3");
  const output = spawnSync(python, [fixturePath], {
    cwd: pythonWorkingDirectory,
    encoding: "utf8",
    env: process.env,
    input: JSON.stringify({
      frontend_chat_id: chatId,
      project_assistant_context: projectAssistantContext,
      question: "Compare the verified public course information for this task.",
      response_language: "en",
    }),
    maxBuffer: 1_000_000,
    timeout: 45_000,
  });
  if (output.status !== 0) {
    throw new Error(
      `Python Default runtime fixture failed: ${output.stderr || output.error?.message || "unknown error"}`
    );
  }
  return JSON.parse(output.stdout) as {
    activation_reason: string;
    course_research_enabled: boolean;
    provider_calls: number;
    provider_schema_required: boolean;
    submission_accepted_count: number;
    response: {
      retrieval_debug?: {
        course_research?: Record<string, unknown>;
      };
    };
  };
}

function syntheticServerResolvedContext(): {
  state: ReturnType<typeof buildProjectState>;
  resolved: ResolvedProjectContext;
} {
  const timestamp = "2026-11-24T00:00:00.000Z";
  const projectStateInput: ProjectStateInput = {
    admissionsCases: [],
    capabilities: {
      projectDocuments: { reasonCode: null, state: "disabled" },
      projectFacts: { reasonCode: null, state: "available" },
      schoolAdmissions: { reasonCode: null, state: "available" },
      schoolApplications: { reasonCode: null, state: "available" },
      serviceEngagements: { reasonCode: null, state: "available" },
      student500: { reasonCode: null, state: "available" },
      student500Preparation: { reasonCode: null, state: "available" },
      submissionPackages: { reasonCode: null, state: "unsupported" },
    },
    facts: { authorizedForAI: [], conflictCount: 0, state: "available" },
    generatedAt: timestamp,
    project: { id: projectId, revision: 9, status: "active" },
    schoolApplications: [
      {
        applicationId: schoolId,
        archivedAt: null,
        course: { catalogId: null, title: "Synthetic Course" },
        createdAt: timestamp,
        events: [],
        institution: { catalogId: null, name: "Synthetic Institution" },
        intake: { id: null, label: "2027" },
        latestPackage: null,
        missingDataCodes: [],
        packageStale: false,
        projectId,
        revision: 2,
        source: { status: "unverified_customer_declared" },
        staleReasonCodes: [],
        status: "draft",
        updatedAt: timestamp,
      },
    ],
    serviceEngagements: [],
    student500Applications: [],
    student500PreparationCapability: "available",
    student500Preparations: [],
  };
  const state = buildProjectState(projectStateInput);
  const resolved: ResolvedProjectContext = {
    diagnostic: "no_authorized_content",
    packet: null,
    projectId,
    refreshBeforeProvider: async () => ({
      schemaVersion: "phase13.project-context.v1",
      contextOrigin: "project_chat",
      projectId,
      confirmedProjectFacts: [],
      documentEvidence: [],
    }),
  };
  return { state, resolved };
}

function contextFor(value: ProducerResult) {
  const {
    chatId,
    definitionVersion,
    projectId,
    sourceRevisions,
    stepKey,
    targetId,
    targetKind,
    taskId,
    workflowKind,
  } = value;
  return {
    schemaVersion: "phase15.project-assistant-context.v1",
    contextOrigin: "project_chat",
    availability: "available",
    reasonCode: null,
    consistency: "live_per_source_revision",
    project: { id: projectId, status: "active" },
    capabilities: null,
    facts: null,
    factContext: { state: "unknown", omitted: null },
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
    activeStep: {
      schemaVersion: "phase15.active-step-context.v1",
      chatId,
      projectId,
      definitionVersion,
      taskId,
      workflowKind,
      stepKey,
      targetKind,
      targetId,
      sourceCoverage: "unavailable",
      sourceRevisions,
      task: {
        applicability: "unavailable",
        progress: "unknown",
        reasonCodes: ["school_course_source_unverified"],
        dependencies: [],
        actionability: "unavailable",
      },
      matter: null,
    },
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
}

test("actual Python course output binds in TypeScript and survives message metadata reload", () => {
  const wire = runPythonProducer();
  assert.equal(wire.projectId, projectId);
  assert.equal(wire.chatId, chatId);
  assert.equal(wire.targetId, schoolId);
  assert.match(wire.observedAt, /Z$/u);
  assert.equal(Number.isFinite(Date.parse(wire.observedAt)), true);

  const sourceBearing = wire.candidates[0];
  const sourceFree = wire.candidates[1];
  assert.ok(sourceBearing);
  assert.ok(sourceBearing.sources.length > 0);
  assert.ok(sourceFree);
  assert.equal(sourceFree.sources.length, 0);

  const bound = bindCourseResearchResult({
    value: wire,
    projectId,
    chatId,
    assistantMessageId,
    context: contextFor(wire) as never,
  });
  assert.ok(
    bound,
    "Zoned Python output must bind at the actual TypeScript boundary"
  );
  assert.equal(bound.assistantMessageId, assistantMessageId);
  assert.equal(bound.candidates[0]?.candidateId, sourceBearing.candidateId);
  assert.equal(bound.candidates[1]?.candidateId, sourceFree.candidateId);
  assert.equal(
    bound.candidates[0]?.identityEvidenceLevel,
    "official_source_referenced"
  );
  assert.equal(
    bound.candidates[0]?.fields.find((field) => field.key === "course_code")
      ?.evidenceLevel,
    "official_source_referenced"
  );
  assert.equal(
    bound.candidates[0]?.fields.find((field) => field.key === "tuition_amount")
      ?.evidenceLevel,
    "model_research_lead"
  );
  assert.equal(
    bound.candidates[1]?.identityEvidenceLevel,
    "model_research_lead"
  );
  assert.equal(
    bound.candidates[1]?.fields[0]?.evidenceLevel,
    "model_research_lead"
  );
  const boundSource = bound.candidates[0]?.sources[0];
  assert.ok(boundSource);
  assert.match(boundSource.observedAt, /Z$/u);
  assert.equal(Number.isFinite(Date.parse(boundSource.observedAt)), true);
  assert.deepEqual(
    bound.candidates[0]?.fields.find((field) => field.key === "course_code")
      ?.sourceIds,
    [boundSource.sourceId]
  );

  const parts = buildAssistantMessageParts({
    text: "I found course research leads.",
    metadata: { courseResearchResult: bound },
  });
  const reloaded = extractAssistantMetadata(parts).courseResearchResult;
  assert.deepEqual(reloaded, bound);
  assert.equal(
    reloaded?.candidates[0]?.sources[0]?.observedAt,
    boundSource.observedAt
  );
});

test("the TypeScript envelope rejects invalid, offset-only and timezone-less observation times", () => {
  const wire = runPythonProducer();
  const invalidValues = [
    "not-a-timestamp",
    "2026-02-30T12:00:00.000Z",
    "2026-11-24T12:00:00.000000",
    "2026-11-24T12:00:00.000000+00:00",
  ];
  for (const timestamp of invalidValues) {
    const invalidEnvelope = structuredClone(wire);
    invalidEnvelope.observedAt = timestamp;
    assert.equal(
      bindCourseResearchResult({
        value: invalidEnvelope,
        projectId,
        chatId,
        assistantMessageId,
        context: contextFor(invalidEnvelope) as never,
      }),
      null,
      timestamp
    );
  }

  for (const timestamp of invalidValues) {
    const invalidSourceTime = structuredClone(wire);
    const firstSource = invalidSourceTime.candidates[0]?.sources[0];
    assert.ok(firstSource);
    firstSource.observedAt = timestamp;
    assert.equal(
      bindCourseResearchResult({
        value: invalidSourceTime,
        projectId,
        chatId,
        assistantMessageId,
        context: contextFor(invalidSourceTime) as never,
      }),
      null,
      `source timestamp ${timestamp}`
    );
  }
});

test("the authenticated server resolver carries the selected unverified School Discovery task into the serialized Python context", async () => {
  const { resolved, state } = syntheticServerResolvedContext();
  const tasks = buildProjectJourney(state).workflowProjection.tasks;
  const discoveryTask = tasks.find(
    (task) =>
      task.targetKind === "school_application" &&
      task.targetId === schoolId &&
      task.stepKey === "school_discovery"
  );
  const planningTask = tasks.find(
    (task) =>
      task.targetKind === "school_application" &&
      task.targetId === schoolId &&
      task.stepKey === "planning"
  );
  assert.ok(discoveryTask);
  assert.ok(planningTask);

  const discoverySelection = activeStepSelectionForTask(discoveryTask);
  const resolvedDiscovery = await refreshProjectAssistantContext({
    actorUserId: "55555555-5555-4555-8555-555555555555",
    actorType: "regular",
    chatId,
    activeStepSelection: discoverySelection,
    resolved,
    loadState: async () => ({ kind: "ok", state }),
  });
  const discoveryContext = resolvedDiscovery?.assistantContext;
  const activeStep = discoveryContext?.activeStep;
  assert.ok(activeStep);
  assert.equal(activeStep.workflowKind, "school_application");
  assert.equal(activeStep.stepKey, "school_discovery");
  assert.equal(activeStep.targetKind, "school_application");
  assert.equal(activeStep.targetId, schoolId);
  assert.equal(activeStep.sourceCoverage, "unavailable");
  assert.deepEqual(activeStep.task.reasonCodes, [
    "school_course_source_unverified",
  ]);
  assert.equal(
    courseResearchSelectionScopeFingerprint({
      chatId,
      selection: discoverySelection,
    }),
    courseResearchScopeFingerprint({
      projectId,
      chatId,
      activeStep,
    })
  );

  await writeFile(
    "/tmp/phase15-m3-e3-r6-context.json",
    JSON.stringify({
      frontend_chat_id: chatId,
      project_assistant_context: discoveryContext,
      __expected_scope_fingerprint: courseResearchScopeFingerprint({
        projectId,
        chatId,
        activeStep,
      }),
      question: "Compare verified public course information.",
      response_language: "en",
    })
  );

  const planningContext = await refreshProjectAssistantContext({
    actorUserId: "55555555-5555-4555-8555-555555555555",
    actorType: "regular",
    chatId,
    activeStepSelection: activeStepSelectionForTask(planningTask),
    resolved,
    loadState: async () => ({ kind: "ok", state }),
  });
  assert.equal(planningContext?.assistantContext?.activeStep?.stepKey, "planning");
});
