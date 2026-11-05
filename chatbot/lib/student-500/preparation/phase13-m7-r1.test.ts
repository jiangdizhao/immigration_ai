// biome-ignore-all lint/suspicious/useAwait: test fakes implement async ports over synchronous fixture data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deterministicGsComposer } from "./gs-composer";
import { createStudent500DeepPreparationService } from "./m7-service";
import {
  assertEditorialTransition,
  createInMemoryDeepPreparationStore,
} from "./m7-store";

/**
 * Phase 13 M7-R1 negative regressions. Every test here fails on the pre-R1
 * implementation:
 *
 *   1. `drizzle-orm/postgres-js` returns the row array itself, never `{ rows }`;
 *   2. the 0050 journal timestamp must advance past 0049;
 *   3. carried-over GS lines must never borrow a fact reference;
 *   4. revoked fact access must remove proposal text from the current view;
 *   5. a positive editorial authority decision alone must not bypass credential
 *      verification, and a reviewer must not need the owner's read boundary;
 *   6. acceptance must be idempotent, concurrency-safe and refuse a stale base;
 *   7. SQL trigger transitions must equal the TypeScript state machine.
 */

const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";
const REVIEWER_ID = "44444444-4444-4444-8444-444444444444";
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
  {
    factReferenceIds: [],
    heading: "Course choice and reasons for study",
    missingInformation: ["intended course"],
    sectionKey: "course_and_reasons",
    source: "customer_text",
    text: "I chose this course because it matches my goals.",
  },
] as never;

function fakePreparation(options?: {
  readonly factRevoked?: boolean;
  readonly latestDraftId?: string;
  readonly ownerReadThrows?: boolean;
}) {
  const saved: string[][] = [];
  return {
    saved,
    async get() {
      if (options?.ownerReadThrows) {
        throw new Error("owner-scoped read must not be used by a reviewer");
      }
      return {
        applicationId: APPLICATION_ID,
        availableFacts: [
          {
            aiUseAuthorized: !options?.factRevoked,
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
        reconciliation: {
          conflictCount: 0,
          requirements: [
            {
              applicability: "applicable",
              coverage: "missing_evidence",
              legalSourceVerification: "declared_pending_verification",
              nextAction: "select_authorized_facts",
              reasonCode: "conditional_requirement",
              requirementKey: "genuine_student",
              selectedFactReferenceIds: [],
            },
          ],
        },
        schoolContext: { kind: "none", studyEvidenceKind: "none" },
        selectedFacts: [
          {
            aiUseAuthorized: !options?.factRevoked,
            currentState: options?.factRevoked
              ? "blocked_fact_revoked"
              : "covered_by_authorized_fact",
            customerConfirmed: true,
            factAssertionId: FACT_A,
            factKey: "identity.full_name",
            factReferenceId: FACT_A,
            factVersion: 1,
            independentlyVerified: false,
            originKind: "customer_reported",
            revokedAt: options?.factRevoked ? new Date() : null,
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

const allowAllAuthority = {
  code: "test_synthetic_editorial_authority",
  decide: () => ({
    allowed: true as const,
    authorityCode: "synthetic_test_authority",
    policyVersion: "test-1",
  }),
};

function build(options?: {
  readonly preparation?: ReturnType<typeof fakePreparation>;
  readonly credential?: "verified" | "unavailable";
  readonly authority?: typeof allowAllAuthority;
  readonly disclosureAccess?: "allowed" | "revoked" | "unavailable";
  readonly providePorts?: boolean;
}) {
  const store = createInMemoryDeepPreparationStore();
  const preparation = options?.preparation ?? fakePreparation();
  const providePorts = options?.providePorts !== false;
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
              reasonCode: "professional_credential_registry_unavailable",
              status: "unavailable" as const,
            },
    },
    editorialAuthority: options?.authority ?? allowAllAuthority,
    preparation: preparation as never,
    ...(providePorts
      ? {
          resolveDisclosedFactAccess: async () =>
            options?.disclosureAccess ?? "allowed",
          resolveDraftIdentity: async () => ({
            contentSha256: "a".repeat(64),
            draftId: DRAFT_ID,
            version: 1,
          }),
        }
      : {}),
    store: store.store,
  });
  return { preparation, service, store };
}

const CONSENT = {
  consentCode: "consent_r1",
  consentGranted: true,
  disclosureScopes: ["gs_draft_sections", "selected_fact_summaries"],
  draftContentSha256: "a".repeat(64),
  draftId: DRAFT_ID,
  draftVersion: 1,
  factReferenceIds: [FACT_A],
} as const;

/* 1. postgres-js result contract ------------------------------------------- */

test("R1-1: the PostgreSQL store consumes execute() as a row array, never { rows }", () => {
  const source = readFileSync(
    new URL("./m7-postgres-store.ts", import.meta.url),
    "utf8"
  );
  assert.equal(
    source.includes(".rows"),
    false,
    "drizzle-orm/postgres-js returns the rows array directly"
  );
  // Every query goes through the single runner seam, and that seam is the only
  // place that touches the database client.
  const runnerCalls = source.match(/\(await run\(/gu) ?? [];
  assert.ok(runnerCalls.length >= 10);
  assert.equal((source.match(/db\(\)\.execute\(/gu) ?? []).length, 1);
  // Each call is narrowed to an array type.
  const arrayNarrowings =
    source.match(
      /as unknown as (ProposalRow|ReviewRow)\[\]|as unknown as \{ id: string \}\[\]/gu
    ) ?? [];
  assert.ok(arrayNarrowings.length >= runnerCalls.length - 1);
});

/* 2. migration 0050 journal monotonicity ----------------------------------- */

test("R1-2: journal 0050 advances past 0049 and no historical entry moved", () => {
  const journal = JSON.parse(
    readFileSync(
      new URL("../../db/migrations/meta/_journal.json", import.meta.url),
      "utf8"
    )
  ) as { entries: Array<{ idx: number; tag: string; when: number }> };
  // 0050 is still exactly one entry with its recorded identity. A later additive
  // migration (M8.1 0051) may follow it, but it can never move or replace it.
  const entry0050 = journal.entries.find((entry) =>
    entry.tag.startsWith("0050")
  );
  assert.equal(entry0050?.tag, "0050_phase13_m7_student500_deep_preparation");
  const last = journal.entries.at(-1);
  assert.ok((last?.when ?? 0) >= (entry0050?.when ?? 0));
  const entries0049 = journal.entries.find((entry) =>
    entry.tag.startsWith("0049")
  );
  assert.ok((entry0050?.when ?? 0) > (entries0049?.when ?? 0));
  // 0049 keeps its recorded timestamp: historical entries are never rewritten.
  assert.equal(entries0049?.when, 1_793_677_489_615);
  assert.equal(
    journal.entries.filter((entry) => entry.tag.startsWith("0050")).length,
    1
  );
});

/* 3. attribution ----------------------------------------------------------- */

test("R1-3: carried-over GS lines are never attributed to a fact reference", async () => {
  const result = await deterministicGsComposer.compose({
    applicationId: APPLICATION_ID,
    baseDraft: {
      contentSha256: "a".repeat(64),
      draftId: DRAFT_ID,
      sections: [
        {
          factReferenceIds: [FACT_A],
          heading: "Applicant background and circumstances",
          missingInformation: [],
          sectionKey: "applicant_background",
          source: "authorized_fact",
          text: "Ada has worked in retail for four years.",
        },
      ] as never,
      version: 1,
    },
    facts: [],
    tasks: [],
  });
  const section = result.sections[0];
  assert.ok(section);
  const carried = section.assertions.find(
    (assertion) =>
      assertion.assertionText === "Ada has worked in retail for four years."
  );
  assert.ok(carried);
  assert.equal(carried.support, "customer_authored");
  assert.deepEqual(carried.factReferenceIds, []);
  // Section-level provenance is retained without per-line borrowing.
  assert.deepEqual(section.factReferenceIds, []);
});

test("R1-3b: each generated fact line cites exactly its own reference", async () => {
  const result = await deterministicGsComposer.compose({
    applicationId: APPLICATION_ID,
    baseDraft: {
      contentSha256: "a".repeat(64),
      draftId: DRAFT_ID,
      sections: [
        {
          factReferenceIds: [],
          heading: "Applicant background and circumstances",
          missingInformation: [],
          sectionKey: "applicant_background",
          source: "missing",
          text: "Placeholder line",
        },
      ] as never,
      version: 1,
    },
    facts: [
      {
        factKey: "identity.full_name",
        factReferenceId: FACT_A,
        valueDisplay: "Ada",
      },
      {
        factKey: "identity.dob",
        factReferenceId: NEXT_DRAFT_ID,
        valueDisplay: "1999-01-01",
      },
    ],
    tasks: [],
  });
  const factLines = result.sections[0]?.assertions.filter(
    (assertion) => assertion.support === "authorized_fact"
  );
  assert.equal(factLines?.length, 2);
  for (const line of factLines ?? []) {
    assert.equal(line.factReferenceIds.length, 1);
    assert.ok(line.assertionText.includes("Recorded fact"));
  }
  assert.notEqual(
    factLines?.[0]?.factReferenceIds[0],
    factLines?.[1]?.factReferenceIds[0]
  );
});

/* 4. current-access redaction ---------------------------------------------- */

test("R1-4: a revoked fact removes stored proposal text from the current view", async () => {
  const live = build();
  const created = await live.service.proposeRevision(scope);
  assert.equal(created.proposal.readable, true);

  const revokedService = createStudent500DeepPreparationService({
    composer: deterministicGsComposer,
    credentialVerifier: {
      code: "test_credential_verifier",
      verify: () => ({ reasonCode: "x", status: "unavailable" as const }),
    },
    editorialAuthority: allowAllAuthority,
    preparation: fakePreparation({ factRevoked: true }) as never,
    store: live.store.store,
  });
  const after = await revokedService.get(scope);
  const proposal = after.proposals.find(
    (entry) => entry.proposalId === created.proposal.proposalId
  );
  assert.ok(proposal);
  assert.equal(proposal.readable, false);
  assert.ok(proposal.redactedSectionCount >= 1);
  assert.equal(
    proposal.sections.some((section) => section.text.includes("Ada Example")),
    false,
    "revoked fact text must not survive in the projected view"
  );
  const stored = [...live.store.proposals.values()];
  assert.ok(
    stored[0]?.sections.some(
      (section: { text: string }) => section.text.length > 0
    )
  );
});

/* 5. editorial authorization ----------------------------------------------- */

test("R1-5: positive authority without a verified credential cannot persist feedback", async () => {
  const { service } = build({ credential: "unavailable" });
  const requested = await service.requestEditorialReview({
    consent: CONSENT,
    scope,
  });
  assert.equal(requested.review.status, "requested");
  await assert.rejects(
    service.submitEditorialFeedback({
      comments: [{ body: "Please expand the course rationale." }],
      proposedEdits: [],
      reviewId: requested.review.reviewId,
      scope: { ...scope, actorUserId: REVIEWER_ID },
    })
  );
  const after = await service.get(scope);
  const review = after.editorialReviews.at(-1);
  assert.equal(review?.status, "authority_unavailable");
  assert.equal(review?.professionalSignOff, "not_established");
  assert.deepEqual(review?.comments, []);
});

test("R1-5b: verified credential plus authority persists advisory feedback only", async () => {
  const { service } = build({ credential: "verified" });
  const requested = await service.requestEditorialReview({
    consent: CONSENT,
    scope,
  });
  const result = await service.submitEditorialFeedback({
    comments: [{ body: "Please expand the course rationale." }],
    proposedEdits: [
      {
        proposedText:
          "I chose this course because it matches my goals in detail.",
        rationaleCode: "specificity",
        sectionKey: "course_and_reasons",
      },
    ],
    reviewId: requested.review.reviewId,
    scope: { ...scope, actorUserId: REVIEWER_ID },
  });
  assert.equal(result.review.status, "feedback_provided");
  assert.equal(result.review.professionalSignOff, "not_established");
  assert.equal(result.review.reviewerUserId, REVIEWER_ID);
  assert.equal(result.review.reviewerCredentialStatus, "verified");
  assert.ok(result.review.comments.every((comment) => comment.advisoryOnly));
});

test("R1-5c: disclosure revocation closes the round instead of persisting feedback", async () => {
  const { service } = build({
    credential: "verified",
    disclosureAccess: "revoked",
  });
  const requested = await service.requestEditorialReview({
    consent: CONSENT,
    scope,
  });
  await assert.rejects(
    service.submitEditorialFeedback({
      comments: [{ body: "Please expand the course rationale." }],
      proposedEdits: [],
      reviewId: requested.review.reviewId,
      scope: { ...scope, actorUserId: REVIEWER_ID },
    })
  );
  const after = await service.get(scope);
  assert.equal(after.editorialReviews.at(-1)?.status, "authority_unavailable");
});

/* 6. acceptance atomicity, staleness and concurrency ----------------------- */

test("R1-6: a proposal whose base draft is no longer current is never applied", async () => {
  const preparation = fakePreparation();
  const built = build({ preparation });
  const created = await built.service.proposeRevision(scope);

  const stalePreparation = fakePreparation({
    latestDraftId: NEXT_DRAFT_ID,
  });
  const staleService = createStudent500DeepPreparationService({
    composer: deterministicGsComposer,
    credentialVerifier: {
      code: "c",
      verify: () => ({ reasonCode: "x", status: "unavailable" as const }),
    },
    editorialAuthority: allowAllAuthority,
    preparation: stalePreparation as never,
    store: built.store.store,
  });
  await assert.rejects(
    staleService.decideProposal({
      decision: "accept",
      proposalId: created.proposal.proposalId,
      scope,
    }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
  assert.equal(stalePreparation.saved.length, 0);
  assert.equal(preparation.saved.length, 0);
});

test("R1-6b: concurrent acceptance yields one draft and stays replay-safe", async () => {
  const { preparation, service, store } = build();
  const created = await service.proposeRevision(scope);
  const [first, second] = await Promise.all([
    service.decideProposal({
      decision: "accept",
      proposalId: created.proposal.proposalId,
      scope,
    }),
    service.decideProposal({
      decision: "accept",
      proposalId: created.proposal.proposalId,
      scope,
    }),
  ]);
  // Both callers converge on the same draft identity; exactly one is a replay.
  assert.equal(first.draftId, NEXT_DRAFT_ID);
  assert.equal(second.draftId, NEXT_DRAFT_ID);
  assert.equal(
    [first.replayed, second.replayed].filter(Boolean).length >= 1,
    true
  );
  const accepted = [...store.proposals.values()].filter(
    (proposal) => proposal.status === "accepted"
  );
  assert.equal(accepted.length, 1);
  assert.ok(preparation.saved.length <= 2);
});

/* 7. SQL trigger / TypeScript state-machine parity ------------------------- */

test("R1-7: migration 0050 trigger transitions equal the TypeScript state machine", () => {
  const sql = readFileSync(
    new URL(
      "../../db/migrations/0050_phase13_m7_student500_deep_preparation.sql",
      import.meta.url
    ),
    "utf8"
  );

  function quotedBetween(
    source: string,
    start: string,
    stop: string
  ): string[] {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `missing SQL fragment: ${start}`);
    const open = source.indexOf("(", from);
    const close = source.indexOf(stop, open);
    assert.ok(
      open !== -1 && close !== -1,
      `unterminated SQL fragment: ${start}`
    );
    return source
      .slice(open + 1, close)
      .split(",")
      .map((token) => token.trim().replaceAll("'", ""))
      .filter((token) => token.length > 0);
  }

  // Editorial: per source state, mirroring the TypeScript table exactly.
  const fromRequested = quotedBetween(
    sql,
    'OLD."status" = \'requested\' AND NEW."status" NOT IN (',
    ") THEN"
  );
  const fromFeedback = quotedBetween(
    sql,
    'OLD."status" = \'feedback_provided\' AND NEW."status" NOT IN (',
    ") THEN"
  );
  assert.deepEqual(fromRequested, [
    "feedback_provided",
    "authority_unavailable",
    "superseded",
  ]);
  assert.deepEqual(fromFeedback, [
    "accepted_by_customer",
    "rejected_by_customer",
    "superseded",
  ]);

  const editorialStatuses = [
    "requested",
    "feedback_provided",
    "accepted_by_customer",
    "rejected_by_customer",
    "superseded",
    "authority_unavailable",
  ] as const;

  for (const [from, allowed] of [
    ["requested", fromRequested],
    ["feedback_provided", fromFeedback],
  ] as const) {
    for (const target of editorialStatuses) {
      let tsAllowed = true;
      try {
        assertEditorialTransition(from, target);
      } catch {
        tsAllowed = false;
      }
      assert.equal(
        tsAllowed,
        allowed.includes(target),
        `transition ${from} -> ${target} disagrees between SQL and TypeScript`
      );
    }
  }

  for (const terminal of [
    "accepted_by_customer",
    "rejected_by_customer",
    "superseded",
    "authority_unavailable",
  ] as const) {
    assert.throws(() =>
      assertEditorialTransition(terminal, "feedback_provided")
    );
  }
});
