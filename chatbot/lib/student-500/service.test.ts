// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions live in helpers used by tests.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Student500Error } from "./contracts";
import { createInMemoryStudent500Store } from "./in-memory-store";
import { createDeclaredStudent500LegalSourceProvider } from "./legal-source-provider";
import { createStudent500RequirementResolver } from "./requirement-resolver";
import {
  createStudent500Service,
  type Student500SchoolApplicationLinkResolver,
} from "./service";

/**
 * Phase 13 M6.1 service tests (offline).
 *
 * Prove: Project/actor authority, existence-hiding, revoked-membership and closed
 * Project rejection, exact idempotent replay, CAS, archive terminality, the bounded
 * per-Project limit, link re-authorization and persistence across a reload.
 */

const OWNER = "11111111-1111-4111-8111-111111111101";
const MEMBER = "11111111-1111-4111-8111-111111111102";
const STRANGER = "11111111-1111-4111-8111-111111111103";
const STAFF = "11111111-1111-4111-8111-111111111104";
const GUEST = "11111111-1111-4111-8111-111111111105";
const PROJECT_A = "22222222-2222-4222-8222-222222222201";
const PROJECT_B = "22222222-2222-4222-8222-222222222202";
const SCHOOL_APP = "33333333-3333-4333-8333-333333333301";

function harness(options: { readonly linkAvailable?: boolean } = {}) {
  const store = createInMemoryStudent500Store();
  store.seedActor(OWNER, { registeredCustomer: true });
  store.seedActor(MEMBER, {
    memberships: { [PROJECT_A]: "active" },
    registeredCustomer: true,
  });
  store.seedActor(STRANGER, { registeredCustomer: true });
  store.seedActor(STAFF, { registeredCustomer: true, staff: true });
  store.seedActor(GUEST, { registeredCustomer: false });
  store.seedProject(PROJECT_A, { ownerUserId: OWNER, status: "active" });
  store.seedProject(PROJECT_B, { ownerUserId: STRANGER, status: "active" });

  const linkAvailable = options.linkAvailable ?? true;
  const schoolApplicationLink: Student500SchoolApplicationLinkResolver = {
    resolve(input) {
      if (input.applicationId !== SCHOOL_APP || input.actorUserId !== OWNER) {
        return Promise.resolve({ status: "not_found" });
      }
      if (!linkAvailable) {
        return Promise.resolve({ status: "forbidden" });
      }
      return Promise.resolve({
        applicationStatus: "preparing",
        sourceStatus: "unverified_customer_declared",
        status: "resolved",
      });
    },
  };

  const service = createStudent500Service({
    resolver: createStudent500RequirementResolver({
      provider: createDeclaredStudent500LegalSourceProvider(),
    }),
    schoolApplicationLink,
    store,
  });

  return { service, store };
}

async function code(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof Student500Error, String(error));
    return error.code;
  }
  throw new Error("expected a Student500Error");
}

test("a Project owner creates and reopens a persistent preparation record", async () => {
  const { service, store } = harness();
  const created = await service.create({
    actorUserId: OWNER,
    context: {
      applicationPlace: "onshore",
      asOfDate: "2026-11-03",
      entryRoute: "existing_coe",
      coeStatus: "reported_held",
    },
    operationId: "op-create-1",
    projectId: PROJECT_A,
  });
  assert.equal(created.replayed, false);
  assert.equal(created.application.status, "draft");
  assert.equal(created.application.revision, 1);
  assert.equal(
    created.application.screening.studyEvidence.coeVerification,
    "customer_reported_not_verified"
  );

  // A reload is a fresh read of the persisted record, not local state.
  const reopened = await service.get({
    actorUserId: OWNER,
    applicationId: created.application.applicationId,
    projectId: PROJECT_A,
  });
  assert.equal(reopened.context.entryRoute, "existing_coe");
  assert.equal(reopened.context.asOfDate, "2026-11-03");
  assert.equal(reopened.events.length, 1);

  const listed = await service.list({
    actorUserId: OWNER,
    projectId: PROJECT_A,
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.applicationId, created.application.applicationId);
  assert.equal(store.writes.length, 1);
});

test("a Project member gets their own private record, never the owner's", async () => {
  const { service } = harness();
  const ownerRecord = await service.create({
    actorUserId: OWNER,
    operationId: "op-owner",
    projectId: PROJECT_A,
  });

  const memberList = await service.list({
    actorUserId: MEMBER,
    projectId: PROJECT_A,
  });
  assert.equal(memberList.length, 0);

  assert.equal(
    await code(() =>
      service.get({
        actorUserId: MEMBER,
        applicationId: ownerRecord.application.applicationId,
        projectId: PROJECT_A,
      })
    ),
    "application_not_found"
  );
  assert.equal(
    await code(() =>
      service.update({
        actorUserId: MEMBER,
        applicationId: ownerRecord.application.applicationId,
        context: {},
        expectedRevision: 1,
        operationId: "op-member-update",
        projectId: PROJECT_A,
      })
    ),
    "application_not_found"
  );
  assert.equal(
    await code(() =>
      service.archive({
        actorUserId: MEMBER,
        applicationId: ownerRecord.application.applicationId,
        expectedRevision: 1,
        operationId: "op-member-archive",
        projectId: PROJECT_A,
      })
    ),
    "application_not_found"
  );
});

test("another Project can never read or mutate this Project's records", async () => {
  const { service } = harness();
  const ownerRecord = await service.create({
    actorUserId: OWNER,
    operationId: "op-a",
    projectId: PROJECT_A,
  });
  // STRANGER owns Project B and is authenticated, but crosses the boundary.
  assert.equal(
    await code(() =>
      service.get({
        actorUserId: STRANGER,
        applicationId: ownerRecord.application.applicationId,
        projectId: PROJECT_B,
      })
    ),
    "application_not_found"
  );
  assert.equal(
    await code(() =>
      service.create({
        actorUserId: STRANGER,
        operationId: "op-b",
        projectId: PROJECT_A,
      })
    ),
    "project_forbidden"
  );
  assert.equal(
    await code(() =>
      service.list({ actorUserId: STRANGER, projectId: PROJECT_A })
    ),
    "project_forbidden"
  );
});

test("guests and staff never hold private preparation authority", async () => {
  const { service } = harness();
  assert.equal(
    await code(() =>
      service.create({
        actorUserId: GUEST,
        operationId: "op-guest",
        projectId: PROJECT_A,
      })
    ),
    "actor_not_eligible"
  );
  assert.equal(
    await code(() =>
      service.create({
        actorUserId: STAFF,
        operationId: "op-staff",
        projectId: PROJECT_A,
      })
    ),
    "actor_not_eligible"
  );
  assert.equal(
    await code(() =>
      service.list({ actorUserId: STAFF, projectId: PROJECT_A })
    ),
    "actor_not_eligible"
  );
});

test("a revoked membership cannot keep using stale authorization", async () => {
  const { service, store } = harness();
  const memberRecord = await service.create({
    actorUserId: MEMBER,
    operationId: "op-m1",
    projectId: PROJECT_A,
  });
  store.setMembership(PROJECT_A, MEMBER, "revoked");
  assert.equal(
    await code(() =>
      service.get({
        actorUserId: MEMBER,
        applicationId: memberRecord.application.applicationId,
        projectId: PROJECT_A,
      })
    ),
    "project_forbidden"
  );
  assert.equal(
    await code(() =>
      service.update({
        actorUserId: MEMBER,
        applicationId: memberRecord.application.applicationId,
        context: {},
        expectedRevision: 1,
        operationId: "op-m2",
        projectId: PROJECT_A,
      })
    ),
    "project_forbidden"
  );
});

test("a closed Project rejects writes but keeps history readable", async () => {
  const { service, store } = harness();
  const created = await service.create({
    actorUserId: OWNER,
    operationId: "op-close-1",
    projectId: PROJECT_A,
  });
  store.setProjectStatus(PROJECT_A, "closed");
  assert.equal(
    await code(() =>
      service.update({
        actorUserId: OWNER,
        applicationId: created.application.applicationId,
        context: {},
        expectedRevision: 1,
        operationId: "op-close-2",
        projectId: PROJECT_A,
      })
    ),
    "project_closed"
  );
  assert.equal(
    await code(() =>
      service.create({
        actorUserId: OWNER,
        operationId: "op-close-3",
        projectId: PROJECT_A,
      })
    ),
    "project_closed"
  );
  const readable = await service.get({
    actorUserId: OWNER,
    applicationId: created.application.applicationId,
    projectId: PROJECT_A,
  });
  assert.equal(readable.applicationId, created.application.applicationId);
});

test("an exact retry replays and a changed request conflicts", async () => {
  const { service, store } = harness();
  const context = {
    applicationPlace: "offshore" as const,
    asOfDate: "2026-11-03",
    entryRoute: "offer_only" as const,
    coeStatus: "reported_not_held" as const,
  };
  const first = await service.create({
    actorUserId: OWNER,
    context,
    operationId: "op-retry",
    projectId: PROJECT_A,
  });
  const second = await service.create({
    actorUserId: OWNER,
    context,
    operationId: "op-retry",
    projectId: PROJECT_A,
  });
  assert.equal(second.replayed, true);
  assert.equal(
    second.application.applicationId,
    first.application.applicationId
  );
  assert.equal(store.writes.length, 1);

  assert.equal(
    await code(() =>
      service.create({
        actorUserId: OWNER,
        context: { ...context, applicationPlace: "onshore" },
        operationId: "op-retry",
        projectId: PROJECT_A,
      })
    ),
    "idempotency_conflict"
  );
});

test("an update must carry the current revision", async () => {
  const { service } = harness();
  const created = await service.create({
    actorUserId: OWNER,
    operationId: "op-cas-1",
    projectId: PROJECT_A,
  });
  const updated = await service.update({
    actorUserId: OWNER,
    applicationId: created.application.applicationId,
    context: { applicationPlace: "offshore", asOfDate: "2026-11-03" },
    expectedRevision: 1,
    operationId: "op-cas-2",
    projectId: PROJECT_A,
  });
  assert.equal(updated.application.revision, 2);
  assert.equal(updated.application.status, "in_progress");

  assert.equal(
    await code(() =>
      service.update({
        actorUserId: OWNER,
        applicationId: created.application.applicationId,
        context: { applicationPlace: "onshore" },
        expectedRevision: 1,
        operationId: "op-cas-3",
        projectId: PROJECT_A,
      })
    ),
    "revision_conflict"
  );
});

test("archive is terminal, and its exact retry replays", async () => {
  const { service } = harness();
  const created = await service.create({
    actorUserId: OWNER,
    operationId: "op-arch-1",
    projectId: PROJECT_A,
  });
  const archived = await service.archive({
    actorUserId: OWNER,
    applicationId: created.application.applicationId,
    expectedRevision: 1,
    operationId: "op-arch-2",
    projectId: PROJECT_A,
  });
  assert.equal(archived.application.status, "archived");
  assert.ok(archived.application.archivedAt);
  assert.equal(
    archived.application.screening.submissionStatus,
    "not_submission_ready"
  );

  const replay = await service.archive({
    actorUserId: OWNER,
    applicationId: created.application.applicationId,
    expectedRevision: 1,
    operationId: "op-arch-2",
    projectId: PROJECT_A,
  });
  assert.equal(replay.replayed, true);

  assert.equal(
    await code(() =>
      service.update({
        actorUserId: OWNER,
        applicationId: created.application.applicationId,
        context: {},
        expectedRevision: 2,
        operationId: "op-arch-3",
        projectId: PROJECT_A,
      })
    ),
    "application_archived"
  );
});

test("the per-Project bound is enforced inside the store", async () => {
  const { service } = harness();
  for (let index = 0; index < 6; index += 1) {
    await service.create({
      actorUserId: OWNER,
      operationId: `op-limit-${index}`,
      projectId: PROJECT_A,
    });
  }
  assert.equal(
    await code(() =>
      service.create({
        actorUserId: OWNER,
        operationId: "op-limit-over",
        projectId: PROJECT_A,
      })
    ),
    "limit_exceeded"
  );
});

test("a linked school application is re-authorized before it is recorded", async () => {
  const allowed = harness();
  const created = await allowed.service.create({
    actorUserId: OWNER,
    context: {
      coeStatus: "reported_not_held",
      entryRoute: "school_application_in_progress",
      schoolApplicationId: SCHOOL_APP,
    },
    operationId: "op-link-1",
    projectId: PROJECT_A,
  });
  assert.equal(
    created.application.screening.studyEvidence.linkedSchoolApplication
      ?.available,
    true
  );

  const denied = harness({ linkAvailable: false });
  assert.equal(
    await code(() =>
      denied.service.create({
        actorUserId: OWNER,
        context: {
          coeStatus: "reported_not_held",
          entryRoute: "school_application_in_progress",
          schoolApplicationId: SCHOOL_APP,
        },
        operationId: "op-link-2",
        projectId: PROJECT_A,
      })
    ),
    "reference_invalid"
  );
  assert.equal(denied.store.writes.length, 0);
});

test("a member's own record never exposes another applicant identity", async () => {
  const { service } = harness();
  const memberRecord = await service.create({
    actorUserId: MEMBER,
    operationId: "op-private-1",
    projectId: PROJECT_A,
  });
  const serialized = JSON.stringify(memberRecord.application);
  assert.equal(serialized.includes(OWNER), false);
  assert.equal(serialized.includes(MEMBER), false);
  assert.equal(memberRecord.application.projectId, PROJECT_A);
});

test("no view ever claims verification, approval or submission readiness", async () => {
  const { service } = harness();
  const created = await service.create({
    actorUserId: OWNER,
    context: {
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
    },
    operationId: "op-honest-1",
    projectId: PROJECT_A,
  });
  const screening = created.application.screening;
  assert.equal(screening.submissionStatus, "not_submission_ready");
  assert.equal(screening.preparationState, "screening_complete_pending_review");
  for (const entry of screening.requirements) {
    assert.notEqual(entry.sourceVerification, "verified_official_corpus");
    assert.equal(
      ["applicable", "conditional", "not_applicable", "unknown"].includes(
        entry.status
      ),
      true
    );
  }
  const serialized = JSON.stringify(screening).toLowerCase();
  for (const forbidden of ["approved", 'eligible"', "ready_to_submit"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
