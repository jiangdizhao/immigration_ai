// biome-ignore-all lint/suspicious/useAwait: test fakes implement async ports over synchronous fixture data.
import assert from "node:assert/strict";
import test from "node:test";
import { deterministicGsComposer } from "./gs-composer";
import { createStudent500DeepPreparationService } from "./m7-service";
import { createInMemoryDeepPreparationStore } from "./m7-store";

/**
 * Phase 13 M7-R2 acceptance-blocker regressions.
 *
 * Each test fails on the pre-R2 implementation:
 *   1. M2 sharing revocation must withdraw derived text even while the
 *      Student500FactReference row is still active;
 *   2. a fact-bearing draft cannot be consented to with an empty disclosure;
 *   3. simultaneous accept/reject must not both persist;
 *   4. an identical editorial request must not create another round.
 */

const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";
const _REVIEWER_ID = "44444444-4444-4444-8444-444444444444";
const DRAFT_ID = "55555555-5555-4555-8555-555555555555";
const FACT_A = "66666666-6666-4666-8666-666666666666";
const NEXT_DRAFT_ID = "77777777-7777-4777-8777-777777777777";

const scope = {
  actorUserId: OWNER_ID,
  applicationId: APPLICATION_ID,
  projectId: PROJECT_ID,
};

const SECTIONS = [
  {
    factReferenceIds: [FACT_A],
    heading: "Applicant background and circumstances",
    missingInformation: [],
    sectionKey: "applicant_background",
    source: "authorized_fact",
    text: "Recorded fact (identity.full_name): Ada Example",
  },
] as never;

function preparation(options?: {
  readonly sharingRevoked?: boolean;
  readonly latestDraftId?: string;
}) {
  const saved: string[][] = [];
  return {
    saved,
    async get() {
      return {
        applicationId: APPLICATION_ID,
        // M2 sharing revoked: the assertion leaves the actor's projection, while
        // the selected reference row itself stays active (revokedAt null).
        availableFacts: options?.sharingRevoked
          ? []
          : [
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
          draftId: options?.latestDraftId ?? DRAFT_ID,
          sections: SECTIONS,
          stale: false,
          staleReasons: [],
          version: 1,
        },
        projectId: PROJECT_ID,
        reconciliation: { conflictCount: 0, requirements: [] },
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

const allowAll = {
  code: "test_synthetic_editorial_authority",
  decide: () => ({
    allowed: true as const,
    authorityCode: "synthetic_test_authority",
    policyVersion: "test-1",
  }),
};

function build(options?: {
  readonly preparation?: ReturnType<typeof preparation>;
  readonly credential?: "verified" | "unavailable";
}) {
  const store = createInMemoryDeepPreparationStore();
  const app = options?.preparation ?? preparation();
  const service = createStudent500DeepPreparationService({
    composer: deterministicGsComposer,
    credentialVerifier: {
      code: "test_credential_verifier",
      verify: () =>
        options?.credential === "verified"
          ? {
              credentialCode: "synthetic_test_credential",
              status: "verified" as const,
              verifiedAt: "2026-11-04T00:00:00.000Z",
            }
          : {
              reasonCode: "registry_unavailable",
              status: "unavailable" as const,
            },
    },
    editorialAuthority: allowAll,
    preparation: app as never,
    resolveDisclosedFactAccess: async () => "allowed",
    resolveDraftIdentity: async () => ({
      contentSha256: "a".repeat(64),
      draftId: DRAFT_ID,
      version: 1,
    }),
    store: store.store,
  });
  return { app, service, store };
}

const CONSENT = {
  consentCode: "consent_r2",
  consentGranted: true,
  disclosureScopes: ["gs_draft_sections"],
  draftContentSha256: null,
  draftId: DRAFT_ID,
  draftVersion: 1,
  factReferenceIds: [FACT_A],
} as const;

/* 1. M2 sharing revocation ------------------------------------------------ */

test("R2-1: M2 sharing revocation withdraws derived text while the reference stays active", async () => {
  const live = build();
  const created = await live.service.proposeRevision(scope);
  assert.equal(created.proposal.readable, true);

  // Same store, same fact reference row (revokedAt null), but the M2 projection no
  // longer shows the assertion because sharing was revoked.
  const shared = build({
    preparation: preparation({ sharingRevoked: true }),
  });
  // Reuse the live store so the stored proposal is visible to the second service.
  const revokedView = await createStudent500DeepPreparationService({
    composer: deterministicGsComposer,
    credentialVerifier: {
      code: "test_credential_verifier",
      verify: () => ({
        reasonCode: "registry_unavailable",
        status: "unavailable" as const,
      }),
    },
    editorialAuthority: allowAll,
    preparation: preparation({ sharingRevoked: true }) as never,
    store: live.store.store,
  }).get(scope);

  assert.equal(shared.app.saved.length, 0);
  assert.deepEqual(revokedView.disclosureScope.readableFactReferenceIds, []);
  const proposal = revokedView.proposals.find(
    (entry) => entry.proposalId === created.proposal.proposalId
  );
  assert.ok(proposal);
  assert.equal(proposal.readable, false);
  assert.equal(
    proposal.sections.some((section) => section.text.includes("Ada Example")),
    false
  );
  // The immutable stored row is untouched: only the served projection narrowed.
  const stored = [...live.store.proposals.values()][0];
  assert.ok(stored?.sections[0]?.text.includes("Ada Example"));
});

/* 2. consent must cover a fact-bearing draft ------------------------------ */

test("R2-2: an empty disclosure cannot consent to a fact-bearing draft", async () => {
  const { service } = build();
  await assert.rejects(
    service.requestEditorialReview({
      consent: { ...CONSENT, factReferenceIds: [] },
      scope,
    }),
    (error: unknown) => (error as { code?: string }).code === "consent_required"
  );
  // Asking for fact summaries requires every draft dependency to be disclosed.
  await assert.rejects(
    service.requestEditorialReview({
      consent: {
        ...CONSENT,
        disclosureScopes: ["gs_draft_sections", "selected_fact_summaries"],
        factReferenceIds: [],
      },
      scope,
    }),
    (error: unknown) => (error as { code?: string }).code === "consent_required"
  );
  // A properly disclosed request is accepted and records the exact server draft.
  const requested = await service.requestEditorialReview({
    consent: CONSENT,
    scope,
  });
  assert.equal(requested.review.draftId, DRAFT_ID);
  assert.equal(requested.review.draftVersion, 1);
  assert.equal(requested.review.draftContentSha256, "a".repeat(64));
});

/* 3. accept/reject concurrency and interruption recovery ------------------ */

test("R2-3: simultaneous accept and reject never both persist", async () => {
  const { app, service, store } = build();
  const created = await service.proposeRevision(scope);
  const results = await Promise.allSettled([
    service.decideProposal({
      decision: "accept",
      proposalId: created.proposal.proposalId,
      scope,
    }),
    service.decideProposal({
      decision: "reject",
      proposalId: created.proposal.proposalId,
      scope,
    }),
  ]);
  const stored = [...store.proposals.values()][0];
  assert.ok(stored);
  if (stored.status === "accepted") {
    // Accept won: a draft exists AND the decision agrees with it.
    assert.ok(stored.acceptedDraftId);
    assert.equal(app.saved.length, 1);
    assert.equal(
      results.some(
        (result) =>
          result.status === "rejected" &&
          (result.reason as { code?: string }).code === "state_conflict"
      ),
      true
    );
  } else {
    // Reject won: no draft may exist for this proposal.
    assert.equal(stored.status, "rejected");
    assert.equal(app.saved.length, 0);
  }
  // Whichever won, no draft was written for a rejected proposal.
  assert.equal(stored.status === "rejected" && app.saved.length > 0, false);
});

test("R2-3b: an interruption after claiming recovers instead of duplicating", async () => {
  const { app, service, store } = build();
  const created = await service.proposeRevision(scope);
  // Simulate a crash after the claim but before the draft write.
  const claimed = await store.store.claimProposal({
    actorUserId: OWNER_ID,
    applicationId: APPLICATION_ID,
    projectId: PROJECT_ID,
    proposalId: created.proposal.proposalId,
  });
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.record.status, "accepting");

  // A retry resumes the same claim: one draft, final decision consistent with it.
  const resumed = await service.decideProposal({
    decision: "accept",
    proposalId: created.proposal.proposalId,
    scope,
  });
  assert.equal(resumed.draftId, NEXT_DRAFT_ID);
  assert.equal(resumed.proposal.status, "accepted");
  assert.equal(app.saved.length, 1);

  // A second recovery attempt is a pure replay and writes nothing further.
  const replay = await service.decideProposal({
    decision: "accept",
    proposalId: created.proposal.proposalId,
    scope,
  });
  assert.equal(replay.replayed, true);
  assert.equal(app.saved.length, 1);
});

/* 4. editorial request idempotency ---------------------------------------- */

test("R2-4: duplicate and concurrent identical requests resolve one round", async () => {
  const { service, store } = build();
  const first = await service.requestEditorialReview({
    consent: CONSENT,
    scope,
  });
  const second = await service.requestEditorialReview({
    consent: CONSENT,
    scope,
  });
  assert.equal(second.review.reviewId, first.review.reviewId);
  assert.equal(second.replayed, true);

  const concurrent = await Promise.all([
    service.requestEditorialReview({ consent: CONSENT, scope }),
    service.requestEditorialReview({ consent: CONSENT, scope }),
  ]);
  for (const result of concurrent) {
    assert.equal(result.review.reviewId, first.review.reviewId);
  }
  assert.equal(store.reviews.size, 1);
  assert.equal([...store.reviews.values()][0]?.reviewRound, 1);
});

test("R2-4b: different consent or a new draft version opens an explicit new round", async () => {
  const { service, store } = build();
  const first = await service.requestEditorialReview({
    consent: CONSENT,
    scope,
  });
  const different = await service.requestEditorialReview({
    consent: { ...CONSENT, consentCode: "consent_r2_alt" },
    scope,
  });
  assert.notEqual(different.review.reviewId, first.review.reviewId);
  assert.equal(different.review.reviewRound, 2);
  assert.equal(store.reviews.size, 2);

  // A genuinely new draft version is a different request, not a replay.
  const newDraft = build();
  const onDraftOne = await newDraft.service.requestEditorialReview({
    consent: CONSENT,
    scope,
  });
  const movedService = createStudent500DeepPreparationService({
    composer: deterministicGsComposer,
    credentialVerifier: {
      code: "test_credential_verifier",
      verify: () => ({
        reasonCode: "registry_unavailable",
        status: "unavailable" as const,
      }),
    },
    editorialAuthority: allowAll,
    preparation: preparation({ latestDraftId: NEXT_DRAFT_ID }) as never,
    resolveDisclosedFactAccess: async () => "allowed",
    resolveDraftIdentity: async () => ({
      contentSha256: "b".repeat(64),
      draftId: NEXT_DRAFT_ID,
      version: 2,
    }),
    store: newDraft.store.store,
  });
  const onDraftTwo = await movedService.requestEditorialReview({
    consent: { ...CONSENT, draftId: NEXT_DRAFT_ID, draftVersion: 1 },
    scope,
  });
  assert.notEqual(onDraftTwo.review.reviewId, onDraftOne.review.reviewId);
  assert.equal(onDraftTwo.review.reviewRound, 2);
  assert.equal(onDraftTwo.review.draftId, NEXT_DRAFT_ID);
});
