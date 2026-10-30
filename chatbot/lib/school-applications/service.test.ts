import assert from "node:assert/strict";
import { test } from "node:test";
import type { SchoolCatalogResolution } from "./contracts";
import { createInMemorySchoolApplicationStore } from "./in-memory-store";
import type { SchoolApplicationCatalogResolver } from "./ports";
import { createSchoolApplicationService } from "./service";

const owner = "11111111-1111-4111-8111-111111111101";
const member = "11111111-1111-4111-8111-111111111102";
const outsider = "11111111-1111-4111-8111-111111111103";
const staffUser = "11111111-1111-4111-8111-111111111104";
const guestUser = "11111111-1111-4111-8111-111111111105";
const projectId = "22222222-2222-4222-8222-222222222201";
const otherProjectId = "22222222-2222-4222-8222-222222222202";
const closedProjectId = "22222222-2222-4222-8222-222222222203";
const factId = "33333333-3333-4333-8333-333333333301";
const secondFactId = "33333333-3333-4333-8333-333333333302";
const missingReferenceId = "33333333-3333-4333-8333-333333333399";

const unverifiedCatalog: SchoolApplicationCatalogResolver = {
  resolve: () =>
    Promise.resolve({
      courseId: "course:unverified:1",
      courseTitle: "Master of Data Science",
      deliveryId: null,
      institutionId: "provider:unverified:1",
      institutionName: "Example Institute",
      intakeId: null,
      intakeLabel: null,
      recordClass: "UNVERIFIED",
      snapshotToken: "snapshot-token-1",
      status: "resolved",
    } satisfies SchoolCatalogResolution),
};

const syntheticCatalog: SchoolApplicationCatalogResolver = {
  resolve: () =>
    Promise.resolve({
      courseId: "course:synthetic:1",
      courseTitle: "Synthetic Diploma of Networking",
      deliveryId: null,
      institutionId: "provider:synthetic:1",
      institutionName: "Synthetic Test College",
      intakeId: null,
      intakeLabel: null,
      recordClass: "SYNTHETIC",
      snapshotToken: "synthetic-snapshot-1",
      status: "resolved",
    } satisfies SchoolCatalogResolution),
};

const unresolvedCatalog: SchoolApplicationCatalogResolver = {
  resolve: () => Promise.resolve({ status: "unresolved" }),
};

function harness(
  catalogResolver: SchoolApplicationCatalogResolver = unresolvedCatalog
) {
  const store = createInMemorySchoolApplicationStore();
  store.seedProject(projectId, { ownerUserId: owner, status: "active" });
  store.seedProject(otherProjectId, {
    ownerUserId: outsider,
    status: "active",
  });
  store.seedProject(closedProjectId, { ownerUserId: owner, status: "closed" });
  store.seedActor(owner, { registeredCustomer: true });
  store.seedActor(member, {
    memberships: { [projectId]: "active" },
    registeredCustomer: true,
  });
  store.seedActor(outsider, { registeredCustomer: true });
  store.seedActor(staffUser, { registeredCustomer: false, staff: true });
  store.seedActor(guestUser, { registeredCustomer: false });
  store.seedReferenceOwner({
    kind: "fact",
    ownerUserId: owner,
    projectId,
    referenceId: factId,
    sha256: "a".repeat(64),
    version: 1,
  });
  store.seedReferenceOwner({
    kind: "fact",
    ownerUserId: owner,
    projectId,
    referenceId: secondFactId,
    sha256: "b".repeat(64),
    version: 1,
  });
  const service = createSchoolApplicationService({
    catalogResolver,
    referenceResolver: store.referenceResolver(),
    store,
  });
  return { service, store };
}

function application(
  overrides: Partial<{
    actorUserId: string;
    projectId: string;
    operationId: string;
    institutionName: string;
    courseTitle: string;
    intakeLabel: string | null;
    institutionId: string | null;
  }> = {}
) {
  return {
    actorUserId: owner,
    courseTitle: "Bachelor of Nursing",
    institutionId: null,
    institutionName: "Example University",
    intakeLabel: "February 2027",
    operationId: "op-create-1",
    projectId,
    ...overrides,
  };
}

test("three independent school applications coexist under one authorized Project", async () => {
  const { service } = harness();
  const created = await Promise.all([
    service.create(
      application({ courseTitle: "Bachelor of Nursing", operationId: "op-1" })
    ),
    service.create(
      application({
        courseTitle: "Master of Data Science",
        institutionName: "Second University",
        operationId: "op-2",
      })
    ),
    service.create(
      application({
        courseTitle: "Bachelor of Nursing",
        intakeLabel: "July 2027",
        operationId: "op-3",
      })
    ),
  ]);
  assert.equal(
    new Set(created.map((entry) => entry.application.applicationId)).size,
    3
  );
  const list = await service.list({ actorUserId: owner, projectId });
  assert.equal(list.length, 3);
  assert.deepEqual(
    list.map((entry) => entry.status),
    ["draft", "draft", "draft"]
  );
  assert.deepEqual(
    list.map((entry) => entry.revision),
    [1, 1, 1]
  );
  const titles = list.map(
    (entry) =>
      `${entry.institution.name}:${entry.course.title}:${entry.intake.label}`
  );
  assert.equal(new Set(titles).size, 3);

  const reloaded = await service.get({
    actorUserId: owner,
    applicationId: created[0]?.application.applicationId ?? "",
    projectId,
  });
  assert.equal(reloaded.course.title, "Bachelor of Nursing");
  assert.equal(reloaded.events.length, 1);
  assert.equal(reloaded.events[0]?.eventType, "school_application_created");

  const updated = await service.update({
    actorUserId: owner,
    applicationId: reloaded.applicationId,
    courseTitle: "Bachelor of Nursing (Honours)",
    expectedRevision: reloaded.revision,
    institutionName: "Example University",
    intakeLabel: "February 2027",
    operationId: "op-4",
    projectId,
  });
  assert.equal(updated.application.revision, 2);
  assert.equal(updated.application.status, "preparing");

  await service.archive({
    actorUserId: owner,
    applicationId: updated.application.applicationId,
    expectedRevision: updated.application.revision,
    operationId: "op-5",
    projectId,
  });
  const afterArchive = await service.list({ actorUserId: owner, projectId });
  assert.equal(afterArchive.length, 3);
  assert.equal(
    afterArchive.filter((entry) => entry.status === "archived").length,
    1
  );
});

test("duplicate operation replays the same application and a changed payload conflicts", async () => {
  const { service, store } = harness();
  const first = await service.create(application({ operationId: "op-replay" }));
  const replay = await service.create(
    application({ operationId: "op-replay" })
  );
  assert.equal(replay.replayed, true);
  assert.equal(
    replay.application.applicationId,
    first.application.applicationId
  );
  assert.equal(store.state().applications.length, 1);

  await assert.rejects(
    service.create(
      application({ courseTitle: "Different Course", operationId: "op-replay" })
    ),
    (error: unknown) =>
      (error as { code?: string }).code === "idempotency_conflict"
  );
  assert.equal(store.state().applications.length, 1);
  assert.equal(store.state().operations.length, 1);
});

test("authorization is server-derived and never widened by membership, staff status or payload identity", async () => {
  const { service, store } = harness();

  await assert.rejects(
    service.list({ actorUserId: guestUser, projectId }),
    (error: unknown) =>
      (error as { code?: string }).code === "actor_not_eligible"
  );
  await assert.rejects(
    service.list({ actorUserId: staffUser, projectId }),
    (error: unknown) =>
      (error as { code?: string }).code === "actor_not_eligible"
  );
  await assert.rejects(
    service.list({ actorUserId: outsider, projectId }),
    (error: unknown) =>
      (error as { code?: string }).code === "project_forbidden"
  );
  await assert.rejects(
    service.list({ actorUserId: owner, projectId: "not-a-uuid" }),
    (error: unknown) => (error as { code?: string }).code === "invalid_request"
  );

  const owned = await service.create(application({ operationId: "op-owner" }));
  assert.deepEqual(await service.list({ actorUserId: member, projectId }), []);
  await assert.rejects(
    service.get({
      actorUserId: member,
      applicationId: owned.application.applicationId,
      projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "application_not_found"
  );
  await assert.rejects(
    service.update({
      actorUserId: member,
      applicationId: owned.application.applicationId,
      courseTitle: "Hijacked",
      expectedRevision: 1,
      institutionName: "Hijacked University",
      operationId: "op-hijack",
      projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "application_not_found"
  );

  // The Project owner does not automatically see a member's private application.
  const memberApplication = await service.create(
    application({ actorUserId: member, operationId: "op-member" })
  );
  await assert.rejects(
    service.get({
      actorUserId: owner,
      applicationId: memberApplication.application.applicationId,
      projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "application_not_found"
  );
  assert.equal(
    (await service.list({ actorUserId: member, projectId })).length,
    1
  );

  await assert.rejects(
    service.create(
      application({ actorUserId: staffUser, operationId: "op-staff" })
    ),
    (error: unknown) =>
      (error as { code?: string }).code === "actor_not_eligible"
  );

  await assert.rejects(
    service.get({
      actorUserId: member,
      applicationId: owned.application.applicationId,
      projectId: otherProjectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "project_forbidden"
  );
  assert.equal(store.state().applications.length, 2);
});

test("a revoked member loses access and an archived application is terminal", async () => {
  const { service, store } = harness();
  const created = await service.create(
    application({ actorUserId: member, operationId: "op-member-1" })
  );
  const active = await service.get({
    actorUserId: member,
    applicationId: created.application.applicationId,
    projectId,
  });
  assert.equal(active.revision, 1);

  store.seedActor(member, {
    memberships: { [projectId]: "revoked" },
    registeredCustomer: true,
  });
  await assert.rejects(
    service.get({
      actorUserId: member,
      applicationId: created.application.applicationId,
      projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "project_forbidden"
  );

  const ownerApplication = await service.create(
    application({ operationId: "op-archive" })
  );
  const archived = await service.archive({
    actorUserId: owner,
    applicationId: ownerApplication.application.applicationId,
    expectedRevision: ownerApplication.application.revision,
    operationId: "op-archive-1",
    projectId,
  });
  assert.equal(archived.application.status, "archived");
  assert.ok(archived.application.archivedAt);
  await assert.rejects(
    service.update({
      actorUserId: owner,
      applicationId: archived.application.applicationId,
      courseTitle: "Reopened",
      expectedRevision: archived.application.revision,
      institutionName: "Example University",
      operationId: "op-archive-2",
      projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
  await assert.rejects(
    service.archive({
      actorUserId: owner,
      applicationId: archived.application.applicationId,
      expectedRevision: archived.application.revision,
      operationId: "op-archive-3",
      projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
});

test("closed Projects keep history readable and refuse every mutation", async () => {
  const { service, store } = harness();
  await assert.rejects(
    service.create(
      application({ operationId: "op-closed", projectId: closedProjectId })
    ),
    (error: unknown) => (error as { code?: string }).code === "project_closed"
  );

  const seeded = await store.createApplication({
    operation: {
      actorUserId: owner,
      operationId: "seed-closed-1",
      operationType: "school_application_create",
      requestSha256: "c".repeat(64),
    },
    projectId,
    values: {
      catalogRecordClass: null,
      catalogSnapshotToken: null,
      courseId: null,
      courseTitle: "Bachelor of Nursing",
      deliveryId: null,
      institutionId: null,
      institutionName: "Example University",
      intakeId: null,
      intakeLabel: null,
      ownerUserId: owner,
      sourceStatus: "unverified_customer_declared",
    },
  });
  store.seedProject(projectId, { ownerUserId: owner, status: "closed" });
  const readable = await service.get({
    actorUserId: owner,
    applicationId: seeded.value.id,
    projectId,
  });
  assert.equal(readable.applicationId, seeded.value.id);
  await assert.rejects(
    service.update({
      actorUserId: owner,
      applicationId: seeded.value.id,
      courseTitle: "Changed",
      expectedRevision: seeded.value.revision,
      institutionName: "Example University",
      operationId: "op-closed-update",
      projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "project_closed"
  );
  assert.equal(store.state().applications.length, 1);
  assert.equal(store.state().applications[0]?.revision, 1);
});

test("a stale expected revision loses and concurrent writes have exactly one winner", async () => {
  const { service, store } = harness();
  const created = await service.create(
    application({ operationId: "op-cas-0" })
  );

  const [first, second] = await Promise.allSettled([
    service.update({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      courseTitle: "First write",
      expectedRevision: 1,
      institutionName: "Example University",
      operationId: "op-cas-1",
      projectId,
    }),
    service.update({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      courseTitle: "Second write",
      expectedRevision: 1,
      institutionName: "Example University",
      operationId: "op-cas-2",
      projectId,
    }),
  ]);
  assert.equal(first.status, "fulfilled");
  assert.equal(second.status, "rejected");
  assert.equal(
    (second as PromiseRejectedResult).reason.code,
    "revision_conflict"
  );

  const state = store.state();
  assert.equal(state.applications.length, 1);
  assert.equal(state.applications[0]?.revision, 2);
  assert.equal(
    state.applications[0]?.courseTitle,
    (
      first as PromiseFulfilledResult<
        Awaited<ReturnType<typeof service.update>>
      >
    ).value.application.course.title
  );
  assert.equal(
    state.events.filter(
      (event) => event.eventType === "school_application_updated"
    ).length,
    1
  );
  // No partial state: no orphan operation and no phantom revision.
  assert.equal(state.operations.length, 2);

  await assert.rejects(
    service.update({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      courseTitle: "Stale writer",
      expectedRevision: 1,
      institutionName: "Example University",
      operationId: "op-cas-3",
      projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "revision_conflict"
  );
  assert.equal(store.state().applications[0]?.revision, 2);
});

test("school data is never represented as verified or official", async () => {
  const manual = harness();
  const manualView = await manual.service.create(
    application({ operationId: "op-manual" })
  );
  assert.equal(
    manualView.application.source.status,
    "unverified_customer_declared"
  );
  assert.equal(manualView.application.source.independentlyVerified, false);
  assert.equal(manualView.application.source.catalogRecordClass, null);
  assert.ok(
    manualView.application.disclosures.includes(
      "source_not_independently_verified"
    )
  );
  assert.ok(
    manualView.application.missingDataCodes.includes(
      "source_not_independently_verified"
    )
  );

  const synthetic = harness(syntheticCatalog);
  const syntheticView = await synthetic.service.create(
    application({
      courseTitle: "ignored",
      institutionId: "provider:synthetic:1",
      institutionName: "ignored",
      operationId: "op-synthetic",
    })
  );
  assert.equal(
    syntheticView.application.source.status,
    "synthetic_catalog_match"
  );
  assert.equal(
    syntheticView.application.source.catalogRecordClass,
    "SYNTHETIC"
  );
  assert.equal(syntheticView.application.source.independentlyVerified, false);
  assert.equal(
    syntheticView.application.institution.name,
    "Synthetic Test College"
  );
  assert.ok(!JSON.stringify(syntheticView.application).includes("official"));

  const unverified = harness(unverifiedCatalog);
  const unverifiedView = await unverified.service.create(
    application({ operationId: "op-catalog" })
  );
  assert.equal(
    unverifiedView.application.source.status,
    "unverified_customer_declared"
  );

  // An asserted catalog identity that the catalog cannot confirm is rejected
  // rather than silently downgraded or trusted.
  const unresolvable = harness(unresolvedCatalog);
  await assert.rejects(
    unresolvable.service.create(
      application({
        institutionId: "provider:unknown:1",
        operationId: "op-unknown-catalog",
      })
    ),
    (error: unknown) =>
      (error as { code?: string }).code === "reference_invalid"
  );
  assert.equal(unresolvable.store.state().applications.length, 0);
});

test("references are identity bindings: owner-scoped, existence-hidden and never a disclosure", async () => {
  const { service, store } = harness();
  const created = await service.create(
    application({ operationId: "op-ref-0" })
  );

  const bound = await service.bindReference({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    expectedRevision: created.application.revision,
    kind: "fact",
    operationId: "op-ref-1",
    projectId,
    referenceId: factId,
  });
  assert.equal(bound.application.references.length, 1);
  assert.equal(bound.application.references[0]?.available, true);
  assert.equal(bound.application.references[0]?.kind, "fact");
  const serialized = JSON.stringify(bound.application);
  assert.ok(!serialized.includes("a".repeat(64)));
  assert.ok(!serialized.includes('"value"'));
  assert.ok(!serialized.includes('"content"'));

  // Another member of the same Project cannot bind the owner's private fact.
  const memberApplication = await service.create(
    application({ actorUserId: member, operationId: "op-ref-2" })
  );
  await assert.rejects(
    service.bindReference({
      actorUserId: member,
      applicationId: memberApplication.application.applicationId,
      expectedRevision: memberApplication.application.revision,
      kind: "fact",
      operationId: "op-ref-3",
      projectId,
      referenceId: factId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "reference_invalid"
  );

  await assert.rejects(
    service.bindReference({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: bound.application.revision,
      kind: "fact",
      operationId: "op-ref-4",
      projectId,
      referenceId: missingReferenceId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "reference_invalid"
  );
  assert.equal(
    store
      .state()
      .references.filter(
        (entry) => entry.applicationId === created.application.applicationId
      ).length,
    1
  );

  const revoked = await service.revokeReference({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    expectedRevision: bound.application.revision,
    operationId: "op-ref-5",
    projectId,
    referenceRecordId: bound.application.references[0]?.referenceRecordId ?? "",
  });
  assert.equal(revoked.application.references[0]?.revokedAt !== null, true);
  assert.equal(revoked.application.status, "preparing");
});

test("the preparation package is deterministic, immutable and versioned", async () => {
  const { service, store } = harness();
  const created = await service.create(
    application({ operationId: "op-pkg-0" })
  );

  const built = await service.buildPackage({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    expectedRevision: created.application.revision,
    operationId: "op-pkg-1",
    projectId,
  });
  assert.equal(built.package.version, 1);
  assert.equal(built.package.targetKind, "managed_school_application");
  assert.equal(built.package.targetVersion, 1);
  assert.equal(built.package.integrityVerified, true);
  assert.match(built.package.contentSha256, /^[0-9a-f]{64}$/u);
  assert.match(built.package.targetBindingSha256, /^[0-9a-f]{64}$/u);
  assert.equal(built.application.status, "package_prepared");
  assert.equal(built.application.packageStale, false);

  const snapshot = (
    await service.listPackages({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      projectId,
    })
  ).currentSnapshot as Record<string, unknown>;
  assert.equal(snapshot.submissionStatus, "not_submitted");
  assert.equal(snapshot.admissionStatus, "no_decision");
  assert.equal(snapshot.offerStatus, "no_offer");
  assert.equal(snapshot.coeStatus, "no_coe");
  assert.equal(snapshot.professionalReviewStatus, "not_requested");
  assert.deepEqual(snapshot.disclosures, [
    "not_a_school_submission",
    "not_professionally_reviewed",
    "no_admission_decision",
    "no_offer_or_coe",
    "no_payment_confirmation",
    "source_not_independently_verified",
  ]);

  // Same inputs at the same revision reuse the current package: no phantom version.
  const reused = await service.buildPackage({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    expectedRevision: built.application.revision,
    operationId: "op-pkg-2",
    projectId,
  });
  assert.equal(reused.package.version, 1);
  assert.equal(reused.package.packageId, built.package.packageId);
  assert.equal(reused.reusedCurrentPackage, true);
  assert.equal(store.state().packages.length, 1);

  // A material change invalidates the package instead of silently reusing it.
  const updated = await service.update({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    courseTitle: "Bachelor of Nursing (Advanced)",
    expectedRevision: built.application.revision,
    institutionName: "Example University",
    intakeLabel: "February 2027",
    operationId: "op-pkg-3",
    projectId,
  });
  assert.equal(updated.application.status, "stale");
  assert.equal(updated.application.currentPackage, null);
  assert.equal(updated.application.packages[0]?.status, "stale");

  const rebuilt = await service.buildPackage({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    expectedRevision: updated.application.revision,
    operationId: "op-pkg-4",
    projectId,
  });
  assert.equal(rebuilt.package.version, 2);
  assert.notEqual(rebuilt.package.contentSha256, built.package.contentSha256);
  assert.equal(rebuilt.application.status, "package_prepared");
  assert.deepEqual(
    rebuilt.application.packages.map((entry) => entry.status).sort(),
    ["current", "stale"]
  );
  // The old package bytes remain immutable and are never resurrected.
  const stale = store
    .state()
    .packages.find((entry) => entry.id === built.package.packageId);
  assert.equal(stale?.status, "stale");
  assert.equal(stale?.contentSha256, built.package.contentSha256);
  assert.equal(stale?.version, 1);
  await assert.rejects(
    service.buildPackage({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: updated.application.revision,
      operationId: "op-pkg-stale-revision",
      projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "revision_conflict"
  );
});

test("reference changes and access loss invalidate a current package", async () => {
  const { service, store } = harness();
  const created = await service.create(application({ operationId: "op-rp-0" }));
  const bound = await service.bindReference({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    expectedRevision: created.application.revision,
    kind: "fact",
    operationId: "op-rp-1",
    projectId,
    referenceId: factId,
  });
  const built = await service.buildPackage({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    expectedRevision: bound.application.revision,
    operationId: "op-rp-2",
    projectId,
  });
  assert.equal(built.package.version, 1);
  assert.equal(built.application.references[0]?.available, true);

  // The underlying fact moved to a new version: the package is stale on read.
  store.seedReferenceOwner({
    kind: "fact",
    ownerUserId: owner,
    projectId,
    referenceId: factId,
    sha256: "d".repeat(64),
    version: 2,
  });
  const staleDetail = await service.get({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    projectId,
  });
  assert.equal(staleDetail.references[0]?.changed, true);
  assert.equal(staleDetail.packageStale, true);
  assert.equal(staleDetail.currentPackage?.usable, false);
  assert.deepEqual(staleDetail.staleReasonCodes, [
    "material_inputs_changed",
    "reference_changed",
  ]);

  // Rebuilding captures the refreshed fingerprint and produces a new version.
  const rebuilt = await service.buildPackage({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    expectedRevision: staleDetail.revision,
    operationId: "op-rp-3",
    projectId,
  });
  assert.equal(rebuilt.package.version, 2);
  assert.equal(rebuilt.application.packageStale, false);
  assert.equal(rebuilt.application.references[0]?.changed, false);
  assert.equal(rebuilt.application.references[0]?.referenceVersion, 2);

  // Access loss blocks a new package and marks the current one stale.
  store.seedReferenceOwner({
    available: false,
    kind: "fact",
    ownerUserId: owner,
    projectId,
    referenceId: factId,
    sha256: "d".repeat(64),
    version: 2,
  });
  const lostAccess = await service.get({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    projectId,
  });
  assert.equal(lostAccess.references[0]?.available, false);
  assert.deepEqual(lostAccess.staleReasonCodes, ["reference_unavailable"]);
  await assert.rejects(
    service.buildPackage({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: lostAccess.revision,
      operationId: "op-rp-4",
      projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "reference_unavailable"
  );
  assert.equal(store.state().packages.length, 2);
});

test("the per-Project bound is enforced after idempotent replay", async () => {
  const { service } = harness();
  let lastOperationId = "op-limit-1";
  for (let index = 1; index <= 12; index += 1) {
    lastOperationId = `op-limit-${index}`;
    const created = await service.create(
      application({
        courseTitle: `Course ${index}`,
        operationId: lastOperationId,
      })
    );
    assert.ok(created.application.applicationId);
  }
  assert.equal(
    (await service.list({ actorUserId: owner, projectId })).length,
    12
  );

  await assert.rejects(
    service.create(
      application({ courseTitle: "Course 13", operationId: "op-limit-13" })
    ),
    (error: unknown) => (error as { code?: string }).code === "limit_exceeded"
  );
  // A retry of the last accepted creation still replays instead of failing on the
  // bound, because the operation is resolved before the bound is evaluated.
  const replay = await service.create(
    application({ courseTitle: "Course 12", operationId: lastOperationId })
  );
  assert.equal(replay.replayed, true);
  assert.equal(
    (await service.list({ actorUserId: owner, projectId })).length,
    12
  );
});

test("package builds serialize: one concurrent winner creates one version", async () => {
  const { service, store } = harness();
  const created = await service.create(application({ operationId: "op-cp-0" }));
  const [first, second] = await Promise.allSettled([
    service.buildPackage({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: 1,
      operationId: "op-cp-1",
      projectId,
    }),
    service.buildPackage({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: 1,
      operationId: "op-cp-2",
      projectId,
    }),
  ]);
  assert.equal(first.status, "fulfilled");
  assert.equal(second.status, "rejected");
  assert.equal(
    (second as PromiseRejectedResult).reason.code,
    "revision_conflict"
  );
  assert.equal(store.state().packages.length, 1);
  assert.equal(store.state().applications[0]?.revision, 2);
});

test("an exact package-build replay after the revision advanced returns the accepted package", async () => {
  const { service, store } = harness();
  const created = await service.create(
    application({ operationId: "op-idem-0" })
  );
  const firstBuild = {
    actorUserId: owner,
    applicationId: created.application.applicationId,
    expectedRevision: created.application.revision,
    operationId: "op-idem-package",
    projectId,
  };
  const first = await service.buildPackage(firstBuild);
  assert.equal(first.package.version, 1);
  assert.equal(first.replayed, false);

  // A later edit advances the revision *and* changes the material inputs. The
  // exact retry of the original request must still replay the original result:
  // request identity is the authored request, not recomputed derived state.
  const edited = await service.update({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    courseTitle: "Bachelor of Nursing (Honours)",
    expectedRevision: first.application.revision,
    institutionName: "Example University",
    operationId: "op-idem-edit",
    projectId,
  });
  assert.equal(edited.application.status, "stale");

  const replay = await service.buildPackage(firstBuild);
  assert.equal(replay.replayed, true);
  assert.equal(replay.package.packageId, first.package.packageId);
  assert.equal(replay.package.version, first.package.version);
  assert.equal(replay.package.contentSha256, first.package.contentSha256);
  assert.equal(
    replay.package.targetBindingSha256,
    first.package.targetBindingSha256
  );
  // No second package row was minted by the replay.
  assert.equal(store.state().packages.length, 1);
});

test("a changed package-build request conflicts instead of replaying", async () => {
  const { service } = harness();
  const created = await service.create(
    application({ operationId: "op-conf-0" })
  );
  await service.buildPackage({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    expectedRevision: created.application.revision,
    operationId: "op-conf-package",
    projectId,
  });
  // Same operationId, different authored CAS revision: a different logical
  // request, so it must be rejected rather than silently replaying.
  await assert.rejects(
    service.buildPackage({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: created.application.revision + 1,
      operationId: "op-conf-package",
      projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "idempotency_conflict"
  );
});

test("an exact update replay after the revision advanced replays the accepted write", async () => {
  const { service, store } = harness();
  const created = await service.create(
    application({ operationId: "op-ureplay-0" })
  );
  const edit = {
    actorUserId: owner,
    applicationId: created.application.applicationId,
    courseTitle: "Master of Nursing Practice",
    expectedRevision: created.application.revision,
    institutionName: "Example University",
    operationId: "op-ureplay-1",
    projectId,
  };
  const updated = await service.update(edit);
  assert.equal(updated.application.revision, 2);
  const replay = await service.update(edit);
  assert.equal(replay.replayed, true);
  assert.equal(replay.application.revision, updated.application.revision);
  assert.equal(store.state().applications[0]?.revision, 2);
  assert.equal(
    store.state().applications[0]?.courseTitle,
    "Master of Nursing Practice"
  );
});

test("an M2 access loss is visible identically in get, list and listPackages", async () => {
  const { service, store } = harness();
  const created = await service.create(
    application({ operationId: "op-loss-0" })
  );
  const bound = await service.bindReference({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    expectedRevision: created.application.revision,
    kind: "fact",
    operationId: "op-loss-1",
    projectId,
    referenceId: factId,
  });
  const built = await service.buildPackage({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    expectedRevision: bound.application.revision,
    operationId: "op-loss-2",
    projectId,
  });
  assert.equal(built.package.usable, true);

  const healthy = await service.listPackages({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    projectId,
  });
  assert.equal(healthy.currentPackage?.usable, true);
  assert.ok(healthy.currentSnapshot);
  assert.deepEqual(healthy.snapshotUnavailableReasonCodes, []);

  // External M2 revocation: the reference no longer resolves for this actor.
  store.seedReferenceOwner({
    available: false,
    kind: "fact",
    ownerUserId: owner,
    projectId,
    referenceId: factId,
    sha256: "a".repeat(64),
    version: 1,
  });

  const detail = await service.get({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    projectId,
  });
  const [listed] = await service.list({ actorUserId: owner, projectId });
  const packages = await service.listPackages({
    actorUserId: owner,
    applicationId: created.application.applicationId,
    projectId,
  });

  assert.equal(detail.currentPackage?.usable, false);
  assert.equal(listed?.currentPackage?.usable, false);
  assert.equal(packages.currentPackage?.usable, false);
  assert.deepEqual(
    listed?.staleReasonCodes,
    detail.staleReasonCodes,
    "list and detail must report the same reason codes"
  );
  assert.deepEqual(detail.staleReasonCodes, ["reference_unavailable"]);
  assert.equal(detail.packageStale, true);
  // The unusable snapshot is withheld from the API read.
  assert.equal(packages.currentSnapshot, null);
  assert.deepEqual(packages.snapshotUnavailableReasonCodes, [
    "reference_unavailable",
  ]);
  // The historical package row is still listed, with its immutable metadata.
  assert.equal(packages.packages.length, 1);
  assert.equal(packages.packages[0]?.version, 1);
  assert.equal(packages.packages[0]?.usable, false);
  assert.equal(packages.packages[0]?.integrityVerified, true);
});

test("the store refuses a write whose authorization was revoked mid-request", async () => {
  const { service, store } = harness();
  const created = await service.create(
    application({ actorUserId: member, operationId: "op-toctou-0" })
  );
  assert.equal(created.application.status, "draft");

  // A concurrent membership revocation commits after the service-level
  // authorization read and before the store revalidation.
  store.setWriteBarrier(() => {
    store.setMembership(projectId, member, "revoked");
  });
  await assert.rejects(
    service.update({
      actorUserId: member,
      applicationId: created.application.applicationId,
      courseTitle: "Course After Revocation",
      expectedRevision: created.application.revision,
      institutionName: "Example University",
      operationId: "op-toctou-1",
      projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "project_forbidden"
  );
  store.setWriteBarrier(null);

  // Nothing was committed: no revision advance, no material change, no operation.
  const [stored] = store.state().applications;
  assert.equal(stored?.revision, 1);
  assert.equal(stored?.courseTitle, "Bachelor of Nursing");
  assert.equal(store.state().operations.length, 1);
  assert.equal(store.state().events.length, 1);
});

test("the store refuses a write whose Project was closed mid-request", async () => {
  const { service, store } = harness();
  const created = await service.create(
    application({ operationId: "op-close-0" })
  );

  store.setWriteBarrier(() => {
    store.setProjectStatus(projectId, "closed");
  });
  await assert.rejects(
    service.archive({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: created.application.revision,
      operationId: "op-close-1",
      projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "project_closed"
  );
  store.setWriteBarrier(null);

  const [stored] = store.state().applications;
  assert.equal(stored?.status, "draft");
  assert.equal(stored?.revision, 1);
  assert.equal(store.state().operations.length, 1);
});

test("the store revalidates the customer role inside the write", async () => {
  const { service, store } = harness();
  const created = await service.create(
    application({ operationId: "op-role-0" })
  );
  // The account is reclassified as staff mid-request: private application writes
  // must fail even though the earlier read looked eligible.
  store.seedActor(owner, { registeredCustomer: false, staff: true });
  await assert.rejects(
    service.buildPackage({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: created.application.revision,
      operationId: "op-role-1",
      projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "actor_not_eligible"
  );
  assert.equal(store.state().packages.length, 0);

  test("an archived application never keeps an operationally usable package", async () => {
    const { service, store } = harness();
    const created = await service.create(
      application({ operationId: "op-arch-0" })
    );
    const bound = await service.bindReference({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: created.application.revision,
      kind: "fact",
      operationId: "op-arch-1",
      projectId,
      referenceId: factId,
    });
    const built = await service.buildPackage({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: bound.application.revision,
      operationId: "op-arch-2",
      projectId,
    });
    assert.equal(built.package.usable, true);
    assert.equal(built.application.packageStale, false);

    const archived = await service.archive({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: built.application.revision,
      operationId: "op-arch-3",
      projectId,
    });
    assert.equal(archived.application.status, "archived");

    // Every read path agrees that the package is no longer usable, while the
    // historical package row and its immutable metadata remain intact.
    const detail = await service.get({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      projectId,
    });
    const [listed] = await service.list({ actorUserId: owner, projectId });
    const packages = await service.listPackages({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      projectId,
    });

    for (const view of [detail, listed]) {
      assert.equal(view?.status, "archived");
      assert.equal(view?.currentPackage?.usable, false);
      assert.equal(view?.packageStale, true);
      assert.deepEqual(view?.staleReasonCodes, ["application_archived"]);
    }
    assert.equal(packages.currentPackage?.usable, false);
    assert.equal(packages.currentSnapshot, null);
    assert.deepEqual(packages.snapshotUnavailableReasonCodes, [
      "application_archived",
    ]);
    assert.equal(packages.packages.length, 1);
    assert.equal(packages.packages[0]?.packageId, built.package.packageId);
    assert.equal(
      packages.packages[0]?.contentSha256,
      built.package.contentSha256
    );
    assert.equal(packages.packages[0]?.usable, false);

    // A rebuild cannot resurrect preparation work for an archived application.
    await assert.rejects(
      service.buildPackage({
        actorUserId: owner,
        applicationId: created.application.applicationId,
        expectedRevision: archived.application.revision,
        operationId: "op-arch-4",
        projectId,
      }),
      (error: unknown) => (error as { code?: string }).code === "state_conflict"
    );
    assert.equal(store.state().packages.length, 1);
  });

  test("an exact archive replay returns the recorded result without new events", async () => {
    const { service, store } = harness();
    const created = await service.create(
      application({ operationId: "op-arep-0" })
    );
    const archive = {
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: created.application.revision,
      operationId: "op-arep-1",
      projectId,
    };
    const first = await service.archive(archive);
    assert.equal(first.replayed, false);
    assert.equal(first.application.status, "archived");
    const operationsAfterFirst = store.state().operations.length;
    const eventsAfterFirst = store.state().events.length;
    const revisionAfterFirst = first.application.revision;
    const archivedAt = first.application.archivedAt;

    // The archived application is terminal, yet an exact retry must replay rather
    // than fail: the recorded operation is resolved before the terminal check.
    const replay = await service.archive(archive);
    assert.equal(replay.replayed, true);
    assert.equal(replay.application.status, "archived");
    assert.equal(replay.application.revision, revisionAfterFirst);
    assert.equal(replay.application.archivedAt, archivedAt);
    assert.equal(store.state().operations.length, operationsAfterFirst);
    assert.equal(store.state().events.length, eventsAfterFirst);

    // A different request under the same operationId is still a conflict.
    await assert.rejects(
      service.archive({ ...archive, expectedRevision: revisionAfterFirst }),
      (error: unknown) =>
        (error as { code?: string }).code === "idempotency_conflict"
    );
    assert.equal(store.state().operations.length, operationsAfterFirst);
  });

  test("an exact reference-revocation replay returns the recorded result", async () => {
    const { service, store } = harness();
    const created = await service.create(
      application({ operationId: "op-rrep-0" })
    );
    const bound = await service.bindReference({
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: created.application.revision,
      kind: "fact",
      operationId: "op-rrep-1",
      projectId,
      referenceId: factId,
    });
    const referenceRecordId =
      bound.application.references[0]?.referenceRecordId;
    assert.ok(referenceRecordId);
    const revoke = {
      actorUserId: owner,
      applicationId: created.application.applicationId,
      expectedRevision: bound.application.revision,
      operationId: "op-rrep-2",
      projectId,
      referenceRecordId: referenceRecordId as string,
    };
    const first = await service.revokeReference(revoke);
    assert.equal(first.replayed, false);
    const revokedAt = first.application.references[0]?.revokedAt;
    assert.ok(revokedAt);
    const eventsAfterFirst = store.state().events.length;
    const operationsAfterFirst = store.state().operations.length;
    const revisionAfterFirst = first.application.revision;

    // The reference is now revoked (revocation is final), so the "still active"
    // precondition can no longer hold. The exact retry must still replay.
    const replay = await service.revokeReference(revoke);
    assert.equal(replay.replayed, true);
    assert.equal(replay.application.revision, revisionAfterFirst);
    assert.equal(replay.application.references[0]?.revokedAt, revokedAt);
    assert.equal(store.state().events.length, eventsAfterFirst);
    assert.equal(store.state().operations.length, operationsAfterFirst);

    // Reusing the same operationId for a different reference is a conflict.
    const otherReference = await store.listReferences({
      applicationId: created.application.applicationId,
    });
    assert.equal(otherReference.length, 1);
    await assert.rejects(
      service.revokeReference({
        ...revoke,
        expectedRevision: revisionAfterFirst,
        referenceRecordId: "99999999-9999-4999-8999-999999999999",
      }),
      (error: unknown) =>
        (error as { code?: string }).code === "idempotency_conflict"
    );
  });

  test("idempotent replay cannot bypass a revoked membership or foreign ownership", async () => {
    const { service, store } = harness();
    const created = await service.create(
      application({ actorUserId: member, operationId: "op-bypass-0" })
    );
    const archive = {
      actorUserId: member,
      applicationId: created.application.applicationId,
      expectedRevision: created.application.revision,
      operationId: "op-bypass-1",
      projectId,
    };
    await service.archive(archive);

    // Membership revoked after the successful archive: the retry fails closed even
    // though the operation itself was recorded.
    store.setMembership(projectId, member, "revoked");
    await assert.rejects(
      service.archive(archive),
      (error: unknown) =>
        (error as { code?: string }).code === "project_forbidden"
    );

    // A Project owner can never replay another member's operation either: their
    // applications are not visible, so this is existence-hiding.
    await assert.rejects(
      service.archive({ ...archive, actorUserId: owner }),
      (error: unknown) =>
        (error as { code?: string }).code === "application_not_found"
    );
  });
});
