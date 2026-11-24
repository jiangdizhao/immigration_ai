import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  type ActiveStepSelectionV1,
  activeStepSelectionV1Schema,
} from "./active-step-context";

export const ACTION_PROPOSAL_SCHEMA_VERSION =
  "phase15.action-proposal.v1" as const;
export const ACTION_PROPOSAL_TTL_MS = 10 * 60 * 1000;

const boundedText = z.string().max(120);
const targetText = z.string().min(1).max(500);
const schoolTargetSchema = z
  .object({
    institutionName: targetText,
    institutionId: z.string().max(128).nullable(),
    courseTitle: targetText,
    courseId: z.string().max(128).nullable(),
    deliveryId: z.string().max(128).nullable(),
    intakeId: z.string().max(128).nullable(),
    intakeLabel: z.string().max(120).nullable(),
  })
  .strict();
const courseSelectionOperationSchema = z
  .object({
    kind: z.literal("select_school_course_candidate"),
    assistantMessageId: z.string().uuid(),
    candidateId: z.string().uuid(),
    identityEvidenceLevel: z.enum([
      "model_research_lead",
      "official_source_referenced",
    ]),
    fieldEvidence: z
      .array(
        z
          .object({
            fieldKey: z.enum([
              "qualification",
              "campus_location",
              "course_code",
              "cricos_code",
              "duration",
              "tuition_amount",
              "tuition_currency",
              "tuition_fee_basis",
              "intake",
              "entry_requirements_summary",
            ]),
            evidenceLevel: z.enum([
              "model_research_lead",
              "official_source_referenced",
              "independently_verified_field",
            ]),
            sourceIds: z.array(z.string().uuid()).max(6),
            independentObservation: z
              .object({
                observedAt: z.string().datetime(),
                sourceId: z.string().uuid(),
                sourceUrl: z.string().url().max(2048),
                manifestId: z.string().min(1).max(128),
                snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/u),
                locator: z.string().min(1).max(512),
                effectiveFrom: z.string().date().nullable(),
                effectiveTo: z.string().date().nullable(),
                value: z.string().max(500),
              })
              .strict()
              .nullable(),
          })
          .strict()
      )
      .max(12),
    sourceIds: z.array(z.string().uuid()).max(12),
  })
  .strict();
const schoolProposalSchema = z
  .object({
    schemaVersion: z.literal(ACTION_PROPOSAL_SCHEMA_VERSION),
    proposalId: z.string().uuid(),
    projectId: z.string().uuid(),
    chatId: z.string().uuid(),
    targetKind: z.literal("school_application"),
    targetId: z.string().uuid(),
    workflowKind: z.literal("school_application"),
    stepKey: z.literal("school_discovery"),
    fieldPath: z.literal("schoolApplication.intakeLabel"),
    oldValue: boundedText.nullable(),
    proposedValue: boundedText.nullable(),
    baseRevision: z.number().int().positive().safe(),
    sourceRefs: z.array(z.string().min(1).max(160)).max(4),
    assumptions: z.array(z.string().min(1).max(240)).max(4),
    affectedDependencies: z.array(z.string().min(1).max(200)).max(8),
    expiresAt: z.string().datetime(),
    status: z.literal("awaiting_confirmation"),
  })
  .strict();
const studentProposalSchema = z
  .object({
    schemaVersion: z.literal(ACTION_PROPOSAL_SCHEMA_VERSION),
    proposalId: z.string().uuid(),
    projectId: z.string().uuid(),
    chatId: z.string().uuid(),
    targetKind: z.literal("student500_application"),
    targetId: z.string().uuid(),
    workflowKind: z.literal("student_500"),
    stepKey: z.literal("visa_planning"),
    fieldPath: z.literal("student500.applicationPlace"),
    oldValue: z.enum(["onshore", "offshore", "unknown"]),
    proposedValue: z.enum(["onshore", "offshore", "unknown"]),
    baseRevision: z.number().int().positive().safe(),
    sourceRefs: z.array(z.string().min(1).max(160)).max(4),
    assumptions: z.array(z.string().min(1).max(240)).max(4),
    affectedDependencies: z.array(z.string().min(1).max(200)).max(8),
    expiresAt: z.string().datetime(),
    status: z.literal("awaiting_confirmation"),
  })
  .strict();
const courseSelectionProposalSchema = z
  .object({
    schemaVersion: z.literal(ACTION_PROPOSAL_SCHEMA_VERSION),
    proposalId: z.string().uuid(),
    projectId: z.string().uuid(),
    chatId: z.string().uuid(),
    targetKind: z.literal("school_application"),
    targetId: z.string().uuid(),
    workflowKind: z.literal("school_application"),
    stepKey: z.literal("school_discovery"),
    operation: courseSelectionOperationSchema,
    oldTarget: schoolTargetSchema,
    proposedTarget: schoolTargetSchema,
    baseRevision: z.number().int().positive().safe(),
    sourceRefs: z.array(z.string().min(1).max(160)).max(12),
    assumptions: z.array(z.string().min(1).max(240)).max(4),
    affectedDependencies: z.array(z.string().min(1).max(200)).max(8),
    expiresAt: z.string().datetime(),
    status: z.literal("awaiting_confirmation"),
  })
  .strict();

export const actionProposalV1Schema = z.union([
  schoolProposalSchema,
  studentProposalSchema,
  courseSelectionProposalSchema,
]);
export type ActionProposalV1 = z.infer<typeof actionProposalV1Schema>;

const commonClaims = {
  schemaVersion: z.literal("phase15.action-confirmation.v1"),
  actorUserId: z.string().min(1).max(128),
  selection: activeStepSelectionV1Schema,
  operationId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/u),
  issuedAt: z.number().int().positive().safe(),
  expiresAt: z.number().int().positive().safe(),
};
const schoolClaimsSchema = z
  .object({
    ...commonClaims,
    projectId: z.string().uuid(),
    chatId: z.string().uuid(),
    targetKind: z.literal("school_application"),
    targetId: z.string().uuid(),
    workflowKind: z.literal("school_application"),
    stepKey: z.literal("school_discovery"),
    fieldPath: z.literal("schoolApplication.intakeLabel"),
    oldValue: boundedText.nullable(),
    proposedValue: boundedText.nullable(),
    baseRevision: z.number().int().positive().safe(),
  })
  .strict();
const studentClaimsSchema = z
  .object({
    ...commonClaims,
    projectId: z.string().uuid(),
    chatId: z.string().uuid(),
    targetKind: z.literal("student500_application"),
    targetId: z.string().uuid(),
    workflowKind: z.literal("student_500"),
    stepKey: z.literal("visa_planning"),
    fieldPath: z.literal("student500.applicationPlace"),
    oldValue: z.enum(["onshore", "offshore", "unknown"]),
    proposedValue: z.enum(["onshore", "offshore", "unknown"]),
    baseRevision: z.number().int().positive().safe(),
  })
  .strict();
const courseSelectionClaimsSchema = z
  .object({
    ...commonClaims,
    projectId: z.string().uuid(),
    chatId: z.string().uuid(),
    targetKind: z.literal("school_application"),
    targetId: z.string().uuid(),
    workflowKind: z.literal("school_application"),
    stepKey: z.literal("school_discovery"),
    operation: courseSelectionOperationSchema,
    oldTarget: schoolTargetSchema,
    proposedTarget: schoolTargetSchema,
    baseRevision: z.number().int().positive().safe(),
  })
  .strict();

export const actionConfirmationClaimsV1Schema = z.union([
  schoolClaimsSchema,
  studentClaimsSchema,
  courseSelectionClaimsSchema,
]);
export type ActionConfirmationClaimsV1 = z.infer<
  typeof actionConfirmationClaimsV1Schema
>;
export type LegacyActionConfirmationClaims =
  | z.infer<typeof schoolClaimsSchema>
  | z.infer<typeof studentClaimsSchema>;
export type ActionProposalFieldPath =
  | "schoolApplication.intakeLabel"
  | "student500.applicationPlace";

export function isCourseSelectionClaims(
  claims: ActionConfirmationClaimsV1
): claims is z.infer<typeof courseSelectionClaimsSchema> {
  return "operation" in claims;
}

function claimsIdentityMatchesSelection(
  claims: ActionConfirmationClaimsV1
): boolean {
  return (
    claims.projectId === claims.selection.projectId &&
    claims.workflowKind === claims.selection.workflowKind &&
    claims.stepKey === claims.selection.stepKey &&
    claims.targetKind === claims.selection.targetKind &&
    claims.targetId === claims.selection.targetId
  );
}

function signature(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update("phase15-m3-e3-confirmation-v1\0")
    .update(encodedPayload)
    .digest();
}

export function issueActionConfirmationToken(
  claims: ActionConfirmationClaimsV1,
  secret: string
): string {
  if (!secret.trim()) {
    throw new Error("confirmation_secret_unavailable");
  }
  const validated = actionConfirmationClaimsV1Schema.parse(claims);
  if (!claimsIdentityMatchesSelection(validated)) {
    throw new Error("confirmation_selection_mismatch");
  }
  const encoded = Buffer.from(JSON.stringify(validated), "utf8").toString(
    "base64url"
  );
  return `${encoded}.${signature(encoded, secret).toString("base64url")}`;
}

export function verifyActionConfirmationToken(input: {
  token: string;
  secret: string;
  actorUserId: string;
  now?: number;
}): ActionConfirmationClaimsV1 | null {
  if (!input.secret.trim() || input.token.length > 8000) {
    return null;
  }
  const parts = input.token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const [encoded, suppliedSignature] = parts;
  let decodedSignature: Buffer;
  let parsedPayload: unknown;
  try {
    decodedSignature = Buffer.from(suppliedSignature, "base64url");
    const expected = signature(encoded, input.secret);
    if (
      decodedSignature.length !== expected.length ||
      !timingSafeEqual(decodedSignature, expected)
    ) {
      return null;
    }
    parsedPayload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
  } catch {
    return null;
  }
  const claims = actionConfirmationClaimsV1Schema.safeParse(parsedPayload);
  if (
    !claims.success ||
    claims.data.actorUserId !== input.actorUserId ||
    claims.data.issuedAt > (input.now ?? Date.now()) ||
    claims.data.expiresAt <= (input.now ?? Date.now()) ||
    claims.data.expiresAt - claims.data.issuedAt > ACTION_PROPOSAL_TTL_MS ||
    !claimsIdentityMatchesSelection(claims.data)
  ) {
    return null;
  }
  return claims.data;
}

export function proposalFromClaims(
  claims: ActionConfirmationClaimsV1,
  input: { assumptions: string[]; affectedDependencies: string[] }
): ActionProposalV1 {
  if (isCourseSelectionClaims(claims)) {
    return courseSelectionProposalSchema.parse({
      schemaVersion: ACTION_PROPOSAL_SCHEMA_VERSION,
      proposalId: claims.operationId.slice(3),
      projectId: claims.projectId,
      chatId: claims.chatId,
      targetKind: claims.targetKind,
      targetId: claims.targetId,
      workflowKind: claims.workflowKind,
      stepKey: claims.stepKey,
      operation: claims.operation,
      oldTarget: claims.oldTarget,
      proposedTarget: claims.proposedTarget,
      baseRevision: claims.baseRevision,
      sourceRefs: claims.operation.sourceIds,
      assumptions: input.assumptions,
      affectedDependencies: input.affectedDependencies,
      expiresAt: new Date(claims.expiresAt).toISOString(),
      status: "awaiting_confirmation",
    });
  }
  return actionProposalV1Schema.parse({
    schemaVersion: ACTION_PROPOSAL_SCHEMA_VERSION,
    proposalId: claims.operationId.slice(3),
    projectId: claims.projectId,
    chatId: claims.chatId,
    targetKind: claims.targetKind,
    targetId: claims.targetId,
    workflowKind: claims.workflowKind,
    stepKey: claims.stepKey,
    fieldPath: claims.fieldPath,
    oldValue: claims.oldValue,
    proposedValue: claims.proposedValue,
    baseRevision: claims.baseRevision,
    sourceRefs: [],
    assumptions: input.assumptions,
    affectedDependencies: input.affectedDependencies,
    expiresAt: new Date(claims.expiresAt).toISOString(),
    status: "awaiting_confirmation",
  });
}

export function proposalSelectionMatches(
  selection: ActiveStepSelectionV1,
  claims: ActionConfirmationClaimsV1
): boolean {
  return (
    selection.projectId === claims.projectId &&
    selection.taskId === claims.selection.taskId &&
    selection.workflowKind === claims.selection.workflowKind &&
    selection.definitionVersion === claims.selection.definitionVersion &&
    selection.stepKey === claims.selection.stepKey &&
    selection.targetKind === claims.selection.targetKind &&
    selection.targetId === claims.selection.targetId &&
    JSON.stringify(selection.sourceRevisions) ===
      JSON.stringify(claims.selection.sourceRevisions)
  );
}

export function isSingleProposalTargetRevisionAdvance(input: {
  original: ActiveStepSelectionV1;
  current: readonly {
    targetKind: string;
    targetId: string;
    revision: number;
  }[];
  targetKind: string;
  targetId: string;
  baseRevision: number;
}): boolean {
  const original = input.original.sourceRevisions;
  if (original.length !== input.current.length) {
    return false;
  }
  let changes = 0;
  for (let index = 0; index < original.length; index += 1) {
    const before = original[index];
    const after = input.current[index];
    if (
      !before ||
      !after ||
      before.targetKind !== after.targetKind ||
      before.targetId !== after.targetId
    ) {
      return false;
    }
    if (before.revision === after.revision) {
      continue;
    }
    changes += 1;
    if (
      before.targetKind !== input.targetKind ||
      before.targetId !== input.targetId ||
      before.revision !== input.baseRevision ||
      after.revision !== input.baseRevision + 1
    ) {
      return false;
    }
  }
  return changes === 1;
}
