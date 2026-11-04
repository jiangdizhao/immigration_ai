// biome-ignore-all lint/suspicious/useAwait: the injected query runner implements an async transport over synchronous fixture data.
import assert from "node:assert/strict";
import test from "node:test";
import type { Student500GsProposalRecord } from "./m7-contracts";
import {
  createPostgresDeepPreparationStore,
  type DeepPreparationQueryRunner,
} from "./m7-postgres-store";

/**
 * PostgreSQL repository-contract regression (R3-A).
 *
 * This drives the real repository module - its real SQL, its real row handling and
 * its real error mapping - through an injected transport. It is offline (no database
 * connection), but it is not an in-memory substitute: the assertions apply the same
 * conditional semantics the database would, so a wrong `where` guard fails here.
 *
 * The pre-R3 defect was `decideProposal()` filtering on `status = 'proposed'` for
 * every target, which made `accepting -> accepted` impossible in PostgreSQL while the
 * in-memory store allowed it.
 */

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const PROPOSAL_ID = "99999999-9999-4999-8999-999999999999";
const DRAFT_ID = "77777777-7777-4777-8777-777777777777";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

/** Flattens a drizzle `sql` template into text, including bound parameter values. */
function textOf(query: unknown): string {
  const chunks = (query as { queryChunks?: readonly unknown[] }).queryChunks;
  if (chunks === undefined) {
    return String(query);
  }
  return chunks
    .map((chunk) => {
      // A nested `sql` fragment (for example the per-target source guard) is itself a
      // query object: recurse instead of dropping it, or the guard would look absent.
      if ((chunk as { queryChunks?: unknown }).queryChunks !== undefined) {
        return textOf(chunk);
      }
      const value = (chunk as { value?: unknown }).value;
      if (Array.isArray(value)) {
        return value.join("");
      }
      // Bound parameters are boxed primitives, so String() recovers the value that
      // the database would receive.
      return String(chunk);
    })
    .join("");
}

function row(status: string): Record<string, unknown> {
  return {
    acceptedDraftId: null,
    applicationId: APPLICATION_ID,
    attribution: {
      assertionCount: 0,
      unattributedAssertionCount: 0,
      unverifiedAssertionCount: 0,
    },
    baseDraftContentSha256: "a".repeat(64),
    baseDraftId: "55555555-5555-4555-8555-555555555555",
    baseDraftVersion: 1,
    composerCode: "deterministic_section_composer_v1",
    composerKind: "deterministic",
    contentSha256: "b".repeat(64),
    createdAt: new Date("2026-11-04T00:00:00.000Z"),
    createdByUserId: ACTOR_ID,
    decidedAt: null,
    decidedByUserId: null,
    id: PROPOSAL_ID,
    inputDigest: "c".repeat(64),
    projectId: PROJECT_ID,
    sections: [{ sectionKey: "applicant_background", text: "x" }],
    status,
  };
}

type Harness = {
  readonly queries: string[];
  readonly store: ReturnType<typeof createPostgresDeepPreparationStore>;
  readonly current: () => Record<string, unknown>;
};

/**
 * Minimal database stand-in that honours the repository's own `where` guard.
 * A conditional UPDATE only affects the row when the guard actually matches, which is
 * exactly the behaviour the repository relies on for concurrency safety.
 */
function harness(initialStatus: string): Harness {
  let current = row(initialStatus);
  const queries: string[] = [];

  const run: DeepPreparationQueryRunner = async (query) => {
    const text = textOf(query);
    queries.push(text);

    if (text.includes("for update")) {
      return [current];
    }
    if (text.includes("set \"status\" = 'superseded'")) {
      const applies = /'proposed'/.test(text) && current.status === "proposed";
      const claims = /'accepting'/.test(text) && current.status === "accepting";
      if (!(applies || claims)) {
        return [];
      }
      current = { ...current, status: "superseded" };
      return [{ id: PROPOSAL_ID }];
    }
    const claim = text.match(/set "status" = 'accepting'/u);
    if (claim) {
      if (
        !text.includes("and \"status\" = 'proposed'") ||
        current.status !== "proposed"
      ) {
        return [];
      }
      current = { ...current, status: "accepting" };
      return [current];
    }
    const decision = text.match(/set "status" = (accepted|rejected)/u);
    if (decision) {
      const target = decision[1] as string;
      const allowed =
        target === "accepted"
          ? text.includes("and \"status\" = 'accepting'")
            ? ["accepting"]
            : ["proposed"]
          : text.includes("and \"status\" = 'proposed'")
            ? ["proposed"]
            : ["proposed", "accepting"];
      if (!allowed.includes(String(current.status))) {
        return [];
      }
      const acceptedDraftId =
        target === "accepted"
          ? (text.match(/"acceptedDraftId" = ([0-9a-f-]{36})/u)?.[1] ?? null)
          : null;
      current = {
        ...current,
        acceptedDraftId,
        decidedAt: new Date(),
        decidedByUserId: ACTOR_ID,
        status: target,
      };
      return [current];
    }
    return [];
  };

  return {
    current: () => current,
    queries,
    store: createPostgresDeepPreparationStore({ run }),
  };
}

const baseInput = {
  acceptedDraftId: DRAFT_ID,
  actorUserId: ACTOR_ID,
  applicationId: APPLICATION_ID,
  projectId: PROJECT_ID,
  proposalId: PROPOSAL_ID,
};

test("R3-A: accepted is reachable from the claim state in the real repository", async () => {
  const db = harness("accepting");
  const decided: Student500GsProposalRecord = await db.store.decideProposal({
    ...baseInput,
    status: "accepted",
  });
  assert.equal(decided.status, "accepted");
  assert.equal(decided.acceptedDraftId, DRAFT_ID);
  const update = db.queries.find((query) =>
    query.includes('set "status" = accepted')
  );
  assert.ok(update, "the repository must issue the acceptance UPDATE");
  assert.match(update, /and "status" = 'accepting'/u);
  assert.doesNotMatch(update, /and "status" = 'proposed'/u);
});

test("R3-A: acceptance cannot skip the claim state", async () => {
  const db = harness("proposed");
  await assert.rejects(
    db.store.decideProposal({ ...baseInput, status: "accepted" }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
  assert.equal(db.current().status, "proposed");
});

test("R3-A: a claim cannot be rejected, and a rejected proposal cannot be claimed", async () => {
  const claimed = harness("accepting");
  await assert.rejects(
    claimed.store.decideProposal({ ...baseInput, status: "rejected" }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
  assert.equal(
    claimed.queries.some((query) => query.includes('set "status" = rejected')),
    false,
    "no rejection UPDATE may be issued while the claim is held"
  );

  const rejected = harness("rejected");
  await assert.rejects(
    rejected.store.claimProposal({
      actorUserId: ACTOR_ID,
      applicationId: APPLICATION_ID,
      projectId: PROJECT_ID,
      proposalId: PROPOSAL_ID,
    }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
});

test("R3-A: claim is idempotent and only proposed can be claimed", async () => {
  const db = harness("proposed");
  const first = await db.store.claimProposal({
    actorUserId: ACTOR_ID,
    applicationId: APPLICATION_ID,
    projectId: PROJECT_ID,
    proposalId: PROPOSAL_ID,
  });
  assert.equal(first.claimed, true);
  assert.equal(first.record.status, "accepting");
  const second = await db.store.claimProposal({
    actorUserId: ACTOR_ID,
    applicationId: APPLICATION_ID,
    projectId: PROJECT_ID,
    proposalId: PROPOSAL_ID,
  });
  assert.equal(second.claimed, false);
  // A claim followed by acceptance completes the whole protocol in the repository.
  const decided = await db.store.decideProposal({
    ...baseInput,
    status: "accepted",
  });
  assert.equal(decided.status, "accepted");
});

test("R3-A: the supersede sweep releases a stale claim and open proposals", async () => {
  const db = harness("accepting");
  const changed = await db.store.supersedeProposalsForApplication({
    applicationId: APPLICATION_ID,
  });
  assert.equal(changed, 1);
  const sweep = db.queries.find((query) =>
    query.includes("set \"status\" = 'superseded'")
  );
  assert.ok(sweep);
  assert.match(sweep, /'proposed'/u);
  assert.match(sweep, /'accepting'/u);
});
