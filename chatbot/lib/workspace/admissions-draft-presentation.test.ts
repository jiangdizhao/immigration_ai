import assert from "node:assert/strict";
import { test } from "node:test";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import {
  type AdmissionsDraftPresentationCopy,
  type AdmissionsDraftRequirementInput,
  presentAdmissionsDraft,
} from "./admissions-draft-presentation";

/**
 * Phase 13 M9-A final UX correction 3 (Issue #3).
 *
 * The stored M5.2 draft body is immutable English. These tests prove the locale view:
 * English is untouched, Chinese renders an equivalent deterministic template, assisted or
 * unknown prose is shown as stored with an explicit language marker, and raw internal
 * requirement codes never reach customer prose.
 */

const zh = getWorkspaceCopy("zh-CN").schoolAdmissions;
const en = getWorkspaceCopy("en").schoolAdmissions;

function copyOf(source: typeof en): AdmissionsDraftPresentationCopy {
  return {
    assistedNotice: source.draftAssistedNotice,
    outstandingEmpty: source.draftOutstandingEmpty,
    outstandingHeading: source.draftOutstandingHeading,
    requirement: source.requirement,
    requirementStatus: source.requirementStatus,
    section: source.section,
    sectionOther: source.draftSectionOther,
    storedOriginalLabel: source.draftStoredOriginalLabel,
    template: source.draftTemplate,
    unknownRequirement: source.draftUnknownRequirement,
    viewNotice: source.draftViewNotice,
  };
}

/** The stored English body exactly as M5.2 writes it (including raw codes). */
const STORED_SECTIONS = [
  {
    code: "application_summary",
    text: "Provisional draft for University of Wollongong — Master of Science, intake Feb 2027. Target details were provided by the customer and are not independently verified by any institution. Immutable preparation package version 2 is current and usable.",
  },
  {
    code: "academic_background",
    text: "This draft references 3 customer-authorised study fact record(s). Their values must be confirmed by the customer, and any academic claim required by the institution must be supported by an authorised document.",
  },
  {
    code: "english_proficiency",
    text: "No independently verified English proficiency result is reviewed in this workflow.",
  },
  {
    code: "financial_capacity",
    text: "No financial evidence has been certified in this workflow.",
  },
  {
    code: "study_purpose",
    text: "Draft the customer's own study purpose in their words.",
  },
  {
    code: "provider_requirements",
    text: "An education catalogue record matched the recorded institution/course.",
  },
  {
    code: "next_steps",
    text: "Outstanding items: evidence_fact_available, customer_confirmation_recorded.",
  },
] as const;

const REQUIREMENTS: readonly AdmissionsDraftRequirementInput[] = [
  { code: "evidence_fact_available", required: true, status: "satisfied" },
  { code: "education_source_resolved", required: true, status: "unverified" },
  {
    code: "customer_confirmation_recorded",
    required: true,
    status: "missing",
  },
  { code: "coe_evidence_recorded", required: false, status: "missing" },
  { code: "outcome_pathway_present", required: true, status: "not_applicable" },
];

function present(overrides: {
  locale?: "en" | "zh-CN";
  assistKind?: string;
  requirements?: readonly AdmissionsDraftRequirementInput[];
  sections?: readonly { code: string; text: string }[];
}) {
  return presentAdmissionsDraft({
    assistKind: overrides.assistKind ?? "deterministic_template",
    copy: copyOf(overrides.locale === "en" ? en : zh),
    courseTitle: "Master of Science",
    institutionName: "University of Wollongong",
    intakeLabel: "Feb 2027",
    locale: overrides.locale ?? "zh-CN",
    requirements: overrides.requirements ?? REQUIREMENTS,
    sections: overrides.sections ?? STORED_SECTIONS,
  });
}

test("the English locale is unchanged: the stored body is displayed verbatim", () => {
  const view = present({ locale: "en" });
  assert.equal(view.notice, null);
  assert.equal(view.assisted, false);
  assert.deepEqual(
    view.sections.map((section) => section.body),
    STORED_SECTIONS.map((section) => section.text)
  );
  for (const section of view.sections) {
    assert.equal(section.bodyKind, "stored_original");
    assert.equal(section.bodyDiffersFromStored, false);
    assert.equal(section.storedText, section.body);
  }
});

test("the Chinese locale renders the deterministic template in Chinese", () => {
  const view = present({ locale: "zh-CN" });
  assert.equal(view.assisted, false);
  assert.equal(view.notice, zh.draftViewNotice);
  const body = (code: string) =>
    view.sections.find((section) => section.code === code)?.body ?? "";

  // Localized prose, not the stored English sentence.
  assert.match(body("application_summary"), /University of Wollongong/u);
  assert.match(body("application_summary"), /Master of Science/u);
  assert.match(body("application_summary"), /入学批次：Feb 2027/u);
  assert.match(body("application_summary"), /临时准备草稿/u);
  assert.match(body("academic_background"), /学习事实/u);
  assert.match(body("english_proficiency"), /英语能力/u);
  assert.match(body("financial_capacity"), /资金/u);
  assert.match(body("study_purpose"), /学习目的/u);
  assert.match(body("provider_requirements"), /教育目录/u);

  for (const section of view.sections) {
    if (section.code === "next_steps") {
      continue;
    }
    assert.equal(section.bodyKind, "localized_deterministic");
    // The stored bytes stay available and are explicitly distinguished.
    assert.equal(section.bodyDiffersFromStored, true);
    assert.ok(section.storedText.length > 0);
    assert.notEqual(section.body, section.storedText);
  }
});

test("assisted prose is never translated and is marked as stored English", () => {
  const view = present({ assistKind: "stub_suggestion", locale: "zh-CN" });
  assert.equal(view.assisted, true);
  assert.equal(view.notice, zh.draftAssistedNotice);
  for (const section of view.sections) {
    assert.equal(section.bodyKind, "stored_original");
    assert.equal(section.bodyDiffersFromStored, false);
    assert.equal(section.body, section.storedText);
  }
  // Nothing is silently rewritten, so the stored English text is exactly what is shown.
  assert.ok(view.sections.every((section) => /[A-Za-z]/u.test(section.body)));
});

test("an unknown section code is shown as stored with a safe heading", () => {
  const view = present({
    locale: "zh-CN",
    sections: [{ code: "future_section", text: "Stored English text." }],
  });
  const section = view.sections[0];
  assert.equal(section.body, "Stored English text.");
  assert.equal(section.bodyKind, "stored_original");
  assert.equal(section.heading, zh.draftSectionOther);
});

test("raw internal requirement codes never reach the localized prose", () => {
  const view = present({ locale: "zh-CN" });
  const rendered = JSON.stringify({
    outstanding: view.outstanding.map((item) => item.label),
    sections: view.sections.map((section) => section.body),
  });
  for (const code of [
    "evidence_fact_available",
    "customer_confirmation_recorded",
    "education_source_resolved",
  ]) {
    assert.doesNotMatch(rendered, new RegExp(code, "u"));
  }

  // Only required, unresolved checks are listed — optional and settled ones are not.
  // This is the same filter the deterministic `next_steps` template applies.
  assert.deepEqual(
    view.outstanding.map((item) => item.code),
    ["education_source_resolved", "customer_confirmation_recorded"]
  );
  assert.equal(
    view.outstanding[1]?.label,
    zh.requirement.customer_confirmation_recorded
  );
  assert.equal(view.outstanding[1]?.statusLabel, zh.requirementStatus.missing);
  assert.equal(view.outstanding[1]?.unknown, false);

  // An unknown code becomes a safe generic label, never the token itself.
  const unknownView = present({
    locale: "zh-CN",
    requirements: [
      { code: "future_check_code", required: true, status: "missing" },
    ],
  });
  assert.equal(unknownView.outstanding[0]?.label, zh.draftUnknownRequirement);
  assert.equal(unknownView.outstanding[0]?.unknown, true);
  assert.doesNotMatch(
    unknownView.outstanding[0]?.label ?? "",
    /future_check_code/u
  );
});

test("requirement status drives the localized provider-requirement statement", () => {
  const statuses = [
    {
      expected: zh.draftTemplate.provider_requirements_missing,
      status: "missing",
    },
    {
      expected: zh.draftTemplate.provider_requirements_unverified,
      status: "unverified",
    },
    {
      expected: zh.draftTemplate.provider_requirements_unavailable,
      status: "unknown",
    },
  ] as const;
  for (const entry of statuses) {
    const view = present({
      locale: "zh-CN",
      requirements: [
        {
          code: "education_source_resolved",
          required: true,
          status: entry.status,
        },
      ],
    });
    assert.equal(
      view.sections.find((section) => section.code === "provider_requirements")
        ?.body,
      entry.expected
    );
  }

  // Satisfied study facts select the "referenced facts" statement, not the empty one.
  const satisfied = present({
    locale: "zh-CN",
    requirements: [
      { code: "evidence_fact_available", required: true, status: "satisfied" },
    ],
  });
  assert.equal(
    satisfied.sections.find((section) => section.code === "academic_background")
      ?.body,
    zh.draftTemplate.academic_background_satisfied
  );
  const missing = present({
    locale: "zh-CN",
    requirements: [
      { code: "evidence_fact_available", required: true, status: "missing" },
    ],
  });
  assert.equal(
    missing.sections.find((section) => section.code === "academic_background")
      ?.body,
    zh.draftTemplate.academic_background_missing
  );
});

test("the missing intake label leaves no placeholder or empty gap", () => {
  const view = presentAdmissionsDraft({
    assistKind: "deterministic_template",
    copy: copyOf(zh),
    courseTitle: "Master of Science",
    institutionName: "University of Wollongong",
    intakeLabel: null,
    locale: "zh-CN",
    requirements: REQUIREMENTS,
    sections: STORED_SECTIONS,
  });
  const summary = view.sections.find(
    (section) => section.code === "application_summary"
  )?.body;
  assert.ok(summary);
  assert.doesNotMatch(summary, /\{/u);
  assert.doesNotMatch(summary, /入学批次/u);
  assert.match(summary, /临时准备草稿。/u);
});

test("both locales ship every template key (no missing translation)", () => {
  for (const source of [zh, en]) {
    for (const [key, value] of Object.entries(source.draftTemplate)) {
      assert.equal(
        typeof value === "string" && value.trim().length > 0,
        true,
        `${key} must be non-empty`
      );
    }
    for (const key of [
      "draftSectionOther",
      "draftViewNotice",
      "draftAssistedNotice",
      "draftStoredOriginalLabel",
      "draftOutstandingHeading",
      "draftOutstandingEmpty",
      "draftUnknownRequirement",
    ] as const) {
      assert.ok(source[key].trim().length > 0, `${key} must be non-empty`);
    }
  }
  // The Chinese template must actually be Chinese, not a copy of the English one.
  assert.notEqual(
    zh.draftTemplate.application_summary,
    en.draftTemplate.application_summary
  );
  assert.match(zh.draftTemplate.application_summary, /[\u4e00-\u9fff]/u);
});
