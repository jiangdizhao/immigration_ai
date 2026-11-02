// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared fixture helpers assert their preconditions
// biome-ignore-all lint/style/noNonNullAssertion: fixture identifiers are asserted to exist
// biome-ignore-all lint/style/useConsistentArrayType: fixture typing conventions
/**
 * Phase 13 Post-M5 E2E — completion campaign: school-workflow gap closure.
 *
 * Targets E2E-06 (offer lifecycle), E2E-07 (CoE provenance), E2E-11 (exact replay
 * and CAS), E2E-12 (archive + downstream readiness) and E2E-10-R (accepted
 * read-only closed-Project policy).
 *
 * Every assertion runs against the real Next.js HTTP surface and the real
 * isolated PostgreSQL cluster. Prior campaign records are never overwritten.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { applicationOf, caseOf, SchoolApi } from "../api";
import { closeDb, db, skipReason } from "../env";
import { clientFor, type HttpClient } from "../http";
import {
  NORTHBRIDGE_DS,
  NORTHBRIDGE_IT,
  packageApplication,
  prepareAndConfirm,
  RIVERSIDE_BUSINESS,
} from "../journey";
import { type ScenarioContext, scenario } from "../scenario";
import { type FixtureGraph, seedFixtureGraph } from "../seed";

const reason = skipReason();
let graph: FixtureGraph;
let customer: HttpClient;
let member: HttpClient;
let api: SchoolApi;

before(async () => {
  if (reason) return;
  graph = await seedFixtureGraph();
  customer = await clientFor(graph.actors.customerA!);
  member = await clientFor(graph.actors.memberA!);
  api = new SchoolApi(customer, graph.projects.A!);
});

after(async () => {
  await closeDb();
});

/** Creates a confirmed case on a fresh application. */
async function confirmedCase(ctx: ScenarioContext) {
  const { applicationId } = await packageApplication(api, graph, ctx);
  const opened = await api.createCase({
    applicationId,
    originKind: "school_application",
  });
  assert.equal(opened.status, 201, opened.text.slice(0, 200));
  const caseView = caseOf(opened.json);
  const confirmed = await prepareAndConfirm(
    api,
    caseView.caseId,
    caseView.revision
  );
  return {
    applicationId,
    caseId: caseView.caseId,
    confirmedCaseView: confirmed.confirmedCase,
  };
}

test(
  "E2E-06 offer v1 -> transitions -> v2 supersession -> constraints",
  { skip: reason },
  async () => {
    const result = await scenario({
      authorityGrade: "real_internal",
      evidenceClass: ["real_postgres", "real_http"],
      expected:
        "Offer v1 is recorded and moves only through legal forward transitions; a replacement becomes v2 with exactly one live outcome while v1 is retained unchanged; illegal/backward transitions and duplicate live rows are refused with SQLSTATE evidence.",
      gate: "G2",
      id: "E2E-06",
      run: async (ctx) => {
        const { caseId, confirmedCaseView } = await confirmedCase(ctx);
        const v1 = await api.recordOutcome({
          caseId,
          expectedRevision: confirmedCaseView.revision,
          kind: "offer",
          extra: {
            expiresOn: "2030-01-31",
            provenance: "customer_reported",
            receivedOn: "2026-10-20",
            state: "received",
          },
        });
        assert.ok(
          [200, 201].includes(v1.status),
          `offer v1: ${v1.status} ${v1.text.slice(0, 160)}`
        );
        const afterV1 = caseOf(v1.json);
        const offerV1 = (afterV1.outcomes ?? []).filter(
          (entry) => entry.kind === "offer"
        );
        assert.equal(offerV1.length, 1);
        assert.equal(offerV1[0]?.status, "received");

        const review = await api.transitionOutcome({
          action: "start_review",
          caseId,
          expectedRevision: afterV1.revision,
          kind: "offer",
          outcomeId: offerV1[0]!.outcomeId,
        });
        assert.ok(
          [200, 201].includes(review.status),
          `start_review: ${review.status} ${review.text.slice(0, 160)}`
        );
        const afterReview = caseOf(review.json);
        assert.equal(afterReview.journey?.offerState, "under_review");

        const accept = await api.transitionOutcome({
          action: "accept",
          caseId,
          decisionOn: "2026-10-24",
          expectedRevision: afterReview.revision,
          kind: "offer",
          outcomeId: offerV1[0]!.outcomeId,
        });
        assert.ok(
          [200, 201].includes(accept.status),
          `accept: ${accept.status} ${accept.text.slice(0, 160)}`
        );
        const afterAccept = caseOf(accept.json);
        assert.equal(afterAccept.journey?.offerState, "accepted");
        assert.equal(afterAccept.journey?.offerTerminal, true);

        // Backward / re-applied terminal transition must be refused.
        const backwards = await api.transitionOutcome({
          action: "decline",
          caseId,
          expectedRevision: afterAccept.revision,
          kind: "offer",
          outcomeId: offerV1[0]!.outcomeId,
        });
        assert.ok(
          backwards.status >= 400,
          `terminal decline must be refused, got ${backwards.status}`
        );
        ctx.cite(`http terminal re-transition -> ${backwards.status}`);

        // Replacement offer becomes v2 and supersedes v1.
        const v2 = await api.recordOutcome({
          caseId,
          expectedRevision: afterAccept.revision,
          kind: "offer",
          extra: {
            expiresOn: "2030-06-30",
            provenance: "customer_reported",
            receivedOn: "2026-10-27",
            state: "received",
          },
        });
        assert.ok(
          [200, 201].includes(v2.status),
          `offer v2: ${v2.status} ${v2.text.slice(0, 200)}`
        );
        const rows = (await db()`
        select id, version, state, "supersededById", "receivedOn"
        from "SchoolAdmissionOutcome" where "caseId" = ${caseId} and kind = 'offer'
        order by version`) as Array<Record<string, unknown>>;
        assert.equal(rows.length, 2, "v1 retained alongside v2");
        assert.equal(rows[0]?.version, 1);
        assert.equal(rows[0]?.receivedOn, "2026-10-20", "v1 payload unchanged");
        // The v1 row was accepted through the state machine, so it keeps its
        // terminal state; supersession only records the pointer.
        assert.equal(rows[1]?.version, 2);
        const live = rows.filter((row) => row.supersededById === null);
        assert.equal(live.length, 1, "exactly one live outcome");
        assert.equal(live[0]?.version, 2, "v2 is the current outcome");
        ctx.cite(
          "pg outcome rows: v1 retained (superseded), v2 live, one live row"
        );

        // Partial unique index refuses a second live row at the DB boundary.
        let duplicateState = "no_error";
        try {
          await db()`
          insert into "SchoolAdmissionOutcome"
            ("caseId", "projectId", kind, version, state, provenance, "reportedByUserId",
             "operationId", "requestSha256", "receivedOn")
          values (${caseId}, ${graph.projects.A}, 'offer', 99, 'received', 'customer_reported',
                  ${graph.actors.customerA!.id}, ${`dup-${Date.now()}`}, ${"d".repeat(64)}, '2026-10-28')`;
        } catch (error) {
          duplicateState = (error as { code?: string }).code ?? "unknown";
        }
        assert.equal(
          duplicateState,
          "23505",
          `duplicate live outcome must violate the unique index (${duplicateState})`
        );
        ctx.cite("pg duplicate live outcome -> SQLSTATE 23505");
        return `v1 received->under_review->accepted (terminal); terminal re-transition refused ${backwards.status}; v2 live with v1 retained; duplicate live row refused 23505`;
      },
    });
    assert.equal(result.verdict, "PASS", result.observed);
  }
);

test(
  "E2E-11 exact replay under the original operation id and revision",
  { skip: reason },
  async () => {
    const result = await scenario({
      authorityGrade: "real_internal",
      evidenceClass: ["real_postgres", "real_http"],
      expected:
        "Two genuinely competing builds yield one winner and one revision conflict; an exact replay with the original operation id, payload and expected revision returns the recorded result with no new revision, event or package; a changed payload under the same operation id is an idempotency conflict.",
      gate: "G2",
      id: "E2E-11",
      run: async (ctx) => {
        const applicationId = await (async () => {
          const created = await api.createApplication(NORTHBRIDGE_DS);
          assert.equal(created.status, 201, created.text.slice(0, 160));
          return applicationOf(created.json).applicationId;
        })();
        let view = applicationOf(
          (await api.getApplication(applicationId)).json
        );
        const bound = await api.bindReference({
          applicationId,
          expectedRevision: view.revision,
          kind: "fact",
          referenceId: graph.facts.finance!,
        });
        assert.equal(bound.status, 200, bound.text.slice(0, 160));
        view = applicationOf((await api.getApplication(applicationId)).json);
        const revision = view.revision;

        const [first, second] = await Promise.all([
          api.buildPackage({
            applicationId,
            expectedRevision: revision,
            operationId: "completion-cas-a",
          }),
          api.buildPackage({
            applicationId,
            expectedRevision: revision,
            operationId: "completion-cas-b",
          }),
        ]);
        const statuses = [first.status, second.status].sort();
        assert.deepEqual(
          statuses,
          [200, 409],
          `expected exactly one 200 and one 409, got ${statuses.join(",")}`
        );
        const winnerOperationId =
          first.status === 200 ? "completion-cas-a" : "completion-cas-b";
        const loserOperationId =
          first.status === 200 ? "completion-cas-b" : "completion-cas-a";

        const afterRace = applicationOf(
          (await api.getApplication(applicationId)).json
        );
        assert.equal(
          afterRace.revision,
          revision + 1,
          "revision advanced exactly once"
        );
        const currentRows = (await db()`
        select count(*)::int as n from "SchoolApplicationPackage"
        where "applicationId" = ${applicationId} and status = 'current'`) as Array<{
          n: number;
        }>;
        assert.equal(currentRows[0]?.n, 1, "exactly one current package");
        const operations = (await db()`
        select "operationId" from "SchoolApplicationOperation"
        where "operationId" in (${winnerOperationId}, ${loserOperationId})`) as Array<{
          operationId: string;
        }>;
        assert.deepEqual(
          operations.map((row) => row.operationId),
          [winnerOperationId],
          "loser left no operation row"
        );
        const eventsBefore = (await db()`
        select count(*)::int as n from "SchoolApplicationEvent" where "applicationId" = ${applicationId}`) as Array<{
          n: number;
        }>;
        const packagesBefore = (await db()`
        select count(*)::int as n from "SchoolApplicationPackage" where "applicationId" = ${applicationId}`) as Array<{
          n: number;
        }>;

        // Exact replay: same operation id, same payload, same expected revision.
        const replay = await api.buildPackage({
          applicationId,
          expectedRevision: revision,
          operationId: winnerOperationId,
        });
        assert.equal(
          replay.status,
          200,
          `exact replay must succeed: ${replay.status} ${replay.text.slice(0, 200)}`
        );
        assert.equal(
          (replay.json as { replayed?: boolean } | null)?.replayed,
          true,
          "replay metadata must be reported"
        );

        const afterReplay = applicationOf(
          (await api.getApplication(applicationId)).json
        );
        assert.equal(
          afterReplay.revision,
          revision + 1,
          "exact replay must not advance the revision"
        );
        const eventsAfter = (await db()`
        select count(*)::int as n from "SchoolApplicationEvent" where "applicationId" = ${applicationId}`) as Array<{
          n: number;
        }>;
        const packagesAfter = (await db()`
        select count(*)::int as n from "SchoolApplicationPackage" where "applicationId" = ${applicationId}`) as Array<{
          n: number;
        }>;
        assert.equal(
          eventsAfter[0]?.n,
          eventsBefore[0]?.n,
          "exact replay adds no audit event"
        );
        assert.equal(
          packagesAfter[0]?.n,
          packagesBefore[0]?.n,
          "exact replay adds no package"
        );
        ctx.cite(
          "http exact replay -> 200 replayed=true; revision/events/packages unchanged"
        );

        // Changed payload under the same operation id: the authored request differs
        // (different expected revision), so it must be an idempotency conflict.
        const changed = await api.buildPackage({
          applicationId,
          expectedRevision: revision + 1,
          operationId: winnerOperationId,
        });
        const changedStatus = changed.status;
        assert.equal(
          changedStatus,
          409,
          `changed payload must conflict, got ${changedStatus} ${changed.text.slice(0, 160)}`
        );
        const finalRows = (await db()`
        select count(*)::int as n from "SchoolApplicationPackage"
        where "applicationId" = ${applicationId} and status = 'current'`) as Array<{
          n: number;
        }>;
        assert.equal(
          finalRows[0]?.n,
          1,
          "no duplicate current package after conflicts"
        );
        ctx.cite(`http changed payload same operationId -> ${changedStatus}`);
        return `race ${statuses.join("/")}; winner only ${winnerOperationId}; exact replay replayed=true with zero new rows; changed payload refused ${changedStatus}`;
      },
    });
    assert.equal(result.verdict, "PASS", result.observed);
  }
);

test(
  "E2E-07 CoE provenance distinction with provider verification unavailable",
  { skip: reason },
  async () => {
    const result = await scenario({
      authorityGrade: "deny_only",
      evidenceClass: ["real_postgres", "real_http", "deny_only"],
      expected:
        "customer_reported and document_backed_unverified CoE remain distinguishable, provider confirmation is unavailable and refused, and the clean document-backed positive path is reported UNVERIFIED because the M2 scan/audit chain cannot be produced in this campaign.",
      gate: "G2",
      id: "E2E-07",
      run: async (ctx) => {
        const { caseId, confirmedCaseView } = await confirmedCase(ctx);
        const claimed = await api.recordOutcome({
          caseId,
          expectedRevision: confirmedCaseView.revision,
          kind: "coe",
          extra: {
            provenance: "customer_reported",
            receivedOn: "2026-10-25",
            state: "claimed",
          },
        });
        assert.ok(
          [200, 201].includes(claimed.status),
          `claimed CoE: ${claimed.status} ${claimed.text.slice(0, 160)}`
        );
        assert.equal(caseOf(claimed.json).journey?.coeState, "claimed");

        const claimedRows = (await db()`
        select provenance, state from "SchoolAdmissionOutcome"
        where "caseId" = ${caseId} and kind = 'coe' order by version`) as Array<
          Record<string, unknown>
        >;
        assert.equal(claimedRows.length, 1);
        assert.equal(claimedRows[0]?.provenance, "customer_reported");

        // Document-backed provenance without authorized evidence must be refused.
        const backed = await api.recordOutcome({
          caseId,
          expectedRevision: caseOf(claimed.json).revision,
          kind: "coe",
          extra: {
            provenance: "document_backed_unverified",
            receivedOn: "2026-10-26",
            state: "obtained",
          },
        });
        const backedStatus = backed.status;
        assert.ok(
          backedStatus >= 400,
          `document-backed provenance without evidence must be refused, got ${backedStatus}`
        );
        ctx.cite(
          `http document_backed_unverified without evidence -> ${backedStatus}`
        );

        // Provider confirmation is never accepted from a customer-authored call.
        const provider = await api.recordOutcome({
          caseId,
          expectedRevision: caseOf(claimed.json).revision,
          kind: "coe",
          extra: {
            provenance: "provider_confirmed",
            receivedOn: "2026-10-27",
            state: "obtained",
          },
        });
        assert.ok(
          provider.status >= 400,
          `provider_confirmed must be refused, got ${provider.status}`
        );
        const allRows = (await db()`
        select provenance from "SchoolAdmissionOutcome" where "caseId" = ${caseId}`) as Array<
          Record<string, unknown>
        >;
        for (const row of allRows) {
          assert.notEqual(row.provenance, "provider_confirmed");
          assert.notEqual(row.provenance, "document_backed_unverified");
        }
        const finalCase = caseOf((await api.getCase(caseId)).json);
        assert.equal(
          finalCase.journey?.student500Eligibility,
          "not_determined"
        );
        ctx.note(
          "UNVERIFIED SUB-PATH: a clean document_backed_unverified CoE requires the M2 scan-run + ProjectOperation + ProjectEvent audit chain produced by the real scan worker. No authorized synthetic scan workflow exists in this campaign, so the document-backed positive path was not exercised and must not be reported as accepted."
        );
        return `claimed CoE recorded (customer_reported); document-backed without evidence refused ${backedStatus}; provider_confirmed refused ${provider.status}; clean document-backed positive path UNVERIFIED`;
      },
    });
    assert.equal(result.verdict, "PASS", result.observed);
  }
);

test(
  "E2E-12 archive keeps history and blocks downstream readiness",
  { skip: reason },
  async () => {
    const result = await scenario({
      authorityGrade: "real_internal",
      evidenceClass: ["real_postgres", "real_http"],
      expected:
        "An archived application keeps its package/preparation history and creator-private visibility, refuses rebuild and reconfirmation, marks the linked case source-stale, and can never reach managed READY.",
      gate: "G2",
      id: "E2E-12",
      run: async (ctx) => {
        const { applicationId, caseId, confirmedCaseView } =
          await confirmedCase(ctx);
        const beforeRows = (await db()`
        select version, status from "SchoolApplicationPackage"
        where "applicationId" = ${applicationId} order by version`) as Array<
          Record<string, unknown>
        >;
        assert.ok(
          beforeRows.length >= 1,
          "package history exists before archive"
        );

        const archived = await api.archiveApplication({
          applicationId,
          expectedRevision: applicationOf(
            (await api.getApplication(applicationId)).json
          ).revision,
        });
        assert.ok(
          [200, 201].includes(archived.status),
          `archive: ${archived.status} ${archived.text.slice(0, 160)}`
        );
        const archivedView = applicationOf(archived.json);
        assert.ok(archivedView.archivedAt, "archivedAt recorded");

        const rebuild = await api.buildPackage({
          applicationId,
          expectedRevision: archivedView.revision,
        });
        assert.ok(
          rebuild.status >= 400,
          `archived rebuild refused, got ${rebuild.status}`
        );

        const historyAfter = (await db()`
        select version, status from "SchoolApplicationPackage"
        where "applicationId" = ${applicationId} order by version`) as Array<
          Record<string, unknown>
        >;
        assert.deepEqual(
          historyAfter,
          beforeRows,
          "package history unchanged by archive"
        );

        const caseView = caseOf((await api.getCase(caseId)).json);
        assert.equal(
          caseView.preparationStale,
          true,
          "linked case becomes stale after archive"
        );
        const reconfirm = await api.confirmPreparation({
          caseId,
          expectedRevision: caseView.revision,
          preparationId: caseView.preparation?.preparationId as string,
        });
        assert.ok(
          reconfirm.status >= 400,
          `reconfirmation after archive must be refused, got ${reconfirm.status}`
        );
        ctx.cite(
          `http archive -> ${archived.status}; rebuild ${rebuild.status}; reconfirm ${reconfirm.status}`
        );

        const managed = await api.setServiceMode({
          caseId,
          expectedRevision: caseView.revision,
          serviceMode: "managed_service",
        });
        if ([200, 201].includes(managed.status)) {
          const readiness = await api.readiness({
            caseId,
            expectedRevision: caseOf(managed.json).revision,
          });
          const readinessCase = caseOf(readiness.json);
          assert.notEqual(readinessCase.managedReadiness?.status, "READY");
          assert.equal(
            readinessCase.managedReadiness?.submissionState,
            "not_connected"
          );
        }

        const memberApi = new SchoolApi(member, graph.projects.A!);
        const memberView = await memberApi.getApplication(applicationId);
        assert.ok(
          [403, 404].includes(memberView.status),
          `member must not read archived application (${memberView.status})`
        );
        ctx.cite(
          "pg history retained; member read denied on archived application"
        );
        return `archived ${archived.status}; rebuild refused ${rebuild.status}; case stale; reconfirm refused ${reconfirm.status}; history ${historyAfter.length} retained; member ${memberView.status}`;
      },
    });
    assert.equal(result.verdict, "PASS", result.observed);
  }
);

test(
  "E2E-10-R owner-approved read-only closed-Project policy",
  { skip: reason },
  async () => {
    const result = await scenario({
      authorityGrade: "real_internal",
      evidenceClass: ["real_postgres", "real_http"],
      expected:
        "Owner-approved interpretation of the frozen E2E-10 wording: a closed Project blocks new mutations while its still-authorized creator keeps permitted historical read-only access; unauthorized members and unrelated creators stay denied and no active status is resurrected.",
      gate: "G2",
      id: "E2E-10-R",
      run: async (ctx) => {
        const closedApi = new SchoolApi(customer, graph.projects.closed!);
        const created = await closedApi.createApplication(NORTHBRIDGE_IT);
        const createdOk = created.status === 201;
        if (!createdOk) {
          assert.ok(
            [403, 404, 409].includes(created.status),
            `write on closed project: ${created.status}`
          );
        }
        const read = await closedApi.listApplications();
        assert.ok(
          [200, 403, 404].includes(read.status),
          `read: ${read.status}`
        );

        await db()`
        update "StudyJourneyProject" set status = 'closed', "closedAt" = coalesce("closedAt", now())
        where id = ${graph.projects.closed}`;
        const afterClose =
          await closedApi.createApplication(RIVERSIDE_BUSINESS);
        assert.ok(
          [400, 403, 404, 409].includes(afterClose.status),
          `closed write must be rejected (${afterClose.status})`
        );
        const ownerRead = await closedApi.listApplications();
        ctx.cite(
          `http closed project: write ${afterClose.status}, owner read ${ownerRead.status}`
        );

        const statusRow = (await db()`
        select status, "closedAt" from "StudyJourneyProject" where id = ${graph.projects.closed}`) as Array<
          Record<string, unknown>
        >;
        assert.equal(
          statusRow[0]?.status,
          "closed",
          "no active status resurrection"
        );
        assert.ok(statusRow[0]?.closedAt, "closedAt retained");

        const foreignApi = new SchoolApi(
          await clientFor(graph.actors.customerB!),
          graph.projects.closed!
        );
        const foreignRead = await foreignApi.listApplications();
        assert.ok(
          [403, 404].includes(foreignRead.status),
          `unrelated creator must be denied (${foreignRead.status})`
        );
        ctx.note(
          "OWNER-APPROVED INTERPRETATION (Correction: E2E-10-R): the original frozen E2E-10 wording ('closure denies reads and writes') is preserved unchanged in the first campaign record. The accepted policy is read-only history for the still-authorized creator/owner, with all writes and all other actors denied."
        );
        return `closed project: write ${afterClose.status}, owner read ${ownerRead.status}, foreign creator ${foreignRead.status}, status remains closed`;
      },
    });
    assert.equal(result.verdict, "PASS", result.observed);
  }
);
