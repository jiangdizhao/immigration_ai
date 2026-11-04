import assert from "node:assert/strict";
import test from "node:test";
import {
  denyAllStudent500EditorialAuthority,
  validateEditorialConsent,
} from "./editorial";
import { deterministicGsComposer, validateComposition } from "./gs-composer";
import { assertNotForbiddenM8Action } from "./m7-contracts";
import { createStudent500DeepPreparationService } from "./m7-service";
import { createInMemoryDeepPreparationStore } from "./m7-store";
import { student500ScenarioProfile } from "./scenario";

/**
 * Phase 13 M7 offline acceptance.
 *
 * The M6.2 service is replaced by a stub that returns exactly the projection the real
 * service returns, so these tests exercise M7's own contract: scenario and task
 * derivation, composition validation, proposal lifecycle, editorial fail-closed
 * behaviour, consent scope and the M8 boundary. No database, browser or provider is
 * involved.
 */

const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const DRAFT_ID = "55555555-5555-4555-8555-555555555555";
const FACT_A = "66666666-6666-4666-8666-666666666666";
const NEXT_DRAFT_ID = "77777777-7777-4777-8777-777777777777";

const SECTIONS = [
  {
    factReferenceIds: [FACT_A],
    heading: "Applicant background and circumstances",
    missingInformation: [],
    sectionKey: "applicant_background",
    source: "authorized_fact",
    text: "Recorded fact (identity.full_name): Ada Example",
  },
  {
    factReferenceIds: [],
    heading: "Course choice and reasons for study",
    missingInformation: ["intended course"],
    sectionKey: "course_and_reasons",
    source: "missing",
    text: "Missing information: intended course",
  },
] as never;

const REQUIREMENTS = [
  {
    applicability: "applicable",
    coverage: "missing_evidence",
    legalSourceVerification: "declared_pending_verification",
    nextAction: "select_authorized_facts",
    reasonCode: "conditional_requirement",
    requirementKey: "genuine_student",
    selectedFactReferenceIds: [],
  },
  {
    applicability: "unknown",
    coverage: "not_assessed",
    legalSourceVerification: "not_established",
    nextAction: null,
    reasonCode: "not_assessable_as_of_date_outside_declared_coverage",
    requirementKey: "onshore_application_restrictions",
    selectedFactReferenceIds: [],
  },
] as never;

function fakePreparation() {
  const saved: string[][] = [];
  return {
    saved,
    async get() {
      return {
        applicationId: APPLICATION_ID,
        availableFacts: [
          {
            aiUseAuthorized: true,
            customerConfirmed: true,
            factAssertionId: FACT_A,
            key: "identity.full_name",
            originKind: "customer_reported",
            selectable: true,
            valueDisplay: "Ada Example",
            version: 1,
          },
        ],
        latestDraft: {
          contentSha256: "a".repeat(64),
          draftId: DRAFT_ID,
          sections: SECTIONS,
          stale: false,
          staleReasons: [],
          version: 1,
        },
        projectId: PROJECT_ID,
        reconciliation: { conflictCount: 0, requirements: REQUIREMENTS },
        schoolContext: { kind: "none", studyEvidenceKind: "none" },
        selectedFacts: [
          {
            aiUseAuthorized: true,
            currentState: "covered_by_authorized_fact",
            customerConfirmed: true,
            factAssertionId: FACT_A,
            factKey: "identity.full_name",
            factReferenceId: FACT_A,
            factVersion: 1,
            independentlyVerified: false,
            originKind: "customer_reported",
            revokedAt: null,
            sourceEvidenceRef: null,
            stateAtUse: "customer_confirmed",
          },
        ],
      } as never;
    },
    async saveDraft(input: {
      readonly edits: readonly { sectionKey: string }[];
    }) {
      saved.push(input.edits.map((edit) => edit.sectionKey));
      return {
        draft: {
          contentSha256: "b".repeat(64),
          id: NEXT_DRAFT_ID,
          sections: SECTIONS,
          version: 2,
        },
        replayed: false,
      } as never;
    },
  };
}

function build() {
  const store = createInMemoryDeepPreparationStore();
  const preparation = fakePreparation();
  const service = createStudent500DeepPreparationService({
    composer: deterministicGsComposer,
    credentialVerifier: {
      code: "test_credential_verifier",
      verify: () => ({
        reasonCode: "professional_credential_registry_unavailable",
        status: "unavailable" as const,
      }),
    },
    editorialAuthority: denyAllStudent500EditorialAuthority,
    preparation: preparation as never,
    store: store.store,
  });
  return { preparation, service, store };
}

const scope = {
  actorUserId: ACTOR_ID,
  applicationId: APPLICATION_ID,
  projectId: PROJECT_ID,
};

test("scenario derivation names complex dimensions without deciding eligibility", () => {
  const profile = student500ScenarioProfile({
    factKeys: ["immigration.prior_refusal"],
    hasAuthorizedFacts: true,
    requirements: [
      {
        requirementKey: "onshore_application_restrictions",
        status: "applicable",
      },
      {
        requirementKey: "prior_immigration_history_disclosure",
        status: "applicable",
      },
      {
        requirementKey: "under_18_welfare_arrangements",
        status: "conditional",
      },
      {
        requirementKey: "family_unit_member_requirements",
        status: "not_applicable",
      },
    ],
    schoolContext: {
      kind: "school_application",
      studyEvidenceKind: "offer_only",
    },
  });
  assert.equal(profile.humanReviewRequired, true);
  assert.equal(profile.complexity, "complex");
  assert.ok(profile.scenarioKinds.includes("onshore_with_current_visa"));
  assert.ok(profile.scenarioKinds.includes("applicant_under_18"));
  assert.ok(profile.scenarioKinds.includes("study_evidence_offer_only"));
  assert.ok(!profile.scenarioKinds.includes("dependants_or_family_unit"));

  const unresolved = student500ScenarioProfile({
    factKeys: [],
    hasAuthorizedFacts: false,
    requirements: [{ requirementKey: "genuine_student", status: "unknown" }],
    schoolContext: null,
  });
  assert.equal(unresolved.complexity, "unresolved");
  assert.deepEqual(unresolved.unresolvedRequirementKeys, ["genuine_student"]);
});

test("unknown legal applicability and unverified sources stay explicit tasks", async () => {
  const { service } = build();
  const view = await service.get(scope);
  assert.equal(view.submissionStatus, "not_submission_ready");
  assert.deepEqual(view.submissionActionsAvailable, []);
  const kinds = new Set(view.tasks.map((task) => task.reasonCode));
  assert.ok(kinds.has("requirement_applicability_unknown"));
  assert.ok(kinds.has("requirement_legal_source_unverified"));
  assert.ok(kinds.has("requirement_evidence_missing"));
  // Tasks are deterministic and bounded.
  const again = await service.get(scope);
  assert.deepEqual(
    again.tasks.map((task) => task.taskId),
    view.tasks.map((task) => task.taskId)
  );
  assert.ok(view.tasks.every((task) => task.humanReviewRequired === true));
});

test("a proposal is a bounded, attributed proposal and never auto-saved", async () => {
  const { preparation, service } = build();
  const first = await service.proposeRevision(scope);
  assert.equal(preparation.saved.length, 0);
  assert.equal(first.proposal.status, "proposed");
  assert.equal(first.proposal.composerKind, "deterministic");
  assert.ok(first.proposal.contentSha256.length === 64);
  // Missing-information lines carry an explicit needs-confirmation state.
  assert.ok(first.proposal.statementsNeedingConfirmation.length > 0);
  // Replay resolves to the same persisted proposal.
  const replay = await service.proposeRevision(scope);
  assert.equal(replay.proposal.proposalId, first.proposal.proposalId);
  assert.equal(replay.replayed, true);
});

test("accepting a proposal writes exactly one new draft and replays safely", async () => {
  const { preparation, service } = build();
  const created = await service.proposeRevision(scope);
  const accepted = await service.decideProposal({
    decision: "accept",
    proposalId: created.proposal.proposalId,
    scope,
  });
  assert.equal(preparation.saved.length, 1);
  assert.equal(accepted.draftId, NEXT_DRAFT_ID);
  assert.equal(accepted.proposal.status, "accepted");
  assert.equal(accepted.proposal.acceptedDraftId, NEXT_DRAFT_ID);
  assert.equal(accepted.replayed, false);

  // Exact replay: same proposal, same draft, and no second draft version.
  const replay = await service.decideProposal({
    decision: "accept",
    proposalId: created.proposal.proposalId,
    scope,
  });
  assert.equal(replay.draftId, NEXT_DRAFT_ID);
  assert.equal(replay.replayed, true);
  assert.equal(preparation.saved.length, 1);

  // A decided proposal cannot be reversed out of its terminal state.
  await assert.rejects(
    service.decideProposal({
      decision: "reject",
      proposalId: created.proposal.proposalId,
      scope,
    })
  );
});

test("a composer cannot fabricate fact support or borrow unknown references", async () => {
  const sections = [
    {
      assertions: [
        {
          assertionId: "as_1",
          assertionText: "The applicant meets the genuine student requirement.",
          factReferenceIds: [],
          support: "authorized_fact" as const,
        },
      ],
      factReferenceIds: [FACT_A],
      heading: "Applicant background and circumstances",
      missingInformation: [],
      sectionKey: "applicant_background" as const,
      source: "composer_proposal" as const,
      text: "The applicant meets the genuine student requirement.",
    },
  ];
  assert.throws(() =>
    validateComposition({ allowedFactReferenceIds: [FACT_A], sections })
  );
  assert.throws(() =>
    validateComposition({
      allowedFactReferenceIds: [FACT_A],
      sections: [
        {
          ...sections[0],
          factReferenceIds: ["99999999-9999-4999-8999-999999999999"],
        },
      ],
    })
  );
});

test("a model composer is unavailable by default and never silently degrades", async () => {
  const { unavailableModelGsComposer } = await import("./gs-composer");
  assert.throws(() =>
    unavailableModelGsComposer.compose({
      applicationId: APPLICATION_ID,
      baseDraft: {
        contentSha256: "a".repeat(64),
        draftId: DRAFT_ID,
        sections: SECTIONS,
        version: 1,
      },
      facts: [],
      tasks: [],
    })
  );
  assert.equal(unavailableModelGsComposer.kind, "model_disabled");
});

test("editorial review fails closed without authority and consent is explicit", async () => {
  const { service } = build();
  const consent = {
    consentCode: "consent_editorial_1",
    consentGranted: true,
    disclosureScopes: ["gs_draft_sections", "selected_fact_summaries"],
    draftContentSha256: "a".repeat(64),
    draftId: DRAFT_ID,
    draftVersion: 1,
    factReferenceIds: [FACT_A],
  };
  const requested = await service.requestEditorialReview({ consent, scope });
  assert.equal(requested.review.status, "authority_unavailable");
  assert.equal(requested.review.professionalSignOff, "not_established");
  assert.equal(requested.review.reviewerUserId, null);
  assert.equal(requested.review.reviewerCredentialStatus, "unavailable");

  assert.throws(() =>
    validateEditorialConsent({ ...consent, consentGranted: false })
  );
  await assert.rejects(
    service.requestEditorialReview({
      consent: { ...consent, draftVersion: 99 },
      scope,
    })
  );
  await assert.rejects(
    service.requestEditorialReview({
      consent: {
        ...consent,
        factReferenceIds: ["99999999-9999-4999-8999-999999999999"],
      },
      scope,
    })
  );
});

test("unverified reviewer authority cannot produce feedback or approval", async () => {
  const { service } = build();
  const requested = await service.requestEditorialReview({
    consent: {
      consentCode: "consent_editorial_2",
      consentGranted: true,
      disclosureScopes: ["gs_draft_sections"],
      draftContentSha256: "a".repeat(64),
      draftId: DRAFT_ID,
      draftVersion: 1,
      // The draft rests on FACT_A, so an empty selection is not accepted as proof
      // that there is nothing to disclose.
      factReferenceIds: [FACT_A],
    },
    scope,
  });
  await assert.rejects(
    service.submitEditorialFeedback({
      comments: [{ body: "Please specify the course." }],
      proposedEdits: [],
      reviewId: requested.review.reviewId,
      scope,
    })
  );
  const after = await service.get(scope);
  for (const review of after.editorialReviews) {
    assert.equal(review.professionalSignOff, "not_established");
    assert.notEqual(review.status, "accepted_by_customer");
    assert.notEqual(review.status, "feedback_provided");
  }
});

test("M8 submission and approval actions have no M7 vocabulary", () => {
  for (const action of [
    "approve_package",
    "authorize_submission",
    "submit_to_government",
    "record_grant",
  ]) {
    assert.throws(() => assertNotForbiddenM8Action(action));
  }
  assert.doesNotThrow(() => assertNotForbiddenM8Action("propose_gs_revision"));
});
