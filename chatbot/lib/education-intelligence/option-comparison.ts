import { createHash } from "node:crypto";
import type { AuthorizedProjectFact } from "../projects/project-context";
import {
  type EducationDataset,
  type EducationEntityType,
  type EducationFieldResolution,
  type EducationFieldValue,
  FIELD_DEFINITIONS,
  type FieldKey,
  type SourceFamily,
} from "./contracts";
import {
  type ResolveFieldOptions,
  resolveEducationField,
} from "./field-resolution";
import type { EducationReadSourceReference } from "./read-model";

export type EducationCriterionComparator =
  | {
      readonly kind: "NUMBER_MINIMUM";
      readonly threshold: number;
      readonly unit: string;
    }
  | {
      readonly kind: "NUMBER_MAXIMUM";
      readonly threshold: number;
      readonly unit: string;
    }
  | {
      readonly kind: "NUMBER_RANGE";
      readonly minimum: number;
      readonly maximum: number;
      readonly unit: string;
    }
  | { readonly kind: "TEXT_EQUALS"; readonly expected: string }
  | { readonly kind: "BOOLEAN_EQUALS"; readonly expected: boolean }
  | { readonly kind: "DATE_EQUALS"; readonly expected: string }
  | { readonly kind: "DATE_ON_OR_BEFORE"; readonly latest: string }
  | { readonly kind: "SCHOOL_FEE_WITHIN_BUDGET" };

export interface ReviewedEducationCriterion {
  readonly criterionId: string;
  readonly schoolField: {
    readonly target: {
      readonly type: EducationEntityType;
      readonly id: string;
    };
    readonly fieldKey: FieldKey;
    readonly observationId: string;
    readonly snapshotId: string;
  };
  /** Exact immutable source evidence reviewed for this structured comparator. */
  readonly ruleEvidence: {
    readonly observationId: string;
    readonly snapshotId: string;
    readonly sourceId: string;
    readonly sourceFamily: SourceFamily;
    readonly sourceUrl: string;
    readonly contentSha256: string;
    readonly locator: string;
    readonly excerpt: string;
  };
  readonly comparator: EducationCriterionComparator;
  readonly applicantFact: {
    readonly key: string;
    readonly valueType: AuthorizedProjectFact["valueType"];
    readonly assertionId: string;
    readonly assertionVersion: number;
  };
  readonly applicability: {
    readonly status: "APPLIES" | "UNKNOWN" | "NOT_APPLICABLE";
  };
  readonly review: {
    /** This caller-provided status is only a request; the injected authority decides trust. */
    readonly status: "APPROVED" | "PROPOSED";
    readonly reviewId: string;
    readonly revision: string;
  };
}

export interface TrustedEducationCriterionApproval {
  readonly status: "APPROVED";
  readonly reviewId: string;
  readonly revision: string;
  readonly reviewerId: string;
  readonly reviewedAt: string;
  /** Digest of the exact rule, comparator, applicant fact and evidence binding. */
  readonly bindingSha256: string;
}

/** Offline injected trust boundary; no live review service is defined here. */
export interface EducationCriterionReviewAuthority {
  findApproval(input: {
    readonly reviewId: string;
    readonly revision: string;
  }): TrustedEducationCriterionApproval | undefined;
}

export type ComparisonOutcome =
  | "MATCHES"
  | "DOES_NOT_MATCH"
  | "UNKNOWN"
  | "NOT_APPLICABLE";

export type ComparisonReason =
  | "MISSING_STUDENT_FACT"
  | "MISSING_SCHOOL_RULE"
  | "UNREVIEWED_COMPARATOR"
  | "REVIEW_APPROVAL_MISSING"
  | "REVIEW_BINDING_MISMATCH"
  | "RULE_EVIDENCE_MISMATCH"
  | "NUMERIC_RULE_NOT_GROUNDED"
  | "INVALID_REVIEWED_COMPARATOR"
  | "UNKNOWN_APPLICABILITY"
  | "NOT_APPLICABLE_NOT_SUPPORTED"
  | "SUPPORTED_NOT_APPLICABLE"
  | "UNKNOWN_SCHOOL_DATA"
  | "STALE_SCHOOL_SOURCE"
  | "CONFLICTED_SCHOOL_SOURCE"
  | "WITHDRAWN_SCHOOL_SOURCE"
  | "SCHOOL_RULE_NOT_APPLICABLE"
  | "INCOMPATIBLE_SOURCE_AUTHORITY"
  | "SCHOOL_SOURCE_REFERENCE_MISMATCH"
  | "UNSAFE_SCHOOL_VALUE"
  | "MISSING_OR_UNAUTHORIZED_STUDENT_FACT"
  | "STALE_STUDENT_FACT"
  | "FACT_NOT_CURRENT"
  | "INCOMPATIBLE_FACT_TYPE"
  | "INCOMPATIBLE_UNITS"
  | "UNSUPPORTED_CALENDAR_DATE_SEMANTICS"
  | "INCOMPATIBLE_MONEY_SCOPE"
  | "UNKNOWN_DATA";

export interface ApplicantFactReference {
  readonly assertionId: string;
  readonly assertionVersion: number;
  readonly key: string;
  readonly valueType: AuthorizedProjectFact["valueType"];
  readonly verificationLabel: "customer-confirmed; not independently verified";
}

export interface EducationCriterionComparison {
  readonly criterionId: string;
  readonly outcome: ComparisonOutcome;
  readonly reasons: readonly ComparisonReason[];
  readonly comparator?: EducationCriterionComparator;
  readonly review?: {
    readonly reviewId: string;
    readonly revision: string;
    readonly reviewerId: string;
    readonly reviewedAt: string;
    readonly bindingSha256: string;
  };
  readonly schoolReference?: EducationReadSourceReference;
  readonly applicantFactReference?: ApplicantFactReference;
  readonly humanReviewRequired: true;
  readonly noEligibilitySignal: true;
}

function trace(input: {
  criterionId: string;
  outcome: ComparisonOutcome;
  reasons: readonly ComparisonReason[];
  criterion?: ReviewedEducationCriterion;
  approval?: TrustedEducationCriterionApproval;
  schoolReference?: EducationReadSourceReference;
  fact?: AuthorizedProjectFact;
}): EducationCriterionComparison {
  return {
    criterionId: input.criterionId,
    outcome: input.outcome,
    reasons: input.reasons,
    ...(input.criterion && input.approval
      ? { comparator: input.criterion.comparator }
      : {}),
    ...(input.criterion && input.approval
      ? {
          review: {
            reviewId: input.approval.reviewId,
            revision: input.approval.revision,
            reviewerId: input.approval.reviewerId,
            reviewedAt: input.approval.reviewedAt,
            bindingSha256: input.approval.bindingSha256,
          },
        }
      : {}),
    ...(input.schoolReference
      ? { schoolReference: input.schoolReference }
      : {}),
    ...(input.fact
      ? {
          applicantFactReference: {
            assertionId: input.fact.assertionId,
            assertionVersion: input.fact.assertionVersion,
            key: input.fact.key,
            valueType: input.fact.valueType,
            verificationLabel:
              "customer-confirmed; not independently verified" as const,
          },
        }
      : {}),
    humanReviewRequired: true,
    noEligibilitySignal: true,
  };
}

export function missingReviewedRule(input: {
  readonly criterionId: string;
  readonly schoolReference?: EducationReadSourceReference;
}): EducationCriterionComparison {
  return trace({
    criterionId: input.criterionId,
    outcome: "UNKNOWN",
    reasons: ["MISSING_SCHOOL_RULE"],
    schoolReference: input.schoolReference,
  });
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

function validZonedTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function factCalendarDate(value: unknown): string | undefined {
  return validDate(value) ? value : undefined;
}

function safeIdentifier(value: unknown, max = 128): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    value.trim() === value &&
    !hasControlCharacters(value)
  );
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeExcerpt(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096 &&
    !hasControlCharacters(value) &&
    !/[<>]/u.test(value)
  );
}

function validRuleEvidence(
  value: unknown
): value is ReviewedEducationCriterion["ruleEvidence"] {
  if (!isRecord(value)) {
    return false;
  }
  return (
    safeIdentifier(value.observationId) &&
    safeIdentifier(value.snapshotId) &&
    safeIdentifier(value.sourceId) &&
    ["CRICOS", "STUDY_AUSTRALIA", "INSTITUTION"].includes(
      value.sourceFamily as string
    ) &&
    typeof value.sourceUrl === "string" &&
    value.sourceUrl.startsWith("https://") &&
    value.sourceUrl.length <= 2048 &&
    /^[a-f0-9]{64}$/u.test(String(value.contentSha256)) &&
    safeIdentifier(value.locator, 512) &&
    safeExcerpt(value.excerpt)
  );
}

function validCriterion(value: unknown): value is ReviewedEducationCriterion {
  if (!isRecord(value)) {
    return false;
  }
  const schoolField = isRecord(value.schoolField)
    ? value.schoolField
    : undefined;
  const target =
    isRecord(value.schoolField) && isRecord(value.schoolField.target)
      ? value.schoolField.target
      : undefined;
  const applicantFact = isRecord(value.applicantFact)
    ? value.applicantFact
    : undefined;
  const applicability = isRecord(value.applicability)
    ? value.applicability
    : undefined;
  const review = isRecord(value.review) ? value.review : undefined;
  if (
    !target ||
    !applicantFact ||
    !applicability ||
    !review ||
    !safeIdentifier(value.criterionId) ||
    !safeIdentifier(target.id) ||
    !["PROVIDER", "COURSE", "DELIVERY", "INTAKE"].includes(
      target.type as string
    ) ||
    !schoolField ||
    !safeIdentifier(schoolField.observationId) ||
    !safeIdentifier(schoolField.snapshotId) ||
    typeof schoolField.fieldKey !== "string" ||
    !Object.hasOwn(FIELD_DEFINITIONS, schoolField.fieldKey) ||
    !FIELD_DEFINITIONS[schoolField.fieldKey as FieldKey]?.entityTypes.includes(
      target.type as EducationEntityType
    ) ||
    !validRuleEvidence(value.ruleEvidence) ||
    typeof applicantFact.key !== "string" ||
    !/^[a-z][a-z0-9_.-]{0,127}$/u.test(applicantFact.key) ||
    !safeIdentifier(applicantFact.assertionId) ||
    !Number.isSafeInteger(applicantFact.assertionVersion) ||
    (applicantFact.assertionVersion as number) < 1 ||
    !["string", "number", "boolean", "date", "json"].includes(
      applicantFact.valueType as string
    ) ||
    !["APPLIES", "UNKNOWN", "NOT_APPLICABLE"].includes(
      applicability.status as string
    ) ||
    !["APPROVED", "PROPOSED"].includes(review.status as string) ||
    !safeIdentifier(review.reviewId) ||
    !safeIdentifier(review.revision, 64)
  ) {
    return false;
  }
  if (!isRecord(value.comparator)) {
    return false;
  }
  const comparator = value.comparator as EducationCriterionComparator;
  switch (comparator?.kind) {
    case "NUMBER_MINIMUM":
    case "NUMBER_MAXIMUM":
      return (
        Number.isFinite(comparator.threshold) &&
        safeIdentifier(comparator.unit, 32)
      );
    case "NUMBER_RANGE":
      return (
        Number.isFinite(comparator.minimum) &&
        Number.isFinite(comparator.maximum) &&
        comparator.minimum <= comparator.maximum &&
        safeIdentifier(comparator.unit, 32)
      );
    case "TEXT_EQUALS":
      return (
        typeof comparator.expected === "string" &&
        comparator.expected.length > 0 &&
        comparator.expected.length <= 256 &&
        !/[<>]/u.test(comparator.expected) &&
        !hasControlCharacters(comparator.expected)
      );
    case "BOOLEAN_EQUALS":
      return typeof comparator.expected === "boolean";
    case "DATE_EQUALS":
      return validDate(comparator.expected);
    case "DATE_ON_OR_BEFORE":
      return validDate(comparator.latest);
    case "SCHOOL_FEE_WITHIN_BUDGET":
      return true;
    default:
      return false;
  }
}

export function isReviewedEducationCriterion(
  value: unknown
): value is ReviewedEducationCriterion {
  return validCriterion(value);
}

function canonicalReviewBinding(criterion: ReviewedEducationCriterion): string {
  const fixed = {
    schema: "education.reviewed-criterion-binding.v1",
    criterionId: criterion.criterionId,
    schoolField: criterion.schoolField,
    ruleEvidence: criterion.ruleEvidence,
    comparator: criterion.comparator,
    applicantFact: {
      key: criterion.applicantFact.key,
      valueType: criterion.applicantFact.valueType,
    },
    applicability: criterion.applicability,
    review: {
      reviewId: criterion.review.reviewId,
      revision: criterion.review.revision,
    },
  };
  return canonicalJson(fixed);
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("invalid_review_binding_number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("invalid_review_binding_value");
}

export function computeEducationCriterionBindingSha256(
  criterion: ReviewedEducationCriterion
): string {
  return createHash("sha256")
    .update(canonicalReviewBinding(criterion), "utf8")
    .digest("hex");
}

function compareSourceDate(
  value: string,
  assessedAt: string,
  assessmentDate: string
): -1 | 0 | 1 | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!validDate(value)) {
      return null;
    }
    if (value < assessmentDate) {
      return -1;
    }
    if (value > assessmentDate) {
      return 1;
    }
    return 0;
  }
  if (!validZonedTimestamp(value)) {
    return null;
  }
  const timestamp = Date.parse(value);
  const assessed = Date.parse(assessedAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(assessed)) {
    return null;
  }
  if (timestamp < assessed) {
    return -1;
  }
  if (timestamp > assessed) {
    return 1;
  }
  return 0;
}

function factCurrent(
  fact: AuthorizedProjectFact,
  options: ResolveFieldOptions
): ComparisonReason | undefined {
  if (
    fact.state !== "customer_confirmed" ||
    fact.stale ||
    !fact.confirmedByUserId ||
    (fact.originKind !== "customer_stated" &&
      fact.originKind !== "document_extracted")
  ) {
    return "MISSING_OR_UNAUTHORIZED_STUDENT_FACT";
  }
  for (const [date, isStart] of [
    [fact.effectiveFrom, true],
    [fact.effectiveTo, false],
  ] as const) {
    if (date === null) {
      continue;
    }
    if (typeof date !== "string") {
      return "FACT_NOT_CURRENT";
    }
    const comparison = compareSourceDate(
      date,
      options.assessedAt,
      options.assessmentDate
    );
    if (comparison === null) {
      return "FACT_NOT_CURRENT";
    }
    if ((isStart && comparison > 0) || (!isStart && comparison < 0)) {
      return "FACT_NOT_CURRENT";
    }
  }
  if (
    fact.observedAt !== null &&
    (!validZonedTimestamp(fact.observedAt) ||
      Date.parse(fact.observedAt) > Date.parse(options.assessedAt))
  ) {
    return "FACT_NOT_CURRENT";
  }
  return undefined;
}

function applicantFactValueCompatible(
  fact: AuthorizedProjectFact,
  comparator: EducationCriterionComparator
):
  | { readonly value: string | number | boolean | Record<string, unknown> }
  | { readonly reason: ComparisonReason } {
  switch (comparator.kind) {
    case "NUMBER_MINIMUM":
    case "NUMBER_MAXIMUM":
    case "NUMBER_RANGE": {
      if (fact.valueType !== "json") {
        return { reason: "INCOMPATIBLE_FACT_TYPE" };
      }
      const value = fact.value;
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        !Object.hasOwn(value, "value") ||
        !Object.hasOwn(value, "unit")
      ) {
        return { reason: "UNKNOWN_DATA" };
      }
      const quantity = value as Record<string, unknown>;
      if (
        typeof quantity.value !== "number" ||
        !Number.isFinite(quantity.value) ||
        typeof quantity.unit !== "string"
      ) {
        return { reason: "UNKNOWN_DATA" };
      }
      if (quantity.unit !== comparator.unit) {
        return { reason: "INCOMPATIBLE_UNITS" };
      }
      return { value: quantity };
    }
    case "TEXT_EQUALS":
      return fact.valueType === "string" && typeof fact.value === "string"
        ? { value: fact.value }
        : { reason: "INCOMPATIBLE_FACT_TYPE" };
    case "BOOLEAN_EQUALS":
      return fact.valueType === "boolean" && typeof fact.value === "boolean"
        ? { value: fact.value }
        : { reason: "INCOMPATIBLE_FACT_TYPE" };
    case "DATE_EQUALS":
    case "DATE_ON_OR_BEFORE": {
      if (fact.valueType !== "date") {
        return { reason: "INCOMPATIBLE_FACT_TYPE" };
      }
      const date = factCalendarDate(fact.value);
      return date
        ? { value: date }
        : {
            reason: validZonedTimestamp(fact.value)
              ? "UNSUPPORTED_CALENDAR_DATE_SEMANTICS"
              : "INCOMPATIBLE_FACT_TYPE",
          };
    }
    case "SCHOOL_FEE_WITHIN_BUDGET":
      return fact.valueType === "json" &&
        typeof fact.value === "object" &&
        fact.value !== null &&
        !Array.isArray(fact.value)
        ? { value: fact.value as Record<string, unknown> }
        : { reason: "INCOMPATIBLE_FACT_TYPE" };
    default:
      return { reason: "UNKNOWN_DATA" };
  }
}

function compareMoneyWithBudget(
  school: Extract<EducationFieldValue, { readonly kind: "money" }>,
  budget: Record<string, unknown>
): {
  readonly outcome?: "MATCHES" | "DOES_NOT_MATCH";
  readonly reason?: ComparisonReason;
} {
  if (
    budget.kind !== "money" ||
    typeof budget.amount !== "number" ||
    !Number.isFinite(budget.amount) ||
    typeof budget.currency !== "string" ||
    typeof budget.audience !== "string" ||
    typeof budget.basis !== "string" ||
    !Number.isSafeInteger(budget.year) ||
    !Array.isArray(budget.inclusions) ||
    budget.inclusions.some((item) => typeof item !== "string")
  ) {
    return { reason: "UNKNOWN_DATA" };
  }
  const schoolCurrency = school.currency?.toUpperCase();
  const budgetCurrency = budget.currency.toUpperCase();
  const schoolInclusions = [...(school.inclusions ?? [])].sort();
  const budgetInclusions = Array.isArray(budget.inclusions)
    ? budget.inclusions
        .filter((item): item is string => typeof item === "string")
        .sort()
    : [];
  const dimensionsMatch =
    schoolCurrency !== undefined &&
    schoolCurrency === budgetCurrency &&
    school.audience !== undefined &&
    school.audience === budget.audience &&
    school.basis !== undefined &&
    school.basis === budget.basis &&
    school.year !== undefined &&
    school.year === budget.year &&
    school.period === budget.period &&
    school.inclusions !== undefined &&
    JSON.stringify(schoolInclusions) === JSON.stringify(budgetInclusions);
  if (!dimensionsMatch) {
    return { reason: "INCOMPATIBLE_MONEY_SCOPE" };
  }
  return {
    outcome: school.amount <= budget.amount ? "MATCHES" : "DOES_NOT_MATCH",
  };
}

function compareValues(
  comparator: EducationCriterionComparator,
  schoolValue: EducationFieldValue,
  applicantValue: string | number | boolean | Record<string, unknown>
): {
  readonly outcome?: "MATCHES" | "DOES_NOT_MATCH";
  readonly reason?: ComparisonReason;
} {
  switch (comparator.kind) {
    case "NUMBER_MINIMUM":
    case "NUMBER_MAXIMUM":
    case "NUMBER_RANGE": {
      if (typeof applicantValue !== "object" || Array.isArray(applicantValue)) {
        return { reason: "UNKNOWN_DATA" };
      }
      if (typeof applicantValue.value !== "number") {
        return { reason: "UNKNOWN_DATA" };
      }
      const score = applicantValue.value;
      const matches =
        comparator.kind === "NUMBER_MINIMUM"
          ? score >= comparator.threshold
          : comparator.kind === "NUMBER_MAXIMUM"
            ? score <= comparator.threshold
            : score >= comparator.minimum && score <= comparator.maximum;
      return { outcome: matches ? "MATCHES" : "DOES_NOT_MATCH" };
    }
    case "TEXT_EQUALS":
      if (schoolValue.kind !== "text" || typeof applicantValue !== "string") {
        return { reason: "INCOMPATIBLE_FACT_TYPE" };
      }
      return {
        outcome:
          schoolValue.value.normalize("NFC").trim() ===
            comparator.expected.normalize("NFC").trim() &&
          applicantValue.normalize("NFC").trim() ===
            comparator.expected.normalize("NFC").trim()
            ? "MATCHES"
            : "DOES_NOT_MATCH",
      };
    case "BOOLEAN_EQUALS":
      return schoolValue.kind === "boolean" &&
        schoolValue.value === comparator.expected &&
        typeof applicantValue === "boolean"
        ? {
            outcome:
              applicantValue === comparator.expected
                ? "MATCHES"
                : "DOES_NOT_MATCH",
          }
        : { reason: "INCOMPATIBLE_FACT_TYPE" };
    case "DATE_EQUALS": {
      if (schoolValue.kind !== "date" || typeof applicantValue !== "string") {
        return { reason: "INCOMPATIBLE_FACT_TYPE" };
      }
      const schoolDate = factCalendarDate(schoolValue.value);
      if (!schoolDate) {
        return {
          reason: validZonedTimestamp(schoolValue.value)
            ? "UNSUPPORTED_CALENDAR_DATE_SEMANTICS"
            : "INCOMPATIBLE_FACT_TYPE",
        };
      }
      return {
        outcome:
          schoolDate === comparator.expected &&
          factCalendarDate(applicantValue) === comparator.expected
            ? "MATCHES"
            : "DOES_NOT_MATCH",
      };
    }
    case "DATE_ON_OR_BEFORE": {
      if (schoolValue.kind !== "date" || typeof applicantValue !== "string") {
        return { reason: "INCOMPATIBLE_FACT_TYPE" };
      }
      const schoolDate = factCalendarDate(schoolValue.value);
      if (!schoolDate) {
        return {
          reason: validZonedTimestamp(schoolValue.value)
            ? "UNSUPPORTED_CALENDAR_DATE_SEMANTICS"
            : "INCOMPATIBLE_FACT_TYPE",
        };
      }
      const applicantDate = factCalendarDate(applicantValue);
      if (!applicantDate) {
        return {
          reason: validZonedTimestamp(applicantValue)
            ? "UNSUPPORTED_CALENDAR_DATE_SEMANTICS"
            : "INCOMPATIBLE_FACT_TYPE",
        };
      }
      return {
        outcome:
          schoolDate === comparator.latest && applicantDate <= comparator.latest
            ? "MATCHES"
            : "DOES_NOT_MATCH",
      };
    }
    case "SCHOOL_FEE_WITHIN_BUDGET":
      return schoolValue.kind === "money" && typeof applicantValue === "object"
        ? compareMoneyWithBudget(schoolValue, applicantValue)
        : { reason: "INCOMPATIBLE_FACT_TYPE" };
    default:
      return { reason: "UNKNOWN_DATA" };
  }
}

function statusReason(status: string): ComparisonReason {
  switch (status) {
    case "STALE":
      return "STALE_SCHOOL_SOURCE";
    case "CONFLICTED":
      return "CONFLICTED_SCHOOL_SOURCE";
    case "WITHDRAWN":
      return "WITHDRAWN_SCHOOL_SOURCE";
    case "NOT_APPLICABLE":
      return "SCHOOL_RULE_NOT_APPLICABLE";
    default:
      return "UNKNOWN_SCHOOL_DATA";
  }
}

function matchingSourceReference(input: {
  dataset: EducationDataset;
  criterion: ReviewedEducationCriterion;
  options: ResolveFieldOptions;
}): {
  readonly reference?: EducationReadSourceReference;
  readonly reason?: ComparisonReason;
  readonly resolvedValue?: EducationFieldValue;
  readonly notApplicableSupported?: boolean;
} {
  const { dataset, criterion } = input;
  const observation = dataset.observations.find(
    (item) => item.observationId === criterion.schoolField.observationId
  );
  const snapshot = dataset.snapshots.find(
    (item) => item.snapshotId === criterion.schoolField.snapshotId
  );
  const source =
    observation &&
    dataset.sources.find(
      (item) => item.sourceId === observation.provenance.sourceId
    );
  if (
    !observation ||
    !snapshot ||
    !source ||
    observation.provenance.snapshotId !== snapshot.snapshotId ||
    observation.provenance.sourceId !== snapshot.sourceId ||
    observation.target.type !== criterion.schoolField.target.type ||
    observation.target.id !== criterion.schoolField.target.id ||
    observation.fieldKey !== criterion.schoolField.fieldKey
  ) {
    return { reason: "SCHOOL_SOURCE_REFERENCE_MISMATCH" };
  }
  const evidence = criterion.ruleEvidence;
  if (
    evidence.observationId !== observation.observationId ||
    evidence.snapshotId !== snapshot.snapshotId ||
    evidence.sourceId !== source.sourceId ||
    evidence.sourceFamily !== source.sourceFamily ||
    evidence.sourceUrl !== observation.provenance.sourceUrl ||
    evidence.sourceUrl !== snapshot.sourceUrl ||
    evidence.contentSha256 !== observation.provenance.contentSha256 ||
    evidence.contentSha256 !== snapshot.contentSha256 ||
    evidence.locator !== observation.provenance.locator ||
    evidence.excerpt !== observation.provenance.excerpt ||
    observation.recordClass !== source.recordClass ||
    snapshot.recordClass !== source.recordClass
  ) {
    return { reason: "RULE_EVIDENCE_MISMATCH" };
  }
  const sourceReference: EducationReadSourceReference = {
    observationId: observation.observationId,
    sourceId: source.sourceId,
    snapshotId: snapshot.snapshotId,
    sourceFamily: source.sourceFamily,
    sourceUrl: observation.provenance.sourceUrl,
    contentSha256: observation.provenance.contentSha256,
    locator: observation.provenance.locator,
    authorityRole:
      source.sourceFamily === "CRICOS"
        ? "CRICOS_REGISTRATION_ONLY"
        : source.sourceFamily === "STUDY_AUSTRALIA"
          ? "GOVERNMENT_DISCOVERY_ONLY"
          : "INSTITUTION_CLAIM_UNVERIFIED",
    recordClass: source.recordClass,
  };
  if (
    source.sourceFamily !== "INSTITUTION" ||
    !FIELD_DEFINITIONS[criterion.schoolField.fieldKey].claimDomain.startsWith(
      "INSTITUTION_"
    )
  ) {
    return {
      reference: sourceReference,
      reason: "INCOMPATIBLE_SOURCE_AUTHORITY",
    };
  }
  if (
    isNumericComparator(criterion.comparator) &&
    criterion.schoolField.fieldKey === "COURSE_ADMISSIONS_CRITERIA" &&
    !snapshot.contentExcerpt?.includes(evidence.excerpt)
  ) {
    return { reference: sourceReference, reason: "RULE_EVIDENCE_MISMATCH" };
  }
  let resolution: EducationFieldResolution;
  try {
    resolution = resolveEducationField(
      dataset,
      criterion.schoolField.target,
      criterion.schoolField.fieldKey,
      input.options
    );
  } catch {
    return { reference: sourceReference, reason: "UNKNOWN_SCHOOL_DATA" };
  }
  if (resolution.status !== "KNOWN") {
    if (
      resolution.status === "NOT_APPLICABLE" &&
      criterion.applicability.status === "NOT_APPLICABLE" &&
      observation.disposition === "NOT_APPLICABLE" &&
      resolution.history.some(
        (item) => item.observationId === observation.observationId
      )
    ) {
      return {
        reference: sourceReference,
        notApplicableSupported: true,
      };
    }
    return {
      reference: sourceReference,
      reason:
        resolution.status === "NOT_APPLICABLE" &&
        criterion.applicability.status === "NOT_APPLICABLE"
          ? "NOT_APPLICABLE_NOT_SUPPORTED"
          : statusReason(resolution.status),
    };
  }
  if (
    observation.disposition !== "ASSERTION" ||
    snapshot.acquisitionOutcome !== "CAPTURED" ||
    !resolution.history.some(
      (item) => item.observationId === observation.observationId
    ) ||
    !resolution.sourceRefs.some(
      (item) => item.observationId === observation.observationId
    )
  ) {
    return {
      reference: sourceReference,
      reason: "SCHOOL_SOURCE_REFERENCE_MISMATCH",
    };
  }
  const resolvedValue = resolution.resolvedValue;
  if (!resolvedValue) {
    return { reference: sourceReference, reason: "UNKNOWN_SCHOOL_DATA" };
  }
  if (JSON.stringify(resolvedValue) !== JSON.stringify(observation.value)) {
    return {
      reference: sourceReference,
      reason: "SCHOOL_SOURCE_REFERENCE_MISMATCH",
    };
  }
  return { reference: sourceReference, resolvedValue };
}

function factReferenceValid(
  fact: AuthorizedProjectFact,
  criterion: ReviewedEducationCriterion
): boolean {
  return (
    fact.key === criterion.applicantFact.key &&
    fact.valueType === criterion.applicantFact.valueType &&
    fact.assertionId === criterion.applicantFact.assertionId &&
    Number.isSafeInteger(fact.assertionVersion) &&
    fact.assertionVersion === criterion.applicantFact.assertionVersion
  );
}

export function compareReviewedEducationCriterion(input: {
  readonly dataset: EducationDataset;
  readonly criterion: ReviewedEducationCriterion;
  readonly reviewAuthority: EducationCriterionReviewAuthority;
  /** Must be the current stableProjection().authorizedForAI list only. */
  readonly authorizedFacts: readonly AuthorizedProjectFact[];
  readonly assessedAt: string;
  readonly assessmentDate: string;
  readonly maxAgeMsByField?: ResolveFieldOptions["maxAgeMsByField"];
}): EducationCriterionComparison {
  const candidate: unknown = input.criterion;
  const criterion = input.criterion;
  if (!validCriterion(criterion)) {
    return trace({
      criterionId:
        isRecord(candidate) && safeIdentifier(candidate.criterionId)
          ? candidate.criterionId
          : "invalid-reviewed-criterion",
      outcome: "UNKNOWN",
      reasons: ["INVALID_REVIEWED_COMPARATOR"],
    });
  }
  if (criterion.review.status !== "APPROVED") {
    return trace({
      criterionId: criterion.criterionId,
      outcome: "UNKNOWN",
      reasons: ["UNREVIEWED_COMPARATOR"],
    });
  }
  const options: ResolveFieldOptions = {
    assessedAt: input.assessedAt,
    assessmentDate: input.assessmentDate,
    ...(input.maxAgeMsByField
      ? { maxAgeMsByField: input.maxAgeMsByField }
      : {}),
  };
  const source = matchingSourceReference({
    dataset: input.dataset,
    criterion,
    options,
  });
  if (source.reason) {
    return trace({
      criterionId: criterion.criterionId,
      outcome: "UNKNOWN",
      reasons: [source.reason],
      ...(source.reference ? { schoolReference: source.reference } : {}),
    });
  }
  if (
    isNumericComparator(criterion.comparator) &&
    criterion.schoolField.fieldKey !== "COURSE_ADMISSIONS_CRITERIA"
  ) {
    return trace({
      criterionId: criterion.criterionId,
      outcome: "UNKNOWN",
      reasons: ["NUMERIC_RULE_NOT_GROUNDED"],
      ...(source.reference ? { schoolReference: source.reference } : {}),
    });
  }
  let approval: TrustedEducationCriterionApproval | undefined;
  try {
    approval = input.reviewAuthority?.findApproval({
      reviewId: criterion.review.reviewId,
      revision: criterion.review.revision,
    });
  } catch {
    approval = undefined;
  }
  if (!validTrustedApproval(approval, criterion, input.assessedAt)) {
    return trace({
      criterionId: criterion.criterionId,
      outcome: "UNKNOWN",
      reasons: approval
        ? ["REVIEW_BINDING_MISMATCH"]
        : ["REVIEW_APPROVAL_MISSING"],
      ...(source.reference ? { schoolReference: source.reference } : {}),
    });
  }
  let expectedBinding: string;
  try {
    expectedBinding = computeEducationCriterionBindingSha256(criterion);
  } catch {
    return trace({
      criterionId: criterion.criterionId,
      outcome: "UNKNOWN",
      reasons: ["INVALID_REVIEWED_COMPARATOR"],
      ...(source.reference ? { schoolReference: source.reference } : {}),
    });
  }
  if (approval.bindingSha256 !== expectedBinding) {
    return trace({
      criterionId: criterion.criterionId,
      outcome: "UNKNOWN",
      reasons: ["REVIEW_BINDING_MISMATCH"],
      ...(source.reference ? { schoolReference: source.reference } : {}),
    });
  }
  const approvedTrace = (traceInput: {
    outcome: ComparisonOutcome;
    reasons: readonly ComparisonReason[];
    schoolReference?: EducationReadSourceReference;
    fact?: AuthorizedProjectFact;
  }) =>
    trace({
      criterionId: criterion.criterionId,
      criterion,
      approval,
      ...traceInput,
    });
  if (source.notApplicableSupported) {
    return approvedTrace({
      outcome: "NOT_APPLICABLE",
      reasons: ["SUPPORTED_NOT_APPLICABLE"],
      ...(source.reference ? { schoolReference: source.reference } : {}),
    });
  }
  if (!source.resolvedValue || !source.reference) {
    return approvedTrace({
      outcome: "UNKNOWN",
      reasons: [source.reason ?? "UNKNOWN_SCHOOL_DATA"],
      ...(source.reference ? { schoolReference: source.reference } : {}),
    });
  }
  if (criterion.applicability.status !== "APPLIES") {
    return approvedTrace({
      outcome: "UNKNOWN",
      reasons: [
        criterion.applicability.status === "NOT_APPLICABLE"
          ? "NOT_APPLICABLE_NOT_SUPPORTED"
          : "UNKNOWN_APPLICABILITY",
      ],
      schoolReference: source.reference,
    });
  }
  const found = input.authorizedFacts.filter(
    (fact) =>
      fact.assertionId === criterion.applicantFact.assertionId &&
      fact.assertionVersion === criterion.applicantFact.assertionVersion
  );
  if (found.length === 0) {
    const sameKeyFactExists = input.authorizedFacts.some(
      (fact) => fact.key === criterion.applicantFact.key
    );
    return approvedTrace({
      outcome: "UNKNOWN",
      reasons: [
        sameKeyFactExists
          ? "MISSING_OR_UNAUTHORIZED_STUDENT_FACT"
          : "MISSING_STUDENT_FACT",
      ],
      schoolReference: source.reference,
    });
  }
  if (found.length !== 1 || !factReferenceValid(found[0], criterion)) {
    return approvedTrace({
      outcome: "UNKNOWN",
      reasons: ["MISSING_OR_UNAUTHORIZED_STUDENT_FACT"],
      schoolReference: source.reference,
    });
  }
  const fact = found[0];
  const currentReason = factCurrent(fact, options);
  if (currentReason) {
    return approvedTrace({
      outcome: "UNKNOWN",
      reasons: [currentReason],
      schoolReference: source.reference,
    });
  }
  const compatible = applicantFactValueCompatible(fact, criterion.comparator);
  if ("reason" in compatible) {
    return approvedTrace({
      outcome: "UNKNOWN",
      reasons: [compatible.reason],
      schoolReference: source.reference,
      fact,
    });
  }
  const result = compareValues(
    criterion.comparator,
    source.resolvedValue,
    compatible.value
  );
  if (result.reason || !result.outcome) {
    return trace({
      criterionId: criterion.criterionId,
      outcome: "UNKNOWN",
      reasons: [result.reason ?? "UNKNOWN_DATA"],
      criterion,
      schoolReference: source.reference,
      fact,
    });
  }
  return approvedTrace({
    outcome: result.outcome,
    reasons: [],
    schoolReference: source.reference,
    fact,
  });
}

function isNumericComparator(
  comparator: EducationCriterionComparator
): comparator is Extract<
  EducationCriterionComparator,
  { readonly kind: "NUMBER_MINIMUM" | "NUMBER_MAXIMUM" | "NUMBER_RANGE" }
> {
  return ["NUMBER_MINIMUM", "NUMBER_MAXIMUM", "NUMBER_RANGE"].includes(
    comparator.kind
  );
}

function validTrustedApproval(
  value: TrustedEducationCriterionApproval | undefined,
  criterion: ReviewedEducationCriterion,
  assessedAt: string
): value is TrustedEducationCriterionApproval {
  return Boolean(
    value &&
      value.status === "APPROVED" &&
      value.reviewId === criterion.review.reviewId &&
      value.revision === criterion.review.revision &&
      safeIdentifier(value.reviewerId) &&
      validZonedTimestamp(value.reviewedAt) &&
      Date.parse(value.reviewedAt) <= Date.parse(assessedAt) &&
      /^[a-f0-9]{64}$/u.test(value.bindingSha256)
  );
}

/**
 * Convenience for callers with an exact field but no reviewed comparator.
 * Raw school prose is deliberately not accepted or parsed here.
 */
export function unknownUnstructuredSchoolRule(input: {
  readonly criterionId: string;
  readonly schoolReference?: EducationReadSourceReference;
}): EducationCriterionComparison {
  return missingReviewedRule(input);
}
