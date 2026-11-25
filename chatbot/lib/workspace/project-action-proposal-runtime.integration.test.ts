// biome-ignore-all lint/suspicious/noExplicitAny: isolated server-route fakes use one synthetic shared fixture.
// biome-ignore-all lint/performance/noNamespaceImport: Node 24 test hooks are absent from installed Node type declarations.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { buildProjectState } from "./project-state";
import { buildProjectWorkflowProjection } from "./project-workflows";

const projectId = "11111111-1111-4111-8111-111111111111";
const chatId = "22222222-2222-4222-8222-222222222222";
const schoolAId = "33333333-3333-4333-8333-333333333333";
const schoolBId = "44444444-4444-4444-8444-444444444444";
const student500Id = "55555555-5555-4555-8555-555555555555";
const stamp = "2026-11-24T00:00:00.000000Z";
const f = globalThis as any;
const schoolRows = new Map<string, Record<string, any>>();
const student500Rows = new Map<string, Record<string, any>>();
const messages = new Map<string, Record<string, any>>();
const operations = new Map<
  string,
  { body: string; application: Record<string, any> }
>();

function makeSchool(id: string, name: string, intakeLabel: string) {
  return {
    applicationId: id,
    projectId,
    revision: 10,
    status: "draft",
    institution: { name, catalogId: null },
    course: { title: `Recorded ${name} course`, catalogId: null },
    deliveryId: null,
    intake: { id: null, label: intakeLabel },
    source: { status: "customer_reported" },
    missingDataCodes: ["intake_missing"],
    packageStale: false,
    currentPackage: {
      contentSha256: "a".repeat(64),
      inputsSha256: "b".repeat(64),
      packageId: `package-${id}`,
      staleReasonCodes: [],
      status: "current",
      usable: true,
      version: 1,
    },
    staleReasonCodes: [],
    createdAt: stamp,
    updatedAt: stamp,
    archivedAt: null,
    events: [],
  };
}

function loadState() {
  const schools = [...schoolRows.values()].map((application) => ({
    applicationId: application.applicationId,
    projectId,
    status: application.archivedAt
      ? "archived"
      : application.currentPackage.status,
    revision: application.revision,
    institution: application.institution,
    course: application.course,
    intake: application.intake,
    source: { status: application.source.status },
    missingDataCodes: application.missingDataCodes,
    packageStale: application.currentPackage.status !== "current",
    latestPackage: application.currentPackage,
    staleReasonCodes: application.currentPackage.staleReasonCodes,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    archivedAt: application.archivedAt,
    events: [],
  }));
  const student500Applications = [...student500Rows.values()].map(
    (application) => ({
      applicationId: application.applicationId,
      projectId,
      status: application.status,
      revision: application.revision,
      context: {
        applicationPlace: application.context.applicationPlace,
        entryRoute: application.context.entryRoute,
        coeStatus: application.context.coeStatus,
        schoolApplicationId: application.context.schoolApplicationId,
      },
      screening: {
        missingFactCodes: [],
        sourceVerification: "unavailable",
      },
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      archivedAt: application.archivedAt,
      events: [],
    })
  );
  return buildProjectState({
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
    generatedAt: stamp,
    project: {
      id: projectId,
      revision: 1,
      status: f.__e3Runtime.closed ? "closed" : "active",
    },
    schoolApplications: schools,
    serviceEngagements: [],
    student500Applications,
    student500PreparationCapability: "available",
    student500Preparations: [],
  });
}

function _jsonApplication(application: Record<string, any>, replayed = false) {
  return Response.json({ application: structuredClone(application), replayed });
}

const dependencyModules: Record<string, string> = {
  "@/app/(auth)/auth":
    "export const auth = async () => globalThis.__e3Runtime.session;",
  "@/lib/projects/context-resolver":
    "export const resolveProjectContext = async ({ chatId }) => ({ projectId: globalThis.__e3Runtime.revoked || chatId !== globalThis.__e3Runtime.chatId ? null : globalThis.__e3Runtime.projectId });",
  "@/lib/db/queries":
    "export const getMessageById = async ({ id }) => { const row = globalThis.__e3Runtime.messages.get(id); return row ? [structuredClone(row)] : []; };",
  "@/lib/school-applications/runtime": `
    export const schoolApplicationHandlers = {
      get: async (_request, projectId, targetId) => {
        const runtime = globalThis.__e3Runtime;
        runtime.reads += 1;
        const application = runtime.schoolRows.get(targetId);
        if (projectId !== runtime.projectId || !application) return Response.json({ error: 'not found' }, { status: 404 });
        return Response.json({ application: structuredClone(application) });
      },
      update: async (request, projectId, targetId) => {
        const runtime = globalThis.__e3Runtime;
        const body = await request.json();
        runtime.updateAttempts += 1;
        const application = runtime.schoolRows.get(targetId);
        if (projectId !== runtime.projectId || !application) return Response.json({ error: 'not found' }, { status: 404 });
        if (runtime.writeGateClosed) return Response.json({ error: 'disabled' }, { status: 503 });
        const prior = runtime.operations.get(body.operationId);
        if (prior) {
          if (prior.body !== JSON.stringify(body)) return Response.json({ error: 'idempotency conflict' }, { status: 409 });
          return Response.json({ application: structuredClone(prior.application), replayed: true });
        }
        if (application.archivedAt || application.revision !== body.expectedRevision) return Response.json({ error: 'revision conflict' }, { status: 409 });
        const updated = {
          ...application,
          revision: application.revision + 1,
          institution: { name: body.institutionName, catalogId: body.institutionId },
          course: { title: body.courseTitle, catalogId: body.courseId },
          deliveryId: body.deliveryId,
          intake: { id: body.intakeId, label: body.intakeLabel },
          currentPackage: { ...application.currentPackage, status: 'stale', usable: false, staleReasonCodes: ['material_inputs_changed'] },
        };
        runtime.schoolRows.set(targetId, updated);
        runtime.writes += 1;
        runtime.operations.set(body.operationId, { body: JSON.stringify(body), application: structuredClone(updated) });
        return Response.json({ application: structuredClone(updated), replayed: false });
      },
    };
  `,
  "@/lib/student-500/contracts":
    "export const STUDENT_500_APPLICATION_PLACES = ['onshore', 'offshore', 'unknown'];",
  "@/lib/student-500/runtime": `
    export const student500Handlers = {
      get: async (_request, projectId, targetId) => {
        const runtime = globalThis.__e3Runtime;
        runtime.reads += 1;
        const application = runtime.student500Rows.get(targetId);
        if (projectId !== runtime.projectId || !application) return Response.json({ error: 'not found' }, { status: 404 });
        return Response.json({ application: structuredClone(application) });
      },
      update: async (request, projectId, targetId) => {
        const runtime = globalThis.__e3Runtime;
        const body = await request.json();
        runtime.updateAttempts += 1;
        const application = runtime.student500Rows.get(targetId);
        if (projectId !== runtime.projectId || !application) return Response.json({ error: 'not found' }, { status: 404 });
        if (runtime.writeGateClosed) return Response.json({ error: 'disabled' }, { status: 503 });
        const prior = runtime.operations.get(body.operationId);
        if (prior) {
          if (prior.body !== JSON.stringify(body)) return Response.json({ error: 'idempotency conflict' }, { status: 409 });
          return Response.json({ application: structuredClone(prior.application), replayed: true });
        }
        if (application.archivedAt || application.revision !== body.expectedRevision) return Response.json({ error: 'revision conflict' }, { status: 409 });
        const updated = { ...application, revision: application.revision + 1, context: structuredClone(body.context) };
        runtime.student500Rows.set(targetId, updated);
        runtime.writes += 1;
        runtime.operations.set(body.operationId, { body: JSON.stringify(body), application: structuredClone(updated) });
        return Response.json({ application: structuredClone(updated), replayed: false });
      },
    };
  `,
  "@/lib/workspace/project-state-server":
    "export const loadProjectStateForActor = async () => ({ kind: 'ok', state: globalThis.__e3Runtime.loadState() });",
};

const tempDir = mkdtempSync(join(tmpdir(), "phase15-e3-action-runtime-"));
const mockUrls = Object.fromEntries(
  Object.entries(dependencyModules).map(([name, source], index) => {
    const filename = join(tempDir, `mock-${index}.mjs`);
    writeFileSync(filename, source);
    return [name, pathToFileURL(filename).href];
  })
);
for (const name of [
  "@/lib/workspace/active-step-context",
  "@/lib/workspace/project-workflows",
]) {
  mockUrls[name] = pathToFileURL(
    resolve(process.cwd(), `${name.replace("@/", "")}.ts`)
  ).href;
}
type ResolutionContext = Record<string, unknown>;
type Resolution = { url: string; shortCircuit?: boolean };
type NextResolve = (
  specifier: string,
  context: ResolutionContext
) => Resolution;
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: ResolutionContext,
      nextResolve: NextResolve
    ) => Resolution;
  }) => unknown;
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = mockUrls[specifier];
    return url ? { url, shortCircuit: true } : nextResolve(specifier, context);
  },
});

function request(path: string, body: unknown) {
  return new Request(`http://localhost/api/projects/${projectId}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

function persistCourseResearch(
  task: NonNullable<
    ReturnType<typeof buildProjectWorkflowProjection>["tasks"][number]
  >,
  override: {
    institutionName?: string;
    courseTitle?: string;
    intakeLabel?: string;
  } = {}
) {
  const assistantMessageId = "66666666-6666-4666-8666-666666666666";
  const candidateId = "77777777-7777-4777-8777-777777777777";
  const result = {
    schemaVersion: "phase15.course-research-result.v1",
    projectId,
    chatId,
    assistantMessageId,
    taskId: task.taskId,
    definitionVersion: task.definitionVersion,
    workflowKind: task.workflowKind,
    stepKey: task.stepKey,
    targetKind: task.targetKind,
    targetId: task.targetId,
    sourceRevisions: task.sourceRevisions.map((item) => ({ ...item })),
    observedAt: stamp,
    candidates: [
      {
        candidateId,
        institutionName: override.institutionName ?? "New Example University",
        courseTitle: override.courseTitle ?? "Master of Example Studies",
        identityEvidenceLevel: "model_research_lead",
        identitySourceIds: [],
        fields: [
          {
            key: "intake",
            value: override.intakeLabel ?? "July 2027",
            evidenceLevel: "model_research_lead",
            sourceIds: [],
            applicabilityNote: null,
            independentObservation: null,
          },
        ],
        sources: [],
        limitations: [
          "Candidate is a research lead and is not independently verified.",
        ],
        verificationState: "not_requested",
      },
    ],
    limitations: ["Native web evidence is not fetched source text."],
    diagnostics: { invalidCandidateCount: 0 },
  };
  messages.set(assistantMessageId, {
    id: assistantMessageId,
    chatId,
    role: "assistant",
    parts: [{ type: "metadata", courseResearchResult: result }],
  });
  return { assistantMessageId, candidateId, result };
}

type ActionProposalRuntimeTestHandlers = {
  createActionProposal(request: Request, projectId: string): Promise<Response>;
  confirmActionProposal(request: Request, projectId: string): Promise<Response>;
};

test("preview and cancel perform no write; explicit confirmation updates only School A with CAS, replay and readback", async () => {
  process.env.AUTH_SECRET = "synthetic-e3-route-test-secret";
  schoolRows.clear();
  operations.clear();
  schoolRows.set(schoolAId, makeSchool(schoolAId, "Northbridge", "March 2027"));
  schoolRows.set(schoolBId, makeSchool(schoolBId, "Harbour", "October 2027"));
  f.__e3Runtime = {
    chatId,
    projectId,
    session: { user: { id: "synthetic-owner", type: "regular" } },
    schoolRows,
    messages,
    operations,
    reads: 0,
    updateAttempts: 0,
    writes: 0,
    revoked: false,
    closed: false,
    writeGateClosed: false,
    loadState,
  };

  const runtimeModule = (await import(
    "./project-action-proposal-runtime"
  )) as unknown as {
    default?: ActionProposalRuntimeTestHandlers;
    createActionProposal?: ActionProposalRuntimeTestHandlers["createActionProposal"];
    confirmActionProposal?: ActionProposalRuntimeTestHandlers["confirmActionProposal"];
  };
  const runtime = (runtimeModule.default ??
    runtimeModule) as ActionProposalRuntimeTestHandlers;
  const state = loadState();
  const task = buildProjectWorkflowProjection(state).tasks.find(
    (entry) =>
      entry.stepKey === "school_discovery" && entry.targetId === schoolAId
  );
  assert.ok(task, "School A discovery task must be present");
  assert.equal(task.applicability, "unavailable");
  assert.deepEqual(task.reasonCodes, ["school_course_source_unverified"]);
  const selection = {
    schemaVersion: "phase15.active-step-selection.v1",
    projectId,
    taskId: task.taskId,
    workflowKind: task.workflowKind,
    definitionVersion: task.definitionVersion,
    stepKey: task.stepKey,
    targetKind: task.targetKind,
    targetId: task.targetId,
    sourceRevisions: task.sourceRevisions,
  };

  const previewResponse = await runtime.createActionProposal(
    request("action-proposals", {
      chatId,
      selection,
      fieldPath: "schoolApplication.intakeLabel",
      proposedValue: "July 2027",
    }),
    projectId
  );
  assert.equal(
    previewResponse.status,
    200,
    JSON.stringify(await previewResponse.clone().json())
  );
  const preview = await previewResponse.json();
  assert.equal(preview.proposal.targetId, schoolAId);
  assert.equal(preview.proposal.baseRevision, 10);
  assert.equal(f.__e3Runtime.writes, 0);
  assert.equal(f.__e3Runtime.updateAttempts, 0);
  assert.equal(schoolRows.get(schoolAId)?.intake.label, "March 2027");

  const mismatchResponse = await runtime.createActionProposal(
    request("action-proposals", {
      chatId,
      selection: { ...selection, targetId: schoolBId },
      fieldPath: "schoolApplication.intakeLabel",
      proposedValue: "July 2027",
    }),
    projectId
  );
  assert.equal(mismatchResponse.status, 409);
  assert.equal(f.__e3Runtime.writes, 0);

  const confirmRequest = () =>
    request("action-proposals/confirm", {
      confirmationToken: preview.confirmationToken,
    });
  const confirmed = await runtime.confirmActionProposal(
    confirmRequest(),
    projectId
  );
  assert.equal(confirmed.status, 200);
  const result = await confirmed.json();
  assert.equal(result.readback, "verified");
  assert.equal(result.revision, 11);
  assert.equal(result.application.intake.label, "July 2027");
  assert.equal(result.application.currentPackage.status, "stale");
  assert.equal(schoolRows.get(schoolBId)?.revision, 10);
  assert.equal(schoolRows.get(schoolBId)?.intake.label, "October 2027");
  assert.equal(f.__e3Runtime.writes, 1);
  assert.equal(f.__e3Runtime.updateAttempts, 1);

  const replay = await runtime.confirmActionProposal(
    confirmRequest(),
    projectId
  );
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);
  assert.equal(f.__e3Runtime.writes, 1);
  assert.equal(f.__e3Runtime.updateAttempts, 2);
  assert.equal(f.__e3Runtime.reads, 5);
});

test("revoked Project access and an owning-service write gate fail closed", async () => {
  process.env.AUTH_SECRET = "synthetic-e3-route-test-secret";
  schoolRows.clear();
  operations.clear();
  schoolRows.set(schoolAId, makeSchool(schoolAId, "Northbridge", "March 2027"));
  f.__e3Runtime = {
    chatId,
    projectId,
    session: { user: { id: "synthetic-owner", type: "regular" } },
    schoolRows,
    messages,
    operations,
    reads: 0,
    updateAttempts: 0,
    writes: 0,
    revoked: false,
    closed: false,
    writeGateClosed: false,
    loadState,
  };
  const runtimeModule = (await import(
    "./project-action-proposal-runtime"
  )) as unknown as {
    default?: ActionProposalRuntimeTestHandlers;
    createActionProposal?: ActionProposalRuntimeTestHandlers["createActionProposal"];
    confirmActionProposal?: ActionProposalRuntimeTestHandlers["confirmActionProposal"];
  };
  const runtime = (runtimeModule.default ??
    runtimeModule) as ActionProposalRuntimeTestHandlers;
  const task = buildProjectWorkflowProjection(loadState()).tasks.find(
    (entry) =>
      entry.stepKey === "school_discovery" && entry.targetId === schoolAId
  );
  assert.ok(task);
  const body = {
    chatId,
    selection: {
      schemaVersion: "phase15.active-step-selection.v1",
      projectId,
      taskId: task.taskId,
      workflowKind: task.workflowKind,
      definitionVersion: task.definitionVersion,
      stepKey: task.stepKey,
      targetKind: task.targetKind,
      targetId: task.targetId,
      sourceRevisions: task.sourceRevisions,
    },
    fieldPath: "schoolApplication.intakeLabel",
    proposedValue: "July 2027",
  };
  f.__e3Runtime.revoked = true;
  const revoked = await runtime.createActionProposal(
    request("action-proposals", body),
    projectId
  );
  assert.equal(revoked.status, 409);
  assert.equal(f.__e3Runtime.writes, 0);

  f.__e3Runtime.revoked = false;
  f.__e3Runtime.writeGateClosed = true;
  const previewResponse = await runtime.createActionProposal(
    request("action-proposals", body),
    projectId
  );
  assert.equal(
    previewResponse.status,
    200,
    JSON.stringify(await previewResponse.clone().json())
  );
  const preview = await previewResponse.json();
  const confirmation = await runtime.confirmActionProposal(
    request("action-proposals/confirm", {
      confirmationToken: preview.confirmationToken,
    }),
    projectId
  );
  assert.equal(confirmation.status, 503);
  assert.equal(f.__e3Runtime.writes, 0);
});

test("a post-preview revision change and a closed Project cannot be overwritten", async () => {
  process.env.AUTH_SECRET = "synthetic-e3-route-test-secret";
  schoolRows.clear();
  operations.clear();
  schoolRows.set(schoolAId, makeSchool(schoolAId, "Northbridge", "March 2027"));
  f.__e3Runtime = {
    chatId,
    projectId,
    session: { user: { id: "synthetic-owner", type: "regular" } },
    schoolRows,
    messages,
    operations,
    reads: 0,
    updateAttempts: 0,
    writes: 0,
    revoked: false,
    closed: false,
    writeGateClosed: false,
    loadState,
  };
  const runtimeModule = (await import(
    "./project-action-proposal-runtime"
  )) as unknown as {
    default?: ActionProposalRuntimeTestHandlers;
    createActionProposal?: ActionProposalRuntimeTestHandlers["createActionProposal"];
    confirmActionProposal?: ActionProposalRuntimeTestHandlers["confirmActionProposal"];
  };
  const runtime = (runtimeModule.default ??
    runtimeModule) as ActionProposalRuntimeTestHandlers;
  const task = buildProjectWorkflowProjection(loadState()).tasks.find(
    (entry) =>
      entry.stepKey === "school_discovery" && entry.targetId === schoolAId
  );
  assert.ok(task);
  const selection = {
    schemaVersion: "phase15.active-step-selection.v1",
    projectId,
    taskId: task.taskId,
    workflowKind: task.workflowKind,
    definitionVersion: task.definitionVersion,
    stepKey: task.stepKey,
    targetKind: task.targetKind,
    targetId: task.targetId,
    sourceRevisions: task.sourceRevisions,
  };
  const proposalBody = {
    chatId,
    selection,
    fieldPath: "schoolApplication.intakeLabel",
    proposedValue: "July 2027",
  };
  const previewResponse = await runtime.createActionProposal(
    request("action-proposals", proposalBody),
    projectId
  );
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();

  schoolRows.set(schoolAId, {
    ...schoolRows.get(schoolAId),
    revision: 12,
    intake: { id: null, label: "October 2027" },
  });
  const staleConfirmation = await runtime.confirmActionProposal(
    request("action-proposals/confirm", {
      confirmationToken: preview.confirmationToken,
    }),
    projectId
  );
  assert.equal(staleConfirmation.status, 409);
  assert.equal((await staleConfirmation.json()).error, "revision_conflict");
  assert.equal(schoolRows.get(schoolAId)?.intake.label, "October 2027");
  assert.equal(f.__e3Runtime.writes, 0);

  f.__e3Runtime.closed = true;
  const closedProjectPreview = await runtime.createActionProposal(
    request("action-proposals", proposalBody),
    projectId
  );
  assert.equal(closedProjectPreview.status, 409);
  assert.equal(f.__e3Runtime.writes, 0);
});

test("Student 500 confirmation preserves the full reported context and does not invent CoE or visa status", async () => {
  process.env.AUTH_SECRET = "synthetic-e3-route-test-secret";
  schoolRows.clear();
  student500Rows.clear();
  operations.clear();
  const originalContext = {
    entryRoute: "direct",
    coeStatus: "unknown",
    applicationPlace: "unknown",
    asOfDate: "2026-11-01",
    currentVisaSubclass: "500",
    historyDeclaration: "declared",
    historyFlags: [{ flag: "prior_refusal", reportedOn: "2024-01-01" }],
    applicantAgeBand: "adult",
    dependants: "none",
    englishEvidence: "declared_pending_verification",
    financialEvidence: "declared_pending_verification",
    oshcEvidence: "unknown",
    schoolApplicationId: null,
  };
  student500Rows.set(student500Id, {
    applicationId: student500Id,
    projectId,
    revision: 7,
    status: "draft",
    context: structuredClone(originalContext),
    createdAt: stamp,
    updatedAt: stamp,
    archivedAt: null,
  });
  f.__e3Runtime = {
    chatId,
    projectId,
    session: { user: { id: "synthetic-owner", type: "regular" } },
    schoolRows,
    messages,
    student500Rows,
    operations,
    reads: 0,
    updateAttempts: 0,
    writes: 0,
    revoked: false,
    closed: false,
    writeGateClosed: false,
    loadState,
  };

  const runtimeModule = (await import(
    "./project-action-proposal-runtime"
  )) as unknown as {
    default?: ActionProposalRuntimeTestHandlers;
    createActionProposal?: ActionProposalRuntimeTestHandlers["createActionProposal"];
    confirmActionProposal?: ActionProposalRuntimeTestHandlers["confirmActionProposal"];
  };
  const runtime = (runtimeModule.default ??
    runtimeModule) as ActionProposalRuntimeTestHandlers;
  const task = buildProjectWorkflowProjection(loadState()).tasks.find(
    (entry) =>
      entry.stepKey === "visa_planning" && entry.targetId === student500Id
  );
  assert.ok(task, "Student 500 visa-planning task must be present");
  const selection = {
    schemaVersion: "phase15.active-step-selection.v1",
    projectId,
    taskId: task.taskId,
    workflowKind: task.workflowKind,
    definitionVersion: task.definitionVersion,
    stepKey: task.stepKey,
    targetKind: task.targetKind,
    targetId: task.targetId,
    sourceRevisions: task.sourceRevisions,
  };
  const previewResponse = await runtime.createActionProposal(
    request("action-proposals", {
      chatId,
      selection,
      fieldPath: "student500.applicationPlace",
      proposedValue: "onshore",
    }),
    projectId
  );
  assert.equal(
    previewResponse.status,
    200,
    JSON.stringify(await previewResponse.clone().json())
  );
  const preview = await previewResponse.json();
  assert.equal(preview.proposal.targetId, student500Id);
  assert.equal(preview.proposal.baseRevision, 7);
  assert.equal(f.__e3Runtime.writes, 0);
  assert.deepEqual(student500Rows.get(student500Id)?.context, originalContext);

  const confirmation = await runtime.confirmActionProposal(
    request("action-proposals/confirm", {
      confirmationToken: preview.confirmationToken,
    }),
    projectId
  );
  assert.equal(
    confirmation.status,
    200,
    JSON.stringify(await confirmation.clone().json())
  );
  const result = await confirmation.json();
  assert.equal(result.readback, "verified");
  assert.equal(result.revision, 8);
  assert.equal(result.application.context.applicationPlace, "onshore");
  assert.equal(result.application.context.coeStatus, "unknown");
  assert.equal(result.application.context.currentVisaSubclass, "500");
  assert.deepEqual(
    { ...result.application.context, applicationPlace: "unknown" },
    originalContext
  );
  assert.equal(f.__e3Runtime.writes, 1);
  assert.equal(f.__e3Runtime.updateAttempts, 1);
});

test("course candidate selection previews atomically, clears incompatible identifiers and confirms with readback", async () => {
  process.env.AUTH_SECRET = "synthetic-e3-route-test-secret";
  schoolRows.clear();
  student500Rows.clear();
  operations.clear();
  messages.clear();
  const schoolA: Record<string, any> = makeSchool(
    schoolAId,
    "Northbridge",
    "March 2027"
  );
  schoolA.institution.catalogId = "institution-northbridge";
  schoolA.course.catalogId = "course-northbridge";
  schoolA.deliveryId = "delivery-northbridge";
  schoolA.intake.id = "intake-march-2027";
  schoolRows.set(schoolAId, schoolA);
  schoolRows.set(schoolBId, makeSchool(schoolBId, "Harbour", "October 2027"));
  f.__e3Runtime = {
    chatId,
    projectId,
    session: { user: { id: "synthetic-owner", type: "regular" } },
    schoolRows,
    student500Rows,
    operations,
    messages,
    reads: 0,
    updateAttempts: 0,
    writes: 0,
    revoked: false,
    closed: false,
    writeGateClosed: false,
    loadState,
  };

  const runtimeModule = (await import(
    "./project-action-proposal-runtime"
  )) as unknown as {
    default?: ActionProposalRuntimeTestHandlers;
    createActionProposal?: ActionProposalRuntimeTestHandlers["createActionProposal"];
    confirmActionProposal?: ActionProposalRuntimeTestHandlers["confirmActionProposal"];
  };
  const runtime = (runtimeModule.default ??
    runtimeModule) as ActionProposalRuntimeTestHandlers;
  const currentTask = () =>
    buildProjectWorkflowProjection(loadState()).tasks.find(
      (entry) =>
        entry.stepKey === "school_discovery" && entry.targetId === schoolAId
    );
  const task = currentTask();
  assert.ok(task);
  const selection = {
    schemaVersion: "phase15.active-step-selection.v1",
    projectId,
    taskId: task.taskId,
    workflowKind: task.workflowKind,
    definitionVersion: task.definitionVersion,
    stepKey: task.stepKey,
    targetKind: task.targetKind,
    targetId: task.targetId,
    sourceRevisions: task.sourceRevisions,
  };
  const invalidCandidate = persistCourseResearch(task, {
    courseTitle: "x".repeat(201),
  });
  const invalidTargetPreview = await runtime.createActionProposal(
    request("action-proposals", {
      operation: "select_school_course_candidate",
      chatId,
      selection,
      assistantMessageId: invalidCandidate.assistantMessageId,
      candidateId: invalidCandidate.candidateId,
    }),
    projectId
  );
  assert.equal(invalidTargetPreview.status, 409);
  assert.equal(
    (await invalidTargetPreview.json()).error,
    "candidate_target_invalid"
  );
  assert.equal(f.__e3Runtime.writes, 0);
  assert.equal(f.__e3Runtime.updateAttempts, 0);

  const candidate = persistCourseResearch(task, {
    institutionName: " New  Example University ",
    courseTitle: " Master of\u3000Example Studies ",
    intakeLabel: " July  2027 ",
  });
  const previewBody = {
    operation: "select_school_course_candidate",
    chatId,
    selection,
    assistantMessageId: candidate.assistantMessageId,
    candidateId: candidate.candidateId,
  };
  const forgedCandidate = await runtime.createActionProposal(
    request("action-proposals", {
      ...previewBody,
      candidateId: "99999999-9999-4999-8999-999999999999",
    }),
    projectId
  );
  assert.equal(forgedCandidate.status, 409);
  const stalePreviewSelection = await runtime.createActionProposal(
    request("action-proposals", {
      ...previewBody,
      selection: {
        ...selection,
        sourceRevisions: selection.sourceRevisions.map((revision) => ({
          ...revision,
          revision: revision.revision - 1,
        })),
      },
    }),
    projectId
  );
  assert.equal(stalePreviewSelection.status, 409);
  const wrongChat = await runtime.createActionProposal(
    request("action-proposals", {
      ...previewBody,
      chatId: "99999999-9999-4999-8999-999999999999",
    }),
    projectId
  );
  assert.equal(wrongChat.status, 409);
  assert.equal(f.__e3Runtime.writes, 0);
  assert.equal(f.__e3Runtime.updateAttempts, 0);
  const firstPreviewResponse = await runtime.createActionProposal(
    request("action-proposals", previewBody),
    projectId
  );
  assert.equal(
    firstPreviewResponse.status,
    200,
    JSON.stringify(await firstPreviewResponse.clone().json())
  );
  const firstPreview = await firstPreviewResponse.json();
  assert.equal(
    firstPreview.display.targetLabel,
    "School Application — Northbridge"
  );
  assert.equal(
    firstPreview.display.changes.find(
      (change: { field: string }) => change.field === "Institution"
    )?.proposedValue,
    "New Example University"
  );
  assert.equal(
    firstPreview.display.changes.find(
      (change: { field: string }) => change.field === "Course"
    )?.proposedValue,
    "Master of Example Studies"
  );
  assert.ok(
    firstPreview.display.limitations.some((limitation: string) =>
      limitation.includes("remain research-only")
    )
  );
  assert.deepEqual(
    firstPreview.display.changes.map(
      (change: { field: string }) => change.field
    ),
    [
      "Institution",
      "Institution catalog identifier",
      "Course",
      "Course catalog identifier",
      "Delivery identifier",
      "Intake identifier",
      "Intake",
    ]
  );
  assert.equal(
    firstPreview.display.changes.find(
      (change: { field: string }) =>
        change.field === "Institution catalog identifier"
    )?.proposedValue,
    "No identifier (customer-reported)"
  );
  assert.match(firstPreview.display.evidenceLabel, /AI research lead/u);
  assert.equal(f.__e3Runtime.writes, 0);
  assert.equal(f.__e3Runtime.updateAttempts, 0);
  assert.equal(schoolRows.get(schoolAId)?.institution.name, "Northbridge");

  // Cancel is a client-only discard of this preview token; no server mutation occurs.
  const cancelledToken = firstPreview.confirmationToken;
  assert.equal(typeof cancelledToken, "string");
  assert.equal(f.__e3Runtime.writes, 0);

  const previewResponse = await runtime.createActionProposal(
    request("action-proposals", previewBody),
    projectId
  );
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  const confirmRequest = () =>
    request("action-proposals/confirm", {
      confirmationToken: preview.confirmationToken,
    });
  const confirmed = await runtime.confirmActionProposal(
    confirmRequest(),
    projectId
  );
  assert.equal(
    confirmed.status,
    200,
    JSON.stringify(await confirmed.clone().json())
  );
  const result = await confirmed.json();
  assert.equal(result.readback, "verified");
  assert.equal(result.revision, 11);
  assert.equal(result.application.institution.name, "New Example University");
  assert.equal(result.application.institution.catalogId, null);
  assert.equal(result.application.course.title, "Master of Example Studies");
  assert.equal(result.application.course.catalogId, null);
  assert.equal(result.application.deliveryId, null);
  assert.equal(result.application.intake.id, null);
  assert.equal(result.application.intake.label, "July 2027");
  assert.equal(result.application.currentPackage.status, "stale");
  assert.equal(schoolRows.get(schoolBId)?.institution.name, "Harbour");
  assert.equal(schoolRows.get(schoolBId)?.revision, 10);
  assert.equal(f.__e3Runtime.writes, 1);
  assert.equal(f.__e3Runtime.updateAttempts, 1);

  const replay = await runtime.confirmActionProposal(
    confirmRequest(),
    projectId
  );
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);
  assert.equal(f.__e3Runtime.writes, 1);

  const updatedTask = currentTask();
  assert.ok(updatedTask);
  const updatedCandidate = persistCourseResearch(updatedTask, {
    courseTitle: "Master of Other Example Studies",
    intakeLabel: "October 2028",
  });
  const stalePreviewResponse = await runtime.createActionProposal(
    request("action-proposals", {
      ...previewBody,
      selection: { ...selection, sourceRevisions: updatedTask.sourceRevisions },
      assistantMessageId: updatedCandidate.assistantMessageId,
      candidateId: updatedCandidate.candidateId,
    }),
    projectId
  );
  assert.equal(stalePreviewResponse.status, 200);
  const stalePreview = await stalePreviewResponse.json();
  schoolRows.set(schoolAId, { ...schoolRows.get(schoolAId), revision: 12 });
  const staleConfirm = await runtime.confirmActionProposal(
    request("action-proposals/confirm", {
      confirmationToken: stalePreview.confirmationToken,
    }),
    projectId
  );
  assert.equal(staleConfirm.status, 409);
  assert.equal((await staleConfirm.json()).error, "revision_conflict");
  assert.equal(f.__e3Runtime.writes, 1);
});

test("course replacement is refused when a Student 500 application is linked to the School", async () => {
  process.env.AUTH_SECRET = "synthetic-e3-route-test-secret";
  schoolRows.clear();
  student500Rows.clear();
  operations.clear();
  messages.clear();
  schoolRows.set(schoolAId, makeSchool(schoolAId, "Northbridge", "March 2027"));
  student500Rows.set(student500Id, {
    applicationId: student500Id,
    projectId,
    revision: 2,
    status: "draft",
    context: {
      entryRoute: "school_application_in_progress",
      coeStatus: "unknown",
      applicationPlace: "unknown",
      asOfDate: "2026-11-24",
      currentVisaSubclass: null,
      historyDeclaration: "unknown",
      historyFlags: [],
      applicantAgeBand: "adult",
      dependants: "unknown",
      englishEvidence: "unknown",
      financialEvidence: "unknown",
      oshcEvidence: "unknown",
      schoolApplicationId: schoolAId,
    },
    createdAt: stamp,
    updatedAt: stamp,
    archivedAt: null,
  });
  f.__e3Runtime = {
    chatId,
    projectId,
    session: { user: { id: "synthetic-owner", type: "regular" } },
    schoolRows,
    student500Rows,
    operations,
    messages,
    reads: 0,
    updateAttempts: 0,
    writes: 0,
    revoked: false,
    closed: false,
    writeGateClosed: false,
    loadState,
  };
  const task = buildProjectWorkflowProjection(loadState()).tasks.find(
    (entry) =>
      entry.stepKey === "school_discovery" && entry.targetId === schoolAId
  );
  assert.ok(task);
  assert.equal(
    loadState().matters.student500Applications?.[0]?.schoolDependency.state,
    "linked"
  );
  const candidate = persistCourseResearch(task);
  const body = {
    operation: "select_school_course_candidate",
    chatId,
    selection: {
      schemaVersion: "phase15.active-step-selection.v1",
      projectId,
      taskId: task.taskId,
      workflowKind: task.workflowKind,
      definitionVersion: task.definitionVersion,
      stepKey: task.stepKey,
      targetKind: task.targetKind,
      targetId: task.targetId,
      sourceRevisions: task.sourceRevisions,
    },
    assistantMessageId: candidate.assistantMessageId,
    candidateId: candidate.candidateId,
  };
  const runtimeModule = (await import(
    "./project-action-proposal-runtime"
  )) as unknown as {
    default?: ActionProposalRuntimeTestHandlers;
    createActionProposal?: ActionProposalRuntimeTestHandlers["createActionProposal"];
    confirmActionProposal?: ActionProposalRuntimeTestHandlers["confirmActionProposal"];
  };
  const runtime = (runtimeModule.default ??
    runtimeModule) as ActionProposalRuntimeTestHandlers;
  const response = await runtime.createActionProposal(
    request("action-proposals", body),
    projectId
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "linked_matter_conflict");
  assert.equal(f.__e3Runtime.writes, 0);
  assert.equal(f.__e3Runtime.updateAttempts, 0);
});
