// biome-ignore-all lint/suspicious/noMisplacedAssertion: helpers assert inside test scope.
// biome-ignore-all lint/suspicious/useAwait: tests await asynchronous screening by contract.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeStudent500Context,
  STUDENT_500_REQUIREMENT_KEYS,
  type Student500Context,
  type Student500ContextInput,
} from "./contracts";
import {
  createDeclaredStudent500LegalSourceProvider,
  type Student500LegalSourceProvider,
} from "./legal-source-provider";
import {
  resolveStudent500Screening,
  type Student500Screening,
  student500MissingFactCodes,
} from "./requirement-resolver";

/**
 * Phase 13 M6.1 legal-applicability acceptance tests (offline).
 *
 * These prove the behaviour the milestone promises: date-aware and
 * circumstance-aware requirement selection, honest uncertainty when a screening
 * fact or a legal source is missing, and no fabricated verification anywhere.
 */

const provider = createDeclaredStudent500LegalSourceProvider();

function context(input: Student500ContextInput = {}): Student500Context {
  return normalizeStudent500Context(input);
}

async function screen(
  input: Student500ContextInput,
  options: {
    readonly provider?: Student500LegalSourceProvider;
    readonly linkedSchoolApplication?: {
      readonly schoolApplicationId: string;
      readonly status: string;
      readonly sourceStatus: string;
      readonly available: boolean;
    } | null;
  } = {}
): Promise<Student500Screening> {
  return await resolveStudent500Screening({
    context: context(input),
    linkedSchoolApplication: options.linkedSchoolApplication ?? null,
    provider: options.provider ?? provider,
  });
}

function requirement(screening: Student500Screening, key: string) {
  const found = screening.requirements.find(
    (entry) => entry.requirementKey === key
  );
  assert.ok(found, `requirement ${key} missing`);
  return found;
}

const completeOnshoreCoE: Student500ContextInput = {
  applicantAgeBand: "adult",
  applicationPlace: "onshore",
  asOfDate: "2026-11-03",
  coeStatus: "reported_held",
  currentVisaSubclass: "500",
  dependants: "none",
  englishEvidence: "reported_held",
  entryRoute: "existing_coe",
  financialEvidence: "reported_held",
  historyDeclaration: "declared_none",
  oshcEvidence: "reported_held",
};

test("all fourteen bounded requirement dimensions are always returned", async () => {
  const screening = await screen({});
  assert.equal(
    screening.requirements.length,
    STUDENT_500_REQUIREMENT_KEYS.length
  );
  assert.deepEqual(
    screening.requirements.map((entry) => entry.requirementKey),
    [...STUDENT_500_REQUIREMENT_KEYS]
  );
  assert.equal(screening.schemaVersion, "phase13.student500-screening.v1");
  assert.equal(screening.submissionStatus, "not_submission_ready");
});

test("an existing-CoE applicant needs no school application and is not blocked", async () => {
  const screening = await screen(completeOnshoreCoE);
  assert.equal(
    requirement(screening, "study_evidence_coe_or_alternative").status,
    "applicable"
  );
  assert.equal(
    screening.missingFactCodes.includes("linked_school_application"),
    false
  );
  assert.equal(screening.studyEvidence.route, "existing_coe");
  // A customer-reported CoE is never presented as verified.
  assert.equal(
    screening.studyEvidence.coeVerification,
    "customer_reported_not_verified"
  );
  assert.ok(
    screening.disclosures.includes("study_evidence_not_independently_verified")
  );
  assert.equal(screening.preparationState, "screening_complete_pending_review");
});

test("offer-only never becomes CoE-ready and stays conditional", async () => {
  const screening = await screen({
    ...completeOnshoreCoE,
    coeStatus: "reported_not_held",
    entryRoute: "offer_only",
  });
  const study = requirement(screening, "study_evidence_coe_or_alternative");
  assert.equal(study.status, "conditional");
  assert.equal(study.reasonCode, "selected_by_study_evidence_route");
  assert.equal(screening.studyEvidence.coeVerification, "none_reported");
  assert.equal(screening.submissionStatus, "not_submission_ready");
});

test("a school-application-in-progress route asks for the link, not a new school", async () => {
  const withoutLink = await screen({
    ...completeOnshoreCoE,
    coeStatus: "reported_not_held",
    entryRoute: "school_application_in_progress",
  });
  assert.ok(withoutLink.missingFactCodes.includes("linked_school_application"));
  assert.equal(withoutLink.nextAction, "connect_school_application");
  assert.equal(
    requirement(withoutLink, "study_evidence_coe_or_alternative").status,
    "conditional"
  );

  const linked = await screen(
    {
      ...completeOnshoreCoE,
      coeStatus: "reported_not_held",
      entryRoute: "school_application_in_progress",
      schoolApplicationId: "11111111-1111-4111-8111-111111111111",
    },
    {
      linkedSchoolApplication: {
        available: true,
        schoolApplicationId: "11111111-1111-4111-8111-111111111111",
        sourceStatus: "unverified_customer_declared",
        status: "preparing",
      },
    }
  );
  assert.equal(
    linked.missingFactCodes.includes("linked_school_application"),
    false
  );
  assert.equal(linked.studyEvidence.linkedSchoolApplication?.available, true);
  assert.equal(
    linked.studyEvidence.linkedSchoolApplication?.status,
    "preparing"
  );
});

test("onshore and offshore contexts select different applicable checks", async () => {
  const onshore = await screen(completeOnshoreCoE);
  const offshore = await screen({
    ...completeOnshoreCoE,
    applicationPlace: "offshore",
    currentVisaSubclass: null,
  });

  // Onshore restrictions are transition-sensitive: the applicable compilation's
  // commencement is not text-verified in this environment, so the dimension stays
  // conditional rather than asserting the pre- or post-transition rule.
  assert.equal(
    requirement(onshore, "onshore_application_restrictions").status,
    "conditional"
  );
  assert.equal(
    requirement(onshore, "onshore_application_restrictions").reasonCode,
    "conditionally_applicable_pending_legal_verification"
  );
  assert.equal(
    requirement(onshore, "offshore_application_entry").status,
    "not_applicable"
  );
  assert.equal(
    requirement(offshore, "offshore_application_entry").status,
    "applicable"
  );
  assert.equal(
    requirement(offshore, "onshore_application_restrictions").status,
    "not_applicable"
  );
  // An offshore applicant is not asked for an onshore visa subclass.
  assert.equal(
    offshore.missingFactCodes.includes("current_visa_subclass"),
    false
  );
  assert.equal(
    onshore.missingFactCodes.includes("current_visa_subclass"),
    false
  );
});

test("an unknown place is unknown, and is never treated as offshore or onshore", async () => {
  const screening = await screen({
    ...completeOnshoreCoE,
    applicationPlace: "unknown",
    currentVisaSubclass: null,
  });
  for (const key of [
    "onshore_application_restrictions",
    "offshore_application_entry",
  ]) {
    const entry = requirement(screening, key);
    assert.equal(entry.status, "unknown");
    assert.equal(entry.reasonCode, "unknown_application_place_missing");
    assert.equal(entry.humanReviewRequired, true);
  }
  assert.ok(screening.missingFactCodes.includes("application_place"));
  assert.equal(screening.nextAction, "set_application_place");
});

test("an as-of date outside the declared coverage makes the checklist unknown", async () => {
  const historic = await screen({
    ...completeOnshoreCoE,
    asOfDate: "2021-05-05",
  });
  assert.equal(historic.counts.unknown, STUDENT_500_REQUIREMENT_KEYS.length);
  assert.ok(
    historic.humanReviewReasons.includes("as_of_date_outside_declared_coverage")
  );
  for (const entry of historic.requirements) {
    assert.equal(
      entry.reasonCode,
      "not_assessable_as_of_date_outside_declared_coverage"
    );
    assert.equal(entry.humanReviewRequired, true);
  }
  assert.equal(historic.submissionStatus, "not_submission_ready");

  // The same context on a covered date is assessed again.
  const current = await screen(completeOnshoreCoE);
  assert.notEqual(current.counts.unknown, STUDENT_500_REQUIREMENT_KEYS.length);
});

test("a missing as-of date is a first-class unknown, not today's law", async () => {
  const screening = await screen({ ...completeOnshoreCoE, asOfDate: null });
  assert.equal(screening.asOfDate, null);
  assert.ok(screening.missingFactCodes.includes("as_of_date"));
  assert.equal(screening.nextAction, "set_as_of_date");
  // With no date the coverage cannot be confirmed, and that is disclosed.
  for (const entry of screening.requirements) {
    assert.equal(
      entry.sources.some((source) => source.asOfCoverage === "unknown"),
      true
    );
  }
});

test("declared refusals raise human review without deciding eligibility", async () => {
  const screening = await screen({
    ...completeOnshoreCoE,
    historyDeclaration: "declared_some",
    historyFlags: [{ flag: "prior_visa_refusal", reportedOn: "2024-02-02" }],
  });
  assert.ok(
    screening.humanReviewReasons.includes(
      "prior_refusal_or_cancellation_declared"
    )
  );
  assert.equal(
    requirement(screening, "prior_immigration_history_disclosure").status,
    "applicable"
  );
  assert.equal(screening.nextAction, "seek_human_review");
  // No requirement is ever phrased as a determination.
  for (const entry of screening.requirements) {
    assert.notEqual(entry.status, "met");
    assert.notEqual(entry.sourceVerification, "verified_official_corpus");
  }
});

test("under-18 and dependant circumstances add their own dimensions", async () => {
  const screening = await screen({
    ...completeOnshoreCoE,
    applicantAgeBand: "under_18",
    dependants: "one_or_more",
  });
  assert.equal(
    requirement(screening, "under_18_welfare_arrangements").status,
    "applicable"
  );
  // Family-member requirements are transition-sensitive (the 2 October 2026
  // package concerns family-member arrangements), so they stay conditional while
  // commencement is not text-verified.
  assert.equal(
    requirement(screening, "family_unit_member_requirements").status,
    "conditional"
  );
  assert.ok(screening.humanReviewReasons.includes("applicant_under_18"));
  assert.ok(
    screening.humanReviewReasons.includes("dependant_family_member_declared")
  );
});

test("an unknown age band is not evidence of being under 18", async () => {
  const screening = await screen({
    ...completeOnshoreCoE,
    applicantAgeBand: "unknown",
  });
  const entry = requirement(screening, "under_18_welfare_arrangements");
  assert.equal(entry.status, "unknown");
  assert.equal(
    screening.humanReviewReasons.includes("applicant_under_18"),
    false
  );
  assert.ok(screening.missingFactCodes.includes("applicant_age_band"));
});

test("a requirement with no legislative source can never be asserted", async () => {
  const providerWithoutLegislation: Student500LegalSourceProvider = {
    providerId: "test-guidance-only",
    resolve({ sourceIds }) {
      return Promise.resolve(
        sourceIds.map((sourceId) => ({
          asOfCoverage: "covered" as const,
          authorityClass: "official_guidance" as const,
          compilationLabel: null,
          declarationNote: "guidance only",
          effectiveFrom: null,
          effectiveTo: null,
          instrumentTitle: "Department of Home Affairs",
          officialReference: null,
          officialUrl: null,
          provisionLocator: "guidance page",
          sourceId,
          urlVerified: false,
          verification: "declared_pending_verification" as const,
          applicabilityVerified: false,
          identityVerified: false,
          legalSourceVersionId: null,
          textVerified: false,
          transitionNote: null,
          textSha256: null,
          verificationBasis: "declared_by_repository" as const,
          verifiedAt: null,
        }))
      );
    },
  };
  const screening = await screen(completeOnshoreCoE, {
    provider: providerWithoutLegislation,
  });
  for (const entry of screening.requirements) {
    assert.equal(entry.sourceVerification, "insufficient_authority");
    assert.equal(entry.status, "unknown");
    assert.equal(entry.reasonCode, "not_assessable_no_legislative_source");
  }
  assert.equal(screening.preparationState, "screening_complete_pending_review");
  assert.equal(screening.nextAction, "seek_human_review");
});

test("an unavailable instrument is disclosed and forces human review", async () => {
  const screening = await screen(completeOnshoreCoE);
  const english = requirement(screening, "english_language_evidence");
  assert.equal(english.sourceVerification, "unavailable");
  assert.equal(english.humanReviewRequired, true);
  assert.ok(
    english.sources.some(
      (source) =>
        source.authorityClass === "legislative_instrument" &&
        source.verification === "unavailable"
    )
  );
  assert.ok(screening.humanReviewReasons.includes("legal_source_not_verified"));
  assert.ok(
    screening.humanReviewReasons.includes("official_checklist_unavailable")
  );
});

test("every requirement carries source identity, locator and verification state", async () => {
  const screening = await screen(completeOnshoreCoE);
  for (const entry of screening.requirements) {
    assert.ok(entry.sources.length > 0, entry.requirementKey);
    for (const source of entry.sources) {
      assert.equal(typeof source.sourceId, "string");
      assert.equal(typeof source.provisionLocator, "string");
      assert.equal(source.provisionLocator.length > 0, true);
      // Offline declarations are never claimed as retrieved text.
      assert.equal(source.urlVerified, false);
      if (source.officialUrl !== null) {
        assert.match(source.officialUrl, /^https:\/\//u);
      }
      assert.ok(
        [
          "declared_pending_verification",
          "insufficient_authority",
          "unavailable",
        ].includes(source.verification)
      );
    }
  }
});

test("missing screening facts are reported per route, not universally", () => {
  const empty = student500MissingFactCodes(context({}));
  assert.deepEqual(empty, [
    "study_evidence_route",
    "application_place",
    "as_of_date",
    "immigration_history",
    "applicant_age_band",
    "dependants",
    "english_evidence",
    "financial_evidence",
    "oshc_evidence",
  ]);
  const complete = student500MissingFactCodes(context(completeOnshoreCoE));
  assert.deepEqual(complete, []);
});

test("the same context always produces the same screening", async () => {
  const first = await screen(completeOnshoreCoE);
  const second = await screen(completeOnshoreCoE);
  assert.deepEqual(first, second);
});

test("an unresolved source id is an internal defect, not a silent pass", async () => {
  const brokenProvider: Student500LegalSourceProvider = {
    providerId: "broken",
    resolve() {
      return Promise.resolve([]);
    },
  };
  await assert.rejects(
    () => screen(completeOnshoreCoE, { provider: brokenProvider }),
    /student_500_legal_source_unresolved/u
  );
});

test("no declared-only requirement looks exempt from legal review", async () => {
  const screening = await screen(completeOnshoreCoE);
  assert.equal(
    screening.requirements.filter((entry) => entry.humanReviewRequired !== true)
      .length,
    0,
    "every requirement must stay flagged for legal review while sources are unverified"
  );
  for (const entry of screening.requirements) {
    assert.notEqual(entry.sourceVerification, "verified_official_corpus");
    assert.ok(
      entry.sources.every(
        (source) => source.verification !== "verified_official_corpus"
      ),
      entry.requirementKey
    );
    // Even a clear `applicable`/`not_applicable` outcome needs review, because the
    // legal basis itself was never verified.
    assert.equal(entry.humanReviewRequired, true, entry.requirementKey);
  }
  assert.ok(screening.humanReviewReasons.includes("legal_source_not_verified"));
  assert.equal(screening.submissionStatus, "not_submission_ready");
});

test("only a verified official source can clear the per-requirement review flag", async () => {
  // Simulates a future authoritative adapter: this is the *only* input that may
  // lift `humanReviewRequired` for an otherwise-clear dimension.
  const verifiedProvider: Student500LegalSourceProvider = {
    providerId: "test-verified",
    resolve({ sourceIds }) {
      return Promise.resolve(
        sourceIds.map((sourceId) => ({
          asOfCoverage: "covered" as const,
          authorityClass: "legislation" as const,
          compilationLabel: "test-compilation",
          declarationNote: "retrieved and checked",
          effectiveFrom: null,
          effectiveTo: null,
          instrumentTitle: "Migration Regulations 1994 (Cth)",
          officialReference: "C1994A00268",
          officialUrl: null,
          provisionLocator: "test locator",
          sourceId,
          urlVerified: true,
          verification: "verified_official_corpus" as const,
          applicabilityVerified: true,
          identityVerified: true,
          legalSourceVersionId: "F2026C01017",
          textVerified: true,
          transitionNote: null,
          textSha256: "0".repeat(64),
          verificationBasis: "text_and_provision_retrieved" as const,
          verifiedAt: "2026-11-04",
        }))
      );
    },
  };
  const screening = await screen(
    {
      ...completeOnshoreCoE,
      historyDeclaration: "declared_none",
      dependants: "none",
      applicantAgeBand: "adult",
    },
    { provider: verifiedProvider }
  );
  assert.ok(
    screening.requirements.some((entry) => entry.humanReviewRequired === false),
    "a verified, positively-clear dimension may drop the per-requirement review flag"
  );
  // The answer-level position never changes: this is still a preparation aid.
  assert.equal(screening.submissionStatus, "not_submission_ready");
});
