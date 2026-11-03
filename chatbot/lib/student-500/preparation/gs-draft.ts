import {
  factKeyMatches,
  normalizeGsSectionText,
  preparationDigest,
  STUDENT_500_GS_MAX_SECTIONS,
  STUDENT_500_GS_MAX_TOTAL_TEXT,
  STUDENT_500_GS_SECTION_FACT_KEYS,
  STUDENT_500_GS_SECTION_HEADINGS,
  STUDENT_500_GS_SECTION_KEYS,
  type Student500GsSection,
  type Student500GsSectionKey,
  Student500PreparationError,
} from "./contracts";
import type { Student500FactCandidate } from "./ports";

/**
 * Deterministic provisional Genuine Student draft starter.
 *
 * There is no model call here and no prose invention. Every sentence is either
 *   - an explicitly attributed customer-confirmed fact value the caller is
 *     authorized to use, or
 *   - an explicit placeholder stating that no authorized information exists.
 *
 * The output is therefore a *structured preparation starter*: it must never be
 * presented as a professionally prepared or officially compliant GS statement.
 */

/** Stored section shape (persisted keys are plain strings, not the UI union). */
type PersistedStudent500GsSection = {
  readonly sectionKey: string;
  readonly heading: string;
  readonly text: string;
  readonly source: "authorized_fact" | "customer_text" | "missing";
  readonly factReferenceIds: readonly string[];
  readonly missingInformation: readonly string[];
};

/** Placeholder shown when drafted source text may no longer be disclosed. */
export const STUDENT_500_GS_WITHHELD_PLACEHOLDER =
  "[content withheld: source authorization no longer permits disclosure]" as const;

export const STUDENT_500_GS_WITHHELD_MARKER =
  "restricted_source_withheld" as const;

/** Marker added when a previously source-derived section lost its authorization. */
export const STUDENT_500_GS_STALE_SOURCE_MARKER =
  "source_material_stale_review_required" as const;

export const STUDENT_500_GS_STARTER_LABEL =
  "preliminary_structured_draft_deterministic_starter" as const;

export const STUDENT_500_GS_STARTER_POLICY =
  "phase13.m6.2.gs-starter.v1" as const;

export type StarterFactInput = {
  readonly factReferenceId: string;
  readonly factAssertionId: string;
  readonly factVersion: number;
  readonly factKey: string;
  readonly valueDisplay: string;
  readonly originKind: string;
};

export type StarterDraft = {
  readonly policyVersion: typeof STUDENT_500_GS_STARTER_POLICY;
  readonly label: typeof STUDENT_500_GS_STARTER_LABEL;
  readonly sections: readonly Student500GsSection[];
  readonly sourceFactReferenceIds: readonly string[];
};

function humanizeFactKey(key: string): string {
  const last = key.split(".").at(-1) ?? key;
  return last.replace(/[_-]+/gu, " ").replace(/\s+/gu, " ").trim();
}

/** Attribution shown next to every fact-derived line. */
function attribution(fact: StarterFactInput): string {
  return `customer-confirmed (unverified) fact ${fact.factKey}, version ${fact.factVersion}`;
}

function missingPlaceholder(heading: string): string {
  return `[No authorized information has been supplied for "${heading}". The system has not invented any details. Add your own text, or select an authorized fact that covers this.]`;
}

/**
 * Builds the starter. `facts` must already be the AI-authorized, customer-visible
 * subset; this function performs no additional authorization and no inference.
 */
export function buildStarterDraft(
  facts: readonly StarterFactInput[]
): StarterDraft {
  const sections: Student500GsSection[] = [];
  const usedFactReferenceIds = new Set<string>();
  for (const sectionKey of STUDENT_500_GS_SECTION_KEYS) {
    const heading = STUDENT_500_GS_SECTION_HEADINGS[sectionKey];
    const patterns = STUDENT_500_GS_SECTION_FACT_KEYS[sectionKey];
    const matched = facts.filter((fact) =>
      factKeyMatches(fact.factKey, patterns)
    );
    if (matched.length === 0) {
      sections.push({
        factReferenceIds: [],
        heading,
        missingInformation: ["no_authorized_fact_for_section"],
        sectionKey,
        source: "missing",
        text: missingPlaceholder(heading),
      });
      continue;
    }
    const lines = matched.map(
      (fact) =>
        `- ${humanizeFactKey(fact.factKey)}: ${fact.valueDisplay} [${attribution(fact)}]`
    );
    for (const fact of matched) {
      usedFactReferenceIds.add(fact.factReferenceId);
    }
    sections.push({
      factReferenceIds: matched.map((fact) => fact.factReferenceId),
      heading,
      missingInformation: [],
      sectionKey,
      source: "authorized_fact",
      text: [
        "Statements below restate authorized customer facts only; nothing has been added.",
        ...lines,
      ].join("\n"),
    });
  }
  return {
    label: STUDENT_500_GS_STARTER_LABEL,
    policyVersion: STUDENT_500_GS_STARTER_POLICY,
    sections,
    sourceFactReferenceIds: [...usedFactReferenceIds].sort(),
  };
}

/**
 * Validates customer-edited sections. Section identity, ordering and the fact
 * attribution list are server-controlled: a customer may edit text only, so an
 * edit can never claim a fact that was not authorized or drop the honest
 * "missing" marker while leaving the section empty.
 */
/** The persisted (previously saved) section shape a customer may edit. */
export type PersistedSection = {
  readonly sectionKey: string;
  readonly heading: string;
  readonly text: string;
  readonly source: "authorized_fact" | "customer_text" | "missing";
  readonly factReferenceIds: readonly string[];
  readonly missingInformation: readonly string[];
};

export function normalizeEditedSections(input: {
  readonly previous: readonly PersistedSection[];
  readonly edits: readonly {
    readonly sectionKey: unknown;
    readonly text: unknown;
  }[];
}): readonly Student500GsSection[] {
  if (
    input.edits.length === 0 ||
    input.edits.length > STUDENT_500_GS_MAX_SECTIONS
  ) {
    throw new Student500PreparationError("invalid_request");
  }
  const byKey = new Map<Student500GsSectionKey, string>();
  for (const edit of input.edits) {
    const key = STUDENT_500_GS_SECTION_KEYS.find(
      (value) => value === edit.sectionKey
    );
    if (!key || byKey.has(key)) {
      throw new Student500PreparationError("invalid_request");
    }
    byKey.set(key, normalizeGsSectionText(edit.text));
  }
  const sections: Student500GsSection[] = [];
  let total = 0;
  for (const previous of input.previous) {
    const sectionKey = STUDENT_500_GS_SECTION_KEYS.find(
      (value) => value === previous.sectionKey
    );
    if (!sectionKey) {
      throw new Student500PreparationError("integrity_conflict");
    }
    const edited = byKey.get(sectionKey);
    const text = edited ?? previous.text;
    total += text.length;
    if (total > STUDENT_500_GS_MAX_TOTAL_TEXT) {
      throw new Student500PreparationError("invalid_request");
    }
    sections.push({
      factReferenceIds: previous.factReferenceIds,
      heading: previous.heading,
      missingInformation: previous.missingInformation,
      sectionKey,
      // An edited section becomes customer text: the fact list stays attached for
      // provenance, but the wording is now the customer's.
      source: edited === undefined ? previous.source : "customer_text",
      text,
    });
  }
  return sections;
}

/**
 * Prepares sections for a NEW version.
 *
 * A section that is still sourced from facts is only renewed when every one of its
 * fact references is currently authorized. Otherwise it is demoted to explicit
 * customer-review material: the wording is preserved verbatim (never rewritten),
 * provenance is kept for the reader, and it stops counting as currently authorized
 * source material for this version.
 */
export function renewSectionsForNewVersion(input: {
  readonly sections: readonly Student500GsSection[];
  readonly liveFactState: ReadonlyMap<string, string>;
}): { sections: readonly Student500GsSection[]; demotedCount: number } {
  let demotedCount = 0;
  const sections = input.sections.map((section) => {
    if (section.source !== "authorized_fact") {
      return section;
    }
    const allCurrent = section.factReferenceIds.every(
      (id) => input.liveFactState.get(id) === "covered_by_authorized_fact"
    );
    if (allCurrent) {
      return section;
    }
    demotedCount += 1;
    return {
      ...section,
      missingInformation: [
        ...new Set([
          ...section.missingInformation,
          STUDENT_500_GS_STALE_SOURCE_MARKER,
        ]),
      ],
      source: "customer_text" as const,
    };
  });
  return { demotedCount, sections };
}

/**
 * Applies present-time disclosure control to stored draft sections.
 *
 * Historical database versions stay byte-for-byte intact; only the served view is
 * narrowed. A section that carries any fact-derived provenance is withheld unless
 * every underlying reference is still readable by the current actor. Pure
 * customer-authored sections carry no fact references and are unaffected. Withheld
 * text never reveals the hidden fact identity or its value.
 */
export function redactUnreadableSections(input: {
  readonly sections: readonly PersistedStudent500GsSection[];
  readonly readableFactReferenceIds: ReadonlySet<string>;
}): {
  redactedCount: number;
  sections: readonly PersistedStudent500GsSection[];
} {
  let redactedCount = 0;
  const sections = input.sections.map((section) => {
    if (
      section.factReferenceIds.length === 0 ||
      section.factReferenceIds.every((id) =>
        input.readableFactReferenceIds.has(id)
      )
    ) {
      return section;
    }
    redactedCount += 1;
    const missingInformation: readonly string[] = [
      ...section.missingInformation,
      ...(section.missingInformation.includes(STUDENT_500_GS_WITHHELD_MARKER)
        ? []
        : [STUDENT_500_GS_WITHHELD_MARKER]),
    ];
    return {
      factReferenceIds: [] as readonly string[],
      heading: section.heading,
      missingInformation,
      sectionKey: section.sectionKey,
      source: "missing" as const,
      text: STUDENT_500_GS_WITHHELD_PLACEHOLDER as string,
    };
  });
  return { redactedCount, sections };
}

export function draftContentSha256(
  sections: readonly Student500GsSection[]
): string {
  return preparationDigest(
    sections.map((section) => ({
      heading: section.heading,
      sectionKey: section.sectionKey,
      source: section.source,
      text: section.text,
    }))
  );
}

/**
 * Digest of every input that made a draft version what it is. Recomputing it with
 * current state is how a saved version is proven current or stale; equality is
 * necessary but never sufficient to claim legal correctness.
 */
export function draftInputDigest(input: {
  readonly applicationId: string;
  readonly applicationRevision: number;
  readonly asOfDate: string | null;
  readonly contextDigest: string;
  readonly schoolContextDigest: string;
  readonly factDigests: readonly string[];
}): string {
  return preparationDigest({
    applicationId: input.applicationId,
    applicationRevision: input.applicationRevision,
    asOfDate: input.asOfDate,
    context: input.contextDigest,
    facts: [...input.factDigests].sort(),
    school: input.schoolContextDigest,
    starterPolicy: STUDENT_500_GS_STARTER_POLICY,
  });
}

export function factDigestFor(input: {
  readonly factReferenceId: string;
  readonly factAssertionId: string;
  readonly factVersion: number;
  readonly factKey: string;
  readonly state: string;
}): string {
  return preparationDigest({
    assertion: input.factAssertionId,
    key: input.factKey,
    reference: input.factReferenceId,
    state: input.state,
    version: input.factVersion,
  });
}

/** Bounded, non-identifying display of one authorized fact value. */
export function boundFactValue(value: unknown): string {
  const raw =
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? Array.isArray(value)
            ? `${value.length} item(s)`
            : "recorded value"
          : String(value);
  const collapsed = raw.replace(/\s+/gu, " ").trim();
  return collapsed.length <= 160 ? collapsed : `${collapsed.slice(0, 157)}...`;
}

export function starterFactsFrom(
  input: readonly {
    readonly factReferenceId: string;
    readonly factAssertionId: string;
    readonly factVersion: number;
    readonly factKey: string;
    readonly candidate: Student500FactCandidate | null;
  }[]
): readonly StarterFactInput[] {
  return input
    .filter((entry) => entry.candidate?.aiUseAuthorized === true)
    .map((entry) => ({
      factAssertionId: entry.factAssertionId,
      factKey: entry.factKey,
      factReferenceId: entry.factReferenceId,
      factVersion: entry.factVersion,
      originKind: entry.candidate?.originKind ?? "customer_stated",
      valueDisplay: boundFactValue(
        (entry.candidate as { valueDisplay?: string } | null)?.valueDisplay ??
          ""
      ),
    }));
}
