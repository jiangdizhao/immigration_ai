import { z } from "zod";
import type { ProjectAssistantContext } from "@/lib/projects/project-assistant-context";
import type { ActiveStepSelectionV1 } from "./active-step-context";
import type { WorkflowTaskProjectionV1 } from "./project-workflows";

export const COURSE_RESEARCH_RESULT_VERSION =
  "phase15.course-research-result.v1" as const;
export const COURSE_RESEARCH_MAX_BYTES = 48_000;

function boundedScalarText(min: number, max: number) {
  return z.string().superRefine((value, context) => {
    const length = Array.from(value).length;
    if (length < min || length > max) {
      context.addIssue({
        code: "custom",
        message: "Text length is outside the shared scalar-value bound",
      });
    }
  });
}

function boundedUrl(max: number) {
  return z
    .string()
    .url()
    .superRefine((value, context) => {
      if (Array.from(value).length > max) {
        context.addIssue({ code: "custom", message: "URL exceeds its bound" });
      }
    });
}

function canonicalUtcTimestamp() {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u)
    .refine((value) => Number.isFinite(Date.parse(value)));
}

const evidenceLevel = z.enum([
  "model_research_lead",
  "official_source_referenced",
  "independently_verified_field",
]);
const identityEvidenceLevel = z.enum([
  "model_research_lead",
  "official_source_referenced",
]);
const fieldKey = z.enum([
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
]);
const revisionSchema = z
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

export const courseResearchSourceV1Schema = z
  .object({
    sourceId: z.string().uuid(),
    url: boundedUrl(2048),
    title: boundedScalarText(1, 240),
    authority: z.enum([
      "cricos_registry",
      "study_australia",
      "unverified_source",
      "approved_institution_source",
    ]),
    association: z.enum(["cited", "observed_only"]),
    observedAt: canonicalUtcTimestamp(),
    currentness: z.literal("unknown"),
    manifestId: boundedScalarText(1, 128).optional(),
  })
  .strict()
  .superRefine((source, context) => {
    try {
      const url = new URL(source.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
        url.hash ||
        url.hostname.endsWith(".local") ||
        url.hostname === "localhost" ||
        /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(url.hostname) ||
        url.hostname.startsWith("[")
      ) {
        context.addIssue({
          code: "custom",
          message: "Unsafe public source URL",
        });
      }
      const expectedAuthority =
        url.hostname === "cricos.education.gov.au"
          ? "cricos_registry"
          : url.hostname === "studyaustralia.gov.au" ||
              url.hostname === "www.studyaustralia.gov.au"
            ? "study_australia"
            : "unverified_source";
      if (
        source.authority !== expectedAuthority &&
        source.authority !== "approved_institution_source"
      ) {
        context.addIssue({
          code: "custom",
          message: "Source authority does not match its exact host",
        });
      }
      if (
        source.authority === "approved_institution_source" &&
        (!source.manifestId ||
          !/^[a-z0-9][a-z0-9._:-]{0,127}$/iu.test(source.manifestId))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Institution source authority requires an exact approved manifest identity",
        });
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "Invalid public source URL",
      });
    }
  });

export const courseResearchFieldV1Schema = z
  .object({
    key: fieldKey,
    value: boundedScalarText(0, 500).nullable(),
    evidenceLevel,
    sourceIds: z.array(z.string().uuid()).max(6),
    applicabilityNote: boundedScalarText(0, 240).nullable(),
    independentObservation: z
      .object({
        observedAt: canonicalUtcTimestamp(),
        sourceId: z.string().uuid(),
        sourceUrl: boundedUrl(2048),
        manifestId: boundedScalarText(1, 128),
        snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        locator: boundedScalarText(1, 512),
        effectiveFrom: z.string().date().nullable(),
        effectiveTo: z.string().date().nullable(),
        value: boundedScalarText(0, 500),
      })
      .strict()
      .nullable(),
  })
  .strict();

const candidateSchema = z
  .object({
    candidateId: z.string().uuid(),
    institutionName: boundedScalarText(1, 200),
    courseTitle: boundedScalarText(1, 240),
    identityEvidenceLevel,
    identitySourceIds: z.array(z.string().uuid()).max(6),
    fields: z.array(courseResearchFieldV1Schema).max(12),
    sources: z.array(courseResearchSourceV1Schema).max(6),
    limitations: z.array(boundedScalarText(1, 240)).max(6),
    verificationState: z.enum([
      "not_requested",
      "verified_some_fields",
      "unavailable",
    ]),
  })
  .strict()
  .superRefine((candidate, context) => {
    const sourceIds = new Set(
      candidate.sources.map((source) => source.sourceId)
    );
    if (sourceIds.size !== candidate.sources.length) {
      context.addIssue({
        code: "custom",
        message: "Duplicate source identity",
      });
    }
    const fieldKeys = candidate.fields.map((field) => field.key);
    if (new Set(fieldKeys).size !== fieldKeys.length) {
      context.addIssue({
        code: "custom",
        message: "Duplicate field observation",
      });
    }
    if (
      [
        ...candidate.identitySourceIds,
        ...candidate.fields.flatMap((field) => field.sourceIds),
      ].some((id) => !sourceIds.has(id))
    ) {
      context.addIssue({
        code: "custom",
        message: "Unbound course source reference",
      });
    }
    if (candidate.identityEvidenceLevel === "official_source_referenced") {
      const identitySupported = candidate.identitySourceIds.some((id) => {
        const source = candidate.sources.find((entry) => entry.sourceId === id);
        return Boolean(
          source &&
            source.association === "cited" &&
            [
              "cricos_registry",
              "study_australia",
              "approved_institution_source",
            ].includes(source.authority)
        );
      });
      if (!identitySupported) {
        context.addIssue({
          code: "custom",
          message: "L2 identity requires a cited official source",
        });
      }
    }
    for (const field of candidate.fields) {
      if (
        field.evidenceLevel === "independently_verified_field" &&
        !field.independentObservation
      ) {
        context.addIssue({
          code: "custom",
          message: "L3 requires source observation metadata",
        });
      }
      if (
        field.evidenceLevel !== "independently_verified_field" &&
        field.independentObservation
      ) {
        context.addIssue({
          code: "custom",
          message: "Only L3 may carry independent observation",
        });
      }
      if (field.evidenceLevel === "official_source_referenced") {
        const fieldAuthorities: Record<string, readonly string[]> = {
          cricos_registry: [
            "qualification",
            "campus_location",
            "course_code",
            "cricos_code",
            "duration",
          ],
          study_australia: ["qualification", "campus_location", "duration"],
        };
        const supported = field.sourceIds.some((sourceId) => {
          const source = candidate.sources.find(
            (entry) => entry.sourceId === sourceId
          );
          return Boolean(
            source &&
              source.association === "cited" &&
              (fieldAuthorities[source.authority] ?? []).includes(field.key)
          );
        });
        if (!field.value || !supported) {
          context.addIssue({
            code: "custom",
            message: "L2 requires a cited official source within field scope",
          });
        }
      }
      if (
        field.evidenceLevel === "independently_verified_field" &&
        field.independentObservation &&
        field.value !== field.independentObservation.value
      ) {
        context.addIssue({
          code: "custom",
          message: "L3 value must match its independent observation",
        });
      }
      if (
        field.evidenceLevel === "independently_verified_field" &&
        field.independentObservation &&
        !field.sourceIds.includes(field.independentObservation.sourceId)
      ) {
        context.addIssue({
          code: "custom",
          message: "L3 observation source must be linked to the field",
        });
      }
      if (field.independentObservation) {
        const observationSource = candidate.sources.find(
          (source) => source.sourceId === field.independentObservation?.sourceId
        );
        if (
          !observationSource ||
          observationSource.url !== field.independentObservation.sourceUrl ||
          observationSource.manifestId !==
            field.independentObservation.manifestId
        ) {
          context.addIssue({
            code: "custom",
            message: "L3 observation must match its bound source identity",
          });
        }
        try {
          const observationUrl = new URL(
            field.independentObservation.sourceUrl
          );
          if (
            observationUrl.protocol !== "https:" ||
            observationUrl.username ||
            observationUrl.password ||
            observationUrl.port ||
            observationUrl.search ||
            observationUrl.hash ||
            observationUrl.hostname === "localhost" ||
            observationUrl.hostname.endsWith(".local") ||
            /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(observationUrl.hostname) ||
            observationUrl.hostname.startsWith("[")
          ) {
            context.addIssue({
              code: "custom",
              message: "Unsafe independent observation URL",
            });
          }
        } catch {
          context.addIssue({
            code: "custom",
            message: "Invalid independent observation URL",
          });
        }
      }
    }
  });

const wireResultBase = z
  .object({
    schemaVersion: z.literal(COURSE_RESEARCH_RESULT_VERSION),
    projectId: z.string().uuid(),
    chatId: z.string().uuid(),
    taskId: z.string().min(1).max(512),
    definitionVersion: z.literal("phase15.project-workflows.v1"),
    workflowKind: z.literal("school_application"),
    stepKey: z.literal("school_discovery"),
    targetKind: z.literal("school_application"),
    targetId: z.string().uuid(),
    sourceRevisions: z.array(revisionSchema).max(8),
    observedAt: canonicalUtcTimestamp(),
    researchStatus: z.enum(["not_performed", "completed"]).default("completed"),
    candidates: z.array(candidateSchema).max(6),
    limitations: z.array(boundedScalarText(1, 240)).max(6),
    diagnostics: z
      .object({
        invalidCandidateCount: z.number().int().nonnegative(),
        invalidFieldCount: z.number().int().nonnegative().default(0),
        rejectedSourceLocatorCount: z.number().int().nonnegative().default(0),
      })
      .strict(),
  })
  .strict();

const wireResultSchema = wireResultBase.superRefine((result, context) => {
  if (
    new Set(result.candidates.map((candidate) => candidate.candidateId))
      .size !== result.candidates.length
  ) {
    context.addIssue({
      code: "custom",
      message: "Duplicate candidate identity",
    });
  }
  if (
    new TextEncoder().encode(JSON.stringify(result)).byteLength >
    COURSE_RESEARCH_MAX_BYTES
  ) {
    context.addIssue({
      code: "custom",
      message: "Research envelope exceeds its byte bound",
    });
  }
});

const activationReasons = [
  "active_step_context_absent",
  "not_project_chat",
  "project_context_unavailable",
  "project_context_stale",
  "project_not_active",
  "frontend_chat_missing",
  "chat_mismatch",
  "project_mismatch",
  "task_not_school_discovery",
  "workflow_kind_mismatch",
  "step_key_mismatch",
  "target_kind_mismatch",
  "source_coverage_unavailable",
  "task_not_researchable",
  "school_index_unavailable",
  "school_target_unavailable",
  "school_target_revision_mismatch",
  "school_course_source_unverified",
  "school_discovery_available",
] as const;

export const courseResearchDiagnosticsSchema = z
  .object({
    schema_version: z.literal("phase15.course-research-diagnostics.v1"),
    scope_fingerprint: z
      .string()
      .regex(/^[0-9a-f]{16}$/u)
      .nullable(),
    client_scope_fingerprint: z
      .string()
      .regex(/^[0-9a-f]{16}$/u)
      .nullable()
      .default(null),
    server_scope_fingerprint: z
      .string()
      .regex(/^[0-9a-f]{16}$/u)
      .nullable()
      .default(null),
    scope_match: z.boolean().nullable().default(null),
    client_requested_workflow_kind: z
      .enum(["project_planning", "school_application", "school_admissions", "student_500"])
      .nullable()
      .default(null),
    client_requested_step_key: z
      .enum([
        "project_goal", "workflow_scope", "source_coverage", "planning",
        "school_discovery", "academic_readiness", "language_preparation",
        "finance_documents", "statements_materials", "pre_submission",
        "admissions_planning", "admissions_requirements", "offer_coe_evidence",
        "external_handoff", "visa_planning", "study_evidence_coe",
        "genuine_student_preparation", "financial_capacity",
        "conditional_supporting_requirements", "pre_lodgement", "lodgement_events",
      ])
      .nullable()
      .default(null),
    client_requested_target_kind: z
      .enum(["project", "school_application", "school_admission_case", "student500_application"])
      .nullable()
      .default(null),
    server_resolved_workflow_kind: z
      .enum(["project_planning", "school_application", "school_admissions", "student_500"])
      .nullable()
      .default(null),
    server_resolved_step_key: z
      .enum([
        "project_goal", "workflow_scope", "source_coverage", "planning",
        "school_discovery", "academic_readiness", "language_preparation",
        "finance_documents", "statements_materials", "pre_submission",
        "admissions_planning", "admissions_requirements", "offer_coe_evidence",
        "external_handoff", "visa_planning", "study_evidence_coe",
        "genuine_student_preparation", "financial_capacity",
        "conditional_supporting_requirements", "pre_lodgement", "lodgement_events",
      ])
      .nullable()
      .default(null),
    server_resolved_target_kind: z
      .enum(["project", "school_application", "school_admission_case", "student500_application"])
      .nullable()
      .default(null),
    python_received_workflow_kind: z
      .enum(["project_planning", "school_application", "school_admissions", "student_500"])
      .nullable()
      .default(null),
    python_received_step_key: z
      .enum([
        "project_goal", "workflow_scope", "source_coverage", "planning",
        "school_discovery", "academic_readiness", "language_preparation",
        "finance_documents", "statements_materials", "pre_submission",
        "admissions_planning", "admissions_requirements", "offer_coe_evidence",
        "external_handoff", "visa_planning", "study_evidence_coe",
        "genuine_student_preparation", "financial_capacity",
        "conditional_supporting_requirements", "pre_lodgement", "lodgement_events",
      ])
      .nullable()
      .default(null),
    python_received_target_kind: z
      .enum(["project", "school_application", "school_admission_case", "student500_application"])
      .nullable()
      .default(null),
    activation_failed_condition: z
      .enum(["workflow_kind_mismatch", "step_key_mismatch", "target_kind_mismatch"])
      .nullable()
      .default(null),
    course_research_enabled: z.boolean(),
    research_activation_reason: z.enum(activationReasons),
    research_tool_exposed: z.boolean(),
    research_prompt_enabled: z.boolean(),
    provider_schema_status: z.enum(["not_exposed", "required", "optional"]),
    suggestion_present: z.boolean(),
    suggestion_container_status: z.enum([
      "not_checked",
      "omitted",
      "invalid",
      "empty",
      "valid",
    ]),
    diagnostic_counter_saturated: z.boolean(),
    research_status: z
      .enum(["not_performed", "completed"])
      .nullable()
      .default(null),
    raw_candidate_count: z.number().int().min(0).max(6),
    valid_candidate_count: z.number().int().min(0).max(6),
    rejected_candidate_count: z.number().int().min(0).max(6),
    rejected_field_count: z.number().int().min(0).max(72),
    source_locator_count: z.number().int().min(0).max(504),
    resolved_source_count: z.number().int().min(0).max(288),
    rejected_source_count: z.number().int().min(0).max(504),
    python_binding_status: z.enum([
      "not_run",
      "not_eligible",
      "omitted",
      "invalid_container",
      "empty",
      "all_candidates_rejected",
      "result_too_large",
      "partial",
      "bound",
    ]),
    python_binding_reason: z.enum([
      "not_run",
      ...activationReasons,
      "suggestion_omitted",
      "suggestion_container_invalid",
      "all_candidates_invalid",
      "bound_result_exceeds_python_limit",
      "bound_result_serialization_failed",
      "research_not_performed",
      "research_completed_without_candidates",
      "some_candidates_rejected",
      "all_valid_candidates_bound",
      "answer_submission_unavailable",
    ]),
    python_bound_candidate_count: z.number().int().min(0).max(6),
    frontend_binding_status: z.enum([
      "not_run",
      "missing",
      "schema_rejected",
      "context_mismatch",
      "result_too_large",
      "empty_candidates",
      "bound",
    ]),
    frontend_binding_reason: z.enum([
      "not_run",
      "python_result_missing",
      "wire_schema_invalid",
      "project_mismatch",
      "chat_mismatch",
      "task_mismatch",
      "target_mismatch",
      "source_revision_mismatch",
      "context_unavailable",
      "assistant_identity_missing",
      "bound_envelope_invalid",
      "bound_result_exceeds_frontend_limit",
      "empty_candidate_list",
      "bound_success",
    ]),
    frontend_bound_candidate_count: z.number().int().min(0).max(6),
  })
  .strict();

export type CourseResearchDiagnosticsV1 = z.infer<
  typeof courseResearchDiagnosticsSchema
>;

export const boundCourseResearchResultSchema = z
  .object({
    ...wireResultBase.shape,
    assistantMessageId: z.string().uuid(),
  })
  .strict()
  .superRefine((result, context) => {
    const sourceIds = new Set(
      result.candidates.flatMap((candidate) =>
        candidate.sources.map((source) => source.sourceId)
      )
    );
    if (
      new TextEncoder().encode(JSON.stringify(result)).byteLength >
      COURSE_RESEARCH_MAX_BYTES
    ) {
      context.addIssue({
        code: "custom",
        message: "Bound research envelope exceeds its byte bound",
      });
    }
    if (
      result.candidates.some((candidate) =>
        candidate.sources.some((source) => !sourceIds.has(source.sourceId))
      )
    ) {
      context.addIssue({ code: "custom", message: "Invalid source reference" });
    }
  });

export type BoundCourseResearchResultV1 = z.infer<
  typeof boundCourseResearchResultSchema
>;
export type CourseResearchCandidateV1 =
  BoundCourseResearchResultV1["candidates"][number];
export type CourseResearchFieldV1 = CourseResearchCandidateV1["fields"][number];

type CourseResearchScopeIdentity = Pick<
  NonNullable<ProjectAssistantContext["activeStep"]>,
  | "chatId"
  | "projectId"
  | "taskId"
  | "workflowKind"
  | "stepKey"
  | "targetKind"
  | "targetId"
  | "sourceRevisions"
>;

function courseResearchScopeFingerprintForIdentity(
  projectId: string,
  active: CourseResearchScopeIdentity
): string {
  const canonical = JSON.stringify([
    projectId,
    active.chatId,
    active.projectId,
    active.taskId,
    active.workflowKind,
    active.stepKey,
    active.targetKind,
    active.targetId,
    active.sourceRevisions.map((item) => [
      item.targetKind,
      item.targetId,
      item.revision,
    ]),
  ]);
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function courseResearchScopeFingerprint(input: {
  projectId: string;
  chatId: string;
  activeStep: NonNullable<ProjectAssistantContext["activeStep"]>;
}): string {
  return courseResearchScopeFingerprintForIdentity(
    input.projectId,
    input.activeStep
  );
}

export function courseResearchSelectionScopeFingerprint(input: {
  chatId: string;
  selection: ActiveStepSelectionV1;
}): string {
  const { selection } = input;
  return courseResearchScopeFingerprintForIdentity(selection.projectId, {
    chatId: input.chatId,
    projectId: selection.projectId,
    taskId: selection.taskId,
    workflowKind: selection.workflowKind,
    stepKey: selection.stepKey,
    targetKind: selection.targetKind,
    targetId: selection.targetId,
    sourceRevisions: selection.sourceRevisions,
  });
}

export function courseResearchDiagnosticsForTask(input: {
  value: unknown;
  projectId: string;
  chatId: string | null;
  task: WorkflowTaskProjectionV1;
}): CourseResearchDiagnosticsV1 | null {
  const parsed = courseResearchDiagnosticsSchema.safeParse(input.value);
  if (!parsed.success || !input.chatId) {
    return null;
  }
  const active = {
    chatId: input.chatId,
    projectId: input.projectId,
    taskId: input.task.taskId,
    workflowKind: input.task.workflowKind,
    stepKey: input.task.stepKey,
    targetKind: input.task.targetKind,
    targetId: input.task.targetId,
    sourceRevisions: input.task.sourceRevisions,
  } as NonNullable<ProjectAssistantContext["activeStep"]>;
  const expected = courseResearchScopeFingerprint({
    projectId: input.projectId,
    chatId: input.chatId,
    activeStep: active,
  });
  return parsed.data.scope_fingerprint === expected ? parsed.data : null;
}

export type CourseResearchEmptyState =
  | "not_started"
  | "not_performed"
  | "completed_without_candidates"
  | "structured_result_unavailable"
  | "historical_results_stale";

export function courseResearchEmptyState(input: {
  result: BoundCourseResearchResultV1 | null;
  resultIsCurrent: boolean;
  diagnostics: CourseResearchDiagnosticsV1 | null;
}): CourseResearchEmptyState {
  if (input.result && !input.resultIsCurrent) {
    return "historical_results_stale";
  }
  if (input.result?.researchStatus === "not_performed") {
    return "not_performed";
  }
  if (input.result && input.result.candidates.length === 0) {
    return "completed_without_candidates";
  }
  const diagnostics = input.diagnostics;
  if (
    diagnostics &&
    (diagnostics.frontend_binding_status === "missing" ||
      diagnostics.frontend_binding_status === "schema_rejected" ||
      diagnostics.frontend_binding_status === "context_mismatch" ||
      diagnostics.frontend_binding_status === "result_too_large" ||
      diagnostics.python_binding_status === "omitted" ||
      diagnostics.python_binding_status === "invalid_container" ||
      diagnostics.python_binding_status === "all_candidates_rejected" ||
      diagnostics.python_binding_status === "result_too_large")
  ) {
    return "structured_result_unavailable";
  }
  if (
    diagnostics?.suggestion_container_status === "empty" &&
    diagnostics.research_status === "completed"
  ) {
    return "completed_without_candidates";
  }
  if (
    diagnostics?.suggestion_container_status === "empty" &&
    diagnostics.research_status === "not_performed"
  ) {
    return "not_performed";
  }
  return "not_started";
}

function exactRevisions(
  left: BoundCourseResearchResultV1["sourceRevisions"],
  right: WorkflowTaskProjectionV1["sourceRevisions"]
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return Boolean(
        other &&
          entry.targetKind === other.targetKind &&
          entry.targetId === other.targetId &&
          entry.revision === other.revision
      );
    })
  );
}

export function bindCourseResearchResult(input: {
  value: unknown;
  projectId: string | null;
  chatId: string | null;
  assistantMessageId: string | null;
  context: ProjectAssistantContext | null;
}): BoundCourseResearchResultV1 | null {
  return bindCourseResearchResultWithDiagnostics(input).result;
}

export type CourseResearchFrontendBinding = {
  result: BoundCourseResearchResultV1 | null;
  status: CourseResearchDiagnosticsV1["frontend_binding_status"];
  reason: CourseResearchDiagnosticsV1["frontend_binding_reason"];
  boundCandidateCount: number;
};

export function bindCourseResearchResultWithDiagnostics(input: {
  value: unknown;
  projectId: string | null;
  chatId: string | null;
  assistantMessageId: string | null;
  context: ProjectAssistantContext | null;
}): CourseResearchFrontendBinding {
  const fail = (
    status: CourseResearchFrontendBinding["status"],
    reason: CourseResearchFrontendBinding["reason"]
  ): CourseResearchFrontendBinding => ({
    result: null,
    status,
    reason,
    boundCandidateCount: 0,
  });
  if (input.value == null) {
    return fail("missing", "python_result_missing");
  }
  let serializedBytes = 0;
  try {
    serializedBytes = new TextEncoder().encode(
      JSON.stringify(input.value)
    ).byteLength;
  } catch {
    return fail("schema_rejected", "wire_schema_invalid");
  }
  if (serializedBytes > COURSE_RESEARCH_MAX_BYTES) {
    return fail("result_too_large", "bound_result_exceeds_frontend_limit");
  }
  const wire = wireResultBase.safeParse(input.value);
  if (!wire.success) {
    return fail("schema_rejected", "wire_schema_invalid");
  }
  const parsed = wireResultSchema.safeParse(input.value);
  if (!parsed.success) {
    return fail("schema_rejected", "wire_schema_invalid");
  }
  const context = input.context;
  const active = context?.activeStep;
  if (!context || !active || !input.projectId || !input.chatId) {
    return fail("context_mismatch", "context_unavailable");
  }
  if (!input.assistantMessageId) {
    return fail("context_mismatch", "assistant_identity_missing");
  }
  if (
    context.availability !== "available" ||
    context.consistency !== "live_per_source_revision" ||
    context.contextOrigin !== "project_chat" ||
    context.project?.status !== "active"
  ) {
    return fail("context_mismatch", "context_unavailable");
  }
  if (
    context.project.id !== input.projectId ||
    active.projectId !== input.projectId ||
    parsed.data.projectId !== input.projectId
  ) {
    return fail("context_mismatch", "project_mismatch");
  }
  if (active.chatId !== input.chatId || parsed.data.chatId !== input.chatId) {
    return fail("context_mismatch", "chat_mismatch");
  }
  if (
    active.taskId !== parsed.data.taskId ||
    parsed.data.workflowKind !== active.workflowKind ||
    parsed.data.stepKey !== active.stepKey
  ) {
    return fail("context_mismatch", "task_mismatch");
  }
  if (
    parsed.data.targetId !== active.targetId ||
    parsed.data.targetKind !== active.targetKind
  ) {
    return fail("context_mismatch", "target_mismatch");
  }
  if (!exactRevisions(parsed.data.sourceRevisions, active.sourceRevisions)) {
    return fail("context_mismatch", "source_revision_mismatch");
  }
  const bound = boundCourseResearchResultSchema.safeParse({
    ...parsed.data,
    assistantMessageId: input.assistantMessageId,
  });
  if (!bound.success) {
    const isSizeFailure =
      new TextEncoder().encode(
        JSON.stringify({
          ...parsed.data,
          assistantMessageId: input.assistantMessageId,
        })
      ).byteLength > COURSE_RESEARCH_MAX_BYTES;
    return isSizeFailure
      ? fail("result_too_large", "bound_result_exceeds_frontend_limit")
      : fail("schema_rejected", "bound_envelope_invalid");
  }
  return {
    result: bound.data,
    status: parsed.data.candidates.length ? "bound" : "empty_candidates",
    reason: parsed.data.candidates.length
      ? "bound_success"
      : "empty_candidate_list",
    boundCandidateCount: parsed.data.candidates.length,
  };
}

export function courseResearchResultMatchesTask(input: {
  result: BoundCourseResearchResultV1 | null | undefined;
  projectId: string;
  chatId: string | null;
  task: WorkflowTaskProjectionV1 | null;
}): boolean {
  const { result, task } = input;
  return Boolean(
    result &&
      task &&
      input.chatId &&
      result.projectId === input.projectId &&
      result.chatId === input.chatId &&
      result.taskId === task.taskId &&
      result.definitionVersion === task.definitionVersion &&
      result.workflowKind === task.workflowKind &&
      result.stepKey === task.stepKey &&
      result.targetKind === task.targetKind &&
      result.targetId === task.targetId
  );
}

export function courseResearchResultIsCurrent(input: {
  result: BoundCourseResearchResultV1;
  task: WorkflowTaskProjectionV1;
}): boolean {
  return exactRevisions(
    input.result.sourceRevisions,
    input.task.sourceRevisions
  );
}

export function courseResearchSelection(input: {
  result: BoundCourseResearchResultV1;
  task: WorkflowTaskProjectionV1;
  candidate: CourseResearchCandidateV1;
}): {
  operation: "select_school_course_candidate";
  chatId: string;
  selection: ActiveStepSelectionV1;
  assistantMessageId: string;
  candidateId: string;
} {
  return {
    operation: "select_school_course_candidate",
    chatId: input.result.chatId,
    selection: {
      schemaVersion: "phase15.active-step-selection.v1",
      projectId: input.task.projectId,
      taskId: input.task.taskId,
      workflowKind: input.task.workflowKind,
      definitionVersion: input.task.definitionVersion,
      stepKey: input.task.stepKey,
      targetKind: input.task.targetKind,
      targetId: input.task.targetId,
      sourceRevisions: input.task.sourceRevisions.map((entry) => ({
        ...entry,
      })),
    },
    assistantMessageId: input.result.assistantMessageId,
    candidateId: input.candidate.candidateId,
  };
}
