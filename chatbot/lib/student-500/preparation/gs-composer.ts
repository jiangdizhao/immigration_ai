// biome-ignore-all lint/suspicious/useAwait: the composer port is async by contract; the deterministic composer has nothing to await.
import {
  factKeyMatches,
  STUDENT_500_GS_MAX_SECTIONS,
  STUDENT_500_GS_SECTION_FACT_KEYS,
  STUDENT_500_GS_SECTION_HEADINGS,
  type Student500GsSection,
  type Student500GsSectionKey,
  Student500PreparationError,
} from "./contracts";
import { STUDENT_500_GS_STALE_SOURCE_MARKER } from "./gs-draft";
import {
  STUDENT_500_MAX_ASSERTIONS_PER_SECTION,
  type Student500AssertionSupport,
  type Student500GsAssertion,
  type Student500GsComposerKind,
  type Student500GsProposedSection,
} from "./m7-contracts";

/**
 * Phase 13 M7 - bounded Genuine Student composition proposals.
 *
 * The composer is an injected port. The shipped implementation is deterministic and
 * offline; a model-backed composer is deliberately not wired by default and its
 * placeholder reports itself unavailable rather than silently degrading.
 *
 * Whatever the composer produces is a *proposal*:
 *
 *   - it never becomes a saved draft without explicit customer acceptance;
 *   - it cannot introduce a fact that is not an authorized reference;
 *   - every assertion carries one of three support kinds, none of which claims
 *     verification, legal authority or professional approval;
 *   - the deterministic M6 starter remains the fallback scaffold.
 */

export type Student500GsCompositionFact = {
  readonly factReferenceId: string;
  readonly factKey: string;
  readonly valueDisplay: string;
};

export type Student500GsCompositionTaskHint = {
  readonly taskId: string;
  readonly gsSectionKeys: readonly string[];
  readonly missingFactKeys: readonly string[];
};

export type Student500GsCompositionRequest = {
  readonly applicationId: string;
  readonly baseDraft: {
    readonly draftId: string;
    readonly version: number;
    readonly contentSha256: string;
    readonly sections: readonly Student500GsSection[];
  };
  /** Only currently authorized, currently readable fact references. */
  readonly facts: readonly Student500GsCompositionFact[];
  readonly tasks: readonly Student500GsCompositionTaskHint[];
};

export type Student500GsCompositionResult = {
  readonly composerKind: Student500GsComposerKind;
  readonly composerCode: string;
  readonly sections: readonly Student500GsProposedSection[];
};

export type Student500GsComposer = {
  readonly code: string;
  readonly kind: Student500GsComposerKind;
  compose: (
    request: Student500GsCompositionRequest
  ) => Promise<Student500GsCompositionResult>;
};

export const DETERMINISTIC_GS_COMPOSER_CODE =
  "deterministic_section_composer_v1" as const;

export const UNAVAILABLE_GS_COMPOSER_CODE =
  "unavailable_model_gs_composer" as const;

function assertionFor(input: {
  readonly sectionKey: Student500GsSectionKey;
  readonly ordinal: number;
  readonly text: string;
  readonly support: Student500AssertionSupport;
  readonly factReferenceIds: readonly string[];
}): Student500GsAssertion {
  return {
    assertionId: `as_${input.sectionKey}_${input.ordinal}`,
    assertionText: input.text,
    factReferenceIds: input.factReferenceIds,
    support: input.support,
  };
}

/** Facts relevant to one GS section, by the accepted M6 prefix mapping. */
function sectionFacts(
  sectionKey: Student500GsSectionKey,
  facts: readonly Student500GsCompositionFact[]
): readonly Student500GsCompositionFact[] {
  const patterns = STUDENT_500_GS_SECTION_FACT_KEYS[sectionKey];
  return facts.filter((fact) => factKeyMatches(fact.factKey, patterns));
}

/**
 * Deterministic composer: preserves the customer's own text, appends only labelled
 * fact lines and explicit confirmation prompts, and never generates persuasive prose
 * of its own.
 */
async function deterministicCompose(
  request: Student500GsCompositionRequest
): Promise<Student500GsCompositionResult> {
  const sections: Student500GsProposedSection[] = [];

  for (const base of request.baseDraft.sections) {
    const sectionKey = base.sectionKey;
    const relevant = sectionFacts(sectionKey, request.facts);

    const lines: string[] = [];
    const assertions: Student500GsAssertion[] = [];
    const emittedFactIds: string[] = [];

    // Carried-over text is the customer's own draft text. It is NEVER attributed to
    // a fact reference: associating unrelated prose with the first reference that
    // happens to sit on the section was the R1 attribution defect.
    for (const line of base.text
      .split("\n")
      .filter((row) => row.trim() !== "")) {
      lines.push(line);
      assertions.push(
        assertionFor({
          factReferenceIds: [],
          ordinal: assertions.length,
          sectionKey,
          support: "customer_authored",
          text: line,
        })
      );
    }

    // Every fact line is generated from exactly one authorized reference and is
    // emitted at most once, so line-level provenance is always true.
    for (const fact of relevant) {
      if (emittedFactIds.includes(fact.factReferenceId)) {
        continue;
      }
      emittedFactIds.push(fact.factReferenceId);
      const line = `Recorded fact (${fact.factKey}): ${fact.valueDisplay}`;
      lines.push(line);
      assertions.push(
        assertionFor({
          factReferenceIds: [fact.factReferenceId],
          ordinal: assertions.length,
          sectionKey,
          support: "authorized_fact",
          text: line,
        })
      );
    }

    for (const missing of base.missingInformation) {
      const line = `${NEEDS_CONFIRMATION_PREFIX}${missing}`;
      lines.push(line);
      assertions.push(
        assertionFor({
          factReferenceIds: [],
          ordinal: assertions.length,
          sectionKey,
          support: "unverified_needs_confirmation",
          text: line,
        })
      );
    }

    sections.push({
      assertions: assertions.slice(0, STUDENT_500_MAX_ASSERTIONS_PER_SECTION),
      factReferenceIds: emittedFactIds,
      heading: base.heading || STUDENT_500_GS_SECTION_HEADINGS[sectionKey],
      missingInformation: base.missingInformation,
      sectionKey,
      source: "composer_proposal",
      text:
        lines.length > 0
          ? lines.join("\n")
          : STUDENT_500_GS_STALE_SOURCE_MARKER,
    });
  }

  return {
    composerCode: DETERMINISTIC_GS_COMPOSER_CODE,
    composerKind: "deterministic",
    sections,
  };
}

export const deterministicGsComposer: Student500GsComposer = {
  code: DETERMINISTIC_GS_COMPOSER_CODE,
  kind: "deterministic",
  compose: deterministicCompose,
};

/**
 * Placeholder for a model-backed composer. It is not wired by default, makes no
 * provider call, and fails rather than pretending a draft was produced.
 */
export const unavailableModelGsComposer: Student500GsComposer = {
  code: UNAVAILABLE_GS_COMPOSER_CODE,
  kind: "model_disabled",
  compose() {
    throw new Student500PreparationError("composer_unavailable");
  },
};

"unavailable_model_gs_composer" as const;

const NEEDS_CONFIRMATION_PREFIX = "Needs confirmation: ";

/* ------------------------------------------------------- proposal validation */

export type Student500CompositionAttribution = {
  readonly assertionCount: number;
  readonly unverifiedAssertionCount: number;
  readonly unattributedAssertionCount: number;
};

/**
 * Deterministic validation of any composer output, including a future model one.
 *
 * A proposal may only cite fact references the caller already proved authorized and
 * readable. An `authorized_fact` assertion without such a reference is a structural
 * integrity failure - never silently downgraded - because the alternative is a
 * narrative claim wearing a fact's authority.
 */
export function validateComposition(input: {
  readonly sections: readonly Student500GsProposedSection[];
  readonly allowedFactReferenceIds: readonly string[];
}): {
  readonly sections: readonly Student500GsProposedSection[];
  readonly attribution: Student500CompositionAttribution;
} {
  const allowed = new Set(input.allowedFactReferenceIds);
  if (
    input.sections.length === 0 ||
    input.sections.length > STUDENT_500_GS_MAX_SECTIONS
  ) {
    throw new Student500PreparationError("integrity_conflict");
  }
  const seen = new Set<string>();
  let assertionCount = 0;
  let unverifiedAssertionCount = 0;
  let unattributedAssertionCount = 0;

  const sections = input.sections.map((section) => {
    if (seen.has(section.sectionKey)) {
      throw new Student500PreparationError("integrity_conflict");
    }
    seen.add(section.sectionKey);
    for (const factReferenceId of section.factReferenceIds) {
      if (!allowed.has(factReferenceId)) {
        throw new Student500PreparationError("integrity_conflict");
      }
    }
    if (section.assertions.length > STUDENT_500_MAX_ASSERTIONS_PER_SECTION) {
      throw new Student500PreparationError("limit_exceeded");
    }
    const assertions = section.assertions.map((assertion) => {
      assertionCount += 1;
      if (assertion.support === "unverified_needs_confirmation") {
        unverifiedAssertionCount += 1;
      }
      for (const factReferenceId of assertion.factReferenceIds) {
        if (!allowed.has(factReferenceId)) {
          // A composer may not invent, or borrow, evidence identity.
          throw new Student500PreparationError("integrity_conflict");
        }
      }
      if (
        assertion.support === "authorized_fact" &&
        assertion.factReferenceIds.length === 0
      ) {
        unattributedAssertionCount += 1;
        throw new Student500PreparationError("integrity_conflict");
      }
      return {
        assertionId: assertion.assertionId,
        assertionText: assertion.assertionText,
        factReferenceIds: [...assertion.factReferenceIds],
        support: assertion.support,
      };
    });
    return {
      assertions,
      factReferenceIds: [...section.factReferenceIds],
      heading: section.heading,
      missingInformation: [...section.missingInformation],
      sectionKey: section.sectionKey,
      source: section.source,
      text: section.text,
    };
  });

  return {
    attribution: {
      assertionCount,
      unattributedAssertionCount,
      unverifiedAssertionCount,
    },
    sections,
  };
}

/**
 * Statements that still need the customer before they can be treated as their own
 * account. Structural detection only: it reports unknown support, it never judges
 * whether wording is persuasive or legally sufficient.
 */
export function statementsNeedingConfirmation(
  sections: readonly Student500GsProposedSection[]
): readonly {
  readonly sectionKey: Student500GsSectionKey;
  readonly assertionId: string;
  readonly assertionText: string;
}[] {
  const rows: {
    sectionKey: Student500GsSectionKey;
    assertionId: string;
    assertionText: string;
  }[] = [];
  for (const section of sections) {
    for (const assertion of section.assertions) {
      if (assertion.support !== "unverified_needs_confirmation") {
        continue;
      }
      rows.push({
        assertionId: assertion.assertionId,
        assertionText: assertion.assertionText,
        sectionKey: section.sectionKey,
      });
    }
  }
  return rows;
}
