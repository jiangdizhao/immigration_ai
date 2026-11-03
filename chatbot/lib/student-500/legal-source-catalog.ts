import type {
  Student500AuthorityClass,
  Student500SourceVerification,
} from "./contracts";

/**
 * Phase 13 M6.1 — declared Student 500 official-source catalog.
 *
 * IMPORTANT — what this catalog is and is not
 * -------------------------------------------
 * This is a *repository declaration* of the official source identities the
 * preliminary screening refers to. It is NOT a legal corpus and NOT verified
 * current law.
 *
 *   - Every entry is `declared_pending_verification`: no authoritative corpus
 *     lookup, no legislation.gov.au fetch and no Home Affairs retrieval is
 *     performed by M6.1.
 *   - `urlVerified` is therefore always `false`. A URL here is the declared
 *     register/department location, not proof that the provision text was
 *     obtained.
 *   - `effectiveFrom`/`effectiveTo` are `null` unless genuinely established,
 *     because this milestone cannot establish commencement. Absence is reported
 *     as absence, never filled in from model memory.
 *   - `declaredCoverage` is a *screening-coverage* declaration: the range of
 *     as-of dates this repository's declarations were written for. It is not a
 *     commencement or repeal assertion. An as-of date outside the coverage makes
 *     the affected requirement `unknown` + human review, never a legal answer.
 *
 * The Subclass 500 criterion identities below mirror the source classes already
 * used by the legal-service Subclass 500 criterion pack
 * (`legal-service/app/services/subclass_500_criterion_pack.py`), so the Project
 * surface and the legal research path do not describe two different laws.
 */

export type Student500DeclaredCoverage = {
  readonly from: string;
  readonly to: string | null;
};

export type Student500DeclaredLegalSource = {
  /** Stable repository identity; never generated at request time. */
  readonly sourceId: string;
  readonly authorityClass: Student500AuthorityClass;
  readonly instrumentTitle: string;
  readonly provisionLocator: string;
  /** Federal Register / departmental reference, where one is declared. */
  readonly officialReference: string | null;
  readonly officialUrl: string | null;
  /** Never true in M6.1: the text was not retrieved or checked. */
  readonly urlVerified: false;
  readonly compilationLabel: string | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
  readonly declaredCoverage: Student500DeclaredCoverage;
  readonly verification: Extract<
    Student500SourceVerification,
    "declared_pending_verification" | "unavailable"
  >;
  readonly declarationNote: string;
};

/**
 * Screening coverage of the repository declarations. Deliberately conservative:
 * preparation anchored before this date is not screened by this catalog and is
 * reported as needing verification instead.
 */
export const STUDENT_500_DECLARED_COVERAGE: Student500DeclaredCoverage = {
  from: "2024-01-01",
  to: null,
};

const NOT_RETRIEVED =
  "Declared identity only. The provision text was not retrieved or checked against the authoritative corpus in this environment.";

const INSTRUMENT_NOT_ESTABLISHED =
  "The specific instrument identifier is not established in this environment, so this requirement cannot be attributed to a confirmed legislative instrument.";

const MIGRATION_ACT_URL =
  "https://www.legislation.gov.au/C1958A00062/latest/text";
const MIGRATION_REGULATIONS_URL =
  "https://www.legislation.gov.au/C1994A00268/latest/text";

/** One declared source with the milestone's conservative defaults applied. */
function declared(input: {
  sourceId: string;
  authorityClass: Student500AuthorityClass;
  instrumentTitle: string;
  provisionLocator: string;
  officialReference?: string | null;
  officialUrl?: string | null;
  declarationNote?: string;
  verification?: "declared_pending_verification" | "unavailable";
}): Student500DeclaredLegalSource {
  return {
    authorityClass: input.authorityClass,
    compilationLabel: null,
    declaredCoverage: STUDENT_500_DECLARED_COVERAGE,
    declarationNote: input.declarationNote ?? NOT_RETRIEVED,
    effectiveFrom: null,
    effectiveTo: null,
    instrumentTitle: input.instrumentTitle,
    officialReference: input.officialReference ?? null,
    officialUrl: input.officialUrl ?? null,
    provisionLocator: input.provisionLocator,
    sourceId: input.sourceId,
    urlVerified: false,
    verification: input.verification ?? "declared_pending_verification",
  };
}

const MIGRATION_REGULATIONS = "Migration Regulations 1994 (Cth)";
const MIGRATION_REGULATIONS_REFERENCE = "C1994A00268";

export const STUDENT_500_LEGAL_SOURCES: readonly Student500DeclaredLegalSource[] =
  [
    declared({
      authorityClass: "legislation",
      instrumentTitle: "Migration Act 1958 (Cth)",
      officialReference: "C1958A00062",
      officialUrl: MIGRATION_ACT_URL,
      provisionLocator:
        "Section 65 — decision to grant or refuse to grant a visa",
      sourceId: "au.act.migration-act-1958.s65",
    }),
    declared({
      authorityClass: "legislation",
      instrumentTitle: MIGRATION_REGULATIONS,
      officialReference: MIGRATION_REGULATIONS_REFERENCE,
      officialUrl: MIGRATION_REGULATIONS_URL,
      provisionLocator:
        "Schedule 1 — Student (class TU) valid application requirements",
      sourceId: "au.reg.migration-regulations-1994.sch1.student",
    }),
    declared({
      authorityClass: "legislation",
      instrumentTitle: MIGRATION_REGULATIONS,
      officialReference: MIGRATION_REGULATIONS_REFERENCE,
      officialUrl: MIGRATION_REGULATIONS_URL,
      provisionLocator: "Schedule 2 — Subclass 500 primary criteria",
      sourceId: "au.reg.migration-regulations-1994.sch2.500.primary",
    }),
    declared({
      authorityClass: "legislation",
      instrumentTitle: MIGRATION_REGULATIONS,
      officialReference: MIGRATION_REGULATIONS_REFERENCE,
      officialUrl: MIGRATION_REGULATIONS_URL,
      provisionLocator:
        "Schedule 2 — Subclass 500 secondary criteria (member of the family unit)",
      sourceId: "au.reg.migration-regulations-1994.sch2.500.secondary",
    }),
    declared({
      authorityClass: "legislation",
      instrumentTitle: MIGRATION_REGULATIONS,
      officialReference: MIGRATION_REGULATIONS_REFERENCE,
      officialUrl: MIGRATION_REGULATIONS_URL,
      provisionLocator:
        "Schedule 2 — Subclass 500 visa conditions, including 8104, 8105, 8202, 8501, 8516, 8517, 8532, 8533 and 8208 where applicable",
      sourceId: "au.reg.migration-regulations-1994.sch2.500.conditions",
    }),
    declared({
      authorityClass: "legislation",
      instrumentTitle: MIGRATION_REGULATIONS,
      officialReference: MIGRATION_REGULATIONS_REFERENCE,
      officialUrl: MIGRATION_REGULATIONS_URL,
      provisionLocator:
        "Schedule 4 — public interest criteria referenced by the Subclass 500 criteria",
      sourceId: "au.reg.migration-regulations-1994.sch4.public-interest",
    }),
    declared({
      authorityClass: "legislation",
      instrumentTitle: MIGRATION_REGULATIONS,
      officialReference: MIGRATION_REGULATIONS_REFERENCE,
      officialUrl: MIGRATION_REGULATIONS_URL,
      provisionLocator:
        "Schedule 2 — Subclass 500 criteria concerning applicants under 18 (welfare arrangements)",
      sourceId: "au.reg.migration-regulations-1994.sch2.500.under-18",
    }),
    declared({
      authorityClass: "legislation",
      instrumentTitle: MIGRATION_REGULATIONS,
      officialReference: MIGRATION_REGULATIONS_REFERENCE,
      officialUrl: MIGRATION_REGULATIONS_URL,
      provisionLocator:
        "Schedule 2 — Subclass 500 criteria for applications made in Australia, read with the applicant's current visa and conditions",
      sourceId: "au.reg.migration-regulations-1994.sch2.500.onshore",
    }),
    declared({
      authorityClass: "legislative_instrument",
      declarationNote: INSTRUMENT_NOT_ESTABLISHED,
      instrumentTitle:
        "Legislative instrument setting English language requirements for Subclass 500",
      provisionLocator: "Instrument identifier not established in M6.1",
      sourceId: "au.instrument.subclass-500.english",
      verification: "unavailable",
    }),
    declared({
      authorityClass: "legislative_instrument",
      declarationNote: INSTRUMENT_NOT_ESTABLISHED,
      instrumentTitle:
        "Legislative instrument setting financial capacity requirements for Subclass 500",
      provisionLocator: "Instrument identifier not established in M6.1",
      sourceId: "au.instrument.subclass-500.financial-capacity",
      verification: "unavailable",
    }),
    declared({
      authorityClass: "legislative_instrument",
      declarationNote: INSTRUMENT_NOT_ESTABLISHED,
      instrumentTitle:
        "Legislative instrument and ministerial direction applying the Genuine Student requirement to Subclass 500",
      provisionLocator:
        "Instrument/direction identifier not established in M6.1",
      sourceId: "au.instrument.subclass-500.genuine-student",
      verification: "unavailable",
    }),
    declared({
      authorityClass: "official_guidance",
      declarationNote:
        "Official departmental guidance page declared by the existing legal-service official source registry. Guidance explains requirements; it is not the legislative source of them.",
      instrumentTitle: "Department of Home Affairs",
      officialReference: "immi.homeaffairs.gov.au",
      officialUrl:
        "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
      provisionLocator: "Student visa (subclass 500) visa listing page",
      sourceId: "au.homeaffairs.subclass-500.listing",
    }),
    declared({
      authorityClass: "official_guidance",
      declarationNote:
        "No authoritative departmental document checklist was retrieved in this environment, so checklist completeness cannot be asserted.",
      instrumentTitle: "Department of Home Affairs",
      provisionLocator:
        "Student visa document checklist — not retrieved in this environment",
      sourceId: "au.homeaffairs.subclass-500.document-checklist",
      verification: "unavailable",
    }),
  ];

const BY_ID = new Map(
  STUDENT_500_LEGAL_SOURCES.map((source) => [source.sourceId, source])
);

export function declaredStudent500LegalSource(
  sourceId: string
): Student500DeclaredLegalSource | null {
  return BY_ID.get(sourceId) ?? null;
}

("The specific instrument identifier is not established in this environment, so this requirement cannot be attributed to a confirmed legislative instrument.");
