import {
  type EducationDataset,
  type EducationDelivery,
  type EducationEntityType,
  type EducationFieldObservation,
  type EducationFieldValue,
  type EducationIntake,
  type EducationProvider,
  type EducationSnapshot,
  type EducationSource,
  FIELD_DEFINITIONS,
  type FieldKey,
  type ResolutionReason,
  type ResolutionSourceRef,
  type ResolutionStatus,
  validateEducationDataset,
} from "./contracts";
import {
  type ResolveFieldOptions,
  resolveEducationField,
} from "./field-resolution";

export interface EducationReadLimits {
  readonly courseSelectors: number;
  readonly entityRows: number;
  readonly sourceRows: number;
  readonly snapshotRows: number;
  readonly observationRows: number;
  readonly optionPaths: number;
  readonly outputBytes: number;
  readonly readerTimeoutMs: number;
}

export const DEFAULT_EDUCATION_READ_LIMITS: EducationReadLimits = {
  courseSelectors: 50,
  entityRows: 250,
  sourceRows: 50,
  snapshotRows: 500,
  observationRows: 1000,
  optionPaths: 500,
  outputBytes: 1_000_000,
  readerTimeoutMs: 3000,
};

const MAX_READ_LIMITS: EducationReadLimits = {
  courseSelectors: 100,
  entityRows: 1000,
  sourceRows: 200,
  snapshotRows: 5000,
  observationRows: 10_000,
  optionPaths: 2000,
  outputBytes: 2_000_000,
  readerTimeoutMs: 10_000,
};

export type FieldKeysByEntityType = Partial<
  Record<EducationEntityType, readonly FieldKey[]>
>;

export const DEFAULT_OPTION_FIELD_KEYS: Readonly<
  Record<EducationEntityType, readonly FieldKey[]>
> = {
  PROVIDER: ["CRICOS_PROVIDER_STATUS", "PROVIDER_LEGAL_NAME"],
  COURSE: [
    "COURSE_TITLE",
    "COURSE_QUALIFICATION_LEVEL",
    "CRICOS_COURSE_STATUS",
    "INSTITUTION_COURSE_CODE",
    "COURSE_ADMISSIONS_CRITERIA",
    "COURSE_AVAILABILITY",
    "TUITION_FEE",
    "DISCOVERY_REFERENCE",
  ],
  DELIVERY: [
    "CAMPUS_NAME",
    "DELIVERY_MODE",
    "DELIVERY_AVAILABILITY",
    "TUITION_FEE",
  ],
  INTAKE: [
    "INTAKE_PERIOD",
    "INTAKE_START_DATE",
    "APPLICATION_DEADLINE",
    "INTAKE_AVAILABILITY",
    "TUITION_FEE",
  ],
};

export interface EducationCatalogReadRequest {
  /** Exact internal IDs only. This port must not perform title/name matching. */
  readonly courseIds: readonly string[];
  readonly fieldKeysByEntityType: FieldKeysByEntityType;
  readonly limits: EducationReadLimits;
  /** Readers must stop work after cancellation and never return a partial result. */
  readonly signal?: AbortSignal;
}

export interface EducationCatalogCourseSelection {
  readonly courseId: string;
  readonly status: "FOUND" | "ABSENT" | "AMBIGUOUS";
}

export interface EducationCatalogReadSnapshot {
  readonly consistency: "CONSISTENT" | "INCONSISTENT";
  /** Opaque stable identifier for this one read snapshot; not a public URL. */
  readonly snapshotToken: string;
  /** False means at least one requested row/history item was omitted or capped. */
  readonly complete: boolean;
  readonly courseSelections: readonly EducationCatalogCourseSelection[];
  readonly dataset: EducationDataset;
}

/**
 * Offline adapter contract for a single consistent multi-course read. A future
 * adapter must read exact IDs and all requested source history within one
 * consistent database snapshot, and set complete=false rather than truncating.
 * No production or database adapter is defined in this module.
 */
export interface EducationCatalogReader {
  readConsistent(
    request: EducationCatalogReadRequest
  ): Promise<EducationCatalogReadSnapshot>;
}

export interface EducationReadModelRequest extends ResolveFieldOptions {
  readonly courseIds: readonly string[];
  readonly fieldKeysByEntityType?: FieldKeysByEntityType;
  readonly limits?: Partial<EducationReadLimits>;
}

export type EducationAuthorityRole =
  | "CRICOS_REGISTRATION_ONLY"
  | "GOVERNMENT_DISCOVERY_ONLY"
  | "INSTITUTION_CLAIM_UNVERIFIED";

export interface EducationReadSourceReference extends ResolutionSourceRef {
  readonly authorityRole: EducationAuthorityRole;
  readonly recordClass: EducationSource["recordClass"];
}

export interface EducationReadObservationHistory {
  readonly observationId: string;
  readonly target: EducationFieldObservation["target"];
  readonly fieldKey: FieldKey;
  readonly disposition: EducationFieldObservation["disposition"];
  readonly observedAt: string;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
  readonly value?: EducationFieldValue;
  readonly valueWithheld?: "UNSAFE_TEXT";
  readonly source: EducationReadSourceReference;
  readonly excerpt?: string;
  readonly excerptWithheld?: "UNSAFE_TEXT";
}

export interface EducationReadSourceAttempt {
  readonly snapshotId: string;
  readonly sourceId: string;
  readonly sourceFamily: EducationSource["sourceFamily"];
  readonly authorityRole: EducationAuthorityRole;
  readonly recordClass: EducationSource["recordClass"];
  readonly sourceUrl: string;
  readonly retrievedAt: string;
  readonly observedAt: string;
  readonly publishedAt?: string;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
  readonly contentSha256?: string;
  readonly parserVersion?: string;
  readonly locator?: string;
  readonly acquisitionOutcome: EducationSnapshot["acquisitionOutcome"];
}

export interface EducationReadField {
  readonly target: EducationFieldObservation["target"];
  readonly fieldKey: FieldKey;
  readonly status: ResolutionStatus;
  readonly reasons: readonly ResolutionReason[];
  readonly evidenceClass: "SYNTHETIC_ONLY" | "UNVERIFIED";
  readonly assessedAt: string;
  readonly assessmentDate: string;
  readonly resolvedValue?: EducationFieldValue;
  readonly historicalValue?: EducationFieldValue;
  readonly valueWithheld?: "UNSAFE_TEXT";
  readonly sourceRefs: readonly EducationReadSourceReference[];
  readonly history: readonly EducationReadObservationHistory[];
  /** Includes relevant failed fetch/parse attempts; never includes snapshot HTML. */
  readonly sourceAttempts: readonly EducationReadSourceAttempt[];
}

export interface EducationReadEntity {
  readonly providerId: string;
  readonly displayName?: string;
  readonly displayNameWithheld?: "UNSAFE_TEXT";
}

export interface EducationReadCourse {
  readonly courseId: string;
  readonly title?: string;
  readonly titleWithheld?: "UNSAFE_TEXT";
  readonly qualificationLevel?: string;
  readonly provider: EducationReadEntity;
}

export interface EducationReadDelivery {
  readonly deliveryId: string;
  readonly campusId?: string;
  readonly siteId?: string;
  readonly campusName?: string;
  readonly campusNameWithheld?: "UNSAFE_TEXT";
  readonly city?: string;
  readonly cityWithheld?: "UNSAFE_TEXT";
  readonly state?: string;
  readonly stateWithheld?: "UNSAFE_TEXT";
  readonly mode?: string;
  readonly modeWithheld?: "UNSAFE_TEXT";
}

export interface EducationReadIntake {
  readonly intakeId: string;
  readonly intakeCode?: string;
  readonly intakeCodeWithheld?: "UNSAFE_TEXT";
  readonly term?: string;
  readonly termWithheld?: "UNSAFE_TEXT";
  readonly year?: number;
}

export type EducationOptionPathState =
  | "COURSE_WITHOUT_DELIVERY"
  | "DELIVERY_WITHOUT_RECORDED_INTAKE"
  | "INTAKE_CANDIDATE";

export interface EducationPossiblePath {
  readonly state: EducationOptionPathState;
  readonly course: EducationReadCourse;
  readonly delivery?: EducationReadDelivery;
  readonly intake?: EducationReadIntake;
  readonly fields: readonly EducationReadField[];
  readonly unknowns: readonly {
    readonly target: EducationFieldObservation["target"];
    readonly fieldKey: FieldKey;
    readonly status: ResolutionStatus;
    readonly reasons: readonly ResolutionReason[];
  }[];
  readonly label: "Possible option for further review";
  readonly limitationLabels: readonly [
    "Not an admissions or visa determination",
    "Source evidence is not independently verified",
  ];
  readonly humanCheckRequired: true;
}

export interface EducationReadExclusion {
  readonly courseId: string;
  readonly status: "ABSENT" | "AMBIGUOUS";
  readonly reason: "EXACT_COURSE_ID_NOT_FOUND" | "EXACT_ID_AMBIGUOUS";
}

export interface EducationResolvedReadModel {
  readonly schema: "education.resolved-read.v1";
  readonly snapshotToken: string;
  readonly assessedAt: string;
  readonly assessmentDate: string;
  readonly courseSelections: readonly EducationCatalogCourseSelection[];
  readonly paths: readonly EducationPossiblePath[];
  readonly exclusions: readonly EducationReadExclusion[];
  readonly noPassSignal: true;
}

export class EducationReadModelError extends Error {
  readonly code:
    | "INVALID_REQUEST"
    | "READ_FAILED"
    | "INCONSISTENT_SNAPSHOT"
    | "INCOMPLETE_SNAPSHOT"
    | "READ_BOUND_EXCEEDED"
    | "INVALID_DATASET";

  constructor(code: EducationReadModelError["code"]) {
    super(code);
    this.name = "EducationReadModelError";
    this.code = code;
  }
}

function authorityRole(source: EducationSource): EducationAuthorityRole {
  if (source.sourceFamily === "CRICOS") {
    return "CRICOS_REGISTRATION_ONLY";
  }
  if (source.sourceFamily === "STUDY_AUSTRALIA") {
    return "GOVERNMENT_DISCOVERY_ONLY";
  }
  return "INSTITUTION_CLAIM_UNVERIFIED";
}

function boundedPlainText(value: string): boolean {
  if (value.length === 0 || value.length > 4096) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code < 0x20 ||
      code === 0x7f ||
      value[index] === "<" ||
      value[index] === ">"
    ) {
      return false;
    }
  }
  return true;
}

function safeFieldValue(
  value: EducationFieldValue | undefined
): EducationFieldValue | undefined {
  if (!value) {
    return undefined;
  }
  if (value.kind === "text" || value.kind === "enum") {
    return boundedPlainText(value.value) ? value : undefined;
  }
  if (value.kind === "money") {
    const strings = [
      value.currency,
      value.audience,
      value.basis,
      value.period,
      ...(value.inclusions ?? []),
    ].filter((item): item is string => item !== undefined);
    return strings.every(boundedPlainText) ? value : undefined;
  }
  return value;
}

interface SafeEntityText {
  readonly value?: string;
  readonly withheld?: "UNSAFE_TEXT";
}

function safeEntityText(value: string | undefined): SafeEntityText {
  if (value === undefined) {
    return {};
  }
  return boundedPlainText(value) ? { value } : { withheld: "UNSAFE_TEXT" };
}

function safeSourceReference(
  ref: ResolutionSourceRef,
  source: EducationSource
): EducationReadSourceReference {
  return {
    ...ref,
    authorityRole: authorityRole(source),
    recordClass: source.recordClass,
  };
}

function safeHistoryItem(input: {
  observation: EducationFieldObservation;
  source: EducationSource;
}): EducationReadObservationHistory {
  const value = safeFieldValue(input.observation.value);
  const excerpt = input.observation.provenance.excerpt;
  const safeExcerpt = excerpt !== undefined && boundedPlainText(excerpt);
  return {
    observationId: input.observation.observationId,
    target: input.observation.target,
    fieldKey: input.observation.fieldKey,
    disposition: input.observation.disposition,
    observedAt: input.observation.observedAt,
    ...(input.observation.effectiveFrom === undefined
      ? {}
      : { effectiveFrom: input.observation.effectiveFrom }),
    ...(input.observation.effectiveTo === undefined
      ? {}
      : { effectiveTo: input.observation.effectiveTo }),
    ...(value === undefined && input.observation.value !== undefined
      ? { valueWithheld: "UNSAFE_TEXT" as const }
      : value === undefined
        ? {}
        : { value }),
    source: safeSourceReference(
      {
        observationId: input.observation.observationId,
        sourceId: input.observation.provenance.sourceId,
        snapshotId: input.observation.provenance.snapshotId,
        sourceFamily: input.observation.provenance.sourceFamily,
        sourceUrl: input.observation.provenance.sourceUrl,
        contentSha256: input.observation.provenance.contentSha256,
        locator: input.observation.provenance.locator,
      },
      input.source
    ),
    ...(safeExcerpt ? { excerpt } : {}),
    ...(excerpt !== undefined && !safeExcerpt
      ? { excerptWithheld: "UNSAFE_TEXT" as const }
      : {}),
  };
}

function safeSnapshotAttempt(input: {
  snapshot: EducationSnapshot;
  source: EducationSource;
}): EducationReadSourceAttempt {
  return {
    snapshotId: input.snapshot.snapshotId,
    sourceId: input.snapshot.sourceId,
    sourceFamily: input.source.sourceFamily,
    authorityRole: authorityRole(input.source),
    recordClass: input.snapshot.recordClass,
    sourceUrl: input.snapshot.sourceUrl,
    retrievedAt: input.snapshot.retrievedAt,
    observedAt: input.snapshot.observedAt,
    ...(input.snapshot.publishedAt === undefined
      ? {}
      : { publishedAt: input.snapshot.publishedAt }),
    ...(input.snapshot.effectiveFrom === undefined
      ? {}
      : { effectiveFrom: input.snapshot.effectiveFrom }),
    ...(input.snapshot.effectiveTo === undefined
      ? {}
      : { effectiveTo: input.snapshot.effectiveTo }),
    ...(input.snapshot.contentSha256 === undefined
      ? {}
      : { contentSha256: input.snapshot.contentSha256 }),
    ...(input.snapshot.parserVersion === undefined
      ? {}
      : { parserVersion: input.snapshot.parserVersion }),
    ...(input.snapshot.locator === undefined
      ? {}
      : { locator: input.snapshot.locator }),
    acquisitionOutcome: input.snapshot.acquisitionOutcome,
  };
}

function buildReadField(input: {
  dataset: EducationDataset;
  target: { type: EducationEntityType; id: string };
  fieldKey: FieldKey;
  options: ResolveFieldOptions;
}): EducationReadField {
  const resolved = resolveEducationField(
    input.dataset,
    input.target,
    input.fieldKey,
    input.options
  );
  const sourceById = new Map(
    input.dataset.sources.map((source) => [source.sourceId, source])
  );
  const snapshotById = new Map(
    input.dataset.snapshots.map((snapshot) => [snapshot.snapshotId, snapshot])
  );
  const safeResolvedValue = safeFieldValue(resolved.resolvedValue);
  const safeHistoricalValue = safeFieldValue(resolved.historicalValue);
  const withheld =
    (resolved.resolvedValue !== undefined && safeResolvedValue === undefined) ||
    (resolved.historicalValue !== undefined &&
      safeHistoricalValue === undefined);
  const sourceRefs = resolved.sourceRefs.map((ref) => {
    const source = sourceById.get(ref.sourceId);
    if (!source) {
      throw new EducationReadModelError("INVALID_DATASET");
    }
    return safeSourceReference(ref, source);
  });
  const history = resolved.history.map((observation) => {
    const source = sourceById.get(observation.provenance.sourceId);
    if (!source) {
      throw new EducationReadModelError("INVALID_DATASET");
    }
    return safeHistoryItem({ observation, source });
  });
  const sourceAttempts = resolved.sourceSnapshotHistory.map((snapshot) => {
    const source = sourceById.get(snapshot.sourceId);
    if (!source || !snapshotById.has(snapshot.snapshotId)) {
      throw new EducationReadModelError("INVALID_DATASET");
    }
    return safeSnapshotAttempt({ snapshot, source });
  });
  return {
    target: resolved.target,
    fieldKey: resolved.fieldKey,
    status: resolved.status,
    reasons: resolved.reasons,
    evidenceClass: resolved.evidenceClass,
    assessedAt: resolved.assessedAt,
    assessmentDate: input.options.assessmentDate,
    ...(safeResolvedValue === undefined
      ? {}
      : { resolvedValue: safeResolvedValue }),
    ...(safeHistoricalValue === undefined
      ? {}
      : { historicalValue: safeHistoricalValue }),
    ...(withheld ? { valueWithheld: "UNSAFE_TEXT" as const } : {}),
    sourceRefs,
    history,
    sourceAttempts,
  };
}

function validateLimits(
  supplied: Partial<EducationReadLimits> | undefined
): EducationReadLimits {
  const limits = { ...DEFAULT_EDUCATION_READ_LIMITS, ...supplied };
  for (const key of Object.keys(
    MAX_READ_LIMITS
  ) as (keyof EducationReadLimits)[]) {
    if (
      !Number.isSafeInteger(limits[key]) ||
      limits[key] < 1 ||
      limits[key] > MAX_READ_LIMITS[key]
    ) {
      throw new EducationReadModelError("INVALID_REQUEST");
    }
  }
  return limits;
}

function validAssessmentDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

function normalizeFieldKeys(
  supplied: FieldKeysByEntityType | undefined
): Record<EducationEntityType, readonly FieldKey[]> {
  const result = {} as Record<EducationEntityType, readonly FieldKey[]>;
  for (const type of ["PROVIDER", "COURSE", "DELIVERY", "INTAKE"] as const) {
    const keys = supplied?.[type] ?? DEFAULT_OPTION_FIELD_KEYS[type];
    if (keys.length > 32 || new Set(keys).size !== keys.length) {
      throw new EducationReadModelError("INVALID_REQUEST");
    }
    if (
      keys.some((key) => !FIELD_DEFINITIONS[key]?.entityTypes.includes(type))
    ) {
      throw new EducationReadModelError("INVALID_REQUEST");
    }
    result[type] = [...keys].sort((left, right) => left.localeCompare(right));
  }
  return result;
}

export function prepareEducationCatalogReadRequest(
  request: EducationReadModelRequest
): {
  readonly readRequest: EducationCatalogReadRequest;
  readonly fieldKeysByEntityType: Record<
    EducationEntityType,
    readonly FieldKey[]
  >;
  readonly limits: EducationReadLimits;
} {
  const limits = validateLimits(request.limits);
  const fieldKeysByEntityType = normalizeFieldKeys(
    request.fieldKeysByEntityType
  );
  if (
    !Array.isArray(request.courseIds) ||
    request.courseIds.length === 0 ||
    request.courseIds.length > limits.courseSelectors ||
    request.courseIds.some(
      (id) =>
        typeof id !== "string" ||
        id.length === 0 ||
        id.length > 128 ||
        id.trim() !== id
    ) ||
    new Set(request.courseIds).size !== request.courseIds.length
  ) {
    throw new EducationReadModelError("INVALID_REQUEST");
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(request.assessedAt) ||
    !Number.isFinite(Date.parse(request.assessedAt)) ||
    !validAssessmentDate(request.assessmentDate)
  ) {
    throw new EducationReadModelError("INVALID_REQUEST");
  }
  return {
    readRequest: {
      courseIds: [...request.courseIds].sort((a, b) => a.localeCompare(b)),
      fieldKeysByEntityType,
      limits,
    },
    fieldKeysByEntityType,
    limits,
  };
}

function validateDatasetScope(
  dataset: EducationDataset,
  requestedCourseIds: readonly string[]
): void {
  const ids = new Set(requestedCourseIds);
  if (dataset.courses.some((course) => !ids.has(course.courseId))) {
    throw new EducationReadModelError("INCONSISTENT_SNAPSHOT");
  }
  const courseById = new Map(
    dataset.courses.map((course) => [course.courseId, course])
  );
  if (
    dataset.deliveries.some((delivery) => !courseById.has(delivery.courseId))
  ) {
    throw new EducationReadModelError("INCONSISTENT_SNAPSHOT");
  }
  const deliveryById = new Map(
    dataset.deliveries.map((delivery) => [delivery.deliveryId, delivery])
  );
  if (dataset.intakes.some((intake) => !deliveryById.has(intake.deliveryId))) {
    throw new EducationReadModelError("INCONSISTENT_SNAPSHOT");
  }
}

function scopedDataset(
  dataset: EducationDataset,
  selectedCourseIds: ReadonlySet<string>
): EducationDataset {
  const courses = dataset.courses.filter((course) =>
    selectedCourseIds.has(course.courseId)
  );
  const providerIds = new Set(courses.map((course) => course.providerId));
  const deliveries = dataset.deliveries.filter((delivery) =>
    selectedCourseIds.has(delivery.courseId)
  );
  const deliveryIds = new Set(
    deliveries.map((delivery) => delivery.deliveryId)
  );
  const intakes = dataset.intakes.filter((intake) =>
    deliveryIds.has(intake.deliveryId)
  );
  const targets = new Set<string>([
    ...[...providerIds].map((id) => `PROVIDER\u0000${id}`),
    ...courses.map((item) => `COURSE\u0000${item.courseId}`),
    ...deliveries.map((item) => `DELIVERY\u0000${item.deliveryId}`),
    ...intakes.map((item) => `INTAKE\u0000${item.intakeId}`),
  ]);
  const observations = dataset.observations.filter((observation) =>
    targets.has(`${observation.target.type}\u0000${observation.target.id}`)
  );
  const sourceIds = new Set(
    observations.map((observation) => observation.provenance.sourceId)
  );
  return {
    providers: dataset.providers.filter((provider) =>
      providerIds.has(provider.providerId)
    ),
    courses,
    deliveries,
    intakes,
    sources: dataset.sources.filter((source) => sourceIds.has(source.sourceId)),
    snapshots: dataset.snapshots.filter((snapshot) =>
      sourceIds.has(snapshot.sourceId)
    ),
    observations,
  };
}

function safeReadEntity(provider: EducationProvider): EducationReadEntity {
  const name = safeEntityText(provider.displayName);
  return {
    providerId: provider.providerId,
    ...(name.value === undefined ? {} : { displayName: name.value }),
    ...(name.withheld === undefined
      ? {}
      : { displayNameWithheld: name.withheld }),
  };
}

function safeReadCourse(
  course: EducationDataset["courses"][number],
  provider: EducationProvider
): EducationReadCourse {
  const title = safeEntityText(course.title);
  const qualification = safeEntityText(course.qualificationLevel);
  return {
    courseId: course.courseId,
    ...(title.value === undefined ? {} : { title: title.value }),
    ...(title.withheld === undefined ? {} : { titleWithheld: title.withheld }),
    ...(qualification.value === undefined
      ? {}
      : { qualificationLevel: qualification.value }),
    provider: safeReadEntity(provider),
  };
}

function safeReadDelivery(delivery: EducationDelivery): EducationReadDelivery {
  const campusName = safeEntityText(delivery.campusName);
  const city = safeEntityText(delivery.city);
  const state = safeEntityText(delivery.state);
  const mode = safeEntityText(delivery.mode);
  return {
    deliveryId: delivery.deliveryId,
    ...(delivery.campusId === undefined ? {} : { campusId: delivery.campusId }),
    ...(delivery.siteId === undefined ? {} : { siteId: delivery.siteId }),
    ...(campusName.value === undefined ? {} : { campusName: campusName.value }),
    ...(campusName.withheld === undefined
      ? {}
      : { campusNameWithheld: campusName.withheld }),
    ...(city.value === undefined ? {} : { city: city.value }),
    ...(city.withheld === undefined ? {} : { cityWithheld: city.withheld }),
    ...(state.value === undefined ? {} : { state: state.value }),
    ...(state.withheld === undefined ? {} : { stateWithheld: state.withheld }),
    ...(mode.value === undefined ? {} : { mode: mode.value }),
    ...(mode.withheld === undefined ? {} : { modeWithheld: mode.withheld }),
  };
}

function safeReadIntake(intake: EducationIntake): EducationReadIntake {
  const intakeCode = safeEntityText(intake.intakeCode);
  const term = safeEntityText(intake.term);
  return {
    intakeId: intake.intakeId,
    ...(intakeCode.value === undefined ? {} : { intakeCode: intakeCode.value }),
    ...(intakeCode.withheld === undefined
      ? {}
      : { intakeCodeWithheld: intakeCode.withheld }),
    ...(term.value === undefined ? {} : { term: term.value }),
    ...(term.withheld === undefined ? {} : { termWithheld: term.withheld }),
    ...(intake.year === undefined ? {} : { year: intake.year }),
  };
}

function optionPath(input: {
  course: EducationReadCourse;
  delivery?: EducationReadDelivery;
  intake?: EducationReadIntake;
  state: EducationOptionPathState;
  fields: readonly EducationReadField[];
}): EducationPossiblePath {
  const unknowns = input.fields
    .filter((field) => field.status !== "KNOWN")
    .map((field) => ({
      target: field.target,
      fieldKey: field.fieldKey,
      status: field.status,
      reasons: field.reasons,
    }));
  return {
    state: input.state,
    course: input.course,
    ...(input.delivery ? { delivery: input.delivery } : {}),
    ...(input.intake ? { intake: input.intake } : {}),
    fields: input.fields,
    unknowns,
    label: "Possible option for further review",
    limitationLabels: [
      "Not an admissions or visa determination",
      "Source evidence is not independently verified",
    ],
    humanCheckRequired: true,
  };
}

export async function buildEducationResolvedReadModel(
  reader: EducationCatalogReader,
  request: EducationReadModelRequest
): Promise<EducationResolvedReadModel> {
  const prepared = prepareEducationCatalogReadRequest(request);
  const { limits, fieldKeysByEntityType, readRequest } = prepared;
  let read: EducationCatalogReadSnapshot;
  try {
    read = await readEducationCatalogConsistent(reader, readRequest);
  } catch {
    throw new EducationReadModelError("READ_FAILED");
  }
  if (
    !read ||
    read.consistency !== "CONSISTENT" ||
    typeof read.snapshotToken !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(read.snapshotToken)
  ) {
    throw new EducationReadModelError("INCONSISTENT_SNAPSHOT");
  }
  if (read.complete !== true) {
    throw new EducationReadModelError("INCOMPLETE_SNAPSHOT");
  }
  const dataset = read.dataset;
  const validation = validateEducationDataset(dataset);
  if (!validation.ok) {
    throw new EducationReadModelError("INVALID_DATASET");
  }
  const totalEntities =
    dataset.providers.length +
    dataset.courses.length +
    dataset.deliveries.length +
    dataset.intakes.length;
  if (
    dataset.courses.length > limits.courseSelectors ||
    totalEntities > limits.entityRows ||
    dataset.sources.length > limits.sourceRows ||
    dataset.snapshots.length > limits.snapshotRows ||
    dataset.observations.length > limits.observationRows
  ) {
    throw new EducationReadModelError("READ_BOUND_EXCEEDED");
  }
  validateDatasetScope(dataset, request.courseIds);
  const requestedIds = [...request.courseIds].sort((a, b) =>
    a.localeCompare(b)
  );
  const selectionById = new Map<string, EducationCatalogCourseSelection>();
  for (const selection of read.courseSelections) {
    if (
      !selection ||
      typeof selection.courseId !== "string" ||
      !["FOUND", "ABSENT", "AMBIGUOUS"].includes(selection.status) ||
      selectionById.has(selection.courseId)
    ) {
      throw new EducationReadModelError("INCONSISTENT_SNAPSHOT");
    }
    selectionById.set(selection.courseId, selection);
  }
  if (
    read.courseSelections.length !== requestedIds.length ||
    requestedIds.some((id) => !selectionById.has(id))
  ) {
    throw new EducationReadModelError("INCONSISTENT_SNAPSHOT");
  }
  for (const id of requestedIds) {
    const selection = selectionById.get(id) as EducationCatalogCourseSelection;
    const exists = dataset.courses.some((course) => course.courseId === id);
    if ((selection.status === "FOUND") !== exists) {
      throw new EducationReadModelError("INCONSISTENT_SNAPSHOT");
    }
  }

  const selectedCourseIds = new Set(
    requestedIds.filter((id) => selectionById.get(id)?.status === "FOUND")
  );
  const projectionDataset = scopedDataset(dataset, selectedCourseIds);
  const providerById = new Map(
    projectionDataset.providers.map((provider) => [
      provider.providerId,
      provider,
    ])
  );
  const courseById = new Map(
    projectionDataset.courses.map((course) => [course.courseId, course])
  );
  const childrenByCourse = new Map<string, EducationDelivery[]>();
  for (const delivery of projectionDataset.deliveries) {
    const rows = childrenByCourse.get(delivery.courseId) ?? [];
    rows.push(delivery);
    childrenByCourse.set(delivery.courseId, rows);
  }
  const intakesByDelivery = new Map<string, EducationIntake[]>();
  for (const intake of projectionDataset.intakes) {
    const rows = intakesByDelivery.get(intake.deliveryId) ?? [];
    rows.push(intake);
    intakesByDelivery.set(intake.deliveryId, rows);
  }
  const options: ResolveFieldOptions = {
    assessedAt: request.assessedAt,
    assessmentDate: request.assessmentDate,
    ...(request.maxAgeMsByField
      ? { maxAgeMsByField: request.maxAgeMsByField }
      : {}),
  };
  const resolvedFields = new Map<string, EducationReadField>();
  const fieldFor = (
    target: { type: EducationEntityType; id: string },
    fieldKey: FieldKey
  ) => {
    const key = `${target.type}\u0000${target.id}\u0000${fieldKey}`;
    let field = resolvedFields.get(key);
    if (!field) {
      field = buildReadField({
        dataset: projectionDataset,
        target,
        fieldKey,
        options,
      });
      resolvedFields.set(key, field);
    }
    return field;
  };
  const fieldsFor = (target: {
    type: EducationEntityType;
    id: string;
  }): EducationReadField[] =>
    fieldKeysByEntityType[target.type].map((fieldKey) =>
      fieldFor(target, fieldKey)
    );

  const paths: EducationPossiblePath[] = [];
  const exclusions: EducationReadExclusion[] = [];
  for (const courseId of requestedIds) {
    const selection = selectionById.get(
      courseId
    ) as EducationCatalogCourseSelection;
    if (selection.status !== "FOUND") {
      exclusions.push({
        courseId,
        status: selection.status,
        reason:
          selection.status === "ABSENT"
            ? "EXACT_COURSE_ID_NOT_FOUND"
            : "EXACT_ID_AMBIGUOUS",
      });
      continue;
    }
    const courseRecord = courseById.get(courseId);
    const provider = courseRecord && providerById.get(courseRecord.providerId);
    if (!courseRecord || !provider) {
      throw new EducationReadModelError("INCONSISTENT_SNAPSHOT");
    }
    const course = safeReadCourse(courseRecord, provider);
    const courseFields = fieldsFor({ type: "COURSE", id: courseId });
    const providerFields = fieldsFor({
      type: "PROVIDER",
      id: provider.providerId,
    });
    const deliveries = (childrenByCourse.get(courseId) ?? []).sort((a, b) =>
      a.deliveryId.localeCompare(b.deliveryId)
    );
    if (deliveries.length === 0) {
      paths.push(
        optionPath({
          course,
          state: "COURSE_WITHOUT_DELIVERY",
          fields: [...providerFields, ...courseFields],
        })
      );
      continue;
    }
    for (const deliveryRecord of deliveries) {
      const delivery = safeReadDelivery(deliveryRecord);
      const deliveryFields = fieldsFor({
        type: "DELIVERY",
        id: delivery.deliveryId,
      });
      const intakes = (intakesByDelivery.get(delivery.deliveryId) ?? []).sort(
        (a, b) => a.intakeId.localeCompare(b.intakeId)
      );
      if (intakes.length === 0) {
        paths.push(
          optionPath({
            course,
            delivery,
            state: "DELIVERY_WITHOUT_RECORDED_INTAKE",
            fields: [...providerFields, ...courseFields, ...deliveryFields],
          })
        );
        continue;
      }
      for (const intakeRecord of intakes) {
        const intake = safeReadIntake(intakeRecord);
        paths.push(
          optionPath({
            course,
            delivery,
            intake,
            state: "INTAKE_CANDIDATE",
            fields: [
              ...providerFields,
              ...courseFields,
              ...deliveryFields,
              ...fieldsFor({ type: "INTAKE", id: intake.intakeId }),
            ],
          })
        );
      }
    }
  }
  if (paths.length > limits.optionPaths) {
    throw new EducationReadModelError("READ_BOUND_EXCEEDED");
  }
  const courseSelections = requestedIds.map(
    (id) => selectionById.get(id) as EducationCatalogCourseSelection
  );
  const result: EducationResolvedReadModel = {
    schema: "education.resolved-read.v1",
    snapshotToken: read.snapshotToken,
    assessedAt: request.assessedAt,
    assessmentDate: request.assessmentDate,
    courseSelections,
    paths,
    exclusions,
    noPassSignal: true,
  };
  let outputBytes: number;
  try {
    outputBytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
  } catch {
    throw new EducationReadModelError("INVALID_DATASET");
  }
  if (outputBytes > limits.outputBytes) {
    throw new EducationReadModelError("READ_BOUND_EXCEEDED");
  }
  return result;
}

export async function readEducationCatalogConsistent(
  reader: EducationCatalogReader,
  request: EducationCatalogReadRequest
): Promise<EducationCatalogReadSnapshot> {
  if (
    !Number.isSafeInteger(request?.limits?.readerTimeoutMs) ||
    request.limits.readerTimeoutMs < 1 ||
    request.limits.readerTimeoutMs > MAX_READ_LIMITS.readerTimeoutMs
  ) {
    throw new EducationReadModelError("INVALID_REQUEST");
  }
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("catalog_read_timeout"));
    }, request.limits.readerTimeoutMs);
  });
  try {
    return await Promise.race([
      reader.readConsistent({ ...request, signal: controller.signal }),
      timedOut,
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
