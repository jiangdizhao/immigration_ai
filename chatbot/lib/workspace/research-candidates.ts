import { z } from "zod";

export const RESEARCH_CANDIDATE_SCHEMA_VERSION =
  "phase15.research-candidate.v1" as const;
export const RESEARCH_CANDIDATE_MAX_BYTES = 16_000;

const candidateFieldKeys = [
  "institution_name",
  "official_institution_identity",
  "course_title",
  "official_course_code",
  "qualification",
  "campus",
  "intake",
  "tuition",
  "entry_requirements",
] as const;

const sourceKindSchema = z.enum([
  "institution_official",
  "cricos_official",
  "study_australia_official",
]);
const observedFieldSchema = z
  .object({
    key: z.enum(candidateFieldKeys),
    value: z.string().min(1).max(500),
    sourceRefId: z.string().min(1).max(160),
    observedAt: z.string().datetime().nullable(),
    currentness: z.enum(["current", "stale", "unknown"]),
  })
  .strict();

export const researchCandidateV1Schema = z
  .object({
    schemaVersion: z.literal(RESEARCH_CANDIDATE_SCHEMA_VERSION),
    candidateId: z.string().min(1).max(128),
    projectId: z.string().uuid(),
    targetSchoolApplicationId: z.string().uuid().nullable(),
    institution: z
      .object({
        name: z.string().min(1).max(200),
        officialIdentity: z.string().max(200).nullable(),
      })
      .strict(),
    course: z
      .object({
        title: z.string().min(1).max(240),
        officialCourseCode: z.string().max(80).nullable(),
        qualification: z.string().max(120).nullable(),
        campus: z.string().max(160).nullable(),
        intake: z.string().max(120).nullable(),
      })
      .strict(),
    observedFields: z.array(observedFieldSchema).max(12),
    sources: z
      .array(
        z
          .object({
            refId: z.string().min(1).max(160),
            url: z.string().url().max(2048),
            title: z.string().min(1).max(240),
            sourceKind: sourceKindSchema,
            observedAt: z.string().datetime().nullable(),
            currentness: z.enum(["current", "stale", "unknown"]),
          })
          .strict()
      )
      .max(6),
    unknownFields: z.array(z.enum(candidateFieldKeys)).max(9),
    status: z.enum([
      "source_backed_candidate",
      "partial",
      "unverified",
      "unavailable",
    ]),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      new TextEncoder().encode(JSON.stringify(candidate)).byteLength >
      RESEARCH_CANDIDATE_MAX_BYTES
    ) {
      context.addIssue({
        code: "custom",
        message: "Research candidate exceeds its byte bound",
      });
    }
    const sourceRefs = candidate.sources.map((source) => source.refId);
    if (new Set(sourceRefs).size !== sourceRefs.length) {
      context.addIssue({
        code: "custom",
        message: "Research candidate contains duplicate source identities",
      });
    }
  });

export type ResearchCandidateV1 = z.infer<typeof researchCandidateV1Schema>;

export type TrustedCandidateSource = {
  refId: string;
  url: string;
  title: string;
  sourceKind:
    | "institution_official"
    | "cricos_official"
    | "study_australia_official";
  observedAt: string | null;
  currentness: "current" | "stale" | "unknown";
  /** Exact fields the backend verified against the source for this request. */
  observedFields: Readonly<Record<string, string>>;
  allowedHostname: string;
};

export type ResearchCandidateValidation = {
  candidate: ResearchCandidateV1 | null;
  state: "source_backed_candidate" | "partial" | "unverified" | "unavailable";
  reasonCode: string | null;
};

function safeOfficialHttpsUrl(
  value: string,
  expectedHostname: string
): boolean {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      hostname === expectedHostname.toLowerCase() &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".localhost") &&
      hostname !== "localhost" &&
      !hostname.includes(":") &&
      !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Bind a proposed candidate to exact same-request backend source observations.
 * Provider citations or model-written URLs alone are never a trusted source map.
 */
export function validateResearchCandidateV1(input: {
  value: unknown;
  projectId: string;
  targetSchoolApplicationId: string | null;
  trustedSources: ReadonlyMap<string, TrustedCandidateSource>;
}): ResearchCandidateValidation {
  const parsed = researchCandidateV1Schema.safeParse(input.value);
  if (!parsed.success) {
    return {
      candidate: null,
      state: "unavailable",
      reasonCode: "candidate_schema_invalid",
    };
  }
  const candidate = parsed.data;
  if (
    candidate.projectId !== input.projectId ||
    candidate.targetSchoolApplicationId !== input.targetSchoolApplicationId
  ) {
    return {
      candidate: null,
      state: "unavailable",
      reasonCode: "candidate_scope_mismatch",
    };
  }
  if (candidate.status === "unavailable") {
    return {
      candidate,
      state: "unavailable",
      reasonCode: "candidate_source_unavailable",
    };
  }
  if (candidate.status === "unverified" || candidate.sources.length === 0) {
    return {
      candidate: { ...candidate, status: "unverified" },
      state: "unverified",
      reasonCode: "candidate_source_not_verified",
    };
  }

  const sourceMap = new Map<string, TrustedCandidateSource>();
  for (const source of candidate.sources) {
    const trusted = input.trustedSources.get(source.refId);
    if (
      !trusted ||
      trusted.url !== source.url ||
      trusted.title !== source.title ||
      trusted.sourceKind !== source.sourceKind ||
      trusted.observedAt !== source.observedAt ||
      trusted.currentness !== source.currentness ||
      !safeOfficialHttpsUrl(source.url, trusted.allowedHostname)
    ) {
      return {
        candidate: { ...candidate, status: "unverified" },
        state: "unverified",
        reasonCode: "candidate_source_identity_unverified",
      };
    }
    sourceMap.set(source.refId, trusted);
  }
  if (candidate.observedFields.length === 0) {
    return {
      candidate: { ...candidate, status: "partial" },
      state: "partial",
      reasonCode: "candidate_has_no_observed_fields",
    };
  }
  const observed = candidate.observedFields.every((field) => {
    const source = sourceMap.get(field.sourceRefId);
    return Boolean(
      source &&
        source.currentness === "current" &&
        field.currentness === "current" &&
        source.observedFields[field.key] === field.value &&
        field.observedAt === source.observedAt
    );
  });
  if (!observed) {
    return {
      candidate: { ...candidate, status: "partial" },
      state: "partial",
      reasonCode: "candidate_field_provenance_incomplete",
    };
  }
  const observedValue = (
    key: ResearchCandidateV1["observedFields"][number]["key"]
  ) => {
    const values = candidate.observedFields
      .filter(
        (field) =>
          field.key === key &&
          sourceMap.get(field.sourceRefId)?.observedFields[key] ===
            field.value &&
          sourceMap.get(field.sourceRefId)?.currentness === "current" &&
          field.currentness === "current"
      )
      .map((field) => field.value);
    const uniqueValues = [...new Set(values)];
    return uniqueValues.length === 1 ? uniqueValues[0] : null;
  };
  const fieldConflicts = candidateFieldKeys.some((key) => {
    const values = new Set(
      candidate.observedFields
        .filter((field) => field.key === key)
        .map((field) => field.value)
    );
    return values.size > 1;
  });
  if (fieldConflicts) {
    return {
      candidate: { ...candidate, status: "partial" },
      state: "partial",
      reasonCode: "candidate_source_fields_conflict",
    };
  }
  const candidateFieldsMatchEvidence =
    observedValue("institution_name") === candidate.institution.name &&
    observedValue("course_title") === candidate.course.title &&
    (candidate.institution.officialIdentity === null ||
      observedValue("official_institution_identity") ===
        candidate.institution.officialIdentity) &&
    (candidate.course.officialCourseCode === null ||
      observedValue("official_course_code") ===
        candidate.course.officialCourseCode) &&
    (candidate.course.qualification === null ||
      observedValue("qualification") === candidate.course.qualification) &&
    (candidate.course.campus === null ||
      observedValue("campus") === candidate.course.campus) &&
    (candidate.course.intake === null ||
      observedValue("intake") === candidate.course.intake);
  if (!candidateFieldsMatchEvidence) {
    return {
      candidate: { ...candidate, status: "partial" },
      state: "partial",
      reasonCode: "candidate_identity_fields_unverified",
    };
  }
  return {
    candidate: { ...candidate, status: "source_backed_candidate" },
    state: "source_backed_candidate",
    reasonCode: null,
  };
}
