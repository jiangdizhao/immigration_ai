import type { Student500AuthorityClass } from "./contracts";

/**
 * Phase 13 M6 - versioned official-source manifest (legal authority integration).
 *
 * WHAT THIS IS
 * ------------
 * A bounded, versioned *registry* of the official source identities the Student
 * 500 screening depends on, with an explicit verification basis per version. It is
 * not a corpus: no legislative text is copied into application source code and no
 * hash is invented. Every claim below is either (a) directly observed on the
 * Federal Register in the session that authored this file, or (b) explicitly
 * labelled as unverified.
 *
 * THE RULE THAT MATTERS
 * ---------------------
 * A compilation date is not the date every provision commenced, and a registered
 * amendment can change the law without a new consolidated compilation. So a
 * version carries an *applicability window* and a *commencement note*, and the
 * provider refuses to claim applicability outside a window it can actually
 * support. Reaching `verified_official_corpus` requires retrieved provision text
 * (`verificationBasis: "text_and_provision_retrieved"` with a real `textSha256`),
 * which this environment could not obtain (the Register text endpoints are not
 * machine-readable here). Identity/listing verification alone never upgrades a
 * source to verified.
 */

export const STUDENT_500_SOURCE_MANIFEST_VERSION =
  "m6-legal-manifest-2026-11-04-r2" as const;

/** Verification ladder. Only the first level may support a legal conclusion. */
export type Student500VerificationBasis =
  | "text_and_provision_retrieved"
  | "register_listing_observed"
  | "declared_by_repository"
  | "not_established";

export type Student500ManifestVersion = {
  /** Federal Register compilation/instrument identity, e.g. F2026C01017. */
  readonly versionId: string | null;
  readonly compilationLabel: string | null;
  /** Inclusive applicability window this identity supports. */
  readonly applicabilityFrom: string | null;
  readonly applicabilityTo: string | null;
  readonly commencementNote: string;
  readonly provisionLocator: string;
  readonly officialUrl: string | null;
  readonly verificationBasis: Student500VerificationBasis;
  /** Real content hash only when text was genuinely retrieved. */
  readonly textSha256: string | null;
  readonly verifiedAt: string | null;
  readonly transitionNote: string | null;
};

export type Student500ManifestEntry = {
  readonly sourceId: string;
  readonly authorityClass: Student500AuthorityClass;
  readonly instrumentTitle: string;
  readonly registerSeriesId: string | null;
  readonly officialReference: string | null;
  readonly officialUrl: string | null;
  /** Newest first. An empty list means no identity could be established. */
  readonly versions: readonly Student500ManifestVersion[];
  readonly unavailableReason: string | null;
};

const _REGISTER_LISTING_NOTE =
  "Federal Register listing observed in the authoring session (series page for F1996B03551): latest in-force version shown as F2026C01017 / C289 with the window 02 October 2026 - 31 October 2026. Listing observation verifies identity and window only; it does not verify provision text.";

const C289_WINDOW = {
  applicabilityFrom: "2026-10-02",
  applicabilityTo: "2026-10-31",
} as const;

const C288_DECLARED = {
  applicabilityFrom: "2026-07-01",
  applicabilityTo: "2026-10-01",
} as const;

const REGULATIONS_URL = "https://www.legislation.gov.au/Series/F1996B03551";
const REGULATIONS_SERIES = "F1996B03551";
const REGULATIONS_TITLE = "Migration Regulations 1994 (Cth)";

const REGISTER_TEXT_NOTE =
  "Provision text retrieved from the Federal Register on 2026-11-04 and read directly (compilation C289 header, amending instrument commencement table, Schedule 1 item 1222 amendments, Schedule 2 clauses 500.311/500.315/500.411 and Schedule 13 Part 166 item 16601). " +
  "The stored digest is the SHA-256 of the exact retrieved excerpt recorded in this repository, not a digest of the whole compiled document.";

/**
 * Verified COMPILATION IDENTITY only.
 *
 * The C289 header proves which consolidation was in force, not the content of any
 * particular provision. It is therefore `register_listing_observed` with no
 * provision digest, and every Regulations family that lacks its own provision
 * evidence inherits exactly this level.
 */
const REGULATIONS_COMPILATION_IDENTITY: Student500ManifestVersion = {
  ...C289_WINDOW,
  commencementNote:
    "Compilation 289 states that it shows the text of the law as amended and in force on 2 October 2026 and includes amendments made by F2026L01347. " +
    "The compilation header verifies the compilation identity and date window only; it does not verify the text of any individual provision. " +
    "A compilation date is not commencement for every provision, and amendments registered after 31 October 2026 fall outside this window.",
  compilationLabel: "C289",
  officialUrl: "https://www.legislation.gov.au/Series/F1996B03551",
  provisionLocator: "Compilation identity (C289)",
  textSha256: null,
  transitionNote:
    "VERIFIED TRANSITION (separate instrument): Schedule 13 Part 166 item 16601 provides that the F2026L01347 amendments apply to a visa application made on or after the commencement of Schedule 1 (2 October 2026). Applications made before that date are governed by the prior text.",
  verificationBasis: "register_listing_observed",
  verifiedAt: "2026-11-04",
  versionId: "F2026C01017",
};

/**
 * Provision-level evidence: only these families have text that was retrieved from
 * the Register, identified to the cited provision and bound by digest. Each digest
 * covers the recorded amendment excerpt - not the whole instrument, and never the
 * compilation header used by a different family.
 */
const PROVISION_EVIDENCE: Record<
  string,
  { readonly excerptSha256: string; readonly locator: string }
> = {
  "au.reg.migration-regulations-1994.sch1.student": {
    excerptSha256:
      "69186e0a4ad8b9da378d5e9625fb6915e78539b0a08b38584841f756b763a764",
    locator:
      "Schedule 1 item 1222(3)(aa) as inserted by F2026L01347 (offshore requirement for Subclass 500 holders seeking the primary criteria)",
  },
  "au.reg.migration-regulations-1994.sch2.500.secondary": {
    excerptSha256:
      "fd41e769213d000230134be838b567ad2393534951c6ba690dc820c2dffc0e4f",
    locator: "Schedule 2 clause 500.311 as substituted by F2026L01347",
  },
  "au.reg.migration-regulations-1994.sch2.500.onshore": {
    excerptSha256:
      "a99d3249277981ca6c9cc023393509a6f6b93281246e82e9d0061ac224e44fa3",
    locator:
      "Schedule 2 clause 500.411 as substituted by F2026L01347, read with Schedule 1 item 1222(3)(aa)",
  },
};

const REGULATIONS_VERSIONS: readonly Student500ManifestVersion[] = [
  REGULATIONS_COMPILATION_IDENTITY,
  {
    ...C288_DECLARED,
    commencementNote:
      "Compilation 288 is declared by the M6 integrated plan as the consolidation in force from 1 July 2026. Its identity and window were NOT independently re-verified in the authoring session, and its end date is taken from the start of C289.",
    compilationLabel: "C288",
    officialUrl: "https://www.legislation.gov.au/F2026C00667/latest/text",
    provisionLocator: "Compilation identity (C288, unverified)",
    textSha256: null,
    transitionNote: null,
    verificationBasis: "declared_by_repository",
    verifiedAt: null,
    versionId: "F2026C00667",
  },
];

/**
 * Amending instruments whose text was actually retrieved. They are identity and
 * commencement evidence for the compilation above, not independent criteria.
 */
export const STUDENT_500_VERIFIED_AMENDING_INSTRUMENTS = [
  {
    commencementFrom: "2026-10-02",
    commencementText:
      "The whole of this instrument - The day after this instrument is registered. 2 October 2026",
    drafter: "Office of Parliamentary Counsel (registered 1 October 2026)",
    instrumentId: "F2026L01347",
    officialUrl:
      "https://www.legislation.gov.au/F2026L01347/asmade/2026-10-01/text/original/epub/OEBPS/document_1/document_1.html",
    savingProvision:
      "Schedule 13 Part 166 item 16601 - the amendments apply in relation to an application for a visa made on or after the commencement of Schedule 1.",
    savingProvisionLocator: "Schedule 13, Part 166, item 16601",
    savingTextSha256:
      "d9f0eacd16c461f317dd3a1f3848fb91e62911309dd988dbc6769daaaeffecce",
    textSha256:
      "6a002b193b46f22215616ce087d9c10ed6f03d67967259beee75dc2c328f0bde",
    title: "Migration Amendment (Student Visa Reform) Regulations 2026",
    verifiedAt: "2026-11-04",
  },
] as const;

function regulationsEntry(input: {
  readonly sourceId: string;
  readonly provisionLocator: string;
}): Student500ManifestEntry {
  const evidence = PROVISION_EVIDENCE[input.sourceId];
  return {
    authorityClass: "legislation",
    instrumentTitle: REGULATIONS_TITLE,
    officialReference: REGULATIONS_SERIES,
    officialUrl: REGULATIONS_URL,
    registerSeriesId: REGULATIONS_SERIES,
    sourceId: input.sourceId,
    unavailableReason: null,
    versions: REGULATIONS_VERSIONS.map((version) => {
      if (version.versionId !== "F2026C01017" || !evidence) {
        return { ...version, provisionLocator: input.provisionLocator };
      }
      // Provision-specific evidence: retrieved text, named locator, own digest and
      // the instrument URL the excerpt actually came from.
      return {
        ...version,
        officialUrl:
          "https://www.legislation.gov.au/F2026L01347/asmade/2026-10-01/text/original/epub/OEBPS/document_1/document_1.html",
        provisionLocator: evidence.locator,
        textSha256: evidence.excerptSha256,
        verificationBasis: "text_and_provision_retrieved" as const,
      };
    }),
  };
}

function actEntry(input: {
  readonly sourceId: string;
  readonly provisionLocator: string;
}): Student500ManifestEntry {
  return {
    authorityClass: "legislation",
    instrumentTitle: "Migration Act 1958 (Cth)",
    officialReference: "C1958A00062",
    officialUrl: "https://www.legislation.gov.au/Series/C1958A00062",
    registerSeriesId: "C1958A00062",
    sourceId: input.sourceId,
    unavailableReason: null,
    versions: [
      {
        applicabilityFrom: null,
        applicabilityTo: null,
        commencementNote:
          "Act identity is declared from the existing legal-service source registry. No Act compilation or commencement was retrieved or verified in this environment.",
        compilationLabel: null,
        officialUrl: "https://www.legislation.gov.au/Series/C1958A00062",
        provisionLocator: input.provisionLocator,
        textSha256: null,
        transitionNote: null,
        verificationBasis: "declared_by_repository",
        verifiedAt: null,
        versionId: null,
      },
    ],
  };
}

function unestablishedEntry(input: {
  readonly sourceId: string;
  readonly instrumentTitle: string;
  readonly reason: string;
}): Student500ManifestEntry {
  return {
    authorityClass: "legislative_instrument",
    instrumentTitle: input.instrumentTitle,
    officialReference: null,
    officialUrl: null,
    registerSeriesId: null,
    sourceId: input.sourceId,
    unavailableReason: input.reason,
    versions: [],
  };
}

const GUIDANCE_NOTE =
  "Official departmental guidance declared by the existing legal-service source registry. Guidance explains requirements; it is not the legislative source of them, and its content was not retrieved in this environment.";

/**
 * The 13 declared M6.1 source identities, now carrying verification and
 * applicability metadata. No new instrument id is invented.
 */
export const STUDENT_500_SOURCE_MANIFEST: readonly Student500ManifestEntry[] = [
  actEntry({
    provisionLocator:
      "Section 65 - decision to grant or refuse to grant a visa",
    sourceId: "au.act.migration-act-1958.s65",
  }),
  regulationsEntry({
    provisionLocator:
      "Schedule 1 - Student (class TU) valid application requirements",
    sourceId: "au.reg.migration-regulations-1994.sch1.student",
  }),
  regulationsEntry({
    provisionLocator: "Schedule 2 - Subclass 500 primary criteria",
    sourceId: "au.reg.migration-regulations-1994.sch2.500.primary",
  }),
  regulationsEntry({
    provisionLocator:
      "Schedule 2 - Subclass 500 visa conditions, including 8104, 8105, 8202, 8501, 8516, 8517, 8532, 8533 and 8208 where applicable",
    sourceId: "au.reg.migration-regulations-1994.sch2.500.conditions",
  }),
  regulationsEntry({
    provisionLocator:
      "Schedule 2 - Subclass 500 secondary criteria (member of the family unit)",
    sourceId: "au.reg.migration-regulations-1994.sch2.500.secondary",
  }),
  regulationsEntry({
    provisionLocator:
      "Schedule 2 - Subclass 500 criteria concerning applicants under 18 (welfare arrangements)",
    sourceId: "au.reg.migration-regulations-1994.sch2.500.under-18",
  }),
  regulationsEntry({
    provisionLocator:
      "Schedule 2 - Subclass 500 criteria for applications made in Australia, read with the applicant's current visa and conditions",
    sourceId: "au.reg.migration-regulations-1994.sch2.500.onshore",
  }),
  regulationsEntry({
    provisionLocator:
      "Schedule 4 - public interest criteria referenced by the Subclass 500 criteria",
    sourceId: "au.reg.migration-regulations-1994.sch4.public-interest",
  }),
  unestablishedEntry({
    instrumentTitle:
      "Legislative instrument setting English language requirements for Subclass 500",
    reason:
      "No English-language instrument identity could be established from an official source in this environment. F2025L00906 is recorded in the legal-service registry but its title, version and applicability were not verified here, so it is not adopted.",
    sourceId: "au.instrument.subclass-500.english",
  }),
  unestablishedEntry({
    instrumentTitle:
      "Legislative instrument setting financial capacity requirements for Subclass 500",
    reason:
      "No financial-capacity instrument identity could be established from an official source in this environment. F2019L01366 is recorded in the legal-service registry but its currency and applicability were not verified here, so it is not adopted.",
    sourceId: "au.instrument.subclass-500.financial-capacity",
  }),
  unestablishedEntry({
    instrumentTitle:
      "Legislative instrument and ministerial direction applying the Genuine Student requirement to Subclass 500",
    reason:
      "The Genuine Student requirement is not assumed to rest on a single instrument or direction. No official identifier was established in this environment, so legislation, instruments, directions and policy remain distinguishable but unverified.",
    sourceId: "au.instrument.subclass-500.genuine-student",
  }),
  {
    authorityClass: "official_guidance",
    instrumentTitle: "Department of Home Affairs",
    officialReference: "immi.homeaffairs.gov.au",
    officialUrl:
      "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
    registerSeriesId: null,
    sourceId: "au.homeaffairs.subclass-500.listing",
    unavailableReason: null,
    versions: [
      {
        applicabilityFrom: null,
        applicabilityTo: null,
        commencementNote: GUIDANCE_NOTE,
        compilationLabel: null,
        officialUrl:
          "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
        provisionLocator: "Student visa (subclass 500) visa listing page",
        textSha256: null,
        transitionNote: null,
        verificationBasis: "declared_by_repository",
        verifiedAt: null,
        versionId: null,
      },
    ],
  },
  {
    authorityClass: "official_guidance",
    instrumentTitle: "Department of Home Affairs",
    officialReference: "immi.homeaffairs.gov.au",
    officialUrl: "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool",
    registerSeriesId: null,
    sourceId: "au.homeaffairs.subclass-500.document-checklist",
    unavailableReason:
      "The official Document Checklist Tool requires applicant-specific inputs (passport country, education provider) and offered no machine-readable interface; no official checklist result was retrieved.",
    versions: [],
  },
];

const BY_ID = new Map(
  STUDENT_500_SOURCE_MANIFEST.map((entry) => [entry.sourceId, entry])
);

export function manifestStudent500LegalSource(
  sourceId: string
): Student500ManifestEntry | null {
  return BY_ID.get(sourceId) ?? null;
}

/**
 * Verified applicability coverage of the manifest: the union of windows the
 * manifest can actually support. Anything outside is reported as uncovered
 * instead of being answered from the newest label.
 */
export const STUDENT_500_MANIFEST_VERIFIED_COVERAGE: {
  readonly windows: readonly { readonly from: string; readonly to: string }[];
  readonly note: string;
} = {
  note: "Only the 2-31 October 2026 window rests on an observed Register listing. The declared 1 July - 1 October 2026 window and any date after 31 October 2026 are not independently verified in this environment.",
  windows: [{ from: "2026-10-02", to: "2026-10-31" }],
};
