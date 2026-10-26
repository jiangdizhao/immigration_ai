import {
  canonicalizeEducationUrl,
  findCourseIdentityCollisions,
  findDeliveryIdentityCollisions,
  findIntakeIdentityCollisions,
  findProviderIdentityCollisions,
  findSourceIdentityCollisions,
  isReservedSyntheticHostForFamily,
} from "./identity";

export const MAX_ENTITY_RECORDS = 1000;
export const MAX_SOURCE_RECORDS = 200;
export const MAX_SNAPSHOT_RECORDS = 5000;
export const MAX_FIELD_OBSERVATIONS = 10_000;
export const MAX_CANDIDATES_PER_FIELD = 32;
export const MAX_ID_LENGTH = 128;
export const MAX_TEXT_LENGTH = 4096;
export const MAX_URL_LENGTH = 2048;

export type RecordClass = "SYNTHETIC" | "UNVERIFIED";
export type SourceFamily = "CRICOS" | "STUDY_AUSTRALIA" | "INSTITUTION";
export type EducationEntityType = "PROVIDER" | "COURSE" | "DELIVERY" | "INTAKE";
export type ClaimDomain =
  | "CRICOS_REGISTRATION"
  | "INSTITUTION_COURSE"
  | "INSTITUTION_ADMISSIONS"
  | "INSTITUTION_AVAILABILITY"
  | "INSTITUTION_FEE"
  | "INSTITUTION_DELIVERY"
  | "INSTITUTION_INTAKE"
  | "DISCOVERY";

export type FieldKey =
  | "PROVIDER_LEGAL_NAME"
  | "CRICOS_PROVIDER_STATUS"
  | "COURSE_TITLE"
  | "COURSE_QUALIFICATION_LEVEL"
  | "CRICOS_COURSE_STATUS"
  | "INSTITUTION_COURSE_CODE"
  | "COURSE_ADMISSIONS_CRITERIA"
  | "COURSE_AVAILABILITY"
  | "TUITION_FEE"
  | "CAMPUS_NAME"
  | "DELIVERY_MODE"
  | "DELIVERY_AVAILABILITY"
  | "INTAKE_PERIOD"
  | "INTAKE_START_DATE"
  | "APPLICATION_DEADLINE"
  | "INTAKE_AVAILABILITY"
  | "DISCOVERY_REFERENCE";

export type FeeAudience = "INTERNATIONAL" | "DOMESTIC";
export type FeeBasis = "TOTAL" | "ANNUAL" | "SEMESTER" | "UNIT";

export type EducationFieldValue =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "enum"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "date"; readonly value: string }
  | {
      readonly kind: "money";
      readonly amount: number;
      readonly currency?: string;
      readonly audience?: FeeAudience;
      readonly basis?: FeeBasis;
      readonly year?: number;
      readonly period?: string;
      readonly inclusions?: readonly string[];
    };

export interface EducationProvider {
  readonly providerId: string;
  readonly recordClass: RecordClass;
  readonly displayName: string;
  readonly legalName?: string;
  readonly aliases?: readonly string[];
  readonly cricosProviderCode?: string;
  readonly category?: string;
}

export interface EducationCourse {
  readonly courseId: string;
  readonly providerId: string;
  readonly recordClass: RecordClass;
  readonly title: string;
  readonly qualificationLevel?: string;
  readonly sector?: string;
  readonly cricosCourseCode?: string;
  readonly institutionCourseCode?: string;
  readonly studyField?: string;
}

export interface EducationDelivery {
  readonly deliveryId: string;
  readonly courseId: string;
  readonly recordClass: RecordClass;
  readonly campusId?: string;
  readonly siteId?: string;
  readonly campusName?: string;
  readonly city?: string;
  readonly state?: string;
  readonly mode?: string;
}

export interface EducationIntake {
  readonly intakeId: string;
  readonly deliveryId: string;
  readonly recordClass: RecordClass;
  readonly intakeCode?: string;
  readonly term?: string;
  readonly year?: number;
  readonly startDate?: string;
  readonly applicationDeadline?: string;
}

export type EducationSourceScope =
  | { readonly kind: "CATALOG" }
  | { readonly kind: "PROVIDER"; readonly providerId: string };

export interface EducationSource {
  readonly sourceId: string;
  readonly sourceFamily: SourceFamily;
  readonly recordClass: RecordClass;
  /** Descriptive only; a name or family label does not establish authority. */
  readonly authorityName: string;
  readonly originalUrl: string;
  readonly canonicalUrl: string;
  readonly scope: EducationSourceScope;
  readonly language: string;
  readonly accessMode: "SYNTHETIC_FIXTURE" | "CURATED_REFERENCE";
}

export interface EducationSnapshot {
  readonly snapshotId: string;
  readonly sourceId: string;
  readonly recordClass: RecordClass;
  readonly sourceUrl: string;
  readonly retrievedAt: string;
  readonly observedAt: string;
  readonly publishedAt?: string;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
  readonly contentSha256?: string;
  readonly parserVersion?: string;
  readonly contentExcerpt?: string;
  readonly locator?: string;
  readonly acquisitionOutcome: "CAPTURED" | "FAILED_FETCH" | "FAILED_PARSE";
}

export interface ObservationProvenance {
  readonly sourceId: string;
  readonly snapshotId: string;
  readonly sourceFamily: SourceFamily;
  readonly sourceUrl: string;
  readonly contentSha256: string;
  readonly locator: string;
  readonly excerpt?: string;
}

export type ObservationDisposition =
  | "ASSERTION"
  | "WITHDRAWAL"
  | "NOT_APPLICABLE";

export interface EducationFieldObservation {
  readonly observationId: string;
  readonly target: { readonly type: EducationEntityType; readonly id: string };
  readonly fieldKey: FieldKey;
  readonly claimDomain: ClaimDomain;
  readonly recordClass: RecordClass;
  readonly disposition: ObservationDisposition;
  readonly value?: EducationFieldValue;
  readonly provenance: ObservationProvenance;
  readonly observedAt: string;
  /** Source applicability dates are preserved separately from intake/deadline values. */
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
}

export interface EducationDataset {
  readonly providers: readonly EducationProvider[];
  readonly courses: readonly EducationCourse[];
  readonly deliveries: readonly EducationDelivery[];
  readonly intakes: readonly EducationIntake[];
  readonly sources: readonly EducationSource[];
  readonly snapshots: readonly EducationSnapshot[];
  readonly observations: readonly EducationFieldObservation[];
}

export type ResolutionStatus =
  | "UNKNOWN"
  | "KNOWN"
  | "CONFLICTED"
  | "STALE"
  | "NOT_APPLICABLE"
  | "WITHDRAWN";

export type ResolutionReason =
  | "NO_OBSERVATIONS"
  | "SOURCE_NOT_VERIFIED"
  | "RESOLVED_IDENTICAL_VALUES"
  | "CONFLICTING_VALUES"
  | "INCOMPATIBLE_FEE_SCOPE"
  | "FRESHNESS_WINDOW_EXCEEDED"
  | "SOURCE_EFFECTIVITY_ENDED"
  | "LATEST_SOURCE_ATTEMPT_FAILED"
  | "FUTURE_OBSERVATION"
  | "CONFLICTING_DISPOSITIONS"
  | "ALL_SOURCES_WITHDREW_FIELD"
  | "ALL_SOURCES_MARKED_NOT_APPLICABLE"
  | "NO_CURRENT_APPLICABLE_OBSERVATIONS";

export interface ResolutionSourceRef {
  readonly observationId: string;
  readonly sourceId: string;
  readonly snapshotId: string;
  readonly sourceFamily: SourceFamily;
  readonly sourceUrl: string;
  readonly contentSha256: string;
  readonly locator: string;
}

export interface EducationFieldResolution {
  readonly target: { readonly type: EducationEntityType; readonly id: string };
  readonly fieldKey: FieldKey;
  readonly status: ResolutionStatus;
  readonly evidenceClass: "SYNTHETIC_ONLY" | "UNVERIFIED";
  readonly assessedAt: string;
  readonly resolvedValue?: EducationFieldValue;
  /** STALE retains prior support here without presenting it as a current resolution. */
  readonly historicalValue?: EducationFieldValue;
  readonly reasons: readonly ResolutionReason[];
  readonly sourceRefs: readonly ResolutionSourceRef[];
  /** All matching observations and relevant acquisition snapshots remain available as history. */
  readonly history: readonly EducationFieldObservation[];
  readonly sourceSnapshotHistory: readonly EducationSnapshot[];
}

export interface ContractIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ContractValidation {
  readonly ok: boolean;
  readonly issues: readonly ContractIssue[];
}

export interface FieldDefinition {
  readonly entityTypes: readonly EducationEntityType[];
  readonly valueKinds: readonly EducationFieldValue["kind"][];
  readonly claimDomain: ClaimDomain;
}

export const FIELD_DEFINITIONS: Readonly<Record<FieldKey, FieldDefinition>> = {
  PROVIDER_LEGAL_NAME: {
    entityTypes: ["PROVIDER"],
    valueKinds: ["text"],
    claimDomain: "INSTITUTION_COURSE",
  },
  CRICOS_PROVIDER_STATUS: {
    entityTypes: ["PROVIDER"],
    valueKinds: ["enum"],
    claimDomain: "CRICOS_REGISTRATION",
  },
  COURSE_TITLE: {
    entityTypes: ["COURSE"],
    valueKinds: ["text"],
    claimDomain: "INSTITUTION_COURSE",
  },
  COURSE_QUALIFICATION_LEVEL: {
    entityTypes: ["COURSE"],
    valueKinds: ["enum"],
    claimDomain: "INSTITUTION_COURSE",
  },
  CRICOS_COURSE_STATUS: {
    entityTypes: ["COURSE"],
    valueKinds: ["enum"],
    claimDomain: "CRICOS_REGISTRATION",
  },
  INSTITUTION_COURSE_CODE: {
    entityTypes: ["COURSE"],
    valueKinds: ["text"],
    claimDomain: "INSTITUTION_COURSE",
  },
  COURSE_ADMISSIONS_CRITERIA: {
    entityTypes: ["COURSE"],
    valueKinds: ["text"],
    claimDomain: "INSTITUTION_ADMISSIONS",
  },
  COURSE_AVAILABILITY: {
    entityTypes: ["COURSE"],
    valueKinds: ["enum"],
    claimDomain: "INSTITUTION_AVAILABILITY",
  },
  TUITION_FEE: {
    entityTypes: ["COURSE", "DELIVERY", "INTAKE"],
    valueKinds: ["money"],
    claimDomain: "INSTITUTION_FEE",
  },
  CAMPUS_NAME: {
    entityTypes: ["DELIVERY"],
    valueKinds: ["text"],
    claimDomain: "INSTITUTION_DELIVERY",
  },
  DELIVERY_MODE: {
    entityTypes: ["DELIVERY"],
    valueKinds: ["enum"],
    claimDomain: "INSTITUTION_DELIVERY",
  },
  DELIVERY_AVAILABILITY: {
    entityTypes: ["DELIVERY"],
    valueKinds: ["enum"],
    claimDomain: "INSTITUTION_AVAILABILITY",
  },
  INTAKE_PERIOD: {
    entityTypes: ["INTAKE"],
    valueKinds: ["text"],
    claimDomain: "INSTITUTION_INTAKE",
  },
  INTAKE_START_DATE: {
    entityTypes: ["INTAKE"],
    valueKinds: ["date"],
    claimDomain: "INSTITUTION_INTAKE",
  },
  APPLICATION_DEADLINE: {
    entityTypes: ["INTAKE"],
    valueKinds: ["date"],
    claimDomain: "INSTITUTION_INTAKE",
  },
  INTAKE_AVAILABILITY: {
    entityTypes: ["INTAKE"],
    valueKinds: ["enum"],
    claimDomain: "INSTITUTION_INTAKE",
  },
  DISCOVERY_REFERENCE: {
    entityTypes: ["COURSE"],
    valueKinds: ["text"],
    claimDomain: "DISCOVERY",
  },
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i;
const SOURCE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T.+(?:Z|[+-]\d{2}:\d{2}))?$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedText(value: unknown, max = MAX_TEXT_LENGTH): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

function isSourceDate(value: unknown): value is string {
  if (typeof value !== "string" || !SOURCE_DATE_PATTERN.test(value)) {
    return false;
  }
  return value.includes("T") ? isTimestamp(value) : isIsoDate(value);
}

function isValidRecordClass(value: unknown): value is RecordClass {
  return value === "SYNTHETIC" || value === "UNVERIFIED";
}

function validateFieldValue(value: unknown, path: string): ContractIssue[] {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return [
      {
        code: "INVALID_FIELD_VALUE",
        path,
        message: "Expected a typed field value.",
      },
    ];
  }

  if (value.kind === "text" || value.kind === "enum") {
    return isBoundedText(value.value)
      ? []
      : [
          {
            code: "INVALID_FIELD_VALUE",
            path,
            message: "Text value is empty or too long.",
          },
        ];
  }
  if (value.kind === "boolean") {
    return typeof value.value === "boolean"
      ? []
      : [
          {
            code: "INVALID_FIELD_VALUE",
            path,
            message: "Expected a boolean value.",
          },
        ];
  }
  if (value.kind === "date") {
    return isIsoDate(value.value)
      ? []
      : [
          {
            code: "INVALID_FIELD_VALUE",
            path,
            message: "Expected an exact ISO calendar date.",
          },
        ];
  }
  if (value.kind !== "money") {
    return [
      {
        code: "INVALID_FIELD_VALUE",
        path,
        message: "Unknown field value kind.",
      },
    ];
  }

  const issues: ContractIssue[] = [];
  if (
    typeof value.amount !== "number" ||
    !Number.isFinite(value.amount) ||
    value.amount < 0
  ) {
    issues.push({
      code: "INVALID_MONEY_AMOUNT",
      path: `${path}.amount`,
      message: "Money amount must be a finite non-negative sourced value.",
    });
  }
  if (
    value.currency !== undefined &&
    (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency))
  ) {
    issues.push({
      code: "INVALID_CURRENCY",
      path: `${path}.currency`,
      message: "Currency must be a three-letter uppercase code when present.",
    });
  }
  if (
    value.audience !== undefined &&
    value.audience !== "INTERNATIONAL" &&
    value.audience !== "DOMESTIC"
  ) {
    issues.push({
      code: "INVALID_FEE_AUDIENCE",
      path: `${path}.audience`,
      message: "Unsupported fee audience.",
    });
  }
  if (
    value.basis !== undefined &&
    !["TOTAL", "ANNUAL", "SEMESTER", "UNIT"].includes(String(value.basis))
  ) {
    issues.push({
      code: "INVALID_FEE_BASIS",
      path: `${path}.basis`,
      message: "Unsupported fee basis.",
    });
  }
  if (
    value.year !== undefined &&
    (typeof value.year !== "number" ||
      !Number.isInteger(value.year) ||
      value.year < 1900 ||
      value.year > 2200)
  ) {
    issues.push({
      code: "INVALID_FEE_YEAR",
      path: `${path}.year`,
      message: "Fee year must be an integer in the supported date range.",
    });
  }
  if (value.period !== undefined && !isBoundedText(value.period, 128)) {
    issues.push({
      code: "INVALID_FEE_PERIOD",
      path: `${path}.period`,
      message: "Fee period must be a bounded non-empty string.",
    });
  }
  if (
    value.inclusions !== undefined &&
    (!Array.isArray(value.inclusions) ||
      value.inclusions.length > 32 ||
      value.inclusions.some((item) => !isBoundedText(item, 128)))
  ) {
    issues.push({
      code: "INVALID_FEE_INCLUSIONS",
      path: `${path}.inclusions`,
      message: "Fee inclusions must be a bounded list of non-empty strings.",
    });
  }
  return issues;
}

function addIssue(
  issues: ContractIssue[],
  code: string,
  path: string,
  message: string
): void {
  issues.push({ code, path, message });
}

export function validateEducationDataset(dataset: unknown): ContractValidation {
  const issues: ContractIssue[] = [];
  if (!isRecord(dataset)) {
    return {
      ok: false,
      issues: [
        {
          code: "INVALID_DATASET",
          path: "$",
          message: "Expected an education dataset.",
        },
      ],
    };
  }

  const arrayKeys = [
    "providers",
    "courses",
    "deliveries",
    "intakes",
    "sources",
    "snapshots",
    "observations",
  ] as const;
  for (const key of arrayKeys) {
    if (!Array.isArray(dataset[key])) {
      addIssue(issues, "INVALID_COLLECTION", `$.${key}`, "Expected an array.");
    }
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const providers = dataset.providers as readonly EducationProvider[];
  const courses = dataset.courses as readonly EducationCourse[];
  const deliveries = dataset.deliveries as readonly EducationDelivery[];
  const intakes = dataset.intakes as readonly EducationIntake[];
  const sources = dataset.sources as readonly EducationSource[];
  const snapshots = dataset.snapshots as readonly EducationSnapshot[];
  const observations =
    dataset.observations as readonly EducationFieldObservation[];
  for (const [name, records, max] of [
    ["providers", providers, MAX_ENTITY_RECORDS],
    ["courses", courses, MAX_ENTITY_RECORDS],
    ["deliveries", deliveries, MAX_ENTITY_RECORDS],
    ["intakes", intakes, MAX_ENTITY_RECORDS],
    ["sources", sources, MAX_SOURCE_RECORDS],
    ["snapshots", snapshots, MAX_SNAPSHOT_RECORDS],
    ["observations", observations, MAX_FIELD_OBSERVATIONS],
  ] as const) {
    if (records.length > max) {
      addIssue(
        issues,
        "COLLECTION_LIMIT_EXCEEDED",
        `$.${name}`,
        "Collection exceeds its bound."
      );
    }
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const objectCollections: readonly [string, readonly unknown[]][] = [
    ["providers", providers],
    ["courses", courses],
    ["deliveries", deliveries],
    ["intakes", intakes],
    ["sources", sources],
    ["snapshots", snapshots],
    ["observations", observations],
  ];
  for (const [name, records] of objectCollections) {
    records.forEach((record, index) => {
      if (!isRecord(record)) {
        addIssue(
          issues,
          "INVALID_RECORD",
          `$.${name}[${index}]`,
          "Expected a record object."
        );
      }
    });
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  for (const [name, records, max] of [
    ["providers", providers, MAX_ENTITY_RECORDS],
    ["courses", courses, MAX_ENTITY_RECORDS],
    ["deliveries", deliveries, MAX_ENTITY_RECORDS],
    ["intakes", intakes, MAX_ENTITY_RECORDS],
    ["sources", sources, MAX_SOURCE_RECORDS],
    ["snapshots", snapshots, MAX_SNAPSHOT_RECORDS],
    ["observations", observations, MAX_FIELD_OBSERVATIONS],
  ] as const) {
    if (records.length > max) {
      addIssue(
        issues,
        "COLLECTION_LIMIT_EXCEEDED",
        `$.${name}`,
        "Collection exceeds its bound."
      );
    }
  }

  const validateEntityCollection = (
    records: readonly unknown[],
    idKey: string,
    collectionName: string,
    nameKeys: readonly string[],
    requiredNameKeys: readonly string[] = []
  ) => {
    const ids = new Set<string>();
    records.forEach((record, index) => {
      const path = `$.${collectionName}[${index}]`;
      if (!isRecord(record)) {
        addIssue(issues, "INVALID_ENTITY", path, "Expected an entity object.");
        return;
      }
      const id = record[idKey];
      if (!isOpaqueId(id)) {
        addIssue(
          issues,
          "INVALID_ENTITY_ID",
          `${path}.${idKey}`,
          "Invalid opaque entity ID."
        );
      } else if (ids.has(id)) {
        addIssue(
          issues,
          "DUPLICATE_ENTITY_ID",
          `${path}.${idKey}`,
          "Entity ID is duplicated."
        );
      } else {
        ids.add(id);
      }
      if (!isValidRecordClass(record.recordClass)) {
        addIssue(
          issues,
          "INVALID_RECORD_CLASS",
          `${path}.recordClass`,
          "Invalid record class."
        );
      }
      for (const nameKey of nameKeys) {
        const text = record[nameKey];
        if (
          (requiredNameKeys.includes(nameKey) && !isBoundedText(text, 512)) ||
          (text !== undefined && !isBoundedText(text, 512))
        ) {
          addIssue(
            issues,
            "INVALID_ENTITY_TEXT",
            `${path}.${nameKey}`,
            "Entity text is empty or too long."
          );
        }
      }
    });
  };

  validateEntityCollection(
    providers,
    "providerId",
    "providers",
    ["displayName", "legalName"],
    ["displayName"]
  );
  validateEntityCollection(
    courses,
    "courseId",
    "courses",
    ["title"],
    ["title"]
  );
  validateEntityCollection(deliveries, "deliveryId", "deliveries", [
    "campusName",
    "city",
    "state",
    "mode",
  ]);
  validateEntityCollection(intakes, "intakeId", "intakes", ["term"]);

  const providerById = new Map(
    providers.map((provider) => [provider.providerId, provider])
  );
  const courseById = new Map(
    courses.map((course) => [course.courseId, course])
  );
  const deliveryById = new Map(
    deliveries.map((delivery) => [delivery.deliveryId, delivery])
  );
  const intakeById = new Map(
    intakes.map((intake) => [intake.intakeId, intake])
  );

  courses.forEach((course, index) => {
    const path = `$.courses[${index}]`;
    if (!providerById.has(course.providerId)) {
      addIssue(
        issues,
        "MISSING_PROVIDER",
        `${path}.providerId`,
        "Course provider does not exist."
      );
    } else if (
      providerById.get(course.providerId)?.recordClass !== course.recordClass
    ) {
      addIssue(
        issues,
        "MIXED_RECORD_CLASS",
        `${path}.recordClass`,
        "Course and provider record classes differ."
      );
    }
    for (const [key, value] of [
      ["cricosCourseCode", course.cricosCourseCode],
      ["institutionCourseCode", course.institutionCourseCode],
    ] as const) {
      if (value !== undefined && !isBoundedText(value, 128)) {
        addIssue(
          issues,
          "INVALID_EXTERNAL_CODE",
          `${path}.${key}`,
          "External code is empty or too long."
        );
      }
    }
  });

  deliveries.forEach((delivery, index) => {
    const path = `$.deliveries[${index}]`;
    const course = courseById.get(delivery.courseId);
    if (!course) {
      addIssue(
        issues,
        "MISSING_COURSE",
        `${path}.courseId`,
        "Delivery course does not exist."
      );
    } else if (course.recordClass !== delivery.recordClass) {
      addIssue(
        issues,
        "MIXED_RECORD_CLASS",
        `${path}.recordClass`,
        "Delivery and course record classes differ."
      );
    }
    for (const [key, value] of [
      ["campusId", delivery.campusId],
      ["siteId", delivery.siteId],
    ] as const) {
      if (value !== undefined && !isBoundedText(value, 128)) {
        addIssue(
          issues,
          "INVALID_LOCATION_ID",
          `${path}.${key}`,
          "Location identity is empty or too long."
        );
      }
    }
  });

  intakes.forEach((intake, index) => {
    const path = `$.intakes[${index}]`;
    const delivery = deliveryById.get(intake.deliveryId);
    if (!delivery) {
      addIssue(
        issues,
        "MISSING_DELIVERY",
        `${path}.deliveryId`,
        "Intake delivery does not exist."
      );
    } else if (delivery.recordClass !== intake.recordClass) {
      addIssue(
        issues,
        "MIXED_RECORD_CLASS",
        `${path}.recordClass`,
        "Intake and delivery record classes differ."
      );
    }
    if (
      intake.intakeCode !== undefined &&
      !isBoundedText(intake.intakeCode, 128)
    ) {
      addIssue(
        issues,
        "INVALID_INTAKE_CODE",
        `${path}.intakeCode`,
        "Intake code is empty or too long."
      );
    }
    if (
      intake.year !== undefined &&
      (!Number.isInteger(intake.year) ||
        intake.year < 1900 ||
        intake.year > 2200)
    ) {
      addIssue(
        issues,
        "INVALID_INTAKE_YEAR",
        `${path}.year`,
        "Intake year is outside the supported range."
      );
    }
    if (intake.startDate !== undefined && !isIsoDate(intake.startDate)) {
      addIssue(
        issues,
        "INVALID_INTAKE_DATE",
        `${path}.startDate`,
        "Start date must be an exact ISO calendar date."
      );
    }
    if (
      intake.applicationDeadline !== undefined &&
      !isIsoDate(intake.applicationDeadline)
    ) {
      addIssue(
        issues,
        "INVALID_APPLICATION_DEADLINE",
        `${path}.applicationDeadline`,
        "Application deadline must be an exact sourced ISO calendar date."
      );
    }
  });

  const sourceById = new Map<string, EducationSource>();
  sources.forEach((source, index) => {
    const path = `$.sources[${index}]`;
    if (!isRecord(source)) {
      addIssue(issues, "INVALID_SOURCE", path, "Expected a source object.");
      return;
    }
    if (!isOpaqueId(source.sourceId)) {
      addIssue(
        issues,
        "INVALID_SOURCE_ID",
        `${path}.sourceId`,
        "Invalid source ID."
      );
    } else if (sourceById.has(source.sourceId)) {
      addIssue(
        issues,
        "DUPLICATE_SOURCE_ID",
        `${path}.sourceId`,
        "Source ID is duplicated."
      );
    } else {
      sourceById.set(source.sourceId, source);
    }
    if (
      !["CRICOS", "STUDY_AUSTRALIA", "INSTITUTION"].includes(
        source.sourceFamily
      )
    ) {
      addIssue(
        issues,
        "INVALID_SOURCE_FAMILY",
        `${path}.sourceFamily`,
        "Unsupported source family."
      );
    }
    if (!isValidRecordClass(source.recordClass)) {
      addIssue(
        issues,
        "INVALID_RECORD_CLASS",
        `${path}.recordClass`,
        "Invalid source record class."
      );
    }
    if (!isBoundedText(source.authorityName, 256)) {
      addIssue(
        issues,
        "INVALID_AUTHORITY_LABEL",
        `${path}.authorityName`,
        "Authority label is empty or too long."
      );
    }
    if (
      typeof source.language !== "string" ||
      (source.language !== "und" &&
        !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(source.language))
    ) {
      addIssue(
        issues,
        "INVALID_LANGUAGE",
        `${path}.language`,
        "Language tag is malformed."
      );
    }
    try {
      if (
        source.originalUrl.length > MAX_URL_LENGTH ||
        source.canonicalUrl.length > MAX_URL_LENGTH
      ) {
        addIssue(issues, "URL_TOO_LONG", path, "Source URL exceeds its bound.");
      } else if (
        canonicalizeEducationUrl(source.originalUrl) !== source.canonicalUrl
      ) {
        addIssue(
          issues,
          "NONCANONICAL_SOURCE_URL",
          `${path}.canonicalUrl`,
          "Canonical URL does not match the normalized source URL."
        );
      }
    } catch {
      addIssue(
        issues,
        "INVALID_SOURCE_URL",
        `${path}.originalUrl`,
        "Source URL must be a safe HTTPS web URL."
      );
    }
    const sourceScopeValid =
      isRecord(source.scope) &&
      (source.scope.kind === "CATALOG" ||
        (source.scope.kind === "PROVIDER" &&
          isOpaqueId(source.scope.providerId) &&
          providerById.has(source.scope.providerId)));
    if (!sourceScopeValid) {
      addIssue(
        issues,
        "INVALID_SOURCE_SCOPE",
        `${path}.scope`,
        "Source scope is malformed."
      );
      if (
        isRecord(source.scope) &&
        source.scope.kind === "PROVIDER" &&
        isOpaqueId(source.scope.providerId) &&
        !providerById.has(source.scope.providerId)
      ) {
        addIssue(
          issues,
          "MISSING_SOURCE_PROVIDER",
          `${path}.scope.providerId`,
          "Source provider scope does not exist."
        );
      }
    } else if (
      (source.sourceFamily === "INSTITUTION" &&
        source.scope.kind !== "PROVIDER") ||
      (source.sourceFamily !== "INSTITUTION" && source.scope.kind !== "CATALOG")
    ) {
      addIssue(
        issues,
        "SOURCE_SCOPE_FAMILY_MISMATCH",
        `${path}.scope`,
        "Source scope is inconsistent with its source family."
      );
    }
    if (
      isRecord(source.scope) &&
      source.scope.kind === "PROVIDER" &&
      isOpaqueId(source.scope.providerId)
    ) {
      const scopedProvider = providerById.get(source.scope.providerId);
      if (scopedProvider && scopedProvider.recordClass !== source.recordClass) {
        addIssue(
          issues,
          "SOURCE_ENTITY_RECORD_CLASS_MISMATCH",
          `${path}.recordClass`,
          "Provider-scoped source and provider record classes differ."
        );
      }
    }
    if (
      (source.recordClass === "SYNTHETIC" &&
        source.accessMode !== "SYNTHETIC_FIXTURE") ||
      (source.recordClass === "UNVERIFIED" &&
        source.accessMode !== "CURATED_REFERENCE")
    ) {
      addIssue(
        issues,
        "SOURCE_ACCESS_CLASS_MISMATCH",
        `${path}.accessMode`,
        "Access mode does not match source record class."
      );
    }
    if (source.recordClass === "SYNTHETIC") {
      try {
        if (
          !isReservedSyntheticHostForFamily(
            source.canonicalUrl,
            source.sourceFamily
          )
        ) {
          addIssue(
            issues,
            "SYNTHETIC_SOURCE_FAMILY_URL_MISMATCH",
            `${path}.canonicalUrl`,
            "Synthetic URL host must match its reserved source-family test domain."
          );
        }
      } catch {
        // The URL shape issue above is sufficient; keep validation total for malformed input.
      }
    } else if (typeof source.canonicalUrl === "string") {
      try {
        if (new URL(source.canonicalUrl).hostname.endsWith(".example")) {
          addIssue(
            issues,
            "UNVERIFIED_SOURCE_USES_TEST_DOMAIN",
            `${path}.canonicalUrl`,
            "Reserved example hosts must remain explicitly synthetic."
          );
        }
      } catch {
        // The malformed URL issue above is sufficient.
      }
    }
  });

  const snapshotById = new Map<string, EducationSnapshot>();
  snapshots.forEach((snapshot, index) => {
    const path = `$.snapshots[${index}]`;
    if (!isRecord(snapshot)) {
      addIssue(issues, "INVALID_SNAPSHOT", path, "Expected a snapshot object.");
      return;
    }
    if (!isOpaqueId(snapshot.snapshotId)) {
      addIssue(
        issues,
        "INVALID_SNAPSHOT_ID",
        `${path}.snapshotId`,
        "Invalid snapshot ID."
      );
    } else if (snapshotById.has(snapshot.snapshotId)) {
      addIssue(
        issues,
        "DUPLICATE_SNAPSHOT_ID",
        `${path}.snapshotId`,
        "Snapshot ID is duplicated."
      );
    } else {
      snapshotById.set(snapshot.snapshotId, snapshot);
    }
    const source = sourceById.get(snapshot.sourceId);
    if (!source) {
      addIssue(
        issues,
        "MISSING_SNAPSHOT_SOURCE",
        `${path}.sourceId`,
        "Snapshot source does not exist."
      );
    } else if (source.recordClass !== snapshot.recordClass) {
      addIssue(
        issues,
        "MIXED_RECORD_CLASS",
        `${path}.recordClass`,
        "Snapshot and source record classes differ."
      );
    } else if (snapshot.sourceUrl !== source.canonicalUrl) {
      addIssue(
        issues,
        "SNAPSHOT_SOURCE_URL_MISMATCH",
        `${path}.sourceUrl`,
        "Snapshot URL differs from its source identity."
      );
    }
    if (
      !isTimestamp(snapshot.retrievedAt) ||
      !isTimestamp(snapshot.observedAt)
    ) {
      addIssue(
        issues,
        "INVALID_SNAPSHOT_TIME",
        path,
        "Retrieval and observation timestamps must include a timezone."
      );
    }
    for (const key of [
      "publishedAt",
      "effectiveFrom",
      "effectiveTo",
    ] as const) {
      if (snapshot[key] !== undefined && !isSourceDate(snapshot[key])) {
        addIssue(
          issues,
          "INVALID_SOURCE_DATE",
          `${path}.${key}`,
          "Source date must retain exact date or timezone."
        );
      }
    }
    if (
      snapshot.effectiveFrom &&
      snapshot.effectiveTo &&
      snapshot.effectiveFrom > snapshot.effectiveTo
    ) {
      addIssue(
        issues,
        "INVALID_EFFECTIVE_RANGE",
        path,
        "Effective date range is reversed."
      );
    }
    if (
      snapshot.contentSha256 !== undefined &&
      (typeof snapshot.contentSha256 !== "string" ||
        !SHA256_PATTERN.test(snapshot.contentSha256))
    ) {
      addIssue(
        issues,
        "INVALID_CONTENT_HASH",
        `${path}.contentSha256`,
        "Content hash must be SHA-256 hex."
      );
    }
    if (
      snapshot.acquisitionOutcome !== "FAILED_FETCH" &&
      !snapshot.contentSha256
    ) {
      addIssue(
        issues,
        "MISSING_CONTENT_HASH",
        `${path}.contentSha256`,
        "Captured or parse-failed source bytes require a content hash."
      );
    }
    if (
      snapshot.contentExcerpt !== undefined &&
      (!isBoundedText(snapshot.contentExcerpt) ||
        snapshot.contentExcerpt.length > MAX_TEXT_LENGTH)
    ) {
      addIssue(
        issues,
        "INVALID_EXCERPT",
        `${path}.contentExcerpt`,
        "Snapshot excerpt is empty or too long."
      );
    }
    if (
      snapshot.locator !== undefined &&
      !isBoundedText(snapshot.locator, 512)
    ) {
      addIssue(
        issues,
        "INVALID_LOCATOR",
        `${path}.locator`,
        "Snapshot locator is empty or too long."
      );
    }
    if (snapshot.recordClass === "SYNTHETIC" && snapshot.sourceUrl) {
      try {
        if (!new URL(snapshot.sourceUrl).hostname.endsWith(".example")) {
          addIssue(
            issues,
            "SYNTHETIC_URL_NOT_RESERVED",
            `${path}.sourceUrl`,
            "Synthetic records must use reserved .example hosts."
          );
        }
      } catch {
        addIssue(
          issues,
          "INVALID_SNAPSHOT_URL",
          `${path}.sourceUrl`,
          "Snapshot URL is malformed."
        );
      }
    }
  });

  const entityExists = (type: EducationEntityType, id: string): boolean => {
    if (type === "PROVIDER") {
      return providerById.has(id);
    }
    if (type === "COURSE") {
      return courseById.has(id);
    }
    if (type === "DELIVERY") {
      return deliveryById.has(id);
    }
    return intakeById.has(id);
  };
  const providerForTarget = (
    type: EducationEntityType,
    id: string
  ): string | undefined => {
    if (type === "PROVIDER") {
      return providerById.has(id) ? id : undefined;
    }
    if (type === "COURSE") {
      return courseById.get(id)?.providerId;
    }
    if (type === "DELIVERY") {
      const course = courseById.get(deliveryById.get(id)?.courseId ?? "");
      return course?.providerId;
    }
    const delivery = deliveryById.get(intakeById.get(id)?.deliveryId ?? "");
    return courseById.get(delivery?.courseId ?? "")?.providerId;
  };
  const recordClassForTarget = (
    type: EducationEntityType,
    id: string
  ): RecordClass | undefined => {
    if (type === "PROVIDER") {
      return providerById.get(id)?.recordClass;
    }
    if (type === "COURSE") {
      return courseById.get(id)?.recordClass;
    }
    if (type === "DELIVERY") {
      return deliveryById.get(id)?.recordClass;
    }
    return intakeById.get(id)?.recordClass;
  };

  observations.forEach((observation, index) => {
    const path = `$.observations[${index}]`;
    if (!isRecord(observation)) {
      addIssue(
        issues,
        "INVALID_OBSERVATION",
        path,
        "Expected an observation object."
      );
      return;
    }
    const field = FIELD_DEFINITIONS[observation.fieldKey];
    const provenance = isRecord(observation.provenance)
      ? observation.provenance
      : undefined;
    const source = sourceById.get(provenance?.sourceId as string);
    const snapshot = snapshotById.get(provenance?.snapshotId as string);
    if (!isOpaqueId(observation.observationId)) {
      addIssue(
        issues,
        "INVALID_OBSERVATION_ID",
        `${path}.observationId`,
        "Invalid observation ID."
      );
    }
    if (
      !observation.target ||
      !["PROVIDER", "COURSE", "DELIVERY", "INTAKE"].includes(
        observation.target.type
      ) ||
      !isOpaqueId(observation.target.id) ||
      !entityExists(observation.target.type, observation.target.id)
    ) {
      addIssue(
        issues,
        "INVALID_OBSERVATION_TARGET",
        `${path}.target`,
        "Observation target does not exist."
      );
    } else if (field && !field.entityTypes.includes(observation.target.type)) {
      addIssue(
        issues,
        "FIELD_TARGET_MISMATCH",
        `${path}.target`,
        "Field is not valid for this entity type."
      );
    }
    if (
      observation.target &&
      isRecord(observation.target) &&
      ["PROVIDER", "COURSE", "DELIVERY", "INTAKE"].includes(
        String(observation.target.type)
      ) &&
      typeof observation.target.id === "string" &&
      entityExists(
        observation.target.type as EducationEntityType,
        observation.target.id
      ) &&
      isValidRecordClass(observation.recordClass) &&
      recordClassForTarget(
        observation.target.type as EducationEntityType,
        observation.target.id
      ) !== observation.recordClass
    ) {
      addIssue(
        issues,
        "OBSERVATION_ENTITY_RECORD_CLASS_MISMATCH",
        `${path}.recordClass`,
        "Observation and target entity record classes differ."
      );
    }
    if (!field) {
      addIssue(
        issues,
        "UNKNOWN_FIELD_KEY",
        `${path}.fieldKey`,
        "Unsupported field key."
      );
    } else if (observation.claimDomain !== field.claimDomain) {
      addIssue(
        issues,
        "FIELD_CLAIM_DOMAIN_MISMATCH",
        `${path}.claimDomain`,
        "Claim domain does not match the field."
      );
    }
    if (
      observation.claimDomain === "CRICOS_REGISTRATION" &&
      source?.sourceFamily !== "CRICOS"
    ) {
      addIssue(
        issues,
        "SOURCE_CLAIM_DOMAIN_MISMATCH",
        `${path}.provenance.sourceId`,
        "CRICOS registration claims require CRICOS source family."
      );
    }
    if (
      typeof observation.claimDomain === "string" &&
      observation.claimDomain.startsWith("INSTITUTION_") &&
      source?.sourceFamily !== "INSTITUTION"
    ) {
      addIssue(
        issues,
        "SOURCE_CLAIM_DOMAIN_MISMATCH",
        `${path}.provenance.sourceId`,
        "Institutional claims require an institution source."
      );
    }
    if (
      observation.claimDomain === "DISCOVERY" &&
      source?.sourceFamily !== "STUDY_AUSTRALIA"
    ) {
      addIssue(
        issues,
        "SOURCE_CLAIM_DOMAIN_MISMATCH",
        `${path}.provenance.sourceId`,
        "Discovery references require the discovery source family."
      );
    }
    if (source && snapshot) {
      if (snapshot.sourceId !== source.sourceId) {
        addIssue(
          issues,
          "CROSS_SOURCE_SNAPSHOT",
          `${path}.provenance.snapshotId`,
          "Snapshot belongs to a different source."
        );
      }
      if (
        snapshot.acquisitionOutcome !== "CAPTURED" ||
        !provenance ||
        snapshot.contentSha256 !== provenance.contentSha256 ||
        snapshot.sourceUrl !== provenance.sourceUrl ||
        source.sourceFamily !== provenance.sourceFamily ||
        source.recordClass !== observation.recordClass ||
        snapshot.recordClass !== observation.recordClass
      ) {
        addIssue(
          issues,
          "PROVENANCE_MISMATCH",
          `${path}.provenance`,
          "Observation provenance differs from its captured snapshot."
        );
      }
      if (!provenance || !isBoundedText(provenance.locator, 512)) {
        addIssue(
          issues,
          "INVALID_LOCATOR",
          `${path}.provenance.locator`,
          "Observation locator is empty or too long."
        );
      }
      if (
        provenance?.excerpt !== undefined &&
        !isBoundedText(provenance.excerpt)
      ) {
        addIssue(
          issues,
          "INVALID_EXCERPT",
          `${path}.provenance.excerpt`,
          "Observation excerpt is empty or too long."
        );
      }
      if (
        isRecord(source.scope) &&
        source.scope.kind === "PROVIDER" &&
        isOpaqueId(source.scope.providerId)
      ) {
        const targetProviderId =
          observation.target &&
          isRecord(observation.target) &&
          ["PROVIDER", "COURSE", "DELIVERY", "INTAKE"].includes(
            String(observation.target.type)
          ) &&
          typeof observation.target.id === "string"
            ? providerForTarget(
                observation.target.type as EducationEntityType,
                observation.target.id
              )
            : undefined;
        if (source.scope.providerId !== targetProviderId) {
          addIssue(
            issues,
            "CROSS_PROVIDER_PROVENANCE",
            `${path}.provenance.sourceId`,
            "Provider-scoped source cannot support another provider."
          );
        }
      }
    } else {
      addIssue(
        issues,
        "MISSING_OBSERVATION_PROVENANCE",
        `${path}.provenance`,
        "Observation source or snapshot is missing."
      );
    }
    if (!isValidRecordClass(observation.recordClass)) {
      addIssue(
        issues,
        "INVALID_RECORD_CLASS",
        `${path}.recordClass`,
        "Invalid observation record class."
      );
    }
    if (!isTimestamp(observation.observedAt)) {
      addIssue(
        issues,
        "INVALID_OBSERVATION_TIME",
        `${path}.observedAt`,
        "Observation timestamp must include a timezone."
      );
    }
    for (const key of ["effectiveFrom", "effectiveTo"] as const) {
      if (observation[key] !== undefined && !isSourceDate(observation[key])) {
        addIssue(
          issues,
          "INVALID_SOURCE_DATE",
          `${path}.${key}`,
          "Applicability date must retain exact date or timezone."
        );
      }
    }
    if (
      observation.effectiveFrom &&
      observation.effectiveTo &&
      observation.effectiveFrom > observation.effectiveTo
    ) {
      addIssue(
        issues,
        "INVALID_EFFECTIVE_RANGE",
        path,
        "Applicability range is reversed."
      );
    }
    if (observation.disposition === "ASSERTION") {
      if (observation.value === undefined) {
        addIssue(
          issues,
          "MISSING_ASSERTION_VALUE",
          `${path}.value`,
          "Assertion requires a sourced value."
        );
      } else {
        issues.push(...validateFieldValue(observation.value, `${path}.value`));
        if (
          field &&
          isRecord(observation.value) &&
          typeof observation.value.kind === "string" &&
          !field.valueKinds.includes(
            observation.value.kind as EducationFieldValue["kind"]
          )
        ) {
          addIssue(
            issues,
            "FIELD_VALUE_KIND_MISMATCH",
            `${path}.value.kind`,
            "Value kind does not match field."
          );
        }
      }
    } else if (
      (observation.disposition !== "WITHDRAWAL" &&
        observation.disposition !== "NOT_APPLICABLE") ||
      observation.value !== undefined
    ) {
      addIssue(
        issues,
        "INVALID_OBSERVATION_DISPOSITION",
        path,
        "Non-assertion observations must not carry a value."
      );
    }
  });

  const observationIds = new Set<string>();
  observations.forEach((observation, index) => {
    if (observationIds.has(observation.observationId)) {
      addIssue(
        issues,
        "DUPLICATE_OBSERVATION_ID",
        `$.observations[${index}].observationId`,
        "Observation ID is duplicated."
      );
    }
    observationIds.add(observation.observationId);
  });
  const scopedCounts = new Map<string, number>();
  for (const observation of observations) {
    if (
      !isRecord(observation.target) ||
      typeof observation.target.type !== "string" ||
      typeof observation.target.id !== "string" ||
      typeof observation.fieldKey !== "string"
    ) {
      continue;
    }
    const key =
      observation.target.type +
      ":" +
      observation.target.id +
      ":" +
      observation.fieldKey;
    const count = (scopedCounts.get(key) ?? 0) + 1;
    scopedCounts.set(key, count);
    if (count > MAX_CANDIDATES_PER_FIELD) {
      addIssue(
        issues,
        "FIELD_CANDIDATE_LIMIT_EXCEEDED",
        "$.observations",
        "Field candidate count exceeds its bound."
      );
    }
  }

  const collisionGroups = [
    ...findSourceIdentityCollisions(sources),
    ...findProviderIdentityCollisions(providers),
    ...findCourseIdentityCollisions(courses),
    ...findDeliveryIdentityCollisions(deliveries, courses),
    ...findIntakeIdentityCollisions(intakes, deliveries, courses),
  ];
  for (const collision of collisionGroups) {
    addIssue(
      issues,
      "AMBIGUOUS_EXTERNAL_IDENTITY",
      collision.path,
      collision.message
    );
  }

  return { ok: issues.length === 0, issues };
}
