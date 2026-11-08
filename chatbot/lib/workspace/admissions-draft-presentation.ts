/**
 * Phase 13 M9-A final UX correction 3 — locale presentation for an M5.2 preparation draft.
 *
 * The M5.2 draft body is generated deterministically in **English** and stored immutably
 * (version, `contentSha256`, provenance and idempotency depend on those exact bytes).
 * Translating stored rows would rewrite history, so this module never touches a stored
 * draft: it produces a **view** for a locale.
 *
 * Rules, all fail-safe:
 *   - `en`: pass the stored text through unchanged (current behaviour, no new chrome).
 *   - `zh-CN` with `assistKind === "deterministic_template"`: the stored body is the fixed
 *     deterministic template, so an equivalent Chinese template is rendered. The stored
 *     English text stays available verbatim and the UI labels the distinction.
 *   - `zh-CN` with any other `assistKind`: the prose may not be a deterministic template,
 *     so it is **not** translated; the stored English body is shown and explicitly marked
 *     as the original language.
 *   - Unknown section codes are never guessed: the stored text is shown and marked.
 *
 * Raw internal requirement codes are localized through the existing requirement label map
 * (the same labels the checklist uses); an unknown code becomes a safe generic label
 * instead of leaking a token into customer prose.
 *
 * This module cannot change a legal or admissions determination: it renders the same
 * statements the stored deterministic template makes, in another language.
 */

export type AdmissionsDraftTemplateCopy = {
  application_summary: string;
  intakeClause: string;
  academic_background_satisfied: string;
  academic_background_missing: string;
  english_proficiency: string;
  financial_capacity: string;
  study_purpose: string;
  provider_requirements_unverified: string;
  provider_requirements_missing: string;
  provider_requirements_unavailable: string;
  next_steps: string;
};

export type AdmissionsDraftPresentationCopy = {
  section: Record<string, string>;
  requirement: Record<string, string>;
  requirementStatus: Record<string, string>;
  template: AdmissionsDraftTemplateCopy;
  sectionOther: string;
  unknownRequirement: string;
  outstandingHeading: string;
  outstandingEmpty: string;
  viewNotice: string;
  assistedNotice: string;
  storedOriginalLabel: string;
};

export type AdmissionsDraftSectionInput = { code: string; text: string };

export type AdmissionsDraftRequirementInput = {
  code: string;
  status: string;
  required: boolean;
};

export type AdmissionsDraftOutstandingItem = {
  code: string;
  label: string;
  statusLabel: string | null;
  /** True when no localized label exists for this internal code. */
  unknown: boolean;
};

export type AdmissionsDraftSectionPresentation = {
  code: string;
  heading: string;
  /** What to display for this locale. */
  body: string;
  /**
   * `localized_deterministic` — an equivalent localized rendering of the deterministic
   * template. `stored_original` — the stored body verbatim (English).
   */
  bodyKind: "localized_deterministic" | "stored_original";
  /** The stored, immutable body, always available for the disclosure. */
  storedText: string;
  /** True when the displayed body is not the stored bytes (a locale view, not the record). */
  bodyDiffersFromStored: boolean;
};

export type AdmissionsDraftPresentation = {
  sections: AdmissionsDraftSectionPresentation[];
  outstanding: AdmissionsDraftOutstandingItem[];
  outstandingHeading: string;
  outstandingEmpty: string;
  /** Language/view disclaimer. `null` in English, where the body is the stored text. */
  notice: string | null;
  /** True when the stored draft may contain assisted prose, so nothing was translated. */
  assisted: boolean;
  /** Label for the control that reveals the stored English body, when it differs. */
  storedOriginalLabel: string;
};

function label(map: Record<string, string>, key: string, fallback: string) {
  const value = map[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) => {
    const value = values[key];
    return typeof value === "string" ? value : match;
  });
}

function requirementStatusOf(
  requirements: readonly AdmissionsDraftRequirementInput[],
  code: string
): string | null {
  return requirements.find((entry) => entry.code === code)?.status ?? null;
}

export function presentAdmissionsDraft(input: {
  locale: "en" | "zh-CN";
  assistKind: string;
  sections: readonly AdmissionsDraftSectionInput[];
  requirements: readonly AdmissionsDraftRequirementInput[];
  institutionName: string;
  courseTitle: string | null;
  intakeLabel: string | null;
  copy: AdmissionsDraftPresentationCopy;
}): AdmissionsDraftPresentation {
  // The same filter the deterministic `next_steps` template uses, so the localized list
  // names exactly the outstanding required items — never optional or settled ones.
  const outstanding = input.requirements
    .filter(
      (entry) =>
        entry.required &&
        entry.status !== "satisfied" &&
        entry.status !== "not_applicable"
    )
    .map((entry) => {
      const localized = input.copy.requirement[entry.code];
      const unknown =
        typeof localized !== "string" || localized.trim().length === 0;
      return {
        code: entry.code,
        label: unknown ? input.copy.unknownRequirement : localized,
        statusLabel: input.copy.requirementStatus[entry.status] ?? null,
        unknown,
      };
    });

  const base = {
    outstanding,
    outstandingEmpty: input.copy.outstandingEmpty,
    outstandingHeading: input.copy.outstandingHeading,
    storedOriginalLabel: input.copy.storedOriginalLabel,
  };

  // English: the stored body is the customer-facing text today. Change nothing.
  if (input.locale === "en") {
    return {
      ...base,
      assisted: false,
      notice: null,
      sections: input.sections.map((section) => ({
        body: section.text,
        bodyDiffersFromStored: false,
        bodyKind: "stored_original",
        code: section.code,
        heading: label(input.copy.section, section.code, section.code),
        storedText: section.text,
      })),
    };
  }

  const assisted = input.assistKind !== "deterministic_template";
  const intake = input.intakeLabel?.trim() ?? "";

  const localizedBody = (code: string): string | null => {
    if (assisted) {
      return null;
    }
    const { template } = input.copy;
    switch (code) {
      case "application_summary":
        return fill(template.application_summary, {
          course: input.courseTitle ?? "",
          institution: input.institutionName,
          intake_clause:
            intake.length === 0 ? "" : fill(template.intakeClause, { intake }),
        });
      case "academic_background":
        return requirementStatusOf(
          input.requirements,
          "evidence_fact_available"
        ) === "satisfied"
          ? template.academic_background_satisfied
          : template.academic_background_missing;
      case "english_proficiency":
        return template.english_proficiency;
      case "financial_capacity":
        return template.financial_capacity;
      case "study_purpose":
        return template.study_purpose;
      case "provider_requirements": {
        const status = requirementStatusOf(
          input.requirements,
          "education_source_resolved"
        );
        if (status === "missing") {
          return template.provider_requirements_missing;
        }
        if (status === "unverified" || status === "satisfied") {
          return template.provider_requirements_unverified;
        }
        return template.provider_requirements_unavailable;
      }
      case "next_steps":
        return template.next_steps;
      default:
        return null;
    }
  };

  return {
    ...base,
    assisted,
    notice: assisted ? input.copy.assistedNotice : input.copy.viewNotice,
    sections: input.sections.map((section) => {
      const localized = localizedBody(section.code);
      return {
        body: localized ?? section.text,
        bodyDiffersFromStored: localized !== null,
        bodyKind:
          localized === null ? "stored_original" : "localized_deterministic",
        code: section.code,
        heading: label(
          input.copy.section,
          section.code,
          input.copy.sectionOther
        ),
        storedText: section.text,
      };
    }),
  };
}
