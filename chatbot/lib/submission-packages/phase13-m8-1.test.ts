/**
 * Phase 13 M8.1 - offline acceptance suite (no database, no network, no provider).
 *
 * Four coherent scenario groups plus API validation and migration integrity. Every
 * scenario runs the REAL service and the REAL HTTP handlers; only persistence and the
 * two upstream reads are in-memory, and that store reproduces the database-owned
 * invariants (unique operation, unique version, unique confirmation, insert-once
 * invalidation, append-only history).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
  SubmissionPackageError,
} from "./contracts";
import { createSubmissionPackageHandlers } from "./http";
import {
  createInMemorySubmissionPackageStore,
  createSubmissionTestWorld,
  type SubmissionTestHooks,
  type SubmissionTestWorld,
} from "./in-memory-store";
import type {
  SubmissionDependencies,
  SubmissionIndicator,
  SubmissionTargetState,
} from "./ports";
import { createSubmissionPackageService } from "./service";

const OWNER = "11111111-1111-4111-8111-111111111801";
const MEMBER = "11111111-1111-4111-8111-111111111802";
const REVOKED = "11111111-1111-4111-8111-111111111803";
const STRANGER = "11111111-1111-4111-8111-111111111804";
const STAFF = "11111111-1111-4111-8111-111111111805";
const PROJ_A = "22222222-2222-4222-8222-222222222801";
const PROJ_B = "22222222-2222-4222-8222-222222222802";
const SCHOOL_1 = "33333333-3333-4333-8333-333333333801";
const SCHOOL_2 = "33333333-3333-4333-8333-333333333802";
const SCHOOL_3 = "33333333-3333-4333-8333-333333333803";
const STUDENT = "44444444-4444-4444-8444-444444444801";
const FACT_1 = "55555555-5555-4555-8555-555555555801";
const FACT_2 = "55555555-5555-4555-8555-555555555802";
const DRAFT_1 = "66666666-6666-4666-8666-666666666801";
const DRAFT_2 = "66666666-6666-4666-8666-666666666802";

function world(): SubmissionTestWorld {
  const world = createSubmissionTestWorld();
  world.accounts.set(OWNER, { registeredCustomer: true, staff: false });
  world.accounts.set(MEMBER, { registeredCustomer: true, staff: false });
  world.accounts.set(REVOKED, { registeredCustomer: true, staff: false });
  world.accounts.set(STRANGER, { registeredCustomer: true, staff: false });
  world.accounts.set(STAFF, { registeredCustomer: false, staff: true });
  world.projects.set(PROJ_A, {
    members: new Map([
      [MEMBER, "active"],
      [REVOKED, "revoked"],
    ]),
    ownerUserId: OWNER,
    status: "active",
  });
  world.projects.set(PROJ_B, {
    members: new Map(),
    ownerUserId: STRANGER,
    status: "active",
  });
  return world;
}

function schoolState(input: {
  readonly targetId: string;
  readonly revision?: number;
  readonly packageVersion?: number | null;
  readonly status?: string;
  readonly usable?: boolean;
  readonly reviewAvailable?: boolean;
}): SubmissionTargetState {
  const revision = input.revision ?? 1;
  const packageVersion =
    input.packageVersion === undefined ? 1 : input.packageVersion;
  const dependencies: SubmissionDependencies = {
    applicationRevision: revision,
    applicationStatus: input.status ?? "package_prepared",
    factReferences: [],
    gsDraft: null,
    legalSourceRevision: null,
    preparationSnapshot: null,
    schoolPackage:
      packageVersion === null
        ? null
        : {
            contentSha256: `${packageVersion}`.padStart(64, "a"),
            packageId: `70000000-0000-4000-8000-00000000000${packageVersion}`,
            targetBindingSha256: `${packageVersion}`.padStart(64, "b"),
            usable: input.usable ?? true,
            version: packageVersion,
          },
    sourceAvailability:
      packageVersion === null
        ? "unavailable"
        : (input.usable ?? true)
          ? "available"
          : "partially_unavailable",
  };
  const indicators: SubmissionIndicator[] = [
    { code: "human_review_required", kind: "unverified" },
    { code: "documents_trust_unavailable", kind: "unknown" },
  ];
  return {
    archived: (input.status ?? "package_prepared") === "archived",
    content: {
      applicationRevision: revision,
      applicationStatus: input.status ?? "package_prepared",
      school: {
        catalogRecordClass: "declared_official",
        courseTitle: `Course ${input.targetId.slice(-1)}`,
        institutionName: `Institution ${input.targetId.slice(-1)}`,
        intakeLabel: "2027 S1",
        referenceCount: 0,
        sourceStatus: "declared_pending_verification",
      },
      student500: null,
      targetLabel: "school_application",
      title: `Institution ${input.targetId.slice(-1)}`,
    },
    dependencies,
    indicators,
    review:
      (input.reviewAvailable ?? true) && packageVersion !== null
        ? {
            gsDraft: null,
            sections: [
              {
                heading: "Institution and course",
                key: "institution",
                lines: [
                  {
                    label: "Institution",
                    value: `Institution ${input.targetId.slice(-1)}`,
                  },
                  {
                    label: "Course",
                    value: `Course ${input.targetId.slice(-1)} v${packageVersion}`,
                  },
                ],
              },
            ],
            source: "pinned_school_package_version",
            title: `Institution ${input.targetId.slice(-1)}`,
          }
        : null,
    reviewUnavailableReason:
      (input.reviewAvailable ?? true) && packageVersion !== null
        ? null
        : "school_package_changed",
    targetId: input.targetId,
    targetKind: "managed_school_application",
    targetVersion: revision,
  };
}

function studentState(input: {
  readonly revision?: number;
  readonly draft?: {
    readonly id: string;
    readonly version: number;
    readonly hash: string;
  } | null;
  readonly facts?: readonly { readonly id: string; readonly key: string }[];
  readonly status?: string;
  readonly redactedSections?: number;
  readonly legalRevision?: string;
  readonly reviewAvailable?: boolean;
}): SubmissionTargetState {
  const revision = input.revision ?? 3;
  const facts = input.facts ?? [
    { id: FACT_1, key: "study.course_name" },
    { id: FACT_2, key: "fees.budget" },
  ];
  const draft =
    input.draft === undefined
      ? { hash: "c".repeat(64), id: DRAFT_1, version: 1 }
      : input.draft;
  const dependencies: SubmissionDependencies = {
    applicationRevision: revision,
    applicationStatus: input.status ?? "in_progress",
    factReferences: facts.map((fact) => ({
      factAssertionId: fact.id,
      factKey: fact.key,
      factReferenceId: fact.id,
      factVersion: 1,
    })),
    gsDraft: draft
      ? {
          contentSha256: draft.hash,
          draftId: draft.id,
          missingInformation: [],
          redactedSectionCount: input.redactedSections ?? 0,
          sectionHeadings: ["Future plans and expected value"],
          sectionKeys: ["future_plans"],
          version: draft.version,
        }
      : null,
    legalSourceRevision: input.legalRevision ?? "declared-2026-10",
    preparationSnapshot: null,
    schoolPackage: null,
    sourceAvailability: "available",
  };
  return {
    archived: (input.status ?? "in_progress") === "archived",
    content: {
      applicationRevision: revision,
      applicationStatus: input.status ?? "in_progress",
      school: null,
      student500: {
        applicationPlace: "offshore",
        coeStatus: "reported_not_held",
        coverage: {
          conflicted: 0,
          covered: 2,
          humanReviewRequired: 12,
          missing: 6,
        },
        entryRoute: "offer_only",
        factReferenceCount: facts.length,
        gsDraft: dependencies.gsDraft,
        preparationSnapshot: null,
      },
      targetLabel: "student_500_application",
      title: "Student 500 application",
    },
    dependencies,
    indicators: [
      { code: "human_review_required", kind: "unverified" },
      { code: "missing_evidence", kind: "missing" },
    ],
    review:
      (input.reviewAvailable ?? true)
        ? {
            gsDraft: draft
              ? {
                  contentSha256: draft.hash,
                  draftId: draft.id,
                  sections: [
                    {
                      heading: "Future plans and expected value",
                      missingInformation: [],
                      sectionKey: "future_plans",
                      text: `Exact draft text for version ${draft.version}`,
                    },
                  ],
                  version: draft.version,
                }
              : null,
            sections: [
              {
                heading: "Application",
                key: "application",
                lines: [
                  { label: "Application place", value: "offshore" },
                  { label: "Entry route", value: "offer_only" },
                ],
              },
            ],
            source: "pinned_gs_draft_version",
            title: "Student 500 application",
          }
        : null,
    reviewUnavailableReason:
      (input.reviewAvailable ?? true) ? null : "gs_draft_unavailable",
    targetId: STUDENT,
    targetKind: "student_500_visa_application",
    targetVersion: revision,
  };
}

function buildHarness(input?: {
  readonly enabled?: boolean;
  readonly schema?: boolean;
  readonly hooks?: SubmissionTestHooks;
}) {
  const worldState = world();
  const store = createInMemorySubmissionPackageStore(worldState, input?.hooks);
  const targets = new Map<
    string,
    { readonly projectId: string; readonly target: SubmissionTargetState }
  >();
  const key = (kind: string, id: string) => `${kind}:${id}`;
  // The real M5.1/M6.2 readers resolve a target *within the requesting Project*, so
  // the fixture does the same: a foreign Project can never read this target.
  const readTarget = (args: {
    readonly projectId: string;
    readonly targetKind: string;
    readonly targetId: string;
  }) => {
    const entry = targets.get(key(args.targetKind, args.targetId));
    if (!entry || entry.projectId !== args.projectId) {
      throw new SubmissionPackageError("target_not_found");
    }
    return entry.target;
  };
  const service = createSubmissionPackageService({
    readTarget: readTarget as never,
    store,
  });
  const setTarget = (target: SubmissionTargetState, projectId = PROJ_A) => {
    targets.set(key(target.targetKind, target.targetId), { projectId, target });
  };
  const handlers = createSubmissionPackageHandlers({
    authenticate: async () => ({ type: "regular", userId: OWNER }),
    enabled: () => input?.enabled ?? true,
    schemaAvailable: async () => input?.schema ?? true,
    service,
  });
  return { handlers, service, setTarget, store, targets, world: worldState };
}

function scope(
  actorUserId: string,
  targetKind: "managed_school_application" | "student_500_visa_application",
  targetId: string
) {
  return { actorUserId, projectId: PROJ_A, targetId, targetKind } as const;
}

/** The consent binding a real client would send for this exact version. */
function bindingFor(
  scope: {
    readonly projectId: string;
    readonly targetId: string;
    readonly targetKind: string;
  },
  view: { readonly packageVersionId: string; readonly manifestSha256: string }
) {
  return {
    manifestSha256: view.manifestSha256,
    packageVersionId: view.packageVersionId,
    projectId: scope.projectId,
    statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
    targetId: scope.targetId,
    targetKind: scope.targetKind,
  };
}

// ---------------------------------------------------------------- Scenario A

test("A: three independent school packages keep independent freshness", async () => {
  const harness = buildHarness();
  harness.setTarget(schoolState({ targetId: SCHOOL_1 }));
  harness.setTarget(schoolState({ targetId: SCHOOL_2 }));
  harness.setTarget(schoolState({ targetId: SCHOOL_3 }));

  const ids: string[] = [];
  for (const [index, targetId] of [SCHOOL_1, SCHOOL_2, SCHOOL_3].entries()) {
    const target = scope(OWNER, "managed_school_application", targetId);
    const built = await harness.service.buildPackage({
      operationId: `m8-a-build-${index}`,
      scope: target,
    });
    assert.equal(built.package.version, 1);
    assert.equal(built.package.targetId, targetId);
    const confirmed = await harness.service.confirmPackage({
      consentBinding: bindingFor(target, built.package),
      confirmationType: "package_content_review",
      consentGranted: true,
      manifestSha256: built.package.manifestSha256,
      operationId: `m8-a-confirm-${index}`,
      packageVersionId: built.package.packageVersionId,
      scope: target,
      statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
      targetVersion: built.package.targetVersion,
    });
    assert.equal(confirmed.confirmation.current, true);
    ids.push(built.package.packageVersionId);
  }
  assert.equal(new Set(ids).size, 3, "three distinct package versions");

  const before = await harness.service.get(
    scope(OWNER, "managed_school_application", SCHOOL_1)
  );
  const frozenHash = before.packages[0]?.manifestSha256;
  assert.ok(frozenHash);

  // Only school 1 changes materially.
  harness.setTarget(
    schoolState({ packageVersion: 2, revision: 4, targetId: SCHOOL_1 })
  );

  const school1 = await harness.service.get(
    scope(OWNER, "managed_school_application", SCHOOL_1)
  );
  const school2 = await harness.service.get(
    scope(OWNER, "managed_school_application", SCHOOL_2)
  );
  const school3 = await harness.service.get(
    scope(OWNER, "managed_school_application", SCHOOL_3)
  );

  assert.equal(
    school1.currentPackage,
    null,
    "changed school package is not current"
  );
  assert.ok(
    school1.packages[0]?.freshness.reasonCodes.includes(
      "school_package_changed"
    )
  );
  assert.ok(
    school1.packages[0]?.freshness.reasonCodes.includes(
      "application_revision_changed"
    )
  );
  assert.equal(
    school1.packages[0]?.manifestSha256,
    frozenHash,
    "history is unchanged"
  );
  assert.equal(
    school2.currentPackage?.targetId,
    SCHOOL_2,
    "school 2 stays current"
  );
  assert.equal(
    school3.currentPackage?.targetId,
    SCHOOL_3,
    "school 3 stays current"
  );
  assert.equal(
    school2.packages[0]?.manifestSha256 === frozenHash,
    false,
    "no hash cross-contamination"
  );
  assert.equal(school1.confirmations[0]?.current, false);
  assert.equal(school2.confirmations[0]?.current, true);
  assert.equal(school3.confirmations[0]?.current, true);

  // A rebuild is a new immutable version, not an overwrite.
  const rebuilt = await harness.service.buildPackage({
    expectedVersion: 4,
    operationId: "m8-a-rebuild-1",
    scope: scope(OWNER, "managed_school_application", SCHOOL_1),
  });
  assert.equal(rebuilt.package.version, 2);
  const after = await harness.service.get(
    scope(OWNER, "managed_school_application", SCHOOL_1)
  );
  assert.equal(after.packages.length, 2);
  assert.equal(
    after.packages[1]?.manifestSha256,
    frozenHash,
    "v1 is untouched"
  );
  assert.equal(after.currentPackage?.version, 2);
  assert.equal(after.packages[1]?.freshness.current, false);
});

// ---------------------------------------------------------------- Scenario B

test("B: a Student 500 package binds one exact GS draft and never approves", async () => {
  const harness = buildHarness();
  harness.setTarget(studentState({}));
  const target = scope(OWNER, "student_500_visa_application", STUDENT);

  const v1 = await harness.service.buildPackage({
    operationId: "m8-b-build-1",
    scope: target,
  });
  assert.equal(v1.package.targetVersion, 3);
  const manifest = v1.package.manifest as {
    honesty: Record<string, string>;
    content: { student500: { gsDraft: { draftId: string; version: number } } };
  };
  assert.equal(manifest.honesty.submissionStatus, "not_submission_ready");
  assert.equal(manifest.honesty.professionalReviewStatus, "not_requested");
  assert.equal(manifest.honesty.legalCoverage, "partial_unverified");
  assert.equal(manifest.content.student500.gsDraft.draftId, DRAFT_1);
  assert.equal(manifest.content.student500.gsDraft.version, 1);

  const confirmed = await harness.service.confirmPackage({
    consentBinding: bindingFor(target, v1.package),
    confirmationType: "customer_declarations",
    consentGranted: true,
    manifestSha256: v1.package.manifestSha256,
    operationId: "m8-b-confirm-1",
    packageVersionId: v1.package.packageVersionId,
    scope: target,
    statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
    targetVersion: v1.package.targetVersion,
  });
  assert.equal(confirmed.confirmation.current, true);

  // A new accepted GS draft arrives through the M6/M7 workflow.
  harness.setTarget(
    studentState({
      draft: { hash: "d".repeat(64), id: DRAFT_2, version: 2 },
      revision: 4,
    })
  );
  const after = await harness.service.get(target);
  assert.equal(after.currentPackage, null);
  assert.ok(
    after.packages[0]?.freshness.reasonCodes.includes("gs_draft_changed")
  );
  assert.equal(after.packages[0]?.manifestSha256, v1.package.manifestSha256);
  assert.equal(after.confirmations[0]?.current, false);
  assert.ok(
    after.confirmations[0]?.invalidatedReasonCodes.includes("gs_draft_changed")
  );

  // The old version can never be confirmed again for the changed content.
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        consentBinding: bindingFor(target, v1.package),
        confirmationType: "package_content_review",
        consentGranted: true,
        manifestSha256: v1.package.manifestSha256,
        operationId: "m8-b-confirm-stale",
        packageVersionId: v1.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: v1.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError && error.code === "state_conflict"
  );

  const v2 = await harness.service.buildPackage({
    operationId: "m8-b-build-2",
    scope: target,
  });
  assert.equal(v2.package.version, 2);
  assert.notEqual(v2.package.manifestSha256, v1.package.manifestSha256);
  const confirmedV2 = await harness.service.confirmPackage({
    consentBinding: bindingFor(target, v2.package),
    confirmationType: "package_content_review",
    consentGranted: true,
    manifestSha256: v2.package.manifestSha256,
    operationId: "m8-b-confirm-2",
    packageVersionId: v2.package.packageVersionId,
    scope: target,
    statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
    targetVersion: v2.package.targetVersion,
  });
  assert.equal(confirmedV2.confirmation.packageVersion, 2);
  assert.equal(confirmedV2.confirmation.current, true);
  const final = await harness.service.get(target);
  assert.equal(
    final.confirmations.length,
    2,
    "history keeps both confirmations"
  );
  assert.equal(final.currentPackage?.version, 2);
});

// ---------------------------------------------------------------- Scenario C

test("C: membership, foreign Project and staff access all fail closed", async () => {
  const harness = buildHarness();
  harness.setTarget(studentState({}));
  const target = scope(OWNER, "student_500_visa_application", STUDENT);
  await harness.service.buildPackage({
    operationId: "m8-c-build",
    scope: target,
  });

  // An active member may read and build within the same Project.
  const memberView = await harness.service.get({
    ...target,
    actorUserId: MEMBER,
  });
  assert.equal(memberView.packages.length, 1);

  // A revoked member, a foreign owner and a staff account are all refused.
  for (const actorUserId of [REVOKED, STAFF]) {
    await assert.rejects(
      () => harness.service.get({ ...target, actorUserId }),
      (error: unknown) =>
        error instanceof SubmissionPackageError &&
        (error.code === "project_forbidden" ||
          error.code === "actor_not_eligible")
    );
  }
  await assert.rejects(
    () =>
      harness.service.get({
        ...target,
        actorUserId: STRANGER,
        projectId: PROJ_A,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      (error.code === "project_forbidden" || error.code === "project_not_found")
  );
  // The stranger's own Project cannot see Project A's package either.
  await assert.rejects(
    () =>
      harness.service.get({
        ...target,
        actorUserId: STRANGER,
        projectId: PROJ_B,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      (error.code === "target_not_found" || error.code === "project_forbidden")
  );

  // A closed Project keeps authorized history readable but refuses new writes.
  const projectA = harness.world.projects.get(PROJ_A);
  assert.ok(projectA);
  projectA.status = "closed";
  const closedView = await harness.service.get(target);
  assert.equal(closedView.packages.length, 1);
  assert.ok(
    closedView.packages[0]?.freshness.reasonCodes.includes("project_closed")
  );
  assert.equal(closedView.currentPackage, null);
  await assert.rejects(
    () =>
      harness.service.buildPackage({
        operationId: "m8-c-closed-build",
        scope: target,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError && error.code === "project_closed"
  );
  projectA.status = "active";
});

test("C: a revoked fact sharing hides content without rewriting history", async () => {
  const harness = buildHarness();
  harness.setTarget(studentState({}));
  const target = scope(OWNER, "student_500_visa_application", STUDENT);
  const built = await harness.service.buildPackage({
    operationId: "m8-c-revoke-build",
    scope: target,
  });
  const before = built.package.manifest as {
    dependencies: {
      factReferences: { factKey: string; factReferenceId: string }[];
    };
  };
  assert.equal(before.dependencies.factReferences.length, 2);
  assert.ok(
    before.dependencies.factReferences.every((fact) => fact.factKey.length > 0)
  );

  // FACT_2 is no longer visible to the customer (sharing revoked upstream).
  harness.setTarget(
    studentState({ facts: [{ id: FACT_1, key: "study.course_name" }] })
  );
  const after = await harness.service.get(target);
  const view = after.packages[0];
  assert.ok(view);
  assert.ok(view.freshness.reasonCodes.includes("fact_not_visible"));
  assert.equal(view.redactedFactReferenceCount, 1);
  assert.equal(
    view.manifestSha256,
    built.package.manifestSha256,
    "hash is history"
  );
  const projected = view.manifest as {
    dependencies: {
      factReferences: { factKey: string; factReferenceId: string }[];
    };
  };
  const hidden = projected.dependencies.factReferences.find(
    (fact) => fact.factReferenceId === FACT_2
  );
  assert.equal(hidden?.factKey, "", "revoked content is suppressed");
  assert.equal(
    projected.dependencies.factReferences.find(
      (fact) => fact.factReferenceId === FACT_1
    )?.factKey,
    "study.course_name",
    "still-authorized content stays visible"
  );
  // Confirmations cannot be recorded against content the actor can no longer see.
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        consentBinding: bindingFor(target, built.package),
        confirmationType: "package_content_review",
        consentGranted: true,
        manifestSha256: built.package.manifestSha256,
        operationId: "m8-c-revoke-confirm",
        packageVersionId: built.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: built.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError && error.code === "state_conflict"
  );
});

// ---------------------------------------------------------------- Scenario D

test("D: replay, changed payload and stale expected version are deterministic", async () => {
  const harness = buildHarness();
  harness.setTarget(schoolState({ targetId: SCHOOL_1 }));
  const target = scope(OWNER, "managed_school_application", SCHOOL_1);

  const first = await harness.service.buildPackage({
    operationId: "m8-d-build",
    scope: target,
  });
  const replay = await harness.service.buildPackage({
    operationId: "m8-d-build",
    scope: target,
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.package.packageVersionId, first.package.packageVersionId);
  assert.equal((await harness.service.get(target)).packages.length, 1);

  // Same operation id, different semantic request.
  await assert.rejects(
    () =>
      harness.service.buildPackage({
        expectedVersion: 1,
        operationId: "m8-d-build",
        scope: target,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      error.code === "idempotency_conflict"
  );
  // Stale expected revision fails closed.
  await assert.rejects(
    () =>
      harness.service.buildPackage({
        expectedVersion: 99,
        operationId: "m8-d-stale",
        scope: target,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      error.code === "revision_conflict"
  );
});

test("D: concurrent builds and confirmation races stay consistent", async () => {
  const harness = buildHarness();
  harness.setTarget(studentState({}));
  const target = scope(OWNER, "student_500_visa_application", STUDENT);

  const [left, right] = await Promise.all([
    harness.service.buildPackage({ operationId: "m8-d-par-1", scope: target }),
    harness.service.buildPackage({ operationId: "m8-d-par-2", scope: target }),
  ]);
  assert.notEqual(
    left.package.packageVersionId,
    right.package.packageVersionId
  );
  assert.deepEqual(
    [left.package.version, right.package.version].sort((a, b) => a - b),
    [1, 2],
    "both builds allocate distinct versions"
  );
  const stored = await harness.service.get(target);
  assert.equal(stored.packages.length, 2);

  // The same confirmation intent twice: exactly one record, the retry replays.
  const newest = stored.packages[0];
  assert.ok(newest);
  const params = {
    confirmationType: "package_content_review" as const,
    consentBinding: bindingFor(target, newest),
    consentGranted: true as const,
    manifestSha256: newest.manifestSha256,
    packageVersionId: newest.packageVersionId,
    scope: target,
    statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
    targetVersion: newest.targetVersion,
  };
  const results = await Promise.allSettled([
    harness.service.confirmPackage({
      ...params,
      operationId: "m8-d-confirm-a",
    }),
    harness.service.confirmPackage({
      ...params,
      operationId: "m8-d-confirm-b",
    }),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  assert.equal(fulfilled.length, 1, "exactly one confirmation wins the race");
  const after = await harness.service.get(target);
  assert.equal(
    after.confirmations.filter(
      (confirmation) =>
        confirmation.confirmationType === "package_content_review"
    ).length,
    1,
    "no duplicate confirmation rows"
  );

  // An identical retry of the winner replays instead of failing.
  const winningOperation =
    results[0].status === "fulfilled" ? "m8-d-confirm-a" : "m8-d-confirm-b";
  const replay = await harness.service.confirmPackage({
    ...params,
    operationId: winningOperation,
  });
  assert.equal(replay.replayed, true);
});

test("D: a forged digest, wrong version or missing consent cannot confirm", async () => {
  const harness = buildHarness();
  harness.setTarget(schoolState({ targetId: SCHOOL_2 }));
  const target = scope(OWNER, "managed_school_application", SCHOOL_2);
  const built = await harness.service.buildPackage({
    operationId: "m8-d-forge-build",
    scope: target,
  });
  const base = {
    confirmationType: "package_content_review" as const,
    consentBinding: bindingFor(target, built.package),
    manifestSha256: built.package.manifestSha256,
    packageVersionId: built.package.packageVersionId,
    scope: target,
    statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
    targetVersion: built.package.targetVersion,
  };
  // A digest that disagrees with the consent binding is refused as missing consent:
  // the customer did not consent to this content.
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        ...base,
        consentGranted: true,
        manifestSha256: "f".repeat(64),
        operationId: "m8-d-forge-digest",
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      error.code === "consent_required"
  );
  // A consistently forged digest and binding pair is refused against stored data.
  const forged = "f".repeat(64);
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        ...base,
        consentBinding: { ...base.consentBinding, manifestSha256: forged },
        consentGranted: true,
        manifestSha256: forged,
        operationId: "m8-d-forge-digest-consistent",
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      error.code === "integrity_conflict"
  );
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        ...base,
        consentGranted: true,
        operationId: "m8-d-forge-version",
        targetVersion: built.package.targetVersion + 5,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      error.code === "revision_conflict"
  );
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        ...base,
        consentGranted: false as never,
        operationId: "m8-d-no-consent",
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      error.code === "consent_required"
  );
  const stored = await harness.service.get(target);
  assert.equal(stored.confirmations.length, 0, "nothing partial was persisted");
});

// ------------------------------------------------------------- API validation

function request(body: unknown, url = "http://localhost/api/x"): Request {
  return new Request(url, {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

const buildPayload = {
  action: "build_package",
  operationId: "m8-api-build",
  targetId: SCHOOL_3,
  targetKind: "managed_school_application",
} as const;

test("API: authentication, capability, schema and payload validation", async () => {
  const harness = buildHarness();
  harness.setTarget(schoolState({ targetId: SCHOOL_3 }));

  // Unauthenticated and guest sessions never reach the service.
  const unauthenticated = createSubmissionPackageHandlers({
    authenticate: async () => null,
    enabled: () => true,
    schemaAvailable: async () => true,
    service: harness.service,
  });
  const unauthorized = await unauthenticated.act(request(buildPayload), PROJ_A);
  assert.equal(unauthorized.status, 401);
  const guest = createSubmissionPackageHandlers({
    authenticate: async () => ({ type: "guest", userId: OWNER }),
    enabled: () => true,
    schemaAvailable: async () => true,
    service: harness.service,
  });
  assert.equal((await guest.act(request(buildPayload), PROJ_A)).status, 404);

  // Default-OFF capability and an unapplied migration both report unavailable.
  const disabled = createSubmissionPackageHandlers({
    authenticate: async () => ({ type: "regular", userId: OWNER }),
    enabled: () => false,
    schemaAvailable: async () => true,
    service: harness.service,
  });
  assert.equal((await disabled.act(request(buildPayload), PROJ_A)).status, 404);
  const notMigrated = createSubmissionPackageHandlers({
    authenticate: async () => ({ type: "regular", userId: OWNER }),
    enabled: () => true,
    schemaAvailable: async () => false,
    service: harness.service,
  });
  assert.equal(
    (await notMigrated.act(request(buildPayload), PROJ_A)).status,
    503
  );

  // Strict payloads: unknown fields, a browser-supplied digest and a changed action
  // shape are all refused before any work happens.
  for (const body of [
    { ...buildPayload, projectId: PROJ_B },
    { ...buildPayload, manifestSha256: "a".repeat(64) },
    { ...buildPayload, targetKind: "school_application" },
    { action: "confirm_package" },
    "not-json",
  ]) {
    const response = await harness.handlers.act(request(body), PROJ_A);
    assert.equal(response.status, 400, JSON.stringify(body));
  }

  // GET requires an explicit, valid target selection.
  const badGet = await harness.handlers.get(
    new Request("http://localhost/api/x"),
    PROJ_A
  );
  assert.equal(badGet.status, 400);
});

test("API: build then confirm through the real handlers", async () => {
  const harness = buildHarness();
  harness.setTarget(schoolState({ targetId: SCHOOL_3 }));

  const built = await harness.handlers.act(request(buildPayload), PROJ_A);
  assert.equal(built.status, 201);
  const builtBody = (await built.json()) as {
    package: {
      manifestSha256: string;
      packageVersionId: string;
      targetVersion: number;
    };
  };

  const confirmed = await harness.handlers.act(
    request({
      action: "confirm_package",
      confirmationType: "customer_declarations",
      consentBinding: {
        manifestSha256: builtBody.package.manifestSha256,
        packageVersionId: builtBody.package.packageVersionId,
        projectId: PROJ_A,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetId: SCHOOL_3,
        targetKind: "managed_school_application",
      },
      consentGranted: true,
      manifestSha256: builtBody.package.manifestSha256,
      operationId: "m8-api-confirm",
      packageVersionId: builtBody.package.packageVersionId,
      statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
      targetId: SCHOOL_3,
      targetKind: "managed_school_application",
      targetVersion: builtBody.package.targetVersion,
    }),
    PROJ_A
  );
  assert.equal(confirmed.status, 201);

  const view = await harness.handlers.get(
    new Request(
      `http://localhost/api/x?targetKind=managed_school_application&targetId=${SCHOOL_3}`
    ),
    PROJ_A
  );
  assert.equal(view.status, 200);
  const body = (await view.json()) as {
    currentPackage: { version: number } | null;
    confirmations: { confirmationType: string }[];
    disclosures: string[];
    honesty: { submissionStatus: string };
    nextAction: string;
  };
  assert.equal(body.currentPackage?.version, 1);
  assert.equal(
    body.confirmations[0]?.confirmationType,
    "customer_declarations"
  );
  assert.equal(body.honesty.submissionStatus, "not_submission_ready");
  assert.ok(body.disclosures.length >= 4);
  assert.equal(body.nextAction, "review_package");
});

test("API: a foreign Project id resolves to a safe not-found response", async () => {
  const harness = buildHarness();
  harness.setTarget(schoolState({ targetId: SCHOOL_3 }));
  const response = await harness.handlers.act(request(buildPayload), PROJ_B);
  assert.equal(response.status, 404);
  assert.match(JSON.stringify(await response.json()), /not found/iu);
});

// --------------------------------------------------- migration / schema contract

test("migration 0051 is additive, ordered and protects history", () => {
  const sql = readFileSync(
    resolve("lib/db/migrations/0051_phase13_m8_submission_packages.sql"),
    "utf8"
  );
  for (const table of [
    "SubmissionPackage",
    "SubmissionPackageConfirmation",
    "SubmissionPackageInvalidation",
    "SubmissionPackageConfirmationFinalization",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`, "u"));
  }
  for (const index of [
    "SubmissionPackage_project_target_version_unique",
    "SubmissionPackage_project_operation_unique",
    "SubmissionPackageConfirmation_package_type_unique",
    "SubmissionPackageConfirmation_project_operation_unique",
    "SubmissionPackageInvalidation_confirmation_dependency_unique",
  ]) {
    assert.match(sql, new RegExp(index, "u"));
  }
  // No historical table is altered and nothing is dropped.
  assert.doesNotMatch(sql, /ALTER TABLE "(?!SubmissionPackage)/u);
  assert.doesNotMatch(sql, /DROP TABLE/iu);
  assert.doesNotMatch(sql, /DELETE FROM/iu);
  // History guards: every family refuses UPDATE and DELETE.
  assert.match(sql, /phase13_m8_submission_package_guard/u);
  assert.match(sql, /phase13_m8_confirmation_guard/u);
  assert.match(sql, /phase13_m8_invalidation_guard/u);
  assert.match(sql, /phase13_m8_confirmation_finalization_guard/u);
  assert.equal((sql.match(/BEFORE UPDATE OR DELETE/gu) ?? []).length, 4);
  // Honest, non-approval vocabulary: no approval, sign-off or submission column
  // exists, so a package can never be read as an authorization.
  assert.doesNotMatch(
    sql,
    /\bapproved\b|signed_off|submission_ready|submitted_at/iu
  );
});

test("the migration journal orders 0049 -> 0050 -> 0051 without gaps", () => {
  const journal = JSON.parse(
    readFileSync(resolve("lib/db/migrations/meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };
  const tags = journal.entries.map((entry) => entry.tag);
  // M8.1 keeps its own ordering contract; a later additive migration (0052 onward)
  // may follow it, but it can never be inserted before it or renumbered.
  const m81 = journal.entries.slice(49, 52);
  assert.deepEqual(
    m81.map((entry) => entry.tag),
    [
      "0049_phase13_m6_2_student500_preparation",
      "0050_phase13_m7_student500_deep_preparation",
      "0051_phase13_m8_submission_packages",
    ]
  );
  assert.deepEqual(
    m81.map((entry) => entry.idx),
    [49, 50, 51]
  );
  assert.ok(
    tags.length >= 52,
    "0051 is present and any later migration follows it"
  );
  for (const [position, entry] of journal.entries.entries()) {
    assert.equal(entry.idx, position, `journal idx ${position} is contiguous`);
  }
});

// ---------------------------------------------------------------- M8.1-R1 A

test("R1-A: the reviewed content is the exact pinned version, not the latest", async () => {
  const harness = buildHarness();
  harness.setTarget(studentState({}));
  const target = scope(OWNER, "student_500_visa_application", STUDENT);

  const v1 = await harness.service.buildPackage({
    operationId: "r1a-build-1",
    scope: target,
  });
  const view1 = await harness.service.get(target);
  assert.ok(view1.review);
  assert.equal(view1.review.source, "pinned_gs_draft_version");
  assert.equal(view1.review.gsDraft?.draftId, DRAFT_1);
  assert.equal(view1.review.gsDraft?.version, 1);
  assert.equal(
    view1.review.gsDraft?.sections[0]?.text,
    "Exact draft text for version 1"
  );
  assert.equal(view1.reviewUnavailableReason, null);

  // A newer draft version and a new package version: the review must follow the new
  // pinned draft, never the stale one.
  harness.setTarget(
    studentState({
      draft: { hash: "d".repeat(64), id: DRAFT_2, version: 2 },
      revision: 4,
    })
  );
  const v2 = await harness.service.buildPackage({
    operationId: "r1a-build-2",
    scope: target,
  });
  const view2 = await harness.service.get(target);
  assert.equal(
    view2.currentPackage?.packageVersionId,
    v2.package.packageVersionId
  );
  assert.equal(view2.review?.gsDraft?.draftId, DRAFT_2);
  assert.equal(view2.review?.gsDraft?.version, 2);
  assert.equal(
    view2.review?.gsDraft?.sections[0]?.text,
    "Exact draft text for version 2"
  );
  assert.notEqual(v1.package.manifestSha256, v2.package.manifestSha256);
});

test("R1-A: consent for v1 can never confirm v2", async () => {
  const harness = buildHarness();
  harness.setTarget(studentState({}));
  const target = scope(OWNER, "student_500_visa_application", STUDENT);
  const v1 = await harness.service.buildPackage({
    operationId: "r1a-v1",
    scope: target,
  });
  const v1Binding = bindingFor(target, v1.package);

  harness.setTarget(
    studentState({
      draft: { hash: "d".repeat(64), id: DRAFT_2, version: 2 },
      revision: 4,
    })
  );
  const v2 = await harness.service.buildPackage({
    operationId: "r1a-v2",
    scope: target,
  });

  // Replaying the v1 consent against v2 is refused, even though the customer is
  // authorized, the target is current and the statement policy is identical.
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "package_content_review",
        consentBinding: v1Binding,
        consentGranted: true,
        manifestSha256: v1.package.manifestSha256,
        operationId: "r1a-v1-consent-on-v2",
        packageVersionId: v2.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: v2.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      error.code === "consent_required"
  );
  // A v1 consent aimed at the v1 package is refused too: v1 is no longer current.
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "package_content_review",
        consentBinding: v1Binding,
        consentGranted: true,
        manifestSha256: v1.package.manifestSha256,
        operationId: "r1a-v1-consent-on-stale",
        packageVersionId: v1.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: v1.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError && error.code === "state_conflict"
  );
  const stored = await harness.service.get(target);
  assert.equal(stored.confirmations.length, 0, "no confirmation was recorded");
});

test("R1-A: an unreconstructable review blocks build and confirmation", async () => {
  const harness = buildHarness();
  harness.setTarget(studentState({ reviewAvailable: false }));
  const target = scope(OWNER, "student_500_visa_application", STUDENT);

  await assert.rejects(
    () =>
      harness.service.buildPackage({
        operationId: "r1a-noreview-build",
        scope: target,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      error.code === "source_unavailable"
  );
  const view = await harness.service.get(target);
  assert.equal(view.review, null);
  assert.equal(view.reviewUnavailableReason, "gs_draft_unavailable");
  assert.equal(view.nextAction, "unavailable");
  assert.ok(
    view.statements.every((statement) => statement.confirmable === false)
  );
});

// ---------------------------------------------------------------- M8.1-R1 B

test("R1-B: a revocation between validation and the write cannot create a confirmation", async () => {
  let revoke = false;
  const harness = buildHarness({
    hooks: {
      onBeforeConfirmationInsert: () => {
        if (revoke) {
          harness.world.projects.get(PROJ_A)?.members.set(MEMBER, "revoked");
        }
      },
    },
  });
  harness.setTarget(schoolState({ targetId: SCHOOL_1 }));
  const target = {
    actorUserId: MEMBER,
    projectId: PROJ_A,
    targetId: SCHOOL_1,
    targetKind: "managed_school_application" as const,
  };
  const built = await harness.service.buildPackage({
    operationId: "r1b-build",
    scope: target,
  });

  revoke = true;
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "package_content_review",
        consentBinding: bindingFor(target, built.package),
        consentGranted: true,
        manifestSha256: built.package.manifestSha256,
        operationId: "r1b-confirm",
        packageVersionId: built.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: built.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      (error.code === "project_forbidden" ||
        error.code === "actor_not_eligible")
  );
  revoke = false;
  harness.world.projects.get(PROJ_A)?.members.set(MEMBER, "active");
  const stored = await harness.service.get({ ...target, actorUserId: OWNER });
  assert.equal(
    stored.confirmations.length,
    0,
    "the durable write refused: nothing was persisted"
  );
});

test("R1-B: a Project closure between validation and the write is refused", async () => {
  let close = false;
  const harness = buildHarness({
    hooks: {
      onBeforePackageInsert: () => {
        if (close) {
          const project = harness.world.projects.get(PROJ_A);
          if (project) {
            project.status = "active";
          }
        }
      },
      onBeforeConfirmationInsert: () => {
        if (close) {
          const project = harness.world.projects.get(PROJ_A);
          if (project) {
            project.status = "closed";
          }
        }
      },
    },
  });
  harness.setTarget(schoolState({ targetId: SCHOOL_2 }));
  const target = scope(OWNER, "managed_school_application", SCHOOL_2);
  const built = await harness.service.buildPackage({
    operationId: "r1b-close-build",
    scope: target,
  });

  close = true;
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "customer_declarations",
        consentBinding: bindingFor(target, built.package),
        consentGranted: true,
        manifestSha256: built.package.manifestSha256,
        operationId: "r1b-close-confirm",
        packageVersionId: built.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: built.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError && error.code === "project_closed"
  );
  close = false;
  const project = harness.world.projects.get(PROJ_A);
  if (project) {
    project.status = "active";
  }
  const stored = await harness.service.get(target);
  assert.equal(stored.confirmations.length, 0);
});

test("R1-B: a dependency change inside the write window never reports success", async () => {
  let mutate = false;
  const harness = buildHarness({
    hooks: {
      onBeforeConfirmationInsert: () => {
        if (mutate) {
          // The GS draft advances exactly between validation and persistence.
          harness.setTarget(
            studentState({
              draft: { hash: "e".repeat(64), id: DRAFT_2, version: 2 },
              revision: 5,
            })
          );
        }
      },
    },
  });
  harness.setTarget(studentState({}));
  const target = scope(OWNER, "student_500_visa_application", STUDENT);
  const built = await harness.service.buildPackage({
    operationId: "r1b-mut-build",
    scope: target,
  });

  mutate = true;
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "package_content_review",
        consentBinding: bindingFor(target, built.package),
        consentGranted: true,
        manifestSha256: built.package.manifestSha256,
        operationId: "r1b-mut-confirm",
        packageVersionId: built.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: built.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError && error.code === "state_conflict"
  );
  mutate = false;
  // The row survives as immutable history, is provably non-current, and carries
  // durable invalidation evidence.
  const stored = await harness.service.get(target);
  assert.equal(stored.confirmations.length, 1);
  assert.equal(stored.confirmations[0]?.current, false);
  const evidence = await harness.store.listInvalidations({
    projectId: PROJ_A,
    targetId: STUDENT,
    targetKind: "student_500_visa_application",
  });
  assert.equal(evidence.length, 1);
  assert.ok(evidence[0]?.reasonCodes.includes("gs_draft_changed"));
  // And it can never be confirmed again.
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "customer_declarations",
        consentBinding: bindingFor(target, built.package),
        consentGranted: true,
        manifestSha256: built.package.manifestSha256,
        operationId: "r1b-mut-confirm-2",
        packageVersionId: built.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: built.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError && error.code === "state_conflict"
  );
});

// ---------------------------------------------------------------- M8.1-R1 C

test("R1-C: a package whose bytes fail their digest is never current or confirmable", async () => {
  const harness = buildHarness();
  harness.setTarget(schoolState({ targetId: SCHOOL_1 }));
  const target = scope(OWNER, "managed_school_application", SCHOOL_1);
  const built = await harness.service.buildPackage({
    operationId: "r1c-tamper-build",
    scope: target,
  });

  // Tamper with the stored manifest bytes while leaving the recorded digest alone.
  const [record] = await harness.store.listPackages({
    projectId: PROJ_A,
    targetId: SCHOOL_1,
    targetKind: "managed_school_application",
  });
  assert.ok(record);
  (record as { manifest: unknown }).manifest = {
    ...(record.manifest as Record<string, unknown>),
    tampered: true,
  };

  const view = await harness.service.get(target);
  const version = view.packages[0];
  assert.equal(version?.integrityVerified, false);
  assert.equal(version?.manifest, null, "tampered content is never served");
  assert.equal(version?.freshness.current, false);
  assert.ok(version?.freshness.reasonCodes.includes("source_unavailable"));
  assert.equal(view.currentPackage, null);
  assert.equal(view.nextAction, "rebuild_package");

  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "package_content_review",
        consentBinding: bindingFor(target, built.package),
        consentGranted: true,
        manifestSha256: built.package.manifestSha256,
        operationId: "r1c-tamper-confirm",
        packageVersionId: built.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: built.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      error.code === "integrity_conflict"
  );
});

test("R1-C: an old version cannot be confirmed after a rebuild", async () => {
  const harness = buildHarness();
  harness.setTarget(schoolState({ targetId: SCHOOL_1 }));
  const target = scope(OWNER, "managed_school_application", SCHOOL_1);
  const v1 = await harness.service.buildPackage({
    operationId: "r1c-sup-build-1",
    scope: target,
  });

  // Material change, then a new immutable version.
  harness.setTarget(
    schoolState({ packageVersion: 2, revision: 4, targetId: SCHOOL_1 })
  );
  const v2 = await harness.service.buildPackage({
    operationId: "r1c-sup-build-2",
    scope: target,
  });
  assert.equal(v2.package.version, 2);

  // The upstream state returns to exactly what v1 froze: matching fingerprints, but
  // v1 is still not the newest version and must not become confirmable again.
  harness.setTarget(schoolState({ targetId: SCHOOL_1 }));
  const view = await harness.service.get(target);
  assert.equal(view.packages.length, 2);
  assert.equal(
    view.packages[1]?.freshness.current,
    true,
    "v1 dependencies match"
  );
  assert.equal(view.currentPackage, null, "but only the newest may be current");
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "package_content_review",
        consentBinding: bindingFor(target, v1.package),
        consentGranted: true,
        manifestSha256: v1.package.manifestSha256,
        operationId: "r1c-sup-confirm-old",
        packageVersionId: v1.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: v1.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError && error.code === "state_conflict"
  );
});

test("R1-C: persisted invalidation evidence prevents silent resurrection", async () => {
  const harness = buildHarness();
  harness.setTarget(studentState({}));
  const target = scope(OWNER, "student_500_visa_application", STUDENT);
  const v1 = await harness.service.buildPackage({
    operationId: "r1c-res-build-1",
    scope: target,
  });
  const confirmed = await harness.service.confirmPackage({
    confirmationType: "customer_declarations",
    consentBinding: bindingFor(target, v1.package),
    consentGranted: true,
    manifestSha256: v1.package.manifestSha256,
    operationId: "r1c-res-confirm",
    packageVersionId: v1.package.packageVersionId,
    scope: target,
    statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
    targetVersion: v1.package.targetVersion,
  });
  assert.equal(confirmed.confirmation.current, true);

  // GS changes, then a new version is built: the v1 confirmation is invalidated and
  // that evidence is persisted.
  harness.setTarget(
    studentState({
      draft: { hash: "e".repeat(64), id: DRAFT_2, version: 2 },
      revision: 5,
    })
  );
  await harness.service.buildPackage({
    operationId: "r1c-res-build-2",
    scope: target,
  });
  const evidence = await harness.store.listInvalidations({
    projectId: PROJ_A,
    targetId: STUDENT,
    targetKind: "student_500_visa_application",
  });
  assert.equal(evidence.length, 1);

  // The upstream state returns to v1's exact fingerprint. The old confirmation must
  // stay invalid because the evidence is append-only.
  harness.setTarget(studentState({}));
  const view = await harness.service.get(target);
  const v1View = view.packages.find(
    (entry) => entry.packageVersionId === v1.package.packageVersionId
  );
  assert.ok(v1View);
  assert.equal(v1View.freshness.current, false, "evidence keeps it invalid");
  assert.equal(v1View.confirmations[0]?.current, false);
  assert.ok(
    v1View.confirmations[0]?.invalidatedReasonCodes.includes("gs_draft_changed")
  );
  assert.equal(view.currentPackage, null);
});

// ---------------------------------------------------------------- M8.1-R2

test("R2: a failed post-insert target read is never current and not suppressed", async () => {
  // The upstream reader dies exactly after the confirmation row is durable.
  const harness = buildHarness({
    hooks: {
      onBeforeConfirmationInsert: () => {
        harness.targets.clear();
      },
    },
  });
  harness.setTarget(schoolState({ targetId: SCHOOL_1 }));
  const target = scope(OWNER, "managed_school_application", SCHOOL_1);
  const built = await harness.service.buildPackage({
    operationId: "r2-read-build",
    scope: target,
  });

  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "package_content_review",
        consentBinding: bindingFor(target, built.package),
        consentGranted: true,
        manifestSha256: built.package.manifestSha256,
        operationId: "r2-read-confirm",
        packageVersionId: built.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: built.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof SubmissionPackageError &&
      error.code === "source_unavailable"
  );

  // Dependencies revert to exactly the frozen state. The confirmation must still
  // never become current, because its finalization never completed.
  harness.setTarget(schoolState({ targetId: SCHOOL_1 }));
  const evidence = await harness.store.listInvalidations({
    projectId: PROJ_A,
    targetId: SCHOOL_1,
    targetKind: "managed_school_application",
  });
  assert.equal(evidence.length, 1);
  assert.ok(evidence[0]?.reasonCodes.includes("source_unavailable"));
  const finalizations = await harness.store.listFinalizations({
    projectId: PROJ_A,
    targetId: SCHOOL_1,
    targetKind: "managed_school_application",
  });
  assert.equal(finalizations.length, 0, "no finalization was recorded");

  const view = await harness.service.get(target);
  assert.equal(view.confirmations.length, 1);
  assert.equal(view.confirmations[0]?.finalized, false);
  assert.equal(view.confirmations[0]?.current, false);
  assert.ok(
    view.confirmations[0]?.invalidatedReasonCodes.includes(
      "confirmation_not_finalized"
    )
  );
  // And the version cannot be confirmed again on top of the unfinalized row.
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "package_content_review",
        consentBinding: bindingFor(target, built.package),
        consentGranted: true,
        manifestSha256: built.package.manifestSha256,
        operationId: "r2-read-confirm-again",
        packageVersionId: built.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: built.package.targetVersion,
      }),
    (error: unknown) => error instanceof SubmissionPackageError
  );
});

test("R2: a failed invalidation write surfaces and still leaves nothing current", async () => {
  let failInvalidation = false;
  const harness = buildHarness({
    hooks: {
      onBeforeConfirmationInsert: () => {
        // Force the post-write recheck to disagree with the frozen identity.
        harness.setTarget(
          studentState({
            draft: { hash: "e".repeat(64), id: DRAFT_2, version: 2 },
            revision: 5,
          })
        );
        failInvalidation = true;
      },
      onBeforeInvalidation: () => {
        if (failInvalidation) {
          throw new Error("invalidation store unavailable");
        }
      },
    },
  });
  harness.setTarget(studentState({}));
  const target = scope(OWNER, "student_500_visa_application", STUDENT);
  const built = await harness.service.buildPackage({
    operationId: "r2-inval-build",
    scope: target,
  });

  // The durability failure is reported, never swallowed into a success.
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "package_content_review",
        consentBinding: bindingFor(target, built.package),
        consentGranted: true,
        manifestSha256: built.package.manifestSha256,
        operationId: "r2-inval-confirm",
        packageVersionId: built.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: built.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "invalidation store unavailable"
  );

  const view = await harness.service.get(target);
  assert.equal(view.confirmations.length, 1);
  assert.equal(view.confirmations[0]?.finalized, false);
  assert.equal(
    view.confirmations[0]?.current,
    false,
    "an unfinalized confirmation can never be current"
  );
});

test("R2: dependency reversion after a failed finalization stays non-current", async () => {
  let failFinalization = false;
  const harness = buildHarness({
    hooks: {
      onBeforeFinalization: () => {
        if (failFinalization) {
          throw new Error("finalization store unavailable");
        }
      },
    },
  });
  harness.setTarget(studentState({}));
  const target = scope(OWNER, "student_500_visa_application", STUDENT);
  const built = await harness.service.buildPackage({
    operationId: "r2-final-build",
    scope: target,
  });

  failFinalization = true;
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "customer_declarations",
        consentBinding: bindingFor(target, built.package),
        consentGranted: true,
        manifestSha256: built.package.manifestSha256,
        operationId: "r2-final-confirm",
        packageVersionId: built.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: built.package.targetVersion,
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "finalization store unavailable"
  );

  // Dependencies never changed, so freshness is still true - yet the confirmation is
  // not current because its finalization never completed, and it stays that way.
  failFinalization = false;
  const view = await harness.service.get(target);
  assert.equal(view.confirmations.length, 1);
  assert.equal(view.packages[0]?.freshness.current, true);
  assert.equal(view.confirmations[0]?.finalized, false);
  assert.equal(view.confirmations[0]?.current, false);
  assert.ok(
    view.confirmations[0]?.invalidatedReasonCodes.includes(
      "confirmation_not_finalized"
    )
  );
  // Reverting everything cannot resurrect it, and a retry cannot finalize it either.
  harness.setTarget(studentState({}));
  const after = await harness.service.get(target);
  assert.equal(after.confirmations[0]?.current, false);
  await assert.rejects(
    () =>
      harness.service.confirmPackage({
        confirmationType: "customer_declarations",
        consentBinding: bindingFor(target, built.package),
        consentGranted: true,
        manifestSha256: built.package.manifestSha256,
        operationId: "r2-final-confirm-retry",
        packageVersionId: built.package.packageVersionId,
        scope: target,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: built.package.targetVersion,
      }),
    (error: unknown) => error instanceof SubmissionPackageError
  );
});
