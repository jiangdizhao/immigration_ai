/**
 * Phase 14-B deterministic Project Fact extraction.
 *
 * This module reads **only** already-verified, already-issued Project Document evidence
 * candidates and proposes structured fields that the document states explicitly next to
 * an unambiguous label. It never invents a value, never guesses an identity, never
 * decides a legal rule, and never confirms anything: every draft stays
 * `document_extracted` + `proposed` until the customer confirms it.
 *
 * Deterministic label parsing is legitimate here (syntax/locator mechanics, not legal
 * semantics). A value that is not literally present next to a recognised label is never
 * produced.
 */

export const PROJECT_FACT_EXTRACTION_VERSION = "phase14b.labelled_fields.v1";

export type ProjectFactDocumentKind = "coe" | "oshc" | "visa" | "unknown";

/**
 * Minimal structural input: one already-verified evidence unit. Declared here (instead of
 * importing the Project Document evidence module) so fact extraction has no dependency on
 * the document pipeline — and so the document trust boundary stays encapsulated.
 */
export type ProjectEvidenceUnitInput = {
  ordinal: number;
  locator: { kind: string } & Record<string, unknown>;
  excerpt: string;
};

export type ProjectFactCandidateDraft = {
  key: string;
  valueType: "string" | "date";
  value: string;
  originKind: "document_extracted";
  sourceEvidenceRef: string;
  /** Deliberately null: a document's own date is never fabricated from "now". */
  observedAt: null;
  effectiveFrom: null;
  effectiveTo: null;
  /** Extraction never supersedes an earlier assertion automatically. */
  supersedesAssertionId: null;
  documentKind: ProjectFactDocumentKind;
  evidenceOrdinal: number;
  evidenceLocatorKind: string;
  matchKind: "explicit_label";
  /** True when a different value already exists for this key (never overwritten here). */
  conflictsWithExisting: boolean;
};

export type ProjectFactExtractionConflict = {
  key: string;
  existingAssertionId: string;
  existingValue: unknown;
  proposedValue: string;
  sourceEvidenceRef: string;
};

export type ProjectFactExtractionResult = {
  extractionVersion: string;
  drafts: ProjectFactCandidateDraft[];
  conflicts: ProjectFactExtractionConflict[];
  /** Drafts skipped because the same value is already recorded for that key. */
  duplicatesSkipped: number;
  /** Units that produced no labelled field. */
  unitsWithoutFields: number;
  documentKinds: ProjectFactDocumentKind[];
};

export type ExistingFactForExtraction = {
  assertionId: string;
  key: string;
  value: unknown;
  state: string;
};

export const MAX_EXTRACTION_DRAFTS = 40;
export const MAX_SCANNED_UNITS = 200;

const MAX_NAME_CHARS = 120;
const MAX_SHORT_VALUE_CHARS = 160;
const MAX_CONDITIONS_CHARS = 240;

const DOCUMENT_MARKERS: Array<{
  kind: ProjectFactDocumentKind;
  patterns: RegExp[];
}> = [
  {
    kind: "coe",
    patterns: [
      /confirmation\s+of\s+enrolment\b/iu,
      /electronic\s+confirmation\s+of\s+enrolment/iu,
      /\bcoe\b/iu,
    ],
  },
  {
    kind: "oshc",
    patterns: [
      /overseas\s+student\s+health\s+cover/iu,
      /overseas\s+student\s+health\s+insurance/iu,
      /\boshc\b/iu,
    ],
  },
  {
    kind: "visa",
    patterns: [
      /visa\s+grant\s+notice/iu,
      /grant\s+of\s+(?:a\s+)?visa/iu,
      /visa\s+conditions?\b/iu,
      /subclass\s+\d{3}/iu,
    ],
  },
];

type FieldRule = {
  key: string;
  valueType: "string" | "date";
  kinds: ProjectFactDocumentKind[];
  labels: string[];
  pattern: RegExp;
  validate: (value: string) => string | null;
};

function cleanValue(raw: string, maxChars: number): string | null {
  const collapsed = raw
    .replace(/\s+/gu, " ")
    .replace(/[;,.\s]+$/u, "")
    .trim();
  if (collapsed.length < 2 || collapsed.length > maxChars) {
    return null;
  }
  // Reject placeholder markers that documents use for "not provided".
  if (/^(?:n\/?a|nil|none|not\s+applicable|-+)$/iu.test(collapsed)) {
    return null;
  }
  return collapsed;
}

function cleanName(raw: string): string | null {
  const value = cleanValue(raw, MAX_NAME_CHARS);
  if (!value) {
    return null;
  }
  // A label may be followed by other labelled fields on the same line.
  if (/[:\d]/u.test(value)) {
    return null;
  }
  return /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u.test(value) ? value : null;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string | null {
  if (
    !Number.isSafeInteger(year) ||
    year < 1900 ||
    year > 2200 ||
    !Number.isSafeInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isSafeInteger(day) ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

/**
 * Parse only unambiguous document date shapes. There is no locale guessing beyond these
 * explicit forms; anything else yields `null` so no fact is proposed at all.
 */
export function parseDocumentDate(raw: string): string | null {
  const value = raw.replace(/\s+/gu, " ").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (iso?.[1] && iso[2] && iso[3]) {
    return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const dayFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(value);
  if (dayFirst?.[1] && dayFirst[2] && dayFirst[3]) {
    const first = Number(dayFirst[1]);
    const second = Number(dayFirst[2]);
    // Australian documents are day-first; reject the ambiguous reading outright.
    if (second > 12 && first <= 12) {
      return null;
    }
    return isoDate(Number(dayFirst[3]), second, first);
  }
  const dayMonthName = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/u.exec(
    value
  );
  if (dayMonthName?.[1] && dayMonthName[2] && dayMonthName[3]) {
    const month = MONTHS[dayMonthName[2].toLowerCase()];
    return month
      ? isoDate(Number(dayMonthName[3]), month, Number(dayMonthName[1]))
      : null;
  }
  const monthNameDay = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/u.exec(
    value
  );
  if (monthNameDay?.[1] && monthNameDay[2] && monthNameDay[3]) {
    const month = MONTHS[monthNameDay[1].toLowerCase()];
    return month
      ? isoDate(Number(monthNameDay[3]), month, Number(monthNameDay[2]))
      : null;
  }
  return null;
}

function dateRuleValue(raw: string): string | null {
  return parseDocumentDate(raw.replace(/^(?:on|from|until|to)\s+/iu, ""));
}

function shortValue(raw: string): string | null {
  return cleanValue(raw, MAX_SHORT_VALUE_CHARS);
}

function rule(input: {
  key: string;
  valueType: "string" | "date";
  kinds: ProjectFactDocumentKind[];
  labels: string[];
  validate: (value: string) => string | null;
  valuePattern?: string;
}): FieldRule {
  return {
    key: input.key,
    valueType: input.valueType,
    kinds: input.kinds,
    labels: input.labels,
    validate: input.validate,
    pattern: new RegExp(
      `^(?:${input.labels.join("|")})\\s*[:\\-]\\s*${input.valuePattern ?? "(.+)"}$`,
      "imu"
    ),
  };
}

const RULES: FieldRule[] = [
  rule({
    key: "applicant.full_name",
    valueType: "string",
    kinds: ["coe", "oshc", "visa"],
    labels: ["student\\s+name", "applicant\\s+name", "student", "applicant"],
    validate: cleanName,
  }),
  rule({
    key: "applicant.date_of_birth",
    valueType: "date",
    kinds: ["coe", "oshc", "visa"],
    labels: ["date\\s+of\\s+birth", "d\\.?o\\.?b\\.?"],
    validate: dateRuleValue,
  }),
  rule({
    key: "study.school",
    valueType: "string",
    kinds: ["coe", "oshc"],
    labels: [
      "education\\s+provider",
      "provider\\s+name",
      "provider",
      "school",
      "institution",
      "university",
    ],
    validate: shortValue,
  }),
  rule({
    key: "study.course",
    valueType: "string",
    kinds: ["coe"],
    labels: ["course\\s+name", "course", "program(?:me)?"],
    validate: shortValue,
  }),
  rule({
    key: "study.campus",
    valueType: "string",
    kinds: ["coe"],
    labels: ["campus\\s+location", "campus", "study\\s+location"],
    validate: shortValue,
  }),
  rule({
    key: "study.course_start_date",
    valueType: "date",
    kinds: ["coe"],
    labels: [
      "course\\s+start\\s+date",
      "commencement\\s+date",
      "start\\s+date",
    ],
    validate: dateRuleValue,
  }),
  rule({
    key: "study.course_end_date",
    valueType: "date",
    kinds: ["coe"],
    labels: ["course\\s+end\\s+date", "completion\\s+date", "end\\s+date"],
    validate: dateRuleValue,
  }),
  rule({
    key: "study.coe_reference",
    valueType: "string",
    kinds: ["coe"],
    labels: [
      "coe\\s+(?:reference|number|id)",
      "confirmation\\s+of\\s+enrolment\\s+(?:reference|number)",
      "coe",
    ],
    validate: (value) => cleanValue(value, 32),
    valuePattern: "([A-Za-z0-9][A-Za-z0-9-]{4,31})",
  }),
  rule({
    key: "insurance.oshc_start_date",
    valueType: "date",
    kinds: ["oshc"],
    labels: [
      "oshc\\s+(?:start|commencement)\\s+date",
      "cover\\s+start\\s+date",
      "policy\\s+start\\s+date",
    ],
    validate: dateRuleValue,
  }),
  rule({
    key: "insurance.oshc_expiry_date",
    valueType: "date",
    kinds: ["oshc"],
    labels: [
      "oshc\\s+(?:expiry|end)\\s+date",
      "cover\\s+(?:expiry|end)\\s+date",
      "policy\\s+(?:expiry|end)\\s+date",
    ],
    validate: dateRuleValue,
  }),
  rule({
    key: "visa.category",
    valueType: "string",
    kinds: ["visa"],
    labels: ["visa\\s+(?:subclass|class|category)", "subclass"],
    validate: (value) => cleanValue(value, 80),
  }),
  rule({
    key: "visa.conditions",
    valueType: "string",
    kinds: ["visa"],
    labels: ["visa\\s+conditions?", "conditions?"],
    validate: (value) => cleanValue(value, MAX_CONDITIONS_CHARS),
  }),
  rule({
    key: "visa.expiry_date",
    valueType: "date",
    kinds: ["visa"],
    labels: [
      "visa\\s+expiry\\s+date",
      "visa\\s+expiry",
      "visa\\s+valid\\s+until",
      "must\\s+not\\s+arrive\\s+after",
    ],
    validate: dateRuleValue,
  }),
];

/**
 * PDF pages arrive as one whitespace-collapsed string, so a labelled value is not always at
 * the start of a line. Insert a break before any *known* label that is followed by a
 * colon, using only this module's own label vocabulary. No value is inferred here.
 */
const LABEL_BOUNDARY = new RegExp(
  `(?<=[^\\n])\\s+(?=(?:${[...new Set(RULES.flatMap((row) => row.labels))].join(
    "|"
  )})\\s*[:\\-])`,
  "giu"
);

export function normalizeEvidenceText(excerpt: string): string {
  return excerpt
    .split(/\r\n|\n|\r/u)
    .map((line) => line.replace(LABEL_BOUNDARY, "\n"))
    .join("\n");
}

export function detectProjectFactDocumentKind(
  excerpt: string
): ProjectFactDocumentKind {
  for (const marker of DOCUMENT_MARKERS) {
    if (marker.patterns.some((pattern) => pattern.test(excerpt))) {
      return marker.kind;
    }
  }
  return "unknown";
}

function comparisonOf(valueType: "string" | "date", value: string): string {
  if (valueType === "date") {
    return value;
  }
  return value.normalize("NFC").trim().toLocaleLowerCase("en-AU");
}

function comparableExisting(value: unknown): string | null {
  if (typeof value === "string") {
    return value.normalize("NFC").trim().toLocaleLowerCase("en-AU");
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

/**
 * Propose facts from already-verified evidence. `refsByOrdinal` must come from
 * `issueEvidenceRefs()` for this exact run, so a draft can never carry an invented or
 * cross-request reference.
 */
export function extractProjectFactCandidates(input: {
  candidates: readonly ProjectEvidenceUnitInput[];
  refsByOrdinal: ReadonlyMap<number, string>;
  existingFacts?: readonly ExistingFactForExtraction[];
}): ProjectFactExtractionResult {
  const existing = (input.existingFacts ?? []).filter(
    (fact) => fact.state !== "rejected"
  );
  const existingByKey = new Map<string, ExistingFactForExtraction[]>();
  for (const fact of existing) {
    const bucket = existingByKey.get(fact.key) ?? [];
    bucket.push(fact);
    existingByKey.set(fact.key, bucket);
  }

  const drafts: ProjectFactCandidateDraft[] = [];
  const conflicts: ProjectFactExtractionConflict[] = [];
  const seen = new Set<string>();
  const documentKinds = new Set<ProjectFactDocumentKind>();
  let duplicatesSkipped = 0;
  let unitsWithoutFields = 0;

  const units = [...input.candidates]
    .sort((left, right) => left.ordinal - right.ordinal)
    .slice(0, MAX_SCANNED_UNITS);

  /**
   * A document's kind is a **document-level** property: a CoE's provider line usually sits
   * in a different PDF page/paragraph than the words "Confirmation of Enrolment". Decide
   * the kind from the whole run, then use it for units that carry no marker of their own.
   */
  const runKinds = new Set<ProjectFactDocumentKind>();
  for (const unit of units) {
    // Only evidence that was actually issued for this request may characterise the document.
    if (!input.refsByOrdinal.has(unit.ordinal)) {
      continue;
    }
    const kind = detectProjectFactDocumentKind(unit.excerpt);
    if (kind !== "unknown") {
      runKinds.add(kind);
    }
  }
  const fallbackKinds: ProjectFactDocumentKind[] = [...runKinds];

  for (const unit of units) {
    const evidenceRef = input.refsByOrdinal.get(unit.ordinal);
    if (!evidenceRef) {
      // No issued reference means this unit is not customer-visible evidence yet.
      unitsWithoutFields += 1;
      continue;
    }
    const unitKind = detectProjectFactDocumentKind(unit.excerpt);
    const effectiveKinds = unitKind === "unknown" ? fallbackKinds : [unitKind];
    for (const kind of effectiveKinds) {
      documentKinds.add(kind);
    }
    if (effectiveKinds.length === 0) {
      unitsWithoutFields += 1;
      continue;
    }
    const text = normalizeEvidenceText(unit.excerpt);
    let matchedInUnit = 0;
    for (const rule of RULES) {
      if (!rule.kinds.some((kind) => effectiveKinds.includes(kind))) {
        continue;
      }
      const match = rule.pattern.exec(text);
      const raw = match?.[1];
      if (!raw) {
        continue;
      }
      const value = rule.validate(raw);
      if (!value) {
        continue;
      }
      const comparison = comparisonOf(rule.valueType, value);
      const dedupeKey = `${rule.key}\u0000${comparison}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      const sameKey = existingByKey.get(rule.key) ?? [];
      const isDuplicate = sameKey.some(
        (fact) => comparableExisting(fact.value) === comparison
      );
      if (isDuplicate) {
        duplicatesSkipped += 1;
        matchedInUnit += 1;
        continue;
      }
      const conflicting = sameKey.find((fact) => {
        const existingValue = comparableExisting(fact.value);
        return existingValue !== null && existingValue !== comparison;
      });
      if (conflicting) {
        conflicts.push({
          key: rule.key,
          existingAssertionId: conflicting.assertionId,
          existingValue: conflicting.value,
          proposedValue: value,
          sourceEvidenceRef: evidenceRef,
        });
      }
      if (drafts.length >= MAX_EXTRACTION_DRAFTS) {
        continue;
      }
      drafts.push({
        key: rule.key,
        valueType: rule.valueType,
        value,
        originKind: "document_extracted",
        sourceEvidenceRef: evidenceRef,
        observedAt: null,
        effectiveFrom: null,
        effectiveTo: null,
        supersedesAssertionId: null,
        documentKind:
          rule.kinds.find((candidate) => effectiveKinds.includes(candidate)) ??
          "unknown",
        evidenceOrdinal: unit.ordinal,
        evidenceLocatorKind: unit.locator.kind,
        matchKind: "explicit_label",
        conflictsWithExisting: Boolean(conflicting),
      });
      matchedInUnit += 1;
    }
    if (matchedInUnit === 0) {
      unitsWithoutFields += 1;
    }
  }

  return {
    extractionVersion: PROJECT_FACT_EXTRACTION_VERSION,
    drafts,
    conflicts,
    duplicatesSkipped,
    unitsWithoutFields,
    documentKinds: [...documentKinds].sort(),
  };
}
