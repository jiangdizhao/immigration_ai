import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getMessageById } from "@/lib/db/queries";
import { canonicalizeManifestUrl } from "@/lib/education-intelligence/acquisition-policy";
import { verifyCourseFieldFromManifest } from "@/lib/education-intelligence/course-field-verification";
import { reviewedCourseVerificationManifests } from "@/lib/education-intelligence/course-verification-manifests";
import { resolveProjectContext } from "@/lib/projects/context-resolver";
import { activeStepSelectionV1Schema } from "@/lib/workspace/active-step-context";
import {
  boundCourseResearchResultSchema,
  courseResearchFieldV1Schema,
} from "@/lib/workspace/course-research";
import { issueCourseVerificationAttestation } from "@/lib/workspace/course-verification-attestation";
import { loadProjectStateForActor } from "@/lib/workspace/project-state-server";
import { buildProjectWorkflowProjection } from "@/lib/workspace/project-workflows";

const bodySchema = z
  .object({
    chatId: z.string().uuid(),
    selection: activeStepSelectionV1Schema,
    assistantMessageId: z.string().uuid(),
    candidateId: z.string().uuid(),
    fieldKey: z.enum(["qualification", "campus_location", "course_code"]),
  })
  .strict();

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function fail(code: string, status: number) {
  return json({ error: code }, status);
}

function sameOrigin(request: Request): boolean {
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

function sameRevisions(
  left: readonly { targetKind: string; targetId: string; revision: number }[],
  right: readonly { targetKind: string; targetId: string; revision: number }[]
) {
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

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  if (!sameOrigin(request)) {
    return fail("same_origin_required", 403);
  }
  const session = await auth();
  if (!session?.user?.id) {
    return fail("authentication_required", 401);
  }
  if (!z.string().uuid().safeParse(projectId).success) {
    return fail("invalid_request", 400);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 8192) {
    return fail("invalid_request", 413);
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 8192) {
      return fail("invalid_request", 413);
    }
    body = JSON.parse(text) as unknown;
  } catch {
    return fail("invalid_request", 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || parsed.data.selection.projectId !== projectId) {
    return fail("invalid_request", 400);
  }
  const input = parsed.data;
  try {
    const chatContext = await resolveProjectContext({
      actorUserId: session.user.id,
      chatId: input.chatId,
    });
    if (chatContext.projectId !== projectId) {
      return fail("wrong_project", 404);
    }
    const loaded = await loadProjectStateForActor({
      actorUserId: session.user.id,
      actorType: session.user.type,
      projectId,
    });
    if (loaded.kind !== "ok" || loaded.state.project.status !== "active") {
      return fail("project_unavailable", 409);
    }
    const task = buildProjectWorkflowProjection(loaded.state).tasks.find(
      (item) => item.taskId === input.selection.taskId
    );
    const standardResearchTask = Boolean(
      task &&
        task.applicability === "applicable" &&
        task.actionability === "read_only"
    );
    const sourceUnverifiedResearchTask = Boolean(
      task &&
        task.applicability === "unavailable" &&
        task.actionability === "unavailable" &&
        task.reasonCodes.length === 1 &&
        task.reasonCodes[0] === "school_course_source_unverified"
    );
    if (
      !task ||
      task.workflowKind !== "school_application" ||
      task.stepKey !== "school_discovery" ||
      task.targetKind !== "school_application" ||
      task.targetId !== input.selection.targetId ||
      task.projectId !== projectId ||
      task.definitionVersion !== input.selection.definitionVersion ||
      task.workflowKind !== input.selection.workflowKind ||
      task.stepKey !== input.selection.stepKey ||
      task.targetKind !== input.selection.targetKind ||
      (!standardResearchTask && !sourceUnverifiedResearchTask) ||
      !sameRevisions(task.sourceRevisions, input.selection.sourceRevisions)
    ) {
      return fail("active_step_selection_invalid", 409);
    }

    const rows = await getMessageById({ id: input.assistantMessageId });
    const message = rows[0] as
      | { id?: unknown; chatId?: unknown; role?: unknown; parts?: unknown }
      | undefined;
    if (
      message?.id !== input.assistantMessageId ||
      message.chatId !== input.chatId ||
      message.role !== "assistant" ||
      !Array.isArray(message.parts)
    ) {
      return fail("candidate_not_found", 404);
    }
    const metadata = message.parts.find(
      (part) =>
        part &&
        typeof part === "object" &&
        !Array.isArray(part) &&
        (part as Record<string, unknown>).type === "metadata"
    ) as Record<string, unknown> | undefined;
    const result = boundCourseResearchResultSchema.safeParse(
      metadata?.courseResearchResult
    );
    if (
      !result.success ||
      result.data.assistantMessageId !== input.assistantMessageId ||
      result.data.projectId !== projectId ||
      result.data.chatId !== input.chatId ||
      result.data.taskId !== task.taskId ||
      result.data.targetId !== task.targetId ||
      !sameRevisions(result.data.sourceRevisions, task.sourceRevisions)
    ) {
      return fail("candidate_stale_or_invalid", 409);
    }
    const candidate = result.data.candidates.find(
      (item) => item.candidateId === input.candidateId
    );
    const field = candidate?.fields.find((item) => item.key === input.fieldKey);
    if (
      !candidate ||
      !field?.value ||
      field.sourceIds.length === 0 ||
      field.sourceIds.length >= 6
    ) {
      return fail("field_verification_unavailable", 409);
    }

    const source = candidate.sources.find(
      (item) =>
        field.sourceIds.includes(item.sourceId) &&
        item.authority === "approved_institution_source" &&
        Boolean(item.manifestId)
    );
    if (!source || !source.manifestId) {
      return json({
        status: "verification_unavailable",
        reasonCode: "no_reviewed_source_manifest",
      });
    }
    const manifests = reviewedCourseVerificationManifests();
    const manifest = manifests.find((item) => {
      if (
        item.proposalId !== source.manifestId ||
        item.reviewState !== "APPROVED" ||
        !item.enabled
      ) {
        return false;
      }
      try {
        return canonicalizeManifestUrl(item, source.url) === source.url;
      } catch {
        return false;
      }
    });
    if (!manifest) {
      return json({
        status: "verification_unavailable",
        reasonCode: "no_reviewed_source_manifest",
      });
    }

    const adjustedManifest = { ...manifest, canonicalUrl: source.url };
    const verification = await verifyCourseFieldFromManifest({
      manifest: adjustedManifest,
      identity: {
        institutionName: candidate.institutionName,
        courseTitle: candidate.courseTitle,
      },
      field: input.fieldKey,
      expectedValue: field.value,
      attemptedAt: new Date().toISOString(),
    });
    if (!verification.field) {
      return json({
        status: "verification_unavailable",
        reasonCode:
          verification.attempt.diagnostic?.code ??
          "field_not_independently_supported",
      });
    }
    const observation = verification.field;
    const updatedField = courseResearchFieldV1Schema.parse({
      ...field,
      value: observation.value,
      evidenceLevel: "independently_verified_field",
      sourceIds: [...field.sourceIds, observation.sourceId],
      independentObservation: {
        observedAt: observation.observedAt,
        sourceId: observation.sourceId,
        sourceUrl: observation.sourceUrl,
        manifestId: observation.manifestId,
        snapshotSha256: observation.snapshotSha256,
        locator: observation.locator,
        effectiveFrom: null,
        effectiveTo: null,
        value: observation.value,
      },
    });
    const sourcePresentation = {
      sourceId: observation.sourceId,
      url: observation.sourceUrl,
      title: verification.sourceTitle,
      authority: "approved_institution_source" as const,
      association: "observed_only" as const,
      observedAt: observation.observedAt,
      currentness: "unknown" as const,
      manifestId: observation.manifestId,
    };
    const secret = process.env.AUTH_SECRET?.trim();
    if (!secret) {
      return fail("verification_unavailable", 503);
    }
    const attestation = issueCourseVerificationAttestation({
      secret,
      value: {
        actorUserId: session.user.id,
        projectId,
        chatId: input.chatId,
        assistantMessageId: input.assistantMessageId,
        candidateId: candidate.candidateId,
        fieldKey: input.fieldKey,
        value: observation.value,
        sourceId: observation.sourceId,
        requestedSourceId: source.sourceId,
        sourceUrl: observation.sourceUrl,
        sourceTitle: verification.sourceTitle,
        manifestId: observation.manifestId,
        observedAt: observation.observedAt,
        snapshotSha256: observation.snapshotSha256,
        locator: observation.locator,
      },
    });
    return json({
      status: "verified",
      field: updatedField,
      source: sourcePresentation,
      attestation,
    });
  } catch {
    return fail("verification_unavailable", 503);
  }
}
