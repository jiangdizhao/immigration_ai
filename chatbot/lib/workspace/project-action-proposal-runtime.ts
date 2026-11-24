import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getMessageById } from "@/lib/db/queries";
import { resolveProjectContext } from "@/lib/projects/context-resolver";
import {
  resolveSchoolApplicationTarget,
  SchoolApplicationError,
} from "@/lib/school-applications/contracts";
import { schoolApplicationHandlers } from "@/lib/school-applications/runtime";
import type { SchoolApplicationDetailView } from "@/lib/school-applications/service";
import { STUDENT_500_APPLICATION_PLACES } from "@/lib/student-500/contracts";
import { student500Handlers } from "@/lib/student-500/runtime";
import type { Student500ApplicationDetailView } from "@/lib/student-500/service";
import { loadProjectStateForActor } from "@/lib/workspace/project-state-server";
import {
  schoolApplicationFieldsWithIntakeLabel,
  schoolApplicationFieldsWithTarget,
  schoolApplicationTargetWithCandidate,
  student500ContextDiffersOnlyByApplicationPlace,
  student500ContextWithApplicationPlace,
} from "./action-proposal-adapters";
import {
  ACTION_PROPOSAL_TTL_MS,
  type ActionConfirmationClaimsV1,
  type ActionProposalFieldPath,
  actionConfirmationClaimsV1Schema,
  isCourseSelectionClaims,
  isSingleProposalTargetRevisionAdvance,
  issueActionConfirmationToken,
  proposalFromClaims,
  verifyActionConfirmationToken,
} from "./action-proposals";
import {
  ActiveStepContextError,
  type ActiveStepSelectionV1,
  activeStepSelectionV1Schema,
  resolveActiveStepContext,
} from "./active-step-context";
import {
  type BoundCourseResearchResultV1,
  boundCourseResearchResultSchema,
} from "./course-research";
import { verifyCourseVerificationAttestation } from "./course-verification-attestation";
import { buildProjectWorkflowProjection } from "./project-workflows";

const BODY_MAX_BYTES = 4096;
const COURSE_SELECTION_BODY_MAX_BYTES = 20_000;
const CONFIRMATION_BODY_MAX_BYTES = 12_000;
const DEFAULT_ASSUMPTION =
  "Customer-entered proposal; no independent source verification is attached.";

type Session = { userId: string; type: "guest" | "regular" };
type ApiResult = { response: Response } | { session: Session };

const schoolTargetSchema = z
  .object({
    institutionName: z.string().min(1).max(500),
    institutionId: z.string().max(128).nullable(),
    courseTitle: z.string().min(1).max(500),
    courseId: z.string().max(128).nullable(),
    deliveryId: z.string().max(128).nullable(),
    intakeId: z.string().max(128).nullable(),
    intakeLabel: z.string().max(120).nullable(),
  })
  .strict();

const courseSelectionRequestSchema = z
  .object({
    operation: z.literal("select_school_course_candidate"),
    chatId: z.string().uuid(),
    selection: activeStepSelectionV1Schema,
    assistantMessageId: z.string().uuid(),
    candidateId: z.string().uuid(),
    verificationAttestations: z
      .array(z.string().min(1).max(5000))
      .max(3)
      .optional(),
  })
  .strict();

const legacyProposalRequestSchema = z
  .object({
    chatId: z.string().uuid(),
    selection: activeStepSelectionV1Schema,
    fieldPath: z.enum([
      "schoolApplication.intakeLabel",
      "student500.applicationPlace",
    ]),
    proposedValue: z.union([
      z.string().max(120),
      z.enum(STUDENT_500_APPLICATION_PLACES),
      z.null(),
    ]),
  })
  .strict();

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function fail(code: string, status: number): Response {
  return json({ error: code }, status);
}

function validSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function authenticate(request: Request): Promise<ApiResult> {
  if (!validSameOrigin(request)) {
    return { response: fail("same_origin_required", 403) };
  }
  const session = await auth();
  if (!session?.user?.id) {
    return { response: fail("authentication_required", 401) };
  }
  return { session: { userId: session.user.id, type: session.user.type } };
}

async function readBody(
  request: Request,
  maxBytes = BODY_MAX_BYTES
): Promise<unknown | Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return fail("invalid_request", 413);
  }
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      return fail("invalid_request", 413);
    }
    return JSON.parse(text) as unknown;
  } catch {
    return fail("invalid_request", 400);
  }
}

async function authorizeProjectChat(input: {
  projectId: string;
  chatId: string;
  actor: Session;
}) {
  const resolved = await resolveProjectContext({
    actorUserId: input.actor.userId,
    chatId: input.chatId,
  });
  if (resolved.projectId !== input.projectId) {
    throw new ActiveStepContextError("active_step_selection_invalid");
  }
  const loaded = await loadProjectStateForActor({
    actorUserId: input.actor.userId,
    actorType: input.actor.type,
    projectId: input.projectId,
  });
  if (loaded.kind !== "ok" || loaded.state.project.id !== input.projectId) {
    throw new ActiveStepContextError("active_step_context_unavailable");
  }
  return loaded.state;
}

function makeSelectionForFreshTask(
  state: Awaited<ReturnType<typeof authorizeProjectChat>>,
  original: ActiveStepSelectionV1
): ActiveStepSelectionV1 | null {
  const task = buildProjectWorkflowProjection(state).tasks.find(
    (entry) => entry.taskId === original.taskId
  );
  if (
    !task ||
    task.projectId !== original.projectId ||
    task.workflowKind !== original.workflowKind ||
    task.definitionVersion !== original.definitionVersion ||
    task.stepKey !== original.stepKey ||
    task.targetKind !== original.targetKind ||
    task.targetId !== original.targetId
  ) {
    return null;
  }
  return {
    ...original,
    sourceRevisions: task.sourceRevisions.map((revision) => ({ ...revision })),
  };
}

async function readTarget(input: {
  projectId: string;
  targetKind: "school_application" | "student500_application";
  targetId: string;
  requestUrl: string;
}): Promise<
  | { kind: "school_application"; value: SchoolApplicationDetailView }
  | { kind: "student500_application"; value: Student500ApplicationDetailView }
  | { response: Response }
> {
  const request = new Request(input.requestUrl, { method: "GET" });
  const response =
    input.targetKind === "school_application"
      ? await schoolApplicationHandlers.get(
          request,
          input.projectId,
          input.targetId
        )
      : await student500Handlers.get(request, input.projectId, input.targetId);
  if (!response.ok) {
    return {
      response: fail(
        response.status === 404
          ? "target_not_found"
          : response.status === 401
            ? "authentication_required"
            : "business_service_unavailable",
        response.status
      ),
    };
  }
  const parsed = (await response.json()) as { application?: unknown };
  if (!parsed.application || typeof parsed.application !== "object") {
    return { response: fail("business_service_unavailable", 503) };
  }
  return input.targetKind === "school_application"
    ? {
        kind: "school_application",
        value: parsed.application as SchoolApplicationDetailView,
      }
    : {
        kind: "student500_application",
        value: parsed.application as Student500ApplicationDetailView,
      };
}

function proposalTaskAllowed(input: {
  state: Awaited<ReturnType<typeof authorizeProjectChat>>;
  activeStep: NonNullable<ReturnType<typeof resolveActiveStepContext>>;
  fieldPath: ActionProposalFieldPath;
}): boolean {
  if (input.state.project.status !== "active") {
    return false;
  }
  const standardActionableTask =
    input.activeStep.task.applicability === "applicable" &&
    input.activeStep.task.actionability !== "unavailable";
  const customerReportedIntakeOnly =
    input.fieldPath === "schoolApplication.intakeLabel" &&
    input.activeStep.workflowKind === "school_application" &&
    input.activeStep.stepKey === "school_discovery" &&
    input.activeStep.targetKind === "school_application" &&
    input.activeStep.task.applicability === "unavailable" &&
    input.activeStep.task.actionability === "unavailable" &&
    input.activeStep.task.reasonCodes.length === 1 &&
    input.activeStep.task.reasonCodes[0] ===
      "school_course_source_unverified" &&
    input.state.capabilities.schoolApplications.state === "available";
  return standardActionableTask || customerReportedIntakeOnly;
}

function scopedProposalTask(input: {
  state: Awaited<ReturnType<typeof authorizeProjectChat>>;
  selection: ActiveStepSelectionV1;
  chatId: string;
  fieldPath: ActionProposalFieldPath;
}) {
  const activeStep = resolveActiveStepContext({
    state: input.state,
    chatId: input.chatId,
    projectId: input.state.project.id,
    selection: input.selection,
  });
  if (!activeStep || !proposalTaskAllowed({ ...input, activeStep })) {
    throw new ActiveStepContextError("active_step_selection_invalid");
  }
  return activeStep;
}

function sourceRevisionForTarget(
  revisions: readonly {
    targetKind: string;
    targetId: string;
    revision: number;
  }[],
  targetKind: string,
  targetId: string
): number | null {
  const matches = revisions.filter(
    (item) => item.targetKind === targetKind && item.targetId === targetId
  );
  return matches.length === 1 ? matches[0].revision : null;
}

function sameSourceRevisions(
  left: readonly { targetKind: string; targetId: string; revision: number }[],
  right: readonly { targetKind: string; targetId: string; revision: number }[]
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const other = right[index];
      return Boolean(
        other &&
          item.targetKind === other.targetKind &&
          item.targetId === other.targetId &&
          item.revision === other.revision
      );
    })
  );
}

function claimsToProposal(claims: ActionConfirmationClaimsV1) {
  const assumptions = isCourseSelectionClaims(claims)
    ? [
        "The selected research candidate is saved only as customer-reported School Application data.",
        "Only institution name, course title and intake label are persisted; campus, codes, qualification, duration, fees and entry requirements remain research-only.",
        "No catalog identity, current intake, admission, Offer, CoE or visa outcome is established by this update.",
      ]
    : [DEFAULT_ASSUMPTION];
  const affectedDependencies = isCourseSelectionClaims(claims)
    ? [
        "Course selection is stored as customer-reported draft data with catalog, delivery and intake identifiers cleared.",
        "The owning service will invalidate dependent preparation packages after the target changes.",
      ]
    : claims.targetKind === "school_application"
      ? [
          "The owning service will re-evaluate existing package freshness after save.",
        ]
      : [
          "The owning service will rebuild the Student 500 preparation read model; no CoE or visa status is verified by this edit.",
        ];
  return {
    proposal: proposalFromClaims(claims, {
      assumptions,
      affectedDependencies,
    }),
    assumptions,
    affectedDependencies,
  };
}

function issueClaims(input: {
  actor: Session;
  projectId: string;
  chatId: string;
  selection: ActiveStepSelectionV1;
  targetKind: "school_application" | "student500_application";
  targetId: string;
  fieldPath: ActionProposalFieldPath;
  oldValue: string | null;
  proposedValue: string | null;
  baseRevision: number;
}) {
  const issuedAt = Date.now();
  const base = {
    schemaVersion: "phase15.action-confirmation.v1" as const,
    actorUserId: input.actor.userId,
    projectId: input.projectId,
    chatId: input.chatId,
    targetKind: input.targetKind,
    targetId: input.targetId,
    workflowKind: input.selection.workflowKind,
    stepKey: input.selection.stepKey,
    fieldPath: input.fieldPath,
    oldValue: input.oldValue,
    proposedValue: input.proposedValue,
    baseRevision: input.baseRevision,
    selection: input.selection,
    operationId: `e3-${randomUUID()}`,
    issuedAt,
    expiresAt: issuedAt + ACTION_PROPOSAL_TTL_MS,
  };
  return actionConfirmationClaimsV1Schema.parse(base);
}

function schoolTargetFromApplication(application: SchoolApplicationDetailView) {
  return schoolTargetSchema.parse({
    institutionName: application.institution.name,
    institutionId: application.institution.catalogId,
    courseTitle: application.course.title,
    courseId: application.course.catalogId,
    deliveryId: application.deliveryId,
    intakeId: application.intake.id,
    intakeLabel: application.intake.label,
  });
}

function courseReplacementAvailable(input: {
  state: Awaited<ReturnType<typeof authorizeProjectChat>>;
  targetId: string;
}): "available" | "linked_matter_conflict" | "linked_matter_state_unavailable" {
  const { state, targetId } = input;
  const school = state.matters.schoolApplications?.find(
    (item) => item.applicationId === targetId
  );
  if (
    state.capabilities.schoolApplications.state !== "available" ||
    state.capabilities.schoolAdmissions.state !== "available" ||
    state.capabilities.student500.state !== "available" ||
    !school ||
    school.status === "archived" ||
    state.matters.unresolvedLinkedAdmissions === null ||
    state.matters.student500Applications === null
  ) {
    return "linked_matter_state_unavailable";
  }
  if (
    school.linkedAdmissionsCase !== null ||
    state.matters.unresolvedLinkedAdmissions.some(
      (item) =>
        item.linkedSchoolApplicationId === targetId ||
        item.schoolApplicationLinkState === "unavailable"
    ) ||
    state.matters.student500Applications.some((application) => {
      const dependency = application.schoolDependency;
      if (dependency.state === "linked") {
        return (
          "schoolApplicationId" in dependency &&
          dependency.schoolApplicationId === targetId
        );
      }
      return (
        dependency.state === "unknown" || dependency.state === "unavailable"
      );
    })
  ) {
    return "linked_matter_conflict";
  }
  return "available";
}

function sameSchoolTarget(
  left: ReturnType<typeof schoolTargetFromApplication>,
  right: ReturnType<typeof schoolTargetFromApplication>
): boolean {
  return sameJson(left, right);
}

async function candidateFromPersistedAssistantMessage(input: {
  assistantMessageId: string;
  candidateId: string;
  chatId: string;
  projectId: string;
  state: Awaited<ReturnType<typeof authorizeProjectChat>>;
  selection: ActiveStepSelectionV1;
}): Promise<{
  result: BoundCourseResearchResultV1;
  candidate: BoundCourseResearchResultV1["candidates"][number];
} | null> {
  const rows = await getMessageById({ id: input.assistantMessageId });
  const message = rows[0] as
    | { id?: unknown; chatId?: unknown; role?: unknown; parts?: unknown }
    | undefined;
  if (
    !message ||
    message.id !== input.assistantMessageId ||
    message.chatId !== input.chatId ||
    message.role !== "assistant" ||
    !Array.isArray(message.parts)
  ) {
    return null;
  }
  const metadata = message.parts.find(
    (part) =>
      part &&
      typeof part === "object" &&
      !Array.isArray(part) &&
      (part as Record<string, unknown>).type === "metadata"
  ) as Record<string, unknown> | undefined;
  const parsed = boundCourseResearchResultSchema.safeParse(
    metadata?.courseResearchResult
  );
  const task = buildProjectWorkflowProjection(input.state).tasks.find(
    (item) => item.taskId === input.selection.taskId
  );
  if (
    !parsed.success ||
    !task ||
    parsed.data.assistantMessageId !== input.assistantMessageId ||
    parsed.data.projectId !== input.projectId ||
    parsed.data.chatId !== input.chatId ||
    parsed.data.taskId !== task.taskId ||
    parsed.data.definitionVersion !== task.definitionVersion ||
    parsed.data.targetId !== task.targetId ||
    parsed.data.workflowKind !== task.workflowKind ||
    parsed.data.stepKey !== task.stepKey ||
    parsed.data.targetKind !== task.targetKind ||
    !sameSourceRevisions(parsed.data.sourceRevisions, task.sourceRevisions) ||
    !sameSourceRevisions(
      parsed.data.sourceRevisions,
      input.selection.sourceRevisions
    )
  ) {
    return null;
  }
  const candidate = parsed.data.candidates.find(
    (item) => item.candidateId === input.candidateId
  );
  return candidate ? { result: parsed.data, candidate } : null;
}

function secret(): string | null {
  const configured = process.env.AUTH_SECRET;
  return configured?.trim() ? configured : null;
}

function courseEvidenceLabel(
  level:
    | "model_research_lead"
    | "official_source_referenced"
    | "independently_verified_field"
): string {
  switch (level) {
    case "independently_verified_field":
      return "Independently verified field observation; effective dates and future availability remain unknown unless separately stated.";
    case "official_source_referenced":
      return "Official source cited; the field was not independently verified.";
    default:
      return "AI research lead; not independently verified.";
  }
}

function coursePreviewChanges(
  oldTarget: ReturnType<typeof schoolTargetFromApplication>,
  proposedTarget: ReturnType<typeof schoolTargetFromApplication>
) {
  const value = (entry: string | null, kind: "identifier" | "text") =>
    kind === "identifier"
      ? entry
        ? "Existing catalog / delivery identifier"
        : "No identifier (customer-reported)"
      : entry;
  return [
    {
      field: "Institution",
      oldValue: oldTarget.institutionName,
      proposedValue: proposedTarget.institutionName,
    },
    {
      field: "Institution catalog identifier",
      oldValue: value(oldTarget.institutionId, "identifier"),
      proposedValue: value(proposedTarget.institutionId, "identifier"),
    },
    {
      field: "Course",
      oldValue: oldTarget.courseTitle,
      proposedValue: proposedTarget.courseTitle,
    },
    {
      field: "Course catalog identifier",
      oldValue: value(oldTarget.courseId, "identifier"),
      proposedValue: value(proposedTarget.courseId, "identifier"),
    },
    {
      field: "Delivery identifier",
      oldValue: value(oldTarget.deliveryId, "identifier"),
      proposedValue: value(proposedTarget.deliveryId, "identifier"),
    },
    {
      field: "Intake identifier",
      oldValue: value(oldTarget.intakeId, "identifier"),
      proposedValue: value(proposedTarget.intakeId, "identifier"),
    },
    {
      field: "Intake",
      oldValue: oldTarget.intakeLabel,
      proposedValue: proposedTarget.intakeLabel,
    },
  ].filter((change) => change.oldValue !== change.proposedValue);
}

async function createCourseSelectionProposal(input: {
  request: Request;
  projectId: string;
  actor: Session;
  parsed: z.infer<typeof courseSelectionRequestSchema>;
}): Promise<Response> {
  const { request, projectId, actor, parsed } = input;
  const { chatId, selection } = parsed;
  if (selection.projectId !== projectId) {
    return fail("wrong_project", 404);
  }
  const configuredSecret = secret();
  if (!configuredSecret) {
    return fail("confirmation_unavailable", 503);
  }
  try {
    const state = await authorizeProjectChat({ actor, chatId, projectId });
    const active = scopedProposalTask({
      state,
      selection,
      chatId,
      fieldPath: "schoolApplication.intakeLabel",
    });
    if (
      active.workflowKind !== "school_application" ||
      active.stepKey !== "school_discovery" ||
      active.targetKind !== "school_application"
    ) {
      return fail("proposal_not_allowed_for_active_task", 409);
    }
    const read = await readTarget({
      projectId,
      targetKind: "school_application",
      targetId: active.targetId,
      requestUrl: request.url,
    });
    if ("response" in read) {
      return read.response;
    }
    if (read.kind !== "school_application") {
      return fail("target_unavailable", 409);
    }
    const application = read.value;
    if (
      application.projectId !== projectId ||
      application.archivedAt !== null ||
      !Number.isSafeInteger(application.revision) ||
      sourceRevisionForTarget(
        active.sourceRevisions,
        "school_application",
        active.targetId
      ) !== application.revision
    ) {
      return fail("target_revision_changed", 409);
    }
    const linkage = courseReplacementAvailable({
      state,
      targetId: active.targetId,
    });
    if (linkage !== "available") {
      return fail(linkage, 409);
    }

    const bound = await candidateFromPersistedAssistantMessage({
      assistantMessageId: parsed.assistantMessageId,
      candidateId: parsed.candidateId,
      chatId,
      projectId,
      state,
      selection,
    });
    if (!bound) {
      return fail("candidate_not_current_or_not_found", 409);
    }
    const candidate = bound.candidate;
    const attestations = (parsed.verificationAttestations ?? []).map((token) =>
      verifyCourseVerificationAttestation({
        token,
        secret: configuredSecret,
        actorUserId: actor.userId,
      })
    );
    if (attestations.some((attestation) => !attestation)) {
      return fail("verification_attestation_invalid_or_expired", 409);
    }
    const attestationByField = new Map<
      string,
      NonNullable<(typeof attestations)[number]>
    >();
    for (const attestation of attestations) {
      if (!attestation) {
        continue;
      }
      const originalField = candidate.fields.find(
        (field) => field.key === attestation.fieldKey
      );
      if (
        attestation.projectId !== projectId ||
        attestation.chatId !== chatId ||
        attestation.assistantMessageId !== parsed.assistantMessageId ||
        attestation.candidateId !== candidate.candidateId ||
        !originalField ||
        originalField.value !== attestation.value ||
        !originalField.sourceIds.includes(attestation.requestedSourceId) ||
        originalField.sourceIds.length >= 6 ||
        attestationByField.has(attestation.fieldKey)
      ) {
        return fail("verification_attestation_scope_mismatch", 409);
      }
      attestationByField.set(attestation.fieldKey, attestation);
    }
    const currentOldTarget = schoolTargetFromApplication(application);
    const intakeValue = candidate.fields.find(
      (field) => field.key === "intake"
    )?.value;
    let proposedTarget: z.infer<typeof schoolTargetSchema>;
    try {
      const customerReported = resolveSchoolApplicationTarget({
        fields: schoolApplicationTargetWithCandidate({
          institutionName: candidate.institutionName,
          courseTitle: candidate.courseTitle,
          intakeLabel: typeof intakeValue === "string" ? intakeValue : null,
        }),
        resolution: { status: "unresolved" },
      });
      if (customerReported.sourceStatus !== "unverified_customer_declared") {
        return fail("candidate_target_normalization_unsupported", 409);
      }
      proposedTarget = schoolTargetSchema.parse(customerReported.target);
    } catch (error) {
      if (
        error instanceof SchoolApplicationError &&
        error.code === "invalid_request"
      ) {
        return fail("candidate_target_invalid", 409);
      }
      throw error;
    }
    if (sameSchoolTarget(currentOldTarget, proposedTarget)) {
      return fail("proposal_has_no_change", 400);
    }
    const verifiedSourceIds = [...attestationByField.values()].map(
      (item) => item.sourceId
    );
    const sourceIds = [
      ...new Set([
        ...candidate.sources.map((source) => source.sourceId),
        ...verifiedSourceIds,
      ]),
    ].slice(0, 12);
    const issuedAt = Date.now();
    const claims = actionConfirmationClaimsV1Schema.parse({
      schemaVersion: "phase15.action-confirmation.v1",
      actorUserId: actor.userId,
      projectId,
      chatId,
      targetKind: "school_application",
      targetId: active.targetId,
      workflowKind: "school_application",
      stepKey: "school_discovery",
      operation: {
        kind: "select_school_course_candidate",
        assistantMessageId: parsed.assistantMessageId,
        candidateId: candidate.candidateId,
        identityEvidenceLevel: candidate.identityEvidenceLevel,
        fieldEvidence: candidate.fields.map((field) => ({
          fieldKey: field.key,
          evidenceLevel: attestationByField.has(field.key)
            ? "independently_verified_field"
            : field.evidenceLevel,
          sourceIds: [
            ...field.sourceIds,
            ...(attestationByField.has(field.key)
              ? [attestationByField.get(field.key)?.sourceId as string]
              : []),
          ],
          independentObservation: (() => {
            const attestation = attestationByField.get(field.key);
            return attestation
              ? {
                  observedAt: attestation.observedAt,
                  sourceId: attestation.sourceId,
                  sourceUrl: attestation.sourceUrl,
                  manifestId: attestation.manifestId,
                  snapshotSha256: attestation.snapshotSha256,
                  locator: attestation.locator,
                  effectiveFrom: null,
                  effectiveTo: null,
                  value: attestation.value,
                }
              : null;
          })(),
        })),
        sourceIds,
      },
      oldTarget: currentOldTarget,
      proposedTarget,
      baseRevision: application.revision,
      selection,
      operationId: `e3-${randomUUID()}`,
      issuedAt,
      expiresAt: issuedAt + ACTION_PROPOSAL_TTL_MS,
    });
    const assumptions = claimsToProposal(claims);
    const evidenceLevels = [
      candidate.identityEvidenceLevel,
      ...candidate.fields.map((field) =>
        attestationByField.has(field.key)
          ? "independently_verified_field"
          : field.evidenceLevel
      ),
    ];
    const evidenceSummary = [...new Set(evidenceLevels)]
      .map((level) => courseEvidenceLabel(level))
      .join(" ");
    const limitations = [
      "Only institution name, course title and the selected intake label are saved. Campus, course/CRICOS codes, qualification, duration, tuition, fee basis and entry requirements remain research-only.",
      ...candidate.limitations,
      ...bound.result.limitations,
      "This confirmation records customer-selected preparation data; it does not establish official admission, an Offer, a CoE or a visa outcome.",
    ].slice(0, 6);
    return json({
      proposal: assumptions.proposal,
      display: {
        targetLabel: `School Application — ${application.institution.name}`,
        changes: coursePreviewChanges(currentOldTarget, proposedTarget),
        evidenceLabel: evidenceSummary,
        limitations,
        packageNote: application.currentPackage
          ? "The existing preparation package must be re-evaluated by the owning service after save."
          : "No current preparation package is recorded for this application.",
      },
      confirmationToken: issueActionConfirmationToken(claims, configuredSecret),
    });
  } catch (error) {
    if (error instanceof ActiveStepContextError) {
      return fail(
        error.code,
        error.code === "active_step_context_unavailable" ? 503 : 409
      );
    }
    return fail("proposal_unavailable", 503);
  }
}

export async function createActionProposal(
  request: Request,
  projectId: string
): Promise<Response> {
  const authResult = await authenticate(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const body = await readBody(request, COURSE_SELECTION_BODY_MAX_BYTES);
  if (body instanceof Response) {
    return body;
  }
  const courseSelection = courseSelectionRequestSchema.safeParse(body);
  if (
    courseSelection.success &&
    z.string().uuid().safeParse(projectId).success
  ) {
    return createCourseSelectionProposal({
      request,
      projectId,
      actor: authResult.session,
      parsed: courseSelection.data,
    });
  }
  const parsed = legacyProposalRequestSchema.safeParse(body);
  if (!parsed.success || !z.string().uuid().safeParse(projectId).success) {
    return fail("invalid_request", 400);
  }
  const { chatId, selection, fieldPath, proposedValue } = parsed.data;
  if (selection.projectId !== projectId) {
    return fail("wrong_project", 404);
  }
  const configuredSecret = secret();
  if (!configuredSecret) {
    return fail("confirmation_unavailable", 503);
  }

  try {
    const state = await authorizeProjectChat({
      actor: authResult.session,
      chatId,
      projectId,
    });
    const active = scopedProposalTask({ state, selection, chatId, fieldPath });
    if (fieldPath === "schoolApplication.intakeLabel") {
      if (
        active.workflowKind !== "school_application" ||
        active.stepKey !== "school_discovery" ||
        active.targetKind !== "school_application" ||
        (typeof proposedValue !== "string" && proposedValue !== null)
      ) {
        return fail("proposal_not_allowed_for_active_task", 400);
      }
      const read = await readTarget({
        projectId,
        targetKind: "school_application",
        targetId: active.targetId,
        requestUrl: request.url,
      });
      if ("response" in read) {
        return read.response;
      }
      if (read.kind !== "school_application") {
        return fail("target_unavailable", 409);
      }
      const application = read.value;
      if (
        application.projectId !== projectId ||
        application.archivedAt !== null ||
        typeof application.revision !== "number" ||
        (typeof application.intake?.label !== "string" &&
          application.intake?.label !== null)
      ) {
        return fail("target_unavailable", 409);
      }
      if (
        sourceRevisionForTarget(
          active.sourceRevisions,
          "school_application",
          active.targetId
        ) !== application.revision
      ) {
        return fail("target_revision_changed", 409);
      }
      if (application.intake.label === proposedValue) {
        return fail("proposal_has_no_change", 400);
      }
      const claims = issueClaims({
        actor: authResult.session,
        projectId,
        chatId,
        selection,
        targetKind: "school_application",
        targetId: active.targetId,
        fieldPath,
        oldValue: application.intake.label,
        proposedValue,
        baseRevision: application.revision,
      });
      const confirmationToken = issueActionConfirmationToken(
        claims,
        configuredSecret
      );
      return json({
        proposal: {
          ...claimsToProposal(claims).proposal,
          display: {
            projectId,
            targetLabel: application.institution.name,
            currentValue: application.intake.label,
            proposedValue,
            sourceLabel:
              "Customer-entered proposal; not an official intake observation.",
            packageNote: application.currentPackage
              ? "Existing package freshness will be re-evaluated by the owning service."
              : "No current package is recorded for this application.",
          },
        },
        confirmationToken,
      });
    }

    if (
      fieldPath !== "student500.applicationPlace" ||
      active.workflowKind !== "student_500" ||
      active.stepKey !== "visa_planning" ||
      active.targetKind !== "student500_application" ||
      typeof proposedValue !== "string" ||
      !(STUDENT_500_APPLICATION_PLACES as readonly string[]).includes(
        proposedValue
      )
    ) {
      return fail("proposal_not_allowed_for_active_task", 400);
    }
    const read = await readTarget({
      projectId,
      targetKind: "student500_application",
      targetId: active.targetId,
      requestUrl: request.url,
    });
    if ("response" in read) {
      return read.response;
    }
    if (read.kind !== "student500_application") {
      return fail("target_unavailable", 409);
    }
    const application = read.value;
    const oldValue = application.context?.applicationPlace;
    if (
      application.projectId !== projectId ||
      application.archivedAt !== null ||
      !Number.isSafeInteger(application.revision) ||
      !(STUDENT_500_APPLICATION_PLACES as readonly string[]).includes(oldValue)
    ) {
      return fail("target_unavailable", 409);
    }
    if (
      sourceRevisionForTarget(
        active.sourceRevisions,
        "student500_application",
        active.targetId
      ) !== application.revision
    ) {
      return fail("target_revision_changed", 409);
    }
    if (oldValue === proposedValue) {
      return fail("proposal_has_no_change", 400);
    }
    const claims = issueClaims({
      actor: authResult.session,
      projectId,
      chatId,
      selection,
      targetKind: "student500_application",
      targetId: active.targetId,
      fieldPath,
      oldValue,
      proposedValue,
      baseRevision: application.revision,
    });
    return json({
      proposal: {
        ...claimsToProposal(claims).proposal,
        display: {
          projectId,
          targetLabel: `Student 500 application ${active.targetId.slice(0, 8)}`,
          currentValue: oldValue,
          proposedValue,
          sourceLabel:
            "Customer-entered reported context; not a legal conclusion.",
          packageNote:
            "Student 500 screening will be rebuilt; no CoE or visa status is verified by this edit.",
        },
      },
      confirmationToken: issueActionConfirmationToken(claims, configuredSecret),
    });
  } catch (error) {
    if (error instanceof ActiveStepContextError) {
      return fail(
        error.code,
        error.code === "active_step_context_unavailable" ? 503 : 409
      );
    }
    return fail("proposal_unavailable", 503);
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function updateTarget(input: {
  request: Request;
  claims: ActionConfirmationClaimsV1;
  current:
    | { kind: "school_application"; value: SchoolApplicationDetailView }
    | {
        kind: "student500_application";
        value: Student500ApplicationDetailView;
      };
}): Promise<
  | Response
  | {
      replayed: boolean;
      application:
        | SchoolApplicationDetailView
        | Student500ApplicationDetailView;
    }
> {
  const { claims, current, request } = input;
  let response: Response;
  if (isCourseSelectionClaims(claims)) {
    if (
      current.kind !== "school_application" ||
      current.value.archivedAt !== null ||
      current.value.projectId !== claims.projectId
    ) {
      return fail("target_unavailable", 409);
    }
    const currentTarget = schoolTargetFromApplication(current.value);
    const isBefore =
      current.value.revision === claims.baseRevision &&
      sameSchoolTarget(currentTarget, claims.oldTarget);
    const isRecordedReplay =
      current.value.revision === claims.baseRevision + 1 &&
      sameSchoolTarget(currentTarget, claims.proposedTarget);
    if (!isBefore && !isRecordedReplay) {
      return fail("revision_conflict", 409);
    }
    const requestBody = {
      expectedRevision: claims.baseRevision,
      operationId: claims.operationId,
      ...schoolApplicationFieldsWithTarget(claims.proposedTarget),
    };
    response = await schoolApplicationHandlers.update(
      new Request(request.url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      }),
      claims.projectId,
      claims.targetId
    );
  } else if (claims.targetKind === "school_application") {
    if (
      current.kind !== "school_application" ||
      current.value.archivedAt !== null ||
      current.value.projectId !== claims.projectId
    ) {
      return fail("target_unavailable", 409);
    }
    const requestBody = {
      expectedRevision: claims.baseRevision,
      operationId: claims.operationId,
      ...schoolApplicationFieldsWithIntakeLabel(
        current.value,
        claims.proposedValue
      ),
    };
    response = await schoolApplicationHandlers.update(
      new Request(request.url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      }),
      claims.projectId,
      claims.targetId
    );
  } else {
    if (
      current.kind !== "student500_application" ||
      current.value.archivedAt !== null ||
      current.value.projectId !== claims.projectId
    ) {
      return fail("target_unavailable", 409);
    }
    const context = student500ContextWithApplicationPlace(
      current.value.context,
      claims.proposedValue
    );
    const requestBody = {
      expectedRevision: claims.baseRevision,
      operationId: claims.operationId,
      context,
    };
    response = await student500Handlers.update(
      new Request(request.url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      }),
      claims.projectId,
      claims.targetId
    );
  }
  if (!response.ok) {
    return fail(
      response.status === 409
        ? "revision_conflict"
        : "business_update_rejected",
      response.status
    );
  }
  const result = (await response.json()) as {
    replayed?: boolean;
    application?: SchoolApplicationDetailView | Student500ApplicationDetailView;
  };
  if (!result.application) {
    return fail("readback_unavailable", 503);
  }
  return {
    application: result.application,
    replayed: result.replayed === true,
  };
}

export async function confirmActionProposal(
  request: Request,
  projectId: string
): Promise<Response> {
  const authResult = await authenticate(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const body = await readBody(request, CONFIRMATION_BODY_MAX_BYTES);
  if (body instanceof Response) {
    return body;
  }
  const parsed = z
    .object({ confirmationToken: z.string().min(1).max(8000) })
    .strict()
    .safeParse(body);
  if (!parsed.success || !z.string().uuid().safeParse(projectId).success) {
    return fail("invalid_request", 400);
  }
  const configuredSecret = secret();
  if (!configuredSecret) {
    return fail("confirmation_unavailable", 503);
  }
  const claims = verifyActionConfirmationToken({
    token: parsed.data.confirmationToken,
    secret: configuredSecret,
    actorUserId: authResult.session.userId,
  });
  if (!claims || claims.projectId !== projectId) {
    return fail("confirmation_invalid_or_expired", 409);
  }

  try {
    const state = await authorizeProjectChat({
      actor: authResult.session,
      chatId: claims.chatId,
      projectId,
    });
    if (state.project.status !== "active") {
      return fail("project_not_writable", 409);
    }
    const freshSelection = makeSelectionForFreshTask(state, claims.selection);
    if (!freshSelection) {
      return fail("proposal_stale", 409);
    }
    const currentContext = resolveActiveStepContext({
      state,
      chatId: claims.chatId,
      projectId,
      selection: freshSelection,
    });
    if (
      !currentContext ||
      !proposalTaskAllowed({
        state,
        activeStep: currentContext,
        fieldPath: isCourseSelectionClaims(claims)
          ? "schoolApplication.intakeLabel"
          : claims.fieldPath,
      })
    ) {
      return fail("proposal_stale", 409);
    }
    if (isCourseSelectionClaims(claims)) {
      const linkage = courseReplacementAvailable({
        state,
        targetId: claims.targetId,
      });
      if (linkage !== "available") {
        return fail(linkage, 409);
      }
    }
    const current = await readTarget({
      projectId,
      targetKind: claims.targetKind,
      targetId: claims.targetId,
      requestUrl: request.url,
    });
    if ("response" in current) {
      return current.response;
    }
    if (current.kind !== claims.targetKind) {
      return fail("target_unavailable", 409);
    }
    const revisionsUnchanged = sameSourceRevisions(
      claims.selection.sourceRevisions,
      currentContext.sourceRevisions
    );
    const directRevision = sourceRevisionForTarget(
      currentContext.sourceRevisions,
      claims.targetKind,
      claims.targetId
    );
    const isReplayCandidate =
      isSingleProposalTargetRevisionAdvance({
        original: claims.selection,
        current: currentContext.sourceRevisions,
        targetKind: claims.targetKind,
        targetId: claims.targetId,
        baseRevision: claims.baseRevision,
      }) &&
      directRevision === claims.baseRevision + 1 &&
      current.value.revision === claims.baseRevision + 1 &&
      (claims.targetKind === "school_application"
        ? current.kind === "school_application" &&
          (isCourseSelectionClaims(claims)
            ? sameSchoolTarget(
                schoolTargetFromApplication(current.value),
                claims.proposedTarget
              )
            : current.value.intake.label === claims.proposedValue)
        : current.kind === "student500_application" &&
          current.value.context.applicationPlace === claims.proposedValue);
    if (
      (!revisionsUnchanged && !isReplayCandidate) ||
      (revisionsUnchanged && current.value.revision !== claims.baseRevision)
    ) {
      return fail("revision_conflict", 409);
    }
    const applied = await updateTarget({ request, claims, current });
    if (applied instanceof Response) {
      return applied;
    }
    const readback = await readTarget({
      projectId,
      targetKind: claims.targetKind,
      targetId: claims.targetId,
      requestUrl: request.url,
    });
    if ("response" in readback) {
      return readback.response;
    }
    if (readback.kind !== claims.targetKind) {
      return fail("readback_mismatch", 503);
    }
    const _before = current.value;
    const after = readback.value;
    if (
      after.projectId !== projectId ||
      after.revision < claims.baseRevision + 1
    ) {
      return fail("readback_mismatch", 503);
    }

    let verifiedApplication:
      | SchoolApplicationDetailView
      | Student500ApplicationDetailView;
    if (isCourseSelectionClaims(claims)) {
      if (
        current.kind !== "school_application" ||
        readback.kind !== "school_application"
      ) {
        return fail("readback_mismatch", 503);
      }
      const expectedCurrentTarget =
        current.value.revision === claims.baseRevision
          ? claims.oldTarget
          : claims.proposedTarget;
      if (
        !sameSchoolTarget(
          schoolTargetFromApplication(current.value),
          expectedCurrentTarget
        ) ||
        !sameSchoolTarget(
          schoolTargetFromApplication(readback.value),
          claims.proposedTarget
        )
      ) {
        return fail("readback_mismatch", 503);
      }
      const priorPackage = current.value.currentPackage;
      if (
        priorPackage?.status === "current" &&
        priorPackage.usable === true &&
        readback.value.currentPackage?.status === "current" &&
        readback.value.currentPackage?.usable === true
      ) {
        return fail("package_invalidation_not_observed", 503);
      }
      verifiedApplication = readback.value;
    } else if (claims.targetKind === "school_application") {
      if (
        current.kind !== "school_application" ||
        readback.kind !== "school_application"
      ) {
        return fail("readback_mismatch", 503);
      }
      if (
        readback.value.intake.label !== claims.proposedValue ||
        !sameJson(current.value.institution, readback.value.institution) ||
        !sameJson(current.value.course, readback.value.course) ||
        !sameJson(current.value.deliveryId, readback.value.deliveryId) ||
        !sameJson(current.value.intake.id, readback.value.intake.id)
      ) {
        return fail("readback_mismatch", 503);
      }
      const priorPackage = current.value.currentPackage;
      if (
        priorPackage?.status === "current" &&
        priorPackage.usable === true &&
        readback.value.currentPackage?.status === "current" &&
        readback.value.currentPackage?.usable === true
      ) {
        return fail("package_invalidation_not_observed", 503);
      }
      verifiedApplication = readback.value;
    } else {
      if (
        current.kind !== "student500_application" ||
        readback.kind !== "student500_application"
      ) {
        return fail("readback_mismatch", 503);
      }
      if (
        readback.value.context.applicationPlace !== claims.proposedValue ||
        !student500ContextDiffersOnlyByApplicationPlace(
          current.value.context,
          readback.value.context,
          claims.proposedValue
        )
      ) {
        return fail("readback_mismatch", 503);
      }
      verifiedApplication = readback.value;
      // The equality above intentionally compares every stored field other than the
      // one allowlisted field. No verification/lodgement state is supplied here.
    }

    return json({
      status: "applied",
      replayed: applied.replayed,
      proposalId: claims.operationId.slice(3),
      targetKind: claims.targetKind,
      targetId: claims.targetId,
      revision: readback.value.revision,
      application: verifiedApplication,
      readback: "verified",
    });
  } catch (error) {
    if (error instanceof ActiveStepContextError) {
      return fail(
        error.code,
        error.code === "active_step_context_unavailable" ? 503 : 409
      );
    }
    return fail("confirmation_unavailable", 503);
  }
}
