// biome-ignore-all lint/suspicious/noMisplacedAssertion: helpers assert inside test scope.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeStudent500Context,
  type Student500ContextInput,
} from "./contracts";
import { STUDENT_500_LEGAL_SOURCES } from "./legal-source-catalog";
import {
  createManifestStudent500LegalSourceProvider,
  resolveStudent500LegalSourceProvider,
} from "./legal-source-provider";
import { resolveStudent500OfficialChecklist } from "./official-checklist";
import {
  manifestStudent500LegalSource,
  STUDENT_500_SOURCE_MANIFEST,
  STUDENT_500_SOURCE_MANIFEST_VERSION,
  STUDENT_500_VERIFIED_AMENDING_INSTRUMENTS,
} from "./official-source-manifest";
import { resolveStudent500Screening } from "./requirement-resolver";

/**
 * Phase 13 M6 - official-source manifest, temporal applicability and checklist
 * integrity tests (OFFLINE).
 *
 * These do NOT constitute independent legal verification. They prove the
 * integration behaves honestly: identity-only sources are never upgraded, a
 * compilation label is never treated as commencement, and anything outside a
 * verified window stays UNKNOWN.
 */

const provider = createManifestStudent500LegalSourceProvider();

const CONTEXT: Student500ContextInput = {
  applicationPlace: "onshore",
  asOfDate: "2026-10-02",
  coeStatus: "reported_held",
  currentVisaSubclass: "500",
  dependants: "none",
  entryRoute: "existing_coe",
  historyDeclaration: "declared_none",
};

async function resolveSource(sourceId: string, asOfDate: string | null) {
  const [source] = await provider.resolve({ asOfDate, sourceIds: [sourceId] });
  assert.ok(source);
  return source;
}

async function screen(
  overrides: Partial<Student500ContextInput> = {},
  options: { readonly customerReportedChecklistResult?: boolean } = {}
) {
  return await resolveStudent500Screening({
    context: normalizeStudent500Context({ ...CONTEXT, ...overrides }),
    customerReportedChecklistResult: options.customerReportedChecklistResult,
    linkedSchoolApplication: null,
    provider,
  });
}

test("the manifest covers every declared source without inventing identities", () => {
  const declaredIds = STUDENT_500_LEGAL_SOURCES.map(
    (entry) => entry.sourceId
  ).sort();
  const manifestIds = STUDENT_500_SOURCE_MANIFEST.map(
    (entry) => entry.sourceId
  ).sort();
  assert.deepEqual(manifestIds, declaredIds);
  assert.equal(manifestIds.length, 13);
  for (const entry of STUDENT_500_SOURCE_MANIFEST) {
    for (const version of entry.versions) {
      // A content hash exists only when text was actually retrieved.
      if (version.verificationBasis !== "text_and_provision_retrieved") {
        assert.equal(version.textSha256, null, entry.sourceId);
      }
    }
  }
});

test("a URL alone verifies nothing; retrieved provision text does", async () => {
  // The Act source carries a real official URL but no retrieved compilation, so a
  // non-empty URL must not become urlVerified or any verification state.
  const act = await resolveSource(
    "au.act.migration-act-1958.s65",
    "2026-10-15"
  );
  assert.ok(act.officialUrl);
  assert.equal(act.urlVerified, false);
  assert.equal(act.identityVerified, false);
  assert.equal(act.textVerified, false);
  assert.equal(act.applicabilityVerified, false);
  assert.notEqual(act.verification, "verified_official_corpus");

  // The Regulations for 2-31 October 2026 rest on text actually retrieved from the
  // Federal Register, with a recorded excerpt digest and verified commencement.
  // A Regulations family WITHOUT its own retrieved provision text carries the
  // verified compilation identity but never provision-level verification.
  const primary = await resolveSource(
    "au.reg.migration-regulations-1994.sch2.500.primary",
    "2026-10-15"
  );
  assert.equal(primary.legalSourceVersionId, "F2026C01017");
  assert.equal(primary.effectiveFrom, "2026-10-02");
  assert.equal(primary.effectiveTo, "2026-10-31");
  assert.equal(primary.verificationBasis, "register_listing_observed");
  assert.equal(primary.identityVerified, true);
  assert.equal(primary.textVerified, false);
  assert.equal(primary.applicabilityVerified, false);
  assert.equal(primary.verification, "declared_pending_verification");
  assert.equal(primary.urlVerified, true);

  // A family WITH retrieved, identified and digested provision text does verify.
  const secondary = await resolveSource(
    "au.reg.migration-regulations-1994.sch2.500.secondary",
    "2026-10-15"
  );
  assert.equal(secondary.verificationBasis, "text_and_provision_retrieved");
  assert.match(secondary.provisionLocator, /500\.311/u);
  assert.equal(secondary.textVerified, true);
  assert.equal(secondary.applicabilityVerified, true);
  assert.equal(secondary.verification, "verified_official_corpus");
});

test("same series URL, different version identities per as-of date", async () => {
  const before = await resolveSource(
    "au.reg.migration-regulations-1994.sch1.student",
    "2026-09-30"
  );
  const after = await resolveSource(
    "au.reg.migration-regulations-1994.sch1.student",
    "2026-10-02"
  );
  assert.equal(before.legalSourceVersionId, "F2026C00667");
  assert.equal(after.legalSourceVersionId, "F2026C01017");
  assert.notEqual(before.legalSourceVersionId, after.legalSourceVersionId);
  // Same instrument, different compilation identity and different basis.
  assert.equal(before.verificationBasis, "declared_by_repository");
  assert.equal(after.verificationBasis, "text_and_provision_retrieved");
  assert.equal(after.verification, "verified_official_corpus");
});

test("a historical date does not borrow a future rule", async () => {
  const historical = await resolveSource(
    "au.reg.migration-regulations-1994.sch2.500.primary",
    "2025-03-01"
  );
  assert.equal(historical.asOfCoverage, "outside_declared_coverage");
  const screening = await screen({ asOfDate: "2025-03-01" });
  const onshore = screening.requirements.find(
    (entry) => entry.requirementKey === "onshore_application_restrictions"
  );
  assert.ok(onshore);
  assert.equal(onshore.status, "unknown");
  assert.equal(
    onshore.reasonCode,
    "not_assessable_as_of_date_outside_declared_coverage"
  );
  // A fallback compilation must never be reported as the applicable version for
  // an uncovered date.
  assert.equal(screening.legalSourceVersions.length, 0);
});

test("the 2 October 2026 boundary follows the verified saving provision", async () => {
  const before = await screen({ asOfDate: "2026-10-01" });
  const after = await screen({ asOfDate: "2026-10-02" });
  const pick = (screening: typeof before, key: string) => {
    const found = screening.requirements.find(
      (entry) => entry.requirementKey === key
    );
    assert.ok(found);
    return found;
  };
  // Before commencement only the declared earlier compilation is available, so the
  // dimension stays conditional rather than borrowing the later rule.
  const beforeOnshore = pick(before, "onshore_application_restrictions");
  assert.equal(beforeOnshore.status, "conditional");
  assert.notEqual(beforeOnshore.sourceVerification, "verified_official_corpus");
  // On and after 2 October 2026 the retrieved compilation text applies.
  assert.equal(
    pick(after, "onshore_application_restrictions").sourceVerification,
    "verified_official_corpus"
  );
  assert.equal(before.legalSourceVersions.includes("F2026C00667"), true);
  assert.equal(after.legalSourceVersions.includes("F2026C01017"), true);
  // Schedule 13 Part 166 item 16601: the amendments apply to applications made on
  // or after commencement, so the earlier date must not be assessed under them.
  assert.match(
    String(after.legalSourceTransitionNote),
    /16601|2 October 2026/u
  );
  assert.equal(before.legalSourceTransitionNote, null);
});

test("dates after the verified window stay unknown instead of using the newest label", async () => {
  const screening = await screen({ asOfDate: "2026-11-04" });
  const onshore = screening.requirements.find(
    (entry) => entry.requirementKey === "onshore_application_restrictions"
  );
  assert.ok(onshore);
  assert.equal(onshore.status, "unknown");
  assert.equal(
    onshore.reasonCode,
    "not_assessable_as_of_date_outside_declared_coverage"
  );
  assert.equal(
    screening.humanReviewReasons.includes("legal_source_not_verified"),
    true
  );
  assert.equal(
    screening.humanReviewReasons.includes(
      "as_of_date_outside_declared_coverage"
    ),
    true
  );
});

test("an unestablished instrument is insufficient authority, never guidance", async () => {
  const source = await resolveSource(
    "au.instrument.subclass-500.genuine-student",
    "2026-10-15"
  );
  assert.equal(source.verification, "insufficient_authority");
  assert.equal(source.legalSourceVersionId, null);
  assert.equal(source.textVerified, false);
  const screening = await screen({ asOfDate: "2026-10-15" });
  const genuine = screening.requirements.find(
    (entry) => entry.requirementKey === "genuine_student"
  );
  assert.ok(genuine);
  // The statutory criteria still exist, so the dimension is not erased; what the
  // missing instrument destroys is any claim that the requirement is fully
  // sourced, so it stays review-required and its instrument source is reported as
  // insufficient authority rather than silently treated as guidance.
  assert.equal(
    genuine.sources.some(
      (source) => source.verification === "insufficient_authority"
    ),
    true
  );
  assert.equal(genuine.humanReviewRequired, true);
  assert.notEqual(genuine.sourceVerification, "verified_official_corpus");
});

test("only retrieved text can support a verified corpus state", async () => {
  const real = await screen({ asOfDate: "2026-10-15" });
  // Verified: dimensions whose sources are the retrieved regulations text.
  assert.equal(
    real.requirements.some(
      (entry) => entry.sourceVerification === "verified_official_corpus"
    ),
    true
  );
  // Never verified: dimensions that still depend on an unestablished instrument.
  const genuine = real.requirements.find(
    (entry) => entry.requirementKey === "genuine_student"
  );
  assert.ok(genuine);
  assert.notEqual(genuine.sourceVerification, "verified_official_corpus");
  // And the declared-catalog provider still cannot verify anything, even on the
  // same date: declaration alone is never evidence.
  const declared = await resolveStudent500Screening({
    context: normalizeStudent500Context({ ...CONTEXT, asOfDate: "2026-10-15" }),
    linkedSchoolApplication: null,
    provider: resolveStudent500LegalSourceProvider({ provider: "declared" }),
  });
  assert.equal(
    declared.requirements.every(
      (entry) => entry.sourceVerification !== "verified_official_corpus"
    ),
    true
  );
  // The declared provider names itself; it never borrows the manifest revision.
  assert.equal(
    declared.legalSourceRevision,
    "declared-official-source-catalog.v1"
  );
});

test("screening exposes the legal-source revision and never claims submission readiness", async () => {
  const screening = await screen({ asOfDate: "2026-10-15" });
  assert.equal(
    screening.legalSourceRevision,
    `official-source-manifest.${STUDENT_500_SOURCE_MANIFEST_VERSION}`
  );
  assert.equal(screening.submissionStatus, "not_submission_ready");
  assert.equal(screening.officialChecklist.status, "unavailable_manual_check");
  assert.deepEqual(
    [...screening.officialChecklist.missingToolInputs],
    ["passport_country", "education_provider"]
  );
  assert.equal(
    screening.humanReviewReasons.includes("official_checklist_unavailable"),
    true
  );
});

test("a customer-reported checklist is never an official retrieval", () => {
  const context = normalizeStudent500Context({ ...CONTEXT });
  const reported = resolveStudent500OfficialChecklist({
    context,
    customerReportedResult: true,
  });
  assert.equal(reported.status, "customer_reported");
  assert.equal(reported.customerReportedResult, true);
  assert.equal(reported.retrievedAt, null);
  assert.equal(
    reported.legalSourceVerification,
    "declared_pending_verification"
  );
});

test("runtime selection defaults to the manifest adapter and supports rollback", () => {
  assert.match(
    resolveStudent500LegalSourceProvider().providerId,
    /^official-source-manifest\./u
  );
  assert.equal(
    resolveStudent500LegalSourceProvider({ provider: "declared" }).providerId,
    "declared-official-source-catalog.v1"
  );
  assert.ok(manifestStudent500LegalSource("au.act.migration-act-1958.s65"));
  assert.equal(manifestStudent500LegalSource("unknown.source"), null);
});

test("a compilation-header digest cannot verify unrelated provision families", async () => {
  // The C289 header digest exists and is genuine evidence of the compilation
  // identity. It must never be reused as proof of Schedule 2 conditions, the
  // under-18 provisions or Schedule 4 public-interest criteria.
  const headerDigest =
    "384df2e63c7cbdfc2bfcf7e82ee8c6f8f861a9b737b058bb3aadbaee42ed9160";
  const families = [
    "au.reg.migration-regulations-1994.sch2.500.conditions",
    "au.reg.migration-regulations-1994.sch2.500.under-18",
    "au.reg.migration-regulations-1994.sch4.public-interest",
    "au.reg.migration-regulations-1994.sch2.500.primary",
  ] as const;
  for (const sourceId of families) {
    const source = await resolveSource(sourceId, "2026-10-15");
    // Genuine compilation identity and window are preserved.
    assert.equal(source.legalSourceVersionId, "F2026C01017", sourceId);
    assert.equal(source.compilationLabel, "C289", sourceId);
    assert.equal(source.effectiveFrom, "2026-10-02", sourceId);
    assert.equal(source.effectiveTo, "2026-10-31", sourceId);
    assert.ok(source.officialUrl, sourceId);
    // But no provision-level verification is claimed for them.
    assert.equal(
      source.verificationBasis,
      "register_listing_observed",
      sourceId
    );
    assert.equal(source.textVerified, false, sourceId);
    assert.equal(source.applicabilityVerified, false, sourceId);
    assert.equal(
      source.verification,
      "declared_pending_verification",
      sourceId
    );
    // And the header digest is never attached to a different family.
    assert.notEqual(source.textSha256, headerDigest, sourceId);
    assert.equal(source.textSha256, null, sourceId);
  }

  // The requirements that depend on those families stay review-required.
  const screening = await screen({ asOfDate: "2026-10-15" });
  for (const key of [
    "student_visa_conditions_acknowledgement",
    "under_18_welfare_arrangements",
    "health_public_interest",
    "character_public_interest",
  ]) {
    const assessment = screening.requirements.find(
      (entry) => entry.requirementKey === key
    );
    assert.ok(assessment, key);
    assert.equal(assessment.humanReviewRequired, true, key);
    assert.notEqual(
      assessment.sourceVerification,
      "verified_official_corpus",
      key
    );
  }
  assert.equal(screening.submissionStatus, "not_submission_ready");
});

test("genuine commencement and transition evidence survives the correction", async () => {
  const instrument = STUDENT_500_VERIFIED_AMENDING_INSTRUMENTS[0];
  assert.equal(instrument.instrumentId, "F2026L01347");
  assert.equal(instrument.commencementFrom, "2026-10-02");
  assert.match(
    instrument.commencementText,
    /day after this instrument is registered/u
  );
  assert.match(instrument.savingProvision, /item 16601/u);
  assert.match(instrument.savingProvision, /on or after the commencement/u);
  assert.match(instrument.savingTextSha256, /^[0-9a-f]{64}$/u);
  // The transition is surfaced to customers and uncovered dates stay unknown.
  const after = await screen({ asOfDate: "2026-10-02" });
  assert.match(String(after.legalSourceTransitionNote), /16601/u);
  const beyond = await screen({ asOfDate: "2026-11-04" });
  const onshore = beyond.requirements.find(
    (entry) => entry.requirementKey === "onshore_application_restrictions"
  );
  assert.ok(onshore);
  assert.equal(onshore.status, "unknown");
  assert.equal(
    onshore.reasonCode,
    "not_assessable_as_of_date_outside_declared_coverage"
  );
  assert.equal(beyond.submissionStatus, "not_submission_ready");
});
